import { App, Modal, Notice, Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';

export type SourceEditorTranslations = {
	add: string;
	cancel: string;
	editSources: string;
	invalidSourceOmitted: string;
	moduleSourcePlaceholder: string;
	remove: string;
	save: string;
	sourcesDescription: string;
};

export default class SourceEditorModal extends Modal {
	private readonly sources: Array<string>;
	private readonly t: Translate<SourceEditorTranslations>;

	constructor(
		private readonly onSave: (sources: Array<string>) => void,
		ctx: {
			app: App;
			translate: Translate<SourceEditorTranslations>;
		},
		sources: Array<string> = [],
	) {
		super(ctx.app);
		this.sources = structuredClone(sources);
		this.t = ctx.translate;
	}

	onOpen() {
		const { contentEl, sources, t } = this;
		contentEl.empty();

		this.setTitle(t('editSources'));
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: t('sourcesDescription'),
		});

		const listContainer = contentEl.createDiv({
			cls: 'flex flex-col gap-2 pb-2',
		});

		const updateList = () => {
			listContainer.empty();
			sources.forEach((source, index) => {
				const itemContainer = listContainer.createDiv({
					cls: 'flex gap-2',
				});
				const input = itemContainer.createEl('input', {
					cls: 'flex-1',
					placeholder: t('moduleSourcePlaceholder'),
					type: 'text',
					value: source,
				});
				input.spellcheck = false;
				input.addEventListener('input', () => {
					sources[index] = input.value;
				});
				const removeButton = itemContainer.createEl('button', {
					text: t('remove'),
				});
				removeButton.onClickEvent(() => {
					sources.splice(index, 1);
					updateList();
				});
			});
		};

		updateList();

		new Setting(contentEl).addButton((button) => {
			button.setButtonText(t('add')).onClick(() => {
				sources.push('');
				updateList();
			});
		});

		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(t('save'))
					.setCta()
					.onClick(() => {
						let omittedInvalidSource = false;
						const validSources = sources.flatMap((source) => {
							const trimmedSource = source.trim();
							if (!trimmedSource) return [];
							if (!isValidModuleSource(trimmedSource)) {
								omittedInvalidSource = true;
								return [];
							}
							return [trimmedSource];
						});

						this.onSave(validSources);
						if (omittedInvalidSource) new Notice(t('invalidSourceOmitted'));
						this.close();
					});
			})
			.addButton((button) => {
				button.setButtonText(t('cancel')).onClick(this.close.bind(this));
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

function isValidModuleSource(source: string): boolean {
	try {
		const url = new URL(source);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}
