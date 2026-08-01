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

function bootstrap(accounts = ACCOUNTS): FactorinBootstrap {
	return { accounts, id: 1, name: 'Jon Doe', token: { permissions: { drive: 'write' } } };
}

/** A recording host — the section is DOM glue, so the host is all it observes. */
function createHost(overrides: Partial<FactorinSettingHost> = {}) {
	const calls = { connect: [] as Array<string>, select: [] as Array<string> };
	const counters = { rerenders: 0 };
	const host: FactorinSettingHost = {
		connect: async (token) => {
			calls.connect.push(token);
		},
		connection: undefined,
		moduleSettings: { accountSlug: '', driveUrl: '', userName: '' },
		permissions: undefined,
		rerender: () => {
			counters.rerenders += 1;
		},
		selectAccount: async (slug) => {
			calls.select.push(slug);
		},
		translate,
		...overrides,
	};
	return { calls, counters, host };
}

function render(host: FactorinSettingHost) {
	factorinSetting({} as HTMLElement, host);
	const [heading, status, tokenRow, accountRow] = renderedSettings;
	return { accountRow, heading, status, tokenRow };
}

describe('the Factor.In settings section', () => {
	beforeEach(() => {
		notices.length = 0;
		renderedSettings.length = 0;
	});

	test('renders a heading, a status line, and a masked token field with a CTA', () => {
		const { accountRow, heading, status, tokenRow } = render(createHost().host);
		expect(heading).toMatchObject({ heading: true, name: 'Factor.In' });
		expect(status.name).toBe('Status');
		expect(tokenRow.text).toMatchObject({ inputEl: { type: 'password' }, placeholder: 'fi_…' });
		expect(tokenRow.button).toMatchObject({ cta: true, text: 'Connect' });
		// No endpoint, username, or password fields — the token is the only credential.
		expect(accountRow).toBeUndefined();
	});

	test('reads "Not connected" until a Drive URL is configured', () => {
		expect(render(createHost().host).status.desc).toBe('Not connected');
	});

	/*
	 * After a reload only the persisted half exists — no bootstrap, no
	 * permissions — so the line degrades to the access-less form.
	 */
	test('reads the persisted identity when only moduleSettings survived', () => {
		const { host } = createHost({
			moduleSettings: { accountSlug: 'jon-doe', driveUrl: 'https://d/jon/', userName: 'Jon Doe' },
		});
		expect(render(host).status.desc).toBe('Connected as Jon Doe · jon-doe');
	});

	test.each([
		['write', 'Connected as Jon Doe · jon-doe (write access)'],
		['read', 'Connected as Jon Doe · jon-doe (read access)'],
	] as const)('spells out %s access when the grants are in memory', (drive, line) => {
		const { host } = createHost({
			connection: bootstrap(),
			moduleSettings: { accountSlug: 'jon-doe', driveUrl: 'https://d/jon/', userName: 'Jon Doe' },
			permissions: { drive },
		});
		expect(render(host).status.desc).toBe(line);
	});

	test('asks for a token instead of connecting with an empty field', async () => {
		const { calls, host } = createHost();
		const { tokenRow } = render(host);
		await tokenRow.button?.click();
		expect(notices).toEqual(['Paste your Factor.In API token first.']);
		expect(calls.connect).toEqual([]);
	});

	test('connects with the trimmed token and rerenders on success', async () => {
		const { calls, counters, host } = createHost();
		const { tokenRow } = render(host);
		tokenRow.text?.changed('  fi_live_token  ');
		await tokenRow.button?.click();
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
		const { tokenRow } = render(host);
		tokenRow.text?.changed('fi_x');
		const clicked = tokenRow.button?.click();
		expect(tokenRow.button).toMatchObject({ disabled: true, text: 'Connecting…' });
		settle();
		await clicked;
	});

	test('surfaces a failed connect as a Notice and re-arms the button', async () => {
		const { counters, host } = createHost({
			connect: () => Promise.reject(new Error('boom')),
		});
		const { tokenRow } = render(host);
		tokenRow.text?.changed('fi_x');
		await tokenRow.button?.click();
		expect(notices).toEqual(['Could not connect to Factor.In: boom']);
		expect(tokenRow.button).toMatchObject({ disabled: false, text: 'Connect' });
		expect(counters.rerenders).toBe(0);
	});

	test('offers an account picker only when the session bootstrap lists several', () => {
		const single = createHost({ connection: bootstrap([ACCOUNTS[1]]) });
		expect(render(single.host).accountRow).toBeUndefined();

		renderedSettings.length = 0;
		const several = createHost({
			connection: bootstrap(),
			moduleSettings: { accountSlug: 'jon-doe', driveUrl: 'https://d/jon/', userName: 'Jon Doe' },
		});
		const { accountRow } = render(several.host);
		expect(accountRow?.dropdown).toMatchObject({
			options: [
				['acme', 'Acme · acme'],
				['jon-doe', 'Jon Doe · jon-doe'],
			],
			value: 'jon-doe',
		});
	});

	test('switching accounts selects the slug and rerenders', async () => {
		const { calls, counters, host } = createHost({ connection: bootstrap() });
		const { accountRow } = render(host);
		await accountRow.dropdown?.changed('acme');
		expect(calls.select).toEqual(['acme']);
		expect(counters.rerenders).toBe(1);
	});

	test('a failed account switch is a Notice, and the section still rerenders', async () => {
		const { counters, host } = createHost({
			connection: bootstrap(),
			selectAccount: () => Promise.reject(new Error('gone')),
		});
		const { accountRow } = render(host);
		await accountRow.dropdown?.changed('acme');
		expect(notices).toEqual(['Could not connect to Factor.In: gone']);
		expect(counters.rerenders).toBe(1);
	});
});
