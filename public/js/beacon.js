// Alarm beacon that sits on the TV, low-poly like everything else in the cave.
// Idle it's clear, colourless glass. trigger() (a new question) floods it red, it rattles on the cabinet
// like an old alarm going off, pulses, then drains back to clear after ALARM_SECS.
import * as THREE from 'three';

const ALARM_SECS = 6;
const SHAKE_SECS = 1.6;    // the hard rattle when it goes off; a lighter buzz follows while it's lit
const PULSE_HZ = 2.2;

const CLEAR = new THREE.Color(0xb4b0a8), RED = new THREE.Color(0xe0180a);
const BULB_OFF = new THREE.Color(.16, .155, .15), BULB_ON = new THREE.Color(.95, .05, .02);

export function makeBeacon() {
  const group = new THREE.Group();
  const body = new THREE.Group();          // everything that rattles; the outer group stays where the scene put it
  group.add(body);

  // black rubber base: a squat 8-sided puck with a lip
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b1716, roughness: .55, metalness: .1, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.23, .26, .12, 8), baseMat);
  base.position.y = .06;
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(.21, .23, .035, 8), baseMat);
  lip.position.y = .135;
  base.castShadow = lip.castShadow = true;
  body.add(base, lip);

  // the dome: a faceted lathe (straight sides, rounded cap) in glossy plastic
  const profile = [[.0, .5], [.07, .49], [.13, .45], [.17, .37], [.185, .27], [.19, .15]].map(([x, y]) => new THREE.Vector2(x, y));
  const domeGeo = new THREE.LatheGeometry(profile, 8);
  const domeMat = new THREE.MeshStandardMaterial({
    color: CLEAR.clone(), emissive: 0xff2208, emissiveIntensity: 0, roughness: .2, metalness: 0,
    transparent: true, opacity: .45, flatShading: true, depthWrite: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = 2;
  body.add(dome);

  // the lamp inside
  const bulbGeo = new THREE.LatheGeometry([[0, .38], [.06, .37], [.09, .32], [.095, .16]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: BULB_OFF.clone(), toneMapped: false });
  body.add(new THREE.Mesh(bulbGeo, bulbMat));

  // a red wash on the surroundings; always present (0 when idle) so lighting never recompiles
  const light = new THREE.PointLight(0xff2a10, 0, 7, 1.6);
  light.position.y = .75;            // above the dome, so it lights the surroundings rather than blowing out the glass
  group.add(light);

  let left = 0;            // seconds of alarm remaining
  let shake = 99;          // seconds since it went off
  let on = 0;              // eased 0..1: how red it is

  return {
    group,
    trigger() { left = ALARM_SECS; shake = 0; },
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

      // rattle: a hard jitter that settles, then a light buzz while lit; it hops on its rubber base
      shake += dt;
      const hard = Math.max(0, 1 - shake / SHAKE_SECS);
      const k = hard * hard * .9 + on * .12;
      body.rotation.z = Math.sin(t * 47) * .14 * k;
      body.rotation.x = Math.sin(t * 39 + 1.3) * .1 * k;
      body.position.x = Math.sin(t * 53 + .7) * .025 * k;
      body.position.z = Math.sin(t * 43 + 2.1) * .02 * k;
      body.position.y = Math.abs(Math.sin(t * 31)) * .035 * k;
    },
  };
}
