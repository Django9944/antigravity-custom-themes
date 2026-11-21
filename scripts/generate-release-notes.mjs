#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

export function extractChangelogSection(changelogText, tag) {
    const cleanTag = String(tag || '').trim();
    if (!cleanTag || !changelogText) return '';
    const escaped = cleanTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerRe = new RegExp(`^##\\s+\\[${escaped}\\][^\\r\\n]*\\r?\\n`, 'm');
    const match = headerRe.exec(changelogText);
    if (!match) return '';

    const startIdx = match.index + match[0].length;
    const rest = changelogText.slice(startIdx);
    const nextHeader = rest.search(/^##\s+\[/m);
    const rawBody = nextHeader >= 0 ? rest.slice(0, nextHeader) : rest;
    return rawBody.trim().replace(/(?:\r?\n---\s*)+$/, '').trim();
}

export function formatConventionalCommits(commitLines) {
    const groups = {
        feat: { title: '### ✨ 新增特性 (Features)', items: [] },
        fix: { title: '### 🐛 问题修复 (Bug Fixes)', items: [] },
        style: { title: '### 🎨 视觉与交互打磨 (UI & Style)', items: [] },
        refactor: { title: '### 🔧 架构与自动化维护 (Architecture & Automation)', items: [] },
        docs: { title: '### 📝 文档更新 (Documentation)', items: [] },
        other: { title: '### 📦 其他变更 (Other Changes)', items: [] }
    };

    for (const raw of commitLines) {
        const line = String(raw || '').trim();
        if (!line) continue;
        // Expected format: "<sha>|<subject>" or plain "<subject>"
        const parts = line.includes('|') ? line.split('|') : ['', line];
        const sha = parts[0].trim();
        const subject = parts.slice(1).join('|').trim();
        const suffix = sha ? ` (\`${sha}\`)` : '';

        const m = subject.match(/^([a-zA-Z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/);
        if (m) {
            const type = m[1].toLowerCase();
            const scope = m[2] ? `**${m[2]}**: ` : '';
            const desc = m[3].trim();
            const entry = `- ${scope}${desc}${suffix}`;
            if (type === 'feat') groups.feat.items.push(entry);
            else if (type === 'fix') groups.fix.items.push(entry);
            else if (type === 'style' || type === 'perf') groups.style.items.push(entry);
            else if (type === 'refactor' || type === 'chore' || type === 'ci' || type === 'test') groups.refactor.items.push(entry);
            else if (type === 'docs') groups.docs.items.push(entry);
            else groups.other.items.push(entry);
        } else {
            groups.other.items.push(`- ${subject}${suffix}`);
        }
    }

    const sections = [];
    for (const g of Object.values(groups)) {
        if (g.items.length > 0) {
            sections.push(`${g.title}\n${g.items.join('\n')}`);
        }
    }
    return sections.join('\n\n');
}

function getGitTags() {
    const res = spawnSync('git', ['tag', '--sort=-creatordate'], { cwd: ROOT, encoding: 'utf8' });
    if (res.status !== 0) return [];
    return res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function getPreviousTag(currentTag) {
    const tags = getGitTags();
    const idx = tags.indexOf(currentTag);
    if (idx >= 0 && idx + 1 < tags.length) return tags[idx + 1];
    if (idx < 0 && tags.length > 0) return tags[0];
    return '';
}

function getCommitsBetween(prevTag, currentRef) {
    const range = prevTag ? `${prevTag}..${currentRef}` : currentRef;
    const res = spawnSync('git', ['log', range, '--pretty=format:%h|%s'], { cwd: ROOT, encoding: 'utf8' });
    if (res.status !== 0 || !res.stdout.trim()) return [];
    return res.stdout.split(/\r?\n/).filter(Boolean);
}

export function generateReleaseNotes({ tag, sumsFile = '' }) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const repo = manifest.repo || 'Django9944/antigravity-custom-themes';
    const targetTag = tag || manifest.version;
    const changelogText = fs.existsSync(CHANGELOG_PATH) ? fs.readFileSync(CHANGELOG_PATH, 'utf8') : '';

    let descriptionBody = extractChangelogSection(changelogText, targetTag);

    const prevTag = getPreviousTag(targetTag);
    const refExists = spawnSync('git', ['rev-parse', '--verify', targetTag], { cwd: ROOT, encoding: 'utf8' }).status === 0;
    const commitLines = getCommitsBetween(prevTag, refExists ? targetTag : 'HEAD');
    const autoCommitBody = formatConventionalCommits(commitLines);

    if (!descriptionBody) {
        descriptionBody = autoCommitBody || '- 常规维护与主题体验优化。';
    } else if (autoCommitBody) {
        descriptionBody += `\n\n<details>\n<summary><strong>📋 提交明细 (Commit Log)</strong></summary>\n\n${autoCommitBody}\n\n</details>`;
    }

    let sumsSection = '';
    if (sumsFile && fs.existsSync(sumsFile)) {
        const sumsContent = fs.readFileSync(sumsFile, 'utf8').trim();
        if (sumsContent) {
            sumsSection = `\n### 🔒 SHA256 完整性校验 (Checksums)\n\`\`\`text\n${sumsContent}\n\`\`\`\n`;
        }
    }

    const compareLine = prevTag
        ? `\n**Full Changelog**: https://github.com/${repo}/compare/${prevTag}...${targetTag}\n`
        : '';

    return [
        `## Antigravity Custom Themes \`${targetTag}\``,
        '',
        descriptionBody,
        '',
        '### 🚀 快速更新与安装 (Quick Update & Install)',
        '- **已安装用户一键在线更新**：',
        '  - **macOS**：双击 `检查更新.command` 或运行 `./install.sh --update`',
        '  - **Windows**：双击 `检查更新.bat` 或运行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1 -Update`',
        '- **全新安装**：',
        `  - **macOS**：下载 \`antigravity-custom-themes-${targetTag}-macos.zip\` 解压，运行 \`xattr -cr . && chmod +x install.sh *.command\` 后双击 \`install.command\``,
        `  - **Windows**：下载 \`antigravity-custom-themes-${targetTag}-windows.zip\` 解压，双击 \`install.bat\``,
        sumsSection.trimEnd(),
        compareLine.trimEnd()
    ]
        .filter((part) => part !== '')
        .join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    const args = process.argv.slice(2);
    const outIdx = args.indexOf('--out');
    let outFile = '';
    if (outIdx >= 0) {
        outFile = args[outIdx + 1] || '';
        args.splice(outIdx, 2);
    }
    const tag = args[0] || '';
    const sumsFile = args[1] || '';
    const notes = generateReleaseNotes({ tag, sumsFile });
    if (outFile) {
        fs.writeFileSync(outFile, notes, 'utf8');
    } else {
        console.log(notes);
    }
}
