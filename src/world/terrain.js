// Terrain: cached height grids (near: fine, far: coarse), meshes, and the splat material.
import * as THREE from 'three';
import { smoothstep } from './noise.js';
import { bakeTexture } from './bake.js';

export class Heightfield {
  constructor(half, step) {
    this.half = half; this.step = step;
    this.n = Math.round((half * 2) / step) + 1;
    this.h = new Float32Array(this.n * this.n);
  }
  fill(fn) {
    const { n, half, step, h } = this;
    for (let j = 0; j < n; j++) {
      const z = -half + j * step;
      for (let i = 0; i < n; i++) h[j * n + i] = fn(-half + i * step, z);
    }
  }
  inside(x, z) { return x > -this.half && x < this.half && z > -this.half && z < this.half; }
  sample(x, z) {
    const { n, half, step, h } = this;
    let fx = (x + half) / step, fz = (z + half) / step;
    if (fx < 0) fx = 0; else if (fx > n - 1.001) fx = n - 1.001;
    if (fz < 0) fz = 0; else if (fz > n - 1.001) fz = n - 1.001;
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * n + i;
    const a = h[k], b = h[k + 1], c = h[k + n], d = h[k + n + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
}

// Build an indexed grid mesh geometry from a heightfield.
export function gridGeometry(hf, { stride = 1, splat = null, sink = null } = {}) {
  const N = Math.floor((hf.n - 1) / stride) + 1;
  const pos = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3);
  const spl = new Uint8Array(N * N * 4);
  const step = hf.step * stride, half = hf.half;
  const H = hf.h, n = hf.n;
  const hAt = (i, j) => H[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const gi = i * stride, gj = j * stride, v = j * N + i;
      const x = -half + gi * hf.step, z = -half + gj * hf.step;
      let y = H[gj * n + gi];
      if (sink) y -= sink(x, z);
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const dx = hAt(gi + stride, gj) - hAt(gi - stride, gj), dz = hAt(gi, gj + stride) - hAt(gi, gj - stride);
      const nx = -dx, ny = 2 * step, nz = -dz, l = Math.hypot(nx, ny, nz);
      nrm[v * 3] = nx / l; nrm[v * 3 + 1] = ny / l; nrm[v * 3 + 2] = nz / l;
      if (splat) {
        const s = splat[gj * n + gi];
        spl[v * 4] = s & 255; spl[v * 4 + 1] = (s >>> 8) & 255; spl[v * 4 + 2] = (s >>> 16) & 255; spl[v * 4 + 3] = (s >>> 24) & 255;
      }
    }
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let k = 0;
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    // alternate diagonal to reduce directional artefacts
    if ((i + j) & 1) { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
    else { idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// Float height texture of the near grid (for grass placement and water depth in shaders).
export function heightTexture(hf) {
  const t = new THREE.DataTexture(hf.h, hf.n, hf.n, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export const GLSL_HEIGHT = /* glsl */`
uniform sampler2D tHeight; uniform vec3 uHField; // x half, y step, z n
float terrainH(vec2 p){
  vec2 f = (p + uHField.x) / uHField.y; f = clamp(f, vec2(0.0), vec2(uHField.z - 1.001));
  vec2 i = floor(f), t = f - i;
  float inv = 1.0 / uHField.z;
  vec2 c = (i + 0.5) * inv;
  float a = texture2D(tHeight, c).r, b = texture2D(tHeight, c + vec2(inv, 0.0)).r;
  float d = texture2D(tHeight, c + vec2(0.0, inv)).r, e = texture2D(tHeight, c + vec2(inv)).r;
  return mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
}`;

// ------------------------------------------------------------------ material
export function terrainMaterial(renderer, P, quality) {
  const T = {
    grass: bakeTexture(renderer, 'grass'), dirt: bakeTexture(renderer, 'dirt'), rock: bakeTexture(renderer, 'rock'),
    sand: bakeTexture(renderer, 'sand'), macro: bakeTexture(renderer, 'macro'),
  };
  const col = (c) => new THREE.Color(c);
  const uniforms = {
    tGrass: { value: T.grass }, tDirt: { value: T.dirt }, tRock: { value: T.rock }, tSand: { value: T.sand }, tMacro: { value: T.macro },
    cGrass: { value: col(P.grass) }, cGrass2: { value: col(P.grass2) }, cDirt: { value: col(P.dirt) }, cRock: { value: col(P.rock) },
    cSand: { value: col(P.sand) }, cSnow: { value: col(P.snow || '#eef3f8') }, cGlow: { value: col(P.glow || '#ff5a10') },
    cRock2: { value: col(P.rock2 || P.rock) },
    uT0: { value: new THREE.Vector4(P.waterLevel ?? -999, P.beach ?? 1.5, P.snowLine ?? 9999, P.rockSlope ?? 0.42) },
    uT1: { value: new THREE.Vector4(P.strata || 0, P.glowAmt || 0, P.softGround || 0, P.dirtPatches ?? 0.4) },
    uT2: { value: new THREE.Vector4(P.grassTile || 3.2, P.half || 400, P.sandAll || 0, P.dry || 0) },
    tAux: { value: P.auxTex || null },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  mat.userData.uniforms = uniforms;
  const gm = Math.round(P.softGround || 0);
  mat.customProgramCacheKey = () => 'terrain_' + quality + gm;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.defines = Object.assign(sh.defines || {}, { GROUND_MODE: gm }, quality === 'high' ? { TERRAIN_HQ: 1 } : {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSplat; varying vec4 vSplat; varying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); vSplat = aSplat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tGrass, tDirt, tRock, tSand, tMacro, tAux;
uniform vec3 cGrass, cGrass2, cDirt, cRock, cRock2, cSand, cSnow, cGlow;
uniform vec4 uT0, uT1, uT2;
varying vec4 vSplat; varying vec3 vWPos; varying vec3 vWN;`)
      .replace('#include <map_fragment>', `
float tDist = length(vWPos - cameraPosition);
vec3 tN = normalize(vWN);
float tSlope = 1.0 - tN.y;
vec4 mac = texture2D(tMacro, vWPos.xz * (1.0 / 520.0));
vec4 mac2 = texture2D(tMacro, vWPos.xz * (1.0 / 110.0) + 0.31);
float tFarK = smoothstep(15.0, 90.0, tDist);
float pathM = texture2D(tAux, (vWPos.xz + uT2.y) / (2.0 * uT2.y)).a;
vec2 uv1 = vWPos.xz / uT2.x, uv2 = vWPos.xz / (uT2.x * 4.37) + 0.17;
float k2 = 0.3 + 0.45 * tFarK;
#if GROUND_MODE == 0
vec4 tg = mix(texture2D(tGrass, uv1), texture2D(tGrass, uv2), k2);
#elif GROUND_MODE == 1
vec4 tg = mix(texture2D(tSand, uv1 * 0.8), texture2D(tSand, uv2 * 0.8), k2);
#else
vec4 tg = mix(texture2D(tDirt, uv1 * 0.9), texture2D(tDirt, uv2), k2);
#endif
vec4 ts = texture2D(tSand, uv1 * 0.8);
vec4 td = texture2D(tDirt, uv1 * 0.9);
vec3 bw = pow(abs(tN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
#ifdef TERRAIN_HQ
vec4 rX = texture2D(tRock, vWPos.zy / 7.0), rY = texture2D(tRock, vWPos.xz / 7.0), rZ = texture2D(tRock, vWPos.xy / 7.0);
vec4 tr = rX * bw.x + rY * bw.y + rZ * bw.z;
#else
vec4 rY = texture2D(tRock, vWPos.xz / 7.0); vec4 tr = rY;
#endif
float ht = vWPos.y;
float nA = mac.r, nB = mac2.g;
float rockW = smoothstep(uT0.w - 0.07, uT0.w + 0.07, tSlope + (nA - 0.5) * 0.22 + (nB - 0.5) * 0.12);
float sandW = max(1.0 - smoothstep(uT0.x + uT0.y * 0.4, uT0.x + uT0.y + (nA - 0.5) * 1.6, ht), uT2.z);
float dirtW = clamp(pathM * 1.3 + smoothstep(0.6, 0.82, mac2.a * 0.7 + nA * 0.5) * uT1.w, 0.0, 1.0);
vec4 wv = vec4((1.0 - rockW) * (1.0 - sandW) * (1.0 - dirtW), (1.0 - rockW) * (1.0 - sandW) * dirtW, rockW, (1.0 - rockW) * sandW);
vec4 hv = vec4(tg.b, td.b, tr.b, ts.b);
vec4 bl = wv + hv * 0.45 * step(0.002, wv);
float bm = max(max(bl.x, bl.y), max(bl.z, bl.w)) - 0.22;
vec4 tw = max(bl - bm, 0.0); tw /= (tw.x + tw.y + tw.z + tw.w + 1e-4);
float snowW = smoothstep(uT0.z - 5.0, uT0.z + 5.0, ht + (nA - 0.5) * 24.0) * (1.0 - tw.z * 0.75);
vec3 gC = mix(cGrass, cGrass2, smoothstep(0.3, 0.7, mac.g + (mac2.r - 0.5) * 0.7)) * mix(0.48, 1.3, tg.b);
float dryM = smoothstep(0.56, 0.78, mac.b * 0.45 + mac2.r * 0.55 + (ht - uT0.x) * 0.003) * uT2.w;gC = mix(gC, gC * vec3(1.25, 1.07, 0.58), dryM);gC = mix(gC, gC * vec3(0.78, 0.94, 0.86), (1.0 - smoothstep(uT0.x + 0.5, uT0.x + 7.0, ht)) * 0.35 * step(0.01, uT2.w));
vec3 dC = cDirt * mix(0.6, 1.3, td.b) * (1.0 + pathM * 0.28);
vec3 rC = mix(cRock, cRock2, smoothstep(0.35, 0.65, nB)) * mix(0.5, 1.35, tr.b);
if (uT1.x > 0.0) {
  float sfade = 1.0 - smoothstep(120.0, 420.0, tDist) * 0.7;
  float band = mix(0.5, sin(ht * 0.95 + nA * 4.0) * 0.5 + 0.5, sfade), band2 = sin(ht * 0.33 + nB * 2.0) * 0.5 + 0.5;
  rC *= mix(1.0, mix(0.72, 1.22, band), uT1.x);
  rC = mix(rC, rC * vec3(1.3, 1.12, 0.92), band2 * uT1.x * 0.7);
}
vec3 sC = cSand * mix(0.78, 1.12, ts.b);
vec3 tc = gC * tw.x + dC * tw.y + rC * tw.z + sC * tw.w;
tc = mix(tc, cSnow * mix(0.86, 1.04, ts.b), snowW);
tc *= 0.84 + 0.32 * mac.a;
float wet = clamp(vSplat.g + (1.0 - smoothstep(uT0.x, uT0.x + 0.6, ht)) * 0.7, 0.0, 1.0);
tc *= 1.0 - wet * 0.42;
tc = mix(tc, vec3(0.045, 0.04, 0.036) * (0.7 + tr.b), vSplat.b * 0.85);
diffuseColor.rgb = tc;`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = dot(tw, vec4(0.96, 0.93, 0.84, 0.92));
roughnessFactor = mix(roughnessFactor, 0.62, snowW);
roughnessFactor = mix(roughnessFactor, 0.3, wet);`)
      .replace('#include <normal_fragment_maps>', `
{
  float dk = 1.0 - smoothstep(60.0, 260.0, tDist) * 0.7;
  vec2 ng = tg.rg * 2.0 - 1.0, nd = td.rg * 2.0 - 1.0, ns = ts.rg * 2.0 - 1.0;
  vec2 g2 = (ng * tw.x + nd * tw.y + ns * tw.w) * (1.0 - snowW * 0.5);
  vec3 pert = vec3(g2.x, 0.0, g2.y);
#ifdef TERRAIN_HQ
  vec2 nx = rX.rg * 2.0 - 1.0, ny = rY.rg * 2.0 - 1.0, nz = rZ.rg * 2.0 - 1.0;
  pert += (vec3(0.0, nx.y, nx.x) * bw.x + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z) * tw.z * 1.3;
#else
  vec2 ny = rY.rg * 2.0 - 1.0; pert += vec3(ny.x, 0.0, ny.y) * tw.z;
#endif
  vec3 nW = normalize(tN + pert * dk);
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`)
      .replace('#include <emissivemap_fragment>', `
if (uT1.y > 0.0) {
  float crack = 1.0 - smoothstep(0.2, 0.42, tr.b);
  totalEmissiveRadiance += cGlow * vSplat.a * (crack * 2.2 + 0.08) * uT1.y;
}`);
  };
  return mat;
}

// Near terrain: one vertex buffer (full grid + lowered skirt copies of chunk-border vertices) and a
// dynamic index buffer. Chunks pick a stride by distance to the camera; skirts hide LOD cracks.
export class TerrainLOD {
  constructor(hf, splat, mat, quality) {
    const hi = quality === 'high';
    this.hf = hf; const N = hf.n, cells = N - 1;
    this.CH = hi ? 20 : 10; this.NC = cells / this.CH;
    this.strides = hi ? [1, 2, 4] : [1, 2, 5];
    this.dists = hi ? [75, 175] : [70, 170];
    const base = gridGeometry(hf, { stride: 1, splat });
    const bp = base.attributes.position.array, bn = base.attributes.normal.array, bs = base.attributes.aSplat.array;
    // skirt vertices for every vertex lying on a chunk border line
    const skirtIdx = new Int32Array(N * N).fill(-1);
    let ns = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (i % this.CH === 0 || j % this.CH === 0) skirtIdx[j * N + i] = N * N + ns++;
    const tot = N * N + ns;
    const pos = new Float32Array(tot * 3), nrm = new Float32Array(tot * 3), spl = new Uint8Array(tot * 4);
    pos.set(bp); nrm.set(bn); spl.set(bs);
    const depth = hi ? 3 : 5;
    for (let k = 0; k < N * N; k++) {
      const s = skirtIdx[k]; if (s < 0) continue;
      pos[s * 3] = bp[k * 3]; pos[s * 3 + 1] = bp[k * 3 + 1] - depth; pos[s * 3 + 2] = bp[k * 3 + 2];
      nrm[s * 3] = bn[k * 3]; nrm[s * 3 + 1] = bn[k * 3 + 1]; nrm[s * 3 + 2] = bn[k * 3 + 2];
      for (let c = 0; c < 4; c++) spl[s * 4 + c] = bs[k * 4 + c];
    }
    base.dispose();
    this.skirtIdx = skirtIdx;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aSplat', new THREE.BufferAttribute(spl, 4, true));
    const maxIdx = cells * cells * 6 + this.NC * this.NC * 4 * this.CH * 6;
    this.index = new THREE.BufferAttribute(new Uint32Array(maxIdx), 1);
    this.index.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.index);
    g.computeBoundingSphere();
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.receiveShadow = true; this.mesh.name = 'terrainNear';
    this.lod = new Int8Array(this.NC * this.NC).fill(-1);
    this.last = null;
  }
  update(cam) {
    if (this.last && Math.hypot(cam.x - this.last.x, cam.z - this.last.z) < 8) return;
    this.last = { x: cam.x, z: cam.z };
    const { hf, CH, NC } = this; const cs = CH * hf.step;
    let changed = false;
    for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
      const x0 = -hf.half + ci * cs, z0 = -hf.half + cj * cs;
      const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + cs)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + cs));
      const d = Math.hypot(dx, dz);
      const l = d < this.dists[0] ? 0 : d < this.dists[1] ? 1 : 2;
      if (this.lod[cj * NC + ci] !== l) { this.lod[cj * NC + ci] = l; changed = true; }
    }
    if (changed) this.rebuild();
  }
  rebuild() {
    const { hf, CH, NC, skirtIdx } = this; const N = hf.n; const idx = this.index.array;
    let k = 0;
    for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
      const s = this.strides[this.lod[cj * NC + ci]];
      const i0 = ci * CH, j0 = cj * CH, i1 = i0 + CH, j1 = j0 + CH;
      for (let j = j0; j < j1; j += s) for (let i = i0; i < i1; i += s) {
        const a = j * N + i, b = a + s, c = a + s * N, d = c + s;
        if (((i / s) + (j / s)) & 1) { idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d; }
        else { idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b; }
      }
      // skirts (outward facing): top edge +x, bottom edge -x, left edge -z, right edge +z
      const edge = (pi, pj, qi, qj) => { const p = pj * N + pi, q = qj * N + qi; idx[k++] = p; idx[k++] = q; idx[k++] = skirtIdx[p]; idx[k++] = q; idx[k++] = skirtIdx[q]; idx[k++] = skirtIdx[p]; };
      const l = this.lod[cj * NC + ci], nb = (a, b) => a < 0 || b < 0 || a >= NC || b >= NC || this.lod[b * NC + a] !== l;
      if (nb(ci, cj - 1)) for (let i = i0; i < i1; i += s) edge(i, j0, i + s, j0);
      if (nb(ci, cj + 1)) for (let i = i0; i < i1; i += s) edge(i + s, j1, i, j1);
      if (nb(ci - 1, cj)) for (let j = j0; j < j1; j += s) edge(i0, j + s, i0, j);
      if (nb(ci + 1, cj)) for (let j = j0; j < j1; j += s) edge(i1, j, i1, j + s);
    }
    this.geo.setDrawRange(0, k);
    this.index.clearUpdateRanges(); this.index.addUpdateRange(0, k);
    this.index.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); }
}

// Distant scenery: coarse grid with the inner (near-grid) square left out.
export function farGeometry(far, innerHalf) {
  const g = gridGeometry(far, {});
  const idx = g.index.array, N = far.n, keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    let inside = true;
    for (let v = 0; v < 3; v++) { const vi = idx[t + v], i = vi % N, j = (vi / N) | 0; const x = -far.half + i * far.step, z = -far.half + j * far.step; if (Math.abs(x) > innerHalf + 0.01 || Math.abs(z) > innerHalf + 0.01) { inside = false; break; } }
    if (!inside) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(keep), 1));
  return g;
}

export { smoothstep };
