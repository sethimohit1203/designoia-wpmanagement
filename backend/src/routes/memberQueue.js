const express = require('express');
const router = express.Router();
const db = require('../db');
const wa = require('../services/waManager');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runQueue(q) {
  const contactIds = JSON.parse(q.contact_ids || '[]');
  if (!contactIds.length) return;

  const delayMs = (q.delay_seconds ?? 10) * 1000;
  let idx = q.current_index || 0;
  let added = 0;

  for (let i = 0; i < q.members_per_day; i++) {
    if (idx >= contactIds.length) break;
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactIds[idx]);
    if (contact?.phone) {
      const jid = contact.phone.replace(/\D/g, '') + '@s.whatsapp.net';
      try {
        await wa.addGroupMembers(q.number_id, q.group_id, [jid]);
        added++;
        console.log(`[MemberQueue ${q.id}] added ${jid} (${idx + 1}/${contactIds.length})`);
      } catch (e) {
        console.error(`[MemberQueue ${q.id}] failed to add ${jid}: ${e.message}`);
      }
      if (i < q.members_per_day - 1 && idx + 1 < contactIds.length) {
        await sleep(delayMs);
      }
    }
    idx++;
  }

  const allDone = idx >= contactIds.length;
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + (q.frequency_days || 1));
  db.prepare('UPDATE group_member_queues SET current_index=?, next_send_at=?, status=? WHERE id=?')
    .run(allDone ? 0 : idx, nextDate.toISOString().slice(0, 10), allDone ? 'completed' : 'active', q.id);

  console.log(`[MemberQueue ${q.id}] cycle done — added ${added}, idx=${idx}, allDone=${allDone}`);
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM group_member_queues ORDER BY created_at DESC').all());
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
  const { status, members_per_day, frequency_days, delay_seconds } = req.body;
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
  runQueue(q).catch(console.error);
});

module.exports = router;
