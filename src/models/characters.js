// characters.js - playable heroes and NPCs (merchant, villagers, bandits, bandit captain).
// createHero(characterDef, { quality }) -> Rig, createNPC(kind, { outfit, seed, quality }) -> Rig (see CONTRACTS.md)
import * as THREE from 'three';
import { SWORDS, ARMORS } from '../data.js';
import { Builder, atlasMaterial, rng, hashStr, shade, mixc, col, hexOf } from './rigkit.js';
import { humanDims, humanBones, addBody, addArmor, swordGeometry, SWORD_LENGTH } from './human.js';
import { HumanRig } from './humanAnim.js';

const TPL = new Map();      // template cache: key -> { bones, geos, ... }
const SWORD_GEO = new Map(); // sword geometry cache

function qf(quality) { return quality === 'low' ? 0.62 : 0.9; }

function getTemplate(key, D, L, armor, q) {
  const k = key + '|' + (armor?.id || 'cloth');
  let t = TPL.get(k);
  if (!t) {
    const B = new Builder({ seed: hashStr(key) });
    humanBones(B, D, { cape: !!L.cape, tail: L.hairStyle === 'ponytail' || L.hairStyle === 'braid' });
    addBody(B, D, L, q);
    addArmor(B, D, L, armor, q);
    t = B.build();
    TPL.set(k, t);
  }
  return t;
}
function getSwordGeo(def, q) {
  const k = def.id + '|' + q;
  let g = SWORD_GEO.get(k);
  if (!g) { g = swordGeometry(def, q).main; SWORD_GEO.set(k, g); }
  return g;
}

// A HumanRig plus swords & armour (needs the look to rebuild armour variants).
class CharacterRig extends HumanRig {
  constructor(key, D, L, q, opts = {}) {
    const tpl = getTemplate(key, D, L, opts.armor || null, q);
    super({ tpl, D, material: atlasMaterial(), height: L.heightOut ?? (D.s * 1.8 + (L.hairStyle === 'helmet' ? 0.04 : 0.02)), radius: 0.4 * D.x / D.s * (L.wide || 1) * D.s, attackSpeed: opts.attackSpeed || 1 });
    this._key = key; this._L = L; this._q = q;
    this.armor = opts.armor || ARMORS[0];
    this.swordScale = opts.swordScale || 1;
  }
  setSword(def) {
    if (this.sword) { this.sword.removeFromParent(); this.sword = null; this.swordTip = null; }
    this.ctx.armed = !!def;
    if (!def) return;
    const m = new THREE.Mesh(getSwordGeo(def, this._q), this.material);
    m.castShadow = true; m.receiveShadow = false;
    const s = this.D.s;
    m.position.set(0.02 * s, -0.088 * s, 0.004 * s);
    m.scale.setScalar(s * this.swordScale);
    m.name = 'sword';
    this.handR.add(m);
    const tip = new THREE.Object3D(); tip.name = 'swordTip';
    tip.position.set(0, 0, SWORD_LENGTH(def));
    m.add(tip);
    this.sword = m; this.swordTip = tip; this.swordDef = def;
    m.visible = this.ctx.pose !== 'sleep' && this.ctx.pose !== 'swim';
  }
  setArmor(def) {
    def = def || ARMORS[0];
    if (def.id === this.armor?.id) return;
    this.armor = def;
    const tpl = getTemplate(this._key, this.D, this._L, def, this._q);
    this.mesh.geometry = tpl.geos.main;
  }
}

// ------------------------------------------------------------------ hero looks
const EYES = { brown: '#5a3a22', dark: '#2a1a10', blue: '#3a6aa8', green: '#3f7a3a', grey: '#6a7a88', violet: '#7a5ac8', hazel: '#7a5a2a' };
const HERO_STYLE = {
  aria: (k) => ({ eyes: EYES.green, skirt: 0.64, flare: 0.32, gloves: '#6a4a2a', leather: '#6a4a2a', boots: '#4a3220', bottom: '#4a3a2a', cape: shade(k.outfit, 0.75), capeLen: 0.5, trim: k.accent, collar: k.accent, tie: '#6a4a2a', bootTop: 0.42 }),
  bram: (k) => ({ eyes: EYES.blue, helmetColor: '#aab4be', plume: k.accent, tabard: k.accent, emblem: '#d9b04a', bottom: '#5a6068', gloves: '#5a4030', boots: '#3a2a1a', cape: shade(k.accent, 0.8), beard: 'full', collar: k.accent, height: 1.84, wide: 1.06 }),
  kira: (k) => ({ eyes: EYES.dark, mask: k.outfit, hood: k.outfit, sash: k.accent, beltColor: k.accent, buckle: '#2a2a2a', gloves: '#14151a', boots: '#14151a', bottom: k.outfit, bootTop: 0.44, collar: k.accent, pouch: false }),
  leo: (k) => ({ eyes: EYES.blue, skirt: 0.6, flare: 0.25, trim: k.accent, collar: k.accent, cuff: k.accent, cape: '#8a1f24', clasp: k.accent, bottom: '#8a7a5a', boots: '#5a4028', gloves: '#7a5a38', sash: k.accent, beard: 'full', height: 1.83 }),
  luna: (k) => ({ eyes: EYES.violet, skirt: 0.07, flare: 0.5, stars: true, starColor: '#fff2b0', cape: shade(k.outfit, 0.7), capeLen: 0.25, trim: k.accent, collar: k.accent, cuff: k.accent, hairLen: 1.22, boots: '#2a2040', bottom: k.outfit, lip: '#b0606e' }),
  rex: (k) => ({ eyes: EYES.brown, sleeves: 'none', pelt: '#8f8a84', beard: 'big', bottom: '#4a3422', boots: '#3a2a1c', beltColor: '#2a1a10', buckle: '#9b9b9b', gloves: null, height: 1.86, wide: 1.1, armR: 1.18, collar: k.outfit }),
  nova: (k) => ({ eyes: EYES.dark, bottom: k.outfit, trim: k.accent, collar: k.accent, cuff: k.accent, gloves: '#ececec', boots: '#e8e8e8', beltColor: '#3a3a40', buckle: '#d0d0d0', goggles: true, bootTop: 0.4, tie: k.accent, topCell: 'cloth' }),
  ivy: (k) => ({ eyes: EYES.green, skirt: 0.4, flare: 0.4, crown: 'leaf', flower: k.accent, tie: k.accent, cape: shade(k.outfit, 0.7), trim: shade(k.outfit, 0.6), boots: '#4a3a24', bottom: '#4a5a30', collar: shade(k.outfit, 0.7) }),
  zane: (k) => ({ eyes: EYES.violet, eyeGlow: 0.25, scarf: k.accent, scarfMask: true, cape: '#1a1428', bottom: '#1c1626', gloves: '#1a1420', boots: '#1a1420', collar: k.accent, noCollar: true }),
};
function heroLook(def) {
  const k = def.look || {};
  const slim = k.build === 'slim';
  const style = (HERO_STYLE[def.id] || (() => ({})))(k);
  const L = {
    skin: k.skin || '#e0ac85', hair: k.hair || '#3a2a1a', hairStyle: k.hairStyle || 'short',
    top: k.outfit || '#6a6a6a', accent: k.accent || '#a08040', build: k.build || 'broad',
    height: slim ? 1.74 : 1.82, bust: slim ? 0.018 : 0.012,
    leather: '#5a3a24',
    ...style,
  };
  if (k.cape === false) L.cape = null;
  else if (k.cape && !L.cape) L.cape = shade(L.top, 0.7);
  if (L.cape) L.cape = hexOf(L.cape);
  if (L.trim) L.trim = hexOf(L.trim);
  if (L.collar) L.collar = hexOf(L.collar);
  return L;
}

export function createHero(characterDef, { quality = 'high' } = {}) {
  const L = heroLook(characterDef);
  const D = humanDims(L.height, L.build, { wide: L.wide, arm: L.armR });
  const q = qf(quality);
  const rig = new CharacterRig('hero:' + characterDef.id + ':' + q, D, L, q, { attackSpeed: characterDef.stats?.attackSpeed || 1 });
  rig.kind = 'hero'; rig.id = characterDef.id;
  return rig;
}

// ------------------------------------------------------------------ NPCs
const SKINS = ['#f3d2bd', '#f1c9a5', '#e8b996', '#e0ac85', '#c68a5e', '#a8704a', '#8d5a3b', '#6b4430'];
const HAIRS = ['#1a1410', '#2a1a10', '#5a3a1a', '#8a5a2a', '#c9a050', '#a8461d', '#8a8a88', '#d8d2c4'];
const CLOTH = ['#7a4a2a', '#5a6a3a', '#3a5a7a', '#8a3a3a', '#6a5a8a', '#a08050', '#4a6a5a', '#b07040', '#5a4a3a', '#7a7a6a'];

function pick(r, a) { return a[Math.floor(r() * a.length)]; }

function npcLook(kind, outfit, seed) {
  const r = rng(seed * 7919 + hashStr(kind));
  const skin = pick(r, SKINS);
  if (kind === 'merchant') {
    return {
      skin, hair: '#6a5038', hairStyle: 'short', moustache: true, moustacheColor: '#5a4030', eyes: EYES.brown, smile: 0.008,
      top: '#d9cdb0', sleeveColor: '#d9cdb0', accent: '#7a4a2a', collar: '#7a4a2a', bottom: '#4a3a2a', boots: '#3a2818',
      apron: '#e8e0c8', hat: 'brim', hatColor: '#5a4030', hatBand: '#8a2a22', belly: 0.8, build: 'broad', height: 1.76, wide: 1.06, pouch: true, satchel: '#7a4a28', blushK: 0.2, scarf: null,
    };
  }
  if (kind === 'villager') {
    const broad = r() < 0.5;
    const hs = pick(r, broad ? ['short', 'short', 'bald', 'spiky', 'ponytail'] : ['long', 'bun', 'ponytail', 'braid', 'short']);
    const topC = outfit || pick(r, CLOTH);
    const L = {
      skin, hair: pick(r, HAIRS), hairStyle: hs === 'bald' ? 'none' : hs, eyes: pick(r, Object.values(EYES)),
      top: topC, accent: shade(topC, 0.7), bottom: pick(r, ['#4a3a2a', '#3a3a3a', '#5a4a3a', '#3a4050']), boots: pick(r, ['#3a2818', '#2a2018', '#4a3020']),
      build: broad ? 'broad' : 'slim', height: (broad ? 1.72 : 1.64) + r() * 0.12, bust: broad ? 0.012 : 0.018,
      smile: 0.004 + r() * 0.004, sleeves: r() < 0.3 ? 'short' : 'long',
    };
    if (!broad && r() < 0.6) { L.skirt = r() < 0.5 ? 0.12 : 0.45; L.flare = 0.4; L.skirtColor = shade(topC, 0.85); L.trim = shade(topC, 0.6); }
    if (r() < 0.3) { L.hat = 'straw'; }
    if (broad && hs !== 'bald' && r() < 0.35) L.beard = 'full';
    if (broad && r() < 0.25) L.moustache = true;
    if (r() < 0.2) L.apron = '#e0d8c0';
    if (broad) L.belly = r() * 0.4;
    L.accent = hexOf(L.accent); if (L.trim) L.trim = hexOf(L.trim); if (L.skirtColor) L.skirtColor = hexOf(L.skirtColor);
    return L;
  }
  const oc = outfit || '#4a3a2a';
  if (kind === 'bandit_captain') {
    return {
      skin, hair: pick(r, HAIRS), hairStyle: 'short', eyes: EYES.dark, beard: r() < 0.5 ? 'full' : false,
      top: shade(oc, 0.9), accent: '#8a6a3a', bottom: shade(oc, 0.6), boots: '#2a1c12', gloves: '#2a1c12', leather: '#3a2618',
      hood: shade(oc, 0.7), bandana: shade(oc, 0.5), cape: shade(oc, 0.55), capeLen: 0.45, build: 'broad', height: 1.95, wide: 1.12, armR: 1.12,
      collar: '#8a6a3a',
    };
  }
  // bandit
  const hooded = r() < 0.5;
  return {
    skin, hair: pick(r, HAIRS), hairStyle: hooded ? 'hood' : pick(r, ['short', 'spiky', 'ponytail']), hood: hooded ? shade(oc, 0.8) : null, eyes: EYES.dark,
    top: oc, accent: shade(oc, 0.6), bottom: shade(oc, 0.55), boots: '#2a1c12', gloves: '#3a2818', leather: '#3a2618',
    bandana: pick(r, [shade(oc, 0.45), '#7a2020', '#2a2a2a']), build: r() < 0.6 ? 'broad' : 'slim', height: 1.74 + r() * 0.1, satchel: r() < 0.5 ? '#4a3020' : null, brow: '#1a1210',
    collar: shade(oc, 0.6), bootTop: 0.42,
  };
}

export function createNPC(kind = 'villager', { outfit, seed = 1, quality = 'high' } = {}) {
  const q = qf(quality);
  let L = npcLook(kind, outfit, seed);
  for (const k of ['hood', 'bandana', 'cape', 'top', 'accent', 'bottom', 'collar']) if (L[k] && typeof L[k] !== 'string') L[k] = hexOf(L[k]);
  const D = humanDims(L.height, L.build, { wide: L.wide, arm: L.armR });
  const key = 'npc:' + kind + ':' + (outfit || '') + ':' + (kind === 'merchant' ? 0 : seed) + ':' + q;
  let armor = null, sword = null, swordScale = 1;
  if (kind === 'bandit') { armor = { ...ARMORS[1], color: '#5a3a24' }; sword = SWORDS[3]; }
  if (kind === 'bandit_captain') { armor = ARMORS[3]; sword = SWORDS[4]; swordScale = 1.3; }
  const rig = new CharacterRig(key, D, L, q, { armor, swordScale });
  rig.kind = kind;
  if (sword) rig.setSword(sword);
  if (kind === 'bandit_captain') rig.attackSpeed = 0.85;
  return rig;
}
