# Request

Sync Engine has two request systems: `Request` for remote HTTP calls and `VaultRequest` for local vault operations. Both support middleware wrappers. For internal request implementation details, see [deep-dive: request](../deep-dive/request) and [deep-dive: request middleware](../deep-dive/request-middleware).

## `Request`

Remote HTTP request function. Backends receive a composed `Request` instance in their constructor and must use it for all network calls.

```ts
type RequestParam = Omit<RequestUrlParam, 'body'> & { body?: string | Binary };

type Request = (params: RequestParam | string) => Promise<{
  text: () => string;
  bytes: () => Binary;
  json: () => General; // untyped JSON
  headers: Record<string, string>;
  status: number;
}>;
```

`RequestParam` extends Obsidian's `RequestUrlParam` (minus `body`) with a `body` field accepting `string | Binary`. Passing a plain string instead of a `RequestParam` object uses it as the URL.

## `VaultRequest`

Local vault operation function used by the local filesystem. Modules rarely interact with `VaultRequest` directly, but it is exported for advanced use cases.

```ts
type VaultRequestParam =
  | { method: 'GET'; key: string }
  | { method: 'GET_STREAM'; key: string }
  | { method: 'POST'; key: string; value: Binary; headers?: { mtime?: number; ctime?: number } }
  | { method: 'APPEND'; key: string; value: Binary; headers?: { mtime?: number; ctime?: number } }
  | { method: 'DELETE'; key: string; headers?: { permanent?: boolean } }
  | { method: 'MOVE'; key: string; headers: { destination: string } }
  | { method: 'MKDIR'; key: string }
  | { method: 'EXISTS'; key: string }
  | { method: 'STAT'; key: string }
  | { method: 'LIST'; key: string };

type VaultRequest = <T extends VaultRequestParam>(
  params: T,
) => Promise<VaultRequestResponseMap[T['method']]>;
```

For the method-to-Obsidian-adapter mapping, see [deep-dive: request](../deep-dive/request#vault-request).

## Middleware

Request middleware wraps the request function in ascending `priority` order. There are **two separate middleware systems**: remote and local.

```ts
type RemoteRequestMiddlewareEntry = {
  priority: number;
  apply: (request: Request) => Request | undefined;
};
type LocalRequestMiddlewareEntry = {
  priority: number;
  apply: (request: VaultRequest) => VaultRequest | undefined;
};
```

Returning `undefined` from `apply` declines the entry at that priority. For the built-in middleware (retry, rate limiter, cancellation, custom headers), see [deep-dive: request middleware](../deep-dive/request-middleware).

### Registering Middleware

See [registration](./registration#request-middleware).
