// Biome props built into the shared Builder (merged per material = few draw calls).
import * as THREE from 'three';
import { RNG } from './noise.js';
import { C } from './props.js';

// find a random spot satisfying a predicate
function spot(ctx, rng, test, maxR = ctx.radius, tries = 60, minR = 0) {
  for (let i = 0; i < tries; i++) {
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.range((minR / maxR) ** 2, 1)) * maxR;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const y = ctx.groundAt(x, z);
    if (test(x, y, z)) return { x, y, z };
  }
  return null;
}

export function buildExtras(list, ctx) {
  const { b, rng, level } = ctx;
  const dry = (x, y, z, above = 0.6) => (level === null || y > level + above) && !ctx.blocked(x, z, 4);
  const dyn = { tumbleweeds: null, craterDisc: null };
  for (const e of list) switch (e) {
    case 'logs': for (let i = 0; i < 18; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 1) && ctx.slopeAt(x, z) < 0.25); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const L = rng.range(3, 6); b.cyl('wood', 0, 0.3, 0, rng.range(0.25, 0.4), L, { rz: Math.PI / 2, seg: 10, color: C('#6a5038') });
      b.cyl('cloth', 0, 0.55, 0, 0.2, L * 0.6, { rz: Math.PI / 2, seg: 8, color: C('#4f7d2f') });
      b.wall(-L / 2, 0, L / 2, 0, 0.35);
    } break;
    case 'coral': {
      const cols = ['#ff7a8a', '#ffb04a', '#c84ad8', '#4ad8c8', '#ff5a5a', '#f0e070'];
      for (let i = 0; i < 90; i++) {
        const p = spot(ctx, rng, (x, y) => y < level - 0.7 && y > level - 5); if (!p) continue;
        b.at(p.x, p.y, p.z, rng.next() * 6.28); const c = C(rng.pick(cols));
        if (rng.chance(0.4)) b.sphere('plaster', 0, 0.2, 0, rng.range(0.3, 0.7), { sy: rng.range(0.25, 0.45), color: c, seg: 7 });
        else for (let k = 0; k < 4; k++) { const a = rng.next() * 6.28, t = rng.range(0.2, 0.7); b.cyl('plaster', Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2, 0.07, rng.range(0.6, 1.2), { rx: Math.sin(a) * t, rz: Math.cos(a) * t, seg: 4, color: c }); }
      }
    } break;
    case 'shells': for (let i = 0; i < 90; i++) {
      const p = spot(ctx, rng, (x, y) => y > level + 0.1 && y < level + 1.6); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const c = C(rng.pick(['#fff0e0', '#ffd0c0', '#f0e0c8', '#ffb8a0']));
      if (rng.chance(0.5)) b.cone('marble', 0, 0.06, 0, 0.1, 0.22, { rx: -1.4, seg: 7, color: c });
      else b.sphere('marble', 0, 0.02, 0, 0.12, { sy: 0.05, color: c, seg: 8 });
    } break;
    case 'driftwood': for (let i = 0; i < 14; i++) {
      const p = spot(ctx, rng, (x, y) => y > level + 0.3 && y < level + 1.8); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      b.cyl('wood', 0, 0.12, 0, 0.14, rng.range(2, 4), { rz: Math.PI / 2, seg: 7, color: C('#b8a890') });
      b.cyl('wood', 0.6, 0.2, 0.3, 0.06, 1.0, { rz: 1.0, ry: 0.6, seg: 5, color: C('#b8a890') });
    } break;
    case 'spikes': for (let i = 0; i < 45; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 2)); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const n = rng.int(3, 7);
      for (let k = 0; k < n; k++) { const a = rng.next() * 6.28, d = rng.range(0, 1.6), h = rng.range(1.5, 5.5); b.cone('obsidian', Math.cos(a) * d, h / 2 - 0.3, Math.sin(a) * d, rng.range(0.25, 0.6), h, { rx: rng.range(-0.25, 0.25), rz: rng.range(-0.25, 0.25), seg: 5, color: C('#141010') }); }
      b.post(0, 0, 1.2);
    } break;
    case 'crater': {
      const v = ctx.recipe.volcano;
      const y = ctx.rawHeight(v.x, v.z);
      dyn.craterAt = new THREE.Vector3(v.x, y + 6, v.z);
      dyn.craterR = v.crater * 0.8;

    } break;
    case 'icecrystals': for (let i = 0; i < 40; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 0.5)); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const n = rng.int(3, 6);
      for (let k = 0; k < n; k++) { const a = rng.next() * 6.28, d = rng.range(0, 0.8), h = rng.range(0.8, 2.8); b.cyl('ice', Math.cos(a) * d, h / 2, Math.sin(a) * d, rng.range(0.12, 0.3), h, { rx: rng.range(-0.4, 0.4), rz: rng.range(-0.4, 0.4), seg: 6, rTop: 0.2, color: C('#cfefff') }); }
      b.post(0, 0, 0.8);
    } break;
    case 'icefalls': {
      let made = 0;
      for (let i = 0; i < 400 && made < 5; i++) {
        const a = rng.next() * 6.28, d = rng.range(40, ctx.radius - 20);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (ctx.slopeAt(x, z) < 0.6 || ctx.blocked(x, z, 6)) continue;
        // find the downhill direction and drape a frozen curtain
        const n = ctx.normalAt(x, z); const yaw = Math.atan2(n.x, n.z);
        const top = ctx.groundAt(x - n.x * 4, z - n.z * 4), bot = ctx.groundAt(x + n.x * 4, z + n.z * 4);
        const h = top - bot; if (h < 5) continue;
        made++;
        b.at(x, bot, z, yaw);
        for (let k = 0; k < 22; k++) { const lx = rng.range(-3.5, 3.5), hh = h * rng.range(0.5, 1.05); b.cyl('ice', lx, hh / 2, rng.range(-0.8, 0.4), rng.range(0.15, 0.45), hh, { seg: 6, rTop: 0.3, color: C('#d8f2ff') }); }
        b.box('ice', 0, 0.2, 1.5, 9, 0.4, 4, { color: C('#cfeeff') });
      }
    } break;
    case 'arches': for (const [ax, az, yaw] of [[80, 128, 0.6], [-62, -140, -0.4], [190, -60, 1.2]]) {
      const y = ctx.groundAt(ax, az); b.at(ax, y, az, yaw);
      const span = rng.range(14, 20), H = rng.range(12, 18), N = 26;
      for (let k = 0; k <= N; k++) {
        const t = (k / N) * Math.PI; const x = -Math.cos(t) * span / 2, yy = Math.sin(t) * H;
        const th = 2.6 + (1 - Math.sin(t)) * 2.2;
        b.box('rock', x, yy, 0, th, 2.4, 3.2 + (1 - Math.sin(t)) * 1.5, { rz: -Math.cos(t) * 0.9, color: C(k % 3 ? '#a85c38' : '#c07a4a'), tile: 4 });
      }
      b.post(-span / 2, 0, 2.2); b.post(span / 2, 0, 2.2);
      for (const s of [-1, 1]) b.box('rock', s * span / 2, -1, 0, 5, 3, 5, { color: C('#9a5434'), tile: 4 });
    } break;
    case 'tumbleweeds': dyn.tumbleweeds = 6; break;
    case 'bigcrystals': for (let i = 0; i < 14; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 1)); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const n = rng.int(4, 8);
      for (let k = 0; k < n; k++) {
        const a = rng.next() * 6.28, d = rng.range(0, 2), h = rng.range(4, 14) * (k === 0 ? 1.3 : 1), t = k === 0 ? 0.05 : rng.range(0.3, 0.7);
        const r = h * 0.09; const col = C(rng.pick(['#8f9fff', '#b38fff', '#7fd0ff'])).multiplyScalar(0.55);
        b.cyl('glow', Math.cos(a) * d, h * 0.42, Math.sin(a) * d, r, h * 0.85, { rx: Math.sin(a) * t, rz: -Math.cos(a) * t, seg: 6, color: col });
        b.cone('glow', Math.cos(a) * (d + Math.sin(t) * h * 0.85), h * 0.85 + h * 0.07, Math.sin(a) * (d + Math.sin(t) * h * 0.85), r, h * 0.2, { rx: Math.sin(a) * t, rz: -Math.cos(a) * t, seg: 6, color: col });
      }
      b.post(0, 0, 2.2);
      ctx.lights.add(new THREE.Vector3(p.x, p.y + 6, p.z), '#9a8aff', 18, 22, { pri: 0.8 });
    } break;
    case 'ruins': for (let i = 0; i < 12; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 1) && ctx.slopeAt(x, z) < 0.3, ctx.radius - 15, 80, 40); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const sc = C('#d8b880');
      if (rng.chance(0.5)) { // colonnade remains
        for (let k = 0; k < 5; k++) { const hh = rng.chance(0.4) ? rng.range(1, 3) : rng.range(4, 7); b.cyl('stone', k * 3.2 - 6.4, hh / 2 - 1, 0, 0.55, hh + 2, { seg: 12, color: sc }); b.post(k * 3.2 - 6.4, 0, 0.6); }
        if (rng.chance(0.6)) b.box('stone', -1.6, 6.2, 0, 7.5, 0.8, 1.4, { rz: 0.04, color: sc });
      } else { // broken wall
        for (let k = 0; k < 6; k++) { const hh = rng.range(1, 4); b.box('stone', k * 2.1 - 5, hh / 2 - 0.5, 0, 2.0, hh + 1, 1.0, { color: sc.clone().multiplyScalar(rng.range(0.85, 1.05)) }); }
        b.wall(-6, 0, 7, 0, 0.6);
      }
      for (let k = 0; k < 4; k++) b.box('stone', rng.range(-7, 7), 0.2, rng.range(-3, 3), rng.range(0.6, 1.4), 0.6, rng.range(0.6, 1.4), { ry: rng.next() * 3, rx: rng.range(-0.3, 0.3), color: sc });
    } break;
    case 'bones': for (let i = 0; i < 4; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 1) && ctx.slopeAt(x, z) < 0.3, ctx.radius - 20, 80, 50); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const bone = C('#efe6d2'), L = rng.range(14, 22);
      b.cyl('marble', 0, 0.6, 0, 0.45, L, { rx: Math.PI / 2, seg: 10, color: bone });
      for (let k = 0; k < 7; k++) { const z = -L / 2 + 2 + k * (L - 4) / 6, R = 3.4 * Math.sin(((k + 1) / 8) * Math.PI) + 1.5; b.torus('marble', 0, 0.3, z, R, 0.22, { tseg: 6, rseg: 18, arc: Math.PI * 0.85, rz: Math.PI * 0.075, color: bone }); }
      b.sphere('marble', 0, 1.0, L / 2 + 1.8, 1.8, { sy: 1.3, color: bone });
      b.wall(0, -L / 2, 0, L / 2 + 2.5, 1.5);
    } break;
    case 'statues': for (let i = 0; i < 5; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 1) && ctx.slopeAt(x, z) < 0.25, ctx.radius - 30, 80, 30); if (!p) continue;
      b.at(p.x, p.y, p.z, Math.atan2(-p.x, -p.z));
      b.box('stone', 0, 0.8, 0, 2.4, 2.0, 2.4, { color: C('#d8b880') });
      // seated cat statue in gold
      b.sphere('gold', 0, 2.6, -0.2, 0.9, { sy: 1.0 });
      b.sphere('gold', 0, 3.8, 0.2, 0.55);
      b.cone('gold', -0.3, 4.35, 0.2, 0.15, 0.4, { seg: 4 }); b.cone('gold', 0.3, 4.35, 0.2, 0.15, 0.4, { seg: 4 });
      b.box('gold', 0, 2.1, 0.75, 0.8, 0.5, 0.6);
      b.post(0, 0, 1.6);
    } break;
    case 'glowshrooms': for (let i = 0; i < 100; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 0.2)); if (!p) continue;
      b.at(p.x, p.y, p.z, 0);
      const n = rng.int(2, 4), col = C(rng.chance(0.5) ? '#9a5dff' : '#3ae0c8').multiplyScalar(0.5);
      for (let k = 0; k < n; k++) { const a = rng.next() * 6.28, d = rng.range(0, 0.7), h = rng.range(0.15, 0.6); b.cyl('plaster', Math.cos(a) * d, h / 2, Math.sin(a) * d, 0.04, h, { seg: 4, color: C('#d8d0e8') }); b.sphere('glow', Math.cos(a) * d, h, Math.sin(a) * d, h * 0.45, { sy: h * 0.22, seg: 6, color: col }); }
      if (i % 12 === 0) ctx.lights.add(new THREE.Vector3(p.x, p.y + 0.8, p.z), col.clone().multiplyScalar(2), 4, 9, { pri: 0.6 });
    } break;
    case 'towers': for (let i = 0; i < 6; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 1) && ctx.slopeAt(x, z) < 0.3, ctx.radius - 15, 80, 50); if (!p) continue;
      b.at(p.x, p.y, p.z, rng.next() * 6.28);
      const H = rng.range(10, 20), R = rng.range(2.5, 3.6), sc = C('#5a5452');
      b.cyl('stone', 0, H / 2 - 1, 0, R, H + 2, { seg: 14, color: sc });
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; b.box('stone', Math.sin(a) * R * 0.9, H + rng.range(0, 2.5), Math.cos(a) * R * 0.9, 1.2, rng.range(1, 3.5), 1.0, { ry: a, color: sc }); }
      for (let k = 0; k < 3; k++) { const a = rng.next() * 6.28, yy = rng.range(3, H - 2); b.box('glow', Math.sin(a) * (R + 0.02), yy, Math.cos(a) * (R + 0.02), 0.35, 1.0, 0.05, { ry: a, color: C('#d04dff').multiplyScalar(0.35) }); }
      for (let k = 0; k < 8; k++) b.box('stone', rng.range(-8, 8), 0.3, rng.range(-8, 8), rng.range(0.6, 1.5), 0.7, rng.range(0.6, 1.5), { ry: rng.next() * 3, rx: rng.range(-0.4, 0.4), color: sc });
      b.post(0, 0, R + 0.3);
    } break;
    case 'graves': for (let i = 0; i < 16; i++) {
      const p = spot(ctx, rng, (x, y, z) => dry(x, y, z, 1) && ctx.slopeAt(x, z) < 0.3, ctx.radius - 10, 60, 30); if (!p) continue;
      const n = rng.int(3, 7);
      for (let k = 0; k < n; k++) {
        const x = p.x + rng.range(-7, 7), z = p.z + rng.range(-7, 7);
        b.at(x, ctx.groundAt(x, z), z, rng.next() * 6.28);
        const h = rng.range(1.2, 2.6);
        b.box('rock', 0, h / 2 - 0.3, 0, rng.range(0.6, 1.0), h, 0.25, { rx: rng.range(-0.2, 0.2), rz: rng.range(-0.15, 0.15), color: C('#7a7470').multiplyScalar(rng.range(0.7, 1.1)), tile: 2 });
        b.post(0, 0, 0.45);
      }
    } break;
  }
  return dyn;
}

// Rolling tumbleweeds (dynamic, one instanced mesh).
export function createTumbleweeds(n, ctx, mat) {
  const g = new THREE.IcosahedronGeometry(0.7, 1);
  const wire = new THREE.WireframeGeometry(g);
  const lines = new THREE.LineSegments(wire, new THREE.LineBasicMaterial({ color: new THREE.Color('#8a6a40') }));
  void mat;
  const grp = new THREE.Group();
  const items = [];
  const rng = new RNG(5);
  for (let i = 0; i < n; i++) {
    const m = lines.clone(); grp.add(m);
    items.push({ m, x: rng.range(-200, 200), z: rng.range(-200, 200), sp: rng.range(2.5, 4.5), ph: rng.next() * 10 });
  }
  g.dispose();
  return {
    group: grp,
    update(dt, t, cam) {
      for (const it of items) {
        it.x += it.sp * dt; it.z += it.sp * 0.35 * dt;
        if (it.x - cam.x > 90) { it.x = cam.x - 90; it.z = cam.z + rng.range(-60, 60); }
        if (Math.abs(it.z - cam.z) > 90) it.z = cam.z + rng.range(-60, 60);
        const y = ctx.groundAt(it.x, it.z) + 0.65 + Math.abs(Math.sin(t * 2.2 + it.ph)) * 0.6;
        it.m.position.set(it.x, y, it.z); it.m.rotation.z -= dt * it.sp / 0.7; it.m.rotation.x += dt * 0.5;
      }
    },
    dispose() { wire.dispose(); lines.material.dispose(); },
  };
}
