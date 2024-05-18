import SwaggerParser from '@apidevtools/swagger-parser';
import {map as asyncMap} from 'async';
import {mergeWith as lodashMergeWith, set as lodashSet, union as lodashUnion} from 'lodash';
import {OpenAPI} from 'openapi-types';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {hoistNamedObjectSchemas, initResolver, resolveTopLevelAliases, uplevelPaths} from './openapi-utils';

export class OpenApiInputProcessor {
	constructor() {
	}

	async optimize(location: string | string[], strict?: boolean, elevate?: boolean, envVars?: string[]): Promise<TargetOpenAPI.Document> {
		let doc: TargetOpenAPI.Document;
		const parser = new SwaggerParser();
		if (Array.isArray(location)) {
			const docs = await asyncMap(location, async (loc) => {
				let p = new SwaggerParser();
				if (strict)
					await p.validate(loc);
				return p.parse(loc);
			});

			function arrayMerger(objValue, srcValue) {
				if (Array.isArray(objValue) && Array.isArray(srcValue))
					return lodashUnion(objValue, srcValue);
			}

			const obj = docs.slice(1).reduce((p, v) => {
				return lodashMergeWith(p, v, arrayMerger);
			}, docs[0] as OpenAPI.Document);
			// Just be sure we ended up with a valid doc!
			if (strict)
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
