# openapi-ast-generator

This project is about transformations.  
OpenApi is itself an AbstractSyntaxTree that describes a json centric Domain Specific Language.   
The idea of this project is to perform transformations on an OpenApi "AST".  
Specifically this project aims to transform an OpenApi Ast into a code generation Ast, expressed in an object-oriented language paradigm.  
The code generation Ast contains 3 primary Ast nodes:
* A `Model` (aka OpenApi ObjectSchema)
* An `Api` (aka OpenApi TagObject)
* A `Method` (aka OpenApi OperationObject)

Each of these Ast will contain a reference back to the underlying OpenApi data record.  
A `Method` is part of an `Api`, and there is a `SourceFile` that owns each `Model` and `Api` (e.g. records / structures, and objects).  
Unlike traditional Ast and even OpenApi itself, these Ast nodes are **interfaces** (as opposed to data records / structures).  
They expose methods to operate on data, but how they store that data is up to them.  
To simplify, we will refer to these Ast interfaces as the "`CodeGenAst`"

## Configuration / Customization
The code produced by openapi-ast-generator is highly customizable and configuration driven
(explained in greater detail below).

## Transformation

The **first processing pipeline** is a preparation step that processes command line options, cleans, consolidates, and optimizes an OpenApi specification document.
The excellent `@apidevtools/swagger-parser` is used for this step along with a few other open-source libraries and snippets.
It imports the  specifications (yaml, json, etc.), optimize the specification (for our purposes) and is able to emit a consolidated (and IMO), optimized specification, 
which can be used as the json input to swagger-ui, or openapi-backend, etc.

The **second pipeline** is a base class `OpenApiAstVisitor` which walks / visits an OpenApi document and provides helper methods and extension points 
that a subclass can use to provide a logical transformation into the `CodeGenAst`.  
An `OpenApiTSMorphAstTransformer` class inherits from `OpenApiAstVisitor`.
As the OpenApi specification is visited, this class builds the `CodeGenAst`, **BUT**, the **implementation** of those interfaces utilizes ts-morph to store the data.
In other words, a `Model` produced by `OpenApiTSMorphAstTransformer` will (internally) contain a reference to a ts-morph `InterfaceDeclaration` (and perhaps `ClassDeclaration`).  
This is where the file structure begins to take place.  ts-morph Interfaces and Classes for various aspects of the Models and Apis are assigned into configurable locations.
Moreover, those ts-morph structures will have an `$ast` property set that is a reference back to the `CodeGenAst`.  

At this stage, we have ts-morph nodes that reference back to appropriate `CodeGenAst` nodes, which reference back to appropriate OpenApi data structures.
However, the ts-morph nodes have no real personality yet.
They have names and types but are not specific to a client or server implementation (e.g. no underlying code statements).  
They are not opinionated in any way, they just describe aspects of the OpenApi document from a ts-morph point of view.

The **third pipeline** is meant to add personality to the ts-morph based `CodeGenAst`.  
This is where you produce client vs server specific code.  
You might for instance add a constructor to your `Api` implementation class, 
or add a dependency injection constant to your `Api` interface, 
or enhance `Method` with signature overloads, an appropriate body, etc.  
This is done by walking the ts-morph structure of the code, referencing back to the `CodeGenAst` and even the OpenApi data structures as needed for code generation.  
This pipeline is highly dependent on the configuration you provide (all have defaults that you can override).  
Wherever possible, configuration is defined as ts-morph compatible `Structures`. 
However in some cases, implementations (especially for certain framework / library targets) just can't be generically addressed with ts-morph structures. 
In these scenarios the configuration falls back to simple lodash templates to augment code generation as a last resort.

This is a highly configurable tool because most developers have strong feelings about generated code.  :-)  
Personally, I feel that if generated code performs the simple task assign to it, I don't really care what it looks like, or even if I have to jump through some hoops to fit it into my project. It's works and I did not have to spend time on it.  
However opinions vary, so defaults are provided for everything, but at the same time you can override / customize to your hearts content.

## Notice
This project is early stage (version < 1.0) and the code is still pretty raw.  
The whole idea of transforming OpenAPI to a `CodeGenAst`, and then into ts-morph is (to my knowledge) new, and I am feeling my way through this.  
In other words, rather than a cohesive smooth flow, you can see how my understanding evolved over the course of the project.  
For example, ts-morph understandably destroys all of its own AST nodes (and rebuilds them) when a source file is reformatted.
This of course plays havoc with the binding that I inject into some ts-morph nodes so that they can trace their way back to the `CodeGenAst` that created them.
So, I had to create a GOF Memento pattern to capture these bindings just before ts-morph reformats and then restore the bindings afterward.
The point is lots of this was developed with a hack and try mentality.

With that said, it produces a PetStore client (axios or node http based) and server (openapi-backend based) that both work and I like the way it looks / works.  
So, I decided to publish this initial effort and see where it goes.

Initial target for the project was a TypeScript client and server.  
Those are easiest because well... This is a TypeScript project.  
I use Java and C++ a fair bit, so those would be nice, but the project might not ever go beyond TypeScript because of the way this first implementation has been done.
Please factor that into your decisions, because I'm not committing to anything other than TypeScript for now.  
Contributions and suggestions welcome!

## Next Steps
I am a big fan of `Angular` and of `openapi-backend`.  
Generating an Angular based client is first on my list.  
After that I will likely develop a Fastify server based on `fastify-openapi-glue` (and / or maybe just plain `Fastify`).
If I do implement the native Fastify approach, the OpenApi spec used for input will need to be >= v3.1, so I can use Json Schema.  
`express-openapi-validator` seems pretty popular, so that might be something I pursue.  
Webpacking this project to a single file standalone cli tool is also high on my list.  
Lets see how all that goes, and perhaps a version 2 will support a Java Jakarta EE server and a C++ client.

## Warning
Currently I have tsconfig setup such that all top level files are covered.  
This is a little funky, but allows we to generate clients and servers within this project and quickly verify / test their code.  
Before this project moves to v1.0, I will alter tsconfig to be more traditional.
