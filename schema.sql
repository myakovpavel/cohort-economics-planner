CREATE TABLE IF NOT EXISTS app_config (
  config_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
