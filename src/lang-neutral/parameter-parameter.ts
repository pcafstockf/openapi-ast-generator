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

	get serializerOptions() {
		const oae = this.oae;
		let s = oae.style as OpenApiStyle;
		if (!s) {
			switch (oae.in) {
				case 'query':
				case 'cookie':
					s = 'form';
					break;
				case 'header':
				case 'path':
					s = 'simple';
					break;
			}
		}
		return getParameterSerializationOptions(s, oae.explode || false, oae.name);
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


export function getParameterSerializationOptions(style: OpenApiStyle, isExplode: boolean, name: string) {
	switch (style) {
		case 'simple':
			//  explode	5	3,4,5	role=admin,firstName=Alex
			// !explode	5	3,4,5	role,admin,firstName,Alex
			return {
				operator: '', //Begins the entire string
				identifier: '', //Begins each element
				delimiter: ',', // Appears between elements or a key/value *pairs*
				separator: isExplode ? '=' : ',' // Separates a key from it's value.
			};
		case 'label':
			//  explode	.5	.3.4.5	.role=admin.firstName=Alex
			// !explode	.5	.3,4,5	.role,admin,firstName,Alex
			return {
				operator: '.',
				identifier: '',
				delimiter: isExplode ? '.' : ',',
				separator: isExplode ? '=' : ','
			};


		case 'matrix':
			//  explode	;id=5	;id=3;id=4;id=5 ;role=admin;firstName=Alex
			// !explode	;id=5	;id=3,4,5	    ;id=role,admin,firstName,Alex
			return {
				operator: ';',
				identifier: name + '=',
				delimiter: isExplode ? ';' : ',',
				separator: isExplode ? '=' : ','
			};
		case 'form':
			// explode	?id=5	?id=3&id=4&id=5	?role=admin&firstName=Alex
			// !explode	?id=5	?id=3,4,5	    ?id=role,admin,firstName,Alex
			return {
				operator: '?',
				identifier: name + '=',
				delimiter: isExplode ? '&' : ',',
				separator: isExplode ? '=' : ','
			};
		case 'spaceDelimited':
			// explode	?id=3&id=4&id=5
			// !explode	?id=3%204%205
			return {
				operator: isExplode ? '?' : '?' + name + '=',
				identifier: isExplode ? name + '=' : '',
				delimiter: isExplode ? '&' : '%20',
				separator: undefined
			};
		case 'pipeDelimited':
			// explode	?id=3&id=4&id=5
			// !explode	?id=3|4|5
			return {
				operator: isExplode ? '?' : '?' + name + '=',
				identifier: isExplode ? name + '=' : '',
				delimiter: isExplode ? '&' : '|',
				separator: undefined
			};
		case 'deepObject':
			// explode	?id[role]=admin&id[firstName]=Alex
			return {
				operator: '?',
				identifier: name + '[',
				delimiter: '&',
				separator: ']='
			};
		default:
			throw new Error('Unsupported method');
	}
}
