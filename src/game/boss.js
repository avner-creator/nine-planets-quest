// Boss fights: in each dimension a KEY GUARDIAN (main boss, in the boss arena) and 3 TEMPLE GUARDIANS
// (one in each temple courtyard). Telegraphed attacks, enrage at half health, reset when everyone leaves.
import * as THREE from 'three';
import { DIMENSIONS } from '../data.js';
import { createBoss } from './modules.js';
import { clamp, rand, pick, angleDamp, yawTo } from './util.js';

const MELEE = ['slam', 'sweep', 'stomp'];
const RANGED = ['volley', 'beam', 'charge'];

export class BossManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }
  // the boss that matters most right now (fighting and closest to a player, else the key guardian)
  get entity() { return this.active() || this.list.find((b) => b.role === 'key' && b.alive) || null; }
  active() {
    let best = null, bd = Infinity;
    for (const b of this.list) {
      if (!b.alive || b.state !== 'fight') continue;
      const d = this.game.enemies.minPlayerDist(b.pos.x, b.pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  get fighting() { return this.list.some((b) => b.alive && b.state === 'fight'); }

  clear() {
    this.list.forEach((b) => { if (b.rig) { this.game.scene.remove(b.rig.root); b.rig.dispose(); } });
    this.list.length = 0;
    this.game.hud.setBoss(null);
  }
  onWorldLoaded() {
    this.clear();
    const g = this.game, id = g.worldId;
    if (id === 'home') return;
    const s = g.state, D = DIMENSIONS[id];
    const arena = g.world.landmarks.bossArena;
    if (arena && !s.bosses[id]) this.spawn(D.boss, arena.pos, arena.radius || 22, 'key', -1);
    // temple guardians only appear as the 3rd trial of their temple (see trials.js)
  }
  spawn(def, center, arenaR, role, tier) {
    const g = this.game, id = g.worldId;
    const rig = createBoss(def, { quality: g.settings.quality });
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const pos = center.clone();
    pos.y = g.world.heightAt(pos.x, pos.z);
    const e = {
      isBoss: true, kind: 'boss', role, tier, dimIndex: id, def, name: def.name, title: def.title, rig,
      pos, center: center.clone(), arenaR, yaw: yawTo(pos.x, pos.z, 0, 0), vel: new THREE.Vector3(),
      hp: def.hp, maxHp: def.hp, dmg: def.dmg, radius: Math.max(1.2, rig.radius || 1.5), height: rig.height || def.size, hitHeight: rig.hitHeight || def.size + 0.5,
      alive: true, state: 'sleep', enraged: false, moveCd: 2, move: null, frozenT: 0, rootedT: 0, burnT: 0, burnDps: 0, burnTick: 0,
      noticed: true, isDark: !!DIMENSIONS[id].biome.alwaysNight, speed: role === 'key' ? 3.3 : 3.0, deadT: 0, pose: '', target: null,
    };
    rig.root.position.copy(pos);
    rig.root.rotation.y = e.yaw;
    g.scene.add(rig.root);
    this.list.push(e);
    return e;
  }

  remove(e) {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (e.rig) { this.game.fx.sparkles(this._v.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z), e.def.accent, 40, 4); this.game.scene.remove(e.rig.root); e.rig.dispose(); e.rig = null; }
    if (!this.fighting) this.game.audio.setMusicMood(this.game.moodForTime());
  }
  wake(e) {
    if (e.state === 'fight') return;
    const g = this.game;
    e.state = 'fight';
    e.moveCd = 0.6;
    this.startMove(e, 'roar');
    g.audio.setMusicMood('boss');
    g.hud.banner(e.name, e.title, '#ff6a5a', 2.6);
    if (!g.state.hints.boss) { g.state.hints.boss = true; g.hud.toast('Watch the red circles on the ground - move out before they fill up!', 'info', 5); }
  }
  reset(e) {
    const g = this.game;
    e.state = 'reset';
    e.move = null;
    e.hp = e.maxHp;
    e.enraged = false;
    e.rig.setEnraged(false);
    if (!this.fighting) g.audio.setMusicMood(g.moodForTime());
  }

  hit(e, dmg, o = {}) {
    if (!e.alive) return 0;
    const g = this.game;
    if (o.power === 'light' && e.isDark) dmg *= 2;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.rig.hurt();
    g.hud.damageNumber(this._v.set(e.pos.x, e.pos.y + e.hitHeight, e.pos.z), dmg, o.crit ? 'crit' : (o.power ? 'power' : 'hit'), o.label, o.color);
    if (e.state !== 'fight') this.wake(e);
    if (!e.enraged && e.hp <= e.maxHp * 0.5 && e.hp > 0) {
      e.enraged = true;
      e.rig.setEnraged(true);
      g.hud.toast(`${e.name} is ANGRY!`, 'warn', 2.5);
      e.move = null;
      this.startMove(e, 'roar');
    }
    if (e.hp <= 0) this.defeat(e);
    return dmg;
  }
  freeze(e, t) {
    e.frozenT = Math.max(e.frozenT, t * 0.45);
    e.rig.setFrozen(true);
  }

  defeat(e) {
    const g = this.game;
    e.alive = false;
    e.hp = 0;
    e.state = 'dead';
    e.move = null;
    e.rig.setFrozen(false);
    e.rig.setPose('dead');
    const c = this._v.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
    g.fx.sparkles(c, e.def.accent, 120, 9);
    g.fx.sparkles(c, '#fff6b0', 80, 7);
    g.fx.flash(c, e.def.accent, 80, 40, 1.5);
    g.players.forEach((p) => p.cam.shake(0.8));
    const L = DIMENSIONS[e.dimIndex].level;
    const k = e.role === 'key' ? 1 : 0.5 + e.tier * 0.15;
    g.fx.dropCoins(e.pos, Math.round(150 * L * k * g.player.stat('coinBonus', 1)), { name: `${e.name}'s Trophy`, value: Math.round(100 * L * k) });
    g.player.addXp(Math.round(120 * L * k));
    if (!this.fighting) g.audio.setMusicMood(g.moodForTime());
    if (e.role === 'key') g.onKeyGuardianDefeated(e.dimIndex, e.pos.clone());
    else g.onGuardianDefeated(e.dimIndex, e.tier);
  }

  // ---------------------------------------------------------------- moves
  pickMove(e, d) {
    const moves = e.rig.moves;
    const minions = this.game.enemies.list.filter((m) => m.kind === 'minion' && m.alive).length;
    const melee = moves.filter((m) => MELEE.includes(m)), ranged = moves.filter((m) => RANGED.includes(m));
    let pool = (d < 9 && melee.length && Math.random() < 0.6) ? melee : (ranged.length ? ranged : melee);
    if (!pool.length) pool = moves.filter((m) => m !== 'roar' && m !== 'summon');
    if (moves.includes('summon') && minions < 3 && Math.random() < 0.18) return 'summon';
    if (moves.includes('roar') && Math.random() < 0.08) return 'roar';
    return pool.length ? pick(pool) : 'slam';
  }

  startMove(e, name) {
    const g = this.game, w = g.world;
    const p = e.target || g.enemies.nearestPlayer(e.pos) || g.player;
    const r = e.rig.play(name);
    const speedUp = e.enraged ? 1.3 : 1;
    const hitT = Math.max(0.55, r.hitTime) / speedUp;
    const dur = Math.max(hitT + 0.35, r.duration / speedUp);
    const m = { name, t: 0, dur, hit: hitT, done: false };
    const size = e.def.size || 5;
    const toP = yawTo(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
    e.yaw = toP;
    m.yaw = toP;
    const red = '#ff2a2a';
    switch (name) {
      case 'slam': {
        const d = Math.min(9, Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z));
        m.at = new THREE.Vector3(e.pos.x + Math.sin(toP) * d, 0, e.pos.z + Math.cos(toP) * d);
        m.r = 3.5 + size * 0.25;
        g.fx.ground.spawn(w, { shape: 'circle', pos: m.at, radius: m.r, color: red, duration: hitT });
        break;
      }
      case 'stomp': m.r = 6 + size * 0.4; g.fx.ground.spawn(w, { shape: 'circle', pos: e.pos, radius: m.r, color: red, duration: hitT }); break;
      case 'roar': m.r = 9; g.fx.ground.spawn(w, { shape: 'circle', pos: e.pos, radius: m.r, color: '#ff8a2a', duration: hitT }); break;
      case 'sweep': m.r = 7 + size * 0.5; m.ang = 2.2; g.fx.ground.spawn(w, { shape: 'cone', pos: e.pos, radius: m.r, angle: m.ang, yaw: toP, color: red, duration: hitT }); break;
      case 'charge':
        m.len = 20; m.wid = 3.4; m.from = e.pos.clone();
        g.fx.ground.spawn(w, { shape: 'line', pos: e.pos, length: m.len, width: m.wid, yaw: toP, color: red, duration: hitT });
        g.audio.play('bossCharge', { volume: 0.7 });
        break;
      case 'beam':
        m.len = 34; m.wid = 2.6;
        g.fx.ground.spawn(w, { shape: 'line', pos: e.pos, length: m.len, width: m.wid, yaw: toP, color: red, duration: hitT });
        g.audio.play('beam', { volume: 0.8 });
        break;
      case 'volley': {
        const n = e.enraged ? 7 : 5;
        m.targets = [];
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : rand(1.5, 5);
          const t = new THREE.Vector3(p.pos.x + Math.cos(a) * rr, 0, p.pos.z + Math.sin(a) * rr);
          t.y = w.heightAt(t.x, t.z);
          m.targets.push(t);
        }
        break;
      }
      case 'summon': g.fx.ground.spawn(w, { shape: 'circle', pos: e.pos, radius: 6, color: '#b040ff', duration: hitT, mode: 'ring' }); break;
    }
    e.move = m;
  }

  // hurt every player inside test(player)
  hurtPlayers(test, dmg, from, opts) {
    for (const p of this.game.players) if (!p.dead && test(p)) p.hurt(dmg, from, opts);
  }

  applyMove(e, m) {
    const g = this.game, fx = g.fx;
    const dmg = e.dmg * (e.enraged ? 1.15 : 1);
    const accent = e.def.accent;
    switch (m.name) {
      case 'slam': case 'stomp': case 'roar': {
        const c = m.at || e.pos;
        const cy = g.world.heightAt(c.x, c.z);
        fx.ring(this._v.set(c.x, cy + 0.3, c.z), m.name === 'roar' ? '#ffb070' : accent, m.r, 0.5);
        fx.dust(this._v.set(c.x, cy + 0.2, c.z), '#a89880', 22, 2.5);
        fx.burst({ pos: this._v.set(c.x, cy + 0.3, c.z), count: 30, spread: m.r * 0.7, flat: true, up: 6, gravity: 14, life: [0.4, 0.9], size: [0.15, 0.35], color: [accent, '#ffffff'], sprite: 'spark' });
        g.players.forEach((p) => p.cam.shake(m.name === 'roar' ? 0.5 : 0.7));
        g.audio.play(m.name === 'roar' ? 'bossRoar' : 'bossSlam');
        const mul = m.name === 'slam' ? 1.4 : m.name === 'stomp' ? 1.1 : 0.4;
        this.hurtPlayers((p) => Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < m.r + 0.3 && Math.abs(p.pos.y - cy) < 3, dmg * mul, c, { knock: m.name === 'roar' ? 14 : 9, up: 6 });
        break;
      }
      case 'sweep': {
        fx.burst({ pos: this._v.set(e.pos.x + Math.sin(m.yaw) * m.r * 0.6, e.pos.y + 1.5, e.pos.z + Math.cos(m.yaw) * m.r * 0.6), count: 40, spread: m.r * 0.4, velSpread: 4, life: [0.3, 0.6], size: [0.2, 0.5], color: [accent, '#ffffff'], sprite: 'spark' });
        g.audio.play('swing3', { pitch: 0.5, volume: 1 });
        this.hurtPlayers((p) => {
          const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
          const a = Math.abs(((yawTo(e.pos.x, e.pos.z, p.pos.x, p.pos.z) - m.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          return d < m.r + 0.5 && a < m.ang / 2 + 0.15;
        }, dmg, e.pos, { knock: 10, up: 4 });
        break;
      }
      case 'charge':
        m.dash = { t: 0, dur: 0.4, from: e.pos.clone(), to: new THREE.Vector3(e.pos.x + Math.sin(m.yaw) * m.len, 0, e.pos.z + Math.cos(m.yaw) * m.len), hit: new Set() };
        break;
      case 'beam': {
        const mouth = e.rig.mouth;
        const o = mouth ? mouth.getWorldPosition(new THREE.Vector3()) : e.pos.clone().setY(e.pos.y + e.height * 0.8);
        const end = new THREE.Vector3(e.pos.x + Math.sin(m.yaw) * m.len, 0, e.pos.z + Math.cos(m.yaw) * m.len);
        end.y = g.world.heightAt(end.x, end.z) + 1;
        g.powers.beamMesh(o, end, accent, 1.1, 0.6);
        fx.flash(o, accent, 50, 30, 0.6);
        const fxv = Math.sin(m.yaw), fzv = Math.cos(m.yaw);
        this.hurtPlayers((p) => {
          const rx = p.pos.x - e.pos.x, rz = p.pos.z - e.pos.z;
          const along = rx * fxv + rz * fzv, side = Math.abs(rx * fzv - rz * fxv);
          return along > 0 && along < m.len && side < m.wid / 2 + 0.4;
        }, dmg * 1.3, e.pos, { knock: 8 });
        break;
      }
      case 'volley': {
        const mouth = e.rig.mouth;
        const o = mouth ? mouth.getWorldPosition(new THREE.Vector3()) : e.pos.clone().setY(e.pos.y + e.height * 0.8);
        g.audio.play('power_fire', { pitch: 0.7 });
        m.targets.forEach((t, i) => {
          const flight = 0.9 + i * 0.08;
          g.fx.ground.spawn(g.world, { shape: 'circle', pos: t, radius: 2, color: '#ff2a2a', duration: flight });
          const vel = new THREE.Vector3((t.x - o.x) / flight, 0, (t.z - o.z) / flight);
          const grav = 14;
          vel.y = (t.y - o.y) / flight + 0.5 * grav * flight;
          fx.projectile({
            pos: o, vel, color: accent, size: 1.3, life: flight + 0.3, gravity: grav,
            trail: { color: [accent, '#ffffff'], count: 2, size: [0.3, 0.7] },
            onHit: (pr) => {
              fx.ring(pr.pos, accent, 2, 0.35);
              fx.burst({ pos: pr.pos, count: 16, velSpread: 4, up: 3, gravity: 10, life: [0.3, 0.6], size: [0.15, 0.3], color: [accent, '#fff'], sprite: 'spark' });
              g.audio.play('explosion', { volume: 0.5, pitch: 1.2 });
              this.hurtPlayers((p) => Math.hypot(p.pos.x - pr.pos.x, p.pos.z - pr.pos.z) < 2.1 && Math.abs(p.pos.y - pr.pos.y) < 2.5, dmg * 0.55, pr.pos, { knock: 5 });
            },
          });
        });
        break;
      }
      case 'summon': {
        const n = e.enraged ? 3 : 2;
        for (let i = 0; i < n; i++) { const pos = g.enemies.findSpot(e.pos, 3, 7); if (pos) g.enemies.spawnMinion(pos); }
        g.audio.play('bossRoar', { pitch: 1.3, volume: 0.6 });
        break;
      }
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (this.updateOne(e, dt) === 'gone') this.list.splice(i, 1);
    }
    this.game.hud.setBoss(this.active());
  }

  updateOne(e, dt) {
    const g = this.game, w = g.world;
    if (e.state === 'dead') {
      e.deadT += dt;
      e.rig.update(dt);
      if (e.deadT > 3) {
        const k = clamp((e.deadT - 3) / 1.2, 0, 1);
        e.rig.root.scale.setScalar(Math.max(0.01, 1 - k));
        if (Math.random() < 0.5) g.fx.sparkles(this._v.set(e.pos.x + rand(-1, 1), e.pos.y + rand(0, e.height), e.pos.z + rand(-1, 1)), e.def.accent, 4, 2);
        if (k >= 1) { g.scene.remove(e.rig.root); e.rig.dispose(); e.rig = null; return 'gone'; }
      }
      return;
    }
    // the nearest living player inside (or near) this boss's arena is its target
    let p = null, dC = Infinity;
    for (const q of g.players) {
      if (q.dead || q.sleeping) continue;
      const d = Math.hypot(q.pos.x - e.center.x, q.pos.z - e.center.z);
      if (d < dC) { dC = d; p = q; }
    }
    e.target = p;
    const anyP = p || g.player;
    const dP = Math.hypot(anyP.pos.x - e.pos.x, anyP.pos.z - e.pos.z);
    const minD = g.enemies.minPlayerDist(e.pos.x, e.pos.z);
    e.rig.root.visible = minD < 200;
    if (minD > 140 && e.state === 'sleep') { return; }   // far away and asleep: skip work

    if (e.frozenT > 0) { e.frozenT -= dt; if (e.frozenT <= 0) e.rig.setFrozen(false); }
    if (e.rootedT > 0) e.rootedT -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick += dt;
      if (e.burnTick >= 0.5) { e.burnTick = 0; this.hit(e, e.burnDps * 0.5, { power: 'fire', color: '#ff8a3a' }); if (!e.alive) return; }
    }
    const frozen = e.frozenT > 0;
    let mvx = 0, mvz = 0, spd = 0;
    if (e.state === 'sleep') {
      if (p && dC < e.arenaR + 2) this.wake(e);
    } else if (e.state === 'reset') {
      const tx = e.center.x - e.pos.x, tz = e.center.z - e.pos.z, td = Math.hypot(tx, tz);
      if (td > 1.5) { mvx = tx / td; mvz = tz / td; spd = e.speed * 1.2; } else e.state = 'sleep';
    } else if (e.state === 'fight') {
      if (!p || dC > e.arenaR + 35) { this.reset(e); }
      else if (!frozen) {
        if (e.move) {
          const m = e.move;
          m.t += dt;
          if (!m.done && m.t >= m.hit) { m.done = true; this.applyMove(e, m); }
          if (m.dash) {
            const D = m.dash;
            D.t += dt;
            const k = clamp(D.t / D.dur, 0, 1);
            e.pos.x = D.from.x + (D.to.x - D.from.x) * k; e.pos.z = D.from.z + (D.to.z - D.from.z) * k;
            for (const q of g.players) {
              if (!q.dead && !D.hit.has(q) && Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z) < e.radius + 1.6) { D.hit.add(q); q.hurt(e.dmg * 1.3, e.pos, { knock: 14, up: 5 }); g.audio.play('bossSlam', { volume: 0.7 }); }
            }
            if (Math.random() < 0.7) g.fx.dust(e.pos, '#a89880', 2, 1.6);
            if (k >= 1) m.dash = null;
          }
          if (m.t >= m.dur && !m.dash) { e.move = null; e.moveCd = rand(1.0, 2.2) / (e.enraged ? 1.4 : 1); }
        } else {
          e.yaw = angleDamp(e.yaw, yawTo(e.pos.x, e.pos.z, p.pos.x, p.pos.z), 4, dt);
          const dT = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
          if (dT > 4.5 + e.radius) { mvx = (p.pos.x - e.pos.x) / dT; mvz = (p.pos.z - e.pos.z) / dT; spd = e.speed * (e.enraged ? 1.35 : 1); }
          e.moveCd -= dt;
          if (e.moveCd <= 0 && dT < 34) this.startMove(e, this.pickMove(e, dT - e.radius));
        }
      }
    }
    if (e.rootedT > 0 || frozen) spd = 0;
    e.vel.x += (mvx * spd - e.vel.x) * Math.min(1, dt * 5);
    e.vel.z += (mvz * spd - e.vel.z) * Math.min(1, dt * 5);
    e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
    g.resolveWalls(e.pos, e.radius * 0.8);
    // stay near the arena / courtyard
    const ox = e.pos.x - e.center.x, oz = e.pos.z - e.center.z, od = Math.hypot(ox, oz), lim = e.arenaR + 8;
    if (od > lim) { e.pos.x = e.center.x + ox / od * lim; e.pos.z = e.center.z + oz / od * lim; }
    // keep players from walking through the boss
    for (const q of g.players) {
      const d = Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z);
      if (d < e.radius + q.radius && d > 0.01 && !q.dead) { const push = e.radius + q.radius - d; q.pos.x += (q.pos.x - e.pos.x) / d * push; q.pos.z += (q.pos.z - e.pos.z) / d * push; }
    }
    e.pos.y = w.heightAt(e.pos.x, e.pos.z);
    if (w.liquid && w.liquid.type === 'ice') e.pos.y = Math.max(e.pos.y, w.liquid.level);
    const hs = Math.hypot(e.vel.x, e.vel.z);
    if (!e.move && hs > 0.3) e.yaw = angleDamp(e.yaw, Math.atan2(e.vel.x, e.vel.z), 5, dt);
    const pose = (hs > 0.4 || (e.move && e.move.dash)) ? 'move' : 'idle';
    if (pose !== e.pose) { e.pose = pose; e.rig.setPose(pose); }
    e.rig.setMoveSpeed(e.move && e.move.dash ? 12 : hs);
    if (!frozen) e.rig.update(dt * (e.enraged ? 1.2 : 1));
    e.rig.root.position.copy(e.pos);
    e.rig.root.rotation.y = e.yaw;
    void dP;
  }
}
