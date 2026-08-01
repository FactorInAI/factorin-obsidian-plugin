import { beforeEach, describe, expect, test } from 'bun:test';
import type { FactorinLanguageCode, FactorinTranslationResource } from '@/index';
import { FACTORIN_REMOTE_FS } from '@/backend';
import { en, zh } from '@/i18n';
import { FACTORIN_ICON } from '@/icon';
import Factorin from '@/index';
import { createBackendContext, VAULT_NAME } from './backend-context';
import registeredIcons from './mocks';

type Registration = [FactorinLanguageCode, FactorinTranslationResource];

function createContext() {
	const registrations: Array<Registration> = [];
	return {
		...createBackendContext(),
		registerI18n: (locale: FactorinLanguageCode, resource: FactorinTranslationResource) => {
			registrations.push([locale, resource]);
		},
		registrations,
	};
}

describe('Factor.In module', () => {
	beforeEach(() => registeredIcons.clear());

	test('registers its translation resources when constructed', () => {
		const ctx = createContext();
		new Factorin(ctx);
		expect(ctx.registrations).toEqual([
			['en', en],
			['zh', zh],
		]);
	});

	test('exposes a moduleSettings object for the kernel, unconnected but usable', () => {
		expect(new Factorin(createContext()).moduleSettings).toEqual({
			accountSlug: '',
			/*
			 * Seeded from the vault, exactly as upstream WebDAV seeds its own: an empty
			 * base directory normalizes to `/`, which is not a usable key prefix.
			 */
			baseDirectory: `${VAULT_NAME}/`,
			driveUrl: '',
			tokenKey: '',
		});
	});

	test('start() registers the factorin backend and dispose() unregisters it', () => {
		const ctx = createContext();
		const module = new Factorin(ctx);

		module.start();
		expect(ctx.remoteFs.get(FACTORIN_REMOTE_FS)?.prettyName).toBe('Factor.In');
		expect(ctx.wrappers.size).toBe(1);

		module.dispose();
		expect(ctx.remoteFs.has(FACTORIN_REMOTE_FS)).toBe(false);
		expect(ctx.wrappers.size).toBe(0);
	});

	test('start() registers the Factor.In icon under a stable id', () => {
		new Factorin(createContext()).start();
		expect(registeredIcons.get(FACTORIN_ICON)).toContain('currentColor');
	});

	test('dispose() is safe before start() and idempotent after it', () => {
		const module = new Factorin(createContext());
		expect(() => module.dispose()).not.toThrow();
		module.start();
		expect(() => module.dispose()).not.toThrow();
		expect(() => module.dispose()).not.toThrow();
	});

	/*
	 * The backend's two unregister callbacks go through this queue, and so will every
	 * later `start()` registration. Asserting the drain itself needs callbacks whose
	 * order and arity are visible, hence the private-field reach.
	 */
	test('dispose() runs each cleanup callback exactly once and empties the queue', () => {
		const module = new Factorin(createContext());
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
		const module = new Factorin(createContext());
		module.start();
		module.dispose();
		registeredIcons.clear();
		module.start();
		expect(registeredIcons.has(FACTORIN_ICON)).toBe(true);
		module.dispose();
	});
});
