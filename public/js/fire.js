// Campfire: coals, a ring of stones, a log teepee, shader flames, a few embers and the flickering light.
import * as THREE from 'three';

const flameMat = (seed, hue) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uHue: { value: hue }, uPower: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: `
    varying vec2 vUv; uniform float uTime, uSeed, uHue, uPower;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
    void main(){
      vec2 uv = vUv;
      float t = uTime + uSeed * 17.;
      vec2 q = vec2(uv.x * 3.2, uv.y * 2.4 - t * 2.1);
      float n = fbm(q + vec2(fbm(q * 1.4 + t * .35), 0.));
      float x = (uv.x - .5) * 2.;
      float h = uv.y;
      float width = mix(.78, .04, pow(h, .75));
      float lick = (n - .5) * .7 * h;
      float shape = 1. - smoothstep(width * .45, width, abs(x + lick));
      float body = shape * (1. - smoothstep(.15, 1., h + (n - .5) * .55)) * smoothstep(0., .1, h);
      float I = pow(body, 1.2) * (n * 1.5 + .25) * uPower;
      vec3 col = mix(vec3(.75, .12, .01), vec3(1., .42 + uHue, .06), smoothstep(.12, .5, I));
      col = mix(col, vec3(1., .78, .45), smoothstep(.75, 1.2, I));
      gl_FragColor = vec4(col * I * .8, 1.);
    }`,
});

/**
 * @param scene
 * @param at        THREE.Vector3 ground position of the fire
 * @param makeStone (size[3], seed) => BufferGeometry  for the stone ring
 * @param stoneMat  material for the stones
 * @param noise     SimplexNoise instance
 */
export function makeFire(scene, at, makeStone, stoneMat, noise) {
  const g = new THREE.Group();
  g.position.copy(at);
  scene.add(g);
  const add = (geo, mat, pos, { cast = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.castShadow = cast; m.receiveShadow = true;
    g.add(m); return m;
  };

  const coalMat = new THREE.MeshStandardMaterial({ color: 0x140c08, roughness: 1, emissive: 0xff3a0a, emissiveIntensity: 1.6 });
  add(new THREE.CircleGeometry(.62, 24), coalMat, [0, .04, 0], { cast: false }).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2 + .2, rr = .82 + Math.sin(i * 7.3) * .05;
    const sz = .17 + (Math.sin(i * 3.1) + 1) * .04;
    add(makeStone([sz * 1.3, sz * .8, sz], 40 + i), stoneMat, [Math.cos(a) * rr, sz * .45, Math.sin(a) * rr]).rotation.y = a;
  }
  const logMat = new THREE.MeshStandardMaterial({ color: 0x1c130d, roughness: .95, emissive: 0x7a1800, emissiveIntensity: .25 });
  const UP = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + .3;
    const base = new THREE.Vector3(Math.cos(a) * .55, .06, Math.sin(a) * .55);
    const top = new THREE.Vector3(Math.cos(a + .5) * .06, .78 + (i % 2) * .08, Math.sin(a + .5) * .06);
    const dir = top.clone().sub(base);
    const log = add(new THREE.CylinderGeometry(.06, .085, dir.length(), 7), logMat, base.clone().add(top).multiplyScalar(.5).toArray());
    log.quaternion.setFromUnitVectors(UP, dir.normalize());
  }

  const flames = [
    [1.5, 2.4, 0, 0, .1], [1.15, 1.8, -.25, .1, .05], [1.1, 1.7, .28, -.1, .12], [.8, 1.3, .05, .25, .16],
  ].map(([w, h, dx, dz, hue], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), flameMat(i * 1.37, hue));
    m.position.set(dx, .05 + h / 2, dz);
    m.renderOrder = 2;
    g.add(m);
    return m;
  });

  // a handful of embers
  const N = 40;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), fade = new Float32Array(N);
  const respawn = (i, age = 0) => {
    pos[i * 3] = (Math.random() - .5) * .8; pos[i * 3 + 1] = .6 + Math.random() * .4; pos[i * 3 + 2] = (Math.random() - .5) * .8;
    vel[i * 3] = (Math.random() - .5) * .25; vel[i * 3 + 1] = .5 + Math.random() * .9; vel[i * 3 + 2] = (Math.random() - .5) * .25;
    max[i] = 1.5 + Math.random() * 3; life[i] = age;
  };
  for (let i = 0; i < N; i++) respawn(i, Math.random() * 4);
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  eg.setAttribute('life', new THREE.BufferAttribute(fade, 1));
  g.add(new THREE.Points(eg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `attribute float life; varying float vA;
      void main(){ vA = life; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = 26. / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard;
        gl_FragColor = vec4(vec3(1., .45, .1) * smoothstep(.5, .0, d) * vA * 4., 1.); }`,
  })));

  const light = new THREE.PointLight(0xff7a2e, 0, 0, 1.7);
  light.position.set(0, 1.3, 0);
  g.add(light);
  const spill = new THREE.PointLight(0xff6a20, 0, 0, 1.8);
  spill.position.set(0, .5, .5);
  g.add(spill);

  return {
    light,
    update(t, dt, ig, camera) {
      const flick = .78 + .14 * noise.noise(t * 2.3, 0) + .08 * noise.noise(t * 9.5, 4);
      light.intensity = 30 * flick * ig;
      spill.intensity = 7 * flick * ig;
      light.position.set(noise.noise(t * 1.7, 9) * .12, 1.3 + noise.noise(t * 2.1, 3) * .1, 0);
      coalMat.emissiveIntensity = (1.2 + .6 * noise.noise(t * .8, 2)) * ig;
      logMat.emissiveIntensity = (.2 + .15 * noise.noise(t * 1.3, 5)) * ig;
      for (const f of flames) {
        f.material.uniforms.uTime.value = t;
        f.material.uniforms.uPower.value = ig;
        f.rotation.y = Math.atan2(camera.position.x - g.position.x - f.position.x, camera.position.z - g.position.z - f.position.z);
      }
      for (let i = 0; i < N; i++) {
        life[i] += dt;
        if (life[i] > max[i]) { respawn(i); continue; }
        const k = i * 3;
        vel[k] += noise.noise3d(pos[k] * .8, pos[k + 1] * .8, t * .3) * dt * .9;
        vel[k + 2] += noise.noise3d(pos[k + 2] * .8, pos[k + 1] * .8, t * .3 + 5) * dt * .9;
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        fade[i] = Math.sin(life[i] / max[i] * Math.PI) * (.6 + .4 * Math.sin(t * 20 + i)) * ig;
      }
      eg.attributes.position.needsUpdate = true;
      eg.attributes.life.needsUpdate = true;
    },
  };
}
