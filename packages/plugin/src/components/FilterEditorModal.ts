import { App, Modal, Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { GlobMatchOptions } from '@/types';

type FilterType = 'include' | 'exclude';

export type FilterEditorTranslations = {
	cancel: string;
	remove: string;
	save: string;
	add: string;
	inclusionRules: string;
	exclusionRules: string;
	inclusionRulesDescription: string;
	exclusionRulesDescription: string;
	filterPlaceholder: string;
};

export default class FilterEditorModal extends Modal {
	private readonly filters: Array<GlobMatchOptions>;
	private readonly t: Translate<FilterEditorTranslations>;

	constructor(
		private readonly onSave: (filters: Array<GlobMatchOptions>) => void,
		private readonly filterType: FilterType,
		ctx: {
			app: App;
			translate: Translate<FilterEditorTranslations>;
		},
		filters: Array<GlobMatchOptions> = [],
	) {
		super(ctx.app);
		this.filters = structuredClone(filters);
		this.t = ctx.translate;
	}

	onOpen() {
		const { contentEl, filterType, t, filters } = this;
		contentEl.empty();

		const titleKey = filterType === 'include' ? 'inclusionRules' : 'exclusionRules';
		const descKey =
			filterType === 'include' ? 'inclusionRulesDescription' : 'exclusionRulesDescription';

		this.setTitle(t(titleKey));
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: t(descKey),
		});

		const listContainer = contentEl.createDiv({
			cls: 'flex flex-col gap-2 pb-2',
		});

		const updateList = () => {
			listContainer.empty();
			filters.forEach((filter, index) => {
				const itemContainer = listContainer.createDiv({
					cls: 'flex gap-2',
				});
				const input = itemContainer.createEl('input', {
					cls: 'flex-1',
					placeholder: t('filterPlaceholder'),
					type: 'text',
					value: filter.expr,
				});
				input.spellcheck = false;
				input.addEventListener('input', () => {
					filter.expr = input.value;
					filters[index] = filter;
				});
				const forceCaseBtn = itemContainer.createEl('button', {
					cls: 'shadow-none!',
					text: 'Aa',
				});
				function updateButtonStatus() {
					const activeCls = ['bg-[--interactive-accent]!'];
					const inactiveCls = ['background-none!', 'hover:bg-[--interactive-normal]!'];
					if (filter.options.caseSensitive) {
						forceCaseBtn.classList.add(...activeCls);
						forceCaseBtn.classList.remove(...inactiveCls);
					} else {
						forceCaseBtn.classList.remove(...activeCls);
						forceCaseBtn.classList.add(...inactiveCls);
					}
				}
				updateButtonStatus();
				forceCaseBtn.onClickEvent(() => {
					filter.options.caseSensitive = !filter.options.caseSensitive;
					updateButtonStatus();
				});
				const trash = itemContainer.createEl('button', { text: t('remove') });
				trash.onClickEvent(() => {
					filters.splice(index, 1);
					updateList();
				});
			});
		};

		updateList();

		new Setting(contentEl).addButton((button) => {
			button.setButtonText(t('add')).onClick(() => {
				filters.push({
					expr: '',
					options: {
						caseSensitive: false,
					},
				});
				updateList();
			});
		});

		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(t('save'))
					.setCta()
					.onClick(() => {
						this.onSave(filters);
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
