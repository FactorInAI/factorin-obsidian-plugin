# Vendored WebDAV FS core

Everything in this directory except `types.ts` and this file is **upstream's code**,
copied in and pinned. Treat it as a vendored third-party tree: fix bugs upstream-side
first where you can, and keep local edits to the bare minimum listed below, so the
diff stays readable.

See the Factor.In `Overview` document §2 ("Infra insulation"), §4 and §9, and
`FACTOR.IN.md` § "Taking an upstream update" step 3.

## Why vendored rather than depended on

The Factor.In backend is a WebDAV client pointed at Factor.In's own Drive endpoint.
Upstream ships that client as `packages/webdav`, a **downloadable module** — fetched at
runtime through the module catalog on `sync.consensia.cc`, over a CDN, behind an
integrity handshake. A Factor.In build uses none of that infrastructure
(`moduleSources: []`, no auto-update), so consuming upstream's module as a module is not
an option: the delivery mechanism is exactly the part we removed.

Copying the FS core in as first-party code keeps the wire behaviour upstream's — same
PROPFIND bodies, same chunked-upload protocol, same etag handling — while the module
lifecycle around it is ours.

## The pin

|                     |                                                  |
| ------------------- | ------------------------------------------------ |
| Upstream repository | `https://github.com/hesprs/obsidian-webdav-sync` |
| Branch              | `feat/fs`                                        |
| Commit              | `30ba2e9`                                        |
| Version             | `3.0.0-beta-15`                                  |
| Source path         | `packages/webdav/src/`                           |

That is the repository's recorded upstream base — `factorin.upstream` in the root
`package.json`, and the reset commit named in `FACTOR.IN.md` § "History: the pre-v3
reset". It is deliberately not duplicated as a literal anywhere else; those two are the
source of truth and this table quotes them.

**This monorepo _is_ the fork, so upstream's copy is already checked out here** — the
files under `packages/webdav/src/` are the originals this directory was copied from, and
they merge normally on every upstream merge. That makes the refresh below a local diff:
no fetch, no remote, no vendor tarball.

## What was copied

| Here                              | Upstream                                         |
| --------------------------------- | ------------------------------------------------ |
| `fs.ts`                           | `packages/webdav/src/webdav/fs.ts`               |
| `chunked-upload.ts`               | `packages/webdav/src/webdav/chunked-upload.ts`   |
| `read-stream.ts`                  | `packages/webdav/src/webdav/read-stream.ts`      |
| `check-connection.ts`             | `packages/webdav/src/webdav/check-connection.ts` |
| `utils.ts`                        | `packages/webdav/src/webdav/utils.ts`            |
| `parse-xml.ts`                    | `packages/webdav/src/parse-xml.ts`               |
| `base-dir.ts`                     | `packages/webdav/src/base-dir.ts`                |
| `../../../test/fs-webdav.test.ts` | `packages/webdav/test/fs-webdav.test.ts`         |
| `../../../test/base-dir.test.ts`  | `packages/webdav/test/base-dir.test.ts`          |

## What was deliberately **not** copied

The module-lifecycle half of `packages/webdav`. Factor.In supplies its own:

| Upstream file                      | Why not                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`                     | the `Webdav` module class — settings shape, `registerRemoteFs('webdav', …)`, `registerRemoteFsWrapper`, `registerSetting`. Factor.In's module class is `packages/factorin/src/index.ts`; the FS registers under `factorin`, against Factor.In's own settings. |
| `src/setting.ts`                   | upstream's settings section (endpoint / username / password fields). Factor.In's is an API token plus an account slug.                                                                                                                                        |
| `src/handle-input.ts`              | helper for that settings section only.                                                                                                                                                                                                                        |
| `src/i18n.ts`                      | upstream's `webdav*` translation keys. Factor.In's live in `src/i18n.ts`, prefixed `factorin`.                                                                                                                                                                |
| `package.json`, `tsdown.config.ts` | this is not a separate package — no bundle, no manifest, no catalog entry.                                                                                                                                                                                    |

## Local edits

Two, both mechanical, both confined to import specifiers. **The bodies are byte-identical
to upstream** — that is the property that makes the refresh a clean diff, so keep it.

1. **`@hesprs/sync-engine-sdk` → `./types`.** This package must not depend on the SDK in
   any form. The SDK _is_ `packages/plugin`, and `packages/plugin` already depends on
   `@factorin/module`, so an SDK dependency here closes a cycle Turbo rejects — and it
   breaks the SDK's own declaration emit. `types.ts` re-declares the dozen leaf types the
   FS core touches, copied verbatim from `packages/plugin/src/{types,fs/interface,
modules/Registrar}.ts`; its doc comment carries the full table and rationale.

2. **`@/parse-xml` → `./parse-xml`** in `fs.ts`. Upstream's `parse-xml.ts` sits one level
   up from its `webdav/` directory and is reached through that package's `@/*` alias; here
   everything is in one directory.

Both rewrites move an import between oxfmt's sort groups, so **the import _block_ will not
match upstream's line-for-line even though the bodies do** — `./types` and `./parse-xml`
sort as relative imports where `@hesprs/sync-engine-sdk` and `@/parse-xml` did not. Run
`oxfmt` over this package after any refresh and commit the reordering; skipping it fails
CI at `@factorin/module#check`, and the resulting diff looks alarming but is pure sort.
Keep provenance comments as `/** … */` headers above the import block for the same reason:
oxfmt will strand a `//` comment mid-block, and oxlint's `capitalized-comments` checks
every line of a `//` run but only the first line of a block comment.

`@repo/shared/{path,binary,get-status}` imports are **left exactly as upstream writes
them**. That package is in this monorepo, has no build step and depends on nothing, so
`@factorin/module` simply declares it — see "Dependency direction" in this package's
`README.md`. Re-implementing `normalizeUrl` / `normalizeKey` / `concatBinary` locally would
be strictly worse: it is the shared path grammar the sync engine agrees on, and a private
copy would drift silently.

## Refreshing after an upstream merge

Vendored code never conflicts, so nothing tells you it went stale. Step 3 of
`FACTOR.IN.md` § "Taking an upstream update" exists to force the check. After
`git merge upstream/feat/fs`:

```sh
# 1. What moved upstream since the pin?
git diff 30ba2e9..HEAD -- packages/webdav/src/webdav packages/webdav/src/parse-xml.ts \
                          packages/webdav/src/base-dir.ts packages/webdav/test

# 2. What does our copy already differ by? (expect only the two import rewrites above)
for f in fs chunked-upload read-stream check-connection utils; do
  git diff --no-index packages/webdav/src/webdav/$f.ts \
                      packages/factorin/src/backend/webdav/$f.ts
done
git diff --no-index packages/webdav/src/parse-xml.ts packages/factorin/src/backend/webdav/parse-xml.ts
git diff --no-index packages/webdav/src/base-dir.ts  packages/factorin/src/backend/webdav/base-dir.ts
```

Then, for each hunk step 1 reports:

1. **Port it deliberately** — apply the change here by hand, re-running the two import
   rewrites on anything newly imported. Do not blind-copy: check the hunk is not part of
   the module-lifecycle half we excluded above.
2. **Re-check `types.ts`** if the hunk touched `RootFs`, `Stat`, `Request` or
   `ListReporter` upstream. Drift there surfaces as a compile error where
   `packages/factorin/src/index.ts` hands the FS to `registerRemoteFs`, because that
   assignment is typed in real SDK types inside `packages/plugin`'s own program — but only
   once the wiring exists, so read the diff too.
3. **Port the tests as well** — `test/fs-webdav.test.ts` and `test/base-dir.test.ts` are
   vendored on the same terms. Their local edits are the same import rewrites plus
   `@hesprs/sync-engine-sdk/dev`'s `testKit` → the local `test/test-kit.ts`.
4. **Update the pin.** Change the commit and version in the table above, in the same commit
   as `factorin.upstream.baseVersion` in the root `package.json`.

Run `bun --bun turbo run check -F @factorin/module` and the CI `tests` job afterwards.
