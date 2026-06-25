const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const EventEmitter = require('events');

const { sessionsDir: SESSIONS_DIR } = require('../utils/paths');

/**
 * Manages one whatsapp-web.js Client per connected WA number.
 * Each number has a fully isolated Puppeteer/session (LocalAuth clientId = number row id).
 */
class WAManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // numberId -> { client, qr, status }
    this._cleanupStaleLocks();
  }

  /** Chromium leaves a SingletonLock file in its profile dir if the process is killed
   * non-gracefully (e.g. `docker stop`/redeploy). On the next launch this makes Chromium
   * think another process owns the profile and refuses to start. Since this only runs
   * once at process boot — before any client of ours has launched anything — any lock
   * file found here is guaranteed stale. */
  _cleanupStaleLocks() {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    for (const entry of fs.readdirSync(SESSIONS_DIR)) {
      const lockPath = path.join(SESSIONS_DIR, entry, 'SingletonLock');
      if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, { force: true });
        console.log(`Removed stale SingletonLock for ${entry}`);
      }
    }
  }

  list() {
    return db.prepare('SELECT * FROM numbers ORDER BY id').all().map((n) => ({
      ...n,
      runtimeStatus: this.clients.get(n.id)?.status || n.status,
      qr: this.clients.get(n.id)?.qr || null,
      effective_daily_limit: this.getEffectiveDailyLimit(n),
    }));
  }

  addNumber(name) {
    const info = db.prepare('INSERT INTO numbers (name, status) VALUES (?, ?)').run(name, 'disconnected');
    return db.prepare('SELECT * FROM numbers WHERE id = ?').get(info.lastInsertRowid);
  }

  removeNumber(numberId) {
    this.disconnect(numberId);
    db.prepare('DELETE FROM numbers WHERE id = ?').run(numberId);
    const sessionPath = path.join(SESSIONS_DIR, `session-wa_${numberId}`);
    fs.rm(sessionPath, { recursive: true, force: true }, (err) => {
      if (err) console.error(`Failed to clean up session folder for number ${numberId}:`, err.message);
    });
  }

  /** Wipes a number's saved browser session without deleting the number row — use when a
   * session is stuck/corrupted (e.g. after a Chromium version change) and needs a fresh QR. */
  resetSession(numberId) {
    this.disconnect(numberId);
    const sessionPath = path.join(SESSIONS_DIR, `session-wa_${numberId}`);
    fs.rmSync(sessionPath, { recursive: true, force: true });
    db.prepare("UPDATE numbers SET status = 'disconnected', phone = NULL WHERE id = ?").run(numberId);
  }

  async connect(numberId) {
    const row = db.prepare('SELECT * FROM numbers WHERE id = ?').get(numberId);
    if (!row) throw new Error('Number not found');
    if (this.clients.has(numberId)) {
      const existing = this.clients.get(numberId);
      // 'connected', 'initializing', and 'qr' all mean a Chromium instance for this
      // number is currently alive and progressing normally — repeated Connect clicks
      // (or any caller retrying) must not tear that down and race a second launch
      // against the same LocalAuth profile dir, which is exactly what trips
      // Chromium's SingletonLock. Only a truly dead entry should be relaunched.
      if (['connected', 'initializing', 'qr'].includes(existing.status)) return existing;
      await existing.client.destroy().catch(() => {});
      this.clients.delete(numberId);
    }

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `wa_${numberId}`, dataPath: SESSIONS_DIR }),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      // Reverted: pinning to a fixed WA Web build (2.2412.54) left window.Store
      // entirely unexposed for both Business and regular accounts — confirmed via
      // /api/numbers/:id/diagnose (clientState CONNECTED, page loaded fine, but
      // storeExists: false). That pin was based on an unconfirmed theory and made
      // things worse. Falls back to whatsapp-web.js's default remote webVersionCache
      // pointed at its own maintained version index, not a fixed snapshot.
      puppeteer: {
        // Old headless ("true") is fingerprinted by sites more easily than the newer
        // headless mode, which renders much closer to a real browser.
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        protocolTimeout: 120000,
        defaultViewport: { width: 1280, height: 900 },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // Containers' /dev/shm is usually tiny (64MB default); Chromium's
          // shared-memory IPC hangs CDP calls like getChats() without this.
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--window-size=1280,900',
        ],
      },
    });

    const entry = { client, qr: null, status: 'initializing' };
    this.clients.set(numberId, entry);

    client.on('qr', async (qr) => {
      entry.qr = await qrcode.toDataURL(qr);
      entry.status = 'qr';
      db.prepare('UPDATE numbers SET status = ? WHERE id = ?').run('qr', numberId);
      this.emit('status', { numberId, status: 'qr' });
    });

    client.on('ready', async () => {
      entry.qr = null;
      entry.status = 'connected';
      const me = client.info?.wid?.user || null;
      const row = db.prepare('SELECT first_connected_at FROM numbers WHERE id = ?').get(numberId);
      if (!row?.first_connected_at) {
        // Warm-up clock starts the first time this number ever goes live, not on every reconnect.
        db.prepare('UPDATE numbers SET first_connected_at = CURRENT_TIMESTAMP WHERE id = ?').run(numberId);
      }
      db.prepare('UPDATE numbers SET status = ?, phone = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?')
        .run('connected', me, numberId);
      this.emit('status', { numberId, status: 'connected' });
      // whatsapp-web.js's internal Store isn't always fully hydrated the instant
      // 'ready' fires; calling getChats() immediately can hang indefinitely.
      // Give it a few seconds before the first fetch.
      setTimeout(() => {
        this.fetchGroups(numberId).catch((e) => console.error(`[WA ${numberId}] initial group fetch failed:`, e.message));
      }, 5000);
    });

    client.on('disconnected', (reason) => {
      console.error(`[WA ${numberId}] disconnected. Reason:`, reason);
      entry.status = 'disconnected';
      db.prepare('UPDATE numbers SET status = ? WHERE id = ?').run('disconnected', numberId);
      this.emit('status', { numberId, status: 'disconnected' });
    });

    client.on('auth_failure', (msg) => {
      console.error(`[WA ${numberId}] auth_failure:`, msg);
      entry.status = 'disconnected';
      db.prepare('UPDATE numbers SET status = ? WHERE id = ?').run('disconnected', numberId);
    });

    client.on('change_state', (state) => {
      console.log(`[WA ${numberId}] state changed:`, state);
    });

    client.on('message', async (msg) => {
      try {
        await this.handleIncoming(numberId, msg);
      } catch (e) {
        console.error('chatbot handling error', e.message);
      }
    });

    client.initialize().catch((err) => {
      entry.status = 'disconnected';
      console.error(`[WA ${numberId}] failed to init:`, err.message, '\n', err.stack);
    });

    return entry;
  }

  disconnect(numberId) {
    const entry = this.clients.get(numberId);
    if (entry) {
      entry.client.destroy().catch(() => {});
      this.clients.delete(numberId);
    }
    db.prepare('UPDATE numbers SET status = ? WHERE id = ?').run('disconnected', numberId);
  }

  getClient(numberId) {
    const entry = this.clients.get(numberId);
    if (!entry || entry.status !== 'connected') return null;
    return entry.client;
  }

  /**
   * Anti-ban warm-up ramp (per the product spec): a freshly linked number
   * starts at 20 msgs/day and scales up 20% per week, capped at the number's
   * configured daily_limit ceiling. Disable per-number via warmup_enabled.
   */
  getEffectiveDailyLimit(row) {
    if (!row.warmup_enabled || !row.first_connected_at) return row.daily_limit;
    const weeksLive = Math.floor((Date.now() - new Date(row.first_connected_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const ramped = Math.round(20 * Math.pow(1.2, weeksLive));
    return Math.min(row.daily_limit, ramped);
  }

  // --- Sending ---

  async sendMessage(numberId, to, body, mediaPath) {
    const client = this.getClient(numberId);
    if (!client) throw new Error('Number not connected');

    const chatId = this._normalizeId(to);
    let result;
    if (mediaPath) {
      const media = MessageMedia.fromFilePath(mediaPath);
      result = await client.sendMessage(chatId, media, { caption: body });
    } else {
      result = await client.sendMessage(chatId, body);
    }

    this._bumpCounters(numberId);
    return result;
  }

  _normalizeId(to) {
    if (to.endsWith('@c.us') || to.endsWith('@g.us')) return to;
    const digits = to.replace(/[^\d]/g, '');
    return `${digits}@c.us`;
  }

  _bumpCounters(numberId) {
    const today = new Date().toISOString().slice(0, 10);
    const row = db.prepare('SELECT * FROM numbers WHERE id = ?').get(numberId);
    if (!row) return;
    if (row.last_reset_date !== today) {
      db.prepare('UPDATE numbers SET messages_sent_today = 1, last_reset_date = ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?')
        .run(today, numberId);
    } else {
      db.prepare('UPDATE numbers SET messages_sent_today = messages_sent_today + 1, last_activity = CURRENT_TIMESTAMP WHERE id = ?')
        .run(numberId);
    }
    const updated = db.prepare('SELECT * FROM numbers WHERE id = ?').get(numberId);
    const effectiveLimit = this.getEffectiveDailyLimit(updated);
    const risk = Math.min(100, Math.round((updated.messages_sent_today / Math.max(1, effectiveLimit)) * 100));
    db.prepare('UPDATE numbers SET ban_risk_score = ? WHERE id = ?').run(risk, numberId);

    if (updated.messages_sent_today >= effectiveLimit) {
      const until = new Date(Date.now() + updated.cooldown_minutes * 60000).toISOString();
      db.prepare('UPDATE numbers SET cooldown_until = ? WHERE id = ?').run(until, numberId);
    }
  }

  /** Picks the next eligible number for auto-rotate sending. */
  pickNextAvailableNumber(preferredId) {
    const today = new Date().toISOString().slice(0, 10);
    const numbers = db.prepare("SELECT * FROM numbers WHERE status = 'connected'").all();
    const eligible = numbers.filter((n) => {
      const sentToday = n.last_reset_date === today ? n.messages_sent_today : 0;
      const inCooldown = n.cooldown_until && new Date(n.cooldown_until) > new Date();
      return sentToday < this.getEffectiveDailyLimit(n) && !inCooldown;
    });
    if (eligible.length === 0) return null;
    if (preferredId) {
      const preferred = eligible.find((n) => n.id === preferredId);
      if (preferred) return preferred;
    }
    return eligible[0];
  }

  // --- Diagnostics ---

  /** Isolates whether a hang is in Puppeteer's CDP transport itself, or specifically
   * in WhatsApp Web's internal Store object — run this instead of guessing further. */
  async diagnose(numberId) {
    const entry = this.clients.get(numberId);
    if (!entry) return { error: 'no client entry for this number' };
    const client = entry.client;
    const withTimeout = (label, promise, ms = 10000) =>
      Promise.race([
        promise.then((value) => ({ label, ok: true, value: typeof value === 'object' ? JSON.stringify(value).slice(0, 200) : value })),
        new Promise((resolve) => setTimeout(() => resolve({ label, ok: false, value: `timed out after ${ms}ms` }), ms)),
      ]);

    const results = {};
    results.entryStatus = entry.status;
    results.basicEvaluate = await withTimeout('basicEvaluate', client.pupPage.evaluate(() => 1 + 1));
    results.documentTitle = await withTimeout('documentTitle', client.pupPage.evaluate(() => document.title));
    results.storeExists = await withTimeout('storeExists', client.pupPage.evaluate(() => typeof window.Store !== 'undefined'));
    results.storeChatExists = await withTimeout('storeChatExists', client.pupPage.evaluate(() => typeof window.Store?.Chat !== 'undefined'));
    results.storeChatCount = await withTimeout('storeChatCount', client.pupPage.evaluate(() => window.Store?.Chat?.getModelsArray?.().length ?? 'Store.Chat.getModelsArray unavailable'));
    results.clientState = await withTimeout('clientState', client.getState());
    return results;
  }

  // --- Groups / Communities ---

  async fetchGroups(numberId) {
    const client = this.getClient(numberId);
    if (!client) return [];
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('getChats() timed out after 45s — WhatsApp Web session may be unresponsive, try reconnecting this number')), 45000));
    const chats = await Promise.race([client.getChats(), timeout]);
    const groups = chats.filter((c) => c.isGroup);
    db.prepare('DELETE FROM groups_cache WHERE number_id = ?').run(numberId);
    const insert = db.prepare(
      'INSERT INTO groups_cache (number_id, wa_id, name, type, member_count, is_admin, last_activity) VALUES (?,?,?,?,?,?,?)'
    );
    for (const g of groups) {
      const isChannel = g.isChannel || false;
      insert.run(
        numberId,
        g.id._serialized,
        g.name,
        isChannel ? 'channel' : 'group',
        g.participants?.length || 0,
        g.groupMetadata?.isAdmin ? 1 : 0,
        new Date().toISOString()
      );
    }
    return groups;
  }

  // --- Chatbot ---

  async handleIncoming(numberId, msg) {
    if (msg.fromMe) return;
    const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'auto_reply'").get();
    if (settingRow && settingRow.value === 'false') return;

    const body = (msg.body || '').trim().toLowerCase();
    const flows = db
      .prepare('SELECT * FROM chatbot_flows WHERE enabled = 1 AND (number_id IS NULL OR number_id = ?)')
      .all(numberId);

    let matched = flows.find((f) => !f.is_fallback && body === f.keyword.toLowerCase());
    if (!matched) matched = flows.find((f) => !f.is_fallback && body.includes(f.keyword.toLowerCase()));
    if (!matched) matched = flows.find((f) => f.is_fallback);

    if (matched) {
      const client = this.getClient(numberId);
      if (client) {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
        await client.sendMessage(msg.from, matched.reply);
      }
    }
  }

  /** Closes every Chromium instance cleanly. Without this, `docker stop`/redeploys
   * SIGKILL the Node process and leave orphaned Chromium processes holding each
   * profile's SingletonLock, which then blocks the next launch attempt entirely. */
  async shutdown() {
    console.log(`Shutting down ${this.clients.size} WhatsApp session(s)...`);
    await Promise.all(
      [...this.clients.values()].map((entry) => entry.client.destroy().catch(() => {}))
    );
  }
}

module.exports = new WAManager();
