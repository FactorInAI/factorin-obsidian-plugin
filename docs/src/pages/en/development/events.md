# Events

Sync Engine uses a typed event system. `Context` provides `on` for subscribing and `dispatch` for publishing.

## `On` and `Dispatch`

```ts
type On<O extends object> = <K extends keyof O>(
  key: K,
  callback: (payload: O[K]) => void,
) => () => void;

type Dispatch<O extends object> = <K extends keyof O>(
  ...[key, payload]: undefined extends O[K] ? [K] : [K, O[K]]
) => void;
```

`on` returns a cleanup callback. `dispatch` makes payloadless events (type `undefined`) optional — call `ctx.dispatch('syncCanceled')` without a second argument.

```ts
import type { Events } from '@hesprs/sync-engine-sdk';

const unsubscribe = ctx.on<Events>('syncTerminated', (reason) => {
  if (reason.result === 'failed') console.error(reason.error);
});

ctx.dispatch<Events>('logGeneral', 'Example module started.');
ctx.dispatch<Events>('syncCanceled');

unsubscribe();
```

`On<O>` and `Dispatch<O>` are generic function types that allow custom event maps. In ordinary module code, use `ctx.on<Events>` and `ctx.dispatch<Events>`; type inference supplies valid event keys and payloads.

## `Events` Map

`Events` is a merged event map contributed by all internal modules. Every event key and its payload type:

| Event                  | Payload                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `logSync`              | `string` sync log message                                                           |
| `logGeneral`           | `string` general log message                                                        |
| `errorSync`            | `string` sync error log message                                                     |
| `errorGeneral`         | `string` general error log message                                                  |
| `moduleLoaded`         | `string` module name                                                                |
| `moduleUnloaded`       | `string` module name                                                                |
| `syncStarted`          | `{ isCancelled: Ref<boolean>; trigger: string }`                                    |
| `remoteWalkProgress`   | `Progress`                                                                          |
| `syncTerminated`       | `SyncTerminateReason`                                                               |
| `requestConfirmDelete` | `Array<RemoveLocal>` pending local-remove tasks                                     |
| `requestConfirmTasks`  | `Array<BaseTask>`                                                                   |
| `syncCanceled`         | `undefined` (no payload)                                                            |
| `taskCompleted`        | `TaskInfo` (`{ name: TaskNames; key: string; prettyName: string; isDir: boolean }`) |
| `taskFailed`           | `FailedTaskInfo` (`TaskInfo` & `{ error: string }`)                                 |
| `executionStarted`     | `Array<BaseTask>`                                                                   |
| `tasksConfirmed`       | `Array<BaseTask>`                                                                   |
| `deleteConfirmed`      | `{ delete: Array<RemoveLocal>; reupload: Array<RemoveLocal> }`                      |
| `migrationProgress`    | `Progress`                                                                          |
| `migrationFailed`      | `string` error message                                                              |

::: tip

`syncStarted.isCancelled` is a SynthKernel `Ref<boolean>` — call it as `isCancelled()` to read, or subscribe with `isCancelled.subscribe(...)`.

:::
