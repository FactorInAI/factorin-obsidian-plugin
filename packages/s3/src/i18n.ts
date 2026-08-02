import type { S3Translations } from './setting';

export const en: S3Translations = {
	accessKeyId: 'Access key ID',
	accessKeyIdDescription: 'Enter your S3 access key ID.',
	accessKeyIdPlaceholder: 'AKIAIOSFODNN7EXAMPLE',
	bucket: 'Bucket name',
	bucketDescription: 'Enter the name of your S3 bucket.',
	bucketPlaceholder: 'my-bucket',
	endpoint: 'Endpoint URL',
	endpointDescription: 'Enter the S3 endpoint URL, e.g. https://s3.us-east-1.amazonaws.com.',
	endpointPlaceholder: 'https://s3.us-east-1.amazonaws.com',
	prefix: 'Prefix',
	prefixDescription:
		'Configure the key prefix that your vault will be synced to. "/" stands for the root of the bucket.',
	prefixPlaceholder: 'my-vault/',
	proxyUrl: 'Proxy URL',
	proxyUrlDescription:
		'Optional proxy URL to route S3 requests through. Leave empty to connect directly.',
	proxyUrlPlaceholder: 'https://proxy.example.com',
	region: 'Region',
	regionDescription: 'Enter the region of your S3 bucket, e.g. us-east-1.',
	regionPlaceholder: 'us-east-1',
	s3: 'S3',
	secretAccessKey: 'Secret access key',
	secretAccessKeyDescription:
		'Enter your S3 secret access key. It is stored in Obsidian keychain.',
	urlStyle: 'URL style',
	urlStyleDescription:
		'Virtual-hosted style: https://bucket.s3.amazonaws.com. Path style: https://s3.amazonaws.com/bucket. Some S3-compatible services require path style.',
	urlStylePath: 'Path style',
	urlStyleVirtualHosted: 'Virtual-hosted',
};

export const zh: S3Translations = {
	accessKeyId: '访问密钥 ID',
	accessKeyIdDescription: '请输入您的 S3 访问密钥 ID。',
	accessKeyIdPlaceholder: 'AKIAIOSFODNN7EXAMPLE',
	bucket: '存储桶名称',
	bucketDescription: '请输入您的 S3 存储桶名称。',
	bucketPlaceholder: 'my-bucket',
	endpoint: '端点 URL',
	endpointDescription: '请输入 S3 端点 URL，例如 https://s3.us-east-1.amazonaws.com。',
	endpointPlaceholder: 'https://s3.us-east-1.amazonaws.com',
	prefix: '前缀',
	prefixDescription: '配置您的 vault 将同步到的键前缀。 “/” 代表存储桶根目录。',
	prefixPlaceholder: 'my-vault/',
	proxyUrl: '代理 URL',
	proxyUrlDescription: '可选的代理 URL，用于路由 S3 请求。留空则直连。',
	proxyUrlPlaceholder: 'https://proxy.example.com',
	region: '区域',
	regionDescription: '请输入您的 S3 存储桶所在区域，例如 us-east-1。',
	regionPlaceholder: 'us-east-1',
	s3: 'S3',
	secretAccessKey: '秘密访问密钥',
	secretAccessKeyDescription: '请输入您的 S3 秘密访问密钥。密钥将存储在 Obsidian 钥匙串中。',
	urlStyle: 'URL 风格',
	urlStyleDescription:
		'虚拟主机风格：https://bucket.s3.amazonaws.com。路径风格：https://s3.amazonaws.com/bucket。部分 S3 兼容服务需要路径风格。',
	urlStylePath: '路径',
	urlStyleVirtualHosted: '虚拟托管',
};
