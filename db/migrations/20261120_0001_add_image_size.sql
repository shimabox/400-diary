-- 既存DB向け: 画像の表示寸法(px)を追加する。ブラウザが表示するときの幅と高さ
-- (EXIF の向きを反映した naturalWidth / naturalHeight)で、両方そろうか両方 NULL のどちらか。
-- NULL は寸法が分からない画像で、表示は読み込み後に組む
ALTER TABLE diaries ADD COLUMN image_width INTEGER;
ALTER TABLE diaries ADD COLUMN image_height INTEGER;
ALTER TABLE diary_snapshots ADD COLUMN image_width INTEGER;
ALTER TABLE diary_snapshots ADD COLUMN image_height INTEGER;
