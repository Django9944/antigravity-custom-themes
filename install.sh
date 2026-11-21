#!/usr/bin/env bash
# =====================================================================
#  Antigravity Custom Themes - macOS One-Click Installer & Manager
#  Version: v2.3.2-mac
#  Based on MCRYII/antigravity-custom-themes (Copyright (c) 2026 MCRYII), licensed under the MIT License.
#  macOS Adaptation & Zero-Dependency ASAR Engine (Copyright (c) 2026 Django9944), licensed under the MIT License.
#  功能:
#    1) 自动定位 Antigravity.app (/Applications, ~/Applications, Spotlight)
#    2) 原厂备份与逆向剥离自愈 (~/Library/Application Support/Antigravity/custom-theme-backup/app.asar.stock)
#    3) 零外部依赖注入 app.asar (复用内置 ELECTRON_RUN_AS_NODE=1 或 python3，重算 SHA256 与 4MB 分块哈希)
#    4) 保持 Contents/Info.plist 与 _CodeSignature 原始签名不动，不破坏 macOS TCC 权限
#    5) 双目录分发主题文件 (Contents/Resources/custom-theme 与 ~/Library/Application Support/Antigravity/custom-theme)
#
#  用法:
#    ./install.sh [--install] [--uninstall] [--check-update] [--app-path <path>] [--non-interactive|-y]
# =====================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_VERSION="v2.3.2"
UPSTREAM_REPO="MCRYII/antigravity-custom-themes"
RELEASES_URL="https://github.com/${UPSTREAM_REPO}/releases/latest"
PAYLOADS=("current.css" "current.js")

MODE="install"
CUSTOM_APP_PATH=""
NON_INTERACTIVE=0

# ---------- 颜色与输出辅助 ----------
if [ -t 1 ]; then
    C_RED='\033[0;31m'
    C_GREEN='\033[0;32m'
    C_YELLOW='\033[0;33m'
    C_CYAN='\033[0;36m'
    C_GRAY='\033[0;90m'
    C_RESET='\033[0m'
else
    C_RED=''
    C_GREEN=''
    C_YELLOW=''
    C_CYAN=''
    C_GRAY=''
    C_RESET=''
fi

info() { printf "${C_CYAN}[*] %s${C_RESET}\n" "$*"; }
ok()   { printf "${C_GREEN}[OK] %s${C_RESET}\n" "$*"; }
warn() { printf "${C_YELLOW}[!] %s${C_RESET}\n" "$*"; }
die()  { printf "${C_RED}[X] %s${C_RESET}\n" "$*" >&2; exit 1; }

usage() {
    cat <<EOF
用法: $(basename "$0") [选项]

选项:
  --install              安装或修复 Antigravity 主题补丁 (默认)
  --uninstall, -u        卸载主题补丁并还原原厂 app.asar
  --check-update         检查 GitHub 最新发行版
  --app-path <path>      指定 Antigravity.app 路径 (默认自动探测)
  --non-interactive, -y  非交互静默模式 (跳过确认、不关闭或重启正在运行的客户端)
  --help, -h             显示帮助信息
EOF
}

# ---------- 参数解析 ----------
while [ $# -gt 0 ]; do
    case "$1" in
        --install)
            MODE="install"
            shift
            ;;
        --uninstall|-u|-Uninstall)
            MODE="uninstall"
            shift
            ;;
        --check-update|-CheckUpdate)
            MODE="check-update"
            shift
            ;;
        --app-path)
            [ $# -ge 2 ] || die "--app-path 需要指定路径参数"
            CUSTOM_APP_PATH="$2"
            shift 2
            ;;
        --app-path=*)
            CUSTOM_APP_PATH="${1#*=}"
            shift
            ;;
        --non-interactive|-y)
            NON_INTERACTIVE=1
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            die "未知参数: $1 (使用 --help 查看用法)"
            ;;
    esac
done

# ---------- 解析真实用户 HOME 目录 (兼容 sudo 提权场景) ----------
resolve_user_home() {
    if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
        local shome
        shome="$(dscl . -read "/Users/${SUDO_USER}" NFSHomeDirectory 2>/dev/null | awk '{print $2}' || true)"
        if [ -n "$shome" ] && [ -d "$shome" ]; then
            echo "$shome"
            return
        fi
    fi
    echo "${HOME}"
}

USER_HOME="$(resolve_user_home)"
USER_DATA_DIR="${AG_USER_DATA_DIR:-${USER_HOME}/Library/Application Support/Antigravity}"
BACKUP_DIR="${AG_BACKUP_DIR:-${USER_DATA_DIR}/custom-theme-backup}"
BACKUP_PATH="${BACKUP_DIR}/app.asar.stock"

fix_user_ownership() {
    local target="$1"
    if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ] && [ -e "$target" ]; then
        chown -R "${SUDO_USER}" "$target" 2>/dev/null || true
    fi
}

# ---------- 检查更新分支 ----------
if [ "$MODE" = "check-update" ]; then
    info "正在检测 GitHub 最新发行版 (${UPSTREAM_REPO})..."
    API_URL="https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest"
    if ! command -v curl >/dev/null 2>&1; then
        die "未找到 curl 命令，请直接访问: ${RELEASES_URL}"
    fi

    RESP="$(curl -sL --max-time 10 -H "User-Agent: Antigravity-Theme-Updater" "$API_URL" || true)"
    REMOTE_TAG="$(printf "%s" "$RESP" | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
    PUBLISHED_AT="$(printf "%s" "$RESP" | grep -m1 '"published_at"' | sed -E 's/.*"published_at"[[:space:]]*:[[:space:]]*"([^T"]+)".*/\1/' || true)"
    HTML_URL="$(printf "%s" "$RESP" | grep -m1 '"html_url"' | sed -E 's/.*"html_url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
    [ -n "$HTML_URL" ] || HTML_URL="$RELEASES_URL"
    [ -n "$PUBLISHED_AT" ] || PUBLISHED_AT="近期"

    if [ -z "$REMOTE_TAG" ]; then
        warn "检查更新失败（无法获取远端版本信息）。"
        printf "${C_GRAY}    您也可以直接在浏览器中访问：${C_RESET}\n"
        printf "${C_CYAN}    %s${C_RESET}\n" "$RELEASES_URL"
        exit 0
    fi

    R_CLEAN="${REMOTE_TAG#v}"; R_CLEAN="${R_CLEAN#V}"
    C_CLEAN="${CURRENT_VERSION#v}"; C_CLEAN="${C_CLEAN#V}"

    if [ "$R_CLEAN" != "$C_CLEAN" ] && [ "$(printf "%s\n%s\n" "$C_CLEAN" "$R_CLEAN" | sort -V | tail -n1)" = "$R_CLEAN" ]; then
        echo ""
        ok "发现新版本：${REMOTE_TAG} （当前版本：${CURRENT_VERSION}）"
        printf "${C_GRAY}    发布时间：%s${C_RESET}\n" "$PUBLISHED_AT"
        if [ "$NON_INTERACTIVE" -eq 0 ]; then
            read -r -p "是否在浏览器中打开最新版本下载页面？(Y/N) [默认 Y]: " OPEN_ANS || OPEN_ANS="Y"
            if [ -z "$OPEN_ANS" ] || [[ "$OPEN_ANS" =~ ^[Yy] ]]; then
                open "$HTML_URL" >/dev/null 2>&1 || true
                ok "已调起默认浏览器打开发布页面。"
            fi
        fi
    else
        ok "当前已是最新版本 (${CURRENT_VERSION})，无需更新。"
    fi
    exit 0
fi

# ---------- 定位 Antigravity.app ----------
normalize_app_path() {
    local input="$1"
    input="${input%/}"
    if [ -f "$input" ] && [ "$(basename "$input")" = "app.asar" ]; then
        # /path/to/Antigravity.app/Contents/Resources/app.asar
        echo "$(cd "$(dirname "$input")/../.." && pwd)"
        return 0
    elif [ -d "$input" ] && [ -f "$input/app.asar" ]; then
        # /path/to/Antigravity.app/Contents/Resources
        echo "$(cd "$input/../.." && pwd)"
        return 0
    elif [ -d "$input" ] && [ -f "$input/Contents/Resources/app.asar" ]; then
        echo "$(cd "$input" && pwd)"
        return 0
    fi
    return 1
}

find_antigravity_app() {
    if [ -n "$CUSTOM_APP_PATH" ]; then
        if normalize_app_path "$CUSTOM_APP_PATH"; then
            return 0
        fi
        die "指定的路径下未找到 Contents/Resources/app.asar: $CUSTOM_APP_PATH"
    fi

    local candidates=(
        "/Applications/Antigravity.app"
        "${USER_HOME}/Applications/Antigravity.app"
    )
    for c in "${candidates[@]}"; do
        if [ -f "$c/Contents/Resources/app.asar" ]; then
            echo "$c"
            return 0
        fi
    done

    if command -v mdfind >/dev/null 2>&1; then
        local spot
        spot="$(mdfind "kMDItemCFBundleIdentifier == 'com.google.antigravity'" 2>/dev/null | head -n 1 || true)"
        if [ -n "$spot" ] && [ -f "$spot/Contents/Resources/app.asar" ]; then
            echo "$spot"
            return 0
        fi
    fi

    if [ "$NON_INTERACTIVE" -eq 0 ]; then
        warn "未在默认位置 (/Applications/Antigravity.app) 找到 Antigravity 客户端。"
        read -r -p "请将 Antigravity.app 拖入终端窗口后按回车（或直接回车退出）: " USER_INPUT_PATH || USER_INPUT_PATH=""
        USER_INPUT_PATH="${USER_INPUT_PATH//\\ / }"
        USER_INPUT_PATH="${USER_INPUT_PATH#\'}"
        USER_INPUT_PATH="${USER_INPUT_PATH%\'}"
        USER_INPUT_PATH="${USER_INPUT_PATH#\"}"
        USER_INPUT_PATH="${USER_INPUT_PATH%\"}"
        if [ -n "$USER_INPUT_PATH" ] && normalize_app_path "$USER_INPUT_PATH"; then
            return 0
        fi
    fi

    return 1
}

APP_PATH="$(find_antigravity_app)" || die "未找到 Antigravity.app。请确认已安装官方 Antigravity 客户端。"
RES_DIR="${APP_PATH}/Contents/Resources"
ASAR_PATH="${RES_DIR}/app.asar"
APP_THEME_DIR="${RES_DIR}/custom-theme"
USER_THEME_DIR="${USER_DATA_DIR}/custom-theme"

ok "已定位客户端：${APP_PATH}"

# ---------- 载荷校验 (Fail-Fast) ----------
if [ "$MODE" = "install" ]; then
    for f in "${PAYLOADS[@]}"; do
        if [ ! -f "${SCRIPT_DIR}/${f}" ]; then
            die "缺少主题文件 ${f} —— 请在完整的主题包目录内运行本脚本。"
        fi
    done
fi

# ---------- 目录写权限检查与按需 sudo 提权 ----------
if [ ! -w "$RES_DIR" ] || [ ! -w "$ASAR_PATH" ]; then
    if [ "${EUID:-$(id -u)}" -ne 0 ]; then
        if [ "$NON_INTERACTIVE" -eq 1 ]; then
            die "目标目录没有写权限 (${RES_DIR})，请使用 sudo 运行或修改目录权限。"
        fi
        warn "目标应用目录 (${RES_DIR}) 需要管理员权限写入，正在请求 sudo 授权..."
        exec sudo -E bash "$0" "$@"
    else
        die "无法写入目标文件: ${ASAR_PATH} (请检查 SIP 或文件系统只读状态)"
    fi
fi

# ---------- 选择零依赖 ASAR 处理运行时 (内置 Electron Node -> 系统 Node -> Python 3) ----------
NODE_BIN=""
NODE_ENV_ARGS=()

select_asar_runtime() {
    local electron_candidates=(
        "${APP_PATH}/Contents/MacOS/Antigravity"
        "/Applications/Antigravity.app/Contents/MacOS/Antigravity"
        "${USER_HOME}/Applications/Antigravity.app/Contents/MacOS/Antigravity"
    )
    for bin in "${electron_candidates[@]}"; do
        if [ -x "$bin" ]; then
            if ELECTRON_RUN_AS_NODE=1 ELECTRON_NO_ASAR=1 "$bin" -e "process.exit(0)" >/dev/null 2>&1; then
                NODE_BIN="$bin"
                NODE_ENV_ARGS=("ELECTRON_RUN_AS_NODE=1" "ELECTRON_NO_ASAR=1")
                return 0
            fi
        fi
    done

    if command -v node >/dev/null 2>&1; then
        NODE_BIN="$(command -v node)"
        NODE_ENV_ARGS=("ELECTRON_NO_ASAR=1")
        return 0
    fi

    if command -v python3 >/dev/null 2>&1; then
        NODE_BIN="PYTHON3_FALLBACK"
        return 0
    fi

    die "未找到可用的 Node.js 运行时或 Python 3，无法处理 app.asar。"
}

select_asar_runtime

# ---------- 核心 ASAR 处理引擎 (支持 inspect / inject / strip / verify) ----------
run_asar_engine() {
    local action="$1"
    local target_asar="$2"
    local output_asar="${3:-}"

    if [ "$NODE_BIN" != "PYTHON3_FALLBACK" ]; then
        env "${NODE_ENV_ARGS[@]}" "$NODE_BIN" - "$action" "$target_asar" "$output_asar" <<'NODE_EOF'
process.noAsar = true;
const fs = require('fs');
const crypto = require('crypto');

const [action, targetAsar, outputAsar] = process.argv.slice(2);
const ANCHORS = [
    'void loadHubWindowUrl(win, url, { skipBootstrapMint });',
    'void win.loadURL(url);',
];
const HOOK_START = '/* === Antigravity Custom Theme Hook v1 === */';
const HOOK_END = '/* === End Antigravity Custom Theme Hook === */';
const LEGACY_MARKER = 'custom-theme injection hook';

function findAnchor(text) {
    for (const a of ANCHORS) {
        if (text.includes(a)) return a;
    }
    const m = text.match(/void\s+(?:loadHubWindowUrl\s*\(\s*win\s*,[^;]*|win\.loadURL\s*\([^;]*)\)\s*;/);
    return m ? m[0] : null;
}

const HOOK_BLOCK = `
/* === Antigravity Custom Theme Hook v1 === */
try {
    const path_ = require('path');
    const fs_ = require('fs');
    const _ctCandidates = [
        path_.join(process.resourcesPath || '', 'custom-theme'),
        (typeof electron_1 !== 'undefined' && electron_1.app && typeof electron_1.app.getPath === 'function')
            ? path_.join(electron_1.app.getPath('userData'), 'custom-theme') : '',
        path_.join(process.env.HOME || '', 'Library', 'Application Support', 'Antigravity', 'custom-theme'),
        path_.join(process.env.APPDATA || '', 'Antigravity', 'custom-theme')
    ].filter(Boolean);
    const _ctRead = (name) => {
        for (const _d of _ctCandidates) {
            try {
                const _f = path_.join(_d, name);
                if (fs_.existsSync(_f)) return fs_.readFileSync(_f, 'utf8');
            } catch (e) {}
        }
        return null;
    };
    const _ctInject = () => {
        try {
            if (win.isDestroyed?.() || win.webContents?.isDestroyed?.()) return;
            const _css = _ctRead('current.css');
            if (_css && _css.trim()) win.webContents.insertCSS(_css).catch(() => {});
            const _js = _ctRead('current.js');
            if (_js && _js.trim()) win.webContents.executeJavaScript(_js, true).catch(() => {});
        } catch (e) {}
    };
    win.webContents.on('dom-ready', _ctInject);
    win.webContents.on('did-finish-load', _ctInject);
} catch (e) {}
/* === End Antigravity Custom Theme Hook === */`;

function parseAsar(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`ASAR 文件不存在: ${filePath}`);
    }
    const buf = fs.readFileSync(filePath);
    if (buf.length < 16) {
        throw new Error(`ASAR 文件长度不足 16 字节: ${filePath}`);
    }
    const u0 = buf.readUInt32LE(0);
    const H = buf.readUInt32LE(4);
    const payloadSize = buf.readUInt32LE(8);
    const jsonLen = buf.readUInt32LE(12);
    const dataStart = 8 + H;
    if (u0 !== 4 || jsonLen === 0 || 16 + jsonLen > buf.length || dataStart > buf.length) {
        throw new Error(`ASAR 头部结构无效 (u0=${u0}, H=${H}, jsonLen=${jsonLen}, len=${buf.length})`);
    }
    const jsonStr = buf.toString('utf8', 16, 16 + jsonLen);
    const tree = JSON.parse(jsonStr);
    const utilsNode = tree?.files?.dist?.files?.['utils.js'];
    if (!utilsNode || utilsNode.offset === undefined || utilsNode.size === undefined) {
        throw new Error('ASAR 头部未找到 dist/utils.js 条目');
    }
    const offset = Number(utilsNode.offset);
    const size = Number(utilsNode.size);
    if (offset < 0 || size <= 0 || dataStart + offset + size > buf.length) {
        throw new Error(`dist/utils.js 偏移或大小越界 (offset=${offset}, size=${size})`);
    }
    const content = buf.toString('utf8', dataStart + offset, dataStart + offset + size);
    return { buf, H, payloadSize, jsonLen, dataStart, tree, utilsNode, offset, size, content };
}

function stripHooksFromText(text) {
    let out = text;
    // Strip v1 block comment hook
    out = out.replace(/\r?\n\/\* === Antigravity Custom Theme Hook v\d+ === \*\/[\s\S]*?\/\* === End Antigravity Custom Theme Hook === \*\//g, '');
    out = out.replace(/\/\* === Antigravity Custom Theme Hook v\d+ === \*\/[\s\S]*?\/\* === End Antigravity Custom Theme Hook === \*\/\r?\n?/g, '');
    // Strip legacy Windows line-comment hook
    out = out.replace(/[ \t]*\/\/ === Antigravity custom-theme injection hook(?: v\d+)? \(start\) ===[\s\S]*?\/\/ === Antigravity custom-theme injection hook(?: v\d+)? \(end\) ===\r?\n?/g, '');
    return out;
}

function verifyNodeIntegrity(buf, dataStart, node) {
    const off = Number(node.offset);
    const sz = Number(node.size);
    if (off < 0 || sz < 0 || dataStart + off + sz > buf.length) return false;
    if (!node.integrity) return true;
    const slice = buf.subarray(dataStart + off, dataStart + off + sz);
    const fullHash = crypto.createHash('sha256').update(slice).digest('hex');
    if (fullHash !== String(node.integrity.hash).toLowerCase()) return false;
    const bs = Number(node.integrity.blockSize) || 4194304;
    const blocks = node.integrity.blocks || [];
    const expectedBlocks = sz === 0 ? 0 : Math.ceil(sz / bs);
    if (blocks.length !== expectedBlocks) return false;
    for (let i = 0; i < blocks.length; i++) {
        const bSlice = slice.subarray(i * bs, Math.min((i + 1) * bs, sz));
        const bHash = crypto.createHash('sha256').update(bSlice).digest('hex');
        if (bHash !== String(blocks[i]).toLowerCase()) return false;
    }
    return true;
}

function verifyAllBounds(buf, dataStart, root) {
    let ok = true;
    function walk(n) {
        if (!n || !n.files) return;
        for (const v of Object.values(n.files)) {
            if (v.files) walk(v);
            else if (v.offset !== undefined && v.size !== undefined) {
                const off = Number(v.offset);
                const sz = Number(v.size);
                if (off < 0 || sz < 0 || dataStart + off + sz > buf.length) {
                    ok = false;
                }
            }
        }
    }
    walk(root);
    return ok;
}

function rebuildAsarWithNewUtils(parsed, newUtilsStr) {
    const { buf, dataStart, tree, utilsNode, offset: oldOff, size: oldSize } = parsed;
    const newUtilsBuf = Buffer.from(newUtilsStr, 'utf8');
    const delta = newUtilsBuf.length - oldSize;

    utilsNode.size = newUtilsBuf.length;
    const bs = (utilsNode.integrity && Number(utilsNode.integrity.blockSize)) || 4194304;
    const blocks = [];
    for (let i = 0; i < newUtilsBuf.length; i += bs) {
        blocks.push(
            crypto.createHash('sha256')
                .update(newUtilsBuf.subarray(i, Math.min(i + bs, newUtilsBuf.length)))
                .digest('hex')
        );
    }
    utilsNode.integrity = {
        algorithm: 'SHA256',
        hash: crypto.createHash('sha256').update(newUtilsBuf).digest('hex'),
        blockSize: bs,
        blocks
    };

    function shiftOffsets(node) {
        if (!node || !node.files) return;
        for (const v of Object.values(node.files)) {
            if (v.files) shiftOffsets(v);
            else if (v.offset !== undefined && Number(v.offset) > oldOff) {
                v.offset = String(Number(v.offset) + delta);
            }
        }
    }
    shiftOffsets(tree);

    const newJsonBuf = Buffer.from(JSON.stringify(tree), 'utf8');
    const pad = (4 - (newJsonBuf.length % 4)) % 4;
    const newPayloadSize = 4 + newJsonBuf.length + pad;
    const newH = 8 + newJsonBuf.length + pad;
    const headerBuf = Buffer.alloc(16 + newJsonBuf.length + pad, 0);
    headerBuf.writeUInt32LE(4, 0);
    headerBuf.writeUInt32LE(newH, 4);
    headerBuf.writeUInt32LE(newPayloadSize, 8);
    headerBuf.writeUInt32LE(newJsonBuf.length, 12);
    newJsonBuf.copy(headerBuf, 16);

    return Buffer.concat([
        headerBuf,
        buf.subarray(dataStart, dataStart + oldOff),
        newUtilsBuf,
        buf.subarray(dataStart + oldOff + oldSize)
    ]);
}

try {
    const parsed = parseAsar(targetAsar);
    const hasV1Hook = parsed.content.includes(HOOK_START) && parsed.content.includes(HOOK_END);
    const hasLegacyHook = parsed.content.includes(LEGACY_MARKER);
    const hasAnchor = Boolean(findAnchor(parsed.content));

    if (action === 'inspect') {
        if (!hasAnchor) {
            console.error('ANCHOR_MISSING');
            process.exit(2);
        }
        if (hasV1Hook) {
            console.log('PATCHED_V1');
        } else if (hasLegacyHook) {
            console.log('PATCHED_LEGACY');
        } else {
            console.log('CLEAN');
        }
        process.exit(0);
    }

    if (action === 'verify-patched') {
        const integrityOk = verifyNodeIntegrity(parsed.buf, parsed.dataStart, parsed.utilsNode);
        const boundsOk = verifyAllBounds(parsed.buf, parsed.dataStart, parsed.tree);
        const hasCandidates = parsed.content.includes('_ctCandidates') && parsed.content.includes("require('path')") && parsed.content.includes("app.getPath('userData')");
        if (hasV1Hook && hasAnchor && hasCandidates && integrityOk && boundsOk) {
            console.log('VERIFY_OK');
            process.exit(0);
        }
        console.error(`VERIFY_FAILED: hook=${hasV1Hook} anchor=${hasAnchor} candidates=${hasCandidates} integrity=${integrityOk} bounds=${boundsOk}`);
        process.exit(1);
    }

    if (action === 'verify-clean') {
        const integrityOk = verifyNodeIntegrity(parsed.buf, parsed.dataStart, parsed.utilsNode);
        const boundsOk = verifyAllBounds(parsed.buf, parsed.dataStart, parsed.tree);
        if (!hasV1Hook && !hasLegacyHook && hasAnchor && integrityOk && boundsOk) {
            console.log('CLEAN_OK');
            process.exit(0);
        }
        console.error(`CLEAN_VERIFY_FAILED: v1=${hasV1Hook} legacy=${hasLegacyHook} anchor=${hasAnchor} integrity=${integrityOk} bounds=${boundsOk}`);
        process.exit(1);
    }

    if (action === 'strip') {
        if (!outputAsar) throw new Error('strip 需要提供输出文件路径');
        const cleanUtils = stripHooksFromText(parsed.content);
        if (cleanUtils.includes(HOOK_START) || cleanUtils.includes(LEGACY_MARKER)) {
            throw new Error('剥离旧版钩子失败，内容仍有残留标记');
        }
        const outBuf = rebuildAsarWithNewUtils(parsed, cleanUtils);
        fs.writeFileSync(outputAsar, outBuf);
        const check = parseAsar(outputAsar);
        if (!verifyNodeIntegrity(check.buf, check.dataStart, check.utilsNode) || !verifyAllBounds(check.buf, check.dataStart, check.tree)) {
            throw new Error('剥离后的 ASAR 完整性校验未通过');
        }
        console.log('STRIP_OK');
        process.exit(0);
    }

    if (action === 'inject') {
        if (!outputAsar) throw new Error('inject 需要提供输出文件路径');
        const cleanUtils = stripHooksFromText(parsed.content);
        const matchedAnchor = findAnchor(cleanUtils);
        if (!matchedAnchor) {
            throw new Error('未找到注入锚点（loadHubWindowUrl / win.loadURL）');
        }
        const newUtils = cleanUtils.replace(matchedAnchor, matchedAnchor + HOOK_BLOCK);
        const outBuf = rebuildAsarWithNewUtils(parsed, newUtils);
        fs.writeFileSync(outputAsar, outBuf);
        const check = parseAsar(outputAsar);
        if (!check.content.includes(HOOK_START) || !verifyNodeIntegrity(check.buf, check.dataStart, check.utilsNode) || !verifyAllBounds(check.buf, check.dataStart, check.tree)) {
            throw new Error('注入后的临时 ASAR 完整性校验未通过');
        }
        console.log(`INJECT_OK:${outBuf.length - parsed.buf.length}`);
        process.exit(0);
    }

    throw new Error(`未知操作: ${action}`);
} catch (err) {
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
}
NODE_EOF
    else
        python3 - "$action" "$target_asar" "$output_asar" <<'PY_EOF'
import sys, os, json, struct, hashlib, re

action = sys.argv[1]
target_asar = sys.argv[2]
output_asar = sys.argv[3] if len(sys.argv) > 3 else ""

ANCHORS = [
    "void loadHubWindowUrl(win, url, { skipBootstrapMint });",
    "void win.loadURL(url);",
]
HOOK_START = "/* === Antigravity Custom Theme Hook v1 === */"
HOOK_END = "/* === End Antigravity Custom Theme Hook === */"
LEGACY_MARKER = "custom-theme injection hook"

def find_anchor(text):
    for a in ANCHORS:
        if a in text:
            return a
    m = re.search(r"void\s+(?:loadHubWindowUrl\s*\(\s*win\s*,[^;]*|win\.loadURL\s*\([^;]*)\)\s*;", text)
    return m.group(0) if m else None

HOOK_BLOCK = """
/* === Antigravity Custom Theme Hook v1 === */
try {
    const path_ = require('path');
    const fs_ = require('fs');
    const _ctCandidates = [
        path_.join(process.resourcesPath || '', 'custom-theme'),
        (typeof electron_1 !== 'undefined' && electron_1.app && typeof electron_1.app.getPath === 'function')
            ? path_.join(electron_1.app.getPath('userData'), 'custom-theme') : '',
        path_.join(process.env.HOME || '', 'Library', 'Application Support', 'Antigravity', 'custom-theme'),
        path_.join(process.env.APPDATA || '', 'Antigravity', 'custom-theme')
    ].filter(Boolean);
    const _ctRead = (name) => {
        for (const _d of _ctCandidates) {
            try {
                const _f = path_.join(_d, name);
                if (fs_.existsSync(_f)) return fs_.readFileSync(_f, 'utf8');
            } catch (e) {}
        }
        return null;
    };
    const _ctInject = () => {
        try {
            if (win.isDestroyed?.() || win.webContents?.isDestroyed?.()) return;
            const _css = _ctRead('current.css');
            if (_css && _css.trim()) win.webContents.insertCSS(_css).catch(() => {});
            const _js = _ctRead('current.js');
            if (_js && _js.trim()) win.webContents.executeJavaScript(_js, true).catch(() => {});
        } catch (e) {}
    };
    win.webContents.on('dom-ready', _ctInject);
    win.webContents.on('did-finish-load', _ctInject);
} catch (e) {}
/* === End Antigravity Custom Theme Hook === */"""

def parse_asar(path):
    with open(path, "rb") as f:
        buf = f.read()
    u0, H, payload_size, json_len = struct.unpack("<IIII", buf[:16])
    data_start = 8 + H
    tree = json.loads(buf[16:16+json_len].decode("utf-8"))
    u_node = tree["files"]["dist"]["files"]["utils.js"]
    off = int(u_node["offset"])
    sz = int(u_node["size"])
    content = buf[data_start+off:data_start+off+sz].decode("utf-8")
    return buf, data_start, tree, u_node, off, sz, content

def strip_hooks(text):
    out = re.sub(r"\r?\n/\* === Antigravity Custom Theme Hook v\d+ === \*/[\s\S]*?/\* === End Antigravity Custom Theme Hook === \*/", "", text)
    out = re.sub(r"/\* === Antigravity Custom Theme Hook v\d+ === \*/[\s\S]*?/\* === End Antigravity Custom Theme Hook === \*/\r?\n?", "", out)
    out = re.sub(r"[ \t]*// === Antigravity custom-theme injection hook(?: v\d+)? \(start\) ===[\s\S]*?// === Antigravity custom-theme injection hook(?: v\d+)? \(end\) ===\r?\n?", "", out)
    return out

def rebuild_asar(buf, data_start, tree, u_node, old_off, old_sz, new_str):
    new_bytes = new_str.encode("utf-8")
    delta = len(new_bytes) - old_sz
    u_node["size"] = len(new_bytes)
    bs = int(u_node.get("integrity", {}).get("blockSize", 4194304)) or 4194304
    blocks = [hashlib.sha256(new_bytes[i:i+bs]).hexdigest() for i in range(0, len(new_bytes), bs)]
    u_node["integrity"] = {
        "algorithm": "SHA256",
        "hash": hashlib.sha256(new_bytes).hexdigest(),
        "blockSize": bs,
        "blocks": blocks
    }
    def shift(node):
        if "files" not in node:
            return
        for v in node["files"].values():
            if "files" in v:
                shift(v)
            elif "offset" in v and int(v["offset"]) > old_off:
                v["offset"] = str(int(v["offset"]) + delta)
    shift(tree)
    new_json = json.dumps(tree, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    pad = (4 - (len(new_json) % 4)) % 4
    new_payload = 4 + len(new_json) + pad
    new_H = 8 + len(new_json) + pad
    hdr = struct.pack("<IIII", 4, new_H, new_payload, len(new_json)) + new_json + (b"\x00" * pad)
    return hdr + buf[data_start:data_start+old_off] + new_bytes + buf[data_start+old_off+old_sz:]

buf, data_start, tree, u_node, off, sz, content = parse_asar(target_asar)
has_v1 = HOOK_START in content and HOOK_END in content
has_legacy = LEGACY_MARKER in content
has_anchor = find_anchor(content) is not None

if action == "inspect":
    if not has_anchor:
        sys.exit(2)
    print("PATCHED_V1" if has_v1 else ("PATCHED_LEGACY" if has_legacy else "CLEAN"))
elif action == "verify-patched":
    if has_v1 and has_anchor and "_ctCandidates" in content:
        print("VERIFY_OK")
        sys.exit(0)
    sys.exit(1)
elif action == "verify-clean":
    if not has_v1 and not has_legacy and has_anchor:
        print("CLEAN_OK")
        sys.exit(0)
    sys.exit(1)
elif action == "strip":
    clean_u = strip_hooks(content)
    out = rebuild_asar(buf, data_start, tree, u_node, off, sz, clean_u)
    with open(output_asar, "wb") as f:
        f.write(out)
    print("STRIP_OK")
elif action == "inject":
    clean_u = strip_hooks(content)
    matched_anchor = find_anchor(clean_u)
    if not matched_anchor:
        raise RuntimeError("未找到注入锚点（loadHubWindowUrl / win.loadURL）")
    new_u = clean_u.replace(matched_anchor, matched_anchor + HOOK_BLOCK, 1)
    out = rebuild_asar(buf, data_start, tree, u_node, off, sz, new_u)
    with open(output_asar, "wb") as f:
        f.write(out)
    print(f"INJECT_OK:{len(out) - len(buf)}")
PY_EOF
    fi
}

# ---------- 检测并优雅关闭运行中的 Antigravity 进程 ----------
WAS_RUNNING=0
check_and_quit_running_app() {
    local pids=()
    while IFS= read -r p; do
        [ -n "$p" ] && pids+=("$p")
    done < <(pgrep -f "${APP_PATH}/Contents/MacOS/Antigravity" 2>/dev/null || true)

    if [ "${#pids[@]}" -eq 0 ]; then
        return 0
    fi

    WAS_RUNNING=1
    if [ "$NON_INTERACTIVE" -eq 1 ]; then
        info "非交互模式 (--non-interactive)：保持当前运行中的 Antigravity 会话不中断，下次重启客户端即生效。"
        return 0
    fi

    warn "检测到目标 Antigravity 正在运行（${#pids[@]} 个关联进程）。"
    read -r -p "是否自动关闭它并继续？(Y/N) [默认 Y]: " QUIT_ANS || QUIT_ANS="Y"
    if [ -z "$QUIT_ANS" ] || [[ "$QUIT_ANS" =~ ^[Yy] ]]; then
        info "正在请求 Antigravity 优雅退出..."
        osascript -e 'tell application "Antigravity" to quit' >/dev/null 2>&1 || true
        for _ in {1..20}; do
            if ! pgrep -f "${APP_PATH}/Contents/MacOS/Antigravity" >/dev/null 2>&1; then
                break
            fi
            sleep 0.25
        done
        if pgrep -f "${APP_PATH}/Contents/MacOS/Antigravity" >/dev/null 2>&1; then
            pkill -TERM -f "${APP_PATH}/Contents/MacOS/Antigravity" 2>/dev/null || true
            for _ in {1..12}; do
                if ! pgrep -f "${APP_PATH}/Contents/MacOS/Antigravity" >/dev/null 2>&1; then
                    break
                fi
                sleep 0.25
            done
        fi
        ok "已关闭 Antigravity"
    else
        die "请手动关闭 Antigravity 后重新运行本脚本。"
    fi
}

check_and_quit_running_app

# ---------- 卸载流程 ----------
if [ "$MODE" = "uninstall" ]; then
    info "正在执行卸载与原厂状态还原..."
    ASAR_STATE="$(run_asar_engine inspect "$ASAR_PATH" || echo "ERROR")"

    if [ -f "$BACKUP_PATH" ]; then
        BACKUP_STATE="$(run_asar_engine inspect "$BACKUP_PATH" || echo "ERROR")"
        if [ "$ASAR_STATE" = "CLEAN" ]; then
            warn "当前 app.asar 未检测到主题钩子（客户端可能已升级），跳过备份覆盖以避免版本降级。"
            rm -f "$BACKUP_PATH"
        elif [ "$BACKUP_STATE" = "CLEAN" ]; then
            TMP_RESTORE="${ASAR_PATH}.restore.tmp"
            cp -f "$BACKUP_PATH" "$TMP_RESTORE"
            if run_asar_engine verify-clean "$TMP_RESTORE" >/dev/null 2>&1; then
                mv -f "$TMP_RESTORE" "$ASAR_PATH"
                rm -f "$BACKUP_PATH"
                ok "已从原厂备份还原 app.asar 并清理备份 (${BACKUP_PATH})"
            else
                rm -f "$TMP_RESTORE"
                die "备份文件校验异常，已取消还原。"
            fi
        else
            warn "备份文件含钩子或状态异常，正在通过逆向剥离引擎直接还原原厂 app.asar..."
            TMP_RESTORE="${ASAR_PATH}.restore.tmp"
            run_asar_engine strip "$ASAR_PATH" "$TMP_RESTORE" >/dev/null
            mv -f "$TMP_RESTORE" "$ASAR_PATH"
            rm -f "$BACKUP_PATH"
            ok "已通过逆向剥离引擎还原原厂 app.asar"
        fi
    else
        if [[ "$ASAR_STATE" == PATCHED_* ]]; then
            info "未找到外部备份文件，正在通过逆向剥离自愈引擎无损还原原厂 app.asar..."
            TMP_RESTORE="${ASAR_PATH}.restore.tmp"
            run_asar_engine strip "$ASAR_PATH" "$TMP_RESTORE" >/dev/null
            mv -f "$TMP_RESTORE" "$ASAR_PATH"
            ok "已无损剥离主题钩子并恢复原厂 app.asar（字节级一致）"
        else
            ok "当前 app.asar 已是原厂纯净状态"
        fi
    fi

    if [ -d "$APP_THEME_DIR" ]; then
        rm -rf "$APP_THEME_DIR"
        ok "已删除 ${APP_THEME_DIR}"
    fi

    # 若操作的是真实应用目录（非 /tmp 沙盒），同步清理用户目录中的 custom-theme
    case "$APP_PATH" in
        /tmp/*|/var/folders/*)
            ;;
        *)
            if [ -d "$USER_THEME_DIR" ]; then
                rm -rf "$USER_THEME_DIR"
                ok "已删除 ${USER_THEME_DIR}"
            fi
            ;;
    esac

    echo ""
    ok "卸载完成。重启 Antigravity 即恢复原版外观。"
    exit 0
fi

# ---------- 安装流程：1) 预检 app.asar ----------
ASAR_STATE="$(run_asar_engine inspect "$ASAR_PATH")" || die "解析 app.asar 失败或未找到注入锚点（客户端结构可能已变化），已取消修改。"

# ---------- 安装流程：2) 原厂备份与逆向剥离自愈 ----------
mkdir -p "$BACKUP_DIR"
fix_user_ownership "$BACKUP_DIR"

if [ "$ASAR_STATE" = "CLEAN" ]; then
    if [ -f "$BACKUP_PATH" ]; then
        CUR_HASH="$(shasum -a 256 "$ASAR_PATH" | awk '{print $1}')"
        BAK_HASH="$(shasum -a 256 "$BACKUP_PATH" | awk '{print $1}')"
        if [ "$CUR_HASH" != "$BAK_HASH" ]; then
            cp -f "$ASAR_PATH" "$BACKUP_PATH"
            fix_user_ownership "$BACKUP_PATH"
            ok "检测到客户端版本已更新，已同步刷新原厂备份 -> ${BACKUP_PATH}"
        else
            ok "原厂备份已存在且哈希一致 -> ${BACKUP_PATH}"
        fi
    else
        cp -f "$ASAR_PATH" "$BACKUP_PATH"
        fix_user_ownership "$BACKUP_PATH"
        ok "已备份原版 app.asar -> ${BACKUP_PATH}"
    fi
else
    # 当前 app.asar 已含钩子：检查备份是否存在且纯净，若缺失则执行逆向剥离自愈生成原厂备份
    NEED_HEAL=0
    if [ ! -f "$BACKUP_PATH" ]; then
        NEED_HEAL=1
    else
        BAK_STATE="$(run_asar_engine inspect "$BACKUP_PATH" 2>/dev/null || echo "ERROR")"
        if [ "$BAK_STATE" != "CLEAN" ]; then
            NEED_HEAL=1
        fi
    fi

    if [ "$NEED_HEAL" -eq 1 ]; then
        info "检测到 app.asar 已注入但原厂备份缺失，正在执行逆向剥离自愈重建备份..."
        TMP_STOCK="${BACKUP_PATH}.tmp"
        run_asar_engine strip "$ASAR_PATH" "$TMP_STOCK" >/dev/null
        mv -f "$TMP_STOCK" "$BACKUP_PATH"
        fix_user_ownership "$BACKUP_PATH"
        ok "已通过自愈引擎重建原厂纯净备份 -> ${BACKUP_PATH}"
    else
        ok "原厂纯净备份校验正常 -> ${BACKUP_PATH}"
    fi
fi

# ---------- 安装流程：3) 分发主题文件到双目录 ----------
mkdir -p "$APP_THEME_DIR"
mkdir -p "$USER_THEME_DIR"
for f in "${PAYLOADS[@]}"; do
    cp -f "${SCRIPT_DIR}/${f}" "${APP_THEME_DIR}/${f}"
    cp -f "${SCRIPT_DIR}/${f}" "${USER_THEME_DIR}/${f}"
done
fix_user_ownership "$USER_DATA_DIR"
ok "主题文件已分发至双目录:"
printf "${C_GRAY}    1) %s${C_RESET}\n" "$APP_THEME_DIR"
printf "${C_GRAY}    2) %s${C_RESET}\n" "$USER_THEME_DIR"

# ---------- 安装流程：4) 注入跨平台 Hook 到 app.asar (保留 Info.plist 与签名不动) ----------
TMP_ASAR="${ASAR_PATH}.tmp"
rm -f "$TMP_ASAR"

if INJECT_OUT="$(run_asar_engine inject "$ASAR_PATH" "$TMP_ASAR")"; then
    if run_asar_engine verify-patched "$TMP_ASAR" >/dev/null 2>&1; then
        mv -f "$TMP_ASAR" "$ASAR_PATH"
        DELTA_BYTES="${INJECT_OUT#INJECT_OK:}"
        ok "app.asar 注入完成（净增 ${DELTA_BYTES} 字节，保留原始 Info.plist 与 Mach-O 签名）"
    else
        rm -f "$TMP_ASAR"
        die "临时文件 app.asar.tmp 完整性自检失败，已取消替换。"
    fi
else
    rm -f "$TMP_ASAR"
    die "构建 app.asar 补丁失败。"
fi

# ---------- 安装流程：5) 最终线上只读自检 ----------
if run_asar_engine verify-patched "$ASAR_PATH" >/dev/null 2>&1; then
    ok "最终自检通过：跨平台 Hook 已就绪且 SHA256 整包与 4MB 分块哈希一致"
else
    if [ -f "$BACKUP_PATH" ]; then
        cp -f "$BACKUP_PATH" "$ASAR_PATH" || true
        warn "已从原厂备份自动回滚 app.asar。"
    fi
    die "最终自检未通过，已回滚修改。"
fi

echo ""
printf "${C_CYAN}================ 安装完成 ================${C_RESET}\n"
echo " 启动或重启 Antigravity，点击右上角胶囊按钮即可切换 10 款主题。"
echo " 卸载方式：双击 uninstall.command 或运行 ./install.sh --uninstall"
printf "${C_CYAN}==========================================${C_RESET}\n"

if [ "$NON_INTERACTIVE" -eq 0 ] && [ "$WAS_RUNNING" -eq 1 ]; then
    read -r -p "是否立即重新启动 Antigravity？(Y/N) [默认 Y]: " RELAUNCH_ANS || RELAUNCH_ANS="Y"
    if [ -z "$RELAUNCH_ANS" ] || [[ "$RELAUNCH_ANS" =~ ^[Yy] ]]; then
        open "$APP_PATH" >/dev/null 2>&1 || true
        ok "已启动 Antigravity"
    fi
fi
