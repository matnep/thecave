// A top-down map of how much open water there is around any point, so swimmers can steer round rocks.
// Rock triangles that reach the waterline are stamped into a grid, along with the shore (anywhere the floor
// is too shallow to swim). A distance transform then gives, for every cell, the distance to the nearest
// obstacle: clear(x, z) in world units, and away(x, z) for the direction that leads into more open water.
export function createClearance({ x0, z0, x1, z1, cell = .12, shallow = -.12, groundY }) {
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((z1 - z0) / cell);
  const dist = new Float32Array(W * H).fill(1e9);
  const block = (i, j) => { if (i >= 0 && j >= 0 && i < W && j < H) dist[j * W + i] = 0; };

  // the shore
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (groundY(x0 + (i + .5) * cell, z0 + (j + .5) * cell) > shallow) block(i, j);
  }

  return {
    // stamp a rock: wherever one of its faces sits at swimming height (y between lo and hi) the cell is blocked.
    // Two passes per triangle: cells inside its footprint where its height is in range (flat-ish faces), and
    // the lines where it crosses a few levels near the waterline (steep faces, whose footprint is a sliver).
    // Geometry is expected in world space, non-indexed.
    addGeometry(geo, lo = -.3, hi = .6) {
      const p = geo.attributes.position.array;
      const mark = (x, z) => block(Math.floor((x - x0) / cell), Math.floor((z - z0) / cell));
      for (let k = 0; k < p.length; k += 9) {
        const ax = p[k], ay = p[k + 1], az = p[k + 2], bx = p[k + 3], by = p[k + 4], bz = p[k + 5], cx = p[k + 6], cy = p[k + 7], cz = p[k + 8];
        if (Math.max(ay, by, cy) < lo || Math.min(ay, by, cy) > hi) continue;
        // footprint cells, with the face's height at each cell centre
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(den) > 1e-9) {
          const i0 = Math.floor((Math.min(ax, bx, cx) - x0) / cell), i1 = Math.floor((Math.max(ax, bx, cx) - x0) / cell);
          const j0 = Math.floor((Math.min(az, bz, cz) - z0) / cell), j1 = Math.floor((Math.max(az, bz, cz) - z0) / cell);
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const x = x0 + (i + .5) * cell, z = z0 + (j + .5) * cell;
            const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, w = 1 - u - v;
            if (u < 0 || v < 0 || w < 0) continue;
            const y = u * ay + v * by + w * cy;
            if (y >= lo && y <= hi) block(i, j);
          }
        }
        // where the face crosses the waterline (and just above it), walked in small steps
        for (const level of [0, .2]) {
          const hits = [];
          for (const [px, py, pz, qx, qy, qz] of [[ax, ay, az, bx, by, bz], [bx, by, bz, cx, cy, cz], [cx, cy, cz, ax, ay, az]]) {
            if ((py - level) * (qy - level) > 0 || py === qy) continue;
            const t = (level - py) / (qy - py);
            hits.push([px + (qx - px) * t, pz + (qz - pz) * t]);
          }
          if (hits.length < 2) continue;
          const [[sx, sz], [ex, ez]] = hits;
          const n = Math.max(1, Math.ceil(Math.hypot(ex - sx, ez - sz) / (cell * .5)));
          for (let s = 0; s <= n; s++) mark(sx + (ex - sx) * s / n, sz + (ez - sz) * s / n);
        }
      }
    },

    // 8-neighbour chamfer distance transform; call once after everything is stamped
    finish() {
      const D = cell, DD = cell * Math.SQRT2;
      const at = (i, j) => dist[j * W + i];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        let d = at(i, j);
        if (i > 0) d = Math.min(d, at(i - 1, j) + D);
        if (j > 0) d = Math.min(d, at(i, j - 1) + D);
        if (i > 0 && j > 0) d = Math.min(d, at(i - 1, j - 1) + DD);
        if (i < W - 1 && j > 0) d = Math.min(d, at(i + 1, j - 1) + DD);
        dist[j * W + i] = d;
      }
      for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
        let d = at(i, j);
        if (i < W - 1) d = Math.min(d, at(i + 1, j) + D);
        if (j < H - 1) d = Math.min(d, at(i, j + 1) + D);
        if (i < W - 1 && j < H - 1) d = Math.min(d, at(i + 1, j + 1) + DD);
        if (i > 0 && j < H - 1) d = Math.min(d, at(i - 1, j + 1) + DD);
        dist[j * W + i] = d;
      }
      return this;
    },

    // open water around (x, z), in world units; 0 = on a rock or the shore. Outside the map counts as blocked.
    clear(x, z) {
      const fi = (x - x0) / cell - .5, fj = (z - z0) / cell - .5;
      const i = Math.floor(fi), j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= W - 1 || j >= H - 1) return 0;
      const u = fi - i, v = fj - j;
      const a = dist[j * W + i], b = dist[j * W + i + 1], c = dist[(j + 1) * W + i], d = dist[(j + 1) * W + i + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    },

    // unit direction toward more open water (the gradient of clear), written into out = { x, z }
    away(x, z, out = { x: 0, z: 0 }) {
      const e = cell;
      const gx = this.clear(x + e, z) - this.clear(x - e, z), gz = this.clear(x, z + e) - this.clear(x, z - e);
      const l = Math.hypot(gx, gz) || 1;
      out.x = gx / l; out.z = gz / l;
      return out;
    },
  };
}
