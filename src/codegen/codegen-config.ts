import {cloneDeep, merge, mergeWith} from 'lodash';
import {IndentationText, NewLineKind, QuoteKind, ScriptTarget} from 'ts-morph';
import {interpolateBashStyle} from '../shared';
import {SourceCodeFormat} from '../ts-morph/base';
import * as nameUtils from './name-utils';
import {NameCase} from './name-utils';

export const BaseCodeGenConfig = {
	allModels: false, // If true generate all models in the spec, if false only generate those models referenced by operations in the spec.
	outputDirectory: undefined as string,

	// Fine-grained control over *BOTH* where things are stored *AND* what gets generated!
	modelIntfDir: 'models',  // if truthy, generate model interfaces
	modelImplDir: null as string,  // if truthy, generate model classes
	modelPrivDir: null as string,  // if falsy, modelImplDir will be used when/if needed.
	apiIntfDir: 'apis',  // if truthy, generate api interfaces
	apiImplDir: 'services',  // if truthy, generate api classes
	apiPrivDir: null as string, // if falsy, apiImplDir will be used when/if needed.
	apiHndlDir: 'handlers', // Ignored if the role is not 'server'.

	// How should identifiers and files be cased?
	intfNameCasing: 'pascal' as NameCase,
	implNameCasing: 'pascal' as NameCase,
	hndlNameCasing: 'pascal' as NameCase,
	enumNameCasing: 'pascal' as NameCase,
	enumElemCasing: 'camel' as NameCase,
	fileCasing: 'kebab' as NameCase,

	// What should identifiers end with?
	modelSuffix: '',
	apiSuffix: 'api',
	intfPrefix: '',
	intfSuffix: '',
	implPrefix: '',
	implSuffix: 'srvc',
	hndlSuffix: 'handler',
	intfFileSuffix: '',
	implFileSuffix: 'srvc',
	hndlFileSuffix: 'handler',
	// Fine-grained control over how identifiers are named
	intfName_Tmpl: `#{name} #{typeSuffix} #{intfSuffix}`,
	implName_Tmpl: '#{name} #{typeSuffix} #{implSuffix}',
	hndlName_Tmpl: '#{name} #{hndlSuffix}',
	apiIntfName_Tmpl: null as string,
	apiImplName_Tmpl: null as string,
	modelIntfName_Tmpl: null as string,
	modelImplName_Tmpl: null as string,
	// Fine-grained control over file names.
	fileBasename_Tmpl: '#{name} #{typeSuffix}',
	intfFileBasename_Tmpl: '#{name} #{typeSuffix} #{intfFileSuffix}',
	implFileBasename_Tmpl: '#{name} #{typeSuffix} #{implFileSuffix}',
	hndlFileBasename_Tmpl: '#{name} #{hndlFileSuffix}',
	modelIntfFileBasename_Tmpl: null as string,
	modelImplFileBasename_Tmpl: null,
	apiIntfFileBasename_Tmpl: null as string,
	apiImplFileBasename_Tmpl: null as string,

	role: 'client' as 'client' | 'server',
	target: 'browser' as 'browser' | 'node' | 'any',
	emitDescriptions: true,
	generators: {} as Record<string, any>,
	xSchemaNaming: {
		aliasMap: undefined as Record<string, any>,
		nameMap: undefined as Record<string, any>
	}
};

export const ClientCodeGenConfig = {
	client: {
		// Ordered list of request MediaTypes (RegEx allowed) which the code generator can use to choose a RequestBodyObject from the content types in an OperationObject.
		// See: https://dev.to/bcanseco/request-body-encoding-json-x-www-form-urlencoded-ad9
		reqMediaTypes: [
			'application/x-www-form-urlencoded',
			'multipart/form-data',
			'application/octet-stream',
			'text/plain',
			'application/json'
		],
		// Keep in mind that every response will be processed by the http-client, this simply helps define the 'body' response type.
		acceptMediaTypes: [
			'application/octet-stream',
			'application/json',
			'text/plain'
		],
		libs: {
			xml: undefined
		},
		httplib: 'fetch' as unknown as ('fetch' | 'node' | 'axios' | 'angular')
	}
};

export const TsMorphCodeGenConfig = {
	generators: {
		tsmorph: {
			format: SourceCodeFormat,
			project: {
				manipulationSettings: {
					indentationText: IndentationText.Tab,
					newLineKind: NewLineKind.LineFeed,
					quoteKind: QuoteKind.Single,
				},
				compilerOptions: {
					outDir: undefined as string,
					target: ScriptTarget.ES2021
				}
			},
			client: {
				support: {
					// Full (parent) path name to the files to be copied into the target support directory
					srcDirName: `${__dirname}/../typescript/client/support`,
					// Always specified relative to apiIntfDir
					dstDirName: '../internal',
					// Source files to be copied into the internal support directory.
					// Path should be relative to 'srcDirName'
					files: [
						`client-utils.ts`,
						`http-client.ts`,
						`http-client.#{lib}.ts`,
						`index.ts`,
					]
				},
				dependencyInjection: 'async-injection' as unknown as ('async-injection' | 'angular'),
				di: {
					'async-injection': {
						// This is my project ;-) so by default I'm promoting the best TypeScript DI!
						intfImport: [{
							moduleSpecifier: 'async-injection',
							namedImports: ['InjectionToken']
						}],
						implImport: [{
							moduleSpecifier: 'async-injection',
							namedImports: ['Injectable', 'Inject', 'Optional', 'InjectableId']
						}],
						apiIntfTokens: [{
							name_Tmpl: '#{intfName}Token',
							initializer_Tmpl: 'new InjectionToken<#{intfName}>(\'#{intfLabel}\')'
						}],
						apiImplTokens: [{
							name_Tmpl: '#{implName}ConfigToken',
							initializer_Tmpl: 'Symbol.for(\'#{intfLabel}ClientConfig\') as InjectableId<ApiClientConfig>'
						}],
						apiConstruction: {
							implDecorator: [{
								name: 'Injectable',
								arguments: []
							}],
							httpClientInject: [
								{name: 'Inject', arguments: ['ApiHttpClientToken']}
							],
							apiConfigInject: [
								{name: 'Inject', arguments: ['#{implName}ConfigToken']},
								{name: 'Optional', arguments: []}
							]
						},
						// Really tried to avoid templating, but given the differences in DI impls, this lodash template was unavoidable.
						// NOTE: Relative imports are more difficult to determine, so the code handles importing the Token and Class.
						apiSetup: `import { Container } from 'async-injection';
							export function setup(di: Container, httpClient: ApiHttpClient): void {
								if (!di.isIdKnown(ApiHttpClientToken)) 
									di.bindConstant(ApiHttpClientToken, httpClient);<% apis.forEach(function(api) { %>
								if (!di.isIdKnown(<%- api.getIdentifier('intf') %><%- intfTokensExt %>)) 
									di.bindClass(<%- api.getIdentifier('intf') %><%- intfTokensExt %>, <%- api.getIdentifier('impl') %>).asSingleton();<% }); %>
							}
						`
					},
					'angular': {
						intfImport: [{
							moduleSpecifier: '@angular/core',
							namedImports: ['InjectionToken']
						}],
						implImport: [{
							moduleSpecifier: '@angular/core',
							namedImports: ['Inject', 'Injectable', 'Optional', 'InjectionToken']
						}],
						apiIntfTokens: [{
							name_Tmpl: '#{intfName}Token',
							initializer_Tmpl: 'new InjectionToken<#{intfName}>(\'#{intfLabel}\')'
						}],
						apiImplTokens: [{
							name_Tmpl: '#{implName}ConfigToken',
							initializer_Tmpl: 'new InjectionToken<ApiClientConfig>(\'#{intfLabel}ClientConfig\')'
						}],
						apiConstruction: {
							implDecorator: [{
								name: 'Injectable',
								arguments: []
							}],
							httpClientInject: [
								{name: 'Inject', arguments: ['ApiHttpClientToken']}
							],
							apiConfigInject: [
								{name: 'Inject', arguments: ['#{implName}ConfigToken']},
								{name: 'Optional', arguments: []}
							]
						},
						// might need useValue
						apiSetup: `
							import { NgModule, ModuleWithProviders, SkipSelf, Optional } from '@angular/core';
							import {HttpClientModule, HttpClient} from "@angular/common/http";
							@NgModule({
							  imports:      [HttpClientModule],
							  declarations: [],
							  exports:      [],
							  providers: [<% apis.forEach(function(api) { %>
							    { provide: <%- api.getIdentifier('intf') %><%- intfTokensExt %>, useClass: <%- api.getIdentifier('impl') %> },<% }); %>
							  ]
							})
							export class ApiModule {
							    public static forRoot(httpClientFcty: (angularHttpClient: HttpClient) => ApiHttpClient, apiConfFcty: (key: string) => ApiClientConfig): ModuleWithProviders<ApiModule> {
							        return {
							            ngModule: ApiModule,
							            providers: [<% apis.forEach(function(api) { %>
							                { provide: <%- api.getIdentifier('impl') %><%- confTokensExt %>, useFactory: apiConfFcty, deps: ["<%- api.getIdentifier('intf') %>"]},<% }); %>
							                { provide: ApiHttpClientToken, useFactory: httpClientFcty, deps: [HttpClient] } 
							            ]
							        };
							    }
							    constructor( @Optional() @SkipSelf() parentModule: ApiModule) {
							        if (parentModule)
							            throw new Error('ApiModule is already loaded. Import in your base AppModule only.');
							    }
							}
						`
					}
				}
			},
			server: {
				// The framework should actually be the npm package name.
				framework: 'openapi-backend' as ('openapi-backend' | 'express-openapi-validator' | 'fastify-openapi-glue'),
				'openapi-backend': {
					stubReturn: 'null',
					context: {
						type: 'Context',
						imphorts: [{
							moduleSpecifier: 'openapi-backend',
							namedImports: ['Context']
						}],
					},
					hndl: {
						imphorts: [{
							moduleSpecifier: 'openapi-backend',
							namedImports: ['Context', 'Handler']
						},{
							moduleSpecifier: 'express',
							namedImports: ['Request', 'Response', 'NextFunction']
						},{
							moduleSpecifier: '#{internal}',
							namedImports: ['processApiResult']
						}],
						lookup: {
							body: 'ctx.request.requestBody',
							query: 'ctx.request.query.#{name}',
							path: 'ctx.request.params.#{name}',
							header: 'ctx.request.headers.#{name}',
							cookie: `ctx.request.cookies['#{name}']`
						},
						body: `(ctx: Context<#{body}, #{path}, #{query}, #{header}, #{cookie}>, _: Request, res: Response, next: NextFunction) => {
						\tconst result = #{apiInvocation};
						\treturn processApiResult(ctx as unknown as Context, result, res, next);
						}`,
						cast: '{[operationId: string]: Handler;}'
					}
				},
				'fastify-openapi-glue': {
					stubReturn: 'null',
					context: {
						type: 'Context',
						imphorts: [{
							moduleSpecifier: '#{internal}',
							namedImports: ['Context']
						}],
					},
					hndl: {
						imphorts: [{
							moduleSpecifier: 'fastify',
							namedImports: ['FastifyRequest', 'FastifyReply']
						},{
							moduleSpecifier: '#{internal}',
							namedImports: ['Context', 'processApiResult']
						}],
						lookup: {
							body: 'req.body',
							query: 'req.query.#{name}',
							path: 'req.params.#{name}',
							header: 'req.headers.#{name} as #{type}',
							cookie: `req.cookies['#{name}']`   // This presumes the presence of @fastify/cookie
						},
						body: `(req: FastifyRequest<{Body: #{body}, Params: #{path}, Querystring: #{query}, Headers: #{header}, Reply: #{reply}}>, rsp: FastifyReply) => {
						\tconst ctx = {request: req, response: rsp};
						\tconst result = #{apiInvocation};
						\treturn processApiResult(req, result, rsp);
						}`,
						cast: undefined as unknown as string
					}
				},
				'express-openapi-validator': {
					stubReturn: 'null',
					context: {
						type: 'Context',
						imphorts: [{
							moduleSpecifier: '#{internal}',
							namedImports: ['Context']
						}],
					},
					hndl: {
						imphorts: [{
							moduleSpecifier: 'express',
							namedImports: ['Request', 'Response', 'NextFunction', 'RequestHandler']
						},{
							moduleSpecifier: '#{internal}',
							namedImports: ['Context', 'processApiResult']
						}],
						lookup: {
							body: 'req.body',
							query: 'req.query.#{name}',
							path: 'req.params.#{name}',
							header: `req.headers['#{name}'] as string`,
							cookie: `req.cookies['#{name}']`
						},
						operationId: '"$#{pattern}!#{method}"',
						body: `(req: Request<#{path}, #{reply}, #{body}, #{query}>, res: Response<#{reply}>, next: NextFunction) => {
						\tconst ctx = {request: req, response: res};
						\tconst result = #{apiInvocation};
						\treturn processApiResult(req as unknown as Request, result, res as unknown as Response, next);
						}`,
						cast: 'Record<string, RequestHandler>'
					}
				},
				support: {
					// Full (parent) path name to the files to be copied into the target support directory
					srcDirName: `${__dirname}/../typescript/server/support`,
					// Always specified relative to apiIntfDir
					dstDirName: '../internal',
					// Source files to be copied into the internal support directory.
					// Path should be relative to 'srcDirName'
					files: [
						`index.ts`,
						`http-response.ts`,
						// This file is to complex to generate the code; Copy an appropriate framework template.
						{'result-processor.ts': `#{framework}_result-processor.ts`}
					]
				},
				dependencyInjection: 'async-injection' as unknown as ('async-injection'),
				di: {
					'async-injection': {
						// This is my project ;-) so by default I'm promoting the best TypeScript DI!
						intfImport: [{
							moduleSpecifier: 'async-injection',
							namedImports: ['InjectionToken']
						}],
						implImport: [{
							moduleSpecifier: 'async-injection',
							namedImports: ['Injectable', 'Inject']
						}],
						apiIntfTokens: [{
							name_Tmpl: '#{intfName}Token',
							initializer_Tmpl: 'new InjectionToken<#{intfName}>(\'#{intfLabel}\')'
						}],
						apiConstruction: {
							implDecorator: [{
								name: 'Injectable',
								arguments: []
							}]
						},
						apiSetup: `import { Container } from 'async-injection';
							export function setup(di: Container): void {<% apis.forEach(function(api) { %>
								if (!di.isIdKnown(<%- api.getIdentifier('intf') %>Token)) 
									di.bindClass(<%- api.getIdentifier('intf') %>Token, <%- api.getIdentifier('impl') %>).asSingleton();<% }); %>
							}
						`
					}
				}
			}
		}
	}
};

// An internal constant that should contain all the properties and configuration known to this project.
// This does not mean that it will (or even needs to) contain properties invented/defined by extension/plugins.
const DefaultCodeGenConfig = merge(merge(merge(merge(cloneDeep(BaseCodeGenConfig), TsMorphCodeGenConfig), ClientCodeGenConfig)));

type BaseCodeGenConfigType = Partial<typeof BaseCodeGenConfig> & Partial<typeof ClientCodeGenConfig>;

function CodeGenConfig() {
	return {
		loadConfigObject(config: object) {
			if (config && typeof config === 'object') {
				config = JSON.parse(JSON.stringify(config));     // Lame attempt at avoiding exploits.
				mergeWith(this, config, (objValue, srcValue, key, object) => {
					if (key?.startsWith('!')) {
						object[key.substring(1)] = srcValue;
						return null;
					}
				}); // Perform a deep merge of this latest config into the current config.
			}
		},

		loadConfigArgs(args?: string[]) {
			// Now add any command line defined configuration properties.
			args?.forEach((v) => {
				let kvp = v.trim().split('=');
				let value: any;
				try {
					value = JSON.parse(kvp[1]);
				}
				catch {
					value = kvp[1];
				}
				lodash.set(this, kvp[0], value); // We validated the key already
			});
		},

		toIntfName(name: string, type: 'api' | 'model'): string {
			let templ = this.intfName_Tmpl;
			if (type === 'api' && this.apiIntfName_Tmpl)
				templ = this.apiIntfName_Tmpl;
			else if (type === 'model' && this.modelIntfName_Tmpl)
				templ = this.modelIntfName_Tmpl;
			let iname = interpolateBashStyle(templ, {name: name, typeSuffix: this.typeSuffix(type), intfSuffix: this.intfSuffix});
			return nameUtils.setCase(iname, this.intfNameCasing);
		},

		toIntfFileBasename(name: string, type: 'api' | 'model'): string {
			let templ = this.intfFileBasename_Tmpl;
			if (type === 'api' && this.apiIntfFileBasename_Tmpl)
				templ = this.apiIntfFileBasename_Tmpl;
			else if (type === 'model' && this.modelIntfFileBasename_Tmpl)
				templ = this.modelIntfFileBasename_Tmpl;
			let fname = interpolateBashStyle(templ, {name: name, typeSuffix: this.typeSuffix(type), intfFileSuffix: this.intfFileSuffix});
			return nameUtils.setCase(fname, this.fileCasing);
		},

		toImplName(name: string, type: 'api' | 'model'): string {
			let templ = this.implName_Tmpl;
			if (type === 'api' && this.apiImplName_Tmpl)
				templ = this.apiImplName_Tmpl;
			else if (type === 'model' && this.modelImplName_Tmpl)
				templ = this.modelImplName_Tmpl;
			let iname = interpolateBashStyle(templ, {name: name, typeSuffix: this.typeSuffix(type), implSuffix: this.implSuffix});
			return nameUtils.setCase(iname, this.implNameCasing);
		},

		toHndlName(name: string): string {
			let templ = this.hndlName_Tmpl;
			let iname = interpolateBashStyle(templ, {name: name, hndlSuffix: this.hndlSuffix});
			return nameUtils.setCase(iname, this.hndlNameCasing);
		},

		toOperationName(name: string): string {
			return nameUtils.setCase(name, 'camel');
		},

		toPropertyName(name: string): string {
			return nameUtils.setCase(name, 'camel');
		},

		toParameterName(name: string): string {
			return nameUtils.setCase(name, 'camel');
		},

		toImplFileBasename(name: string, type: 'api' | 'model'): string {
			let templ = this.implFileBasename_Tmpl;
			if (type === 'api' && this.apiImplFileBasename_Tmpl)
				templ = this.apiImplFileBasename_Tmpl;
			else if (type === 'model' && this.modelImplFileBasename_Tmpl)
				templ = this.modelImplFileBasename_Tmpl;
			let fname = interpolateBashStyle(templ, {name: name, typeSuffix: this.typeSuffix(type), implFileSuffix: this.implFileSuffix});
			return nameUtils.setCase(fname, this.fileCasing);
		},

		toHndlFileBasename(name: string): string {
			let templ = this.hndlFileBasename_Tmpl;
			let fname = interpolateBashStyle(templ, {name: name, hndlFileSuffix: this.hndlFileSuffix});
			return nameUtils.setCase(fname, this.fileCasing);
		},

		typeSuffix(type: string) {
			switch (type) {
				case 'api':
					return this.apiSuffix;
				case 'model':
					return this.modelSuffix;
				default:
					return '';
			}
		}
	};
}

export type CodeGenConfig<T extends BaseCodeGenConfigType = BaseCodeGenConfigType> = T & ReturnType<typeof CodeGenConfig>;

export function makeCodeGenConfig<T extends BaseCodeGenConfigType = BaseCodeGenConfigType>(config?: T): CodeGenConfig {
	return Object.setPrototypeOf(CodeGenConfig(), merge(DefaultCodeGenConfig, config));
}
