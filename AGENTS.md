This is the monorepo for an extensible Obsidian syncing plugin to sync vault files between Obsidian and various backends. The plugin itself and modules are in `packages/`.

## Context

`blueprint/` at the project root contains the canonical spec of this project. Read this when touching sophisticated parts in plugin core.

Study the structure of other modules and read documentation in `docs` when working on modules.

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

- `bun lint`: format and fix fixable lint errors (always run before `bun check`).
- `bun check`: check types, lint and format (no file change).
- `bun dev`: fast build for daily debug.
- `bun tests`: run all tests (do not use `bun test`).
- `bun tests -F <package-name> -- <test path>`: run tests in specific file.
- `bun <command> -F <package-name>`: run command targeting a specific package.
- `cd packages/plugin && bun synthkernel <file-name> <type-alias>`: inspect the final flattened content of a type alias in a file, use to inspect merged types, do not explore the entire codebase.
- `bun -e '<code>'` run TS code directly, can import from codebase, use double quotes inside code.

## Packages

- Plugin & module SDK: `packages/plugin/`, package name `@hesprs/sync-engine-sdk`.
- WebDAV module: `packages/webdav/`, package name `webdav`.
- Encryption module: `packages/encryption/`, package name `encryption`.
- Shared utils: `packages/shared/`, package name `@repo/shared`.
- Documentation site: `docs/`, package name `docs`.
- I18n modules: `packages/i18n/`, package name `i18n`.
- Smart merge module: `packages/smart-merge/`, package name `smart-merge`.

## Conventions

- For mobile compatibility, Node.js API prohibited.
- Sentence case for UI text.
- All Obsidian API mocks go `packages/shared/src/obsidian-mock.ts`.
- Use inline Tailwind CSS for common styling, only use semantic CSS for animations and complex compositions. (Documentation website doesn't use TailwindCSS, you need to edit `docs/.vitepress/theme/styles.css`)
- When any function or class needs to use `Context` as argument, prefer plain object structural typing instead of direct `Context` type.
- Excluding main plugin, shared utils and documentation site, all packages are Sync Engine modules, they use the SDK and follow unified module structure.
- `null` forbidden, use `undefined` consistently.
- lint warnings must be cleared.
