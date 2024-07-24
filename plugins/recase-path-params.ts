import {camelCase as lodashCamelCase, snakeCase as lodashSnakeCase} from 'lodash';
import {OpenAPIV3, OpenAPIV3_1} from 'openapi-types';

type RefResolverFn<T = any> = (obj: any) => { obj: T, ref?: string };

export class UriRepair {
	public constructor(protected altVarcharRe?: RegExp, protected replacer?: (s: string) => string) {
	}

	public parse(input: string) {
		const parts = [];
		let openBrace = input.indexOf('{');
		while (openBrace >= 0) {
			const literal = input.substring(0, openBrace);
			if (literal)
				parts.push(literal);
			const exp = this.expression(input.slice(openBrace));
			if (!exp)   // If we had an opening brace and ultimately could not parse an expression, this whole uri is invalid.
				return null;
			input = exp.rest;
			delete exp.rest;
			parts.push(exp);
			openBrace = input.indexOf('{');
		}
		if (input) {
			if (input.lastIndexOf('}') >= 0) // There is an un-opened expression closure (escapes are not allowed).
				return null;
			parts.push(input);
		}
		return parts;
	}

	public rebuild(ast: any[]) {
		let retVal = {
			uri: '',
			varMap: {} as Record<string, string>
		};
		retVal.uri = ast.reduce((p, v) => {
			if (typeof v === 'string')
				p += v;
			else {
				p += '{';
				p += v.operator ?? '';
				p += v.variables.reduce((p, v, i) => {
					if (i > 0)
						p += ',';
					p += v.varname.varchars.reduce((p, v, i) => {
						if (i > 0)
							p += '.';
						if (v.invalid)
							retVal.varMap[v.invalid] = v.varchar;
						p += v.varchar;
						return p;
					}, '');
					if (v.modifier?.type === 'prefix')
						p += `:${v.modifier.length}`;
					else if (v.modifier?.type === 'explode')
						p += `*`;
					return p;
				}, '');
				p += '}';
			}
			return p;
		}, '');
		return retVal;
	}

	protected expression(input: string) {
		const match = input.match(/^\{([^}]*)}/);
		if (!match)
			return null;
		let expr = match[1];
		const operator = this.operator(expr);
		if (operator) {
			expr = operator.rest;
			delete operator.rest;
		}
		const variableList = this.variableList(expr);
		if (!variableList)
			return null;
		return {operator: (operator as any)?.value, variables: variableList.variables, rest: variableList.rest + input.slice(match[0].length)};
	}

	protected operator(input: string) {
		let match = input.match(/^\+|^#|^\.|^\/|^;|^\?|^&/);
		if (!match) {
			match = input.match(/^=|^,|^!|^@|^\|/);
			if (match)
				return {reserved: match[0], rest: input.slice(match[0].length)};
			return null;
		}
		return {value: match[0], rest: input.slice(match[0].length)};
	}

	protected variableList(input: string) {
		const vars = [];
		while (input) {
			const varspec = this.varspec(input);
			if (!varspec)
				break;
			vars.push(varspec);
			input = varspec.rest;
			delete varspec.rest;
			if (input.startsWith(','))
				input = input.slice(1);
			else
				break;
		}
		return vars.length ? {variables: vars, rest: input} : null;
	}

	protected varspec(input: string) {
		const varname = this.varname(input);
		if (!varname)
			return null;
		input = varname.rest;
		delete varname.rest;
		let modifier = this.modifierLevel4(input);
		if (modifier) {
			input = modifier.rest;
			delete modifier.rest;
		}
		return {varname: varname, modifier: modifier, rest: input};
	}

	protected varname(input: string) {
		let segments = [];
		while (true) {
			const segment = this.varchar(input);
			if (!segment)
				break;
			segments.push(segment);
			input = segment.rest;
			delete segment.rest;
			if (input.startsWith('.'))
				input = input.slice(1);
			else
				break;
		}
		if (segments.length === 0)
			return null;
		return {varchars: segments, rest: input};
	}

	protected varchar(input: string) {
		let match = input.match(this.altVarcharRe ?? /^(?:%[0-9A-Fa-f]{2}|[A-Za-z0-9_])+/);
		if (!match)
			return null;
		const varchar = match[0];
		// If the *entire* match of the alt does not match the spec, then the varchar was invalid.
		if (this.altVarcharRe && this.replacer && !/^(?:%[0-9A-Fa-f]{2}|[A-Za-z0-9_])+$/.test(varchar))
			return {varchar: this.replacer(varchar), invalid: varchar, rest: input.slice(match[0].length)};
		return {varchar: match[0], rest: input.slice(match[0].length)};
	}

	protected modifierLevel4(input: string) {
		const prefix = this.prefix(input);
		if (prefix)
			return prefix;
		const explode = this.explode(input);
		if (explode)
			return explode;
		return null;
	}

	protected prefix(input: string) {
		let match = input.match(/^:([1-9][0-9]{0,3})/);
		if (!match)
			return null;
		return {type: 'prefix', length: parseInt(match[1], 10), rest: input.slice(match[0].length)};
	}

	protected explode(input: string) {
		if (input.startsWith('*'))
			return {type: 'explode', rest: input.slice(1)};
		return null;
	}
}

const httpMethods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];

export default function recasePathParams(doc: OpenAPIV3.Document | OpenAPIV3_1.Document, refResolver: RefResolverFn, cmdArgs: Record<string, any>, codeGenConfig: any): Promise<void> {
	// By default, we convert the occasionally seen chars ('-:&@~' which are not valid in a URI-Template), using lodash snake_case
	let varcharRe = /^(?:%[0-9A-Fa-f]{2}|[-:&@~A-Za-z0-9_])+$/;
	let replacer = lodashSnakeCase;
	if (codeGenConfig.plugins?.recase) {
		if (codeGenConfig.plugins.recase.varcharRe)
			varcharRe = new RegExp(codeGenConfig.plugins.recase.varcharRe);
		if (codeGenConfig.plugins.recase.casing === 'camel')
			replacer = lodashCamelCase;
	}
	const parser = new UriRepair(varcharRe, replacer);
	let pathRepairs: Record<string, string> = {};
	for (let upath in doc.paths) {
		upath = refResolver(upath).obj;
		const ast = parser.parse(upath);
		const rebuild = parser.rebuild(ast);
		if (rebuild.uri !== upath) {
			// For pointer replacement purposes, make sure we find potential variants of the path.
			const oldPath = `#/paths/${upath.replace(/~/g, '~0').replace(/\//g, '~1')}`;
			// encode and escape the search/replace keys now. (we would decode with decodeURIComponent(s).replace(/~1/g, '/').replace(/~0/g, '~')
			const encOldPath = `#/paths/${encodeURIComponent(upath.replace(/~/g, '~0').replace(/\//g, '~1'))}`;
			// My reading of the spec says we do not need to uri encode, but AJV disagrees.
			// Keep in mind here that the 'segment' is a full uri-path, so there should be no '/' in the segment (hence the ~ escapes).
			const newPath = `#/paths/${encodeURIComponent(rebuild.uri.replace(/~/g, '~0').replace(/\//g, '~1'))}`;
			pathRepairs[oldPath] = newPath;
			pathRepairs[encOldPath] = newPath;
			doc.paths[rebuild.uri] = doc.paths[upath];
			delete doc.paths[upath];
			const pio = (refResolver as RefResolverFn<OpenAPIV3.PathItemObject | OpenAPIV3.PathItemObject>)(doc.paths[rebuild.uri]).obj;
			// We can have "uri" scoped params.
			pio.parameters?.forEach(p => {
				const param = (refResolver as RefResolverFn<OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject>)(p).obj;
				if (rebuild.varMap[param.name])
					param.name = rebuild.varMap[param.name];
			});
			// But more likely we have http method scoped params.
			Object.keys(pio).filter(k => httpMethods.indexOf(k.toUpperCase()) >= 0).forEach(method => {
				const op = (refResolver as RefResolverFn<OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject>)(pio[method]).obj;
				op.parameters?.forEach(p => {
					const param = (refResolver as RefResolverFn<OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject>)(p).obj;
					if (rebuild.varMap[param.name])
						param.name = rebuild.varMap[param.name];
				});
			});
		}
	}

	// We have fixed all the paths, but there could well be pointers in the doc that reference those paths, and they need to be updated too.
	const oldPaths = Object.keys(pathRepairs);
	function rewriteRefs(obj) {
		if (typeof obj === 'object' && obj !== null) {
			if (obj.$ref) {
				const oldPath = oldPaths.find(p => obj.$ref === p || obj.$ref.startsWith(p + '/'));
				if (oldPath)
					obj.$ref = pathRepairs[oldPath] + obj.$ref.slice(oldPath.length);
			}
			for (const key of Object.keys(obj))
				rewriteRefs(obj[key]);
		}
	}
	rewriteRefs(doc);

	return Promise.resolve();
};
