const express = require('express');
const router = express.Router();
const db = require('../db');
const wa = require('../services/waManager');
const ai = require('../services/aiService');
const { formatProductMessage } = require('../services/scheduler');

router.post('/caption/:productId', async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) return res.status(404).json({ error: 'product not found' });
  try {
    const aiBody = await ai.generateProductCaption(product);
    const caption = formatProductMessage(product, aiBody);
    res.json({ caption });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/send-now', async (req, res) => {
  const { product_id, number_id, target_type, target_id, caption } = req.body; // target_type: contact | group | channel
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'product not found' });

  const body = caption || formatProductMessage(product);
  let to = target_id;
  if (target_type === 'contact') {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(target_id);
    to = contact?.phone;
  }
  if (!to) return res.status(404).json({ error: 'Target not found or has no phone number' });
  try {
    await wa.sendMessage(number_id, to, body, product.image_url || null);
    db.prepare("UPDATE products SET status='Sent' WHERE id = ?").run(product_id);
    res.json({ ok: true });
  } catch (e) {
    db.prepare("UPDATE products SET status='Failed' WHERE id = ?").run(product_id);
    res.status(500).json({ error: e.message });
  }
});

router.post('/batch-send', async (req, res) => {
  const { product_ids, number_id, target_type, target_id, target_ids, delay_seconds = 10, use_ai = true } = req.body;

  // Support both single target_id and multiple target_ids array
  const rawTargets = target_ids?.length ? target_ids : (target_id ? [target_id] : []);
  const targets = rawTargets.map((t) => {
    if (target_type === 'contact') {
      const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(Number(t));
      return contact?.phone || null;
    }
    return t;
  }).filter(Boolean);

  if (!targets.length) return res.status(404).json({ error: 'No valid targets found' });

  // Respond immediately so proxies don't time out — the batch runs asynchronously
  res.json({ ok: true, queued: product_ids.length, targets: targets.length });

  (async () => {
    for (let i = 0; i < product_ids.length; i++) {
      const pid = product_ids[i];
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
      if (!product) continue;
      let aiBody;
      if (use_ai) {
        try { aiBody = await ai.generateProductCaption(product); } catch (e) {
          console.warn(`AI caption failed for product ${pid}:`, e.message);
        }
      }
      const body = formatProductMessage(product, aiBody);
      for (const to of targets) {
        try {
          await wa.sendMessage(number_id, to, body, product.image_url || null);
        } catch (e) {
          console.error(`Batch send failed for product ${pid} → ${to}:`, e.message);
        }
        if (targets.indexOf(to) < targets.length - 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      try { db.prepare("UPDATE products SET status='Sent' WHERE id = ?").run(pid); } catch (_) {}
      if (i < product_ids.length - 1) {
        await new Promise((r) => setTimeout(r, Number(delay_seconds) * 1000));
      }
    }
  })().catch((e) => console.error('Batch send fatal error:', e.message));
});

router.post('/schedule', (req, res) => {
  const { product_id, schedule_date } = req.body; // DD/MM/YYYY
  db.prepare('UPDATE products SET schedule_date = ? WHERE id = ?').run(schedule_date, product_id);
  res.json({ ok: true });
});

module.exports = router;
