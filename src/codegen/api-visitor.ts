import {AbsApiAST, AbsModelAST, CodeGenAst} from '../openapi/openapi-ast-nodes';

export interface ApiVisitor {
	visitApis(api: CodeGenAst<AbsApiAST, AbsModelAST>);
}
