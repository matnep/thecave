// Ambient life for the firelit cave. A little director plays one event at a time with a pause in between,
// never the same one twice running:
//   ducks — a mother and ducklings paddle out from behind the left column and away behind the right pillar
//   ship  — a pirate ship sails past on the water beyond the cave mouth
//   fish  — a fish (sometimes two) leaps out of the channel with a splash
// Nothing swims through rock: `clearance` (see clearance.js) says how much open water surrounds any point, so
// swimmers steer away before they reach a rock and can never move deeper into one; fish only jump over open water.
import * as THREE from 'three';

const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, flatShading: true, ...extra });
const ease = (x) => x * x * (3 - 2 * x);

export function createLife(scene, { groundY, MOUTH, clearance }) {
  const open = (x, z) => (clearance ? clearance.clear(x, z) : 9);
  // is there at least `r` of open water all along the straight line from a to b?
  const clearLine = (ax, az, bx, bz, r) => {
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / .15));
    for (let i = 0; i <= n; i++) if (open(ax + (bx - ax) * i / n, az + (bz - az) * i / n) < r) return false;
    return true;
  };
  const awayDir = { x: 0, z: 0 };
  // ------------------------------------------------------------ ripples on the water
  // a fixed pool, reused round-robin, so ripples never allocate while running
  const rippleGeo = new THREE.RingGeometry(.8, 1, 40);
  rippleGeo.rotateX(-Math.PI / 2);
  const ripples = Array.from({ length: 40 }, () => {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b8, transparent: true, opacity: 0, depthWrite: false }));
    m.renderOrder = 4; m.visible = false;
    scene.add(m);
    return { m, age: 0, life: 1, size: 1, on: false };
  });
  let nextRipple = 0;
  function ripple(x, z, size = .5, life = 1.8) {
    const r = ripples[nextRipple++ % ripples.length];
    r.m.position.set(x, .015, z);
    r.age = 0; r.life = life; r.size = size; r.on = true;
    r.m.visible = true;
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
  // Low-poly, after the reference: a chunky faceted body with a raised pointed tail, a white breast and collar,
  // a tall neck, an angular head, a long flat bill (yellow on top, orange-red underneath) and a ringed eye.
  // Articulated: root (heading) → tilt (pitch/roll) → body, wings, tail pivot, neck pivot (neck, head, bill, eyes).
  const DUCK = {
    hen: { body: 0x1f1d1c, wing: 0x2b2826, breast: 0xece4d4, head: 0x1f1d1c, billTop: 0xf6b43c, billBot: 0xd9541e },
    drake: { body: 0x1c1f1d, wing: 0x29302b, breast: 0xece4d4, head: 0x16302a, billTop: 0xf2c046, billBot: 0xd9541e },
    chick: { body: 0xeec74e, wing: 0xdcb23e, breast: 0xfae49c, head: 0xeec74e, billTop: 0xf09a32, billBot: 0xcf5a1c },
  };
  const vc = (geo) => new THREE.Mesh(geo, flat(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  function paintFaces(geo, pick, jitter = .08) {
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let f = 0; f < p.count; f += 3) {
      const x = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, z = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
      c.setHex(pick(x, y, z));
      c.multiplyScalar(1 - jitter + Math.abs(Math.sin(f * 12.9898)) * jitter * 2);   // face-to-face variation, like folded paper
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (f + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  // A low-poly body lofted along x through cross-sections placed exactly where the silhouette turns or a colour
  // changes, so shapes and stripes land on face edges. Each station: { x, top, bot, w } (w = half-width);
  // `flat` squares off the underside. Ends are capped. Returns non-indexed geometry.
  function loft(stations, sides = 7, { flat: flatBottom = 0 } = {}) {
    const ring = (st) => {
      const yc = (st.top + st.bot) / 2, ry = (st.top - st.bot) / 2, pts = [];
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        let y = yc + Math.cos(a) * ry;
        if (flatBottom) y = Math.max(y, st.bot + ry * flatBottom);
        pts.push([st.x, y, Math.sin(a) * st.w]);
      }
      return pts;
    };
    const rings = stations.map(ring), out = [];
    const tri = (a, b, c) => out.push(...a, ...b, ...c);
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % sides], c = rings[i + 1][j], d = rings[i + 1][(j + 1) % sides];
      tri(a, c, d); tri(a, d, b);
    }
    for (const [r, st, flip] of [[rings[0], stations[0], true], [rings[rings.length - 1], stations[stations.length - 1], false]]) {
      const cen = [st.x, (st.top + st.bot) / 2, 0];
      for (let j = 0; j < sides; j++) flip ? tri(cen, r[(j + 1) % sides], r[j]) : tri(cen, r[j], r[(j + 1) % sides]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    return g;
  }
  // side profile after the reference: high full breast at the front, flat underside, tail sweeping up to a point
  const DUCK_BODY = [
    { x: .28, top: .23, bot: .12, w: .03 },
    { x: .23, top: .33, bot: .03, w: .14 },
    { x: .12, top: .35, bot: 0, w: .2 },
    { x: .0, top: .33, bot: 0, w: .2 },
    { x: -.11, top: .31, bot: .02, w: .17 },
    { x: -.2, top: .34, bot: .08, w: .1 },
    { x: -.27, top: .45, bot: .29, w: .03 },
  ];
  function duckBody(kind) {
    const pal = DUCK[kind];
    const g = loft(DUCK_BODY, 7, { flat: .35 });
    return paintFaces(g, (x, y) => {
      if (x > .12 && y > .12) return pal.breast;              // white chest, up to the collar
      if (x < -.17 && y < .2) return pal.breast;            // pale under the tail
      return pal.body;
    });
  }
  function makeDuck(kind) {
    const pal = DUCK[kind];
    const root = new THREE.Group(), tilt = new THREE.Group(), neck = new THREE.Group(), tail = new THREE.Group();
    root.add(tilt);
    const mesh = (parent, geo, color, pos, scale = [1, 1, 1], rot = [0, 0, 0], extra) => {
      const m = new THREE.Mesh(geo, flat(color, extra));
      m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot);
      m.castShadow = true; parent.add(m); return m;
    };
    const body = vc(duckBody(kind));
    body.castShadow = true;
    tilt.add(body);
    // folded wings: flat faceted panels lying along the sides, on pivots so they can give a little shake
    const wings = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(-.02, .26, s * .165);
      tilt.add(pivot);
      mesh(pivot, new THREE.OctahedronGeometry(1, 0), pal.wing, [-.06, 0, 0], [.15, .06, .025], [s * -.25, s * .06, .3]);
      return pivot;
    });
    tail.position.set(-.27, .41, 0); tilt.add(tail);
    mesh(tail, new THREE.ConeGeometry(.04, .1, 4), pal.body, [-.02, .02, 0], [1, 1, .5], [0, 0, Math.PI / 2 + .9]);
    // neck: white collar at the base, dark above, leaning back a little; then the head and bill
    neck.position.set(.18, .27, 0); tilt.add(neck);
    mesh(neck, new THREE.CylinderGeometry(.07, .09, .08, 5), pal.breast, [-.005, .02, 0], [1, 1, .9], [0, 0, .12]);
    mesh(neck, new THREE.CylinderGeometry(.055, .07, .2, 5), pal.head, [-.02, .15, 0], [1, 1, .9], [0, 0, .12]);
    const headGeo = new THREE.IcosahedronGeometry(1, 0);
    mesh(neck, headGeo, pal.head, [.0, .29, 0], [.115, .095, .085], [0, 0, -.2]);
    // the bill: a long flat wedge, yellow on top, orange-red underneath, narrowing to a blunt tip
    const wedge = (w, h, d, drop) => {
      const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
      const bp = g.attributes.position;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i);
        if (x > 0) { bp.setZ(i, bp.getZ(i) * .62); bp.setY(i, bp.getY(i) - drop); }
      }
      g.computeVertexNormals();
      return g;
    };
    mesh(neck, wedge(.18, .03, .075, .012), pal.billTop, [.165, .27, 0], [1, 1, 1], [0, 0, -.08]);
    mesh(neck, wedge(.16, .02, .066, .01), pal.billBot, [.155, .246, 0], [1, 1, 1], [0, 0, -.08]);
    // eyes: a white ring round a dark pupil, flat on each side of the head
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(.03, .31, s * .077);
      eye.rotation.y = s > 0 ? 0 : Math.PI;
      eye.add(new THREE.Mesh(new THREE.RingGeometry(.016, .024, 8), flat(0xe8e4dc)));
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(.016, 8), flat(0x060505));
      pupil.position.z = .001; eye.add(pupil);
      neck.add(eye);
    }
    root.userData = { tilt, neck, tail, wings, size: (kind === 'chick' ? .55 : 1) * 1.8 };
    root.scale.setScalar(root.userData.size);
    return root;
  }

  // A swimmer steers toward a target with limited acceleration and turn rate, so it eases in and out
  // of moves and leans into turns. Paddling sets the rhythm for the bob, the surge and the head nod.
  const tmpD = new THREE.Vector2(), tmpEnd = new THREE.Vector3();
  class Swimmer {
    constructor(kind, x, z, heading) {
      this.duck = makeDuck(kind);
      this.size = this.duck.userData.size;
      this.pos = new THREE.Vector2(x, z);
      this.vel = new THREE.Vector2();
      this.heading = heading;
      this.turn = 0;
      this.phase = Math.random() * 6;
      this.seed = Math.random() * 100;
      this.look = 0; this.lookTarget = 0; this.lookTimer = 1 + Math.random() * 3;
      this.dabble = -1;          // 0..1 while dabbling
      this.wag = 0;
      this.wake = Math.random();
      scene.add(this.duck);
    }
    get speed() { return this.vel.length(); }
    setSize(size) { this.size = size; this.duck.userData.size = size; this.duck.scale.setScalar(size); }
    get radius() { return .2 * this.size; }      // about half the body's width
    steer(dt, tx, tz, maxSpeed, arrive = .8) {
      const d = tmpD.set(tx - this.pos.x, tz - this.pos.y);
      const dist = d.length();
      const want = dist > 1e-4 ? d.multiplyScalar(maxSpeed * Math.min(1, dist / arrive) / dist) : d.set(0, 0);
      // rock ahead? veer toward open water, harder the closer it gets
      const safe = this.radius + .4;
      const lx = this.pos.x + this.vel.x * 1.2, lz = this.pos.y + this.vel.y * 1.2;
      const ahead = Math.min(open(lx, lz), open(this.pos.x, this.pos.y));
      if (ahead < safe && clearance) {
        clearance.away(lx, lz, awayDir);
        const push = (safe - ahead) / safe * Math.max(.25, maxSpeed) * 2.2;
        want.x += awayDir.x * push; want.y += awayDir.z * push;
      }
      const acc = want.sub(this.vel);
      const maxAcc = .7 * dt;
      if (acc.length() > maxAcc) acc.setLength(maxAcc);
      this.vel.add(acc);
      if (this.dabble >= 0) this.vel.multiplyScalar(1 - Math.min(1, dt * 3));   // stops to feed
      // move, but never deeper into rock: drop any part of the step that heads into it (it slides along instead)
      let mx = this.vel.x * dt, mz = this.vel.y * dt;
      const nx = this.pos.x + mx, nz = this.pos.y + mz;
      if (clearance && open(nx, nz) < this.radius && open(nx, nz) < open(this.pos.x, this.pos.y)) {
        clearance.away(nx, nz, awayDir);
        const into = mx * awayDir.x + mz * awayDir.z;
        if (into < 0) {
          mx -= awayDir.x * into; mz -= awayDir.z * into;
          const vin = this.vel.x * awayDir.x + this.vel.y * awayDir.z;
          if (vin < 0) { this.vel.x -= awayDir.x * vin; this.vel.y -= awayDir.z * vin; }
        }
      }
      this.pos.x += mx; this.pos.y += mz;
      return dist;
    }
    update(t, dt, { idle = false } = {}) {
      const sp = this.speed;
      // turn smoothly toward the direction of travel
      if (sp > .03) {
        const want = Math.atan2(-this.vel.y, this.vel.x);
        const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
        this.turn += (Math.max(-1.4, Math.min(1.4, diff * 2.4)) - this.turn) * Math.min(1, dt * 5);
      } else this.turn *= 1 - Math.min(1, dt * 4);
      this.heading += this.turn * dt;

      this.phase += dt * Math.PI * 2 * (.7 + sp * 5);       // paddles faster when moving
      const { tilt, neck, tail } = this.duck.userData;

      // looking around when idle, straight ahead when swimming
      if ((this.lookTimer -= dt) < 0) { this.lookTimer = 1.5 + Math.random() * 3; this.lookTarget = idle ? (Math.random() - .5) * 1.6 : 0; }
      this.look += (this.lookTarget - this.look) * Math.min(1, dt * 3);
      neck.rotation.y = this.look;
      neck.position.x = .18 + Math.sin(this.phase) * .012 * Math.min(1, sp * 6 + .2);   // head bob with each stroke
      neck.rotation.z = Math.sin(this.phase + 1) * .06;

      // occasional tail wag
      if (this.wag <= 0 && Math.random() < dt * (idle ? .25 : .05)) this.wag = .6;
      this.wag = Math.max(0, this.wag - dt);
      tail.rotation.y = Math.sin(t * 22) * .5 * Math.min(1, this.wag * 3);
      const { wings } = this.duck.userData;
      if (wings) wings.forEach((w, i) => { w.rotation.x = (i ? 1 : -1) * Math.max(0, Math.sin(t * 30)) * .35 * Math.min(1, this.wag * 2); });

      // dabble: tips forward, tail up, head under, comes back up
      let dip = 0;
      if (this.dabble >= 0) {
        const before = this.dabble;
        this.dabble += dt / 2.4;
        dip = Math.pow(Math.sin(Math.min(1, this.dabble) * Math.PI), .6);
        if (before < .3 && this.dabble >= .3) ripple(this.pos.x + Math.cos(this.heading) * .3 * this.size, this.pos.y - Math.sin(this.heading) * .3 * this.size, .3 * this.size, 1.4);
        if (this.dabble >= 1) this.dabble = -1;
      }

      this.duck.position.set(this.pos.x, Math.sin(this.phase * .5 + this.seed) * .008 * this.size + Math.sin(t * 1.1 + this.seed) * .005, this.pos.y);
      this.duck.rotation.y = this.heading;
      tilt.rotation.z = -dip * 1.05 + Math.sin(this.phase) * .025 * Math.min(1, sp * 5);   // nose down to feed; surge when paddling
      tilt.rotation.x = -this.turn * .14;                                                     // lean into turns

      // wake: ripples come more often and bigger the faster it swims
      if (sp > .04 && (this.wake -= dt * sp * 3.2) < 0) { this.wake = 1; ripple(this.pos.x, this.pos.y, (.35 + sp) * .5 * this.size, 1.7); }
    }
    remove() { scene.remove(this.duck); }
  }

  // a mother and ducklings paddle out from behind the left column, through the gap between the mid-channel
  // rocks and upstream, away behind the right pillar. The route is checked against the clearance map: open water all the way.
  function ducks() {
    const path = new THREE.CatmullRomCurve3([
      [-6.6, -6.4], [-5.2, -4.8], [-3.6, -3.5], [-1.8, -3.3], [-.5, -3.7], [.25, -4.8], [1.2, -6.3], [3.4, -6.5], [4.6, -6.8],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const LEN = path.getLength(), CRUISE = .3;
    const kinds = ['hen', 'chick', 'chick', 'chick', ...(Math.random() < .5 ? ['drake'] : [])];
    const start = path.getPointAt(0), dir = path.getTangentAt(0);
    const flock = kinds.map((k, i) => new Swimmer(k, start.x - dir.x * i * .9, start.z - dir.z * i * .9, Math.atan2(-dir.z, dir.x)));
    const lanes = flock.map(() => (Math.random() - .5) * .5);
    let u = 0, age = 0;
    return {
      update(dt, t) {
        age += dt;
        // mum swims the path at an easy pace
        u = Math.min(1, u + (CRUISE * dt) / LEN);
        const aim = path.getPointAt(Math.min(1, u + .035));
        flock[0].steer(dt, aim.x, aim.z, CRUISE * 1.15, 1);
        flock[0].update(t, dt);
        // each duckling follows the one ahead, a little behind and to one side, catching up when it lags
        for (let i = 1; i < flock.length; i++) {
          const lead = flock[i - 1], me = flock[i];
          const back = .55 * lead.size + .25;
          const fx = Math.cos(lead.heading), fz = -Math.sin(lead.heading);
          const side = lanes[i] + Math.sin(t * .5 + i * 2) * .18;
          const tx = lead.pos.x - fx * back - fz * side, tz = lead.pos.y - fz * back + fx * side;
          const dist = Math.hypot(tx - me.pos.x, tz - me.pos.y);
          me.steer(dt, tx, tz, CRUISE * (1 + Math.min(1.2, dist * .8)), .6);
          me.update(t, dt);
        }
        const last = flock[flock.length - 1];
        if (u >= 1 && (path.getPointAt(1).distanceTo(tmpEnd.set(last.pos.x, 0, last.pos.y)) < 1.2 || age > 90)) {
          flock.forEach((d) => d.remove());
          return false;
        }
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
  // A low-poly clownfish, after the reference: deep orange body with three white bands edged in black,
  // black-rimmed fins, a rounded tail fan and a dark eye.
  const ORANGE = 0xe8752a, ORANGE_LO = 0xc4511e, WHITE = 0xeef0e8, BLACK = 0x161413;
  const fishBodyMat = flat(0xffffff, { vertexColors: true, roughness: .55, side: THREE.DoubleSide });
  const finBlack = flat(BLACK, { side: THREE.DoubleSide });
  const finOrange = flat(ORANGE, { side: THREE.DoubleSide });
  // white bands along the body (in -1..1 of its length), each with a black rim
  const BANDS = [[.3, .6], [-.16, .18], [-.82, -.6]];
  function bandAt(u) {
    for (const [a, b] of BANDS) {
      if (u >= a && u <= b) return 'white';
      if (u >= a - .04 && u <= b + .04) return 'black';
    }
    return null;
  }
  function makeFish() {
    const g = new THREE.Group();
    const L = .28;
    // depth along the body (u = -1 tail .. 1 nose): deep and round at the front, narrowing to a wrist
    const depth = (u) => (u > .95 ? .035 : u >= 0 ? .145 * (1 - u * u * .62) : u > -.85 ? .145 * (1 + u * .6) : .042);
    const edges = new Set([1, .95, .84, .72]);
    for (const [a, b] of BANDS) for (const e of [a - .04, a, b, b + .04]) edges.add(+e.toFixed(3));
    for (const e of [-.4, -.86, -.95]) edges.add(e);
    const us = [...edges].sort((a, b) => a - b);
    const bodyGeo = loft(us.map((u) => ({ x: u * L, top: depth(u), bot: -depth(u) * .85, w: depth(u) * .45 })), 7);
    paintFaces(bodyGeo, (x, y) => {
      const band = bandAt(Math.max(-1, Math.min(1, x / L)));
      if (band === 'white') return WHITE;
      if (band === 'black') return BLACK;
      return y < -.03 ? ORANGE_LO : ORANGE;
    }, .1);
    g.add(new THREE.Mesh(bodyGeo, fishBodyMat));
    // a fin: a black silhouette with an orange inset, so it reads as orange with a black rim from either side
    const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(...pts[0]); for (const q of pts.slice(1)) s.lineTo(...q); return new THREE.ShapeGeometry(s); };
    function fin(pts, inset = .62) {
      const f = new THREE.Group();
      f.add(new THREE.Mesh(shape(pts), finBlack));
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const inner = pts.map(([x, y]) => [cx + (x - cx) * inset, cy + (y - cy) * inset]);
      for (const z of [-.002, .002]) { const m = new THREE.Mesh(shape(inner), finOrange); m.position.z = z; f.add(m); }
      return f;
    }
    // rounded tail fan on a pivot so it can beat
    const tail = new THREE.Group();
    tail.position.x = -L * .95;
    const fan = [[0, 0]];
    for (let k = 0; k <= 6; k++) { const a = Math.PI * (.62 + k / 6 * .76); fan.push([Math.cos(a) * .15, Math.sin(a) * .12]); }
    tail.add(fin(fan, .6));
    g.add(tail);
    // dorsal fin in two lobes, a pelvic and an anal fin underneath, a rounded pectoral on each side
    const dorsal = fin([[.13, 0], [.08, .07], [.0, .075], [-.02, .03], [-.06, .08], [-.15, .06], [-.19, 0]], .55);
    dorsal.position.y = .11; g.add(dorsal);
    const anal = fin([[-.06, 0], [-.1, -.065], [-.17, -.05], [-.2, 0]], .55);
    anal.position.y = -.08; g.add(anal);
    const pelvic = fin([[.08, 0], [.04, -.07], [-.0, -.05], [.0, 0]], .5);
    pelvic.position.y = -.1; g.add(pelvic);
    for (const s of [-1, 1]) {
      const pec = fin([[0, 0], [-.04, -.05], [-.09, -.05], [-.1, 0], [-.07, .03]], .55);
      pec.position.set(.1, -.02, s * .05); pec.rotation.x = s * .5;
      g.add(pec);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(.017, 7), flat(0x060505));
      eye.position.set(.2, .03, s * .044); eye.rotation.y = s > 0 ? .35 : Math.PI - .35;
      g.add(eye);
    }
    g.userData.tail = tail;
    g.scale.setScalar(1.6);
    return g;
  }
  function fish() {
    const list = [];
    const n = Math.random() < .3 ? 2 : 1;
    for (let tries = 0; list.length < n && tries < 80; tries++) {
      const z = -6 + Math.random() * 7;
      const x = -2 + Math.random() * 4;
      const dir = Math.random() < .5 ? 1 : -1;
      const L = 2 + Math.random() * .7;
      if (groundY(x, z) > -.2 || groundY(x + dir * L, z) > -.2) continue;   // open water at both ends
      if (!clearLine(x - dir * .4, z, x + dir * (L + .4), z, .55)) continue;   // and no rock anywhere under the arc
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
  // Wanders between spots on the open water in front: swims over, slows, rests, looks about, sometimes dabbles.
  const lost = new Swimmer('chick', -1.1, 2.4, Math.PI);
  lost.setSize(1.15);
  let lostTarget = null, lostRest = 2;
  function pickSpot() {
    for (let i = 0; i < 40; i++) {
      // open water left of the mid-channel rock, so it never paddles out of sight
      const x = -2.2 + Math.random() * 2.3, z = .9 + Math.random() * 2.9;
      if (groundY(x, z) < -.25 && Math.hypot(x - .9, z - .9) > 1.7 && Math.hypot(x - lost.pos.x, z - lost.pos.y) > 1
        && open(x, z) > lost.radius + .4 && clearLine(lost.pos.x, lost.pos.y, x, z, lost.radius + .1)) return { x, z };
    }
    return { x: lost.pos.x, z: lost.pos.y };       // nowhere good: stay put a while longer
  }
  function updateLost(t, dt) {
    let idle = true;
    if (lostTarget) {
      idle = false;
      const dist = lost.steer(dt, lostTarget.x, lostTarget.z, .26, .9);
      if (dist < .15 && lost.speed < .05) {
        lostTarget = null;
        lostRest = 2 + Math.random() * 4;
        if (Math.random() < .5) lost.dabble = 0;
      }
    } else {
      lost.steer(dt, lost.pos.x, lost.pos.y, 0);        // drift to a stop
      if ((lostRest -= dt) < 0 && lost.dabble < 0) lostTarget = pickSpot();
    }
    lost.update(t, dt, { idle });
  }

  // ------------------------------------------------------------ director
  const EVENTS = { ducks, ship, fish };
  let active = null, last = null, wait = 5;
  return {
    update(t, dt) {
      updateLost(t, dt);
      if (active) {
        if (active.update(dt, t) === false) { active = null; wait = 9 + Math.random() * 11; }
      } else if ((wait -= dt) <= 0) {
        const names = Object.keys(EVENTS).filter((n) => n !== last);
        last = names[Math.floor(Math.random() * names.length)];
        active = EVENTS[last]();
      }

      for (const r of ripples) {
        if (!r.on) continue;
        r.age += dt;
        const u = r.age / r.life;
        if (u >= 1) { r.on = false; r.m.visible = false; continue; }
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
    models: { makeDuck, makeFish },   // for testing: build a model on its own
  };
}
