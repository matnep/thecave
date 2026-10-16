// A hoard under the TV, all gold: heaps of coins, a small open chest spilling gold, a crown,
// a couple of swords, and twinkling glints.
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
  const goldFlat = new THREE.MeshStandardMaterial({ color: 0xffc43d, metalness: 1, roughness: .3, emissive: 0x7a4300, emissiveIntensity: .7, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, metalness: .9, roughness: .25, emissive: 0x4a3c30, flatShading: true });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2216, roughness: .8, flatShading: true });

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

  // ---- crown: a faceted gold band with points, tipped with little gold balls, tipped over on the biggest heap
  {
    const h = heaps[0];
    const crown = new THREE.Group();
    const band = new THREE.CylinderGeometry(.13, .12, .1, 10, 1, true);
    crown.add(new THREE.Mesh(band, goldFlat));
    const POINTS = 5;
    for (let k = 0; k < POINTS; k++) {
      const a = (k / POINTS) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(.035, .11, 4), goldFlat);
      spike.position.set(Math.cos(a) * .125, .1, Math.sin(a) * .125);
      spike.rotation.set(Math.sin(a) * .25, 0, -Math.cos(a) * .25);   // leaning out a touch
      crown.add(spike);
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.018, 0), goldFlat);
      ball.position.set(Math.cos(a) * .14, .16, Math.sin(a) * .14);
      crown.add(ball);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.125, .012, 4, 10), goldFlat);
    rim.rotation.x = Math.PI / 2; rim.position.y = -.045;
    crown.add(rim);
    const x = h.x - .05, z = h.z - .02;
    crown.position.set(x, groundAt(x, z) + h.h * .9 + .1, z);
    crown.rotation.set(.3, .6, -.2);
    crown.scale.setScalar(1.9);
    group.add(crown);
    tops.push(crown.position.clone().add(new THREE.Vector3(0, .15, 0)));
  }

  // ---- swords: steel blade, gold crossguard and pommel, dark grip. One plunged into a heap, one lying across the coins.
  function sword() {
    const g = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(.045, .62, .012, 1, 4, 1);
    const bp = bladeGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i);
      if (y > .3) bp.setX(i, 0);                                   // the point
      else bp.setX(i, bp.getX(i) * (1 - Math.max(0, y) * .25));     // slight taper
    }
    bladeGeo.translate(0, .31, 0);
    g.add(new THREE.Mesh(bladeGeo, steel));
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.2, .03, .04), goldFlat);
    g.add(guard);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(.016, .018, .13, 6), leather);
    grip.position.y = -.08; g.add(grip);
    const pommel = new THREE.Mesh(new THREE.IcosahedronGeometry(.028, 0), goldFlat);
    pommel.position.y = -.16; g.add(pommel);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  {
    // plunged point-down into the big heap beside the crown, leaning
    const h = heaps[0];
    const a = sword();
    a.rotation.set(Math.PI + .1, .5, -.3);
    const ax = h.x - .3, az = h.z + .05;
    a.position.set(ax, groundAt(ax, az) + h.h * .5 + .55, az);
    a.scale.setScalar(1.6);
    group.add(a);
    // lying across the front of the first heap
    const f = heaps[0];
    const b = sword();
    b.rotation.set(-Math.PI / 2 + .1, 0, 1.2);
    const bx = f.x + .25, bz = f.z + .32;
    b.position.set(bx, groundAt(bx, bz) + .06, bz);
    b.scale.setScalar(1.6);
    group.add(b);
    tops.push(b.position.clone().add(new THREE.Vector3(0, .04, 0)));
  }

  // ---- small open chest
  if (chestAt) {
    const chest = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: .8, flatShading: true });
    const band = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: .8, roughness: .4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(.62, .34, .4), wood);
    box.position.y = .17; chest.add(box);
    // a gold lock plate on the front
    const lock = new THREE.Mesh(new THREE.BoxGeometry(.09, .11, .02), goldFlat);
    lock.position.set(0, .25, .205);
    chest.add(lock);
    for (const bx of [-.275, .275]) {   // bands at the corners
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
      glintMat.uniforms.uTime.value = t;
    },
  };
}
