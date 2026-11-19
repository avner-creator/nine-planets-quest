// Small reusable structure pieces built with the Builder (local frame set with b.at()).
import * as THREE from 'three';
import { RNG } from './noise.js';

export const C = (h) => new THREE.Color(h);
const WOOD = C('#8a6a48'), DARKWOOD = C('#5a4430'), IRON = C('#55575c');

// ---------------------------------------------------------------- fires (all flames of a world in one mesh)
const FLAME_VERT = /* glsl */`
attribute float aSeed; varying vec2 vUv; varying float vSeed;
#include <common>
#include <fog_pars_vertex>
void main(){ vUv = uv; vSeed = aSeed; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const FLAME_FRAG = /* glsl */`
uniform float uTime; uniform sampler2D tNoise; uniform vec3 uCol1, uCol2;
varying vec2 vUv; varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main(){
  vec2 uv = vUv;
  float n = texture2D(tNoise, vec2(uv.x * 0.6 + vSeed, uv.y * 0.5 - uTime * 0.9)).r;
  float n2 = texture2D(tNoise, vec2(uv.x * 1.3 - vSeed, uv.y * 1.1 - uTime * 1.7)).g;
  float w = abs(uv.x - 0.5 + (n - 0.5) * 0.25 * uv.y) * 2.0;
  float body = (1.0 - w * (1.0 + uv.y * 1.6)) * (1.0 - uv.y * 0.9);
  float f = body + (n * 0.6 + n2 * 0.4 - 0.5) * 0.7 * uv.y;
  float a = smoothstep(0.05, 0.45, f) * smoothstep(0.0, 0.08, uv.y);
  vec3 col = mix(uCol1, uCol2, smoothstep(0.3, 0.85, f));
  gl_FragColor = vec4(col * a * 1.6, a);
  #include <fog_fragment>
}`;

export class FlameSet {
  constructor() { this.items = []; }
  add(pos, scale = 1, kind = 'fire') { this.items.push({ pos: pos.clone(), scale, kind }); }
  build(group, noiseTex, fogUniforms) {
    if (!this.items.length) return null;
    const P = [], UV = [], S = [], I = [];
    const r = new RNG(77);
    for (const it of this.items) {
      const seed = r.next();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI; const ca = Math.cos(a) * 0.5 * it.scale, sa = Math.sin(a) * 0.5 * it.scale; const h = 1.25 * it.scale;
        const b = P.length / 3;
        P.push(it.pos.x - ca, it.pos.y, it.pos.z - sa, it.pos.x + ca, it.pos.y, it.pos.z + sa, it.pos.x + ca, it.pos.y + h, it.pos.z + sa, it.pos.x - ca, it.pos.y + h, it.pos.z - sa);
        UV.push(0, 0, 1, 0, 1, 1, 0, 1); S.push(seed + k * 0.3, seed + k * 0.3, seed + k * 0.3, seed + k * 0.3);
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(S, 1));
    g.setIndex(I); g.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogUniforms(), { uTime: { value: 0 }, tNoise: { value: noiseTex }, uCol1: { value: new THREE.Color(1.0, 0.22, 0.02) }, uCol2: { value: new THREE.Color(1.0, 0.85, 0.45) } }),
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, fog: true, toneMapped: false,
    });
    const m = new THREE.Mesh(g, mat); m.name = 'flames'; m.renderOrder = 5;
    group.add(m);
    this.mesh = m; this.mat = mat;
    return m;
  }
  update(t) { if (this.mat) this.mat.uniforms.uTime.value = t; }
  dispose() { if (this.mesh) { this.mesh.geometry.dispose(); this.mat.dispose(); } }
}

// ---------------------------------------------------------------- pieces (local frame)
export function lanternPost(b, lx, lz, h = 2.7, color = '#ffb35a') {
  b.cyl('wood', lx, h / 2, lz, 0.09, h, { color: DARKWOOD, seg: 8 });
  b.box('wood', lx, 0.12, lz, 0.35, 0.24, 0.35, { color: DARKWOOD });
  b.box('wood', lx + 0.32, h - 0.08, lz, 0.7, 0.09, 0.09, { color: DARKWOOD });
  const hx = lx + 0.6;
  b.cone('metal', hx, h - 0.22, lz, 0.24, 0.2, { color: IRON, seg: 4, ry: Math.PI / 4 });
  b.box('lamp', hx, h - 0.48, lz, 0.22, 0.32, 0.22);
  for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) b.box('metal', hx + dx, h - 0.48, lz + dz, 0.03, 0.36, 0.03, { color: IRON });
  b.box('metal', hx, h - 0.68, lz, 0.28, 0.04, 0.28, { color: IRON });
  b.post(lx, lz, 0.18);
  return b.light(hx, h - 0.5, lz, color, 7, 15, { night: true });
}

export function campfire(b, flames, scale = 1, lights = true) {
  const r = new RNG(Math.round(b.frame.x * 13 + b.frame.z * 7));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2; const R = 0.75 * scale;
    b.sphere('rock', Math.cos(a) * R, 0.08, Math.sin(a) * R, 0.2 * scale, { sy: 0.14 * scale, color: C('#8a8682').multiplyScalar(r.range(0.7, 1.1)), ry: r.next() * 3 });
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    b.cyl('wood', Math.cos(a) * 0.3 * scale, 0.16 * scale, Math.sin(a) * 0.3 * scale, 0.07 * scale, 0.9 * scale, { rz: Math.cos(a) * 1.1, rx: -Math.sin(a) * 1.1, color: C('#3a2a1c'), seg: 7 });
  }
  b.cyl('glow', 0, 0.05, 0, 0.42 * scale, 0.06, { color: C('#ff5a10'), seg: 10 });
  flames.add(b.wv(0, 0.05, 0), 0.95 * scale);
  b.post(0, 0, 0.6 * scale);
  return lights ? b.light(0, 0.9, 0, '#ff8a3a', 16 * scale, 16 * scale, { flicker: true, pri: 1.6 }) : null;
}

export function crate(b, lx, ly, lz, s = 0.9, ry = 0) {
  b.box('planks', lx, ly + s / 2, lz, s, s, s, { ry, color: C('#b08a5a') });
  for (const dy of [0.06, s - 0.06]) b.box('wood', lx, ly + dy, lz, s + 0.04, 0.08, s + 0.04, { ry, color: DARKWOOD });
}
export function barrel(b, lx, ly, lz, h = 1.1) {
  b.cyl('planks', lx, ly + h / 2, lz, 0.42, h, { seg: 14, color: C('#9a7448') });
  b.cyl('planks', lx, ly + h - 0.01, lz, 0.4, 0.04, { seg: 14, color: C('#7a5a38') });
  for (const f of [0.15, 0.85]) b.cyl('metal', lx, ly + h * f, lz, 0.435, 0.06, { seg: 14, color: IRON });
  b.post(lx, lz, 0.45);
}
export function sack(b, lx, ly, lz, color = '#c8b48a') {
  b.sphere('cloth', lx, ly + 0.3, lz, 0.35, { sy: 0.38, color: C(color) });
  b.cyl('cloth', lx, ly + 0.66, lz, 0.1, 0.16, { color: C(color), seg: 6 });
}

// Market stall: counter at front (local +z), canopy on 4 posts. Returns merchant local position.
export function stall(b, w = 4, d = 2.6, canopyMat = 'cloth', canopyColor = '#c84a3a') {
  const h = 2.6;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    b.cyl('wood', x, h / 2 + (z < 0 ? 0.25 : 0), z, 0.08, h + (z < 0 ? 0.5 : 0), { seg: 8, color: WOOD });
    b.post(x, z, 0.15);
  }
  // counter
  b.box('planks', 0, 0.55, d / 2 - 0.25, w - 0.2, 1.1, 0.5, { color: C('#a07850') });
  b.box('planks', 0, 1.13, d / 2 - 0.2, w + 0.1, 0.07, 0.7, { color: C('#7a5a3a') });
  b.wall(-w / 2, d / 2 - 0.25, w / 2, d / 2 - 0.25, 0.3);
  // canopy (sloped)
  const ang = 0.2;
  b.box(canopyMat, 0, h + 0.35, 0, w + 0.7, 0.05, d + 0.9, { rx: -ang, color: C(canopyColor), keepUV: canopyMat === 'canopy' });
  // fringe
  b.box(canopyMat, 0, h + 0.05, d / 2 + 0.43, w + 0.7, 0.32, 0.03, { rx: -ang, color: C(canopyColor) });
  // goods on counter
  const r = new RNG(Math.round(b.frame.x * 3 + b.frame.z));
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.5 + (i / 5) * (w - 1);
    if (r.chance(0.5)) b.sphere('glow', x, 1.3, d / 2 - 0.15, 0.09, { sy: 0.13, color: C(r.pick(['#ff3b4a', '#3b7bff', '#ff1f6b', '#5dff7a'])).multiplyScalar(0.35), seg: 8 });
    else b.box('planks', x, 1.25, d / 2 - 0.2, 0.3, 0.18, 0.25, { color: C(r.pick(['#c8a070', '#8a6a48', '#d8c8a0'])) });
  }
  return { x: 0, z: -0.3 };
}

export function tent(b, color = '#7a5a3a', w = 3.2, l = 3.8, h = 2.3) {
  // A-frame cloth: two slanted panels
  const ang = Math.atan2(h, w / 2), slant = Math.hypot(h, w / 2);
  b.box('cloth', -w / 4, h / 2, 0, 0.05, slant, l, { rz: -(Math.PI / 2 - ang), color: C(color) });
  b.box('cloth', w / 4, h / 2, 0, 0.05, slant, l, { rz: Math.PI / 2 - ang, color: C(color) });
  // back panel
  b.prism('cloth', 0, 0, -l / 2, w, h, 0.05, { color: C(color).multiplyScalar(0.85) });
  // poles + ridge
  for (const z of [-l / 2 - 0.05, l / 2 + 0.05]) b.cyl('wood', 0, h / 2, z, 0.05, h + 0.2, { seg: 6, color: DARKWOOD });
  b.cyl('wood', 0, h + 0.02, 0, 0.05, l + 0.5, { rx: Math.PI / 2, seg: 6, color: DARKWOOD });
  // bedding inside
  b.box('cloth', 0, 0.06, -0.2, 1.0, 0.12, 2.0, { color: C('#8a7a60') });
  b.post(0, 0, 1.4);
}

export function bedroll(b, color = '#7a3a3a') {
  b.box('cloth', 0, 0.06, 0, 0.9, 0.12, 2.0, { color: C(color) });
  b.box('cloth', 0, 0.09, 0.35, 0.92, 0.1, 1.2, { color: C(color).multiplyScalar(0.75) });
  b.cyl('cloth', 0, 0.16, -0.85, 0.16, 0.85, { rz: Math.PI / 2, seg: 10, color: C('#d8ccb0') });
}

export function logSeat(b, lx, lz, ry, len = 1.8) {
  b.cyl('wood', lx, 0.22, lz, 0.22, len, { rz: Math.PI / 2, ry, seg: 9, color: C('#6a4a30') });
}

export function signPost(b, lx, lz, color = '#a07850') {
  b.cyl('wood', lx, 1.2, lz, 0.07, 2.4, { seg: 6, color: DARKWOOD });
  b.box('planks', lx, 2.0, lz + 0.05, 1.1, 0.45, 0.06, { color: C(color) });
}

export function standingStone(b, lx, lz, h, w, r) {
  b.box('rock', lx, h / 2 - 0.3, lz, w, h, w * 0.6, { rx: r.range(-0.08, 0.08), rz: r.range(-0.08, 0.08), ry: r.next() * 3, color: C('#9a948a').multiplyScalar(r.range(0.75, 1.05)), tile: 3 });
  b.post(lx, lz, w * 0.55);
}

export function brazier(b, flames, lx, lz, h = 1.4, light = true) {
  b.cyl('stone', lx, h / 2, lz, 0.28, h, { seg: 8, rTop: 0.7, color: C('#7a7470') });
  b.cyl('metal', lx, h + 0.15, lz, 0.55, 0.3, { seg: 12, rTop: 1.3, color: C('#3a3634') });
  b.cyl('glow', lx, h + 0.28, lz, 0.5, 0.05, { seg: 10, color: C('#ff6a1a') });
  flames.add(b.wv(lx, h + 0.25, lz), 0.8 * (b.frame.s ?? 1));
  b.post(lx, lz, 0.45);
  return light ? b.light(lx, h + 1.0, lz, '#ff8a3a', 12, 14, { flicker: true }) : null;
}

export function well(b) {
  b.cyl('stone', 0, 0.45, 0, 1.1, 0.9, { seg: 16, color: C('#a09a90') });
  b.cyl('glow', 0, 0.75, 0, 0.9, 0.05, { seg: 16, color: C('#0a1418') });
  for (const x of [-1.0, 1.0]) b.cyl('wood', x, 1.6, 0, 0.08, 2.2, { seg: 6, color: DARKWOOD });
  b.prism('roof', 0, 2.6, 0, 2.8, 0.9, 1.6, { color: C('#8a5a3a') });
  b.cyl('wood', 0, 2.2, 0, 0.06, 2.0, { rz: Math.PI / 2, seg: 6, color: DARKWOOD });
  b.post(0, 0, 1.2);
}

export function fence(b, pts, h = 1.0, gapAt = -1) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (i === gapAt) continue;
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(L / 2));
    const ry = Math.atan2(x2 - x1, z2 - z1);
    for (let k = 0; k <= n; k++) { const t = k / n; b.box('wood', x1 + (x2 - x1) * t, h / 2, z1 + (z2 - z1) * t, 0.12, h, 0.12, { color: DARKWOOD }); }
    for (const y of [h * 0.4, h * 0.85]) b.box('wood', (x1 + x2) / 2, y, (z1 + z2) / 2, 0.06, 0.1, L, { ry, color: WOOD });
    b.wall(x1, z1, x2, z2, 0.12);
  }
}
