import type { App } from 'obsidian';
import { Menu, Modal, SearchComponent, setIcon, setTooltip } from 'obsidian';
import { hook } from 'synthkernel';
import type { ModuleManagementTranslations } from '@/components/module-management';
import type { SourceEditorTranslations } from '@/components/SourceEditorModal';
import { mountModuleManagementList } from '@/components/module-management';
import ModuleSourceEditorModal from '@/components/SourceEditorModal';
import type { ModuleMeta } from './Extensibility';
import type { Translate } from './I18n';

type ModulesModalTranslations = ModuleManagementTranslations & SourceEditorTranslations;

export default class ModulesModal extends Modal {
	private readonly t: Translate<ModulesModalTranslations>;
	private readonly modalCleanup: Array<() => void> = [];
	private sourceEditorModal?: ModuleSourceEditorModal;
	private showInstalledOnly = false;

	constructor(
		private readonly ctx: {
			app: App;
			translate: Translate<ModulesModalTranslations>;
			saveSettings: () => Promise<void>;
			settings: { moduleSources: Array<string>; modules: Record<string, boolean> };
			fetchSources: (cached?: boolean) => Promise<Array<ModuleMeta>>;
			discoveredModules: Map<string, string>;
			loadedModules: Map<string, unknown>;
			downloadModule: (name: string, version: string, url: string) => Promise<void>;
			deleteModule: (name: string) => Promise<void>;
			loadModule: (name: string, start?: boolean) => Promise<void>;
			unloadModule: (name: string) => void;
		},
	) {
		super(ctx.app);
		this.t = ctx.translate;
	}

	declare readonly i18n: ModulesModalTranslations;

	root = {
		closeModuleManagement: this.close.bind(this),
		openModuleManagement: this.open.bind(this),
	};

	onOpen() {
		this.setTitle(this.t('moduleManagement'));
		this.modalEl.addClasses([
			'w-[--modal-width]',
			'h-[--modal-height]',
			'max-w-[--modal-max-width]',
			'max-h-[--modal-max-height]',
		]);
		this.contentEl.empty();
		const controlsEl = this.contentEl.createDiv({
			cls: 'flex items-center gap-2 pb-4',
		});
		const searchEl = controlsEl.createDiv({ cls: 'min-w-0 flex-1' });
		const listEl = this.contentEl.createDiv({ cls: 'min-h-0 overflow-y-auto' });

		const onQuery = hook<[string]>();
		const onShowInstalledOnlyChange = hook<[boolean]>();
		const onSourcesChange = hook();

		const search = new SearchComponent(searchEl)
			.setPlaceholder(this.t('searchModules'))
			.onChange(onQuery);
		search.inputEl.addClass('w-full');
		search.inputEl.spellcheck = false;

		const menuButton = controlsEl.createEl('button', {
			attr: { 'aria-label': this.t('editSources'), type: 'button' },
			cls: 'clickable-icon flex-shrink-0 rounded-md',
		});
		setIcon(menuButton, 'menu');
		setTooltip(menuButton, this.t('editSources'));
		menuButton.onClickEvent((event) => {
			const menu = new Menu();
			menu.setNoIcon()
				.setParentElement(menuButton)
				.addItem((item) => {
					item.setTitle(this.t('showInstalledOnly'))
						.setChecked(this.showInstalledOnly)
						.onClick(() => {
							this.showInstalledOnly = !this.showInstalledOnly;
							onShowInstalledOnlyChange(this.showInstalledOnly);
						});
				})
				.addItem((item) => {
					item.setTitle(this.t('editSources')).onClick(() =>
						this.openSourceEditorModal(onSourcesChange),
					);
				});
			menu.showAtMouseEvent(event);
		});

		this.modalCleanup.push(
			mountModuleManagementList(listEl, {
				...this.ctx,
				onQuery,
				onShowInstalledOnlyChange,
				onSourcesChange,
			}),
			() => {
				onQuery.clear();
				onShowInstalledOnlyChange.clear();
				onSourcesChange.clear();
			},
		);
		onShowInstalledOnlyChange(this.showInstalledOnly);
	}

	onClose() {
		this.modalCleanup.splice(0).forEach((fn) => fn());
		this.contentEl.empty();
	}

	private readonly openSourceEditorModal = (cb: () => void) => {
		this.sourceEditorModal?.close();
		this.sourceEditorModal = new ModuleSourceEditorModal(
			(sources) => {
				this.ctx.settings.moduleSources = sources;
				void this.ctx.saveSettings();
				cb();
			},
			{
				app: this.ctx.app,
				translate: this.t,
			},
			this.ctx.settings.moduleSources,
		).setCloseCallback(() => {
			this.sourceEditorModal = undefined;
		});
		this.sourceEditorModal.open();
	};

	dispose() {
		this.sourceEditorModal?.close();
		this.sourceEditorModal = undefined;
		this.close();
	}
}
