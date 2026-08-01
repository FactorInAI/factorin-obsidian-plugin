import { beforeEach, describe, expect, test } from 'bun:test';
import Factorin, { FACTORIN_TOKEN_KEY } from '@/index';
import { FACTORIN_PULL_ONLY_DECIDER } from '@/sync/pull-only';
import { replyWith, requestUrlCalls } from './mocks';
import { createModuleContext, createStore } from './module-context';

/** Wire-shaped `/me` payload: two accounts, personal one listed second. */
function payload(permissions: Record<string, string> = { drive: 'write', workflows: 'write' }) {
	return {
		accounts: [
			{ drive_url: 'https://drive.factorin.com/acme/', id: 456, name: 'Acme', slug: 'acme' },
			{
				drive_url: 'https://drive.factorin.com/jon-doe/',
				id: 123,
				name: 'Jon Doe',
				personal: true,
				slug: 'jon-doe',
			},
		],
		id: 1,
		name: 'Jon Doe',
		token: { permissions },
	};
}

function createModule() {
	const ctx = createModuleContext();
	const module = new Factorin(ctx);
	module.settings = createStore();
	return { ctx, module };
}

describe('the connect flow', () => {
	beforeEach(() => {
		requestUrlCalls.length = 0;
		replyWith({ json: payload(), status: 200 });
	});

	test('connect() mounts the personal account and persists every half of it', async () => {
		const { ctx, module } = createModule();
		await module.connect('fi_live_token');

		// The raw token: secretStorage only, never in either settings object.
		expect(ctx.secrets.get(FACTORIN_TOKEN_KEY)).toBe('fi_live_token');
		expect(JSON.stringify(module.settings)).not.toContain('fi_live_token');

		expect(module.moduleSettings).toEqual({
			accountSlug: 'jon-doe',
			baseDirectory: module.moduleSettings.baseDirectory,
			driveUrl: 'https://drive.factorin.com/jon-doe/',
			tokenKey: FACTORIN_TOKEN_KEY,
			userName: 'Jon Doe',
		});
		// Mirrored into the root store — the persistence path internal modules get.
		expect(module.settings).toEqual({
			decider: 'bidirectional',
			factorinAccountSlug: 'jon-doe',
			factorinBaseDirectory: module.moduleSettings.baseDirectory,
			factorinDriveUrl: 'https://drive.factorin.com/jon-doe/',
			factorinTokenKey: FACTORIN_TOKEN_KEY,
			factorinUserName: 'Jon Doe',
		});
		expect(ctx.saves).toBe(1);
	});

	test('connect() caches the token grants in memory, not in settings', async () => {
		const { module } = createModule();
		expect(module.permissions).toBeUndefined();
		await module.connect('fi_x');
		expect(module.permissions).toEqual({ drive: 'write', workflows: 'write' });
		expect(JSON.stringify(module.settings)).not.toContain('workflows');
	});

	test.each([
		[{ drive: 'write' }, 'bidirectional'],
		[{ drive: 'read' }, FACTORIN_PULL_ONLY_DECIDER],
		// A scope the token lacks is omitted — never assume it is present (§6.1).
		[{}, FACTORIN_PULL_ONLY_DECIDER],
	])('connect() with grants %p selects the %p decider', async (permissions, decider) => {
		const { module } = createModule();
		replyWith({ json: payload(permissions), status: 200 });
		await module.connect('fi_x');
		expect(module.settings.decider).toBe(decider);
	});

	test('connect() propagates API failures without touching any state', async () => {
		const { ctx, module } = createModule();
		replyWith({ status: 401 });
		expect(module.connect('fi_bad')).rejects.toThrow('Factor.In rejected the token');
		expect(ctx.secrets.size).toBe(0);
		expect(module.moduleSettings.driveUrl).toBe('');
		expect(ctx.saves).toBe(0);
	});

	test('selectAccount() re-points the mount using the stored secret', async () => {
		const { ctx, module } = createModule();
		await module.connect('fi_live_token');
		await module.selectAccount('acme');

		expect(module.moduleSettings.accountSlug).toBe('acme');
		expect(module.moduleSettings.driveUrl).toBe('https://drive.factorin.com/acme/');
		expect(module.settings.factorinAccountSlug).toBe('acme');
		expect(ctx.secrets.get(FACTORIN_TOKEN_KEY)).toBe('fi_live_token');
		expect(ctx.saves).toBe(2);
		// One bootstrap serves the whole session — switching accounts is local.
		expect(requestUrlCalls).toHaveLength(1);
	});

	test('selectAccount() rejects a slug the bootstrap never listed', async () => {
		const { module } = createModule();
		await module.connect('fi_x');
		return expect(module.selectAccount('stranger')).rejects.toThrow(
			'Unknown Factor.In account: "stranger".',
		);
	});

	test('selectAccount() asks for a connect when the secret is gone', async () => {
		const { ctx, module } = createModule();
		await module.connect('fi_x');
		ctx.secrets.clear();
		return expect(module.selectAccount('acme')).rejects.toThrow(
			'Please connect your Factor.In account!',
		);
	});

	test('dispose() forgets the session bootstrap, keeping only what was persisted', async () => {
		const { module } = createModule();
		await module.connect('fi_x');
		module.dispose();
		expect(module.permissions).toBeUndefined();
		expect(module.moduleSettings.accountSlug).toBe('jon-doe');
	});
});
