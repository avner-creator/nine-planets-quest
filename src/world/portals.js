// Portals (stone ring + rune inlays + swirl surface), temple orb + barrier shaders.
import * as THREE from 'three';
import { C } from './props.js';
import { RNG } from './noise.js';
import { D } from './sky.js';

const SWIRL_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SWIRL_FRAG = /* glsl */`
uniform float uTime, uOpen, uLock; uniform vec3 uColor, uColor2, uLockCol; uniform sampler2D tNoise, tLock;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  if (r > 1.0) discard;
  if (uLock > 0.5) {
    float la = texture2D(tLock, vUv * 1.25 - 0.125).a;
    float pulse = 0.78 + 0.22 * sin(uTime * 2.2);
    float mist = texture2D(tNoise, vec2(atan(p.y, p.x) / 6.2831853 + uTime * 0.01, r * 0.5)).r;
    vec3 lc = mix(vec3(0.03, 0.03, 0.05) + uColor * 0.06 * mist, uLockCol * 1.7 * pulse, la);
    lc += uColor * smoothstep(0.8, 1.0, r) * 0.45;
    gl_FragColor = vec4(lc, max(0.42 * smoothstep(1.0, 0.9, r), la));
    return;
  }
  float a = atan(p.y, p.x);
  float sw = a / 6.2831853 + r * 0.9 - uTime * 0.18;
  float n = texture2D(tNoise, vec2(sw * 2.0, r * 0.7 - uTime * 0.08)).r;
  float n2 = texture2D(tNoise, vec2(sw * 5.0 + 0.3, r * 1.4 - uTime * 0.2)).g;
  float bands = sin((sw * 3.0 + n * 1.6) * 6.2831853) * 0.5 + 0.5;
  vec3 col = mix(uColor * 0.35, uColor2, bands * (0.5 + n2 * 0.7));
  col += uColor2 * pow(1.0 - r, 2.5) * 1.4;
  col += uColor * smoothstep(0.7, 1.0, r) * 1.2;
  float alpha = smoothstep(1.0, 0.9, r) * uOpen * (0.82 + 0.18 * bands);
  gl_FragColor = vec4(col * 1.3, alpha);
}`;

export function swirlMaterial(color, noiseTex, lockTex) {
  const c = D(color);
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 1 }, uLock: { value: 0 }, uColor: { value: c.clone() }, uColor2: { value: c.clone().lerp(new THREE.Color(1, 1, 1), 0.5) }, tNoise: { value: noiseTex }, tLock: { value: lockTex || null }, uLockCol: { value: D('#ffcf5a') } },
    vertexShader: SWIRL_VERT, fragmentShader: SWIRL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

// Stone portal ring in the builder's current frame. Ring plane = local XY, faces local +Z.
// Returns { centre (local y), R, runeQuads: [...] } — runes are emitted into a separate per-portal geometry.
export function portalRing(b, opts) {
  const { R = 2.6, thick = 0.62, depth = 0.75, stone = '#8a857c', mat = 'stone', pedestal = true, theme = 0, accent = '#ffffff' } = opts;
  const r = new RNG(Math.round(b.frame.x * 7 + b.frame.z * 3) + theme);
  const base = pedestal ? 0.5 : 0.15;
  const cy = base + R + thick * 0.5 - 0.05;
  if (pedestal) {
    b.box('stone', 0, base / 2 - 0.15, 0, 2 * R + 1.6, base + 0.3, 2.4, { color: C(stone).multiplyScalar(0.8) });
    b.box('stone', 0, 0.12, 1.6, 2 * R, 0.24, 0.9, { color: C(stone).multiplyScalar(0.75) });
    b.box('stone', 0, 0.12, -1.6, 2 * R, 0.24, 0.9, { color: C(stone).multiplyScalar(0.75) });
    b.floor(0, 0, 2 * R + 1.6, 2.4, base);
    b.ramp(0, 2.1, 1.15, 2 * R, 0, base, 2);
    b.ramp(0, -2.1, -1.15, 2 * R, 0, base, 2);
  }
  const N = Math.round(R * 6.2);
  const runes = [];
  for (let k = 0; k < N; k++) {
    const t = (k / N) * Math.PI * 2;
    const arc = (2 * Math.PI * (R + thick / 2)) / N - 0.06;
    const key = k === 0;
    const col = C(stone).multiplyScalar(r.range(0.8, 1.08) * (key ? 1.1 : 1));
    b.box(mat, Math.sin(t) * (R + thick / 2), cy + Math.cos(t) * (R + thick / 2), 0, arc, thick + (key ? 0.25 : 0), depth + (key ? 0.2 : 0), { rz: -t, color: col });
    runes.push({ t, r: R + thick / 2, cy, z: depth / 2 + 0.012 });
  }
  b.post(-(R + thick / 2), 0, 0.45); b.post(R + thick / 2, 0, 0.45);
  return { cy, R, runes, base };
}

// Rune inlay quads (front and back) as one geometry, positioned in world space using builder frame.
export function runeGeometry(b, ring) {
  const P = [], UV = [], I = [];
  const r = new RNG(Math.round(b.frame.x * 5 + b.frame.z * 11));
  for (const q of ring.runes) {
    for (const side of [1, -1]) {
      const s = 0.2; const cell = r.int(0, 18);
      const u0 = (12 + cell * 56) / 1024, u1 = u0 + 48 / 1024;
      const ct = Math.cos(q.t), st = Math.sin(q.t);
      const cx = st * q.r, cy = q.cy + ct * q.r, z = q.z * side;
      const corners = [[-s, -s], [s, -s], [s, s], [-s, s]];
      const base = P.length / 3;
      corners.forEach(([u, v]) => {
        // tangent (ct, -st), radial (st, ct)
        const lx = cx + ct * u * side + st * v, ly = cy - st * u * side + ct * v;
        const w = b.wv(lx, ly, z);
        P.push(w.x, w.y, w.z);
      });
      UV.push(u0, 0, u1, 0, u1, 1, u0, 1);
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I); g.computeBoundingSphere();
  return g;
}

export function runeMaterial(runeTex, color) {
  return new THREE.MeshBasicMaterial({ map: runeTex, color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: true });
}

// ---------------------------------------------------------------- temple orb + barrier
const ORB_VERT = /* glsl */`varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ORB_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime;
varying vec3 vN; varying vec3 vV;
void main(){
  float f = pow(1.0 - max(dot(normalize(vN), vV), 0.0), 2.0);
  float pulse = 0.85 + 0.15 * sin(uTime * 2.5);
  float swirl = sin(vN.x * 9.0 + uTime * 2.0) * sin(vN.y * 7.0 - uTime * 1.6) * 0.5 + 0.5;
  vec3 col = mix(vec3(1.0), uColor, 0.35 + f * 0.6) * (1.2 + f * 1.5 + swirl * 0.3) * pulse;
  gl_FragColor = vec4(col, 1.0);
}`;
export function orbMaterial(color) {
  return new THREE.ShaderMaterial({ uniforms: { uColor: { value: D(color) }, uTime: { value: 0 } }, vertexShader: ORB_VERT, fragmentShader: ORB_FRAG, toneMapped: false });
}
const BAR_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime; uniform sampler2D tNoise;
varying vec2 vUv;
void main(){
  vec2 uv = vUv;
  float n = texture2D(tNoise, uv * vec2(1.0, 1.6) + vec2(0.0, -uTime * 0.12)).r;
  float n2 = texture2D(tNoise, uv * 2.3 + vec2(uTime * 0.05, uTime * 0.09)).g;
  vec2 hx = uv * vec2(7.0, 11.0); hx.x += mod(floor(hx.y), 2.0) * 0.5;
  vec2 f = abs(fract(hx) - 0.5);
  float grid = smoothstep(0.42, 0.5, max(f.x, f.y));
  float edge = smoothstep(0.12, 0.0, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  float a = 0.28 + grid * 0.35 + n * 0.3 + n2 * 0.15 + edge * 0.6;
  a *= 0.8 + 0.2 * sin(uTime * 3.0 + uv.y * 12.0);
  gl_FragColor = vec4(uColor * (0.8 + grid + edge) * 1.3, clamp(a, 0.0, 1.0) * 0.85);
}`;
export function barrierMaterial(color, noiseTex) {
  return new THREE.ShaderMaterial({ uniforms: { uColor: { value: D(color) }, uTime: { value: 0 }, tNoise: { value: noiseTex } },
    vertexShader: SWIRL_VERT, fragmentShader: BAR_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
}
