-- 既存DB向け: 日記の読み上げ音声の R2 キーと「訪問者も声で聞ける」を追加する
-- speech_public は既存の日記も新しい日記もオフ (0) で始まる
ALTER TABLE diaries ADD COLUMN speech_key TEXT;
ALTER TABLE diaries ADD COLUMN speech_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE diary_snapshots ADD COLUMN speech_key TEXT;
ALTER TABLE diary_snapshots ADD COLUMN speech_public INTEGER NOT NULL DEFAULT 0;
