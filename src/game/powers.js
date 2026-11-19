// Powers: every element has 9 MOVES (POWER_ATTACKS). Each temple crystal gives 3 of them (tier 0/1/2),
// move 8 is the SUPER. "Use power" uses the selected move; HOLD it ~0.7 s and let go = the SUPER (if earned).
// A hero's OWN element has moves 0-2 from the start (and is stronger: OWN_POWER_BONUS).
// Every player has their own cooldowns / charge state (player.pw), so two players can play at once.
import * as THREE from 'three';
import { POWERS, POWER_ATTACKS, OWN_POWER_BONUS, DIMENSIONS } from '../data.js';
import { clamp, rand } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
export const CHARGE_TIME = 0.7;
const CHARGE_SHOW = 0.15;
export const ROMAN = ['I', 'II', 'III'];

export class Powers {
  constructor(game) {
    this.game = game;
    this.tickers = [];
    this.caster = null;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._u = new THREE.Vector3();
    // shared geometry / materials (created once)
    this.spikeGeo = new THREE.ConeGeometry(0.5, 2.4, 6).translate(0, 1.2, 0);
    this.spikeMat = new THREE.MeshStandardMaterial({ color: '#7d6a55', roughness: 0.95, flatShading: true });
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.25, 0.6, 0.1), new THREE.Vector3(-0.1, 1.3, 0.2), new THREE.Vector3(0.2, 2.0, -0.1)]);
    this.rootGeo = new THREE.TubeGeometry(curve, 10, 0.1, 5, false);
    this.rootMat = new THREE.MeshStandardMaterial({ color: '#4a6b2a', roughness: 0.8, emissive: '#2a8a2a', emissiveIntensity: 0.5 });
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#c8ffe8', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    this.darkMat = new THREE.MeshStandardMaterial({ color: '#1a1028', roughness: 0.6, emissive: '#5a2aa0', emissiveIntensity: 0.8 });
    this.iceGeo = new THREE.OctahedronGeometry(0.5, 0).scale(0.55, 1.6, 0.55);
    this.iceMat = new THREE.MeshStandardMaterial({ color: '#bfefff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75, emissive: '#3aa8d8', emissiveIntensity: 0.6 });
    this.shardGeo = new THREE.OctahedronGeometry(0.3, 0).scale(0.45, 0.45, 2.2);
    this.thornGeo = new THREE.ConeGeometry(0.09, 0.8, 6).rotateX(Math.PI / 2);
    this.thornMat = new THREE.MeshStandardMaterial({ color: '#6a8a2a', roughness: 0.6, emissive: '#3a9a2a', emissiveIntensity: 0.6 });
    this.rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    this.sphereGeo = new THREE.SphereGeometry(1, 24, 16);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.addMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }

  // the player whose move is running right now (moves are written for "this.player")
  get player() { return this.caster || this.game.player; }
  scale() { return 1 + 0.08 * ((this.game.state && this.game.state.level) || 1) - 0.08; }
  isOwn(p, el) { return el === p.ownPower; }
  canUse(p, el, m) {
    const g = this.game, s = g.state;
    if (!s) return false;
    if (g.mode.id !== 'quest') return true;            // Creative + Hero: every move
    const tier = Math.floor(m / 3);
    if (s.crystals[el][tier]) return true;
    return tier === 0 && el === p.ownPower;            // own element: moves 0-2 from the start
  }
  elementUsable(p, el) { for (let m = 0; m < 9; m++) if (this.canUse(p, el, m)) return true; return false; }
  cost(p, el, m) {
    if (this.game.mode.id === 'creative') return 0;
    const mv = POWER_ATTACKS[el][m];
    return Math.max(1, Math.round(mv.mana * p.stat('powerCost', 1) * (this.isOwn(p, el) ? OWN_POWER_BONUS.mana : 1)));
  }
  dmg(p, el, m) { return POWER_ATTACKS[el][m].damage * this.scale() * (this.isOwn(p, el) ? OWN_POWER_BONUS.damage : 1); }
  moveFrac(p, el, m) { const c = p.pw.cd[el][m]; return c > 0 ? c / POWER_ATTACKS[el][m].cooldown : 0; }
  superReady(p) { const el = p.sel.power; return this.canUse(p, el, 8) && p.pw.cd[el][8] <= 0 && (p.mana >= this.cost(p, el, 8) || this.game.state.potions.mana > 0); }
  chargeFrac(p) { const w = p.pw; return w.holding && w.chargeOk ? clamp((w.holdT - CHARGE_SHOW) / (CHARGE_TIME - CHARGE_SHOW), 0, 1) : 0; }
  lockText(el, m) {
    const t = Math.floor(m / 3);
    return `Temple ${t + 1}`;
  }
  lockHelp(el, m) {
    const t = Math.floor(m / 3), D = DIMENSIONS[el];
    return `${POWER_ATTACKS[el][m].name} is locked. Get the Crystal of ${POWERS[el].name} ${ROMAN[t]} from the ${D.temples[t].name} in ${D.name}.`;
  }
  shake(a) { this.game.players.forEach((p) => p.cam.shake(a)); }

  reset(p) {
    const list = p ? [p] : this.game.players;
    list.forEach((q) => { q.pw.cd.forEach((c) => c.fill(0)); this.cancelCharge(q); q.pw.queued = false; q.pw.dash = null; q.dashing = false; q.suit = null; q.secondChanceT = 0; q.shieldT = 0; });
  }

  // ---------------------------------------------------------------- input (every frame: is this player's power button held?)
  input(p, held, dt) {
    const w = p.pw, g = this.game;
    if (p.dead || p.sleeping) { this.cancelCharge(p); return; }
    if (held && !w.holding) { w.holding = true; w.holdT = 0; w.charged = false; w.chargeOk = false; w.warned = false; }
    if (held) {
      w.holdT += dt;
      const sel = p.sel;
      if (w.holdT > CHARGE_SHOW && !w.chargeOk && !w.charged && sel.move !== 8) {
        if (this.superReady(p)) { w.chargeOk = true; g.audio.play('charge', { pitch: 0.9 + sel.power * 0.03 }); }
        else if (!w.warned && w.holdT > CHARGE_TIME && this.canUse(p, sel.power, 8)) {
          w.warned = true;
          const s = POWER_ATTACKS[sel.power][8];
          g.hud.toastFor(p, p.pw.cd[sel.power][8] > 0 ? `${s.name} is not ready yet (${Math.ceil(p.pw.cd[sel.power][8])} s)` : 'Not enough mana for the super!', 'warn', 1.6);
        }
      }
      if (w.chargeOk && !w.charged && w.holdT >= CHARGE_TIME) { w.charged = true; g.audio.play('chargeReady'); g.hud.pulseSuper(p); }
    } else if (w.holding) {
      const wasCharged = w.charged;
      this.cancelCharge(p);
      if (wasCharged) this.tryMove(p, p.sel.power, 8);
      else this.useSelected(p);
    }
  }
  cancelCharge(p) {
    const w = p.pw;
    w.holding = false; w.holdT = 0; w.charged = false; w.chargeOk = false;
    if (w.chargeLight) { this.game.fx.releaseLight(w.chargeLight); w.chargeLight = null; }
  }
  useSelected(p) {
    if (p.cast) { p.pw.queued = true; return; }
    this.tryMove(p, p.sel.power, p.sel.move);
  }

  tryMove(p, el, m) {
    const g = this.game, s = g.state, pw = POWERS[el], mv = POWER_ATTACKS[el][m];
    if (p.dead || p.sleeping || p.cast || p.attack || p.pw.dash) return false;
    if (!this.canUse(p, el, m)) { g.hud.toastFor(p, this.lockHelp(el, m), 'warn', 3); g.audio.play('deny'); return false; }
    if (p.pw.cd[el][m] > 0) { g.audio.play('cooldown'); g.hud.pulseSlot(p, m); return false; }
    const cost = this.cost(p, el, m);
    if (p.mana < cost && s.potions.mana > 0) g.drinkMana(p);   // drink a mana potion automatically
    if (p.mana < cost) { g.audio.play('noMana'); g.hud.toastFor(p, 'Not enough mana! It comes back by itself in a moment.', 'warn', 1.8); return false; }
    p.mana -= cost;
    p.pw.cd[el][m] = mv.cooldown;
    // aim help: turn towards an enemy roughly in front
    const aimed = ['projectile', 'cone', 'line', 'instant', 'dash'].includes(mv.kind) || (mv.kind === 'super' && (pw.id === 'fire' || pw.id === 'death'));
    if (aimed) p.faceNearestEnemy(mv.kind === 'cone' ? 8 : 26, 0.8);
    const melee = (pw.id === 'life' && m === 1) || (pw.id === 'death' && m === 1);
    const c = melee ? p.rig.attack(m === 1 ? 1 : 2) : p.rig.cast(pw.id);
    const quick = mv.cooldown < 2;
    p.cast = {
      t: 0, power: el, move: m, done: false,
      dur: quick ? clamp(c.duration, 0.25, 0.42) : clamp(c.duration, 0.45, 0.8),
      release: quick ? clamp(c.releaseTime || c.hitTime, 0.08, 0.16) : clamp(c.releaseTime || c.hitTime, 0.15, 0.4),
    };
    const hand = this.handPos(this._v, p);
    g.fx.burst({ pos: hand, count: m === 8 ? 30 : 8, spread: 0.2, velSpread: m === 8 ? 3 : 1.2, life: [0.2, 0.4], size: [0.2, 0.4], color: [pw.color, '#ffffff'], sprite: 'spark' });
    if (m === 8) { g.hud.banner(mv.name.toUpperCase() + '!', '', pw.color, 1.4); p.cam.shake(0.2); }
    return true;
  }

  release(p, el, m) {
    const pw = POWERS[el];
    const fn = this[`${pw.id}${m}`];
    if (!fn) return;
    const prev = this.caster;
    this.caster = p;
    try { fn.call(this, this.dmg(p, el, m), pw, POWER_ATTACKS[el][m]); } finally { this.caster = prev; }
  }

  // ---------------------------------------------------------------- shared effect builders
  // suits: armour aura for a while (see Player.updateSuit / hurt)
  suit(kind, color, mv, d = 0) {
    const g = this.game, p = this.player;
    p.suit = { kind, color, t: 0, dur: mv.duration || 12, block: mv.block || 0.3, dmg: d };
    g.audio.play('shield', { pitch: 0.8 + Math.random() * 0.4, volume: 0.7 });
    g.fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: 2.4, color, duration: 1, mode: 'ring' });
    g.fx.burst({ pos: this.chest(this._v, p), count: 40, spread: 0.6, radial: 3, velSpread: 1, up: 1, drag: 2, life: [0.4, 0.8], size: [0.2, 0.4], color: [color, '#ffffff'], sprite: 'spark' });
    g.hud.toastFor(p, `${mv.name} on for ${Math.round(mv.duration || 12)} seconds!`, 'good', 2);
  }
  // a lasting area: fixed spot, or following the caster (follow: true)
  zone(o) {
    const g = this.game, p = this.player;
    const c = (o.center || p.pos).clone();
    if (o.decal !== false) {
      const step = o.follow ? 1 : o.dur;
      this.ticker(o.dur, step, () => g.fx.ground.spawn(g.world, { shape: 'circle', pos: o.follow ? p.pos : c, radius: o.radius, color: o.color, duration: o.follow ? 1.3 : o.dur + 0.2, mode: 'glow', opacity: o.opacity || 0.5 }), null, true);
    }
    if (o.vis) this.ticker(o.dur, o.visEvery || 0.04, (k) => o.vis(o.follow ? p.pos : c, k));
    this.ticker(o.dur, o.interval || 0.5, (k) => {
      const at = o.follow ? p.pos : c;
      o.tick(this.inRadius(at, o.radius), at, k);
    }, o.end);
  }
  summonHelper(kind, mv, d, n = 1) {
    const g = this.game, p = this.player;
    g.allies.summon(p, kind, { dmg: mv.damage || d, dur: mv.duration || 15, n });
    g.audio.play('unlock', { volume: 0.6, pitch: 1.2 });
  }
  wall(kind) {
    const g = this.game, p = this.player, fx = g.fx;
    const f = this.fwd(new THREE.Vector3(), p), side = new THREE.Vector3(-f.z, 0, f.x);
    const c = p.pos.clone().addScaledVector(f, 4);
    c.y = g.world.heightAt(c.x, c.z);
    const W = 7, H = 3.2, D = 0.9, dur = 8;
    const ice = kind === 'ice';
    const mat = ice
      ? new THREE.MeshStandardMaterial({ color: '#bfefff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.78, emissive: '#3aa8d8', emissiveIntensity: 0.45 })
      : new THREE.MeshStandardMaterial({ color: '#8a7a68', roughness: 0.95, flatShading: true });
    const grp = new THREE.Group();
    const n = ice ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(this.boxGeo, mat);
      b.scale.set(W / n + 0.15, H * rand(0.85, 1.1), D * rand(0.9, 1.2));
      b.position.set((i - (n - 1) / 2) * (W / n), b.scale.y / 2 - 0.2, rand(-0.1, 0.1));
      b.rotation.set(rand(-0.05, 0.05), rand(-0.08, 0.08), rand(-0.05, 0.05));
      b.castShadow = true; b.receiveShadow = true;
      grp.add(b);
    }
    grp.position.copy(c);
    grp.rotation.y = p.yaw;
    const wallSeg = { x1: c.x - side.x * W / 2, z1: c.z - side.z * W / 2, x2: c.x + side.x * W / 2, z2: c.z + side.z * W / 2, r: 0.6 };
    g.addWall(wallSeg, dur);
    fx.timedMesh(grp, dur, (o, k) => {
      const t = k * dur;
      o.position.y = c.y - (t < 0.3 ? (1 - t / 0.3) * H : t > dur - 0.5 ? (t - (dur - 0.5)) / 0.5 * H : 0);
    }, () => mat.dispose());
    fx.dust(c, ice ? '#e8f8ff' : '#8a7a62', 20, 2.4);
    g.audio.play(ice ? 'power_ice' : 'power_earth', { pitch: 0.9 });
    this.shake(0.25);
    // enemies standing where the wall rises get pushed back
    this.inLine(c.clone().addScaledVector(side, -W / 2), side, W, 1.6).forEach((e) => this.hit(e, 5, kind === 'ice' ? 'ice' : 'earth', { knock: 8, from: p.pos }));
  }
  // dash the caster forward; kind: thunder | flame | ice | light | ghost
  startDash(p, o) {
    const g = this.game;
    p.pw.dash = { t: 0, dur: o.dur || 0.25, from: p.pos.clone(), to: o.to, d: o.d, hitSet: new Set(), color: o.color, kind: o.kind, power: o.power, lastPatch: 0 };
    p.dashing = true;
    g.fx.flash(this.chest(this._v, p), o.color, 40, 14, 0.4);
  }
  dashTarget(p, len = 12) {
    const g = this.game;
    const e = this.frontEnemy(len + 2, 0.7);
    const dir = this.fwd(new THREE.Vector3(), p);
    if (e) len = clamp(Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) + 3, 6, len + 3);
    const to = p.pos.clone().addScaledVector(dir, len);
    const r = Math.hypot(to.x, to.z), R = g.world.radius - 3;
    if (r > R) { to.x *= R / r; to.z *= R / r; }
    return to;
  }
  // a beam that links you to an enemy and moves its life into you
  drainBeam(color, d, dur, healK, pid) {
    const g = this.game, p = this.player;
    const e = this.frontEnemy(18, 0.9);
    if (!e) { g.hud.toastFor(p, 'No enemy in front of you.', 'info', 1.2); g.fx.sparkles(this.handPos(this._v, p), color, 10, 2); return; }
    const ticks = Math.round(dur / 0.25);
    this.ticker(dur, 0.25, () => {
      if (!e.alive || p.dead) return;
      const from = this.handPos(new THREE.Vector3(), p), to = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.55, e.pos.z);
      this.beamMesh(from, to, color, 0.25, 0.28);
      const dealt = this.hit(e, d / ticks, pid, { color, by: p });
      p.heal(dealt * healK);
      g.fx.burst({ pos: to, count: 6, vel: from.clone().sub(to).multiplyScalar(1.5), velSpread: 0.5, life: [0.4, 0.6], size: [0.2, 0.35], color: [color, '#ffffff'], sprite: 'spark' });
    });
  }

  // ---------------------------------------------------------------- aiming + effect helpers
  handPos(out = new THREE.Vector3(), p = this.player) {
    // p = the caster
    if (p.rig && p.rig.handR) { p.rig.handR.getWorldPosition(out); if (Number.isFinite(out.x) && out.distanceTo(p.pos) < 4) return out; }
    return out.set(p.pos.x + Math.sin(p.yaw) * 0.6, p.pos.y + p.height * 0.7, p.pos.z + Math.cos(p.yaw) * 0.6);
  }
  chest(out = new THREE.Vector3(), p = this.player) { return out.set(p.pos.x, p.pos.y + p.height * 0.6, p.pos.z); }
  fwd(out = new THREE.Vector3(), p = this.player) { return out.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); }
  // point the hero is aiming at: an enemy roughly in front, else the ground ahead
  aimPoint(maxD = 60, out = new THREE.Vector3()) {
    const g = this.game, w = g.world, p = this.player;
    const pitch = (p.index === 0 && g.input.locked) ? clamp(p.cam.pitch + 0.25, -0.6, 0.6) : -0.05;
    const d = this._w.set(Math.sin(p.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(p.yaw) * Math.cos(pitch));
    const o = this._u.set(p.pos.x, p.pos.y + p.height * 0.75, p.pos.z);
    let best = null, bestScore = 0.25;
    for (const e of g.enemies.targets()) {
      const tx = e.pos.x - o.x, ty = e.pos.y + e.height * 0.5 - o.y, tz = e.pos.z - o.z;
      const L = Math.hypot(tx, ty, tz);
      if (L > maxD) continue;
      const ang = 1 - (tx * d.x + ty * d.y + tz * d.z) / L;
      const score = ang * (1 + L * 0.01);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) return out.set(best.pos.x, best.pos.y + best.height * 0.5, best.pos.z);
    for (let t = 1; t <= maxD; t += 0.6) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < w.heightAt(x, z)) return out.set(x, w.heightAt(x, z), z);
    }
    return out.copy(o).addScaledVector(d, maxD);
  }
  frontEnemy(range, maxAngle = 0.8) {
    const p = this.player;
    let best = null, bd = 1e9;
    for (const e of this.game.enemies.targets()) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz) - e.radius;
      if (d > range) continue;
      const a = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - p.yaw), Math.cos(Math.atan2(dx, dz) - p.yaw)));
      if (a > maxAngle) continue;
      if (d + a * 4 < bd) { bd = d + a * 4; best = e; }
    }
    return best;
  }
  inRadius(c, r) { return this.game.enemies.targets().filter((e) => Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < r + e.radius && Math.abs(e.pos.y - c.y) < 6 + e.height); }
  inCone(range, half) {
    const p = this.player, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    return this.game.enemies.targets().filter((e) => {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range + e.radius || Math.abs(e.pos.y - p.pos.y) > 4 + e.height) return false;
      return d < e.radius + 1 || (dx * fx + dz * fz) / d > Math.cos(half);
    });
  }
  inLine(from, dir, len, width) {
    return this.game.enemies.targets().filter((e) => {
      const cx = e.pos.x - from.x, cz = e.pos.z - from.z;
      const along = cx * dir.x + cz * dir.z;
      if (along < -1 || along > len + e.radius) return false;
      return Math.abs(cx * dir.z - cz * dir.x) < width / 2 + e.radius;
    });
  }
  hit(e, d, pid, o = {}) { return this.game.enemies.hit(e, d, { power: pid, by: this.caster || undefined, ...o }); }
  ground(x, z) { const w = this.game.world; let h = w.heightAt(x, z); if (w.liquid && w.liquid.level > h) h = w.liquid.level; return h; }

  ticker(dur, interval, fn, end, immediate = false) { const t = { t: 0, dur, interval, acc: 0, fn, end }; this.tickers.push(t); if (immediate) fn(0); return t; }

  // a projectile from the hand towards the aim point; o.onHit(pos, enemyOrNull)
  shoot(o) {
    const g = this.game;
    const from = this.handPos(new THREE.Vector3());
    const to = this.aimPoint(o.range || 45, new THREE.Vector3());
    const dir = to.clone().sub(from);
    if (dir.lengthSq() < 0.01) this.fwd(dir);
    dir.normalize();
    const pr = g.fx.projectile({
      pos: from, vel: dir.multiplyScalar(o.speed || 34), color: o.color, size: o.size || 0.7, life: o.life || 2, gravity: o.gravity || 0,
      light: o.light || 0, trail: o.trail, mesh: o.mesh || null, noSprite: !!o.noSprite, spin: !!o.spin,
      hit: (q) => {
        // swept test from the last position, so fast shots never skip through small enemies
        const a = q._prev || from, b = q.pos;
        const sx = b.x - a.x, sy = b.y - a.y, sz = b.z - a.z, L2 = sx * sx + sz * sz || 1e-6;
        for (const e of g.enemies.targets()) {
          const t = clamp(((e.pos.x - a.x) * sx + (e.pos.z - a.z) * sz) / L2, 0, 1);
          const cx = a.x + sx * t, cy = a.y + sy * t, cz = a.z + sz * t;
          if (Math.hypot(e.pos.x - cx, e.pos.z - cz) < e.radius + 0.55 && cy > e.pos.y - 0.4 && cy < e.pos.y + e.height + 0.6) { q.target = e; q.pos.set(cx, cy, cz); return true; }
        }
        q._prev = (q._prev || new THREE.Vector3()).copy(b);
        return false;
      },
      onHit: (q) => o.onHit(q.pos.clone(), q.target || null),
    });
    return pr;
  }

  // a glowing beam between two points (used by Light and boss beams)
  beamMesh(from, to, color, width = 0.8, dur = 0.5) {
    const g = this.game;
    const len = from.distanceTo(to);
    const grp = new THREE.Group();
    const outer = new THREE.Mesh(this.beamGeo, this.addMat(color, 0.55));
    const inner = new THREE.Mesh(this.beamGeo, this.addMat('#ffffff', 0.9));
    outer.scale.set(width, width, len); inner.scale.set(width * 0.35, width * 0.35, len);
    grp.add(outer, inner);
    grp.position.copy(from);
    grp.lookAt(to);
    grp.renderOrder = 22;
    g.fx.timedMesh(grp, dur, (o, k) => {
      const f = 1 - k;
      outer.material.opacity = 0.55 * f; inner.material.opacity = 0.9 * f;
      const s = 1 + Math.sin(k * 40) * 0.08;
      outer.scale.x = outer.scale.y = width * s * (0.6 + 0.4 * f);
    }, () => { outer.material.dispose(); inner.material.dispose(); });
    const dir = this._w.copy(to).sub(from).normalize();
    for (let t = 0; t < len; t += 1.5) g.fx.burst({ pos: this._v.copy(from).addScaledVector(dir, t), count: 1, spread: width * 0.4, velSpread: 1, life: [0.3, 0.7], size: [0.2, 0.5], color: [color, '#ffffff'], sprite: 'spark' });
  }
  // particles sprayed in a cone in front of the hero for a short time
  spray(colors, range, half, dur, opts = {}) {
    const g = this.game, p = this.player;
    this.ticker(dur, 0.03, () => {
      const o = this.handPos(this._v, p);
      for (let n = 0; n < (opts.n || 5); n++) {
        const a = p.yaw + rand(-half, half), sp = range / (opts.life || 0.45) * rand(0.7, 1.05);
        g.fx.burst({ pos: o, count: 1, blend: opts.blend, vel: this._w.set(Math.sin(a) * sp, rand(-0.6, 1.2), Math.cos(a) * sp), velSpread: 0.6, drag: 0.6,
          life: [opts.life * 0.8 || 0.36, opts.life || 0.45], size: opts.size || [0.35, 0.7], sizeEnd: opts.sizeEnd ?? 2.2, alpha: opts.alpha || 0.8, color: colors, sprite: opts.sprite || 'dot' });
      }
    });
  }
  coneDecal(range, half, color, dur = 0.6) { const p = this.player; this.game.fx.ground.spawn(this.game.world, { shape: 'cone', pos: p.pos, radius: range, angle: half * 2, yaw: p.yaw, color, duration: dur, mode: 'glow', opacity: 0.55 }); }
  bolt(points, color, width = 0.09, dur = 0.35) {
    const pos = [];
    const add = (a, b, w) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const s1 = new THREE.Vector3().crossVectors(d, UP).normalize().multiplyScalar(w);
      if (s1.lengthSq() < 1e-6) s1.set(w, 0, 0);
      const s2 = new THREE.Vector3().crossVectors(d, s1).normalize().multiplyScalar(w);
      [s1, s2].forEach((s) => {
        pos.push(a.x - s.x, a.y - s.y, a.z - s.z, a.x + s.x, a.y + s.y, a.z + s.z, b.x + s.x, b.y + s.y, b.z + s.z);
        pos.push(a.x - s.x, a.y - s.y, a.z - s.z, b.x + s.x, b.y + s.y, b.z + s.z, b.x - s.x, b.y - s.y, b.z - s.z);
      });
    };
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const L = a.distanceTo(b), n = Math.max(3, Math.ceil(L / 1.2));
      let prev = a.clone();
      for (let k = 1; k <= n; k++) {
        const q = a.clone().lerp(b, k / n);
        if (k < n) q.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(Math.min(0.7, L * 0.08)));
        add(prev, q, width);
        if (Math.random() < 0.25 && k < n) { const br = q.clone().add(new THREE.Vector3(rand(-1.2, 1.2), rand(-1, 0.5), rand(-1.2, 1.2))); add(q, br, width * 0.55); }
        prev = q;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = this.addMat(color, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 22;
    this.game.fx.timedMesh(mesh, dur, (o, k) => { mat.opacity = (1 - k) * (0.6 + Math.random() * 0.4); }, () => { geo.dispose(); mat.dispose(); });
  }
  // rock spikes erupting at a list of spots [{x,z,delay,s}]
  spikes(spots, dur = 1.4, mat = this.spikeMat) {
    const g = this.game, fx = g.fx;
    const inst = new THREE.InstancedMesh(this.spikeGeo, mat, spots.length);
    inst.castShadow = true;
    spots.forEach((sp) => {
      sp.y = g.world.heightAt(sp.x, sp.z); sp.dusted = false;
      const a = Math.atan2(sp.x - (sp.cx ?? sp.x), sp.z - (sp.cz ?? sp.z));
      sp.tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.3, 0.3) + (sp.cx !== undefined ? Math.cos(a) * 0.3 : 0), 0, rand(-0.3, 0.3) - (sp.cx !== undefined ? Math.sin(a) * 0.3 : 0)));
    });
    const m4 = new THREE.Matrix4(), s = new THREE.Vector3(), pp = new THREE.Vector3();
    fx.timedMesh(inst, dur, (o, k) => {
      const t = k * dur;
      spots.forEach((sp, i) => {
        const lt = t - (sp.delay || 0);
        const h = lt < 0 ? 0 : lt < 0.12 ? lt / 0.12 : lt < dur * 0.6 ? 1 : Math.max(0, 1 - (lt - dur * 0.6) / 0.4);
        if (lt >= 0 && !sp.dusted) { sp.dusted = true; if (i % 2 === 0) fx.dust(pp.set(sp.x, sp.y + 0.2, sp.z), '#8a7a62', 3, 1.2); }
        m4.compose(pp.set(sp.x, sp.y - 0.3, sp.z), sp.tilt, s.set(sp.s || 1, Math.max(0.001, h * (sp.s || 1)), sp.s || 1));
        o.setMatrixAt(i, m4);
      });
      o.instanceMatrix.needsUpdate = true;
    }, () => inst.dispose());
  }
  // curved tubes (roots / ghost hands) rising around an enemy
  grabbers(e, mat, dur, n = 6) {
    const fx = this.game.fx;
    const grp = new THREE.Group();
    grp.position.set(e.pos.x, e.pos.y, e.pos.z);
    const rr = e.radius + 0.25;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(this.rootGeo, mat);
      const a = (k / n) * Math.PI * 2;
      m.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      m.rotation.y = -a + Math.PI / 2; m.rotation.z = -0.35;
      const s = 0.8 + Math.random() * 0.5 + (e.isBoss ? 1.2 : 0);
      m.scale.set(s, s * Math.max(1, e.height / 2), s);
      grp.add(m);
    }
    grp.scale.set(1, 0.01, 1);
    fx.timedMesh(grp, dur, (o, k) => { const up = k < 0.1 ? k / 0.1 : k > 0.85 ? (1 - k) / 0.15 : 1; o.scale.set(1, Math.max(0.01, up), 1); if (e.alive) o.position.set(e.pos.x, e.pos.y, e.pos.z); });
  }


  // ================================================================ LIFE
  life0(d, pw) {   // Thorn Shot
    const g = this.game;
    g.audio.play('shoot', { pitch: 1.2 });
    this.shoot({ color: '#7dff6a', size: 0.45, speed: 44, mesh: new THREE.Mesh(this.thornGeo, this.thornMat), trail: { color: ['#7dff6a', '#d8ffb0'], count: 1, size: [0.15, 0.3] },
      onHit: (pos, e) => { if (e) this.hit(e, d, 'life', { color: pw.color }); g.fx.burst({ pos, count: 10, velSpread: 3, up: 2, gravity: 8, life: [0.3, 0.6], size: [0.1, 0.22], color: ['#7dff6a', '#3a8a2a'], sprite: 'spark' }); } });
  }
  life1(d, pw) {   // Vine Whip
    const g = this.game, p = this.player;
    g.audio.play('whip');
    this.coneDecal(7, 0.75, pw.color, 0.5);
    // a vine sweeping across the front
    this.ticker(0.25, 0.02, (k) => {
      const a = p.yaw + (0.75 - k * 1.5);
      for (let r = 1.5; r < 7.2; r += 0.6) g.fx.burst({ pos: this._v.set(p.pos.x + Math.sin(a) * r, p.pos.y + 1.0 + Math.sin(r) * 0.2, p.pos.z + Math.cos(a) * r), count: 1, life: [0.25, 0.4], size: [0.25, 0.4], color: ['#5dff7a', '#2a8a2a'], sprite: 'dot' });
    });
    const pull = this.chest(new THREE.Vector3()).addScaledVector(this.fwd(this._w), 1.6);
    this.inCone(7, 0.75).forEach((e) => { this.hit(e, d, 'life', { color: pw.color }); g.enemies.pullTo(e, pull, 0.45); });
  }
  life2(d, pw) {   // Root Trap
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_life');
    const targets = this.inRadius(p.pos, 9).slice(0, 8);
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: 9, color: pw.color, duration: 1.2, mode: 'ring' });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: 3, color: pw.color, duration: 3, mode: 'glow', opacity: 0.6 });
    fx.flash(this._v.copy(p.pos).setY(p.pos.y + 1), pw.color, 20, 14, 0.8);
    const heal = p.stat('healBonus', 1);
    targets.forEach((e) => { g.enemies.root(e, 3); this.grabbers(e, this.rootMat, 3); fx.dust(e.pos, '#5a4a30', 8, 1); });
    this.ticker(3, 0.5, () => {
      let drained = 0;
      targets.forEach((e) => {
        if (!e.alive) return;
        drained += this.hit(e, d / 2, 'life', { color: pw.color });
        const from = this._v.set(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
        const to = this._w.set(p.pos.x - from.x, p.pos.y + 1.2 - from.y, p.pos.z - from.z);
        fx.burst({ pos: from, count: 6, spread: 0.3, vel: to.multiplyScalar(1.6), velSpread: 0.6, life: [0.5, 0.7], size: [0.2, 0.35], color: [pw.color, '#d8ffd0'], sprite: 'spark' });
      });
      if (drained > 0) p.heal(drained * 0.6 * heal);
    });
  }
  life8(d, pw) {   // Forest Fury: a giant tree bursts out of the ground
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('superBoom'); g.audio.play('power_life', { pitch: 0.7 });
    const c = this.fwd(new THREE.Vector3()).multiplyScalar(7.5).add(p.pos);
    c.y = g.world.heightAt(c.x, c.z);
    const tree = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: '#5a4029', roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: '#3f8f2a', roughness: 0.8, emissive: '#2a6a1a', emissiveIntensity: 0.4, flatShading: true });
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1.5, 9, 9).translate(0, 4.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunk = new THREE.Mesh(trunkGeo, bark); trunk.castShadow = true; tree.add(trunk);
    [[0, 10, 0, 4], [-2.6, 8.5, 0.5, 3], [2.4, 8.8, -0.6, 3.2], [0.4, 8.2, 2.4, 2.8], [-0.5, 8.6, -2.4, 2.8]].forEach(([x, y, z, r]) => { const m = new THREE.Mesh(crownGeo, leaf); m.position.set(x, y, z); m.scale.setScalar(r); m.castShadow = true; tree.add(m); });
    tree.position.copy(c);
    tree.scale.setScalar(0.01);
    fx.timedMesh(tree, 3.4, (o, k) => {
      const t = k * 3.4;
      const s = t < 0.5 ? (t / 0.5) * 1.15 : t < 0.7 ? 1.15 - (t - 0.5) * 0.75 : t < 2.8 ? 1 : Math.max(0.01, 1 - (t - 2.8) / 0.6);
      o.scale.setScalar(Math.max(0.01, s));
      o.rotation.y = t * 0.15;
      if (Math.random() < 0.4 && t < 2.8) fx.burst({ pos: this._v.set(c.x + rand(-4, 4), c.y + rand(6, 11), c.z + rand(-4, 4)), count: 1, blend: 'normal', vel: this._w.set(rand(-1, 1), -1.5, rand(-1, 1)), life: [1.2, 2], size: [0.15, 0.25], sizeEnd: 1, color: ['#4faf3a', '#8adf5a'], sprite: 'dot' });
    }, () => { trunkGeo.dispose(); crownGeo.dispose(); bark.dispose(); leaf.dispose(); });
    fx.dust(c, '#6a5a3a', 30, 3);
    fx.ring(this._v.copy(c).setY(c.y + 0.5), pw.color, 12, 0.6);
    fx.ground.spawn(g.world, { shape: 'circle', pos: c, radius: 12, color: pw.color, duration: 1.5, mode: 'ring' });
    fx.flash(this._v.copy(c).setY(c.y + 3), pw.color, 50, 25, 1);
    this.shake(0.7);
    this.inRadius(c, 12).forEach((e) => { this.hit(e, d, 'life', { knock: 10, from: c, color: pw.color }); g.enemies.lift(e, 9); });
    p.heal(p.maxHp * 0.35 * p.stat('healBonus', 1));
  }

  // ================================================================ HEALING
  healing0(d, pw) {   // Spirit Bolt
    const g = this.game, p = this.player;
    g.audio.play('shoot', { pitch: 1.4 });
    this.shoot({ color: pw.color, size: 0.8, speed: 36, trail: { color: [pw.color, '#ffffff'], count: 2, size: [0.2, 0.4] },
      onHit: (pos, e) => { g.fx.sparkles(pos, pw.color, 12, 2.5); if (e) { const dealt = this.hit(e, d, 'healing', { color: pw.color }); p.heal(4 + dealt * 0.3); } } });
  }
  healing1(d, pw) {   // Mending Wave
    const g = this.game, p = this.player;
    g.audio.play('power_healing', { pitch: 1.3 });
    this.coneDecal(8, 0.85, pw.color, 0.7);
    this.spray([pw.color, '#ffffff', '#fff3b0'], 8, 0.85, 0.25, { n: 8, life: 0.5, size: [0.3, 0.6], sprite: 'spark', sizeEnd: 1.2 });
    this.inCone(8, 0.85).forEach((e) => this.hit(e, d, 'healing', { knock: 9, from: p.pos, color: pw.color }));
    p.heal(p.maxHp * 0.08 * p.stat('healBonus', 1));
  }
  healing2(d, pw) {   // Healing Glow
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_healing');
    p.addHot(p.maxHp * 0.5 * p.stat('healBonus', 1), 3);
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: 2.6, color: pw.color, duration: 3, mode: 'glow', opacity: 0.8 });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: 3.4, color: '#ffffff', duration: 1, mode: 'ring' });
    g.hud.screenFlash(pw.color, 0.25);
    const L = fx.holdLight(pw.color, 18, 10);
    this.ticker(3, 0.05, () => {
      if (L) L.position.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
      fx.burst({ pos: this._v.set(p.pos.x, p.pos.y + 0.2, p.pos.z), count: 2, spread: 0.9, flat: true, up: 2.5, velSpread: 0.2, life: [0.7, 1.2], size: [0.15, 0.3], color: [pw.color, '#ffffff', '#fff3b0'], sprite: 'spark' });
    }, () => fx.releaseLight(L));
  }
  healing8(d, pw) {   // Guardian Angel: full heal + golden shield for 5 s
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('shield');
    p.hp = p.maxHp;
    p.hots.length = 0;
    p.shieldT = 5;
    g.hud.damageNumber(this._v.set(p.pos.x, p.pos.y + p.height + 0.4, p.pos.z), 0, 'heal', 'Full health!');
    g.hud.screenFlash('#ffe08a', 0.45);
    const mat = this.addMat('#ffd34a', 0.25);
    const ring = this.addMat('#fff3b0', 0.6);
    const bubble = new THREE.Mesh(this.sphereGeo, mat);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 24).rotateX(Math.PI / 2), ring);
    const grp = new THREE.Group(); grp.add(bubble, halo);
    bubble.scale.setScalar(1.5);
    const L = fx.holdLight('#ffd34a', 22, 10);
    fx.timedMesh(grp, 5, (o, k) => {
      o.position.set(p.pos.x, p.pos.y + p.height * 0.55, p.pos.z);
      halo.position.y = p.height * 0.55;
      const pulse = 1 + Math.sin(k * 40) * 0.04;
      bubble.scale.setScalar(1.5 * pulse);
      mat.opacity = (k > 0.85 ? (1 - k) / 0.15 : 1) * (0.18 + Math.sin(k * 25) * 0.05);
      if (L) L.position.copy(o.position);
      if (Math.random() < 0.5) fx.burst({ pos: this._v.set(p.pos.x + rand(-1.4, 1.4), p.pos.y + rand(0.2, 2.6), p.pos.z + rand(-1.4, 1.4)), count: 1, vel: this._w.set(0, -0.6, 0), life: [0.6, 1], size: [0.12, 0.25], color: ['#ffd34a', '#ffffff'], sprite: 'spark' });
    }, () => { mat.dispose(); ring.dispose(); halo.geometry.dispose(); fx.releaseLight(L); });
    // light pillar + wings of light
    fx.burst({ pos: this._v.set(p.pos.x, p.pos.y + 1.4, p.pos.z), count: 60, spread: 0.3, radial: 5, velSpread: 1, up: 2, drag: 2, life: [0.6, 1.2], size: [0.2, 0.4], color: ['#ffd34a', '#ffffff', '#fff3b0'], sprite: 'spark' });
    this.beamMesh(this._v.set(p.pos.x, p.pos.y + 30, p.pos.z).clone(), p.pos.clone(), '#ffe08a', 1.6, 0.9);
  }

  // ================================================================ FIRE
  fire0(d, pw) {   // Fireball
    const g = this.game;
    g.audio.play('power_fire', { pitch: 1.2 });
    this.shoot({ color: '#ff8a2a', size: 1.0, speed: 32, light: 22, trail: { color: ['#ff6a1a', '#ffb347', '#ffe08a'], count: 3, size: [0.35, 0.7], life: [0.2, 0.45] },
      onHit: (pos) => this.explode(pos, d, 3.5, 2, 6) });
  }
  explode(at, dmg, R = 4.5, burnT = 3, burnDps = 8, big = false) {
    const g = this.game, fx = g.fx;
    const k = R / 4.5;
    fx.burst({ pos: at, count: big ? 120 : 50, spread: 0.6 * k, radial: 7 * k, velSpread: 3 * k, gravity: 3, drag: 2.5, life: [0.35, 0.8 + (big ? 0.5 : 0)], size: [0.5 * k, 1.2 * k], sizeEnd: 0.1, color: ['#ff6a1a', '#ffb347', '#ffe08a', '#ff3a10'], sprite: 'dot' });
    fx.burst({ pos: at, count: big ? 60 : 30, spread: 0.3, velSpread: 9 * k, up: 4, gravity: 12, life: [0.4, 0.9], size: [0.08, 0.18], color: ['#ffe08a', '#ffffff'], sprite: 'spark' });
    fx.burst({ pos: at, count: big ? 30 : 14, blend: 'normal', spread: 1.2 * k, up: 2.5, velSpread: 1, drag: 1, life: [1, 1.8], size: [1.2 * k, 2.2 * k], sizeEnd: 2.2, alpha: 0.35, color: '#2a2422', sprite: 'smoke' });
    fx.ring(at, '#ffb347', R, 0.4);
    fx.flash(at, '#ff7a2a', big ? 90 : 60, big ? 30 : 18, 0.6);
    fx.ground.spawn(g.world, { shape: 'circle', pos: at, radius: R * 0.8, color: '#ff5a10', duration: 2.2, mode: 'glow', opacity: 0.5 });
    g.audio.play('explosion', { volume: big ? 1.3 : 1 });
    if (at.distanceTo(g.player.pos) < 14 + R) this.shake(big ? 0.8 : 0.3);
    this.inRadius(at, R).forEach((e) => {
      const dd = Math.hypot(e.pos.x - at.x, e.pos.z - at.z);
      this.hit(e, dmg * (dd < R * 0.45 ? 1 : 0.75), 'fire', { knock: big ? 10 : 6, from: at, color: '#ffb347' });
      g.enemies.burn(e, burnT, burnDps * this.scale());
      if (big) g.enemies.lift(e, 7);
    });
  }
  fire1(d, pw) {   // Flame Breath
    const g = this.game;
    g.audio.play('power_fire', { pitch: 0.75 });
    this.coneDecal(7, 0.6, '#ff6a1a', 0.6);
    this.spray(['#ff6a1a', '#ffb347', '#ffe08a', '#ff3a10'], 7, 0.55, 0.45, { n: 6, life: 0.45, size: [0.4, 0.8] });
    this.inCone(7, 0.6).forEach((e) => { this.hit(e, d, 'fire', { color: '#ffb347' }); g.enemies.burn(e, 3, 6 * this.scale()); });
  }
  fire2(d, pw) {   // Fire Ring
    const g = this.game, p = this.player, fx = g.fx;
    const R = 6;
    g.audio.play('explosion', { pitch: 1.2 });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#ff5a10', duration: 1.2, mode: 'ring', opacity: 1 });
    fx.flash(this._v.copy(p.pos).setY(p.pos.y + 1), '#ff7a2a', 50, 18, 0.5);
    this.ticker(0.35, 0.05, (k) => {
      const r = 1.5 + k * (R - 1.5);
      for (let n = 0; n < 14; n++) {
        const a = n / 14 * Math.PI * 2 + k;
        fx.burst({ pos: this._v.set(p.pos.x + Math.cos(a) * r, this.ground(p.pos.x + Math.cos(a) * r, p.pos.z + Math.sin(a) * r) + 0.4, p.pos.z + Math.sin(a) * r), count: 1, up: 3, velSpread: 0.6, life: [0.3, 0.6], size: [0.6, 1.0], color: ['#ff6a1a', '#ffb347', '#ffe08a'], sprite: 'dot' });
      }
    });
    this.inRadius(p.pos, R).forEach((e) => { this.hit(e, d, 'fire', { knock: 7, from: p.pos, color: '#ffb347' }); g.enemies.burn(e, 3, 7 * this.scale()); });
  }
  fire8(d, pw) {   // Meteor
    const g = this.game, p = this.player, fx = g.fx;
    const e = this.frontEnemy(28, 0.9);
    const at = e ? e.pos.clone() : this.fwd(new THREE.Vector3()).multiplyScalar(14).add(p.pos);
    at.y = this.ground(at.x, at.z);
    const R = 6.5, fall = 1.2;
    g.fx.ground.spawn(g.world, { shape: 'circle', pos: at, radius: R, color: '#ff7a1a', duration: fall });
    g.audio.play('meteor');
    const rockMat = new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.8, emissive: '#ff4a10', emissiveIntensity: 0.9, flatShading: true });
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), rockMat);
    const fw = this.fwd(new THREE.Vector3());
    const start = at.clone().add(new THREE.Vector3(fw.x * 26 - fw.z * 5, 17, fw.z * 26 + fw.x * 5));
    this.beamMesh(at.clone().setY(at.y + 25), at.clone(), '#ff7a1a', 0.35, fall);
    const glow = fx.sprite('#ff8a2a', 9);
    fx.timedMesh(rock, fall, (o, k) => {
      const kk = Math.pow(k, 1.2);
      o.position.lerpVectors(start, at, kk);
      o.rotation.x += 0.2; o.rotation.y += 0.15;
      glow.position.copy(o.position);
      fx.burst({ pos: o.position, count: 4, spread: 1.2, velSpread: 1.5, life: [0.3, 0.7], size: [0.8, 1.6], sizeEnd: 0.2, color: ['#ff6a1a', '#ffb347', '#ffe08a'], sprite: 'dot' });
      if (Math.random() < 0.6) fx.burst({ pos: o.position, count: 1, blend: 'normal', spread: 0.8, life: [0.8, 1.4], size: [1.4, 2.4], sizeEnd: 2, alpha: 0.4, color: '#2a2222', sprite: 'smoke' });
    }, () => {
      fx.freeSprite(glow); rock.geometry.dispose(); rockMat.dispose();
      this.explode(at.clone().setY(at.y + 0.5), d, R, 4, 10, true);
      g.audio.play('superBoom');
    });
  }

  // ================================================================ ICE
  ice0(d, pw) {   // Ice Shard
    const g = this.game;
    g.audio.play('shoot', { pitch: 1.6 });
    this.shoot({ color: '#bfefff', size: 0.6, speed: 40, mesh: new THREE.Mesh(this.shardGeo, this.iceMat), trail: { color: ['#bfefff', '#ffffff'], count: 1, size: [0.15, 0.3] },
      onHit: (pos, e) => {
        g.fx.burst({ pos, count: 12, velSpread: 3, up: 2, gravity: 10, life: [0.3, 0.6], size: [0.08, 0.2], color: ['#ffffff', '#bfefff'], sprite: 'spark' });
        if (e) { this.hit(e, d, 'ice', { color: '#bfefff' }); g.enemies.slow(e, 3, 0.5); }
      } });
  }
  ice1(d, pw) {   // Frost Breath
    const g = this.game;
    g.audio.play('power_ice', { pitch: 1.3 });
    this.coneDecal(7, 0.6, '#9fe8ff', 0.8);
    this.spray(['#ffffff', '#bfefff', '#9fe8ff'], 7, 0.55, 0.45, { n: 5, life: 0.5, size: [0.4, 0.8], alpha: 0.6 });
    this.spray(['#ffffff'], 7, 0.55, 0.45, { n: 2, life: 0.5, size: [0.1, 0.2], sprite: 'spark', sizeEnd: 1 });
    this.inCone(7, 0.6).forEach((e) => { this.hit(e, d, 'ice', { color: '#bfefff' }); g.enemies.slow(e, 4, 0.3); });
  }
  ice2(d, pw) {   // Frost Nova
    const g = this.game, p = this.player, fx = g.fx;
    const R = 10;
    g.audio.play('power_ice');
    const c = this._v.copy(p.pos).setY(p.pos.y + 0.6);
    fx.ring(c, '#bfefff', R, 0.6);
    fx.burst({ pos: c, count: 80, spread: 0.5, radial: 14, flat: true, velSpread: 1, drag: 2.5, life: [0.5, 1.0], size: [0.15, 0.35], color: ['#ffffff', '#bfefff', '#9fe8ff'], sprite: 'spark' });
    fx.burst({ pos: c, count: 30, blend: 'normal', spread: 1, radial: 8, flat: true, drag: 2, life: [0.8, 1.4], size: [1, 2], sizeEnd: 2, alpha: 0.3, color: '#e8f8ff', sprite: 'smoke' });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#9fe8ff', duration: 3.2, mode: 'glow', opacity: 0.55 });
    fx.flash(c, '#9fe8ff', 40, 18, 0.8);
    g.hud.screenFlash('#bfefff', 0.3);
    this.freezeGroup(this.inRadius(p.pos, R), d, 3);
  }
  freezeGroup(targets, d, t) {
    const g = this.game, fx = g.fx;
    if (!targets.length) return;
    const inst = new THREE.InstancedMesh(this.iceGeo, this.iceMat, Math.min(80, targets.length * 5));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3(), e3 = new THREE.Euler();
    let n = 0;
    targets.forEach((e) => {
      if (d) this.hit(e, d, 'ice', { color: '#bfefff' });
      g.enemies.freeze(e, t);
      g.audio.play('freeze', { volume: 0.5 });
      for (let k = 0; k < 5 && n < inst.count; k++) {
        const a = k / 5 * Math.PI * 2 + rand(0, 0.6), r = e.radius * rand(0.5, 1.0);
        const sc = (e.isBoss ? 2.2 : 1) * rand(0.7, 1.3) * Math.max(0.8, e.height / 1.8);
        e3.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)); q.setFromEuler(e3);
        m4.compose(pp.set(e.pos.x + Math.cos(a) * r, e.pos.y + 0.3 * sc, e.pos.z + Math.sin(a) * r), q, s.set(sc, sc, sc));
        inst.setMatrixAt(n++, m4);
      }
    });
    inst.count = n;
    fx.timedMesh(inst, t, () => {}, () => inst.dispose());
  }
  ice8(d, pw) {   // Blizzard: 6 s snowstorm around the hero
    const g = this.game, p = this.player, fx = g.fx;
    const R = 10;
    g.audio.play('power_ice', { pitch: 0.7 });
    g.hud.screenFlash('#e8f8ff', 0.3);
    let tick = 0;
    this.ticker(6, 1, () => fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#bfefff', duration: 1.4, mode: 'glow', opacity: 0.45 }));
    this.ticker(6, 0.03, () => {
      for (let n = 0; n < 7; n++) {
        const a = Math.random() * Math.PI * 2, r = rand(1.5, R);
        fx.burst({ pos: this._v.set(p.pos.x + Math.cos(a) * r, p.pos.y + rand(0.3, 4), p.pos.z + Math.sin(a) * r), count: 1, vel: this._w.set(-Math.sin(a) * 9, -1.2, Math.cos(a) * 9), life: [0.4, 0.8], size: [0.1, 0.25], sizeEnd: 1, color: ['#ffffff', '#e8f8ff', '#bfefff'], sprite: 'spark' });
      }
      if (Math.random() < 0.35) fx.burst({ pos: this._v.set(p.pos.x + rand(-R, R), p.pos.y + rand(0.5, 3), p.pos.z + rand(-R, R)), count: 1, blend: 'normal', vel: this._w.set(rand(-4, 4), 0, rand(-4, 4)), life: [0.8, 1.4], size: [2, 3.5], sizeEnd: 1.5, alpha: 0.25, color: '#f2f8ff', sprite: 'smoke' });
    });
    this.ticker(6, 0.5, () => {
      tick++;
      const ts = this.inRadius(p.pos, R);
      ts.forEach((e) => { this.hit(e, d * 0.5, 'ice', { color: '#bfefff' }); g.enemies.slow(e, 1.2, 0.4); });
      if (tick % 4 === 0) this.freezeGroup(ts.filter((e) => e.alive && !e.isBoss), 0, 1);
      if (tick % 3 === 0) g.audio.play('power_ice', { volume: 0.4, pitch: 0.6 + Math.random() * 0.2 });
    });
  }

  // ================================================================ EARTH
  earth0(d, pw) {   // Rock Throw
    const g = this.game;
    g.audio.play('swing3', { pitch: 0.7 });
    const mesh = new THREE.Mesh(this.rockGeo, this.spikeMat); mesh.castShadow = true;
    this.shoot({ color: '#c08a4a', noSprite: true, mesh, spin: true, speed: 30, gravity: 5, trail: { color: ['#8a7a62'], count: 1, size: [0.2, 0.35] },
      onHit: (pos, e) => {
        g.fx.dust(pos, '#8a7a62', 10, 1.4);
        g.audio.play('power_earth', { pitch: 1.5, volume: 0.6 });
        if (e) this.hit(e, d, 'earth', { knock: 10, from: this.player.pos, color: '#e0b07a' });
      } });
  }
  earth1(d, pw) {   // Spike Line
    const g = this.game, p = this.player;
    g.audio.play('power_earth', { pitch: 1.2 });
    const dir = this.fwd(new THREE.Vector3()), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const L = 14, spots = [];
    for (let t = 1.5; t < L; t += 0.9) for (const sOff of [-0.6, 0.6]) {
      spots.push({ x: p.pos.x + dir.x * t + side.x * (sOff + rand(-0.2, 0.2)), z: p.pos.z + dir.z * t + side.z * (sOff + rand(-0.2, 0.2)), delay: t * 0.025, s: rand(0.6, 1.0) });
    }
    this.spikes(spots, 1.2);
    this.shake(0.25);
    this.inLine(p.pos, dir, L, 2.6).forEach((e) => { this.hit(e, d, 'earth', { color: '#e0b07a' }); g.enemies.lift(e, 6); });
  }
  earth2(d, pw) {   // Ground Slam
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_earth');
    const spots = [];
    [[2.6, 10], [4.6, 15], [6.6, 20]].forEach(([r, n], ri) => {
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + ri * 0.3 + rand(-0.1, 0.1); spots.push({ x: p.pos.x + Math.cos(a) * r, z: p.pos.z + Math.sin(a) * r, cx: p.pos.x, cz: p.pos.z, delay: ri * 0.12, s: rand(0.7, 1.3) * (1 + ri * 0.15) }); }
    });
    this.spikes(spots, 1.5);
    this.shake(0.55);
    fx.ring(this._v.copy(p.pos).setY(p.pos.y + 0.3), '#c08a4a', 7.5, 0.5);
    fx.burst({ pos: this._v.copy(p.pos).setY(p.pos.y + 0.3), count: 40, spread: 3, flat: true, up: 7, velSpread: 3, gravity: 18, life: [0.5, 1.0], size: [0.12, 0.3], color: ['#7d6a55', '#a08a6a', '#5a4a3a'], sprite: 'dot', blend: 'normal' });
    this.inRadius(p.pos, 7.5).forEach((e) => { this.hit(e, d, 'earth', { knock: e.isBoss ? 0 : 14, from: p.pos, color: '#e0b07a' }); g.enemies.lift(e, 7); });
  }
  earth8(d, pw) {   // Earthquake
    const g = this.game, p = this.player, fx = g.fx;
    const R = 14;
    g.audio.play('quake');
    this.shake(1.2);
    const c = p.pos.clone();
    const spots = [];
    for (let k = 0; k < 50; k++) { const a = Math.random() * Math.PI * 2, r = rand(3, R); spots.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, delay: rand(0, 0.9), s: rand(0.6, 1.5) }); }
    this.spikes(spots, 2.2);
    for (let k = 0; k < 3; k++) fx.ground.spawn(g.world, { shape: 'circle', pos: c, radius: 5 + k * 4.5, color: '#ff8a3a', duration: 1.6 + k * 0.2, mode: 'ring', opacity: 0.8 });
    this.ticker(1.6, 0.08, () => { this.shake(0.25); const a = Math.random() * Math.PI * 2, r = rand(0, R); fx.dust(this._v.set(c.x + Math.cos(a) * r, this.ground(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) + 0.2, c.z + Math.sin(a) * r), '#8a7a62', 5, 2.2); });
    this.inRadius(c, R).forEach((e) => { this.hit(e, d, 'earth', { knock: e.isBoss ? 0 : 6, from: c, color: '#e0b07a' }); g.enemies.lift(e, 11); });
    // a second, smaller shake
    this.ticker(0.9, 0.9, () => {}, () => { this.inRadius(c, R).forEach((e) => { if (e.alive) { this.hit(e, d * 0.3, 'earth', { color: '#e0b07a' }); g.enemies.lift(e, 6); } }); g.audio.play('power_earth', { pitch: 0.7 }); });
  }

  // ================================================================ LIGHTNING
  lightning0(d, pw) {   // Spark Bolt
    const g = this.game, p = this.player;
    g.audio.play('zap');
    const from = this.handPos(new THREE.Vector3());
    const e = this.frontEnemy(22, 0.9);
    const to = e ? new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z) : this.fwd(new THREE.Vector3()).multiplyScalar(10).add(p.pos);
    if (!e) to.y = this.ground(to.x, to.z);
    this.bolt([from, to], '#d8d0ff', 0.07, 0.25);
    g.fx.hitSparks(to, '#d8d0ff', true);
    g.fx.flash(to, '#b9b0ff', 25, 12, 0.25);
    if (e) this.hit(e, d, 'lightning', { color: '#d8d0ff' });
  }
  lightning1(d, pw) {   // Chain Lightning
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_lightning');
    const start = this.handPos(new THREE.Vector3());
    const aim = this.aimPoint(30, new THREE.Vector3());
    const chain = [];
    let first = g.enemies.nearest(aim, 6) || this.frontEnemy(18, 1.2);
    if (first) {
      chain.push(first);
      while (chain.length < 6) {
        const nxt = g.enemies.nearest(chain[chain.length - 1].pos, 11, (e) => !chain.includes(e));
        if (!nxt) break;
        chain.push(nxt);
      }
    }
    const pts = [start];
    chain.forEach((e) => pts.push(new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z)));
    if (!chain.length) { pts.length = 0; pts.push(new THREE.Vector3(aim.x + rand(-2, 2), aim.y + 30, aim.z + rand(-2, 2)), aim.clone()); }
    this.bolt(pts, '#d8d0ff');
    fx.flash(pts[pts.length - 1], '#b9b0ff', 50, 20, 0.35);
    g.hud.screenFlash('#d8d0ff', 0.18);
    chain.forEach((e, k) => { this.hit(e, d * Math.pow(0.85, k), 'lightning', { color: '#d8d0ff' }); fx.hitSparks(new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z), '#d8d0ff', true); });
    if (!chain.length) { fx.hitSparks(aim, '#d8d0ff', true); this.inRadius(aim, 2.5).forEach((e) => this.hit(e, d, 'lightning')); }
  }
  lightning4(d, pw) {   // Thunder Dash: zip forward through enemies
    const g = this.game, p = this.player;
    g.audio.play('zap'); g.audio.play('blink', { pitch: 1.3 });
    const e = this.frontEnemy(14, 0.7);
    const dir = this.fwd(new THREE.Vector3());
    let len = 12;
    if (e) { const de = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); len = clamp(de + 3, 6, 15); }
    const to = p.pos.clone().addScaledVector(dir, len);
    const r = Math.hypot(to.x, to.z), R = g.world.radius - 3;
    if (r > R) { to.x *= R / r; to.z *= R / r; }
    this.startDash(p, { to, d, dur: 0.25, color: '#d8d0ff', kind: 'thunder', power: 'lightning' });
    g.fx.flash(this.chest(this._v), '#b9b0ff', 40, 14, 0.4);
  }
  lightning8(d, pw) {   // Thunderstorm: 12 strikes
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('thunder', { volume: 1 });
    g.hud.screenFlash('#3a3a5a', 0.35);
    let n = 0;
    this.ticker(5.2, 0.05, () => {
      // storm cloud above the hero
      for (let k = 0; k < 2; k++) fx.burst({ pos: this._v.set(p.pos.x + rand(-12, 12), p.pos.y + rand(13, 16), p.pos.z + rand(-12, 12)), count: 1, blend: 'normal', vel: this._w.set(rand(-1, 1), 0, rand(-1, 1)), life: [1.2, 2], size: [5, 8], sizeEnd: 1.3, alpha: 0.35, color: ['#2a2a3a', '#3a3a50'], sprite: 'smoke' });
    });
    this.ticker(4.8, 0.4, () => {
      if (n >= 12) return;
      n++;
      const near = this.inRadius(p.pos, 18).filter((e) => e.alive);
      const e = near.length ? near[Math.floor(Math.random() * near.length)] : null;
      const to = e ? new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z) : new THREE.Vector3(p.pos.x + rand(-14, 14), 0, p.pos.z + rand(-14, 14));
      if (!e) to.y = this.ground(to.x, to.z);
      const top = to.clone().add(new THREE.Vector3(rand(-3, 3), 22, rand(-3, 3)));
      this.bolt([top, to], '#e8e4ff', 0.14, 0.3);
      fx.flash(to, '#c8c0ff', 60, 22, 0.3);
      fx.hitSparks(to, '#e8e4ff', true);
      fx.ground.spawn(g.world, { shape: 'circle', pos: to, radius: 2.5, color: '#b9b0ff', duration: 0.6, mode: 'glow' });
      g.audio.play('zap', { pitch: 0.7 });
      if (n % 3 === 1) g.audio.play('thunder', { volume: 0.6 });
      if (e) this.hit(e, d * 0.45, 'lightning', { color: '#d8d0ff' });
      this.inRadius(to, 2.5).forEach((o) => { if (o !== e) this.hit(o, d * 0.25, 'lightning', { color: '#d8d0ff' }); });
    });
  }

  // ================================================================ LIGHT
  light0(d, pw) {   // Light Arrow
    const g = this.game;
    g.audio.play('shoot', { pitch: 2 });
    this.shoot({ color: '#fff6c8', size: 0.55, speed: 75, range: 55, trail: { color: ['#fff3b0', '#ffffff'], count: 3, size: [0.12, 0.25], life: [0.1, 0.25] },
      onHit: (pos, e) => { g.fx.sparkles(pos, '#fff3b0', 10, 2.5); if (e) this.hit(e, d, 'light', { color: '#fff3b0' }); } });
  }
  light1(d, pw) {   // Light Beam
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_light');
    const from = this.handPos(new THREE.Vector3());
    const aim = this.aimPoint(45, new THREE.Vector3());
    const dir = aim.clone().sub(from); if (dir.lengthSq() < 0.01) this.fwd(dir); dir.normalize();
    const L = 45;
    let vis = L;
    for (let t = 1; t < L; t += 0.7) { const x = from.x + dir.x * t, y = from.y + dir.y * t, z = from.z + dir.z * t; if (y < g.world.heightAt(x, z) - 0.2) { vis = t; break; } }
    const end = from.clone().addScaledVector(dir, vis);
    this.beamMesh(from, end, pw.color, 0.9, 0.55);
    fx.flash(from, '#fff3b0', 45, 25, 0.5);
    fx.burst({ pos: end, count: 30, velSpread: 6, up: 3, gravity: 6, life: [0.4, 0.8], size: [0.12, 0.3], color: ['#fff3b0', '#ffffff'], sprite: 'spark' });
    g.hud.screenFlash('#fff6c8', 0.3);
    for (const e of g.enemies.targets()) {
      const c = this._v.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z).sub(from);
      const along = c.dot(dir);
      if (along < 0 || along > vis + 1) continue;
      const perp = c.addScaledVector(dir, -along).length();
      if (perp < e.radius + 1.0 + (e.isBoss ? e.height * 0.25 : 0)) this.hit(e, d, 'light', { color: '#fff3b0' });
    }
  }
  light2(d, pw) {   // Flash: stuns everything around
    const g = this.game, p = this.player, fx = g.fx;
    const R = 9;
    g.audio.play('flash');
    g.hud.screenFlash('#ffffff', 0.7);
    const c = this.chest(this._v);
    fx.flash(c, '#fff6c8', 90, 30, 0.5);
    fx.ring(c, '#fff3b0', R, 0.45);
    fx.burst({ pos: c, count: 60, spread: 0.3, radial: 12, velSpread: 2, drag: 3, life: [0.3, 0.6], size: [0.2, 0.45], color: ['#ffffff', '#fff3b0'], sprite: 'spark' });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#fff3b0', duration: 0.8, mode: 'glow', opacity: 0.7 });
    this.inRadius(p.pos, R).forEach((e) => { this.hit(e, d, 'light', { color: '#fff3b0', label: 'Stunned!' }); g.enemies.stun(e, 2); });
  }
  light8(d, pw) {   // Sunburst: a tiny sun explodes above you
    const g = this.game, p = this.player, fx = g.fx;
    const R = 12;
    g.audio.play('power_light', { pitch: 0.8 });
    const mat = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
    const sun = new THREE.Mesh(this.sphereGeo, mat);
    const glow = fx.sprite('#ffd34a', 4);
    const L = fx.holdLight('#ffe08a', 40, 30);
    fx.timedMesh(sun, 1.0, (o, k) => {
      o.position.set(p.pos.x, p.pos.y + 3 + k * 4, p.pos.z);
      o.scale.setScalar(0.3 + k * 1.4);
      glow.position.copy(o.position); glow.scale.setScalar(3 + k * 9);
      if (L) { L.position.copy(o.position); L.intensity = 20 + k * 80; }
      fx.burst({ pos: o.position, count: 3, spread: 0.5, velSpread: 4, life: [0.2, 0.4], size: [0.2, 0.4], color: ['#ffffff', '#fff3b0', '#ffd34a'], sprite: 'spark' });
    }, () => {
      const at = new THREE.Vector3(p.pos.x, p.pos.y + 7, p.pos.z);
      mat.dispose(); fx.freeSprite(glow); fx.releaseLight(L);
      g.audio.play('superBoom', { pitch: 1.3 }); g.audio.play('flash');
      g.hud.screenFlash('#fff6c8', 0.85);
      this.shake(0.6);
      fx.flash(at, '#fff6c8', 120, 45, 1);
      fx.burst({ pos: at, count: 140, spread: 0.6, radial: 16, velSpread: 3, drag: 1.8, life: [0.6, 1.2], size: [0.3, 0.7], color: ['#ffffff', '#fff3b0', '#ffd34a'], sprite: 'spark' });
      fx.burst({ pos: at, count: 30, spread: 1, radial: 6, life: [0.5, 0.9], size: [3, 5], sizeEnd: 2, alpha: 0.6, color: ['#fff3b0', '#ffd34a'], sprite: 'dot' });
      fx.ring(at.clone().setY(p.pos.y + 0.5), '#fff3b0', R, 0.6);
      fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#ffd34a', duration: 1.6, mode: 'glow', opacity: 0.7 });
      this.inRadius(p.pos, R).forEach((e) => { this.hit(e, d, 'light', { color: '#fff3b0', knock: 8, from: p.pos }); g.enemies.burn(e, 2, 6 * this.scale()); });
    });
  }

  // ================================================================ DARKNESS
  darkness0(d, pw) {   // Shadow Bolt
    const g = this.game;
    g.audio.play('shoot', { pitch: 0.8 });
    this.shoot({ color: '#8a4dff', size: 0.9, speed: 34, trail: { color: ['#8a4dff', '#3a1a6a', '#d0b0ff'], count: 3, size: [0.3, 0.55] },
      onHit: (pos, e) => { g.fx.burst({ pos, count: 16, velSpread: 4, life: [0.3, 0.6], size: [0.2, 0.4], color: ['#8a4dff', '#d0b0ff'], sprite: 'spark' }); if (e) this.hit(e, d, 'darkness', { color: '#c8a0ff' }); } });
  }
  darkness1(d, pw) {   // Shadow Step: appear behind the enemy in front
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('blink');
    const e = this.frontEnemy(16, 1.0);
    const from = p.pos.clone();
    let to;
    if (e) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, L = Math.hypot(dx, dz) || 1;
      to = new THREE.Vector3(e.pos.x + dx / L * (e.radius + 1.3), 0, e.pos.z + dz / L * (e.radius + 1.3));
    } else to = this.fwd(new THREE.Vector3()).multiplyScalar(8).add(p.pos);
    if (g.colliders) g.colliders.resolve(to, p.radius);
    to.y = p.groundAt(to.x, to.z, p.pos.y + 3);
    const puff = (at) => {
      fx.burst({ pos: this._v.set(at.x, at.y + 1, at.z), count: 20, blend: 'normal', spread: 0.6, up: 1, velSpread: 1.5, life: [0.5, 0.9], size: [0.8, 1.4], sizeEnd: 1.8, alpha: 0.6, color: ['#1a1028', '#3a1a6a'], sprite: 'smoke' });
      fx.burst({ pos: this._v.set(at.x, at.y + 1, at.z), count: 16, spread: 0.5, velSpread: 3, life: [0.3, 0.6], size: [0.15, 0.3], color: ['#8a4dff', '#d0b0ff'], sprite: 'spark' });
    };
    puff(from);
    p.pos.copy(to); p.vel.set(0, 0, 0);
    if (e) p.yaw = Math.atan2(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
    p.syncRig();
    puff(to);
    p.fadeT = Math.max(p.fadeT, 1.5);
    // flicker the hero while fading back in
    let f = 0;
    this.ticker(0.5, 0.05, () => { f++; if (p.rig) p.rig.root.visible = f % 2 === 0; }, () => { if (p.rig) p.rig.root.visible = true; });
    if (e) {
      this.hit(e, d, 'darkness', { label: 'Surprise!', crit: true, color: '#c8a0ff' });
      g.fx.hitSparks(new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z), '#c8a0ff', true);
      g.hitStop(0.06);
    }
  }
  darkness2(d, pw) {   // Black Hole
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_darkness');
    const aim = this.aimPoint(16, new THREE.Vector3());
    const c = new THREE.Vector3(aim.x, g.world.heightAt(aim.x, aim.z), aim.z);
    if (c.distanceTo(p.pos) > 16 || c.distanceTo(p.pos) < 3) { c.copy(p.pos).addScaledVector(this.fwd(this._w), 8); c.y = g.world.heightAt(c.x, c.z); }
    const R = 8;
    fx.ground.spawn(g.world, { shape: 'circle', pos: c, radius: R, color: '#5a2aa0', duration: 3.2, mode: 'glow', opacity: 0.8 });
    fx.ground.spawn(g.world, { shape: 'circle', pos: c, radius: R, color: '#b080ff', duration: 3.2, mode: 'ring', opacity: 0.6 });
    const core = new THREE.Mesh(this.sphereGeo, new THREE.MeshBasicMaterial({ color: '#05020a' }));
    core.position.set(c.x, c.y + 1.4, c.z);
    fx.timedMesh(core, 3.1, (o, k) => { o.scale.setScalar((k < 0.1 ? k / 0.1 : k > 0.9 ? (1 - k) / 0.1 : 1) * (0.9 + Math.sin(k * 30) * 0.06)); }, () => core.material.dispose());
    const L = fx.holdLight('#8a4dff', 25, 16);
    if (L) L.position.set(c.x, c.y + 2, c.z);
    const caught = this.inRadius(c, R);
    caught.forEach((e) => g.enemies.pullTo(e, c, 3));
    this.ticker(3, 0.04, () => {
      for (let n = 0; n < 3; n++) {
        const a = Math.random() * Math.PI * 2, r = rand(2, R);
        const pos = this._v.set(c.x + Math.cos(a) * r, c.y + rand(0.2, 2.5), c.z + Math.sin(a) * r);
        const vel = this._w.set(-Math.sin(a) * 5 - Math.cos(a) * 4, 0.6, Math.cos(a) * 5 - Math.sin(a) * 4);
        fx.burst({ pos, count: 1, vel, life: [0.5, 0.9], size: [0.25, 0.5], color: ['#8a4dff', '#d0b0ff', '#3a1a6a'], sprite: 'dot' });
      }
    }, () => {
      fx.releaseLight(L);
      fx.burst({ pos: this._v.set(c.x, c.y + 1, c.z), count: 40, spread: 0.4, radial: 8, life: [0.4, 0.8], size: [0.3, 0.6], color: ['#8a4dff', '#ffffff'], sprite: 'spark' });
      fx.flash(c, '#8a4dff', 40, 16, 0.5);
      this.inRadius(c, R).forEach((e) => this.hit(e, d * 0.6, 'darkness', { color: '#c8a0ff' }));
      g.audio.play('explosion', { volume: 0.5, pitch: 0.6 });
    });
    this.ticker(3, 0.5, () => { caught.forEach((e) => { if (e.alive) this.hit(e, d * 0.2, 'darkness', { color: '#c8a0ff' }); }); });
  }
  darkness8(d, pw) {   // Eclipse: 6 s of darkness, enemies get hurt and lose you
    const g = this.game, p = this.player, fx = g.fx;
    const R = 12;
    g.audio.play('power_darkness', { pitch: 0.6 });
    p.fadeT = Math.max(p.fadeT, 6);
    g.enemies.list.forEach((e) => { if (e.alive && e.state === 'chase' && e.kind !== 'minion') e.state = 'return'; });
    const mat = new THREE.MeshBasicMaterial({ color: '#0a0414', transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false });
    const dome = new THREE.Mesh(this.sphereGeo, mat);
    dome.scale.setScalar(R);
    fx.timedMesh(dome, 6, (o, k) => {
      o.position.set(p.pos.x, p.pos.y, p.pos.z);
      mat.opacity = 0.45 * (k < 0.08 ? k / 0.08 : k > 0.9 ? (1 - k) / 0.1 : 1);
    }, () => mat.dispose());
    this.ticker(6, 0.04, () => {
      const a = Math.random() * Math.PI * 2, r = rand(2, R);
      fx.burst({ pos: this._v.set(p.pos.x + Math.cos(a) * r, p.pos.y + rand(0, 5), p.pos.z + Math.sin(a) * r), count: 1, vel: this._w.set(-Math.sin(a) * 3, 0.3, Math.cos(a) * 3), life: [0.6, 1.1], size: [0.15, 0.3], color: ['#8a4dff', '#d0b0ff'], sprite: 'spark' });
    });
    this.ticker(6, 0.5, () => {
      this.inRadius(p.pos, R).forEach((e) => { this.hit(e, d * 0.5, 'darkness', { color: '#c8a0ff' }); });
      p.fadeT = Math.max(p.fadeT, 0.6);
    });
  }

  // ================================================================ DEATH
  death0(d, pw) {   // Soul Bolt: steals a bit of life
    const g = this.game, p = this.player;
    g.audio.play('shoot', { pitch: 0.65 });
    this.shoot({ color: '#e0b0ff', size: 0.85, speed: 30, trail: { color: ['#e0b0ff', '#b8ffe0', '#ffffff'], count: 2, size: [0.25, 0.5] },
      onHit: (pos, e) => {
        g.fx.burst({ pos, count: 14, velSpread: 3, life: [0.3, 0.6], size: [0.2, 0.4], color: ['#e0b0ff', '#b8ffe0'], sprite: 'spark' });
        if (e) { const dealt = this.hit(e, d, 'death', { color: '#e0a0ff' }); p.heal(dealt * 0.3); }
      } });
  }
  scytheArc(R, half, color, dur = 0.6, inner = 3) {
    const g = this.game, p = this.player, fx = g.fx;
    const geo = new THREE.RingGeometry(inner, R, 40, 1, -half, half * 2).rotateX(-Math.PI / 2);
    const mat = this.addMat(color, 0);
    const mesh = new THREE.Mesh(geo, mat);
    const edgeGeo = new THREE.RingGeometry(R - 0.5, R, 40, 1, -half, half * 2).rotateX(-Math.PI / 2);
    const edge = new THREE.Mesh(edgeGeo, this.addMat('#ffffff', 0));
    const grp = new THREE.Group(); grp.add(mesh, edge);
    grp.position.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
    grp.rotation.y = p.yaw - Math.PI / 2;
    fx.timedMesh(grp, dur, (o, k) => {
      const a = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      mat.opacity = 0.55 * a; edge.material.opacity = 0.9 * a;
      mesh.rotation.y = (k - 0.5) * 1.4; edge.rotation.y = mesh.rotation.y;
    }, () => { geo.dispose(); mat.dispose(); edgeGeo.dispose(); edge.material.dispose(); });
  }
  death1(d, pw) {   // Scythe Swing
    const g = this.game;
    g.audio.play('swing3', { pitch: 0.8 }); g.audio.play('power_death', { pitch: 1.4, volume: 0.6 });
    this.scytheArc(7, 1.2, pw.color, 0.45, 1.5);
    this.inCone(7, 1.2).forEach((e) => { this.hit(e, d, 'death', { color: '#e0a0ff', knock: 4, from: this.player.pos }); });
  }
  death2(d, pw) {   // Grave Hands
    const g = this.game, p = this.player, fx = g.fx;
    const R = 8;
    g.audio.play('power_death', { pitch: 0.8 });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#b8ffe0', duration: 2.5, mode: 'glow', opacity: 0.45 });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#d04dff', duration: 1, mode: 'ring' });
    this.inRadius(p.pos, R).forEach((e) => {
      this.grabbers(e, this.ghostMat, 2.5, 5);
      g.enemies.root(e, 2.5);
      this.hit(e, d, 'death', { color: '#e0a0ff' });
      fx.burst({ pos: this._v.set(e.pos.x, e.pos.y + 0.5, e.pos.z), count: 14, spread: e.radius, up: 2, life: [0.6, 1.1], size: [0.2, 0.4], color: ['#b8ffe0', '#e0b0ff'], sprite: 'spark' });
    });
  }
  death8(d, pw) {   // Reaper's Call: ordinary enemies crumble, bosses + night creatures take big damage
    const g = this.game, p = this.player, fx = g.fx;
    const R = 11, half = 1.25;
    g.audio.play('power_death');
    this.scytheArc(R, half, pw.color, 0.7, 3);
    g.hud.screenFlash('#d04dff', 0.4);
    fx.flash(this._v.copy(p.pos).setY(p.pos.y + 1.5), '#d04dff', 50, 20, 0.7);
    this.shake(0.4);
    this.inCone(R, half).forEach((e) => {
      const at = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
      fx.burst({ pos: at, count: 25, blend: 'normal', spread: e.radius, up: 1.5, velSpread: 1.5, gravity: -1, life: [0.8, 1.5], size: [0.4, 0.9], sizeEnd: 1.5, alpha: 0.5, color: ['#9a8aa8', '#5a4a6a'], sprite: 'smoke' });
      if (!e.isBoss && e.kind !== 'night') this.hit(e, e.hp + 1, 'death', { label: 'Crumble!', color: '#e0a0ff', crumble: true });
      else this.hit(e, d, 'death', { color: '#e0a0ff' });
    });
  }


  // ================================================================ NEW MOVES (temple tiers 1 and 2)
  // ---- LIFE
  life3(d, pw, mv) { this.suit('bark', '#8a6a3a', mv); }                                   // Bark Suit
  life4(d, pw) {                                                                            // Seed Bomb
    const g = this.game;
    g.audio.play('shoot', { pitch: 0.9 });
    const seed = new THREE.Mesh(this.sphereGeo, this.thornMat); seed.scale.setScalar(0.32); seed.castShadow = true;
    this.shoot({ color: '#7dff6a', size: 0.6, speed: 22, gravity: 9, mesh: seed, spin: true, trail: { color: ['#7dff6a', '#3a8a2a'], count: 1, size: [0.15, 0.3] },
      onHit: (pos) => {
        const spots = [];
        for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = rand(0.6, 3.4); spots.push({ x: pos.x + Math.cos(a) * r, z: pos.z + Math.sin(a) * r, cx: pos.x, cz: pos.z, delay: r * 0.03, s: rand(0.35, 0.6) }); }
        this.spikes(spots, 1.0, this.thornMat);
        g.fx.burst({ pos, count: 30, radial: 6, velSpread: 2, up: 3, gravity: 10, life: [0.4, 0.8], size: [0.12, 0.25], color: ['#7dff6a', '#3a8a2a', '#d8ffb0'], sprite: 'spark' });
        g.audio.play('power_life', { pitch: 1.3, volume: 0.7 });
        this.inRadius(pos, 4).forEach((e) => this.hit(e, d, 'life', { color: pw.color, knock: 5, from: pos }));
      } });
  }
  life5(d, pw, mv) {                                                                        // Healing Flowers
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_healing', { pitch: 1.2 });
    const heal = p.stat('healBonus', 1);
    this.zone({ radius: 4, dur: mv.duration || 8, color: '#ff9ad8', opacity: 0.45, interval: 0.5,
      vis: (c) => { if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2, r = Math.random() * 4; fx.burst({ pos: this._v.set(c.x + Math.cos(a) * r, this.ground(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) + 0.2, c.z + Math.sin(a) * r), count: 1, up: 1.2, life: [0.8, 1.4], size: [0.2, 0.35], color: ['#ff9ad8', '#ffe08a', '#ffffff', '#9aff7a'], sprite: 'spark' }); } },
      tick: (es, c) => { g.players.forEach((q) => { if (!q.dead && Math.hypot(q.pos.x - c.x, q.pos.z - c.z) < 4.2) q.heal(q.maxHp * 0.03 * heal); }); } });
  }
  life6(d, pw, mv) { this.summonHelper('treant', mv, d); }                                  // Treant Buddy
  life7(d, pw, mv) {                                                                        // Thorn Storm
    const g = this.game, fx = g.fx;
    g.audio.play('whip', { pitch: 0.7 });
    this.zone({ follow: true, radius: 6, dur: mv.duration || 5, color: pw.color, opacity: 0.35, interval: 0.5,
      vis: (c) => { for (let n = 0; n < 4; n++) { const a = Math.random() * Math.PI * 2, r = rand(1.2, 6); fx.burst({ pos: this._v.set(c.x + Math.cos(a) * r, c.y + rand(0.3, 2.5), c.z + Math.sin(a) * r), count: 1, blend: 'normal', vel: this._w.set(-Math.sin(a) * 8, 0.5, Math.cos(a) * 8), life: [0.4, 0.7], size: [0.12, 0.22], sizeEnd: 1, color: ['#4faf3a', '#8adf5a', '#6a8a2a'], sprite: 'dot' }); } },
      tick: (es) => { es.forEach((e) => this.hit(e, d * 0.5, 'life', { color: pw.color })); if (es.length) g.audio.play('whip', { volume: 0.3, pitch: 1.4 }); } });
  }

  // ---- HEALING
  healing3(d, pw, mv) { this.suit('holy', '#fffbe8', mv); }                                // Holy Suit
  healing4(d, pw) { this.game.audio.play('power_healing', { pitch: 1.5 }); this.drainBeam(pw.color, d, 1.0, 0.8, 'healing'); }   // Life Link
  healing5(d, pw, mv) {                                                                     // Healing Rain
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_healing', { pitch: 0.8 });
    const heal = p.stat('healBonus', 1);
    this.zone({ follow: true, radius: 7, dur: mv.duration || 6, color: pw.color, opacity: 0.35, interval: 0.5,
      vis: (c) => { for (let n = 0; n < 3; n++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 7; fx.burst({ pos: this._v.set(c.x + Math.cos(a) * r, c.y + 7, c.z + Math.sin(a) * r), count: 1, vel: this._w.set(0, -14, 0), life: [0.45, 0.5], size: [0.1, 0.16], sizeEnd: 1, color: ['#7fffd4', '#ffffff'], sprite: 'spark' }); } },
      tick: (es, c) => {
        g.players.forEach((q) => { if (!q.dead && Math.hypot(q.pos.x - c.x, q.pos.z - c.z) < 7.2) q.heal(q.maxHp * 0.02 * heal, false); });
        es.forEach((e) => this.hit(e, d * 0.5, 'healing', { color: pw.color }));
      } });
  }
  healing6(d, pw, mv) { this.summonHelper('spirit', mv, d); }                               // Guardian Spirit
  healing7(d, pw, mv) {                                                                     // Second Chance
    const g = this.game, p = this.player;
    p.secondChanceT = mv.duration || 60;
    g.audio.play('shield', { pitch: 1.3 });
    g.fx.sparkles(this.chest(this._v, p), pw.color, 50, 4);
    g.fx.ring(this._v.set(p.pos.x, p.pos.y + 0.3, p.pos.z), pw.color, 3, 0.5);
    g.hud.toastFor(p, 'Second Chance! If you get knocked out in the next minute, you jump straight back up.', 'good', 3);
  }

  // ---- FIRE
  fire3(d, pw, mv) { this.suit('fire', '#ff6a1a', mv, d); }                                // Fire Suit
  fire4(d, pw) {                                                                            // Flame Dash
    const p = this.player;
    this.game.audio.play('power_fire', { pitch: 1.4 }); this.game.audio.play('blink', { pitch: 0.8 });
    this.startDash(p, { to: this.dashTarget(p, 12), d, dur: 0.28, color: '#ff8a2a', kind: 'flame', power: 'fire' });
  }
  firePatch(at, dps, dur = 3) {
    const g = this.game, fx = g.fx, c = at.clone();
    fx.ground.spawn(g.world, { shape: 'circle', pos: c, radius: 1.5, color: '#ff5a10', duration: dur, mode: 'glow', opacity: 0.7 });
    this.ticker(dur, 0.06, () => fx.burst({ pos: this._v.set(c.x + rand(-1, 1), c.y + 0.2, c.z + rand(-1, 1)), count: 1, up: 2.5, life: [0.3, 0.6], size: [0.3, 0.6], color: ['#ff6a1a', '#ffb347', '#ffe08a'], sprite: 'dot' }));
    this.ticker(dur, 0.5, () => this.inRadius(c, 1.6).forEach((e) => { this.hit(e, dps * 0.5, 'fire', { color: '#ffb347' }); this.game.enemies.burn(e, 2, dps * 0.4); }));
  }
  fire5(d, pw, mv) {                                                                        // Lava Pool
    const g = this.game, p = this.player, fx = g.fx;
    const c = this.fwd(new THREE.Vector3(), p).multiplyScalar(6).add(p.pos); c.y = this.ground(c.x, c.z);
    g.audio.play('explosion', { pitch: 0.7, volume: 0.6 });
    const L = fx.holdLight('#ff6a1a', 25, 12); if (L) L.position.set(c.x, c.y + 1.2, c.z);
    this.zone({ center: c, radius: 4, dur: mv.duration || 6, color: '#ff5a10', opacity: 0.85, interval: 0.5,
      vis: (cc) => { if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2, r = Math.random() * 3.6; fx.burst({ pos: this._v.set(cc.x + Math.cos(a) * r, cc.y + 0.15, cc.z + Math.sin(a) * r), count: 2, up: 3, velSpread: 0.6, gravity: 8, life: [0.4, 0.8], size: [0.25, 0.5], color: ['#ff6a1a', '#ffb347', '#ffe08a'], sprite: 'dot' }); } },
      tick: (es) => es.forEach((e) => { this.hit(e, d * 0.5, 'fire', { color: '#ffb347' }); g.enemies.burn(e, 2, 6 * this.scale()); g.enemies.slow(e, 0.8, 0.6); }),
      end: () => fx.releaseLight(L) });
  }
  fire6(d, pw, mv) { this.summonHelper('phoenix', mv, d); }                                 // Fire Phoenix
  fire7(d, pw) {                                                                            // Volcano Burst
    const g = this.game, p = this.player, fx = g.fx, w = g.world;
    g.audio.play('quake', { pitch: 1.3, volume: 0.7 });
    this.shake(0.4);
    const c = p.pos.clone();
    const spots = [];
    const es = this.inRadius(c, 10).slice(0, 5);
    es.forEach((e) => spots.push(new THREE.Vector3(e.pos.x, 0, e.pos.z)));
    while (spots.length < 9) { const a = Math.random() * Math.PI * 2, r = rand(3, 9.5); spots.push(new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r)); }
    spots.forEach((s, i) => {
      s.y = w.heightAt(s.x, s.z);
      const delay = 0.35 + i * 0.1;
      fx.ground.spawn(w, { shape: 'circle', pos: s, radius: 2.2, color: '#ff7a1a', duration: delay });
      this.ticker(delay, delay, () => {}, () => {
        fx.burst({ pos: this._v.set(s.x, s.y + 0.3, s.z), count: 40, spread: 0.6, vel: this._w.set(0, 14, 0), velSpread: 2.5, gravity: 14, life: [0.6, 1.1], size: [0.4, 0.9], sizeEnd: 0.3, color: ['#ff6a1a', '#ffb347', '#ffe08a', '#ff3a10'], sprite: 'dot' });
        fx.burst({ pos: this._v.set(s.x, s.y + 2, s.z), count: 8, blend: 'normal', spread: 0.8, up: 3, life: [1, 1.6], size: [1.2, 2], sizeEnd: 2, alpha: 0.35, color: '#2a2222', sprite: 'smoke' });
        fx.flash(this._v.set(s.x, s.y + 2, s.z), '#ff7a2a', 30, 12, 0.4);
        g.audio.play('explosion', { volume: 0.4, pitch: 1.4 });
        this.inRadius(s, 2.4).forEach((e) => { this.hit(e, d, 'fire', { color: '#ffb347' }); g.enemies.lift(e, 8); g.enemies.burn(e, 2, 6 * this.scale()); });
      });
    });
  }

  // ---- ICE
  ice3(d, pw, mv) { this.suit('ice', '#9fe8ff', mv); }                                      // Ice Suit
  ice4(d, pw) {                                                                             // Ice Slide
    const p = this.player;
    this.game.audio.play('power_ice', { pitch: 1.6 });
    this.startDash(p, { to: this.dashTarget(p, 12), d, dur: 0.34, color: '#bfefff', kind: 'ice', power: 'ice' });
  }
  ice5() { this.wall('ice'); }                                                              // Ice Wall
  ice6(d, pw, mv) { this.summonHelper('snowgolem', mv, d); }                                // Snow Golem
  ice7(d, pw, mv) {                                                                         // Icicle Rain
    const g = this.game, fx = g.fx;
    g.audio.play('power_ice', { pitch: 0.9 });
    this.zone({ follow: true, radius: 8, dur: mv.duration || 4, color: '#bfefff', opacity: 0.35, interval: 0.25,
      tick: (es, c) => {
        const e = es.length ? es[Math.floor(Math.random() * es.length)] : null;
        const at = e ? new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z) : new THREE.Vector3(c.x + rand(-7, 7), 0, c.z + rand(-7, 7));
        if (!e) at.y = this.ground(at.x, at.z);
        const ic = new THREE.Mesh(this.shardGeo, this.iceMat);
        ic.rotation.x = Math.PI / 2;
        const top = at.clone().setY(at.y + 9);
        fx.timedMesh(ic, 0.35, (o, k) => { o.position.lerpVectors(top, at, k * k); }, () => {
          fx.burst({ pos: at.clone().setY(at.y + 0.3), count: 10, velSpread: 3, up: 2, gravity: 10, life: [0.3, 0.5], size: [0.08, 0.18], color: ['#ffffff', '#bfefff'], sprite: 'spark' });
          if (e && e.alive) { this.hit(e, d * 0.5, 'ice', { color: '#bfefff' }); g.enemies.slow(e, 1.5, 0.5); }
        });
      } });
  }

  // ---- EARTH
  earth3(d, pw, mv) { this.suit('stone', '#a08a6a', mv); }                                  // Stone Suit
  earth4(d, pw) {                                                                           // Boulder Roll
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('quake', { pitch: 1.6, volume: 0.6 });
    const dir = this.fwd(new THREE.Vector3(), p);
    const from = p.pos.clone().addScaledVector(dir, 1.5);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), this.spikeMat); rock.castShadow = true;
    const hitSet = new Set(), L = 26, dur = 1.6;
    fx.timedMesh(rock, dur, (o, k) => {
      const pos = from.clone().addScaledVector(dir, L * k);
      pos.y = g.world.heightAt(pos.x, pos.z) + 1.3;
      o.position.copy(pos);
      o.rotation.x += 0.25 * Math.cos(p.yaw); o.rotation.z -= 0.25 * Math.sin(p.yaw);
      if (Math.random() < 0.6) fx.dust(this._v.set(pos.x, pos.y - 1.1, pos.z), '#8a7a62', 2, 1.4);
      for (const e of this.inRadius(pos, 1.9)) {
        if (hitSet.has(e)) continue;
        hitSet.add(e);
        this.hit(e, d, 'earth', { knock: 14, from: pos, color: '#e0b07a' });
        g.enemies.lift(e, 7);
        g.audio.play('bossSlam', { volume: 0.4, pitch: 1.5 });
      }
    }, () => { fx.dust(rock.position, '#8a7a62', 14, 2); rock.geometry.dispose(); });
  }
  earth5() { this.wall('stone'); }                                                          // Stone Wall
  earth6(d, pw, mv) { this.summonHelper('rockgolem', mv, d); }                              // Rock Golem
  earth7(d, pw, mv) {                                                                       // Sandstorm
    const g = this.game, fx = g.fx;
    g.audio.play('quake', { pitch: 2, volume: 0.4 });
    this.zone({ follow: true, radius: 7, dur: mv.duration || 5, color: '#d9a66e', opacity: 0.3, interval: 0.5,
      vis: (c) => { for (let n = 0; n < 3; n++) { const a = Math.random() * Math.PI * 2, r = rand(1.5, 7); fx.burst({ pos: this._v.set(c.x + Math.cos(a) * r, c.y + rand(0.2, 3), c.z + Math.sin(a) * r), count: 1, blend: 'normal', vel: this._w.set(-Math.sin(a) * 9, 0.6, Math.cos(a) * 9), life: [0.5, 0.9], size: [0.8, 1.6], sizeEnd: 1.6, alpha: 0.35, color: ['#d9b878', '#c49a5a', '#e8d2a0'], sprite: 'smoke' }); } },
      tick: (es) => es.forEach((e) => { this.hit(e, d * 0.5, 'earth', { color: '#e0b07a' }); g.enemies.slow(e, 1, 0.6); }) });
  }

  // ---- LIGHTNING
  lightning2(d, pw) {                                                                       // Thunder Clap
    const g = this.game, p = this.player, fx = g.fx;
    const R = 7;
    g.audio.play('thunder', { volume: 0.8 }); g.audio.play('zap');
    const c = this.chest(this._v, p);
    fx.ring(c, '#d8d0ff', R, 0.4);
    fx.flash(c, '#b9b0ff', 60, 20, 0.4);
    fx.burst({ pos: c, count: 40, spread: 0.4, radial: 10, flat: true, drag: 3, life: [0.3, 0.6], size: [0.15, 0.3], color: ['#d8d0ff', '#ffffff'], sprite: 'spark' });
    this.shake(0.3);
    this.inRadius(p.pos, R).forEach((e) => { this.hit(e, d, 'lightning', { color: '#d8d0ff', label: 'Stunned!' }); g.enemies.stun(e, 1.5); this.bolt([new THREE.Vector3(e.pos.x, e.pos.y + 6, e.pos.z), new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z)], '#e8e4ff', 0.07, 0.25); });
  }
  lightning3(d, pw, mv) { this.suit('storm', '#b9b0ff', mv, d); }                           // Storm Suit
  lightning5(d, pw, mv) {                                                                   // Ball Lightning
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('zap', { pitch: 0.6 });
    const dir = this.fwd(new THREE.Vector3(), p);
    const pos = this.chest(new THREE.Vector3(), p).addScaledVector(dir, 1.2);
    const spr = fx.sprite('#c8c0ff', 2.2);
    const L = fx.holdLight('#b9b0ff', 20, 10);
    const dur = mv.duration || 4;
    this.ticker(dur, 0.03, () => {
      pos.addScaledVector(dir, 6 * 0.03);
      pos.y = Math.max(pos.y, g.world.heightAt(pos.x, pos.z) + 1.2);
      spr.position.copy(pos); spr.material.opacity = 0.7 + Math.random() * 0.3;
      if (L) L.position.copy(pos);
      if (Math.random() < 0.4) this.bolt([pos.clone(), pos.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1.5, 1.5)))], '#e8e4ff', 0.04, 0.12);
    }, () => { fx.freeSprite(spr); fx.releaseLight(L); fx.hitSparks(pos, '#d8d0ff', true); });
    this.ticker(dur, 0.5, () => {
      this.inRadius(pos, 4.5).forEach((e) => { this.bolt([pos.clone(), new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z)], '#d8d0ff', 0.06, 0.2); this.hit(e, d * 0.5, 'lightning', { color: '#d8d0ff' }); });
      g.audio.play('zap', { volume: 0.3, pitch: 1.2 });
    });
  }
  lightning6(d, pw, mv) { this.summonHelper('bird', mv, d); }                               // Storm Bird
  lightning7(d, pw) {                                                                       // Lightning Cage
    const g = this.game, p = this.player, fx = g.fx;
    const R = 9;
    g.audio.play('power_lightning', { pitch: 0.8 });
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#b9b0ff', duration: 3, mode: 'ring' });
    const caught = this.inRadius(p.pos, R);
    caught.forEach((e) => { this.hit(e, d, 'lightning', { color: '#d8d0ff', label: 'Trapped!' }); g.enemies.root(e, 3); g.enemies.stun(e, 3); });
    this.ticker(3, 0.25, () => {
      caught.forEach((e) => {
        if (!e.alive) return;
        const n = 4, rr = e.radius + 0.6;
        for (let k = 0; k < n; k++) {
          const a = k / n * Math.PI * 2 + Math.random() * 0.4;
          const x = e.pos.x + Math.cos(a) * rr, z = e.pos.z + Math.sin(a) * rr;
          this.bolt([new THREE.Vector3(x, e.pos.y, z), new THREE.Vector3(x, e.pos.y + e.height + 0.8, z)], '#d8d0ff', 0.05, 0.22);
        }
      });
      if (Math.random() < 0.4) g.audio.play('zap', { volume: 0.25 });
    });
  }

  // ---- LIGHT
  light3(d, pw, mv) { this.suit('light', '#fff3b0', mv, d); }                               // Light Suit
  light4(d, pw) {                                                                           // Light Step
    const p = this.player;
    this.game.audio.play('flash'); this.game.hud.screenFlash(p, '#fff6c8', 0.3);
    this.startDash(p, { to: this.dashTarget(p, 13), d, dur: 0.16, color: '#fff3b0', kind: 'light', power: 'light' });
  }
  light5(d, pw, mv) { this.summonHelper('prism', mv, d); }                                  // Prism
  light6(d, pw) {                                                                           // Holy Pillars
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_light', { pitch: 1.2 });
    let spots = this.inRadius(p.pos, 14).slice(0, 8).map((e) => ({ e, at: new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z) }));
    if (!spots.length) spots = [-0.4, 0, 0.4].map((o) => { const a = p.yaw + o; const at = new THREE.Vector3(p.pos.x + Math.sin(a) * 7, 0, p.pos.z + Math.cos(a) * 7); at.y = this.ground(at.x, at.z); return { e: null, at }; });
    spots.forEach((s, i) => {
      const delay = 0.15 + i * 0.12;
      fx.ground.spawn(g.world, { shape: 'circle', pos: s.at, radius: 1.8, color: '#fff3b0', duration: delay });
      this.ticker(delay, delay, () => {}, () => {
        const at = s.e && s.e.alive ? s.e.pos : s.at;
        this.beamMesh(new THREE.Vector3(at.x, at.y + 26, at.z), new THREE.Vector3(at.x, at.y, at.z), '#fff3b0', 1.3, 0.6);
        fx.flash(this._v.set(at.x, at.y + 2, at.z), '#fff6c8', 40, 14, 0.4);
        fx.burst({ pos: this._v.set(at.x, at.y + 0.4, at.z), count: 24, radial: 5, flat: true, up: 2, life: [0.4, 0.7], size: [0.15, 0.3], color: ['#ffffff', '#fff3b0'], sprite: 'spark' });
        this.inRadius(at, 2.2).forEach((e) => this.hit(e, d, 'light', { color: '#fff3b0' }));
        g.audio.play('flash', { volume: 0.4, pitch: 1.3 });
      });
    });
  }
  light7(d, pw, mv) {                                                                       // Halo
    const g = this.game, p = this.player, fx = g.fx;
    g.audio.play('power_light', { pitch: 1.5 });
    const mat = this.addMat('#fff3b0', 0.7);
    const geo = new THREE.TorusGeometry(3.2, 0.09, 8, 48).rotateX(Math.PI / 2);
    const r1 = new THREE.Mesh(geo, mat), r2 = new THREE.Mesh(geo, mat);
    r2.scale.setScalar(1.45);
    const grp = new THREE.Group(); grp.add(r1, r2);
    const dur = mv.duration || 6;
    fx.timedMesh(grp, dur, (o, k) => {
      o.position.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
      r1.rotation.y += 0.08; r2.rotation.y -= 0.05;
      r1.rotation.x = Math.sin(k * 20) * 0.15; r2.rotation.z = Math.cos(k * 16) * 0.15;
      mat.opacity = 0.7 * (k > 0.9 ? (1 - k) / 0.1 : 1);
      if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2, r = Math.random() < 0.5 ? 3.2 : 4.6; fx.burst({ pos: this._v.set(p.pos.x + Math.cos(a) * r, p.pos.y + 1.1, p.pos.z + Math.sin(a) * r), count: 1, life: [0.2, 0.4], size: [0.15, 0.3], color: ['#ffffff', '#fff3b0'], sprite: 'spark' }); }
    }, () => { geo.dispose(); mat.dispose(); });
    this.zone({ follow: true, radius: 5, dur, color: '#fff3b0', decal: false, interval: 0.5,
      tick: (es) => es.forEach((e) => this.hit(e, d * 0.5, 'light', { color: '#fff3b0' })) });
  }

  // ---- DARKNESS
  darkness3(d, pw, mv) { this.suit('shadow', '#5a2aa0', mv); }                              // Shadow Suit
  darkness4(d, pw) {                                                                        // Dark Tendrils
    const g = this.game;
    g.audio.play('power_darkness', { pitch: 1.4 });
    this.coneDecal(8, 0.7, '#5a2aa0', 0.8);
    this.inCone(8, 0.7).forEach((e) => { this.grabbers(e, this.darkMat, 2.5, 6); g.enemies.root(e, 2.5); this.hit(e, d, 'darkness', { color: '#c8a0ff' }); });
  }
  darkness5(d, pw, mv) { this.summonHelper('clone', mv, d); }                               // Shadow Clone
  darkness6(d, pw) {                                                                        // Nightmare
    const g = this.game, p = this.player, fx = g.fx;
    const R = 12;
    g.audio.play('growl', { pitch: 0.7 }); g.audio.play('power_darkness', { pitch: 0.8 });
    g.hud.screenFlash(p, '#2a1040', 0.4);
    fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: R, color: '#5a2aa0', duration: 1.2, mode: 'ring' });
    fx.burst({ pos: this.chest(this._v, p), count: 50, spread: 0.6, radial: 9, flat: true, drag: 2, life: [0.5, 1], size: [0.4, 0.8], sizeEnd: 1.6, color: ['#3a1a6a', '#8a4dff'], sprite: 'dot' });
    this.inRadius(p.pos, R).forEach((e) => { this.hit(e, d, 'darkness', { color: '#c8a0ff', label: 'Scared!' }); g.enemies.fear(e, 4); });
  }
  darkness7(d, pw, mv) {                                                                    // Void Rain
    const g = this.game, fx = g.fx;
    g.audio.play('power_darkness', { pitch: 1.2 });
    this.zone({ follow: true, radius: 8, dur: mv.duration || 4, color: '#5a2aa0', opacity: 0.35, interval: 0.25,
      tick: (es, c) => {
        const e = es.length ? es[Math.floor(Math.random() * es.length)] : null;
        const at = e ? new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z) : new THREE.Vector3(c.x + rand(-7, 7), 0, c.z + rand(-7, 7));
        if (!e) at.y = this.ground(at.x, at.z);
        const top = at.clone().add(new THREE.Vector3(rand(-1, 1), 10, rand(-1, 1)));
        fx.projectile({ pos: top, vel: at.clone().sub(top).multiplyScalar(1 / 0.4), color: '#8a4dff', size: 0.9, life: 0.45, trail: { color: ['#8a4dff', '#3a1a6a'], count: 2, size: [0.2, 0.4] },
          onHit: (pr) => { fx.burst({ pos: pr.pos, count: 10, velSpread: 3, life: [0.3, 0.5], size: [0.2, 0.35], color: ['#8a4dff', '#d0b0ff'], sprite: 'spark' }); if (e && e.alive) this.hit(e, d * 0.5, 'darkness', { color: '#c8a0ff' }); } });
      } });
  }

  // ---- DEATH
  death3(d, pw, mv) { this.suit('bone', '#e8e2d0', mv); }                                   // Bone Suit
  death4(d, pw) {                                                                           // Ghost Dash
    const p = this.player;
    this.game.audio.play('blink', { pitch: 0.7 }); this.game.audio.play('power_death', { pitch: 1.6, volume: 0.5 });
    this.startDash(p, { to: this.dashTarget(p, 13), d, dur: 0.3, color: '#c8ffe8', kind: 'ghost', power: 'death' });
  }
  death5(d, pw, mv) { this.summonHelper('skeleton', mv, d, 3); }                            // Skeleton Army
  death6(d, pw) { this.game.audio.play('power_death', { pitch: 1.2 }); this.drainBeam('#d04dff', d, 1.2, 0.6, 'death'); }   // Life Drain
  death7(d, pw, mv) {                                                                       // Soul Storm
    const g = this.game, fx = g.fx;
    g.audio.play('power_death', { pitch: 0.7 });
    this.zone({ follow: true, radius: 7, dur: mv.duration || 5, color: '#b8ffe0', opacity: 0.3, interval: 0.5,
      vis: (c, k) => { for (let n = 0; n < 3; n++) { const a = k * 40 + n * 2.1 + Math.random() * 0.3, r = rand(2, 6.5); fx.burst({ pos: this._v.set(c.x + Math.cos(a) * r, c.y + rand(0.5, 2.5), c.z + Math.sin(a) * r), count: 1, vel: this._w.set(-Math.sin(a) * 6, 0.4, Math.cos(a) * 6), life: [0.4, 0.8], size: [0.35, 0.6], sizeEnd: 1.2, alpha: 0.6, color: ['#c8ffe8', '#e0b0ff', '#ffffff'], sprite: 'dot' }); } },
      tick: (es) => es.forEach((e) => this.hit(e, d * 0.5, 'death', { color: '#e0a0ff' })) });
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const g = this.game;
    for (const p of g.players) this.updatePlayer(p, dt);
    for (let i = this.tickers.length - 1; i >= 0; i--) {
      const t = this.tickers[i];
      t.t += dt; t.acc += dt;
      while (t.acc >= t.interval) { t.acc -= t.interval; t.fn(clamp(t.t / t.dur, 0, 1)); if (t.interval <= 0) break; }
      if (t.t >= t.dur) { this.tickers.splice(i, 1); if (t.end) t.end(); }
    }
  }
  updatePlayer(p, dt) {
    const g = this.game, w = p.pw;
    for (const c of w.cd) for (let a = 0; a < 9; a++) if (c[a] > 0) c[a] = Math.max(0, c[a] - dt);
    if (w.queued && !p.cast && !p.attack) { w.queued = false; this.useSelected(p); }
    // charge-up glow on the hands
    if (w.holding && w.chargeOk && p.rig) {
      const col = POWERS[p.sel.power].color;
      const k = this.chargeFrac(p);
      const hand = this.handPos(this._v, p);
      g.fx.burst({ pos: hand, count: 1 + Math.round(k * 3), spread: 0.25, velSpread: 0.6, up: 0.6, life: [0.2, 0.4], size: [0.15 + k * 0.25, 0.3 + k * 0.35], color: [col, '#ffffff'], sprite: w.charged ? 'spark' : 'dot' });
      const other = this._w.set(p.pos.x - Math.cos(p.yaw) * 0.4, p.pos.y + p.height * 0.55, p.pos.z + Math.sin(p.yaw) * 0.4);
      g.fx.burst({ pos: other, count: 1, spread: 0.2, velSpread: 0.5, up: 0.5, life: [0.2, 0.35], size: [0.15 + k * 0.2, 0.25 + k * 0.3], color: [col, '#ffffff'], sprite: 'dot' });
      if (w.charged && Math.random() < 0.3) g.fx.ring(this._u.set(p.pos.x, p.pos.y + 0.2, p.pos.z), col, 1.6, 0.3);
      if (!w.chargeLight) w.chargeLight = g.fx.holdLight(col, 4, 6);
      if (w.chargeLight) { w.chargeLight.position.copy(hand); w.chargeLight.intensity = 4 + k * 22; }
    }
    // dash movement
    const D = w.dash;
    if (D) {
      D.t += dt;
      const k = clamp(D.t / D.dur, 0, 1);
      const prev = p.pos.clone();
      p.pos.lerpVectors(D.from, D.to, k);
      if (g.colliders && D.kind !== 'ghost') g.colliders.resolve(p.pos, p.radius);
      p.pos.y = p.groundAt(p.pos.x, p.pos.z, Math.max(prev.y, p.pos.y) + 2);
      p.vel.set(0, 0, 0);
      p.syncRig();
      const mid = this._v.set(p.pos.x, p.pos.y + 1, p.pos.z);
      if (D.kind === 'thunder') this.bolt([prev.clone().setY(prev.y + 1.1), p.pos.clone().setY(p.pos.y + 1.1)], D.color, 0.08, 0.25);
      if (D.kind === 'flame') g.fx.burst({ pos: mid, count: 8, spread: 0.6, up: 2, velSpread: 1.5, life: [0.3, 0.6], size: [0.4, 0.8], color: ['#ff6a1a', '#ffb347', '#ffe08a'], sprite: 'dot' });
      if (D.kind === 'ice') { g.fx.burst({ pos: mid, count: 6, spread: 0.6, velSpread: 2, life: [0.4, 0.7], size: [0.1, 0.25], color: ['#ffffff', '#bfefff'], sprite: 'spark' }); }
      if (D.kind === 'light') g.fx.burst({ pos: mid, count: 10, spread: 0.5, velSpread: 3, life: [0.2, 0.4], size: [0.2, 0.4], color: ['#ffffff', '#fff3b0'], sprite: 'spark' });
      if (D.kind === 'ghost') { g.fx.burst({ pos: mid, count: 5, blend: 'normal', spread: 0.5, up: 0.5, life: [0.4, 0.7], size: [0.6, 1.0], sizeEnd: 1.5, alpha: 0.4, color: ['#c8ffe8', '#e0b0ff'], sprite: 'smoke' }); if (p.rig) p.rig.root.visible = Math.random() < 0.5; }
      else g.fx.burst({ pos: mid, count: 4, spread: 0.6, velSpread: 2, life: [0.2, 0.45], size: [0.2, 0.45], color: [D.color, '#ffffff'], sprite: 'spark' });
      // trail patches (flame: burning ground, ice: frozen ground)
      const moved = D.from.distanceTo(p.pos);
      if ((D.kind === 'flame' || D.kind === 'ice') && moved - D.lastPatch > 2.2) {
        D.lastPatch = moved;
        if (D.kind === 'flame') this.firePatch(p.pos, D.d * 0.3, 3);
        else g.fx.ground.spawn(g.world, { shape: 'circle', pos: p.pos, radius: 1.4, color: '#bfefff', duration: 2.5, mode: 'glow', opacity: 0.6 });
      }
      for (const e of g.enemies.targets()) {
        if (D.hitSet.has(e)) continue;
        if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.radius + 2.2) {
          D.hitSet.add(e);
          this.hit(e, D.d, D.power, { color: D.color, knock: D.kind === 'ghost' ? 0 : 6, from: p.pos, by: p });
          g.fx.hitSparks(new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z), D.color, true);
          if (D.kind === 'flame') g.enemies.burn(e, 3, 7 * this.scale());
          if (D.kind === 'ice') g.enemies.freeze(e, 1.5);
          if (D.kind === 'light') g.enemies.stun(e, 1.5);
        }
      }
      if (k >= 1) {
        w.dash = null; p.dashing = false;
        if (p.rig) p.rig.root.visible = true;
        g.fx.flash(this.chest(this._v, p), D.color, 40, 14, 0.3);
        g.audio.play(D.kind === 'thunder' ? 'zap' : 'blink', { pitch: 1.3, volume: 0.6 });
      }
    }
  }
  clear() {
    // drop running effects without their end callbacks (the world is going away)
    this.tickers.length = 0;
    for (const p of this.game.players) {
      this.cancelCharge(p);
      p.pw.queued = false;
      if (p.pw.dash) { p.pw.dash = null; p.dashing = false; }
      if (p.rig) p.rig.root.visible = true;
    }
  }
}
