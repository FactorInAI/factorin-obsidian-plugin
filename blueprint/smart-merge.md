## Smart Merge Module

This module provides `Smart Merge` conflict resolution strategy. It has three parts: `RemoteFs` wrapper, resolver, and the merge algorithm.

## Base Text Wrapper

Type: overlay wrapper
Target: `RemoteFs`
Position: outermost the middleware stack

Behavior:

- Receives `baseTextStore: StoreAsync<string>` in the second argument.
- `getUid()`, `checkConnection()`, `read()`, `readStream()`, `mkdir()`, `stat()`, `exists()`, `list()`: keep as-is
- `write()`: when succeeds, if the key signifies mergeable content, `void` write the content (to string first) to the store.
- `move()`: move the value if exists.
- `delete()`: delete the value.

## Resolver

The resolver follows the same interface with pre-defined resolvers. The resolver obtains the base text from the store and performs three-way merge on text, if missing base text, it fallbacks to latest survive.

## Merge Algorithm

The merge algorithm (`packages/smart-merge/src/utils/merge.ts`) is based on recursive 3-way merge.

## Miscellaneous

Store schema: store name uses the same namespace used in the plugin core, prepended with `base-text-`. Content is plain string-string key value pairs.

Settings: allows user to set custom conflict prefix and suffix used in the merge algorithm. The module also registers `smart-merge` conflict resolver.
