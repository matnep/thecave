// Sound for the backdrop, all synthesised with WebAudio (no audio files, so nothing to license).
//   chime(kind, volume)   the new-question sound: 'marimba' | 'bowl' | 'dingdong' | 'none'
//   setAmbience(volume)   the theme's background sound, 0 = off
//   setAmbienceKind(kind) which one: 'fire' (crackling campfire, theme 1) | 'city' (a busy crossing at night, theme 2) | 'rain' | 'hum'
// Browsers only allow sound after a key press or click, so everything waits for unlock() (pressing F is enough).

let ctx = null;
let master = null;
const beds = {};                 // ambience generators made so far, by kind
let bedKind = 'fire', bedWant = 0;

export function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  applyBeds();
}
export const ready = () => ctx?.state === 'running';

// ------------------------------------------------------------------ chimes
function tone(t, freq, { type = 'sine', level = 1, attack = .005, decay = 1, out }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + .05);
}

const CHIMES = {
  // two soft wooden notes, rising: friendly, short, not piercing
  marimba(t, out) {
    for (const [f, dt] of [[392, 0], [587.3, .13]]) {
      tone(t + dt, f, { level: .9, decay: .7, out });
      tone(t + dt, f * 3.93, { level: .18, decay: .12, out });   // the bar's bright overtone, gone almost at once
      tone(t + dt, f * 2, { type: 'triangle', level: .08, decay: .3, out });
    }
  },
  // a singing bowl: low, warm, long tail, with a slow shimmer from two partials beating
  bowl(t, out) {
    const f = 196;
    for (const [r, level, decay] of [[1, .7, 4.5], [1.006, .35, 4.2], [2.71, .22, 2.6], [5.15, .07, 1.4]]) {
      tone(t, f * r, { level, decay, attack: .03, out });
    }
  },
  // gentle two-note ding-dong, like a shop door
  dingdong(t, out) {
    tone(t, 659.3, { level: .7, decay: 1.1, out });
    tone(t, 659.3 * 2, { level: .12, decay: .4, out });
    tone(t + .38, 523.3, { level: .7, decay: 1.5, out });
    tone(t + .38, 523.3 * 2, { level: .12, decay: .5, out });
  },
  none() {},
};

export function chime(kind = 'marimba', volume = .6) {
  if (!ready() || volume <= 0) return;
  const out = ctx.createGain();
  out.gain.value = volume * .55;
  out.connect(master);
  (CHIMES[kind] || CHIMES.marimba)(ctx.currentTime + .02, out);
  setTimeout(() => out.disconnect(), 6000);
}

// ------------------------------------------------------------------ ambience
export function setAmbience(volume) { bedWant = volume; applyBeds(); }
export function setAmbienceKind(kind) { if (MAKERS[kind]) { bedKind = kind; applyBeds(); } }
// the chosen bed at the wanted volume, any other fades out (they crossfade over ~1 s on a theme switch)
function applyBeds() {
  if (!ready()) return;
  if (bedWant > 0 && !beds[bedKind]) beds[bedKind] = MAKERS[bedKind]();
  for (const [kind, bed] of Object.entries(beds)) bed.setVolume(kind === bedKind ? bedWant : 0);
}

// ------------------------------------------------------------------ campfire

// A fire is three layers: a low breathy roar, a faint hiss, and crackles: tiny bursts of filtered noise at random
// moments, mostly small, sometimes a louder pop followed by a little cluster, like resin snapping in a log.
function makeFire() {
  const rate = ctx.sampleRate;
  const white = ctx.createBuffer(1, rate * 3, rate);
  const brown = ctx.createBuffer(1, rate * 6, rate);
  {
    const w = white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // fade the loop seam
    const n = rate * .05;
    for (let i = 0; i < n; i++) { const k = i / n; b[i] *= k; b[b.length - 1 - i] *= k; }
  }

  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(master);

  const loop = (buffer, filter, freq, q, level) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(f).connect(g).connect(out);
    src.start(0, Math.random() * buffer.duration);
    return { src, g };
  };
  const roar = loop(brown, 'lowpass', 420, .5, .55);
  const hiss = loop(white, 'highpass', 5200, .4, .018);

  function crackle(t, { freq, q, dur, level, pan }) {
    const src = ctx.createBufferSource();
    src.buffer = white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(out);
    src.start(t, Math.random() * 2.5, dur + .02);
  }

  // schedule a little ahead on a timer so crackles land exactly on time
  let ahead = ctx.currentTime + .1, timer = null, flare = 1;
  function schedule() {
    const until = ctx.currentTime + .25;
    // the fire's liveliness wanders: roar and crackle rate rise and fall together
    flare += (Math.random() - .5) * .25;
    flare = Math.min(1.6, Math.max(.5, flare));
    roar.g.gain.setTargetAtTime(.45 + flare * .15, ctx.currentTime, .4);
    hiss.g.gain.setTargetAtTime(.012 + flare * .006, ctx.currentTime, .4);
    while (ahead < until) {
      ahead += -Math.log(1 - Math.random()) / (7 * flare);     // ~7 crackles a second, Poisson
      const r = Math.random();
      if (r < .06) {
        // a pop, then a short cluster of sparks
        crackle(ahead, { freq: 500 + Math.random() * 700, q: 1.2, dur: .05 + Math.random() * .05, level: .9, pan: Math.random() * .8 - .4 });
        for (let k = 0, n = 2 + (Math.random() * 6 | 0); k < n; k++) {
          crackle(ahead + .01 + Math.random() * .12, { freq: 2000 + Math.random() * 4000, q: 2, dur: .006 + Math.random() * .012, level: .15 + Math.random() * .35, pan: Math.random() * .8 - .4 });
        }
      } else {
        const big = Math.pow(Math.random(), 3);                  // mostly tiny ticks, the odd loud snap
        crackle(ahead, { freq: 1200 + Math.random() * 4800, q: 1 + Math.random() * 3, dur: .004 + Math.random() * .02, level: .06 + big * .7, pan: Math.random() * 1.2 - .6 });
      }
    }
  }

  return {
    setVolume(v) {
      out.gain.setTargetAtTime(v * .9, ctx.currentTime, .3);
      if (v > 0 && !timer) { ahead = ctx.currentTime + .1; timer = setInterval(schedule, 100); }
      if (v <= 0 && timer) { clearInterval(timer); timer = null; }
    },
  };
}

// ------------------------------------------------------------------ electronic hum
// A low, warm drone (two soft tones a fifth apart, gently beating, through a slowly breathing filter), a faint
// airy wash, and now and then a quiet little blip, like machines thinking somewhere in the dark. Nothing sharp.
function makeHum() {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(master);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = .7;
  filter.connect(out);
  for (const [f, level, type] of [[55, .32, 'sine'], [55.4, .22, 'sine'], [82.4, .16, 'sine'], [110, .05, 'triangle']]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = level;
    o.connect(g).connect(filter);
    o.start();
  }
  // the filter breathes: a very slow wobble opens and closes it
  const lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.frequency.value = .06; depth.gain.value = 160;
  lfo.connect(depth).connect(filter.frequency);
  lfo.start();
  // airy wash
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  const air = ctx.createBufferSource(); air.buffer = noise; air.loop = true;
  const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = .6;
  const airGain = ctx.createGain(); airGain.gain.value = .025;
  air.connect(band).connect(airGain).connect(out);
  air.start();
  // quiet blips every few seconds
  let timer = null;
  const blip = () => {
    const t = ctx.currentTime + .05;
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = 'sine';
    o.frequency.setValueAtTime(900 + Math.random() * 1400, t);
    o.frequency.exponentialRampToValueAtTime(600 + Math.random() * 900, t + .12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.05 + Math.random() * .04, t + .015);
    g.gain.exponentialRampToValueAtTime(.0001, t + .25);
    p.pan.value = Math.random() * 1.4 - .7;
    o.connect(g).connect(p).connect(out);
    o.start(t); o.stop(t + .3);
    timer = setTimeout(blip, 2200 + Math.random() * 5000);
  };
  return {
    setVolume(v) {
      out.gain.setTargetAtTime(v * .9, ctx.currentTime, .4);
      if (v > 0 && !timer) timer = setTimeout(blip, 1500);
      if (v <= 0 && timer) { clearTimeout(timer); timer = null; }
    },
  };
}

// ------------------------------------------------------------------ rainy city night
// Rain is a soft wash of filtered noise with a slow swell, plus fine pattering ticks; under it, a low distant
// city rumble, and now and then a car hissing past on the wet road far away.
function makeRain() {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(master);
  const len = ctx.sampleRate * 3;
  const white = ctx.createBuffer(1, len, ctx.sampleRate), brown = ctx.createBuffer(1, len * 2, ctx.sampleRate);
  { const w = white.getChannelData(0); for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    const b = brown.getChannelData(0); let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    const n = ctx.sampleRate * .05; for (let i = 0; i < n; i++) { const k = i / n; b[i] *= k; b[b.length - 1 - i] *= k; } }
  const loop = (buffer, type, freq, q, level) => {
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = level;
    src.connect(f).connect(g).connect(out); src.start(0, Math.random() * buffer.duration);
    return { f, g };
  };
  const wash = loop(white, 'bandpass', 2600, .45, .22);       // the rain itself
  loop(white, 'highpass', 6500, .5, .05);                     // fine top end
  loop(brown, 'lowpass', 140, .6, .35);                        // distant city rumble
  // the rain swells and eases a little over time
  const lfo = ctx.createOscillator(), depth = ctx.createGain();
  lfo.frequency.value = .05; depth.gain.value = .06;
  lfo.connect(depth).connect(wash.g.gain); lfo.start();
  // patter: tiny soft ticks, scheduled slightly ahead
  let ahead = 0, timer = null, carTimer = null;
  const tick = (t) => {
    const src = ctx.createBufferSource(); src.buffer = white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500 + Math.random() * 5000; f.Q.value = 2;
    const g = ctx.createGain(); const lvl = .03 + Math.pow(Math.random(), 3) * .12;
    g.gain.setValueAtTime(lvl, t); g.gain.exponentialRampToValueAtTime(.0001, t + .015 + Math.random() * .02);
    const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - .8;
    src.connect(f).connect(g).connect(p).connect(out); src.start(t, Math.random() * 2.5, .05);
  };
  const schedule = () => {
    const until = ctx.currentTime + .25;
    while (ahead < until) { ahead += -Math.log(1 - Math.random()) / 22; tick(ahead); }
  };
  // a car hissing past on the wet road, far off: a slow swell of filtered noise panned across
  const car = () => {
    const t = ctx.currentTime + .1, dur = 3 + Math.random() * 2;
    const src = ctx.createBufferSource(); src.buffer = white; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .8;
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1300, t + dur / 2); f.frequency.linearRampToValueAtTime(600, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + dur / 2); g.gain.linearRampToValueAtTime(0, t + dur);
    const p = ctx.createStereoPanner(); const side = Math.random() < .5 ? -1 : 1;
    p.pan.setValueAtTime(-.8 * side, t); p.pan.linearRampToValueAtTime(.8 * side, t + dur);
    src.connect(f).connect(g).connect(p).connect(out); src.start(t); src.stop(t + dur + .1);
    carTimer = setTimeout(car, 9000 + Math.random() * 14000);
  };
  return {
    setVolume(v) {
      out.gain.setTargetAtTime(v * .9, ctx.currentTime, .4);
      if (v > 0 && !timer) { ahead = ctx.currentTime + .1; timer = setInterval(schedule, 100); carTimer = setTimeout(car, 4000); }
      if (v <= 0 && timer) { clearInterval(timer); clearTimeout(carTimer); timer = null; }
    },
  };
}

// ------------------------------------------------------------------ city night (crowd + distant traffic)
// A low city rumble, the murmur of a crowd (voice-band noise that swells and settles), now and then a car
// passing far off, and very occasionally the soft two-tone of a crossing signal. Nothing sharp or sudden.
function makeCity() {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(master);
  const len = ctx.sampleRate * 3;
  const white = ctx.createBuffer(1, len, ctx.sampleRate), brown = ctx.createBuffer(1, len * 2, ctx.sampleRate);
  { const w = white.getChannelData(0); for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    const b = brown.getChannelData(0); let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    const n = ctx.sampleRate * .05; for (let i = 0; i < n; i++) { const k = i / n; b[i] *= k; b[b.length - 1 - i] *= k; } }
  const loop = (buffer, type, freq, q, level) => {
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = level;
    src.connect(f).connect(g).connect(out); src.start(0, Math.random() * buffer.duration);
    return { f, g };
  };
  loop(brown, 'lowpass', 120, .6, .4);                        // the city's low rumble
  // crowd murmur: two voice-band layers drifting in level, so it sounds like many conversations
  const murmurs = [loop(white, 'bandpass', 420, 1.4, .05), loop(white, 'bandpass', 900, 1.8, .03)];
  let timer = null, carTimer = null, chimeTimer = null;
  const drift = () => {
    const t = ctx.currentTime;
    for (const m of murmurs) m.g.gain.setTargetAtTime(.025 + Math.random() * .04, t, 1.5);
  };
  const car = () => {
    const t = ctx.currentTime + .1, dur = 3 + Math.random() * 2;
    const src = ctx.createBufferSource(); src.buffer = white; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .7;
    f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(800, t + dur / 2); f.frequency.linearRampToValueAtTime(350, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.07, t + dur / 2); g.gain.linearRampToValueAtTime(0, t + dur);
    const p = ctx.createStereoPanner(); const side = Math.random() < .5 ? -1 : 1;
    p.pan.setValueAtTime(-.8 * side, t); p.pan.linearRampToValueAtTime(.8 * side, t + dur);
    src.connect(f).connect(g).connect(p).connect(out); src.start(t); src.stop(t + dur + .1);
    carTimer = setTimeout(car, 7000 + Math.random() * 12000);
  };
  // a crossing signal far off: two soft tones, repeated a few times, quiet
  const chime = () => {
    const t0 = ctx.currentTime + .1;
    for (let k = 0; k < 4; k++) for (const [f, dt] of [[880, 0], [660, .22]]) {
      const t = t0 + k * .6 + dt;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.018, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .2);
      o.connect(g).connect(out); o.start(t); o.stop(t + .25);
    }
    chimeTimer = setTimeout(chime, 30000 + Math.random() * 30000);
  };
  return {
    setVolume(v) {
      out.gain.setTargetAtTime(v * .9, ctx.currentTime, .4);
      if (v > 0 && !timer) { timer = setInterval(drift, 2500); carTimer = setTimeout(car, 3000); chimeTimer = setTimeout(chime, 15000); }
      if (v <= 0 && timer) { clearInterval(timer); clearTimeout(carTimer); clearTimeout(chimeTimer); timer = null; }
    },
  };
}

const MAKERS = { fire: makeFire, hum: makeHum, rain: makeRain, city: makeCity };
