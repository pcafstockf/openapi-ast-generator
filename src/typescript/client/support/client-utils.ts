export function stringifyRequestBody(value: any, contentType: string) {

	return value;
}

/**
 *
 * @param operator    Begins the entire string
 * @param identifier Describes the variable being serialized
 * @param delimiter Marks the boundaries between multiple elements or multiple KeyValuePairs
 * @param separator Separates a Key from its Value.
 * @param value The primitive, array, or object to be serialized.
 */
export function stringifyRequestParameter(identifier: string, delimiter: string, separator: string, value: any) {
	if (Array.isArray(value)) {
		if (delimiter === ',')
			return identifier + value.map(v => String(v)).join(delimiter);
		return value.map(v => identifier + String(v)).join(delimiter);
	}
	else if (typeof value === 'object' && value) {
		if (separator.length > 1)
			return Object.keys(value).map(key => identifier + key + separator + String(value[key])).join(delimiter);
		else {
			const trailing = Object.keys(value).map(key => key + separator + String(value[key])).join(delimiter);
			if (separator !== '=')
				return identifier + trailing;
			return trailing;
		}
	}
	return identifier + String(value);
}
