-- AstroBin Depth Translator — analytics storage (D1 / SQLite)
-- One row per opt-in event. data holds the event-specific JSON.

CREATE TABLE IF NOT EXISTS events (
  row_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  install_id  TEXT,      -- random per-install id (no personal info)
  v           TEXT,      -- extension version, e.g. "0.1.0"
  event       TEXT,      -- opt_in | rig_saved | custom_gear | image_analyzed | error
  ts          INTEGER,   -- event time (epoch ms, from the browser)
  data        TEXT,      -- event payload as JSON text
  received_at INTEGER    -- server receive time (epoch ms)
);

CREATE INDEX IF NOT EXISTS idx_events_event   ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_install ON events(install_id);
