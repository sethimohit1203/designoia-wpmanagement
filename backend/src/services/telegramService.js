// Telegram Bot API — official, free, no ban risk (unlike WhatsApp automation).
// Bot must be added as an admin (with "Post Messages" permission) to any
// channel it sends to. Set TELEGRAM_BOT_TOKEN in backend/.env.

const API_BASE = 'https://api.telegram.org';

function assertConfigured() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not set in backend/.env — create a bot via @BotFather first.');
  }
}

// chatId: a channel username like "@clikixpress", or a numeric chat id.
async function sendTelegramMessage(chatId, text) {
  assertConfigured();
  const res = await fetch(`${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description || res.status}`);
  return data.result;
}

// imageSource: an http(s) URL (Telegram fetches it directly) or a local file
// path (read and uploaded as multipart). Falls back to a text-only message
// if the image fails, same pattern as WhatsApp sending in waManager.js.
async function sendTelegramPhoto(chatId, imageSource, caption) {
  assertConfigured();
  const token = process.env.TELEGRAM_BOT_TOKEN;

  try {
    if (imageSource && /^https?:\/\//i.test(imageSource)) {
      const res = await fetch(`${API_BASE}/bot${token}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: imageSource, caption, parse_mode: 'HTML' }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || 'sendPhoto failed');
      return data.result;
    }

    if (imageSource) {
      const fs = require('fs');
      const buffer = fs.readFileSync(imageSource);
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      form.append('photo', new Blob([buffer]), 'image.jpg');
      const res = await fetch(`${API_BASE}/bot${token}/sendPhoto`, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || 'sendPhoto failed');
      return data.result;
    }
  } catch (e) {
    console.warn(`[Telegram] photo send failed (${e.message}) — sending text only`);
  }

  return sendTelegramMessage(chatId, caption);
}

module.exports = { sendTelegramMessage, sendTelegramPhoto };
