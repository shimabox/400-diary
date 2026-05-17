# Database & Publishing

## Overview

Cloudflare D1 (SQLite) を使用。下書きと公開スナップショットを分離した2テーブル構成。

## テーブル構成

```mermaid
erDiagram
    diaries ||--o{ diary_snapshots : "has many"
    diaries {
        TEXT id PK "nanoid(12)"
        TEXT body "本文 (max 400字)"
        TEXT image_key "R2オブジェクトキー"
        TEXT image_layout "left / right"
        REAL image_x "画像X座標 (nullable)"
        REAL image_y "画像Y座標 (nullable)"
        TEXT background_color "HEX (#FFE4E1等)"
        TEXT mood "happy/calm/sad/angry/anxious/fun"
        TEXT diary_date "YYYY-MM-DD"
        TEXT published_snapshot_id FK "公開中のスナップショット"
        TEXT created_at
        TEXT updated_at
    }
    diary_snapshots {
        TEXT id PK "nanoid(12)"
        TEXT diary_id FK "diaries.id"
        TEXT body
        TEXT image_key
        TEXT image_layout
        REAL image_x
        REAL image_y
        TEXT background_color
        TEXT mood
        TEXT published_at
    }
```

## 公開フロー

```mermaid
sequenceDiagram
    actor User
    participant Editor as VerticalEditor
    participant API as /api/diaries
    participant DB as D1

    User->>Editor: 本文を入力
    Editor->>API: POST /api/diaries (新規)
    API->>DB: INSERT INTO diaries
    DB-->>API: Diary { id: "abc" }
    API-->>Editor: { id: "abc" }

    User->>Editor: 編集して保存
    Editor->>API: PUT /api/diaries/abc
    API->>DB: UPDATE diaries SET body = ...
    DB-->>API: Updated Diary

    User->>Editor: 「公開する」ボタン
    Editor->>API: POST /api/diaries/abc/publish
    API->>DB: INSERT INTO diary_snapshots (現在のdiaryの値をコピー)
    API->>DB: UPDATE diaries SET published_snapshot_id = "snap1"
    DB-->>API: DiarySnapshot { published_at }
    API-->>Editor: { published_at: "2026-04-11T..." }
```

## 下書きと公開の関係

```mermaid
stateDiagram-v2
    [*] --> Draft: 新規作成
    Draft --> Draft: 保存（PUT）
    Draft --> Published: 公開する
    Published --> Published_with_changes: 下書き編集
    Published_with_changes --> Published: 再公開する
    Published_with_changes --> Published_with_changes: 保存（PUT）

    state Draft {
        direction LR
        diaries_only: diaries のみ
        note right of diaries_only: published_snapshot_id = NULL
    }
    state Published {
        direction LR
        synced: diaries + snapshot (一致)
    }
    state Published_with_changes {
        direction LR
        diverged: diaries + snapshot (差分あり)
        note right of diverged: 「未公開の変更」バッジ
    }
```

## 一覧の表示ロジック

| 認証状態 | 表示対象 | カード本文 | バッジ |
|---------|---------|-----------|--------|
| 認証済み | 全日記 | 公開版 (snapshot_body) 優先 | 未公開: 「下書き」 / 差分あり: 「未公開の変更」 |
| 未認証 | 公開済みのみ | 公開版 (snapshot_body) | なし |

## 削除時のクリーンアップ

```
DELETE /api/diaries/:id
  1. diary の image_key を取得
  2. 全 snapshot の image_key を取得 (listSnapshotImageKeys)
  3. 重複除去して画像を R2 から best-effort で一括削除
  4. OGP キャッシュを R2 から best-effort で削除
  5. DELETE FROM diaries (CASCADE で snapshots も削除)
```

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `db/schema.sql` | テーブル定義 |
| `db/migrations/*.sql` | 既存DB向けの個別 migration |
| `app/lib/db.ts` | DB操作関数・型定義 |
| `app/routes/api/diaries.ts` | 新規作成 API |
| `app/routes/api/diaries/[id].ts` | 取得・更新・削除 API |
| `app/routes/api/diaries/[id]/publish.ts` | 公開 API |
