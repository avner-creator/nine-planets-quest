// humanAnim.js - procedural animation for every human-shaped rig (heroes, NPCs, bandits, humanoid
// monsters and humanoid bosses). Poses are functions of time; attacks/casts are keyframed layers.
import * as THREE from 'three';
import { Animator, Pose, Spring, instantiate, jointMap, clamp, lerp, smooth, sstep, TAU, applyLook } from './rigkit.js';

const PI = Math.PI;

// ------------------------------------------------------------------ pose helpers
export function poseKit(J, D) {
  const s = D.s;
  const K = {
    arm(P, S, pitch, yaw, abd, elbow, twist = 0, wrist = 0, dev = 0) {
      const sd = S === 'L' ? 1 : -1;
      P.e(J['uarm' + S], pitch, yaw * sd, abd * sd, 'YXZ');
      P.e(J['farm' + S], elbow, twist * sd, 0);
      P.e(J['hand' + S], wrist, 0, dev * sd);
    },
    leg(P, S, pitch, abd, knee, ankle, roll = 0, yaw = 0) {
      const sd = S === 'L' ? 1 : -1;
      P.e(J['thigh' + S], pitch, yaw * sd, abd * sd + roll);
      P.e(J['shin' + S], knee);
      P.e(J['foot' + S], ankle);
    },
    torso(P, x, y, z = 0) { P.e(J.spine, x * 0.45, y * 0.4, z * 0.45); P.e(J.chest, x * 0.55, y * 0.6, z * 0.55); },
    look(P, x, y = 0, z = 0) { P.e(J.neck, x * 0.4, y * 0.4, z * 0.4); P.e(J.head, x * 0.6, y * 0.6, z * 0.6); },
    lids(P, a) { P.e(J.lidL, a); P.e(J.lidR, a); },
    crouch(P, k, hipPitch = 0) { // k 0..1, keeps feet flat
      const th = -0.95 * k, kn = 1.7 * k;
      P.off(J.hips, 0, -0.32 * k * s, 0.05 * k * s);
      P.e(J.hips, hipPitch);
      K.leg(P, 'L', th - hipPitch, 0.06, kn, -(th + kn) - 0.0);
      K.leg(P, 'R', th - hipPitch, 0.06, kn, -(th + kn) - 0.0);
    },
    stance(P, k) { // fighting stance: left foot forward
      P.off(J.hips, 0, -0.06 * k * s, 0);
      K.leg(P, 'L', -0.38 * k, 0.07, 0.42 * k, -0.04 * k);
      K.leg(P, 'R', 0.28 * k, 0.09, 0.32 * k, -0.6 * k);
    },
  };
  return K;
}

// ------------------------------------------------------------------ base poses
export function humanPoses(J, D) {
  const s = D.s;
  const K = poseKit(J, D);
  const { arm, leg, look } = K;
  const OPEN = -0.55;
  const P0 = {
    idle(P, t, c) {
      const br = Math.sin(t * 1.8), sw = Math.sin(t * 0.5), sw2 = Math.sin(t * 0.31 + 1);
      const hx = 0.014 * sw * s, hr = -0.022 * sw;
      P.off(J.hips, hx, (-0.008 + 0.002 * br) * s, 0);
      P.e(J.hips, 0, 0.03 * sw2, hr);
      P.e(J.spine, 0.02, -0.01 * sw2, -hr * 0.6);
      P.e(J.chest, -0.03 + 0.014 * br, -0.02 * sw2, -hr * 0.4);
      look(P, 0.06, 0.18 * Math.sin(t * 0.23 + 2), 0.02 * sw);
      arm(P, 'L', 0.05 + 0.015 * br, 0, 0.13 + 0.01 * br, -0.25, 0.4, 0.1);
      if (c.armed) arm(P, 'R', -0.1 + 0.01 * br, 0.1, 0.18, -0.5, 0.15, 0.72, 0.0);
      else arm(P, 'R', 0.05 + 0.015 * br, 0, 0.13 + 0.01 * br, -0.25, 0.4, 0.1);
      const comp = -hr - hx / (0.85 * s);
      const kL = 0.06 + 0.1 * Math.max(0, -sw), kR = 0.06 + 0.1 * Math.max(0, sw);
      leg(P, 'L', -0.03 - kL * 0.4, 0.06, kL, 0.03 + kL * 0.6 - 0.03, comp);
      leg(P, 'R', -0.03 - kR * 0.4, 0.06, kR, 0.03 + kR * 0.6 - 0.03, comp);
      K.lids(P, OPEN);
    },
    walk(P, t, c) {
      const ph = c.phase, sn = Math.sin(ph), cs = Math.cos(ph);
      const a = c.walkAmt;
      const roll = -0.035 * cs * a;
      P.off(J.hips, 0, (-0.022 + 0.02 * Math.cos(2 * ph)) * s * a, 0);
      P.e(J.hips, 0.03, -0.1 * sn * a, roll);
      P.e(J.spine, 0.03, 0.05 * sn * a, -roll * 0.5);
      P.e(J.chest, -0.01, 0.08 * sn * a, -roll * 0.4);
      look(P, 0.0, -0.08 * sn * a, 0);
      for (const [S, p] of [['L', ph], ['R', ph + PI]]) {
        const s2 = Math.sin(p);
        const pitch = (-0.36 * s2 - 0.04) * a;
        const sw = Math.max(0, Math.cos(p + 0.6));
        const knee = 0.07 + 0.85 * a * Math.pow(sw, 1.5) + 0.1 * Math.max(0, -Math.sin(p + 0.3)) * a;
        const flat = -(pitch + knee + 0.03);
        const ankle = flat - 0.22 * Math.pow(Math.max(0, s2), 6) * a + 0.25 * sw * a;
        leg(P, S, pitch, 0.05, knee, ankle, -roll);
      }
      arm(P, 'L', 0.34 * sn * a + 0.04, 0, 0.11, -0.22 - 0.35 * Math.max(0, -sn) * a, 0.4, 0.1);
      if (c.armed) arm(P, 'R', -0.12 - 0.2 * sn * a, -0.1, 0.18, -0.95 - 0.15 * Math.max(0, sn), 0.15, 0.55);
      else arm(P, 'R', -0.34 * sn * a + 0.04, 0, 0.11, -0.22 - 0.35 * Math.max(0, sn) * a, 0.4, 0.1);
      K.lids(P, OPEN);
    },
    run(P, t, c) {
      const ph = c.phase, sn = Math.sin(ph);
      const a = c.runAmt;
      P.off(J.hips, 0, (-0.06 + 0.045 * Math.cos(2 * ph)) * s * a, 0);
      P.e(J.hips, 0.08 * a, -0.16 * sn * a, 0);
      P.e(J.spine, 0.12 * a, 0.08 * sn * a, 0);
      P.e(J.chest, 0.06 * a, 0.14 * sn * a, 0);
      look(P, -0.16 * a, -0.12 * sn * a, 0);
      for (const [S, p] of [['L', ph], ['R', ph + PI]]) {
        const s2 = Math.sin(p);
        const pitch = (-0.78 * s2 - 0.28) * a;
        const sw = Math.max(0, Math.cos(p + 0.5));
        const knee = 0.25 + 1.65 * a * Math.pow(sw, 1.2) + 0.25 * Math.max(0, -Math.sin(p + 0.2)) * a;
        const ankle = -(pitch + knee + 0.08 * a) * 0.55 + 0.35 * a;
        leg(P, S, pitch, 0.04, knee, ankle);
      }
      arm(P, 'L', 0.7 * sn * a - 0.1, -0.15, 0.1, -1.35, 0.5, 0.0);
      if (c.armed) arm(P, 'R', -0.25 - 0.45 * sn * a, -0.15, 0.2, -1.15, 0.2, 0.6);
      else arm(P, 'R', -0.7 * sn * a - 0.1, -0.15, 0.1, -1.35, 0.5, 0.0);
      K.lids(P, OPEN);
    },
    jump(P, t, c) {
      const k = sstep(0, 0.25, t);
      P.e(J.spine, 0.12 * k); P.e(J.chest, 0.05 * k);
      look(P, -0.1 * k);
      leg(P, 'L', -0.85 * k, 0.08, 1.25 * k, 0.15 * k);
      leg(P, 'R', -0.35 * k, 0.08, 0.95 * k, 0.4 * k);
      arm(P, 'L', -0.75 * k, 0.1, 0.45, -0.65, 0.3, 0);
      if (c.armed) arm(P, 'R', -0.9 * k, -0.2, 0.4, -0.8, 0.2, 0.5);
      else arm(P, 'R', -0.75 * k, 0.1, 0.45, -0.65, 0.3, 0);
      K.lids(P, OPEN);
    },
    fall(P, t) {
      const f = Math.sin(t * 6), g = Math.sin(t * 4.3 + 1);
      P.e(J.spine, -0.06); P.e(J.chest, -0.05);
      look(P, 0.12);
      leg(P, 'L', -0.35 + 0.12 * f, 0.1, 0.55 + 0.1 * g, 0.25);
      leg(P, 'R', 0.05 - 0.1 * f, 0.1, 0.35 - 0.08 * g, 0.3);
      arm(P, 'L', -0.65 + 0.12 * g, 0.2, 0.85 + 0.1 * f, -0.4, 0.3, 0);
      arm(P, 'R', -0.65 - 0.12 * g, 0.2, 0.85 - 0.1 * f, -0.5, 0.3, 0.4);
      K.lids(P, OPEN);
    },
    swim(P, t, c) {
      const ph = c.swimPh, a = clamp(0.5 + c.speed * 0.15, 0.5, 1);
      P.e(J.hips, 1.38, 0.1 * Math.sin(ph), 0);
      P.off(J.hips, 0, 0.36 * s, -0.05 * s);
      P.e(J.spine, -0.12, -0.06 * Math.sin(ph), 0); P.e(J.chest, -0.1, -0.1 * Math.sin(ph), 0);
      P.e(J.neck, -0.55); P.e(J.head, -0.45 + 0.05 * Math.sin(ph * 2));
      const sL = ((ph % TAU) + TAU) % TAU, sR = (sL + PI) % TAU;
      const stroke = (S, x) => {
        const rec = Math.max(0, Math.sin(x)); // recovery above water
        arm(P, S, -PI + x, 0.0, 0.18 + 0.45 * rec, -0.25 - 0.6 * rec, 0.3, 0.2);
      };
      stroke('L', sL); stroke('R', sR);
      const k = Math.sin(ph * 3) * a;
      leg(P, 'L', 0.12 + 0.22 * k, 0.06, 0.25 + 0.2 * k, 0.9);
      leg(P, 'R', 0.12 - 0.22 * k, 0.06, 0.25 - 0.2 * k, 0.9);
      K.lids(P, OPEN);
    },
    fly(P, t, c) {
      const lean = clamp(c.speed / 7, 0, 1);
      const b = Math.sin(t * 2.2);
      P.e(J.hips, 0.25 + 1.05 * lean + 0.03 * b, 0, 0.04 * Math.sin(t * 1.3));
      P.off(J.hips, 0, (0.05 + 0.03 * b) * s, 0);
      P.e(J.spine, -0.05 * lean); P.e(J.chest, -0.05 * lean);
      look(P, -0.25 - 0.8 * lean);
      arm(P, 'R', lerp(-0.4, -PI + 0.12, lean), -0.05, 0.12, lerp(-0.6, -0.05, lean), 0.3, lerp(0.6, 1.45, lean));
      arm(P, 'L', lerp(-0.2, 0.18, lean), 0, lerp(0.5, 0.2, lean), -0.25, 0.3, 0.2);
      leg(P, 'L', lerp(-0.15, 0.06, lean), 0.05, lerp(0.35, 0.12, lean), 0.6 + 0.05 * b);
      leg(P, 'R', lerp(0.05, 0.12, lean), 0.05, lerp(0.6, 0.45, lean) + 0.05 * b, 0.7);
      K.lids(P, OPEN);
    },
    sleep(P, t) {
      const br = Math.sin(t * 1.1);
      P.e(J.hips, -PI / 2, 0, 0);
      P.off(J.hips, 0, (0.13 - 0.97) * s, -0.05 * s);
      P.e(J.spine, 0.02 * br * 0.5); P.e(J.chest, 0.025 * br);
      P.e(J.neck, 0.18); P.e(J.head, 0.1, 0, 0.25);
      arm(P, 'L', 0.05, 0, 0.16, -0.35, 0.6, 0.1);
      arm(P, 'R', 0.05, 0, 0.14, -0.4, 0.6, 0.1);
      leg(P, 'L', -0.03, 0.08, 0.08, 0.6);
      leg(P, 'R', -0.06, 0.04, 0.15, 0.55, 0, 0.15);
      K.lids(P, 1.1);
    },
    dead(P, t) {
      const u = clamp(t / 0.8, 0, 1), f = u * u;
      const tb = t - 0.8, bounce = tb > 0 ? Math.exp(-tb * 8) * Math.sin(tb * 22) * 0.05 : 0;
      const kn = Math.sin(Math.min(1, t / 0.7) * PI);
      P.e(J.hips, -1.52 * f + bounce, 0.1 * f, 0.12 * f);
      P.off(J.hips, 0, lerp(0, (0.12 - 0.97) * s, Math.pow(u, 0.9)) - 0.12 * kn * s * (1 - u), -0.25 * f * s);
      P.e(J.spine, 0.25 * (1 - f) - 0.05 * f); P.e(J.chest, 0.1 * (1 - f));
      P.e(J.neck, 0.1 * (1 - f)); P.e(J.head, 0.05, 0.1 * f, 0.5 * f);
      leg(P, 'L', -0.55 * kn - 0.1 * f, 0.1 + 0.12 * f, 1.2 * kn + 0.12, 0.3 * f);
      leg(P, 'R', -0.4 * kn - 0.02 * f, 0.08 + 0.2 * f, 1.0 * kn + 0.25 * f, 0.4 * f, 0, 0.3 * f);
      arm(P, 'L', -0.5 * f, 0, 0.3 + 0.95 * f, -0.2 - 0.3 * f, 0.5, 0);
      arm(P, 'R', -0.3 * f, 0, 0.3 + 0.7 * f, -0.4 - 0.4 * f, 0.4, 0.2);
      K.lids(P, lerp(OPEN, 1.1, sstep(0.6, 1.0, u)));
    },
    build(P, t, c) {
      const r = Math.sin(t * 5.5), k = sstep(0, 0.2, t);
      P.e(J.spine, 0.08 * k); P.e(J.chest, 0.06 * k, -0.15 * k);
      look(P, 0.15 * k, -0.1 * k);
      arm(P, 'R', -1.25 * k - 0.2 * r * k, 0.15, 0.15, -0.35 - 0.25 * r * k, 0.2, c.armed ? 0.5 : -0.2);
      arm(P, 'L', -0.1, 0, 0.15, -0.5, 0.4, 0.1);
      leg(P, 'L', -0.18 * k, 0.06, 0.15 * k, 0.03);
      leg(P, 'R', 0.12 * k, 0.08, 0.15 * k, -0.27 * k);
      K.lids(P, OPEN);
    },
  };
  P0.move = P0.walk;
  return P0;
}

// ------------------------------------------------------------------ actions (attacks / casts / hurt)
const base = () => {};
export function humanActions(J, D) {
  const K = poseKit(J, D);
  const { arm, torso, look, leg } = K;
  const stance = (P, c, k) => { if (!c || c.speed < 0.6) K.stance(P, k); };
  const A = {
    // right-to-left horizontal slash
    slash0: () => ({
      dur: 0.58, hit: 0.22, keys: [
        [0, base],
        [0.14, (P, c) => { torso(P, 0.0, -0.75, 0.05); look(P, 0, 0.5); arm(P, 'R', -1.25, 1.2, 0.25, -1.2, 0.5, -0.45); arm(P, 'L', -0.5, -0.5, 0.3, -0.9, 0.3, 0); stance(P, c, 0.6); }, 'o'],
        [0.24, (P, c) => { torso(P, 0.06, 0.15, 0); look(P, 0, 0.1); arm(P, 'R', -1.45, 0.2, 0.15, -0.25, 0.2, 1.25); arm(P, 'L', -0.2, -0.1, 0.4, -0.8, 0.3, 0); stance(P, c, 1); }, 'i'],
        [0.36, (P, c) => { torso(P, 0.12, 0.75, -0.05); look(P, 0.05, -0.3); arm(P, 'R', -1.3, -1.0, 0.25, -0.55, 0.1, 1.2); arm(P, 'L', 0.2, 0.2, 0.55, -0.6, 0.3, 0); stance(P, c, 1); }, 'o'],
        [0.58, base],
      ],
    }),
    // backhand left-to-right slash
    slash1: () => ({
      dur: 0.58, hit: 0.24, keys: [
        [0, base],
        [0.15, (P, c) => { torso(P, 0.04, 0.7, 0); look(P, 0, -0.4); arm(P, 'R', -1.2, -1.15, 0.1, -1.6, -0.3, -0.2); arm(P, 'L', 0.15, 0, 0.45, -0.5, 0.3, 0); stance(P, c, 0.7); }, 'o'],
        [0.26, (P, c) => { torso(P, 0.06, -0.1, 0); look(P, 0, 0); arm(P, 'R', -1.5, -0.05, 0.2, -0.25, -0.4, 1.25); arm(P, 'L', -0.3, -0.3, 0.45, -0.7, 0.3, 0); stance(P, c, 1); }, 'i'],
        [0.38, (P, c) => { torso(P, 0.08, -0.75, 0.05); look(P, 0, 0.35); arm(P, 'R', -1.2, 1.25, 0.35, -0.35, -0.3, 1.1); arm(P, 'L', -0.5, -0.5, 0.35, -0.9, 0.3, 0); stance(P, c, 1); }, 'o'],
        [0.58, base],
      ],
    }),
    // heavy overhead slam
    slam: () => ({
      dur: 0.9, hit: 0.47, keys: [
        [0, base],
        [0.3, (P, c) => { torso(P, -0.3, -0.15, 0); look(P, -0.2); arm(P, 'R', -2.75, 0.15, 0.15, -1.0, 0.0, 0.6); arm(P, 'L', -2.6, 0.5, 0.05, -1.1, 0.3, 0.3); if (!c || c.speed < 0.6) { P.off(J.hips, 0, 0.02 * D.s, 0); K.stance(P, 0.4); } }, 'o'],
        [0.47, (P, c) => { torso(P, 0.65, 0.05, 0); look(P, 0.1); arm(P, 'R', -0.75, 0.15, 0.1, -0.15, 0.0, 1.2); arm(P, 'L', -0.7, 0.45, 0.05, -0.3, 0.3, 0.3); if (!c || c.speed < 0.6) { K.stance(P, 1); P.addOff(J.hips, 0, -0.1 * D.s, 0.03 * D.s); } }, 'i'],
        [0.66, (P, c) => { torso(P, 0.6, 0.05, 0); look(P, 0.1); arm(P, 'R', -0.65, 0.15, 0.1, -0.2, 0.0, 1.2); arm(P, 'L', -0.6, 0.45, 0.05, -0.35, 0.3, 0.3); if (!c || c.speed < 0.6) { K.stance(P, 1); P.addOff(J.hips, 0, -0.1 * D.s, 0.03 * D.s); } }],
        [0.9, base],
      ],
      fadeOut: 0.25,
    }),
    hurt: () => ({
      dur: 0.4, hit: 0, layer: 'hurt', weight: 0.9, fadeIn: 0.03, fadeOut: 0.25, keys: [
        [0, base],
        [0.08, (P) => { P.r(J.spine, -0.18, 0.12, 0); P.r(J.chest, -0.12, 0.1, 0); P.r(J.head, -0.3, -0.15, 0.1); P.r(J.uarmL, 0, 0, 0.3); P.r(J.uarmR, 0, 0, -0.3); P.addOff(J.hips, 0, -0.02 * D.s, -0.03 * D.s); K.lids(P, 0.6); }, 'o'],
        [0.4, base],
      ],
    }),
  };
  // ---- casts (left hand casts; sword stays in the right hand)
  const C = {
    fire: () => ({ dur: 0.62, rel: 0.3, keys: [[0, base],
      [0.16, (P, c) => { torso(P, -0.05, 0.55, 0); look(P, 0, -0.4); arm(P, 'L', 0.5, 0.2, 0.55, -1.7, 0.4, -0.2); stance(P, c, 0.6); }, 'o'],
      [0.3, (P, c) => { torso(P, 0.1, -0.4, 0); look(P, 0, 0.3); arm(P, 'L', -1.55, -0.2, 0.15, -0.05, 1.2, -0.4); stance(P, c, 1); }, 'i'],
      [0.45, (P, c) => { torso(P, 0.12, -0.45, 0); look(P, 0, 0.35); arm(P, 'L', -1.4, -0.3, 0.15, -0.15, 1.2, -0.3); stance(P, c, 1); }],
      [0.62, base]] }),
    lightning: () => ({ dur: 0.6, rel: 0.24, keys: [[0, base],
      [0.12, (P, c) => { torso(P, 0, 0.35, 0); arm(P, 'L', -0.3, 0.3, 0.3, -1.6, 0.6, 0); stance(P, c, 0.5); }, 'o'],
      [0.24, (P, c) => { torso(P, 0.05, -0.3, 0); look(P, 0, 0.3); arm(P, 'L', -1.6, -0.05, 0.08, 0, 1.4, -0.5, -0.3); stance(P, c, 1); }, 'i'],
      [0.42, (P, c) => { torso(P, 0.05, -0.3, 0); look(P, 0, 0.3); arm(P, 'L', -1.58, -0.05, 0.1, -0.05, 1.4, -0.5, -0.3); stance(P, c, 1); }],
      [0.6, base]] }),
    light: () => ({ dur: 0.9, rel: 0.36, keys: [[0, base],
      [0.2, (P, c) => { torso(P, -0.08, 0, 0); arm(P, 'L', -0.7, -0.7, 0.2, -1.9, 0.5, 0); arm(P, 'R', -0.7, -0.7, 0.2, -1.8, 0.2, 0.6); stance(P, c, 0.5); }, 'o'],
      [0.36, (P, c) => { torso(P, 0.08, 0, 0); look(P, 0.05); arm(P, 'L', -1.55, -0.3, 0.05, -0.05, 1.3, -0.6); arm(P, 'R', -1.5, -0.3, 0.05, -0.1, 0.2, 0.9); stance(P, c, 1); }, 'i'],
      [0.72, (P, c) => { torso(P, 0.1, 0, 0); look(P, 0.05); arm(P, 'L', -1.55, -0.28, 0.05, -0.05, 1.3, -0.6); arm(P, 'R', -1.5, -0.28, 0.05, -0.1, 0.2, 0.9); stance(P, c, 1); }],
      [0.9, base]] }),
    healing: () => ({ dur: 1.05, rel: 0.38, keys: [[0, base],
      [0.38, (P) => { torso(P, -0.18, 0, 0); look(P, -0.45); arm(P, 'L', -2.35, 0.25, 0.45, -0.25, 1.0, -0.3); arm(P, 'R', -2.3, 0.25, 0.45, -0.3, 0.2, 0.5); }, 'o'],
      [0.82, (P) => { torso(P, -0.15, 0, 0); look(P, -0.4); arm(P, 'L', -2.4, 0.3, 0.5, -0.2, 1.0, -0.3); arm(P, 'R', -2.35, 0.3, 0.5, -0.25, 0.2, 0.5); }],
      [1.05, base]] }),
    ice: () => ({ dur: 0.8, rel: 0.36, keys: [[0, base],
      [0.2, (P, c) => { torso(P, 0.2, 0, 0); look(P, 0.15); arm(P, 'L', -1.25, -0.95, 0.1, -1.55, 0.6, 0); arm(P, 'R', -1.2, -0.9, 0.1, -1.5, 0.2, 0.5); if (!c || c.speed < 0.6) K.crouch(P, 0.25); }, 'o'],
      [0.36, (P) => { torso(P, -0.12, 0, 0); look(P, -0.1); arm(P, 'L', -0.35, 0.2, 1.35, -0.05, 1.2, -0.5); arm(P, 'R', -0.35, 0.2, 1.3, -0.1, 0.3, 0.5); }, 'i'],
      [0.6, (P) => { torso(P, -0.1, 0, 0); look(P, -0.1); arm(P, 'L', -0.3, 0.2, 1.3, -0.1, 1.2, -0.5); arm(P, 'R', -0.3, 0.2, 1.25, -0.15, 0.3, 0.5); }],
      [0.8, base]] }),
    earth: () => ({ dur: 1.0, rel: 0.52, keys: [[0, base],
      [0.3, (P) => { torso(P, -0.25, 0, 0); look(P, -0.25); arm(P, 'L', -2.8, 0.3, 0.2, -0.7, 0.3, 0); arm(P, 'R', -2.8, 0.3, 0.2, -0.7, 0.2, 0.5); P.off(J.hips, 0, 0.04 * D.s, 0); }, 'o'],
      [0.52, (P) => { torso(P, 0.75, 0, 0); look(P, 0.2); arm(P, 'L', -0.55, 0.1, 0.25, -0.1, 0.3, 0); arm(P, 'R', -0.55, 0.1, 0.25, -0.15, 0.2, 0.6); K.crouch(P, 0.75, 0.15); }, 'i'],
      [0.75, (P) => { torso(P, 0.7, 0, 0); look(P, 0.2); arm(P, 'L', -0.5, 0.1, 0.25, -0.15, 0.3, 0); arm(P, 'R', -0.5, 0.1, 0.25, -0.2, 0.2, 0.6); K.crouch(P, 0.7, 0.15); }],
      [1.0, base]], fadeOut: 0.25 }),
    life: () => ({ dur: 0.95, rel: 0.42, keys: [[0, base],
      [0.3, (P) => { torso(P, 0.5, 0, 0); look(P, 0.25); arm(P, 'L', -0.75, -0.1, 0.25, -0.15, 1.3, -0.9); arm(P, 'R', -0.7, -0.1, 0.25, -0.2, 0.2, 0.5); K.crouch(P, 0.55, 0.1); }, 'o'],
      [0.75, (P) => { torso(P, 0.55, 0, 0); look(P, 0.3); arm(P, 'L', -0.8, -0.1, 0.25, -0.1, 1.3, -1.0); arm(P, 'R', -0.75, -0.1, 0.25, -0.15, 0.2, 0.5); K.crouch(P, 0.6, 0.1); }],
      [0.95, base]] }),
    darkness: () => ({ dur: 0.9, rel: 0.42, keys: [[0, base],
      [0.22, (P, c) => { torso(P, 0.35, 0, 0); look(P, 0.3); arm(P, 'L', -1.0, -1.05, 0.1, -2.0, 0.4, 0.3); arm(P, 'R', -0.95, -1.0, 0.1, -1.9, 0.2, 0.5); if (!c || c.speed < 0.6) K.crouch(P, 0.3); }, 'o'],
      [0.42, (P) => { torso(P, -0.22, 0, 0); look(P, -0.3); arm(P, 'L', 0.35, 0.1, 1.05, -0.2, 1.0, -0.3); arm(P, 'R', 0.35, 0.1, 1.0, -0.25, 0.3, 0.5); }, 'i'],
      [0.7, (P) => { torso(P, -0.2, 0, 0); look(P, -0.25); arm(P, 'L', 0.3, 0.1, 1.0, -0.25, 1.0, -0.3); arm(P, 'R', 0.3, 0.1, 0.95, -0.3, 0.3, 0.5); }],
      [0.9, base]] }),
    death: () => ({ dur: 1.1, rel: 0.58, keys: [[0, base],
      [0.34, (P, c) => { torso(P, -0.1, -1.1, 0.1); look(P, 0, 0.7); arm(P, 'R', -2.3, -0.9, 0.3, -0.6, 0.2, 0.9); arm(P, 'L', -2.0, -1.4, 0.1, -0.9, 0.5, 0.2); if (!c || c.speed < 0.6) K.stance(P, 0.8); }, 'o'],
      [0.58, (P, c) => { torso(P, 0.35, 0.3, -0.05); look(P, 0.2, -0.2); arm(P, 'R', -1.1, 0.4, 0.2, -0.2, 0.2, 1.2); arm(P, 'L', -1.0, 0.0, 0.1, -0.5, 0.5, 0.2); if (!c || c.speed < 0.6) { K.stance(P, 1); P.addOff(J.hips, 0, -0.06 * D.s, 0); } }, 'i'],
      [0.78, (P, c) => { torso(P, 0.4, 1.05, -0.1); look(P, 0.2, -0.5); arm(P, 'R', -0.7, 1.2, 0.3, -0.5, 0.2, 1.1); arm(P, 'L', -0.4, 0.8, 0.3, -0.9, 0.5, 0.2); if (!c || c.speed < 0.6) { K.stance(P, 1); P.addOff(J.hips, 0, -0.06 * D.s, 0); } }, 'o'],
      [1.1, base]], fadeOut: 0.3 }),
  };
  return { A, C };
}

// ------------------------------------------------------------------ runtime rig
// Contract Rig: root, height, radius, setSword, setArmor, setPose, setMoveSpeed, attack, cast, hurt,
// swordTip, handR, update, dispose.
export class HumanRig {
  constructor({ tpl, D, material, height, radius, attackSpeed = 1, extraMeshes = [] }) {
    this.root = new THREE.Object3D();
    this.root.name = 'rig';
    this.material = material;
    this.tpl = tpl;
    const inst = instantiate(tpl, { main: material });
    this.inst = inst;
    this.mesh = inst.meshes.main;
    this.root.add(inst.holder);
    this.D = D;
    this.J = jointMap(tpl);
    this.height = height ?? 1.8 * D.s;
    this.radius = radius ?? 0.42 * D.x / D.s * D.s;
    this.attackSpeed = attackSpeed;
    this.anim = new Animator(inst.bones, tpl.bones.map((b) => b.local));
    this.anim.poses = humanPoses(this.J, D);
    const { A, C } = humanActions(this.J, D);
    this.A = A; this.C = C;
    this.ctx = { speed: 0, phase: 0, swimPh: 0, armed: false, walkAmt: 1, runAmt: 1, pose: 'idle' };
    this.anim.setPose('idle');
    this.anim.post = (P, dt) => this._post(P, dt);
    this.handR = inst.bone.handR; this.handL = inst.bone.handL; this.head = inst.bone.head;
    this.swordTip = null; this.sword = null;
    this._blinkT = 1 + Math.random() * 3; this._blink = 0;
    this._capeS = [new Spring(40, 7), new Spring(40, 7), new Spring(40, 7), new Spring(40, 7)];
    this._hairS = [new Spring(50, 6), new Spring(50, 6)];
    this._hairX = new Spring(50, 6);
    this._last = new THREE.Vector3(); this._lastYaw = 0; this._vel = 0; this._turn = 0; this._first = true;
    this._flash = 0; this._time = Math.random() * 10;
    this.hasCape = tpl.bones.some((b) => b.name === 'cape0');
    this.hasTail = tpl.bones.some((b) => b.name === 'hairA');
    this.disposed = false;
    this.anim.update(0, this.ctx);
  }
  setPose(name) {
    if (name === 'move') name = 'walk';
    if (!this.anim.poses[name]) return;
    if (name !== this.ctx.pose) {
      const fade = name === 'dead' ? 0.12 : name === 'jump' || name === 'fall' ? 0.15 : name === 'sleep' ? 0.5 : 0.22;
      this.anim.setPose(name, fade);
      if (name === 'dead' || name === 'sleep') this.anim.clearActions();
      this.ctx.pose = name;
      if (this.sword) this.sword.visible = name !== 'sleep' && name !== 'swim';
    }
  }
  setMoveSpeed(mps) { this.ctx.speed = Math.max(0, mps || 0); }
  attack(combo = 0) {
    const make = combo === 1 ? this.A.slash1 : combo === 2 ? this.A.slam : this.A.slash0;
    const a = make();
    const sp = this.attackSpeed, out = { duration: a.dur / sp, hitTime: a.hit / sp };
    this._play(a, sp); // (_play rescales the action's own keys)
    return out;
  }
  cast(powerId) {
    const make = this.C[powerId] || this.C.fire;
    const a = make();
    this._play(a, 1);
    return { duration: a.dur, releaseTime: a.rel };
  }
  _play(a, sp) {
    if (this.ctx.pose === 'dead' || this.ctx.pose === 'sleep') return;
    if (sp !== 1) { a.dur /= sp; a.hit /= sp; if (a.rel) a.rel /= sp; for (const k of a.keys) k[0] /= sp; }
    a.layer = a.layer || 'action';
    this.anim.play(a);
  }
  hurt() {
    if (this.ctx.pose === 'dead') return;
    this.anim.play(this.A.hurt());
    this._flash = 1;
  }
  _post(P, dt) {
    const J = this.J, c = this.ctx;
    // blink
    this._blinkT -= dt;
    if (this._blinkT < 0) { this._blink = 0.14; this._blinkT = 2 + Math.random() * 4; }
    if (this._blink > 0) {
      this._blink -= dt;
      if (c.pose !== 'sleep' && c.pose !== 'dead') { const k = Math.sin((1 - this._blink / 0.14) * Math.PI); P.e(J.lidL, lerp(-0.55, 1.1, k)); P.e(J.lidR, lerp(-0.55, 1.1, k)); }
    }
    // cape: lift with speed and leg swing, sway; streams in fly pose
    if (this.hasCape) {
      const sp = clamp(this._vel, 0, 12);
      const fly = c.pose === 'fly', lying = c.pose === 'sleep' || c.pose === 'dead' || c.pose === 'swim';
      const legBack = Math.max(0, Math.max(this._thighPitch(P, 'L'), this._thighPitch(P, 'R')));
      const t = this._time;
      const bodyPitch = fly || lying ? 0 : this._xang(P, J.hips) + this._xang(P, J.spine) + this._xang(P, J.chest);
      const lift = fly ? 0.15 : lying ? -0.05 : Math.max(0, Math.min(1.0, sp * 0.085) + legBack * 0.75 + 0.06 - bodyPitch * 0.9);
      for (let i = 0; i < 4; i++) {
        const flutter = (fly ? 0.12 + 0.08 * Math.min(1, sp / 6) : 0.02 + 0.03 * Math.min(1, sp / 5)) * Math.sin(t * (fly ? 9 : 4) - i * 1.1);
        const target = (i === 0 ? lift : lift * 0.12 * (fly ? 0.3 : 1)) + flutter + (i > 0 ? 0.04 : 0) - (i === 0 ? 0 : 0);
        const v = this._capeS[i].step(target, dt);
        P.e(J['cape' + i], v, 0, i === 0 ? clamp(-this._turn * 0.08, -0.25, 0.25) : 0);
      }
    }
    if (this.hasTail) {
      const sp = clamp(this._vel, 0, 10);
      const t = this._time;
      const a = this._hairS[0].step(0.15 + sp * 0.04 + 0.05 * Math.sin(t * 2.3), dt);
      const b = this._hairS[1].step(0.1 + sp * 0.02 + 0.06 * Math.sin(t * 2.3 - 1), dt);
      const z = this._hairX.step(clamp(-this._turn * 0.1, -0.4, 0.4) + 0.04 * Math.sin(t * 1.7), dt);
      P.e(J.hairA, a, 0, z); P.e(J.hairB, b, 0, z * 0.6);
    }
  }
  _xang(P, i) { i *= 4; return 2 * Math.atan2(P.q[i], P.q[i + 3]); }
  _thighPitch(P, S) {
    const i = this.J['thigh' + S] * 4; // approximate x-rotation from quaternion
    return 2 * Math.atan2(P.q[i], P.q[i + 3]);
  }
  update(dt) {
    if (this.disposed) return;
    dt = Math.min(dt, 0.1);
    this._time += dt;
    // measure real velocity & turning of the root (for cape / hair)
    const p = this.root.getWorldPosition(_wp);
    const yaw = this.root.rotation.y;
    if (this._first) { this._last.copy(p); this._lastYaw = yaw; this._first = false; }
    if (dt > 0) {
      const v = Math.hypot(p.x - this._last.x, p.z - this._last.z) / dt;
      this._vel = lerp(this._vel, Math.max(v, this.ctx.speed), Math.min(1, dt * 6));
      let dy = yaw - this._lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this._turn = lerp(this._turn, dy / dt, Math.min(1, dt * 5));
    }
    this._last.copy(p); this._lastYaw = yaw;
    const c = this.ctx;
    const pose = c.pose;
    const sp = c.speed > 0.05 ? c.speed : pose === 'run' ? 5 : 1.4;
    const stride = (pose === 'run' ? 2.5 : 1.45) * this.D.s;
    if (pose === 'walk' || pose === 'run') c.phase += (TAU * sp / stride) * dt;
    c.walkAmt = clamp(sp / 1.5, 0.55, 1.35);
    c.runAmt = clamp(sp / 5.5, 0.7, 1.2);
    c.swimPh += dt * (1.6 + Math.min(c.speed, 5) * 0.5);
    this.anim.update(dt, c);
    if (this._flash > 0) { this._flash = Math.max(0, this._flash - dt * 5); applyLook([this.material], { flash: this._flash }); }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.inst.skeleton.dispose();
    this.material.dispose();
    if (this.sword) this.sword.removeFromParent();
  }
}
const _wp = new THREE.Vector3();

// ------------------------------------------------------------------ martial arts (hero fight style 'fists', sensei)
export function fistKit(J, D) {
  const K = poseKit(J, D), s = D.s;
  const base = () => {};
  const guard = (P) => { K.arm(P, 'L', -0.95, -0.3, 0.25, -1.95, 0.5, 0.1); K.arm(P, 'R', -0.7, -0.4, 0.25, -2.25, 0.4, 0.1); };
  const ready = (P, k = 1, bounce = 0) => {
    P.off(J.hips, 0, (-0.07 * k + bounce) * s, 0);
    P.e(J.hips, 0, -0.25 * k, 0);
    K.leg(P, 'L', -0.38 * k, 0.1, 0.45 * k, -0.07 * k, 0, 0.25 * k);
    K.leg(P, 'R', 0.3 * k, 0.12, 0.4 * k, -0.7 * k, 0, 0.25 * k);
    K.torso(P, 0.06, -0.15 * k); K.look(P, 0, 0.35 * k);
  };
  const hipsYaw = (P, y, lift = 0) => { P.e(J.hips, 0, y, 0); P.off(J.hips, 0, lift * s, 0); };
  const kickLeg = (P, k) => { // right leg: chamber (k=0) -> extended sideways (k=1)
    K.leg(P, 'R', lerp(-1.0, -0.25, k), lerp(0.55, 1.45, k), lerp(1.7, 0.05, k), 0.5);
    K.leg(P, 'L', -0.08, 0.1, 0.25, -0.15);
    P.e(J.spine, 0, 0, -0.35 * k); P.e(J.chest, 0, 0, -0.2 * k);
    K.arm(P, 'L', -0.6, -0.2, 0.6, -1.6, 0.5, 0.1); K.arm(P, 'R', -0.2, 0, 0.9, -0.9, 0.4, 0.1);
  };
  return {
    guard, ready,
    jab: () => ({ dur: 0.38, hit: 0.13, fadeIn: 0.04, fadeOut: 0.12, tip: 'L', keys: [[0, base],
      [0.06, (P) => { ready(P); guard(P); }, 'o'],
      [0.13, (P) => { ready(P); K.torso(P, 0.06, -0.45); K.arm(P, 'L', -1.52, 0.1, 0.1, -0.04, 0.6, 0.0); K.arm(P, 'R', -0.7, -0.4, 0.25, -2.25, 0.4, 0.1); P.addOff(J.hips, 0, 0, 0.05 * s); }, 'i'],
      [0.22, (P) => { ready(P); guard(P); }],
      [0.38, base]] }),
    cross: () => ({ dur: 0.46, hit: 0.18, fadeIn: 0.04, fadeOut: 0.14, tip: 'R', keys: [[0, base],
      [0.08, (P) => { ready(P); guard(P); K.torso(P, 0.05, -0.45); }, 'o'],
      [0.18, (P) => { ready(P); P.e(J.hips, 0, 0.3, 0); K.torso(P, 0.12, 0.4); K.arm(P, 'R', -1.52, -0.2, 0.1, -0.04, 0.6, 0.0); K.arm(P, 'L', -0.95, -0.3, 0.25, -2.0, 0.5, 0.1); K.leg(P, 'R', 0.25, 0.12, 0.3, -0.45, 0, -0.4); P.addOff(J.hips, 0, 0, 0.07 * s); }, 'i'],
      [0.3, (P) => { ready(P); guard(P); }],
      [0.46, base]] }),
    // spinning roundhouse: the hips turn ~1.25 times, the right leg lands the kick facing forward again
    roundhouse: () => ({ dur: 1.0, hit: 0.62, fadeIn: 0.06, fadeOut: 0.2, tip: 'F', keys: [[0, base],
      [0.1, (P) => { ready(P); guard(P); hipsYaw(P, -0.5, -0.08); }, 'o'],
      [0.2, (P) => { hipsYaw(P, 0.9, -0.02); kickLeg(P, 0); }, 'l'],
      [0.3, (P) => { hipsYaw(P, 2.4, 0.0); kickLeg(P, 0.15); }, 'l'],
      [0.38, (P) => { hipsYaw(P, 3.9, 0.02); kickLeg(P, 0.35); }, 'l'],
      [0.46, (P) => { hipsYaw(P, 5.4, 0.03); kickLeg(P, 0.6); }, 'l'],
      [0.55, (P) => { hipsYaw(P, 7.0, 0.03); kickLeg(P, 0.9); }, 'l'],
      [0.62, (P) => { hipsYaw(P, 7.85, 0.03); kickLeg(P, 1); }, 'o'],
      [0.78, (P) => { hipsYaw(P, 7.85, 0.0); kickLeg(P, 0.2); }],
      [1.0, base]] }),
    flyingKick: () => ({ dur: 0.95, hit: 0.5, fadeIn: 0.06, fadeOut: 0.2, tip: 'F', keys: [[0, base],
      [0.15, (P) => { K.crouch(P, 0.5, 0.15); K.arm(P, 'L', 0.5, 0, 0.3, -0.6, 0.4, 0); K.arm(P, 'R', 0.5, 0, 0.3, -0.6, 0.4, 0); K.torso(P, 0.25, 0); }, 'o'],
      [0.35, (P) => { P.off(J.hips, 0, 0.35 * s, 0); K.leg(P, 'R', -1.2, 0.05, 1.6, 0.3); K.leg(P, 'L', -0.9, 0.08, 1.8, 0.3); K.arm(P, 'L', -1.2, 0.3, 0.5, -1.2, 0.4, 0); K.arm(P, 'R', -0.5, 0.3, 0.6, -1.4, 0.4, 0); K.torso(P, -0.05, 0); }, 'o'],
      [0.5, (P) => { P.off(J.hips, 0, 0.5 * s, 0.25 * s); P.e(J.hips, -0.25, -0.3, 0); K.leg(P, 'R', -1.45, 0.05, 0.04, 0.6); K.leg(P, 'L', -0.7, 0.1, 1.9, 0.4); K.arm(P, 'L', -1.4, -0.4, 0.4, -0.3, 0.4, 0); K.arm(P, 'R', 0.6, 0.2, 0.5, -0.4, 0.4, 0); K.torso(P, -0.25, -0.25); K.look(P, 0.15, 0.25); }, 'i'],
      [0.68, (P) => { P.off(J.hips, 0, 0.25 * s, 0.2 * s); K.leg(P, 'R', -0.9, 0.05, 1.0, 0.3); K.leg(P, 'L', -0.6, 0.1, 1.2, 0.3); guard(P); }],
      [0.82, (P) => { K.crouch(P, 0.35); guard(P); }],
      [0.95, base]] }),
  };
}