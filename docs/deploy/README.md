# 本番デプロイ手順

このリポジトリを fork して、自分の Cloudflare 環境にデプロイする手順です。

## やること

1. リポジトリを fork し、`wrangler.toml` の設定値（`name`, `APP_NAME`, `CF_WEB_ANALYTICS_TOKEN` 等）を自分の環境に合わせる
   - `CF_WEB_ANALYTICS_TOKEN` は設定しなければ Analytics のスクリプトが出力されないだけなので、不要なら削除またはコメントアウトで大丈夫です。利用する場合は Cloudflare ダッシュボードの Web 分析 からサイトを追加し、JS スニペット内の token の値を設定してください
   ![Web Analytics のトークン確認](web-analytics.png)
2. Cloudflare に D1 データベースと R2 バケットを作成する
3. Cloudflare Pages にデプロイする
4. Cloudflare Access で認証を設定する
5. 再デプロイして動作確認する

## 免責事項

この手順は参考情報として提供しています。Cloudflare の仕様変更により画面や手順が異なる場合があります。デプロイや設定に伴う費用・トラブルについては自己責任でお願いします。

## 前提条件

- [Cloudflare アカウント](https://dash.cloudflare.com/sign-up)を作成済みであること
- Node.js (v22 以上) がインストールされていること
- pnpm がインストールされていること
- リポジトリを fork し、`pnpm install` で依存パッケージをインストール済みであること

## D1データベースとR2バケットを作成

### D1データベースの作成

```
pnpm wrangler d1 create 400-diary-db
```

出力例:

```
✅ Successfully created DB '400-diary-db' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "_400_diary_db"
database_name = "400-diary-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

wrangler.toml の `database_id` を出力された値に更新する。

```
[[d1_databases]]
〜
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### R2バケットの作成

```
pnpm wrangler r2 bucket create 400-diary-images
```

出力例:

```
✅ Created bucket '400-diary-images' with default storage class of Standard.
```

### リモートDBにスキーマを適用

```
pnpm run db:migrate:remote
```

確認が求められるので `yes` を入力する。

### OGP画像用フォントをR2にアップロード

OGP画像の生成に使用する Klee One フォントを R2 バケットにアップロードする。

```
bash scripts/upload-fonts.sh
```

> [!NOTE]
> フォントは [fontworks-fonts/Klee](https://github.com/fontworks-fonts/Klee) (SIL Open Font License) から取得されます。このステップは初回のみ必要で、以降のデプロイでは不要です。

## デプロイ

Cloudflare Access の設定の前に行う。URLを取得してからAccessの設定を行うため。

```
pnpm run deploy
```

Enterで進めていけばOK。

```
✨ Deployment complete! Take a peek over at https://xxxxxxxxxx
```

ここでのURLは、`https://400-diary.pages.dev/` として進めます。

> [!WARNING]
> `400-diary` の部分は `wrangler.toml` の `name` の値に対応しており、Cloudflare Pages 全体でユニークである必要があります。既に使われている名前の場合はデプロイ時にエラーになるので、別の名前に変更してください。実際のURLをメモしておいてください。

## Cloudflare Access の設定

Cloudflareダッシュボードで行う。

### 1. Cloudflare Zero Trustのセットアップ

Cloudflare Zero Trust にアクセスする。

![Zero Trust ウェルカム画面](ZeroTrust_1.png)

「Get started」をクリック。

### 2. チーム名の設定

初回はチーム名を求められるので、好きな名前を入力する。

![チーム名の設定](ZeroTrust_2.png)

入力したチーム名がチームドメイン（`<チーム名>.cloudflareaccess.com`）になる。

### 3. プランの選択

プランは Free で OK。「Free を続ける」をクリック。

![プラン選択画面](ZeroTrust_3.png)

### wrangler.toml を更新

```
CF_ACCESS_TEAM_DOMAIN = "<チーム名>.cloudflareaccess.com"
```

### 4. Access アプリケーションの作成

Zero Trust ダッシュボードで Access > アプリケーション に移動し、「アプリケーションを追加する」をクリック。

![アプリケーション一覧画面](ZeroTrust_4.png)

### 5. セルフホストを選択

「セルフホスト」を選択する。

![アプリケーションタイプの選択](ZeroTrust_5-1.png)

### 6. アプリケーションの基本情報とポリシー作成

「+ 新しいポリシーを作成する」をクリック。

![基本情報とポリシー作成](ZeroTrust_5-2.png)

### 7. ポリシーの設定

以下を入力する:

1. ポリシー名: allow-owner（任意の名前でOK）
2. アクション: Allow（そのまま）
3. ルールのセレクター: ドロップダウンから Emails を選択
4. 値: 自分のメールアドレスを入力

![ポリシー設定画面](ZeroTrust_5-3.png)

### 8. ポリシーの確認

作成したポリシーが一覧に表示される。

![ポリシー確認画面](ZeroTrust_5-4.png)

### 9. アプリケーション情報の入力

以下を設定する:

1. アプリケーション名: 400-diary（任意）
2. 「+ パブリック ホスト名を追加」をクリック
3. ドメイン: 自身のURLを選択
4. パス: `auth/400_diary` を入力（このパスのみに認証をかける。トップページや公開日記ページは認証不要のまま）
5. Access ポリシーで作成したポリシー（allow-owner）を選択

![アプリケーション情報の入力](ZeroTrust_5-5.png)

### 10. ログイン方法の設定

デフォルト（One-time PIN）のままでOK。「次へ」をクリック。

![ログイン方法の設定](ZeroTrust_5-6.png)

### 11. エクスペリエンス設定

デフォルトのままでOK。次のステップへ進む。

![エクスペリエンス設定](ZeroTrust_5-7.png)

### 12. 詳細設定

デフォルトのままでOK。「保存」をクリック。

![詳細設定](ZeroTrust_5-8.png)

### 13. アプリケーションの作成完了

アプリケーション一覧にアプリケーションが表示される。

![アプリケーション作成完了](ZeroTrust_5-9.png)

### 14. AUD の確認

アプリケーション一覧から作成したアプリケーションの右端の三点メニューから「編集」を開き、Application Audience (AUD) Tag を確認する。

![AUD の確認](ZeroTrust_5-10.png)

### wrangler.toml を更新

確認した AUD を設定する。

```
CF_ACCESS_AUD = "<確認した AUD の値>"
```

## 再デプロイと動作確認

wrangler.toml の更新を反映するために再デプロイする。

```
pnpm run deploy
```

デプロイ完了後、トップページにアクセスして動作確認する。

![トップページの表示](default.png)

> [!NOTE]
> 左上のアプリ名は `wrangler.toml` の `APP_NAME` で変更できます。

以下を確認する:

1. トップページに認証なしでアクセスできること
2. 「日記を書く」ボタンが表示されていないこと（未認証状態）
3. `https://<自身のURL>/auth/400_diary` にアクセスすると Cloudflare Access のログイン画面が表示されること

![Cloudflare Access ログイン画面](auth.png)

4. メールアドレスを入力し、ワンタイムコードで認証後、トップページにリダイレクトされること
5. 認証後「日記を書く」ボタンが表示され、日記の作成・編集・公開ができること

### 認証の解除

以下のURLにアクセスするとログアウトできる。

```
https://<チームドメイン>/cdn-cgi/access/logout
```

または、ブラウザの開発者ツールから `CF_Authorization` Cookie を削除しても同じ効果がある。
