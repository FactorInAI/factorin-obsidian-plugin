This is the monorepo for an extensible Obsidian syncing plugin to sync vault files between Obsidian and various backends. The plugin itself and modules are in `packages/`.

`blueprint/` at the project root contains the canonical spec of this project. Read this when touching sophisticated parts.

## Commands

- `bun lint`: format and fix fixable lint errors (always run before `bun check`).
- `bun check`: check types, lint and format (no file change).
- `bun dev`: fast build for daily debug.
- `bun tests`: run all tests (do not use `bun test`).
- `bun tests -F <package-name> -- <test path>`: run tests in specific file.
- `bun <command> -F <package-name>`: run command targeting a specific package.
- `cd packages/plugin && bun synthkernel <file-name> <type-alias>`: inspect the final flattened content of a type alias in a file, use when dealing when complex merged types.
- `bun -e '<code>'` run TS code directly, can import from codebase, use double quote inside code.

## Packages

- Plugin & module SDK: `packages/plugin/`, package name `@hesprs/sync-engine-sdk`.
- WebDAV module: `packages/webdav/`, package name `webdav`.
- Encryption module: `packages/encryption/`, package name `encryption`.
- Shared utils: `packages/shared/`, package name `@repo/shared`.
- Documentation site: `docs/`, package name `docs`.
- I18n modules for the main plugin: `packages/i18n/`, package name `i18n`.
- Smart merge module: `packages/smart-merge/`, package name `smart-merge`.

## Code Quality

- For mobile compatibility, Node.js API prohibited.
- Sentence case for UI text.
- All Obsidian API mocks go `packages/shared/src/obsidian-mock.ts`.
- Use inline Tailwind CSS for common styling, only use semantic CSS for animations and complex compositions.
- When any function or class needs to use `Context` as argument, prefer plain object structural typing instead of direct `Context` type.
