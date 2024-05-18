import {get as lodashGet} from 'lodash';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {ApiTag, ApiTagJson} from './api-tag';
import {LanguageNeutralBase} from './base';
import {LanguageNeutralDocument} from './generator';
import {TypeSchemaJson} from './type-schema';

export interface LanguageNeutralJson {
	apis: ApiTagJson[],
	types: TypeSchemaJson[]
}

export class LanguageNeutralHydrator extends LanguageNeutralBase {
	hydrate(doc: TargetOpenAPI.Document, json: LanguageNeutralJson): LanguageNeutralDocument {
		this.oaDoc = doc;
		this.lnDoc = {
			apis: [],
			types: []
		};
		json.types.forEach(obj => {
			this.resolveTypeSchema(lodashGet(this.oaDoc, obj.location));
		});
		json.apis.forEach(obj => {
			this.lnDoc.apis.push(new ApiTag(this.oaDoc, (s, l) => {
				return this.resolveTypeSchema(s, l);
			}, obj));
		});
		return this.lnDoc;
	}
}
