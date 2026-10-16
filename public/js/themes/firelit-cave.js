// Theme 1 — the firelit cave.
// Composition follows the reference painting: a stalactite mass top-left, a rock column left and a big ivy-topped
// pillar right framing a bright opening with distant rock spires, light shafts from the roof, a shallow water channel,
// rock clusters in both foreground corners, a dead branch and grass tufts.
// Lighting is the warm firelit treatment: a campfire as the key light, warm haze and a sunset glow beyond the opening.
// The logo floats over the water; the TV carries the live questions + QR.
// Ambient life (ducks, a passing pirate ship, jumping fish) comes from ./cave-life.js.
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floatingLogo, grainCanvas } from '../wall-art.js';
import { makeTV } from '../tv.js';
import { makeBeacon } from '../beacon.js';
import { makeFire } from '../fire.js';
import { createLife } from './cave-life.js';
import { makeTreasure } from './treasure.js';

export const name = 'Firelit cave';

/** Builds the theme. The renderer, TV screen content and live connection are shared and owned by main.js. */
export async function create({ renderer, tvScreen, screenTex, logoImg }) {
  const FOG = 0x5a3b28;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, .034);

  const BASE_FOV = 45;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, .1, 120);
  // framing is designed for 16:9; on narrower screens widen the vertical FOV so nothing is cropped at the sides
  function frameCamera() {
    camera.aspect = innerWidth / innerHeight;
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 16 / 9);
    camera.fov = camera.aspect >= 16 / 9 ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / camera.aspect));
    camera.updateProjectionMatrix();
  }
  frameCamera();
  const HOME = { pos: new THREE.Vector3(0, 2.1, 12), look: new THREE.Vector3(-.4, 2.7, -10) };
  camera.position.copy(HOME.pos);

  // ============================================================ helpers
  const simplex = new SimplexNoise();
  const fbm = (x, y, z) => {
    let v = 0, a = 1, f = 1;
    for (let i = 0; i < 4; i++) { v += a * simplex.noise3d(x * f, y * f, z * f); a *= .5; f *= 2.13; }
    return v;
  };
  const hash = (x) => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  // floor: a water channel from the opening toward camera, opening onto a muddy foreground with puddles
  const groundY = (x, z) => {
    const cx = mix(-1.2, .4, smooth(-8, 6, z));          // channel drifts right as it nears camera
    const bank = smooth(mix(5, 2.4, smooth(-4, 4, z)), mix(9, 4.4, smooth(-4, 4, z)), Math.abs(x - cx));
    const fore = smooth(2.5, 6.5, z);
    return mix(-.45 + bank * 1.1, .07, fore) + fbm(x * .3, z * .3, 7) * .17;
  };

  // ---- painted rock: one flat warm colour per face, multiplied by a painterly grain texture
  const hex = (h) => new THREE.Color(h);
  const SIDE = [0x7a5a46, 0x8a6650, 0x6a4c3b, 0x96705a, 0x5e4334].map(hex);
  const MOSS = [0x6e6a3c, 0x7c7646, 0x62603a].map(hex);
  const WET = hex(0x261a14);

  function paintRock(geo, { moss = .5, seed = 1, wetLine = .4 } = {}) {
    geo = geo.index ? geo.toNonIndexed() : geo;
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal;
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let f = 0; f < p.count; f += 3) {
      const ny = (n.getY(f) + n.getY(f + 1) + n.getY(f + 2)) / 3;
      const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
      const r = hash(f * .731 + seed * 17.3);
      if (ny > .6 && r < moss) c.copy(MOSS[(r * 31 | 0) % MOSS.length]);
      else c.copy(SIDE[(r * 53 | 0) % SIDE.length]);
      c.multiplyScalar(.8 + ny * .3 + (hash(f * 1.31 + seed) - .5) * .12);
      c.lerp(WET, smooth(wetLine, wetLine - .8, y) * .75);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  const grain = new THREE.CanvasTexture(grainCanvas(512));
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, flatShading: true, roughness: .92, metalness: 0 });
  // Static rock is collected by shadow role and merged into one mesh per role at the end (flushRocks),
  // so ~80 rocks cost 3 draw calls. keep: true returns a real mesh now (needed for raycasting).
  const rockBuckets = new Map();
  function addRock(geo, opts, { cast = true, receive = true, keep = false } = {}) {
    const painted = paintRock(geo, opts);
    if (keep) {
      const m = new THREE.Mesh(painted, rockMat);
      m.castShadow = cast; m.receiveShadow = receive;
      scene.add(m);
      return m;
    }
    const key = `${cast}|${receive}`;
    if (!rockBuckets.has(key)) rockBuckets.set(key, []);
    rockBuckets.get(key).push(painted);
    return null;
  }
  function flushRocks() {
    for (const [key, geos] of rockBuckets) {
      const [cast, receive] = key.split('|').map((v) => v === 'true');
      const merged = mergeGeometries(geos.map((g) => { for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n); return g; }));
      geos.forEach((g) => g.dispose());
      const m = new THREE.Mesh(merged, rockMat);
      m.castShadow = cast; m.receiveShadow = receive;
      m.matrixAutoUpdate = false;
      scene.add(m);
    }
    rockBuckets.clear();
  }

  // chunky boulder with big flat planes (low detail = the reference's bevelled slabs)
  function boulderGeo(size, pos, rotY = 0, seed = 1, detail = 1, amp = .22) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + fbm(v.x * .9 + seed, v.y * .9, v.z * .9) * amp);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.scale(...size); g.rotateY(rotY); g.translate(...pos);
    return g;
  }
  const boulder = (size, pos, rotY, seed, o) => addRock(boulderGeo(size, pos, rotY, seed), o);

  // rock column, floor to roof; `lean` tilts it, `waist` pinches the middle
  function pillar(x, z, r, h, seed, { lean = 0, waist = .15, moss = .7 } = {}) {
    const g = new THREE.CylinderGeometry(r * .85, r * 1.3, h, 7, 7);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const t = py / h + .5;
      const k = (1 + fbm(px * .45 + seed, py * .3, pz * .45) * .3) * (1 - waist * Math.sin(t * Math.PI));
      p.setXYZ(i, px * k + Math.sin(py * .25 + seed) * .4 + lean * t * h * .1, py, pz * k);
    }
    g.translate(x, h / 2 - .7, z);
    return addRock(g, { seed, moss });
  }

  function stalactite(x, yTop, z, len, r, seed) {
    const g = new THREE.ConeGeometry(r, len, 6, 3);
    g.rotateX(Math.PI);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const k = 1 + simplex.noise3d(px * 2 + seed, py * .8, pz * 2) * .28;
      p.setXYZ(i, px * k + Math.sin(py * .6 + seed) * .15, py, pz * k);
    }
    g.rotateY(seed);
    g.translate(x, yTop - len / 2, z);
    return addRock(g, { seed, moss: .15, wetLine: -99 });
  }

  function sheet(w, h, sx, sy, amp, freq, seed, matrix, keepFace = null) {
    const g = new THREE.PlaneGeometry(w, h, sx, sy);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const ridge = 1 - Math.abs(simplex.noise3d(x * freq * .6, y * freq * .6, seed + 9));
      p.setZ(i, (fbm(x * freq, y * freq, seed) * .8 + ridge * .6) * amp);
    }
    if (keepFace) {
      const idx = g.index.array, keep = [];
      for (let i = 0; i < idx.length; i += 3) {
        const cx = (p.getX(idx[i]) + p.getX(idx[i + 1]) + p.getX(idx[i + 2])) / 3;
        const cy = (p.getY(idx[i]) + p.getY(idx[i + 1]) + p.getY(idx[i + 2])) / 3;
        if (keepFace(cx, cy)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
      }
      g.setIndex(keep);
    }
    g.applyMatrix4(matrix);
    return g;
  }
  const M = (pos, rot) => new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));

  // ============================================================ the opening + what's beyond it
  const MOUTH = { x: -2.2, y: 2.4, z: -26 };
  function skyCanvas() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#c9874e'); g.addColorStop(.55, '#ffd49a'); g.addColorStop(1, '#e7a868');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    // karst spires, far to near
    const spires = (n, base, hMin, hMax, wMin, wMax, color, seed) => {
      x.fillStyle = color;
      for (let i = 0; i < n; i++) {
        const cx = hash(i + seed) * 1024, w = mix(wMin, wMax, hash(i * 3 + seed)), h = mix(hMin, hMax, hash(i * 7 + seed));
        x.beginPath();
        x.moveTo(cx - w / 2, base);
        x.lineTo(cx - w * .42, base - h * .7);
        x.lineTo(cx - w * .25, base - h);
        x.lineTo(cx + w * .3, base - h * .96);
        x.lineTo(cx + w * .45, base - h * .6);
        x.lineTo(cx + w / 2, base);
        x.fill();
      }
    };
    spires(10, 420, 140, 260, 50, 110, '#d49a68', 1);
    spires(7, 440, 120, 220, 60, 120, '#a8704a', 2);
    x.fillStyle = '#6e4430';
    for (let i = 0; i < 46; i++) {
      const px = i * 23 + hash(i) * 12, r = 22 + hash(i + 9) * 26;
      x.beginPath(); x.arc(px, 452 - hash(i + 4) * 26, r, 0, 6.283); x.fill();
    }
    x.fillRect(0, 452, 1024, 60);
    return c;
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas());
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(64, 32), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
  sky.material.color.setScalar(.95);
  sky.position.set(MOUTH.x, 10.7, -46);   // puts the spires' base just above the water line
  scene.add(sky);

  const inMouth = (x, y) => {
    const jag = simplex.noise(x * .45, y * .45) * .5;
    const hw = y > .6 ? 5 * Math.sqrt(Math.max(0, 1 - ((y - .6) / 6.2) ** 2)) : 5 + (.6 - y) * .4;
    return Math.abs(x - MOUTH.x) < hw + jag && y < 6.8;
  };
  addRock(sheet(56, 30, 150, 80, 1.6, .22, 3, M([0, 9, MOUTH.z], [0, 0, 0]), (x, y) => !inMouth(x, y + 9)), { seed: 3, moss: .4 }, { cast: false });
  // fringe of small stalactites along the opening's lintel, rocks inside the opening
  [[-6.2, 2.0], [-4.6, 1.4], [-3.1, 2.4], [-1.6, 1.6], [0, 2.1], [1.5, 1.2], [2.6, 1.8]].forEach(([dx, len], i) =>
    stalactite(MOUTH.x + dx + 2.1, 9.6, MOUTH.z + 1.2, len + 1.6, .55, 200 + i));
  // jamb rocks hide the cut edge of the opening
  boulder([2.2, 5.2, 1.8], [MOUTH.x - 5.6, 1.6, MOUTH.z + 1.6], .3, 36);
  boulder([2.0, 4.6, 1.8], [MOUTH.x + 5.4, 1.2, MOUTH.z + 1.8], -.5, 37);
  boulder([4.6, 1.5, 1.6], [MOUTH.x + .4, 7.6, MOUTH.z + 1.9], .1, 38);
  boulder([1.6, 1.1, 1.2], [MOUTH.x - 2.8, -.2, MOUTH.z - 1], .2, 33);
  boulder([2.0, .8, 1.3], [MOUTH.x + 2.4, -.25, MOUTH.z - 2], .5, 34);
  boulder([1.0, .5, .9], [MOUTH.x - .2, -.3, MOUTH.z + 2.5], 0, 35);

  // ============================================================ cave shell
  addRock(sheet(50, 20, 50, 20, 2.2, .2, 4, M([-14, 7, -6], [0, Math.PI / 2 - .1, 0])), { seed: 4, moss: .4 }, { cast: false });
  addRock(sheet(50, 20, 50, 20, 2.2, .2, 5, M([13, 7, -6], [0, -Math.PI / 2 + .1, 0])), { seed: 5, moss: .4 }, { cast: false });
  addRock(sheet(56, 50, 56, 50, 2.6, .18, 6, M([0, 12, -8], [Math.PI / 2, 0, 0])), { seed: 6, moss: .05, wetLine: -99 }, { cast: false, receive: false });

  // columns: left one mid-ground, big leaning one right foreground, hazy ones behind
  pillar(-7.2, -12, 2.5, 15, 11, { lean: .4, waist: .25 });
  pillar(3.3, -2.2, 2.2, 15, 12, { lean: -.5, waist: .3, moss: .85 });
  pillar(-12.5, -19, 2.2, 15, 13, {});
  pillar(8.5, -15, 2.6, 15, 14, {});
  pillar(10.5, -5, 2.0, 15, 15, {});

  // rock piles at the column feet
  boulder([2.2, 1.6, 1.8], [-6.0, .3, -9.6], .3, 41);
  boulder([1.4, 1.0, 1.2], [-4.6, -.1, -10.6], 1.2, 42);
  boulder([2.4, 2.0, 2.0], [2.0, .2, -.6], .5, 43);
  boulder([1.3, .9, 1.1], [.9, -.2, .9], 1.4, 44);
  boulder([1.6, 1.3, 1.4], [5.0, .3, -.4], 2.1, 45);

  // foreground left cluster
  boulder([1.8, 1.6, 1.5], [-6.9, .5, 3.4], .4, 21);
  boulder([1.4, 1.2, 1.3], [-5.1, .1, 4.2], 1.1, 22);
  boulder([1.2, 2.0, 1.1], [-7.8, 1.6, 1.6], 2.0, 23);
  boulder([1.0, .8, .9], [-4.2, -.2, 2.8], .7, 24);
  boulder([1.6, .9, 1.2], [-6.4, -.2, 6.8], 1.7, 25);

  // foreground right cluster
  boulder([1.8, 2.4, 1.6], [6.6, .8, 4.6], -.3, 26);
  boulder([1.3, 1.6, 1.2], [7.2, 2.6, 3.6], .8, 27);
  boulder([1.5, .9, 1.3], [6.0, -.1, 7.6], .7, 28);

  // stepping stones in the channel
  boulder([.9, .25, .5], [-1.3, -.36, -4.5], 0, 29);
  boulder([.6, .22, .4], [-.2, -.38, -9.5], 0, 30);

  // stalactite mass top-left, a few on the right
  const STALACTITES = [
    [-8.6, 12, 1.0, 7.4, 2.4], [-6.4, 12, 2.2, 6.4, 1.8], [-4.4, 12, 3.4, 5.0, 1.3], [-2.9, 12, 1.2, 4.6, 1.0],
    [-5.4, 12, -.8, 5.8, 1.5], [-1.4, 12.2, -1.8, 3.6, .9], [-3.6, 12.2, -5.5, 4.0, 1.1],
    [6.2, 12, 2.0, 4.2, 1.4], [8.2, 12, -1.0, 5.6, 1.8], [4.6, 12.3, -6.5, 3.2, .9],
    [-9.5, 12, -8, 6.0, 1.8], [1.0, 12.4, -10, 2.6, .7],
  ];
  STALACTITES.forEach(([x, y, z, len, r], i) => stalactite(x, y, z, len, r, 90 + i));

  // ============================================================ floor + water
  {
    const g = new THREE.PlaneGeometry(50, 64, 100, 128);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    const geo = g.toNonIndexed();
    geo.computeVertexNormals();
    const gp = geo.attributes.position, col = new Float32Array(gp.count * 3), c = new THREE.Color();
    const MUD = hex(0x3a2a20), BANK = hex(0x5c4433);
    for (let f = 0; f < gp.count; f += 3) {
      const y = (gp.getY(f) + gp.getY(f + 1) + gp.getY(f + 2)) / 3;
      const r = hash(f * .37);
      c.copy(MUD).lerp(BANK, smooth(.05, .6, y));
      if (y > .45 && r < .3) c.lerp(MOSS[(r * 17 | 0) % 3], .5);
      c.multiplyScalar(.9 + (r - .5) * .14);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const floor = new THREE.Mesh(geo, rockMat);
    floor.name = 'floor';
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // ---- water: low-poly like the rocks. The surface is cut into flat triangles that tilt with slow waves;
  // each takes one warm cave colour, and triangles turned toward the opening, the fire or the TV flare in that
  // light's colour. No mirror pass. Shallows and the shoreline come from a depth map baked from groundY.
  const WATER = { x0: -25, z0: -44, w: 50, d: 64 };
  const depthTex = (() => {
    const W = 256, H = 328, data = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = WATER.x0 + (i + .5) / W * WATER.w, z = WATER.z0 + (j + .5) / H * WATER.d;
      const depth = Math.max(0, Math.min(1, -groundY(x, z) / .55));   // 0 = shoreline, 1 = deep
      data.set([depth * 255, 0, 0, 255], (j * W + i) * 4);
    }
    const t = new THREE.DataTexture(data, W, H);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  })();
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uDepth: { value: depthTex }, uTime: { value: 0 },
      uArea: { value: new THREE.Vector4(WATER.x0, WATER.z0, WATER.w, WATER.d) },
      // hues picked to sit with the firelit rock (rendered rock measures ~18° hue, ~.75 saturation)
      uDeep: { value: hex(0x2a1006) }, uShallow: { value: hex(0x5c2a12) }, uFoam: { value: hex(0xa65a36) },
      uHaze: { value: hex(0x7a3a1c) }, uFog: { value: hex(FOG) }, uFogD: { value: .034 },
      // lights the water "reflects": position + colour (filled in once the fire and TV exist)
      uMouthPos: { value: new THREE.Vector3(MOUTH.x, 3.2, MOUTH.z - 8) }, uMouthCol: { value: new THREE.Color(1.0, .5, .2) },
      uFirePos: { value: new THREE.Vector3() }, uFireCol: { value: new THREE.Color(1, .38, .08).multiplyScalar(1.4) },
      uTvPos: { value: new THREE.Vector3() }, uTvCol: { value: new THREE.Color(1, .5, .16).multiplyScalar(.8) },
      uFire: { value: 1 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uDepth; uniform vec4 uArea; uniform float uTime, uFogD, uFire;
      uniform vec3 uDeep, uShallow, uFoam, uHaze, uFog;
      uniform vec3 uMouthPos, uMouthCol, uFirePos, uFireCol, uTvPos, uTvCol;
      varying vec3 vWorld;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      // directional wave: (height, d/dx, d/dz)
      vec3 wave(vec2 p, vec2 dir, float freq, float speed, float amp, float warp) {
        float ph = dot(p, dir) * freq - uTime * speed + warp;
        return vec3(amp * sin(ph), amp * freq * cos(ph) * dir);
      }
      vec3 waves(vec2 p, float warp) {
        return wave(p, normalize(vec2(.35, 1.)), 2.4, 1.0, .05, warp)
             + wave(p, normalize(vec2(-.7, .8)), 3.1, .8, .035, warp * .7)
             + wave(p, normalize(vec2(.9, .45)), 5.3, 1.6, .018, warp * .4);
      }
      // how strongly a facet (reflection R) points at a light
      float toward(vec3 R, vec3 from, vec3 lightPos, float sharp) {
        return pow(max(dot(R, normalize(lightPos - from)), 0.), sharp);
      }
      void main() {
        vec2 w = vWorld.xz;
        float t = uTime;
        float depth = texture2D(uDepth, (w - uArea.xy) / uArea.zw).r;   // 0 shore .. 1 deep
        float deep = smoothstep(.0, .45, depth);

        // low-poly facets, like the rocks: snap to a triangle grid (stretched along the flow) and shade
        // each triangle with one flat colour, using the waves at its centre
        vec2 S = vec2(.42, .62);
        vec2 g = w / S, i = floor(g), f = fract(g);
        bool upper = f.x < f.y;
        vec2 cen = (i + (upper ? vec2(1. / 3., 2. / 3.) : vec2(2. / 3., 1. / 3.))) * S;
        float id = hash(i + (upper ? vec2(.5) : vec2(0.)));
        float warp = vnoise(cen * .4 + vec2(0., -t * .07)) * 2.4;
        vec3 h = waves(cen, warp);
        float calm = (.35 + .65 * deep) * 1.4;
        vec3 N = normalize(vec3(-h.y * calm, 1., -h.z * calm));
        vec3 P = vec3(cen.x, 0., cen.y);
        vec3 V = normalize(cameraPosition - P);
        vec3 R = reflect(-V, N);

        // flat painted facet: wet browns from the cave palette, a touch lighter where it tilts to the light
        vec3 base = mix(uShallow, uDeep, deep);
        float lit = smoothstep(.975, 1., dot(N, normalize(vec3(-.25, 1., .45))));
        vec3 col = base * (.86 + .22 * lit) * (.95 + id * .1);

        // facets turned toward a light flare in that light's colour (whole triangles, like sparkles)
        // sharp exponents: only a scattering of triangles catch the light at any moment
        float m = toward(R, P, uMouthPos, 110.);
        float fi = toward(R, P, uFirePos, 70.) * smoothstep(9., 1.5, length(uFirePos.xz - cen));
        float tv = toward(R, P, uTvPos, 90.) * smoothstep(7., 1., length(uTvPos.xz - cen));
        col += uMouthCol * m * .22 + uFireCol * fi * .3 * uFire + uTvCol * tv * .22;

        // far water melts into the warm haze
        float far = smoothstep(4., 26., length(vWorld - cameraPosition));
        col = mix(col, uHaze * .45, far * .25);

        // shoreline: a faint band that laps in and out
        float lap = sin(t * .9 + w.x * 1.1 + w.y * .7) * .025;
        float breakup = vnoise(w * 3.2 + vec2(0., t * .25));
        float foam = smoothstep(.05, .0, depth + lap * .6 + (breakup - .5) * .05);
        float edge = smoothstep(.02, .0, abs(depth - .09 - lap)) * smoothstep(.45, .8, breakup);
        col = mix(col, uFoam, clamp(foam * .3 + edge * .16, 0., .4));

        float d = length(vWorld - cameraPosition);
        col = mix(col, uFog, 1. - exp(-uFogD * uFogD * d * d));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WATER.w, WATER.d, 1, 1), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0, -12);
  scene.add(water);

  // ============================================================ dead branch + grass tufts
  {
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: .9, flatShading: true });
    const limb = (pts, r) => {
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 10, r, 5), wood);
      m.castShadow = true; scene.add(m);
    };
    limb([[1.4, -.3, 2.4], [2.0, .5, 2.0], [2.5, 1.3, 1.4], [3.4, 2.4, .6]], .07);
    limb([[2.0, .5, 2.0], [1.4, 1.2, 1.8], [1.0, 1.5, 1.6]], .04);
    limb([[2.5, 1.3, 1.4], [3.0, 1.0, 2.0], [3.6, 1.2, 2.4], [4.1, .9, 2.6]], .045);
    limb([[1.6, -.2, 2.9], [2.4, -.15, 3.6], [3.4, -.25, 3.9]], .06);
  }
  {
    const blade = new THREE.ConeGeometry(.035, .6, 3);
    blade.translate(0, .3, 0);
    const tufts = [[-3.9, 2.6], [-2.6, -9.8], [.4, -1.0], [1.6, .4], [4.4, 3.4], [-4.8, 4.8], [5.3, 6.6], [-1.6, -4.6]];
    const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: 0x8a8a3c, roughness: .8, flatShading: true }), tufts.length * 14);
    const o = new THREE.Object3D(), c = new THREE.Color();
    let i = 0;
    for (const [x, z] of tufts) {
      for (let b = 0; b < 14; b++, i++) {
        o.position.set(x + (Math.random() - .5) * .35, Math.max(0, groundY(x, z)) - .02, z + (Math.random() - .5) * .35);
        o.rotation.set((Math.random() - .5) * .9, Math.random() * 6.28, (Math.random() - .5) * .9);
        o.scale.set(1, .6 + Math.random() * .9, 1);
        o.updateMatrix();
        grass.setMatrixAt(i, o.matrix);
        grass.setColorAt(i, c.setHSL(.17 + Math.random() * .05, .4, .3 + Math.random() * .15));
      }
    }
    scene.add(grass);
  }

  // ============================================================ light shafts + dust
  const RAY_TOP = new THREE.Vector3(-.2, 12.5, -8), RAY_DIR = new THREE.Vector3(-.3, -1, -.12).normalize();
  const rayMat = (seed, alpha) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uAlpha: { value: alpha } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uTime, uSeed, uAlpha;
      void main(){
        float across = smoothstep(0., .9, 1. - abs(vUv.x - .5) * 2.);
        float along = smoothstep(0., .5, vUv.y) * (.3 + .7 * vUv.y);
        float breathe = .75 + .25 * sin(uTime * .35 + uSeed * 3.1 + vUv.y * 2.5);
        gl_FragColor = vec4(vec3(1., .82, .58) * across * along * breathe * uAlpha, 1.);
      }`,
  });
  const rays = [];
  [[0, 2.4, .13], [-1.3, 1.4, .09], [1.2, 1.8, .1], [-.5, .9, .07], [2.2, 1.1, .06]].forEach(([off, w, a], i) => {
    const len = 16;
    const top = RAY_TOP.clone().add(new THREE.Vector3(off, 0, off * .3));
    for (const turn of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), rayMat(i, a));
      m.position.copy(top).addScaledVector(RAY_DIR, len / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), RAY_DIR.clone().negate());
      m.rotateY(turn + .4);
      m.renderOrder = 3;
      scene.add(m); rays.push(m);
    }
  });

  const DUST = 50;
  const dPos = new Float32Array(DUST * 3), dSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const p = RAY_TOP.clone().addScaledVector(RAY_DIR, Math.random() * 13).add(new THREE.Vector3((Math.random() - .5) * 3.5, 0, (Math.random() - .5) * 2.5));
    dPos.set([p.x, p.y, p.z], i * 3); dSeed[i] = Math.random() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(dSeed, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute float seed; uniform float uTime; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uTime * .21 + seed) * .4, sin(uTime * .13 + seed * 1.7) * .5, cos(uTime * .17 + seed) * .4);
        vA = .5 + .5 * sin(uTime * .9 + seed * 3.);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_PointSize = 14. / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
        gl_FragColor = vec4(vec3(1., .88, .65) * smoothstep(.5, 0., d) * vA * .7, 1.); }`,
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ============================================================ ivy
  function leafTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(32, 60);
    x.bezierCurveTo(4, 40, 6, 12, 32, 4);
    x.bezierCurveTo(58, 12, 60, 40, 32, 60);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(32, 58); x.lineTo(32, 10); x.stroke();
    return new THREE.CanvasTexture(c);
  }
  {
    const strands = [];
    const anchor = (x, y, z, n, spread, maxLen) => {
      for (let i = 0; i < n; i++) strands.push([x + (Math.random() - .5) * spread, y, z + (Math.random() - .5) * spread * .4, maxLen * (.4 + Math.random() * .6)]);
    };
    anchor(3.6, 9.4, -1.0, 14, 3.4, 4.8);     // cascading off the top of the big right pillar
    anchor(-11.5, 8.4, -3, 7, 2.2, 4.4);      // left wall, behind the stalactites
    anchor(-6.8, 7.0, -11, 5, 2.0, 2.6);      // left column
    anchor(1.2, 7.4, -14, 4, 2.0, 2.2);       // near the opening
    const leaves = [];
    for (const [x, y, z, len] of strands) {
      const sway = Math.random() * 6;
      for (let s = 0; s < len; s += .1) {
        leaves.push([x + Math.sin(s * 1.3 + sway) * .2 + (Math.random() - .5) * .25, y - s, z + (Math.random() - .5) * .25]);
      }
    }
    const ivy = new THREE.InstancedMesh(new THREE.PlaneGeometry(.32, .32),
      new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: .5, side: THREE.DoubleSide, roughness: .8 }), leaves.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    leaves.forEach(([x, y, z], i) => {
      o.position.set(x, y, z);
      o.rotation.set((Math.random() - .5) * 1.2, Math.random() * 6.28, Math.PI + (Math.random() - .5) * 1.4);
      o.scale.setScalar(.7 + Math.random() * .6);
      o.updateMatrix();
      ivy.setMatrixAt(i, o.matrix);
      ivy.setColorAt(i, c.setHSL(.2 + Math.random() * .07, .42 + Math.random() * .15, .26 + Math.random() * .12));
    });
    ivy.castShadow = true;
    scene.add(ivy);
  }

  // ============================================================ floating logo
  const logo = new THREE.Group();
  {
    const canvas = floatingLogo(logoImg, 1400);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const W = 3.6, H = W * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(W, H);
    const face = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, alphaTest: .5, roughness: .6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .18, side: THREE.DoubleSide,
    }));
    face.castShadow = false;           // it bobs; the sun's shadow map is static
    logo.add(face);
    // thickness: a stack of dark copies behind the face reads as a cut-out sign
    // the thickness layers use the logo block only; with the full canvas they'd double the small text like a shadow
    const blockOnly = document.createElement('canvas');
    blockOnly.width = canvas.width; blockOnly.height = canvas.height;
    const bx = blockOnly.getContext('2d');
    bx.drawImage(canvas, 0, 0);
    bx.clearRect(0, 0, canvas.width, Math.round(1400 * .02 + 1400 * .07) - 2);   // the "AI BUILDER SCHOOL" strip
    const edgeTex = new THREE.CanvasTexture(blockOnly);
    const edge = new THREE.MeshStandardMaterial({ color: 0x1c120c, alphaMap: edgeTex, alphaTest: .5, roughness: .8 });
    for (let i = 1; i <= 3; i++) {          // 3 layers read as thickness at this distance (was 8)
      const m = new THREE.Mesh(geo, edge);
      m.position.z = -i * .04;
      logo.add(m);
    }
    logo.position.set(-1.9, 4.35, 2.0);
    logo.rotation.y = .12;
    scene.add(logo);
    logo.userData.bottom = -H / 2;
  }
  const LOGO_Y = logo.position.y;

  // ---- who's on stage, in cream under the logo (fades when it changes)
  const presenterCanvas = document.createElement('canvas');
  presenterCanvas.width = 1400; presenterCanvas.height = 260;
  const presenterTex = new THREE.CanvasTexture(presenterCanvas);
  presenterTex.colorSpace = THREE.SRGBColorSpace;
  presenterTex.anisotropy = 8;
  const presenterMat = new THREE.MeshStandardMaterial({
    map: presenterTex, transparent: true, depthWrite: false, roughness: .7,
    emissive: 0xffffff, emissiveMap: presenterTex, emissiveIntensity: .22, opacity: 0,
  });
  const presenterLabel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6 * 260 / 1400), presenterMat);
  presenterLabel.position.set(0, logo.userData.bottom + .04, .02);   // tucked right under the logo (overlap is fine: the logo's edge is transparent)
  logo.add(presenterLabel);
  let presenterKey = null, presenterFade = 0, presenterWant = 0;
  function drawPresenter(p) {
    const x = presenterCanvas.getContext('2d');
    x.clearRect(0, 0, 1400, 260);
    if (!p) return;
    x.textBaseline = 'alphabetic';
    x.fillStyle = 'rgb(240,232,214)';
    x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 12;
    let size = 112;
    const name = p.name.toUpperCase();
    x.letterSpacing = '4px';
    do { x.font = `${size}px Anton`; } while (x.measureText(name).width > 1360 && (size -= 4) > 40);
    x.fillText(name, 20, 125);
    if (p.title) {
      x.fillStyle = 'rgba(240,232,214,.72)';
      let ts = 56;
      do { x.font = `${ts}px Anton`; } while (x.measureText(p.title).width > 1360 && (ts -= 2) > 24);
      x.letterSpacing = '6px';
      x.fillText(p.title.toUpperCase(), 22, 215);
    }
    presenterTex.needsUpdate = true;
  }

  // ============================================================ fire + TV
  const stoneGeo = (size, seed) => paintRock(boulderGeo(size, [0, 0, 0], 0, seed, 0, .2), { seed, moss: .2, wetLine: -99 });
  const FIRE_AT = new THREE.Vector3(-2.6, 0, 5.6);   // in front of, and clear of, the left rock cluster
  FIRE_AT.y = groundY(FIRE_AT.x, FIRE_AT.z) + .02;
  const fire = makeFire(scene, FIRE_AT, stoneGeo, rockMat, simplex);
  waterMat.uniforms.uFirePos.value.copy(FIRE_AT).add(new THREE.Vector3(0, 1.1, 0));

  const { tv, screen, screenMat, tvLight, led } = makeTV(screenTex);

  // flat-topped rock the TV sits on, in the right foreground
  const TV_AT = new THREE.Vector3(3.0, 0, 5.0);
  TV_AT.y = groundY(TV_AT.x, TV_AT.z);
  let tvRock;
  {
    const g = boulderGeo([1.7, .7, 1.3], [0, 0, 0], 0, 61, 1, .15);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > .42) p.setY(i, .42 + (p.getY(i) - .42) * .05);
    g.rotateY(-.4);
    g.translate(TV_AT.x, TV_AT.y + .1, TV_AT.z);
    tvRock = addRock(g, { seed: 61, moss: .9 }, { keep: true });
  }
  tv.position.set(TV_AT.x, TV_AT.y + .52, TV_AT.z);
  tv.rotation.y = -.45;
  scene.add(tv);
  // alarm beacon on the cabinet's top-left corner, clear of the rabbit ears
  const beacon = makeBeacon();
  beacon.group.position.set(-.62, 2.03, .12);
  beacon.group.scale.setScalar(1.4);
  tv.add(beacon.group);

  // the hoard heaped in front of and under the TV
  scene.updateMatrixWorld(true);
  const treasure = makeTreasure(scene, [tvRock, scene.getObjectByName('floor')], [
    { x: TV_AT.x + .1, z: TV_AT.z + .85, r: .42, h: .32, n: 130 },
    { x: TV_AT.x + .8, z: TV_AT.z + .7, r: .3, h: .24, n: 80 },
    { x: TV_AT.x - .35, z: TV_AT.z + 1.25, r: .26, h: .14, n: 45 },
  ], { x: TV_AT.x - .95, z: TV_AT.z + .75, rotY: -.3 });

  scene.updateMatrixWorld(true);
  const screenWorld = screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  waterMat.uniforms.uTvPos.value.copy(screenWorld);
  const FOCUS = { look: screenWorld.clone(), pos: screenWorld.clone().addScaledVector(screenNormal, 1.95).add(new THREE.Vector3(0, .04, 0)) };

  flushRocks();

  // ============================================================ lights
  scene.add(new THREE.HemisphereLight(0xb08060, 0x2a1810, 1.5));

  // warm late sun through the gap in the roof (same direction as the shafts)
  const sun = new THREE.DirectionalLight(0xffc98a, 1.7);
  sun.position.copy(RAY_TOP).addScaledVector(RAY_DIR, -14);
  sun.target.position.copy(RAY_TOP).addScaledVector(RAY_DIR, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 22, bottom: -22, near: 1, far: 60 });
  sun.shadow.bias = -.0006;
  sun.shadow.normalBias = .04;
  sun.shadow.autoUpdate = false;     // static scene: render the shadow map once (needsUpdate below)
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);

  // glow spilling in from the opening, rims the far rocks
  const mouthLight = new THREE.PointLight(0xffb878, 45, 0, 1.6);
  mouthLight.position.set(MOUTH.x, 4, MOUTH.z + 7);
  scene.add(mouthLight);

  // ============================================================ post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .45, .6, .9);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uChroma: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uChroma;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        // chromatic aberration: red and blue pulled apart, growing toward the edges like a cheap old lens
        if (uChroma > .001) {
          vec2 dir = vUv - .5;
          vec2 off = dir * dot(dir, dir) * .045 * uChroma;
          c.r = texture2D(tDiffuse, vUv + off).r;
          c.b = texture2D(tDiffuse, vUv - off).b;
        }
        float g = hash(vUv * 1000. + fract(uTime) * 311.) - .5;
        c.rgb += g * .035 * (.4 + c.rgb);
        float v = smoothstep(1.05, .35, length((vUv - .5) * vec2(1.1, 1.)));
        c.rgb *= .35 + .65 * v;
        // heavier shadow pooling in the top-left and top-right corners
        vec2 asp = vec2(1.6, 1.);
        float tl = smoothstep(.62, .0, length((vUv - vec2(0., 1.)) * asp));
        float tr = smoothstep(.62, .0, length((vUv - vec2(1., 1.)) * asp));
        c.rgb *= 1. - .85 * max(tl, tr);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());


  // ============================================================ ambient life
  const life = createLife(scene, { groundY, MOUTH, smooth, mix });

  // ============================================================ per-frame
  const look = HOME.look.clone();
  let focus = 0;           // 0 = wide shot, 1 = close on the TV
  // static burst when the TV changes: ramps up, content swaps at the peak (TVScreen waits 140 ms), then fades
  let staticAge = 9, staticPeak = 0;
  let chroma = 0, chromaWant = 0;      // chromatic aberration, eased in/out
  const staticEnv = () => staticAge < .14 ? staticAge / .14 : Math.max(0, 1 - (staticAge - .14) / .38);
  // camera zoom: an eased tween of fixed length rather than a chase
  let zoomFrom = 0, zoomTo = 0, zoomAge = 9;
  const ZOOM_SECS = 1.8;
  const easeInOut = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let t = 0;
  const born = performance.now();

  return {
    // TV switched slides: a brief flicker of static (kept faint: a full burst is dizzying when zoomed in)
    onSwitch(item) { staticAge = 0; staticPeak = item.kind === 'question' ? .22 : .15; },

    // new question: the alarm beacon on the TV spins up
    onQuestion() { beacon.trigger(); },

    // amount 0..1 from the admin; .6 is the classic look
    setChromatic(on, amount = .6) { chromaWant = on ? amount / .6 : 0; },

    setPresenter(p) {
      const key = p ? `${p.name}|${p.title || ''}` : null;
      if (key === presenterKey) return;
      presenterKey = key;
      presenterWant = 0;                        // fade out, swap, fade back in
      setTimeout(() => { drawPresenter(p); presenterWant = p ? 1 : 0; }, presenterFade > .05 ? 450 : 0);
    },

    update(dt, now) {
      t += dt;
      const ignite = Math.min(1, (now - born) / 3500);
      const ig = ignite * ignite * (3 - 2 * ignite);

      fire.update(t, dt, ig, camera);
      for (const r of rays) r.material.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;
      waterMat.uniforms.uTime.value = t;
      waterMat.uniforms.uFire.value = fire.light.intensity / 34;   // glints flicker with the fire
      life.update(t, dt);

      // the sign drifts
      logo.position.y = LOGO_Y + Math.sin(t * .6) * .12;
      logo.rotation.y = .12 + Math.sin(t * .23) * .07;
      logo.rotation.z = Math.sin(t * .31 + 1) * .015;

      // TV
      staticAge += dt;
      const staticAmt = staticEnv() * staticPeak * (1 - focus * .6);
      screenMat.uniforms.uTime.value = t;
      screenMat.uniforms.uStatic.value = staticAmt;
      screenMat.uniforms.uFocus.value = focus;
      tvLight.intensity = (2.2 + staticAmt * 1.5 + (tvScreen.isLive ? .8 : 0)) * ig;
      beacon.update(dt, t);
      treasure.update(t);
      presenterFade += (presenterWant - presenterFade) * Math.min(1, dt * 4);
      presenterMat.opacity = presenterFade;
      presenterLabel.visible = presenterFade > .01;
      led.material.color.setHex(tvScreen.isLive && Math.floor(t * 2) % 2 ? 0xff5020 : 0x701005);

      // camera: slow breathing drift, or a dolly into the TV for the QR
      const want = tvScreen.focus ? 1 : 0;
      if (want !== zoomTo) { zoomFrom = focus; zoomTo = want; zoomAge = 0; }   // retarget from wherever we are
      zoomAge += dt;
      focus = zoomFrom + (zoomTo - zoomFrom) * easeInOut(Math.min(1, zoomAge / ZOOM_SECS));
      const e = focus;
      const drift = 1 - e * .85;
      camera.position.lerpVectors(HOME.pos, FOCUS.pos, e);
      camera.position.x += simplex.noise(t * .07, 1) * .16 * drift;
      camera.position.y += simplex.noise(t * .09, 2) * .07 * drift;
      look.lerpVectors(HOME.look, FOCUS.look, e);
      camera.lookAt(look);

      grade.uniforms.uTime.value = t;
      chroma += (chromaWant - chroma) * Math.min(1, dt * 5);
      grade.uniforms.uChroma.value = chroma * (1 - focus * .9);   // eases off while zoomed in, so it never splits the QR
      composer.render(dt);
    },

    // quality tier 3 = the laptop is struggling: drop the expensive bits
    degrade() { sun.castShadow = false; bloom.enabled = false; },

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
      scene.traverse((o) => { if (o.isLight) o.dispose(); });   // frees shadow maps
      depthTex.dispose();
      for (const p of composer.passes) p.dispose?.();          // bloom keeps its own render targets
      composer.dispose();
    },

    debug: { scene, camera, logo, life },
  };
}
