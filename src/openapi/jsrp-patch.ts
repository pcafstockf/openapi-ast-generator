/*
 * This file inspired by: https://github.com/APIDevTools/swagger-parser/issues/127
 * That issue lead me to this gist:  https://gist.github.com/marcelstoer/750739c6e3b357872f953469ac7dd7ad
 * Many thanks to marcelstoer!
 * This file has been further modified to ensure items land where we expect (e.g. some items may be deeper than just grandchildren of the top level schcema.
 * We already have lodash in our project, so that made things even easier (just convert the path to dotted notation and use lodash.set/get).
 */
require('@apidevtools/json-schema-ref-parser/lib/bundle').remap = function (inventory, parser) {
	redefinedRemap(parser, parser, 'schema', new Map(inventory.map(i => [i.$ref.$ref, i.value])));
};
const $Ref = require('@apidevtools/json-schema-ref-parser/lib/ref');
const lodash = require('lodash');

/**
 * Alternative implementation to json-schema-ref-parser/lib/bundle.js:remap().
 *
 * @param {object} bundle The Swagger model of the final bundle i.e. the result schema.
 * @param {object} parent The parent object in which the below key is contained.
 * @param {string} key    parent[key] is the object to be processed by the function.
 * @param {map} $refMap   Maps a $ref string (internal or external) to the object being referenced. These objects are
 *                        the ones being bundled into the result schema.
 */
function redefinedRemap(bundle, parent, key, $refMap) {
	let obj = key === null ? parent : parent[key];

	if (obj && typeof obj === 'object') {
		// Determines whether the given value is a JSON reference, and whether it is allowed by the options.
		if ($Ref.isAllowed$Ref(obj)) {
			// 'obj' may be an external $ref object like e.g.
			// {"$ref": "../../../../technical-definitions/common-types/v1/common-types-model.yaml#/parameters/Page"}
			// or an internal $ref object. Since this function works recursively through all references one cannot ignore
			// the internal ones (i.e. whose target object is already part of the bundle). They may be internal to an
			// external file in which case its value still has to be pulled in.
			let hash = obj.$ref.substring(obj.$ref.indexOf('#'));     // -> #/parameters/Page
			const objTypePath = hash.substring(2, hash.lastIndexOf('/')).replace('/', '.');    // -> parameters
			const refName = hash.substring(hash.lastIndexOf('/') + 1); // -> Page
			const refNamePath = objTypePath + '.' + refName;
			// Make sure there is an parent object to hold our resoled ref
			lodash.set(bundle.schema, objTypePath, lodash.get(bundle.schema, objTypePath) || {});
			// Only process the object to-be-bundled if it's not included in the bundle schema already.
			let refObj = $refMap.get(obj.$ref);
			if (!Object.is(lodash.get(bundle.schema, refNamePath), refObj)) {
				// Ensure the object to-be-bundled does not contain any external references itself -> remap it recursively.
				delete refObj.$ref;
				lodash.set(bundle.schema, refNamePath, refObj);
				$refMap.set(hash, refObj);
				redefinedRemap(bundle, refObj, null, $refMap);
			}
			// Remap the $ref to the local path of the now bundled object.
			if (parent[key].$ref)
				parent[key].$ref = hash;
		}
		else {
			// Recursively iterate over all children.
			for (let childKey of Object.keys(obj))
				redefinedRemap(bundle, obj, childKey, $refMap);
		}
	}
}
