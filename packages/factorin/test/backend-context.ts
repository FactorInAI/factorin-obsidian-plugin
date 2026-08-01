import type { App } from 'obsidian';
import type { FactorinFsWrapperEntry, FactorinRemoteFsEntry } from '@/backend';

/**
 * A recording stand-in for the slice of the kernel context the backend registers
 * against.
 *
 * `registerRemoteFs` / `registerRemoteFsWrapper` behave exactly like
 * `Registrar`'s `mapRegister` / `setRegister` — add on call, remove on the
 * returned callback — because the symmetry of `start()` and `dispose()` is one of
 * the things worth testing, and it is only observable through those registries.
 *
 * `secrets` is the `secretStorage` behind `app`: seed it to make the module
 * "connected", leave it empty to exercise the unconfigured path.
 */
export const VAULT_NAME = 'Test Vault';

export type BackendContextHarness = {
	app: App;
	registerRemoteFs: (id: string, entry: FactorinRemoteFsEntry) => () => void;
	registerRemoteFsWrapper: (entry: FactorinFsWrapperEntry) => () => void;
	remoteFs: Map<string, FactorinRemoteFsEntry>;
	secrets: Map<string, string>;
	wrappers: Set<FactorinFsWrapperEntry>;
};

export function createBackendContext(): BackendContextHarness {
	const remoteFs = new Map<string, FactorinRemoteFsEntry>();
	const secrets = new Map<string, string>();
	const wrappers = new Set<FactorinFsWrapperEntry>();
	const app = {
		secretStorage: {
			// oxlint-disable-next-line unicorn/no-null -- Obsidian's `getSecret` returns `string | null`.
			getSecret: (key: string) => secrets.get(key) ?? null,
			setSecret: (key: string, value: string) => {
				secrets.set(key, value);
			},
		},
		vault: { getName: () => VAULT_NAME },
	} as unknown as App;
	return {
		app,
		registerRemoteFs: (id, entry) => {
			remoteFs.set(id, entry);
			return () => remoteFs.delete(id);
		},
		registerRemoteFsWrapper: (entry) => {
			wrappers.add(entry);
			return () => wrappers.delete(entry);
		},
		remoteFs,
		secrets,
		wrappers,
	};
}
