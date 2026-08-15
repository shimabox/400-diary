---
name: run-dev-app
description: 400日記の dev サーバーを起動し、Playwright で編集→保存→画像添付→プレビューを自動操作して UI 変更を実機検証する手順。スクリーンショット取得・レイアウト実測・テスト日記の後始末まで含む。
---

# 400日記を起動して実ブラウザで検証する

UI 変更（FlowText / DiaryScrollFrame / エディタ周り）を「本当に動くか」で
確認するための検証手順。

## 1. dev サーバー

ポートは **5173**（vite）。**ユーザーが自分で起動していることが多い**ので、
必ず先に確認し、動いていればそれを使う（勝手に kill しない）:

```bash
curl -sf -o /dev/null -w "%{http_code}" http://localhost:5173/   # 200 なら起動済み
```

動いていなければ:

```bash
pnpm run dev &   # predev で resvg の wasm コピーが走る
timeout 30 bash -c 'until curl -sf http://localhost:5173/ >/dev/null; do sleep 1; done'
```

- 停止は `lsof -ti:5173 -sTCP:LISTEN | xargs -r kill`（自分で起動した場合のみ）
- 停止後に D1 が SQLITE_BUSY になったら workerd の残骸が原因:
  `pgrep -l workerd` で探して kill
- vite は HMR なのでコード修正はリロード不要で反映される

## 2. 認証

`.dev.vars` に `DEV_AUTH_BYPASS=true` があり、dev では常に認証済み扱い。
ログイン操作は不要（`/new` や `/edit/:id`、認証必須 API にそのまま入れる）。

## 3. Playwright ドライバ

プロジェクトには playwright が入っていない（依存を汚さないため今後も入れない）。
**リポジトリ外の一時ディレクトリ**に都度インストールする。npm があれば動く:

```bash
tmp=$(mktemp -d)   # $CLAUDE_JOB_DIR/tmp があるセッションではそちらでもよい
cd "$tmp" && npm init -y && npm i playwright
# ブラウザ本体が未キャッシュの環境では初回のみ必要（キャッシュ済みなら即終了する）
npx playwright install chromium
```

ブラウザ本体は `~/Library/Caches/ms-playwright`（macOS）にキャッシュされ、
2回目以降のダウンロードは発生しない。スクリプトや生成画像も
この一時ディレクトリに置き、リポジトリ内に持ち込まないこと。

## 4. 代表的な操作フロー（編集→保存→画像添付→プレビュー）

セレクタと注意点（2026-08 時点で確認済み）:

| 操作 | セレクタ / 方法 |
|---|---|
| 本文入力 | `page.fill('textarea[aria-label="日記の本文"]', ...)` |
| 下書き保存 | `button:has-text("保存")` — **画像添付には diaryId が必要なので先に保存必須** |
| 画像添付 | `page.setInputFiles('input[type=file]', {name, mimeType, buffer})`（input は display:none だが動く） |
| 画像サイズ | `input[type=range]` の **1個目**（2個目は回転）。下記の dispatch 方式で |
| プレビュー | `button:has-text("プレビュー")` → `button:has-text("編集に戻る")` の出現を待つ |

```js
// hono/jsx の controlled input はスライダーに fill が効かない。value + input イベントで
await slider.evaluate((el) => {
  el.value = '1.5'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
```

テスト画像は canvas で生成すると外部ファイル不要:

```js
await page.goto('about:blank')
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 800; c.height = 800
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#88cc55'; ctx.fillRect(0, 0, 800, 800)
  return c.toDataURL('image/png')
})
const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
```

## 5. プレビュー/公開ページのレイアウト実測

スクロールコンテナは「`.hide-scrollbar` かつ computed style が
`direction: rtl`」で特定する。DOM 構造は
`スクロールコンテナ > minWidth:880 div > FlowText ルート > 右アンカーのキャンバス`:

```js
const state = await page.evaluate(() => {
  const scroll = [...document.querySelectorAll('.hide-scrollbar')].find(
    (el) => getComputedStyle(el).direction === 'rtl',
  )
  const canvas = scroll.firstElementChild.firstElementChild.firstElementChild
  return {
    canvasStyleWidth: canvas.style.width,        // '880px' なら拡張なし
    overflow: scroll.scrollWidth - scroll.clientWidth,
    columns: canvas.querySelectorAll('div[style*="vertical-rl"]').length,
  }
})
```

- rtl コンテナの scrollLeft は **0（右端=文頭）〜負値（左端=文末）**。
  左端まで送るには `scroll.scrollLeft = -100000`
- 描画は非同期（画像ロード・ResizeObserver）なので、プレビュー切替後は
  `waitForTimeout(2000)` 程度置いてから測る
- スクリーンショットは `page.screenshot({ path })` で保存し、必ず Read で目視する

## 6. 後始末（必須）

検証で作った日記はローカル D1 に残る。**自分が作ったものだけ**を
API 経由（起動中サーバーの接続を使うので D1 ロックと競合しない）で消す:

```bash
# 本文パターンと作成日時で自分のテスト日記だけを特定する
npx wrangler d1 execute 400-diary-db --local \
  --command "SELECT id, created_at FROM diaries WHERE body LIKE 'テスト本文の先頭%' AND created_at >= '<今日>'" --json
curl -X DELETE http://localhost:5173/api/diaries/<id>   # 204 が返る。画像も削除される
```

注意: 保存後も URL が `/new` のままのことがあるため、diaryId は URL からではなく
上記の D1 クエリで取るのが確実。ユーザー自身のテスト日記（過去日付のもの）を
消さないよう、作成日時の条件を必ず付けること。
