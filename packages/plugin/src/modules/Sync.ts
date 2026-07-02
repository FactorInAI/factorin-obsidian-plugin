import type { Events, Settings, Translations } from '@';
import type { LocalFs } from '@/fs';
import type { Decider, TaskFactory, TaskNames, TaskOptionsMap } from '@/sync';
import type {
	ConflictStrategy,
	GlobMatchOptions,
	MaybePromise,
	Progress,
	Stat,
	StatsMap,
	TogglableValue,
	UnmergeableStrategy,
} from '@/types';
import {
	RemoveLocal,
	CreateRemoteDir,
	Upload,
	AddRecord,
	RemoveRecord,
	BaseTask,
	postTraversal,
	syncCancelledError,
	taskMap,
} from '@/sync';
import type { Dispatch, On } from './EventBus';
import type { Translate } from './I18n';
import type { DeleteConfirmReturn } from './ProgressModal';
import type { Infras, RemoteListGetter } from './Registrar';

type SyncTerminateReason =
	| { result: 'cancelled' }
	| { result: 'completed' }
	| { result: 'failed'; error: string }
	| { result: 'noop' };

export type SyncResult = SyncTerminateReason['result'];
export type TaskInfo = { name: TaskNames; key: string; prettyName: string };
export type FailedTaskInfo = TaskInfo & { error: string };

export default class Sync {
	dispatch: Dispatch<Events>;
	on: On<Events>;

	constructor(
		private readonly ctx: {
			dispatch: Dispatch<Events>;
			initializeSync: () => Promise<Infras>;
			getDecider: () => Decider;
			on: On<Events>;
			translate: Translate<Translations>;
			getRemoteListGetter: (trigger: string) => RemoteListGetter | undefined;
			requestSync: (trigger: string) => Promise<SyncResult>;
		},
	) {
		this.dispatch = ctx.dispatch;
		this.on = ctx.on;
	}

	declare readonly events: {
		syncStarted: { isCancelled: () => boolean; trigger: string };
		remoteWalkProgress: Progress;
		syncTerminated: SyncTerminateReason;
		requestConfirmDelete: Array<RemoveLocal>;
		requestConfirmTasks: Array<BaseTask>;
		syncCanceled: undefined;
		taskCompleted: TaskInfo;
		taskFailed: FailedTaskInfo;
		executionStarted: Array<BaseTask>;
		autoMigrationProgress: Progress | 'failed';
	};
	declare readonly settings: {
		maxFileSize: TogglableValue;
		exclusionRules: Array<GlobMatchOptions>;
		inclusionRules: Array<GlobMatchOptions>;
		conflictStrategy: ConflictStrategy;
		unmergeableStrategy: UnmergeableStrategy;
		confirmDeleteInAutoSync: boolean;
		confirmTasksInSync: boolean;
		useGitStyle: boolean;
	};

	private readonly postProcess = (stats: Array<Stat>) =>
		postTraversal({
			exclusionRules: this.settings.exclusionRules,
			inclusionRules: this.settings.inclusionRules,
			maxSize: this.settings.maxFileSize.enabled
				? this.settings.maxFileSize.value
				: undefined,
			stats: toMap(stats),
		});

	private readonly confirmTasks = (tasks: Array<BaseTask>) =>
		new Promise<Array<BaseTask>>((resolve, reject) => {
			const unsub1 = this.on('tasksConfirmed', (result) => {
				cleanup();
				resolve(result);
			});
			const unsub2 = this.on('syncCanceled', () => {
				cleanup();
				reject(syncCancelledError);
			});
			function cleanup() {
				unsub1();
				unsub2();
			}
			this.dispatch('requestConfirmTasks', tasks);
		});

	private readonly confirmDeletion = (tasks: Array<RemoveLocal>) =>
		new Promise<DeleteConfirmReturn>((resolve, reject) => {
			const unsub1 = this.on('deleteConfirmed', (result) => {
				cleanup();
				resolve(result);
			});
			const unsub2 = this.on('syncCanceled', () => {
				cleanup();
				reject(syncCancelledError);
			});
			function cleanup() {
				unsub1();
				unsub2();
			}
			this.dispatch('requestConfirmDelete', tasks);
		});

	private readonly executeSync = async (trigger: string) => {
		let cancelled = false;
		let failedCount = 0;
		let tasks: Array<BaseTask>;
		const isCancelled = () => cancelled;
		const cleanup = this.on('syncCanceled', () => (cancelled = true));
		try {
			this.dispatch('syncStarted', { isCancelled, trigger });

			const { record, localFs, remoteFs } = await this.ctx.initializeSync();
			const traverseRemote = async () => {
				try {
					return await remoteFs.list('/', (progress) =>
						this.dispatch('remoteWalkProgress', progress),
					);
				} catch (error) {
					if (await remoteFs.exists('/')) throw error;
					this.dispatch('log', 'Remote root deleted, recreating.');
					await Promise.all([remoteFs.mkdir('/', true), record.drop()]);
					return [];
				}
			};
			const getRemoteList = async () => {
				const list = await (this.ctx.getRemoteListGetter(trigger)?.({
					localFs,
					record,
					remoteFs,
				}) ?? traverseRemote());
				if (list) return list;
				return await traverseRemote();
			};
			const [localList, remoteList] = await Promise.all([localFs.list('/'), getRemoteList()]);
			if (cancelled) throw syncCancelledError;
			const records = await record.getRecords();
			const localStats = this.postProcess(localList);
			const remoteStats = this.postProcess(remoteList);
			this.dispatch(
				'log',
				`Local ${localStats.size} item(s), remote ${remoteStats.size} item(s), record ${records.size} item(s).`,
			);

			if (cancelled) throw syncCancelledError;
			const taskFactory = createTaskFactory(
				{ localFs, record, remoteFs },
				this.ctx.translate,
			);
			tasks = this.ctx.getDecider()({
				localStats,
				logger: (log: string) => this.dispatch('log', log),
				records,
				remoteStats,
				settings: this.settings as Settings,
				taskFactory,
			});
			if (tasks.length === 0) {
				this.dispatch('syncTerminated', { result: 'noop' });
				return 'noop';
			}
			this.dispatch('log', `Planning finished with ${tasks.length} task(s).`);

			const [nonDisplayableTasks, displayableTasks] = partition(
				tasks,
				(task) => task instanceof AddRecord || task instanceof RemoveRecord,
			);
			if (
				trigger === 'manual' &&
				this.settings.confirmTasksInSync &&
				displayableTasks.length !== 0
			) {
				const confirmResult = await this.confirmTasks(displayableTasks);
				tasks = [...nonDisplayableTasks, ...confirmResult];
			}

			const [removeLocalTasks, otherTasks] = partition(
				tasks,
				(task) => task instanceof RemoveLocal,
			);
			if (
				trigger !== 'manual' &&
				trigger !== 'nonInteractiveManual' &&
				this.settings.confirmDeleteInAutoSync &&
				removeLocalTasks.length !== 0
			) {
				const { delete: deleted, reupload } = await this.confirmDeletion(removeLocalTasks);
				tasks = [
					...deleted,
					...(await this.convertDeleteToUpload(reupload, localFs)),
					...otherTasks,
				];
			}

			if (cancelled) throw syncCancelledError;
			this.dispatch('executionStarted', tasks);
			await Promise.all(
				tasks.map(async (task) => {
					try {
						await task.exec();
						this.dispatch('taskCompleted', toTaskInfo(task));
					} catch (error) {
						if (cancelled) return;
						failedCount++;
						this.dispatch('taskFailed', {
							...toTaskInfo(task),
							error: toErrorMessage(error),
						});
					}
				}),
			);

			if (failedCount) {
				this.dispatch('syncTerminated', {
					error: `Execution of ${failedCount} tasks failed.`,
					result: 'failed',
				});
				return 'failed';
			}
			this.dispatch('syncTerminated', { result: 'completed' });
			return 'completed';
		} catch (error) {
			if (cancelled) {
				this.dispatch('syncTerminated', { result: 'cancelled' });
				return 'cancelled';
			}
			this.dispatch('syncTerminated', { error: toErrorMessage(error), result: 'failed' });
			return 'failed';
		} finally {
			cleanup();
		}
	};

	private async convertDeleteToUpload(tasks: Array<RemoveLocal>, localFs: LocalFs) {
		const final: Array<Upload | CreateRemoteDir> = [];
		await Promise.all(
			tasks.map(async (task) => {
				const options = task.options;
				const local = await localFs.stat(options.key);
				if (!local) {
					this.dispatch(
						'log',
						`Local file \`${options.key}\` not found during reupload.`,
					);
					return;
				}
				if (local.isDir) final.push(new CreateRemoteDir({ ...options, local }));
				else final.push(new Upload({ ...options, local }));
			}),
		);
		return final;
	}

	private readonly autoMigrate = async (apply: () => MaybePromise<void>) => {
		const { dispatch, requestSync, initializeSync } = this.ctx;
		dispatch('log', 'Auto-migration started.');
		dispatch('autoMigrationProgress', { completed: 0, total: 3 });
		const phase1Result = await requestSync('autoMigration');
		if (phase1Result === 'cancelled' || phase1Result === 'failed') {
			dispatch('error', 'Auto-migration phase 1 failed.');
			dispatch('autoMigrationProgress', 'failed');
			return;
		}
		dispatch('autoMigrationProgress', { completed: 1, total: 3 });
		try {
			const { record, remoteFs } = await initializeSync();
			await Promise.all([record.drop(), remoteFs.delete('/'), apply()]);
		} catch (error) {
			dispatch('error', `Auto-migration phase 2 failed: \`${toErrorMessage(error)}\`.`);
			dispatch('autoMigrationProgress', 'failed');
			return;
		}
		dispatch('autoMigrationProgress', { completed: 2, total: 3 });
		const phase3Result = await requestSync('autoMigration');
		if (phase3Result === 'cancelled' || phase3Result === 'failed') {
			dispatch('error', 'Auto-migration phase 3 failed.');
			dispatch('autoMigrationProgress', 'failed');
			return;
		}
		dispatch('autoMigrationProgress', { completed: 3, total: 3 });
	};

	root = { autoMigrate: this.autoMigrate, executeSync: this.executeSync };
}

function toMap(stats: Array<Stat>): StatsMap {
	const res = new Map<string, Stat>();
	for (const stat of stats) res.set(stat.key, stat);
	return res;
}

function createTaskFactory(
	baseOptions: Infras,
	translate: (name: TaskNames) => string,
): TaskFactory {
	return (<N extends TaskNames>(name: N, options: TaskOptionsMap[N]) => {
		const task = new taskMap[name]({ ...options, ...baseOptions } as never);
		task.name = name;
		task.prettyName = translate(name);
		return task;
	}) as TaskFactory;
}

function partition<T, U extends T>(
	items: ReadonlyArray<T>,
	predicate: (item: T, index: number) => item is U,
): [Array<U>, Array<Exclude<T, U>>] {
	const truthy: Array<T> = [];
	const falsy: Array<T> = [];
	for (let i = 0; i < items.length; i++) (predicate(items[i], i) ? truthy : falsy).push(items[i]);
	return [truthy as Array<U>, falsy as Array<Exclude<T, U>>];
}

function toTaskInfo(task: BaseTask): TaskInfo {
	return { key: task.key, name: task.name, prettyName: task.prettyName };
}

export function toErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
