import { beforeEach, describe, expect, test } from 'bun:test';
import { FACTORIN_REMOTE_FS } from '@/backend';
import { en, zh } from '@/i18n';
import { FACTORIN_ICON } from '@/icon';
import Factorin, { FACTORIN_SETTING_PRIORITY } from '@/index';
import { FACTORIN_PULL_ONLY_DECIDER } from '@/sync/pull-only';
import { VAULT_NAME } from './backend-context';
import registeredIcons from './mocks';
import { createModuleContext, createStore } from './module-context';

/** A module wired to a fresh harness, with the kernel's store slice injected. */
function createModule() {
	const ctx = createModuleContext();
	const module = new Factorin(ctx);
	module.settings = createStore();
	return { ctx, module };
}

describe('Factor.In module', () => {
	beforeEach(() => registeredIcons.clear());

	test('registers its translation resources when constructed', () => {
		const { ctx } = createModule();
		expect(ctx.i18nRegistrations).toEqual([
			['en', en],
			['zh', zh],
		]);
	});

	test('exposes a moduleSettings object for the kernel, unconnected but usable', () => {
		expect(createModule().module.moduleSettings).toEqual({
			accountSlug: '',
			/*
			 * Seeded from the vault, exactly as upstream WebDAV seeds its own: an empty
			 * base directory normalizes to `/`, which is not a usable key prefix.
			 */
			baseDirectory: `${VAULT_NAME}/`,
			driveUrl: '',
			tokenKey: '',
			userName: '',
		});
	});

	test('start() registers the backend, decider, and setting; dispose() unregisters them', () => {
		const { ctx, module } = createModule();

		module.start();
		expect(ctx.remoteFs.get(FACTORIN_REMOTE_FS)?.prettyName).toBe('Factor.In');
		expect(ctx.wrappers.size).toBe(1);
		expect(ctx.deciderRegistry.get(FACTORIN_PULL_ONLY_DECIDER)?.prettyName).toBe(
			en.factorinPullOnly,
		);
		expect(ctx.settingEntries.map((entry) => entry.priority)).toEqual([
			FACTORIN_SETTING_PRIORITY,
		]);

		module.dispose();
		expect(ctx.remoteFs.has(FACTORIN_REMOTE_FS)).toBe(false);
		expect(ctx.wrappers.size).toBe(0);
		expect(ctx.deciderRegistry.size).toBe(0);
		expect(ctx.settingEntries).toEqual([]);
	});

	test('start() registers the Factor.In icon under a stable id', () => {
		createModule().module.start();
		expect(registeredIcons.get(FACTORIN_ICON)).toContain('currentColor');
	});

	test('start() rebuilds moduleSettings from the persisted factorin* keys', () => {
		const { module } = createModule();
		module.settings = {
			decider: FACTORIN_PULL_ONLY_DECIDER,
			factorinAccountSlug: 'acme',
			factorinBaseDirectory: 'Elsewhere/',
			factorinDriveUrl: 'https://drive.factorin.com/acme/',
			factorinTokenKey: 'factorinApiToken',
			factorinUserName: 'Jon Doe',
		};
		module.start();
		expect(module.moduleSettings).toEqual({
			accountSlug: 'acme',
			baseDirectory: 'Elsewhere/',
			driveUrl: 'https://drive.factorin.com/acme/',
			tokenKey: 'factorinApiToken',
			userName: 'Jon Doe',
		});
	});

	test('an empty persisted base directory keeps the vault-derived default', () => {
		const { module } = createModule();
		module.start();
		expect(module.moduleSettings.baseDirectory).toBe(`${VAULT_NAME}/`);
	});

	test('dispose() is safe before start() and idempotent after it', () => {
		const { module } = createModule();
		expect(() => module.dispose()).not.toThrow();
		module.start();
		expect(() => module.dispose()).not.toThrow();
		expect(() => module.dispose()).not.toThrow();
	});

	/*
	 * Every `start()` registration goes through this queue. Asserting the drain
	 * itself needs callbacks whose order and arity are visible, hence the
	 * private-field reach.
	 */
	test('dispose() runs each cleanup callback exactly once and empties the queue', () => {
		const { module } = createModule();
		const calls: Array<string> = [];
		const queue = (module as unknown as { cleanup: Array<() => void> }).cleanup;
		queue.push(() => calls.push('first'));
		queue.push(() => calls.push('second'));

		module.dispose();
		expect(calls).toEqual(['first', 'second']);
		expect(queue).toEqual([]);

		module.dispose();
		expect(calls).toEqual(['first', 'second']);
	});

	test('start() and dispose() can be cycled, as plugin reload does', () => {
		const { module } = createModule();
		module.start();
		module.dispose();
		registeredIcons.clear();
		module.start();
		expect(registeredIcons.has(FACTORIN_ICON)).toBe(true);
		module.dispose();
	});
});
