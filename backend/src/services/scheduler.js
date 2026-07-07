const cron = require('node-cron');
const db = require('../db');
const wa = require('./waManager');
const { syncSheet, writeStatus } = require('./sheetsService');

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function applyVariables(template, contact) {
  return template
    .replace(/\{name\}/g, contact.name || '')
    .replace(/\{date\}/g, new Date().toLocaleDateString('en-IN'))
    .replace(/\{vehicle\}/g, contact.vehicle || '');
}

async function runCampaign(campaign) {
  db.prepare("UPDATE campaigns SET status = 'sending' WHERE id = ?").run(campaign.id);
  const contacts = campaign.group_name && campaign.group_name !== 'All'
    ? db.prepare("SELECT * FROM contacts WHERE status = 'active' AND group_name = ?").all(campaign.group_name)
    : db.prepare("SELECT * FROM contacts WHERE status = 'active'").all();

  const autoRotate = getSetting('auto_rotate', 'true') === 'true';
  let numberId = campaign.number_id;
  let sentCount = 0;
  let failedCount = 0;

  for (const contact of contacts) {
    let useNumberId = numberId;
    if (autoRotate) {
      const next = wa.pickNextAvailableNumber(numberId);
      if (!next) {
        failedCount++;
        continue;
      }
      useNumberId = next.id;
    }
    const body = applyVariables(campaign.message || '', contact);
    try {
      await wa.sendMessage(useNumberId, contact.phone, body, campaign.media_path || null);
      db.prepare(`INSERT INTO messages (campaign_id, number_id, contact_id, to_phone, body, status, sent_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .run(campaign.id, useNumberId, contact.id, contact.phone, body, 'sent');
      sentCount++;
    } catch (err) {
      db.prepare(`INSERT INTO messages (campaign_id, number_id, contact_id, to_phone, body, status, error) VALUES (?,?,?,?,?,?,?)`)
        .run(campaign.id, useNumberId, contact.id, contact.phone, body, 'failed', err.message);
      failedCount++;
    }
    const delayMs = (campaign.delay_seconds || 8) * 1000 + (Math.random() * 4000 - 2000);
    await new Promise((r) => setTimeout(r, Math.max(1000, delayMs)));
  }

  const stats = JSON.stringify({ sent: sentCount, failed: failedCount, total: contacts.length });
  db.prepare("UPDATE campaigns SET status = 'sent', stats = ? WHERE id = ?").run(stats, campaign.id);

  if (campaign.recurrence && campaign.recurrence !== 'none') {
    const next = new Date(campaign.scheduled_at);
    if (campaign.recurrence === 'daily') next.setDate(next.getDate() + 1);
    if (campaign.recurrence === 'weekly') next.setDate(next.getDate() + 7);
    if (campaign.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
    db.prepare('INSERT INTO campaigns (name, group_name, template_id, number_id, message, media_path, scheduled_at, recurrence, delay_seconds) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(campaign.name, campaign.group_name, campaign.template_id, campaign.number_id, campaign.message, campaign.media_path, next.toISOString(), campaign.recurrence, campaign.delay_seconds);
  }
}

async function checkScheduledCampaigns() {
  const now = new Date().toISOString();
  const due = db.prepare("SELECT * FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= ?").all(now);
  for (const c of due) {
    runCampaign(c).catch((e) => console.error('Campaign run error:', e.message));
  }
}

async function checkSheetSchedules() {
  const configs = db.prepare('SELECT * FROM sheets_config').all();
  const todayStr = new Date();
  const dd = String(todayStr.getDate()).padStart(2, '0');
  const mm = String(todayStr.getMonth() + 1).padStart(2, '0');
  const yyyy = todayStr.getFullYear();
  const today = `${dd}/${mm}/${yyyy}`;

  for (const config of configs) {
    try {
      await syncSheet(config);
    } catch (e) {
      console.error('Sheet sync failed for', config.id, e.message);
      continue;
    }
    const due = db.prepare("SELECT * FROM products WHERE sheet_config_id = ? AND schedule_date = ? AND status = 'Pending'")
      .all(config.id, today);

    if (!due.length) continue;
    const numberId = config.number_id || wa.list().find((n) => n.runtimeStatus === 'connected')?.id;
    if (!numberId || !config.target_type || !config.target_id) {
      console.warn(`Sheet "${config.name}" has ${due.length} product(s) due today but no number/target configured — skipping. Set a target in the Sheets Sync page.`);
      continue;
    }

    let to = config.target_id;
    if (config.target_type === 'contact') {
      const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(config.target_id);
      to = contact?.phone;
    }
    if (!to) continue;

    for (const product of due) {
      const body = formatProductMessage(product);
      try {
        await wa.sendMessage(numberId, to, body, product.image_url || null);
        db.prepare("UPDATE products SET status = 'Sent' WHERE id = ?").run(product.id);
        await writeStatus(config, product.row_index, 'Sent').catch(() => {});
      } catch (err) {
        db.prepare("UPDATE products SET status = 'Failed' WHERE id = ?").run(product.id);
        await writeStatus(config, product.row_index, 'Failed').catch(() => {});
      }
    }
  }
}

// Builds the full branded WhatsApp message: title, body (AI-written or a plain
// fallback built from sheet fields), price line, and a footer pulled from
// Settings (DM numbers, channel links). Any empty footer field is omitted.
function formatProductMessage(product, aiBody) {
  const lines = [];
  lines.push(`✨ ${product.product_name} ✨`, '');

  // Strip =AI() formula strings that survived into the DB before the sheetsService guard.
  const rawDesc = product.description || '';
  const desc = rawDesc.startsWith('=') ? '' : rawDesc;
  const body = aiBody || desc || product.brand || '';
  if (body) lines.push(body, '');

  // Price block: offer price, MRP struck-through, discount %
  const price = Number(product.price) || 0;
  const mrp = Number(product.mrp) || 0;
  const discount = Math.round(Number(product.discount) || 0);
  if (mrp > 0 && mrp > price) {
    lines.push(`🏷️ MRP: ~₹${mrp}~`);
    lines.push(`💰 Offer Price: ₹${price}${discount ? `  (${discount}% off)` : ''}`, '');
  } else {
    lines.push(`💰 Price: ₹${price}`, '');
  }

  const footerNote = getSetting('broadcast_footer_note', '');
  if (footerNote) lines.push(footerNote, '');

  const dmNumbers = getSetting('broadcast_dm_numbers', '');
  if (dmNumbers) lines.push(`📩 DM us at ${dmNumbers} to order yours today! 🛍️`, '');

  const waChannel = getSetting('broadcast_whatsapp_channel', '');
  const tgChannel = getSetting('broadcast_telegram_channel', '');
  if (waChannel || tgChannel) {
    lines.push('📌 Explore More Products Here:');
    if (waChannel) lines.push(`👉 WhatsApp Channel: ${waChannel}`);
    if (tgChannel) lines.push(`👉 Telegram Channel: ${tgChannel}`);
    lines.push('');
  }

  // product_url intentionally omitted — no external marketplace links in messages

  return lines.join('\n').trim();
}

function start() {
  // Hourly: sheet schedule-date check
  cron.schedule('0 * * * *', () => checkSheetSchedules().catch(console.error));
  // Every minute: scheduled campaigns
  cron.schedule('* * * * *', () => checkScheduledCampaigns().catch(console.error));
  // Midnight: reset daily counters (also lazily handled in waManager, this is a safety net)
  cron.schedule('0 0 * * *', () => {
    db.prepare("UPDATE numbers SET messages_sent_today = 0, cooldown_until = NULL").run();
  });
}

module.exports = { start, runCampaign, formatProductMessage, checkSheetSchedules };
