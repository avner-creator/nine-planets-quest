// Small math + collision helpers shared by the game code.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angleDamp = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz); // yaw 0 faces +Z
export const fwdX = (yaw) => Math.sin(yaw);
export const fwdZ = (yaw) => Math.cos(yaw);
export const hexToInt = (h) => (typeof h === 'string' ? parseInt(h.replace('#', ''), 16) : (h | 0));
export const color = (h) => new THREE.Color(h);

export function fmt(n) { n = Math.floor(n); return n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n); }

// Spatial hash over the world's static colliders (circles + segments) so collision checks stay cheap.
export class ColliderGrid {
  constructor(colliders, cell = 8) {
    this.cell = cell;
    this.map = new Map();
    this.circles = (colliders && colliders.circles) || [];
    this.segments = (colliders && colliders.segments) || [];
    this.circles.forEach((c) => this._insert({ t: 0, c }, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r));
    this.segments.forEach((s) => this._insert({ t: 1, c: s },
      Math.min(s.x1, s.x2) - s.r, Math.min(s.z1, s.z2) - s.r, Math.max(s.x1, s.x2) + s.r, Math.max(s.z1, s.z2) + s.r));
    this._stamp = 0;
  }
  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  _insert(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const k = this._key(ix, iz);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(item);
      }
    }
  }
  // Push the point (pos.x,pos.z) with radius r out of every collider. Returns true when something was hit.
  resolve(pos, r) {
    const c = this.cell;
    let hit = false;
    const stamp = ++this._stamp;
    const ix0 = Math.floor((pos.x - r) / c), ix1 = Math.floor((pos.x + r) / c);
    const iz0 = Math.floor((pos.z - r) / c), iz1 = Math.floor((pos.z + r) / c);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const arr = this.map.get(this._key(ix, iz));
        if (!arr) continue;
        for (const it of arr) {
          if (it.s === stamp) continue;
          it.s = stamp;
          const o = it.c;
          let cx, cz, rr;
          if (it.t === 0) { cx = o.x; cz = o.z; rr = o.r; }
          else {
            const dx = o.x2 - o.x1, dz = o.z2 - o.z1;
            const L = dx * dx + dz * dz || 1e-6;
            const t = clamp(((pos.x - o.x1) * dx + (pos.z - o.z1) * dz) / L, 0, 1);
            cx = o.x1 + dx * t; cz = o.z1 + dz * t; rr = o.r;
          }
          const ddx = pos.x - cx, ddz = pos.z - cz;
          const d = Math.hypot(ddx, ddz);
          const min = r + rr;
          if (d < min) {
            hit = true;
            if (d < 1e-4) { pos.x += min; continue; }
            const push = (min - d) / d;
            pos.x += ddx * push; pos.z += ddz * push;
          }
        }
      }
    }
    return hit;
  }
}

// Seeded random for deterministic things.
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Project a world position to screen pixels. Returns null when behind the camera.
const _v = new THREE.Vector3();
export function toScreen(pos, camera, w, h, out = {}) {
  _v.copy(pos).project(camera);
  if (_v.z > 1) return null;
  out.x = (_v.x * 0.5 + 0.5) * w;
  out.y = (-_v.y * 0.5 + 0.5) * h;
  out.z = _v.z;
  return out;
}
