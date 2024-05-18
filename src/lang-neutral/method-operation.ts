// noinspection JSUnusedGlobalSymbols

import {get as lodashGet} from 'lodash';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {resolveIfRef} from '../openapi/openapi-utils';
import {LangNeutral, LangNeutralJson, TypeSchemaResolver} from './lang-neutral';
import {ParameterParameter, ParameterParameterJson} from './parameter-parameter';
import {ParameterRequestBody, ParameterRequestBodyJson} from './parameter-requestbody';
import {ReturnResponses, ReturnResponsesJson} from './return-responses';

export interface MethodSecurity {
	httpAuth?: { basic?: boolean, bearer?: string };
	apiKey?: Record<'header' | 'query' | 'cookie', string[]>;
}

export interface MethodOperationJson extends LangNeutralJson {
	parameters: (ParameterParameterJson | ParameterRequestBodyJson)[];
	responses: ReturnResponsesJson;
}

const ResponsesProp = Symbol('responses');

export class MethodOperation implements LangNeutral {
	readonly nodeKind = 'method';

	/**
	 *
	 * @param document
	 * @param typeResolver
	 * @param json
	 */
	constructor(
		readonly document: TargetOpenAPI.Document,
		typeResolver: TypeSchemaResolver,
		json: Omit<MethodOperationJson, 'nodeKind'>
	) {
		this.location = json.location;
		this.parameters = json.parameters.map(p => {
			if (p.nodeKind === 'parameter')
				return new ParameterParameter(this.document, typeResolver, p as ParameterParameterJson);
			else if (p.nodeKind === 'request')
				return new ParameterRequestBody(this.document, typeResolver, p as ParameterRequestBodyJson);
		});
		if (json.responses)
			this.responses = new ReturnResponses(this.document, typeResolver, json.responses);
	}

	readonly location: ReadonlyArray<string>;
	readonly parameters: (ParameterParameter | ParameterRequestBody)[];

	get responses(): ReturnResponses {
		return this[ResponsesProp] as ReturnResponses;
	}

	set responses(rr: ReturnResponses) {
		if (!(rr instanceof ReturnResponses))
			throw new Error('Invalid ReturnResponses');
		if (this[ResponsesProp])
			throw new Error('ReturnResponses is already set');
		Object.defineProperty(this, ResponsesProp, {
			enumerable: false,
			writable: false,
			value: rr
		});
	}

	/**
	 * Return the underlying OpenApi Element.
	 */
	get oae(): TargetOpenAPI.OperationObject {
		return lodashGet(this.document, this.location);
	}

	get httpMethod(): string {
		return this.location[this.location.length - 1].toLowerCase();
	}

	get pathItem(): TargetOpenAPI.PathItemObject {
		return lodashGet(this.document, this.location.slice(0, -1));
	}

	get pattern(): string {
		return this.location.at(-2);
	}

	getIdentifier(): string {
		return codeGenConfig.toOperationName(this.oae.operationId);
	}

	get security(): MethodSecurity | undefined {
		let retVal: MethodSecurity = undefined;
		const authMethods = (this.document.security || []).concat(this.oae.security || []);
		if (authMethods.length > 0) {
			retVal = {};
			let hasApiKey = false;
			const headerNames = [] as string[];
			const queryNames = [] as string[];
			const cookieNames = [] as string[];
			authMethods.forEach((authMethod) => {
				Object.keys(authMethod).map(label => this.getSecuritySchemes()[label]).forEach(ss => {
					switch (ss.type) {
						case 'apiKey':
							switch (ss.in) {
								case 'header':
									headerNames.push(ss.name);
									break;
								case 'query':
									queryNames.push(ss.name);
									break;
								case 'cookie':
									cookieNames.push(ss.name);
									break;
							}
							hasApiKey = true;
							break;
						case 'http':
							switch (ss.scheme) {
								case 'basic':
									retVal.httpAuth = retVal.httpAuth || {};
									retVal.httpAuth.basic = true;
									break;
								case 'bearer':
									retVal.httpAuth = retVal.httpAuth || {};
									retVal.httpAuth.bearer = ss.bearerFormat;
									break;
							}
							break;
					}
				});
			});
			if (hasApiKey) {
				retVal.apiKey = {} as any;
				if (headerNames.length > 0)
					retVal.apiKey['header'] = headerNames;
				if (queryNames.length > 0)
					retVal.apiKey['query'] = queryNames;
				if (cookieNames.length > 0)
					retVal.apiKey['cookie'] = cookieNames;
			}
		}
		return retVal;
	}

	protected getSecuritySchemes() {
		if (!this.cachedSecuritySchemes) {
			this.cachedSecuritySchemes = Object.keys(this.document.components.securitySchemes).reduce((p, v) => {
				p[v] = resolveIfRef<TargetOpenAPI.SecuritySchemeObject>(this.document.components.securitySchemes[v]).obj;
				return p;
			}, {} as any);
		}
		return this.cachedSecuritySchemes;
	}

	private cachedSecuritySchemes: { [name: string]: TargetOpenAPI.SecuritySchemeObject };

	toJSON() {
		return {
			nodeKind: this.nodeKind,
			location: this.location.slice(0),
			parameters: this.parameters.map(p => p.toJSON()),
			responses: this.responses.toJSON()
		};
	}
}
