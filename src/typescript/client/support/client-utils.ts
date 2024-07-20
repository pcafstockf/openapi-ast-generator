
export function stringifyRequestBody(value: any, contentType: string) {
	return value;
}

/**
 * In the absence of a dependent library, this lookup table allows us to quickly serialize parameters (client side) based on style / explode attributes.
 * <p>
 * Assume a param named 'color' has one of the following values:<br/>
 * 	primitive -> true<br/>
 * 	array -> ["blue","black","brown"]<br/>
 * 	object -> { "R": 100, "G": 200, "B": 150 }<br/>
 * </p>
 */
//     empty   prim           array                               obj
export const ParamSerializers = Object.freeze({
	// matrix
	// ;color  ;color=true    ;color=blue,black,brown             ;color=R,100,G,200,B,150
	m: (name: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return `;${name}`;
			return `;${name}=${value.join(',')}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return `;${name}`
			return keys.reduce((p, v, i) => {
				p += `${i > 0 ? ',' : ''}${v},${value[v]}`;
				return p;
			}, `;${name}=`)
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return `;${name}`;
		return `;${name}=${String(value)}`;
	},
	// matrix-explode
	// ;color  ;color=true    ;color=blue;color=black;color=brown ;R=100;G=200;B=150
	me: (name: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return `;${name}`;
			return `;${name}=${value.join(`;${name}=`)}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return `;${name}`
			return keys.reduce((p, v) => {
				p += `;${v}=${value[v]}`;
				return p;
			}, '')
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return `;${name}`;
		return `;${name}=${String(value)}`;
	},
	// label
	// .       .true          .blue.black.brown                   .R.100.G.200.B.150
	l: (_: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return `.`;
			return `.${value.join('.')}`;
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return `.`
			return keys.reduce((p, v) => {
				p += `.${v}.${value[v]}`;
				return p;
			}, '')
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return '.';
		return `.${String(value)}`;
	},
	// label-explode
	// .       .true          .blue.black.brown                   .R=100.G=200.B=150
	le: (_: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return `.`;
			return `.${value.join('.')}`;
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return `.`
			return keys.reduce((p, v) => {
				p += `.${v}=${value[v]}`;
				return p;
			}, '')
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return '.';
		return `.${String(value)}`;
	},
	// form
	// color=  color=true     color=blue,black,brown              color=R,100,G,200,B,150
	f: (name: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return `${name}=`;
			return `${name}=${value.join(',')}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return `;${name}`
			return keys.reduce((p, v, i) => {
				p += `${i > 0 ? ',' : ''}${v},${value[v]}`;
				return p;
			}, `${name}=`)
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return `${name}=`;
		return `${name}=${String(value)}`;
	},
	// form-explode
	// color=  color=true     color=blue&color=black&color=brown  R=100&G=200&B=150
	fe: (name: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return `${name}=`;
			return `${name}=${value.join(`&${name}=`)}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return `${name}=`
			return keys.reduce((p, v) => {
				p += `${p ? '&' : ''}${v}=${value[v]}`;
				return p;
			}, '')
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return `${name}=`;
		return `${name}=${String(value)}`;
	},
	// simple
	// n/a     true           blue,black,brown                    R,100,G,200,B,150
	s: (_: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return undefined;
			return `${value.join(',')}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return undefined;
			return keys.reduce((p, v) => {
				p += `${p ? ',' : ''}${v},${value[v]}`;
				return p;
			}, '')
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return undefined;
		return `${String(value)}`;
	},
	// simple-explode
	// n/a     true           blue,black,brown                    R=100,G=200,B=150
	se: (_: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return undefined;
			return `${value.join(',')}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return undefined;
			return keys.reduce((p, v) => {
				p += `${p ? ',' : ''}${v}=${value[v]}`;
				return p;
			}, '')
		}
		if (typeof value === 'undefined' || value === null || (typeof value === 'string' && (!value)))
			return undefined;
		return `${String(value)}`;
	},
	// space-delimited
	// n/a     n/a            blue%20black%20brown                R%20100%20G%20200%20B%20150
	sd: (_: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return undefined;
			return `${value.join(' ')}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return undefined;
			return keys.reduce((p, v) => {
				p += `${p ? ' ' : ''}${v} ${value[v]}`;
				return p;
			}, '')
		}
		return undefined;
	},
	// space-delimited-explode (this is in the 3.0 spec, but not the 3.1)
	// n/a     n/a            color=blue&color=black&color=brown  n/a
	sde: (name: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length > 0)
				return `${name}=${value.join(`&${name}=`)}`
		}
		return undefined;
	},
	// pipe-delimited
	// n/a     n/a            blue|black|brown                    R|100|G|200|B|150
	pd: (_: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length == 0)
				return undefined;
			return `${value.join('|')}`
		}
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return undefined;
			return keys.reduce((p, v) => {
				p += `${p ? '|' : ''}${v}|${value[v]}`;
				return p;
			}, '')
		}
		return undefined;
	},
	// pipe-delimited-explode (this is in the 3.0 spec, but not the 3.1)
	// n/a     n/a            color=blue&color=black&color=brown  n/a
	pde: (name: string, value: any) => {
		if (Array.isArray(value)) {
			if (value.length > 0)
				return `${name}=${value.join(`&${name}=`)}`
		}
		return undefined;
	},
	// deep-object
	// n/a     n/a            n/a                                 color[R]=100&color[G]=200&color[B]=150
	do: (name: string, value: any) => {
		if (Array.isArray(value))
			return undefined;
		if (typeof value === 'object' && value) {
			const keys = Object.keys(value);
			if (keys.length === 0)
				return undefined;
			return keys.reduce((p, v) => {
				p += `${p ? '&' : ''}${name}[${v}]=${value[v]}`;
				return p;
			}, '')
		}
		return undefined;
	}
}) as {[key: string]: (name: string, value: any) => string | undefined};
