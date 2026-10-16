// A closed treasure chest, built after the reference: plank-wood body and a chamfered lid, gold trim on every
// edge, an octagonal gold frame on each end of the lid, two gold bands over the top with studs, steel corner
// brackets at the feet, a ring handle on the side and a gold padlock with a steel shackle on the front.
// Built facing +z, sitting on y = 0; about 0.7 wide.
import * as THREE from 'three';

const W = .7, D = .5, H = .34;          // body: width (x), depth (z), height (y)
const LID = .2, CH = .085;              // lid height and the size of its chamfered top edges
const T = .028;                          // trim thickness

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#8c5a33'; x.fillRect(0, 0, 256, 256);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // four horizontal planks, each a slightly different shade, with grain streaks and dark joins
  for (let p = 0; p < 4; p++) {
    const y0 = p * 64;
    x.fillStyle = `hsl(24, ${30 + rnd() * 8}%, ${21 + rnd() * 6}%)`;   // dark, so the gold reads against it in firelight
    x.fillRect(0, y0, 256, 64);
    for (let g = 0; g < 9; g++) {
      x.strokeStyle = `rgba(60,30,12,${.15 + rnd() * .2})`;
      x.lineWidth = 1 + rnd() * 2;
      const gy = y0 + 6 + rnd() * 52;
      x.beginPath(); x.moveTo(0, gy);
      for (let gx = 0; gx <= 256; gx += 32) x.lineTo(gx, gy + (rnd() - .5) * 4);
      x.stroke();
    }
    x.fillStyle = 'rgba(255,220,170,.12)'; x.fillRect(0, y0 + 2, 256, 3);    // lit top edge of the board
    x.fillStyle = '#3a200e'; x.fillRect(0, y0 + 61, 256, 3);                  // the join between boards
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeChest() {
  const chest = new THREE.Group();
  const woodMap = woodTexture();
  const wood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: .85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd040, metalness: .75, roughness: .3, emissive: 0x7a5200, emissiveIntensity: .6, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4b8bc, metalness: .7, roughness: .4, emissive: 0x202428, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 1 });
  const add = (geo, mat, pos, rot = [0, 0, 0], parent = chest) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos); m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true;
    parent.add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---- body: a wooden box, planks running across
  const bodyGeo = box(W, H, D);
  add(bodyGeo, wood, [0, H / 2, 0]);
  // gold trim: the four upright corners, and rims round the top and bottom
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(T * 2.2, H + .01, T * 2.2), gold, [sx * (W / 2), H / 2, sz * (D / 2)]);
  for (const y of [T * .9, H - T * .6]) {
    for (const sz of [-1, 1]) add(box(W + .02, T * 1.6, T), gold, [0, y, sz * (D / 2 + T * .3)]);
    for (const sx of [-1, 1]) add(box(T, T * 1.6, D + .02), gold, [sx * (W / 2 + T * .3), y, 0]);
  }

  // ---- lid: a chamfered profile (flat top, bevelled front and back edges) pushed out across the width
  const prof = (d, h, ch) => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(d / 2, h - ch); s.lineTo(d / 2 - ch, h);
    s.lineTo(-d / 2 + ch, h); s.lineTo(-d / 2, h - ch); s.closePath();
    return s;
  };
  const extrude = (shape, depth) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);              // profile in the z-y plane, extruded along x
    return g;
  };
  const lid = new THREE.Group();
  lid.position.y = H;
  chest.add(lid);
  const lidGeo = extrude(prof(D, LID, CH), W);
  // planks along the lid too: map UVs from the world-ish position so boards run across
  {
    const p = lidGeo.attributes.position, uv = lidGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / W + .5, (p.getY(i) + p.getZ(i)) / (D + LID) * .75);
  }
  add(lidGeo, wood, [0, 0, 0], [0, 0, 0], lid);
  // gold frames round each end of the lid (an outline of the profile), and two bands over the top
  const ring = (d, h, ch, inset) => {
    const outer = prof(d + .02, h + .015, ch + .006);
    outer.holes.push(prof(d - inset * 2, h - inset, Math.max(.01, ch - inset * .6)));
    return outer;
  };
  for (const sx of [-1, 1]) add(extrude(ring(D, LID, CH, .045), T * 1.2), gold, [sx * (W / 2 + T * .2), 0, 0], [0, 0, 0], lid);
  for (const bx of [-.17, .17]) {
    add(extrude(ring(D, LID, CH, .012), .065), gold, [bx, 0, 0], [0, 0, 0], lid);
    // studs along each band
    for (const [zz, yy] of [[D / 2 + .012, LID * .35], [D / 2 - CH * .5 + .004, LID - CH * .45], [0, LID + .016], [-D / 2 + CH * .5 - .004, LID - CH * .45], [-D / 2 - .012, LID * .35]]) {
      add(new THREE.SphereGeometry(.011, 6, 4), gold, [bx, yy, zz], [0, 0, 0], lid);
    }
  }
  // front edge of the lid, where it meets the body
  add(box(W + .02, T * 1.4, T), gold, [0, T * .5, D / 2 + T * .3], [0, 0, 0], lid);
  // the hasp the padlock hangs from
  add(box(.07, .08, .014), gold, [0, -.005, D / 2 + .022], [0, 0, 0], lid);

  // ---- steel corner brackets at the feet, with rivets
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * (W / 2 + .004), 0, sz * (D / 2 + .004));
    chest.add(g);
    add(box(.13, .085, .012), steel, [-sx * .055, .0425, 0], [0, 0, 0], g);
    add(box(.012, .085, .13), steel, [0, .0425, -sz * .055], [0, 0, 0], g);
    for (const [rx, rz] of [[-sx * .09, 0], [0, -sz * .09]]) add(new THREE.CylinderGeometry(.009, .009, .016, 6), steel, [rx, .045, rz + sz * .004], [Math.PI / 2 * (rz === 0 ? 1 : 0), 0, Math.PI / 2 * (rx === 0 ? 1 : 0)], g);
  }

  // ---- side ring handle
  for (const sx of [-1, 1]) {
    add(box(.012, .05, .05), steel, [sx * (W / 2 + .03), H * .62, 0]);
    add(new THREE.TorusGeometry(.045, .009, 5, 10), steel, [sx * (W / 2 + .038), H * .48, 0], [0, Math.PI / 2, 0]);
  }

  // ---- padlock: gold body with a keyhole, steel shackle, hanging from the hasp
  const lock = new THREE.Group();
  lock.position.set(0, H - .08, D / 2 + .035);
  lock.scale.setScalar(1.3);
  chest.add(lock);
  const lockBody = new THREE.Shape();
  lockBody.moveTo(-.045, .03); lockBody.lineTo(.045, .03); lockBody.lineTo(.05, -.02);
  lockBody.quadraticCurveTo(.05, -.07, 0, -.075); lockBody.quadraticCurveTo(-.05, -.07, -.05, -.02); lockBody.closePath();
  const lb = new THREE.ExtrudeGeometry(lockBody, { depth: .03, bevelEnabled: true, bevelSize: .005, bevelThickness: .005, bevelSegments: 1 });
  lb.translate(0, 0, -.015);
  add(lb, gold, [0, 0, 0], [0, 0, 0], lock);
  add(new THREE.TorusGeometry(.03, .007, 5, 10, Math.PI), steel, [0, .03, 0], [0, 0, 0], lock);           // shackle
  add(new THREE.CircleGeometry(.011, 8), dark, [0, -.02, .022], [0, 0, 0], lock);                        // keyhole
  add(box(.008, .022, .002), dark, [0, -.036, .022], [0, 0, 0], lock);

  chest.userData.width = W;
  return chest;
}
