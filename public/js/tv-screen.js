// What's on the TV. Draws onto a 1024x768 canvas that the 3D scene uses as the CRT texture.
// Owns the running order: idle slides → QR → … and interrupts with audience questions.

const W = 1024, H = 768;
const AMBER = '#ffb238';
const AMBER_DIM = 'rgba(255,178,56,.55)';
const MX = 78, TOP = 66, BOTTOM = 704;   // safe area inside the curved glass

const SLIDES = [
  { kind: 'text', lines: ['BIG IDEAS.', 'REAL PEOPLE.'], sub: 'stories from the people building it', ms: 7000 },
  { kind: 'qr', ms: 11000 },
  { kind: 'text', lines: ['AI. TECH.', 'MALAYSIA.'], sub: 'old walls. new ideas.', ms: 7000 },
  { kind: 'qr', ms: 11000 },
];
const QUESTION_MS = 15000;
const TYPE_CPS = 38;

export class TVScreen {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.qr = new Image();
    this.qr.onload = () => (this.dirty = true);
    this.qr.src = '/api/qr.svg';
    this.onSwitch = () => {};
    this.queue = [];
    this.current = null;
    this.slideIndex = 0;
    this.focus = false;
    this.timer = null;
    this.dirty = true;
    this.lastBlink = -1;
  }

  // ---------- running order ----------
  start() { this.next(); }

  next() {
    clearTimeout(this.timer);
    if (this.focus) return this.show({ kind: 'qr', big: true });
    if (this.queue.length) {
      const m = this.queue.shift();
      this.show({ kind: 'question', m, waiting: this.queue.length });
      this.timer = setTimeout(() => this.next(), QUESTION_MS + m.text.length * 25);
      return;
    }
    const s = SLIDES[this.slideIndex];
    this.slideIndex = (this.slideIndex + 1) % SLIDES.length;
    this.show(s);
    this.timer = setTimeout(() => this.next(), s.ms);
  }

  show(item) {
    this.current = { ...item, at: performance.now() };
    this.dirty = true;
    this.onSwitch(item);
  }

  enqueue(m) {
    this.queue.push(m);
    if (!this.focus && this.current?.kind !== 'question') this.next();
  }
  spotlight(m) {
    this.queue = this.queue.filter((q) => q.id !== m.id);
    this.queue.unshift(m);
    if (!this.focus) this.next();
  }
  remove(id) {
    this.queue = this.queue.filter((q) => q.id !== id);
    if (this.current?.m?.id === id) this.next();
  }
  clear() {
    this.queue = [];
    if (this.current?.kind === 'question') this.next();
  }
  setFocus(on) {
    if (this.focus === on) return;
    this.focus = on;
    this.next();
  }
  get isLive() { return this.current?.kind === 'question'; }

  // ---------- drawing ----------
  // returns true when the canvas changed (so the texture needs re-uploading)
  draw(now) {
    const blink = Math.floor(now / 530) % 2;
    const typing = this.current?.kind === 'question' && this.typed(now) < this.current.m.text.length;
    if (!this.dirty && !typing && blink === this.lastBlink) return false;
    this.dirty = false; this.lastBlink = blink;

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

    if (!(cur.kind === 'qr' && cur.big)) this.chrome(cur, blink);
    if (cur.kind === 'text') this.textSlide(cur);
    else if (cur.kind === 'qr') cur.big ? this.bigQr() : this.qrSlide(blink);
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

  chrome(cur, blink) {
    const c = this.ctx;
    this.glow(true);
    const live = cur.kind === 'question';
    if (!live || blink) {
      c.fillStyle = live ? '#ff5a2a' : AMBER;
      c.beginPath(); c.arc(MX + 10, TOP + 1, 9, 0, 6.283); c.fill();
    }
    this.text(live ? 'THE CAVE // LIVE QUESTION' : 'THE CAVE // ON AIR', MX + 32, TOP + 13, 40);
    const t = new Date();
    this.text(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, W - MX, TOP + 13, 40, AMBER_DIM, 'right');
    c.fillStyle = 'rgba(255,178,56,.25)';
    c.fillRect(MX, TOP + 34, W - MX * 2, 2);
    this.text('AIBUILDERSCHOOL.COM', MX, BOTTOM, 36, AMBER_DIM);
    this.text('CH 03', W - MX, BOTTOM, 36, AMBER_DIM, 'right');
    this.glow(false);
  }

  textSlide(s) {
    this.glow(true);
    let y = 300;
    for (const line of s.lines) { this.text(line, MX - 4, y, 156); y += 132; }
    this.text(s.sub.toUpperCase(), MX, y + 6, 40, AMBER_DIM);
    this.glow(false);
  }

  drawQr(x, y, size) {
    const c = this.ctx;
    this.glow(false);
    c.fillStyle = '#f4e6cf';
    c.fillRect(x - 10, y - 10, size + 20, size + 20);
    if (this.qr.complete && this.qr.naturalWidth) c.drawImage(this.qr, x, y, size, size);
  }

  fit(str, maxW, start, min = 30) {
    const c = this.ctx;
    let size = start;
    do { c.font = `${size}px VT323`; } while (c.measureText(str).width > maxW && (size -= 2) > min);
    return size;
  }

  qrSlide(blink) {
    const size = 470;
    this.drawQr(MX + 10, 140, size);
    const x = MX + size + 52, maxW = W - MX - x;
    this.glow(true);
    const big = this.fit('QUESTION?', maxW, 110);
    this.text('GOT A', x, 270, big);
    this.text('QUESTION?', x, 270 + big * .92, big);
    const small = this.fit('THE CONVERSATION', maxW, 40);
    this.text('SCAN TO JOIN', x, 470, small, AMBER_DIM);
    this.text('THE CONVERSATION' + (blink ? '_' : ''), x, 470 + small * 1.05, small, AMBER_DIM);
    this.glow(false);
  }

  bigQr() {
    // the camera dollies in for this one, so the code gets nearly the whole tube
    const size = 560;
    this.drawQr((W - size) / 2, 62, size);
    this.glow(true);
    this.text('SCAN TO ASK A QUESTION', W / 2, 712, 52, AMBER, 'center');
    this.glow(false);
  }

  typed(now) { return Math.floor(((now - this.current.at) / 1000 - .35) * TYPE_CPS); }

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

  question(cur, now, blink) {
    const m = cur.m;
    const qrSize = 150;
    const maxW = W - MX * 2 - qrSize - 40;
    this.glow(true);
    this.text(cur.waiting ? `> INCOMING QUESTION  [+${cur.waiting} WAITING]` : '> INCOMING QUESTION', MX, 160, 40, '#ff7a3a');

    // largest size where the whole question fits
    const full = `"${m.text}"`;
    let size = 92, lines;
    for (; size >= 40; size -= 4) {
      this.ctx.font = `${size}px VT323`;
      lines = this.wrap(full, maxW);
      if (lines.length * size * .95 <= 380) break;
    }
    let left = Math.max(0, this.typed(now)) + 1;     // +1 for the opening quote
    let y = 230 + size * .7;
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
    if (m.name) this.text(`- ${m.name.toUpperCase()}`, MX, 640, 44, AMBER_DIM);
    this.glow(false);
    this.drawQr(W - MX - qrSize, 500, qrSize);
  }
}
