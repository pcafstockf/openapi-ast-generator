/**
 * This module should be all a GrailsVM would need to invoke one of the builtin generators for TypeScript client or server.
 * Anything that would *only* work under Node.js should be in the cli.ts file.
 */
import {lstatSync, mkdirSync, readFileSync, rmSync as rimrafSync, Stats} from 'fs';
import {writeFile} from 'fs/promises';
import {parse as json5Parse} from 'json5';
import lodash from 'lodash';
import path from 'node:path';
import unquotedValidator from 'unquoted-property-validator';
import {Options} from 'yargs';
import {CodeGenConfig, makeCodeGenConfig} from './codegen/codegen-config';
import {LanguageNeutralGenerator} from './lang-neutral/generator';
import {OpenApiInputProcessor} from './openapi/document-processor';
import './openapi/jsrp-patch';
import {resolveIfRef} from './openapi/openapi-utils';
import {safeLStatSync} from './shared';
import {TsMorphGenerator} from './ts-morph/generator';
import {TsClientGenerator} from './typescript/client/client-generator';
import {TsServerGenerator} from './typescript/server/server-generator';

declare global {
	// noinspection ES6ConvertVarToLetConst
	var codeGenConfig: CodeGenConfig;
}

interface CLIOptionsBase<IN, ROLE, OUT, DELETE, CONFIG, STRICT, MERGE, TRANSFORM, BUNDLE, PROP, ELEVATE, EXCLUDE, VERBOSE> {
	/**
	 * OpenAPI input document (file or url)
	 */
	i: IN,
	/**
	 * Are we generating client code, or server code.
	 */
	r: ROLE,
	/**
	 * Directory for output of generated code.
	 */
	o: OUT,
	/**
	 * Delete the entire contents of the output directory before generating code
	 */
	d: DELETE,
	/**
	 * JSON file containing commands and config overrides
	 */
	c: CONFIG,
	/**
	 * Validate OpenAPI input document(s)
	 */
	s: STRICT,
	/**
	 * Merge additional (syntactically valid) yaml/json files into the input file.
	 */
	m: MERGE,
	/**
	 * One or more standalone JavaScript plugins to perform transformations on the document.
	 * This code runs just before the bundle would be written to disk, and before any code generation begins.
	 */
	t: TRANSFORM,
	/**
	 * Write a single JSON schema with all references fully internalized
	 */
	b: BUNDLE,
	/**
	 * Key/Value of a property to be specified or overridden
	 */
	p: PROP,
	/**
	 * If set, inline object schema will be elevated to global components
	 */
	e: ELEVATE,
	/**
	 * Remove the specified dotted path element of the parsed document before bundling and/or code generation
	 */
	X: EXCLUDE,
	/**
	 * Provide progress and diagnostic output
	 */
	v: VERBOSE
}

// First make them all optional, then below we will add back the two we absolutely require.
type PartialCLIOptionsType = Partial<CLIOptionsBase<string, string, string, string, string, boolean, string[], string[], string, string[], boolean, string[], boolean>>;

/**
 * The actual (language neutral) interface of all the cli options for the generator.
 */
export type CLIOptionsType = PartialCLIOptionsType & Required<Pick<PartialCLIOptionsType, 'i' | 'o'>>;

/**
 * Defined as a yargs compatible structure, this constant should be parsable by other (non-node) environments to their own native argument parsing library.
 */
export const CLIOptionsDefinition = <CLIOptionsBase<Options, Options, Options, Options, Options, Options, Options, Options, Options, Options, Options, Options, Options>>{
	i: {alias: 'in', normalize: true, type: 'string', nargs: 1, identifier: 'OpenAPI description'},
	r: {alias: 'role', type: 'string', string: true, number: false, choices: ['client', 'server'], identifier: 'Generated code is calling, or providing an API'},
	o: {alias: 'out', normalize: true, type: 'string', nargs: 1, identifier: 'Directory for output of generated code.'},
	d: {alias: 'delete', type: 'string', string: true, number: false, choices: ['all', 'gen'], identifier: 'Delete all files (support, server impl, etc.) or only model/api'},
	c: {alias: 'config', normalize: true, type: 'string', nargs: 1, identifier: 'JSON file containing commands and config overrides'},
	s: {alias: 'strict', normalize: true, type: 'boolean', identifier: 'Validate OpenAPI input document(s)'},
	m: {alias: 'merge', normalize: true, type: 'array', nargs: 1, string: true, number: false, identifier: 'Merge additional (syntactically valid) yaml/json files into the input file.'},
	t: {alias: 'transform', normalize: true, type: 'array', nargs: 1, string: true, number: false, identifier: 'JavaScript plugin for specification transformation.'},
	b: {alias: 'bundle', normalize: true, type: 'string', nargs: 1, identifier: 'Write a single JSON schema with all references fully internalized'},
	p: {alias: 'prop', type: 'array', nargs: 1, string: true, number: false, identifier: 'Key/Value of a property to be specified or overridden'},
	e: {alias: 'elevate', type: 'boolean', string: false, number: false, identifier: 'If set, inline object schema will be elevated to global components'},
	X: {alias: 'exclude', type: 'array', nargs: 1, string: true, number: false, identifier: 'Remove the specified dotted path element of the parsed document before bundling and/or code generation'},
	v: {alias: 'verbose', type: 'boolean', string: false, number: false, identifier: 'If set, verbose progresses and diagnostic info will be output'},
};

function resolveConfiguration(args: CLIOptionsType): { cmdLine: CLIOptionsType, codeGenConfig?: CodeGenConfig } {
	if (args.c) {
		const stat = safeLStatSync(args.c);
		if (!stat?.isFile())
			throw new Error('Invalid config override file: ' + args.c);
		const configTxt = readFileSync(args.c, 'utf8');
		const config = json5Parse(configTxt);
		const mergedArgs = lodash.merge(config.cmdline ?? {}, args);
		if (!mergedArgs.d)
			mergedArgs.d = 'gen';
		return {cmdLine: mergedArgs, codeGenConfig: config.codeGenConfig};
	}
	return {cmdLine: args};
}

export function validateArgs(args: CLIOptionsType) {
	let stat: Stats = undefined as any;
	let config = resolveConfiguration(args);

	function validateInputLocation(loc: string) {
		if (!loc)
			throw new Error('Input file must be specified');
		try {
			let url = new URL(loc);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') {
				// noinspection ExceptionCaughtLocallyJS
				throw new Error('NOT-URL');
			}
		}
		catch (err) {
			stat = lstatSync(loc);
		}
		if (stat && !stat?.isFile())
			throw new Error('Input must be a specification file: ' + loc);
	}

	validateInputLocation(config.cmdLine.i);
	if (typeof config.cmdLine.m === 'string' && config.cmdLine.m)
		config.cmdLine.m = [config.cmdLine.m];
	if (Array.isArray(config.cmdLine.m))
		config.cmdLine.m.forEach(validateInputLocation);

	if (!config.cmdLine.o)
		throw new Error('Output directory must be provided');
	stat = safeLStatSync(config.cmdLine.o);
	if (!stat) {
		mkdirSync(config.cmdLine.o, {recursive: true});
		stat = lstatSync(config.cmdLine.o);
		delete config.cmdLine.d;   // Don't delete twice if we just created it.
	}
	if (!stat?.isDirectory()) {
		throw new Error('Invalid output directory: ' + config.cmdLine.o);
	}
	let plugins = config.cmdLine.t;
	if (plugins && typeof plugins === 'string')
		plugins = [plugins];
	if (Array.isArray(plugins))
		plugins.map(t => path.resolve(process.cwd(), t)).forEach(t => lstatSync(t));

	if (config.cmdLine.p) {
		config.cmdLine.p.forEach((v) => {
			let kvp = v.trim().split('=');
			if (kvp.length !== 2 || (!kvp[0].trim() || (!kvp[1].trim())))
				throw new Error('Invalid property definition: ' + v);
			const valid = kvp[0].trim().split('.').every((v) => {
				const m = /^(.*)(\[\d+])?$/.exec(v);
				if (m) {
					if (m[1]) {
						let result = unquotedValidator(m[1]);
						if ((!result) || result.needsBrackets || result.needsQuotes)
							return false;
					}
					return true;
				}
				return false;
			});
			if (!valid)
				throw new Error('Invalid property key: ' + v);
		});
	}
	return true;
}

export async function prepare(args: CLIOptionsType) {
	if (args.v)
		console.info('Analyzing...');
	// Build up the configuration.
	let config = resolveConfiguration(args);
	if (typeof config.cmdLine.m === 'string' && config.cmdLine.m)
		config.cmdLine.m = [config.cmdLine.m];
	globalThis.codeGenConfig = makeCodeGenConfig(config.codeGenConfig);
	if (config.cmdLine.r === 'server')
		globalThis.codeGenConfig.role = config.cmdLine.r;
	else if (config.cmdLine.r === 'client')
		globalThis.codeGenConfig.role = config.cmdLine.r;
	if (config.cmdLine.p)
		globalThis.codeGenConfig.loadConfigArgs(config.cmdLine.p);
	globalThis.codeGenConfig.outputDirectory = path.resolve(config.cmdLine.o);

	// Clean up anything previously generated (if requested to do so).
	if (config.cmdLine.d === 'all')
		rimrafSync(config.cmdLine.o, {recursive: true, force: true});
	else if (config.cmdLine.d) {
		if (globalThis.codeGenConfig.modelIntfDir)
			rimrafSync(path.join(config.cmdLine.o, globalThis.codeGenConfig.modelIntfDir), {recursive: true, force: true});
		if (globalThis.codeGenConfig.modelImplDir)
			rimrafSync(path.join(config.cmdLine.o, globalThis.codeGenConfig.modelImplDir), {recursive: true, force: true});
		if (globalThis.codeGenConfig.modelPrivDir)
			rimrafSync(path.join(config.cmdLine.o, globalThis.codeGenConfig.modelPrivDir), {recursive: true, force: true});
		if (globalThis.codeGenConfig.apiIntfDir)
			rimrafSync(path.join(config.cmdLine.o, globalThis.codeGenConfig.apiIntfDir), {recursive: true, force: true});
		if (globalThis.codeGenConfig.role !== 'server' && globalThis.codeGenConfig.apiImplDir)
			rimrafSync(path.join(config.cmdLine.o, globalThis.codeGenConfig.apiImplDir), {recursive: true, force: true});
		if (globalThis.codeGenConfig.apiPrivDir)
			rimrafSync(path.join(config.cmdLine.o, globalThis.codeGenConfig.apiPrivDir), {recursive: true, force: true});
		if (globalThis.codeGenConfig.apiHndlDir)
			rimrafSync(path.join(config.cmdLine.o, globalThis.codeGenConfig.apiHndlDir), {recursive: true, force: true});
	}

	// Build and optimize the input document.
	const docProcessor = new OpenApiInputProcessor();
	let doc = await docProcessor.optimize(config.cmdLine.m?.length > 0 ? [config.cmdLine.i].concat(...config.cmdLine.m) : config.cmdLine.i, config.cmdLine.s, config.cmdLine.e, config.cmdLine.X);
	// Allow any custom transformers a crack at the bundle before we write it out.
	let plugins = config.cmdLine.t;
	if (plugins && typeof plugins === 'string')
		plugins = [plugins];
	if (Array.isArray(plugins)) {
		for (let fp of plugins) {
			const txFn = require(path.resolve(process.cwd(), fp)).default;
			const result = await txFn(doc, resolveIfRef, config.cmdLine, globalThis.codeGenConfig);
			if (result)
				doc = result;
		}
	}
	// Write the bundle.
	if (config.cmdLine.b) {
		if (!safeLStatSync(path.dirname(config.cmdLine.b)))
			mkdirSync(path.dirname(config.cmdLine.b), {recursive: true});
		await writeFile(config.cmdLine.b, JSON.stringify(doc), 'utf8');
	}

	// Now prepare the document for code generation.
	doc = await docProcessor.internalize(config.cmdLine.i, doc);

	//FUTURE: This is where we would determine which transformer and generator to use if we support new code targets.
	const generator = new LanguageNeutralGenerator();

	return {generator, doc, args: config.cmdLine};
}

export async function generate(rp) {
	if (rp.args.v)
		console.info('Transforming...');
	let astNodes = rp.generator.generate(rp.doc);
	// astNodes.apis.forEach(n => {
	// 	console.log(util.inspect(n.toJSON(), true, 1000));
	// })
	if (rp.args.v)
		console.info('Generating...');
	const tsGen = new TsMorphGenerator();
	const proj = tsGen.generate(astNodes);

	const codeGen = globalThis.codeGenConfig.role === 'client' ? new TsClientGenerator() : new TsServerGenerator();
	const codeProj = codeGen.generate(proj);

	if (rp.args.v)
		console.info('Writing...');
	for (const file of codeProj.getSourceFiles()) {
		// console.log(util.inspect(JSON.parse(JSON.stringify(file.getStructure())), false, null));
		// console.log(file.getFullText());
		const fp = file.getFilePath();
		const parentDir = path.dirname(fp);
		let stat = safeLStatSync(parentDir);
		if (!stat) {
			mkdirSync(parentDir, {recursive: true});
			stat = lstatSync(parentDir);
		}
		if (!stat.isDirectory())
			throw new Error('Invalid output directory for generated file: ' + fp);
		await writeFile(file.getFilePath(), file.getFullText(), 'utf8');
	}
}
