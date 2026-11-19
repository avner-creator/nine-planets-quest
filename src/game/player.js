// A player (1 or 2 of them): stats, movement physics, sword combos, health/mana, suits, own power state.
import * as THREE from 'three';
import { CHARACTERS, SWORDS, ARMORS, LEVEL_UP, xpForLevel, POWERS } from '../data.js';
import { damp } from './util.js';
import { createHero } from './modules.js';

const GRAV = 26, JUMP = 9.2, WALK = 6.2, TURN = 2.7;

export class Player {
  constructor(game, index = 0) {
    this.game = game;
    this.index = index;          // 0 = player 1, 1 = player 2
    this.ctl = null;             // Controls for this player
    this.view = null;            // { camera, cam } set by the game
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.onGround = true;
    this.coyote = 0;
    this.flying = false;
    this.swimming = false;
    this.inLava = false;
    this.onIce = false;
    this.dead = false;
    this.deadT = 0;
    this.sleeping = false;
    this.rig = null;
    this.charIndex = 0;
    this.hp = 100; this.mana = 100;
    this.attack = null;       // { t, dur, hit, combo, didHit }
    this.cast = null;         // { t, dur, release, power, move, done }
    this.combo = 0;
    this.lastAttackEnd = -10;
    this.queued = false;
    this.lastHurt = -100;
    this.hots = [];
    this.fadeT = 0;           // enemies lose you (darkness)
    this.shieldT = 0;         // Guardian Angel: blocks all damage
    this.secondChanceT = 0;   // Second Chance: revive once
    this.suit = null;         // { el, kind, t, dur, block, color, dmg }
    this.dashing = false;
    this.stepDist = 0;
    this.airTime = 0;
    this.time = 0;
    this.height = 1.8;
    this.radius = 0.42;
    this.buildPose = 0;
    this.buffs = {};            // helper boosts: sharp / sage / snack / song / luck = seconds left, shield = hits left
    // power state (each player has their own)
    this.pw = { cd: POWERS.map(() => new Array(9).fill(0)), holding: false, holdT: 0, charged: false, chargeOk: false, chargeLight: null, queued: false, dash: null };
  }

  get state() { return this.game.state; }
  get char() { return CHARACTERS[this.charIndex]; }
  get mode() { return this.game.mode; }
  get level() { return this.state.level; }
  get maxHp() { return Math.round(this.char.stats.hp + LEVEL_UP.hp * (this.level - 1)); }
  get maxMana() { return Math.round(this.char.stats.mana + LEVEL_UP.mana * (this.level - 1)); }
  get strength() { return this.char.stats.strength + LEVEL_UP.strength * (this.level - 1); }
  get speedMul() { const b = this.buffs || {}; return (this.char.stats.speed || 1) * (this.suit && this.suit.kind === 'storm' ? 1.25 : 1) * (b.snack > 0 ? 1.25 : 1) * (b.song > 0 ? 1.15 : 1); }
  stat(k, d = 1) { const v = this.char.stats[k]; return v === undefined ? d : v; }
  get sword() { return SWORDS[this.state.sword]; }
  get armor() { return ARMORS[this.state.armor]; }
  get invincible() { return !!this.mode.invincible; }
  get ownPower() { return this.char.power; }
  get sel() { return this.state.sel[this.index]; }   // { power, move }
  get cam() { return this.view ? this.view.cam : this.game.cam; }

  // ---------------------------------------------------------------- character
  setCharacter(index, keepPct = true) {
    const hpPct = keepPct && this.rig ? this.hp / this.maxHp : 1;
    const mpPct = keepPct && this.rig ? this.mana / this.maxMana : 1;
    if (this.rig) { this.game.scene.remove(this.rig.root); this.rig.dispose(); }
    this.charIndex = index;
    if (this.index === 0) this.state.character = index; else this.state.character2 = index;
    this.rig = createHero(CHARACTERS[index], { quality: this.game.settings.quality });
    this.height = this.rig.height || 1.8;
    this.rig.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.game.scene.add(this.rig.root);
    this.refreshGear();
    this.hp = Math.max(1, Math.round(this.maxHp * hpPct));
    this.mana = this.maxMana * mpPct;
    this.lastPose = null;
    this.syncRig();
  }
  get fists() { return this.char.fightStyle === 'fists'; }
  // "Iron Sword" - or for Kai: "Fists (Iron power)" (the sword you bought still makes the fists stronger)
  get weaponName() { return this.fists ? `Fists (${this.sword.name.replace(/\s*Sword$/i, '')} power)` : this.sword.name; }
  refreshGear() {
    if (!this.rig) return;
    if (this.fists) {
      // punches and kicks (the model may not know fists yet: then just no sword in the hand)
      if (this.rig.raw && typeof this.rig.raw.setFightStyle === 'function') this.rig.setFightStyle('fists');
      else this.rig.setSword(null);
    } else this.rig.setSword(this.sword);
    this.rig.setArmor(this.armor);
  }
  removeRig() { if (this.rig) { this.game.scene.remove(this.rig.root); this.rig.dispose(); this.rig = null; } }

  // ---------------------------------------------------------------- spawn / reset
  placeAt(pos, yaw) {
    this.pos.copy(pos);
    this.pos.y = this.groundAt(pos.x, pos.z, pos.y + 50);
    this.vel.set(0, 0, 0);
    this.yaw = yaw || 0;
    this.attack = null; this.cast = null;
    this.syncRig();
  }
  syncRig() {
    if (!this.rig) return;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }

  // ground = terrain, ice surface, lava surface, block tops
  groundAt(x, z, y = 1e9) {
    const w = this.game.world;
    if (!w) return 0;
    let g = w.heightAt(x, z);
    const L = w.liquid;
    if (L && L.type === 'ice' && L.level > g) g = L.level;
    if (L && L.type === 'lava' && L.level > g) g = Math.max(g, L.level - 0.35);
    if (this.game.blocks) g = Math.max(g, this.game.blocks.topAt(x, z, y + 0.6, this.radius * 0.7));
    return g;
  }

  // ---------------------------------------------------------------- damage + healing
  hurt(amount, from, opts = {}) {
    const g = this.game;
    if (this.dead || this.invincible || this.sleeping || g.paused || this.dashing) return 0;
    const head = () => this.pos.clone().setY(this.pos.y + this.height + 0.2);
    if (this.shieldT > 0) {
      g.hud.damageNumber(head(), 0, 'heal', 'Blocked!');
      g.fx.sparkles(this.pos.clone().setY(this.pos.y + 1.2), '#ffd34a', 8, 2);
      return 0;
    }
    // the Shield Guard's magic shield blocks a few hits (not lava)
    if (this.buffs && this.buffs.shield > 0 && !opts.silent) {
      this.buffs.shield--;
      g.hud.damageNumber(head(), 0, 'heal', this.buffs.shield ? `Blocked! (${this.buffs.shield} left)` : 'Blocked! Shield gone');
      g.fx.ring(this.pos.clone().setY(this.pos.y + 1), '#c8d4e0', 2, 0.35);
      g.audio.play('shield', { volume: 0.6 });
      return 0;
    }
    let block = opts.pierce ? 0 : (this.armor.block || 0);
    if (this.suit && !opts.pierce) block = 1 - (1 - block) * (1 - this.suit.block);
    const dmg = Math.max(1, Math.round(amount * (1 - block)));
    this.hp -= dmg;
    this.lastHurt = this.time;
    this.rig && this.rig.hurt();
    g.hud.damageFlash(this, Math.min(1, dmg / this.maxHp * 4));
    this.cam.shake(Math.min(0.6, 0.15 + dmg / this.maxHp));
    if (!opts.silent) g.audio.play('hitPlayer', { pitch: 0.9 + Math.random() * 0.2 });
    if (from && opts.knock !== 0) {
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
      const k = (opts.knock || 4) * (this.suit && this.suit.kind === 'stone' ? 0.5 : 1);
      this.vel.x += dx / d * k; this.vel.z += dz / d * k;
      if (opts.up) { this.vel.y = Math.max(this.vel.y, opts.up); this.onGround = false; }
    }
    // suits hit back
    const src = opts.src;
    if (this.suit && src && src.alive) {
      if (this.suit.kind === 'fire') g.enemies.burn(src, 3, 8 * g.powers.scale());
      if (this.suit.kind === 'ice') { g.enemies.slow(src, 3, 0.4); g.fx.burst({ pos: src.pos.clone().setY(src.pos.y + 1), count: 8, velSpread: 2, life: [0.3, 0.5], size: [0.1, 0.2], color: ['#ffffff', '#bfefff'], sprite: 'spark' }); }
    }
    g.hud.damageNumber(head(), dmg, 'player');
    if (this.hp <= 0) {
      if (this.secondChanceT > 0) {        // Second Chance: jump straight back up
        this.secondChanceT = 0;
        this.hp = this.maxHp;
        g.hud.banner('Second Chance!', '', '#7fffd4', 1.6);
        g.audio.play('shield');
        g.fx.sparkles(this.pos.clone().setY(this.pos.y + 1.2), '#7fffd4', 60, 5);
        g.fx.ring(this.pos.clone().setY(this.pos.y + 0.3), '#7fffd4', 4, 0.5);
        return dmg;
      }
      this.hp = 0;
      g.onPlayerDeath(this);
    }
    return dmg;
  }
  heal(amount, show = true) {
    if (this.dead) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const got = Math.round(this.hp - before);
    if (show && got >= 1) this.game.hud.damageNumber(this.pos.clone().setY(this.pos.y + this.height + 0.3), got, 'heal');
  }
  addHot(total, dur) { this.hots.push({ rate: total / dur, t: dur }); }

  // ---------------------------------------------------------------- sword
  tryAttack() {
    if (this.dead || this.sleeping || this.cast) return;
    // Kai: sword key in the air = FLYING KICK
    if (this.fists && !this.attack && !this.onGround && this.airTime > 0.04 && !this.swimming && !this.flying) { this.startFlyingKick(); return; }
    if (this.attack) { if (this.attack.t > this.attack.dur * 0.35) this.queued = true; return; }
    this.startAttack();
  }
  startFlyingKick() {
    const as = this.buffs && this.buffs.song > 0 ? 1.15 : 1;
    const raw = this.rig.raw;
    const a = raw && typeof raw.flyingKick === 'function' ? this.rig.flyingKick() : this.rig.attack(2);
    this.attack = { t: 0, dur: Math.max(0.3, a.duration / as), hit: a.hitTime / as, combo: 2, didHit: false, as, kick: true };
    this.combo = 0; this.attackChain = false;
    this.faceNearestEnemy(6, 1.5);
    this.vel.x += Math.sin(this.yaw) * 7; this.vel.z += Math.cos(this.yaw) * 7;
    this.vel.y = Math.max(this.vel.y, 3.5);
    this.game.audio.play('swing3', { pitch: 1.15 });
  }
  startAttack() {
    const now = this.time;
    this.combo = (now - this.lastAttackEnd < 0.55 && this.combo < 2 && this.attackChain) ? this.combo + 1 : 0;
    this.attackChain = true;
    // the hero's own attackSpeed is already in the model's timings (attack() returns real seconds); only the Bard song speeds it up here
    const as = this.buffs && this.buffs.song > 0 ? 1.15 : 1;
    const a = this.rig.attack(this.combo);
    this.attack = { t: 0, dur: a.duration / as, hit: a.hitTime / as, combo: this.combo, didHit: false, as };
    this.game.audio.play(this.combo === 2 ? 'swing3' : this.combo === 1 ? 'swing2' : 'swing', { pitch: 0.95 + Math.random() * 0.1 });
    this.faceNearestEnemy(5, 1.4);   // help aiming
  }
  faceNearestEnemy(range, maxAngle) {
    const g = this.game;
    let best = null, bd = 1e9;
    for (const e of g.enemies.targets()) {
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) - e.radius;
      if (d > range) continue;
      const a = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - this.yaw), Math.cos(Math.atan2(dx, dz) - this.yaw)));
      if (a > maxAngle) continue;
      if (d + a * 2 < bd) { bd = d + a * 2; best = e; }
    }
    if (best) this.yaw = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z);
    return best;
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    this.time += dt;
    const g = this.game, w = g.world;
    if (!w || !this.rig) return;
    const playing = g.canControl(this);

    // regen + effects
    if (!this.dead) {
      const mr = (3 + this.level * 0.15) * this.stat('manaRegen', 1) * (this.buffs && this.buffs.sage > 0 ? 2 : 1);   // Mana Sage: x2
      this.mana = g.mode.id === 'creative' ? this.maxMana : Math.min(this.maxMana, this.mana + mr * dt);
      const ooc = this.time - this.lastHurt > 8 ? 0.6 * g.diff.hpRegen : 0;
      let hr = ooc + (this.char.stats.hpRegen || 0);
      if (this.suit && this.suit.kind === 'bark') hr += this.maxHp * 0.025;
      if (hr > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + hr * dt);
      for (let i = this.hots.length - 1; i >= 0; i--) {
        const h = this.hots[i];
        const step = Math.min(dt, h.t);
        this.heal(h.rate * step, false);
        h.t -= dt;
        if (h.t <= 0) this.hots.splice(i, 1);
      }
      if (this.mode.invincible) this.hp = this.maxHp;
    }
    this.fadeT = Math.max(0, this.fadeT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.secondChanceT = Math.max(0, this.secondChanceT - dt);
    for (const k in this.buffs) if (k !== 'shield' && this.buffs[k] > 0) this.buffs[k] = Math.max(0, this.buffs[k] - dt);

    // ---- tank controls: left/right turn the hero, forward/back walk
    const ctl = this.ctl;
    const can = playing && !this.dead && !this.sleeping && ctl;
    const turn = can ? ctl.turn() : 0;
    const fwd = can ? ctl.move() : 0;
    if (turn) this.yaw += turn * TURN * dt;
    const mx = Math.sin(this.yaw) * fwd, mz = Math.cos(this.yaw) * fwd;

    // ---- Creative flying: hold jump to fly up, 'down' key to fly down, land to walk again
    if (g.mode.flying && can && ctl.down('jump') && !this.flying && this.holdJumpT > 0.25) {
      this.flying = true;
      if (!g.state.hints['flew' + this.index]) { g.state.hints['flew' + this.index] = true; g.hud.toast(`Flying! Hold ${ctl.key('jump')} to go up, ${ctl.key('down')} to go down.`, 'info', 3); }
    }
    this.holdJumpT = can && ctl.down('jump') ? (this.holdJumpT || 0) + dt : 0;
    if (!g.mode.flying) this.flying = false;

    let speed = WALK * this.speedMul * (fwd < 0 ? 0.6 : 1);
    if (this.attack && !this.attack.kick) speed *= 0.45;
    if (this.cast) speed *= 0.55;
    if (this.swimming) speed *= 0.6;
    if (this.inLava) speed *= 0.6;
    if (this.flying) speed = 15;

    const accel = this.flying ? 6 : this.onGround ? (this.onIce ? 2.2 : 16) : 5;
    this.vel.x = damp(this.vel.x, mx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, mz * speed, accel, dt);

    // ---- vertical
    const L = w.liquid;
    const terrain = w.heightAt(this.pos.x, this.pos.z);
    if (this.flying) {
      let vy = 0;
      if (can && ctl.down('jump')) vy += 1;
      if (can && ctl.down('down')) vy -= 1;
      this.vel.y = damp(this.vel.y, vy * speed * 0.7, 8, dt);
    } else if (!this.swimming) {
      this.vel.y -= GRAV * dt;
      if (can && ctl.hit('jump') && (this.onGround || this.coyote > 0)) {
        this.vel.y = JUMP; this.onGround = false; this.coyote = 0;
        g.audio.play('jump', { volume: 0.5 });
      }
    }

    // ---- integrate horizontal + collide
    const ox = this.pos.x, oz = this.pos.z;
    if (!this.dashing) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    const groundHere = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (!this.flying || this.pos.y < groundHere + 6) {
      if (g.colliders) g.colliders.resolve(this.pos, this.radius);
      g.resolveWalls(this.pos, this.radius);
    }
    if (g.blocks) g.blocks.pushOut(this.pos, this.radius, this.pos.y + 0.55, this.pos.y + this.height - 0.1);
    const r = Math.hypot(this.pos.x, this.pos.z), R = w.radius - 2;
    if (r > R) { this.pos.x *= R / r; this.pos.z *= R / r; }
    if (Number.isNaN(this.pos.x) || Number.isNaN(this.pos.z)) { this.pos.x = ox; this.pos.z = oz; }

    // ---- vertical integrate
    this.pos.y += this.vel.y * dt;
    const ground = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const wasGround = this.onGround;
    this.onGround = false;
    this.swimming = false;
    this.inLava = false;
    this.onIce = false;
    if (L && L.type === 'water' && L.level - terrain > 1.25 && !this.flying) {
      const floatY = L.level - 1.25;
      if (this.pos.y <= floatY + 0.05) {
        this.swimming = true;
        if (ground < floatY) {
          if (!this.wasSwimming && this.vel.y < -6) { g.audio.play('splash'); g.fx.burst({ pos: this.pos.clone().setY(L.level), count: 20, spread: 0.6, flat: true, up: 5, velSpread: 2, gravity: 12, life: [0.4, 0.8], size: [0.15, 0.3], color: '#d8f4ff', sprite: 'dot', alpha: 0.7 }); }
          this.pos.y = damp(this.pos.y, floatY, 8, dt);
          this.vel.y = 0;
          if (can && ctl.hit('jump')) { this.vel.y = 7.5; this.pos.y = floatY + 0.06; this.swimming = false; }
        }
      }
    }
    if (!this.swimming && this.pos.y <= ground) {
      if (!wasGround && this.vel.y < -12) { g.audio.play('land', { volume: 0.6 }); g.fx.dust(this.pos, '#b8a890', 6, 0.7); }
      this.pos.y = ground;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
      if (this.flying && !(can && ctl.down('jump'))) this.flying = false;
    }
    this.wasSwimming = this.swimming;
    if (this.onGround) { this.coyote = 0.12; this.airTime = 0; } else { this.coyote -= dt; this.airTime += dt; }
    if (L && L.type === 'ice' && this.onGround && Math.abs(ground - L.level) < 0.05 && terrain < L.level) this.onIce = true;
    if (L && L.type === 'lava' && !this.flying && terrain < L.level && this.pos.y < L.level + 0.1) {
      this.inLava = true;
      if (!this.mode.invincible && !this.dead) {
        this.lavaTick = (this.lavaTick || 0) + dt;
        if (this.lavaTick >= 0.25) { this.lavaTick = 0; this.hurt(5, null, { knock: 0, silent: true, pierce: true }); g.audio.play('burn', { volume: 0.6 }); }
        if (!this.lavaWarned) { this.lavaWarned = true; g.hud.toast('Ouch! Lava is hot - get out!', 'warn', 2.5); }
      }
      if (Math.random() < dt * 20) g.fx.burst({ pos: this.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), count: 1, spread: 0.4, up: 2, life: [0.3, 0.6], size: [0.2, 0.5], color: ['#ff8a2a', '#ffcc33'], sprite: 'dot' });
    } else this.lavaWarned = false;
    if (this.pos.y < ground - 3 && !this.swimming) { this.pos.y = ground; this.vel.y = 0; }

    const hs = this.dashing ? 12 : Math.hypot(this.vel.x, this.vel.z);

    // ---- sword attack timing
    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      if (!a.didHit && a.t >= a.hit) { a.didHit = true; g.combat.playerSwing(this, a.combo, { kick: !!a.kick }); }
      if (a.t >= a.dur) {
        this.attack = null; this.lastAttackEnd = this.time;
        if (this.queued) { this.queued = false; this.startAttack(); }
      }
    } else if (this.time - this.lastAttackEnd > 0.55) this.attackChain = false;
    if (this.cast) {
      const c = this.cast;
      c.t += dt;
      if (!c.done && c.t >= c.release) { c.done = true; g.powers.release(this, c.power, c.move); }
      if (c.t >= c.dur) this.cast = null;
    }

    // ---- suit aura + its specials
    if (this.suit) this.updateSuit(dt);

    // ---- footsteps
    if (this.onGround && hs > 1 && !this.flying && !this.dashing) {
      this.stepDist += hs * dt;
      if (this.stepDist > 2.3) {
        this.stepDist = 0;
        const biome = g.worldBiome;
        let surf = 'grass';
        if (L && L.type === 'water' && this.pos.y < L.level) surf = 'water';
        else if (this.onIce || (biome && /snow|ice/.test(biome.terrain))) surf = 'snow';
        else if (biome && /sand|dune|beach/.test(biome.terrain)) surf = 'sand';
        else if (biome && /rock|volcan|ash|canyon/.test(biome.terrain)) surf = 'stone';
        g.audio.play('footstep', { surface: surf, volume: 0.45, pitch: 0.9 + Math.random() * 0.2 });
      }
    }

    // ---- rig pose
    const rig = this.rig;
    let pose = 'idle';
    if (this.dead) pose = 'dead';
    else if (this.sleeping) pose = 'sleep';
    else if (this.flying && !this.onGround) pose = 'fly';
    else if (this.swimming) pose = 'swim';
    else if (!this.onGround && this.airTime > 0.08) pose = this.vel.y > 0 ? 'jump' : 'fall';
    else if (this.buildPose > 0) pose = 'build';
    else if (hs > 0.6) pose = hs > WALK * this.speedMul * 1.2 ? 'run' : 'walk';
    this.buildPose = Math.max(0, this.buildPose - dt);
    if (pose !== this.lastPose) { rig.setPose(pose); this.lastPose = pose; }
    rig.setMoveSpeed(hs);
    rig.update(dt * (this.attack ? this.attack.as : 1));
    this.syncRig();
  }

  // suits: an aura that follows the hero and its special effect
  updateSuit(dt) {
    const g = this.game, s = this.suit;
    s.t += dt;
    if (s.t >= s.dur || this.dead) {
      this.suit = null;
      g.fx.sparkles(this.pos.clone().setY(this.pos.y + 1), '#ffffff', 16, 2);
      g.hud.toastFor(this, 'Your suit wore off.', 'info', 1.5);
      return;
    }
    // aura particles
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2, r = 0.55;
      g.fx.burst({ pos: new THREE.Vector3(this.pos.x + Math.cos(a) * r, this.pos.y + Math.random() * this.height, this.pos.z + Math.sin(a) * r), count: 1,
        vel: new THREE.Vector3(0, s.kind === 'shadow' ? 0.3 : 0.9, 0), velSpread: 0.2, life: [0.4, 0.7], size: [0.12, 0.28], color: [s.color, '#ffffff'],
        sprite: s.kind === 'storm' || s.kind === 'light' || s.kind === 'holy' ? 'spark' : 'dot', blend: s.kind === 'shadow' || s.kind === 'stone' || s.kind === 'bark' ? 'normal' : undefined, alpha: 0.8 });
    }
    s.tick = (s.tick || 0) + dt;
    if (s.tick >= 1) {
      s.tick = 0;
      if (s.kind === 'storm') {     // zap an enemy near you
        const e = g.enemies.nearest(this.pos, 5);
        if (e) { g.powers.bolt([this.pos.clone().setY(this.pos.y + 1.2), new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z)], '#d8d0ff', 0.06, 0.2); g.enemies.hit(e, s.dmg, { power: 'lightning', by: this, color: '#d8d0ff' }); g.audio.play('zap', { volume: 0.4 }); }
      }
      if (s.kind === 'light') {     // burn enemies near you
        g.powers.inRadius(this.pos, 4.5).forEach((e) => g.enemies.hit(e, s.dmg, { power: 'light', by: this, color: '#fff3b0' }));
      }
    }
    if (s.kind === 'shadow') this.fadeT = Math.max(this.fadeT, 0.4);
  }

  // XP + levels (shared by both players)
  addXp(n) {
    const s = this.state;
    s.xp += n;
    let leveled = false;
    while (s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level++;
      leveled = true;
    }
    if (leveled) {
      this.game.players.forEach((p) => { p.hp = p.maxHp; p.mana = p.maxMana; });
      this.game.onLevelUp();
    }
  }
}
