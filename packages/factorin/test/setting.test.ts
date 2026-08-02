import { beforeEach, describe, expect, test } from 'bun:test';
import type { FactorinBootstrap } from '@/api/types';
import type { FactorinSettingHost } from '@/setting';
import factorinSetting from '@/setting';
import { notices, renderedSettings } from './mocks';
import { translate } from './module-context';

const ACCOUNTS = [
	{ driveUrl: 'https://d/acme/', id: 456, name: 'Acme', slug: 'acme' },
	{ driveUrl: 'https://d/jon/', id: 123, name: 'Jon Doe', personal: true, slug: 'jon-doe' },
];

/** A persisted mount — what makes the section render its "connected" face. */
const CONNECTED = { accountSlug: 'jon-doe', driveUrl: 'https://d/jon/', userName: 'Jon Doe' };

function bootstrap(accounts = ACCOUNTS): FactorinBootstrap {
	return {
		accounts,
		config: {},
		id: 1,
		name: 'Jon Doe',
		token: { permissions: { drive: 'write' } },
	};
}

/** A recording host — the section is DOM glue, so the host is all it observes. */
function createHost(overrides: Partial<FactorinSettingHost> = {}) {
	const calls = { connect: [] as Array<string>, select: [] as Array<string> };
	const counters = { disconnects: 0, rerenders: 0, syncs: 0 };
	const host: FactorinSettingHost = {
		connect: async (token) => {
			calls.connect.push(token);
		},
		connection: undefined,
		disconnect: async () => {
			counters.disconnects += 1;
		},
		moduleSettings: { accountSlug: '', driveUrl: '', userName: '' },
		permissions: undefined,
		rerender: () => {
			counters.rerenders += 1;
		},
		selectAccount: async (slug) => {
			calls.select.push(slug);
		},
		syncNow: () => {
			counters.syncs += 1;
		},
		translate,
		...overrides,
	};
	return { calls, counters, host };
}

/*
 * The section renders different rows when connected vs not, so read them by role
 * rather than by fixed position. Heading and status are always first two.
 */
const heading = () => renderedSettings[0];
const status = () => renderedSettings[1];
const tokenRow = () => renderedSettings.find((s) => s.text);
const pickerRow = () => renderedSettings.find((s) => s.dropdown);
const buttonRow = (text: string) => renderedSettings.find((s) => s.button?.text === text);

function render(host: FactorinSettingHost) {
	factorinSetting({} as HTMLElement, host);
}

describe('the Factor.In settings section', () => {
	beforeEach(() => {
		notices.length = 0;
		renderedSettings.length = 0;
	});

	test('when disconnected, renders a heading, status, and a masked token field with a CTA', () => {
		render(createHost().host);
		expect(heading()).toMatchObject({ heading: true, name: 'Factor.In' });
		expect(status().name).toBe('Status');
		expect(tokenRow()?.text).toMatchObject({
			inputEl: { type: 'password' },
			placeholder: 'fi_…',
		});
		expect(tokenRow()?.button).toMatchObject({ cta: true, text: 'Connect' });
		// No endpoint/username/password, and no account/sync/disconnect rows until connected.
		expect(pickerRow()).toBeUndefined();
		expect(buttonRow('Disconnect')).toBeUndefined();
	});

	test('reads "Not connected" until a Drive URL is configured', () => {
		render(createHost().host);
		expect(status().desc).toBe('Not connected');
	});

	/*
	 * After a reload only the persisted half exists — no bootstrap, no
	 * permissions — so the line degrades to the access-less form.
	 */
	test('reads the persisted identity when only moduleSettings survived', () => {
		render(createHost({ moduleSettings: CONNECTED }).host);
		expect(status().desc).toBe('Connected as Jon Doe · jon-doe');
	});

	test.each([
		['write', 'Connected as Jon Doe · jon-doe (write access)'],
		['read', 'Connected as Jon Doe · jon-doe (read access)'],
	] as const)('spells out %s access when the grants are in memory', (drive, line) => {
		render(
			createHost({
				connection: bootstrap(),
				moduleSettings: CONNECTED,
				permissions: { drive },
			}).host,
		);
		expect(status().desc).toBe(line);
	});

	test('asks for a token instead of connecting with an empty field', async () => {
		const { calls, host } = createHost();
		render(host);
		await tokenRow()?.button?.click();
		expect(notices).toEqual(['Paste your Factor.In API token first.']);
		expect(calls.connect).toEqual([]);
	});

	test('connects with the trimmed token and rerenders on success', async () => {
		const { calls, counters, host } = createHost();
		render(host);
		tokenRow()?.text?.changed('  fi_live_token  ');
		await tokenRow()?.button?.click();
		expect(calls.connect).toEqual(['fi_live_token']);
		expect(counters.rerenders).toBe(1);
		expect(notices).toEqual([]);
	});

	test('disables the button and shows progress while the connect is in flight', async () => {
		let settle = () => {};
		const { host } = createHost({
			connect: () =>
				new Promise<void>((resolve) => {
					settle = resolve;
				}),
		});
		render(host);
		tokenRow()?.text?.changed('fi_x');
		const clicked = tokenRow()?.button?.click();
		expect(tokenRow()?.button).toMatchObject({ disabled: true, text: 'Connecting…' });
		settle();
		await clicked;
	});

	test('surfaces a failed connect as a Notice and re-arms the button', async () => {
		const { counters, host } = createHost({
			connect: () => Promise.reject(new Error('boom')),
		});
		render(host);
		tokenRow()?.text?.changed('fi_x');
		await tokenRow()?.button?.click();
		expect(notices).toEqual(['Could not connect to Factor.In: boom']);
		expect(tokenRow()?.button).toMatchObject({ disabled: false, text: 'Connect' });
		expect(counters.rerenders).toBe(0);
	});

	test('once connected, shows Sync now and Disconnect instead of the token field', () => {
		render(createHost({ moduleSettings: CONNECTED }).host);
		expect(tokenRow()).toBeUndefined();
		expect(buttonRow('Sync now')?.button).toMatchObject({ cta: true });
		expect(buttonRow('Disconnect')?.button).toMatchObject({ warning: true });
	});

	test('Sync now triggers a sync', async () => {
		const { counters, host } = createHost({ moduleSettings: CONNECTED });
		render(host);
		await buttonRow('Sync now')?.button?.click();
		expect(counters.syncs).toBe(1);
	});

	test('Disconnect forgets the connection, notifies, and rerenders', async () => {
		const { counters, host } = createHost({ moduleSettings: CONNECTED });
		render(host);
		await buttonRow('Disconnect')?.button?.click();
		expect(counters.disconnects).toBe(1);
		expect(notices).toEqual(['Disconnected from Factor.In.']);
		expect(counters.rerenders).toBe(1);
	});

	test('offers an account picker only when connected and the bootstrap lists several', () => {
		render(
			createHost({ connection: bootstrap([ACCOUNTS[1]]), moduleSettings: CONNECTED }).host,
		);
		expect(pickerRow()).toBeUndefined();

		renderedSettings.length = 0;
		render(createHost({ connection: bootstrap(), moduleSettings: CONNECTED }).host);
		expect(pickerRow()?.dropdown).toMatchObject({
			options: [
				['acme', 'Acme · acme'],
				['jon-doe', 'Jon Doe · jon-doe'],
			],
			value: 'jon-doe',
		});
	});

	test('switching accounts selects the slug and rerenders', async () => {
		const { calls, counters, host } = createHost({
			connection: bootstrap(),
			moduleSettings: CONNECTED,
		});
		render(host);
		await pickerRow()?.dropdown?.changed('acme');
		expect(calls.select).toEqual(['acme']);
		expect(counters.rerenders).toBe(1);
	});

	test('a failed account switch is a Notice, and the section still rerenders', async () => {
		const { counters, host } = createHost({
			connection: bootstrap(),
			moduleSettings: CONNECTED,
			selectAccount: () => Promise.reject(new Error('gone')),
		});
		render(host);
		await pickerRow()?.dropdown?.changed('acme');
		expect(notices).toEqual(['Could not connect to Factor.In: gone']);
		expect(counters.rerenders).toBe(1);
	});
});
