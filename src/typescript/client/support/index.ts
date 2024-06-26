import {InjectionToken} from 'async-injection';
import {HttpClient} from './http-client';

export interface ApiClientConfig {
	baseURL?: string;
	headers?: Record<string, string> | ((opId: string, path: string, meth: string) => Record<string, string>);
	authn?: {
		username?: string | ((opId: string, path: string, meth: string) => string);
		password?: string | ((opId: string, path: string, meth: string, username: string) => string);
		apiKeys?: Record<string, string> | ((opId: string, path: string, meth: string) => Record<string, string>);
		bearerToken?: string | ((opId: string, path: string, meth: string) => string);
		withCredentials?: boolean | ((opId: string, path: string, meth: string) => boolean);
	};
}

export * from './http-client';
export * from './client-utils';

export const ApiHttpClientToken = new InjectionToken<HttpClient>('ApiHttpClient');
