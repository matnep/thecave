// Paints the standing stone that carries the logo: soft painterly stone, the logo in charcoal + chalk.
// Coordinates are in slab-space metres (origin = slab centre, +y up).

const rand = mulberry32(1987);
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = (a, b) => a + rand() * (b - a);

function baseRock(x, w, h, [R, G, B], k = 1) {
  x.fillStyle = `rgb(${R},${G},${B})`;
  x.fillRect(0, 0, w, h);
  // mineral blotches
  for (let i = 0; i < 2600 * k * k; i++) {
    const s = r(-14, 14);
    x.fillStyle = `rgba(${R + s * 1.6 | 0},${G + s * 1.2 | 0},${B + s | 0},${r(.05, .22)})`;
    x.beginPath();
    x.ellipse(r(0, w), r(0, h), r(6, 70) * k, r(4, 40) * k, r(0, 3.14), 0, 6.283);
    x.fill();
  }
  // grain
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - .5) * 26;
    d[i] += n; d[i + 1] += n * .9; d[i + 2] += n * .8;
  }
  x.putImageData(img, 0, 0);
}

// ---------- paint helpers ----------
function layer(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// knock flecks out of a paint layer so it reads as old pigment on stone
function weather(ctx, w, h, amount, scale) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < amount; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r(.25, 1)})`;
    ctx.beginPath();
    ctx.ellipse(r(0, w), r(0, h), r(.6, 4.5) * scale, r(.5, 2.5) * scale, r(0, 3.14), 0, 6.283);
    ctx.fill();
  }
  ctx.restore();
}

// brush-y text: several low-alpha passes with tiny offsets give a hand-painted edge
function paintText(ctx, text, x, y, font, color, jitter) {
  ctx.font = font;
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = i === 0 ? 1 : .22;
    ctx.fillText(text, x + r(-jitter, jitter), y + r(-jitter, jitter));
  }
  ctx.globalAlpha = 1;
}

// Turn the logo artwork into paint: anything outside the black outline is dropped,
// the black block becomes charcoal and the white lettering becomes cream.
export function logoPaint(img, w) {
  const h = Math.round(w * img.naturalHeight / img.naturalWidth);
  const P = 3;
  const [c, x] = layer(w + P * 2, h + P * 2);
  x.fillStyle = '#fff';
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, P, P, w, h);
  const cw = c.width, ch = c.height;
  const img2 = x.getImageData(0, 0, cw, ch), d = img2.data;
  const lum = new Float32Array(cw * ch);
  for (let i = 0; i < lum.length; i++) lum[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255;

  // flood-fill the light background from the border; light pixels it can't reach are the letters
  const outside = new Uint8Array(cw * ch);
  const stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const i = stack.pop(), px = i % cw, py = (i / cw) | 0;
    for (const n of [px > 0 ? i - 1 : -1, px < cw - 1 ? i + 1 : -1, py > 0 ? i - cw : -1, py < ch - 1 ? i + cw : -1]) {
      if (n >= 0 && !outside[n] && lum[n] >= .5) { outside[n] = 1; stack.push(n); }
    }
  }
  const DARK = [26, 18, 14], LIGHT = [236, 226, 204];
  for (let i = 0; i < lum.length; i++) {
    const l = lum[i], o = i * 4;
    if (outside[i]) {             // keep only the anti-aliased rim of the black outline
      d[o] = DARK[0]; d[o + 1] = DARK[1]; d[o + 2] = DARK[2]; d[o + 3] = Math.max(0, (1 - l) * 2 - .1) * 255;
    } else {
      for (let k = 0; k < 3; k++) d[o + k] = DARK[k] + (LIGHT[k] - DARK[k]) * l;
      d[o + 3] = 255;
    }
  }
  x.putImageData(img2, 0, 0);
  return c;
}

/**
 * @param slab {w, h} size of the stone face in metres
 * @param px   pixels per metre
 * @param logo {img, w, y} logo width in metres and its top edge (slab metres)
 */
export function paintSlab(slab, px, logo) {
  const W = Math.round(slab.w * px), H = Math.round(slab.h * px);
  const [c, x] = layer(W, H);
  baseRock(x, W, H, [104, 112, 146], W / 1024);
  // painterly light from above: lighter top, darker foot
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(150,175,200,.06)');
  g.addColorStop(1, 'rgba(10,12,30,.35)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  const lw = logo.w * px;
  const lx = (W - lw) / 2;
  const ly = (slab.h / 2 - logo.y) * px;
  const [pc, p] = layer(W, H);
  const CREAM = 'rgb(236,230,214)';
  p.textBaseline = 'alphabetic';

  const small = `${lw * .052}px Anton`;
  p.letterSpacing = `${lw * .004}px`;
  paintText(p, 'AI', lx, ly + lw * .045, small, CREAM, lw * .001);
  p.font = small;
  const aiW = p.measureText('AI').width;
  paintText(p, '*', lx + aiW + lw * .004, ly + lw * .04, small, 'rgb(232,96,52)', lw * .001);
  paintText(p, 'BUILDER SCHOOL', lx + aiW + lw * .03, ly + lw * .045, small, CREAM, lw * .001);
  p.letterSpacing = '0px';

  const art = logoPaint(logo.img, lw);
  const top = ly + lw * .075;
  for (let i = 0; i < 5; i++) {
    p.globalAlpha = i === 0 ? 1 : .2;
    p.drawImage(art, lx + r(-1.5, 1.5), top + r(-1.5, 1.5));
  }
  p.globalAlpha = 1;

  p.letterSpacing = `${lw * .028}px`;
  paintText(p, 'OLD WALLS. NEW IDEAS.', lx + lw * .005, top + art.height + lw * .075, `${lw * .05}px Anton`, 'rgba(236,230,214,.88)', lw * .001);
  p.letterSpacing = '0px';

  weather(p, W, H, 5000, W / 4096);
  x.globalAlpha = .95;
  x.drawImage(pc, 0, 0);
  x.globalAlpha = 1;
  return c;
}

// Neutral painterly grain, multiplied over per-face rock colours.
export function grainCanvas(size = 512) {
  const [c, x] = layer(size, size);
  baseRock(x, size, size, [205, 200, 195], size / 1024);
  return c;
}

// The floating sign: "AI BUILDER SCHOOL" above the logo, on a transparent canvas.
export function floatingLogo(img, lw) {
  const art = logoPaint(img, lw);
  const pad = lw * .02;
  const W = Math.round(lw + pad * 2), H = Math.round(art.height + lw * .07 + pad * 2);
  const [c, p] = layer(W, H);
  p.textBaseline = 'alphabetic';
  p.letterSpacing = `${lw * .004}px`;
  p.font = `${lw * .052}px Anton`;
  p.fillStyle = 'rgb(240,232,214)';
  p.fillText('AI BUILDER SCHOOL', pad, pad + lw * .045);
  p.drawImage(art, pad, pad + lw * .07);
  return c;
}
