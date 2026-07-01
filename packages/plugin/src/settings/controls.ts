import type { Settings } from '@';
import { Setting } from 'obsidian';
import type { Translate } from '@/modules/I18n';
import { generateSettingEntry } from './generate-entry';

type ControlsSettingTranslations = {
	controls: string;
	maxFileSize: string;
	maxFileSizeDescription: string;
	maxFileSizePlaceholder: string;
	maxRequestConcurrency: string;
	minRequestInterval: string;
	minRequestIntervalDescription: string;
	minRequestIntervalPlaceholder: string;
	maxRequestConcurrencyPlaceholder: string;
	maxRequestConcurrencyDescription: string;
	maxMemoryConsumption: string;
	maxMemoryConsumptionDescription: string;
	maxMemoryConsumptionPlaceholder: string;
	invalidValue: string;
};

export default function ControlsSettings(
	el: HTMLElement,
	ctx: {
		translate: Translate<ControlsSettingTranslations>;
		saveSettings: () => Promise<void>;
		settings: Settings;
	},
) {
	const { translate, saveSettings, settings } = ctx;
	const invalidValue = translate('invalidValue');
	new Setting(el).setName(translate('controls')).setHeading();

	generateSettingEntry({
		container: el,
		desc: translate('maxFileSizeDescription'),
		field: settings.maxFileSize,
		invalidValue,
		name: translate('maxFileSize'),
		placeholder: translate('maxFileSizePlaceholder'),
		rejectZero: true,
		saveSettings,
		type: 'fileSize',
	});

	generateSettingEntry({
		container: el,
		desc: translate('maxRequestConcurrencyDescription'),
		field: settings.maxRequestConcurrency,
		invalidValue,
		name: translate('maxRequestConcurrency'),
		placeholder: translate('maxRequestConcurrencyPlaceholder'),
		rejectZero: true,
		saveSettings,
		type: 'number',
	});

	generateSettingEntry({
		container: el,
		desc: translate('minRequestIntervalDescription'),
		field: settings.minRequestInterval,
		invalidValue,
		name: translate('minRequestInterval'),
		placeholder: translate('minRequestIntervalPlaceholder'),
		saveSettings,
		type: 'time',
	});

	generateSettingEntry({
		container: el,
		desc: translate('maxMemoryConsumptionDescription'),
		field: settings.maxMemoryConsumption,
		invalidValue,
		name: translate('maxMemoryConsumption'),
		placeholder: translate('maxMemoryConsumptionPlaceholder'),
		rejectZero: true,
		saveSettings,
		type: 'fileSize',
	});
}
