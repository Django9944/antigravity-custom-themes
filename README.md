# Antigravity Custom Themes (macOS & Windows 跨平台版)

> 基于 [`MCRYII/antigravity-custom-themes` (v2.3.2)](https://github.com/MCRYII/antigravity-custom-themes) 深度适配开发的 **macOS & Windows 双平台** Google Antigravity IDE 自定义主题引擎。

为 **Google Antigravity** 注入顶栏主题胶囊切换器与 **6 套浅色 + 6 套深色（外加官方原版共 13 种视觉形态）** 全景流光毛玻璃主题，支持跟随系统/宿主 Appearance 深浅模式秒级热切换。

---

## ✨ 主题一览

所有自定义主题均支持 **浅色（Light）** 与 **深色（Dark）** 双模态，跟随 Antigravity 设置（`Settings -> Appearance`）自动切换：

| 主题 ID | 浅色模式名称 | 深色模式名称 | 视觉风格描述 |
| :--- | :--- | :--- | :--- |
| `gemini` | **四色极光** | **暗夜极光** | Google Gemini 标志性蓝/紫/粉/金四色弥散极光网格与高透毛玻璃 |
| `sky` | **蔚蓝晴空** | **深海晴空** | 清澈天际蓝渐变与通透云层质感，深色下呈现静谧深海蓝调 |
| `sakura` | **落樱微雨** | **夜樱微雨** | 柔和樱粉与暖白交织的春日呼吸感，深色下为暗夜绯樱质感 |
| `mint` | **薄荷清风** | **森夜薄荷** | 清新薄荷绿与玉石半透面板，缓解长时间编码与阅读视觉疲劳 |
| `amber` | **琥珀暖阳** | **流金暗夜** | 温暖琥珀金与米白纸感护眼色调，深色下呈现黑金高级质感 |
| `lavender` | **薰衣草雾** | **星夜紫雾** | 优雅薰衣草紫雾弥散，兼具现代感与柔和对比度 |
| `stock` | **官方原版** | **官方原版** | 100% 零侵入还原 Antigravity 原厂样式，随时一键切回 |

---

## 🍎 macOS 核心适配特性

针对 macOS 版 `Antigravity.app`（Electron 40+ / `BaseWindow` + `WebContentsView` 架构），本项目进行了底层定制适配：

1. **免重签 ASAR 注入（保留原厂代码签名与 TCC 权限）**
   - 经对 macOS 版 `Electron Framework` Fuse 向量分析，`IsEmbeddedAsarIntegrityValidationEnabled` 处于关闭状态，而 `Contents/Info.plist` 被绑定在 Mach-O `CodeDirectory` 签名槽位（Slot `-1`）中。
   - 安装脚本**仅精确重算并更新 `app.asar` 内部 Header JSON 中 `dist/utils.js` 的 `SHA256` 与 `4MB` 分块哈希**，完全不改动 `Contents/Info.plist` 与 `_CodeSignature`。因此**无需 `codesign` 重签名**，也绝不会破坏 macOS 的麦克风、通知、屏幕录制等 TCC 授权。
2. **零外部依赖二进制引擎（内置 `ELECTRON_RUN_AS_NODE=1`）**
   - 直接复用 `Antigravity.app` 自带的 Node.js 运行时（`ELECTRON_RUN_AS_NODE=1`）完成 `app.asar` 二进制解包、UInt32LE 头部偏移重算与原子替换。用户的 Mac **无需预先安装 Node.js、Homebrew 或 Xcode Command Line Tools**（同时提供 `python3` 自动降级兜底）。
3. **macOS 原生窗口底色与红绿灯区域同步（`wcvBrowser.setThemeColor`）**
   - Windows 版的 `setTitleBarOverlay` 在 macOS 主进程中为空操作（No-op），且 Electron 的 `contextIsolation` 导致 Preload 脚本无法感知自定义主题的透明背景变量。
   - 本项目通过桥接 `window.electronNative.wcvBrowser.setThemeColor(hex)`，使 macOS 的 `BaseWindow`、`hubWcv`、`curtainView` 以及左上角红绿灯（Traffic Lights）区域底色与当前主题、全屏看图/设置模态框实时联动。
4. **Apple 原生字体栈优化**
   - 为终端（xterm）与代码区域补充 `"SF Mono", Menlo, Monaco` 与 `"PingFang SC", "Hiragino Sans GB"`，在 Retina 屏幕上呈现原生级锐利字形。
5. **双目录热备份与自愈机制**
   - 主题资源同时部署至 `/Applications/Antigravity.app/Contents/Resources/custom-theme` 与 `~/Library/Application Support/Antigravity/custom-theme`；原厂 `app.asar.stock` 自动备份于 `~/Library/Application Support/Antigravity/custom-theme-backup/`，即使备份丢失也能通过逆向剥离 Hook 自动自愈还原。

---

## 🚀 快速开始

### 一、macOS 安装与使用

#### 方式 1：访达（Finder）双击安装（推荐）
1. 下载或克隆本仓库到本地。
2. 若从浏览器直接下载压缩包，首次运行前建议在终端清除 macOS 隔离属性并赋予执行权限：
   ```bash
   cd antigravity-custom-themes
   xattr -cr .
   chmod +x install.sh *.command
   ```
3. 在访达（Finder）中直接双击：
   - **`install.command`**：一键安装 / 修复 / 更新主题注入
   - **`uninstall.command`**：一键卸载并 100% 还原原厂 `app.asar`
   - **`检查更新.command`**：检查 GitHub 最新版本

#### 方式 2：终端命令行运行
```bash
# 安装主题（交互式，会自动提示优雅关闭并重启 Antigravity）
./install.sh --install

# 静默安装（不关闭当前正在运行的 Antigravity 会话，下次重启生效）
./install.sh --install --non-interactive

# 指定自定义 Antigravity.app 路径安装
./install.sh --install --app-path "/Applications/Antigravity.app"

# 卸载主题并恢复原厂状态
./install.sh --uninstall

# 检查版本更新
./install.sh --check-update
```

---

### 二、Windows 安装与使用

本项目完全保留了 Windows 端的一键脚本支持：
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
├── current.js          # 核心主题引擎（含 6 浅 + 6 深主题 Token、DOM 挂载器、macOS/Win 原生窗口同步）
├── current.css         # 首帧防闪烁与看图模态/辅助面板最大化通用兜底样式
├── install.sh          # macOS 核心管理脚本（ASAR 二进制解析、注入、自愈备份、卸载、更新检查）
├── install.command     # macOS Finder 双击安装入口
├── uninstall.command   # macOS Finder 双击卸载入口
├── 检查更新.command     # macOS Finder 双击检查更新入口
├── install.ps1         # Windows PowerShell 核心管理脚本（已同步跨平台 Hook）
├── install.bat         # Windows 双击安装入口
├── uninstall.bat       # Windows 双击卸载入口
├── 检查更新.bat         # Windows 双击检查更新入口
└── README.md           # 项目说明文档
```

---

## 🔧 常见问题 (FAQ)

1. **Antigravity 客户端更新后主题消失了怎么办？**
   - 客户端大版本更新会覆盖 `/Applications/Antigravity.app/Contents/Resources/app.asar`。只需重新双击运行一次 `install.command`（或执行 `./install.sh --install`）即可重新注入，您之前选择的主题偏好会自动保留。
2. **如何在顶栏切换主题或恢复官方原版？**
   - 安装并重启 Antigravity 后，在窗口右上角工具栏（`Open IDE` 按钮旁）会出现主题胶囊按钮，点击即可在下拉菜单中实时切换任意主题或切回「官方原版」。
3. **如何切换深色 / 浅色模式？**
   - 本主题引擎严格遵循 Antigravity 宿主的外观设置：打开 `Settings -> Appearance`，切换 `Light` / `Dark` / `System`，所有自定义主题会自动切换至对应的浅色或暗夜形态。

---

## 🙏 致谢

- 原项目作者：[MCRYII/antigravity-custom-themes](https://github.com/MCRYII/antigravity-custom-themes)
