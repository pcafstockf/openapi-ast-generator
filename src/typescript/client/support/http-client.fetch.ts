import {HttpClient, HttpOptions, HttpResponse} from './http-client';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

class FetchHttpClient implements HttpClient {
	constructor() {
	}

	head(url: string, opts?: HttpOptions): Promise<HttpResponse<void>> {
		return this.sendRequest('HEAD', url, opts).then(r => this.processResponse<void>(r));
	}

	get<T = any>(url: string, opts?: HttpOptions): Promise<HttpResponse<T>> {
		return this.sendRequest('GET', url, opts).then(r => this.processResponse<T>(r));
	}

	post<T = any>(url: string, body?: any, opts?: HttpOptions): Promise<HttpResponse<T>> {
		return this.sendRequest('POST', url, opts, body).then(r => this.processResponse<T>(r));
	}

	put<T = any>(url: string, body?: any, opts?: HttpOptions): Promise<HttpResponse<T>> {
		return this.sendRequest('PUT', url, opts, body).then(r => this.processResponse<T>(r));
	}

	patch<T = any>(url: string, body?: any, opts?: HttpOptions): Promise<HttpResponse<T>> {
		return this.sendRequest('PATCH', url, opts, body).then(r => this.processResponse<T>(r));
	}

	delete<T = any>(url: string, opts?: HttpOptions): Promise<HttpResponse<T>> {
		return this.sendRequest('DELETE', url, opts).then(r => this.processResponse<T>(r));
	}

	protected sendRequest<T>(method: string, url: string, opts?: HttpOptions, body?: any) {
		const options: RequestInit = {
			method,
			headers: undefined,
			credentials: opts?.credentials ? 'include' : 'omit',
			body: body
		};
		if (typeof opts?.credentials === 'boolean')
			options.credentials = opts?.credentials ? 'include' : 'omit';
		else
			options.credentials = opts?.credentials as RequestCredentials;
		if (opts.headers)
			options.headers = Object.keys(opts.headers).reduce((acc, key) => {
				if (Array.isArray(opts.headers[key]))
					acc[key] = (opts.headers[key] as string[]).join(',');
				else
					acc[key] = opts.headers[key] as unknown as string;
				return acc;
			}, opts.headers as unknown as Record<string, string>);
		return fetch(url, options);
	}

	protected processResponse<T>(rsp: Response) {
		const retVal: Writeable<HttpResponse<T>> = {
			status: rsp.status,
		};
		rsp.headers.forEach((val, key) => {
			if (!retVal.headers)
				retVal.headers = {};
			retVal.headers[key] = val;
		});
		switch (rsp['content-type']) {
			case 'application/octet-stream':
				retVal.data = rsp.arrayBuffer() as T;
				break;
			case 'application/json':
				retVal.data = rsp.json() as T;
				break;
			case 'text/plain':
				retVal.data = rsp.text() as T;
				break;
			default:
				retVal.data = (/text\/.+/.test(rsp['content-type']) ? rsp.text() : rsp.arrayBuffer()) as T;
				break;
		}
		return retVal;
	}
}

/**
 * Factory for actually constructing @see FetchHttpClient
 */
export function makeFetchHttpClient(): FetchHttpClient {
	return new FetchHttpClient();
}
