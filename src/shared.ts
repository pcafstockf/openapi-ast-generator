import {lstatSync, PathLike, Stats} from 'fs';


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
