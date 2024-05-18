import {OpenAPIV3, OpenAPIV3_1} from 'openapi-types';

export declare namespace TargetOpenAPI {
	type Document<T extends {} = {}> = OpenAPIV3.Document<T> | OpenAPIV3_1.Document<T>;
	type ReferenceObject = OpenAPIV3.ReferenceObject | OpenAPIV3_1.ReferenceObject;
	type SecuritySchemeObject = OpenAPIV3.SecuritySchemeObject | OpenAPIV3_1.SecuritySchemeObject;
	type ComponentsObject = OpenAPIV3.ComponentsObject | OpenAPIV3_1.ComponentsObject;
	type OperationObject<T extends {} = {}> = OpenAPIV3.OperationObject<T> | OpenAPIV3_1.OperationObject<T>;
	type ParameterObject = OpenAPIV3_1.ParameterObject | OpenAPIV3.ParameterObject;
	type HeaderObject = OpenAPIV3_1.HeaderObject | OpenAPIV3.HeaderObject;
	type SchemaObjectType = OpenAPIV3_1.NonArraySchemaObjectType | OpenAPIV3_1.ArraySchemaObjectType;
	type SchemaObject = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;
	type PathItemObject<T extends {} = {}> = OpenAPIV3.PathItemObject<T> | OpenAPIV3_1.PathItemObject<T>;
	type TagObject = OpenAPIV3.TagObject | OpenAPIV3_1.TagObject;
	type ParameterBaseObject = OpenAPIV3.ParameterBaseObject | OpenAPIV3_1.ParameterBaseObject;
	type MediaTypeObject = OpenAPIV3.MediaTypeObject | OpenAPIV3_1.MediaTypeObject;
	type RequestBodyObject = OpenAPIV3.RequestBodyObject | OpenAPIV3_1.RequestBodyObject;
	type ResponseObject = OpenAPIV3.ResponseObject | OpenAPIV3_1.ResponseObject;
	type ResponsesObject = OpenAPIV3.ResponsesObject | OpenAPIV3_1.ResponsesObject;
	type EncodingObject = OpenAPIV3.EncodingObject | OpenAPIV3_1.EncodingObject;
	type ArraySchemaObject = OpenAPIV3.ArraySchemaObject | OpenAPIV3_1.ArraySchemaObject;
	type NonArraySchemaObject = OpenAPIV3.NonArraySchemaObject | OpenAPIV3_1.NonArraySchemaObject;
	type NonArraySchemaObjectType = OpenAPIV3.NonArraySchemaObjectType | OpenAPIV3_1.NonArraySchemaObjectType;
	type ArraySchemaObjectType = OpenAPIV3.ArraySchemaObjectType | OpenAPIV3_1.ArraySchemaObjectType;
}

