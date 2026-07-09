import type { Translate } from '@hesprs/sync-engine-sdk';
import { Setting } from 'obsidian';
import type { SmartMergeTranslations } from './i18n';
import type { MergeOptions } from './utils/merge';

export type SmartMergeSettings = MergeOptions;

export default function smartMergeSetting(
	el: HTMLElement,
	ctx: { translate: Translate<SmartMergeTranslations>; saveSettings: () => Promise<void> },
	settings: SmartMergeSettings,
) {
	const { translate, saveSettings } = ctx;

	new Setting(el).setName(translate('smartMerge')).setHeading();

	new Setting(el)
		.setName(translate('conflictOursMarkers'))
		.setDesc(translate('conflictOursMarkersDescription'))
		.addText((text) => {
			text.setValue(settings.conflictAStart)
				.setPlaceholder(translate('start'))
				.onChange((value) => {
					settings.conflictAStart = value;
					void saveSettings();
				});
		})
		.addText((text) => {
			text.setValue(settings.conflictAEnd)
				.setPlaceholder(translate('end'))
				.onChange((value) => {
					settings.conflictAEnd = value;
					void saveSettings();
				});
		});

	new Setting(el)
		.setName(translate('conflictTheirsMarkers'))
		.setDesc(translate('conflictTheirsMarkersDescription'))
		.addText((text) => {
			text.setValue(settings.conflictBStart)
				.setPlaceholder(translate('start'))
				.onChange((value) => {
					settings.conflictBStart = value;
					void saveSettings();
				});
		})
		.addText((text) => {
			text.setValue(settings.conflictBEnd)
				.setPlaceholder(translate('end'))
				.onChange((value) => {
					settings.conflictBEnd = value;
					void saveSettings();
				});
		});

	new Setting(el)
		.setName(translate('deletionMarkers'))
		.setDesc(translate('deletionMarkersDescription'))
		.addText((text) => {
			text.setValue(settings.deletionStart)
				.setPlaceholder(translate('start'))
				.onChange((value) => {
					settings.deletionStart = value;
					void saveSettings();
				});
		})
		.addText((text) => {
			text.setValue(settings.deletionEnd)
				.setPlaceholder(translate('end'))
				.onChange((value) => {
					settings.deletionEnd = value;
					void saveSettings();
				});
		});
}
