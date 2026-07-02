import type { Settings } from '@';
import { Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { DeciderEntry, RemoteFsEntry } from '@/modules/Registrar';

export type HeadSettingTranslations = {
	moduleAutoUpdate: string;
	moduleAutoUpdateDescription: string;
	moduleManagement: string;
	moduleManagementDescription: string;
	openPanel: string;
	backend: string;
	backendDescription: string;
	syncStrategy: string;
	syncStrategyDescription: string;
};

export default function headSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<HeadSettingTranslations>;
		saveSettings: () => Promise<void>;
		settings: Settings;
		openModuleManagement: () => void;
		remoteFsRegistry: Map<string, RemoteFsEntry>;
		deciderRegistry: Map<string, DeciderEntry>;
	},
) {
	const {
		translate,
		saveSettings,
		settings,
		openModuleManagement,
		remoteFsRegistry,
		deciderRegistry,
	} = ctx;

	new Setting(el)
		.setName(translate('moduleManagement'))
		.setDesc(translate('moduleManagementDescription'))
		.addButton((button) =>
			button.setButtonText(translate('openPanel')).onClick(openModuleManagement).setCta(),
		);

	new Setting(el)
		.setName(translate('moduleAutoUpdate'))
		.setDesc(translate('moduleAutoUpdateDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.moduleAutoUpdate).onChange((value) => {
				settings.moduleAutoUpdate = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('backend'))
		.setDesc(translate('backendDescription'))
		.addDropdown((dropdown) => {
			for (const [key, { prettyName }] of remoteFsRegistry)
				dropdown.addOption(key, prettyName);
			dropdown.setValue(settings.remoteFs).onChange((value) => {
				settings.remoteFs = value;
				void saveSettings();
			});
		});

	new Setting(el)
		.setName(translate('syncStrategy'))
		.setDesc(translate('syncStrategyDescription'))
		.addDropdown((dropdown) => {
			for (const [key, { prettyName }] of deciderRegistry)
				dropdown.addOption(key, prettyName);
			dropdown.setValue(settings.decider).onChange((value) => {
				settings.decider = value;
				void saveSettings();
			});
		});
}
