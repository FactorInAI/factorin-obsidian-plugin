/**
 * Factor.In translation resources.
 *
 * These are registered at runtime from the module's constructor via
 * `ctx.registerI18n(...)` — upstream's own locale files (`packages/plugin/src/en.ts`
 * and friends) are never modified, so the rebrand adds no merge surface there.
 *
 * Keys land in one flat, kernel-wide i18n object shared with every other module,
 * so keep them prefixed with `factorin`. `{{name}}`-style placeholders are the
 * kernel translator's interpolation syntax (`I18n.interpolate`).
 */
export type FactorinTranslations = {
	factorin: string;
	factorinDescription: string;
	factorinAccountChoice: string;
	factorinAccountChoiceDescription: string;
	factorinApiToken: string;
	factorinApiTokenDescription: string;
	factorinApiTokenPlaceholder: string;
	factorinConnect: string;
	factorinConnecting: string;
	factorinConnected: string;
	factorinConnectedWithAccess: string;
	factorinConnectFailed: string;
	factorinDriveRead: string;
	factorinDriveWrite: string;
	factorinNotConnected: string;
	factorinPullOnly: string;
	factorinStatus: string;
	factorinTokenMissing: string;
};

export const en: FactorinTranslations = {
	factorin: 'Factor.In',
	factorinAccountChoice: 'Account',
	factorinAccountChoiceDescription:
		'This token can reach several accounts. Choose which one to sync with.',
	factorinApiToken: 'API token',
	factorinApiTokenDescription:
		'Paste a Factor.In API token with Drive access (fi_…). It is kept in Obsidian’s secret storage, never in the settings file.',
	factorinApiTokenPlaceholder: 'fi_…',
	factorinConnect: 'Connect',
	factorinConnectFailed: 'Could not connect to Factor.In: {{message}}',
	factorinConnected: 'Connected as {{name}} · {{slug}}',
	factorinConnectedWithAccess: 'Connected as {{name}} · {{slug}} ({{access}} access)',
	factorinConnecting: 'Connecting…',
	factorinDescription: 'Sync this vault with your Factor.In workspace.',
	factorinDriveRead: 'read',
	factorinDriveWrite: 'write',
	factorinNotConnected: 'Not connected',
	factorinPullOnly: 'Factor.In (pull only)',
	factorinStatus: 'Status',
	factorinTokenMissing: 'Paste your Factor.In API token first.',
};

export const zh: FactorinTranslations = {
	factorin: 'Factor.In',
	factorinAccountChoice: '账户',
	factorinAccountChoiceDescription: '该令牌可访问多个账户。请选择要同步的账户。',
	factorinApiToken: 'API 令牌',
	factorinApiTokenDescription:
		'粘贴具有 Drive 权限的 Factor.In API 令牌（fi_…）。令牌保存在 Obsidian 的密钥存储中，不会写入设置文件。',
	factorinApiTokenPlaceholder: 'fi_…',
	factorinConnect: '连接',
	factorinConnectFailed: '无法连接 Factor.In：{{message}}',
	factorinConnected: '已连接为 {{name}} · {{slug}}',
	factorinConnectedWithAccess: '已连接为 {{name}} · {{slug}}（{{access}}权限）',
	factorinConnecting: '连接中…',
	factorinDescription: '将此 vault 与您的 Factor.In 工作区同步。',
	factorinDriveRead: '只读',
	factorinDriveWrite: '读写',
	factorinNotConnected: '未连接',
	factorinPullOnly: 'Factor.In（仅拉取）',
	factorinStatus: '状态',
	factorinTokenMissing: '请先粘贴您的 Factor.In API 令牌。',
};
