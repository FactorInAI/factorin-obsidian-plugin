# Request Middleware

A request middleware is a wrapper around Obsidian request utility.

## Retry Middleware

Auto-retry requests. Receives an options object including `maxRetry` (number) and `isRetryable: () => boolean`.

## Rate Limiter Wrapper

Limit the max concurrency and request interval of remote requests. Receives `maxConcurrency` and `minInterval` as options in the second argument.

Wraps the request with a newly instantiated API limiter composable.

## Cancellation Middleware

Wraps `request` in with a throw if cancelled at before and after requests. Works together with [Cancellation Wrapper](./file-system-wrappers.md#cancellation-wrapper).

## Custom Header Middleware

Injects extra headers into headers argument.
