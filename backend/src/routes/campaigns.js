const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all());
});

router.post('/', (req, res) => {
  const { name, group_name = 'All', template_id, number_id, message, scheduled_at, recurrence = 'none', delay_seconds = 8 } = req.body;
  if (!name || !scheduled_at) return res.status(400).json({ error: 'name and scheduled_at required' });
  const info = db.prepare(
    'INSERT INTO campaigns (name, group_name, template_id, number_id, message, scheduled_at, recurrence, delay_seconds) VALUES (?,?,?,?,?,?,?,?)'
  ).run(name, group_name, template_id || null, number_id || null, message, scheduled_at, recurrence, delay_seconds);
  res.json(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/:id/cancel', (req, res) => {
  db.prepare("UPDATE campaigns SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'").run(req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
