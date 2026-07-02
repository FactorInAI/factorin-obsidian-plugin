import type { Settings } from '@';
import { Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import type { MaybePromise } from '@/types';
import { generateSettingEntry } from './generate-entry';

export type FeaturesSettingTranslations = {
	features: string;
	realtimeSyncFastMode: string;
	realtimeSyncFastModeDescription: string;
	realtimeSync: string;
	realtimeSyncDescription: string;
	realtimeSyncPlaceholder: string;
	startupSync: string;
	startupSyncDescription: string;
	startupSyncPlaceholder: string;
	scheduledSync: string;
	scheduledSyncDescription: string;
	scheduledSyncPlaceholder: string;
	asymmetricStorage: string;
	asymmetricStorageDescription: (frag: DocumentFragment) => void;
	invalidValue: string;
};

export default function featuresSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<FeaturesSettingTranslations>;
		saveSettings: () => Promise<void>;
		startScheduledSync: () => void;
		stopScheduledSync: () => void;
		autoMigrate: (apply: () => MaybePromise<void>) => Promise<void>;
		settings: Settings;
	},
) {
	const {
		translate,
		saveSettings,
		startScheduledSync,
		stopScheduledSync,
		autoMigrate,
		settings,
	} = ctx;
	const invalidValue = translate('invalidValue');
	new Setting(el).setName(translate('features')).setHeading();

	generateSettingEntry({
		container: el,
		desc: translate('realtimeSyncDescription'),
		field: settings.realtimeSync,
		invalidValue,
		name: translate('realtimeSync'),
		placeholder: translate('realtimeSyncPlaceholder'),
		saveSettings,
		type: 'time',
	});

	generateSettingEntry({
		container: el,
		desc: translate('startupSyncDescription'),
		field: settings.startupSync,
		invalidValue,
		name: translate('startupSync'),
		placeholder: translate('startupSyncPlaceholder'),
		saveSettings,
		type: 'time',
	});

	generateSettingEntry({
		container: el,
		desc: translate('scheduledSyncDescription'),
		field: settings.scheduledSync,
		invalidValue,
		name: translate('scheduledSync'),
		onChange: () => {
			stopScheduledSync();
			startScheduledSync();
		},
		onToggle: (enabled) => {
			if (enabled) startScheduledSync();
			else stopScheduledSync();
		},
		placeholder: translate('scheduledSyncPlaceholder'),
		rejectZero: true,
		saveSettings,
		type: 'time',
	});

	new Setting(el)
		.setName(translate('realtimeSyncFastMode'))
		.setDesc(translate('realtimeSyncFastModeDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.realtimeSyncFastMode).onChange((value) => {
				settings.realtimeSyncFastMode = value;
				void saveSettings();
			}),
		);

	new Setting(el)
		.setName(translate('asymmetricStorage'))
		.setDesc(translate('asymmetricStorageDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.asymmetricStorage).onChange((value) => {
				settings.asymmetricStorage = value;
				void saveSettings();
			}),
		);
}
