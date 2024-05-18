import {Node} from 'ts-morph';
import {ApiTag} from '../lang-neutral/api-tag';
import {LangNeutral} from '../lang-neutral/lang-neutral';
import {MethodOperation} from '../lang-neutral/method-operation';
import {ParameterParameter} from '../lang-neutral/parameter-parameter';
import {ParameterRequestBody} from '../lang-neutral/parameter-requestbody';
import {TypeSchema} from '../lang-neutral/type-schema';

declare module 'ts-morph' {
	interface InterfaceDeclaration {
		readonly $ast: ApiTag | TypeSchema;
	}

	interface ClassDeclaration {
		readonly $ast: ApiTag | TypeSchema;
	}

	interface MethodSignature {
		readonly $ast: MethodOperation;
	}

	interface MethodDeclaration {
		readonly $ast: MethodOperation;
	}

	interface ParameterDeclaration {
		readonly $ast: ParameterParameter | ParameterRequestBody;
	}

	interface PropertySignature {
		readonly $ast: TypeSchema;
	}

	interface PropertyDeclaration {
		readonly $ast: TypeSchema;
	}

	interface EnumDeclaration {
		readonly $ast: TypeSchema;
	}

	interface TypeAliasDeclaration {
		readonly $ast: TypeSchema;
	}

	interface TypeNode {
		readonly $ast: TypeSchema;
	}
}

export function bindAst<T = Node, A = LangNeutral>(obj: T, ast: A) {
	if (obj && (!obj.hasOwnProperty('$ast')))
		Object.defineProperty(obj, '$ast', {
			get() {
				return ast;
			}
		});
	return obj;
}
