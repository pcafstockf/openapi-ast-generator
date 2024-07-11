// noinspection DuplicatedCode

import SwaggerParser from '@apidevtools/swagger-parser';
import {set as lodashSet, setWith as lodashSetWith} from 'lodash';
import os from 'node:os';
import {stringify as json5Stringify} from 'json5';
import {OpenAPIV3} from 'openapi-types';
import {kebabCase, pascalCase} from '../codegen/name-utils';
import {TargetOpenAPI} from '../openapi-supported-versions';

let parserRefs: SwaggerParser.$Refs;
export const HttpMethodNames = Object.values(OpenAPIV3.HttpMethods) as string[];
export type OpenApiStyle = 'matrix' | 'label' | 'form' | 'simple' | 'spaceDelimited' | 'pipeDelimited' | 'deepObject';

/**
 * Given an object, if it appears to be a JSON Ref, as the previously initialized SwaggerParser.$refs (aka 'parserRefs') to resolve the reference.
 * This function returns the resolved object *and* if it was given a ref, the path where the object was found.
 * Given the following:
 *      let obj;
 *  If obj is *not* a JSON Ref, then "obj === resolveIfRef(obj).obj" will be true.  It is a harmless call with no side effects.
 *  If obj is a JSON Ref, then "obj.$ref === resolveIfRef(obj).ref" will be true, and resolveIfRef(obj).obj will be the referenced instance.
 */
export function resolveIfRef<T = any>(obj: any): { obj: T, ref?: string } {
	let ref = obj && (typeof (obj as TargetOpenAPI.ReferenceObject).$ref === 'string') ? (obj as TargetOpenAPI.ReferenceObject).$ref : undefined;
	if (ref) {
		if (!parserRefs)
			throw new Error('Resolver not initialized.');
		try {
			return {
				obj: parserRefs.get(ref),
				ref: ref
			};
		}
		catch {
			return undefined;
		}
	}
	return {
		obj: obj,
		ref: undefined
	};
}

/**
 * It is critical that this function be called as soon as the @see SwaggerParser has finished parsing and before any of the other OaEG code runs.
 * It initializes a private global variable that allows the @see resolveIfRef function to work (which is the heart of much of what we do).
 */
export function initResolver(r: SwaggerParser | SwaggerParser.$Refs): void {
	if ((r as SwaggerParser).$refs)
		parserRefs = (r as SwaggerParser).$refs;
	else
		parserRefs = r as typeof parserRefs;
}

/**
 * This function will examine any references found in doc.paths and if it is a reference, it will uplift the target object into doc.paths and replace wherever that target was with a reference to doc.paths.
 * This is needed because the only way I know of in OpenAPI 3.0 to pull in a shared/common operation under your own specific path, is to do something like this:
 *  yaml1.yaml
 *      paths:
 *          /v10/server-users:
 *              $ref: "#/pathdefs/getUsersV10"
 *      pathdefs:
 *          getUsersV10:
 *              get:
 *                  ...
 *  yaml2.yaml
 *      paths:
 *          /v10/special/server-users:
 *              $ref: "./uyaml1.yaml#/pathdefs/getUsersV10"
 *  Our 'jsrp-patch' code, this pull 'pathdefs' to the top level, and we can then swap doc.pathdefs.getUsersV10 with doc.paths./v10/mspecial/server-users
 */
export function uplevelPaths(doc: TargetOpenAPI.Document) {
	const pathPatterns = Object.keys(doc.paths);
	pathPatterns.forEach((pp) => {
		let pi: TargetOpenAPI.PathItemObject | TargetOpenAPI.ReferenceObject = doc.paths[pp];
		let ref = pi && (typeof (pi as TargetOpenAPI.ReferenceObject).$ref === 'string') ? (pi as TargetOpenAPI.ReferenceObject).$ref : undefined;
		if (ref) {
			doc.paths[pp] = resolveIfRef({$ref: ref}).obj;
			let hash = ref.substring(ref.indexOf('#'));     // -> #/parameters/Page
			const objTypePath = hash.substring(2, hash.lastIndexOf('/')).replace('/', '.');    // -> parameters
			const $refName = hash.substring(hash.lastIndexOf('/') + 1); // -> Page
			const refNamePath = objTypePath + '.' + $refName;
			lodashSet(doc, refNamePath, {$ref: '#/paths' + pp});
		}
	});
	delete (doc as any).pathdefs;
}

/**
 * Walk document (deeply), to find inline object schema.
 * IF a schema has a title or 'x-schema-name', hoist it to global context, and modify the parent to reference it.
 * IF a schema is just a $ref, abort any deeper recursion.
 * IF a (resolved) schema does *not* have a title or 'x-schema-name', capture that and record it as missing.
 */
export function hoistNamedObjectSchemas(doc: TargetOpenAPI.Document, reportMissing: boolean) {
	function resolveIfNOTRef<T = any>(obj: any): { obj: T, ref?: string } {
		let ref = obj && (typeof (obj as TargetOpenAPI.ReferenceObject).$ref === 'string') ? (obj as TargetOpenAPI.ReferenceObject).$ref : undefined;
		if (ref)
			return undefined;
		return {
			obj: obj,
			ref: undefined
		};
	}

	const missingLocations: Record<string, string> = {};
	let docPath: string[] = [];
	function nameIfMapped(schema: TargetOpenAPI.SchemaObject, genName: string) {
		if (schema['x-ignore'] || schema['x-ignore-client'] || schema['x-ignore-server'])
			return;
		if (schema.title || schema['x-schema-name'])
			return;
		const location = docPath.join('.').substring(2);
		missingLocations[location] = pascalCase(kebabCase(genName));
	}
	function isHoistableSchema(schema: TargetOpenAPI.SchemaObject) {
		return typeof schema['x-schema-name'] === 'string' && schema['x-schema-name'];
	}

	function hoistSchema(schema: TargetOpenAPI.SchemaObject): TargetOpenAPI.ReferenceObject {
		if (!isHoistableSchema(schema))
			throw new Error('Schema is not hoistable');
		let name = schema['x-schema-name'];
		doc.components.schemas[name] = schema;
		return {
			$ref: '#/components/schemas/' + name
		};
	}

	function searchSchema(schema: TargetOpenAPI.SchemaObject): TargetOpenAPI.ReferenceObject | undefined {
		if (schema.type === 'array') {
			const res = resolveIfNOTRef(schema.items);
			if (res?.obj) {
				docPath.push('items');
				let r = searchSchema(res!.obj);
				docPath.pop();
				if (r)
					lodashSet(schema, 'items', r);
			}
		}
		else if (schema.type === 'object') {
			let s: TargetOpenAPI.SchemaObject;
			let r: TargetOpenAPI.ReferenceObject;
			// First we recursively search.
			const propzNames = [];
			let hasAdd = false;
			if (typeof schema.additionalProperties === 'object') {
				hasAdd = true;
				const res = resolveIfNOTRef(schema.additionalProperties);
				if (res?.obj) {
					r = searchSchema(res!.obj);
					if (r)
						lodashSet(schema, 'additionalProperties', r);
				}
			}
			if (schema.properties) {
				docPath.push('properties');
				Object.keys(schema.properties).forEach(name => {
					docPath.push(name);
					let propzName = name;
					if (Array.isArray(schema.required))
						if (schema.required.indexOf(name) >= 0)
							propzName += '!';
					propzNames.push(name);
					const res =  resolveIfNOTRef(schema.properties[name]);
					if (res?.obj) {
						r = searchSchema(res!.obj);
						if (r)
							lodashSet(schema.properties, name, r);
					}
					docPath.pop();
				});
				docPath.pop();
			}
			if (propzNames.length > 0) {
				propzNames.sort();
				nameIfMapped(schema, `O${propzNames.join('%')}${hasAdd ? '+' : ''}`);
			}

			function searchSchemaArray(schemas: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.SchemaObject)[]) {
				if (Array.isArray(schemas)) {
					schemas.forEach((elem, idx) => {
						const res = resolveIfNOTRef(elem);
						if (res?.obj) {
							r = searchSchema(res!.obj);
							if (r)
								schemas[idx] = r;
						}
					});
				}
			}

			searchSchemaArray(schema.allOf);
			searchSchemaArray(schema.oneOf);
			searchSchemaArray(schema.anyOf);
			if (schema.not) {
				const res = resolveIfNOTRef(schema.not);
				if (res?.obj) {
					r = searchSchema(res!.obj);
					if (r)
						lodashSet(schema, 'not', r);
				}
			}
		}
		else if (schema.type === 'string' && Array.isArray(schema.enum)) {
			const elems = schema.enum.slice(0).sort();
			if (elems.length > 0)
				nameIfMapped(schema, `E${elems.join('%')}`);
		}
		// Now decide hoistability for ourselves.
		if (isHoistableSchema(schema))
			return hoistSchema(schema);
	}

	function searchParams(params: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.ParameterBaseObject)[]) {
		params?.forEach((p: TargetOpenAPI.ParameterBaseObject, idx) => {
			const prevDocPathLen = docPath.length;
			docPath.push(`[${idx}]`);
			let resIdx = resolveIfNOTRef(p);
			if (resIdx?.obj) {
				const param = resIdx.obj;
				let resParam = resolveIfNOTRef(param.schema);
				if (resParam?.obj) {
					docPath.push(`schema`);
					let s: TargetOpenAPI.SchemaObject = resParam.obj;
					let targ: any = param;
					let targPropName = 'schema';
					while (s && s.type === 'array') {
						targ = s;
						targPropName = 'items';
						docPath.push(`items`); // This should be in an index?
						resParam = resolveIfNOTRef(s.items);
						s = resParam?.obj;
					}
					if (s) {
						if (s.type === 'object') {
							const ref = searchSchema(s);
							if (ref)
								lodashSet(targ, targPropName, ref);
						}
						else if (s.type === 'string' && Array.isArray(s.enum)) {
							const ref = searchSchema(s);
							if (ref)
								lodashSet(targ, targPropName, ref);
						}
					}
				}
			}
			docPath.length = prevDocPathLen;
		});
	}
	function searchMediaTypes(media: {[media: string]: TargetOpenAPI.MediaTypeObject}) {
		Object.keys(media ?? {}).forEach((key) => {
			const m = media[key];
			if (! m.schema)
				return; // If no schema, nothing to do.
			const prevDocPathLen = docPath.length;
			docPath.push(key);
			let targ: any = m;
			let targPropName = 'schema';
			let res = resolveIfNOTRef(m.schema);
			if (res?.obj) {
				let s = res.obj;
				docPath.push('schema');
				while (s && s.type === 'array') {
					targ = s;
					targPropName = 'items';
					docPath.push('items');
					res = resolveIfNOTRef(s.items);
					s = res?.obj;
				}
				if (s) {
					if (s.type === 'object') {
						const ref = searchSchema(s);
						if (ref)
							lodashSet(targ, targPropName, ref);
					}
					else if (s.type === 'string' && Array.isArray(s.enum)) {
						const ref = searchSchema(s);
						if (ref)
							lodashSet(targ, targPropName, ref);
					}
				}
			}
			docPath.length = prevDocPathLen;
		});
	}

	function searchRequestBodies(requestBodies: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.RequestBodyObject)[]) {
		requestBodies?.forEach(r => {
			const media = resolveIfNOTRef<TargetOpenAPI.RequestBodyObject>(r)?.obj?.content;
			if (media) {
				docPath.push('content');
				searchMediaTypes(media);
				docPath.pop();
			}
		});
	}

	function searchResponses(responses: TargetOpenAPI.ResponsesObject) {
		Object.keys(responses ?? {}).forEach(code => {
			docPath.push(code);
			const res = resolveIfNOTRef(responses[code]);
			if (res?.obj) {
				const rsp = res.obj;
				if (rsp.headers) {
					docPath.push('headers');
					searchParams(Object.values(rsp.headers));
					docPath.pop();
				}
				if (rsp.content) {
					docPath.push('content');
					searchMediaTypes(rsp.content);
					docPath.pop();
				}
			}
			docPath.pop();
		});
	}

	function searchPathItems(pathItems: Record<string, TargetOpenAPI.ReferenceObject | TargetOpenAPI.PathItemObject>) {
		Object.keys(pathItems ?? {}).forEach((key) => {
			docPath.push(key);
			const res = resolveIfNOTRef(pathItems[key]);
			if (res?.obj) {
				const pi : TargetOpenAPI.PathItemObject = res!.obj;
				docPath.push('parameters');
				searchParams(pi.parameters);
				docPath.pop();
				const methods = HttpMethodNames.filter(method => pi[method]);
				methods.forEach(method => {
					docPath.push(method);
					const res = resolveIfNOTRef(pi[method]);
					if (res?.obj) {
						let opObj: TargetOpenAPI.OperationObject = res.obj;
						docPath.push('parameters');
						searchParams(opObj.parameters);
						docPath.pop();
						if (opObj.requestBody) {
							docPath.push('requestBody');
							searchRequestBodies([opObj.requestBody]);
							docPath.pop();
						}
						docPath.push('responses');
						searchResponses(opObj.responses);
						docPath.pop();
					}
					docPath.pop();
				});
			}
			docPath.pop();
		});
	}

	// if (doc.components.schemas) {
	// 	docPath = ['#','components','schemas'];
	// 	Object.keys(doc.components.schemas).forEach(name => {
	// 		const res = resolveIfNOTRef(doc.components.schemas[name]);
	// 		if (res?.obj) {
	// 			const s = res.obj;
	// 			docPath.push(name);
	// 			const r = searchSchema(s);
	// 			docPath.pop();
	// 			if (r)
	// 				lodashSet(doc.components.schemas, name, r);
	// 		}
	// 	});
	// }
	// if (doc.components.responses) {
	// 	docPath = ['#','components','responses'];
	// 	searchResponses(doc.components.responses);
	// }
	// if (doc.components.parameters) {
	// 	docPath = ['#', 'components', 'parameters'];
	// 	searchParams(Object.values(doc.components.parameters));
	// }
	// if (doc.components.requestBodies) {
	// 	docPath = ['#', 'components', 'requestBodies'];
	// 	const media = Object.values(doc.components.requestBodies).map(b => resolveIfNOTRef(b).obj).filter((b: TargetOpenAPI.RequestBodyObject) => b?.content).map((b: TargetOpenAPI.RequestBodyObject) => b.content);
	// 	media.forEach(m => {
	// 		searchMediaTypes(m);
	// 	})
	// }
	// if (doc.components.headers) {
	// 	docPath = ['#', 'components', 'headers'];
	// 	searchParams(Object.values(doc.components.headers));
	// }
	// if (doc.components.callbacks) {
	// 	docPath = ['#', 'components', 'callbacks'];
	// 	searchPathItems(doc.components.callbacks);
	// }
	docPath = ['#', 'paths'];
	searchPathItems(doc.paths);

	if (reportMissing) {
		const locations = Object.keys(missingLocations);
		if (locations.length > 0) {
			const docFrag = locations.reduce((frag, key) => {
				// Lodash 'set' ends up turning numeric *looking* properties into indexes.
				lodashSetWith(frag, key + '.x-schema-name', missingLocations[key], Object);
				return frag;
			}, {});
			process.stderr.write(`${json5Stringify(docFrag, undefined, ' ')}${os.EOL}`);
		}
	}
}
