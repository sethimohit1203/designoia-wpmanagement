// Telegram Bot API — official, free, no ban risk (unlike WhatsApp automation).
// Bot must be added as an admin (with "Post Messages" permission) to any
// channel it sends to. Set TELEGRAM_BOT_TOKEN in backend/.env.

const API_BASE = 'https://api.telegram.org';

// Telegram's hard limit for a photo's caption is 1024 chars — well below the
// 4096-char limit for a plain text message. Our product messages (full
// description + footer + links) routinely exceed 1024, so the caption is
// capped here and the full text is sent as a separate follow-up message
// instead of ever risking a "caption too long" API rejection.
const CAPTION_LIMIT = 1024;

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

async function sendPhotoByUrl_(chatId, imageUrl, caption) {
  const res = await fetch(`${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: imageUrl, caption: caption || undefined, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'sendPhoto failed');
  return data.result;
}

async function sendPhotoByFile_(chatId, filePath, caption) {
  const fs = require('fs');
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', new Blob([buffer]), 'image.jpg');
  const res = await fetch(`${API_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'sendPhoto failed');
  return data.result;
}

// imageSource: an http(s) URL (Telegram fetches it directly) or a local file
// path (read and uploaded as multipart). `text` is the FULL product message —
// used as the photo's caption when it fits, otherwise sent as a separate
// message right after the photo so the image is never dropped just because
// the description is long. Falls back to text-only if the photo send itself
// fails outright (broken URL, unreadable file, etc.).
async function sendTelegramPhoto(chatId, imageSource, text) {
  assertConfigured();
  if (!imageSource) return sendTelegramMessage(chatId, text);

  const fitsAsCaption = text.length <= CAPTION_LIMIT;
  const caption = fitsAsCaption ? text : null;

  try {
    const result = /^https?:\/\//i.test(imageSource)
      ? await sendPhotoByUrl_(chatId, imageSource, caption)
      : await sendPhotoByFile_(chatId, imageSource, caption);

    if (!fitsAsCaption) await sendTelegramMessage(chatId, text);
    return result;
  } catch (e) {
    console.error(`[Telegram] photo send failed (${e.message}) — sending text only`);
    return sendTelegramMessage(chatId, text);
  }
}

module.exports = { sendTelegramMessage, sendTelegramPhoto };
