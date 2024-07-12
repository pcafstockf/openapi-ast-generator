import {lstatSync, PathLike, Stats, constants} from 'node:fs';
import {access} from 'node:fs/promises';
import {transform as lodashTransform, omit as lodashOmit} from 'lodash';
import * as url from 'url';


/**
 * Same as JavaScript's template literals, but use #{} instead of ${}.
 * This is useful because it allows us to mix the two representations into the same string :-)
 */
export function interpolateBashStyle(tmplStr: string, data: any): string {
	return tmplStr?.replace(/#{(.*?)}/g, (_, g) => data[g]);
}

/**
 * Same as fs.lstatSync, but never throws.
 * Returns undefined on failure.
 */
export function safeLStatSync(path: PathLike): Stats {
	try {
		return lstatSync(path) as any;
	}
	catch {
		return undefined as any;
	}
}

/**
 * Clone an object deeply while omitting the specified properties from the clone.
 */
export function omitDeep<T extends object, K extends (string | number | symbol)>(obj: T, keysToOmit: K[]) {
	return lodashTransform(lodashOmit(obj, keysToOmit) as any, (result: Record<K, any>, value: any, key: K) => {
		if (value && typeof value === 'object') {
			if (Array.isArray(value))
				result[key] = value.map(v => {
					if (v && typeof v === 'object')
						return omitDeep(lodashOmit(v, keysToOmit), keysToOmit)
					return v;
				})
			else
				result[key] = omitDeep(lodashOmit(value, keysToOmit), keysToOmit);
		} else {
			result[key] = value;
		}
	}, {} as any) as T;
}

/**
 * Determines if the given path is a local filesystem path.
 */
export async function isFileSystemPath(inputPath: string) {
	// Parse the input path to check if it's a URL
	const parsedUrl = url.parse(inputPath);
	if (parsedUrl.protocol === 'file:')
		return true;
	// If it has a protocol and it's not file, it's not a filesystem path
	if (parsedUrl.protocol)
		return false;
	// If there's no protocol, check if the path exists on the filesystem
	try {
		await access(inputPath, constants.F_OK);
		return true;
	}
	catch (e) {
		return false;
	}
}
