// rigkit.js - shared building blocks for every animated model (heroes, NPCs, enemies, bosses).
//
// Everything a model is made of is merged into ONE SkinnedMesh per material slot, so a whole
// character is usually a single draw call (+1 for a sword). Detail comes from a procedural
// 4x4 texture atlas (skin, cloth, leather, hair, metal, bark, rock, scales, fur, chainmail, ...)
// sampled with tiling-inside-a-cell in a patched MeshStandardMaterial. Per-vertex attributes give
// each part its colour, atlas cell, roughness, metalness and glow (emissive), so glowing eyes,
// lava cracks and runes are part of the same draw call.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const sstep = (a, b, x) => smooth((x - a) / (b - a));
export const easeIn = (t) => t * t;
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ------------------------------------------------------------------ random
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 3D value noise (for deforming rocks, bark, etc.)
const PERM = new Uint8Array(512);
const GRAD = new Float32Array(256);
{
  const r = rng(1234);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) GRAD[i] = r() * 2 - 1;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const h = (a, b, c) => GRAD[PERM[PERM[PERM[a] + b] + c]];
  const x0 = lerp(h(X, Y, Z), h(X + 1 & 255, Y, Z), u), x1 = lerp(h(X, Y + 1 & 255, Z), h(X + 1 & 255, Y + 1 & 255, Z), u);
  const x2 = lerp(h(X, Y, Z + 1 & 255), h(X + 1 & 255, Y, Z + 1 & 255), u), x3 = lerp(h(X, Y + 1 & 255, Z + 1 & 255), h(X + 1 & 255, Y + 1 & 255, Z + 1 & 255), u);
  return lerp(lerp(x0, x1, v), lerp(x2, x3, v), w);
}
export function fbm3(x, y, z, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
  return s;
}

// ------------------------------------------------------------------ colours
const _tmpC = new THREE.Color();
export function col(c) { return c instanceof THREE.Color ? c : new THREE.Color(c); }
export function shade(c, f) { return col(c).clone().multiplyScalar(f); }
export function mixc(a, b, t) { return col(a).clone().lerp(col(b), t); }
export function hsl(h, s, l) { return new THREE.Color().setHSL(h, s, l); }
export function hexOf(c) { return '#' + col(c).getHexString(); }

// ------------------------------------------------------------------ texture atlas
// 16 cells of 256px (8px wrapped padding + 240px periodic tile) in a 1024 RGBA texture pair:
//   map:    rgb = albedo detail (multiplied with the vertex colour), a = metalness multiplier / 2
//   normal: rgb = tangent-space normal, a = roughness multiplier / 2
export const CELL = { skin: 0, cloth: 1, wool: 2, leather: 3, hair: 4, metal: 5, gloss: 6, plain: 7, bark: 8, rock: 9, scales: 10, fur: 11, bone: 12, chain: 13, plate: 14, chitin: 15 };
const CELL_TILE = [0.12, 0.06, 0.12, 0.22, 0.10, 0.35, 1, 1, 0.45, 0.7, 0.09, 0.10, 0.22, 0.05, 0.4, 0.3];
const CELL_ROUGH = [0.55, 0.9, 0.96, 0.62, 0.45, 0.35, 0.12, 0.7, 0.95, 0.9, 0.42, 0.88, 0.6, 0.4, 0.3, 0.32];

function periodic(Px, Py, r) {
  const g = new Float32Array(Px * Py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (u, v) => { // u, v in [0,1)
    const x = u * Px, y = v * Py;
    let xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    xi = ((xi % Px) + Px) % Px; yi = ((yi % Py) + Py) % Py;
    const x1 = (xi + 1) % Px, y1 = (yi + 1) % Py;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[yi * Px + xi], b = g[yi * Px + x1], c = g[y1 * Px + xi], d = g[y1 * Px + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function generateAtlas() {
  const R = rng(777);
  const N = {};
  for (const p of [4, 8, 16, 32, 64]) N[p] = periodic(p, p, R);
  const N2 = periodic(16, 16, R), N3 = periodic(32, 32, R), N4 = periodic(8, 8, R);
  const strand = periodic(96, 3, R), strand2 = periodic(40, 2, R);
  const furS = periodic(128, 16, R), furC = periodic(12, 12, R);
  const brush = periodic(2, 128, R), barkA = periodic(9, 2, R), barkB = periodic(22, 5, R);
  const S = 240, SIZE = 1024;
  const map = new Uint8Array(SIZE * SIZE * 4), nrm = new Uint8Array(SIZE * SIZE * 4);
  const alb = new Float32Array(S * S * 3), met = new Float32Array(S * S), rou = new Float32Array(S * S), hgt = new Float32Array(S * S);
  const fbm = (u, v) => 0.5 * N[8](u, v) + 0.25 * N[16](u, v) + 0.15 * N[32](u, v) + 0.1 * N[64](u, v);
  const cells = [];
  // each entry: fn(u,v) -> sets a (albedo 0..1.1), r,g,b tint, m (metal mult), ro (rough mult), h (height); and normal strength
  const o = { a: 1, tr: 1, tg: 1, tb: 1, m: 1, ro: 1, h: 0 };
  const set = (a, m, ro, h) => { o.a = a; o.m = m; o.ro = ro; o.h = h; o.tr = o.tg = o.tb = 1; };
  cells[CELL.skin] = [0.35, (u, v) => {
    const b = N[8](u, v), p = N[64](u, v), q = N[32](u, v);
    set(0.95 + 0.05 * (b - 0.5) + 0.05 * (p - 0.5), 0, 1 + 0.3 * (q - 0.5), 0.6 * p + 0.4 * q);
    o.tr = 1 + 0.04 * (N[16](u, v) - 0.5); o.tb = 1 - 0.03 * (b - 0.5);
  }];
  const weave = (u, v, T) => {
    const a = u * T, b = v * T, ia = Math.floor(a), ib = Math.floor(b), fa = a - ia, fb = b - ib;
    const over = ((ia + ib) & 1) === 0;
    return over ? Math.sin(Math.PI * fa) * (0.55 + 0.45 * Math.sin(Math.PI * fb)) : Math.sin(Math.PI * fb) * (0.55 + 0.45 * Math.sin(Math.PI * fa));
  };
  cells[CELL.cloth] = [1.6, (u, v) => {
    const h = weave(u, v, 20), n = N[32](u, v);
    set(0.8 + 0.2 * h + 0.08 * (n - 0.5) + 0.05 * (N[4](u, v) - 0.5), 0, 1 + 0.1 * (n - 0.5), h);
  }];
  cells[CELL.wool] = [2.5, (u, v) => {
    const h = weave(u, v, 14), f = N[64](u, v);
    set(0.76 + 0.18 * h + 0.14 * (f - 0.5) + 0.06 * (N[8](u, v) - 0.5), 0, 1, 0.7 * h + 0.3 * f);
  }];
  cells[CELL.leather] = [2.4, (u, v) => {
    const g = N[32](u, v), f = N[64](u, v), w = N[8](u, v);
    const crease = sstep(0.06, 0.0, Math.abs(N2(u, v) - 0.5)) * 0.6;
    set(0.84 + 0.14 * (w - 0.5) + 0.08 * (g - 0.5) - 0.12 * crease, 0, 1 + 0.4 * (w - 0.5) + 0.1 * crease, 0.55 * g + 0.25 * f - 0.4 * crease);
  }];
  cells[CELL.hair] = [2.0, (u, v) => {
    const s = 0.65 * strand(u, v) + 0.35 * strand2(u, v);
    set(0.68 + 0.45 * s, 0, 1 + 0.25 * (0.5 - s), s);
  }];
  cells[CELL.metal] = [0.6, (u, v) => {
    const s = brush(u, v), n = N[16](u, v);
    set(0.93 + 0.07 * (s - 0.5) + 0.04 * (n - 0.5), 1, 1 + 0.5 * (s - 0.5) + 0.25 * (n - 0.5), 0.3 * s + 0.2 * n);
  }];
  cells[CELL.gloss] = [0, () => set(1, 1, 1, 0)];
  cells[CELL.plain] = [0.6, (u, v) => { const n = N[16](u, v); set(0.96 + 0.05 * (n - 0.5), 1, 1 + 0.1 * (n - 0.5), n * 0.3); }];
  cells[CELL.bark] = [5.0, (u, v) => {
    const r = 0.6 * barkA(u, v) + 0.4 * barkB(u, v);
    const h = Math.pow(r, 1.4), crev = sstep(0.32, 0.18, h);
    set(0.52 + 0.55 * h - 0.2 * crev + 0.06 * (N[64](u, v) - 0.5), 0, 1 + 0.1 * crev, h);
  }];
  cells[CELL.rock] = [4.0, (u, v) => {
    const f = fbm(u, v), ridge = 1 - Math.abs(2 * N3(u, v) - 1), crack = sstep(0.9, 0.99, ridge);
    set(0.72 + 0.5 * (f - 0.5) - 0.35 * crack, 0, 1 + 0.15 * (f - 0.5), f - 0.35 * crack);
  }];
  cells[CELL.scales] = [3.0, (u, v) => {
    const R = 12, row = Math.floor(v * R), off = (row & 1) ? 0.5 / R : 0;
    const cu = ((u + off) * R) % 1, cv = v * R - row;
    const d = Math.sqrt(((cu - 0.5) * 2) ** 2 + ((1 - cv) * 1.15) ** 2);
    const h = Math.sqrt(clamp(1 - d, 0, 1));
    set(0.62 + 0.4 * h + 0.05 * (N[32](u, v) - 0.5), 0, 1 - 0.3 * h + 0.2, h);
  }];
  cells[CELL.fur] = [2.2, (u, v) => {
    const s = furS(u, v), c = furC(u, v);
    set(0.7 + 0.32 * s + 0.12 * (c - 0.5), 0, 1, 0.7 * s + 0.3 * c);
  }];
  cells[CELL.bone] = [1.2, (u, v) => {
    const n = N[16](u, v), p = N[64](u, v);
    const pit = sstep(0.78, 0.86, p);
    set(0.94 + 0.06 * (n - 0.5) - 0.12 * pit, 0, 1 + 0.2 * pit, 0.3 * n - 0.4 * pit);
  }];
  cells[CELL.chain] = [4.0, (u, v) => {
    const Rn = 16;
    let best = 0;
    const row = Math.floor(v * Rn);
    for (let dr = -1; dr <= 1; dr++) {
      const rr = row + dr, off = (rr & 1) ? 0.5 : 0;
      const cy = (rr + 0.5) / Rn;
      const colI = Math.floor(u * Rn - off);
      for (let dc = -1; dc <= 1; dc++) {
        const cx = (colI + dc + 0.5 + off) / Rn;
        let dx = (u - cx) * Rn, dy = (v - cy) * Rn * 1.1;
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = Math.abs(d - 0.42) / 0.14;
        const hh = t < 1 ? Math.sqrt(1 - t * t) : 0;
        if (hh > best) best = hh;
      }
    }
    set(0.2 + 0.85 * best, best > 0.05 ? 1 : 0.15, best > 0.05 ? 1 : 1.8, best);
  }];
  cells[CELL.plate] = [1.4, (u, v) => {
    const n = N[16](u, v), s = N[64](u, v), w = N4(u, v);
    const scratch = sstep(0.04, 0, Math.abs(brush(v, u) - 0.5)) * 0.4;
    set(0.95 + 0.05 * (w - 0.5) - 0.05 * scratch, 1, 1 + 0.35 * (w - 0.5) + 0.3 * scratch, 0.6 * n + 0.15 * s);
  }];
  cells[CELL.chitin] = [1.2, (u, v) => {
    const n = N[8](u, v), p = N[64](u, v);
    const pit = sstep(0.8, 0.9, p);
    set(0.92 + 0.12 * (n - 0.5) - 0.15 * pit, 0, 1 + 0.25 * (n - 0.5) + 0.3 * pit, 0.5 * n - 0.3 * pit);
  }];

  for (let c = 0; c < 16; c++) {
    const [strength, fn] = cells[c];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      fn(x / S, y / S);
      const i = y * S + x;
      alb[i * 3] = o.a * o.tr; alb[i * 3 + 1] = o.a * o.tg; alb[i * 3 + 2] = o.a * o.tb;
      met[i] = o.m; rou[i] = o.ro; hgt[i] = o.h;
    }
    const cx = (c % 4) * 256, cy = Math.floor(c / 4) * 256;
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
      const sx = (px - 8 + S) % S, sy = (py - 8 + S) % S, i = sy * S + sx;
      const xl = (sx - 1 + S) % S, xr = (sx + 1) % S, yu = (sy - 1 + S) % S, yd = (sy + 1) % S;
      let nx = -(hgt[sy * S + xr] - hgt[sy * S + xl]) * strength, ny = -(hgt[yd * S + sx] - hgt[yu * S + sx]) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o4 = ((cy + py) * SIZE + cx + px) * 4;
      map[o4] = clamp(alb[i * 3] * 230, 0, 255); map[o4 + 1] = clamp(alb[i * 3 + 1] * 230, 0, 255); map[o4 + 2] = clamp(alb[i * 3 + 2] * 230, 0, 255);
      map[o4 + 3] = clamp(met[i] * 127.5, 0, 255);
      nrm[o4] = (nx * 0.5 + 0.5) * 255; nrm[o4 + 1] = (ny * 0.5 + 0.5) * 255; nrm[o4 + 2] = (nz * 0.5 + 0.5) * 255;
      nrm[o4 + 3] = clamp(rou[i] * 127.5, 0, 255);
    }
  }
  const mk = (data) => {
    const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  return { map: mk(map), normal: mk(nrm) };
}
let ATLAS = null;
export function getAtlas() { return ATLAS || (ATLAS = generateAtlas()); }

// albedo 230/255 = 0.9 average -> compensate so vertex colours read true
const ALB_COMP = 255 / 230;

// ------------------------------------------------------------------ material
function atlasPatch(shader) {
  shader.uniforms.uGlow = this.userData.uGlow;
  shader.uniforms.uRim = this.userData.uRim;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aMat;\nvarying vec4 vMat;\nvarying vec2 vTileUv;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMat = aMat; vTileUv = uv;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying vec4 vMat; varying vec2 vTileUv; uniform float uGlow; uniform vec4 uRim;
vec2 aUV, aDx, aDy, aCtr; float aFade;
void atlasSetup(vec2 t) {
  float cell = floor(vMat.x + 0.5);
  vec2 c = vec2(mod(cell, 4.0), floor(cell * 0.25 + 0.01));
  aUV = (c + 0.03125 + fract(t) * 0.9375) * 0.25;
  aCtr = (c + 0.5) * 0.25;
  aDx = dFdx(t) * 0.234375; aDy = dFdy(t) * 0.234375;
  float m = max(dot(aDx, aDx), dot(aDy, aDy));
  float lod = 0.5 * log2(max(m, 1e-14)) + 10.0;
  aFade = smoothstep(1.8, 3.4, lod);
  const float lim = 0.0078125 * 0.0078125;
  if (m > lim) { float k = sqrt(lim / m); aDx *= k; aDy *= k; }
}
vec4 atlasTex(sampler2D s) { return mix(textureGrad(s, aUV, aDx, aDy), textureLod(s, aCtr, 6.0), aFade); }`)
    .replace('#include <map_fragment>', `atlasSetup(vTileUv); vec4 atlasAlb = atlasTex(map); diffuseColor.rgb *= atlasAlb.rgb * ${ALB_COMP.toFixed(4)};`)
    .replace('#include <roughnessmap_fragment>', 'vec4 atlasNrm = atlasTex(normalMap); float roughnessFactor = clamp(roughness * vMat.y * atlasNrm.a * 2.0, 0.04, 1.0);')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = clamp(metalness * vMat.z * atlasAlb.a * 2.0, 0.0, 1.0);')
    .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('vNormalMapUv', 'vTileUv'))
    .replace('#include <normal_fragment_maps>', 'vec3 mapN = atlasNrm.xyz * 2.0 - 1.0; mapN.xy *= normalScale; normal = normalize( tbn * mapN );')
    .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vColor.rgb * vMat.w * uGlow;\nif (uRim.a > 0.0) { float rimF = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0); totalEmissiveRadiance += uRim.rgb * uRim.a * (0.04 + rimF * rimF * rimF); }');
}
// One material for everything. Per-instance copies are cheap (same shader program).
export function atlasMaterial(opts = {}) {
  const A = getAtlas();
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, map: A.map, normalMap: A.normal, roughness: 1, metalness: 1,
    normalScale: new THREE.Vector2(0.8, 0.8), ...opts,
  });
  m.userData.uGlow = { value: 1 };
  m.userData.uRim = { value: new THREE.Vector4(0, 0, 0, 0) };
  m.userData.base = { color: m.color.clone(), emissive: m.emissive.clone(), roughness: m.roughness };
  m.onBeforeCompile = atlasPatch;
  m.customProgramCacheKey = () => 'atlasv2';
  return m;
}

// ------------------------------------------------------------------ primitives (uv in metres)
const _v = new THREE.Vector3(), _n = new THREE.Vector3();
function geom(pos, nrm, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (!nrm) g.computeVertexNormals();
  return g;
}

// Lathe around Y. prof = [[r, y], ...] from bottom to top. Analytic smooth normals.
export function lathe(prof, seg = 16, { phi0 = 0, phiLen = TAU } = {}) {
  const rows = prof.length, pos = [], nrm = [], uv = [], idx = [];
  const L = [0];
  let rMax = 0.001;
  for (let i = 1; i < rows; i++) L[i] = L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
  for (const p of prof) rMax = Math.max(rMax, p[0]);
  for (let i = 0; i < rows; i++) {
    const [r, y] = prof[i], a = prof[Math.max(i - 1, 0)], b = prof[Math.min(i + 1, rows - 1)];
    let nr = b[1] - a[1], ny = -(b[0] - a[0]);
    const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
    for (let j = 0; j <= seg; j++) {
      const ph = phi0 + (j / seg) * phiLen, s = Math.sin(ph), c = Math.cos(ph);
      pos.push(r * s, y, r * c); nrm.push(nr * s, ny, nr * c); uv.push((j / seg) * phiLen * rMax, L[i]);
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  return geom(pos, nrm, uv, idx);
}

// Capsule-like limb hanging DOWN from its joint at y=0 to y=-L. rf(t) gives radius, t=0 top .. 1 bottom.
export function limb(L, rf, seg = 12, rows = 8, capRows = 4) {
  if (typeof rf === 'number') { const r = rf; rf = () => r; }
  const prof = [];
  const r1 = rf(1), r0 = rf(0);
  for (let i = 0; i <= capRows; i++) { const a = -Math.PI / 2 + (i / capRows) * Math.PI / 2; prof.push([r1 * Math.cos(a) + (i === 0 ? 0 : 0), -L + r1 * Math.sin(a)]); }
  for (let i = rows - 1; i >= 1; i--) { const t = i / rows; prof.push([rf(t), -L * t]); }
  for (let i = 0; i <= capRows; i++) { const a = (i / capRows) * Math.PI / 2; prof.push([r0 * Math.cos(a), r0 * Math.sin(a)]); }
  prof[0][0] = 0; prof[prof.length - 1][0] = 0;
  return lathe(prof, seg);
}
// Open tapered tube (no caps) bottom->top
export function cylinder(r0, r1, h, seg = 12, rows = 1) {
  const prof = [];
  for (let i = 0; i <= rows; i++) { const t = i / rows; prof.push([lerp(r0, r1, t), h * t]); }
  return lathe(prof, seg);
}
// Closed cone/frustum with caps, base at y=0.
export function cone(r0, r1, h, seg = 12) {
  const prof = [[0, 0], [r0 * 0.98, 0], [r0, 0.002], [r1, h - 0.002]];
  if (r1 > 0.0005) prof.push([r1 * 0.98, h], [0, h]); else prof[prof.length - 1] = [0, h];
  return lathe(prof, seg);
}
export function sphere(r, seg = 16, rows = 12) {
  const prof = [];
  for (let i = 0; i <= rows; i++) { const a = -Math.PI / 2 + (i / rows) * Math.PI; prof.push([r * Math.cos(a), r * Math.sin(a)]); }
  prof[0][0] = 0; prof[rows][0] = 0;
  return lathe(prof, seg);
}
export function torus(R, r, seg = 20, tseg = 8, arc = TAU) {
  const g = new THREE.TorusGeometry(R, r, tseg, seg, arc);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * arc * R, uv.getY(i) * TAU * r);
  return g;
}

// Generic parametric surface. fn(u, v, out:Vector3), u around (left->right seen from outside), v top->bottom.
export function param(nu, nv, fn, { wrap = true, lu = 1, lv = 1, flip = false } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nv; i++) for (let j = 0; j <= nu; j++) {
    fn(j / nu, i / nv, _v); pos.push(_v.x, _v.y, _v.z); uv.push((j / nu) * lu, (i / nv) * lv);
  }
  for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
    const a = i * (nu + 1) + j, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = geom(pos, null, uv, idx);
  const n = g.attributes.normal, p = g.attributes.position;
  if (wrap) for (let i = 0; i <= nv; i++) {
    const a = i * (nu + 1), b = a + nu;
    _n.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, _n.x, _n.y, _n.z); n.setXYZ(b, _n.x, _n.y, _n.z);
  }
  for (const row of [0, nv]) { // collapse poles
    const a = row * (nu + 1);
    let same = true;
    for (let j = 1; j <= nu && same; j++) if (Math.abs(p.getX(a + j) - p.getX(a)) + Math.abs(p.getY(a + j) - p.getY(a)) + Math.abs(p.getZ(a + j) - p.getZ(a)) > 1e-6) same = false;
    if (!same) continue;
    _n.set(0, 0, 0);
    for (let j = 0; j <= nu; j++) _n.x += n.getX(a + j), _n.y += n.getY(a + j), _n.z += n.getZ(a + j);
    _n.normalize();
    for (let j = 0; j <= nu; j++) n.setXYZ(a + j, _n.x, _n.y, _n.z);
  }
  return g;
}
const sgnPow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
// Superquadric "blob": e=1 ellipsoid, e<1 boxier, e>1 pinched. Front = +Z.
export function blob(rx, ry, rz, e1 = 1, e2 = 1, nu = 18, nv = 12, deform = null) {
  return param(nu, nv, (u, v, out) => {
    const lon = -Math.PI + u * TAU, lat = Math.PI / 2 - v * Math.PI;
    const ce = sgnPow(Math.cos(lat), e1);
    out.set(rx * ce * sgnPow(Math.sin(lon), e2), ry * sgnPow(Math.sin(lat), e1), rz * ce * sgnPow(Math.cos(lon), e2));
    if (deform) deform(out, u, v);
  }, { lu: Math.PI * (rx + rz), lv: Math.PI * ry });
}
// Rounded box (superquadric with low exponent)
export function rbox(w, h, d, round = 0.25, nu = 16, nv = 10) {
  return blob(w / 2, h / 2, d / 2, round, round, nu, nv);
}

// Tube along points with per-point radius (number, array or fn(t)). Rounded caps.
export function tube(pts, radius, seg = 8, { caps = true, flatten = 1, up = null } = {}) {
  const n = pts.length;
  const rf = typeof radius === 'function' ? radius : Array.isArray(radius) ? (t, i) => radius[i] : () => radius;
  const T = [], Nn = [], Bn = [];
  for (let i = 0; i < n; i++) T[i] = pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
  const ref = up ? up.clone() : (Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
  Nn[0] = ref.sub(T[0].clone().multiplyScalar(ref.dot(T[0]))).normalize();
  for (let i = 1; i < n; i++) {
    const axis = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
    const s = axis.length();
    Nn[i] = Nn[i - 1].clone();
    if (s > 1e-6) Nn[i].applyAxisAngle(axis.normalize(), Math.atan2(s, T[i - 1].dot(T[i])));
  }
  for (let i = 0; i < n; i++) Bn[i] = new THREE.Vector3().crossVectors(T[i], Nn[i]);
  const pos = [], nrm = [], uv = [], idx = [];
  let len = 0, rAvg = 0;
  const radii = [];
  for (let i = 0; i < n; i++) { radii[i] = rf(i / (n - 1), i); rAvg += radii[i] / n; }
  for (let i = 0; i < n; i++) {
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
      _n.copy(Nn[i]).multiplyScalar(c * flatten).addScaledVector(Bn[i], s);
      _v.copy(pts[i]).addScaledVector(_n, radii[i]);
      pos.push(_v.x, _v.y, _v.z);
      _n.copy(Nn[i]).multiplyScalar(c / flatten).addScaledVector(Bn[i], s).normalize();
      nrm.push(_n.x, _n.y, _n.z); uv.push((j / seg) * TAU * rAvg, len);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  if (caps) {
    for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
      const c = pos.length / 3;
      _v.copy(pts[i]).addScaledVector(T[i], sgn * radii[i] * 0.7);
      pos.push(_v.x, _v.y, _v.z); nrm.push(T[i].x * sgn, T[i].y * sgn, T[i].z * sgn); uv.push(0, len * (sgn > 0 ? 1 : 0));
      const r0 = i * (seg + 1);
      for (let j = 0; j < seg; j++) sgn > 0 ? idx.push(r0 + j, r0 + j + 1, c) : idx.push(r0 + j + 1, r0 + j, c);
    }
  }
  return geom(pos, nrm, uv, idx);
}

// Loft between rings of points (same count each, closed rings). Flat shading for crisp bevels.
export function loft(rings, { flat = true, capStart = false, capEnd = false } = {}) {
  const pos = [], uv = [];
  const m = rings[0].length;
  let vlen = 0;
  const tri = (a, b, c, ua, ub, uc) => { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); uv.push(...ua, ...ub, ...uc); };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const dv = A[0].distanceTo(B[0]);
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m, u0 = j * 0.02, u1 = (j + 1) * 0.02;
      tri(A[j], A[j2], B[j2], [u0, vlen], [u1, vlen], [u1, vlen + dv]);
      tri(A[j], B[j2], B[j], [u0, vlen], [u1, vlen + dv], [u0, vlen + dv]);
    }
    vlen += dv;
  }
  const cap = (R, rev) => {
    const c = new THREE.Vector3(); R.forEach((p) => c.add(p)); c.multiplyScalar(1 / R.length);
    for (let j = 0; j < m; j++) { const j2 = (j + 1) % m; rev ? tri(c, R[j2], R[j], [0, 0], [0.02, 0], [0, 0.02]) : tri(c, R[j], R[j2], [0, 0], [0.02, 0], [0, 0.02]); }
  };
  if (capStart) cap(rings[0], false);
  if (capEnd) cap(rings[rings.length - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (!flat) { /* non-indexed but smooth not needed */ }
  return g;
}
export function toFlat(g) { const f = g.index ? g.toNonIndexed() : g; f.computeVertexNormals(); return f; }

// Displace vertices along normal with 3D noise (rocks, bark, lumps)
export function bumpy(g, amp, freq, seed = 0, oct = 3) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(n, i);
    const d = fbm3(_v.x * freq + seed, _v.y * freq + seed * 1.7, _v.z * freq - seed, oct) * amp;
    p.setXYZ(i, _v.x + _n.x * d, _v.y + _n.y * d, _v.z + _n.z * d);
  }
  g.computeVertexNormals();
  return g;
}
export function deform(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v, i); p.setXYZ(i, _v.x, _v.y, _v.z); }
  g.computeVertexNormals();
  return g;
}
// Double sided sheet: front + back copy with flipped winding, offset by thickness
export function twoSided(g, thick = 0.006) {
  const back = g.clone();
  const p = back.attributes.position, n = back.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) - n.getX(i) * thick, p.getY(i) - n.getY(i) * thick, p.getZ(i) - n.getZ(i) * thick);
    n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  if (back.index) {
    const ix = back.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  } else {
    for (const a of Object.values(back.attributes)) {
      const arr = a.array, k = a.itemSize;
      for (let i = 0; i < a.count; i += 3) for (let c = 0; c < k; c++) { const t = arr[(i + 1) * k + c]; arr[(i + 1) * k + c] = arr[(i + 2) * k + c]; arr[(i + 2) * k + c] = t; }
    }
  }
  return [g, back];
}

// ------------------------------------------------------------------ builder
const WHITE = new THREE.Color(1, 1, 1);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n3 = new THREE.Matrix3();
const _c = new THREE.Color();

export class Builder {
  constructor({ texScale = 1, seed = 1, skyAO = 0.16 } = {}) {
    this.texScale = texScale; this.bones = []; this.byName = {}; this.slots = {}; this.r = rng(seed); this.skyAO = skyAO;
  }
  bone(name, parent, x, y, z) {
    const pi = parent == null ? -1 : this.idx(parent);
    this.byName[name] = this.bones.length;
    this.bones.push({ name, parent: pi, world: new THREE.Vector3(x, y, z) });
    return this.bones.length - 1;
  }
  has(name) { return this.byName[name] !== undefined; }
  idx(name) { const i = this.byName[name]; if (i === undefined) throw new Error('no bone ' + name); return i; }
  bpos(name) { return this.bones[this.idx(name)].world.clone(); }
  // piecewise blend between bones along an axis: stops = [[bone, value], ...] ascending
  ladder(axis, stops) {
    const S = stops.map(([b, v]) => [this.idx(b), v]);
    return (p) => {
      const x = p[axis];
      if (x <= S[0][1]) return [S[0][0], 1];
      for (let i = 0; i < S.length - 1; i++) if (x <= S[i + 1][1]) {
        const t = smooth((x - S[i][1]) / (S[i + 1][1] - S[i][1]));
        return [S[i][0], 1 - t, S[i + 1][0], t];
      }
      return [S[S.length - 1][0], 1];
    };
  }
  add(g, o = {}) {
    const slotName = o.slot || 'main';
    const S = this.slots[slotName] || (this.slots[slotName] = { pos: [], nrm: [], uv: [], col: [], mat: [], si: [], sw: [], idx: [] });
    if (o.m) _m4.copy(o.m);
    else {
      const p = o.pos || [0, 0, 0], r = o.rot || [0, 0, 0], sc = o.scl ?? 1;
      _p.set(p[0], p[1], p[2]); _e.set(r[0], r[1], r[2], o.order || 'XYZ'); _q.setFromEuler(_e);
      if (typeof sc === 'number') _s.set(sc, sc, sc); else _s.set(sc[0], sc[1], sc[2]);
      _m4.compose(_p, _q, _s);
    }
    _n3.getNormalMatrix(_m4);
    const P = g.attributes.position, Nm = g.attributes.normal, U = g.attributes.uv;
    const base = S.pos.length / 3;
    const cell = typeof o.cell === 'string' ? CELL[o.cell] : (o.cell ?? CELL.plain);
    const rough = o.rough ?? CELL_ROUGH[cell], metal = o.metal ?? 0, glow = o.glow ?? 0;
    const tile = (o.tile ?? CELL_TILE[cell]) * this.texScale;
    const baseCol = o.color !== undefined ? col(o.color) : WHITE;
    const bi = o.bone !== undefined ? this.idx(o.bone) : 0;
    const wfn = o.w || null;
    const uo = this.r() * 7, vo = this.r() * 7;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m4);
      _n.fromBufferAttribute(Nm, i).applyMatrix3(_n3).normalize();
      S.pos.push(_v.x, _v.y, _v.z); S.nrm.push(_n.x, _n.y, _n.z);
      S.uv.push(U ? U.getX(i) / tile + uo : 0, U ? U.getY(i) / tile + vo : 0);
      const c = o.colorFn ? o.colorFn(_v, _n, _c.copy(baseCol)) : baseCol;
      // baked sky light: undersides a little darker (cheap ambient occlusion feel); skipped for glowing parts
      const ao = glow > 0 || o.glowFn || o.noAO ? 1 : 1 - this.skyAO * (0.5 - 0.5 * _n.y);
      S.col.push(c.r * ao, c.g * ao, c.b * ao);
      S.mat.push(cell, rough, metal, o.glowFn ? o.glowFn(_v) : glow);
      if (wfn) {
        const w = wfn(_v);
        let tot = 0; for (let k = 1; k < w.length; k += 2) tot += w[k];
        for (let k = 0; k < 4; k++) { S.si.push(k * 2 < w.length ? w[k * 2] : 0); S.sw.push(k * 2 < w.length ? w[k * 2 + 1] / tot : 0); }
      } else { S.si.push(bi, 0, 0, 0); S.sw.push(1, 0, 0, 0); }
    }
    if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) S.idx.push(base + ix[i]); }
    else for (let i = 0; i < P.count; i++) S.idx.push(base + i);
    return this;
  }
  // Mirror helper: calls fn(side) for side = +1 (left, +X) and -1 (right, -X)
  both(fn) { fn(1, 'L'); fn(-1, 'R'); }
  build() {
    const bones = this.bones.map((b) => {
      const local = b.world.clone();
      if (b.parent >= 0) local.sub(this.bones[b.parent].world);
      return { name: b.name, parent: b.parent, local, world: b.world.clone() };
    });
    const inverses = bones.map((b) => new THREE.Matrix4().makeTranslation(-b.world.x, -b.world.y, -b.world.z));
    const geos = {};
    const box = new THREE.Box3();
    for (const [k, S] of Object.entries(this.slots)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(S.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(S.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(S.col, 3));
      g.setAttribute('aMat', new THREE.Float32BufferAttribute(S.mat, 4));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(S.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(S.sw, 4));
      g.setIndex(S.idx);
      g.computeBoundingBox(); g.computeBoundingSphere();
      box.union(g.boundingBox);
      geos[k] = g;
    }
    const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
    return { bones, inverses, geos, sphere, box, tris: Object.values(geos).reduce((a, g) => a + g.index.count / 3, 0) };
  }
}
// Static (non-skinned) geometry built with the same attribute layout (swords, props).
export function staticGeometry(fn, opts) {
  const B = new Builder(opts);
  B.bone('root', null, 0, 0, 0);
  fn(B);
  const t = B.build();
  for (const g of Object.values(t.geos)) { g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); }
  return t.geos;
}

// Build a fresh skeleton + skinned meshes from a cached template. Geometry is shared.
export function instantiate(tpl, mats, { shadows = true, sphereScale = 1.4 } = {}) {
  const bones = tpl.bones.map((d) => { const b = new THREE.Bone(); b.name = d.name; b.position.copy(d.local); return b; });
  const holder = new THREE.Group();
  tpl.bones.forEach((d, i) => { if (d.parent >= 0) bones[d.parent].add(bones[i]); else holder.add(bones[i]); });
  const skeleton = new THREE.Skeleton(bones, tpl.inverses.map((m) => m.clone()));
  const meshes = {};
  const sph = tpl.sphere.clone(); sph.radius *= sphereScale;
  for (const [k, g] of Object.entries(tpl.geos)) {
    const mat = mats[k] || mats.main;
    const m = new THREE.SkinnedMesh(g, mat);
    m.bind(skeleton, new THREE.Matrix4());
    m.castShadow = shadows && !mat.transparent; m.receiveShadow = true;
    m.boundingSphere = sph.clone(); m.boundingBox = tpl.box.clone().expandByScalar(sph.radius * 0.3);
    m.name = k;
    holder.add(m);
    meshes[k] = m;
  }
  const byName = {}; bones.forEach((b) => (byName[b.name] = b));
  return { holder, bones, bone: byName, meshes, skeleton };
}

// ------------------------------------------------------------------ poses & animator
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _eu = new THREE.Euler();
export class Pose {
  constructor(n) { this.n = n; this.q = new Float32Array(n * 4); this.p = new Float32Array(n * 3); this.s = new Float32Array(n * 3); this.reset(); }
  reset() {
    this.q.fill(0); this.p.fill(0); this.s.fill(1);
    for (let i = 0; i < this.n; i++) this.q[i * 4 + 3] = 1;
    return this;
  }
  copy(o) { this.q.set(o.q); this.p.set(o.p); this.s.set(o.s); return this; }
  // set local rotation from euler
  e(i, x = 0, y = 0, z = 0, ord = 'XYZ') {
    if (i < 0) return this;
    _eu.set(x, y, z, ord); _qa.setFromEuler(_eu);
    const q = this.q, k = i * 4; q[k] = _qa.x; q[k + 1] = _qa.y; q[k + 2] = _qa.z; q[k + 3] = _qa.w;
    return this;
  }
  // multiply current rotation by an extra local euler (additive)
  r(i, x = 0, y = 0, z = 0, ord = 'XYZ') {
    if (i < 0) return this;
    _eu.set(x, y, z, ord); _qb.setFromEuler(_eu);
    _qa.fromArray(this.q, i * 4).multiply(_qb).toArray(this.q, i * 4);
    return this;
  }
  // pre-multiply (rotate in parent space)
  pr(i, x = 0, y = 0, z = 0, ord = 'XYZ') {
    if (i < 0) return this;
    _eu.set(x, y, z, ord); _qb.setFromEuler(_eu);
    _qa.fromArray(this.q, i * 4).premultiply(_qb).toArray(this.q, i * 4);
    return this;
  }
  off(i, x = 0, y = 0, z = 0) { if (i < 0) return this; const k = i * 3; this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; return this; }
  addOff(i, x = 0, y = 0, z = 0) { if (i < 0) return this; const k = i * 3; this.p[k] += x; this.p[k + 1] += y; this.p[k + 2] += z; return this; }
  sc(i, x = 1, y = x, z = x) { if (i < 0) return this; const k = i * 3; this.s[k] = x; this.s[k + 1] = y; this.s[k + 2] = z; return this; }
  blend(a, b, t) {
    const n = this.n, qa = a.q, qb = b.q, q = this.q;
    if (t <= 0) return a === this ? this : this.copy(a);
    if (t >= 1) return b === this ? this : this.copy(b);
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      const d = qa[k] * qb[k] + qa[k + 1] * qb[k + 1] + qa[k + 2] * qb[k + 2] + qa[k + 3] * qb[k + 3];
      const sb = d < 0 ? -t : t, sa = 1 - t;
      const x = qa[k] * sa + qb[k] * sb, y = qa[k + 1] * sa + qb[k + 1] * sb, z = qa[k + 2] * sa + qb[k + 2] * sb, w = qa[k + 3] * sa + qb[k + 3] * sb;
      const l = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
      q[k] = x * l; q[k + 1] = y * l; q[k + 2] = z * l; q[k + 3] = w * l;
    }
    for (let i = 0; i < n * 3; i++) { this.p[i] = a.p[i] + (b.p[i] - a.p[i]) * t; this.s[i] = a.s[i] + (b.s[i] - a.s[i]) * t; }
    return this;
  }
}

// Base pose functions keyed by name, cross-faded; keyframed actions layered on top.
// action = { dur, keys: [[time, fn(P, ctx), ease?], ...], fadeIn, fadeOut, layer }
export class Animator {
  constructor(bones, rest) {
    this.bones = bones; this.n = bones.length;
    this.rest = rest; // Vector3[] local rest positions
    this.out = new Pose(this.n); this.A = new Pose(this.n); this.B = new Pose(this.n); this.K1 = new Pose(this.n); this.K2 = new Pose(this.n);
    this.poses = {}; this.cur = null; this.prev = null; this.ct = 0; this.pt = 0; this.fade = 1; this.fadeDur = 0.2;
    this.actions = []; this.post = null; this.speed = 1; this.frozen = false;
  }
  setPose(name, fade = 0.22) {
    if (name === this.cur || !this.poses[name]) return;
    this.prev = this.cur; this.pt = this.ct; this.cur = name; this.ct = 0; this.fade = this.prev ? 0 : 1; this.fadeDur = fade;
  }
  play(act) {
    act.t = 0;
    this.actions = this.actions.filter((a) => a.layer !== act.layer);
    this.actions.push(act);
    return act;
  }
  clearActions() { this.actions.length = 0; }
  update(dt, ctx) {
    dt *= this.speed;
    this.ct += dt; this.pt += dt;
    const out = this.out;
    out.reset(); this.poses[this.cur](out, this.ct, ctx);
    if (this.fade < 1 && this.prev) {
      this.fade = Math.min(1, this.fade + dt / this.fadeDur);
      this.B.reset(); this.poses[this.prev](this.B, this.pt, ctx);
      out.blend(this.B, out, smooth(this.fade));
    }
    for (let i = 0; i < this.actions.length; i++) {
      const a = this.actions[i];
      a.t += dt;
      if (a.t >= a.dur) { this.actions.splice(i--, 1); continue; }
      const keys = a.keys;
      let k = 0;
      while (k < keys.length - 2 && a.t >= keys[k + 1][0]) k++;
      const k0 = keys[k], k1 = keys[Math.min(k + 1, keys.length - 1)];
      let u = k1[0] > k0[0] ? clamp((a.t - k0[0]) / (k1[0] - k0[0]), 0, 1) : 1;
      const ez = k1[2] || 'io';
      u = ez === 'l' ? u : ez === 'i' ? u * u : ez === 'o' ? 1 - (1 - u) * (1 - u) : smooth(u);
      this.K1.copy(out); k0[1](this.K1, ctx, a);
      this.K2.copy(out); k1[1](this.K2, ctx, a);
      this.A.blend(this.K1, this.K2, u);
      const fi = a.fadeIn ?? 0.06, fo = a.fadeOut ?? 0.18;
      const w = Math.min(fi > 0 ? a.t / fi : 1, fo > 0 ? (a.dur - a.t) / fo : 1, 1) * (a.weight ?? 1);
      out.blend(out, this.A, smooth(w));
    }
    if (this.post) this.post(out, dt, ctx);
    this.apply();
  }
  apply() {
    const out = this.out;
    for (let i = 0; i < this.n; i++) {
      const b = this.bones[i], r = this.rest[i];
      b.quaternion.fromArray(out.q, i * 4);
      b.position.set(r.x + out.p[i * 3], r.y + out.p[i * 3 + 1], r.z + out.p[i * 3 + 2]);
      b.scale.set(out.s[i * 3], out.s[i * 3 + 1], out.s[i * 3 + 2]);
    }
  }
}

// helper: index map for bones
export function jointMap(tpl) { const J = {}; tpl.bones.forEach((b, i) => (J[b.name] = i)); return new Proxy(J, { get: (t, k) => (k in t ? t[k] : -1) }); }

// Simple damped spring for secondary motion
export class Spring {
  constructor(k = 60, d = 9) { this.x = 0; this.v = 0; this.k = k; this.d = d; }
  step(target, dt) {
    dt = Math.min(dt, 0.05);
    const a = (target - this.x) * this.k - this.v * this.d;
    this.v += a * dt; this.x += this.v * dt;
    return this.x;
  }
}

// ------------------------------------------------------------------ status effects shared by mobs/bosses
const FROZEN_COL = new THREE.Color('#a8dcff'), FROZEN_EM = new THREE.Color('#1c4a66');
// Status looks. Tints use a soft rim glow (+ a little emissive) so a friendly/burn/poison tint reads as an aura
// rather than flat paint. `rim` = default rim (e.g. summons keep a faint friendly outline).
export function applyLook(mats, { frozen = false, tint = null, flash = 0, glow = 1, rim = null } = {}) {
  for (const m of mats) {
    if (!m || !m.userData.base) continue;
    const b = m.userData.base;
    m.color.copy(frozen ? FROZEN_COL : b.color);
    m.emissive.copy(b.emissive);
    const R = m.userData.uRim ? m.userData.uRim.value : null;
    if (R) R.set(0, 0, 0, 0);
    if (rim && R) { _tmpC.set(rim.color); R.set(_tmpC.r, _tmpC.g, _tmpC.b, rim.strength ?? 0.8); }
    if (frozen) { m.emissive.copy(FROZEN_EM); if (R) R.set(0.55, 0.85, 1, 0.9); }
    if (tint) { _tmpC.set(tint); m.emissive.lerp(_tmpC, 0.1); if (R) R.set(_tmpC.r, _tmpC.g, _tmpC.b, 1.2); }
    if (flash > 0) { const f = Math.min(1, flash); m.emissive.lerp(_tmpC.setRGB(1, 0.3, 0.25), f * 0.45); if (R) R.set(lerp(R.x, 1, f), lerp(R.y, 0.45, f), lerp(R.z, 0.4, f), Math.max(R.w, 2 * f)); }
    m.roughness = frozen ? b.roughness * 0.5 : b.roughness;
    if (m.userData.uGlow) m.userData.uGlow.value = glow;
  }
}

// colour analysis helpers (for palettes that come from data)
const _hsl = {};
export function lum(c) { const k = col(c); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; }
export function hslOf(c) { col(c).getHSL(_hsl); return { h: _hsl.h, s: _hsl.s, l: _hsl.l }; }
export function isLight(c) { return lum(c) > 0.3; }
// darker, more saturated version of a colour - gives light palettes some definition
export function deepen(c, f = 0.55) { const k = col(c).clone(); k.getHSL(_hsl); return k.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.25 + 0.1), _hsl.l * f); }
// soft ambient-occlusion style darkening around points: [{ c: Vector3, r, k }]
export function aoShade(points) {
  return (p, n, cc) => {
    let d = 0;
    for (const o of points) { const q = p.distanceToSquared(o.c); d += o.k * Math.exp(-q / (o.r * o.r)); }
    return cc.multiplyScalar(1 - Math.min(0.6, d));
  };
}
