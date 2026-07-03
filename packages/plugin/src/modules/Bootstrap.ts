import type { Context, Events, Translations } from '@';
import type { LocalFs, BatchOptimizer, RemoteFs, ContextMemoryDB } from '@/fs';
import type { ControlsSettingTranslations } from '@/settings/controls';
import type { DevelopmentSettingTranslations } from '@/settings/development';
import type { FeaturesSettingTranslations } from '@/settings/features';
import type { FilterSettingTranslations } from '@/settings/filter';
import type { HeadSettingTranslations } from '@/settings/head';
import type { MiscellaneousSettingTranslations } from '@/settings/miscellaneous';
import type { Progress, TogglableValue } from '@/types';
import {
	localCancellationWrapper,
	localContextWrapper,
	localMemoryControlWrapper,
	localOptimizationWrapper,
	rateLimiterWrapper,
	remoteCancellationWrapper,
	remoteOptimizationWrapper,
	remoteContextWrapper,
	remoteMemoryControlWrapper,
	retryWrapper,
	hierarchalOptimizer,
	asymmetricStorageWrapper,
} from '@/fs';
import en from '@/i18n/en';
import controlsSettings from '@/settings/controls';
import developmentSettings from '@/settings/development';
import featuresSettings from '@/settings/features';
import filterSettings from '@/settings/filter';
import headSettings from '@/settings/head';
import miscellaneousSettings from '@/settings/miscellaneous';
import { bidirectionalDecider } from '@/sync';
import type { On } from './EventBus';
import type { ObsidianLanguageCode, Translate, TranslationResource } from './I18n';
import type {
	DeciderEntry,
	LocalFsWrapperEntry,
	RemoteFsEntry,
	RemoteFsWrapperEntry,
	SettingEntry,
	SyncTriggerEntry,
} from './Registrar';

export default class Bootstrap {
	private readonly cleanupCallbacks: Array<() => void> = [];
	private readonly hangingOperations: Array<{
		size: number;
		resume: () => void;
	}> = [];
	private isCancelled = () => false;
	private memoryConsumption = 0;

	private readonly localPool: Array<string> = [];
	private readonly remotePool: Array<string> = [];

	declare readonly i18n: {
		bidirectional: string;
	} & ControlsSettingTranslations &
		DevelopmentSettingTranslations &
		FeaturesSettingTranslations &
		FilterSettingTranslations &
		HeadSettingTranslations &
		MiscellaneousSettingTranslations;
	declare readonly settings: {
		maxMemoryConsumption: TogglableValue;
		maxRequestConcurrency: TogglableValue;
		minRequestInterval: TogglableValue;
		realtimeSyncFastMode: boolean;
		asymmetricStorage: boolean;
	};
	declare readonly events: {
		migrationProgress: Progress;
		migrationFailed: string;
	};

	constructor(
		private readonly ctx: {
			registerI18n: (code: ObsidianLanguageCode, resource: TranslationResource) => void;
			on: On<Events>;
			memoryDB: ContextMemoryDB;
			registerDecider: (id: string, entry: DeciderEntry) => void;
			registerLocalFsWrapper: (entry: LocalFsWrapperEntry) => void;
			registerRemoteFs: (id: string, entry: RemoteFsEntry) => void;
			registerRemoteFsWrapper: (entry: RemoteFsWrapperEntry) => void;
			translate: Translate<Translations>;
			getLocalOptimizer: () => BatchOptimizer<LocalFs>;
			getRemoteOptimizer: () => BatchOptimizer<RemoteFs>;
			registerLocalOptimizer: (optimizer: BatchOptimizer<LocalFs>) => void;
			registerRemoteOptimizer: (optimizer: BatchOptimizer<RemoteFs>) => void;
			registerSyncTrigger: (trigger: string, entry: SyncTriggerEntry) => void;
			registerSetting: (entry: SettingEntry) => () => boolean;
		},
	) {
		ctx.registerI18n('en', en);
	}

	readonly start = () => {
		const {
			registerLocalFsWrapper,
			registerRemoteFsWrapper,
			on,
			memoryDB,
			registerDecider,
			translate: t,
			registerLocalOptimizer,
			registerRemoteOptimizer,
			registerSyncTrigger,
			registerSetting,
		} = this.ctx;
		const { maxMemoryConsumption, maxRequestConcurrency, minRequestInterval } = this.settings;

		const getMaxMemory = () =>
			maxMemoryConsumption.enabled ? maxMemoryConsumption.value : Infinity;
		const getMaxConcurrency = () =>
			maxRequestConcurrency.enabled ? maxRequestConcurrency.value : Infinity;
		const getMinInterval = () => (minRequestInterval.enabled ? minRequestInterval.value : 0);

		registerSyncTrigger('migration', { priority: 6000 });
		registerSyncTrigger('manual', { priority: 5000 });
		registerSyncTrigger('nonInteractiveManual', { priority: 4000 });
		registerSyncTrigger('startup', { priority: 3000 });
		registerSyncTrigger('interval', { priority: 2000 });
		registerSyncTrigger('realtime', {
			getRemoteList: async ({ record }) => {
				if (!this.settings.realtimeSyncFastMode) return;
				const stats = (await record.getRecords())
					.entries()
					.map(([key, stat]) => {
						if (stat.isDir) return { isDir: true, key } as const;
						return { isDir: false, key, mtime: 0, size: 0, uid: stat.remote } as const;
					})
					.toArray();
				return stats.length ? stats : undefined;
			},
			priority: 1000,
		});

		registerLocalOptimizer(hierarchalOptimizer);
		registerRemoteOptimizer(hierarchalOptimizer);
		registerLocalFsWrapper({
			apply: (fs) =>
				localMemoryControlWrapper(fs, {
					hangingOperations: this.hangingOperations,
					maxMemory: getMaxMemory(),
					memoryConsumption: this.memoryConsumption,
				}),
			order: 1000,
		});
		registerLocalFsWrapper({
			apply: (fs) =>
				localOptimizationWrapper(fs, {
					batchOptimizer: this.ctx.getLocalOptimizer(),
					localPool: this.localPool,
					remotePool: this.remotePool,
				}),
			order: 2000,
		});
		registerLocalFsWrapper({
			apply: (fs) => localCancellationWrapper(fs, this.isCancelled),
			order: 3000,
		});
		registerLocalFsWrapper({ apply: (fs) => localContextWrapper(fs, memoryDB), order: 10_000 });

		registerRemoteFsWrapper({
			apply: (fs) =>
				remoteMemoryControlWrapper(fs, {
					hangingOperations: this.hangingOperations,
					maxMemory: getMaxMemory(),
					memoryConsumption: this.memoryConsumption,
				}),
			order: 1000,
		});
		registerRemoteFsWrapper({
			apply: (fs) =>
				remoteOptimizationWrapper(fs, {
					batchOptimizer: this.ctx.getRemoteOptimizer(),
					localPool: this.localPool,
					remotePool: this.remotePool,
				}),
			order: 2000,
		});
		registerRemoteFsWrapper({
			apply: (fs) => remoteCancellationWrapper(fs, this.isCancelled),
			order: 3000,
		});
		registerRemoteFsWrapper({ apply: (fs) => retryWrapper(fs), order: 4000 });
		registerRemoteFsWrapper({
			apply: (fs) =>
				rateLimiterWrapper(fs, {
					maxConcurrency: getMaxConcurrency(),
					minInterval: getMinInterval(),
				}),
			order: 5000,
		});
		registerRemoteFsWrapper({
			apply: (fs) => remoteContextWrapper(fs, memoryDB),
			order: 10_000,
		});
		registerRemoteFsWrapper({
			apply: (fs) =>
				this.settings.asymmetricStorage ? asymmetricStorageWrapper(fs, memoryDB) : fs,
			order: 11_000,
		});

		registerDecider('bidirectional', {
			decider: bidirectionalDecider,
			prettyName: t('bidirectional'),
		});

		registerSetting({ order: 0, render: (el) => headSettings(el, this.ctx as Context) });
		registerSetting({ order: 1000, render: (el) => featuresSettings(el, this.ctx as Context) });
		registerSetting({ order: 2000, render: (el) => controlsSettings(el, this.ctx as Context) });
		registerSetting({ order: 3000, render: (el) => filterSettings(el, this.ctx as Context) });
		registerSetting({
			order: 4000,
			render: (el) => miscellaneousSettings(el, this.ctx as Context),
		});
		registerSetting({
			order: 5000,
			render: (el) => developmentSettings(el, this.ctx as Context),
		});

		this.cleanupCallbacks.push(
			on('syncStarted', ({ isCancelled }) => {
				this.isCancelled = isCancelled;
				this.hangingOperations.length = this.memoryConsumption = 0;
				this.localPool.length = this.remotePool.length = 0;
			}),
			on('syncTerminated', () => {
				this.isCancelled = () => false;
			}),
		);
	};

	readonly dispose = () => {
		this.cleanupCallbacks.forEach((cb) => cb());
		this.cleanupCallbacks.length = 0;
		this.hangingOperations.length = 0;
	};
}
