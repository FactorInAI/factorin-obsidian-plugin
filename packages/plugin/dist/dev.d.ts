import { Q as Fs, at as RootFs, ct as Binary, d as RequestParam, dt as MaybePromise, ft as Progress, ht as Stat, l as Request, ot as WrappedFs } from "./index-COzj6AhN.js";
//#region src/sdk/debug-wrapper.d.ts
declare function debugWrapper(original: Fs, log: (content: string) => void): WrappedFs;
//#endregion
//#region test/test-kit.d.ts
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
type FsOptions = {
  control?: Partial<FsControl>;
  uid?: string;
};
type FsHarness = {
  calls: FsCalls;
  control: FsControl;
  fs: RootFs;
};
type RequestHarness = {
  calls: Array<RequestParam | string>;
  request: Request;
};
declare function bytes(value: string): Binary;
declare function file(key: string, options?: {
  mtime?: number;
  size?: number;
  uid?: string;
}): Stat;
declare function folder(key: string): Stat;
declare function stream(chunks?: Array<string | Binary>): ReadableStream<Binary>;
declare function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};
declare function flush(turns?: number): Promise<void>;
declare function request(control: Request): RequestHarness;
declare function fs(options?: FsOptions): FsHarness;
declare const testKit: {
  bytes: typeof bytes;
  deferred: typeof deferred;
  file: typeof file;
  flush: typeof flush;
  folder: typeof folder;
  fs: typeof fs;
  request: typeof request;
  stream: typeof stream;
};
//#endregion
//#region src/sdk/obsidian-bridge.d.ts
declare function obsidianBridge(): {
  name: string;
  renderChunk(code: string): {
    code: string;
  } | undefined;
};
//#endregion
export { debugWrapper, obsidianBridge, testKit };