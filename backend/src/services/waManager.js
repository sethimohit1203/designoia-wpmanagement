const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const EventEmitter = require('events');
const { sessionsDir: SESSIONS_DIR } = require('../utils/paths');

// Baileys is ESM-only; load it once via dynamic import and cache it.
let _baileys = null;
async function getBaileys() {
  if (!_baileys) _baileys = await import('@whiskeysockets/baileys');
  return _baileys;
}

const noop = () => {};
const makeLogger = () => ({
  level: 'silent',
  fatal: noop,
  error: (obj, msg) => console.error('[Baileys]', msg || (typeof obj === 'object' ? obj?.message : obj)),
  warn: noop,
  info: noop,
  debug: noop,
  trace: noop,
  child: () => makeLogger(),
});

class WAManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // numberId -> { sock, qr, status }
    this._manualDisconnect = new Set(); // numberIds disconnected by the user (no auto-reconnect)
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
    fs.rm(path.join(SESSIONS_DIR, `wa_${numberId}`), { recursive: true, force: true }, () => {});
  }

  resetSession(numberId) {
    this.disconnect(numberId);
    fs.rmSync(path.join(SESSIONS_DIR, `wa_${numberId}`), { recursive: true, force: true });
    db.prepare("UPDATE numbers SET status = 'disconnected', phone = NULL WHERE id = ?").run(numberId);
  }

  _destroySocket(numberId) {
    const entry = this.clients.get(numberId);
    if (entry?.sock) {
      try { entry.sock.end(undefined); } catch {}
      try { entry.sock.ws?.close?.(); } catch {}
    }
    this.clients.delete(numberId);
  }

  disconnect(numberId) {
    this._manualDisconnect.add(numberId);
    this._destroySocket(numberId);
    db.prepare('UPDATE numbers SET status = ? WHERE id = ?').run('disconnected', numberId);
  }

  async connect(numberId) {
    const row = db.prepare('SELECT * FROM numbers WHERE id = ?').get(numberId);
    if (!row) throw new Error('Number not found');

    this._manualDisconnect.delete(numberId);

    if (this.clients.has(numberId)) {
      const existing = this.clients.get(numberId);
      if (['connected', 'initializing', 'qr'].includes(existing.status)) return existing;
      this._destroySocket(numberId);
    }

    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = await getBaileys();

    const sessionDir = path.join(SESSIONS_DIR, `wa_${numberId}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    let version;
    try {
      const res = await fetchLatestBaileysVersion();
      version = res.version;
    } catch {
      version = [2, 3000, 1015901307];
    }

    const sock = makeWASocket({
      version,
      logger: makeLogger(),
      auth: state,
      printQRInTerminal: false,
      // Identify as a standard browser — avoids the automation fingerprint
      browser: ['Ubuntu', 'Chrome', '124.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 30000,
      keepAliveIntervalMs: 25000,
      // Lower profile — don't broadcast presence on connect
      markOnlineOnConnect: false,
      // Don't pull full message history; we only need real-time
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      // Retry config — transient network errors self-heal
      retryRequestDelayMs: 2000,
    });

    const entry = { sock, qr: null, status: 'initializing' };
    this.clients.set(numberId, entry);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          entry.qr = await qrcode.toDataURL(qr);
          entry.status = 'qr';
          db.prepare('UPDATE numbers SET status = ? WHERE id = ?').run('qr', numberId);
          this.emit('status', { numberId, status: 'qr' });
        } catch (e) {
          console.error(`[WA ${numberId}] QR generation error:`, e.message);
        }
      }

      if (connection === 'open') {
        entry.qr = null;
        entry.status = 'connected';
        // sock.user.id is like "919876543210:0@s.whatsapp.net"
        const userId = sock.user?.id?.split(':')[0]?.split('@')[0] || null;
        const dbRow = db.prepare('SELECT first_connected_at FROM numbers WHERE id = ?').get(numberId);
        if (!dbRow?.first_connected_at) {
          db.prepare('UPDATE numbers SET first_connected_at = CURRENT_TIMESTAMP WHERE id = ?').run(numberId);
        }
        db.prepare('UPDATE numbers SET status = ?, phone = ?, last_activity = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?')
          .run('connected', userId, numberId);
        this.emit('status', { numberId, status: 'connected' });
        console.log(`[WA ${numberId}] connected as ${userId}`);
        // Give a moment for the session to fully settle, then fetch groups
        setTimeout(() => {
          this.fetchGroups(numberId).catch((e) => {
            console.error(`[WA ${numberId}] initial group fetch failed:`, e.message);
          });
        }, 3000);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const { DisconnectReason: DR } = await getBaileys();
        const loggedOut = statusCode === DR.loggedOut;
        const reason = lastDisconnect?.error?.message || `closed (code ${statusCode})`;

        entry.status = 'disconnected';
        db.prepare('UPDATE numbers SET status = ?, last_error = ? WHERE id = ?')
          .run('disconnected', reason, numberId);
        this.clients.delete(numberId);
        this.emit('status', { numberId, status: 'disconnected' });

        if (loggedOut) {
          // WhatsApp invalidated the session — wipe saved keys so next connect shows fresh QR
          console.log(`[WA ${numberId}] logged out by WhatsApp — clearing session files`);
          fs.rm(path.join(SESSIONS_DIR, `wa_${numberId}`), { recursive: true, force: true }, () => {});
          db.prepare("UPDATE numbers SET phone = NULL WHERE id = ?").run(numberId);
        } else if (!this._manualDisconnect.has(numberId)) {
          // Transient drop — auto-reconnect once after 5 s
          console.log(`[WA ${numberId}] connection dropped (${reason}) — reconnecting in 5 s`);
          setTimeout(() => this.connect(numberId).catch(() => {}), 5000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        try {
          await this.handleIncoming(numberId, sock, msg);
        } catch (e) {
          console.error(`[WA ${numberId}] chatbot error:`, e.message);
        }
      }
    });

    return entry;
  }

  getClient(numberId) {
    const entry = this.clients.get(numberId);
    if (!entry || entry.status !== 'connected') return null;
    return entry.sock;
  }

  // --- Anti-ban warm-up ramp ---

  getEffectiveDailyLimit(row) {
    if (!row.warmup_enabled || !row.first_connected_at) return row.daily_limit;
    const weeksLive = Math.floor((Date.now() - new Date(row.first_connected_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return Math.min(row.daily_limit, Math.round(20 * Math.pow(1.2, weeksLive)));
  }

  // --- Sending ---

  async sendMessage(numberId, to, body, mediaPath) {
    const sock = this.getClient(numberId);
    if (!sock) throw new Error('Number not connected');

    const jid = this._normalizeJid(to);

    if (mediaPath) {
      let buffer, ext;
      if (typeof mediaPath === 'string' && mediaPath.startsWith('http')) {
        try {
          const res = await fetch(mediaPath, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          buffer = Buffer.from(await res.arrayBuffer());
          ext = path.extname(new URL(mediaPath).pathname).toLowerCase() || '.jpg';
        } catch (e) {
          console.warn(`[WA ${numberId}] image download failed (${e.message}) — sending text only`);
          await sock.sendMessage(jid, { text: body });
          this._bumpCounters(numberId);
          return;
        }
      } else {
        buffer = fs.readFileSync(mediaPath);
        ext = path.extname(mediaPath).toLowerCase();
      }
      const isVideo = ['.mp4', '.mov', '.avi', '.mkv'].includes(ext);
      const isAudio = ['.mp3', '.ogg', '.wav', '.aac'].includes(ext);
      let content;
      if (isVideo) content = { video: buffer, caption: body };
      else if (isAudio) content = { audio: buffer, mimetype: 'audio/mp4', ptt: false };
      else content = { image: buffer, caption: body };
      await sock.sendMessage(jid, content);
    } else {
      await sock.sendMessage(jid, { text: body });
    }

    this._bumpCounters(numberId);
  }

  _normalizeJid(to) {
    if (to.endsWith('@g.us')) return to;
    if (to.endsWith('@s.whatsapp.net')) return to;
    if (to.endsWith('@c.us')) return to.replace('@c.us', '@s.whatsapp.net');
    return `${to.replace(/[^\d]/g, '')}@s.whatsapp.net`;
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
    const risk = Math.min(100, Math.round((updated.messages_sent_today / Math.max(1, this.getEffectiveDailyLimit(updated))) * 100));
    db.prepare('UPDATE numbers SET ban_risk_score = ? WHERE id = ?').run(risk, numberId);
    if (updated.messages_sent_today >= this.getEffectiveDailyLimit(updated)) {
      db.prepare('UPDATE numbers SET cooldown_until = ? WHERE id = ?')
        .run(new Date(Date.now() + updated.cooldown_minutes * 60000).toISOString(), numberId);
    }
  }

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

  // --- Groups / Communities ---

  async fetchGroups(numberId) {
    const sock = this.getClient(numberId);
    if (!sock) return [];

    // Baileys returns groups you're a member of directly — no getChats() scan needed.
    const groupsObj = await sock.groupFetchAllParticipating();
    const groups = Object.values(groupsObj);

    db.prepare('DELETE FROM groups_cache WHERE number_id = ?').run(numberId);
    const insert = db.prepare(
      'INSERT INTO groups_cache (number_id, wa_id, name, type, member_count, is_admin, last_activity) VALUES (?,?,?,?,?,?,?)'
    );
    const myJid = sock.user?.id;
    for (const g of groups) {
      const isAdmin = g.participants?.some(
        (p) => (p.id === myJid || p.id?.split(':')[0] + '@s.whatsapp.net' === myJid?.split(':')[0] + '@s.whatsapp.net') &&
               ['admin', 'superadmin'].includes(p.admin)
      ) ? 1 : 0;
      insert.run(
        numberId,
        g.id,
        g.subject || 'Unknown Group',
        'group',
        g.participants?.length || 0,
        isAdmin,
        new Date().toISOString()
      );
    }
    console.log(`[WA ${numberId}] fetched ${groups.length} groups`);
    return groups;
  }

  // --- Chatbot / auto-reply ---

  async handleIncoming(numberId, sock, msg) {
    const settingRow = db.prepare("SELECT value FROM settings WHERE key = 'auto_reply'").get();
    if (settingRow?.value === 'false') return;

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      ''
    ).trim().toLowerCase();

    if (!body) return;

    const flows = db
      .prepare('SELECT * FROM chatbot_flows WHERE enabled = 1 AND (number_id IS NULL OR number_id = ?)')
      .all(numberId);

    let matched = flows.find((f) => !f.is_fallback && body === f.keyword.toLowerCase());
    if (!matched) matched = flows.find((f) => !f.is_fallback && body.includes(f.keyword.toLowerCase()));
    if (!matched) matched = flows.find((f) => f.is_fallback);

    if (matched) {
      const jid = msg.key.remoteJid;
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
      await sock.sendMessage(jid, { text: matched.reply });
    }
  }

  // --- Diagnostics ---

  async diagnose(numberId) {
    const entry = this.clients.get(numberId);
    if (!entry) return { error: 'no client entry for this number' };
    return {
      entryStatus: entry.status,
      wsReadyState: entry.sock?.ws?.readyState,
      user: entry.sock?.user || null,
      hasQr: !!entry.qr,
    };
  }

  async shutdown() {
    console.log(`Shutting down ${this.clients.size} WhatsApp session(s)...`);
    for (const [id] of this.clients) {
      this._manualDisconnect.add(id);
      this._destroySocket(id);
    }
  }
}

module.exports = new WAManager();
