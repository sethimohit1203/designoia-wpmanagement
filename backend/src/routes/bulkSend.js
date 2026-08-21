const express = require('express');
const router = express.Router();
const db = require('../db');
const wa = require('../services/waManager');
const multer = require('multer');
const { uploadsDir } = require('../utils/paths');
const upload = multer({ dest: uploadsDir });

function applyVariables(template, contact) {
  return template
    .replace(/\{name\}/g, contact.name || '')
    .replace(/\{date\}/g, new Date().toLocaleDateString('en-IN'))
    .replace(/\{vehicle\}/g, contact.vehicle || '');
}

// Anti-spam: WhatsApp's abuse detection flags byte-identical text sent to many
// numbers in a row. Slips 1-2 invisible zero-width characters in at random word
// boundaries — invisible to the reader, but breaks exact-duplicate detection.
const ZERO_WIDTH_CHARS = ['​', '‌'];
function addRandomVariation(text) {
  if (!text) return text;
  const words = text.split(' ');
  if (words.length < 2) return text + ZERO_WIDTH_CHARS[0];
  const insertions = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < insertions; i++) {
    const pos = 1 + Math.floor(Math.random() * (words.length - 1));
    const ch = ZERO_WIDTH_CHARS[Math.floor(Math.random() * ZERO_WIDTH_CHARS.length)];
    words[pos] = ch + words[pos];
  }
  return words.join(' ');
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
  const randomVariation = db.prepare("SELECT value FROM settings WHERE key = 'random_variation'").get()?.value !== 'false';

  for (const contact of contacts) {
    const useNumberId = number_id ? Number(number_id) : wa.pickNextAvailableNumber()?.id;
    let body = applyVariables(message, contact);
    if (randomVariation) body = addRandomVariation(body);
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
  const { message = '' } = req.query;
  const variables = (message.match(/\{[a-zA-Z_]+\}/g) || []);
  res.json({ variables: [...new Set(variables)] });
});

module.exports = router;
