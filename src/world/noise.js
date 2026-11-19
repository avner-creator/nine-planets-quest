// Deterministic random numbers + fast 2D simplex noise for terrain and placement.

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gauss() { return (this.next() + this.next() + this.next() + this.next() - 2) * 0.8660254; }
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float64Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1,
  0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071, -0.7071]);

// Returns noise(x, y) in roughly [-1, 1].
export function makeSimplex(seed) {
  const rng = new RNG(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), permG = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permG[i] = (perm[i] % 12) * 2; }
  return function noise(xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = permG[ii + perm[jj]]; t0 *= t0; n0 = t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = permG[ii + i1 + perm[jj + j1]]; t1 *= t1; n1 = t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = permG[ii + 1 + perm[jj + 1]]; t2 *= t2; n2 = t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
}

// Noise toolkit bound to one seed.
export function makeNoiseKit(seed) {
  const n1 = makeSimplex(seed), n2 = makeSimplex(seed + 101), n3 = makeSimplex(seed + 202);
  function fbm(x, z, oct = 5, lac = 2.03, gain = 0.5) {
    let s = 0, a = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * n1(x * f + o * 17.3, z * f - o * 9.1); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  function ridged(x, z, oct = 5, lac = 2.1, gain = 0.5) {
    let s = 0, a = 1, f = 1, norm = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(n2(x * f + o * 31.7, z * f + o * 11.3));
      v *= v; v *= w; w = Math.min(1, Math.max(0, v * 1.6));
      s += a * v; norm += a; a *= gain; f *= lac;
    }
    return s / norm; // 0..1
  }
  function warp(x, z, scale, amt) {
    return [x + n3(x * scale, z * scale) * amt, z + n3(x * scale + 51.7, z * scale - 23.1) * amt];
  }
  return { n1, n2, n3, fbm, ridged, warp };
}

export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
export const smax = (a, b, k) => -smin(-a, -b, k);

// Distance from point to a polyline [[x,z],...]; returns { d, t (0..1 along whole line), dx, dz (direction) }
export function polyDist(px, pz, pts, out) {
  let best = 1e9, bt = 0, bdx = 0, bdz = 1, acc = 0, total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez, L = Math.sqrt(L2);
    let t = ((px - ax) * ex + (pz - az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t - px, qz = az + ez * t - pz, d = qx * qx + qz * qz;
    if (d < best) { best = d; bt = (acc + t * L) / total; bdx = ex / L; bdz = ez / L; }
    acc += L;
  }
  out = out || {};
  out.d = Math.sqrt(best); out.t = bt; out.dx = bdx; out.dz = bdz;
  return out;
}

// Smooth a polyline with Chaikin subdivision (keeps ends).
export function chaikin(pts, iters = 3) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
