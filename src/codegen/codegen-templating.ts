import async from 'async';
import * as fs from 'fs';
import {MakeDirectoryOptions} from 'fs';
import lodash from 'lodash';
import os from 'node:os';
import path from 'node:path';
import {inspect} from 'util';
import {resolveIfRef} from '../openapi/openapi-utils';
import {interpolateBashStyle, safeLStatSync} from '../shared';
import {CodeGenConfig} from './codegen-config';
import * as nameUtils from './name-utils';

const OutDir = Symbol('OutDir');
const FullOutDir = Symbol('FullOutDir');

// noinspection JSUnusedGlobalSymbols
export class EjsTemplateEngine {
	constructor(protected readonly config: CodeGenConfig, outDir: string, libs: string[]) {
		// Done as symbols so that we have them, but they don't copy over when we make a shallow copy of ourselves for EJS.
		this[OutDir] = outDir;
		this[FullOutDir] = path.resolve(outDir);
		this.libs = {};
		libs?.forEach((v) => {
			let kvp = v.trim().split('=');
			lodash.set(this.libs, kvp[0], require(kvp[1]));
		});
		(this.libs as any).async = async;
		(this.libs as any).lodash = lodash;
	}

	libs: Record<string, string>;

	ifval = (prefix?: string, value?: string, suffix?: string): string | null => {
		// Add prefix and suffix as needed.
		function oneLine(v: string) {
			let result = v;
			if (prefix)
				result = prefix + result;
			if (suffix)
				result += suffix;
			return result + os.EOL;
		}

		// Ensure we have OS appropriate line endings.  Also, if this is a multi-line value, ensure we prefix (suffix) each line.
		function process(v: string) {
			const norm = v.split(/\r\n|\r|\n/g).join(os.EOL).trim();
			const lines = norm.split(os.EOL);
			if (lines.length > 1)
				return lines.map(l => oneLine(l)).join('');
			return oneLine(norm);
		}

		if (typeof value === 'string')
			return process(value);
		else if (value && Array.isArray(value) && (value as []).every(e => typeof e === 'string'))
			return (value as string[]).map(v => process(v)).join('');
		return null;
	};
	interpolate = interpolateBashStyle;
	inspect = inspect;
	naming = nameUtils;
	os = {
		EOL: os.EOL
	};
	path = {
		sep: path.sep,
		delimiter: path.delimiter,
		basename: path.basename,
		join: path.join,
		normalize: path.normalize,
		dirname: path.dirname,
		extname: path.extname,
		format: path.format,
		isAbsolute: path.isAbsolute,
		// The purpose of this method is to ensure the templates do not attempt to read or write outside the output directory.
		relative: (from: string, to: string) => {
			if (from === null)
				from = '';
			if (to === null)
				to = '';
			if (path.isAbsolute(from))
				throw new Error('Invalid relative "from" path: ' + from);
			if (path.isAbsolute(to))
				throw new Error('Invalid relative "to" path: ' + to);
			const prev = process.cwd();
			try {
				process.chdir(this[FullOutDir]);
				const retVal = path.relative(from, to);
				const fullPath = path.resolve(path.join(this[FullOutDir], from, retVal));
				if (!fullPath.startsWith(this[FullOutDir]))
					throw new Error('Invalid relative paths: {from:' + from + ', to: ' + to + '}');
				return retVal;
			}
			finally {
				try {
					process.chdir(prev);
				}
				catch (err) {
					process.exit(9);    // It is a fatal error if we can't restore back to whatever the cwd was.
				}
			}
		}
	};

	fsExists = (filePath: string) => {
		while (path.isAbsolute(filePath))
			filePath = filePath.substring(1);
		if (!filePath)
			return undefined;
		const fullPath = path.resolve(path.join(this[OutDir], filePath));
		if (!fullPath.startsWith(this[FullOutDir]))
			return undefined;
		return safeLStatSync(fullPath);
	};
	readFile = (filePath: string) => {
		while (path.isAbsolute(filePath))
			filePath = filePath.substring(1);
		if (!filePath)
			return Promise.reject('Invalid filepath');
		const fullPath = path.resolve(path.join(this[OutDir], filePath));
		if (!fullPath.startsWith(this[FullOutDir]))
			return undefined;
		return fs.promises.readFile(fullPath, 'utf8');
	};
	writeFile = (filePath: string, content: string) => {
		while (path.isAbsolute(filePath))
			filePath = filePath.substring(1);
		if (!filePath)
			return Promise.reject('Invalid filepath');
		const fullPath = path.resolve(path.join(this[OutDir], filePath));
		if (!fullPath.startsWith(this[FullOutDir]))
			return undefined;
		return fs.promises.writeFile(fullPath, content, 'utf8');
	};
	mkdir = (dirPath: string, opts?: MakeDirectoryOptions) => {
		while (path.isAbsolute(dirPath))
			dirPath = dirPath.substring(1);
		if (!dirPath)
			return Promise.reject('Invalid directory path');
		const fullPath = path.resolve(path.join(this[OutDir], dirPath));
		if (!fullPath.startsWith(this[FullOutDir]))
			return Promise.reject('Invalid directory path');
		if (fs.existsSync(fullPath))
			return Promise.resolve(fullPath);
		return fs.promises.mkdir(fullPath, Object.assign(opts || {}, {recursive: true}));
	};
	resolveIfRef = resolveIfRef;
}
