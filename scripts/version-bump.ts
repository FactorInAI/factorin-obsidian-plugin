import man from '../manifest.json' with { type: 'json' };
import pkg from '../packages/plugin/package.json' with { type: 'json' };
import versions from '../versions.json' with { type: 'json' };

const { version, minAppVersion } = man;

(versions as Record<string, string>)[version] = minAppVersion;
pkg.version = version;

await Promise.all([
	Bun.write('versions.json', JSON.stringify(versions, undefined, '\t')),
	Bun.write('packages/plugin/package.json', JSON.stringify(pkg, undefined, '\t')),
]);

Bun.spawnSync({ cmd: ['bun', 'oxfmt', 'versions.json', 'manifest.json'] });
