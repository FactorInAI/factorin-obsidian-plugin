import { mock } from 'bun:test';

/**
 * SVG bodies passed to `addIcon`, keyed by icon id.
 *
 * Deliberately self-contained rather than reusing `@repo/shared/obsidian-mock`,
 * which `AGENTS.md` names as the home for Obsidian API mocks. Two reasons: that
 * mock has none of the surface this file stubs and adding it there would mean
 * editing an upstream file for a fork-only test, and these are recording spies
 * rather than the plain stubs that file holds. `packages/factorin` also takes no
 * workspace dependency at all — see this package's README.
 */
const registeredIcons = new Map<string, string>();

/** What `src/api/client.ts` passes to `requestUrl`, recorded per call. */
export type RequestUrlCall = {
	headers?: Record<string, string>;
	throw?: boolean;
	url: string;
};

/** The slice of Obsidian's `RequestUrlResponse` the API client reads. */
export type RequestUrlReply = { json?: unknown; status: number };

/** Every `requestUrl` invocation since the last `length = 0` reset. */
export const requestUrlCalls: Array<RequestUrlCall> = [];

let requestUrlReply: RequestUrlReply = { json: {}, status: 200 };

/** Arm the next `requestUrl` call(s) with this reply. */
export function replyWith(reply: RequestUrlReply) {
	requestUrlReply = reply;
}

/** Messages shown via `new Notice(...)`, oldest first. */
export const notices: Array<string> = [];

/**
 * Component stubs behind `SettingStub`. Each records the chained configuration
 * `src/setting.ts` applies and exposes the registered callback (`changed` /
 * `click`) so tests can drive the UI without a DOM.
 */
export class TextStub {
	changed: (value: string) => void = () => undefined;
	inputEl = { type: 'text' };
	placeholder = '';

	onChange(callback: (value: string) => void) {
		this.changed = callback;
		return this;
	}

	setPlaceholder(placeholder: string) {
		this.placeholder = placeholder;
		return this;
	}
}

export class ButtonStub {
	click: () => unknown = () => undefined;
	cta = false;
	disabled = false;
	text = '';

	onClick(callback: () => unknown) {
		this.click = callback;
		return this;
	}

	setButtonText(text: string) {
		this.text = text;
		return this;
	}

	setCta() {
		this.cta = true;
		return this;
	}

	setDisabled(disabled: boolean) {
		this.disabled = disabled;
		return this;
	}
}

export class DropdownStub {
	changed: (value: string) => unknown = () => undefined;
	options: Array<[string, string]> = [];
	value = '';

	addOption(value: string, display: string) {
		this.options.push([value, display]);
		return this;
	}

	onChange(callback: (value: string) => unknown) {
		this.changed = callback;
		return this;
	}

	setValue(value: string) {
		this.value = value;
		return this;
	}
}

/**
 * Obsidian's `Setting`, reduced to a recorder: each `new Setting(el)` pushes
 * itself onto {@link renderedSettings} in creation order, so a test reads the
 * section top-to-bottom exactly as `display()` built it.
 */
export class SettingStub {
	button?: ButtonStub;
	desc?: string;
	dropdown?: DropdownStub;
	heading = false;
	name?: string;
	text?: TextStub;

	constructor(_el: unknown) {
		renderedSettings.push(this);
	}

	addButton(configure: (button: ButtonStub) => void) {
		this.button = new ButtonStub();
		configure(this.button);
		return this;
	}

	addDropdown(configure: (dropdown: DropdownStub) => void) {
		this.dropdown = new DropdownStub();
		configure(this.dropdown);
		return this;
	}

	addText(configure: (text: TextStub) => void) {
		this.text = new TextStub();
		configure(this.text);
		return this;
	}

	setDesc(desc: string) {
		this.desc = desc;
		return this;
	}

	setHeading() {
		this.heading = true;
		return this;
	}

	setName(name: string) {
		this.name = name;
		return this;
	}
}

/** Every `Setting` created since the last `length = 0` reset, in DOM order. */
export const renderedSettings: Array<SettingStub> = [];

void mock.module('obsidian', () => ({
	addIcon: (iconId: string, svgContent: string) => {
		registeredIcons.set(iconId, svgContent);
	},
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
	requestUrl: async (params: RequestUrlCall): Promise<RequestUrlReply> => {
		requestUrlCalls.push(params);
		return requestUrlReply;
	},
	Setting: SettingStub,
}));

export default registeredIcons;
