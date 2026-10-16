// Artist-made low-poly models for the cave's wildlife, loaded once and cloned per animal.
//   duck  public/models/mallard.glb    "Mallard duck" by Poly by Google (CC-BY 3.0), via poly.pizza/m/frSLi6b6Vid
//   fish  public/models/clownfish.glb  "Clownfish" by Quaternius (CC0), via poly.pizza/m/769fHo3eEB (rigged + animated)
// Each model comes in facing its own way and at its own scale, so it's measured on load: turned to face +x
// (the way the swimming code steers), scaled to a set length, centred, and sat on y = 0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const box = new THREE.Box3(), v = new THREE.Vector3();

// which horizontal way a model faces: along its longest horizontal side, toward the end nearest the given point
// (the head / the eyes). Returns the rotation.y that turns that way onto +x.
function facing(center, size, toward) {
  if (size.x >= size.z) return toward.x > center.x ? 0 : Math.PI;
  return toward.z > center.z ? Math.PI / 2 : -Math.PI / 2;
}

// wrap `obj` so it faces +x and is `length` long, centred on x/z; its lowest point goes to y = sink
// (or, with centred, its middle goes to y = 0)
function normalise(obj, forwardPoint, length, sink = 0, centred = false) {
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const turn = facing(c, size, forwardPoint);
  const along = Math.abs(Math.sin(turn)) > .5 ? size.z : size.x;
  const s = length / along;
  const pivot = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(obj);
  obj.position.sub(c);                       // centre the model at the origin
  inner.rotation.y = turn;
  inner.scale.setScalar(s);
  inner.position.y = centred ? 0 : (size.y / 2) * s + sink;
  pivot.add(inner);
  return pivot;
}

export async function loadCreatureModels() {
  const loader = new GLTFLoader();
  const [duck, fish] = await Promise.all([loader.loadAsync('/models/mallard.glb'), loader.loadAsync('/models/clownfish.glb')]);

  // ---- duck: the head is the highest part of the model, so the forward end is wherever the top vertices are
  duck.scene.updateMatrixWorld(true);
  box.setFromObject(duck.scene);
  const top = box.max.y, head = new THREE.Vector3(); let n = 0;
  duck.scene.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (v.y > top * .8) { head.add(v); n++; }
    }
    m.castShadow = true;
    // a touch of roughness so it doesn't look plastic in the firelight
    if (m.material) { m.material.roughness = .8; m.material.metalness = 0; }
  });
  head.divideScalar(Math.max(1, n));
  const chickMat = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: .85, emissive: 0x3a2a08, flatShading: true });
  const duckTemplate = normalise(duck.scene, head, .62, -.13);   // sits low, feet under the water

  // ---- fish: forward is wherever its eyes are. The file's colours are very dark; give it real clownfish colours.
  const FISH_COLOURS = { Clownfish_Main: 0xff6a12, Clownfish_Light: 0xf6f2ea, Clownfish_Dark: 0x161311, Eyes: 0x050404 };
  fish.scene.updateMatrixWorld(true);
  let eyes = null;
  fish.scene.traverse((m) => {
    if (!m.isMesh) return;
    const hexColour = FISH_COLOURS[m.material?.name];
    if (hexColour !== undefined) { m.material.color.setHex(hexColour); m.material.roughness = .5; m.material.metalness = 0; }
    m.frustumCulled = false;                 // skinned: the bind-pose bounds don't follow the animation
    if (m.material?.name === 'Eyes') eyes = box.setFromObject(m).getCenter(new THREE.Vector3());
  });
  box.setFromObject(fish.scene);
  const fishForward = eyes || box.max.clone();
  const clips = Object.fromEntries(fish.animations.map((a) => [a.name.split('|').pop(), a]));

  return {
    // a fresh duck: shares geometry and materials with the template. Ducklings are plain fluffy yellow,
    // so the little ones (and the lost duckling) stand out on the dark water.
    duck(kind = 'adult') {
      const d = duckTemplate.clone(true);
      if (kind === 'chick') d.traverse((m) => { if (m.isMesh) m.material = chickMat; });
      return d;
    },
    // a fresh fish with its own skeleton and animation mixer: play('Swimming_Fast' | 'Out_Of_Water' | …)
    fish() {
      const model = SkeletonUtils.clone(fish.scene);
      const object = normalise(model, fishForward, .55, 0, true);
      const mixer = new THREE.AnimationMixer(model);
      let current = null;
      return {
        object, mixer,
        play(name, fade = .2) {
          const clip = clips[name];
          if (!clip) return;
          const next = mixer.clipAction(clip);
          if (current === next) return;
          next.reset().fadeIn(fade).play();
          current?.fadeOut(fade);
          current = next;
        },
      };
    },
  };
}
