// Sky dome (display-space shader), clouds, stars, aurora, planets & moons, and the day/night palette.
import * as THREE from 'three';
import { bakeTexture, bakePlanet } from './bake.js';

// Display-space colour (raw sRGB values, no conversion).
export function D(hex) {
  if (hex instanceof THREE.Color) return hex.clone();
  const v = parseInt(String(hex).replace('#', ''), 16);
  return new THREE.Color(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}
const lerpC = (a, b, t) => a.clone().lerp(b, t);
const desat = (c, k) => { const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11; return c.lerp(new THREE.Color(l, l, l * 1.08), k); };

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith, uHorizon, uGlowCol, uSunCol, uSunDir, uMoonDir, uMoonCol, uFogOut, uGround, uCloudLit, uCloudDark, uAuroraCol;
uniform float uTime, uStars, uCloudCover, uSunDisk, uFlash, uAurora, uHorizonBlend, uNight, uEnvScale, uGlowAmt;
uniform vec2 uWind;
uniform sampler2D tClouds;
varying vec3 vDir;
float h13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 h33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y, hy = max(y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(hy, 0.48));
  float cs = max(dot(d, uSunDir), 0.0);
  float near = 1.0 - smoothstep(0.0, 0.5, hy);
  col += uGlowCol * (pow(cs, 5.0) * 0.32 * (0.4 + near) + pow(cs, 40.0) * 0.35 + pow(cs, 600.0) * 0.8) * uGlowAmt;
  float cm = max(dot(d, uMoonDir), 0.0);
  col += uMoonCol * pow(cm, 48.0) * 0.12 * uNight;
#ifndef ENV
  if (uStars > 0.01 && y > -0.05) {
    vec3 p = d * 260.0; vec3 cell = floor(p); vec3 f = fract(p) - 0.5; float hh = h13(cell);
    if (hh > 0.972) {
      vec3 o = h33(cell) - 0.5; float dd = length(f - o * 0.6);
      float br = smoothstep(0.11, 0.0, dd) * (hh - 0.972) / 0.028;
      float tw = 0.65 + 0.35 * sin(uTime * (2.0 + hh * 3.0) + hh * 91.0);
      vec3 sc = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), fract(hh * 37.0));
      col += sc * br * tw * uStars * 1.4 * smoothstep(-0.05, 0.15, y);
    }
    // faint galaxy band
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.55, 0.78))) * 4.0, 2.0));
    vec4 gn = texture2D(tClouds, d.xz / (abs(y) + 0.6) * 0.6 + 0.2);
    col += vec3(0.5, 0.55, 0.8) * band * gn.r * 0.07 * uStars;
  }
  if (uAurora > 0.0 && y > 0.0) {
    float a = 0.0;
    vec2 q = d.xz / (y + 0.25);
    float wave = sin(q.x * 1.6 + uTime * 0.15 + texture2D(tClouds, q * 0.08 + uTime * 0.003).r * 5.0);
    float curtain = exp(-pow((q.y - 0.9 + wave * 0.35) * 2.2, 2.0));
    float rays = texture2D(tClouds, vec2(q.x * 0.35 + uTime * 0.004, 0.5)).g;
    a = curtain * (0.4 + rays) * smoothstep(0.02, 0.25, y) * (1.0 - smoothstep(0.5, 0.95, y));
    col += mix(uAuroraCol, vec3(0.6, 0.3, 0.9), smoothstep(0.3, 0.9, y)) * a * uAurora * 0.7;
  }
#endif
  if (uCloudCover > 0.0 && y > 0.0) {
    vec2 cuv = d.xz / (y + 0.1) * 0.28 + uWind * uTime;
    vec4 c1 = texture2D(tClouds, cuv * 0.22);
    vec4 c2 = texture2D(tClouds, cuv * 0.8 + c1.rg * 0.12);
    float n = c1.r * 0.5 + c1.g * 0.35 + c2.b * 0.22 + c2.a * 0.12 - 0.12;
    float th = 1.0 - uCloudCover;
    float cov = smoothstep(th, th + 0.2, n) * smoothstep(0.0, 0.14, y);
    float thick = smoothstep(th, th + 0.55, n);
    // cheap self-shadowing: density a little way toward the sun
    vec2 sOff = normalize(uSunDir.xz + 1e-4) * 0.035;
    vec4 s1 = texture2D(tClouds, (cuv + sOff) * 0.22);
    float ns = s1.r * 0.5 + s1.g * 0.35 + c2.b * 0.22 + c2.a * 0.12 - 0.12;
    float shade = clamp((ns - n) * 6.0 + 0.5, 0.0, 1.0);
    vec3 cl = mix(uCloudLit, uCloudDark, clamp(thick * 0.65 + shade * 0.45, 0.0, 1.0));
    float edge = (1.0 - smoothstep(th, th + 0.12, n)) * cov;
    cl += uGlowCol * (pow(cs, 3.0) * (0.45 + edge * 1.2) * (1.0 - thick * 0.5)) * uGlowAmt;
    cl += uCloudLit * edge * 0.25 * (1.0 - uNight);
    cl += vec3(0.75, 0.78, 1.0) * uFlash * (0.5 + thick);
    col = mix(col, cl, cov * 0.95);
  }
#ifndef ENV
  float sd = smoothstep(0.99962, 0.99982, dot(d, uSunDir));
  col = mix(col, uSunCol, sd * uSunDisk);
#endif
  col += vec3(0.55, 0.6, 0.8) * uFlash * 0.25 * (1.0 - hy);
  float fb = 1.0 - smoothstep(-0.03, uHorizonBlend, y);
  col = mix(col, uFogOut, fb);
#ifdef ENV
  if (y < 0.0) col = mix(uFogOut, uGround, smoothstep(0.0, -0.25, y));
  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(2.2)) * uEnvScale, 1.0);
#else
  gl_FragColor = vec4(col, 1.0);
#endif
}`;

const BODY_VERT = /* glsl */`
varying vec3 vN; varying vec2 vUv; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const BODY_FRAG = /* glsl */`
uniform sampler2D tMap; uniform vec3 uSunDir, uAtmo, uTint; uniform float uAlpha, uAmbient, uGlow;
varying vec3 vN; varying vec2 vUv; varying vec3 vV;
void main(){
  vec3 N = normalize(vN);
  vec3 c = texture2D(tMap, vUv).rgb * uTint;
  float l = smoothstep(-0.15, 0.6, dot(N, uSunDir));
  vec3 col = c * (uAmbient + (1.0 - uAmbient) * l) + c * uGlow;
  float rim = pow(1.0 - max(dot(N, vV), 0.0), 3.0);
  col += uAtmo * rim * (0.25 + 0.75 * l);
  gl_FragColor = vec4(col, uAlpha);
}`;
const RING_FRAG = /* glsl */`
uniform vec3 uC1, uC2, uSunDir; uniform float uAlpha, uInner, uOuter, uSeed;
varying vec3 vN; varying vec2 vUv; varying vec3 vV;
float h(float x){ return fract(sin(x * 91.7 + uSeed) * 43758.5453); }
void main(){
  float r = (vUv.x - uInner) / (uOuter - uInner);
  if (r < 0.0 || r > 1.0) discard;
  float b = 0.0; float x = r * 60.0;
  b = mix(h(floor(x)), h(floor(x) + 1.0), fract(x));
  float bands = 0.45 + 0.55 * b * (0.6 + 0.4 * sin(r * 140.0));
  float gap = smoothstep(0.0, 0.02, abs(r - 0.62)) ;
  float a = bands * gap * smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.9, r);
  vec3 col = mix(uC1, uC2, b) * (0.55 + 0.45 * abs(dot(normalize(vN), uSunDir)));
  gl_FragColor = vec4(col, a * uAlpha);
}`;

export function createSky(renderer, cfg) {
  const group = new THREE.Group(); group.name = 'sky';
  const cloudsTex = bakeTexture(renderer, 'clouds');
  const U = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlowCol: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonCol: { value: D(cfg.moonGlow || '#9fb2d8') }, uFogOut: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() }, uAuroraCol: { value: D(cfg.auroraColor || '#40ffb0') },
    uTime: { value: 0 }, uStars: { value: 0 }, uCloudCover: { value: cfg.cloudCover ?? 0.45 }, uSunDisk: { value: 1 }, uFlash: { value: 0 },
    uAurora: { value: 0 }, uHorizonBlend: { value: cfg.horizonBlend ?? 0.18 }, uNight: { value: 0 }, uEnvScale: { value: 1 }, uGlowAmt: { value: 1 },
    uWind: { value: new THREE.Vector2(cfg.cloudWind?.[0] ?? 0.004, cfg.cloudWind?.[1] ?? 0.0015) }, tClouds: { value: cloudsTex },
  };
  const skyMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide,
    depthWrite: false, depthTest: false, fog: false, toneMapped: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  dome.renderOrder = -1000; dome.frustumCulled = false; dome.name = 'skyDome';
  group.add(dome);

  // env scene (rendered into a PMREM)
  const envUniforms = Object.assign({}, U, { uFogOut: { value: new THREE.Color() } });
  const envMat = new THREE.ShaderMaterial({ uniforms: envUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide,
    depthWrite: false, depthTest: false, fog: false, toneMapped: false, defines: { ENV: 1 } });
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat));

  // ---- celestial bodies
  const bodies = [];
  const rts = [];
  const sphereGeo = new THREE.SphereGeometry(1, 32, 16);
  const dirFrom = (az, el) => { const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el); return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)); };
  const DIST = 900;
  (cfg.bodies || []).forEach((b, i) => {
    const rt = bakePlanet(renderer, b.type, b.c1, b.c2, b.c3, (cfg.seed || 1) + i * 7);
    rts.push(rt);
    const mu = { tMap: { value: rt.texture }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uAtmo: { value: D(b.atmo || '#000000') }, uTint: { value: new THREE.Color(1, 1, 1) },
      uAlpha: { value: 1 }, uAmbient: { value: b.ambient ?? 0.12 }, uGlow: { value: b.glow || 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: mu, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const m = new THREE.Mesh(sphereGeo, mat);
    const dir = b.moon ? new THREE.Vector3(0, 1, 0) : dirFrom(b.az, b.el);
    const rad = DIST * Math.tan(THREE.MathUtils.degToRad(b.size));
    m.scale.setScalar(rad); m.position.copy(dir).multiplyScalar(DIST);
    m.rotation.set(b.tilt || 0.3, i * 1.3, b.tilt2 || 0.1);
    m.renderOrder = -990 + i; m.frustumCulled = false;
    group.add(m);
    const entry = { def: b, mesh: m, mat, dir, rad, ring: null };
    if (b.ring) {
      const rg = new THREE.RingGeometry(rad * b.ring[0], rad * b.ring[1], 96, 1);
      // uv.x = radius in units of planet radius
      const pos = rg.attributes.position, uv = rg.attributes.uv;
      for (let k = 0; k < pos.count; k++) uv.setX(k, Math.hypot(pos.getX(k), pos.getY(k)) / rad);
      const ru = { uC1: { value: D(b.ringColor?.[0] || '#d8c8a8') }, uC2: { value: D(b.ringColor?.[1] || '#8a7a68') }, uSunDir: mu.uSunDir,
        uAlpha: { value: 1 }, uInner: { value: b.ring[0] }, uOuter: { value: b.ring[1] }, uSeed: { value: i * 3.7 } };
      const rmat = new THREE.ShaderMaterial({ uniforms: ru, vertexShader: BODY_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
      const ring = new THREE.Mesh(rg, rmat);
      ring.position.copy(m.position);
      ring.lookAt(0, 0, 0); ring.rotateX(b.ringTilt ?? 1.25); ring.rotateY(0.25);
      ring.renderOrder = -989 + i; ring.frustumCulled = false;
      group.add(ring);
      entry.ring = ring; entry.rmat = rmat;
    }
    bodies.push(entry);
  });

  function update(camera, time) {
    group.position.copy(camera.position);
    U.uTime.value = time;
  }
  function setState(p) {
    U.uZenith.value.copy(p.zenith); U.uHorizon.value.copy(p.horizon); U.uGlowCol.value.copy(p.glow); U.uSunCol.value.copy(p.sunDisk);
    U.uSunDir.value.copy(p.sunDir); U.uMoonDir.value.copy(p.moonDir); U.uFogOut.value.copy(p.fog);
    envUniforms.uFogOut.value.copy(p.fog);
    U.uGround.value.copy(p.ground); U.uCloudLit.value.copy(p.cloudLit); U.uCloudDark.value.copy(p.cloudDark);
    U.uStars.value = p.stars; U.uSunDisk.value = p.sunDiskAmt; U.uNight.value = p.night; U.uEnvScale.value = p.envScale;
    U.uAurora.value = (cfg.aurora ? 1 : 0) * p.night; U.uGlowAmt.value = p.glowAmt;
    for (const b of bodies) {
      b.mat.uniforms.uSunDir.value.copy(p.sunDir);
      if (b.def.moon) {
        const md = b.def.moonOffset ? p.moonDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), b.def.moonOffset).add(new THREE.Vector3(0, b.def.moonLift || 0, 0)).normalize() : p.moonDir;
        b.mesh.position.copy(md).multiplyScalar(DIST);
        // the moon is lit from the sun side: when the sun is below, light it from a fixed angle so it reads as a moon
        b.mat.uniforms.uSunDir.value.copy(p.sunDir.y < 0 ? md.clone().multiplyScalar(-0.2).add(new THREE.Vector3(0.6, 0.5, 0.2)).normalize() : p.sunDir);
        b.mesh.visible = md.y > -0.15;
      }
      const vis = b.def.moon ? THREE.MathUtils.lerp(0.35, 1, p.night) : THREE.MathUtils.lerp(b.def.dayAlpha ?? 0.5, 1, p.night);
      b.mat.uniforms.uAlpha.value = vis;
      if (b.rmat) b.rmat.uniforms.uAlpha.value = vis * 0.9;
    }
  }
  function dispose() {
    dome.geometry.dispose(); skyMat.dispose(); envMat.dispose(); envScene.children[0].geometry.dispose();
    sphereGeo.dispose(); rts.forEach((r) => r.dispose());
    bodies.forEach((b) => { b.mat.dispose(); if (b.ring) { b.ring.geometry.dispose(); b.rmat.dispose(); } });
  }
  return { group, uniforms: U, envScene, update, setState, dispose, bodies };
}

// ------------------------------------------------------------------ day / night palette
// Returns display-space colours + light settings for time t (0..1).
export function computeDaylight(t, sky) {
  const a = (t - 0.25) * Math.PI * 2;
  const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.86, Math.sin(a) * 0.42 + 0.18).normalize();
  const moonDir = new THREE.Vector3(-Math.cos(a) * 0.85, -Math.sin(a) * 0.8 + 0.1, -Math.sin(a) * 0.3 + 0.4).normalize();
  const e = sunDir.y;
  const B = sky.base; // precomputed display colours

  if (sky.alwaysNight) {
    // permanent moody twilight; moons drift slowly
    const md = new THREE.Vector3(Math.cos(a * 0.5) * 0.5, 0.62, Math.sin(a * 0.5) * 0.5 + 0.35).normalize();
    return {
      sunDir: md.clone(), moonDir: md, elev: -0.3, night: 1,
      zenith: B.zenith.clone(), horizon: B.horizon.clone(), glow: B.glowNight.clone(), sunDisk: B.zenith.clone(), sunDiskAmt: 0, glowAmt: 0.6,
      fog: B.fog.clone(), ground: B.groundNight.clone(), cloudLit: lerpC(B.horizon, B.zenith, 0.3).multiplyScalar(1.4), cloudDark: B.zenith.clone().multiplyScalar(0.8),
      stars: 0.85, envScale: sky.nightEnv ?? 2.6,
      light: { dir: md.clone(), color: B.moonLight.clone(), intensity: sky.moonIntensity ?? 0.9 },
      hemi: { sky: desat(lerpC(B.horizon, B.zenith, 0.4).multiplyScalar(1.6), 0.55), ground: desat(B.groundNight.clone(), 0.4), intensity: sky.nightHemi ?? 1.1 },
      exposure: sky.nightExposure ?? 1.15, fogDensity: sky.fogDensity,
    };
  }
  // keyframes by sun elevation
  const K = sky.keys;
  let i = 0; while (i < K.length - 2 && e > K[i + 1].e) i++;
  const k0 = K[i], k1 = K[i + 1];
  let f = (e - k0.e) / (k1.e - k0.e); f = Math.min(1, Math.max(0, f)); f = f * f * (3 - 2 * f);
  const L = (n) => lerpC(k0[n], k1[n], f);
  const N = (n) => k0[n] + (k1[n] - k0[n]) * f;
  const night = 1 - THREE.MathUtils.smoothstep(e, -0.22, -0.02);
  const sunUp = e > -0.035;
  const sunI = 2.7 * Math.pow(THREE.MathUtils.smoothstep(e, -0.035, 0.28), 0.85) * (sky.sunScale ?? 1);
  const moonI = (sky.moonIntensity ?? 0.55) * THREE.MathUtils.smoothstep(-e, 0.035, 0.2);
  return {
    sunDir, moonDir, elev: e, night,
    zenith: L('zenith'), horizon: L('horizon'), glow: L('glow'), sunDisk: L('sun'), sunDiskAmt: THREE.MathUtils.smoothstep(e, -0.04, 0.02), glowAmt: N('glowAmt'),
    fog: L('fog'), ground: L('ground'), cloudLit: L('cloudLit'), cloudDark: L('cloudDark'), stars: N('stars'), envScale: N('env'),
    light: sunUp ? { dir: sunDir.clone(), color: L('light'), intensity: sunI } : { dir: moonDir.clone(), color: B.moonLight.clone(), intensity: moonI },
    hemi: { sky: L('hemiSky'), ground: L('ground'), intensity: N('hemiI') },
    exposure: N('exposure'), fogDensity: sky.fogDensity * N('fogMul'),
  };
}

// Precompute palettes for a biome.
export function makeSkyPalette(biome, opts = {}) {
  const z = D(biome.sky.zenith), h = D(biome.sky.horizon), sun = D(biome.sky.sun), fog = D(biome.fog.color);
  if (opts.fogTint) fog.lerp(D(opts.fogTint[0]), opts.fogTint[1]);
  const gr = D(biome.ground.grass), dirt = D(biome.ground.dirt);
  const groundDay = lerpC(gr, dirt, 0.4).multiplyScalar(0.9);
  const nightZ = D(opts.nightZenith || '#03060f'), nightH = D(opts.nightHorizon || '#18243a');
  const moonLight = D(opts.moonColor || '#869ee6');
  const base = {
    zenith: z, horizon: h, fog, moonLight,
    glowNight: D(opts.nightGlow || biome.sky.sun), groundNight: lerpC(groundDay, nightH, 0.8).multiplyScalar(0.3),
  };
  const sunset = lerpC(h, D(opts.sunsetColor || '#ff8a4a'), 0.78);
  const sunsetZ = lerpC(z, D('#2a3a78'), 0.55);
  const twiH = D(opts.twilightHorizon || '#5a4a78'), twiZ = D('#101a3a');
  const key = (e, o) => Object.assign({ e }, o);
  const fogDay = fog;
  const keys = [
    key(-1.0, { zenith: nightZ, horizon: nightH, glow: D('#1a2440'), sun: D('#ff6a30'), fog: lerpC(nightH, fogDay, 0.08), ground: base.groundNight, cloudLit: D('#1c2638'), cloudDark: D('#0b0f18'), light: moonLight, hemiSky: D('#2a3a68'), hemiI: 0.9, exposure: 1.3, stars: 1, env: 2.0, glowAmt: 0.0, fogMul: 0.85 }),
    key(-0.2, { zenith: nightZ, horizon: nightH, glow: D('#2a2c50'), sun: D('#ff6a30'), fog: lerpC(nightH, fogDay, 0.08), ground: base.groundNight, cloudLit: D('#222c40'), cloudDark: D('#0c1019'), light: moonLight, hemiSky: D('#2a3a68'), hemiI: 0.9, exposure: 1.3, stars: 1, env: 2.0, glowAmt: 0.2, fogMul: 0.85 }),
    key(-0.07, { zenith: twiZ, horizon: twiH, glow: D('#ff7040'), sun: D('#ff5a20'), fog: lerpC(twiH, fogDay, 0.25), ground: lerpC(base.groundNight, groundDay, 0.3), cloudLit: D('#5a4060'), cloudDark: D('#1c1a2c'), light: D('#ff9a6a'), hemiSky: D('#4a4a78'), hemiI: 0.9, exposure: 1.15, stars: 0.5, env: 2.0, glowAmt: 0.8, fogMul: 0.9 }),
    key(0.0, { zenith: sunsetZ, horizon: sunset, glow: D('#ff8a40'), sun: D('#ff8040'), fog: lerpC(sunset, fogDay, 0.45), ground: lerpC(base.groundNight, groundDay, 0.6), cloudLit: D('#ffa070'), cloudDark: D('#5a4050'), light: D('#ff9a55'), hemiSky: lerpC(sunsetZ, sunset, 0.4), hemiI: 0.75, exposure: 1.05, stars: 0.0, env: 1.3, glowAmt: 1.0, fogMul: 1.0 }),
    key(0.12, { zenith: lerpC(z, sunsetZ, 0.35), horizon: lerpC(h, sunset, 0.45), glow: D('#ffb070'), sun: D('#ffd0a0'), fog: lerpC(fogDay, sunset, 0.25), ground: groundDay, cloudLit: D('#ffe0c0'), cloudDark: D('#8a7a80'), light: D('#ffbe7c'), hemiSky: lerpC(z, h, 0.5), hemiI: 0.62, exposure: 1.0, stars: 0, env: 1.05, glowAmt: 0.85, fogMul: 1.0 }),
    key(0.32, { zenith: z, horizon: h, glow: lerpC(sun, D('#ffffff'), 0.2), sun: D('#fffbf0'), fog: fogDay, ground: groundDay, cloudLit: D(opts.cloudLit || '#ffffff'), cloudDark: D(opts.cloudDark || '#a8b4c4'), light: sun, hemiSky: lerpC(z, h, 0.55), hemiI: 0.55, exposure: 1.0, stars: 0, env: 1.0, glowAmt: 0.7, fogMul: 1.0 }),
    key(1.01, { zenith: z, horizon: h, glow: lerpC(sun, D('#ffffff'), 0.2), sun: D('#fffbf0'), fog: fogDay, ground: groundDay, cloudLit: D(opts.cloudLit || '#ffffff'), cloudDark: D(opts.cloudDark || '#a8b4c4'), light: sun, hemiSky: lerpC(z, h, 0.55), hemiI: 0.55, exposure: 1.0, stars: 0, env: 1.0, glowAmt: 0.7, fogMul: 1.0 }),
  ];
  return { base, keys, alwaysNight: !!biome.alwaysNight, fogDensity: biome.fog.density, ...opts };
}
