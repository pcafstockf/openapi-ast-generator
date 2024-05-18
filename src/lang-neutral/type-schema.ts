import {get as lodashGet, isEqualWith as lodashIsEqualWith, set as lodashSet} from 'lodash';
import path from 'node:path';
import {OpenAPIV3} from 'openapi-types';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {resolveIfRef} from '../openapi/openapi-utils';
import {LangNeutral, LangNeutralJson, NodeKind, TypeSchemaResolver} from './lang-neutral';

export interface TypeSchemaJson extends LangNeutralJson {
	name?: string;
}

const ImpliedName = Symbol('ImpliedName');

export type OpenAPISchemaObject = TargetOpenAPI.SchemaObject & { $ast: TypeSchema };

/**
 * OpenApi types include five of the six primitive JSON types (boolean, number, string, object, array) *plus* the type 'integer'.
 * Further, unlike OA3, OA3.1 also supports the sixth JSON type; null.
 * For code generation purposes,
 */
export class TypeSchema implements LangNeutral {
	get nodeKind(): NodeKind {
		return 'type';
	}

	/**
	 *
	 * @param document
	 * @param location
	 * @param name
	 */
	constructor(
		readonly document: TargetOpenAPI.Document,
		readonly location: string[],
		name?: string
	) {
		lodashSet(this.document, this.location.concat('$ast'), this);
		this[ImpliedName] = name;
		const oae = this.oae;
		// Hack to fix swagger 2 that some people still pass (here's looking at you MS).
		switch (oae.type as string) {
			case 'date':
				oae.type = 'string';
				oae.format = 'date';
				break;
			case 'dateTime':
				oae.type = 'string';
				oae.format = 'date-time';
				break;
			case 'password':
				oae.type = 'string';
				oae.format = 'password';
				break;
		}
	}

	/**
	 * Prefer any existing title over a name manufactured from the last segment of a reference.
	 */
	get name(): string {
		const n = this.oae;
		if (n.title)
			return n.title;
		return this[ImpliedName];
	}

	/**
	 * Return the underlying OpenApi Element.
	 */
	get oae(): OpenAPISchemaObject {
		return lodashGet(this.document, this.location);
	}

	/**
	 * Returns true if this type is physically or logically the same as another.
	 */
	matches(ts: TypeSchema): boolean {
		const a = this.oae;
		const b = ts.oae;
		if (Object.is(a, b))
			return true;
		if (a.type === b.type)
			if (a.format === b.format)
				return lodashIsEqualWith(a, b, (va, vb, key) => {
					// OpenApi does not have '$' prefixed properties, so we just pretend those are equal.
					if (typeof key === 'string' && key.startsWith('$'))
						return true;
					return undefined;   // Let lodash decide.
				});
		return false;
	}

	/**
	 * OA3/3.1 agnostic SchemaObject.nullable property.
	 */
	get isNullable(): boolean {
		const schema = this.oae;
		// If type is an array (OA3.1 doc), we extract nullable (if any), and convert type back to a OA3 style type string.
		if (Array.isArray(schema.type)) {
			// Note: I think when type is an array, it is only for the OA3.1 purpose of indicating null support.
			if (schema.type.length > 2)
				throw new Error('Bad OAG assumption about MixedSchemaObject');
			return (schema.type as string[]).some(s => s === 'null' || s === null);
		}
		return !!(schema as OpenAPIV3.SchemaObject).nullable;
	}

	/**
	 * OA3/3.1 agnostic SchemaObject.type property.
	 * Note that OA states that if type is undefined, it means *any*.
	 */
	get oaType(): TargetOpenAPI.SchemaObjectType | undefined {
		const schema = this.oae;
		// accommodate OA3.1
		if (Array.isArray(schema.type)) {
			// Note: I think when type is an array, it is only for the OA3.1 purpose of indicating null support.
			if (schema.type.length > 2)
				throw new Error('Bad OAG assumption about MixedSchemaObject');
			const idx = (schema.type as string[]).findIndex(s => s === 'null' || s === null);
			if (idx === 1)
				return (schema.type as string[])[0] as TargetOpenAPI.SchemaObjectType;
			else if (idx === 0)
				return (schema.type as string[])[1] as TargetOpenAPI.SchemaObjectType;
			else
				return undefined;
		}
		return schema.type;
	}

	//TODO: Add inverting filter for 'not' to all three allOf, anyOf, oneOf

	get allOf(): TypeSchema[] {
		return this.oae.allOf?.map(s => resolveIfRef<OpenAPISchemaObject>(s).obj.$ast);
	}

	get anyOf(): TypeSchema[] {
		return this.oae.anyOf?.map(s => resolveIfRef<OpenAPISchemaObject>(s).obj.$ast);
	}

	get oneOf(): TypeSchema[] {
		return this.oae.oneOf?.map(s => resolveIfRef<OpenAPISchemaObject>(s).obj.$ast);
	}

	getIdentifier(type: 'intf' | 'impl'): string {
		if (this.name) {
			switch (type) {
				case 'intf':
					return codeGenConfig.toIntfName(this.name, 'model');
				case 'impl':
					return codeGenConfig.toImplName(this.name, 'model');
			}
		}
		return undefined;
	}

	getFilepath(type: 'intf' | 'impl'): string {
		if (this.name) {
			switch (type) {
				case 'intf':
					return path.join(codeGenConfig.modelIntfDir, codeGenConfig.toIntfFileBasename(this.name, 'model'));
				case 'impl':
					return path.join(codeGenConfig.modelImplDir, codeGenConfig.toImplFileBasename(this.name, 'model'));
			}
		}
	}

	toJSON() {
		return {
			nodeKind: this.nodeKind,
			location: this.location,
			name: this.name
		};
	}
}

export class RecordSchema extends TypeSchema {
	override get nodeKind(): NodeKind {
		return 'record';
	}

	/**
	 *
	 * @param document
	 * @param location
	 * @param name
	 */
	constructor(
		document: TargetOpenAPI.Document,
		location: string[],
		name?: string
	) {
		super(document, location, name);
	}

	get properties(): Map<string, TypeSchema> {
		return Object.keys(this.oae.properties || {}).reduce((p, v) => {
			p.set(v, this.getPropertySchema(v).$ast);
			return p;
		}, new Map<string, TypeSchema>());
	}

	propertyIsRequired(oaName: string): boolean {
		return !!this.oae.required?.some(s => s === oaName);
	}

	getPropertySchema(oaName: string): OpenAPISchemaObject {
		return resolveIfRef<OpenAPISchemaObject>(this.oae.properties?.[oaName]).obj;
	}

	propertyIdentifier(oaName: string): string {
		return codeGenConfig.toPropertyName(oaName);
	}

	get additionalProperties(): TypeSchema | boolean {
		const ap = this.oae.additionalProperties;
		if (typeof ap === 'boolean')
			return ap;
		if (ap)
			return resolveIfRef<OpenAPISchemaObject>(ap)?.obj.$ast;
		return false;
	}
}

export class ArraySchema extends TypeSchema {
	override get nodeKind(): NodeKind {
		return 'array';
	}

	/**
	 *
	 * @param document
	 * @param location
	 * @param name
	 */
	constructor(
		document: TargetOpenAPI.Document,
		location: string[],
		name?: string
	) {
		super(document, location, name);
	}

	get items(): TypeSchema {
		const schema = resolveIfRef<OpenAPISchemaObject>((this.oae as TargetOpenAPI.ArraySchemaObject).items);
		return schema?.obj?.$ast || null;   // An array without items specified should be considered 'any' (aka null).
	}
}

/**
 * MediaTypeObject can have very deeply buried schema.
 * Specifically the MediaTypeObject.encoding if present can contain HeaderObjects (aka are ParameterBaseObject), and those can contain more MediaTypes
 */
export function resolveMediaTypeTypes(typeResolver: TypeSchemaResolver, mt: TargetOpenAPI.MediaTypeObject, location: string[]) {
	if (mt.schema)
		typeResolver(mt.schema, location.concat('schema'));
	if (mt.encoding) {
		Object.keys(mt.encoding).forEach(encKey => {
			const encObj = mt.encoding[encKey];
			if (encObj.headers) {
				Object.keys(encObj.headers).forEach(hdrKey => {
					const hdr = resolveIfRef<TargetOpenAPI.HeaderObject>(encObj.headers[hdrKey]);
					if (hdr.obj) {
						const hdrLocation = location.concat('encoding', encKey, 'headers', hdrKey);
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
}
