/**
 * This module defines an intricate set of links between OpenApi elements and
 * code generation Abstract Syntax Trees defined for this project.
 * Each OpenApi element of interest is injected with an '$ast' property
 * which back links to a code generation AST.
 * Each code generation AST has a reference to the OpenApi element it is derived from.
 * The net result is the ability to visit elements of an OpenApi Document
 * and populate / update the code generation AST nodes.
 */
import {TargetOpenAPI} from '../openapi-supported-versions';

/**
 * This is what the @see OpenApiIterator and it's subclasses are all about (producing this structure).
 * This structure is then passed to an implementation of @see CodeGenAstTransformer
 */
export interface CodeGenAst<API extends AbsApiAST, MODEL extends AbsModelAST> {
	apis: API[];
	models: MODEL[];
}

/**
 * Defines a reverse link from a @see TargetOpenAPI.TagObject back to its derived @see AbsApiAST.
 */
export type TagApiBacklink<API extends AbsApiAST> = TargetOpenAPI.TagObject & {
	readonly $doc: TargetOpenAPI.Document;
	readonly $ast: API;
}

/**
 * All APIs produced by the code generator implement this base.
 * NOTE: There is one node for an API (regardless of intf, impl, hndl, etc.).
 */
export interface AbsApiAST<M extends AbsMethodAST = AbsMethodAST> {
	/**
	 * Unique identifier for this OpenApi derived node.
	 */
	readonly uuid: string;
	/**
	 * @see TargetOpenAPI.TagObject.name
	 * NOTE: This may or may not be the name of an Api interface or class (that is up to the code generator).
	 */
	readonly name: string;
	readonly tag: TagApiBacklink<this>;
	readonly methods: M[];
}

/**
 * Defines a reverse link from a @see TargetOpenAPI.SchemaObject back to a language specific type definition.
 */
export type SchemaTypeBacklink<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> = TargetOpenAPI.SchemaObject & {
	readonly $doc: TargetOpenAPI.Document;
	readonly $ast: T;
}

/**
 * This node is the base "type" node.
 * It represents native types, inline types, as well as global "Models".
 */
export interface AbsSchemaTypeAST {
	/**
	 * Unique identifier for this OpenApi derived node.
	 */
	readonly uuid: string;

	readonly schema: SchemaTypeBacklink<this>;
}

/**
 * All Models produced by the code generator implement this base.
 * All Models are schema, but not all schema are models (e.g. inline schema, arrays, etc).
 * NOTE: There is one node for a Model (regardless of intf, impl, hndl, etc.).
 */
export type AbsModelAST<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> = T & {
	/**
	 * Last segment of TargetOpenAPI.ReferenceObject.$ref.
	 *  For example given:
	 *      #/components/schemas/AccountStatusTypes
	 *  'AccountStatusTypes' is the name.
	 * NOTE: This may or may not be the name of a Model interface or class (that is up to the code generator).
	 */
	readonly name: string;
}

/**
 * Complex schemas allow the specification of a different encoding for each schema property.
 * They are an artifact of this project, and do not have a close correlation to OpenApi.
 * NOTE:
 *  Unlike Models, @see ComplexSchema are not the global definition of a model.
 *  Complex schemas are a reference to a global model definition and a particular encoding for a specific parameter, body, response, etc.
 *  Calling them EncodableSchemas would therefore also be incorrect, as it might imply the schema was encodable as opposed to a encoding pattern for a global schema.
 *  Further, OpenApi sometimes refers to a schema without specifying an encoding pattern.
 * TODO: I think this means a complex schema (when it has encodings) is always multi-part or www-form-encoded.
 */
export interface ComplexSchema<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> {
	schema: SchemaTypeBacklink<T>;
	encodings?: { [propertyName: string]: TargetOpenAPI.EncodingObject };
}

/**
 * Defines a reverse link from a @see TargetOpenAPI.ParameterObject back to its derived @see AbsMethodParameterAST.
 */
export type ParameterBacklink<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> = TargetOpenAPI.ParameterObject & {
	readonly $ast: AbsMethodParameterAST<T>;
}

/**
 * Node which represents a parameter to a method.
 * NOTE:
 * In OpenApi, it is possible for a parameter to be "shared" among multiple operations.
 * (e.g. inherited from TargetOpenAPI.PathItemObject)
 */
export interface AbsMethodParameterAST<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> {
	/**
	 * Discriminator allowing us to store a body in the same list as a parameter.
	 */
	type: 'parameter';
	/**
	 * Unique identifier for this OpenApi derived node.
	 */
	readonly uuid: string;
	/**
	 * Reference to the OpenAPI node this sprang from.
	 */
	parameter: ParameterBacklink<T>;
	/**
	 * By default, a parameter is serialized by the method specified in @see ParameterObject.style which defaults as:
	 *  query & cookie: form-data (aka RFC6570) (e.g. x=1024&y=768).
	 *  path & header: simple text (aka RFC6570) (e.g. 1024,768).
	 * A complete list of style values and how each gets serialized can be found here:
	 *  https://swagger.io/specification/#style-values
	 * However if you need alternative serialization approach's, say you want to serialize a json object into a query param,
	 * the param is then specified using a media-type (the style property is ignored).
	 *      in: query
	 *      content[application/json]
	 *          schema
	 * NOTE: This is not the same as defining how individual properties of a schema will be encoded (@see TargetOpenAPI.EncodingObject).
	 */
	mediaType?: string;
	/**
	 * Note that all this info is inside @see parameter, but summarizing it here makes code generation a little easier.
	 */
	schema: ComplexSchema<T>;
}

/**
 * Defines a reverse link from a @see TargetOpenAPI.RequestBodyObject back to its derived @see AbsMethodRequestBodyAST.
 */
export type RequestBodyBacklink<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> = TargetOpenAPI.RequestBodyObject & {
	readonly $ast: AbsMethodRequestBodyAST<T>;
}

export interface AbsMethodRequestBodyAST<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> {
	/**
	 * Discriminator allowing us to store a body in the same list as a parameter.
	 */
	type: 'body';
	/**
	 * Unique identifier for this OpenApi derived node.
	 */
	readonly uuid: string;
	/**
	 * Typically 'body', but guaranteed to be unique within the list of parameters for a given method.
	 */
	name: string;
	/**
	 * Reference to the OpenAPI node this sprang from.
	 */
	requestBody: RequestBodyBacklink<T>;
	/**
	 * This is a key definition for producing the body parameter for an api method.
	 * The philosophy is that a server accepts whatever a server says it accepts (and the server defines the specification).
	 * So clients should *choose* the "best" sending mechanism from what the server declares that it accepts.
	 * To that end, this is an important article: https://dev.to/bcanseco/request-body-encoding-json-x-www-form-urlencoded-ad9
	 * It highlights the fact that some sending mechanisms are more efficient than others.
	 * This project allows users to configure what mechanisms they would like to use (constrained of course by what the server offers).
	 * To that end, this property is an *ordered* key mapping of media-types to complex schemas.
	 * Each key will be the most preferred media-type for its collection of schemas.
	 * Every (flattened) value (aka schema) in the entire map will be unique within the map.
	 * In other words, every schema will be listed under it's *most* preferred (available) sending mechanism.
	 * NOTE: An empty map means we have no approved mechanism for sending the request body.
	 */
	schemas: Map<string, ComplexSchema<T>[]>;
}

/**
 * Defines a reverse link from a @see TargetOpenAPI.ResponsesObject back to its derived @see AbsMethodResponsesAST.
 */
export type ResponsesBacklink<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> = TargetOpenAPI.ResponsesObject & {
	readonly $ast: AbsMethodResponsesAST<T>;
}

export interface AbsMethodResponsesAST<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> {
	/**
	 * Unique identifier for this OpenApi derived node.
	 */
	readonly uuid: string;
	/**
	 * Reference to the OpenAPI node this sprang from.
	 */
	responses: ResponsesBacklink<T>;
	/**
	 * MediaTypes the client is willing to accept from the server.
	 */
	acceptableMediaTypes: string[];
	/**
	 * Possible response schemas from the server.
	 * WARNING:
	 *  Due to nesting of media types within response codes, there is *not* a one to one correlation between the supplied 'accept' header and the returned schema.
	 */
	schemas: ComplexSchema<T>[];
}

/**
 * Defines a reverse link from a @see TargetOpenAPI.OperationObject back to its derived @see AbsMethodAST.
 * This is particularly important because OpenApi Operations do not really contain all the data needed to produce a method.
 */
export type PathItemBacklink = TargetOpenAPI.PathItemObject & {
	readonly $doc: TargetOpenAPI.Document;
}

/**
 * Defines a reverse link from a @see TargetOpenAPI.OperationObject back to its derived @see AbsMethodAST.
 * This is particularly important because OpenApi Operations do not really contain all the data needed to produce a method.
 */
export type OperationMethodBacklink<M extends AbsMethodAST> = TargetOpenAPI.OperationObject & {
	readonly $parent: PathItemBacklink;
	readonly $ast: M;
}

/**
 * A method is the fundamental part of an API (which is just a grouping of methods).
 * However, there are a lot of pieces and parts from OpenApi that go into producing a method.
 * This node tries to bring all those together in a structure that is more friendly toward code generation than OpenApi itself.
 */
export interface AbsMethodAST<T extends AbsSchemaTypeAST = AbsSchemaTypeAST> {
	/**
	 * Unique identifier for this OpenApi derived node.
	 */
	readonly uuid: string;
	/**
	 * @see TargetOpenAPI.OperationObject.operationId.
	 * If OpenApi does not specify an operationId, one will be manufactured that is a valid language neutral identifier.
	 *  If none of operationId, 'x-router-controller' or 'x-swagger-router-controller' properties exist on an operation,
	 *  a name will be generated using the http method and path pattern (again as a valid language neutral identifier).
	 */
	readonly name: string;
	readonly pattern: string;
	readonly pathItem: TargetOpenAPI.PathItemObject;
	readonly httpMethod: string;
	readonly operation: OperationMethodBacklink<this>;
	/**
	 * An ordered list of parameters for a method.
	 * Note this is from a methods' perspective, and therefore includes the request body (if there is one) at an appropriate position in the array.
	 */
	readonly parameters: (AbsMethodParameterAST<T> | AbsMethodRequestBodyAST<T>)[];
	/**
	 * A quick utility method to extract the body from the list of parameters.
	 */
	body?: AbsMethodRequestBodyAST<T>;
	/**
	 * Allows for computation of the methods return type.
	 */
	responses: AbsMethodResponsesAST<T>;
	/**
	 * Extracted from relevant security schemes for this operation
	 */
	security?: {
		httpAuth?: { basic?: boolean, bearer?: string };
		apiKey?: Record<'header' | 'query' | 'cookie', string[]>;
	};
}
