// Buildings: home house/market/garden/dock/plaza, 9 temple styles, trading posts, bandit camps, boss arenas, portals.
import * as THREE from 'three';
import { RNG } from './noise.js';
import { C, lanternPost, campfire, crate, barrel, sack, stall, tent, bedroll, logSeat, signPost, standingStone, brazier, well, fence } from './props.js';
import { portalRing, runeGeometry, runeMaterial, swirlMaterial, orbMaterial, barrierMaterial } from './portals.js';
import { glowTexture } from './canvasTex.js';

const DARKWOOD = C('#5a4430');

// ---------------------------------------------------------------- house (home)
export function house(b, opts = {}) {
  const stone = C('#9a958a'), plaster = C('#e8dcc4'), beam = C('#4a3624'), roofC = C(opts.roof || '#7a4a34');
  const W = 12, Dp = 9, hs = 1.4, hw = 3.6;
  const hx = W / 2, hz = Dp / 2, t = 0.5, door = 0.85;
  // foundation + stone lower walls
  b.box('stone', 0, -0.4, 0, W + 0.6, 1.0, Dp + 0.6, { color: stone.clone().multiplyScalar(0.8) });
  const wallSeg = (mat, y0, y1, color) => {
    const h = y1 - y0, yc = (y0 + y1) / 2;
    b.box(mat, 0, yc, -hz, W, h, t, { color });
    b.box(mat, -hx, yc, 0, t, h, Dp, { color });
    b.box(mat, hx, yc, 0, t, h, Dp, { color });
    b.box(mat, -(hx + door) / 2, yc, hz, hx - door, h, t, { color });
    b.box(mat, (hx + door) / 2, yc, hz, hx - door, h, t, { color });
  };
  wallSeg('stone', 0, hs, stone);
  wallSeg('plaster', hs, hw, plaster);
  b.box('plaster', 0, (2.45 + hw) / 2, hz, door * 2, hw - 2.45, t, { color: plaster });
  // timber framing (outside faces)
  const o = t / 2 + 0.03;
  for (const [y, h] of [[hs + 0.05, 0.16], [hw - 0.06, 0.16]]) {
    b.box('wood', 0, y, -hz - o, W + 0.1, h, 0.1, { color: beam }); b.box('wood', 0, y, hz + o, W + 0.1, h, 0.1, { color: beam });
    b.box('wood', -hx - o, y, 0, 0.1, h, Dp + 0.1, { color: beam }); b.box('wood', hx + o, y, 0, 0.1, h, Dp + 0.1, { color: beam });
  }
  for (const x of [-hx, -3, 3, hx]) for (const z of [-hz - o, hz + o]) b.box('wood', x, (hs + hw) / 2, z, 0.16, hw - hs, 0.1, { color: beam });
  for (const z of [-hz, -1.5, 1.5, hz]) for (const x of [-hx - o, hx + o]) b.box('wood', x, (hs + hw) / 2, z, 0.1, hw - hs, 0.16, { color: beam });
  for (const s of [-1, 1]) { b.box('wood', s * (hx - 1.5), (hs + hw) / 2, -hz - o, 0.12, 2.6, 0.08, { rz: s * 0.75, color: beam }); }
  // door frame + open door
  b.box('wood', -door - 0.08, 1.25, hz + 0.02, 0.16, 2.5, t + 0.1, { color: beam }); b.box('wood', door + 0.08, 1.25, hz + 0.02, 0.16, 2.5, t + 0.1, { color: beam });
  b.box('wood', 0, 2.5, hz + 0.02, door * 2 + 0.3, 0.18, t + 0.1, { color: beam });
  b.box('planks', -door + 0.1 + 0.75 * Math.cos(1.3), 1.2, hz - 0.1 - 0.75 * Math.sin(1.3), 1.5, 2.3, 0.09, { ry: 1.3, color: C('#8a6040') });
  b.stairs('stone', 0, hz + 1.1, hz + 0.25, 2.2, 0.0, 0.3, 2, { color: stone });
  // windows (glass glows at night)
  const win = (x, y, z, ry) => {
    b.box('window', x, y, z, 1.1, 1.1, 0.08, { ry });
    const fz = 0.07;
    b.box('wood', x, y, z, 1.3, 0.12, 0.14 + fz, { ry, color: beam });
    b.box('wood', x, y + 0.6, z, 1.35, 0.14, 0.2 + fz, { ry, color: beam });
    b.box('wood', x, y - 0.6, z, 1.45, 0.12, 0.3 + fz, { ry, color: beam });
    b.box('wood', x, y, z, 0.1, 1.2, 0.14 + fz, { ry, color: beam });
  };
  const wy = 2.35;
  for (const x of [-3.6, 3.6]) { win(x, wy, hz + 0.27, 0); win(x, wy, hz - 0.27, 0); win(x, wy, -hz - 0.27, 0); win(x, wy, -hz + 0.27, 0); }
  for (const s of [-1, 1]) { win(s * (hx + 0.27), wy, 0, Math.PI / 2); win(s * (hx - 0.27), wy, 0, Math.PI / 2); }
  // gable roof (ridge along x)
  const ov = 0.8, eave = hz + ov, rise = 3.2, ang = Math.atan2(rise, eave), sl = Math.hypot(rise, eave);
  for (const s of [-1, 1]) {
    b.box('roof', 0, hw + rise / 2 + 0.12, s * eave / 2, W + 1.6, 0.22, sl + 0.25, { rx: s * ang, color: roofC });
  }
  b.box('wood', 0, hw + rise + 0.18, 0, W + 1.8, 0.25, 0.35, { color: beam });
  for (const s of [-1, 1]) b.prism('plaster', s * hx, hw, 0, Dp + 0.02, rise, t, { ry: Math.PI / 2, color: plaster });
  // chimney
  b.box('stone', -hx + 1.6, 4.2, -1.8, 1.1, 8.6, 1.1, { color: stone.clone().multiplyScalar(0.9) });
  b.box('stone', -hx + 1.6, 8.55, -1.8, 1.35, 0.3, 1.35, { color: stone.clone().multiplyScalar(0.7) });
  // interior floor
  b.box('planks', 0, 0.15, 0, W - t, 0.3, Dp - t, { color: C('#a07a52') });
  b.floor(0, 0, W - t, Dp - t, 0.3);
  // furniture: bed (back right)
  const bx = 3.7, bz = -2.6;
  b.box('planks', bx, 0.55, bz, 1.8, 0.35, 2.6, { color: C('#7a5434') });
  b.box('cloth', bx, 0.82, bz + 0.05, 1.6, 0.22, 2.4, { color: C('#efe8dc') });
  b.box('cloth', bx, 0.9, bz + 0.45, 1.68, 0.12, 1.65, { color: C('#b03a3a') });
  b.box('cloth', bx, 1.0, bz - 0.85, 1.1, 0.18, 0.5, { color: C('#f6f2ea') });
  b.box('planks', bx, 1.1, bz - 1.3, 1.9, 1.3, 0.12, { color: C('#6a4428') });
  for (const [x, z] of [[-0.85, -1.25], [0.85, -1.25], [-0.85, 1.25], [0.85, 1.25]]) b.box('wood', bx + x, 0.55, bz + z, 0.14, 0.6, 0.14, { color: beam });
  b.post(bx, bz, 1.1);
  // chest at foot of bed
  b.box('planks', bx, 0.62, bz + 1.85, 1.1, 0.62, 0.62, { color: C('#8a5a30') });
  b.box('planks', bx, 1.0, bz + 1.85, 1.14, 0.14, 0.66, { color: C('#7a4a28') });
  for (const x of [-0.4, 0.4]) b.box('metal', bx + x, 0.78, bz + 1.85, 0.08, 0.66, 0.68, { color: C('#4a4a4a') });
  b.box('gold', bx, 0.85, bz + 2.17, 0.14, 0.18, 0.04);
  // table + stools
  b.box('planks', -2.2, 1.05, 0.6, 1.8, 0.1, 1.0, { color: C('#9a7048') });
  for (const [x, z] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) b.box('wood', -2.2 + x, 0.65, 0.6 + z, 0.1, 0.75, 0.1, { color: beam });
  for (const z of [-0.5, 1.7]) { b.cyl('planks', -2.2, 0.55, z, 0.25, 0.5, { seg: 10, color: C('#8a6040') }); }
  b.cyl('glow', -2.2, 1.2, 0.6, 0.05, 0.2, { seg: 8, color: C('#ffb050') });
  b.post(-2.2, 0.6, 0.9);
  // rug
  b.box('cloth', 0.2, 0.31, 1.0, 3.2, 0.02, 2.2, { color: C('#7a3a5a') });
  // fireplace (inside left wall)
  const fx = -hx + 0.75, fz = -1.8;
  b.box('stone', fx, 0.9, fz, 1.2, 1.8, 2.0, { color: stone });
  b.box('stone', fx + 0.25, 1.75, fz, 0.9, 0.25, 2.2, { color: stone.clone().multiplyScalar(0.8) });
  b.box('glow', fx + 0.35, 0.55, fz, 0.6, 0.06, 1.0, { color: C('#ff5a10') });
  b.box('stone', fx + 0.62, 0.9, fz, 0.05, 1.1, 1.2, { color: C('#1a1410') });
  b.post(fx, fz, 1.0);
  // shelf
  b.box('planks', -1.5, 2.2, -hz + 0.4, 2.4, 0.08, 0.4, { color: C('#7a5434') });
  for (let i = 0; i < 6; i++) b.box('cloth', -2.5 + i * 0.38, 2.42, -hz + 0.4, 0.14, 0.36, 0.3, { color: C(['#7a2a2a', '#2a4a7a', '#4a6a2a', '#8a6a2a', '#5a2a6a', '#2a6a6a'][i]) });
  // walls as colliders
  b.wall(-hx, -hz, hx, -hz); b.wall(-hx, -hz, -hx, hz); b.wall(hx, -hz, hx, hz);
  b.wall(-hx, hz, -door, hz); b.wall(door, hz, hx, hz);
  const fireLight = b.light(fx + 0.6, 1.0, fz, '#ff8a3a', 10, 10, { flicker: true, pri: 2 });
  const inLight = b.light(0.5, 2.9, 0.5, '#ffc078', 9, 11, { night: true, pri: 2 });
  return { bed: b.wv(bx, 0.95, bz), fireAt: b.wv(fx + 0.4, 0.6, fz), fireLight, inLight };
}

// ---------------------------------------------------------------- temple styles
export const TEMPLE_STYLES = [
  { name: 'grove', stone: '#a29e90', mat: 'stone', roofMat: 'roof', roof: '#4f7a5a', cols: 'round', roofType: 'gable', platH: 1.6, wallH: 7, moss: '#56803a' },
  { name: 'tide', stone: '#f0ebe0', mat: 'marble', roofMat: 'marble', roof: '#3cb4b8', cols: 'round', roofType: 'dome', platH: 1.8, wallH: 7 },
  { name: 'forge', stone: '#2f2a28', mat: 'obsidian', roofMat: 'obsidian', roof: '#241e1c', cols: 'square', roofType: 'ziggurat', platH: 2.2, wallH: 7.5, glow: '#ff5a10' },
  { name: 'frost', stone: '#a9c4da', mat: 'stone', roofMat: 'ice', roof: '#7cc4ec', cols: 'crystal', roofType: 'spire', platH: 1.8, wallH: 7.5 },
  { name: 'mesa', stone: '#b4673f', mat: 'stone', roofMat: 'stone', roof: '#a05a36', cols: 'square', roofType: 'pyramid', platH: 2.6, wallH: 6.5 },
  { name: 'storm', stone: '#4c5462', mat: 'stone', roofMat: 'metal', roof: '#5a6472', cols: 'square', roofType: 'tower', platH: 1.8, wallH: 7, glow: '#a9a0ff' },
  { name: 'sun', stone: '#dcc28c', mat: 'stone', roofMat: 'stone', roof: '#d0b47c', cols: 'square', roofType: 'flat', platH: 1.6, wallH: 7.5, gold: true },
  { name: 'shadow', stone: '#41374f', mat: 'stone', roofMat: 'roof', roof: '#2a2238', cols: 'gothic', roofType: 'steep', platH: 1.6, wallH: 8, glow: '#8a4dff' },
  { name: 'bone', stone: '#5c5654', mat: 'stone', roofMat: 'roof', roof: '#3a3432', cols: 'broken', roofType: 'broken', platH: 1.8, wallH: 7, glow: '#d04dff' },
];

function column(b, S, x, z, y0, h, r, mat, color) {
  const cap = color.clone().multiplyScalar(1.08);
  if (S.cols === 'round' || S.cols === 'broken') {
    const hh = S.cols === 'broken' && r.chance(0.45) ? h * r.range(0.25, 0.7) : h;
    b.box(mat, x, y0 + 0.2, z, 1.3, 0.4, 1.3, { color: cap });
    b.cyl(mat, x, y0 + 0.4 + (hh - 0.8) / 2, z, 0.46, hh - 0.8, { seg: 16, rTop: 0.9, color });
    if (hh === h) b.box(mat, x, y0 + h - 0.2, z, 1.3, 0.4, 1.3, { color: cap });
    else { b.cyl(mat, x + r.range(-2, 2), y0 + 0.45, z + r.range(1.2, 2.5), 0.45, 1.4, { rz: Math.PI / 2, ry: r.next() * 3, seg: 12, color }); }
    if (S.moss) b.cyl('cloth', x, y0 + 0.8, z, 0.5, 1.0, { seg: 10, color: C(S.moss), rTop: 0.85 });
  } else if (S.cols === 'square') {
    b.box(mat, x, y0 + 0.25, z, 1.4, 0.5, 1.4, { color: cap });
    b.box(mat, x, y0 + h / 2, z, 0.95, h - 0.8, 0.95, { color });
    b.box(mat, x, y0 + h - 0.25, z, 1.4, 0.5, 1.4, { color: cap });
    if (S.gold) b.box('gold', x, y0 + h - 0.6, z, 1.0, 0.18, 1.0);
  } else if (S.cols === 'crystal') {
    b.cyl('ice', x, y0 + h / 2, z, 0.55, h, { seg: 6, color: C('#cfeeff') });
    b.cone('ice', x, y0 + h + 0.6, z, 0.55, 1.2, { seg: 6, color: C('#e6f7ff') });
  } else if (S.cols === 'gothic') {
    for (const [dx, dz] of [[-0.28, -0.28], [0.28, -0.28], [0.28, 0.28], [-0.28, 0.28]]) b.cyl(mat, x + dx, y0 + h / 2, z + dz, 0.2, h, { seg: 8, color });
    b.box(mat, x, y0 + 0.3, z, 1.2, 0.6, 1.2, { color: cap });
    b.box(mat, x, y0 + h - 0.2, z, 1.2, 0.4, 1.2, { color: cap });
  }
  b.post(x, z, 0.65);
}

// Builds a temple in the builder frame (front = local +Z). Returns dynamic anchors.
export function temple(b, idx, power, flames, tier = 1) {
  const S = TEMPLE_STYLES[idx]; const r = new RNG(idx * 911 + 5);
  const mat = S.mat, sc = C(S.stone), sc2 = sc.clone().multiplyScalar(0.82), rc = C(S.roof);
  const W = 22, Dp = 30, H = S.platH, Hc = S.wallH;
  const cx = 7, cz0 = -12, cz1 = 6, door = 1.6, doorH = 4.6;
  // platform (two tiers) + stairs
  b.box(mat, 0, (H - 1.5) / 2, 0, W, H + 1.5, Dp, { color: sc2 });
  b.box(mat, 0, H - 0.12, 0, W + 0.4, 0.3, Dp + 0.4, { color: sc });
  b.floor(0, 0, W, Dp, H);
  const nSt = Math.max(4, Math.round(H / 0.3)), stD = 0.45, stW = 10;
  b.stairs(mat, 0, Dp / 2 + nSt * stD, Dp / 2, stW, 0, H, nSt, { color: sc, solid: true });
  for (const s of [-1, 1]) b.box(mat, s * (stW / 2 + 0.4), H / 2, Dp / 2 + nSt * stD / 2, 0.8, H + 0.3, nSt * stD, { color: sc2 });
  b.wall(-W / 2, -Dp / 2, W / 2, -Dp / 2, 0.4); b.wall(-W / 2, -Dp / 2, -W / 2, Dp / 2, 0.4); b.wall(W / 2, -Dp / 2, W / 2, Dp / 2, 0.4);
  b.wall(-W / 2, Dp / 2, -stW / 2 - 0.2, Dp / 2, 0.4); b.wall(stW / 2 + 0.2, Dp / 2, W / 2, Dp / 2, 0.4);
  // cella walls
  const y0 = H, wt = 0.8;
  const wbox = (x, z, w, d, h = Hc, yb = y0) => b.box(mat, x, yb + h / 2, z, w, h, d, { color: sc });
  wbox(0, cz0, cx * 2 + wt, wt); wbox(-cx, (cz0 + cz1) / 2, wt, cz1 - cz0); wbox(cx, (cz0 + cz1) / 2, wt, cz1 - cz0);
  wbox(-(cx + door) / 2, cz1, cx - door + wt / 2, wt); wbox((cx + door) / 2, cz1, cx - door + wt / 2, wt);
  wbox(0, cz1, door * 2, wt, Hc - doorH, y0 + doorH);
  b.box(mat, 0, y0 + doorH + 0.2, cz1 + 0.5, door * 2 + 1.0, 0.5, 0.3, { color: sc.clone().multiplyScalar(1.1) });
  for (const s of [-1, 1]) b.box(mat, s * (door + 0.25), y0 + doorH / 2, cz1 + 0.45, 0.5, doorH, 0.3, { color: sc.clone().multiplyScalar(1.1) });
  b.wall(-cx, cz0, cx, cz0); b.wall(-cx, cz0, -cx, cz1); b.wall(cx, cz0, cx, cz1); b.wall(-cx, cz1, -door, cz1); b.wall(door, cz1, cx, cz1);
  // interior floor inlay
  b.box('cobble', 0, y0 + 0.02, (cz0 + cz1) / 2, cx * 2 - 0.8, 0.06, cz1 - cz0 - 0.8, { color: sc.clone().multiplyScalar(0.9) });
  // columns: portico + sides
  const colH = Hc + 0.4;
  for (const x of [-6, -2, 2, 6]) column(b, S, x, 10.5, y0, colH, r, mat, sc);
  if (tier > 0) for (const z of [-10, -5, 0, 5]) for (const s of [-1, 1]) column(b, S, s * 9.4, z, y0, colH, r, mat, sc);
  // entablature
  const ey = y0 + colH;
  if (S.roofType !== 'broken') {
    b.box(mat, 0, ey + 0.4, 10.5, 20.2, 0.8, 1.6, { color: sc });
    for (const s of [-1, 1]) b.box(mat, s * 9.4, ey + 0.4, -1.5, 1.6, 0.8, 25.6, { color: sc });
    b.box(mat, 0, ey + 0.4, -12, 20.2, 0.8, 1.6, { color: sc });
  }
  // roof
  const top = ey + 0.8, rx0 = 10.6, rz0 = -13, rz1 = 11.6, rl = rz1 - rz0, rzc = (rz0 + rz1) / 2;
  const slab = (yy) => b.box(mat, 0, yy, rzc, rx0 * 2, 0.6, rl, { color: sc2 });
  const gable = (rise, mat2, color) => {
    const ang = Math.atan2(rise, rx0), sl = Math.hypot(rise, rx0);
    for (const s of [-1, 1]) b.box(mat2, s * rx0 / 2, top + rise / 2 + 0.15, rzc, sl + 0.3, 0.3, rl + 0.6, { rz: -s * ang, color });
    for (const z of [rz1, rz0]) b.prism(mat, 0, top, z, rx0 * 2, rise, 0.6, { color: sc });
  };
  switch (S.roofType) {
    case 'gable': gable(4.2, S.roofMat, rc); break;
    case 'steep': {
      gable(8.5, S.roofMat, rc);
      for (const [x, z] of [[-9.4, 10.5], [9.4, 10.5], [-9.4, -12], [9.4, -12]]) { b.box(mat, x, top + 1.5, z, 1.4, 3, 1.4, { color: sc }); b.cone(S.roofMat, x, top + 4.5, z, 0.9, 3.2, { seg: 4, ry: Math.PI / 4, color: rc }); }
      b.cone(S.roofMat, 0, top + 11, rz1 - 0.5, 0.6, 5, { seg: 6, color: rc });
      break;
    }
    case 'dome': {
      slab(top + 0.3);
      b.cyl(mat, 0, top + 1.6, -3, 6.2, 2.0, { seg: 24, color: sc });
      const g = new THREE.SphereGeometry(6.4, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      b.geo(S.roofMat, g, { x: 0, y: top + 2.6, z: -3, sy: 0.85, color: rc, ownGeo: true });
      b.cyl('gold', 0, top + 8.3, -3, 0.25, 1.4, { seg: 8 });
      b.sphere('gold', 0, top + 9.1, -3, 0.35);
      for (const [x, z] of [[-9.4, 10.5], [9.4, 10.5], [-9.4, -12], [9.4, -12]]) b.sphere(S.roofMat, x, top + 0.9, z, 0.9, { sy: 0.8, color: rc });
      break;
    }
    case 'ziggurat': {
      slab(top + 0.3);
      for (let k = 0; k < 3; k++) b.box(mat, 0, top + 1.2 + k * 1.6, rzc - 2, 16 - k * 4.5, 1.6, 20 - k * 5.5, { color: k % 2 ? sc : sc2 });
      for (const s of [-1, 1]) for (const z of [rz1 - 0.5, rz0 + 0.5]) b.cone(mat, s * 9.6, top + 2.2, z, 0.6, 3.5, { seg: 5, color: sc2 });
      break;
    }
    case 'spire': {
      gable(5.0, S.roofMat, rc);
      b.cone('ice', 0, top + 10, -3, 2.2, 10, { seg: 6, color: C('#dff4ff') });
      for (const [x, z] of [[-9.4, 10.5], [9.4, 10.5], [-9.4, -12], [9.4, -12]]) b.cone('ice', x, top + 2.4, z, 0.8, 4.2, { seg: 6, color: C('#e6f7ff') });
      // icicles along the eaves
      for (let i = 0; i < 26; i++) { const z = rz0 + (i / 25) * rl; for (const s of [-1, 1]) b.cone('ice', s * rx0, top - 0.5, z, 0.12, r.range(0.6, 1.6), { rx: Math.PI, seg: 5, color: C('#e8f8ff') }); }
      break;
    }
    case 'pyramid': {
      slab(top + 0.3);
      for (let k = 0; k < 5; k++) b.box(mat, 0, top + 1.0 + k * 1.3, rzc, 20 - k * 3.6, 1.3, 24 - k * 4.2, { color: k % 2 ? sc : sc.clone().multiplyScalar(0.9) });
      b.box(mat, 0, top + 7.9, rzc, 3.2, 2.2, 3.2, { color: sc2 });
      b.box('glow', 0, top + 7.9, rzc + 1.62, 1.0, 1.4, 0.05, { color: C(power).multiplyScalar(0.5) });
      break;
    }
    case 'tower': {
      slab(top + 0.3);
      b.box(mat, 0, top + 4.6, -4, 5, 8, 5, { color: sc });
      b.cone(S.roofMat, 0, top + 10.3, -4, 3.9, 3.5, { seg: 4, ry: Math.PI / 4, color: rc });
      b.cyl('metal', 0, top + 13.5, -4, 0.08, 3.5, { seg: 6, color: C('#b0a080') });
      b.sphere('glow', 0, top + 15.3, -4, 0.35, { color: C(S.glow).multiplyScalar(0.8) });
      for (const s of [-1, 1]) { b.box('glow', s * 2.52, top + 5.5, -4, 0.05, 4, 0.4, { color: C(S.glow).multiplyScalar(0.6) }); }
      for (const [x, z] of [[-9.4, 10.5], [9.4, 10.5], [-9.4, -12], [9.4, -12]]) { b.cyl('metal', x, top + 2.3, z, 0.07, 4, { seg: 6, color: C('#b0a080') }); b.cone('glow', x, top + 4.6, z, 0.3, 0.9, { seg: 6, color: C(S.glow).multiplyScalar(0.7) }); }
      break;
    }
    case 'flat': {
      slab(top + 0.3);
      b.box(mat, 0, top + 0.85, rzc, rx0 * 2 + 0.6, 0.5, rl + 0.6, { color: sc.clone().multiplyScalar(1.08) });
      // pylon gate in front of the stairs
      for (const s of [-1, 1]) {
        b.cyl(mat, s * 8.5, H + 5.5, 13.6, 3.6, 11, { seg: 4, rTop: 0.72, ry: Math.PI / 4, color: sc });
        b.box('gold', s * 8.5, H + 11.2, 13.6, 4.0, 0.35, 4.0);
      }
      for (const s of [-1, 1]) { b.cyl(mat, s * 12.5, 4.5, 18, 0.7, 9, { seg: 4, rTop: 0.45, ry: Math.PI / 4, color: sc }); b.cone('gold', s * 12.5, 9.6, 18, 0.45, 1.3, { seg: 4, ry: Math.PI / 4 }); b.post(s * 12.5, 18, 0.8); }
      b.cyl('gold', 0, top + 2.0, 11.3, 1.4, 0.2, { rx: Math.PI / 2, seg: 24 });
      break;
    }
    case 'broken': {
      // only the back half of the roof survives
      const rise = 4.2, ang = Math.atan2(rise, rx0), sl = Math.hypot(rise, rx0), half = rl * 0.45;
      for (const s of [-1, 1]) b.box(S.roofMat, s * rx0 / 2, top + rise / 2 + 0.15, rz0 + half / 2, sl + 0.3, 0.3, half, { rz: -s * ang, color: rc });
      b.prism(mat, 0, top, rz0, rx0 * 2, rise, 0.6, { color: sc });
      b.box(mat, -6, ey + 0.4, -6, 8, 0.8, 1.4, { color: sc, rz: 0.08 });
      for (let i = 0; i < 14; i++) b.box(mat, r.range(-14, 14), r.range(0.2, 0.6), r.range(-18, 20), r.range(0.6, 1.6), r.range(0.4, 1.0), r.range(0.6, 1.6), { ry: r.next() * 3, rx: r.range(-0.3, 0.3), color: sc2 });
      break;
    }
  }
  // glowing trim lines
  if (S.glow) {
    const g = C(S.glow).multiplyScalar(0.55);
    b.box('glow', 0, H + 0.05, Dp / 2 + 0.22, W + 0.4, 0.08, 0.05, { color: g });
    for (const s of [-1, 1]) b.box('glow', s * (W / 2 + 0.22), H + 0.05, 0, 0.05, 0.08, Dp + 0.4, { color: g });
    b.box('glow', 0, y0 + doorH + 0.5, cz1 + 0.66, door * 2 + 0.6, 0.12, 0.05, { color: g });
  }
  // crystal table (stone, with a pedestal base); the floating crystal is a dynamic mesh
  const az = -9;
  b.box(mat, 0, y0 + 0.2, az, 4.2, 0.4, 3.2, { color: sc2 });
  b.cyl(mat, 0, y0 + 0.85, az, 0.75, 1.0, { seg: 8, rTop: 0.8, color: sc });
  b.cyl(mat, 0, y0 + 1.45, az, 1.35, 0.22, { seg: 12, color: sc.clone().multiplyScalar(1.1) });
  b.floor(0, az, 4.2, 3.2, 0.4);
  b.post(0, az, 1.4);
  // braziers beside the table
  for (const s of [-1, 1]) brazier(b, flames, s * 4, az + 1, 1.2, false);
  b.light(-4, y0 + 2.2, az + 1, '#ff8a3a', 8, 10, { flicker: true, pri: 1.5 });
  const sS = b.frame.s ?? 1;
  // great temple: flanking towers
  if (tier === 2) for (const s of [-1, 1]) {
    b.box(mat, s * 14.5, H / 2 - 0.5, 9, 5.6, H + 1, 5.6, { color: sc2 });
    b.box(mat, s * 14.5, H + (Hc + 7) / 2, 9, 3.8, Hc + 7, 3.8, { color: sc });
    b.box(mat, s * 14.5, H + Hc + 7.3, 9, 4.6, 0.6, 4.6, { color: sc2 });
    b.cone(S.roofMat, s * 14.5, H + Hc + 9.6, 9, 2.8, 4.4, { seg: 4, ry: Math.PI / 4, color: rc });
    b.box('glow', s * 14.5, H + Hc + 3, 9 + 1.92, 0.7, 2.2, 0.05, { color: C(power).multiplyScalar(0.45) });
    b.post(s * 14.5, 9, 3.2);
  }
  const tableTop = b.wv(0, y0 + 1.57, az);
  const orbLight = b.light(0, y0 + 3.2, az, power, 30, 22, { pri: 3 });
  return {
    orb: tableTop.clone().add(new THREE.Vector3(0, 1.4, 0)), altar: tableTop, door: b.wv(0, y0, cz1 + 1.6), doorCentre: b.wv(0, y0 + doorH / 2, cz1 + 0.05),
    doorW: door * 2 * sS, doorH: doorH * sS, orbLight, yaw: b.frame.yaw, tier,
    barrierSeg: (() => { const [x1, z1] = b.w(-door, cz1), [x2, z2] = b.w(door, cz1); return { x1, z1, x2, z2, r: 0.3 }; })(),
    frontZ: (Dp / 2 + nSt * stD) * sS,
  };
}

// Dynamic temple pieces: floating power crystal (+ halo), glowing ring on the crystal table, door barrier.
export function templeDynamic(group, anchors, power, noiseTex, tier = 1) {
  const cs = [0.85, 1.05, 1.3][tier] ?? 1;
  const cg = new THREE.OctahedronGeometry(1, 0); cg.scale(0.42 * cs, 0.95 * cs, 0.42 * cs);
  const orb = new THREE.Mesh(cg, orbMaterial(power));
  const shard = new THREE.Mesh(cg, orb.material); shard.scale.setScalar(0.4); shard.position.set(0.55 * cs, -0.3 * cs, 0.1); orb.add(shard);
  const shard2 = new THREE.Mesh(cg, orb.material); shard2.scale.setScalar(0.32); shard2.position.set(-0.5 * cs, -0.45 * cs, -0.2); orb.add(shard2);
  const base = anchors.orb.clone(); base.y += (cs - 1) * 0.6;
  orb.position.copy(base); group.add(orb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(power), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }));
  halo.scale.setScalar(4.2 * cs); halo.position.copy(base); group.add(halo);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.15, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(power), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.copy(anchors.altar).add(new THREE.Vector3(0, 0.03, 0)); group.add(ring);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(anchors.doorW, anchors.doorH), barrierMaterial(power, noiseTex));
  bar.position.copy(anchors.doorCentre); bar.rotation.y = anchors.yaw; group.add(bar);
  bar.renderOrder = 6; halo.renderOrder = 6; ring.renderOrder = 6;
  return {
    orb, halo, bar, ring,
    setClaimed(c) { orb.visible = !c; halo.visible = !c; ring.material.opacity = c ? 0.15 : 0.9; },
    update(t) {
      orb.material.uniforms.uTime.value = t; orb.position.y = base.y + Math.sin(t * 1.1 + tier) * 0.12; orb.rotation.y = t * 0.35 + tier;
      halo.position.y = orb.position.y; bar.material.uniforms.uTime.value = t; halo.material.opacity = 0.7 + 0.2 * Math.sin(t * 2.2 + tier);
    },
    dispose() { cg.dispose(); orb.material.dispose(); halo.material.map.dispose(); halo.material.dispose(); ring.geometry.dispose(); ring.material.dispose(); bar.geometry.dispose(); bar.material.dispose(); },
  };
}

// ---------------------------------------------------------------- portals
export const PORTAL_THEMES = [
  { stone: '#7f8a6e', mat: 'stone' }, { stone: '#e6dcc4', mat: 'marble' }, { stone: '#2e2a2a', mat: 'obsidian' }, { stone: '#cfe6f4', mat: 'ice' },
  { stone: '#b0603a', mat: 'stone' }, { stone: '#4a5260', mat: 'stone' }, { stone: '#dcc08a', mat: 'stone' }, { stone: '#3e3450', mat: 'stone' }, { stone: '#5c5654', mat: 'stone' },
];

// Themed decorations on a home portal (builder frame = portal frame).
export function portalDecor(b, i, ring, power) {
  const R = ring.R, cy = ring.cy, r = new RNG(i * 37 + 1);
  const at = (t, rr) => [Math.sin(t) * rr, cy + Math.cos(t) * rr];
  switch (i) {
    case 0: // vines + leaves
      for (let k = 0; k < 18; k++) { const t = r.range(-2.4, 2.4); const [x, y] = at(t, R + 0.35); b.sphere('cloth', x, y, r.range(-0.4, 0.4), r.range(0.18, 0.32), { color: C('#4f8a35').multiplyScalar(r.range(0.7, 1.2)) }); }
      break;
    case 1: // shells + coral
      for (const s of [-1, 1]) { for (let k = 0; k < 3; k++) b.cyl('marble', s * (R + 0.8) + r.range(-0.3, 0.3), 0.9 + k * 0.3, r.range(-0.5, 0.5), 0.07, 1.0, { rz: r.range(-0.5, 0.5), color: C('#ff8a9a') }); b.cone('marble', s * (R + 0.2), 0.75, 0.9, 0.25, 0.35, { rx: -1.2, color: C('#f4e0d0'), seg: 8 }); }
      b.sphere('marble', 0, cy + R + 0.8, 0, 0.45, { sy: 0.3, color: C('#f8eee0') });
      break;
    case 2: // obsidian spikes + lava cracks
      for (let k = 0; k < 7; k++) { const t = -1.2 + (k / 6) * 2.4; const [x, y] = at(t, R + 0.6); b.cone('obsidian', x, y + 0.3, 0, 0.18, r.range(0.8, 1.6), { rz: -t, seg: 5, color: C('#1a1414') }); }
      b.box('glow', 0, 0.52, 0, 2 * R, 0.04, 0.12, { color: C('#ff5a10').multiplyScalar(0.6) });
      break;
    case 3: // icicles + crystals
      for (let k = 0; k < 14; k++) { const t = Math.PI - 1.0 + (k / 13) * 2.0; const [x, y] = at(t + Math.PI, R - 0.05); void x; }
      for (let k = 0; k < 12; k++) { const t = -1.3 + (k / 11) * 2.6; const [x, y] = at(t, R - 0.1); b.cone('ice', x, y - 0.35, 0, 0.08, r.range(0.4, 0.9), { rx: Math.PI, seg: 5, color: C('#e8f8ff') }); }
      for (const s of [-1, 1]) b.cone('ice', s * (R + 0.9), 1.4, 0, 0.35, 2.2, { seg: 6, rz: s * 0.2, color: C('#cfefff') });
      break;
    case 4: // layered sandstone blocks
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.box('stone', s * (R + 1.0), 0.6 + k * 0.9, 0, 1.0 - k * 0.15, 0.8, 1.0 - k * 0.15, { color: C(['#b0603a', '#c98a55', '#9a5434'][k]) });
      break;
    case 5: // violet crystals
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) b.cone('glow', s * (R + 0.7 + k * 0.25), 0.9 + k * 0.2, r.range(-0.3, 0.3), 0.18, r.range(1.0, 1.9), { rz: s * r.range(0.1, 0.5), seg: 6, color: C('#9a8aff').multiplyScalar(0.5) });
      break;
    case 6: // golden sun crest
      b.cyl('gold', 0, cy + R + 0.75, 0, 0.55, 0.12, { rx: Math.PI / 2, seg: 20 });
      for (let k = 0; k < 10; k++) { const t = (k / 10) * Math.PI * 2; b.cone('gold', Math.sin(t) * 0.85, cy + R + 0.75 + Math.cos(t) * 0.85, 0, 0.12, 0.45, { rz: -t, seg: 4 }); }
      for (const s of [-1, 1]) b.box('gold', s * (R + 0.35), 0.62, 0, 0.6, 0.12, 0.85);
      break;
    case 7: // little glowing mushrooms
      for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1; const x = s * (R + r.range(0.4, 1.1)), z = r.range(-0.6, 0.6); b.cyl('plaster', x, 0.7, z, 0.05, 0.4, { seg: 6, color: C('#cfc8e0') }); b.sphere('glow', x, 0.92, z, 0.18, { sy: 0.1, color: C(k % 3 ? '#8a4dff' : '#40e0d0').multiplyScalar(0.6) }); }
      break;
    case 8: // bone-white spires + red glow
      for (let k = 0; k < 5; k++) { const t = -0.9 + (k / 4) * 1.8; const [x, y] = at(t, R + 0.55); b.cone('marble', x, y + 0.2, 0, 0.12, 1.1, { rz: -t, seg: 6, color: C('#e8e0d0') }); }
      b.box('glow', 0, 0.52, 0, 2 * R, 0.04, 0.12, { color: C('#d04dff').multiplyScalar(0.5) });
      break;
  }
  void power;
}

// ---------------------------------------------------------------- trading post (dimension)
export function tradingPost(b, flames, canopy, accent) {
  const m = stall(b, 4.4, 2.8, 'canopy', '#ffffff');
  crate(b, -3.3, 0, -1.2, 0.9, 0.3); crate(b, -3.2, 0.9, -1.1, 0.6, 0.8); crate(b, 3.2, 0, -1.4, 0.8, -0.2);
  barrel(b, -3.5, 0, 0.6); barrel(b, 3.4, 0, -0.1, 1.0);
  sack(b, -2.6, 0, 1.4); sack(b, 2.8, 0, 1.2, '#b8a07a');
  signPost(b, -3.6, 3.2, accent);
  const l1 = lanternPost(b, 3.4, 2.4, 2.6);
  // camp corner: bedroll + campfire
  const fx = 7.5, fz = 3.5;
  const f0 = b.frame;
  const [wx, wz] = b.w(fx, fz);
  b.at(wx, f0.y, wz, f0.yaw);
  const fire = campfire(b, flames, 0.9);
  logSeat(b, -1.9, 0.8, 0.5);
  const [bx, bz] = b.w(1.8, -2.4);
  b.at(bx, f0.y, bz, f0.yaw + 0.4);
  bedroll(b, '#6a3a4a');
  const bed = b.wv(0, 0.1, 0);
  b.frame = f0;
  return { merchant: b.wv(m.x, 0, m.z), bed, fire, lantern: l1 };
}

// ---------------------------------------------------------------- bandit camp (frame = camp centre)
export function banditCamp(b, flames, color, groundAt, r) {
  const f0 = { ...b.frame };
  campfire(b, flames, 1.1);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + r.range(-0.3, 0.3);
    const [x, z] = b.w(Math.sin(a) * 7, Math.cos(a) * 7);
    b.at(x, groundAt(x, z), z, f0.yaw + a + Math.PI);
    tent(b, C(color).lerp(C('#7a6a50'), 0.35).getStyle(), 3.2, 3.8, 2.3);
    if (r.chance(0.7)) crate(b, 2.4, 0, 0.5, 0.8, 0.3);
    b.frame = { ...f0 };
  }
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + Math.PI / 3; logSeat(b, Math.sin(a) * 2.8, Math.cos(a) * 2.8, a + Math.PI / 2, 1.8); }
  // banner pole
  b.cyl('wood', 4.2, 2.5, -2.5, 0.07, 5, { seg: 6, color: DARKWOOD });
  b.box('cloth', 4.2 + 0.7, 4.3, -2.5, 1.4, 0.9, 0.04, { color: C(color) });
  b.post(4.2, -2.5, 0.2);
  // weapon rack
  b.box('wood', -4.5, 0.9, 2.5, 1.8, 0.1, 0.1, { color: DARKWOOD });
  for (const x of [-0.8, 0.8]) b.box('wood', -4.5 + x, 0.6, 2.5, 0.1, 1.2, 0.1, { color: DARKWOOD });
  for (let k = 0; k < 3; k++) b.box('metal', -4.9 + k * 0.4, 1.1, 2.55, 0.06, 1.3, 0.02, { color: C('#b8bcc4'), rz: 0.15 });
  barrel(b, -3.0, 0, -4.0);
}

// ---------------------------------------------------------------- boss arena (frame = centre)
export function bossArena(b, flames, R, r) {
  const stones = 14;
  for (let k = 0; k < stones; k++) {
    const a = (k / stones) * Math.PI * 2 + r.range(-0.05, 0.05);
    if (k % 7 === 3) continue; // gaps to walk in
    standingStone(b, Math.sin(a) * (R + 1), Math.cos(a) * (R + 1), r.range(3.5, 6.5), r.range(1.1, 1.7), r);
  }
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.26; brazier(b, flames, Math.sin(a) * (R - 3), Math.cos(a) * (R - 3), 1.5, true); }
  // cracked rune circle in the middle
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; b.box('stone', Math.sin(a) * 9, 0.04, Math.cos(a) * 9, 2.3, 0.12, 0.6, { ry: a, color: C('#5a5450') }); }
}

// ---------------------------------------------------------------- home extras
export function market(b, flames) {
  const f0 = { ...b.frame };
  const out = {};
  const put = (lx, lz, yaw, fn) => { const [x, z] = b.w(lx, lz); b.at(x, f0.y, z, f0.yaw + yaw); const r = fn(); b.frame = { ...f0 }; return r; };
  out.main = put(0, -2, 0, () => { const m = stall(b, 4.6, 2.8, 'canopy', '#ffffff'); return { merchant: b.wv(m.x, 0, m.z) }; });
  put(-7, 1.5, Math.PI / 2.6, () => stall(b, 3.6, 2.4, 'canopy2', '#ffffff'));
  put(7, 1.5, -Math.PI / 2.6, () => stall(b, 3.6, 2.4, 'canopy3', '#ffffff'));
  crate(b, -3.6, 0, -3.2, 0.9); crate(b, -3.4, 0.9, -3.0, 0.6, 0.5); barrel(b, 3.8, 0, -3.0); barrel(b, 4.6, 0, -2.0, 1.0);
  sack(b, -4.6, 0, -1.5); sack(b, -5.2, 0, -2.4, '#b8a07a'); crate(b, 9.0, 0, -2.0, 0.8, 0.5);
  put(0, 8, 0, () => well(b));
  out.lanterns = [put(-4.5, 5.5, 0, () => lanternPost(b, 0, 0)), put(4.5, 5.5, Math.PI, () => lanternPost(b, 0, 0))];
  return out;
}

export function dock(b, len, deckY) {
  // deck runs along local +z from the shore (z=0) into the water
  const w = 2.6;
  b.box('planks', 0, deckY - 0.1, len / 2, w, 0.2, len, { color: C('#9a7650'), tile: 2.2 });
  for (let z = 1; z <= len; z += 2.5) for (const s of [-1, 1]) { b.cyl('wood', s * (w / 2 - 0.1), deckY - 1.4, z, 0.12, 3.2, { seg: 7, color: DARKWOOD }); }
  for (const s of [-1, 1]) b.box('wood', s * (w / 2), deckY + 0.45, len * 0.6, 0.08, 0.08, len * 0.8, { color: DARKWOOD });
  b.floor(0, len / 2, w, len, deckY);
  b.ramp(0, -1.5, 0.3, w, deckY - 0.6, deckY, 0);
  b.wall(-w / 2 - 0.05, 0.5, -w / 2 - 0.05, len, 0.1); b.wall(w / 2 + 0.05, 0.5, w / 2 + 0.05, len, 0.1);
  b.box('planks', 0, deckY + 0.25, len - 0.5, 1.0, 0.5, 0.6, { color: C('#7a5a3a') });
}

export function garden(b, rng) {
  const W = 14, Dg = 9;
  fence(b, [[-W / 2, -Dg / 2], [W / 2, -Dg / 2], [W / 2, Dg / 2], [1.2, Dg / 2], [-1.2, Dg / 2], [-W / 2, Dg / 2], [-W / 2, -Dg / 2]], 1.0, 3);
  for (let row = 0; row < 4; row++) {
    const z = -Dg / 2 + 1.4 + row * 2;
    b.box('rock', 0, 0.1, z, W - 2.5, 0.25, 1.1, { color: C('#4a3424'), tile: 2 });
    for (let k = 0; k < 9; k++) {
      const x = -W / 2 + 1.8 + k * 1.3;
      if (row % 2) b.sphere('plaster', x, 0.4, z, 0.28 + rng.range(0, 0.08), { sy: 0.24, color: C('#5a9a3a').multiplyScalar(rng.range(0.8, 1.15)) });
      else { b.cone('plaster', x, 0.55, z, 0.2, 0.6, { seg: 6, color: C('#4f8a30') }); b.sphere('plaster', x + 0.1, 0.3, z, 0.07, { color: C('#e07a2a') }); }
    }
  }
  // scarecrow
  b.cyl('wood', W / 2 - 1.2, 1.1, -Dg / 2 + 1.0, 0.06, 2.2, { seg: 6, color: DARKWOOD });
  b.box('wood', W / 2 - 1.2, 1.6, -Dg / 2 + 1.0, 1.4, 0.07, 0.07, { color: DARKWOOD });
  b.box('cloth', W / 2 - 1.2, 1.35, -Dg / 2 + 1.0, 0.6, 0.7, 0.3, { color: C('#7a4a8a') });
  b.sphere('cloth', W / 2 - 1.2, 2.05, -Dg / 2 + 1.0, 0.25, { color: C('#d8c890') });
  b.cone('cloth', W / 2 - 1.2, 2.35, -Dg / 2 + 1.0, 0.35, 0.4, { color: C('#8a6a3a') });
}

// Home plaza: cobble disc + central dais. Frame = plaza centre.
export function plaza(b, R) {
  b.cyl('cobble', 0, -0.15, 0, R, 0.36, { seg: 48, color: C('#8a8378'), tile: 3.4 });
  for (let k = 0; k < 40; k++) { const a = (k / 40) * Math.PI * 2; b.box('stone', Math.sin(a) * R, 0.06, Math.cos(a) * R, (2 * Math.PI * R) / 40 - 0.1, 0.35, 0.55, { ry: a, color: C('#8a857c') }); }
  b.cyl('stone', 0, 0.12, 0, 3.4, 0.3, { seg: 24, color: C('#9a958a') });
  b.cyl('stone', 0, 0.3, 0, 2.2, 0.35, { seg: 20, color: C('#8a857c') });
  b.cyl('gold', 0, 0.5, 0, 1.2, 0.06, { seg: 20 });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.box('gold', Math.sin(a) * 5.2, 0.04, Math.cos(a) * 5.2, 0.12, 0.04, 3.2, { ry: a }); }
  b.floor(0, 0, 6.6, 6.6, 0.3);
}

export { RNG };

// Temple courtyard (frame = courtyard centre, facing the temple door along local -z). Open & flat for guardian fights.
export function courtyard(b, flames, tier, stone, R = 22) {
  const sc = C(stone), r = new RNG(Math.round(b.frame.x * 3 + b.frame.z * 5));
  if (tier === 0) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 10;
      if (Math.abs(Math.cos(a)) > 0.92) continue; // gaps toward the temple and the approach
      standingStone(b, Math.sin(a) * (R - 1), Math.cos(a) * (R - 1), r.range(2.2, 3.4), r.range(0.8, 1.1), r);
    }
    return;
  }
  b.cyl('cobble', 0, -0.13, 0, R - 2, 0.3, { seg: 40, color: sc.clone().multiplyScalar(0.85), tile: 3.4 });
  for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2; b.box('stone', Math.sin(a) * (R - 2), 0.05, Math.cos(a) * (R - 2), (2 * Math.PI * (R - 2)) / 32 - 0.1, 0.3, 0.6, { ry: a, color: sc.clone().multiplyScalar(0.7) }); }
  const n = tier === 2 ? 6 : 4;
  for (let k = 0; k < n; k++) { const a = ((k + 0.5) / n) * Math.PI * 2; brazier(b, flames, Math.sin(a) * (R - 0.5), Math.cos(a) * (R - 0.5), tier === 2 ? 1.8 : 1.4, k % 2 === 0); }
}
