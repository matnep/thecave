// Theme 2 — a sunny low-poly alpine valley. Standing on a grassy hill: a turquoise lake below with a footbridge,
// log cabins with a jetty and a rowboat on its shore, layered pines and round trees, grass-topped cliffs round
// the valley with a cave in the back wall (a warm glow inside: the cave from theme 1), snow-capped peaks rising
// behind. The logo floats in the sky, and the notice board stands where theme 1's TV is: both are
// solved at load so they land on the same spot and size on screen as in theme 1.
// The questions go up on the notice board: one pinned sheet at a time (QR code, a question, or a partner's
// logo). When the slideshow moves on, the sheet is ripped off its pin and flutters away across the valley on the
// wind, and a fresh one is pinned up. A bell swings and a lantern glows for a new question; a clock sits in the
// board's gable. Birds circle, clouds drift, chimney smoke billows. Nothing flashes.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floatingLogo } from '../wall-art.js';

export const name = 'Alpine valley';
export const ambience = 'meadow';

// handwriting for the questions: bold, so it reads from the back of the room
const HAND = '"Segoe Print", "Ink Free", "Comic Sans MS", "Bradley Hand", cursive';
const SANS = 'Anton, "Arial Black", sans-serif';
const INK = '#141824';                     // near-black ink on cream paper: ~16:1 contrast
// where theme 1 puts things on a 16:9 screen (measured from theme 1, in NDC: -1..1 across and up)
const THEME1 = { screen: { cx: .552, cy: -.271, h: .429 }, logo: { cx: -.232, cy: .507, w: .496 } };

export async function create({ renderer, tvScreen, screenTex, logoImg }) {
  const SKY = 0xb2d2e2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .96;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 50, 260);

  const BASE_FOV = 45;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, .1, 500);
  function frameCamera() {
    camera.aspect = innerWidth / innerHeight;
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 16 / 9);
    camera.fov = camera.aspect >= 16 / 9 ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / camera.aspect));
    camera.updateProjectionMatrix();
  }
  frameCamera();

  const simplex = new SimplexNoise();
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const fbm = (x, z) => simplex.noise(x, z) + simplex.noise(x * 2.1, z * 2.1) * .5 + simplex.noise(x * 4.3, z * 4.3) * .25;
  const hex = (h) => new THREE.Color(h);

  // ============================================================ the land
  const LAKE = { x: .5, z: -6, rx: 7.5, rz: 5 };
  const lakeDist = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);   // 1 = the shore
  const WATER_Y = -.75;
  function groundY(x, z) {
    let h = smooth(-2, 20, z) * 4.4;                                            // our hill, sloping down to the lake
    h += smooth(8, 28, Math.abs(x)) * 7 * (1 - smooth(-24, -8, z) * .25);      // the valley's sides
    h += smooth(-10, -34, z) * 4.5;                                             // rising toward the cliffs at the back
    h -= (1 - smooth(.7, 1.35, lakeDist(x, z))) * 1.7;                         // the lake bowl
    h += fbm(x * .06, z * .06) * 1.1 + simplex.noise(x * .25, z * .25) * .15;
    return h;
  }
  // up on the hill, looking down into the valley
  const CAM = new THREE.Vector3(0, groundY(0, 22) + 4.6, 22);
  const HOME = { pos: CAM.clone(), look: new THREE.Vector3(.6, 3, -14) };
  camera.position.copy(HOME.pos);

  // ============================================================ placing things where theme 1 has them
  // A fixed 16:9 camera at the home position, used to solve positions in screen space.
  const solveCam = new THREE.PerspectiveCamera(BASE_FOV, 16 / 9, .1, 500);
  solveCam.position.copy(HOME.pos); solveCam.lookAt(HOME.look); solveCam.updateMatrixWorld(); solveCam.updateProjectionMatrix();
  const proj = (v) => v.clone().project(solveCam);
  // the notice board: a landscape sheet the shape of theme 1's TV screen, landing on its spot and size
  const BW = 3.5, BH = 2.5, BASE = 1.0;                  // board size, and how high it stands off the ground
  const PW = 2.4, PH = 1.8;                               // the pinned sheet (4:3, like the TV screen)
  const PIN_Y = BASE + BH - .22;
  const SHEET_Y = PIN_Y - PH / 2;                         // the sheet's centre, up from the board's foot
  const boardAt = (() => {
    const T = THEME1.screen;
    let best = null;
    for (let z = 3; z <= 17; z += .05) {
      let x = 4, s = 1;
      for (let k = 0; k < 6; k++) {
        const y0 = groundY(x, z);
        const yaw = Math.atan2(CAM.x - x, CAM.z - z);
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const c = new THREE.Vector3(x, y0 + SHEET_Y * s, z);
        const top = proj(c.clone().add(new THREE.Vector3(0, PH / 2 * s, 0))), bot = proj(c.clone().add(new THREE.Vector3(0, -PH / 2 * s, 0)));
        const mid = proj(c);
        s *= T.h / Math.max(1e-4, top.y - bot.y);
        const r = proj(c.clone().addScaledVector(right, 1));
        x += (T.cx - mid.x) / Math.max(1e-4, r.x - mid.x);
      }
      const mid = proj(new THREE.Vector3(x, groundY(x, z) + SHEET_Y * s, z));
      const err = Math.abs(mid.y - T.cy) + Math.abs(mid.x - T.cx);
      if (!best || err < best.err) best = { x, z, s, err };
    }
    return best;
  })();
  const BOARD = new THREE.Vector3(boardAt.x, groundY(boardAt.x, boardAt.z), boardAt.z);

  // ============================================================ the land mesh
  const GRASS = [0x5a9a40, 0x60a044, 0x54933c, 0x66a64a].map(hex);         // softer, less saturated greens
  const DRY = hex(0xa8a868), DIRT = hex(0x7e7048), SHORE = hex(0x8ab070);
  {
    const g = new THREE.PlaneGeometry(170, 150, 84, 74).toNonIndexed();
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -45);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let f = 0; f < p.count; f += 3) {
      const x = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, z = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
      const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      c.copy(GRASS[Math.floor(rnd() * GRASS.length)]);
      const dry = smooth(3, 9, y) * smooth(-8, -26, z) * (.5 + .5 * simplex.noise(x * .08, z * .08));
      c.lerp(DRY, Math.max(0, dry));
      const ld = lakeDist(x, z);
      if (ld < 1.25) c.lerp(SHORE, smooth(1.25, .95, ld) * .6);
      if (ld < .95) c.copy(DIRT);
      c.multiplyScalar(.95 + rnd() * .1);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const land = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .95 }));
    land.receiveShadow = true;
    scene.add(land);
  }

  // ============================================================ the lake
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFogC: { value: hex(SKY) }, uFogNear: { value: 50 }, uFogFar: { value: 260 } },
    transparent: true,
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: `
      uniform float uTime, uFogNear, uFogFar; uniform vec3 uFogC; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 g = vW.xz / vec2(.55, .8), i = floor(g), f = fract(g);
        float id = h(i + (f.x < f.y ? .5 : 0.));
        float wave = .5 + .5 * sin(uTime * .8 + id * 6.28);
        vec3 deep = vec3(.04, .3, .42), shallow = vec3(.16, .5, .54);
        float edge = smoothstep(4.5, 0., length((vW.xz - vec2(${LAKE.x.toFixed(1)}, ${LAKE.z.toFixed(1)})) / vec2(${LAKE.rx.toFixed(1)}, ${LAKE.rz.toFixed(1)})) * 4.5);
        vec3 col = mix(shallow, deep, edge) * (.92 + .1 * wave);
        col += vec3(.9, .97, 1.) * smoothstep(.92, 1., wave) * step(.8, id) * .16;
        float d = length(vW - cameraPosition);
        col = mix(col, uFogC, smoothstep(uFogNear, uFogFar, d));
        gl_FragColor = vec4(col, .9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(LAKE.rx * 3, LAKE.rz * 3), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(LAKE.x, WATER_Y, LAKE.z);
    scene.add(water);
  }

  // ============================================================ shared low-poly helpers
  const solid = (geos) => { const m = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))); m.computeVertexNormals(); return m; };
  const paint = (geo, colour, vary = .14) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    const c = hex(colour), col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 9) { const k = 1 - vary / 2 + rnd() * vary; for (let j = 0; j < 9; j += 3) col.set([c.r * k, c.g * k, c.b * k], i + j); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  const jitter = (geo, amt) => {
    const p = geo.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) seen.set(key, [(rnd() - .5) * amt, (rnd() - .5) * amt, (rnd() - .5) * amt]);
      const [a, b, c] = seen.get(key);
      p.setXYZ(i, p.getX(i) + a, p.getY(i) + b, p.getZ(i) + c);
    }
    return geo;
  };
  const vcMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9, ...opts });
  const o3 = new THREE.Object3D();
  function instanced(geo, mat, places) {
    const m = new THREE.InstancedMesh(geo, mat, places.length);
    places.forEach((p, i) => {
      o3.position.set(p.x, p.y, p.z); o3.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
      o3.scale.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1); o3.updateMatrix();
      m.setMatrixAt(i, o3.matrix);
      if (p.tint) m.setColorAt(i, p.tint);
    });
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  // a mesh from parts: [geometry, colour] pairs merged into one vertex-coloured mesh
  const build = (parts, opts) => { const m = new THREE.Mesh(solid(parts.map(([g, c, v]) => paint(g, c, v))), vcMat(opts)); m.castShadow = m.receiveShadow = true; return m; };

  // ============================================================ trees
  const pineGeo = (() => {
    const parts = [paint(new THREE.CylinderGeometry(.11, .16, 1.1, 6).translate(0, .55, 0), 0x5e3c24)];
    const tiers = [[1.25, 1.35, .95], [1.02, 1.2, 1.6], [.78, 1.1, 2.2], [.5, 1.0, 2.75]];
    const shades = [0x377a32, 0x3f8438, 0x488e40, 0x529848];
    tiers.forEach(([r, hgt, y], k) => {
      const cone = new THREE.ConeGeometry(r, hgt, 8, 1).toNonIndexed();
      const p = cone.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k2 = 1 + Math.sin(a * 3 + k) * .08;
        p.setXYZ(i, p.getX(i) * k2, p.getY(i) - .08 * Math.abs(Math.sin(a * 4 + k)), p.getZ(i) * k2);
      }
      cone.translate(0, y + hgt / 2 - .2, 0);
      parts.push(paint(cone, shades[k]));
    });
    return solid(parts);
  })();
  const roundGeo = (() => {
    const parts = [paint(new THREE.CylinderGeometry(.08, .13, 1.6, 5).translate(0, .8, 0), 0x5e3c24)];
    for (const [x, y, z, r] of [[0, 2.0, 0, .85], [.45, 1.75, .2, .6], [-.4, 1.8, -.15, .62], [.1, 2.45, -.1, .55]]) {
      parts.push(paint(jitter(new THREE.IcosahedronGeometry(r, 0), .12).translate(x, y, z), rnd() < .5 ? 0x6ea44a : 0x669c44));
    }
    return solid(parts);
  })();
  const pines = [], rounds = [];
  const CABINS = [[-10.2, -6.4], [-13.2, -10.6], [-8.6, -12.8]];
  const nearBoard = (x, z) => Math.hypot(x - BOARD.x, z - BOARD.z) < 3.4
    || CABINS.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 3.6)
    || (Math.abs(x - 5) < 7 && z < -26 && z > -40);                       // the cave's view across the valley
  const okFor = (x, z) => lakeDist(x, z) > 1.7 && !nearBoard(x, z) && !(Math.abs(x) < 9 && z > -16 && z < 8);
  const tint = () => new THREE.Color(.88 + rnd() * .14, .9 + rnd() * .12, .86 + rnd() * .12);
  for (const [x, z, s] of [[-6.2, 10.8, 1.6], [-4.4, 13.2, 1.3], [11.8, 12.4, 2.5]]) if (!nearBoard(x, z)) pines.push({ x, z, s });
  for (let i = 0; i < 170; i++) {
    const x = (rnd() - .5) * 120, z = -48 + rnd() * 62;
    if (!okFor(x, z) || Math.hypot(x, z - 22) < 9) continue;
    const back = z < -20;
    if (rnd() < (back ? .85 : .62)) pines.push({ x, z, s: .7 + rnd() * .9 }); else rounds.push({ x, z, s: .7 + rnd() * .6 });
  }
  for (const [x, z] of [[-9.5, 8], [-12, 4], [-10.4, -2.4], [12.6, -2], [-14, -9], [3.4, 6.2]]) if (!nearBoard(x, z)) rounds.push({ x, z, s: 1 + rnd() * .4 });
  instanced(pineGeo, vcMat(), pines.map((t) => ({ x: t.x, y: groundY(t.x, t.z) - .1, z: t.z, ry: rnd() * 6, s: t.s, tint: tint() })));
  instanced(roundGeo, vcMat(), rounds.map((t) => ({ x: t.x, y: groundY(t.x, t.z) - .1, z: t.z, ry: rnd() * 6, s: t.s, tint: tint() })));

  // ============================================================ rocks and cliffs
  const rockGeo = paint(jitter(new THREE.IcosahedronGeometry(1, 0), .35), 0xc0c4c8);
  rockGeo.computeVertexNormals();
  const rocks = [];
  for (const [x, z, s] of [[-7, 6, 1.1], [-2.6, 4.2, .9], [3.6, 3.8, .7], [-8.6, 1, 1.4], [6.4, -1.2, .8], [-4.4, -.4, .9], [1.8, 6.4, 1.3],
    [-13, 9, 1.6], [-1.4, -2.6, .7], [-10.4, -4, 1.1]]) if (!nearBoard(x, z)) rocks.push({ x, z, s });
  for (let i = 0; i < 40; i++) { const x = (rnd() - .5) * 90, z = -40 + rnd() * 52; if (lakeDist(x, z) > 1.1 && Math.hypot(x, z - 22) > 8 && !nearBoard(x, z)) rocks.push({ x, z, s: .3 + rnd() * .8 }); }
  instanced(rockGeo, vcMat(), rocks.map((r) => ({ x: r.x, y: groundY(r.x, r.z) + r.s * .25, z: r.z, rx: rnd() * 3, ry: rnd() * 6, s: r.s, sy: r.s * .65 })));
  {
    const slabs = [];
    const ROCK = [0x8b8d8c, 0x7e8180, 0x918c85];
    const wall = (x0, x1, z0, z1, h0, h1, n = 22) => {
      for (let i = 0; i < n; i++) {
        const u = rnd(), x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u + (rnd() - .5) * 3;
        const w = 4 + rnd() * 6, hh = h0 + rnd() * (h1 - h0), d = 3 + rnd() * 4;
        const ry = (rnd() - .5) * .6, rz = (rnd() - .5) * .08, y = groundY(x, z) - 1.2;
        const g = new THREE.BoxGeometry(w, hh, d, 1, 2, 1);
        jitter(g, .5);
        g.rotateY(ry); g.rotateZ(rz); g.translate(x, y + hh / 2, z);
        slabs.push(paint(g, ROCK[Math.floor(rnd() * 3)]));
        // a grassy cap on the ledge
        const cap = jitter(new THREE.BoxGeometry(w * .94, .5, d * .94, 2, 1, 2), .25);
        cap.rotateY(ry); cap.rotateZ(rz); cap.translate(x, y + hh + .05, z);
        slabs.push(paint(cap, rnd() < .5 ? 0x5a8f40 : 0x638f45));
      }
    };
    wall(-48, -12, -22, -30, 2.5, 5);
    wall(10, 52, -20, -30, 3, 6);
    wall(-14, -2, -40, -44, 3.5, 6, 10);
    wall(13, 24, -40, -44, 3.5, 6, 10);
    wall(-60, -40, -8, -16, 4, 7);
    wall(40, 62, -6, -14, 4, 7);
    const m = new THREE.Mesh(solid(slabs), vcMat({ roughness: .85 }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // ============================================================ the cave, high in the back cliff
  // A tall crag of stacked slabs with a dark arched mouth, ragged rocks round its rim, and a faint warm glow
  // deep inside (the firelit cave of theme 1), straight across the lake from the viewer.
  const CAVE = new THREE.Vector3(5, 0, -41);
  CAVE.y = groundY(CAVE.x, CAVE.z);
  {
    const slabs = [];
    for (let i = 0; i < 16; i++) {
      const w = 3 + rnd() * 4, hh = 9 + rnd() * 6, d = 4 + rnd() * 3;
      const x = CAVE.x + (rnd() - .5) * 17, z = CAVE.z - 3.6 - rnd() * 3;    // all behind the face, never through the mouth
      const ry = (rnd() - .5) * .4;
      const g = new THREE.BoxGeometry(w, hh, d, 1, 2, 1);
      jitter(g, .6); g.rotateY(ry);
      g.translate(x, CAVE.y + hh / 2 - 1, z);
      slabs.push(paint(g, rnd() < .5 ? 0x86888a : 0x7a7d7e));
      const cap = jitter(new THREE.BoxGeometry(w * .94, .5, d * .94, 2, 1, 2), .25); cap.rotateY(ry); cap.translate(x, CAVE.y + hh - .95, z);
      slabs.push(paint(cap, rnd() < .5 ? 0x5a8f40 : 0x638f45));
    }
    // the face the mouth opens in: a broad slab, so the arch has rock all round it, grass along its brow
    const face = new THREE.BoxGeometry(15, 13, 3, 3, 3, 1); jitter(face, .7); face.translate(CAVE.x, CAVE.y + 5.5, CAVE.z - .6);
    slabs.push(paint(face, 0x81827f));
    const brow = jitter(new THREE.BoxGeometry(14.6, .6, 2.8, 4, 1, 1), .3); brow.translate(CAVE.x, CAVE.y + 12.1, CAVE.z - .6);
    slabs.push(paint(brow, 0x5e9042));
    const crag = new THREE.Mesh(solid(slabs), vcMat({ roughness: .85 }));
    crag.castShadow = crag.receiveShadow = true;
    scene.add(crag);
    // the mouth: an arch of darkness, a little proud of the face so nothing shows through
    const arch = new THREE.Shape();
    arch.moveTo(-2.2, 0); arch.lineTo(-2.3, 2.4); arch.quadraticCurveTo(-2.1, 4.6, 0, 4.9); arch.quadraticCurveTo(2.1, 4.6, 2.3, 2.4); arch.lineTo(2.2, 0); arch.closePath();
    const CS = 1.45;                                                       // the mouth's size
    const mouth = new THREE.Mesh(new THREE.ShapeGeometry(arch, 8), new THREE.MeshBasicMaterial({ color: 0x0c0806 }));
    mouth.position.set(CAVE.x, CAVE.y + .2, CAVE.z + 1.4); mouth.scale.setScalar(CS);
    scene.add(mouth);
    // the warm glow deep inside
    const gc = document.createElement('canvas'); gc.width = gc.height = 128;
    const gx = gc.getContext('2d');
    const gr = gx.createRadialGradient(64, 92, 4, 64, 92, 64);
    gr.addColorStop(0, 'rgba(255,170,80,.85)'); gr.addColorStop(.45, 'rgba(220,90,30,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(gc); glowTex.colorSpace = THREE.SRGBColorSpace;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(CAVE.x, CAVE.y + 1.6 * CS, CAVE.z + 1.45); glow.scale.setScalar(CS);
    scene.add(glow);
    // ragged rocks round the rim
    const rim = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * i / 14;
      const g = jitter(new THREE.IcosahedronGeometry(.55 + rnd() * .35, 0), .25);
      g.scale(CS, CS, CS);
      g.translate(CAVE.x - Math.cos(a) * 2.45 * CS, CAVE.y + .2 + Math.sin(a) * 4.9 * CS * (i === 0 || i === 14 ? .2 : 1), CAVE.z + 1.6);
      rim.push(paint(g, 0x6c7378));
    }
    const rimMesh = new THREE.Mesh(solid(rim), vcMat()); rimMesh.castShadow = true; scene.add(rimMesh);
  }

  // ============================================================ mountains: snow-capped peaks beyond the cliffs
  // Two ranges of distinct pyramidal peaks, laid out in screen space so they always rise clear of the cliffs: a nearer,
  // darker one with forest on its lower slopes, and a taller, paler, snowier one behind it. Sunlight and haze are
  // baked into the facet colours (no fog), so the faces stay crisp but still read as far away.
  const SUN_DIR = new THREE.Vector3(-30, 45, 36).normalize();
  // where things land on screen from the home view: the world x for a screen x, the height for a screen y
  const solve = (f, want, lo, hi) => { for (let k = 0; k < 32; k++) { const m = (lo + hi) / 2; (f(m) < want ? lo = m : hi = m); } return lo; };
  const xAt = (nx, z) => solve((x) => proj(new THREE.Vector3(x, 20, z)).x, nx, -700, 700);
  const yAt = (x, z, ny) => solve((y) => proj(new THREE.Vector3(x, y, z)).y, ny, -50, 300);
  {
    const HAZE = hex(0xb6d0e0), SNOW = hex(0xf6f8fa), SNOW_SHADE = hex(0xa6bbd0);
    const range = ({ z, depth, peaks, ridge, snow, rock, forest, haze, sd }) => {
      const span = (22 - z) * .74;                                          // world units per screen-width unit at this depth
      const P = peaks.map(([nx, ny, r]) => { const x = xAt(nx, z); return { x, h: yAt(x, z, ny), r: r * span }; });
      const W = 760, segX = 150, segZ = 26;
      const g = new THREE.PlaneGeometry(W, depth, segX, segZ);
      g.rotateX(-Math.PI / 2); g.translate(0, 0, z);
      const p = g.attributes.position, cell = W / segX;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), zz = p.getZ(i);
        const edge = Math.abs(zz - z) > depth / 2 - 1;
        if (!edge) { x += simplex.noise(x * .3 + sd, zz * .3) * cell * .35; zz += simplex.noise(zz * .3, x * .3 + sd) * cell * .35; }
        const prof = Math.max(0, 1 - Math.abs(zz - z) / (depth / 2));       // 1 along the crest, 0 at the front and back
        // the peaks: pyramids whose flanks break into ridges and gullies
        let h = yAt(x, z, ridge) * (.86 + .14 * simplex.noise(x * .02, sd)) * Math.pow(prof, .7);
        for (const k of P) {
          const d = Math.hypot((x - k.x) / k.r, (zz - z) / (k.r * .6)) * (1 + simplex.noise(x * .035 + sd, zz * .035) * .16);
          if (d < 1) h = Math.max(h, k.h * Math.pow(1 - d, 1.12));
        }
        h += (1 - Math.abs(simplex.noise(x * .06, zz * .06 + sd))) * 2.2 * prof;
        p.setXYZ(i, x, edge ? -8 : h - 6 * (1 - prof), zz);
      }
      const geo = g.toNonIndexed(); geo.computeVertexNormals();
      const q = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(q.count * 3), c = new THREE.Color();
      const snowY = yAt(0, z, snow), treeY = yAt(0, z, ridge) * .7;
      for (let f = 0; f < q.count; f += 3) {
        const x = (q.getX(f) + q.getX(f + 1) + q.getX(f + 2)) / 3, y = (q.getY(f) + q.getY(f + 1) + q.getY(f + 2)) / 3;
        const ny = n.getY(f), lit = Math.max(0, n.getX(f) * SUN_DIR.x + ny * SUN_DIR.y + n.getZ(f) * SUN_DIR.z);
        const wob = simplex.noise(x * .05, y * .1 + sd) * 3;
        if (y > snowY + wob && ny > .3) c.copy(SNOW_SHADE).lerp(SNOW, Math.min(1, lit * 1.25));
        else {
          c.copy(forest && y < treeY + wob ? forest : rock[f % 2]);
          c.multiplyScalar(.5 + .72 * lit);
        }
        c.lerp(HAZE, haze);
        for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    };
    // [screen x, screen y of the summit, width in screen widths]; the cliffs top out around .8 on screen
    range({ z: -180, depth: 110, ridge: .7, snow: .8, haze: .42, sd: 7.3, rock: [hex(0x8e96a2), hex(0x868e9a)],
      peaks: [[-2.3, .84, .5], [-1.8, .86, .5], [-1.3, .92, .45], [-.82, .87, .4], [-.4, .93, .42], [0, .86, .34], [.32, .99, .42], [.72, .9, .38],
        [1.1, .95, .42], [1.5, .85, .45], [1.95, .9, .5], [2.4, .84, .5]] });
    range({ z: -112, depth: 70, ridge: .66, snow: .84, haze: .2, sd: 2.1, rock: [hex(0x6f7780), hex(0x68707a)], forest: hex(0x3d5a46),
      peaks: [[-2.1, .8, .5], [-1.55, .83, .45], [-1.05, .86, .42], [-.6, .78, .34], [-.15, .84, .4], [.18, .78, .3], [.55, .87, .4],
        [.98, .8, .38], [1.4, .88, .46], [1.9, .8, .5], [2.35, .84, .5]] });
  }

  // ============================================================ reeds, footbridge, path
  {
    const reedGeo = paint(new THREE.ConeGeometry(.05, 1, 3).translate(0, .5, 0), 0x5e983c);
    const reeds = [];
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2, r = .92 + rnd() * .18;
      const x = LAKE.x + Math.cos(a) * LAKE.rx * r, z = LAKE.z + Math.sin(a) * LAKE.rz * r;
      if (rnd() < .45 || (x < -3.6 && z > -9 && z < -3)) continue;    // (clear of the jetty and the boat)
      reeds.push({ x, y: Math.max(WATER_Y, groundY(x, z)) - .05, z, rx: (rnd() - .5) * .3, rz: (rnd() - .5) * .3, s: .7 + rnd() * .7 });
    }
    instanced(reedGeo, vcMat(), reeds);
    const plank = new THREE.MeshStandardMaterial({ color: 0x7e5232, roughness: .9, flatShading: true });
    const bridge = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.32, .08, 1.3), plank);
      b.position.set(-2.2 + i * .38, .05 + Math.sin(i / 11 * Math.PI) * .25, 0); b.rotation.y = (rnd() - .5) * .05;
      b.castShadow = b.receiveShadow = true; bridge.add(b);
    }
    for (const z of [-.62, .62]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.6, .06, .06), plank); rail.position.set(0, .75, z); bridge.add(rail);
      for (const x of [-2.2, -.8, .8, 2.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.09, 1, .09), plank); post.position.set(x, .35, z); bridge.add(post); }
    }
    bridge.position.set(LAKE.x - 1.2, WATER_Y + .15, LAKE.z + LAKE.rz * .82);
    bridge.rotation.y = .12;
    scene.add(bridge);
    // stepping stones down the hill from the notice board toward the cabin
    const stoneGeo = new THREE.CylinderGeometry(.42, .46, .14, 6);
    const path = new THREE.CatmullRomCurve3([[BOARD.x - .6, BOARD.z - 1.8], [BOARD.x - 1.8, BOARD.z - 5.5], [3, 1.6], [1.4, -.4]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const steps = [];
    for (let i = 0; i <= 26; i++) {
      const p = path.getPointAt(i / 26);
      for (const side of [-.45, .45]) {
        const x = p.x + side + (rnd() - .5) * .3, z = p.z + (rnd() - .5) * .3;
        steps.push({ x, y: groundY(x, z) + .03, z, ry: rnd() * 3, s: .7 + rnd() * .4 });
      }
    }
    const stones = new THREE.InstancedMesh(stoneGeo, new THREE.MeshStandardMaterial({ color: 0xcfd1d4, roughness: .9, flatShading: true }), steps.length);
    steps.forEach((p, i) => { o3.position.set(p.x, p.y, p.z); o3.rotation.set(0, p.ry, 0); o3.scale.set(p.s, 1, p.s * .8); o3.updateMatrix(); stones.setMatrixAt(i, o3.matrix); });
    stones.receiveShadow = true; scene.add(stones);
  }

  // ============================================================ cabins: log walls, windows, porch, chimney
  const smokes = [];
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xffa848, emissiveIntensity: .9, roughness: .3 });
  function cabin({ w = 3, d = 2.3, rows = 7, porch = true, extras = true }) {
    const g = new THREE.Group();
    const parts = [];
    const ROW = .24, wallTop = .35 + rows * ROW;
    parts.push([new THREE.BoxGeometry(w + .25, .35, d + .25).translate(0, .175, 0), 0x8c8c88]);                 // stone footing
    for (let r = 0; r < rows; r++) {                                                                       // logs, interleaved at the corners
      const y = .35 + r * ROW + ROW / 2, c = r % 2 ? 0x84502e : 0x744426;
      for (const z of [-d / 2, d / 2]) parts.push([new THREE.CylinderGeometry(.13, .13, w + (r % 2 ? .3 : .1), 6).rotateZ(Math.PI / 2).translate(0, y, z), c]);
      for (const x of [-w / 2, w / 2]) parts.push([new THREE.CylinderGeometry(.13, .13, d + (r % 2 ? .1 : .3), 6).rotateX(Math.PI / 2).translate(x, y + .01, 0), c]);
    }
    const gable = new THREE.Shape([new THREE.Vector2(-d / 2 - .1, 0), new THREE.Vector2(d / 2 + .1, 0), new THREE.Vector2(0, 1.05)]);
    for (const x of [-w / 2, w / 2]) parts.push([new THREE.ExtrudeGeometry(gable, { depth: .12, bevelEnabled: false }).rotateY(Math.PI / 2).translate(x - .06, wallTop, 0), 0x6e4024]);
    // the roof: two pitched slabs with an overhang, a ridge beam on top
    const pitch = Math.atan2(1.05, d / 2 + .1), slab = (d / 2 + .5) / Math.cos(pitch);
    for (const s of [-1, 1]) {
      const r = new THREE.BoxGeometry(w + .7, .12, slab, 4, 1, 3);
      r.rotateX(s * pitch).translate(0, wallTop + .52, s * (d / 4 + .08));
      parts.push([r, 0x7e3020, .22]);
    }
    parts.push([new THREE.BoxGeometry(w + .8, .14, .18).translate(0, wallTop + 1.1, 0), 0x4e2416]);
    // a stone chimney through the roof
    parts.push([new THREE.BoxGeometry(.5, 2.1, .5).translate(w * .28, wallTop + .45, -d * .22), 0x8a8a86]);
    parts.push([new THREE.BoxGeometry(.62, .12, .62).translate(w * .28, wallTop + 1.55, -d * .22), 0x6e6e6a]);
    // the door and its frame
    parts.push([new THREE.BoxGeometry(.72, 1.3, .08).translate(-w * .12, .35 + .65, d / 2 + .12), 0x4e2c18]);
    parts.push([new THREE.BoxGeometry(.86, .08, .1).translate(-w * .12, .35 + 1.34, d / 2 + .12), 0xd8ccb0]);
    // window frames and shutters
    const windows = [[w * .26, 1.15, d / 2 + .13, 0], [w / 2 + .13, 1.15, 0, Math.PI / 2]];
    for (const [x, y, z, ry] of windows) {
      const fr = (gw, gh) => new THREE.BoxGeometry(gw, gh, .06).rotateY(ry);
      parts.push([fr(.72, .07).translate(x, y + .32, z), 0xe2d6ba], [fr(.72, .07).translate(x, y - .32, z), 0xe2d6ba]);
      for (const sx of [-1, 1]) {
        const off = new THREE.Vector3(sx * .32, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        parts.push([fr(.07, .7).translate(x + off.x, y, z + off.z), 0xe2d6ba]);
        const sh = new THREE.Vector3(sx * .52, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        parts.push([fr(.26, .66).translate(x + sh.x, y, z + sh.z), 0x3e6a3a]);
      }
      if (extras) {                                                       // a flower box under it
        const fb = new THREE.Vector3(0, 0, .12).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
        parts.push([new THREE.BoxGeometry(.7, .14, .16).rotateY(ry).translate(x + fb.x, y - .45, z + fb.z), 0x6a3a20]);
        for (let k = 0; k < 5; k++) {
          const fo = new THREE.Vector3(-.28 + k * .14, 0, .12).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
          parts.push([new THREE.IcosahedronGeometry(.06, 0).translate(x + fo.x, y - .34, z + fo.z), k % 2 ? 0xe84a5a : 0xf2c84a]);
        }
      }
      const glass = new THREE.Mesh(new THREE.BoxGeometry(.58, .58, .04).rotateY(ry), glassMat);
      glass.position.set(x, y, z - (ry ? 0 : .02)); g.add(glass);
    }
    if (porch) {
      parts.push([new THREE.BoxGeometry(w * .8, .12, 1).translate(-w * .05, .33, d / 2 + .6), 0x8a6040]);
      parts.push([new THREE.BoxGeometry(.6, .1, .3).translate(-w * .12, .16, d / 2 + 1.2), 0x8a6040]);   // step
      for (const x of [-w * .42, w * .32]) parts.push([new THREE.BoxGeometry(.1, 1.45, .1).translate(x, 1.05, d / 2 + 1.04), 0x6a4024]);
      parts.push([new THREE.BoxGeometry(w * .86, .08, 1.15).rotateX(.22).translate(-w * .05, 1.85, d / 2 + .62), 0x7e3020]);
    }
    if (extras) {                                                         // firewood stacked against the side
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
        parts.push([new THREE.CylinderGeometry(.1, .1, .8, 6).rotateX(Math.PI / 2).translate(-w / 2 - .32, .45 + r * .18, -d * .25 + (k - (3 - r) / 2) * .21 + r * .1), k % 2 ? 0x8a5a34 : 0x7a4c2a]);
      }
    }
    g.add(build(parts));
    g.userData.chimney = new THREE.Vector3(w * .28, wallTop + 1.65, -d * .22);
    return g;
  }
  function place(cab, x, z, ry, s) {
    cab.position.set(x, groundY(x, z) - .08, z); cab.rotation.y = ry; cab.scale.setScalar(s);
    scene.add(cab); cab.updateMatrixWorld(true);
    smokes.push(cab.localToWorld(cab.userData.chimney.clone()));
  }
  // on the left shore, in view (the right side is the notice board's)
  place(cabin({ w: 3.2, d: 2.4 }), CABINS[0][0], CABINS[0][1], Math.PI / 2 - .25, 1);     // the lakeside cabin, facing the water
  place(cabin({ w: 2.6, d: 2.1, rows: 6, extras: false }), CABINS[1][0], CABINS[1][1], 1.1, .85);
  place(cabin({ w: 2.4, d: 2, rows: 6, porch: false, extras: false }), CABINS[2][0], CABINS[2][1], -.3, .75);
  {
    // a jetty out into the lake from the cabin, with a rowboat tied alongside
    const wood = [];
    const x0 = -7.4, x1 = -4.2, zj = -6.2;                                // from the shore, clear of the porch
    for (let i = 0; i <= 10; i++) wood.push([new THREE.BoxGeometry(.3, .07, 1.1).translate(x0 + (x1 - x0) * i / 10, WATER_Y + .42, zj), i % 2 ? 0x8a6040 : 0x7a5434]);
    for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [zj - .5, zj + .5]) wood.push([new THREE.CylinderGeometry(.07, .07, 1.2, 5).translate(x, WATER_Y + .1, z), 0x5a3a22]);
    scene.add(build(wood));
    const hull = new THREE.BoxGeometry(2.2, .4, .9, 4, 1, 2);
    { const p = hull.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const k = 1 - Math.pow(Math.abs(x) / 1.1, 3) * .9; p.setZ(i, p.getZ(i) * k * (y < 0 ? .7 : 1)); if (y < 0) p.setY(i, y + Math.abs(x) * .05); } }
    const boat = build([[hull, 0x9a5a32], [new THREE.BoxGeometry(.12, .06, .7).translate(-.35, .12, 0), 0x6a3e22], [new THREE.BoxGeometry(.12, .06, .7).translate(.4, .12, 0), 0x6a3e22]]);
    boat.position.set(-5.2, WATER_Y + .12, zj + 1.15); boat.rotation.y = .12;              // on the near side, in view
    scene.add(boat);
  }

  // ============================================================ the notice board (where theme 1's TV is)
  const board = new THREE.Group();
  board.position.copy(BOARD);
  board.rotation.y = Math.atan2(CAM.x - BOARD.x, CAM.z - BOARD.z);
  board.scale.setScalar(boardAt.s);
  scene.add(board);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7e4e30, roughness: .9, flatShading: true });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x5e3820, roughness: .9, flatShading: true });
  const planksMat = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192;
    const x = cv.getContext('2d');
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#93613a' : '#a26c42'; x.fillRect(0, i * 22, 256, 21); }
    x.fillStyle = 'rgba(50,25,10,.35)'; for (let i = 0; i < 9; i++) x.fillRect(0, i * 22 + 20, 256, 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: .9 });
  })();
  const add = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; board.add(m); return m; };
  {
    // posts, the planked board, a frame
    for (const x of [-BW / 2 - .05, BW / 2 + .05]) add(new THREE.CylinderGeometry(.11, .13, BASE + BH + .7, 6), woodDark, x, (BASE + BH + .7) / 2 - .2, -.08);
    add(new THREE.BoxGeometry(BW, BH, .12), planksMat, 0, BASE + BH / 2, 0);
    add(new THREE.BoxGeometry(BW + .2, .12, .18), woodMat, 0, BASE + BH + .04, .02);
    add(new THREE.BoxGeometry(BW + .2, .12, .18), woodMat, 0, BASE - .04, .02);
    for (const x of [-BW / 2 - .02, BW / 2 + .02]) add(new THREE.BoxGeometry(.12, BH, .18), woodMat, x, BASE + BH / 2, .02);
    // the gable: a triangle of boards under the roof, which the clock hangs on
    const gableShape = new THREE.Shape([new THREE.Vector2(-BW / 2, 0), new THREE.Vector2(BW / 2, 0), new THREE.Vector2(0, .59)]);
    add(new THREE.ExtrudeGeometry(gableShape, { depth: .1, bevelEnabled: false }).translate(0, 0, -.05), woodMat, 0, BASE + BH + .1, 0);
    // the roof: two boards meeting at the ridge, overhanging front and back
    const roofY = BASE + BH + .45;
    add(new THREE.BoxGeometry(BW / 2 + .45, .08, .9), woodDark, -BW / 4 - .08, roofY, .1, .3);
    add(new THREE.BoxGeometry(BW / 2 + .45, .08, .9), woodDark, BW / 4 + .08, roofY, .1, -.3);
  }
  // the clock, set into the gable below the ridge (clear of the roof and the frame)
  const clockHands = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    x.fillStyle = '#f4ead2'; x.beginPath(); x.arc(128, 128, 122, 0, 7); x.fill();
    x.strokeStyle = '#4e321a'; x.lineWidth = 16; x.stroke();
    x.fillStyle = '#2a1a0c';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.arc(128 + Math.sin(a) * 94, 128 - Math.cos(a) * 94, i % 3 ? 6 : 11, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const CY = BASE + BH + .37;
    const face = new THREE.Mesh(new THREE.CircleGeometry(.21, 20), new THREE.MeshStandardMaterial({ map: t, roughness: .7, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .2 }));
    face.position.set(0, CY, .07); board.add(face);
    const ink = new THREE.MeshBasicMaterial({ color: 0x1a120a });
    const hand = (len, w) => { const g = new THREE.BoxGeometry(w, len, .01); g.translate(0, len / 2, 0); const m = new THREE.Mesh(g, ink); m.position.set(0, CY, .08); board.add(m); return m; };
    return { h: hand(.11, .03), m: hand(.17, .018) };
  })();
  // a lantern on a bracket by the left post, and a bell under the right eave: they come alive for a new question
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.35, .25, .1), toneMapped: false });
  const lanternLight = new THREE.PointLight(0xffb060, 0, 6, 1.6);
  {
    const l = new THREE.Group();
    l.position.set(-BW / 2 - .05, BASE + BH - .05, .34);
    add(new THREE.BoxGeometry(.06, .06, .36), woodDark, -BW / 2 - .05, BASE + BH - .02, .14);         // bracket
    const glass = new THREE.Mesh(new THREE.BoxGeometry(.2, .28, .2), lanternMat); glass.position.y = -.25; l.add(glass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.17, .12, 4), woodDark); cap.position.y = -.05; cap.rotation.y = Math.PI / 4; l.add(cap);
    lanternLight.position.y = -.25; l.add(lanternLight);
    board.add(l);
  }
  const bell = new THREE.Group();
  {
    bell.position.set(BW / 2 - .45, BASE + BH + .28, .38);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.06, .15, .2, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xc89838, metalness: .8, roughness: .3, side: THREE.DoubleSide, flatShading: true }));
    body.position.y = -.14; bell.add(body);
    const clap = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 4), woodDark); clap.position.y = -.24; bell.add(clap);
    board.add(bell);
  }

  // ---- the sheet: drawn from whatever the TV is showing (the QR, a question, or a partner's logo)
  const SHEET_Z = .1;                                         // in front of the board face (.06) and the old notes (.075)
  const paperCanvas = document.createElement('canvas'); paperCanvas.width = 1024; paperCanvas.height = 768;
  const paperTex = new THREE.CanvasTexture(paperCanvas); paperTex.colorSpace = THREE.SRGBColorSpace; paperTex.anisotropy = 8;
  let inkQr = null;
  function getInkQr() {
    if (inkQr || !tvScreen.qr) return inkQr;
    const q = tvScreen.qr, cv = document.createElement('canvas'); cv.width = q.width; cv.height = q.height;
    const x = cv.getContext('2d'); x.drawImage(q, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = INK; x.fillRect(0, 0, cv.width, cv.height);
    return (inkQr = cv);
  }
  // partner logos come from the TV with amber lettering; on paper, the amber turns to dark ink so it reads
  const inkedLogos = new Map();
  function inkLogo(logo) {
    if (inkedLogos.has(logo)) return inkedLogos.get(logo);
    const cv = document.createElement('canvas'); cv.width = logo.width; cv.height = logo.height;
    const x = cv.getContext('2d'); x.drawImage(logo, 0, 0);
    const img = x.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] > 110 && d[i + 2] < 110 && d[i] - d[i + 2] > 100) { d[i] = 20; d[i + 1] = 24; d[i + 2] = 36; }
    x.putImageData(img, 0, 0);
    inkedLogos.set(logo, cv);
    return cv;
  }
  function wrap(x, text, maxW) {
    const lines = []; let line = '';
    for (const w of text.split(' ')) { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  function drawPaper(item) {
    const x = paperCanvas.getContext('2d');
    const W = 1024, H = 768;
    x.fillStyle = '#f8f2e2'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 720);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,90,40,.14)');    // aged edges, kept light
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = INK; x.strokeStyle = INK;
    if (item?.kind === 'qr') {
      const q = getInkQr();
      if (q) { x.imageSmoothingEnabled = false; const s = 520; x.drawImage(q, (W - s) / 2, 56, s, s); x.imageSmoothingEnabled = true; }
      let size = 80; x.font = `${size}px ${SANS}`;
      while (x.measureText(tvScreen.caption).width > W - 90 && size > 30) { size -= 4; x.font = `${size}px ${SANS}`; }
      x.fillText(tvScreen.caption, W / 2, 668);
    } else if (item?.kind === 'question') {
      const text = `“${item.m.text}”`;
      let size = 96, lines;
      for (; size >= 40; size -= 4) { x.font = `bold ${size}px ${HAND}`; lines = wrap(x, text, W - 120); if (lines.length * size * 1.18 < 520) break; }
      x.lineWidth = Math.max(2, size * .045); x.lineJoin = 'round';     // a touch of stroke: thicker, darker letters
      const top = 330 - (lines.length * size * 1.18) / 2;
      lines.forEach((ln, i) => { const y = top + i * size * 1.18 + size / 2; x.strokeText(ln, W / 2, y); x.fillText(ln, W / 2, y); });
      if (item.m.name) {
        x.font = `bold 66px ${HAND}`; x.fillStyle = '#7a1e10'; x.strokeStyle = '#7a1e10'; x.lineWidth = 3;
        x.strokeText(`— ${item.m.name}`, W / 2, 680); x.fillText(`— ${item.m.name}`, W / 2, 680);
      }
    } else if (item?.kind === 'partner') {
      const raw = tvScreen.partners[item.i];
      if (raw) { const logo = inkLogo(raw); const s = Math.min((W - 140) / logo.width, 480 / logo.height); x.drawImage(logo, (W - logo.width * s) / 2, (H - logo.height * s) / 2, logo.width * s, logo.height * s); }
    }
    paperTex.needsUpdate = true;
  }
  const paperGeo = () => new THREE.PlaneGeometry(PW, PH, 12, 9).translate(0, -PH / 2, 0);   // hangs from its top edge (the pin)
  // evenly lit (a little self-light), so it stays readable in the shade of the roof
  const paperMaterial = (map) => new THREE.MeshStandardMaterial({ map, roughness: .9, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .38, side: THREE.DoubleSide });
  const paper = new THREE.Mesh(paperGeo(), paperMaterial(paperTex));
  paper.position.set(0, PIN_Y, SHEET_Z); paper.castShadow = true;
  board.add(paper);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xc02424, roughness: .4 });
  add(new THREE.SphereGeometry(.055, 8, 6), pinMat, 0, PIN_Y - .06, SHEET_Z + .05);
  {
    // old notes in the margins either side of the sheet (never overlapping it)
    const note = (w, h, x, y, rot, colour) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: colour, roughness: .9 }));
      m.position.set(x, y, .075); m.rotation.z = rot; board.add(m);
      add(new THREE.SphereGeometry(.04, 6, 4), pinMat, x, y + h / 2 - .08, .1);
    };
    const mx = (PW / 2 + BW / 2) / 2;                       // the middle of each margin
    note(.38, .5, -mx, BASE + BH - .5, .08, 0xebe0c2);
    note(.36, .3, -mx, BASE + .5, -.06, 0xf0e6ae);
    note(.36, .46, mx, BASE + BH - .55, -.06, 0xe6ecf0);
  }
  const scrap = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-.14, 0), new THREE.Vector2(.16, 0), new THREE.Vector2(.04, -.17)])),
    new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: .9, side: THREE.DoubleSide }));
  scrap.position.set(0, PIN_Y + .02, SHEET_Z - .01); scrap.visible = false; board.add(scrap);

  // ---- ripping: the old sheet is copied into a flyer that tears off the pin and blows away; a fresh one goes up
  const flyers = [];
  const wind = new THREE.Vector3(2.6, .9, -1.6);
  function ripOff() {
    const snap = document.createElement('canvas'); snap.width = paperCanvas.width; snap.height = paperCanvas.height;
    snap.getContext('2d').drawImage(paperCanvas, 0, 0);
    const t = new THREE.CanvasTexture(snap); t.colorSpace = THREE.SRGBColorSpace;
    const geo = paperGeo();
    const mat = paperMaterial(t); mat.transparent = true;
    const m = new THREE.Mesh(geo, mat);
    board.updateMatrixWorld(true);
    paper.getWorldPosition(m.position); paper.getWorldQuaternion(m.quaternion); m.scale.setScalar(boardAt.s);
    scene.add(m);
    flyers.push({ m, age: 0, rest: Float32Array.from(geo.attributes.position.array), vel: new THREE.Vector3(),
      spin: new THREE.Vector3((rnd() - .5) * 2, (rnd() - .5) * 3, (rnd() - .5) * 2.5), seed: rnd() * 10,
      fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion) });
    scrap.visible = true;
  }
  let pinIn = 1, shownKey = null;
  const keyOf = (cur) => (cur ? `${cur.kind}|${cur.i ?? ''}|${cur.m?.id ?? ''}|${cur.m?.text ?? ''}` : 'none');
  function updatePaper(dt) {
    const cur = tvScreen.current;
    const k = keyOf(cur) + (cur?.kind === 'qr' && getInkQr() ? '|q' : '');
    if (k !== shownKey) {
      const sameItem = shownKey && shownKey.split('|').slice(0, 3).join('|') === k.split('|').slice(0, 3).join('|');
      if (shownKey && shownKey !== 'none' && !sameItem) { ripOff(); pinIn = 0; }
      shownKey = k;
      drawPaper(cur);
    }
    pinIn = Math.min(1, pinIn + dt * 1.6);
    const e = 1 - Math.pow(1 - pinIn, 3);
    paper.rotation.z = (1 - e) * .14;
    paper.position.z = SHEET_Z + (1 - e) * .15;              // comes in from the front, never through the board
    paper.scale.setScalar(.95 + .05 * e);
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.age += dt;
      const p = f.m.geometry.attributes.position;
      if (f.age < .35) {
        // the tug: it lifts toward us off the board (only ever forward, so it can't dip into the board)
        const u = f.age / .35;
        f.m.position.addScaledVector(f.fwd, dt * .5 * boardAt.s);
        f.m.rotateX(-dt * 2.2 * (1 - u)); f.m.rotateZ(dt * .8);
      } else {
        if (!f.free) { f.free = true; f.vel.copy(wind).multiplyScalar(.5).add(new THREE.Vector3(0, 1.2, .8)); }
        f.vel.addScaledVector(wind, dt * .6);
        f.vel.y += Math.sin(f.age * 2.3 + f.seed) * dt * .9 - dt * .25;
        f.m.position.addScaledVector(f.vel, dt);
        f.m.rotateX(f.spin.x * dt); f.m.rotateY(f.spin.y * dt); f.m.rotateZ(f.spin.z * dt);
      }
      const amp = f.free ? .14 : .05;
      for (let j = 0; j < p.count; j++) {
        const x = f.rest[j * 3], y = f.rest[j * 3 + 1];
        let z = Math.sin(x * 2.4 + f.age * 9 + f.seed) * amp * (1 + y / PH * .3) + Math.sin(y * 2.6 + f.age * 6) * amp * .6 * (-y / PH);
        if (!f.free) z = Math.abs(z);                        // while still at the board: bulge outward only
        p.setZ(j, z);
      }
      p.needsUpdate = true;
      f.m.material.opacity = 1 - smooth(4.5, 6.5, f.age);
      if (f.age > 6.5) { scene.remove(f.m); f.m.geometry.dispose(); f.m.material.map.dispose(); f.m.material.dispose(); flyers.splice(i, 1); }
    }
  }

  // ---- the alarm: a new question rings the bell and lights the lantern (the admin can hold it on)
  let alarmLeft = 0, alarmHeld = false, alarmLevel = 0, bellSwing = 0;
  const alarm = {
    trigger() { alarmLeft = 6; bellSwing = 1; },
    hold(on) { alarmHeld = on; if (on) bellSwing = Math.max(bellSwing, .6); },
    update(dt, t) {
      alarmLeft = Math.max(0, alarmLeft - dt);
      const want = alarmLeft > 0 || alarmHeld ? 1 : 0;
      alarmLevel += (want - alarmLevel) * Math.min(1, dt * (want ? 4 : 1.5));
      const breathe = .85 + .15 * Math.sin(t * Math.PI);
      lanternMat.color.setRGB(.35 + alarmLevel * 2.2 * breathe, .25 + alarmLevel * 1.4 * breathe, .1 + alarmLevel * .4);
      lanternLight.intensity = alarmLevel * 5 * breathe;
      bellSwing = Math.max(alarmHeld ? .25 : 0, bellSwing - dt * .35);
      bell.rotation.z = Math.sin(t * 9) * .5 * bellSwing;
    },
  };

  // ============================================================ sky, sun, clouds, birds, smoke
  {
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#4a8cbc'); g.addColorStop(.45, '#78acd0'); g.addColorStop(.78, '#a2c8de'); g.addColorStop(1, '#bcdbe6');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.y = -10; scene.add(sky);
  }
  scene.add(new THREE.HemisphereLight(0xcfe4f4, 0x4a7034, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.1);
  sun.position.set(-30, 45, 30); sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
  sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);
  // a few faceted clouds drifting slowly among the peaks: lumps of white, flat underneath, lit from the sun's side
  const clouds = [];
  {
    const TOP = hex(0xffffff), SIDE = hex(0xe2eaf1), UNDER = hex(0xb8c8d8);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    for (const [nx, ny, z, size] of [[-1.55, .84, -150, 1], [-.7, .89, -165, .8], [.68, .87, -150, .9], [1.45, .83, -140, 1.1], [2.1, .88, -160, .9]]) {
      const parts = [], n = 4 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1) - .5, r = (1.4 + rnd() * .8) * (1.15 - Math.abs(u) * 1.1);
        parts.push(jitter(new THREE.IcosahedronGeometry(r, 1), r * .22).translate(u * n * 1.5, r * .25, (rnd() - .5) * 1.4));
      }
      const g = mergeGeometries(parts);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, 0);           // flat-bottomed, like a fair-weather cloud
      g.computeVertexNormals();
      const nn = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let f = 0; f < p.count; f += 3) {
        const ny2 = nn.getY(f), lit = Math.max(0, nn.getX(f) * SUN_DIR.x + ny2 * SUN_DIR.y + nn.getZ(f) * SUN_DIR.z);
        if (ny2 < -.6) c.copy(UNDER); else c.copy(SIDE).lerp(TOP, Math.min(1, Math.max(0, ny2) * .6 + lit * .5));
        for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, mat);
      const x = xAt(nx, z);
      m.position.set(x, yAt(x, z, ny), z); m.scale.set(4.2 * size, 3 * size, 3 * size);
      scene.add(m); clouds.push(m);
    }
  }
  const birds = [];
  {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .12, 0, 0, -.12, .55, .05, 0], 3));
    wingGeo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a3038, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat); r.scale.x = -1;
      b.add(l, r); scene.add(b);
      birds.push({ b, l, r, cx: (rnd() - .5) * 20, cz: -14 - rnd() * 14, rad: 4 + rnd() * 6, y: 12 + rnd() * 6, sp: .12 + rnd() * .08, ph: rnd() * 6 });
    }
  }
  // chimney smoke: soft puffs that grow, turn and drift off on the breeze, thinning as they go
  const puffTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const cx = 64 + (rnd() - .5) * 46, cy = 64 + (rnd() - .5) * 46, r = 22 + rnd() * 22;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(cv);
  })();
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: puffTex }, uH: { value: renderer.getDrawingBufferSize(new THREE.Vector2()).y } },
    transparent: true, depthWrite: false,
    vertexShader: `attribute float seed; uniform float uTime, uH; varying float vA; varying float vRot; varying float vShade;
      void main(){
        float u = fract(uTime * .045 + seed);
        vec3 p = position;
        p.y += pow(u, .75) * 7.;                                           // rises, slowing as it cools
        p.x += pow(u, 1.6) * 5. + sin(u * 5. + seed * 17.) * .8 * u;         // carried off on the breeze, curling
        p.z += -pow(u, 1.6) * 2.6 + cos(u * 4. + seed * 11.) * .6 * u;
        vA = smoothstep(0., .05, u) * pow(1. - u, 1.5) * .5;
        vRot = seed * 6.28 + u * 1.8;
        vShade = .78 + .22 * u;                                             // a little darker as it leaves the chimney
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        // a puff about half a unit across at the chimney, billowing to three: sized in world units for any screen
        gl_PointSize = (.5 + u * 2.6) * projectionMatrix[1][1] * uH * .5 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA; varying float vRot; varying float vShade;
      void main(){
        vec2 c = gl_PointCoord - .5; float s = sin(vRot), co = cos(vRot);
        vec2 r = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + .5;
        float a = texture2D(uMap, r).a * vA;
        gl_FragColor = vec4(vec3(.93, .94, .95) * vShade, a); }`,
  });
  {
    const PER = 26, N = PER * smokes.length, pos = new Float32Array(N * 3), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) { const s = smokes[i % smokes.length]; pos.set([s.x, s.y, s.z], i * 3); sd[i] = Math.floor(i / smokes.length) / PER + rnd() * .02; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const smoke = new THREE.Points(g, smokeMat); smoke.frustumCulled = false; scene.add(smoke);
  }

  // ============================================================ floating logo + who's on stage (where theme 1 has it)
  const logo = new THREE.Group();
  const LOGO_D = 12;
  {
    const canvas = floatingLogo(logoImg, 1400);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const W = 3.6, H = W * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(W, H);
    const face = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, alphaTest: .5, roughness: .6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .25, side: THREE.DoubleSide }));
    logo.add(face);
    const bo = document.createElement('canvas'); bo.width = canvas.width; bo.height = canvas.height;
    const bx = bo.getContext('2d'); bx.drawImage(canvas, 0, 0); bx.clearRect(0, 0, canvas.width, Math.round(1400 * .02 + 1400 * .07) - 2);
    const edge = new THREE.MeshStandardMaterial({ color: 0x1c140c, alphaMap: new THREE.CanvasTexture(bo), alphaTest: .5, roughness: .8 });
    for (let i = 1; i <= 3; i++) { const m = new THREE.Mesh(geo, edge); m.position.z = -i * .04; logo.add(m); }
    logo.userData.bottom = -H / 2;
    // solve: on the ray through theme 1's logo centre, sized to theme 1's on-screen width, turned toward us
    const T = THEME1.logo;
    const dir = new THREE.Vector3(T.cx, T.cy, .5).unproject(solveCam).sub(solveCam.position).normalize();
    logo.position.copy(solveCam.position).addScaledVector(dir, LOGO_D);
    logo.lookAt(solveCam.position); logo.rotateY(.12);
    logo.updateMatrixWorld(true);
    const a = proj(new THREE.Vector3(-W / 2, 0, 0).applyMatrix4(logo.matrixWorld)), b = proj(new THREE.Vector3(W / 2, 0, 0).applyMatrix4(logo.matrixWorld));
    logo.scale.setScalar(T.w / Math.abs(b.x - a.x));
    scene.add(logo);
  }
  const LOGO_POS = logo.position.clone(), LOGO_Q = logo.quaternion.clone();
  const presenterCanvas = document.createElement('canvas'); presenterCanvas.width = 1400; presenterCanvas.height = 260;
  const presenterTex = new THREE.CanvasTexture(presenterCanvas); presenterTex.colorSpace = THREE.SRGBColorSpace; presenterTex.anisotropy = 8;
  const presenterMat = new THREE.MeshStandardMaterial({ map: presenterTex, transparent: true, depthWrite: false, roughness: .7, emissive: 0xffffff, emissiveMap: presenterTex, emissiveIntensity: .25, opacity: 0 });
  const presenterLabel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6 * 260 / 1400), presenterMat);
  presenterLabel.position.set(0, logo.userData.bottom + .04, .02);
  logo.add(presenterLabel);
  let presenterKey = null, presenterFade = 0, presenterWant = 0;
  function drawPresenter(p) {
    const x = presenterCanvas.getContext('2d');
    x.clearRect(0, 0, 1400, 260);
    if (!p) return;
    x.textBaseline = 'alphabetic';
    x.fillStyle = 'rgb(255,255,255)';
    x.shadowColor = 'rgba(20,40,60,.6)'; x.shadowBlur = 14;
    let size = 112;
    const nm = p.name.toUpperCase();
    x.letterSpacing = '4px';
    do { x.font = `${size}px Anton`; } while (x.measureText(nm).width > 1360 && (size -= 4) > 40);
    x.fillText(nm, 20, 125);
    if (p.title) {
      x.fillStyle = 'rgba(255,255,255,.9)';
      let ts = 56;
      do { x.font = `${ts}px Anton`; } while (x.measureText(p.title).width > 1360 && (ts -= 2) > 24);
      x.letterSpacing = '6px';
      x.fillText(p.title.toUpperCase(), 22, 215);
    }
    presenterTex.needsUpdate = true;
  }

  // ============================================================ zoom: straight in to the sheet
  scene.updateMatrixWorld(true);
  const paperCentre = paper.localToWorld(new THREE.Vector3(0, -PH / 2, 0));
  const boardNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(board.quaternion);
  const FOCUS = { look: paperCentre.clone(), pos: paperCentre.clone().addScaledVector(boardNormal, (PH * boardAt.s) / 2 / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 1.3) };

  // ============================================================ post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .16, .5, .92);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uChroma: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uChroma;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        if (uChroma > .001) {
          vec2 dir = vUv - .5;
          vec2 off = dir * dot(dir, dir) * .045 * uChroma;
          c.r = texture2D(tDiffuse, vUv + off).r;
          c.b = texture2D(tDiffuse, vUv - off).b;
        }
        float l = dot(c.rgb, vec3(.299, .587, .114));
        c.rgb = mix(vec3(l), c.rgb, .9);                              // ease the saturation a little: kinder on the eyes
        c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.01, .97), .5);        // a touch of warm sunshine
        float v = smoothstep(1.25, .45, length((vUv - .5) * vec2(1.05, 1.)));
        c.rgb *= .84 + .16 * v;
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
  let t = 0;

  return {
    onSwitch() {},
    onQuestion() { alarm.trigger(); },
    setAlarm(on) { alarm.hold(on); },
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
      updatePaper(dt);
      alarm.update(dt, t);
      waterMat.uniforms.uTime.value = t;
      smokeMat.uniforms.uTime.value = t;
      for (const c of clouds) { c.position.x += dt * .5; if (c.position.x > 260) c.position.x = -260; }
      for (const b of birds) {
        const a = t * b.sp + b.ph;
        b.b.position.set(b.cx + Math.cos(a) * b.rad, b.y + Math.sin(t * .5 + b.ph) * .5, b.cz + Math.sin(a) * b.rad);
        b.b.rotation.y = -a;
        const flap = Math.sin(t * 7 + b.ph) * .5;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
      const now = new Date();
      const mins = now.getHours() % 12 * 60 + now.getMinutes() + now.getSeconds() / 60;
      clockHands.h.rotation.z = -mins / 720 * Math.PI * 2;
      clockHands.m.rotation.z = -(mins % 60) / 60 * Math.PI * 2;

      // the logo bobs gently, as in theme 1
      logo.position.copy(LOGO_POS); logo.position.y += Math.sin(t * .6) * .12;
      logo.quaternion.copy(LOGO_Q); logo.rotateY(Math.sin(t * .23) * .07); logo.rotateZ(Math.sin(t * .31 + 1) * .015);
      presenterFade += (presenterWant - presenterFade) * Math.min(1, dt * 4);
      presenterMat.opacity = presenterFade;
      presenterLabel.visible = presenterFade > .01;

      const want = tvScreen.focus ? 1 : 0;
      if (want !== zoomTo) { zoomFrom = focus; zoomTo = want; zoomAge = 0; }
      zoomAge += dt;
      focus = zoomFrom + (zoomTo - zoomFrom) * easeInOut(Math.min(1, zoomAge / ZOOM_SECS));
      const drift = 1 - focus * .9;
      camera.position.lerpVectors(HOME.pos, FOCUS.pos, focus);
      camera.position.x += simplex.noise(t * .05, 1) * .3 * drift;
      camera.position.y += simplex.noise(t * .07, 2) * .1 * drift;
      look.lerpVectors(HOME.look, FOCUS.look, focus);
      camera.lookAt(look);

      chroma += (chromaWant - chroma) * Math.min(1, dt * 5);
      grade.uniforms.uChroma.value = chroma * (1 - focus * .9);
      composer.render(dt);
    },

    degrade() { sun.castShadow = false; bloom.enabled = false; },

    resize() {
      frameCamera();
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
      smokeMat.uniforms.uH.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    },

    dispose() {
      for (const f of flyers) scene.remove(f.m);
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [].concat(o.material || [])) {
          for (const val of Object.values(m)) if (val?.isTexture && val !== screenTex) val.dispose();
          m.dispose();
        }
      });
      scene.traverse((o) => { if (o.isLight) o.dispose(); });
      for (const p of composer.passes) p.dispose?.();
      composer.dispose();
    },

    debug: { scene, camera, logo, board, paper },
  };
}
