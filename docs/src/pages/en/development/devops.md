# DevOps

## Feedback Loop

The fastest feedback loop is obtained by creating a symbolic link from `modules` folder to the `dist` folder in your project:

```sh
ln -s /path/to/your/vault/.obsidian/plugins/sync-engine/modules /path/to/your/project/dist
```

Remember we have the following in Tsdown config and `package.json`:

```TypeScript
const dev = process.env.MODE === 'dev';
export default defineConfig({
	clean: !dev,
});
```

```json
{
  "dev": "MODE=dev tsdown"
}
```

So simply run `bun dev`, and your module will be rebuilt inside the right folder. If you see two copies of your module, the newly built one is `Your Module.js`, another named `Your Module~0.0.1.js`, both exist in the `modules` folder, it is 100% OK and you shouldn't care about the duplication. Sync Engine automatically clears the old build.

After rebuilding, you need to reload the module in module management UI to apply latest changes.

## `debugWrapper`

The `@hesprs/sync-engine-sdk/dev` entry exports `debugWrapper`, an `FsWrapper` that logs every method call. Useful during debugging.

```ts
function debugWrapper(original: RemoteFs, log: (content: string) => void): WrappedRemoteFs;
```

Satisfies `RemoteFsWrapper<(content: string) => void>`.

Register as a wrapper:

```ts
import { debugWrapper } from '@hesprs/sync-engine-sdk/dev';

registerRemoteFsWrapper({
  apply: (fs) => debugWrapper(fs, console.log),
  priority: 9999, // any position you need
});
```

## `testKit`

Test harness utilities for writing FS and request tests:

```ts
type RequestParam = {
  url: string;
  method?: string;
  contentType?: string;
  headers?: Record<string, string>;
  throw?: boolean;
  body?: string | Binary;
};

type RequestHarness = {
  calls: Array<RequestParam | string>;
  request: Request;
};

type Request = (params: RequestParam | string) => Promise<{
  text: () => string;
  bytes: () => Binary;
  json: () => any;
  headers: Record<string, string>;
  status: number;
}>;

type FsCalls = {
  delete: Array<string>;
  exists: Array<string>;
  list: Array<string>;
  mkdir: Array<string>;
  move: Array<[string, string]>;
  read: Array<[string, number | undefined]>;
  readStream: Array<[string, number | undefined]>;
  stat: Array<string>;
  write: Array<[string, Binary]>;
  writeStream: Array<string>;
};

type FsControl = {
  delete: (key: string) => MaybePromise<void>;
  exists: (key: string) => MaybePromise<boolean>;
  list: (key: string, progress?: (progress: Progress) => void) => MaybePromise<Array<Stat>>;
  mkdir: (key: string, recursive?: boolean) => MaybePromise<void>;
  move: (oldKey: string, newKey: string) => MaybePromise<void>;
  read: (key: string, size?: number) => MaybePromise<Binary>;
  readStream: (key: string, size?: number) => MaybePromise<ReadableStream<Binary>>;
  stat: (key: string) => MaybePromise<Stat>;
  write: (key: string, value: Binary) => MaybePromise<string>;
  writeStream: (key: string, value: ReadableStream<Binary>) => MaybePromise<string>;
};

type FsHarness = {
  calls: FsCalls;
  control: FsControl;
  fs: RootFs;
};

type FsOptions = {
  control?: Partial<FsControl>;
  uid?: string;
};

const testKit: {
  bytes: (value: string) => Binary;
  deferred: <T>() => { promise: Promise<T>; reject; resolve };
  file: (key: string, options?: { mtime?: number; size?: number; uid?: string }) => Stat;
  folder: (key: string) => Stat;
  flush: (turns?: number) => Promise<void>;
  fs: (options?: FsOptions) => FsHarness;
  request: (control: Request) => RequestHarness;
  stream: (chunks?: Array<Binary | string>) => ReadableStream<Binary>;
};
```

`bytes(value)`: convert a string to binary.

`deferred()`: create a controlled promise.

`file(key, options?)`: create a file stat.

`folder(key)`: create a folder stat.

`flush(turns?)`: wait for several microtask queues to finish.

`fs(options?)`: create a stub file system.

`request(control)`: wrap a request stub to record calls.

`stream(chunks?)`: create a fake stream from an array.

## Module Registry

Modules are distributed as single JavaScript files hosted on a web server. The plugin reads module sources from **URLs** stored in settings, fetches at runtime, compares versions, and downloads updated modules automatically. This chapter covers the registry format, version comparison, the deployment pipeline, and what third-party authors need to know.

### Module Source Schema

A JSON array, each entry describes one module:

```json
[
  {
    "name": "WebDAV",
    "version": "0.0.2",
    "description": "[Official] WebDAV backend support.",
    "main": "https://sync.consensia.cc/modules/WebDAV.js"
  }
]
```

| Field         | Type     | Description                                                                                                            |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `name`        | `string` | Module display name. Must match the tsdown entry key. Can include any Unicode character except `< > : " / \ \| ? * ~`. |
| `version`     | `string` | Semver-compatible version string. Used for update comparison at runtime.                                               |
| `description` | `string` | One-line description shown in the Module Management UI.                                                                |
| `main`        | `string` | Absolute URL to the built `.js` file. The plugin downloads this file as the module binary.                             |

The plugin reads module sources from **URLs** stored in settings:

```ts
// Default source
moduleSources: ['https://sync.consensia.cc/modules.json'],
```

Users can add or remove source URLs via the **Edit sources** modal in the Module Management UI. This means third-party module registries are natively supported, any HTTP(S) URL serving a valid JSON source works.

### Auto-Update

On plugin load, if `Auto update modules` is enabled, the plugin:

1. Waits 200 milliseconds.
2. Fetches all configured source URLs.
3. For each module already installed locally, compares the remote version with the local version.
4. If the remote version is newer, queues a download.
5. Waits for the sync engine to be idle, then downloads and replaces the module file.

Only already-installed modules are auto-updated. New modules in the registry must be manually installed via the Module Management UI.

### Download Mechanism

When a module is downloaded (auto or manual):

1. The JavaScript file is fetched.
2. If sync is running, the plugin waits for it to idle and locks further sync operations.
3. If the module is currently loaded, it is unloaded first.
4. The old file is deleted, and the new file is written to disk.
5. If the module was previously running, it is reloaded.

### Local Module Storage

Modules are stored in the vault's plugin config directory `<vault>/.obsidian/plugins/sync-engine/modules/`, with names formatted as `<Name>~<Version>.js`:

- The `~` separator between name and version is **required**.
- The version in the filename must match the version from `modules.json`.
- Unversioned files (no `~`) are automatically renamed to include `~0.0.1`.

If multiple versions of the same module exist on disk (e.g., `S3~0.0.1.js` and `S3~0.0.2.js`), only the highest version is kept. Stale files are deleted.

## Publishing a Module

For modules that are not part of the official monorepo:

1. Build your module into a single `.js` file.
2. You need a publicly accessible HTTP(S) server. Serve:
   - A module source JSON file at a stable URL (e.g., `https://my-modules.example.com/modules.json`).
   - Each module's `.js` file at the URL specified in its `main` field.
   - Any static hosting works: JsDelivr, GitHub Releases, Cloudflare Pages, etc.
3. Users add your registry URL in the **Edit Sources** modal within the Module Management UI in the hamburger button aside the search bar. Once added, your modules appear alongside official ones.
