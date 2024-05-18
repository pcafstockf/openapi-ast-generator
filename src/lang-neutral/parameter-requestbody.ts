import {TargetOpenAPI} from '../openapi-supported-versions';
import {resolveIfRef} from '../openapi/openapi-utils';
import {LangNeutralJson, TypeSchemaResolver} from './lang-neutral';
import {AbstractMethodParameter} from './parameter-abstract';
import {OpenAPISchemaObject, resolveMediaTypeTypes, TypeSchema} from './type-schema';

export interface ParameterRequestBodyJson extends LangNeutralJson {
	name: string,
	preferredMediaTypes: string[]
}

export class ParameterRequestBody extends AbstractMethodParameter<TargetOpenAPI.RequestBodyObject> {
	readonly nodeKind = 'request';

	/**
	 *
	 * @param document
	 * @param typeResolver
	 * @param json
	 */
	constructor(
		document: TargetOpenAPI.Document,
		typeResolver: TypeSchemaResolver,
		json: Omit<ParameterRequestBodyJson, 'nodeKind'>
	) {
		super(document, json.location);
		this.name = json.name;
		this.preferredMediaTypes = json.preferredMediaTypes;
		const c = this.oae.content;
		if (c)
			Object.keys(c).forEach(mtKey => {
				resolveMediaTypeTypes(typeResolver, c[mtKey], this.location.concat('content', mtKey));
			});
	}

	readonly name: string;
	readonly preferredMediaTypes: ReadonlyArray<string>;

	get required(): boolean {
		return !!this.oae.required;
	}

	/**
	 * Returns a Map whose *ordered* keys are the most to least preferred media-types.
	 * The values in the Map will be the Schema to be used for each media-type.
	 */
	get types(): Map<string, TypeSchema[]> {
		const p = this.oae;
		const allTypes: TypeSchema[] = [];
		return this.preferredMediaTypes.reduce((a, mt) => {
			const ts = resolveIfRef<OpenAPISchemaObject>(p.content[mt].schema).obj.$ast;
			if (!allTypes.find(e => e.matches(ts))) {
				allTypes.push(ts);
				let siblings = a.get(mt);
				if (!Array.isArray(siblings)) {
					siblings = [];
					a.set(mt, siblings);
				}
				siblings.push(ts);
			}
			return a;
		}, new Map<string, TypeSchema[]>());
	}

	resolveTypes(): TypeSchema[] {
		const types = this.types;
		const mediaTypes = Array.from(types.keys());
		if (mediaTypes.length < 1)
			throw new Error('No recognizable/supported body content type');
		if (codeGenConfig.role === 'client')
			return types.get(mediaTypes[0]);
		// else, generating for a server who has to handle any submitted (declared) media type.
		const paramTypes: TypeSchema[] = [];
		mediaTypes.forEach((mt, i) => {
			const t = types.get(mt).slice(0);
			// We can always accommodate the most preferred types because that is how we are generating the client anyway.
			if (i === 0)
				paramTypes.push(...t);
			else {
				if (!t.some(e => paramTypes.find(pt => Object.is(pt, e))))
					throw new Error('Schemas differ based on media type');  // Callers may have to handle by providing different methods for different media-types.
			}
		});
		return paramTypes;
	}

	// noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
	getEncoding(mediaType: string): Record<string, TargetOpenAPI.EncodingObject> | undefined {
		//TODO: Modify this to align with whatever we do for @see Parameter.getEncoding
		return undefined;
	}

	toJSON() {
		return {
			nodeKind: this.nodeKind,
			location: this.location.slice(0),
			name: this.name,
			preferredMediaTypes: this.preferredMediaTypes
		};
	}
}
