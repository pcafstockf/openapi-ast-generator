import {get as lodashGet} from 'lodash';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {resolveIfRef} from '../openapi/openapi-utils';
import {ApiTag, OpenAPITagObject} from './api-tag';
import {LanguageNeutralDocument} from './generator';
import {ArraySchema, OpenAPISchemaObject, RecordSchema, TypeSchema} from './type-schema';

export class LanguageNeutralBase {

	protected makeTypeSchema(location: string[], name?: string): TypeSchema {
		const schema = lodashGet(this.oaDoc, location);
		if (schema.type === 'object' || (Array.isArray(schema.type) && (schema.type as string[]).some(s => s === 'object')))
			return new RecordSchema(this.oaDoc, location, name);
		if (schema.type === 'array' || (Array.isArray(schema.type) && (schema.type as string[]).some(s => s === 'array')))
			return new ArraySchema(this.oaDoc, location, name);
		return new TypeSchema(this.oaDoc, location, name);
	}

	protected makeApiTag(location: string[]) {
		return new ApiTag(this.oaDoc, (s, l) => {
			return this.resolveTypeSchema(s, l);
		}, {
			location,
			methods: []
		});
	}

	protected oaDoc: TargetOpenAPI.Document;
	protected lnDoc: LanguageNeutralDocument;

	protected refToLocation(ref: string | undefined): string[] | undefined {
		if (typeof ref === 'undefined' || ref === null)
			return undefined;
		return (ref.startsWith('#') ? ref.substring(1) : ref).split('/').filter(s => !!s);
	}


	/**
	 * TagObjects define the API that contains the OperationObject methods.
	 */
	protected resolveApiTag(tag?: TargetOpenAPI.TagObject | TargetOpenAPI.ReferenceObject | string): ApiTag {
		let retVal: ApiTag = undefined as any;
		if (typeof tag === 'string') {
			retVal = this.lnDoc.apis.find(i => i.oae.name === tag);
			if (retVal)
				return retVal;
			tag = {name: tag} as TargetOpenAPI.TagObject;
		}
		const r = resolveIfRef<OpenAPITagObject>(tag);
		if (r?.obj) {
			if (r.obj.$ast)
				return r.obj.$ast;
			if (!this.oaDoc.tags?.find(t => t.name === r.obj.name))
				throw new Error('Invalid tag/api');
			let location: string[];
			if (r.ref)
				location = this.refToLocation(r.ref);
			else {
				let idx = this.oaDoc.tags.findIndex(t => t.name === r.obj.name);
				location = ['tags', String(idx)];
			}
			retVal = this.makeApiTag(location);
			this.lnDoc.apis.push(retVal);
		}
		return retVal;
	}

	/**
	 * Resolve an OpenApi Schema or reference to a 'MODEL'
	 * If the OpenApi Schema object is not already bound to a model, then bind it to a MODEL *and* visit that Schema.
	 */
	protected resolveTypeSchema(s?: TargetOpenAPI.SchemaObject | TargetOpenAPI.ReferenceObject, location?: string[]): TypeSchema {
		let retVal: TypeSchema = undefined as any;
		const r = resolveIfRef<OpenAPISchemaObject>(s);
		if (r?.obj) {
			if (r.obj.$ast)
				return r.obj.$ast;
			if (r.ref) {
				location = this.refToLocation(r.ref);
				retVal = this.makeTypeSchema(location, location[location.length - 1]);
				this.lnDoc.types.push(retVal);
			}
			else
				retVal = this.makeTypeSchema(location);
			this.inspectType(retVal);
		}
		return retVal;
	}


	/**
	 * The primary purpose of this method is discovery and binding (although it does assimilate object properties).
	 * For example, as each 'allOf' is discovered, it will have an $ast bound into that SchemaObject.
	 * This will allow @see TypeSchema to implement methods like allOf which return an array of @see TypeSchema.
	 */
	protected inspectType(type: TypeSchema) {
		const schema = type.oae;
		if (Array.isArray(schema.allOf))
			schema.allOf.forEach((r, idx) => {
				this.resolveTypeSchema(r, type.location.concat(['allOf', '' + idx]));
			});
		if (Array.isArray(schema.oneOf))
			schema.oneOf.forEach((r, idx) => {
				this.resolveTypeSchema(r, type.location.concat(['oneOf', '' + idx]));
			});
		if (Array.isArray(schema.anyOf))
			schema.anyOf.forEach((r, idx) => {
				this.resolveTypeSchema(r, type.location.concat(['anyOf', '' + idx]));
			});
		if (schema.not)
			this.resolveTypeSchema(schema.not, type.location.concat(['not']));
		if (schema.properties) {
			if (type.nodeKind !== 'record')
				throw new Error('Bad OAG assumption about SchemaObject.properties');
			Object.keys(schema.properties).forEach(v => {
				this.resolveTypeSchema(schema.properties[v], type.location.concat(['properties', v]));
			});
		}
		if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
			this.resolveTypeSchema(schema.additionalProperties, type.location.concat(['additionalProperties']));
		if (type.oaType === 'array' && (schema as TargetOpenAPI.ArraySchemaObject).items)
			this.resolveTypeSchema((schema as TargetOpenAPI.ArraySchemaObject).items, type.location.concat(['items']));
	}
}
