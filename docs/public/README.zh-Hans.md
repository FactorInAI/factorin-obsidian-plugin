<h1 align="center">
    <img src="./logo.svg" alt="Sync Engine logo" width="280px">
    <br />
    Sync Engine
    <br />
</h1>

<h4 align="center">面向 Obsidian 库的下一代同步插件。免费 · 高效 · 可扩展。</h4>

<p align="center">
    <a href="https://github.com/hesprs/obsidian-webdav-sync/releases/latest">
        <img src="https://img.shields.io/github/downloads/hesprs/obsidian-webdav-sync/manifest.json?style=flat&label=%E2%AC%87%20Downloads&labelColor=008811&color=333333&displayAssetName=false" alt="accumulated downloads">
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
    <a href="../../README.md">
        <strong>English</strong>
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

## 简介

Sync Engine 是一款革命性的库同步解决方案。它不仅是一个同步插件，更是一个人人都可以基于此进行构建的模块化平台。

核心部分提供了基础架构，而所有的后端（WebDAV, S3, GDrive）和功能（i18n、优化、同步策略）都源自可组合的模块。您和您的 AI Agent 可以通过便捷的 SDK 构建自己的模块、扩展插件功能、为社区做贡献，而这一切都无需修改任何核心源码。

目前市面上已经有很多用于在设备之间同步笔记的插件。但通过以下对比，本插件的优势便一目了然：

- [Remotely Save](https://github.com/remotely-save/remotely-save)：功能全备的同步插件，但目前有付费项、无人维护，且有 200 个未解决的 Issue。
- **所有类似于 Remotely Save 的插件**：单个插件包揽了所有功能，您只使用了其中一部分，其余功能却拖慢了加载速度。且可能 vibe-coded、维护难、付费等问题。
- [Syncthing](https://syncthing.net/)：一种非常出色的 P2P 同步方式，但需要您的两台设备同时在线，无法做到 24/7 全天候响应。
- [Self-hosted Live Sync](https://github.com/vrtmrz/obsidian-livesync) / [Fast note sync](https://github.com/haierkeys/obsidian-fast-note-sync)：目前最稳健的解决方案，但需要自行配置定制服务器。
- [Git Integration](https://github.com/Vinzent03/obsidian-git)：非常适合生产级别的协作和溯源，但不适合日常高频使用。

Sync Engine 完全免费（MIT License）、可扩展、社区驱动、人工精选、对 AI 友好，并拥有高度优化的核心。

## 公告

### 📢 这里有一项投票

目前有一项关于新开发方向的投票正在进行！建议**所有看到此内容的人**都花 5 秒钟参与这项匿名投票，以便让开发者获得一个公正的参考结果。

- 🗳️ [Smart Merge 是否值得引入这些开销？](https://github.com/hesprs/obsidian-webdav-sync/discussions/117)

## 功能特性

🧰 **完善的基础功能**：

- 双向同步。
- 启动同步 / 定时同步 / 修改时自动保存同步。
- 冲突解决策略（合并 / 保留最新修改 / 保留远程 / 保留本地 / 跳过）。
- 高级速率 / 内存控制选项。
- 您可以通过编写模块来扩展上述绝大部分功能。

🖥 **支持的后端**：

- WebDAV（`WebDAV` 官方模块）。
- S3（正在开发中）。
- Google Drive（已在计划中）。
- 您可以通过创建自定义模块轻松扩展此列表。欢迎贡献！

🧩 **可扩展的架构**：

- 您可以在自定义模块中添加后端、优化器、同步触发器、i18n 资源、决策策略、设置项、自定义文件处理，以及所有可能的调用操作。
- 提供了开发文档（构建中）、AI Agent 技能（构建中）以及带有调试和测试工具包的 SDK。
- 插件提供了专门的模块发现和管理面板 UI。
- 只要符合 [贡献指南](./CONTRIBUTING.md)，本仓库接受任何模块的贡献。

⚡ **闪电般的速度**：

- 增量同步，绝不在每次同步时上传整个库。
- 创新的 [**Anchored Asymmetric Storage™（锚定非对称存储）**](../../blueprint/asymmetric-storage.md) 技术可大幅提升同步速度。
- 实时同步复用缓存的远程状态，使其能够在毫秒内完成。
- 体积比 Remotely Save 小 **40 倍**，启动速度快 **20 倍**。
- 流畅处理拥有超过 3000 个文件及数 GB 大小的库。
- 高度优化的核心同步时机，绝不浪费一毫秒。
- 可扩展的优化器插槽，确保针对您自己的服务对每个请求都进行了优化。

🔐 **客户端加密**：

- 由 `Encryption` 官方模块提供。
- 它可以防止未经授权的文件访问，并在远程端检测意外的文件修改和移动。
- 相比同类解决方案（如 Remotely Save），实现了**理论上更高的安全性和更佳的性能**，详情请参阅 [加密规范](https://github.com/hesprs/obsidian-webdav-sync/blob/main/docs/encryption.md)。

## 安装与设置

Sync Engine v3 正处于 Beta 测试阶段，您可以通过 BRAT 进行安装：

1. 前往 **Community plugins**（社区插件）并搜索 `BRAT`。
2. 安装并启用它。
3. 点击 **Add beta plugin**（添加 Beta 插件），并在 _repository_（仓库）中填入 `https://github.com/hesprs/obsidian-webdav-sync`。
4. 选择 _Latest_ 并安装 + 启用 Sync Engine。

配置：

1. 前往插件设置，找到 **Module management**（模块管理），打开面板。
2. 浏览并安装所需的语言包和后端。
3. 配置您的后端，自动连通性检查会以图标形式显示在 **Storage backend entry**（存储后端条目）内部。
4. 开始您的第一次同步。

## 常见问题

<details><summary>如果同步过程中报错该怎么办？</summary>

您只需重试同步即可。报错既不会阻止后续的同步，也不会损坏您的文件。

如果重试后错误仍然存在，请 [提交 Issue](https://github.com/hesprs/obsidian-webdav-sync/issues/new)，描述该错误和您的配置情况，并附上支持日志。

</details>

<details><summary>在使用此插件时，我应该如何管理我的 WebDAV 存储？</summary>

根据本插件的 [文件处理策略](https://hesprs.github.io/projects/obsidian-webdav-sync#technical-breakdown)，所有远程更改都将被传播到所有库中。因此，通常不建议手动管理您的 WebDAV 存储，除非您打算主动添加 / 删除这些文件。当您启用了加密或非对称存储时，更不建议进行手动管理。

</details>

## 路线图

以下是计划中的功能和改进列表。本插件被采用的速度越快，⭐ 增长得越快，开发进度就会越快。同时，我们也非常欢迎有意向的贡献者加入我们，帮助开发模块或核心功能。

- [x] v3.0：完全重写、动态模块加载、模块商店、非对称存储以及品牌重构
- [ ] v3.1：可扩展的冲突解决方案

## 开源协议

本仓库中 Sync Engine 的源码及模块均采用 [MIT License](https://mit-license.org/) 开源。<br>
`blueprint/` 目录中的文档以及文档网站均采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 协议授权。

Copyright ©️ 2026 Hēsperus and All Contributors
