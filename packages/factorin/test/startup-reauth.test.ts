import { beforeEach, describe, expect, test } from 'bun:test';
import Factorin, { FACTORIN_TOKEN_KEY } from '@/index';
import { FACTORIN_PULL_ONLY_DECIDER } from '@/sync/pull-only';
import { notices, renderedSettings, replyWith, requestUrlCalls } from './mocks';
import { createModuleContext, createStore } from './module-context';

/** Wire-shaped `/me` payload — same fixture as `connect-flow.test.ts`. */
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

/** The root-store slice a previously connected vault persisted (§6.2 mirror). */
const CONNECTED_STORE = {
	factorinAccountSlug: 'jon-doe',
	factorinDriveUrl: 'https://drive.factorin.com/jon-doe/',
	factorinTokenKey: FACTORIN_TOKEN_KEY,
	factorinUserName: 'Jon Doe',
};

/**
 * A module as a reload sees it: persisted store fields present, secret in
 * `secretStorage`, but no in-memory bootstrap — `start()` has to earn it back.
 */
function createReloadedModule(persisted: Partial<ReturnType<typeof createStore>> = {}) {
	const ctx = createModuleContext();
	ctx.secrets.set(FACTORIN_TOKEN_KEY, 'fi_stored');
	const module = new Factorin(ctx);
	module.settings = { ...createStore(), ...persisted };
	return { ctx, module };
}

describe('the startup re-auth (§6.3)', () => {
	beforeEach(() => {
		requestUrlCalls.length = 0;
		notices.length = 0;
		renderedSettings.length = 0;
		replyWith({ json: payload(), status: 200 });
	});

	test('start() restores the permissions and full status line with no user action', async () => {
		const { ctx, module } = createReloadedModule(CONNECTED_STORE);
		module.start();
		await module.startupReauth;

		expect(requestUrlCalls).toHaveLength(1);
		expect(requestUrlCalls[0]?.headers?.Authorization).toBe('Bearer fi_stored');
		expect(module.permissions).toEqual({ drive: 'write', workflows: 'write' });
		expect(ctx.saves).toBe(1);
		// Silent on the happy path: no notice, no settings-tab flash.
		expect(notices).toHaveLength(0);
		expect(ctx.rerenders).toBe(0);

		// The settings section now renders the full access-suffixed status line.
		ctx.settingEntries[0]?.apply({} as HTMLElement);
		expect(renderedSettings[1]?.desc).toBe('Connected as Jon Doe · jon-doe (write access)');
	});

	test('start() re-mounts the account the user last chose, not the default', async () => {
		const { module } = createReloadedModule({
			...CONNECTED_STORE,
			factorinAccountSlug: 'acme',
			factorinDriveUrl: 'https://drive.factorin.com/acme/',
		});
		module.start();
		await module.startupReauth;
		// `pickDefaultAccount` would choose the personal `jon-doe`.
		expect(module.moduleSettings.accountSlug).toBe('acme');
		expect(module.moduleSettings.driveUrl).toBe('https://drive.factorin.com/acme/');
	});

	test('start() falls back to the default account when the persisted slug is gone', async () => {
		const { module } = createReloadedModule({
			...CONNECTED_STORE,
			factorinAccountSlug: 'closed-down',
		});
		module.start();
		await module.startupReauth;
		expect(module.moduleSettings.accountSlug).toBe('jon-doe');
		expect(module.settings.factorinAccountSlug).toBe('jon-doe');
	});

	test('a wiped Drive config with a surviving token reconnects silently', async () => {
		// Nothing persisted at all — only the secret under the fixed key remains.
		const { ctx, module } = createReloadedModule();
		module.start();
		await module.startupReauth;

		expect(module.moduleSettings).toEqual({
			accountSlug: 'jon-doe',
			baseDirectory: '',
			driveUrl: 'https://drive.factorin.com/jon-doe/',
			tokenKey: FACTORIN_TOKEN_KEY,
			userName: 'Jon Doe',
		});
		expect(module.settings.factorinDriveUrl).toBe('https://drive.factorin.com/jon-doe/');
		expect(module.settings.factorinTokenKey).toBe(FACTORIN_TOKEN_KEY);
		expect(notices).toHaveLength(0);
		expect(ctx.saves).toBe(1);
	});

	test.each([
		[{ drive: 'read' }, 'bidirectional', FACTORIN_PULL_ONLY_DECIDER],
		[{ drive: 'write' }, FACTORIN_PULL_ONLY_DECIDER, 'bidirectional'],
	])(
		're-auth with grants %p re-picks the decider (was %p)',
		async (permissions, persisted, expected) => {
			replyWith({ json: payload(permissions), status: 200 });
			const { module } = createReloadedModule({ ...CONNECTED_STORE, decider: persisted });
			module.start();
			await module.startupReauth;
			expect(module.settings.decider).toBe(expected);
		},
	);

	test('re-auth re-applies the server-driven sync policy, like a fresh connect', async () => {
		replyWith({
			json: { ...payload(), sync: { realtimeSync: { enabled: false, value: 9000 } } },
			status: 200,
		});
		const { module } = createReloadedModule(CONNECTED_STORE);
		module.start();
		await module.startupReauth;
		expect(module.settings.realtimeSync).toEqual({ enabled: false, value: 9000 });
	});

	test('a revoked token tears the connection down and points back at settings', async () => {
		replyWith({ status: 401 });
		const { ctx, module } = createReloadedModule(CONNECTED_STORE);
		module.start();
		await module.startupReauth;

		// The `disconnect()` teardown ran: secret scrubbed, mount cleared.
		expect(ctx.secrets.get(FACTORIN_TOKEN_KEY)).toBe('');
		expect(module.moduleSettings.driveUrl).toBe('');
		expect(module.settings.factorinTokenKey).toBe('');
		expect(module.permissions).toBeUndefined();
		expect(notices).toEqual([
			'Factor.In no longer accepts the saved token. Open the Factor.In settings to reconnect.',
		]);
		expect(ctx.rerenders).toBe(1);
		// No retry for a rejected token — dispose() finds nothing pending.
		module.dispose();
	});

	test('an unreachable API keeps the last-known-good mount so sync still works', async () => {
		replyWith({ status: 502 });
		const { ctx, module } = createReloadedModule(CONNECTED_STORE);
		module.start();
		await module.startupReauth;

		// Transient: nothing written, nothing torn down, nothing shown.
		expect(ctx.secrets.get(FACTORIN_TOKEN_KEY)).toBe('fi_stored');
		expect(module.moduleSettings.driveUrl).toBe('https://drive.factorin.com/jon-doe/');
		expect(module.settings.decider).toBe('bidirectional');
		expect(ctx.saves).toBe(0);
		expect(notices).toHaveLength(0);
		// The backend still resolves — a sync on the cached mount would proceed.
		expect(ctx.remoteFs.get('factorin')).toBeDefined();
		// Clears the armed retry so nothing outlives the module.
		module.dispose();
	});

	test('start() with no stored token asks the API nothing', async () => {
		const { ctx, module } = createReloadedModule();
		ctx.secrets.clear();
		module.start();
		await module.startupReauth;
		expect(requestUrlCalls).toHaveLength(0);
		expect(ctx.saves).toBe(0);
		expect(module.permissions).toBeUndefined();
	});
});
