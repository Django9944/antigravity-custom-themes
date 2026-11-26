#!/usr/bin/env node
'use strict';

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseElectronUpdaterYaml, verifyAsarFile } from '../scripts/check-antigravity-upstream.mjs';
import { extractChangelogSection, formatConventionalCommits } from '../scripts/generate-release-notes.mjs';
import { bumpPatchVersion, autoDiscoverAnchor } from '../scripts/auto-sync-host-release.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PATCHER = path.join(ROOT, 'core', 'asar-patcher.js');
const UPDATER = path.join(ROOT, 'core', 'updater.js');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function buildIntegrity(buf, blockSize = 4194304) {
    const blocks = [];
    for (let i = 0; i < buf.length; i += blockSize) {
        blocks.push(sha256(buf.subarray(i, Math.min(i + blockSize, buf.length))));
    }
    return {
        algorithm: 'SHA256',
        hash: sha256(buf),
        blockSize,
        blocks
    };
}

/**
 * Build a spec-compliant Electron ASAR archive with files before and after dist/utils.js
 * so offset shifting and integrity verification are thoroughly exercised.
 */
function createSyntheticAsar(utilsContent, blockSize = 4194304) {
    const preBuf = Buffer.from('{"name":"antigravity-synthetic","version":"2.34.0"}\n', 'utf8');
    const utilsBuf = Buffer.from(utilsContent, 'utf8');
    const postBuf = Buffer.from('console.log("neighbor-after-utils");\n', 'utf8');

    const tree = {
        files: {
            'package.json': {
                size: preBuf.length,
                offset: '0',
                integrity: buildIntegrity(preBuf, blockSize)
            },
            dist: {
                files: {
                    'utils.js': {
                        size: utilsBuf.length,
                        offset: String(preBuf.length),
                        integrity: buildIntegrity(utilsBuf, blockSize)
                    },
                    'after.js': {
                        size: postBuf.length,
                        offset: String(preBuf.length + utilsBuf.length),
                        integrity: buildIntegrity(postBuf, blockSize)
                    }
                }
            }
        }
    };

    const jsonBuf = Buffer.from(JSON.stringify(tree), 'utf8');
    const pad = (4 - (jsonBuf.length % 4)) % 4;
    const payloadSize = 4 + jsonBuf.length + pad;
    const H = 8 + jsonBuf.length + pad;
    const headerBuf = Buffer.alloc(16 + jsonBuf.length + pad, 0);
    headerBuf.writeUInt32LE(4, 0);
    headerBuf.writeUInt32LE(H, 4);
    headerBuf.writeUInt32LE(payloadSize, 8);
    headerBuf.writeUInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(headerBuf, 16);

    return Buffer.concat([headerBuf, preBuf, utilsBuf, postBuf]);
}

function runPatcher(args) {
    return spawnSync(process.execPath, [PATCHER, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ELECTRON_NO_ASAR: '1' }
    });
}

function verifyNeighborIntact(asarPath) {
    const buf = fs.readFileSync(asarPath);
    const H = buf.readUInt32LE(4);
    const jsonLen = buf.readUInt32LE(12);
    const dataStart = 8 + H;
    const tree = JSON.parse(buf.toString('utf8', 16, 16 + jsonLen));
    const afterNode = tree.files.dist.files['after.js'];
    const off = Number(afterNode.offset);
    const sz = Number(afterNode.size);
    const content = buf.toString('utf8', dataStart + off, dataStart + off + sz);
    assert.equal(content, 'console.log("neighbor-after-utils");\n', 'neighbor file after.js must remain intact after offset shift');
}

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`[PASS] ${name}`);
    } catch (err) {
        console.error(`[FAIL] ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-theme-test-'));

try {
    test('manifest.json schema and repository configuration', () => {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        assert.match(manifest.version, /^v\d+\.\d+\.\d+/, 'version must be semver-like vX.Y.Z');
        assert.equal(manifest.repo, 'Django9944/antigravity-custom-themes');
        assert.match(manifest.hostUpdaterUrl, /^https:\/\/antigravity-hub-auto-updater-/, 'hostUpdaterUrl must point to official Antigravity updater');
        assert.match(manifest.verifiedHostVersion, /^\d+\.\d+\.\d+/, 'verifiedHostVersion must be defined');
        assert.equal(manifest.upstreamRepo, undefined, 'MCRYII upstreamRepo should be removed');
        assert.ok(Array.isArray(manifest.anchors) && manifest.anchors.length >= 2);
        assert.ok(Array.isArray(manifest.payloads) && manifest.payloads.includes('current.css') && manifest.payloads.includes('current.js'));
        for (const p of manifest.payloads) {
            assert.ok(fs.existsSync(path.join(ROOT, p)), `payload ${p} must exist`);
        }
    });

    test('current.js, core/asar-patcher.js, core/updater.js, and scripts pass node --check', () => {
        for (const rel of [
            'current.js',
            path.join('core', 'asar-patcher.js'),
            path.join('core', 'updater.js'),
            path.join('scripts', 'check-host-compat.mjs'),
            path.join('scripts', 'check-antigravity-upstream.mjs'),
            path.join('scripts', 'generate-release-notes.mjs'),
            path.join('scripts', 'auto-sync-host-release.mjs')
        ]) {
            const res = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
            assert.equal(res.status, 0, `${rel} syntax check failed: ${res.stderr}`);
        }
    });

    test('scripts/auto-sync-host-release.mjs bumps patch version and auto-discovers drifted anchors', () => {
        assert.equal(bumpPatchVersion('v2.4.1'), 'v2.4.2');
        assert.equal(bumpPatchVersion('2.4.9'), 'v2.4.10');

        const existing = ['void loadHubWindowUrl(win, url, { skipBootstrapMint });', 'void win.loadURL(url);'];
        const sameHit = autoDiscoverAnchor('function f() { void loadHubWindowUrl(win, url, { skipBootstrapMint }); }', existing);
        assert.equal(sameHit.isNew, false);
        assert.equal(sameHit.anchor, 'void loadHubWindowUrl(win, url, { skipBootstrapMint });');

        const driftedHit = autoDiscoverAnchor('function f() { await loadHubWindowUrl(win, url, { skipBootstrapMint, newOpt: true }); }', existing);
        assert.equal(driftedHit.isNew, true);
        assert.equal(driftedHit.anchor, 'await loadHubWindowUrl(win, url, { skipBootstrapMint, newOpt: true });');
    });

    test('CHANGELOG.md and scripts/generate-release-notes.mjs generate structured release descriptions', () => {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
        const section = extractChangelogSection(changelog, manifest.version);
        assert.ok(section.length > 50, `CHANGELOG.md must contain a detailed section for [${manifest.version}]`);

        const formatted = formatConventionalCommits([
            'a1b2c3d|feat(updater): add self-update with SHA256 verification',
            'e4f5g6h|fix(installer): support Antigravity 2.34+ anchor'
        ]);
        assert.ok(formatted.includes('### ✨ 新增特性 (Features)'));
        assert.ok(formatted.includes('**updater**: add self-update with SHA256 verification (`a1b2c3d`)'));
        assert.ok(formatted.includes('### 🐛 问题修复 (Bug Fixes)'));
    });

    test('current.js THEME_PACK_VERSION matches manifest.json version', () => {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
        const js = fs.readFileSync(path.join(ROOT, 'current.js'), 'utf8');
        const m = js.match(/const\s+THEME_PACK_VERSION\s*=\s*'([^']+)'/);
        assert.ok(m, 'current.js must define THEME_PACK_VERSION');
        assert.equal(m[1], manifest.version, 'current.js THEME_PACK_VERSION must match manifest.json version');
    });

    test('core/updater.js semver, SHA256SUMS verification, and hot/full update decision', () => {
        const updater = require(UPDATER);
        assert.equal(updater.compareSemver('v2.4.0', 'v2.3.3'), 1);
        assert.equal(updater.compareSemver('v2.3.3', 'v2.3.3'), 0);
        assert.equal(updater.compareSemver('v2.3.2', 'v2.3.3'), -1);

        const sampleZip = path.join(tmpDir, 'sample-macos.zip');
        fs.writeFileSync(sampleZip, Buffer.from('synthetic-zip-payload'));
        const goodHash = sha256(fs.readFileSync(sampleZip));
        const sumsText = `${goodHash}  sample-macos.zip\n0000000000000000000000000000000000000000000000000000000000000000  other.zip\n`;
        assert.equal(updater.verifyFileSha256(sampleZip, sumsText, 'sample-macos.zip').ok, true);
        assert.equal(updater.verifyFileSha256(sampleZip, sumsText, 'other.zip').ok, false);
        assert.equal(updater.verifyFileSha256(sampleZip, sumsText, 'missing.zip').ok, false);

        assert.equal(updater.decideUpdateMode({ oldHookVersion: 'v1', newHookVersion: 'v1', asarState: 'PATCHED_V1' }), 'hot');
        assert.equal(updater.decideUpdateMode({ oldHookVersion: 'v1', newHookVersion: 'v2', asarState: 'PATCHED_V1' }), 'full');
        assert.equal(updater.decideUpdateMode({ oldHookVersion: 'v1', newHookVersion: 'v1', asarState: 'CLEAN' }), 'full');
        assert.equal(updater.decideUpdateMode({ oldHookVersion: 'v1', newHookVersion: 'v1', asarState: 'PATCHED_LEGACY' }), 'full');
    });

    test('scripts/check-antigravity-upstream.mjs parses official Electron updater YAML and verifies ASAR', () => {
        const sampleYaml = [
            'version: 2.34.0',
            'files:',
            '  - url: https://storage.googleapis.com/antigravity-public/antigravity-hub/2.34.0-5887025308631040/darwin-arm/Antigravity.zip',
            '    sha512: 4mY3QkbpWxuru5gPvJrabdr3tMH/mnQDtallcA5m6bZQ6g3AClqU5N6gryt0eml7mrLtm7Vkb+iIQdDRB3wCFw==',
            '    size: 211599326',
            'path: Antigravity.zip',
            'sha512: 4mY3QkbpWxuru5gPvJrabdr3tMH/mnQDtallcA5m6bZQ6g3AClqU5N6gryt0eml7mrLtm7Vkb+iIQdDRB3wCFw=='
        ].join('\n');
        const parsed = parseElectronUpdaterYaml(sampleYaml);
        assert.equal(parsed.version, '2.34.0');
        assert.equal(parsed.buildId, '2.34.0-5887025308631040');
        assert.equal(parsed.fileName, 'Antigravity.zip');
        assert.equal(parsed.size, 211599326);

        const okAsar = path.join(tmpDir, 'host-ok.asar');
        fs.writeFileSync(okAsar, createSyntheticAsar('void loadHubWindowUrl(win, url, { skipBootstrapMint });\n'));
        const okRes = verifyAsarFile(okAsar);
        assert.equal(okRes.compatible, true);
        assert.equal(okRes.byteExact, true);

        const badAsar = path.join(tmpDir, 'host-bad.asar');
        fs.writeFileSync(badAsar, createSyntheticAsar('void futureLoadWindowUrl(win, url);\n'));
        const badRes = verifyAsarFile(badAsar);
        assert.equal(badRes.compatible, false);
        assert.ok(badRes.candidateHints.some((l) => l.includes('futureLoadWindowUrl')), 'should extract candidate anchor hints on failure');
    });

    test('current.css has balanced braces and theme scoping', () => {
        const css = fs.readFileSync(path.join(ROOT, 'current.css'), 'utf8');
        // Strip comments before counting braces
        const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
        const opens = (clean.match(/\{/g) || []).length;
        const closes = (clean.match(/\}/g) || []).length;
        assert.equal(opens, closes, `current.css unbalanced braces: {=${opens}, }=${closes}`);
        assert.ok(css.includes('html[data-ag-custom-theme]'), 'current.css must scope styles under html[data-ag-custom-theme]');
    });

    test('current.js embedded CSS has balanced braces, no fixed-attachment scroll traps, and Windows-scoped blur degradation', () => {
        const js = fs.readFileSync(path.join(ROOT, 'current.js'), 'utf8');
        const jsLines = js.split(/\r?\n/);
        const baseLine = jsLines.find((l) => l.trimStart().startsWith('const BASE_CSS = '));
        const darkLine = jsLines.find((l) => l.trimStart().startsWith('const DARK_DELTA_CSS = '));
        assert.ok(baseLine, 'current.js must define BASE_CSS');
        assert.ok(darkLine, 'current.js must define DARK_DELTA_CSS');

        const baseCss = JSON.parse(baseLine.trim().replace(/^const BASE_CSS = /, '').replace(/;$/, ''));
        const darkCss = JSON.parse(darkLine.trim().replace(/^const DARK_DELTA_CSS = /, '').replace(/;$/, ''));

        const winLightMatch = js.match(/const WIN_PERF_CSS = `([\s\S]*?)`\.trim\(\);/);
        const winDarkMatch = js.match(/const WIN_PERF_DARK_CSS = `([\s\S]*?)`\.trim\(\);/);
        assert.ok(winLightMatch, 'current.js must define WIN_PERF_CSS');
        assert.ok(winDarkMatch, 'current.js must define WIN_PERF_DARK_CSS');

        const winLightCss = winLightMatch[1].trim();
        const winDarkCss = winDarkMatch[1].trim();

        for (const [label, cssText] of [
            ['BASE_CSS', baseCss],
            ['DARK_DELTA_CSS', darkCss],
            ['WIN_PERF_CSS', winLightCss],
            ['WIN_PERF_DARK_CSS', winDarkCss]
        ]) {
            const opens = (cssText.match(/\{/g) || []).length;
            const closes = (cssText.match(/\}/g) || []).length;
            assert.equal(opens, closes, `${label} unbalanced braces: {=${opens}, }=${closes}`);
        }

        assert.ok(!/background-attachment\s*:\s*fixed/i.test(baseCss), 'BASE_CSS must not use background-attachment: fixed');
        assert.ok(!/background-attachment\s*:\s*fixed/i.test(darkCss), 'DARK_DELTA_CSS must not use background-attachment: fixed');

        for (const [label, cssText] of [['BASE_CSS', baseCss], ['DARK_DELTA_CSS', darkCss]]) {
            for (const block of cssText.split('}')) {
                const selector = block.split('{')[0] || '';
                if (selector.includes('sticky')) {
                    assert.ok(
                        !block.includes('var(--ag-mesh)') && !block.includes('var(--sidebar-unified-bg)'),
                        `${label} sticky block must not paint viewport mesh/sidebar-unified-bg: ${selector.trim()}`
                    );
                }
            }
        }

        assert.ok(baseCss.includes('backdrop-filter: blur('), 'BASE_CSS must retain macOS backdrop-filter blur rules');
        assert.ok(
            baseCss.includes('.agy-inset-shell [style*="--sidebar"]') && darkCss.includes('.agy-inset-shell [style*="--sidebar"]'),
            'BASE_CSS and DARK_DELTA_CSS must override inline --sidebar/--color-sidebar inside .agy-inset-shell'
        );
        assert.ok(
            baseCss.includes('[data-ag-scrolled="true"]') && darkCss.includes('[data-ag-scrolled="true"]'),
            'Sticky sidebar headers should only paint solid backdrop when scrolled'
        );
        assert.ok(
            js.includes('syncSidebarScrollState'),
            'current.js must track sidebar scroll state via syncSidebarScrollState'
        );

        for (const [label, cssText] of [['WIN_PERF_CSS', winLightCss], ['WIN_PERF_DARK_CSS', winDarkCss]]) {
            for (const block of cssText.split('}')) {
                const selectorList = (block.split('{')[0] || '').trim();
                if (!selectorList) continue;
                const selectors = [];
                let depth = 0;
                let start = 0;
                for (let i = 0; i < selectorList.length; i++) {
                    const ch = selectorList[i];
                    if (ch === '(' || ch === '[') depth++;
                    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
                    else if (ch === ',' && depth === 0) {
                        selectors.push(selectorList.slice(start, i));
                        start = i + 1;
                    }
                }
                selectors.push(selectorList.slice(start));
                for (const sel of selectors) {
                    assert.ok(
                        sel.trim().startsWith('html[data-ag-platform="win"]'),
                        `${label} selector must be scoped under html[data-ag-platform="win"]: ${sel.trim()}`
                    );
                }
            }
        }

        assert.ok(js.includes("setAttribute('data-ag-platform'"), 'current.js must set data-ag-platform for active themes');
        assert.ok(js.includes("removeAttribute('data-ag-platform'"), 'current.js must remove data-ag-platform in stock mode');
    });

    test('install.sh uses LF line endings and references Django9944/core/asar-patcher.js', () => {
        const sh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
        assert.ok(!sh.includes('\r\n'), 'install.sh must use LF line endings for macOS compatibility');
        assert.ok(sh.includes('core/asar-patcher.js'));
        assert.ok(sh.includes('Django9944/antigravity-custom-themes'));
    });

    const anchorFixtures = [
        {
            name: 'Antigravity < 2.34 (win.loadURL)',
            code: 'function openHub(win, url) {\n    void win.loadURL(url);\n    return win;\n}\n'
        },
        {
            name: 'Antigravity 2.34+ (loadHubWindowUrl)',
            code: 'function openHub(win, url, skipBootstrapMint) {\n    void loadHubWindowUrl(win, url, { skipBootstrapMint });\n    return win;\n}\n'
        },
        {
            name: 'Future fallback regex variant',
            code: 'function openHub(win, url) {\n    void loadHubWindowUrl(win, url, { skipBootstrapMint: true, extra: 1 });\n    return win;\n}\n'
        }
    ];

    for (const fx of anchorFixtures) {
        test(`Full ASAR lifecycle (inspect -> inject -> idempotent -> doctor -> strip -> byte-exact): ${fx.name}`, () => {
            const stockBuf = createSyntheticAsar(fx.code);
            const stockHash = sha256(stockBuf);
            const stockPath = path.join(tmpDir, `stock-${passed}.asar`);
            const patched1 = path.join(tmpDir, `patched1-${passed}.asar`);
            const patched2 = path.join(tmpDir, `patched2-${passed}.asar`);
            const stripped = path.join(tmpDir, `stripped-${passed}.asar`);
            fs.writeFileSync(stockPath, stockBuf);

            // 1. inspect clean
            let r = runPatcher(['inspect', stockPath]);
            assert.equal(r.status, 0, r.stderr);
            assert.equal(r.stdout.trim(), 'CLEAN');

            // 2. inject
            r = runPatcher(['inject', stockPath, patched1]);
            assert.equal(r.status, 0, r.stderr);
            assert.match(r.stdout.trim(), /^INJECT_OK:\d+$/);
            verifyNeighborIntact(patched1);

            // 3. inspect & verify-patched
            r = runPatcher(['inspect', patched1]);
            assert.equal(r.status, 0, r.stderr);
            assert.equal(r.stdout.trim(), 'PATCHED_V1');

            r = runPatcher(['verify-patched', patched1]);
            assert.equal(r.status, 0, r.stderr);
            assert.equal(r.stdout.trim(), 'VERIFY_OK');

            // 4. idempotent re-inject must produce identical bytes
            r = runPatcher(['inject', patched1, patched2]);
            assert.equal(r.status, 0, r.stderr);
            assert.equal(sha256(fs.readFileSync(patched1)), sha256(fs.readFileSync(patched2)), 're-inject must be byte-idempotent');

            // 5. doctor --json
            r = runPatcher(['doctor', patched1, '--json']);
            assert.equal(r.status, 0, r.stderr);
            const doc = JSON.parse(r.stdout);
            assert.equal(doc.status, 'PATCHED_V1');
            assert.equal(doc.integrityOk, true);
            assert.equal(doc.boundsOk, true);

            // 6. strip -> verify-clean -> byte-exact match with stock
            r = runPatcher(['strip', patched1, stripped]);
            assert.equal(r.status, 0, r.stderr);
            assert.equal(r.stdout.trim(), 'STRIP_OK');
            verifyNeighborIntact(stripped);

            r = runPatcher(['verify-clean', stripped]);
            assert.equal(r.status, 0, r.stderr);
            assert.equal(r.stdout.trim(), 'CLEAN_OK');

            const strippedHash = sha256(fs.readFileSync(stripped));
            assert.equal(strippedHash, stockHash, 'stripped ASAR must match original stock ASAR byte-for-byte');
        });
    }

    test('Legacy hook upgrade to V1 and clean strip to stock', () => {
        const stockCode = 'function openHub(win, url) {\n    void win.loadURL(url);\n    return win;\n}\n';
        const legacyHook =
            '    // === Antigravity custom-theme injection hook (start) ===\n' +
            '    console.log("old");\n' +
            '    // === Antigravity custom-theme injection hook (end) ===\n';
        const legacyCode = stockCode.replace('void win.loadURL(url);\n', 'void win.loadURL(url);\n' + legacyHook);

        const stockBuf = createSyntheticAsar(stockCode);
        const legacyPath = path.join(tmpDir, 'legacy.asar');
        const upgradedPath = path.join(tmpDir, 'upgraded.asar');
        const strippedPath = path.join(tmpDir, 'legacy-stripped.asar');
        fs.writeFileSync(legacyPath, createSyntheticAsar(legacyCode));

        let r = runPatcher(['inspect', legacyPath]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout.trim(), 'PATCHED_LEGACY');

        r = runPatcher(['inject', legacyPath, upgradedPath]);
        assert.equal(r.status, 0, r.stderr);

        r = runPatcher(['verify-patched', upgradedPath]);
        assert.equal(r.status, 0, r.stderr);

        r = runPatcher(['strip', upgradedPath, strippedPath]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(sha256(fs.readFileSync(strippedPath)), sha256(stockBuf));
    });

    test('Multi-block (>4MB) utils.js integrity calculation and round-trip', () => {
        const bigPad = '// ' + 'x'.repeat(4 * 1024 * 1024 + 1024) + '\n';
        const bigCode = bigPad + 'void loadHubWindowUrl(win, url, { skipBootstrapMint });\n';
        const stockBuf = createSyntheticAsar(bigCode);
        const stockPath = path.join(tmpDir, 'big.asar');
        const patchedPath = path.join(tmpDir, 'big-patched.asar');
        const strippedPath = path.join(tmpDir, 'big-stripped.asar');
        fs.writeFileSync(stockPath, stockBuf);

        let r = runPatcher(['inject', stockPath, patchedPath]);
        assert.equal(r.status, 0, r.stderr);

        r = runPatcher(['verify-patched', patchedPath]);
        assert.equal(r.status, 0, r.stderr);

        r = runPatcher(['strip', patchedPath, strippedPath]);
        assert.equal(r.status, 0, r.stderr);
        assert.equal(sha256(fs.readFileSync(strippedPath)), sha256(stockBuf));
    });

    test('Missing anchor fails safely with exit code 2', () => {
        const badPath = path.join(tmpDir, 'no-anchor.asar');
        fs.writeFileSync(badPath, createSyntheticAsar('function unrelated() { return 42; }\n'));

        const r = runPatcher(['inspect', badPath]);
        assert.equal(r.status, 2);
        assert.ok(r.stderr.includes('ANCHOR_MISSING'));

        const d = runPatcher(['doctor', badPath, '--json']);
        assert.equal(d.status, 2);
        assert.equal(JSON.parse(d.stdout).status, 'ANCHOR_MISSING');
    });

    if (process.platform === 'win32') {
        test('Windows install.ps1 end-to-end sandbox install -> doctor -> uninstall', () => {
            const fakeApp = path.join(tmpDir, 'FakeAntigravity');
            const fakeRes = path.join(fakeApp, 'resources');
            fs.mkdirSync(fakeRes, { recursive: true });
            const stockBuf = createSyntheticAsar('void loadHubWindowUrl(win, url, { skipBootstrapMint });\n');
            const fakeAsar = path.join(fakeRes, 'app.asar');
            fs.writeFileSync(fakeAsar, stockBuf);

            const psExe = 'powershell.exe';
            const psBase = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'install.ps1'), '-AppPath', fakeApp, '-NonInteractive'];
            const fakeUserData = path.join(tmpDir, 'WinUserData');
            const winEnv = { ...process.env, AG_USER_DATA_DIR: fakeUserData };

            // Install
            let r = spawnSync(psExe, psBase, { encoding: 'utf8', env: winEnv });
            assert.equal(r.status, 0, `install.ps1 failed:\n${r.stdout}\n${r.stderr}`);
            assert.ok(fs.existsSync(path.join(fakeRes, 'app.asar.stock-backup')), 'stock backup should be created');
            assert.ok(fs.existsSync(path.join(fakeRes, 'custom-theme', 'current.css')), 'current.css should be copied');
            assert.ok(fs.existsSync(path.join(fakeRes, 'custom-theme', 'current.js')), 'current.js should be copied');
            assert.ok(fs.existsSync(path.join(fakeUserData, 'custom-theme', 'current.css')), 'userData current.css should be copied');

            // Doctor
            r = spawnSync(psExe, [...psBase, '-Doctor'], { encoding: 'utf8', env: winEnv });
            assert.equal(r.status, 0, `install.ps1 -Doctor failed:\n${r.stdout}\n${r.stderr}`);
            assert.ok(r.stdout.includes('PATCHED_V1'));

            // Uninstall
            r = spawnSync(psExe, [...psBase, '-Uninstall'], { encoding: 'utf8', env: winEnv });
            assert.equal(r.status, 0, `install.ps1 -Uninstall failed:\n${r.stdout}\n${r.stderr}`);
            assert.equal(sha256(fs.readFileSync(fakeAsar)), sha256(stockBuf), 'uninstalled ASAR must match stock byte-for-byte');
            assert.ok(!fs.existsSync(path.join(fakeRes, 'app.asar.stock-backup')), 'backup should be cleaned on uninstall');
            assert.ok(!fs.existsSync(path.join(fakeUserData, 'custom-theme')), 'userData custom-theme should be cleaned on uninstall');

            // AutoHeal on CLEAN -> re-injects automatically
            r = spawnSync(psExe, [...psBase, '-AutoHeal'], { encoding: 'utf8', env: winEnv });
            assert.equal(r.status, 0, `install.ps1 -AutoHeal (CLEAN) failed:\n${r.stdout}\n${r.stderr}`);
            const healedHash = sha256(fs.readFileSync(fakeAsar));
            assert.notEqual(healedHash, sha256(stockBuf), 'AutoHeal should re-inject CLEAN app.asar');

            // AutoHeal on PATCHED_V1 -> no-op, bytes unchanged
            r = spawnSync(psExe, [...psBase, '-AutoHeal'], { encoding: 'utf8', env: winEnv });
            assert.equal(r.status, 0, `install.ps1 -AutoHeal (PATCHED_V1) failed:\n${r.stdout}\n${r.stderr}`);
            assert.equal(sha256(fs.readFileSync(fakeAsar)), healedHash, 'AutoHeal must be a no-op when already PATCHED_V1');

            // AutoHeal on ANCHOR_MISSING -> exits 2 without modifying ASAR
            const badBuf = createSyntheticAsar('function noAnchor() {}\n');
            fs.writeFileSync(fakeAsar, badBuf);
            r = spawnSync(psExe, [...psBase, '-AutoHeal'], { encoding: 'utf8', env: winEnv });
            assert.equal(r.status, 2, 'AutoHeal must exit 2 when anchor is missing');
            assert.equal(sha256(fs.readFileSync(fakeAsar)), sha256(badBuf), 'AutoHeal must not modify incompatible ASAR');
        });
    }

    if (process.platform === 'darwin' || process.platform === 'linux') {
        test('Unix install.sh end-to-end sandbox install -> doctor -> uninstall -> auto-heal', () => {
            const fakeApp = path.join(tmpDir, 'FakeAntigravity.app');
            const fakeRes = path.join(fakeApp, 'Contents', 'Resources');
            const fakeUserData = path.join(tmpDir, 'UserData');
            fs.mkdirSync(fakeRes, { recursive: true });
            const stockBuf = createSyntheticAsar('void loadHubWindowUrl(win, url, { skipBootstrapMint });\n');
            const fakeAsar = path.join(fakeRes, 'app.asar');
            fs.writeFileSync(fakeAsar, stockBuf);

            const env = { ...process.env, AG_USER_DATA_DIR: fakeUserData };
            const baseArgs = [path.join(ROOT, 'install.sh'), '--app-path', fakeApp, '--non-interactive'];

            let r = spawnSync('bash', [...baseArgs, '--install'], { encoding: 'utf8', env });
            assert.equal(r.status, 0, `install.sh --install failed:\n${r.stdout}\n${r.stderr}`);

            r = spawnSync('bash', [...baseArgs, '--doctor'], { encoding: 'utf8', env });
            assert.equal(r.status, 0, `install.sh --doctor failed:\n${r.stdout}\n${r.stderr}`);
            assert.ok(r.stdout.includes('PATCHED_V1'));

            r = spawnSync('bash', [...baseArgs, '--uninstall'], { encoding: 'utf8', env });
            assert.equal(r.status, 0, `install.sh --uninstall failed:\n${r.stdout}\n${r.stderr}`);
            assert.equal(sha256(fs.readFileSync(fakeAsar)), sha256(stockBuf), 'uninstalled ASAR must match stock byte-for-byte');

            // Auto-heal on CLEAN -> re-injects
            r = spawnSync('bash', [...baseArgs, '--auto-heal'], { encoding: 'utf8', env });
            assert.equal(r.status, 0, `install.sh --auto-heal (CLEAN) failed:\n${r.stdout}\n${r.stderr}`);
            const healedHash = sha256(fs.readFileSync(fakeAsar));
            assert.notEqual(healedHash, sha256(stockBuf));

            // Auto-heal on PATCHED_V1 -> no-op
            r = spawnSync('bash', [...baseArgs, '--auto-heal'], { encoding: 'utf8', env });
            assert.equal(r.status, 0);
            assert.equal(sha256(fs.readFileSync(fakeAsar)), healedHash);

            // Auto-heal on ANCHOR_MISSING -> exits 2 without modifying ASAR
            const badBuf = createSyntheticAsar('function noAnchor() {}\n');
            fs.writeFileSync(fakeAsar, badBuf);
            r = spawnSync('bash', [...baseArgs, '--auto-heal'], { encoding: 'utf8', env });
            assert.equal(r.status, 2);
            assert.equal(sha256(fs.readFileSync(fakeAsar)), sha256(badBuf));
        });
    }
} finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (process.exitCode && process.exitCode !== 0) {
    console.error('\nSome tests failed.');
    process.exit(process.exitCode);
} else {
    console.log(`\nAll ${passed} tests passed!`);
}
