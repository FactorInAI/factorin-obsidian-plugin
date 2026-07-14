import type { Context } from '@';
import type { Fs, RootFs } from '@/fs';

type DigOriginalResult<F extends RootFs | undefined> = [F] extends [undefined] ? RootFs : F;

export function digOriginal<FS extends RootFs | undefined = undefined>(wrapped: Fs) {
	let original = wrapped;
	while ('original' in original) original = original.original;
	return original as DigOriginalResult<FS>;
}
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
	SyncTriggerEntry,
	RemoteStatsGetter,
	OptimizerEntry,
	SettingEntry,
	ConflictResolverEntry,
	Request,
	RequestMiddleware,
	CheckConnectionResult,
	RequestParam,
} from '@/modules/Registrar';
export type { RecordStore } from '@/modules/Storage';
export type { ModuleMeta } from '@/modules/Extensibility';
export type { SyncTerminateReason } from '@/modules/Sync';
export type * from '@/fs/interface';
export type SelectFromContext<O extends object> = Context extends O ? O : never;
