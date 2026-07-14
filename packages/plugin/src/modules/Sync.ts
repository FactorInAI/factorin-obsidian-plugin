import type { Events, Translations } from '@';
import type { Fs } from '@/fs';
import type { ConflictResolver, Decider, TaskFactory, TaskNames, TaskOptionsMap } from '@/sync';
import type { GlobMatchOptions, Progress, Stat, StatsMap, TogglableValue } from '@/types';
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
import toErrorMessage from '@/utils/to-error-message';
import type { Dispatch, On } from './EventBus';
import type { Translate } from './I18n';
import type { DeleteConfirmReturn } from './ProgressModal';
import type { Infras, RemoteStatsGetter } from './Registrar';

export type SyncTerminateReason =
	| { result: 'cancelled' }
	| { result: 'completed' }
	| { result: 'failed'; error: string }
	| { result: 'noop' };

export type TaskInfo = { name: TaskNames; key: string; prettyName: string; isDir: boolean };
export type FailedTaskInfo = TaskInfo & { error: string };

export default class Sync {
	dispatch: Dispatch<Events>;
	on: On<Events>;

	constructor(
		private readonly ctx: {
			dispatch: Dispatch<Events>;
			initializeSync: () => Infras;
			getDecider: () => Decider;
			on: On<Events>;
			translate: Translate<Translations>;
			getRemoteStatsGetter: (trigger: string) => RemoteStatsGetter | undefined;
			getConflictResolver: () => ConflictResolver;
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
	};
	declare readonly settings: {
		maxFileSize: TogglableValue;
		exclusionRules: Array<GlobMatchOptions>;
		inclusionRules: Array<GlobMatchOptions>;
		confirmDeleteInAutoSync: boolean;
		confirmTasksInSync: boolean;
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
		let terminateReason!: SyncTerminateReason;
		const isCancelled = () => cancelled;
		const cleanup = this.on('syncCanceled', () => (cancelled = true));
		try {
			this.dispatch('syncStarted', { isCancelled, trigger });

			const infras = this.ctx.initializeSync();
			const { record, localFs, remoteFs } = infras;
			const traverseRemote = async () => {
				try {
					return await remoteFs.list('/', (progress) =>
						this.dispatch('remoteWalkProgress', progress),
					);
				} catch (error) {
					if (await remoteFs.exists('/')) throw error;
					this.dispatch('logSync', 'Remote root deleted, recreating.');
					await Promise.all([remoteFs.mkdir('/', true), record.clear()]);
					return [];
				}
			};
			const getRemoteList = async () =>
				(await this.ctx.getRemoteStatsGetter(trigger)?.(infras)) ??
				(await traverseRemote());
			const [localList, remoteList] = await Promise.all([localFs.list('/'), getRemoteList()]);
			if (cancelled) throw syncCancelledError;
			const records = new Map(await record.entries());
			const localStats = this.postProcess(localList);
			const remoteStats = this.postProcess(remoteList);
			this.dispatch(
				'logSync',
				`Local ${localStats.size} item(s), remote ${remoteStats.size} item(s), record ${records.size} item(s).`,
			);

			if (cancelled) throw syncCancelledError;
			const taskFactory = createTaskFactory({
				baseOptions: infras,
				resolver: this.ctx.getConflictResolver(),
				translate: this.ctx.translate,
			});
			tasks = this.ctx.getDecider()({
				localStats,
				logger: (log: string) => this.dispatch('logSync', log),
				records,
				remoteStats,
				taskFactory,
			});
			if (tasks.length === 0) {
				terminateReason = { result: 'noop' };
				return terminateReason;
			}
			this.dispatch('logSync', `Planning finished with ${tasks.length} task(s).`);

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
				trigger !== 'autoMigration' &&
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

			terminateReason = failedCount
				? { error: `Execution of ${failedCount} tasks failed.`, result: 'failed' }
				: { result: 'completed' };
		} catch (error) {
			terminateReason = cancelled
				? { result: 'cancelled' }
				: ({ error: toErrorMessage(error), result: 'failed' } as const);
		} finally {
			cleanup();
			this.dispatch('syncTerminated', terminateReason);
		}
		return terminateReason;
	};

	private async convertDeleteToUpload(tasks: Array<RemoveLocal>, localFs: Fs) {
		const final: Array<Upload | CreateRemoteDir> = [];
		await Promise.all(
			tasks.map(async (task) => {
				const options = task.options;
				const local = await localFs.stat(options.key);
				if (!local) {
					this.dispatch(
						'logSync',
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

	root = { executeSync: this.executeSync };
}

function toMap(stats: Array<Stat>): StatsMap {
	const res = new Map<string, Stat>();
	for (const stat of stats) res.set(stat.key, stat);
	return res;
}

function createTaskFactory({
	baseOptions,
	translate,
	resolver,
}: {
	baseOptions: Infras;
	translate: (name: TaskNames) => string;
	resolver: ConflictResolver;
}): TaskFactory {
	return (<N extends TaskNames>(name: N, options: TaskOptionsMap[N]) => {
		const task =
			name === 'resolveConflict'
				? new taskMap[name]({ ...options, ...baseOptions, resolver } as never)
				: new taskMap[name]({ ...options, ...baseOptions } as never);
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

function toTaskInfo({ key, name, prettyName, local, remote }: BaseTask): TaskInfo {
	const isDir = local?.isDir ?? remote?.isDir ?? false;
	return { isDir, key, name, prettyName };
}
