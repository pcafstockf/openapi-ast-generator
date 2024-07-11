import SwaggerParser from '@apidevtools/swagger-parser';
import {map as asyncMap} from 'async';
import * as fs from 'fs';
import {mergeWith as lodashMergeWith, set as lodashSet, unionWith as lodashUnionWith, isEqual as lodashIsEqual, merge as lodashMerge} from 'lodash';
import {OpenAPI} from 'openapi-types';
import {parse as json5Parse} from 'json5';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {safeLStatSync} from '../shared';
import {hoistNamedObjectSchemas, initResolver, uplevelPaths} from './openapi-utils';

export class OpenApiInputProcessor {
	constructor() {
	}

	async merge(location: string | string[], strict?: boolean, envVars?: string[]): Promise<TargetOpenAPI.Document> {
		let doc: TargetOpenAPI.Document;
		const parser = new SwaggerParser();
		if (Array.isArray(location)) {
			const docs = await asyncMap(location, async (loc) => {
				try {
					const p = new SwaggerParser();
					// if (strict)
					// 	await p.validate(loc);
					return await p.parse(loc);
				}
				catch (e: any) {
					if (e instanceof SyntaxError && safeLStatSync(loc)) {
						const content = await fs.promises.readFile(loc);
						doc = json5Parse(content.toString('utf8'));
						if (Object.keys(doc).length > 0)
							return doc;
					}
					throw e;
				}
			});

			// Use the merging algorithm from dyflex-config to support union and replacement merging.
			let deletes: (() => void)[] = [];
			const mergerFn = (objValue, srcValue, key, object) => {
				if (key?.startsWith('!')) {
					deletes.push(() => {
						delete object[key];
					});
					if (srcValue === null)  // dyflex-config supports a null replacement, but that has no meaning in OpenAPI, so we leverage that to mean 'delete'.
						deletes.push(() => {
							delete object[key.substring(1)];
						});
					else
						object[key.substring(1)] = srcValue;
				}
				else if (key?.startsWith('~')) {
					if (object[srcValue]) {
						// deletes.forEach(d => d());
						lodashMergeWith(object[srcValue], object[key.substring(1)], mergerFn);
					}
					else if (object[key.substring(1)])
						object[srcValue] = object[key.substring(1)];
					deletes.push(() => {
						delete object[key];
						delete object[key.substring(1)];
					});
					// deletes.forEach(d => d());
				}
				else if (Array.isArray(srcValue)) {
					if (key?.startsWith('%')) {
						object[key.substring(1)] = lodashMerge(object[key.substring(1)], srcValue);
						deletes.push(() => {
							delete object[key];
						});
					}
					else
						return lodashUnionWith(objValue, srcValue, lodashIsEqual);
				}
				return undefined;
			};
			const obj = docs.slice(1).reduce((p, v) => {
				return lodashMergeWith(p, v, mergerFn);
			}, docs[0] as OpenAPI.Document);
			deletes.forEach(d => d());
			doc = (await parser.parse(obj)) as TargetOpenAPI.Document;
		}
		else
			doc = (await parser.parse(location)) as TargetOpenAPI.Document;

		if (Array.isArray(envVars))
			envVars.forEach(d => lodashSet(doc, d, undefined));

		return (await parser.bundle(doc).then(async (d) => {
			const r = await parser.resolve(doc);
			initResolver(r);
			return doc;
		})) as TargetOpenAPI.Document;
	}

	async optimize(doc: TargetOpenAPI.Document, origin: string, elevate: boolean): Promise<TargetOpenAPI.Document> {
		const parser = new SwaggerParser();
		initResolver(await parser.resolve(doc));
		Object.keys(doc.components.schemas).forEach(key => {
			if (!doc.components.schemas[key]['$ref'])
				if (!doc.components.schemas[key]['title'])
					if (!doc.components.schemas[key]['x-schema-name'])
						doc.components.schemas[key]['x-schema-name'] = key;
		});
		uplevelPaths(doc);
		if (elevate)
			hoistNamedObjectSchemas(doc, true);
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
		return doc;
	}

	/**
	 * Do NOT try to serialize the document returned by this call.
	 * This makes it easier for us to work without always checking for $ref.
	 * It also ensures we are generating off a valid specification.
	 */
	async internalize(doc: TargetOpenAPI.Document): Promise<TargetOpenAPI.Document> {
		// Just be sure we ended up with a valid doc!
		// More importantly, this removes all $ref to make it easier to find what we need, but at the same time does create potential circular refs.
		const parser = new SwaggerParser();
		return (await parser.validate(doc)) as TargetOpenAPI.Document;
	}
}
