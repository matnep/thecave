// A hoard under the TV: heaps of gold coins, a small open chest spilling gold, scattered gems,
// twinkling glints, a warm gold glow, and a live amber clock on the chest's front.
// Everything is dropped onto the real rock/floor surfaces
// with a raycast so nothing floats or sinks.
import * as THREE from 'three';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/**
 * @param scene
 * @param surfaces  meshes to rest things on (the TV's rock, the floor)
 * @param heaps     [{ x, z, r, h, n }]  coin heaps: centre, radius, height, coin count
 * @param chestAt   { x, z, rotY }
 */
export function makeTreasure(scene, surfaces, heaps, chestAt) {
  const group = new THREE.Group();
  scene.add(group);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const groundAt = (x, z) => {
    ray.set(new THREE.Vector3(x, 20, z), down);
    const hit = ray.intersectObjects(surfaces, false)[0];
    return hit ? hit.point.y : 0;
  };

  const gold = new THREE.MeshStandardMaterial({ color: 0xffc43d, metalness: 1, roughness: .28, emissive: 0x7a4300, emissiveIntensity: .75 });

  // ---- coins
  const coinGeo = new THREE.CylinderGeometry(.075, .075, .018, 10);
  const total = heaps.reduce((n, h) => n + h.n, 0) + 10;
  const coins = new THREE.InstancedMesh(coinGeo, gold, total);
  coins.castShadow = coins.receiveShadow = true;
  const o = new THREE.Object3D();
  const tops = [];   // spots near the top of each heap, for the glints
  let i = 0;
  for (const h of heaps) {
    for (let k = 0; k < h.n; k++, i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * h.r;
      const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      const lift = h.h * (1 - d / h.r) * (.6 + rnd() * .4);       // cone-shaped heap
      o.position.set(x, groundAt(x, z) + .01 + lift, z);
      o.rotation.set((rnd() - .5) * 1.2, rnd() * 6.28, (rnd() - .5) * 1.2);
      o.updateMatrix();
      coins.setMatrixAt(i, o.matrix);
      if (lift > h.h * .55) tops.push(o.position.clone());
    }
  }
  // a few strays rolled away down the rock
  for (; i < total; i++) {
    const h = heaps[i % heaps.length];
    const x = h.x + (rnd() - .5) * .8, z = h.z + .15 + rnd() * .45;
    o.position.set(x, groundAt(x, z) + .012, z);
    o.rotation.set((rnd() - .5) * .3, rnd() * 6.28, (rnd() - .5) * .3);
    o.updateMatrix();
    coins.setMatrixAt(i, o.matrix);
  }
  group.add(coins);

  // ---- gems
  const GEMS = [0xa0102e, 0x137a44, 0x1d3fae];   // ruby, emerald, sapphire: deep, so the gold stays the star
  for (let g = 0; g < 7; g++) {
    const color = GEMS[g % GEMS.length];
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.035 + rnd() * .02, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .25, metalness: .3, roughness: .1, flatShading: true }));
    const h = heaps[g % heaps.length];
    const a = rnd() * 6.28, d = Math.sqrt(rnd()) * h.r * .9;
    const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
    gem.position.set(x, groundAt(x, z) + h.h * (1 - d / h.r) * .8 + .05, z);
    gem.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    gem.scale.y = 1.4;
    gem.castShadow = true;
    group.add(gem);
  }

  // ---- clock face for the chest front: amber digits over faint "88:88" ghost segments
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = 512; clockCanvas.height = 220;
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  clockTex.colorSpace = THREE.SRGBColorSpace;
  clockTex.anisotropy = 8;
  let lastClock = '';
  function drawClock(now = new Date()) {
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    const colon = now.getSeconds() % 2 === 0;
    const key = hh + mm + colon;
    if (key === lastClock) return;
    lastClock = key;
    const x = clockCanvas.getContext('2d');
    x.fillStyle = '#140b06';
    x.fillRect(0, 0, 512, 220);
    x.strokeStyle = '#3a2412'; x.lineWidth = 10;
    x.strokeRect(5, 5, 502, 210);
    x.font = '200px VT323';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,150,40,.09)';
    x.fillText('88:88', 256, 116);
    x.shadowColor = 'rgba(255,140,30,.9)'; x.shadowBlur = 18;
    x.fillStyle = '#ffb238';
    x.fillText(`${hh}${colon ? ':' : ' '}${mm}`, 256, 116);
    clockTex.needsUpdate = true;
  }

  // ---- small open chest
  if (chestAt) {
    const chest = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: .8, flatShading: true });
    const band = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: .8, roughness: .4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(.62, .34, .4), wood);
    box.position.y = .17; chest.add(box);
    drawClock();
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(.44, .19), new THREE.MeshBasicMaterial({ map: clockTex, toneMapped: false }));
    clock.position.set(0, .16, .202);
    chest.add(clock);
    for (const bx of [-.275, .275]) {   // bands at the corners, clear of the clock
      const b = new THREE.Mesh(new THREE.BoxGeometry(.05, .36, .42), band);
      b.position.set(bx, .17, 0); chest.add(b);
    }
    const lid = new THREE.Group();
    lid.position.set(0, .34, -.2);
    const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .62, 8, 1, false, 0, Math.PI), wood);
    lidMesh.rotation.z = Math.PI / 2; lidMesh.position.z = .2;
    lid.add(lidMesh);
    lid.rotation.x = -1.9;            // flung open
    chest.add(lid);
    // gold heaped inside, glowing
    const inside = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    inside.scale.set(1, .45, .62); inside.position.y = .3;
    chest.add(inside);
    chest.position.set(chestAt.x, groundAt(chestAt.x, chestAt.z), chestAt.z);
    chest.rotation.y = chestAt.rotY || 0;
    chest.scale.setScalar(1.25);
    chest.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    group.add(chest);
    tops.push(chest.position.clone().add(new THREE.Vector3(0, .42, 0)));
  }

  // ---- glints: little four-pointed stars that twinkle on and off
  const N = Math.min(28, tops.length * 2);
  const gPos = new Float32Array(N * 3), gSeed = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const p = tops[Math.floor(rnd() * tops.length)];
    gPos.set([p.x + (rnd() - .5) * .2, p.y + .04 + rnd() * .05, p.z + (rnd() - .5) * .2], k * 3);
    gSeed[k] = rnd() * 100;
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute('seed', new THREE.BufferAttribute(gSeed, 1));
  const glintMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `attribute float seed; uniform float uTime; varying float vA;
      void main(){
        float ph = fract(uTime * (.18 + fract(seed) * .25) + seed);
        vA = pow(max(0., 1. - abs(ph - .5) * 7.), 2.);          // brief flash, then dark for a while
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_PointSize = 70. * vA / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main(){
        vec2 p = gl_PointCoord - .5;
        float star = max(.012 / (abs(p.x) + .012) * smoothstep(.5, 0., abs(p.y)), .012 / (abs(p.y) + .012) * smoothstep(.5, 0., abs(p.x)));
        float core = smoothstep(.18, 0., length(p));
        gl_FragColor = vec4(vec3(1., .9, .6) * (star * .5 + core) * vA * 3., 1.); }`,
  });
  group.add(new THREE.Points(gGeo, glintMat));


  return {
    update(t) {
      drawClock();
      glintMat.uniforms.uTime.value = t;
    },
  };
}
