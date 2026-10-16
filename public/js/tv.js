// The TV, as a stylised hand-painted game prop: a chunky chamfered wooden cabinet that tapers a little
// towards the top, a thick bezel, oversized low-poly knobs, splayed stubby legs and bent rabbit ears.
// Faces get flat painted colours (lighter on top, darker underneath) to match the cave's art style,
// with scuffs and worn patches.
// The glass shows `screenTex` through a CRT shader (barrel, scanlines, static, rolling band).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeStatic } from './merge.js';

const hex = (h) => new THREE.Color(h);
const SCUFF = hex(0xc9a072);

// flat per-face colour: light from above, a little random variation, like painted planes
function painted(geo, base, { top = .25, bottom = -.3, jitter = .06, seed = 1, wear = 0 } = {}) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  geo.computeVertexNormals();
  const n = geo.attributes.normal, col = new Float32Array(n.count * 3), c = new THREE.Color();
  for (let f = 0; f < n.count; f += 3) {
    const ny = (n.getY(f) + n.getY(f + 1) + n.getY(f + 2)) / 3;
    const r = Math.sin(f * 12.9898 + seed * 78.233) * 43758.5453;
    const rnd = r - Math.floor(r);
    c.copy(base).multiplyScalar(1 + (ny > 0 ? ny * top : -ny * bottom) + (rnd - .5) * jitter);
    if (wear) {   // scuffs (darker) and rubbed-through paint (lighter, toward bare wood)
      const w = Math.sin(f * 4.137 + seed * 9.1) * 9631.7; const wr = w - Math.floor(w);
      if (wr < wear) c.multiplyScalar(.55 + rnd * .2);
      else if (wr > 1 - wear * .6) c.lerp(SCUFF, .45);
    }
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function makeTV(screenTex) {
  const tv = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .75, metalness: .05 });
  const part = (geo, color, pos, rot = [0, 0, 0], opts) => {
    const m = new THREE.Mesh(painted(geo, hex(color), opts), mat);
    m.position.set(...pos); m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true;
    tv.add(m); return m;
  };

  const BW = 2.3, BH = 1.75, BD = 1.45, LEG = .32;
  // cabinet: chamfered box, tapered toward the top for a cartoon silhouette
  const body = new RoundedBoxGeometry(BW, BH, BD, 1, .14);
  {
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 - (p.getY(i) / BH + .5) * .07;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * (1 - (p.getY(i) / BH + .5) * .04));
    }
  }
  part(body, 0x8a4a26, [0, LEG + BH / 2, 0], [0, 0, 0], { top: .45, bottom: -.45, wear: .12, seed: 3 });
  // a lighter wooden lip around the front
  part(new RoundedBoxGeometry(BW * .97, BH * .95, .08, 1, .04), 0xa8602f, [0, LEG + BH / 2, BD / 2 - .02]);

  // chunky bezel + glass
  const SX = -.3, SY = LEG + BH / 2 + .02;
  part(new RoundedBoxGeometry(1.62, 1.3, .14, 1, .1), 0x2b1a12, [SX, SY, BD / 2 + .03], [0, 0, 0], { top: .2 });
  const SW = 1.42, SH = 1.065;
  const screenGeo = new THREE.PlaneGeometry(SW, SH, 32, 24);
  {
    const p = screenGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / (SW / 2), y = p.getY(i) / (SH / 2);
      p.setZ(i, .06 * (1 - x * x * .6) * (1 - y * y * .6));    // tube bulge
    }
    screenGeo.computeVertexNormals();
  }
  const screenMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: screenTex }, uTime: { value: 0 }, uStatic: { value: 0 }, uFocus: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D uMap; uniform float uTime, uStatic, uFocus;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 c = vUv - .5;
        vec2 uv = .5 + c * (1. + .05 * dot(c, c));
        uv.x += sin(uv.y * 38. + uTime * 2.7) * .0006 * (1. + uStatic * 14.) * (1. - uFocus);
        float ab = .0011 * (1. - uFocus);
        vec3 col = vec3(texture2D(uMap, uv + vec2(ab, 0.)).r, texture2D(uMap, uv).g, texture2D(uMap, uv - vec2(ab, 0.)).b);
        col *= mix(.86 + .14 * sin(vUv.y * 768. * 3.14159), 1., uFocus * .7);
        float roll = fract(vUv.y * .6 - uTime * .06);
        col += smoothstep(0., .06, roll) * smoothstep(.14, .06, roll) * .03 * (1. - uFocus);
        float n = hash(floor(vUv * vec2(300., 225.)) + fract(uTime * 9.) * 97.);
        col = mix(col, vec3(n * .95, n * .82, n * .62), uStatic);
        col *= mix(.5 + .5 * smoothstep(.78, .3, length(c * vec2(1.05, 1.2))), 1., uFocus * .8);
        if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) col = vec3(0.);
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(SX, SY, BD / 2 + .1);
  tv.add(screen);

  // control column: two big cream knobs and a slatted speaker
  const CX = BW / 2 - .34;
  for (const [y, rot] of [[.42, .5], [.02, -.9]]) {
    const knob = part(new THREE.CylinderGeometry(.15, .18, .16, 7), 0xe6cfa0, [CX, SY + y, BD / 2 + .06], [Math.PI / 2, rot, 0], { top: .3 });
    const tick = new THREE.Mesh(painted(new THREE.BoxGeometry(.04, .04, .14), hex(0x3a2216)), mat);
    tick.position.set(0, .09, -.06);
    knob.add(tick);
  }
  for (let i = 0; i < 4; i++) part(new THREE.BoxGeometry(.4, .045, .05), 0x3a2216, [CX, SY - .32 - i * .1, BD / 2 + .01]);
  const led = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3010, toneMapped: false }));
  led.position.set(CX, SY - .22 + .02, BD / 2 + .04);
  tv.add(led);

  // splayed stubby legs
  for (const [x, z] of [[-.85, -.45], [.85, -.45], [-.85, .45], [.85, .45]]) {
    part(new THREE.CylinderGeometry(.07, .05, LEG + .06, 5), 0x5a2f18, [x * 1.05, LEG / 2, z * 1.05], [z * .35, 0, -x * .25]);
  }

  // bent rabbit ears with ball tips
  part(new THREE.SphereGeometry(.2, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x3a2216, [.25, LEG + BH - .02, -.15]);
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(.25 + s * .06, LEG + BH + .1, -.15),
      new THREE.Vector3(.25 + s * .38, LEG + BH + .75, -.2),
      new THREE.Vector3(.25 + s * .62, LEG + BH + 1.3, -.32 + s * .05),
    ]);
    part(new THREE.TubeGeometry(curve, 6, .028, 5), 0xc9b48a, [0, 0, 0]);
    const tip = curve.getPoint(1);
    part(new THREE.IcosahedronGeometry(.06, 0), 0xe6cfa0, [tip.x, tip.y, tip.z]);
  }

  const tvLight = new THREE.PointLight(0xffa04a, 2.5, 0, 1.8);
  tvLight.position.set(SX, SY, BD / 2 + .9);
  tv.add(tvLight);

  // ~25 cabinet pieces share one painted material: bake them into a single draw call
  mergeStatic(tv, (m) => m === mat);

  return { tv, screen, screenMat, tvLight, led };
}
