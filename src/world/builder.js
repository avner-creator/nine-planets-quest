// Structure builder: collects primitive pieces per material (merged into one mesh each),
// walkable floors for heightAt, wall/post colliders and light emitters.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TILE = { stone: 2.2, cobble: 3.2, rock: 5, planks: 2.4, wood: 1.6, roof: 2.6, plaster: 3, metal: 1.5, gold: 1.5, cloth: 2, ice: 4, marble: 3, obsidian: 3, glow: 1, window: 1, lamp: 1, fireglow: 1 };

// ---------------------------------------------------------------- floors (walkable surfaces)
export class FloorSet {
  constructor() { this.list = []; this.buckets = new Map(); this.B = 16; }
  // rect in world space: centre, half sizes, yaw; y(lx, lz) gives height at local coords
  add(cx, cz, hx, hz, yaw, yfn) {
    const f = { cx, cz, hx, hz, c: Math.cos(yaw), s: Math.sin(yaw), y: yfn };
    this.list.push(f);
    const r = Math.hypot(hx, hz);
    const B = this.B;
    for (let i = Math.floor((cx - r) / B); i <= Math.floor((cx + r) / B); i++)
      for (let j = Math.floor((cz - r) / B); j <= Math.floor((cz + r) / B); j++) {
        const k = i * 100003 + j; let arr = this.buckets.get(k); if (!arr) this.buckets.set(k, (arr = [])); arr.push(f);
      }
    return f;
  }
  // highest floor at (x,z) or -Infinity
  at(x, z) {
    const arr = this.buckets.get(Math.floor(x / this.B) * 100003 + Math.floor(z / this.B));
    if (!arr) return -Infinity;
    let best = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i]; const dx = x - f.cx, dz = z - f.cz;
      const lx = f.c * dx - f.s * dz, lz = f.s * dx + f.c * dz;
      if (lx < -f.hx || lx > f.hx || lz < -f.hz || lz > f.hz) continue;
      const y = f.y(lx, lz); if (y > best) best = y;
    }
    return best;
  }
}

// ---------------------------------------------------------------- light pool
// A fixed number of point lights that follow the nearest light emitters (avoids shader recompiles).
export class LightPool {
  constructor(scene, n = 4) {
    this.lights = []; this.emitters = []; this.scene = scene; this.first = true;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 20, 2);
      l.castShadow = false; l.userData.cur = null; l.userData.w = 0;
      scene.add(l); this.lights.push(l);
    }
  }
  add(pos, color, intensity, range, opts = {}) {
    const e = { pos: pos.clone(), color: new THREE.Color(color), intensity, range, night: !!opts.night, flicker: !!opts.flicker, on: opts.on ?? true, phase: Math.random() * 10, pri: opts.pri ?? 1 };
    this.emitters.push(e); return e;
  }
  update(p, night, time, dt) {
    if (!p) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    const scored = [];
    for (const e of this.emitters) {
      if (!e.on) continue;
      const k = e.night ? night : 1; if (k < 0.02) continue;
      const d = e.pos.distanceTo(p);
      if (d > e.range * 2.6 + 25) continue;
      scored.push([d / (e.pri * Math.sqrt(e.intensity / 10 + 0.1)), e]);
    }
    scored.sort((a, b) => a[0] - b[0]);
    const want = new Set(scored.slice(0, this.lights.length).map((s) => s[1]));
    for (const l of this.lights) {
      const u = l.userData;
      if (u.cur && want.has(u.cur)) { want.delete(u.cur); u.w = Math.min(1, u.w + dt * 3); }
      else if (u.cur) { u.w -= dt * 4; if (u.w <= 0) { u.cur = null; u.w = 0; } }
    }
    for (const l of this.lights) {
      const u = l.userData;
      if (!u.cur && want.size) { const e = want.values().next().value; want.delete(e); u.cur = e; u.w = this.first ? 1 : 0; }
    }
    this.first = false;
    for (const l of this.lights) {
      const e = l.userData.cur;
      if (!e) { l.intensity = 0; continue; }
      const k = e.night ? night : 1;
      let fl = 1;
      if (e.flicker) fl = 0.82 + 0.12 * Math.sin(time * 9.1 + e.phase) + 0.08 * Math.sin(time * 23.7 + e.phase * 3);
      l.position.copy(e.pos); l.color.copy(e.color); l.distance = e.range;
      l.intensity = e.intensity * k * fl * l.userData.w * (e.on ? 1 : 0);
    }
  }
  dispose() { this.lights.forEach((l) => { this.scene.remove(l); l.dispose(); }); }
}

// ---------------------------------------------------------------- builder
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _n = new THREE.Vector3(), _v = new THREE.Vector3(), _nm = new THREE.Matrix3();

export class Builder {
  constructor(mats, floors, colliders, lights) {
    this.mats = mats; this.floors = floors; this.colliders = colliders; this.lights = lights;
    this.parts = {}; this.frame = { x: 0, y: 0, z: 0, yaw: 0 };
    this.cache = {};
  }
  at(x, y, z, yaw = 0, s = 1) { this.frame = { x, y, z, yaw, s }; return this; }
  // local -> world
  w(lx, lz) { const { x, z, yaw } = this.frame; const k = this.frame.s ?? 1; lx *= k; lz *= k; const c = Math.cos(yaw), s = Math.sin(yaw); return [x + c * lx + s * lz, z - s * lx + c * lz]; }
  wv(lx, ly, lz) { const [x, z] = this.w(lx, lz); return new THREE.Vector3(x, this.frame.y + ly * (this.frame.s ?? 1), z); }

  // generic: add geometry with local transform (position, rotation euler, scale)
  geo(mat, g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff, tile, keepUV = false, ownGeo = false } = {}) {
    const f = this.frame;
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
    const local = new THREE.Matrix4().compose(_p, _q, _s);
    const fs = f.s ?? 1;
    const world = new THREE.Matrix4().makeRotationY(f.yaw).scale(new THREE.Vector3(fs, fs, fs)).setPosition(f.x, f.y, f.z).multiply(local);
    let gg = ownGeo ? g : g.clone();
    if (gg.index === null) {
      const idx = []; for (let i = 0; i < gg.attributes.position.count; i++) idx.push(i); gg.setIndex(idx);
    }
    for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    gg.applyMatrix4(world);
    const pos = gg.attributes.position, nrm = gg.attributes.normal, uv = gg.attributes.uv;
    const t = tile ?? TILE[mat] ?? 2;
    if (!keepUV) for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      if (ny >= nx && ny >= nz) uv.setXY(i, px / t, pz / t);
      else if (nx >= nz) uv.setXY(i, pz / t, py / t);
      else uv.setXY(i, px / t, py / t);
    }
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (this.parts[mat] = this.parts[mat] || []).push(gg);
    return gg;
  }
  _cached(key, mk) { return this.cache[key] || (this.cache[key] = mk()); }
  box(mat, x, y, z, w, h, d, o = {}) { return this.geo(mat, this._cached('box', () => new THREE.BoxGeometry(1, 1, 1)), { x, y, z, sx: w, sy: h, sz: d, ...o }); }
  cyl(mat, x, y, z, r, h, o = {}) {
    const seg = o.seg ?? 12, rt = o.rTop ?? 1;
    const g = this._cached('cyl' + seg + '_' + rt, () => new THREE.CylinderGeometry(rt, 1, 1, seg, 1));
    return this.geo(mat, g, { x, y, z, sx: r, sy: h, sz: r, ...o });
  }
  cone(mat, x, y, z, r, h, o = {}) { const seg = o.seg ?? 12; return this.geo(mat, this._cached('cone' + seg, () => new THREE.ConeGeometry(1, 1, seg, 1)), { x, y, z, sx: r, sy: h, sz: r, ...o }); }
  sphere(mat, x, y, z, r, o = {}) { return this.geo(mat, this._cached('sph' + (o.seg || 12), () => new THREE.SphereGeometry(1, o.seg || 12, Math.max(6, (o.seg || 12) >> 1))), { x, y, z, sx: r, sy: o.sy ?? r, sz: r, ...o }); }
  torus(mat, x, y, z, R, r, o = {}) { const k = 'tor' + R + '_' + r + '_' + (o.arc ?? 6.283); return this.geo(mat, this._cached(k, () => new THREE.TorusGeometry(R, r, o.tseg ?? 10, o.rseg ?? 40, o.arc ?? Math.PI * 2)), { x, y, z, ...o }); }
  // triangular prism (gable): base width w along x, height h, depth d along z, apex at top centre
  prism(mat, x, y, z, w, h, d, o = {}) {
    const g = this._cached('prism', () => {
      const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
      const e = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); e.translate(0, 0, -0.5); return e;
    });
    return this.geo(mat, g, { x, y, z, sx: w, sy: h, sz: d, ...o });
  }

  // walkable floor in local frame (constant height above frame.y)
  floor(lx, lz, w, d, ly, yawOff = 0) {
    const k = this.frame.s ?? 1; const [x, z] = this.w(lx, lz); const y = this.frame.y + ly * k; w *= k; d *= k;
    this.floors.add(x, z, w / 2, d / 2, this.frame.yaw + yawOff, () => y);
  }
  // stair ramp: rises from y0 at local z = lz0 to y1 at lz1 (along local z), width w
  ramp(lx, lz0, lz1, w, y0, y1, steps = 0) {
    const k = this.frame.s ?? 1; const cz = (lz0 + lz1) / 2, hz = Math.abs(lz1 - lz0) / 2 * k; const [x, z] = this.w(lx, cz); w *= k; y0 *= k; y1 *= k;
    const fy = this.frame.y; const dir = Math.sign(lz1 - lz0);
    this.floors.add(x, z, w / 2, hz, this.frame.yaw, (ax, az) => {
      let t = (az * dir + hz) / (2 * hz);
      if (steps > 0) t = Math.min(1, Math.max(0, t + 0.5 / steps));
      return fy + y0 + (y1 - y0) * Math.min(1, Math.max(0, t));
    });
  }
  // stairs geometry + ramp floor. Steps go from local z0 (bottom) towards z1 (top).
  stairs(mat, lx, lz0, lz1, w, y0, y1, n, o = {}) {
    const dz = (lz1 - lz0) / n, dy = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const zc = lz0 + dz * (i + 0.5), top = y0 + dy * (i + 1);
      const bottom = o.solid ? Math.min(y0, 0) - 0.5 : top - dy - 0.15;
      this.box(mat, lx, (top + bottom) / 2, zc, w, top - bottom, Math.abs(dz) + 0.02, o);
    }
    this.ramp(lx, lz0, lz1, w, y0, y1, n);
  }
  wall(lx1, lz1, lx2, lz2, r = 0.3) {
    const [x1, z1] = this.w(lx1, lz1), [x2, z2] = this.w(lx2, lz2);
    const s = { x1, z1, x2, z2, r: Math.max(0.15, r * (this.frame.s ?? 1)) }; this.colliders.segments.push(s); return s;
  }
  post(lx, lz, r) { const [x, z] = this.w(lx, lz); const c = { x, z, r: r * (this.frame.s ?? 1) }; this.colliders.circles.push(c); return c; }
  light(lx, ly, lz, color, intensity, range, opts) { return this.lights.add(this.wv(lx, ly, lz), color, intensity, range, opts); }

  build(group) {
    const out = [];
    for (const [k, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) { console.warn('merge failed', k); continue; }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.mats[k]);
      mesh.castShadow = !['glow', 'window', 'lamp', 'fireglow'].includes(k);
      mesh.receiveShadow = true; mesh.name = 'struct_' + k;
      group.add(mesh); out.push(mesh);
    }
    this.parts = {};
    Object.values(this.cache).forEach((g) => g.dispose()); this.cache = {};
    return out;
  }
}
