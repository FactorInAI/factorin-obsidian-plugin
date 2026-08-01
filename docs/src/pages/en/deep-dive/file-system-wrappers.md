# File System Wrappers

A wrapper is a factory function around a [file system](./file-system) `Fs` instance that intercepts the behavior of the original FS. A wrapper function receives the original FS in the first argument and returns an `Fs`. Overlay wrappers return a `WrappedFs` with an `original` member; injection wrappers modify the supplied FS and return it. Infinite layers of overlay wrappers can be applied to the same FS instance.

The root FS without any wrappers is typed `RootFs`. `Fs` is the union of `RootFs` and `WrappedFs`.

There are two kinds of wrappers:

- **Injection wrapper**: changes some methods of the supplied FS by directly re-assigning public members. Does not produce a new layer.
- **Overlay wrapper**: most common, applies a new layer of wrapper at the top of original FS.

## Memory Control Wrapper

- Target: local and remote `Fs`
- Priority: `1000` for both

Applied on both local and remote. The wrapper receives a shared `MemoryControlSharedState` containing `memoryConsumption`, `hangingOperations`, and `maxMemory`.

`hangingOperations` pool should always be sorted in ascending order according to the file size of each operation.

Only intercept `read`, `readStream`, `write`, `writeStream` calls:

1. When `read()` and `readStream()` arrive, reserve `stat.size` or a fixed 16 MiB respectively. If memory is unavailable, put the operation into the sorted pool and delay it. On failure, release the reservation and resume queued operations. When consumption is zero, one operation may exceed `maxMemory`.
2. `write()` and `writeStream()` do not reserve memory. When either finishes or fails, release `stat.size` or a fixed 16 MiB respectively, then resume queued reads when memory allows.

## Optimization Wrapper

- Target: local and remote `Fs`
- Priority: `2000` for both
- Mechanism: Microtask-batched atom queue

### Optimization Companion Wrapper

- Target: local and remote `Fs`
- Priority: `21000` for both
- Behavior: injects `read()` and `readStream()` methods that add keys to the local or remote optimization pool.

### Backend-Dependent Optimization

Sync routines must remain backend-independent, but optimal execution strategies vary (e.g., WebDAV requires sequential parent directory creation; S3 allows concurrent uploads). This wrapper decouples logic from optimization by intercepting FS API calls at the root layer to reorder, batch, or schedule execution within promises.

Backends may extend `RootFs` with backend-specific methods. The batch optimizer can receive the FS via `instanceof` check and use those methods.

### Operation Coalescing

Coalescing exploits the JS event loop: raw tasks initiate in parallel, but their synchronous setup executes within the same microtask drain cycle before hitting the first unresolved promise. Since the wrapper ensures only file operations are pending at this boundary, it captures the full operation set immediately upon microtask flush.

**Interception Rules**:

1. Mutations (`delete`, `mkdir`, `move`): Enqueued as `InputAtom`s.
2. Reads (`read`, `readStream`): The companion wrapper pushes keys into the local or remote pool. The opposite-side optimization wrapper drains that pool.
3. Writes (`write`, `writeStream`):
   - Reuses deferred execution if a pending anticipated write exists for `stat.key`.
   - Passes through otherwise.
4. Pass-through: `getUid`, `read`, `readStream`, `stat`, `exists`, and `list` bypass optimization. `checkConnection` belongs to the remote backend entry, not `Fs`.

**Execution**:

On microtask flush, the wrapper drains queued atoms and anticipates opposite-side pool keys into synthetic `write` atoms. These are passed to the injected `batchOptimizer`. Single-atom queues execute directly without batching. Queued atoms share real execution and deferred promises via `createCachedPromise()`.

## Asymmetric Storage Wrapper

- Target: remote `Fs`
- Priority: `11000`, only when asymmetric storage is enabled

Applied to the remote FS when asymmetric storage is enabled. It flattens hierarchical file and folder keys into anchored keys, then restores hierarchical stats and progress after delegation. Folders are represented by empty files. See the [Asymmetric Storage specification](./asymmetric-storage).

## Context Wrapper

- Target: local and remote `Fs`
- Priority: `20000` for local; `10000` and `20000` for remote

Intercepts `list()`, `stat()`, `write()`, `writeStream()`, `delete()`, `move()`, and `mkdir()` calls, and builds a copy of best-effort known stats in a `uni-kv` memory store that survives sync runs.

`read()` and `readStream()` pass through unchanged. File stats are required by the FS interface.

Bootstrap uses these stores:

- `localContext20000`
- `remoteContext10000`
- `remoteContext20000`

Behavior:

- On `stat()`, upsert the returned stat into the KV store
- On `list()`, clear the store and reset according to the list result
- On `write()` or `writeStream()`, upsert the supplied stat with the returned UID
- On `delete()`, delete the record.
- On `move()`, move the cached record to the new key and modify its `key` field.
- On `mkdir()`, upsert folder record.
- All memory database mutation should only happen when original operation succeeds and returns.
- When the wrapper is created, compare its marker with the current FS UID. If they differ, clear the store and update the marker.

## Cancellation Wrapper

- Target: local and remote `Fs`
- Priority: `3000` for both

Receive `isCancelled: Ref<boolean>` in the second argument to detect sync cancellation.

Intercept all `Fs` methods except `getUid()`. Wrap all method calls with a throw if cancelled at before and after relaying. Special cases: only check cancellation **before** `read()` & `readStream()` and **after** `write()` & `writeStream()` to prevent cancellation race blocking memory control counter release.

## Debug Wrapper

The development-only `debugWrapper` overlays an FS and logs every method call. It is exported from the SDK development entrypoint and is not part of the runtime wrapper chain.
