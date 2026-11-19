// Home Base dojo: wooden hall on a stone base, curved tiled roof with upturned eaves, shoji walls,
// polished floor with a tatami fighting mat, training dummies, weapon racks, gong, paper lanterns,
// "DOJO" sign, cherry-blossom tree and stone lantern. Builder frame = dojo centre, front (door) = local +Z.
import * as THREE from 'three';
import { C } from './props.js';
import { RNG } from './noise.js';
import { makeTree } from './vegetation.js';
import { leafClusterTexture } from './canvasTex.js';

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export function shojiTexture() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#f3ead6'; g.fillRect(0, 0, 256, 256);
  const r = new RNG(9);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(150,120,80,${r.range(0.02, 0.06)})`; g.fillRect(r.range(0, 256), r.range(0, 256), r.range(1, 6), 1); }
  g.fillStyle = '#4a3020';
  for (let i = 0; i <= 4; i++) g.fillRect(i * 64 - (i === 4 ? 10 : 0) - (i === 0 ? 0 : 3), 0, i === 0 || i === 4 ? 10 : 6, 256);
  for (let j = 0; j <= 6; j++) g.fillRect(0, j * 42.6 - (j === 6 ? 10 : 0) - (j === 0 ? 0 : 3), 256, j === 0 || j === 6 ? 10 : 6);
  return tex(c);
}

function tatamiTexture() {
  const S = 1024, [c, g] = cv(S, S); const r = new RNG(4);
  const u = S / 14; // metres -> px (mat area 14 x 14 m)
  g.fillStyle = '#2f3a24'; g.fillRect(0, 0, S, S);
  // classic layout of 2 x 1 m mats, alternating direction in 2 m blocks
  for (let by = 0; by < 7; by++) for (let bx = 0; bx < 7; bx++) {
    const vertical = (bx + by) % 2 === 0;
    for (let k = 0; k < 2; k++) {
      const x = bx * 2 * u + (vertical ? k * u : 0), y = by * 2 * u + (vertical ? 0 : k * u), w = vertical ? u : 2 * u, h = vertical ? 2 * u : u;
      const base = 196 + r.range(-10, 10);
      g.fillStyle = `rgb(${base + 22},${base + 8},${base - 62})`; g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.strokeStyle = 'rgba(90,80,30,0.25)'; g.lineWidth = 1;
      for (let s = 6; s < (vertical ? w : h) - 4; s += 4) { g.beginPath(); if (vertical) { g.moveTo(x + s, y + 4); g.lineTo(x + s, y + h - 4); } else { g.moveTo(x + 4, y + s); g.lineTo(x + w - 4, y + s); } g.stroke(); }
      g.fillStyle = '#20301c'; if (vertical) { g.fillRect(x + 3, y + 3, 7, h - 6); g.fillRect(x + w - 10, y + 3, 7, h - 6); } else { g.fillRect(x + 3, y + 3, w - 6, 7); g.fillRect(x + 3, y + h - 10, w - 6, 7); }
    }
  }
  // a red ring marking the fighting circle
  g.strokeStyle = 'rgba(170,40,30,0.85)'; g.lineWidth = 10; g.beginPath(); g.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2); g.stroke();
  return tex(c);
}

function signTexture() {
  const [c, g] = cv(512, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#4a2c1a'); grd.addColorStop(1, '#2e1a0e');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
  const r = new RNG(3);
  for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(0,0,0,${r.range(0.08, 0.2)})`; g.lineWidth = r.range(1, 3); const y = r.range(0, 256); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(170, y + r.range(-6, 6), 340, y + r.range(-6, 6), 512, y + r.range(-4, 4)); g.stroke(); }
  g.strokeStyle = '#c9a24a'; g.lineWidth = 8; g.strokeRect(10, 10, 492, 236);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 74px "Yu Mincho", "MS Mincho", "Noto Serif JP", serif'; g.fillStyle = '#f2e6c8'; g.fillText('道場', 256, 88);
  g.font = 'bold 72px Georgia, "Times New Roman", serif'; g.fillStyle = '#ffd36a'; g.fillText('DOJO', 256, 180);
  return tex(c);
}

export function buildDojo(b, opts) {
  const { group, lights, disposables } = opts;
  const wood = C('#5a3a24'), wood2 = C('#7a5232'), stone = C('#8f8a80'), tile = C('#3c4452');
  const HX = 10, HZ = 11, FY = 0.6, WT = 4.4; // half sizes of the hall, floor height, wall top
  // ---- stone base, veranda, steps, floors
  b.box('stone', 0, FY / 2 - 0.4, 0.7, 22, FY + 0.8, 25.4, { color: stone });
  b.box('stone', 0, FY + 0.02, 0.7, 22.2, 0.08, 25.6, { color: stone.clone().multiplyScalar(0.85) });
  b.box('polish', 0, FY + 0.05, 0, HX * 2, 0.06, HZ * 2, { color: C('#b8875a') });
  b.box('planks', 0, FY + 0.05, 12.25, HX * 2 + 1.8, 0.07, 2.3, { color: C('#8a6040') });
  b.floor(0, 0.7, 22, 25.4, FY);
  b.stairs('stone', 0, 15.2, 13.4, 5, 0, FY, 3, { color: stone.clone().multiplyScalar(0.9), solid: true });
  b.wall(-11, 13.4, -2.6, 13.4, 0.2); b.wall(2.6, 13.4, 11, 13.4, 0.2);
  // ---- walls: posts, low wooden panels, shoji paper, top beam
  const panel = (x1, z1, x2, z2) => {
    const L = Math.hypot(x2 - x1, z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, ry = Math.atan2(x2 - x1, z2 - z1) + Math.PI / 2;
    b.box('planks', cx, FY + 0.45, cz, L, 0.9, 0.14, { ry, color: wood2 });
    b.box('shoji', cx, FY + 0.9 + 1.25, cz, L, 2.5, 0.1, { ry, keepUV: true });
    b.box('wood', cx, FY + 0.92, cz, L, 0.12, 0.2, { ry, color: wood });
  };
  const side = (pts) => { for (let i = 0; i < pts.length - 1; i++) panel(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); };
  side([[-HX, -HZ], [-5, -HZ], [0, -HZ], [5, -HZ], [HX, -HZ]]);
  side([[-HX, -HZ], [-HX, -5.5], [-HX, 0], [-HX, 5.5], [-HX, HZ]]);
  side([[HX, -HZ], [HX, -5.5], [HX, 0], [HX, 5.5], [HX, HZ]]);
  side([[-HX, HZ], [-5.8, HZ], [-1.6, HZ]]); side([[1.6, HZ], [5.8, HZ], [HX, HZ]]);
  for (const [x, z] of [[-HX, -HZ], [-5, -HZ], [0, -HZ], [5, -HZ], [HX, -HZ], [-HX, -5.5], [-HX, 0], [-HX, 5.5], [-HX, HZ], [HX, -5.5], [HX, 0], [HX, 5.5], [HX, HZ], [-5.8, HZ], [-1.6, HZ], [1.6, HZ], [5.8, HZ]])
    b.box('wood', x, FY + (WT - FY) / 2, z, 0.36, WT - FY, 0.36, { color: wood });
  for (const [x, z, w, d] of [[0, -HZ, HX * 2 + 0.4, 0.4], [0, HZ, HX * 2 + 0.4, 0.4], [-HX, 0, 0.4, HZ * 2], [HX, 0, 0.4, HZ * 2]]) b.box('wood', x, WT - 0.25, z, w, 0.5, d, { color: wood });
  // door: lintel + "DOJO" sign board above it, shoji doors slid open beside the gap
  b.box('wood', 0, FY + 2.9, HZ, 3.6, 0.22, 0.3, { color: wood });
  for (const s of [-1, 1]) b.box('shoji', s * 2.4, FY + 1.45, HZ - 0.22, 1.6, 2.8, 0.08, { keepUV: true });
  b.wall(-HX, -HZ, HX, -HZ); b.wall(-HX, -HZ, -HX, HZ); b.wall(HX, -HZ, HX, HZ); b.wall(-HX, HZ, -1.6, HZ); b.wall(1.6, HZ, HX, HZ);
  // veranda posts (front eave supports)
  for (const x of [-10.6, -5.8, 5.8, 10.6]) { b.box('wood', x, FY + (WT - FY) / 2 - 0.1, 13.1, 0.3, WT - FY - 0.2, 0.3, { color: wood }); b.post(x, 13.1, 0.25); }
  // ceiling
  b.box('planks', 0, WT + 0.02, 0, HX * 2, 0.08, HZ * 2, { color: C('#6a4a30') });
  // ---- curved tiled roof with upturned eaves (ridge along x)
  const prof = []; const N = 7, EZ = 13.8, RY = 9.9;
  for (let i = 0; i <= N; i++) { const t = i / N; prof.push([t * EZ, i === N ? RY - 5.75 + 0.22 : RY - 5.9 * (2 * t - t * t)]); }
  for (const s of [-1, 1]) for (let i = 0; i < N; i++) {
    const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; const len = Math.hypot(z1 - z0, y1 - y0) + 0.18, ang = Math.atan2(y0 - y1, z1 - z0);
    b.box('roof', 0, (y0 + y1) / 2 + 0.12, s * (z0 + z1) / 2, 25.6, 0.26, len, { rx: s * ang, color: tile, tile: 2.2 });
  }
  b.box('roof', 0, RY + 0.18, 0, 26.2, 0.5, 0.8, { color: tile.clone().multiplyScalar(0.8) });
  for (const s of [-1, 1]) {
    b.cone('roof', s * 13.1, RY + 0.55, 0, 0.32, 1.2, { rz: -s * 0.5, seg: 6, color: tile.clone().multiplyScalar(0.8) });
    for (const t of [-1, 1]) b.box('roof', s * 12.6, prof[N][1] + 0.45, t * 13.5, 2.2, 0.24, 1.6, { rz: s * 0.32, color: tile, tile: 2.2 });
  }
  // gable ends
  for (const s of [-1, 1]) { b.prism('plaster', s * HX, WT, 0, 20, 3.6, 0.3, { ry: Math.PI / 2, color: C('#efe6d6') }); b.box('wood', s * (HX + 0.18), WT + 0.1, 0, 0.12, 0.25, 22.4, { color: wood }); }
  // ---- inside: dummies (left), weapon racks (right), gong (back right), lanterns
  const dummies = [];
  for (const z of [-6, -2, 2, 6]) {
    const x = -8.4;
    // only a wooden floor plate here: the game draws its own bouncing practice dummy on this spot
    b.box('wood', x, FY + 0.05, z, 0.9, 0.1, 0.9, { color: wood });
    dummies.push(b.wv(x, FY, z));
  }
  for (const z of [-4.5, 3.5]) {
    const x = 9.55;
    for (const dz of [-1.4, 1.4]) b.box('wood', x, FY + 1.0, z + dz, 0.14, 2.0, 0.14, { color: wood });
    for (const y of [0.5, 1.6]) b.box('wood', x - 0.1, FY + y, z, 0.12, 0.1, 3.0, { color: wood });
    for (let k = 0; k < 5; k++) b.cyl('wood', x - 0.25, FY + 1.05, z - 1.0 + k * 0.5, 0.035, 2.1, { rz: 0.12, seg: 5, color: C(k % 2 ? '#c8a070' : '#8a5a34') });
  }
  b.wall(9.4, -6.2, 9.4, 5.2, 0.15);
  const gx = 6.3, gz = -9.2;
  for (const s of [-1, 1]) b.box('wood', gx + s * 1.35, FY + 1.5, gz, 0.2, 3.0, 0.2, { color: wood });
  b.box('wood', gx, FY + 2.95, gz, 3.1, 0.22, 0.22, { color: wood });
  b.cyl('gold', gx, FY + 1.65, gz, 0.95, 0.09, { rx: Math.PI / 2, seg: 28 });
  b.cyl('gold', gx, FY + 1.65, gz + 0.03, 0.3, 0.1, { rx: Math.PI / 2, seg: 16 });
  b.cyl('wood', gx + 1.2, FY + 0.9, gz + 0.5, 0.04, 1.0, { rz: 0.5, seg: 5, color: wood2 });
  b.sphere('cloth', gx + 1.45, FY + 1.35, gz + 0.5, 0.12, { color: C('#e8dcc4') });
  b.post(gx, gz, 1.5);
  // scroll on the back wall
  b.box('wood', 0, FY + 3.3, -HZ + 0.12, 2.4, 0.08, 0.08, { color: wood });
  const lanternAt = (x, y, z, c = '#d23a2a') => {
    b.cyl('cloth', x, y + 0.42, z, 0.18, 0.08, { seg: 10, color: C('#1a1410') });
    b.sphere('lamp', x, y, z, 0.38, { sy: 0.5, seg: 12 });
    b.cyl('cloth', x, y - 0.44, z, 0.18, 0.08, { seg: 10, color: C('#1a1410') });
    b.cyl('cloth', x, y, z, 0.385, 0.12, { seg: 12, color: C(c) });
  };
  for (const [x, z] of [[-4, -3], [4, -3], [-4, 5], [4, 5]]) { lanternAt(x, WT - 0.9, z); b.cyl('wood', x, WT - 0.25, z, 0.015, 0.5, { seg: 3, color: wood }); }
  for (const x of [-4, 4]) lanternAt(x, 3.2, 12.9);
  b.light(0, 3.6, -4, '#ffcf96', 26, 20, { pri: 2.2 });
  b.light(0, 3.6, 5, '#ffcf96', 22, 18, { pri: 2.1 });
  b.light(0, 3.4, 12.6, '#ffb060', 8, 12, { night: true, pri: 1.2 });
  // ---- outside: stone lantern + cherry-blossom tree
  const sl = [7.2, 17.2];
  b.box('stone', sl[0], 0.15, sl[1], 1.2, 0.3, 1.2, { color: stone });
  b.cyl('stone', sl[0], 0.9, sl[1], 0.22, 1.3, { seg: 6, color: stone });
  b.box('stone', sl[0], 1.62, sl[1], 0.95, 0.16, 0.95, { color: stone });
  b.box('stone', sl[0], 2.0, sl[1], 0.62, 0.6, 0.62, { color: stone.clone().multiplyScalar(0.95) });
  b.box('lamp', sl[0], 2.0, sl[1], 0.66, 0.32, 0.4);
  b.cone('stone', sl[0], 2.55, sl[1], 0.85, 0.5, { seg: 4, ry: Math.PI / 4, color: stone.clone().multiplyScalar(0.9) });
  b.sphere('stone', sl[0], 2.88, sl[1], 0.14, { color: stone });
  b.post(sl[0], sl[1], 0.6);
  b.light(sl[0], 2.0, sl[1], '#ffb060', 5, 9, { night: true });
  const tp = [-12.5, 17.5];
  const tree = makeTree('oak', 4242, false);
  b.geo('wood', tree.parts[0].geo, { x: tp[0], y: -0.2, z: tp[1], sx: 0.85, sy: 0.85, sz: 0.85, ry: 0.6, keepUV: true, color: C('#4a3026') });
  b.post(tp[0], tp[1], 0.5);
  const leafTex = leafClusterTexture(77, 'small'); disposables.push(leafTex);
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, color: new THREE.Color('#ffb3cc'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true });
  disposables.push(leafMat);
  const lg = tree.parts[1].geo;
  const leaves = new THREE.Mesh(lg, leafMat); leaves.name = 'sakura';
  leaves.position.copy(b.wv(tp[0], -0.2, tp[1])); leaves.rotation.y = b.frame.yaw + 0.6; leaves.scale.setScalar(0.85);
  leaves.castShadow = true; leaves.receiveShadow = true; group.add(leaves);
  disposables.push(lg, tree.parts[0].geo);
  // ---- textured pieces: tatami mat, DOJO signs (outside over the door + scroll inside)
  const tt = tatamiTexture(); disposables.push(tt);
  const matGeo = new THREE.PlaneGeometry(14, 14); matGeo.rotateX(-Math.PI / 2);
  const tatami = new THREE.Mesh(matGeo, new THREE.MeshStandardMaterial({ map: tt, roughness: 0.85 }));
  tatami.position.copy(b.wv(0, FY + 0.09, 1)); tatami.rotation.y = b.frame.yaw; tatami.receiveShadow = true; tatami.name = 'tatami';
  group.add(tatami); disposables.push(matGeo, tatami.material);
  const st = signTexture(); disposables.push(st);
  const P = [], UV = [], I = [];
  const quad = (cx, cy, cz, w, h, facing) => {
    const base = P.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = b.wv(cx + u * w / 2 * facing, cy + v * h / 2, cz); P.push(p.x, p.y, p.z); UV.push((u + 1) / 2, (v + 1) / 2); }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad(0, FY + 3.5, HZ + 0.17, 2.6, 1.3, 1);
  quad(0, FY + 2.45, -HZ + 0.11, 2.0, 1.0, 1);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); sg.setIndex(I); sg.computeVertexNormals();
  const sign = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: st, roughness: 0.7, side: THREE.DoubleSide })); sign.name = 'dojoSign';
  group.add(sign); disposables.push(sg, sign.material);
  b.box('wood', 0, FY + 3.5, HZ + 0.1, 2.8, 1.5, 0.08, { color: wood });
  void lights;
  return {
    pos: b.wv(0, 0, 0), door: b.wv(0, FY, 12.3), mat: { pos: b.wv(0, FY, 1), radius: 7 },
    master: b.wv(0, FY, -8.6), masterYaw: b.frame.yaw, dummies, radius: 16,
    path: b.wv(0, 0, 16.5),
  };
}
