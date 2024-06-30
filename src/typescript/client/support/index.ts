import {InjectionToken} from 'async-injection';
import {HttpClient} from './http-client';

/**
 * Fingerprint of a remote operation call passed to the configuration callbacks.
 */
interface OperationDesc {
	/**
	 * Operation id as defined in the OpenApi specification document.
	 */
	id: string;
	/**
	 * OpenApi operation pattern (e.g. /pet/{petId}).
	 */
	pattern: string;
	/**
	 * OpenApi operation method (get, post, put, etc.).
	 */
	method: string;
}

export interface ApiClientConfig {
	baseURL?: string;
	enhanceReq?: (op: OperationDesc, urlPath: string, hdrs: Record<string, string>, querys: string[]) => Promise<undefined | 'omit' | 'same-origin' | 'include'>;
	ensureAuth?: (op: OperationDesc, security: Record<string, string[]>[], urlPath: string, hdrs: Record<string, string>, querys: string[]) => Promise<void>;
}

export * from './http-client';
export * from './client-utils';

export const ApiHttpClientToken = new InjectionToken<HttpClient>('ApiHttpClient');
