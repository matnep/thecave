// A retro flip clock (the 70s kind with split cards that drop over each minute), low-poly to suit the cave.
// Two cards, hours and minutes. When a value changes, the top half of the old card falls forward on its hinge
// and reveals the new one, with a little bounce at the bottom.
import * as THREE from 'three';

const CARD_W = .25, CARD_H = .24;
const FLIP_SECS = .55;

// one canvas texture per two-digit value, made when first needed
const cardCache = new Map();
function cardTexture(text) {
  if (cardCache.has(text)) return cardCache.get(text);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 248;
  const x = c.getContext('2d');
  const r = 26;
  x.fillStyle = '#211d1a';
  x.beginPath(); x.roundRect(0, 0, 256, 248, r); x.fill();
  // a slight sheen on the top half, shade on the bottom, like a real plastic card
  const g = x.createLinearGradient(0, 0, 0, 248);
  g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
  x.fillStyle = g; x.fill();
  x.fillStyle = '#efe4cc';
  x.font = '200px Anton';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 132);
  // the split between the two halves
  x.fillStyle = '#0b0908';
  x.fillRect(0, 122, 256, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cardCache.set(text, t);
  return t;
}

// a half-card plane spanning y 0..h/2 (top) or -h/2..0 (bottom), UVs set to the matching half of the card
function halfGeo(top, back = false) {
  const g = new THREE.PlaneGeometry(CARD_W, CARD_H / 2);
  g.translate(0, top ? CARD_H / 4 : -CARD_H / 4, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // the flap's back face ends up rotated 180° in the card's plane once it has fallen, so its UVs are too
    if (back) uv.setXY(i, .5 - x / CARD_W, .5 - y / CARD_H);
    else uv.setXY(i, .5 + x / CARD_W, .5 + y / CARD_H);
  }
  if (back) g.rotateY(Math.PI);
  return g;
}

const cardMat = (map) => new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: .35, roughness: .55 });

function makeCard() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(halfGeo(true), cardMat(null));
  const bottom = new THREE.Mesh(halfGeo(false), cardMat(null));
  const flap = new THREE.Group();
  const flapFront = new THREE.Mesh(halfGeo(true), cardMat(null));
  const flapBack = new THREE.Mesh(halfGeo(true, true), cardMat(null));
  flap.add(flapFront, flapBack);
  flap.position.z = .004;
  flap.visible = false;
  g.add(top, bottom, flap);
  let value = null, age = 9;
  const set = (m, tex) => { m.material.map = m.material.emissiveMap = tex; m.material.needsUpdate = true; };
  return {
    group: g,
    show(text) {
      if (text === value) return;
      const old = value === null ? text : value;
      value = text;
      const a = cardTexture(old), b = cardTexture(text);
      set(top, b); set(bottom, a); set(flapFront, a); set(flapBack, b);
      age = old === text ? 9 : 0;
      flap.visible = age === 0;
      if (!flap.visible) set(bottom, b);
    },
    update(dt) {
      if (!flap.visible) return;
      age += dt;
      const u = Math.min(1, age / FLIP_SECS);
      // falls like it has weight (accelerates), then settles with a small bounce
      const fall = u < .8 ? Math.pow(u / .8, 2) : 1 - Math.sin((u - .8) / .2 * Math.PI) * .06;
      flap.rotation.x = fall * Math.PI;
      if (u >= 1) { flap.visible = false; set(bottom, top.material.map); }
    },
  };
}

export function makeFlipClock() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0xe0782c, roughness: .45, metalness: .05, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: .7, flatShading: true });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: .3, metalness: .8, flatShading: true });

  // the case: a chunky rounded block, slightly wider at the base, standing on two little feet
  const caseGeo = new THREE.CylinderGeometry(.19, .21, .66, 8, 1);
  caseGeo.rotateY(Math.PI / 8);                 // a flat face to the front
  caseGeo.rotateZ(Math.PI / 2);                 // a lozenge lying on its side
  caseGeo.scale(1, 1.05, .95);
  const body = new THREE.Mesh(caseGeo, shell);
  body.position.y = .24;
  group.add(body);
  // a dark window across the front for the cards
  const windowGeo = new THREE.BoxGeometry(.6, .3, .04);
  const win = new THREE.Mesh(windowGeo, dark);
  win.position.set(0, .24, .175);
  group.add(win);
  for (const x of [-.24, .24]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, .05, 6), chrome);
    foot.position.set(x, .025, 0);
    group.add(foot);
  }
  // a winding knob on the side
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .05, 6), chrome);
  knob.rotation.z = Math.PI / 2; knob.position.set(.355, .26, -.02);
  group.add(knob);

  const hours = makeCard(), minutes = makeCard();
  hours.group.position.set(-.135, .24, .2);
  minutes.group.position.set(.135, .24, .2);
  group.add(hours.group, minutes.group);
  group.traverse((m) => { if (m.isMesh) m.castShadow = true; });

  let last = '';
  return {
    group,
    update(dt, now = new Date()) {
      const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
      if (hh + mm !== last) { last = hh + mm; hours.show(hh); minutes.show(mm); }
      hours.update(dt); minutes.update(dt);
    },
  };
}
