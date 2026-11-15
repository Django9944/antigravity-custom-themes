# Antigravity Custom Themes (macOS & Windows)

[English](./README_EN.md) | [简体中文](./README.md)

[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=flat-square)](https://github.com/Django9944/antigravity-custom-themes)
[![Version](https://img.shields.io/badge/Release-v2.3.2--mac-60A5FA?style=flat-square)](https://github.com/Django9944/antigravity-custom-themes/releases)
[![macOS Hook](https://img.shields.io/badge/macOS-Zero--Resign%20%26%20TCC%20Safe-10B981?style=flat-square)](#-core-features--polish)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

> A cross-platform (**macOS & Windows**) Glassmorphism & Aurora custom CSS/JS theme engine for **Google Antigravity IDE**, deeply adapted and visually refined from [`MCRYII/antigravity-custom-themes` (v2.3.2)](https://github.com/MCRYII/antigravity-custom-themes).

Injects a low-distraction top-bar theme switcher and **6 Light + 6 Dark (plus Stock Reset = 13 visual modes)** panoramic aurora glassmorphism themes into **Google Antigravity**. Automatically follows `Settings -> Appearance` (`Light` / `Dark` / `System`), supports **instant `Cmd + R` / `Ctrl + R` hot reload**, and provides comprehensive Markdown hierarchy polish and global transparent-variable interaction compensation.

---

## ✨ Theme Gallery (6 Light + 6 Dark + Stock)

All custom themes strictly follow Antigravity's appearance setting (`Settings -> Appearance`: `Light` / `Dark` / `System`) and pair each theme with a dedicated **harmonized inline-code pill palette**:

| Theme ID | Light Mode | Dark Mode | Primary Accent (Light / Dark) | Inline Code Text (Light / Dark) | Visual Style |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `gemini` | **Aurora** | **Dark Aurora** | `#1A73E8` / `#60A5FA` | `#1D4ED8` / `#93C5FD` | Signature Google Gemini blue/purple/pink/gold 4-color aurora mesh & frosted glass |
| `sky` | **Sky** | **Deep Ocean** | `#0284C7` / `#38BDF8` | `#0369A1` / `#67E8F9` | Crisp sky-blue gradient with airy cloud translucency; tranquil deep-sea tones in dark mode |
| `cyan` | **Cyan** | **Misty Valley** | `#0D9488` / `#2DD4BF` | `#0F766E` / `#5EEAD4` | Soft jade-cyan translucent panels balanced for long-form reading comfort |
| `orange` | **Sunset Orange** | **Lava Dusk** | `#EA580C` / `#FB923C` | `#C2410C` / `#FDBA74` | Warm amber sunset glow in light mode; molten black-gold lava texture in dark mode |
| `red` | **Crimson** | **Velvet Burgundy** | `#E11D48` / `#FB7185` | `#BE123C` / `#FDA4AF` | Soft crimson breathing glow in light mode; composed velvet burgundy in dark mode |
| `purple` | **Orchid** | **Mystic Purple** | `#8B5CF6` / `#C084FC` | `#A21CAF` / `#F0ABFC` | Elegant violet & starry-night aurora diffusion with modern layered depth |
| `stock` | **Official Stock** | **Official Stock** | Native Default | Native Default | Strictly scoped under `html[data-ag-custom-theme]`; 100% zero-intrusion instant revert |

---

## 🎨 Core Features & Polish

### 1. Native macOS Architecture & Cross-Platform Windows Support
- **Zero-Resign ASAR Injection (Preserves Code Signature & TCC Permissions)**
  - Based on macOS `Electron Framework` Fuse analysis, `IsEmbeddedAsarIntegrityValidationEnabled` is disabled, while `Contents/Info.plist` is bound to Mach-O `CodeDirectory` Slot `-1`.
  - [install.sh](./install.sh) **updates only the `SHA256` and `4MB` block hashes of `dist/utils.js` inside the `app.asar` header JSON**, leaving `Contents/Info.plist` and `_CodeSignature` untouched—no `codesign` re-signing required and macOS TCC permissions (notifications, microphone, screen recording) stay intact.
- **Zero External Dependencies (`ELECTRON_RUN_AS_NODE=1`)**
  - Reuses `Antigravity.app`'s embedded Node.js runtime to unpack `app.asar`, recompute UInt32LE headers, and perform atomic replacement—**no pre-installed Node.js, Homebrew, or Xcode Command Line Tools required** (with automatic `python3` fallback).
- **Native Titlebar & Window Surface Sync (`wcvBrowser.setThemeColor`)**
  - Bridges `window.electronNative.wcvBrowser.setThemeColor(hex)` across Electron `Context Isolation` on macOS, keeping `BaseWindow`, `hubWcv`, `curtainView`, and the traffic-light titlebar area synchronized on theme changes and modals.
- **Frameless Drag-Region Click Fix & Corner Gradient Cleanup**
  - Mounts the theme button inside a visible inner `no-drag` titlebar container with explicit `-webkit-app-region: no-drag !important; pointer-events: auto !important;` across wrapper, button, dropdown, and menu items, while removing residual `--shell-canvas` gray gradients near `toggle-aux-sidebar` / `right-cluster-fade`.
- **Apple Native Font Stack & `Cmd + R` Hot Reload**
  - Adds `"SF Mono", Menlo, Monaco` and `"PingFang SC", "Hiragino Sans GB"`; dynamically loads `current.css` and `current.js` on `did-finish-load` so **`Cmd + R`** (or `Ctrl + R` on Windows) applies edits instantly.

### 2. UI Interaction & Long-Form Reading Polish (Scoped to `html[data-ag-custom-theme]`)
- **Low-Distraction Top-Bar Ghost Button + Dual-Swatch Preview Menu**
  - Compact `26×26` icon-only ghost button in the top-right toolbar with unified active/expanded styling and a dropdown showing **Base + Accent dual-color swatches** (`.ag-swatch-base` / `.ag-swatch-accent`) plus live light/dark mode indicator.
- **Markdown Reading Hierarchy (Excluding `.xterm` / `.monaco-editor` / Dialogs)**
  - **Harmonized Inline-Code Pills**: `ensureThemeAttributes()` syncs `data-ag-theme-id` and `data-ag-color-scheme` so each of the 6 themes uses its own matching inline-code palette.
  - **Container & Guide-Line Restoration**: Restores translucent borders for code blocks and diff views, `.agy-md-table th` header fills, blockquote accent bars, themed `ul/ol` `::marker` bullets and nested indent guides, and crisp `.text-muted-foreground` contrast.
- **Global Transparent-Variable Interaction Compensation**
  - Compensates for `--muted`, `--secondary`, and `--card` transparency across:
    - **Floating Selection Pill** (`.agy-selection-pill`): frosted glass (`backdrop-filter: blur(14px)`), shadow, and hover/active states;
    - **Artifact & Changed-Files Cards** (`artifact-card`, `bubble-artifact-card`, `changed-files-card-header`, `changed-files-card-review`): resting tint, hover highlight, and `:active` press feedback;
    - **Toggles, File Rows & Badges**: expanded titlebar buttons, `[data-file-uri]` rows, `code-block-preview-toggle`, `aria-pressed="true"` buttons, `revert-button`, `bdi.context-scope-mention`, `comment-group-count`, and `automation-settings` cards.

---

## 🚀 Quick Start

### macOS Installation

#### Option 1: Double-Click in Finder (Recommended)
1. Clone or download this repository:
   ```bash
   git clone https://github.com/Django9944/antigravity-custom-themes.git
   cd antigravity-custom-themes
   ```
2. If downloaded as a ZIP from your browser, clear the macOS quarantine attribute and make scripts executable:
   ```bash
   xattr -cr .
   chmod +x install.sh *.command
   ```
3. Double-click in Finder:
   - **`install.command`**: Install / repair / update theme injection
   - **`uninstall.command`**: Uninstall and 100% byte-level restore stock `app.asar`
   - **`检查更新.command`**: Check for the latest GitHub release

#### Option 2: Terminal CLI
```bash
# Install or update (interactive, prompts to restart Antigravity)
./install.sh --install

# Non-interactive sync (keeps running Antigravity open; press Cmd + R to hot reload)
./install.sh --install --non-interactive

# Custom Antigravity.app path
./install.sh --install --app-path "/Applications/Antigravity.app"

# Uninstall & byte-level restore stock app.asar
./install.sh --uninstall

# Check for updates
./install.sh --check-update
```

### Windows Installation

- **Double-Click**: Run `install.bat`, `uninstall.bat`, or `检查更新.bat`
- **PowerShell CLI**:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
  ```

---

## 📂 Project Structure

```text
antigravity-custom-themes/
├── current.js          # Core theme engine (6 Light + 6 Dark tokens, dual-swatch menu, no-drag mounter, macOS/Win sync)
├── current.css         # Companion stylesheet (6-theme code pills, Markdown polish, selection pill & card interaction states)
├── install.sh          # macOS installer (Electron Fuse-safe ASAR patcher, stock backup, strip self-healing, update check)
├── install.command     # macOS Finder double-click installer
├── uninstall.command   # macOS Finder double-click uninstaller
├── 检查更新.command     # macOS Finder double-click update checker
├── install.ps1         # Windows PowerShell installer (synced cross-platform hook)
├── install.bat         # Windows double-click installer
├── uninstall.bat       # Windows double-click uninstaller
├── 检查更新.bat         # Windows double-click update checker
├── LICENSE             # MIT License (dual attribution)
├── README.md           # Chinese documentation
└── README_EN.md        # English documentation
```

---

## 🔧 FAQ

1. **Themes disappeared after an Antigravity client update?**
   - Client updates overwrite `/Applications/Antigravity.app/Contents/Resources/app.asar`. Re-run `install.command` or `./install.sh --install` to re-inject; your selected theme preference is preserved.
2. **How do I switch themes or revert to Stock?**
   - Click the theme icon button in the top-right toolbar to open the dual-swatch menu and pick any theme or **Official Stock**.
3. **How do I switch between Light and Dark mode?**
   - Themes automatically follow `Settings -> Appearance` (`Light` / `Dark` / `System`) in real time.
4. **How do I completely uninstall and restore stock files?**
   - Run `uninstall.command` or `./install.sh --uninstall` to byte-level restore `app.asar` from backup (or via the built-in `strip` fallback) and clean up injected files.

---

## ⚖️ Legal, Trademarks & License

1. **MIT License & Attribution**:
   - Derived from [MCRYII/antigravity-custom-themes](https://github.com/MCRYII/antigravity-custom-themes) (`Copyright (c) 2026 MCRYII`) under the **MIT License**, and released under the same [MIT License](./LICENSE).
2. **Non-Affiliation & Trademarks**:
   - Independent third-party open-source community project; **not affiliated with, endorsed by, or sponsored by Google LLC, Google DeepMind, or the Google Antigravity team**.
   - **Google**, **Antigravity**, **Gemini**, **macOS**, **Apple**, **Windows**, and **Microsoft** are trademarks of their respective owners and are referenced solely for compatibility description (Nominative Fair Use).
3. **No Proprietary Binaries & As-Is Warranty**:
   - This repository contains **only plain-text stylesheets (`current.css`), frontend scripts (`current.js`), and local installer scripts**—never any proprietary Antigravity binaries or `app.asar`. Provided "AS IS" without warranty.

---

## 🙏 Acknowledgments

- Original author & theme design: [MCRYII/antigravity-custom-themes](https://github.com/MCRYII/antigravity-custom-themes)
