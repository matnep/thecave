// Theme 2 — neon city in the rain, low poly. After a rainy-night Tokyo scramble crossing:
// wet asphalt mirroring the signs, a zebra scramble, a crowd under clear umbrellas waiting on the far side,
// stacked ad billboards on the left, a tall tower with a bright sign in the middle, and on the right a big glass
// building whose giant screen is the question board (it shows what the TV shows in theme 1).
// The logo and presenter float top-left, as in theme 1. One event at a time: a taxi drives through, or the walk
// signal turns and the crowd crosses. Everything eases (no strobing or flashing: photosensitivity).
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
export const ambience = 'rain';

const JP = '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans JP", sans-serif';

export async function create({ renderer, tvScreen, screenTex, logoImg }) {
  const FOG = 0x060a1c;
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, .022);

  const BASE_FOV = 45;
  const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, .1, 160);
  function frameCamera() {
    camera.aspect = innerWidth / innerHeight;
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 16 / 9);
    camera.fov = camera.aspect >= 16 / 9 ? BASE_FOV : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hHalf) / camera.aspect));
    camera.updateProjectionMatrix();
  }
  frameCamera();
  const HOME = { pos: new THREE.Vector3(0, 2.0, 12), look: new THREE.Vector3(.3, 3.6, -10) };
  camera.position.copy(HOME.pos);

  const simplex = new SimplexNoise();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const canvasTex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

  // ============================================================ textures
  // building facade: a grid of windows, some lit warm, some cool, most dark
  function facade(cols, rows, base, { lit = .35, glass = false } = {}) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = Math.round(256 * rows / cols);
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, c.width, c.height);
    const cw = c.width / cols, ch = c.height / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const r = rnd();
      x.fillStyle = r < lit * .6 ? pick(['#ffd9a0', '#ffe8c4', '#ffcf8a']) : r < lit ? pick(['#9fd8ff', '#c8e6ff', '#7fb8ff']) : glass ? 'rgba(20,40,80,.9)' : 'rgba(8,10,20,.95)';
      x.fillRect(i * cw + cw * .22, j * ch + ch * .26, cw * .56, ch * .48);
    }
    if (glass) {                                     // glass curtain wall: thin mullions
      x.strokeStyle = 'rgba(120,180,255,.35)'; x.lineWidth = 2;
      for (let i = 0; i <= cols; i++) { x.beginPath(); x.moveTo(i * cw, 0); x.lineTo(i * cw, c.height); x.stroke(); }
    }
    return canvasTex(c);
  }
  // an advert: a gradient panel, a bold line or two, maybe a shape; all made up for the scene
  function advert(w, h, { bg, fg = '#fff', lines, jp = false, shape = null }) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (shape === 'circle') { x.fillStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.arc(w * .78, h * .5, h * .38, 0, 7); x.fill(); }
    if (shape === 'bars') { x.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 6; i++) x.fillRect(w * .62 + i * w * .055, h * (.7 - i * .09), w * .035, h * (.2 + i * .09)); }
    x.fillStyle = fg; x.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      let size = h / (lines.length + .6);
      const font = (s) => `${jp ? 'bold ' : ''}${s}px ${jp ? JP : 'Anton, sans-serif'}`;
      do { x.font = font(size); } while (x.measureText(ln).width > w * .86 && (size -= 4) > 10);
      x.fillText(ln, w * .07, h * (i + 1) / (lines.length + 1));
    });
    return canvasTex(c);
  }
  // a vertical neon sign: characters stacked top to bottom
  function verticalSign(text, colour, bg = '#120818') {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96 * text.length + 32;
    const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = colour; x.font = `bold 76px ${JP}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = colour; x.shadowBlur = 10;
    [...text].forEach((ch, i) => x.fillText(ch, 48, 16 + 96 * i + 48));
    return canvasTex(c);
  }
  // a soft vertical streak of light, for a sign's reflection on the wet road
  const streakTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    const h = x.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(.25, 'rgba(0,0,0,0)'); h.addColorStop(.75, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
    return new THREE.CanvasTexture(c);
  })();
  const reflections = [];
  // lay a glowing streak on the road under a light source, running toward the camera (fake wet reflection)
  function reflect(x, z, width, colour, strength = .5, length = 9) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshBasicMaterial({
      map: streakTex, color: new THREE.Color(colour), transparent: true, opacity: strength, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x + (0 - x) * .12, .012, z + length / 2);   // leans a little toward the camera line
    m.renderOrder = 1;
    scene.add(m);
    reflections.push(m);
    return m;
  }

  // ============================================================ ground: wet road, sidewalks, zebra crossing
  const ROAD = new THREE.MeshStandardMaterial({ color: 0x0b0d16, roughness: .22, metalness: .55 });
  {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), ROAD);
    road.rotation.x = -Math.PI / 2; road.position.z = -14;
    scene.add(road);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x1a1c28, roughness: .5, metalness: .2, flatShading: true });
    const slab = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, .16, d), curbMat); m.position.set(x, .08, z); scene.add(m); };
    slab(60, 5, 0, -11.5);        // far sidewalk, where the crowd waits
    slab(14, 6, -14, 8);          // near corners
    slab(14, 6, 15, 8);
    // zebra stripes: a crossing toward the camera, and one along the far side (a scramble)
    const stripe = new THREE.MeshStandardMaterial({ color: 0xb9bcc8, roughness: .35, metalness: .2 });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(.55, 10.5), stripe);
      m.rotation.x = -Math.PI / 2; m.position.set(-4 + i * 1.0, .01, -3.6);
      scene.add(m);
    }
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(24, .5), stripe);
      m.rotation.x = -Math.PI / 2; m.position.set(0, .011, -7.9 + i * .9);
      scene.add(m);
    }
  }

  // ============================================================ buildings
  const DARK = new THREE.MeshStandardMaterial({ color: 0x0c0e18, roughness: .8, flatShading: true });
  function building(x, z, w, h, d, { cols, rows, base = '#0d1020', lit = .14, glass = false, rotY = 0 } = {}) {
    const tex = facade(cols ?? Math.max(4, Math.round(w * 2)), rows ?? Math.max(6, Math.round(h * 1.8)), base, { lit, glass });
    const side = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .3, roughness: glass ? .2 : .8, metalness: glass ? .5 : .1 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, DARK, DARK, side, side]);
    m.position.set(x, h / 2, z); m.rotation.y = rotY;
    scene.add(m);
    // a few rooftop boxes for a ragged skyline
    for (let i = 0; i < 2; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w * (.2 + rnd() * .25), .6 + rnd() * 1.2, d * (.2 + rnd() * .3)), DARK);
      r.position.set(x + (rnd() - .5) * w * .5, h + .3, z + (rnd() - .5) * d * .4);
      scene.add(r);
    }
    return m;
  }
  // background skyline, fading into the haze
  for (let i = 0; i < 14; i++) {
    const x = -34 + i * 5.2 + (rnd() - .5) * 2, h = 10 + rnd() * 16;
    building(x, -42 - rnd() * 6, 4 + rnd() * 2, h, 4, { lit: .04 + rnd() * .05, base: pick(['#0c1024', '#101024', '#0a0f20']) });
  }
  // left: a building stacked with adverts
  building(-11.5, -11, 7, 16, 6, { lit: .1, base: '#101322' });
  building(-17, -6, 5, 11, 7, { lit: .12 });
  // centre: a tall tower with a bright sign at the top
  building(-1.5, -24, 6, 22, 6, { lit: .16, base: '#0e1528' });
  building(5, -28, 5, 14, 5, { lit: .14 });
  building(-7, -26, 5, 12, 5, { lit: .14 });
  // right: the big glass building that carries the question screen
  building(10.5, -9, 9, 18, 9, { lit: .12, glass: true, base: '#0a1230', rotY: -.35 });

  // ============================================================ signs and adverts
  const signs = [];   // { mesh, colour } for the ones that glow onto the road
  function panel(tex, w, h, x, y, z, rotY = 0, glow = 1.1, frame = true) {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color().setScalar(glow) }));
    g.add(face);
    if (frame) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w + .18, h + .18, .2), DARK);
      f.position.z = -.12; g.add(f);
    }
    g.position.set(x, y, z); g.rotation.y = rotY;
    scene.add(g);
    return face;
  }
  const ADS = [
    { bg: ['#ff2a6d', '#ff7a3d'], lines: ['GO, BUILDER', 'POINT'], shape: 'circle' },
    { bg: ['#1de9b6', '#1565c0'], lines: ['BUILD · SHIP', 'REPEAT'], shape: 'bars' },
    { bg: ['#7c4dff', '#f50057'], lines: ['未来をつくる', 'BUILD THE FUTURE'], jp: true },
    { bg: ['#ffd600', '#ff6d00'], lines: ['ASK', 'ANYTHING'], fg: '#1a1020' },
    { bg: ['#00b0ff', '#00e5ff'], lines: ['AI BUILDER', 'SCHOOL'], fg: '#06122a' },
    { bg: ['#ff4081', '#7c4dff'], lines: ['質問どうぞ', 'QUESTIONS WELCOME'], jp: true },
  ];
  const adTextures = ADS.map((a) => advert(512, 256, a));
  // left stack: big ads that slowly crossfade to the next one now and then
  const rotating = [];
  for (const [w, h, x, y, z, ry, start] of [
    [4.6, 2.3, -10.6, 8.2, -8.6, .5, 0], [4.6, 2.3, -10.6, 5.4, -8.6, .5, 2],
    // the centre tower's big screen, like the bright ad screen in the middle of the reference
    [4.8, 3.2, -1.5, 8.4, -20.9, 0, 5], [3.2, 1.6, 4.6, 7.4, -25.4, 0, 3],
  ]) {
    const face = panel(adTextures[start % ADS.length], w, h, x, y, z, ry, .85);
    // crossfade: a second face over the first that fades in with the next advert
    const over = face.clone(); over.material = face.material.clone(); over.material.transparent = true; over.material.opacity = 0;
    over.position.z = .01; face.parent.add(over);
    rotating.push({ face, over, i: start % ADS.length, at: rnd() * 12, fading: -1 });
    signs.push({ obj: face, colour: ['#ff4a8a', '#1de9b6', '#9a6bff', '#ffc21a', '#2ac8ff', '#ff4fb0'][start % 6], w });
  }
  // the tower's big top sign, and vertical neon signs on the left buildings
  panel(advert(512, 192, { bg: ['#00e676', '#00bfa5'], lines: ['ビルダーズ', 'BUILDERS'], jp: true, fg: '#032015' }), 4.4, 1.65, -1.5, 13.4, -20.9, 0, 1.1);
  panel(advert(512, 160, { bg: ['#1e88ff', '#40c4ff'], lines: ['AI BUILDER SCHOOL'], fg: '#ffffff' }), 4.4, 1.35, -1.5, 11.2, -20.9, 0, 1.05);
  signs.push({ obj: null, x: -1.5, z: -20.9, colour: '#2cff9a', w: 5 });
  for (const [text, colour, x, y, z, ry, h] of [
    ['カラオケ', '#ff3d9a', -5.3, 6.5, -6.2, .5, 4], ['ラーメン', '#ffd23f', -13.4, 5, -2.4, .9, 4], ['未来', '#3df2ff', -6.5, 11.5, -6.6, .5, 2.4],
    ['ビルダー', '#b388ff', -16.2, 6.5, -2.4, .9, 4.2],
  ]) {
    panel(verticalSign(text, colour), .9, h, x, y, z, ry, 1.15);
    signs.push({ obj: null, x, z, colour, w: .9 });
  }

  // ============================================================ the question screen (giant billboard, right)
  // The TV's content (screenTex) on an LED billboard: a faint pixel grid that fades out when zoomed in, so the QR
  // stays crisp. It glows onto the street below.
  const SCREEN_W = 6.2, SCREEN_H = SCREEN_W * 768 / 1024;
  const billboard = new THREE.Group();
  billboard.position.set(6.4, 5.5, -4.6);
  billboard.rotation.y = -.35;
  scene.add(billboard);
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: screenTex }, uTime: { value: 0 }, uStatic: { value: 0 }, uFocus: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D uMap; uniform float uFocus;
      void main(){
        vec3 col = texture2D(uMap, vUv).rgb * 1.35;
        vec2 cell = fract(vUv * vec2(256., 192.));
        float led = smoothstep(.0, .18, cell.x) * smoothstep(1., .82, cell.x) * smoothstep(.0, .18, cell.y) * smoothstep(1., .82, cell.y);
        col *= mix(.72 + .28 * led, 1., uFocus);          // LED grid, gone when the camera is in close
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
  billboard.add(screen);
  {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(SCREEN_W + .4, SCREEN_H + .4, .35), new THREE.MeshStandardMaterial({ color: 0x1a1d2c, roughness: .4, metalness: .6, flatShading: true }));
    frame.position.z = -.2; billboard.add(frame);
    // neon edge round the screen
    // neon edge round the screen: a 4-sided ring turned square, then stretched to the screen's shape
    const edgeWrap = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.TorusGeometry(Math.SQRT2 / 2, .02, 3, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d9a).multiplyScalar(1.6), toneMapped: false }));
    edge.rotation.z = Math.PI / 4;
    edgeWrap.add(edge);
    edgeWrap.scale.set(SCREEN_W + .5, SCREEN_H + .5, 1);
    edgeWrap.position.z = .02; billboard.add(edgeWrap);
    // a name sign under the screen, like the shop sign under the big screen in the reference
    const nameSign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, .7), new THREE.MeshBasicMaterial({ toneMapped: false,
      map: advert(704, 112, { bg: ['#0b1a3a', '#0b1a3a'], fg: '#7fe3ff', lines: ['AI BUILDER SCHOOL'] }) }));
    nameSign.position.set(-.6, -SCREEN_H / 2 - .75, .05); billboard.add(nameSign);
  }
  const screenLight = new THREE.PointLight(0xffb060, 10, 18, 1.6);   // the screen's glow on the street
  screenLight.position.set(0, -1.5, 2.5);
  billboard.add(screenLight);
  // alarm beacon on the billboard's top edge, and a big flip clock on the ledge below it
  const beacon = makeBeacon();
  beacon.group.position.set(SCREEN_W / 2 - .5, SCREEN_H / 2 + .2, 0);
  beacon.group.scale.setScalar(2.4);
  billboard.add(beacon.group);
  const clock = makeFlipClock();
  clock.group.position.set(SCREEN_W / 2 - 1.1, -SCREEN_H / 2 - 1.1, .1);
  clock.group.scale.setScalar(2.2);
  billboard.add(clock.group);

  scene.updateMatrixWorld(true);
  const screenWorld = screen.getWorldPosition(new THREE.Vector3());
  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion()));
  // zoom: close enough that the screen fills most of the view
  const FOCUS_D = (SCREEN_H / 2) / Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * 1.25;
  const FOCUS = { look: screenWorld.clone(), pos: screenWorld.clone().addScaledVector(screenNormal, FOCUS_D) };

  // ============================================================ reflections of the signs on the wet road
  scene.updateMatrixWorld(true);
  for (const s of signs) {
    const p = s.obj ? s.obj.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(s.x, 0, s.z);
    reflect(p.x, Math.max(p.z + 1, -10), Math.max(.8, s.w * .6), s.colour, .16, 10);
  }
  reflect(screenWorld.x, screenWorld.z + .5, SCREEN_W * .7, '#ffb060', .24, 12);

  // ============================================================ street furniture
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e3e, roughness: .4, metalness: .7, flatShading: true });
  // traffic signals at the corners (walk lights fade between red and green, never blink)
  const walkLights = [];
  for (const [x, z, ry] of [[-6.2, -9.6, 0], [5.8, -9.4, 0], [-7.5, 5.4, Math.PI], [6.8, 5.6, Math.PI]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, 4.2, 6), metal);
    pole.position.set(x, 2.1, z); scene.add(pole);
    const box = new THREE.Mesh(new THREE.BoxGeometry(.4, .9, .3), metal);
    box.position.set(x, 3.4, z + (ry ? -.2 : .2)); scene.add(box);
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(.26, .26), new THREE.MeshBasicMaterial({ color: 0xff2040, toneMapped: false }));
    lamp.position.set(x, 3.55, z + (ry ? -.36 : .36)); lamp.rotation.y = ry; scene.add(lamp);
    walkLights.push(lamp);
  }
  // foreground: a big round street sign on a pole, left (a dark silhouette framing the shot, like the reference)
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, 6, 6), metal);
    pole.position.set(-7.4, 3, 6.2); scene.add(pole);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .08, 16), new THREE.MeshStandardMaterial({ color: 0x1c2234, roughness: .5, metalness: .4, flatShading: true }));
    disc.rotation.x = Math.PI / 2; disc.rotation.z = .2; disc.position.set(-7.0, 4.6, 6.3); scene.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, .06, 4, 16), new THREE.MeshStandardMaterial({ color: 0x8a9ab8, roughness: .4, metalness: .6 }));
    ring.position.copy(disc.position); ring.rotation.y = .2; scene.add(ring);
    // a small sign board on a post, front centre-right
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.6, 5), metal);
    post.position.set(3.6, .55, 6.4); post.scale.y = .7; scene.add(post);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(.8, .58), new THREE.MeshStandardMaterial({ roughness: .6,
      map: advert(352, 256, { bg: ['#e8ecf2', '#c9d2de'], fg: '#14326a', lines: ['質問', 'ASK HERE'], jp: true }) }));
    board.position.set(3.6, 1.3, 6.45); board.rotation.y = -.15; scene.add(board);
  }

  // ============================================================ the crowd: people under umbrellas (instanced)
  const PEOPLE = 70;
  const bodyGeo = new THREE.CylinderGeometry(.17, .22, 1.15, 6); bodyGeo.translate(0, .58, 0);
  const headGeo = new THREE.IcosahedronGeometry(.13, 0); headGeo.translate(0, 1.3, 0);
  const umbGeo = new THREE.ConeGeometry(.62, .28, 8, 1, true); umbGeo.translate(0, 1.72, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: .8, flatShading: true }), PEOPLE);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x2a2028, roughness: .9, flatShading: true }), PEOPLE);
  const umbrellas = new THREE.InstancedMesh(umbGeo, new THREE.MeshStandardMaterial({ roughness: .3, metalness: .1, transparent: true, opacity: .62, side: THREE.DoubleSide, flatShading: true, depthWrite: false }), PEOPLE);
  const COATS = [0x1a1c26, 0x22202c, 0x2a2633, 0x161a22, 0x3a2a30, 0x24303a].map((h) => new THREE.Color(h));
  const UMBS = [0xe8ecf4, 0xdfe6f2, 0xf2f2f2, 0xcfd8e8, 0xff6aa0, 0x7fd0ff].map((h) => new THREE.Color(h));
  const people = [];
  for (let i = 0; i < PEOPLE; i++) {
    const home = new THREE.Vector3(-13 + rnd() * 26, .16, -12.8 + rnd() * 2.6);   // waiting on the far sidewalk
    people.push({ home, pos: home.clone(), target: null, speed: .9 + rnd() * .5, phase: rnd() * 6, scale: .9 + rnd() * .2, walking: false, delay: 0 });
    bodies.setColorAt(i, pick(COATS));
    umbrellas.setColorAt(i, rnd() < .82 ? UMBS[Math.floor(rnd() * 4)] : pick(UMBS));
  }
  for (const m of [bodies, heads, umbrellas]) { m.frustumCulled = false; scene.add(m); }
  const o3 = new THREE.Object3D();
  function placePeople(t) {
    people.forEach((p, i) => {
      const sway = p.walking ? Math.sin(t * 6 + p.phase) * .04 : Math.sin(t * .8 + p.phase) * .015;
      o3.position.copy(p.pos); o3.position.y += p.walking ? Math.abs(Math.sin(t * 6 + p.phase)) * .03 : 0;
      o3.rotation.set(0, p.face ?? 0, sway); o3.scale.setScalar(p.scale);
      o3.updateMatrix();
      bodies.setMatrixAt(i, o3.matrix); heads.setMatrixAt(i, o3.matrix);
      o3.rotation.set(sway * 2, p.face ?? 0, sway * 2 + Math.sin(t * .5 + p.phase) * .05); o3.updateMatrix();
      umbrellas.setMatrixAt(i, o3.matrix);
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = umbrellas.instanceMatrix.needsUpdate = true;
  }

  // ============================================================ rain, and ripples on the road
  const RAIN = 1400;
  const rainGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array(RAIN * 2 * 3), off = new Float32Array(RAIN * 2);
    for (let i = 0; i < RAIN; i++) {
      const x = (rnd() - .5) * 30, y = rnd() * 14, z = -16 + rnd() * 26;
      pos.set([x, y, z, x - .04, y - .45, z], i * 6);
      off[i * 2] = off[i * 2 + 1] = rnd() * 14;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rainGeo.setAttribute('off', new THREE.BufferAttribute(off, 1));
  }
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float off; uniform float uTime; varying float vA;
      void main(){ vec3 p = position; p.y = mod(p.y - uTime * 16. - off, 14.) - .2; p.x -= (14. - p.y) * .03;
        vA = smoothstep(0., 1.5, p.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
    fragmentShader: `varying float vA; uniform float uFade; void main(){ gl_FragColor = vec4(vec3(.55, .65, .85) * .16 * vA * uFade, 1.); }`,
  });
  scene.add(new THREE.LineSegments(rainGeo, rainMat));
  const rippleGeo = new THREE.RingGeometry(.8, 1, 16); rippleGeo.rotateX(-Math.PI / 2);
  const ripples = Array.from({ length: 36 }, () => {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0x9ab4e0, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(-8 + rnd() * 16, .02, -6 + rnd() * 15); m.userData.age = rnd(); scene.add(m);
    return m;
  });

  // ============================================================ lights
  scene.add(new THREE.HemisphereLight(0x3a4a8a, 0x05060c, 1.6));
  for (const [x, y, z, c, i] of [[-8, 6, -5, 0xff3d9a, 40], [-2, 10, -18, 0x2cff9a, 30], [8, 3, 2, 0x2ac8ff, 16], [-4, 3, 4, 0x6a7bff, 10]]) {
    const l = new THREE.PointLight(c, i, 26, 1.5);
    l.position.set(x, y, z); scene.add(l);
  }

  // ============================================================ floating logo + who's on stage (top-left, as in theme 1)
  const logo = new THREE.Group();
  {
    const canvas = floatingLogo(logoImg, 1400);
    const tex = canvasTex(canvas); tex.anisotropy = 8;
    const W = 3.6, H = W * canvas.height / canvas.width;
    const geo = new THREE.PlaneGeometry(W, H);
    logo.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: tex, alphaTest: .5, roughness: .6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .45, side: THREE.DoubleSide,
    })));
    const blockOnly = document.createElement('canvas');
    blockOnly.width = canvas.width; blockOnly.height = canvas.height;
    const bx = blockOnly.getContext('2d');
    bx.drawImage(canvas, 0, 0);
    bx.clearRect(0, 0, canvas.width, Math.round(1400 * .02 + 1400 * .07) - 2);
    const edge = new THREE.MeshStandardMaterial({ color: 0x0a0c1a, alphaMap: new THREE.CanvasTexture(blockOnly), alphaTest: .5, roughness: .8 });
    for (let i = 1; i <= 3; i++) { const m = new THREE.Mesh(geo, edge); m.position.z = -i * .04; logo.add(m); }
    logo.position.set(-1.9, 4.6, 2.0);
    logo.rotation.y = .12;
    scene.add(logo);
    logo.userData.bottom = -H / 2;
  }
  const LOGO_Y = logo.position.y;
  const presenterCanvas = document.createElement('canvas');
  presenterCanvas.width = 1400; presenterCanvas.height = 260;
  const presenterTex = canvasTex(presenterCanvas);
  const presenterMat = new THREE.MeshStandardMaterial({
    map: presenterTex, transparent: true, depthWrite: false, roughness: .7, emissive: 0xffffff, emissiveMap: presenterTex, emissiveIntensity: .4, opacity: 0,
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
    x.fillStyle = 'rgb(236,240,255)';
    x.shadowColor = 'rgba(255,61,154,.5)'; x.shadowBlur = 16;
    let size = 112;
    const name = p.name.toUpperCase();
    x.letterSpacing = '4px';
    do { x.font = `${size}px Anton`; } while (x.measureText(name).width > 1360 && (size -= 4) > 40);
    x.fillText(name, 20, 125);
    if (p.title) {
      x.fillStyle = 'rgba(200,214,255,.8)';
      let ts = 56;
      do { x.font = `${ts}px Anton`; } while (x.measureText(p.title).width > 1360 && (ts -= 2) > 24);
      x.letterSpacing = '6px';
      x.fillText(p.title.toUpperCase(), 22, 215);
    }
    presenterTex.needsUpdate = true;
  }

  // ============================================================ events: a taxi, or the crowd crossing
  const life = (() => {
    function makeTaxi() {
      const g = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: .25, metalness: .7, flatShading: true });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, .55, 1.55), paint); body.position.y = .55; g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, .5, 1.4), paint); cabin.position.set(-.1, 1.05, 0); g.add(cabin);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, .36, 1.42), new THREE.MeshStandardMaterial({ color: 0x223048, roughness: .1, metalness: .8 }));
      glass.position.set(-.1, 1.06, 0); g.add(glass);
      const roofSign = new THREE.Mesh(new THREE.BoxGeometry(.5, .2, .25), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8ff4a).multiplyScalar(1.4), toneMapped: false }));
      roofSign.position.set(-.1, 1.42, 0); g.add(roofSign);
      for (const [x, z] of [[1.15, .72], [1.15, -.72], [-1.15, .72], [-1.15, -.72]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .2, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: .8 }));
        w.rotation.x = Math.PI / 2; w.position.set(x, .3, z); g.add(w);
      }
      const head = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(1.2), toneMapped: false });
      const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(1.6), toneMapped: false });
      for (const z of [.5, -.5]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(.06, .14, .3), head); h.position.set(1.81, .62, z); g.add(h);
        const t = new THREE.Mesh(new THREE.BoxGeometry(.06, .12, .3), tail); t.position.set(-1.81, .62, z); g.add(t);
      }
      // headlight glow on the wet road ahead, and a soft light
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.8), new THREE.MeshBasicMaterial({ map: streakTex, color: 0xfff0c8, transparent: true, opacity: .22, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.rotation.set(-Math.PI / 2, 0, Math.PI / 2); beam.position.set(4.2, .02, 0); g.add(beam);
      const light = new THREE.PointLight(0xfff0d0, 4, 9, 1.6); light.position.set(2.6, .8, 0); g.add(light);
      return g;
    }
    function taxi() {
      const car = makeTaxi();
      const dir = rnd() < .5 ? 1 : -1;
      const z = dir > 0 ? -1.2 : -5.6;          // drives on the near lane one way, far lane the other
      car.rotation.y = dir > 0 ? 0 : Math.PI;
      scene.add(car);
      let x = -dir * 26;
      return {
        update(dt) {
          // slows for the crossing, then pulls away
          const near = 1 - Math.min(1, Math.abs(x) / 9);
          x += dir * dt * (9 - near * 4.5);
          car.position.set(x, 0, z);
          if (Math.abs(x) > 27) { scene.remove(car); car.traverse((m) => { m.geometry?.dispose(); }); return false; }
        },
      };
    }
    // the walk signal turns (an eased fade to green), the crowd crosses the scramble, then it fades back to red
    const RED = new THREE.Color(0xff2040), GREEN = new THREE.Color(0x30ff9a);
    let walk = 0, walkWant = 0;
    function crossing() {
      walkWant = 1;
      const walkers = people.filter(() => rnd() < .45);
      walkers.forEach((p) => {
        p.walking = true; p.delay = rnd() * 2.2;
        const side = rnd() < .5 ? -1 : 1, diagonal = rnd() < .35;
        p.target = diagonal ? new THREE.Vector3(side * (10 + rnd() * 4), .02, 3 + rnd() * 2) : new THREE.Vector3(-4 + rnd() * 8.5, .02, 4.6 + rnd() * 1.2);
        p.face = Math.atan2(p.target.x - p.pos.x, p.target.z - p.pos.z);
      });
      let age = 0, back = false;
      return {
        update(dt) {
          age += dt;
          let moving = false;
          for (const p of walkers) {
            if (age < p.delay) { moving = true; continue; }
            const to = back ? p.home : p.target;
            const d = to.clone().sub(p.pos); d.y = 0;
            const len = d.length();
            if (len > .05) { p.pos.addScaledVector(d, Math.min(1, (p.speed * dt) / len)); moving = true; }
          }
          if (!moving && !back && age > 4) {
            // everyone over: the light turns red; they drift back to the far side out of view ("new" crowd)
            walkWant = 0; back = true;
            for (const p of walkers) { p.pos.copy(p.home); p.walking = false; p.face = 0; }
            return false;
          }
        },
      };
    }
    const EVENTS = { taxi, crossing };
    let active = null, last = null, wait = 6;
    return {
      update(t, dt) {
        walk += (walkWant - walk) * Math.min(1, dt * 2);
        for (const l of walkLights) l.material.color.copy(RED).lerp(GREEN, walk).multiplyScalar(1.4);
        if (active) { if (active.update(dt, t) === false) { active = null; wait = 7 + rnd() * 9; } }
        else if ((wait -= dt) <= 0) {
          const names = Object.keys(EVENTS).filter((n) => n !== last);
          last = names[Math.floor(rnd() * names.length)];
          active = EVENTS[last]();
        }
      },
      play(n) { if (!active) { active = EVENTS[n](); last = n; } },
    };
  })();

  // ============================================================ post
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .7, .6, .8);
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
        c.rgb *= .5 + .5 * v;
        c.rgb = mix(c.rgb, c.rgb * vec3(.92, .98, 1.1), .5);      // a cool, rainy cast
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
      rainMat.uniforms.uTime.value = t;
      rainMat.uniforms.uFade.value = 1 - focus;          // no rain across the QR when zoomed in
      for (const r of ripples) {
        r.userData.age += dt * 1.3;
        if (r.userData.age > 1) { r.userData.age = 0; r.position.set(-8 + Math.random() * 16, .02, -6 + Math.random() * 15); }
        const a = r.userData.age;
        r.scale.setScalar(.05 + a * .3);
        r.material.opacity = (1 - a) * .35;
      }
      // adverts: every so often one slowly crossfades to the next
      for (const r of rotating) {
        r.at -= dt;
        if (r.fading < 0 && r.at <= 0) { r.i = (r.i + 1) % ADS.length; r.over.material.map = adTextures[r.i]; r.over.material.needsUpdate = true; r.fading = 0; }
        if (r.fading >= 0) {
          r.fading = Math.min(1, r.fading + dt / 1.6);
          r.over.material.opacity = r.fading;
          if (r.fading >= 1) { r.face.material.map = adTextures[r.i]; r.face.material.needsUpdate = true; r.over.material.opacity = 0; r.fading = -1; r.at = 10 + Math.random() * 12; }
        }
      }
      placePeople(t);
      life.update(t, dt);

      logo.position.y = LOGO_Y + Math.sin(t * .6) * .12;
      logo.rotation.y = .12 + Math.sin(t * .23) * .07;
      logo.rotation.z = Math.sin(t * .31 + 1) * .015;

      screenMat.uniforms.uFocus.value = focus;
      glow += ((tvScreen.isLive ? 1 : 0) - glow) * Math.min(1, dt * 1.5);
      screenLight.intensity = 9 + glow * 4;
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
      camera.position.x += simplex.noise(t * .07, 1) * .14 * drift;
      camera.position.y += simplex.noise(t * .09, 2) * .06 * drift;
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
      for (const tex of adTextures) tex.dispose();
      for (const p of composer.passes) p.dispose?.();
      composer.dispose();
    },

    debug: { scene, camera, logo, life },
  };
}
