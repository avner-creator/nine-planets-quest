// Visual effects: pooled particles, flash lights, ground decals / attack telegraphs, sword trail,
// timed meshes, projectiles and coin/loot pickups.
import * as THREE from 'three';
import { clamp, rand, lerp } from './util.js';

// ------------------------------------------------------------------ sprite atlas (2x2)
function makeAtlas() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S * 2;
  const g = c.getContext('2d');
  // 0: soft dot
  let grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // 1: sparkle star
  g.save(); g.translate(S * 1.5, S / 2);
  grd = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.22); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, S * 0.22, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -S * 0.48); g.lineTo(5, 0); g.closePath(); g.fill(); }
  g.restore();
  // 2: smoke puff
  g.save(); g.translate(S / 2, S * 1.5);
  for (let k = 0; k < 14; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * S * 0.18;
    grd = g.createRadialGradient(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * r, Math.sin(a) * r, S * 0.3);
    grd.addColorStop(0, 'rgba(255,255,255,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(-S / 2, -S / 2, S, S);
  }
  g.restore();
  // 3: ring
  g.save(); g.translate(S * 1.5, S * 1.5);
  grd = g.createRadialGradient(0, 0, S * 0.28, 0, 0, S * 0.48);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(-S / 2, -S / 2, S, S);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const SPRITE = { dot: 0, spark: 1, smoke: 2, ring: 3 };

class ParticleSystem {
  constructor(max, atlas, additive) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.spr = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSprite', new THREE.BufferAttribute(this.spr, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.uniforms = { uMap: { value: atlas }, uScale: { value: 600 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute vec4 aColor; attribute float aSize; attribute float aSprite;
        varying vec4 vColor; varying float vSprite; uniform float uScale;
        void main(){
          vColor = aColor; vSprite = aSprite;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 512.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec4 vColor; varying float vSprite;
        void main(){
          vec2 cell = vec2(mod(vSprite, 2.0), 1.0 - floor(vSprite / 2.0));
          vec2 uv = (vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) + cell) * 0.5;
          vec4 t = texture2D(uMap, uv);
          gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
          if (gl_FragColor.a < 0.003) discard;
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
    // simulation state
    const n = max;
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.rgb = new Float32Array(n * 3);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    this.alive = [];       // indices of live particles
    this.free = [];
    for (let i = n - 1; i >= 0; i--) this.free.push(i);
    this._c = new THREE.Color();
  }
  emit(o) {
    const count = o.count || 1;
    const cols = Array.isArray(o.color) ? o.color : [o.color || '#ffffff'];
    for (let k = 0; k < count; k++) {
      if (!this.free.length) {
        // recycle the oldest
        const old = this.alive.shift(); if (old === undefined) return; this.free.push(old);
      }
      const i = this.free.pop();
      this.alive.push(i);
      const sp = o.spread || 0;
      let ox = 0, oy = 0, oz = 0;
      if (sp) { ox = rand(-1, 1) * sp; oy = (o.flat ? 0 : rand(-1, 1)) * sp; oz = rand(-1, 1) * sp; }
      this.pos[i * 3] = o.pos.x + ox; this.pos[i * 3 + 1] = o.pos.y + oy; this.pos[i * 3 + 2] = o.pos.z + oz;
      const vs = o.velSpread || 0;
      const v = o.vel;
      let vx = v ? v.x : 0, vy = v ? v.y : 0, vz = v ? v.z : 0;
      if (o.radial) { const L = Math.hypot(ox, oy, oz) || 1; vx += ox / L * o.radial; vy += oy / L * o.radial; vz += oz / L * o.radial; }
      if (vs) { vx += rand(-1, 1) * vs; vy += rand(-1, 1) * vs; vz += rand(-1, 1) * vs; }
      if (o.up) vy += rand(o.up * 0.5, o.up);
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      const life = Array.isArray(o.life) ? rand(o.life[0], o.life[1]) : (o.life || 1);
      this.life[i] = life; this.maxLife[i] = life;
      const s = Array.isArray(o.size) ? rand(o.size[0], o.size[1]) : (o.size || 0.3);
      this.s0[i] = s; this.s1[i] = s * (o.sizeEnd !== undefined ? o.sizeEnd : 0.2);
      this.a0[i] = o.alpha !== undefined ? o.alpha : 1;
      this._c.set(cols[(Math.random() * cols.length) | 0]);
      this.rgb[i * 3] = this._c.r; this.rgb[i * 3 + 1] = this._c.g; this.rgb[i * 3 + 2] = this._c.b;
      this.grav[i] = o.gravity || 0; this.drag[i] = o.drag || 0;
      this.spr[i] = SPRITE[o.sprite || 'dot'] || 0;
    }
  }
  update(dt) {
    const A = this.alive;
    let w = 0;
    for (let r = 0; r < A.length; r++) {
      const i = A[r];
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.free.push(i); continue; }
      A[w++] = i;
      const dr = this.drag[i] ? Math.exp(-this.drag[i] * dt) : 1;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] *= dr; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    A.length = w;
    // pack live particles into the front of the draw buffers
    const P = this.pos, C = this.col, S = this.size, SP = this.spr;
    if (!this._pp) { this._pp = new Float32Array(this.max * 3); this._pc = new Float32Array(this.max * 4); this._ps = new Float32Array(this.max); this._psp = new Float32Array(this.max); }
    const pp = this._pp, pc = this._pc, ps = this._ps, psp = this._psp;
    for (let k = 0; k < w; k++) {
      const i = A[k];
      const t = 1 - this.life[i] / this.maxLife[i];
      pp[k * 3] = P[i * 3]; pp[k * 3 + 1] = P[i * 3 + 1]; pp[k * 3 + 2] = P[i * 3 + 2];
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      pc[k * 4] = this.rgb[i * 3]; pc[k * 4 + 1] = this.rgb[i * 3 + 1]; pc[k * 4 + 2] = this.rgb[i * 3 + 2]; pc[k * 4 + 3] = this.a0[i] * fade;
      ps[k] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      psp[k] = SP[i];
    }
    const g = this.geo;
    g.attributes.position.array.set(pp.subarray(0, w * 3)); g.attributes.position.needsUpdate = true;
    g.attributes.aColor.array.set(pc.subarray(0, w * 4)); g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.array.set(ps.subarray(0, w)); g.attributes.aSize.needsUpdate = true;
    g.attributes.aSprite.array.set(psp.subarray(0, w)); g.attributes.aSprite.needsUpdate = true;
    g.setDrawRange(0, w);
  }
  clear() { this.alive.forEach((i) => this.free.push(i)); this.alive.length = 0; this.geo.setDrawRange(0, 0); }
}

// We keep simulation arrays separate from the packed draw arrays: the geometry attributes hold the packed data.
// (ParticleSystem.pos etc. are the simulation arrays; we give the geometry its own copies.)
function fixParticleBuffers(ps) {
  const g = ps.geo;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ps.max * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(ps.max * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(ps.max), 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSprite', new THREE.BufferAttribute(new Float32Array(ps.max), 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
}

// ------------------------------------------------------------------ ground decals + telegraphs
const decalVS = `
  attribute float aU; attribute float aE; varying float vU; varying float vE;
  void main(){ vU = aU; vE = aE; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const decalFS = `
  uniform vec3 uColor; uniform float uProgress; uniform float uOpacity; uniform float uMode; uniform float uTime;
  varying float vU; varying float vE;
  void main(){
    float a;
    if (uMode < 0.5) {             // telegraph: faint area, bright border, fill grows to the edge
      float fill = 1.0 - smoothstep(uProgress - 0.02, uProgress, vU);
      float border = smoothstep(0.86, 0.97, vE);
      float pulse = 0.85 + 0.15 * sin(uTime * 14.0);
      a = (0.16 + 0.32 * fill + 0.75 * border) * pulse;
    } else if (uMode < 1.5) {      // soft glowing disc
      a = (1.0 - smoothstep(0.2, 1.0, vE)) * 0.8;
    } else {                       // ring
      a = smoothstep(0.55, 0.85, vE) * (1.0 - smoothstep(0.88, 1.0, vE)) * 1.4;
    }
    gl_FragColor = vec4(uColor, a * uOpacity);
  }`;

class GroundFx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.pool = [];
  }
  _mat(additive) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uProgress: { value: 0 }, uOpacity: { value: 1 }, uMode: { value: 0 }, uTime: { value: 0 } },
      vertexShader: decalVS, fragmentShader: decalFS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
  }
  // shape: 'circle' {radius} | 'cone' {radius, angle, yaw} | 'line' {length, width, yaw} (line starts at pos)
  spawn(world, o) {
    const geo = buildDecalGeo(world, o);
    let m = this.pool.pop();
    if (!m) { m = new THREE.Mesh(geo, this._mat(false)); m.frustumCulled = false; m.renderOrder = 5; }
    else { m.geometry.dispose(); m.geometry = geo; }
    const u = m.material.uniforms;
    u.uColor.value.set(o.color || '#ff3030');
    u.uMode.value = o.mode === 'glow' ? 1 : o.mode === 'ring' ? 2 : 0;
    u.uProgress.value = 0; u.uOpacity.value = 1;
    m.material.blending = o.mode && o.mode !== 'telegraph' ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.material.needsUpdate = true;
    this.scene.add(m);
    const it = { m, t: 0, dur: o.duration || 1, o, done: false };
    this.items.push(it);
    return it;
  }
  update(dt, time) {
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      it.t += dt;
      const p = clamp(it.t / it.dur, 0, 1);
      const u = it.m.material.uniforms;
      u.uTime.value = time;
      if (u.uMode.value === 0) { u.uProgress.value = p; u.uOpacity.value = 1; }
      else {
        const fadeIn = it.o.fadeIn || 0.1;
        u.uOpacity.value = (it.o.opacity || 1) * Math.min(1, it.t / fadeIn) * (1 - smooth01((p - 0.6) / 0.4));
        if (it.o.grow) it.m.scale.setScalar(1);
      }
      if (it.t >= it.dur || it.done) { this.release(it); this.items.splice(k, 1); }
    }
  }
  release(it) { this.scene.remove(it.m); this.pool.push(it.m); }
  clear() { this.items.forEach((it) => this.release(it)); this.items.length = 0; }
}
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

function buildDecalGeo(world, o) {
  const pos = [], aU = [], aE = [], idx = [];
  const lift = 0.12;
  const H = (x, z) => {
    let h = world ? world.heightAt(x, z) : 0;
    if (world && world.liquid && world.liquid.level > h) h = world.liquid.level;
    if (o.minY !== undefined) h = Math.max(h, o.minY);
    return h + lift;
  };
  const cx = o.pos.x, cz = o.pos.z;
  if (o.shape === 'line') {
    const L = o.length, W = o.width, yaw = o.yaw || 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const NA = Math.max(4, Math.ceil(L / 1.5)), NW = 4;
    for (let a = 0; a <= NA; a++) for (let w = 0; w <= NW; w++) {
      const along = a / NA * L, side = (w / NW - 0.5) * W;
      const x = cx + fx * along + rx * side, z = cz + fz * along + rz * side;
      pos.push(x, H(x, z), z);
      aU.push(a / NA);
      aE.push(Math.max(Math.abs(side) / (W / 2), Math.abs(a / NA * 2 - 1)));
    }
    for (let a = 0; a < NA; a++) for (let w = 0; w < NW; w++) {
      const i = a * (NW + 1) + w;
      idx.push(i, i + NW + 1, i + 1, i + 1, i + NW + 1, i + NW + 2);
    }
  } else {
    const R = o.radius, cone = o.shape === 'cone';
    const half = cone ? (o.angle || 1.5) / 2 : Math.PI;
    const yaw = o.yaw || 0;
    const NR = Math.max(6, Math.min(16, Math.ceil(R / 1.2))), NS = cone ? 20 : 40;
    pos.push(cx, H(cx, cz), cz); aU.push(0); aE.push(0);
    for (let r = 1; r <= NR; r++) for (let s = 0; s <= NS; s++) {
      const ang = yaw - half + (s / NS) * half * 2;
      const rr = r / NR * R;
      const x = cx + Math.sin(ang) * rr, z = cz + Math.cos(ang) * rr;
      pos.push(x, H(x, z), z);
      aU.push(r / NR);
      aE.push(cone ? Math.max(r / NR, Math.abs(s / NS * 2 - 1)) : r / NR);
    }
    for (let s = 0; s < NS; s++) idx.push(0, 1 + s + 1, 1 + s);
    for (let r = 1; r < NR; r++) for (let s = 0; s < NS; s++) {
      const a = 1 + (r - 1) * (NS + 1) + s, b = a + NS + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.setAttribute('aE', new THREE.Float32BufferAttribute(aE, 1));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ sword trail ribbon
class Trail {
  constructor(n = 14) {
    this.n = n;
    this.base = []; this.tip = []; this.age = [];
    const g = new THREE.BufferGeometry();
    this.posA = new Float32Array(n * 2 * 3);
    this.alphaA = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaA, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#ffffff') } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA); }',
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.active = false;
  }
  setColor(c) { this.mat.uniforms.uColor.value.set(c); }
  push(base, tip) {
    this.base.unshift(base.clone()); this.tip.unshift(tip.clone()); this.age.unshift(0);
    if (this.base.length > this.n) { this.base.pop(); this.tip.pop(); this.age.pop(); }
  }
  update(dt, emitting, base, tip) {
    for (let i = 0; i < this.age.length; i++) this.age[i] += dt;
    if (emitting && base && tip) this.push(base, tip);
    while (this.age.length && this.age[this.age.length - 1] > 0.18) { this.base.pop(); this.tip.pop(); this.age.pop(); }
    const m = this.base.length;
    this.mesh.visible = m >= 2;
    if (m < 2) return;
    for (let i = 0; i < this.n; i++) {
      const j = Math.min(i, m - 1);
      const b = this.base[j], t = this.tip[j];
      this.posA.set([b.x, b.y, b.z], i * 6); this.posA.set([t.x, t.y, t.z], i * 6 + 3);
      const a = i < m ? (1 - i / m) * (1 - this.age[j] / 0.18) * 0.65 : 0;
      this.alphaA[i * 2] = a * 0.1; this.alphaA[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }
  clear() { this.base.length = this.tip.length = this.age.length = 0; this.mesh.visible = false; }
}

// ------------------------------------------------------------------ main FX hub
export class FX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'fx';
    scene.add(this.group);
    const q = game.settings.quality;
    this.atlas = makeAtlas();
    this.add = new ParticleSystem(q === 'high' ? 3000 : 1500, this.atlas, true);
    this.norm = new ParticleSystem(q === 'high' ? 1200 : 600, this.atlas, false);
    fixParticleBuffers(this.add); fixParticleBuffers(this.norm);
    this.group.add(this.add.points, this.norm.points);
    this.ground = new GroundFx(this.group);
    this.trail = new Trail(14);
    this.group.add(this.trail.mesh);
    // light pool: fixed count so materials never recompile
    this.lights = [];
    const nL = q === 'high' ? 4 : 2;
    for (let i = 0; i < nL; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 12, 2);
      L.userData = { t: 0, dur: 0, peak: 0, follow: null, held: false };
      this.group.add(L); this.lights.push(L);
    }
    this.timed = [];
    this.projectiles = [];
    this.spriteMats = new Map();
    this.spritePool = [];
    this._v = new THREE.Vector3();
    this.initPickups();
  }

  resize(h, fov) {
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    this.add.uniforms.uScale.value = s; this.norm.uniforms.uScale.value = s;
  }

  // ---------------- particles
  burst(o) { (o.blend === 'normal' ? this.norm : this.add).emit(o); }
  sparkles(pos, color = '#fff6b0', count = 30, power = 4) {
    this.add.emit({ pos, count, spread: 0.4, radial: power, velSpread: power * 0.4, up: power * 0.6, gravity: 4, drag: 2, life: [0.5, 1.1], size: [0.15, 0.35], color: [color, '#ffffff'], sprite: 'spark' });
    this.add.emit({ pos, count: Math.ceil(count / 3), spread: 0.3, velSpread: 1, life: [0.25, 0.5], size: [0.8, 1.4], sizeEnd: 1.6, alpha: 0.5, color, sprite: 'dot' });
  }
  hitSparks(pos, color = '#ffe9a8', strong = false) {
    this.add.emit({ pos, count: strong ? 18 : 10, spread: 0.1, velSpread: strong ? 7 : 5, up: 2, gravity: 12, drag: 3, life: [0.15, 0.4], size: [0.06, 0.14], color: [color, '#ffffff'], sprite: 'spark' });
    this.add.emit({ pos, count: 1, life: 0.12, size: strong ? 1.6 : 1.0, sizeEnd: 1.8, alpha: 0.9, color: '#ffffff', sprite: 'dot' });
  }
  dust(pos, color = '#b8a890', count = 8, size = 0.8) {
    this.norm.emit({ pos, count, spread: 0.6, flat: true, velSpread: 1.2, up: 1, drag: 2, life: [0.6, 1.2], size: [size * 0.6, size], sizeEnd: 2, alpha: 0.4, color, sprite: 'smoke' });
  }
  ring(pos, color, radius = 4, life = 0.5) {
    this.add.emit({ pos, count: 1, life, size: 0.5, sizeEnd: radius * 2 / 0.5 * 1.0, alpha: 0.9, color, sprite: 'ring' });
  }

  // ---------------- lights
  flash(pos, color, intensity = 30, distance = 12, duration = 0.4) {
    let L = this.lights.find((l) => !l.userData.held && l.userData.t >= l.userData.dur);
    if (!L) L = this.lights.filter((l) => !l.userData.held).sort((a, b) => (a.userData.dur - a.userData.t) - (b.userData.dur - b.userData.t))[0];
    if (!L) return;
    L.position.copy(pos); L.color.set(color); L.distance = distance;
    L.userData.t = 0; L.userData.dur = duration; L.userData.peak = intensity;
    L.intensity = intensity;
  }
  holdLight(color, intensity, distance) {
    const L = this.lights.find((l) => !l.userData.held && l.userData.t >= l.userData.dur) || this.lights.find((l) => !l.userData.held);
    if (!L) return null;
    L.userData.held = true; L.color.set(color); L.intensity = intensity; L.distance = distance;
    return L;
  }
  releaseLight(L) { if (L) { L.userData.held = false; L.userData.t = L.userData.dur = 0; L.intensity = 0; } }

  // ---------------- timed meshes (any Object3D with an update)
  timedMesh(obj, dur, update, onEnd) {
    this.group.add(obj);
    this.timed.push({ obj, t: 0, dur, update, onEnd });
  }

  sprite(color, size) {
    let s = this.spritePool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.atlas, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      // use only the soft-dot cell of the atlas
      s.material.map = this.dotTex || (this.dotTex = (() => { const t = this.atlas.clone(); t.repeat.set(0.5, 0.5); t.offset.set(0, 0.5); t.needsUpdate = true; return t; })());
    }
    s.material.color.set(color);
    s.material.opacity = 1;
    s.scale.setScalar(size);
    s.visible = true;
    this.group.add(s);
    return s;
  }
  freeSprite(s) { this.group.remove(s); this.spritePool.push(s); }

  // ---------------- projectiles
  // o: { pos, vel, color, size, life, gravity, trail, light, hit(p) => bool, onHit(p), onUpdate(p,dt) }
  projectile(o) {
    const p = { ...o, pos: o.pos.clone(), vel: o.vel.clone(), t: 0, dead: false };
    p.spr = o.noSprite ? null : this.sprite(o.color, o.size || 0.8);
    if (o.mesh) { this.group.add(o.mesh); o.mesh.position.copy(p.pos); }
    if (p.spr) p.spr.position.copy(p.pos);
    if (o.light) p.L = this.holdLight(o.color, o.light, 10);
    this.projectiles.push(p);
    return p;
  }

  // ---------------- pickups (coins + loot)
  initPickups() {
    const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16).rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({ color: '#ffcc33', metalness: 1, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.6 });
    this.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, 200);
    this.coinMesh.count = 0; this.coinMesh.frustumCulled = false;
    const lootGeo = new THREE.OctahedronGeometry(0.28, 0);
    const lootMat = new THREE.MeshStandardMaterial({ color: '#c58bff', metalness: 0.3, roughness: 0.2, emissive: '#7a3acc', emissiveIntensity: 0.9 });
    this.lootMesh = new THREE.InstancedMesh(lootGeo, lootMat, 40);
    this.lootMesh.count = 0; this.lootMesh.frustumCulled = false;
    this.group.add(this.coinMesh, this.lootMesh);
    this.pickups = [];
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1); this._e = new THREE.Euler();
  }
  dropCoins(pos, total, loot) {
    const n = Math.min(12, Math.max(1, Math.ceil(total / 5)));
    let left = total;
    for (let i = 0; i < n && this.pickups.length < 230; i++) {
      const v = i === n - 1 ? left : Math.max(1, Math.floor(total / n));
      left -= v;
      this.pickups.push({ type: 'coin', value: v, pos: pos.clone().add(new THREE.Vector3(0, 0.6, 0)), vel: new THREE.Vector3(rand(-3, 3), rand(4, 7), rand(-3, 3)), t: 0, spin: rand(0, 6) });
    }
    if (loot) this.pickups.push({ type: 'loot', loot, pos: pos.clone().add(new THREE.Vector3(0, 0.8, 0)), vel: new THREE.Vector3(rand(-2, 2), 6, rand(-2, 2)), t: 0, spin: 0 });
  }
  // a big glowing PORTAL KEY dropped by a key guardian (walk up to it to pick it up)
  dropKey(pos, keyFor, color) {
    this.pickups.push({ type: 'key', keyFor, color, pos: pos.clone().add(new THREE.Vector3(0, 1.5, 0)), vel: new THREE.Vector3(0, 7, 0), t: 0, spin: 0 });
  }
  keyMesh(color) {
    if (!this.keyGeo) {
      const parts = [];
      parts.push(new THREE.TorusGeometry(0.42, 0.11, 10, 24).translate(0, 0.85, 0));
      parts.push(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 10).translate(0, 0, 0));
      parts.push(new THREE.BoxGeometry(0.34, 0.12, 0.1).translate(0.17, -0.42, 0));
      parts.push(new THREE.BoxGeometry(0.24, 0.12, 0.1).translate(0.12, -0.2, 0));
      this.keyParts = parts;
      this.keyMat = new THREE.MeshStandardMaterial({ color: '#ffd34a', metalness: 1, roughness: 0.2, emissive: '#a07000', emissiveIntensity: 0.8 });
    }
    const grp = new THREE.Group();
    this.keyParts.forEach((geo) => { const m = new THREE.Mesh(geo, this.keyMat); m.castShadow = true; grp.add(m); });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, roughness: 0.1 }));
    gem.position.y = 0.85; grp.add(gem);
    grp.scale.setScalar(1.3);
    return grp;
  }
  updateKey(p, dt) {
    if (!p.mesh) { p.mesh = this.keyMesh(p.color); this.group.add(p.mesh); p.glow = this.sprite(p.color, 3.2); }
    const bob = Math.sin(p.t * 2.5) * 0.25;
    p.mesh.position.set(p.pos.x, p.pos.y + 0.8 + bob, p.pos.z);
    p.mesh.rotation.y += dt * 1.8;
    p.glow.position.copy(p.mesh.position);
    p.glow.material.opacity = 0.6 + Math.sin(p.t * 5) * 0.25;
    if (Math.random() < dt * 12) this.add.emit({ pos: p.mesh.position, count: 1, spread: 0.6, up: 1.2, life: [0.6, 1.0], size: [0.15, 0.3], color: [p.color, '#ffd34a', '#ffffff'], sprite: 'spark' });
  }
  updatePickups(dt, world, players, onCollect) {
    const near = (pk) => { let best = players[0], bd = Infinity; for (const q of players) { if (q.dead) continue; const d = q.pos.distanceTo(pk.pos); if (d < bd) { bd = d; best = q; } } return best; };
    let nc = 0, nl = 0;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt; p.spin += dt * 4;
      const player = near(p);
      const pp = player.pos;
      p.who = player;
      const dx = pp.x - p.pos.x, dy = pp.y + 0.9 - p.pos.y, dz = pp.z - p.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (p.t > 0.45 && d < (p.type === 'key' ? 3.5 : 6) && !player.dead) {
        p.magnet = true;
      }
      if (p.magnet) {
        const sp = 6 + p.t * 10;
        p.pos.x += dx / d * Math.min(d, sp * dt); p.pos.y += dy / d * Math.min(d, sp * dt); p.pos.z += dz / d * Math.min(d, sp * dt);
        if (d < 0.7) { if (p.mesh) { this.group.remove(p.mesh); this.freeSprite(p.glow); } onCollect(p); this.pickups.splice(i, 1); continue; }
      } else {
        p.vel.y -= 18 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const gh = (world ? Math.max(world.heightAt(p.pos.x, p.pos.z), world.liquid && world.liquid.type !== 'lava' ? world.liquid.level : -999) : 0) + 0.3;
        if (p.pos.y < gh) { p.pos.y = gh; p.vel.set(p.vel.x * 0.4, Math.abs(p.vel.y) > 3 ? -p.vel.y * 0.3 : 0, p.vel.z * 0.4); }
      }
      if (p.t > 90 && p.type !== 'key') { this.pickups.splice(i, 1); continue; }
      if (p.type === 'key') { this.updateKey(p, dt); continue; }
      const bob = p.magnet ? 0 : Math.sin(p.t * 3 + p.spin) * 0.08;
      this._e.set(p.type === 'coin' ? 0 : p.spin, p.spin, 0);
      this._q.setFromEuler(this._e);
      this._m4.compose(this._v.set(p.pos.x, p.pos.y + bob, p.pos.z), this._q, this._s);
      if (p.type === 'coin' && nc < 200) this.coinMesh.setMatrixAt(nc++, this._m4);
      else if (p.type === 'loot' && nl < 40) this.lootMesh.setMatrixAt(nl++, this._m4);
    }
    this.coinMesh.count = nc; this.lootMesh.count = nl;
    this.coinMesh.instanceMatrix.needsUpdate = true; this.lootMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------- main update
  update(dt, time) {
    this.add.update(dt); this.norm.update(dt);
    this.ground.update(dt, time);
    for (const L of this.lights) {
      const u = L.userData;
      if (u.held) continue;
      if (u.t < u.dur) { u.t += dt; const k = clamp(u.t / u.dur, 0, 1); L.intensity = u.peak * (1 - k) * (1 - k); }
      else L.intensity = 0;
    }
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const it = this.timed[i];
      it.t += dt;
      const k = clamp(it.t / it.dur, 0, 1);
      if (it.update) it.update(it.obj, k, dt);
      if (it.t >= it.dur) { this.group.remove(it.obj); if (it.onEnd) it.onEnd(it.obj); this.timed.splice(i, 1); }
    }
    const world = this.game.world;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.gravity) p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.spr) { p.spr.position.copy(p.pos); p.spr.material.opacity = 0.8 + Math.sin(p.t * 30) * 0.2; }
      if (p.mesh) { p.mesh.position.copy(p.pos); if (p.spin) { p.mesh.rotation.x += p.t * 0.2; p.mesh.rotation.z += 0.15; } else p.mesh.lookAt(this._v.copy(p.pos).add(p.vel)); }

      if (p.L) p.L.position.copy(p.pos);
      if (p.trail) this.add.emit({ pos: p.pos, count: p.trail.count || 2, spread: (p.size || 0.8) * 0.25, velSpread: 0.5, life: p.trail.life || [0.2, 0.45], size: p.trail.size || [0.3, 0.6], sizeEnd: 0.1, color: p.trail.color || p.color, sprite: 'dot', alpha: 0.8 });
      if (p.onUpdate) p.onUpdate(p, dt);
      let hit = false;
      const gh = world ? world.heightAt(p.pos.x, p.pos.z) : -999;
      if (p.pos.y < gh + 0.1 && !(p.groundGrace > p.t)) hit = 'ground';   // groundGrace: ignore hills right after launch
      else if (p.hit && p.hit(p)) hit = 'target';
      if (hit || p.t > (p.life || 3) || p.dead) {
        if (hit && p.onHit) p.onHit(p, hit);
        if (p.spr) this.freeSprite(p.spr); if (p.mesh) this.group.remove(p.mesh); this.releaseLight(p.L);
        this.projectiles.splice(i, 1);
      }
    }
    if (this.game.players && this.game.players.length) this.updatePickups(dt, world, this.game.players, (p) => this.game.collectPickup(p, p.who));
  }

  clearWorld() {
    this.add.clear(); this.norm.clear(); this.ground.clear(); this.trail.clear();
    this.timed.forEach((it) => { this.group.remove(it.obj); if (it.onEnd) it.onEnd(it.obj); });
    this.timed.length = 0;
    this.projectiles.forEach((p) => { if (p.spr) this.freeSprite(p.spr); if (p.mesh) this.group.remove(p.mesh); this.releaseLight(p.L); });
    this.projectiles.length = 0;
    this.pickups.forEach((p) => { if (p.mesh) { this.group.remove(p.mesh); this.freeSprite(p.glow); } });
    this.pickups.length = 0; this.coinMesh.count = 0; this.lootMesh.count = 0;
    this.lights.forEach((L) => { L.userData.held = false; L.userData.t = L.userData.dur = 0; L.intensity = 0; });
  }
}

export { lerp };
