// Loads the real World / Models modules and falls back to the stand-ins in stubs.js
// when a module is missing, fails to import, or throws while building something.
import * as THREE from 'three';
import * as stubs from './stubs.js';

export const using = { world: 'stand-in', characters: 'stand-in', enemies: 'stand-in', bosses: 'stand-in' };
const real = {};
const warned = new Set();
function warnOnce(key, msg, err) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('[game] ' + msg, err && err.message ? err.message : err || '');
}

async function tryImport(path, names) {
  try {
    const mod = await import(path);
    for (const n of names) if (typeof mod[n] !== 'function') throw new Error(`missing export ${n}`);
    return mod;
  } catch (e) {
    warnOnce(path, `${path} not available yet, using the built-in stand-in.`, e);
    return null;
  }
}

export async function loadModules() {
  const [w, c, en, b] = await Promise.all([
    tryImport('../world/world.js', ['buildWorld']),
    tryImport('../models/characters.js', ['createHero', 'createNPC']),
    tryImport('../models/enemies.js', ['createEnemy']),
    tryImport('../models/bosses.js', ['createBoss']),
  ]);
  if (w) { real.buildWorld = w.buildWorld; using.world = 'real'; }
  if (c) { real.createHero = c.createHero; real.createNPC = c.createNPC; using.characters = 'real'; real.charMod = c; await learnNpcKinds(c); }
  if (en) { real.createEnemy = en.createEnemy; using.enemies = 'real'; if (typeof en.createSummon === 'function') real.createSummon = en.createSummon; if (typeof en.createCritter === 'function') real.createCritter = en.createCritter; }
  if (b) { real.createBoss = b.createBoss; using.bosses = 'real'; }
  return using;
}

// ------------------------------------------------------------------ world
function validWorld(w) {
  return w && typeof w.heightAt === 'function' && w.landmarks && w.landmarks.spawn && typeof w.setTimeOfDay === 'function';
}
function patchWorld(w) {
  // fill in anything optional so game code never crashes on a partial world
  if (!w.normalAt) w.normalAt = (x, z) => new THREE.Vector3(w.heightAt(x - 0.5, z) - w.heightAt(x + 0.5, z), 1, w.heightAt(x, z - 0.5) - w.heightAt(x, z + 0.5)).normalize();
  if (!w.colliders) w.colliders = { circles: [], segments: [] };
  w.colliders.circles = w.colliders.circles || [];
  w.colliders.segments = w.colliders.segments || [];
  if (!w.monsterSpawns) w.monsterSpawns = [];
  if (!w.banditCamps) w.banditCamps = [];
  if (!w.radius) w.radius = 250;
  const safe = (name, fallback) => {
    const fn = w[name];
    w[name] = (...a) => { try { return fn ? fn.apply(w, a) : fallback; } catch (e) { warnOnce('world.' + name, `world.${name} failed`, e); return fallback; } };
  };
  ['setTimeOfDay', 'setPortalState', 'setTempleState', 'setCrystals', 'update'].forEach((n) => safe(n));
  const disp = w.dispose;
  w.dispose = () => { try { disp && disp.call(w); } catch (e) { warnOnce('world.dispose', 'world.dispose failed', e); } };
  return w;
}

export async function buildWorld(id, opts) {
  if (real.buildWorld) {
    const before = new Set(opts.scene.children);
    try {
      const w = await real.buildWorld(id, opts);
      if (!validWorld(w)) throw new Error('world object is incomplete');
      using.world = 'real';
      return patchWorld(w);
    } catch (e) {
      warnOnce('buildWorld' + id, `real buildWorld(${id}) failed, using the stand-in world.`, e);
      using.world = 'stand-in (real one failed)';
      // remove anything the failed build left behind
      [...opts.scene.children].forEach((o) => { if (!before.has(o)) opts.scene.remove(o); });
    }
  }
  return patchWorld(await stubs.buildWorld(id, opts));
}

// ------------------------------------------------------------------ rigs
const DEF_ACT = { duration: 0.5, hitTime: 0.22, releaseTime: 0.28 };
const METHODS = ['setSword', 'setArmor', 'setPose', 'setMoveSpeed', 'attack', 'cast', 'hurt', 'update', 'dispose',
  'setFrozen', 'setTint', 'play', 'setEnraged', 'setFightStyle', 'flyingKick'];
const ACTIONS = new Set(['attack', 'cast', 'play', 'flyingKick']);   // methods that return { duration, hitTime }

// Wraps a rig so a bug inside one model method can never stop the game loop.
class SafeRig {
  constructor(rig, tag) {
    this.raw = rig;
    this.tag = tag;
    for (const m of METHODS) {
      const fn = rig[m];
      this[m] = (...a) => {
        if (typeof fn !== 'function') return ACTIONS.has(m) ? { ...DEF_ACT } : undefined;
        try {
          const r = fn.apply(rig, a);
          if (ACTIONS.has(m)) {
            const o = r || {};
            return {
              duration: Number.isFinite(o.duration) ? o.duration : DEF_ACT.duration,
              hitTime: Number.isFinite(o.hitTime) ? o.hitTime : DEF_ACT.hitTime,
              releaseTime: Number.isFinite(o.releaseTime) ? o.releaseTime : (Number.isFinite(o.hitTime) ? o.hitTime : DEF_ACT.releaseTime),
            };
          }
          return r;
        } catch (e) {
          warnOnce(tag + '.' + m, `${tag}.${m}() failed`, e);
          return ACTIONS.has(m) ? { ...DEF_ACT } : undefined;
        }
      };
    }
  }
  get root() { return this.raw.root; }
  get height() { return this.raw.height || 1.8; }
  get radius() { return this.raw.radius || 0.5; }
  get hitHeight() { return this.raw.hitHeight || (this.raw.height || 1.8) + 0.4; }
  get swordTip() { return this.raw.swordTip || null; }
  get handR() { return this.raw.handR || null; }
  get mouth() { return this.raw.mouth || null; }
  get moves() { return (this.raw.moves && this.raw.moves.length) ? this.raw.moves : ['slam', 'sweep', 'roar']; }
}

function make(realFn, stubFn, tag, args) {
  if (realFn) {
    try {
      const r = realFn(...args);
      if (r && r.root && r.root.isObject3D) return new SafeRig(r, tag);
      throw new Error('rig has no root');
    } catch (e) {
      warnOnce('make.' + tag, `real ${tag} failed, using a stand-in`, e);
    }
  }
  return new SafeRig(stubFn(...args), tag + '(stand-in)');
}

export const createHero = (def, opts) => make(real.createHero, stubs.createHero, 'hero', [def, opts]);
export const createNPC = (kind, opts) => make(real.createNPC, stubs.createNPC, 'npc', [kind, opts]);
export const createEnemy = (def, opts) => make(real.createEnemy, stubs.createEnemy, 'enemy', [def, opts]);
export const createBoss = (def, opts) => make(real.createBoss, stubs.createBoss, 'boss', [def, opts]);
// friendly helpers (summons): the Models helper may provide createSummon(kind, { color, quality }); null when not available
export const hasSummon = () => typeof real.createSummon === 'function';
export function createSummon(kind, opts) {
  if (!real.createSummon) return null;
  try {
    const r = real.createSummon(kind, opts);
    if (r && r.root && r.root.isObject3D) return new SafeRig(r, 'summon');
  } catch (e) { warnOnce('summon.' + kind, `createSummon(${kind}) failed, using a stand-in`, e); }
  return null;
}

// ------------------------------------------------------------------ friendly people + animals
// Which createNPC kinds the Models module really knows (new kinds like 'healer' or 'knight' are being added).
// Unknown kinds would come out as bandits, so the game uses a villager with fitting clothes instead.
// Known = listed in an exported NPC_KINDS / NPC_LOOKS / NPC_STYLES, or named in characters.js ('healer' or healer:).
const BASE_KINDS = new Set(['villager', 'merchant', 'bandit', 'bandit_captain']);
const knownKinds = new Set(BASE_KINDS);
let kindSource = '';
async function learnNpcKinds(mod) {
  const addAll = (v) => {
    if (Array.isArray(v) || v instanceof Set) v.forEach((x) => knownKinds.add(String(x)));
    else if (v && typeof v === 'object') Object.keys(v).forEach((x) => knownKinds.add(x));
  };
  for (const k of ['NPC_KINDS', 'FRIENDLY_KINDS', 'NPC_LOOKS', 'NPC_STYLES', 'NPC_TYPES']) addAll(mod[k]);
  try { kindSource = await (await fetch(new URL('../models/characters.js', import.meta.url))).text(); } catch (e) { kindSource = ''; }
  // the friendly kinds live in models/friendly.js (only loaded when characters.js uses it)
  if (/friendly\.js/.test(kindSource)) {
    try { const fr = await import('../models/friendly.js'); addAll(fr.FRIENDLY_KINDS || fr.FRIENDLY); } catch (e) { /* not there: villagers in helper colours */ }
  }
  if (/['"]sensei['"]/.test(kindSource)) knownKinds.add('sensei');
}
export function npcKindReady(kind) {
  if (!real.createNPC) return false;
  if (knownKinds.has(kind)) return true;
  if (!kindSource) return false;
  const q = kindSource.includes("'" + kind + "'") || kindSource.includes('"' + kind + '"');
  const ok = q || new RegExp('[{,\\s]' + kind + '\\s*:').test(kindSource);
  if (ok) knownKinds.add(kind);
  return ok;
}
export const hasCritter = () => typeof real.createCritter === 'function';
export function createCritter(kind, opts) {
  if (real.createCritter) {
    try {
      const r = real.createCritter(kind, opts);
      if (r && r.root && r.root.isObject3D) return new SafeRig(r, 'critter');
    } catch (e) { warnOnce('critter.' + kind, `createCritter(${kind}) failed, using a stand-in`, e); }
  }
  return new SafeRig(stubs.createCritter(kind, opts), 'critter(stand-in)');
}
