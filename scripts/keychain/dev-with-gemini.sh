#!/usr/bin/env bash
# macOS キーチェーンの Gemini API キーと声 ID を、`pnpm run dev` の子プロセスにだけ
# 環境変数で渡して dev サーバーを起動する。vite.config.ts がこの 2 つを binding に渡す。
#
# - 値はこのシェルの中で export してから exec するだけで、コマンド引数・画面・ログ・
#   シェル履歴・.dev.vars には残さない（`env NAME=値 コマンド` は値が引数に載るので使わない）
# - 引数は受け取らず、実行するコマンドは固定
# - キーチェーンの項目（アカウントは実行ユーザー）:
#   400-diary-gemini-api-key（API キー）、400-diary-gemini-voice-id（声 ID）
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "このスクリプトは引数を受け取りません" >&2
  exit 2
fi

readonly API_KEY_SERVICE='400-diary-gemini-api-key'
readonly VOICE_ID_SERVICE='400-diary-gemini-voice-id'
readonly ACCOUNT="${USER:-$(id -un)}"

cd "$(dirname "$0")/../.."

print_register_help() {
  cat >&2 <<EOF
キーチェーンに「$1」がありません。次のコマンドで登録してから、もう一度実行してください。
値はコマンドに書かず、表示される入力欄に貼り付けます。

  security add-generic-password -a "\$USER" -s $1 -w
EOF
}

if ! GEMINI_API_KEY=$(security find-generic-password -a "$ACCOUNT" -s "$API_KEY_SERVICE" -w 2>/dev/null); then
  print_register_help "$API_KEY_SERVICE"
  exit 1
fi
if ! GEMINI_VOICE_ID=$(security find-generic-password -a "$ACCOUNT" -s "$VOICE_ID_SERVICE" -w 2>/dev/null); then
  print_register_help "$VOICE_ID_SERVICE"
  exit 1
fi
export GEMINI_API_KEY GEMINI_VOICE_ID

exec pnpm run dev
