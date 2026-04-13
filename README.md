# 400-diary

**400字日記** — 400（20×20）文字の世界で綴る日記

https://400-diary.shimabox.net で公開されているアプリのソースコードです。

## 主な機能

- **20×20 縦書きグリッドエディタ** — `writing-mode: vertical-rl` による縦書き入力
- **下書き・公開管理** — スナップショット方式で公開後も下書きを編集可能
- **気分タグ** — 6種類（happy / calm / sad / angry / anxious / fun）の気分を記録
- **パステル背景色** — 12色のプリセットからランダム選択またはカスタム指定
- **画像アップロード** — ドラッグで自由に配置でき、[chenglou/pretext](https://github.com/chenglou/pretext) によりテキストが画像を回り込む
- **音声入力** — Web Speech API による日本語リアルタイム音声認識
- **カレンダー** — GitHub風ヒートマップ + 月間カレンダーで気分を可視化
- **SPA ナビゲーション** — History API によるページ遷移

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | HonoX / Hono |
| ランタイム | Cloudflare Workers |
| データベース | Cloudflare D1（SQLite） |
| ストレージ | Cloudflare R2 |
| 認証 | Cloudflare Access（JWT） |
| フロントエンド | Islands Architecture / Hono JSX |
| ビルド | Vite |
| 品質管理 | TypeScript / Biome / Vitest |

## セットアップ

```bash
# 依存関係のインストール
pnpm install

# ローカル開発用の環境変数を設定
cp .dev.vars.example .dev.vars

# ローカル D1 にスキーマを適用
pnpm run db:migrate:local

# OGP画像用フォントをローカル R2 にアップロード（初回のみ）
bash scripts/upload-fonts.sh --local

# 開発サーバーを起動（http://localhost:5173）
pnpm run dev
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `pnpm run dev` | 開発サーバーの起動 |
| `pnpm run typecheck` | TypeScript 型チェック |
| `pnpm run test` | テストの実行 |
| `pnpm run lint` | Biome による lint チェック |
| `pnpm run lint:fix` | Biome による lint 自動修正 |
| `pnpm run format` | Biome によるフォーマット |
| `pnpm run build` | 型チェック + ビルド |
| `pnpm run deploy` | ビルド + Cloudflare Pages へデプロイ |
| `pnpm run db:migrate:local` | ローカル D1 にスキーマ適用 |
| `pnpm run db:migrate:remote` | リモート D1 にスキーマ適用 |

## アーキテクチャ

詳細な設計文書は [`docs/architecture/`](docs/architecture/) を参照してください。

- [概要](docs/architecture/overview.md) — 全体構成図
- [認証](docs/architecture/authentication.md) — Cloudflare Access + JWT 検証
- [データベース](docs/architecture/database.md) — スキーマと公開フロー
- [縦書きテキスト](docs/architecture/vertical-text.md) — 20×20 グリッドレイアウト
- [画像アップロード](docs/architecture/image-upload.md) — R2 ストレージ管理
- [カレンダー](docs/architecture/calendar.md) — ヒートマップと気分システム
- [音声入力](docs/architecture/speech-input.md) — Web Speech API 連携

## デプロイ

Cloudflare Pages にデプロイします。詳細な手順は [`docs/deploy/README.md`](docs/deploy/README.md) を参照してください。

| バインディング | 種別 | 用途 |
|--------------|------|------|
| `DB` | D1 Database | 日記データの保存 |
| `BUCKET` | R2 Bucket | 画像の保存 |
| `CF_ACCESS_TEAM_DOMAIN` | 環境変数 | Cloudflare Access のチームドメイン |
| `CF_ACCESS_AUD` | 環境変数 | Cloudflare Access の AUD タグ |
| `APP_NAME` | 環境変数（任意） | アプリ表示名（デフォルト: 400字日記） |
| `CF_WEB_ANALYTICS_TOKEN` | 環境変数（任意） | Cloudflare Web Analytics のトークン |

## 免責事項

デプロイや設定に伴う費用・トラブルについては自己責任でお願いします。Cloudflare の仕様変更により手順が異なる場合があります。

## ライセンス

[MIT](LICENSE)
