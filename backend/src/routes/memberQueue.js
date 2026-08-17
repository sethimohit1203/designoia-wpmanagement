const express = require('express');
const router = express.Router();
const db = require('../db');
const { runMemberQueueNow, isQueueInProgress } = require('../services/scheduler');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM group_member_queues ORDER BY created_at DESC').all();
  res.json(rows.map((q) => ({ ...q, in_progress: isQueueInProgress(q.id) })));
});

router.post('/', (req, res) => {
  const { name, number_id, group_id, contact_ids = [], members_per_day = 10, frequency_days = 1, delay_seconds = 10 } = req.body;
  if (!name || !number_id || !group_id || !contact_ids.length) {
    return res.status(400).json({ error: 'name, number_id, group_id, contact_ids required' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const info = db.prepare(
    'INSERT INTO group_member_queues (name, number_id, group_id, contact_ids, members_per_day, frequency_days, delay_seconds, next_send_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(name, number_id, group_id, JSON.stringify(contact_ids), members_per_day, frequency_days, delay_seconds, today);
  res.json(db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { status = null, members_per_day = null, frequency_days = null, delay_seconds = null } = req.body;
  const q = db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE group_member_queues SET status=COALESCE(?,status), members_per_day=COALESCE(?,members_per_day), frequency_days=COALESCE(?,frequency_days), delay_seconds=COALESCE(?,delay_seconds) WHERE id=?'
  ).run(status, members_per_day, frequency_days, delay_seconds, req.params.id);
  res.json(db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM group_member_queues WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/run-now', async (req, res) => {
  const q = db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, message: `Running — will add up to ${q.members_per_day} members with ${q.delay_seconds ?? 10}s delay between each` });
  runMemberQueueNow(q).catch((e) => console.error(`[MemberQueue ${q.id}] run-now failed:`, e.message));
});

module.exports = router;
