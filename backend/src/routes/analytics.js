const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/summary', (req, res) => {
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status='read' THEN 1 ELSE 0 END) as read,
      SUM(CASE WHEN status='replied' THEN 1 ELSE 0 END) as replied,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
    FROM messages
  `).get();
  res.json(counts);
});

router.get('/by-number', (req, res) => {
  const rows = db.prepare(`
    SELECT n.id, n.name, n.phone, n.ban_risk_score, n.messages_sent_today, n.daily_limit,
      SUM(CASE WHEN m.status='sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN m.status='failed' THEN 1 ELSE 0 END) as failed
    FROM numbers n
    LEFT JOIN messages m ON m.number_id = n.id
    GROUP BY n.id
  `).all();
  res.json(rows);
});

router.get('/campaigns', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.scheduled_at, c.status, c.stats, n.name as number_name
    FROM campaigns c
    LEFT JOIN numbers n ON n.id = c.number_id
    ORDER BY c.id DESC
  `).all();
  res.json(rows.map((r) => ({ ...r, stats: JSON.parse(r.stats || '{}') })));
});

module.exports = router;
