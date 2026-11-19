// Liquids: water (fresnel sky reflection, glint, depth tint, shoreline foam, river flow), lava, ice.
import * as THREE from 'three';
import { bakeTexture } from './bake.js';
import { GLSL_HEIGHT } from './terrain.js';
import { packedMaterial } from './materials.js';
import { D } from './sky.js';

export function fogUniforms() {
  return { fogDensity: { value: 0.00025 }, fogNear: { value: 1 }, fogFar: { value: 2000 }, fogColor: { value: new THREE.Color(0xffffff) } };
}

const WATER_VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vWPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tNormal, tAux, tMacro;
uniform vec3 uShallow, uDeep, uZenith, uHorizon, uSunDir, uSunCol, uFoam;
uniform float uTime, uLight, uClarity, uSpec, uRain;
varying vec3 vWPos;
${GLSL_HEIGHT}
vec2 nS(vec2 uv){ return texture2D(tNormal, uv).rg * 2.0 - 1.0; }
void main(){
  vec2 p = vWPos.xz;
  float dist = length(cameraPosition - vWPos);
  vec2 auxUv = (p + uHField.x) / (2.0 * uHField.x);
  vec2 flow = (texture2D(tAux, auxUv).gb * 2.0 - 1.0) * 1.2;
  vec2 n2 = nS(p * 0.045 + vec2(uTime * 0.011, uTime * 0.007)) * 0.55 + nS(p * 0.11 + vec2(-uTime * 0.012, uTime * 0.015)) * 0.35;
#ifndef WATER_LOW
  n2 += nS(p * 0.33 + vec2(uTime * 0.03, -uTime * 0.025)) * 0.22;
  float fl = length(flow);
  if (fl > 0.02) {
    float ph = uTime * 0.35; float f0 = fract(ph), f1 = fract(ph + 0.5);
    vec2 fa = nS(p * 0.16 - flow * f0 * 1.4), fb = nS(p * 0.16 + 0.5 - flow * f1 * 1.4);
    n2 = mix(n2, mix(fa, fb, abs(f0 - 0.5) * 2.0) * 1.2, smoothstep(0.02, 0.3, fl));
  }
  if (uRain > 0.0) {
    vec2 rc = floor(p * 1.3); vec2 rf = fract(p * 1.3) - 0.5;
    float rt = fract(uTime * 1.3 + fract(sin(dot(rc, vec2(12.9, 78.2))) * 437.5));
    float rr = length(rf) - rt * 0.5;
    n2 += normalize(rf + 1e-4) * sin(rr * 40.0) * (1.0 - rt) * smoothstep(0.1, 0.0, abs(rr)) * uRain * 0.6;
  }
#endif
  float calm = smoothstep(60.0, 500.0, dist);
  vec3 N = normalize(vec3(n2.x * (0.32 - 0.26 * calm), 1.0, n2.y * (0.32 - 0.26 * calm)));
  vec3 V = normalize(cameraPosition - vWPos);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uZenith, pow(R.y, 0.5));
  float depth = max(vWPos.y - terrainH(p), 0.0);
  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * uClarity)) * uLight;
  float alpha = 1.0 - exp(-depth * (uClarity * 1.6 + 0.35));
  vec3 col = mix(body, sky, fres * 0.9);
  alpha = max(alpha, fres);
  float sp = pow(max(dot(R, uSunDir), 0.0), 260.0) * uSpec;
  col += uSunCol * sp * 2.5; alpha = max(alpha, min(sp, 1.0));
  // shoreline foam
  float fm = texture2D(tMacro, p * 0.09 + vec2(uTime * 0.01, 0.0)).a;
  float band = sin(depth * 7.0 - uTime * 1.6 + fm * 6.0) * 0.5 + 0.5;
  float foam = (1.0 - smoothstep(0.0, 0.45, depth)) * smoothstep(0.5, 0.85, fm * 0.7 + band * 0.45);
  foam += (1.0 - smoothstep(0.0, 0.08, depth)) * 0.5;
  foam = clamp(foam, 0.0, 1.0) * (1.0 - calm);
  col = mix(col, uFoam * max(uLight, 0.08), foam * 0.8);
  alpha = max(alpha, foam * 0.9);
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  #include <fog_fragment>
}`;

const LAVA_FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tLava, tMacro, tAux;
uniform vec3 uHot, uMid, uCrust;
uniform float uTime;
varying vec3 vWPos;
${GLSL_HEIGHT}
void main(){
  vec2 p = vWPos.xz;
  vec2 auxUv = (p + uHField.x) / (2.0 * uHField.x);
  vec2 flow = (texture2D(tAux, auxUv).gb * 2.0 - 1.0) * 0.8 + vec2(0.05, 0.03);
  float ph = uTime * 0.08; float f0 = fract(ph), f1 = fract(ph + 0.5);
  vec4 a = texture2D(tLava, p * 0.045 - flow * f0 * 1.2);
  vec4 b = texture2D(tLava, p * 0.045 + 0.5 - flow * f1 * 1.2);
  vec4 l = mix(a, b, abs(f0 - 0.5) * 2.0);
  vec4 l2 = texture2D(tLava, p * 0.13 + vec2(uTime * 0.004, -uTime * 0.003));
  float heat = texture2D(tMacro, p * 0.006 + uTime * 0.002).r;
  float depth = max(vWPos.y - terrainH(p), 0.0);
  float crack = max(l.a, l2.a * 0.6);
  float molten = smoothstep(0.2, 0.62, crack * 0.85 + heat * 0.6 - 0.08 + smoothstep(0.2, 2.5, depth) * 0.35);
  float pulse = 0.85 + 0.15 * sin(uTime * 1.3 + heat * 9.0);
  vec3 crustC = uCrust * (0.5 + l.b * 0.9);
  vec3 glow = mix(uMid, uHot, crack * crack) * (0.7 + crack * 1.2) * pulse;
  vec3 col = mix(crustC + uMid * 0.12, glow, molten);
  col = mix(col, crustC * 0.6, (1.0 - smoothstep(0.0, 0.35, depth)) * 0.7);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

export function createLiquid(renderer, kind, opts) {
  const { level, color, hfTex, hField, auxTex, extent = 900, quality, biome } = opts;
  const macro = bakeTexture(renderer, 'macro');
  const geo = new THREE.PlaneGeometry(extent * 2, extent * 2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  let mat;
  if (kind === 'water') {
    const c = D(color);
    const shallow = c.clone().lerp(D(opts.shallow || '#8fe6dc'), opts.shallowMix ?? 0.45);
    const deep = c.clone().multiplyScalar(opts.deepMul ?? 0.45);
    mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogUniforms(), {
        tNormal: { value: bakeTexture(renderer, 'water') }, tAux: { value: auxTex }, tMacro: { value: macro }, tHeight: { value: hfTex },
        uHField: { value: hField }, uShallow: { value: shallow }, uDeep: { value: deep }, uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
        uFoam: { value: D('#f2f6f4') }, uTime: { value: 0 }, uLight: { value: 1 }, uClarity: { value: opts.clarity ?? 0.35 }, uSpec: { value: 1 }, uRain: { value: opts.rain ? 1 : 0 },
      }),
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: true, fog: true, toneMapped: false,
      defines: quality === 'high' ? {} : { WATER_LOW: 1 },
    });

    mat.uniforms.uHField.value = hField; mat.uniforms.tHeight.value = hfTex; mat.uniforms.tAux.value = auxTex;
  } else if (kind === 'lava') {
    mat = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogUniforms(), {
        tLava: { value: bakeTexture(renderer, 'lava') }, tMacro: { value: macro }, tAux: { value: auxTex }, tHeight: { value: hfTex }, uHField: { value: hField },
        uHot: { value: D('#ffe27a') }, uMid: { value: D(color || '#ff5a10') }, uCrust: { value: D('#2a1610') }, uTime: { value: 0 },
      }),
      vertexShader: WATER_VERT, fragmentShader: LAVA_FRAG, fog: true, toneMapped: false,
    });
    mat.uniforms.uHField.value = hField; mat.uniforms.tHeight.value = hfTex; mat.uniforms.tAux.value = auxTex;
  } else { // ice
    mat = packedMaterial(renderer, { tex: 'ice', color: new THREE.Color(color || '#a9d8f0'), roughness: 0.1, roughVar: -0.5, normalScale: 0.35, uvScale: 1, luma: [0.75, 1.25] });
    mat.envMapIntensity = 1.3;
    // planar world UVs
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 9, pos.getZ(i) / 9);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = level;
  mesh.name = 'liquid_' + kind;
  if (kind === 'ice') { mesh.receiveShadow = true; }
  mesh.renderOrder = kind === 'water' ? 1 : 0;
  return {
    mesh, mat, kind,
    update(time, p) {
      if (kind === 'water') {
        const u = mat.uniforms; u.uTime.value = time;
        if (p) {
          u.uZenith.value.copy(p.zenith); u.uHorizon.value.copy(p.horizon);
          u.uSunDir.value.copy(p.light.dir);
          u.uSunCol.value.copy(p.sunUp ? p.sunDisk : p.moonCol);
          u.uLight.value = p.waterLight; u.uSpec.value = p.sunUp ? 1 : 0.5;
        }
      } else if (kind === 'lava') mat.uniforms.uTime.value = time;
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// Extra lava surfaces (e.g. a volcano crater) sharing the lava look.
export function lavaDisc(liquid, x, y, z, r) {
  const g = new THREE.CircleGeometry(r, 40); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, liquid.mat); m.position.set(x, y, z);
  return m;
}
