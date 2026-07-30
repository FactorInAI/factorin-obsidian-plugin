// Fork-local edit (Factor.In): the version in `manifest.json` is the *Factor.In Obsidian*
// version (see FACTOR.IN.md § Versioning), not upstream's. It is propagated to `versions.json`
// and the workspace root `package.json`, but NOT to `packages/plugin/package.json` — that
// package is upstream's SDK (`@hesprs/sync-engine-sdk`) and keeps upstream's version line.
import man from '../manifest.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import versions from '../versions.json' with { type: 'json' };

const { version, minAppVersion } = man;

(versions as Record<string, string>)[version] = minAppVersion;
pkg.version = version;

await Promise.all([
	Bun.write('versions.json', JSON.stringify(versions, undefined, '\t')),
	Bun.write('package.json', JSON.stringify(pkg, undefined, '\t')),
]);

Bun.spawnSync({ cmd: ['bun', 'oxfmt', 'versions.json', 'manifest.json', 'package.json'] });
