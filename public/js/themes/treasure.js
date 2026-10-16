// A hoard under the TV, all gold: heaps of coins, a crown, a couple of swords, an open chest pouring gold,
// twinkling glints, and an old ship's anchor lying beside it.
// Everything is dropped onto the real rock/floor surfaces
// with a raycast so nothing floats or sinks.
import * as THREE from 'three';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/**
 * @param scene
 * @param surfaces  meshes to rest things on (the TV's rock, the floor)
 * @param heaps     [{ x, z, r, h, n }]  coin heaps: centre, radius, height, coin count
 * @param anchorAt  { x, z, rotY, scale }
 * @param chestAt   { x, z, rotY, scale }
 */
export function makeTreasure(scene, surfaces, heaps, anchorAt, chestAt) {
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
    a.rotation.set(Math.PI + .75, .5, -.35);     // leaning well over, so the hilt stays below the screen
    const ax = h.x - .3, az = h.z + .2;
    a.position.set(ax, groundAt(ax, az) + h.h * .5 + .3, az);
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

  // ---- a ship's anchor, lying on its side on the ground (low, so it never covers the TV), half sunk in the coins
  if (anchorAt) {
    const anchor = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x3e3833, roughness: .65, metalness: .7, flatShading: true });
    const rust = new THREE.MeshStandardMaterial({ color: 0x7a3e1e, roughness: .9, metalness: .2, flatShading: true });
    const add = (geo, mat, pos, rot = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...pos); m.rotation.set(...rot);
      m.castShadow = m.receiveShadow = true;
      anchor.add(m); return m;
    };
    // built standing up (shank along y), then laid down below
    add(new THREE.CylinderGeometry(.045, .055, 1.0, 6), iron, [0, .5, 0]);                      // shank
    add(new THREE.TorusGeometry(.09, .025, 4, 7), iron, [0, 1.08, 0]);                           // ring
    add(new THREE.CylinderGeometry(.03, .03, .5, 5), rust, [0, .86, 0], [0, 0, Math.PI / 2]);    // stock (crossbar)
    for (const sx of [-1, 1]) add(new THREE.IcosahedronGeometry(.04, 0), rust, [sx * .26, .86, 0]);
    // arms: a faceted arc round the crown of the anchor, ending in flukes
    const arms = add(new THREE.TorusGeometry(.36, .045, 4, 8, Math.PI), iron, [0, .38, 0], [0, 0, Math.PI]);
    arms.scale.y = .9;
    for (const sx of [-1, 1]) {
      const fluke = add(new THREE.ConeGeometry(.09, .2, 3), iron, [sx * .36, .44, 0], [0, 0, -sx * .35]);
      fluke.scale.z = .4;
    }
    add(new THREE.IcosahedronGeometry(.07, 0), iron, [0, .03, 0]);                                // crown
    // lay it down flat
    const lay = new THREE.Group();
    lay.add(anchor);
    anchor.rotation.set(-Math.PI / 2 + .1, 0, 0);   // flat on the ground, ring end raised a touch
    anchor.position.y = .07;
    lay.position.set(anchorAt.x, groundAt(anchorAt.x, anchorAt.z), anchorAt.z);
    lay.rotation.y = anchorAt.rotY || 0;
    lay.scale.setScalar(anchorAt.scale || 1);
    group.add(lay);
  }

  // ---- an open treasure chest on the floor in front of the TV's rock, gold pouring over its front lip
  // into a pile. Low, and nearer the camera than the TV, so it sits below the screen in the shot.
  let pour = null;
  if (chestAt) {
    const chest = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7e4626, roughness: .85, flatShading: true });
    const band = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: .8, roughness: .4, flatShading: true });
    const box = new THREE.Mesh(new THREE.BoxGeometry(.62, .3, .4), wood);
    box.position.y = .15; chest.add(box);
    for (const bx of [-.27, .27]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.05, .32, .42), band);
      b.position.set(bx, .15, 0); chest.add(b);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .02), goldFlat);
    lock.position.set(0, .22, .205); chest.add(lock);
    // lid: half a faceted barrel, swung open and resting back
    const lid = new THREE.Group();
    lid.position.set(0, .3, -.2);
    const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .62, 7, 1, false, 0, Math.PI), wood);
    lidMesh.rotation.z = Math.PI / 2; lidMesh.position.z = .2;
    lid.add(lidMesh);
    lid.rotation.x = -2.0;
    chest.add(lid);
    // heaped gold inside, brimming over
    const inside = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    inside.scale.set(1, .5, .66); inside.position.y = .27;
    chest.add(inside);

    // the pile the gold pours into, in front of the chest
    const PILE = { z: .62, r: .26, h: .16 };
    const pileN = 46;
    const pile = new THREE.InstancedMesh(coinGeo, gold, pileN);
    for (let k = 0; k < pileN; k++) {
      const a = rnd() * 6.28, d = Math.sqrt(rnd()) * PILE.r;
      o.position.set(Math.cos(a) * d, .01 + PILE.h * (1 - d / PILE.r) * (.6 + rnd() * .4), PILE.z + Math.sin(a) * d * .8);
      o.rotation.set((rnd() - .5) * 1.2, rnd() * 6.28, (rnd() - .5) * 1.2);
      o.updateMatrix();
      pile.setMatrixAt(k, o.matrix);
    }
    chest.add(pile);

    // the pour: coins slide over the lip and tumble down an arc onto the pile, on a loop
    const STREAM = 34;
    const stream = new THREE.InstancedMesh(coinGeo, gold, STREAM);
    stream.frustumCulled = false;
    const lane = Array.from({ length: STREAM }, () => [(rnd() - .5) * .22, (rnd() - .5) * .08, rnd() * 6.28, .7 + rnd() * .6]);
    chest.add(stream);
    pour = (t) => {
      for (let k = 0; k < STREAM; k++) {
        const [dx, dz, spin, rate] = lane[k];
        const u = (t * .45 * rate + k / STREAM) % 1;
        const y = .32 + .08 * u - .36 * u * u;                 // over the lip, then down onto the pile
        o.position.set(dx * (1 + u * .6), Math.max(y, .02 + PILE.h * .8 * (1 - u * .3)), .19 + (PILE.z - .19) * u + dz);
        o.rotation.set(spin + t * 6 * rate, spin, u * 2.5);
        o.scale.setScalar(u > .96 ? (1 - u) * 25 : 1);           // tucks into the pile at the end of its run
        o.updateMatrix();
        stream.setMatrixAt(k, o.matrix);
      }
      o.scale.setScalar(1);
      stream.instanceMatrix.needsUpdate = true;
    };

    chest.position.set(chestAt.x, groundAt(chestAt.x, chestAt.z), chestAt.z);
    chest.rotation.y = chestAt.rotY || 0;
    chest.scale.setScalar(chestAt.scale || 1);
    chest.traverse((m) => { if (m.isMesh) m.castShadow = m.receiveShadow = true; });
    group.add(chest);
    chest.updateMatrixWorld(true);
    for (const local of [[0, .38, 0], [0, .22, PILE.z], [.1, .3, .3]]) tops.push(chest.localToWorld(new THREE.Vector3(...local)));
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
      pour?.(t);
    },
  };
}
