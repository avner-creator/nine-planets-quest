// PBR materials driven by packed baked textures (normal.xy + luminance + variation).
import * as THREE from 'three';
import { bakeTexture } from './bake.js';

export const GLSL_TBN = /* glsl */`
mat3 pkTangentFrame(vec3 eye_pos, vec3 surf_norm, vec2 uv){
  vec3 q0 = dFdx(eye_pos.xyz), q1 = dFdy(eye_pos.xyz);
  vec2 st0 = dFdx(uv.st), st1 = dFdy(uv.st);
  vec3 N = surf_norm; vec3 q1perp = cross(q1, N), q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B)); float scale = (det == 0.0) ? 0.0 : inversesqrt(det);
  return mat3(T * scale, B * scale, N);
}`;

let matId = 0;
// opts: { tex (name), color, roughness, roughVar, metalness, normalScale, luma:[lo,hi], auxVar, uvScale, vertexColors,
//         emissive, emissiveIntensity, side, topColor, topAmt (cover on upward faces), wind (fn patch), glowAux }
export function packedMaterial(renderer, opts = {}) {
  const tex = bakeTexture(renderer, opts.tex || 'stone');
  const uniforms = {
    tPacked: { value: tex },
    uPk: { value: new THREE.Vector4(opts.luma?.[0] ?? 0.6, opts.luma?.[1] ?? 1.3, opts.auxVar ?? 0.25, opts.roughVar ?? 0.25) },
    uPkN: { value: new THREE.Vector2(opts.normalScale ?? 1, opts.uvScale ?? 1) },
    uTop: { value: new THREE.Color(opts.topColor || '#ffffff') }, uTopAmt: { value: opts.topAmt || 0 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0,
    vertexColors: !!opts.vertexColors, side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  mat.userData.uniforms = uniforms;
  const key = 'pk_' + (opts.instanced ? 'i' : '') + (opts.extraKey || '');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    if (opts.uniforms) Object.assign(sh.uniforms, opts.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPkUv; varying float vTopness; uniform vec2 uPkN;' + (opts.vertexPars || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (opts.vertexBegin || ''))
      .replace('#include <project_vertex>', `#include <project_vertex>
vPkUv = uv * uPkN.y;
{ vec3 wn = objectNormal;
#ifdef USE_INSTANCING
  wn = mat3(instanceMatrix) * wn;
#endif
  vTopness = normalize(mat3(modelMatrix) * wn).y; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tPacked; uniform vec4 uPk; uniform vec2 uPkN; uniform vec3 uTop; uniform float uTopAmt; varying vec2 vPkUv; varying float vTopness;\n' + GLSL_TBN + (opts.fragmentPars || ''))
      .replace('#include <map_fragment>', `
vec4 pk = texture2D(tPacked, vPkUv);
diffuseColor.rgb *= mix(uPk.x, uPk.y, pk.b) * (1.0 + (pk.a - 0.5) * uPk.z);
float pkTop = 0.0;
if (uTopAmt > 0.0) { pkTop = smoothstep(0.45, 0.8, vTopness + (pk.b - 0.5) * 0.5) * uTopAmt; }
` + (opts.mapExtra || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTop * mix(0.8, 1.1, pk.b), pkTop);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness + (0.5 - pk.b) * uPk.w + pkTop * 0.1, 0.02, 1.0);')
      .replace('#include <normal_fragment_maps>', `
{ vec2 nxy = (pk.rg * 2.0 - 1.0) * uPkN.x * (1.0 - pkTop * 0.6);
  mat3 tbnP = pkTangentFrame(-vViewPosition, normal, vPkUv);
  normal = normalize(tbnP * normalize(vec3(nxy, 1.0))); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (opts.emissiveExtra || ''));
    if (opts.patch) opts.patch(sh);
  };
  mat.name = 'pk_' + (opts.tex || 'stone') + '_' + (matId++);
  return mat;
}

// Standard structure material palette for a world. Tints come from vertex colours.
export function structureMaterials(renderer, quality) {
  const m = {
    stone: packedMaterial(renderer, { tex: 'stone', roughness: 0.88, vertexColors: true, uvScale: 1, normalScale: 1.2, luma: [0.55, 1.3] }),
    cobble: packedMaterial(renderer, { tex: 'cobble', roughness: 0.9, vertexColors: true, normalScale: 1.2, luma: [0.5, 1.35] }),
    rock: packedMaterial(renderer, { tex: 'rock', roughness: 0.9, vertexColors: true, normalScale: 1.3, luma: [0.55, 1.35] }),
    planks: packedMaterial(renderer, { tex: 'planks', roughness: 0.8, vertexColors: true, normalScale: 0.9, luma: [0.55, 1.35], auxVar: 0.35 }),
    wood: packedMaterial(renderer, { tex: 'bark', roughness: 0.85, vertexColors: true, normalScale: 0.6, luma: [0.7, 1.2] }),
    roof: packedMaterial(renderer, { tex: 'shingles', roughness: 0.8, vertexColors: true, normalScale: 1.3, luma: [0.55, 1.35], auxVar: 0.35 }),
    plaster: packedMaterial(renderer, { tex: 'plaster', roughness: 0.92, vertexColors: true, normalScale: 0.6, luma: [0.85, 1.12] }),
    metal: packedMaterial(renderer, { tex: 'metal', roughness: 0.38, metalness: 0.9, vertexColors: true, normalScale: 0.3, luma: [0.85, 1.1] }),
    gold: packedMaterial(renderer, { tex: 'metal', roughness: 0.25, metalness: 1.0, color: 0xffc84a, normalScale: 0.25, luma: [0.9, 1.1] }),
    cloth: packedMaterial(renderer, { tex: 'cloth', roughness: 0.95, vertexColors: true, normalScale: 0.5, luma: [0.8, 1.15], side: THREE.DoubleSide }),
    ice: packedMaterial(renderer, { tex: 'ice', roughness: 0.12, vertexColors: true, normalScale: 0.4, luma: [0.85, 1.2] }),
    marble: packedMaterial(renderer, { tex: 'plaster', roughness: 0.35, vertexColors: true, normalScale: 0.3, luma: [0.9, 1.08] }),
    obsidian: packedMaterial(renderer, { tex: 'rock', roughness: 0.18, vertexColors: true, normalScale: 0.7, luma: [0.7, 1.3] }),
    // emissive "glow" material: vertex colour = emissive colour; intensity driven by uniform (night lights)
    glow: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, emissive: 0xffffff, vertexColors: true }),
    window: new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.15, metalness: 0.1, emissive: 0xffb25a, emissiveIntensity: 0.0 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffe0a0, roughness: 0.4, emissive: 0xffc070, emissiveIntensity: 0.4 }),
    fireglow: new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false }),
  };
  // glow uses vertex colours as emission
  m.glow.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb * 3.0;\n#endif');
  };
  m.glow.customProgramCacheKey = () => 'glowvc';
  return m;
}
