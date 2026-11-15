# Antigravity Custom Themes (macOS & Windows 跨平台版)

[English](./README_EN.md) | 简体中文

[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=flat-square)](https://github.com/Django9944/antigravity-custom-themes)
[![Version](https://img.shields.io/badge/Release-v2.3.2--mac-60A5FA?style=flat-square)](https://github.com/Django9944/antigravity-custom-themes/releases)
[![macOS Hook](https://img.shields.io/badge/macOS-Zero--Resign%20%26%20TCC%20Safe-10B981?style=flat-square)](#-核心特性与深度打磨)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

> 基于 [`MCRYII/antigravity-custom-themes` (v2.3.2)](https://github.com/MCRYII/antigravity-custom-themes) 深度适配与视觉打磨的 **macOS & Windows 双平台 Google Antigravity IDE 自定义主题引擎**。

为 **Google Antigravity** 注入顶栏低干扰主题切换器与 **6 套浅色 + 6 套深色（外加官方原版共 13 种视觉形态）** 全景极光毛玻璃主题。支持随宿主 `Settings -> Appearance` 自动切换深浅外观、**`Cmd + R` / `Ctrl + R` 秒级热重载**，并提供完整的 Markdown 阅读层级与全局透明变量交互补偿。

<details>
<summary><strong>🌐 English Overview & Quick Start (Google Antigravity Custom Themes for macOS & Windows)</strong></summary>

**Antigravity Custom Themes** is a cross-platform (**macOS & Windows**) Glassmorphism & Aurora custom CSS/JS theme engine for **Google Antigravity IDE**.

- **12 Custom Themes (6 Light + 6 Dark) + Stock Reset**: Aurora (`gemini`), Sky (`sky`), Cyan (`cyan`), Sunset Orange / Lava Dusk (`orange`), Crimson / Velvet Burgundy (`red`), and Orchid / Mystic Purple (`purple`).
- **Zero-Resign macOS ASAR Injection**: Updates only the `app.asar` header checksums without touching `Contents/Info.plist` or `_CodeSignature`—preserving Apple Gatekeeper status and macOS TCC permissions.
- **Zero External Dependencies**: Uses Antigravity's embedded Node runtime (`ELECTRON_RUN_AS_NODE=1`) with automatic `python3` fallback.
- **Native Titlebar & Surface Sync**: Bridges `window.electronNative.wcvBrowser.setThemeColor` across Electron `Context Isolation` on macOS and fixes frameless `-webkit-app-region: drag` click interception.
- **Instant Hot Reload (`Cmd + R`)**: Dynamically reads `current.css` and `current.js` on every window load.

**Quick Install (macOS):**
```bash
git clone https://github.com/Django9944/antigravity-custom-themes.git
cd antigravity-custom-themes
chmod +x install.sh *.command
./install.sh --install
```

**Quick Install (Windows PowerShell):**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

</details>

---

## ✨ 主题一览（6 浅 + 6 深 + 官方原版）

所有自定义主题均严格遵循 Antigravity 外观设置（`Settings -> Appearance`：`Light` / `Dark` / `System`），并针对各自冷暖色调匹配专属**同色系行内代码胶囊色板**：

| 主题 ID | 浅色模式名称 | 深色模式名称 | 主题主色（浅 / 深） | 行内代码文字色（浅 / 深） | 视觉风格描述 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `gemini` | **四色极光** | **暗夜极光** | `#1A73E8` / `#60A5FA` | `#1D4ED8` / `#93C5FD` | Google Gemini 标志性蓝/紫/粉/金四色弥散极光网格与高透毛玻璃 |
| `sky` | **蔚蓝晴空** | **深海晴空** | `#0284C7` / `#38BDF8` | `#0369A1` / `#67E8F9` | 清澈天际蓝渐变与通透云层质感，深色下呈现静谧深海蓝调 |
| `cyan` | **碧水青波** | **幽谷碧波** | `#0D9488` / `#2DD4BF` | `#0F766E` / `#5EEAD4` | 温润青碧玉石半透面板，兼顾清透感与长时间阅读护眼对比度 |
| `orange` | **落霞暖橙** | **熔岩暮色** | `#EA580C` / `#FB923C` | `#C2410C` / `#FDBA74` | 温暖落霞琥珀光晕，深色下呈现炽热熔岩黑金质感 |
| `red` | **丹霞绯红** | **丝绒酒红** | `#E11D48` / `#FB7185` | `#BE123C` / `#FDA4AF` | 柔和丹霞绯红呼吸感，深色下为沉稳丝绒酒红暗夜质感 |
| `purple` | **紫罗幽兰** | **幻夜幽紫** | `#8B5CF6` / `#C084FC` | `#A21CAF` / `#F0ABFC` | 优雅紫罗兰与星夜极光弥散，现代感与柔和层次兼备 |
| `stock` | **官方原版** | **官方原版** | 原生默认 | 原生默认 | `html[data-ag-custom-theme]` 严格隔离，随时 100% 零侵入切回原厂界面 |

---

## 🎨 核心特性与深度打磨

### 1. 苹果 macOS 原生架构适配（与 Windows 双端兼容）
- **免重签 ASAR 注入（保留原厂代码签名与 TCC 权限）**
  - 经分析 macOS 版 `Electron Framework` Fuse 向量，`IsEmbeddedAsarIntegrityValidationEnabled` 为关闭状态，而 `Contents/Info.plist` 绑定在 Mach-O `CodeDirectory` 签名槽位（Slot `-1`）中。
  - [install.sh](./install.sh) **仅精确重算并更新 `app.asar` 内部 Header JSON 中 `dist/utils.js` 的 `SHA256` 与 `4MB` 分块哈希**，不修改 `Contents/Info.plist` 与 `_CodeSignature`，无需 `codesign` 重签名，绝不破坏通知、麦克风、屏幕录制等 TCC 权限。
- **零外部依赖二进制引擎（内置 `ELECTRON_RUN_AS_NODE=1`）**
  - 直接复用 `Antigravity.app` 内置 Node.js 运行时完成 `app.asar` 解包、UInt32LE 头部重算与原子替换，用户的 Mac **无需预装 Node.js、Homebrew 或 Xcode Command Line Tools**（同时支持系统 `python3` 自动降级兜底）。
- **macOS 原生窗口底色与红绿灯区域联动（`wcvBrowser.setThemeColor`）**
  - 突破 Electron `Context Isolation` 与 macOS 上 `setTitleBarOverlay` 空操作的限制，在主题切换与全屏弹窗开关时同步调用 `window.electronNative.wcvBrowser.setThemeColor(hex)`，使 `BaseWindow`、`hubWcv`、`curtainView` 与左上角红绿灯区域底色实时对齐。
- **标题栏防吞点击与角落残影清理**
  - 将主题按钮精确挂载至可见的标题栏内层 `no-drag` 容器，并在容器、按钮、下拉菜单与选项各层显式声明 `-webkit-app-region: no-drag !important; pointer-events: auto !important;`，解决 macOS 无边框窗口拖拽区吞点击问题；同步清理右上角 `toggle-aux-sidebar` / `right-cluster-fade` 残留的 `--shell-canvas` 灰色渐变。
- **Apple 原生字体栈与 `Cmd + R` 热重载**
  - 补充 `"SF Mono", Menlo, Monaco` 与 `"PingFang SC", "Hiragino Sans GB"`；注入 Hook 在 `did-finish-load` 时动态读取磁盘上的 `current.css` 与 `current.js`，更新主题文件后按 **`Cmd + R`**（Windows 按 `Ctrl + R`）即可秒级生效。

### 2. 界面交互与长时阅读视觉优化（严格限定 `html[data-ag-custom-theme]`）
- **低干扰顶栏幽灵按钮 + 双色圆点预览菜单**
  - 右上角切换器收窄为 `26×26` 幽灵纯图标按钮（静止柔和融入背景，悬停/展开高亮；展开态底色与左侧会话列表选中态统一）。下拉菜单右侧展示 **「主背景色 + 主题主色」双色圆点**（`.ag-swatch-base` / `.ag-swatch-accent`），底部实时提示当前跟随的深/浅色外观。
- **Markdown 阅读层级增强（排除 `.xterm` / `.monaco-editor` / 弹窗）**
  - **全 6 套主题同色系行内代码胶囊**：配合 `ensureThemeAttributes()` 实时写入 `data-ag-theme-id` 与 `data-ag-color-scheme`，为每套主题单独配色，清晰醒目且不喧宾夺主。
  - **容器与引导线恢复**：补全多行代码块与 Diff 容器半透明边界、Markdown 表格 `.agy-md-table th` 表头底色、引用块左侧强调条、`ul/ol` 主题色 `::marker` 与嵌套缩进引导线，并提纯 `.text-muted-foreground` 在炫彩极光底色上的清晰度。
- **全局透明语义变量交互补偿**
  - 针对透景主题将 `--muted` / `--secondary` / `--card` 透明化引起的宿主控件失底问题，系统性补全：
    - **划词浮动毛玻璃胶囊**（`.agy-selection-pill`）：浅/深色半透毛玻璃背景（`backdrop-filter: blur(14px)`）、阴影与按钮 `:hover`/`:active` 反馈；
    - **生成产物与变更汇总卡片**（`artifact-card`、`bubble-artifact-card`、`changed-files-card-header`、`changed-files-card-review`）：完整补全静止微透底面、`:hover` 高亮与 `:active` 按压三态；
    - **切换器、跨视图文件行与状态徽标**：恢复右上角已展开按钮底色、`[data-file-uri]` 可点击列表行圆角与高亮、`code-block-preview-toggle` 轨道、按压态按钮（`aria-pressed="true"`）、回退按钮（`revert-button`）、文件引用胶囊（`bdi.context-scope-mention`）、评论数量徽标（`comment-group-count`）及 `automation-settings` 卡片交互。

---

## 🚀 快速开始

### 一、macOS 安装与使用

#### 方式 1：访达（Finder）双击安装（推荐）
1. 下载或克隆本仓库到本地：
   ```bash
   git clone https://github.com/Django9944/antigravity-custom-themes.git
   cd antigravity-custom-themes
   ```
2. 若从浏览器直接下载 ZIP 压缩包，首次运行前请先清除 macOS 隔离属性并赋予执行权限：
   ```bash
   xattr -cr .
   chmod +x install.sh *.command
   ```
3. 在访达（Finder）中直接双击：
   - **`install.command`**：一键安装 / 修复 / 更新主题注入
   - **`uninstall.command`**：一键卸载并 100% 字节级还原原厂 `app.asar`
   - **`检查更新.command`**：检查 GitHub 最新版本

#### 方式 2：终端命令行运行
```bash
# 安装或更新主题（交互式，提示优雅重启 Antigravity）
./install.sh --install

# 静默同步文件与补丁（不关闭当前运行的 Antigravity 会话；已注入窗口按 Cmd + R 即可热更新生效）
./install.sh --install --non-interactive

# 指定自定义 Antigravity.app 路径安装
./install.sh --install --app-path "/Applications/Antigravity.app"

# 卸载主题并字节级恢复原厂 app.asar（优先从 app.asar.stock 还原，备份缺失时自动 strip 自愈）
./install.sh --uninstall

# 检查版本更新
./install.sh --check-update
```

---

### 二、Windows 安装与使用

本项目完整保留了 Windows 端的一键脚本与跨平台 Hook 支持：
- **双击安装**：双击运行 `install.bat`
- **双击卸载**：双击运行 `uninstall.bat`
- **检查更新**：双击运行 `检查更新.bat`
- **PowerShell 命令行**：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
  ```

---

## 📂 项目目录结构

```text
antigravity-custom-themes/
├── current.js          # 核心主题引擎（6 浅 + 6 深主题 Token、双色预览菜单、no-drag 挂载器、macOS/Win 窗口同步）
├── current.css         # 全局样式伴侣（全 6 主题同色系代码胶囊、Markdown 层级增强、划词胶囊/卡片三态/标题栏反馈补偿）
├── install.sh          # macOS 核心管理脚本（Electron Fuse 兼容 ASAR 解析注入、原厂备份、strip 自愈卸载、更新检查）
├── install.command     # macOS Finder 双击安装入口
├── uninstall.command   # macOS Finder 双击卸载入口
├── 检查更新.command     # macOS Finder 双击检查更新入口
├── install.ps1         # Windows PowerShell 核心管理脚本（已同步跨平台 Hook）
├── install.bat         # Windows 双击安装入口
├── uninstall.bat       # Windows 双击卸载入口
├── 检查更新.bat         # Windows 双击检查更新入口
├── LICENSE             # MIT 开源许可证（保留上游原作者与 macOS 适配版双重署名）
└── README.md           # 项目说明文档
```

---

## 🔧 常见问题 (FAQ)

1. **Antigravity 客户端更新后主题消失了怎么办？**
   - 客户端版本更新会覆盖 `/Applications/Antigravity.app/Contents/Resources/app.asar`。重新双击运行 `install.command`（或执行 `./install.sh --install`）即可恢复注入，您之前选择的主题偏好会自动保留。
2. **如何在顶栏切换主题或恢复官方原版？**
   - 安装并在 Antigravity 中重启/刷新后，右上角工具栏会出现**主题图标按钮**（低干扰纯图标），点击即可打开双色预览菜单切换任意主题或一键切回「官方原版」。
3. **如何切换深色 / 浅色模式？**
   - 本主题引擎自动跟随 Antigravity 宿主设置：打开 `Settings -> Appearance`，切换 `Light` / `Dark` / `System`，自定义主题、菜单预览圆点与行内代码色板都会实时同步切换。
4. **如何完全卸载并恢复原厂文件？**
   - 双击 `uninstall.command` 或执行 `./install.sh --uninstall`。脚本会利用 `~/Library/Application Support/Antigravity/custom-theme-backup/app.asar.stock`（或无备份时的 `strip` 逆向剥离引擎）将 `app.asar` 字节级还原至原厂状态，并清理注入目录。

---

## ⚖️ 免责声明、商标声明与开源许可 (Legal, Trademarks & License)

1. **开源许可与衍生声明 (MIT License & Attribution)**：
   - 本项目基于 [MCRYII/antigravity-custom-themes](https://github.com/MCRYII/antigravity-custom-themes)（`Copyright (c) 2026 MCRYII`）在 **MIT License** 授权下进行衍生开发（新增 macOS 免重签 ASAR 注入引擎、`wcvBrowser.setThemeColor` 原生窗口底色同步、防拖拽吞点击修复、全 6 主题代码胶囊及全局交互补偿），并同样以 [MIT License](./LICENSE) 开源发布。
2. **非官方关联与商标声明 (Non-Affiliation & Trademarks)**：
   - 本项目为独立的第三方开源社区项目，**与 Google LLC、Google DeepMind 或 Google Antigravity 官方团队无任何隶属、合作、授权或背书关系**。
   - 文中提及的 **Google**、**Antigravity**、**Gemini**、**macOS**、**Apple**、**Windows**、**Microsoft** 及其他相关产品名称与商标，均归其各自合法所有者所有。此处引用仅作兼容性与适配对象说明（Nominative Fair Use）。
3. **无专有二进制分发与风险自担声明 (No Proprietary Binaries & As-Is Warranty)**：
   - 本仓库**仅包含纯文本样式表（`current.css`）、前端主题脚本（`current.js`）与本地安装脚本（`install.sh` / `install.ps1`）**，**绝不包含或分发任何 Google Antigravity 官方客户端专有代码、反编译源码或二进制包（如 `app.asar`）**。
   - 所有补丁注入操作均在用户本机环境动态执行，并配备原厂备份（`app.asar.stock`）与字节级无损还原机制。本软件按“原样（AS IS）”提供，使用本项目修改本地客户端所产生的任何风险由用户自行承担。

---

## 🙏 致谢

- 原项目作者与主题设计：[MCRYII/antigravity-custom-themes](https://github.com/MCRYII/antigravity-custom-themes)
