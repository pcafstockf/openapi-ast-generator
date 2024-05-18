import {TargetOpenAPI} from '../openapi-supported-versions';
import {TypeSchema} from './type-schema';

/**
 * record and array are subclass/extensions of type
 *  'record' is a heterogeneous collection of values that correspond to the OA/JSON 'object' type
 *      But calling it an 'object' is ambiguous (is it a type/interface/record, or instance), so we go with record.
 *  'array' is *usually* a homogeneous collection of values and always correspond to the OA/JSON 'array' type.
 *      Array is also somewhat different in that it is effectively a native type (like string, number, boolean, etc), but often with a generic specifier.
 *  'type' Describes the remaining OA/JSON types (string, integer, number, boolean, null).
 */
export type NodeKind = 'api' | 'method' | 'parameter' | 'request' | 'return' | 'type' | 'record' | 'array';

export interface LangNeutralJson {
	nodeKind: string;
	location: string[],

	[key: string]: any
}

export interface LangNeutral {
	readonly nodeKind: NodeKind;

	toJSON(): LangNeutralJson;
}

// It is critical that the collection of nodes be a directed graph.
// Parents know who their children are, but ancestors are unknown.
// The reference oriented nature of OpenApi means that most any child can be "included/referenced" from multiple "parent" nodes.
// Any given node/child should know where it is in the hierarchy of the document, but that does not mean other parts of the document do not also contain references to it.

export type TypeSchemaResolver = (s: TargetOpenAPI.SchemaObject | TargetOpenAPI.ReferenceObject, location?: string[]) => TypeSchema;
