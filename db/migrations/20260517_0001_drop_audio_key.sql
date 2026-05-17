-- 既存DB向け: 音声添付機能で使っていた未使用カラムを削除する
ALTER TABLE diaries DROP COLUMN audio_key;
ALTER TABLE diary_snapshots DROP COLUMN audio_key;
