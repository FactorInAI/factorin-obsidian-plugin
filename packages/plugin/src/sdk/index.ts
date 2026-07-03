import type { Context } from '@';

export { default as testKit } from './test-utils';
export { default as digOriginal } from '@/fs/utils/dig-original';
export { default as debugWrapper } from './debug-wrapper';
export { default as MigrationModal } from '@/components/MigrationModal';

export type {
	Translate,
	Fragment,
	ObsidianLanguageCode,
	TranslationResource,
} from '@/modules/I18n';
export type { Dispatch, On } from '@/modules/EventBus';
export type { Context, Settings, Events, Translations } from '@';
export type { StoreAsync, StoreSync, DatabaseAsync, DatabaseSync } from 'uni-kv';
export type {
	RecordStat,
	RecordStatsMap,
	StatsMap,
	FileStat,
	FolderStat,
	Progress,
	Stat,
	MaybePromise,
} from '@/types';
export type {
	IndexedDBMeta,
	IndexedDBSchema,
	DeciderEntry,
	RemoteFsEntry,
	LocalFsWrapperEntry,
	RemoteFsWrapperEntry,
	SyncTriggerEntry,
	RemoteListGetter,
	RemoteOptimizerEntry,
	SettingEntry,
} from '@/modules/Registrar';
export type { SyncTerminateReason } from '@/modules/Sync';
export type * from '@/fs/interface';
export type SelectFromContext<O extends object> = Context extends O ? O : never;
