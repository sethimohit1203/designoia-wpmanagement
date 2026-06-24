const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

router.put('/', (req, res) => {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(req.body)) upsert.run(k, String(v));
  res.json({ ok: true });
});

// Live ban-protection checklist derived from current settings + number health
router.get('/checklist', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  const numbers = db.prepare('SELECT * FROM numbers').all();
  const overLimit = numbers.filter((n) => n.messages_sent_today >= n.daily_limit);

  const checklist = [
    { label: 'Anti-spam mode enabled', ok: s.anti_spam_mode === 'true' },
    { label: 'Typing indicator enabled', ok: s.typing_indicator === 'true' },
    { label: 'Random delay variation enabled', ok: s.random_variation === 'true' },
    { label: 'Default delay >= 5 seconds', ok: Number(s.default_delay_seconds) >= 5 },
    { label: 'Auto-rotate enabled (multi-number)', ok: s.auto_rotate === 'true' },
    { label: 'No number currently over daily limit', ok: overLimit.length === 0 },
    { label: 'At least one number connected', ok: numbers.some((n) => n.status === 'connected') },
  ];
  res.json(checklist);
});

module.exports = router;
