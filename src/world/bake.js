// GPU texture baking: procedural, tileable textures rendered once into render targets.
// Packed material textures: R,G = tangent-space normal xy, B = albedo luminance, A = variation id.
import * as THREE from 'three';

const VERT = /* glsl */`
in vec3 position; in vec2 uv; out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const GLSL_NOISE = /* glsl */`
uniform float uSeed; uniform sampler2D tRand;
vec4 rnd(vec2 p){ ivec2 q = ivec2(floor(p)) + ivec2(int(uSeed) * 17, int(uSeed) * 31); return texelFetch(tRand, q & 255, 0); }
vec2 hash22(vec2 p){ return rnd(p).xy; }
float hash12(vec2 p){ return rnd(p).z; }
float gnoise(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 g00 = hash22(mod(i, per))*2.0-1.0;
  vec2 g10 = hash22(mod(i+vec2(1.0,0.0), per))*2.0-1.0;
  vec2 g01 = hash22(mod(i+vec2(0.0,1.0), per))*2.0-1.0;
  vec2 g11 = hash22(mod(i+vec2(1.0,1.0), per))*2.0-1.0;
  float a = dot(g00, f), b = dot(g10, f-vec2(1.0,0.0)), c = dot(g01, f-vec2(0.0,1.0)), d = dot(g11, f-vec2(1.0));
  return 1.45 * mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p, vec2 per, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++){ if (i >= oct) break; s += a * gnoise(p, per); p = p * 2.0 + 0.37; per *= 2.0; a *= 0.5; }
  return s;
}
float ridgedf(vec2 p, vec2 per, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++){ if (i >= oct) break; float v = 1.0 - abs(gnoise(p, per)); s += a * v * v; p = p * 2.0 + 0.71; per *= 2.0; a *= 0.5; }
  return s;
}
vec3 voronoi(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p); float F1 = 8.0, F2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y)); vec2 c = mod(i + g, per); vec4 h = rnd(c);
    vec2 r = g + h.xy - f; float d = dot(r, r);
    if (d < F1){ F2 = F1; F1 = d; id = h.w; } else if (d < F2) F2 = d;
  }
  return vec3(sqrt(F1), sqrt(F2), id);
}`;

const HEIGHT_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform vec4 uP;
${GLSL_NOISE}
// periodic anisotropic strokes; a,b integer direction vectors
float strokes(vec2 uv, vec2 a, vec2 b, float A, float B){
  vec2 q = vec2(dot(uv, a) * A, dot(uv, b) * B);
  return gnoise(q, vec2(A * max(abs(a.x)+abs(a.y),1.0), B * max(abs(b.x)+abs(b.y),1.0)));
}
vec4 modeGrass(vec2 uv){
  float clump = fbm(uv*6.0, vec2(6.0), 4)*0.5+0.5;
  float s = 0.0;
  s = max(s, strokes(uv, vec2(1.,0.), vec2(0.,1.), 26., 120.));
  s = max(s, strokes(uv, vec2(1.,1.), vec2(1.,-1.), 20., 100.));
  s = max(s, strokes(uv, vec2(1.,-1.), vec2(1.,1.), 22., 96.));
  s = max(s, strokes(uv, vec2(0.,1.), vec2(1.,0.), 24., 110.));
  s = max(s, strokes(uv, vec2(2.,1.), vec2(1.,-2.), 12., 60.));
  float blades = smoothstep(0.05, 0.75, s);
  float h = blades * 0.7 + clump * 0.3;
  float l = 0.38 + 0.5 * blades * (0.6 + 0.4 * clump) + 0.12 * (fbm(uv*32.0, vec2(32.0), 3));
  return vec4(h, clamp(l, 0.0, 1.0), clump, 1.0);
}
vec4 modeDirt(vec2 uv){
  float base = fbm(uv*8.0, vec2(8.0), 5)*0.5+0.5;
  vec3 v = voronoi(uv*22.0, vec2(22.0));
  float pebble = smoothstep(0.42, 0.12, v.x) * step(0.45, v.z);
  vec3 v2 = voronoi(uv*55.0 + 3.1, vec2(55.0));
  float grit = smoothstep(0.35, 0.05, v2.x) * step(0.5, v2.z);
  float h = base * 0.5 + pebble * 0.45 + grit * 0.15;
  float l = 0.42 + base * 0.3 + pebble * (0.15 + 0.25 * v.z) + grit * 0.1 - smoothstep(0.1, 0.0, v.y - v.x) * 0.0;
  return vec4(h, clamp(l,0.,1.), v.z, 1.0);
}
vec4 modeRock(vec2 uv){
  vec2 w = vec2(fbm(uv*3.0, vec2(3.0), 3), fbm(uv*3.0+5.2, vec2(3.0), 3));
  float base = fbm(uv*5.0 + w*0.6, vec2(5.0), 6)*0.5+0.5;
  float rid = ridgedf(uv*4.0, vec2(4.0), 5);
  vec3 v = voronoi(uv*7.0 + w*0.4, vec2(7.0));
  float crack = smoothstep(0.0, 0.07, v.y - v.x);
  vec3 v2 = voronoi(uv*19.0, vec2(19.0));
  float crack2 = smoothstep(0.0, 0.05, v2.y - v2.x);
  float h = base * 0.55 + rid * 0.35 + 0.15 * v.z;
  h *= mix(0.55, 1.0, crack) * mix(0.85, 1.0, crack2);
  float l = 0.35 + 0.45 * base + 0.2 * rid - (1.0 - crack) * 0.25 - (1.0-crack2)*0.08;
  return vec4(h, clamp(l,0.,1.), v.z, 1.0);
}
vec4 modeSand(vec2 uv){
  float wv = fbm(uv*4.0, vec2(4.0), 3);
  float rip = sin((dot(uv, vec2(3.0, 1.0)) * 14.0 + wv * 1.6) * 6.2831853) * 0.5 + 0.5;
  rip = pow(rip, 1.6);
  float grain = hash12(floor(uv * 512.0));
  float f = fbm(uv*16.0, vec2(16.0), 4)*0.5+0.5;
  float h = rip * 0.35 + f * 0.4 + grain * 0.08;
  float l = 0.62 + 0.18 * f + 0.12 * grain + 0.06 * rip;
  return vec4(h, clamp(l,0.,1.), f, 1.0);
}
vec4 modeStoneWall(vec2 uv){
  float rows = 6.0; float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float off = hash12(vec2(r, 3.0)) * 0.5;
  float cols = 3.0; float x = uv.x * cols + off + r * 0.37; float c = floor(x); float fx = fract(x);
  float id = hash12(vec2(mod(c, cols), r));
  float jitter = (hash12(vec2(mod(c,cols), r + 9.0)) - 0.5) * 0.25;
  float ex = min(fx, 1.0 - fx) * 2.0 / cols * rows; float ey = min(fy, 1.0 - fy);
  float edge = min(ex * 0.9, ey);
  float bevel = smoothstep(0.0, 0.18 + jitter * 0.2, edge);
  float n = fbm(uv * 12.0, vec2(12.0), 5) * 0.5 + 0.5;
  float h = bevel * (0.7 + 0.3 * n) + (n - 0.5) * 0.1;
  float mortar = 1.0 - smoothstep(0.0, 0.04, edge);
  float l = mix(0.55 + 0.35 * n + (id - 0.5) * 0.25, 0.35, mortar);
  return vec4(h, clamp(l,0.,1.), id, 1.0);
}
vec4 modeCobble(vec2 uv){
  vec2 w = vec2(fbm(uv*4.0, vec2(4.0), 2), fbm(uv*4.0+3.3, vec2(4.0), 2)) * 0.25;
  vec3 v = voronoi(uv*9.0 + w, vec2(9.0));
  float e = v.y - v.x;
  float stone = smoothstep(0.0, 0.32, e);
  float n = fbm(uv*30.0, vec2(30.0), 3)*0.5+0.5;
  float h = sqrt(stone) * 0.85 + n * 0.12;
  float l = mix(0.3, 0.55 + 0.3 * n + (v.z - 0.5) * 0.3, smoothstep(0.0, 0.08, e));
  return vec4(h, clamp(l,0.,1.), v.z, 1.0);
}
vec4 modePlanks(vec2 uv){
  float n = 5.0; float x = uv.x * n; float c = floor(x); float fx = fract(x);
  float id = hash12(vec2(c, 1.7));
  float seg = floor(uv.y * 2.0 + id * 2.0);
  float id2 = hash12(vec2(c, seg));
  float grain = gnoise(vec2(x * 8.0 + gnoise(vec2(uv.y * 4.0, c), vec2(4.0, 5.0)) * 0.6, uv.y * 2.0), vec2(40.0, 2.0));
  float fine = gnoise(vec2(x * 40.0, uv.y * 3.0), vec2(200.0, 3.0));
  float gap = smoothstep(0.0, 0.035, min(fx, 1.0 - fx));
  float endGap = smoothstep(0.0, 0.01, min(fract(uv.y * 2.0 + id * 2.0), 1.0 - fract(uv.y * 2.0 + id * 2.0)));
  float h = gap * endGap * (0.8 + grain * 0.1 + fine * 0.05);
  float l = (0.5 + 0.18 * grain + 0.08 * fine + (id2 - 0.5) * 0.25) * mix(0.4, 1.0, gap * endGap);
  return vec4(h, clamp(l,0.,1.), id2, 1.0);
}
vec4 modeShingles(vec2 uv){
  float rows = 8.0; float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float cols = 6.0; float x = uv.x * cols + mod(r, 2.0) * 0.5; float c = floor(x); float fx = fract(x);
  float id = hash12(vec2(mod(c, cols), r));
  float round_ = 1.0 - pow(abs(fx - 0.5) * 2.0, 3.0) * 0.35;
  float lower = smoothstep(0.0, 0.08, fy) ;
  float side = smoothstep(0.0, 0.04, min(fx, 1.0 - fx));
  float n = fbm(uv * vec2(24.0, 48.0), vec2(24.0, 48.0), 3) * 0.5 + 0.5;
  float h = (fy * 0.6 + 0.4) * side * lower * round_ + n * 0.05;
  float l = (0.45 + (id - 0.5) * 0.3 + n * 0.2) * mix(0.35, 1.0, side * lower) * (0.75 + 0.25 * fy);
  return vec4(h, clamp(l,0.,1.), id, 1.0);
}
vec4 modeBark(vec2 uv){
  vec2 q = vec2(uv.x * 7.0, uv.y * 2.0);
  float w = fbm(uv * vec2(4.0, 1.0), vec2(4.0, 1.0), 3);
  float rid = ridgedf(vec2(q.x + w * 1.5, q.y), vec2(7.0, 2.0), 4);
  float fiss = smoothstep(0.15, 0.55, rid);
  float n = fbm(uv * vec2(20.0, 8.0), vec2(20.0, 8.0), 3) * 0.5 + 0.5;
  float h = fiss * 0.8 + n * 0.2;
  float l = 0.3 + 0.5 * fiss + 0.15 * n;
  return vec4(h, clamp(l,0.,1.), n, 1.0);
}
vec4 modeBirch(vec2 uv){
  float n = fbm(uv * vec2(6.0, 3.0), vec2(6.0, 3.0), 4) * 0.5 + 0.5;
  float dash = gnoise(vec2(uv.x * 6.0, uv.y * 40.0), vec2(6.0, 40.0));
  float marks = smoothstep(0.35, 0.55, dash) * smoothstep(0.3, 0.6, gnoise(vec2(uv.x*3.0, uv.y*5.0), vec2(3.0,5.0))*0.5+0.5);
  float patches = smoothstep(0.62, 0.72, fbm(uv * vec2(3.0, 2.0) + 4.0, vec2(3.0, 2.0), 4) * 0.5 + 0.5);
  float dark = max(marks, patches * 0.9);
  float l = mix(0.88 + 0.1 * n, 0.12, dark);
  float h = 1.0 - dark * 0.6 + n * 0.1;
  return vec4(h, clamp(l,0.,1.), dark, 1.0);
}
vec4 modePlaster(vec2 uv){
  float n = fbm(uv * 6.0, vec2(6.0), 5) * 0.5 + 0.5;
  float pits = smoothstep(0.85, 0.95, hash12(floor(uv * 256.0)));
  float h = n * 0.4 - pits * 0.1;
  float l = 0.78 + n * 0.16 - pits * 0.1;
  return vec4(h, clamp(l,0.,1.), n, 1.0);
}
vec4 modeIce(vec2 uv){
  vec3 v = voronoi(uv * 5.0, vec2(5.0));
  float crack = 1.0 - smoothstep(0.0, 0.025, v.y - v.x);
  vec3 v2 = voronoi(uv * 13.0 + 1.3, vec2(13.0));
  float crack2 = (1.0 - smoothstep(0.0, 0.02, v2.y - v2.x)) * step(0.5, hash12(floor(uv * 13.0)));
  float n = fbm(uv * 8.0, vec2(8.0), 4) * 0.5 + 0.5;
  float h = n * 0.3 - crack * 0.3 - crack2 * 0.15;
  float l = 0.55 + n * 0.2 + crack * 0.4 + crack2 * 0.2;
  return vec4(h, clamp(l,0.,1.), crack, 1.0);
}
vec4 modeLava(vec2 uv){
  vec2 w = vec2(fbm(uv*3.0, vec2(3.0), 3), fbm(uv*3.0+7.1, vec2(3.0), 3)) * 0.35;
  vec3 v = voronoi(uv * 6.0 + w, vec2(6.0));
  float e = v.y - v.x;
  float crack = 1.0 - smoothstep(0.0, 0.12, e);
  float n = fbm(uv * 14.0, vec2(14.0), 4) * 0.5 + 0.5;
  float h = smoothstep(0.0, 0.25, e) * 0.7 + n * 0.3;
  float l = 0.25 + 0.4 * n;
  return vec4(h, clamp(l,0.,1.), crack, 1.0);
}
vec4 modeMetal(vec2 uv){
  float n = fbm(uv * vec2(2.0, 60.0), vec2(2.0, 60.0), 3) * 0.5 + 0.5;
  float d = fbm(uv * 10.0, vec2(10.0), 4) * 0.5 + 0.5;
  return vec4(d * 0.3 + n * 0.1, 0.75 + n * 0.15 + d * 0.1, d, 1.0);
}
vec4 modeCloth(vec2 uv){
  vec2 q = uv * 96.0;
  float wx = sin(q.x * 3.14159) * 0.5 + 0.5, wy = sin(q.y * 3.14159) * 0.5 + 0.5;
  float checker = mod(floor(q.x) + floor(q.y), 2.0);
  float weave = mix(wx, wy, checker);
  float n = fbm(uv * 8.0, vec2(8.0), 4) * 0.5 + 0.5;
  return vec4(weave * 0.5 + n * 0.2, 0.7 + weave * 0.15 + n * 0.15, n, 1.0);
}
vec4 modeWater(vec2 uv){
  float h = 0.0;
  h += gnoise(vec2(dot(uv, vec2(3.0, 1.0)) * 3.0, dot(uv, vec2(-1.0, 3.0)) * 1.0), vec2(30.0, 10.0)) * 0.5;
  h += gnoise(vec2(dot(uv, vec2(1.0, -2.0)) * 4.0, dot(uv, vec2(2.0, 1.0)) * 2.0), vec2(12.0, 6.0)) * 0.35;
  h += fbm(uv * 8.0, vec2(8.0), 5) * 0.45;
  h += fbm(uv * 32.0, vec2(32.0), 3) * 0.08;
  return vec4(h * 0.5 + 0.5, 0.5, 0.5, 1.0);
}
vec4 modeMacro(vec2 uv){
  float a = fbm(uv * 4.0, vec2(4.0), 6) * 0.5 + 0.5;
  float b = fbm(uv * 8.0 + 11.0, vec2(8.0), 5) * 0.5 + 0.5;
  vec3 v = voronoi(uv * 10.0 + vec2(fbm(uv*5.0, vec2(5.0), 3), fbm(uv*5.0+2.0, vec2(5.0), 3)) * 0.6, vec2(10.0));
  float c = smoothstep(0.55, 0.15, v.x) * v.z;
  float d = fbm(uv * 16.0 + 5.0, vec2(16.0), 5) * 0.5 + 0.5;
  return vec4(a, b, c, d);
}
vec4 modeClouds(vec2 uv){
  float a = fbm(uv * 4.0, vec2(4.0), 7) * 0.5 + 0.5;
  vec3 v = voronoi(uv * 6.0, vec2(6.0));
  vec3 v2 = voronoi(uv * 13.0 + 2.7, vec2(13.0));
  float billow = (1.0 - v.x) * 0.65 + (1.0 - v2.x) * 0.35;
  float b = fbm(uv * 8.0 + 3.1, vec2(8.0), 6) * 0.5 + 0.5;
  float c = fbm(uv * 16.0 + 9.7, vec2(16.0), 4) * 0.5 + 0.5;
  return vec4(a, billow, b, c);
}
void main(){
  vec2 uv = vUv; vec4 r;
#if MODE == 0
  r = modeGrass(uv);
#elif MODE == 1
  r = modeDirt(uv);
#elif MODE == 2
  r = modeRock(uv);
#elif MODE == 3
  r = modeSand(uv);
#elif MODE == 4
  r = modeStoneWall(uv);
#elif MODE == 5
  r = modeCobble(uv);
#elif MODE == 6
  r = modePlanks(uv);
#elif MODE == 7
  r = modeShingles(uv);
#elif MODE == 8
  r = modeBark(uv);
#elif MODE == 9
  r = modeBirch(uv);
#elif MODE == 10
  r = modePlaster(uv);
#elif MODE == 11
  r = modeIce(uv);
#elif MODE == 12
  r = modeLava(uv);
#elif MODE == 13
  r = modeMetal(uv);
#elif MODE == 14
  r = modeCloth(uv);
#elif MODE == 15
  r = modeWater(uv);
#elif MODE == 16
  r = modeMacro(uv);
#else
  r = modeClouds(uv);
#endif
  outColor = r;
}`;

const PACK_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D tH; uniform vec2 uTexel; uniform float uStrength;
void main(){
  vec4 c = texture(tH, vUv);
  float hl = texture(tH, vUv - vec2(uTexel.x, 0.0)).r, hr = texture(tH, vUv + vec2(uTexel.x, 0.0)).r;
  float hd = texture(tH, vUv - vec2(0.0, uTexel.y)).r, hu = texture(tH, vUv + vec2(0.0, uTexel.y)).r;
  vec3 n = normalize(vec3((hl - hr) * uStrength, (hd - hu) * uStrength, 1.0));
  outColor = vec4(n.xy * 0.5 + 0.5, c.g, c.b);
}`;

const PLANET_FRAG = /* glsl */`
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform int uType; uniform vec3 uC1, uC2, uC3; uniform float uSeed; uniform sampler2D tRand;
vec4 r3(vec3 i){ ivec3 q = ivec3(i) + ivec3(int(uSeed) * 7); return texelFetch(tRand, ivec2(q.x + q.z * 57, q.y + q.z * 113) & 255, 0); }
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = r3(i).x, b = r3(i+vec3(1,0,0)).x, c = r3(i+vec3(0,1,0)).x, d = r3(i+vec3(1,1,0)).x;
  float e = r3(i+vec3(0,0,1)).x, g = r3(i+vec3(1,0,1)).x, h = r3(i+vec3(0,1,1)).x, k = r3(i+vec3(1,1,1)).x;
  return (mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y), mix(mix(e,g,u.x), mix(h,k,u.x), u.y), u.z) * 2.0 - 1.0) * 0.9;
}
float f3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n3(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
void main(){
  float lon = vUv.x * 6.2831853, lat = (vUv.y - 0.5) * 3.14159265;
  vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)) * 2.0 + 10.0;
  vec3 col;
  float h = f3(p * 1.4);
  if (uType == 0) {
    float b = sin((p.y + h * 0.3) * 16.0) * 0.5 + 0.5;
    float b2 = sin((p.y + h * 0.6) * 37.0) * 0.5 + 0.5;
    col = mix(uC1, uC2, b); col = mix(col, uC3, b2 * 0.3);
    col = mix(col, uC3 * 1.1, smoothstep(0.18, 0.0, length(vec2(lon - 2.0, (lat + 0.35) * 2.2))) * 0.8);
  } else if (uType == 1) {
    col = mix(uC1, uC2, smoothstep(-0.05, 0.1, h));
    col = mix(col, uC3, smoothstep(0.25, 0.45, h));
    col = mix(col, vec3(0.95), smoothstep(0.75, 0.92, abs(sin(lat))));
  } else if (uType == 2) {
    col = mix(uC1, uC2, smoothstep(-0.3, 0.3, h));
    vec3 q = p * 3.0; vec3 fr = fract(q) - 0.5; vec4 o = r3(floor(q));
    float d = length(fr - (o.xyz - 0.5) * 0.6), rr = 0.15 + o.w * 0.2;
    col *= 1.0 - 0.3 * smoothstep(rr, rr * 0.6, d) + 0.18 * smoothstep(rr * 1.15, rr, d) * smoothstep(rr * 0.9, rr, d);
  } else {
    col = mix(uC1, uC2, smoothstep(0.0, 0.25, abs(h)));
    col = mix(col, uC3, smoothstep(0.08, 0.0, abs(h)));
  }
  outColor = vec4(col, 1.0);
}`;

const MODE = { grass: 0, dirt: 1, rock: 2, sand: 3, stone: 4, cobble: 5, planks: 6, shingles: 7, bark: 8, birch: 9, plaster: 10, ice: 11, lava: 12, metal: 13, cloth: 14, water: 15, macro: 16, clouds: 17 };
const STRENGTH = { grass: 6, dirt: 7, rock: 10, sand: 4, stone: 9, cobble: 9, planks: 5, shingles: 8, bark: 9, birch: 3, plaster: 3, ice: 4, lava: 8, metal: 2, cloth: 2, water: 6 };
const SIZE = { grass: 1024, dirt: 1024, rock: 1024, sand: 1024, macro: 512, clouds: 512, water: 512 };

const caches = new WeakMap();

function makeRT(size, type, mip) {
  return new THREE.WebGLRenderTarget(size, size, {
    type, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    generateMipmaps: mip, minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  });
}

function randTexture() {
  const d = new Uint8Array(256 * 256 * 4);
  let s = 1234567;
  for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = s >>> 24; }
  const t = new THREE.DataTexture(d, 256, 256, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  return t;
}

function getBaker(renderer) {
  let c = caches.get(renderer);
  if (c) return c;
  const geo = new THREE.PlaneGeometry(2, 2);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tRand = randTexture();
  const pMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: PACK_FRAG,
    uniforms: { tH: { value: null }, uTexel: { value: new THREE.Vector2() }, uStrength: { value: 1 } }, depthTest: false, depthWrite: false });
  const plMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: PLANET_FRAG,
    uniforms: { uType: { value: 0 }, uSeed: { value: 0 }, tRand: { value: tRand }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() } }, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(geo, pMat);
  quad.frustumCulled = false;
  const canFloat = renderer.extensions.has('EXT_color_buffer_float');
  c = { geo, cam, tRand, modeMats: {}, pMat, plMat, quad, canFloat, textures: {}, rts: [] };
  caches.set(renderer, c);
  return c;
}
function modeMat(b, mode) {
  if (b.modeMats[mode]) return b.modeMats[mode];
  const m = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: HEIGHT_FRAG, defines: { MODE: mode },
    uniforms: { uSeed: { value: 0 }, tRand: { value: b.tRand }, uP: { value: new THREE.Vector4() } }, depthTest: false, depthWrite: false });
  b.modeMats[mode] = m;
  return m;
}

function renderTo(renderer, b, rt, mat) {
  const prev = renderer.getRenderTarget();
  const prevXR = renderer.xr.enabled; renderer.xr.enabled = false;
  b.quad.material = mat;
  renderer.setRenderTarget(rt);
  renderer.render(b.quad, b.cam);
  renderer.setRenderTarget(prev);
  renderer.xr.enabled = prevXR;
}

// Bake (or fetch from cache) a named texture.
export function bakeTexture(renderer, name, seed = 1) {
  const b = getBaker(renderer);
  const key = name + ':' + seed;
  if (b.textures[key]) return b.textures[key];
  const size = SIZE[name] || 512;
  const direct = name === 'macro' || name === 'clouds';
  const hMat = modeMat(b, MODE[name]);
  hMat.uniforms.uSeed.value = seed;
  let tex;
  if (direct) {
    const rt = makeRT(size, THREE.UnsignedByteType, true);
    renderTo(renderer, b, rt, hMat);
    b.rts.push(rt); tex = rt.texture;
  } else {
    const rtH = makeRT(size, b.canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType, false);
    renderTo(renderer, b, rtH, hMat);
    const rt = makeRT(size, THREE.UnsignedByteType, true);
    b.pMat.uniforms.tH.value = rtH.texture;
    b.pMat.uniforms.uTexel.value.set(1 / size, 1 / size);
    b.pMat.uniforms.uStrength.value = STRENGTH[name] * size / 512;
    renderTo(renderer, b, rt, b.pMat);
    rtH.dispose();
    b.rts.push(rt); tex = rt.texture;
  }
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.name = 'baked_' + name;
  b.textures[key] = tex;
  return tex;
}

// Planet surface (equirectangular, display colours). Caller owns & disposes the returned render target.
export function bakePlanet(renderer, type, c1, c2, c3, seed) {
  const b = getBaker(renderer);
  const rt = new THREE.WebGLRenderTarget(512, 256, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
  const u = b.plMat.uniforms;
  u.uType.value = { gas: 0, rocky: 1, moon: 2, lava: 3 }[type] ?? 1;
  u.uC1.value.set(c1); u.uC2.value.set(c2); u.uC3.value.set(c3); u.uSeed.value = seed;
  // colours are used raw in a display-space shader; undo three's sRGB->linear conversion
  u.uC1.value.convertLinearToSRGB(); u.uC2.value.convertLinearToSRGB(); u.uC3.value.convertLinearToSRGB();
  renderTo(renderer, b, rt, b.plMat);
  return rt;
}

// Free all cached baked textures for a renderer (optional; caches are reused between worlds).
export function disposeBakeCache(renderer) {
  const b = caches.get(renderer);
  if (!b) return;
  b.rts.forEach((rt) => rt.dispose());
  b.geo.dispose(); Object.values(b.modeMats).forEach((m) => m.dispose()); b.pMat.dispose(); b.plMat.dispose(); b.tRand.dispose();
  caches.delete(renderer);
}
