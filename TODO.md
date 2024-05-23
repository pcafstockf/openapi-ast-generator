Implement an Angular config
Support Fastify and Express native via a Json Schema type approach.
Support express-openapi-validator and maybe fastify-openapi-glue
express-openapi-validator auto-wire requires a fixed file structure layout that breaks when webpacked.
Since we are supporting native Express and Fastify (e.g. registering url endpoints), just do the same for express-openapi-validator.

Clean up the docs.
Don't forget to fix tsconfig rootDir (from "./" back to "./src/") and remove the `include` of "test-out/**/*".
Commit to git

Finish serialization support???
Don't know what this ancient todo was for: 
    Ensure we generate a 'title' property for all named schema in the bundle.

Future:
Implement an undici http client.
Any reason to consider server input (or client response reading) using: https://www.npmjs.com/package/fast-json
Do the openapi platforms we are supporting on the server use (maybe via ajv): https://www.npmjs.com/package/fast-json-stringify/v/1.11.0
Would it be worth plugging this into sending client side data: https://www.npmjs.com/package/fast-json-stringify/v/1.11.0

Create a flag that optionally produces TypeBox or JsonSchema models (and typeof interfaces where the interfaces are used in the API).
It is important to note that both TypeBox and JsonSchema define data structures (aka models), not API definitions/methods.
Perhaps also generate (for fastify servers), a FastifySchema describing the endpoint (not just the models).
Note that JsonSchema/TypeBox can describe a response model, but not the enclosing response code (which is a FastifySchema thing).
Further, perhaps for servers we generate a TypeBox/JsonSchema not just for the models, but also for inlines such as ${OperationId}QueryParamsSchema
If so this should be dumped into the api directory not the models directory.

Use the TypeScript Compiler Api to allow user customizations, meaning you can define your own transformer pipeline.
Implement:
"schema": {
"type": "object",
"additionalProperties": {
"type": "integer",
"format": "int32"
}
}
Which basically means:
{
... other properties here, and then:
[propertyName: string]: number;
}

Grails VM:
We want to be able to run inside a Grails VM, so that we can write generators in other languages like Java and Python.
The goal is not to use Grails to generate TypeScript, only to remove the heavily lifting of all the steps up to the point where we have a language-neutral AST where a Java or Python generator could take over.
We will not have the native node libraries, but we can webpack everything else.
Maybe provide something like ts.CompilerHost that would allow the code to bypass native node_modules for the code needed to get to a language-neutral AST.
