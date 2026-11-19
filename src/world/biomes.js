// Per-world recipes: terrain height function, layout, features, vegetation, sky bodies, weather, props.
import { smoothstep, clamp, lerp, polyDist, chaikin, smax } from './noise.js';

const PD = {};
// Carve helpers -----------------------------------------------------------
function rim(kit, x, z, r, R, amp = 150, base = 22) {
  const m = smoothstep(R, R + 120, r);
  if (m <= 0) return 0;
  const [wx, wz] = kit.warp(x, z, 0.004, 70);
  const ridge = kit.ridged(wx * 0.0055, wz * 0.0055, 5) * 0.6 + (kit.fbm(wx * 0.004, wz * 0.004, 4) * 0.5 + 0.5) * 0.4;
  const big = kit.fbm(x * 0.0018 + 3.1, z * 0.0018, 3) * 0.5 + 0.5;
  return m * (base + amp * (0.3 + 0.7 * ridge) * (0.55 + 0.7 * big));
}
function softFloor(h, level, min = 1.0) {
  const f = level + min;
  return h > f + 2 ? h : f + Math.log1p(Math.exp((h - f) * 1.5)) / 1.5 * 0.9 + 0.1;
}
function lakeCarve(h, kit, x, z, L) {
  const dx = x - L.x, dz = z - L.z; const d0 = Math.hypot(dx, dz);
  if (d0 > L.r + 40) return h;
  const d = d0 + kit.n3(x * 0.03, z * 0.03) * L.r * 0.18;
  const inside = 1 - smoothstep(L.r * 0.55, L.r + 16, d);
  const target = L.level - 0.7 - L.depth * (1 - smoothstep(0, L.r, d));
  return lerp(h, Math.min(h, target), inside);
}
function riverCarve(h, x, z, R, out) {
  if (x < R.bx0 || x > R.bx1 || z < R.bz0 || z > R.bz1) return h;
  polyDist(x, z, R.pts, PD);
  const d = PD.d;
  if (out) { out.d = d; out.dx = PD.dx; out.dz = PD.dz; }
  if (d > R.w + R.valley) return h;
  const v = 1 - smoothstep(R.w * 0.8, R.w + R.valley, d);
  const floor = R.level + (R.bank ?? 1.0);
  h = lerp(h, Math.min(h, floor + (h - floor) * 0.25), v * 0.9);
  const c = 1 - smoothstep(R.w * 0.45, R.w * 1.05, d);
  return lerp(h, R.level - R.depth, c);
}
function prepRiver(pts, w, depth, level, valley = 22, bank = 1.0) {
  const p = chaikin(pts, 3);
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (const [x, z] of p) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
  const m = w + valley + 2;
  return { pts: p, w, depth, level, valley, bank, bx0: bx0 - m, bx1: bx1 + m, bz0: bz0 - m, bz1: bz1 + m };
}
const V = (x, z) => ({ x, z });
const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);

// common sky bodies
const SKY = {
  home: [{ type: 'gas', c1: '#d9c7a4', c2: '#a88a68', c3: '#f0e6d0', az: 35, el: 28, size: 9, ring: [1.35, 2.3], ringColor: ['#e8dcc4', '#9a8a70'], atmo: '#ffe8c0', dayAlpha: 0.55, ringTilt: 1.2 },
    { type: 'rocky', c1: '#5a7aa8', c2: '#8aa860', c3: '#e8e8e0', az: -60, el: 18, size: 2.6, atmo: '#9fd0ff', dayAlpha: 0.45 },
    { type: 'moon', moon: true, c1: '#c8c4bc', c2: '#8a8680', c3: '#a8a49c', size: 2.2, ambient: 0.08 }],
  0: [{ type: 'gas', c1: '#7fc8b0', c2: '#3a8a8a', c3: '#d8f0e0', az: -40, el: 32, size: 11, ring: [1.4, 2.4], ringColor: ['#c8e8d8', '#6a9a8a'], atmo: '#b0ffe0', dayAlpha: 0.5 },
    { type: 'rocky', c1: '#a86a4a', c2: '#c8a070', c3: '#f0e8e0', az: 70, el: 22, size: 3, atmo: '#ffd0a0', dayAlpha: 0.4 },
    { type: 'moon', moon: true, c1: '#d0ccc4', c2: '#8a8680', c3: '#b0aca4', size: 2.2 }],
  1: [{ type: 'gas', c1: '#f0b8c8', c2: '#c87a98', c3: '#fff0f4', az: 60, el: 26, size: 10, ring: [1.3, 2.1], ringColor: ['#ffe0ec', '#b08098'], atmo: '#ffd0e0', dayAlpha: 0.5 },
    { type: 'rocky', c1: '#3a6ad0', c2: '#4ab080', c3: '#ffffff', az: -30, el: 40, size: 3.4, atmo: '#a0d8ff', dayAlpha: 0.45 },
    { type: 'moon', moon: true, c1: '#d8d4cc', c2: '#9a9690', c3: '#c0bcb4', size: 2.4 }],
  2: [{ type: 'lava', c1: '#3a1810', c2: '#8a2a10', c3: '#ffa040', az: -20, el: 30, size: 14, atmo: '#ff6a30', dayAlpha: 0.7, glow: 0.25 },
    { type: 'moon', moon: true, c1: '#a89488', c2: '#6a5a50', c3: '#8a7a70', size: 2.0 }],
  3: [{ type: 'gas', c1: '#e8f4ff', c2: '#a0c4e8', c3: '#ffffff', az: 20, el: 34, size: 10, ring: [1.5, 2.6], ringColor: ['#f0f8ff', '#9ab8d8'], atmo: '#d8f0ff', dayAlpha: 0.55, ringTilt: 1.45 },
    { type: 'moon', moon: true, c1: '#e0e8f0', c2: '#a0aab4', c3: '#c8d0d8', size: 2.4 }],
  4: [{ type: 'gas', c1: '#e8a060', c2: '#a85a30', c3: '#ffe0b0', az: -55, el: 24, size: 13, atmo: '#ffc080', dayAlpha: 0.55 },
    { type: 'rocky', c1: '#8a8a9a', c2: '#c0b0a0', c3: '#ffffff', az: 40, el: 45, size: 2.4, dayAlpha: 0.4 },
    { type: 'moon', moon: true, c1: '#d0c4b4', c2: '#8a7a6a', c3: '#b0a494', size: 2.0 }],
  5: [{ type: 'gas', c1: '#6a6aa8', c2: '#3a3a6a', c3: '#a8a8e0', az: 10, el: 38, size: 12, ring: [1.4, 2.2], ringColor: ['#a0a0d8', '#505080'], atmo: '#9090ff', dayAlpha: 0.35 },
    { type: 'moon', moon: true, c1: '#b8bcc8', c2: '#70747e', c3: '#9aa0aa', size: 2.0 }],
  6: [{ type: 'gas', c1: '#f4e4c0', c2: '#d8b880', c3: '#fffaf0', az: -35, el: 36, size: 12, ring: [1.35, 2.5], ringColor: ['#fff4dc', '#c8a878'], atmo: '#fff0d0', dayAlpha: 0.45, ringTilt: 1.0 },
    { type: 'rocky', c1: '#c86a4a', c2: '#e8a070', c3: '#f8f0e8', az: 75, el: 20, size: 3, dayAlpha: 0.4 },
    { type: 'moon', moon: true, c1: '#e0dcd4', c2: '#a09c94', c3: '#c8c4bc', size: 2.2 }],
  7: [{ type: 'moon', moon: true, c1: '#c8a8ff', c2: '#6a4aa8', c3: '#9a7ad8', size: 4.5, atmo: '#a080ff', glow: 0.25 },
    { type: 'moon', moon: true, moonOffset: 0.9, moonLift: 0.15, c1: '#a0fff0', c2: '#3a8a8a', c3: '#70d0c8', size: 2.6, atmo: '#60ffe0', glow: 0.25 },
    { type: 'gas', c1: '#3a2a5a', c2: '#1a1430', c3: '#6a5a9a', az: -70, el: 25, size: 14, ring: [1.3, 2.0], ringColor: ['#6a5a9a', '#2a2040'], atmo: '#6040a0', dayAlpha: 1 }],
  8: [{ type: 'moon', moon: true, c1: '#ff6a5a', c2: '#8a1a1a', c3: '#c83a30', size: 9, atmo: '#ff3a2a', glow: 0.35, ambient: 0.2 },
    { type: 'rocky', c1: '#3a3438', c2: '#5a4a4a', c3: '#8a7a7a', az: 60, el: 30, size: 3, dayAlpha: 1 }],
};

// =========================================================================== recipes
export const RECIPES = {};

// ----------------------------------------------------------------- HOME
RECIPES.home = (kit) => {
  const level = 9.2, R = 250;
  const lake = { x: -30, z: 95, r: 34, depth: 5, level };
  const stream = prepRiver([[260, 175], [190, 158], [125, 132], [65, 118], [12, 104]], 4.2, 1.9, level, 12, 0.9);
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    let h = 12.8 + kit.fbm(x / 190, z / 190, 4) * 4.5 + kit.fbm(x / 60, z / 60, 3) * 1.1;
    h += smoothstep(140, 250, r) * 16 * (0.6 + 0.5 * kit.fbm(x / 120 + 9, z / 120, 3));
    h += rim(kit, x, z, r, R - 10, 170, 18);
    h = softFloor(h, level, 1.4);
    h = lakeCarve(h, kit, x, z, lake);
    return riverCarve(h, x, z, stream);
  };
  const plazaC = V(0, -58), pR = 30;
  const portals = [];
  for (let i = 0; i < 9; i++) {
    const th = (-80 + 20 * i) * Math.PI / 180;
    portals.push({ x: plazaC.x + Math.sin(th) * 23.5, z: plazaC.z - Math.cos(th) * 23.5, yaw: -th });
  }
  return {
    radius: R, level, liquid: 'water', height, lakes: [lake], rivers: [stream],
    layout: {
      spawn: V(0, 12), spawnYaw: Math.PI,
      plaza: { ...plazaC, r: pR }, portals,
      house: { x: 46, z: 22, yaw: -Math.PI / 2 }, garden: { x: 52, z: 47, yaw: -Math.PI / 2 },
      market: { x: -46, z: 18, yaw: Math.PI / 2 }, dock: { x: -30, z: 56, yaw: 0, len: 14 },
      villagers: [V(-40, 24), V(-52, 8), V(44, 40), V(12, -40), V(-14, -44), V(-22, 52), V(34, 28), V(6, 20)],
    },
    pads: [
      { x: 0, z: -58, r: 33, fall: 16 }, { x: 46, z: 22, r: 11, fall: 10 }, { x: 52, z: 47, r: 9, fall: 8 },
      { x: -46, z: 18, r: 15, fall: 12, dirt: 0.5 }, { x: 0, z: 12, r: 6, fall: 10 },
    ],
    paths: [
      { pts: [[0, 14], [0, -26]], w: 1.7 }, { pts: [[0, 12], [20, 16], [39, 22]], w: 1.4 }, { pts: [[0, 12], [-20, 15], [-37, 18]], w: 1.4 },
      { pts: [[0, 12], [-10, 34], [-26, 50], [-30, 56]], w: 1.2 }, { pts: [[40, 22], [43, 34], [48, 41]], w: 1.0 },
    ],
    terrain: { rockSlope: 0.5, snowLine: 150, beach: 1.2, dirtPatches: 0.25 },
    trees: [{ kind: 'oak', count: 150, minR: 45, maxR: 235, spacing: 6 }, { kind: 'birch', count: 110, minR: 45, maxR: 235, spacing: 4 },
      { kind: 'oak', count: 160, minR: 235, maxR: 420, maxH: 95, spacing: 7, cluster: 1 }, { kind: 'birch', count: 110, minR: 235, maxR: 420, maxH: 95, spacing: 5 }],
    rocks: { count: 130, top: '#5a7a35', topAmt: 0.85, rim: 45 },
    grass: { c1: '#4f7a2c', c2: '#7aa046', height: 0.9 }, flowers: { count: 1300, colors: ['#ffffff', '#ffd23a', '#c84ad8', '#ff6a8a', '#6a8aff'] },
    sky: { bodies: SKY.home, cloudCover: 0.42 }, weatherExtras: ['butterflies', 'fireflies'],
  };
};

// ----------------------------------------------------------------- 0 VERDANIA
RECIPES[0] = (kit) => {
  const level = 2.0, R = 275;
  const lake = { x: 115, z: -75, r: 58, depth: 9, level };
  const river = prepRiver([[-340, 225], [-230, 185], [-130, 150], [-50, 118], [25, 92], [80, 42], [110, -10]], 6.5, 1.6, level, 26, 1.2);
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    const [wx, wz] = kit.warp(x, z, 0.006, 40);
    let h = 12 + kit.fbm(wx / 210, wz / 210, 5) * 15 + kit.fbm(x / 70, z / 70, 3) * 3 + kit.ridged(x / 380, z / 380, 3) * 10;
    h += rim(kit, x, z, r, R - 5, 150, 15);
    h = softFloor(h, level, 2.0);
    h = lakeCarve(h, kit, x, z, lake);
    return riverCarve(h, x, z, river);
  };
  const L = { spawn: V(-8, 6), homePortal: V(-17, -2), shop: V(18, 24), temple: V(-118, -160), arena: V(150, 168), camps: [V(-188, 40), V(58, -198), V(212, 22)] };
  return {
    radius: R, level, liquid: 'water', height, lakes: [lake], rivers: [river], layout: L,
    terrain: { rockSlope: 0.5, snowLine: 150, beach: 1.4, dirtPatches: 0.3 },
    trees: [{ kind: 'oak', count: 230, minR: 30, maxR: 265, spacing: 6 }, { kind: 'birch', count: 170, minR: 30, maxR: 265, spacing: 4 }, { kind: 'pine', count: 140, minR: 60, maxR: 270, spacing: 4 },
      { kind: 'pine', count: 260, minR: 265, maxR: 430, maxH: 110, spacing: 5, cluster: 0 }, { kind: 'oak', count: 120, minR: 265, maxR: 430, maxH: 80, spacing: 7 }],
    rocks: { count: 200, top: '#4f7d2f', topAmt: 1.0, rim: 50 },
    grass: { c1: '#4a7a2a', c2: '#78a040', height: 1.15 }, flowers: { count: 1800, colors: ['#ffffff', '#ffd23a', '#ff5a5a', '#c84ad8', '#5a9aff', '#ff9a3a'] },
    sky: { bodies: SKY[0], cloudCover: 0.48 }, weatherExtras: ['butterflies', 'fireflies'],
    extras: ['logs'],
  };
};

// ----------------------------------------------------------------- 1 AQUARIA
RECIPES[1] = (kit) => {
  const level = 0, R = 290;
  const isl = [
    { x: 0, z: 0, r: 82, peak: 16 }, { x: 138, z: -118, r: 64, peak: 8 }, { x: -165, z: 150, r: 50, peak: 6 }, { x: -62, z: -200, r: 68, peak: 9 },
    { x: -178, z: -95, r: 34, peak: 6 }, { x: 172, z: 105, r: 36, peak: 7 }, { x: 28, z: 208, r: 32, peak: 6 },
    { x: 97, z: 66, r: 46, peak: 5 }, { x: -235, z: 30, r: 20, peak: 5 },
    { x: 620, z: 320, r: 130, peak: 70 }, { x: -720, z: -220, r: 160, peak: 90 }, { x: 220, z: -820, r: 140, peak: 60 }, { x: -330, z: 720, r: 110, peak: 55 }, { x: 900, z: -400, r: 120, peak: 80 },
  ];
  const bars = [prepRiver([[40, -25], [95, -80], [128, -108]], 9, 0, level), prepRiver([[-45, 52], [-100, 100], [-140, 132]], 9, 0, level), prepRiver([[60, 40], [95, 62]], 6, 0, level), prepRiver([[-12, -62], [-35, -110], [-50, -150]], 8, 0, level)];
  const height = (x, z) => {
    let h = -22 + kit.fbm(x / 160, z / 160, 3) * 4;
    for (const I of isl) {
      const dx = x - I.x, dz = z - I.z; const d0 = Math.hypot(dx, dz);
      if (d0 > I.r * 1.4 + 40) continue;
      const d = d0 + kit.n3(x * 0.02 + I.x, z * 0.02) * I.r * 0.22;
      const s = clamp(1 - d / I.r, -1, 1);
      const shelf = smoothstep(-0.45, 0.05, s);
      let ih = lerp(-22, -1.4, shelf) + smoothstep(-0.02, 0.18, s) * 3.0;
      ih += I.peak * Math.pow(smoothstep(0.15, 1.0, s), 1.4) * (0.6 + 0.5 * (kit.fbm(x / 45 + I.x, z / 45, 4) * 0.5 + 0.5));
      h = smax(h, ih, 3);
    }
    for (const B of bars) { polyDist(x, z, B.pts, PD); if (PD.d < B.w + 30) h = smax(h, lerp(-0.75, -6, smoothstep(B.w * 0.5, B.w + 26, PD.d)) + kit.n3(x * 0.05, z * 0.05) * 0.3, 2); }
    // lagoon on the east of the main island
    const ld = Math.hypot(x - 55, z + 15);
    if (ld < 40) h = lerp(h, Math.min(h, -1.3 + kit.n3(x * 0.08, z * 0.08) * 0.4), 1 - smoothstep(18, 40, ld));
    return h;
  };
  const L = { spawn: V(-6, 10), homePortal: V(-15, 2), shop: V(18, 26), temple: V(150, -130), arena: V(-165, 150), camps: [V(-178, -95), V(182, 112), V(28, 208)] };
  return {
    radius: R, level, liquid: 'water', height, layout: L, islands: isl, padMinAbove: 1.6, templeSpots: [V(112, 80), V(150, -132), V(-66, -214)],
    terrain: { rockSlope: 0.55, snowLine: 999, beach: 2.4, dirtPatches: 0.15 },
    trees: [{ kind: 'palm', count: 260, minR: 0, maxR: 290, spacing: 4, minAbove: 0.9, maxH: 9, cluster: 0, scale: [0.85, 1.2] }, { kind: 'bush', count: 220, minR: 0, maxR: 290, minAbove: 2.2, spacing: 2.5, cluster: 0 },
      { kind: 'palm', count: 90, minR: 400, maxR: 1100, minAbove: 1, spacing: 8, cluster: 0 }],
    rocks: { count: 90, top: '#e8dcb0', topAmt: 0.0, underwater: true, color: '#9a9080' },
    grass: { c1: '#5a9a35', c2: '#86b84c', height: 0.8 }, flowers: { count: 500, colors: ['#ff6a8a', '#ffffff', '#ffd23a'] },
    sky: { bodies: SKY[1], cloudCover: 0.38 }, weatherExtras: ['gulls'],
    water: { clarity: 0.18, shallow: '#7ff0e0', shallowMix: 0.55, deepMul: 0.38, extent: 1450 },
    extras: ['coral', 'shells', 'driftwood'],
  };
};

// ----------------------------------------------------------------- 2 PYROS
RECIPES[2] = (kit) => {
  const level = 1.5, R = 270;
  const volc = { x: 40, z: 330, r: 200, h: 230, crater: 38 };
  const rivA = prepRiver([[40, 300], [30, 232], [-8, 162], [-58, 112], [-118, 64], [-190, 32], [-330, 12]], 6.5, 2.0, level, 14, 0.8);
  const rivB = prepRiver([[62, 292], [108, 205], [148, 132], [165, 62]], 5.5, 2.0, level, 12, 0.8);
  const pools = [{ x: 165, z: 40, r: 26, depth: 3, level }, { x: -62, z: -122, r: 22, depth: 3, level }, { x: 122, z: -158, r: 18, depth: 3, level }];
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    const [wx, wz] = kit.warp(x, z, 0.01, 25);
    let h = 7 + kit.ridged(wx / 110, wz / 110, 5) * 13 + kit.fbm(x / 45, z / 45, 3) * 2.5;
    const vd = Math.hypot(x - volc.x, z - volc.z) + kit.n3(x * 0.01, z * 0.01) * 18;
    const cone = Math.pow(clamp(1 - vd / volc.r, 0, 1), 1.6) * volc.h;
    const crater = smoothstep(volc.crater + 25, volc.crater - 5, vd) * 70;
    h += Math.max(0, cone - crater) + (1 - smoothstep(0, volc.r, vd)) * kit.ridged(x / 30, z / 30, 3) * 8;
    h += rim(kit, x, z, r, R, 120, 18);
    h = softFloor(h, level, 2.2);
    for (const p of pools) h = lakeCarve(h, kit, x, z, p);
    h = riverCarve(h, x, z, rivA);
    return riverCarve(h, x, z, rivB);
  };
  const L = { spawn: V(0, -20), homePortal: V(-9, -29), shop: V(24, -4), temple: V(-160, -118), arena: V(190, -62), camps: [V(60, 135), V(-215, -55), V(-40, -215)] };
  return {
    radius: R, level, liquid: 'lava', height, lakes: pools, rivers: [rivA, rivB], layout: L, volcano: volc,
    terrain: { rockSlope: 0.4, snowLine: 999, beach: 0.6, dirtPatches: 0.3, glowAmt: 1.0, glow: '#ff4a0a', rock2: '#1e1a19', softGround: 2 },
    trees: [{ kind: 'charred', count: 150, minR: 25, maxR: 280, spacing: 5, minAbove: 2.5 }],
    rocks: { count: 160, top: '#1a1614', topAmt: 0, color: '#2a2624', rim: 40 },
    grass: null, flowers: null,
    sky: { bodies: SKY[2], cloudCover: 0.62, cloudLit: '#a06a50', cloudDark: '#3a2420', sunsetColor: '#ff6a30', fogTint: ['#40302c', 0.35] }, weather: 'embers', weatherExtras: ['smoke'],
    extras: ['spikes', 'crater'],
  };
};

// ----------------------------------------------------------------- 3 GLACIA
RECIPES[3] = (kit) => {
  const level = 14, R = 270;
  const lake = { x: -110, z: 70, r: 62, depth: 6, level };
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    const [wx, wz] = kit.warp(x, z, 0.007, 35);
    let h = 20 + kit.fbm(wx / 170, wz / 170, 5) * 14 + kit.fbm(x / 55, z / 55, 3) * 2;
    const cl = kit.ridged(x / 140 + 4, z / 140, 4);
    h += smoothstep(0.55, 0.62, cl) * 9 + smoothstep(0.7, 0.76, cl) * 7;
    h += rim(kit, x, z, r, R - 10, 210, 25);
    h = softFloor(h, level, 2.5);
    return lakeCarve(h, kit, x, z, lake);
  };
  const L = { spawn: V(10, -10), homePortal: V(19, -18), shop: V(-14, -30), temple: V(150, 118), arena: V(-58, -212), camps: [V(178, -70), V(-195, -62), V(40, 202)] };
  return {
    radius: R, level, liquid: 'ice', height, lakes: [lake], layout: L,
    terrain: { rockSlope: 0.46, snowLine: -999, beach: 0.2, dirtPatches: 0.0, softGround: 1, rock2: '#5a6676' },
    trees: [{ kind: 'snowpine', count: 330, minR: 30, maxR: 268, spacing: 5 }, { kind: 'snowpine', count: 300, minR: 268, maxR: 440, maxH: 150, spacing: 6, cluster: 1 }],
    rocks: { count: 140, top: '#f4f8fc', topAmt: 1.0, color: '#7a8694', rim: 40 },
    grass: null, flowers: null, barkTop: '#f4f8fc', barkTopAmt: 0.6,
    sky: { bodies: SKY[3], cloudCover: 0.55, aurora: true, auroraColor: '#40ffb0', cloudDark: '#b8c4d0', sunScale: 0.85 }, weather: 'snow',
    extras: ['icecrystals', 'icefalls'],
  };
};

// ----------------------------------------------------------------- 4 TERRAGON
RECIPES[4] = (kit) => {
  const level = 2.5, R = 280;
  const river = prepRiver([[-330, -150], [-200, -100], [-112, -30], [-42, 38], [40, 70], [140, 58], [220, 118], [340, 172]], 8, 1.6, level, 18, 0.9);
  let keep = [];
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    let h = 5 + kit.fbm(x / 150, z / 150, 4) * 2.5 + kit.fbm(x / 40, z / 40, 2) * 0.6;
    let m = kit.fbm(x / 175 + 7, z / 175 - 3, 4) + 0.3 * kit.fbm(x / 55, z / 55, 3);
    for (const k of keep) { const d = Math.hypot(x - k.x, z - k.z); m -= (1 - smoothstep(k.r, k.r + 40, d)) * 0.8; }
    const mesa = smoothstep(0.12, 0.2, m);
    const top = 34 + smoothstep(0.2, 0.5, m) * 22;
    let mh = mesa * top;
    mh = Math.floor(mh / 6) * 6 + smoothstep(0, 1, (mh / 6) % 1) * 6; // terraces
    h += mh;
    h += rim(kit, x, z, r, R, 120, 30) * (0.8 + 0.4 * smoothstep(0.3, 0.6, kit.fbm(x / 90, z / 90, 2) * 0.5 + 0.5));
    h = softFloor(h, level, 2.0);
    return riverCarve(h, x, z, river);
  };
  const L = { spawn: V(30, -40), homePortal: V(21, -48), shop: V(52, -22), temple: V(-130, 110), arena: V(160, -160), camps: [V(-150, -172), V(212, 14), V(-10, 212)] };
  keep = [L.spawn, L.shop, L.temple, L.arena, ...L.camps].map((p) => ({ x: p.x, z: p.z, r: 45 }));
  keep.push({ x: -50, z: 35, r: 30 }, { x: 80, z: 20, r: 25 }, { x: 0, z: 100, r: 30 }, { x: 100, z: -110, r: 30 });
  return {
    radius: R, level, liquid: 'water', height, rivers: [river], layout: L, keep,
    terrain: { rockSlope: 0.36, snowLine: 999, beach: 1.0, dirtPatches: 0.25, strata: 1.0, rock2: '#c07a4a', softGround: 1 },
    trees: [{ kind: 'cactus', count: 140, minR: 20, maxR: 275, spacing: 5, maxH: 30 }, { kind: 'dryshrub', count: 200, minR: 10, maxR: 290, spacing: 2.5 }, { kind: 'juniper', count: 110, minR: 20, maxR: 290, spacing: 4 }],
    rocks: { count: 220, top: '#d9a66e', topAmt: 0.5, color: '#a0603e', rim: 30, bigChance: 0.35 },
    grass: { c1: '#a08a4a', c2: '#c8a860', height: 0.55, count: 5000 }, flowers: null,
    sky: { bodies: SKY[4], cloudCover: 0.28 }, weather: 'dust',
    water: { clarity: 0.5, shallow: '#6ab0a0' },
    extras: ['arches', 'tumbleweeds'],
  };
};

// ----------------------------------------------------------------- 5 VOLTARA
RECIPES[5] = (kit) => {
  const level = 4.2, R = 270;
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    const [wx, wz] = kit.warp(x, z, 0.008, 30);
    const n = kit.fbm(wx / 160, wz / 160, 5) * 0.5 + 0.5;
    const t = n * 4.2; const step = Math.floor(t); const f = t - step;
    let h = 4.5 + (step + smoothstep(0.35, 0.65, f)) * 9 + kit.fbm(x / 35, z / 35, 3) * 0.9 - 9;
    h += (kit.fbm(x / 22, z / 22, 2)) * 0.7;
    h += rim(kit, x, z, r, R, 160, 30);
    return h;
  };
  const L = { spawn: V(0, 0), homePortal: V(-9, -8), shop: V(22, 15), temple: V(140, -142), arena: V(-158, 150), camps: [V(-192, -60), V(58, 200), V(202, 58)] };
  return {
    radius: R, level, liquid: 'water', height, layout: L, padMinAbove: 1.2,
    terrain: { rockSlope: 0.4, snowLine: 999, beach: 0.4, dirtPatches: 0.45, rock2: '#3a4048' },
    trees: [{ kind: 'crystal', count: 90, minR: 25, maxR: 270, spacing: 6, scale: [0.8, 1.6] }, { kind: 'windswept', count: 170, minR: 20, maxR: 270, spacing: 4 },
      { kind: 'crystal', count: 70, minR: 270, maxR: 420, spacing: 10, scale: [1.5, 3.2] }],
    rocks: { count: 180, top: '#3d5a52', topAmt: 0.4, color: '#4a5258', rim: 40 },
    grass: { c1: '#355048', c2: '#4f6e62', height: 0.8 }, flowers: null,
    sky: { bodies: SKY[5], cloudCover: 0.86, cloudLit: '#7a8498', cloudDark: '#2a303c', sunScale: 0.7 }, weather: 'storm', weatherExtras: ['mist'], mistColor: [0.42, 0.47, 0.56], windAmp: 0.8,
    water: { clarity: 0.6, rain: true, shallow: '#4a6070' },
    extras: ['bigcrystals'], leafGlow: '#203060',
  };
};

// ----------------------------------------------------------------- 6 SOLARA
RECIPES[6] = (kit) => {
  const level = 3.0, R = 290;
  const oasis = { x: -70, z: 95, r: 34, depth: 4, level };
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    const a = 0.45, ca = Math.cos(a), sa = Math.sin(a);
    const u = (x * ca + z * sa) / 48 + kit.fbm(x / 170, z / 170, 3) * 2.2;
    const sn = Math.sin(u * Math.PI); const crest = Math.pow(1 - Math.abs(sn), 1.35) * 0.65 + (sn * sn) * 0.35;
    const amp = 6 + 7 * (kit.fbm(x / 260 + 5, z / 260, 3) * 0.5 + 0.5);
    let h = 7 + crest * amp + kit.fbm(x / 90, z / 90, 4) * 5 + kit.fbm(x / 18, z / 18, 2) * 0.25;
    h += rim(kit, x, z, r, R + 20, 60, 12) * 0.7;
    h = softFloor(h, level, 2.0);
    return lakeCarve(h, kit, x, z, oasis);
  };
  const L = { spawn: V(10, -10), homePortal: V(1, -18), shop: V(34, 2), temple: V(150, -130), arena: V(-170, -140), camps: [V(192, 92), V(-205, 28), V(40, 222)] };
  return {
    radius: R, level, liquid: 'water', height, lakes: [oasis], layout: L,
    terrain: { rockSlope: 0.85, snowLine: 999, beach: 0.8, dirtPatches: 0.1, softGround: 1 },
    trees: [{ kind: 'palm', count: 45, cx: -70, cz: 95, minR: 25, maxR: 62, spacing: 4, cluster: 0 }, { kind: 'dryshrub', count: 160, minR: 10, maxR: 290, spacing: 3 },
      { kind: 'palm', count: 12, cx: 34, cz: 2, minR: 8, maxR: 25, spacing: 4, cluster: 0 }],
    rocks: { count: 70, top: '#f0d9a0', topAmt: 0.9, color: '#c8a06a' },
    grass: { c1: '#6a9a3a', c2: '#8ab04a', height: 0.8, count: 3000 }, grassNear: { x: -70, z: 95, r: 55 }, flowers: null,
    sky: { bodies: SKY[6], cloudCover: 0.15, sunScale: 0.82 }, weather: 'heat',
    water: { clarity: 0.22, shallow: '#6ae8f0', shallowMix: 0.6 },
    extras: ['ruins', 'bones', 'statues'],
  };
};

// ----------------------------------------------------------------- 7 UMBRA
RECIPES[7] = (kit) => {
  const level = 2.4, R = 260;
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    const [wx, wz] = kit.warp(x, z, 0.008, 30);
    let h = 4.2 + kit.fbm(wx / 150, wz / 150, 5) * 9 + kit.ridged(x / 70, z / 70, 3) * 4 - 2;
    h += kit.fbm(x / 18, z / 18, 2) * 0.6;
    h += rim(kit, x, z, r, R, 130, 22);
    return h;
  };
  const L = { spawn: V(0, 0), homePortal: V(-9, 6), shop: V(20, -18), temple: V(-150, 130), arena: V(150, 160), camps: [V(182, -80), V(-192, -70), V(20, -212)] };
  return {
    radius: R, level, liquid: 'water', height, layout: L, padMinAbove: 1.3,
    terrain: { rockSlope: 0.45, snowLine: 999, beach: 0.5, dirtPatches: 0.5 },
    trees: [{ kind: 'twisted', count: 150, minR: 25, maxR: 255, spacing: 8, scale: [0.8, 1.3] }, { kind: 'giantmushroom', count: 110, minR: 20, maxR: 255, spacing: 5, scale: [0.7, 1.4] },
      { kind: 'twisted', count: 160, minR: 255, maxR: 400, maxH: 80, spacing: 9 }],
    rocks: { count: 120, top: '#4a2a6a', topAmt: 0.7, color: '#3a3448', rim: 30 },
    grass: { c1: '#2a2238', c2: '#4a3a5a', height: 0.9 }, flowers: null,
    sky: { bodies: SKY[7], cloudCover: 0.35, nightZenith: '#0a0812', nightHorizon: '#3a2a55', moonColor: '#a898e8', moonIntensity: 1.5, nightHemi: 1.6, nightExposure: 1.4, nightEnv: 3.0, cloudLit: '#4a3a6a' },
    weatherExtras: ['mist', 'fireflies'], firefliesAlways: true, mistColor: [0.36, 0.3, 0.5], fireflyColor: [0.5, 1.0, 0.9], fireflyColor2: [0.85, 0.55, 1.0],
    water: { clarity: 0.9, shallow: '#3a2a5a', deepMul: 0.5 }, extras: ['glowshrooms'], leafGlow: '#140a20',
  };
};

// ----------------------------------------------------------------- 8 NECROS
RECIPES[8] = (kit) => {
  const level = 1.0, R = 270;
  const pools = [{ x: 90, z: 40, r: 22, depth: 2.5, level }, { x: -110, z: -30, r: 18, depth: 2, level }, { x: 40, z: -130, r: 16, depth: 2, level }];
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    let h = 5 + kit.fbm(x / 200, z / 200, 4) * 6 + kit.ridged(x / 90, z / 90, 4) * 6 + kit.fbm(x / 30, z / 30, 2) * 0.5;
    h += rim(kit, x, z, r, R, 140, 25);
    h = softFloor(h, level, 2.0);
    for (const p of pools) h = lakeCarve(h, kit, x, z, p);
    return h;
  };
  const L = { spawn: V(0, 0), homePortal: V(9, -8), shop: V(-22, -14), temple: V(130, 150), arena: V(-150, 160), camps: [V(192, -60), V(-202, -42), V(30, -212)] };
  return {
    radius: R, level, liquid: 'water', height, lakes: pools, layout: L,
    terrain: { rockSlope: 0.42, snowLine: 999, beach: 0.4, dirtPatches: 0.3, softGround: 2, glowAmt: 0.25, glow: '#ff2a1a' },
    trees: [{ kind: 'dead', count: 160, minR: 20, maxR: 285, spacing: 6 }],
    rocks: { count: 150, top: '#7a7470', topAmt: 0.6, color: '#4a4442', rim: 40 },
    grass: null, flowers: null,
    sky: { bodies: SKY[8], cloudCover: 0.45, fogTint: ['#3a3739', 0.5], nightZenith: '#1a0a0e', nightHorizon: '#7a2a2a', moonColor: '#d8b0aa', moonIntensity: 1.3, nightHemi: 1.45, nightExposure: 1.3, cloudLit: '#5a2a2c' },
    weather: 'ash', weatherExtras: ['ghosts'],
    water: { clarity: 1.0, shallow: '#4a1a20', deepMul: 0.5 }, extras: ['towers', 'graves'],
  };
};

export { yawTo };
