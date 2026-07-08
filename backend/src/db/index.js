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
  daily_limit INTEGER DEFAULT 20,         -- the CEILING once fully warmed up; actual limit ramps up to this
  cooldown_minutes INTEGER DEFAULT 60,
  messages_sent_today INTEGER DEFAULT 0,
  last_reset_date TEXT,
  cooldown_until TEXT,
  ban_risk_score INTEGER DEFAULT 0,       -- 0-100
  last_activity TEXT,
  warmup_enabled INTEGER DEFAULT 1,       -- ramp daily limit gradually instead of using daily_limit from day 1
  first_connected_at TEXT,                -- set once, when the number first goes 'connected' — warm-up clock starts here
  last_error TEXT,                        -- last init/disconnect failure reason, visible via GET /api/numbers
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
  target_type TEXT,                        -- contact | group | channel — where Schedule-Date auto-sends go
  target_id TEXT,                          -- contact id, or WA group/channel wa_id
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

CREATE TABLE IF NOT EXISTS group_member_queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  number_id INTEGER NOT NULL,
  group_id TEXT NOT NULL,
  contact_ids TEXT NOT NULL DEFAULT '[]',
  current_index INTEGER DEFAULT 0,
  members_per_day INTEGER DEFAULT 10,
  frequency_days INTEGER DEFAULT 1,
  next_send_at TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS broadcast_queues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  number_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  product_ids TEXT NOT NULL DEFAULT '[]',
  current_index INTEGER DEFAULT 0,
  products_per_day INTEGER DEFAULT 3,
  frequency_days INTEGER DEFAULT 1,
  next_send_at TEXT,
  delay_seconds INTEGER DEFAULT 10,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Lightweight migration: add columns that didn't exist in earlier versions of this table.
const broadcastQueueCols = db.prepare("PRAGMA table_info(broadcast_queues)").all().map((c) => c.name);
if (!broadcastQueueCols.includes('send_time')) {
  db.exec("ALTER TABLE broadcast_queues ADD COLUMN send_time TEXT DEFAULT '09:00'");
}
if (!broadcastQueueCols.includes('target_ids')) {
  db.exec("ALTER TABLE broadcast_queues ADD COLUMN target_ids TEXT DEFAULT '[]'");
}
if (!broadcastQueueCols.includes('send_times')) {
  db.exec("ALTER TABLE broadcast_queues ADD COLUMN send_times TEXT DEFAULT '[]'");
}
const memberQueueCols = db.prepare("PRAGMA table_info(group_member_queues)").all().map((c) => c.name);
if (!memberQueueCols.includes('delay_seconds')) {
  db.exec('ALTER TABLE group_member_queues ADD COLUMN delay_seconds INTEGER DEFAULT 10');
}

const sheetsConfigCols = db.prepare("PRAGMA table_info(sheets_config)").all().map((c) => c.name);
if (!sheetsConfigCols.includes('column_map')) {
  db.exec("ALTER TABLE sheets_config ADD COLUMN column_map TEXT DEFAULT '{}'");
}
if (!sheetsConfigCols.includes('target_type')) {
  db.exec('ALTER TABLE sheets_config ADD COLUMN target_type TEXT');
  db.exec('ALTER TABLE sheets_config ADD COLUMN target_id TEXT');
}

const numbersCols = db.prepare("PRAGMA table_info(numbers)").all().map((c) => c.name);
if (!numbersCols.includes('warmup_enabled')) {
  db.exec('ALTER TABLE numbers ADD COLUMN warmup_enabled INTEGER DEFAULT 1');
  db.exec('ALTER TABLE numbers ADD COLUMN first_connected_at TEXT');
}
if (!numbersCols.includes('last_error')) {
  db.exec('ALTER TABLE numbers ADD COLUMN last_error TEXT');
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
  broadcast_dm_numbers: '',         // e.g. "8800245974 / 8860103557"
  broadcast_whatsapp_channel: '',   // e.g. "https://whatsapp.com/channel/..."
  broadcast_telegram_channel: '',   // e.g. "https://t.me/yourchannel"
  broadcast_footer_note: '🚚 Free Delivery Across India\n💳 Cash on Delivery Available\n🔄 Easy Returns',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) insertSetting.run(k, v);

module.exports = db;
