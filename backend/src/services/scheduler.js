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

async function checkBroadcastQueues() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentHour = String(now.getHours()).padStart(2, '0');

  const queues = db.prepare("SELECT * FROM broadcast_queues WHERE status = 'active' AND next_send_at <= ?").all(today);

  for (const q of queues) {
    // Support both send_times array (new) and legacy send_time (single)
    const sendTimes = (() => {
      try { const arr = JSON.parse(q.send_times || '[]'); if (arr.length) return arr; } catch (_) {}
      return [q.send_time || '09:00'];
    })();
    const matchesHour = sendTimes.some((t) => t.split(':')[0].padStart(2, '0') === currentHour);
    if (!matchesHour) continue;

    const productIds = JSON.parse(q.product_ids || '[]');
    if (!productIds.length) continue;

    // Support multiple targets (groups + channels together)
    const targetIds = JSON.parse(q.target_ids || '[]');
    const targets = targetIds.length > 0 ? targetIds : (q.target_id ? [q.target_id] : []);
    if (!targets.length) continue;

    const numberId = q.number_id;
    const perDay = q.products_per_day || 3;
    const delayMs = (q.delay_seconds || 10) * 1000;

    let idx = q.current_index || 0;
    let sent = 0;

    for (let i = 0; i < perDay; i++) {
      const pid = productIds[idx % productIds.length];
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
      if (!product) { idx++; continue; }

      const body = formatProductMessage(product);

      // Send to every selected target
      for (const to of targets) {
        try {
          await wa.sendMessage(numberId, to, body, product.image_url || null);
          sent++;
        } catch (e) {
          console.error(`[Queue ${q.id}] failed product ${pid} to ${to}:`, e.message);
        }
        if (targets.indexOf(to) < targets.length - 1) {
          await new Promise((r) => setTimeout(r, 3000)); // 3s between targets
        }
      }

      idx++;
      if (i < perDay - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    // Advance cursor and schedule next send
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (q.frequency_days || 1));
    db.prepare('UPDATE broadcast_queues SET current_index = ?, next_send_at = ? WHERE id = ?')
      .run(idx % productIds.length, nextDate.toISOString().slice(0, 10), q.id);

    console.log(`[Queue ${q.id}] "${q.name}" sent ${sent} msgs across ${targets.length} target(s), next: ${nextDate.toISOString().slice(0, 10)}`);
  }
}

async function checkMemberQueues() {
  const today = new Date().toISOString().slice(0, 10);
  const queues = db.prepare("SELECT * FROM group_member_queues WHERE status = 'active' AND next_send_at <= ?").all(today);

  for (const q of queues) {
    const contactIds = JSON.parse(q.contact_ids || '[]');
    if (!contactIds.length) continue;

    let idx = q.current_index || 0;
    const batch = [];
    for (let i = 0; i < q.members_per_day; i++) {
      if (idx >= contactIds.length) break; // all contacts processed
      const cid = contactIds[idx];
      const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(cid);
      if (contact?.phone) {
        batch.push(contact.phone.replace(/\D/g, '') + '@s.whatsapp.net');
      }
      idx++;
    }

    if (batch.length) {
      try {
        await wa.addGroupMembers(q.number_id, q.group_id, batch);
        console.log(`[MemberQueue ${q.id}] "${q.name}" added ${batch.length} members`);
      } catch (e) {
        console.error(`[MemberQueue ${q.id}] failed:`, e.message);
      }
    }

    const allDone = idx >= contactIds.length;
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (q.frequency_days || 1));
    db.prepare('UPDATE group_member_queues SET current_index = ?, next_send_at = ?, status = ? WHERE id = ?')
      .run(allDone ? 0 : idx, nextDate.toISOString().slice(0, 10), allDone ? 'completed' : 'active', q.id);

    if (allDone) console.log(`[MemberQueue ${q.id}] "${q.name}" all contacts added — marked completed`);
  }
}

function start() {
  // Hourly: sheet schedule-date check + broadcast queues
  cron.schedule('0 * * * *', () => checkSheetSchedules().catch(console.error));
  cron.schedule('0 * * * *', () => checkBroadcastQueues().catch(console.error));
  // Every minute: scheduled campaigns
  cron.schedule('* * * * *', () => checkScheduledCampaigns().catch(console.error));
  // Daily at midnight IST: member queues + reset counters
  cron.schedule('0 0 * * *', () => {
    db.prepare("UPDATE numbers SET messages_sent_today = 0, cooldown_until = NULL").run();
    checkMemberQueues().catch(console.error);
  });
}

module.exports = { start, runCampaign, formatProductMessage, checkSheetSchedules, checkBroadcastQueues };
