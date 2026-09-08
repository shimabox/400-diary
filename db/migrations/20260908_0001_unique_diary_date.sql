-- 下書き・公開を問わず、日記の日付を1日1件に制限する。
-- 既存の重複は削除・統合せず、ユニーク索引の作成を失敗させる。
CREATE UNIQUE INDEX idx_diaries_diary_date_unique ON diaries(diary_date DESC);
DROP INDEX idx_diaries_diary_date;
