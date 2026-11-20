// First-person view: each player can look through their hero's eyes (V for player 1, ; for player 2,
// or scroll the mouse wheel all the way in). The hero's own body is hidden only in that player's view,
// and a sword (or two fists) is drawn in front of the camera, swinging with each attack.
import * as THREE from 'three';
import { clamp } from './util.js';

const Z = new THREE.Vector3(0, 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// sword poses in camera space (camera looks down -Z): hilt position + blade direction
// (x is for a wide screen; it is pulled in for a narrow split-screen view)
const REST = { pos: V(0.4, -0.26, -0.5), dir: V(-0.25, 0.85, -0.45).normalize() };
const SWINGS = [
  { wind: { pos: V(0.36, -0.08, -0.42), dir: V(0.55, 0.72, -0.4).normalize() }, end: { pos: V(-0.24, -0.34, -0.5), dir: V(-0.8, -0.22, -0.55).normalize() } },   // right -> left
  { wind: { pos: V(-0.2, -0.1, -0.44), dir: V(-0.6, 0.68, -0.4).normalize() }, end: { pos: V(0.32, -0.36, -0.48), dir: V(0.8, -0.25, -0.55).normalize() } },   // left -> right
  { wind: { pos: V(0.1, 0.02, -0.36), dir: V(0.05, 0.95, 0.3).normalize() }, end: { pos: V(0.04, -0.4, -0.55), dir: V(0, -0.45, -0.9).normalize() } },        // overhead chop
];
const _p = new THREE.Vector3(), _d = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);

export class FirstPerson {
  constructor(game) {
    this.game = game;
    this.models = [];     // per player: { group, sword, swordGeo, fists, tip, bob, active }
    this.hidden = [];     // hero bodies hidden for the current render
  }

  // turn first person on/off for one player
  toggle(p, on) {
    const cam = p.cam;
    cam.firstPerson = on !== undefined ? !!on : !cam.firstPerson;
    if (!cam.firstPerson) cam.wantDist = Math.max(cam.wantDist, 3.5);
    this.announce(p);
  }
  announce(p) {
    const key = p.ctl && p.ctl.key('view');
    this.game.hud.toastFor(p, p.cam.firstPerson ? `First person! You see through your hero's eyes.${key ? ` ${key} = switch back` : ''}` : 'Third person view', 'info', 2.2);
  }

  model(p) {
    let m = this.models[p.index];
    if (m) return m;
    const group = new THREE.Group();
    group.name = 'fpViewModel';
    group.visible = false;
    m = { group, sword: null, swordGeo: null, fists: null, tip: new THREE.Object3D(), bob: 0, active: false };
    this.game.scene.add(group);
    this.models[p.index] = m;
    return m;
  }

  // keep the held sword / fists matching the hero
  sync(p, m) {
    const raw = p.rig && p.rig.raw;
    const heroSword = raw && raw.sword;
    const fists = !!p.fists;
    const geo = !fists && heroSword && heroSword.geometry ? heroSword.geometry : null;
    if (geo !== m.swordGeo) {
      if (m.sword) { m.sword.removeFromParent(); m.sword = null; }
      m.swordGeo = geo;
      if (geo) {
        const s = new THREE.Mesh(geo, heroSword.material);
        s.castShadow = false; s.receiveShadow = false; s.frustumCulled = false;
        s.scale.setScalar(0.46);
        if (!geo.boundingBox) geo.computeBoundingBox();
        m.tip.position.set(0, 0, geo.boundingBox ? geo.boundingBox.max.z : 1);
        s.add(m.tip);
        m.sword = s;
        m.group.add(s);
      }
    }
    if (fists && !m.fists) {
      const skin = (p.char && p.char.look && p.char.look.skin) || '#c99a74';
      const mat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
      const wrap = new THREE.MeshStandardMaterial({ color: (p.char && p.char.look && p.char.look.outfit) || '#f2efe6', roughness: 0.9 });
      const make = () => {
        const f = new THREE.Group();
        const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.065, 0.085, 2, 2, 2), mat);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.2, 10), wrap);
        arm.rotation.x = Math.PI / 2; arm.position.z = 0.14;
        f.add(fist, arm);
        f.traverse((o) => { o.castShadow = false; o.frustumCulled = false; });
        return f;
      };
      m.fists = { L: make(), R: make() };
      m.group.add(m.fists.L, m.fists.R);
    }
    if (m.fists) { m.fists.L.visible = fists; m.fists.R.visible = fists; }
    if (m.sword) m.sword.visible = !fists;
  }

  // after the cameras moved: place each view model in front of its camera
  update(dt) {
    const g = this.game;
    for (const p of g.players) {
      const m = this.model(p);
      m.group.visible = false;   // only shown while that player's own view is drawn
      m.active = g.phase === 'play' && !!p.cam.fp;
      if (!m.active) continue;
      this.sync(p, m);
      const cam = p.view ? p.view.camera : g.camera;
      m.group.position.copy(cam.position);
      m.group.quaternion.copy(cam.quaternion);
      // walking bob
      const hs = p.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
      const walk = p.onGround ? clamp(hs / 4, 0, 1) : 0;
      m.bob += dt * clamp(hs, 0, 9) * 1.5;
      const bx = Math.sin(m.bob) * 0.012 * walk, by = -Math.abs(Math.cos(m.bob)) * 0.016 * walk;
      const ax = clamp(cam.aspect / 2, 0.5, 1.1);   // narrow view (split screen): keep the sword on screen
      const a = p.attack;
      const k = a ? clamp(a.t / Math.max(0.05, a.dur), 0, 1) : 0;
      if (m.sword && m.sword.visible) {
        // wind up (0..0.22), slash (0.22..0.55), come back to rest (0.55..1)
        let from = REST, to = REST, t = 0;
        if (a) {
          const S = SWINGS[clamp(a.combo || 0, 0, 2)];
          if (k < 0.22) { from = REST; to = S.wind; t = ease(k / 0.22); }
          else if (k < 0.55) { from = S.wind; to = S.end; t = ease((k - 0.22) / 0.33); }
          else { from = S.end; to = REST; t = ease((k - 0.55) / 0.45); }
        }
        _p.copy(from.pos).lerp(to.pos, t);
        _d.copy(from.dir).lerp(to.dir, t).normalize();
        m.sword.position.set(_p.x * ax + bx, _p.y + by, _p.z);
        m.sword.quaternion.setFromUnitVectors(Z, _d);
      }
      if (m.fists && m.fists.R.visible) {
        const punch = a && !a.kick ? Math.sin(Math.min(1, k * 1.4) * Math.PI) : 0;
        const right = !a || a.combo !== 1;
        const place = (f, side, out) => {
          f.position.set((0.26 - out * 0.17) * side * ax + bx, -0.13 + by + out * 0.06, -0.5 - out * 0.3);
          f.rotation.set(0.12, -0.15 * side, 0);
        };
        place(m.fists.R, 1, right ? punch : 0);
        place(m.fists.L, -1, right ? 0 : punch);
      }
    }
  }

  // world positions for the sword trail (null when not in first person with a sword)
  trail(p, from, to) {
    const m = this.models[p.index];
    if (!m || !m.active || !m.sword || !m.sword.visible) return false;
    m.group.updateMatrixWorld(true);
    m.sword.getWorldPosition(from);
    m.tip.getWorldPosition(to);
    from.lerp(to, 0.35);
    return true;
  }
  active(p) { const m = this.models[p.index]; return !!(m && m.active); }

  // around each viewport's render: hide that player's own body, show their own held sword
  beforeRender(viewIndex) {
    const g = this.game;
    if (g.phase !== 'play') return;
    for (const p of g.players) {
      const m = this.models[p.index];
      if (!m || !m.active || p.index !== viewIndex) continue;
      m.group.visible = true;
      if (p.rig && p.rig.root.visible) { p.rig.root.visible = false; this.hidden.push(p.rig.root); }
    }
  }
  afterRender() {
    for (const r of this.hidden) r.visible = true;
    this.hidden.length = 0;
    for (const m of this.models) if (m) m.group.visible = false;
  }
}
