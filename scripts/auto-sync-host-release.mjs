#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAsarFile } from './check-antigravity-upstream.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const CURRENT_JS_PATH = path.join(ROOT, 'current.js');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

export function bumpPatchVersion(versionTag) {
    const clean = String(versionTag || '').trim().replace(/^[vV]/, '').split('-')[0];
    const parts = clean.split('.').map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
        throw new Error(`无法解析语义化版本号: ${versionTag}`);
    }
    return `v${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

/**
 * Scan dist/utils.js content from an official app.asar to auto-discover
 * a new hub window URL loading statement if Google slightly changed arguments.
 */
export function autoDiscoverAnchor(utilsContent, existingAnchors = []) {
    const text = String(utilsContent || '');
    for (const a of existingAnchors) {
        if (text.includes(a)) return { anchor: a, isNew: false };
    }

    const patterns = [
        /(?:void\s+|await\s+)?loadHubWindowUrl\s*\(\s*win\s*,[^;]+\)\s*;/,
        /(?:void\s+|await\s+)?[a-zA-Z0-9_$]*[Ll]oad[a-zA-Z0-9_$]*WindowUrl\s*\(\s*win\s*,[^;]+\)\s*;/,
        /(?:void\s+|await\s+)?win\.loadURL\s*\([^;]+\)\s*;/
    ];

    for (const re of patterns) {
        const m = text.match(re);
        if (m && m[0]) {
            const candidate = m[0].trim();
            return { anchor: candidate, isNew: !existingAnchors.includes(candidate) };
        }
    }
    return { anchor: null, isNew: false };
}

export function extractUtilsFromAsar(asarPath) {
    const buf = fs.readFileSync(asarPath);
    const H = buf.readUInt32LE(4);
    const jsonLen = buf.readUInt32LE(12);
    const dataStart = 8 + H;
    const tree = JSON.parse(buf.toString('utf8', 16, 16 + jsonLen));
    const uNode = tree?.files?.dist?.files?.['utils.js'];
    if (!uNode) throw new Error('ASAR 中未找到 dist/utils.js');
    return buf.toString('utf8', dataStart + Number(uNode.offset), dataStart + Number(uNode.offset) + Number(uNode.size));
}

export function applyRepoVersionSync({
    newThemeVersion,
    hostVersion,
    buildId = '',
    matchedAnchor = '',
    newAnchorAdded = false,
    rootDir = ROOT
}) {
    const manifestFile = path.join(rootDir, 'manifest.json');
    const currentJsFile = path.join(rootDir, 'current.js');
    const changelogFile = path.join(rootDir, 'CHANGELOG.md');

    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    manifest.version = newThemeVersion;
    manifest.verifiedHostVersion = hostVersion;
    if (newAnchorAdded && matchedAnchor && !manifest.anchors.includes(matchedAnchor)) {
        manifest.anchors.unshift(matchedAnchor);
    }
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    const jsText = fs.readFileSync(currentJsFile, 'utf8');
    const updatedJs = jsText.replace(
        /const\s+THEME_PACK_VERSION\s*=\s*'[^']+';/,
        `const THEME_PACK_VERSION = '${newThemeVersion}';`
    );
    fs.writeFileSync(currentJsFile, updatedJs, 'utf8');

    if (fs.existsSync(changelogFile)) {
        const cl = fs.readFileSync(changelogFile, 'utf8');
        if (!cl.includes(`## [${newThemeVersion}]`)) {
            const dateStr = new Date().toISOString().slice(0, 10);
            const anchorNote = newAnchorAdded
                ? `- **自动适配新版注入锚点**：自动探测并新增对 Antigravity \`${hostVersion}\` 注入锚点 \`${matchedAnchor}\` 的支持。`
                : `- **宿主版本兼容认证**：云端自动提取官方 Antigravity \`${hostVersion}\`${buildId ? ` (\`${buildId}\`)` : ''} 真实 \`app.asar\` 完成注入、分块哈希与字节级剥离回归验证（命中锚点：\`${matchedAnchor || 'loadHubWindowUrl'}\`）。`;

            const entry = [
                `## [${newThemeVersion}] - ${dateStr}`,
                '',
                '### ✨ 宿主升级自动同步与兼容验证 (Automated Host Sync)',
                anchorNote,
                '',
                '---',
                ''
            ].join('\n');

            const firstHeaderIdx = cl.search(/^##\s+\[/m);
            const updatedCl =
                firstHeaderIdx >= 0
                    ? cl.slice(0, firstHeaderIdx) + entry + '\n' + cl.slice(firstHeaderIdx)
                    : cl.trimEnd() + '\n\n' + entry;
            fs.writeFileSync(changelogFile, updatedCl, 'utf8');
        }
    }
}

function runCli() {
    const args = process.argv.slice(2);
    const asarIdx = args.indexOf('--asar');
    const hostVerIdx = args.indexOf('--host-version');
    const buildIdIdx = args.indexOf('--build-id');

    const asarPath = asarIdx >= 0 ? args[asarIdx + 1] : '';
    const hostVersion = hostVerIdx >= 0 ? args[hostVerIdx + 1] : '';
    const buildId = buildIdIdx >= 0 ? args[buildIdIdx + 1] : '';

    if (!asarPath || !hostVersion) {
        console.error('用法: node scripts/auto-sync-host-release.mjs --asar <path> --host-version <ver> [--build-id <id>]');
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    let verification = verifyAsarFile(asarPath);
    let newAnchorAdded = false;

    if (!verification.compatible) {
        const utilsText = extractUtilsFromAsar(asarPath);
        const discovered = autoDiscoverAnchor(utilsText, manifest.anchors || []);
        if (discovered.anchor && discovered.isNew) {
            manifest.anchors.unshift(discovered.anchor);
            fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
            verification = verifyAsarFile(asarPath);
            if (verification.compatible) {
                newAnchorAdded = true;
            } else {
                // Rollback if still incompatible
                manifest.anchors.shift();
                fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
            }
        }
    }

    if (!verification.compatible) {
        console.log(
            JSON.stringify(
                {
                    compatible: false,
                    autoAdapted: false,
                    hostVersion,
                    buildId,
                    verification
                },
                null,
                2
            )
        );
        process.exit(2);
    }

    const oldVersion = manifest.version;
    const newVersion = bumpPatchVersion(oldVersion);
    const matchedAnchor = verification.doctor?.matchedAnchor || '';

    applyRepoVersionSync({
        newThemeVersion: newVersion,
        hostVersion,
        buildId,
        matchedAnchor,
        newAnchorAdded
    });

    console.log(
        JSON.stringify(
            {
                compatible: true,
                autoAdapted: newAnchorAdded,
                oldThemeVersion: oldVersion,
                newThemeVersion: newVersion,
                hostVersion,
                buildId,
                matchedAnchor,
                verification
            },
            null,
            2
        )
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    runCli();
}
