// Friendly helpers summoned by power moves (Treant Buddy, Guardian Spirit, Fire Phoenix, Snow Golem, Rock Golem,
// Storm Bird, Prism, Shadow Clone, Skeleton Army). They follow their owner and fight for 12-15 s, then vanish.
import * as THREE from 'three';
import { CHARACTERS } from '../data.js';
import { createEnemy, createHero, createSummon } from './modules.js';
import { rand, angleDamp, clamp } from './util.js';

// how each helper looks + behaves
const KINDS = {
  treant:   { summon: 'treant',   fallback: { shape: 'golem', name: 'Treant Buddy', color: '#6b4a2c', eyes: '#9aff7a', size: 1.0 }, walker: true, reach: 1.8, rate: 1.2, color: '#5dff7a', power: 'life' },
  snowgolem:{ summon: 'golem',    fallback: { shape: 'golem', name: 'Snow Golem', color: '#eef6ff', eyes: '#7fd8ff', size: 1.05 }, walker: true, reach: 1.9, rate: 1.3, color: '#bfefff', power: 'ice', freeze: true },
  rockgolem:{ summon: 'golem',    fallback: { shape: 'golem', name: 'Rock Golem', color: '#8a7a62', eyes: '#ffb347', size: 1.25 }, walker: true, reach: 2.1, rate: 1.5, color: '#c08a4a', power: 'earth', knock: 9 },
  skeleton: { summon: 'skeleton', fallback: { shape: 'humanoid', name: 'Skeleton Warrior', color: '#e8e2d0', eyes: '#7affc8', size: 0.95 }, walker: true, reach: 1.7, rate: 1.1, color: '#b8ffe0', power: 'death' },
  clone:    { clone: true, walker: true, reach: 2.4, rate: 0.8, color: '#8a4dff', power: 'darkness' },
  phoenix:  { summon: 'phoenix',  fallback: { shape: 'flyer', name: 'Fire Phoenix', color: '#ff6a1a', eyes: '#ffe08a', size: 1.2 }, flyer: true, rate: 1.2, color: '#ff8a2a', power: 'fire', shot: 'fire' },
  bird:     { summon: 'bird',     fallback: { shape: 'flyer', name: 'Storm Bird', color: '#4a5aff', eyes: '#e8e4ff', size: 1.2 }, flyer: true, rate: 1.5, color: '#b9b0ff', power: 'lightning', shot: 'bolt' },
  spirit:   { summon: 'spirit',   orb: '#7fffd4', flyer: true, rate: 1.5, color: '#7fffd4', power: 'healing', shot: 'zap', heals: true },
  prism:    { orb: 'prism', flyer: true, rate: 1.0, color: '#fff3b0', power: 'light', shot: 'beam' },
};

export class Allies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
    this.prismGeo = new THREE.OctahedronGeometry(0.45, 0).scale(0.8, 1.4, 0.8);
  }
  clear() { this.list.forEach((a) => this.remove(a)); this.list.length = 0; }
  remove(a) {
    const g = this.game;
    if (a.rig) { g.scene.remove(a.rig.root); a.rig.dispose(); a.rig = null; }
    if (a.mesh) { g.fx.group.remove(a.mesh); if (a.mesh.material) a.mesh.material.dispose(); a.mesh = null; }
    if (a.spr) { g.fx.freeSprite(a.spr); a.spr = null; }
  }
  count(owner) { return this.list.filter((a) => a.owner === owner).length; }

  summon(owner, kind, { dmg = 20, dur = 15, n = 1 } = {}) {
    const g = this.game, K = KINDS[kind];
    if (!K) return;
    // an owner keeps at most 4 helpers: the oldest ones leave first
    while (this.count(owner) + n > 4) { const old = this.list.find((a) => a.owner === owner); old.t = old.dur; this.update(0); }
    for (let i = 0; i < n; i++) {
      const ang = owner.yaw + Math.PI * 0.5 + (i - (n - 1) / 2) * 0.9 + (n === 1 ? 0 : 0);
      const pos = owner.pos.clone().add(new THREE.Vector3(Math.sin(ang) * 2.2, 0, Math.cos(ang) * 2.2));
      pos.y = g.world.heightAt(pos.x, pos.z);
      const a = { kind, K, owner, pos, yaw: owner.yaw, vel: new THREE.Vector3(), t: 0, dur, dmg, cd: rand(0.3, 0.8), attack: null, slot: i + this.count(owner), bob: rand(0, 6), pose: '' };
      const q = g.settings.quality;
      if (K.clone) {
        a.rig = createHero(CHARACTERS[owner.charIndex], { quality: q });
        a.rig.setSword(owner.sword);
      } else if (K.summon && !K.orb) {
        a.rig = createSummon(K.summon, { color: K.fallback ? K.fallback.color : K.color, quality: q }) || createEnemy(K.fallback, { quality: q });
        if (a.rig.setTint) a.rig.setTint(null);
      } else if (K.summon && K.orb) {
        a.rig = createSummon(K.summon, { color: K.color, quality: q });
      }
      if (a.rig) {
        a.rig.root.position.copy(pos);
        a.rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        a.rig.setPose(K.walker ? 'idle' : 'move');
        g.scene.add(a.rig.root);
        a.radius = a.rig.radius || 0.5;
      } else {
        // glowing orb / crystal made of effects
        if (K.orb === 'prism') {
          a.mesh = new THREE.Mesh(this.prismGeo, new THREE.MeshStandardMaterial({ color: '#fff8d8', emissive: '#ffe08a', emissiveIntensity: 1.2, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
          g.fx.group.add(a.mesh);
        }
        a.spr = g.fx.sprite(K.color, K.orb === 'prism' ? 2.2 : 1.6);
        a.radius = 0.4;
      }
      this.list.push(a);
      g.fx.sparkles(pos.clone().setY(pos.y + 1), K.color, 30, 3);
      g.fx.ground.spawn(g.world, { shape: 'circle', pos, radius: 1.6, color: K.color, duration: 1, mode: 'ring' });
    }
  }

  target(a, range = 16) {
    const g = this.game;
    let best = null, bd = range;
    for (const e of g.enemies.targets()) {
      const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
      const dOwner = Math.hypot(e.pos.x - a.owner.pos.x, e.pos.z - a.owner.pos.z);
      if (dOwner > 22) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  update(dt) {
    const g = this.game, w = g.world;
    if (!w) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i], K = a.K, o = a.owner;
      a.t += dt;
      if (a.t >= a.dur || o.dead || !g.players.includes(o)) {
        g.fx.sparkles(this._v.set(a.pos.x, a.pos.y + 1, a.pos.z), K.color, 24, 3);
        this.remove(a); this.list.splice(i, 1); continue;
      }
      const e = this.target(a);
      a.cd -= dt;
      if (K.walker) this.walker(a, e, dt);
      else this.flyer(a, e, dt);
      // friendly sparkle so kids can tell helpers from monsters
      if (Math.random() < dt * 3) g.fx.burst({ pos: this._v.set(a.pos.x, a.pos.y + (a.rig ? (a.rig.height || 1.6) + 0.3 : 0), a.pos.z), count: 1, up: 0.6, life: [0.4, 0.7], size: [0.15, 0.3], color: [K.color, '#ffffff'], sprite: 'spark' });
      if (K.clone && Math.random() < dt * 10) g.fx.burst({ pos: this._v.set(a.pos.x + rand(-0.4, 0.4), a.pos.y + rand(0.2, 1.7), a.pos.z + rand(-0.4, 0.4)), count: 1, blend: 'normal', up: 0.4, life: [0.4, 0.7], size: [0.4, 0.7], sizeEnd: 1.5, alpha: 0.5, color: ['#1a1028', '#3a1a6a'], sprite: 'smoke' });
    }
  }

  walker(a, e, dt) {
    const g = this.game, w = g.world, K = a.K, o = a.owner;
    let tx, tz, spd = 0;
    if (e) { tx = e.pos.x; tz = e.pos.z; }
    else { const s = (a.slot % 2 ? 1 : -1) * (1.6 + Math.floor(a.slot / 2)); tx = o.pos.x - Math.sin(o.yaw) * 2 + Math.cos(o.yaw) * s; tz = o.pos.z - Math.cos(o.yaw) * 2 - Math.sin(o.yaw) * s; }
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
    const reach = K.reach + (e ? e.radius : 0);
    if (a.attack) {
      a.attack.t += dt;
      if (!a.attack.done && a.attack.t >= a.attack.hit) {
        a.attack.done = true;
        const tgt = a.attack.e;
        if (tgt && tgt.alive && Math.hypot(tgt.pos.x - a.pos.x, tgt.pos.z - a.pos.z) < reach + 1) {
          g.enemies.hit(tgt, a.dmg * g.powers.scale(), { power: K.power, by: o, color: K.color, knock: K.knock || 3, from: a.pos });
          g.fx.hitSparks(this._v.set(tgt.pos.x, tgt.pos.y + tgt.height * 0.5, tgt.pos.z), K.color, false);
          if (K.freeze) { if (Math.random() < 0.35) g.enemies.freeze(tgt, 1.2); else g.enemies.slow(tgt, 2, 0.5); }
          g.audio.play('hit', { volume: 0.45, pitch: 1.1 });
        }
      }
      if (a.attack.t >= a.attack.dur) a.attack = null;
    } else if (e && d < reach) {
      a.yaw = Math.atan2(dx, dz);
      if (a.cd <= 0) {
        const r = a.rig ? (K.clone ? a.rig.attack(Math.floor(Math.random() * 3)) : a.rig.attack()) : { duration: 0.6, hitTime: 0.3 };
        a.attack = { t: 0, dur: Math.max(0.4, r.duration), hit: clamp(r.hitTime, 0.15, 0.5), done: false, e };
        a.cd = K.rate;
      }
    } else if (d > (e ? reach * 0.9 : 1.2)) {
      spd = Math.min(e ? 5.5 : 7, d * 2);
      if (!e && d > 30) { a.pos.set(tx, w.heightAt(tx, tz), tz); }   // fell far behind: catch up
    }
    if (spd > 0 && d > 0.01) { a.vel.set(dx / d * spd, 0, dz / d * spd); a.yaw = angleDamp(a.yaw, Math.atan2(dx, dz), 8, dt); } else a.vel.multiplyScalar(Math.exp(-dt * 8));
    a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt;
    if (g.colliders) g.colliders.resolve(a.pos, (a.radius || 0.5) * 0.8);
    let gy = w.heightAt(a.pos.x, a.pos.z);
    if (w.liquid && w.liquid.type === 'ice') gy = Math.max(gy, w.liquid.level);
    a.pos.y += (gy - a.pos.y) * Math.min(1, dt * 15);
    if (a.rig) {
      const hs = Math.hypot(a.vel.x, a.vel.z);
      const pose = K.clone ? (hs > 4 ? 'run' : hs > 0.4 ? 'walk' : 'idle') : (hs > 0.4 ? 'move' : 'idle');
      if (pose !== a.pose) { a.pose = pose; a.rig.setPose(pose); }
      a.rig.setMoveSpeed(hs);
      a.rig.update(dt);
      a.rig.root.position.copy(a.pos);
      a.rig.root.rotation.y = a.yaw;
    }
  }

  flyer(a, e, dt) {
    const g = this.game, w = g.world, K = a.K, o = a.owner, fx = g.fx;
    // circle around the owner (or above the target when attacking)
    a.bob += dt;
    const ang = a.bob * 1.1 + a.slot * 2.1;
    const cx = e && K.shot === 'fire' ? e.pos.x : o.pos.x, cz = e && K.shot === 'fire' ? e.pos.z : o.pos.z;
    const R = e && K.shot === 'fire' ? 4 : 2.6;
    const tx = cx + Math.cos(ang) * R, tz = cz + Math.sin(ang) * R;
    a.pos.x += (tx - a.pos.x) * Math.min(1, dt * 3);
    a.pos.z += (tz - a.pos.z) * Math.min(1, dt * 3);
    const ty = Math.max(w.heightAt(a.pos.x, a.pos.z), o.pos.y) + (a.rig ? 0.4 : 2.6) + Math.sin(a.bob * 2) * 0.25;
    a.pos.y += (ty - a.pos.y) * Math.min(1, dt * 4);
    a.yaw = angleDamp(a.yaw, Math.atan2(tx - a.pos.x, tz - a.pos.z) || a.yaw, 6, dt);
    const at = this._w.set(a.pos.x, a.pos.y + (a.rig ? (a.rig.height || 1.4) * 0.8 : 0), a.pos.z);
    if (a.rig) { a.rig.setMoveSpeed(4); a.rig.update(dt); a.rig.root.position.copy(a.pos); a.rig.root.rotation.y = a.yaw; }
    if (a.mesh) { a.mesh.position.copy(at); a.mesh.rotation.y += dt * 2; }
    if (a.spr) { a.spr.position.copy(at); a.spr.material.opacity = 0.75 + Math.sin(a.bob * 6) * 0.2; }
    if (Math.random() < dt * 14) fx.burst({ pos: at, count: 1, spread: 0.3, velSpread: 0.5, life: [0.3, 0.6], size: [0.2, 0.4], color: [K.color, '#ffffff'], sprite: 'dot', alpha: 0.7 });
    // healing spirit
    if (K.heals) {
      a.healT = (a.healT || 0) + dt;
      if (a.healT >= 2) { a.healT = 0; o.heal(o.maxHp * 0.05); fx.burst({ pos: o.pos.clone().setY(o.pos.y + 1), count: 8, spread: 0.5, up: 2, life: [0.5, 0.8], size: [0.15, 0.3], color: [K.color, '#ffffff'], sprite: 'spark' }); }
    }
    if (!e || a.cd > 0) return;
    a.cd = K.rate;
    const hitAt = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z);
    const d = a.dmg * g.powers.scale();
    if (K.shot === 'fire') {
      const vel = hitAt.clone().sub(at).normalize().multiplyScalar(26);
      fx.projectile({ pos: at, vel, color: '#ff8a2a', size: 0.7, life: 1.5, trail: { color: ['#ff6a1a', '#ffb347'], count: 2, size: [0.25, 0.5] },
        onHit: (pr) => { fx.burst({ pos: pr.pos, count: 16, velSpread: 4, life: [0.3, 0.6], size: [0.3, 0.6], color: ['#ff6a1a', '#ffb347'], sprite: 'dot' }); g.powers.inRadius(pr.pos, 2.2).forEach((t) => { g.enemies.hit(t, d, { power: 'fire', by: o, color: '#ffb347' }); g.enemies.burn(t, 2, 5); }); } });
      g.audio.play('power_fire', { volume: 0.4, pitch: 1.5 });
    } else if (K.shot === 'bolt') {
      g.powers.bolt([at.clone(), hitAt], '#e8e4ff', 0.08, 0.25);
      fx.flash(hitAt, '#b9b0ff', 20, 10, 0.2);
      g.enemies.hit(e, d, { power: 'lightning', by: o, color: '#d8d0ff' });
      g.audio.play('zap', { volume: 0.5 });
    } else if (K.shot === 'zap') {
      g.powers.bolt([at.clone(), hitAt], '#c8fff0', 0.05, 0.2);
      g.enemies.hit(e, d, { power: 'healing', by: o, color: K.color });
      g.audio.play('zap', { volume: 0.3, pitch: 1.5 });
    } else if (K.shot === 'beam') {
      g.powers.beamMesh(at.clone(), hitAt, '#fff3b0', 0.35, 0.35);
      g.enemies.hit(e, d, { power: 'light', by: o, color: '#fff3b0' });
      g.audio.play('power_light', { volume: 0.25, pitch: 1.6 });
    }
  }
}
