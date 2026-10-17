// Theme 2 — neon city, low poly. A recreation of a night photo of a Tokyo scramble crossing:
//   left:   a tall building crowned by a huge warm billboard, glowing sign bands down its face, dark trees below
//   centre: a cluster of tall narrow towers far off, a round blue sign, a two-tier blue/green sign on the tallest,
//           stacked colourful billboards, red vertical signs
//   right:  a big building with a large cyan LED screen (the question screen: questions, QR, partner logos),
//           a text strip under it, pink-lit floors, a bright shop sign at street level; a purple building at the edge
//   ground: a wide plaza with a dark tiled floor and red lane lines, people standing about
// Everything is static or eases slowly; no flashing (photosensitivity). No random events yet.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { floatingLogo } from '../wall-art.js';
import { makeBeacon } from '../alarm-light.js';
import { makeFlipClock } from '../flip-clock.js';

export const name = 'Neon city';
export const ambience = 'city';

const JP = '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans JP", sans-serif';
const SANS = 'Anton, "Arial Black", sans-serif';

export async function create({ renderer, tvScreen, screenTex, logoImg }) {
  const FOG = 0x0c0a26;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060616);
  scene.fog = new THREE.FogExp2(FOG, .011);

  const BASE_FOV = 45;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, .1, 200);
  function frameCamera() {
    camera.aspect = innerWidth / innerHeight;
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 16 / 9);
    camera.fov = camera.aspect >= 16 / 9 ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / camera.aspect));
    camera.updateProjectionMatrix();
  }
  frameCamera();
  // standing in the crowd, looking up a little at the signs
  const HOME = { pos: new THREE.Vector3(0, 1.7, 16), look: new THREE.Vector3(.4, 6.2, -10) };
  camera.position.copy(HOME.pos);

  const simplex = new SimplexNoise();
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  // fit text into a width
  const fit = (x, text, maxW, size, font) => { do { x.font = `${size}px ${font}`; } while (x.measureText(text).width > maxW && (size -= 2) > 8); return size; };

  // ============================================================ texture painters
  // a facade: mostly dark, a scatter of lit windows, sometimes whole lit floors in a colour (like the pink floors)
  function facade(cols, rows, { base = '#0b0c1c', lit = .1, floors = null, floorColour = '#ff5cc8' } = {}) {
    const [c, x] = cnv(256, Math.round(256 * rows / cols));
    x.fillStyle = base; x.fillRect(0, 0, c.width, c.height);
    const cw = c.width / cols, ch = c.height / rows;
    for (let j = 0; j < rows; j++) {
      const floorLit = floors && floors.includes(j);
      for (let i = 0; i < cols; i++) {
        const r = rnd();
        x.fillStyle = floorLit ? floorColour : r < lit * .5 ? pick(['#ffd7a8', '#ffe6c8']) : r < lit ? pick(['#a8c8ff', '#c8b8ff']) : 'rgba(4,5,14,.9)';
        x.fillRect(i * cw + cw * .2, j * ch + ch * .28, cw * .6, ch * .46);
      }
    }
    return tex(c);
  }
  // a glowing sign: a background, text, optional border
  function signTex(w, h, { bg = '#000', fg = '#fff', text = '', font = SANS, size, border = null, align = 'center', glow = 0 }) {
    const [c, x] = cnv(w, h);
    if (Array.isArray(bg)) { const g = x.createLinearGradient(0, 0, w, h); bg.forEach((col, i) => g.addColorStop(i / (bg.length - 1), col)); x.fillStyle = g; }
    else x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    if (border) { x.strokeStyle = border; x.lineWidth = Math.max(4, h * .06); x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth); }
    x.fillStyle = fg; x.textBaseline = 'middle'; x.textAlign = align;
    if (glow) { x.shadowColor = fg; x.shadowBlur = glow; }
    const s = fit(x, text, w * .9, size ?? h * .7, font);
    x.font = `${s}px ${font}`;
    x.fillText(text, align === 'center' ? w / 2 : w * .05, h * .54);
    return tex(c);
  }
  // a vertical sign: characters stacked
  function verticalTex(text, fg, bg) {
    const [c, x] = cnv(96, 96 * text.length + 24);
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = fg; x.font = `bold 72px ${JP}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    [...text].forEach((ch, i) => x.fillText(ch, 48, 12 + 96 * i + 48));
    return tex(c);
  }
  // a picture billboard: a gradient with simple shapes and a line of text (all made up for the scene)
  function posterTex(w, h, kind) {
    const [c, x] = cnv(w, h);
    const grad = (cols) => { const g = x.createLinearGradient(0, 0, w, h); cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col)); x.fillStyle = g; x.fillRect(0, 0, w, h); };
    if (kind === 'camera') {                  // the huge warm billboard: a big instant camera on yellow-orange-red
      grad(['#ffe14a', '#ffb02e', '#ff5a3c', '#e8306a']);
      x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.arc(w * .2, h * .5, h * .55, 0, 7); x.fill();
      // camera body
      x.fillStyle = '#ffd23f'; x.strokeStyle = '#2a1a10'; x.lineWidth = 6;
      x.beginPath(); x.roundRect(w * .42, h * .08, w * .4, h * .62, 30); x.fill(); x.stroke();
      x.fillStyle = '#222'; x.beginPath(); x.arc(w * .62, h * .4, h * .2, 0, 7); x.fill();
      x.fillStyle = '#3a4a6a'; x.beginPath(); x.arc(w * .62, h * .4, h * .13, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.arc(w * .59, h * .35, h * .04, 0, 7); x.fill();
      x.fillStyle = '#2a1a10'; x.fillRect(w * .48, h * .14, w * .08, h * .07);
      x.fillStyle = '#fff'; x.font = `bold ${h * .16}px ${SANS}`; x.fillText('SNAP &', w * .05, h * .32); x.fillText('SHARE', w * .05, h * .52);
      x.font = `bold ${h * .1}px ${JP}`; x.fillText('スナップ ∞', w * .05, h * .78);
      return tex(c);
    }
    if (kind === 'anime') {                   // a bright character poster
      grad(['#3df2ff', '#7a5cff', '#ff4fd8']);
      x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(w * .5, h * .42, h * .2, 0, 7); x.fill();
      x.fillStyle = '#ffcfb0'; x.beginPath(); x.arc(w * .5, h * .44, h * .14, 0, 7); x.fill();
      x.fillStyle = '#2a1a4a'; x.beginPath(); x.arc(w * .5, h * .38, h * .16, Math.PI, 0); x.fill();
      x.fillStyle = '#fff'; x.font = `bold ${h * .12}px ${JP}`; x.textAlign = 'center'; x.fillText('未来へ', w * .5, h * .88);
      return tex(c);
    }
    if (kind === 'game') {                    // a dark poster with a glowing figure
      grad(['#141a3a', '#2a1060']);
      x.fillStyle = '#4fffd2'; x.beginPath(); x.moveTo(w * .5, h * .12); x.lineTo(w * .72, h * .7); x.lineTo(w * .28, h * .7); x.closePath(); x.fill();
      x.fillStyle = '#ff4fd8'; x.fillRect(w * .1, h * .78, w * .8, h * .1);
      x.fillStyle = '#fff'; x.font = `bold ${h * .08}px ${SANS}`; x.textAlign = 'center'; x.fillText('LEVEL UP', w * .5, h * .845);
      return tex(c);
    }
    if (kind === 'fashion') {                 // a light poster with a big word
      grad(['#e8f6ff', '#a8d8ff']);
      x.fillStyle = '#0a2a5a'; x.font = `bold ${h * .3}px ${SANS}`; x.textAlign = 'center'; x.fillText('BUILD', w * .5, h * .45);
      x.font = `bold ${h * .14}px ${JP}`; x.fillText('ビルダー', w * .5, h * .72);
      return tex(c);
    }
    if (kind === 'green') {                   // green poster with silhouettes
      grad(['#2aff9a', '#0aa870']);
      x.fillStyle = '#063a28';
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(w * (.25 + i * .25), h * .38, h * .1, 0, 7); x.fill(); x.fillRect(w * (.25 + i * .25) - h * .1, h * .5, h * .2, h * .35); }
      return tex(c);
    }
    grad(['#ff3d7f', '#ff8a3d']);             // 'pink'
    x.fillStyle = '#fff'; x.font = `bold ${h * .22}px ${JP}`; x.textAlign = 'center'; x.fillText('カラオケ', w * .5, h * .55);
    return tex(c);
  }

  // ============================================================ building blocks
  const DARK = new THREE.MeshStandardMaterial({ color: 0x0a0b18, roughness: .85, flatShading: true });
  // a box building with a lit facade on its sides; tops and bottoms dark
  function building({ x, z, w, h, d, rotY = 0, base, lit, floors, floorColour, cols, rows }) {
    const t = facade(cols ?? Math.max(4, Math.round(w * 1.6)), rows ?? Math.max(6, Math.round(h * 1.4)), { base, lit, floors, floorColour });
    const side = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .32, roughness: .8 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, DARK, DARK, side, side]);
    m.position.set(x, h / 2, z); m.rotation.y = rotY;
    scene.add(m);
    return m;
  }
  // a glowing flat sign (MeshBasic, so it glows and blooms), optionally with a dark frame behind
  const glows = [];   // for the road reflections: { pos, colour, width }
  function sign(t, w, h, { x, y, z, rotY = 0, frame = true, bright = 1, colour = '#ffffff', parent = scene }) {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color().setScalar(bright) }));
    g.add(face);
    if (frame) { const f = new THREE.Mesh(new THREE.BoxGeometry(w + .14, h + .14, .18), DARK); f.position.z = -.1; g.add(f); }
    g.position.set(x, y, z); g.rotation.y = rotY;
    parent.add(g);
    glows.push({ obj: face, colour, width: w });
    return face;
  }

  // ============================================================ ground: the plaza
  {
    const [c, x] = cnv(512, 512);
    x.fillStyle = '#12142a'; x.fillRect(0, 0, 512, 512);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {          // paving tiles, each a slightly different shade
      x.fillStyle = `hsl(${232 + rnd() * 12}, ${18 + rnd() * 10}%, ${9 + rnd() * 5}%)`;
      x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
    const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 18);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(96, 72), new THREE.MeshStandardMaterial({ map: t, roughness: .32, metalness: .45 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -14;
    scene.add(ground);
    // red lane lines, like the ones painted across the crossing
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc0283a).multiplyScalar(.9), toneMapped: false });
    for (const [x0, z0, x1, z1] of [[-4.5, 14, -1.2, -6], [-3.6, 14, -.4, -6], [3, 13, 6.5, -8], [-14, 4, 10, 2.2]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.1, len), red);
      m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x1 - x0, z0 - z1);
      m.position.set((x0 + x1) / 2, .01, (z0 + z1) / 2);
      scene.add(m);
    }
  }
  // the sky: dark navy, glowing purple low down where the city lights it
  {
    const [c, x] = cnv(16, 256);
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#04040e'); g.addColorStop(.55, '#0c0a26'); g.addColorStop(.85, '#2a1650'); g.addColorStop(1, '#3a1a5a');
    x.fillStyle = g; x.fillRect(0, 0, 16, 256);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(260, 110), new THREE.MeshBasicMaterial({ map: tex(c), fog: false, depthWrite: false }));
    sky.position.set(0, 40, -90);
    scene.add(sky);
  }

  // ============================================================ LEFT: the tall building with the huge billboard
  building({ x: -13, z: 1, w: 8, h: 11, d: 13, base: '#0a0b1a', lit: .06 });
  building({ x: -15.5, z: -6.5, w: 8, h: 11.2, d: 6, base: '#0a0b1a', lit: .08 });   // carries the billboard
  // the huge warm billboard on top, angled toward the crossing
  sign(posterTex(1024, 600, 'camera'), 8.4, 4.8, { x: -13.6, y: 13.6, z: -5.6, rotY: .5, bright: 1.05, colour: '#ffb03a' });
  // glowing bands down its face (the stacked shop signs)
  for (const [i, text, bg, fg] of [
    [0, 'CAFÉ & DINING  3F', '#ff3d9a', '#ffffff'], [1, 'カフェ ・ ダイニング', '#1a1a3a', '#7fd8ff'],
    [2, 'BOOKS · MUSIC · GAMES', '#2a7bff', '#ffffff'], [3, 'AI LAB  2F', '#14143a', '#ff7ad8'],
  ]) {
    sign(signTex(1024, 80, { bg, fg, text, font: i % 2 ? JP : SANS, glow: 6 }), 6.4, .5,
      { x: -9.6, y: 7.5 - i * .78, z: 4.4, rotY: .62, frame: false, bright: .95, colour: bg === '#14143a' || bg === '#1a1a3a' ? fg : bg });
  }
  // a warm lit shopfront at street level
  sign(signTex(512, 128, { bg: ['#ffcf7a', '#ff9a4a'], fg: '#2a1408', text: 'OPEN 24H' }), 3.4, .9, { x: -8.8, y: 2.4, z: 5.4, rotY: .62, frame: false, bright: .8, colour: '#ffb060' });
  // trees below and beyond it: chunky low-poly canopies, dark, catching a little light
  {
    const leaf = new THREE.MeshStandardMaterial({ color: 0x0c1a18, roughness: .9, flatShading: true });
    const trunk = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1 });
    for (const [x, z, s] of [[-8.6, -6, 1.3], [-6.4, -8.5, 1.1], [-10.4, -9, 1.4], [-4.8, -11, 1], [-12.6, -5, 1.2], [-3.4, -13.5, .9]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(.12 * s, .18 * s, 3 * s, 5), trunk);
      t.position.set(x, 1.5 * s, z); scene.add(t);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 + rnd() * .6) * s, 0), leaf);
        c.position.set(x + (rnd() - .5) * 1.4 * s, (3.4 + rnd() * 1.4) * s, z + (rnd() - .5) * 1.2 * s);
        c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        scene.add(c);
      }
    }
  }

  // ============================================================ CENTRE: towers far off
  const Z = -31;
  building({ x: -5.2, z: Z, w: 3.4, h: 17, d: 4, lit: .22, base: '#141a3a' });   // the round-sign tower
  building({ x: -1.4, z: Z - 3, w: 4, h: 13, d: 4, lit: .24, base: '#161a36' });
  building({ x: 4.2, z: Z, w: 4.6, h: 19.5, d: 5, lit: .22, base: '#141a38' });   // the tallest, with the two-tier sign
  building({ x: 9.2, z: Z - 2, w: 4, h: 15, d: 4, lit: .24, base: '#161a36' });
  building({ x: .9, z: Z + 2, w: 4.4, h: 11, d: 4, lit: .22, base: '#141a38' });
  building({ x: -12.5, z: Z - 6, w: 5, h: 12, d: 5, lit: .1 });
  building({ x: 13, z: Z - 6, w: 5, h: 13, d: 5, lit: .1 });
  // round blue sign
  {
    const [c, x] = cnv(256, 256);
    x.fillStyle = '#0b1f6a'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill();
    x.strokeStyle = '#7fd0ff'; x.lineWidth = 10; x.stroke();
    x.fillStyle = '#ffffff'; x.font = `bold 110px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AI', 128, 136);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), new THREE.MeshBasicMaterial({ map: tex(c), toneMapped: false, color: new THREE.Color().setScalar(1.15) }));
    disc.position.set(-5.2, 17.6, Z + 2.1); scene.add(disc);
    glows.push({ obj: disc, colour: '#4a8aff', width: 3 });
  }
  // the tallest tower's two-tier sign: blue on top, green below
  sign(signTex(512, 160, { bg: ['#1e78ff', '#3aa0ff'], fg: '#ffffff', text: 'BUILDERS' }), 4.8, 1.55, { x: 4.2, y: 21.2, z: Z + 2.6, bright: 1.1, colour: '#3a8cff' });
  sign(signTex(512, 160, { bg: ['#16d86a', '#0fb85a'], fg: '#ffffff', text: 'ビルダーズ', font: JP }), 4.8, 1.55, { x: 4.2, y: 19.5, z: Z + 2.6, bright: 1.05, colour: '#2aff8a' });
  // stacked billboards in the middle
  sign(posterTex(512, 384, 'anime'), 5.6, 4.2, { x: -2.6, y: 11.6, z: Z + 4.2, bright: 1, colour: '#9a6bff' });
  sign(posterTex(512, 384, 'game'), 4.6, 3.5, { x: 1.6, y: 7.6, z: Z + 4.2, bright: 1, colour: '#4fffd2' });
  sign(posterTex(384, 512, 'green'), 3.4, 4.5, { x: 5.6, y: 6.8, z: Z + 4.6, bright: 1, colour: '#2aff9a' });
  sign(posterTex(512, 384, 'fashion'), 4.4, 3.2, { x: 5.4, y: 12.4, z: Z + 4.4, bright: 1, colour: '#a8d8ff' });
  sign(posterTex(512, 256, 'pink'), 4, 2, { x: -7, y: 10, z: Z + 4.4, bright: 1, colour: '#ff5a7a' });
  sign(signTex(512, 128, { bg: '#ffffff', fg: '#0a1a4a', text: 'CODE 8F' }), 2.6, .65, { x: 1.4, y: 10.6, z: Z + 4.3, bright: .95, colour: '#ffffff' });
  // red and pink vertical signs on the towers
  for (const [text, fg, bg, x, y, h] of [['ラーメン', '#ffffff', '#d0203a', -5.4, 9, 3.6], ['ゲーム', '#ffe0f0', '#c0186a', 7.2, 10.4, 3], ['カフェ', '#ffffff', '#b81a30', -9.2, 7.6, 3]]) {
    sign(verticalTex(text, fg, bg), .8, h, { x, y, z: Z + 4.3, bright: 1, colour: bg });
  }
  // a row of lit shopfronts along the far side of the crossing: warm and cool glows under the signs
  for (let i = 0; i < 16; i++) {
    const w = 1.6 + rnd() * 1.6;
    const col = pick(['#ffd8a0', '#ffe8c8', '#a8d0ff', '#ffb8e0', '#c8ffe0']);
    sign(signTex(256, 128, { bg: [col, '#ffffff'], fg: 'rgba(0,0,0,0)', text: ' ' }), w, 1.1 + rnd() * .6,
      { x: -17 + i * 2.3 + rnd() * .4, y: .9, z: Z + 6 + rnd() * 2, frame: false, bright: .55 + rnd() * .25, colour: col });
  }
  // little signs at street level far off
  for (let i = 0; i < 14; i++) {
    const col = pick(['#ff4fa0', '#4fd8ff', '#ffd24f', '#9a7bff', '#4fff9a']);
    sign(signTex(256, 96, { bg: '#0c0c22', fg: col, text: pick(['BAR', 'SHOP', 'カフェ', 'DRUG', '24H', 'ラーメン', 'GAME']), font: JP, glow: 6 }),
      1.4 + rnd(), .5, { x: -16 + i * 2.4 + rnd(), y: 2.3 + rnd() * 3.5, z: Z + 5.5, frame: false, bright: .95, colour: col });
  }
  // a lit-window skyline behind
  for (let i = 0; i < 12; i++) building({ x: -30 + i * 5.4 + rnd() * 2, z: -58 - rnd() * 6, w: 4 + rnd() * 2, h: 12 + rnd() * 14, d: 4, lit: .06 });

  // ============================================================ RIGHT: the big building with the question screen
  const RIGHT = { x: 15.5, z: -12, w: 12, h: 18, d: 12, rotY: -.5 };
  building({ ...RIGHT, base: '#0a0c1e', lit: .08, floors: [9, 10, 12, 13], floorColour: '#ff5cc8' });
  // a point on the building's front face: along = across the face (+ toward the crowd side), out = in front of it
  const onFront = (along, y, out = .25) => {
    const nx = Math.sin(RIGHT.rotY), nz = Math.cos(RIGHT.rotY), ax = Math.cos(RIGHT.rotY), az = -Math.sin(RIGHT.rotY);
    return new THREE.Vector3(RIGHT.x + nx * (RIGHT.d / 2 + out) + ax * along, y, RIGHT.z + nz * (RIGHT.d / 2 + out) + az * along);
  };
  // the purple building at the right edge, close, with a vertical red sign
  building({ x: 21, z: 4, w: 6, h: 18, d: 8, rotY: -.4, base: '#1a0a2a', lit: .1 });
  sign(signTex(256, 512, { bg: ['#ff3dd0', '#8a1aff'], fg: 'rgba(255,255,255,0)', text: ' ' }), 3.4, 5, { x: 17.8, y: 15.6, z: 5.6, rotY: -.4, frame: false, bright: .9, colour: '#d03dff' });
  sign(verticalTex('ザケイブ', '#ffffff', '#d01a3a'), .9, 4.2, { x: 17.6, y: 10, z: 6.8, rotY: -.4, colour: '#ff2a4a' });

  // the question screen: the TV's content (screenTex) on a big LED screen, angled toward the crowd. A faint pixel
  // grid that fades when the camera zooms in, so the QR stays crisp.
  const SCREEN_W = 6.6, SCREEN_H = SCREEN_W * 768 / 1024;
  const billboard = new THREE.Group();
  billboard.position.copy(onFront(-1.4, 11.2, .3));
  billboard.rotation.y = RIGHT.rotY;
  scene.add(billboard);
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: screenTex }, uTime: { value: 0 }, uStatic: { value: 0 }, uFocus: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D uMap; uniform float uFocus;
      void main(){
        vec3 col = texture2D(uMap, vUv).rgb * 1.3;
        vec2 cell = fract(vUv * vec2(256., 192.));
        float led = smoothstep(.0, .2, cell.x) * smoothstep(1., .8, cell.x) * smoothstep(.0, .2, cell.y) * smoothstep(1., .8, cell.y);
        col *= mix(.74 + .26 * led, 1., uFocus);
        col += vec3(.0, .05, .09) * (1. - uFocus);          // a cool cyan cast on the dark parts, like an LED wall
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
  billboard.add(screen);
  {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + .36, SCREEN_H + .36, .3), new THREE.MeshStandardMaterial({ color: 0x141828, roughness: .4, metalness: .6, flatShading: true }));
    frame.position.z = -.18; billboard.add(frame);
    // a thin cyan glow round the screen's edge
    const wrap = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.TorusGeometry(Math.SQRT2 / 2, .014, 3, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe8ff).multiplyScalar(1.4), toneMapped: false }));
    edge.rotation.z = Math.PI / 4; wrap.add(edge);
    wrap.scale.set(SCREEN_W + .3, SCREEN_H + .3, 1); wrap.position.z = .02; billboard.add(wrap);
    // the text strip under the screen
    sign(signTex(1024, 72, { bg: '#060a1e', fg: '#5fe0ff', text: '2-1-8  ·  質問はこちら  ·  ASK YOUR QUESTION', font: JP, glow: 8 }), SCREEN_W, .42,
      { x: 0, y: -SCREEN_H / 2 - .55, z: .05, frame: false, bright: 1, colour: '#5fe0ff', parent: billboard });
  }
  glows.push({ obj: screen, colour: '#4fd0ff', width: SCREEN_W });
  const screenLight = new THREE.PointLight(0x5fc8ff, 14, 26, 1.6);
  screenLight.position.set(0, -2, 3);
  billboard.add(screenLight);
  // the bright shop sign at street level under it
  sign(signTex(768, 144, { bg: '#0a1238', fg: '#ffffff', text: 'AI BUILDER SCHOOL', border: '#3fa8ff', glow: 10 }), 4.4, .82,
    { ...(({ x, z }) => ({ x, z }))(onFront(1.6, 0, .3)), y: 3.6, rotY: RIGHT.rotY, bright: 1.05, colour: '#5fb8ff' });
  // alarm light on the screen's top edge; a flip clock on the ledge beside the shop sign
  const beacon = makeBeacon();
  beacon.group.position.set(SCREEN_W / 2 - .5, SCREEN_H / 2 + .2, 0);
  beacon.group.scale.setScalar(2.4);
  billboard.add(beacon.group);
  const clock = makeFlipClock();
  clock.group.position.set(-SCREEN_W / 2 + 1, -SCREEN_H / 2 - 1.75, .1);
  clock.group.scale.setScalar(2);
  billboard.add(clock.group);

  scene.updateMatrixWorld(true);
  const screenWorld = screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  const FOCUS_D = (SCREEN_H / 2) / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 1.25;
  const FOCUS = { look: screenWorld.clone(), pos: screenWorld.clone().addScaledVector(screenNormal, FOCUS_D) };

  // ============================================================ reflections of the signs on the polished paving
  {
    const [c, x] = cnv(64, 256);
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(.4, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    const h = x.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(.3, 'rgba(0,0,0,0)'); h.addColorStop(.7, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
    const streak = new THREE.CanvasTexture(c);
    scene.updateMatrixWorld(true);
    for (const gl of glows) {
      if (gl.width < 2) continue;                               // only the big ones reflect noticeably
      const p = gl.obj.getWorldPosition(new THREE.Vector3());
      const len = 8 + Math.min(10, p.y * .5);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(gl.width * .55, len), new THREE.MeshBasicMaterial({
        map: streak, color: new THREE.Color(gl.colour), transparent: true, opacity: .14, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x * .92, .015, Math.min(p.z + 2, 6) + len / 2);
      scene.add(m);
    }
  }

  // ============================================================ the crowd (instanced low-poly people)
  // Simple figures: two legs, a tapered torso with arms, a head; dark clothes with a few light shirts and a red
  // jacket. Mostly standing, a slight idle sway. Denser toward the far side of the plaza, like the photo.
  const PEOPLE = 150;
  const legsGeo = (() => {
    const a = new THREE.BoxGeometry(.13, .82, .15); a.translate(-.09, .41, 0);
    const b = new THREE.BoxGeometry(.13, .82, .15); b.translate(.09, .41, 0);
    const g = new THREE.BufferGeometry();
    const merged = [a, b].map((x) => x.toNonIndexed());
    const pos = new Float32Array(merged.reduce((n, x) => n + x.attributes.position.array.length, 0));
    let o = 0; for (const x of merged) { pos.set(x.attributes.position.array, o); o += x.attributes.position.array.length; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  })();
  // torso with shoulders and arms hanging at the sides, all one piece
  const torsoGeo = (() => {
    const parts = [];
    const chest = new THREE.CylinderGeometry(.22, .16, .6, 6); chest.scale(1, 1, .62); chest.translate(0, 1.12, 0); parts.push(chest);
    for (const sx of [-1, 1]) {
      const arm = new THREE.BoxGeometry(.09, .62, .11); arm.rotateZ(sx * .08); arm.translate(sx * .27, 1.06, 0); parts.push(arm);
    }
    const neck = new THREE.CylinderGeometry(.05, .06, .1, 5); neck.translate(0, 1.46, 0); parts.push(neck);
    const g = new THREE.BufferGeometry();
    const flat = parts.map((x) => x.toNonIndexed());
    const pos = new Float32Array(flat.reduce((n, x) => n + x.attributes.position.array.length, 0));
    let o = 0; for (const x of flat) { pos.set(x.attributes.position.array, o); o += x.attributes.position.array.length; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
  })();
  const headGeo = new THREE.IcosahedronGeometry(.13, 1); headGeo.scale(.9, 1.05, .95); headGeo.translate(0, 1.62, 0);
  const mat = (opts) => new THREE.MeshStandardMaterial({ roughness: .75, flatShading: true, ...opts });
  const legs = new THREE.InstancedMesh(legsGeo, mat({ color: 0xffffff }), PEOPLE);
  const torsos = new THREE.InstancedMesh(torsoGeo, mat({ color: 0xffffff }), PEOPLE);
  const heads = new THREE.InstancedMesh(headGeo, mat({ color: 0x1c1418 }), PEOPLE);
  const DARKS = [0x14141c, 0x1a1a24, 0x101018, 0x22202a, 0x18141c].map((h) => new THREE.Color(h));
  const SHIRTS = [0xd8dce8, 0xc8ccd8, 0xb8c8e8, 0xb02a3a, 0x3a5aa8].map((h) => new THREE.Color(h));
  const people = [];
  for (let i = 0; i < PEOPLE; i++) {
    // more of them farther back: a band along the far side, a scatter across the plaza, a few close by
    const r = rnd();
    const z = r < .5 ? -8 + rnd() * 4 : r < .88 ? -4 + rnd() * 10 : 7 + rnd() * 5;
    const spread = z > 7 ? 9 : 15;
    const x = (rnd() - .5) * 2 * spread;
    if (Math.abs(x - 0) < 1.4 && z > 10) { i--; continue; }      // keep the space right in front of the camera clear
    people.push({ x, z, face: rnd() * Math.PI * 2, s: .92 + rnd() * .16, phase: rnd() * 6 });
    legs.setColorAt(i, pick(DARKS));
    torsos.setColorAt(i, rnd() < .22 ? pick(SHIRTS) : pick(DARKS));
  }
  for (const m of [legs, torsos, heads]) { m.frustumCulled = false; scene.add(m); }
  const o3 = new THREE.Object3D();
  function placePeople(t) {
    people.forEach((p, i) => {
      o3.position.set(p.x, 0, p.z);
      o3.rotation.set(0, p.face + Math.sin(t * .2 + p.phase) * .15, Math.sin(t * .6 + p.phase) * .012);   // a slow, slight idle
      o3.scale.setScalar(p.s);
      o3.updateMatrix();
      legs.setMatrixAt(i, o3.matrix); torsos.setMatrixAt(i, o3.matrix); heads.setMatrixAt(i, o3.matrix);
    });
    legs.instanceMatrix.needsUpdate = torsos.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  }

  // ============================================================ lights
  scene.add(new THREE.HemisphereLight(0x5a4aa8, 0x0a0816, 1.7));
  for (const [x, y, z, c, i, d] of [
    [-8.5, 9, 6, 0xffa040, 40, 22],     // the warm billboard's spill on the left
    [-7.5, 5, 3, 0xff3d9a, 18, 16],     // pink sign bands
    [1, 9, -28, 0x8a5aff, 50, 40],      // the centre cluster's glow
    [9, 7, -4, 0x3fd0ff, 24, 24],       // the big screen side
    [16, 12, 6, 0xd03dff, 20, 20],      // the purple building
  ]) {
    const l = new THREE.PointLight(c, i, d, 1.5);
    l.position.set(x, y, z); scene.add(l);
  }

  // ============================================================ floating logo + who's on stage
  // In the dark gap of sky between the left building and the far towers (where theme 1 has it too).
  const logo = new THREE.Group();
  {
    const canvas = floatingLogo(logoImg, 1400);
    const t = tex(canvas); t.anisotropy = 8;
    const W = 3.6, H = W * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(W, H);
    logo.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: t, alphaTest: .5, roughness: .6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .5, side: THREE.DoubleSide,
    })));
    const [bc, bx] = cnv(canvas.width, canvas.height);
    bx.drawImage(canvas, 0, 0);
    bx.clearRect(0, 0, canvas.width, Math.round(1400 * .02 + 1400 * .07) - 2);
    const edge = new THREE.MeshStandardMaterial({ color: 0x0a0a1c, alphaMap: new THREE.CanvasTexture(bc), alphaTest: .5, roughness: .8 });
    for (let i = 1; i <= 3; i++) { const m = new THREE.Mesh(geo, edge); m.position.z = -i * .04; logo.add(m); }
    logo.position.set(-3.1, 6.7, 3);
    logo.rotation.y = .14;
    scene.add(logo);
    logo.userData.bottom = -H / 2;
  }
  const LOGO_Y = logo.position.y;
  const [presenterCanvas] = cnv(1400, 260);
  const presenterTex = tex(presenterCanvas);
  const presenterMat = new THREE.MeshStandardMaterial({
    map: presenterTex, transparent: true, depthWrite: false, roughness: .7, emissive: 0xffffff, emissiveMap: presenterTex, emissiveIntensity: .45, opacity: 0,
  });
  const presenterLabel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6 * 260 / 1400), presenterMat);
  presenterLabel.position.set(0, logo.userData.bottom + .04, .02);
  logo.add(presenterLabel);
  let presenterKey = null, presenterFade = 0, presenterWant = 0;
  function drawPresenter(p) {
    const x = presenterCanvas.getContext('2d');
    x.clearRect(0, 0, 1400, 260);
    if (!p) return;
    x.textBaseline = 'alphabetic';
    x.fillStyle = 'rgb(240,236,255)';
    x.shadowColor = 'rgba(160,100,255,.55)'; x.shadowBlur = 16;
    let size = 112;
    const name = p.name.toUpperCase();
    x.letterSpacing = '4px';
    do { x.font = `${size}px Anton`; } while (x.measureText(name).width > 1360 && (size -= 4) > 40);
    x.fillText(name, 20, 125);
    if (p.title) {
      x.fillStyle = 'rgba(210,200,255,.8)';
      let ts = 56;
      do { x.font = `${ts}px Anton`; } while (x.measureText(p.title).width > 1360 && (ts -= 2) > 24);
      x.letterSpacing = '6px';
      x.fillText(p.title.toUpperCase(), 22, 215);
    }
    presenterTex.needsUpdate = true;
  }

  // ============================================================ post: bloom and a purple-blue night grade
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .85, .55, .72);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uChroma: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uChroma;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        if (uChroma > .001) {
          vec2 dir = vUv - .5;
          vec2 off = dir * dot(dir, dir) * .045 * uChroma;
          c.r = texture2D(tDiffuse, vUv + off).r;
          c.b = texture2D(tDiffuse, vUv - off).b;
        }
        // the photo's look: shadows pushed toward violet-blue, highlights left bright
        float l = dot(c.rgb, vec3(.299, .587, .114));
        c.rgb = mix(c.rgb * vec3(.9, .82, 1.15) + vec3(.02, .01, .05), c.rgb, smoothstep(.15, .7, l));
        float g = hash(vUv * 1000. + fract(uTime) * 311.) - .5;
        c.rgb += g * .025 * (.4 + c.rgb);
        float v = smoothstep(1.15, .35, length((vUv - .5) * vec2(1.05, 1.)));
        c.rgb *= .55 + .45 * v;
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // ============================================================ per-frame
  const look = HOME.look.clone();
  let focus = 0, chroma = 0, chromaWant = 0;
  let zoomFrom = 0, zoomTo = 0, zoomAge = 9;
  const ZOOM_SECS = 1.8;
  const easeInOut = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let t = 0, glow = 0;

  return {
    onSwitch() {},
    onQuestion() { beacon.trigger(); },
    setAlarm(on) { beacon.hold(on); },
    setChromatic(on, amount = .6) { chromaWant = on ? amount / .6 : 0; },
    setPresenter(p) {
      const key = p ? `${p.name}|${p.title || ''}` : null;
      if (key === presenterKey) return;
      presenterKey = key;
      presenterWant = 0;
      setTimeout(() => { drawPresenter(p); presenterWant = p ? 1 : 0; }, presenterFade > .05 ? 450 : 0);
    },

    update(dt) {
      t += dt;
      placePeople(t);

      logo.position.y = LOGO_Y + Math.sin(t * .6) * .1;
      logo.rotation.y = .14 + Math.sin(t * .23) * .06;
      logo.rotation.z = Math.sin(t * .31 + 1) * .012;

      screenMat.uniforms.uFocus.value = focus;
      glow += ((tvScreen.isLive ? 1 : 0) - glow) * Math.min(1, dt * 1.5);
      screenLight.intensity = 12 + glow * 4;
      beacon.update(dt, t);
      clock.update(dt);
      presenterFade += (presenterWant - presenterFade) * Math.min(1, dt * 4);
      presenterMat.opacity = presenterFade;
      presenterLabel.visible = presenterFade > .01;

      const want = tvScreen.focus ? 1 : 0;
      if (want !== zoomTo) { zoomFrom = focus; zoomTo = want; zoomAge = 0; }
      zoomAge += dt;
      focus = zoomFrom + (zoomTo - zoomFrom) * easeInOut(Math.min(1, zoomAge / ZOOM_SECS));
      const drift = 1 - focus * .85;
      camera.position.lerpVectors(HOME.pos, FOCUS.pos, focus);
      camera.position.x += simplex.noise(t * .06, 1) * .12 * drift;
      camera.position.y += simplex.noise(t * .08, 2) * .05 * drift;
      look.lerpVectors(HOME.look, FOCUS.look, focus);
      camera.lookAt(look);

      grade.uniforms.uTime.value = t;
      chroma += (chromaWant - chroma) * Math.min(1, dt * 5);
      grade.uniforms.uChroma.value = chroma * (1 - focus * .9);
      composer.render(dt);
    },

    degrade() { bloom.enabled = false; },

    resize() {
      frameCamera();
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
    },

    dispose() {
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          for (const v of Object.values(m)) if (v?.isTexture && v !== screenTex) v.dispose();
          m.dispose();
        }
      });
      for (const p of composer.passes) p.dispose?.();
      composer.dispose();
    },

    debug: { scene, camera, logo },
  };
}
