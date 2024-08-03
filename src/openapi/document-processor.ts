import SwaggerParser from '@apidevtools/swagger-parser';
import {mapSeries as asyncMapSeries} from 'async';
import * as fs from 'fs';
import {mergeWith as lodashMergeWith, set as lodashSet, unionWith as lodashUnionWith, isEqual as lodashIsEqual, merge as lodashMerge} from 'lodash';
import constants from 'node:constants';
import path from 'node:path';
import {OpenAPI} from 'openapi-types';
import {parse as json5Parse} from 'json5';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {isFileSystemPath, safeLStatSync} from '../shared';
import {hoistNamedObjectSchemas, initResolver, uplevelPaths} from './openapi-utils';

export class OpenApiInputProcessor {
	constructor() {
	}

	async merge(location: string | string[], strict?: boolean, envVars?: string[]): Promise<TargetOpenAPI.Document> {
		let doc: TargetOpenAPI.Document;
		const parser = new SwaggerParser();
		if (Array.isArray(location)) {
			const cwd = process.cwd();
			const docs = await asyncMapSeries(location, async (loc) => {
				try {
					const p = new SwaggerParser();
					const isLocalFile = await isFileSystemPath(loc);
					if (isLocalFile) {
						loc = path.resolve(loc);
						process.chdir(path.dirname(loc));
					}
					try {
						return await p.parse(loc).then(d => p.bundle(d));
					}
					finally {
						process.chdir(cwd);
					}
				}
				catch (e: any) {
					process.chdir(cwd);
					if ((e instanceof SyntaxError || e.errno === -constants.ENOENT) && safeLStatSync(loc)) {
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
					if (object[srcValue])
						lodashMergeWith(object[srcValue], object[key.substring(1)], mergerFn);
					else if (object[key.substring(1)])
						object[srcValue] = object[key.substring(1)];
					deletes.push(() => {
						delete object[key];
						delete object[key.substring(1)];
					});
				}
				else if (Array.isArray(srcValue)) {
					// Arrays starting with
					//  '~' will be replaced (see above).
					//  '%' will follow lodash merge semantics where elements at objValue[n] are replaced by elements at srcValue[n].
					//  Otherwise arrays will merged with union semantics.
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
		else {
			const cwd = process.cwd();
			const isLocalFile = await isFileSystemPath(location);
			if (isLocalFile) {
				location = path.resolve(location);
				process.chdir(path.dirname(location));
			}
			try {
				doc = (await parser.parse(location).then((d) => parser.bundle(d))) as TargetOpenAPI.Document;
			}
			finally {
				process.chdir(cwd);
			}
		}

		if (Array.isArray(envVars))
			envVars.forEach(d => lodashSet(doc, d, undefined));

		const r = await parser.resolve(doc);
		initResolver(r);
		return doc as TargetOpenAPI.Document;
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
