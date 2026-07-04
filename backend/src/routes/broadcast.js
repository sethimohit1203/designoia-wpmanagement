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
  const { product_ids, number_id, target_type, target_id, delay_seconds = 10, use_ai = true } = req.body;
  const results = [];
  for (const pid of product_ids) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    if (!product) continue;
    let to = target_id;
    if (target_type === 'contact') {
      const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(target_id);
      to = contact?.phone;
    }
    let aiBody;
    if (use_ai) {
      try {
        aiBody = await ai.generateProductCaption(product);
      } catch (e) {
        console.warn(`AI caption failed for product ${pid}, falling back to plain template:`, e.message);
      }
    }
    try {
      await wa.sendMessage(number_id, to, formatProductMessage(product, aiBody), product.image_url || null);
      db.prepare("UPDATE products SET status='Sent' WHERE id = ?").run(pid);
      results.push({ pid, ok: true });
    } catch (e) {
      db.prepare("UPDATE products SET status='Failed' WHERE id = ?").run(pid);
      results.push({ pid, ok: false, error: e.message });
    }
    await new Promise((r) => setTimeout(r, Number(delay_seconds) * 1000));
  }
  res.json({ results });
});

router.post('/schedule', (req, res) => {
  const { product_id, schedule_date } = req.body; // DD/MM/YYYY
  db.prepare('UPDATE products SET schedule_date = ? WHERE id = ?').run(schedule_date, product_id);
  res.json({ ok: true });
});

module.exports = router;
