// Bakes many small static meshes into one mesh per material (one draw call each instead of dozens).
// Only direct-or-nested meshes of `root` whose material passes `pick` are merged; their transforms
// relative to `root` are baked in, so `root` itself can still move (e.g. the TV shaking).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mergeStatic(root, pick = () => true) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();   // material -> [{ mesh, geometry }]
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o === root || !pick(o.material, o)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, o.matrixWorld));
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push({ mesh: o, geometry: g });
  });
  for (const [material, items] of groups) {
    if (items.length < 2) { items[0].geometry.dispose(); continue; }
    // keep only attributes every piece has, so the merge always succeeds
    const names = Object.keys(items[0].geometry.attributes).filter((n) => items.every((it) => it.geometry.attributes[n]));
    for (const it of items) for (const n of Object.keys(it.geometry.attributes)) if (!names.includes(n)) it.geometry.deleteAttribute(n);
    const merged = new THREE.Mesh(mergeGeometries(items.map((it) => it.geometry)), material);
    merged.castShadow = items.some((it) => it.mesh.castShadow);
    merged.receiveShadow = items.some((it) => it.mesh.receiveShadow);
    for (const it of items) {
      it.geometry.dispose();
      // children of a merged mesh (e.g. a knob's tick) were merged too; detach the original
      it.mesh.removeFromParent();
      it.mesh.geometry.dispose();
    }
    root.add(merged);
  }
}
