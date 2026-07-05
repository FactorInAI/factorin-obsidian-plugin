import type { Hook } from 'synthkernel';
import { render } from 'solid-js/web';
import type { ModuleMeta } from '@/modules/Extensibility';
import type { Translate } from '@/modules/I18n';
import App from './App';

export type PendingAction = 'delete' | 'disable' | 'download' | 'enable';

export type ModuleManagementTranslations = {
	disableModule: string;
	disabled: string;
	downloadModule: string;
	enableModule: string;
	enabled: string;
	installed: string;
	loadingModules: string;
	noInstalledModulesFound: string;
	noMatchingModulesFound: string;
	noModulesAvailable: string;
	notInstalled: string;
	updateAvailable: string;
	updateModule: string;
	deleteModule: string;
};

type ModuleManagementHooks = {
	onQuery: Hook<[string]>;
	onShowInstalledOnlyChange: Hook<[boolean]>;
	onSourcesChange: Hook;
};

export type ModuleManagementContext = {
	fetchSources: (cached?: boolean) => Promise<Array<ModuleMeta>>;
	discoveredModules: Map<string, string>;
	loadedModules: Map<string, unknown>;
	settings: { modules: Record<string, boolean> };
	saveSettings: () => Promise<void>;
	downloadModule: (name: string, version: string, url: string) => Promise<void>;
	deleteModule: (name: string) => Promise<void>;
	loadModule: (name: string, start?: boolean) => Promise<void>;
	unloadModule: (name: string) => void;
	translate: Translate<ModuleManagementTranslations>;
} & ModuleManagementHooks;

export function mountModuleManagementList(el: Element, ctx: ModuleManagementContext) {
	let isUnmounted = false;
	const unmount = render(() => App({ ctx, isUnmounted: () => isUnmounted }), el);
	return () => {
		isUnmounted = true;
		unmount();
	};
}
