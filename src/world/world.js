// Nine Planets Quest — world builder. See CONTRACTS.md ("World API").
import * as THREE from 'three';
import { HOME, DIMENSIONS, POWERS } from '../data.js';
import { hashStr, RNG, makeNoiseKit, smoothstep, polyDist, chaikin } from './noise.js';
import { bakeTexture } from './bake.js';
import { Heightfield, heightTexture, terrainMaterial, TerrainLOD, farGeometry } from './terrain.js';
import { createSky, computeDaylight, makeSkyPalette } from './sky.js';
import { createLiquid, fogUniforms, lavaDisc } from './water.js';
import { createVegetation } from './vegetation.js';
import { structureMaterials, packedMaterial } from './materials.js';
import { Builder, FloorSet, LightPool } from './builder.js';
import { FlameSet, lanternPost } from './props.js';
import { house, temple, templeDynamic, tradingPost, banditCamp, bossArena, market, dock, garden, plaza, portalDecor, courtyard, PORTAL_THEMES, TEMPLE_STYLES } from './structures.js';
import { portalRing, runeGeometry, runeMaterial, swirlMaterial } from './portals.js';
import { runeTexture, stripeTexture, plaqueAtlas, lockTexture } from './canvasTex.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildExtras, createTumbleweeds } from './extras.js';
import { createWeather } from './weather.js';
import { buildDojo, shojiTexture } from './dojo.js';
import { RECIPES, yawTo } from './biomes.js';

const V3 = THREE.Vector3;
const PD = {};
const KEEPERS = new WeakMap();

export async function buildWorld(id, { renderer, scene, quality = 'high' } = {}) {
  const T0 = performance.now();
  const isHome = id === 'home';
  const idx = isHome ? -1 : Number(id);
  const def = isHome ? HOME : DIMENSIONS[idx];
  if (!def) throw new Error('buildWorld: unknown world id ' + id);
  const biome = def.biome;
  const hi = quality === 'high';
  const seed = hashStr('npq-world-' + id);
  const kit = makeNoiseKit(seed);
  const rng = new RNG(seed);
  const recipe = RECIPES[isHome ? 'home' : idx](kit);
  const level = recipe.level;
  const liquidType = recipe.liquid;
  const R = recipe.radius;
  const L = recipe.layout;
  const timings = {};
  let tm = performance.now();
  const lap = (k) => { const n = performance.now(); timings[k] = Math.round(n - tm); tm = n; };

  // ------------------------------------------------------------ layout → pads & paths
  const pads = (recipe.pads || []).map((p) => ({ ...p }));
  const paths = (recipe.paths || []).map((p) => ({ ...p }));
  let dojoYaw = 0;
  if (isHome && L.dojo) {
    dojoYaw = yawTo(L.dojo, L.spawn);
    const fx = Math.sin(dojoYaw), fz = Math.cos(dojoYaw), ex = L.dojo.x + fx * 16.5, ez = L.dojo.z + fz * 16.5;
    pads.push({ x: L.dojo.x, z: L.dojo.z, r: 17, fall: 12 }, { x: ex, z: ez, r: 4, fall: 6 });
    paths.push({ pts: [[0, 12], [(ex) * 0.5, 12 + (ez - 12) * 0.5 - 4], [ex, ez]], w: 1.3, dojo: true });
  }
  let shopYaw = 0, portalYaw = 0, arenaYaw = 0;
  const TSCALE = [0.55, 0.8, 1.1];
  const templeSpots = [];
  if (!isHome) {
    shopYaw = yawTo(L.shop, L.spawn); portalYaw = yawTo(L.homePortal, L.spawn); arenaYaw = yawTo(L.arena, L.spawn);
    // ---- place the 3 temples: tier 0 nearest, tier 2 far; flat, dry, reachable, away from camps / arena / each other
    const lvl = liquidType ? level : -1e9;
    const spawnH = recipe.height(L.spawn.x, L.spawn.z);
    const avoid = [[L.arena, 46], [L.spawn, 22], [L.shop, 16], [L.homePortal, 12], ...L.camps.map((c) => [c, 22])];
    const bands = [[78, 115], [125, 168], [178, 226]];
    const angOf = (p) => Math.atan2(p.z - L.spawn.z, p.x - L.spawn.x);
    const angDist = (a, b2) => { const d = Math.abs(a - b2) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
    for (let t = 0; t < 3; t++) {
      const S = TSCALE[t], pr = 24 * S;
      let best = null;
      const tryAt = (x, z, forced) => {
        const yaw = Math.atan2(L.spawn.x - x, L.spawn.z - z);
        const off = 19 * S + 21, cx = x + Math.sin(yaw) * off, cz = z + Math.cos(yaw) * off;
        if (!forced) {
          if (Math.hypot(x, z) > R - 30 - pr * 0.5 || Math.hypot(cx, cz) > R - 24) return;
          for (const [p, d] of avoid) if (Math.hypot(x - p.x, z - p.z) < d + pr || Math.hypot(cx - p.x, cz - p.z) < d + 22) return;
          for (const o of templeSpots) if (Math.hypot(x - o.x, z - o.z) < 70 || Math.hypot(cx - o.cx, cz - o.cz) < 55 || Math.hypot(x - o.cx, z - o.cz) < 40 || Math.hypot(cx - o.x, cz - o.z) < 40) return;
        }
        let lo = 1e9, hiH = -1e9, wet = 0;
        for (const [px, pz, rr] of [[x, z, pr], [cx, cz, 21]]) for (let k = 0; k < 9; k++) {
          const a = (k / 8) * Math.PI * 2, d = k === 8 ? 0 : rr * 0.8;
          const h = recipe.height(px + Math.cos(a) * d, pz + Math.sin(a) * d);
          lo = Math.min(lo, h); hiH = Math.max(hiH, h); if (h < lvl + 1.0) wet++;
        }
        let steep = 0, wetLine = 0, prev = spawnH;
        const dl = Math.hypot(cx - L.spawn.x, cz - L.spawn.z), n = Math.ceil(dl / 8);
        for (let i = 1; i <= n; i++) {
          const f = i / n, h = recipe.height(L.spawn.x + (cx - L.spawn.x) * f, L.spawn.z + (cz - L.spawn.z) * f);
          steep += Math.max(0, Math.abs(h - prev) - 4); if (h < lvl + 0.3) wetLine++; prev = h;
        }
        let sep = Math.PI;
        for (const o of [...templeSpots, { x: L.arena.x, z: L.arena.z }]) sep = Math.min(sep, angDist(angOf({ x, z }), angOf(o)));
        const score = -(hiH - lo) * 1.2 - wet * 25 - steep * 5 - wetLine * (liquidType === 'lava' ? 25 : 3) + sep * 6;
        if (!best || score > best.score) best = { x, z, yaw, cx, cz, S, tier: t, score };
      };
      if (recipe.templeSpots) tryAt(recipe.templeSpots[t].x, recipe.templeSpots[t].z, true);
      else for (let ai = 0; ai < 30; ai++) for (let di = 0; di < 4; di++) {
        const a = (ai / 30) * Math.PI * 2 + t * 0.37, d = bands[t][0] + (bands[t][1] - bands[t][0]) * (di + 0.5) / 4;
        tryAt(L.spawn.x + Math.cos(a) * d, L.spawn.z + Math.sin(a) * d, false);
      }
      if (!best) { const a = t * 2.1 + 0.5, d = (bands[t][0] + bands[t][1]) / 2; tryAt(L.spawn.x + Math.cos(a) * d, L.spawn.z + Math.sin(a) * d, true); }
      templeSpots.push(best);
    }
    if (recipe.keep) for (const s of templeSpots) recipe.keep.push({ x: s.x, z: s.z, r: 30 }, { x: s.cx, z: s.cz, r: 26 });
    L.temple = templeSpots[0];
    pads.push({ x: L.spawn.x, z: L.spawn.z, r: 7, fall: 12 }, { x: L.homePortal.x, z: L.homePortal.z, r: 5, fall: 8 },
      { x: L.shop.x, z: L.shop.z, r: 12, fall: 12, dirt: 0.55 }, { x: L.arena.x, z: L.arena.z, r: 35, fall: 18, scorch: 0.75 });
    for (const s of templeSpots) {
      const tp = { x: s.x, z: s.z, r: 24 * s.S, fall: 18 }, cp = { x: s.cx, z: s.cz, r: 22, fall: 14, dirt: s.tier === 0 ? 0.3 : 0, link: tp };
      pads.push(tp, cp);
    }
    for (const c of L.camps) pads.push({ x: c.x, z: c.z, r: 13, fall: 12, dirt: 0.75 });
    const trail = (a, b2, w, wig) => {
      const pts = []; const n = Math.max(2, Math.round(Math.hypot(b2.x - a.x, b2.z - a.z) / 25));
      for (let i = 0; i <= n; i++) {
        const t = i / n; const off = i === 0 || i === n ? 0 : kit.n1(t * 3.1 + a.x, a.z * 0.01) * wig;
        const dx = b2.x - a.x, dz = b2.z - a.z, l = Math.hypot(dx, dz);
        pts.push([a.x + dx * t - (dz / l) * off, a.z + dz * t + (dx / l) * off]);
      }
      return { pts: chaikin(pts, 2), w };
    };
    const C3 = templeSpots.map((s) => ({ x: s.cx, z: s.cz }));
    paths.push(trail(L.spawn, L.shop, 1.3, 2), trail(L.spawn, L.homePortal, 1.0, 0), trail(L.spawn, C3[0], 1.1, 12), trail(C3[0], C3[1], 1.0, 14), trail(C3[1], C3[2], 1.0, 14));
  }
  for (const p of paths) {
    p.pts = p.pts.length > 2 ? p.pts : p.pts;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    p.bb = [x0 - p.w - 6, x1 + p.w + 6, z0 - p.w - 6, z1 + p.w + 6];
  }
  const minAbove = recipe.padMinAbove ?? 1.0;
  for (const p of pads) {
    let s = 0, n = 0;
    for (let k = 0; k < 9; k++) { const a = (k / 8) * Math.PI * 2, d = k === 8 ? 0 : p.r * 0.6; s += recipe.height(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d); n++; }
    p.h = Math.max(s / n, (level ?? -1e9) + minAbove);
  }
  for (const p of pads) if (p.link) {
    const h = Math.max(p.h, p.link.h) * 0.6 + Math.min(p.h, p.link.h) * 0.4; p.h = h; p.link.h = h;
  }
  const padBlend = (h, x, z) => {
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > p.r + p.fall) continue;
      const w = 1 - smoothstep(p.r, p.r + p.fall, d);
      h += (p.h - h) * w;
    }
    return h;
  };
  lap('layout');

  // ------------------------------------------------------------ height grids
  // The full height function is evaluated on a 4 m grid; the 2 m grid is a Catmull-Rom upsample,
  // except near rivers where narrow channels need exact samples.
  const near = new Heightfield(400, hi ? 2 : 4);
  const coarse = hi ? new Heightfield(400, 4) : near;
  const rivers = recipe.rivers || [];
  const nearRiver = new Uint8Array(coarse.n * coarse.n);
  {
    const RO = {};
    const C = coarse, n = C.n;
    for (let j = 0; j < n; j++) {
      const z = -C.half + j * C.step;
      for (let i = 0; i < n; i++) {
        const x = -C.half + i * C.step;
        C.h[j * n + i] = padBlend(recipe.height(x, z), x, z);
        for (const rv of rivers) {
          if (x < rv.bx0 || x > rv.bx1 || z < rv.bz0 || z > rv.bz1) continue;
          polyDist(x, z, rv.pts, RO); if (RO.d < rv.w * 1.3 + 6) { nearRiver[j * n + i] = 1; break; }
        }
      }
    }
  }
  if (hi) {
    const C = coarse, cn = C.n, ch = C.h, n = near.n;
    const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
    const at = (i, j) => ch[Math.min(cn - 1, Math.max(0, j)) * cn + Math.min(cn - 1, Math.max(0, i))];
    for (let j = 0; j < n; j++) {
      const cj = j >> 1, tz = (j & 1) * 0.5;
      for (let i = 0; i < n; i++) {
        const ci = i >> 1, tx = (i & 1) * 0.5;
        let h;
        if (nearRiver[Math.min(cn - 1, cj) * cn + Math.min(cn - 1, ci)] || nearRiver[Math.min(cn - 1, cj + (j & 1)) * cn + Math.min(cn - 1, ci + (i & 1))]) {
          const x = -near.half + i * near.step, z = -near.half + j * near.step;
          h = padBlend(recipe.height(x, z), x, z);
        } else if (tx === 0 && tz === 0) h = ch[cj * cn + ci];
        else {
          const r0 = cr(at(ci - 1, cj - 1), at(ci, cj - 1), at(ci + 1, cj - 1), at(ci + 2, cj - 1), tx);
          const r1 = cr(at(ci - 1, cj), at(ci, cj), at(ci + 1, cj), at(ci + 2, cj), tx);
          const r2 = cr(at(ci - 1, cj + 1), at(ci, cj + 1), at(ci + 1, cj + 1), at(ci + 2, cj + 1), tx);
          const r3 = cr(at(ci - 1, cj + 2), at(ci, cj + 2), at(ci + 1, cj + 2), at(ci + 2, cj + 2), tx);
          h = cr(r0, r1, r2, r3, tz);
        }
        near.h[j * n + i] = h;
      }
    }
  }
  const far = new Heightfield(1000, 20);
  far.fill((x, z) => (Math.abs(x) < 380 && Math.abs(z) < 380 ? near.sample(x, z) : recipe.height(x, z)));
  lap('heights');

  const groundAt = (x, z) => (near.inside(x, z) ? near.sample(x, z) : far.sample(x, z));
  const floors = new FloorSet();
  const iceLevel = liquidType === 'ice' ? level : null;
  const heightAt = (x, z) => {
    let h = groundAt(x, z);
    const f = floors.at(x, z); if (f > h) h = f;
    if (iceLevel !== null && h < iceLevel) h = iceLevel;
    return h;
  };
  const normalAt = (x, z, target = new V3()) => {
    const e = 0.6;
    return target.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
  };
  const slopeAt = (x, z) => { const e = 1.5; const dx = groundAt(x - e, z) - groundAt(x + e, z), dz = groundAt(x, z - e) - groundAt(x, z + e); return 1 - (2 * e) / Math.hypot(dx, 2 * e, dz); };
  const pathDist = (x, z) => {
    let best = 1e9, w = 0;
    for (const p of paths) { if (x < p.bb[0] || x > p.bb[1] || z < p.bb[2] || z > p.bb[3]) continue; polyDist(x, z, p.pts, PD); if (PD.d - p.w < best) { best = PD.d - p.w; w = p.w; } }
    return [best, w];
  };
  const blocked = (x, z, r = 2) => {
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < p.r + r + (p.r > 20 ? 4 : 2)) return true;
    if (r < 2.5 && Math.abs(x) < 398 && Math.abs(z) < 398) { const gi = Math.round((x + 400) / near.step), gj = Math.round((z + 400) / near.step); if (pathD[gj * near.n + gi] < r + 0.5) return true; } else if (pathDist(x, z)[0] < r + 0.5) return true;
    return false;
  };

  // ------------------------------------------------------------ splat + aux maps
  const N = near.n, H = near.h, step = near.step, half = near.half;
  const splat = new Uint32Array(N * N);
  const aux = new Uint8Array(N * N * 4);
  const glowAmt = recipe.terrain.glowAmt || 0;
  const grassCfg = recipe.grass;
  // stamp polylines into distance fields (cost ~ polyline area, not grid size)
  const stamp = (pts, reach, cb) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-6, L = Math.sqrt(L2);
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + half) / step)), i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + half) / step));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + half) / step)), j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + half) / step));
      for (let j = j0; j <= j1; j++) {
        const z = -half + j * step;
        for (let i = i0; i <= i1; i++) {
          const x = -half + i * step;
          let t = ((x - ax) * ex + (z - az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = ax + ex * t - x, dz = az + ez * t - z, d = Math.sqrt(dx * dx + dz * dz);
          if (d < reach) cb(j * N + i, d, ex / L, ez / L);
        }
      }
    }
  };
  const pathD = new Float32Array(N * N).fill(1e9), pathW = new Float32Array(N * N);
  for (const p of paths) stamp(p.pts, p.w + 3, (k, d) => { if (d - p.w < pathD[k]) { pathD[k] = d - p.w; pathW[k] = p.w; } });
  const flowX = new Float32Array(N * N), flowZ = new Float32Array(N * N), flowD = new Float32Array(N * N).fill(1e9);
  for (const rv of rivers) stamp(rv.pts, rv.w * 1.4, (k, d, dx, dz) => { if (d < flowD[k]) { flowD[k] = d; const s = 1 - smoothstep(rv.w * 0.5, rv.w * 1.4, d); flowX[k] = dx * s; flowZ[k] = dz * s; } });
  const padNear = pads.filter((p) => p.r > 0);
  for (let j = 0; j < N; j++) {
    const z = -half + j * step;
    for (let i = 0; i < N; i++) {
      const x = -half + i * step, k = j * N + i, h = H[k];
      const hl = H[k - (i > 0 ? 1 : 0)], hr = H[k + (i < N - 1 ? 1 : 0)], hd = H[k - (j > 0 ? N : 0)], hu = H[k + (j < N - 1 ? N : 0)];
      const slope = 1 - (2 * step) / Math.hypot(hr - hl, 2 * step, hu - hd);
      let dirt = 0, wet = 0, scorch = 0, glow = 0;
      const pd = pathD[k];
      if (pd < 2.2) dirt = 1 - smoothstep(-pathW[k] * 0.5, hi ? 1.1 : -0.2, pd + kit.n2(x * 0.3, z * 0.3) * 0.7);
      let inPad = 0;
      for (const p of padNear) {
        const dx = x - p.x, dz = z - p.z; if (dx > p.r + 4 || dx < -p.r - 4 || dz > p.r + 4 || dz < -p.r - 4) continue;
        const d = Math.sqrt(dx * dx + dz * dz); if (d > p.r + 4) continue;
        const w = 1 - smoothstep(p.r * 0.7, p.r + 3, d); inPad = Math.max(inPad, w);
        if (p.dirt) dirt = Math.max(dirt, w * p.dirt * (0.6 + 0.4 * kit.n2(x * 0.15, z * 0.15)));
        if (p.scorch) scorch = Math.max(scorch, w * p.scorch * (0.6 + 0.4 * kit.n3(x * 0.08, z * 0.08)));
      }
      if (idx === 7 && level !== null) wet = Math.max(wet, 1 - smoothstep(level + 0.2, level + 1.8, h));
      if (idx === 5 && level !== null) wet = Math.max(wet, 1 - smoothstep(level, level + 1.2, h));
      if (glowAmt) {
        if (liquidType === 'lava') glow = Math.max(1 - smoothstep(level, level + 4, h), smoothstep(0.55, 0.75, kit.ridged(x / 60, z / 60, 2)) * 0.7);
        else glow = smoothstep(0.62, 0.78, kit.ridged(x / 50, z / 50, 2)) * 0.6;
      }
      splat[k] = (Math.round(dirt * 255)) | (Math.round(wet * 255) << 8) | (Math.round(scorch * 255) << 16) | (Math.round(glow * 255) << 24);
      let gd = 0;
      if (grassCfg) {
        gd = (1 - smoothstep(0.22, 0.38, slope)) * (1 - dirt) * (1 - inPad) * (1 - scorch);
        if (level !== null) gd *= smoothstep(level + 0.4, level + 1.4, h);
        if (gd > 0) gd *= smoothstep(-0.55, -0.1, kit.n2(x * 0.018, z * 0.018) + (grassCfg.patch ?? 0.2));
        if (recipe.grassNear) { const G = recipe.grassNear; gd *= 1 - smoothstep(G.r * 0.6, G.r, Math.hypot(x - G.x, z - G.z)); }
        if (idx === 1) gd *= smoothstep(level + 2.0, level + 3.2, h);
      }
      aux[k * 4] = Math.round(gd * 255);
      aux[k * 4 + 1] = Math.round((flowX[k] * 0.5 + 0.5) * 255); aux[k * 4 + 2] = Math.round((flowZ[k] * 0.5 + 0.5) * 255); aux[k * 4 + 3] = Math.round(dirt * 255);
    }
  }
  const auxTex = new THREE.DataTexture(aux, N, N, THREE.RGBAFormat);
  auxTex.minFilter = auxTex.magFilter = THREE.LinearFilter; auxTex.needsUpdate = true;
  const hfTex = heightTexture(near);
  const hField = new V3(near.half, near.step, near.n);
  const grassDensity = (x, z) => { const i = Math.round((x + half) / step), j = Math.round((z + half) / step); if (i < 0 || j < 0 || i >= N || j >= N) return 0; return aux[(j * N + i) * 4] / 255; };
  lap('splat');

  // ------------------------------------------------------------ terrain
  const root = new THREE.Group(); root.name = 'world_' + id;
  scene.add(root);
  const tp = recipe.terrain;
  const tmat = terrainMaterial(renderer, {
    ...biome.ground, snow: tp.snow, glow: tp.glow, rock2: tp.rock2, waterLevel: level ?? -999, beach: tp.beach, snowLine: tp.snowLine, rockSlope: tp.rockSlope,
    strata: tp.strata, glowAmt: tp.glowAmt, softGround: tp.softGround, dirtPatches: tp.dirtPatches, sandAll: tp.sandAll, auxTex, half: near.half, dry: tp.dry ?? ({ home: 0.45, 0: 0.45, 1: 0.3, 4: 0.3, 6: 0.35 }[id] ?? 0),
  }, quality);
  const terrainLOD = new TerrainLOD(near, splat, tmat, quality);
  terrainLOD.update(new V3(L.spawn.x, 0, L.spawn.z));
  const farMesh = new THREE.Mesh(farGeometry(far, near.half), tmat); farMesh.name = 'terrainFar';
  root.add(terrainLOD.mesh, farMesh);
  lap('terrain');

  // ------------------------------------------------------------ structures
  const colliders = { circles: [], segments: [] };
  const lights = new LightPool(scene, hi ? 4 : 3);
  const mats = structureMaterials(renderer, quality);
  const canopyCols = isHome ? [['#c8463a', '#f2e8d8'], ['#3a6ac8', '#f2e8d8'], ['#e0a030', '#7a3a2a']] : [[biome.trees.leaf === '#000000' ? '#8a3a2a' : '#b8463a', '#f0e6d4']];
  const canopyTex = [];
  ['canopy', 'canopy2', 'canopy3'].forEach((k, i) => {
    const c = canopyCols[i % canopyCols.length];
    const tex = stripeTexture(c[0], c[1], 8); canopyTex.push(tex);
    mats[k] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true });
  });
if (isHome) {    const shojiTex = shojiTexture(); canopyTex.push(shojiTex);    mats.shoji = new THREE.MeshStandardMaterial({ map: shojiTex, emissive: 0xffb870, emissiveMap: shojiTex, emissiveIntensity: 0.05, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true });    mats.polish = packedMaterial(renderer, { tex: 'planks', roughness: 0.45, vertexColors: true, normalScale: 0.6, luma: [0.7, 1.25], auxVar: 0.3 });  }
  const b = new Builder(mats, floors, colliders, lights);
  const flames = new FlameSet();
  const noiseTex = bakeTexture(renderer, 'clouds');
  const runeTex = runeTexture(seed % 1000);
  const dynamics = []; const disposables = [runeTex, auxTex, hfTex, ...canopyTex];
  const landmarks = {};
  const portalObjs = [];
  const templeDyns = [], templeAnchors = [];
  let homeCrystals = null;
  const lanternsAlong = (pts, every = 15) => {
    let acc = every * 0.6, side = 1;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1]; const l = Math.hypot(x2 - x1, z2 - z1);
      for (let d = acc; d < l; d += every) {
        const t = d / l, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, nx = -(z2 - z1) / l, nz = (x2 - x1) / l;
        const lx = x + nx * 2.6 * side, lz = z + nz * 2.6 * side;
        b.at(lx, groundAt(lx, lz), lz, Math.atan2(-nx * side, -nz * side) - Math.PI / 2); lanternPost(b, 0, 0, 2.7); side = -side;
      }
      acc = (acc - l) % every; if (acc < 0) acc += every;
    }
  };
  const padH = (x, z) => groundAt(x, z);

  if (isHome) {
    // house
    const Hs = L.house; b.at(Hs.x, padH(Hs.x, Hs.z), Hs.z, Hs.yaw);
    const hs = house(b);
    landmarks.bed = { pos: hs.bed, radius: 1.6 };
    // garden
    b.at(L.garden.x, padH(L.garden.x, L.garden.z), L.garden.z, L.garden.yaw); garden(b, new RNG(seed + 3));
    // market
    b.at(L.market.x, padH(L.market.x, L.market.z), L.market.z, L.market.yaw);
    const mk = market(b, flames);
    const mPos = b.wv(0, 0, -2);
    landmarks.shop = { pos: new V3(mPos.x, heightAt(mPos.x, mPos.z), mPos.z), merchant: mk.main.merchant, merchantYaw: L.market.yaw, radius: 6 };
    // plaza + portals
    const pc = L.plaza; const py = padH(pc.x, pc.z);
    b.at(pc.x, py, pc.z, 0); plaza(b, pc.r);
    const names = DIMENSIONS.map((d) => d.name);
    const atlas = plaqueAtlas(names, POWERS.map((p) => '#ffd27a'));
    disposables.push(atlas);
    const plaqueGeo = { P: [], UV: [], I: [] };
    landmarks.portals = []; landmarks.crystalTables = [];
    const crystalSlots = []; const lockTex = lockTexture(); disposables.push(lockTex);
    L.portals.forEach((pp, i) => {
      const th = PORTAL_THEMES[i];
      b.at(pp.x, py, pp.z, pp.yaw);
      const ring = portalRing(b, { R: 2.6, stone: th.stone, mat: th.mat, theme: i });
      portalDecor(b, i, ring, POWERS[i].color);
      // crystal table beside the portal: 3 crystal sockets on top, the name plaque on its front (out of the walking line)
      const pcx = -(ring.R + 1.6), pcz = 1.9, pry = 0.45;
      const loc = (u, v) => [pcx + Math.cos(pry) * u + Math.sin(pry) * v, pcz - Math.sin(pry) * u + Math.cos(pry) * v];
      b.box('stone', pcx, 0.45, pcz, 1.9, 0.9, 0.8, { ry: pry, color: new THREE.Color('#77736c') });
      b.box('stone', pcx, 0.97, pcz, 2.1, 0.14, 1.0, { ry: pry, color: new THREE.Color('#8a857c') });
      [-0.62, 0, 0.62].forEach((u, k) => {
        const [lx, lz] = loc(u, 0);
        b.cyl('stone', lx, 1.1, lz, 0.17, 0.14, { seg: 8, rTop: 1.3, color: new THREE.Color('#5a5650') });
        b.cyl('glow', lx, 1.175, lz, 0.13, 0.02, { seg: 8, color: new THREE.Color(POWERS[i].color).multiplyScalar(0.3) });
        crystalSlots.push({ table: i, k, pos: b.wv(lx, 1.62, lz) });
      });
      b.post(pcx, pcz, 0.8);
      const corners = [[-0.8, 0.42], [0.8, 0.42], [0.8, 0.82], [-0.8, 0.82]].map(([u, y]) => { const [lx, lz] = loc(u, 0.415); return b.wv(lx, y, lz); });
      const tc0 = b.wv(...(([lx, lz]) => [lx, 0, lz])(loc(0, 0)));
      landmarks.crystalTables.push({ index: i, pos: new V3(tc0.x, heightAt(tc0.x, tc0.z), tc0.z), radius: 1.8 });
      const base = plaqueGeo.P.length / 3;
      corners.forEach((c) => plaqueGeo.P.push(c.x, c.y, c.z));
      plaqueGeo.UV.push(0, (i + 1) / 9, 1, (i + 1) / 9, 1, i / 9, 0, i / 9);
      plaqueGeo.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      const centre = b.wv(0, ring.cy, 0);
      const runes = new THREE.Mesh(runeGeometry(b, ring), runeMaterial(runeTex, POWERS[i].color));
      const swirl = new THREE.Mesh(new THREE.CircleGeometry(ring.R - 0.02, 48), swirlMaterial(POWERS[i].color, noiseTex, lockTex));
      swirl.position.copy(centre); swirl.rotation.y = pp.yaw; swirl.renderOrder = 4;
      const trim = new THREE.Mesh(mergeGeometries([new THREE.TorusGeometry(ring.R + 0.66, 0.1, 8, 72), new THREE.TorusGeometry(ring.R - 0.02, 0.08, 8, 72)]), mats.gold);
      trim.position.copy(centre); trim.rotation.y = pp.yaw; trim.castShadow = true;
      root.add(runes, swirl, trim);
      const emitter = lights.add(centre, POWERS[i].color, 14, 12, { pri: 1.2 });
      const o = { runes, swirl, trim, emitter, state: 'locked' };
      portalObjs.push(o);
      const gp = b.wv(0, 0, 0);
      landmarks.portals.push({ index: i, pos: new V3(gp.x, py + ring.base, gp.z), yaw: pp.yaw, radius: 2.4 });
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(plaqueGeo.P, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(plaqueGeo.UV, 2));
    pg.setIndex(plaqueGeo.I); pg.computeVertexNormals();
    const plaques = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.6, metalness: 0.1 }));
    root.add(plaques); disposables.push(pg, plaques.material);
    // power crystals on the tables (one instanced mesh for all 27 sockets)
    {
      const cGeo = new THREE.OctahedronGeometry(1, 0); cGeo.scale(0.13, 0.3, 0.13);
      const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const im = new THREE.InstancedMesh(cGeo, cMat, crystalSlots.length); im.name = 'crystals'; im.frustumCulled = false;
      crystalSlots.forEach((s, k) => im.setColorAt(k, new THREE.Color(POWERS[s.table].color).multiplyScalar(1.35)));
      const counts = new Array(9).fill(0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), p = new V3();
      homeCrystals = {
        set(i, n) { counts[i] = Math.max(0, Math.min(3, n | 0)); },
        update(t) {
          crystalSlots.forEach((s, k) => {
            const on = s.k < counts[s.table];
            q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t * 0.8 + k); sc.setScalar(on ? 1 : 0); p.copy(s.pos); p.y += Math.sin(t * 1.6 + k) * 0.05;
            im.setMatrixAt(k, m.compose(p, q, sc));
          });
          im.instanceMatrix.needsUpdate = true;
        },
      };
      homeCrystals.update(0);
      root.add(im); disposables.push(cGeo);
    }
    // dock
    const Dk = L.dock; b.at(Dk.x, groundAt(Dk.x, Dk.z), Dk.z, Dk.yaw); b.frame.y = 0; dock(b, Dk.len, level + 0.75);
    // lanterns along paths + plaza
    for (const p of paths) lanternsAlong(chaikin(p.pts, 1), 16);
    for (let k = 0; k < 6; k++) { const a = Math.PI + (k - 2.5) * 0.42; const x = pc.x + Math.sin(a) * (pc.r - 2.5), z = pc.z - Math.cos(a) * (pc.r - 2.5); b.at(x, py, z, a); lanternPost(b, 0, 0, 3.0); }
    // dojo
    if (L.dojo) {
      b.at(L.dojo.x, padH(L.dojo.x, L.dojo.z), L.dojo.z, dojoYaw);
      const dj = buildDojo(b, { group: root, lights, disposables });
      landmarks.dojo = { pos: new V3(dj.pos.x, heightAt(dj.pos.x, dj.pos.z), dj.pos.z), door: dj.door, mat: dj.mat, master: dj.master, masterYaw: dj.masterYaw, dummies: dj.dummies, radius: dj.radius };
    }
    landmarks.villagers = L.villagers.map((v) => new V3(v.x, heightAt(v.x, v.z), v.z));
  } else {
    const power = POWERS[idx].color;
    // three temples (tier 0 shrine, 1 temple, 2 great temple), each with an open courtyard in front
    landmarks.temples = [];
    const tStyle = TEMPLE_STYLES[idx];
    for (const s of templeSpots) {
      b.at(s.x, padH(s.x, s.z), s.z, s.yaw, s.S);
      const an = temple(b, idx, power, flames, s.tier);
      templeAnchors.push(an);
      const ty = padH(s.x, s.z);
      b.at(s.cx, padH(s.cx, s.cz), s.cz, s.yaw);
      courtyard(b, flames, s.tier, tStyle.stone, 22);
      landmarks.temples.push({ tier: s.tier, name: def.temples?.[s.tier]?.name || ['Shrine', 'Temple', 'Great Temple'][s.tier], pos: new V3(s.x, ty, s.z), door: an.door, altar: an.altar,
        radius: Math.round(24 * s.S), courtyard: { pos: new V3(s.cx, padH(s.cx, s.cz), s.cz), radius: 22 } });
    }
    landmarks.temple = landmarks.temples[0];
    // trading post
    b.at(L.shop.x, padH(L.shop.x, L.shop.z), L.shop.z, shopYaw);
    const tpost = tradingPost(b, flames, null, '#a07850');
    const sc = b.wv(0, 0, 0);
    landmarks.shop = { pos: new V3(sc.x, padH(sc.x, sc.z), sc.z), merchant: tpost.merchant, merchantYaw: shopYaw, radius: 6 };
    landmarks.bed = { pos: tpost.bed, radius: 1.5 };
    // return portal
    const hp = L.homePortal; const hpy = padH(hp.x, hp.z);
    b.at(hp.x, hpy, hp.z, portalYaw);
    const ring = portalRing(b, { R: 1.8, thick: 0.45, depth: 0.55, stone: '#8a857c', pedestal: false, theme: 9 });
    const centre = b.wv(0, ring.cy, 0);
    const runes = new THREE.Mesh(runeGeometry(b, ring), runeMaterial(runeTex, '#ffd27a'));
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(ring.R - 0.02, 40), swirlMaterial('#9fd8ff', noiseTex));
    swirl.position.copy(centre); swirl.rotation.y = portalYaw; swirl.renderOrder = 4;
    root.add(runes, swirl);
    portalObjs.push({ runes, swirl, home: true });
    lights.add(centre, '#9fd8ff', 10, 10, { pri: 1.1 });
    landmarks.homePortal = { pos: new V3(hp.x, hpy + ring.base, hp.z), yaw: portalYaw, radius: 2.0 };
    // bandit camps
    for (const c of L.camps) { b.at(c.x, padH(c.x, c.z), c.z, rng.next() * 6.28); banditCamp(b, flames, def.bandit.outfit, groundAt, rng); }
    // boss arena
    b.at(L.arena.x, padH(L.arena.x, L.arena.z), L.arena.z, arenaYaw); bossArena(b, flames, 30, rng);
    landmarks.bossArena = { pos: new V3(L.arena.x, padH(L.arena.x, L.arena.z), L.arena.z), radius: 30 };
    landmarks.spawn = null;
  }
  // spawn
  landmarks.spawn = new V3(L.spawn.x, heightAt(L.spawn.x, L.spawn.z), L.spawn.z);
  landmarks.spawnYaw = isHome ? L.spawnYaw : yawTo(L.spawn, L.temple);
  lap('structures');

  // ------------------------------------------------------------ extras (biome props)
  const ectx = { b, rng: new RNG(seed + 99), level: liquidType === 'lava' || liquidType === 'water' || liquidType === 'ice' ? level : null, radius: R, groundAt, slopeAt, normalAt, blocked, lights, recipe, rawHeight: recipe.height };
  const edyn = buildExtras(recipe.extras || [], ectx);
  const structGroup = new THREE.Group(); structGroup.name = 'structures'; root.add(structGroup);
  b.build(structGroup);
  flames.build(structGroup, noiseTex, fogUniforms);
  lap('extras');

  // ------------------------------------------------------------ liquids
  let liquid = null;
  if (liquidType) {
    liquid = createLiquid(renderer, liquidType, { level, color: biome.liquid.color, hfTex, hField, auxTex, quality, extent: recipe.water?.extent ?? 1300, ...(recipe.water || {}) });
    root.add(liquid.mesh);
    if (edyn.craterAt && liquidType === 'lava') {
      const disc = lavaDisc(liquid, edyn.craterAt.x, edyn.craterAt.y, edyn.craterAt.z, edyn.craterR);
      root.add(disc); disposables.push(disc.geometry);
      lights.add(edyn.craterAt.clone().add(new V3(0, 10, 0)), '#ff6a20', 60, 80, { pri: 0.4 });
    }
  }

  // ------------------------------------------------------------ vegetation
  const veg = createVegetation(renderer, {
    quality, biome, scene: root, colliders, radius: R, seed, groundAt, slopeAt, blocked, grassDensity,
    liquidLevel: liquidType ? level : null, treeSpecs: recipe.trees, grass: recipe.grass, flowers: recipe.flowers, rocks: recipe.rocks,
    hfTex, auxTex, hField, windAmp: recipe.windAmp, barkTop: recipe.barkTop, barkTopAmt: recipe.barkTopAmt, leafGlow: recipe.leafGlow,
  });
  lap('vegetation');

  // ------------------------------------------------------------ sky, lights, fog, weather
  const sky = createSky(renderer, { ...recipe.sky, seed });
  root.add(sky.group);
  const palette = makeSkyPalette(biome, recipe.sky || {});
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  const SMAP = hi ? 2048 : 1024, SEXT = hi ? 70 : 55;
  sun.shadow.mapSize.set(SMAP, SMAP);
  Object.assign(sun.shadow.camera, { left: -SEXT, right: SEXT, top: SEXT, bottom: -SEXT, near: 1, far: 600 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = hi ? 0.045 : 0.06;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 0.5);
  scene.add(hemi);
  const prevFog = scene.fog, prevEnv = scene.environment, prevBg = scene.background;
  scene.fog = new THREE.FogExp2(new THREE.Color(biome.fog.color), biome.fog.density);
  scene.background = new THREE.Color(biome.fog.color);
  const weatherKind = { clear: null, embers: 'embers', snow: 'snow', dust: 'dust', storm: 'storm', heat: 'heat', mist: null, ash: 'ash' }[biome.weather] ?? null;
  const weather = createWeather(renderer, root, {
    kind: weatherKind, quality, seed, extras: recipe.weatherExtras || [], mistY: (level ?? 0) + 0.5, mistColor: recipe.mistColor,
    fireflyColor: recipe.fireflyColor, fireflyColor2: recipe.fireflyColor2, firefliesAlways: recipe.firefliesAlways,
    smokeAt: recipe.volcano ? { x: recipe.volcano.x, z: recipe.volcano.z } : null, smokeY: recipe.volcano ? recipe.height(recipe.volcano.x, recipe.volcano.z) + 20 : 0,
  });
  let tumble = null;
  if (edyn.tumbleweeds) { tumble = createTumbleweeds(edyn.tumbleweeds, { groundAt }); root.add(tumble.group); }

  // temple dynamics
  templeAnchors.forEach((an) => { const d = templeDynamic(root, an, POWERS[idx].color, noiseTex, an.tier); templeDyns.push(d); dynamics.push(d); });
  lap('sky');

  // ------------------------------------------------------------ monster spawns
  const monsterSpawns = [];
  {
    const avoid = [];
    if (isHome) { avoid.push([L.spawn, 45], [{ x: L.market.x, z: L.market.z }, 45], [{ x: L.plaza.x, z: L.plaza.z }, 50], [{ x: L.house.x, z: L.house.z }, 25]); }
    else { avoid.push([L.spawn, 45], [L.shop, 45], [L.homePortal, 45], [L.arena, 40]); L.camps.forEach((c) => avoid.push([c, 18])); templeSpots.forEach((s) => avoid.push([s, 26 * s.S + 4], [{ x: s.cx, z: s.cz }, 26])); }
    const r2 = new RNG(seed + 4242);
    let minSep = 26;
    for (let t = 0; t < 6000 && monsterSpawns.length < 30; t++) {
      if (t % 1500 === 1499) minSep *= 0.75;
      const a = r2.next() * Math.PI * 2, d = Math.sqrt(r2.next()) * (R - 12);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = heightAt(x, z);
      if (liquidType && liquidType !== 'ice' && y < level + 0.8) continue;
      if (slopeAt(x, z) > 0.35) continue;
      if (avoid.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r)) continue;
      if (monsterSpawns.some((s) => Math.hypot(s.x - x, s.z - z) < minSep)) continue;
      monsterSpawns.push(new V3(x, y, z));
    }
  }
  const banditCamps = isHome ? [] : L.camps.map((c) => ({ pos: new V3(c.x, heightAt(c.x, c.z), c.z), radius: 14 }));

  // ------------------------------------------------------------ time of day & env
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, envT = -1, envDirty = true, envAge = 0;
  let night = 0, curT = 0.3, lightState = null;
  const tmpC = new THREE.Color();
  function regenEnv() {
    const rt = pmrem.fromScene(sky.envScene, 0, 0.1, 100);
    if (envRT) envRT.dispose();
    envRT = rt; scene.environment = rt.texture; envDirty = false; envAge = 0;
  }
  const lightDir = new V3(0, 1, 0);
  function setTimeOfDay(t) {
    t = ((t % 1) + 1) % 1; curT = t;
    const p = computeDaylight(t, palette);
    p.sunUp = !palette.alwaysNight && p.elev > -0.035;
    p.moonCol = palette.base.moonLight;
    p.waterLight = palette.alwaysNight ? 0.32 : 1 - p.night * 0.8;
    lightState = p;
    sky.setState(p);
    lightDir.copy(p.light.dir);
    sun.color.setRGB(p.light.color.r, p.light.color.g, p.light.color.b, THREE.SRGBColorSpace);
    sun.intensity = p.light.intensity;
    hemi.color.setRGB(p.hemi.sky.r, p.hemi.sky.g, p.hemi.sky.b, THREE.SRGBColorSpace);
    hemi.groundColor.setRGB(p.hemi.ground.r, p.hemi.ground.g, p.hemi.ground.b, THREE.SRGBColorSpace);
    hemi.intensity = p.hemi.intensity;
    veg.setLight(tmpC.copy(sun.color).multiplyScalar(Math.min(1.2, sun.intensity / 2.7) * 0.78).add(hemi.color.clone().multiplyScalar(hemi.intensity * 0.6)));
    scene.fog.color.setRGB(p.fog.r, p.fog.g, p.fog.b, THREE.SRGBColorSpace);
    scene.fog.density = p.fogDensity;
    scene.background.copy(scene.fog.color);
    renderer.toneMappingExposure = p.exposure;
    night = p.night;
    mats.window.emissiveIntensity = 0.05 + night * 2.4;
    if (mats.shoji) mats.shoji.emissiveIntensity = 0.32 + night * 0.7;
    mats.lamp.emissiveIntensity = 0.25 + night * 3.0;
    mats.glow.emissiveIntensity = 0.8 + night * 0.6;
    if (liquid) liquid.update(lastTime, p);
    const dt = Math.min(Math.abs(t - envT), 1 - Math.abs(t - envT));
    if (envT < 0 || dt > 0.008) { envDirty = true; envT = t; }
  }
  let lastTime = 0;

  const portalState = (i, s) => {
    const o = portalObjs[i]; if (!o || o.home) return;
    o.state = s;
    const open = s === 'open' || s === 'cleared';
    o.swirl.visible = open;
    o.runes.material.opacity = open ? 1 : 0.22;
    o.trim.visible = s === 'cleared'; o.swirl.visible = true; o.swirl.material.uniforms.uLock.value = open ? 0 : 1;
    o.emitter.on = open;
  };
  if (isHome) for (let i = 0; i < 9; i++) portalState(i, i === 0 ? 'open' : 'locked');

  const templeStates = ['sealed', 'sealed', 'sealed'];
  const setTemple = (i, s) => {
    const d = templeDyns[i], an = templeAnchors[i]; if (!d) return;
    templeStates[i] = s;
    d.bar.visible = s === 'sealed';
    d.setClaimed(s === 'claimed');
    an.orbLight.on = s !== 'claimed';
    const k = colliders.segments.indexOf(an.barrierSeg);
    if (s === 'sealed' && k < 0) colliders.segments.push(an.barrierSeg);
    if (s !== 'sealed' && k >= 0) colliders.segments.splice(k, 1);
  };
  templeDyns.forEach((d, i) => setTemple(i, 'sealed'));

  // ------------------------------------------------------------ world object
  const sTmp = new V3(), ax = new V3(), ay = new V3(), az2 = new V3();
  const texel = (2 * SEXT) / SMAP;
  const world = {
    id, name: def.name, radius: R,
    heightAt, normalAt,
    liquid: liquidType ? { type: liquidType, level } : null,
    colliders, landmarks, monsterSpawns, banditCamps, sun,
    onThunder: null,
    timings,
    setTimeOfDay,
    setPortalState(i, s) { portalState(i, s); },
    setCrystals(i, n) { if (homeCrystals) homeCrystals.set(i, n); },
    setTempleState(a, b2) { if (typeof a === 'string') setTemple(0, a); else setTemple(a | 0, b2); },
    getTempleState(i = 0) { return templeStates[i]; },
    getTimeOfDay() { return curT; },
    update(dt, time, playerPos, camera) {
      lastTime = time;
      const focus = playerPos || (camera && camera.position) || landmarks.spawn;
      if (camera) sky.update(camera, time);
      if (liquid && lightState) liquid.update(time, lightState);
      veg.update(time, focus, camera ? camera.position : focus);
      terrainLOD.update(camera ? camera.position : focus);
      flames.update(time);
      for (const d of dynamics) d.update(time);
      for (const o of portalObjs) if (o.swirl.visible) o.swirl.material.uniforms.uTime.value = time;
      if (homeCrystals) homeCrystals.update(time);
      lights.update(focus, night, time, dt);
      if (camera) weather.update(dt, time, camera, { night }, heightAt, (info) => { if (world.onThunder) world.onThunder(info); });
      if (tumble && camera) tumble.update(dt, time, camera.position);
      const fl = weather.flash;
      sky.uniforms.uFlash.value = fl;
      if (lightState) hemi.intensity = lightState.hemi.intensity + fl * 2.5;
      // shadow camera follows the player, snapped to texels
      az2.copy(lightDir).normalize();
      ax.crossVectors(THREE.Object3D.DEFAULT_UP, az2).normalize(); ay.crossVectors(az2, ax);
      const px = focus.dot(ax), py = focus.dot(ay), pz = focus.dot(az2);
      sTmp.copy(ax).multiplyScalar(Math.round(px / texel) * texel).addScaledVector(ay, Math.round(py / texel) * texel).addScaledVector(az2, pz);
      sun.target.position.copy(sTmp);
      sun.position.copy(sTmp).addScaledVector(az2, 250);
      sun.target.updateMatrixWorld();
      // environment refresh (rate-limited)
      envAge += dt;
      if (envDirty && envAge > 1.0) regenEnv();
    },
    dispose() {
      // Keep one material per compiled shader program alive (never rendered again) so the next world
      // reuses the compiled programs instead of recompiling them. Bounded: one entry per program key.
      let keeper = KEEPERS.get(renderer); if (!keeper) KEEPERS.set(renderer, (keeper = new Map()));
      const keep = (m) => {
        if (!m || m.__kept) return;
        const pr = renderer.properties.get(m); const key = pr && pr.currentProgram && pr.currentProgram.cacheKey;
        if (key && !keeper.has(key)) { keeper.set(key, m); m.__kept = true; m.dispose = () => {}; }
      };
      const collect = (o) => { (Array.isArray(o.material) ? o.material : [o.material]).forEach(keep); keep(o.customDepthMaterial); };
      root.traverse(collect); sky.envScene.traverse(collect);
      scene.remove(root); scene.remove(sun); scene.remove(sun.target); scene.remove(hemi);
      sun.dispose(); hemi.dispose(); lights.dispose();
      root.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isLineSegments || o.isSprite) {
          if (o.geometry && !o.isSprite) o.geometry.dispose();
          const m = Array.isArray(o.material) ? o.material : [o.material];
          m.forEach((mm) => { if (mm) { if (mm.map && mm.map.isCanvasTexture) mm.map.dispose(); mm.dispose(); } });
        }
      });
      veg.dispose(); sky.dispose(); weather.dispose(); flames.dispose(); if (liquid) liquid.dispose(); if (tumble) tumble.dispose();
      dynamics.forEach((d) => d.dispose());
      Object.values(mats).forEach((m) => m.dispose());
      tmat.dispose();
      disposables.forEach((d) => d.dispose());
      if (envRT) envRT.dispose(); pmrem.dispose();
      if (scene.environment === (envRT && envRT.texture)) scene.environment = prevEnv || null;
      scene.environment = null;
      scene.fog = prevFog || null; scene.background = prevBg || null;
    },
  };

  setTimeOfDay(0.3);
  regenEnv();
  veg.forceLod(landmarks.spawn);
  lap('finish');
  // pre-compile shaders so the first frames don't stutter
  if (renderer.compileAsync) {
    const cam = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 1500);
    cam.position.copy(landmarks.spawn).add(new V3(0, 2, 0)); cam.updateMatrixWorld();
    try { await Promise.race([renderer.compileAsync(scene, cam), new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* ignore */ }
  }
  lap('compile');
  timings.total = Math.round(performance.now() - T0);
  void tmpC;
  return world;
}
