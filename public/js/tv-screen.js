// What's on the TV. Draws onto a 1024x768 canvas that the 3D scene uses as the CRT texture.
// Three things show: the QR code (with one caption line), partner logos and audience questions.
// Automatic (a slideshow): new questions go up straight away; otherwise the TV cycles
//   QR → up to QS_PER_ROUND approved questions → every partner logo, one after another → QR …
// so every approved question keeps coming back until it's marked answered or hidden in the admin.
// Manual (presenter keys / admin remote): → next question, ← previous, ↑ the QR, ↓ back to the slideshow.
// While manual, whatever was picked stays up; new questions still sound the alarm and wait their turn.
// Switching content waits for the static burst to peak (SWAP_MS) so the change is hidden in the noise.

const W = 1024, H = 768;
const AMBER = '#ffb238';
const MX = 78;   // safe margin inside the curved glass
const TYPE_CPS = 38;
const SWAP_MS = 140;
const QS_PER_ROUND = 3;         // questions between two QR codes in the slideshow
const QR_SIZE = 500;   // leaves room for a big, readable caption underneath
const QR_HOLD_MS = 14000;       // QR between rounds
const PARTNER_MS = 6500;        // each partner logo
const PARTNER_GAP = 24;         // empty columns that separate two partners in partners.png

// partners.png is one strip of logos. Cut it into one canvas per partner wherever there's a wide transparent gap
// (an icon and its wordmark sit closer than that, so they stay together). White wordmarks turn amber to suit the tube.
function splitPartners(img) {
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, w, h).data;
  const solid = (i, j) => d[(j * w + i) * 4 + 3] > 20;
  const used = [...Array(w)].map((_, i) => { for (let j = 0; j < h; j++) if (solid(i, j)) return true; return false; });
  const spans = [];
  for (let i = 0, gap = Infinity; i < w; i++) {
    if (!used[i]) { gap++; continue; }
    if (gap >= PARTNER_GAP || !spans.length) spans.push([i, i + 1]); else spans[spans.length - 1][1] = i + 1;
    gap = 0;
  }
  return spans.map(([a, b]) => {
    let top = h, bottom = 0;
    for (let j = 0; j < h; j++) for (let i = a; i < b; i++) if (solid(i, j)) { top = Math.min(top, j); bottom = Math.max(bottom, j + 1); }
    const out = document.createElement('canvas');
    out.width = b - a; out.height = bottom - top;
    const o = out.getContext('2d');
    o.drawImage(c, a, top, out.width, out.height, 0, 0, out.width, out.height);
    const px = o.getImageData(0, 0, out.width, out.height);
    const p = px.data;
    for (let k = 0; k < p.length; k += 4) {
      if (p[k] > 200 && p[k + 1] > 200 && p[k + 2] > 200) { p[k] = 255; p[k + 1] = 178; p[k + 2] = 56; }
    }
    o.putImageData(px, 0, 0);
    return out;
  });
}

// Turn the server's dark-on-light QR into light-on-transparent at exactly the size it's shown,
// with crisp module edges (phones read inverted codes fine).
function invertQr(img, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0, size, size);
  const data = x.getImageData(0, 0, size, size);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const dark = d[i] + d[i + 1] + d[i + 2] < 384;
    d[i] = 255; d[i + 1] = 178; d[i + 2] = 56;      // AMBER
    d[i + 3] = dark ? 255 : 0;
  }
  x.putImageData(data, 0, 0);
  return c;
}

export class TVScreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    // the QR is drawn inverted, amber squares straight on the dark glass, so it belongs to the TV
    this.qr = null;
    const img = new Image();
    img.onload = () => { this.qr = invertQr(img, QR_SIZE); this.dirty = true; };
    img.src = '/api/qr.svg';
    this.partners = [];
    this.sponsors = true;           // admin switch
    const strip = new Image();
    strip.onload = () => { this.partners = splitPartners(strip); };
    strip.src = '/partners.png';
    this.onSwitch = () => {};       // content is about to change (start the static burst)
    this.onQuestion = () => {};     // a new question just arrived (sound + alarm light)
    this.onStatus = () => {};       // what's showing changed (reported to the admin and moderator panel)
    this.approved = [];             // every question cleared for the TV, oldest first (from the server)
    this.fresh = [];                // ids that arrived but haven't been shown yet
    this.rot = 0;                   // slideshow position in `approved`
    this.sinceQr = 0;               // questions shown since the QR was last up
    this.manual = false;
    this.current = null;
    this.pending = null;            // what's about to replace current, mid-static
    this.caption = 'SCAN TO ASK A QUESTION';
    this.questionMs = 25000;        // admin setting: how long a question stays up once typed out
    this.focus = false;             // camera zoom only; doesn't change what's on the TV
    this.timer = null;
    this.swapTimer = null;
    this.dirty = true;
    this.lastBlink = -1;
    this.lastTyped = -1;
  }

  get showing() { return this.pending || this.current; }
  indexOf(id) { return this.approved.findIndex((q) => q.id === id); }
  takeFresh() {
    while (this.fresh.length) {
      const q = this.approved[this.indexOf(this.fresh.shift())];
      if (q) return q;
    }
    return null;
  }

  // ---------- running order ----------
  start() { this.next(); }

  // the slideshow: decide what follows whatever is up now
  next() {
    clearTimeout(this.timer);
    if (this.manual) return;
    const q = this.takeFresh();
    if (q) return this.showQuestion(q);
    const kind = this.showing?.kind;
    const n = this.approved.length;
    if (kind === 'qr' && n) return this.showQuestion(this.approved[this.rot % n]);
    if (kind === 'question' && n && this.sinceQr < Math.min(QS_PER_ROUND, n)) return this.showQuestion(this.approved[this.rot % n]);
    if ((kind === 'qr' || kind === 'question') && this.sponsors && this.partners.length) return this.showPartner();
    this.showQr();
  }

  showQr() {
    clearTimeout(this.timer);
    this.sinceQr = 0;
    this.show({ kind: 'qr' });
    if (!this.manual) this.timer = setTimeout(() => this.next(), QR_HOLD_MS);
  }

  // all the partner logos in turn, then the slideshow carries on (a new question cuts in straight away)
  showPartner(i = 0) {
    clearTimeout(this.timer);
    this.show({ kind: 'partner', i });
    this.timer = setTimeout(() => (i + 1 < this.partners.length && this.sponsors ? this.showPartner(i + 1) : this.next()), PARTNER_MS);
  }

  showQuestion(m, { instant = false } = {}) {
    clearTimeout(this.timer);
    this.fresh = this.fresh.filter((id) => id !== m.id);
    const i = this.indexOf(m.id);
    if (i >= 0) this.rot = i + 1;      // the slideshow carries on after this one
    this.sinceQr++;
    this.show({ kind: 'question', m, instant });
    if (!this.manual) this.timer = setTimeout(() => this.next(), this.questionMs + (m.text.length / TYPE_CPS) * 1000 + SWAP_MS + 400);
  }

  show(item) {
    const was = this.showing;
    if (was && was.kind === item.kind && was.i === item.i && was.m?.id === item.m?.id) return;   // already up
    this.onSwitch(item);
    clearTimeout(this.swapTimer);
    this.pending = item;
    this.swapTimer = setTimeout(() => {
      this.pending = null;
      // a question the presenter steps back to appears already typed out
      this.current = { ...item, at: performance.now() - (item.instant ? 1e6 : 0) };
      this.dirty = true;
      this.report();
    }, SWAP_MS);
  }

  report() {
    const c = this.current;
    this.onStatus({ kind: c?.kind || null, id: c?.m?.id ?? null, manual: this.manual });
  }

  // the server's list of questions cleared for the TV (sent on connect and after every change)
  setApproved(list) {
    this.approved = list.slice().sort((a, b) => a.id - b.id);
    this.fresh = this.fresh.filter((id) => this.indexOf(id) >= 0);
    const up = this.showing;
    if (up?.kind !== 'question') return;
    const now = this.approved[this.indexOf(up.m.id)];
    if (!now) this.manual ? this.showQr() : this.next();     // answered, hidden or deleted
    else if (now.text !== up.m.text || now.name !== up.m.name) { up.m = now; this.dirty = true; }
  }

  // a question just arrived: sound + light now, on screen as soon as it's its turn
  arrive(q) {
    if (this.indexOf(q.id) < 0) this.approved = [...this.approved, q].sort((a, b) => a.id - b.id);
    if (!this.fresh.includes(q.id)) this.fresh.push(q.id);
    this.onQuestion(q);
    if (!this.manual && this.showing?.kind !== 'question') this.next();
  }
  // admin "put on TV now": always shows straight away
  spotlight(q) {
    if (this.indexOf(q.id) < 0) this.approved = [...this.approved, q].sort((a, b) => a.id - b.id);
    this.onQuestion(q);
    this.showQuestion(q);
  }
  setFocus(on) { this.focus = on; }
  setConfig({ caption, sponsors, questionSecs } = {}) {
    if (typeof caption === 'string' && caption.trim()) this.caption = caption.trim().toUpperCase();
    if (typeof questionSecs === 'number') this.questionMs = questionSecs * 1000;
    if (typeof sponsors === 'boolean') {
      this.sponsors = sponsors;
      if (!sponsors && this.showing?.kind === 'partner') this.next();
    }
    this.dirty = true;
  }

  // ---------- presenter keys / admin remote ----------
  right() {
    this.setManual(true);
    const q = this.takeFresh();                 // anything not seen yet comes first
    if (q) return this.showQuestion(q);
    if (!this.approved.length) return;
    const up = this.showing;
    const i = up?.kind === 'question' ? this.indexOf(up.m.id) + 1 : this.approved.length - 1;   // from the QR, → brings back the latest
    if (i >= 0 && i < this.approved.length) this.showQuestion(this.approved[i], { instant: true });
  }
  left() {
    this.setManual(true);
    if (!this.approved.length) return;
    const up = this.showing;
    const i = up?.kind === 'question' ? this.indexOf(up.m.id) - 1 : this.approved.length - 1;
    if (i >= 0) this.showQuestion(this.approved[i], { instant: true });
  }
  up() { this.setManual(true); this.showQr(); }
  auto() { this.setManual(false); this.next(); }
  setManual(on) {
    if (this.manual === on) return;
    this.manual = on;
    clearTimeout(this.timer);
    this.report();
  }

  get isLive() { return this.current?.kind === 'question'; }

  // ---------- drawing ----------
  // returns true when the canvas changed (so the texture needs re-uploading)
  draw(now) {
    const blink = Math.floor(now / 530) % 2;
    // while a question types out, redraw only when another letter appears (the canvas upload is the costly part)
    const typedNow = this.current?.kind === 'question' ? Math.min(this.typed(now), this.current.m.text.length + 2) : -1;
    if (!this.dirty && typedNow === this.lastTyped && blink === this.lastBlink) return false;
    this.dirty = false; this.lastBlink = blink; this.lastTyped = typedNow;

    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0b0704';
    c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 620);
    g.addColorStop(0, 'rgba(255,150,40,.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.textBaseline = 'alphabetic';

    const cur = this.current;
    if (!cur) return true;
    if (cur.kind === 'qr') this.qrView(blink);
    else if (cur.kind === 'partner') this.partnerView(cur.i);
    else if (cur.kind === 'question') this.question(cur, now, blink);
    return true;
  }

  glow(on) {
    this.ctx.shadowColor = on ? 'rgba(255,140,30,.7)' : 'transparent';
    this.ctx.shadowBlur = on ? 14 : 0;
  }
  text(str, x, y, size, color = AMBER, align = 'left') {
    const c = this.ctx;
    c.font = `${size}px VT323`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(str, x, y);
  }
  fit(str, maxW, start, min = 30) {
    const c = this.ctx;
    let size = start;
    do { c.font = `${size}px VT323`; } while (c.measureText(str).width > maxW && (size -= 2) > min);
    return size;
  }
  wrap(str, maxW) {
    const c = this.ctx, lines = [];
    let line = '';
    for (const word of str.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (c.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  drawQr(x, y, size) {
    this.glow(false);
    if (this.qr) this.ctx.drawImage(this.qr, x, y, size, size);
  }

  // the QR, nearly filling the tube, with one caption line underneath
  qrView(blink) {
    const size = QR_SIZE;
    this.drawQr((W - size) / 2, 52, size);
    this.glow(true);
    const cap = this.caption + (blink ? '_' : ' ');
    // big enough to read from the back of the room (sized to fit the width, up to 88px)
    this.text(cap, W / 2, 668, this.fit(cap, W - MX * 2, 88, 40), AMBER, 'center');
    this.glow(false);
  }

  // one partner logo, as large as the glass allows
  partnerView(i) {
    const logo = this.partners[i];
    if (!logo) return;
    const s = Math.min((W - MX * 2 - 40) / logo.width, 380 / logo.height);
    const w = logo.width * s, h = logo.height * s;
    const c = this.ctx;
    this.glow(true);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(logo, (W - w) / 2, (H - h) / 2 - 10, w, h);
    this.glow(false);
  }

  typed(now) { return Math.floor(((now - this.current.at) / 1000 - .35) * TYPE_CPS); }

  question(cur, now, blink) {
    const m = cur.m;
    const maxW = W - MX * 2;
    this.glow(true);
    // largest size where the whole question fits
    const full = `"${m.text}"`;
    let size = 104, lines;
    for (; size >= 40; size -= 4) {
      this.ctx.font = `${size}px VT323`;
      lines = this.wrap(full, maxW);
      if (lines.length * size * .95 <= 440) break;
    }
    const blockH = lines.length * size * .95;
    let left = Math.max(0, this.typed(now)) + 1;     // +1 for the opening quote
    let y = Math.max(110, (H - blockH) / 2 - 30) + size * .72;
    for (const line of lines) {
      const shown = line.slice(0, Math.max(0, left));
      this.text(shown, MX, y, size);
      left -= line.length + 1;
      if (left <= 0) {
        if (blink) {
          this.ctx.font = `${size}px VT323`;
          const cx = MX + this.ctx.measureText(shown).width + 6;
          this.ctx.fillStyle = AMBER;
          this.ctx.fillRect(cx, y - size * .62, size * .38, size * .66);
        }
        break;
      }
      y += size * .95;
    }
    // who asked: big and full-strength so it reads from the room
    if (m.name && left > 0) this.text(`- ${m.name.toUpperCase()}`, MX, Math.min(H - 64, y + 96), this.fit(`- ${m.name.toUpperCase()}`, W - MX * 2, 72, 40), AMBER);
    this.glow(false);
  }
}
