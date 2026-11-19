// friendly.js - the friendly people of Home Base and the planets (FRIENDLY_NPCS in data.js).
// friendlySpec(kind, outfit, seed) -> look (L) incl. props baked into the one skinned mesh (props in hands are
// weighted to the hand bones, so they follow every arm animation); applyFriendly(rig, spec) adds held-item poses,
// cheap idle flavour (bard strums, smith hammers, elder leans on the cane...) and bow / staff attacks.
import * as THREE from 'three';
import { rng, hashStr, shade, mixc, col, hexOf, tube, blob, rbox, sphere, torus, cone, cylinder, lathe, param, twoSided, toFlat, lerp, clamp, smooth, sstep, TAU } from './rigkit.js';
import { headCap, torsoFrontZ, torsoW, hcV } from './human.js';
import { poseKit } from './humanAnim.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const SKINS = ['#f3d2bd', '#f1c9a5', '#e8b996', '#e0ac85', '#c68a5e', '#a8704a', '#8d5a3b', '#6b4430'];
const HAIRS = ['#1a1410', '#2a1a10', '#5a3a1a', '#8a5a2a', '#c9a050', '#a8461d', '#3a2a20', '#d8b070'];
const EYES = ['#5a3a22', '#2a1a10', '#3a6aa8', '#3f7a3a', '#6a7a88', '#7a5a2a'];
const pick = (r, a) => a[Math.floor(r() * a.length)];
const seg = (a, b, r0, r1, n = 6) => tube([a, a.clone().lerp(b, 0.5), b], (t) => lerp(r0, r1, t), n);
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function matDir(pos, dir, scl = 1) {
  _q.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
  if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  return new THREE.Matrix4().compose(_p.copy(pos), _q, _s);
}
// grip point of a fist (bind pose); held things run along the hand's +Z axis
function grip(B, D, S) { const sd = S === 'L' ? 1 : -1, s = D.s; return B.bpos('hand' + S).add(V3(-sd * 0.02 * s, -0.088 * s, 0.004 * s)); }
function pole(B, D, S, below, above, r, o) {
  const g = grip(B, D, S), s = D.s;
  B.add(seg(g.clone().add(V3(0, 0, -below * s)), g.clone().add(V3(0, 0, above * s)), r * s, r * s * 0.9, 6), { cell: 'bark', color: '#6a4a2a', ...o, bone: 'hand' + S });
  return g;
}
const WOOD = { cell: 'bark', color: '#7a5434', tile: 0.3 }, METAL = { cell: 'metal', color: '#b8bcc4', metal: 1, rough: 0.3 }, GOLD = { cell: 'metal', color: '#d9b04a', metal: 1, rough: 0.25 };

// ------------------------------------------------------------------ hats & head things (weighted to the head)
const H = (B) => ({ bone: 'head' });
function hatChef(B, D) {
  const s = D.s, hc = hcV(D), o = { cell: 'cloth', color: '#f6f4ee', bone: 'head' };
  B.add(cylinder(0.098 * s, 0.104 * s, 0.07 * s, 16, 1), { ...o, pos: [hc.x, hc.y + 0.06 * s, hc.z - 0.01 * s], rot: [-0.12, 0, 0] });
  B.add(blob(0.13 * s, 0.09 * s, 0.125 * s, 1, 1, 14, 8, (p) => { p.multiplyScalar(1 + 0.06 * Math.sin(Math.atan2(p.x, p.z) * 6)); }), { ...o, pos: [hc.x, hc.y + 0.19 * s, hc.z - 0.025 * s] });
}
function hatTop(B, D, c = '#1c1c22') {
  const s = D.s, hc = hcV(D), o = { cell: 'wool', color: c, bone: 'head' };
  B.add(cylinder(0.16 * s, 0.16 * s, 0.012 * s, 18, 1), { ...o, pos: [hc.x, hc.y + 0.075 * s, hc.z], rot: [-0.08, 0, 0] });
  B.add(lathe([[0, 0], [0.09 * s, 0], [0.092 * s, 0.17 * s], [0.0, 0.172 * s]], 16), { ...o, pos: [hc.x, hc.y + 0.08 * s, hc.z - 0.005 * s], rot: [-0.08, 0, 0] });
  B.add(cylinder(0.093 * s, 0.093 * s, 0.025 * s, 16, 1), { cell: 'cloth', color: '#8a1a22', pos: [hc.x, hc.y + 0.09 * s, hc.z - 0.006 * s], rot: [-0.08, 0, 0], bone: 'head' });
}
function hatWizard(B, D, c, star) {
  const s = D.s, hc = hcV(D);
  B.add(cylinder(0.19 * s, 0.19 * s, 0.01 * s, 20, 1), { cell: 'wool', color: c, pos: [hc.x, hc.y + 0.07 * s, hc.z], rot: [-0.06, 0, 0], bone: 'head' });
  const pts = [V3(hc.x, hc.y + 0.07 * s, hc.z), V3(hc.x, hc.y + 0.2 * s, hc.z - 0.02 * s), V3(hc.x, hc.y + 0.33 * s, hc.z - 0.07 * s), V3(hc.x, hc.y + 0.4 * s, hc.z - 0.15 * s)];
  B.add(tube(pts, (t) => lerp(0.1, 0.008, Math.pow(t, 0.8)) * s, 12), { cell: 'wool', color: c, bone: 'head' });
  if (star) B.add(new THREE.OctahedronGeometry(0.022 * s, 0), { pos: [hc.x, hc.y + 0.2 * s, hc.z + 0.065 * s], cell: 'gloss', color: star, glow: 2, bone: 'head' });
}
function hatFeather(B, D, c, fc) {
  const s = D.s, hc = hcV(D);
  B.add(blob(0.115 * s, 0.045 * s, 0.12 * s, 1, 1, 14, 8), { cell: 'wool', color: c, pos: [hc.x + 0.01 * s, hc.y + 0.085 * s, hc.z - 0.005 * s], rot: [-0.1, 0, -0.15], bone: 'head' });
  B.add(tube([V3(hc.x + 0.08 * s, hc.y + 0.09 * s, hc.z), V3(hc.x + 0.13 * s, hc.y + 0.18 * s, hc.z - 0.08 * s), V3(hc.x + 0.12 * s, hc.y + 0.26 * s, hc.z - 0.2 * s)], (t) => lerp(0.006, 0.025, Math.sin(t * PI)) * s + 0.002, 5, { flatten: 0.2 }), { cell: 'fur', color: fc, bone: 'head' });
}
function hatPith(B, D) {
  const s = D.s, hc = hcV(D), o = { cell: 'cloth', color: '#d8c89a', bone: 'head' };
  B.add(blob(0.11 * s, 0.09 * s, 0.12 * s, 1, 1, 14, 8, (p) => { if (p.y < 0) p.y = 0; }), { ...o, pos: [hc.x, hc.y + 0.05 * s, hc.z] });
  B.add(cylinder(0.18 * s, 0.17 * s, 0.012 * s, 18, 1), { ...o, color: '#c8b888', pos: [hc.x, hc.y + 0.045 * s, hc.z], rot: [-0.06, 0, 0] });
  B.add(cylinder(0.112 * s, 0.112 * s, 0.022 * s, 16, 1), { cell: 'cloth', color: '#5a4a30', pos: [hc.x, hc.y + 0.06 * s, hc.z], bone: 'head' });
}
function hatHard(B, D) {
  const s = D.s, hc = hcV(D), o = { cell: 'plain', color: '#e8b830', rough: 0.4, bone: 'head' };
  B.add(blob(0.11 * s, 0.09 * s, 0.12 * s, 1, 1, 14, 8, (p) => { if (p.y < 0) p.y = 0; }), { ...o, pos: [hc.x, hc.y + 0.04 * s, hc.z] });
  B.add(cylinder(0.135 * s, 0.13 * s, 0.01 * s, 16, 1), { ...o, pos: [hc.x, hc.y + 0.035 * s, hc.z + 0.01 * s] });
  B.add(cylinder(0.022 * s, 0.025 * s, 0.03 * s, 10, 1), { ...METAL, pos: [hc.x, hc.y + 0.08 * s, hc.z + 0.115 * s], rot: [PI / 2, 0, 0], bone: 'head' });
  B.add(sphere(0.02 * s, 8, 6), { pos: [hc.x, hc.y + 0.08 * s, hc.z + 0.145 * s], scl: [1, 1, 0.4], cell: 'gloss', color: '#fff2b0', glow: 3, bone: 'head' });
}
function headband(B, D, c) {
  const s = D.s, hc = hcV(D);
  B.add(torus(0.088 * s, 0.009 * s, 18, 4), { pos: [hc.x, hc.y + 0.045 * s, hc.z - 0.004 * s], rot: [PI / 2 - 0.15, 0, 0], scl: [1.0, 1.15, 1], cell: 'cloth', color: c, bone: 'head' });
  for (const sd of [-1, 1]) B.add(tube([V3(hc.x, hc.y + 0.03 * s, hc.z - 0.11 * s), V3(hc.x + sd * 0.03 * s, hc.y - 0.03 * s, hc.z - 0.15 * s), V3(hc.x + sd * 0.04 * s, hc.y - 0.09 * s, hc.z - 0.14 * s)], 0.008 * s, 4, { flatten: 0.3 }), { cell: 'cloth', color: c, bone: 'head' });
}
function headScarf(B, D, c) {
  const s = D.s, hc = hcV(D);
  B.add(headCap(D, { vol: 0.022, front: 0.4, side: -0.15, back: -0.55, nu: 18, nv: 7 }), { cell: 'cloth', color: c, bone: 'head' });
  B.add(blob(0.02 * s, 0.016 * s, 0.016 * s, 1, 1, 6, 4), { pos: [hc.x, hc.y - 0.03 * s, hc.z - 0.11 * s], cell: 'cloth', color: shade(c, 0.85), bone: 'head' });
  for (const sd of [-1, 1]) B.add(tube([V3(hc.x, hc.y - 0.03 * s, hc.z - 0.11 * s), V3(hc.x + sd * 0.025 * s, hc.y - 0.09 * s, hc.z - 0.13 * s), V3(hc.x + sd * 0.03 * s, hc.y - 0.15 * s, hc.z - 0.12 * s)], (t) => lerp(0.012, 0.018, t) * s, 4, { flatten: 0.25 }), { cell: 'cloth', color: c, bone: 'head' });
}
function glasses(B, D) {
  const s = D.s, hc = hcV(D);
  for (const sd of [-1, 1]) B.add(torus(0.017 * s, 0.0025 * s, 12, 3), { pos: [hc.x + sd * 0.032 * s, hc.y + 0.008 * s, hc.z + 0.095 * s], cell: 'metal', color: '#3a2a1a', metal: 0.6, bone: 'head' });
  B.add(seg(V3(hc.x - 0.015 * s, hc.y + 0.012 * s, hc.z + 0.098 * s), V3(hc.x + 0.015 * s, hc.y + 0.012 * s, hc.z + 0.098 * s), 0.0025 * s, 0.0025 * s, 3), { cell: 'metal', color: '#3a2a1a', bone: 'head' });
}
// ------------------------------------------------------------------ carried / worn props
function backpack(B, D, big) {
  const s = D.s, w = torsoW(B, D);
  const z = -0.13 * D.z - (big ? 0.12 : 0.07) * s;
  B.add(rbox((big ? 0.32 : 0.24) * s, (big ? 0.46 : 0.28) * s, (big ? 0.22 : 0.14) * s, 0.3, 10, 8), { pos: [0, (big ? 1.18 : 1.22) * s, z], cell: 'leather', color: big ? '#6a5030' : '#7a6a48', w });
  B.add(rbox((big ? 0.26 : 0.18) * s, (big ? 0.14 : 0.1) * s, 0.04 * s, 0.35, 8, 6), { pos: [0, (big ? 1.06 : 1.14) * s, z - (big ? 0.12 : 0.08) * s], cell: 'leather', color: '#5a4024', w });
  if (big) {
    B.add(cylinder(0.065 * s, 0.065 * s, 0.4 * s, 12, 1), { pos: [-0.2 * s, 1.45 * s, z], rot: [0, 0, PI / 2], cell: 'wool', color: '#7a3a2a', w });
    B.add(lathe([[0, 0], [0.05 * s, 0.005 * s], [0.06 * s, 0.07 * s], [0.055 * s, 0.075 * s]], 10), { pos: [0.19 * s, 0.98 * s, z], rot: [0, 0, 0.2], ...METAL, color: '#6a6a70', w });
  }
  for (const sd of [-1, 1]) B.add(tube([V3(sd * 0.1 * s, 1.44 * s, -0.08 * s), V3(sd * 0.11 * s, 1.47 * s, 0.05 * s), V3(sd * 0.1 * s, 1.3 * s, torsoFrontZ(D, {}, 1.3, 0.025 * s))], 0.012 * s, 4, { flatten: 0.3 }), { cell: 'leather', color: '#4a3020', w });
}
function quiver(B, D) {
  const s = D.s, w = torsoW(B, D);
  const base = V3(0.08 * s, 1.08 * s, -0.17 * s), top = V3(-0.1 * s, 1.5 * s, -0.17 * s);
  B.add(seg(base, top, 0.055 * s, 0.06 * s, 10), { cell: 'leather', color: '#6a4424', w });
  for (let i = 0; i < 4; i++) {
    const o = V3((i % 2 ? 0.02 : -0.02) * s, 0, (i < 2 ? 0.015 : -0.015) * s);
    const a = top.clone().add(o), b = a.clone().add(top.clone().sub(base).normalize().multiplyScalar(0.14 * s));
    B.add(seg(a, b, 0.005 * s, 0.005 * s, 3), { cell: 'bark', color: '#a8865a', w });
    B.add(cone(0.018 * s, 0, 0.05 * s, 3), { m: matDir(b, top.clone().sub(base), [1, 1, 0.2]), cell: 'cloth', color: i % 2 ? '#e8e0d0' : '#c84a3a', w });
  }
  B.add(tube([V3(0.1 * s, 1.1 * s, -0.12 * s), V3(0.05 * s, 1.3 * s, torsoFrontZ(D, {}, 1.3, 0.02 * s)), V3(-0.12 * s, 1.47 * s, 0.02 * s)], 0.011 * s, 4, { flatten: 0.3 }), { cell: 'leather', color: '#4a3020', w });
}
function bowL(B, D) {
  const s = D.s, g = grip(B, D, 'L');
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8 * 2 - 1; pts.push(V3(g.x, g.y - (1 - t * t) * 0.12 * s + 0.0, g.z + t * 0.55 * s)); }
  B.add(tube(pts, (t) => (0.012 + 0.008 * (1 - Math.abs(t * 2 - 1))) * s, 5), { cell: 'bark', color: '#7a4a24', bone: 'handL' });
  B.add(seg(pts[0], pts[8], 0.0025 * s, 0.0025 * s, 3), { cell: 'plain', color: '#e8e0c8', bone: 'handL' });
}
function shieldL(B, D, c, emblem) {
  const s = D.s, sd = 1;
  const p = B.bpos('farmL').lerp(B.bpos('handL'), 0.45).add(V3(0.055 * s, 0, 0.0));
  const g = blob(0.025 * s, 0.25 * s, 0.19 * s, 0.6, 0.8, 12, 10, (q) => { if (q.y < 0) { const k = -q.y / (0.25 * s); q.z *= 1 - 0.6 * k * k; } q.x += Math.abs(q.z) * 0.15; });
  B.add(g, { pos: [p.x, p.y - 0.02 * s, p.z + 0.02 * s], cell: 'plate', color: c, metal: 0.4, rough: 0.4, bone: 'farmL' });
  B.add(blob(0.012 * s, 0.07 * s, 0.06 * s, 1, 1, 8, 6), { pos: [p.x + 0.026 * s, p.y + 0.02 * s, p.z + 0.02 * s], ...GOLD, color: emblem, bone: 'farmL' });
}
function lanternL(B, D) {
  const s = D.s, g = grip(B, D, 'L');
  const c = g.clone().add(V3(0, -0.17 * s, 0));
  B.add(torus(0.035 * s, 0.004 * s, 10, 3), { pos: [g.x, g.y - 0.03 * s, g.z], rot: [0, PI / 2, 0], ...METAL, color: '#3a3a40', bone: 'handL' });
  B.add(rbox(0.09 * s, 0.13 * s, 0.09 * s, 0.3, 8, 8), { pos: [c.x, c.y, c.z], cell: 'gloss', color: '#ffd27a', glow: 2.6, rough: 0.2, bone: 'handL' });
  for (const y of [-0.075, 0.075]) B.add(rbox(0.11 * s, 0.02 * s, 0.11 * s, 0.3, 6, 4), { pos: [c.x, c.y + y * s, c.z], ...METAL, color: '#2a2a30', bone: 'handL' });
  B.add(cone(0.045 * s, 0.01 * s, 0.05 * s, 8), { pos: [c.x, c.y + 0.085 * s, c.z], ...METAL, color: '#2a2a30', bone: 'handL' });
}
function hangL(B, D, geo, o, drop = 0.12) { const s = D.s, g = grip(B, D, 'L'); B.add(geo, { ...o, pos: [g.x, g.y - drop * s, g.z], bone: 'handL' }); return g; }
function spearR(B, D, len = 1.9) {
  const s = D.s, g = pole(B, D, 'R', 0.55, len - 0.55, 0.016, WOOD);
  B.add(toFlat(cone(0.03 * s, 0, 0.18 * s, 4)), { pos: [g.x, g.y, g.z + (len - 0.55) * s], rot: [PI / 2, 0, 0], scl: [1, 1, 0.35], ...METAL, bone: 'handR' });
  return g;
}
function staffR(B, D, gem) {
  const s = D.s, g = pole(B, D, 'R', 0.5, 1.15, 0.018, WOOD);
  const top = g.clone().add(V3(0, 0, 1.15 * s));
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; B.add(tube([top.clone(), top.clone().add(V3(Math.sin(a) * 0.04 * s, Math.cos(a) * 0.04 * s, 0.05 * s)), top.clone().add(V3(Math.sin(a) * 0.02 * s, Math.cos(a) * 0.02 * s, 0.11 * s))], 0.008 * s, 4), { ...WOOD, bone: 'handR' }); }
  if (gem) B.add(toFlat(new THREE.OctahedronGeometry(0.045 * s, 0)), { pos: [top.x, top.y, top.z + 0.07 * s], scl: [0.8, 0.8, 1.3], cell: 'gloss', color: gem, glow: 2.8, bone: 'handR' });
  else B.add(sphere(0.035 * s, 8, 6), { pos: [top.x, top.y, top.z + 0.02 * s], ...WOOD, bone: 'handR' });
  return top;
}
function scrollRoll(B, D, S, len = 0.28) {
  const s = D.s, g = grip(B, D, S);
  B.add(seg(g.clone().add(V3(0, 0, -len * 0.4 * s)), g.clone().add(V3(0, 0, len * 0.6 * s)), 0.032 * s, 0.032 * s, 8), { cell: 'plain', color: '#efe2bd', bone: 'hand' + S });
  B.add(torus(0.027 * s, 0.005 * s, 10, 3), { pos: [g.x, g.y, g.z + 0.05 * s], cell: 'cloth', color: '#a82a2a', bone: 'hand' + S });
}

// ------------------------------------------------------------------ kinds
const FRIENDLY = {
  healer: (r, o) => ({ L: { top: o || '#f0eee4', skirt: 0.12, flare: 0.45, trim: '#4a9a5a', collar: '#4a9a5a', cuff: '#4a9a5a', sash: '#4a9a5a', satchel: '#5a7a34', bottom: '#d8d4c4', boots: '#6a5034' },
    props: (B, D) => { const s = D.s, fz = torsoFrontZ(D, {}, 1.32, 0.028 * s), w = torsoW(B, D);
      B.add(rbox(0.018 * s, 0.07 * s, 0.01 * s, 0.4, 4, 6), { pos: [0.07 * s, 1.32 * s, fz], cell: 'gloss', color: '#5ae07a', glow: 1.2, w });
      B.add(rbox(0.07 * s, 0.018 * s, 0.01 * s, 0.4, 6, 4), { pos: [0.07 * s, 1.32 * s, fz], cell: 'gloss', color: '#5ae07a', glow: 1.2, w });
      for (let i = 0; i < 4; i++) B.add(blob(0.012 * s, 0.03 * s, 0.006 * s, 1, 1, 6, 4), { pos: [(-0.2 + i * 0.012) * D.x, 1.03 * s, 0.03 * s + i * 0.005], rot: [0, 0, -0.4 + i * 0.25], cell: 'plain', color: '#4a9a3a', w }); },
    idle: 'calm' }),
  guide: (r, o) => ({ L: { top: o || '#6a5a3a', cape: '#3a4a5a', capeLen: 0.5, bottom: '#4a4034', boots: '#4a3020', hat: r() < 0.5 ? 'brim' : null, hatColor: '#4a3a2a' },
    props: (B, D) => { staffR(B, D, null); scrollRoll(B, D, 'L', 0.42); }, holdR: 'upright', holdL: 'hang' }),
  smith: (r, o) => ({ L: { top: o || '#7a5a3a', sleeves: 'none', apron: '#3a2818', gloves: '#2a1c12', bottom: '#3a3028', boots: '#2a1c12', beard: r() < 0.6 ? 'full' : false, belly: 0.3 }, build: 'broad', wide: 1.14, armR: 1.22, height: 1.8,
    props: (B, D) => { const s = D.s, g = pole(B, D, 'R', 0.06, 0.4, 0.018, WOOD); B.add(rbox(0.16 * s, 0.075 * s, 0.085 * s, 0.25, 8, 6), { pos: [g.x, g.y, g.z + 0.41 * s], ...METAL, color: '#9a9ea8', bone: 'handR' }); },
    idle: 'hammer' }),
  brewer: (r, o) => ({ L: { top: o || '#6a3a6a', apron: '#d8c8a0', goggles: true, bottom: '#3a3040', boots: '#3a2818', pouch: false },
    props: (B, D) => { const s = D.s, w = torsoW(B, D);
      ['#ff4a5a', '#4a8aff', '#5ae07a'].forEach((pc, i) => { const x = (0.08 + i * 0.05) * D.x, z = torsoFrontZ(D, {}, 0.97, 0.04 * s) - i * 0.02 * s - 0.01;
        B.add(sphere(0.026 * s, 8, 6), { pos: [x, 0.93 * s, z], cell: 'gloss', color: pc, glow: 0.7, rough: 0.1, w });
        B.add(cylinder(0.01 * s, 0.009 * s, 0.03 * s, 6, 1), { pos: [x, 0.95 * s, z], cell: 'gloss', color: '#d8f0f0', w });
        B.add(cylinder(0.011 * s, 0.011 * s, 0.012 * s, 6, 1), { pos: [x, 0.98 * s, z], cell: 'bark', color: '#8a6a40', w }); });
      const g = grip(B, D, 'R'); B.add(sphere(0.035 * s, 8, 6), { pos: [g.x, g.y, g.z + 0.04 * s], cell: 'gloss', color: '#b07aff', glow: 1.0, rough: 0.1, bone: 'handR' }); },
    holdR: 'flask' }),
  sage: (r, o) => ({ L: { top: o || '#3a4a8a', skirt: 0.07, flare: 0.45, trim: '#c9a54a', collar: '#c9a54a', hair: '#e8e4dc', hairStyle: 'long', hairLen: 1.32, beard: 'big', boots: '#3a3040', bottom: '#2a2a40' }, height: 1.74,
    props: (B, D) => { const s = D.s, w = (p) => [B.idx('chest'), 1], fz = torsoFrontZ(D, {}, 1.18, 0.02 * s);
      B.add(rbox(0.17 * s, 0.035 * s, 0.22 * s, 0.25, 8, 6), { pos: [0, 1.16 * s, fz + 0.15 * s], rot: [0.35, 0, 0], cell: 'leather', color: '#8a2a2a', w });
      B.add(rbox(0.16 * s, 0.03 * s, 0.205 * s, 0.2, 8, 6), { pos: [0, 1.175 * s, fz + 0.155 * s], rot: [0.35, 0, 0], cell: 'plain', color: '#f0e8d0', w }); },
    idle: 'book', carry: true }),
  guard: (r, o) => ({ L: { hairStyle: 'helmet', helmetColor: '#a8b0b8', plume: o || '#2e4fa3', tabard: o || '#2e4fa3', emblem: '#d9b04a', top: '#6a7078', bottom: '#4a4a50', gloves: '#4a3a2a', boots: '#3a2a1a' }, build: 'broad', height: 1.84, armor: { id: 'chain', color: '#9aa0a8' },
    props: (B, D) => { spearR(B, D, 2.1); shieldL(B, D, o || '#2e4fa3', '#d9b04a'); }, holdR: 'upright', holdL: 'shield' }),
  cook: (r, o) => ({ L: { top: o || '#f2f0ea', apron: '#ffffff', bottom: '#3a3a44', belly: 0.6, boots: '#2a2a2a', smile: 0.008, blushK: 0.2, collar: '#c84a3a' }, build: 'broad',
    props: (B, D) => { hatChef(B, D); const s = D.s, g = pole(B, D, 'R', 0.05, 0.36, 0.008, METAL); B.add(sphere(0.045 * s, 10, 6), { pos: [g.x, g.y, g.z + 0.4 * s], scl: [1, 0.55, 1], ...METAL, bone: 'handR' }); },
    idle: 'stir' }),
  bard: (r, o) => ({ L: { top: o || '#a03a5a', sleeveColor: '#e8c050', bottom: '#3a2a4a', boots: '#5a3a24', cape: '#5a2a6a', capeLen: 0.75, collar: '#e8c050', smile: 0.008 },
    props: (B, D) => { hatFeather(B, D, '#3a2a5a', '#5ad0ff'); const s = D.s, w = (p) => [B.idx('spine'), 1], fz = torsoFrontZ(D, {}, 1.12, 0.02 * s);
      const c0 = V3(0.05 * s, 1.06 * s, fz + 0.07 * s);
      B.add(blob(0.13 * s, 0.17 * s, 0.05 * s, 1, 1, 12, 8), { pos: c0.toArray(), rot: [0, 0, -0.95], ...WOOD, color: '#b07840', w });
      B.add(sphere(0.035 * s, 8, 6), { pos: [c0.x - 0.02 * s, c0.y + 0.015 * s, c0.z + 0.04 * s], scl: [1, 1, 0.2], cell: 'gloss', color: '#2a1a10', w });
      const n1 = c0.clone().add(V3(-0.13 * s, 0.1 * s, 0.01 * s)), n2 = c0.clone().add(V3(-0.33 * s, 0.25 * s, 0.01 * s));
      B.add(seg(n1, n2, 0.018 * s, 0.015 * s, 5), { ...WOOD, color: '#5a3a20', w });
      B.add(rbox(0.05 * s, 0.07 * s, 0.025 * s, 0.3, 6, 6), { pos: n2.clone().add(V3(-0.02 * s, 0.03 * s, 0)).toArray(), rot: [0, 0, 0.9], ...WOOD, color: '#5a3a20', w }); },
    idle: 'strum', carry: true }),
  mapmaker: (r, o) => ({ L: { top: o || '#5a6a4a', bottom: '#4a4034', boots: '#4a3020', satchel: '#7a5a34', hairStyle: r() < 0.5 ? 'short' : 'bun' },
    props: (B, D) => { glasses(B, D); const s = D.s, hc = hcV(D), w = (p) => [B.idx('chest'), 1], fz = torsoFrontZ(D, {}, 1.22, 0.02 * s);
      const g = param(8, 4, (u, v, ot) => { ot.set(lerp(-0.22, 0.22, u) * s, (1.08 + v * 0.24) * s, fz + (0.2 - v * 0.08) * s + 0.02 * Math.sin(u * PI) * s); }, { wrap: false, flip: true, lu: 0.4, lv: 0.3 });
      for (const p of twoSided(g, 0.003 * s)) B.add(p, { cell: 'plain', color: '#efe2bd', w, colorFn: (pp, n, cc) => (Math.sin(pp.x * 90) > 0.85 || Math.sin(pp.y * 70) > 0.9 ? cc.multiplyScalar(0.7) : cc) });
      for (const sd of [-1, 1]) B.add(cylinder(0.018 * s, 0.018 * s, 0.27 * s, 8, 1), { pos: [sd * 0.23 * s, 1.07 * s, fz + 0.205 * s], rot: [0.32, 0, 0], ...WOOD, w });
      B.add(cone(0.004 * s, 0, 0.12 * s, 4), { pos: [hc.x + 0.085 * s, hc.y + 0.02 * s, hc.z - 0.01 * s], rot: [-0.6, 0, -0.3], cell: 'plain', color: '#f8f8f8', bone: 'head' }); },
    idle: 'scroll', carry: true }),
  portalkeeper: (r, o) => ({ L: { top: o || '#3a2a6a', skirt: 0.07, flare: 0.45, trim: '#7af0ff', collar: '#7af0ff', cuff: '#7af0ff', stars: true, starColor: '#7af0ff', hood: o ? hexOf(shade(o, 0.8)) : '#2a1e52', hairStyle: 'hood', boots: '#2a2040', bottom: '#2a2040' },
    bones: (B, D) => { const g = grip(B, D, 'R'); B.bone('orb', 'handR', g.x, g.y, g.z + 1.32 * D.s); },
    props: (B, D) => { const s = D.s; staffR(B, D, null); const t = B.bpos('orb');
      B.add(sphere(0.07 * s, 12, 8), { pos: t.toArray(), cell: 'gloss', color: '#7af0ff', glow: 3, bone: 'orb' });
      B.add(torus(0.1 * s, 0.006 * s, 18, 3), { pos: t.toArray(), rot: [0.6, 0, 0.3], cell: 'gloss', color: '#c8a0ff', glow: 2.2, bone: 'orb' }); },
    holdR: 'upright', orb: true }),
  fortune: (r, o) => ({ L: { top: o || '#7a2a6a', skirt: 0.1, flare: 0.5, skirtColor: '#3a2a6a', trim: '#e8c050', hairStyle: 'long', boots: '#4a2a3a', bottom: '#3a2a4a', lip: '#b04a6a' }, build: 'slim',
    props: (B, D) => { headScarf(B, D, '#c8304a'); const s = D.s, hc = hcV(D);
      for (const sd of [-1, 1]) B.add(torus(0.012 * s, 0.003 * s, 8, 3), { pos: [hc.x + sd * 0.085 * s, hc.y - 0.035 * s, hc.z], rot: [0, PI / 2, 0], ...GOLD, bone: 'head' });
      const fz = torsoFrontZ(D, {}, 1.08, 0.02 * s);
      B.add(sphere(0.085 * s, 14, 10), { pos: [0, 1.09 * s, fz + 0.17 * s], cell: 'gloss', color: '#b8a0ff', glow: 0.9, rough: 0.05, metal: 0.2, w: (p) => [B.idx('spine'), 1] });
      B.add(sphere(0.035 * s, 8, 6), { pos: [0, 1.09 * s, fz + 0.17 * s], cell: 'gloss', color: '#ffffff', glow: 2.5, w: (p) => [B.idx('spine'), 1] }); },
    idle: 'orb', carry: true }),
  banker: (r, o) => ({ L: { top: o || '#2a3a5a', bottom: '#1e1e28', boots: '#141418', collar: '#e8e0d0', moustache: true, belly: 0.35, buckle: '#d9b04a' }, build: 'broad',
    props: (B, D) => { hatTop(B, D); const s = D.s;
      hangL(B, D, blob(0.07 * s, 0.085 * s, 0.065 * s, 1, 1, 10, 8, (p) => { if (p.y > 0.05 * s) { p.x *= 0.6; p.z *= 0.6; } }), { cell: 'cloth', color: '#a88a50' }, 0.11);
      const g = grip(B, D, 'L'); B.add(cylinder(0.025 * s, 0.025 * s, 0.006 * s, 12, 1), { pos: [g.x + 0.068 * s, g.y - 0.11 * s, g.z], rot: [0, 0, PI / 2], ...GOLD, glow: 0.3, bone: 'handL' }); },
    holdL: 'hang' }),
  trainer: (r, o) => ({ L: { top: o || '#c04a2a', sleeves: 'none', gloves: '#f0ece0', bottom: '#2a2a34', boots: '#3a2a20', collar: '#2a2a34', smile: 0.006 }, build: 'broad', wide: 1.08, armR: 1.12,
    props: (B, D) => headband(B, D, '#e8302a'), idle: 'ready' }),
  questgiver: (r, o) => ({ L: { top: o || '#5a4a8a', bottom: '#3a3448', boots: '#3a2818', satchel: '#8a6a3a', hat: 'brim', hatColor: '#5a3a2a' },
    props: (B, D) => { scrollRoll(B, D, 'L', 0.32); const s = D.s, w = torsoW(B, D);
      for (let i = 0; i < 3; i++) { B.add(rbox(0.006 * s, 0.06 * s, 0.05 * s, 0.4, 3, 4), { pos: [-0.22 * D.x, (0.95 + i * 0.015) * s, (-0.04 + i * 0.04) * s], rot: [0, 0, -0.08 + i * 0.12], cell: 'plain', color: '#f0e6c8', w });
        B.add(sphere(0.006 * s, 4, 3), { pos: [-0.225 * D.x, (0.975 + i * 0.015) * s, (-0.04 + i * 0.04) * s], cell: 'gloss', color: '#e03a3a', w }); } },
    holdL: 'hang' }),
  tamer: (r, o) => ({ L: { top: o || '#6a7a3a', bottom: '#5a4a34', boots: '#4a3020', hat: 'straw', smile: 0.008 },
    props: (B, D) => { const s = D.s, fz = torsoFrontZ(D, {}, 1.28, 0.02 * s);
      B.add(torus(0.075 * s, 0.003 * s, 14, 3), { pos: [0, 1.4 * s, 0.0], rot: [1.25, 0, 0], scl: [1, 1.6, 1], cell: 'cloth', color: '#c84a3a', bone: 'chest' });
      B.add(cylinder(0.011 * s, 0.011 * s, 0.05 * s, 8, 1), { pos: [0, 1.27 * s, fz + 0.01 * s], ...METAL, color: '#d8c060', bone: 'chest' });
      const w = torsoW(B, D); B.add(rbox(0.09 * s, 0.08 * s, 0.04 * s, 0.4, 8, 6), { pos: [-0.12 * D.x, 0.94 * s, torsoFrontZ(D, {}, 0.95, 0.03 * s) - 0.03 * s], rot: [0, -0.5, 0], cell: 'leather', color: '#8a5a30', w });
      for (const sd of [-1, 1]) B.add(sphere(0.012 * s, 6, 4), { pos: [-0.12 * D.x + sd * 0.025 * s, 0.95 * s, torsoFrontZ(D, {}, 0.95, 0.055 * s) - 0.03 * s], cell: 'bone', color: '#f0ead8', w }); },
    idle: 'whistle' }),
  watchman: (r, o) => ({ L: { top: o || '#3a4a5a', skirt: 0.45, flare: 0.3, skirtColor: o || '#3a4a5a', trim: '#2a2a30', bottom: '#2a2a30', boots: '#1e1a18', hat: 'brim', hatColor: '#2a2a30', collar: '#2a2a30', moustache: r() < 0.5 }, build: 'broad',
    props: (B, D) => { spearR(B, D, 1.9); lanternL(B, D); }, holdR: 'upright', holdL: 'lantern' }),
  knight: (r, o) => ({ L: { hairStyle: 'helmet', helmetColor: '#b0b8c0', plume: o || '#c83030', tabard: o || '#c83030', emblem: '#d9b04a', top: '#6a7078', bottom: '#4a4a50', gloves: '#4a3a2a', boots: '#3a2a1a' }, build: 'broad', height: 1.84, armor: { id: 'chain', color: '#b8bec6' }, sword: 4,
    props: (B, D) => shieldL(B, D, o || '#c83030', '#e8c050'), holdL: 'shield' }),
  archer: (r, o) => ({ L: { hood: o || '#3f6b35', hairStyle: 'hood', top: o || '#4a6a3a', bottom: '#4a3a2a', gloves: '#6a4a2a', boots: '#4a3020', skirt: 0.7, flare: 0.25 }, build: r() < 0.5 ? 'slim' : 'broad',
    props: (B, D) => { bowL(B, D); quiver(B, D); }, holdL: 'bow', attack: 'bow' }),
  mage: (r, o) => ({ L: { top: o || '#3a3a9a', skirt: 0.07, flare: 0.45, trim: '#e8c050', collar: '#e8c050', cuff: '#e8c050', stars: true, starColor: '#fff2b0', boots: '#2a2040', bottom: '#2a2040', beard: r() < 0.4 ? 'full' : false, hairStyle: pick(r, ['long', 'short', 'ponytail']) },
    props: (B, D) => { hatWizard(B, D, o || '#3a3a9a', '#fff2b0'); staffR(B, D, '#7af0ff'); }, holdR: 'upright', attack: 'staff' }),
  farmer: (r, o) => ({ L: { top: o || '#c88a40', apron: '#3a5a8a', bottom: '#3a5a8a', boots: '#4a3020', hat: 'straw', sleeves: 'short', smile: 0.008 },
    props: (B, D) => { const s = D.s, g = pole(B, D, 'R', 0.5, 1.1, 0.015, WOOD), top = g.clone().add(V3(0, 0, 1.1 * s));
      B.add(seg(top.clone().add(V3(-0.07 * s, 0, 0)), top.clone().add(V3(0.07 * s, 0, 0)), 0.008 * s, 0.008 * s, 4), { ...METAL, color: '#8a8a90', bone: 'handR' });
      for (const k of [-1, 0, 1]) B.add(cone(0.008 * s, 0.002 * s, 0.22 * s, 4), { pos: [top.x + k * 0.065 * s, top.y, top.z], rot: [PI / 2, 0, 0], ...METAL, color: '#8a8a90', bone: 'handR' }); },
    holdR: 'upright' }),
  child: (r, o) => ({ L: { top: o || pick(r, ['#e85a5a', '#5a9ae8', '#e8c040', '#7ac85a', '#c87ae8']), bottom: pick(r, ['#3a5a8a', '#5a4a3a', '#8a3a5a']), boots: pick(r, ['#e84a4a', '#3a3a3a', '#5a7ae8']), smile: 0.009, blushK: 0.22, bust: 0.006, sleeves: r() < 0.5 ? 'short' : 'long', hairStyle: pick(r, ['short', 'ponytail', 'bun', 'spiky', 'braid']) }, build: 'slim', height: 1.25, wide: 1.08, child: true }),
  elder: (r, o) => ({ L: { top: o || '#6a5a4a', bottom: '#4a443a', boots: '#3a2a1e', hair: pick(r, ['#e8e4dc', '#c8c4bc', '#b0aca4']), hairStyle: pick(r, ['short', 'bun', 'none']), beard: r() < 0.5 ? 'full' : false, skirt: r() < 0.5 ? 0.15 : 0, flare: 0.4, scarf: '#8a3a3a' }, height: 1.66,
    props: (B, D) => { const s = D.s, g = grip(B, D, 'R');
      B.add(seg(g.clone().add(V3(0, 0, 0)), V3(g.x, 0.02, g.z + 0.02 * s), 0.012 * s, 0.011 * s, 6), { ...WOOD, color: '#5a3a1e', bone: 'handR' });
      B.add(torus(0.035 * s, 0.012 * s, 10, 4, PI), { pos: [g.x, g.y + 0.0, g.z + 0.035 * s], rot: [0, PI / 2, 0], ...WOOD, color: '#5a3a1e', bone: 'handR' }); },
    holdR: 'cane', elder: true }),
  traveler: (r, o) => ({ L: { top: o || '#7a6a4a', bottom: '#4a4034', boots: '#4a3020', hat: 'brim', hatColor: '#6a4a2a', scarf: '#3a6a8a' },
    props: (B, D) => { backpack(B, D, true); pole(B, D, 'R', 0.5, 1.0, 0.015, WOOD); }, holdR: 'upright' }),
  fisher: (r, o) => ({ L: { top: o || '#e8c040', bottom: '#3a4a5a', boots: '#2a3a4a', hat: 'cap', hatColor: '#e8c040', bootTop: 0.5 },
    props: (B, D) => { const s = D.s, g = grip(B, D, 'R');
      B.add(tube([g.clone().add(V3(0, 0, -0.25 * s)), g.clone().add(V3(0, 0, 0.6 * s)), g.clone().add(V3(0, 0.03 * s, 1.5 * s))], (t) => lerp(0.014, 0.004, t) * s, 5), { ...WOOD, color: '#3a2a1a', bone: 'handR' });
      B.add(cylinder(0.025 * s, 0.025 * s, 0.03 * s, 8, 1), { pos: [g.x - 0.03 * s, g.y, g.z + 0.1 * s], rot: [0, 0, PI / 2], ...METAL, bone: 'handR' });
      B.add(seg(g.clone().add(V3(0, 0.03 * s, 1.5 * s)), g.clone().add(V3(0, -0.5 * s, 1.55 * s)), 0.002 * s, 0.002 * s, 3), { cell: 'plain', color: '#f0f0f0', bone: 'handR' });
      B.add(sphere(0.016 * s, 6, 4), { pos: [g.x, g.y - 0.5 * s, g.z + 1.55 * s], cell: 'gloss', color: '#e83a3a', bone: 'handR' });
      hangL(B, D, lathe([[0, 0], [0.07 * s, 0.002 * s], [0.085 * s, 0.13 * s], [0.08 * s, 0.135 * s]], 12), { cell: 'metal', color: '#8a9aa8', metal: 0.8, rough: 0.4 }, 0.27);
      const gl = grip(B, D, 'L'); B.add(torus(0.07 * s, 0.004 * s, 12, 3, PI), { pos: [gl.x, gl.y - 0.135 * s, gl.z], rot: [0, PI / 2, 0], ...METAL, bone: 'handL' }); },
    holdR: 'rod', holdL: 'hang' }),
  miner: (r, o) => ({ L: { top: o || '#8a6a4a', bottom: '#4a4038', boots: '#3a2a1e', beard: r() < 0.5 ? 'full' : false, gloves: '#5a4030', satchel: '#5a4028' }, build: 'broad',
    props: (B, D) => { hatHard(B, D); const s = D.s, g = pole(B, D, 'R', 0.08, 0.62, 0.015, WOOD), top = g.clone().add(V3(0, 0, 0.62 * s));
      B.add(tube([top.clone().add(V3(0, 0.2 * s, -0.06 * s)), top.clone().add(V3(0, 0, 0.02 * s)), top.clone().add(V3(0, -0.2 * s, -0.06 * s))], (t) => (0.018 - 0.014 * Math.abs(t * 2 - 1)) * s, 5), { ...METAL, color: '#7a7a82', bone: 'handR' }); },
    holdR: 'upright' }),
  monk: (r, o) => ({ L: { top: o || '#d07a2a', skirt: 0.06, flare: 0.4, skirtColor: o || '#d07a2a', trim: '#a85a1a', hairStyle: 'none', sash: '#8a3a1a', boots: '#6a4a2a', bottom: '#a85a1a', smile: 0.006, noCollar: true, sleeveColor: o || '#d07a2a' },
    props: (B, D) => { const s = D.s, w = (p) => [B.idx('chest'), 1];
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; B.add(sphere(0.011 * s, 5, 4), { pos: [Math.sin(a) * 0.085 * s, (1.4 - 0.11 * (1 + Math.cos(a)) * 0.5) * s, torsoFrontZ(D, {}, 1.4, 0.02 * s) * (0.3 + 0.7 * Math.max(0, Math.cos(a))) - 0.02 * s], cell: 'bark', color: '#5a3018', w }); } },
    idle: 'pray', carry: true }),
  explorer: (r, o) => ({ L: { top: o || '#c8b080', bottom: '#a89060', boots: '#5a3a20', bootTop: 0.42, sleeves: 'short', satchel: '#6a4a28' },
    props: (B, D) => { hatPith(B, D); backpack(B, D, false); const s = D.s, fz = torsoFrontZ(D, {}, 1.25, 0.03 * s), w = (p) => [B.idx('chest'), 1];
      for (const sd of [-1, 1]) B.add(cylinder(0.022 * s, 0.025 * s, 0.07 * s, 10, 1), { pos: [sd * 0.028 * s, 1.24 * s, fz + 0.01 * s], rot: [PI / 2 - 0.3, 0, 0], ...METAL, color: '#2a2a2a', metal: 0.5, w });
      B.add(torus(0.08 * s, 0.003 * s, 12, 3), { pos: [0, 1.38 * s, 0.0], rot: [1.15, 0, 0], scl: [1, 1.5, 1], cell: 'leather', color: '#3a2a1a', w }); },
    idle: 'binoc' }),
};
export const FRIENDLY_KINDS = Object.keys(FRIENDLY);

export function friendlySpec(kind, outfit, seed = 1) {
  const r = rng(seed * 7919 + hashStr(kind));
  const make = FRIENDLY[kind];
  if (!make) return null;
  const sp = make(r, outfit);
  const build = sp.build || (r() < 0.5 ? 'broad' : 'slim');
  const L = {
    skin: pick(r, SKINS), hair: pick(r, HAIRS), eyes: pick(r, EYES), hairStyle: pick(r, build === 'broad' ? ['short', 'short', 'spiky', 'none', 'ponytail'] : ['long', 'bun', 'ponytail', 'braid', 'short']),
    accent: '#a08050', leather: '#4a3020', build, bust: build === 'broad' ? 0.012 : 0.018, smile: 0.004 + r() * 0.004,
    ...sp.L,
  };
  if (sp.L.hairStyle === undefined && (L.hat === 'brim' || L.hat === 'straw' || L.hat === 'cap') && L.hairStyle === 'spiky') L.hairStyle = 'short';
  for (const k of ['top', 'bottom', 'cape', 'hood', 'tabard', 'skirtColor', 'sleeveColor', 'collar', 'trim']) if (L[k] && typeof L[k] !== 'string') L[k] = hexOf(L[k]);
  L.props = sp.props || null;
  L.extraBones = sp.bones || null;
  return {
    kind, L, build, height: (sp.height ?? (build === 'broad' ? 1.76 : 1.68)) + (sp.child ? 0 : (r() - 0.5) * 0.08),
    wide: sp.wide || 1, armR: sp.armR || 1, armor: sp.armor || null, sword: sp.sword ?? null,
    holdR: sp.holdR || null, holdL: sp.holdL || null, idle: sp.idle || null, carry: !!sp.carry, attack: sp.attack || null,
    child: !!sp.child, elder: !!sp.elder, orb: !!sp.orb,
  };
}

// ------------------------------------------------------------------ animation flavour
export function applyFriendly(rig, spec) {
  const J = rig.J, K = poseKit(J, rig.D), base = rig.anim.poses;
  const wob = (c, walk, a) => (walk ? a * Math.sin(c.phase) : 0);
  const holdR = {
    upright: (P, t, c, walk) => K.arm(P, 'R', -0.25 - wob(c, walk, 0.12), 0.15, 0.22, -1.15, 0.3, -0.3),
    cane: (P, t, c, walk) => K.arm(P, 'R', -0.28 - wob(c, walk, 0.22), 0.1, 0.16, -0.12, 0.2, 0.0),
    rod: (P, t, c, walk) => K.arm(P, 'R', -0.65 - wob(c, walk, 0.08), 0.1, 0.2, -0.85, 0.3, -0.75 + 0.05 * Math.sin(t * 1.3)),
    flask: (P, t, c, walk) => K.arm(P, 'R', -0.3 - wob(c, walk, 0.1), 0.0, 0.2, -1.5 + 0.1 * Math.sin(t * 3), 0.6, 0.2),
  };
  const holdL = {
    shield: (P, t, c, walk) => K.arm(P, 'L', -0.35 - wob(c, walk, -0.1), -0.2, 0.28, -1.35, 1.1, 0.1),
    bow: (P, t, c, walk) => K.arm(P, 'L', -0.3 + wob(c, walk, -0.15), 0.1, 0.22, -1.2, 0.3, 0.0),
    hang: (P, t, c, walk) => K.arm(P, 'L', 0.05 + wob(c, walk, -0.25), 0, 0.2, -0.15, 0.3, 0),
    lantern: (P, t, c, walk) => K.arm(P, 'L', -0.5 + wob(c, walk, -0.08), 0.15, 0.22, -0.55, 0.3, 0.4),
  };
  const per = (t, p) => (t % p) / p;
  const flav = {
    calm: (P, t) => { K.arm(P, 'L', -0.25, -0.6, 0.08, -1.45, 1.0, 0.2); K.arm(P, 'R', -0.25, -0.6, 0.08, -1.45, 0.4, 0.2); P.r(J.head, 0.08, 0.1 * Math.sin(t * 0.4)); },
    strum: (P, t) => { K.arm(P, 'L', -0.5, -0.1, 0.55, -1.4, 0.8, -0.3); K.arm(P, 'R', -0.25, -0.5, 0.15, -1.25 + 0.18 * Math.sin(t * 10), 0.4, 0.3 + 0.2 * Math.sin(t * 10)); P.r(J.head, 0.15, 0, 0.12 * Math.sin(t * 1.6)); P.r(J.chest, 0, 0.06 * Math.sin(t * 1.6)); },
    hammer: (P, t) => { const ph = per(t, 1.3), up = ph < 0.65 ? smooth(ph / 0.65) : 1 - smooth((ph - 0.65) / 0.1); K.arm(P, 'R', -0.45 - 1.5 * up, 0.15, 0.25, -1.5 + 0.9 * up, 0.3, 0.75 - 0.6 * up); P.r(J.spine, 0.12 * (1 - up)); P.r(J.head, 0.25); K.arm(P, 'L', -0.4, -0.2, 0.2, -1.0, 0.4, 0); },
    book: (P, t) => { K.arm(P, 'L', -0.45, -0.35, 0.18, -1.6, 1.2, 0.2); K.arm(P, 'R', -0.42, -0.25, 0.18, -1.55, 0.5, 0.2); P.r(J.neck, 0.25); P.r(J.head, 0.22, 0.08 * Math.sin(t * 0.5)); },
    orb: (P, t) => { const w = 0.12 * Math.sin(t * 1.4); K.arm(P, 'L', -0.4, -0.35 + w, 0.22, -1.5, 1.2, 0.25); K.arm(P, 'R', -0.4, -0.35 - w, 0.22, -1.5, 0.5, 0.25); P.r(J.head, 0.25); },
    scroll: (P, t) => { K.arm(P, 'L', -0.5, -0.05, 0.3, -1.35, 1.0, 0); K.arm(P, 'R', -0.5, -0.05, 0.3, -1.35, 0.4, 0); P.r(J.neck, 0.2); P.r(J.head, 0.2, 0.18 * Math.sin(t * 0.6)); },
    pray: (P, t) => { K.arm(P, 'L', -0.35, -0.75, 0.1, -1.8, 1.0, 0.4); K.arm(P, 'R', -0.35, -0.75, 0.1, -1.8, 0.4, 0.4); P.r(J.head, 0.18 + 0.03 * Math.sin(t)); },
    stir: (P, t) => { K.arm(P, 'R', -0.6 + 0.1 * Math.sin(t * 3), 0.1 * Math.cos(t * 3), 0.2, -1.1, 0.3, 0.3); P.r(J.head, 0.2); },
    binoc: (P, t) => { const u = per(t, 9), k = sstep(0.0, 0.08, u) * (1 - sstep(0.4, 0.48, u)); if (k > 0) { K.arm(P, 'L', lerp(0.05, -1.2, k), lerp(0, -0.85, k), 0.15, lerp(-0.25, -2.1, k), 1.0, 0); K.arm(P, 'R', lerp(0.05, -1.2, k), lerp(0, -0.85, k), 0.15, lerp(-0.25, -2.1, k), 0.4, 0); P.r(J.head, -0.12 * k, 0.3 * k * Math.sin(t * 0.8)); } },
    whistle: (P, t) => { const u = per(t, 7), k = sstep(0.0, 0.06, u) * (1 - sstep(0.22, 0.28, u)); if (k > 0) { K.arm(P, 'R', lerp(0.05, -0.6, k), lerp(0, -0.9, k), 0.15, lerp(-0.25, -2.3, k), 0.4, 0); P.r(J.head, -0.1 * k); } },
    // dojo master: a slow bow, then a calm wide stance with hands together, breathing (12 s loop)
    sensei: (P, t) => {
      const u = per(t, 12), s = rig.D.s;
      const bow = sstep(0.02, 0.09, u) * (1 - sstep(0.15, 0.22, u));
      const med = sstep(0.26, 0.34, u) * (1 - sstep(0.93, 0.99, u));
      const br = Math.sin(t * 1.1);
      K.arm(P, 'L', lerp(0.03, -0.35, med), lerp(0, -0.72, med), lerp(0.06, 0.1, med), lerp(-0.12, -1.65, med), lerp(0.3, 1.0, med), 0.2);
      K.arm(P, 'R', lerp(0.03, -0.35, med), lerp(0, -0.72, med), lerp(0.06, 0.1, med), lerp(-0.12, -1.65, med), lerp(0.3, 0.4, med), 0.2);
      const kn = 0.06 + 0.42 * med, th = -0.2 * med;
      K.leg(P, 'L', th, 0.06 + 0.2 * med, kn, -(th + kn) + 0.02);
      K.leg(P, 'R', th, 0.06 + 0.2 * med, kn, -(th + kn) + 0.02);
      P.off(J.hips, 0, (-0.1 * med - 0.005) * s, 0); P.e(J.hips, 0, 0, 0);
      P.e(J.spine, 0.45 * bow + 0.01 * br * med); P.e(J.chest, 0.3 * bow - 0.02 * med + 0.015 * br * med);
      P.e(J.neck, 0.25 * bow + 0.05 * med); P.e(J.head, 0.2 * bow + 0.08 * med);
      if (med > 0.5) K.lids(P, lerp(-0.55, 1.0, (med - 0.5) * 2));
    },
    ready: (P, t) => { const b = Math.abs(Math.sin(t * 4)); P.addOff(J.hips, 0, -0.03 * rig.D.s + 0.02 * b * rig.D.s, 0); K.arm(P, 'L', -0.55, -0.45, 0.2, -2.1, 0.8, 0.1); K.arm(P, 'R', -0.45, -0.4, 0.2, -2.2, 0.4, 0.1); P.r(J.chest, 0.05, -0.2); },
  };
  const carryPose = spec.carry && spec.idle ? flav[spec.idle] : null;
  const wrap = (fn, walk) => (P, t, c) => {
    fn(P, t, c);
    if (spec.holdR) holdR[spec.holdR](P, t, c, walk);
    if (spec.holdL) holdL[spec.holdL](P, t, c, walk);
    if (!walk && spec.idle) flav[spec.idle](P, t, c);
    if (walk && carryPose) carryPose(P, t, c);
  };
  rig.anim.poses = { ...base, idle: wrap(base.idle, false), walk: wrap(base.walk, true), run: wrap(base.run, true) };
  rig.anim.poses.move = rig.anim.poses.walk;
  const oldPost = rig.anim.post;
  rig.anim.post = (P, dt) => {
    oldPost(P, dt);
    const pose = rig.ctx.pose;
    if (spec.child) { P.sc(J.head, 1.32); if (pose === 'run' || pose === 'walk') P.addOff(J.hips, 0, Math.abs(Math.sin(rig.ctx.phase)) * 0.05 * rig.D.s, 0); }
    if (spec.elder && pose !== 'sleep' && pose !== 'dead' && pose !== 'swim') { P.r(J.spine, 0.22); P.r(J.chest, 0.12); P.r(J.neck, -0.2); P.r(J.head, -0.12); P.addOff(J.hips, 0, -0.03 * rig.D.s, 0); }
    if (spec.orb && J.orb >= 0) { const t = rig._time; P.off(J.orb, 0, 0.04 * Math.sin(t * 2) * rig.D.s, 0); P.e(J.orb, t * 1.5, t * 0.8, 0); }
  };
  if (spec.elder) rig.attackSpeed = 0.7;
  // bow & staff attacks
  if (spec.attack === 'bow') {
    rig.attack = () => {
      const a = { dur: 1.0, hit: 0.62, layer: 'action', fadeIn: 0.1, keys: [[0, () => {}],
        [0.25, (P) => { K.torso(P, 0, -0.45); K.look(P, 0, 0.45); K.arm(P, 'L', -1.5, 0.45, 0.05, -0.1, 0.2, 0.1); K.arm(P, 'R', -1.35, -0.1, 0.1, -1.6, 0.3, 0.2); }, 'o'],
        [0.58, (P) => { K.torso(P, 0, -0.5); K.look(P, 0, 0.5); K.arm(P, 'L', -1.52, 0.48, 0.05, -0.05, 0.2, 0.1); K.arm(P, 'R', -1.4, 0.75, 0.05, -2.35, 0.3, 0.3); }],
        [0.66, (P) => { K.torso(P, 0, -0.5); K.look(P, 0, 0.5); K.arm(P, 'L', -1.5, 0.48, 0.05, -0.05, 0.2, 0.1); K.arm(P, 'R', -1.3, 1.1, 0.15, -1.6, 0.3, 0.6); }, 'o'],
        [1.0, () => {}]] };
      if (rig.ctx.pose !== 'dead' && rig.ctx.pose !== 'sleep') rig.anim.play(a);
      return { duration: a.dur, hitTime: a.hit };
    };
  }
  if (spec.attack === 'staff') {
    const staffAct = () => ({ dur: 0.85, hit: 0.42, rel: 0.42, layer: 'action', keys: [[0, () => {}],
      [0.25, (P) => { K.torso(P, -0.1, 0.25); K.look(P, -0.1); K.arm(P, 'R', -2.3, 0.2, 0.2, -0.4, 0.3, 0.9); K.arm(P, 'L', -0.6, 0.2, 0.4, -1.2, 0.5, 0); }, 'o'],
      [0.42, (P) => { K.torso(P, 0.12, -0.15); K.look(P, 0.05); K.arm(P, 'R', -1.35, -0.1, 0.15, -0.1, 0.3, 1.25); K.arm(P, 'L', -1.1, -0.2, 0.3, -0.6, 1.2, -0.4); K.stance(P, 0.6); }, 'i'],
      [0.62, (P) => { K.torso(P, 0.1, -0.15); K.arm(P, 'R', -1.3, -0.1, 0.15, -0.15, 0.3, 1.2); K.arm(P, 'L', -1.0, -0.2, 0.3, -0.7, 1.2, -0.4); K.stance(P, 0.6); }],
      [0.85, () => {}]] });
    rig.attack = () => { const a = staffAct(); if (rig.ctx.pose !== 'dead' && rig.ctx.pose !== 'sleep') rig.anim.play(a); return { duration: a.dur, hitTime: a.hit }; };
    rig.cast = () => { const a = staffAct(); if (rig.ctx.pose !== 'dead' && rig.ctx.pose !== 'sleep') rig.anim.play(a); return { duration: a.dur, releaseTime: a.rel }; };
  }
  rig.anim.update(0, rig.ctx);
}
