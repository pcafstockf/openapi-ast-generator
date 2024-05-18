import {get as lodashGet, set as lodashSet} from 'lodash';
import path from 'node:path';
import {CodeGenConfig} from '../codegen/codegen-config';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {LangNeutral, LangNeutralJson, TypeSchemaResolver} from './lang-neutral';
import {MethodOperation, MethodOperationJson} from './method-operation';

declare global {
	var codeGenConfig: CodeGenConfig;
}

export interface ApiTagJson extends LangNeutralJson {
	methods: MethodOperationJson[];
}

export type OpenAPITagObject = TargetOpenAPI.TagObject & { $ast: ApiTag };

export class ApiTag implements LangNeutral {
	readonly nodeKind = 'api';

	/**
	 *
	 * @param document
	 * @param typeResolver
	 * @param json
	 */
	constructor(
		readonly document: TargetOpenAPI.Document,
		typeResolver: TypeSchemaResolver,
		json: Omit<ApiTagJson, 'nodeKind'>
	) {
		this.location = json.location;
		lodashSet(this.document, this.location.concat('$ast'), this);
		this.methods = json.methods.map(m => new MethodOperation(this.document, typeResolver, m));
	}

	readonly location: ReadonlyArray<string>;
	readonly methods: MethodOperation[];

	/**
	 * Return the underlying OpenApi Element.
	 */
	get oae(): OpenAPITagObject {
		return lodashGet(this.document, this.location);
	}

	getIdentifier(type: 'intf' | 'impl' | 'hndl'): string {
		switch (type) {
			case 'intf':
				return codeGenConfig.toIntfName(this.oae.name, 'api');
			case 'impl':
				return codeGenConfig.toImplName(this.oae.name, 'api');
			case 'hndl':
				return codeGenConfig.toHndlName(this.oae.name);
		}
	}

	getFilepath(type: 'intf' | 'impl' | 'hndl'): string {
		switch (type) {
			case 'intf':
				return path.join(codeGenConfig.apiIntfDir, codeGenConfig.toIntfFileBasename(this.oae.name, 'api'));
			case 'impl':
				return path.join(codeGenConfig.apiImplDir, codeGenConfig.toImplFileBasename(this.oae.name, 'api'));
			case 'hndl':
				return path.join(codeGenConfig.apiHndlDir, codeGenConfig.toHndlFileBasename(this.oae.name));
		}
	}

	toJSON() {
		return {
			nodeKind: this.nodeKind,
			location: this.location.slice(0),
			methods: this.methods.map(m => m.toJSON())
		};
	}
}
