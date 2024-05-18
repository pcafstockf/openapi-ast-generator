// noinspection DuplicatedCode

import {get as lodashGet} from 'lodash';
import {CodeGenConfig} from '../codegen/codegen-config';
import * as nameUtils from '../codegen/name-utils';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {HttpMethodNames, resolveIfRef} from '../openapi/openapi-utils';
import {ApiTag} from './api-tag';
import {LanguageNeutralBase} from './base';
import {MethodOperation} from './method-operation';
import {ParameterParameter} from './parameter-parameter';
import {ParameterRequestBody} from './parameter-requestbody';
import {ResponseCodeTypes, ReturnResponses} from './return-responses';
import {TypeSchema} from './type-schema';

declare global {
	var codeGenConfig: CodeGenConfig;
}

interface AbsMetaData {
	location: string[];
	required: boolean;
	defaultValue?: any;
}

interface ParameterMetaData extends AbsMetaData {
	param: TargetOpenAPI.ParameterObject;
}

interface RequestBodyMetaData extends AbsMetaData {
	requestBody: TargetOpenAPI.RequestBodyObject;
	name: string;
	preferredMediaTypes: string[];
}

export interface LanguageNeutralDocument {
	apis: ApiTag[];
	types: TypeSchema[];
}

// noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
export class LanguageNeutralGenerator extends LanguageNeutralBase {
	generate(doc: TargetOpenAPI.Document): LanguageNeutralDocument {
		this.oaDoc = doc;
		this.lnDoc = {
			apis: [],
			types: []
		};
		Object.keys(this.oaDoc.paths).forEach((pattern) => {
			if (this.oaDoc.paths[pattern]) {
				let location: string[];
				const r = resolveIfRef<TargetOpenAPI.PathItemObject>(this.oaDoc.paths[pattern]);
				if (r?.obj) {
					if (r.ref)
						location = this.refToLocation(r.ref);
					else
						location = ['paths', pattern];
					this.iteratePathItem(pattern, r.obj, location);
				}
			}
		});
		if (codeGenConfig.allModels) {
			Object.keys(doc.components?.schemas || {}).forEach((ref) => {
				const fullRef = '#/components/schemas/' + ref;
				this.resolveTypeSchema({$ref: fullRef} as TargetOpenAPI.ReferenceObject, ['components', 'schemas', ref]);
			});
		}
		return this.lnDoc;
	}


	/**
	 * Walk an OpenApi PathItemObject to extract the OperationObjects, and visit each in turn
	 * If the OpenApi Operation object is not already bound to a method, then bind it to a METHOD *and* visit that Operation.
	 */
	protected iteratePathItem(pattern: string, pathItem: TargetOpenAPI.PathItemObject, location: string[]) {
		Object.keys(pathItem).filter(n => HttpMethodNames.indexOf(n.toLowerCase()) >= 0).forEach((httpMethod) => {
			const operation = pathItem[httpMethod] as TargetOpenAPI.OperationObject;
			if (!operation.operationId)
				operation.operationId = nameUtils.setCase(httpMethod + ' ' + pattern, 'snake');
			if (globalThis.codeGenConfig.omittedOperationIds.indexOf(operation.operationId) >= 0)
				return;
			let tag: string;
			if (Array.isArray(operation.tags) && operation.tags.length > 0)
				tag = operation.tags[0];
			else if (operation['x-router-controller'])
				tag = operation['x-router-controller'];
			else if (operation['x-swagger-router-controller'])
				tag = operation['x-swagger-router-controller'];
			else
				tag = nameUtils.snakeCase(pattern.replace('/', '_'));
			const intf = this.resolveApiTag(tag);
			const methodName = codeGenConfig.toOperationName(operation.operationId);
			if (!intf.methods.find(m => m.getIdentifier() === methodName)) {
				const method = this.makeMethodOperation(location.concat(httpMethod));
				intf.methods.push(method);
				this.inspectMethod(method);
			}
		});
	}

	protected makeMethodOperation(location: string[]) {
		return new MethodOperation(this.oaDoc, (s, l) => {
			return this.resolveTypeSchema(s, l);
		}, {
			location,
			parameters: []
		});
	}

	protected makeParameterParameter(location: string[]) {
		return new ParameterParameter(this.oaDoc, (s, l) => {
			return this.resolveTypeSchema(s, l);
		}, {
			location
		});
	}

	protected makeParameterRequestBody(location: string[], name: string, preferredMediaTypes: string[]) {
		return new ParameterRequestBody(this.oaDoc, (s, l) => {
			return this.resolveTypeSchema(s, l);
		}, {
			location,
			name,
			preferredMediaTypes
		});
	}

	protected makeReturnResponses(location: string[], preferredResponses: ResponseCodeTypes[]) {
		return new ReturnResponses(this.oaDoc, (s, l) => {
			return this.resolveTypeSchema(s, l);
		}, {
			location,
			preferredResponses
		});
	}


	protected operationParams(operationLocation: ReadonlyArray<string>) {
		const pathItemLocation = operationLocation.slice(0, -1);
		const pathItem: TargetOpenAPI.PathItemObject = lodashGet(this.oaDoc, pathItemLocation);
		const operation: TargetOpenAPI.OperationObject = lodashGet(this.oaDoc, operationLocation);
		// Remember, PathItem can define params to be used for every operation, but the operation can override.
		const piParams = (pathItem.parameters?.map((p, idx) => {
			const r = resolveIfRef<TargetOpenAPI.ParameterObject>(p);
			let location: string[];
			if (r.ref)
				location = this.refToLocation(r.ref);
			else
				location = pathItemLocation.concat('parameters', String(idx));
			const retVal = <ParameterMetaData>{
				location: location,
				param: r.obj,
				required: r.obj.required
			};
			retVal.defaultValue = this.parameterDefaultValue(retVal.param);
			return retVal;
		}) ?? []).slice();
		const opParams = (operation.parameters?.map((p, idx) => {
			const r = resolveIfRef<TargetOpenAPI.ParameterObject>(p);
			let location: string[];
			if (r.ref)
				location = this.refToLocation(r.ref);
			else
				location = operationLocation.concat('parameters', String(idx));
			const retVal = <ParameterMetaData>{
				location: location,
				param: r.obj,
				required: r.obj.required
			};
			retVal.defaultValue = this.parameterDefaultValue(retVal.param);
			return retVal;
		}) ?? []).slice();
		// A unique parameter can be keyed by the combination of name and location (aka 'in')
		let paramsDict: Record<string, ParameterMetaData>;
		// Build a dictionary (of PathItem parameters)
		paramsDict = piParams.reduce((p, v) => {
			p[v.param.in + ':' + v.param.name] = v;
			return p;
		}, {} as { [key: string]: ParameterMetaData });
		// Now overwrite/override the dictionary with the operation ParameterObjects.
		paramsDict = opParams.reduce((p, v) => {
			p[v.param.in + ':' + v.param.name] = v;
			return p;
		}, paramsDict);
		// The resulting values in the dictionary are the actual parameters for the operation.
		return Object.values(paramsDict);
	}

	protected parameterDefaultValue(param: TargetOpenAPI.ParameterObject): any {
		let schema: TargetOpenAPI.SchemaObject | TargetOpenAPI.ReferenceObject;
		if (param.content)
			schema = param.content[Object.keys(param.content)[0]].schema;
		else if (param.schema)
			schema = param.schema;
		if (schema)
			return resolveIfRef<TargetOpenAPI.SchemaObject>(schema).obj.default;
		return undefined;
	}

	/**
	 * Prefer params to an operation in a well-defined order regardless of how they are declared in the document.
	 * *Could* be overridden to just return 'params' if you desire (but not recommended).
	 */
	protected sortMethodParameters(params: AbsMetaData[]): AbsMetaData[] {
		return params.sort((a, b) => {
			// Required always come first
			if (a.required && (!b.required))
				return -1;
			if ((!a.required) && b.required)
				return 1;
			// Things with default values come next
			if (typeof a.defaultValue !== 'undefined' && typeof b.defaultValue === 'undefined')
				return -1;
			if (typeof a.defaultValue === 'undefined' && typeof b.defaultValue !== 'undefined')
				return 1;
			// ParameterObject comes before RequestBodyObject
			if ((a as ParameterMetaData).param && (!(b as ParameterMetaData).param))
				return -1;
			if ((!(a as ParameterMetaData).param) && (b as ParameterMetaData).param)
				return 1;
			// Order the parameters as noted in our location default ordering.
			if ((a as ParameterMetaData).param && (b as ParameterMetaData).param)
				return this.ParamLocations.indexOf((b as ParameterMetaData).param.in) - this.ParamLocations.indexOf((a as ParameterMetaData).param.in);
			return 0;   // Should never hit this as there will only be one 'body'.
		});
	}

	protected readonly ParamLocations = ['path', 'cookie', 'header', 'query'];

	protected requestBodyDefaultValue(requestBody: TargetOpenAPI.RequestBodyObject, preferredMediaTypes: string[]) {
		let schemas: TargetOpenAPI.SchemaObject[] = [];
		Object.keys(requestBody.content).forEach(mtKey => {
			if (preferredMediaTypes.some(s => s === mtKey)) {
				const schema = resolveIfRef<TargetOpenAPI.SchemaObject>(requestBody.content[mtKey].schema).obj;
				if (!schemas.find(s => Object.is(s, schema)))
					schemas.push(schema);
			}
		});
		if (schemas.length === 1)
			return schemas[0].default;
		return undefined;
	}

	protected operationRequestBodyArgs(operationLocation: ReadonlyArray<string>, paramNames: string[]) {
		const operation: TargetOpenAPI.OperationObject = lodashGet(this.oaDoc, operationLocation);
		const r = resolveIfRef<TargetOpenAPI.RequestBodyObject>(operation.requestBody);
		if (r?.obj?.content) {
			let location: string[];
			if (r.ref)
				location = this.refToLocation(r.ref);
			else
				location = operationLocation.concat('requestBody');
			let bodyParamName = [
				'body', 'reqBody', '_body', '_reqBody', 'requestBody', '_requestBody', '_MaybeYouShouldReThinkYourParameterNames'
			].find(bodyName => !paramNames.find(n => n === bodyName));
			if (r.obj['x-body-name'])
				bodyParamName = r.obj['x-body-name'];
			let retVal = <RequestBodyMetaData>{
				location: location,
				required: r.obj.required,
				requestBody: r.obj,
				name: bodyParamName,
				// The purpose of this code is to suggest a Content-Type header by providing an ordered list of preferred media types.
				preferredMediaTypes: this.preferredMediaTypes(globalThis.codeGenConfig.client.reqMediaTypes, Object.keys(r.obj.content))
			};
			retVal.defaultValue = this.requestBodyDefaultValue(retVal.requestBody, retVal.preferredMediaTypes);
			return retVal;
		}
		return undefined;
	}

	protected operationResponsesArgs(httpMethod: string, operationLocation: ReadonlyArray<string>) {
		const operation: TargetOpenAPI.OperationObject = lodashGet(this.oaDoc, operationLocation);
		// The purpose of this code is to help define a recommended 'Accept' header.
		// The theory is that the most preferred response code should indicate it's most preferred media types.
		// How Client ultimately represents that is up to the client generator.
		// ES6 Maps iterate their keys in order, so this works well to indicate the most preferred codes!
		const rspCodes = this.preferredResponseCodes(httpMethod, Object.keys(operation.responses));
		const acceptableRsp = rspCodes.reduce((codeRspMap, code) => {
			const r = resolveIfRef<TargetOpenAPI.ResponseObject>(operation.responses[code]);
			let location: string[];
			if (r?.ref)
				location = this.refToLocation(r.ref);
			else
				location = operationLocation.concat(['responses', code]);
			if (r?.obj?.content) {
				const preferredMediaTypes = this.preferredMediaTypes(globalThis.codeGenConfig.client.acceptMediaTypes, Object.keys(r.obj.content));
				const mediaTypesWithSchemas = preferredMediaTypes.filter(k => {
					if (r.obj.content[k].schema)
						r.obj.content[k].schema = this.resolveTypeSchema(r.obj.content[k].schema, location.concat(['content', k, 'schema'])).oae;
					return !!r.obj.content[k].schema;
				});
				if (preferredMediaTypes.length === 0)
					codeRspMap.set(code, undefined); // Nothing is defined, so void
				else if (mediaTypesWithSchemas.length === 0)
					codeRspMap.set(code, null);  // Something was present but not defined, so anything
				else if (mediaTypesWithSchemas.length === 1)
					codeRspMap.set(code, mediaTypesWithSchemas[0]);  // A clear winner for this response code.
				else
					codeRspMap.set(code, mediaTypesWithSchemas);    // Client generator will need to decide among multiple choices.
			}
			else
				codeRspMap.set(code, undefined); // Nothing is defined, so void
			return codeRspMap;
		}, new Map<string, string | string[] | undefined | null>());
		const retVal: ResponseCodeTypes[] = [];
		acceptableRsp.forEach((v, k) => {
			retVal.push({
				code: k,
				mediaTypes: v
			});
		});
		return retVal;
	}

	/**
	 * Aka a METHOD.
	 * Subclasses should override and create a node that represents a METHOD (bound to 'operation'), and then call this super method.
	 * Parameter types are deterministic.  They are always a single SchemaObject with an optional encoding. But the param may be shared across multiple operations.
	 * Body types are *not* deterministic.  You could in theory have as many schema as there are media/types.
	 *  It is not as simple as body = {json, binary, text}, because we could send different json based on different content types.
	 *  I think better would be to find the unique schema and create an overload for each.
	 *  Then we send each unique schema(s) in the most preferred type.
	 *      Although if there were symmetric differences in required properties of non-unique schema,
	 *      we could still do it in an overloaded union type even if they had different preferred content types.
	 *  So step one, collapse unique schema and send via most preferred mt.
	 *  Future step two, attempt typescript union if there are symmetric differences.
	 *  How to represent all that in a single invocation?
	 *  Ordered key Map of mt / schema[].
	 *      In step one, schema[] will only ever have one element (but clients may wish to add url-encoded / multipart unions).
	 *      Multiple map keys will mean multiple overloaded functions.
	 *      Any given unique schema will only ever appear once anywhere in the map.
	 */
	protected inspectMethod(method: MethodOperation) {
		const params = this.operationParams(method.location);
		const reqBodyArgs = this.operationRequestBodyArgs(method.location, params.map(n => n.param.name));
		const rspArgs = this.operationResponsesArgs(method.httpMethod, method.location);
		const VisitParamFn = (p: ParameterMetaData) => {
			const param = this.makeParameterParameter(p.location);
			method.parameters.push(param);
			this.visitParameterBaseObject(param.oae, p.location);
		};
		const VisitReqBodyFn = (b: RequestBodyMetaData) => {
			const param = this.makeParameterRequestBody(b.location, b.name, b.preferredMediaTypes);
			method.parameters.push(param);
			this.visitParameterBaseObject(param.oae, b.location);
		};

		// Ensure a stable parameter ordering *and* one that is consitent with language semantics (required before optional, etc.).
		let methodParams = params.slice(0) as AbsMetaData[];
		if (reqBodyArgs)
			methodParams.push(reqBodyArgs);
		methodParams = this.sortMethodParameters(methodParams);

		// Visit each method param
		methodParams.forEach(mp => {
			if ((mp as ParameterMetaData).param)
				VisitParamFn(mp as ParameterMetaData);
			else
				VisitReqBodyFn(mp as RequestBodyMetaData);
		});

		// Finally, visit responses
		const rsp = this.makeReturnResponses(method.location.concat('responses'), rspArgs);
		method.responses = rsp;
		this.inspectMethodResponses(rsp);
	}

	protected visitParameterBaseObject(oaeParam: TargetOpenAPI.ParameterBaseObject, location: string[]) {
		if (oaeParam.content) {
			Object.keys(oaeParam.content).forEach(mtKey => {
				const mt = oaeParam.content[mtKey];
				this.resolveTypeSchema(mt.schema, location.concat('content', mtKey, 'schema'));
				if (mt.encoding)
					Object.keys(mt.encoding).forEach(encKey => {
						const enc = mt.encoding[encKey];
						if (enc.headers) {
							Object.keys(enc.headers).forEach(hdrKey => {
								const hdrInfo = resolveIfRef<TargetOpenAPI.HeaderObject>(enc.headers[hdrKey]);
								if (hdrInfo?.obj) {
									let loc: string[];
									if (hdrInfo.ref)
										loc = (hdrInfo.ref.startsWith('#') ? hdrInfo.ref.substring(1) : hdrInfo.ref).split('/').filter(s => !!s);
									else
										loc = location.concat('content', mtKey, 'schema');
									this.visitParameterBaseObject(hdrInfo.obj, loc);
								}
							});
						}
					});
			});
		}
		else if (oaeParam.schema)
			this.resolveTypeSchema(oaeParam.schema, location.concat('schema'));
	}

	protected inspectMethodResponses(responses: ReturnResponses) {
	}

	/**
	 * Helper to filter and sort the provided mediaTypes according to our configuration.
	 * The real purpose of this header is to suggest a request body Content-Type for code generators,
	 * AND,
	 * to propose an Accept header for code generators.
	 * Of course, code generators *should* also append * / * and handle unpredictable responses.
	 */
	protected preferredMediaTypes(preferredTypes: string[], mediaTypes: string[]): string[] {
		mediaTypes = Array.from(new Set(mediaTypes));
		const allowedTypes = mediaTypes.filter(k => preferredTypes.find(p => this.mediaTypeMatcher(p, k)));
		return allowedTypes.sort((a, b) => {
			// noinspection SpellCheckingInspection
			const aidx = preferredTypes.findIndex(p => this.mediaTypeMatcher(p, a));
			// noinspection SpellCheckingInspection
			const bidx = preferredTypes.findIndex(p => this.mediaTypeMatcher(p, b));
			return aidx - bidx;
		});
	}

	/**
	 * Helper to match a wildcard pattern to a mediaType
	 */
	private mediaTypeMatcher(pattern: string, mediaType: string) {
		const lmt = mediaType.toLowerCase();
		// noinspection SpellCheckingInspection
		const lpat = pattern.toLowerCase();
		// noinspection SpellCheckingInspection
		const lpata = lpat.split(/[\r\n\s]+/);
		if (Array.isArray(lpata) && lpata[0] !== pattern) {
			const regex = new RegExp(lpata[0], lpata[1] ?? '');
			return regex.test(lmt);
		}
		return lpat === lmt;
	}

	/**
	 * Helper method to compute an ordered list of the most preferred http status response codes.
	 * The purpose of this is to assist in declaring the return type for a 'body' overloaded METHOD.
	 */
	protected preferredResponseCodes(method: string, responseCodes: string[]): string[] {
		responseCodes = Array.from(new Set(responseCodes));
		// Don't get tripped up by casing or other syntax issues
		const caseMap = responseCodes.reduce((p, v) => {
			let k = v.toUpperCase();
			// This will place default before 300+ but after 299
			if (k === 'DEFAULT')
				k = '2ZZ';
			k = k.padEnd(3, 'X');
			p[k] = v;
			return p;
		}, {});
		// Only return success codes for the body overload (client apis should always have an HttpResponse return type to access the full response).
		const successCodes = Object.keys(caseMap).sort().filter(s => s[0] === '2').map(s => s === '2ZZ' ? 'default' : s);

		// If an element exists in the provided array, pull it to the front of that array.
		function pullForward(s: string, a: string[]) {
			let idx = a.indexOf(s);
			if (idx >= 0)
				a.unshift(a.splice(idx, 1)[0]);
		}

		// IANA spec has some opinions about status codes that different methods *should* return.
		switch (method.toUpperCase()) {
			case 'HEAD':
			case 'GET':
				pullForward('204', successCodes);
				pullForward('200', successCodes);
				break;
			case 'POST':
				pullForward('200', successCodes);
				pullForward('201', successCodes);
				break;
			case 'PUT':
				pullForward('204', successCodes);
				pullForward('200', successCodes);
				pullForward('201', successCodes);
				break;
			case 'DELETE':
				pullForward('200', successCodes);
				pullForward('204', successCodes);
				pullForward('202', successCodes);
				break;
		}
		return successCodes;
	}
}
