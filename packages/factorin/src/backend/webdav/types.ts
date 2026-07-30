// oxlint-disable typescript/method-signature-style
import type { RequestUrlParam } from 'obsidian';

/**
 * The SDK leaf types the vendored WebDAV FS is written against.
 *
 * Upstream's `packages/webdav` imports these from `@hesprs/sync-engine-sdk`. This
 * package cannot: the SDK *is* `packages/plugin`, and `packages/plugin` already
 * depends on `@factorin/module`, so an SDK dependency here — even a
 * `devDependency`, even type-only — closes a cycle Turbo rejects, and makes the
 * `postinstall` SDK build type a file that imports the SDK's own not-yet-emitted
 * `dist/index.d.ts` (`tsgo did not generate dts file for
 * packages/factorin/src/index.ts`). See `packages/factorin/README.md` and
 * `FACTOR.IN.md` § "Known fork-local edits".
 *
 * So the handful of leaf types the FS core touches are re-declared here, copied
 * verbatim from their upstream definitions:
 *
 * | This file                              | Upstream                                 |
 * | -------------------------------------- | ---------------------------------------- |
 * | `MaybePromise` `Binary` `*Stat` `Progress` | `packages/plugin/src/types.ts`        |
 * | `RootFs` `Fs` `WrappedFs` `ListReporter`  | `packages/plugin/src/fs/interface.ts` |
 * | `GlobMatchResult`                      | `packages/plugin/src/utils/glob-match.ts` |
 * | `RequestParam` `Request` `CheckConnectionResult` | `packages/plugin/src/modules/Registrar.ts` |
 *
 * **These are structural, so drift is caught at the boundary, not here.** The
 * module hands `WebdavFs` to the kernel's `registerRemoteFs`, whose
 * `RemoteFsEntry` is typed in real SDK types; that assignment is checked inside
 * `packages/plugin`'s own program. If upstream changes `RootFs` or `Request`, the
 * wiring in `src/index.ts` stops compiling — that is the signal to re-copy this
 * file, together with the FS diff described in `VENDORED.md`.
 *
 * Keep the declarations no *wider* than upstream's. Narrower is safe in the
 * direction that matters (we consume `Request`, we implement `RootFs`); wider
 * would let this package compile against a shape the kernel never provides.
 */

export type MaybePromise<T> = Promise<T> | T;

export type Binary = Uint8Array<ArrayBuffer>;

export type FileStat = {
	isDir: false;
	key: string;
	mtime: number;
	size: number;
	// Etag or other kinds of string whose equality signifies the file is unchanged
	uid: string;
};

export type FolderStat = {
	isDir: true;
	key: string;
};

export type Stat = FileStat | FolderStat;

export type Progress<T = string> = {
	total: number;
	completed: number;
	current?: T;
};

export type GlobMatchResult = 'advance' | 'exclude' | 'include';

/**
 * All keys use unified format:
 * - root: `/`
 * - file: `note.md`, `folder/note.md`
 * - folder: `folder/`, `folder/nested/`
 */
export type RootFs = {
	getUid(): string; // String whose inequality signifies the client is unique
	read(key: string, stat: FileStat): MaybePromise<Binary>;
	readStream(key: string, stat: FileStat): MaybePromise<ReadableStream<Binary>>;
	write(key: string, value: Binary, stat: FileStat): MaybePromise<string>; // Returns uid
	writeStream(key: string, value: ReadableStream<Binary>, stat: FileStat): MaybePromise<string>; // Returns uid, should only resolve when the stream is fully consumed
	delete(key: string): MaybePromise<void>;
	move(oldKey: string, newKey: string): MaybePromise<void>;
	mkdir(key: string, recursive?: boolean): MaybePromise<void>;
	stat(key: string): MaybePromise<Stat>;
	exists(key: string): MaybePromise<boolean>;
	list(key: string, reporter: ListReporter): MaybePromise<Array<Stat>>; // List recursive children under one folder
};

export type ListReporter = (progress: Required<Progress>) => MaybePromise<GlobMatchResult>;
export type WrappedFs = RootFs & { original: Fs };
export type Fs = RootFs | WrappedFs;

export type RequestParam = Omit<RequestUrlParam, 'body'> & { body?: Binary | string };

/**
 * `json()` is `() => any` upstream (its `General` escape hatch). `unknown` is the
 * narrowing — the FS core never calls it, and a real `() => any` stays assignable.
 */
export type Request = (params: RequestParam | string) => Promise<{
	text: () => string;
	bytes: () => Binary;
	json: () => unknown;
	headers: Record<string, string>;
	status: number;
}>;

export type CheckConnectionResult = { success: true } | { reason: string; success: false };
