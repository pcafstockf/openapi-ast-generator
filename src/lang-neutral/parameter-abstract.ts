import {get as lodashGet} from 'lodash';
import {TargetOpenAPI} from '../openapi-supported-versions';
import {LangNeutral, LangNeutralJson} from './lang-neutral';
import {TypeSchema} from './type-schema';

export abstract class AbstractMethodParameter<T> implements LangNeutral {
	abstract nodeKind: 'parameter' | 'request';

	/**
	 *
	 * @param document
	 * @param location
	 */
	protected constructor(
		readonly document: TargetOpenAPI.Document,
		readonly location: ReadonlyArray<string>
	) {
	}

	/**
	 * Return the underlying OpenApi Element.
	 */
	get oae(): T {
		return lodashGet(this.document, this.location);
	}

	abstract readonly name: string;
	abstract readonly required: boolean;


	getIdentifier(): string {
		return codeGenConfig.toParameterName(this.name);
	}

	abstract resolveTypes(): TypeSchema[];

	public abstract toJSON(): LangNeutralJson;
}
