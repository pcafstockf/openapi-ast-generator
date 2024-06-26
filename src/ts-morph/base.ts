import path from 'node:path';
import {FormatCodeSettings, MethodDeclaration, Node, SourceFile, VariableStatement} from 'ts-morph';
import {bindAst} from './ts-morph-ext';
import {ParameterParameter} from "../lang-neutral/parameter-parameter";

export const SourceCodeFormat: FormatCodeSettings = {
	tabSize: 4,
	indentSize: 4,
	indentStyle: 2, // IndentStyle.Smart,
	trimTrailingWhitespace: true,
	insertSpaceAfterCommaDelimiter: true,
	insertSpaceAfterSemicolonInForStatements: true,
	insertSpaceBeforeAndAfterBinaryOperators: true,
	insertSpaceAfterConstructor: true,
	insertSpaceAfterKeywordsInControlFlowStatements: true,
	insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
	insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: false,
	insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
	insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
	insertSpaceAfterTypeAssertion: true,
	insertSpaceBeforeFunctionParenthesis: false,
	placeOpenBraceOnNewLineForFunctions: false,
	placeOpenBraceOnNewLineForControlBlocks: false,
	insertSpaceBeforeTypeAnnotation: false,
	indentMultiLineObjectLiteralBeginningOnBlankLine: true,
	semicolons: 'insert' as any, // SemicolonPreference.Insert,
	ensureNewLineAtEndOfFile: true
};

export const TempFileName = '_$temp-File.ts';

/**
 * A variable we define within the body of a method to keep track of the content-type the body will submit, and the media-type(s) it will accept as a response.
 * Of course parameters that are sent in headers will also be added, but we use "code" to keep track of these two things in this phase.
 */
export const DefinedHdrsName = 'hdrs';

/**
 * Returns true if 'src' and 'imphort' both live in the same ts-morph @see SourceFile
 * @param src
 * @param imphort
 * @protected
 */
export function isSameSourceFile<S extends Node, I extends Node>(src: S, imphort: I): boolean {
	if (!imphort)
		return true;
	if (Object.is(src.getSourceFile(), imphort.getSourceFile()))
		return true;
	return imphort.getSourceFile().getBaseName() === TempFileName;
}

/**
 * If 'src' node is not in the same file as 'imphort' node, create a ts-morph import of imphort into 'src'.
 */
export function importIfNotSameFile<S extends Node, I extends Node>(src: S, imphort: I, imphortName: string) {
	if (!isSameSourceFile(src, imphort)) {
		const imphortFilePath = path.resolve(imphort.getSourceFile().getFilePath());
		const imphortDirPath = path.dirname(imphortFilePath);
		const imphortBaseName = path.basename(imphortFilePath, path.extname(imphortFilePath));
		const srcFilePath = path.resolve(src.getSourceFile().getFilePath());
		const srcDirPath = path.dirname(srcFilePath);
		const relPath = path.relative(srcDirPath, imphortDirPath);
		let relModule: string;
		if (relPath === '')
			relModule = './' + imphortBaseName;
		else
			relModule = path.join(relPath, imphortBaseName);
		return src.getSourceFile().addImportDeclaration({
			moduleSpecifier: relModule,
			namedImports: [imphortName]
		});
	}
	return undefined;
}

/**
 * The transformer uses a MethodDeclarations body to store a variable describing some predefined header values pulled from the OpenAPI specification.
 * (e.g. accept, content-type, etc.).
 */
export function getPreDefinedHttpHeaders(method: MethodDeclaration): Record<string, string> {
	const definedHdrsStatement = method.getStatement(s => {
		if (s instanceof VariableStatement)
			return !!s.getDeclarations().find(d => d.getName() === DefinedHdrsName);
		return false;
	}) as VariableStatement;
	const value = definedHdrsStatement?.getDeclarations().find(decl => decl.getName() === DefinedHdrsName)?.getStructure()?.initializer;
	if (!value)
		return undefined;
	return JSON.parse(value as string);
}

export class TsMorphBase {
	protected captureAstMappings(v: SourceFile) {
		const result = {};
		v.getInterfaces().forEach((i) => {
			const intf = {$ast: i.$ast, $type: undefined};
			i.getMethods().forEach((m) => {
				const retType = m.getReturnTypeNode();
				const meth = {$ast: m.$ast};
				if (retType)
					meth['$type'] = retType.$ast;
				m.getParameters().forEach((p, i) => {
					meth[p.getName()] = {$ast: p.$ast, $type: p.getTypeNode()?.$ast ?? (p.$ast as ParameterParameter)?.type};
				});
				intf[m.getName()] = meth;
			});
			i.getProperties().forEach((p) => {
				intf[p.getName()] = {$ast: p.$ast, $type: p.getTypeNode().$ast};
			});
			result[i.getName()] = intf;
		});
		v.getClasses().forEach((c) => {
			const intf = {$ast: c.$ast, $type: undefined};
			c.getMethods().forEach((m) => {
				const retType = m.getReturnTypeNode();
				const meth = {$ast: m.$ast};
				if (retType)
					meth['$type'] = retType.$ast;
				m.getParameters().forEach(p => {
					meth[p.getName()] = {$ast: p.$ast, $type: p.getTypeNode().$ast};
				});
				intf[m.getName()] = meth;
			});
			c.getProperties().forEach((p) => {
				intf[p.getName()] = {$ast: p.$ast, $type: p.getTypeNode().$ast};
			});
			result[c.getName()] = intf;
		});
		return result;
	}

	protected restoreAstMappings(v: SourceFile, mappings: object) {
		v.getInterfaces().forEach((i) => {
			const intf = mappings[i.getName()];
			bindAst(i, intf?.$ast);
			i.getMethods().forEach((m) => {
				const meth = intf?.[m.getName()];
				bindAst(m, meth?.$ast);
				if (m.getReturnTypeNode())
					bindAst(m.getReturnTypeNode(), meth?.$type);
				m.getParameters().forEach(p => {
					const param = meth?.[p.getName()];
					bindAst(p, param?.$ast);
					bindAst(p.getTypeNode(), param?.$type);
				});
			});
			i.getProperties().forEach((p) => {
				const prop = intf?.[p.getName()];
				bindAst(p, prop?.$ast);
				bindAst(p.getTypeNode(), prop?.$type);
			});
		});
		v.getClasses().forEach((c) => {
			const impl = mappings[c.getName()];
			bindAst(c, impl?.$ast);
			c.getMethods().forEach((m) => {
				const meth = impl[m.getName()];
				bindAst(m, meth?.$ast);
				if (m.getReturnTypeNode())
					bindAst(m.getReturnTypeNode(), meth?.$type);
				m.getParameters().forEach(p => {
					const param = meth[p.getName()];
					bindAst(p, param?.$ast);
					bindAst(p.getTypeNode(), param?.$type);
				});
			});
			c.getProperties().forEach((p) => {
				const prop = impl[p.getName()];
				bindAst(p, prop?.$ast);
				bindAst(p.getTypeNode(), prop?.$type);
			});
		});
	}
}
