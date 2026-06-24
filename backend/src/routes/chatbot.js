const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM chatbot_flows ORDER BY id').all());
});

router.post('/', (req, res) => {
  const { keyword, reply, is_fallback = false, number_id = null } = req.body;
  if (!reply) return res.status(400).json({ error: 'reply required' });
  const info = db.prepare('INSERT INTO chatbot_flows (keyword, reply, is_fallback, number_id) VALUES (?,?,?,?)')
    .run(keyword || '', reply, is_fallback ? 1 : 0, number_id);
  res.json(db.prepare('SELECT * FROM chatbot_flows WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { keyword, reply, enabled, is_fallback, number_id } = req.body;
  db.prepare('UPDATE chatbot_flows SET keyword=?, reply=?, enabled=?, is_fallback=?, number_id=? WHERE id=?')
    .run(keyword, reply, enabled ? 1 : 0, is_fallback ? 1 : 0, number_id, req.params.id);
  res.json(db.prepare('SELECT * FROM chatbot_flows WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM chatbot_flows WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Live test: simulate what the bot would reply to a given message
router.post('/test', (req, res) => {
  const { message, number_id = null } = req.body;
  const body = (message || '').trim().toLowerCase();
  const flows = db.prepare('SELECT * FROM chatbot_flows WHERE enabled = 1 AND (number_id IS NULL OR number_id = ?)').all(number_id);
  let matched = flows.find((f) => !f.is_fallback && body === f.keyword.toLowerCase());
  if (!matched) matched = flows.find((f) => !f.is_fallback && f.keyword && body.includes(f.keyword.toLowerCase()));
  if (!matched) matched = flows.find((f) => f.is_fallback);
  res.json({ reply: matched ? matched.reply : null });
});

module.exports = router;
