// Theme 2 — a sunny low-poly alpine valley. Standing on a grassy hill: a turquoise lake below with a little
// wooden bridge, layered pines and round trees, blocky grey cliffs round the valley, misty mountains behind,
// a stone path down to two cabins. The logo floats in the sky, as in theme 1.
// The questions go up on a wooden notice board on the right: one pinned paper at a time (QR code, a question,
// or a partner's logo). When the slideshow moves on, the paper is ripped off its pin and flutters away across
// the valley on the wind, and a fresh one is pinned up. A bell swings and a lantern glows for a new question;
// a little clock sits on the board's roof. Birds circle, clouds drift, chimney smoke rises. Nothing flashes.
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

const HAND = '"Ink Free", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
const SANS = 'Anton, "Arial Black", sans-serif';

export async function create({ renderer, tvScreen, screenTex, logoImg }) {
  const SKY = 0xbfdde6;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 50, 240);

  const BASE_FOV = 45;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, .1, 400);
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
  const HOME = { pos: CAM.clone(), look: new THREE.Vector3(.6, 1.6, -14) };
  camera.position.copy(HOME.pos);

  const GRASS = [0x5cc23c, 0x66cc42, 0x52b636, 0x6fd24a].map(hex);
  const DRY = hex(0xb8b86a), DIRT = hex(0x8a7a4a), SHORE = hex(0x9ac87a);
  {
    // big flat faces: coarse enough that the far slopes stay calm (no fizz of tiny triangles)
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
      // dry, yellowed grass on the high slopes at the back (like the far hill in the reference), a shore by the lake
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
    uniforms: { uTime: { value: 0 }, uFogC: { value: hex(SKY) }, uFogNear: { value: 50 }, uFogFar: { value: 240 } },
    transparent: true,
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: `
      uniform float uTime, uFogNear, uFogFar; uniform vec3 uFogC; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        // flat facets like the land: each little triangle of water gets a gently changing tint and, now and then,
        // a soft glint of sky
        vec2 g = vW.xz / vec2(.55, .8), i = floor(g), f = fract(g);
        float id = h(i + (f.x < f.y ? .5 : 0.));
        float wave = .5 + .5 * sin(uTime * .8 + id * 6.28);
        vec3 deep = vec3(.08, .5, .6), shallow = vec3(.28, .74, .76);
        float edge = smoothstep(4.5, 0., length((vW.xz - vec2(${LAKE.x.toFixed(1)}, ${LAKE.z.toFixed(1)})) / vec2(${LAKE.rx.toFixed(1)}, ${LAKE.rz.toFixed(1)})) * 4.5);
        vec3 col = mix(shallow, deep, edge) * (.92 + .1 * wave);
        col += vec3(.9, .97, 1.) * smoothstep(.92, 1., wave) * step(.8, id) * .35;
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
  const paint = (geo, colour) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    const c = hex(colour), col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 9) { const k = .92 + rnd() * .14; for (let j = 0; j < 9; j += 3) col.set([c.r * k, c.g * k, c.b * k], i + j); }
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

  // ============================================================ trees
  // pine: a trunk and four stacked cone skirts with ragged hems, lighter toward the top (like the reference)
  const pineGeo = (() => {
    const parts = [paint(new THREE.CylinderGeometry(.11, .16, 1.1, 6).translate(0, .55, 0), 0x6a4226)];
    const tiers = [[1.25, 1.35, .95], [1.02, 1.2, 1.6], [.78, 1.1, 2.2], [.5, 1.0, 2.75]];
    const shades = [0x3f9a34, 0x48a83a, 0x55b843, 0x62c84c];
    tiers.forEach(([r, hgt, y], k) => {
      const cone = new THREE.ConeGeometry(r, hgt, 8, 1).toNonIndexed();
      const p = cone.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) {     // ragged hem: the skirt's rim dips and juts
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k2 = 1 + Math.sin(a * 3 + k) * .08;
        p.setXYZ(i, p.getX(i) * k2, p.getY(i) - .08 * Math.abs(Math.sin(a * 4 + k)), p.getZ(i) * k2);
      }
      cone.translate(0, y + hgt / 2 - .2, 0);
      parts.push(paint(cone, shades[k]));
    });
    return solid(parts);
  })();
  // round tree: a trunk and a few chunky leaf balls
  const roundGeo = (() => {
    const parts = [paint(new THREE.CylinderGeometry(.08, .13, 1.6, 5).translate(0, .8, 0), 0x6a4226)];
    for (const [x, y, z, r] of [[0, 2.0, 0, .85], [.45, 1.75, .2, .6], [-.4, 1.8, -.15, .62], [.1, 2.45, -.1, .55]]) {
      parts.push(paint(jitter(new THREE.IcosahedronGeometry(r, 0), .12).translate(x, y, z), rnd() < .5 ? 0x86d04e : 0x7cc646));
    }
    return solid(parts);
  })();
  const pines = [], rounds = [];
  // not in or near the water, not by the board, and the middle of the valley kept open so the lake shows
  const okFor = (x, z) => lakeDist(x, z) > 1.7 && !(Math.abs(x - 5.2) < 3.4 && z > 7 && z < 15) && !(Math.abs(x) < 9 && z > -16 && z < 8);
  const tint = () => new THREE.Color(.88 + rnd() * .2, .9 + rnd() * .18, .86 + rnd() * .14);   // a gentle per-tree variation
  // the foreground framing trees, like the reference: two pines left, a big one right
  for (const [x, z, s] of [[-6.2, 10.8, 1.6], [-4.4, 13.2, 1.3], [11.8, 12.4, 2.5]]) pines.push({ x, z, s });
  // scattered across the slopes and around the lake
  for (let i = 0; i < 170; i++) {
    const x = (rnd() - .5) * 120, z = -48 + rnd() * 62;
    if (!okFor(x, z) || Math.hypot(x, z - 22) < 9) continue;
    const back = z < -20;
    if (rnd() < (back ? .85 : .62)) pines.push({ x, z, s: .7 + rnd() * .9 }); else rounds.push({ x, z, s: .7 + rnd() * .6 });
  }
  for (const [x, z] of [[-9.5, 8], [-12, 4], [9.6, -1], [-10.4, -2.4], [12, -4], [-14, -9], [3.4, 6.2]]) rounds.push({ x, z, s: 1 + rnd() * .4 });
  instanced(pineGeo, vcMat(), pines.map((t) => ({ x: t.x, y: groundY(t.x, t.z) - .1, z: t.z, ry: rnd() * 6, s: t.s, tint: tint() })));
  instanced(roundGeo, vcMat(), rounds.map((t) => ({ x: t.x, y: groundY(t.x, t.z) - .1, z: t.z, ry: rnd() * 6, s: t.s, tint: tint() })));

  // ============================================================ rocks, cliffs, mountains
  const rockGeo = paint(jitter(new THREE.IcosahedronGeometry(1, 0), .35), 0xc8ccd0);
  rockGeo.computeVertexNormals();
  const rocks = [];
  for (const [x, z, s] of [[-7, 6, 1.1], [-2.6, 4.2, .9], [3.6, 3.8, .7], [-8.6, 1, 1.4], [6.4, -1.2, .8], [-4.4, -.4, .9], [1.8, 6.4, 1.3],
    [-13, 9, 1.6], [13, 6, 1.2], [-1.4, -2.6, .7], [8.6, 3.2, .9], [-10.4, -4, 1.1], [2.6, 15.4, .55]]) rocks.push({ x, z, s });
  for (let i = 0; i < 40; i++) { const x = (rnd() - .5) * 90, z = -40 + rnd() * 52; if (lakeDist(x, z) > 1.1 && Math.hypot(x, z - 22) > 8) rocks.push({ x, z, s: .3 + rnd() * .8 }); }
  instanced(rockGeo, vcMat(), rocks.map((r) => ({ x: r.x, y: groundY(r.x, r.z) + r.s * .25, z: r.z, rx: rnd() * 3, ry: rnd() * 6, s: r.s, sy: r.s * .65 })));

  // cliffs: blocky slabs stacked into walls round the back of the valley
  {
    const slabs = [];
    const wall = (x0, x1, z0, z1, h0, h1) => {
      for (let i = 0; i < 22; i++) {
        const u = rnd(), x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u + (rnd() - .5) * 3;
        const w = 4 + rnd() * 6, hh = h0 + rnd() * (h1 - h0), d = 3 + rnd() * 4;
        const g = new THREE.BoxGeometry(w, hh, d, 1, 2, 1);
        jitter(g, .5);
        g.rotateY((rnd() - .5) * .6); g.rotateZ((rnd() - .5) * .08);
        g.translate(x, groundY(x, z) + hh / 2 - 1.2, z);
        slabs.push(paint(g, rnd() < .5 ? 0x8a9196 : 0x7c8388));
      }
    };
    wall(-48, -12, -22, -30, 3.5, 7);
    wall(10, 52, -20, -30, 4, 8);
    wall(-12, 12, -40, -44, 4, 7);
    wall(-60, -40, -8, -16, 5, 9);
    wall(40, 62, -6, -14, 5, 9);
    const m = new THREE.Mesh(solid(slabs), vcMat({ roughness: .85 }));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  // mountains: tall faceted peaks behind everything, softened by the haze
  {
    const peaks = [];
    for (let i = 0; i < 16; i++) {
      const x = -110 + i * 14.5 + (rnd() - .5) * 8, z = -95 - rnd() * 30, r = 16 + rnd() * 14, h = 26 + rnd() * 26;
      const g = new THREE.ConeGeometry(r, h, 6, 3);
      jitter(g, 3.5);
      g.rotateY(rnd() * 3);
      g.translate(x, h / 2 - 4, z);
      peaks.push(paint(g, rnd() < .5 ? 0x8fa6b2 : 0x9ab0ba));
    }
    scene.add(new THREE.Mesh(solid(peaks), vcMat({ roughness: 1 })));
  }

  // ============================================================ reeds, bridge, path, cabins
  {
    const reedGeo = paint(new THREE.ConeGeometry(.05, 1, 3).translate(0, .5, 0), 0x6cb83c);
    const reeds = [];
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2, r = .92 + rnd() * .18;
      const x = LAKE.x + Math.cos(a) * LAKE.rx * r, z = LAKE.z + Math.sin(a) * LAKE.rz * r;
      if (rnd() < .45) continue;
      reeds.push({ x, y: Math.max(WATER_Y, groundY(x, z)) - .05, z, rx: (rnd() - .5) * .3, rz: (rnd() - .5) * .3, s: .7 + rnd() * .7 });
    }
    instanced(reedGeo, vcMat(), reeds);
    // a small wooden footbridge over the lake's near end
    const plank = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: .9, flatShading: true });
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
    // a stone path down the hill from the notice board toward the cabins
    const stone = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: .9, flatShading: true });
    const stoneGeo = new THREE.CylinderGeometry(.42, .46, .14, 6);
    const path = new THREE.CatmullRomCurve3([[5.6, 9.6], [6.4, 6], [7.6, 2.4], [8.2, -1.4], [8, -4.6]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const steps = [];
    for (let i = 0; i <= 26; i++) {
      const p = path.getPointAt(i / 26);
      for (const side of [-.45, .45]) {
        const x = p.x + side + (rnd() - .5) * .3, z = p.z + (rnd() - .5) * .3;
        steps.push({ x, y: groundY(x, z) + .03, z, ry: rnd() * 3, s: .7 + rnd() * .4, sy: 1 });
      }
    }
    const stones = new THREE.InstancedMesh(stoneGeo, stone, steps.length);
    steps.forEach((p, i) => { o3.position.set(p.x, p.y, p.z); o3.rotation.set(0, p.ry, 0); o3.scale.set(p.s, 1, p.s * .8); o3.updateMatrix(); stones.setMatrixAt(i, o3.matrix); });
    stones.receiveShadow = true; scene.add(stones);
  }
  const smokes = [];
  {
    const wall = new THREE.MeshStandardMaterial({ color: 0x8a5232, roughness: .9, flatShading: true });
    const roof = new THREE.MeshStandardMaterial({ color: 0x9a3a28, roughness: .85, flatShading: true });
    for (const [x, z, ry, s] of [[8.6, -7.2, -.4, 1], [11.6, -5.4, -.9, .85], [6.8, -10.4, .2, .75]]) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2), wall); body.position.y = .8; g.add(body);
      // a pitched roof: a triangle pushed out along the cabin's length, overhanging a little
      const gable = new THREE.Shape([new THREE.Vector2(-1.25, 0), new THREE.Vector2(1.25, 0), new THREE.Vector2(0, 1.05)]);
      const rg = new THREE.ExtrudeGeometry(gable, { depth: 3, bevelEnabled: false }); rg.translate(0, 0, -1.5);
      const r = new THREE.Mesh(rg, roof); r.rotation.y = Math.PI / 2; r.position.y = 1.6; g.add(r);
      const chim = new THREE.Mesh(new THREE.BoxGeometry(.35, 1, .35), wall); chim.position.set(.7, 2.5, .4); g.add(chim);
      g.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
      g.position.set(x, groundY(x, z) - .1, z); g.rotation.y = ry; g.scale.setScalar(s);
      scene.add(g);
      g.updateMatrixWorld(true);
      smokes.push(chim.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .5 * s, 0)));
    }
  }

  // ============================================================ the notice board (the question board)
  const BOARD = new THREE.Vector3(5.2, 0, 11.4);
  BOARD.y = groundY(BOARD.x, BOARD.z);
  const board = new THREE.Group();
  board.position.copy(BOARD);
  board.rotation.y = Math.atan2(CAM.x - BOARD.x, CAM.z - BOARD.z);       // facing the viewer
  scene.add(board);
  const BW = 3.3, BH = 2.5, BASE = 1.1;                                     // board size, and its height off the ground
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5634, roughness: .9, flatShading: true });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x6a3e22, roughness: .9, flatShading: true });
  const cork = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192;
    const x = cv.getContext('2d');
    x.fillStyle = '#b07a4a'; x.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#a06c3e' : '#b8824e'; x.fillRect(0, i * 22, 256, 21); }   // planks
    x.fillStyle = 'rgba(60,30,10,.35)'; for (let i = 0; i < 9; i++) x.fillRect(0, i * 22 + 20, 256, 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: .9 });
  })();
  {
    const add = (geo, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; board.add(m); return m; };
    for (const x of [-BW / 2 - .05, BW / 2 + .05]) add(new THREE.CylinderGeometry(.11, .13, BASE + BH + .7, 6), woodDark, x, (BASE + BH + .7) / 2 - .2, -.08);
    add(new THREE.BoxGeometry(BW, BH, .12), cork, 0, BASE + BH / 2, 0);
    // a frame round the board
    add(new THREE.BoxGeometry(BW + .2, .12, .18), wood, 0, BASE + BH + .04, .02);
    add(new THREE.BoxGeometry(BW + .2, .12, .18), wood, 0, BASE - .04, .02);
    for (const x of [-BW / 2 - .02, BW / 2 + .02]) add(new THREE.BoxGeometry(.12, BH, .18), wood, x, BASE + BH / 2, .02);
    // a little pitched roof
    const roofY = BASE + BH + .45;
    add(new THREE.BoxGeometry(BW / 2 + .5, .08, .9), woodDark, -BW / 4 - .1, roofY, .1, .32);
    add(new THREE.BoxGeometry(BW / 2 + .5, .08, .9), woodDark, BW / 4 + .1, roofY, .1, -.32);
  }
  // the clock on the roof's gable
  const clockHands = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d');
    x.fillStyle = '#f4ead2'; x.beginPath(); x.arc(128, 128, 122, 0, 7); x.fill();
    x.strokeStyle = '#5a3a1e'; x.lineWidth = 14; x.stroke();
    x.fillStyle = '#3a2412';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.arc(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96, i % 3 ? 5 : 9, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(.36, 20), new THREE.MeshStandardMaterial({ map: t, roughness: .7 }));
    face.position.set(0, BASE + BH + .55, .14); board.add(face);
    const ink = new THREE.MeshBasicMaterial({ color: 0x2a1a0a });
    const hand = (len, w) => { const g = new THREE.BoxGeometry(w, len, .01); g.translate(0, len / 2, 0); const m = new THREE.Mesh(g, ink); m.position.set(0, BASE + BH + .55, .15); board.add(m); return m; };
    return { h: hand(.18, .035), m: hand(.27, .022) };
  })();
  // a lantern on the left post and a bell under the roof: they come alive for a new question
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.35, .25, .1), toneMapped: false });
  const lanternLight = new THREE.PointLight(0xffb060, 0, 6, 1.6);
  {
    const l = new THREE.Group();
    l.position.set(-BW / 2 - .05, BASE + BH + .05, .25);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(.2, .28, .2), lanternMat); glass.position.y = -.25; l.add(glass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.17, .12, 4), woodDark); cap.position.y = -.05; cap.rotation.y = Math.PI / 4; l.add(cap);
    lanternLight.position.y = -.25; l.add(lanternLight);
    board.add(l);
  }
  const bell = new THREE.Group();
  {
    bell.position.set(0, BASE + BH + .3, .3);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.06, .15, .2, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8a83a, metalness: .8, roughness: .3, side: THREE.DoubleSide, flatShading: true }));
    body.position.y = -.14; bell.add(body);
    const clap = new THREE.Mesh(new THREE.SphereGeometry(.035, 6, 4), woodDark); clap.position.y = -.24; bell.add(clap);
    board.add(bell);
  }

  // ---- the paper: drawn from whatever the TV is showing (the QR, a question, or a partner's logo)
  const PW = 1.85, PH = PW * 1.3;
  const paperCanvas = document.createElement('canvas'); paperCanvas.width = 768; paperCanvas.height = 1000;
  const paperTex = new THREE.CanvasTexture(paperCanvas); paperTex.colorSpace = THREE.SRGBColorSpace; paperTex.anisotropy = 8;
  const INK = '#22263a';
  // the QR, recoloured from the TV's amber to dark ink for paper
  let inkQr = null;
  function getInkQr() {
    if (inkQr || !tvScreen.qr) return inkQr;
    const q = tvScreen.qr, cv = document.createElement('canvas'); cv.width = q.width; cv.height = q.height;
    const x = cv.getContext('2d'); x.drawImage(q, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = INK; x.fillRect(0, 0, cv.width, cv.height);
    return (inkQr = cv);
  }
  function wrap(x, text, maxW) {
    const lines = []; let line = '';
    for (const w of text.split(' ')) { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }
  function drawPaper(item) {
    const x = paperCanvas.getContext('2d');
    const W = 768, H = 1000;
    // aged cream paper with a soft edge
    x.fillStyle = '#f6efdc'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 640);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,90,40,.22)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = INK;
    if (!item) { paperTex.needsUpdate = true; return; }
    if (item.kind === 'qr') {
      const q = getInkQr();
      if (q) { x.imageSmoothingEnabled = false; const s = 600; x.drawImage(q, (W - s) / 2, 110, s, s); x.imageSmoothingEnabled = true; }
      let size = 78; x.font = `${size}px ${SANS}`;
      while (x.measureText(tvScreen.caption).width > W - 90 && size > 30) { size -= 4; x.font = `${size}px ${SANS}`; }
      x.fillText(tvScreen.caption, W / 2, 820);
    } else if (item.kind === 'question') {
      const text = `“${item.m.text}”`;
      let size = 92, lines;
      for (; size >= 40; size -= 4) { x.font = `${size}px ${HAND}`; lines = wrap(x, text, W - 110); if (lines.length * size * 1.15 < 640) break; }
      const top = 420 - (lines.length * size * 1.15) / 2;
      lines.forEach((ln, i) => x.fillText(ln, W / 2, top + i * size * 1.15 + size / 2));
      if (item.m.name) { x.font = `bold 64px ${HAND}`; x.fillStyle = '#7a2a1a'; x.fillText(`— ${item.m.name}`, W / 2, 860); }
    } else if (item.kind === 'partner') {
      const logo = tvScreen.partners[item.i];
      if (logo) { const s = Math.min((W - 120) / logo.width, 420 / logo.height); x.drawImage(logo, (W - logo.width * s) / 2, (H - logo.height * s) / 2, logo.width * s, logo.height * s); }
    }
    paperTex.needsUpdate = true;
  }
  const paperGeo = () => new THREE.PlaneGeometry(PW, PH, 10, 13).translate(0, -PH / 2, 0);   // hangs from its top edge (the pin)
  const PIN_Y = BASE + BH - .2;
  const paper = new THREE.Mesh(paperGeo(), new THREE.MeshStandardMaterial({ map: paperTex, roughness: .85, side: THREE.DoubleSide }));
  paper.position.set(0, PIN_Y, .085); paper.castShadow = true;
  board.add(paper);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xd02a2a, roughness: .4 });
  const pin = new THREE.Mesh(new THREE.SphereGeometry(.055, 8, 6), pinMat); pin.position.set(0, PIN_Y - .06, .13); board.add(pin);
  // a couple of old notes and a torn scrap round the edges, for a lived-in board
  {
    const note = (w, h, x, y, rot, colour) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: colour, roughness: .9 }));
      m.position.set(x, y, .07); m.rotation.z = rot; board.add(m);
      const p = new THREE.Mesh(new THREE.SphereGeometry(.04, 6, 4), pinMat); p.position.set(x, y + h / 2 - .08, .1); board.add(p);
    };
    note(.55, .7, -BW / 2 + .42, BASE + BH - .55, .12, 0xeee4c8);
    note(.5, .4, BW / 2 - .38, BASE + .45, -.1, 0xf2e8b0);
    note(.42, .55, BW / 2 - .36, BASE + BH - .5, -.06, 0xe8eef2);
  }
  const scrap = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-.14, 0), new THREE.Vector2(.16, 0), new THREE.Vector2(.04, -.17)])),
    new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: .9, side: THREE.DoubleSide }));
  scrap.position.set(0, PIN_Y + .02, .08); scrap.visible = false; board.add(scrap);

  // ---- ripping: the old paper is copied into a flyer that tears off the pin and blows away; a fresh one goes up
  const flyers = [];
  const wind = new THREE.Vector3(2.6, .9, -1.6);           // toward the lake, a little up
  function ripOff() {
    const snap = document.createElement('canvas'); snap.width = paperCanvas.width; snap.height = paperCanvas.height;
    snap.getContext('2d').drawImage(paperCanvas, 0, 0);
    const t = new THREE.CanvasTexture(snap); t.colorSpace = THREE.SRGBColorSpace;
    const geo = paperGeo();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: .85, side: THREE.DoubleSide, transparent: true }));
    board.updateMatrixWorld(true);
    paper.getWorldPosition(m.position); paper.getWorldQuaternion(m.quaternion);
    scene.add(m);
    flyers.push({ m, age: 0, rest: Float32Array.from(geo.attributes.position.array), vel: new THREE.Vector3(), spin: new THREE.Vector3((rnd() - .5) * 2, (rnd() - .5) * 3, (rnd() - .5) * 2.5), seed: rnd() * 10 });
    scrap.visible = true;
  }
  let pinIn = 1;                                           // 0..1: the fresh paper settling onto its pin
  let shownKey = null;
  function keyOf(cur) { return cur ? `${cur.kind}|${cur.i ?? ''}|${cur.m?.id ?? ''}|${cur.m?.text ?? ''}` : 'none'; }
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
    paper.rotation.z = (1 - e) * .18;
    paper.position.z = .085 + (1 - e) * .15;
    paper.scale.setScalar(.94 + .06 * e);
    paper.material.opacity = 1;
    // flyers: a tug and a tear first, then away on the wind, tumbling and fluttering
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.age += dt;
      const p = f.m.geometry.attributes.position;
      if (f.age < .35) {
        // the tug: the bottom lifts toward us, the paper strains against the pin
        const u = f.age / .35;
        f.m.rotateX(-dt * 2.2 * (1 - u)); f.m.rotateZ(dt * .8);
      } else {
        if (!f.free) { f.free = true; f.vel.copy(wind).multiplyScalar(.5).add(new THREE.Vector3(0, 1.2, .8)); }
        f.vel.addScaledVector(wind, dt * .6);
        f.vel.y += Math.sin(f.age * 2.3 + f.seed) * dt * .9 - dt * .25;          // floats, bobbing, sinking slowly
        f.m.position.addScaledVector(f.vel, dt);
        f.m.rotateX(f.spin.x * dt); f.m.rotateY(f.spin.y * dt); f.m.rotateZ(f.spin.z * dt);
      }
      // flutter: a travelling wave through the sheet, stronger once it's free
      const amp = f.free ? .14 : .05;
      for (let j = 0; j < p.count; j++) {
        const x = f.rest[j * 3], y = f.rest[j * 3 + 1];
        p.setZ(j, Math.sin(x * 2.6 + f.age * 9 + f.seed) * amp * (1 - y / -PH * .3) + Math.sin(y * 2.2 + f.age * 6) * amp * .6 * (-y / PH));
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
    // a soft gradient dome: deeper blue overhead, pale and hazy at the horizon
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 256;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#6aa8cc'); g.addColorStop(.55, '#a6cfe0'); g.addColorStop(.8, '#cfe6ec'); g.addColorStop(1, '#d8eceb');
    x.fillStyle = g; x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.position.y = -10; scene.add(sky);
  }
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a8a3a, 1.35));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sun.position.set(-30, 45, 30); sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 140 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
  sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true;          // static scene: render the shadow map once
  scene.add(sun, sun.target);
  const clouds = [];
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: .92, fog: false });
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(3 + rnd() * 3, 0), 1), mat);
        b.position.set((k - 1.5) * 4 + rnd() * 2, rnd() * 1.5, rnd() * 2); b.scale.y = .55; g.add(b);
      }
      g.position.set(-120 + i * 34 + rnd() * 10, 48 + rnd() * 14, -150 - rnd() * 40);
      scene.add(g); clouds.push(g);
    }
  }
  // birds: little Vs circling slowly over the valley, wings beating
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
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute float seed; uniform float uTime; varying float vA;
      void main(){ float u = fract(uTime * .06 + seed); vec3 p = position;
        p.y += u * 5.; p.x += u * u * 2.5 + sin(u * 6. + seed * 9.) * .3; vA = sin(u * 3.14159) * .45;
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = (60. + u * 220.) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, 0., d) * vA; gl_FragColor = vec4(vec3(.92, .94, .96), a); }`,
  });
  {
    const N = 14 * smokes.length, pos = new Float32Array(N * 3), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) { const s = smokes[i % smokes.length]; pos.set([s.x, s.y, s.z], i * 3); sd[i] = i / 14 + rnd() * .1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    scene.add(new THREE.Points(g, smokeMat));
  }

  // ============================================================ floating logo + who's on stage (as in theme 1)
  const logo = new THREE.Group();
  {
    const canvas = floatingLogo(logoImg, 1400);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const W = 3.6, H = W * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(W, H);
    logo.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, alphaTest: .5, roughness: .6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: .25, side: THREE.DoubleSide })));
    const bo = document.createElement('canvas'); bo.width = canvas.width; bo.height = canvas.height;
    const bx = bo.getContext('2d'); bx.drawImage(canvas, 0, 0); bx.clearRect(0, 0, canvas.width, Math.round(1400 * .02 + 1400 * .07) - 2);
    const edge = new THREE.MeshStandardMaterial({ color: 0x1c140c, alphaMap: new THREE.CanvasTexture(bo), alphaTest: .5, roughness: .8 });
    for (let i = 1; i <= 3; i++) { const m = new THREE.Mesh(geo, edge); m.position.z = -i * .04; logo.add(m); }
    logo.position.set(-4.1, 8.4, 9.2);
    logo.rotation.y = .16;
    scene.add(logo);
    logo.userData.bottom = -H / 2;
  }
  const LOGO_Y = logo.position.y;
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
    x.shadowColor = 'rgba(20,40,60,.55)'; x.shadowBlur = 14;
    let size = 112;
    const nm = p.name.toUpperCase();
    x.letterSpacing = '4px';
    do { x.font = `${size}px Anton`; } while (x.measureText(nm).width > 1360 && (size -= 4) > 40);
    x.fillText(nm, 20, 125);
    if (p.title) {
      x.fillStyle = 'rgba(255,255,255,.88)';
      let ts = 56;
      do { x.font = `${ts}px Anton`; } while (x.measureText(p.title).width > 1360 && (ts -= 2) > 24);
      x.letterSpacing = '6px';
      x.fillText(p.title.toUpperCase(), 22, 215);
    }
    presenterTex.needsUpdate = true;
  }

  // ============================================================ zoom: straight in to the paper
  scene.updateMatrixWorld(true);
  const paperCentre = paper.localToWorld(new THREE.Vector3(0, -PH / 2, 0));
  const boardNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(board.quaternion);
  const FOCUS = { look: paperCentre.clone(), pos: paperCentre.clone().addScaledVector(boardNormal, PH / 2 / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 1.25) };

  // ============================================================ post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .18, .5, .92);
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
        c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.02, .97), .6);       // a touch of warm sunshine
        float v = smoothstep(1.25, .45, length((vUv - .5) * vec2(1.05, 1.)));
        c.rgb *= .82 + .18 * v;
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
      for (const [i, c] of clouds.entries()) { c.position.x += dt * (.4 + i * .05); if (c.position.x > 160) c.position.x = -160; }
      for (const b of birds) {
        const a = t * b.sp + b.ph;
        b.b.position.set(b.cx + Math.cos(a) * b.rad, b.y + Math.sin(t * .5 + b.ph) * .5, b.cz + Math.sin(a) * b.rad);
        b.b.rotation.y = -a;
        const flap = Math.sin(t * 7 + b.ph) * .5;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
      // the clock on the board
      const now = new Date();
      const mins = now.getHours() % 12 * 60 + now.getMinutes() + now.getSeconds() / 60;
      clockHands.h.rotation.z = -mins / 720 * Math.PI * 2;
      clockHands.m.rotation.z = -(mins % 60) / 60 * Math.PI * 2;

      logo.position.y = LOGO_Y + Math.sin(t * .6) * .12;
      logo.rotation.y = .16 + Math.sin(t * .23) * .07;
      logo.rotation.z = Math.sin(t * .31 + 1) * .015;
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

    debug: { scene, camera, logo },
  };
}
