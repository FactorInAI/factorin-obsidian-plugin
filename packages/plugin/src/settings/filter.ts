import type { Settings } from '@';
import { App, Setting } from 'obsidian';
import type { FilterEditorTranslations } from '@/components/FilterEditorModal';
import type { Translate } from '@/modules/I18n';
import FilterEditorModal from '@/components/FilterEditorModal';

type FilterSettingTranslations = {
	filterRules: string;
	edit: string;
} & FilterEditorTranslations;

export default function filterSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<FilterSettingTranslations>;
		saveSettings: () => Promise<void>;
		app: App;
	},
	settings: Settings,
) {
	const { saveSettings, translate } = ctx;
	new Setting(el).setName(translate('filterRules')).setHeading();

	new Setting(el)
		.setName(translate('inclusionRules'))
		.setDesc(translate('inclusionRulesDescription'))
		.addButton((button) => {
			button.setButtonText(translate('edit')).onClick(() => {
				new FilterEditorModal(
					(filters) => {
						settings.inclusionRules = filters;
						void saveSettings();
					},
					'include',
					ctx,
					settings.inclusionRules,
				).open();
			});
		});

	new Setting(el)
		.setName(translate('exclusionRules'))
		.setDesc(translate('exclusionRulesDescription'))
		.addButton((button) => {
			button.setButtonText(translate('edit')).onClick(() => {
				new FilterEditorModal(
					(filters) => {
						settings.exclusionRules = filters;
						void saveSettings();
					},
					'exclude',
					ctx,
					settings.exclusionRules,
				).open();
			});
		});
}
