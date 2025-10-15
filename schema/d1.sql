-- D1 schema for cf_ai_logwhisperer
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active DATETIME,
  ip TEXT,
  user_agent TEXT,
  title TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  kind TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  cmd TEXT,
  why TEXT,
  risk TEXT CHECK(risk IN ('low','med','high')),
  accepted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  title TEXT,
  vendor TEXT,
  signature TEXT,
  guidance TEXT
);
