import {OpenAPIV3, OpenAPIV3_1} from 'openapi-types';

type RefResolverFn<T = any> = (obj: any) => { obj: T, ref?: string };

// noinspection JSUnusedGlobalSymbols
export default function consolidateQueryParams(doc: OpenAPIV3.Document | OpenAPIV3_1.Document, refResolver: RefResolverFn, cmdArgs: Record<string, any>, codeGenConfig: any): Promise<void> {
	for (let upath in doc.paths) {
		upath = refResolver(upath).obj;
		for (let method in doc.paths[upath]) {
			method = refResolver(method).obj;
			const operation = doc.paths[upath][method];
			if (operation.parameters) {
				const queryRequired: Record<string, boolean> = {};
				// Find all obj[prop] style parameters
				const paramGroups = operation.parameters.map(p => refResolver(p).obj).reverse().reduce((acc, param, idx, arr) => {
					if (param.in === 'query') {
						const match = param.name.match(/^(\w+)\[(\w+)]$/);
						if (match) {
							const [, base, prop] = match;
							if (!acc[base]) {
								acc[base] = {};
							}
							queryRequired[base] = (queryRequired[base] || param.required) ?? false;
							acc[base][prop] = {
								...param,
								name: prop  // Change name to property name
							};
							// This is a nested param, so we want to remove it from the operations.
							// We are operating on a reverse of operation.parameters, so we can effectively remove back to front.
							// But keep in mind, that it is shrinking based on this spliceing, so we need to reference the original length.
							operation.parameters.splice(arr.length - 1 - idx, 1);
						}
					}
					return acc;
				}, {});
				// Add consolidated parameters
				for (const [base, props] of Object.entries(paramGroups)) {
					const schemaName = base + 'Query';
					const schemaObj = {
						type: 'object' as any,
						required: queryRequired[base] ? [] : undefined,
						properties: {}
					};
					for (const [prop, param] of Object.entries(props)) {
						if (param.required)
							schemaObj.required.push(prop);
						schemaObj.properties[prop] = {
							type: param.schema.type,
							description: param.description
						};
					}
					doc.components.schemas[schemaName] = schemaObj;
					operation.parameters.push({
						in: 'query',
						name: base,
						style: 'deepObject',
						explode: true,
						schema: {$ref: '#/components/schemas/' + schemaName}
					});
				}
			}
		}
	}
	return Promise.resolve();
}
