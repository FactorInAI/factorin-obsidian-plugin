import type { Context, Settings } from '@';
import { Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import HeadersEditorModal from '@/components/HeadersEditorModal';

export type MiscellaneousSettingTranslations = {
	miscellaneous: string;
	diffMatchPatch: string;
	keepLocal: string;
	keepRemote: string;
	skip: string;
	noticeStatusOnMobile: string;
	noticeStatusOnMobileDescription: string;
	confirmTasksInSync: string;
	confirmTasksInSyncDescription: string;
	confirmDeleteInAutoSync: string;
	confirmDeleteInAutoSyncDescription: string;
	customHeaders: string;
	customHeadersDescription: string;
	edit: string;
};

export default function miscellaneousSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<MiscellaneousSettingTranslations>;
		saveSettings: () => Promise<void>;
		settings: Settings;
	},
) {
	const { translate, saveSettings, settings } = ctx;

	new Setting(el).setName(translate('miscellaneous')).setHeading();

	new Setting(el)
		.setName(translate('customHeaders'))
		.setDesc(translate('customHeadersDescription'))
		.addButton((button) => {
			button.setButtonText(translate('edit'));
			button.onClick(() => {
				new HeadersEditorModal(
					(headers) => {
						settings.customHeaders = headers;
						void saveSettings();
					},
					ctx as Context,
					settings.customHeaders,
				).open();
			});
		});

	new Setting(el)
		.setName(translate('noticeStatusOnMobile'))
		.setDesc(translate('noticeStatusOnMobileDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.noticeStatusOnMobile).onChange((value) => {
				settings.noticeStatusOnMobile = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('confirmTasksInSync'))
		.setDesc(translate('confirmTasksInSyncDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.confirmTasksInSync).onChange((value) => {
				settings.confirmTasksInSync = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('confirmDeleteInAutoSync'))
		.setDesc(translate('confirmDeleteInAutoSyncDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.confirmDeleteInAutoSync).onChange((value) => {
				settings.confirmDeleteInAutoSync = value;
				void saveSettings();
			}),
		);
}
