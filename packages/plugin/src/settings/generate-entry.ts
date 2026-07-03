import { Notice, Setting } from 'obsidian';
import type { TogglableValue } from '@/types';
import { formatFileSize, formatTime, parseFileSize, parseTime } from '@/utils/unit-converter';

export type InputType = 'number' | 'time' | 'fileSize';

const MAX_32BIT_VALUE = 2 ** 31 - 1;

export function generateSettingEntry({
	container,
	name,
	desc,
	placeholder,
	field,
	type,
	saveSettings,
	rejectZero,
	onChange,
	onToggle,
	invalidValue,
}: {
	container: HTMLElement;
	name: string;
	desc: string;
	placeholder: string;
	field: TogglableValue;
	type: InputType;
	saveSettings: () => Promise<void>;
	rejectZero?: boolean;
	onChange?: (value: number) => void;
	onToggle?: (value: boolean) => void;
	invalidValue: string;
}) {
	new Setting(container)
		.setClass('sync-engine-togglable-value')
		.setName(name)
		.setDesc(desc)
		.addText((text) => {
			text.setPlaceholder(placeholder).setValue(format(field.value, type));
			text.inputEl.addEventListener('blur', () => {
				const value = parse(text.inputEl.value, type);
				if (
					value === undefined ||
					isNaN(value) ||
					value < 0 ||
					value > MAX_32BIT_VALUE ||
					(rejectZero && value === 0)
				) {
					text.inputEl.value = format(field.value, type);
					new Notice(invalidValue);
					return;
				}
				if (value !== field.value) {
					field.value = value;
					onChange?.(value);
					void saveSettings();
				}
				text.inputEl.value = format(field.value, type);
			});
		})
		.addToggle((toggle) => {
			toggle.setValue(field.enabled);
			toggle.onChange((value) => {
				if (value !== field.enabled) {
					field.enabled = value;
					onToggle?.(value);
					void saveSettings();
				}
			});
		});
}

function format(value: number, type: InputType): string {
	switch (type) {
		case 'number': {
			return value.toString();
		}
		case 'time': {
			return formatTime(value);
		}
		case 'fileSize': {
			return formatFileSize(value);
		}
	}
}

function parse(value: string, type: InputType): number | undefined {
	switch (type) {
		case 'number': {
			return parseFloat(value);
		}
		case 'time': {
			return parseTime(value);
		}
		case 'fileSize': {
			return parseFileSize(value);
		}
	}
}
