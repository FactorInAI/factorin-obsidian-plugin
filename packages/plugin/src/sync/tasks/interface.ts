import type { RemoteFs, LocalFs } from '@/fs';
import type { SyncRecord } from '@/storage';
import type { MaybePromise } from '@/types';
import type { TaskOptions } from '../decision/interface';

export type BaseTaskOptions = {
	localFs: LocalFs;
	remoteFs: RemoteFs;
	record: SyncRecord;
};

export type TaskNames =
	| 'addRecord'
	| 'removeRecord'
	| 'createLocalDir'
	| 'createRemoteDir'
	| 'download'
	| 'merge'
	| 'removeLocal'
	| 'removeRemote'
	| 'upload'
	| 'moveLocal'
	| 'moveRemote';

export abstract class BaseTask<T extends TaskOptions = TaskOptions> {
	constructor(readonly options: BaseTaskOptions & T) {
		this.remoteFs = options.remoteFs;
		this.localFs = options.localFs;
		this.record = options.record;
		this.key = options.key;
		this.local = options.local;
		this.remote = options.remote;
	}
	protected readonly remoteFs: RemoteFs;
	protected readonly localFs: LocalFs;
	protected readonly record: SyncRecord;
	declare name: TaskNames;
	declare prettyName: string;
	readonly key: string;
	readonly local: (BaseTaskOptions & T)['local'];
	readonly remote: (BaseTaskOptions & T)['remote'];

	abstract exec(): MaybePromise<void>;
}

export class TaskError extends Error {
	constructor(
		message: string,
		readonly task: BaseTask,
		readonly cause?: Error,
	) {
		super(message);
		this.name = 'TaskError';
	}
}

const RED_COLOR = 'var(--color-red)';
const BLUE_COLOR = 'var(--color-blue)';
const YELLOW_COLOR = 'var(--color-yellow)';

export function getTaskIcon(name: TaskNames, isDir: boolean): string {
	if (name === 'createRemoteDir') return 'folder-up';
	if (name === 'createLocalDir') return 'folder-down';
	if (name === 'download') return 'file-down';
	if (name === 'upload') return 'file-up';
	if (name === 'merge') return 'combine';
	if (name === 'removeLocal' || name === 'removeRemote') return isDir ? 'folder-x' : 'file-x';
	if (name === 'moveLocal' || name === 'moveRemote')
		return isDir ? 'folder-output' : 'file-output';
	return 'refresh-cw';
}

export function getTaskColor(name: TaskNames): string {
	switch (name) {
		case 'merge': {
			return YELLOW_COLOR;
		}
		case 'removeLocal':
		case 'removeRemote': {
			return RED_COLOR;
		}
		default: {
			return BLUE_COLOR;
		}
	}
}
