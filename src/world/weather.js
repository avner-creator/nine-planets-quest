// Weather & ambient life: camera-following particles (snow, embers, ash, dust, rain, mist, fireflies,
// ghost lights), butterflies, seagulls, and storm lightning.
import * as THREE from 'three';
import { RNG } from './noise.js';
import { glowTexture } from './canvasTex.js';

const P_VERT = /* glsl */`
attribute vec4 aData;
uniform vec3 uCam, uBox, uVel, uOrigin; uniform float uTime, uSize, uPx, uSwirl, uFloor;
varying float vAlpha; varying float vRand;
void main(){
  vec3 p = aData.xyz * uBox + uVel * uTime * (0.7 + 0.6 * aData.w);
  p.x += sin(uTime * 0.7 + aData.w * 20.0) * uSwirl; p.z += cos(uTime * 0.6 + aData.w * 13.0) * uSwirl; p.y += sin(uTime * 0.9 + aData.w * 31.0) * uSwirl * 0.3;
  vec3 c = vec3(uCam.x, mix(uCam.y, uOrigin.y, uFloor), uCam.z);
  p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 wp = c + p;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (0.6 + 0.8 * aData.w) * uPx / max(-mv.z, 0.1), 0.0, 64.0);
  vec3 q = abs(p) / (uBox * 0.5);
  vAlpha = 1.0 - smoothstep(0.7, 1.0, max(q.x, max(q.y, q.z)));
  vRand = aData.w;
}`;
const P_FRAG = /* glsl */`
uniform vec3 uColor, uColor2; uniform float uOpacity, uTime, uBlink;
varying float vAlpha; varying float vRand;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  float a = smoothstep(0.5, 0.1, d) * vAlpha * uOpacity;
  if (uBlink > 0.0) a *= mix(1.0, smoothstep(0.2, 1.0, sin(uTime * (1.5 + vRand * 2.0) + vRand * 40.0) * 0.5 + 0.5), uBlink);
  vec3 col = mix(uColor, uColor2, fract(vRand * 7.31));
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

const R_VERT = /* glsl */`
attribute vec4 aData; attribute float aEnd;
uniform vec3 uCam, uBox, uVel; uniform float uTime, uLen;
varying float vAlpha;
void main(){
  vec3 p = aData.xyz * uBox + uVel * uTime * (0.85 + 0.3 * aData.w);
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 wp = uCam + p - uVel * uLen * aEnd;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vec3 q = abs(p) / (uBox * 0.5);
  vAlpha = (1.0 - smoothstep(0.6, 1.0, max(q.x, max(q.y, q.z)))) * (1.0 - aEnd * 0.7);
}`;
const R_FRAG = /* glsl */`uniform vec3 uColor; uniform float uOpacity; varying float vAlpha; void main(){ gl_FragColor = vec4(uColor, vAlpha * uOpacity); }`;

function particles(cfg, count, rng) {
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) data[i] = rng.next();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  const U = {
    uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...cfg.box) }, uVel: { value: new THREE.Vector3(...cfg.vel) }, uOrigin: { value: new THREE.Vector3(0, cfg.originY ?? 0, 0) },
    uTime: { value: 0 }, uSize: { value: cfg.size }, uPx: { value: 500 }, uSwirl: { value: cfg.swirl ?? 0 }, uFloor: { value: cfg.floor ? 1 : 0 },
    uColor: { value: new THREE.Color(...cfg.color) }, uColor2: { value: new THREE.Color(...(cfg.color2 || cfg.color)) }, uOpacity: { value: cfg.opacity ?? 1 }, uBlink: { value: cfg.blink ?? 0 },
  };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false,
    blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 8;
  return { obj: pts, U, base: cfg.opacity ?? 1, cfg };
}

function rainLines(count, rng) {
  const data = new Float32Array(count * 2 * 4), end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { const a = [rng.next(), rng.next(), rng.next(), rng.next()]; for (let k = 0; k < 2; k++) { data.set(a, (i * 2 + k) * 4); end[i * 2 + k] = k; } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const U = { uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(50, 34, 50) }, uVel: { value: new THREE.Vector3(3, -19, 1.2) }, uTime: { value: 0 }, uLen: { value: 0.045 },
    uColor: { value: new THREE.Color(0.72, 0.78, 0.9) }, uOpacity: { value: 0.45 } };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: R_VERT, fragmentShader: R_FRAG, transparent: true, depthWrite: false, toneMapped: false });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.renderOrder = 8;
  return { obj: l, U, base: 0.45 };
}

// Soft billboard puffs (mist / smoke) around the camera, as one instanced mesh.
const B_VERT = /* glsl */`
attribute vec4 aData;
uniform vec3 uCam, uBox; uniform float uTime, uY0, uYr, uSize, uRise;
varying vec2 vUv; varying float vA;
void main(){
  vUv = uv;
  vec3 p = vec3(aData.x * uBox.x + uTime * 0.6 * (aData.w - 0.3), 0.0, aData.z * uBox.z + uTime * 0.25);
  p.xz = mod(p.xz - uCam.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5;
  float life = fract(aData.y + uTime * uRise);
  vec3 wp = vec3(uCam.x + p.x, uY0 + aData.y * uYr + life * uRise * 60.0, uCam.z + p.z);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float s = uSize * (0.6 + aData.w * 0.8) * (1.0 + life * uRise * 20.0);
  wp += (right * position.x + up * position.y) * s;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  float edge = max(abs(p.x) / (uBox.x * 0.5), abs(p.z) / (uBox.z * 0.5));
  vA = (1.0 - smoothstep(0.6, 1.0, edge)) * (uRise > 0.0 ? sin(life * 3.14159) : 1.0);
}`;
const B_FRAG = /* glsl */`
uniform sampler2D tGlow; uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv; varying float vA;
#include <common>
void main(){ float a = texture2D(tGlow, vUv).a * vA * uOpacity; gl_FragColor = vec4(uColor, a); }`;

function billboards(cfg, rng, tex) {
  const n = cfg.count;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const d = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) d[i] = rng.next();
  g.setAttribute('aData', new THREE.InstancedBufferAttribute(d, 4)); g.instanceCount = n;
  const U = { uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...cfg.box) }, uTime: { value: 0 }, uY0: { value: cfg.y0 }, uYr: { value: cfg.yr }, uSize: { value: cfg.size },
    uRise: { value: cfg.rise || 0 }, tGlow: { value: tex }, uColor: { value: new THREE.Color(...cfg.color) }, uOpacity: { value: cfg.opacity } };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: B_VERT, fragmentShader: B_FRAG, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 7;
  return { obj: mesh, U, base: cfg.opacity, geo: base };
}

// Butterflies / birds: tiny flapping wings that wander around the camera.
const W_VERT = /* glsl */`
attribute vec4 aData; attribute vec3 aCol;
uniform vec3 uCam; uniform float uTime, uBox, uY0, uYr, uSpeed, uFlap, uSize, uGround;
varying vec3 vCol;
void main(){
  vCol = aCol;
  float t = uTime * uSpeed * (0.6 + aData.w * 0.8) + aData.x * 100.0;
  vec3 c = vec3(aData.x * uBox + sin(t * 0.31) * 6.0 + cos(t * 0.13) * 9.0, 0.0, aData.z * uBox + cos(t * 0.27) * 6.0 + sin(t * 0.11) * 9.0);
  c.xz = mod(c.xz - uCam.xz + uBox * 0.5, vec2(uBox)) - uBox * 0.5;
  float y = mix(uY0 + aData.y * uYr, uCam.y - 1.0 + aData.y * uYr, uGround) + sin(t * 1.7) * 0.6;
  vec3 dir = normalize(vec3(cos(t * 0.31) * 0.31 * 6.0 - sin(t * 0.13) * 0.13 * 9.0, 0.0, -sin(t * 0.27) * 0.27 * 6.0 + cos(t * 0.11) * 0.11 * 9.0) + 1e-4);
  vec3 side = vec3(-dir.z, 0.0, dir.x);
  float flap = sin(uTime * uFlap * (0.9 + aData.w * 0.2) + aData.z * 30.0);
  vec3 lp = position * uSize;
  float wing = lp.x;
  vec3 wp = vec3(uCam.x + c.x, y, uCam.z + c.z) + side * wing * cos(flap * 0.9) + dir * lp.z + vec3(0.0, abs(wing) * sin(flap * 0.9), 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const W_FRAG = /* glsl */`uniform float uOpacity; uniform float uLight; varying vec3 vCol; void main(){ if (uOpacity < 0.01) discard; gl_FragColor = vec4(vCol * uLight, 1.0); }`;

function flappers(cfg, rng) {
  const n = cfg.count;
  // two wings, hinged at x = 0
  const base = new THREE.BufferGeometry();
  const P = cfg.bird ? [0, 0, 0.15, 1, 0, -0.1, 0, 0, -0.25, 0, 0, 0.15, -1, 0, -0.1, 0, 0, -0.25]
    : [0, 0, 0, 0.9, 0, 0.6, 0.9, 0, -0.4, 0, 0, 0, 0.7, 0, -0.5, 0.2, 0, -0.9, 0, 0, 0, -0.9, 0, 0.6, -0.9, 0, -0.4, 0, 0, 0, -0.7, 0, -0.5, -0.2, 0, -0.9];
  base.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', base.attributes.position);
  const d = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) d[i] = rng.next();
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const c = new THREE.Color(rng.pick(cfg.colors)).convertLinearToSRGB(); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('aData', new THREE.InstancedBufferAttribute(d, 4)); g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3)); g.instanceCount = n;
  const U = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: cfg.box }, uY0: { value: cfg.y0 }, uYr: { value: cfg.yr }, uSpeed: { value: cfg.speed }, uFlap: { value: cfg.flap },
    uSize: { value: cfg.size }, uGround: { value: cfg.ground ? 1 : 0 }, uOpacity: { value: 1 }, uLight: { value: 1 } };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: W_VERT, fragmentShader: W_FRAG, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
  return { obj: mesh, U, base: 1, geo: base };
}

export function createWeather(renderer, scene, opts) {
  const { kind, quality, seed, extras = [] } = opts;
  const hi = quality === 'high';
  const rng = new RNG(seed * 13 + 1);
  const group = new THREE.Group(); group.name = 'weather';
  const sys = [];
  const glow = glowTexture();
  const add = (s, mode) => { s.mode = mode || 'always'; sys.push(s); group.add(s.obj); return s; };
  const n = (x) => Math.round(x * (hi ? 1 : 0.45));
  switch (kind) {
    case 'snow': add(particles({ box: [70, 40, 70], vel: [0.7, -1.5, 0.3], size: 0.11, color: [1, 1, 1], opacity: 0.95, swirl: 0.9 }, n(5000), rng)); break;
    case 'embers': add(particles({ box: [90, 45, 90], vel: [0.4, 1.3, 0.2], size: 0.13, color: [1.0, 0.45, 0.08], color2: [1.0, 0.75, 0.3], additive: true, swirl: 1.6, blink: 0.6, opacity: 1 }, n(900), rng)); break;
    case 'ash': add(particles({ box: [70, 40, 70], vel: [0.6, -0.55, 0.25], size: 0.09, color: [0.55, 0.52, 0.5], color2: [0.35, 0.33, 0.32], opacity: 0.85, swirl: 1.2 }, n(3000), rng)); break;
    case 'dust': add(particles({ box: [90, 24, 90], vel: [4.5, 0.08, 1.6], size: 0.07, color: [0.85, 0.65, 0.45], opacity: 0.6, swirl: 0.6 }, n(1800), rng)); break;
    case 'heat': add(particles({ box: [70, 24, 70], vel: [1.2, 0.15, 0.5], size: 0.05, color: [1.0, 0.92, 0.75], opacity: 0.45, swirl: 0.4 }, n(700), rng)); break;
    case 'storm': add(rainLines(n(4000), rng)); add(particles({ box: [60, 30, 60], vel: [3, -6, 1], size: 0.05, color: [0.75, 0.8, 0.9], opacity: 0.35 }, n(800), rng)); break;
    case 'mist': break;
    default: break;
  }
  for (const e of extras) {
    if (e === 'mist') add(billboards({ count: hi ? 70 : 35, box: [150, 0, 150], y0: opts.mistY ?? 2, yr: 6, size: 26, color: opts.mistColor || [0.55, 0.5, 0.7], opacity: 0.16 }, rng, glow));
    if (e === 'fireflies') add(particles({ box: [70, 7, 70], vel: [0.1, 0.05, 0.1], size: 0.22, color: opts.fireflyColor || [0.85, 1.0, 0.35], color2: opts.fireflyColor2 || [1.0, 0.9, 0.4], additive: true, swirl: 1.4, blink: 1, opacity: 1, floor: false }, n(320), rng), opts.firefliesAlways ? 'always' : 'night');
    if (e === 'ghosts') add(particles({ box: [160, 14, 160], vel: [0.3, 0.1, 0.2], size: 0.9, color: [0.4, 1.0, 0.6], color2: [0.6, 1.0, 0.8], additive: true, swirl: 3, blink: 0.8, opacity: 0.9 }, n(60), rng));
    if (e === 'butterflies') add(flappers({ count: hi ? 30 : 14, box: 60, y0: 0, yr: 2.5, speed: 0.35, flap: 14, size: 0.09, ground: true, colors: ['#ffcf3a', '#ff7a3a', '#ffffff', '#7ac8ff', '#ff9ad8'] }, rng), 'day');
    if (e === 'gulls') add(flappers({ count: hi ? 10 : 5, box: 240, y0: 22, yr: 20, speed: 0.18, flap: 5, size: 0.75, bird: true, colors: ['#f4f4f0', '#e0e0dc'] }, rng), 'day');
    if (e === 'smoke') add(billboards({ count: 26, box: [40, 0, 40], y0: opts.smokeY ?? 120, yr: 4, size: 30, color: [0.18, 0.15, 0.14], opacity: 0.45, rise: 0.03 }, rng, glow), 'fixed');
  }
  scene.add(group);

  // lightning
  let bolt = null, flash = 0, next = 6 + rng.next() * 6, strikeT = -10;
  const storm = kind === 'storm';
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  function makeBolt(from, to, cam) {
    const pts = []; const segs = 16;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs; const p = from.clone().lerp(to, t);
      if (i > 0 && i < segs) { p.x += rng.range(-9, 9) * (1 - t * 0.3); p.z += rng.range(-9, 9) * (1 - t * 0.3); }
      pts.push(p);
    }
    const P = [], I = [];
    const ribbon = (list, w) => {
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i], b2 = list[i + 1];
        const dir = b2.clone().sub(a).normalize(); const view = cam.clone().sub(a).normalize();
        const side = dir.clone().cross(view).normalize().multiplyScalar(w);
        const base = P.length / 3;
        P.push(a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b2.x + side.x, b2.y + side.y, b2.z + side.z, b2.x - side.x, b2.y - side.y, b2.z - side.z);
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    };
    ribbon(pts, 1.4);
    for (let k = 0; k < 3; k++) {
      const s = rng.int(3, 10); const br = [pts[s].clone()]; const d = new THREE.Vector3(rng.range(-1, 1), -1.2, rng.range(-1, 1)).normalize();
      for (let i = 1; i < 6; i++) br.push(br[i - 1].clone().addScaledVector(d, rng.range(8, 16)).add(new THREE.Vector3(rng.range(-4, 4), 0, rng.range(-4, 4))));
      ribbon(br, 0.6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
    return new THREE.Mesh(g, boltMat);
  }

  return {
    group,
    get flash() { return flash; },
    update(dt, time, camera, light, heightAt, onStrike) {
      const cam = camera.position;
      const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y * 0.5 * camera.projectionMatrix.elements[5];
      for (const s of sys) {
        const U = s.U;
        if (U.uCam) U.uCam.value.copy(cam);
        U.uTime.value = time;
        if (U.uPx) U.uPx.value = px;
        if (s.mode === 'fixed') { U.uCam.value.set(opts.smokeAt?.x ?? 0, 0, opts.smokeAt?.z ?? 0); }
        let k = 1;
        if (s.mode === 'night') k = light.night;
        else if (s.mode === 'day') k = 1 - light.night;
        if (U.uOpacity) U.uOpacity.value = s.base * k;
        if (U.uLight) U.uLight.value = 0.25 + 0.75 * (1 - light.night);
        s.obj.visible = k > 0.01;
      }
      if (storm) {
        if (time > next && time > strikeT + 1) {
          next = time + rng.range(5, 13);
          strikeT = time;
          const a = rng.next() * Math.PI * 2, d = rng.range(140, 420);
          const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
          const gy = heightAt(x, z);
          if (bolt) { group.remove(bolt); bolt.geometry.dispose(); }
          bolt = makeBolt(new THREE.Vector3(x + rng.range(-30, 30), gy + 260, z + rng.range(-30, 30)), new THREE.Vector3(x, gy, z), cam);
          group.add(bolt);
          if (onStrike) onStrike({ distance: d, position: new THREE.Vector3(x, gy, z), delay: d / 343 });
        }
        const e = time - strikeT;
        flash = e < 0.6 ? Math.max(0, Math.sin(e * 38) * (1 - e / 0.6)) + (e < 0.08 ? 1 : 0) : 0;
        if (bolt) { bolt.visible = e < 0.35 && (Math.sin(e * 60) > -0.3); boltMat.opacity = 1 - e / 0.35; }
      }
    },
    dispose() {
      scene.remove(group);
      for (const s of sys) { s.obj.geometry.dispose(); s.obj.material.dispose(); if (s.geo) s.geo.dispose(); }
      glow.dispose(); boltMat.dispose(); if (bolt) bolt.geometry.dispose();
    },
  };
}
