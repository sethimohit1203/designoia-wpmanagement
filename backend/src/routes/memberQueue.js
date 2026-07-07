const express = require('express');
const router = express.Router();
const db = require('../db');
const wa = require('../services/waManager');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM group_member_queues ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { name, number_id, group_id, contact_ids = [], members_per_day = 10, frequency_days = 1 } = req.body;
  if (!name || !number_id || !group_id || !contact_ids.length) {
    return res.status(400).json({ error: 'name, number_id, group_id, contact_ids required' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const info = db.prepare(
    'INSERT INTO group_member_queues (name, number_id, group_id, contact_ids, members_per_day, frequency_days, next_send_at) VALUES (?,?,?,?,?,?,?)'
  ).run(name, number_id, group_id, JSON.stringify(contact_ids), members_per_day, frequency_days, today);
  res.json(db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { status, members_per_day, frequency_days } = req.body;
  const q = db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  db.prepare(
    'UPDATE group_member_queues SET status=COALESCE(?,status), members_per_day=COALESCE(?,members_per_day), frequency_days=COALESCE(?,frequency_days) WHERE id=?'
  ).run(status, members_per_day, frequency_days, req.params.id);
  res.json(db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM group_member_queues WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Manual trigger: run one cycle right now
router.post('/:id/run-now', async (req, res) => {
  const q = db.prepare('SELECT * FROM group_member_queues WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, message: 'Running in background' });

  (async () => {
    const contactIds = JSON.parse(q.contact_ids || '[]');
    if (!contactIds.length) return;
    let idx = q.current_index || 0;
    const batch = [];
    for (let i = 0; i < q.members_per_day; i++) {
      const cid = contactIds[idx % contactIds.length];
      const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(cid);
      if (contact?.phone) {
        const jid = contact.phone.replace(/\D/g, '') + '@s.whatsapp.net';
        batch.push(jid);
      }
      idx++;
      if (idx >= contactIds.length) break; // stop if we've gone through all contacts
    }
    if (batch.length) {
      try {
        await wa.addGroupMembers(q.number_id, q.group_id, batch);
        console.log(`[MemberQueue ${q.id}] added ${batch.length} members to ${q.group_id}`);
      } catch (e) {
        console.error(`[MemberQueue ${q.id}] failed:`, e.message);
      }
    }
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (q.frequency_days || 1));
    db.prepare('UPDATE group_member_queues SET current_index = ?, next_send_at = ? WHERE id = ?')
      .run(idx % contactIds.length, nextDate.toISOString().slice(0, 10), q.id);
  })().catch(console.error);
});

module.exports = router;
