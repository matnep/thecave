// Alarm beacon that sits on the TV, low-poly like everything else in the cave.
// Idle it's clear, colourless glass. trigger() (a new question) floods it red and it comes alive like a doodle:
// the shape "boils" (re-jittered a few times a second, like a hand-drawn animation) and scribbled alarm marks
// flick around it while it pulses, then it drains back to clear after ALARM_SECS.
import * as THREE from 'three';

const ALARM_SECS = 6;
const BOIL_FPS = 9;        // doodle frame rate: low on purpose, that's what makes it read as hand-drawn
const PULSE_HZ = 2.2;

const CLEAR = new THREE.Color(0xb4b0a8), RED = new THREE.Color(0xe0180a);
const BULB_OFF = new THREE.Color(.16, .155, .15), BULB_ON = new THREE.Color(.95, .05, .02);

// scribbled alarm marks: short wobbly strokes fanning out over the lamp, in a few hand-drawn variants
function doodleFrames(n = 3) {
  return Array.from({ length: n }, (_, f) => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = '#ff4a26';
    x.shadowColor = 'rgba(255,60,20,.8)'; x.shadowBlur = 6;
    const rnd = (k) => { const s = Math.sin((f * 97 + k) * 12.9898) * 43758.5453; return s - Math.floor(s); };
    // strokes in an arc over the top, a gap at the bottom where the beacon sits
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.08 + i * .14) + (rnd(i) - .5) * .12;
      const r0 = 62 + rnd(i + 20) * 10, r1 = r0 + 28 + rnd(i + 40) * 22;
      x.lineWidth = 6 + rnd(i + 60) * 3;
      x.beginPath();
      const steps = 5;
      for (let s = 0; s <= steps; s++) {
        const r = r0 + (r1 - r0) * s / steps;
        const wob = (rnd(i * 7 + s + f * 3) - .5) * 7;
        const px = 128 + Math.cos(a) * r - Math.sin(a) * wob, py = 150 + Math.sin(a) * r + Math.cos(a) * wob;
        s ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.stroke();
    }
    // a couple of little sparks
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * (1.15 + rnd(i + 80) * .7), r = 112 + rnd(i + 90) * 10;
      const px = 128 + Math.cos(a) * r, py = 150 + Math.sin(a) * r;
      x.lineWidth = 4;
      x.beginPath(); x.moveTo(px - 6, py); x.lineTo(px + 6, py); x.moveTo(px, py - 6); x.lineTo(px, py + 6); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

export function makeBeacon() {
  const group = new THREE.Group();

  // black rubber base: a squat 8-sided puck with a lip
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b1716, roughness: .55, metalness: .1, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.23, .26, .12, 8), baseMat);
  base.position.y = .06;
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(.21, .23, .035, 8), baseMat);
  lip.position.y = .135;
  base.castShadow = lip.castShadow = true;
  group.add(base, lip);

  // the dome: a faceted lathe (straight sides, rounded cap) in glossy plastic
  const profile = [[.0, .5], [.07, .49], [.13, .45], [.17, .37], [.185, .27], [.19, .15]].map(([x, y]) => new THREE.Vector2(x, y));
  const domeGeo = new THREE.LatheGeometry(profile, 8);
  const domeMat = new THREE.MeshStandardMaterial({
    color: CLEAR.clone(), emissive: 0xff2208, emissiveIntensity: 0, roughness: .2, metalness: 0,
    transparent: true, opacity: .45, flatShading: true, depthWrite: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = 2;
  group.add(dome);

  // the lamp inside
  const bulbGeo = new THREE.LatheGeometry([[0, .38], [.06, .37], [.09, .32], [.095, .16]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone(), toneMapped: false });
  group.add(new THREE.Mesh(bulbGeo, bulbMat));

  // doodle boil: each frame of the "animation" nudges every vertex a little, keyed on its position so the
  // lathe's seam (duplicated vertices) moves as one
  const boilers = [domeGeo, bulbGeo].map((geo) => ({ geo, rest: Float32Array.from(geo.attributes.position.array) }));
  let boilFrame = -1;
  function boil(frame, amount) {
    for (const { geo, rest } of boilers) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
        const key = Math.round(x * 1000) * 7.1 + Math.round(y * 1000) * 3.7 + Math.round(z * 1000) * 1.3 + frame * 31.7;
        const h = (k) => { const s = Math.sin(key * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s) - .5; };
        p.setXYZ(i, x + h(1) * amount, y + h(2) * amount, z + h(3) * amount);
      }
      p.needsUpdate = true;
    }
  }

  // scribbled alarm marks around the top, cycling through hand-drawn variants
  const frames = doodleFrames(3);
  const marksMat = new THREE.SpriteMaterial({ map: frames[0], transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const marks = new THREE.Sprite(marksMat);
  marks.position.y = .36;
  marks.scale.setScalar(1.05);
  marks.renderOrder = 3;
  marks.visible = false;
  group.add(marks);

  // a red wash on the surroundings; always present (0 when idle) so lighting never recompiles
  const light = new THREE.PointLight(0xff2a10, 0, 7, 1.6);
  light.position.y = .75;            // above the dome, so it lights the surroundings rather than blowing out the glass
  group.add(light);

  let left = 0;            // seconds of alarm remaining
  let on = 0;              // eased 0..1: how red it is

  return {
    group,
    trigger() { left = ALARM_SECS; },
    get active() { return on > .01; },
    update(dt, t) {
      left = Math.max(0, left - dt);
      const want = left > 0 ? 1 : 0;
      on += (want - on) * Math.min(1, dt * (want ? 6 : 1.8));
      const pulse = .55 + .45 * Math.max(0, Math.sin(t * Math.PI * 2 * PULSE_HZ));

      domeMat.color.copy(CLEAR).lerp(RED, on);
      domeMat.opacity = .45 + on * .4;
      domeMat.emissiveIntensity = on * (.15 + .4 * pulse);
      bulbMat.color.copy(BULB_OFF).lerp(BULB_ON, on * pulse);
      light.intensity = on * 3.5 * pulse;

      const frame = Math.floor(t * BOIL_FPS);
      if (on > .01 && frame !== boilFrame) {
        boilFrame = frame;
        boil(frame, .012 * on);
        marksMat.map = frames[frame % frames.length];
      } else if (on <= .01 && boilFrame !== -1) {
        boilFrame = -1;
        boil(0, 0);                                // settle back to the clean shape
      }
      marksMat.opacity = Math.min(1, on * 1.4) * (.6 + .4 * pulse);
      marks.visible = on > .02;
    },
  };
}
