// THE CAVE — live backdrop: the shared core.
// Owns the renderer, the TV's content (questions/QR), the live connection and the keyboard,
// and swaps between themes. Each theme lives in ./themes/ and exports `create()`; see firelit-cave.js.
//
// Keys:  1–9 switch theme · F fullscreen · Q camera in/out of the TV · P FPS meter · C chromatic aberration (this screen only)
//        → next question · ← previous question · ↑ show the QR · ↓ back to the slideshow
// Sound, fire ambience, chromatic aberration and question timing come from the admin page.
import * as THREE from 'three';
import { TVScreen } from './tv-screen.js';
import * as sound from './sound.js';

// number key → theme module. Add new themes here.
const THEMES = {
  1: () => import('./themes/firelit-cave.js'),
};

await Promise.all([document.fonts.load('100px Anton'), document.fonts.load('100px VT323')]);
const logoImg = new Image();
logoImg.src = '/logo.png';
await logoImg.decode();

// 1x pixel ratio: the theme's post-processing buffer uses MSAA for smooth edges, which is far cheaper than
// rendering at 1.5x (2.25x the pixels). antialias on the canvas itself would be wasted behind post-processing.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// the TV's content is shared, so a queued question survives a theme switch
const tvScreen = new TVScreen();
let presenter = null;
let chroma = { on: false, amount: .6 };   // from the admin; C flips it on this screen until the admin changes it
let soundCfg = { chime: 'marimba', volume: .6, muted: false };
let ambience = { volume: .35, muted: false };
let alarm = false;                         // alarm light held on from the admin

// ---- sound: synthesised in sound.js. Browsers only allow audio after a key press or click,
// so it unlocks on the first one (pressing F for fullscreen is enough).
const unlockAudio = () => { sound.unlock(); applyAmbience(); };
addEventListener('keydown', unlockAudio);
addEventListener('pointerdown', unlockAudio);
const applyAmbience = () => sound.setFire(ambience.muted ? 0 : ambience.volume);
const playChime = () => { if (!soundCfg.muted) sound.chime(soundCfg.chime, soundCfg.volume); };
tvScreen.onQuestion = () => { playChime(); theme?.onQuestion?.(); };
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
    theme.setPresenter?.(presenter);
    theme.setChromatic?.(chroma.on, chroma.amount);
    theme.setAlarm?.(alarm);
    localStorage.setItem('cave-theme', String(n));
    window.__cave = { theme, themeNum, tvScreen, renderer, ...theme.debug };
  } catch (err) {
    console.error(err);
    say(`Theme ${n} failed to load: ${err?.message || err}`);   // the reason, so it can be reported
  }
  fade.classList.remove('on');
  document.body.classList.add('ready');
  switching = false;
}

// ============================================================ loop
let last = performance.now();
// P toggles a small FPS meter (frames per second, averaged over half a second, plus the worst frame)
const fpsEl = Object.assign(document.createElement('div'), { id: 'fps' });
fpsEl.style.cssText = 'position:fixed;right:10px;top:8px;z-index:7;font:14px monospace;color:#ffd38a;background:rgba(0,0,0,.55);padding:3px 8px;border-radius:5px;display:none';
document.body.appendChild(fpsEl);
let fpsFrames = 0, fpsSince = performance.now(), fpsWorst = 0;
function meter(now, dtMs) {
  fpsFrames++; fpsWorst = Math.max(fpsWorst, dtMs);
  if (now - fpsSince < 500) return;
  if (fpsEl.style.display !== 'none') fpsEl.textContent = `${Math.round(fpsFrames * 1000 / (now - fpsSince))} fps · worst ${fpsWorst.toFixed(0)} ms · q${tier}`;
  fpsFrames = 0; fpsSince = now; fpsWorst = 0;
}

function frame(now) {
  meter(now, now - last);
  const dt = Math.min(Math.max((now - last) / 1000, 0), .05);
  last = now;
  if (tvScreen.draw(now)) screenTex.needsUpdate = true;
  document.body.classList.toggle('zoomed', tvScreen.focus);
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
  if (tier === 1) renderer.setPixelRatio(.85);
  if (tier === 2) renderer.setPixelRatio(.7);
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
let started = false, retry = 0, ws = null;
// tell the room what's on the TV, so the admin and the moderator panel can follow along
const sendStatus = (st) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'status', ...st })); };
tvScreen.onStatus = sendStatus;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws?role=display`);
  let ping;
  ws.onopen = () => {
    retry = 0;
    status.classList.remove('show');
    ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
    tvScreen.report();
  };
  ws.onmessage = (ev) => {
    if (ev.data === 'pong') return;
    const msg = JSON.parse(ev.data);
    if (msg.type === 'init' || msg.type === 'config') {
      const c = msg.config;
      tvScreen.setConfig(c);
      presenter = c.presenter || null;
      theme?.setPresenter?.(presenter);
      tvScreen.setFocus(!!c.focus);
      if (c.sound) soundCfg = c.sound;
      if (c.ambience) { ambience = c.ambience; applyAmbience(); }
      if (c.chroma) { chroma = c.chroma; theme?.setChromatic?.(chroma.on, chroma.amount); }
      if (typeof c.alarm === 'boolean') { alarm = c.alarm; theme?.setAlarm?.(alarm); }
    }
    if (msg.type === 'init' || msg.type === 'approved') tvScreen.setApproved(msg.approved || msg.list || []);
    if (msg.type === 'init' && !started) { started = true; tvScreen.start(); }
    if (msg.type === 'message') tvScreen.arrive(msg.q);
    if (msg.type === 'spotlight') tvScreen.spotlight(msg.q);
    if (msg.type === 'control') {
      if (msg.cmd === 'next') tvScreen.right();
      if (msg.cmd === 'prev') tvScreen.left();
      if (msg.cmd === 'qr') tvScreen.up();
      if (msg.cmd === 'auto') tvScreen.auto();
      if (msg.cmd === 'test') { playChime(); theme?.onQuestion?.(); }
    }
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
  if (k === 'p') fpsEl.style.display = fpsEl.style.display === 'none' ? 'block' : 'none';
  if (k === 'c') {
    chroma = { ...chroma, on: !chroma.on };
    theme?.setChromatic?.(chroma.on, chroma.amount);
    say(chroma.on ? 'Chromatic aberration on' : 'Chromatic aberration off');
  }
  if (k === 'q') tvScreen.setFocus(!tvScreen.focus);
  if (k === 'arrowright') { ev.preventDefault(); tvScreen.right(); }
  if (k === 'arrowleft') { ev.preventDefault(); tvScreen.left(); }
  if (k === 'arrowup') { ev.preventDefault(); tvScreen.up(); }
  if (k === 'arrowdown') { ev.preventDefault(); tvScreen.auto(); }
});
