// The Cave — Cloudflare Worker.
// Static pages come straight from ./public; this only handles /api/*:
//   GET  /panel               moderator panel (served from the admin build; uses the admin login)
//   GET  /api/qr.svg          QR code pointing at <PUBLIC_URL>/form
//   GET  /api/public          what the audience form needs (who's on stage)
//   POST /api/message         audience question
//   GET  /api/ws?role=…       live connection: role=display (backdrop) or role=admin (needs login)
//   POST /api/login|logout    admin session (signed, HttpOnly cookie)
//   POST /api/admin/<action>  admin actions (needs login)
import QRCode from 'qrcode';
import { Room } from './room.js';

export { Room };

const COOKIE = 'cave_admin';
const SESSION_HOURS = 12;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const room = env.ROOM.getByName('main');

    if (path === '/join') return Response.redirect(new URL('/form', url).toString(), 301);
    // the moderator panel is a second page of the admin build (public/admin/panel.html)
    if (path === '/panel') return env.ASSETS.fetch(new Request(new URL('/admin/panel', url), request));

    if (path === '/api/qr.svg') {
      // Without PUBLIC_URL (local dev) point at whatever address the backdrop was opened on. Read the Host
      // header: wrangler dev rewrites request.url to the configured route's domain.
      const origin = env.PUBLIC_URL || `${url.protocol}//${request.headers.get('host') || url.host}`;
      const target = `${origin.replace(/\/$/, '')}/form`;
      const svg = await QRCode.toString(target, { type: 'svg', margin: 1, color: { dark: '#120c08', light: '#f4e6cf' } });
      return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-cache', 'x-qr-target': target } });
    }

    if (path === '/api/public' && request.method === 'GET') return json(await room.publicInfo());

    if (path === '/api/message' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body) return json({ error: 'Bad request.' }, 400);
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      const { status, ...result } = await room.submit({ name: body.name, text: body.text, ip });
      return json(result, result.error ? (status || 400) : 200);
    }

    if (path === '/api/ws') {
      if (request.headers.get('upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket.' }, 426);
      const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'display';
      if (role === 'admin' && !(await isAdmin(request, env))) return json({ error: 'Not signed in.' }, 401);
      return room.fetch(request);   // WebSocket upgrades go to the Durable Object's fetch()
    }

    if (path === '/api/login' && request.method === 'POST') {
      if (!env.ADMIN_PASSWORD) return json({ error: 'Admin is disabled: ADMIN_PASSWORD is not set.' }, 503);
      const body = await readJson(request);
      if (!body || !(await safeEqual(String(body.password || ''), env.ADMIN_PASSWORD, env.ADMIN_PASSWORD))) {
        await new Promise((r) => setTimeout(r, 600));   // slow down guessing
        return json({ error: 'Wrong password.' }, 401);
      }
      const exp = Date.now() + SESSION_HOURS * 3600e3;
      const token = `${exp}.${await sign(String(exp), env.ADMIN_PASSWORD)}`;
      return json({ ok: true }, 200, { 'set-cookie': cookie(url, token, SESSION_HOURS * 3600) });
    }
    if (path === '/api/logout' && request.method === 'POST') {
      return json({ ok: true }, 200, { 'set-cookie': cookie(url, '', 0) });
    }

    if (path.startsWith('/api/admin/') && request.method === 'POST') {
      if (!(await isAdmin(request, env))) return json({ error: 'Not signed in.' }, 401);
      const body = (await readJson(request)) || {};
      const result = await room.admin(path.slice('/api/admin/'.length), body);
      return json(result, result.error ? 400 : 200);
    }

    if (path.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) return null;
  const text = await request.text();
  if (text.length > 8192) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function cookie(url, value, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(data, secret) {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(data));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// compare via HMAC so the comparison time doesn't leak how much of the secret matched
async function safeEqual(a, b, secret) {
  const [x, y] = await Promise.all([sign(a, secret), sign(b, secret)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length && i < y.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const match = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return false;
  const [exp, mac] = match[1].split('.');
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, await sign(exp, env.ADMIN_PASSWORD), env.ADMIN_PASSWORD);
}
