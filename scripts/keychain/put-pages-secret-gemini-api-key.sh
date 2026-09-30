#!/usr/bin/env bash
# macOS キーチェーンの Gemini API キーを、Cloudflare Pages のシークレット GEMINI_API_KEY に登録する。
# 登録先のプロジェクトは、リポジトリ直下の wrangler.toml の最上位の name（fork したら変える値）。
#
# - 値は wrangler に標準入力で渡し、コマンド引数・画面・ログ・シェル履歴に残さない
# - 引数は受け取らず、実行するコマンドは固定
# - キーチェーンの項目: サービス名 400-diary-gemini-api-key、アカウントは実行ユーザー
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "このスクリプトは引数を受け取りません" >&2
  exit 2
fi

readonly SERVICE='400-diary-gemini-api-key'
readonly ACCOUNT="${USER:-$(id -un)}"
readonly CONFIG='wrangler.toml'

cd "$(dirname "$0")/../.."

# 最初のテーブル見出し（[[d1_databases]] など）より前にある、最初の name 行だけを読む。
# テーブル内の database_name などは拾わない
project_name=''
if [ -f "$CONFIG" ]; then
  project_name=$(sed -n \
    -e '/^[[:space:]]*\[/q' \
    -e '/^[[:space:]]*name[[:space:]]*=/{' \
    -e 's/^[[:space:]]*name[[:space:]]*=[[:space:]]*"\([^"]*\)"[[:space:]]*\(#.*\)\{0,1\}$/\1/p' \
    -e 'q' \
    -e '}' \
    "$CONFIG")
fi
if [ -z "$project_name" ]; then
  echo "${CONFIG} の最上位の name（例: name = \"400-diary\"）から Cloudflare Pages のプロジェクト名を読めませんでした" >&2
  exit 1
fi
if ! LC_ALL=C grep -Eq '^[A-Za-z0-9-]+$' <<<"$project_name"; then
  echo "${CONFIG} の name「${project_name}」に英数字とハイフン以外が含まれています" >&2
  exit 1
fi

if ! secret=$(security find-generic-password -a "$ACCOUNT" -s "$SERVICE" -w 2>/dev/null); then
  cat >&2 <<EOF
キーチェーンに「${SERVICE}」がありません。次のコマンドで登録してから、もう一度実行してください。
値はコマンドに書かず、表示される入力欄に貼り付けます。

  security add-generic-password -a "\$USER" -s ${SERVICE} -w
EOF
  exit 1
fi

echo "登録先の Cloudflare Pages プロジェクト: ${project_name}" >&2

# printf は bash の組み込みなので、値が別プロセスの引数に載らない
printf '%s' "$secret" |
  pnpm exec wrangler pages secret put GEMINI_API_KEY --project-name "$project_name"
