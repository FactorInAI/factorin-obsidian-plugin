This is the monorepo for an extensible Obsidian syncing plugin to sync vault files between Obsidian and various backends. The plugin itself and modules are in `packages/`.

## Context

This repository is the **Factor.In fork** of this monorepo, published as the Obsidian plugin **Factor.In Obsidian** (`factorin-obsidian-plugin`). Read `FACTOR.IN.md` before merging from upstream, touching any branding file (`manifest.json`, `versions.json`, `package.json`, `README.md`), or cutting a release — it lists the Factor.In-owned files, the files this fork deletes, the versioning scheme, and the one-time `git config merge.ours.driver true` setup every clone needs.

`blueprint/` at the project root contains the canonical spec of this project. Read this when touching sophisticated parts in plugin core.

Study the structure of other modules when working on modules. (Upstream's `docs/` site is pruned in this fork; its module-authoring guide lives upstream.)

## Techstack

- **TypeScript 7** as programming language
- **Bun** as its package manager and task runner
- **Turbo** for monorepo management
- **Tsdown** for building
- **Oxlint and Oxfmt** for linting and formatting
- **Solid.js** and **TailwindCSS** (via UnoCSS) for UI
- **VitePress** for documentation website
- custom package **SynthKernel** for dependency injection
- custom package **Uni-KV** for IndexedDB and in-memory database.

## Commands

- `bun dev:plugin`: build plugin without cleaning dist
- `bun ver`: propagate the `manifest.json` version to `versions.json` and the root `package.json`
- `bun fix`: format and fix fixable lint errors (always run before `bun check`).
- `bun check`: check types, lint and format (no file change).
- `bun dev`: building without clearing dist.
- `bun tests`: run all tests (do not use `bun test`).
- `bun tests -F <package-name> -- <test path>`: run tests in specific file.
- `bun <command> -F <package-name>`: run command targeting a specific package.
- `cd packages/plugin && bun synthkernel <file-name> <type-alias>`: inspect the final flattened content of a type alias in a file, use to inspect merged types, do not explore the entire codebase.
- `bun -e '<code>'` run TS code directly, can import from codebase, use double quotes inside code.

## Packages

- Plugin & module SDK: `packages/plugin/`, package name `@hesprs/sync-engine-sdk`, `dev` builds SDK.
- WebDAV module: `packages/webdav/`, package name `webdav`.
- Encryption module: `packages/encryption/`, package name `encryption`.
- Shared utils: `packages/shared/`, package name `@repo/shared`.
- Factor.In module: `packages/factorin/`, package name `@factorin/module` — all Factor.In code and brand assets.
- I18n modules: `packages/i18n/`, package name `i18n`.
- Smart merge module: `packages/smart-merge/`, package name `smart-merge`.

## Conventions

- For mobile compatibility, Node.js API prohibited.
- Sentence case for UI text.
- All Obsidian API mocks go `packages/shared/src/obsidian-mock.ts`.
- Use inline Tailwind CSS for common styling, only use semantic CSS for animations and complex compositions.
- When any function or class needs to use `Context` as argument, prefer structural typing instead of direct `Context`.
- Excluding main plugin and shared utils, all packages are modules, they use the SDK and follow unified module structure.
- `null` forbidden, use `undefined` consistently.
- Lint warnings must be cleared.
