const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM broadcast_queues ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { name, number_id, target_type, target_id, product_ids, products_per_day = 3, frequency_days = 1, delay_seconds = 10 } = req.body;
  if (!name || !number_id || !target_id || !product_ids?.length) {
    return res.status(400).json({ error: 'name, number_id, target_id, product_ids required' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const info = db.prepare(
    'INSERT INTO broadcast_queues (name, number_id, target_type, target_id, product_ids, products_per_day, frequency_days, delay_seconds, next_send_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(name, number_id, target_type || 'group', target_id, JSON.stringify(product_ids), products_per_day, frequency_days, delay_seconds, today);
  res.json(db.prepare('SELECT * FROM broadcast_queues WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { status, number_id, target_type, target_id, products_per_day, frequency_days, delay_seconds, product_ids } = req.body;
  const q = db.prepare('SELECT * FROM broadcast_queues WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE broadcast_queues SET status=COALESCE(?,status), number_id=COALESCE(?,number_id), target_type=COALESCE(?,target_type), target_id=COALESCE(?,target_id), products_per_day=COALESCE(?,products_per_day), frequency_days=COALESCE(?,frequency_days), delay_seconds=COALESCE(?,delay_seconds), product_ids=COALESCE(?,product_ids) WHERE id=?'
  ).run(status, number_id, target_type, target_id, products_per_day, frequency_days, delay_seconds, product_ids ? JSON.stringify(product_ids) : null, req.params.id);
  res.json(db.prepare('SELECT * FROM broadcast_queues WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM broadcast_queues WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
