// Creative mode building blocks: one InstancedMesh per block type, 1 m grid, solid for the player.
import * as THREE from 'three';
import { BLOCKS } from '../data.js';
import { mulberry } from './util.js';

function tex(def, face) {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry(def.id.length * 977 + (face === 'top' ? 13 : face === 'bottom' ? 29 : 0));
  const base = face === 'top' && def.top ? def.top : def.color;
  const col = new THREE.Color(base);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  const speck = (n, amt, size = 2) => {
    for (let i = 0; i < n; i++) {
      const k = (rnd() - 0.5) * amt;
      const cc = col.clone().offsetHSL(0, 0, k);
      g.fillStyle = `#${cc.getHexString()}`;
      g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), size, size);
    }
  };
  const line = (x1, y1, x2, y2, color, w = 2) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  switch (def.id) {
    case 'grass':
      if (face === 'top') speck(500, 0.18, 2);
      else if (face === 'bottom') { g.fillStyle = '#6b4a2f'; g.fillRect(0, 0, S, S); col.set('#6b4a2f'); speck(300, 0.15); }
      else {
        g.fillStyle = '#6b4a2f'; g.fillRect(0, 0, S, S); col.set('#6b4a2f'); speck(300, 0.15);
        g.fillStyle = def.top; g.fillRect(0, 0, S, 14);
        for (let x = 0; x < S; x += 3) g.fillRect(x, 14, 3, Math.floor(rnd() * 8));
      }
      break;
    case 'log':
      if (face === 'top' || face === 'bottom') {
        g.fillStyle = def.top; g.fillRect(0, 0, S, S);
        for (let r = 4; r < 32; r += 5) { g.strokeStyle = 'rgba(90,60,30,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke(); }
        g.strokeStyle = def.color; g.lineWidth = 5; g.strokeRect(2, 2, S - 4, S - 4);
      } else { speck(200, 0.12, 2); for (let x = 2; x < S; x += 7 + Math.floor(rnd() * 4)) line(x, 0, x + rnd() * 3 - 1.5, S, 'rgba(30,18,8,0.45)', 2); }
      break;
    case 'planks':
      speck(250, 0.1, 2);
      for (let y = 0; y <= S; y += 16) line(0, y, S, y, 'rgba(60,35,15,0.7)', 2);
      for (let y = 0; y < S; y += 16) { const x = Math.floor(rnd() * S); line(x, y, x, y + 16, 'rgba(60,35,15,0.6)', 2); }
      break;
    case 'brick':
      g.fillStyle = '#c9c0b0'; g.fillRect(0, 0, S, S);
      for (let row = 0; row < 4; row++) for (let k = -1; k < 3; k++) {
        const x = k * 32 + (row % 2) * 16 + 1, y = row * 16 + 1;
        const cc = col.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.12);
        g.fillStyle = `#${cc.getHexString()}`; g.fillRect(x, y, 30, 14);
      }
      break;
    case 'cobble':
      g.fillStyle = '#4a4a46'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 16; i++) {
        const cc = col.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.2);
        g.fillStyle = `#${cc.getHexString()}`; g.beginPath();
        g.ellipse((i % 4) * 16 + 8 + rnd() * 4 - 2, Math.floor(i / 4) * 16 + 8 + rnd() * 4 - 2, 7 + rnd() * 2, 6 + rnd() * 2, rnd() * 3, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'glass':
      g.clearRect(0, 0, S, S); g.fillStyle = 'rgba(220,240,255,0.25)'; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.strokeRect(2, 2, S - 4, S - 4);
      line(12, 20, 24, 8, 'rgba(255,255,255,0.7)', 2); line(14, 30, 32, 12, 'rgba(255,255,255,0.5)', 2);
      break;
    case 'ice':
      speck(80, 0.1, 3);
      for (let i = 0; i < 6; i++) { const x = rnd() * S; line(x, 0, x + 20, S, 'rgba(255,255,255,0.35)', 2); }
      break;
    case 'leaves':
      speck(700, 0.3, 3);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,40,10,0.7)'; g.fillRect(Math.floor(rnd() * S), Math.floor(rnd() * S), 3, 3); }
      break;
    case 'gold': case 'diamond':
      speck(100, 0.1, 4);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.strokeRect(4, 4, S - 8, S - 8);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(8, 8, S - 16, S - 16);
      if (def.id === 'diamond') for (let i = 0; i < 8; i++) { g.fillStyle = '#ffffff'; const x = rnd() * S, y = rnd() * S; g.fillRect(x, y, 3, 3); }
      break;
    case 'lamp':
      g.fillStyle = '#ffe8a3'; g.fillRect(0, 0, S, S);
      g.strokeStyle = '#6a5030'; g.lineWidth = 5; g.strokeRect(2, 2, S - 4, S - 4); line(32, 0, 32, S, '#6a5030', 4); line(0, 32, S, 32, '#6a5030', 4);
      break;
    case 'obsidian':
      speck(200, 0.1, 3);
      for (let i = 0; i < 5; i++) line(rnd() * S, rnd() * S, rnd() * S, rnd() * S, 'rgba(140,90,200,0.35)', 1.5);
      break;
    default:
      speck(500, def.id === 'sand' ? 0.12 : 0.18, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeMaterial(def) {
  const opts = {
    roughness: def.roughness ?? 0.9, metalness: def.metalness ?? 0,
    transparent: !!def.transparent, opacity: def.opacity ?? 1,
    emissive: def.emissive ? new THREE.Color(def.emissive) : new THREE.Color(0), emissiveIntensity: def.light ? 1.6 : def.emissive ? 0.6 : 0,
    depthWrite: !def.transparent || (def.opacity || 1) > 0.5,
  };
  const side = new THREE.MeshStandardMaterial({ ...opts, map: tex(def, 'side') });
  if (def.emissive) side.emissiveMap = side.map;
  if (def.id === 'grass' || def.id === 'log') {
    const top = new THREE.MeshStandardMaterial({ ...opts, map: tex(def, 'top') });
    const bottom = new THREE.MeshStandardMaterial({ ...opts, map: tex(def, 'bottom') });
    return [side, side, top, bottom, side, side];
  }
  return side;
}

export class Blocks {
  constructor(game) {
    this.game = game;
    this.map = new Map();         // "x,y,z" -> type
    this.cols = new Map();        // "x,z" -> Set of y
    this.meshes = [];
    this.lists = BLOCKS.map(() => []);
    this.dirty = new Set();
    this.group = new THREE.Group(); this.group.name = 'blocks';
    game.scene.add(this.group);
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = BLOCKS.map((d) => null);
    // ghost preview
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false });
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), this.ghostMat);
    this.ghostEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }));
    this.ghost.add(this.ghostEdge);
    this.ghost.visible = false;
    this.ghost.renderOrder = 25;
    game.scene.add(this.ghost);
    this.removeBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.03, 1.03, 1.03)), new THREE.LineBasicMaterial({ color: '#ff5050' }));
    this.removeBox.visible = false;
    game.scene.add(this.removeBox);
    // lamp lights (fixed count)
    this.lights = [];
    const nL = game.settings.quality === 'high' ? 4 : 2;
    for (let i = 0; i < nL; i++) { const L = new THREE.PointLight('#ffc95e', 0, 14, 2); this.group.add(L); this.lights.push(L); }
    this.lampT = 0;
    this.target = null;
    this.selected = 0;
  }

  key(x, y, z) { return `${x},${y},${z}`; }
  get(x, y, z) { return this.map.get(this.key(x, y, z)); }

  meshFor(t) {
    if (this.meshes[t] && this.meshes[t].userData.cap >= this.lists[t].length) return this.meshes[t];
    const cap = Math.max(64, (this.meshes[t] ? this.meshes[t].userData.cap : 32) * 2, this.lists[t].length);
    if (this.meshes[t]) { this.group.remove(this.meshes[t]); this.meshes[t].dispose(); }
    if (!this.mats[t]) this.mats[t] = makeMaterial(BLOCKS[t]);
    const m = new THREE.InstancedMesh(this.geo, this.mats[t], cap);
    m.userData.cap = cap;
    m.castShadow = !BLOCKS[t].transparent; m.receiveShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    this.group.add(m);
    this.meshes[t] = m;
    return m;
  }

  add(x, y, z, t, rebuild = true) {
    const k = this.key(x, y, z);
    if (this.map.has(k)) return false;
    this.map.set(k, t);
    this.lists[t].push(k);
    const ck = `${x},${z}`;
    if (!this.cols.has(ck)) this.cols.set(ck, new Set());
    this.cols.get(ck).add(y);
    this.dirty.add(t);
    if (rebuild) this.flush();
    return true;
  }
  remove(x, y, z) {
    const k = this.key(x, y, z);
    const t = this.map.get(k);
    if (t === undefined) return false;
    this.map.delete(k);
    const L = this.lists[t]; const i = L.indexOf(k); if (i >= 0) L.splice(i, 1);
    const col = this.cols.get(`${x},${z}`); if (col) col.delete(y);
    this.dirty.add(t);
    this.flush();
    return true;
  }
  flush() {
    const m4 = new THREE.Matrix4();
    for (const t of this.dirty) {
      const mesh = this.meshFor(t);
      const L = this.lists[t];
      L.forEach((k, i) => { const [x, y, z] = k.split(',').map(Number); m4.makeTranslation(x + 0.5, y + 0.5, z + 0.5); mesh.setMatrixAt(i, m4); });
      mesh.count = L.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere && mesh.computeBoundingSphere();
    }
    this.dirty.clear();
  }

  // load / save for the current world
  load(list) {
    this.clear();
    (list || []).forEach(([x, y, z, t]) => { if (BLOCKS[t]) this.add(x, y, z, t, false); });
    this.flush();
  }
  serialize() {
    const out = [];
    this.map.forEach((t, k) => { const [x, y, z] = k.split(',').map(Number); out.push([x, y, z, t]); });
    return out;
  }
  clear() {
    this.map.clear(); this.cols.clear();
    this.lists.forEach((L, t) => { if (L.length) { L.length = 0; this.dirty.add(t); } });
    this.flush();
    this.lights.forEach((L) => { L.intensity = 0; });
  }
  get count() { return this.map.size; }

  // ---------------------------------------------------------------- collision
  // highest block top <= maxY under a circle footprint
  topAt(x, z, maxY, r = 0.3) {
    if (!this.map.size) return -1e9;
    let best = -1e9;
    for (let ix = Math.floor(x - r); ix <= Math.floor(x + r); ix++) {
      for (let iz = Math.floor(z - r); iz <= Math.floor(z + r); iz++) {
        const col = this.cols.get(`${ix},${iz}`);
        if (!col) continue;
        for (const y of col) { const top = y + 1; if (top <= maxY && top > best) best = top; }
      }
    }
    return best;
  }
  pushOut(pos, r, y0, y1) {
    if (!this.map.size) return;
    for (let ix = Math.floor(pos.x - r) ; ix <= Math.floor(pos.x + r); ix++) {
      for (let iz = Math.floor(pos.z - r); iz <= Math.floor(pos.z + r); iz++) {
        const col = this.cols.get(`${ix},${iz}`);
        if (!col) continue;
        for (const y of col) {
          if (y + 1 <= y0 || y >= y1) continue;
          // circle vs square [ix,ix+1]x[iz,iz+1]
          const cx = Math.max(ix, Math.min(pos.x, ix + 1)), cz = Math.max(iz, Math.min(pos.z, iz + 1));
          const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
          if (d < r) {
            if (d < 1e-4) { // centre inside: push out along the shortest axis
              const l = pos.x - ix, rr = ix + 1 - pos.x, b = pos.z - iz, f = iz + 1 - pos.z;
              const m = Math.min(l, rr, b, f);
              if (m === l) pos.x = ix - r; else if (m === rr) pos.x = ix + 1 + r; else if (m === b) pos.z = iz - r; else pos.z = iz + 1 + r;
            } else { pos.x += dx / d * (r - d); pos.z += dz / d * (r - d); }
          }
        }
      }
    }
  }
  // ceiling check for flying/jumping
  solidAt(x, y, z) { return this.map.has(this.key(Math.floor(x), Math.floor(y), Math.floor(z))); }

  // ---------------------------------------------------------------- aiming (ray march)
  aim(origin, dir, maxD = 30) {
    const w = this.game.world;
    let px = Math.floor(origin.x), py = Math.floor(origin.y), pz = Math.floor(origin.z);
    for (let t = 0.3; t <= maxD; t += 0.07) {
      const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
      const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
      if (cx !== px || cy !== py || cz !== pz) {
        if (this.map.has(this.key(cx, cy, cz))) return { block: [cx, cy, cz], place: [px, py, pz] };
        px = cx; py = cy; pz = cz;
      }
      const h = w.heightAt(x, z);
      if (y < h) {
        const bx = Math.floor(x), bz = Math.floor(z);
        const hb = w.heightAt(bx + 0.5, bz + 0.5);
        return { block: null, place: [bx, Math.floor(hb), bz] };
      }
    }
    return null;
  }

  // Keyboard building: target the 1x1 column 1.6 m in front of the hero.
  // Place = lowest free cell at/above your feet (so Z, Z, Z builds a tower or wall in front of you).
  // Remove = the highest block in that column below head height.
  aimFront() {
    const g = this.game, p = this.builder || g.player, w = g.world;
    if (!p) return null;
    const fx = p.pos.x + Math.sin(p.yaw) * 1.6, fz = p.pos.z + Math.cos(p.yaw) * 1.6;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const ground = Math.floor(w.heightAt(ix + 0.5, iz + 0.5));
    let y = Math.max(ground, Math.floor(p.pos.y + 0.05));
    const limit = y + 48;
    while (this.map.has(this.key(ix, y, iz)) && y < limit) y++;
    let top = null;
    const head = Math.floor(p.pos.y + 2);
    for (let by = head; by >= ground - 2; by--) if (this.map.has(this.key(ix, by, iz))) { top = [ix, by, iz]; break; }
    return { block: top, place: [ix, y, iz] };
  }

  update(dt, active) {
    const g = this.game;
    this.ghost.visible = false; this.removeBox.visible = false;
    if (active && g.world) {
      // keyboard players (no mouse lock): build in the column right in front of the hero, stacking upwards.
      // mouse players: build wherever the camera points.
      const bp = this.builder || g.player;
      const hit = (bp.index === 0 && g.input && g.input.locked && bp.view) ? this.aim(bp.view.camera.position.clone(), bp.cam.aimDir(), 32) : this.aimFront();
      this.target = hit;
      if (hit) {
        const [x, y, z] = hit.place;
        this.ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
        this.ghost.visible = true;
        const def = BLOCKS[this.selected];
        this.ghostMat.color.set(def.color);
        if (hit.block) { const [bx, by, bz] = hit.block; this.removeBox.position.set(bx + 0.5, by + 0.5, bz + 0.5); this.removeBox.visible = true; }
      }
    } else this.target = null;
    // lamp lights: nearest glow lamps get the pooled lights
    this.lampT -= dt;
    if (this.lampT <= 0) {
      this.lampT = 0.5;
      const lampIdx = BLOCKS.findIndex((b) => b.light);
      const lamps = this.lists[lampIdx] || [];
      const pp = g.player ? g.player.pos : new THREE.Vector3();
      const sorted = lamps.map((k) => { const [x, y, z] = k.split(',').map(Number); return { x: x + 0.5, y: y + 0.5, z: z + 0.5, d: Math.hypot(x - pp.x, y - pp.y, z - pp.z) }; }).sort((a, b) => a.d - b.d);
      this.lights.forEach((L, i) => {
        const s = sorted[i];
        if (s && s.d < 60) { L.position.set(s.x, s.y + 0.2, s.z); L.intensity = 6; } else L.intensity = 0;
      });
    }
  }

  // player actions
  place() {
    const g = this.game, h = this.target;
    if (!h) return false;
    const [x, y, z] = h.place;
    const bp = this.builder || g.player, p = bp.pos;
    // do not trap the player inside the new block
    if (g.players.some((q) => x + 1 > q.pos.x - 0.35 && x < q.pos.x + 0.35 && z + 1 > q.pos.z - 0.35 && z < q.pos.z + 0.35 && y + 1 > q.pos.y + 0.05 && y < q.pos.y + q.height)) return false;
    if (this.map.size > 20000) { g.hud.toast('That is a LOT of blocks! (limit reached)', 'warn', 2); return false; }
    if (this.add(x, y, z, this.selected)) {
      g.audio.play('place', { pitch: 0.9 + Math.random() * 0.2 });
      g.fx.burst({ pos: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), count: 6, spread: 0.5, velSpread: 1.5, life: [0.3, 0.5], size: [0.08, 0.15], color: BLOCKS[this.selected].color, sprite: 'dot', blend: 'normal' });
      bp.buildPose = 0.3;
      g.markBlocksDirty();
      return true;
    }
    return false;
  }
  breakTarget() {
    const g = this.game, h = this.target;
    if (!h || !h.block) return false;
    const [x, y, z] = h.block;
    const t = this.get(x, y, z);
    if (this.remove(x, y, z)) {
      g.audio.play('break', { pitch: 0.9 + Math.random() * 0.2 });
      g.fx.burst({ pos: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), count: 14, spread: 0.45, velSpread: 2.5, up: 2, gravity: 14, life: [0.4, 0.8], size: [0.08, 0.18], color: BLOCKS[t].color, sprite: 'dot', blend: 'normal' });
      (this.builder || g.player).buildPose = 0.3;
      g.markBlocksDirty();
      return true;
    }
    return false;
  }
}
