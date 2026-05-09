-- 既存DB向け: 日記に音声添付用の R2 オブジェクトキーを追加する
ALTER TABLE diaries ADD COLUMN audio_key TEXT;
ALTER TABLE diary_snapshots ADD COLUMN audio_key TEXT;
