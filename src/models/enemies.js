// enemies.js - every monster & night creature. createEnemy(def, { quality }) -> Mob (see CONTRACTS.md)
// Shapes: slime, quadruped, golem, insect, flyer, humanoid, serpent. Variants are picked from def.name.
import * as THREE from 'three';
import {
  Builder, atlasMaterial, instantiate, jointMap, Animator, applyLook, Spring,
  limb, lathe, blob, rbox, tube, param, sphere, torus, cone, cylinder, twoSided, toFlat, bumpy, deform,
  col, shade, mixc, rng, hashStr, clamp, lerp, smooth, sstep, TAU, deepen, isLight,
} from './rigkit.js';
import { createBoss } from './bosses.js';
import { humanDims, humanBones, swordGeometry, SWORD_LENGTH } from './human.js';
import { HumanRig, poseKit } from './humanAnim.js';
import { SWORDS } from '../data.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const TPL = new Map();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function matDir(pos, dir, scl = 1) {
  _q.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
  if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  return new THREE.Matrix4().compose(_p.set(pos.x, pos.y, pos.z), _q, _s);
}
// tapered tube between two points
function seg(a, b, r0, r1, n = 8, caps = true) {
  const pts = [a, a.clone().lerp(b, 0.5), b];
  return tube(pts, (t) => lerp(r0, r1, t), n, { caps });
}
const has = (name, ...w) => w.some((x) => name.toLowerCase().includes(x));

// ------------------------------------------------------------------ Mob base (custom skinned rigs)
const GENERIC_HURT = (bone) => ({
  dur: 0.32, layer: 'hurt', weight: 0.9, fadeIn: 0.03, fadeOut: 0.2, keys: [
    [0, () => {}],
    [0.07, (P) => { P.r(bone, -0.18, 0, 0.06); P.addOff(bone, 0, 0.0, -0.05); }, 'o'],
    [0.32, () => {}],
  ],
});
class MobBase {
  constructor(tpl, o) {
    this.root = new THREE.Object3D(); this.root.name = 'mob';
    this.inner = new THREE.Object3D(); this.inner.scale.setScalar(o.size); this.root.add(this.inner);
    this.mats = { main: atlasMaterial() };
    if (tpl.geos.glass) this.mats.glass = atlasMaterial({ transparent: true, opacity: o.glassOpacity ?? 0.6, depthWrite: o.glassDepth ?? false, side: THREE.FrontSide });
    const inst = instantiate(tpl, this.mats);
    if (inst.meshes.glass) { inst.meshes.glass.castShadow = !!o.glassShadow; inst.meshes.glass.renderOrder = 2; }
    this.inst = inst; this.inner.add(inst.holder);
    this.J = jointMap(tpl);
    this.anim = new Animator(inst.bones, tpl.bones.map((b) => b.local));
    this.anim.poses = o.poses(this.J);
    this.makeActions = o.actions(this.J);
    this.ctx = { speed: 0, phase: 0, t: Math.random() * 10, pose: 'idle', moveRate: o.moveRate || 1, size: o.size };
    this.height = o.height * o.size; this.radius = o.radius * o.size; this.hitHeight = o.hitHeight * o.size;
    this.frozen = false; this.tint = null; this.flash = 0; this.glow = 1;
    this.hurtBone = this.J[o.hurtBone || 'body'];
    this.anim.setPose('idle');
    this.anim.update(0, this.ctx);
    this.def = o.def;
  }
  setPose(name) {
    if (name === 'walk' || name === 'run') name = 'move';
    if (!this.anim.poses[name] || name === this.ctx.pose) return;
    this.anim.setPose(name, name === 'dead' ? 0.1 : 0.25);
    if (name === 'dead') this.anim.clearActions();
    this.ctx.pose = name;
  }
  setMoveSpeed(mps) { this.ctx.speed = Math.max(0, mps || 0); }
  attack() {
    const a = this.makeActions.attack();
    if (this.ctx.pose !== 'dead') this.anim.play({ ...a, layer: 'action' });
    return { duration: a.dur, hitTime: a.hit };
  }
  hurt() {
    if (this.ctx.pose === 'dead') return;
    this.anim.play(this.makeActions.hurt ? this.makeActions.hurt() : GENERIC_HURT(this.hurtBone));
    this.flash = 1; this._look();
  }
  setFrozen(b) { this.frozen = !!b; this._look(); }
  setTint(hex) { this.tint = hex || null; this._look(); }
  _look() { applyLook(Object.values(this.mats), { frozen: this.frozen, tint: this.tint, flash: this.flash, glow: this.glow, rim: this.baseRim }); }
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 5); this._look(); }
    if (this.frozen) return;
    const c = this.ctx;
    c.t += dt;
    c.phase += dt * TAU * Math.max(c.speed, 0.8) * c.moveRate / Math.max(0.3, c.size);
    this.anim.update(dt, c);
  }
  dispose() {
    this.root.removeFromParent();
    this.inst.skeleton.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

// Humanoid monsters reuse the human rig & animation (skeleton warrior, wraith, stalker)
class HumanMob {
  constructor(rig, o) {
    this.rig = rig; this.root = rig.root;
    this.height = o.height; this.radius = o.radius; this.hitHeight = o.hitHeight;
    this.mats = [rig.material, ...(o.extraMats || [])];
    this.frozen = false; this.tint = null; this.flash = 0; this.pose = 'idle';
    this.runSpeed = o.runSpeed ?? 3.2; this.attacks = o.attacks || [0, 1, 2]; this.n = 0;
    this.customAttack = o.customAttack || null;
  }
  setPose(name) {
    this.pose = name;
    if (name === 'move') name = this.rig.ctx.speed > this.runSpeed ? 'run' : 'walk';
    this.rig.setPose(name);
  }
  setMoveSpeed(mps) { this.rig.setMoveSpeed(mps); if (this.pose === 'move') this.setPose('move'); }
  attack() {
    if (this.customAttack) { const a = this.customAttack(); this.rig.anim.play({ ...a, layer: 'action' }); return { duration: a.dur, hitTime: a.hit }; }
    const r = this.rig.attack(this.attacks[this.n++ % this.attacks.length]);
    return { duration: r.duration, hitTime: r.hitTime };
  }
  hurt() { this.rig.hurt(); }
  setFrozen(b) { this.frozen = !!b; this._look(); }
  setTint(hex) { this.tint = hex || null; this._look(); }
  _look() { applyLook(this.mats, { frozen: this.frozen, tint: this.tint, flash: this.rig._flash, rim: this.baseRim }); }
  update(dt) {
    if (this.frozen) { if (this.rig._flash > 0) { this.rig._flash = Math.max(0, this.rig._flash - dt * 5); this._look(); } return; }
    const f = this.rig._flash;
    this.rig.update(dt);
    if (f > 0 || this.tint || this.baseRim) this._look();
  }
  dispose() { this.rig.dispose(); for (const m of this.mats.slice(1)) m.dispose(); }
}

// ------------------------------------------------------------------ SLIME
function slimeTemplate(def, q) {
  const B = new Builder({ seed: hashStr(def.name) });
  B.bone('body', null, 0, 0, 0);
  const c = col(def.color);
  const magma = has(def.name, 'magma', 'lava', 'fire'), sea = has(def.name, 'sea', 'water', 'aqua');
  const shell = blob(0.46, 0.4, 0.46, 1, 1, Math.round(26 * q), Math.round(18 * q), (p) => {
    if (p.y < -0.15) p.y = -0.15 + (p.y + 0.15) * 0.45;
    const k = 1 + 0.04 * Math.sin(p.x * 14) * Math.sin(p.z * 12);
    p.x *= k; p.z *= k;
  });
  B.add(shell, { slot: 'glass', pos: [0, 0.36, 0], cell: 'gloss', color: c, rough: 0.12, glow: magma ? 0.45 : 0.08 });
  // core & bubbles inside
  B.add(sphere(0.15, 16, 12), { pos: [0, 0.3, -0.02], cell: magma ? 'rock' : 'gloss', color: magma ? '#ffb030' : sea ? '#f4f0ff' : shade(c, 0.55), rough: sea ? 0.1 : 0.3, metal: sea ? 0.5 : 0, glow: magma ? 2.2 : sea ? 0.25 : 0.15 });
  const R = rng(3);
  for (let i = 0; i < 7; i++) B.add(sphere(0.02 + R() * 0.03, 8, 6), { pos: [(R() - 0.5) * 0.5, 0.15 + R() * 0.35, (R() - 0.5) * 0.45], cell: 'gloss', color: mixc(c, '#ffffff', 0.6), rough: 0.1, glow: magma ? 1.2 : 0.2 });
  if (magma) for (let i = 0; i < 8; i++) { const a = R() * TAU; B.add(toFlat(bumpy(blob(0.07, 0.03, 0.06, 1, 1, 8, 6), 0.02, 20, i)), { pos: [Math.sin(a) * 0.36, 0.45 + R() * 0.15, Math.cos(a) * 0.36], rot: [R(), a, R()], cell: 'rock', color: '#2a1a14' }); }
  // eyes on the front surface
  const eye = col(def.eyes || (magma ? '#ffe680' : '#101418'));
  const glowEye = !!def.eyes || magma;
  for (const sd of [-1, 1]) {
    B.add(sphere(0.07, 14, 10), { pos: [sd * 0.14, 0.5, 0.36], scl: [0.8, 1.1, 0.45], rot: [0, sd * 0.35, 0], cell: 'gloss', color: eye, rough: 0.05, glow: glowEye ? 2 : 0 });
    B.add(sphere(0.022, 8, 6), { pos: [sd * 0.14 + 0.02, 0.54, 0.395], cell: 'gloss', color: '#ffffff', glow: 1.0 });
  }
  B.add(tube([V3(-0.07, 0.38, 0.425), V3(0, 0.355, 0.44), V3(0.07, 0.38, 0.425)], 0.012, 6), { cell: 'gloss', color: shade(c, 0.25), rough: 0.2 });
  return B.build();
}
function slimePoses(J) {
  return {
    idle(P, t) { const b = Math.sin(t * 2.4); P.sc(J.body, 1 - 0.035 * b, 1 + 0.06 * b, 1 - 0.035 * b); P.e(J.body, 0.03 * Math.sin(t * 1.3), 0, 0.04 * Math.sin(t * 1.7)); },
    move(P, t, c) {
      const ph = (c.phase / TAU) % 1;                       // one hop per cycle
      const air = sstep(0.18, 0.3, ph) * (1 - sstep(0.72, 0.84, ph));
      const h = Math.sin(clamp((ph - 0.22) / 0.58, 0, 1) * PI) * 0.32;
      const sq = ph < 0.22 ? Math.sin(ph / 0.22 * PI) : ph > 0.8 ? Math.sin((ph - 0.8) / 0.2 * PI) : 0;
      const st = air * Math.sin(clamp((ph - 0.22) / 0.58, 0, 1) * PI);
      P.off(J.body, 0, h, 0);
      P.sc(J.body, 1 + 0.18 * sq - 0.1 * st, 1 - 0.28 * sq + 0.22 * st, 1 + 0.18 * sq - 0.1 * st);
      P.e(J.body, -0.2 * st + 0.1 * sq, 0, 0);
    },
    dead(P, t) { const u = sstep(0, 0.5, t); P.sc(J.body, 1 + 0.6 * u, 1 - 0.82 * u, 1 + 0.6 * u); P.e(J.body, 0, 0, 0); },
  };
}
const slimeActions = (J) => ({
  attack: () => ({ dur: 0.65, hit: 0.34, keys: [
    [0, () => {}],
    [0.22, (P) => { P.sc(J.body, 1.25, 0.65, 1.25); P.off(J.body, 0, 0, -0.08); }, 'o'],
    [0.34, (P) => { P.sc(J.body, 0.85, 1.3, 1.05); P.off(J.body, 0, 0.22, 0.45); P.e(J.body, 0.35, 0, 0); }, 'i'],
    [0.48, (P) => { P.sc(J.body, 1.15, 0.85, 1.15); P.off(J.body, 0, 0, 0.3); }],
    [0.65, () => {}]] }),
  hurt: () => ({ dur: 0.35, layer: 'hurt', fadeIn: 0.02, fadeOut: 0.2, keys: [[0, () => {}], [0.08, (P) => { P.sc(J.body, 1.2, 0.75, 1.2); }, 'o'], [0.2, (P) => { P.sc(J.body, 0.92, 1.12, 0.92); }], [0.35, () => {}]] }),
});

// ------------------------------------------------------------------ QUADRUPED (wolf / hound / coyote / lizard / bone hound)
function quadKind(def) {
  const n = def.name.toLowerCase();
  if (n.includes('lizard')) return 'lizard';
  if (n.includes('bone')) return 'bone';
  if (n.includes('coyote')) return 'coyote';
  if (n.includes('hound')) return 'hound';
  return 'wolf';
}
function quadTemplate(def, q) {
  const kind = quadKind(def);
  const lizard = kind === 'lizard', bone = kind === 'bone';
  const B = new Builder({ seed: hashStr(def.name) });
  const Y = lizard ? 0.42 : 0.7;                     // body height
  const legU = lizard ? 0.22 : 0.28, legL = lizard ? 0.2 : 0.3;
  const c = col(def.color), belly = mixc(c, '#e8e0d0', kind === 'wolf' || kind === 'coyote' ? 0.45 : 0.15);
  const n = def.name.toLowerCase();
  const glowC = col(def.eyes || (n.includes('ember') ? '#ffb030' : n.includes('storm') ? '#9fb4ff' : bone ? '#6affc8' : lizard ? '#ffd060' : '#ffc040'));
  const ember = n.includes('ember'), storm = n.includes('storm'), dread = n.includes('dread'), snow = n.includes('snow');
  const LZ = lizard ? 1.15 : 1;
  B.bone('body', null, 0, Y, 0);
  B.bone('chest', 'body', 0, Y + 0.02, 0.28 * LZ);
  B.bone('neck', 'chest', 0, Y + 0.1, 0.44 * LZ);
  B.bone('head', 'neck', 0, Y + (lizard ? 0.1 : 0.24), 0.6 * LZ);
  B.bone('jaw', 'head', 0, Y + (lizard ? 0.07 : 0.2), 0.66 * LZ);
  B.bone('earL', 'head', 0.055, Y + 0.33, 0.58 * LZ); B.bone('earR', 'head', -0.055, Y + 0.33, 0.58 * LZ);
  B.bone('pelvis', 'body', 0, Y, -0.3 * LZ);
  const tailN = lizard ? 4 : 3;
  for (let i = 0; i < tailN; i++) B.bone('tail' + i, i ? 'tail' + (i - 1) : 'pelvis', 0, Y + 0.06 - i * (lizard ? 0.06 : 0.1), (-0.47 - i * (lizard ? 0.28 : 0.22)) * LZ);
  const legX = lizard ? 0.15 : 0.11;
  for (const [F, par, z] of [['f', 'chest', 0.3 * LZ], ['b', 'pelvis', -0.32 * LZ]]) {
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      B.bone(F + 'u' + S, par, sd * legX, Y - 0.06, z);
      B.bone(F + 'l' + S, F + 'u' + S, sd * legX, Y - 0.06 - legU, z);
      B.bone(F + 'p' + S, F + 'l' + S, sd * legX, Y - 0.06 - legU - legL, z);
    }
  }
  const cell = lizard ? 'scales' : bone ? 'bone' : 'fur';
  const NU = Math.round(18 * q), NV = Math.round(16 * q);
  const zW = B.ladder('z', [['pelvis', -0.28 * LZ], ['body', 0], ['chest', 0.26 * LZ]]);
  if (!bone) {
    // torso
    const torso = param(NU, NV, (u, v, o) => {
      const z = lerp(-0.52, 0.46, v) * LZ, a = -PI + u * TAU;
      const t = (z / LZ + 0.52) / 0.98;
      const close = Math.pow(Math.sin(clamp(t, 0, 1) * PI), 0.35);
      let rx = (lizard ? 0.15 : 0.14) + 0.04 * Math.sin(t * PI) + 0.03 * sstep(0.5, 0.75, t);
      let ry = (lizard ? 0.1 : 0.16) + (lizard ? 0.02 : 0.09) * sstep(0.45, 0.75, t);
      const cy = Y + (lizard ? 0 : 0.0 - 0.06 * sstep(0.45, 0.8, t) + 0.03 * sstep(0.2, 0.45, t));
      rx *= close; ry *= close;
      o.set(Math.sin(a) * rx, cy + Math.cos(a) * ry, z);
    }, { lu: 0.9, lv: 1.0 * LZ });
    B.add(torso, { cell, color: c, w: zW, colorFn: (p, nn, cc) => (nn.y < -0.35 ? cc.copy(belly) : cc) });
    // neck
    B.add(tube([V3(0, Y + 0.05, 0.3 * LZ), V3(0, Y + (lizard ? 0.07 : 0.14), 0.45 * LZ), V3(0, Y + (lizard ? 0.1 : 0.24), 0.58 * LZ)], (t) => lerp(lizard ? 0.12 : 0.13, lizard ? 0.085 : 0.085, t), 10), { cell, color: c, w: B.ladder('z', [['chest', 0.34 * LZ], ['neck', 0.46 * LZ], ['head', 0.56 * LZ]]) });
    // haunches
    for (const sd of [-1, 1]) B.add(blob(0.07, lizard ? 0.08 : 0.13, 0.11, 1, 1, 12, 8), { pos: [sd * (legX + 0.01), Y - (lizard ? 0.02 : 0.06), -0.32 * LZ], cell, color: c, bone: 'bu' + (sd > 0 ? 'L' : 'R') });
    // tail
    const tp = [];
    for (let i = 0; i <= tailN; i++) tp.push(V3(0, Y + 0.06 - i * (lizard ? 0.06 : 0.11) - (i === tailN ? 0.05 : 0), (-0.45 - i * (lizard ? 0.28 : 0.22)) * LZ));
    const tw = B.ladder('z', [...Array(tailN).keys()].reverse().map((i) => ['tail' + i, (-0.5 - i * (lizard ? 0.28 : 0.22)) * LZ]).concat([['pelvis', -0.4 * LZ]]));
    B.add(tube(tp, (t) => (lizard ? lerp(0.1, 0.012, t) : kind === 'hound' ? lerp(0.05, 0.03, t) : 0.04 + 0.04 * Math.sin(t * PI * 0.9)), 9), { cell, color: kind === 'wolf' || kind === 'coyote' ? mixc(c, '#20201c', 0.15) : c, w: tw, colorFn: kind === 'wolf' || kind === 'coyote' ? (p, nn, cc) => (p.z < -1.05 ? cc.copy(shade(c, 0.35)) : cc) : null });
  } else {
    // bone hound: spine, ribs, pelvis, tail vertebrae
    const spine = [];
    for (let i = 0; i <= 10; i++) spine.push(V3(0, Y + 0.08 + 0.03 * Math.sin(i / 10 * PI), lerp(-0.42, 0.42, i / 10)));
    B.add(tube(spine, 0.035, 8), { cell, color: c, w: zW });
    for (let i = 0; i < 11; i++) B.add(sphere(0.045, 8, 6), { pos: [0, spine[i].y + 0.02, spine[i].z], scl: [0.8, 1, 0.6], cell, color: c, w: zW });
    for (let i = 0; i < 6; i++) {
      const z = 0.06 + i * 0.065, r = 0.15 - Math.abs(i - 2) * 0.012;
      for (const sd of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 6; k++) { const a = k / 6 * 2.6; pts.push(V3(sd * Math.sin(a) * r * 0.9, Y + 0.08 - (1 - Math.cos(a)) * r * 0.85, z + 0.02 * Math.sin(a))); }
        B.add(tube(pts, 0.013, 6), { cell, color: c, bone: 'chest' });
      }
    }
    B.add(rbox(0.22, 0.12, 0.16, 0.5, 10, 8), { pos: [0, Y + 0.02, -0.33], cell, color: c, bone: 'pelvis' });
    B.add(tube([V3(0, Y + 0.08, 0.38), V3(0, Y + 0.17, 0.5), V3(0, Y + 0.24, 0.6)], 0.03, 6), { cell, color: c, w: B.ladder('z', [['chest', 0.4], ['neck', 0.48], ['head', 0.57]]) });
    for (let i = 0; i < 9; i++) { const t = i / 8; B.add(sphere(0.03 - t * 0.015, 8, 6), { pos: [0, Y + 0.06 - t * 0.25, -0.46 - t * 0.6], cell, color: c, w: B.ladder('z', [['tail2', -0.92], ['tail1', -0.7], ['tail0', -0.5], ['pelvis', -0.4]]) }); }
  }
  // head
  const hy = Y + (lizard ? 0.1 : 0.24), hz = 0.6 * LZ;
  const headCell = bone ? 'bone' : cell;
  if (lizard) {
    B.add(blob(0.09, 0.06, 0.12, 0.9, 1, 14, 10), { pos: [0, hy + 0.01, hz + 0.04], cell: headCell, color: c, bone: 'head' });
    B.add(blob(0.065, 0.035, 0.12, 0.9, 1, 12, 8), { pos: [0, hy, hz + 0.16], cell: headCell, color: c, bone: 'head' });
    B.add(blob(0.06, 0.025, 0.11, 0.9, 1, 12, 8), { pos: [0, hy - 0.035, hz + 0.14], cell: headCell, color: belly, bone: 'jaw' });
    for (const sd of [-1, 1]) B.add(sphere(0.022, 10, 8), { pos: [sd * 0.07, hy + 0.035, hz + 0.08], cell: 'gloss', color: glowC, glow: 1.6, bone: 'head' });
    // back crest
    for (let i = 0; i < 9; i++) { const z = lerp(-0.45, 0.5, i / 8) * LZ; B.add(cone(0.025, 0, 0.06 + 0.03 * Math.sin(i / 8 * PI), 6), { pos: [0, Y + 0.1 + 0.02 * Math.sin(i / 8 * PI), z], rot: [-0.4, 0, 0], cell: 'scales', color: shade(c, 0.7), w: zW }); }
  } else {
    const skull = bone ? '#e8e0cc' : c;
    B.add(blob(0.108, 0.098, 0.122, 1, 1, 14, 10), { pos: [0, hy + 0.02, hz + 0.02], cell: headCell, color: skull, bone: 'head' });
    const snoutL = kind === 'coyote' ? 0.24 : 0.2;
    B.add(tube([V3(0, hy + 0.0, hz + 0.06), V3(0, hy - 0.015, hz + 0.06 + snoutL * 0.6), V3(0, hy - 0.03, hz + 0.06 + snoutL)], (t) => lerp(0.07, 0.036, t), 10), { cell: headCell, color: skull, bone: 'head' });
    if (!bone) B.add(sphere(0.026, 10, 8), { pos: [0, hy - 0.02, hz + 0.06 + snoutL + 0.012], cell: 'gloss', color: '#141414', rough: 0.25, bone: 'head' });
    B.add(tube([V3(0, hy - 0.05, hz + 0.05), V3(0, hy - 0.06, hz + 0.05 + snoutL * 0.85)], (t) => lerp(0.047, 0.026, t), 8), { cell: headCell, color: bone ? skull : mixc(c, belly, 0.5), bone: 'jaw' });
    for (const sd of [-1, 1]) {
      B.add(cone(0.008, 0, 0.03, 5), { pos: [sd * 0.022, hy - 0.035, hz + 0.06 + snoutL * 0.8], rot: [PI, 0, 0], cell: 'bone', color: '#f2eee0', bone: 'head' });
      if (bone) {
        B.add(sphere(0.03, 10, 8), { pos: [sd * 0.045, hy + 0.035, hz + 0.09], scl: [1, 0.9, 0.6], cell: 'gloss', color: '#0a0a0c', rough: 0.4, bone: 'head' });
        B.add(sphere(0.014, 8, 6), { pos: [sd * 0.045, hy + 0.035, hz + 0.1], cell: 'gloss', color: glowC, glow: 3, bone: 'head' });
      } else {
        B.add(sphere(0.019, 10, 8), { pos: [sd * 0.05, hy + 0.04, hz + 0.1], scl: [1, 0.8, 0.8], cell: 'gloss', color: glowC, glow: dread || ember || storm || def.eyes ? 2.2 : 0.6, rough: 0.1, bone: 'head' });
        B.add(tube([V3(sd * 0.02, hy + 0.068, hz + 0.115), V3(sd * 0.06, hy + 0.07, hz + 0.09)], 0.009, 5), { cell, color: shade(c, 0.6), bone: 'head' });
        const ear = kind === 'coyote' ? [0.045, 0.13] : [0.036, 0.09];
        B.add(cone(ear[0], 0, ear[1], 6), { pos: [sd * 0.055, hy + 0.08, hz - 0.01], rot: [-0.15, 0, -sd * 0.3], scl: [1, 1, 0.5], cell, color: shade(c, 0.85), bone: 'ear' + (sd > 0 ? 'L' : 'R') });
      }
    }
    if (!bone) B.add(blob(0.1, 0.08, 0.08, 1, 1, 10, 8), { pos: [0, hy - 0.02, hz - 0.02], cell, color: kind === 'wolf' || snow ? mixc(c, belly, 0.6) : c, bone: 'head' });
  }
  // legs
  for (const [F, z] of [['f', 0.3 * LZ], ['b', -0.32 * LZ]]) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    const x = sd * legX, y0 = Y - 0.06;
    const lc = bone ? c : F === 'f' ? c : c;
    if (bone) {
      B.add(seg(V3(x, y0, z), V3(x, y0 - legU, z), 0.022, 0.018, 6), { cell: 'bone', color: c, bone: F + 'u' + S });
      B.add(sphere(0.03, 8, 6), { pos: [x, y0 - legU, z], cell: 'bone', color: c, bone: F + 'l' + S });
      B.add(seg(V3(x, y0 - legU, z), V3(x, y0 - legU - legL, z), 0.018, 0.015, 6), { cell: 'bone', color: c, bone: F + 'l' + S });
    } else {
      B.add(limb(legU, (t) => lerp(F === 'f' ? 0.072 : 0.08, 0.044, t), 10, 5, 3), { pos: [x, y0, z], cell, color: lc, bone: F + 'u' + S });
      B.add(limb(legL, (t) => lerp(0.042, 0.03, t), 8, 5, 3), { pos: [x, y0 - legU, z], cell, color: lc, bone: F + 'l' + S });
      if (F === 'f' && !lizard) B.add(blob(0.07, 0.13, 0.1, 1, 1, 12, 8), { pos: [x * 0.95, y0 + 0.02, z - 0.01], cell, color: c, bone: 'fu' + S });
    }
    B.add(blob(lizard ? 0.05 : 0.04, 0.028, lizard ? 0.07 : 0.055, 1, 1, 10, 6), { pos: [x, y0 - legU - legL - 0.01, z + 0.025], cell, color: bone ? c : shade(lc, 0.75), bone: F + 'p' + S });
    if (lizard) for (const k of [-1, 0, 1]) B.add(cone(0.008, 0, 0.04, 4), { pos: [x + k * 0.02, y0 - legU - legL - 0.025, z + 0.08], rot: [PI / 2, 0, 0], cell: 'bone', color: '#d8d0c0', bone: F + 'p' + S });
  }
  // manes & glowing streaks
  if (dread || ember || storm || kind === 'hound') {
    const R = rng(hashStr(def.name));
    for (let i = 0; i < 16; i++) {
      const t = i / 15, z = lerp(-0.25, 0.55, t), y = Y + (z > 0.3 ? 0.12 + (z - 0.3) * 0.6 : 0.13);
      const dir = V3((R() - 0.5) * 0.6, 1, -0.9).normalize();
      const glowSpike = ember || storm;
      B.add(cone(0.03, 0, 0.09 + R() * 0.07 + (z > 0.25 ? 0.05 : 0), 5), { m: matDir(V3((R() - 0.5) * 0.06, y, z), dir), cell: glowSpike ? 'gloss' : 'fur', color: ember ? '#ff7a20' : storm ? '#9fb4ff' : shade(c, 0.6), glow: glowSpike ? 1.4 : 0, w: B.ladder('z', [['pelvis', -0.2], ['body', 0], ['chest', 0.25], ['neck', 0.45]]) });
    }
    if (ember || storm) for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const z = -0.2 + i * 0.22;
      B.add(tube([V3(sd * 0.135, Y + 0.08, z - 0.06), V3(sd * 0.15, Y + 0.0, z), V3(sd * 0.13, Y - 0.07, z + 0.05)], 0.01, 5, { caps: true }), { cell: 'gloss', color: ember ? '#ff8a30' : '#a8b8ff', glow: 1.8, w: zW });
    }
  }
  if (snow) for (let i = 0; i < 8; i++) B.add(blob(0.07, 0.05, 0.08, 1, 1, 8, 6), { pos: [(i % 2 ? 1 : -1) * 0.05, Y + 0.12, 0.25 + i * 0.03], cell: 'fur', color: '#ffffff', bone: 'chest' });
  return { tpl: B.build(), kind, Y, legU, legL, LZ };
}
function quadPoses(J, info) {
  const { kind, LZ } = info;
  const lizard = kind === 'lizard';
  const legs = (P, ph, a, gal) => {
    for (const [F, S, off] of [['f', 'L', 0], ['b', 'R', 0], ['f', 'R', PI], ['b', 'L', PI]]) {
      const goff = gal ? (F === 'f' ? (S === 'L' ? 0 : 0.5) : PI + (S === 'L' ? 0.5 : 0)) : off;
      const p = ph + lerp(off, goff, gal);
      const sn = Math.sin(p), sw = Math.max(0, Math.cos(p + 0.4));
      const A = (lizard ? 0.45 : 0.4 + 0.25 * gal) * a;
      const sd = S === 'L' ? 1 : -1;
      if (lizard) {
        P.e(J[F + 'u' + S], -A * sn, 0.5 * A * sn * sd, sd * (0.95 + 0.25 * sw * a), 'XYZ');
        P.e(J[F + 'l' + S], 0, 0, -sd * (1.15 - 0.2 * sw * a));
        P.e(J[F + 'p' + S], 0, 0, sd * 0.2);
      } else if (F === 'f') {
        P.e(J['fu' + S], -A * sn + 0.05, 0, sd * 0.03);
        P.e(J['fl' + S], 0.05 + (0.9 + 0.4 * gal) * sw * a, 0, 0);
        P.e(J['fp' + S], -0.2 * sw * a + 0.05, 0, 0);
      } else {
        P.e(J['bu' + S], -A * sn - 0.35, 0, sd * 0.03);
        P.e(J['bl' + S], 0.65 + 0.5 * sw * a, 0, 0);
        P.e(J['bp' + S], -0.3 - 0.3 * sw * a + A * sn * 0.3, 0, 0);
      }
    }
  };
  const tail = (P, t, wag, lift = 0) => {
    for (let i = 0; i < 4; i++) if (J['tail' + i] >= 0) P.e(J['tail' + i], (lizard ? -0.03 : (i ? -0.15 : -0.65) + lift), Math.sin(t * (lizard ? 3 : 6) - i * 0.8) * wag * (1 + i * 0.3), 0);
  };
  return {
    idle(P, t) {
      const b = Math.sin(t * 2);
      P.off(J.body, 0, 0.005 * b, 0);
      P.e(J.chest, 0.01 * b);
      P.e(J.neck, lizard ? 0 : -0.05, 0.25 * Math.sin(t * 0.4), 0);
      P.e(J.head, 0.1 + 0.05 * Math.sin(t * 0.7), 0.15 * Math.sin(t * 0.55 + 1), 0.05 * Math.sin(t * 0.3));
      P.e(J.jaw, lizard ? 0.02 : 0.03 + 0.06 * Math.max(0, Math.sin(t * 3)) ** 4);
      P.e(J.earL, 0.1 * Math.max(0, Math.sin(t * 1.3 + 2)) ** 8); P.e(J.earR, 0.1 * Math.max(0, Math.sin(t * 1.1)) ** 8);
      legs(P, 0, 0, 0);
      tail(P, t, lizard ? 0.1 : 0.12);
    },
    move(P, t, c) {
      const sp = c.speed, gal = sstep(4.5, 6.5, sp / Math.max(0.5, c.size)), a = clamp(0.5 + sp * 0.12, 0.6, 1.2);
      const ph = c.phase * (lizard ? 0.8 : 0.5);
      P.off(J.body, 0, (0.02 * Math.cos(2 * ph) - 0.01) * a + gal * 0.03 * Math.sin(ph), 0);
      P.e(J.body, gal * 0.08 * Math.sin(ph + 0.5), lizard ? 0.15 * Math.sin(ph) : 0, lizard ? 0 : 0.03 * Math.sin(ph));
      P.e(J.chest, gal * 0.12 * Math.sin(ph), lizard ? -0.25 * Math.sin(ph) : 0);
      P.e(J.pelvis, -gal * 0.12 * Math.sin(ph), lizard ? -0.2 * Math.sin(ph) : 0);
      P.e(J.neck, (lizard ? 0 : 0.1) + 0.05 * Math.sin(2 * ph), lizard ? 0.15 * Math.sin(ph) : 0);
      P.e(J.head, 0.05 - 0.05 * Math.sin(2 * ph), 0, 0);
      P.e(J.jaw, 0.08 + 0.12 * gal);
      P.e(J.earL, -0.3 * gal); P.e(J.earR, -0.3 * gal);
      legs(P, ph, a, gal);
      tail(P, t, lizard ? 0.35 : 0.15, gal * 0.3);
    },
    dead(P, t) {
      const u = sstep(0, 0.6, t), f = u * u;
      P.e(J.body, 0, 0, 1.45 * f);
      P.off(J.body, -0.12 * f, -(info.Y - (lizard ? 0.08 : 0.13)) * Math.pow(u, 0.8), 0);
      P.e(J.neck, 0.2 * f, 0, 0.3 * f); P.e(J.head, 0.2 * f); P.e(J.jaw, 0.3 * f);
      legs(P, 0, 0, 0);
      for (const k of ['fuL', 'fuR', 'buL', 'buR']) P.r(J[k], 0.3 * f, 0, 0);
      tail(P, 0, 0, -0.3);
    },
  };
}
const quadActions = (J, info) => ({
  attack: () => ({ dur: 0.7, hit: 0.34, keys: [
    [0, () => {}],
    [0.2, (P) => { P.addOff(J.body, 0, -0.06, -0.12); P.e(J.chest, 0.1); P.e(J.neck, -0.25); P.e(J.head, 0.3); P.e(J.jaw, 0.1); P.r(J.buL, -0.3); P.r(J.buR, -0.3); }, 'o'],
    [0.34, (P) => { P.addOff(J.body, 0, 0.06, 0.38); P.e(J.chest, -0.15); P.e(J.neck, 0.35); P.e(J.head, -0.15); P.e(J.jaw, 0.75); P.r(J.fuL, -0.6); P.r(J.fuR, -0.5); P.r(J.buL, 0.4); P.r(J.buR, 0.4); }, 'i'],
    [0.46, (P) => { P.addOff(J.body, 0, 0, 0.3); P.e(J.neck, 0.25); P.e(J.head, 0.0); P.e(J.jaw, 0.05); }],
    [0.7, () => {}]] }),
});

// ------------------------------------------------------------------ GOLEM
function golemTemplate(def, q) {
  const n = def.name.toLowerCase();
  const coral = n.includes('coral'), ice = n.includes('ice') || n.includes('snow'), sand = n.includes('sand'), lava = n.includes('magma') || n.includes('lava');
  const c = col(def.color);
  const glowC = col(def.eyes || (coral ? '#fff0a0' : ice ? '#bff4ff' : sand ? '#ffd040' : '#ff8a2a'));
  const B = new Builder({ seed: hashStr(def.name), texScale: 1.2 });
  B.bone('hips', null, 0, 0.92, 0);
  B.bone('chest', 'hips', 0, 1.25, 0);
  B.bone('head', 'chest', 0, 1.74, 0.1);
  for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    B.bone('sh' + S, 'chest', sd * 0.48, 1.6, 0);
    B.bone('el' + S, 'sh' + S, sd * 0.56, 1.2, 0.02);
    B.bone('fi' + S, 'el' + S, sd * 0.58, 0.82, 0.04);
    B.bone('th' + S, 'hips', sd * 0.23, 0.84, 0);
    B.bone('kn' + S, 'th' + S, sd * 0.24, 0.46, 0.03);
    B.bone('ft' + S, 'kn' + S, sd * 0.24, 0.12, 0);
  }
  const cell = ice ? 'gloss' : 'rock';
  const ro = ice ? { rough: 0.15, metal: 0.1 } : { rough: 0.92 };
  let seed = 1;
  const rock = (rx, ry, rz, e = 0.55) => toFlat(bumpy(blob(rx, ry, rz, e, e, Math.round(10 * q) + 2, Math.round(7 * q) + 2), Math.min(rx, ry, rz) * 0.22, 3.2, seed++ * 3.1, 2));
  const add = (g, o) => B.add(g, { cell, color: o.color ?? c, ...ro, ...o });
  add(rock(0.5, 0.42, 0.36), { pos: [0, 1.42, 0], bone: 'chest' });
  add(rock(0.34, 0.24, 0.28), { pos: [0, 1.0, 0], bone: 'hips' });
  add(rock(0.24, 0.2, 0.22), { pos: [0, 1.16, 0.04], w: B.ladder('y', [['hips', 1.05], ['chest', 1.25]]) });
  add(rock(0.17, 0.14, 0.17), { pos: [0, 1.82, 0.12], bone: 'head' });
  for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    add(rock(0.26, 0.22, 0.24), { pos: [sd * 0.48, 1.62, 0], bone: 'sh' + S });
    add(rock(0.13, 0.22, 0.13), { pos: [sd * 0.53, 1.4, 0.01], bone: 'sh' + S });
    add(rock(0.17, 0.25, 0.17), { pos: [sd * 0.57, 1.04, 0.03], bone: 'el' + S });
    add(rock(0.2, 0.18, 0.2), { pos: [sd * 0.59, 0.74, 0.05], bone: 'fi' + S });
    add(rock(0.17, 0.22, 0.17), { pos: [sd * 0.23, 0.66, 0], bone: 'th' + S });
    add(rock(0.15, 0.2, 0.15), { pos: [sd * 0.24, 0.3, 0.02], bone: 'kn' + S });
    add(rock(0.18, 0.1, 0.24), { pos: [sd * 0.24, 0.09, 0.06], bone: 'ft' + S });
    // eyes
    B.add(sphere(0.035, 10, 8), { pos: [sd * 0.07, 1.84, 0.27], scl: [1.3, 0.5, 0.6], cell: 'gloss', color: glowC, glow: 3, bone: 'head' });
  }
  // glowing cracks on the chest
  const R = rng(hashStr(def.name) + 5);
  for (let i = 0; i < 7; i++) {
    const x0 = (R() - 0.5) * 0.6, y0 = 1.25 + R() * 0.35;
    const pts = [V3(x0, y0, 0.34)];
    for (let k = 1; k < 4; k++) { const p = pts[k - 1]; pts.push(V3(p.x + (R() - 0.5) * 0.14, p.y - 0.06 - R() * 0.05, 0.36 - Math.abs(p.x) * 0.25)); }
    pts.forEach((p) => { p.z = Math.sqrt(Math.max(0.01, 1 - (p.x / 0.5) ** 2 - ((p.y - 1.42) / 0.42) ** 2)) * 0.36 + 0.012; });
    B.add(tube(pts, 0.012, 4), { cell: 'gloss', color: glowC, glow: 2.2, bone: 'chest' });
  }
  B.add(sphere(0.09, 12, 10), { pos: [0, 1.45, 0.3], scl: [1, 1, 0.5], cell: 'gloss', color: glowC, glow: 2.5, bone: 'chest' });
  if (coral) for (let i = 0; i < 9; i++) {
    const sd = i % 2 ? 1 : -1, base = V3(sd * (0.25 + R() * 0.3), 1.65 + R() * 0.15, -0.1 + R() * 0.2);
    const pts = [base]; for (let k = 1; k < 4; k++) pts.push(pts[k - 1].clone().add(V3(sd * 0.05 + (R() - 0.5) * 0.08, 0.1, (R() - 0.5) * 0.08)));
    B.add(tube(pts, (t) => lerp(0.035, 0.015, t), 6), { cell: 'chitin', color: mixc(c, '#ffffff', 0.25), bone: 'chest' });
    B.add(sphere(0.025, 8, 6), { pos: [pts[3].x, pts[3].y, pts[3].z], cell: 'gloss', color: '#fff0c0', glow: 1.5, bone: 'chest' });
  }
  if (ice) for (let i = 0; i < 10; i++) {
    const sd = i % 2 ? 1 : -1, base = V3(sd * (0.2 + R() * 0.4), 1.6 + R() * 0.2, -0.15 + R() * 0.2);
    B.add(toFlat(cone(0.06, 0, 0.25 + R() * 0.2, 5)), { m: matDir(base, V3(sd * 0.5, 1, -0.3 + R() * 0.3)), cell: 'gloss', color: '#dff8ff', rough: 0.05, metal: 0.2, glow: 0.35, bone: 'chest' });
  }
  if (sand) for (let k = 0; k < 3; k++) B.add(torus(0.44 - k * 0.05, 0.012, 20, 4), { pos: [0, 1.25 + k * 0.12, 0], rot: [PI / 2, 0, 0], scl: [1, 0.8, 1], cell: 'gloss', color: glowC, glow: 1.6, bone: 'chest' });
  if (!coral && !ice && !sand) for (let i = 0; i < 6; i++) B.add(toFlat(blob(0.1, 0.03, 0.08, 1, 1, 8, 5)), { pos: [(R() - 0.5) * 0.7, 1.82 - R() * 0.1, -0.1 + (R() - 0.5) * 0.2], cell: 'fur', color: '#4a6a2a', bone: 'chest' });
  return B.build();
}
function golemPoses(J) {
  const legs = (P, ph, a) => {
    for (const [S, p] of [['L', ph], ['R', ph + PI]]) {
      const sn = Math.sin(p), sw = Math.max(0, Math.cos(p + 0.5));
      P.e(J['th' + S], -0.38 * sn * a, 0, 0);
      P.e(J['kn' + S], 0.05 + 0.6 * sw * a, 0, 0);
      P.e(J['ft' + S], 0.38 * sn * a - 0.6 * sw * a * 0.8, 0, 0);
    }
  };
  return {
    idle(P, t) {
      const b = Math.sin(t * 1.2);
      P.off(J.hips, 0, -0.01 + 0.006 * b, 0);
      P.e(J.chest, 0.05 + 0.02 * b, 0.05 * Math.sin(t * 0.4), 0);
      P.e(J.head, 0.05, 0.25 * Math.sin(t * 0.35), 0);
      for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['sh' + S], 0.05 + 0.03 * b, 0, sd * 0.12); P.e(J['el' + S], -0.25, 0, 0); }
      legs(P, 0, 0);
    },
    move(P, t, c) {
      const ph = c.phase * 0.5, a = 1;
      const sn = Math.sin(ph);
      P.off(J.hips, 0, -0.04 + 0.04 * Math.abs(Math.cos(ph)), 0);
      P.e(J.hips, 0.05, 0.12 * sn, 0.07 * sn);
      P.e(J.chest, 0.12, -0.18 * sn, -0.05 * sn);
      P.e(J.head, -0.05, 0.1 * sn, 0);
      for (const [sd, S, k] of [[1, 'L', 1], [-1, 'R', -1]]) { P.e(J['sh' + S], 0.4 * sn * k, 0, sd * 0.15); P.e(J['el' + S], -0.35 - 0.2 * Math.max(0, -sn * k), 0, 0); }
      legs(P, ph, a);
    },
    dead(P, t) {
      const u = sstep(0, 0.9, t), f = u * u;
      P.e(J.hips, 1.35 * f, 0, 0.1 * f);
      P.off(J.hips, 0, -0.62 * Math.pow(u, 0.9) - 0.15 * Math.sin(Math.min(1, t / 0.6) * PI) * (1 - u), 0.25 * f);
      P.e(J.chest, 0.3 * f); P.e(J.head, 0.3 * f);
      for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['sh' + S], -1.2 * f, 0, sd * 0.4 * f); P.e(J['el' + S], -0.2, 0, 0); P.e(J['th' + S], -1.0 * Math.sin(Math.min(1, t / 0.6) * PI) * (1 - f) - 1.2 * f, 0, 0); P.e(J['kn' + S], 1.4 * Math.sin(Math.min(1, t / 0.6) * PI) * (1 - f)); }
    },
  };
}
const golemActions = (J) => ({
  attack: () => ({ dur: 1.0, hit: 0.52, keys: [
    [0, () => {}],
    [0.36, (P) => { P.e(J.chest, -0.25); P.e(J.head, -0.1); for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['sh' + S], -2.7, 0, -sd * 0.25); P.e(J['el' + S], -0.5); } P.off(J.hips, 0, 0.03, 0); }, 'o'],
    [0.52, (P) => { P.e(J.chest, 0.6); P.e(J.head, 0.2); for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['sh' + S], -0.9, 0, -sd * 0.1); P.e(J['el' + S], -0.1); } P.off(J.hips, 0, -0.12, 0.05); P.e(J.thL, -0.5); P.e(J.knL, 0.7); P.e(J.ftL, -0.2); P.e(J.thR, 0.1); P.e(J.knR, 0.4); P.e(J.ftR, -0.5); }, 'i'],
    [0.7, (P) => { P.e(J.chest, 0.55); for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['sh' + S], -0.85, 0, -sd * 0.1); P.e(J['el' + S], -0.1); } P.off(J.hips, 0, -0.12, 0.05); P.e(J.thL, -0.5); P.e(J.knL, 0.7); P.e(J.ftL, -0.2); P.e(J.thR, 0.1); P.e(J.knR, 0.4); P.e(J.ftR, -0.5); }],
    [1.0, () => {}]], fadeOut: 0.25 }),
});

// ------------------------------------------------------------------ INSECT (beetle / crab / spider / crawler)
function insectKind(def) {
  const n = def.name.toLowerCase();
  if (n.includes('crab')) return 'crab';
  if (n.includes('spider')) return 'spider';
  if (n.includes('crawler') || n.includes('scorpion')) return 'crawler';
  return 'beetle';
}
function insectTemplate(def, q) {
  const kind = insectKind(def);
  const n = def.name.toLowerCase();
  const c = col(def.color);
  const B = new Builder({ seed: hashStr(def.name) });
  const crab = kind === 'crab', spider = kind === 'spider', crawler = kind === 'crawler';
  const Y = crab ? 0.36 : spider ? 0.55 : 0.33;
  const glowC = col(def.eyes || (spider ? '#c070ff' : n.includes('volt') ? '#9fd0ff' : n.includes('sun') ? '#fff0a0' : '#ff4030'));
  const shiny = n.includes('sun') || n.includes('scarab');
  const ro = shiny ? { cell: 'plate', rough: 0.22, metal: 1 } : crawler ? { cell: 'chitin', rough: 0.55 } : { cell: 'chitin', rough: 0.3 };
  B.bone('body', null, 0, Y, 0);
  B.bone('head', 'body', 0, Y, crab ? 0.25 : spider ? 0.3 : 0.4);
  for (const sd of [1, -1]) B.bone('mand' + (sd > 0 ? 'L' : 'R'), 'head', sd * 0.06, Y - 0.04, crab ? 0.3 : 0.52);
  const nLegs = spider ? 4 : 3;
  const legs = [];
  for (let i = 0; i < nLegs; i++) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    const z = crab ? lerp(0.12, -0.18, i / (nLegs - 1)) : spider ? lerp(0.2, -0.15, i / (nLegs - 1)) : lerp(0.25, -0.1, i / (nLegs - 1));
    const ax = sd * (crab ? 0.3 : spider ? 0.12 : 0.16), ay = Y - 0.03;
    const reach = crab ? 0.36 : spider ? 0.55 : 0.3, up = crab ? 0.2 : spider ? 0.3 : 0.17;
    const spread = (crab ? 0.15 : spider ? 0.55 : 0.35) * (i / (nLegs - 1) - 0.5);
    const kx = ax + sd * reach * 0.55 * Math.cos(spread), kz = z + reach * 0.55 * Math.sin(-spread) * 1.2;
    B.bone('leg' + i + S, 'body', ax, ay, z);
    B.bone('tib' + i + S, 'leg' + i + S, kx, ay + up, kz);
    B.bone('tip' + i + S, 'tib' + i + S, ax + sd * reach * Math.cos(spread), 0.0, z + reach * Math.sin(-spread) * 1.3);
    legs.push({ i, sd, S, a: V3(ax, ay, z), k: V3(kx, ay + up, kz), t: V3(ax + sd * reach * Math.cos(spread), 0.01, z + reach * Math.sin(-spread) * 1.3) });
  }
  if (crab) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    B.bone('arm' + S, 'body', sd * 0.25, Y, 0.25);
    B.bone('claw' + S, 'arm' + S, sd * 0.38, Y + 0.08, 0.5);
    B.bone('pin' + S, 'claw' + S, sd * 0.4, Y + 0.08, 0.62);
  }
  if (crawler) { let p = 'body'; for (let i = 0; i < 5; i++) { B.bone('tl' + i, p, 0, Y + 0.05 + i * 0.09, -0.4 - i * 0.08 + (i > 2 ? (i - 2) * 0.1 : 0)); p = 'tl' + i; } }
  const NU = Math.round(18 * q), NV = Math.round(12 * q);
  // bodies
  if (crab) {
    B.add(blob(0.4, 0.15, 0.32, 0.8, 0.9, NU, NV, (p) => { p.y += 0.04 * Math.cos(p.x * 4); if (p.z > 0.2) p.y -= 0.03; }), { ...ro, color: c, pos: [0, Y + 0.02, 0], bone: 'body' });
    B.add(blob(0.3, 0.08, 0.24, 0.8, 0.9, 14, 8), { ...ro, color: mixc(c, '#f0e0c0', 0.5), pos: [0, Y - 0.08, 0], bone: 'body' });
    for (const sd of [-1, 1]) {
      B.add(seg(V3(sd * 0.06, Y + 0.1, 0.25), V3(sd * 0.08, Y + 0.22, 0.28), 0.015, 0.012, 6), { ...ro, color: c, bone: 'head' });
      B.add(sphere(0.03, 10, 8), { pos: [sd * 0.08, Y + 0.24, 0.29], cell: 'gloss', color: '#101010', rough: 0.1, bone: 'head' });
      B.add(sphere(0.012, 6, 4), { pos: [sd * 0.08 + 0.01, Y + 0.255, 0.315], cell: 'gloss', color: glowC, glow: def.eyes ? 2 : 0.6, bone: 'head' });
      const S = sd > 0 ? 'L' : 'R';
      B.add(seg(V3(sd * 0.25, Y, 0.25), V3(sd * 0.38, Y + 0.08, 0.5), 0.055, 0.05, 8), { ...ro, color: c, bone: 'arm' + S });
      B.add(blob(0.13, 0.1, 0.16, 0.8, 0.8, 12, 8), { ...ro, color: c, pos: [sd * 0.4, Y + 0.08, 0.6], bone: 'claw' + S });
      B.add(tube([V3(sd * 0.42, Y + 0.12, 0.68), V3(sd * 0.45, Y + 0.13, 0.82), V3(sd * 0.41, Y + 0.11, 0.93)], (t) => lerp(0.05, 0.01, t), 7), { ...ro, color: shade(c, 1.1), bone: 'claw' + S });
      B.add(tube([V3(sd * 0.41, Y + 0.04, 0.66), V3(sd * 0.42, Y + 0.01, 0.77), V3(sd * 0.39, Y + 0.03, 0.86)], (t) => lerp(0.038, 0.008, t), 7), { ...ro, color: shade(c, 1.1), bone: 'pin' + S });
    }
  } else if (spider) {
    B.add(blob(0.3, 0.26, 0.34, 1, 1, NU, NV), { ...ro, color: c, pos: [0, Y + 0.12, -0.32], rot: [0.3, 0, 0], bone: 'body' });
    B.add(blob(0.16, 0.12, 0.2, 1, 1, 14, 10), { ...ro, color: shade(c, 1.2), pos: [0, Y + 0.02, 0.08], bone: 'body' });
    for (let k = 0; k < 4; k++) B.add(tube([V3(-0.2 + k * 0.13, Y + 0.3, -0.25), V3(-0.18 + k * 0.12, Y + 0.25, -0.5)], 0.012, 5), { cell: 'gloss', color: glowC, glow: 1.2, bone: 'body' });
    B.add(blob(0.11, 0.09, 0.1, 1, 1, 12, 8), { ...ro, color: shade(c, 1.2), pos: [0, Y + 0.02, 0.3], bone: 'head' });
    const eyes = [[0.035, 0.07, 0.38, 0.022], [-0.035, 0.07, 0.38, 0.022], [0.07, 0.06, 0.35, 0.015], [-0.07, 0.06, 0.35, 0.015], [0.02, 0.1, 0.36, 0.012], [-0.02, 0.1, 0.36, 0.012]];
    for (const [x, y, z, r] of eyes) B.add(sphere(r, 8, 6), { pos: [x, Y + y - 0.02, z], cell: 'gloss', color: glowC, glow: 2.2, bone: 'head' });
    for (const sd of [-1, 1]) B.add(tube([V3(sd * 0.04, Y - 0.02, 0.38), V3(sd * 0.045, Y - 0.08, 0.42), V3(sd * 0.03, Y - 0.12, 0.41)], (t) => lerp(0.022, 0.006, t), 6), { cell: 'chitin', color: shade(c, 0.6), bone: 'mand' + (sd > 0 ? 'L' : 'R') });
  } else {
    // beetle / crawler
    const elytra = blob(0.3, 0.22, 0.42, 0.9, 1, NU, NV, (p) => { if (p.y < 0) p.y *= 0.4; });
    B.add(elytra, { ...ro, color: c, pos: [0, Y + 0.06, -0.12], bone: 'body' });
    if (!crawler) B.add(tube([V3(0, Y + 0.28, 0.25), V3(0, Y + 0.29, -0.12), V3(0, Y + 0.2, -0.48)], 0.008, 5, { caps: false }), { cell: 'chitin', color: shade(c, 0.4), bone: 'body' });
    B.add(blob(0.2, 0.15, 0.14, 0.85, 1, 14, 10), { ...ro, color: shade(c, 0.85), pos: [0, Y + 0.06, 0.3], bone: 'body' });
    B.add(blob(0.13, 0.1, 0.11, 0.9, 1, 12, 9), { ...ro, color: shade(c, 0.7), pos: [0, Y + 0.02, 0.46], bone: 'head' });
    for (const sd of [-1, 1]) {
      B.add(sphere(0.03, 10, 8), { pos: [sd * 0.085, Y + 0.05, 0.52], scl: [0.7, 1, 0.9], cell: 'gloss', color: glowC, glow: 2, bone: 'head' });
      B.add(tube([V3(sd * 0.05, Y - 0.02, 0.54), V3(sd * 0.09, Y - 0.04, 0.63), V3(sd * 0.03, Y - 0.05, 0.7)], (t) => lerp(0.02, 0.005, t), 6), { cell: 'chitin', color: shade(c, 0.45), bone: 'mand' + (sd > 0 ? 'L' : 'R') });
      if (!crawler) B.add(tube([V3(sd * 0.05, Y + 0.08, 0.53), V3(sd * 0.12, Y + 0.2, 0.62), V3(sd * 0.2, Y + 0.24, 0.7)], 0.006, 4), { cell: 'chitin', color: shade(c, 0.4), bone: 'head' });
    }
    if (n.includes('volt')) {
      B.add(tube([V3(0, Y + 0.08, 0.5), V3(0, Y + 0.25, 0.62), V3(0, Y + 0.35, 0.56)], (t) => lerp(0.03, 0.006, t), 7), { ...ro, color: shade(c, 0.6), bone: 'head' });
      for (const sd of [-1, 1]) B.add(tube([V3(sd * 0.12, Y + 0.24, 0.15), V3(sd * 0.2, Y + 0.18, -0.15), V3(sd * 0.16, Y + 0.1, -0.45)], 0.012, 5), { cell: 'gloss', color: glowC, glow: 2, bone: 'body' });
    }
    if (n.includes('thorn')) { const R = rng(4); for (let i = 0; i < 12; i++) { const a = R() * PI - PI / 2, z = -0.45 + R() * 0.6; const p = V3(Math.sin(a) * 0.26, Y + 0.06 + Math.cos(a) * 0.2, z); B.add(cone(0.025, 0, 0.1, 5), { m: matDir(p, V3(Math.sin(a), Math.cos(a) + 0.3, -0.3)), cell: 'bark', color: '#6a5a2a', bone: 'body' }); } }
    if (shiny) B.add(sphere(0.07, 12, 10), { pos: [0, Y + 0.2, 0.33], scl: [1, 0.4, 1], cell: 'gloss', color: '#fff0a0', glow: 1.8, bone: 'body' });
    if (crawler) {
      for (const sd of [-1, 1]) {
        const S = sd > 0 ? 'L' : 'R';
        B.add(seg(V3(sd * 0.12, Y, 0.45), V3(sd * 0.22, Y + 0.02, 0.62), 0.035, 0.03, 7), { ...ro, color: c, bone: 'mand' + S });
        B.add(blob(0.07, 0.05, 0.1, 0.8, 0.8, 10, 8), { ...ro, color: c, pos: [sd * 0.24, Y + 0.02, 0.72], bone: 'mand' + S });
      }
      for (let i = 0; i < 5; i++) {
        const b = B.bpos('tl' + i);
        B.add(blob(0.08 - i * 0.01, 0.06, 0.07, 0.8, 0.8, 10, 8), { ...ro, color: c, pos: [b.x, b.y, b.z], bone: 'tl' + i });
      }
      const e = B.bpos('tl4');
      B.add(cone(0.035, 0, 0.14, 7), { pos: [e.x, e.y + 0.02, e.z + 0.05], rot: [1.9, 0, 0], cell: 'gloss', color: glowC, glow: 1.2, bone: 'tl4' });
    }
  }
  // legs
  for (const L of legs) {
    const lc = shade(c, crab ? 1 : 0.8);
    B.add(seg(L.a, L.k, spider ? 0.025 : 0.038, spider ? 0.02 : 0.03, 6), { ...ro, color: lc, bone: 'leg' + L.i + L.S });
    B.add(sphere(spider ? 0.024 : 0.033, 8, 6), { ...ro, color: lc, pos: [L.k.x, L.k.y, L.k.z], bone: 'tib' + L.i + L.S });
    B.add(seg(L.k, L.t, spider ? 0.02 : 0.03, 0.01, 6), { ...ro, color: lc, bone: 'tib' + L.i + L.S });
  }
  return { tpl: B.build(), kind, legs: legs.length, nLegs, Y };
}
function insectPoses(J, info) {
  const { nLegs, kind } = info;
  const legs = (P, ph, a) => {
    for (let i = 0; i < nLegs; i++) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      const grp = (i + (sd > 0 ? 0 : 1)) % 2;
      const p = ph + grp * PI;
      const lift = Math.max(0, Math.sin(p)) * 0.35 * a;
      const swing = Math.cos(p) * 0.3 * a;
      P.e(J['leg' + i + S], 0, swing * sd * -1, sd * lift, 'YXZ');
      P.e(J['tib' + i + S], 0, 0, -sd * lift * 0.5);
    }
  };
  return {
    idle(P, t) {
      P.off(J.body, 0, 0.008 * Math.sin(t * 2.2), 0);
      P.e(J.head, 0.05 * Math.sin(t * 0.8), 0.15 * Math.sin(t * 0.5), 0);
      const m = 0.12 + 0.12 * Math.max(0, Math.sin(t * 2.7));
      P.e(J.mandL, 0, m, 0); P.e(J.mandR, 0, -m, 0);
      legs(P, t * 0.6, 0.05);
      if (kind === 'crab') for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['arm' + S], -0.1 + 0.05 * Math.sin(t * 1.5 + sd), 0, 0); P.e(J['pin' + S], 0.15 + 0.15 * Math.max(0, Math.sin(t * 2 + sd))); }
      if (kind === 'crawler') for (let i = 0; i < 5; i++) P.e(J['tl' + i], -0.35 - 0.05 * Math.sin(t * 1.5 - i), 0.08 * Math.sin(t * 0.9 - i * 0.5), 0);
    },
    move(P, t, c) {
      const ph = c.phase * 0.8;
      P.off(J.body, 0, 0.012 * Math.cos(2 * ph), 0);
      P.e(J.body, 0, 0.04 * Math.sin(ph), 0.02 * Math.sin(ph));
      P.e(J.head, 0, 0.08 * Math.sin(ph), 0);
      P.e(J.mandL, 0, 0.2, 0); P.e(J.mandR, 0, -0.2, 0);
      legs(P, ph, 1);
      if (kind === 'crab') for (const S of ['L', 'R']) { P.e(J['arm' + S], -0.2, 0, 0); P.e(J['pin' + S], 0.1); }
      if (kind === 'crawler') for (let i = 0; i < 5; i++) P.e(J['tl' + i], -0.4, 0.1 * Math.sin(ph - i * 0.6), 0);
    },
    dead(P, t) {
      const u = sstep(0, 0.6, t);
      P.e(J.body, 0, 0, PI * 0.95 * u * u);
      P.off(J.body, 0, -info.Y * 0.2 * Math.sin(u * PI) + 0.12 * u, 0);
      for (let i = 0; i < nLegs; i++) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['leg' + i + S], 0, 0, sd * (0.6 + 0.2 * Math.sin(t * 9 + i) * (1 - u)) * u); P.e(J['tib' + i + S], 0, 0, -sd * 0.9 * u); }
    },
  };
}
const insectActions = (J, info) => ({
  attack: () => ({ dur: 0.62, hit: 0.32, keys: [
    [0, () => {}],
    [0.18, (P) => { P.addOff(J.body, 0, 0.04, -0.1); P.e(J.body, -0.15); P.e(J.head, -0.25); P.e(J.mandL, 0, 0.6, 0); P.e(J.mandR, 0, -0.6, 0); if (info.kind === 'crab') for (const S of ['L', 'R']) { P.e(J['arm' + S], -0.8, 0, 0); P.e(J['pin' + S], 0.6); } if (info.kind === 'crawler') for (let i = 0; i < 5; i++) P.e(J['tl' + i], -0.6); }, 'o'],
    [0.32, (P) => { P.addOff(J.body, 0, -0.02, 0.28); P.e(J.body, 0.12); P.e(J.head, 0.2); P.e(J.mandL, 0, -0.15, 0); P.e(J.mandR, 0, 0.15, 0); if (info.kind === 'crab') for (const S of ['L', 'R']) { P.e(J['arm' + S], 0.2, 0, 0); P.e(J['pin' + S], 0); } if (info.kind === 'crawler') { for (let i = 0; i < 4; i++) P.e(J['tl' + i], -0.2); P.e(J.tl4, 0.5); } }, 'i'],
    [0.62, () => {}]] }),
});

// ------------------------------------------------------------------ FLYER (bat / imp / wisp / ghost / phantom)
function flyerKind(def) {
  const n = def.name.toLowerCase();
  if (n.includes('phoenix')) return 'phoenix';
  if (n.includes('bird')) return 'bird';
  if (n.includes('bat')) return 'bat';
  if (n.includes('imp')) return 'imp';
  if (n.includes('wisp')) return 'wisp';
  if (n.includes('phantom') || n.includes('wraith')) return 'phantom';
  if (n.includes('ghost')) return 'ghost';
  return 'bat';
}
const FLY_H = { bat: 1.7, imp: 1.5, wisp: 1.6, ghost: 1.25, phantom: 0.55, bird: 1.8, phoenix: 1.9 };
function flyerTemplate(def, q) {
  const kind = flyerKind(def);
  const c = col(def.color);
  const B = new Builder({ seed: hashStr(def.name) });
  const H = FLY_H[kind];
  B.bone('body', null, 0, H, 0);
  const NU = Math.round(18 * q), NV = Math.round(12 * q);
  if (kind === 'bird' || kind === 'phoenix') {
    const fire = kind === 'phoenix';
    const acc = col(def.eyes || (fire ? '#ffd040' : '#bfe0ff'));
    const tipC = fire ? col('#ff4a10') : deepen(c, 0.5);
    B.bone('head', 'body', 0, H + 0.2, 0.3);
    B.bone('tail', 'body', 0, H - 0.02, -0.24);
    const span = 0.85;
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { B.bone('wing1' + S, 'body', sd * 0.09, H + 0.06, 0.04); B.bone('wing2' + S, 'wing1' + S, sd * (0.09 + span * 0.45), H + 0.09, 0.0); }
    const fo = { cell: 'fur', color: c, glow: fire ? 0.7 : 0 };
    B.add(blob(0.13, 0.13, 0.27, 1, 1, NU, NV, (p) => { if (p.z < 0) p.y *= 1 - 0.3 * (-p.z / 0.27); }), { ...fo, pos: [0, H, 0], rot: [-0.15, 0, 0], bone: 'body', colorFn: (p, n, cc) => (n.y < -0.3 ? cc.lerp(fire ? col('#ffd060') : col('#ffffff'), 0.35) : cc) });
    B.add(seg(V3(0, H + 0.06, 0.16), V3(0, H + 0.17, 0.27), 0.085, 0.07, 8), { ...fo, bone: 'head' });
    B.add(blob(0.085, 0.08, 0.1, 1, 1, 12, 8), { ...fo, pos: [0, H + 0.21, 0.31], bone: 'head' });
    B.add(cone(0.035, 0, 0.12, 6), { pos: [0, H + 0.2, 0.39], rot: [PI / 2 + 0.25, 0, 0], scl: [1, 1, 0.7], cell: 'bone', color: fire ? '#ffd060' : '#e8b040', glow: fire ? 0.6 : 0, bone: 'head' });
    for (const sd of [-1, 1]) B.add(sphere(0.018, 8, 6), { pos: [sd * 0.055, H + 0.23, 0.36], cell: 'gloss', color: acc, glow: 2.2, bone: 'head' });
    for (let k = 0; k < 3; k++) B.add(cone(0.028, 0, 0.15 - k * 0.025, 4), { m: matDir(V3(0, H + 0.27, 0.3 - k * 0.04), V3(0, 0.7, -1), [1, 1, 0.3]), cell: fire ? 'gloss' : 'fur', color: fire ? mixc(acc, '#ff8020', 0.5) : tipC, glow: fire ? 2 : 0, bone: 'head' });
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      const s1 = B.bpos('wing1' + S), s2 = B.bpos('wing2' + S), tipX = sd * (0.09 + span);
      const mem = param(14, 5, (u, v, o) => {
        const x = lerp(s1.x, tipX, u);
        const leadY = lerp(s1.y, s2.y + 0.03, u), leadZ = lerp(s1.z, s2.z - 0.02, Math.min(1, u * 2)) + 0.02 * Math.sin(u * PI);
        const chord = lerp(0.36, 0.12, u * u), saw = 0.05 * Math.abs(Math.sin(u * PI * 7)) * (0.3 + u);
        o.set(x, leadY - 0.03 * v, leadZ - (chord + saw) * v);
      }, { wrap: false, flip: sd < 0, lu: span, lv: 0.3 });
      const w = B.ladder('x', sd > 0 ? [['wing1L', s1.x + 0.05], ['wing2L', s2.x]] : [['wing2R', s2.x], ['wing1R', s1.x - 0.05]]);
      const wc = (p, n, cc) => cc.lerp(tipC, sstep(0.08, 0.3, s1.z - p.z) * 0.8);
      for (const g of twoSided(mem, 0.006)) B.add(g, { cell: 'fur', color: c, w, colorFn: wc, glowFn: fire ? (p) => 0.6 + 1.2 * sstep(0.1, 0.35, s1.z - p.z) : def.eyes ? (p) => 0.9 * sstep(0.22, 0.36, s1.z - p.z) : null });
      for (let k = 0; k < 5; k++) { const a = k / 4; const base = V3(lerp(s2.x, tipX, 0.55 + 0.45 * a), s2.y + 0.02, s2.z - 0.03 - a * 0.02); B.add(cone(0.035, 0, 0.22 - k * 0.02, 4), { m: matDir(base, V3(sd * (0.6 + 0.4 * a), 0, -1 + 0.6 * a), [1, 1, 0.25]), cell: 'fur', color: tipC, glow: fire ? 1.5 : 0, bone: 'wing2' + S }); }
    }
    for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.22; B.add(cone(0.05, 0, fire ? 0.5 : 0.32, 4), { m: matDir(V3(0, H - 0.02, -0.22), V3(Math.sin(a), -0.15, -Math.cos(a)), [1, 1, 0.22]), cell: 'fur', color: k % 2 ? tipC : c, glow: fire ? 1.6 : 0, bone: 'tail' }); }
    if (fire) for (let k = 0; k < 3; k++) { const a = (k - 1) * 0.3; B.add(tube([V3(0, H - 0.03, -0.3), V3(Math.sin(a) * 0.15, H - 0.15, -0.7), V3(Math.sin(a) * 0.3, H - 0.1 - k * 0.05, -1.1)], (t) => lerp(0.04, 0.005, t), 5, { flatten: 0.3 }), { cell: 'gloss', color: k === 1 ? '#ffd060' : '#ff6a20', glow: 2.4, bone: 'tail' }); }
    for (const sd of [-1, 1]) B.add(seg(V3(sd * 0.05, H - 0.1, -0.02), V3(sd * 0.05, H - 0.18, -0.08), 0.015, 0.01, 4), { cell: 'bone', color: '#c8a040', bone: 'body' });
  } else if (kind === 'bat' || kind === 'imp') {    const imp = kind === 'imp';
    const glowC = col(def.eyes || (imp ? '#ffe040' : def.name.toLowerCase().includes('frost') ? '#bff4ff' : '#ff60c0'));
    const skin = imp ? { cell: 'skin', rough: 0.5 } : { cell: 'fur' };
    B.bone('head', 'body', 0, H + (imp ? 0.22 : 0.08), imp ? 0.03 : 0.12);
    const span = imp ? 0.5 : 0.85;
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      B.bone('wing1' + S, 'body', sd * 0.07, H + (imp ? 0.14 : 0.05), imp ? -0.08 : 0);
      B.bone('wing2' + S, 'wing1' + S, sd * (0.07 + span * 0.45), H + (imp ? 0.24 : 0.07), imp ? -0.14 : -0.02);
      if (imp) {
        B.bone('arm1' + S, 'body', sd * 0.12, H + 0.13, 0);
        B.bone('arm2' + S, 'arm1' + S, sd * 0.14, H - 0.04, 0.02);
        B.bone('leg1' + S, 'body', sd * 0.06, H - 0.12, 0);
        B.bone('leg2' + S, 'leg1' + S, sd * 0.065, H - 0.3, 0.02);
      } else B.bone('foot' + S, 'body', sd * 0.04, H - 0.12, -0.05);
    }
    if (imp) { B.bone('tail0', 'body', 0, H - 0.1, -0.08); B.bone('tail1', 'tail0', 0, H - 0.2, -0.24); B.bone('tail2', 'tail1', 0, H - 0.22, -0.42); }
    // body
    if (imp) {
      B.add(blob(0.12, 0.16, 0.1, 1, 1, NU, NV), { ...skin, color: c, pos: [0, H + 0.04, 0], bone: 'body' });
      B.add(blob(0.13, 0.12, 0.12, 1, 1, NU, NV), { ...skin, color: c, pos: [0, H + 0.3, 0.04], bone: 'head' });
      B.add(blob(0.07, 0.05, 0.05, 1, 1, 10, 8), { ...skin, color: c, pos: [0, H + 0.25, 0.13], bone: 'head' });
      for (const sd of [-1, 1]) {
        const S = sd > 0 ? 'L' : 'R';
        B.add(sphere(0.035, 10, 8), { pos: [sd * 0.05, H + 0.33, 0.13], scl: [1, 1.1, 0.6], cell: 'gloss', color: glowC, glow: 2.5, bone: 'head' });
        B.add(tube([V3(sd * 0.07, H + 0.38, 0.03), V3(sd * 0.12, H + 0.47, 0.0), V3(sd * 0.1, H + 0.55, -0.06)], (t) => lerp(0.028, 0.002, t), 6), { cell: 'bone', color: '#3a2420', bone: 'head' });
        B.add(cone(0.03, 0, 0.1, 5), { pos: [sd * 0.12, H + 0.32, 0.0], rot: [0, 0, -sd * 1.2], scl: [1, 1, 0.4], ...skin, color: c, bone: 'head' });
        B.add(seg(V3(sd * 0.12, H + 0.13, 0), V3(sd * 0.14, H - 0.04, 0.02), 0.03, 0.025, 6), { ...skin, color: c, bone: 'arm1' + S });
        B.add(seg(V3(sd * 0.14, H - 0.04, 0.02), V3(sd * 0.15, H - 0.18, 0.06), 0.025, 0.02, 6), { ...skin, color: c, bone: 'arm2' + S });
        for (const k of [-1, 0, 1]) B.add(cone(0.008, 0, 0.04, 4), { pos: [sd * 0.15 + k * 0.012, H - 0.2, 0.07], rot: [PI, 0, 0], cell: 'bone', color: '#2a1810', bone: 'arm2' + S });
        B.add(seg(V3(sd * 0.06, H - 0.1, 0), V3(sd * 0.065, H - 0.3, 0.02), 0.035, 0.025, 6), { ...skin, color: c, bone: 'leg1' + S });
        B.add(seg(V3(sd * 0.065, H - 0.3, 0.02), V3(sd * 0.07, H - 0.45, -0.02), 0.025, 0.02, 6), { ...skin, color: c, bone: 'leg2' + S });
        B.add(blob(0.025, 0.02, 0.035, 1, 1, 8, 6), { pos: [sd * 0.07, H - 0.47, 0.0], cell: 'bone', color: '#2a1810', bone: 'leg2' + S });
      }
      B.add(tube([V3(-0.045, H + 0.24, 0.135), V3(0, H + 0.22, 0.15), V3(0.045, H + 0.24, 0.135)], 0.01, 5), { cell: 'gloss', color: '#2a0806', bone: 'head' });
      const tp = [V3(0, H - 0.1, -0.08), V3(0, H - 0.2, -0.24), V3(0, H - 0.22, -0.42), V3(0, H - 0.17, -0.5)];
      B.add(tube(tp, (t) => lerp(0.025, 0.01, t), 6), { ...skin, color: c, w: B.ladder('z', [['tail2', -0.4], ['tail1', -0.22], ['tail0', -0.1]]) });
      B.add(toFlat(cone(0.05, 0, 0.09, 4)), { pos: [0, H - 0.16, -0.53], rot: [-1.2, 0, 0], scl: [1, 1, 0.3], cell: 'gloss', color: '#ff9a30', glow: 2, bone: 'tail2' });
      B.add(sphere(0.05, 8, 6), { pos: [0, H + 0.45, 0.02], scl: [1, 1.6, 1], cell: 'gloss', color: '#ffb040', glow: 2.5, bone: 'head' });
    } else {
      B.add(blob(0.14, 0.16, 0.19, 1, 1, NU, NV), { ...skin, color: c, pos: [0, H, -0.03], rot: [0.3, 0, 0], bone: 'body' });
      B.add(blob(0.085, 0.08, 0.09, 1, 1, NU, NV), { ...skin, color: c, pos: [0, H + 0.1, 0.13], bone: 'head' });
      B.add(blob(0.045, 0.04, 0.05, 1, 1, 10, 8), { ...skin, color: shade(c, 0.85), pos: [0, H + 0.08, 0.21], bone: 'head' });
      B.add(sphere(0.015, 8, 6), { pos: [0, H + 0.095, 0.255], scl: [1.4, 0.8, 0.6], cell: 'gloss', color: '#1a1014', bone: 'head' });
      for (const sd of [-1, 1]) {
        B.add(sphere(0.022, 10, 8), { pos: [sd * 0.04, H + 0.13, 0.2], cell: 'gloss', color: glowC, glow: 2.2, bone: 'head' });
        B.add(cone(0.04, 0, 0.13, 6), { pos: [sd * 0.05, H + 0.16, 0.1], rot: [-0.2, 0, -sd * 0.35], scl: [1, 1, 0.45], ...skin, color: shade(c, 0.9), bone: 'head' });
        B.add(cone(0.007, 0, 0.03, 4), { pos: [sd * 0.018, H + 0.06, 0.235], rot: [PI, 0, 0], cell: 'bone', color: '#f0ece0', bone: 'head' });
        B.add(blob(0.02, 0.04, 0.02, 1, 1, 8, 6), { ...skin, color: shade(c, 0.6), pos: [sd * 0.04, H - 0.14, -0.06], bone: 'foot' + (sd > 0 ? 'L' : 'R') });
      }
    }
    // wings: membrane panels + finger bones
    const memC = imp ? shade(c, 0.55) : shade(c, 0.7);
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      const s1 = B.bpos('wing1' + S), s2 = B.bpos('wing2' + S);
      const tipX = sd * (0.07 + span), tipY = s2.y + 0.04;
      const fingers = [V3(tipX, tipY, s2.z - 0.02), V3(sd * (0.07 + span * 0.85), s2.y - 0.05, s2.z - span * 0.35), V3(sd * (0.07 + span * 0.6), s2.y - 0.08, s2.z - span * 0.5)];
      // trailing edge passes through the finger tips with scalloped sags in between
      const FU = [0, 0.6, 0.85, 1], FZ = [imp ? 0.28 : 0.38, 0.55 * span, 0.4 * span, 0.0];
      const trailDepth = (u) => {
        let k = 0; while (k < 2 && u > FU[k + 1]) k++;
        const t = (u - FU[k]) / (FU[k + 1] - FU[k]);
        return lerp(FZ[k], FZ[k + 1], t) - Math.sin(t * PI) * (FU[k + 1] - FU[k]) * span * 0.35;
      };
      const mem = param(16, 6, (u, v, o) => {
        // u along span (0 body .. 1 tip), v leading (0) to trailing (1) edge
        const x = lerp(s1.x, tipX, u);
        const lead = V3(x, lerp(s1.y, tipY, u) + Math.sin(u * PI) * 0.03, lerp(s1.z, s2.z, Math.min(1, u * 2)));
        o.set(x, lead.y - 0.08 * v * (1 - u), lerp(lead.z, s1.z - trailDepth(u), v));
      }, { wrap: false, flip: sd < 0, lu: span, lv: 0.4 });
      const w = B.ladder('x', sd > 0 ? [['wing1L', s1.x + 0.05], ['wing2L', s2.x]] : [['wing2R', s2.x], ['wing1R', s1.x - 0.05]]);
      for (const g of twoSided(mem, 0.004)) B.add(g, { cell: imp ? 'leather' : 'leather', color: memC, rough: 0.55, w });
      B.add(seg(s1, s2, 0.018, 0.013, 5), { cell: imp ? 'skin' : 'fur', color: shade(c, 0.8), bone: 'wing1' + S });
      for (const f of fingers) B.add(seg(s2, f, 0.011, 0.004, 4), { cell: 'leather', color: shade(c, 0.5), bone: 'wing2' + S });
    }
  } else if (kind === 'wisp') {
    const glowC = col(def.eyes || def.color);
    B.bone('core', 'body', 0, H, 0);
    for (let i = 0; i < 4; i++) B.bone('spark' + i, 'body', Math.cos(i * PI / 2) * 0.38, H, Math.sin(i * PI / 2) * 0.38);
    B.bone('tail0', 'body', 0, H - 0.05, -0.25); B.bone('tail1', 'tail0', 0, H - 0.1, -0.5);
    B.add(sphere(0.27, 20, 14), { slot: 'glass', pos: [0, H, 0], cell: 'gloss', color: c, glow: 1.7, rough: 0.1 });
    B.add(tube([V3(0, H, -0.12), V3(0, H - 0.05, -0.35), V3(0, H - 0.1, -0.6), V3(0, H - 0.12, -0.75)], (t) => lerp(0.22, 0.01, Math.pow(t, 0.7)), 12, { caps: false }), { slot: 'glass', cell: 'gloss', color: c, glow: 0.9, w: B.ladder('z', [['tail1', -0.5], ['tail0', -0.25], ['body', -0.1]]) });
    B.add(sphere(0.13, 14, 10), { pos: [0, H, 0], cell: 'gloss', color: mixc(c, '#ffffff', 0.6), glow: 3, bone: 'core' });
    for (let i = 0; i < 4; i++) { const p = B.bpos('spark' + i); B.add(toFlat(new THREE.OctahedronGeometry(0.045, 0)), { pos: [p.x, p.y, p.z], cell: 'gloss', color: mixc(glowC, '#ffffff', 0.5), glow: 3, bone: 'spark' + i }); }
    for (const sd of [-1, 1]) B.add(sphere(0.035, 10, 8), { pos: [sd * 0.085, H + 0.04, 0.245], scl: [0.8, 1.2, 0.4], cell: 'gloss', color: '#1a1830', rough: 0.05, bone: 'body' });
  } else if (kind === 'ghost') {
    const glowC = col(def.eyes || '#20302a');
    B.bone('tail1', 'body', 0, H - 0.3, -0.03); B.bone('tail2', 'tail1', 0, H - 0.6, -0.08);
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) B.bone('arm' + S, 'body', sd * 0.26, H + 0.1, 0.02);
    const prof = [];
    const rows = Math.round(16 * q) + 4;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows; // 0 bottom hem .. 1 top
      const y = lerp(H - 0.85, H + 0.48, t);
      const r = t > 0.7 ? 0.32 * Math.sqrt(Math.max(0, 1 - ((t - 0.7) / 0.3) ** 2)) : lerp(0.4, 0.31, t / 0.7);
      prof.push([Math.max(r, 0.0), y]);
    }
    const g = lathe(prof, Math.round(22 * q) + 2);
    deform(g, (p) => { const a = Math.atan2(p.x, p.z); const lo = sstep(H - 0.3, H - 0.85, p.y); p.y += Math.sin(a * 6) * 0.08 * lo; p.z -= 0.2 * lo * lo; });
    const gw = B.ladder('y', [['tail2', H - 0.65], ['tail1', H - 0.3], ['body', H]]);
    const [fr, bk] = twoSided(g, 0.01);
    B.add(fr, { slot: 'glass', cell: 'cloth', color: c, glow: 0.7, rough: 0.6, w: gw });
    B.add(bk, { slot: 'glass', cell: 'cloth', color: shade(c, 0.5), glow: 0.4, rough: 0.6, w: gw });
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      B.add(tube([V3(sd * 0.24, H + 0.12, 0.02), V3(sd * 0.36, H - 0.05, 0.12), V3(sd * 0.38, H - 0.2, 0.2)], (t) => lerp(0.08, 0.06, t), 8), { slot: 'glass', cell: 'cloth', color: c, glow: 0.7, bone: 'arm' + S });
      B.add(sphere(0.06, 12, 10), { pos: [sd * 0.1, H + 0.22, 0.27], scl: [0.8, 1.25, 0.4], rot: [0, sd * 0.3, 0], cell: 'gloss', color: '#0a1210', rough: 0.2, bone: 'body' });
      if (def.eyes) B.add(sphere(0.02, 8, 6), { pos: [sd * 0.1, H + 0.24, 0.3], cell: 'gloss', color: glowC, glow: 2.5, bone: 'body' });
    }
    B.add(sphere(0.05, 12, 10), { pos: [0, H + 0.04, 0.3], scl: [0.9, 1.2, 0.4], cell: 'gloss', color: '#0a1210', rough: 0.2, bone: 'body' });
  } else {
    // phantom: hooded tattered robe floating, long dark hands
    const glowC = col(def.eyes || '#7af0ff');
    B.bone('chest', 'body', 0, H + 1.2, 0);
    B.bone('head', 'chest', 0, H + 1.55, 0.02);
    B.bone('tail1', 'body', 0, H + 0.6, -0.05); B.bone('tail2', 'tail1', 0, H + 0.2, -0.12);
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { B.bone('arm1' + S, 'chest', sd * 0.22, H + 1.38, 0); B.bone('arm2' + S, 'arm1' + S, sd * 0.3, H + 1.05, 0.08); }
    const prof = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, y = lerp(H - 0.05, H + 1.5, t);
      const r = t < 0.85 ? lerp(0.36, 0.2, Math.pow(t / 0.85, 1.3)) : lerp(0.2, 0.09, (t - 0.85) / 0.15);
      prof.push([r, y]);
    }
    const g = lathe(prof, Math.round(24 * q) + 2);
    deform(g, (p) => {
      const a = Math.atan2(p.x, p.z), lo = sstep(H + 0.7, H - 0.05, p.y);
      p.y += (Math.sin(a * 7) * 0.14 + Math.sin(a * 13 + 1) * 0.07) * lo; // tattered hem
      p.z -= 0.3 * lo * lo;                                            // robe trails behind
      if (p.y > H + 1.2) { const sh = sstep(H + 1.2, H + 1.35, p.y) * (1 - sstep(H + 1.38, H + 1.5, p.y)); p.x *= 1 + 0.35 * sh * Math.abs(Math.sin(a)); }
    });
    const gw = B.ladder('y', [['tail2', H + 0.25], ['tail1', H + 0.65], ['body', H + 0.9], ['chest', H + 1.25]]);
    const [fr, bk] = twoSided(g, 0.012);
    B.add(fr, { slot: 'glass', cell: 'wool', color: c, glow: 0.35, w: gw });
    B.add(bk, { slot: 'glass', cell: 'wool', color: shade(c, 0.3), glow: 0.1, w: gw });
    // pointed hood with a dark void face and glowing eyes
    const hood = param(20, 12, (u, v, o) => {
      const lon = lerp(0.75, TAU - 0.75, u), lat = PI / 2 - v * 2.5;
      const cx = Math.sin(lon + PI), cz = Math.cos(lon + PI);
      let x = cx * Math.cos(lat) * 0.19, y = Math.sin(lat) * 0.25, z = cz * Math.cos(lat) * 0.22;
      if (z < 0 && y > 0.05) { z -= 0.12 * (y / 0.25) ** 2; y += 0.05 * (y / 0.25) ** 3; }
      if (v > 0.75) { const k = (v - 0.75) / 0.25; x *= 1 + 0.6 * k; z = z * (1 + 0.4 * k) - 0.03 * k; }
      o.set(x, H + 1.62 + y, z + 0.0);
    }, { wrap: false, lu: 0.6, lv: 0.5 });
    for (const p of twoSided(hood, 0.012)) B.add(p, { slot: 'glass', cell: 'wool', color: shade(c, 0.85), glow: 0.3, bone: 'head' });
    B.add(sphere(0.12, 14, 10), { pos: [0, H + 1.6, 0.04], scl: [1, 1.2, 0.55], cell: 'gloss', color: '#030206', rough: 0.95, bone: 'head' });
    for (const sd of [-1, 1]) B.add(sphere(0.02, 8, 6), { pos: [sd * 0.045, H + 1.63, 0.11], scl: [1.6, 0.6, 0.6], rot: [0, 0, -sd * 0.2], cell: 'gloss', color: glowC, glow: 3.5, bone: 'head' });
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      B.add(tube([V3(sd * 0.2, H + 1.4, 0), V3(sd * 0.27, H + 1.2, 0.05), V3(sd * 0.3, H + 1.05, 0.08)], (t) => lerp(0.07, 0.1, t), 8, { caps: false }), { slot: 'glass', cell: 'wool', color: c, glow: 0.35, bone: 'arm1' + S });
      B.add(seg(V3(sd * 0.3, H + 1.05, 0.08), V3(sd * 0.32, H + 0.82, 0.14), 0.025, 0.02, 6), { cell: 'skin', color: '#1a1622', bone: 'arm2' + S });
      for (const k of [-1, 0, 1]) B.add(seg(V3(sd * 0.32, H + 0.82, 0.14), V3(sd * 0.32 + k * 0.03, H + 0.66, 0.2), 0.009, 0.003, 4), { cell: 'skin', color: '#1a1622', bone: 'arm2' + S });
    }
  }
  return { tpl: B.build(), kind, H };
}
function flyerPoses(J, info) {
  const { kind, H } = info;
  const bird = kind === 'bird' || kind === 'phoenix', winged = bird || kind === 'bat' || kind === 'imp';
  const flap = (P, t, rate, amp) => {
    const f = Math.sin(t * rate), f2 = Math.sin(t * rate - 0.9);
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['wing1' + S], 0, 0, sd * (0.15 + amp * f)); P.e(J['wing2' + S], 0, sd * 0.2 * f2, sd * (0.1 + amp * 0.6 * f2)); }
    P.off(J.body, 0, -0.06 * f, 0);
  };
  const imp = (P, t) => {
    if (J.arm1L < 0) return;
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['arm1' + S], -0.3 + 0.1 * Math.sin(t * 2 + sd), 0, sd * 0.3); P.e(J['arm2' + S], -0.6); P.e(J['leg1' + S], -0.3 + 0.15 * Math.sin(t * 3 + sd), 0, 0); P.e(J['leg2' + S], 0.6); }
    for (let i = 0; i < 3; i++) P.e(J['tail' + i], -0.2, 0.4 * Math.sin(t * 3 - i), 0);
  };
  const ghostly = (P, t, sp) => {
    P.off(J.body, 0, 0.08 * Math.sin(t * 1.6), 0);
    P.e(J.tail1, 0.15 + 0.06 * sp + 0.08 * Math.sin(t * 2.3), 0.1 * Math.sin(t * 1.7), 0);
    P.e(J.tail2, 0.2 + 0.08 * sp + 0.12 * Math.sin(t * 2.3 - 1), 0.15 * Math.sin(t * 1.7 - 1), 0);
    if (J.armL >= 0) { P.e(J.armL, -0.2 + 0.15 * Math.sin(t * 1.4), 0, 0.15 * Math.sin(t * 1.1)); P.e(J.armR, -0.2 + 0.15 * Math.sin(t * 1.4 + 1), 0, -0.15 * Math.sin(t * 1.1 + 1)); }
    if (J.arm1L >= 0) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['arm1' + S], -0.35 + 0.12 * Math.sin(t * 1.3 + sd), 0, sd * 0.15); P.e(J['arm2' + S], -0.5 + 0.1 * Math.sin(t * 1.7 + sd)); }
  };
  const sparks = (P, t) => { for (let i = 0; i < 4; i++) if (J['spark' + i] >= 0) { const a = t * 2.2 + i * PI / 2; P.off(J['spark' + i], Math.cos(a) * 0.38 - Math.cos(i * PI / 2) * 0.38, Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 0.38 - Math.sin(i * PI / 2) * 0.38); } };
  return {
    idle(P, t, c) {
      if (bird) { flap(P, t, 7, 0.95); P.e(J.body, 0.1, 0, 0.05 * Math.sin(t * 1.3)); P.e(J.head, -0.15, 0.3 * Math.sin(t * 0.7), 0); P.e(J.tail, 0.1 * Math.sin(t * 2)); }
      else if (kind === 'bat' || kind === 'imp') { flap(P, t, kind === 'imp' ? 14 : 16, 0.8); P.e(J.body, 0.15, 0, 0.05 * Math.sin(t * 1.3)); P.e(J.head, -0.1, 0.3 * Math.sin(t * 0.7), 0); imp(P, t); }
      else if (kind === 'wisp') { P.off(J.body, 0, 0.1 * Math.sin(t * 1.8), 0); P.sc(J.core, 1 + 0.12 * Math.sin(t * 5)); sparks(P, t); P.e(J.tail0, 0.1 * Math.sin(t * 2), 0.3 * Math.sin(t * 1.5), 0); P.e(J.tail1, 0.15 * Math.sin(t * 2 - 1), 0.4 * Math.sin(t * 1.5 - 1), 0); }
      else ghostly(P, t, 0);
    },
    move(P, t, c) {
      const sp = clamp(c.speed / 5, 0, 1.5);
      if (bird) { flap(P, t, 8, 1.0); P.e(J.body, 0.25 + 0.15 * sp, 0, 0.08 * Math.sin(t * 2)); P.e(J.head, -0.3, 0, 0); P.e(J.tail, -0.1); }
      else if (kind === 'bat' || kind === 'imp') { flap(P, t, kind === 'imp' ? 16 : 18, 0.9); P.e(J.body, 0.3 + 0.2 * sp, 0, 0.08 * Math.sin(t * 2)); P.e(J.head, -0.25, 0, 0); imp(P, t); if (J.leg1L >= 0) { P.e(J.leg1L, 0.5); P.e(J.leg1R, 0.5); } }
      else if (kind === 'wisp') { P.off(J.body, 0, 0.06 * Math.sin(t * 3), 0); P.sc(J.core, 1 + 0.15 * Math.sin(t * 7)); sparks(P, t * 1.5); P.e(J.tail0, 0.1, 0.4 * Math.sin(t * 3), 0); P.e(J.tail1, 0.15, 0.5 * Math.sin(t * 3 - 1), 0); }
      else { ghostly(P, t, sp); P.e(J.body, 0.12 * sp + 0.05); }
    },
    dead(P, t) {
      const u = sstep(0, 0.8, t);
      P.off(J.body, 0, -(H - (kind === 'phantom' ? 0 : 0.15)) * u * u, 0);
      P.e(J.body, (winged ? 1.2 : 0.4) * u, 0, 0.6 * u);
      if (winged) for (const [sd, S] of [[1, 'L'], [-1, 'R']]) { P.e(J['wing1' + S], 0, 0, -sd * 0.6 * u); P.e(J['wing2' + S], 0, 0, sd * 0.8 * u); }
      if (kind === 'wisp') P.sc(J.body, 1 - 0.7 * u);
      if (kind === 'ghost' || kind === 'phantom') P.sc(J.body, 1 + 0.2 * u, 1 - 0.5 * u, 1 + 0.2 * u);
    },
  };
}
const flyerActions = (J, info) => ({
  attack: () => {
    const k = info.kind;
    if (k === 'wisp') return { dur: 0.6, hit: 0.32, keys: [[0, () => {}], [0.2, (P) => { P.sc(J.body, 0.8); P.addOff(J.body, 0, 0.05, -0.15); }, 'o'], [0.32, (P) => { P.sc(J.body, 1.3); P.sc(J.core, 1.6); P.addOff(J.body, 0, -0.1, 0.5); }, 'i'], [0.6, () => {}]] };
    if (k === 'ghost' || k === 'phantom') return { dur: 0.8, hit: 0.42, keys: [[0, () => {}],
      [0.25, (P) => { P.addOff(J.body, 0, 0.15, -0.15); P.e(J.body, -0.25); if (J.armL >= 0) { P.e(J.armL, -2.2); P.e(J.armR, -2.2); } if (J.arm1L >= 0) { P.e(J.arm1L, -2.4, 0, 0.4); P.e(J.arm1R, -2.4, 0, -0.4); P.e(J.arm2L, -0.4); P.e(J.arm2R, -0.4); } }, 'o'],
      [0.42, (P) => { P.addOff(J.body, 0, -0.1, 0.5); P.e(J.body, 0.35); if (J.armL >= 0) { P.e(J.armL, -1.0); P.e(J.armR, -1.0); } if (J.arm1L >= 0) { P.e(J.arm1L, -1.2, 0, 0.1); P.e(J.arm1R, -1.2, 0, -0.1); P.e(J.arm2L, -0.1); P.e(J.arm2R, -0.1); } }, 'i'],
      [0.8, () => {}]] };
    return { dur: 0.6, hit: 0.3, keys: [[0, () => {}],
      [0.15, (P) => { P.addOff(J.body, 0, 0.25, -0.2); P.e(J.body, -0.3); }, 'o'],
      [0.3, (P) => { P.addOff(J.body, 0, -0.45, 0.6); P.e(J.body, 0.8); P.e(J.head, -0.4); if (J.arm1L >= 0) { P.e(J.arm1L, -1.5, 0, 0.2); P.e(J.arm1R, -1.5, 0, -0.2); } }, 'i'],
      [0.6, () => {}]] };
  },
});

// ------------------------------------------------------------------ SERPENT (generic snake)
function serpentTemplate(def, q) {
  const c = col(def.color);
  const glowC = col(def.eyes || '#ffd040');
  const B = new Builder({ seed: hashStr(def.name) });
  const N = 10, segL = 0.22;
  B.bone('s0', null, 0, 0.5, 0.25);
  for (let i = 1; i < N; i++) B.bone('s' + i, 's' + (i - 1), 0, i < 3 ? 0.5 - i * 0.15 : 0.12, 0.25 - i * segL);
  B.bone('head', 's0', 0, 0.55, 0.38); B.bone('jaw', 'head', 0, 0.5, 0.42);
  const pts = [];
  for (let i = 0; i < N; i++) pts.push(B.bpos('s' + i));
  pts.push(V3(0, 0.1, 0.25 - N * segL));
  const w = (p) => { let bi = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = p.distanceTo(pts[i]); if (d < bd) { bd = d; bi = i; } } return [B.idx('s' + bi), 1]; };
  B.add(tube(pts, (t) => lerp(0.12, 0.02, Math.pow(t, 1.5)), Math.round(12 * q) + 2), { cell: 'scales', color: c, w, colorFn: (p, n, cc) => (n.y < -0.3 ? cc.copy(mixc(c, '#f0e8c0', 0.5)) : cc) });
  B.add(blob(0.11, 0.07, 0.15, 0.9, 1, 14, 10), { pos: [0, 0.57, 0.45], cell: 'scales', color: c, bone: 'head' });
  B.add(blob(0.09, 0.03, 0.13, 0.9, 1, 12, 8), { pos: [0, 0.51, 0.47], cell: 'scales', color: mixc(c, '#f0e8c0', 0.5), bone: 'jaw' });
  for (const sd of [-1, 1]) B.add(sphere(0.022, 10, 8), { pos: [sd * 0.075, 0.6, 0.52], cell: 'gloss', color: glowC, glow: 2, bone: 'head' });
  return { tpl: B.build(), N };
}
function serpentPoses(J, info) {
  const wave = (P, ph, amp) => { for (let i = 1; i < info.N; i++) P.e(J['s' + i], i < 3 ? -0.15 : 0, amp * Math.sin(ph - i * 0.7) * (i < 3 ? 0.4 : 1), 0); };
  return {
    idle(P, t) { wave(P, t * 1.5, 0.15); P.e(J.s0, -0.05 + 0.05 * Math.sin(t * 1.3), 0.2 * Math.sin(t * 0.6), 0); P.e(J.jaw, 0.05 + 0.1 * Math.max(0, Math.sin(t * 2))); },
    move(P, t, c) { wave(P, c.phase * 0.7, 0.35); P.e(J.s0, 0, 0.15 * Math.sin(c.phase * 0.7), 0); },
    dead(P, t) { const u = sstep(0, 0.7, t); P.off(J.s0, 0, -0.38 * u, 0); P.e(J.s0, 0.3 * u, 0, 1.2 * u); wave(P, 0, 0.1); },
  };
}
const serpentActions = (J) => ({ attack: () => ({ dur: 0.6, hit: 0.3, keys: [[0, () => {}], [0.18, (P) => { P.addOff(J.s0, 0, 0.15, -0.2); P.e(J.s0, -0.4); P.e(J.jaw, 0.6); }, 'o'], [0.3, (P) => { P.addOff(J.s0, 0, -0.15, 0.55); P.e(J.s0, 0.3); P.e(J.jaw, 0.7); }, 'i'], [0.6, () => {}]] }) });

// ------------------------------------------------------------------ HUMANOID monsters (skeleton / wraith / stalker / generic)
function humanoidKind(def) {
  const n = def.name.toLowerCase();
  if (n.includes('skeleton')) return 'skeleton';
  if (n.includes('wraith') || n.includes('shade')) return 'wraith';
  if (n.includes('stalker')) return 'stalker';
  if (n.includes('spirit') || n.includes('clone')) return 'spirit';
  return 'goblin';
}
function boneSeg(B, a, b, r, o) { B.add(seg(a, b, r, r * 0.85, 5), o); B.add(sphere(r * 1.5, 6, 4), { ...o, pos: [a.x, a.y, a.z] }); B.add(sphere(r * 1.35, 6, 4), { ...o, pos: [b.x, b.y, b.z] }); }
// skeleton body on the human skeleton (Skeleton Warrior, friendly skeletons, the Bonelord guardian)
export function addSkeleton(B, D, c, glowC, opt = {}) {
  const s = D.s, hc = V3(...D.hc);
  const P = (b) => B.bpos(b);
  const o = (bone) => ({ cell: 'bone', color: c, bone });
  // skull
  B.add(blob(0.075, 0.09, 0.09, 1, 1, 14, 10, (p) => { if (p.y < -0.03) p.x *= 0.85; }), { ...o('head'), pos: [hc.x, hc.y + 0.01, hc.z] });
  B.add(rbox(0.1, 0.05, 0.08, 0.5, 10, 8), { ...o('head'), pos: [hc.x, hc.y - 0.075, hc.z + 0.03] });
  for (const sd of [-1, 1]) {
    B.add(sphere(0.024, 10, 8), { pos: [hc.x + sd * 0.032, hc.y + 0.005, hc.z + 0.072], scl: [1, 1, 0.5], cell: 'gloss', color: '#08080a', rough: 0.6, bone: 'head' });
    B.add(sphere(0.011, 8, 6), { pos: [hc.x + sd * 0.032, hc.y + 0.005, hc.z + 0.08], cell: 'gloss', color: glowC, glow: 3, bone: 'head' });
  }
  B.add(cone(0.012, 0, 0.022, 3), { pos: [hc.x, hc.y - 0.04, hc.z + 0.086], rot: [PI, 0, 0], cell: 'gloss', color: '#08080a', bone: 'head' });
  for (let i = -3; i <= 3; i++) B.add(rbox(0.009, 0.014, 0.008, 0.5, 4, 4), { pos: [hc.x + i * 0.011, hc.y - 0.06, hc.z + 0.085 - Math.abs(i) * 0.004], cell: 'bone', color: '#f4f0e4', bone: 'head' });
  // spine & ribs
  const sp = [];
  for (let i = 0; i <= 10; i++) sp.push(V3(0, lerp(0.95, 1.5, i / 10) * s, -0.06 * s + 0.02 * Math.sin(i / 10 * PI) * s));
  for (const p of sp) B.add(sphere(0.022 * s, 6, 4), { pos: [p.x, p.y, p.z], scl: [1.3, 0.8, 1], cell: 'bone', color: c, w: B.ladder('y', [['hips', 1.0 * s], ['spine', 1.12 * s], ['chest', 1.28 * s], ['neck', 1.5 * s]]) });
  B.add(tube(sp, 0.014 * s, 5), { cell: 'bone', color: c, w: B.ladder('y', [['hips', 1.0 * s], ['spine', 1.12 * s], ['chest', 1.28 * s]]) });
  for (let i = 0; i < 6; i++) {
    const y = (1.42 - i * 0.055) * s, r = (0.13 + 0.015 * Math.sin(i / 5 * PI)) * D.x;
    for (const sd of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 7; k++) { const a = (k / 7) * 2.7; pts.push(V3(sd * Math.sin(a) * r, y - 0.03 * Math.sin(a) * s, -0.06 * s - Math.cos(a) * r * 0.75 + 0.03 * s)); }
      B.add(tube(pts, 0.011 * s, 4), { cell: 'bone', color: c, bone: 'chest' });
    }
  }
  B.add(rbox(0.04 * s, 0.2 * s, 0.025 * s, 0.5, 6, 8), { pos: [0, 1.32 * s, 0.08 * s], cell: 'bone', color: c, bone: 'chest' });
  // pelvis
  B.add(torus(0.1 * s, 0.03 * s, 14, 6), { pos: [0, 0.96 * s, -0.01], rot: [PI / 2 - 0.3, 0, 0], scl: [1.3, 1, 0.8], cell: 'bone', color: c, bone: 'hips' });
  // limbs
  for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
    boneSeg(B, P('clav' + S).add(V3(0, 0.02, 0.05)), P('uarm' + S), 0.012 * s, o('clav' + S));
    boneSeg(B, P('uarm' + S), P('farm' + S), 0.017 * s, o('uarm' + S));
    boneSeg(B, P('farm' + S), P('hand' + S), 0.014 * s, o('farm' + S));
    const h = P('hand' + S);
    B.add(blob(0.012 * s, 0.035 * s, 0.03 * s, 1, 1, 8, 6), { ...o('hand' + S), pos: [h.x, h.y - 0.04 * s, h.z] });
    for (let k = 0; k < 4; k++) B.add(tube([V3(h.x, h.y - 0.07 * s, h.z + (0.02 - k * 0.013) * s), V3(h.x - sd * 0.015 * s, h.y - 0.1 * s, h.z + (0.02 - k * 0.013) * s), V3(h.x - sd * 0.03 * s, h.y - 0.09 * s, h.z + (0.02 - k * 0.013) * s)], 0.005 * s, 4), o('hand' + S));
    boneSeg(B, P('thigh' + S), P('shin' + S), 0.022 * s, o('thigh' + S));
    boneSeg(B, P('shin' + S), P('foot' + S), 0.018 * s, o('shin' + S));
    const f = P('foot' + S);
    B.add(blob(0.035 * s, 0.022 * s, 0.1 * s, 0.8, 0.8, 10, 6), { ...o('foot' + S), pos: [f.x, 0.025 * s, f.z + 0.06 * s] });
  }
  // rusty helmet & round shield
  if (opt.helmet !== false) B.add(param(14, 5, (u, v, oo) => { const lon = -PI + u * TAU, lat = PI / 2 - v * 1.45; oo.set(Math.cos(lat) * Math.sin(lon) * 0.088 * s, Math.sin(lat) * 0.1 * s, Math.cos(lat) * Math.cos(lon) * 0.098 * s).add(V3(hc.x, hc.y + 0.02 * s, hc.z)); }, { lu: 0.4, lv: 0.2 }), { cell: 'plate', color: opt.helmetColor || '#6a5a4a', metal: 1, rough: 0.6, bone: 'head' });
  if (opt.shield === false) return;
  const hl = P('handL');
  B.add(cylinder(0.24 * s, 0.24 * s, 0.025 * s, 14, 1), { pos: [hl.x + 0.06 * s, hl.y + 0.08 * s, hl.z], rot: [0, 0, PI / 2], cell: 'bark', color: '#5a4030', bone: 'farmL' });
  B.add(torus(0.235 * s, 0.014 * s, 16, 4), { pos: [hl.x + 0.075 * s, hl.y + 0.08 * s, hl.z], rot: [0, PI / 2, 0], cell: 'plate', color: '#7a6a58', metal: 1, rough: 0.55, bone: 'farmL' });
  B.add(sphere(0.05 * s, 10, 8), { pos: [hl.x + 0.085 * s, hl.y + 0.08 * s, hl.z], scl: [0.5, 1, 1], cell: 'plate', color: '#8a7a68', metal: 1, rough: 0.5, bone: 'farmL' });
}
function humanoidTemplate(def, q) {
  const kind = humanoidKind(def);
  const c = col(def.color);
  const B = new Builder({ seed: hashStr(def.name) });
  const stalker = kind === 'stalker';
  const D = humanDims(stalker ? 1.95 : 1.78, stalker ? 'slim' : 'broad', stalker ? { wide: 0.78, arm: 0.7, leg: 0.75 } : {});
  if (stalker) { D.ua *= 1.22; D.fa *= 1.25; }
  humanBones(B, D, {});
  const s = D.s, hc = V3(...D.hc);
  const P = (b) => B.bpos(b);
  const glowC = col(def.eyes || (kind === 'skeleton' ? '#7ad8ff' : kind === 'wraith' ? '#c08aff' : '#ff3040'));
  if (kind === 'skeleton') {
    addSkeleton(B, D, c, glowC);
  } else if (kind === 'wraith') {
    // hood + robe; legs hidden. Glass slot for ghostly robe.
    const tw = B.ladder('y', [['hips', 0.95 * s], ['spine', 1.12 * s], ['chest', 1.3 * s]]);
    const robe = param(Math.round(22 * q) + 2, 16, (u, v, o) => {
      const lon = -PI + u * TAU, y = lerp(1.55, 0.1, v) * s;
      const r = lerp(0.14, 0.34, Math.pow(v, 0.8)) * D.x + (v < 0.12 ? 0.06 * (1 - v / 0.12) : 0);
      o.set(Math.sin(lon) * r, y + (v > 0.75 ? (Math.sin(lon * 7) * 0.08 + Math.sin(lon * 3 + 2) * 0.05) * (v - 0.75) * 4 : 0), Math.cos(lon) * r * 0.85 - 0.02 - 0.12 * v * v);
    }, { lu: 1.2, lv: 1.4 });
    const rw = (p) => { if (p.y > 0.9 * s) return tw(p); return skirtLike(B, s)(p); };
    const [fr, bk] = twoSided(robe, 0.01);
    B.add(fr, { slot: 'glass', cell: 'wool', color: c, glow: 0.25, w: rw });
    B.add(bk, { slot: 'glass', cell: 'wool', color: shade(c, 0.3), glow: 0.05, w: rw });
    const hood = param(18, 10, (u, v, o) => {
      const lon = lerp(0.8, TAU - 0.8, u), lat = PI / 2 - v * 2.3;
      const r = 0.125 + 0.03 * v;
      o.set(Math.sin(lon + PI) * Math.cos(lat) * r * s, hc.y + Math.sin(lat) * 0.15 * s + 0.01, hc.z + (Math.cos(lon + PI) * Math.cos(lat) * r * 1.15 - 0.01) * s);
    }, { wrap: false, lu: 0.5, lv: 0.4 });
    for (const p of twoSided(hood, 0.01)) B.add(p, { slot: 'glass', cell: 'wool', color: shade(c, 0.85), glow: 0.2, w: B.ladder('y', [['chest', 1.47 * s], ['head', 1.58 * s]]) });
    B.add(sphere(0.1 * s, 12, 10), { pos: [hc.x, hc.y, hc.z - 0.01], cell: 'gloss', color: '#030206', rough: 0.95, bone: 'head' });
    for (const sd of [-1, 1]) B.add(sphere(0.016 * s, 8, 6), { pos: [hc.x + sd * 0.035 * s, hc.y + 0.01 * s, hc.z + 0.085 * s], scl: [1.4, 0.8, 0.6], cell: 'gloss', color: glowC, glow: 3, bone: 'head' });
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      B.add(tube([P('uarm' + S), P('farm' + S), P('hand' + S).add(V3(0, 0.05 * s, 0))], (t) => lerp(0.055, 0.08, t) * s, 8, { caps: false }), { slot: 'glass', cell: 'wool', color: c, glow: 0.25, w: B.ladder('y', [['farm' + S, P('farm' + S).y - 0.05], ['uarm' + S, P('farm' + S).y + 0.05]]) });
      const h = P('hand' + S);
      B.add(blob(0.015 * s, 0.04 * s, 0.03 * s, 1, 1, 8, 6), { pos: [h.x, h.y - 0.04 * s, h.z], cell: 'skin', color: '#2a2234', bone: 'hand' + S });
      for (let k = 0; k < 4; k++) B.add(seg(V3(h.x, h.y - 0.07 * s, h.z + (0.02 - k * 0.013) * s), V3(h.x - sd * 0.02 * s, h.y - 0.15 * s, h.z + (0.03 - k * 0.015) * s), 0.006 * s, 0.002 * s, 4), { cell: 'skin', color: '#2a2234', bone: 'hand' + S });
    }
  } else if (kind === 'spirit') {
    // friendly glowing spirit / shadow clone: smooth translucent body (glass slot), bright eyes & heart
    const gO = { slot: 'glass', cell: 'gloss', color: c, glow: 0.9, rough: 0.2 };
    const tw = B.ladder('y', [['hips', 1.0 * s], ['spine', 1.13 * s], ['chest', 1.3 * s]]);
    B.add(blob(0.15 * D.x, 0.28 * s, 0.1 * s, 1, 1, 16, 12, (p) => { if (p.y > 0.08 * s) p.x *= 1 + 0.35 * (p.y / (0.28 * s)); }), { ...gO, pos: [0, 1.24 * s, -0.01], w: tw });
    B.add(blob(0.13 * s, 0.1 * s, 0.09 * s, 1, 1, 12, 8), { ...gO, pos: [0, 0.96 * s, 0], bone: 'hips' });
    B.add(limb(0.15 * s, 0.042 * s, 8, 4, 2), { ...gO, pos: [0, 1.62 * s, -0.016 * s], w: B.ladder('y', [['chest', 1.48 * s], ['neck', 1.53 * s], ['head', 1.6 * s]]) });
    B.add(blob(0.08 * s, 0.11 * s, 0.095 * s, 1, 1, 14, 10), { ...gO, pos: [hc.x, hc.y, hc.z], bone: 'head' });
    for (const sd of [-1, 1]) B.add(sphere(0.014 * s, 6, 4), { slot: 'glass', pos: [hc.x + sd * 0.032 * s, hc.y + 0.01 * s, hc.z + 0.085 * s], scl: [1.5, 0.7, 0.6], cell: 'gloss', color: '#ffffff', glow: 4, bone: 'head' });
    B.add(sphere(0.05 * s, 8, 6), { slot: 'glass', pos: [0, 1.3 * s, 0.03 * s], cell: 'gloss', color: mixc(c, '#ffffff', 0.6), glow: 4, bone: 'chest' });
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      B.add(seg(P('uarm' + S), P('farm' + S), 0.045 * s, 0.036 * s, 8), { ...gO, bone: 'uarm' + S });
      B.add(seg(P('farm' + S), P('hand' + S), 0.036 * s, 0.028 * s, 8), { ...gO, bone: 'farm' + S });
      B.add(blob(0.02 * s, 0.05 * s, 0.04 * s, 1, 1, 8, 6), { ...gO, pos: P('hand' + S).add(V3(0, -0.05 * s, 0)).toArray(), bone: 'hand' + S });
      B.add(seg(P('thigh' + S), P('shin' + S), 0.06 * s, 0.045 * s, 8), { ...gO, bone: 'thigh' + S });
      B.add(seg(P('shin' + S), P('foot' + S), 0.045 * s, 0.03 * s, 8), { ...gO, glow: 1.3, bone: 'shin' + S });
      B.add(blob(0.04 * s, 0.03 * s, 0.09 * s, 1, 1, 8, 6), { ...gO, glow: 1.3, pos: P('foot' + S).add(V3(0, -0.05 * s, 0.05 * s)).toArray(), bone: 'foot' + S });
      B.add(sphere(0.05 * s, 8, 6), { ...gO, pos: [sd * D.shX, D.shY, D.shZ], bone: 'uarm' + S });
    }
  } else {
    // stalker (or generic): very thin dark figure, long claws, glowing slit eyes, tattered shadow wisps
    const dark = c, sheen = { cell: 'skin', rough: 0.35 };
    const tw = B.ladder('y', [['hips', 1.0 * s], ['spine', 1.13 * s], ['chest', 1.3 * s]]);
    B.add(blob(0.13 * D.x / s * s, 0.3 * s, 0.085 * s, 1, 1, 16, 12, (p) => { if (p.y > 0.1 * s) p.x *= 1 + 0.25 * (p.y / (0.3 * s)); }), { ...sheen, color: dark, pos: [0, 1.25 * s, -0.01], w: tw });
    B.add(blob(0.1 * s, 0.1 * s, 0.07 * s, 1, 1, 12, 8), { ...sheen, color: dark, pos: [0, 0.97 * s, 0], bone: 'hips' });
    B.add(limb(0.17 * s, 0.035 * s, 8, 4, 2), { ...sheen, color: dark, pos: [0, 1.63 * s, -0.016 * s], w: B.ladder('y', [['chest', 1.48 * s], ['neck', 1.53 * s], ['head', 1.6 * s]]) });
    B.add(blob(0.07 * s, 0.11 * s, 0.085 * s, 1, 1, 16, 12, (p) => { if (p.y < 0) { p.x *= 1 + p.y * 3; p.z += -p.y * 0.3; } }), { ...sheen, color: dark, pos: [hc.x, hc.y, hc.z], bone: 'head' });
    for (const sd of [-1, 1]) B.add(sphere(0.016 * s, 8, 6), { pos: [hc.x + sd * 0.03 * s, hc.y + 0.005 * s, hc.z + 0.076 * s], scl: [1.6, 0.55, 0.5], rot: [0, 0, sd * 0.25], cell: 'gloss', color: glowC, glow: 3.2, bone: 'head' });
    for (const [sd, S] of [[1, 'L'], [-1, 'R']]) {
      B.add(seg(P('uarm' + S), P('farm' + S), 0.032 * s, 0.024 * s, 8), { ...sheen, color: dark, bone: 'uarm' + S });
      B.add(seg(P('farm' + S), P('hand' + S), 0.024 * s, 0.018 * s, 8), { ...sheen, color: dark, bone: 'farm' + S });
      B.add(seg(P('thigh' + S), P('shin' + S), 0.045 * s, 0.03 * s, 8), { ...sheen, color: dark, bone: 'thigh' + S });
      B.add(seg(P('shin' + S), P('foot' + S), 0.03 * s, 0.02 * s, 8), { ...sheen, color: dark, bone: 'shin' + S });
      const f = P('foot' + S);
      B.add(blob(0.03 * s, 0.02 * s, 0.1 * s, 1, 1, 8, 6), { ...sheen, color: dark, pos: [f.x, 0.02, f.z + 0.06 * s], bone: 'foot' + S });
      const h = P('hand' + S);
      B.add(blob(0.012 * s, 0.035 * s, 0.025 * s, 1, 1, 8, 6), { ...sheen, color: dark, pos: [h.x, h.y - 0.03 * s, h.z], bone: 'hand' + S });
      for (let k = 0; k < 4; k++) B.add(seg(V3(h.x, h.y - 0.05 * s, h.z + (0.02 - k * 0.013) * s), V3(h.x - sd * 0.01 * s, h.y - 0.2 * s, h.z + (0.05 - k * 0.02) * s), 0.006 * s, 0.0015, 4), { cell: 'gloss', color: '#2a2030', rough: 0.2, bone: 'hand' + S });
      B.add(sphere(0.04 * s, 10, 8), { ...sheen, color: dark, pos: [sd * D.shX, D.shY, D.shZ], bone: 'uarm' + S });
    }
    // shadow wisps trailing from shoulders/back
    const cape = param(10, 10, (u, v, o) => {
      const a = lerp(-1.2, 1.2, u);
      o.set(Math.sin(a) * 0.14 * D.x * (1 + v * 0.8), lerp(1.45, 0.55, v) * s + (v > 0.7 ? Math.sin(u * 30) * 0.08 * (v - 0.7) * 3 : 0), -Math.cos(a) * 0.08 - 0.03 - 0.12 * v);
    }, { wrap: false, flip: true, lu: 0.5, lv: 1 });
    for (const p of twoSided(cape, 0.004)) B.add(p, { slot: 'glass', cell: 'wool', color: '#1a1424', glow: 0.0, w: B.ladder('y', [['hips', 1.0 * s], ['chest', 1.3 * s]]) });
  }
  return { tpl: B.build(), D, kind };
}
function skirtLike(B, s) {
  const h = B.idx('hips'), l = B.idx('thighL'), r = B.idx('thighR');
  return (p) => { const t = clamp((0.95 * s - p.y) / (0.6 * s), 0, 1) * 0.5; const wl = t * sstep(-0.05, 0.05, p.x), wr = t * sstep(0.05, -0.05, p.x); return [h, 1 - wl - wr, l, wl, r, wr]; };
}

function makeHumanoidMob(def, q, key) {
  let T = TPL.get(key);
  if (!T) { T = humanoidTemplate(def, q); TPL.set(key, T); }
  const size = def.size || 1;
  const { HumanRig: HR } = { HumanRig };
  const glass = T.tpl.geos.glass ? atlasMaterial({ transparent: true, opacity: T.kind === 'wraith' ? 0.82 : T.kind === 'spirit' ? 0.6 : 0.75, depthWrite: false }) : null;
  const rig = new HR({ tpl: T.tpl, D: T.D, material: atlasMaterial(), height: T.D.s * 1.8, radius: 0.4 });
  if (glass) { rig.inst.meshes.glass.material = glass; rig.inst.meshes.glass.castShadow = T.kind === 'wraith'; rig.inst.meshes.glass.renderOrder = 2; }
  const J = rig.J, K = poseKit(J, T.D);
  const inner = new THREE.Object3D();
  inner.scale.setScalar(size);
  // move rig contents into a scaled container so root keeps feet at y=0
  const holder = rig.inst.holder; rig.root.remove(holder); inner.add(holder); rig.root.add(inner);
  const base = rig.anim.poses;
  if (T.kind === 'skeleton' || T.kind === 'spirit') {
    const sw = new THREE.Mesh(swordGeometryCached(T.kind === 'spirit' ? { ...SWORDS[7], blade: def.color, emissive: def.color, id: 'diamond' } : { ...SWORDS[3], blade: '#8a8478', roughness: 0.6, id: 'iron' }, q), rig.material);
    sw.position.set(0.02 * T.D.s, -0.088 * T.D.s, 0.004); sw.castShadow = true;
    rig.handR.add(sw); rig.sword = sw; rig.ctx.armed = true;
    const tip = new THREE.Object3D(); tip.position.set(0, 0, SWORD_LENGTH(SWORDS[3])); sw.add(tip); rig.swordTip = tip;
    const old = rig.anim.post;
    rig.anim.post = (P, dt) => { old(P, dt); P.r(J.head, 0, 0, 0.05 * Math.sin(rig._time * 1.3)); P.r(J.lidL, 0); };
  }
  if (T.kind === 'wraith') {
    const float = (P, t) => { P.addOff(J.hips, 0, (0.28 + 0.05 * Math.sin(t * 1.7)) * T.D.s, 0); K.leg(P, 'L', 0.1, 0.05, 0.3, 0.4); K.leg(P, 'R', 0.15, 0.05, 0.35, 0.45); };
    rig.anim.poses = {
      ...base,
      idle(P, t, c) { base.idle(P, t, c); float(P, t); K.arm(P, 'L', -0.35 + 0.1 * Math.sin(t * 1.2), 0, 0.25, -0.6, 0.5, 0.3); K.arm(P, 'R', -0.35 + 0.1 * Math.sin(t * 1.2 + 1), 0, 0.25, -0.6, 0.5, 0.3); P.e(J.spine, 0.1); },
      walk(P, t, c) { base.idle(P, t, c); float(P, t); P.e(J.spine, 0.25); P.e(J.chest, 0.1); K.arm(P, 'L', -0.9, 0, 0.2, -0.3, 0.5, 0.2); K.arm(P, 'R', -0.9, 0, 0.2, -0.3, 0.5, 0.2); },
      dead: base.dead,
    };
    rig.anim.poses.run = rig.anim.poses.walk;
  }
  if (T.kind === 'stalker') {
    const hunch = (P, k = 1) => { P.r(J.spine, 0.22 * k); P.r(J.chest, 0.15 * k); P.r(J.neck, -0.2 * k); P.r(J.head, -0.15 * k); };
    rig.anim.poses = {
      ...base,
      idle(P, t, c) { base.idle(P, t, c); hunch(P); K.arm(P, 'L', -0.1, 0, 0.18, -0.5, 0.3, 0.3); K.arm(P, 'R', -0.1, 0, 0.18, -0.5, 0.3, 0.3); },
      walk(P, t, c) { base.walk(P, t, c); hunch(P, 1.2); },
      run(P, t, c) { base.run(P, t, c); hunch(P, 1.5); K.arm(P, 'L', 0.9, 0, 0.3, -0.4, 0.3, 0.3); K.arm(P, 'R', 0.9, 0, 0.3, -0.4, 0.3, 0.3); },
      dead: base.dead,
    };
  }
  const claw = () => ({ dur: 0.7, hit: 0.36, keys: [
    [0, () => {}],
    [0.2, (P) => { K.torso(P, -0.1, -0.5); K.arm(P, 'R', -1.9, 0.9, 0.3, -1.2, 0.4, 0.4); K.arm(P, 'L', -1.2, 0.4, 0.3, -1.0, 0.4, 0.4); }, 'o'],
    [0.36, (P) => { K.torso(P, 0.35, 0.5); K.arm(P, 'R', -0.9, -0.7, 0.2, -0.2, 0.4, 0.2); K.arm(P, 'L', -1.5, 0.2, 0.2, -0.3, 0.4, 0.2); }, 'i'],
    [0.5, (P) => { K.torso(P, 0.3, 0.6); K.arm(P, 'R', -0.6, -0.9, 0.2, -0.3, 0.4, 0.2); K.arm(P, 'L', -1.2, 0.2, 0.2, -0.4, 0.4, 0.2); }],
    [0.7, () => {}]] });
  const extra = glass ? [glass] : [];
  const mob = new HumanMob(rig, {
    height: (T.kind === 'wraith' ? 2.0 : T.D.s * 1.8) * size, radius: 0.42 * size, hitHeight: (T.kind === 'wraith' ? 2.15 : T.D.s * 1.8 + 0.25) * size,
    extraMats: extra, runSpeed: T.kind === 'stalker' ? 2.5 : 3.2, attacks: [0, 1, 2],
    customAttack: T.kind === 'skeleton' || T.kind === 'spirit' ? null : claw,
  });
  mob.kind = T.kind;
  return mob;
}
const SWG = new Map();
function swordGeometryCached(def, q = 1) { const k = def.blade + q; let g = SWG.get(k); if (!g) { g = swordGeometry(def, q * 0.8).main; SWG.set(k, g); } return g; }

// ------------------------------------------------------------------ factory
export function createEnemy(def, { quality = 'high' } = {}) {
  const q = quality === 'low' ? 0.65 : 1;
  const shape = def.shape || 'slime';
  const key = shape + '|' + def.name + '|' + (def.color || '') + '|' + (def.eyes || '') + '|' + q;
  const size = def.size || 1;
  if (shape === 'humanoid') return makeHumanoidMob(def, q, key);
  let T = TPL.get(key);
  const mk = {
    slime: () => ({ tpl: slimeTemplate(def, q) }),
    quadruped: () => quadTemplate(def, q),
    golem: () => ({ tpl: golemTemplate(def, q) }),
    insect: () => insectTemplate(def, q),
    flyer: () => flyerTemplate(def, q),
    serpent: () => serpentTemplate(def, q),
  }[shape] || (() => ({ tpl: slimeTemplate(def, q) }));
  if (!T) { T = mk(); TPL.set(key, T); }
  let o;
  if (shape === 'slime') o = { poses: (J) => slimePoses(J), actions: slimeActions, height: 0.8, radius: 0.48, hitHeight: 1.05, glassOpacity: 0.72, glassDepth: true, glassShadow: true, moveRate: 0.55 };
  else if (shape === 'quadruped') o = { poses: (J) => quadPoses(J, T), actions: (J) => quadActions(J, T), height: T.kind === 'lizard' ? 0.6 : 1.1, radius: T.kind === 'lizard' ? 0.6 : 0.55, hitHeight: T.kind === 'lizard' ? 0.85 : 1.3, moveRate: 0.62 };
  else if (shape === 'golem') o = { poses: golemPoses, actions: golemActions, height: 2.05, radius: 0.65, hitHeight: 2.35, hurtBone: 'chest', moveRate: 0.45 };
  else if (shape === 'insect') o = { poses: (J) => insectPoses(J, T), actions: (J) => insectActions(J, T), height: T.kind === 'spider' ? 0.9 : 0.75, radius: T.kind === 'spider' ? 0.75 : 0.6, hitHeight: T.kind === 'spider' ? 1.15 : 1.0, moveRate: 0.9 };
  else if (shape === 'flyer') o = { poses: (J) => flyerPoses(J, T), actions: (J) => flyerActions(J, T), height: T.kind === 'phantom' ? 2.3 : T.H + 0.35, radius: T.kind === 'bat' ? 0.6 : 0.45, hitHeight: T.kind === 'phantom' ? 2.5 : T.H + 0.55, glassOpacity: T.kind === 'wisp' ? 0.55 : T.kind === 'ghost' ? 0.6 : 0.78, moveRate: 1 };
  else o = { poses: (J) => serpentPoses(J, T), actions: serpentActions, height: 0.75, radius: 0.5, hitHeight: 0.95, hurtBone: 's0', moveRate: 0.5 };
  const mob = new MobBase(T.tpl, { ...o, size, def });
  mob.kind = T.kind || shape;
  return mob;
}

// ------------------------------------------------------------------ friendly summons
// createSummon(kind, { color, quality }) -> Mob. kinds: 'treant','golem','bird','phoenix','skeleton','spirit'.
// Summons carry a faint rim glow of their colour (mob.baseRim); setTint(hex) gives a stronger friendly aura.
const SUMMON_COLORS = { treant: '#79c24a', golem: '#8a7a6a', bird: '#5a8ad0', phoenix: '#ff8a2a', skeleton: '#e8e2d0', spirit: '#8a7aff' };
export function createSummon(kind = 'spirit', { color, quality = 'high' } = {}) {
  const c = color || SUMMON_COLORS[kind] || '#8fd16a';
  let mob;
  if (kind === 'treant') {
    mob = createBoss({ name: 'Treant Buddy', title: 'friend', shape: 'treant', color: '#6a4a2e', accent: c, size: 2.6, lite: true }, { quality: 'low' });
    mob.attack = () => mob.play('sweep');
  } else if (kind === 'golem') mob = createEnemy({ name: isLight(c) ? 'Snow Golem Buddy' : 'Rock Golem Buddy', shape: 'golem', color: c, eyes: isLight(c) ? '#7fd8ff' : '#ffd060', size: 0.85 }, { quality });
  else if (kind === 'bird' || kind === 'phoenix') mob = createEnemy({ name: kind === 'phoenix' ? 'Fire Phoenix' : 'Storm Bird', shape: 'flyer', color: c, eyes: kind === 'phoenix' ? '#ffe070' : '#d8f0ff', size: kind === 'phoenix' ? 1.2 : 1.0 }, { quality });
  else if (kind === 'skeleton') mob = createEnemy({ name: 'Skeleton Warrior Friend', shape: 'humanoid', color: c, eyes: '#7affc8', size: 0.95 }, { quality });
  else mob = createEnemy({ name: 'Spirit Clone', shape: 'humanoid', color: c, size: 1 }, { quality });
  mob.friendly = true; mob.summonKind = kind;
  mob.baseRim = { color: c, strength: 0.45 };
  if (mob._look) mob._look();
  return mob;
}