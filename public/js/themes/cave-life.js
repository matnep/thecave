// Ambient life for the firelit cave. A little director plays one event at a time with a pause in between,
// never the same one twice running:
//   ducks — a mother and ducklings paddle out from behind the left column and away behind the right pillar
//   ship  — a pirate ship sails past on the water beyond the cave mouth
//   fish  — a fish (sometimes two or three) leaps out of the channel with a splash
import * as THREE from 'three';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, flatShading: true, ...extra });
const ease = (x) => x * x * (3 - 2 * x);

export function createLife(scene, { groundY, MOUTH }) {
  // ------------------------------------------------------------ ripples on the water
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(.8, 1, 40);
  rippleGeo.rotateX(-Math.PI / 2);
  function ripple(x, z, size = .5, life = 1.8) {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b8, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(x, .015, z);
    m.renderOrder = 4;
    scene.add(m);
    ripples.push({ m, age: 0, life, size });
  }

  // ------------------------------------------------------------ splash droplets
  const DROPS = 60;
  const dPos = new Float32Array(DROPS * 3).fill(-99), dVel = new Float32Array(DROPS * 3), dLife = new Float32Array(DROPS);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0xfff0d8, size: .06, transparent: true, opacity: .9, depthWrite: false }));
  scene.add(drops);
  let nextDrop = 0;
  function splash(x, z, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const k = nextDrop++ % DROPS, a = Math.random() * Math.PI * 2, s = (.4 + Math.random() * .9) * power;
      dPos.set([x, .05, z], k * 3);
      dVel.set([Math.cos(a) * s * .6, (1.6 + Math.random() * 1.6) * power, Math.sin(a) * s * .6], k * 3);
      dLife[k] = 1.2;
    }
    ripple(x, z, .7 * power, 2.2);
  }

  // ------------------------------------------------------------ ducks
  function makeDuck(kind) {
    const g = new THREE.Group();
    const body = kind === 'drake' ? 0xd8cfbd : kind === 'hen' ? 0x8a6444 : 0xe6c24a;
    const head = kind === 'drake' ? 0x2f5e3c : kind === 'hen' ? 0x6e4e34 : 0xeccf5a;
    const add = (geo, color, pos, scale, rot = [0, 0, 0]) => {
      const m = new THREE.Mesh(geo, flat(color));
      m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
      m.castShadow = true; g.add(m);
    };
    add(new THREE.IcosahedronGeometry(1, 1), body, [0, .07, 0], [.3, .17, .2]);
    add(new THREE.IcosahedronGeometry(1, 0), head, [.24, .25, 0], [.12, .12, .11]);
    add(new THREE.ConeGeometry(.05, .15, 4), 0xe3902c, [.38, .23, 0], [1, 1, .7], [0, 0, -Math.PI / 2]);
    add(new THREE.ConeGeometry(.08, .2, 4), body, [-.3, .13, 0], [1, 1, .6], [0, 0, Math.PI / 2 + .5]);
    if (kind === 'drake') add(new THREE.TorusGeometry(.08, .015, 4, 10), 0xf2efe6, [.2, .17, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
    g.userData.size = (kind === 'chick' ? .55 : 1) * 1.8;   // stylised, big enough to read from the back of the room
    return g;
  }
  function ducks() {
    const path = new THREE.CatmullRomCurve3([
      [-5.8, -5.6], [-3.8, -3.4], [-1.6, -2.3], [.5, -2.3], [2.0, -3.5], [3.6, -5.4],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const flock = ['hen', 'chick', 'chick', 'chick', ...(Math.random() < .5 ? ['drake'] : [])].map(makeDuck);
    flock.forEach((d) => scene.add(d));
    const DUR = 34, GAP = 2.6;                         // seconds between each duck in the line
    let age = 0;
    const wakeT = flock.map(() => Math.random());
    const lane = flock.map((_, i) => (i ? (i % 2 ? 1 : -1) * (.3 + Math.random() * .3) : 0));  // sideways offset off mum's line
    return {
      update(dt) {
        age += dt;
        flock.forEach((d, i) => {
          const u = (age - i * GAP) / DUR;             // ducklings trail behind mum
          if (u < 0 || u > 1) { d.visible = false; return; }
          d.visible = true;
          const p = path.getPointAt(u), ahead = path.getPointAt(Math.min(1, u + .01));
          d.position.set(p.x + Math.sin(age * .7 + i) * .15, Math.sin(age * 3 + i) * .015, p.z + lane[i] + Math.sin(age * .5 + i * 2) * .25);
          d.rotation.y = Math.atan2(-(ahead.z - p.z), ahead.x - p.x) + Math.sin(age * 2.2 + i) * .12;
          d.rotation.z = Math.sin(age * 3 + i) * .04;
          const fade = Math.min(1, u * 25, (1 - u) * 25);
          d.scale.setScalar(Math.max(.001, d.userData.size * fade));
          if ((wakeT[i] -= dt) < 0) { wakeT[i] = .9; ripple(d.position.x, d.position.z, .5 * d.userData.size, 1.6); }
        });
        if (age > DUR + flock.length * GAP) { flock.forEach((d) => scene.remove(d)); return false; }
      },
    };
  }

  // ------------------------------------------------------------ pirate ship (a silhouette against the sunset)
  function makeShip() {
    const g = new THREE.Group();
    const hullMat = new THREE.MeshBasicMaterial({ color: 0x2c1d15 });
    const sailMat = new THREE.MeshBasicMaterial({ color: 0x7a5c46, side: THREE.DoubleSide });
    const hull = new THREE.BoxGeometry(4.4, .9, 1.2, 6, 2, 1);
    const p = hull.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const bow = Math.max(0, x - 1.2) / 1.0;          // pointed bow
      p.setZ(i, p.getZ(i) * Math.max(.05, 1 - bow * bow));
      if (y < 0) p.setZ(i, p.getZ(i) * .6);
      if (x < -1.6 && y > 0) p.setY(i, y + .45);        // raised stern castle
      if (x > 1.6 && y > 0) p.setY(i, y + .2);
    }
    g.add(new THREE.Mesh(hull, hullMat));
    for (const [x, h] of [[-.9, 3.3], [.5, 3.9], [1.6, 2.6]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, h, 5), hullMat);
      mast.position.set(x, .45 + h / 2, 0); g.add(mast);
      for (const [y, w, hh] of [[.45 + h * .42, h * .42, h * .3], [.45 + h * .75, h * .3, h * .2]]) {
        const sail = new THREE.PlaneGeometry(w * .9, hh, 4, 4);
        const sp = sail.attributes.position;
        for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.cos(sp.getX(i) / (w * .9) * Math.PI) * .15);   // billow
        const cloth = new THREE.Mesh(sail, sailMat);
        cloth.position.set(x + .1, y, 0);
        cloth.rotation.y = .25;
        g.add(cloth);
      }
      if (h > 3.5) {
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(.55, .32), new THREE.MeshBasicMaterial({ color: 0x0c0806, side: THREE.DoubleSide }));
        flag.position.set(x - .3, .45 + h + .1, 0); g.add(flag);
        g.userData.flag = flag;
      }
    }
    const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, 1.4, 5), hullMat);
    bowsprit.rotation.z = -1.1; bowsprit.position.set(2.6, .9, 0); g.add(bowsprit);
    return g;
  }
  function ship() {
    const s = makeShip();
    const Z = MOUTH.z - 11, FROM = MOUTH.x - 13, TO = MOUTH.x + 12, DUR = 46;
    s.position.set(FROM, -.15, Z);
    s.rotation.y = -.05;
    s.scale.setScalar(1.1);
    scene.add(s);
    let age = 0;
    return {
      update(dt) {
        age += dt;
        const u = age / DUR;
        s.position.x = FROM + (TO - FROM) * u;
        s.position.y = -.15 + Math.sin(age * 1.1) * .06;
        s.rotation.z = Math.sin(age * .8) * .035;
        s.rotation.x = Math.sin(age * .6 + 1) * .02;
        if (s.userData.flag) s.userData.flag.rotation.y = Math.sin(age * 4) * .3;
        if (u >= 1) { scene.remove(s); return false; }
      },
    };
  }

  // ------------------------------------------------------------ jumping fish
  // Rises from under the water (the water surface hides it until it breaks through), nose follows the arc,
  // tail beats, and it splashes exactly where it leaves and re-enters the surface.
  const fishMat = flat(0xd9884c, { metalness: .35, roughness: .4, side: THREE.DoubleSide });
  function makeFish() {
    const g = new THREE.Group();
    const bodyGeo = new THREE.IcosahedronGeometry(1, 2);
    const p = bodyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), k = x < 0 ? 1 + x * .72 : 1 - x * x * .15;   // taper to the tail, blunt nose
      p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    bodyGeo.scale(.3, .11, .065);
    bodyGeo.computeVertexNormals();
    g.add(new THREE.Mesh(bodyGeo, fishMat));
    // forked tail on a pivot so it can beat
    const tail = new THREE.Group();
    tail.position.x = -.27;
    const fork = new THREE.Shape();
    fork.moveTo(0, 0); fork.lineTo(-.17, .12); fork.lineTo(-.11, 0); fork.lineTo(-.17, -.12); fork.lineTo(0, 0);
    tail.add(new THREE.Mesh(new THREE.ShapeGeometry(fork), fishMat));
    g.add(tail);
    const fin = new THREE.Shape();
    fin.moveTo(.06, 0); fin.lineTo(-.06, .09); fin.lineTo(-.1, 0);
    const dorsal = new THREE.Mesh(new THREE.ShapeGeometry(fin), fishMat);
    dorsal.position.y = .09; g.add(dorsal);
    g.userData.tail = tail;
    g.scale.setScalar(1.6);
    return g;
  }
  function fish() {
    const list = [];
    const n = Math.random() < .3 ? 2 : 1;
    for (let tries = 0; list.length < n && tries < 30; tries++) {
      const z = -6 + Math.random() * 7;
      const x = -2 + Math.random() * 4;
      const dir = Math.random() < .5 ? 1 : -1;
      const L = 2 + Math.random() * .7;
      if (groundY(x, z) > -.2 || groundY(x + dir * L, z) > -.2) continue;   // open water at both ends
      list.push({ f: makeFish(), x, z, dir, L, H: .85 + Math.random() * .4, T: 1.2 + Math.random() * .2,
        start: list.length * (1.4 + Math.random()), above: false, done: false });
    }
    const DEPTH = .5;                                   // starts/ends this far under the surface
    list.forEach((o) => scene.add(o.f));
    let age = 0;
    return {
      update(dt) {
        age += dt;
        let busy = false;
        for (const o of list) {
          const u = (age - o.start) / o.T;
          if (u < 0) { busy = true; o.f.visible = false; continue; }
          if (u > 1) { o.f.visible = false; continue; }
          busy = true;
          o.f.visible = true;
          const rise = o.H + DEPTH;
          const y = -DEPTH + rise * 4 * u * (1 - u);
          o.f.position.set(o.x + o.dir * o.L * u, y, o.z);
          const pitch = Math.atan2(rise * 4 * (1 - 2 * u), o.L);   // nose along the arc
          o.f.rotation.set(Math.sin(u * Math.PI) * .25 * o.dir, o.dir > 0 ? 0 : Math.PI, pitch);
          o.f.userData.tail.rotation.y = Math.sin(age * 26) * (.25 + .5 * Math.abs(1 - 2 * u));   // beats hardest in the water
          if (!o.above && y > 0) { o.above = true; splash(o.f.position.x, o.z, 10, .7); }
          if (o.above && !o.done && y < 0) { o.done = true; splash(o.f.position.x, o.z, 16, 1); }
        }
        if (!busy && age > 2) { list.forEach((o) => scene.remove(o.f)); return false; }
      },
    };
  }

  // ------------------------------------------------------------ the lost duckling (always around)
  // Paddles between random spots on the open water in front, stops, bobs, sometimes dips its head.
  const lost = makeDuck('chick');
  lost.userData.size = 1.15;
  lost.scale.setScalar(lost.userData.size);
  scene.add(lost);
  const L = { x: -1.1, z: 2.4, heading: Math.PI, target: null, rest: 2, wake: 0, dip: 0 };
  function pickSpot() {
    for (let i = 0; i < 40; i++) {
      // open water left of the mid-channel rock, so it never paddles out of sight
      const x = -2.2 + Math.random() * 2.3, z = .9 + Math.random() * 2.9;
      if (groundY(x, z) < -.25 && Math.hypot(x - .9, z - .9) > 1.7 && Math.hypot(x - L.x, z - L.z) > 1) return { x, z };
    }
    return { x: -1.1, z: 2.4 };
  }
  lost.position.set(L.x, 0, L.z);
  function updateLost(t, dt) {
    if (L.target) {
      const dx = L.target.x - L.x, dz = L.target.z - L.z, dist = Math.hypot(dx, dz);
      const want = Math.atan2(-dz, dx);
      let turn = want - L.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      L.heading += turn * Math.min(1, dt * 2.2);
      const speed = .38 * Math.max(.2, Math.cos(turn));          // slows down to turn
      L.x += Math.cos(L.heading) * speed * dt;
      L.z -= Math.sin(L.heading) * speed * dt;
      if ((L.wake -= dt) < 0) { L.wake = .8; ripple(L.x, L.z, .45, 1.5); }
      if (dist < .25) { L.target = null; L.rest = 1.5 + Math.random() * 4; if (Math.random() < .5) L.dip = 1; }
    } else if ((L.rest -= dt) < 0) {
      L.target = pickSpot();
    }
    // a head dip: tip forward, hold, come back up
    let tilt = 0;
    if (L.dip > 0) {
      L.dip = Math.max(0, L.dip - dt * .55);
      tilt = -Math.sin((1 - L.dip) * Math.PI) * .7;
      if (L.dip > .45 && L.dip - dt * .55 <= .45) ripple(L.x + Math.cos(L.heading) * .3, L.z - Math.sin(L.heading) * .3, .3, 1.2);
    }
    lost.position.set(L.x, Math.sin(t * 2.6) * .015, L.z);
    lost.rotation.set(0, L.heading + Math.sin(t * 1.7) * .05, tilt + Math.sin(t * 2.6 + 1) * .03);
  }

  // ------------------------------------------------------------ director
  const EVENTS = { ducks, ship, fish };
  let active = null, last = null, wait = 5;
  return {
    update(t, dt) {
      updateLost(t, dt);
      if (active) {
        if (active.update(dt) === false) { active = null; wait = 9 + Math.random() * 11; }
      } else if ((wait -= dt) <= 0) {
        const names = Object.keys(EVENTS).filter((n) => n !== last);
        last = names[Math.floor(Math.random() * names.length)];
        active = EVENTS[last]();
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += dt;
        const u = r.age / r.life;
        if (u >= 1) { scene.remove(r.m); r.m.material.dispose(); ripples.splice(i, 1); continue; }
        r.m.scale.setScalar(r.size * (.25 + ease(u) * 1.2));
        r.m.material.opacity = (1 - u) * .35;
      }
      for (let k = 0; k < DROPS; k++) {
        if (dLife[k] <= 0) continue;
        dLife[k] -= dt;
        dVel[k * 3 + 1] -= 9.8 * dt;
        dPos[k * 3] += dVel[k * 3] * dt; dPos[k * 3 + 1] += dVel[k * 3 + 1] * dt; dPos[k * 3 + 2] += dVel[k * 3 + 2] * dt;
        if (dPos[k * 3 + 1] < 0 || dLife[k] <= 0) { dLife[k] = 0; dPos[k * 3 + 1] = -99; }
      }
      dropGeo.attributes.position.needsUpdate = true;
    },
    // for testing: force an event now
    play(name) { if (!active) { active = EVENTS[name](); last = name; } },
  };
}
