// noinspection DuplicatedCode

import SwaggerParser from '@apidevtools/swagger-parser';
import lodash from 'lodash';
import {stringify as json5Stringify} from 'json5';
import os from 'node:os';
import {OpenAPIV3} from 'openapi-types';
import {pascalCase} from '../codegen/name-utils';
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
export function initResolver(parser: SwaggerParser): void {
	if (parserRefs)
		throw new Error('Resolver already initialized.');
	parserRefs = parser.$refs;
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
			lodash.set(doc, refNamePath, {$ref: '#/paths' + pp});
		}
	});
}

export function resolveTopLevelAliases(doc: TargetOpenAPI.Document) {
	const components = doc.components as TargetOpenAPI.ComponentsObject;
	Object.keys(components.schemas).forEach(componentKey => {
		const s = components.schemas[componentKey];
		components.schemas[componentKey] = resolveIfRef(s).obj;
		if (! (components.schemas[componentKey] as TargetOpenAPI.SchemaObject).title)
			(components.schemas[componentKey] as TargetOpenAPI.SchemaObject).title = componentKey;
	});
}

/**
 * Walk document (deeply), to find inline object schema, hoist each schema to global context, and modify the parent to reference it.
 */
export function hoistNamedObjectSchemas(doc: TargetOpenAPI.Document, xSchemaNameMap?: Record<string, string> | true) {
	const tmpMap: Record<string, boolean> = {};
	function nameIfMapped(schema: TargetOpenAPI.SchemaObject, genName: string) {
		if (typeof xSchemaNameMap === 'boolean') {
			if (! tmpMap[genName]) {
				const hint = (schema.title || schema.description || pascalCase(genName)).replace(/\r?\n/g, ' ');
				process.stderr.write(`'${genName}' : "${hint}: ${json5Stringify(schema).replace(/\r?\n/g, ' ')}",${os.EOL}`);
				tmpMap[genName] = true;
			}
		}
		else {
			if (!xSchemaNameMap[genName])
				genName = genName.toLowerCase()
			if (typeof xSchemaNameMap[genName] === 'string')
				schema['x-schema-name'] = xSchemaNameMap[genName];
		}
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
			const i = resolveIfRef(schema.items)?.obj;
			if (i) {
				let r = searchSchema(i);
				if (r)
					lodash.set(schema, 'items', r);
			}
		}
		else if (schema.type === 'object') {
			let s: TargetOpenAPI.SchemaObject;
			let r: TargetOpenAPI.ReferenceObject;
			// First we recursively search.
			let propNames = 'O';
			let hasAdd = false;
			if (typeof schema.additionalProperties === 'object') {
				hasAdd = true;
				s = resolveIfRef(schema.additionalProperties).obj;
				r = searchSchema(s);
				if (r)
					lodash.set(schema, 'additionalProperties', r);
			}
			if (schema.properties) {
				Object.keys(schema.properties).forEach(name => {
					propNames += name;
					if (Array.isArray(schema.required))
						if (schema.required.indexOf(name) >= 0)
							propNames += '!';
					s = resolveIfRef(schema.properties[name]).obj;
					r = searchSchema(s);
					if (r)
						lodash.set(schema.properties, name, r);
				});
			}
			if (hasAdd)
				propNames += '+'
			if (propNames && xSchemaNameMap && (!isHoistableSchema(schema)))
				nameIfMapped(schema, propNames);

			function searchSchemaArray(schemas: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.SchemaObject)[]) {
				if (Array.isArray(schemas)) {
					schemas.forEach((elem, idx) => {
						s = resolveIfRef(elem).obj;
						r = searchSchema(s);
						if (r)
							schemas[idx] = r;
					});
				}
			}

			searchSchemaArray(schema.allOf);
			searchSchemaArray(schema.oneOf);
			searchSchemaArray(schema.anyOf);
			if (schema.not) {
				s = resolveIfRef(schema.not).obj;
				r = searchSchema(s);
				if (r)
					lodash.set(schema, 'not', r);
			}
		}
		else if (schema.type === 'string' && Array.isArray(schema.enum)) {
			let elemNames = 'E' + schema.enum.join('');
			if (elemNames && xSchemaNameMap && (!isHoistableSchema(schema)))
				nameIfMapped(schema, elemNames);
		}
		// Now decide hoistability for ourselves.
		if (isHoistableSchema(schema))
			return hoistSchema(schema);
	}

	function searchParams(params: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.ParameterBaseObject)[]) {
		params?.forEach((p) => {
			const param = resolveIfRef(p).obj;
			let schema: TargetOpenAPI.SchemaObject = resolveIfRef(param.schema).obj;
			let targ: any = param;
			let targPropName = 'schema';
			while (schema.type === 'array') {
				targ = schema;
				targPropName = 'items';
				schema = resolveIfRef(schema.items).obj;
			}
			if (schema.type === 'object') {
				const ref = searchSchema(schema);
				if (ref)
					lodash.set(targ, targPropName, ref);
			}
			else if (schema.type === 'string' && Array.isArray(schema.enum)) {
				const ref = searchSchema(schema);
				if (ref)
					lodash.set(targ, targPropName, ref);
			}
		});
	}

	function searchMediaTypes(media: TargetOpenAPI.MediaTypeObject[]) {
		media?.forEach((m) => {
			let targ: any = m;
			let targPropName = 'schema';
			let schema = resolveIfRef(m.schema).obj;
			while (schema.type === 'array') {
				targ = schema;
				targPropName = 'items';
				schema = resolveIfRef(schema.items).obj;
			}
			if (schema.type === 'object') {
				const ref = searchSchema(schema);
				if (ref)
					lodash.set(targ, targPropName, ref);
			}
			else if (schema.type === 'string' && Array.isArray(schema.enum)) {
				const ref = searchSchema(schema);
				if (ref)
					lodash.set(targ, targPropName, ref);
			}
		});
	}

	function searchRequestBodies(requestBodies: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.RequestBodyObject)[]) {
		requestBodies?.forEach(r => {
			const media = resolveIfRef<TargetOpenAPI.RequestBodyObject>(r).obj.content;
			if (media)
				searchMediaTypes(Object.values(media));
		});
	}

	function searchResponses(responses: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.ResponseObject)[]) {
		responses?.forEach(r => {
			const rsp = resolveIfRef(r).obj;
			if (rsp.headers)
				searchParams(Object.values(rsp.headers));
			if (rsp.content)
				searchMediaTypes(Object.values(rsp.content));
		});
	}

	function searchPathItems(pathItems: (TargetOpenAPI.ReferenceObject | TargetOpenAPI.PathItemObject)[]) {
		pathItems?.forEach((i) => {
			let pi: TargetOpenAPI.PathItemObject = resolveIfRef(i).obj;
			searchParams(pi.parameters);
			const methods = HttpMethodNames.filter(method => pi[method]);
			methods.forEach(method => {
				let opObj: TargetOpenAPI.OperationObject = resolveIfRef(pi[method]).obj;
				searchParams(opObj.parameters);
				if (opObj.requestBody)
					searchRequestBodies([opObj.requestBody]);
				searchResponses(Object.values(opObj.responses));
			});
		});
	}

	if (doc.components.schemas) {
		Object.keys(doc.components.schemas).forEach(name => {
			const s = resolveIfRef(doc.components.schemas[name]).obj;
			const r = searchSchema(s);
			if (r)
				lodash.set(doc.components.schemas, name, r);
		});
	}
	if (doc.components.responses)
		searchResponses(Object.values(doc.components.responses));
	if (doc.components.parameters)
		searchParams(Object.values(doc.components.parameters));
	if (doc.components.requestBodies) {
		const media = Object.values(doc.components.requestBodies).map(b => resolveIfRef(b).obj).filter((b: TargetOpenAPI.RequestBodyObject) => b.content).map((b: TargetOpenAPI.RequestBodyObject) => b.content);
		searchMediaTypes(media);
	}
	if (doc.components.headers)
		searchParams(Object.values(doc.components.headers));
	if (doc.components.callbacks)
		searchPathItems(Object.values(doc.components.callbacks));
	searchPathItems(Object.values(doc.paths));
}
