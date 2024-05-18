# openapi-ast-generator

This project is about transformations.  
OpenApi is itself an AbstractSyntaxTree that describes a json centric Domain Specific Language.   
The idea of this project is to perform transformations on an OpenApi "Ast".  
Specifically this project aims to transform an OpenApi Ast into a code generation Ast useful in an object-oriented language.
The code generation Ast contains 3 primary nodes:
* A `Model` (aka OpenApi ObjectSchema)
* An `Api` (aka OpenApi TagObject)
* A `Method` (aka OpenApi OperationObject)

A `Method` is part of an `Api`, and there is a `SourceFile` Ast that owns each `Model` and `Api`.  
Unlike traditional Ast and even OpenApi itself, these Ast nodes are **interfaces**.  
They expose methods to operate on data, but how they store that data is up to them.  
To simplify, we will refer to these interfaces as the "`CodeGenAst`"

Initial target for the project is TypeScript client and server.  Those are easiest because well... This is a TypeScript project.  
I use Java and C++ a fair bit, so those would be nice, but the project might not ever go beyond TypeScript because of the way this first implementation has been done. 
Please factor that into your decisions, because I'm not committing to anything other than TypeScript for now.  
Contributions and suggestions welcomed!

The **first pipeline** is a preparation step that processes command line options, cleans, consolidates, and optimizes an OpenApi specification document.
The excellent `@apidevtools/swagger-parser` is used for this step along with a few other open-source libraries and snippets.
It imports the  specifications (yaml, json, etc), optimize the specification for our purposes and is able to emit a consolidated and IMO, optimized specification, 
which can be used as the json input to swagger-ui, or openapi-backend, etc.

The **second pipeline** is a base class `OpenApiAstVisitor` which walks/visits an OpenApi document and provides helper methods and extension points 
that a subclass can use to provide a logical transformation into the `CodeGenAst`.  
An `OpenApiTSMorphAstTransformer` class inherits from `OpenApiAstVisitor`.
As the OpenApi specification is visited, it creates the `CodeGenAst`, **BUT**, the **implementation** of those interfaces utilizes ts-morph to store the data.
In other words, a `Model` produced by `OpenApiTSMorphAstTransformer` will (internally) contain a reference to a ts-morph `InterfaceDeclaration` (and perhaps `ClassDeclaration`).

At this stage the `CodeGenAst` has no real personality.  
They have names and types but are not specific to a client or server implementation (e.g. no underlying code statements).  
They are not opinionated in any way, they just describes the OpenApi document in a ts-morph sort of way.

The **third pipeline** is meant to add personality to the ts-morph based `CodeGenAst`.  
This is where you produce client vs server specific code.  
You might for instance add a constructor to your `Api` implementation class, 
or add a dependency injection constant to your `Api` interface, 
or enhance `Method` with signature overloads, an appropriate body, etc.

This is a highly configurable tool because most developers have strong feelings about generated code.  :-)  
Personally, I feel that if generated code performs the simple task assign to it, I don't really care what it looks like, or even if I have to jump through some hoops to fit it into my project. It's works and I did not have to spend time on it.  
However opinions vary, so defaults are provided for everything, but at the same time you can override/customize to your hearts content.
