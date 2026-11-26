# Changelog

All notable changes to **Antigravity Custom Themes** are documented in this file.

## [v2.4.2] - 2026-11-26

### ✨ 宿主升级自动同步与兼容验证 (Automated Host Sync)
- **宿主版本兼容认证**：云端自动提取官方 Antigravity `2.35.2` (`2.35.2-4585983447007232`) 真实 `app.asar` 完成注入、分块哈希与字节级剥离回归验证（命中锚点：`void loadHubWindowUrl(win, url, { skipBootstrapMint });`）。

---

## [v2.4.1] - 2026-11-23

### ⚡ 性能优化 (Performance)
- **消除滚动重绘阻塞与吸顶色带断层（PR #2 by `@xiu-cpu` + `127fa58`）**：
  - 移除 `html`、`.bg-sidebar` 及 3 类吸顶容器上的 `background-attachment: fixed`，恢复 Chromium GPU 硬件滚动合成。
  - 将吸顶容器背景从视口级渐变改为 `color-mix` 高不透明度纯色底衬，消除晴空/落日/绯樱/暮紫等浅色主题下的色带断层。
- **按平台精准降级 `backdrop-filter` 与透字补偿**：
  - 通过 `html[data-ag-platform="win"]` 仅在 Windows 端关闭滚动区上方浮层（聊天输入框、语音浮层、吸顶卡片等）的实时高斯模糊，并同步提升背景不透明度至 `0.92 ~ 0.96` 防止文字锐利透出；完整保留 macOS 端毛玻璃质感与静态顶栏效果。
- **消除高频 DOM 变更强制回流**：
  - 为 `mountThemeSelector()` 增加零回流快速返回路径，避免滚动与流式输出期间重复调用 `getBoundingClientRect()`；为 `MutationObserver` 增加 `80ms` 节流并保留主题切换与模态标题栏的即时同步。

### 🧪 测试与工程 (Tests)
- 在 `tests/test-asar-patcher.mjs` 新增嵌入式 CSS 括号配平、禁用 `fixed` 滚动陷阱、吸顶防断层及 Windows 平台作用域回归校验。

---

## [v2.4.0] - 2026-11-21

### ✨ 新增特性 (Features)
- **一键校验在线自更新 (`--update` / `-Update` & `core/updater.js`)**：
  - 自动从本仓库 GitHub Releases 下载对应平台发行包（`macos.zip` / `windows.zip`）并严格比对 `SHA256SUMS.txt` 校验完整性。
  - **智能分级热更新**：若 `hookVersion` 未发生变化且当前 `app.asar` 已处于 `PATCHED_V1` 状态，直接热覆盖双目录 `current.css` 与 `current.js`，无需关闭 Antigravity、无需重写 `app.asar`，按 `Cmd + R` / `Ctrl + R` 秒级生效；否则自动同步并重注入。
  - `检查更新.command` / `检查更新.bat` 发现新版本后支持直接回车一键完成自动下载与升级。
- **IDE 内置新版本角标提醒 (`current.js`)**：
  - 每 24 小时静默只读检查一次 GitHub 最新 Release（本地 `localStorage` 缓存，离线静默忽略，不远程执行任何代码）。
  - 发现新版本时在顶栏主题切换按钮右上角展示蓝点提示，并在下拉面板底部提供可点击的版本更新入口。
- **宿主 Antigravity 升级后自动恢复主题 (`auto-heal`)**：
  - **macOS (`--enable-auto-heal` / `--disable-auto-heal`)**：通过 `LaunchAgent` (`WatchPaths`) 监听 `app.asar` 变动，宿主更新覆盖 `app.asar` 后自动检测锚点并静默恢复注入。
  - **Windows (`-EnableAutoHeal` / `-DisableAutoHeal`)**：注册用户级登录计划任务（无需管理员权限），登录时自动检测并静默恢复被宿主升级覆盖的主题钩子。
- **Antigravity 官方版本云端监控 (`antigravity-watch.yml` & `scripts/check-antigravity-upstream.mjs`)**：
  - 每日云端自动轮询 Google Antigravity 官方自动更新通道（`latest-x64-win.yml` / `latest-arm64-mac.yml` / `latest-x64-mac.yml`）。
  - 检测到官方新构建时，在云端自动下载官方 `Antigravity.zip` 提取真实 `app.asar` 执行完整注入与字节级剥离回归测试，并自动维护兼容性看板 Issue。

---

## [v2.3.3] - 2026-11-21

### ✨ 新增特性与架构重构 (Features & Refactoring)
- **兼容 Antigravity 2.34+ 注入锚点 (`83e6f5b`)**：
  - 新增对 Antigravity 2.34+ `void loadHubWindowUrl(win, url, { skipBootstrapMint });` 注入锚点及兜底正则的兼容支持，同时向下兼容旧版 `void win.loadURL(url);`。
- **跨平台单一事实源与共享补丁引擎 (`manifest.json` & `core/asar-patcher.js`)**：
  - 抽离 `manifest.json` 统一管理版本号、仓库地址、注入锚点列表与载荷配置。
  - 将 macOS 与 Windows 的 ASAR 解析、注入、逆向剥离、SHA256 整包及 4MB 分块校验统一收拢至零外部依赖的 `core/asar-patcher.js`（直接复用 Antigravity 内置 Electron Node 运行时 `ELECTRON_RUN_AS_NODE=1`）。
  - 新增 `--doctor` / `-Doctor` 只读诊断模式与本机兼容性探针 `scripts/check-host-compat.mjs`。
- **三平台 CI 与自动化发布流水线 (`ci.yml` & `release.yml`)**：
  - 新增 `macos-latest`、`ubuntu-latest`、`windows-latest` 全量合成 ASAR 生命周期（注入、幂等、剥离字节级一致性）自动化测试。

### 🐛 问题修复 (Bug Fixes)
- **Windows 跨 Shell 哈希兼容 (`3b82a89`)**：使用纯 .NET `SHA256` 替代 `Get-FileHash`，修复从 PowerShell 7 (`pwsh`) 环境调用 Windows PowerShell 5.1 时模块加载失败的问题。
- **更新源修正**：将 `install.sh` 与 `install.ps1` 的更新检测源从原上游切换至 `Django9944/antigravity-custom-themes`。

---

## [v2.3.2-mac] - 2026-11-15

### ✨ 核心特性 (Highlights)
- **macOS 免重签 ASAR 注入 (`install.sh` / `install.command`)**：仅更新 `app.asar` 头部与分块哈希，保持 `Info.plist` 与 Mach-O 原始代码签名不动，保留 macOS TCC 权限。
- **原生标题栏同步与 12 款极光毛玻璃主题**：6 浅 + 6 深主题（`gemini`、`sky`、`cyan`、`orange`、`red`、`purple`）+ `stock` 原厂重置，支持 `Cmd + R` / `Ctrl + R` 秒级热重载。
