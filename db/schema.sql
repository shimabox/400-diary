CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY,                -- nanoid(12)
  body TEXT NOT NULL,                  -- 本文 (最大400文字)
  image_key TEXT,                      -- R2オブジェクトキー (nullable)
  background_color TEXT NOT NULL,      -- HEX (#FFE4E1等)
  published_at TEXT,                   -- nullなら下書き
  image_layout TEXT NOT NULL DEFAULT 'left', -- 画像配置 (left / right)
  mood TEXT,                              -- 感情カテゴリ (happy/calm/sad/angry/anxious/fun)
  diary_date TEXT NOT NULL,            -- 対象日 (YYYY-MM-DD)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_diaries_diary_date ON diaries(diary_date DESC);
CREATE INDEX IF NOT EXISTS idx_diaries_published_at ON diaries(published_at);
