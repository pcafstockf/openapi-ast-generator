import {mkdirSync, readFileSync} from 'fs';
import {findLastIndex, template as lodashTemplate} from 'lodash';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {stringify as json5Stringify} from 'json5';
import {ClassDeclaration, InterfaceDeclaration, MethodDeclaration, MethodDeclarationStructure, MethodSignature, Project, Scope, SourceFile, StructureKind, SyntaxKind, VariableDeclarationKind} from 'ts-morph';
import {ApiTag} from '../../lang-neutral/api-tag';
import {ParameterParameter} from '../../lang-neutral/parameter-parameter';
import {ParameterRequestBody} from '../../lang-neutral/parameter-requestbody';
import {interpolateBashStyle, safeLStatSync} from '../../shared';
import {getPreDefinedHttpHeaders, importIfNotSameFile, TsMorphBase} from '../../ts-morph/base';
import {bindAst} from '../../ts-morph/ts-morph-ext';

export class TsClientGenerator extends TsMorphBase {
	protected codeGenTarget = codeGenConfig.target;
	protected config = codeGenConfig.generators.tsmorph.client;

	generate(doc: Project): Project {
		const apiIntfFiles: SourceFile[] = [];
		const modelIntfFiles: SourceFile[] = [];
		const di = this.config.dependencyInjection ? this.config.di[this.config.dependencyInjection] : undefined;
		const diSetupApis = new Map<ApiTag, {
			intf: InterfaceDeclaration,
			impl: ClassDeclaration
		}>();
		doc.getSourceFiles().forEach(v => {
			v.getInterfaces().forEach((i) => {
				const methods = i.getMethods();
				if (methods.length > 0) {
					apiIntfFiles.push(i.getSourceFile());
					this.ensureInternalDirImport(i);
					methods.forEach((m) => {
						this.enhanceInterfaceMethod(m);
					});
					if (di) {
						// Each API interface should define a DI token that the API implementation will be bound to
						di.intfImport.forEach(i => v.addImportDeclaration(i));
						diSetupApis.set(i.$ast as ApiTag, {intf: i, impl: undefined});
						di.apiIntfTokens?.forEach(tok => {
							let varName = interpolateBashStyle(tok.name_Tmpl, {intfName: i.getName(), oaeName: (i.$ast as ApiTag).oae.name});
							let varInitializer = interpolateBashStyle(tok.initializer_Tmpl || '', {intfName: i.getName(), intfLabel: i.getName(), oaeName: (i.$ast as ApiTag).oae.name, varName: varName});
							v.addVariableStatement({
								declarationKind: VariableDeclarationKind.Const,
								isExported: true,
								declarations: [{
									name: varName,
									initializer: varInitializer ? varInitializer : undefined
								}]
							});
						});
					}
				}
				else {
					modelIntfFiles.push(i.getSourceFile());
				}
			});
			v.getClasses().forEach((c) => {
				this.ensureInternalDirImport(c);
				const api = c.$ast as ApiTag;
				const intfName = api.getIdentifier('intf');
				const implName = api.getIdentifier('impl');
				if (di) {
					diSetupApis.get(api).impl = c;
					di.implImport?.forEach(i => v.addImportDeclaration(i));
					if (di.apiIntfTokens) {
						const apiImportDecl = v.getImportDeclaration(c => !!c.getNamedImports().find(i => i.getName() === intfName));
						di.apiIntfTokens?.forEach(tok => {
							let varName = interpolateBashStyle(tok.name_Tmpl, {intfName: intfName});
							apiImportDecl.addNamedImport(varName);
						});
					}
					di.apiConstruction.implDecorator.forEach(d => {
						c.addDecorator(d);
					});
					const idx = findLastIndex(v.getStatements(), (n: any) => {
						return n.isKind(SyntaxKind.ImportDeclaration);
					});
					di.apiImplTokens?.forEach(tok => {
						let varName = interpolateBashStyle(tok.name_Tmpl, {implName: implName});
						let varInitializer = interpolateBashStyle(tok.initializer_Tmpl || '', {intfLabel: intfName});
						v.insertVariableStatement(idx + 1, {
							declarationKind: VariableDeclarationKind.Const,
							isExported: true,
							declarations: [{
								name: varName,
								initializer: varInitializer ? varInitializer : undefined
							}]
						});
					});
				}
				this.makeConstructor(c);
				c.getMethods().forEach((m) => {
					this.enhanceClassMethod(m);
				});
			});
		});
		if (apiIntfFiles.length > 0) {
			const indexTs = apiIntfFiles.reduce((p, sf) => {
				p += `export * from './${sf.getBaseNameWithoutExtension()}';${os.EOL}`;
				return p;
			}, ``);
			doc.createSourceFile(path.join(codeGenConfig.outputDirectory, codeGenConfig.apiIntfDir, 'index.ts'), indexTs, {overwrite: true});
		}
		if (modelIntfFiles.length > 0) {
			const indexTs = modelIntfFiles.reduce((p, sf) => {
				p += `export * from './${sf.getBaseNameWithoutExtension()}';${os.EOL}`;
				return p;
			}, ``);
			doc.createSourceFile(path.join(codeGenConfig.outputDirectory, codeGenConfig.modelIntfDir, 'index.ts'), indexTs, {overwrite: true});
		}
		if (this.config.support?.dstDirName)
			this.ensureInternalSupportFiles(doc);
		if (di) {
			const intfTokensExt = di.apiIntfTokens.map(i => interpolateBashStyle(i.name_Tmpl, {intfName: ''}));
			const confTokensExt = di.apiImplTokens.map(i => interpolateBashStyle(i.name_Tmpl, {implName: ''}));
			const setupTemplate = lodashTemplate(di.apiSetup);
			const setupTxt = setupTemplate({
				intfTokensExt,
				confTokensExt,
				apis: Array.from(diSetupApis.keys())
			}).trim();
			const diSetupSf = doc.createSourceFile(path.join(codeGenConfig.outputDirectory, codeGenConfig.apiImplDir, 'setup.ts'), setupTxt, {overwrite: true});
			// To difficult for the template to know where the interfaces are, so we import those ourselves.
			const imports = ['HttpClient as ApiHttpClient', 'ApiHttpClientToken', 'ApiClientConfig'];
			diSetupSf.addImportDeclaration({
				moduleSpecifier: this.config.support.dstDirName,
				namedImports: imports
			});
			diSetupApis.forEach(({intf, impl}) => {
				const intfImport = importIfNotSameFile(diSetupSf, intf, intf.getName());
				intfTokensExt.forEach(ext => intfImport.addNamedImport(intf.getName() + ext));
				const implImport = importIfNotSameFile(diSetupSf, impl, impl.getName());
				confTokensExt.forEach(ext => implImport.addNamedImport(impl.getName() + ext));
			});
		}

		doc.getSourceFiles().forEach(v => {
			const mappings = this.captureAstMappings(v);
			v.organizeImports(codeGenConfig.generators.tsmorph.format);
			v.formatText(codeGenConfig.generators.tsmorph.format);
			this.restoreAstMappings(v, mappings);
		});
		return doc;
	}

	protected ensureInternalSupportFiles(doc: Project) {
		let srcTxt: string;
		let dstPath: string;
		const internalDir = path.normalize(path.join(codeGenConfig.outputDirectory, globalThis.codeGenConfig.apiIntfDir, this.config.support.dstDirName));
		mkdirSync(internalDir, {recursive: true});
		this.config.support.files.forEach(fp => {
			let dstBase: string;
			const opts =  {
				target: this.codeGenTarget ? `.${this.codeGenTarget}` : ''
			};
			if (typeof fp === 'object') {
				const key = Object.keys(fp)[0];
				fp = interpolateBashStyle(fp[key], opts)    // Default to none
				dstBase = path.basename(key);
			}
			else {
				fp = interpolateBashStyle(fp, opts);    // Default to none
				dstBase = path.basename(fp);
			}
			const srcFilePath = path.normalize(path.join(this.config.support.srcDirName, fp));
			dstPath = path.join(internalDir, dstBase);
			if (!safeLStatSync(dstPath)) {
				srcTxt = readFileSync(srcFilePath, 'utf-8');
				writeFileSync(dstPath, srcTxt);
			}
		});
	}

	protected ensureInternalDirImport(decl: ClassDeclaration | InterfaceDeclaration) {
		const imports = ['HttpResponse', 'ApiClientConfig'];
		if (decl instanceof ClassDeclaration) {
			imports.push('HttpClient');
			imports.push('HttpOptions');
			if (this.config.dependencyInjection)
				imports.push('ApiHttpClientToken');
		}
		decl.getSourceFile().addImportDeclaration({
			moduleSpecifier: this.config.support.dstDirName,
			namedImports: imports
		});
	}

	protected makeConstructor(c: ClassDeclaration) {
		const impl = c.addConstructor({
			parameters: [
				{name: 'http', type: 'HttpClient', isReadonly: true, scope: Scope.Protected},
				{name: 'config', type: 'ApiClientConfig', isReadonly: true, scope: Scope.Protected}
			]
		});
		const di = this.config.dependencyInjection ? this.config.di[this.config.dependencyInjection] : undefined;
		if (di?.apiConstruction) {
			const api = c.$ast as ApiTag;
			const params = impl.getParameters();
			di.apiConstruction.httpClientInject?.forEach((d => {
				params[0].addDecorator(d);
			}));
			di.apiConstruction.apiConfigInject?.forEach((d => {
				params[1].addDecorator({
					name: d.name,
					arguments: d.arguments.map(a => interpolateBashStyle(a, {implName: c.getName()}))
				});
			}));
		}
		impl.setBodyText((writer) => {
			if (c.getExtends())
				writer.writeLine('super();');
			writer.writeLine('this.config = this.config || {}');
		});
	}

	protected enhanceInterfaceMethod(intf: MethodSignature) {
		const method = intf.$ast;
		const methodReturnType = intf.getReturnTypeNode().$ast;
		const struct = intf.getStructure();
		const parent = intf.getParent() as InterfaceDeclaration;
		intf.remove(); // We need the return type to be promise
		// Base aka: (...)
		const base_Method = parent.addMethod({
			...struct,
			returnType: `Promise<${struct.returnType}>`
		});
		bindAst(base_Method, method);
		bindAst(base_Method.getReturnTypeNode(), methodReturnType);
		// HttpResponse aka: (..., rsp: 'http').
		const http_Method = parent.addMethod({
			...struct,
			docs: undefined,
			returnType: `Promise<HttpResponse<${struct.returnType}>>`
		});
		http_Method.addParameter({
			name: 'rsp',
			type: '\'http\'',
			hasQuestionToken: true
		});
		// Body with headers aka: (..., hdrs: Record<string, string>)
		const hdrs_Method = parent.addMethod({
			...struct,
			docs: undefined,
			returnType: `Promise<${struct.returnType}>`
		});
		hdrs_Method.addParameter({
			name: 'hdrs',
			type: 'Record<string,string>',
			hasQuestionToken: true
		});
		// HttpResponse with headers aka: (..., hdrs: Record<string, string>, rsp: 'http').
		const http_hdrs_Method = parent.addMethod({
			...struct,
			docs: undefined,
			returnType: `Promise<HttpResponse<${struct.returnType}>>`
		});
		http_hdrs_Method.addParameter({
			name: 'hdrs',
			type: 'Record<string,string>',
			hasQuestionToken: true
		});
		http_hdrs_Method.addParameter({
			name: 'rsp',
			type: '\'http\'',
			hasQuestionToken: true
		});
	}

	protected enhanceClassMethod(impl: MethodDeclaration) {
		const method = impl.$ast;
		const methodReturnType = impl.getReturnTypeNode().$ast;
		const struct = impl.getStructure() as MethodDeclarationStructure;
		const parent = impl.getParent() as ClassDeclaration;
		impl.remove(); // We need the return type to be promise
		const implMethod = parent.addMethod({
			...struct,
			docs: undefined,
			returnType: `Promise<${struct.returnType} | HttpResponse<${struct.returnType}>>`
		});
		bindAst(implMethod, method);
		bindAst(implMethod.getReturnTypeNode(), methodReturnType);
		// Base aka: (...)
		// noinspection JSUnusedLocalSymbols
		const base_Overload = implMethod.addOverload({
			...struct,
			returnType: `Promise<${struct.returnType}>`,
			kind: StructureKind.MethodOverload
		});
		// HttpResponse aka: (..., rsp: 'http').
		const http_Overload = implMethod.addOverload({
			...struct,
			docs: undefined,
			returnType: `Promise<HttpResponse<${struct.returnType}>>`,
			kind: StructureKind.MethodOverload
		});
		http_Overload.addParameter({
			name: 'rsp',
			hasQuestionToken: true,
			type: '\'http\''
		});
		// Body with headers aka: (..., hdrs: Record<string, string>)
		const hdrs_Overload = implMethod.addOverload({
			...struct,
			docs: undefined,
			returnType: `Promise<${struct.returnType}>`,
			kind: StructureKind.MethodOverload
		});
		hdrs_Overload.addParameter({
			name: 'hdrs',
			hasQuestionToken: true,
			type: 'Record<string,string>'
		});
		// HttpResponse with headers aka: (..., hdrs: Record<string, string>, rsp: 'http').
		const http_hdrs_Overload = implMethod.addOverload({
			...struct,
			docs: undefined,
			returnType: `Promise<HttpResponse<${struct.returnType}>>`,
			kind: StructureKind.MethodOverload
		});
		http_hdrs_Overload.addParameter({
			name: 'hdrs',
			hasQuestionToken: true,
			type: 'Record<string,string>'
		});
		http_hdrs_Overload.addParameter({
			name: 'rsp',
			hasQuestionToken: true,
			type: '\'http\''
		});
		implMethod.addParameter({
			name: 'hdrsOrRsp',
			hasQuestionToken: true,
			type: 'Record<string,string> | \'body\' | \'http\''
		});
		implMethod.addParameter({
			name: 'rsp',
			type: '\'body\' | \'http\' | undefined',
			initializer: '\'body\''
		});

		this.populateMethodBody(implMethod);
	}

	protected populateMethodBody(impl: MethodDeclaration) {
		const m = impl.$ast;
		const pdHdrs = getPreDefinedHttpHeaders(impl) || {};  // A method with no body returning void will probably not have any predefined headers.
		const bodyMimeType = pdHdrs['content-type'];
		delete pdHdrs['content-type'];
		impl.setBodyText((writer) => {
			m.parameters.forEach((p) => {
				if (p.required) {
					let nullable = p.nodeKind === 'parameter' ? p.type.isNullable : p.resolveTypes().some(t => t.isNullable);
					if (nullable)
						writer.write(`if (typeof ${p.getIdentifier()} === 'undefined')`).writeLine(`throw new Error('Required parameter "${p.getIdentifier()}" is undefined');`);
					else
						writer.write(`if (${p.getIdentifier()} === null || typeof ${p.getIdentifier()} === 'undefined')`).writeLine(`throw new Error('Required parameter "${p.getIdentifier()}" is null/undefined');`);
				}
			});

			function makeSerializerInvocation(p: ParameterParameter, arg?: string | boolean) {
				const key = p.serializerKey;
				if (! key)
					throw new Error(`Invalid style/explode serialization for ${p.name}@${p.location.join('/')}`)
				return `this.config.paramSerializers?.['${key}'](${p.getIdentifier()}, ${typeof arg === 'string' ? "'" + arg + "'" : arg}) ?? ''`;
			}

			let pathPattern = m.pattern.replace(/{(.*?)}/g, (_, g) => '${' + makeSerializerInvocation(m.parameters.find(p => p.nodeKind === 'parameter' && p.name === g) as ParameterParameter, true) + '}');
			if (pathPattern[0] !== '/')
				pathPattern = '/' + pathPattern;
			writer.writeLine('let $serviceUrl = `${this.config.baseURL}' + pathPattern + '`;');
			writer.writeLine(`const $localHdrs = {};`);
			writer.writeLine('if (hdrsOrRsp) {').indent();
			writer.indent().write('if (typeof hdrsOrRsp === ').quote('object').write(')');
			writer.indent().indent().writeLine(`Object.keys(hdrsOrRsp).forEach(v => {`)
				.writeLine(`$localHdrs[v.toLowerCase()] = hdrsOrRsp[v];`)
				.writeLine(`});`);
			writer.indent().write('else if (typeof hdrsOrRsp === ').quote('string').write(')');
			writer.indent().indent().writeLine(`rsp = hdrsOrRsp;`);
			writer.writeLine('}');
			writer.writeLine('else');
			writer.indent().write('rsp = ').quote('body').write(';');
			writer.newLine();

			Object.keys(pdHdrs).forEach(key => {
				writer.write('$localHdrs[').quote(key.toLowerCase()).write('] = ').quote(pdHdrs[key]).write(';');
			});
			const headerParams = m.parameters.filter(p => p.nodeKind === 'parameter' && p.oae.in === 'header') as ParameterParameter[];
			const queryParams = m.parameters.filter(p => p.nodeKind === 'parameter' && p.oae.in === 'query') as ParameterParameter[];
			const cookieParams = m.parameters.filter(p => p.nodeKind === 'parameter' && p.oae.in === 'cookie') as ParameterParameter[];
			const body = m.parameters.filter(p => p.nodeKind === 'request')[0] as ParameterRequestBody;
			headerParams.forEach(p => {
				if (!p.required)
					writer.writeLine(`if (typeof ${p.getIdentifier()} !== 'undefined')`);
				writer.write('$localHdrs[').quote(p.name.toLowerCase()).write(`] = ${makeSerializerInvocation(p, false)};`);
			});
			if (!writer.isLastNewLine())
				writer.newLine();
			// JavaScript code in the browser has no control over cookie values, or even which cookies are sent, but node does.
			if (this.codeGenTarget !== 'browser') {
				writer.writeLine('const $cookies: Record<string, () => string> = {};');
				if (cookieParams.length > 0) {
					cookieParams.forEach(p => {
						if (!p.required)
							writer.writeLine(`if (typeof ${p.getIdentifier()} !== 'undefined')`);
						writer.write(`$cookies[`).quote(p.name).write(`] = () => ${makeSerializerInvocation(p, p.name)};`);
					});
				}
			}
			if (queryParams.length > 0) {
				writer.writeLine('const $queries = [];');
				writer.writeLine(`const $addQueryIfValid = (s) => s && $queries.push(s);`);
				queryParams.forEach(p => {
					if (!p.required)
						writer.writeLine(`if (typeof ${p.getIdentifier()} !== 'undefined')`);
					writer.writeLine(`$addQueryIfValid(${makeSerializerInvocation(p, p.name)});`);
				});
				writer.writeLine('if ($queries.length > 0)')
					.writeLine(`$serviceUrl += '?' + $queries.join('&');`);
			}
			writer.writeLine(`const $opDesc = {id:'${m.getIdentifier()}', pattern:'${m.pattern}', method:'${m.httpMethod}'};`);
			if (body) {
				writer.write(`const $body = this.config.bodySerializer ? this.config.bodySerializer($opDesc, $serviceUrl, `).quote(bodyMimeType).write(`, ${body.getIdentifier()}, $localHdrs) : ${body.getIdentifier()};`);
				writer.newLine();
			}
			writer.write(`let $pre = this.config.enhanceReq ? this.config.enhanceReq($opDesc, $serviceUrl, $localHdrs`);
			if (this.codeGenTarget === 'browser')
				writer.write(`) : Promise.resolve(${cookieParams.length > 0 ? 'true' : ''});`);
			else
				writer.write(`, $cookies) : Promise.resolve($cookies);`);

			let sec = m.document.security ?? [];
			if (Array.isArray(m.oae.security))
				sec = m.oae.security;
			if (sec.length > 0) {
				writer.writeLine('if (this.config.ensureAuth) {')
					.writeLine(`const $security = ${json5Stringify(sec)};`)
					.writeLine(`$pre = $pre.then(c => this.config.ensureAuth($opDesc, $security, $serviceUrl, $localHdrs, c));`)
					.writeLine('}');
			}
			writer.writeLine('const $rsp = $pre.then((c) => {');
			writer.writeLine('const $opts = {} as HttpOptions;')
			if (this.codeGenTarget === 'browser') {
				writer.writeLine('if (c)')
					.writeLine('$opts.credentials = c;')
			}
			else {
				writer.writeLine(`const $cookieEncoders = Object.values(c)`);
				writer.writeLine('if ($cookieEncoders.length > 0)')
					.write(`$localHdrs[`).quote('cookie').write(`] = ($localHdrs[`).quote('cookie').write(`] ? ($localHdrs[`).quote('cookie').write(`] + '; ') : '') + $cookieEncoders.map(fn => fn()).join('; ');`)
					.newLine();
			}
			writer.writeLine('if (Object.keys($localHdrs).length > 0)')
				.writeLine('$opts.headers = $localHdrs;');
			writer.write('return this.http.')
			.write(m.httpMethod.toLowerCase())
			.write('(')
			.write('$serviceUrl,');
			if (body)
				writer.write(`$body,`);
			writer.write('$opts);');
			writer.writeLine('});');
			writer.write('if (rsp !== \'http\')').indent().writeLine('return $rsp.then(r => r.data as any);');
			writer.writeLine('return $rsp;');
		});
	}
}
