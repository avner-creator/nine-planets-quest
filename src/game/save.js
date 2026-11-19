// Save games (one per mode) + settings, in localStorage.
import { SAVE_KEY, MODES, DAY_NIGHT, CHARACTERS } from '../data.js';

export const DEFAULT_SETTINGS = { quality: 'high', sensitivity: 1, invertY: false, volume: 0.8, music: true, showHelp: true };

function readJSON(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; }
}
const grid = (v) => Array.from({ length: 9 }, () => [v, v, v]);

export function loadSettings() {
  const s = readJSON(`${SAVE_KEY}.settings`);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}
export function saveSettings(s) { writeJSON(`${SAVE_KEY}.settings`, s); }

export function newGameState(modeId, character = 0, players = 1) {
  const mode = MODES.find((m) => m.id === modeId) || MODES[1];
  const all = mode.id === 'creative';
  return {
    v: 3,
    mode: mode.id,
    players,
    character,
    character2: 3,                          // player 2 starts as Leo
    level: 1,
    xp: 0,
    coins: mode.id === 'creative' ? 99999 : 0,
    sword: mode.startSword,
    armor: mode.startArmor,
    potions: { hp: mode.id === 'quest' ? 2 : 3, hp_big: 0, mana: mode.id === 'quest' ? 1 : 2 },
    loot: {},                               // name -> { count, value }
    moves: Array.from({ length: 9 }, () => Array(9).fill(all)),   // [element][move] won (Creative: everything)
    trials: Array.from({ length: 9 }, () => [0, 0, 0]),           // [dimension][temple] trials won (0..3)
    crystals: grid(false),                  // [element][tier] crystal taken
    guardians: grid(false),                 // [dimension][temple] temple guardian beaten
    bosses: Array(9).fill(false),           // key guardian (main boss) beaten
    keys: Array(9).fill(false),             // portal keys carried (keys[i] opens portal i)
    keysDropped: Array(9).fill(false),      // key dropped by a boss but not picked up yet (per dimension)
    portalsOpen: Array(9).fill(false).map((_, i) => i === 0 || all || !!mode.allPortals),
    time: DAY_NIGHT.startTime,
    world: 'home',
    pos: null, pos2: null,
    blocks: {},                             // worldKey -> [[x,y,z,type], ...]
    hints: {},
    kills: 0,
    banditsDefeated: 0,
    nightKills: 0,
    playTime: 0,
    sel: [{ power: CHARACTERS[character].power, move: 0 }, { power: CHARACTERS[3].power, move: 0 }],
    victoryShown: false,
    hp: null, mana: null, hp2: null, mana2: null,
  };
}

// old saves (v1: powers[i] = earned the single power of dimension i) -> v2
function migrate(s) {
  const base = newGameState(s.mode, s.character || 0, s.players || 1);
  const g = { ...base, ...s };
  g.potions = { ...base.potions, ...(s.potions || {}) };
  const ok9 = (a) => Array.isArray(a) && a.length === 9;
  if (!ok9(g.bosses)) g.bosses = base.bosses;
  if (!ok9(g.keys)) g.keys = base.keys;
  if (!ok9(g.keysDropped)) g.keysDropped = base.keysDropped;
  if (!ok9(g.crystals) || !g.crystals.every((r) => Array.isArray(r) && r.length === 3)) g.crystals = base.crystals;
  if (!ok9(g.guardians) || !g.guardians.every((r) => Array.isArray(r) && r.length === 3)) g.guardians = base.guardians;
  if (!ok9(g.portalsOpen)) g.portalsOpen = base.portalsOpen;
  if (!s.v || s.v < 2) {
    // old earned powers become the first crystal (tier 0) of that element; old boss wins opened the next portal
    if (ok9(s.powers)) s.powers.forEach((has, i) => { if (has && s.mode === 'quest') g.crystals[i][0] = true; });
    if (ok9(s.temples)) s.temples.forEach((has, i) => { if (has) { g.crystals[i][0] = true; g.guardians[i][0] = true; } });
    if (ok9(s.bosses)) s.bosses.forEach((b, i) => { if (b && i < 8) g.portalsOpen[i + 1] = true; });
    if (s.unlockAll) g.portalsOpen = Array(9).fill(true);
    g.sel = [{ power: s.selectedPower != null ? s.selectedPower : CHARACTERS[g.character].power, move: 0 }, base.sel[1]];
    g.v = 2;
  }
  if (!Array.isArray(g.sel) || g.sel.length < 2) g.sel = base.sel;
  // v3: every move is won in a temple trial. Old progress: a claimed crystal tier -> its 3 moves,
  // an old beaten temple guardian -> all 3 trials of that temple done. (Old Hero saves simply start earning moves.)
  const okMoves = ok9(g.moves) && g.moves.every((r) => Array.isArray(r) && r.length === 9);
  const okTrials = ok9(g.trials) && g.trials.every((r) => Array.isArray(r) && r.length === 3);
  if (!okMoves || !okTrials || !s.v || s.v < 3) {
    if (!okMoves) g.moves = base.moves.map((r) => r.slice());
    if (!okTrials) g.trials = base.trials.map((r) => r.slice());
    if (s.mode !== 'hero') g.crystals.forEach((row, el) => row.forEach((has, t) => { if (has) for (let k = 0; k < 3; k++) g.moves[el][3 * t + k] = true; }));
    else g.crystals = base.crystals;
    if (s.mode === 'hero') { g.trials = base.trials.map((r) => r.slice()); g.guardians = base.guardians.map((r) => r.slice()); }
    else g.guardians.forEach((row, i) => row.forEach((beat, t) => { if (beat) { g.trials[i][t] = 3; g.moves[i][3 * t] = true; g.moves[i][3 * t + 1] = true; } }));
    g.v = 3;
  }
  g.moves = g.moves.map((r) => r.map(Boolean));
  if (g.mode === 'creative') g.moves = g.moves.map((r) => r.map(() => true));
  if (g.mode === 'hero') g.portalsOpen = Array(9).fill(true);
  g.portalsOpen[0] = true;
  if (g.mode === 'creative') g.portalsOpen = Array(9).fill(true);
  if (g.players !== 2) g.players = 1;
  delete g.powers; delete g.temples; delete g.selectedPower;
  return g;
}

export function loadGame(modeId) {
  const s = readJSON(`${SAVE_KEY}.${modeId}`);
  if (!s || s.mode !== modeId) return null;
  try { return migrate(s); } catch (e) { return null; }
}
export function saveGame(state) { return writeJSON(`${SAVE_KEY}.${state.mode}`, state); }
export function hasSave(modeId) { return !!loadGame(modeId); }
export function deleteSave(modeId) { try { localStorage.removeItem(`${SAVE_KEY}.${modeId}`); } catch (e) { /* ignore */ } }
