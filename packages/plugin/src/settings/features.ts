import type { Settings, Context } from '@';
import { Setting } from 'obsidian';
import type { MigrationModalTranslations } from '@/components/MigrationModal';
import type { Fragment, Translate } from '@/modules/I18n';
import MigrationModal from '@/components/MigrationModal';
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
	asymmetricStorageDescription: Fragment;
	asymmetricStorageMigration: Fragment<'enable' | 'disable'>;
	invalidValue: string;
} & MigrationModalTranslations;

export default function featuresSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<FeaturesSettingTranslations>;
		saveSettings: () => Promise<void>;
		startScheduledSync: () => void;
		stopScheduledSync: () => void;
		settings: Settings;
		recordStoreExists: () => Promise<boolean>;
	},
) {
	const {
		translate,
		saveSettings,
		startScheduledSync,
		stopScheduledSync,
		settings,
		recordStoreExists,
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

	let selfTrigger = false;
	new Setting(el)
		.setName(translate('asymmetricStorage'))
		.setDesc(translate('asymmetricStorageDescription'))
		.addToggle((toggle) =>
			toggle.setValue(settings.asymmetricStorage).onChange((value) => {
				if (selfTrigger) {
					selfTrigger = false;
					return;
				}
				const original = settings.asymmetricStorage;
				void recordStoreExists().then((exist) => {
					if (exist)
						new MigrationModal(ctx as Context, {
							apply: () => {
								settings.asymmetricStorage = value;
								void saveSettings();
							},
							content: translate(
								'asymmetricStorageMigration',
								value ? 'enable' : 'disable',
							),
							onCancel: () => {
								settings.asymmetricStorage = original;
								void saveSettings();
								selfTrigger = true;
								toggle.setValue(original);
							},
						}).open();
				});
			}),
		);
}
