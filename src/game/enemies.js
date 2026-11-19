// Monsters, bandits, night creatures and boss minions: spawning, AI, damage, rewards.
import * as THREE from 'three';
import { DIMENSIONS, NIGHT_CREATURES, enemyScale, isNight, DAY_NIGHT } from '../data.js';
import { createEnemy, createNPC } from './modules.js';
import { clamp, rand, randInt, pick, angleDamp, yawTo } from './util.js';

let NEXT_ID = 1;

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnT = 0;
    this.nightT = 8;
    this.camps = [];
    this._v = new THREE.Vector3();
    this.wasNight = false;
  }

  get dim() { const id = this.game.worldId; return id === 'home' ? null : DIMENSIONS[id]; }
  get level() { const d = this.dim; return d ? d.level : 1; }
  get targetCount() { return this.dim ? (this.game.settings.quality === 'high' ? 22 : 16) : 0; }

  // ---------------------------------------------------------------- world lifecycle
  clear() {
    this.list.forEach((e) => this.removeRig(e));
    this.list.length = 0;
    this.camps.length = 0;
  }
  removeRig(e) {
    if (e.rig) { this.game.scene.remove(e.rig.root); e.rig.dispose(); e.rig = null; }
  }
  onWorldLoaded() {
    this.clear();
    const w = this.game.world;
    this.spawnT = 0;
    this.nightT = 6;
    if (!this.dim) return;
    // fill monsters
    for (let i = 0; i < this.targetCount; i++) this.spawnMonster(30);
    // bandit camps
    (w.banditCamps || []).forEach((c, idx) => {
      const camp = { idx, pos: c.pos.clone(), radius: c.radius || 10, respawnAt: 0, members: [] };
      this.camps.push(camp);
      this.spawnCamp(camp);
    });
  }

  // ---------------------------------------------------------------- spawning
  findSpot(center, minR, maxR, tries = 14) {
    const w = this.game.world;
    for (let t = 0; t < tries; t++) {
      const a = Math.random() * Math.PI * 2, r = rand(minR, maxR);
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      if (Math.hypot(x, z) > w.radius - 8) continue;
      const h = w.heightAt(x, z);
      if (w.liquid && w.liquid.type !== 'ice' && h < w.liquid.level + 0.2) continue;
      return new THREE.Vector3(x, h, z);
    }
    return null;
  }

  // the closest living player (optionally only ones the enemy can notice)
  nearestPlayer(pos, detectableOnly = false) {
    let best = null, bd = Infinity;
    for (const p of this.game.players) {
      if (p.dead || !p.rig) continue;
      if (detectableOnly && (p.sleeping || p.fadeT > 0)) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  // players or a buddy (friendly fighters can be attacked; villagers, healers and guides never)
  nearestFoe(pos) {
    let best = this.nearestPlayer(pos, true), bd = best ? Math.hypot(best.pos.x - pos.x, best.pos.z - pos.z) : Infinity;
    for (const b of (this.game.buddies ? this.game.buddies.list : [])) {
      if (b.dead) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  minPlayerDist(x, z) { let m = Infinity; for (const p of this.game.players) m = Math.min(m, Math.hypot(p.pos.x - x, p.pos.z - z)); return m; }

  spawnMonster(minDist = 40) {
    const w = this.game.world, dim = this.dim;
    if (!dim) return null;
    const pp = this.game.player.pos;
    const pts = w.monsterSpawns.filter((p) => this.minPlayerDist(p.x, p.z) > minDist && !this.game.inBossZone(p));
    let pos;
    if (pts.length) pos = this.findSpot(pick(pts), 0, 8) || pick(pts).clone();
    else pos = this.findSpot(pp, minDist, minDist + 60);
    if (!pos) return null;
    const def = pick(dim.enemies);
    const sc = enemyScale(dim.level);
    return this.add({
      kind: 'monster', def, name: def.name, pos,
      hp: def.hp * sc.hp, dmg: def.dmg * sc.dmg, speed: def.speed, coins: def.coins * sc.coins,
      xp: Math.round(6 + def.hp * sc.hp * 0.12), loot: def.loot, isDark: !!dim.biome.alwaysNight,
    });
  }

  spawnCamp(camp) {
    const dim = this.dim;
    const b = dim.bandit;
    camp.members = [];
    const n = randInt(3, 4);
    for (let i = 0; i <= n; i++) {
      const captain = i === n;
      const pos = this.findSpot(camp.pos, 1.5, camp.radius + 2) || camp.pos.clone();
      const e = this.add({
        kind: 'bandit', captain, def: { shape: 'humanoid', color: b.outfit }, name: captain ? `${b.name} Captain` : b.name, pos,
        hp: b.hp * (captain ? 2.2 : 1), dmg: b.dmg * (captain ? 1.35 : 1), speed: captain ? 4.9 : 4.6,
        coins: b.coins * (captain ? 3 : 1), xp: Math.round((captain ? 3 : 1) * (10 + b.hp * 0.15)),
        loot: captain ? { name: 'Bandit Treasure', value: Math.round(b.coins * 2) } : { name: 'Stolen Trinket', value: Math.round(b.coins * 0.6) },
        camp, outfit: b.outfit,
      });
      if (e) camp.members.push(e);
    }
  }

  spawnNight() {
    const awake = this.game.players.filter((q) => !q.dead && !q.sleeping); const p = awake.length ? pick(awake) : this.game.player;
    const pos = this.findSpot(p.pos, 25, 40, 20);
    if (!pos) return;
    const def = pick(NIGHT_CREATURES);
    const L = this.level;
    const e = this.add({
      kind: 'night', def, name: def.name, pos,
      hp: def.hp * (1 + 0.3 * (L - 1)), dmg: def.dmg * (1 + 0.22 * (L - 1)), speed: def.speed, coins: def.coins * (1 + 0.3 * (L - 1)),
      xp: 30 + 12 * L, loot: def.loot, isNight: true, isDark: true,
    });
    if (e) {
      e.noticed = true; e.state = 'chase';
      e.rig.setTint && e.rig.setTint(null);
      this.game.fx.dust(pos, '#2a1840', 14, 1.6);
      this.game.audio.play('growl', { volume: 0.8 });
      if (!this.game.state.hints.nightCreature) { this.game.state.hints.nightCreature = true; this.game.hud.toast('A night creature is hunting you! They are very tough - sleep in a bed to be safe.', 'warn', 5); }
    }
  }

  spawnMinion(pos, def) {
    const dim = this.dim || DIMENSIONS[0];
    def = def || pick(dim.enemies);
    const sc = enemyScale(dim.level);
    const e = this.add({
      kind: 'minion', def, name: def.name, pos,
      hp: def.hp * sc.hp * 0.8, dmg: def.dmg * sc.dmg, speed: def.speed, coins: Math.ceil(def.coins * sc.coins * 0.5),
      xp: Math.round(4 + def.hp * sc.hp * 0.06), loot: null, isDark: !!dim.biome.alwaysNight,
    });
    if (e) { e.noticed = true; e.state = 'chase'; this.game.fx.sparkles(pos.clone().setY(pos.y + 1), '#ff6060', 20, 3); }
    return e;
  }

  // temple trial monsters: they hunt the players in the courtyard and only exist during the trial
  spawnTrial(def, pos, { hpMul = 1, sizeMul = 1, dmgMul = 1, name = null, tint = null } = {}) {
    const dim = this.dim || DIMENSIONS[0];
    const sc = enemyScale(dim.level);
    const d = { ...def, size: (def.size || 1) * sizeMul };
    const e = this.add({
      kind: 'trial', trial: true, def: d, name: name || def.name, pos,
      hp: def.hp * sc.hp * hpMul, dmg: def.dmg * sc.dmg * dmgMul, speed: def.speed * (sizeMul > 1 ? 0.85 : 1), coins: def.coins * sc.coins * (hpMul > 1 ? 4 : 1),
      xp: Math.round((6 + def.hp * sc.hp * 0.12) * Math.max(1, hpMul * 0.6)), loot: def.loot, isDark: !!dim.biome.alwaysNight,
    });
    if (!e) return null;
    e.noticed = true; e.state = 'chase';
    if (tint) { e.baseTint = tint; this.untint(e); }
    this.game.fx.sparkles(pos.clone().setY(pos.y + 1), tint || '#ff6a6a', 24, 3);
    this.game.fx.dust(pos, '#8a7a62', 10, 1.4);
    return e;
  }

  add(o) {
    // Easy / Medium / Hard: tougher or softer monsters (new spawns use the current setting)
    const D = this.game.diff;
    o = { ...o, hp: o.hp * D.enemyHp, dmg: o.dmg * D.enemyDmg };
    const q = this.game.settings.quality;
    let rig;
    if (o.kind === 'bandit') rig = createNPC(o.captain ? 'bandit_captain' : 'bandit', { outfit: o.outfit, seed: NEXT_ID * 7 + 3, quality: q });
    else rig = createEnemy(o.def, { quality: q });
    const e = {
      id: NEXT_ID++, ...o,
      rig, maxHp: Math.round(o.hp), hp: Math.round(o.hp),
      yaw: rand(0, Math.PI * 2), vel: new THREE.Vector3(), knock: new THREE.Vector3(),
      radius: rig.radius || 0.5, height: rig.height || 1.6, hitHeight: rig.hitHeight || (rig.height || 1.6) + 0.4,
      state: 'wander', stateT: rand(0, 3), target: o.pos.clone(), home: o.pos.clone(),
      attack: null, attackCd: rand(0.6, 1.4), noticed: false, alive: true, dying: 0,
      frozenT: 0, rootedT: 0, burnT: 0, burnDps: 0, burnTick: 0, lastHitT: -100, acc: 0, fade: 0, pose: '',
      flying: o.def && o.def.shape === 'flyer',
    };
    e.pos = o.pos.clone();
    rig.root.position.copy(e.pos);
    rig.root.rotation.y = e.yaw;
    rig.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    if (o.kind === 'bandit' && rig.setSword) { /* bandits get their sword from the model */ }
    this.game.scene.add(rig.root);
    this.list.push(e);
    return e;
  }

  // targetable things for the sword / powers
  targets() {
    const out = this.list.filter((e) => e.alive);
    if (this.game.boss) for (const b of this.game.boss.list) if (b.alive) out.push(b);
    if (this.game.npcs) for (const d of this.game.npcs.dummies) if (d.alive) out.push(d);   // practice dummies (Home: dojo + trainer)
    return out;
  }

  // ---------------------------------------------------------------- damage
  hit(e, dmg, o = {}) {
    if (!e || !e.alive) return 0;
    if (e.isBoss) return this.game.boss.hit(e, dmg, o);
    if (e.isDummy) return this.game.npcs.hitDummy(e, dmg, o);   // practice dummies only count hits
    const g = this.game;
    if (e.isNight && o.source === 'sword') dmg *= 0.5;
    if (o.power === 'light' && (e.isNight || e.isDark)) dmg *= 2;
    if (e.isNight && g.npcs.watchBoost(e.pos)) dmg *= 2;   // the Night Watch's lantern
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.lastHitT = g.time;
    if (!e.noticed) { e.noticed = true; }
    if (e.state === 'wander' || e.state === 'return') { e.state = 'chase'; }
    e.rig.hurt();
    const top = this._v.set(e.pos.x, e.pos.y + e.hitHeight, e.pos.z);
    g.hud.damageNumber(top, dmg, o.crit ? 'crit' : (o.power ? 'power' : 'hit'), o.label, o.color);
    if (o.knock && o.from && e.frozenT <= 0) {
      const dx = e.pos.x - o.from.x, dz = e.pos.z - o.from.z, d = Math.hypot(dx, dz) || 1;
      const k = o.knock * (e.isNight ? 0.5 : 1) * (e.captain ? 0.6 : 1);
      e.knock.x += dx / d * k; e.knock.z += dz / d * k;
    }
    if (e.hp <= 0) this.kill(e, o);
    return dmg;
  }

  kill(e, o = {}) {
    if (e.isDummy) return;
    if (!e.alive) return;
    const g = this.game;
    e.alive = false;
    e.hp = 0;
    e.dying = 0;
    e.rig.setFrozen && e.rig.setFrozen(false);
    e.rig.setTint && e.rig.setTint(null);
    e.rig.setPose('dead');
    const c = this._v.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
    g.fx.sparkles(c, e.def && e.def.color ? e.def.color : '#fff6b0', o.crumble ? 50 : 32, 4);
    g.fx.sparkles(c, '#ffffff', 12, 3);
    g.audio.play('enemyDie', { pitch: 0.9 + Math.random() * 0.25 });
    if (e.fadingAway) return;   // night creature melting at sunrise: no reward
    // Bone Suit: defeating enemies heals
    g.players.forEach((p) => { if (p.suit && p.suit.kind === 'bone' && !p.dead && Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < 30) p.heal(p.maxHp * 0.15); });
    const killer = o.by || g.player;
    const coinBonus = killer.stat('coinBonus', 1);
    const loot = e.loot && Math.random() < (e.kind === 'bandit' ? 0.6 : e.kind === 'night' ? 0.7 : 0.35) ? e.loot : null;
    const D = g.diff;
    g.fx.dropCoins(e.pos, Math.max(1, Math.round(e.coins * coinBonus * D.coins * rand(0.85, 1.15))), loot);
    g.player.addXp(Math.round(e.xp * D.xp));
    if (g.npcs) g.npcs.onEnemyKilled(e, o);
    g.state.kills++;
    if (e.kind === 'bandit') {
      g.state.banditsDefeated = (g.state.banditsDefeated || 0) + 1;
      if (e.camp && e.camp.members.every((m) => !m.alive)) {
        e.camp.respawnAt = g.time + 180;
        g.hud.toast(`You cleared the ${e.name.replace(' Captain', '')} camp!`, 'good', 3);
      }
    }
    if (e.kind === 'night') g.state.nightKills = (g.state.nightKills || 0) + 1;
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const g = this.game, w = g.world;
    if (!w || !g.player) return;
    const night = isNight(g.timeOfDay);
    const awake = g.players.filter((q) => !q.dead && !q.sleeping);

    // spawning
    if (this.dim) {
      this.spawnT -= dt;
      const alive = this.list.filter((e) => e.kind === 'monster' && e.alive).length;
      if (this.spawnT <= 0 && alive < this.targetCount) { this.spawnMonster(45); this.spawnT = 2.5; }
      for (const camp of this.camps) {
        if (camp.respawnAt && g.time > camp.respawnAt && this.minPlayerDist(camp.pos.x, camp.pos.z) > 50) {
          camp.respawnAt = 0;
          camp.members.forEach((m) => { const i = this.list.indexOf(m); if (i >= 0 && !m.alive) { this.removeRig(m); this.list.splice(i, 1); } });
          this.spawnCamp(camp);
        }
      }
    }
    if (night && awake.length && g.mode.id !== 'creative' && this.dim) {   // Home Base is safe: no night creatures there
      this.nightT -= dt;
      const maxN = g.diff.nightMax;
      const n = this.list.filter((e) => e.kind === 'night' && e.alive).length;
      if (this.nightT <= 0) { if (n < maxN) this.spawnNight(); this.nightT = rand(20, 30) * g.diff.nightEvery; }
    } else if (!night) this.nightT = 8;
    if (this.wasNight && !night) {
      // sunrise: night creatures fade away
      this.list.forEach((e) => { if (e.kind === 'night' && e.alive) { e.fadingAway = true; this.kill(e); } });
      if (this.list.some((e) => e.kind === 'night')) g.hud.toast('The sun is up - the night creatures fade away.', 'good', 3);
    }
    this.wasNight = night;

    const L = w.liquid;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      // each enemy goes after the closest player
      const p = (e.alive && this.nearestFoe(e.pos)) || this.nearestPlayer(e.pos) || g.player;
      const detectable = !p.dead && !p.sleeping && p.fadeT <= 0;
      const stealth = p.stat('stealth', 1);
      if (!e.rig) { this.list.splice(i, 1); continue; }
      if (!e.alive) {
        e.dying += dt;
        e.rig.update(dt);
        const k = clamp((e.dying - 0.5) / 0.6, 0, 1);
        if (k > 0) e.rig.root.scale.setScalar(Math.max(0.01, 1 - k));
        if (e.dying > 1.1) {
          if (!e.vanished) { e.vanished = true; g.fx.sparkles(this._v.set(e.pos.x, e.pos.y + 0.5, e.pos.z), '#ffffff', 10, 2); }
          this.removeRig(e);
          if (!e.camp) this.list.splice(i, 1);
        }
        continue;
      }
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      // level of detail: far enemies think less often
      let edt = dt;
      if (d > 70) { e.acc += dt; if (e.acc < 0.3) { continue; } edt = e.acc; e.acc = 0; }
      e.rig.root.visible = d < 170;

      // status effects
      if (e.frozenT > 0) {
        e.frozenT -= edt;
        if (e.frozenT <= 0) { e.rig.setFrozen(false); }
      }
      if (e.rootedT > 0) e.rootedT -= edt;
      if (e.stunT > 0) { e.stunT -= edt; if (Math.random() < edt * 6) g.fx.burst({ pos: this._v.set(e.pos.x, e.pos.y + e.hitHeight, e.pos.z), count: 1, spread: 0.3, velSpread: 0.5, life: [0.3, 0.5], size: [0.15, 0.25], color: '#fff6b0', sprite: 'spark' }); }
      if (e.slowT > 0) { e.slowT -= edt; if (e.slowT <= 0) e.slowK = 1; }
      if (e.burnT > 0) {
        e.burnT -= edt; e.burnTick += edt;
        if (Math.random() < edt * 12) g.fx.burst({ pos: this._v.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z), count: 1, spread: e.radius, up: 2, life: [0.3, 0.6], size: [0.25, 0.5], color: ['#ff6a1a', '#ffb347'], sprite: 'dot' });
        if (e.burnTick >= 0.5) { e.burnTick = 0; this.hit(e, e.burnDps * 0.5, { source: 'burn', power: 'fire', color: '#ff8a3a' }); if (!e.alive) continue; }
      }
      if (e.pullT > 0) {
        e.pullT -= edt;
        const px = e.pull.x - e.pos.x, pz = e.pull.z - e.pos.z, pd = Math.hypot(px, pz);
        if (pd > 0.8) { e.pos.x += px / pd * Math.min(pd, 6 * edt); e.pos.z += pz / pd * Math.min(pd, 6 * edt); }
      }
      const frozen = e.frozenT > 0;
      if (e.fearT > 0) {   // Nightmare: run away from the player
        e.fearT -= edt;
        if (e.state === 'attack') { e.attack = null; this.untint(e); }
        e.state = 'chase';
        if (!frozen && !(e.rootedT > 0) && !(e.stunT > 0) && d > 0.01) {
          e.vel.x += (-dx / d * e.speed - e.vel.x) * Math.min(1, edt * 8);
          e.vel.z += (-dz / d * e.speed - e.vel.z) * Math.min(1, edt * 8);
        }
        if (Math.random() < edt * 4) g.fx.burst({ pos: this._v.set(e.pos.x, e.pos.y + e.hitHeight + 0.2, e.pos.z), count: 1, velSpread: 0.4, up: 0.8, life: [0.4, 0.7], size: [0.2, 0.35], color: '#b07aff', sprite: 'spark' });
        e.pos.x += e.vel.x * edt; e.pos.z += e.vel.z * edt;
        if (g.colliders) g.colliders.resolve(e.pos, e.radius * 0.8);
        g.resolveWalls(e.pos, e.radius * 0.8);
        let fy = w.heightAt(e.pos.x, e.pos.z); if (L && L.type === 'ice') fy = Math.max(fy, L.level);
        e.pos.y += (fy - e.pos.y) * Math.min(1, 15 * edt);
        e.yaw = angleDamp(e.yaw, Math.atan2(e.vel.x, e.vel.z), 8, edt);
        if (e.pose !== 'move' && e.pose !== 'run') { e.pose = e.kind === 'bandit' ? 'run' : 'move'; e.rig.setPose(e.pose); }
        e.rig.setMoveSpeed(e.speed);
        if (!frozen) e.rig.update(edt);
        e.rig.root.position.copy(e.pos); e.rig.root.rotation.y = e.yaw;
        continue;
      }

      // AI
      const notice = e.kind === 'night' || e.trial ? 999 : 18 * stealth;
      const leash = e.trial ? 999 : e.kind === 'bandit' ? 45 : e.kind === 'minion' ? 999 : 60;
      const homeD = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z);
      let mvx = 0, mvz = 0, spd = 0;
      e.stateT -= edt;
      e.attackCd -= edt;
      if (!frozen) {
        switch (e.state) {
          case 'wander': {
            if (e.stateT <= 0) {
              e.stateT = rand(3, 7);
              const c = e.camp ? e.camp.pos : e.home;
              const t = this.findSpot(c, 0, e.camp ? e.camp.radius + 6 : 12, 4);
              if (t) e.target.copy(t);
              e.idle = Math.random() < 0.35;
            }
            if (!e.idle) {
              const tx = e.target.x - e.pos.x, tz = e.target.z - e.pos.z, td = Math.hypot(tx, tz);
              if (td > 1) { mvx = tx / td; mvz = tz / td; spd = e.speed * 0.35; }
            }
            if (detectable && d < notice && Math.abs(p.pos.y - e.pos.y) < 12) {
              e.state = 'chase'; e.noticed = true;
              if (e.kind === 'bandit' && !g.state.hints.bandit) { g.state.hints.bandit = true; g.hud.toast('Bandits! Defeat them for coins and treasure.', 'info', 3.5); }
            }
            break;
          }
          case 'chase': {
            if (!detectable || (d > notice * 2.2 && e.kind !== 'night') || (homeD > leash && e.kind !== 'night')) {
              e.state = e.kind === 'night' && detectable ? 'chase' : 'return'; e.stateT = 0;
              if (!detectable && e.kind !== 'minion') e.state = 'return';
              break;
            }
            const reach = e.radius + 1.25 + (e.def && e.def.size ? (e.def.size - 1) * 0.6 : 0);
            if (d > reach * 0.85) { mvx = dx / d; mvz = dz / d; spd = e.speed * (e.kind === 'night' ? 1 : 0.9); }
            if (d < reach + 0.2 && e.attackCd <= 0 && !(e.stunT > 0) && Math.abs(p.pos.y - e.pos.y) < 2.5) this.startAttack(e, reach);
            break;
          }
          case 'attack': {
            const a = e.attack;
            a.t += edt;
            e.yaw = angleDamp(e.yaw, yawTo(e.pos.x, e.pos.z, p.pos.x, p.pos.z), 6, edt);
            if (!a.done && a.t >= a.hit) {
              a.done = true;
              this.untint(e);
              const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
              const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
              if (d < a.reach + 0.7 && dot > 0.2 && Math.abs(p.pos.y - e.pos.y) < 2.5 && !p.dead) {
                p.hurt(e.dmg * rand(0.9, 1.1), e.pos, { knock: e.kind === 'night' ? 6 : 4, src: e });
                g.fx.hitSparks(this._v.set(p.pos.x, p.pos.y + 1.1, p.pos.z), e.isNight ? '#b07aff' : '#ffb0a0');
              }
            }
            if (a.t >= a.dur) { e.attack = null; e.state = 'chase'; e.attackCd = rand(1.0, 1.8) * (e.kind === 'night' ? 0.8 : 1); }
            break;
          }
          case 'return': {
            const tx = e.home.x - e.pos.x, tz = e.home.z - e.pos.z, td = Math.hypot(tx, tz);
            if (td > 2) { mvx = tx / td; mvz = tz / td; spd = e.speed * 0.7; }
            else { e.state = 'wander'; e.stateT = 0; e.noticed = false; }
            e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1 * edt);
            if (detectable && d < notice * 0.6) e.state = 'chase';
            break;
          }
        }
      }
      if (e.rootedT > 0 || frozen || e.stunT > 0) spd = 0;
      if (e.slowT > 0) spd *= e.slowK || 0.5;

      // movement
      const tvx = mvx * spd, tvz = mvz * spd;
      e.vel.x += (tvx - e.vel.x) * Math.min(1, edt * 8);
      e.vel.z += (tvz - e.vel.z) * Math.min(1, edt * 8);
      let nx = e.pos.x + (e.vel.x + e.knock.x) * edt, nz = e.pos.z + (e.vel.z + e.knock.z) * edt;
      e.knock.multiplyScalar(Math.exp(-edt * 6));
      // avoid water/lava for walkers
      if (!e.flying && L && L.type !== 'ice') {
        const h = w.heightAt(nx, nz);
        if (h < L.level - 0.4) { nx = e.pos.x; nz = e.pos.z; if (e.state === 'wander') e.stateT = 0; }
      }
      e.pos.x = nx; e.pos.z = nz;
      if (g.colliders) g.colliders.resolve(e.pos, e.radius * 0.8);
      g.resolveWalls(e.pos, e.radius * 0.8);
      // keep away from the player body
      if (d < e.radius + p.radius && d > 0.01) { const push = (e.radius + p.radius - d); e.pos.x -= dx / d * push; e.pos.z -= dz / d * push; }
      const rr = Math.hypot(e.pos.x, e.pos.z);
      if (rr > w.radius - 3) { e.pos.x *= (w.radius - 3) / rr; e.pos.z *= (w.radius - 3) / rr; }
      let gy = w.heightAt(e.pos.x, e.pos.z);
      if (L && L.type === 'ice') gy = Math.max(gy, L.level);
      if (L && L.type === 'water' && e.flying) gy = Math.max(gy, L.level);
      if (e.airY > 0 || e.airV > 0) { e.airV -= 24 * edt; e.airY += e.airV * edt; if (e.airY <= 0) { e.airY = 0; e.airV = 0; } }
      e.pos.y += (gy + (e.airY || 0) - e.pos.y) * Math.min(1, (e.airY > 0 ? 40 : 15) * edt);
      const hs = Math.hypot(e.vel.x, e.vel.z);
      if (e.state !== 'attack' && hs > 0.3) e.yaw = angleDamp(e.yaw, Math.atan2(e.vel.x, e.vel.z), 8, edt);
      const pose = e.kind === 'bandit' ? (hs > 3.2 ? 'run' : hs > 0.3 ? 'walk' : 'idle') : (hs > 0.3 ? 'move' : 'idle');
      if (pose !== e.pose) { e.pose = pose; e.rig.setPose(pose); }
      e.rig.setMoveSpeed(hs);
      if (!frozen) e.rig.update(edt);
      e.rig.root.position.copy(e.pos);
      e.rig.root.rotation.y = e.yaw;
    }
    // separation between enemies (cheap: only near ones)
    const A = this.list;
    for (let i = 0; i < A.length; i++) {
      const a = A[i]; if (!a.alive) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j]; if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = (a.radius + b.radius) * 0.9;
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 0.001) { const k = (min - d) / d * 0.5; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; }
      }
    }
  }

  startAttack(e, reach) {
    const a = e.rig.attack();
    e.attack = { t: 0, dur: Math.max(0.5, a.duration), hit: Math.max(0.3, a.hitTime), done: false, reach };
    // stretch the wind-up a little so it is readable
    e.attack.hit = Math.max(e.attack.hit, 0.42); e.attack.dur = Math.max(e.attack.dur, e.attack.hit + 0.25);
    e.state = 'attack';
    e.vel.set(0, 0, 0);
    e.rig.setTint && e.rig.setTint(e.isNight ? '#a040ff' : '#ff3030');
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
    this.game.fx.ground.spawn(this.game.world, {
      shape: 'circle', pos: this._v.set(e.pos.x + fx * reach * 0.55, 0, e.pos.z + fz * reach * 0.55), radius: reach * 0.75,
      color: e.isNight ? '#b040ff' : '#ff3030', duration: e.attack.hit,
    });
    if (e.kind === 'night' && Math.random() < 0.5) this.game.audio.play('growl', { volume: 0.5, pitch: 1.1 });
  }

  // status helpers used by powers
  freeze(e, t) { if (!e.alive) return; if (e.isBoss) return this.game.boss.freeze(e, t); e.frozenT = Math.max(e.frozenT, t); e.rig.setFrozen(true); e.attack = null; if (e.state === 'attack') e.state = 'chase'; this.untint(e); }
  root(e, t) { if (!e.alive) return; if (e.isBoss) { e.rootedT = Math.max(e.rootedT || 0, t * 0.5); return; } e.rootedT = Math.max(e.rootedT, t); }
  burn(e, t, dps) { if (!e.alive) return; e.burnT = Math.max(e.burnT || 0, t); e.burnDps = Math.max(e.burnDps || 0, dps); e.burnTick = e.burnTick || 0; }
  pullTo(e, pos, t) { if (!e.alive || e.isBoss) return; e.pull = pos.clone(); e.pullT = t; }
  slow(e, t, k = 0.45) { if (!e.alive || e.isBoss) return; e.slowT = Math.max(e.slowT || 0, t); e.slowK = Math.min(e.slowK || 1, k); }
  stun(e, t) { if (!e.alive) return; if (e.isBoss) { e.rootedT = Math.max(e.rootedT || 0, 0.4); return; } e.stunT = Math.max(e.stunT || 0, t); if (e.state === 'attack') { e.attack = null; e.state = 'chase'; this.untint(e); } }
  lift(e, v) { if (!e.alive || e.isBoss) return; e.airV = Math.max(e.airV || 0, v); e.airY = Math.max(e.airY || 0, 0.05); }
  untint(e) { if (e.rig && e.rig.setTint) e.rig.setTint(e.baseTint || null); }
  fear(e, t) { if (!e.alive || e.isBoss) return; e.fearT = Math.max(e.fearT || 0, t); }

  nearest(pos, maxD, filter) {
    let best = null, bd = maxD;
    for (const e of this.targets()) {
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  // used when sleeping or travelling
  removeNight() { this.list.forEach((e) => { if (e.kind === 'night' && e.alive) { e.fadingAway = true; this.kill(e); } }); }
  // debug: defeat everything near the player
  defeatNear(r) { const p = this.game.player.pos; this.targets().forEach((e) => { if (!e.isBoss && e.pos.distanceTo(p) < r) this.hit(e, e.hp + 1, { source: 'debug' }); }); }
}

export { DAY_NIGHT };
