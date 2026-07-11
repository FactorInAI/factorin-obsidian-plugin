// oxlint-disable typescript/method-signature-style
import type { MaybePromise, Progress, Stat, Binary } from '@/types';

/**
 * All keys use unified format:
 * - root: `/`
 * - file: `note.md`, `folder/note.md`
 * - folder: `folder/`, `folder/nested/`
 */
export type RootFs = {
	getUid(): string; // String whose inequality signifies the client is unique
	read(key: string, size?: number): MaybePromise<Binary>;
	readStream(key: string, size?: number): MaybePromise<ReadableStream<Binary>>;
	write(key: string, value: Binary): MaybePromise<string>; // Returns uid
	writeStream(key: string, value: ReadableStream<Binary>, size?: number): MaybePromise<string>; // Returns uid, should only resolve when the stream si fully consumed
	delete(key: string): MaybePromise<void>;
	move(oldKey: string, newKey: string): MaybePromise<void>;
	mkdir(key: string, recursive?: boolean): MaybePromise<void>;
	stat(key: string): MaybePromise<Stat>;
	exists(key: string): MaybePromise<boolean>;
	list(key: string, progress?: (progress: Progress) => void): MaybePromise<Array<Stat>>; // List recursive children under one folder
};

export type WrappedFs = RootFs & { original: Fs };
export type Fs = WrappedFs | RootFs;

export type WriteAtom = { type: 'write'; key: string; execute: () => MaybePromise<string> };
export type DeleteAtom = { type: 'delete'; key: string; execute: () => MaybePromise<void> };
export type MoveAtom = {
	type: 'move';
	oldKey: string;
	newKey: string;
	execute: () => MaybePromise<void>;
};
export type MkdirAtom = { type: 'mkdir'; key: string; execute: () => MaybePromise<void> };
export type InputAtom = WriteAtom | DeleteAtom | MoveAtom | MkdirAtom;
export type CustomAtom = {
	type: 'custom';
	execute: () => MaybePromise<void>;
};
export type OutputAtom = InputAtom | CustomAtom;

export type OptimizerInput = {
	atoms: Array<InputAtom>;
	fs: Fs;
	executeAtom: (atom: OutputAtom) => MaybePromise<void | string>;
};

// Batch optimizer works by wrapping each atom's `execute()` to await for the resolve of other dependency atoms' `execute()`. It may also add / delete atoms.
export type BatchOptimizer = (input: OptimizerInput) => Array<OutputAtom>;
