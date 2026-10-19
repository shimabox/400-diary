# 公開日記ページに「ほかの日をめぐる」リンクを付ける 実装計画

- 日付: 2026-10-19
- リポジトリ: github.com/shimabox/400-diary
- ベースブランチ: main
- ベース SHA: 8569d40ab0f438c2ad9b72765d279c9ffde9eb18
- 作業ブランチ: plan/2026-10-19-random-other-day
- 起案担当: 予定 claude-fable-5-1 / high。確認済み: claude-fable-5-1（CLI の結果メタデータの modelUsage で確認）。effort は結果に含まれず未確認
- 計画レビュー担当: 予定 gpt-6-astra / high（独立した新規セッション、読み取り専用）。未実行
- 編成の例外理由: なし
- 実装担当: claude-opus-5-5 / high（Claude Code 実行時の通常段）。境界が明確でない設計を含むため下位モデルは使わない
- 実装レビュー担当: 予定 gpt-6.1-sol / high（通常段）。実装レビューが通常段で 3 回合格しなければ、実装を claude-fable-5-1 / high、レビューを gpt-6-astra / high に上げる
- 計画書の扱い: レビュー・privacy 検査後に作業ブランチへ commit する（docs/plans/2026-10-19-random-other-day/ に plan.md と request.md。実装の変更とは別の commit にしてよい）
- 公開範囲: 実装担当は作業ブランチへの commit まで。push と PR は利用者の依頼があってから采配役が行う。本番デプロイは利用者が手元で `pnpm run deploy` を実行する（自動デプロイなし）

## 背景・目的

公開中の日記ページ `/d/:id` は、日記（スクロールフレーム）の下に何もなく、読み終えた訪問者が次の日記へ進む手段がトップへ戻ることしかない。日記のすぐ下に「ほかの日をめぐる」リンクを置き、押すたびにサーバーが、いま見ている日記以外の公開中の日記を 1 つ選び直して案内することで、いろいろな日を巡るように読み進められるようにする。

行き先はリンクを押した時にサーバーが選ぶ。日記ページの HTML には固定の URL（`/random?from=<今の日記の ID>`）だけを埋め、ランダムな行き先そのものは埋めない。これにより日記ページの HTML はリクエストごとに変わらず、キャッシュや OGP に影響しない。JavaScript も使わない。

## スコープ

対象:
- `/random` ルートの新設。公開中（`published_snapshot_id IS NOT NULL`）かつ `from` 以外の日記を 1 つランダムに選び、`/d/<id>` へ 302 リダイレクトする
- D1 操作の追加。ランダムに 1 件選ぶ関数と、「ほかに公開中の日記があるか」を安価に判定する関数
- `/d/:id` にリンクを追加。ほかに公開中の日記が 1 つもないときは出さない
- 上記のユニットテスト、既存テストのモック更新
- `public/robots.txt` に `Disallow: /random` を追加
- docs/architecture の更新（ディレクトリ構造、画面遷移の表、認証の影響範囲）

対象外:
- トップページ、編集画面、下書きの扱いの変更
- 「前の日 / 次の日」など日付順のナビゲーション
- クライアント側 JavaScript の追加、Islands の追加
- D1 のインデックス追加やスキーママイグレーション（数百件の規模では不要。方針に理由を書く）
- 紹介ページ（site/）の更新

## 方針

### 確定した設計

**1. `/random` ルート（新規 `app/routes/random.ts`）**

`rss.xml.ts` や `auth/[name].tsx` と同じく `createRoute` で書く純粋なサーバールート。認証は不要（公開ページから押すため）。

- クエリ `from` を読む（無ければ除外なし。`/random` 単体でも「公開中のどれか」へ飛べる）
- `pickRandomPublishedDiaryId(db, from)` で 1 件選ぶ
- 選べたら `302` で `Location: /d/<id>` へ。選べなければ（公開中の日記が 0 件、または `from` しかない）`302` で `/` へ
- レスポンスに `Cache-Control: no-store` を付ける。同じ URL（`/random?from=X`）でも押すたびに選び直すのが仕様なので、キャッシュによって選び直しが省かれないよう、ブラウザ・中間キャッシュに結果を持たせない。選び直しで除くのは `from` だけで、それより前に見た日記を再び選ぶことはある（公開中が 2 件なら毎回もう一方になる）。既存の 302 ルート（`auth/[name].tsx`）と同じく Hono の `c.redirect`（既定 302）を使い、ヘッダは `c.header` で先に付ける

**2. D1 操作（`app/lib/db.ts` に追加）**

```ts
/** ほかの日をめぐる用: 公開中の日記から excludeId 以外を 1 件ランダムに選ぶ */
export async function pickRandomPublishedDiaryId(
  db: D1Database,
  excludeId: string | null,
): Promise<string | null>
// SELECT id FROM diaries
//  WHERE published_snapshot_id IS NOT NULL [AND id != ?]
//  ORDER BY RANDOM() LIMIT 1

/** 公開ページ用: excludeId 以外に公開中の日記があるか（リンクを出すかの判定） */
export async function hasOtherPublishedDiary(
  db: D1Database,
  excludeId: string,
): Promise<boolean>
// SELECT id FROM diaries
//  WHERE published_snapshot_id IS NOT NULL AND id != ?
//  LIMIT 1
```

- `ORDER BY RANDOM() LIMIT 1` は D1（SQLite）でそのまま使える。公開中の行を全走査するため、1 クリックあたりの「読み込み行数」はおおむね日記の総数に等しい。数百件なら 1 クリック数百行で、無料枠（1 日 500 万行）に対して 1 日あたり約 1 万回クリックされても収まる。個人の日記では十分
- `hasOtherPublishedDiary` は `LIMIT 1` なので、最初の該当行が見つかった時点で走査を止められる。ただしベースのスキーマには `published_snapshot_id` のインデックスが無いため、読み込む行数はデータの分布（公開中の日記が見つかるまでに下書きが何件並ぶか）に依存し、ほかに公開中の日記があっても、それを見つけるまでに多くの下書きを読むことがある。該当が無いとき（ほかに公開中の日記が無いとき）は全件を読み得る。いずれにしても、数百件なら無料枠に対して問題にならない。`ORDER BY RANDOM()` は該当の有無に関わらず公開中の行を全部読むので、ページ表示のたびには使わない
- `excludeId` は bind で渡す。`from` に存在しない ID や空文字が来ても `id != ?` が成り立つだけで、SQL インジェクションの経路にはならない

**3. `/d/:id` のリンク（`app/routes/d/[id].tsx`）**

- `getDiaryWithSnapshot` が結果を返した後（404 分岐の後）に `hasOtherPublishedDiary(db, diary.id)` を呼ぶ。404 のときは無駄な問い合わせをしない
- スクロールフレームを包む `max-width:960px; width:100%` のブロックの **次の兄弟** として、次を置く。親は `flexDirection: 'column'` かつ `alignItems: 'center'` なので、ブロックをそのまま置けば中央に来る

```tsx
{hasOther && (
  <div style={{ paddingTop: '1rem' }}>
    <a
      href={`/random?from=${encodeURIComponent(diary.id)}`}
      rel="nofollow"
      style={{
        display: 'inline-block',
        padding: '0.6rem 0.75rem',
        fontSize: '0.85rem',
        color: 'var(--fg-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      ほかの日をめぐる
    </a>
  </div>
)}
```

- 見た目は枠のない文字だけのリンクにし、トップページのフッターのリンク（X・GitHub・RSS）と同じく小さめの文字（0.85rem）・`--fg-muted` の色・下線なしにする。日記の下でボタンとして主張せず、さりげなく置くため。色は CSS 変数に任せるので、ライト・ダークとも既存の配色に従う
- 文字だけだと押せる範囲が狭いので、見た目を変えずに `display: inline-block` と上下左右の padding で押せる範囲を広げる（スマホで指で押しやすくする）
- ログイン中の書き手にも訪問者と同じく出す（公開ページは誰にとっても同じ見え方、という既存の方針に合わせる）
- `rel="nofollow"` と robots.txt の `Disallow: /random` は、クローラーが `/random` を辿り続けて D1 の読み込みを消費するのを抑えるため（未確定事項 3 を参照）。nofollow はクローラーへのお願いにとどまるので、robots.txt で `/random` そのものを巡回対象から外す
- フレームを包むブロックの中には入れない。既存テストがフレームのラッパーを `<div style="max-width:960px;width:100%"><div class="paper-frame"` という文字列で検証しており、その構造を保つ

**4. SPA ナビゲーションとの関係（変更なし）**

リンクは同一オリジンで `/api/` でも `/static/` でもないため、既存の `spa-navigation.ts` がインターセプトする。`fetch` は 302 を辿って `/d/<id>` の HTML を受け取り、`res.redirected` が真なので履歴には最終 URL `/d/<id>` が積まれる。この挙動は既に `docs/architecture/overview.md` に書かれており、ログイン切れの `/new` と同じ経路で動く。`Cache-Control: no-store` により、戻ってから再度押したときに `fetch` がキャッシュを返すこともない。JS が無効なら通常のリンクとして同じ 302 を辿る。

### 主要な契約・不変条件

- `/random` は下書き（`published_snapshot_id IS NULL`）を決して返さない
- `/random?from=X` は `X` を返さない（`X` 以外に公開中の日記があるとき）
- `/random` の応答は常に 302 であり、本文の HTML を持たない。`Cache-Control: no-store` を必ず持つ
- `/d/:id` の HTML はリクエストごとに変わらない。変わるのは「ほかに公開中の日記があるか」が変わったとき（公開・非公開・削除）だけ
- `/d/:id` にリンクを出すかの判定と `/random` の選択条件は、どちらも「公開中かつ自分以外」で一致させる。片方だけ条件を変えない

### 選ばなかった代替案と理由

| 代替案 | 退けた理由 |
|---|---|
| 日記ページの HTML に行き先をあらかじめ埋める | ページがリクエストごとに変わり、キャッシュ・OGP・SPA の差し替えに影響する。要件で明示的に退けられている |
| クライアント JS で一覧を取得して選ぶ | JS を使わない要件に反する。公開中の ID 一覧を API で晒す必要も生じる |
| `COUNT(*)` と `OFFSET` の 2 クエリで選ぶ | 読み込み行数は `ORDER BY RANDOM()` と同じ（全走査 + OFFSET 分）で、クエリが 2 本になる分だけ複雑 |
| ID 一覧を全件取得して JS 側で選ぶ | 読み込み行数は同じで、転送量だけ増える |
| 存在判定にも `pickRandomPublishedDiaryId` を使い回す | ページ表示ごとに全走査が走る。`LIMIT 1` の存在判定なら最初の該当行で走査を止められる（読む行数はデータの分布に依存し、該当が無いときは全件を読み得るが、数百件なら無料枠に対して問題にならない） |
| リンクを常に出し、選べないときは `/random` が元のページへ戻す | 要件 3（ほかに無いときは出さない）に反する。押しても何も起きないリンクは体験が悪い |
| `published_snapshot_id` にインデックスを足す | 数百件では全走査でも十分で、マイグレーションを増やす理由がない。件数が万単位になったら再検討 |

## タスク分解

| # | タスク | 依存 |
|---|---|---|
| 1 | `app/lib/db.ts` に `pickRandomPublishedDiaryId` と `hasOtherPublishedDiary` を追加する | なし |
| 2 | `app/lib/db.test.ts` に 1 のテストを追加する（SQL の条件文字列、bind 値、`first()` が null のときの戻り値、`excludeId` が null のときに `id != ?` を付けない） | 1 |
| 3 | `app/routes/random.ts` を新設する（`from` の読み取り、302 と `Location`、`Cache-Control: no-store`、選べないときは `/`） | 1 |
| 4 | `app/routes/random.test.ts` を新設する（`rss.xml.test.ts` の `createApp` を踏襲し、`~/lib/db` の `pickRandomPublishedDiaryId` をモック） | 3 |
| 5 | `app/routes/d/[id].tsx` に `hasOtherPublishedDiary` の呼び出しとリンクを追加する | 1 |
| 6 | `app/routes/d/[id].test.ts` を更新する。`vi.mock('~/lib/db', ...)` のファクトリに `hasOtherPublishedDiary: vi.fn()` を追加しないと、既存テストがモック未定義で落ちる。表示あり・なし・位置のテストを足す | 5 |
| 7 | `public/robots.txt` に `Disallow: /random` を足す | 3 |
| 8 | `docs/architecture/overview.md`（ディレクトリ構造に `random.ts`、画面遷移の表に行を追加）と `docs/architecture/authentication.md`（Public に `/random`）を更新する | 3, 5 |
| 9 | `pnpm run typecheck`、`pnpm run lint`、`pnpm vitest run`、`pnpm run build` を通す | 1〜8 |
| 10 | dev サーバーで動作確認（完了条件の手動確認を実施） | 9 |

コミットは次の 4 つに分ける想定。(a) 1+2、(b) 3+4+7、(c) 5+6、(d) 8。各メッセージには「押した時にサーバーが選ぶ理由（HTML を固定してキャッシュ・OGP に影響させない）」「存在判定を `LIMIT 1` にした理由（D1 の読み込み行数）」など、なぜそうしたかを書く。

## 完了条件・受け入れ基準

自動検証:
- [ ] `pnpm run typecheck` が通る
- [ ] `pnpm run lint` が通る
- [ ] `pnpm vitest run` が全件通る（既存テストを含む）
- [ ] `pnpm run build` が通る
- [ ] `db.test.ts`: `pickRandomPublishedDiaryId` の SQL に `published_snapshot_id IS NOT NULL`、`id != ?`、`ORDER BY RANDOM()`、`LIMIT 1` が含まれ、bind 値が `['diary-1']`
- [ ] `db.test.ts`: `pickRandomPublishedDiaryId(db, null)` の SQL に `id != ?` が含まれず、bind が空
- [ ] `db.test.ts`: `first()` が null なら `pickRandomPublishedDiaryId` は null、`hasOtherPublishedDiary` は false
- [ ] `random.test.ts`: `/random?from=diary-1` は 302、`Location` が `/d/<選ばれた id>`、`Cache-Control` が `no-store`、モックが `'diary-1'` で呼ばれる
- [ ] `random.test.ts`: モックが null を返すと 302 で `Location: /`
- [ ] `random.test.ts`: `from` 無しではモックが `null` で呼ばれる
- [ ] `[id].test.ts`: `hasOtherPublishedDiary` が true なら body に `href="/random?from=diary-1"` と `ほかの日をめぐる` が含まれ、`class="paper-frame"` より後ろに現れる
- [ ] `[id].test.ts`: false なら body に `/random?from=` が含まれない
- [ ] `public/robots.txt` に `Disallow: /random` があり、既存の `Allow: /` は残っている
- [ ] `[id].test.ts`: 既存の og:image・フレーム幅のテストが変更なしで通る

手動確認（`pnpm run dev`、localhost:5173、ローカル D1。Playwright はリポジトリ外の一時ディレクトリで使い、成果物をリポジトリに持ち込まない）:
- 手動確認では、ローカル D1 にもともとある日記の内容と公開状態を変えない。公開中が 1 件だけ・0 件の状態の確認は、もともとのデータを変えずにできる方法（一時的な別の保存先で dev サーバーを起動する、など）で行う。そうした方法が用意できなければ、その項目は単体テストと curl での確認に代え、手動では確認していないことを報告する。確認のために作った日記は、自分が作ったものだけを消す。
- [ ] 公開中の日記を 3 件以上用意し、`/d/<id>` でフレームのすぐ下・中央に「ほかの日をめぐる」が枠のない文字だけ（フッターのリンクと同じ小さめ・薄い色・下線なし）で出る。スマホ幅でも文字のまわりの余白ごと押せる
- [ ] 押すたびに、押す直前の日記とは別の公開中の日記へ移り、アドレスバーが `/d/<別の id>` になる（SPA 経由で最終 URL が履歴に積まれる）。10 回ほど繰り返し、どのクリックでも押す直前の日記と同じ日記にはならない（それより前に見た日記に戻ることはあってよい）
- [ ] 下書きだけの日記が混ざっていても、下書きへは一度も飛ばない
- [ ] 公開中の日記が 1 件だけのとき、その日記のページにリンクが出ない
- [ ] 公開中の日記が 0 件のとき、`/random` を直接開くと `/` へ戻る
- [ ] ブラウザの戻るで元の日記へ戻れ、もう一度押すと再び別の日記へ移る
- [ ] ダークモード（OS 設定）でも文字の色が周囲と調和し、読める
- [ ] ログイン中（`DEV_AUTH_BYPASS=true`）でも同じ位置に同じリンクが出る
- [ ] curl で確認:

```sh
curl -i 'http://localhost:5173/random?from=<公開中の id>'
# HTTP/1.1 302、Location: /d/<別の id>、Cache-Control: no-store
```

## 未確定事項・リスクと判断の委ね方

| 項目 | 内容 | 実装時の扱い |
|---|---|---|
| 1. 選べないときの `/random` の行き先 | リンクが隠れるため通常は到達しないが、直接 URL を開いた場合の挙動 | 確定: `/` へ 302 |
| 2. `from` が無い `/random` の扱い | 除外なしで公開中のどれかへ移すか、400 にするか | 確定: 除外なしで公開中のどれかへ |
| 3. クローラーに `/random` をたどらせるか | クローラーが `/random` を辿り続けると D1 の読み込みを消費する | 確定: たどらせない。リンクに `rel="nofollow"` を付け、既存の `public/robots.txt`（現在は `User-agent: *` と `Allow: /` だけ）に `Disallow: /random` を足す |
| 4. リンク上の余白 | フレームとリンクの間隔。`paddingTop: 1rem` に、リンク自身の上 padding（0.6rem）が加わる | 実装担当が dev サーバーで見て、フレームとリンクの間が 1rem〜2rem に見える範囲で調整してよい。テストは余白の値を検証しない |
| 5. `docs/architecture/database.md` の更新要否 | 資料に内容が無い。クエリ一覧やテーブル利用箇所を列挙していれば追記対象 | 実装担当が確認し、該当する節があれば 2 関数を追記する。無ければ overview.md と authentication.md のみ |
| 6. リダイレクトの status | 302（Hono 既定、既存の `auth/[name].tsx` と同じ）か 303/307 | 推奨 302。GET のみなので差はなく、既存コードと揃える |
| リスク: `vi.mock` のファクトリ更新漏れ | `[id].test.ts` のモックは `getDiaryWithSnapshot` しか定義していない。追加した関数を忘れると既存テストが全滅する | タスク 6 で必ず同時に更新する。`vi.fn()` の既定戻り値は undefined でリンク非表示になるため、既存テストはそのまま通る |
| リスク: 日記が増えたときの読み込み行数 | `ORDER BY RANDOM()` は全走査。数千件を超えると 1 クリックの行数が増える | 現状は対象外。件数が万単位になった時点で `published_snapshot_id` のインデックスや ID 一覧のキャッシュを検討する旨を docs に一言書く |

## 公開経路

1. 実装担当は作業ブランチ `plan/2026-10-19-random-other-day` に上記 4 つの実装の commit（承認済みの plan.md と request.md は、それとは別の commit にしてよい）を積み、`pnpm run typecheck`、`pnpm run lint`、`pnpm vitest run`、`pnpm run build` の結果と手動確認の結果を報告する
2. 実装レビュー担当がレビューする
3. push と PR の作成は利用者の依頼があってから采配役が行う
4. main へ取り込まれた後、本番への反映は利用者が手元で `pnpm run deploy` を実行する（ビルド、リモート D1 マイグレーション、Pages deploy）。今回はマイグレーションが無いため D1 の変更は走らない。GitHub Actions の自動デプロイはアプリには無い（紹介ページ site/ の GitHub Pages だけ）
5. デプロイ後、本番の公開中の日記ページでリンクの表示と遷移、`curl -i` で 302 と `Cache-Control: no-store` を確認する
