const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM broadcast_queues ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const {
    name, number_id, target_ids = [], product_ids,
    products_per_day = 3, frequency_days = 1, delay_seconds = 10, send_time = '09:00', send_times = [],
    telegram_chat_id = null,
  } = req.body;
  if (!name || !number_id || !target_ids.length || !product_ids?.length) {
    return res.status(400).json({ error: 'name, number_id, target_ids, product_ids required' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const effectiveSendTimes = send_times.length ? send_times : [send_time];
  const info = db.prepare(
    'INSERT INTO broadcast_queues (name, number_id, target_type, target_id, target_ids, product_ids, products_per_day, frequency_days, delay_seconds, send_time, send_times, next_send_at, telegram_chat_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(
    name, number_id, 'multi', target_ids[0], JSON.stringify(target_ids), JSON.stringify(product_ids),
    products_per_day, frequency_days, delay_seconds, effectiveSendTimes[0], JSON.stringify(effectiveSendTimes), today,
    String(telegram_chat_id || '').trim() || null,
  );
  res.json(db.prepare('SELECT * FROM broadcast_queues WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const {
    name = null, status = null, number_id = null, target_ids, products_per_day = null,
    frequency_days = null, delay_seconds = null, product_ids, send_time = null, send_times,
  } = req.body;
  const q = db.prepare('SELECT * FROM broadcast_queues WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  // send_times drives send_time too (first slot) so the legacy single-time column stays in sync.
  const effectiveSendTime = send_times?.length ? send_times[0] : send_time;
  // telegram_chat_id needs to support being explicitly CLEARED (set to null) when
  // the user removes it, which COALESCE can't express — so it's a plain assignment,
  // falling back to the existing value only when the key is absent from the request.
  const telegramChatId = Object.prototype.hasOwnProperty.call(req.body, 'telegram_chat_id')
    ? (String(req.body.telegram_chat_id || '').trim() || null)
    : q.telegram_chat_id;
  db.prepare(
    `UPDATE broadcast_queues SET
      name=COALESCE(?,name),
      status=COALESCE(?,status),
      number_id=COALESCE(?,number_id),
      target_ids=COALESCE(?,target_ids),
      products_per_day=COALESCE(?,products_per_day),
      frequency_days=COALESCE(?,frequency_days),
      delay_seconds=COALESCE(?,delay_seconds),
      send_time=COALESCE(?,send_time),
      send_times=COALESCE(?,send_times),
      product_ids=COALESCE(?,product_ids),
      telegram_chat_id=?
    WHERE id=?`
  ).run(
    name, status, number_id,
    target_ids ? JSON.stringify(target_ids) : null,
    products_per_day, frequency_days, delay_seconds, effectiveSendTime,
    send_times ? JSON.stringify(send_times) : null,
    product_ids ? JSON.stringify(product_ids) : null,
    telegramChatId,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM broadcast_queues WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM broadcast_queues WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
