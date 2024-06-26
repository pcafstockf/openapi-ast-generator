import {mkdirSync, readFileSync} from 'fs';
import {template as lodashTemplate} from 'lodash';
import {writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ClassDeclaration, InterfaceDeclaration, JSDocStructure, MethodDeclaration, MethodDeclarationStructure, MethodSignature, MethodSignatureStructure, ObjectLiteralExpression, Project, Scope, SourceFile, StructureKind, SyntaxKind, VariableDeclarationKind} from 'ts-morph';
import {isValidJsIdentifier} from '../../codegen/name-utils';
import {ApiTag} from '../../lang-neutral/api-tag';
import {MethodOperation} from '../../lang-neutral/method-operation';
import {TypeSchema} from '../../lang-neutral/type-schema';
import {interpolateBashStyle, safeLStatSync} from '../../shared';
import {importIfNotSameFile, TsMorphBase} from '../../ts-morph/base';
import {bindAst} from '../../ts-morph/ts-morph-ext';

export class TsServerGenerator extends TsMorphBase {
	protected config = codeGenConfig.generators.tsmorph.server;
	protected framework: typeof codeGenConfig.generators.tsmorph.server['openapi-backend'];

	generate(doc: Project): Project {
		this.framework = codeGenConfig.generators.tsmorph.server[codeGenConfig.generators.tsmorph.server.framework];
		const apiIntfFiles: SourceFile[] = [];
		const modelIntfFiles: SourceFile[] = [];
		const apiHndlFiles: SourceFile[] = [];
		const models: Record<string, InterfaceDeclaration> = {};
		const diSetupApis = new Map<ApiTag, {
			intf: ClassDeclaration,
			impl: ClassDeclaration
		}>();
		const di = this.config.dependencyInjection ? this.config.di[this.config.dependencyInjection] : undefined;
		doc.getSourceFiles().forEach(v => {
			v.getInterfaces().forEach(i => {
				if (i.getMethods().length === 0) {
					modelIntfFiles.push(i.getSourceFile());
					models[i.getName()] = i;
				}
				else
					apiIntfFiles.push(i.getSourceFile());
			});
			v.getClasses().forEach((c) => {
				if (!safeLStatSync(v.getFilePath())) {
					const methods = c.getMethods();
					if (methods.length > 0) {
						const api = c.$ast as ApiTag;
						const intfName = api.getIdentifier('intf');
						const intfDir = path.relative(path.join(codeGenConfig.outputDirectory, codeGenConfig.apiImplDir), path.join(codeGenConfig.outputDirectory, codeGenConfig.apiIntfDir));
						const intDir = path.relative(intfDir, this.config.support.dstDirName);
						c.getSourceFile().addImportDeclaration({
							moduleSpecifier: intDir,
							namedImports: ['HttpResponse']
						});
						c.addConstructor({
							statements: 'super();'
						});
						methods.forEach((m) => {
							this.enhanceClassMethod(m);
						});
						// We need to change implements to extends, because we are going to change the interface to an abstract class.
						c.getImplements().forEach(i => c.removeImplements(i));
						c.setExtends(intfName);
						c.getExtends().addTypeArgument(this.framework.context.type);
						this.framework.context.imphorts.map(i => {return {
							moduleSpecifier: interpolateBashStyle(i.moduleSpecifier, {internal: intDir}),
							namedImports: i.namedImports
						}}).forEach(i => v.addImportDeclaration(i))

						if (di) {
							diSetupApis.set(api, {intf: undefined, impl: c});
							di.apiConstruction.implDecorator.forEach(d => {
								c.addDecorator(d);
							});
							di.implImport?.forEach(i => v.addImportDeclaration(i));
							if (di.apiIntfTokens) {
								const apiImportDecl = v.getImportDeclaration(c => !!c.getNamedImports().find(i => i.getName() === intfName));
								di.apiIntfTokens?.forEach(tok => {
									let varName = interpolateBashStyle(tok.name_Tmpl, {intfName: intfName});
									apiImportDecl.addNamedImport(varName);
								});
							}
						}
					}
				}
			});
		});
		doc.getSourceFiles().forEach(v => {
			v.getInterfaces().forEach((i) => {
				const methods = i.getMethods();
				if (methods.length > 0) {
					const api = i.$ast as ApiTag;
					const adapter = this.createAdapterClass(doc, i, api);
					methods.forEach((m) => {
						this.createAdapterMethod(adapter, m, models);
						this.enhanceInterfaceMethod(m);
					});
					apiHndlFiles.push(adapter.getSourceFile());
					const clazz = this.interfaceToAbsClass(i);
					if (di) {
						di.intfImport?.forEach(i => v.addImportDeclaration(i));
						diSetupApis.get(api).intf = clazz;
						di.apiIntfTokens?.forEach(tok => {
							let varName = interpolateBashStyle(tok.name_Tmpl, {intfName: clazz.getName(), oaeName: (clazz.$ast as ApiTag).oae.name});
							let varInitializer = interpolateBashStyle(tok.initializer_Tmpl || '', {intfName: clazz.getName(), intfLabel: clazz.getName(), oaeName: (clazz.$ast as ApiTag).oae.name, varName: varName});
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
			});
		});

		if (apiHndlFiles.length > 0) {
			const indexTs = apiHndlFiles.reduce((p, sf) => {
				p += `export * from './${sf.getBaseNameWithoutExtension()}';${os.EOL}`;
				return p;
			}, ``);
			doc.createSourceFile(path.join(codeGenConfig.outputDirectory, codeGenConfig.apiHndlDir, 'index.ts'), indexTs, {overwrite: true});
		}
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
		if (di) {
			const intfTokensExt = di.apiIntfTokens.map(i => interpolateBashStyle(i.name_Tmpl, {intfName: ''}));
			const setupTemplate = lodashTemplate(di.apiSetup);
			const setupTxt = setupTemplate({
				intfTokensExt,
				apis: Array.from(diSetupApis.keys())
			}).trim();
			const diSetupSf = doc.createSourceFile(path.join(codeGenConfig.outputDirectory, codeGenConfig.apiImplDir, 'setup.ts'), setupTxt, {overwrite: true});
			diSetupApis.forEach(({intf, impl}) => {
				const intfImport = importIfNotSameFile(diSetupSf, intf, intf.getName());
				intfTokensExt.forEach(ext => intfImport.addNamedImport(intf.getName() + ext));
				importIfNotSameFile(diSetupSf, impl, impl.getName());
			});
		}

		if (this.config.support?.dstDirName)
			this.ensureInternalSupportFiles(doc);

		doc.getSourceFiles().forEach(v => {
			const mappings = this.captureAstMappings(v);
			v.organizeImports(codeGenConfig.generators.tsmorph.format);
			v.formatText(codeGenConfig.generators.tsmorph.format);
			this.restoreAstMappings(v, mappings);
		});
		return doc;
	}

	protected createAdapterClass(doc: Project, intf: InterfaceDeclaration, api: ApiTag) {
		const sf = doc.createSourceFile(path.join(codeGenConfig.outputDirectory, api.getFilepath('hndl') + '.ts'), '', {overwrite: true});
		const fn = sf.addFunction({
			name: `make${intf.getName()}Handler`,
			isExported: true,
			parameters: [{
				name: 'api',
				type: intf.getName() + `<${this.framework.context.type}>`,
			}]
		});
		const cast = this.framework.hndl.cast ? ` as unknown as ${this.framework.hndl.cast}` : '';
		fn.setBodyText(`return {}${cast};`);
		const retStat = fn.getStatements()[0].asKind(SyntaxKind.ReturnStatement);
		const retExp = retStat.getExpression().asKind(SyntaxKind.AsExpression);
		const objLit = retExp ? retExp.getExpression().asKind(SyntaxKind.AsExpression).getExpression().asKind(SyntaxKind.ObjectLiteralExpression) : retStat.getExpression().asKind(SyntaxKind.ObjectLiteralExpression);

		importIfNotSameFile(fn, intf, intf.getName());
		const intfDir = path.relative(path.join(codeGenConfig.outputDirectory, codeGenConfig.apiHndlDir), path.join(codeGenConfig.outputDirectory, codeGenConfig.apiIntfDir));
		const intDir = path.relative(intfDir, this.config.support.dstDirName);
		this.framework.hndl.imphorts.map(i => {return {
			moduleSpecifier: interpolateBashStyle(i.moduleSpecifier, {internal: intDir}),
			namedImports: i.namedImports
		}}).forEach(i => sf.addImportDeclaration(i));

		// By the time we get here, it is difficult to retrieve the original return types of the API methods.
		// So, we just pull in everything that the interface itself needed and let source code reformat / cleanup deal with extras.
		const intfSF = intf.getSourceFile();
		intfSF.getImportDeclarations().forEach(i => {
			const s = i.getStructure();
			if (s.moduleSpecifier.startsWith('.')) {
				sf.addImportDeclaration({
					moduleSpecifier: path.relative(intfDir, s.moduleSpecifier),
					namedImports: s.namedImports
				});
			}
		});
		return objLit;
	}

	protected ensureInternalSupportFiles(doc: Project) {
		let dstPath: string;
		let srcFilePath: string;
		let srcTxt: string;
		const internalDir = path.normalize(path.join(codeGenConfig.outputDirectory, globalThis.codeGenConfig.apiIntfDir, this.config.support.dstDirName));
		mkdirSync(internalDir, {recursive: true});
		this.config.support.files.forEach(fp => {
			let dstBase: string;
			if (typeof fp === 'object') {
				const key = Object.keys(fp)[0];
				fp = interpolateBashStyle(fp[key], {framework: this.config.framework});
				dstBase = path.basename(key);
			}
			else {
				fp = interpolateBashStyle(fp, {framework: this.config.framework});
				dstBase = path.basename(fp);
			}
			srcFilePath = path.normalize(path.join(this.config.support.srcDirName, fp));
			dstPath = path.join(internalDir, dstBase);
			if (!safeLStatSync(dstPath)) {
				srcTxt = readFileSync(srcFilePath, 'utf-8');
				writeFileSync(dstPath, srcTxt);
			}
		});
	}

	protected enhanceInterfaceMethod(intf: MethodSignature) {
		const method = intf.$ast;
		const baseReturnTypeNode = intf.getReturnTypeNode();
		const methodReturnType = baseReturnTypeNode.$ast;
		const struct = intf.getStructure();
		const parent = intf.getParent() as InterfaceDeclaration;
		intf.remove(); // We need the return type to be promise
		const implMethod = parent.addMethod({
			...struct,
			returnType: `Promise<HttpResponse<${struct.returnType}>>`
		});
		bindAst(implMethod, method);
		bindAst(implMethod.getReturnTypeNode(), methodReturnType);
		return implMethod;
	}

	protected enhanceClassMethod(impl: MethodDeclaration) {
		const method = impl.$ast;
		const baseReturnTypeNode = impl.getReturnTypeNode();
		const methodReturnType = baseReturnTypeNode.$ast;
		const struct = impl.getStructure() as MethodDeclarationStructure;
		const parent = impl.getParent() as ClassDeclaration;
		impl.remove(); // We need the return type to be promise
		const implMethod = parent.addMethod({
			...struct,
			docs: [{
				kind: StructureKind.JSDoc,
				tags: [{
					kind: StructureKind.JSDocTag,
					tagName: 'inheritDoc'
				}]
			}],
			scope: Scope.Public,
			returnType: `Promise<HttpResponse<${struct.returnType}>>`
		});
		implMethod.setHasOverrideKeyword(true);
		bindAst(implMethod, method);
		bindAst(implMethod.getReturnTypeNode(), methodReturnType);
		this.addCtxParamToMethod(implMethod, this.framework.context.type);
		let retValStr = this.framework.stubReturn;
		implMethod.setIsAsync(retValStr.trim() !== 'null');
		implMethod.setBodyText(`return ${retValStr};`);
		return implMethod;
	}

	protected createAdapterMethod(adapter: ObjectLiteralExpression, intf: MethodSignature, models: Record<string, InterfaceDeclaration>) {
		const method = intf.$ast;
		const resolver = this.framework.hndl.lookup;
		const genericParams = {body: 'never', path: [], query: [], header: [], cookie: [], reply: 'never', oaVers: method.document.openapi, apiInvocation: undefined};
		genericParams.apiInvocation = intf.getParameters().reduce((s, p, idx) => {
			let ref: string;
			const oap = method.parameters[idx];
			const typeNode = p.getTypeNode();
			const typeStr = p.getStructure().type as string;
			if (oap.nodeKind === 'request') {
				ref = resolver.body;
				genericParams.body = typeStr;
			}
			else if (resolver[oap.oae.in]) {
				let jsId = oap.name;
				ref = interpolateBashStyle(resolver[oap.oae.in], {name: oap.name, type: typeStr});
				if (! isValidJsIdentifier(jsId)) {
					if (ref.endsWith('.' + jsId) || ref.indexOf('.' + jsId + ' as ') > 0)
						ref = ref.replace('.' + jsId, `['${jsId}']`);
					jsId = `['${jsId}']`;
				}
				genericParams[oap.oae.in].push(`${jsId}:${typeStr}`);
			}
			if (ref) {
				if (typeNode?.getKind() === SyntaxKind.TypeReference)
					if (models[typeStr])
						importIfNotSameFile(adapter, models[typeStr], typeStr);
				s += ', ' + ref;
			}
			return s;
		}, `api.${intf.getName()}(ctx as unknown as ${this.framework.context.type}`) + ')';
		Object.keys(genericParams).forEach(key => {
			if (Array.isArray(genericParams[key])) {
				if (genericParams[key].length === 0)
					genericParams[key] = 'never';
				else
					genericParams[key] = `{${genericParams[key].join(',')}}`;
			}
		});
		// A little funky...
		// We should import the return type, but its been mangled by the time we get here.
		// This was addressed by importing everything the api imports, so we can get away with just inserting the type as text.
		const rtTxt = intf.getReturnTypeNode()?.getText();
		if (rtTxt && rtTxt !== 'void')
			genericParams.reply = rtTxt;

		const initTxt = interpolateBashStyle(this.framework.hndl.body, genericParams);
		const opNameData = {name: intf.getName(), pattern: method.pattern.toLowerCase(), method: method.httpMethod.toUpperCase(), operationId: method.oae.operationId};
		const operationIdName = interpolateBashStyle(this.framework.hndl.operationId ?? intf.getName(), opNameData);
		const operationId = adapter.addPropertyAssignment({
			name: operationIdName,
			initializer: initTxt
		});
		bindAst(operationId, method);
		const arrowFn = operationId.getInitializer().asKind(SyntaxKind.ArrowFunction);
		bindAst(arrowFn, method);
	}

	protected interfaceToAbsClass(i: InterfaceDeclaration) {
		const intf = i.$ast;
		const sf = i.getSourceFile();
		const istruct = i.getStructure();
		const methods = i.getMethods().reduce((p, m) => {
			const mstrcut = m.$ast;
			p.set(mstrcut, [m.getStructure(), m.getReturnTypeNode().$ast]);
			return p;
		}, new Map<MethodOperation, [MethodSignatureStructure, TypeSchema]>());
		const clazz = sf.addClass({
			name: istruct.name,
			docs: istruct.docs,
			isExported: true
		});
		clazz.setIsAbstract(true);
		bindAst(clazz, intf);
		clazz.addTypeParameter({
			name: 'CTX',
			default: 'Record<string, any>'
		});
		clazz.addConstructor({
			scope: Scope.Protected
		});
		clazz.getSourceFile().addImportDeclaration({
			moduleSpecifier: this.config.support.dstDirName,
			namedImports: ['HttpResponse']
		});
		methods.forEach((s, m) => {
			const meth = clazz.addMethod({
				scope: Scope.Public,
				name: s[0].name,
				docs: s[0].docs.map((d: JSDocStructure) => {
					const returnTag = d.tags.find(t => t.tagName === 'return');
					if (returnTag)
						returnTag.text = (returnTag.text ? returnTag.text + `${os.EOL}\t` : '') + `To understand what to return, please see:<br/>${os.EOL}\t{@link AbsHandler#processResult} and {@link HttpResponse}`;
					return d;
				}),
				parameters: s[0].parameters,
				typeParameters: s[0].typeParameters,
				returnType: s[0].returnType
			});
			meth.setIsAbstract(true);
			meth.removeBody();
			bindAst(meth, m);
			bindAst(meth.getReturnTypeNode(), s[1]);
			this.addCtxParamToMethod(meth, 'CTX');
		});
		i.remove();
		return clazz;
	}

	private addCtxParamToMethod(meth: MethodDeclaration, type: string) {
		return meth.insertParameter(0, {
			name: 'ctx',
			type: type
		});
	}
}
