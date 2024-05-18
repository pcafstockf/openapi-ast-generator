// noinspection DuplicatedCode

import {get as lodashGet} from 'lodash';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {resolveIfRef} from '../openapi/openapi-utils';
import {LangNeutral, LangNeutralJson, TypeSchemaResolver} from './lang-neutral';
import {OpenAPISchemaObject, resolveMediaTypeTypes, TypeSchema} from './type-schema';

export interface ResponseCodeTypes {
	code: string;
	mediaTypes: string | string[] | undefined | null;
}

export interface ReturnResponsesJson extends LangNeutralJson {
	preferredResponses: ResponseCodeTypes[];
}

// noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
export class ReturnResponses implements LangNeutral {
	readonly nodeKind = 'return';

	/**
	 *
	 * @param document
	 * @param typeResolver
	 * @param json
	 */
	constructor(
		readonly document: TargetOpenAPI.Document,
		typeResolver: TypeSchemaResolver,
		json: Omit<ReturnResponsesJson, 'nodeKind'>
	) {
		this.location = json.location;
		this.preferredResponses = json.preferredResponses;
		this.preferredResponses.map(r => r.code).forEach(rspCode => {
			const rsp = resolveIfRef<TargetOpenAPI.ResponseObject>(this.oae[rspCode]).obj;
			if (rsp?.content) {
				Object.keys(rsp.content).forEach((mediaType) => {
					resolveMediaTypeTypes(typeResolver, rsp.content[mediaType], this.location.concat(rspCode, 'content', mediaType));
				});
			}
			if (rsp?.headers) {
				Object.keys(rsp.headers).forEach(hdrKey => {
					const hdr = resolveIfRef<TargetOpenAPI.HeaderObject>(rsp.headers[hdrKey]);
					if (hdr.obj) {
						const hdrLocation = this.location.concat(rspCode, 'headers', hdrKey);
						if (hdr.obj.schema)
							typeResolver(hdr.obj.schema, hdrLocation.concat('schema'));
						if (hdr.obj.content) {
							Object.keys(hdr.obj.content).forEach(mtKey => {
								resolveMediaTypeTypes(typeResolver, hdr.obj.content[mtKey], hdrLocation.concat('content', mtKey));
							});
						}
					}
				});
			}
		});
	}

	readonly location: ReadonlyArray<string>;
	readonly preferredResponses: ReadonlyArray<Readonly<ResponseCodeTypes>>;

	get oae(): TargetOpenAPI.ResponsesObject {
		return lodashGet(this.document, this.location);
	}

	/**
	 * Client side helper to compute 'Accept' media types in preferred order.
	 * @param includeAny    If true *and* null (aka 'anything') was found anywhere in the list of acceptable media types, the last value in the returned array will be '* / *' (no spaces).
	 */
	getAcceptable(includeAny: boolean): string[] {
		let hasAny = false;
		const types = this.preferredResponses.map(r => r.mediaTypes);
		const retVal = Array.from(types.reduce((s, v) => {
			if (Array.isArray(v)) {
				v.forEach(e => {
					if (e === null)
						hasAny = true;
					else if (e)
						s.add(e);
				});
			}
			else if (v === null)
				hasAny = true;
			else if (v)
				s.add(v);
			return s;
		}, new Set<string>()));
		if (hasAny && includeAny)
			retVal.push('*/*');
		return retVal;
	}

	/**
	 * Client side helper to find the 2xx response types from the server.
	 * WARNING:
	 *  Due to nesting of media types within response codes, there is *not* a one to one correlation between the supplied 'accept' headers and the returned types.
	 */
	getAcceptableTypes(): TypeSchema[] {
		const accept = this.getAcceptable(true);
		const schemas: TypeSchema[] = [];
		let hasAny = false;
		let hasVoid = accept.length === 0;
		const codes = this.preferredResponses.map(r => r.code);
		codes.forEach(rspCode => {
			const rsp = resolveIfRef<TargetOpenAPI.ResponseObject>(this.oae[rspCode]).obj;
			if (rsp.content) {
				Object.keys(rsp.content).forEach((mediaType) => {
					if (mediaType === '*/*')
						hasAny = true;
					else if (accept.indexOf(mediaType) >= 0) {
						const mtObj = resolveIfRef<TargetOpenAPI.MediaTypeObject>(rsp.content[mediaType]).obj;
						if (!mtObj.schema)
							hasVoid = true;
						else {
							const cs = (mtObj.schema as OpenAPISchemaObject).$ast;
							const match = schemas.find(s => s.matches(cs));
							if (!match)
								schemas.push(cs);
						}
					}
				});
			}
		});
		if (hasAny)
			schemas.push(null);
		if (hasVoid)
			schemas.push(undefined);
		return schemas;
	}

	getEncoding(code: string, mediaType: string): Record<string, TargetOpenAPI.EncodingObject> | undefined {
		//TODO: Modify this to align with whatever we do for @see Parameter.getEncoding
		return undefined;
	}

	toJSON() {
		return {
			nodeKind: this.nodeKind,
			location: this.location.slice(0),
			preferredResponses: this.preferredResponses.map((pr) => {
				return {
					...pr
				};
			})
		};
	}
}
