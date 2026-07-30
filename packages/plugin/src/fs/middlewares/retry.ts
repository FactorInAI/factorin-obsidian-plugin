import type { ErrorLike } from '@repo/shared/get-status';
import { getStatus } from '@repo/shared/get-status';
import type { Request } from '@/modules/Registrar';
import sleep from '@/utils/sleep';

type RetryOptions = {
	maxRetry?: number;
	isRetryable?: (error: unknown) => boolean;
	retryDelay?: (count: number) => number;
};

const backoff = (count: number, baseMs = 1000, maxMs = 30_000): number => {
	const exp = Math.min(baseMs * 2 ** count, maxMs);
	return Math.random() * exp;
};

export default function retryMiddleware(request: Request, options?: RetryOptions): Request {
	const { maxRetry = 4, isRetryable = isRetryableError, retryDelay = backoff } = options ?? {};
	return async (args) => {
		for (let i = 0; ; i++)
			try {
				return await request(args);
			} catch (error) {
				if (!isRetryable(error) || i >= maxRetry) throw error;
				await sleep(retryDelay(i));
			}
	};
}

const RETRYABLE_STATUS_CODES = new Set([401, 408, 425, 429, 500, 502, 503, 504]);

const RETRYABLE_MESSAGE_PATTERNS = [
	/\bnet::ERR_CONNECTION_CLOSED\b/i,
	/\bnet::ERR_CONNECTION_RESET\b/i,
	/\bnet::ERR_CONNECTION_ABORTED\b/i,
	/\bnet::ERR_CONNECTION_TIMED_OUT\b/i,
	/\bnet::ERR_NETWORK_CHANGED\b/i,
	/\bnet::ERR_INTERNET_DISCONNECTED\b/i,
	/\bECONNRESET\b/i,
	/\bECONNABORTED\b/i,
	/\bECONNREFUSED\b/i,
	/\bETIMEDOUT\b/i,
	/\bEAI_AGAIN\b/i,
	/\bsocket hang up\b/i,
	/\bconnection closed\b/i,
	/\bconnection reset\b/i,
	/\bconnection aborted\b/i,
	/\bconnection refused\b/i,
	/\btemporarily unavailable\b/i,
	/\btimed out\b/i,
];

function hasRetryableMessage(message: string): boolean {
	return RETRYABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

function isRetryableError(error: unknown): boolean {
	const queue: Array<unknown> = [error];
	const visited = new Set<object>();
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) continue;
		if (typeof current === 'string') {
			if (hasRetryableMessage(current)) return true;
			continue;
		}
		if (typeof current !== 'object') continue;
		if (visited.has(current)) continue;
		visited.add(current);
		const errorLike = current as ErrorLike;
		const statusCode = getStatus(errorLike);
		if (statusCode && RETRYABLE_STATUS_CODES.has(statusCode)) return true;
		if (typeof errorLike.message === 'string')
			if (hasRetryableMessage(errorLike.message)) return true;
		if (errorLike.cause) queue.push(errorLike.cause);
		if (errorLike.error) queue.push(errorLike.error);
	}
	return false;
}
