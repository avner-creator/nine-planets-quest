// Third-person / first-person camera that is easy to steer: mouse (pointer lock) or arrow keys,
// mouse-wheel zoom, never under the ground, pulls in when terrain is in the way.
import * as THREE from 'three';
import { clamp, damp, lerp } from './util.js';

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;      // camera looks along (sin yaw, cos yaw)
    this.pitch = -0.25;      // negative = looking down
    this.dist = 5.5;
    this.wantDist = 5.5;
    this.curDist = 5.5;
    this.firstPerson = false;
    this.shakeAmt = 0;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    this.fovKick = 0;
    this.orbit = null;       // cinematic orbit { center, radius, height, speed, angle }
    this._dir = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.initialized = false;
  }
  // first person is really used (not while a cinematic orbits, or while the hero sleeps / is knocked out)
  get fp() { return this.firstPerson && !this.orbit && !this.fpSuspend; }
  get forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  aimDir(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
  }
  rotate(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.35, 1.2);
  }
  // wheel: zooming in past the closest view goes into first person, zooming out comes back
  zoom(steps) {
    if (this.firstPerson) { if (steps > 0) { this.firstPerson = false; this.wantDist = 2.2; } return; }
    if (steps < 0 && this.wantDist <= 2.2 + 1e-6) { this.firstPerson = true; return; }
    this.wantDist = clamp(this.wantDist + steps * 0.8, 2.2, 14);
  }
  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }
  snapBehind(yaw) { this.yaw = yaw; this.pitch = -0.22; this.initialized = false; }

  // world: for terrain checks; extraGround(x,z,y) for blocks
  update(dt, playerPos, playerHeight, world, groundFn) {
    const cam = this.camera;
    if (this.orbit) {
      const o = this.orbit;
      o.angle += dt * o.speed;
      const p = this._p.set(o.center.x + Math.sin(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.cos(o.angle) * o.radius);
      if (world) p.y = Math.max(p.y, world.heightAt(p.x, p.z) + 3);
      cam.position.copy(p);
      // side > 0 puts the subject on the right half of the screen
      const side = o.side || 0;
      const rx = -Math.cos(o.angle + Math.PI), rz = Math.sin(o.angle + Math.PI);
      cam.lookAt(o.center.x - rx * side, o.center.y + (o.lookY || 0), o.center.z - rz * side);
      return;
    }
    const eye = playerHeight * 0.9;
    this.target.set(playerPos.x, playerPos.y + eye, playerPos.z);
    if (!this.initialized) { this.smoothTarget.copy(this.target); this.curDist = this.wantDist; this.initialized = true; }
    // smooth vertical target (stairs/bumps), quick horizontal
    this.smoothTarget.x = damp(this.smoothTarget.x, this.target.x, 30, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, this.target.z, 30, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, this.target.y, 14, dt);
    const dir = this.aimDir(this._dir);
    if (this.fp) {
      // eyes: a little in front of the head so the view never sees the inside of the hero
      cam.position.set(playerPos.x + Math.sin(this.yaw) * 0.12, this.smoothTarget.y + playerHeight * 0.03, playerPos.z + Math.cos(this.yaw) * 0.12);
      if (world && world.liquid && world.liquid.type !== 'ice' && Math.abs(cam.position.y - world.liquid.level) < 0.2) cam.position.y = world.liquid.level + 0.2;
      this.curDist = this.wantDist;
      this.lookAt.copy(cam.position).add(dir);
      cam.lookAt(this.lookAt);
    } else {
      // over-the-shoulder offset to the right
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      const sh = 0.55 * clamp(this.wantDist / 5.5, 0.4, 1.2);
      const base = this._p.set(this.smoothTarget.x + rx * sh, this.smoothTarget.y + 0.25, this.smoothTarget.z + rz * sh);
      // pull in when terrain is in the way
      let d = this.wantDist;
      if (world) {
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * this.wantDist;
          const x = base.x - dir.x * t, y = base.y - dir.y * t, z = base.z - dir.z * t;
          const g = (groundFn ? groundFn(x, z, y) : world.heightAt(x, z)) + 0.45;
          if (y < g) { d = Math.max(1.0, t - this.wantDist / steps); break; }
        }
      }
      // snap in fast, ease out slowly
      this.curDist = d < this.curDist ? damp(this.curDist, d, 25, dt) : damp(this.curDist, d, 3, dt);
      cam.position.set(base.x - dir.x * this.curDist, base.y - dir.y * this.curDist, base.z - dir.z * this.curDist);
      if (world) {
        const g = (groundFn ? groundFn(cam.position.x, cam.position.z, cam.position.y) : world.heightAt(cam.position.x, cam.position.z)) + 0.4;
        if (cam.position.y < g) cam.position.y = g;
        if (world.liquid && world.liquid.type !== 'ice' && Math.abs(cam.position.y - world.liquid.level) < 0.25) cam.position.y = world.liquid.level + 0.25;
      }
      this.lookAt.copy(base).addScaledVector(dir, 10);
      cam.lookAt(this.lookAt);
    }
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; cam.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3.5);
    }
    const fov = 65 + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 6, dt); cam.updateProjectionMatrix(); }
  }
}
