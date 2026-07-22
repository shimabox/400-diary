# Image Upload & Storage

## Overview

Cloudflare R2 を使った画像のアップロード・配信・削除。日記1件につき画像1枚。テキストの回り込みレイアウトと連携する。

## R2 ストレージ構成

```
R2 Bucket: 400-diary-images
└── diaries/
    └── {diaryId}/
        └── {timestamp}-{id}.{ext}    ← 例: diaries/abc123/1712345678-a1b2c3d4.jpg
```

- キー生成: `diaries/${diaryId}/${Date.now()}-${nanoid(8)}.${ext}`
- タイムスタンプと短いランダム ID でユニーク性を保証（同じ日記への再アップロードで上書きしない）

## バリデーション

| チェック | 制限 | エラーメッセージ |
|---------|------|----------------|
| ファイル形式 | JPEG, PNG, WebP, GIF | 「JPEG, PNG, WebP, GIF のみアップロードできます」 |
| ファイルサイズ | 10MB以下 | 「画像は10MB以内にしてください」 |

クライアント側とサーバー側の両方でバリデーション（多層防御）。

## 前提条件

画像アップロードは `POST /api/diaries/:id/image` で日記IDを必要とするため、**日記を一度保存してからでないと画像を追加できない**。新規作成時はまず本文を保存し、その後に画像をアップロードする流れになる。

## アップロードフロー

```mermaid
sequenceDiagram
    actor User
    participant ImageEditor as ImageAttachmentEditor
    participant API as /api/diaries/:id/image
    participant R2 as Cloudflare R2
    participant DB as D1

    User->>ImageEditor: 画像ファイルを選択
    ImageEditor->>ImageEditor: クライアント側バリデーション (形式・サイズ)
    ImageEditor->>ImageEditor: FileReader でプレビュー生成
    ImageEditor->>API: POST FormData { file }
    API->>API: サーバー側バリデーション
    API->>R2: bucket.put(key, data, contentType)
    API->>DB: UPDATE diaries SET image_key = key
    API->>API: 旧画像が snapshot 参照中か確認
    API->>R2: 参照されていなければ旧画像を削除
    API-->>ImageEditor: { image_key: key } (201)
    ImageEditor->>ImageEditor: プレビュー更新
```

DB 更新は R2 アップロード後に行う。旧画像の R2 削除は `deleteMediaIfOrphan` 経由の best-effort で、削除に失敗してもレスポンスは成功のまま返す。

## 画像配信フロー

```mermaid
sequenceDiagram
    participant Browser
    participant API as /api/images/:key
    participant R2 as Cloudflare R2

    Browser->>API: GET /api/images/diaries/abc/1712345678.jpg
    API->>R2: bucket.get(key)
    R2-->>API: R2Object { body, httpMetadata }
    API-->>Browser: Response (Content-Type, Cache-Control: immutable)
```

### キャッシュ戦略

```
Cache-Control: public, max-age=31536000, immutable
```

- 1年間キャッシュ
- `immutable`: 画像は変更されない（タイムスタンプベースのキーのため安全）
- 画像の差し替え時は新しいキーが生成される

## 削除フロー

### 画像の差し替え

```mermaid
flowchart TD
    A[ImageAttachmentEditor で新画像を選択] --> B["POST /api/diaries/:id/image"]
    B --> C[新キーで R2 に保存]
    C --> D["UPDATE diaries SET image_key = newKey"]
    D --> E["deleteMediaIfOrphan(oldKey)"]
    E --> F{"snapshot が参照中?"}
    F -->|Yes| G["旧 R2 object は残す"]
    F -->|No| H["旧 R2 object を削除"]
```

### 画像の削除

```mermaid
flowchart TD
    A["DELETE /api/diaries/:id/image"] --> B["diary.image_key を取得"]
    B --> C{"image_key がある?"}
    C -->|No| D["204 を返す"]
    C -->|Yes| E["UPDATE diaries SET image_key = NULL"]
    E --> F["deleteMediaIfOrphan(image_key)"]
    F --> G{"snapshot が参照中?"}
    G -->|Yes| H["R2 は残す"]
    G -->|No| I["R2 から削除"]
    H --> J["204 を返す"]
    I --> J
```

DB 更新を先に行い、DB 更新に失敗した場合は R2 を削除しない。公開スナップショットが参照している画像も削除しない。

### 日記の削除時

```mermaid
flowchart TD
    A["DELETE /api/diaries/:id"] --> B[diary.image_key を取得]
    A --> C["listSnapshotImageKeys(db, id)"]
    B & C --> D[全 image_key を Set で重複除去]
    D --> E["Promise.allSettled で R2 から best-effort 一括削除"]
    E --> F["DELETE FROM diaries (CASCADE で snapshots も削除)"]
```

- 下書きの画像キーとスナップショットの画像キーを両方収集
- R2 のオーファン画像を防ぐ

## 画像レイアウト

画像は `image_x` / `image_y`（REAL, nullable）で任意の座標に配置できる。プレビュー画面ではドラッグで自由に移動可能。

- `image_x` / `image_y` が設定されている場合: その座標に画像を配置
- `image_x` / `image_y` が null の場合: `image_layout`（`left` / `right`）からデフォルト位置を導出

表示サイズは `image_scale`（REAL, nullable）で調整できる。エディタのスライダー、またはプレビュー上のピンチ操作（指2本）で 0.5〜1.5 倍（null は 1.0 扱い）を指定する。自然サイズ（画像ファイル固有のピクセル寸法。`naturalWidth`/`naturalHeight`）を基準枠（コンテナ幅 30% / 高さ 256px）に収めたサイズが倍率 1.0 の基準で、そこに倍率を乗算した幅・高さを img に明示指定するため、基準枠より小さい画像でも倍率どおりに拡縮される。下限はタップ・視認性、上限はテキストの回り込み先の確保が理由。

```
自由配置（画像が中央付近）:
┌──────────────────────┐
│あいう   ┌──────┐     │
│えおか   │      │     │
│        │ 写真 │     │
│きくけ   │      │     │
│こさし   └──────┘     │
│すせそたちつてとな     │
└──────────────────────┘
  ↕ 画像と重なる列は上下に分割
```

FlowText コンポーネントが `computeSlots` で画像を障害物として扱い、重なる列を上下に分割してテキストの回り込みを実現する。

## storage.ts の関数

| 関数 | 用途 |
|------|------|
| `validateImage(size, type)` | 形式・サイズチェック |
| `generateImageKey(diaryId, mime)` | R2 キー生成 |
| `uploadImage(bucket, key, data, contentType)` | R2 へアップロード |
| `getImage(bucket, key)` | R2 から取得 (body + contentType) |
| `deleteImage(bucket, key)` | R2 から削除 |

## セキュリティ上の考慮

### 未公開日記の画像アクセス

`GET /api/images/diaries/...` エンドポイントは**認可チェックを行いません**。そのため、URL を知っていれば誰でも画像を取得できます。未公開日記の画像でも同様です。

このポリシーが受容可能なリスクと判断している理由：

1. **キーの推測困難性**: 画像キーは `diaries/{diaryId}/{timestamp}-{nanoid(8)}.{ext}` 形式で生成されます。`nanoid(8)` は約 281兆通りの組み合わせを持ち、タイムスタンプとの組み合わせで実質的に推測が不可能です
2. **単一ユーザー前提**: 本アプリケーションは単一ユーザーの個人日記を想定した設計です。アップロードできるのはオーナーのみであり、URL を知られる機会は限定的です
3. **露出するのは画像のみ**: 仮に URL が漏れても露出するのは画像単体で、日記本文は露出しません。本文の公開制御は snapshot の仕組み（未認証時は公開 snapshot のみ返す）で担保されています

### 将来の運用における認可チェック追加の検討

以下のシナリオでは、認可チェック機構の追加が**必要になります**：

- マルチユーザー化: 複数ユーザーが同じシステムを使用する場合
- 機密性の高い画像: 非公開日記に企業資料・個人情報など高機密の画像が含まれる可能性がある場合

### エンドポイント露出制御

`diaries/` プレフィックス以外の R2 オブジェクト（`fonts/` や `og/` など内部用途）は、このエンドポイント経由では配信されません（`app/routes/api/images/[...key].ts` で prefix チェック）。これにより、意図しない内部オブジェクトの外部露出を防いでいます。

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `app/lib/storage.ts` | R2 操作・バリデーション |
| `app/lib/media-cleanup.ts` | snapshot 参照を考慮した R2 孤児削除 |
| `app/routes/api/diaries/[id]/image.ts` | アップロード・削除 API |
| `app/routes/api/images/[...key].ts` | 画像配信エンドポイント |
| `app/routes/api/diaries/[id].ts` | 日記削除時の画像 R2 クリーンアップ |
| `app/islands/image-attachment-editor.tsx` | アップロード・削除 UI、ローカル preview 生成 |
| `app/islands/vertical-editor.tsx` | 編集画面での画像 state / 座標 state の保持と子コンポーネントへの受け渡し |
| `app/islands/flow-text.tsx` | 画像回り込みレイアウト |
| `app/lib/db.ts` | `listSnapshotImageKeys` (削除時の R2 クリーンアップ) |
