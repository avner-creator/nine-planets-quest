// Friendly people: the merchant at each trading post and villagers wandering at Home Base.
import * as THREE from 'three';
import { createNPC } from './modules.js';
import { rand, angleDamp, yawTo, pick } from './util.js';

export class NPCs {
  constructor(game) { this.game = game; this.list = []; }
  clear() {
    this.list.forEach((n) => { this.game.scene.remove(n.rig.root); n.rig.dispose(); });
    this.list.length = 0;
    this.merchant = null;
  }
  onWorldLoaded() {
    this.clear();
    const g = this.game, L = g.world.landmarks, q = g.settings.quality;
    if (L.shop && L.shop.merchant) {
      const rig = createNPC('merchant', { outfit: '#7a4a2a', seed: 11, quality: q });
      const pos = L.shop.merchant.clone(); pos.y = g.world.heightAt(pos.x, pos.z);
      this.merchant = this.add(rig, pos, L.shop.merchantYaw || 0, 'merchant');
    }
    // (v2: no friendly villagers walking around any more - merchant and bandits stay)
    if (this.spawnVillagers && L.villagers && L.villagers.length) {
      const n = Math.min(5, L.villagers.length + 1);
      for (let i = 0; i < n; i++) {
        const rig = createNPC('villager', { outfit: ['#4a6a9a', '#9a5a4a', '#5a8a4a', '#8a7a4a', '#7a4a8a'][i % 5], seed: 100 + i * 17, quality: q });
        const p = L.villagers[i % L.villagers.length].clone();
        p.x += rand(-2, 2); p.z += rand(-2, 2); p.y = g.world.heightAt(p.x, p.z);
        const v = this.add(rig, p, rand(0, 6.28), 'villager');
        v.target = p.clone(); v.wait = rand(1, 5);
      }
    }
  }
  add(rig, pos, yaw, kind) {
    rig.root.position.copy(pos);
    rig.root.rotation.y = yaw;
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    rig.setPose('idle');
    this.game.scene.add(rig.root);
    const n = { rig, pos: pos.clone(), yaw, homeYaw: yaw, kind, pose: 'idle' };
    this.list.push(n);
    return n;
  }
  update(dt) {
    const g = this.game, p = g.player, w = g.world;
    if (!w) return;
    const pts = w.landmarks.villagers || [];
    for (const n of this.list) {
      const d = p ? Math.hypot(p.pos.x - n.pos.x, p.pos.z - n.pos.z) : 999;
      let moving = false;
      if (n.kind === 'merchant') {
        const want = d < 9 ? yawTo(n.pos.x, n.pos.z, p.pos.x, p.pos.z) : n.homeYaw;
        n.yaw = angleDamp(n.yaw, want, 4, dt);
      } else {
        if (n.wait > 0) { n.wait -= dt; if (d < 4) n.yaw = angleDamp(n.yaw, yawTo(n.pos.x, n.pos.z, p.pos.x, p.pos.z), 3, dt); }
        else {
          const tx = n.target.x - n.pos.x, tz = n.target.z - n.pos.z, td = Math.hypot(tx, tz);
          if (td < 0.8) {
            n.wait = rand(2, 7);
            const b = pts.length ? pick(pts) : n.pos;
            n.target.set(b.x + rand(-6, 6), 0, b.z + rand(-6, 6));
          } else {
            const sp = 1.4;
            n.pos.x += tx / td * sp * dt; n.pos.z += tz / td * sp * dt;
            if (g.colliders) g.colliders.resolve(n.pos, 0.35);
            n.yaw = angleDamp(n.yaw, Math.atan2(tx, tz), 5, dt);
            moving = true;
            if (w.liquid && w.heightAt(n.pos.x, n.pos.z) < w.liquid.level) { n.wait = 1; n.target.copy(pts[0] || n.pos); }
          }
        }
        n.pos.y = w.heightAt(n.pos.x, n.pos.z);
      }
      const pose = moving ? 'walk' : 'idle';
      if (pose !== n.pose) { n.pose = pose; n.rig.setPose(pose); }
      n.rig.setMoveSpeed(moving ? 1.4 : 0);
      if (d < 120) n.rig.update(dt);
      n.rig.root.visible = d < 150;
      n.rig.root.position.copy(n.pos);
      n.rig.root.rotation.y = n.yaw;
    }
  }
}
