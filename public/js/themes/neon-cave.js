// Theme 2 — the neon cave.
// A cyber tunnel through dark slate, veined with glowing circuit traces, looking down to a neon portal ring at the
// far end. A "data river" of light runs down the middle like water. The TV stands on a basalt pedestal on the
// left, the logo and presenter float top-right, and a glowing AI core (a faceted crystal with orbiting rings)
// is the centrepiece bottom-right, lighting the scene in cyan the way the campfire does in theme 1.
// Ambient life (one event at a time): a drone flyby, a stream of data packets out of the portal, a slow scan line.
// Everything moves smoothly: no strobing or flashing anywhere (photosensitivity).
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floatingLogo } from '../wall-art.js';
import { makeTV } from '../tv.js';
import { makeBeacon } from '../alarm-light.js';
import { makeFlipClock } from '../flip-clock.js';

export const name = 'Neon cave';
export const ambience = 'hum';

const CYAN = new THREE.Color(0x2ef2ff), MAGENTA = new THREE.Color(0xff3bd4), VIOLET = new THREE.Color(0x7a4dff);

export async function create({ renderer, tvScreen, screenTex, logoImg }) {
  const FOG = 0x07061a;
  renderer.shadowMap.enabled = false;               // a night-lit scene: glow does the work, shadows aren't needed
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, .038);

  const BASE_FOV = 45;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, .1, 140);
  function frameCamera() {
    camera.aspect = innerWidth / innerHeight;
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 16 / 9);
    camera.fov = camera.aspect >= 16 / 9 ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / camera.aspect));
    camera.updateProjectionMatrix();
  }
  frameCamera();
  const HOME = { pos: new THREE.Vector3(0, 2.3, 12.5), look: new THREE.Vector3(.2, 2.4, -10) };
  camera.position.copy(HOME.pos);

  // ============================================================ helpers
  const simplex = new SimplexNoise();
  const hash = (x) => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const fbm = (x, y, z = 0) => { let v = 0, a = 1, f = 1; for (let i = 0; i < 3; i++) { v += simplex.noise3d(x * f, y * f, z) * a; a *= .5; f *= 2.1; } return v; };

  // dark slate, one flat colour per face, a little variation; with circuit veins glowing in the emissive map
  const SLATE = [0x1b1a30, 0x211f3a, 0x16172b, 0x262342, 0x1d1c33].map((h) => new THREE.Color(h));
  function paintSlate(geo, seed = 1) {
    geo = geo.index ? geo.toNonIndexed() : geo;
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    for (let f = 0; f < p.count; f += 3) {
      const c = SLATE[Math.floor(hash(f * .731 + seed) * SLATE.length)].clone().multiplyScalar(.85 + hash(f * 1.7 + seed) * .3);
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  // circuit traces: right-angled runs ending in little pads, cyan and magenta, on black (used as an emissive map)
  function circuitTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 512, 512);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (let i = 0; i < 12; i++) {
      const colour = rnd() < .62 ? '#2ef2ff' : '#ff3bd4';
      x.strokeStyle = colour; x.fillStyle = colour;
      x.lineWidth = rnd() < .3 ? 3 : 1.6;
      let px = Math.round(rnd() * 16) * 32, py = Math.round(rnd() * 16) * 32;
      x.beginPath(); x.moveTo(px, py);
      for (let s = 0, n = 2 + Math.floor(rnd() * 4); s < n; s++) {
        const len = (2 + Math.floor(rnd() * 5)) * 16;
        const d = Math.floor(rnd() * 4);
        if (d === 0) px += len; else if (d === 1) px -= len; else if (d === 2) py += len; else py -= len;
        x.lineTo(px, py);
      }
      x.stroke();
      x.beginPath(); x.arc(px, py, 3.5, 0, Math.PI * 2); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  const circuit = circuitTexture();
  const slateMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .85, metalness: .1 });
  const veinMat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: .8, metalness: .15,
    emissive: 0xffffff, emissiveMap: circuit, emissiveIntensity: .9,
  });

  // ============================================================ the tunnel
  // A big open tube along z, pushed in and out by noise; its lower half sits below the floor. Coarse on purpose
  // (faces ~2.5 units): the far end stays calm instead of fizzing with tiny triangles.
  {
    const g = new THREE.CylinderGeometry(9, 9, 72, 20, 26, true);
    g.rotateX(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(y, x);
      const r = 9 * (1 + fbm(Math.cos(a) * 1.3, Math.sin(a) * 1.3, z * .08) * .16);
      p.setXYZ(i, Math.cos(a) * r * 1.15, Math.sin(a) * r * .75, z);
    }
    const geo = paintSlate(g, 2);
    // circuit veins wrap round and along the tunnel
    circuit.repeat.set(4, 6);
    const tunnel = new THREE.Mesh(geo, veinMat);
    tunnel.material.side = THREE.BackSide;
    tunnel.position.set(0, 3.2, -22);
    scene.add(tunnel);
  }

  // ---- floor: rocky slate banks with a channel down the middle for the data river
  const channelX = (z) => Math.sin(z * .07) * 1.2 + .4;
  const groundY = (x, z) => {
    const d = Math.abs(x - channelX(z));
    return -.35 + smooth(1.8, 3.6, d) * .6 + fbm(x * .25, z * .25, 5) * .18 + smooth(5, 9, d) * .5;
  };
  {
    const g = new THREE.PlaneGeometry(28, 64, 28, 48);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -20);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    scene.add(new THREE.Mesh(paintSlate(g, 7), slateMat));
  }

  // ---- the data river: a dark glassy strip with streaks of light flowing toward the camera, and a faint grid
  const riverMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color(FOG) } },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uFog; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 p = vW.xz;
        // lanes of light: each lane has its own speed and spacing; streaks are long and soft (no flicker)
        float lane = p.x * 2.2, id = floor(lane), f = fract(lane);
        float speed = .6 + h(vec2(id, 1.)) * .8;
        float s = fract(p.y * (.05 + h(vec2(id, 2.)) * .05) + uTime * speed * .12 + h(vec2(id, 3.)));
        float streak = smoothstep(0., .12, s) * smoothstep(.55, .12, s) * smoothstep(.5, .15, abs(f - .5));
        vec3 tint = mix(vec3(.18, .95, 1.), vec3(1., .25, .85), step(.7, h(vec2(id, 4.))));
        vec2 g = abs(fract(p * vec2(1., .5)) - .5);
        float grid = smoothstep(.47, .5, max(g.x, g.y));
        vec3 col = vec3(.012, .016, .05) + tint * streak * .3 + vec3(.35, .2, .9) * grid * .07;
        float d = length(vW - cameraPosition);
        col = mix(col, uFog, 1. - exp(-.0015 * d * d));
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  {
    const river = new THREE.Mesh(new THREE.PlaneGeometry(9, 64, 1, 1), riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -.12, -20);
    scene.add(river);
  }

  // ---- neon crystal clusters along the walls and banks (merged: two draw calls)
  {
    const byColour = { cyan: [], magenta: [] };
    const cluster = (x, z, n, colour, scale = 1) => {
      for (let i = 0; i < n; i++) {
        const g = new THREE.OctahedronGeometry(.25 * scale * (.6 + hash(x * 7 + i) * .8), 0);
        g.scale(.55, 2.2 + hash(z + i) * 1.6, .55);
        g.rotateZ((hash(x + i * 3) - .5) * .9);
        g.rotateX((hash(z * 2 + i) - .5) * .6);
        const y = groundY(x, z);
        g.translate(x + (hash(i * 5 + x) - .5) * .6 * scale, y + .25 * scale, z + (hash(i * 9 + z) - .5) * .6 * scale);
        byColour[colour].push(g.toNonIndexed());
      }
    };
    cluster(-6.6, 1.5, 5, 'magenta', 1.4); cluster(-5.2, -6, 4, 'cyan', 1.2); cluster(6.2, -3, 5, 'cyan', 1.5);
    cluster(5.6, -11, 4, 'magenta', 1.3); cluster(-4.6, -14, 4, 'magenta', 1.1); cluster(4.4, -18, 3, 'cyan', 1.2);
    cluster(-6.8, 7.5, 3, 'cyan', 1.6); cluster(7.4, 6, 3, 'magenta', 1.4);
    for (const [colour, geos] of Object.entries(byColour)) {
      const c = colour === 'cyan' ? CYAN : MAGENTA;
      const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({
        color: c.clone().multiplyScalar(.35), emissive: c, emissiveIntensity: 1.1, roughness: .25, metalness: .2, flatShading: true,
      }));
      scene.add(m);
    }
  }

  // ---- cables drooping from the ceiling, a soft light at each tip
  {
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x0c0b16, roughness: .6, flatShading: true });
    const tips = [];
    for (const [x, z, drop] of [[-4.5, -2, 2.6], [-2.2, -7, 3.2], [3.6, -5, 2.4], [1.2, -12, 3.6], [-3.4, -16, 2.8], [4.6, 1.5, 2.2]]) {
      const top = 3.2 + 6.75 * Math.sqrt(Math.max(0, 1 - (x / 10.35) ** 2)) - .5;   // just under the tunnel roof
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x - .8, top, z), new THREE.Vector3(x - .2, top - drop * .7, z + .3), new THREE.Vector3(x + .3, top - drop, z + .2),
      ]);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, .05, 4), cableMat));
      tips.push(curve.getPoint(1));
    }
    const tipGeo = new THREE.OctahedronGeometry(.08, 0);
    tips.forEach((p, i) => {
      const m = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: (i % 2 ? MAGENTA : CYAN).clone().multiplyScalar(2), toneMapped: false }));
      m.position.copy(p);
      scene.add(m);
    });
  }

  // ---- the portal at the far end: a neon ring with a soft glow inside
  const portal = new THREE.Group();
  portal.position.set(channelX(-34), 3.1, -34);
  {
    // the ring ignores the fog, so it glows through the haze at the end of the tunnel
    portal.add(new THREE.Mesh(new THREE.TorusGeometry(3.4, .18, 6, 28), new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(2.2), toneMapped: false, fog: false })));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(2.9, .06, 4, 28), new THREE.MeshBasicMaterial({ color: MAGENTA.clone().multiplyScalar(1.8), toneMapped: false, fog: false }));
    portal.add(inner);
    portal.userData.inner = inner;
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(160,120,255,.9)'); g.addColorStop(.45, 'rgba(90,60,220,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.set(9, 9, 1);
    portal.add(glow);
    scene.add(portal);
    const light = new THREE.PointLight(VIOLET, 60, 40, 1.6);
    light.position.set(portal.position.x, 3, -30);
    scene.add(light);
  }

  // ============================================================ the TV, on a basalt pedestal (left)
  const PED = new THREE.Vector3(-3.4, 0, 5.0);
  PED.y = groundY(PED.x, PED.z);
  {
    const g = new THREE.CylinderGeometry(1.25, 1.42, 1.0, 6, 1);
    g.translate(PED.x, PED.y + .5, PED.z);
    scene.add(new THREE.Mesh(paintSlate(g, 21), slateMat));
    // neon trim round the pedestal's top edge
    const trim = new THREE.Mesh(new THREE.TorusGeometry(1.27, .025, 3, 6), new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(1.6), toneMapped: false }));
    trim.rotation.x = Math.PI / 2; trim.rotation.z = Math.PI / 6;
    trim.position.set(PED.x, PED.y + 1.0, PED.z);
    scene.add(trim);
  }
  const { tv, screen, screenMat, tvLight, led } = makeTV(screenTex);
  tv.position.set(PED.x, PED.y + 1.0, PED.z);
  tv.rotation.y = .42;
  scene.add(tv);
  const beacon = makeBeacon();
  beacon.group.position.set(.74, 2.07, .36);
  beacon.group.scale.setScalar(1.2);
  tv.add(beacon.group);
  const clock = makeFlipClock();
  clock.group.position.set(-.5, 2.07, .1);
  clock.group.rotation.y = .12;
  clock.group.scale.setScalar(1.4);
  tv.add(clock.group);
  // a cool fill so the TV's warm wood reads in the blue dark
  const tvFill = new THREE.PointLight(0x7aa8ff, 6, 9, 1.6);
  tvFill.position.set(PED.x + 2, 3.6, PED.z + 3);
  scene.add(tvFill);

  scene.updateMatrixWorld(true);
  const screenWorld = screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  const FOCUS = { look: screenWorld.clone(), pos: screenWorld.clone().addScaledVector(screenNormal, 1.95).add(new THREE.Vector3(0, .04, 0)) };

  // ============================================================ the AI core (bottom-right centrepiece)
  const CORE = new THREE.Vector3(3.3, 0, 5.4);
  CORE.y = groundY(CORE.x, CORE.z);
  const core = new THREE.Group();
  core.position.copy(CORE);
  scene.add(core);
  {
    const ped = new THREE.CylinderGeometry(.62, .78, .55, 6, 1);
    ped.translate(0, .275, 0);
    core.add(new THREE.Mesh(paintSlate(ped, 31), slateMat));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.64, .03, 3, 6), new THREE.MeshBasicMaterial({ color: MAGENTA.clone().multiplyScalar(1.6), toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = .55;
    core.add(ring);
  }
  const crystal = new THREE.Group();
  crystal.position.y = 1.55;
  core.add(crystal);
  const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 0), new THREE.MeshStandardMaterial({
    color: 0x0a3a44, emissive: CYAN, emissiveIntensity: .55, roughness: .2, metalness: .3, flatShading: true,
  }));
  gem.scale.y = 1.35;
  crystal.add(gem);
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(.62, 0)),
    new THREE.LineBasicMaterial({ color: MAGENTA.clone().multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: .8 }));
  crystal.add(cage);
  const orbits = [0, 1].map((i) => {
    const o = new THREE.Mesh(new THREE.TorusGeometry(.9 + i * .18, .018, 3, 40), new THREE.MeshBasicMaterial({ color: (i ? MAGENTA : CYAN).clone().multiplyScalar(1.4), toneMapped: false }));
    o.rotation.set(1.1 + i * .7, i * .9, 0);
    crystal.add(o);
    return o;
  });
  const coreLight = new THREE.PointLight(CYAN, 26, 16, 1.5);
  coreLight.position.set(CORE.x, CORE.y + 1.6, CORE.z);
  scene.add(coreLight);

  // ============================================================ lights
  scene.add(new THREE.HemisphereLight(0x4a4aa0, 0x0a0816, 2.4));   // enough to read the slate facets in the dark
  for (const [x, y, z, c, i] of [[-6.5, 3.5, -4, MAGENTA, 22], [6.5, 3.5, -9, CYAN, 20], [-5, 4, -18, VIOLET, 18]]) {
    const l = new THREE.PointLight(c, i, 18, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
  }

  // ============================================================ floating logo + who's on stage (top right)
  const logo = new THREE.Group();
  {
    const canvas = floatingLogo(logoImg, 1400);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const W = 3.6, H = W * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(W, H);
    logo.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, alphaTest: .5, roughness: .6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .35, side: THREE.DoubleSide,
    })));
    const blockOnly = document.createElement('canvas');
    blockOnly.width = canvas.width; blockOnly.height = canvas.height;
    const bx = blockOnly.getContext('2d');
    bx.drawImage(canvas, 0, 0);
    bx.clearRect(0, 0, canvas.width, Math.round(1400 * .02 + 1400 * .07) - 2);
    const edge = new THREE.MeshStandardMaterial({ color: 0x0c0a1c, alphaMap: new THREE.CanvasTexture(blockOnly), alphaTest: .5, roughness: .8 });
    for (let i = 1; i <= 3; i++) { const m = new THREE.Mesh(geo, edge); m.position.z = -i * .04; logo.add(m); }
    logo.position.set(2.2, 4.4, 2.0);
    logo.rotation.y = -.14;
    scene.add(logo);
    logo.userData.bottom = -H / 2;
  }
  const LOGO_Y = logo.position.y;
  const presenterCanvas = document.createElement('canvas');
  presenterCanvas.width = 1400; presenterCanvas.height = 260;
  const presenterTex = new THREE.CanvasTexture(presenterCanvas);
  presenterTex.colorSpace = THREE.SRGBColorSpace;
  presenterTex.anisotropy = 8;
  const presenterMat = new THREE.MeshStandardMaterial({
    map: presenterTex, transparent: true, depthWrite: false, roughness: .7,
    emissive: 0xffffff, emissiveMap: presenterTex, emissiveIntensity: .35, opacity: 0,
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
    x.fillStyle = 'rgb(226,240,255)';
    x.shadowColor = 'rgba(46,242,255,.55)'; x.shadowBlur = 16;
    let size = 112;
    const name = p.name.toUpperCase();
    x.letterSpacing = '4px';
    do { x.font = `${size}px Anton`; } while (x.measureText(name).width > 1360 && (size -= 4) > 40);
    x.fillText(name, 20, 125);
    if (p.title) {
      x.fillStyle = 'rgba(160,236,255,.8)';
      let ts = 56;
      do { x.font = `${ts}px Anton`; } while (x.measureText(p.title).width > 1360 && (ts -= 2) > 24);
      x.letterSpacing = '6px';
      x.fillText(p.title.toUpperCase(), 22, 215);
    }
    presenterTex.needsUpdate = true;
  }

  // ============================================================ holographic dust
  const DUST = 320;
  const dustGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(DUST * 3), seed = new Float32Array(DUST);
    for (let i = 0; i < DUST; i++) {
      pos.set([(hash(i) - .5) * 16, hash(i * 3) * 7, -26 + hash(i * 7) * 36], i * 3);
      seed[i] = hash(i * 11) * 100;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  }
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float uTime; varying float vA; varying float vC;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime * (.08 + fract(seed) * .12), 7.);          // drifts slowly upward, wraps
        p.x += sin(uTime * .3 + seed) * .3;
        vA = smoothstep(0., 1., p.y) * smoothstep(7., 5.5, p.y) * (.55 + .45 * sin(uTime * .8 + seed * 6.));   // slow, gentle twinkle
        vC = step(.65, fract(seed * 7.13));
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = 34. / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying float vC;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d) * vA;
        gl_FragColor = vec4(mix(vec3(.2,.9,1.), vec3(1.,.3,.85), vC) * a, a); }`,
  });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ============================================================ ambient life: one event at a time
  const life = (() => {
    // a small quad drone: dark body, four arms with spinning rotors, a soft cyan underglow, a slowly blinking light
    function makeDrone() {
      const g = new THREE.Group();
      const dark = new THREE.MeshStandardMaterial({ color: 0x3a3a52, roughness: .45, metalness: .5, flatShading: true });
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(.22, 0), dark);
      body.scale.set(1.4, .55, 1);
      g.add(body);
      const rotors = [];
      for (const [x, z] of [[.32, .32], [.32, -.32], [-.32, .32], [-.32, -.32]]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(.45, .03, .04), dark);
        arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(-z, x);
        g.add(arm);
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .01, 8), new THREE.MeshBasicMaterial({ color: 0x2a2a40, transparent: true, opacity: .55 }));
        rotor.position.set(x, .04, z);
        g.add(rotor);
        rotors.push(rotor);
      }
      const glow = new THREE.Mesh(new THREE.CircleGeometry(.14, 8), new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(2), toneMapped: false }));
      glow.rotation.x = Math.PI / 2; glow.position.y = -.12;
      g.add(glow);
      const blink = new THREE.Mesh(new THREE.SphereGeometry(.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3050, toneMapped: false }));
      blink.position.set(.28, .02, 0);
      g.add(blink);
      // glowing accent strips along the body, so it reads against the dark
      for (const z of [-.12, .12]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(.5, .015, .015), new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(1.8), toneMapped: false }));
        strip.position.set(0, .02, z);
        g.add(strip);
      }
      g.userData = { rotors, blink };
      g.scale.setScalar(3);
      return g;
    }
    function drones() {
      const list = [];
      const n = hash(performance.now()) < .4 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const d = makeDrone();
        const dir = Math.random() < .5 ? 1 : -1;
        list.push({ d, dir, y: 5.2 + Math.random() * 1.2, z: -2 + Math.random() * 4, start: i * 2.6, speed: 1.6 + Math.random() * .5 });
        scene.add(d);
      }
      let age = 0;
      return {
        update(dt, t) {
          age += dt;
          let busy = false;
          for (const o of list) {
            const u = (age - o.start) * o.speed;
            const x = -o.dir * 11 + o.dir * u;
            o.d.visible = u > 0;
            if (u < 0 || Math.abs(x) <= 11.5) busy = true;
            o.d.position.set(x, o.y + Math.sin(age * 1.3 + o.z) * .18, o.z + Math.sin(age * .5) * .6);
            o.d.rotation.set(Math.sin(age * .9) * .05, o.dir > 0 ? 0 : Math.PI, -o.dir * .12);   // nose down into travel
            for (const r of o.d.userData.rotors) r.rotation.y += dt * 40;
            // its light breathes slowly (under 1 Hz, smooth): no blinking
            o.d.userData.blink.material.color.setRGB(1, .19, .31).multiplyScalar(.4 + .6 * (.5 + .5 * Math.sin(t * Math.PI * 2 * .8)));
          }
          if (!busy) { list.forEach((o) => scene.remove(o.d)); return false; }
        },
      };
    }
    // a stream of glowing data packets flowing out of the portal, down the tunnel and curving away overhead
    const packetTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    function packets() {
      const side = Math.random() < .5 ? -1 : 1;
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(portal.position.x, 3.1, -33), new THREE.Vector3(side * 1.5, 2.6, -20), new THREE.Vector3(side * 2.6, 3.0, -9),
        new THREE.Vector3(side * 1.4, 4.6, -1), new THREE.Vector3(-side * 2, 7.5, 4),
      ]);
      const N = 26, sprites = [];
      for (let i = 0; i < N; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: packetTex, color: (i % 3 ? CYAN : MAGENTA).clone().multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        s.scale.setScalar(.22 + hash(i) * .12);
        scene.add(s);
        sprites.push({ s, delay: i * .22 + hash(i * 3) * .3, off: new THREE.Vector3((hash(i * 5) - .5) * .5, (hash(i * 7) - .5) * .4, 0) });
      }
      let age = 0;
      const DUR = 9;
      return {
        update(dt) {
          age += dt;
          let busy = false;
          for (const p of sprites) {
            const u = (age - p.delay) / DUR;
            if (u < 0 || u > 1) { p.s.material.opacity = 0; if (u < 0) busy = true; continue; }
            busy = true;
            p.s.position.copy(path.getPointAt(u)).add(p.off);
            p.s.material.opacity = smooth(0, .08, u) * smooth(1, .85, u);
          }
          if (!busy) { sprites.forEach((p) => { scene.remove(p.s); p.s.material.dispose(); }); return false; }
        },
      };
    }
    // a slow scan: a faint ring of light glides from the portal toward the camera along the tunnel walls
    function scan() {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .02, 3, 40), new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      ring.scale.set(9.6, 6.2, 1);
      scene.add(ring);
      let age = 0;
      const DUR = 8;
      return {
        update(dt) {
          age += dt;
          const u = Math.min(1, age / DUR);
          ring.position.set(0, 3.2, -32 + u * 40);
          ring.material.opacity = Math.sin(u * Math.PI) * .45;      // eases in and out: never a flash
          if (u >= 1) { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); return false; }
        },
      };
    }
    const EVENTS = { drones, packets, scan };
    let active = null, last = null, wait = 6;
    return {
      update(t, dt) {
        if (active) { if (active.update(dt, t) === false) { active = null; wait = 9 + Math.random() * 10; } }
        else if ((wait -= dt) <= 0) {
          const names = Object.keys(EVENTS).filter((n) => n !== last);
          last = names[Math.floor(Math.random() * names.length)];
          active = EVENTS[last]();
        }
      },
      play(n) { if (!active) { active = EVENTS[n](); last = n; } },
    };
  })();

  // ============================================================ post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .75, .55, .82);
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
        c.rgb += g * .03 * (.4 + c.rgb);
        float v = smoothstep(1.1, .35, length((vUv - .5) * vec2(1.1, 1.)));
        c.rgb *= .45 + .55 * v;
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
  let t = 0, tvGlow = 0;
  const born = performance.now();

  return {
    onSwitch() {},                                 // TVScreen crossfades; nothing flashes here
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

    update(dt, now) {
      t += dt;
      const ignite = Math.min(1, (now - born) / 2500);
      const ig = ignite * ignite * (3 - 2 * ignite);

      riverMat.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;
      veinMat.emissiveIntensity = (.38 + .08 * Math.sin(t * .5)) * ig;   // the veins breathe, very slowly
      life.update(t, dt);

      // the AI core: turns, bobs and breathes
      crystal.position.y = 1.55 + Math.sin(t * .9) * .08;
      gem.rotation.y = t * .4;
      cage.rotation.y = -t * .25; cage.rotation.x = Math.sin(t * .2) * .3;
      orbits[0].rotation.z = t * .6;
      orbits[1].rotation.z = -t * .45;
      coreLight.intensity = (24 + Math.sin(t * .7) * 4) * ig;
      portal.userData.inner.rotation.z = t * .15;

      // the sign drifts
      logo.position.y = LOGO_Y + Math.sin(t * .6) * .12;
      logo.rotation.y = -.14 + Math.sin(t * .23) * .07;
      logo.rotation.z = Math.sin(t * .31 + 1) * .015;

      // TV
      screenMat.uniforms.uTime.value = t;
      screenMat.uniforms.uStatic.value = 0;
      screenMat.uniforms.uFocus.value = focus;
      tvGlow += ((tvScreen.isLive ? .8 : 0) - tvGlow) * Math.min(1, dt * 1.5);
      tvLight.intensity = (2.2 + tvGlow) * ig;
      beacon.update(dt, t);
      clock.update(dt);
      presenterFade += (presenterWant - presenterFade) * Math.min(1, dt * 4);
      presenterMat.opacity = presenterFade;
      presenterLabel.visible = presenterFade > .01;
      led.material.color.setHex(tvScreen.isLive ? 0xff5020 : 0x701005);

      // camera: slow drift, or a dolly into the TV
      const want = tvScreen.focus ? 1 : 0;
      if (want !== zoomTo) { zoomFrom = focus; zoomTo = want; zoomAge = 0; }
      zoomAge += dt;
      focus = zoomFrom + (zoomTo - zoomFrom) * easeInOut(Math.min(1, zoomAge / ZOOM_SECS));
      const drift = 1 - focus * .85;
      camera.position.lerpVectors(HOME.pos, FOCUS.pos, focus);
      camera.position.x += simplex.noise(t * .07, 1) * .16 * drift;
      camera.position.y += simplex.noise(t * .09, 2) * .07 * drift;
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

    debug: { scene, camera, logo, life },
  };
}
