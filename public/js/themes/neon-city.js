// Theme 2 — neon city, a low-poly version of a night photo (public/scenes/city-night.webp).
// The photo is triangulated in the browser: more, smaller triangles where it has detail (signs, edges), big calm
// ones in the dark sky, each filled with the photo's colour there. The triangles are split into depth layers
// (sky, centre towers, trees, left building, right building) set at different distances, so the camera's slow
// drift gives real parallax. Bright parts are pushed above white so they bloom like the photo's glow.
// Below the horizon the photo's crowd is replaced by a 3D wet plaza whose reflections are drawn from the photo.
// Overlays, fitted onto the photo: the live question screen over the big cyan screen (right), a "QUE" neon sign
// above it, a clock in place of the two-tier sign (centre), our own signs over the real brands, and the logo and
// presenter in the dark gap of sky. Nothing flashes (photosensitivity).
// To use another photo: replace the image and update the PHOTO_* coordinates below.
import * as THREE from 'three';
import Delaunator from 'delaunator';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { floatingLogo } from '../wall-art.js';

export const name = 'Neon city';
export const ambience = 'city';

const PHOTO = '/scenes/city-night.webp';
const IW = 735, IH = 490;                 // the photo's size in pixels
const CUT = 342;                          // below this row the 3D plaza takes over (the photo's crowd starts here)
// depth layers: a polygon in photo pixels and how far away it sits. First match wins; everything also goes in
// the far "back" layer so parallax never opens a hole.
const LAYERS = [
  { name: 'left', d: 26, poly: [[0, 0], [180, 0], [180, 205], [104, 214], [104, CUT], [0, CUT]] },
  { name: 'right', d: 34, poly: [[524, 0], [IW, 0], [IW, CUT], [524, CUT]] },
  { name: 'trees', d: 42, poly: [[58, 178], [248, 178], [248, CUT], [58, CUT]] },
  { name: 'centre', d: 80, poly: [[228, 46], [532, 46], [532, CUT], [228, CUT]] },
];
const BACK_D = 160;
// where things are in the photo
const PHOTO_SCREEN = [[542, 138], [648, 118], [652, 172], [546, 192]];     // the big cyan screen (TL, TR, BR, BL)
const PHOTO_TWO_TIER = [386, 108, 450, 180];                                // the blue/green brand sign -> clock
const PHOTO_ROUND = [287, 157, 17];                                         // the round blue sign -> our "AI"
const PHOTO_SHOP = [632, 290, 708, 312];                                    // the shop sign under the screen
const PHOTO_JINS = [462, 210, 514, 258];                                    // a white brand sign mid-right
const PHOTO_LOGO = [282, 64];                                               // centre of the dark sky gap

const JP = '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans JP", sans-serif';
const SANS = 'Anton, "Arial Black", sans-serif';

export async function create({ renderer, tvScreen, screenTex, logoImg }) {
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;       // keep the photo's colours as they are
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05040f);

  // ============================================================ camera, and photo pixel -> world mapping
  // The photo fills the frame's width; its top row is the frame's top edge. The camera is pitched up so the real
  // horizon (a level line of sight) lands on the photo's street line.
  const BASE_FOV = 45, TAN_V = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)), TAN_H = TAN_V * 16 / 9;
  const NDC_PER_ROW = 2 * (16 / 9) / (IW / IH) / IH;     // photo rows to NDC units
  const ndcX = (x) => (x / IW) * 2 - 1;
  const ndcY = (y) => 1 - y * NDC_PER_ROW;
  const HORIZON_NDC = ndcY(CUT - 4);
  const PITCH = Math.atan(-HORIZON_NDC * TAN_V);
  const P = new THREE.Vector3(0, 1.7, 16);
  const F = new THREE.Vector3(0, Math.sin(PITCH), -Math.cos(PITCH));    // forward
  const R = new THREE.Vector3(1, 0, 0), U = new THREE.Vector3(0, Math.cos(PITCH), Math.sin(PITCH));
  // the world point that shows photo pixel (x, y) from the home camera, at distance d along the view
  const at = (x, y, d, out = new THREE.Vector3()) =>
    out.copy(P).addScaledVector(F, d).addScaledVector(R, ndcX(x) * TAN_H * d).addScaledVector(U, ndcY(y) * TAN_V * d);
  const pxToWorld = (pxSize, d) => (pxSize / IW) * 2 * TAN_H * d;          // a width in pixels -> world units at d

  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, .1, 400);
  function frameCamera() {
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect >= 16 / 9 ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan(TAN_H / camera.aspect));
    camera.updateProjectionMatrix();
  }
  frameCamera();
  const HOME = { pos: P.clone(), look: P.clone().addScaledVector(F, 30) };
  camera.position.copy(HOME.pos);
  camera.lookAt(HOME.look);

  // ============================================================ the photo, read into pixels
  const img = new Image();
  img.src = PHOTO;
  await img.decode();
  const pc = document.createElement('canvas');
  pc.width = IW; pc.height = IH;
  const pctx = pc.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(img, 0, 0, IW, IH);
  const data = pctx.getImageData(0, 0, IW, IH).data;
  const idxAt = (x, y) => (Math.min(IH - 1, Math.max(0, y | 0)) * IW + Math.min(IW - 1, Math.max(0, x | 0))) * 4;
  const lumAt = (x, y) => { const i = idxAt(x, y); return (data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114) / 255; };
  const rgbAt = (x, y) => { const i = idxAt(x, y); return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]; };

  // ============================================================ triangulate
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  // frame edges and the cut line, so triangles line up with them
  for (let x = 0; x <= IW; x += 18) { pts.push(x, 0); pts.push(x, CUT); }
  for (let y = 0; y <= CUT; y += 18) { pts.push(0, y); pts.push(IW, y); }
  // layer outlines, so no triangle straddles two depths
  for (const L of LAYERS) {
    const poly = L.poly;
    for (let k = 0; k < poly.length; k++) {
      const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 7));
      for (let s = 0; s < n; s++) pts.push(ax + (bx - ax) * s / n, ay + (by - ay) * s / n);
    }
  }
  // detail: more points where the photo has edges (signs, windows), few in flat dark areas
  const grad = (x, y) => Math.abs(lumAt(x + 1, y) - lumAt(x - 1, y)) + Math.abs(lumAt(x, y + 1) - lumAt(x, y - 1));
  for (let i = 0; i < 90000; i++) {
    const x = 1 + rnd() * (IW - 2), y = 1 + rnd() * (CUT - 2);
    if (rnd() < .02 + grad(x, y) * 1.5 + lumAt(x, y) * .04) pts.push(x, y);
  }
  const del = new Delaunator(pts);
  const tris = del.triangles;

  const inPoly = (x, y, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // one geometry per layer: positions pushed out to that layer's distance, a flat photo colour per triangle
  const buckets = [...LAYERS.map((L) => ({ d: L.d, pos: [], col: [] })), { d: BACK_D, pos: [], col: [] }];
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 2, b = tris[t + 1] * 2, d = tris[t + 2] * 2;
    const cx = (pts[a] + pts[b] + pts[d]) / 3, cy = (pts[a + 1] + pts[b + 1] + pts[d + 1]) / 3;
    if (cy > CUT) continue;
    // colour: the average of a few samples inside the triangle
    let r = 0, g = 0, bl = 0;
    for (const [wa, wb, wd] of [[.34, .33, .33], [.6, .2, .2], [.2, .6, .2], [.2, .2, .6]]) {
      const [sr, sg, sb] = rgbAt(pts[a] * wa + pts[b] * wb + pts[d] * wd, pts[a + 1] * wa + pts[b + 1] * wb + pts[d + 1] * wd);
      r += sr / 4; g += sg / 4; bl += sb / 4;
    }
    c.setRGB(r, g, bl, THREE.SRGBColorSpace);
    // the bright parts (lit signs) go above white so they bloom, like the glow in the photo
    const lum = .299 * r + .587 * g + .114 * bl;
    c.multiplyScalar(1 + Math.max(0, lum - .55) * 1.1);
    const li = LAYERS.findIndex((L) => inPoly(cx, cy, L.poly));
    const targets = li >= 0 ? [buckets[li], buckets[buckets.length - 1]] : [buckets[buckets.length - 1]];
    for (const B of targets) {
      for (const k of [a, b, d]) { at(pts[k], pts[k + 1], B.d, v); B.pos.push(v.x, v.y, v.z); B.col.push(c.r, c.g, c.b); }
    }
  }
  const layerMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, side: THREE.DoubleSide });
  for (const B of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    scene.add(new THREE.Mesh(g, layerMat));
  }

  // ============================================================ the wet plaza (replaces the crowd)
  // Dark paving with a faint tile grid; reflections are the photo itself mirrored about the street line and
  // smeared downward, like neon on wet stone. Two red lane lines as in the photo.
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = IW; blurCanvas.height = IH;
  { const b = blurCanvas.getContext('2d'); b.filter = 'blur(3px) saturate(1.25)'; b.drawImage(pc, 0, 0); }
  const photoTex = new THREE.CanvasTexture(blurCanvas);
  photoTex.colorSpace = THREE.SRGBColorSpace;
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uPhoto: { value: photoTex }, uRes: { value: new THREE.Vector2(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()) },
      uHorizon: { value: HORIZON_NDC }, uRowNdc: { value: NDC_PER_ROW }, uIH: { value: IH },
    },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: `
      uniform sampler2D uPhoto; uniform vec2 uRes; uniform float uHorizon, uRowNdc, uIH; varying vec3 vW;
      vec3 photo(vec2 ndc){
        float row = (1. - ndc.y) / uRowNdc;
        return texture2D(uPhoto, vec2((ndc.x + 1.) * .5, 1. - row / uIH)).rgb;
      }
      void main(){
        vec2 ndc = gl_FragCoord.xy / uRes * 2. - 1.;
        // mirror about the street line, stretched a little so the reflection hugs the ground
        float below = max(0., uHorizon - ndc.y);
        vec2 m = vec2(ndc.x, uHorizon + below * 1.35);
        // smear (wet ground) with a few taps
        vec3 refl = vec3(0.);
        for (int i = 0; i < 6; i++) refl += photo(m + vec2(0., float(i) * .018)) / 6.;
        float near = smoothstep(0., .9, below);                     // reflections fade toward the camera
        vec3 base = vec3(.035, .03, .07);
        vec2 g = abs(fract(vW.xz * .8) - .5);                       // paving tiles
        base *= .85 + .3 * smoothstep(.46, .5, max(g.x, g.y));
        vec3 col = base + refl * (.75 - .5 * near);
        float n = fract(sin(dot(floor(vW.xz * 6.), vec2(12.9898, 78.233))) * 43758.5453);
        col *= .9 + .2 * n;                                          // a static breakup: wet stone, not a mirror
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`,
  });
  {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.z = -150;
    scene.add(floor);
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd02a4a).multiplyScalar(1.1), toneMapped: false });
    for (const [x0, z0, x1, z1] of [[-3.2, 15, -1.6, -40], [.2, 15, 2.4, -40]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.08, len), red);
      m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x1 - x0, z0 - z1);
      m.position.set((x0 + x1) / 2, .01, (z0 + z1) / 2);
      scene.add(m);
    }
  }

  // a soft band of street glow along the horizon, so the photo melts into the plaza instead of ending on a line
  {
    let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < IW; x += 3) for (let y = CUT - 30; y < CUT - 6; y += 3) { const [sr, sg, sb] = rgbAt(x, y); r += sr; g += sg; b += sb; n++; }
    const band = document.createElement('canvas'); band.width = 8; band.height = 64;
    const bx = band.getContext('2d');
    const gr = bx.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    bx.fillStyle = gr; bx.fillRect(0, 0, 8, 64);
    const D = 30;
    const w = 2 * TAN_H * D * 1.3, h = (2 * TAN_V * D) * .06;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(band), color: new THREE.Color(r / n, g / n, b / n).multiplyScalar(.7), transparent: true,
      depthWrite: false, depthTest: false, toneMapped: false, blending: THREE.AdditiveBlending,
    }));
    m.position.copy(at(IW / 2, CUT - 2, D));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, U, F.clone().negate()));
    m.renderOrder = 5;
    scene.add(m);
  }

  // ============================================================ overlay helpers
  const layerD = (nm) => LAYERS.find((L) => L.name === nm).d;
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const cnv = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; };
  // a flat quad over a photo rectangle [x0, y0, x1, y1] at distance d
  function overPhoto(rect, d, material) {
    const [x0, y0, x1, y1] = rect;
    const g = new THREE.BufferGeometry();
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => at(x, y, d - .05));
    g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((p) => [p.x, p.y, p.z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 3, 1, 1, 3, 2]);
    const m = new THREE.Mesh(g, material);
    scene.add(m);
    return m;
  }

  // ============================================================ the question screen, fitted over the big cyan screen
  // A fine grid stretched between the screen's four corners in the photo (so the slant matches), a little larger
  // than the original so it covers it. The faint LED grid fades away when zoomed in, for a crisp QR.
  const SD = layerD('right') - .08;
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: screenTex }, uTime: { value: 0 }, uStatic: { value: 0 }, uFocus: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D uMap; uniform float uFocus;
      void main(){
        vec3 col = texture2D(uMap, vUv).rgb * 1.2;
        vec2 cell = fract(vUv * vec2(200., 150.));
        float led = smoothstep(.0, .2, cell.x) * smoothstep(1., .8, cell.x) * smoothstep(.0, .2, cell.y) * smoothstep(1., .8, cell.y);
        col *= mix(.75 + .25 * led, 1., uFocus);
        col += vec3(.0, .06, .1) * (1. - uFocus);
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const screen = (() => {
    const GROW = 1.18;
    const cxp = PHOTO_SCREEN.reduce((s, p) => s + p[0], 0) / 4, cyp = PHOTO_SCREEN.reduce((s, p) => s + p[1], 0) / 4;
    const corners = PHOTO_SCREEN.map(([x, y]) => [cxp + (x - cxp) * GROW, cyp + (y - cyp) * GROW]);
    const NX = 24, NY = 18, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const u = i / NX, w = j / NY;
      const top = [corners[0][0] + (corners[1][0] - corners[0][0]) * u, corners[0][1] + (corners[1][1] - corners[0][1]) * u];
      const bot = [corners[3][0] + (corners[2][0] - corners[3][0]) * u, corners[3][1] + (corners[2][1] - corners[3][1]) * u];
      const p = at(top[0] + (bot[0] - top[0]) * w, top[1] + (bot[1] - top[1]) * w, SD);
      pos.push(p.x, p.y, p.z); uv.push(u, 1 - w);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, cc = a + NX + 1, dd = cc + 1;
      idx.push(a, cc, b, b, cc, dd);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, screenMat);
    scene.add(m);
    // a thin dark bezel just behind it
    const back = corners.map(([x, y]) => [cxp + (x - cxp) * 1.05, cyp + (y - cyp) * 1.07]);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(back.flatMap(([x, y]) => { const p = at(x, y, SD + .03); return [p.x, p.y, p.z]; }), 3));
    bg.setIndex([0, 3, 1, 1, 3, 2]);
    scene.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x05060c })));
    m.userData.centre = at(cxp, cyp, SD);
    m.userData.widthPx = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]);
    return m;
  })();

  // ============================================================ "QUE" neon above the screen
  const que = (() => {
    const paint = (lit) => {
      const [cv, x] = cnv(768, 288);
      x.font = `bold 230px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineJoin = 'round';
      if (lit) {
        x.shadowColor = '#ff2a8a'; x.shadowBlur = 36;
        x.strokeStyle = '#ff4fa8'; x.lineWidth = 22; x.strokeText('QUE', 384, 152);
        x.shadowBlur = 10; x.strokeStyle = '#ffe0f2'; x.lineWidth = 8; x.strokeText('QUE', 384, 152);
      } else {
        x.strokeStyle = 'rgba(110,60,95,.9)'; x.lineWidth = 16; x.strokeText('QUE', 384, 152);
        x.strokeStyle = 'rgba(200,170,190,.3)'; x.lineWidth = 4; x.strokeText('QUE', 384, 148);
      }
      return tex(cv);
    };
    // above the screen, on the dark wall there
    const rect = [548, 82, 628, 112];
    const off = overPhoto(rect, SD + .02, new THREE.MeshBasicMaterial({ map: paint(false), transparent: true, depthWrite: false, toneMapped: false }));
    const onMat = new THREE.MeshBasicMaterial({ map: paint(true), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    overPhoto(rect, SD - .02, onMat);
    let left = 0, held = false, level = 0;
    return {
      trigger() { left = 6; },
      hold(on) { held = on; },
      update(dt, t) {
        left = Math.max(0, left - dt);
        const want = left > 0 || held ? 1 : 0;
        level += (want - level) * Math.min(1, dt * (want ? 4 : 1.5));
        const breathe = .85 + .15 * Math.sin(t * Math.PI * 2 * .5);
        onMat.opacity = level * breathe;
        onMat.color.setScalar(1 + level * 1.4);       // above white when lit: it blooms
        off.material.opacity = 1 - level * .85;
      },
    };
  })();

  // ============================================================ the clock, in place of the two-tier brand sign
  const clock = (() => {
    const [cv, x] = cnv(320, 360);
    const t = tex(cv);
    let last = '';
    const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    function draw(now = new Date()) {
      const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
      if (hh + mm === last) return;
      last = hh + mm;
      // the same two-tier look as the sign it replaces: blue on top, green below
      x.fillStyle = '#1e7cff'; x.fillRect(0, 0, 320, 150);
      x.fillStyle = '#18d070'; x.fillRect(0, 160, 320, 200);
      x.fillStyle = '#0a1230'; x.fillRect(0, 150, 320, 10);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
      x.font = `bold 52px ${SANS}`; x.fillText(`${DAYS[now.getDay()]} ${String(now.getDate()).padStart(2, '0')}`, 160, 78);
      x.font = `bold 128px ${SANS}`; x.fillText(`${hh}:${mm}`, 160, 262);
      t.needsUpdate = true;
    }
    draw();
    overPhoto(PHOTO_TWO_TIER, layerD('centre'), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: new THREE.Color().setScalar(.95) }));
    return { draw };
  })();

  // ============================================================ our own signs over the real brands
  {
    // the round blue sign: "AI"
    const [cv, x] = cnv(256, 256);
    x.fillStyle = '#0b1f6a'; x.beginPath(); x.arc(128, 128, 122, 0, 7); x.fill();
    x.strokeStyle = '#9fe0ff'; x.lineWidth = 12; x.stroke();
    x.fillStyle = '#ffffff'; x.font = `bold 120px ${SANS}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AI', 128, 136);
    const [rx, ry, rr] = PHOTO_ROUND;
    overPhoto([rx - rr, ry - rr, rx + rr, ry + rr], layerD('centre'), new THREE.MeshBasicMaterial({ map: tex(cv), transparent: true, toneMapped: false, color: new THREE.Color().setScalar(1.05) }));
  }
  {
    // the shop sign under the big screen
    const [cv, x] = cnv(640, 160);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#5fd8ff'; x.shadowBlur = 22; x.fillStyle = '#e8fbff';
    let s = 92; x.font = `bold ${s}px ${SANS}`;
    while (x.measureText('AI BUILDER SCHOOL').width > 610 && s > 20) { s -= 4; x.font = `bold ${s}px ${SANS}`; }
    x.fillText('AI BUILDER SCHOOL', 320, 84);
    overPhoto(PHOTO_SHOP, layerD('right') - .1, new THREE.MeshBasicMaterial({ map: tex(cv), transparent: true, toneMapped: false, color: new THREE.Color().setScalar(1.05) }));
  }
  {
    // the white brand sign mid-right: our own
    const [cv, x] = cnv(256, 236);
    x.fillStyle = '#eaf2ff'; x.fillRect(0, 0, 256, 236);
    x.fillStyle = '#0a2a6a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold 92px ${SANS}`; x.fillText('ASK', 128, 82);
    x.font = `bold 64px ${JP}`; x.fillText('質問', 128, 170);
    overPhoto(PHOTO_JINS, layerD('centre'), new THREE.MeshBasicMaterial({ map: tex(cv), toneMapped: false, color: new THREE.Color().setScalar(.72) }));
  }

  // ============================================================ floating logo + who's on stage, in the sky gap
  const LOGO_D = 12;
  const logo = new THREE.Group();
  {
    const canvas = floatingLogo(logoImg, 1400);
    const t = tex(canvas);
    const W = 3.6, H = W * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(W, H);
    logo.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, alphaTest: .5, toneMapped: false, color: new THREE.Color().setScalar(.95), side: THREE.DoubleSide })));
    const [bc, bx] = cnv(canvas.width, canvas.height);
    bx.drawImage(canvas, 0, 0);
    bx.clearRect(0, 0, canvas.width, Math.round(1400 * .02 + 1400 * .07) - 2);
    const edge = new THREE.MeshBasicMaterial({ color: 0x08060f, alphaMap: new THREE.CanvasTexture(bc), alphaTest: .5 });
    for (let i = 1; i <= 3; i++) { const m = new THREE.Mesh(geo, edge); m.position.z = -i * .04; logo.add(m); }
    logo.userData.bottom = -H / 2;
    // sized to fill the sky gap, and facing the camera
    logo.scale.setScalar(pxToWorld(160, LOGO_D) / W);
    logo.position.copy(at(PHOTO_LOGO[0], PHOTO_LOGO[1], LOGO_D));
    logo.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, U, F.clone().negate()));
    scene.add(logo);
  }
  const LOGO_POS = logo.position.clone();
  const LOGO_Q = logo.quaternion.clone();
  const [presenterCanvas] = cnv(1400, 260);
  const presenterTex = tex(presenterCanvas);
  const presenterMat = new THREE.MeshBasicMaterial({ map: presenterTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 });
  const presenterLabel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6 * 260 / 1400), presenterMat);
  presenterLabel.position.set(0, logo.userData.bottom + .04, .02);
  logo.add(presenterLabel);
  let presenterKey = null, presenterFade = 0, presenterWant = 0;
  function drawPresenter(p) {
    const x = presenterCanvas.getContext('2d');
    x.clearRect(0, 0, 1400, 260);
    if (!p) return;
    x.textBaseline = 'alphabetic';
    x.fillStyle = 'rgb(244,240,255)';
    x.shadowColor = 'rgba(180,120,255,.6)'; x.shadowBlur = 16;
    let size = 112;
    const nm = p.name.toUpperCase();
    x.letterSpacing = '4px';
    do { x.font = `${size}px Anton`; } while (x.measureText(nm).width > 1360 && (size -= 4) > 40);
    x.fillText(nm, 20, 125);
    if (p.title) {
      x.fillStyle = 'rgba(214,204,255,.85)';
      let ts = 56;
      do { x.font = `${ts}px Anton`; } while (x.measureText(p.title).width > 1360 && (ts -= 2) > 24);
      x.letterSpacing = '6px';
      x.fillText(p.title.toUpperCase(), 22, 215);
    }
    presenterTex.needsUpdate = true;
  }

  // ============================================================ zoom target: straight at the question screen
  const FOCUS = (() => {
    const c0 = screen.userData.centre;
    const w = pxToWorld(screen.userData.widthPx, SD);
    const dist = w / (.62 * 2 * TAN_H);                 // the screen fills ~60% of the frame's width
    return { look: c0.clone(), pos: c0.clone().addScaledVector(F, -dist) };
  })();

  // ============================================================ post: bloom (the photo's glow) and a light grade
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .6, .86);
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
        float g = hash(vUv * 1000. + fract(uTime) * 311.) - .5;
        c.rgb += g * .02 * (.4 + c.rgb);
        float v = smoothstep(1.2, .4, length((vUv - .5) * vec2(1.05, 1.)));
        c.rgb *= .7 + .3 * v;
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // ============================================================ per-frame
  const look = HOME.look.clone();
  const simplex = new SimplexNoise();
  let focus = 0, chroma = 0, chromaWant = 0;
  let zoomFrom = 0, zoomTo = 0, zoomAge = 9;
  const ZOOM_SECS = 1.8;
  const easeInOut = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let t = 0;
  const bob = new THREE.Vector3();

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
      que.update(dt, t);
      clock.draw();

      // the logo bobs gently in its patch of sky
      bob.copy(U).multiplyScalar(Math.sin(t * .6) * .08);
      logo.position.copy(LOGO_POS).add(bob);
      logo.quaternion.copy(LOGO_Q);
      logo.rotateY(Math.sin(t * .23) * .05); logo.rotateZ(Math.sin(t * .31 + 1) * .01);
      presenterFade += (presenterWant - presenterFade) * Math.min(1, dt * 4);
      presenterMat.opacity = presenterFade;
      presenterLabel.visible = presenterFade > .01;

      screenMat.uniforms.uFocus.value = focus;

      const want = tvScreen.focus ? 1 : 0;
      if (want !== zoomTo) { zoomFrom = focus; zoomTo = want; zoomAge = 0; }
      zoomAge += dt;
      focus = zoomFrom + (zoomTo - zoomFrom) * easeInOut(Math.min(1, zoomAge / ZOOM_SECS));
      // a slow sideways drift: the layers slide past each other, which is what gives the photo its depth
      const drift = 1 - focus * .9;
      camera.position.lerpVectors(HOME.pos, FOCUS.pos, focus);
      camera.position.x += simplex.noise(t * .05, 1) * .45 * drift;
      camera.position.y += simplex.noise(t * .07, 2) * .14 * drift;
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
      floorMat.uniforms.uRes.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
    },

    dispose() {
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          for (const val of Object.values(m)) if (val?.isTexture && val !== screenTex) val.dispose();
          m.dispose();
        }
      });
      for (const p of composer.passes) p.dispose?.();
      composer.dispose();
    },

    debug: { scene, camera, logo },
  };
}
