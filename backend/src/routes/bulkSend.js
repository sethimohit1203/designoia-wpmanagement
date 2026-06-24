const express = require('express');
const router = express.Router();
const db = require('../db');
const wa = require('../services/waManager');
const multer = require('multer');
const path = require('path');
const upload = multer({ dest: path.join(__dirname, '..', '..', 'uploads') });

function applyVariables(template, contact) {
  return template
    .replace(/\{name\}/g, contact.name || '')
    .replace(/\{date\}/g, new Date().toLocaleDateString('en-IN'))
    .replace(/\{vehicle\}/g, contact.vehicle || '');
}

// Server-Sent Events progress stream for a live bulk send
router.post('/send', upload.single('media'), async (req, res) => {
  const { group_name = 'All', message, number_id, delay_seconds = 8, campaign_name = 'Quick Send' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const contacts = group_name !== 'All'
    ? db.prepare("SELECT * FROM contacts WHERE status='active' AND group_name = ?").all(group_name)
    : db.prepare("SELECT * FROM contacts WHERE status='active'").all();

  const campaignInfo = db.prepare(
    'INSERT INTO campaigns (name, group_name, number_id, message, media_path, status, delay_seconds) VALUES (?,?,?,?,?,?,?)'
  ).run(campaign_name, group_name, number_id || null, message, req.file?.path || null, 'sending', delay_seconds);
  const campaignId = campaignInfo.lastInsertRowid;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let sent = 0, failed = 0;
  const total = contacts.length;

  for (const contact of contacts) {
    const useNumberId = number_id ? Number(number_id) : wa.pickNextAvailableNumber()?.id;
    const body = applyVariables(message, contact);
    try {
      if (!useNumberId) throw new Error('No connected number available');
      await wa.sendMessage(useNumberId, contact.phone, body, req.file?.path || null);
      db.prepare('INSERT INTO messages (campaign_id, number_id, contact_id, to_phone, body, status, sent_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)')
        .run(campaignId, useNumberId, contact.id, contact.phone, body, 'sent');
      sent++;
    } catch (err) {
      db.prepare('INSERT INTO messages (campaign_id, number_id, contact_id, to_phone, body, status, error) VALUES (?,?,?,?,?,?,?)')
        .run(campaignId, useNumberId || null, contact.id, contact.phone, body, 'failed', err.message);
      failed++;
    }
    res.write(`data: ${JSON.stringify({ sent, failed, total, current: contact.name })}\n\n`);
    const delayMs = Number(delay_seconds) * 1000 + (Math.random() * 4000 - 2000);
    await new Promise((r) => setTimeout(r, Math.max(1000, delayMs)));
  }

  db.prepare('UPDATE campaigns SET status = ?, stats = ? WHERE id = ?')
    .run('sent', JSON.stringify({ sent, failed, total }), campaignId);

  res.write(`data: ${JSON.stringify({ done: true, sent, failed, total })}\n\n`);
  res.end();
});

router.get('/preview', (req, res) => {
  const { message } = req.query;
  const variables = (message.match(/\{[a-zA-Z_]+\}/g) || []);
  res.json({ variables: [...new Set(variables)] });
});

module.exports = router;
