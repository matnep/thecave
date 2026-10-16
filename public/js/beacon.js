// Red alarm beacon that sits on the TV, low-poly like everything else in the cave.
// trigger() turns it on when a question arrives: the bulb blazes, two beams sweep round and the
// light washes the rocks red, then it winds down after ALARM_SECS.
import * as THREE from 'three';

const ALARM_SECS = 6;
const SPIN = 7;            // radians per second, a little over one turn a second

export function makeBeacon() {
  const group = new THREE.Group();

  // black rubber base: a squat 8-sided puck with a lip
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1b1716, roughness: .55, metalness: .1, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.23, .26, .12, 8), baseMat);
  base.position.y = .06;
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(.21, .23, .035, 8), baseMat);
  lip.position.y = .135;
  group.add(base, lip);

  // red dome: a faceted lathe (straight sides, rounded cap) in glossy translucent plastic
  const profile = [[.0, .5], [.07, .49], [.13, .45], [.17, .37], [.185, .27], [.19, .15]].map(([x, y]) => new THREE.Vector2(x, y));
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xd01a0a, emissive: 0xff2208, emissiveIntensity: .15, roughness: .25, metalness: 0,
    transparent: true, opacity: .82, flatShading: true, depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), domeMat);
  dome.renderOrder = 2;
  group.add(dome);

  // the lamp inside: a smaller faceted capsule that glows
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.35, .05, .02), toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.LatheGeometry([[0, .38], [.06, .37], [.09, .32], [.095, .16]].map(([x, y]) => new THREE.Vector2(x, y)), 6), bulbMat);
  group.add(bulb);

  // two beams, back to back, swept round by a spinning reflector
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOn: { value: 0 } },
    vertexShader: `varying float vAlong; varying vec3 vN, vV;
      void main(){
        vAlong = position.y;                 // 0 at the lamp, 1 at the far end
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vAlong; varying vec3 vN, vV; uniform float uOn;
      void main(){
        float edge = pow(abs(dot(vN, vV)), 1.5);     // soft sides, so it reads as a shaft of light
        float a = (1. - vAlong) * (1. - vAlong) * edge * uOn * .9;
        gl_FragColor = vec4(vec3(1., .16, .06) * a, a);
      }`,
  });
  // open cone with its tip at the lamp and y running 0 → 1 along it (the shader fades on that); stretched per mesh
  const beamGeo = new THREE.ConeGeometry(.75, 1, 10, 1, true);
  beamGeo.rotateX(Math.PI);
  beamGeo.translate(0, .5, 0);
  const spinner = new THREE.Group();
  spinner.position.y = .27;
  for (const s of [1, -1]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.z = s * Math.PI / 2;   // lie flat, one each way
    beam.scale.set(1, 3.2, 1);
    beam.renderOrder = 3;
    beam.frustumCulled = false;
    spinner.add(beam);
  }
  spinner.visible = false;
  group.add(spinner);

  // the red wash on the surroundings; always present (intensity 0 when idle) so lighting never recompiles
  const light = new THREE.PointLight(0xff2a10, 0, 9, 1.6);
  light.position.y = .3;
  group.add(light);

  let left = 0;            // seconds of alarm remaining
  let on = 0;              // eased 0..1

  return {
    group,
    trigger() { left = ALARM_SECS; },
    get active() { return on > .01; },
    update(dt, t) {
      left = Math.max(0, left - dt);
      const want = left > 0 ? 1 : 0;
      on += (want - on) * Math.min(1, dt * (want ? 10 : 2.5));
      spinner.rotation.y = t * SPIN;
      spinner.visible = on > .01;
      beamMat.uniforms.uOn.value = on;
      // the lamp pulses as the reflector passes the front
      const sweep = .6 + .4 * Math.abs(Math.cos(t * SPIN));
      bulbMat.color.setRGB(.35 + on * 1.7 * sweep, .05 + on * .22 * sweep, .02 + on * .08 * sweep);
      domeMat.emissiveIntensity = .12 + on * .75 * sweep;
      light.intensity = on * 7 * sweep;
    },
  };
}
