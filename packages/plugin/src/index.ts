import './global.css';
import type { Command, EventRef, App } from 'obsidian';
import type { Context as KernelContext, MergeSingleKey } from 'synthkernel';
import Factorin, { FACTORIN_CONFIG_FALLBACKS, FACTORIN_CONFLICT_RESOLVER } from '@factorin/module';
import { Plugin } from 'obsidian';
import { createContext } from 'synthkernel';
import type { AddRibbonIcon } from './modules/Observability';
import type { GlobMatchRule } from './types';
import Bootstrap from './modules/Bootstrap';
import EventBus from './modules/EventBus';
import Extensibility from './modules/Extensibility';
import I18n from './modules/I18n';
import ModulesModal from './modules/ModulesModal';
import Observability from './modules/Observability';
import ProgressModal from './modules/ProgressModal';
import Registrar from './modules/Registrar';
import Scheduler from './modules/Scheduler';
import Storage from './modules/Storage';
import Sync from './modules/Sync';

function createGlobMatchOptions(expr: string) {
	return { caseSensitive: false, expr };
}

const internalModules = [
	EventBus,
	I18n,
	Storage,
	Extensibility,
	Registrar,
	Sync,
	Observability,
	Scheduler,
	ProgressModal,
	ModulesModal,
	Bootstrap,
	// Factor.In — FORK EDIT (documents/overview.md §5.1).
	// Bundled as an internal module instead of downloaded.
	// Last in the list, so its start() runs after every other module has registered.
	Factorin,
] as const;

type InternalModules = typeof internalModules;
export type MergeKeys = 'settings' | 'root' | 'events' | 'i18n';
export type Context = KernelContext<
	InternalModules,
	MergeKeys,
	{
		app: App;
		addCommand: (command: Command) => Command;
		registerEvent: (ref: EventRef) => void;
		addRibbonIcon: AddRibbonIcon;
		addStatusBarItem: () => HTMLElement;
		saveSettings: () => Promise<void>;
	}
>;
export type Events = MergeSingleKey<InternalModules, 'events'>;
export type Settings = MergeSingleKey<InternalModules, 'settings'>;
export type Translations = MergeSingleKey<InternalModules, 'i18n'>;

export default class SyncEngine extends Plugin {
	context?: Context;
	readonly allModules = new Set(internalModules);
	declare settings: Settings;

	async onload() {
		const settings: Settings = {
			/*
			 * Factor.In — FORK EDIT (documents/overview.md §5.1). Upstream defaults this on:
			 * it flattens the remote into anchor-keyed files ("Anchored Asymmetric Storage",
			 * see blueprint/asymmetric-storage.md) because upstream users don't care about the
			 * remote shape. Factor.In's Drive is the opposite — a shared, hierarchical library
			 * the web app and every vault read by real path (/<slug>/Documents/Note.md), so the
			 * remote shape is load-bearing. Left on, the wrapper can't parse the Drive's real
			 * keys (they aren't `00000~name`) and drops every entry → sync sees an empty remote.
			 */
			asymmetricStorage: false,
			confirmDeleteInAutoSync: true,
			confirmTasksInSync: true,
			/*
			 * Factor.In — FORK EDIT (documents/overview.md §5.1). Pinned: a shared,
			 * multi-vault library should converge on the latest edit, not accumulate
			 * "(conflicted copy)" duplicates. Sourced from @factorin/module/config.
			 */
			conflictResolver: FACTORIN_CONFLICT_RESOLVER,
			customHeaders: [],
			decider: 'bidirectional',
			exclusionRules: [
				'**/.git',
				'**/.github',
				'**/.gitlab',
				'**/.svn',
				'**/node_modules',
				'**/.DS_Store',
				'**/__MACOSX',
				'**/desktop.ini',
				'**/Thumbs.db',
				'**/.trash',
				'**/~$*.doc',
				'**/~$*.docx',
				'**/~$*.ppt',
				'**/~$*.pptx',
				'**/~$*.xls',
				'**/~$*.xlsx',
				this.app.vault.configDir,
			].map(createGlobMatchOptions),
			/*
			 * Factor.In — FORK EDIT (documents/overview.md §5.1, §6.2, §11).
			 * The connect flow's persisted state: internal modules don't get the
			 * settings.modules[id] path, so the Factorin module mirrors its
			 * moduleSettings into the root store under factorin-prefixed keys.
			 */
			factorinAccountSlug: '',
			factorinBaseDirectory: '',
			factorinDriveUrl: '',
			factorinTokenKey: '',
			factorinUserName: '',
			inclusionRules: [],
			/*
			 * Factor.In — FORK EDIT (documents/overview.md §5.1). Server-driven: the
			 * connect flow overlays these from the /me `config` block; the values here
			 * are the fallbacks (single source in @factorin/module/config) used until
			 * the API provides them. maxMemoryConsumption stays a pinned device concern.
			 */
			maxFileSize: { ...FACTORIN_CONFIG_FALLBACKS.maxFileSize },
			maxMemoryConsumption: { enabled: true, value: 100 * 1024 ** 2 },
			maxRequestConcurrency: { ...FACTORIN_CONFIG_FALLBACKS.maxRequestConcurrency },
			minRequestInterval: { ...FACTORIN_CONFIG_FALLBACKS.minRequestInterval },
			// Factor.In — FORK EDIT (documents/overview.md §2, §5.1). Infra insulation.
			// An empty catalog list plus auto-update off keeps the plugin off sync.consensia.cc.
			// It therefore never loads code it did not ship.
			// The Factor.In backend is compiled in, so there is nothing to download.
			moduleAutoUpdate: false,
			moduleSources: [],
			modules: {},
			noticeStatusOnMobile: true,
			realtimeSync: { ...FACTORIN_CONFIG_FALLBACKS.realtimeSync },
			realtimeSyncFastMode: true,
			// Factor.In — FORK EDIT (documents/overview.md §5.1).
			// Default to the Factor.In backend rather than leaving the user to pick one.
			remoteFs: 'factorin',
			scheduledSync: { ...FACTORIN_CONFIG_FALLBACKS.scheduledSync },
			startupSync: { ...FACTORIN_CONFIG_FALLBACKS.startupSync },
		};
		Object.assign(settings, await this.loadData());

		migrateGlobMatchRules(settings);

		// https://github.com/microsoft/TypeScript/issues/62995
		const preMerge = {
			addCommand: this.addCommand.bind(this),
			addRibbonIcon: this.addRibbonIcon.bind(this),
			addStatusBarItem: this.addStatusBarItem.bind(this),
			allModules: this.allModules,
			app: this.app,
			registerEvent: this.registerEvent.bind(this),
			saveSettings: this.saveSettings,
		};
		this.context = createContext(internalModules, {
			injectKeys: ['settings', 'i18n'],
			mergeKeys: ['settings', 'root', 'events', 'i18n'],
			preMerge,
		}).__assign__({ settings });
		this.settings = this.context.settings;
		await this.context.loadAllModules();
		this.context.addSettingTab(this);
		for (const module of this.allModules) {
			const instance = this.context.__getModule__(module);
			if ('start' in instance) instance.start();
		}
	}

	onunload() {
		if (!this.context) return;
		for (const module of [...this.allModules].reverse()) {
			const instance = this.context.__getModule__(module);
			if ('dispose' in instance) instance.dispose();
		}
		this.context = undefined;
	}

	readonly saveSettings = async () => await this.saveData(this.settings);
}

// TODO: remove after August 20
function migrateGlobMatchRules(settings: Settings) {
	const { inclusionRules, exclusionRules } = settings;
	const migrateRules = (rules: Array<GlobMatchRule>) =>
		rules.forEach((rule) => {
			if (!('options' in rule)) return;
			rule.caseSensitive = (rule.options as { caseSensitive: boolean }).caseSensitive;
			delete rule.options;
		});
	migrateRules(inclusionRules);
	migrateRules(exclusionRules);
}
