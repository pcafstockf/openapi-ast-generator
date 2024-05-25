import {lstatSync, PathLike, Stats} from 'fs';
import {transform as lodashTransform, omit as lodashOmit} from 'lodash';


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
