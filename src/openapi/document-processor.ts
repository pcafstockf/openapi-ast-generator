import SwaggerParser from '@apidevtools/swagger-parser';
import {map as asyncMap} from 'async';
import * as fs from 'fs';
import {mergeWith as lodashMergeWith, set as lodashSet, union as lodashUnion} from 'lodash';
import {OpenAPI} from 'openapi-types';
import {parse as json5Parse} from 'json5';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {safeLStatSync} from '../shared';
import {hoistNamedObjectSchemas, initResolver, resolveTopLevelAliases, uplevelPaths} from './openapi-utils';

export class OpenApiInputProcessor {
	constructor() {
	}

	async optimize(location: string | string[], strict?: boolean, elevate?: boolean, envVars?: string[]): Promise<TargetOpenAPI.Document> {
		let doc: TargetOpenAPI.Document;
		let enforceStrict = strict;
		const parser = new SwaggerParser();
		if (Array.isArray(location)) {
			const docs = await asyncMap(location, async (loc) => {
				try {
					const p = new SwaggerParser();
					if (strict)
						await p.validate(loc);
					const doc = await p.parse(loc);
					return doc;
				}
				catch(e:any) {
					if (e instanceof SyntaxError && safeLStatSync(loc)) {
						const content = await fs.promises.readFile(loc);
						doc = json5Parse(content.toString('utf8'));
						if (Object.keys(doc).length > 0) {
							enforceStrict = true;  // It wasn't valid, but we need to make sure
							return doc;
						}
					}
					throw e;
				}
			});

			// Use the merging algorithm from dyflex-config to support union and replacement merging.
			const deletes: (() => void)[] = [];
			const obj = docs.slice(1).reduce((p, v) => {
				return lodashMergeWith(p, v, (objValue, srcValue, key, object) => {
					if (key?.startsWith('!')) {
						deletes.push(() => {
							delete object[key];
						});
						object[key.substring(1)] = srcValue;
					}
					else if (Array.isArray(objValue))
						return lodashUnion(objValue, srcValue);
					return undefined;
				});
			}, docs[0] as OpenAPI.Document);
			deletes.forEach(d => d());

			// Just be sure we ended up with a valid doc!
			if (enforceStrict)
				await parser.validate(obj);
			doc = (await parser.bundle(obj)) as TargetOpenAPI.Document;
		}
		else {
			if (strict)
				await parser.validate(location);
			doc = (await parser.bundle(location)) as TargetOpenAPI.Document;
		}
		initResolver(parser);
		uplevelPaths(doc);
		if (elevate)
			hoistNamedObjectSchemas(doc);

		if (Array.isArray(envVars))
			envVars.forEach(d => lodashSet(doc, d, undefined));

		return doc;
	}

	async internalize(origin: string, doc: TargetOpenAPI.Document): Promise<TargetOpenAPI.Document> {
		try {
			let url = new URL(origin);
			if (url.protocol === 'http:' || url.protocol == 'https:') {
				// We retrieved the spec from a remote server, so patch up any servers with relative path URL's
				doc.servers?.filter(s => !!s.url).forEach((s) => {
					if (s.url.startsWith('/'))
						s.url = url.origin + s.url;
				});
			}
		}
		catch (err) {
			// Failure is okay.
		}
		finally {
		}

		resolveTopLevelAliases(doc);

		return doc;
	}
}
