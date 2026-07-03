import type { WebdavTranslations } from './setting';

export const en: WebdavTranslations = {
	baseDirectory: 'Base directory',
	baseDirectoryDescription:
		'Configure the root folder on WebDAV that your vault will be synced to. "/" stands for the root directory.',
	baseDirectoryPlaceholder: 'Enter the directory',
	endpoint: 'Server URL',
	endpointDescription: 'Enter the URL of your WebDAV server.',
	endpointPlaceholder: 'https://example.com/webdav',
	password: 'Password',
	passwordDescription:
		'Enter your account password. The password is stored in Obsidian keychain.',
	username: 'Username',
	usernameDescription: 'Enter your WebDAV account username.',
	usernamePlaceholder: 'Enter your username',
	webdav: 'WebDAV',
};

export const zh: WebdavTranslations = {
	baseDirectory: '根目录',
	baseDirectoryDescription: '配置您的 vault 将同步到的 WebDAV 文件夹。 “/” 代表根目录。',
	baseDirectoryPlaceholder: '请输入目录',
	endpoint: '服务器 URL',
	endpointDescription: '请输入您的 WebDAV 服务器 URL。',
	endpointPlaceholder: 'https://example.com/webdav',
	password: '密码',
	passwordDescription: '请输入您的账户密码。密码将存储在 Obsidian 钥匙串中。',
	username: '用户名',
	usernameDescription: '请输入您的 WebDAV 账户用户名。',
	usernamePlaceholder: '请输入您的用户名',
	webdav: 'WebDAV',
};
