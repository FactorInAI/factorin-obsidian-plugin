<h1 align="center">
    <img src="./docs/public/logo.svg" alt="Sync Engine logo" width="280px">
    <br />
    Sync Engine
    <br />
</h1>

<h4 align="center">Next-generation syncing plugin for Obsidian vault. Free · Performant · Extensible.</h4>

<p align="center">
    <a href="https://github.com/hesprs/obsidian-webdav-sync/releases/latest">
        <img src="https://img.shields.io/github/downloads/hesprs/obsidian-webdav-sync/manifest.json.svg?style=flat&label=%E2%AC%87%20Downloads&labelColor=008811&color=333333&displayAssetName=false" alt="accumulated downloads">
    </a>
    <a href="https://github.com/hesprs/obsidian-webdav-sync/actions">
        <img src="https://img.shields.io/github/actions/workflow/status/hesprs/obsidian-webdav-sync/ci.yml?style=flat&logo=github&logoColor=white&label=CI&labelColor=d4ab00&color=333333" alt="ci">
    </a>
    <a href="https://sync.consensia.cc">
        <img src="https://img.shields.io/badge/Documentation-Ready-333333?labelColor=5C73E7&logo=vitepress&logoColor=white" alt="Documentation" />
    </a>
    <img src="https://img.shields.io/badge/Types-Strict-333333?logo=typescript&labelColor=blue&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/%F0%9F%96%90%EF%B8%8F%20Made%20by-Humans-333333?labelColor=15C2C0" alt="Made by Humans">
</p>

<p align="center">
    <a href="https://github.com/hesprs/synthkernel">
        <img src="https://github.com/hesprs/synthkernel/raw/refs/heads/main/assets/powered-by-synthkernel.svg" width="200px" alt="powered by SynthKernel"></img>
    </a>
</p>

<p align="center">
    <a href="./docs/public/README.zh-Hans.md">
        <strong>简体中文</strong>
    </a> • 
    <a href="https://community.obsidian.md/plugins/webdav-sync">
        <strong>Plugin Store</strong>
    </a> • 
    <a href="#notices">
        <strong>Notices</strong>
    </a> • 
    <a href="#license-copyright-and-originality">
        <strong>License</strong>
    </a>
</p>

## Introduction

Sync Engine is a revolutionary solution for vault syncing. Its not only a syncing plugin, it is a modular platform that everyone can build upon.

The core ships the infrastructure, and all backends (WebDAV, S3, GDrive) and features (i18n, optimization, sync strategy) come from composable modules. You and your AI agents can build your own modules via convenient SDK, extend the plugin, contribute to community, all without modifying the source code.

There's already a lot of plugins to sync your notes between devices. But the advantage becomes clear with a comparison:

- [Remotely Save](https://github.com/remotely-save/remotely-save): full-featured syncing plugins, but currently has optional payment, unmaintained, and 200 unresolved issues.
- **All plugins similar to Remotely Save**: one plugin owns everything, you use part of it, others worsen the loading time. Vibe-coded / maintenance issues / optional payments possible.
- [Syncthing](https://syncthing.net/): a great way of P2P syncing, but requires both of your devices to be online, not 24/7.
- [Self-hosted Live Sync](https://github.com/vrtmrz/obsidian-livesync) / [Fast note sync](https://github.com/haierkeys/obsidian-fast-note-sync): most robust solutions in the room, but require custom server setup.
- [Git Integration](https://github.com/Vinzent03/obsidian-git): ideal for production-level collaboration and provenance, but not suitable for daily usage.

Sync engine is free (MIT License), extensible, community-driven, human curated, AI-friendly, with a highly optimized core.

## Notices

### 📢 Here is a Voting

Here's ongoing polling about new directions in development! I recommend **everyone who sees this** participate in the 5-second anonymous polling to allow developers to obtain a fair result.

- 🗳️ [Is `Smart Merge` worth the overhead?](https://github.com/hesprs/obsidian-webdav-sync/discussions/117)

## Features

🧰 **Complete Basic Features**:

- Bidirectional syncing.
- Startup / periodic / save-on-change syncing.
- Conflict resolution strategies (merge / latest survive / keep remote / keep local / skip).
- Advanced rate / memory control options.
- Custom headers.
- You can extend most above features by writing modules.

🖥 **Supported Backends**:

- WebDAV (`WebDAV` official module).
- S3 (work in progress).
- Google Drive (planned).
- You can effortlessly expand this list by creating custom modules. Contributions welcome!

🧩 **Extensible Architecture**:

- You can add backends, optimizers, sync triggers, i18n resources, decision strategies, setting entries, custom file processing, and all invoke operations possible in custom modules.
- Documentation (in-progress), AI agent skills (in-progress), and SDK with debug and testing kit are provided.
- Plugin provides dedicated module discovery and management panel UI.
- Repo accepts any module contribution as long as it respects [contribution guide](./CONTRIBUTING.md).

⚡ **Lightening Fast**:

- Incremental syncing never uploads the full vault each time.
- Innovative [**Anchored Asymmetric Storage™**](./blueprint/asymmetric-storage.md) technology substantially accelerates syncing.
- Real-time sync uses cached remote states, allowing it to complete within milliseconds.
- **40 times** smaller size than Remotely Save, **20 times** faster startup time.
- Handles vaults with more than 3000 files and gigabytes smoothly.
- Highly optimized core sync timing never wastes one millisecond.
- Extensible optimizer slot ensures every request is optimized for your own service.

📦 **Module-provided Features**:

- Client-side encryption: provided by `Encryption` official module. Achieves **theoretically higher security and better performance** than similar solutions (like Remotely Save), see detail in the [encryption specification](https://github.com/hesprs/obsidian-webdav-sync/blob/main/docs/encryption.md).
- Smart merge: merges documents when conflict is detected, can intelligently identify different languages and code, and applying different strategies.

## Install & Setup

Sync Engine v3 is in beta testing, you can install via BRAT:

1. Go to **Community plugins** and search for `BRAT`.
2. Install and enable it.
3. Click **Add beta plugin** and fill `https://github.com/hesprs/obsidian-webdav-sync` into _repository_.
4. Select _Latest_ and install + enable Sync Engine.

Configuration:

1. Go to plugin settings, find **Module management**, open the panel.
2. Browse and install needed translations and backends.
3. Configure your backend, automatic connectivity check is shown as an icon inside **Storage backend** entry.
4. Start your first sync.

## Common Questions

<details><summary>What should I do if I get an error during syncing?</summary>

You can simply retry the sync. An error does not block later syncs nor corrupt your files.

If the error persists after retrying, please [open an issue](https://github.com/hesprs/obsidian-webdav-sync/issues/new), describing the error, your setup, with the support log attached.

</details>

<details><summary>How should I manage my WebDAV storage when using this plugin?</summary>

According to this plugin's [file handling strategy](https://hesprs.github.io/projects/obsidian-webdav-sync#technical-breakdown), all remote changes will be propagated to all vaults. So it's generally not recommended to manually manage your WebDAV storage unless you intend to add / remove these files. Manual management is more discouraged when you have encryption or asymmetric storage enabled.

</details>

## Roadmap

Below is a list of planned features and improvements, the faster this plugin is adopted and the star ⭐ grows, the faster the development will be. Also, we welcome contributors that would like to help us with the development of either modules or core.

- [x] v3.0: Rewrite entirely, dynamic module loading, module store, asymmetric storage, and rebrand
- [ ] v3.1: Extensible conflict resolution

## License

The source code of Sync Engine and modules in this repository are licensed under the [MIT License](https://mit-license.org/).<br>
The documents in `blueprint/` directory and documentation website are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license.

Copyright ©️ 2026 Hēsperus and All Contributors
