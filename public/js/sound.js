// Sound for the backdrop, all synthesised with WebAudio (no audio files, so nothing to license).
//   chime(kind, volume)   the new-question sound: 'marimba' | 'bowl' | 'dingdong' | 'none'
//   setFire(volume)       crackling campfire ambience, 0 = off
// Browsers only allow sound after a key press or click, so everything waits for unlock() (pressing F is enough).

let ctx = null;
let master = null;
let fire = null;
let fireWant = 0;

export function unlock() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (fireWant > 0 && !fire) fire = makeFire();
  fire?.setVolume(fireWant);
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

// ------------------------------------------------------------------ campfire
export function setFire(volume) {
  fireWant = volume;
  if (!ready()) return;
  if (volume > 0 && !fire) fire = makeFire();
  fire?.setVolume(volume);
}

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
