import type { Context } from '@';
import type { Fs } from '@/fs';

export function digOriginal(wrapped: Fs) {
	let original = wrapped;
	while ('original' in original) original = original.original;
	return original;
}
export { default as MigrationModal } from '@/components/MigrationModal';
export * from '@/utils/pipe';

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
	Binary,
} from '@/types';
export type {
	ConflictResolver,
	ConflictResolverPayload,
	TaskFactory,
	TaskNames,
	BaseTask,
	Decider,
	RemoveLocal,
	RemoveRecord,
	RemoveRemote,
	AddRecord,
	Download,
	Upload,
	DeciderInput,
	ResolveConflict,
	CreateLocalDir,
	CreateRemoteDir,
	MoveLocal,
	MoveRemote,
} from '@/sync';
export type {
	DeciderEntry,
	RemoteFsEntry,
	FsWrapperEntry,
	RequestMiddlewareEntry,
	RemoteLister,
	RemoteListerEntry,
	OptimizerEntry,
	SettingEntry,
	ConflictResolverEntry,
	Request,
	CheckConnectionResult,
	RequestParam,
} from '@/modules/Registrar';
export type { RecordStore } from '@/modules/Storage';
export type { ModuleMeta, AugmentedModuleMeta } from '@/modules/Extensibility';
export type { SyncTerminateReason } from '@/modules/Sync';
export type { ExistingMemoryDB } from '@/modules/Bootstrap';
export type * from '@/fs/interface';
export type SelectFromContext<O extends object> = Context extends O ? O : never;
