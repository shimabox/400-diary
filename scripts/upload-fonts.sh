#!/usr/bin/env bash
set -euo pipefail

# Klee One フォント (TTF) を GitHub からダウンロードして R2 にアップロードする
#
# 使い方:
#   bash scripts/upload-fonts.sh           # リモート R2 にアップロード
#   bash scripts/upload-fonts.sh --local   # ローカル R2 にアップロード

BASE_URL="https://github.com/fontworks-fonts/Klee/raw/master/fonts/ttf"
TMP_DIR=$(mktemp -d)
R2_BUCKET="400-diary-images"

LOCAL_FLAG=""
if [[ "${1:-}" == "--local" ]]; then
  LOCAL_FLAG="--local"
  echo "=== ローカル R2 モード ==="
else
  echo "=== リモート R2 モード ==="
fi

trap 'rm -rf "$TMP_DIR"' EXIT

echo ""
echo "=== Klee One フォントダウンロード ==="

curl -fSL -o "${TMP_DIR}/klee-one-400.ttf" "${BASE_URL}/KleeOne-Regular.ttf"
echo "  -> KleeOne-Regular.ttf"

curl -fSL -o "${TMP_DIR}/klee-one-600.ttf" "${BASE_URL}/KleeOne-SemiBold.ttf"
echo "  -> KleeOne-SemiBold.ttf"

echo ""
echo "=== R2 にアップロード ==="

for weight in 400 600; do
  echo "Uploading fonts/klee-one-${weight}.ttf ..."
  wrangler r2 object put "${R2_BUCKET}/fonts/klee-one-${weight}.ttf" \
    --file "${TMP_DIR}/klee-one-${weight}.ttf" \
    --content-type "font/ttf" \
    ${LOCAL_FLAG}
done

echo ""
echo "=== 完了 ==="
echo "R2 keys:"
echo "  fonts/klee-one-400.ttf"
echo "  fonts/klee-one-600.ttf"
