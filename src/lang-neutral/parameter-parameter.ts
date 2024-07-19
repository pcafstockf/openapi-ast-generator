import {TargetOpenAPI} from '../openapi-supported-versions';
import {OpenApiStyle, resolveIfRef} from '../openapi/openapi-utils';
import {LangNeutralJson, TypeSchemaResolver} from './lang-neutral';
import {AbstractMethodParameter} from './parameter-abstract';
import {OpenAPISchemaObject, resolveMediaTypeTypes, TypeSchema} from './type-schema';

export interface ParameterParameterJson extends LangNeutralJson {
}

export class ParameterParameter extends AbstractMethodParameter<TargetOpenAPI.ParameterObject> {
	readonly nodeKind = 'parameter';

	/**
	 *
	 * @param document
	 * @param typeResolver
	 * @param json
	 */
	constructor(
		document: TargetOpenAPI.Document,
		typeResolver: TypeSchemaResolver,
		json: Omit<ParameterParameterJson, 'nodeKind'>
	) {
		super(document, json.location);
		this.nodeKind = 'parameter';
		const p = this.oae;
		if (p.content)
			Object.keys(p.content).forEach(mtKey => {
				resolveMediaTypeTypes(typeResolver, p.content[mtKey], this.location.concat('content', mtKey));
			});
		else
			typeResolver(p.schema, this.location.concat('schema'));
	}

	get name(): string {
		return this.oae.name;
	}

	get required(): boolean {
		return !!this.oae.required;
	}

	get type(): TypeSchema {
		const p = this.oae;
		if (p.content)
			return resolveIfRef<OpenAPISchemaObject>(p.content[Object.keys(p.content)[0]].schema).obj.$ast;
		else
			return resolveIfRef<OpenAPISchemaObject>(p.schema).obj.$ast;
	}

	resolveTypes(): TypeSchema[] {
		return [this.type];
	}

	get serializerKey() {
		const oae = this.oae;
		let s = oae.style as OpenApiStyle;
		let e = oae.explode;
		if (!s) {
			switch (oae.in) {
				case 'query':
				case 'cookie':
					s = 'form';
					if (typeof e === 'undefined')
						e = true;
					break;
				case 'header':
				case 'path':
					s = 'simple';
					if (typeof e === 'undefined')
						e = false;
					break;
			}
		}
		switch (s) {
			case 'matrix':
				return `m${e ? 'e' : ''}`;
			case 'label':
				return `l${e ? 'e' : ''}`;
			case 'form':
				return `f${e ? 'e' : ''}`;
			case 'simple':
				return `s${e ? 'e' : ''}`;
			case 'spaceDelimited':
				if (e)
					return undefined;
				return `sd`;
			case 'pipeDelimited':
				if (e)
					return undefined;
				return `pd`;
			case 'deepObject':
				if (e)
					return undefined;
				return `do`;
			default:
				return undefined;
		}
	}

	// noinspection JSUnusedGlobalSymbols
	getEncoding(): Record<string, TargetOpenAPI.EncodingObject> | undefined {
		//TODO: Modify this to return more useful codegen (enhancer-utils) stuff like getParamStylePrefix, getParamStyleDelimiter, etc.
		const p = this.oae;
		if (p.content)
			return p.content[Object.keys(p.content)[0]].encoding;
		return undefined;
	}

	toJSON() {
		return {
			nodeKind: this.nodeKind,
			location: this.location.slice(0)
		};
	}
}
