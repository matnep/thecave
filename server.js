// The Cave — interactive presentation backdrop.
// Display:  http://localhost:3000/        (put this on the projector, press F for fullscreen)
// Audience: http://<lan-ip>:3000/join     (what the QR code points to)
// Admin:    http://localhost:3000/admin   (moderation; only reachable from this machine)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const MAX_LEN = 140;
const COOLDOWN_MS = 5000;
const HISTORY = 200;

function lanIp() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker/i.test(name)) continue;
      candidates.push(a.address);
    }
  }
  return candidates.find((ip) => ip.startsWith('192.168.')) ||
    candidates.find((ip) => ip.startsWith('10.')) ||
    candidates[0] || 'localhost';
}

// PUBLIC_URL lets you point the QR at a tunnel (e.g. cloudflared) if venue Wi-Fi blocks device-to-device traffic.
const BASE_URL = (process.env.PUBLIC_URL || `http://${lanIp()}:${PORT}`).replace(/\/$/, '');
const JOIN_URL = `${BASE_URL}/join`;

const state = {
  moderation: process.env.MODERATE === '1',
  live: [],
  pending: [],
  qrVisible: false,
};
let nextId = 1;
const lastPost = new Map();
const displays = new Set();
const admins = new Set();

function send(clients, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
const broadcast = (event, data) => { send(displays, event, data); send(admins, event, data); };
const adminSnapshot = () => ({ ...state, joinUrl: JOIN_URL });

function isLocal(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.mjs': 'text/javascript', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' };
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, 'node_modules');

// /vendor/* serves three.js and fonts straight from node_modules so the show works offline
function serveFile(res, file, req) {
  if (file.startsWith('vendor/') && !/^vendor\/(three|@fontsource)\//.test(file)) return json(res, 404, { error: 'not found' });
  const root = file.startsWith('vendor/') ? VENDOR : PUBLIC;
  const full = path.join(root, root === VENDOR ? file.slice('vendor/'.length) : file);
  if (!full.startsWith(root + path.sep)) return json(res, 403, { error: 'forbidden' });
  const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
  if (type.startsWith('video/') || type.startsWith('audio/')) return streamMedia(req, res, full, type);
  fs.readFile(full, (err, buf) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

// videos need HTTP Range support so the browser can seek and loop smoothly
function streamMedia(req, res, full, type) {
  fs.stat(full, (err, st) => {
    if (err) return json(res, 404, { error: 'not found' });
    const m = /bytes=(d*)-(d*)/.exec(req.headers.range || '');
    if (!m) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(full).pipe(res);
    }
    const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${st.size}` });
    fs.createReadStream(full, { start, end }).pipe(res);
  });
}

function openStream(req, res, set, initial) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`event: init\ndata: ${JSON.stringify(initial)}\n\n`);
  set.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); set.delete(res); });
}

function publish(msg) {
  state.live.push(msg);
  if (state.live.length > HISTORY) state.live.shift();
  broadcast('message', msg);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    if (req.method === 'GET') {
      if (p === '/') return serveFile(res, 'display.html');
      if (p === '/video') return serveFile(res, 'display-video.html');
      if (p === '/join') return serveFile(res, 'join.html');
      if (p === '/admin') return isLocal(req) ? serveFile(res, 'admin.html') : json(res, 403, { error: 'admin is local only' });
      if (p === '/api/qr.svg') {
        const svg = await QRCode.toString(JOIN_URL, { type: 'svg', margin: 1, color: { dark: '#120c08', light: '#f4e6cf' } });
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        return res.end(svg);
      }
      if (p === '/api/stream') {
        return openStream(req, res, displays, { messages: state.live.slice(-20), joinUrl: JOIN_URL, qrVisible: state.qrVisible });
      }
      if (p === '/api/admin/stream' && isLocal(req)) return openStream(req, res, admins, adminSnapshot());
      return serveFile(res, decodeURIComponent(p.slice(1)), req);
    }

    if (req.method === 'POST' && p === '/api/message') {
      const ip = req.socket.remoteAddress;
      const now = Date.now();
      if (now - (lastPost.get(ip) || 0) < COOLDOWN_MS) return json(res, 429, { error: 'Easy — wait a few seconds.' });
      const body = await readJson(req);
      const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
      const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!text) return json(res, 400, { error: 'Write something first.' });
      lastPost.set(ip, now);
      const msg = { id: nextId++, name, text, at: now };
      if (state.moderation) {
        state.pending.push(msg);
        send(admins, 'pending', msg);
      } else {
        publish(msg);
      }
      return json(res, 200, { ok: true, moderated: state.moderation });
    }

    if (req.method === 'POST' && p.startsWith('/api/admin/')) {
      if (!isLocal(req)) return json(res, 403, { error: 'admin is local only' });
      const body = await readJson(req);
      const action = p.slice('/api/admin/'.length);
      if (action === 'approve') {
        const i = state.pending.findIndex((m) => m.id === body.id);
        if (i >= 0) { const [m] = state.pending.splice(i, 1); publish(m); }
      } else if (action === 'reject') {
        state.pending = state.pending.filter((m) => m.id !== body.id);
      } else if (action === 'remove') {
        state.live = state.live.filter((m) => m.id !== body.id);
        broadcast('remove', { id: body.id });
      } else if (action === 'spotlight') {
        const m = state.live.find((x) => x.id === body.id);
        if (m) send(displays, 'spotlight', m);
      } else if (action === 'clear') {
        state.live = [];
        broadcast('clear', {});
      } else if (action === 'moderation') {
        state.moderation = !!body.on;
      } else if (action === 'qr') {
        state.qrVisible = !!body.on;
        send(displays, 'qr', { on: state.qrVisible });
      } else {
        return json(res, 404, { error: 'unknown action' });
      }
      send(admins, 'init', adminSnapshot());
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 400, { error: 'bad request' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  THE CAVE is running\n');
  console.log(`  Display (projector):  http://localhost:${PORT}/`);
  console.log(`  Admin / moderation:   http://localhost:${PORT}/admin`);
  console.log(`  Audience (QR code):   ${JOIN_URL}`);
  console.log(`  Moderation:           ${state.moderation ? 'ON' : 'off'} (set MODERATE=1 to start with it on)\n`);
});
