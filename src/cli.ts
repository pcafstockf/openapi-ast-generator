/**
 * This is the nodejs entry point.
 * NOTE:
 *
 *      This configuration will result in a synchronous object, but by
 */
import yargs, {Options} from 'yargs';
import {CLIOptionsDefinition, CLIOptionsType, generate, prepare, validateArgs} from './main';

function defineNodeCli(baseArgs: string[]) {
	// yargs can return an object, *OR* a Promise for an object.
	// So, wrapping it in a Promise.resolve, ensures we get good typing and easy support for async init and run.
	return Promise.resolve<CLIOptionsType>(yargs(baseArgs)
		.usage('Usage: $0 <command> [options]')
		.options(CLIOptionsDefinition as any as { [key: string]: Options })
		.strict(true)
		.help('h')
		.alias('h', 'help')
		.version(process.env.OAG_VERSION ?? 'un-released') // Don't stress, our release will be webpacked and this will become a constant at that time.
		.wrap(yargs.terminalWidth())
		.check(args => validateArgs(args as any))
		.argv as any);
}

defineNodeCli(process.argv.slice(2)).then((args) => {
	return prepare(args);
}).then((rp) => {
	return generate(rp);
}).catch((err) => {
	console.error(err);
});
