import { Notice, Setting } from 'obsidian';
import type { FactorinBootstrap, FactorinPermissions } from './api/types';
import type { FactorinTranslations } from './i18n';

/**
 * Structural copy of `@hesprs/sync-engine-sdk`'s i18n `Translate<O>`
 * (`packages/plugin/src/modules/I18n.ts`) — duplicated rather than imported, so
 * this package stays free of the SDK (see the `FactorinLanguageCode` comment in
 * `index.ts`). Must stay shaped *exactly* like the original: it is a *generic*
 * function type — not a concrete `(key, params?) => string` — because only a
 * matching generic is structurally assignable from the kernel's own (a concrete
 * signature fails on both the rest-parameter tuple shape and the conditional
 * return type).
 */
type Fragment<A = undefined> = (frag: DocumentFragment, args: A) => void;
type TranslationResource = Record<string, string | Fragment>;
type InterpolationValues = Record<string, string | number | boolean | null | undefined>;
type TranslateParams<R extends Fragment | string> =
	R extends Fragment<infer A> ? ([undefined] extends [A] ? [] : [A]) : [] | [InterpolationValues];
type Translate<O extends TranslationResource> = <K extends keyof O>(
	key: K,
	...args: TranslateParams<O[K]>
) => O[K] extends string ? string : DocumentFragment;

/**
 * The exact shape the kernel exposes on `ctx.translate`: `Translate<any>`, its
 * keys spanning every module's resources (`General` = `any`, see the SDK's
 * `I18n.root`). **This — not the narrowed {@link FactorinSettingTranslate} — is
 * what `FactorinContext` must hold.** Narrowing the key set to
 * `FactorinTranslations` in the context breaks the kernel→module assignability
 * the `ModuleConstructor` check needs: the conditional return
 * (`…extends string ? string : DocumentFragment`) cannot be proven from the
 * kernel's `string | DocumentFragment` once `K` ranges over only our keys, so
 * `Translate<any>` is not assignable *to* `Translate<FactorinTranslations>`.
 * The narrowing happens at the call boundary in `index.ts` instead.
 */
export type FactorinContextTranslate = Translate<any>;

/**
 * The kernel translate narrowed to this module's own keys — used *inside* this
 * file, where concrete-key calls resolve the conditional return to `string`
 * (e.g. `statusText` returns a `string`). Obtained from
 * {@link FactorinContextTranslate} by one cast at the call boundary; sound
 * because the kernel returns a string for every `factorin` key.
 */
export type FactorinSettingTranslate = Translate<FactorinTranslations>;

/**
 * What the settings section needs from the module. It is deliberately the
 * module instance's own surface — the section is stateless DOM glue, rebuilt
 * from scratch on every `display()`, so everything durable (the in-memory
 * bootstrap, the persisted config, the connect logic) lives on the module and
 * is only *read* here.
 */
export type FactorinSettingHost = {
	/** Bootstrap fetched by this session's connect; `undefined` after a reload. */
	connection: FactorinBootstrap | undefined;
	/** Fetch the bootstrap for `token`, apply the default account, persist. */
	connect: (token: string) => Promise<void>;
	/** Forget the token and stop syncing; files already in the vault stay. */
	disconnect: () => Promise<void>;
	moduleSettings: { accountSlug: string; driveUrl: string; userName: string };
	/** The connected token's grants — in-memory only (Overview §6.2). */
	permissions: FactorinPermissions | undefined;
	rerender: () => void;
	/** Re-point the mount at another account the session's bootstrap listed. */
	selectAccount: (slug: string) => Promise<void>;
	/** Kick a manual sync — the "Sync now" button. */
	syncNow: () => void;
	translate: FactorinSettingTranslate;
};

/**
 * The Factor.In section of the settings tab (Overview document §6.2): a status
 * line, a password-masked token field with a Connect button, and — when the
 * session's bootstrap lists several accounts — a picker to change which one is
 * mounted. There are no endpoint/username/password fields: the token is the
 * only credential, and everything else is derived from it.
 */
export default function factorinSetting(el: HTMLElement, host: FactorinSettingHost) {
	const { moduleSettings, translate } = host;

	new Setting(el).setName(translate('factorin')).setHeading();
	new Setting(el).setName(translate('factorinStatus')).setDesc(statusText(host));

	/*
	 * Connected iff a mount is persisted. This survives a reload even when the
	 * in-memory bootstrap (account list, permissions) is gone — a reloaded vault
	 * still offers Sync now / Disconnect against its last account, and shows the
	 * token field only once actually disconnected.
	 */
	if (!moduleSettings.driveUrl) {
		renderConnect(el, host);
		return;
	}

	const accounts = host.connection?.accounts ?? [];
	if (accounts.length > 1) renderAccountPicker(el, host, accounts);

	new Setting(el)
		.setName(translate('factorinSyncNow'))
		.setDesc(translate('factorinSyncNowDescription'))
		.addButton((button) =>
			button.setButtonText(translate('factorinSyncNow')).setCta().onClick(host.syncNow),
		);

	new Setting(el)
		.setName(translate('factorinDisconnect'))
		.setDesc(translate('factorinDisconnectDescription'))
		.addButton((button) =>
			button
				.setButtonText(translate('factorinDisconnect'))
				.setWarning()
				.onClick(async () => {
					await host.disconnect();
					new Notice(translate('factorinDisconnected'));
					host.rerender();
				}),
		);
}

/**
 * The token field + Connect button, shown until a mount is persisted. The pasted
 * token lives in this closure until Connect succeeds, at which point it moves into
 * `secretStorage` and the section is rebuilt; it is never written to `moduleSettings`.
 */
function renderConnect(el: HTMLElement, host: FactorinSettingHost) {
	const { translate } = host;
	let token = '';
	new Setting(el)
		.setName(translate('factorinApiToken'))
		.setDesc(translate('factorinApiTokenDescription'))
		.addText((text) => {
			text.setPlaceholder(translate('factorinApiTokenPlaceholder')).onChange((value) => {
				token = value;
			});
			text.inputEl.type = 'password';
		})
		.addButton((button) => {
			button.setButtonText(translate('factorinConnect')).setCta();
			button.onClick(async () => {
				const trimmed = token.trim();
				if (!trimmed) {
					new Notice(translate('factorinTokenMissing'));
					return;
				}
				button.setDisabled(true).setButtonText(translate('factorinConnecting'));
				try {
					await host.connect(trimmed);
					// Rerender rather than patch: status, picker, and buttons all change.
					host.rerender();
				} catch (error) {
					new Notice(
						translate('factorinConnectFailed', { message: errorMessage(error) }),
					);
					button.setDisabled(false).setButtonText(translate('factorinConnect'));
				}
			});
		});
}

/** The account picker — only when this session's bootstrap lists more than one. */
function renderAccountPicker(
	el: HTMLElement,
	host: FactorinSettingHost,
	accounts: FactorinBootstrap['accounts'],
) {
	const { translate } = host;
	new Setting(el)
		.setName(translate('factorinAccountChoice'))
		.setDesc(translate('factorinAccountChoiceDescription'))
		.addDropdown((dropdown) => {
			for (const account of accounts)
				dropdown.addOption(account.slug, `${account.name} · ${account.slug}`);
			dropdown.setValue(host.moduleSettings.accountSlug).onChange(async (slug) => {
				try {
					await host.selectAccount(slug);
				} catch (error) {
					new Notice(
						translate('factorinConnectFailed', { message: errorMessage(error) }),
					);
				}
				host.rerender();
			});
		});
}

/**
 * "Connected as {name} · {slug} ({drive} access)" / "Not connected". The
 * access suffix needs the token's permissions, which only exist in memory —
 * after a reload (until the §6.3 startup re-auth lands) the line degrades to
 * the permission-less form rather than guessing.
 */
function statusText(host: FactorinSettingHost): string {
	const { connection, moduleSettings, permissions, translate } = host;
	if (!moduleSettings.driveUrl) return translate('factorinNotConnected');
	const params = {
		name: connection?.name ?? moduleSettings.userName,
		slug: moduleSettings.accountSlug,
	};
	const drive = permissions?.drive;
	if (!drive) return translate('factorinConnected', params);
	return translate('factorinConnectedWithAccess', {
		...params,
		access: translate(drive === 'write' ? 'factorinDriveWrite' : 'factorinDriveRead'),
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
