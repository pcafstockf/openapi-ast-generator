// noinspection DuplicatedCode

import {randomUUID} from 'crypto';
import os from 'node:os';
import path from 'node:path';
import {ClassDeclaration, EnumDeclaration, InterfaceDeclaration, JSDocStructure, JSDocTagStructure, KindToNodeMappings, MethodDeclaration, MethodSignature, Node, Project, SourceFile, StructureKind, SyntaxKind, TypeAliasDeclaration, TypeReferenceNode, VariableDeclarationKind, VariableStatement} from 'ts-morph';
import {CodeGenConfig} from '../codegen/codegen-config';
import * as nameUtils from '../codegen/name-utils';
import {ApiTag} from '../lang-neutral/api-tag';
import {LanguageNeutralDocument} from '../lang-neutral/generator';
import {MethodOperation} from '../lang-neutral/method-operation';
import {ParameterRequestBody} from '../lang-neutral/parameter-requestbody';
import {ArraySchema, RecordSchema, TypeSchema} from '../lang-neutral/type-schema';
import {safeLStatSync} from '../shared';
import {DefinedHdrsName, importIfNotSameFile, isSameSourceFile, TempFileName, TsMorphBase} from './base';
import {bindAst} from './ts-morph-ext';

declare global {
	var codeGenConfig: CodeGenConfig;
}

// noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
export class TsMorphGenerator extends TsMorphBase {
	protected project: Project;

	generate(doc: LanguageNeutralDocument): Project {
		if (!codeGenConfig.generators.tsmorph.project.compilerOptions.outDir)
			codeGenConfig.generators.tsmorph.project.compilerOptions.outDir = codeGenConfig.outputDirectory;
		this.project = new Project(codeGenConfig.generators.tsmorph.project);
		this.namedTypes = new Map<string, Node>();
		try {
			this.initNativeTypes();

			if (codeGenConfig.allModels) {
				doc.types.forEach(t => {
					this.resolveType(t, 'intf');
					this.resolveType(t, 'impl');
				});
			}
			doc.apis.forEach(a => {
				this.resolveApi(a, 'intf');
				this.resolveApi(a, 'impl');
				if (codeGenConfig.role === 'server')
					this.resolveApi(a, 'hndl');
			});
			this.project.getSourceFiles().forEach(v => {
				if (Object.is(this.tempFile, v)) {
					v.deleteImmediatelySync();
					delete this.tempFile;
				}
				else {
					const mappings = this.captureAstMappings(v);
					v.organizeImports(codeGenConfig.generators.tsmorph.format);
					this.restoreAstMappings(v, mappings);
				}
			});
			return this.project;
		}
		finally {
			delete this.nativeTypes;
			delete this.namedTypes;
			delete this.project;
		}
	}

	/**
	 * If the model is not defined in the save file as the 'src' node, ensure there is a node that imports the model into the 'src' file.
	 */
	protected importModelIfNotSameFile<S extends Node>(src: S, imphortSchema: TypeSchema) {
		if (imphortSchema) {
			if (imphortSchema.nodeKind === 'array')
				imphortSchema = (imphortSchema as ArraySchema).items;
			const modelNode = this.resolveType(imphortSchema, 'intf');
			if (!isSameSourceFile(src, modelNode))
				importIfNotSameFile(src, modelNode, this.tsTypeToText(modelNode));
		}
	}

	protected makeTypeDoc(type: TypeSchema) {
		let docs = <JSDocStructure>{
			kind: StructureKind.JSDoc,
			description: this.makeJsDocTxt(type.oae.title, type.oae.description)
		};
		if (type.nodeKind === 'array') {
			const i = (type as ArraySchema).items;
			if (!docs.description)
				docs.description = this.makeJsDocTxt(i.oae.title, i.oae.description);
		}
		if (type.oae.externalDocs) {
			const txt = this.makeJsDocLink(type.oae.externalDocs.url, type.oae.externalDocs.description);
			if (txt)
				docs.tags.push({
					kind: StructureKind.JSDocTag,
					tagName: 'link',
					text: txt
				});
		}
		if (docs.description || docs.tags?.length > 0)
			return docs;
		return undefined;
	}

	protected inspectTypeInterface(intf: InterfaceDeclaration) {
		const rec = intf.$ast as RecordSchema;
		rec.properties.forEach((v, k) => {
			const r = this.resolveType(v, 'intf');
			const txt = this.tsTypeToText(r);
			this.importModelIfNotSameFile(intf, v);
			const prop = intf.addProperty({
				name: rec.propertyIdentifier(k),
				hasQuestionToken: !rec.propertyIsRequired(k),
				type: txt
			});
			bindAst(prop, v);
			bindAst(prop.getTypeNode(), r);
			if (codeGenConfig.emitDescriptions) {
				if (v.name) {
					prop.addJsDoc({
						kind: StructureKind.JSDoc,
						description: '@see ' + v.name
					});
				}
				else {
					const docs = this.makeTypeDoc(v);
					if (docs)
						prop.addJsDoc(docs);
				}
			}
		});
		const ap = rec.additionalProperties;
		if (ap) {
			const apType = ap === true ? undefined : this.resolveType(ap, 'intf');
			const valueType = apType ? this.tsTypeToText(apType) : 'any';
			const sig = intf.addIndexSignature({
				keyName: 'key',
				keyType: 'string | number',
				returnType: valueType
			});
			if (codeGenConfig.emitDescriptions) {
				if (apType) {
					const docs = this.makeTypeDoc(ap as TypeSchema);
					if (docs)
						sig.addJsDoc(docs);
				}
			}
		}
		if (codeGenConfig.emitDescriptions) {
			const docs = this.makeTypeDoc(rec);
			if (docs)
				intf.addJsDoc(docs);
		}
	}

	protected inspectTypeEnum(intf: EnumDeclaration) {
		const type = intf.$ast as TypeSchema;
		if (codeGenConfig.emitDescriptions) {
			const docs = this.makeTypeDoc(type);
			if (docs)
				intf.addJsDoc(docs);
		}
	}

	protected inspectTypeClass(impl: ClassDeclaration, intf?: InterfaceDeclaration) {

	}

	protected makeApiDoc(api: ApiTag) {
		let docs = <JSDocStructure>{
			kind: StructureKind.JSDoc,
			description: this.makeJsDocTxt(undefined, api.oae.description),
			tags: []
		};
		if (api.oae.externalDocs) {
			const txt = this.makeJsDocLink(api.oae.externalDocs.url, api.oae.externalDocs.description);
			if (txt)
				docs.tags.push({
					kind: StructureKind.JSDocTag,
					tagName: 'link',
					text: txt
				});
		}
		if (docs.description || docs.tags?.length > 0)
			return docs;
		return undefined;
	}

	protected inspectApiInterface(intf: InterfaceDeclaration) {
		const api = intf.$ast as ApiTag;
		api.methods.forEach(m => {
			let method = intf.addMethod({
				name: m.getIdentifier()
			});
			bindAst(method, m);
			try {
				this.inspectApiInterfaceMethod(method);
			}
			catch (err) {
				console.warn(err.message + ' Skipping method generation for operation ' + m.oae.operationId);
				method.remove();
			}
		});
		if (codeGenConfig.emitDescriptions) {
			const docs = this.makeApiDoc(api);
			if (docs)
				intf.addJsDoc(docs);
		}
	}

	protected makeJsDocLink(url: string, text: string): string {
		if (url) {
			if (text)
				return url + '\t' + text;
			return url;
		}
		else if (text)
			return text;
		return undefined;
	}

	protected makeJsDocTxt(short: string, long: string): string {
		if (long) {
			if (short && long.toLowerCase().startsWith(short.toLowerCase()))
				return long;
			else if (short)
				return short + os.EOL + long;
			return long;
		}
		else if (short)
			return short;
		return '';
	}

	protected makeApiMethodDoc(method: MethodOperation) {
		let docs = <JSDocStructure>{
			kind: StructureKind.JSDoc,
			description: this.makeJsDocTxt(method.oae.summary, method.oae.description),
			tags: []
		};
		if (method.oae.externalDocs) {
			const txt = this.makeJsDocLink(method.oae.externalDocs.url, method.oae.externalDocs.description);
			if (txt)
				docs.tags.push({
					kind: StructureKind.JSDocTag,
					tagName: 'link',
					text: txt
				});
		}
		method.parameters.forEach(p => {
			let jsTxt = this.makeJsDocTxt(p.oae['summary'], p.oae.description);
			const jsTxts: string[] = [];
			p.resolveTypes().forEach(t => {
				let desc = '';
				if (t.nodeKind === 'array') {
					if ((t as ArraySchema).items.oae.description)
						desc = (t as ArraySchema).items.oae.description;
					else if ((t as ArraySchema).items.name)
						desc = '@see ' + (t as ArraySchema).items.getIdentifier('intf');
				}
				if (!desc) {
					if (t.oae.description)
						desc = t.oae.description;
					else if (t.name)
						desc = '@see ' + t.getIdentifier('intf');
				}
				if (desc)
					jsTxts.push(desc);
			});
			if ((!jsTxt) && jsTxts.length > 0)
				jsTxt = jsTxts.join(os.EOL);
			const jsDoc = <JSDocTagStructure>{
				kind: StructureKind.JSDocTag,
				tagName: 'param',
				text: p.getIdentifier() + (jsTxt ? '\t' + jsTxt : '')
			};
			docs.tags.push(jsDoc);
		});
		const returnTypes = method.responses.getAcceptableTypes();
		const returnDoc = returnTypes.map(t => {
			if (t) {
				if (t.nodeKind === 'array') {
					if ((t as ArraySchema).items.oae.description)
						return (t as ArraySchema).items.oae.description;
					else if ((t as ArraySchema).items.name)
						return '@see ' + (t as ArraySchema).items.getIdentifier('intf');
				}
				if (t.oae.description)
					return t.oae.description;
				else if (t.name)
					return '@see ' + t.getIdentifier('intf');
			}
			return null;
		}).filter(n => !!n?.trim());
		if (returnDoc.length > 0)
			docs.tags.push({
				kind: StructureKind.JSDocTag,
				tagName: 'return',
				text: returnDoc.join(os.EOL)
			});
		if (docs.description || docs.tags?.length > 0)
			return docs;
		return undefined;
	}

	protected inspectApiInterfaceMethod(intf: MethodSignature) {
		const method = intf.$ast;
		method.parameters.forEach(p => {
			const types = p.resolveTypes();
			const typeTxt = types.map(t => {
				const tsType = this.resolveType(t, 'intf');
				this.importModelIfNotSameFile(intf, t);
				return this.tsTypeToText(tsType);
			}).join(' | ');
			const param = intf.addParameter({
				name: p.getIdentifier(),
				hasQuestionToken: !p.required,
				type: typeTxt
			});
			bindAst(param, p);
			bindAst(param.getTypeNode(), types.length === 1 ? types[0] : types);
		});
		const returnTypes = method.responses.getAcceptableTypes();
		const returnType = this.makeSchemasUnionType(returnTypes, 'intf').getTypeNode().print();
		returnTypes.forEach(s => s && this.importModelIfNotSameFile(intf, s));
		intf.setReturnType(returnType);
		bindAst(intf.getReturnTypeNode(), returnTypes.length === 1 ? returnTypes[0] : returnTypes);

		if (codeGenConfig.emitDescriptions) {
			const docs = this.makeApiMethodDoc(method);
			if (docs)
				intf.addJsDoc(docs);
		}
	}

	protected inspectApiClass(impl: ClassDeclaration, intf?: InterfaceDeclaration) {
		const api = impl.$ast as ApiTag;
		api.methods.forEach(m => {
			let method = impl.addMethod({
				name: m.getIdentifier()
			});
			bindAst(method, m);
			try {
				this.inspectApiClassMethod(method, intf?.getMethod(m.getIdentifier()));
			}
			catch (err) {
				console.warn(err.message + ' Skipping method generation for operation ' + m.oae.operationId);
				method.remove();
			}
		});
		if (codeGenConfig.emitDescriptions) {
			let docs: JSDocStructure;
			if (intf) {
				if (intf.getJsDocs()?.length > 0) {
					docs = <JSDocStructure>{
						kind: StructureKind.JSDoc,
						tags: [{
							kind: StructureKind.JSDocTag,
							tagName: 'inheritDoc'
						}]
					};
				}
				else
					docs = this.makeApiDoc(api);
			}
			else
				docs = this.makeApiDoc(api);
			if (docs)
				impl.addJsDoc(docs);
		}
	}

	protected inspectApiClassMethod(impl: MethodDeclaration, intf?: MethodSignature) {
		const method = impl.$ast;
		let contentType: string = undefined as any;
		method.parameters.forEach(p => {
			if (p.nodeKind === 'request' && codeGenConfig.role === 'client')
				contentType = Array.from((p as ParameterRequestBody).types.keys())[0];
			const initializers = new Set();
			const types = p.resolveTypes();
			const typeTxt = types.map(t => {
				this.importModelIfNotSameFile(impl, t);
				const deflt = typeof t.oae.default === 'string' ? '\'' + t.oae.default + '\'' : t.oae.default;
				if (typeof deflt !== 'undefined')
					initializers.add(deflt);
				return this.tsTypeToText(this.resolveType(t, 'intf'));
			}).join(' | ');
			const param = impl.addParameter({
				name: p.getIdentifier(),
				hasQuestionToken: !p.required,
				type: typeTxt,
				initializer: p.required && initializers.size === 1 ? String(Array.from(initializers)[0]) : undefined
			});
			bindAst(param, p);
			bindAst(param.getTypeNode(), types.length === 1 ? types[0] : types);
		});
		const returnTypes = method.responses.getAcceptableTypes();
		const returnType = this.makeSchemasUnionType(returnTypes, 'intf').getTypeNode().print();
		returnTypes.forEach(s => s && this.importModelIfNotSameFile(impl, s));
		impl.setReturnType(returnType);
		bindAst(impl.getReturnTypeNode(), returnTypes.length === 1 ? returnTypes[0] : returnTypes);
		impl.addBody();
		if (contentType)
			this.setPreDefinedHttpHeader(impl, 'content-type', contentType);

		if (codeGenConfig.emitDescriptions) {
			let docs: JSDocStructure;
			if (intf) {
				if (intf.getJsDocs()?.length > 0) {
					docs = <JSDocStructure>{
						kind: StructureKind.JSDoc,
						tags: [{
							kind: StructureKind.JSDocTag,
							tagName: 'inheritDoc'
						}]
					};
				}
				else
					docs = this.makeApiMethodDoc(method);
			}
			else
				docs = this.makeApiMethodDoc(method);
			if (docs)
				impl.addJsDoc(docs);
		}
	}

	protected setPreDefinedHttpHeader(impl: MethodDeclaration, key: string, value: string) {
		const definedHdrsStatement = this.ensurePreDefinedHdrsStatement(impl);
		const definedHdrsDecl = definedHdrsStatement.getDeclarations().find(decl => decl.getName() === DefinedHdrsName);
		const struct = Object.assign({}, definedHdrsDecl.getStructure());
		const obj = JSON.parse(struct.initializer as string ?? '{}');
		obj[key] = value;
		struct.initializer = JSON.stringify(obj);
		definedHdrsDecl.set(struct);
	}

	private ensurePreDefinedHdrsStatement(impl: MethodDeclaration): VariableStatement {
		let definedHdrsStatement = impl.getStatement(s => {
			if (s instanceof VariableStatement)
				return !!s.getDeclarations().find(d => d.getName() === DefinedHdrsName);
			return false;
		});
		if (!definedHdrsStatement) {
			definedHdrsStatement = impl.insertVariableStatement(0, {
				declarationKind: VariableDeclarationKind.Const,
				declarations: [{
					name: DefinedHdrsName,
					type: 'Record<string,string>',
					initializer: '{}',
				}],
			});
		}
		return definedHdrsStatement as VariableStatement;
	}

	protected inspectApiHandler(impl: ClassDeclaration) {

	}

	protected resolveApi(api: ApiTag, mode: 'intf' | 'impl' | 'hndl') {
		const identifier = api.getIdentifier(mode);
		let t = this.namedTypes.get(identifier);
		if (t)
			return t;
		let intf: InterfaceDeclaration;
		if (codeGenConfig.apiIntfDir && mode === 'intf') {
			const filePath = path.join(this.project.getCompilerOptions().outDir, api.getFilepath('intf')) + '.ts';
			let sf = this.project.getSourceFile(filePath);
			if (!sf)
				sf = this.project.createSourceFile(filePath);
			intf = sf.getInterfaces().find(i => i.getName() === identifier);
			if (!intf) {
				intf = sf.addInterface({
					name: identifier,
					isExported: true
				});
				bindAst(intf, api);
				this.namedTypes.set(identifier, intf);
				this.inspectApiInterface(intf);
			}
			return intf;
		}
		if (codeGenConfig.apiImplDir && mode === 'impl') {
			const filePath = path.join(this.project.getCompilerOptions().outDir, api.getFilepath('impl')) + '.ts';
			let sf = this.project.getSourceFile(filePath);
			if (!sf) {
				// Can be configured to only generate api-impl if non-existent
				if (codeGenConfig.role === 'server' && safeLStatSync(filePath))
					return;
				sf = this.project.createSourceFile(filePath);
			}
			let impl = sf.getClasses().find(i => i.getName() === identifier);
			if (!impl) {
				intf = this.resolveApi(api, 'intf') as InterfaceDeclaration;
				impl = sf.addClass({
					name: identifier,
					isExported: true,
					implements: intf ? [intf.getName()] : undefined
				});
				bindAst(impl, api);
				if (intf)
					importIfNotSameFile(impl, intf, intf.getName());
				this.namedTypes.set(identifier, intf);
				this.inspectApiClass(impl, intf);
				return intf;
			}
		}
		if (codeGenConfig.apiHndlDir && mode === 'hndl') {
			const filePath = path.join(this.project.getCompilerOptions().outDir, api.getFilepath('hndl')) + '.ts';
			let sf = this.project.getSourceFile(filePath);
			if (!sf)
				sf = this.project.createSourceFile(filePath);
			let impl = sf.getClasses().find(i => i.getName() === identifier);
			if (!impl) {
				const intf = this.resolveApi(api, 'intf') as InterfaceDeclaration;
				const impl = sf.addClass({
					name: identifier,
					isExported: true
				});
				bindAst(impl, api);
				if (intf)
					importIfNotSameFile(impl, intf, intf.getName());
				this.namedTypes.set(identifier, intf);
				this.inspectApiHandler(impl);
			}
		}
	}

	/**
	 * Get the TypeScript type 'name' (aka typeof) a Model (number, Date, string, FooBar, etc).
	 * @param type  undefined = 'void', null = 'any', otherwise the schema to be converted to a string.
	 * @param mode  If the type is named, this will determine which identifier to use.
	 */
	protected resolveType(type: TypeSchema, mode: 'intf' | 'impl' | 'anon'): Node {
		if (typeof type === 'undefined')
			return this.nativeTypes.get('void');
		if (type === null)
			return this.nativeTypes.get('any');
		if (type.name && mode !== 'anon') {
			let t = this.namedTypes.get(type.getIdentifier(mode));
			if (t)
				return t;
		}
		else {
			switch (type.oaType) {
				case 'object':
					// Not named, so it is either a type literal (aka inline interface) or an object literal (inline object).
					// Further, we don't support object literals, because openapi could not specify their values.  Yes schema have default values, but that is not the same as a const object literal.
					if (mode === 'intf') {
						const intf = this.typeToInlineType(type, '{}', SyntaxKind.TypeLiteral);
						(type as RecordSchema).properties.forEach((v, k) => {
							this.importModelIfNotSameFile(intf, v);
							intf.addProperty({
								name: (type as RecordSchema).propertyIdentifier(k),
								hasQuestionToken: !(type as RecordSchema).propertyIsRequired(k),
								type: this.tsTypeToText(this.resolveType(v, 'intf'))
							});
						});
						const ap = (type as RecordSchema).additionalProperties;
						if (ap) {
							const valueType = ap === true ? 'any' : this.tsTypeToText(this.resolveType(ap, 'intf'));
							if (valueType)
								intf.addIndexSignature({
									keyName: 'key',
									keyType: 'string | number',
									returnType: valueType
								});
						}
						return intf;
					}
					return undefined;
				case 'boolean':
					return this.nativeTypes.get('boolean');
				case 'number':
				case 'integer':
					return this.nativeTypes.get('number');
				case 'string':
					const f = type.oae.format;
					if (f === 'date-time' || f === 'date')
						return this.nativeTypes.get('Date');
					else if (f === 'binary')
						return this.nativeTypes.get('ArrayBuffer');
					else if (Array.isArray(type.oae.enum) && type.oae.enum.length > 0) {
						// Not named, so do it as a string literal
						const enumLiterals = type.oae.enum.map(s => '\'' + nameUtils.setCase(s, codeGenConfig.enumElemCasing) + '\'').join(' | ');
						let l = this.nativeTypes.get(enumLiterals);
						if (!l) {
							l = this.tempFile.addTypeAlias({
								name: this.makeFakeIdentifier(),
								type: enumLiterals
							});
							this.nativeTypes.set(enumLiterals, l);
						}
						return l;
					}
					else
						return this.nativeTypes.get('string');
				case 'array':
					const items = this.resolveType((type as ArraySchema).items, mode);
					const itemsTxt = this.tsTypeToText(items);
					const keyName = 'Array<' + itemsTxt + '>';
					let t = this.nativeTypes.get(keyName);
					if (!t) {
						// Because an array is a 'native' type, we define this genericized array in the tempFile so we can easily extract it's text (much like Date).
						const fake = this.tempFile.addTypeAlias({
							name: this.makeFakeIdentifier(),
							type: 'Array'
						});
						bindAst(fake, type);
						(fake.getTypeNode() as TypeReferenceNode).addTypeArgument(itemsTxt);
						this.nativeTypes.set(keyName, fake);
						t = fake;
					}
					return t;
			}
		}

		const joinTypesAs = (types: TypeSchema[], typeKind: SyntaxKind) => {
			// We need to first recursively resolve all the types that are used to compose this one (but we ignore schema that have no type as they are not really schema).
			const tsTypes = types.filter(e => e.oae.type).map(e => this.resolveType(e, mode));
			const tsTxts = tsTypes.map(e => this.tsTypeToText(e));
			let sep = typeKind === SyntaxKind.IntersectionType ? ' & ' : ' | ';
			if (type.name)
				return this.typeToNamedAliasType(type, tsTxts.join(sep));
			// Not certain that
			return this.typeToInlineType(type, tsTxts.join(sep), tsTypes.length > 1 ? typeKind : SyntaxKind.TypeReference);
		};

		if (type.nodeKind === 'record') {
			let intf: InterfaceDeclaration;
			if (codeGenConfig.modelIntfDir && mode === 'intf') {
				const filePath = path.join(this.project.getCompilerOptions().outDir, type.getFilepath('intf')) + '.ts';
				let sf = this.project.getSourceFile(filePath);
				if (!sf)
					sf = this.project.createSourceFile(filePath);
				const identifier = type.getIdentifier('intf');
				intf = sf.getInterfaces().find(i => i.getName() === identifier);
				if (!intf) {
					intf = sf.addInterface({
						name: identifier,
						isExported: true
					});
					bindAst(intf, type);
					this.namedTypes.set(identifier, intf);
					this.inspectTypeInterface(intf);
				}
				return intf;
			}
			if (codeGenConfig.modelImplDir && mode === 'impl') {
				const filePath = path.join(this.project.getCompilerOptions().outDir, type.getFilepath('impl')) + '.ts';
				let sf = this.project.getSourceFile(filePath);
				if (!sf)
					sf = this.project.createSourceFile(filePath, '', {overwrite: false});
				const identifier = type.getIdentifier('impl');
				let impl = sf.getClasses().find(i => i.getName() === identifier);
				if (!impl) {
					const i = this.resolveType(type, 'intf');
					if (i.getKind() === SyntaxKind.InterfaceDeclaration)
						intf = i as InterfaceDeclaration;
					impl = sf.addClass({
						name: identifier,
						isExported: true,
						implements: intf ? [intf.getName()] : undefined
					});
					bindAst(impl, type);
					if (intf)
						importIfNotSameFile(impl, intf, intf.getName());
					this.namedTypes.set(identifier, impl);
					this.inspectTypeClass(impl, intf);
				}
				return impl;
			}
		}
		else if (type.nodeKind === 'type' && type.oaType === 'string' && Array.isArray(type.oae.enum) && type.oae.enum.length > 0 && mode === 'intf') {
			const filePath = path.join(this.project.getCompilerOptions().outDir, type.getFilepath('intf')) + '.ts';
			let sf = this.project.getSourceFile(filePath);
			if (!sf)
				sf = this.project.createSourceFile(filePath, '', {overwrite: false});
			const identifier = type.getIdentifier('intf');
			let intf = sf.getEnums().find(i => i.getName() === identifier);
			if (!intf) {
				intf = sf.addEnum({
					name: identifier,
					isConst: true,
					isExported: true,
					members: type.oae.enum.map(s => {
						return {
							name: nameUtils.setCase(s, codeGenConfig.enumElemCasing),
							value: s
						};
					})
				});
				bindAst(intf, type);
				this.namedTypes.set(identifier, intf);
				this.inspectTypeEnum(intf);
			}
			return intf;
		}
		else if (type.oae.allOf) {
			return joinTypesAs(type.allOf, SyntaxKind.UnionType);
		}
		else if (type.oae.anyOf) {
			return joinTypesAs(type.anyOf, SyntaxKind.IntersectionType);
		}
		else if (type.oae.oneOf) {
			return joinTypesAs(type.oneOf, SyntaxKind.UnionType);
		}
		else {
			// this must be a type alias because it has a name but is not a record or an enum.
			if (codeGenConfig.modelIntfDir && mode === 'intf') {
				const me = this.resolveType(type, 'anon');
				return this.typeToNamedAliasType(type, this.tsTypeToText(me));
			}
		}
		return undefined;
	}

	protected typeToNamedAliasType(target: TypeSchema, typeTxt: string) {
		const filePath = path.join(this.project.getCompilerOptions().outDir, target.getFilepath('intf')) + '.ts';
		let sf = this.project.getSourceFile(filePath);
		if (!sf)
			sf = this.project.createSourceFile(filePath);
		const identifier = target.getIdentifier('intf');
		let alias = sf.getTypeAliases().find(i => i.getName() === identifier);
		if (!alias) {
			alias = sf.addTypeAlias({
				name: identifier,
				type: typeTxt
			});
			bindAst(alias, target);
			this.namedTypes.set(identifier, alias);
		}
		return alias;
	}

	protected typeToInlineType<TKind extends SyntaxKind>(target: TypeSchema, typeTxt: string, typeKind: TKind): KindToNodeMappings[TKind] {
		const intf = (this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: typeTxt
		})).getFirstDescendantByKindOrThrow(
			typeKind
		);
		bindAst(intf, target);
		return intf;
	}

	protected tsTypeToText(tsType: Node) {
		if (typeof tsType === 'undefined')
			return 'void';
		if (tsType === null)
			return 'any';
		// Now things get harder.  It is an Object literal, a String literal, or an enum.
		switch (tsType.getKind()) {
			case SyntaxKind.TypeLiteral:
			case SyntaxKind.IntersectionType:
			case SyntaxKind.UnionType:
			case SyntaxKind.TypeReference:
				return tsType.print();
			case SyntaxKind.TypeAliasDeclaration:
				return (tsType as TypeAliasDeclaration).getTypeNode().print();
			case SyntaxKind.EnumDeclaration:
			case SyntaxKind.InterfaceDeclaration:
				return (tsType as (EnumDeclaration | InterfaceDeclaration)).getName();
			case SyntaxKind.ClassDeclaration:
				return (tsType as ClassDeclaration).getName();
			default:
				break;
		}
		throw new Error('Unsupported Node: ' + tsType.getKind());
	}

	protected initNativeTypes() {
		this.nativeTypes = new Map<string, TypeAliasDeclaration>();
		// We need some place to store native types and literals (we only ever copy their text, we don't emit or reference).
		this.tempFile = this.project.createSourceFile(TempFileName, '', {overwrite: true});
		this.nativeTypes.set('void', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'void'
		}));
		this.nativeTypes.set('any', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'any'
		}));
		this.nativeTypes.set('boolean', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'boolean'
		}));
		this.nativeTypes.set('number', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'number'
		}));
		this.nativeTypes.set('string', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'string'
		}));
		this.nativeTypes.set('Date', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'Date'
		}));
		this.nativeTypes.set('Array', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'Array'
		}));
		this.nativeTypes.set('ArrayBuffer', this.tempFile.addTypeAlias({
			name: this.makeFakeIdentifier(),
			type: 'ArrayBuffer'
		}));
	}

	/**
	 * Helper to ensure we do not have collisions for the things we dump into @see tempFile
	 * This just returns a unique, but valid typescript identifier.
	 */
	protected makeFakeIdentifier(): string {
		let id = nameUtils.setCase(randomUUID().replace('-', ''), 'pascal');
		let match = /([^a-z]*)(.+)/ig.exec(id);
		id = id.slice(match[1].length) + match[0];
		return id;
	}

	/**
	 * Helper to create the text for a TypeScript "Type Union" (e.g. A | B).
	 * NOTE: This is not set theory, it is TypeScript: A | B
	 */
	protected makeSchemasUnionType(schemas: TypeSchema[], mode: 'intf' | 'impl'): TypeAliasDeclaration {
		// If any element is any, it's all 'any'
		if (schemas === null || schemas?.some(s => s === null))
			return this.nativeTypes.get('any');
		// If the array is undefined, then clearly there is nothing.
		if (typeof schemas === 'undefined' || schemas?.length === 0)
			return this.nativeTypes.get('void');
		const typeTexts = Array.from(new Set(schemas.map(s => this.tsTypeToText(this.resolveType(s, mode))).sort())).filter(s => s !== 'void');
		const txt = typeTexts.length > 0 ? typeTexts.join(' | ') : 'void';
		let retVal = this.nativeTypes.get(txt);
		if (!retVal) {
			retVal = this.tempFile.addTypeAlias({
				name: this.makeFakeIdentifier(),
				type: txt
			});
			this.nativeTypes.set(txt, retVal);
		}
		return retVal;
	}

	// noinspection JSUnusedGlobalSymbols
	/**
	 * Helper to create the text for a TypeScript "Type Intersection" (e.g. A & B).
	 * NOTE: This is not set theory, it is TypeScript: A & B
	 */
	protected makeTypeIntersection(schemas: TypeSchema[], mode: 'intf' | 'impl'): TypeAliasDeclaration {
		// If any element is any, it's all 'any'
		if (schemas === null || schemas?.some(s => s === null))
			return this.nativeTypes.get('any');
		// If the array is undefined, then clearly there is nothing.
		if (typeof schemas === 'undefined' || schemas?.length === 0)
			return this.nativeTypes.get('void');
		const typeTexts = Array.from(new Set(schemas.map(s => this.tsTypeToText(this.resolveType(s, mode))).sort())).filter(s => s !== 'void');
		const txt = typeTexts.length > 0 ? typeTexts.join(' & ') : 'void';
		let retVal = this.nativeTypes.get(txt);
		if (!retVal) {
			retVal = this.tempFile.addTypeAlias({
				name: this.makeFakeIdentifier(),
				type: txt
			});
			this.nativeTypes.set(txt, retVal);
		}
		return retVal;
	}

	/**
	 * @see schemaTypeToText
	 * In order to get the typeof native things like string, boolean, string literals, and as generic types like Array<FooBar> or Baz<FooBar>,
	 * We need a temporary place to define those that we can toss once we have finished grabbing their 'typeof' text.
	 */
	protected tempFile: SourceFile;
	/**
	 * @see schemaTypeToText and @see tempFile
	 * It is expensive to support the typeof functionality, so we cache it once we have generated it the first time.
	 */
	protected nativeTypes: Map<string, TypeAliasDeclaration>;
	/**
	 * @see schemaTypeToText and @see tempFile
	 * It is expensive to support the typeof functionality, so we cache it once we have generated it the first time.
	 */
	protected namedTypes: Map<string, Node>;
}
