#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Usage: package-release.sh <tag>}"

rm -rf dist
mkdir -p dist/stage-macos dist/stage-windows dist/stage-universal

COMMON_FILES=(
  "LICENSE"
  "README.md"
  "README_EN.md"
  "CHANGELOG.md"
  "manifest.json"
  "current.css"
  "current.js"
  "core"
)

# macOS package (preserve +x permissions)
for item in "${COMMON_FILES[@]}" install.sh install.command uninstall.command "检查更新.command"; do
  cp -R "$item" dist/stage-macos/
done
chmod +x dist/stage-macos/install.sh dist/stage-macos/*.command

# Windows package
for item in "${COMMON_FILES[@]}" install.ps1 install.bat uninstall.bat "检查更新.bat"; do
  cp -R "$item" dist/stage-windows/
done

# Universal package
for item in "${COMMON_FILES[@]}" install.sh install.command uninstall.command "检查更新.command" install.ps1 install.bat uninstall.bat "检查更新.bat"; do
  cp -R "$item" dist/stage-universal/
done
chmod +x dist/stage-universal/install.sh dist/stage-universal/*.command

(cd dist/stage-macos && zip -rq "../antigravity-custom-themes-${TAG}-macos.zip" .)
(cd dist/stage-windows && zip -rq "../antigravity-custom-themes-${TAG}-windows.zip" .)
(cd dist/stage-universal && zip -rq "../antigravity-custom-themes-${TAG}-universal.zip" .)

(cd dist && sha256sum antigravity-custom-themes-${TAG}-*.zip > SHA256SUMS.txt)
node scripts/generate-release-notes.mjs "$TAG" dist/SHA256SUMS.txt --out dist/RELEASE_NOTES.md
ls -lh dist/antigravity-custom-themes-${TAG}-*.zip dist/SHA256SUMS.txt dist/RELEASE_NOTES.md
