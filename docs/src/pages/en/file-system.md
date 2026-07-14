# File System & Wrapper Chain

Sync Engine uses a unified file system interface across the plugin. And wrappers are middlewares above this interface.

## `RootFs`

Every remote backend must implement this interface. Keys use a unified format:

- `/` for the root
- `note.md` / `folder/note.md` for files
- `folder/` / `folder/nested/` for folders (always has trailing `/`)

```ts
type Binary = Uint8Array<ArrayBuffer>;

type Progress<T = string> = {
  total: number;
  completed: number;
  current?: T;
};

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

type RootFs = {
  getUid(): string;
  read(key: string): MaybePromise<Binary>;
  readStream(key: string, size?: number): MaybePromise<ReadableStream<Binary>>;
  write(key: string, value: Binary): MaybePromise<string>; // Returns uid
  writeStream(key: string, value: ReadableStream<Binary>): MaybePromise<string>; // Returns uid
  delete(key: string): MaybePromise<void>;
  move(oldKey: string, newKey: string): MaybePromise<void>;
  mkdir(key: string, recursive?: boolean): MaybePromise<void>;
  stat(key: string): MaybePromise<Stat>;
  exists(key: string): MaybePromise<boolean>;
  list(key: string, progress?: (progress: Progress) => void): MaybePromise<Array<Stat>>;
};

// You can import like this
import type { RootFs } from '@hesprs/sync-engine-sdk';
```

### `getUid(): string`

Returns a stable unique identifier for this FS instance. Convention: `<type>~<distinguishing-data>~...` using `~` as delimiter.

Example: `"webdav~https://example.com/dav~username"`

### `read(key)`

Reads a whole file.

### `readStream(key, size?)`

Returns a `ReadableStream<Binary>` for the file. Since Obsidian `requestUrl` API cannot stream, the typical implementation of `readStream` is using ranged downloading and wrap in a stream. You must keep the average memory consumption during streaming below 16MiB, which is the assumption of the memory control mechanism embedded in Sync Engine core.

### `write(key, value): string`

Writes a file. Returns a **uid** (ETag or equivalent) that uniquely identifies this version of the file.

### `writeStream(key, value): string`

Pipes a `ReadableStream<Binary>` to a remote key. Typical implementation could be multipart uploading to a temporary path, then move to actual location. Returns a `uid` of the final file.

### `delete(key)`

Deletes a file. Should silently succeed if the key does not exist (idempotent).

### `move(oldKey, newKey)`

Renames/moves a file. Implement as copy + delete if the backend doesn't support native move.

### `mkdir(key, recursive?)`

Creates a directory. For backends with no real directories (like S3), create a zero-byte object. If `recursive` is true, create parent directories first.

### `stat(key): Stat`

Returns metadata for a key. If the key doesn't exist, throw an error.

### `exists(key): boolean`

Checks if a key exists (file or folder).

### `list(key, progress?): Array<Stat>`

Recursively lists all children under `key` including all files and folders. Reports progress via the optional callback.

### Class Implementation

```ts
import type { Progress, RootFs, Stat, Request } from '@hesprs/sync-engine-sdk';

export type MyFsOptions = {
  endpoint: string;
  apiKey: string;
};

export class MyFs implements RootFs {
  constructor(
    private readonly options: MyFsOptions,
    private readonly request: Request,
  ) {}

  getUid(): string {
    return `mybackend~${this.options.endpoint}~${this.options.apiKey}`;
  }

  // ... implement all methods
}
```

Key points:

- `implements RootFs` ensures the class fulfills the interface.
- `private readonly request: Request` the file system must use the provided request utility to make network requests.
- Backends can implement beyond `RootFs` interface to include more methods for backends with special capability (e.g., S3 batch delete), then you can use these methods in batch optimizer.

Examples: [Vault](https://github.com/hesprs/sync-engine/tree/main/packages/plugin/fs/vault.ts), [WebDAV](https://github.com/hesprs/sync-engine/tree/main/packages/webdav/src/webdav/fs.ts).

## Wrapper Chain

Wrappers are middleware that wrap a `type Fs = RootFs | WrappedFs;`, transforming calls as they pass through, and return a `WrappedFs`. The chain is ordered numerically — lower `order` values are applied first (innermost wrapper).

**Existing remote wrapper chain**:

| Order | Wrapper             | Description                                  |
| ----- | ------------------- | -------------------------------------------- |
| 1000  | `MemoryControl`     | Tracks memory, pauses when limit reached     |
| 2000  | `Optimization`      | Applies `BatchOptimizer` to batch operations |
| 3000  | `Cancellation`      | Checks `isCancelled` before each operation   |
| 10000 | `Context`           | Caches stat results in in-memory DB          |
| 11000 | `AsymmetricStorage` | Enables asymmetric storage mode              |

**Existing local wrapper chain**:

| Order | Wrapper         |
| ----- | --------------- |
| 1000  | `MemoryControl` |
| 2000  | `Optimization`  |
| 3000  | `Cancellation`  |
| 10000 | `Context`       |

### Writing a Wrapper

A wrapper is a function that accepts an `Fs` and returns an `Fs`.

Create a class implementing `type WrappedFs = RootFs & { original: Fs }`. E.g., adding prefixes to keys:

```ts
import type { Progress, Fs, WrappedFs } from '@hesprs/sync-engine-sdk';

class PrefixFs implements WrappedFs {
  constructor(
    public readonly original: Fs,
    private readonly prefix: string,
  ) {}

  getUid(): string {
    return `${this.original.getUid()}~${this.prefix}`;
  }

  read(key: string, size?: number) {
    return this.original.read(this.prefix + key, size);
  }

  // ... delegate all methods, prepending prefix / stripping it from results

  async stat(key: string) {
    const raw = await this.original.stat(this.prefix + key);
    return stripPrefix(this.prefix, raw);
  }

  async list(key: string, progress?: (prog: Progress) => void) {
    const raw = await this.original.list(this.prefix + key, progress);
    return raw.map((stat) => stripPrefix(this.prefix, stat)).filter((stat) => stat.key !== '/');
  }
}

export default function prefixWrapper(original: Fs, prefix: string): WrappedFs {
  return new PrefixFs(original, normalizedPrefix);
}
```

Examples: [Optimization Wrapper](https://github.com/hesprs/sync-engine/tree/main/packages/plugin/src/fs/wrappers/optimization.ts), [Encryption Wrapper](https://github.com/hesprs/sync-engine/tree/main/packages/encryption/src/wrapper/index.ts), [Base Directory Wrapper](https://github.com/hesprs/sync-engine/tree/main/packages/webdav/src/base-dir.ts).

### Registering a Wrapper

```ts
this.ctx.registerRemoteFsWrapper({
  // it is the same for `registerLocalFsWrapper`
  apply: (fs) => prefixWrapper(fs, this.moduleSettings.prefix),
  condition: () => this.ctx.settings.remoteFs === 'my-backend', // only wrap this FS backend
  order: 4823, // standard prefix position, avoid whole hundred and thousands to prevent collision
});
```

The `condition` option ties the wrapper to a specific trigger. If omitted, the wrapper applies to all FS backends.

## Batch Optimization

The optimization wrapper (order 2000) collects atomic FS operations and passes them to a `BatchOptimizer` function. This allows backend-specific optimizations like S3 batch deletion or hierarchical operation reordering.

### Optimizer Input/Output

```ts
type WriteAtom = {
  type: 'write';
  key: string;
  execute: () => MaybePromise<string>;
  resolve: (uid: string) => void;
};
type DeleteAtom = {
  type: 'delete';
  key: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
};
type MoveAtom = {
  type: 'move';
  oldKey: string;
  newKey: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
};
type MkdirAtom = {
  type: 'mkdir';
  key: string;
  execute: () => MaybePromise<void>;
  resolve: () => void;
};
type InputAtom = WriteAtom | DeleteAtom | MoveAtom | MkdirAtom;

type CustomAtom = {
  type: 'custom';
  execute: () => MaybePromise<void>;
};
type OutputAtom = InputAtom | CustomAtom;

type OptimizerInput = {
  atoms: Array<InputAtom>; // The original atoms
  fs: Fs; // The FS chain below optimization
  executeAtom: (atom: OutputAtom) => MaybePromise<void | string>; // Helper to execute an atom according to its reference, and cache the result so multiple execution only invokes `execute()` once
};

type BatchOptimizer = (input: OptimizerInput) => Array<OutputAtom>;
```

The optimizer receives the full list of atoms and can:

- Replace multiple atoms with a single `CustomAtom`
- Add new atoms
- Remove atoms
- Reassign an atom's `execute` by wrapping it to await the `executeAtom()` of all its dependency atoms, use this to resolve the dependency between operations.
- Resolve an atom directly

### Example: S3 Batch Delete Optimizer

```ts
import type { RemoteFs, OutputAtom, OptimizerInput } from '@hesprs/sync-engine-sdk';
import { digOriginal } from '@hesprs/sync-engine-sdk';
import { S3Fs, BATCH_DELETE_MAX_KEYS } from './s3/fs';

export default function batchDeleteOptimizer({ atoms, fs }: OptimizerInput): Array<OutputAtom> {
  const deleteAtoms = atoms.filter((a) => a.type === 'delete');
  const otherAtoms: Array<OutputAtom> = atoms.filter((a) => a.type !== 'delete');

  if (!deleteAtoms.length) return atoms;

  const keys = deleteAtoms.map((a) => ({ key: a.key, resolve: a.resolve }));
  const batches: Array<Array<{ key: string; resolve: () => void }>> = [];
  for (let i = 0; i < keys.length; i += BATCH_DELETE_MAX_KEYS)
    batches.push(keys.slice(i, i + BATCH_DELETE_MAX_KEYS));
  const s3Fs = digOriginal<S3Fs>(fs);

  const batchAtoms: Array<OutputAtom> = batches.map((batch) => ({
    type: 'custom' as const,
    execute: async () => {
      await s3Fs.batchDelete(batch.map(({ key }) => key));
      batch.foreach(({ resolve }) => resolve());
    },
  }));

  return [...otherAtoms, ...batchAtoms];
}
```

**Important**: If the optimizer removes some atoms from the original atoms array, it **must** call `resolve()` by itself or by its custom atoms. Otherwise the syncing will hang forever.

More complex example: [Hierarchical Optimizer](https://github.com/hesprs/sync-engine/tree/main/packages/plugin/src/fs/hierarchal-optimizer.ts), showcases dependency wrapping.

### Registering an Optimizer

```ts
// Same for `registerLocalOptimizer`
this.ctx.registerRemoteOptimizer({
  optimizer: batchDeleteOptimizer,
  condition: () => this.ctx.settings.remoteFs === 's3',
});
```

`condition` restricts the optimizer to only run when the predicate matches. If omitted, the optimizer is qualified for all backends. The final optimizer that will run is the last one registers.

## `digOriginal`

When an optimizer needs to call a method on the root FS that isn't part of the `Fs` interface (e.g., `S3Fs.batchDelete()`), use `digOriginal<Fs>` to unwrap through the `.original` chain:

```ts
import { digOriginal } from '@hesprs/sync-engine-sdk';
const rootFs = digOriginal<S3Fs>(wrappedFs);
```
