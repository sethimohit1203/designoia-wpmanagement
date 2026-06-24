const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { dbDir } = require('../utils/paths');

const dataDir = dbDir;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'designoia.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'disconnected',     -- disconnected | qr | connected
  is_active INTEGER DEFAULT 0,            -- currently the global active sender
  daily_limit INTEGER DEFAULT 200,
  cooldown_minutes INTEGER DEFAULT 60,
  messages_sent_today INTEGER DEFAULT 0,
  last_reset_date TEXT,
  cooldown_until TEXT,
  ban_risk_score INTEGER DEFAULT 0,       -- 0-100
  last_activity TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  group_name TEXT DEFAULT 'All',
  tags TEXT DEFAULT '',
  status TEXT DEFAULT 'active',           -- active | inactive
  vehicle TEXT,
  custom_fields TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Marketing',      -- Marketing | Transactional | Onboarding | Sales
  content TEXT NOT NULL,
  variables TEXT DEFAULT '[]',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_name TEXT,
  template_id INTEGER,
  number_id INTEGER,
  message TEXT,
  media_path TEXT,
  scheduled_at TEXT,
  recurrence TEXT DEFAULT 'none',         -- none | daily | weekly | monthly
  status TEXT DEFAULT 'scheduled',        -- scheduled | sending | sent | failed | cancelled
  delay_seconds INTEGER DEFAULT 8,
  stats TEXT DEFAULT '{}',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  number_id INTEGER,
  contact_id INTEGER,
  to_phone TEXT,
  body TEXT,
  status TEXT DEFAULT 'pending',          -- pending | sent | delivered | read | replied | failed
  error TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chatbot_flows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  reply TEXT NOT NULL,
  is_fallback INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  number_id INTEGER,                      -- NULL = all numbers
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sheets_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  sheet_url TEXT NOT NULL,
  sheet_id TEXT,
  tab_name TEXT DEFAULT 'Sheet1',
  number_id INTEGER,
  column_map TEXT DEFAULT '{}',            -- detected header->column index map, set on first sync
  last_synced_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_config_id INTEGER,
  row_index INTEGER,
  product_name TEXT,
  brand TEXT,
  price REAL,
  mrp REAL,
  discount REAL,
  image_url TEXT,
  description TEXT,
  product_url TEXT,
  schedule_date TEXT,
  status TEXT DEFAULT 'Pending',          -- Pending | Sent | Failed
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number_id INTEGER,
  wa_id TEXT,
  name TEXT,
  type TEXT,                               -- group | channel | broadcast
  member_count INTEGER,
  is_admin INTEGER DEFAULT 0,
  last_activity TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Lightweight migration: add columns that didn't exist in earlier versions of this table.
const sheetsConfigCols = db.prepare("PRAGMA table_info(sheets_config)").all().map((c) => c.name);
if (!sheetsConfigCols.includes('column_map')) {
  db.exec("ALTER TABLE sheets_config ADD COLUMN column_map TEXT DEFAULT '{}'");
}

const defaultSettings = {
  business_name: 'My Business',
  default_number_id: '',
  signature: '',
  default_delay_seconds: '8',
  max_messages_per_hour: '60',
  anti_spam_mode: 'true',
  typing_indicator: 'true',
  random_variation: 'true',
  auto_reply: 'true',
  auto_rotate: 'true',
  rotation_strategy: 'round_robin',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) insertSetting.run(k, v);

module.exports = db;
