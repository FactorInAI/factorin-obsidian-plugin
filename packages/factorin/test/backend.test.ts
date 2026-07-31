import { describe, expect, test } from 'bun:test';
import type { Binary, FileStat, Fs, Request, RootFs, Stat } from '@/backend/webdav/types';
import { BASE_DIR_WRAPPER_PRIORITY, FACTORIN_REMOTE_FS, registerFactorinBackend } from '@/backend';
import { createBackendContext } from './backend-context';

const DRIVE_URL = 'https://drive.factorin.com/acme';
const SLUG = 'acme';
const TOKEN = 'fi_live_abc123';
const TOKEN_KEY = 'factorin-api-token';

type RequestParam = Exclude<Parameters<Request>[0], string>;

const emptyBinary: Binary = new Uint8Array(0);
/** Any read needs one; nothing under test looks at it. */
const noteStat: FileStat = { isDir: false, key: 'note.md', mtime: 0, size: 0, uid: '' };

/** A `Request` that records what it was called with and answers `status`. */
function createRequest(status = 207) {
	const calls: Array<RequestParam> = [];
	const request: Request = (params) => {
		calls.push(typeof params === 'string' ? { url: params } : params);
		return Promise.resolve({
			bytes: () => emptyBinary,
			headers: {},
			json: () => undefined,
			status,
			text: () => '',
		});
	};
	return { calls, request };
}

function connectedSettings() {
	return {
		accountSlug: SLUG,
		baseDirectory: 'Documents/',
		driveUrl: DRIVE_URL,
		tokenKey: TOKEN_KEY,
	};
}

/**
 * A registered backend plus the harness it was registered against.
 *
 * The token is seeded by default — pass `{ storeToken: false }` to exercise the
 * unconnected path. It is a flag rather than an optional token argument because
 * an explicit `undefined` argument fires a parameter default, so "no token" would
 * have silently seeded one.
 */
function setup(settings = connectedSettings(), { storeToken = true } = {}) {
	const ctx = createBackendContext();
	if (storeToken) ctx.secrets.set(TOKEN_KEY, TOKEN);
	const cleanup = registerFactorinBackend(ctx, settings);
	const entry = ctx.remoteFs.get(FACTORIN_REMOTE_FS);
	if (!entry) throw new Error('backend did not register');
	const [wrapper] = [...ctx.wrappers];
	return { cleanup, ctx, entry, settings, wrapper };
}

describe('factorin backend registration', () => {
	test('registers under the id the plugin defaults `remoteFs` to', () => {
		const { ctx, entry } = setup();
		expect(ctx.remoteFs.size).toBe(1);
		expect(entry.prettyName).toBe('Factor.In');
	});

	// Not an arbitrary number: it has to match upstream WebDAV's so the prefix is
	// Applied at the same point in the chain, underneath anything that rewrites keys.
	test("registers the base-directory wrapper at upstream WebDAV's priority", () => {
		const { wrapper } = setup();
		expect(BASE_DIR_WRAPPER_PRIORITY).toBe(6318);
		expect(wrapper.priority).toBe(BASE_DIR_WRAPPER_PRIORITY);
	});

	test('returns unregister callbacks that undo both registrations', () => {
		const { cleanup, ctx } = setup();
		expect(cleanup).toHaveLength(2);
		for (const fn of cleanup) fn();
		expect(ctx.remoteFs.size).toBe(0);
		expect(ctx.wrappers.size).toBe(0);
	});
});

describe('factorin backend credentials', () => {
	test('checkConnection reaches the Drive endpoint with Basic auth from slug and token', async () => {
		const { entry } = setup();
		const { calls, request } = createRequest();

		expect(await entry.checkConnection(request)).toEqual({ success: true });
		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('PROPFIND');
		expect(calls[0].url).toBe(`${DRIVE_URL}/`);
		expect(calls[0].headers?.Authorization).toBe(`Basic ${btoa(`${SLUG}:${TOKEN}`)}`);
	});

	test('checkConnection reports a failing Drive response rather than throwing', async () => {
		const { entry } = setup();
		const { request } = createRequest(401);
		expect(await entry.checkConnection(request)).toEqual({
			reason: '401',
			success: false,
		});
	});

	// The settings tab catches this and shows the message, so an unconnected account
	// Reads as itself instead of as a failed handshake.
	test('checkConnection asks the user to connect when no token is stored', () => {
		const { entry } = setup(connectedSettings(), { storeToken: false });
		const { request } = createRequest();
		expect(() => entry.checkConnection(request)).toThrow(
			'Please connect your Factor.In account!',
		);
	});

	test('instantiate asks the user to connect when the Drive URL is not cached', () => {
		const { entry } = setup({ ...connectedSettings(), driveUrl: '' });
		const { request } = createRequest();
		expect(() => entry.instantiate(request)).toThrow('Please connect your Factor.In account!');
	});

	test('instantiate drives the cached Drive URL with the stored token', async () => {
		const { entry } = setup();
		const { calls, request } = createRequest();

		await entry.instantiate(request).read('note.md', noteStat);
		expect(calls[0].url).toBe(`${DRIVE_URL}/note.md`);
		expect(calls[0].headers?.Authorization).toBe(`Basic ${btoa(`${SLUG}:${TOKEN}`)}`);
	});

	// The connect flow rewrites these fields whenever the user reconnects or switches
	// Account, so a config captured at registration time would go stale silently.
	test('resolves the config again on every instantiation', async () => {
		const { ctx, entry, settings } = setup();
		const { calls, request } = createRequest();

		await entry.instantiate(request).read('note.md', noteStat);
		settings.driveUrl = 'https://drive.factorin.com/other';
		settings.accountSlug = 'other';
		ctx.secrets.set(TOKEN_KEY, 'fi_live_rotated');
		await entry.instantiate(request).read('note.md', noteStat);

		expect(calls[1].url).toBe('https://drive.factorin.com/other/note.md');
		expect(calls[1].headers?.Authorization).toBe(`Basic ${btoa('other:fi_live_rotated')}`);
	});
});

describe('factorin base-directory wrapper', () => {
	test('prefixes keys on our own FS', async () => {
		const { entry, wrapper } = setup();
		const { calls, request } = createRequest();

		const wrapped = wrapper.apply(entry.instantiate(request));
		expect(wrapped).toBeDefined();
		await wrapped?.read('note.md', noteStat);
		expect(calls[0].url).toBe(`${DRIVE_URL}/Documents/note.md`);
	});

	test('sees through an already-wrapped FS to the original', () => {
		const { entry, wrapper } = setup();
		const { request } = createRequest();
		const original = entry.instantiate(request);
		const alreadyWrapped = { ...original, original } as unknown as Fs;

		expect(wrapper.apply(alreadyWrapped)).toBeDefined();
	});

	// The wrapper chain is global: every registered wrapper is offered every remote FS,
	// Including other backends'. Ours must be a no-op for anything it did not build.
	test('leaves a foreign FS alone', () => {
		const { wrapper } = setup();
		const foreign = {
			delete: () => undefined,
			exists: () => false,
			getUid: () => 'foreign',
			list: () => [] as Array<Stat>,
			mkdir: () => undefined,
			move: () => undefined,
			read: () => emptyBinary,
			readStream: () => new ReadableStream<Binary>(),
			stat: () => ({ isDir: true, key: '/' }),
			write: () => '',
			writeStream: () => '',
		} satisfies RootFs;

		expect(wrapper.apply(foreign)).toBeUndefined();
	});
});
