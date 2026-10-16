// The Cave room: one Durable Object holds everything for the event.
//   questions  SQLite table; status = pending | approved | answered | rejected
//   settings   SQLite key/value (JSON): moderation, focus, presenters, live presenter, TV caption, partner logos,
//              seconds per question, sound, fire ambience, chromatic aberration, and what the TV last reported showing
// Live clients connect over hibernatable WebSockets, tagged 'display' (backdrop) or 'admin' (admin page + moderator panel).
// The backdrop reports what's on its TV; admins can drive the TV remotely (next / previous / QR / slideshow).
import { DurableObject } from 'cloudflare:workers';

const MAX_LEN = 140;
const NAME_LEN = 24;
const COOLDOWN_MS = 5000;

const DEFAULTS = {
  moderation: false,
  focus: false,
  presenters: [],          // [{ id, name, title }]
  live: null,              // id of the presenter on stage
  caption: 'SCAN TO ASK A QUESTION',   // the only line of text under the QR on the TV
  sponsors: true,          // partner logos take turns with the QR on the TV
  questionSecs: 25,        // how long each question stays up once it's typed out
  sound: { chime: 'marimba', volume: .6, muted: false },   // new-question sound on the backdrop
  ambience: { volume: .35, muted: false },                 // crackling fire
  chroma: { on: false, amount: .6 },                       // chromatic aberration
  alarm: false,            // alarm light held on by the admin (new questions still flash it regardless)
  tv: null,                // { kind, id, manual, at } as last reported by the backdrop
};
const CHIMES = ['marimba', 'bowl', 'dingdong', 'none'];
const TV_COMMANDS = ['next', 'prev', 'qr', 'auto', 'test'];
const level = (v, fallback) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : fallback);

// Anything matching goes to "pending" for a human to check, even with moderation off.
// Matched on whole words after folding common look-alike characters.
const BLOCKLIST = [
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'bastard', 'slut', 'whore', 'nigger', 'nigga', 'retard',
  'babi', 'bodoh', 'sial', 'pukimak', 'puki', 'kimak', 'lancau', 'celaka', 'bangsat', 'keparat', 'pantat', 'butoh', 'konek', 'haram jadah', 'anjing',
];
const fold = (s) => s.toLowerCase().replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't');
const BLOCK_RE = new RegExp(`(^|[^a-z])(${BLOCKLIST.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?=$|[^a-z])`, 'i');

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.lastPost = new Map();   // ip → time; only an anti-spam hint, fine to lose on eviction
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL,
        presenter TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        flagged INTEGER NOT NULL DEFAULT 0,
        at INTEGER NOT NULL
      )`);
      this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    });
  }

  // ------------------------------------------------------------ settings
  setting(key) {
    const row = this.sql.exec('SELECT value FROM settings WHERE key = ?', key).toArray()[0];
    return row ? JSON.parse(row.value) : structuredClone(DEFAULTS[key]);
  }
  put(key, value) {
    this.sql.exec('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }
  livePresenter() {
    const live = this.setting('live');
    return this.setting('presenters').find((p) => p.id === live) || null;
  }
  // what the backdrop needs
  config() {
    return {
      caption: this.setting('caption'), presenter: this.livePresenter(), focus: this.setting('focus'), sponsors: this.setting('sponsors'),
      questionSecs: this.setting('questionSecs'), sound: this.setting('sound'), ambience: this.setting('ambience'), chroma: this.setting('chroma'),
      alarm: this.setting('alarm'),
    };
  }
  // everything cleared for the TV, oldest first: the backdrop's slideshow
  approvedList() {
    return this.sql.exec("SELECT id, name, text, presenter, at FROM questions WHERE status = 'approved' ORDER BY id").toArray();
  }
  syncDisplays() { this.broadcast('display', { type: 'approved', list: this.approvedList() }); }
  pushConfig() { const config = this.config(); this.broadcast('display', { type: 'config', config }); }

  // ------------------------------------------------------------ live connections
  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role') === 'admin' ? 'admin' : 'display';
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [role]);
    if (role === 'display') this.refreshAdmins();   // admins show whether a backdrop is open
    server.send(JSON.stringify(role === 'admin' ? this.adminSnapshot() : { type: 'init', config: this.config(), approved: this.approvedList() }));
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, message) {
    if (message === 'ping') return ws.send('pong');
    // the backdrop telling us what's on its TV
    if (!this.ctx.getTags(ws).includes('display') || typeof message !== 'string' || message.length > 300) return;
    let msg;
    try { msg = JSON.parse(message); } catch { return; }
    if (msg?.type !== 'status') return;
    const tv = {
      kind: ['qr', 'question', 'partner'].includes(msg.kind) ? msg.kind : null,
      id: Number.isInteger(msg.id) ? msg.id : null,
      manual: !!msg.manual,
      at: Date.now(),
    };
    this.put('tv', tv);
    this.broadcast('admin', { type: 'tv', tv });
  }
  webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch { /* already closed */ }
    if (this.ctx.getTags(ws).includes('display')) this.refreshAdmins();
  }
  broadcast(tag, msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets(tag)) {
      try { ws.send(data); } catch { /* client went away */ }
    }
  }
  adminSnapshot() {
    return {
      type: 'state',
      questions: this.sql.exec('SELECT * FROM questions ORDER BY id DESC LIMIT 1000').toArray(),
      settings: {
        moderation: this.setting('moderation'), focus: this.setting('focus'), presenters: this.setting('presenters'),
        live: this.setting('live'), caption: this.setting('caption'), sponsors: this.setting('sponsors'),
        questionSecs: this.setting('questionSecs'), sound: this.setting('sound'), ambience: this.setting('ambience'), chroma: this.setting('chroma'),
        alarm: this.setting('alarm'),
      },
      tv: this.setting('tv'),
      displays: this.ctx.getWebSockets('display').filter((w) => w.readyState === 1).length,
      formUrl: `${(this.env.PUBLIC_URL || '').replace(/\/$/, '')}/form`,
    };
  }
  refreshAdmins() { this.broadcast('admin', this.adminSnapshot()); }
  question(id) { return this.sql.exec('SELECT * FROM questions WHERE id = ?', id).toArray()[0]; }

  // ------------------------------------------------------------ audience
  publicInfo() {
    const p = this.livePresenter();
    return { presenter: p ? { name: p.name, title: p.title } : null, maxLength: MAX_LEN };
  }

  submit({ name, text, ip }) {
    const now = Date.now();
    if (now - (this.lastPost.get(ip) || 0) < COOLDOWN_MS) return { error: 'Easy — wait a few seconds.', status: 429 };
    text = clean(text, MAX_LEN);
    name = clean(name, NAME_LEN);
    if (!text) return { error: 'Write something first.' };
    this.lastPost.set(ip, now);
    if (this.lastPost.size > 5000) this.lastPost.clear();

    const flagged = BLOCK_RE.test(fold(`${name} ${text}`)) ? 1 : 0;
    const held = flagged || this.setting('moderation');
    const presenter = this.livePresenter()?.name || '';
    const q = this.sql.exec(
      'INSERT INTO questions (name, text, presenter, status, flagged, at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      name, text, presenter, held ? 'pending' : 'approved', flagged, now,
    ).one();
    if (!held) { this.broadcast('display', { type: 'message', q }); this.syncDisplays(); }
    this.refreshAdmins();
    return { ok: true, moderated: !!held };
  }

  // ------------------------------------------------------------ admin
  admin(action, body) {
    const id = Number(body.id);
    const setStatus = (status) => {
      const q = this.question(id);
      if (!q) return null;
      this.sql.exec('UPDATE questions SET status = ? WHERE id = ?', status, id);
      return { ...q, status };
    };
    switch (action) {
      case 'ping': return { ok: true };   // "am I still signed in?"
      case 'approve': {
        const q = setStatus('approved');
        if (q) { this.broadcast('display', { type: 'message', q }); this.syncDisplays(); }
        break;
      }
      case 'spotlight': {          // put on the TV now (approves it if needed)
        const q = setStatus('approved');
        if (q) { this.syncDisplays(); this.broadcast('display', { type: 'spotlight', q }); }
        break;
      }
      case 'reject':
      case 'answered':
        if (setStatus(action === 'reject' ? 'rejected' : 'answered')) this.syncDisplays();
        break;
      case 'restore': if (setStatus('pending')) this.syncDisplays(); break;
      case 'delete':
        this.sql.exec('DELETE FROM questions WHERE id = ?', id);
        this.syncDisplays();
        break;
      case 'clear':                // everything still on the TV counts as answered
        this.sql.exec("UPDATE questions SET status = 'answered' WHERE status = 'approved'");
        this.syncDisplays();
        break;
      case 'moderation': this.put('moderation', !!body.on); break;
      case 'focus':
        this.put('focus', !!body.on);
        this.pushConfig();
        break;
      case 'questionSecs':
        this.put('questionSecs', Math.round(Math.min(180, Math.max(5, Number(body.secs) || DEFAULTS.questionSecs))));
        this.pushConfig();
        break;
      case 'sound': {
        const cur = this.setting('sound');
        this.put('sound', {
          chime: CHIMES.includes(body.chime) ? body.chime : cur.chime,
          volume: level(body.volume, cur.volume),
          muted: typeof body.muted === 'boolean' ? body.muted : cur.muted,
        });
        this.pushConfig();
        break;
      }
      case 'ambience': {
        const cur = this.setting('ambience');
        this.put('ambience', { volume: level(body.volume, cur.volume), muted: typeof body.muted === 'boolean' ? body.muted : cur.muted });
        this.pushConfig();
        break;
      }
      case 'chroma': {
        const cur = this.setting('chroma');
        this.put('chroma', { on: typeof body.on === 'boolean' ? body.on : cur.on, amount: level(body.amount, cur.amount) });
        this.pushConfig();
        break;
      }
      case 'alarm':
        this.put('alarm', !!body.on);
        this.pushConfig();
        break;
      case 'tv':                   // remote control for the backdrop's TV
        if (!TV_COMMANDS.includes(body.cmd)) return { error: 'Unknown TV command.' };
        this.broadcast('display', { type: 'control', cmd: body.cmd });
        return { ok: true };
      case 'presenters': {
        const list = (Array.isArray(body.presenters) ? body.presenters : []).slice(0, 50).map((p) => ({
          id: clean(p.id, 40) || crypto.randomUUID(), name: clean(p.name, 60), title: clean(p.title, 120),
        })).filter((p) => p.name);
        this.put('presenters', list);
        if (!list.some((p) => p.id === this.setting('live'))) this.put('live', null);
        this.pushConfig();
        break;
      }
      case 'live':
        this.put('live', body.id ? clean(body.id, 40) : null);
        this.pushConfig();
        break;
      case 'caption':
        this.put('caption', clean(body.caption, 40).toUpperCase() || DEFAULTS.caption);
        this.pushConfig();
        break;
      case 'sponsors':
        this.put('sponsors', !!body.on);
        this.pushConfig();
        break;
      default:
        return { error: 'Unknown action.' };
    }
    this.refreshAdmins();
    return { ok: true };
  }
}
