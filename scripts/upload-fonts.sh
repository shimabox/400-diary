#!/usr/bin/env bash
set -euo pipefail

# Klee One フルフォント (TTF) を生成して R2 にアップロードする
#
# 前提:
#   pip install fonttools brotli
#   pnpm install (@fontsource/klee-one が必要)

FONTSOURCE_DIR="node_modules/@fontsource/klee-one/files"
TMP_DIR=$(mktemp -d)
R2_BUCKET="400-diary-images"

trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== Klee One フルフォント生成 ==="

for weight in 400 600; do
  echo "Weight ${weight}: merging subsets..."
  python3 -c "
from fontTools.merge import Merger
import glob

files = sorted(glob.glob('${FONTSOURCE_DIR}/klee-one-*-${weight}-normal.woff2'))
print(f'  {len(files)} subsets found')
merger = Merger()
font = merger.merge(files)
font.flavor = None
font.save('${TMP_DIR}/klee-one-${weight}.ttf')
"
  SIZE=$(stat -c%s "${TMP_DIR}/klee-one-${weight}.ttf")
  echo "  -> klee-one-${weight}.ttf ($(( SIZE / 1024 )) KB)"
done

echo ""
echo "=== R2 にアップロード ==="

for weight in 400 600; do
  echo "Uploading fonts/klee-one-${weight}.ttf ..."
  wrangler r2 object put "${R2_BUCKET}/fonts/klee-one-${weight}.ttf" \
    --file "${TMP_DIR}/klee-one-${weight}.ttf" \
    --content-type "font/ttf"
done

echo ""
echo "=== 完了 ==="
echo "R2 keys:"
echo "  fonts/klee-one-400.ttf"
echo "  fonts/klee-one-600.ttf"
