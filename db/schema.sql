-- diaries: 下書き（常に最新の編集状態）
CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY,                -- nanoid(12)
  body TEXT NOT NULL,                  -- 本文 (最大400文字)
  image_key TEXT,                      -- R2オブジェクトキー (nullable)
  audio_key TEXT,                      -- 音声R2オブジェクトキー (nullable)
  image_layout TEXT NOT NULL DEFAULT 'left', -- 画像配置 (left / right)
  image_x REAL,                        -- 画像X座標 (nullable: 未設定時はimage_layoutから導出)
  image_y REAL,                        -- 画像Y座標
  background_color TEXT NOT NULL,      -- HEX (#FFE4E1等)
  mood TEXT,                           -- 感情カテゴリ (happy/calm/sad/angry/anxious/fun)
  diary_date TEXT NOT NULL,            -- 対象日 (YYYY-MM-DD)
  published_snapshot_id TEXT,          -- 公開中のスナップショットID
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_diaries_diary_date ON diaries(diary_date DESC);

-- diary_snapshots: 公開スナップショット
CREATE TABLE IF NOT EXISTS diary_snapshots (
  id TEXT PRIMARY KEY,                 -- nanoid(12)
  diary_id TEXT NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  image_key TEXT,
  audio_key TEXT,
  image_layout TEXT NOT NULL DEFAULT 'left',
  image_x REAL,
  image_y REAL,
  background_color TEXT NOT NULL,
  mood TEXT,
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_diary_id ON diary_snapshots(diary_id);
