import testKit from '$/test-kit';
import { expect, test } from 'bun:test';
import type { InputAtom, OutputAtom } from '@/fs';
import { hierarchicalOptimizer } from '@/fs';

const { deferred, flush } = testKit;

function runOptimizer(atoms: Array<InputAtom>) {
	const started = new WeakMap<OutputAtom, Promise<string | void>>();
	const executeAtom = (atom: OutputAtom) => {
		const pending = started.get(atom);
		if (pending) return pending;
		const result = Promise.resolve(atom.execute());
		started.set(atom, result);
		return result;
	};

	return {
		executeAtom,
		optimized: hierarchicalOptimizer({ atoms, executeAtom, fs: {} as never }),
	};
}

test('mkdir chain waits for ancestor mkdir', async () => {
	const logs: Array<string> = [];
	const root = deferred<void>();
	const nested = deferred<void>();
	const atoms: Array<InputAtom> = [
		{
			execute: async () => {
				logs.push('mkdir:folder/');
				await root.promise;
			},
			key: 'folder/',
			resolve: () => {},
			type: 'mkdir',
		},
		{
			execute: async () => {
				logs.push('mkdir:folder/nested/');
				await nested.promise;
			},
			key: 'folder/nested/',
			resolve: () => {},
			type: 'mkdir',
		},
		{
			execute: async () => {
				logs.push('write:folder/nested/file.md');
				return 'write-uid';
			},
			key: 'folder/nested/file.md',
			resolve: () => {},
			type: 'write',
		},
	];
	const { executeAtom, optimized } = runOptimizer(atoms);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(logs).toStrictEqual(['mkdir:folder/']);

	root.resolve();
	await flush();
	expect(logs).toStrictEqual(['mkdir:folder/', 'mkdir:folder/nested/']);

	nested.resolve();
	await flush();
	expect(logs).toStrictEqual([
		'mkdir:folder/',
		'mkdir:folder/nested/',
		'write:folder/nested/file.md',
	]);

	await pending;
});

test('move gates operations under destination', async () => {
	const logs: Array<string> = [];
	const move = deferred<void>();
	const atoms: Array<InputAtom> = [
		{
			execute: async () => {
				logs.push('move:folder/src/->folder/dst/');
				await move.promise;
			},
			newKey: 'folder/dst/',
			oldKey: 'folder/src/',
			resolve: () => {},
			type: 'move',
		},
		{
			execute: async () => {
				logs.push('write:folder/dst/note.md');
				return 'dst-uid';
			},
			key: 'folder/dst/note.md',
			resolve: () => {},
			type: 'write',
		},
	];
	const { executeAtom, optimized } = runOptimizer(atoms);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(logs).toStrictEqual(['move:folder/src/->folder/dst/']);

	move.resolve();
	await flush();
	expect(logs).toStrictEqual(['move:folder/src/->folder/dst/', 'write:folder/dst/note.md']);

	await pending;
});

test('folder deletion subsumes descendant deletions', async () => {
	const logs: Array<string> = [];
	let childResolved = false;
	const atoms: Array<InputAtom> = [
		{
			execute: async () => {
				logs.push('delete:folder/');
			},
			key: 'folder/',
			resolve: () => {},
			type: 'delete',
		},
		{
			execute: async () => {
				throw new Error('descendant deletion should be subsumed');
			},
			key: 'folder/note.md',
			resolve: () => {
				childResolved = true;
			},
			type: 'delete',
		},
	];
	const { executeAtom, optimized } = runOptimizer(atoms);

	await Promise.all(optimized.map(executeAtom));

	expect(logs).toStrictEqual(['delete:folder/']);
	expect(childResolved).toBe(true);
});

test('parent move subsumes descendant move without freezing', async () => {
	const logs: Array<string> = [];
	let descendantResolved = false;
	const atoms: Array<InputAtom> = [
		{
			execute: async () => {
				logs.push('move:old/->new/');
			},
			newKey: 'new/',
			oldKey: 'old/',
			resolve: () => {},
			type: 'move',
		},
		{
			execute: async () => {
				throw new Error('descendant move should be subsumed');
			},
			newKey: 'new/note.md',
			oldKey: 'old/note.md',
			resolve: () => {
				descendantResolved = true;
			},
			type: 'move',
		},
	];
	const { executeAtom, optimized } = runOptimizer(atoms);
	const pending = Promise.all(optimized.map(executeAtom));
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(() => reject(new Error('optimizer timed out')), 100),
	);

	await Promise.race([pending, timeout]);
	expect(logs).toStrictEqual(['move:old/->new/']);
	expect(descendantResolved).toBe(true);
});

test('delete blocks folder/file collision write', async () => {
	const logs: Array<string> = [];
	const release = deferred<void>();
	const atoms: Array<InputAtom> = [
		{
			execute: async () => {
				logs.push('delete:folder/');
				await release.promise;
			},
			key: 'folder/',
			resolve: () => {},
			type: 'delete',
		},
		{
			execute: async () => {
				logs.push('write:folder');
				return 'file-uid';
			},
			key: 'folder',
			resolve: () => {},
			type: 'write',
		},
	];
	const { executeAtom, optimized } = runOptimizer(atoms);
	const pending = Promise.all(optimized.map(executeAtom));

	await flush();
	expect(logs).toStrictEqual(['delete:folder/']);

	release.resolve();
	await flush();
	expect(logs).toStrictEqual(['delete:folder/', 'write:folder']);

	await pending;
});
