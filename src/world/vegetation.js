// Vegetation: procedural tree species, LOD-switched instanced forests with wind, grass, flowers, rocks.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, makeSimplex } from './noise.js';
import { packedMaterial } from './materials.js';
import { leafClusterTexture, needleTexture, frondTexture, strandTexture } from './canvasTex.js';
import { GLSL_HEIGHT } from './terrain.js';
import { bakeTexture } from './bake.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

// ------------------------------------------------------------------ mesh data accumulator
export class MD {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, u, w, r, g, b) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w); this.c.push(r, g, b); return this.p.length / 3 - 1; }
  t(a, b, c) { this.i.push(a, b, c); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

// Tapered tube along points [{p:V3, r}] with parallel-transport frames.
export function tube(md, pts, radial, opt = {}) {
  const n = pts.length; if (n < 2) return;
  const base = md.count;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)].p, b = pts[Math.min(n - 1, i + 1)].p;
    T.push(b.clone().sub(a).normalize());
  }
  let nrm = Math.abs(T[0].y) < 0.9 ? new V3(0, 1, 0).cross(T[0]).normalize() : new V3(1, 0, 0).cross(T[0]).normalize();
  for (let i = 0; i < n; i++) {
    nrm = nrm.clone().sub(T[i].clone().multiplyScalar(nrm.dot(T[i]))).normalize();
    N.push(nrm); B.push(T[i].clone().cross(nrm));
  }
  const uS = opt.uScale ?? Math.max(1, Math.round(pts[0].r * 6)), vS = opt.vScale ?? 1;
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) len += pts[i].p.distanceTo(pts[i - 1].p);
    const { p, r } = pts[i];
    const ao = opt.ao ? opt.ao(p, i / (n - 1)) : 1;
    const col = opt.color ? opt.color(p, i / (n - 1)) : null;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = N[i].x * ca + B[i].x * sa, dy = N[i].y * ca + B[i].y * sa, dz = N[i].z * ca + B[i].z * sa;
      const rr = opt.ribs ? r * (1 + opt.ribs * Math.cos(a * opt.ribN)) : r;
      md.v(p.x + dx * rr, p.y + dy * rr, p.z + dz * rr, dx, dy, dz, (j / radial) * uS, len * vS, col ? col[0] * ao : ao, col ? col[1] * ao : ao, col ? col[2] * ao : ao);
    }
  }
  const rw = radial + 1;
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = base + i * rw + j, b = a + 1, c = a + rw, d = c + 1;
    md.t(a, c, b); md.t(b, c, d);
  }
}

function perp(d, rng) {
  const a = Math.abs(d.y) < 0.9 ? UP : new V3(1, 0, 0);
  const p1 = new V3().crossVectors(d, a).normalize(), p2 = new V3().crossVectors(d, p1);
  const ang = rng.next() * Math.PI * 2;
  return p1.multiplyScalar(Math.cos(ang)).add(p2.multiplyScalar(Math.sin(ang)));
}
function along(pts, t) {
  const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = f - i;
  return { p: pts[i].p.clone().lerp(pts[i + 1].p, k), r: pts[i].r + (pts[i + 1].r - pts[i].r) * k, d: pts[i + 1].p.clone().sub(pts[i].p).normalize() };
}

// Leaf cards around a point. Normals blend toward "outward from crown centre" for soft volumetric light.
function cluster(md, c, size, crown, rng, cards = 3, opt = {}) {
  const out = c.clone().sub(crown.c); const ol = out.length() || 1; out.divideScalar(ol);
  const depth = Math.min(1, ol / crown.r);
  const ao = 0.55 + 0.45 * depth * (0.7 + 0.3 * Math.max(0, out.y + 0.3));
  for (let k = 0; k < cards; k++) {
    let nrm;
    if (opt.flat) nrm = new V3(rng.range(-0.25, 0.25), 1, rng.range(-0.25, 0.25)).normalize();
    else nrm = out.clone().multiplyScalar(0.6).add(new V3(rng.range(-1, 1), rng.range(-0.6, 1), rng.range(-1, 1)).normalize()).normalize();
    const t1 = perp(nrm, rng), t2 = new V3().crossVectors(nrm, t1);
    const s = size * rng.range(0.8, 1.15) * 0.5;
    const sn = out.clone().multiplyScalar(0.7).add(nrm.clone().multiplyScalar(0.2)).add(new V3(0, 0.45, 0)).normalize();
    const b = md.count;
    for (const [a, bb, u, w] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      const x = c.x + (t1.x * a + t2.x * bb) * s, y = c.y + (t1.y * a + t2.y * bb) * s, z = c.z + (t1.z * a + t2.z * bb) * s;
      const shade = ao * (0.85 + 0.15 * (y - crown.c.y + crown.r) / (2 * crown.r));
      md.v(x, y, z, sn.x, sn.y, sn.z, u, w, shade, shade, shade);
    }
    md.t(b, b + 1, b + 2); md.t(b, b + 2, b + 3);
  }
}

// Emit queued leaf clusters with a crown centre computed from the clusters themselves.
function flushLeaves(ctx) {
  const P = ctx.pending; if (!P || !P.length) return;
  const c = new V3(); P.forEach((p) => c.add(p[0])); c.divideScalar(P.length);
  let r = 0; P.forEach((p) => { r = Math.max(r, p[0].distanceTo(c)); });
  c.y -= r * 0.25;
  const crown = { c, r: Math.max(1, r) };
  P.forEach(([pos, sz, cards, opt]) => cluster(ctx.leaves, pos, sz, crown, ctx.rng, cards, opt));
  ctx.pending = null;
}
// Generic recursive branching.
function grow(ctx, start, dir, len, r0, depth, P) {
  const { rng, bark, leaves } = ctx;
  const L = P.levels[depth];
  const segs = Math.max(2, Math.round(L.segs * (ctx.lod ? 0.6 : 1)));
  const pts = []; const p = start.clone(); const d = dir.clone();
  for (let s = 0; s <= segs; s++) {
    const f = s / segs;
    pts.push({ p: p.clone(), r: r0 * (1 - f * (L.taper ?? 0.6)) });
    if (s < segs) {
      d.add(perp(d, rng).multiplyScalar(L.gnarl ?? 0.15)).add(new V3(0, (L.up ?? 0) - (L.droop ?? 0) * f, 0));
      if (P.lean && depth === 0) d.add(P.lean.clone().multiplyScalar(f * 0.25));
      d.normalize();
      p.addScaledVector(d, len / segs);
    }
  }
  const radial = ctx.lod ? Math.max(3, Math.round(L.radial * 0.5)) : L.radial;
  tube(bark, pts, radial, { ao: (q) => (q.y < 1.2 ? 0.55 + 0.45 * Math.min(1, q.y / 1.2) : 1), uScale: Math.max(1, Math.round(r0 * 8)), vScale: 1 / Math.max(0.6, r0 * 4) });
  const next = P.levels[depth + 1];
  if (next && !(ctx.lod && depth + 1 > (P.lodDepth ?? 1))) {
    const nKids = rng.int(next.n[0], next.n[1]);
    for (let k = 0; k < nKids; k++) {
      const t = rng.range(next.start, 0.97);
      const a = along(pts, t);
      const spread = rng.range(next.spread[0], next.spread[1]);
      const pd = perp(a.d, rng);
      if (next.side) pd.lerp(next.side, 0.6).normalize();
      const cd = a.d.clone().multiplyScalar(Math.cos(spread)).add(pd.multiplyScalar(Math.sin(spread))).normalize();
      cd.y += next.up0 ?? 0; cd.normalize();
      grow(ctx, a.p, cd, len * rng.range(next.ratio[0], next.ratio[1]) * (1 - t * 0.35), Math.max(0.025, a.r * (next.rScale ?? 0.7)), depth + 1, P);
    }
  }
  const terminal = !next || (ctx.lod && depth + 1 > (P.lodDepth ?? 1));
  if (P.leaf && (depth >= P.leaf.depth || (terminal && depth >= P.leaf.depth - 1))) {
    const lodBoost = ctx.lod && depth < P.leaf.depth ? 1.5 : 1;
    const per = ctx.lod ? Math.max(2, Math.round(P.leaf.per * 0.8 * lodBoost)) : P.leaf.per;
    for (let k = 0; k < per; k++) {
      const a = along(pts, 1 - (k / per) * P.leaf.along);
      const sz = rng.range(P.leaf.size[0], P.leaf.size[1]) * (ctx.lod ? 1.35 * lodBoost : 1);
      const off = new V3(rng.range(-1, 1), rng.range(-0.4, 0.8), rng.range(-1, 1)).multiplyScalar(sz * 0.3);
      (ctx.pending = ctx.pending || []).push([a.p.add(off), sz, ctx.lod ? 2 : P.leaf.cards ?? 3, P.leaf]);
    }
  }
}

// ------------------------------------------------------------------ species
const SPECIES = {
  oak: { trunk: [3.2, 4.6], r: [0.34, 0.46], crown: [4.5, 6.5], levels: [
    { segs: 6, radial: 8, gnarl: 0.08, up: 0.0, taper: 0.45 },
    { n: [4, 6], start: 0.5, spread: [0.6, 1.05], ratio: [1.0, 1.35], segs: 5, radial: 6, gnarl: 0.22, up: 0.06, taper: 0.6, rScale: 0.62 },
    { n: [3, 4], start: 0.25, spread: [0.5, 0.95], ratio: [0.45, 0.65], segs: 3, radial: 4, gnarl: 0.3, up: 0.05, taper: 0.7, rScale: 0.6 }],
    leaf: { depth: 2, per: 3, along: 0.7, size: [2.5, 3.4], cards: 2 }, tex: 'round', bark: 'bark', lodDepth: 1, height: 11 },
  birch: { trunk: [6.5, 9], r: [0.15, 0.22], levels: [
    { segs: 7, radial: 7, gnarl: 0.05, up: 0.02, taper: 0.75 },
    { n: [5, 8], start: 0.4, spread: [0.35, 0.7], ratio: [0.28, 0.42], segs: 3, radial: 4, gnarl: 0.25, up: 0.08, droop: 0.12, rScale: 0.45 }],
    leaf: { depth: 1, per: 3, along: 0.8, size: [1.4, 2.1], cards: 3 }, tex: 'small', bark: 'birch', lodDepth: 1, height: 11 },
  dead: { trunk: [4.5, 6.5], r: [0.25, 0.36], levels: [
    { segs: 6, radial: 7, gnarl: 0.14, taper: 0.55 },
    { n: [3, 5], start: 0.4, spread: [0.5, 1.0], ratio: [0.6, 0.9], segs: 4, radial: 5, gnarl: 0.35, up: 0.06, rScale: 0.6 },
    { n: [2, 4], start: 0.3, spread: [0.5, 1.0], ratio: [0.4, 0.6], segs: 3, radial: 3, gnarl: 0.45, rScale: 0.55 }],
    leaf: null, bark: 'bark', lodDepth: 2, height: 9 },
  charred: { trunk: [5, 7.5], r: [0.28, 0.4], levels: [
    { segs: 5, radial: 7, gnarl: 0.1, taper: 0.7 },
    { n: [2, 4], start: 0.45, spread: [0.6, 1.2], ratio: [0.25, 0.45], segs: 2, radial: 4, gnarl: 0.3, rScale: 0.55, taper: 0.4 }],
    leaf: null, bark: 'charred', lodDepth: 1, height: 8 },
  juniper: { trunk: [1.6, 2.4], r: [0.2, 0.3], crown: [2.5, 3.5], levels: [
    { segs: 4, radial: 6, gnarl: 0.3, taper: 0.5 },
    { n: [3, 5], start: 0.3, spread: [0.6, 1.2], ratio: [1.0, 1.6], segs: 4, radial: 4, gnarl: 0.35, up: 0.06, rScale: 0.6 }],
    leaf: { depth: 1, per: 3, along: 0.7, size: [1.5, 2.2], cards: 3 }, tex: 'scale', bark: 'bark', lodDepth: 1, height: 5 },
  windswept: { trunk: [4, 6], r: [0.22, 0.3], levels: [
    { segs: 7, radial: 6, gnarl: 0.12, taper: 0.6 },
    { n: [4, 7], start: 0.35, spread: [1.1, 1.45], ratio: [0.4, 0.7], segs: 3, radial: 4, gnarl: 0.2, rScale: 0.55 }],
    leaf: { depth: 1, per: 3, along: 0.8, size: [1.6, 2.4], cards: 2, flat: true }, tex: 'scale', bark: 'bark', lodDepth: 1, height: 7 },
  twisted: { trunk: [6, 8], r: [0.7, 0.95], levels: [
    { segs: 8, radial: 9, gnarl: 0.16, taper: 0.55 },
    { n: [4, 6], start: 0.45, spread: [0.7, 1.2], ratio: [0.8, 1.1], segs: 6, radial: 6, gnarl: 0.3, up: 0.0, droop: 0.15, rScale: 0.55 },
    { n: [2, 3], start: 0.3, spread: [0.5, 1.0], ratio: [0.45, 0.6], segs: 3, radial: 4, gnarl: 0.35, rScale: 0.55 }],
    leaf: { depth: 2, per: 2, along: 0.6, size: [2.8, 3.8], cards: 3 }, tex: 'round', bark: 'bark', lodDepth: 1, height: 15, strands: true },
};

function newCtx(seed, lod) { return { rng: new RNG(seed), bark: new MD(), leaves: new MD(), extra: {}, lod }; }

function genBranching(kind, seed, lod) {
  const P = SPECIES[kind];
  const ctx = newCtx(seed, lod); const { rng } = ctx;
  const tl = rng.range(P.trunk[0], P.trunk[1]), r = rng.range(P.r[0], P.r[1]);
  const crownR = P.crown ? rng.range(P.crown[0], P.crown[1]) : tl * 0.5;
  ctx.crown = { c: new V3(0, tl + crownR * 0.6, 0), r: crownR };
  if (kind === 'windswept') P.lean = new V3(1, 0, 0), P.levels[1].side = new V3(1, 0.1, 0);
  const startDir = new V3(rng.range(-0.06, 0.06), 1, rng.range(-0.06, 0.06)).normalize();
  if (kind === 'twisted') {
    // roots
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const pts = []; const len = rng.range(2.2, 3.6);
      for (let s = 0; s <= 4; s++) { const f = s / 4; pts.push({ p: new V3(Math.cos(a) * (0.4 + f * len), 1.2 * (1 - f) * (1 - f) - 0.15, Math.sin(a) * (0.4 + f * len)), r: r * 0.55 * (1 - f * 0.8) }); }
      tube(ctx.bark, pts, lod ? 4 : 6, { ao: () => 0.7 });
    }
  }
  grow(ctx, new V3(0, -0.3, 0), startDir, tl + (P.levels.length === 1 ? 0 : 0), r, 0, P);
  if (P.strands && !lod) {
    const tex = 0;
    for (let k = 0; k < 10; k++) {
      const a = rng.next() * Math.PI * 2, d = rng.range(2, crownR * 1.2);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = ctx.crown.c.y - rng.range(0, 2), h = rng.range(2.5, 4.5);
      const b = ctx.extra.strands ? ctx.extra.strands.count : 0;
      ctx.extra.strands = ctx.extra.strands || new MD();
      const m = ctx.extra.strands; const bb = m.count; const w = 0.9; const ca = Math.cos(a + 1.57) * w, sa = Math.sin(a + 1.57) * w;
      m.v(x - ca, y - h, z - sa, Math.cos(a), 0, Math.sin(a), 0, 0, 0.8, 0.8, 0.8); m.v(x + ca, y - h, z + sa, Math.cos(a), 0, Math.sin(a), 1, 0, 0.8, 0.8, 0.8);
      m.v(x + ca, y, z + sa, Math.cos(a), 0, Math.sin(a), 1, 1, 1, 1, 1); m.v(x - ca, y, z - sa, Math.cos(a), 0, Math.sin(a), 0, 1, 1, 1, 1);
      m.t(bb, bb + 1, bb + 2); m.t(bb, bb + 2, bb + 3);
      void b; void tex;
    }
  }
  flushLeaves(ctx);
  const parts = [{ geo: ctx.bark.geo(), mat: P.bark }];
  if (P.leaf) parts.push({ geo: ctx.leaves.geo(), mat: 'leaf' });
  if (ctx.extra.strands) parts.push({ geo: ctx.extra.strands.geo(), mat: 'strand' });
  return { parts, height: P.height, trunkR: r };
}

function genPine(seed, lod, snowy) {
  const ctx = newCtx(seed, lod); const { rng } = ctx;
  const H = rng.range(11, 17), r = rng.range(0.22, 0.32);
  const pts = [];
  for (let s = 0; s <= 6; s++) { const f = s / 6; pts.push({ p: new V3(rng.range(-0.05, 0.05) * f, -0.3 + f * H, rng.range(-0.05, 0.05) * f), r: r * (1 - f * 0.92) }); }
  tube(ctx.bark, pts, lod ? 4 : 7, { ao: (q) => (q.y < 1 ? 0.6 : 1), uScale: 2, vScale: 0.6 });
  ctx.crown = { c: new V3(0, H * 0.55, 0), r: H * 0.45 };
  const start = H * rng.range(0.18, 0.28);
  const whorlStep = lod ? 1.25 : 0.85;
  for (let y = start; y < H - 0.3; y += whorlStep * rng.range(0.85, 1.15)) {
    const f = (y - start) / (H - start);
    const R = (1 - f) * H * 0.3 + 0.5;
    const n = lod ? 4 : Math.max(4, Math.round(7 - f * 3));
    const a0 = rng.next() * 6.28;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const dir = new V3(Math.cos(a), -rng.range(0.15, 0.4), Math.sin(a)).normalize();
      // a card hanging from the trunk outward: base at trunk, tip at R
      const base = new V3(0, y, 0), tip = base.clone().addScaledVector(dir, R);
      const side = new V3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(R * 0.42);
      const nrm = new V3(Math.cos(a) * 0.5, 0.85, Math.sin(a) * 0.5).normalize();
      const m = ctx.leaves; const b = m.count;
      const ao0 = 0.45 + 0.2 * f, ao1 = 0.9 + 0.1 * f;
      const tw = new V3(0, rng.range(-0.15, 0.25), 0);
      m.v(base.x - side.x * 0.3, base.y + 0.1, base.z - side.z * 0.3, nrm.x, nrm.y, nrm.z, 0.5, 0, ao0, ao0, ao0);
      m.v(base.x + side.x * 0.3, base.y + 0.1, base.z + side.z * 0.3, nrm.x, nrm.y, nrm.z, 0.5, 0, ao0, ao0, ao0);
      m.v(tip.x + side.x + tw.x, tip.y + tw.y, tip.z + side.z, nrm.x, nrm.y, nrm.z, 1, 1, ao1, ao1, ao1);
      m.v(tip.x - side.x, tip.y - tw.y, tip.z - side.z, nrm.x, nrm.y, nrm.z, 0, 1, ao1, ao1, ao1);
      m.t(b, b + 1, b + 2); m.t(b, b + 2, b + 3);
      // second, crossing card
      {
        const up = new V3(0, R * 0.35, 0); const b2 = m.count;
        m.v(base.x, base.y - up.y * 0.2, base.z, nrm.x, nrm.y, nrm.z, 0.5, 0, ao0, ao0, ao0);
        m.v(base.x, base.y + 0.2, base.z, nrm.x, nrm.y, nrm.z, 0.5, 0, ao0, ao0, ao0);
        m.v(tip.x, tip.y + up.y, tip.z, nrm.x, nrm.y, nrm.z, 1, 1, ao1, ao1, ao1);
        m.v(tip.x, tip.y - up.y, tip.z, nrm.x, nrm.y, nrm.z, 0, 1, ao1, ao1, ao1);
        m.t(b2, b2 + 1, b2 + 2); m.t(b2, b2 + 2, b2 + 3);
      }
    }
  }
  // top tuft
  const m = ctx.leaves; const b = m.count; const tp = H - 0.2;
  for (const [a, bb, u, w] of [[-0.6, tp - 1.6, 0, 0], [0.6, tp - 1.6, 1, 0], [0.4, tp + 0.6, 1, 1], [-0.4, tp + 0.6, 0, 1]]) m.v(a, bb, 0, 0, 0.5, 1, u, w, 1, 1, 1);
  m.t(b, b + 1, b + 2); m.t(b, b + 2, b + 3);
  return { parts: [{ geo: ctx.bark.geo(), mat: 'bark' }, { geo: ctx.leaves.geo(), mat: snowy ? 'needleSnow' : 'needle' }], height: H, trunkR: r };
}

function genPalm(seed, lod) {
  const ctx = newCtx(seed, lod); const { rng } = ctx;
  const H = rng.range(7, 11), r = rng.range(0.2, 0.26), bend = rng.range(0.8, 2.6), ba = rng.next() * 6.28;
  const pts = []; const segs = lod ? 5 : 10;
  for (let s = 0; s <= segs; s++) { const f = s / segs; pts.push({ p: new V3(Math.cos(ba) * bend * f * f, -0.3 + f * H, Math.sin(ba) * bend * f * f), r: r * (1.25 - f * 0.4) }); }
  tube(ctx.bark, pts, lod ? 5 : 8, { uScale: 2, vScale: 0.4, color: (q) => { const ring = 0.78 + 0.22 * Math.abs(Math.sin(q.y * 9)); return [ring, ring, ring]; } });
  const top = pts[pts.length - 1].p;
  ctx.crown = { c: top.clone(), r: 4 };
  const nF = lod ? 6 : rng.int(9, 12);
  for (let k = 0; k < nF; k++) {
    const a = (k / nF) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const up = rng.range(0.15, 0.7), L = rng.range(3.6, 5.2), segs2 = lod ? 3 : 6;
    const dir = new V3(Math.cos(a), 0, Math.sin(a)); const side = new V3(-Math.sin(a), 0, Math.cos(a));
    const m = ctx.leaves; let prev = -1;
    for (let s = 0; s <= segs2; s++) {
      const f = s / segs2;
      const p = top.clone().addScaledVector(dir, f * L).add(new V3(0, up * L * f - f * f * L * 0.85, 0));
      const w = 0.95 * Math.sin(Math.min(1, f * 1.1 + 0.08) * Math.PI) + 0.12;
      const droopS = 0.25 * f;
      const nrm = new V3(0, 1, 0).addScaledVector(dir, -0.2 + f * 0.6).normalize();
      const ao = 0.75 + 0.25 * f;
      const i0 = m.v(p.x - side.x * w, p.y - droopS, p.z - side.z * w, nrm.x, nrm.y, nrm.z, 0, f, ao, ao, ao);
      m.v(p.x + side.x * w, p.y - droopS, p.z + side.z * w, nrm.x, nrm.y, nrm.z, 1, f, ao, ao, ao);
      if (prev >= 0) { m.t(prev, i0, prev + 1); m.t(prev + 1, i0, i0 + 1); }
      prev = i0;
    }
  }
  // coconuts
  if (!lod) for (let k = 0; k < 4; k++) {
    const a = rng.next() * 6.28; const c = top.clone().add(new V3(Math.cos(a) * 0.32, -0.35, Math.sin(a) * 0.32));
    const pts2 = [{ p: c.clone().add(new V3(0, -0.16, 0)), r: 0.02 }, { p: c.clone().add(new V3(0, -0.1, 0)), r: 0.15 }, { p: c.clone().add(new V3(0, 0.08, 0)), r: 0.15 }, { p: c.clone().add(new V3(0, 0.16, 0)), r: 0.02 }];
    tube(ctx.bark, pts2, 6, { color: () => [0.45, 0.35, 0.25] });
  }
  return { parts: [{ geo: ctx.bark.geo(), mat: 'bark' }, { geo: ctx.leaves.geo(), mat: 'frond' }], height: H, trunkR: r };
}

function genBush(seed, lod, dry) {
  const ctx = newCtx(seed, lod); const { rng } = ctx;
  const R = dry ? rng.range(0.7, 1.1) : rng.range(0.9, 1.6);
  ctx.crown = { c: new V3(0, R * 0.55, 0), r: R };
  const nT = dry ? (lod ? 5 : 10) : 5;
  for (let k = 0; k < nT; k++) {
    const a = rng.next() * 6.28, el = rng.range(0.5, 1.2);
    const d = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    const L = R * rng.range(0.8, 1.3);
    const pts = [{ p: new V3(0, -0.1, 0), r: 0.04 }, { p: d.clone().multiplyScalar(L * 0.5).add(new V3(0, 0.05, 0)), r: 0.025 }, { p: d.clone().multiplyScalar(L), r: 0.008 }];
    tube(ctx.bark, pts, 3, { color: () => (dry ? [0.75, 0.6, 0.45] : [0.6, 0.5, 0.4]) });
    if (dry && rng.chance(0.6)) cluster(ctx.leaves, d.clone().multiplyScalar(L * 0.9), rng.range(0.5, 0.8), ctx.crown, rng, 2);
  }
  if (!dry) {
    const n = lod ? 5 : 11;
    for (let k = 0; k < n; k++) {
      const a = rng.next() * 6.28, d = Math.sqrt(rng.next()) * R * 0.75;
      const c = new V3(Math.cos(a) * d, R * rng.range(0.3, 0.9), Math.sin(a) * d);
      cluster(ctx.leaves, c, rng.range(1.0, 1.5) * (lod ? 1.3 : 1), ctx.crown, rng, lod ? 2 : 3);
    }
  }
  return { parts: [{ geo: ctx.bark.geo(), mat: 'twig' }, { geo: ctx.leaves.geo(), mat: 'leaf' }], height: R * 1.5, trunkR: 0.3 };
}

function genCactus(seed, lod) {
  const ctx = newCtx(seed, lod); const { rng } = ctx;
  const H = rng.range(3.5, 6), r = rng.range(0.28, 0.4);
  const rib = { ribs: 0.08, ribN: 12 };
  const col = () => [1, 1, 1];
  const capPts = (x0, y0, z0, h, rr) => {
    const p = [];
    const S = lod ? 3 : 5; for (let s = 0; s <= S; s++) { const f = s / S; const k = f > 0.8 ? Math.sqrt(Math.max(0, 1 - Math.pow((f - 0.8) / 0.2, 2))) : 1; p.push({ p: new V3(x0, y0 + f * h, z0), r: rr * Math.max(0.05, k) }); }
    return p;
  };
  tube(ctx.bark, capPts(0, -0.3, 0, H, r), lod ? 5 : 10, { ...rib, color: col, uScale: 3, vScale: 0.5 });
  const arms = rng.int(1, 3);
  for (let k = 0; k < arms; k++) {
    const a = rng.next() * 6.28, y0 = rng.range(H * 0.35, H * 0.6), out = rng.range(0.55, 0.9), up = rng.range(1.2, 2.2);
    const ar = r * 0.72; const dx = Math.cos(a), dz = Math.sin(a);
    const pts = [];
    const AS = lod ? 2 : 4; for (let s = 0; s <= AS; s++) { const f = s / AS; const ang = f * Math.PI / 2; pts.push({ p: new V3(dx * out * Math.sin(ang), y0 + out * (1 - Math.cos(ang)) * 0.6, dz * out * Math.sin(ang)), r: ar }); }
    const last = pts[pts.length - 1].p;
    const up2 = capPts(last.x, last.y, last.z, up, ar).slice(1);
    tube(ctx.bark, pts.concat(up2), lod ? 4 : 8, { ...rib, color: col, uScale: 3, vScale: 0.5 });
  }
  return { parts: [{ geo: ctx.bark.geo(), mat: 'cactus' }], height: H, trunkR: r };
}

function genCrystal(seed, lod) {
  const ctx = newCtx(seed, lod); const { rng } = ctx;
  const md = new MD(); const n = rng.int(4, 8); let H = 0;
  for (let k = 0; k < n; k++) {
    const L = k === 0 ? rng.range(5, 9) : rng.range(1.5, 5.5), rr = L * rng.range(0.1, 0.16);
    H = Math.max(H, L);
    const tilt = k === 0 ? rng.range(0, 0.15) : rng.range(0.3, 0.8), a = rng.next() * 6.28;
    const d = new V3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
    const b0 = new V3(Math.cos(a) * rng.range(0, 0.6), -0.5, Math.sin(a) * rng.range(0, 0.6));
    const pts = [{ p: b0, r: rr }, { p: b0.clone().addScaledVector(d, L * 0.8), r: rr }, { p: b0.clone().addScaledVector(d, L), r: 0.001 }];
    const g = 0.75 + 0.25 * rng.next();
    tube(md, pts, 6, { color: (q, f) => [g * (0.7 + 0.3 * f), g * (0.7 + 0.3 * f), g * (0.7 + 0.3 * f)] });
  }
  return { parts: [{ geo: md.geo(), mat: 'crystal' }], height: H, trunkR: 1.0 };
}

function genMushroom(seed, lod) {
  const ctx = newCtx(seed, lod); const { rng } = ctx;
  const H = rng.range(4, 9), r = rng.range(0.35, 0.7), bend = rng.range(0, 1.2), ba = rng.next() * 6.28;
  const body = new MD(), glow = new MD();
  const pts = [];
  for (let s = 0; s <= 6; s++) { const f = s / 6; pts.push({ p: new V3(Math.cos(ba) * bend * f * f, -0.3 + f * H, Math.sin(ba) * bend * f * f), r: r * (1.4 - f * 0.5 + (f < 0.12 ? 0.6 * (0.12 - f) / 0.12 : 0)) }); }
  tube(body, pts, lod ? 6 : 10, { color: () => [0.85, 0.82, 0.9] });
  const top = pts[pts.length - 1].p; const CR = rng.range(2.4, 4.8);
  const seg = lod ? 12 : 22, rings = lod ? 4 : 7;
  // cap (dome) — top surface
  const capCol = rng.chance(0.5) ? [0.45, 0.25, 0.65] : [0.2, 0.45, 0.55];
  const capBase = body.count;
  for (let i = 0; i <= rings; i++) {
    const f = i / rings, phi = f * Math.PI * 0.5;
    const rr = Math.sin(phi) * CR, y = Math.cos(phi) * CR * 0.45;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const nrm = new V3(ca * Math.sin(phi), Math.cos(phi) * 1.6, sa * Math.sin(phi)).normalize();
      const sh = 0.75 + 0.25 * Math.cos(phi);
      body.v(top.x + ca * rr, top.y + y - 0.2, top.z + sa * rr, nrm.x, nrm.y, nrm.z, j / seg, f, capCol[0] * sh, capCol[1] * sh, capCol[2] * sh);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = capBase + i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1; body.t(a, c, b); body.t(b, c, d); }
  // underside gills (glowing): a cone from rim to stem
  const gb = glow.count;
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    glow.v(top.x + ca * CR, top.y - 0.2, top.z + sa * CR, 0, -1, 0, j / seg, 0, 1, 1, 1);
    glow.v(top.x + ca * r * 1.1, top.y - CR * 0.25, top.z + sa * r * 1.1, 0, -1, 0, j / seg, 1, 0.35, 0.35, 0.35);
  }
  for (let j = 0; j < seg; j++) { const a = gb + j * 2; glow.t(a, a + 2, a + 1); glow.t(a + 1, a + 2, a + 3); }
  // glowing spots on the cap
  if (!lod) for (let k = 0; k < 9; k++) {
    const phi = rng.range(0.2, 1.3), a = rng.next() * 6.28, rr = Math.sin(phi) * CR * 1.01, y = Math.cos(phi) * CR * 0.45 * 1.02;
    const c = new V3(top.x + Math.cos(a) * rr, top.y + y - 0.2, top.z + Math.sin(a) * rr);
    const nrm = new V3(Math.cos(a) * Math.sin(phi), Math.cos(phi) * 1.6, Math.sin(a) * Math.sin(phi)).normalize();
    const t1 = perp(nrm, rng), t2 = new V3().crossVectors(nrm, t1); const s = rng.range(0.15, 0.32);
    const b = glow.count;
    for (const [x, y2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) glow.v(c.x + (t1.x * x + t2.x * y2) * s, c.y + (t1.y * x + t2.y * y2) * s, c.z + (t1.z * x + t2.z * y2) * s, nrm.x, nrm.y, nrm.z, 0, 0, 0.8, 0.8, 0.8);
    glow.t(b, b + 1, b + 2); glow.t(b, b + 2, b + 3);
  }
  return { parts: [{ geo: body.geo(), mat: 'mushBody' }, { geo: glow.geo(), mat: 'mushGlow' }], height: H + CR * 0.4, trunkR: r * 1.2 };
}

export function makeTree(kind, seed, lod) {
  switch (kind) {
    case 'pine': return genPine(seed, lod, false);
    case 'snowpine': return genPine(seed, lod, true);
    case 'palm': return genPalm(seed, lod);
    case 'bush': return genBush(seed, lod, false);
    case 'dryshrub': return genBush(seed, lod, true);
    case 'cactus': return genCactus(seed, lod);
    case 'crystal': return genCrystal(seed, lod);
    case 'giantmushroom': return genMushroom(seed, lod);
    default: return genBranching(SPECIES[kind] ? kind : 'oak', seed, lod);
  }
}

// ------------------------------------------------------------------ wind shader patch
const WIND_VERT = /* glsl */`
uniform float uTime, uWindAmp, uTreeH, uFlutter; uniform vec3 uWindDir;
`;
const WIND_BEGIN = /* glsl */`
{
  vec3 iPos = vec3(0.0); vec3 wdl = uWindDir;
#ifdef USE_INSTANCING
  iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  wdl = normalize((vec4(uWindDir, 0.0) * instanceMatrix).xyz);
#endif
  float hN = max(transformed.y, 0.0) / uTreeH;
  float bend = hN * hN;
  float ph = dot(iPos.xz, vec2(0.071, 0.113));
  float gust = sin(uTime * 0.5 + ph * 0.4) * 0.5 + 0.5;
  float s = sin(uTime * 1.6 + ph) * 0.55 + sin(uTime * 2.9 + ph * 1.3) * 0.2;
  transformed += wdl * (s * 0.6 + gust) * bend * uWindAmp;
  float rr = length(transformed.xz) / uTreeH;
  transformed.y += sin(uTime * 2.2 + ph + transformed.x * 0.7) * rr * 0.12 * uWindAmp;
  transformed += normal * sin(uTime * 6.5 + dot(position, vec3(3.1, 1.7, 2.3)) + ph * 3.0) * 0.035 * uFlutter;
}`;

function windify(mat, U, flutter, extraKey = '') {
  const prev = mat.onBeforeCompile;
  const loc = { uFlutter: { value: flutter } };
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, U, loc);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_VERT)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_BEGIN);
  };
  const pk = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => (pk ? pk.call(mat) : '') + '_wind' + extraKey;
  return mat;
}

function leafMaterial(tex, color, U, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, color, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, vertexColors: true,
    alphaToCoverage: !!opts.a2c });
  const snow = { uSnow: { value: opts.snow || 0 }, uTrans: { value: new THREE.Color(opts.trans || '#000000') } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, snow);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUpN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec3 wn = objectNormal;
#ifdef USE_INSTANCING
 wn = mat3(instanceMatrix) * wn;
#endif
 vUpN = normalize(mat3(modelMatrix) * wn).y; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vUpN; uniform float uSnow; uniform vec3 uTrans;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (uSnow > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), smoothstep(0.8, 0.98, vUpN) * uSnow * 0.45);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uTrans * diffuseColor.rgb;');
  };
  mat.customProgramCacheKey = () => 'leaf';
  windify(mat, U, opts.flutter ?? 1, 'leaf');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
  windify(depth, U, opts.flutter ?? 1, 'leafdepth');
  return { mat, depth };
}

// ------------------------------------------------------------------ impostors (far trees)
const IMP_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
uniform vec3 uSize; varying vec2 vUv; varying vec3 vTint;
void main(){
  vUv = uv;
  vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float sc = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
  vec3 toCam = cameraPosition - iPos; toCam.y = 0.0; vec3 f = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(f.z, 0.0, -f.x);
  vec3 wp = iPos + right * position.x * uSize.x * sc + vec3(0.0, (position.y * uSize.y + uSize.z) * sc, 0.0);
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#else
  vTint = vec3(1.0);
#endif
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const IMP_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tMap; uniform vec3 uLight;
varying vec2 vUv; varying vec3 vTint;
void main(){
  vec4 c = texture2D(tMap, vUv);
  if (c.a < 0.42) discard;
  gl_FragColor = vec4(c.rgb / max(c.a, 0.001) * uLight * vTint, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const _impQuad = () => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, 0.5, 0); return g; };

function bakeImpostor(renderer, tree, getMatFn, kind, lightU) {
  const sc = new THREE.Scene();
  const box = new THREE.Box3();
  const meshes = tree.parts.map((p) => {
    const { m } = getMatFn(p.mat, kind, tree.height);
    const im = new THREE.InstancedMesh(p.geo, m, 1);
    im.setMatrixAt(0, new THREE.Matrix4()); im.setColorAt(0, new THREE.Color(1, 1, 1));
    p.geo.computeBoundingBox(); box.union(p.geo.boundingBox);
    sc.add(im); return im;
  });
  sc.add(new THREE.HemisphereLight(0xd8e6ff, 0x5a5040, 1.1));
  const dl = new THREE.DirectionalLight(0xfff4e0, 2.4); dl.position.set(0.5, 0.9, 1.0); sc.add(dl);
  const amb = new THREE.AmbientLight(0xffffff, 0.25); sc.add(amb);
  const h = Math.max(box.max.y - Math.max(box.min.y, -0.3), 0.5), w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.04;
  const H = Math.max(h * 1.02, w * 2), W = H / 2, y0 = Math.max(box.min.y, -0.3);
  const cx = (box.max.x + box.min.x) / 2;
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H, 0, 0.1, 200);
  cam.position.set(cx, y0, 100); cam.lookAt(cx, y0, 0); cam.updateMatrixWorld();
  const rt = new THREE.WebGLRenderTarget(128, 256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  const prevShadow = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevA); renderer.shadowMap.enabled = prevShadow;
  meshes.forEach((m) => m.dispose());
  const mat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: rt.texture }, uSize: { value: new THREE.Vector3(W, H, y0) }, uLight: lightU,
      fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, fogNear: { value: 1 }, fogFar: { value: 2000 } },
    vertexShader: IMP_VERT, fragmentShader: IMP_FRAG, fog: true,
  });
  return { mat, rt };
}

// ------------------------------------------------------------------ the forest system
export function createVegetation(renderer, ctx) {
  const { quality, biome, scene, colliders } = ctx;
  const hi = quality === 'high';
  const root = new THREE.Group(); root.name = 'vegetation';
  const disposables = [];
  const U = { uTime: { value: 0 }, uWindAmp: { value: ctx.windAmp ?? 0.35 }, uTreeH: { value: 10 }, uWindDir: { value: new V3(1, 0, 0.3).normalize() } };
  const leafCol = new THREE.Color(biome.trees.leaf), trunkCol = new THREE.Color(biome.trees.trunk);

  // materials (created lazily by key)
  const mats = {};
  const getMat = (key, kind, height) => {
    const k = key + '|' + kind;
    if (mats[k]) return mats[k];
    const UH = Object.assign({}, U, { uTreeH: { value: height } });
    let m, depth = null;
    switch (key) {
      case 'bark': case 'birch': case 'twig': case 'cactus': case 'charred': {
        const tex = key === 'birch' ? 'birch' : 'bark';
        let color = trunkCol.clone();
        if (key === 'birch') color = new THREE.Color('#e8e4dc');
        if (key === 'cactus') color = new THREE.Color(biome.trees.leaf).lerp(new THREE.Color('#4f7a3a'), 0.4);
        if (kind === 'palm') color = new THREE.Color(biome.trees.trunk).multiplyScalar(1.1);
        if (key === 'twig') color = trunkCol.clone().multiplyScalar(1.2);
        const charred = key === 'charred';
        m = packedMaterial(renderer, {
          tex, color, roughness: key === 'cactus' ? 0.6 : 0.92, vertexColors: true, normalScale: key === 'cactus' ? 0.4 : 1.2, luma: key === 'birch' ? [0.25, 1.15] : [0.45, 1.4],
          topColor: ctx.barkTop || '#ffffff', topAmt: ctx.barkTopAmt || 0, instanced: true, extraKey: charred ? 'charred' : '',
          uniforms: charred ? { uGlowC: { value: new THREE.Color('#ff4a0a') }, uTime: U.uTime } : undefined,
          fragmentPars: charred ? 'uniform vec3 uGlowC; uniform float uTime;' : '',
          emissiveExtra: charred ? 'totalEmissiveRadiance += uGlowC * (1.0 - smoothstep(0.12, 0.3, pk.b)) * (2.0 + 1.2 * sin(uTime * 1.7 + vPkUv.y * 2.0));' : '',
        });
        windify(m, UH, 0, 'b');
        depth = windify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), UH, 0, 'bd');
        break;
      }
      case 'leaf': case 'needle': case 'needleSnow': case 'frond': case 'strand': {
        let tex;
        if (key === 'needle' || key === 'needleSnow') tex = needleTexture(7);
        else if (key === 'frond') tex = frondTexture(8);
        else if (key === 'strand') tex = strandTexture(9);
        else tex = leafClusterTexture(kind.length * 13 + 5, SPECIES[kind]?.tex || (kind === 'dryshrub' ? 'small' : 'round'));
        disposables.push(tex);
        let c = leafCol.clone().multiplyScalar(1.3);
        if (kind === 'birch') c.lerp(new THREE.Color('#9acb4a'), 0.35);
        if (kind === 'dryshrub') c = new THREE.Color(biome.trees.leaf).lerp(new THREE.Color('#9a8a5a'), 0.6).multiplyScalar(1.1);
        if (key === 'strand') c = new THREE.Color('#7a8a6a').lerp(leafCol, 0.5).multiplyScalar(1.0);
        const r = leafMaterial(tex, c, UH, { snow: key === 'needleSnow' ? 1 : 0, a2c: hi, flutter: key === 'strand' ? 2.5 : key === 'frond' ? 1.6 : 1, trans: ctx.leafGlow });
        m = r.mat; depth = r.depth;
        break;
      }
      case 'crystal': {
        m = new THREE.MeshStandardMaterial({ color: new THREE.Color(biome.trees.leaf).multiplyScalar(0.3), emissive: new THREE.Color(biome.trees.leaf).lerp(new THREE.Color('#7a5aff'), 0.4), emissiveIntensity: 0.55,
          roughness: 0.12, metalness: 0.15, flatShading: true, vertexColors: true });
        break;
      }
      case 'mushBody': {
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors: true });
        windify(m, Object.assign({}, UH, { uWindAmp: { value: 0.05 } }), 0, 'mb');
        break;
      }
      case 'mushGlow': {
        m = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.6, emissive: new THREE.Color(ctx.glowColor || '#3ad0c4'), emissiveIntensity: 1.1, vertexColors: true, side: THREE.DoubleSide });
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;'); };
        m.customProgramCacheKey = () => 'mushglow';
        windify(m, Object.assign({}, UH, { uWindAmp: { value: 0.05 } }), 0, 'mg');
        break;
      }
    }
    mats[k] = { m, depth };
    return mats[k];
  };

  // ---- placement
  const specs = ctx.treeSpecs; // [{kind, count, minR, maxR, maxH?, cluster?}]
  const R = ctx.radius;
  const trees = []; // {x,y,z,s,rot,kindIdx,variant}
  const occ = new Map();
  const cell = 3;
  const occKey = (x, z) => ((Math.floor(x / cell) + 1000) * 4000 + Math.floor(z / cell) + 1000);
  const free = (x, z, r) => {
    const n = Math.ceil(r / cell);
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const o = occ.get((cx + i + 1000) * 4000 + cz + j + 1000);
      if (o && Math.hypot(o[0] - x, o[1] - z) < r + o[2]) return false;
    }
    return true;
  };
  const occupy = (x, z, r) => occ.set(occKey(x, z), [x, z, r]);
  const rng = new RNG(ctx.seed * 7 + 3);
  const clump = makeSimplex(ctx.seed + 55);
  const kinds = [];
  const kindIndex = {};
  const VARIANTS = 2;
  for (const s of specs) {
    if (!(s.kind in kindIndex)) {
      kindIndex[s.kind] = kinds.length;
      const vs = [];
      for (let v = 0; v < VARIANTS; v++) vs.push({ hi: makeTree(s.kind, ctx.seed * 31 + v * 977 + kinds.length * 13, false), lo: makeTree(s.kind, ctx.seed * 31 + v * 977 + kinds.length * 13, true) });
      kinds.push({ kind: s.kind, variants: vs });
    }
    const count = Math.round(s.count * (hi ? 1 : 0.6));
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 25) {
      tries++;
      const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.range((s.minR / s.maxR) ** 2, 1)) * s.maxR;
      const x = Math.cos(a) * d + (s.cx || 0), z = Math.sin(a) * d + (s.cz || 0);
      if (s.cluster !== 0) { const cl = clump(x * 0.012, z * 0.012) * 0.5 + 0.5; if (rng.next() > Math.pow(cl, s.cluster ?? 1.6) * 1.6) continue; }
      const y = ctx.groundAt(x, z);
      if (ctx.liquidLevel !== null && y < ctx.liquidLevel + (s.minAbove ?? 0.6)) continue;
      if (s.maxH !== undefined && y > s.maxH) continue;
      if (s.minH !== undefined && y < s.minH) continue;
      if (ctx.slopeAt(x, z) > (s.maxSlope ?? 0.55)) continue;
      if (ctx.blocked(x, z, s.clear ?? 3)) continue;
      const scale = rng.range(s.scale?.[0] ?? 0.8, s.scale?.[1] ?? 1.25);
      const spacing = (s.spacing ?? 3) * scale;
      if (!free(x, z, spacing)) continue;
      occupy(x, z, spacing);
      const ki = kindIndex[s.kind], vi = rng.int(0, VARIANTS - 1);
      trees.push({ x, y: y - 0.05, z, s: scale, rot: rng.next() * Math.PI * 2, ki, vi, tint: rng.range(0.82, 1.12) });
      placed++;
      const tr = kinds[ki].variants[vi].hi.trunkR * scale;
      if (Math.hypot(x, z) < R + 15 && tr > 0.12) colliders.circles.push({ x, z, r: tr + 0.2 });
    }
  }
  ctx.occupied = free;

  // ---- LOD groups: each instance is drawn at one of up to 3 detail levels by distance (null level = hidden)
  const groups = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), pos = new V3();
  function addGroup(list, levels, dists) {
    const mats16 = new Float32Array(list.length * 16), cols = new Float32Array(list.length * 3);
    list.forEach((t, i) => {
      if (t.m) t.m.toArray(mats16, i * 16);
      else { q.setFromAxisAngle(UP, t.rot); sc.setScalar(t.s); pos.set(t.x, t.y, t.z); m4.compose(pos, q, sc); m4.toArray(mats16, i * 16); }
      const c = t.col || [t.tint ?? 1, (t.tint ?? 1) * (0.95 + 0.1 * ((i * 0.618) % 1)), t.tint ?? 1];
      cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
    });
    const lv = levels.map((parts) => parts && parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geo, p.mat, list.length);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      im.castShadow = !!p.shadow; im.receiveShadow = true;
      if (p.depth) im.customDepthMaterial = p.depth;
      im.count = 0; im.frustumCulled = false; im.name = p.name || '';
      root.add(im);
      return im;
    }));
    groups.push({ list, mats16, cols, lv, d2: dists.map((d) => d * d) });
  }
  const treeD = hi ? [42, 100] : [30, 75];
  const impLight = { value: new THREE.Color(1, 1, 1) }, impRTs = [], impQuad = _impQuad(); disposables.push(impQuad);
  const decimate = (geo, keepEvery, grow) => {
    const P = geo.attributes.position.array, Nn = geo.attributes.normal.array, Uv = geo.attributes.uv.array, Cc = geo.attributes.color.array;
    const md = new MD(); const cards = P.length / 12;
    for (let c = 0; c < cards; c++) {
      if (c % keepEvery) continue;
      let cx = 0, cy = 0, cz = 0; for (let v = 0; v < 4; v++) { cx += P[(c * 4 + v) * 3] / 4; cy += P[(c * 4 + v) * 3 + 1] / 4; cz += P[(c * 4 + v) * 3 + 2] / 4; }
      const b = md.count;
      for (let v = 0; v < 4; v++) { const k = c * 4 + v; md.v(cx + (P[k * 3] - cx) * grow, cy + (P[k * 3 + 1] - cy) * grow, cz + (P[k * 3 + 2] - cz) * grow, Nn[k * 3], Nn[k * 3 + 1], Nn[k * 3 + 2], Uv[k * 2], Uv[k * 2 + 1], Cc[k * 3], Cc[k * 3 + 1], Cc[k * 3 + 2]); }
      md.t(b, b + 1, b + 2); md.t(b, b + 2, b + 3);
    }
    return md.geo();
  };
  const simpleTrunk = (h, r) => { const md = new MD(); tube(md, [{ p: new V3(0, -0.3, 0), r }, { p: new V3(0, h * 0.5, 0), r: r * 0.7 }, { p: new V3(0, h, 0), r: r * 0.35 }], 3, { uScale: 1 }); return md.geo(); };
  for (let ki = 0; ki < kinds.length; ki++) for (let vi = 0; vi < VARIANTS; vi++) {
    const list = trees.filter((t) => t.ki === ki && t.vi === vi);
    if (!list.length) continue;
    const kind = kinds[ki].kind, v = kinds[ki].variants[vi];
    const parts = (tree, shadow) => tree.parts.map((p) => { const { m, depth } = getMat(p.mat, kind, tree.height); disposables.push(p.geo); return { geo: p.geo, mat: m, depth, shadow: shadow && p.mat !== 'strand', name: 'tree_' + kind }; });
    const imp = bakeImpostor(renderer, v.hi, getMat, kind, impLight);
    impRTs.push(imp.rt); disposables.push(imp.mat);
    addGroup(list, [parts(v.hi, true), parts(v.lo, false), [{ geo: impQuad, mat: imp.mat, name: 'tree_far_' + kind }]], treeD);
  }
  let lastLod = new V3(1e9, 0, 0);
  function refreshLod(p) {
    for (const g of groups) {
      const n = [0, 0, 0];
      for (let i = 0; i < g.list.length; i++) {
        const t = g.list[i];
        const dx = t.x - p.x, dz = t.z - p.z, d = dx * dx + dz * dz;
        const l = d < g.d2[0] ? 0 : d < g.d2[1] ? 1 : 2;
        const set = g.lv[l]; if (!set) continue;
        const k = n[l]++;
        for (const im of set) {
          im.instanceMatrix.array.set(g.mats16.subarray(i * 16, i * 16 + 16), k * 16);
          im.instanceColor.array.set(g.cols.subarray(i * 3, i * 3 + 3), k * 3);
        }
      }
      g.lv.forEach((set, l) => set && set.forEach((im) => { im.count = n[l]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }));
    }
  }

  // ---- grass (high quality only)
  let grass = null;
  if (hi && ctx.grass) grass = createGrass(renderer, ctx, U, disposables);
  if (grass) root.add(grass.mesh);

  // ---- flowers (only drawn near the player)
  if (ctx.flowers) { const f = createFlowers(ctx, rng, disposables); if (f.list.length) addGroup(f.list, [[{ geo: f.geo, mat: f.mat, name: 'flowers' }], null, null], [hi ? 70 : 45, 1e9]); }

  // ---- rocks (detailed + shadows near, simple far)
  const rk = createRocks(renderer, ctx, rng, disposables, free, occupy);
  rk.items.forEach((list, vi) => { if (list.length) addGroup(list, [[{ geo: rk.hi[vi], mat: rk.mat, shadow: true, name: 'rocks' }], [{ geo: rk.lo[vi], mat: rk.mat, name: 'rocks' }], [{ geo: rk.lo[vi], mat: rk.mat, name: 'rocks' }]], [hi ? 60 : 40, 1e9]); });

  scene.add(root);
  return {
    root, uniforms: U, trees,
    update(time, playerPos, camPos) {
      U.uTime.value = time;
      if (grass) grass.update(camPos, time);
      if (playerPos && playerPos.distanceToSquared(lastLod) > 64) { lastLod.copy(playerPos); refreshLod(playerPos); }
    },
    forceLod(p) { lastLod.copy(p); refreshLod(p); },
    setLight(c) { impLight.value.copy(c); },
    dispose() {
      scene.remove(root);
      disposables.forEach((d) => d.dispose()); impRTs.forEach((r) => r.dispose());
      Object.values(mats).forEach(({ m, depth }) => { m.dispose(); if (depth) depth.dispose(); });
      root.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    },
  };
}

// ------------------------------------------------------------------ grass
function createGrass(renderer, ctx, U, disposables) {
  const g = ctx.grass;
  const md = new MD(); const rng = new RNG(ctx.seed + 909);
  const blades = 4;
  for (let b = 0; b < blades; b++) {
    const ox = rng.range(-0.35, 0.35), oz = rng.range(-0.35, 0.35), a = rng.next() * Math.PI;
    const w = rng.range(0.05, 0.085), h = rng.range(0.5, 1.0), lean = rng.range(0.1, 0.35);
    const dx = Math.cos(a), dz = Math.sin(a), lx = -dz, lz = dx;
    const base = md.count;
    // base pair, mid pair, single tip vertex: 3 triangles per blade
    for (let s = 0; s <= 1; s++) {
      const f = s * 0.55, ww = w * (1 - f * 0.45), y = f * h, off = lean * f * f;
      const c = 0.25 + 0.75 * f * f * (2.0 - f);
      md.v(ox - dx * ww + lx * off, y, oz - dz * ww + lz * off, lx * 0.3, 1, lz * 0.3, 0, f, c, c, c);
      md.v(ox + dx * ww + lx * off, y, oz + dz * ww + lz * off, lx * 0.3, 1, lz * 0.3, 1, f, c, c, c);
    }
    md.v(ox + lx * lean, h, oz + lz * lean, lx * 0.3, 1, lz * 0.3, 0.5, 1, 1, 1, 1);
    md.t(base, base + 1, base + 2); md.t(base + 1, base + 3, base + 2); md.t(base + 2, base + 3, base + 4);
  }
  const src = md.geo();
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = src.index;
  for (const k of ['position', 'normal', 'uv', 'color']) geo.setAttribute(k, src.attributes[k]);
  const N = Math.round((g.count ?? 8000) * 0.6), tile = g.tile ?? 50;
  const off = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { off[i * 3] = rng.next() * tile; off[i * 3 + 1] = rng.next() * tile; off[i * 3 + 2] = rng.next(); }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.instanceCount = N;
  disposables.push(geo, src);
  const GU = {
    uCam: { value: new V3() }, uTile: { value: tile }, tAux: { value: ctx.auxTex }, tHeight: { value: ctx.hfTex }, uHField: { value: ctx.hField },
    tMacro: { value: bakeTexture(renderer, 'macro') }, uG1: { value: new THREE.Color(g.c1) }, uG2: { value: new THREE.Color(g.c2) }, uGH: { value: g.height ?? 1 },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GU, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec3 aOff; uniform vec3 uCam; uniform float uTile, uGH, uTime, uWindAmp; uniform vec3 uWindDir; uniform sampler2D tAux, tMacro; uniform vec3 uG1, uG2;
varying vec3 vGCol;
${GLSL_HEIGHT}`)
      .replace('#include <begin_vertex>', `
vec2 gb = aOff.xy + floor((uCam.xz - aOff.xy) / uTile + 0.5) * uTile;
float gd = distance(gb, uCam.xz);
float dens = texture2D(tAux, (gb + uHField.x) / (2.0 * uHField.x)).r;
float gsc = step(aOff.z, dens) * (1.0 - smoothstep(uTile * 0.3, uTile * 0.47, gd));
gsc *= smoothstep(1.0, 3.2, gd);   // blades right next to the camera shrink away so they never block the view
float ga = aOff.z * 43.7;
float cg = cos(ga), sg = sin(ga);
vec3 transformed = vec3(position.x * cg - position.z * sg, position.y * uGH * (0.7 + 0.6 * fract(aOff.z * 7.3)), position.x * sg + position.z * cg) * gsc;
vec4 gm = texture2D(tMacro, gb / 520.0);
float gust = sin(uTime * 1.7 + dot(gb, vec2(0.23, 0.19))) * 0.4 + texture2D(tMacro, gb * 0.004 + uTime * vec2(0.011, 0.004)).g - 0.3;
transformed.xz += uWindDir.xz * gust * uv.y * uv.y * (0.35 + uWindAmp) * gsc;
transformed += vec3(gb.x, terrainH(gb) - 0.04, gb.y);
vGCol = mix(uG1, uG2, smoothstep(0.32, 0.68, gm.g)) * (0.84 + 0.32 * gm.a);
float gcv = fract(aOff.z * 13.7);
vGCol *= 0.78 + 0.44 * fract(aOff.z * 5.3);
vGCol = mix(vGCol, vGCol * vec3(1.35, 1.15, 0.55), step(0.8, gcv) * 0.6);`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGCol;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vColor * vGCol * 1.05;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  mat.customProgramCacheKey = () => 'grass';
  disposables.push(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.name = 'grass';
  return { mesh, update(camPos) { if (camPos) GU.uCam.value.copy(camPos); } };
}

// ------------------------------------------------------------------ flowers
function createFlowers(ctx, rng, disposables) {
  const md = new MD();
  // stem
  tube(md, [{ p: new V3(0, -0.05, 0), r: 0.012 }, { p: new V3(0.01, 0.38, 0.01), r: 0.008 }], 3, { color: () => [0.25, 0.45, 0.15] });
  // petals (uv.y = 1 marks petals so instance colour only tints them)
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2; const b = md.count;
    const cx = Math.cos(a), sz = Math.sin(a);
    md.v(0, 0.38, 0, 0, 1, 0, 0.5, 1, 1, 1, 1);
    md.v(cx * 0.09 - sz * 0.035, 0.4, sz * 0.09 + cx * 0.035, 0, 1, 0, 0, 1, 1, 1, 1);
    md.v(cx * 0.11, 0.41, sz * 0.11, 0, 1, 0, 0.5, 1, 1, 1, 1);
    md.v(cx * 0.09 + sz * 0.035, 0.4, sz * 0.09 - cx * 0.035, 0, 1, 0, 1, 1, 1, 1, 1);
    md.t(b, b + 1, b + 2); md.t(b, b + 2, b + 3);
  }
  const geo = md.geo(); disposables.push(geo);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', 'vColor = color;\n#ifdef USE_INSTANCING_COLOR\nif (uv.y > 0.5) vColor *= instanceColor;\n#endif');
  };
  mat.customProgramCacheKey = () => 'flower';
  disposables.push(mat);
  const palette = ctx.flowers.colors.map((c) => new THREE.Color(c));
  const N = Math.round(ctx.flowers.count * (ctx.quality === 'high' ? 1 : 0.5));
  const list = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3();
  let tries = 0;
  const patch = makeSimplex(ctx.seed + 77);
  while (list.length < N && tries < N * 30) {
    tries++;
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * ctx.radius;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (patch(x * 0.02, z * 0.02) < 0.25) continue;
    if (ctx.grassDensity(x, z) < 0.6 || ctx.blocked(x, z, 1)) continue;
    const y = ctx.groundAt(x, z);
    q.setFromAxisAngle(UP, rng.next() * 6.28); s.setScalar(rng.range(0.8, 1.6)); p.set(x, y, z);
    const ci = Math.floor(Math.abs(patch(x * 0.05 + 3, z * 0.05)) * palette.length * 1.999) % palette.length;
    const c = palette[ci];
    list.push({ x, z, m: new THREE.Matrix4().compose(p, q, s), col: [c.r, c.g, c.b] });
  }
  return { geo, mat, list };
}

// ------------------------------------------------------------------ rocks
function rockGeometry(seed, flat, detail = 2) {
  const n1 = makeSimplex(seed), n2 = makeSimplex(seed + 1);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const rng = new RNG(seed);
  const sx = rng.range(0.8, 1.3), sy = flat ? rng.range(0.3, 0.45) : rng.range(0.55, 0.85), sz = rng.range(0.8, 1.2);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = n1(x * 1.3 + z * 0.7, y * 1.3) * 0.5 + n2(z * 1.1, x * 1.1 - y) * 0.5;
    const r = 1 + n * 0.22 + n1(x * 4, z * 4 + y * 2) * 0.05;
    // planar facets for a chiselled look
    x *= r * sx; y *= r * sy; z *= r * sz;
    if (y < -0.25 * sy) y = -0.25 * sy + (y + 0.25 * sy) * 0.15;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2), col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    let u, v; if (ny > nx && ny > nz) { u = x; v = z; } else if (nx > nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * 0.35; uv[i * 2 + 1] = v * 0.35;
    const ao = 0.45 + 0.55 * Math.min(1, Math.max(0, (y / sy + 0.3) * 0.9 + 0.2));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function createRocks(renderer, ctx, rng, disposables, free, occupy) {
  const rc = ctx.rocks; if (!rc) return { items: [], hi: [], lo: [], mat: null };
  const mat = packedMaterial(renderer, { tex: 'rock', color: new THREE.Color(rc.color || ctx.biome.ground.rock).multiplyScalar(1.15), roughness: 0.92, vertexColors: true, normalScale: 1.4,
    luma: [0.5, 1.4], uvScale: 1, topColor: rc.top || '#5a7a35', topAmt: rc.topAmt ?? 0, instanced: true });
  disposables.push(mat);
  const geos = [rockGeometry(ctx.seed + 1, false), rockGeometry(ctx.seed + 2, false), rockGeometry(ctx.seed + 3, true), rockGeometry(ctx.seed + 4, false)];
  const geosLo = [rockGeometry(ctx.seed + 1, false, 1), rockGeometry(ctx.seed + 2, false, 1), rockGeometry(ctx.seed + 3, true, 1), rockGeometry(ctx.seed + 4, false, 1)];
  geosLo.forEach((g) => disposables.push(g));
  geos.forEach((g) => disposables.push(g));
  const items = [[], [], [], []];
  const add = (x, z, s, sink = 0.25) => {
    const y = ctx.groundAt(x, z);
    const vi = rng.int(0, 3);
    items[vi].push({ x, y: y - s * sink, z, s, rot: rng.next() * 6.28, tilt: rng.range(-0.25, 0.25) });
    if (Math.hypot(x, z) < ctx.radius + 10 && s > 0.7) ctx.colliders.circles.push({ x, z, r: s * 0.95 });
  };
  const N = Math.round((rc.count ?? 220) * (ctx.quality === 'high' ? 1 : 0.6));
  let tries = 0, k = 0;
  while (k < N && tries < N * 20) {
    tries++;
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * (rc.maxR ?? ctx.radius + 60);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const y = ctx.groundAt(x, z);
    if (ctx.liquidLevel !== null && y < ctx.liquidLevel - (rc.underwater ? 3 : -0.2)) continue;
    if (ctx.blocked(x, z, 3)) continue;
    const big = rng.chance(rc.bigChance ?? 0.25);
    const s = big ? rng.range(1.2, rc.bigMax ?? 3.2) : rng.range(0.25, 0.9);
    if (!free(x, z, s * 1.1)) continue;
    occupy(x, z, s);
    add(x, z, s);
    // little companions around big ones
    if (big) for (let j = 0; j < 2; j++) { const aa = rng.next() * 6.28, dd = s * rng.range(1.0, 1.8); add(x + Math.cos(aa) * dd, z + Math.sin(aa) * dd, rng.range(0.2, 0.6)); }
    k++;
  }
  // big cliff chunks outside the playable circle
  if (rc.rim) for (let i = 0; i < rc.rim; i++) {
    const a = rng.next() * Math.PI * 2, d = ctx.radius + rng.range(15, 120);
    const rx = Math.cos(a) * d, rz = Math.sin(a) * d; if (ctx.slopeAt(rx, rz) > 0.55) continue;
    add(rx, rz, rng.range(3, 7), 0.5);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new V3(), p = new V3();
  items.forEach((list) => list.forEach((r) => { e.set(r.tilt, r.rot, r.tilt * 0.5); q.setFromEuler(e); s.setScalar(r.s); p.set(r.x, r.y, r.z); r.m = new THREE.Matrix4().compose(p, q, s); }));
  return { items, hi: geos, lo: geosLo, mat };
}
