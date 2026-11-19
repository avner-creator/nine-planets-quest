/* Nine Planets Quest — synthesized game audio (WebAudio only: no files, no network).
 *
 *   const audio = new GameAudio();                    // no AudioContext yet
 *   addEventListener('pointerdown', () => audio.unlock());
 *   audio.play('coin', { volume: 1, pitch: 1, pan: 0 });
 *   audio.setLoop('wind', 0.5);                       // 0 = fade out
 *   audio.setMusicMood('day');                        // 'menu' | 'day' | 'night' | 'boss' | 'none'
 *   audio.update(dt);                                 // every frame
 *
 * Every public method is a silent no-op before unlock() and never throws.
 */

const MAX_VOICES = 24;      // simultaneous one-shot sound effects
const THROTTLE_S = 0.04;    // the same sound name at most once per 40 ms
const SFX_LEVEL = 0.9;
const MUSIC_LEVEL = 0.55;
const REVERB_RETURN = 0.3;
const LOOKAHEAD = 0.3;      // music scheduling window (seconds)
const MAX_LOOP_EVENTS = 16; // crackles / bubbles alive at once

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const st = (f, semis) => f * Math.pow(2, semis / 12);
const wall = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
const SPARK = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96, 3520, 4186.01];

/* ───────────────────────── Voice: one short-lived node graph ───────────────────────── */
// Times passed to helpers are relative to the voice start (t0). All nodes are tracked and
// disconnected in dispose(), which the engine calls once `end` has passed.
class Voice {
  constructor(A, o = {}) {
    const c = A.ctx;
    this.A = A;
    this.c = c;
    this.t0 = Math.max(o.at || 0, c.currentTime + 0.005);
    this.end = this.t0 + 0.05;
    this.nodes = [];
    this.srcs = [];
    this.dead = false;
    this.out = this.g(o.vol == null ? 1 : o.vol);
    let tail = this.out;
    if (o.pan && c.createStereoPanner) {
      const pn = this._add(c.createStereoPanner());
      pn.pan.value = clamp(o.pan, -1, 1);
      tail.connect(pn);
      tail = pn;
    }
    tail.connect(o.dest || A.sfx);
    const verb = o.verb || A.verbIn;
    if (o.send > 0 && verb) { const s = this.g(o.send); tail.connect(s); s.connect(verb); }
  }

  _add(n) { this.nodes.push(n); this.A._made++; return n; }
  g(v = 1) { const n = this._add(this.c.createGain()); n.gain.value = v; return n; }
  filt(type, f, q = 0.7) {
    const n = this._add(this.c.createBiquadFilter());
    n.type = type; n.frequency.value = f; n.Q.value = q;
    return n;
  }
  osc(type, f, t = 0) {
    const o = this._add(this.c.createOscillator());
    o.type = type;
    this.freq(o.frequency, f, t);
    return o;
  }
  noiseSrc(color = 'white') {
    const s = this._add(this.c.createBufferSource());
    s.buffer = this.A.noise[color] || this.A.noise.white;
    s.loop = true;
    return s;
  }
  // number → constant value; [[dt, value], ...] → exponential curve starting at t
  freq(param, f, t = 0) {
    if (Array.isArray(f)) { param.value = f[0][1]; this.curve(param, t, f); } else param.value = f;
  }
  curve(param, t, pts, linear = false) {
    const s = this.t0 + t;
    for (let i = 0; i < pts.length; i++) {
      const at = s + pts[i][0], val = pts[i][1];
      if (i === 0) param.setValueAtTime(val, at);
      else if (linear) param.linearRampToValueAtTime(val, at);
      else param.exponentialRampToValueAtTime(Math.max(1e-4, val), at);
    }
  }
  // attack → (hold) → exponential decay; ends at t + d
  env(param, t, a, d, v, hold = 0) {
    const s = this.t0 + t, pk = Math.max(2e-4, v), atk = Math.max(0.001, a);
    const end = s + Math.max(d, atk + hold + 0.02);
    param.setValueAtTime(1e-4, s);
    param.linearRampToValueAtTime(pk, s + atk);
    if (hold > 0) param.setValueAtTime(pk, s + atk + hold);
    param.exponentialRampToValueAtTime(1e-4, end);
    return end;
  }
  run(src, t, dur, isNoise = false) {
    const s = this.t0 + t;
    if (isNoise && src.buffer) src.start(s, Math.random() * Math.max(0, src.buffer.duration - 0.2));
    else src.start(s);
    this.srcs.push(src);
    if (!isFinite(dur)) { this.end = Infinity; return; }
    src.stop(s + dur + 0.03);
    if (s + dur + 0.06 > this.end) this.end = s + dur + 0.06;
  }

  // ── building blocks ──
  // oscillator → optional filter (lp/bp/hp, number or curve) → envelope → dest
  tone(o) {
    const t = o.t || 0, d = o.d || 0.3;
    const osc = this.osc(o.type || 'sine', o.f || 440, t);
    if (o.det) osc.detune.value = o.det;
    let head = osc;
    const ff = o.lp || o.bp || o.hp;
    if (ff) {
      const fl = this.filt(o.lp ? 'lowpass' : o.bp ? 'bandpass' : 'highpass', 1000, o.q || 0.7);
      this.freq(fl.frequency, ff, t);
      osc.connect(fl); head = fl;
    }
    const g = this.g(0);
    head.connect(g); g.connect(o.to || this.out);
    this.env(g.gain, t, o.a || 0.005, d, o.v == null ? 0.3 : o.v, o.hold || 0);
    this.run(osc, t, d);
    return osc;
  }
  // noise → filter (number or curve) → envelope → dest
  hiss(o) {
    const t = o.t || 0, d = o.d || 0.2;
    const src = this.noiseSrc(o.color || 'white');
    const fl = this.filt(o.type || 'bandpass', 1000, o.q || 1);
    this.freq(fl.frequency, o.f || 1000, t);
    const g = this.g(0);
    src.connect(fl); fl.connect(g); g.connect(o.to || this.out);
    this.env(g.gain, t, o.a || 0.005, d, o.v == null ? 0.3 : o.v, o.hold || 0);
    this.run(src, t, d, true);
    return { src, fl, g };
  }
  // struck bell: inharmonic partials, higher ones fade faster
  bell(f, t, d, v, partials = 5) {
    const P = [[1, 1, 1], [2.0, 0.5, 0.7], [2.76, 0.35, 0.5], [4.07, 0.18, 0.35], [5.4, 0.12, 0.25]];
    for (let i = 0; i < Math.min(partials, P.length); i++) {
      const [r, amp, dd] = P[i];
      this.tone({ f: f * r, t, d: d * dd, v: v * amp, a: 0.002 });
    }
  }
  chime(f, t, d, v) {
    this.tone({ f, t, d, v, a: 0.002 });
    this.tone({ type: 'triangle', f: f * 2, t, d: d * 0.45, v: v * 0.22, a: 0.002 });
  }
  sparkle(t, n, span, v, lo = 1500, hi = 4300) {
    const pool = SPARK.filter((f) => f >= lo && f <= hi);
    for (let i = 0; i < n; i++) {
      this.tone({ f: pick(pool) * rnd(0.995, 1.005), t: t + (span * i) / n + rnd(0, 0.02), d: rnd(0.1, 0.22), v, a: 0.002 });
    }
  }
  // "aah" choir: detuned saws through vowel formants, shared vibrato
  choir(freqs, t, a, hold, d, v) {
    const pre = this.g(1), out = this.g(0);
    for (const [ff, q, amp] of [[800, 6, 1], [1150, 7, 0.55], [2900, 9, 0.22]]) {
      const bp = this.filt('bandpass', ff, q), gg = this.g(amp * 2.5);
      pre.connect(bp); bp.connect(gg); gg.connect(out);
    }
    const lfo = this.osc('sine', 5.2), lg = this.g(9);
    lfo.connect(lg); this.run(lfo, t, d);
    for (const f of freqs) {
      for (const det of [-9, 8]) {
        const o = this.osc('sawtooth', f);
        o.detune.value = det; lg.connect(o.detune); o.connect(pre); this.run(o, t, d);
      }
    }
    out.connect(this.out);
    this.env(out.gain, t, a, d, v, hold);
  }
  // brassy note: two detuned saws, filter opens on attack
  brass(f, t, d, v) {
    const lp = this.filt('lowpass', f, 1.2);
    this.curve(lp.frequency, t, [[0, f * 1.2], [0.05, f * 5], [d, f * 2]]);
    const g = this.g(0);
    lp.connect(g); g.connect(this.out);
    for (const det of [-6, 6]) { const o = this.osc('sawtooth', f); o.detune.value = det; o.connect(lp); this.run(o, t, d); }
    this.env(g.gain, t, 0.025, d, v, d * 0.4);
  }

  // fast fade then stop (used when stealing a voice)
  kill(fade = 0.03) {
    try {
      const t = this.c.currentTime, gp = this.out.gain;
      gp.cancelScheduledValues(t);
      gp.setValueAtTime(gp.value, t);
      gp.linearRampToValueAtTime(0, t + fade);
      for (const s of this.srcs) { try { s.stop(t + fade + 0.01); } catch (e) { /* already stopped */ } }
      this.end = t + fade + 0.04;
    } catch (e) { this.dispose(); }
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    for (const s of this.srcs) { try { s.stop(); } catch (e) { /* ignore */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    this.A._freed += this.nodes.length;
    this.nodes.length = 0;
    this.srcs.length = 0;
  }
}

/* ───────────────────────── one-shot sounds ───────────────────────── */
// fn(v, p, opts): v = Voice, p = pitch multiplier. send = reverb amount, vol = level trim,
// low = may be dropped when all voices are busy.
const SOUNDS = {
  // ── sword & combat ──
  swing: { send: 0.08, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 450 * p], [0.1, 2600 * p], [0.23, 900 * p]], q: 1.3, a: 0.07, d: 0.25, v: 1 });
    v.hiss({ type: 'highpass', f: 4000 * p, a: 0.05, d: 0.15, v: 0.05 });
  } },
  swing2: { send: 0.08, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 650 * p], [0.08, 3300 * p], [0.21, 1100 * p]], q: 1.6, a: 0.05, d: 0.23, v: 1 });
    v.tone({ type: 'triangle', f: [[0, 320 * p], [0.15, 170 * p]], a: 0.03, d: 0.16, v: 0.05 });
  } },
  swing3: { send: 0.12, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 280 * p], [0.17, 2000 * p], [0.38, 550 * p]], q: 1.1, a: 0.11, d: 0.42, v: 1.2 });
    v.hiss({ color: 'brown', type: 'lowpass', f: 500 * p, a: 0.1, d: 0.36, v: 0.7 });
    v.tone({ f: [[0, 170 * p], [0.32, 60 * p]], a: 0.06, d: 0.36, v: 0.3 });
  } },
  hit: { send: 0.1, fn(v, p) {
    v.tone({ f: [[0, 150 * p], [0.15, 50 * p]], a: 0.002, d: 0.2, v: 0.7 });
    v.hiss({ type: 'lowpass', f: [[0, 3000], [0.08, 600]], a: 0.001, d: 0.09, v: 0.45 });
    v.tone({ type: 'square', f: 1250 * p, bp: 1250 * p, q: 6, a: 0.001, d: 0.18, v: 0.1 });
    v.tone({ type: 'triangle', f: 1870 * p, a: 0.001, d: 0.14, v: 0.06 });
    v.tone({ f: 2610 * p, a: 0.001, d: 0.1, v: 0.04 });
  } },
  crit: { send: 0.15, fn(v, p) {
    v.tone({ f: [[0, 190 * p], [0.12, 60 * p]], a: 0.002, d: 0.18, v: 0.6 });
    v.hiss({ type: 'highpass', f: 2500, a: 0.001, d: 0.06, v: 0.35 });
    v.tone({ type: 'triangle', f: 2200 * p, a: 0.001, d: 0.3, v: 0.12 });
    v.tone({ f: 3310 * p, a: 0.001, d: 0.22, v: 0.07 });
    v.tone({ f: [[0, 1800 * p], [0.1, 2700 * p]], t: 0.02, a: 0.003, d: 0.25, v: 0.08 });
  } },
  hitPlayer: { send: 0.08, fn(v, p) {
    v.tone({ f: [[0, 190 * p], [0.14, 95 * p]], a: 0.004, d: 0.18, v: 0.5 });
    v.hiss({ color: 'pink', type: 'lowpass', f: 700, a: 0.003, d: 0.12, v: 0.3 });
    v.tone({ type: 'triangle', f: [[0, 440 * p], [0.16, 300 * p]], a: 0.01, d: 0.2, v: 0.07, lp: 1500 });
  } },
  enemyDie: { send: 0.3, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 1500 * p], [0.3, 350 * p]], q: 0.8, a: 0.01, d: 0.35, v: 0.6 });
    v.sparkle(0.04, 7, 0.3, 0.1);
  } },
  freeze: { send: 0.35, fn(v, p) {
    v.hiss({ type: 'highpass', f: 3000, a: 0.001, d: 0.05, v: 0.3 });
    v.tone({ f: 2500 * p, a: 0.002, d: 0.6, v: 0.06 });
    v.tone({ f: 3150 * p, t: 0.03, a: 0.002, d: 0.55, v: 0.05 });
    v.tone({ f: 3700 * p, t: 0.06, a: 0.002, d: 0.5, v: 0.04 });
    v.tone({ f: [[0, 1500 * p], [0.25, 900 * p]], a: 0.005, d: 0.3, v: 0.05 });
    for (let i = 0; i < 4; i++) v.hiss({ t: rnd(0, 0.2), f: rnd(3000, 7000), q: 3, a: 0.001, d: 0.015, v: 0.4 });
  } },
  burn: { send: 0.1, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 500 * p], [0.12, 1600 * p], [0.28, 700 * p]], q: 0.9, a: 0.02, d: 0.3, v: 0.6 });
    for (let i = 0; i < 3; i++) v.hiss({ type: 'highpass', t: rnd(0.02, 0.2), f: 4000, a: 0.001, d: 0.02, v: 0.25 });
  } },

  // ── pickups & progress ──
  coin: { send: 0.2, fn(v, p) {
    v.tone({ f: 987.77 * p, a: 0.002, d: 0.12, v: 0.25 });
    v.tone({ f: 1318.51 * p, t: 0.07, a: 0.002, d: 0.45, v: 0.28 });
    v.tone({ type: 'triangle', f: 2637 * p, t: 0.07, a: 0.002, d: 0.2, v: 0.04 });
  } },
  loot: { send: 0.25, fn(v, p) {
    [1046.5, 1318.51, 1567.98].forEach((f, i) => v.chime(f * p, i * 0.06, 0.35, 0.18));
  } },
  levelUp: { send: 0.3, fn(v, p) {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
      const d = i === 4 ? 0.75 : 0.25;
      v.tone({ type: 'square', f: f * p, t: i * 0.09, a: 0.005, d, v: 0.07, lp: 2400 });
      v.tone({ f: f * p, t: i * 0.09, a: 0.005, d, v: 0.12 });
    });
    v.tone({ f: 1567.98 * p, t: 0.5, a: 0.01, d: 0.8, v: 0.05 });
    v.tone({ f: 2093 * p, t: 0.5, a: 0.01, d: 0.8, v: 0.04 });
    v.sparkle(0.45, 5, 0.4, 0.04, 2000, 4300);
  } },
  potion: { send: 0.3, fn(v, p) {
    for (let i = 0; i < 3; i++) {
      v.tone({ f: [[0, 180 * p], [0.08, 420 * p]], t: i * 0.15, a: 0.01, d: 0.1, v: 0.3, lp: 1200 });
      v.hiss({ color: 'brown', type: 'lowpass', f: 500, t: i * 0.15, a: 0.005, d: 0.08, v: 0.3 });
    }
    v.sparkle(0.45, 6, 0.35, 0.07);
  } },

  // ── movement ──
  footstep: { send: 0.03, low: true, fn(v, p, o) {
    const j = p * rnd(0.9, 1.1);
    if (o.surface === 'snow' || o.surface === 'water') v.out.gain.value *= 1.3;
    switch (o.surface) {
      case 'stone':
        v.hiss({ f: 2300 * j, q: 2.5, a: 0.001, d: 0.04, v: 0.9 });
        v.tone({ f: [[0, 160 * j], [0.05, 80 * j]], a: 0.002, d: 0.07, v: 0.25 });
        break;
      case 'snow':
        for (let i = 0; i < 3; i++) v.hiss({ t: i * 0.018 + rnd(0, 0.008), f: rnd(900, 1700) * j, q: 1.2, a: 0.002, d: 0.035, v: 0.7 });
        v.hiss({ color: 'pink', type: 'lowpass', f: 600 * j, a: 0.005, d: 0.09, v: 0.5 });
        break;
      case 'sand':
        v.hiss({ color: 'pink', type: 'lowpass', f: 2000 * j, a: 0.012, d: 0.11, v: 0.6 });
        v.hiss({ type: 'highpass', f: 5000, a: 0.01, d: 0.06, v: 0.06 });
        break;
      case 'water':
        v.hiss({ f: [[0, 900 * j], [0.12, 2600 * j]], q: 1, a: 0.006, d: 0.14, v: 0.8 });
        v.tone({ t: 0.02, f: [[0, 420 * j], [0.05, 950 * j]], a: 0.004, d: 0.06, v: 0.07 });
        break;
      default: // grass
        v.hiss({ f: 3200 * j, q: 0.9, a: 0.004, d: 0.07, v: 0.45 });
        v.hiss({ color: 'pink', type: 'lowpass', f: 900 * j, a: 0.004, d: 0.06, v: 0.5 });
        v.tone({ f: [[0, 110 * j], [0.05, 60 * j]], a: 0.002, d: 0.06, v: 0.15 });
    }
  } },
  jump: { send: 0.05, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 400 * p], [0.12, 1300 * p]], a: 0.02, d: 0.14, v: 0.4 });
    v.tone({ f: [[0, 260 * p], [0.1, 420 * p]], a: 0.01, d: 0.12, v: 0.07 });
  } },
  land: { send: 0.05, fn(v, p) {
    v.tone({ f: [[0, 120 * p], [0.1, 50 * p]], a: 0.002, d: 0.14, v: 0.5 });
    v.hiss({ color: 'brown', type: 'lowpass', f: 900, a: 0.002, d: 0.1, v: 0.5 });
  } },
  splash: { send: 0.2, fn(v, p) {
    v.hiss({ f: [[0, 2600 * p], [0.45, 700 * p]], q: 0.7, a: 0.005, d: 0.55, v: 0.5 });
    v.hiss({ color: 'brown', type: 'lowpass', f: 400, a: 0.004, d: 0.3, v: 0.5 });
    for (let i = 0; i < 4; i++) {
      const f = rnd(500, 900) * p;
      v.tone({ t: 0.05 + rnd(0, 0.25), f: [[0, f], [0.05, f * 1.8]], a: 0.003, d: 0.06, v: 0.08 });
    }
  } },

  // ── powers ──
  power_life: { send: 0.35, fn(v, p) {
    v.tone({ type: 'sawtooth', f: [[0, 34], [0.3, 22], [0.55, 30]], bp: 900, q: 6, a: 0.03, d: 0.6, v: 0.35 });
    v.tone({ type: 'sawtooth', t: 0.15, f: [[0, 28], [0.4, 40]], bp: 600, q: 5, a: 0.03, d: 0.5, v: 0.25 });
    v.hiss({ color: 'pink', f: 3000, q: 0.8, a: 0.1, d: 0.5, v: 0.08 });
    [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => v.chime(f * p, 0.3 + i * 0.08, 0.9, 0.12));
  } },
  power_healing: { send: 0.45, fn(v, p) {
    for (const f of [261.63, 329.63, 392, 587.33, 659.25]) {
      for (const det of [-6, 6]) v.tone({ type: 'triangle', f: f * p, det, a: 0.25, hold: 0.5, d: 1.6, v: 0.06, lp: 2500 });
    }
    [1046.5, 1318.51, 1567.98, 2093, 2637.02, 3135.96].forEach((f, i) => v.tone({ f: f * p, t: 0.15 + i * 0.12, a: 0.01, d: 0.5, v: 0.04 }));
  } },
  power_fire: { send: 0.2, fn(v, p) {
    v.hiss({ color: 'brown', type: 'lowpass', f: [[0, 300 * p], [0.15, 2500 * p], [0.6, 500 * p]], a: 0.04, d: 0.65, v: 0.9 });
    v.hiss({ color: 'pink', f: [[0, 800 * p], [0.2, 2000 * p], [0.5, 900 * p]], q: 0.9, a: 0.03, d: 0.5, v: 0.4 });
    v.tone({ f: [[0, 90 * p], [0.5, 45 * p]], a: 0.02, d: 0.5, v: 0.25 });
    for (let i = 0; i < 5; i++) v.hiss({ type: 'highpass', t: rnd(0.05, 0.45), f: 4000, a: 0.001, d: 0.02, v: 0.15 });
  } },
  explosion: { send: 0.3, fn(v, p) {
    v.hiss({ type: 'highpass', f: 2500, a: 0.001, d: 0.06, v: 0.3 });
    v.hiss({ color: 'brown', type: 'lowpass', f: [[0, 1500 * p], [0.9, 150 * p]], q: 0.7, a: 0.004, d: 1.1, v: 1 });
    v.tone({ f: [[0, 95 * p], [0.5, 32 * p]], a: 0.004, d: 0.6, v: 0.55 });
    for (let i = 0; i < 4; i++) v.hiss({ t: rnd(0.1, 0.5), f: rnd(1000, 3000), q: 2, a: 0.002, d: 0.05, v: 0.08 });
  } },
  power_ice: { send: 0.4, fn(v, p) {
    v.hiss({ type: 'highpass', f: [[0, 3500], [0.5, 8000]], a: 0.02, d: 0.55, v: 0.12 });
    for (let i = 0; i < 10; i++) v.tone({ f: rnd(2000, 5500) * p, t: i * 0.04 + rnd(0, 0.02), a: 0.002, d: 0.12, v: 0.06 });
    v.tone({ f: 1760 * p, det: 4, a: 0.005, d: 1.0, v: 0.08 });
    v.tone({ f: 2637 * p, det: -4, t: 0.05, a: 0.005, d: 0.9, v: 0.05 });
    for (let i = 0; i < 6; i++) v.hiss({ t: rnd(0, 0.4), f: rnd(2000, 6000), q: 3, a: 0.001, d: 0.015, v: 0.35 });
  } },
  power_earth: { send: 0.25, fn(v, p) {
    v.hiss({ color: 'brown', type: 'lowpass', f: 180 * p, a: 0.05, d: 1.1, v: 1.4 });
    v.tone({ f: [[0, 58 * p], [0.9, 38 * p]], a: 0.05, d: 1.0, v: 0.45 });
    v.tone({ type: 'triangle', f: [[0, 45 * p], [0.8, 35 * p]], lp: 200, a: 0.05, d: 0.9, v: 0.2 });
    for (let i = 0; i < 6; i++) v.hiss({ t: rnd(0.03, 0.45), f: rnd(500, 1500), q: 2, a: 0.002, d: rnd(0.04, 0.09), v: 0.35 });
  } },
  power_lightning: { send: 0.25, fn(v, p) {
    v.hiss({ type: 'highpass', f: 3000, a: 0.001, d: 0.04, v: 0.5 });
    const o = v.osc('sawtooth', 300 * p);
    for (let i = 0; i < 26; i++) o.frequency.setValueAtTime(rnd(70, 1500) * p, v.t0 + i * 0.014);
    const hp = v.filt('highpass', 300), g = v.g(0);
    o.connect(hp); hp.connect(g); g.connect(v.out);
    v.env(g.gain, 0, 0.002, 0.4, 0.16, 0.1);
    v.run(o, 0, 0.4);
    v.tone({ type: 'square', f: [[0, 120 * p], [0.3, 90 * p]], lp: 2000, a: 0.002, d: 0.3, v: 0.06 });
    for (let i = 0; i < 8; i++) v.hiss({ t: rnd(0, 0.35), f: rnd(3000, 7000), q: 1.5, a: 0.001, d: 0.02, v: 0.3 });
  } },
  power_light: { send: 0.55, fn(v, p) {
    v.choir([440, 554.37, 659.25, 880].map((f) => f * p), 0, 0.35, 0.4, 1.5, 0.5);
    v.tone({ f: 1760 * p, a: 0.3, d: 1.4, v: 0.04 });
    v.tone({ f: 2637 * p, det: 8, a: 0.4, d: 1.3, v: 0.03 });
    v.hiss({ f: [[0, 2000], [0.4, 6000]], a: 0.3, d: 0.9, v: 0.06 });
  } },
  power_darkness: { send: 0.35, fn(v, p) {
    let dest = v.out;
    if (v.c.createStereoPanner) {           // swirl left ↔ right
      const pn = v._add(v.c.createStereoPanner());
      pn.connect(v.out);
      const lfo = v.osc('sine', 1.3), lg = v.g(0.85);
      lfo.connect(lg); lg.connect(pn.pan); v.run(lfo, 0, 1.1);
      dest = pn;
    }
    const h = v.hiss({ color: 'brown', f: 450 * p, q: 2, a: 0.25, d: 1.1, v: 1.2, to: dest });
    const lfo2 = v.osc('sine', 3.2), l2 = v.g(260 * p);
    lfo2.connect(l2); l2.connect(h.fl.frequency); v.run(lfo2, 0, 1.1);
    v.tone({ f: [[0, 80 * p], [0.9, 45 * p]], a: 0.1, d: 1.0, v: 0.3 });
    v.tone({ type: 'sawtooth', f: [[0, 55 * p], [0.9, 40 * p]], lp: 300, a: 0.1, d: 0.9, v: 0.1 });
  } },
  power_death: { send: 0.5, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 2200 * p], [1.0, 300 * p]], q: 1.5, a: 0.25, d: 1.2, v: 0.5 });
    v.bell(220 * p, 0.1, 2.5, 0.2);
    v.tone({ f: 660 * p, a: 0.4, d: 1.6, v: 0.035 });
    v.tone({ f: 667 * p, a: 0.4, d: 1.6, v: 0.035 });
  } },
  noMana: { send: 0.05, fn(v, p) {
    v.tone({ f: [[0, 240 * p], [0.12, 180 * p]], a: 0.005, d: 0.14, v: 0.2 });
    v.tone({ type: 'triangle', f: 120 * p, lp: 500, a: 0.005, d: 0.12, v: 0.1 });
  } },
  cooldown: { send: 0, low: true, fn(v, p) {
    v.tone({ f: 2200 * p, a: 0.001, d: 0.035, v: 0.08 });
  } },

  // ── world & bosses ──
  portal: { send: 0.5, fn(v, p) {
    v.hiss({ f: [[0, 300 * p], [0.7, 4500 * p], [1.4, 800 * p]], q: 1.2, a: 0.3, d: 1.5, v: 0.35 });
    const o = v.tone({ f: [[0, 220 * p], [1.0, 1760 * p]], a: 0.2, d: 1.2, v: 0.07 });
    const lfo = v.osc('sine', 7), lg = v.g(30);
    lfo.connect(lg); lg.connect(o.detune); v.run(lfo, 0, 1.2);
    v.tone({ type: 'triangle', f: [[0, 330 * p], [1.0, 2640 * p]], a: 0.3, d: 1.1, v: 0.03 });
    v.sparkle(0.3, 10, 1.0, 0.05);
  } },
  unlock: { send: 0.5, fn(v, p) {
    [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26].forEach((s, i) => v.chime(st(523.25, s) * p, i * 0.06, 0.5, 0.08));
    v.hiss({ f: [[0, 500], [0.8, 6000]], q: 1.5, a: 0.5, d: 0.9, v: 0.15 });
    for (const f of [1046.5, 1318.51, 1567.98, 2093]) v.tone({ f: f * p, t: 0.8, a: 0.02, d: 1.4, v: 0.06 });
  } },
  bossRoar: { send: 0.3, fn(v, p) {
    const lp = v.filt('lowpass', 400, 2);
    v.curve(lp.frequency, 0, [[0, 350], [0.3, 1500 * p], [1.0, 900 * p], [1.6, 250]]);
    const am = v.g(0.6), lfo = v.osc('sine', 27), lg = v.g(0.4), g = v.g(0);
    lfo.connect(lg); lg.connect(am.gain);
    lp.connect(am); am.connect(g); g.connect(v.out);
    const fc = [[0, 62 * p], [0.35, 92 * p], [1.0, 80 * p], [1.6, 52 * p]];
    for (const [r, det] of [[1, 0], [1.5, 12], [2.01, -8]]) {
      const o = v.osc('sawtooth', fc.map(([t, f]) => [t, f * r]), 0);
      o.detune.value = det; o.connect(lp); v.run(o, 0, 1.7);
    }
    v.env(g.gain, 0, 0.15, 1.7, 0.6, 0.6);
    v.run(lfo, 0, 1.7);
    v.hiss({ color: 'brown', type: 'lowpass', f: [[0, 400], [0.3, 1200], [1.6, 300]], a: 0.12, hold: 0.4, d: 1.6, v: 1 });
    v.tone({ f: [[0, 48 * p], [1.4, 38 * p]], a: 0.1, hold: 0.5, d: 1.5, v: 0.35 });
  } },
  bossSlam: { send: 0.35, fn(v, p) {
    v.tone({ f: [[0, 75 * p], [0.6, 28 * p]], a: 0.003, d: 0.8, v: 0.8 });
    v.hiss({ color: 'brown', type: 'lowpass', f: [[0, 900], [0.6, 120]], a: 0.002, d: 0.8, v: 1 });
    v.hiss({ f: 1200, q: 1, a: 0.001, d: 0.1, v: 0.4 });
    for (let i = 0; i < 6; i++) v.hiss({ t: rnd(0.08, 0.6), f: rnd(600, 2500), q: 2, a: 0.002, d: 0.06, v: 0.12 });
  } },
  bossCharge: { send: 0.2, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 250 * p], [0.9, 1600 * p]], q: 0.8, a: 0.5, hold: 0.1, d: 1.1, v: 0.6 });
    v.tone({ type: 'sawtooth', f: [[0, 45 * p], [0.9, 80 * p]], lp: 300, a: 0.3, d: 1.0, v: 0.2 });
    for (let i = 0; i < 4; i++) v.tone({ t: 0.15 + i * 0.2, f: [[0, 90], [0.1, 40]], a: 0.002, d: 0.12, v: 0.35 });
  } },
  beam: { send: 0.35, fn(v, p) {
    const o = v.tone({ f: [[0, 180 * p], [0.7, 1200 * p]], a: 0.1, d: 0.75, v: 0.12 });
    const lfo = v.osc('sine', 14), lg = v.g(40);
    lfo.connect(lg); lg.connect(o.detune); v.run(lfo, 0, 0.75);
    v.hiss({ f: [[0, 500], [0.7, 5000]], q: 2, a: 0.6, d: 0.75, v: 0.15 });
    const lp = v.filt('lowpass', 1800, 3), g = v.g(0);
    lp.connect(g); g.connect(v.out);
    for (const f of [110, 165, 220, 330]) { const s = v.osc('sawtooth', f * p, 0.72); s.connect(lp); v.run(s, 0.72, 1.2); }
    v.env(g.gain, 0.72, 0.02, 1.2, 0.12, 0.7);
    v.hiss({ t: 0.72, f: 3000, q: 0.7, a: 0.01, hold: 0.6, d: 1.1, v: 0.15 });
    v.tone({ t: 0.72, f: [[0, 120], [0.3, 50]], a: 0.003, d: 0.35, v: 0.35 });
  } },
  growl: { send: 0.25, fn(v, p) {
    const o = v.osc('sawtooth', [[0, 95 * p], [0.3, 105 * p], [0.9, 80 * p]], 0);
    const lp = v.filt('lowpass', 600, 3), am = v.g(0.6), lfo = v.osc('sine', 20), lg = v.g(0.4), g = v.g(0);
    lfo.connect(lg); lg.connect(am.gain);
    o.connect(lp); lp.connect(am); am.connect(g); g.connect(v.out);
    v.env(g.gain, 0, 0.12, 0.95, 0.4, 0.3);
    v.run(o, 0, 0.95); v.run(lfo, 0, 0.95);
    v.hiss({ color: 'brown', type: 'lowpass', f: 500, a: 0.1, d: 0.8, v: 0.4 });
  } },
  thunder: { send: 0.4, fn(v) {
    v.hiss({ color: 'pink', type: 'lowpass', f: 1500, a: 0.05, d: 0.4, v: 0.3 });
    v.hiss({ color: 'brown', type: 'lowpass', f: [[0, 600], [3.5, 120]], q: 0.5, a: 0.25, d: 3.8, v: 1 });
    for (let i = 0; i < 4; i++) v.hiss({ color: 'brown', type: 'lowpass', t: rnd(0.1, 1.8), f: rnd(200, 450), a: rnd(0.08, 0.3), d: rnd(0.8, 1.6), v: rnd(0.5, 0.9) });
  } },
  dusk: { send: 0.5, fn(v, p) {
    v.bell(440 * p, 0, 2.6, 0.2);
    v.bell(440 * p, 0.9, 2.6, 0.16);
  } },
  sleep: { send: 0.55, fn(v, p) {
    [659.25, 783.99, 1046.5, 987.77, 783.99, 659.25, 783.99, 523.25].forEach((f, i) => v.chime(f * p, i * 0.28, i === 7 ? 1.8 : 1.1, 0.1));
  } },
  temple: { send: 0.65, fn(v, p) {
    v.choir([261.63, 329.63, 392, 523.25].map((f) => f * p), 0, 1.0, 0.9, 3.2, 0.45);
    v.bell(523.25 * p, 0.2, 2.2, 0.12, 4);
    v.bell(783.99 * p, 0.7, 2.0, 0.1, 4);
    v.bell(1046.5 * p, 1.2, 1.8, 0.09, 3);
    v.bell(1318.51 * p, 1.7, 1.6, 0.08, 3);
    v.hiss({ type: 'highpass', f: 6000, a: 1.0, d: 2.8, v: 0.03 });
  } },
  place: { send: 0.06, fn(v, p) {
    v.tone({ f: [[0, 180 * p], [0.07, 90 * p]], a: 0.002, d: 0.09, v: 0.45 });
    v.hiss({ f: 700 * p, q: 2.5, a: 0.001, d: 0.05, v: 0.5 });
  } },
  break: { send: 0.1, fn(v, p) {
    v.tone({ f: [[0, 120 * p], [0.1, 60 * p]], a: 0.002, d: 0.12, v: 0.35 });
    for (let i = 0; i < 5; i++) v.hiss({ t: i * 0.03 + rnd(0, 0.02), f: rnd(800, 2500) * p, q: 1.5, a: 0.001, d: 0.06, v: 0.45 });
  } },

  // ── fanfares ──
  victory: { send: 0.35, fn(v, p) {
    const N = [[392, 0, 0.16], [523.25, 0.15, 0.16], [659.25, 0.3, 0.16], [783.99, 0.45, 0.4], [659.25, 0.85, 0.16], [783.99, 1.0, 0.16], [1046.5, 1.15, 1.7]];
    for (const [f, t, d] of N) v.brass(f * p, t, d, 0.2);
    for (const f of [392, 523.25, 659.25]) v.brass(f * p, 1.15, 1.7, 0.08);
    v.tone({ f: [[0, 100], [0.4, 90]], a: 0.004, d: 0.5, v: 0.3 });
    v.tone({ t: 1.15, f: [[0, 100], [0.5, 88]], a: 0.004, d: 0.9, v: 0.45 });
    v.hiss({ t: 1.15, color: 'brown', type: 'lowpass', f: 300, a: 0.002, d: 0.3, v: 0.5 });
    v.sparkle(1.25, 8, 1.2, 0.05);
  } },
  bossDefeated: { send: 0.4, fn(v, p) {
    v.tone({ f: [[0, 80], [0.8, 35]], a: 0.003, d: 0.9, v: 0.6 });
    v.hiss({ color: 'brown', type: 'lowpass', f: [[0, 800], [0.8, 120]], a: 0.003, d: 0.9, v: 0.7 });
    for (let i = 0; i < 6; i++) v.tone({ t: 0.05 + i * 0.045, f: [[0, 110], [0.15, 95]], a: 0.003, d: 0.2, v: 0.12 + i * 0.03 });
    const N = [[293.66, 0.3, 0.2], [440, 0.5, 0.2], [587.33, 0.7, 0.2], [739.99, 0.9, 0.45], [587.33, 1.4, 0.2], [739.99, 1.6, 0.2], [880, 1.8, 1.5]];
    for (const [f, t, d] of N) v.brass(f * p, t, d, 0.2);
    for (const f of [440, 587.33, 739.99]) v.brass(f * p, 1.8, 1.5, 0.08);
    v.tone({ t: 1.8, f: [[0, 98], [0.5, 87]], a: 0.004, d: 0.9, v: 0.45 });
    v.bell(1174.66 * p, 1.8, 1.6, 0.06, 3);
    v.sparkle(1.9, 8, 1.2, 0.05);
  } },
  playerDeath: { send: 0.4, fn(v, p) {
    [[659.25, 0], [587.33, 0.38], [523.25, 0.76], [440, 1.14]].forEach(([f, t], i) => {
      const last = i === 3;
      v.tone({ type: 'triangle', f: f * p, t, a: 0.02, d: last ? 1.6 : 0.6, v: 0.18, lp: 1800 });
      v.tone({ f: f * p * 2, t, a: 0.01, d: last ? 0.8 : 0.3, v: 0.03 });
    });
    for (const f of [220, 261.63, 329.63]) v.tone({ type: 'triangle', f: f * p, t: 1.14, a: 0.35, d: 1.9, v: 0.05, lp: 1200 });
  } },

  // ── UI ──
  click: { send: 0.02, low: true, fn(v, p) {
    v.tone({ f: [[0, 1400 * p], [0.03, 1000 * p]], a: 0.001, d: 0.045, v: 0.18 });
    v.hiss({ type: 'highpass', f: 4000, a: 0.001, d: 0.01, v: 0.05 });
  } },
  hover: { send: 0, low: true, fn(v, p) {
    v.tone({ f: 1900 * p, a: 0.003, d: 0.035, v: 0.04 });
  } },
  buy: { send: 0.2, fn(v, p) {
    v.tone({ f: 1318.51 * p, a: 0.002, d: 0.1, v: 0.2 });
    v.tone({ f: 1760 * p, t: 0.08, a: 0.002, d: 0.5, v: 0.22 });
    v.tone({ f: 2637 * p, t: 0.08, a: 0.002, d: 0.25, v: 0.04 });
    v.hiss({ t: 0.08, f: 7000, q: 2, a: 0.002, d: 0.2, v: 0.15 });
    v.sparkle(0.15, 3, 0.2, 0.04, 2500, 4300);
  } },
  sell: { send: 0.2, fn(v, p) {
    v.tone({ f: 1567.98 * p, a: 0.002, d: 0.12, v: 0.2 });
    v.tone({ f: 1174.66 * p, t: 0.09, a: 0.002, d: 0.4, v: 0.2 });
    v.hiss({ t: 0.05, f: 6000, q: 2, a: 0.002, d: 0.25, v: 0.15 });
    for (let i = 0; i < 3; i++) v.tone({ type: 'triangle', f: rnd(3000, 4500), t: 0.1 + i * 0.06, a: 0.001, d: 0.06, v: 0.04 });
  } },
  deny: { send: 0.05, fn(v, p) {
    v.tone({ type: 'square', f: 220 * p, lp: 900, a: 0.004, d: 0.12, v: 0.1 });
    v.tone({ type: 'square', f: 196 * p, lp: 900, t: 0.13, a: 0.004, d: 0.18, v: 0.1 });
  } },
  toast: { send: 0.25, fn(v, p) {
    v.chime(783.99 * p, 0, 0.5, 0.14);
    v.chime(1174.66 * p, 0.09, 0.6, 0.12);
  } },
  // ── power attacks (added for the 4-attacks-per-power system) ──
  charge: { send: 0.35, fn(v, p) {          // rising charge-up, ~0.7 s
    v.tone({ f: [[0, 180 * p], [0.7, 720 * p]], a: 0.25, d: 0.75, v: 0.12, hold: 0.4 });
    v.tone({ type: 'triangle', f: [[0, 360 * p], [0.7, 1440 * p]], a: 0.3, d: 0.75, v: 0.05, hold: 0.4 });
    v.hiss({ color: 'pink', f: [[0, 400], [0.7, 3200]], q: 2, a: 0.3, d: 0.75, v: 0.12, hold: 0.35 });
  } },
  chargeReady: { send: 0.45, fn(v, p) {
    v.chime(1318.5 * p, 0, 0.5, 0.14);
    v.sparkle(0.02, 5, 0.18, 0.04, 2000, 4300);
  } },
  shoot: { send: 0.2, fn(v, p) {            // small magic shot
    v.tone({ f: [[0, 900 * p], [0.12, 300 * p]], a: 0.003, d: 0.14, v: 0.18 });
    v.hiss({ type: 'highpass', f: 2500, a: 0.003, d: 0.1, v: 0.12 });
  } },
  zap: { send: 0.2, fn(v, p) {
    v.tone({ type: 'sawtooth', f: [[0, 1800 * p], [0.08, 500 * p]], lp: 4000, a: 0.002, d: 0.12, v: 0.12 });
    v.hiss({ type: 'highpass', f: 3500, a: 0.001, d: 0.14, v: 0.25 });
    v.tone({ type: 'square', f: 95 * p, lp: 900, a: 0.002, d: 0.1, v: 0.08 });
  } },
  whip: { send: 0.15, fn(v, p) {
    v.hiss({ color: 'pink', f: [[0, 600 * p], [0.12, 4200 * p]], q: 2.5, a: 0.04, d: 0.16, v: 0.7 });
    v.hiss({ type: 'highpass', f: 3000, t: 0.12, a: 0.001, d: 0.05, v: 0.5 });
  } },
  shield: { send: 0.6, fn(v, p) {
    v.choir([392 * p, 493.88 * p, 587.33 * p], 0, 0.2, 0.6, 1.8, 0.07);
    v.sparkle(0.05, 10, 0.9, 0.04, 1800, 4300);
    v.bell(784 * p, 0.1, 1.6, 0.08);
  } },
  meteor: { send: 0.3, fn(v, p) {            // falling whistle
    v.tone({ f: [[0, 1400 * p], [1.1, 180 * p]], a: 0.05, d: 1.2, v: 0.08, hold: 0.9 });
    v.hiss({ color: 'pink', f: [[0, 3000], [1.1, 400]], q: 1.5, a: 0.3, d: 1.2, v: 0.3, hold: 0.8 });
  } },
  quake: { send: 0.3, fn(v, p) {
    v.hiss({ color: 'brown', type: 'lowpass', f: 220 * p, a: 0.05, d: 1.6, v: 1.2, hold: 0.8 });
    v.tone({ f: [[0, 55 * p], [1.5, 35 * p]], a: 0.05, d: 1.6, v: 0.5, hold: 0.8 });
    v.hiss({ color: 'pink', type: 'lowpass', f: 900, t: 0.1, a: 0.02, d: 0.5, v: 0.4 });
  } },
  blink: { send: 0.4, fn(v, p) {
    v.tone({ f: [[0, 300 * p], [0.15, 1500 * p]], a: 0.005, d: 0.18, v: 0.12 });
    v.hiss({ color: 'pink', f: [[0, 3000], [0.2, 600]], q: 1.4, a: 0.01, d: 0.22, v: 0.3 });
  } },
  flash: { send: 0.5, fn(v, p) {
    v.hiss({ type: 'highpass', f: 2200, a: 0.002, d: 0.35, v: 0.35 });
    v.chime(1567.98 * p, 0, 0.6, 0.12);
    v.chime(2093 * p, 0.03, 0.6, 0.08);
  } },
  superBoom: { send: 0.45, fn(v, p) {        // generic big super impact
    v.tone({ f: [[0, 120 * p], [0.6, 38 * p]], a: 0.004, d: 0.8, v: 0.8 });
    v.hiss({ color: 'brown', type: 'lowpass', f: [[0, 1800], [0.6, 200]], a: 0.004, d: 0.9, v: 0.9 });
    v.sparkle(0.1, 8, 0.5, 0.05, 1500, 4300);
  } },
};

// Level trims, measured offline with test-audio.html ("Measure levels") so peaks land roughly at:
// hits/powers ≈ -5..-8 dBFS, big impacts ≈ -3, pickups ≈ -10, UI ≈ -15..-28, footsteps ≈ -17.
const TRIM = {
  swing: 2.2, swing2: 2.2, swing3: 0.85, hit: 0.7, crit: 0.9, hitPlayer: 0.8, enemyDie: 2.5, freeze: 1.6, burn: 1.35,
  coin: 1.25, loot: 1.3, levelUp: 2.0, potion: 1.2, footstep: 0.45, jump: 2.0, land: 0.6, splash: 0.9,
  power_life: 2.1, power_healing: 1.3, power_fire: 0.9, explosion: 0.9, power_ice: 2.3, power_earth: 0.75,
  power_lightning: 0.9, power_light: 0.34, power_darkness: 1.4, power_death: 1.4, noMana: 0.8,
  portal: 2.8, unlock: 2.1, bossRoar: 0.45, bossSlam: 0.75, bossCharge: 1.5, beam: 1.1, growl: 0.7, thunder: 0.9,
  dusk: 1.1, sleep: 2.2, temple: 0.32, victory: 0.8, bossDefeated: 0.95, playerDeath: 1.8, place: 0.8, break: 1.1,
  click: 0.7, buy: 1.25, sell: 1.7, deny: 1.8, toast: 1.6,
};
for (const k in TRIM) if (SOUNDS[k]) SOUNDS[k].vol = TRIM[k];

/* ───────────────────────── continuous loops ───────────────────────── */
// build(v, R): v = persistent Voice whose out gain is the loop level; R = refs for tick().
// tick(A, L, dt, now): random events (crackles, bubbles, gusts) while the loop is audible.
const LOOPS = {
  portalHum: { base: 0.16, send: 0.3, build(v) {
    const lp = v.filt('lowpass', 500, 3), mix = v.g(1);
    const lfo = v.osc('sine', 0.35), lg = v.g(220);
    lfo.connect(lg); lg.connect(lp.frequency); v.run(lfo, 0, Infinity);
    lp.connect(mix); mix.connect(v.out);
    for (const [type, f, amp] of [['sawtooth', 55, 0.12], ['sine', 110, 0.35], ['sine', 110.7, 0.3], ['sine', 165, 0.15]]) {
      const o = v.osc(type, f), g = v.g(amp);
      o.connect(g); g.connect(type === 'sawtooth' ? lp : mix); v.run(o, 0, Infinity);
    }
    for (const [f, rate] of [[880, 5.5], [1324, 4.1]]) {   // shimmer with tremolo
      const sh = v.osc('sine', f), tg = v.g(0.03), tl = v.osc('sine', rate), tlg = v.g(0.025);
      tl.connect(tlg); tlg.connect(tg.gain); sh.connect(tg); tg.connect(v.out);
      v.run(sh, 0, Infinity); v.run(tl, 0, Infinity);
    }
  } },
  wind: { base: 0.78, send: 0.15, build(v, R) {
    const n = v.noiseSrc('pink'), bp = v.filt('bandpass', 500, 0.9), gg = v.g(0.8);
    n.connect(bp); bp.connect(gg); gg.connect(v.out); v.run(n, 0, Infinity, true);
    const n2 = v.noiseSrc('white'), wh = v.filt('bandpass', 1200, 12), wg = v.g(0.5);
    n2.connect(wh); wh.connect(wg); wg.connect(v.out); v.run(n2, 0, Infinity, true);
    Object.assign(R, { bp, gg, wh, wg });
  }, tick(A, L, dt, now) {
    L.timer -= dt;
    if (L.timer > 0) return;
    L.timer = rnd(1.2, 3.5);
    const R = L.ref, tc = rnd(0.5, 1.2);
    const go = (param, val) => { param.cancelScheduledValues(now); param.setTargetAtTime(val, now, tc); };
    go(R.bp.frequency, rnd(280, 900));
    go(R.gg.gain, rnd(0.45, 1.1));
    go(R.wh.frequency, rnd(700, 1700));
    go(R.wg.gain, rnd(0, 1.2));
  } },
  lava: { base: 0.27, send: 0.15, build(v) {
    const n = v.noiseSrc('brown'), lp = v.filt('lowpass', 160, 0.8), g = v.g(1.2);
    n.connect(lp); lp.connect(g); g.connect(v.out); v.run(n, 0, Infinity, true);
    const n2 = v.noiseSrc('pink'), bp = v.filt('bandpass', 400, 1.5), g2 = v.g(0.15);
    n2.connect(bp); bp.connect(g2); g2.connect(v.out); v.run(n2, 0, Infinity, true);
  }, tick(A, L, dt) {
    if (Math.random() > dt * 2.6) return;
    const e = A._loopEvent(L);
    if (!e) return;
    const f = rnd(70, 160);
    e.tone({ f: [[0, f], [0.09, f * 2.4]], a: 0.01, d: 0.13, v: 0.5, lp: 700 });
    e.hiss({ color: 'brown', type: 'lowpass', f: 400, a: 0.005, d: 0.12, v: 0.6 });
  } },
  fire: { base: 0.33, send: 0.12, build(v) {
    const n = v.noiseSrc('pink'), bp = v.filt('bandpass', 900, 0.6), g = v.g(0.6);
    n.connect(bp); bp.connect(g); g.connect(v.out); v.run(n, 0, Infinity, true);
    const n2 = v.noiseSrc('brown'), lp = v.filt('lowpass', 350, 0.7), body = v.g(0.9);
    n2.connect(lp); lp.connect(body); body.connect(v.out); v.run(n2, 0, Infinity, true);
    for (const [rate, depth] of [[3.3, 0.25], [5.1, 0.15]]) {   // flicker
      const lfo = v.osc('sine', rate), lg = v.g(depth);
      lfo.connect(lg); lg.connect(body.gain); v.run(lfo, 0, Infinity);
    }
  }, tick(A, L, dt) {
    if (Math.random() > dt * 9) return;
    const e = A._loopEvent(L);
    if (e) e.hiss({ f: rnd(1800, 6000), q: 2, a: 0.001, d: rnd(0.012, 0.035), v: rnd(0.3, 0.7) });
  } },
};

/* ───────────────────────── generative music ───────────────────────── */
// chords: semitones from root. scale: pentatonic degrees for the plucked melody.
const MOODS = {
  menu: { level: 1.3, root: 130.81, step: 0.75, chordSteps: 12, padWave: 'sawtooth', cutoff: 950, padVol: 0.022, padA: 3, padR: 4,
    chords: [[0, 7, 14, 16], [5, 9, 12, 16], [-3, 7, 12, 16], [-5, 7, 11, 14]],
    scale: [0, 2, 4, 7, 9], melOct: 1, pluckP: 0.42, pluckVol: 0.06, bass: 0.07 },
  day: { level: 1.3, root: 146.83, step: 0.5, chordSteps: 16, padWave: 'sawtooth', cutoff: 1300, padVol: 0.02, padA: 2.5, padR: 3.5,
    chords: [[0, 7, 14, 16], [-3, 4, 7, 12], [5, 9, 12, 16], [-5, 7, 11, 14]],
    scale: [0, 2, 4, 7, 9], melOct: 1, pluckP: 0.36, pluckVol: 0.065, bass: 0.07 },
  night: { level: 0.8, root: 110, step: 0.8, chordSteps: 12, padWave: 'triangle', cutoff: 650, padVol: 0.04, padA: 4, padR: 5,
    chords: [[0, 7, 12, 15], [-4, 3, 7, 12], [5, 8, 12, 15], [-5, 7, 10, 14]],
    scale: [0, 3, 5, 7, 10], melOct: 1, pluckP: 0.22, pluckVol: 0.05, bass: 0.06, bellP: 0.04 },
  boss: { level: 1.65, root: 82.41, step: 0.25, chordSteps: 16, padWave: 'sawtooth', cutoff: 800, padVol: 0.02, padA: 0.8, padR: 1.5,
    chords: [[0, 7, 12, 15], [-4, 3, 8, 12], [-2, 5, 10, 14], [-5, 7, 11, 14]],
    scale: [0, 3, 5, 7, 10], boss: true,
    kick: [1, 0, 0, 0, 1, 0, 0, 1], tom: [0, 0, 1, 0, 0, 0, 1, 0] },
};

/* ───────────────────────── engine ───────────────────────── */
export class GameAudio {
  constructor() {
    this.ctx = null;                 // created in unlock()
    this._volume = 0.8;
    this._musicOn = true;
    this._mood = 'none';
    this._voices = [];               // live one-shots (capped)
    this._dying = [];                // stolen voices fading out
    this._musicVoices = [];
    this._loopVoices = [];
    this._loops = Object.create(null);
    this._loopWant = Object.create(null);
    this._last = Object.create(null);
    this._cur = null;                // current music mood instance
    this._oldMoods = [];             // fading-out mood instances
    this._made = 0;                  // node bookkeeping (see _stats)
    this._freed = 0;
    this._offline = false;           // test harness only
  }

  unlock() {
    try {
      if (this.ctx && this.ctx.state === 'closed') this._reset();
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
        try { this._build(); } catch (e) {
          try { this.ctx.close(); } catch (e2) { /* ignore */ }
          this.ctx = null;
          return;
        }
      }
      const s = this.ctx.state;
      if (s !== 'running' && s !== 'closed' && this.ctx.resume) {
        const pr = this.ctx.resume();
        if (pr && pr.catch) pr.catch(() => {});
      }
    } catch (e) { /* never throw */ }
  }

  _reset() {
    this.ctx = null;
    this._voices = []; this._dying = []; this._musicVoices = []; this._loopVoices = [];
    this._loops = Object.create(null);
    this._cur = null; this._oldMoods = [];
  }

  _build() {
    const c = this.ctx, now = c.currentTime;
    this.master = c.createGain();
    this.master.gain.value = this._volume;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -8; this.comp.knee.value = 8; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.mix = c.createGain();
    this.mix.connect(this.comp); this.comp.connect(this.master); this.master.connect(c.destination);

    this.sfx = c.createGain(); this.sfx.gain.value = SFX_LEVEL; this.sfx.connect(this.mix);
    const ml = this._musicOn ? MUSIC_LEVEL : 0;
    this.music = c.createGain(); this.music.gain.value = ml; this.music.connect(this.mix);

    this._makeNoise();
    this.verb = c.createConvolver();
    this.verb.buffer = this._makeImpulse(2.2);
    this.verbIn = c.createGain();
    this.verbOut = c.createGain(); this.verbOut.gain.value = REVERB_RETURN;
    this.verbIn.connect(this.verb); this.verb.connect(this.verbOut); this.verbOut.connect(this.mix);
    // music reverb goes through its own on/off gain so muting music also mutes its echo
    this.musicWet = c.createGain(); this.musicWet.gain.value = ml; this.musicWet.connect(this.verbIn);

    this.music.gain.setValueAtTime(ml, now);
    this.musicWet.gain.setValueAtTime(ml, now);
    this._applyMood();
    for (const n in this._loopWant) if (this._loopWant[n] > 0) this.setLoop(n, this._loopWant[n]);
  }

  _makeNoise() {
    const c = this.ctx, rate = c.sampleRate, len = Math.floor(rate * 2);
    const mk = () => c.createBuffer(1, len, rate);
    const white = mk(), pink = mk(), brown = mk();
    const w = white.getChannelData(0), pk = pink.getChannelData(0), br = brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      pk[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
      last = (last + 0.02 * x) / 1.02;
      br[i] = last * 3.5;
    }
    // remove drift so the looping seam has no click
    for (const d of [pk, br]) {
      const delta = d[len - 1] - d[0];
      for (let i = 0; i < len; i++) d[i] -= (delta * i) / (len - 1);
    }
    this.noise = { white, pink, brown };
  }

  _makeImpulse(sec) {
    const c = this.ctx, rate = c.sampleRate, len = Math.floor(rate * sec), pre = Math.floor(rate * 0.012);
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const x = (i - pre) / (len - pre);
        lp += (Math.random() * 2 - 1 - lp) * (0.65 - 0.5 * x);   // the tail gets darker
        d[i] = lp * Math.pow(1 - x, 2.6) * Math.min(1, (i - pre) / 300);
      }
    }
    return buf;
  }

  _ready() {
    const c = this.ctx;
    return !!c && (this._offline || c.state === 'running');
  }

  setVolume(v) {
    try {
      this._volume = clamp(num(v, this._volume), 0, 1);
      if (this.ctx) this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.03);
    } catch (e) { /* ignore */ }
  }

  setMusic(on) {
    try {
      this._musicOn = !!on;
      if (!this.ctx) return;
      const now = this.ctx.currentTime, lv = this._musicOn ? MUSIC_LEVEL : 0;
      for (const p of [this.music.gain, this.musicWet.gain]) { p.cancelScheduledValues(now); p.setTargetAtTime(lv, now, 0.6); }
      if (this._musicOn && this._cur) this._cur.next = now + 0.1;
    } catch (e) { /* ignore */ }
  }

  setMusicMood(mood) {
    try {
      this._mood = MOODS[mood] ? mood : 'none';
      if (this.ctx) this._applyMood();
    } catch (e) { /* ignore */ }
  }

  _applyMood() {
    const c = this.ctx, now = c.currentTime, want = this._mood;
    if (this._cur && this._cur.name === want) return;
    if (this._cur) {
      const I = this._cur;
      for (const p of [I.gain.gain, I.wet.gain]) { p.cancelScheduledValues(now); p.setTargetAtTime(0, now, 0.9); }
      I.dead = now + 5;
      this._oldMoods.push(I);
      this._cur = null;
    }
    if (want === 'none') return;
    const gain = c.createGain(), wet = c.createGain();
    const def = MOODS[want];
    for (const p of [gain.gain, wet.gain]) { p.value = 0; p.setValueAtTime(0, now); p.setTargetAtTime(def.level || 1, now, 1.2); }
    gain.connect(this.music);
    wet.connect(this.musicWet);
    this._cur = { name: want, def, gain, wet, next: now + 0.15, idx: 0, chord: def.chords[0], mel: def.scale.length, dead: 0 };
  }

  play(name, opts) {
    try {
      if (!this._ready()) return;
      const def = Object.prototype.hasOwnProperty.call(SOUNDS, name) ? SOUNDS[name] : null;
      if (!def) return;
      const o = opts && typeof opts === 'object' ? opts : {};
      const w = wall();
      if (w - (this._last[name] || -1e9) < THROTTLE_S) return;
      this._last[name] = w;
      this._reap(this.ctx.currentTime);
      const vol = clamp(num(o.volume, 1), 0, 2) * (def.vol || 1);
      if (vol <= 1e-4) return;
      if (this._voices.length >= MAX_VOICES) {
        if (def.low || this._dying.length >= MAX_VOICES) return;   // bursts: drop instead of piling up
        const old = this._voices.shift();
        old.kill();
        this._dying.push(old);
      }
      const v = new Voice(this, { vol, pan: clamp(num(o.pan, 0), -1, 1), send: def.send || 0 });
      try { def.fn(v, clamp(num(o.pitch, 1), 0.25, 4), o); } catch (e) { v.dispose(); return; }
      this._voices.push(v);
    } catch (e) { /* never throw */ }
  }

  setLoop(name, level) {
    try {
      const spec = Object.prototype.hasOwnProperty.call(LOOPS, name) ? LOOPS[name] : null;
      if (!spec) return;
      const lvl = clamp(num(level, 0), 0, 1);
      this._loopWant[name] = lvl;               // remembered, so a level set before unlock() starts afterwards
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      let L = this._loops[name];
      if (!L) {
        if (lvl <= 0.001) return;
        L = { name, spec, v: new Voice(this, { vol: 0, send: spec.send || 0.1 }), level: -1, zeroAt: null, timer: 0, ref: {} };
        L.v.end = Infinity;
        try { spec.build(L.v, L.ref, this); } catch (e) { L.v.dispose(); return; }
        this._loops[name] = L;
      }
      if (Math.abs(lvl - L.level) < 0.002) return;
      L.level = lvl;
      const gp = L.v.out.gain;
      gp.cancelScheduledValues(now);
      gp.setTargetAtTime(lvl * (spec.base || 0.5), now, 0.25);
      L.zeroAt = lvl <= 0.001 ? now : null;
    } catch (e) { /* ignore */ }
  }

  _loopEvent(L) {
    if (this._loopVoices.length >= MAX_LOOP_EVENTS) return null;
    const v = new Voice(this, { vol: 1, pan: rnd(-0.4, 0.4), dest: L.v.out });
    this._loopVoices.push(v);
    return v;
  }

  update(dt) {
    try {
      const c = this.ctx;
      if (!c) return;
      const now = c.currentTime;
      this._reap(now);
      if (!this._ready()) return;
      const d = clamp(num(dt, 0.016), 0, 0.25);

      const I = this._cur;
      if (I && this._musicOn) {
        if (I.next < now) I.next = now + 0.05;       // resync after a stall / hidden tab
        let n = 0;
        while (I.next < now + LOOKAHEAD && n++ < 8) {
          try { this._musicStep(I, I.next); } catch (e) { /* skip this step */ }
          I.next += I.def.step;
          I.idx++;
        }
      }
      if (this._oldMoods.length) {
        this._oldMoods = this._oldMoods.filter((M) => {
          if (now < M.dead) return true;
          try { M.gain.disconnect(); M.wet.disconnect(); } catch (e) { /* ignore */ }
          for (const v of this._musicVoices) if (v.mood === M) { v.dispose(); v.end = 0; }
          return false;
        });
      }
      for (const name in this._loops) {
        const L = this._loops[name];
        if (L.zeroAt != null && now - L.zeroAt > 2.5) { L.v.dispose(); delete this._loops[name]; continue; }
        if (L.level > 0 && L.spec.tick) { try { L.spec.tick(this, L, d, now); } catch (e) { /* ignore */ } }
      }
    } catch (e) { /* never throw */ }
  }

  _reap(now) {
    for (const list of [this._voices, this._dying, this._musicVoices, this._loopVoices]) {
      let j = 0;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (v.end < now) v.dispose(); else list[j++] = v;
      }
      list.length = j;
    }
  }

  // ── music ──
  _mv(I, at, vol, pan, send = 0.55) {
    const v = new Voice(this, { at, vol, pan, send, dest: I.gain, verb: I.wet });
    v.mood = I;
    this._musicVoices.push(v);
    return v;
  }

  _musicStep(I, at) {
    const D = I.def, k = I.idx % D.chordSteps;
    if (k === 0) {
      I.chord = D.chords[Math.floor(I.idx / D.chordSteps) % D.chords.length];
      this._musicPad(I, at);
    }
    if (D.boss) { this._bossStep(I, at); return; }
    if (Math.random() < D.pluckP * (k % 2 === 0 ? 1.25 : 0.7)) {
      const n = D.scale.length;
      I.mel = clamp(I.mel + pick([-2, -1, -1, 0, 1, 1, 2]), 0, n * 2);
      const semis = D.scale[I.mel % n] + 12 * Math.floor(I.mel / n) + 12 * D.melOct;
      const f = st(D.root, semis);
      const v = this._mv(I, at, D.pluckVol, rnd(-0.35, 0.35));
      v.tone({ type: 'triangle', f, a: 0.006, d: 1.6, v: 1, lp: [[0, f * 5], [0.5, f * 1.6]] });
      v.tone({ f: f * 2, a: 0.004, d: 0.7, v: 0.22 });
      if (Math.random() < 0.18 && I.mel >= 2) {      // soft harmony a step below
        const m2 = I.mel - 2;
        const f2 = st(D.root, D.scale[m2 % n] + 12 * Math.floor(m2 / n) + 12 * D.melOct);
        v.tone({ type: 'triangle', f: f2, t: 0.04, a: 0.006, d: 1.3, v: 0.6, lp: f2 * 3 });
      }
    }
    if (D.bellP && Math.random() < D.bellP) {
      const v = this._mv(I, at, 0.05, rnd(-0.5, 0.5), 0.7);
      v.bell(st(D.root, 24 + pick([0, 7])), 0, 3.5, 1, 4);
    }
  }

  _musicPad(I, at) {
    const D = I.def, len = D.chordSteps * D.step, tot = len + D.padR;
    const v = this._mv(I, at, D.padVol, 0, 0.6);
    const lp = v.filt('lowpass', D.cutoff, 0.7);
    v.curve(lp.frequency, 0, [[0, D.cutoff * 0.55], [len * 0.5, D.cutoff], [tot, D.cutoff * 0.5]]);
    const g = v.g(0);
    lp.connect(g); g.connect(v.out);
    const s = v.t0;
    g.gain.setValueAtTime(1e-4, s);
    g.gain.linearRampToValueAtTime(1, s + D.padA);
    g.gain.setValueAtTime(1, s + len);
    g.gain.exponentialRampToValueAtTime(1e-4, s + tot);
    for (const semis of I.chord) {
      const f = st(D.root, semis);
      for (const det of [-7, 6]) {
        const o = v.osc(D.padWave, f);
        o.detune.value = det + rnd(-2, 2);
        o.connect(lp);
        v.run(o, 0, tot);
      }
    }
    if (D.bass) {
      const b = this._mv(I, at, D.bass, 0, 0.1);
      b.tone({ type: 'triangle', f: st(D.root, I.chord[0] - 12), lp: 400, a: 0.8, hold: Math.max(0, len - 1.2), d: len + 1, v: 1 });
    }
  }

  _bossStep(I, at) {
    const D = I.def, k = I.idx % 8, ch = I.chord;
    const v = this._mv(I, at, 1, 0, 0.25);
    const bf = st(D.root, ch[0]);
    v.tone({ type: 'sawtooth', f: bf, a: 0.005, d: 0.22, v: k % 2 ? 0.05 : 0.08, lp: [[0, 900], [0.18, 200]], q: 2 });
    if (D.kick[k]) v.tone({ f: [[0, 130], [0.12, 42]], a: 0.002, d: 0.32, v: 0.32 });
    if (D.tom[k]) {
      v.hiss({ color: 'pink', f: 1400, q: 0.8, a: 0.002, d: 0.14, v: 0.12 });
      v.tone({ f: [[0, 220], [0.12, 140]], a: 0.002, d: 0.16, v: 0.1 });
    }
    if (k % 2 === 0 || Math.random() < 0.3) {
      const f = st(D.root, ch[1 + ((I.idx >> 1) % 3)] + 12);
      v.tone({ type: 'triangle', f, a: 0.004, d: 0.5, v: 0.05, lp: [[0, f * 4], [0.3, f * 1.5]] });
    }
  }

  // debugging / test page helper (not part of the game API)
  _stats() {
    return {
      state: this.ctx ? this.ctx.state : 'locked',
      voices: this._voices.length, dying: this._dying.length,
      music: this._musicVoices.length, loopEvents: this._loopVoices.length,
      loops: Object.keys(this._loops), mood: this._cur ? this._cur.name : 'none',
      liveNodes: this._made - this._freed,
    };
  }
}

export const SOUND_NAMES = Object.keys(SOUNDS);
export const LOOP_NAMES = Object.keys(LOOPS);
