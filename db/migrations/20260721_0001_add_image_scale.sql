-- 既存DB向け: 画像の表示倍率を追加する (0.5〜1.5, null は 1.0 扱い)
ALTER TABLE diaries ADD COLUMN image_scale REAL;
ALTER TABLE diary_snapshots ADD COLUMN image_scale REAL;
