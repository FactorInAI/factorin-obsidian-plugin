import type { Fs, RootFs } from '@/fs';
import type { Request, RequestParam } from '@/modules/Registrar';
import type { Progress, Stat, Binary, FileStat } from '@/types';

type FsCalls = {
	delete: Array<string>;
	exists: Array<string>;
	list: Array<string>;
	mkdir: Array<string>;
	move: Array<[string, string]>;
	read: Array<[string, FileStat]>;
	readStream: Array<[string, FileStat]>;
	stat: Array<string>;
	write: Array<[string, Binary, FileStat]>;
	writeStream: Array<[string, FileStat]>;
};

type FsOptions = {
	control?: Partial<Fs>;
	uid?: string;
};

type FsHarness = {
	calls: FsCalls;
	control: Fs;
	fs: RootFs;
};

type RequestHarness = {
	calls: Array<RequestParam | string>;
	request: Request;
};

const textEncoder = new TextEncoder();

function bytes(value: string): Binary {
	return textEncoder.encode(value);
}

function file(key: string, options: { mtime?: number; size?: number; uid?: string } = {}): Stat {
	const { mtime = 1, size = 5, uid = `${key}-uid` } = options;
	return { isDir: false, key, mtime, size, uid };
}

function folder(key: string): Stat {
	return { isDir: true, key };
}

function defaultStat(key: string): Stat {
	return key === '/' || key.endsWith('/')
		? folder(key)
		: file(key, { mtime: 10, size: 5, uid: 'uid' });
}

function stream(chunks: Array<string | Binary> = []): ReadableStream<Binary> {
	return new ReadableStream<Binary>({
		start(controller) {
			for (const chunk of chunks)
				controller.enqueue(typeof chunk === 'string' ? bytes(chunk) : chunk);
			controller.close();
		},
	});
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, reject, resolve };
}

async function flush(turns = 4) {
	for (let index = 0; index < turns; index += 1)
		await new Promise<void>((resolve) => queueMicrotask(resolve));
}

function createCalls(): FsCalls {
	return {
		delete: [],
		exists: [],
		list: [],
		mkdir: [],
		move: [],
		read: [],
		readStream: [],
		stat: [],
		write: [],
		writeStream: [],
	};
}

function createControl(overrides: Partial<Fs> = {}): Fs {
	return {
		delete: () => undefined,
		exists: () => false,
		getUid: () => 'FsControl',
		list: (key: string) => [
			defaultStat(key),
			folder(`${key}folder/`),
			file(`${key}folder/note.md`, { mtime: 12, size: 7, uid: 'note-2' }),
		],
		mkdir: () => undefined,
		move: () => undefined,
		read: () => bytes(''),
		readStream: () => stream(),
		stat: (key: string) => defaultStat(key),
		write: () => 'write-uid',
		writeStream: () => 'stream-uid',
		...overrides,
	};
}

function request(control: Request): RequestHarness {
	const calls: Array<RequestParam | string> = [];
	return {
		calls,
		request: (params: RequestParam | string) => {
			calls.push(params);
			return control(params);
		},
	};
}

function fs(options: FsOptions = {}): FsHarness {
	const calls = createCalls();
	const control = createControl(options.control);
	const uid = options.uid ?? 'uid';

	const rootFs: RootFs = {
		delete: async (key: string) => {
			calls.delete.push(key);
			return await control.delete(key);
		},
		exists: async (key: string) => {
			calls.exists.push(key);
			return await control.exists(key);
		},
		getUid: () => uid,
		list: async (key: string, progress?: (progress: Progress) => void) => {
			calls.list.push(key);
			return await control.list(key, progress);
		},
		mkdir: async (key: string, recursive?: boolean) => {
			calls.mkdir.push(key);
			return await control.mkdir(key, recursive);
		},
		move: async (oldKey: string, newKey: string) => {
			calls.move.push([oldKey, newKey]);
			return await control.move(oldKey, newKey);
		},
		read: async (key: string, stat: FileStat) => {
			calls.read.push([key, stat]);
			return await control.read(key, stat);
		},
		readStream: async (key: string, stat: FileStat) => {
			calls.readStream.push([key, stat]);
			return await control.readStream(key, stat);
		},
		stat: async (key: string) => {
			calls.stat.push(key);
			return await control.stat(key);
		},
		write: async (key: string, value: Binary, stat: FileStat) => {
			calls.write.push([key, value, stat]);
			return await control.write(key, value, stat);
		},
		writeStream: async (key: string, value: ReadableStream<Binary>, stat: FileStat) => {
			calls.writeStream.push([key, stat]);
			return await control.writeStream(key, value, stat);
		},
	};

	return { calls, control, fs: rootFs };
}

const testKit = { bytes, deferred, file, flush, folder, fs, request, stream };

export default testKit;
