# Runtime API

`@hesprs/sync-engine-sdk` is public API for Sync Engine modules.

- `@hesprs/sync-engine-sdk` provides production module API.
- `@hesprs/sync-engine-sdk/dev` provides debugging, testing, and build helpers.

Use `import type` for every type export. Only `digOriginal`, `MigrationModal`, `debugWrapper`, `testKit`, and `obsidianBridge` are runtime values.

## Core data types

These types are shared by filesystem, request, storage, and sync APIs.

### `Binary` and `MaybePromise`

```ts
type Binary = Uint8Array<ArrayBuffer>;
type MaybePromise<T> = T | Promise<T>;
```

`Binary` is file content and binary request-body type throughout SDK. `MaybePromise<T>` permits synchronous or asynchronous backend implementations.

### `Progress`

```ts
type Progress<T = string> = {
  total: number;
  completed: number;
  current?: T;
};
```

`Progress` reports recursive listing and sync execution progress. `current` identifies current item when available.

### Files and records

```ts
type FileStat = {
  isDir: false;
  key: string;
  mtime: number;
  size: number;
  uid: string;
};

type FolderStat = {
  isDir: true;
  key: string;
};

type Stat = FileStat | FolderStat;
type StatsMap = Map<string, Stat>;

type RecordStat = { isDir: false; local: string; remote: string } | { isDir: true };

type RecordStatsMap = Map<string, RecordStat>;
```

`uid` identifies one file version, usually an ETag or equivalent. `RecordStat` stores local and remote version identifiers used to plan later syncs.

## Filesystem contracts

SDK exports following filesystem types:

- `RootFs`, `WrappedFs`, `Fs`
- `WriteAtom`, `DeleteAtom`, `MoveAtom`, `MkdirAtom`
- `InputAtom`, `CustomAtom`, `OutputAtom`
- `OptimizerInput`, `BatchOptimizer`

[File System and Wrapper Chain](file-system.md) contains complete `RootFs` contract, key conventions, wrapper guidance, optimizer contracts, and backend implementation examples. Use it for:

- [`RootFs`](file-system.md#rootfs) implementation.
- [Filesystem wrappers](file-system.md#wrapper-chain).
- [Batch optimizers](file-system.md#batch-optimization).
- [`digOriginal`](file-system.md#digoriginal) with backend-specific methods.

## Context and module lifecycle

### `Context`

`Context` is dependency-injection object passed to module constructors. Store cleanup callbacks returned by registrations and invoke them from `dispose`. `registerEvent` is cleaned up by Obsidian; `registerI18n` returns `void`.

```ts
import type { Context, FsWrapperEntry } from '@hesprs/sync-engine-sdk';

export default class MyModule {
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly ctx: Context) {}

  start(): void {
    const wrapper: FsWrapperEntry = {
      order: 4823,
      apply: (fs) => fs,
    };
    this.cleanup.push(this.ctx.registerRemoteFsWrapper(wrapper));
  }

  dispose(): void {
    this.cleanup.splice(0).forEach((cleanup) => cleanup());
  }
}
```

#### Core, host, and event members

| Member             | Purpose                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `settings`         | Merged `Settings` object.                                                                                             |
| `events`           | Merged `Events` map.                                                                                                  |
| `i18n`             | Merged `Translations` resource map.                                                                                   |
| `app`              | Obsidian `App` instance.                                                                                              |
| `addCommand`       | Registers Obsidian command and returns it.                                                                            |
| `registerEvent`    | Registers Obsidian `EventRef` for automatic plugin cleanup.                                                           |
| `addRibbonIcon`    | Adds ribbon icon and returns its element.                                                                             |
| `addStatusBarItem` | Adds and returns status-bar element.                                                                                  |
| `saveSettings`     | Persists current `settings`.                                                                                          |
| `on`               | Subscribes to typed SDK event.                                                                                        |
| `dispatch`         | Dispatches typed SDK event.                                                                                           |
| `getLogs`          | Returns formatted current logs.                                                                                       |
| `isIdle`           | SynthKernel `Ref<boolean>` for sync-idle state. Read with `ctx.isIdle()`; subscribe with `ctx.isIdle.subscribe(...)`. |

#### Internationalization and storage members

| Member              | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `registerI18n`      | Registers translation resource for one `ObsidianLanguageCode`. Returns `void`. |
| `translate`         | Translates a key from merged resources.                                        |
| `getRecordStore`    | Gets current or named `RecordStore`.                                           |
| `deleteRecordStore` | Deletes current or named record store.                                         |
| `clearRecordStores` | Clears every record store.                                                     |
| `recordStoreExists` | Tests whether current or named record store exists.                            |
| `indexedDB`         | Async Uni-KV database.                                                         |
| `memoryDB`          | Synchronous in-memory Uni-KV database.                                         |

#### Module-management members

| Member                  | Purpose                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `discoveredModules`     | `Map` from discovered module name to version.                                        |
| `loadedModules`         | `Map` from loaded module name to module constructor.                                 |
| `fetchSources`          | Fetches `ModuleMeta` entries from configured sources; optional `cached` reads cache. |
| `loadAllModules`        | Loads all enabled installed modules.                                                 |
| `loadModule`            | Loads named module; optional second argument starts it immediately.                  |
| `unloadModule`          | Unloads named module.                                                                |
| `updateModules`         | Finds and downloads available module updates.                                        |
| `downloadModule`        | Downloads one named module version from URL.                                         |
| `deleteModule`          | Deletes named installed module.                                                      |
| `addSettingTab`         | Adds Sync Engine setting tab to supplied Obsidian plugin.                            |
| `openModuleManagement`  | Opens module-management UI.                                                          |
| `closeModuleManagement` | Closes module-management UI.                                                         |

#### Filesystem and request members

| Member                      | Purpose                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `createLocalFs`             | Creates wrapped local filesystem.                                                 |
| `createRemoteFs`            | Creates selected wrapped remote filesystem; optional argument selects backend ID. |
| `getRequest`                | Gets request function after registered middleware composition.                    |
| `getNamespace`              | Creates storage namespace for optional local and remote filesystem pair.          |
| `initializeSync`            | Creates local filesystem, remote filesystem, and record store for sync.           |
| `getCheckConnection`        | Gets selected backend connection-check function.                                  |
| `remoteFsRegistry`          | `Map<string, RemoteFsEntry>`.                                                     |
| `deciderRegistry`           | `Map<string, DeciderEntry>`.                                                      |
| `conflictResolverRegistry`  | `Map<string, ConflictResolverEntry>`.                                             |
| `registerLocalFsWrapper`    | Registers `FsWrapperEntry` for local filesystem.                                  |
| `registerRemoteFsWrapper`   | Registers `FsWrapperEntry` for remote filesystem.                                 |
| `registerRemoteFs`          | Registers backend ID and `RemoteFsEntry`.                                         |
| `registerRequestMiddleware` | Registers `RequestMiddlewareEntry`.                                               |
| `registerCss`               | Adds CSS to document; returns callback that removes it.                           |
| `rerenderSettingTab`        | Renders contributed settings again.                                               |

#### Sync and UI members

| Member                     | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `getDecider`               | Gets selected `Decider`.                                     |
| `getConflictResolver`      | Gets selected `ConflictResolver`.                            |
| `getLocalOptimizer`        | Gets selected local `BatchOptimizer`.                        |
| `getRemoteOptimizer`       | Gets selected remote `BatchOptimizer`.                       |
| `getRemoteStatsGetter`     | Gets `RemoteStatsGetter` for a trigger.                      |
| `reduceSyncTrigger`        | Chooses highest-priority trigger from trigger IDs.           |
| `executeSync`              | Executes synchronization immediately for trigger.            |
| `requestSync`              | Queues synchronization; resolves with `SyncTerminateReason`. |
| `executionProgress`        | Reactive `Progress` for task execution.                      |
| `walkProgress`             | Reactive `Progress` for remote traversal.                    |
| `syncStage`                | Reactive current sync stage.                                 |
| `showProgress`             | Opens progress UI.                                           |
| `hideProgress`             | Hides progress UI.                                           |
| `exportLogs`               | Exports logs to vault file.                                  |
| `startScheduledSync`       | Starts interval sync.                                        |
| `stopScheduledSync`        | Stops interval sync.                                         |
| `registerDecider`          | Registers `DeciderEntry`.                                    |
| `registerConflictResolver` | Registers `ConflictResolverEntry`.                           |
| `registerLocalOptimizer`   | Registers local `OptimizerEntry`.                            |
| `registerRemoteOptimizer`  | Registers remote `OptimizerEntry`.                           |
| `registerSyncTrigger`      | Registers trigger ID and `SyncTriggerEntry`.                 |
| `registerSetting`          | Registers `SettingEntry`.                                    |

#### Framework members

SynthKernel provides these internal members. Module code normally should not call them.

| Member          | Purpose                             |
| --------------- | ----------------------------------- |
| `__modules__`   | Internal module-instance `WeakMap`. |
| `__getModule__` | Gets internal module instance.      |
| `__addModule__` | Adds module constructor to context. |
| `__assign__`    | Extends context with merged values. |

### `Settings`

`Settings` is merged object at `ctx.settings`.

| Key                       | Type or purpose                                                                 |
| ------------------------- | ------------------------------------------------------------------------------- |
| `moduleSources`           | `Array<string>` of module registry URLs.                                        |
| `modules`                 | `Record<string, boolean>` of enabled module states.                             |
| `moduleAutoUpdate`        | Enables automatic module updates.                                               |
| `remoteFs`                | Selected remote filesystem ID.                                                  |
| `decider`                 | Selected decider ID.                                                            |
| `conflictResolver`        | Selected conflict-resolver ID.                                                  |
| `maxFileSize`             | Toggleable maximum file size in bytes.                                          |
| `confirmTasksInSync`      | Confirms task list during interactive sync.                                     |
| `confirmDeleteInAutoSync` | Confirms local deletion during automatic sync.                                  |
| `noticeStatusOnMobile`    | Shows sync-status notices on mobile.                                            |
| `startupSync`             | Toggleable startup-sync delay in milliseconds.                                  |
| `scheduledSync`           | Toggleable scheduled-sync interval in milliseconds.                             |
| `realtimeSync`            | Toggleable realtime-sync debounce delay in milliseconds.                        |
| `inclusionRules`          | Included glob rules.                                                            |
| `exclusionRules`          | Excluded glob rules.                                                            |
| `maxMemoryConsumption`    | Toggleable memory limit in bytes.                                               |
| `maxRequestConcurrency`   | Toggleable concurrent-request limit.                                            |
| `minRequestInterval`      | Toggleable minimum request interval in milliseconds.                            |
| `realtimeSyncFastMode`    | Enables fast realtime synchronization.                                          |
| `asymmetricStorage`       | Enables asymmetric storage mode.                                                |
| `customHeaders`           | Request headers: `{ key, value, type }`, where type is `plaintext` or `secret`. |

Several settings use internal toggle shape `{ enabled: boolean; value: number }`. This type is not standalone root SDK export.

## Events

### `Events`

`Events` is merged event map used by `ctx.on` and `ctx.dispatch`.

| Event                  | Payload                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `logSync`              | `string` sync log message.                                              |
| `logGeneral`           | `string` general log message.                                           |
| `errorSync`            | `string` sync error log message.                                        |
| `errorGeneral`         | `string` general error log message.                                     |
| `moduleLoaded`         | `string` module name.                                                   |
| `moduleUnloaded`       | `string` module name.                                                   |
| `syncStarted`          | `{ trigger: string; isCancelled: () => boolean }`.                      |
| `remoteWalkProgress`   | `Progress`.                                                             |
| `syncTerminated`       | `SyncTerminateReason`.                                                  |
| `requestConfirmDelete` | Array of pending local-remove tasks.                                    |
| `requestConfirmTasks`  | `Array<BaseTask>`.                                                      |
| `syncCanceled`         | No payload.                                                             |
| `taskCompleted`        | `{ name: TaskNames; key: string; prettyName: string; isDir: boolean }`. |
| `taskFailed`           | Completed-task payload plus `error: string`.                            |
| `executionStarted`     | `Array<BaseTask>`.                                                      |
| `tasksConfirmed`       | `Array<BaseTask>`.                                                      |
| `deleteConfirmed`      | `{ delete: Array<RemoveLocal>; reupload: Array<RemoveLocal> }`.         |
| `migrationProgress`    | `Progress`.                                                             |
| `migrationFailed`      | `string` error message.                                                 |

### `On` and `Dispatch`

`ctx.on` listens for a specific event and returns a cleanup callback. `ctx.dispatch` publishes an event; payloadless events use only event key.

```ts
import type { Events } from '@hesprs/sync-engine-sdk';

const unsubscribe = ctx.on<Events>('syncTerminated', (reason) => {
  if (reason.result === 'failed') console.error(reason.error);
});

ctx.dispatch<Events>('logGeneral', 'Example module started.');
ctx.dispatch<Events>('syncCanceled');

unsubscribe();
```

`On<O>` and `Dispatch<O>` are generic function types that allows custom event maps. In ordinary module code, use `ctx.on<Events>` and `ctx.dispatch<Events>`; type inference supplies valid event keys and payloads.

## Internationalization

### `Translations`

`Translations` is merged resource map at `ctx.i18n`. Core keys cover sync, module loading, settings, modals, and UI labels. Module resources registered through `registerI18n` merge into translation function at runtime.

You can inspect the full map in [Sync Engine core English translations](https://github.com/hesprs/sync-engine/blob/main/packages/plugin/src/en.ts).

### `ObsidianLanguageCode`

`ObsidianLanguageCode` is union of language codes supported by Obsidian, such as `'en'`, `'en-GB'`, and `'zh'`.

### `Fragment`, `TranslationResource`, and `Translate`

```ts
type Fragment<A = undefined> = (fragment: DocumentFragment, args: A) => void;

type TranslationResource = Record<string, string | Fragment<any>>;
```

String resources return strings. They may accept optional interpolation object, replacing double-curly-brackets placeholders. Fragment resources receive a `DocumentFragment` and optional typed arguments, then return a `DocumentFragment` from `translate`.

```ts
import type { Fragment, Translate, TranslationResource } from '@hesprs/sync-engine-sdk';

const messages = {
  connected: 'Connected to {{backend}}.',
  files: (frag: DocumentFragment, { succeeded, failed }: { succeeded: number; failed: number }) => {
    frag.createEl('p', { text: `Files synchronized:` });
    const ul = frag.createEl('ul');
    ul.createEl('li', { text: `${succeeded} files succeeded` });
    if (failed) ul.createEl('li', { text: `${failed} filed failed.` });
  },
  website: (frag: DocumentFragment) => {
    frag.appendText('Visit ');
    frag.createEl('a', {
      attr: { href: 'https://sync.consensia.cc' },
      text: 'Sync Engine Website',
    });
    frag.appendText(' for more detail.');
  },
} satisfies TranslationResource;

ctx.registerI18n('en', messages);

const translate: Translate<typeof messages> = ctx.translate;
const label = translate('connected', { backend: 'Example' });
const content = translate('files', { succeeded: 3, failed: 0 });
```

`label` is a string; `content` is a `DocumentFragment` that you can append to HTML elements. Use string for simple translations, use `Fragment` factory for complex blocks requiring HTML construction or dynamic composition.

Obsidian DOM augmentation `Element.createSpan()`, `Element.createEl()`, `Element.createDiv()`, `Element.appendText()` are highly recommended when constructing `Fragment` i18n values.

## Storage and databases

### `RecordStore`

```ts
type RecordStore = StoreAsync<RecordStat>;
```

`RecordStore` persists synchronization record entries. `getRecordStore()` without an argument selects current local/remote filesystem namespace. Pass a namespace for module-owned records.

```ts
const records = ctx.getRecordStore('my-module');

await records.set('note.md', {
  isDir: false,
  local: 'local-uid',
  remote: 'remote-uid',
});

const record = await records.get('note.md');
```

### Uni-KV types

SDK re-exports generic Uni-KV types:

- `StoreAsync<T>`: asynchronous store.
- `StoreSync<T>`: synchronous store.
- `DatabaseAsync<D, M>`: asynchronous database of stores and metadata.
- `DatabaseSync<D, M>`: synchronous database of stores and metadata.

Stores expose `get`, `set`, `delete`, `clear`, `keys`, `values`, `entries`, and `batch`. Databases expose `getStore`, `getStoreNames`, `deleteStore`, `clearStores`, `getMeta`, `setMeta`, and `dispose`.

## Context registration API

Registration contracts are grouped by `Context` methods that consume them. Every method below returns a cleanup callback except `registerEvent`, which hands an Obsidian event reference to plugin cleanup, and `registerI18n`, which returns `void`.

### `registerEvent`

Pass an Obsidian event reference to let the host remove it when the plugin unloads.

```ts
ctx.registerEvent(
  ctx.app.vault.on('modify', (file) => {
    console.debug(`Modified ${file.path}`);
  }),
);
```

### `registerI18n`

Register each language resource once during module initialization.

```ts
ctx.registerI18n('en', {
  connected: 'Connected',
});
```

### `registerLocalFsWrapper` and `registerRemoteFsWrapper`

```ts
type FsWrapperEntry = {
  order: number;
  apply: (fs: Fs) => Fs;
  condition?: () => boolean;
};
```

`order` controls wrapper position. `condition` limits application to matching state. See [Filesystem wrappers](file-system.md#wrapper-chain) for implementation guidance.

```ts
import { debugWrapper } from '@hesprs/sync-engine-sdk/dev';

const removeLocalWrapper = ctx.registerLocalFsWrapper({
  order: 100,
  apply: (fs) => debugWrapper(fs, console.debug),
});

const removeRemoteWrapper = ctx.registerRemoteFsWrapper({
  order: 100,
  condition: () => ctx.settings.remoteFs === 'example',
  apply: (fs) => debugWrapper(fs, console.debug),
});
```

### `registerRemoteFs`

```ts
type CheckConnectionResult = { success: true } | { success: false; reason: string };

type RemoteFsEntry = {
  prettyName: string;
  instantiate: (request: Request) => RootFs;
  checkConnection: (request: Request) => MaybePromise<CheckConnectionResult>;
};
```

```ts
const cleanup = ctx.registerRemoteFs('example', {
  prettyName: 'Example backend',
  instantiate: (request) => createFs(request),
  checkConnection: async () => ({ success: true }),
});
```

Implement `RootFs` according to [File System](file-system.md#rootfs).

### `registerRequestMiddleware`

```ts
type RequestParam = {
  url: string;
  method?: string;
  contentType?: string;
  headers?: Record<string, string>;
  throw?: boolean;
  body?: string | Binary;
};

type Request = (params: RequestParam | string) => Promise<{
  text: () => string;
  bytes: () => Binary;
  json: () => any;
  headers: Record<string, string>;
  status: number;
}>;

type RequestMiddleware = (request: Request) => Request;

type RequestMiddlewareEntry = {
  order: number;
  apply: RequestMiddleware;
};
```

`json()` intentionally returns untyped JSON. Middleware wraps request function in ascending `order`.

```ts
const removeMiddleware = ctx.registerRequestMiddleware({
  order: 100,
  apply: (request) => async (params) => {
    const response = await request(params);
    console.debug(`Request returned ${response.status}`);
    return response;
  },
});
```

### `registerDecider`

```ts
type DeciderEntry = {
  decider: Decider;
  prettyName: string;
};

type ConflictResolverEntry = {
  prettyName: string;
  resolver: ConflictResolver;
};

type OptimizerEntry = {
  optimizer: BatchOptimizer;
  condition?: () => boolean;
};
```

`registerDecider` makes a strategy available in settings.

```ts
const removeDecider = ctx.registerDecider('example', {
  prettyName: 'Example strategy',
  decider: () => [],
});
```

### `registerConflictResolver`

`registerConflictResolver` makes a strategy available in settings.

```ts
const removeResolver = ctx.registerConflictResolver('keep-local', {
  prettyName: 'Keep local copy',
  resolver: async ({ key, localFs, remoteFs }) => {
    await remoteFs.write(key, await localFs.read(key));
  },
});
```

This minimal resolver copies local content to remote. Production policies should account for record updates and user intent.

### `registerLocalOptimizer` and `registerRemoteOptimizer`

Both methods register an optimizer; `condition` selects a conditional optimizer over the default. See [Batch optimization](file-system.md#batch-optimization) for atom behavior.

```ts
const removeLocalOptimizer = ctx.registerLocalOptimizer({
  optimizer: ({ atoms }) => atoms,
});

const removeRemoteOptimizer = ctx.registerRemoteOptimizer({
  optimizer: ({ atoms }) => atoms,
  condition: () => ctx.settings.remoteFs === 'example',
});
```

### `registerSyncTrigger`

```ts
type RemoteStatsGetter = (infrastructure: {
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
}) => MaybePromise<Array<Stat> | undefined>;

type SyncTriggerEntry = {
  priority: number;
  getRemoteStats?: RemoteStatsGetter;
};
```

`priority` resolves concurrent sync requests: highest priority wins. `getRemoteStats` can bypass normal remote traversal by returning stats.

```ts
const removeTrigger = ctx.registerSyncTrigger('command', {
  priority: 1000,
});
```

#### Core sync triggers

Sync Engine pre-registers these triggers. When multiple sync requests are queued together, the registered trigger with highest priority determines behavior for that batch.

| Trigger                | Priority | Purpose                                                            |
| ---------------------- | -------: | ------------------------------------------------------------------ |
| `migration`            |   `6000` | Syncs before and after migration work.                             |
| `manual`               |   `5000` | Interactive ribbon or command sync; may request task confirmation. |
| `nonInteractiveManual` |   `4000` | User-started command sync without task confirmation.               |
| `startup`              |   `3000` | Runs once after configured startup delay.                          |
| `interval`             |   `2000` | Runs periodically while scheduled sync is enabled.                 |
| `realtime`             |   `1000` | Runs after an included vault change and configured debounce delay. |

`realtime` also provides core `getRemoteStats` optimization. When `realtimeSyncFastMode` is enabled, it derives remote stats from existing records instead of walking remote filesystem. Returning `undefined` when fast mode is disabled or records are empty restores normal remote traversal.

### `registerSetting` and `registerCss`

```ts
type SettingEntry = {
  order: number;
  render: (element: HTMLElement) => void;
};
```

`registerSetting` renders setting sections in ascending `order`. `registerCss(css)` injects CSS and returns callback that removes injected style element.

```ts
const removeSetting = ctx.registerSetting({
  order: 100,
  render: (element) => {
    element.createEl('p', { text: 'Example module setting' });
  },
});

const removeCss = ctx.registerCss(`
  .example-module-status {
    color: var(--text-success);
  }
`);
```

#### Core setting sections

Sync Engine pre-registers these setting sections. Rendering uses ascending `order`; choose module order between these values when contribution needs specific placement.

| Section           |  Order | Contents                                                                       |
| ----------------- | -----: | ------------------------------------------------------------------------------ |
| Top configuration |    `0` | Backend, module management and auto-update, decider, and conflict resolver.    |
| Features          | `1000` | Realtime, startup, and scheduled sync; realtime fast mode; asymmetric storage. |
| Controls          | `2000` | File-size, request-concurrency, request-interval, and memory limits.           |
| Filter rules      | `3000` | Inclusion and exclusion glob rules.                                            |
| Miscellaneous     | `4000` | Custom headers, mobile notices, task confirmation, and deletion confirmation.  |
| Development       | `5000` | Record cleanup and log export tools.                                           |

## Sync and conflict types

### `TaskNames`

```ts
type TaskNames =
  | 'addRecord'
  | 'removeRecord'
  | 'createLocalDir'
  | 'createRemoteDir'
  | 'download'
  | 'resolveConflict'
  | 'removeLocal'
  | 'removeRemote'
  | 'upload'
  | 'moveLocal'
  | 'moveRemote';
```

### `BaseTask`

`BaseTask` is type-only abstract base class for planned sync tasks. Each task exposes `options`, `name`, `prettyName`, `key`, `local`, `remote`, and `exec()`. Its filesystem and record-store fields are protected.

`BaseTask` declaration references internal `BaseTaskOptions` and `TaskOptions`; neither is standalone root SDK export.

### `TaskFactory`, `DeciderInput`, and `Decider`

`TaskFactory` creates correctly typed task for a `TaskNames` value. Use it instead of constructing task classes: their constructors require internal sync infrastructure.

```ts
type DeciderInput = {
  localStats: StatsMap;
  remoteStats: StatsMap;
  records: RecordStatsMap;
  taskFactory: TaskFactory;
  logger: (log: string) => void;
};

type Decider = (input: DeciderInput) => Array<BaseTask>;
```

`DeciderInput` contains current local and remote snapshots, prior sync records, a task factory, and a planning logger. A `Decider` converts that input into tasks to execute.

### Concrete task types

All concrete task types extend `BaseTask` and are type-only exports. `TaskFactory` accepts task-specific options below; every task requires `key`. Stat requirements refine that shared option shape.

| Type              | Required options beyond `key`                                       | Operation                                                                                         |
| ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `AddRecord`       | `local: Stat`, `remote: Stat`                                       | Creates record for both sides. File records contain both UIDs; directory records contain `isDir`. |
| `RemoveRecord`    | None                                                                | Deletes sync record without changing either filesystem.                                           |
| `Download`        | `remote: FileStat`                                                  | Copies remote file to local filesystem and records both UIDs.                                     |
| `Upload`          | `local: FileStat`                                                   | Copies local file to remote filesystem and records both UIDs.                                     |
| `CreateLocalDir`  | `remote: FolderStat`                                                | Creates local directory and its sync record.                                                      |
| `CreateRemoteDir` | `local: FolderStat`                                                 | Creates remote directory and its sync record.                                                     |
| `RemoveLocal`     | `local: Stat`                                                       | Deletes local path and its sync record.                                                           |
| `RemoveRemote`    | `remote: Stat`                                                      | Deletes remote path and its sync record.                                                          |
| `MoveLocal`       | `oldKey: string`, `remote: Stat`                                    | Moves local path from `oldKey` to `key` and moves its record.                                     |
| `MoveRemote`      | `oldKey: string`, `local: Stat`                                     | Moves remote path from `oldKey` to `key` and moves its record.                                    |
| `ResolveConflict` | `local: FileStat`, `remote: FileStat`, `resolver: ConflictResolver` | Invokes resolver with both file states and sync infrastructure.                                   |

### `ConflictResolver` and `ConflictResolverPayload`

```ts
type ConflictResolverPayload = {
  local: FileStat;
  remote: FileStat;
  key: string;
  localFs: Fs;
  remoteFs: Fs;
  record: RecordStore;
};

type ConflictResolver = (payload: ConflictResolverPayload) => MaybePromise<void>;
```

This minimal resolver shape copies local content to remote. Real policies should choose behavior deliberately.

```ts
const resolver: ConflictResolver = async ({ key, localFs, remoteFs }) => {
  const content = await localFs.read(key);
  await remoteFs.write(key, content);
};
```

### `SyncTerminateReason`

```ts
type SyncTerminateReason =
  | { result: 'cancelled' }
  | { result: 'completed' }
  | { result: 'failed'; error: string }
  | { result: 'noop' };
```

## Module metadata

```ts
type ModuleMeta = {
  name: string;
  version: string;
  description: string;
  main: string;
};
```

`ModuleMeta` describes one downloadable module. `main` is URL of built JavaScript entry.

## Runtime exports

### `digOriginal`

```ts
function digOriginal<FS extends RootFs | undefined = undefined>(wrapped: Fs): RootFs | FS;
```

Unwraps nested filesystem wrappers to underlying root filesystem. See [existing filesystem example](file-system.md#digoriginal).

### `MigrationModal`

`MigrationModal` is Obsidian modal for changes requiring user confirmation. Constructor accepts context with `app`, `on`, `dispatch`, `translate`, `requestSync`, and `initializeSync`; full `Context` supplies these members.

```ts
import { MigrationModal } from '@hesprs/sync-engine-sdk';

new MigrationModal(ctx, {
  content: 'Migration required.',
  apply: async () => {
    await migrate();
  },
  onCancel: () => {
    console.log('Migration cancelled.');
  },
}).open();
```

## Development entry point

Import these runtime helpers from `@hesprs/sync-engine-sdk/dev`.

### `debugWrapper`

```ts
function debugWrapper(original: Fs, log: (content: string) => void): WrappedFs;
```

Wraps filesystem and logs method calls and results.

```ts
ctx.registerRemoteFsWrapper({
  order: 9999,
  apply: (fs) => debugWrapper(fs, console.log),
});
```

### `testKit`

`testKit` provides `bytes`, `deferred`, `file`, `folder`, `flush`, `fs`, `request`, and `stream` helpers for tests.

```ts
import { debugWrapper, testKit } from '@hesprs/sync-engine-sdk/dev';

const harness = testKit.fs();
const loggedFs = debugWrapper(harness.fs, console.log);
const content = testKit.bytes('hello');
```

See [DevOps](devops.md#testkit) for full harness API.

### `obsidianBridge`

`obsidianBridge()` is Tsdown plugin factory that rewrites runtime `obsidian` imports to Sync Engine bridge.

```ts
import { obsidianBridge } from '@hesprs/sync-engine-sdk/dev';

export default defineConfig({
  plugins: [obsidianBridge()],
});
```

## Export index

### Root runtime exports

- `digOriginal`
- `MigrationModal`

### Root type exports

| Group                | Exports                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Context              | `Context`, `Settings`, `Events`, `Translations`, `SelectFromContext`                                                                                                                                                                                                                                         |
| Events               | `Dispatch`, `On`                                                                                                                                                                                                                                                                                             |
| Core data            | `Binary`, `MaybePromise`, `Progress`, `FileStat`, `FolderStat`, `Stat`, `StatsMap`, `RecordStat`, `RecordStatsMap`                                                                                                                                                                                           |
| Filesystem           | `RootFs`, `WrappedFs`, `Fs`, `WriteAtom`, `DeleteAtom`, `MoveAtom`, `MkdirAtom`, `InputAtom`, `CustomAtom`, `OutputAtom`, `OptimizerInput`, `BatchOptimizer`                                                                                                                                                 |
| Registration         | `FsWrapperEntry`, `RemoteFsEntry`, `RequestMiddlewareEntry`, `DeciderEntry`, `SyncTriggerEntry`, `RemoteStatsGetter`, `OptimizerEntry`, `SettingEntry`, `ConflictResolverEntry`, `Request`, `RequestMiddleware`, `RequestParam`, `CheckConnectionResult`                                                     |
| Sync                 | `TaskNames`, `BaseTask`, `AddRecord`, `RemoveRecord`, `Download`, `Upload`, `CreateLocalDir`, `CreateRemoteDir`, `RemoveLocal`, `RemoveRemote`, `MoveLocal`, `MoveRemote`, `ResolveConflict`, `TaskFactory`, `DeciderInput`, `Decider`, `ConflictResolver`, `ConflictResolverPayload`, `SyncTerminateReason` |
| Storage              | `RecordStore`, `StoreAsync`, `StoreSync`, `DatabaseAsync`, `DatabaseSync`                                                                                                                                                                                                                                    |
| Modules              | `ModuleMeta`                                                                                                                                                                                                                                                                                                 |
| Internationalization | `ObsidianLanguageCode`, `Fragment`, `TranslationResource`, `Translate`                                                                                                                                                                                                                                       |

### `/dev` runtime exports

- `debugWrapper`
- `testKit`
- `obsidianBridge`

Internal supporting types can appear in exported signatures but are not standalone root exports. They include `TogglableValue`, `GlobMatchOptions`, `Infras`, `BaseTaskOptions`, `TaskOptions`, `TaskOptionsMap`, `TaskInfo`, `FailedTaskInfo`, `DeleteConfirmReturn`, and `InterpolationValues`.
