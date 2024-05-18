import {InjectionToken} from 'async-injection';
import {HttpClient} from './http-client';

export interface ApiClientConfig {
	baseURL?: string;
	headers?: Record<string, string> | ((path: string) => Record<string, string>);
	authn?: {
		username?: string | ((path: string) => string);
		password?: string | ((path: string, username: string) => string);
		apiKeys?: Record<string, string> | ((path: string) => Record<string, string>);
		bearerToken?: string | ((path: string) => string);
		withCredentials?: boolean | ((path: string) => boolean);
	};
}

export * from './http-client';
export * from './client-utils';

export const ApiHttpClientToken = new InjectionToken<HttpClient>('ApiHttpClient');
