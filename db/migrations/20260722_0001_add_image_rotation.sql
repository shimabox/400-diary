-- 既存DB向け: 画像の回転角(度)を追加する (-15〜15, null は 0 扱い)
ALTER TABLE diaries ADD COLUMN image_rotation REAL;
ALTER TABLE diary_snapshots ADD COLUMN image_rotation REAL;
