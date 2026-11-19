// human.js - procedural human body: skeleton layout, body, face, hair, clothing, armour, swords.
// All geometry is merged into one skinned mesh (see rigkit.js).
import * as THREE from 'three';
import {
  Builder, CELL, limb, lathe, blob, rbox, tube, param, sphere, torus, cone, cylinder, twoSided,
  col, shade, mixc, sstep, smooth, clamp, lerp, TAU, toFlat, loft, rng, staticGeometry, fbm3, aoShade, deepen, lum,
} from './rigkit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sgnPow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function mat(pos, rot = [0, 0, 0], scl = 1, order = 'XYZ') {
  _e.set(rot[0], rot[1], rot[2], order); _q.setFromEuler(_e);
  if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  return new THREE.Matrix4().compose(_p.set(pos[0], pos[1], pos[2]), _q, _s);
}
function matDir(pos, dir, scl = 1) { // orient +Y along dir
  _q.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
  if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  return new THREE.Matrix4().compose(_p.set(pos[0], pos[1], pos[2]), _q, _s);
}

// ------------------------------------------------------------------ dimensions & bones
export function humanDims(height = 1.8, build = 'broad', o = {}) {
  const s = height / 1.8;
  const w = (build === 'broad' ? 1.0 : 0.86) * (o.wide || 1);
  return {
    s, w, height, build,
    x: w * s,                                   // width scale
    z: s * (build === 'broad' ? 1 : 0.94) * (o.deep || 1), // depth scale
    hips: [0, 0.97 * s, 0], spine: [0, 1.09 * s, -0.005 * s], chest: [0, 1.26 * s, -0.01 * s],
    neck: [0, 1.49 * s, -0.025 * s], head: [0, 1.585 * s, -0.012 * s],
    hc: [0, 1.672 * s, 0.002 * s],
    clavX: 0.03 * w * s, clavY: 1.44 * s,
    shX: (0.187 * w + 0.004) * s, shY: 1.425 * s, shZ: -0.02 * s,
    ua: 0.29 * s, fa: 0.255 * s,
    legX: 0.092 * w * s, legY: 0.92 * s, th: 0.44 * s, sh: 0.395 * s, ankY: 0.085 * s,
    armR: (o.arm || 1), legR: (o.leg || 1),
  };
}

export function humanBones(B, D, { cape = false, tail = false } = {}) {
  const s = D.s, [hx, hy, hz] = D.hc;
  B.bone('hips', null, ...D.hips);
  B.bone('spine', 'hips', ...D.spine);
  B.bone('chest', 'spine', ...D.chest);
  B.bone('neck', 'chest', ...D.neck);
  B.bone('head', 'neck', ...D.head);
  B.bone('lidL', 'head', hx + 0.032 * s, hy + 0.009 * s, hz + 0.07 * s);
  B.bone('lidR', 'head', hx - 0.032 * s, hy + 0.009 * s, hz + 0.07 * s);
  B.both((sd, S) => {
    B.bone('clav' + S, 'chest', sd * D.clavX, D.clavY, -0.015 * s);
    B.bone('uarm' + S, 'clav' + S, sd * D.shX, D.shY, D.shZ);
    B.bone('farm' + S, 'uarm' + S, sd * (D.shX + 0.004 * s), D.shY - D.ua, D.shZ);
    B.bone('hand' + S, 'farm' + S, sd * (D.shX + 0.006 * s), D.shY - D.ua - D.fa, D.shZ + 0.004 * s);
  });
  B.both((sd, S) => {
    B.bone('thigh' + S, 'hips', sd * D.legX, D.legY, 0);
    B.bone('shin' + S, 'thigh' + S, sd * D.legX, D.legY - D.th, 0.004 * s);
    B.bone('foot' + S, 'shin' + S, sd * D.legX, D.ankY, -0.012 * s);
  });
  if (cape) {
    B.bone('cape0', 'chest', 0, 1.44 * s, -0.115 * D.z);
    B.bone('cape1', 'cape0', 0, 1.17 * s, -0.15 * D.z);
    B.bone('cape2', 'cape1', 0, 0.9 * s, -0.165 * D.z);
    B.bone('cape3', 'cape2', 0, 0.64 * s, -0.17 * D.z);
  }
  if (tail) {
    B.bone('hairA', 'head', 0, hy + 0.03 * s, hz - 0.105 * s);
    B.bone('hairB', 'hairA', 0, hy - 0.1 * s, hz - 0.15 * s);
  }
}

// ------------------------------------------------------------------ torso shape
const TORSO = [ // yN, rx, rz, zc  (metres for a 1.8 m broad person)
  [0.80, 0.06, 0.05, 0], [0.84, 0.1, 0.075, 0], [0.88, 0.138, 0.09, 0], [0.95, 0.156, 0.1, -0.004], [1.03, 0.148, 0.097, 0],
  [1.12, 0.138, 0.096, 0], [1.22, 0.15, 0.106, 0.002], [1.32, 0.166, 0.113, 0.006], [1.40, 0.178, 0.106, -0.004],
  [1.462, 0.172, 0.09, -0.016], [1.505, 0.118, 0.07, -0.024], [1.55, 0.06, 0.05, -0.022], [1.57, 0.05, 0.045, -0.022],
];
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
function torsoAt(yN) {
  const T = TORSO, n = T.length;
  if (yN <= T[0][0]) return [T[0][1], T[0][2], T[0][3]];
  if (yN >= T[n - 1][0]) return [T[n - 1][1], T[n - 1][2], T[n - 1][3]];
  let i = 0; while (yN > T[i + 1][0]) i++;
  const a = T[Math.max(i - 1, 0)], b = T[i], c = T[i + 1], d = T[Math.min(i + 2, n - 1)];
  const t = (yN - b[0]) / (c[0] - b[0]);
  return [cr(a[1], b[1], c[1], d[1], t), cr(a[2], b[2], c[2], d[2], t), cr(a[3], b[3], c[3], d[3], t)];
}
// point on the torso surface (lon 0 = front), yN normalised height, inflate in metres
function torsoPoint(D, L, lon, yN, inflate, out) {
  const [rx0, rz0, zc] = torsoAt(yN);
  const sl = Math.sin(lon), cl = Math.cos(lon);
  const rx = rx0 * D.x + inflate, rz = rz0 * D.z + inflate;
  let x = rx * sgnPow(sl, 0.82);
  let z = rz * sgnPow(cl, 0.82) * (cl < 0 ? 0.93 : 1);
  const ax = Math.abs(x) / D.x;
  if (cl > 0) z += Math.exp(-((ax - 0.075) ** 2) / 0.0018 - ((yN - 1.33) ** 2) / 0.004) * (L.bust ?? 0.012) * D.z * cl;
  if (L.belly && cl > 0) z += L.belly * 0.1 * Math.exp(-((yN - 1.1) ** 2) / 0.014) * Math.pow(cl, 1.3) * D.z;
  if (cl < 0) z -= Math.exp(-((ax - 0.08) ** 2) / 0.002 - ((yN - 1.36) ** 2) / 0.006) * 0.01 * -cl;
  return out.set(x, yN * D.s, z + zc * D.s);
}
function torsoFrontZ(D, L, yN, inflate = 0) { return torsoPoint(D, L, 0, yN, inflate, new THREE.Vector3()).z; }

// torso / shell band between two heights (yTop > yBot), full circle
function torsoShell(D, L, yTop, yBot, inflate, nu, nv, opts = {}) {
  const lon0 = opts.lon0 ?? -Math.PI, lon1 = opts.lon1 ?? Math.PI;
  return param(nu, nv, (u, v, out) => {
    const yN = lerp(yTop, yBot, v);
    torsoPoint(D, L, lerp(lon0, lon1, u), yN, typeof inflate === 'function' ? inflate(yN, u) : inflate, out);
    if (opts.fn) opts.fn(out, u, v, yN);
  }, { wrap: lon1 - lon0 > 6, lu: 1.0 * D.x, lv: (yTop - yBot) * D.s });
}

// weight helpers
function torsoW(B, D) { return B.ladder('y', [['hips', 1.0 * D.s], ['spine', 1.13 * D.s], ['chest', 1.3 * D.s]]); }
function skirtW(B, D, yTop) {
  const h = B.idx('hips'), l = B.idx('thighL'), r = B.idx('thighR');
  const sp = B.idx('spine');
  const yt = yTop * D.s;
  return (p) => {
    if (p.y > yt + 0.02) return [sp, 0.5, h, 0.5];
    const t = clamp((yt - p.y) / (0.45 * D.s), 0, 1);
    const wl = t * 0.72 * sstep(-0.05 * D.x, 0.05 * D.x, p.x), wr = t * 0.72 * sstep(0.05 * D.x, -0.05 * D.x, p.x);
    return [h, 1 - wl - wr, l, wl, r, wr];
  };
}

// ------------------------------------------------------------------ head shapes
function headUnit(u, v, out) {
  const lon = -Math.PI + u * TAU, lat = Math.PI / 2 - v * Math.PI;
  let x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
  const jaw = sstep(0.05, -0.95, y);
  x *= 1 - 0.3 * jaw;
  if (z < 0) { if (y > -0.45) z *= 1.08; z *= 1 - 0.45 * jaw; }
  else { z *= 1 - 0.1 * Math.abs(x); }
  z += 0.33 * jaw;
  if (z > 0.3) {
    for (const s of [-1, 1]) z -= 0.065 * Math.exp(-(((x - s * 0.4) / 0.2) ** 2) - (((y - 0.08) / 0.13) ** 2));
    z += 0.035 * Math.exp(-(((y - 0.25) / 0.08) ** 2)) * (1 - Math.abs(x) * 0.7);
    x *= 1 + 0.07 * Math.exp(-(((y + 0.05) / 0.15) ** 2));
  }
  return out.set(x, y, z);
}
const HEAD_R = [0.08, 0.112, 0.098];

function hcV(D) { return V3(D.hc[0], D.hc[1], D.hc[2]); }

// cap over the head, edge height (unit y) varies with longitude (0 front)
function headCap(D, { vol = 0.012, front = 0.42, side = 0.1, back = -0.5, sharp = 0, nu = 24, nv = 10, grow = null, edgeTight = true } = {}) {
  const s = D.s, hc = hcV(D);
  return param(nu, nv, (u, v, out) => {
    const lon = -Math.PI + u * TAU;
    const f = (1 - Math.cos(lon)) / 2;
    let yl;
    if (sharp) { const fr = sstep(sharp, sharp + 0.35, Math.abs(lon)); yl = lerp(front, lerp(side, back, sstep(1.6, 3.1, Math.abs(lon))), fr); }
    else yl = lerp(front, back, f) + (side - lerp(front, back, 0.5)) * Math.sin(lon) ** 2;
    const latB = Math.asin(clamp(yl, -0.995, 0.995));
    const lat = Math.PI / 2 - v * (Math.PI / 2 - latB);
    let x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
    if (z < 0 && y > -0.45) z *= 1.07;
    const vv = edgeTight ? vol * (0.2 + 0.8 * sstep(1, 0.7, v)) : vol;
    let g = 1;
    if (grow) g = grow(x, y, z, u, v);
    out.set((x * HEAD_R[0] * g + x * vv) * s + hc.x, (y * HEAD_R[1] * g + y * vv) * s + hc.y, (z * HEAD_R[2] * g + z * vv) * s + hc.z);
  }, { lu: 0.35 * s, lv: 0.2 * s });
}

// ------------------------------------------------------------------ body
// L: look spec. See characters.js for fields.
export function addBody(B, D, L, q = 1) {
  const s = D.s, hc = hcV(D);
  const NU = Math.round(22 * q), NV = Math.round(18 * q), LS = Math.max(7, Math.round(10 * q));
  const skin = col(L.skin), top = col(L.top), bottom = col(L.bottom ?? L.top), accent = col(L.accent ?? L.top);
  const leather = col(L.leather ?? '#4a3020'), boots = col(L.boots ?? L.leather ?? '#3a2618');
  const beltY = (L.beltY ?? 1.0);
  const tW = torsoW(B, D);
  const head = 'head';

  // --- torso (tunic above belt, trousers below)
  const topCell = L.topCell ?? 'cloth';
  const torsoAO = aoShade([
    { c: V3(0.155 * D.x, 1.37 * s, -0.01 * s), r: 0.06 * s, k: 0.32 }, { c: V3(-0.155 * D.x, 1.37 * s, -0.01 * s), r: 0.06 * s, k: 0.32 },
    { c: V3(0, 0.82 * s, 0), r: 0.08 * s, k: 0.4 }, { c: V3(0, 1.53 * s, 0.03 * s), r: 0.05 * s, k: 0.2 },
  ]);
  B.add(torsoShell(D, L, 1.56, 0.80, 0, NU, NV + 2), {
    cell: topCell, w: tW,
    colorFn: (p, n, c) => {
      if (L.bareChest) c.copy(p.y > beltY * s ? skin : bottom);
      else c.copy(p.y > (beltY - 0.01) * s ? top : bottom);
      const db = (p.y - beltY * s) / (0.04 * s);
      c.multiplyScalar((1 - 0.2 * Math.exp(-db * db)) * (0.93 + 0.1 * Math.max(0, n.y)));
      return torsoAO(p, n, c);
    },
  });
  // belt
  if (L.belt !== false) {
    const bc = col(L.beltColor ?? leather);
    B.add(torsoShell(D, L, beltY + 0.028, beltY - 0.022, 0.012 * s, NU, 3), { cell: 'leather', color: bc, w: tW });
    const fz = torsoFrontZ(D, L, beltY, 0.012 * s);
    B.add(rbox(0.05 * s, 0.042 * s, 0.014 * s, 0.35, 12, 8), { pos: [0, (beltY + 0.003) * s, fz + 0.006 * s], cell: 'metal', color: L.buckle ?? '#c9a54a', metal: 1, rough: 0.3, w: tW });
    if (L.pouch !== false) B.add(rbox(0.07 * s, 0.08 * s, 0.035 * s, 0.4, 10, 8), { pos: [0.13 * D.x, (beltY - 0.05) * s, -0.04 * s], rot: [0, 0.9, 0], cell: 'leather', color: shade(bc, 1.15), w: tW });
  }
  // collar / neckline trim
  if (!L.noCollar) {
    const g = torus(0.062 * s, 0.012 * s, Math.round(18 * q), 6);
    B.add(g, { pos: [0, 1.505 * s, -0.018 * s], rot: [Math.PI / 2 - 0.12, 0, 0], scl: [1.15, 1.0, 1], cell: topCell, color: L.collar ?? accent, w: B.ladder('y', [['chest', 1.48 * s], ['neck', 1.53 * s]]) });
  }

  // --- neck
  B.add(limb(0.17 * s, (t) => lerp(0.052, 0.062, t) * s, LS, 5, 3), {
    pos: [0, 1.62 * s, -0.016 * s], cell: 'skin', color: skin, colorFn: aoShade([{ c: V3(0, hc.y - 0.095 * s, hc.z + 0.01 * s), r: 0.05 * s, k: 0.3 }, { c: V3(0, 1.5 * s, 0), r: 0.04 * s, k: 0.25 }]),
    w: B.ladder('y', [['chest', 1.47 * s], ['neck', 1.52 * s], ['head', 1.6 * s]]),
  });
  // --- head
  const headG = param(Math.round(24 * q), Math.round(18 * q), (u, v, o) => {
    headUnit(u, v, o);
    o.set(o.x * HEAD_R[0] * s + hc.x, o.y * HEAD_R[1] * s + hc.y, o.z * HEAD_R[2] * s + hc.z);
  }, { lu: 0.45 * s, lv: 0.3 * s });
  B.add(headG, { cell: 'skin', color: skin, bone: head, colorFn: faceShade(D, L) });
  addFace(B, D, L, q);

  // --- arms
  const sleeves = L.sleeves ?? 'long';
  const slv = col(L.sleeveColor ?? L.top);
  const gloves = L.gloves ? col(L.gloves) : null;
  B.both((sd, S) => {
    const sx = sd * D.shX, ar = D.armR * s;
    const ua = 'uarm' + S, fa = 'farm' + S, hd = 'hand' + S;
    // deltoid
    // upper arm
    const uaCol = sleeves === 'none' || sleeves === 'short' ? skin : slv;
    const elbow = V3(sd * (D.shX + 0.004 * s), D.shY - D.ua, D.shZ);
    const armAO = aoShade([{ c: V3(sx - sd * 0.035 * s, D.shY - 0.06 * s, D.shZ), r: 0.05 * s, k: 0.3 }, { c: elbow.clone().add(V3(-sd * 0.01 * s, 0, 0.03 * s)), r: 0.035 * s, k: 0.25 }]);
    B.add(limb(D.ua, (t) => (lerp(0.056, 0.04, t) + 0.004 * Math.sin(Math.PI * t)) * ar, LS, 6, 3), { pos: [sx, D.shY, D.shZ], cell: uaCol === skin ? 'skin' : topCell, color: uaCol, bone: ua, colorFn: armAO });
    if (sleeves === 'short') B.add(cylinder(0.056 * ar, 0.05 * ar, 0.15 * s, LS, 2), { pos: [sx, D.shY - 0.16 * s, D.shZ], cell: topCell, color: slv, bone: ua });
    // forearm
    const faCol = sleeves === 'long' ? slv : skin;
    B.add(limb(D.fa, (t) => (lerp(0.041, 0.029, t) + 0.006 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * ar, LS, 6, 3), { pos: [sd * (D.shX + 0.004 * s), D.shY - D.ua, D.shZ], cell: faCol === skin ? 'skin' : topCell, color: faCol, bone: fa, colorFn: armAO });
    if (sleeves === 'long' && !gloves) B.add(torus(0.032 * ar, 0.008 * s, 14, 5), { pos: [sd * (D.shX + 0.006 * s), D.shY - D.ua - D.fa + 0.035 * s, D.shZ], rot: [Math.PI / 2, 0, 0], cell: topCell, color: L.cuff ?? accent, bone: fa });
    // hand
    addHand(B, D, sd, S, gloves || skin, gloves ? 'leather' : 'skin', q);
    if (gloves) B.add(cylinder(0.036 * ar, 0.042 * ar, 0.07 * s, LS, 1), { pos: [sd * (D.shX + 0.006 * s), D.shY - D.ua - D.fa - 0.005 * s, D.shZ], cell: 'leather', color: shade(gloves, 0.9), bone: fa });
  });

  // --- legs
  B.both((sd, S) => {
    const lx = sd * D.legX, lr = D.legR * s;
    const legAO = aoShade([{ c: V3(lx - sd * 0.05 * s, D.legY - 0.04 * s, 0), r: 0.06 * s, k: 0.3 }, { c: V3(lx, D.legY - D.th, -0.04 * s), r: 0.04 * s, k: 0.3 }, { c: V3(lx, (L.bootTop ?? 0.36) * s + 0.02 * s, 0), r: 0.03 * s, k: 0.18 }]);
    B.add(limb(D.th, (t) => (lerp(0.088, 0.057, t) + 0.008 * Math.sin(Math.PI * t * 0.8)) * lr, LS + 1, 6, 3), { pos: [lx, D.legY, 0], cell: L.bottomCell ?? 'cloth', color: bottom, bone: 'thigh' + S, colorFn: legAO });
    B.add(limb(D.sh, (t) => (lerp(0.056, 0.037, t) + 0.012 * Math.sin(Math.PI * clamp(t * 1.5, 0, 1))) * lr, LS, 7, 3), { pos: [lx, D.legY - D.th, 0.004 * s], cell: L.bottomCell ?? 'cloth', color: bottom, bone: 'shin' + S, colorFn: legAO });
    // boot
    const bootTop = (L.bootTop ?? 0.36);
    const shaft = cylinder(0.051 * lr, 0.058 * lr, (bootTop - 0.06) * s, LS, 4);
    B.add(shaft, { pos: [lx, 0.06 * s, 0.006 * s], cell: 'leather', color: boots, w: B.ladder('y', [['foot' + S, 0.1 * s], ['shin' + S, 0.15 * s]]) });
    B.add(torus(0.059 * lr, 0.011 * s, 16, 5), { pos: [lx, bootTop * s, 0.006 * s], rot: [Math.PI / 2, 0, 0], cell: 'leather', color: shade(boots, 1.15), bone: 'shin' + S });
    const foot = blob(0.047 * lr, 0.042 * s, 0.125 * s, 0.85, 0.9, 12, 8, (p) => { if (p.z > 0) p.y -= (p.z / (0.125 * s)) ** 2 * 0.018 * s * (p.y > 0 ? 1 : 0); });
    B.add(foot, { pos: [lx, 0.05 * s, 0.045 * s], cell: 'leather', color: boots, bone: 'foot' + S });
    B.add(blob(0.05 * lr, 0.012 * s, 0.132 * s, 0.6, 0.9, 10, 4), { pos: [lx, 0.012 * s, 0.046 * s], cell: 'leather', color: shade(boots, 0.45), bone: 'foot' + S });
  });

  // --- skirt / tunic hem / robe
  if (L.skirt) {
    const yT = beltY - 0.02, yB = L.skirt, flare = L.flare ?? 0.35;
    const sc = col(L.skirtColor ?? L.top), trim = col(L.trim ?? accent);
    const g = param(NU, Math.round(6 * q * (yT - yB) / 0.4 + 3), (u, v, o) => {
      const yN = lerp(yT, yB, v);
      const lon = -Math.PI + u * TAU;
      torsoPoint(D, L, lon, Math.max(yN, 0.95), 0.016 * s, o);
      const k = 1 + flare * (yT - yN);
      o.x *= k; o.z *= k; o.y = yN * s;
      const f = Math.sin(lon * 8 + 0.6 * Math.sin(lon * 3)) * v;
      o.x *= 1 + 0.035 * f; o.z *= 1 + 0.035 * f;
    }, { lu: 1.0 * D.x, lv: (yT - yB) * s });
    const sFold = (p2, n, c) => {
      c.copy(p2.y < (yB + 0.035) * s ? trim : sc);
      const lon = Math.atan2(p2.x, p2.z), f = Math.sin(lon * 8 + 0.6 * Math.sin(lon * 3));
      const tt = clamp((yT * s - p2.y) / ((yT - yB) * s), 0, 1);
      return c.multiplyScalar(1 - 0.12 * Math.max(0, -f) * tt - 0.12 * Math.exp(-(((p2.y - yT * s) / (0.04 * s)) ** 2)));
    };
    for (const p of twoSided(g, 0.004 * s)) B.add(p, { cell: L.skirtCell ?? topCell, color: sc, w: skirtW(B, D, yT), colorFn: sFold });
  }

  // --- apron
  if (L.apron) {
    const ac = col(L.apron);
    const g = param(10, 14, (u, v, o) => {
      const yN = lerp(1.32, 0.6, v);
      const xx = lerp(-0.15, 0.15, u) * D.x * (1 + 0.25 * v);
      const fz = torsoFrontZ(D, L, Math.max(yN, 0.98), 0.02 * s);
      o.set(xx, yN * s, fz - 6 * (xx * xx) * (yN > 0.98 ? 1 : 0.3) + 0.004 * s);
    }, { wrap: false, lu: 0.3, lv: 0.7 });
    const wf = skirtW(B, D, 0.98), tw2 = tW;
    for (const p of twoSided(g, 0.004 * s)) B.add(p, { cell: 'wool', color: ac, w: (pp) => (pp.y > 1.0 * s ? tw2(pp) : wf(pp)) });
    B.add(tube([V3(-0.1 * D.x, 1.31 * s, torsoFrontZ(D, L, 1.31, 0.02 * s)), V3(-0.06 * D.x, 1.47 * s, 0.03 * s), V3(0, 1.53 * s, -0.01 * s), V3(0.06 * D.x, 1.47 * s, 0.03 * s), V3(0.1 * D.x, 1.31 * s, torsoFrontZ(D, L, 1.31, 0.02 * s))], 0.006 * s, 5, { caps: false }), { cell: 'wool', color: shade(ac, 0.9), bone: 'chest' });
  }

  // --- cape
  if (L.cape) {
    const cc = col(L.cape), inner = shade(cc, 0.6);
    const len = L.capeLen ?? 0.42;
    const capeTrim = col(L.capeTrim ?? (lum(cc) > 0.25 ? deepen(cc, 0.6) : mixc(cc, L.accent ?? '#c9a54a', 0.55)));
    const g = param(Math.round(14 * q) + 2, Math.round(11 * q) + 2, (u, v, o) => {
      const a = lerp(-1.35, 1.35, u);
      const tx = Math.sin(a) * 0.175 * D.x, tz = -Math.cos(a) * 0.1 * D.z - 0.03 * s;
      const yN = lerp(1.47, len, v);
      const bx = lerp(-0.29, 0.29, u) * D.x, bz = (-0.17 - 0.04 * (1 - (2 * u - 1) ** 2)) * D.z;
      const k = smooth(Math.min(1, v * 2.2));
      o.set(lerp(tx, bx, k), yN * s, lerp(tz, bz, k) + 0.024 * Math.sin(u * TAU * 3.5 + 0.5) * Math.pow(v, 0.8) * s);
    }, { wrap: false, flip: true, lu: 0.6 * D.x, lv: (1.47 - len) * s });
    const capeShade = (base) => (p, n, c2) => {
      c2.copy(p.y < (len + 0.035) * s ? capeTrim : base);
      return c2.multiplyScalar(0.82 + 0.18 * Math.abs(n.z) + 0.06 * Math.max(0, n.y));
    };
    const cw = B.ladder('y', [['cape3', 0.62 * s], ['cape2', 0.88 * s], ['cape1', 1.14 * s], ['cape0', 1.38 * s], ['chest', 1.47 * s]]);
    const [front, back] = twoSided(g, 0.005 * s);
    B.add(front, { cell: 'wool', color: cc, w: cw, colorFn: capeShade(cc) });
    B.add(back, { cell: 'wool', color: inner, w: cw, colorFn: capeShade(inner) });
    // clasps
    B.both((sd) => B.add(cylinder(0.018 * s, 0.018 * s, 0.008 * s, 12, 1), { pos: [sd * 0.115 * D.x, 1.43 * s, 0.05 * D.z], rot: [Math.PI / 2, 0, 0], cell: 'metal', color: L.clasp ?? '#d8b04a', metal: 1, rough: 0.3, bone: 'chest' }));
    B.add(torus(0.13 * D.x, 0.02 * s, 18, 6, Math.PI * 1.1), { pos: [0, 1.46 * s, -0.025 * s], rot: [Math.PI / 2 - 0.1, 0, Math.PI + 0.05 * Math.PI], scl: [1.1, 0.75, 1], cell: 'wool', color: cc, bone: 'chest' });
  }

  addHair(B, D, L, q);
  addExtras(B, D, L, q);
}

function addHand(B, D, sd, S, color, cell, q) {
  const s = D.s, hb = 'hand' + S;
  const [hx, hy, hz] = [sd * (D.shX + 0.006 * s), D.shY - D.ua - D.fa, D.shZ + 0.004 * s];
  const o = { cell, color, bone: hb };
  // palm (thin along x, wide along z)
  B.add(blob(0.018 * s, 0.045 * s, 0.04 * s, 0.8, 0.8, 10, 6), { ...o, pos: [hx, hy - 0.05 * s, hz] });
  // fingers curled around an axis along z at (-0.022*sd, -0.088)
  const gx = hx - sd * 0.02 * s, gy = hy - 0.088 * s;
  for (let i = 0; i < 4; i++) {
    const z = hz + (0.027 - i * 0.018) * s;
    const r = (0.0095 - (i === 3 ? 0.0015 : 0)) * s;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const a = 0.35 - (k / 4) * 3.75;
      pts.push(V3(gx + sd * Math.cos(a) * 0.02 * s, gy + Math.sin(a) * 0.02 * s, z));
    }
    B.add(tube(pts, r, 5, { caps: true }), o);
  }
  // thumb over the fingers
  B.add(tube([V3(hx - sd * 0.008 * s, hy - 0.04 * s, hz + 0.03 * s), V3(hx - sd * 0.03 * s, hy - 0.07 * s, hz + 0.042 * s), V3(hx - sd * 0.045 * s, hy - 0.085 * s, hz + 0.03 * s)], 0.0105 * s, 6), o);
}

// ------------------------------------------------------------------ face
// painted shading on the head: eye sockets, cheeks, jaw shadow, forehead highlight (reads from far away)
function faceShade(D, L) {
  const s = D.s, hc = hcV(D);
  const blush = col(L.blush ?? '#d0645a');
  return (p, n, c) => {
    const x = (p.x - hc.x) / (HEAD_R[0] * s), y = (p.y - hc.y) / (HEAD_R[1] * s), z = (p.z - hc.z) / (HEAD_R[2] * s);
    let k = 1;
    if (z > 0) {
      for (const sd of [-1, 1]) {
        k -= 0.17 * Math.exp(-(((x - sd * 0.4) / 0.27) ** 2) - (((y - 0.05) / 0.2) ** 2));
        c.lerp(blush, (L.blushK ?? 0.11) * Math.exp(-(((x - sd * 0.5) / 0.24) ** 2) - (((y + 0.3) / 0.18) ** 2)));
      }
      k += 0.05 * Math.exp(-(((y - 0.42) / 0.25) ** 2) - x * x);
      k -= 0.08 * Math.exp(-(((y + 0.56) / 0.08) ** 2) - ((x / 0.3) ** 2));
    }
    k -= 0.2 * sstep(-0.55, -0.95, y);
    return c.multiplyScalar(k);
  };
}
function addFace(B, D, L, q) {
  const s = D.s, hc = hcV(D);
  const P = (x, y, z) => [hc.x + x * s, hc.y + y * s, hc.z + z * s];
  const skin = col(L.skin);
  const H = 'head';
  const eyeR = 0.0135 * s;
  const eyes = col(L.eyes ?? '#5a3a22');
  B.both((sd, S) => {
    const c = P(sd * 0.032, 0.009, 0.07);
    B.add(sphere(eyeR, 10, 8), { pos: c, cell: 'gloss', color: L.eyeWhite ?? '#ece6dc', rough: 0.08, bone: H });
    // iris + pupil (flattened discs at the front)
    B.add(sphere(0.0077 * s, 10, 4), { pos: [c[0], c[1], c[2] + 0.011 * s], scl: [1, 1, 0.42], cell: 'gloss', color: eyes, rough: 0.06, glow: L.eyeGlow ?? 0, bone: H });
    B.add(sphere(0.0035 * s, 8, 3), { pos: [c[0], c[1], c[2] + 0.0139 * s], scl: [1, 1, 0.35], cell: 'gloss', color: '#070707', rough: 0.05, bone: H });
    B.add(sphere(0.0014 * s, 4, 3), { pos: [c[0] + 0.0027 * s, c[1] + 0.0028 * s, c[2] + 0.0143 * s], cell: 'gloss', color: '#ffffff', glow: 1.4, bone: H });
    // lash line along the lid edge (gives the eye a readable outline)
    const lash = [];
    for (let k = 0; k <= 6; k++) { const lon = lerp(-1.35, 1.35, k / 6), lat = 0.1 + 0.05 * Math.sin((k / 6) * Math.PI); lash.push(V3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(eyeR * 1.15).add(V3(...c))); }
    if (sd < 0) lash.reverse();
    lash[6].add(V3(sd * 0.0025 * s, 0.0018 * s, -0.001 * s));
    B.add(tube(lash, (t) => (0.0011 + 0.0011 * Math.sin(Math.PI * Math.min(1, t * 1.2))) * s, 4), { cell: 'gloss', color: L.lashColor ?? '#21150f', rough: 0.5, bone: 'lid' + S });
    // upper lid (rotates with lid bone to blink)
    const lid = param(9, 5, (u, v, o) => {
      const lon = lerp(-1.9, 1.9, u), lat = Math.PI / 2 - v * 1.5;
      o.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(eyeR * 1.12);
    }, { wrap: false, lu: 0.03, lv: 0.02 });
    B.add(lid, { m: new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]), cell: 'skin', color: shade(skin, 0.92), bone: 'lid' + S });
    // lower lid ridge
    B.add(tube([V3(c[0] - sd * 0.011 * s, c[1] - 0.004 * s, c[2] + 0.005 * s), V3(c[0], c[1] - 0.0095 * s, c[2] + 0.0085 * s), V3(c[0] + sd * 0.011 * s, c[1] - 0.003 * s, c[2] + 0.004 * s)], 0.0028 * s, 5), { cell: 'skin', color: shade(skin, 0.95), bone: H });
    // brow
    const by = 0.03;
    B.add(tube([V3(...P(sd * 0.013, by - 0.002, 0.089)), V3(...P(sd * 0.03, by + 0.004, 0.088)), V3(...P(sd * 0.049, by - 0.001, 0.078))], (t) => (0.0058 - 0.0026 * t) * s, 5, { flatten: 0.5 }), { cell: 'hair', color: L.brow ?? shade(L.hair ?? '#3a2a1a', lum(L.hair ?? '#3a2a1a') > 0.25 ? 0.6 : 0.8), bone: H });
    // ear
    B.add(blob(0.0085 * s, 0.027 * s, 0.017 * s, 1, 1, 8, 6), { pos: P(sd * 0.079, -0.004, -0.006), rot: [0, sd * 0.2, sd * -0.08], cell: 'skin', color: shade(skin, 0.97), bone: H });
    B.add(blob(0.004 * s, 0.016 * s, 0.009 * s, 1, 1, 6, 4), { pos: P(sd * 0.085, -0.004, -0.002), rot: [0, sd * 0.2, 0], cell: 'skin', color: shade(skin, 0.75), bone: H });
  });
  // nose
  B.add(blob(0.0105 * s, 0.026 * s, 0.014 * s, 1, 1, 8, 6), { pos: P(0, -0.012, 0.094), rot: [-0.3, 0, 0], cell: 'skin', color: skin, bone: H });
  B.add(sphere(0.0082 * s, 8, 6), { pos: P(0, -0.031, 0.099), scl: [1, 0.85, 1], cell: 'skin', color: skin, bone: H });
  B.both((sd) => B.add(sphere(0.0055 * s, 6, 4), { pos: P(sd * 0.009, -0.035, 0.092), cell: 'skin', color: shade(skin, 0.96), bone: H }));
  // lips
  const lip = col(L.lip ?? mixc(skin, '#a8484e', 0.42));
  const smile = L.smile ?? 0.002;
  B.add(tube([V3(...P(-0.021, -0.053 + smile, 0.083)), V3(...P(0, -0.051, 0.093)), V3(...P(0.021, -0.053 + smile, 0.083))], (t) => (0.0045 - 0.002 * Math.abs(t - 0.5) * 2) * s, 6, { flatten: 0.7 }), { cell: 'skin', color: lip, rough: 0.4, bone: H });
  B.add(tube([V3(...P(-0.018, -0.0595 + smile * 0.5, 0.082)), V3(...P(0, -0.0625, 0.0905)), V3(...P(0.018, -0.0595 + smile * 0.5, 0.082))], (t) => (0.0055 - 0.0025 * Math.abs(t - 0.5) * 2) * s, 6, { flatten: 0.7 }), { cell: 'skin', color: shade(lip, 1.05), rough: 0.4, bone: H });
  // mouth line between the lips
  B.add(tube([V3(...P(-0.02, -0.0555 + smile * 0.8, 0.0845)), V3(...P(0, -0.0568, 0.0925)), V3(...P(0.02, -0.0555 + smile * 0.8, 0.0845))], 0.0013 * s, 4), { cell: 'skin', color: mixc(lip, '#250808', 0.65), rough: 0.6, bone: H });
  // chin bump
  B.add(sphere(0.016 * s, 8, 6), { pos: P(0, -0.088, 0.072), scl: [1.2, 0.8, 0.7], cell: 'skin', color: skin, bone: H });
}

// ------------------------------------------------------------------ hair & head wear
function addHair(B, D, L, q) {
  const s = D.s, hc = hcV(D);
  const style = L.hairStyle || 'short';
  const hcol = col(L.hair ?? '#3a2a1a');
  const H = 'head';
  const o = { cell: 'hair', color: hcol, bone: H };
  const nu = Math.round(22 * q), nv = Math.round(10 * q);
  const P = (x, y, z) => V3(hc.x + x * s, hc.y + y * s, hc.z + z * s);
  o.colorFn = (p, n, cc) => cc.multiplyScalar(0.8 + 0.3 * Math.max(0, n.y) + 0.06 * Math.max(0, n.z));
  // soft hairline: tapered locks that hang over the cap edge so it is not a hard helmet line
  const fringe = (front, side, back, vol, count, lonMax, len) => {
    const R = rng(hashLook(L));
    for (let i = 0; i < count; i++) {
      const lon = lerp(-lonMax, lonMax, (i + 0.5) / count) + (R() - 0.5) * 0.12;
      const f = (1 - Math.cos(lon)) / 2;
      const yl = lerp(front, back, f) + (side - lerp(front, back, 0.5)) * Math.sin(lon) ** 2;
      const latE = Math.asin(clamp(yl, -0.99, 0.99));
      const cp = (ln, lt, v) => { const x = Math.cos(lt) * Math.sin(ln), y = Math.sin(lt); let z = Math.cos(lt) * Math.cos(ln); if (z < 0 && y > -0.45) z *= 1.07; return V3(x * (HEAD_R[0] + v) * s, y * (HEAD_R[1] + v) * s, z * (HEAD_R[2] + v) * s).add(hc); };
      const dl = (R() - 0.5) * 0.15, L2 = len * (0.7 + R() * 0.6) * (Math.abs(lon) < 0.7 ? 1 : 0.8);
      const pts = [cp(lon, latE + 0.2, vol * 0.8), cp(lon + dl * 0.5, latE, vol * 0.75 + 0.003), cp(lon + dl, latE - L2, 0.004)];
      B.add(tube(pts, (t) => lerp(0.0075, 0.0012, t) * s, 4, { flatten: 0.55 }), { ...o, colorFn: null, color: shade(hcol, 0.92) });
    }
  };
  if (style === 'short') {
    B.add(headCap(D, { vol: 0.011, front: 0.48, side: 0.12, back: -0.42, nu, nv, grow: (x, y, z) => 1 + 0.06 * fbm3(x * 6, y * 6, z * 6, 2) }), o);
    fringe(0.48, 0.12, -0.42, 0.011, 14, 2.1, 0.22);
  } else if (style === 'spiky') {
    B.add(headCap(D, { vol: 0.012, front: 0.45, side: 0.15, back: -0.35, nu, nv }), o);
    const R = rng(77);
    for (let i = 0; i < 16; i++) {
      const lon = (R() - 0.5) * 3.6 + (i % 2 ? Math.PI : 0) * 0.3, lat = 0.35 + R() * 1.0;
      const dir = V3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon) - 0.4).normalize();
      const base = V3(dir.x * HEAD_R[0] * 0.95, dir.y * HEAD_R[1] * 0.95, dir.z * HEAD_R[2] * 0.95).multiplyScalar(s).add(hc);
      B.add(cone(0.024 * s, 0.0, (0.06 + R() * 0.04) * s, 7), { ...o, m: matDir([base.x, base.y, base.z], dir) });
    }
  } else if (style === 'long' || style === 'ponytail' || style === 'braid' || style === 'bun') {
    B.add(headCap(D, { vol: style === 'long' ? 0.016 : 0.01, front: 0.5, side: 0.06, back: -0.5, nu, nv }), o);
    fringe(0.5, 0.06, -0.5, style === 'long' ? 0.016 : 0.01, style === 'long' ? 16 : 12, style === 'long' ? 2.3 : 1.9, style === 'long' ? 0.3 : 0.2);
  }
  if (style === 'long') {
    const g = param(Math.round(14 * q), Math.round(10 * q), (u, v, out) => {
      const yA = hc.y + 0.02 * s, yB = (L.hairLen ?? 1.3) * s;
      const y = lerp(yA, yB, v);
      const lr = lerp(1.95, 1.25, smooth(v));
      const lon = Math.PI + lerp(-lr, lr, u);
      const k = smooth(clamp((yA - y) / (0.15 * s), 0, 1));
      const rx = lerp(HEAD_R[0] + 0.02, 0.135 * D.x / s, k) * s, rz = lerp(HEAD_R[2] + 0.022, 0.06, k) * s;
      const zc = lerp(hc.z - 0.005 * s, -0.075 * D.z, k);
      out.set(Math.sin(lon) * rx, y, zc + Math.cos(lon) * rz - 0.03 * k * s + 0.006 * Math.sin(u * 30) * s * v);
    }, { wrap: false, lu: 0.4 * s, lv: 0.4 * s });
    const w = B.ladder('y', [['chest', 1.42 * s], ['neck', 1.52 * s], ['head', 1.6 * s]]);
    for (const p of twoSided(g, 0.006 * s)) B.add(p, { cell: 'hair', color: hcol, w });
  }
  if (style === 'ponytail' || style === 'braid') {
    const w = B.ladder('y', [['hairB', hc.y - 0.12 * s], ['hairA', hc.y - 0.02 * s], ['head', hc.y + 0.03 * s]]);
    if (style === 'ponytail') {
      B.add(torus(0.02 * s, 0.007 * s, 12, 5), { pos: [0, hc.y + 0.025 * s, hc.z - 0.112 * s], rot: [0.5, 0, 0], cell: 'leather', color: L.tie ?? '#5a3a1a', bone: H });
      const pts = [P(0, 0.03, -0.11), P(0, 0.0, -0.14), P(0, -0.07, -0.16), P(0, -0.15, -0.155), P(0, -0.23, -0.14), P(0, -0.29, -0.13)];
      B.add(tube(pts, (t) => (0.022 + 0.012 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - 0.018 * t * t) * s, 9), { cell: 'hair', color: hcol, w });
    } else {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(P(0.012 * Math.sin(i * 1.7), 0.0 - t * 0.38, -0.115 - 0.03 * Math.sin(t * 2.2)));
      }
      for (let i = 0; i < 10; i++) {
        const a = pts[i], b = pts[i + 1], m = a.clone().lerp(b, 0.5);
        B.add(blob(0.017 * s * (1 - i * 0.04), 0.024 * s, 0.015 * s, 1, 1, 5, 4), { pos: [m.x + (i % 2 ? 0.006 : -0.006) * s, m.y, m.z], rot: [0, 0, i % 2 ? 0.5 : -0.5], cell: 'hair', color: hcol, w });
      }
      const e = pts[10];
      B.add(torus(0.011 * s, 0.005 * s, 10, 4), { pos: [e.x, e.y + 0.01 * s, e.z], rot: [Math.PI / 2, 0, 0], cell: 'cloth', color: L.tie ?? L.accent ?? '#c96f9b', w });
      B.add(cone(0.014 * s, 0.003 * s, 0.035 * s, 8), { pos: [e.x, e.y - 0.035 * s, e.z], cell: 'hair', color: hcol, w });
    }
  }
  if (style === 'bun') {
    B.add(blob(0.042 * s, 0.038 * s, 0.04 * s, 1, 1, 14, 10, (p) => { p.multiplyScalar(1 + 0.08 * Math.sin(p.x * 300) * Math.sin(p.y * 250)); }), { ...o, pos: [0, hc.y + 0.06 * s, hc.z - 0.095 * s] });
    B.add(torus(0.03 * s, 0.006 * s, 12, 5), { pos: [0, hc.y + 0.045 * s, hc.z - 0.08 * s], rot: [1.1, 0, 0], cell: 'cloth', color: L.tie ?? L.accent ?? '#eeeeee', bone: H });
  }
  if (style === 'hood' || L.hood) {
    const hcl = col(L.hood ?? L.top);
    const g = headCap(D, {
      vol: 0.03, front: 0.5, side: -1.6, back: -1.6, sharp: 0.7, nu: Math.round(22 * q), nv: Math.round(12 * q), edgeTight: false,
      grow: (x, y, z) => 1 + 0.75 * sstep(-0.55, -1.0, y) + (z < -0.2 && y > 0.4 ? 0.1 : 0),
    });
    // flatten cowl front so it drapes over the chest, drop it a bit back
    deformBy(g, (p) => { if (p.y < hc.y - 0.1 * s) { const k = sstep(hc.y - 0.1 * s, hc.y - 0.2 * s, p.y); p.z -= 0.035 * k * s; p.y -= 0.02 * k * s; } });
    const w = B.ladder('y', [['chest', 1.47 * s], ['neck', 1.53 * s], ['head', 1.61 * s]]);
    const [fr, bk] = twoSided(g, 0.006 * s);
    B.add(fr, { cell: 'wool', color: hcl, w });
    B.add(bk, { cell: 'wool', color: shade(hcl, 0.45), w });
  }
  if (style === 'helmet') {
    const mc = col(L.helmetColor ?? '#9aa4ae');
    const mo = { cell: 'plate', color: mc, metal: 1, rough: 0.3, bone: H };
    const cap = headCap(D, { vol: 0.03, front: 0.28, side: -0.25, back: -0.5, nu, nv: Math.round(12 * q), edgeTight: false, grow: (x, y, z) => 1 + (y > 0.6 ? 0.05 : 0) });
    B.add(cap, mo);
    // rim along the bottom edge
    const edge = [];
    const pa = cap.attributes.position, nuu = nu;
    for (let j = 0; j <= nuu; j++) { const i = nv * (nuu + 1) + j; edge.push(V3(pa.getX(i), pa.getY(i), pa.getZ(i))); }
    B.add(tube(edge, 0.006 * s, 5, { caps: false }), { ...mo, color: shade(mc, 0.85) });
    // nasal guard + cheek plates
    B.add(rbox(0.016 * s, 0.07 * s, 0.012 * s, 0.4, 8, 8), { ...mo, pos: [hc.x, hc.y - 0.0 * s, hc.z + 0.113 * s], rot: [-0.12, 0, 0] });
    B.both((sd) => B.add(rbox(0.012 * s, 0.075 * s, 0.06 * s, 0.4, 8, 8), { ...mo, pos: [hc.x + sd * 0.083 * s, hc.y - 0.045 * s, hc.z + 0.02 * s], rot: [0.1, sd * 0.15, sd * 0.12] }));
    // crest / plume
    const pts = [];
    for (let i = 0; i <= 8; i++) { const a = -0.25 + (i / 8) * 2.0; pts.push(P(0, Math.cos(a) * 0.15, Math.sin(a) * -0.13 + 0.02)); }
    B.add(tube(pts, (t) => (0.016 + 0.012 * Math.sin(Math.PI * t)) * s, 7, { flatten: 0.35 }), { cell: 'fur', color: L.plume ?? L.accent ?? '#2e4fa3', bone: H });
  }
  if (L.beard) {
    const g = param(Math.round(18 * q), Math.round(8 * q), (u, v, out) => {
      const lon = lerp(-1.75, 1.75, u);
      const yTop = lerp(-0.56, -0.12, Math.min(1, Math.abs(lon) / 1.4) ** 1.5);
      const lat = lerp(Math.asin(yTop), -Math.PI / 2 + 0.25, v);
      const uu = (lon + Math.PI) / TAU, vv = (Math.PI / 2 - lat) / Math.PI;
      headUnit(uu, vv, out);
      const vol = 0.012 + (L.beard === 'big' ? 0.02 : 0.004) * v;
      out.set(out.x * (HEAD_R[0] + vol), out.y * (HEAD_R[1] + vol) - (L.beard === 'big' ? 0.025 : 0.01) * v * v, out.z * (HEAD_R[2] + vol)).multiplyScalar(s).add(hc);
    }, { wrap: false, lu: 0.25 * s, lv: 0.1 * s });
    B.add(g, { cell: 'hair', color: hcol, bone: H });
  }
  if (L.moustache || L.beard) {
    const mc = L.moustache ? col(L.moustacheColor ?? L.hair) : hcol;
    B.add(tube([P(-0.04, -0.06, 0.07), P(-0.03, -0.047, 0.088), P(-0.012, -0.043, 0.099), P(0, -0.045, 0.1), P(0.012, -0.043, 0.099), P(0.03, -0.047, 0.088), P(0.04, -0.06, 0.07)],
      (t) => (0.004 + 0.0045 * Math.sin(Math.PI * t)) * s, 6), { cell: 'hair', color: mc, bone: H });
  }
}

function hashLook(L) { let h = 7; for (const ch of String(L.hair) + L.hairStyle + L.skin) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
function deformBy(g, fn) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
}

// lower-face cover (mask / bandana / scarf)
function faceCover(D, vol, yTop, q, tri = 0) {
  const s = D.s, hc = hcV(D);
  return param(Math.round(18 * q), Math.round(8 * q), (u, v, out) => {
    const lon = lerp(-1.9, 1.9, u);
    const lat = lerp(Math.asin(yTop), -Math.PI / 2 + 0.15, v);
    headUnit((lon + Math.PI) / TAU, (Math.PI / 2 - lat) / Math.PI, out);
    out.set(out.x * (HEAD_R[0] + vol), out.y * (HEAD_R[1] + vol), out.z * (HEAD_R[2] + vol + 0.004)).multiplyScalar(s).add(hc);
    if (tri) { const k = v * v * Math.max(0, Math.cos(lon)) ** 4; out.y -= tri * k * s; out.z += 0.02 * k * s; }
  }, { wrap: false, lu: 0.3 * s, lv: 0.1 * s });
}

function addExtras(B, D, L, q) {
  const s = D.s, hc = hcV(D);
  const P = (x, y, z) => V3(hc.x + x * s, hc.y + y * s, hc.z + z * s);
  if (L.mask) B.add(faceCover(D, 0.007, -0.08, q), { cell: 'cloth', color: L.mask, bone: 'head' });
  if (L.bandana) {
    const w = B.ladder('y', [['neck', 1.54 * s], ['head', 1.6 * s]]);
    for (const p of twoSided(faceCover(D, 0.01, -0.1, q, 0.06), 0.003 * s)) B.add(p, { cell: 'cloth', color: L.bandana, w, colorFn: (pp, n, cc) => cc.multiplyScalar(0.8 + 0.25 * Math.max(0, n.z)) });
    // knot and two tails at the back of the head
    const kp = V3(hc.x, hc.y - 0.035 * s, hc.z - 0.1 * s);
    B.add(blob(0.018 * s, 0.014 * s, 0.014 * s, 1, 1, 8, 6), { pos: [kp.x, kp.y, kp.z], cell: 'cloth', color: shade(L.bandana, 0.85), bone: 'head' });
    for (const sd of [-1, 1]) B.add(tube([kp.clone(), kp.clone().add(V3(sd * 0.02 * s, -0.05 * s, -0.025 * s)), kp.clone().add(V3(sd * 0.03 * s, -0.1 * s, -0.02 * s))], (t) => lerp(0.012, 0.016, t) * s, 4, { flatten: 0.25 }), { cell: 'cloth', color: shade(L.bandana, 0.9), w: B.ladder('y', [['neck', 1.52 * s], ['head', 1.6 * s]]) });
  }
  if (L.scarf) {
    B.add(torus(0.064 * s, 0.022 * s, 18, 8), { pos: [0, 1.53 * s, -0.012 * s], rot: [Math.PI / 2 - 0.1, 0, 0], scl: [1.12, 1, 1.25], cell: 'wool', color: L.scarf, w: B.ladder('y', [['chest', 1.5 * s], ['neck', 1.56 * s]]) });
    const pts = [V3(0.03 * s, 1.52 * s, -0.08 * s), V3(0.05 * s, 1.42 * s, -0.12 * s), V3(0.06 * s, 1.3 * s, -0.135 * s)];
    B.add(tube(pts, 0.024 * s, 6, { flatten: 0.3 }), { cell: 'wool', color: L.scarf, bone: 'chest' });
    if (L.scarfMask) B.add(faceCover(D, 0.012, -0.12, q), { cell: 'wool', color: L.scarf, bone: 'head' });
  }
  if (L.hat === 'brim' || L.hat === 'straw') {
    const straw = L.hat === 'straw';
    const hcol = col(L.hatColor ?? (straw ? '#d6bd72' : '#5a4030'));
    const rb = straw ? 0.2 : 0.165, ch = straw ? 0.1 : 0.11;
    const prof = [[0, -0.004], [rb * 0.98, -0.004], [rb, 0.004], [rb * 0.9, 0.012], [0.098, 0.012], [0.095, 0.03], straw ? [0.06, ch] : [0.088, ch], straw ? [0.0, ch + 0.012] : [0.0, ch + 0.004]]
      .map(([r, y]) => [r * s, y * s]);
    B.add(lathe(prof, Math.round(24 * q)), { pos: [hc.x, hc.y + 0.07 * s, hc.z - 0.006 * s], rot: [-0.12, 0, 0], scl: [1, 1, 1.08], cell: straw ? 'wool' : 'wool', color: hcol, bone: 'head' });
    B.add(cylinder(0.097 * s, 0.096 * s, 0.022 * s, 20, 1), { pos: [hc.x, hc.y + 0.085 * s, hc.z - 0.008 * s], rot: [-0.12, 0, 0], scl: [1, 1, 1.08], cell: 'cloth', color: L.hatBand ?? '#7a2a22', bone: 'head' });
  }
  if (L.hat === 'cap') {
    B.add(headCap(D, { vol: 0.02, front: 0.35, side: 0.25, back: 0.0, nu: 20, nv: 8 }), { cell: 'wool', color: L.hatColor ?? '#6a3b2a', bone: 'head' });
  }
  if (L.goggles) {
    B.both((sd) => {
      B.add(cylinder(0.019 * s, 0.017 * s, 0.014 * s, 14, 1), { m: mat([hc.x + sd * 0.032 * s, hc.y + 0.065 * s, hc.z + 0.085 * s], [-1.2, 0, 0]), cell: 'metal', color: '#3a3a3a', metal: 1, rough: 0.4, bone: 'head' });
      B.add(sphere(0.016 * s, 12, 6), { pos: [hc.x + sd * 0.032 * s, hc.y + 0.073 * s, hc.z + 0.09 * s], scl: [1, 1, 0.35], rot: [-1.2, 0, 0], cell: 'gloss', color: '#7fd0ff', rough: 0.05, metal: 0.5, glow: 0.1, bone: 'head' });
    });
    B.add(headCap(D, { vol: 0.016, front: 0.62, side: 0.5, back: 0.35, nu: 22, nv: 2, edgeTight: false, grow: (x, y) => (y > 0 ? 1 : 1) }), { cell: 'leather', color: '#3a2a20', bone: 'head' });
  }
  if (L.crown === 'leaf') {
    const R = rng(5);
    for (let i = 0; i < 10; i++) {
      const lon = (i / 10) * TAU;
      const p = P(Math.sin(lon) * 0.088, 0.055 + 0.01 * Math.cos(lon), Math.cos(lon) * 0.104 - 0.002);
      const leafCol = i % 3 === 0 ? (L.flower ?? '#c96f9b') : '#4e8a34';
      B.add(blob(0.012 * s, 0.006 * s, 0.022 * s, 1, 1, 6, 4), { m: mat([p.x, p.y, p.z], [0.3 * (R() - 0.5), lon + 0.6, 0.4], 1, 'YXZ'), cell: i % 3 === 0 ? 'gloss' : 'plain', color: leafCol, rough: 0.5, bone: 'head' });
    }
  }
  if (L.stars) {
    const R = rng(9);
    for (let i = 0; i < 26; i++) {
      const yN = 0.25 + R() * 0.75, lon = (R() - 0.5) * TAU;
      const p = torsoPoint(D, L, lon, Math.max(yN, 1.02), 0.02 * s, new THREE.Vector3());
      if (yN < 0.98) { const k = 1 + (L.flare ?? 0.35) * (0.98 - yN); p.x *= k; p.z *= k; p.y = yN * s; }
      B.add(new THREE.OctahedronGeometry(0.0055 * s, 0), { pos: [p.x, p.y, p.z], cell: 'gloss', color: L.starColor ?? '#fff2b0', glow: 2.0, w: yN < 0.98 ? skirtW(B, D, 0.98) : torsoW(B, D) });
    }
  }
  if (L.pelt) { // barbarian fur over the shoulders
    const g = torsoShell(D, L, 1.52, 1.34, (yN) => 0.03 * s + 0.02 * s * sstep(1.4, 1.5, yN), Math.round(20 * q), 5, { fn: (o, u, v) => { o.y += 0.012 * Math.sin(u * 40) * s * v; } });
    B.add(g, { cell: 'fur', color: L.pelt, w: B.ladder('y', [['spine', 1.2 * s], ['chest', 1.33 * s]]) });
    B.both((sd, S) => B.add(blob(0.075 * s, 0.05 * s, 0.075 * s, 1, 1, 12, 8), { pos: [sd * D.shX, D.shY + 0.025 * s, D.shZ], cell: 'fur', color: L.pelt, bone: 'clav' + S }));
  }
  if (L.headband) { // martial-arts headband with two tails at the back
    const hb = col(L.headband);
    B.add(torus(0.088 * s, 0.01 * s, 18, 4), { pos: [hc.x, hc.y + 0.045 * s, hc.z - 0.004 * s], rot: [Math.PI / 2 - 0.15, 0, 0], scl: [1.0, 1.15, 1], cell: 'cloth', color: hb, bone: 'head' });
    for (const sd of [-1, 1]) B.add(tube([V3(hc.x, hc.y + 0.03 * s, hc.z - 0.11 * s), V3(hc.x + sd * 0.035 * s, hc.y - 0.02 * s, hc.z - 0.16 * s), V3(hc.x + sd * 0.05 * s, hc.y - 0.1 * s, hc.z - 0.16 * s)], 0.009 * s, 4, { flatten: 0.3 }), { cell: 'cloth', color: hb, bone: 'head' });
  }
  if (L.gi) { // wrap-over jacket lapels + belt knot with two hanging tails
    const lap = shade(L.top, 0.9), tw = torsoW(B, D);
    const lapel = (sd, inflate) => {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6, yN = lerp(1.53, 1.02, t); const p = torsoPoint(D, L, sd * lerp(0.95, -0.35, Math.pow(t, 0.8)), yN, inflate * s, new THREE.Vector3()); pts.push(p); }
      return tube(pts, 0.016 * s, 4, { flatten: 0.35 });
    };
    B.add(lapel(-1, 0.012), { cell: 'cloth', color: lap, w: tw });
    B.add(lapel(1, 0.018), { cell: 'cloth', color: lap, w: tw });
    const bc = col(L.beltColor ?? '#151515'), fz = torsoFrontZ(D, L, L.beltY ?? 1.0, 0.02 * s);
    const kp = V3(-0.05 * D.x, (L.beltY ?? 1.0) * s, fz + 0.005 * s);
    B.add(blob(0.022 * s, 0.02 * s, 0.014 * s, 1, 1, 8, 6), { pos: kp.toArray(), cell: 'cloth', color: bc, w: tw });
    for (const k of [-1, 1]) B.add(tube([kp.clone(), kp.clone().add(V3(k * 0.025 * s, -0.08 * s, 0.006 * s)), kp.clone().add(V3(k * 0.04 * s, -0.17 * s, 0.0))], 0.012 * s, 4, { flatten: 0.3 }), { cell: 'cloth', color: bc, w: skirtW(B, D, 0.98) });
  }
  if (L.satchel) { // strap across the chest + a bag on the hip
    const sc = col(L.satchel);
    B.add(tube([V3(0.13 * D.x, 1.45 * s, 0.03 * s), V3(0.02 * D.x, 1.3 * s, torsoFrontZ(D, L, 1.3, 0.03 * s)), V3(-0.12 * D.x, 1.1 * s, torsoFrontZ(D, L, 1.1, 0.03 * s)), V3(-0.17 * D.x, 0.98 * s, 0.0)], 0.012 * s, 5, { flatten: 0.3 }), { cell: 'leather', color: shade(sc, 0.8), w: torsoW(B, D) });
    B.add(rbox(0.06 * s, 0.13 * s, 0.15 * s, 0.35, 10, 8), { pos: [-0.19 * D.x, 0.93 * s, 0.0], rot: [0, 0, -0.08], cell: 'leather', color: sc, w: torsoW(B, D) });
    B.add(rbox(0.065 * s, 0.05 * s, 0.155 * s, 0.4, 8, 6), { pos: [-0.192 * D.x, 0.98 * s, 0.0], rot: [0, 0, -0.08], cell: 'leather', color: shade(sc, 0.75), w: torsoW(B, D) });
  }
  if (L.sash) {
    const g = tube([V3(0.15 * D.x, 1.42 * s, 0.07 * s), V3(0.05 * D.x, 1.28 * s, 0.125 * s), V3(-0.07 * D.x, 1.12 * s, 0.112 * s), V3(-0.145 * D.x, 1.0 * s, 0.07 * s)], 0.022 * s, 6, { flatten: 0.25 });
    B.add(g, { cell: 'cloth', color: L.sash, w: torsoW(B, D) });
  }
  if (L.tabard) {
    const tc = col(L.tabard);
    const g = param(8, 14, (u, v, o) => {
      const yN = lerp(1.44, 0.62, v);
      const xx = lerp(-0.11, 0.11, u) * D.x;
      const fz = torsoFrontZ(D, L, Math.max(yN, 1.0), 0.022 * s);
      o.set(xx, yN * s, fz - 4 * xx * xx + 0.002 * s);
    }, { wrap: false, lu: 0.25, lv: 0.8 });
    const wf = skirtW(B, D, 0.98), tw = torsoW(B, D);
    for (const p of twoSided(g, 0.004 * s)) B.add(p, { cell: 'cloth', color: tc, w: (pp) => (pp.y > 1.0 * s ? tw(pp) : wf(pp)) });
    if (L.emblem) B.add(blob(0.045 * s, 0.05 * s, 0.006 * s, 0.6, 0.6, 10, 6), { pos: [0, 1.3 * s, torsoFrontZ(D, L, 1.3, 0.03 * s)], cell: 'metal', color: L.emblem, metal: 1, rough: 0.3, w: tw });
  }
}

// ------------------------------------------------------------------ armour
const ARMOR_STYLE = {
  leather: { cell: 'leather', rough: 0.58, metal: 0, glow: 0 },
  chain: { cell: 'chain', rough: 0.42, metal: 1, glow: 0 },
  iron: { cell: 'plate', rough: 0.3, metal: 1, glow: 0 },
  gold: { cell: 'plate', rough: 0.2, metal: 1, glow: 0 },
  diamond: { cell: 'gloss', rough: 0.05, metal: 0.35, glow: 0.22, flat: true },
};
export function addArmor(B, D, L, armor, q = 1) {
  if (!armor || armor.id === 'cloth' || !armor.color) return;
  const id = armor.id, st = ARMOR_STYLE[id] || ARMOR_STYLE.iron;
  const s = D.s, c = col(armor.color);
  const tW = torsoW(B, D);
  const NU = Math.round(20 * q);
  const o = { cell: st.cell, color: c, rough: st.rough, metal: st.metal, glow: st.glow };
  const F = (g) => (st.flat ? toFlat(g) : g);
  const trim = id === 'gold' ? shade(c, 0.7) : id === 'diamond' ? col('#d8fbff') : id === 'leather' ? shade(c, 0.6) : shade(c, 0.75);
  const plate = id === 'iron' || id === 'gold' || id === 'diamond';
  if (id === 'leather') {
    B.add(torsoShell(D, L, 1.46, 1.02, (yN) => 0.016 * s + 0.006 * s * sstep(1.2, 1.35, yN), NU, 10), { ...o, w: tW });
    B.add(torsoShell(D, L, 1.03, 0.99, 0.024 * s, NU, 2), { ...o, color: trim, w: tW });
    // stitched straps
    B.both((sd) => B.add(tube([V3(sd * 0.09 * D.x, 1.47 * s, 0.05 * s), V3(sd * 0.1 * D.x, 1.38 * s, torsoFrontZ(D, L, 1.38, 0.026 * s)), V3(sd * 0.1 * D.x, 1.1 * s, torsoFrontZ(D, L, 1.1, 0.024 * s))], 0.008 * s, 5, { flatten: 0.4 }), { ...o, color: trim, w: tW }));
  } else if (id === 'chain') {
    B.add(torsoShell(D, L, 1.48, 0.97, 0.013 * s, NU, 14), { ...o, w: tW });
    const g = param(NU, 6, (u, v, out) => {
      const yN = lerp(0.98, 0.7, v), lon = -Math.PI + u * TAU;
      torsoPoint(D, L, lon, 0.95, 0.02 * s, out); const k = 1 + 0.35 * (0.98 - yN); out.x *= k; out.z *= k; out.y = yN * s;
    }, { lu: 1, lv: 0.3 });
    for (const p of twoSided(g, 0.004 * s)) B.add(p, { ...o, w: skirtW(B, D, 0.97) });
    B.add(torsoShell(D, L, 1.03, 0.985, 0.026 * s, NU, 2), { cell: 'leather', color: '#4a3020', w: tW });
  } else {
    // breast + back plate with a central ridge
    const g = torsoShell(D, L, 1.47, 1.0, (yN, u) => 0.022 * s + 0.012 * s * Math.exp(-(((u - 0.5) * 12) ** 2)) * sstep(1.05, 1.25, yN), NU + 2, 9);
    B.add(F(g), { ...o, w: tW });
    B.add(torsoShell(D, L, 1.03, 0.99, 0.036 * s, NU, 2), { ...o, color: trim, w: tW });
    // fauld + tassets
    B.add(F(torsoShell(D, L, 0.995, 0.93, 0.04 * s, NU, 3)), { ...o, w: tW });
    B.both((sd, S) => {
      const tg = param(6, 4, (u, v, out) => {
        const a = lerp(-0.9, 0.9, u), yN = lerp(0.95, 0.74, v);
        out.set(sd * D.legX + Math.sin(a) * 0.1 * D.x, yN * s, Math.cos(a) * 0.105 * D.z + 0.01 * s * v);
      }, { wrap: false, lu: 0.2, lv: 0.2 });
      for (const p of twoSided(F(tg), 0.004 * s)) B.add(p, { ...o, w: B.ladder('y', [['thigh' + S, 0.8 * s], ['hips', 0.92 * s]]) });
    });
    // gorget
    B.add(F(torus(0.075 * s, 0.022 * s, 14, 5)), { ...o, pos: [0, 1.5 * s, -0.018 * s], rot: [Math.PI / 2 - 0.1, 0, 0], scl: [1.2, 1, 0.9], w: B.ladder('y', [['chest', 1.48 * s], ['neck', 1.55 * s]]) });
  }
  // shoulders
  B.both((sd, S) => {
    const sx = sd * D.shX;
    const layers = plate ? 2 : id === 'leather' ? 2 : 1;
    for (let i = 0; i < layers; i++) {
      const r = (plate ? 0.088 : 0.078) * s * (1 - i * 0.1);
      const g = param(8, 4, (u, v, out) => {
        const lon = lerp(-2.0, 2.0, u), lat = Math.PI / 2 - v * 1.7;
        out.set(Math.cos(lat) * Math.cos(lon) * r * 0.9, Math.sin(lat) * r * 0.75, Math.cos(lat) * Math.sin(lon) * r);
      }, { wrap: false, flip: sd > 0, lu: 0.25, lv: 0.12 });
      deformBy(g, (p) => { p.x = sd * p.x; });
      const ys = D.shY + (0.02 - i * 0.04) * s;
      for (const p of twoSided(F(g), 0.005 * s)) B.add(p, { ...o, color: i === 0 ? c : shade(c, 0.95), pos: [sx + sd * (0.008 + i * 0.012) * s, ys, D.shZ], rot: [0, 0, -sd * (0.35 + i * 0.12)], bone: 'uarm' + S });
    }
    if (id !== 'chain') {
      // bracers / vambraces
      B.add(F(cylinder(0.037 * s, (plate ? 0.047 : 0.044) * s, 0.15 * s, 14, 2)), { ...o, pos: [sd * (D.shX + 0.005 * s), D.shY - D.ua - D.fa + 0.03 * s, D.shZ], bone: 'farm' + S });
      // greaves
      const gg = cylinder(0.052 * s, 0.064 * s, 0.25 * s, 14, 3);
      if (!plate) deformBy(gg, (p) => { if (p.z < 0) p.z *= 0.6; });
      B.add(F(gg), { ...o, pos: [sd * D.legX, 0.22 * s, 0.008 * s], bone: 'shin' + S });
      if (plate) {
        B.add(F(sphere(0.06 * s, 8, 6)), { ...o, pos: [sd * D.legX, D.legY - D.th + 0.005 * s, 0.03 * s], scl: [0.9, 0.85, 0.7], bone: 'shin' + S });
        B.add(F(blob(0.052 * s, 0.03 * s, 0.11 * s, 0.7, 0.8, 10, 5)), { ...o, pos: [sd * D.legX, 0.07 * s, 0.07 * s], bone: 'foot' + S });
        B.add(F(cylinder(0.05 * s, 0.06 * s, 0.06 * s, 12, 1)), { ...o, pos: [sd * (D.shX + 0.006 * s), D.shY - D.ua - D.fa - 0.035 * s, D.shZ], bone: 'hand' + S });
        // elbow cop
        B.add(F(sphere(0.045 * s, 8, 6)), { ...o, pos: [sd * (D.shX + 0.004 * s), D.shY - D.ua, D.shZ - 0.018 * s], scl: [1, 0.9, 0.8], bone: 'farm' + S });
      }
    } else {
      B.add(cylinder(0.054 * s, 0.05 * s, 0.17 * s, 14, 2), { ...o, pos: [sd * D.shX, D.shY - 0.18 * s, D.shZ], bone: 'uarm' + S });
    }
  });
  if (id === 'gold' || id === 'diamond') {
    B.add(F(rbox(0.06 * s, 0.06 * s, 0.014 * s, 0.4, 8, 8)), { cell: 'gloss', color: id === 'gold' ? '#d01a3a' : '#e8ffff', rough: 0.05, metal: 0.3, glow: id === 'gold' ? 0.3 : 0.6, pos: [0, 1.3 * s, torsoFrontZ(D, L, 1.3, 0.04 * s)], rot: [0, 0, Math.PI / 4], w: tW });
  }
}

// ------------------------------------------------------------------ swords
// Sword geometry with the grip centre at the origin and the blade along +Z.
export function swordGeometry(def, q = 1) {
  const id = def?.id || 'iron';
  return staticGeometry((B) => {
    const blade = col(def.blade);
    const em = def.emissive ? col(def.emissive) : null;
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const glow = em ? clamp(lum(em) / Math.max(0.01, lum(blade)), 0, 2) * 1.6 : 0;
    const wood = id === 'wood', stone = id === 'stone', gem = id === 'ruby' || id === 'diamond';
    const L = wood ? 0.72 : stone ? 0.74 : id === 'diamond' ? 0.92 : 0.84;
    const W = wood ? 0.026 : stone ? 0.034 : 0.025, T = wood ? 0.011 : stone ? 0.012 : 0.0058;
    const z0 = 0.085;
    const rings = [];
    const n = Math.round(8 * q) + 4;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const z = z0 + t * L;
      let w = W * (1 - 0.18 * t), th = T * (1 - 0.3 * t);
      const tip = sstep(0.86, 1.0, t);
      w *= 1 - tip * 0.98; th *= 1 - tip * 0.9;
      const ful = (wood || stone || gem) ? 0 : 0.55 * (1 - sstep(0.55, 0.8, t)) * (t > 0.02 ? 1 : 0);
      const pts = wood ? [[1, 0], [0.8, 0.8], [0.3, 1], [-0.3, 1], [-0.8, 0.8], [-1, 0], [-0.8, -0.8], [-0.3, -1], [0.3, -1], [0.8, -0.8]]
        : gem ? [[1, 0], [0.45, 1], [-0.45, 1], [-1, 0], [-0.45, -1], [0.45, -1]]
          : [[1, 0], [0.55, 1], [0.18, 1], [0.0, 1 - ful], [-0.18, 1], [-0.55, 1], [-1, 0], [-0.55, -1], [-0.18, -1], [0.0, -1 + ful], [0.18, -1], [0.55, -1]];
      rings.push(pts.map(([x, y]) => V3(x * w, y * th, z)));
    }
    const bladeO = { cell: wood ? 'bark' : stone ? 'rock' : gem ? 'gloss' : 'metal', color: blade, rough: def.roughness, metal: def.metalness, glow, tile: wood ? 0.3 : stone ? 0.25 : undefined };
    B.add(loft(rings, { capStart: true }), bladeO);
    if (id === 'diamond') { // inner sparkle core
      B.add(toFlat(new THREE.OctahedronGeometry(0.012, 0)), { pos: [0, 0, z0 + 0.05], scl: [1, 0.6, 2], cell: 'gloss', color: '#ffffff', glow: 2.5, rough: 0.02 });
    }
    // crossguard
    const gold = id === 'gold' || id === 'ruby' || id === 'diamond';
    const gc = wood ? '#6b4a2a' : stone ? '#5a5a55' : gold ? '#d9b04a' : id === 'copper' ? '#a8603a' : '#8a8e94';
    const go = { cell: wood ? 'bark' : stone ? 'rock' : 'metal', color: gc, metal: wood || stone ? 0 : 1, rough: wood || stone ? 0.8 : 0.32 };
    if (wood || stone) B.add(rbox(0.13, 0.03, 0.03, 0.4, 10, 6), { ...go, pos: [0, 0, 0.07] });
    else {
      const gq = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8 * 2 - 1; gq.push(V3(t * 0.105, 0, 0.072 + (gold ? 0.025 * t * t : 0.006 * t * t))); }
      B.add(tube(gq, (t) => (0.011 + 0.006 * Math.abs(t * 2 - 1) ** 3) * 1, 6), go);
      B.add(rbox(0.04, 0.026, 0.03, 0.4, 8, 6), { ...go, pos: [0, 0, 0.074] });
      if (gold) for (const sd of [-1, 1]) B.add(sphere(0.012, 8, 6), { ...go, pos: [sd * 0.108, 0, 0.1] });
      if (gem) B.add(toFlat(new THREE.OctahedronGeometry(0.012, 0)), { pos: [0, 0.016, 0.074], scl: [1, 0.5, 1], cell: 'gloss', color: def.blade, rough: 0.05, metal: 0.3, glow: 0.6 });
    }
    // grip (wrapped)
    B.add(tube([V3(0, 0, -0.075), V3(0, 0, 0.065)], (t) => 0.0155, 8, { caps: false }), { cell: 'leather', color: wood ? '#7a5a3a' : '#3a2416' });
    for (let i = 0; i < 5; i++) B.add(torus(0.016, 0.0035, 8, 3), { pos: [0, 0, -0.06 + i * 0.028], rot: [0, 0.25, 0], cell: 'leather', color: wood ? '#6a4a2a' : '#2a1a10' });
    // pommel
    B.add(gold ? toFlat(sphere(0.024, 8, 6)) : sphere(0.022, 10, 8), { ...go, pos: [0, 0, -0.088], scl: [1, 0.8, 1] });
  });
}
export const SWORD_LENGTH = (def) => (def?.id === 'wood' ? 0.72 : def?.id === 'stone' ? 0.74 : def?.id === 'diamond' ? 0.92 : 0.84) + 0.085;

// helpers for props / hats built outside this file (characters.js)
export { headCap, torsoFrontZ, torsoPoint, torsoW, skirtW, hcV, HEAD_R };
