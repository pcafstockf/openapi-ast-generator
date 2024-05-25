import {FastifyReply, FastifyRequest} from 'fastify';
import {HttpResponse} from './http-response';

/**
 * Every Api/Service method receives this as its first parameter.
 */
export interface Context {
	request: FastifyRequest;
	response: FastifyReply
}

/**
 * Handlers call an appropriate Api/Service method, and this method processes those responses. <br/>
 * Every Api/Service method is passed a 'ctx' object of type {request: FastifyRequest; response: FastifyReply} (aka @see Context).
 * <br/>
 * Every Api/Service method should:<ul>
 *  <li>Return Promise<{@link HttpResponse}> to send back the response.
 *  <li>Return Promise<null> to signify that the method has fully handled the response and no further action is needed.
 *  <li>Return null to indicate a mock response should be provided using <a href="https://openapistack.co/docs/openapi-backend/api/#mockresponseforoperationoperationid-opts">openapi-backend mocking</a>.
 *  <li>Throw an Error (or 'route' / 'router') to indicate the 'next' handler in the chain should be called with that "error".
 *  <li>Throw null | undefined to indicate the 'next' handler in the chain should be called with no args.
 * </ul>
 */
export function processApiResult<T>(result: Promise<HttpResponse<T>> | null, res: FastifyReply) {
	if (typeof result === 'object' && (result instanceof Promise || typeof (result as any)?.then === 'function')) {
		result.then(r => {
			if (r) {
			}
			// else, remember that undefined means its been handled and we should do nothing.
		}).catch(err => {
			//URGENT: How do we propagate to the next handler in fastify?
			// if (!err)
			// 	next();
			// else
			// 	next(err);
		});
	}
	else {
		return res.status(501).send();
	}
}
