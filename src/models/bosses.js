// bosses.js - the 9 dimension bosses. createBoss(bossDef, { quality }) -> BossRig (see CONTRACTS.md)
// Humanoid bosses (treant, golem, giant, colossus, king, reaper) share the human skeleton & animation;
// serpent, drake and sphinx have their own skeletons.
import * as THREE from 'three';
import {
  Builder, atlasMaterial, instantiate, jointMap, Animator, applyLook,
  limb, lathe, blob, rbox, tube, param, sphere, torus, cone, cylinder, twoSided, toFlat, bumpy, deform, loft,
  col, shade, mixc, rng, hashStr, clamp, lerp, smooth, sstep, TAU, fbm3, lum, hslOf, deepen,
} from './rigkit.js';
import { addSkeleton } from './enemies.js';
import { humanDims, humanBones, addBody, addArmor } from './human.js';
import { HumanRig, poseKit, humanPoses } from './humanAnim.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const TPL = new Map();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function matDir(pos, dir, scl = 1) {
  _q.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
  if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  return new THREE.Matrix4().compose(_p.set(pos.x, pos.y, pos.z), _q, _s);
}
const seg = (a, b, r0, r1, n = 8, caps = true) => tube([a, a.clone().lerp(b, 0.5), b], (t) => lerp(r0, r1, t), n, { caps });
const none = () => {};

// ------------------------------------------------------------------ shared boss behaviour
class BossCommon {
  _initCommon(o) {
    this.moves = Object.keys(o.moveDefs);
    this.moveDefs = o.moveDefs;
    this.enraged = false; this.frozen = false; this.tint = null; this.flash = 0;
  }
  setEnraged(b) { this.enraged = !!b; this._anim().speed = b ? 1.3 : 1; this._look(); }
  setFrozen(b) { this.frozen = !!b; this._look(); }
  setTint(hex) { this.tint = hex || null; this._look(); }
  _look() { applyLook(this._mats(), { frozen: this.frozen, tint: this.tint, flash: this.flash, glow: this.enraged ? 1.9 : 1, rim: this.baseRim }); }
  play(move) {
    const mk = this.moveDefs[move] || this.moveDefs[this.moves[0]];
    const a = mk();
    if (!this._dead()) this._anim().play({ ...a, layer: 'action' });
    const sp = this._anim().speed;
    return { duration: a.dur / sp, hitTime: a.hit / sp };
  }
}

// Boss on a custom skeleton
class CustomBoss extends BossCommon {
  constructor(tpl, o) {
    super();
    this.root = new THREE.Object3D(); this.root.name = 'boss';
    this.inner = new THREE.Object3D(); this.inner.scale.setScalar(o.k); this.root.add(this.inner);
    this.mats = { main: atlasMaterial() };
    if (tpl.geos.glass) this.mats.glass = atlasMaterial({ transparent: true, opacity: o.glassOpacity ?? 0.7, depthWrite: false });
    const inst = instantiate(tpl, this.mats, { sphereScale: 1.6 });
    if (inst.meshes.glass) { inst.meshes.glass.castShadow = false; inst.meshes.glass.renderOrder = 2; }
    this.inst = inst; this.inner.add(inst.holder);
    this.J = jointMap(tpl);
    this.anim = new Animator(inst.bones, tpl.bones.map((b) => b.local));
    this.anim.poses = o.poses(this.J);
    this.ctx = { speed: 0, phase: 0, t: 0, pose: 'idle', k: o.k };
    this.height = o.height * o.k; this.radius = o.radius * o.k; this.hitHeight = o.hitHeight * o.k;
    this.mouth = new THREE.Object3D(); this.mouth.name = 'mouth';
    this.mouth.position.copy(o.mouthPos);
    inst.bone[o.mouthBone].add(this.mouth);
    this.hurtBone = this.J[o.hurtBone || 'body'];
    this.stride = o.stride || 3;
    this._initCommon({ moveDefs: o.moveDefs(this.J) });
    this.anim.setPose('idle'); this.anim.update(0, this.ctx);
  }
  _anim() { return this.anim; }
  _mats() { return Object.values(this.mats); }
  _dead() { return this.ctx.pose === 'dead'; }
  setPose(name) {
    if (name === 'walk' || name === 'run') name = 'move';
    if (!this.anim.poses[name] || name === this.ctx.pose) return;
    this.anim.setPose(name, name === 'dead' ? 0.15 : 0.35);
    if (name === 'dead') this.anim.clearActions();
    this.ctx.pose = name;
  }
  setMoveSpeed(mps) { this.ctx.speed = Math.max(0, mps || 0); }
  hurt() {
    if (this._dead()) return;
    const b = this.hurtBone;
    this.anim.play({ dur: 0.35, layer: 'hurt', weight: 0.6, fadeIn: 0.03, fadeOut: 0.2, keys: [[0, none], [0.08, (P) => { P.r(b, -0.08, 0, 0.04); }, 'o'], [0.35, none]] });
    this.flash = 1; this._look();
  }
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 4); this._look(); }
    if (this.frozen) return;
    const c = this.ctx;
    c.t += dt * this.anim.speed;
    c.phase += dt * this.anim.speed * TAU * Math.max(c.speed, 1.5) / (this.stride * c.k);
    this.anim.update(dt, c);
  }
  dispose() { this.root.removeFromParent(); this.inst.skeleton.dispose(); for (const m of Object.values(this.mats)) m.dispose(); }
}

// Boss on the human skeleton (re-uses HumanRig poses, cape etc.)
class HumanBoss extends BossCommon {
  constructor(T, o) {
    super();
    const glass = T.tpl.geos.glass ? atlasMaterial({ transparent: true, opacity: o.glassOpacity ?? 0.75, depthWrite: false }) : null;
    const rig = new HumanRig({ tpl: T.tpl, D: T.D, material: atlasMaterial() });
    if (glass) { rig.inst.meshes.glass.material = glass; rig.inst.meshes.glass.castShadow = false; rig.inst.meshes.glass.renderOrder = 2; }
    this.extra = glass ? [glass] : [];
    for (const m of Object.values(rig.inst.meshes)) m.boundingSphere.radius *= 1.3;
    this.rig = rig; this.k = o.k;
    this.root = rig.root; this.root.name = 'boss';
    const inner = new THREE.Object3D(); inner.scale.setScalar(o.k);
    rig.root.remove(rig.inst.holder); inner.add(rig.inst.holder); rig.root.add(inner);
    this.J = rig.J; this.K = poseKit(this.J, T.D);
    if (o.poses) rig.anim.poses = o.poses(rig.anim.poses, this.J, this.K, T.D);
    this.height = o.height * o.k; this.radius = o.radius * o.k; this.hitHeight = o.hitHeight * o.k;
    this.mouth = new THREE.Object3D(); this.mouth.name = 'mouth';
    this.mouth.position.copy(o.mouthPos);
    rig.inst.bone[o.mouthBone || 'head'].add(this.mouth);
    this.runAbove = o.runAbove ?? 99;
    if (o.prop) o.prop(rig, this);
    this._initCommon({ moveDefs: o.moveDefs(this.J, this.K, T.D) });
    this.pose = 'idle';
  }
  _anim() { return this.rig.anim; }
  _mats() { return [this.rig.material, ...this.extra]; }
  _dead() { return this.pose === 'dead'; }
  setPose(name) {
    this.pose = name;
    if (name === 'move') name = this.rig.ctx.speed * this.k > this.runAbove ? 'run' : 'walk';
    this.rig.setPose(name);
  }
  setMoveSpeed(mps) { this.rig.setMoveSpeed((mps || 0) / this.k); if (this.pose === 'move') this.setPose('move'); }
  hurt() { if (this._dead()) return; this.rig.hurt(); this.flash = 0; }
  update(dt) {
    if (this.frozen) return;
    this.rig.update(dt);
    if (this.rig._flash > 0 || this.tint || this.enraged || this.baseRim) applyLook(this._mats(), { frozen: false, tint: this.tint, flash: this.rig._flash, glow: this.enraged ? 1.9 : 1, rim: this.baseRim });
  }
  dispose() { this.rig.dispose(); for (const m of this.extra) m.dispose(); }
}

// ------------------------------------------------------------------ humanoid boss move library (poseKit based)
function humanMoves(J, K, D, which) {
  const s = D.s;
  const all = {
    slam: () => ({ dur: 1.5, hit: 0.85, keys: [[0, none],
      [0.6, (P) => { K.torso(P, -0.3, -0.2); K.look(P, -0.25); K.arm(P, 'R', -2.8, 0.2, 0.15, -1.0, 0, 0.6); K.arm(P, 'L', -2.6, 0.4, 0.1, -1.1, 0.3, 0.3); P.off(J.hips, 0, 0.03 * s, 0); }, 'o'],
      [0.85, (P) => { K.torso(P, 0.7, 0.05); K.look(P, 0.15); K.arm(P, 'R', -0.6, 0.15, 0.15, -0.15, 0, 1.0); K.arm(P, 'L', -0.55, 0.4, 0.1, -0.3, 0.3, 0.3); K.stance(P, 1); P.addOff(J.hips, 0, -0.12 * s, 0.04 * s); }, 'i'],
      [1.15, (P) => { K.torso(P, 0.65, 0.05); K.arm(P, 'R', -0.55, 0.15, 0.15, -0.2, 0, 1.0); K.arm(P, 'L', -0.5, 0.4, 0.1, -0.3, 0.3, 0.3); K.stance(P, 1); P.addOff(J.hips, 0, -0.12 * s, 0.04 * s); }],
      [1.5, none]], fadeOut: 0.3 }),
    sweep: () => ({ dur: 1.4, hit: 0.75, keys: [[0, none],
      [0.5, (P) => { K.torso(P, 0, -0.9, 0.05); K.look(P, 0, 0.5); K.arm(P, 'R', -1.3, 1.3, 0.3, -0.9, 0.4, 0.2); K.arm(P, 'L', -0.6, -0.5, 0.3, -0.9, 0.3, 0); K.stance(P, 0.7); }, 'o'],
      [0.75, (P) => { K.torso(P, 0.1, 0.1); K.arm(P, 'R', -1.45, 0.1, 0.15, -0.2, 0.2, 1.0); K.arm(P, 'L', -0.3, 0, 0.4, -0.7, 0.3, 0); K.stance(P, 1); }, 'i'],
      [0.95, (P) => { K.torso(P, 0.12, 0.9, -0.05); K.look(P, 0, -0.3); K.arm(P, 'R', -1.3, -1.1, 0.25, -0.5, 0.1, 1.0); K.arm(P, 'L', 0.2, 0.2, 0.5, -0.6, 0.3, 0); K.stance(P, 1); }, 'o'],
      [1.4, none]], fadeOut: 0.3 }),
    stomp: () => ({ dur: 1.3, hit: 0.72, keys: [[0, none],
      [0.5, (P) => { K.torso(P, -0.15, 0, 0.12); K.arm(P, 'L', -0.6, 0, 0.9, -0.5, 0.3, 0); K.arm(P, 'R', -0.6, 0, 0.9, -0.5, 0.3, 0.4); K.leg(P, 'L', -1.4, 0.15, 1.4, 0.2); K.leg(P, 'R', 0.05, 0.08, 0.15, -0.2); P.off(J.hips, -0.05 * s, 0.02 * s, 0); }, 'o'],
      [0.72, (P) => { K.torso(P, 0.35, 0, -0.05); K.arm(P, 'L', -0.3, 0, 0.6, -0.4, 0.3, 0); K.arm(P, 'R', -0.3, 0, 0.6, -0.4, 0.3, 0.4); K.leg(P, 'L', -0.6, 0.12, 0.7, -0.1); K.leg(P, 'R', 0.15, 0.1, 0.5, -0.65); P.off(J.hips, 0, -0.14 * s, 0.05 * s); }, 'i'],
      [0.95, (P) => { K.torso(P, 0.3, 0, 0); K.leg(P, 'L', -0.55, 0.12, 0.65, -0.1); K.leg(P, 'R', 0.15, 0.1, 0.5, -0.65); P.off(J.hips, 0, -0.13 * s, 0.05 * s); }],
      [1.3, none]], fadeOut: 0.3 }),
    roar: () => ({ dur: 1.8, hit: 0.6, keys: [[0, none],
      [0.35, (P) => { K.torso(P, 0.35, 0); K.look(P, 0.3); K.arm(P, 'L', -0.4, 0, 0.3, -1.2, 0.5, 0); K.arm(P, 'R', -0.4, 0, 0.3, -1.2, 0.5, 0.4); P.off(J.hips, 0, -0.06 * s, 0); }, 'o'],
      [0.6, (P) => { K.torso(P, -0.35, 0); K.look(P, -0.6); K.arm(P, 'L', -0.9, 0.3, 1.2, -0.6, 0.6, 0); K.arm(P, 'R', -0.9, 0.3, 1.2, -0.6, 0.6, 0.4); }, 'i'],
      [1.4, (P) => { K.torso(P, -0.3, 0.05); K.look(P, -0.55); K.arm(P, 'L', -0.95, 0.3, 1.25, -0.5, 0.6, 0); K.arm(P, 'R', -0.95, 0.3, 1.25, -0.5, 0.6, 0.4); }],
      [1.8, none]], fadeOut: 0.35 }),
    summon: () => ({ dur: 1.6, hit: 0.9, keys: [[0, none],
      [0.5, (P) => { K.torso(P, 0.25, 0); K.look(P, 0.2); K.arm(P, 'L', -0.5, -0.6, 0.2, -1.6, 0.6, 0); K.arm(P, 'R', -0.5, -0.6, 0.2, -1.6, 0.4, 0.4); P.off(J.hips, 0, -0.05 * s, 0); }, 'o'],
      [0.9, (P) => { K.torso(P, -0.25, 0); K.look(P, -0.5); K.arm(P, 'L', -2.6, 0.4, 0.4, -0.2, 0.8, -0.3); K.arm(P, 'R', -2.6, 0.4, 0.4, -0.2, 0.3, 0.6); }, 'i'],
      [1.3, (P) => { K.torso(P, -0.22, 0); K.look(P, -0.45); K.arm(P, 'L', -2.65, 0.4, 0.45, -0.2, 0.8, -0.3); K.arm(P, 'R', -2.65, 0.4, 0.45, -0.2, 0.3, 0.6); }],
      [1.6, none]], fadeOut: 0.3 }),
    volley: () => ({ dur: 1.2, hit: 0.55, keys: [[0, none],
      [0.35, (P) => { K.torso(P, -0.05, 0.55); K.look(P, 0, -0.4); K.arm(P, 'L', 0.5, 0.2, 0.55, -1.7, 0.4, -0.2); K.stance(P, 0.6); }, 'o'],
      [0.55, (P) => { K.torso(P, 0.15, -0.45); K.look(P, 0, 0.3); K.arm(P, 'L', -1.55, -0.2, 0.15, -0.05, 1.2, -0.4); K.stance(P, 1); }, 'i'],
      [0.8, (P) => { K.torso(P, 0.15, -0.45); K.arm(P, 'L', -1.45, -0.3, 0.15, -0.15, 1.2, -0.3); K.stance(P, 1); }],
      [1.2, none]], fadeOut: 0.3 }),
    beam: () => ({ dur: 2.0, hit: 0.6, keys: [[0, none],
      [0.4, (P) => { K.torso(P, -0.2, 0); K.look(P, -0.2); K.arm(P, 'L', -0.7, -0.7, 0.2, -1.9, 0.5, 0); K.arm(P, 'R', -0.7, -0.7, 0.2, -1.8, 0.2, 0.6); }, 'o'],
      [0.6, (P) => { K.torso(P, 0.12, 0); K.look(P, 0.05); K.arm(P, 'L', -1.55, -0.3, 0.05, -0.05, 1.3, -0.6); K.arm(P, 'R', -1.5, -0.3, 0.05, -0.1, 0.2, 0.9); K.stance(P, 0.8); }, 'i'],
      [1.7, (P) => { K.torso(P, 0.14, 0); K.look(P, 0.05); K.arm(P, 'L', -1.55, -0.28, 0.05, -0.05, 1.3, -0.6); K.arm(P, 'R', -1.5, -0.28, 0.05, -0.1, 0.2, 0.9); K.stance(P, 0.8); }],
      [2.0, none]], fadeOut: 0.3 }),
    charge: () => ({ dur: 1.3, hit: 0.7, keys: [[0, none],
      [0.45, (P) => { K.torso(P, 0.45, -0.3); K.look(P, -0.3); K.arm(P, 'R', 0.6, 0.2, 0.3, -0.9, 0.2, 0.6); K.arm(P, 'L', 0.5, 0.2, 0.3, -0.9, 0.3, 0); K.crouch(P, 0.35, 0.2); }, 'o'],
      [0.7, (P) => { K.torso(P, 0.5, 0.2); K.look(P, -0.2); K.arm(P, 'R', -1.4, -0.2, 0.2, -0.2, 0.2, 1.1); K.arm(P, 'L', -1.2, 0.4, 0.2, -0.5, 0.3, 0); K.stance(P, 1); P.addOff(J.hips, 0, -0.05 * s, 0.35 * s); }, 'i'],
      [0.95, (P) => { K.torso(P, 0.45, 0.25); K.arm(P, 'R', -1.2, -0.5, 0.2, -0.3, 0.2, 1.1); K.stance(P, 1); P.addOff(J.hips, 0, -0.05 * s, 0.3 * s); }],
      [1.3, none]], fadeOut: 0.3 }),
  };
  const out = {};
  for (const w of which) out[w] = all[w];
  return out;
}
// slower, heavier walking for humanoid bosses
function heavyPoses(base, J, K, D, extra = {}) {
  return {
    ...base,
    idle(P, t, c) { base.idle(P, t * 0.75, c); if (extra.idle) extra.idle(P, t, c); },
    walk(P, t, c) { base.walk(P, t, c); P.r(J.spine, 0.06); P.r(J.chest, 0.03); if (extra.walk) extra.walk(P, t, c); },
    run(P, t, c) { base.walk(P, t, c); P.r(J.spine, 0.12); if (extra.walk) extra.walk(P, t, c); },
    dead: base.dead,
  };
}

// ------------------------------------------------------------------ TREANT
function treantT(def, q) {
  const D = humanDims(1.8, 'broad', { wide: 1.55, arm: 1.6, leg: 1.6 });
  D.ua *= 1.2; D.fa *= 1.3;
  const B = new Builder({ seed: 11, texScale: 0.8 });
  humanBones(B, D, {});
  const th = theme(def);
  const s = D.s, bark = col(def.color), glowC = col(def.accent);
  const ah = hslOf(glowC);
  const greenish = ah.h > 0.17 && ah.h < 0.45;
  const leaf = th.rock ? mixc(glowC, '#6a7a3a', 0.55) : greenish || th.shadow ? glowC : mixc(glowC, '#4a7a2a', 0.5);
  const dark = shade(bark, 0.55), moss = mixc(leaf, '#2a4a1a', 0.5), leafGlow = th.shadow ? 0.35 : 0;
  const tW = B.ladder('y', [['hips', 0.98], ['spine', 1.12], ['chest', 1.3]]);
  const NU = Math.round(26 * q), NV = Math.round(20 * q);
  // gnarled trunk body
  const trunk = param(NU, NV, (u, v, o) => {
    const a = -PI + u * TAU, y = lerp(1.95, 0.8, v);
    let r = 0.27 + 0.05 * sstep(1.2, 1.5, y) - 0.04 * sstep(1.6, 1.95, y) + 0.04 * sstep(1.0, 0.8, y);
    r *= 1 + 0.12 * Math.sin(a * 5 + y * 3) * 0.6 + 0.08 * fbm3(Math.sin(a) * 2, y * 2, Math.cos(a) * 2, 3);
    o.set(Math.sin(a) * r * 1.15, y, Math.cos(a) * r * 0.9);
  }, { lu: 2.0, lv: 1.3 });
  B.add(trunk, { cell: 'bark', color: bark, w: tW, colorFn: (p, n, cc) => cc.multiplyScalar(0.8 + 0.25 * Math.max(0, n.y) + 0.08 * Math.max(0, n.z)) });
  if (th.rock) { const Rr = rng(31); for (let i = 0; i < 8; i++) { const a = -2.2 + Rr() * 4.4, y = 1.0 + Rr() * 0.75; B.add(toFlat(bumpy(blob(0.09, 0.07, 0.07, 0.6, 0.6, 8, 6), 0.02, 9, i)), { pos: [Math.sin(a) * 0.33, y, Math.cos(a) * 0.27], cell: 'rock', color: mixc(bark, '#8a8070', 0.6), w: tW }); } }
  // face
  for (const sd of [-1, 1]) {
    B.add(sphere(0.07, 12, 10), { pos: [sd * 0.1, 1.56, 0.2], scl: [1.1, 0.8, 0.6], cell: 'gloss', color: '#0c0a06', rough: 0.9, bone: 'chest' });
    B.add(sphere(0.04, 10, 8), { pos: [sd * 0.1, 1.56, 0.235], cell: 'gloss', color: glowC, glow: 3, bone: 'chest' });
    B.add(toFlat(bumpy(blob(0.11, 0.04, 0.06, 1, 1, 10, 6), 0.012, 12, sd)), { pos: [sd * 0.1, 1.635, 0.24], rot: [0, 0, sd * -0.25], cell: 'bark', color: dark, bone: 'chest' });
  }
  B.add(toFlat(bumpy(blob(0.04, 0.09, 0.05, 1, 1, 8, 6), 0.01, 10, 3)), { pos: [0, 1.5, 0.27], cell: 'bark', color: bark, bone: 'chest' });
  B.add(sphere(0.1, 14, 10), { pos: [0, 1.36, 0.2], scl: [1.2, 0.65, 0.6], cell: 'gloss', color: '#0a0806', rough: 0.9, bone: 'chest' });
  for (let i = 0; i < 7; i++) B.add(blob(0.05, 0.08 + (i % 3) * 0.03, 0.04, 1, 1, 8, 6), { pos: [-0.12 + i * 0.04, 1.24 - (i % 2) * 0.04, 0.24], cell: 'fur', color: moss, bone: 'chest' });
  // crown of leaves on head bone
  const R = rng(17);
  const nLeaf = def.lite ? 9 : 16;
  for (let i = 0; i < nLeaf; i++) {
    const a = R() * TAU, rr = 0.15 + R() * 0.35, y = 1.95 + R() * 0.5 - rr * 0.4;
    const g = bumpy(blob((0.2 + R() * 0.12) * (def.lite ? 1.25 : 1), 0.16 + R() * 0.08, (0.2 + R() * 0.12) * (def.lite ? 1.25 : 1), 1, 1, def.lite ? 9 : 12, def.lite ? 7 : 9), 0.05, 6, i * 2.3);
    B.add(g, { pos: [Math.sin(a) * rr * 1.2, y, Math.cos(a) * rr * 0.9 - 0.08], cell: 'fur', color: mixc(leaf, '#1e3a10', R() * 0.5), rough: 0.8, glow: leafGlow, bone: 'head', colorFn: (p, n, cc) => cc.multiplyScalar(0.75 + 0.35 * Math.max(0, n.y)) });
  }
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; B.add(tube([V3(Math.sin(a) * 0.15, 1.85, Math.cos(a) * 0.1), V3(Math.sin(a) * 0.3, 2.1, Math.cos(a) * 0.22), V3(Math.sin(a) * 0.45, 2.25, Math.cos(a) * 0.3)], (t) => lerp(0.06, 0.02, t), 6), { cell: 'bark', color: bark, w: B.ladder('y', [['chest', 1.85], ['head', 2.0]]) }); }
  // glowing fungi
  for (let i = 0; i < 6; i++) { const a = -0.8 + R() * 1.6, y = 1.0 + R() * 0.5; B.add(sphere(0.025, 8, 6), { pos: [Math.sin(a) * 0.32, y, Math.cos(a) * 0.26], scl: [1.4, 0.5, 1.4], cell: 'gloss', color: glowC, glow: 1.6, w: tW }); }
  // arms = branches
  for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    const sh = B.bpos('uarm' + S), el = B.bpos('farm' + S), hd = B.bpos('hand' + S);
    B.add(bumpy(blob(0.15, 0.13, 0.14, 1, 1, 12, 9), 0.03, 7, sd), { pos: [sh.x, sh.y, sh.z], cell: 'bark', color: bark, bone: 'uarm' + S });
    B.add(bumpy(seg(sh, el, 0.11, 0.08, 10), 0.015, 8, sd * 3), { cell: 'bark', color: bark, bone: 'uarm' + S });
    B.add(bumpy(seg(el, hd, 0.085, 0.065, 10), 0.015, 8, sd * 5), { cell: 'bark', color: bark, bone: 'farm' + S });
    for (let f = 0; f < 4; f++) {
      const a = (f - 1.5) * 0.45;
      const p1 = hd.clone().add(V3(sd * 0.02, -0.1, Math.sin(a) * 0.06)), p2 = hd.clone().add(V3(sd * (0.03 + 0.02 * Math.cos(a * 2)), -0.28, Math.sin(a) * 0.14 + 0.05)), p3 = hd.clone().add(V3(-sd * 0.02, -0.4, Math.sin(a) * 0.18 + 0.1));
      B.add(tube([hd.clone(), p1, p2, p3], (t) => lerp(0.04, 0.008, t), 6), { cell: 'bark', color: shade(bark, 0.85), bone: 'hand' + S });
    }
    B.add(blob(0.12, 0.05, 0.1, 1, 1, 10, 6), { pos: [sh.x, sh.y + 0.11, sh.z], cell: 'fur', color: moss, bone: 'uarm' + S });
    // a few leaves on the arms
    for (let k = 0; k < 3; k++) B.add(bumpy(blob(0.1, 0.08, 0.1, 1, 1, 8, 6), 0.03, 8, k + sd), { pos: [el.x + sd * 0.05, el.y + 0.05 + k * 0.08, el.z - 0.05], cell: 'fur', color: leaf, bone: 'uarm' + S });
    // legs = roots
    const th = B.bpos('thigh' + S), kn = B.bpos('shin' + S), an = B.bpos('foot' + S);
    B.add(bumpy(seg(th, kn, 0.16, 0.12, 10), 0.02, 6, sd * 7), { cell: 'bark', color: bark, bone: 'thigh' + S });
    B.add(bumpy(seg(kn, an, 0.12, 0.13, 10), 0.02, 6, sd * 9), { cell: 'bark', color: bark, bone: 'shin' + S });
    for (let r = 0; r < 5; r++) {
      const a = (r / 5) * TAU + 0.3;
      B.add(tube([an.clone().add(V3(0, 0.02, 0)), an.clone().add(V3(Math.sin(a) * 0.15, -0.04, Math.cos(a) * 0.15 + 0.05)), V3(an.x + Math.sin(a) * 0.3, 0.02, an.z + Math.cos(a) * 0.3 + 0.08)], (t) => lerp(0.07, 0.015, t), 6), { cell: 'bark', color: shade(bark, 0.9), bone: 'foot' + S });
    }
  }
  return { tpl: B.build(), D };
}

// ------------------------------------------------------------------ theme from the def (temple guardians re-use the 9 shapes)
// Palette always comes from def.color / def.accent; a few name/title words add flavour details (crystals, coral, moss...).
function theme(def) {
  const t = ((def.name || '') + ' ' + (def.title || '')).toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  const c = col(def.color);
  return {
    ice: has('ice', 'frost', 'rime', 'glaci', 'snow'), fire: has('fire', 'flame', 'magma', 'cinder', 'pyr', 'infern', 'ember', 'lava'),
    storm: has('storm', 'thunder', 'spark', 'volt', 'ohm', 'zeraph', 'lightning'), shadow: has('shadow', 'void', 'night', 'gloom', 'umbr', 'noct'),
    bone: has('bone', 'skeleton', 'grim'), moss: has('moss', 'vine', 'forest', 'thorn', 'sylv', 'root'), coral: has('coral'),
    sea: has('sea ', 'tide', 'marin', 'aqua', 'ocean'), sun: has('sun', 'golden', 'light queen', 'solg', 'aurel'),
    rock: has('rock', 'stone', 'mountain', 'canyon', 'sand', 'boulder', 'terr'), ghost: has('ghost', 'wraith'), queen: has('queen'),
    light: lum(c) > 0.3,
  };
}

// ------------------------------------------------------------------ GOLEM (magma titan, moss/coral/ice/storm golems)
function magmaT(def, q) {
  const th = theme(def);
  const D = humanDims(1.8, 'broad', { wide: 1.6, arm: 1.7, leg: 1.6 });
  const B = new Builder({ seed: 21 + hashStr(def.name || '') % 97, texScale: 0.8 });
  humanBones(B, D, {});
  const c = col(def.color), lava = col(def.accent);
  const hc = hslOf(c);
  const icy = th.ice || (th.light && hc.h > 0.5 && hc.h < 0.66);
  const rockO = icy ? { cell: 'gloss', rough: 0.2, metal: 0.12 } : th.coral ? { cell: 'chitin', rough: 0.55 } : { cell: 'rock', rough: 0.85 };
  const edge = deepen(c, th.light ? 0.42 : 0.45);
  let sd0 = 1;
  const rock = (rx, ry, rz) => toFlat(bumpy(blob(rx, ry, rz, 0.6, 0.6, Math.round(18 * q) + 2, Math.round(13 * q) + 2), Math.min(rx, ry, rz) * 0.22, 3.5, sd0++ * 2.7, 2));
  const crackN = (p) => Math.abs(fbm3(p.x * 2.6 + 3.1, p.y * 2.6, p.z * 2.6 - 1.7, 2));
  const cw = th.fire || !th.light && lum(lava) > 0.1 && hslOf(lava).h < 0.12 ? 0.05 : 0.032; // thinner seams for cool / pale palettes
  const add = (g, o) => B.add(g, { ...rockO, color: c, colorFn: (p, n, cc) => { const k = crackN(p); return k < cw ? cc.copy(lava) : k < cw + 0.035 ? cc.copy(edge) : cc.multiplyScalar(0.85 + 0.2 * Math.max(0, n.y)); }, glowFn: (p) => (crackN(p) < cw ? 2.4 : 0), ...o });
  const P = (n) => B.bpos(n);
  add(rock(0.42, 0.3, 0.3), { pos: [0, 1.36, 0], bone: 'chest' });
  add(rock(0.3, 0.2, 0.24), { pos: [0, 1.1, 0.01], bone: 'spine' });
  add(rock(0.3, 0.17, 0.22), { pos: [0, 0.94, 0], bone: 'hips' });
  add(rock(0.13, 0.12, 0.13), { pos: [0, 1.66, 0.04], bone: 'head' });
  const hot = mixc(lava, '#ffffff', 0.35);
  B.add(sphere(0.12, 14, 10), { pos: [0, 1.36, 0.22], scl: [1, 1, 0.5], cell: 'gloss', color: hot, glow: 3, bone: 'chest' });
  B.add(torus(0.12, 0.02, 16, 4), { pos: [0, 1.36, 0.215], scl: [1, 1, 0.6], cell: rockO.cell, color: edge, bone: 'chest' });
  // spikes / horns: obsidian for fire, crystals for ice & storm, coral branches, mossy wood
  const crystal = icy || th.storm;
  const spikeC = crystal ? (icy ? mixc(lava, '#ffffff', 0.35) : lava) : deepen(c, 0.3);
  const spikeO = crystal ? { cell: 'gloss', color: spikeC, rough: 0.05, glow: icy ? 0.45 : 1.3 } : th.moss ? { cell: 'bark', color: '#4a3424' } : { cell: 'gloss', color: spikeC, rough: 0.15 };
  for (const sd of [-1, 1]) {
    B.add(sphere(0.026, 8, 6), { pos: [sd * 0.05, 1.68, 0.155], scl: [1.4, 0.6, 0.6], cell: 'gloss', color: mixc(lava, '#ffffff', 0.5), glow: 3.5, bone: 'head' });
    if (!th.coral) B.add(tube([V3(sd * 0.09, 1.72, 0.05), V3(sd * 0.18, 1.82, 0.0), V3(sd * 0.2, 1.95, -0.08)], (t) => lerp(0.04, 0.004, t), 6), { ...spikeO, bone: 'head' });
  }
  B.add(sphere(0.04, 10, 8), { pos: [0, 1.61, 0.15], scl: [1.6, 0.5, 0.6], cell: 'gloss', color: lava, glow: 3, bone: 'head' });
  const R = rng(5 + sd0);
  for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    const sh = P('uarm' + S);
    add(rock(0.22, 0.2, 0.22), { pos: [sh.x, sh.y + 0.04, 0], bone: 'uarm' + S });
    if (th.coral) {
      for (let k = 0; k < 4; k++) {
        const base = V3(sh.x + sd * (0.02 + R() * 0.12), sh.y + 0.15, -0.08 + R() * 0.16);
        const pts = [base]; for (let j = 1; j < 4; j++) pts.push(pts[j - 1].clone().add(V3(sd * 0.04 + (R() - 0.5) * 0.06, 0.08, (R() - 0.5) * 0.06)));
        B.add(tube(pts, (t) => lerp(0.03, 0.012, t), 5), { cell: 'chitin', color: mixc(c, '#ffffff', 0.35), bone: 'uarm' + S });
        B.add(sphere(0.02, 6, 4), { pos: pts[3].toArray(), cell: 'gloss', color: lava, glow: 2, bone: 'uarm' + S });
      }
    } else if (th.moss) {
      B.add(bumpy(blob(0.2, 0.07, 0.18, 1, 1, 10, 6), 0.03, 9, sd), { pos: [sh.x, sh.y + 0.2, 0], cell: 'fur', color: mixc(lava, '#2a4a1a', 0.45), bone: 'uarm' + S });
      for (let k = 0; k < 3; k++) B.add(blob(0.05, 0.02, 0.07, 1, 1, 6, 4), { pos: [sh.x + sd * (0.05 + k * 0.05), sh.y + 0.24, -0.06 + k * 0.06], rot: [0.4, k, sd * 0.5], cell: 'plain', color: lava, glow: 0.4, bone: 'uarm' + S });
    } else for (let k = 0; k < 3; k++) B.add(toFlat(cone(0.05, 0, 0.22 + k * 0.05, 5)), { m: matDir(V3(sh.x + sd * 0.05, sh.y + 0.15, -0.05 + k * 0.06), V3(sd * 0.5, 1, -0.2 + k * 0.1)), ...spikeO, bone: 'uarm' + S });
    add(rock(0.13, 0.18, 0.13), { pos: sh.clone().lerp(P('farm' + S), 0.55).toArray(), bone: 'uarm' + S });
    add(rock(0.15, 0.2, 0.15), { pos: P('farm' + S).lerp(P('hand' + S), 0.5).toArray(), bone: 'farm' + S });
    add(rock(0.17, 0.15, 0.17), { pos: P('hand' + S).add(V3(0, -0.1, 0.02)).toArray(), bone: 'hand' + S });
    add(rock(0.15, 0.22, 0.15), { pos: P('thigh' + S).lerp(P('shin' + S), 0.5).toArray(), bone: 'thigh' + S });
    add(rock(0.13, 0.2, 0.13), { pos: P('shin' + S).lerp(P('foot' + S), 0.5).toArray(), bone: 'shin' + S });
    add(rock(0.15, 0.08, 0.2), { pos: P('foot' + S).add(V3(0, -0.03, 0.06)).toArray(), bone: 'foot' + S });
  }
  if (th.moss) { // vines across the chest
    for (let k = 0; k < 2; k++) { const pts = []; for (let i = 0; i <= 8; i++) { const a = -1.6 + i * 0.4; pts.push(V3(Math.sin(a) * 0.44, 1.5 - i * 0.05 - k * 0.15, Math.cos(a) * 0.32 + 0.02)); } B.add(tube(pts, 0.016, 5), { cell: 'bark', color: '#3a5a22', bone: 'chest' }); }
  }
  if (th.storm) { // floating crackle bolts on the shoulders
    for (const sd of [-1, 1]) { const pts = []; for (let i = 0; i < 6; i++) pts.push(V3(sd * (0.25 + i * 0.05), 1.62 + (i % 2) * 0.06, -0.1 + i * 0.04)); B.add(tube(pts, 0.012, 4), { cell: 'gloss', color: mixc(lava, '#ffffff', 0.4), glow: 3, bone: 'chest' }); }
  }
  // extra glowing veins on the big rocks
  const crack = (cx, cy, cz, rx, ry, rz, n, w) => {
    for (let i = 0; i < n; i++) {
      const pts = [];
      let a = R() * TAU, y = (R() - 0.5) * 1.2;
      for (let k = 0; k < 4; k++) {
        a += (R() - 0.5) * 0.6; y += (R() - 0.5) * 0.5;
        const yy = clamp(y, -0.85, 0.85), r = Math.sqrt(1 - yy * yy);
        pts.push(V3(cx + Math.sin(a) * r * rx * 1.04, cy + yy * ry * 1.04, cz + Math.cos(a) * r * rz * 1.04));
      }
      B.add(tube(pts, 0.014, 4), { cell: 'gloss', color: lava, glow: 2.6, w });
    }
  };
  crack(0, 1.36, 0, 0.42, 0.3, 0.3, 8, () => [B.idx('chest'), 1]);
  crack(0, 0.94, 0, 0.3, 0.17, 0.22, 3, () => [B.idx('hips'), 1]);
  return { tpl: B.build(), D };
}

// ------------------------------------------------------------------ GIANT (frost giant, tide giant, mountain giant, skeleton giant)
function giantT(def, q) {
  const th = theme(def);
  const D = humanDims(1.8, 'broad', { wide: 1.2, arm: 1.3, leg: 1.25 });
  const B = new Builder({ seed: 31 + hashStr(def.name || '') % 97, texScale: 1.0 });
  humanBones(B, D, { cape: false });
  const c = col(def.color), acc = col(def.accent);
  const s = D.s, hc = V3(...D.hc);
  if (th.bone) {
    addSkeleton(B, D, c, acc, { helmet: false, shield: false });
    // fur loincloth & bracers so the big skeleton reads as a warrior
    const g = param(14, 4, (u, v, o) => { const a = -PI + u * TAU; o.set(Math.sin(a) * lerp(0.17, 0.2, v), lerp(1.0, 0.72, v) + (v > 0.5 ? Math.sin(a * 7) * 0.02 : 0), Math.cos(a) * lerp(0.12, 0.15, v)); }, { lu: 1, lv: 0.3 });
    for (const p of twoSided(g, 0.005)) B.add(p, { cell: 'fur', color: '#4a3a30', w: B.ladder('y', [['hips', 0.95]]) });
    for (const sd of [-1, 1]) B.add(tube([V3(sd * 0.08, hc.y + 0.06, hc.z - 0.01), V3(sd * 0.17, hc.y + 0.12, hc.z - 0.03), V3(sd * 0.2, hc.y + 0.24, hc.z - 0.08)], (t) => lerp(0.03, 0.004, t), 7), { cell: 'gloss', color: acc, glow: 1.2, bone: 'head' });
  } else {
    const L = {
      skin: def.color, hairStyle: 'long', hairLen: 1.25, beard: 'big', eyes: def.accent, eyeGlow: 1.4,
      hair: th.ice ? def.accent : hexOfC(th.light ? deepen(c, 0.6) : mixc(acc, '#e8e0d0', 0.5)),
      top: hexOfC(deepen(c, 0.55)), sleeves: 'none', bottom: hexOfC(shade(c, 0.4)),
      pelt: th.ice ? '#e8eef4' : th.sea ? hexOfC(mixc(c, '#1f5a4a', 0.6)) : '#8a6a4a',
      skirt: 0.62, flare: 0.3, skirtCell: 'fur', skirtColor: th.ice ? '#c8d0d8' : th.sea ? '#2f6a5a' : '#6a4a32', trim: hexOfC(deepen(acc, 0.6)),
      boots: th.ice ? '#d8e0e8' : hexOfC(shade(c, 0.45)), bootTop: 0.45, beltColor: '#3a2a20', buckle: hexOfC(acc), belly: 0.4, collar: hexOfC(deepen(acc, 0.6)), bust: 0.016,
    };
    addBody(B, D, L, q);
    addArmor(B, D, L, th.ice ? { id: 'diamond', color: hexOfC(mixc(acc, '#a8e4ff', 0.5)) } : th.sea ? { id: 'chain', color: '#6a9a9a' } : { id: 'iron', color: hexOfC(mixc(c, '#8a8a8a', 0.5)) }, q);
    // helmet: horned (ice / rock / default) or a crown of shells (sea)
    B.add(param(20, 6, (u, v, o) => { const lon = -PI + u * TAU, lat = PI / 2 - v * 1.35; o.set(Math.cos(lat) * Math.sin(lon) * 0.1, Math.sin(lat) * 0.12, Math.cos(lat) * Math.cos(lon) * 0.112).add(V3(hc.x, hc.y + 0.02, hc.z)); }, { lu: 0.5, lv: 0.2 }), { cell: 'plate', color: th.sea ? '#3a6a6a' : hexOfC(mixc(c, '#6a7a8a', 0.6)), metal: 1, rough: 0.35, bone: 'head' });
    if (th.sea) for (let i = 0; i < 7; i++) { const a = -1.4 + i * 0.47; B.add(cone(0.025, 0, 0.09 + (i === 3 ? 0.05 : 0), 5), { pos: [hc.x + Math.sin(a) * 0.1, hc.y + 0.1, hc.z + Math.cos(a) * 0.1], rot: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3], cell: 'chitin', color: mixc(acc, '#f0e0d0', 0.5), glow: 0.3, bone: 'head' }); }
    else for (const sd of [-1, 1]) B.add(tube([V3(sd * 0.09, hc.y + 0.05, hc.z), V3(sd * 0.18, hc.y + 0.1, hc.z), V3(sd * 0.22, hc.y + 0.2, hc.z - 0.02), V3(sd * 0.2, hc.y + 0.28, hc.z - 0.06)], (t) => lerp(0.035, 0.004, t), 8), { cell: 'bone', color: '#e8e0cc', bone: 'head' });
  }
  // weapon in the right hand (grip centre ~ (0.02, -0.088) from the hand bone, along +Z)
  const h = B.bpos('handR').add(V3(0.02 * s, -0.088 * s, 0));
  const R = rng(9);
  if (th.sea) { // trident
    B.add(seg(h.clone().add(V3(0, 0, -0.35)), h.clone().add(V3(0, 0, 0.8)), 0.018, 0.018, 6), { cell: 'plate', color: '#4a7a7a', metal: 1, rough: 0.3, bone: 'handR' });
    for (const k of [-1, 0, 1]) B.add(tube([h.clone().add(V3(0, 0, 0.78)), h.clone().add(V3(k * 0.07, 0, 0.86)), h.clone().add(V3(k * 0.07, 0, 1.02 + (k ? 0 : 0.05)))], (t) => lerp(0.016, 0.003, t), 5), { cell: 'gloss', color: acc, glow: 1.2, bone: 'handR' });
  } else if (th.ice || th.bone) { // ice club / bone club
    const club = [h.clone().add(V3(0, 0, -0.12)), h.clone().add(V3(0, 0, 0.3)), h.clone().add(V3(0, 0, 0.75))];
    B.add(tube(club, (t) => lerp(0.025, 0.08, t * t), 8), th.bone ? { cell: 'bone', color: mixc(c, '#ffffff', 0.2), bone: 'handR' } : { cell: 'gloss', color: mixc(acc, '#cfefff', 0.5), rough: 0.1, metal: 0.2, glow: 0.4, bone: 'handR' });
    for (let i = 0; i < 9; i++) { const t = 0.55 + R() * 0.4, p = club[0].clone().lerp(club[2], t); const a = R() * TAU; B.add(toFlat(cone(0.03, 0, 0.12 + R() * 0.08, 4)), { m: matDir(V3(p.x + Math.sin(a) * 0.05, p.y + Math.cos(a) * 0.05, p.z), V3(Math.sin(a), Math.cos(a), 0.3)), cell: 'gloss', color: th.bone ? acc : mixc(acc, '#ffffff', 0.4), rough: 0.05, glow: th.bone ? 1.4 : 0.6, bone: 'handR' }); }
  } else { // stone maul with a glowing rune
    B.add(seg(h.clone().add(V3(0, 0, -0.25)), h.clone().add(V3(0, 0, 0.7)), 0.022, 0.022, 6), { cell: 'bark', color: '#4a3424', bone: 'handR' });
    B.add(toFlat(bumpy(rbox(0.26, 0.2, 0.2, 0.3, 10, 8), 0.02, 6, 2)), { pos: [h.x, h.y, h.z + 0.78], cell: 'rock', color: hexOfC(shade(c, 0.8)), bone: 'handR' });
    for (const sd of [-1, 1]) B.add(rbox(0.012, 0.12, 0.012, 0.4, 4, 6), { pos: [h.x, h.y + sd * 0.105, h.z + 0.78], rot: [0, 0, PI / 2], cell: 'gloss', color: acc, glow: 2.5, bone: 'handR' });
  }
  return { tpl: B.build(), D };
}

// ------------------------------------------------------------------ COLOSSUS (stone / sun colossus)
function colossusT(def, q) {
  const th = theme(def);
  const D = humanDims(1.8, 'broad', { wide: 1.45, arm: 1.5, leg: 1.5 });
  const B = new Builder({ seed: 41 + hashStr(def.name || '') % 97, texScale: 0.9 });
  humanBones(B, D, {});
  const c = col(def.color), rune = col(def.accent);
  const groove = deepen(c, th.light ? 0.38 : 0.45);   // dark inset behind every rune so light palettes keep contrast
  const P = (n) => B.bpos(n);
  const R = rng(41);
  const blk = (w, h, d) => toFlat(bumpy(rbox(w, h, d, 0.22, 12, 10), Math.min(w, h, d) * 0.04, 6, R() * 9, 2));
  const add = (g, o) => B.add(g, { cell: 'rock', color: c, rough: 0.9, colorFn: (p, n, cc) => cc.multiplyScalar(0.86 + 0.18 * Math.max(0, n.y)), ...o });
  add(blk(0.78, 0.5, 0.42), { pos: [0, 1.36, -0.01], bone: 'chest' });
  add(blk(0.5, 0.22, 0.34), { pos: [0, 1.08, 0], bone: 'spine' });
  add(blk(0.56, 0.2, 0.36), { pos: [0, 0.92, 0], bone: 'hips' });
  add(blk(0.24, 0.26, 0.24), { pos: [0, 1.7, 0.02], bone: 'head' });
  const glowRune = (g, o, back) => {
    if (back) B.add(back.g, { cell: 'rock', color: groove, rough: 0.95, ...back.o });
    B.add(g, { cell: 'gloss', color: rune, glow: th.light ? 3.2 : 2.4, ...o });
  };
  glowRune(rbox(0.18, 0.025, 0.02, 0.4, 8, 4), { pos: [0, 1.72, 0.145], bone: 'head' }, { g: rbox(0.21, 0.05, 0.015, 0.4, 8, 4), o: { pos: [0, 1.72, 0.138], bone: 'head' } });
  B.add(cylinder(0.125, 0.125, 0.012, 24, 1), { pos: [0, 1.38, 0.205], rot: [PI / 2, 0, 0], cell: 'rock', color: groove, bone: 'chest' });
  B.add(torus(0.1, 0.012, 24, 4), { pos: [0, 1.38, 0.215], cell: 'gloss', color: rune, glow: 2.6, bone: 'chest' });
  B.add(torus(0.05, 0.01, 16, 4), { pos: [0, 1.38, 0.215], cell: 'gloss', color: rune, glow: 2.6, bone: 'chest' });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; B.add(rbox(0.01, 0.05, 0.01, 0.5, 4, 4), { pos: [Math.sin(a) * 0.075, 1.38 + Math.cos(a) * 0.075, 0.22], rot: [0, 0, -a], cell: 'gloss', color: rune, glow: 2.6, bone: 'chest' }); }
  const runeStrip = (pos, len, bone, nrm = [0, 0, 1]) => {
    B.add(rbox(0.036, len + 0.03, 0.01, 0.4, 4, 6), { pos: [pos[0] - nrm[0] * 0.006, pos[1], pos[2] - nrm[2] * 0.006], rot: nrm[0] ? [0, PI / 2, 0] : [0, 0, 0], cell: 'rock', color: groove, bone });
    B.add(rbox(0.015, len, 0.012, 0.4, 4, 6), { pos, rot: nrm[0] ? [0, PI / 2, 0] : [0, 0, 0], cell: 'gloss', color: rune, glow: 2.4, bone });
  };
  const capC = th.sun ? '#d8b048' : null;
  for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    add(blk(0.32, 0.26, 0.32), { pos: [P('uarm' + S).x + sd * 0.03, P('uarm' + S).y + 0.03, 0], bone: 'uarm' + S });
    add(blk(0.2, 0.3, 0.2), { pos: P('uarm' + S).lerp(P('farm' + S), 0.55).toArray(), bone: 'uarm' + S });
    add(blk(0.24, 0.32, 0.24), { pos: P('farm' + S).lerp(P('hand' + S), 0.5).toArray(), bone: 'farm' + S });
    add(blk(0.24, 0.22, 0.24), { pos: P('hand' + S).add(V3(0, -0.11, 0.02)).toArray(), bone: 'hand' + S });
    add(blk(0.24, 0.36, 0.25), { pos: P('thigh' + S).lerp(P('shin' + S), 0.5).toArray(), bone: 'thigh' + S });
    add(blk(0.22, 0.34, 0.22), { pos: P('shin' + S).lerp(P('foot' + S), 0.5).toArray(), bone: 'shin' + S });
    add(blk(0.24, 0.1, 0.32), { pos: P('foot' + S).add(V3(0, -0.04, 0.06)).toArray(), bone: 'foot' + S });
    const fa = P('farm' + S).lerp(P('hand' + S), 0.5), th2 = P('thigh' + S).lerp(P('shin' + S), 0.5);
    runeStrip([fa.x, fa.y, fa.z + 0.125], 0.18, 'farm' + S);
    runeStrip([th2.x, th2.y, th2.z + 0.13], 0.2, 'thigh' + S);
    runeStrip([P('uarm' + S).x + sd * 0.19, P('uarm' + S).y + 0.03, 0], 0.14, 'uarm' + S, [sd, 0, 0]);
    if (capC) B.add(toFlat(blob(0.17, 0.06, 0.17, 0.7, 0.7, 10, 6)), { pos: [P('uarm' + S).x + sd * 0.03, P('uarm' + S).y + 0.17, 0], cell: 'plate', color: capC, metal: 1, rough: 0.25, bone: 'uarm' + S });
    else B.add(blob(0.13, 0.04, 0.12, 1, 1, 10, 6), { pos: [P('uarm' + S).x, P('uarm' + S).y + 0.17, 0], cell: 'fur', color: '#5a7a3a', bone: 'uarm' + S });
  }
  runeStrip([0.22, 1.25, 0.215], 0.16, 'chest'); runeStrip([-0.22, 1.25, 0.215], 0.16, 'chest');
  if (capC) { // sun crest on the head
    for (let i = 0; i < 7; i++) { const a = -1.2 + i * 0.4; B.add(cone(0.025, 0, 0.12 + (i === 3 ? 0.06 : 0), 4), { pos: [Math.sin(a) * 0.13, 1.83, 0.02 + Math.cos(a) * 0.05], rot: [0, 0, -a * 0.7], cell: 'plate', color: capC, metal: 1, rough: 0.25, glow: 0.2, bone: 'head' }); }
  }
  return { tpl: B.build(), D };
}

// ------------------------------------------------------------------ KING / QUEEN (shadow king, forest & light queens, fire, thunder, ghost kings)
function kingT(def, q) {
  const th = theme(def);
  const queen = th.queen, light = th.light;
  const D = humanDims(queen ? 1.78 : 1.8, queen ? 'slim' : 'broad', { wide: queen ? 1.02 : 1.08 });
  const B = new Builder({ seed: 51 + hashStr(def.name || '') % 97 });
  humanBones(B, D, { cape: true });
  const acc = col(def.accent), c = col(def.color);
  const metal = light ? '#e8b84a' : th.ghost ? '#c8d0d8' : '#d9b04a';
  const skin = light ? '#f2dcc6' : th.ghost ? '#a8b4c0' : th.fire ? '#5a3a2e' : queen ? hexOfC(mixc('#c8a890', c, 0.25)) : hexOfC(mixc('#3a3048', c, 0.3));
  const trim = light ? hexOfC(deepen(c, 0.5)) : hexOfC(acc);
  const L = {
    skin, hairStyle: queen ? 'long' : 'short', hairLen: 1.15,
    hair: queen ? hexOfC(light ? mixc(c, '#ffffff', 0.4) : mixc(acc, c, 0.45)) : hexOfC(th.ghost ? '#d8e0e8' : shade(mixc(c, acc, 0.2), 0.5)),
    eyes: def.accent, eyeGlow: light ? 1.2 : 3, eyeWhite: light || queen ? '#f4f0ea' : '#1a1424', beard: queen ? false : 'full',
    brow: queen ? undefined : '#120c18', bust: queen ? 0.022 : 0.012, lip: queen ? (light ? '#c8707a' : hexOfC(mixc(acc, '#6a2a3a', 0.6))) : undefined,
    top: hexOfC(light ? shade(c, 0.95) : mixc(c, '#3a2a4a', 0.4)), skirt: 0.06, flare: 0.5, skirtColor: hexOfC(c), trim, sleeves: 'long', collar: trim, cuff: trim,
    gloves: light ? '#efe6cc' : '#1a1420', boots: light ? '#c8a860' : '#1a1420', bottom: light ? '#d8c890' : '#1a1420',
    cape: hexOfC(light ? deepen(c, 0.7) : shade(acc, 0.35)), capeTrim: metal, capeLen: 0.1, clasp: metal, beltColor: light ? '#a88a4a' : '#2a2030', buckle: metal,
  };
  addBody(B, D, L, q);
  if (!queen) addArmor(B, D, L, { id: 'iron', color: light ? '#e8d8a8' : hexOfC(mixc(c, '#2e2838', 0.6)) }, q);
  const s = D.s, hc = V3(...D.hc);
  const mo = { cell: 'plate', color: metal, metal: 1, rough: 0.2, bone: 'head' };
  if (queen) { // tiara
    B.add(torus(0.1, 0.007, 20, 4, PI * 1.2), { pos: [hc.x, hc.y + 0.07, hc.z - 0.005], rot: [PI / 2 - 0.25, 0, PI * 1.4], scl: [1, 1.08, 1], ...mo });
    for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; B.add(cone(0.014, 0, i === 2 ? 0.07 : 0.045, 4), { pos: [hc.x + Math.sin(a) * 0.1, hc.y + 0.085, hc.z + Math.cos(a) * 0.105], rot: [0.2, a, 0], ...mo }); }
    B.add(toFlat(new THREE.OctahedronGeometry(0.016, 0)), { pos: [hc.x, hc.y + 0.11, hc.z + 0.11], cell: 'gloss', color: acc, glow: 2.5, bone: 'head' });
  } else {
    B.add(cylinder(0.098, 0.104, 0.04, 20, 1), { pos: [hc.x, hc.y + 0.065, hc.z - 0.005], rot: [-0.08, 0, 0], ...mo });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, tall = i % 2 ? 0.06 : 0.1;
      B.add(cone(0.022, 0, tall, 4), { pos: [hc.x + Math.sin(a) * 0.1, hc.y + 0.1, hc.z + Math.cos(a) * 0.103 - 0.005], rot: [0, a, 0], ...mo });
      if (!(i % 2)) B.add(toFlat(new THREE.OctahedronGeometry(0.016, 0)), { pos: [hc.x + Math.sin(a) * 0.106, hc.y + 0.085, hc.z + Math.cos(a) * 0.11 - 0.005], cell: 'gloss', color: acc, glow: 2.5, bone: 'head' });
    }
  }
  // sceptre / staff in the right hand
  const h = B.bpos('handR').add(V3(0.02 * s, -0.088 * s, 0));
  const top = h.clone().add(V3(0, 0, queen ? 0.95 : 0.75)), bot = h.clone().add(V3(0, 0, queen ? -0.55 : -0.35));
  B.add(seg(bot, top, 0.016, 0.02, 8), { cell: queen && th.moss ? 'bark' : 'plate', color: queen && th.moss ? '#5a4028' : metal, metal: queen && th.moss ? 0 : 1, rough: 0.25, bone: 'handR' });
  B.add(queen ? toFlat(new THREE.OctahedronGeometry(0.07, 0)) : sphere(0.06, 14, 10), { pos: [top.x, top.y, top.z + 0.06], scl: queen ? [0.8, 0.8, 1.3] : 1, cell: 'gloss', color: acc, glow: 3, bone: 'handR' });
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; B.add(tube([top.clone().add(V3(Math.sin(a) * 0.02, Math.cos(a) * 0.02, -0.03)), top.clone().add(V3(Math.sin(a) * 0.07, Math.cos(a) * 0.07, 0.04)), top.clone().add(V3(Math.sin(a) * 0.03, Math.cos(a) * 0.03, 0.12))], 0.008, 4), { cell: 'plate', color: metal, metal: 1, rough: 0.25, bone: 'handR' }); }
  if (th.moss) { // leaves on the gown
    const R2 = rng(12);
    for (let i = 0; i < 12; i++) { const a = R2() * TAU, y = 0.2 + R2() * 0.7; B.add(blob(0.03, 0.008, 0.05, 1, 1, 6, 4), { pos: [Math.sin(a) * (0.2 + (1 - y) * 0.25), y, Math.cos(a) * (0.17 + (1 - y) * 0.22)], rot: [0.5, a, 0.3], cell: 'plain', color: i % 3 ? '#3f7a2a' : acc, glow: i % 3 ? 0 : 0.6, w: (p) => [B.idx('hips'), 1] }); }
  }
  // aura wisps behind (glass)
  const R = rng(3);
  for (let i = 0; i < 6; i++) { const a = -1 + R() * 2; B.add(tube([V3(Math.sin(a) * 0.15, 1.45, -0.12), V3(Math.sin(a) * 0.25, 1.65 + R() * 0.2, -0.22), V3(Math.sin(a) * 0.3, 1.9 + R() * 0.25, -0.3)], (t) => lerp(0.03, 0.004, t), 5), { slot: 'glass', cell: 'gloss', color: acc, glow: 1.5, bone: 'chest' }); }
  return { tpl: B.build(), D };
}

function hexOfC(c) { return '#' + col(c).getHexString(); }

// ------------------------------------------------------------------ REAPER KNIGHT
function reaperT(def, q) {
  const D = humanDims(1.85, 'broad', { wide: 1.1 });
  const B = new Builder({ seed: 61 });
  humanBones(B, D, { cape: true });
  const acc = col(def.accent), c = col(def.color);
  const L = {
    skin: '#0e0c12', hair: '#0a080c', hairStyle: 'hood', hood: '#1a1622', mask: '#060508', eyes: def.accent, eyeGlow: 3.5, eyeWhite: '#050406', brow: '#060508', lip: '#060508',
    top: '#1a1622', skirt: 0.5, flare: 0.4, skirtColor: '#1a1622', trim: hexOfC(shade(acc, 0.5)), collar: hexOfC(shade(acc, 0.5)), gloves: '#14121a', boots: '#14121a', bottom: '#14121a',
    cape: hexOfC(shade(acc, 0.25)), capeLen: 0.12, beltColor: '#2a2030', buckle: hexOfC(acc), noCollar: false,
  };
  addBody(B, D, L, q);
  addArmor(B, D, L, { id: 'iron', color: '#3a3444' }, q);
  const s = D.s;
  // scythe: long shaft along the right hand's grip axis, blade at the top end
  const h = B.bpos('handR').add(V3(0.02 * s, -0.088 * s, 0));
  const a0 = h.clone().add(V3(0, 0, -0.45)), a1 = h.clone().add(V3(0, 0, 1.45));
  B.add(seg(a0, a1, 0.022, 0.02, 8), { cell: 'bark', color: '#2a2024', bone: 'handR' });
  for (let i = 0; i < 4; i++) B.add(torus(0.026, 0.007, 10, 4), { pos: [h.x, h.y, h.z - 0.3 + i * 0.5], cell: 'plate', color: '#6a5a78', metal: 1, rough: 0.35, bone: 'handR' });
  // curved blade, perpendicular to the shaft at its top end, curving down; cutting edge on the inside
  const rings = [], edge = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N, ang = t * 1.7, R = 0.78;
    const sp = a1.clone().add(V3(-Math.sin(ang) * R, 0, -(1 - Math.cos(ang)) * R * 0.45 + 0.02));
    const T = V3(-Math.cos(ang), 0, -Math.sin(ang) * 0.45).normalize(), Nn = V3(-T.z, 0, T.x);
    const w = 0.17 * (1 - t * 0.88) * (t < 0.1 ? 0.5 + 5 * t : 1), th = 0.016 * (1 - t * 0.7);
    rings.push([sp.clone().add(V3(0, th, 0)), sp.clone().add(V3(0, -th, 0)), sp.clone().addScaledVector(Nn, w)]);
    edge.push(sp.clone().addScaledVector(Nn, w + 0.006));
  }
  B.add(loft(rings, { capStart: true, capEnd: true }), { cell: 'metal', color: '#9a90b0', metal: 1, rough: 0.25, bone: 'handR' });
  B.add(tube(edge, (t) => 0.01 * (1 - t) + 0.002, 4), { cell: 'gloss', color: acc, glow: 3, bone: 'handR' });
  // ghost aura skirt (glass)
  const aura = param(18, 6, (u, v, o) => { const a = -PI + u * TAU; const r = lerp(0.3, 0.45, v); o.set(Math.sin(a) * r, lerp(0.75, 0.15, v) + (v > 0.5 ? Math.sin(a * 6) * 0.06 * v : 0), Math.cos(a) * r * 0.85 - 0.05); }, { lu: 1, lv: 0.6 });
  for (const p of twoSided(aura, 0.01)) B.add(p, { slot: 'glass', cell: 'wool', color: shade(acc, 0.35), glow: 0.6, w: (p2) => [B.idx('hips'), 1] });
  return { tpl: B.build(), D };
}

// ------------------------------------------------------------------ SEA SERPENT
function serpentT(def, q) {
  const th = theme(def);
  const B = new Builder({ seed: 71, texScale: 1.2 });
  const c = col(def.color), acc = col(def.accent), belly = th.light ? mixc(c, '#ffffff', 0.4) : mixc(c, mixc(acc, '#e8f0d8', 0.5), lum(c) < 0.03 ? 0.3 : 0.5);
  const backC = th.light ? deepen(c, 0.62) : shade(c, 0.68), bandC = th.light ? deepen(c, 0.48) : shade(c, 0.5);
  const finC = th.light ? deepen(mixc(c, acc, 0.5), 0.55) : shade(acc, 0.6);
  const sO = th.sun ? { cell: 'plate', rough: 0.3, metal: 0.85 } : { cell: 'scales' };
  // body path: coils on the ground then rises up to the head (model units ~ metres, head ~4.6 high)
  const N = 18;
  const curve = new THREE.CatmullRomCurve3([
    V3(1.1, 0.3, -3.9), V3(-1.2, 0.4, -3.1), V3(1.0, 0.45, -2.1), V3(-0.7, 0.48, -1.1), V3(0.05, 0.52, -0.25),
    V3(0, 1.25, 0.6), V3(0.1, 2.25, 0.1), V3(-0.06, 3.2, -0.32), V3(0, 3.95, 0.05), V3(0, 4.3, 0.55),
  ], false, 'catmullrom', 0.5);
  const path = curve.getSpacedPoints(N - 1).reverse(); // index 0 = head end
  B.bone('s0', null, path[0].x, path[0].y, path[0].z);
  for (let i = 1; i < N; i++) B.bone('s' + i, 's' + (i - 1), path[i].x, path[i].y, path[i].z);
  const hp = path[0].clone().add(V3(0, 0.1, 0.3));
  B.bone('head', 's0', hp.x, hp.y, hp.z);
  B.bone('jaw', 'head', hp.x, hp.y - 0.12, hp.z + 0.1);
  const tailEnd = path[N - 1].clone().add(V3(0.5, -0.12, -0.45));
  const pts = [hp.clone().add(V3(0, -0.05, -0.1)), ...path, tailEnd];
  const w = (p) => {
    let bi = 0, bd = 1e9, b2 = 0, d2 = 1e9;
    for (let i = 0; i < N; i++) { const d = p.distanceTo(path[i]); if (d < bd) { b2 = bi; d2 = bd; bd = d; bi = i; } else if (d < d2) { d2 = d; b2 = i; } }
    const t = clamp(bd / (bd + d2), 0, 0.5);
    return [B.idx('s' + bi), 1 - t, B.idx('s' + b2), t];
  };
  const radius = (t) => lerp(0.34, 0.5, sstep(0, 0.35, t)) * (1 - sstep(0.62, 1, t) * 0.88);
  B.add(tube(pts, radius, Math.round(16 * q) + 4), { ...sO, color: c, w, colorFn: (p, n, cc) => {
    if (p.y > 1 ? n.z > 0.45 : n.y < -0.35) return cc.copy(belly);
    const back = p.y > 1 ? -n.z : n.y;
    cc.copy(c); if (back > 0.25) cc.lerp(backC, Math.min(1, (back - 0.25) / 0.6));
    if (Math.sin((p.x * 0.6 + p.y * 2.4 + p.z * 2.4) * 2.2) > 0.55) cc.lerp(bandC, 0.75);
    return cc;
  } });
  // dorsal fins along the back (glowing tips)
  for (let i = 1; i < N - 1; i += 1) {
    const p = path[i], nx = path[i + 1].clone().sub(path[i - 1]).normalize();
    const up = p.y > 1 ? V3(0, 0, -1) : V3(0, 1, 0);
    const base = p.clone().addScaledVector(up, radius(i / N) * 0.9);
    if (th.ice) B.add(toFlat(cone(0.08, 0, 0.3 * (1 - i / N) + 0.12, 4)), { m: matDir(base, up.clone().addScaledVector(nx, 0.4)), cell: 'gloss', color: mixc(acc, '#ffffff', 0.3), rough: 0.05, glow: 0.5, w: () => [B.idx('s' + i), 1] });
    else B.add(cone(0.12, 0, 0.35 * (1 - i / N) + 0.1, 4), { m: matDir(base, up.clone().addScaledVector(nx, 0.6), [1, 1, 0.2]), cell: 'leather', color: finC, glow: th.light ? 0.15 : 0.4, w: () => [B.idx('s' + i), 1] });
    if (th.moss && i % 2) for (const sd of [-1, 1]) B.add(blob(0.06, 0.012, 0.1, 1, 1, 6, 4), { m: matDir(p.clone().add(V3(sd * radius(i / N) * 0.95, 0.05, 0)), V3(sd, 0.6, 0.3), 1), cell: 'plain', color: i % 4 === 1 ? acc : '#3f7a2a', glow: i % 4 === 1 ? 0.5 : 0, w: () => [B.idx('s' + i), 1] });
    if (th.storm && i % 3 === 0) for (const sd of [-1, 1]) { const zz = []; for (let k = 0; k < 4; k++) zz.push(p.clone().add(V3(sd * radius(i / N) * 1.01, 0.12 - k * 0.08, (k % 2) * 0.08 - 0.04))); B.add(tube(zz, 0.018, 4), { cell: 'gloss', color: acc, glow: 2.6, w: () => [B.idx('s' + i), 1] }); }
  }
  // glowing spots
  for (let i = 2; i < N - 2; i++) for (const sd of [-1, 1]) { const p = path[i]; B.add(sphere(0.045, 8, 6), { pos: [p.x + sd * radius(i / N) * 0.92, p.y + 0.05, p.z + (p.y > 1 ? 0.05 : 0)], cell: 'gloss', color: acc, glow: 2.2, w: () => [B.idx('s' + i), 1] }); }
  // head
  B.add(blob(0.42, 0.3, 0.66, 0.9, 1, 18, 12), { pos: [hp.x, hp.y + 0.05, hp.z + 0.3], ...sO, color: c, bone: 'head', colorFn: (p, n, cc) => (n.y > 0.4 ? cc.lerp(backC, 0.6) : cc) });
  B.add(blob(0.34, 0.12, 0.55, 0.9, 1, 14, 8), { pos: [hp.x, hp.y - 0.17, hp.z + 0.42], cell: 'scales', color: belly, bone: 'jaw' });
  for (const sd of [-1, 1]) {
    B.add(sphere(0.08, 12, 8), { pos: [hp.x + sd * 0.3, hp.y + 0.18, hp.z + 0.5], scl: [0.8, 0.7, 1], cell: 'gloss', color: acc, glow: 3, bone: 'head' });
    B.add(cone(0.18, 0, 0.6, 4), { m: matDir(V3(hp.x + sd * 0.3, hp.y + 0.1, hp.z), V3(sd * 1, 0.3, -0.8), [1, 1, 0.15]), cell: th.ice ? 'gloss' : 'leather', color: finC, glow: 0.5, bone: 'head' });
    for (let k = 0; k < 3; k++) B.add(cone(0.02, 0, 0.1, 4), { pos: [hp.x + sd * (0.14 + k * 0.07), hp.y - 0.08, hp.z + 0.8 - k * 0.08], rot: [PI, 0, 0], cell: 'bone', color: '#f2eee0', bone: 'head' });
  }
  for (let k = 0; k < 4; k++) B.add(cone(0.06, 0, 0.45 - k * 0.07, 4), { m: matDir(V3(hp.x, hp.y + 0.28, hp.z + 0.1 - k * 0.15), V3(0, 1, -0.9), [1, 1, 0.25]), cell: 'leather', color: th.light ? mixc(acc, finC, 0.5) : acc, glow: 0.8, bone: 'head' });
  return { tpl: B.build(), N, hp };
}
function serpentPoses(N) {
  return (J) => ({
    idle(P, t) {
      for (let i = 1; i < N; i++) P.e(J['s' + i], 0.03 * Math.sin(t * 1.2 - i * 0.5), 0.04 * Math.sin(t * 0.9 - i * 0.4), 0);
      P.e(J.s0, 0.05 * Math.sin(t * 1.1), 0.2 * Math.sin(t * 0.5), 0);
      P.e(J.head, 0.1 + 0.05 * Math.sin(t * 1.3), 0, 0.05 * Math.sin(t * 0.7));
      P.e(J.jaw, 0.08 + 0.06 * Math.max(0, Math.sin(t * 1.7)));
    },
    move(P, t, c) {
      const ph = c.phase;
      for (let i = 1; i < N; i++) P.e(J['s' + i], 0.02 * Math.sin(ph - i * 0.6), 0.1 * Math.sin(ph - i * 0.6) * (i > N * 0.4 ? 1.3 : 0.5), 0);
      P.e(J.s0, 0.08, 0.15 * Math.sin(ph), 0);
      P.e(J.head, 0.15, 0, 0); P.e(J.jaw, 0.1);
    },
    dead(P, t) {
      const u = sstep(0, 1.4, t), f = u * u;
      P.e(J.s0, 0, 0, 0);
      for (let i = 1; i < N; i++) P.e(J['s' + i], i < N * 0.6 ? 0.22 * f : 0, 0.05 * f, 0);
      P.e(J.head, 0.4 * f, 0, 0.6 * f); P.e(J.jaw, 0.4 * f);
    },
  });
}
function serpentMoves(N) {
  return (J) => {
    const neck = (P, x, y = 0) => { for (let i = 1; i < N * 0.55; i++) P.e(J['s' + i], x, y, 0); };
    return {
      beam: () => ({ dur: 2.4, hit: 0.75, keys: [[0, none], [0.5, (P) => { neck(P, 0.05); P.e(J.s0, -0.3); P.e(J.head, -0.3); P.e(J.jaw, 0.2); }, 'o'], [0.75, (P) => { neck(P, -0.04); P.e(J.s0, 0.25); P.e(J.head, 0.35); P.e(J.jaw, 0.85); }, 'i'], [2.0, (P) => { neck(P, -0.04); P.e(J.s0, 0.28, 0.2, 0); P.e(J.head, 0.35); P.e(J.jaw, 0.85); }], [2.4, none]], fadeOut: 0.4 }),
      charge: () => ({ dur: 1.4, hit: 0.7, keys: [[0, none], [0.45, (P) => { neck(P, 0.08); P.e(J.s0, -0.45); P.e(J.head, -0.2); P.e(J.jaw, 0.4); }, 'o'], [0.7, (P) => { neck(P, -0.11); P.e(J.s0, 0.5); P.e(J.head, 0.35); P.e(J.jaw, 0.9); }, 'i'], [0.95, (P) => { neck(P, -0.1); P.e(J.s0, 0.45); P.e(J.head, 0.2); P.e(J.jaw, 0.2); }], [1.4, none]], fadeOut: 0.35 }),
      sweep: () => ({ dur: 1.6, hit: 0.85, keys: [[0, none], [0.5, (P) => { neck(P, 0, 0.1); P.e(J.s0, 0, 0.6, 0); for (let i = Math.floor(N * 0.5); i < N; i++) P.e(J['s' + i], 0, -0.15, 0); }, 'o'], [0.85, (P) => { neck(P, 0.02, -0.1); P.e(J.s0, 0.1, -0.7, 0); for (let i = Math.floor(N * 0.5); i < N; i++) P.e(J['s' + i], 0, 0.2, 0); }, 'i'], [1.6, none]], fadeOut: 0.4 }),
      roar: () => ({ dur: 2.0, hit: 0.7, keys: [[0, none], [0.45, (P) => { neck(P, 0.04); P.e(J.s0, -0.35); P.e(J.head, -0.25); P.e(J.jaw, 0.25); }, 'o'], [0.7, (P) => { neck(P, -0.03); P.e(J.s0, -0.15, 0, 0); P.e(J.head, -0.55); P.e(J.jaw, 1.0); }, 'i'], [1.5, (P) => { neck(P, -0.03); P.e(J.s0, -0.15, 0.15, 0); P.e(J.head, -0.55, 0, 0.08); P.e(J.jaw, 1.0); }], [2.0, none]], fadeOut: 0.45 }),
      volley: () => ({ dur: 1.6, hit: 0.5, keys: [[0, none], [0.3, (P) => { P.e(J.s0, -0.2); P.e(J.head, -0.2); P.e(J.jaw, 0.1); }, 'o'], [0.5, (P) => { P.e(J.s0, 0.15); P.e(J.head, 0.25); P.e(J.jaw, 0.7); }, 'i'], [0.75, (P) => { P.e(J.s0, -0.1, 0.25); P.e(J.head, -0.1); P.e(J.jaw, 0.2); }], [0.95, (P) => { P.e(J.s0, 0.15, 0.25); P.e(J.head, 0.25); P.e(J.jaw, 0.7); }, 'i'], [1.15, (P) => { P.e(J.s0, -0.1, -0.25); P.e(J.jaw, 0.2); }], [1.35, (P) => { P.e(J.s0, 0.15, -0.25); P.e(J.head, 0.25); P.e(J.jaw, 0.7); }, 'i'], [1.6, none]], fadeOut: 0.3 }),
    };
  };
}

// ------------------------------------------------------------------ FOUR-LEGGED BOSSES: thunder drake & sun sphinx
function beastT(def, q, kind) {
  const drake = kind === 'drake';
  const th = theme(def);
  const B = new Builder({ seed: drake ? 81 : 91, texScale: 1.2 });
  const c = col(def.color), acc = col(def.accent);
  const hsl = hslOf(c);
  const gold = !drake && hsl.h > 0.07 && hsl.h < 0.18 && hsl.s > 0.35 && lum(c) > 0.2; // golden statue sphinx
  const Y = drake ? 1.7 : 1.3;
  const mat = drake ? (th.bone ? { cell: 'bone', rough: 0.55 } : { cell: 'scales', rough: 0.45 }) : gold ? { cell: 'plate', rough: 0.32, metal: 0.85 } : { cell: 'fur', rough: 0.8 };
  const belly = drake ? (th.light ? mixc(c, '#ffffff', 0.35) : mixc(c, '#8a8aa8', 0.5)) : mixc(c, '#ffe8a8', 0.3);
  const backC = th.light ? deepen(c, 0.6) : shade(c, 0.7);
  const stripeA = gold ? col('#e8c050') : mixc(acc, c, 0.25), stripeB = gold ? col('#2a4ab0') : deepen(c, 0.35);
  B.bone('body', null, 0, Y, 0);
  B.bone('chest', 'body', 0, Y + 0.1, 0.9);
  B.bone('neck1', 'chest', 0, Y + (drake ? 0.45 : 0.35), drake ? 1.45 : 1.3);
  B.bone('neck2', 'neck1', 0, Y + (drake ? 1.3 : 0.75), drake ? 1.9 : 1.45);
  B.bone('head', 'neck2', 0, Y + (drake ? 2.0 : 1.3), drake ? 2.25 : 1.6);
  B.bone('jaw', 'head', 0, Y + (drake ? 1.92 : 1.1), drake ? 2.4 : 1.8);
  B.bone('pelvis', 'body', 0, Y, -0.9);
  for (let i = 0; i < 5; i++) B.bone('tail' + i, i ? 'tail' + (i - 1) : 'pelvis', 0, Y - i * 0.2, -1.3 - i * 0.7);
  for (const [F, par, z] of [['f', 'chest', 0.95], ['b', 'pelvis', -0.95]]) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    B.bone(F + 'u' + S, par, sd * 0.55, Y - 0.1, z);
    B.bone(F + 'l' + S, F + 'u' + S, sd * 0.58, Y - 0.85, z + (F === 'b' ? -0.2 : 0.05));
    B.bone(F + 'p' + S, F + 'l' + S, sd * 0.6, 0.18, z);
  }
  if (drake) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { B.bone('w1' + S, 'chest', sd * 0.45, Y + 0.45, 0.6); B.bone('w2' + S, 'w1' + S, sd * 2.0, Y + 1.3, 0.2); }
  const NU = Math.round(20 * q), NV = Math.round(18 * q);
  const zW = B.ladder('z', [['pelvis', -0.8], ['body', 0], ['chest', 0.8]]);
  const torso = param(NU, NV, (u, v, o) => {
    const z = lerp(-1.4, 1.35, v), a = -PI + u * TAU, t = (z + 1.4) / 2.75;
    const close = Math.pow(Math.sin(clamp(t, 0, 1) * PI), 0.4);
    const rx = (0.6 + 0.12 * sstep(0.5, 0.8, t)) * close, ry = (0.55 + 0.15 * sstep(0.5, 0.8, t)) * close;
    o.set(Math.sin(a) * rx, Y + Math.cos(a) * ry - 0.05 * sstep(0.5, 0.8, t), z);
  }, { lu: 4, lv: 2.8 });
  B.add(torso, { ...mat, color: c, w: zW, colorFn: (p, n, cc) => (n.y < -0.5 ? cc.copy(belly) : n.y > 0.55 ? cc.lerp(backC, (n.y - 0.55) * 1.6) : cc) });
  // neck & head
  const np = drake ? [V3(0, Y + 0.2, 1.1), V3(0, Y + 0.55, 1.5), B.bpos('neck2'), B.bpos('head').add(V3(0, -0.1, -0.05))] : [V3(0, Y + 0.1, 1.05), V3(0, Y + 0.45, 1.35), B.bpos('head').add(V3(0, -0.2, -0.1))];
  B.add(tube(np, (t) => lerp(drake ? 0.42 : 0.6, drake ? 0.25 : 0.4, t), 14), { ...mat, color: c, w: B.ladder('y', [['chest', Y + 0.3], ['neck1', Y + 0.7], ['neck2', Y + 1.4], ['head', Y + 1.85]]), colorFn: (p, n, cc) => (n.z > 0.6 ? cc.copy(belly) : cc) });
  const hp = B.bpos('head');
  if (drake) {
    B.add(blob(0.3, 0.26, 0.42, 0.9, 1, 16, 12), { ...mat, color: c, pos: [0, hp.y, hp.z + 0.1], bone: 'head' });
    B.add(blob(0.2, 0.13, 0.4, 0.9, 1, 14, 10), { ...mat, color: c, pos: [0, hp.y - 0.03, hp.z + 0.48], bone: 'head' });
    B.add(blob(0.18, 0.08, 0.38, 0.9, 1, 14, 8), { ...mat, color: belly, pos: [0, hp.y - 0.17, hp.z + 0.42], bone: 'jaw' });
    for (const sd of [-1, 1]) {
      B.add(sphere(0.06, 10, 8), { pos: [sd * 0.2, hp.y + 0.1, hp.z + 0.3], scl: [0.7, 0.6, 1.1], cell: 'gloss', color: acc, glow: 3, bone: 'head' });
      B.add(tube([V3(sd * 0.15, hp.y + 0.18, hp.z - 0.05), V3(sd * 0.3, hp.y + 0.35, hp.z - 0.35), V3(sd * 0.34, hp.y + 0.45, hp.z - 0.7)], (t) => lerp(0.07, 0.008, t), 8), th.ice ? { cell: 'gloss', color: mixc(acc, '#ffffff', 0.4), glow: 0.4, bone: 'head' } : { cell: 'bone', color: th.light ? deepen(c, 0.45) : '#d8d0e8', bone: 'head' });
      for (let k = 0; k < 4; k++) B.add(cone(0.02, 0, 0.09, 4), { pos: [sd * (0.08 + k * 0.03), hp.y - 0.1, hp.z + 0.75 - k * 0.12], rot: [PI, 0, 0], cell: 'bone', color: '#f0f0ff', bone: 'head' });
    }
  } else {
    // sphinx face with nemes headdress
    const skin = gold ? mixc(c, '#c08a50', 0.3) : mixc(c, '#d0a080', 0.45);
    const so = { cell: 'skin', color: skin, metal: gold ? 0.4 : 0, rough: gold ? 0.35 : 0.55, bone: 'head' };
    B.add(blob(0.3, 0.37, 0.32, 1, 1, 18, 14, (p) => { if (p.z > 0.15 && Math.abs(p.y) < 0.2) { for (const sd of [-1, 1]) p.z -= 0.05 * Math.exp(-(((p.x - sd * 0.12) / 0.08) ** 2) - (((p.y - 0.08) / 0.07) ** 2)); } }), { ...so, pos: [0, hp.y, hp.z + 0.05] });
    B.add(blob(0.07, 0.12, 0.08, 1, 1, 10, 8), { ...so, pos: [0, hp.y - 0.05, hp.z + 0.36], rot: [-0.25, 0, 0] });
    for (const sd of [-1, 1]) B.add(blob(0.075, 0.02, 0.03, 1, 1, 8, 4), { ...so, color: shade(skin, 0.8), pos: [sd * 0.12, hp.y + 0.15, hp.z + 0.33], rot: [0, 0, -sd * 0.12] });
    for (const sd of [-1, 1]) {
      B.add(sphere(0.055, 10, 8), { pos: [sd * 0.12, hp.y + 0.08, hp.z + 0.3], scl: [1.3, 0.7, 0.5], cell: 'gloss', color: acc, glow: 3, bone: 'head' });
      B.add(tube([V3(sd * 0.05, hp.y + 0.12, hp.z + 0.335), V3(sd * 0.13, hp.y + 0.135, hp.z + 0.33), V3(sd * 0.22, hp.y + 0.1, hp.z + 0.29)], 0.012, 5), { cell: 'plate', color: stripeB, metal: 0.6, rough: 0.3, bone: 'head' });
    }
    B.add(tube([V3(-0.09, hp.y - 0.17, hp.z + 0.31), V3(0, hp.y - 0.155, hp.z + 0.36), V3(0.09, hp.y - 0.17, hp.z + 0.31)], 0.022, 5), { cell: 'skin', color: shade(skin, 0.75), bone: 'head' });
    B.add(tube([V3(-0.08, hp.y - 0.21, hp.z + 0.3), V3(0, hp.y - 0.23, hp.z + 0.34), V3(0.08, hp.y - 0.21, hp.z + 0.3)], 0.022, 5), { cell: 'skin', color: shade(skin, 0.7), bone: 'jaw' });
    B.add(tube([V3(0, hp.y - 0.3, hp.z + 0.26), V3(0, hp.y - 0.45, hp.z + 0.28), V3(0, hp.y - 0.62, hp.z + 0.22)], (t) => lerp(0.05, 0.03, t), 8), { cell: 'plate', color: stripeB, metal: 0.7, rough: 0.3, bone: 'jaw', colorFn: (p, n, cc) => (Math.sin(p.y * 60) > 0.2 ? cc.copy(stripeA) : cc) });
    // nemes: striped head cloth flaring to the shoulders
    const nemes = param(Math.round(24 * q), 12, (u, v, o) => {
      const lon = lerp(1.0, TAU - 1.0, u) + PI, lat = PI / 2 - v * 2.0;
      const r = 0.34 + 0.05 * sstep(0.4, 1, v);
      const drop = sstep(0.55, 1, v);
      o.set(Math.sin(lon) * Math.cos(lat) * r * (1 + 0.25 * drop), hp.y + 0.05 + Math.sin(lat) * 0.41 - 0.42 * drop, hp.z + Math.cos(lon) * Math.cos(lat) * r * 0.95 - 0.02 + 0.05 * drop);
    }, { wrap: false, flip: true, lu: 1.6, lv: 1 });
    const stripes = (p, n, cc) => (Math.sin(p.y * 40) > 0.3 ? cc.copy(stripeB) : cc.copy(stripeA));
    for (const g of twoSided(nemes, 0.02)) B.add(g, { cell: 'plate', color: stripeA, metal: gold ? 0.8 : 0.3, rough: 0.3, colorFn: stripes, bone: 'head' });
    if (th.fire) for (let i = 0; i < 9; i++) { const a = -1.3 + i * 0.32; B.add(cone(0.07, 0, 0.32 + 0.12 * Math.cos(a * 1.4), 5), { m: matDir(V3(Math.sin(a) * 0.42, hp.y + 0.2 + Math.cos(a) * 0.25, hp.z - 0.12), V3(Math.sin(a), 0.8 + Math.cos(a), -0.6)), cell: 'gloss', color: i % 2 ? acc : mixc(acc, '#ffffff', 0.4), glow: 2.2, bone: 'head' }); }
    B.add(cylinder(0.1, 0.1, 0.02, 24, 1), { pos: [0, hp.y + 0.49, hp.z + 0.1], rot: [PI / 2, 0, 0], cell: 'gloss', color: acc, glow: 3, bone: 'head' });
    B.add(tube([V3(0, hp.y + 0.38, hp.z + 0.32), V3(0, hp.y + 0.48, hp.z + 0.36), V3(0, hp.y + 0.55, hp.z + 0.3)], 0.025, 6), { cell: 'plate', color: stripeA, metal: 1, rough: 0.25, bone: 'head' });
    // mane collar
    B.add(torus(0.55, 0.12, 24, 8), { pos: [0, Y + 0.35, 1.2], rot: [1.0, 0, 0], cell: 'plate', color: stripeB, metal: gold ? 0.7 : 0.3, rough: 0.3, colorFn: (p, n, cc) => (Math.sin(Math.atan2(p.x, p.y - Y) * 12) > 0 ? cc.copy(stripeA) : cc), bone: 'chest' });
  }
  // legs
  for (const [F, z] of [['f', 0.95], ['b', -0.95]]) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    const u = B.bpos(F + 'u' + S), l = B.bpos(F + 'l' + S), p = B.bpos(F + 'p' + S);
    B.add(blob(0.3, 0.45, 0.38, 1, 1, 12, 10), { ...mat, color: c, pos: [u.x, u.y - 0.15, u.z], bone: F + 'u' + S });
    B.add(seg(u, l, 0.24, 0.17, 10), { ...mat, color: c, bone: F + 'u' + S });
    B.add(seg(l, p, 0.16, 0.13, 10), { ...mat, color: c, bone: F + 'l' + S });
    B.add(blob(0.2, 0.13, 0.28, 1, 1, 12, 8), { ...mat, color: c, pos: [p.x, 0.12, p.z + 0.12], bone: F + 'p' + S });
    for (const k of [-1, 0, 1]) B.add(cone(0.035, 0, 0.14, 5), { pos: [p.x + k * 0.1, 0.08, p.z + 0.38], rot: [PI / 2 + 0.3, 0, 0], cell: 'bone', color: drake ? '#d8d0e8' : '#f0e0b0', bone: F + 'p' + S });
  }
  // tail
  const tp = [V3(0, Y, -1.2)];
  for (let i = 0; i < 5; i++) tp.push(B.bpos('tail' + i));
  tp.push(B.bpos('tail4').add(V3(0, -0.1, -0.6)));
  B.add(tube(tp, (t) => lerp(0.42, 0.04, t), 12), { ...mat, color: c, w: B.ladder('z', [['tail4', -4.0], ['tail3', -3.3], ['tail2', -2.6], ['tail1', -1.9], ['tail0', -1.3], ['pelvis', -1.0]]) });
  if (!drake) B.add(blob(0.15, 0.15, 0.25, 1, 1, 10, 8), { pos: [tp[6].x, tp[6].y, tp[6].z - 0.1], cell: th.fire ? 'gloss' : 'fur', color: th.fire ? acc : gold ? '#a07030' : deepen(c, 0.5), glow: th.fire ? 2 : 0, bone: 'tail4' });
  if (drake) {
    // spines along the back & tail, crackling glow
    for (let i = 0; i < 14; i++) {
      const z = lerp(1.1, -3.6, i / 13), y = i < 4 ? Y + 0.6 - i * 0.02 : Y + 0.55 - (i - 4) * 0.13;
      const bone = z > 0.5 ? 'chest' : z > -0.8 ? 'body' : z > -1.4 ? 'pelvis' : 'tail' + clamp(Math.floor((-z - 1.3) / 0.7), 0, 4);
      B.add(th.ice ? toFlat(cone(0.08, 0, 0.36 - i * 0.012, 4)) : cone(0.08, 0, 0.32 - i * 0.012, 4), { pos: [0, y, z], rot: [-0.5, 0, 0], scl: [0.5, 1, 1], cell: 'gloss', color: th.ice ? mixc(acc, '#ffffff', 0.3) : acc, glow: th.ice ? 0.6 : 1.4, bone });
    }
    // zig-zag lightning marks on the flanks
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const zig = th.storm || !th.light && !th.fire && !th.ice && !th.bone && !th.shadow;
      const pts = []; for (let i = 0; i < 5; i++) pts.push(V3(sd * 0.66, Y + 0.3 - i * 0.12, -0.6 + k * 0.5 + (zig ? (i % 2) * 0.12 : -i * 0.06)));
      B.add(tube(pts, 0.02, 4), { cell: 'gloss', color: acc, glow: 2.5, w: zW });
    }
    // wings
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      const s1 = B.bpos('w1' + S), s2 = B.bpos('w2' + S);
      const tip = V3(sd * 3.3, Y + 1.7, -0.5);
      const fingers = [tip, V3(sd * 3.0, Y + 0.4, -1.3), V3(sd * 2.3, Y + 0.1, -1.4)];
      B.add(seg(s1, s2, 0.12, 0.08, 8), { ...mat, color: c, bone: 'w1' + S });
      for (const f of fingers) B.add(seg(s2, f, 0.06, 0.02, 6), { ...mat, color: c, bone: 'w2' + S });
      for (const f of fingers) B.add(seg(s2, f, 0.025, 0.01, 4), { cell: 'gloss', color: acc, glow: 1.6, bone: 'w2' + S, pos: [0, 0.05, 0] });
      const mem = param(14, 8, (u, v, o) => {
        const lead = u < 0.45 ? s1.clone().lerp(s2, u / 0.45) : s2.clone().lerp(tip, (u - 0.45) / 0.55);
        const trail = V3(lerp(s1.x * 0.6, tip.x * 0.95, u), lerp(Y + 0.15, Y + 0.6, u) - 0.3 * Math.sin(u * PI), lerp(-0.4, -1.6, Math.sin(u * PI * 0.9)) + 0.25 * Math.abs(Math.sin(u * PI * 3)));
        o.copy(lead).lerp(trail, v);
      }, { wrap: false, lu: 3, lv: 1.5 });
      const ww = B.ladder('x', sd > 0 ? [['w1L', s1.x + 0.3], ['w2L', s2.x]] : [['w2R', s2.x], ['w1R', s1.x - 0.3]]);
      const memC = th.light ? deepen(mixc(c, acc, 0.25), 0.55) : shade(c, 0.75);
      for (const g of twoSided(mem, 0.02)) B.add(g, { cell: 'leather', color: memC, rough: 0.6, w: ww, glowFn: th.fire ? (pp) => 0.25 * sstep(1.0, 0.0, pp.y - Y) : null, colorFn: th.fire ? (pp, n, cc) => cc.lerp(acc, 0.35 * sstep(Y + 0.6, Y, pp.y)) : null });
    }
  }
  return { tpl: B.build(), Y };
}
function beastPoses(kind) {
  const drake = kind === 'drake';
  return (J) => {
    const legs = (P, ph, a) => {
      for (const [F, S, off] of [['f', 'L', 0], ['b', 'R', 0], ['f', 'R', PI], ['b', 'L', PI]]) {
        const p = ph + off, sn = Math.sin(p), sw = Math.max(0, Math.cos(p + 0.4));
        if (F === 'f') { P.e(J['fu' + S], -0.35 * sn * a, 0, 0); P.e(J['fl' + S], 0.6 * sw * a, 0, 0); P.e(J['fp' + S], (0.35 * sn - 0.4 * sw) * a, 0, 0); }
        else { P.e(J['bu' + S], -0.35 * sn * a - 0.1, 0, 0); P.e(J['bl' + S], 0.2 + 0.4 * sw * a, 0, 0); P.e(J['bp' + S], (0.35 * sn - 0.3 * sw) * a - 0.1, 0, 0); }
      }
    };
    const tail = (P, t, amp) => { for (let i = 0; i < 5; i++) P.e(J['tail' + i], 0.05, amp * Math.sin(t * 1.3 - i * 0.7), 0); };
    const wings = (P, fold, t) => { if (!drake) return; for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['w1' + S], 0, sd * 0.4 * fold, -sd * 0.55 * fold + 0.05 * Math.sin(t * 1.5)); P.e(J['w2' + S], 0, -sd * 0.6 * fold, sd * 0.9 * fold); } };
    return {
      idle(P, t) {
        const b = Math.sin(t * 1.4);
        P.off(J.body, 0, 0.02 * b, 0); P.e(J.chest, 0.02 * b);
        P.e(J.neck1, -0.05 + 0.03 * b, 0.1 * Math.sin(t * 0.4), 0); P.e(J.neck2, 0.05, 0.12 * Math.sin(t * 0.45 + 1), 0);
        P.e(J.head, 0.05, 0.1 * Math.sin(t * 0.6), 0); P.e(J.jaw, 0.04 + 0.04 * Math.max(0, Math.sin(t * 2.1)));
        legs(P, 0, 0); tail(P, t, 0.12); wings(P, 1, t);
      },
      move(P, t, c) {
        const ph = c.phase;
        P.off(J.body, 0, 0.05 * Math.cos(2 * ph), 0);
        P.e(J.body, 0, 0.05 * Math.sin(ph), 0.04 * Math.sin(ph));
        P.e(J.neck1, 0.05 + 0.04 * Math.sin(2 * ph), -0.05 * Math.sin(ph), 0); P.e(J.head, -0.05);
        legs(P, ph, 1); tail(P, ph, 0.18); wings(P, 0.9, t);
      },
      dead(P, t) {
        const u = sstep(0, 1.2, t), f = u * u;
        P.e(J.body, 0, 0, 1.4 * f); P.off(J.body, 0, -1.1 * Math.pow(u, 0.8), 0);
        P.e(J.neck1, 0.5 * f, 0, 0.3 * f); P.e(J.neck2, 0.4 * f); P.e(J.head, 0.3 * f, 0, 0.3 * f); P.e(J.jaw, 0.4 * f);
        legs(P, 0, 0); tail(P, 0, 0); wings(P, 1 - 0.5 * f, 0);
        for (const k of ['fuL', 'fuR', 'buL', 'buR']) P.r(J[k], 0.4 * f, 0, 0);
      },
    };
  };
}
function beastMoves(kind) {
  const drake = kind === 'drake';
  return (J) => {
    const wingsUp = (P, k) => { if (!drake) return; for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['w1' + S], 0, sd * 0.2 * (1 - k), sd * 0.6 * k); P.e(J['w2' + S], 0, -sd * 0.2, sd * 0.2 * k); } };
    const m = {
      beam: () => ({ dur: 2.4, hit: 0.8, keys: [[0, none], [0.5, (P) => { P.e(J.neck1, -0.3); P.e(J.neck2, -0.25); P.e(J.head, -0.3); P.e(J.jaw, 0.2); wingsUp(P, 0.6); }, 'o'], [0.8, (P) => { P.e(J.neck1, 0.25); P.e(J.neck2, 0.2); P.e(J.head, 0.15); P.e(J.jaw, 0.8); wingsUp(P, 0.8); }, 'i'], [2.0, (P) => { P.e(J.neck1, 0.25, 0.2, 0); P.e(J.neck2, 0.2); P.e(J.head, 0.15); P.e(J.jaw, 0.8); wingsUp(P, 0.8); }], [2.4, none]], fadeOut: 0.4 }),
      charge: () => ({ dur: 1.5, hit: 0.75, keys: [[0, none], [0.45, (P) => { P.addOff(J.body, 0, -0.25, -0.4); P.e(J.neck1, 0.3); P.e(J.head, -0.2); for (const S of ['L', 'R']) { P.e(J['bu' + S], -0.6); P.e(J['bl' + S], 0.9); P.e(J['fu' + S], 0.3); } wingsUp(P, 0.3); }, 'o'], [0.75, (P) => { P.addOff(J.body, 0, 0.3, 1.6); P.e(J.body, -0.25); P.e(J.neck1, 0.2); P.e(J.head, 0.2); P.e(J.jaw, 0.7); for (const S of ['L', 'R']) { P.e(J['fu' + S], -0.9); P.e(J['fl' + S], 0.2); P.e(J['bu' + S], 0.5); } wingsUp(P, 1); }, 'i'], [1.0, (P) => { P.addOff(J.body, 0, 0, 1.2); P.e(J.jaw, 0.3); wingsUp(P, 0.6); }], [1.5, none]], fadeOut: 0.4 }),
      sweep: () => ({ dur: 1.6, hit: 0.85, keys: [[0, none], [0.5, (P) => { P.e(J.body, 0, 0.35, 0); for (let i = 0; i < 5; i++) P.e(J['tail' + i], 0.05, -0.25, 0); P.e(J.neck1, 0, -0.3, 0); }, 'o'], [0.85, (P) => { P.e(J.body, 0, -0.5, 0); for (let i = 0; i < 5; i++) P.e(J['tail' + i], 0.05, 0.35, 0); P.e(J.neck1, 0, 0.3, 0); }, 'i'], [1.1, (P) => { P.e(J.body, 0, -0.45, 0); for (let i = 0; i < 5; i++) P.e(J['tail' + i], 0.05, 0.3, 0); }], [1.6, none]], fadeOut: 0.4 }),
      roar: () => ({ dur: 2.0, hit: 0.7, keys: [[0, none], [0.45, (P) => { P.e(J.body, -0.35); P.addOff(J.body, 0, 0.35, -0.3); for (const S of ['L', 'R']) { P.e(J['fu' + S], -1.0); P.e(J['fl' + S], 1.0); P.e(J['bu' + S], 0.3); } P.e(J.neck1, -0.35); P.e(J.head, -0.3); P.e(J.jaw, 0.3); wingsUp(P, 1); }, 'o'], [0.7, (P) => { P.e(J.body, -0.4); P.addOff(J.body, 0, 0.4, -0.3); for (const S of ['L', 'R']) { P.e(J['fu' + S], -1.1); P.e(J['fl' + S], 1.1); P.e(J['bu' + S], 0.35); } P.e(J.neck1, -0.2); P.e(J.head, -0.5); P.e(J.jaw, 0.95); wingsUp(P, 1.2); }, 'i'], [1.5, (P) => { P.e(J.body, -0.38); P.addOff(J.body, 0, 0.38, -0.3); for (const S of ['L', 'R']) { P.e(J['fu' + S], -1.05); P.e(J['fl' + S], 1.0); P.e(J['bu' + S], 0.33); } P.e(J.neck1, -0.2); P.e(J.head, -0.5); P.e(J.jaw, 0.95); wingsUp(P, 1.2); }], [2.0, none]], fadeOut: 0.45 }),
      volley: () => ({ dur: 1.7, hit: 0.5, keys: [[0, none], [0.3, (P) => { P.e(J.neck1, -0.2); P.e(J.head, -0.2); wingsUp(P, 0.8); }, 'o'], [0.5, (P) => { P.e(J.neck1, 0.15); P.e(J.head, 0.2); P.e(J.jaw, 0.7); wingsUp(P, 0.4); }, 'i'], [0.8, (P) => { P.e(J.neck1, -0.15, 0.3); P.e(J.jaw, 0.2); wingsUp(P, 0.9); }], [1.0, (P) => { P.e(J.neck1, 0.15, 0.3); P.e(J.head, 0.2); P.e(J.jaw, 0.7); wingsUp(P, 0.4); }, 'i'], [1.25, (P) => { P.e(J.neck1, -0.15, -0.3); P.e(J.jaw, 0.2); wingsUp(P, 0.9); }], [1.45, (P) => { P.e(J.neck1, 0.15, -0.3); P.e(J.head, 0.2); P.e(J.jaw, 0.7); wingsUp(P, 0.4); }, 'i'], [1.7, none]], fadeOut: 0.3 }),
      summon: () => ({ dur: 1.8, hit: 0.9, keys: [[0, none], [0.5, (P) => { P.e(J.body, -0.15); P.e(J.neck1, -0.3); P.e(J.neck2, -0.2); P.e(J.head, -0.4); }, 'o'], [0.9, (P) => { P.e(J.body, -0.2); P.addOff(J.body, 0, 0.15, 0); P.e(J.neck1, -0.4); P.e(J.neck2, -0.3); P.e(J.head, -0.6); P.e(J.jaw, 0.5); }, 'i'], [1.4, (P) => { P.e(J.body, -0.2); P.addOff(J.body, 0, 0.15, 0); P.e(J.neck1, -0.4); P.e(J.head, -0.6); P.e(J.jaw, 0.5); }], [1.8, none]], fadeOut: 0.4 }),
    };
    if (!drake) {
      m.roar = () => ({ dur: 2.0, hit: 0.7, keys: [[0, none], [0.45, (P) => { P.e(J.body, 0.06); P.e(J.neck1, 0.25); P.e(J.neck2, 0.15); P.e(J.head, 0.2); P.e(J.jaw, 0.1); }, 'o'], [0.7, (P) => { P.e(J.body, -0.14); P.addOff(J.body, 0, 0.12, -0.05); P.e(J.neck1, -0.35); P.e(J.neck2, -0.2); P.e(J.head, -0.45); P.e(J.jaw, 0.65); for (const S of ['L', 'R']) { P.e(J['bu' + S], 0.15); P.e(J['bl' + S], 0.5); } }, 'i'], [1.5, (P) => { P.e(J.body, -0.14); P.addOff(J.body, 0, 0.12, -0.05); P.e(J.neck1, -0.33, 0.1, 0); P.e(J.neck2, -0.2); P.e(J.head, -0.45, 0, 0.06); P.e(J.jaw, 0.65); for (const S of ['L', 'R']) { P.e(J['bu' + S], 0.15); P.e(J['bl' + S], 0.5); } }], [2.0, none]], fadeOut: 0.45 });
      m.sweep = () => ({ dur: 1.3, hit: 0.65, keys: [[0, none], [0.4, (P) => { P.e(J.fuR, -1.4, 0, -0.5); P.e(J.flR, 1.2); P.e(J.body, 0, 0.2, 0.1); P.e(J.neck1, 0, 0.2, 0); }, 'o'], [0.65, (P) => { P.e(J.fuR, -0.9, 0, 0.4); P.e(J.flR, 0.2); P.e(J.body, 0, -0.25, -0.05); P.e(J.neck1, 0, -0.2, 0); }, 'i'], [0.9, (P) => { P.e(J.fuR, -0.5, 0, 0.3); P.e(J.flR, 0.2); P.e(J.body, 0, -0.2, 0); }], [1.3, none]], fadeOut: 0.35 }); }
    return m;
  };
}

// ------------------------------------------------------------------ factory
const BOSS_MOVES = {
  treant: ['slam', 'sweep', 'stomp', 'summon', 'roar'],
  serpent: ['beam', 'charge', 'sweep', 'volley', 'roar'],
  golem: ['slam', 'stomp', 'volley', 'roar'],
  giant: ['slam', 'sweep', 'stomp', 'volley', 'roar'],
  colossus: ['slam', 'stomp', 'beam', 'summon', 'roar'],
  drake: ['beam', 'charge', 'sweep', 'roar', 'volley'],
  sphinx: ['beam', 'charge', 'sweep', 'summon', 'roar'],
  king: ['summon', 'volley', 'sweep', 'beam', 'roar'],
  reaper: ['sweep', 'slam', 'charge', 'summon', 'roar'],
};
export function createBoss(bossDef, { quality = 'high' } = {}) {
  const q = quality === 'low' ? 0.65 : 1;
  const shape = bossDef.shape || 'golem';
  const size = bossDef.size || 5;
  const key = shape + '|' + bossDef.name + '|' + bossDef.color + '|' + bossDef.accent + '|' + q;
  const build = {
    treant: () => treantT(bossDef, q), golem: () => magmaT(bossDef, q), giant: () => giantT(bossDef, q), colossus: () => colossusT(bossDef, q),
    king: () => kingT(bossDef, q), reaper: () => reaperT(bossDef, q), serpent: () => serpentT(bossDef, q), drake: () => beastT(bossDef, q, 'drake'), sphinx: () => beastT(bossDef, q, 'sphinx'),
  }[shape] || (() => magmaT(bossDef, q));
  let T = TPL.get(key);
  if (!T) { T = build(); TPL.set(key, T); }
  const which = BOSS_MOVES[shape] || BOSS_MOVES.golem;
  let boss;
  if (shape === 'serpent') {
    const k = size / 5;
    boss = new CustomBoss(T.tpl, { k, height: 5.0, radius: 1.6, hitHeight: 5.4, poses: serpentPoses(T.N), moveDefs: serpentMoves(T.N), mouthBone: 'head', mouthPos: V3(T.hp.x, T.hp.y - 0.05, T.hp.z + 0.75), hurtBone: 's0', stride: 4 });
  } else if (shape === 'drake' || shape === 'sphinx') {
    const h0 = shape === 'drake' ? 4.2 : 3.4;
    const k = size / h0;
    const mouthPos = shape === 'drake' ? V3(0, T.Y + 1.92, 2.95) : V3(0, T.Y + 1.15, 2.0);
    boss = new CustomBoss(T.tpl, { k, height: h0, radius: 1.6, hitHeight: h0 + 0.4, poses: beastPoses(shape), moveDefs: (J) => { const all = beastMoves(shape)(J); const o = {}; for (const w of which) o[w] = all[w]; return o; }, mouthBone: 'head', mouthPos, hurtBone: 'body', stride: 3.2 });
  } else {
    const cfg = {
      treant: { h0: 2.55, rad: 0.7, mouth: V3(0, 1.36, 0.3), mouthBone: 'chest', glass: 0.7 },
      golem: { h0: 1.95, rad: 0.65, mouth: V3(0, 1.61, 0.17), mouthBone: 'head' },
      giant: { h0: 1.92, rad: 0.55, mouth: V3(0, 1.62, 0.12), mouthBone: 'head' },
      colossus: { h0: 1.9, rad: 0.65, mouth: V3(0, 1.72, 0.16), mouthBone: 'head' },
      king: { h0: 1.95, rad: 0.5, mouth: V3(0, 1.64, 0.12), mouthBone: 'head' },
      reaper: { h0: 1.95, rad: 0.5, mouth: V3(0, 1.66, 0.12), mouthBone: 'head', glass: 0.42 },
    }[shape];
    const k = size / cfg.h0;
    boss = new HumanBoss(T, {
      k, height: cfg.h0, radius: cfg.rad, hitHeight: cfg.h0 + 0.2, mouthPos: cfg.mouth, mouthBone: cfg.mouthBone, glassOpacity: cfg.glass,
      poses: (base, J, K, D) => heavyPoses(base, J, K, D, shape === 'treant' ? { walk: (P) => { P.r(J.spine, 0.04); } } : (shape === 'giant' || shape === 'king' || shape === 'reaper') ? { idle: (P, t) => K.arm(P, 'R', -0.25, 0.15, 0.22, -1.15, 0.3, -0.3), walk: (P, t, c) => K.arm(P, 'R', -0.25 - 0.1 * Math.sin(c.phase), 0.15, 0.22, -1.15, 0.3, -0.3) } : {}),
      moveDefs: (J, K, D) => humanMoves(J, K, D, which),
      prop: (rig) => { rig.ctx.armed = shape === 'giant' || shape === 'king' || shape === 'reaper'; },
    });
  }
  boss.kind = shape; boss.def = bossDef;
  return boss;
}
