import type { WebdavTranslations } from './setting';

export const en: WebdavTranslations = {
	baseDirectory: 'Base directory',
	baseDirectoryDescription:
		'Configure the root folder on WebDAV that your vault will be synced to. "/" stands for the root directory.',
	baseDirectoryPlaceholder: 'Enter the directory',
	depthInfinity: 'Use "Depth: infinity"',
	depthInfinityDescription:
		'"Depth: infinity" is a special header sent to WebDAV servers, requiring them to list all files in one response. This could accelerate remote discovery but some servers may not support it. Also, there\'s zero performance benefit if you have "Asymmetric storage" enabled.',
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
	depthInfinity: '使用 “Depth: infinity”',
	depthInfinityDescription:
		'“Depth: infinity” 是发送给 WebDAV 服务器的特殊请求头，要求其在单次响应中列出所有文件。这可以加速远程探测，但部分服务器可能不支持此功能。此外，如果您已启用 “非对称存储”，该功能将不会带来任何性能提升。',
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
