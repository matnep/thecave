// What's on the TV. Draws onto a 1024x768 canvas that the 3D scene uses as the CRT texture.
// Only two things ever show: the QR code (with one caption line) and audience questions.
// Automatic: questions queue up; each is typed out, held, then the TV goes back to the QR.
// Manual (presenter keys): → next question, ← previous, ↑ the QR, ↓ back to automatic.
// While manual, whatever was picked stays up; new questions still ping and wait in the queue.
// Switching content waits for the static burst to peak (SWAP_MS) so the change is hidden in the noise.

const W = 1024, H = 768;
const AMBER = '#ffb238';
const MX = 78;   // safe margin inside the curved glass
const QUESTION_MS = 15000;
const TYPE_CPS = 38;
const SWAP_MS = 140;
const HISTORY = 200;
const QR_SIZE = 500;   // leaves room for a big, readable caption underneath

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
    this.onSwitch = () => {};       // content is about to change (start the static burst)
    this.onQuestion = () => {};     // a new question just arrived (ping + shake)
    this.queue = [];                // waiting to be shown
    this.history = [];              // already shown, oldest first
    this.idx = -1;                  // position in history while showing a question
    this.manual = false;
    this.current = null;
    this.pending = null;            // what's about to replace current, mid-static
    this.caption = 'SCAN TO ASK A QUESTION';
    this.focus = false;             // camera zoom only; doesn't change what's on the TV
    this.timer = null;
    this.swapTimer = null;
    this.dirty = true;
    this.lastBlink = -1;
    this.lastTyped = -1;
  }

  // ---------- running order ----------
  start() { this.next(); }

  // automatic flow
  next() {
    clearTimeout(this.timer);
    if (this.manual) return;
    if (this.queue.length) return this.showQuestion(this.queue.shift());
    this.showQr();
  }

  showQr() {
    clearTimeout(this.timer);
    if ((this.pending || this.current)?.kind === 'qr') return;
    this.show({ kind: 'qr' });
  }

  showQuestion(m, { replay = false } = {}) {
    clearTimeout(this.timer);
    if (!replay) {
      this.history = this.history.filter((q) => q.id !== m.id);
      this.history.push(m);
      if (this.history.length > HISTORY) this.history.shift();
    }
    this.idx = this.history.findIndex((q) => q.id === m.id);
    this.show({ kind: 'question', m, instant: replay });
    if (!this.manual) this.timer = setTimeout(() => this.next(), QUESTION_MS + m.text.length * 25 + SWAP_MS);
  }

  show(item) {
    this.onSwitch(item);
    clearTimeout(this.swapTimer);
    this.pending = item;
    this.swapTimer = setTimeout(() => {
      this.pending = null;
      // a replayed question appears already typed out
      this.current = { ...item, at: performance.now() - (item.instant ? 1e6 : 0) };
      this.dirty = true;
    }, SWAP_MS);
  }

  enqueue(m) {
    this.queue.push(m);
    this.onQuestion(m);
    if (!this.manual && (this.pending || this.current)?.kind !== 'question') this.next();
  }
  // admin "put on TV now": always shows straight away
  spotlight(m) {
    this.queue = this.queue.filter((q) => q.id !== m.id);
    this.onQuestion(m);
    this.showQuestion(m);
  }
  remove(id) {
    this.queue = this.queue.filter((q) => q.id !== id);
    this.history = this.history.filter((q) => q.id !== id);
    if ((this.pending || this.current)?.m?.id === id) this.manual ? this.show({ kind: 'qr' }) : this.next();
  }
  clear() {
    this.queue = [];
    if (!this.manual && (this.pending || this.current)?.kind === 'question') this.next();
  }
  setFocus(on) { this.focus = on; }
  setConfig({ caption } = {}) {
    if (typeof caption === 'string' && caption.trim()) this.caption = caption.trim().toUpperCase();
    this.dirty = true;
  }

  // ---------- presenter keys ----------
  right() {
    this.manual = true;
    if (this.queue.length) return this.showQuestion(this.queue.shift());
    const showingQ = (this.pending || this.current)?.kind === 'question';
    const i = showingQ ? this.idx + 1 : this.history.length - 1;   // from the QR, → brings back the latest
    if (i >= 0 && i < this.history.length && !(showingQ && i === this.idx)) this.showQuestion(this.history[i], { replay: true });
  }
  left() {
    this.manual = true;
    const showingQ = (this.pending || this.current)?.kind === 'question';
    const i = showingQ ? this.idx - 1 : this.history.length - 1;
    if (i >= 0) this.showQuestion(this.history[i], { replay: true });
  }
  up() { this.manual = true; this.showQr(); }
  auto() { this.manual = false; this.next(); }

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
