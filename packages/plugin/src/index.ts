import './global.css';
import type { Command, EventRef, App } from 'obsidian';
import type { Context as KernelContext, MergeSingleKey } from 'synthkernel';
import { Plugin } from 'obsidian';
import { createContext } from 'synthkernel';
import type { AddRibbonIcon } from './modules/Observability';
import type { GlobMatchRule } from './types';
import Factorin from '@factorin/module';
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
	// Factor.In — FORK EDIT (documents/overview.md §5.1). Bundled as an internal
	// module instead of downloaded; last in the list so its start() runs after
	// every other module has registered.
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
			asymmetricStorage: true,
			confirmDeleteInAutoSync: true,
			confirmTasksInSync: true,
			conflictResolver: 'renameAndKeepBoth',
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
			inclusionRules: [],
			maxFileSize: { enabled: false, value: 31_457_280 },
			maxMemoryConsumption: { enabled: true, value: 100 * 1024 ** 2 },
			maxRequestConcurrency: { enabled: true, value: 50 },
			minRequestInterval: { enabled: false, value: 0 },
			// Factor.In — FORK EDIT (documents/overview.md §2, §5.1). Infra insulation:
			// an empty catalog list and auto-update off mean the plugin never contacts
			// sync.consensia.cc and never loads code it did not ship. The Factor.In
			// backend is compiled in, so there is nothing to download.
			moduleAutoUpdate: false,
			moduleSources: [],
			modules: {},
			noticeStatusOnMobile: true,
			realtimeSync: { enabled: false, value: 5000 },
			realtimeSyncFastMode: true,
			// Factor.In — FORK EDIT (documents/overview.md §5.1): default to the
			// Factor.In backend rather than leaving the user to pick one.
			remoteFs: 'factorin',
			scheduledSync: { enabled: false, value: 15 * 60 * 1000 },
			startupSync: { enabled: false, value: 5000 },
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
