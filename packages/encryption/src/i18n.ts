import type { EncryptionTranslations } from './setting';

export const en: EncryptionTranslations = {
	encryption: 'Encryption',
	encryptionDescription:
		'Encrypt files before upload and decrypt files when download. Encryption password is stored in Obsidian keychain.',
	encryptionDisableMigration: (frag) => {
		frag.createEl('p', {
			text: '⚠️ You should be cautious about following points before disabling encryption:',
		});
		const ol = frag.createEl('ol');
		ol.createEl('li', {
			text: 'All subsequent uploads will be in plaintext without encryption.',
		});
		ol.createEl('li', {
			text: 'Please ensure all devices have encryption disabled.',
		});
		ol.createEl('li', {
			text: 'Migration is necessary if this vault was previously uploaded with encryption.',
		});
	},
	encryptionEnableMigration: (frag) => {
		frag.createEl('p', {
			text: '⚠️ You should be cautious about following points before enabling encryption:',
		});
		const ol = frag.createEl('ol');
		ol.createEl('li', { text: 'All subsequent uploads will be encrypted.' });
		ol.createEl('li', { text: 'Please ensure all devices have encryption enabled.' });
		ol.createEl('li', {
			text: 'Migration is necessary if you have previously synced without encryption.',
		});
		const li = ol.createEl('li', {
			text: 'You should ensure all the items are identical on all your devices:',
		});
		const ul = li.createEl('ul');
		const subItems = ['encryption password', 'server URL', 'account name'];
		subItems.forEach((item) => ul.createEl('li', { text: item }));
		ol.createEl('li', {
			text: "The encryption algorithm binds the decryption key to the file location and server identity, this provides much better security and data integrity. But it also means that if you use a different server or moving a file to a different location without using the same algorithm, you won't be able to decrypt it.",
		});
		ol.createEl('li', {
			text: 'Please avoid managing encrypted files manually on the server.',
		});
	},
};

export const zh: EncryptionTranslations = {
	encryption: '加密',
	encryptionDescription:
		'在上传前加密文件，并在下载时解密文件。加密密码将存储在 Obsidian keychain 中。',
	encryptionDisableMigration: (frag) => {
		frag.createEl('p', {
			text: '⚠️ 在禁用加密之前，您需要注意以下几点：',
		});
		const ol = frag.createEl('ol');
		ol.createEl('li', {
			text: '后续的所有上传都将以明文形式进行，不再加密。',
		});
		ol.createEl('li', {
			text: '请确保所有设备都已禁用加密。',
		});
		ol.createEl('li', {
			text: '如果此 vault 之前是在加密状态下上传的，则需要进行数据迁移。',
		});
	},
	encryptionEnableMigration: (frag) => {
		frag.createEl('p', {
			text: '⚠️ 在启用加密之前，您需要注意以下几点：',
		});
		const ol = frag.createEl('ol');
		ol.createEl('li', { text: '后续的所有上传都将被加密。' });
		ol.createEl('li', { text: '请确保所有设备都已启用加密。' });
		ol.createEl('li', {
			text: '如果您之前在未加密的状态下进行过同步，则需要进行数据迁移。',
		});
		const li = ol.createEl('li', {
			text: '您应当确保以下内容在您的所有设备上完全一致：',
		});
		const ul = li.createEl('ul');
		const subItems = ['加密密码', '服务器 URL', '账户名称'];
		subItems.forEach((item) => ul.createEl('li', { text: item }));
		ol.createEl('li', {
			text: '该加密算法会将解密密钥与文件位置及服务器身份进行绑定，这提供了更好的安全性和数据完整性。但这也意味着，如果您使用了不同的服务器，或者在没有使用相同算法的情况下将文件移动到了其他位置，您将无法对其进行解密。',
		});
		ol.createEl('li', { text: '请避免在服务器上手动管理已加密的文件。' });
	},
};
