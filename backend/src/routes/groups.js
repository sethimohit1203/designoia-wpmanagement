const express = require('express');
const router = express.Router();
const db = require('../db');
const wa = require('../services/waManager');

router.get('/', (req, res) => {
  const { number_id, type } = req.query;
  let query = 'SELECT * FROM groups_cache WHERE 1=1';
  const params = [];
  if (number_id) { query += ' AND number_id = ?'; params.push(number_id); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY name';
  res.json(db.prepare(query).all(...params));
});

router.post('/refresh/:numberId', async (req, res) => {
  try {
    const groups = await wa.fetchGroups(Number(req.params.numberId));
    res.json({ ok: true, count: groups.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add a WhatsApp Channel manually by invite link or newsletter JID.
// Invite link format: https://whatsapp.com/channel/<code>
// Newsletter JID format: 120363xxxxxx@newsletter
router.post('/add-channel', async (req, res) => {
  const { number_id, link_or_jid } = req.body;
  if (!number_id || !link_or_jid) {
    return res.status(400).json({ error: 'number_id and link_or_jid required' });
  }
  const sock = wa.getClient(Number(number_id));
  if (!sock) return res.status(400).json({ error: 'Number not connected' });

  try {
    let meta;
    if (link_or_jid.endsWith('@newsletter')) {
      meta = await sock.newsletterMetadata('jid', link_or_jid);
    } else {
      // Extract invite code from URL like https://whatsapp.com/channel/0029Va...
      const code = link_or_jid.split('/channel/').pop().split('?')[0].trim();
      meta = await sock.newsletterMetadata('invite', code);
    }

    const jid = meta.id;
    const name = meta.name || meta.thread_metadata?.name?.text || 'Unknown Channel';
    const subscribers = meta.subscriberCount || meta.thread_metadata?.subscriber_count || 0;

    db.prepare('DELETE FROM groups_cache WHERE number_id = ? AND wa_id = ?').run(number_id, jid);
    db.prepare('INSERT INTO groups_cache (number_id, wa_id, name, type, member_count, is_admin, last_activity) VALUES (?,?,?,?,?,?,?)')
      .run(number_id, jid, name, 'channel', subscribers, 1, new Date().toISOString());

    res.json({ ok: true, jid, name, subscribers });
  } catch (e) {
    res.status(500).json({ error: `Could not fetch channel info: ${e.message}` });
  }
});

router.post('/send', async (req, res) => {
  const { number_id, group_ids, message, delay_seconds = 15 } = req.body;
  if (!number_id || !group_ids?.length || !message) {
    return res.status(400).json({ error: 'number_id, group_ids, message required' });
  }
  const results = [];
  for (const groupId of group_ids) {
    try {
      await wa.sendMessage(number_id, groupId, message);
      results.push({ groupId, ok: true });
    } catch (e) {
      results.push({ groupId, ok: false, error: e.message });
    }
    await new Promise((r) => setTimeout(r, Number(delay_seconds) * 1000));
  }
  res.json({ results });
});

module.exports = router;
