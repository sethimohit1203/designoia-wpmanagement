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
