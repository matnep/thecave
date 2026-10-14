// THE CAVE — live backdrop: the shared core.
// Owns the renderer, the TV's content (questions/QR), the live connection and the keyboard,
// and swaps between themes. Each theme lives in ./themes/ and exports `create()`; see firelit-cave.js.
//
// Keys:  1–9 switch theme · F fullscreen · Q camera into the TV for the QR · → / Space next TV slide
import * as THREE from 'three';
import { TVScreen } from './tv-screen.js';

// number key → theme module. Add new themes here.
const THEMES = {
  1: () => import('./themes/firelit-cave.js'),
};

await Promise.all([document.fonts.load('100px Anton'), document.fonts.load('100px VT323')]);
const logoImg = new Image();
logoImg.src = '/logo.png';
await logoImg.decode();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// the TV's content is shared, so a queued question survives a theme switch
const tvScreen = new TVScreen();
const screenTex = new THREE.CanvasTexture(tvScreen.canvas);
screenTex.colorSpace = THREE.SRGBColorSpace;
screenTex.anisotropy = 8;

// ============================================================ themes
const fade = document.getElementById('fade');
const toast = document.getElementById('toast');
let theme = null, themeNum = 0, switching = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function say(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(say.t);
  say.t = setTimeout(() => toast.classList.remove('show'), 1800);
}

async function loadTheme(n) {
  if (switching || n === themeNum) return;
  if (!THEMES[n]) { say(`No theme ${n} yet`); return; }
  switching = true;
  if (theme) { fade.classList.add('on'); await sleep(850); }
  try {
    const mod = await THEMES[n]();
    const next = await mod.create({ renderer, tvScreen, screenTex, logoImg });
    theme?.dispose();
    theme = next; themeNum = n;
    if (tier >= 3) theme.degrade();
    tvScreen.onSwitch = (item) => theme.onSwitch(item);
    localStorage.setItem('cave-theme', String(n));
    window.__cave = { theme, themeNum, tvScreen, renderer, ...theme.debug };
  } catch (err) {
    console.error(err);
    say(`Theme ${n} failed to load`);
  }
  fade.classList.remove('on');
  document.body.classList.add('ready');
  switching = false;
}

// ============================================================ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(Math.max((now - last) / 1000, 0), .05);
  last = now;
  if (tvScreen.draw(now)) screenTex.needsUpdate = true;
  if (theme) {
    theme.update(dt, now);
    adaptQuality(dt, now);
  }
  requestAnimationFrame(frame);
}

// if the laptop can't keep up, step quality down: resolution first, then the theme's expensive extras
let slow = 0, tier = 0, settledAt = performance.now() + 6000;
function adaptQuality(dt, now) {
  if (switching || now < settledAt || tier >= 3) return;
  slow = dt > 1 / 40 ? slow + dt : Math.max(0, slow - dt * .5);
  if (slow < 3) return;
  slow = 0; tier++;
  if (tier === 1) renderer.setPixelRatio(1);
  if (tier === 2) renderer.setPixelRatio(.75);
  if (tier === 3) theme.degrade();
  theme.resize();
  console.info('[cave] quality tier', tier);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  theme?.resize();
});

const fromUrl = Number(new URLSearchParams(location.search).get('theme'));
await loadTheme(THEMES[fromUrl] ? fromUrl : Number(localStorage.getItem('cave-theme')) in THEMES ? Number(localStorage.getItem('cave-theme')) : 1);
requestAnimationFrame(frame);

// ============================================================ live connection
// WebSocket to the room; reconnects with backoff if the network blips.
const status = document.getElementById('status');
let started = false, retry = 0;
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws?role=display`);
  let ping;
  ws.onopen = () => {
    retry = 0;
    status.classList.remove('show');
    ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
  };
  ws.onmessage = (ev) => {
    if (ev.data === 'pong') return;
    const msg = JSON.parse(ev.data);
    if (msg.type === 'init' || msg.type === 'config') {
      tvScreen.setConfig(msg.config);
      tvScreen.setFocus(!!msg.config.focus);
      if (!started) { started = true; tvScreen.start(); }
    }
    if (msg.type === 'message') tvScreen.enqueue(msg.q);
    if (msg.type === 'spotlight') tvScreen.spotlight(msg.q);
    if (msg.type === 'remove') tvScreen.remove(msg.id);
    if (msg.type === 'clear') tvScreen.clear();
  };
  ws.onclose = () => {
    clearInterval(ping);
    status.classList.add('show');
    setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
  };
}
connect();
// show the idle slides even if the server can't be reached yet
setTimeout(() => { if (!started) { started = true; tvScreen.start(); } }, 4000);

// ============================================================ keys
addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (/^[1-9]$/.test(k)) loadTheme(Number(k));
  if (k === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  if (k === 'q') tvScreen.setFocus(!tvScreen.focus);
  if (k === 'arrowright' || k === ' ') tvScreen.next();
});
