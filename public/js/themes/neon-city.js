// Theme 2 — neon city, low poly. A recreation of a night photo of a Tokyo scramble crossing:
//   left:   a tall building crowned by a huge warm billboard, glowing sign bands down its face, dark trees below
//   centre: a cluster of tall narrow towers far off, a round blue sign, a two-tier blue/green sign on the tallest,
//           stacked colourful billboards, red vertical signs
//   right:  a big building with a large cyan LED screen (the question screen: questions, QR, partner logos),
//           a text strip under it, pink-lit floors, a bright shop sign at street level; a purple building at the edge
//   ground: a wide plaza with a dark tiled floor, red lane lines, a zebra scramble and puddles
// Depth comes in layers: power cables, lamps, vending machines and rails up close; projecting signs, AC units and
// rooftop tanks mid-way; haze bands, a second skyline and lit clouds far off. A clock billboard in the centre, and a
// "QUE" neon sign over the question screen that lights up for a new question.
// Everything is static or eases slowly; no flashing (photosensitivity). No random events yet.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { floatingLogo } from '../wall-art.js';

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
      { x: -17 + i * 2.3 + rnd() * .4, y: .9, z: Z + 6 + rnd() * 2, frame: false, bright: .22 + rnd() * .22, colour: col });
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
  scene.updateMatrixWorld(true);
  const screenWorld = screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  const FOCUS_D = (SCREEN_H / 2) / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 1.25;
  const FOCUS = { look: screenWorld.clone(), pos: screenWorld.clone().addScaledVector(screenNormal, FOCUS_D) };

  // ============================================================ the "QUE" neon sign (lights up for a new question)
  // Neon tubes spelling QUE above the question screen. Unlit, the glass tubes are dim; when a question arrives
  // (or the admin holds it on) it fades up to a bright pink glow with a slow, shallow breathing. No flashing.
  const que = (() => {
    const W = 1024, H = 384;
    const paint = (lit) => {
      const [c, x] = cnv(W, H);
      x.font = `bold 300px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round'; x.lineCap = 'round';
      if (lit) {
        x.shadowColor = '#ff2a8a'; x.shadowBlur = 40;
        x.strokeStyle = '#ff4fa8'; x.lineWidth = 26; x.strokeText('QUE', W / 2, H / 2 + 10);
        x.shadowBlur = 12; x.strokeStyle = '#ffd0ea'; x.lineWidth = 9; x.strokeText('QUE', W / 2, H / 2 + 10);
      } else {
        x.strokeStyle = 'rgba(120,70,100,.85)'; x.lineWidth = 18; x.strokeText('QUE', W / 2, H / 2 + 10);
        x.strokeStyle = 'rgba(200,170,190,.35)'; x.lineWidth = 5; x.strokeText('QUE', W / 2, H / 2 + 6);
      }
      const t = tex(c);
      return t;
    };
    const g = new THREE.Group();
    // the backing: a dark panel the tubes are mounted on
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.35, .12), new THREE.MeshStandardMaterial({ color: 0x120a18, roughness: .6, metalness: .3, flatShading: true }));
    back.position.z = -.08; g.add(back);
    const off = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: paint(false), transparent: true, depthWrite: false }));
    const on = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: paint(true), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    on.position.z = .01;
    g.add(off, on);
    const light = new THREE.PointLight(0xff3d9a, 0, 12, 1.6);
    light.position.set(0, 0, 1.2); g.add(light);
    let left = 0, held = false, level = 0;
    return {
      group: g,
      trigger() { left = 6; },
      hold(v) { held = v; },
      update(dt, t) {
        left = Math.max(0, left - dt);
        const want = left > 0 || held ? 1 : 0;
        level += (want - level) * Math.min(1, dt * (want ? 4 : 1.5));
        const breathe = .85 + .15 * Math.sin(t * Math.PI * 2 * .5);       // half a breath a second: gentle
        on.material.opacity = level * breathe;
        on.material.color.setScalar(1 + level * .6);
        off.material.opacity = 1 - level * .8;
        light.intensity = level * 14 * breathe;
      },
    };
  })();
  que.group.position.set(-SCREEN_W / 2 + 1.9, SCREEN_H / 2 + 1.25, .1);
  que.group.scale.setScalar(1.3);
  billboard.add(que.group);

  // ============================================================ the clock billboard (centre)
  // A big neon LED clock with the date, on one of the centre billboards. Redrawn once a minute.
  const clockSign = (() => {
    const [c, x] = cnv(768, 512);
    const t = tex(c);
    let last = '';
    const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    function draw(now = new Date()) {
      const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
      if (hh + mm === last) return;
      last = hh + mm;
      const g = x.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, '#08102e'); g.addColorStop(1, '#140a32');
      x.fillStyle = g; x.fillRect(0, 0, 768, 512);
      x.strokeStyle = '#3fe8ff'; x.lineWidth = 10; x.strokeRect(10, 10, 748, 492);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillStyle = 'rgba(63,232,255,.08)'; x.font = `260px ${SANS}`; x.fillText('88:88', 384, 236);   // unlit segments
      x.shadowColor = '#3fe8ff'; x.shadowBlur = 24; x.fillStyle = '#c8f8ff';
      x.fillText(`${hh}:${mm}`, 384, 236);
      x.shadowBlur = 10; x.fillStyle = '#ff7ad8'; x.font = `52px ${SANS}`;
      x.fillText(`${DAYS[now.getDay()]}  ${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]}`, 384, 430);
      x.shadowBlur = 0;
      t.needsUpdate = true;
    }
    draw();
    return { texture: t, draw };
  })();
  sign(clockSign.texture, 4.6, 3.07, { x: 5.4, y: 12.6, z: Z + 4.4, bright: 1.05, colour: '#3fe8ff' });

  // ============================================================ the LED ticker under the screen (scrolls slowly)
  const ticker = (() => {
    const [c, x] = cnv(2048, 64);
    x.fillStyle = '#04081a'; x.fillRect(0, 0, 2048, 64);
    x.fillStyle = '#ffb43a'; x.font = `bold 40px ${JP}`; x.textBaseline = 'middle';
    x.shadowColor = '#ff9a2a'; x.shadowBlur = 8;
    x.fillText('WELCOME TO THE CAVE   ·   質問はこちら   ·   SCAN THE QR TO ASK A QUESTION   ·   AI BUILDER SCHOOL   ·   ', 10, 34);
    const t = tex(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(.5, 1);
    sign(t, SCREEN_W, .36, { x: 0, y: -SCREEN_H / 2 - 1.05, z: .05, frame: false, bright: 1, colour: '#ffb43a', parent: billboard });
    return t;
  })();

  // ============================================================ depth: foreground
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1e2c, roughness: .5, metalness: .6, flatShading: true });
  const black = new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: .8, flatShading: true });
  // utility poles with cross-arms and transformers, and power cables sagging across the top of the frame
  const poleTops = [];
  for (const [x, z, h] of [[-5.8, 8.4, 11], [7.6, 7.4, 11.5], [-4.8, -9, 10], [9.6, -16, 10.5], [-11, -20, 10]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, h, 6), metal);
    pole.position.set(x, h / 2, z); scene.add(pole);
    for (const y of [h - .5, h - 1.3]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.9, .09, .09), metal);
      arm.position.set(x, y, z); arm.rotation.y = .3; scene.add(arm);
    }
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .7, 6), metal);
    tr.position.set(x + .35, h - 2.4, z); scene.add(tr);
    poleTops.push(new THREE.Vector3(x, h - .5, z));
  }
  {
    const wire = new THREE.MeshBasicMaterial({ color: 0x2a2048 });    // dark violet: shows against the glowing sky
    const span = (a, b, k, sag) => {
      const off = new THREE.Vector3(.7 * (k - 1), -.8 * (k > 2 ? 1 : 0), 0);
      const p0 = a.clone().add(off), p1 = b.clone().add(off);
      const mid = p0.clone().lerp(p1, .5); mid.y -= sag;
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .032, 3), wire));
    };
    // (no span runs in front of the question screen: a cable across the QR would spoil scanning)
    for (const [i, j, sag] of [[0, 1, 2.2], [0, 2, 1.4], [2, 4, 1.2], [2, 3, 1.8]]) {
      for (let k = 0; k < 4; k++) span(poleTops[i], poleTops[j], k, sag + k * .15);
    }
  }
  // street lamps: a warm head and a pool of light on the paving
  const poolTex = (() => {
    const [c, x] = cnv(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const pool = (x, z, r, colour, opacity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: poolTex, color: colour, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, .02, z); scene.add(m);
  };
  for (const [x, z, dir] of [[-5.6, 6, 1], [-2.4, -12, 1], [4.8, -14, -1], [-9.6, -4, 1]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, 6, 6), metal);
    pole.position.set(x, 3, z); scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, .07, .07), metal);
    arm.position.set(x + dir * .6, 5.95, z); scene.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.6, .12, .3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8a0).multiplyScalar(1.6), toneMapped: false }));
    head.position.set(x + dir * 1.2, 5.85, z); scene.add(head);
    pool(x + dir * 1.2, z, 3.2, 0xffc890, .22);
  }
  // vending machines glowing by the left building
  {
    const [c, x] = cnv(128, 256);
    x.fillStyle = '#e8f2ff'; x.fillRect(0, 0, 128, 256);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
      x.fillStyle = pick(['#ff4a4a', '#3a8aff', '#ffd23a', '#3aff9a', '#ff8a3a', '#ffffff']);
      x.fillRect(10 + i * 19, 20 + j * 34, 13, 24);
    }
    x.fillStyle = '#1a2a4a'; x.fillRect(10, 170, 108, 60);
    const front = tex(c);
    for (const [vx, vz] of [[-7.4, 3.2], [-7.4, 4.3]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.85, .75), [black, black, black, black,
        new THREE.MeshBasicMaterial({ map: front, toneMapped: false, color: new THREE.Color().setScalar(.55) }), black]);
      box.position.set(vx, .93, vz); box.rotation.y = .9;   // facing across the plaza
      scene.add(box);
    }
    pool(-6.6, 4.4, 2.2, 0xd8e8ff, .18);
  }
  // guard rails along the plaza's edges
  {
    const parts = [];
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
      for (const y of [.55, .95]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(len, .05, .05), metal);
        r.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); r.rotation.y = -ang; scene.add(r);
      }
      for (let k = 0; k <= Math.floor(len / 1.4); k++) {
        const u = k / Math.max(1, Math.floor(len / 1.4));
        const p = new THREE.Mesh(new THREE.BoxGeometry(.06, 1, .06), metal);
        p.position.set(x0 + (x1 - x0) * u, .5, z0 + (z1 - z0) * u); scene.add(p);
      }
    };
    rail(-14, 8, -8.5, 10.5); rail(8.6, 9.5, 14, 6.5); rail(-13, -9, -6.5, -10.5);
  }
  // zebra scramble: stripes across the crossing, catching the sign light
  {
    const stripe = new THREE.MeshStandardMaterial({ color: 0x9a9cb8, roughness: .3, metalness: .3 });
    for (let i = 0; i < 11; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.6, 7), stripe);
      m.rotation.x = -Math.PI / 2; m.position.set(-6 + i * 1.2, .012, -1.5); scene.add(m);
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, .55), stripe);
      m.rotation.x = -Math.PI / 2; m.rotation.z = .55; m.position.set(-1 + i * .2, .013, -8.5 + i * 1.1); scene.add(m);
    }
  }
  // puddles: dark mirror-like patches that show the sign reflections sharper
  for (const [x, z, sx, sz] of [[-2.6, 6.5, 2.6, 1.1], [3.4, 2.4, 2, .8], [-5.2, -3, 1.8, .7], [1.2, -5.5, 2.4, .9]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 10), new THREE.MeshStandardMaterial({ color: 0x05050c, roughness: .04, metalness: .95 }));
    m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.position.set(x, .014, z); scene.add(m);
  }

  // ============================================================ depth: detail on the buildings
  // signs sticking out from the walls (they read strongly as depth), AC units, rooftop tanks and antennas
  for (const [text, fg, bg, x, y, z, ry, h] of [
    ['ホテル', '#ffffff', '#c81a5a', -8.8, 6.2, 1.6, .62 + Math.PI / 2, 2.6], ['居酒屋', '#ffe0a0', '#8a1a1a', -8.8, 3.4, -1.2, .62 + Math.PI / 2, 2.2],
    ['薬', '#ffffff', '#1a8a3a', -8.9, 7.8, -3.6, .62 + Math.PI / 2, 1.2], ['カラオケ', '#ffffff', '#6a1aff', 17.9, 6.4, 1.8, -.4 - Math.PI / 2, 2.8],
    ['24H', '#1a1a1a', '#ffd23a', 18.4, 3.4, 3.2, -.4 - Math.PI / 2, 1.2], ['寿司', '#ffffff', '#d01a2a', -3.4, 6, Z + 6.2, Math.PI / 2, 1.8],
    ['BAR', '#ff7ad8', '#120a20', 2.6, 5.2, Z + 6.2, Math.PI / 2, 1.6], ['ゲーム', '#3fe8ff', '#0a1430', 7.8, 8.2, Z + 5, Math.PI / 2, 2.4],
  ]) {
    const t = verticalTex(text, fg, bg);
    const box = new THREE.Mesh(new THREE.BoxGeometry(.14, h, .62 * (text.length > 2 ? 1 : 1)), [
      new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), black, black, black, black,
    ]);
    box.position.set(x, y, z); box.rotation.y = ry;
    scene.add(box);
    glows.push({ obj: box, colour: bg, width: .8 });
  }
  {
    // AC units on the side walls, instanced
    const ac = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, .5, .35), new THREE.MeshStandardMaterial({ color: 0x3a3e4a, roughness: .7, flatShading: true }), 40);
    const o = new THREE.Object3D();
    for (let i = 0; i < 40; i++) {
      const left = i < 22;
      if (left) { o.position.set(-9.1 + (rnd() - .5) * .1, 1.6 + Math.floor(rnd() * 9) * 1.05, 6 - rnd() * 9); o.rotation.y = .62 + Math.PI / 2; }
      else { const p = onFront(-5.6 + rnd() * 2, 2 + Math.floor(rnd() * 6) * 1.2, .2); o.position.copy(p); o.rotation.y = RIGHT.rotY; }
      o.updateMatrix(); ac.setMatrixAt(i, o.matrix);
    }
    scene.add(ac);
    // rooftop water tanks and antennas (with a steady red aircraft light)
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(1.2), toneMapped: false });
    for (const [x, y, z] of [[-13, 11, 1], [4.2, 19.5, Z], [-5.2, 17, Z], [15.5, 18, -12], [21, 18, 4], [9.2, 15, Z - 2]]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 1.2, 7), metal);
      tank.position.set(x + .8, y + .6, z); scene.add(tank);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .06, 3.2, 4), metal);
      mast.position.set(x - .6, y + 1.6, z + .4); scene.add(mast);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 4), red);
      tip.position.set(x - .6, y + 3.25, z + .4); scene.add(tip);
    }
  }
  // more signs packed on the centre towers, at every height
  for (let i = 0; i < 16; i++) {
    const col = pick(['#ff4fa0', '#4fd8ff', '#ffd24f', '#9a7bff', '#4fff9a', '#ff6a4a', '#ffffff']);
    const bgc = pick(['#0c0c22', '#140a28', '#0a1428']);
    const word = pick(['SALE', 'NEW', 'カフェ', '本', 'CINEMA', 'ラーメン', 'GAME', 'FASHION', '音楽', 'BEAUTY', 'CLUB', '2F', '5F', 'OPEN']);
    sign(signTex(320, 120, { bg: bgc, fg: col, text: word, font: JP, glow: 8, border: col }), 1.6 + rnd() * 1.2, .6 + rnd() * .3,
      { x: -9 + rnd() * 19, y: 3 + rnd() * 13, z: Z + 4.6 + rnd() * .6, bright: .95, colour: col });
  }

  // ============================================================ depth: distance
  // a second skyline further off, and haze bands between the layers so each one separates from the next
  for (let i = 0; i < 16; i++) building({ x: -44 + i * 6 + rnd() * 2, z: -78 - rnd() * 8, w: 5 + rnd() * 3, h: 14 + rnd() * 20, d: 5, lit: .05 });
  {
    const [c, x] = cnv(16, 128);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.7, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,.9)');
    x.fillStyle = g; x.fillRect(0, 0, 16, 128);
    const hazeTex = new THREE.CanvasTexture(c);
    for (const [z, w, h, colour, op] of [[-24, 70, 10, 0x6a3ab0, .16], [-46, 110, 16, 0x5a2aa0, .22], [-70, 160, 24, 0x3a1a80, .25]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: hazeTex, color: colour, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.position.set(0, h / 2 - .5, z); scene.add(m);
    }
  }
  // low clouds lit from below by the city, drifting very slowly
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const cl = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a1a50).multiplyScalar(.9 + rnd() * .4), transparent: true, opacity: .55, fog: false, depthWrite: false }));
    cl.scale.set(14 + rnd() * 10, 1.6 + rnd(), 6);
    cl.position.set(-50 + i * 17, 34 + rnd() * 10, -88 - rnd() * 6);
    cl.rotation.set(rnd() * .3, rnd(), rnd() * .3);
    scene.add(cl); clouds.push(cl);
  }
  // steam rising from a street vent, near right
  const steam = (() => {
    const N = 40, pos = new Float32Array(N * 3), seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([4.6, 0, 8.5], i * 3); seeds[i] = rnd() * 10; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float seed; uniform float uTime; varying float vA;
        void main(){ float u = fract(uTime * .08 + seed * .1); vec3 p = position;
          p.y += u * 4.; p.x += sin(u * 5. + seed) * .6 * u; p.z += cos(u * 4. + seed) * .4 * u;
          vA = sin(u * 3.14159) * .3; vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_PointSize = (90. + u * 160.) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA;
        gl_FragColor = vec4(vec3(.7, .65, .9) * a, a); }`,
    });
    scene.add(new THREE.Points(g, m));
    return m;
  })();

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
    onQuestion() { que.trigger(); },
    setAlarm(on) { que.hold(on); },
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
      ticker.offset.x = (t * .02) % 1;                        // the LED ticker creeps along
      for (const [i, c] of clouds.entries()) c.position.x += dt * (.15 + i * .02);
      steam.uniforms.uTime.value = t;

      logo.position.y = LOGO_Y + Math.sin(t * .6) * .1;
      logo.rotation.y = .14 + Math.sin(t * .23) * .06;
      logo.rotation.z = Math.sin(t * .31 + 1) * .012;

      screenMat.uniforms.uFocus.value = focus;
      glow += ((tvScreen.isLive ? 1 : 0) - glow) * Math.min(1, dt * 1.5);
      screenLight.intensity = 12 + glow * 4;
      que.update(dt, t);
      clockSign.draw();
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
