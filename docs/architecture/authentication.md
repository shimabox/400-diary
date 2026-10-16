# Authentication

## Overview

Cloudflare Access の JWT を検証するミドルウェア方式。アプリ側にユーザー管理機能はなく、認証はCloudflareのインフラ層に委譲する。

## 認証フロー

```mermaid
sequenceDiagram
    actor User
    participant CF as Cloudflare Access
    participant MW as Middleware
    participant Route as Route Handler

    User->>CF: /auth/400_diary にアクセス
    CF->>User: ログイン画面を表示
    User->>CF: メールアドレスを入力
    CF->>User: ワンタイムコードをメール送信
    User->>CF: コードを入力
    CF->>User: CF_Authorization Cookie をセット
    CF->>Route: /auth/400_diary にリダイレクト
    Route->>User: / にリダイレクト

    Note over User,Route: 以降のリクエスト

    User->>MW: リクエスト (Cookie: CF_Authorization=JWT)
    MW->>MW: JWT を検証
    MW->>Route: c.set('isAuthenticated', true)
    Route->>User: 認証済みコンテンツを返す
```

## JWT 検証の詳細

```mermaid
flowchart TD
    A[リクエスト受信] --> B{DEV_AUTH_BYPASS?}
    B -->|true| C[isAuthenticated = true]
    B -->|false| D[JWT トークンを取得]
    D --> E{Cf-Access-Jwt-Assertion ヘッダー}
    E -->|あり| F[トークン取得]
    E -->|なし| G{CF_Authorization Cookie}
    G -->|あり| F
    G -->|なし| H[isAuthenticated = false]
    F --> I{TEAM_DOMAIN & AUD 設定済み?}
    I -->|No| H
    I -->|Yes| J[verifyAccess]
    J --> K{アルゴリズム = RS256?}
    K -->|No| H
    K -->|Yes| L{aud クレーム一致?}
    L -->|No| H
    L -->|Yes| M{有効期限内?}
    M -->|No| H
    M -->|Yes| N[JWKS エンドポイントから公開鍵取得]
    N --> O{署名検証}
    O -->|失敗| H
    O -->|成功| C
```

## 認証の影響範囲

```mermaid
graph LR
    subgraph Public["公開 (認証不要)"]
        A["/ 一覧ページ"]
        B["/d/:id 公開ページ"]
        C["GET /api/diaries/:id"]
        D["GET /api/images/*"]
    end
    subgraph Protected["保護 (認証必須)"]
        E["/new 新規作成"]
        F["/edit/:id 編集"]
        G["POST /api/diaries"]
        H["PUT /api/diaries/:id"]
        I["DELETE /api/diaries/:id"]
        J["POST /api/diaries/:id/publish"]
        K["POST /api/diaries/:id/image"]
        L["DELETE /api/diaries/:id/image"]
    end
    subgraph Conditional["条件付き表示"]
        M["「日記を書く」ボタン"]
        N["「編集する」リンク"]
        O["ヒートマップのリンク先"]
        P["下書きバッジ"]
    end

    style Public fill:#e8f5e9
    style Protected fill:#ffebee
    style Conditional fill:#fff3e0
```

## 環境別の設定

| 環境 | 認証方式 | 設定 |
|------|---------|------|
| ローカル開発 | バイパス | `.dev.vars` に `DEV_AUTH_BYPASS=true` |
| 本番 | Cloudflare Access | `wrangler.toml` に `CF_ACCESS_TEAM_DOMAIN` と `CF_ACCESS_AUD` |

## JWKS キャッシュ

公開鍵は Cloudflare の JWKS エンドポイント (`https://{teamDomain}/cdn-cgi/access/certs`) から取得し、1時間キャッシュする。

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `app/routes/_middleware.ts` | 認証ミドルウェア |
| `app/lib/auth.ts` | JWT 検証ロジック (JWKS, 署名検証) |
| `app/factory.ts` | AppEnv 型定義 (Bindings, Variables) |
| `app/routes/auth/400_diary.tsx` | 認証エンドポイント (リダイレクトのみ) |
| `.dev.vars` | ローカル開発用設定 |
