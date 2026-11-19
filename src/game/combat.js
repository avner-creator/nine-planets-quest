// Sword hits: finds targets in front of a player and deals damage.
import * as THREE from 'three';
import { rand } from './util.js';

const COMBO_MUL = [1, 1.15, 1.65];
const COMBO_KNOCK = [3.5, 4.5, 8];

export class Combat {
  constructor(game) { this.game = game; this._v = new THREE.Vector3(); }

  swordDamage(p = this.game.player) {
    return p.sword.damage * p.strength * (p.suit && p.suit.kind === 'stone' ? 1.5 : 1);
  }

  playerSwing(p, combo) {
    const g = this.game;
    const range = 2.6 + (combo === 2 ? 0.6 : 0);
    const cosArc = Math.cos(combo === 2 ? 1.25 : 1.05);
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let hits = 0;
    for (const e of g.enemies.targets()) {
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      if (Math.abs(e.pos.y - p.pos.y) > 2.5 + (e.height || 2) * 0.6) continue;
      const dot = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
      if (dot < cosArc && dist > e.radius + 0.9) continue;
      let dmg = this.swordDamage(p) * COMBO_MUL[combo] * rand(0.9, 1.1);
      let crit = Math.random() < 0.12;
      let label = null;
      if (crit) dmg *= 1.8;
      if (p.stat('stealth', 0) && !e.noticed && !e.isBoss) { dmg *= 2; label = 'Sneak!'; crit = true; }
      // Shadow Suit: double damage from behind
      if (p.suit && p.suit.kind === 'shadow' && dist > 0.01) {
        const efx = Math.sin(e.yaw || 0), efz = Math.cos(e.yaw || 0);
        if ((-dx * efx - dz * efz) / dist < 0) { dmg *= 2; label = 'Backstab!'; crit = true; }
      }
      g.enemies.hit(e, dmg, { source: 'sword', crit, label, knock: COMBO_KNOCK[combo], from: p.pos, by: p });
      hits++;
      const hp = this._v.set(e.pos.x - fx * e.radius * 0.5, e.pos.y + (e.hitHeight || e.height || 1.5) * 0.55, e.pos.z - fz * e.radius * 0.5);
      g.fx.hitSparks(hp, p.sword.emissive || '#ffe9a8', crit || combo === 2);
      if (crit || combo === 2) g.fx.flash(hp, '#ffe0a0', 6, 6, 0.15);
    }
    if (hits) {
      g.hitStop(combo === 2 ? 0.085 : 0.05);
      p.cam.shake(combo === 2 ? 0.28 : 0.13);
      g.audio.play(combo === 2 ? 'crit' : 'hit', { pitch: 0.9 + Math.random() * 0.2 });
    }
    return hits;
  }
}
