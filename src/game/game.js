// Nine Planets Quest - the game: renderer, loop, states, worlds, travel, 1 or 2 players (split screen),
// temples + crystals + portal keys, interactions, saving.
import * as THREE from 'three';
import {
  MODES, DAY_NIGHT, isNight, POWERS, SWORDS, ARMORS, POTIONS, BLOCKS, CHARACTERS, DIMENSIONS, HOME, POWER_ATTACKS, TRIALS, DIFFICULTIES, DEFAULT_DIFFICULTY,
} from '../data.js';
import { loadModules, buildWorld, using, createHero } from './modules.js';
import { Input } from './input.js';
import { loadSettings, saveSettings, newGameState, loadGame, saveGame } from './save.js';
import { CameraController } from './camera.js';
import { FirstPerson } from './firstperson.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { Combat } from './combat.js';
import { Enemies } from './enemies.js';
import { BossManager } from './boss.js';
import { Powers, ROMAN } from './powers.js';
import { Allies } from './allies.js';
import { Trials } from './trials.js';
import { Blocks } from './blocks.js';
import { NPCs, Buddies, Pets, RECIPE_OF } from './npcs.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { GameAudio } from './audio.js';
import { ColliderGrid, clamp, rand, fmt, angleDamp, damp } from './util.js';
import { Controls, keysetFor } from './controls.js';

const PORTAL_COLOR_NAMES = ['green', 'aqua', 'orange', 'ice-blue', 'brown', 'purple', 'golden', 'violet', 'pink'];
const DEBUG = /[?&]debug=1/.test(location.search);
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor() {
    this.settings = loadSettings();
    const q = this.settings.quality;
    const canvas = document.getElementById('game');
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'high', powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.5 : 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    // two cameras: player 1 (also menus / title) and player 2 (split screen)
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera2 = new THREE.PerspectiveCamera(65, window.innerWidth / 2 / window.innerHeight, 0.1, 1500);
    this.scene.add(this.camera, this.camera2);
    this.cam = new CameraController(this.camera);
    this.cam2 = new CameraController(this.camera2);
    this.views = [{ camera: this.camera, cam: this.cam }, { camera: this.camera2, cam: this.cam2 }];
    this.input = new Input(canvas);
    this.audio = new GameAudio();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMusic(this.settings.music);

    this.state = null;
    this.mode = MODES[1];
    this.phase = 'boot';        // boot | title | modes | play
    this.worldId = 'home';
    this.world = null;
    this.colliders = null;
    this.walls = [];            // temporary walls (Ice Wall / Stone Wall)
    this.timeOfDay = DAY_NIGHT.startTime;
    this.time = 0;
    this.hitStopT = 0;
    this.saveT = 30;
    this.building = false;
    this.traveling = false;
    this.cinematic = 0;
    this.portalArmed = true;
    this.duskWarned = false;
    this.lastNight = false;
    this.players = [];

    this.hud = new HUD(this);
    this.ui = new UI(this);
    this.fx = new FX(this);
    this.combat = new Combat(this);
    this.enemies = new Enemies(this);
    this.boss = new BossManager(this);
    this.powers = new Powers(this);
    this.allies = new Allies(this);
    this.trials = new Trials(this);
    this.blocks = new Blocks(this);
    this.npcs = new NPCs(this);
    this.buddies = new Buddies(this);
    this.pets = new Pets(this);
    this.firstPerson = new FirstPerson(this);

    // warm lights that follow the players at night (fixed count so materials never recompile)
    this.nightLights = [new THREE.PointLight('#ffb070', 0, 18, 1.6), new THREE.PointLight('#ffb070', 0, 18, 1.6)];
    this.nightLights.forEach((L) => this.scene.add(L));

    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    this.input.onKey = (code, e) => this.onKey(code, e);
    this.input.onLockChange = (locked, onPurpose) => this.onLockChange(locked, onPurpose);
    this.input.onCanvasDown = (e) => this.onCanvasDown(e);
    window.addEventListener('beforeunload', () => { if (this.phase === 'play' && this.state) this.saveNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.phase === 'play') this.saveNow(); });
    const unlock = () => { this.audio.unlock(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    if (DEBUG) window.game = this;
    window.__npq = this;
  }

  get player() { return this.players[0] || null; }
  get twoPlayers() { return this.players.length > 1; }
  get paused() { return this.phase !== 'play' || !!this.ui.overlay || this.traveling; }
  get worldName() { return this.worldId === 'home' ? HOME.name : DIMENSIONS[this.worldId].name; }
  get worldBiome() { return this.worldId === 'home' ? HOME.biome : DIMENSIONS[this.worldId].biome; }
  dimName(i) { return DIMENSIONS[i].name; }
  canControl(p = this.player) { return this.phase === 'play' && !this.paused && !this.cinematic && p && !p.dead && !p.sleeping; }
  moodForTime() { return isNight(this.timeOfDay) || (this.worldId !== 'home' && DIMENSIONS[this.worldId].biome.alwaysNight) ? 'night' : 'day'; }

  viewRect(i) {
    const W = window.innerWidth, H = window.innerHeight;
    if (this.players.length < 2) return { x: 0, y: 0, w: W, h: H };
    return { x: i === 0 ? 0 : W / 2, y: 0, w: W / 2, h: H };
  }
  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const two = this.players.length > 1;
    this.camera.aspect = (two ? w / 2 : w) / h;
    this.camera2.aspect = (w / 2) / h;
    this.camera.updateProjectionMatrix(); this.camera2.updateProjectionMatrix();
    if (this.fx) this.fx.resize(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  // ---------------------------------------------------------------- boot + title
  async boot() {
    const status = document.getElementById('boot-status');
    if (status) status.textContent = 'Loading the worlds...';
    await loadModules();
    console.info('[game] modules:', JSON.stringify(using));
    await this.setWorld('home');
    const p = new Player(this, 0);
    p.view = this.views[0];
    p.ctl = new Controls(this.input, keysetFor(0, 1), { mouse: true });
    this.players = [p];
    const boot = document.getElementById('boot');
    if (boot) { boot.classList.add('out'); setTimeout(() => boot.remove(), 800); }
    this.toTitle();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  toTitle() {
    this.phase = 'title';
    this.hud.show(false);
    this.building = false;
    this.toTitleOrbit();
    this.ui.showScreen('title');
    this.audio.setMusicMood('menu');
    this.players.forEach((p) => { if (p.rig) p.rig.root.visible = false; });
    this.onResize();
  }
  toTitleOrbit() {
    const L = this.world.landmarks;
    const c = L.portals && L.portals.length ? L.portals[4].pos.clone().lerp(L.spawn, 0.5) : L.spawn.clone();
    this.cam.orbit = { center: c, radius: 55, height: 22, speed: 0.04, angle: 0.5, lookY: 2 };
  }

  // ---------------------------------------------------------------- menus -> game
  newGame(modeId, players = 1, difficulty = DEFAULT_DIFFICULTY) { this.startGame(newGameState(modeId, 0, players, difficulty), true); }
  // Easy / Medium / Hard (saved per game; Creative starts on easy but can be changed in the pause menu too)
  get diff() {
    const s = this.state;
    const id = !s ? DEFAULT_DIFFICULTY : (s.difficulty || DEFAULT_DIFFICULTY);
    return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES.find((d) => d.id === DEFAULT_DIFFICULTY);
  }
  setDifficulty(id) {
    const s = this.state;
    if (!s || !DIFFICULTIES.some((d) => d.id === id)) return;
    s.difficulty = id;
    this.hud.refreshBadge();
    this.saveNow();
  }
  continueGame(modeId, players) {
    const s = loadGame(modeId);
    if (!s) return this.newGame(modeId, players || 1);
    if (players) s.players = players;
    this.startGame(s);
  }
  pickCharacterFor(modeId) { this.newGame(modeId, 1); }   // kept for older code paths

  // one or two players, each with their own keys, camera and HUD view
  setupPlayers(n) {
    if (!this.players[0]) { const p = new Player(this, 0); p.view = this.views[0]; this.players[0] = p; }
    if (n === 2 && !this.players[1]) { const p = new Player(this, 1); p.view = this.views[1]; this.players[1] = p; }
    if (n === 1 && this.players[1]) { this.players[1].removeRig(); this.players.length = 1; }
    this.players[0].ctl = new Controls(this.input, keysetFor(0, n), { mouse: n === 1 });
    if (this.players[1]) this.players[1].ctl = new Controls(this.input, keysetFor(1, 2), { mouse: false });
    if (n === 2) { this.input.exitLock(true); if (this.renderer.getPixelRatio() > 1) this.renderer.setPixelRatio(1); }
    this.hud.setPlayers(this.players);
    this.onResize();
  }

  async startGame(s, isNew = false) {
    this.endPreview();
    this.state = s;
    this.mode = MODES.find((m) => m.id === s.mode);
    if (this.mode.id === 'creative') { s.sword = 7; s.armor = 5; s.portalsOpen = Array(9).fill(true); }
    this.timeOfDay = s.time;
    this.duskWarned = this.timeOfDay > 0.72 && this.timeOfDay < 0.8;
    this.lastNight = isNight(this.timeOfDay);
    this.enemies.wasNight = this.lastNight;
    this.ui.hideScreens();
    this.ui.closeAll();
    this.setupPlayers(s.players === 2 ? 2 : 1);
    this.players.forEach((p, i) => {
      p.dead = false; p.sleeping = false; p.flying = false; p.suit = null; p.buffs = {};
      p.setCharacter(i === 0 ? s.character : s.character2, false);
      const hp = i === 0 ? s.hp : s.hp2, mp = i === 0 ? s.mana : s.mana2;
      if (hp != null) p.hp = clamp(hp, 1, p.maxHp);
      if (mp != null) p.mana = clamp(mp, 0, p.maxMana);
    });
    this.powers.reset();
    this.players.forEach((p) => this.fixSelection(p));
    this.building = false;
    const target = s.world === 'home' || s.world == null ? 'home' : +s.world;
    if (target !== this.worldId) {
      this.ui.transition(`Entering ${DIMENSIONS[target].name}...`, POWERS[target].color);
      await sleepMs(400);
      await this.setWorld(target);
      this.ui.endTransition();
    } else this.onWorldReady();
    const sp = s.pos;
    if (sp && Array.isArray(sp) && Number.isFinite(sp[0]) && !isNew) this.player.placeAt(new THREE.Vector3(sp[0], sp[1], sp[2]), s.yaw || 0);
    else this.placeAtSpawn();
    if (this.players[1]) this.placeBeside(this.players[1], this.player);
    this.buddies.load(isNew ? [] : s.buddies);
    this.pets.load(isNew ? [] : s.pets);
    this.npcs.onWorldLoaded();
    this.players.forEach((p) => { p.cam.orbit = null; p.cam.snapBehind(p.yaw); });
    this.phase = 'play';
    this.hud.show(true);
    this.hud.refreshHotbar();
    this.hud.clearFloaters();
    this.audio.setMusicMood(this.moodForTime());
    this.saveT = 30;
    this.saveNow();
    this.firstHints(isNew);
  }
  fixSelection(p) {
    const sel = p.sel;
    // a hero without an own element (Kai) starts on the first power that has a won move
    const fallback = () => (p.ownPower != null ? p.ownPower : ([...Array(9).keys()].find((i) => this.powers.elementUsable(p, i)) ?? 0));
    if (sel.power == null || !this.powers.elementUsable(p, sel.power)) { sel.power = fallback(); sel.move = 0; }
    if (!this.powers.canUse(p, sel.power, sel.move)) sel.move = [...Array(9).keys()].find((m) => this.powers.canUse(p, sel.power, m)) || 0;
  }

  firstHints(isNew) {
    const h = this.state.hints;
    const p = this.player, k = (a) => p.ctl.key(a);
    if (!h.basics2) {
      h.basics2 = true;
      if (this.twoPlayers) this.hud.hint('Two players! Player 1: W A S D, F sword, G power. Player 2: arrow keys, J sword, K power.', 7);
      else this.hud.hint(`${k('forward')} / Up walks, ${k('left')} ${k('right')} / Left Right turn. Space jumps!`, 6);
      this.hud.hint(`Press ${k('sword')} to swing your sword. ${k('power')} uses your power - HOLD it for a SUPER!`, 7);
      this.hud.hint(`${k('nextMove')} picks the next move, ${k('nextPower')} the next power. ${k('hero')} picks a hero.`, 6);
      if (this.mode.id === 'creative') this.hud.hint('Hold Space to fly up, Left Shift to fly down. Press B to build with blocks!', 7);
      else this.hud.hint('You start with NO power moves. Walk into a temple courtyard to start a trial - every trial you win gives you a new move!', 8);
      if (this.mode.id === 'quest') this.hud.hint("Follow the yellow arrow. Beat each world's big boss for the key to the next portal.", 7);
      else if (this.mode.id === 'hero') this.hud.hint('Every portal is open - go to any world you like and win its trials!', 6);
      // the keys card no longer pops up by itself: it only shows with Alt + F5
      this.hud.hint('Press Alt + F5 any time to see all the keys.', 6);
    }
    if (!h.helpers2) { h.helpers2 = true; this.hud.hint('Home Base is safe - no monsters here. Lots of friendly people live here: the Healer heals you, the Guide tells you what to do, and a Knight, Archer or Mage can come with you as your buddy!', 8); }
    if (!isNew) this.hud.toast(`Welcome back! ${this.mode.name} mode, Level ${this.state.level}.`, 'good', 3);
  }

  quitToTitle() {
    this.saveNow();
    this.ui.closeAll();
    this.input.exitLock(true);
    this.enemies.clear();
    this.boss.clear();
    this.allies.clear();
    this.buddies.clearAll();
    this.pets.clearAll();
    this.fx.clearWorld();
    this.hud.clearFloaters();
    this.state = null;
    this.building = false;
    this.setupPlayers(1);
    if (this.worldId !== 'home') {
      this.traveling = true;
      this.ui.transition('Going home...', '#7fd0ff');
      this.setWorld('home').then(() => { this.traveling = false; this.ui.endTransition(); this.toTitle(); });
    } else {
      this.blocks.clear();
      this.toTitle();
    }
  }

  // ---------------------------------------------------------------- worlds
  async setWorld(id) {
    this.enemies.clear();
    this.boss.clear();
    this.allies.clear();
    this.trials.clear();
    this.npcs.clear();
    this.powers.clear();
    this.fx.clearWorld();
    this.blocks.clear();
    this.walls.length = 0;
    this._temples = null;
    if (this.world) { this.world.dispose(); this.world = null; }
    this.worldId = id;
    const w = await buildWorld(id, { renderer: this.renderer, scene: this.scene, quality: this.settings.quality });
    this.world = w;
    this.colliders = new ColliderGrid(w.colliders, 8);
    this.hud.buildMap(w, this.worldBiome);
    w.setTimeOfDay(this.timeOfDay);
    if (this.state) this.onWorldReady();
    else this.npcs.onWorldLoaded();
    return w;
  }
  onWorldReady() {
    const w = this.world, s = this.state;
    if (this.worldId === 'home') {
      for (let i = 0; i < 9; i++) {
        w.setPortalState(i, this.portalState(i));
        w.setCrystals(i, this.mode.id === 'creative' ? 3 : s.crystals[i].filter(Boolean).length);
      }
    } else {
      for (let t = 0; t < 3; t++) this.setTemple(t, this.templeState(t));
      // a key that was dropped but not picked up is still lying in the arena
      const id = this.worldId, kf = DIMENSIONS[id].keyFor;
      if (s.keysDropped[id] && kf != null && !s.keys[kf] && !s.portalsOpen[kf] && w.landmarks.bossArena) this.fx.dropKey(w.landmarks.bossArena.pos.clone().setY(w.heightAt(w.landmarks.bossArena.pos.x, w.landmarks.bossArena.pos.z)), kf, POWERS[kf].color);
    }
    this.blocks.load(s.blocks[String(this.worldId)]);
    this.npcs.onWorldLoaded();
    if (this.player) this.enemies.onWorldLoaded();
    this.boss.onWorldLoaded();
    this.portalArmed = false;
  }

  // the 3 temples of this dimension (from the world, or made up from the single old temple)
  temples() {
    if (this.worldId === 'home' || !this.world) return [];
    if (this._temples && this._templesWorld === this.world) return this._temples;
    const L = this.world.landmarks, D = DIMENSIONS[this.worldId];
    let list = [];
    if (Array.isArray(L.temples) && L.temples.length) {
      list = L.temples.slice(0, 3).map((t, i) => ({ ...t, tier: t.tier ?? i, name: t.name || D.temples[i].name, v2: true, courtyard: t.courtyard && t.courtyard.pos ? t.courtyard : this.makeCourtyard(t.pos, i) }));
    } else if (L.temple) {
      list = [0, 1, 2].map((i) => ({ tier: i, name: D.temples[i].name, pos: L.temple.pos, door: L.temple.door, altar: L.temple.altar, radius: L.temple.radius, courtyard: this.makeCourtyard(L.temple.pos, i), v2: false }));
    }
    this._temples = list; this._templesWorld = this.world;
    return list;
  }
  makeCourtyard(pos, i) {
    const w = this.world;
    const base = Math.atan2(-pos.x, -pos.z) + (i - 1) * 1.15;
    for (let r = 34; r < 70; r += 6) {
      for (const da of [0, 0.4, -0.4, 0.8, -0.8]) {
        const a = base + da, x = pos.x + Math.sin(a) * r, z = pos.z + Math.cos(a) * r;
        if (Math.hypot(x, z) > w.radius - 30) continue;
        const h = w.heightAt(x, z);
        if (w.liquid && w.liquid.type !== 'ice' && h < w.liquid.level + 0.5) continue;
        return { pos: new THREE.Vector3(x, h, z), radius: 18 };
      }
    }
    return { pos: new THREE.Vector3(pos.x + Math.sin(base) * 34, 0, pos.z + Math.cos(base) * 34), radius: 18 };
  }
  inBossZone(pt) {
    for (const t of this.temples()) if (t.courtyard && Math.hypot(pt.x - t.courtyard.pos.x, pt.z - t.courtyard.pos.z) < t.courtyard.radius + 8) return true;
    const a = this.world && this.world.landmarks.bossArena;
    return !!(a && Math.hypot(pt.x - a.pos.x, pt.z - a.pos.z) < (a.radius || 22) + 8);
  }
  // The world adds/removes a sealed temple's barrier wall in colliders.segments, so rebuild the collision grid after every change.
  setTemple(index, state) {
    if (!this.world) return;
    const ts = this.temples();
    if (!ts.length) return;
    if (ts[0].v2) this.world.setTempleState(index, state);
    else {
      // old world: one building stands for all three temples
      const st = [0, 1, 2].map((t) => this.templeState(t));
      this.world.setTempleState(st.includes('open') ? 'open' : st.every((x) => x === 'claimed') ? 'claimed' : 'sealed');
    }
    this.colliders = new ColliderGrid(this.world.colliders, 8);
  }
  templeState(t, i = this.worldId) {
    const s = this.state;
    if (!s || i === 'home') return 'claimed';
    if (this.mode.id === 'creative') return 'claimed';
    return s.crystals[i][t] ? 'claimed' : (s.trials[i][t] >= 3 || s.guardians[i][t]) ? 'open' : 'sealed';
  }
  portalState(i) {
    const s = this.state;
    if (!s) return 'open';
    if (s.bosses[i]) return 'cleared';
    if (this.mode.id === 'creative' || this.mode.allPortals || s.portalsOpen[i] || i === 0) return 'open';
    return 'locked';
  }

  placeAtSpawn(arrivalPortal = null) {
    const L = this.world.landmarks;
    let pos, yaw;
    if (arrivalPortal) {
      const fx = Math.sin(arrivalPortal.yaw || 0), fz = Math.cos(arrivalPortal.yaw || 0);
      // 10 m out, so the camera (which sits behind the hero) is not inside the bright portal swirl
      pos = arrivalPortal.pos.clone().add(new THREE.Vector3(fx * 10, 0, fz * 10));
      pos.y = this.world.heightAt(pos.x, pos.z);
      yaw = arrivalPortal.yaw || 0;
    } else { pos = L.spawn.clone(); yaw = L.spawnYaw || 0; }
    this.player.placeAt(pos, yaw);
    this.player.cam.snapBehind(yaw);
    if (this.players[1]) this.placeBeside(this.players[1], this.player);
    this.portalArmed = false;
  }
  placeBeside(p, other) {
    const side = new THREE.Vector3(-Math.cos(other.yaw), 0, Math.sin(other.yaw));
    const pos = other.pos.clone().addScaledVector(side, 2.2);
    p.placeAt(pos, other.yaw);
    if (this.colliders) this.colliders.resolve(p.pos, p.radius);
    p.cam.snapBehind(p.yaw);
  }

  async travel(target) {
    if (this.traveling) return;
    this.traveling = true;
    this.input.exitLock(true);
    const fromId = this.worldId;
    const name = target === 'home' ? HOME.name : DIMENSIONS[target].name;
    const color = target === 'home' ? '#7fd0ff' : POWERS[target].color;
    this.ui.transition(`Entering ${name}...`, color);
    this.audio.play('portal');
    this.state.world = target;
    await sleepMs(700);
    this.building = false;
    this.players.forEach((p) => { p.dead = false; p.hp = Math.max(p.hp, 1); if (p.lastPose === 'dead') { p.rig.setPose('idle'); p.lastPose = 'idle'; } });
    this.buddies.beforeTravel();
    await this.setWorld(target);
    const L = this.world.landmarks;
    if (target === 'home') this.placeAtSpawn(L.portals && L.portals[fromId] ? L.portals[fromId] : null);
    else this.placeAtSpawn();
    this.buddies.onWorldChanged();
    this.pets.onWorldChanged();
    this.hud.refreshHotbar();
    this.audio.setMusicMood(this.moodForTime());
    this.saveNow();
    await sleepMs(150);
    this.ui.endTransition();
    this.traveling = false;
    if (target !== 'home') {
      const d = DIMENSIONS[target];
      this.hud.banner(d.name, d.subtitle, POWERS[target].color, 3);
      if (!this.state.hints['dim2' + target]) {
        this.state.hints['dim2' + target] = true;
        if (this.mode.id === 'quest') this.hud.toast(`${d.name} has 3 temples, each guarded by a boss - and ${d.boss.name} has the key to the next world!`, 'info', 6);
      }
    } else this.hud.banner(HOME.name, HOME.subtitle, '#9fe0ff', 2.5);
  }

  // ---------------------------------------------------------------- interactions (per player)
  interactables(p) {
    const out = [];
    const w = this.world, L = w.landmarks, pos = p.pos, s = this.state;
    const d = (v) => Math.hypot(v.x - pos.x, v.z - pos.z);
    const E = `<b>${p.ctl.key('use')}</b>`;
    if (L.shop && L.shop.merchant && d(L.shop.merchant) < 3.8) out.push({ d: d(L.shop.merchant), text: `Press ${E} to shop`, act: () => this.ui.open('shop', null, p) });
    // friendly people, your buddy and your pet
    this.npcs.interactables(p, E, out);
    const bud = this.buddies.of(p);
    if (bud && !bud.dead && d(bud.pos) < 3) out.push({ d: d(bud.pos) + 0.3, text: `Press ${E} to talk to ${bud.name}`, act: () => this.ui.open('buddy', null, p) });
    const pet = this.pets.of(p);
    if (pet && d(pet.pos) < 2.2) out.push({ d: d(pet.pos) + 0.4, text: `Press ${E} to pet ${pet.name}`, act: () => this.pets.pat(pet) });
    if (L.bed && d(L.bed.pos) < (L.bed.radius || 1.5) + 1.8) {
      const ok = this.timeOfDay >= DAY_NIGHT.canSleepAfter || isNight(this.timeOfDay);
      out.push({ d: d(L.bed.pos), text: ok ? `Press ${E} to sleep until morning` : 'Bed <small>(you can sleep in the evening)</small>', act: () => this.sleep(p) });
    }
    if (this.worldId === 'home' && L.portals) {
      L.portals.forEach((pt) => {
        const dd = d(pt.pos);
        if (dd > (pt.radius || 2) + 2.6) return;
        const i = pt.index, dim = DIMENSIONS[i];
        if (this.portalState(i) === 'locked') {
          if (s.keys[i]) out.push({ d: dd, text: `Press ${E} to use the <b style="color:${POWERS[i].color}">Key to ${dim.name}</b>`, act: () => this.useKey(i) });
          else { const prev = DIMENSIONS[i - 1]; out.push({ d: dd, text: `<span class="lock-txt">Locked</span> Win the Key to ${dim.name} from <b>${prev.boss.name}</b> in ${prev.name}`, act: () => { this.audio.play('deny'); this.hud.toastFor(p, `You need the Key to ${dim.name}. ${prev.boss.name} in ${prev.name} has it.`, 'warn', 3); } }); }
        } else out.push({ d: dd, text: `Press ${E} to go to <b style="color:${POWERS[i].color}">${dim.name}</b> <small>(Level ${dim.level})</small>`, act: () => this.travel(i), portal: pt });
      });
    }
    if (L.homePortal && d(L.homePortal.pos) < (L.homePortal.radius || 2) + 2.6) out.push({ d: d(L.homePortal.pos), text: `Press ${E} to go home`, act: () => this.travel('home'), portal: L.homePortal });
    if (this.worldId !== 'home') {
      const i = this.worldId, ts = this.temples();
      const seen = new Set();
      ts.forEach((t) => {
        const key = `${t.altar.x.toFixed(1)},${t.altar.z.toFixed(1)}`;
        const da = d(t.altar), dd = d(t.door || t.pos);
        const st = this.templeState(t.tier);
        if (da < 3.2 && !seen.has(key)) {
          if (st === 'open') { seen.add(key); out.push({ d: da, text: `Press ${E} to take the <b style="color:${POWERS[i].color}">Crystal of ${POWERS[i].name} ${ROMAN[t.tier]}</b>`, act: () => this.claimCrystal(p, i, t.tier) }); }
          else if (st === 'claimed' && ts.every((o) => o.v2 || this.templeState(o.tier) !== 'open')) { seen.add(key); out.push({ d: da, text: this.mode.id === 'quest' ? `You already took this crystal.` : `The ${t.name}.`, act: null }); }
        }
        if (st === 'sealed' && (dd < 6 || da < 6) && (t.v2 || !ts.some((o) => this.templeState(o.tier) === 'open'))) {
          const gdef = DIMENSIONS[i].temples[t.tier].boss;
          if (!seen.has('sealed' + key)) { seen.add('sealed' + key); out.push({ d: Math.min(dd, da) + t.tier * 0.01, text: `Sealed! Win the 3 trials in its courtyard (the last one is <b>${gdef.name}</b>) to open the ${t.name}.`, act: null }); }
        }
      });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  interact(p) {
    const it = this.interactables(p).find((x) => x.act);
    if (it) it.act();
  }

  buy(kind) {
    const s = this.state;
    if (kind === 'sword') {
      const next = SWORDS[s.sword + 1];
      if (!next || s.coins < next.price) { this.audio.play('deny'); return; }
      s.coins -= next.price; s.sword++;
      this.audio.play('buy');
      this.hud.toast(`You got the ${next.name}!`, 'good', 3);
    } else {
      const next = ARMORS[s.armor + 1];
      if (!next || s.coins < next.price) { this.audio.play('deny'); return; }
      s.coins -= next.price; s.armor++;
      this.audio.play('buy');
      this.hud.toast(`You put on ${next.name}!`, 'good', 3);
    }
    this.players.forEach((p) => p.refreshGear());
    this.saveNow();
  }
  buyPotion(id, n) {
    const s = this.state, def = POTIONS.find((x) => x.id === id);
    if (!def || s.coins < def.price * n) { this.audio.play('deny'); return; }
    s.coins -= def.price * n;
    s.potions[id] = (s.potions[id] || 0) + n;
    this.audio.play('buy');
    this.saveNow();
  }
  sellAll() {
    const s = this.state;
    let total = 0;
    Object.entries(s.loot).forEach(([, v]) => { total += v.count * v.value; });
    if (!total) return;
    s.loot = {};
    s.coins += total;
    this.audio.play('sell');
    this.hud.toast(`Sold everything for ${fmt(total)} coins!`, 'good', 2.5);
    this.saveNow();
  }

  drinkHealth(p = this.player) {
    const s = this.state;
    if (p.dead || p.hp >= p.maxHp) return;
    const missing = p.maxHp - p.hp;
    let id = s.potions.hp > 0 ? 'hp' : s.potions.hp_big > 0 ? 'hp_big' : null;
    if (s.potions.hp_big > 0 && (missing > 120 || !s.potions.hp)) id = 'hp_big';
    if (!id) return;
    if (this.mode.id !== 'creative') s.potions[id]--;
    const def = POTIONS.find((x) => x.id === id);
    p.heal(def.heal);
    this.audio.play('potion');
    this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.2), def.color, 18, 2);
    this.hud.screenFlash(p, def.color, 0.15);
    this.hud.toastFor(p, `Glug! You drank a ${def.name}. (${s.potions.hp + s.potions.hp_big} left)`, 'good', 2);
    if (s.potions.hp + s.potions.hp_big === 0) setTimeout(() => this.hud.toast('That was the last health potion. Buy more at a shop!', 'warn', 3), 1200);
  }
  // eat one food from the shared bag (Bread / Carrot Soup / Apple Pie): the one that fits best
  eatFood(p) {
    const b = this.state.bag;
    if (!b) return false;
    const have = Object.keys(RECIPE_OF).filter((k) => b[k] > 0).map((k) => RECIPE_OF[k]);
    if (!have.length) return false;
    const missing = p.maxHp - p.hp;
    have.sort((x, y) => Math.abs(x.heal - missing) - Math.abs(y.heal - missing));
    const r = have[0];
    b[r.food]--;
    p.eatT = 4;
    p.heal(r.heal);
    if (r.mana) p.mana = Math.min(p.maxMana, p.mana + r.mana);
    if (r.buff && r.buff.kind === 'speed') { p.buffs = p.buffs || {}; p.buffs.snack = Math.max(p.buffs.snack || 0, r.buff.seconds || 60); }
    this.audio.play('potion', { pitch: 0.75 });
    this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.2), r.color, 18, 2);
    const left = Object.keys(RECIPE_OF).reduce((a, k) => a + (b[k] || 0), 0);
    this.hud.toastFor(p, `Yum! You ate ${r.food === 'pie' ? 'a slice of' : 'some'} ${r.name}${r.buff ? ' - you feel speedy!' : ''} <small>(${left} food left)</small>`, 'good', 2.2);
    return true;
  }
  drinkMana(p = this.player) {
    const s = this.state;
    if (p.dead || !s.potions.mana) return;
    if (this.mode.id !== 'creative') s.potions.mana--;
    p.mana = Math.min(p.maxMana, p.mana + POTIONS[2].mana);
    this.audio.play('potion', { pitch: 1.2 });
    this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.2), POTIONS[2].color, 18, 2);
    this.hud.toastFor(p, `Glug! You drank a Mana Potion. (${s.potions.mana} left)`, 'good', 1.8);
  }

  collectPickup(pk, who) {
    const s = this.state;
    if (!s) return;
    if (pk.type === 'coin') {
      s.coins += pk.value * (who && who.buffs && who.buffs.luck > 0 ? 2 : 1);   // Fortune Teller luck: double coins
      this.audio.play('coin', { pitch: 0.95 + Math.random() * 0.15, volume: 0.6 });
    } else if (pk.type === 'key') {
      s.keys[pk.keyFor] = true;
      if (this.worldId !== 'home') s.keysDropped[this.worldId] = false;
      const dim = DIMENSIONS[pk.keyFor];
      this.audio.play('unlock');
      this.hud.banner(`Key to ${dim.name}!`, 'Take it home and use it on the locked portal.', POWERS[pk.keyFor].color, 4);
      this.fx.sparkles((who || this.player).pos.clone().setY((who || this.player).pos.y + 1.4), '#ffd34a', 60, 5);
      this.saveNow();
    } else if (pk.loot) {
      const it = s.loot[pk.loot.name] || (s.loot[pk.loot.name] = { count: 0, value: pk.loot.value });
      it.count++;
      this.audio.play('loot');
      this.hud.toastFor(who, `+ ${pk.loot.name} <small>(sell it at a shop)</small>`, 'loot', 2);
    }
  }
  useKey(i) {
    const s = this.state, dim = DIMENSIONS[i], L = this.world.landmarks;
    s.keys[i] = false;
    s.portalsOpen[i] = true;
    this.world.setPortalState(i, this.portalState(i));
    this.audio.play('unlock');
    const pt = L.portals && L.portals[i];
    if (pt) {
      const c = pt.pos.clone().setY(pt.pos.y + 2.5);
      this.fx.sparkles(c, POWERS[i].color, 120, 7);
      this.fx.sparkles(c, '#ffd34a', 60, 5);
      this.fx.flash(c, POWERS[i].color, 60, 25, 1.2);
      this.fx.ring(pt.pos.clone().setY(pt.pos.y + 0.3), POWERS[i].color, 6, 0.7);
    }
    this.hud.banner(`The portal to ${dim.name} is open!`, dim.subtitle, POWERS[i].color, 3.5);
    this.saveNow();
  }

  // ---------------------------------------------------------------- sleeping (either player: both sleep)
  async sleep(p) {
    const L = this.world.landmarks;
    if (this.players.some((q) => q.sleeping) || p.dead) return;
    const ok = this.timeOfDay >= DAY_NIGHT.canSleepAfter || isNight(this.timeOfDay);
    if (!ok) { this.hud.toastFor(p, 'You are not sleepy yet. Beds work in the evening and at night.', 'info', 2.5); return; }
    if (this.boss.fighting) { this.hud.toastFor(p, 'You cannot sleep during a boss fight!', 'warn', 2); return; }
    this.players.forEach((q) => { q.sleeping = true; q.vel.set(0, 0, 0); });
    p.placeAt(L.bed.pos, p.yaw);
    this.players.forEach((q) => { if (q !== p) this.placeBeside(q, p); });
    this.hud.fadeBlack(true, true);
    this.audio.play('sleep');
    this.enemies.removeNight();
    await sleepMs(2600);
    if (this.timeOfDay > DAY_NIGHT.wakeTime) this.state.day = (this.state.day || 1) + 1;   // slept through midnight
    this.timeOfDay = DAY_NIGHT.wakeTime;
    this.world.setTimeOfDay(this.timeOfDay);
    this.lastNight = false; this.enemies.wasNight = false; this.duskWarned = false;
    this.players.forEach((q) => { q.dead = false; q.hp = q.maxHp; q.mana = q.maxMana; q.sleeping = false; });
    this.hud.fadeBlack(false);
    this.hud.toast('Good morning! You slept well and feel fully healed.', 'good', 3);
    this.audio.setMusicMood(this.moodForTime());
    this.saveNow();
  }

  // ---------------------------------------------------------------- knocked out
  onPlayerDeath(p) {
    if (p.dead) return;
    p.dead = true;
    p.deadT = 0;
    p.attack = null; p.cast = null; p.suit = null;
    this.powers.cancelCharge(p);
    this.audio.play('playerDeath');
    p.cam.shake(0.5);
    if (this.twoPlayers && this.players.some((q) => !q.dead)) {
      this.hud.toastFor(p, 'Knocked out! You will be back in 5 seconds.', 'warn', 3);
      return;
    }
    let lost = 0;
    if (this.mode.id !== 'creative') { lost = Math.floor(this.state.coins * 0.1); this.state.coins -= lost; }
    const where = this.worldId === 'home' ? 'You will wake up in your bed.' : 'You will wake up next to the portal home.';
    if (this.twoPlayers) { this.hud.banner('Both knocked out!', `You dropped ${fmt(lost)} coins.`, '#ff6a6a', 3); setTimeout(() => this.respawnAll(), 3000); return; }
    setTimeout(() => { if (p.dead && this.phase === 'play') { this.input.exitLock(true); this.ui.open('dead', { lost, where }); } }, 1800);
  }
  revive(p, near) {
    p.dead = false; p.deadT = 0;
    p.hp = p.maxHp; p.mana = p.maxMana;
    p.hots.length = 0;
    p.rig.setPose('idle'); p.lastPose = 'idle';
    if (near) this.placeBeside(p, near);
    this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1), '#ffffff', 30, 3);
    this.hud.toastFor(p, 'You are back on your feet!', 'good', 2);
  }
  respawnAll() {
    const L = this.world.landmarks, p = this.player;
    this.ui.closeAll();
    this.players.forEach((q) => this.revive(q, null));
    if (this.worldId === 'home' && L.bed) { const b = L.bed.pos.clone(); b.x += 1.5; p.placeAt(b, p.yaw); }
    else if (L.homePortal) {
      const fx = Math.sin(L.homePortal.yaw || 0), fz = Math.cos(L.homePortal.yaw || 0);
      p.placeAt(L.homePortal.pos.clone().add(new THREE.Vector3(fx * 5, 0, fz * 5)), L.homePortal.yaw || 0);
    } else p.placeAt(L.spawn, L.spawnYaw || 0);
    if (this.players[1]) this.placeBeside(this.players[1], p);
    this.players.forEach((q) => q.cam.snapBehind(q.yaw));
    this.enemies.list.forEach((e) => { if (e.alive && e.kind === 'night' && e.pos.distanceTo(p.pos) < 40) { e.fadingAway = true; this.enemies.kill(e); } });
    this.portalArmed = false;
    this.audio.setMusicMood(this.moodForTime());
    this.saveNow();
    if (this.wasLocked && !this.twoPlayers) this.input.requestLock();
  }
  respawn() { this.respawnAll(); }

  onLevelUp() {
    this.hud.banner(`Level ${this.state.level}!`, 'You feel stronger. Health and mana are full.', '#ffd34a', 2.6);
    this.audio.play('levelUp');
    this.players.forEach((p) => {
      this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1), '#ffd34a', 60, 5);
      this.fx.ground.spawn(this.world, { shape: 'circle', pos: p.pos, radius: 3, color: '#ffd34a', duration: 1.2, mode: 'ring' });
    });
    this.hud.refreshHotbar();
    this.saveNow();
  }
  celebrate() {
    let n = 0;
    const cel = setInterval(() => {
      if (!this.player || n++ > 10) { clearInterval(cel); return; }
      const p = this.players[n % this.players.length];
      const c = p.pos.clone().add(new THREE.Vector3(rand(-6, 6), rand(3, 7), rand(-6, 6)));
      this.fx.sparkles(c, ['#ffd34a', '#ff6a9a', '#7af0ff', '#9aff7a'][n % 4], 40, 6);
      this.fx.flash(c, '#ffffff', 15, 12, 0.4);
    }, 250);
  }

  // ---------------------------------------------------------------- bosses, temples, crystals, keys
  onGuardianDefeated(i, t) {
    const s = this.state, D = DIMENSIONS[i], tp = D.temples[t];
    s.guardians[i][t] = true;
    s.trials[i][t] = 3;
    this.trials.onGuardianWon(i, t);
    this.audio.play('bossDefeated');
    this.hud.banner(`${tp.boss.name} beaten!`, `Trial 3 won! The ${tp.name} is open!`, POWERS[i].color, 3.5);
    this.celebrate();
    this.setTemple(t, this.templeState(t));
    if (this.mode.id !== 'creative') setTimeout(() => this.hud.toast(`Go into the ${tp.name} and take the crystal (${this.player.ctl.key('use')}) for ${POWER_ATTACKS[i][3 * t + 2].name}!`, 'good', 5), 1800);
    this.saveNow();
  }
  // a trial gave a new move: players who have nothing usable selected get it ready
  onMoveWon(el, m) {
    this.players.forEach((p) => { if (!this.powers.canUse(p, p.sel.power, p.sel.move)) { p.sel.power = el; p.sel.move = m; } });
    this.hud.refreshHotbar();
  }
  onKeyGuardianDefeated(i, pos) {
    const s = this.state, d = DIMENSIONS[i];
    s.bosses[i] = true;
    this.audio.play('bossDefeated');
    this.celebrate();
    if (this.mode.id === 'quest' && d.keyFor != null && !s.keys[d.keyFor] && !s.portalsOpen[d.keyFor]) {
      s.keysDropped[i] = true;
      pos.y = this.world.heightAt(pos.x, pos.z);
      this.fx.dropKey(pos, d.keyFor, POWERS[d.keyFor].color);
      this.hud.banner(`${d.boss.name} beaten!`, `It dropped the Key to ${DIMENSIONS[d.keyFor].name} - go and pick it up!`, '#ffd34a', 4);
    } else this.hud.banner(`${d.boss.name} beaten!`, `You saved ${d.name}!`, '#ffd34a', 4);
    this.saveNow();
    if (s.bosses.every(Boolean) && !s.victoryShown && this.mode.id !== 'creative') {
      s.victoryShown = true;
      setTimeout(() => { this.audio.play('victory'); this.input.exitLock(true); this.ui.open('victory'); this.saveNow(); }, 5000);
    }
  }
  claimCrystal(p, el, t) {
    const s = this.state, pw = POWERS[el];
    if (s.crystals[el][t]) return;
    s.crystals[el][t] = true;
    s.moves[el][3 * t + 2] = true;     // the crystal gives the temple's 3rd move (trial 3)
    const moves = [POWER_ATTACKS[el][3 * t + 2].name];
    this.cinematic = 4;
    this.audio.play('temple');
    p.cam.orbit = { center: p.pos.clone(), radius: 6, height: 2.5, speed: 0.7, angle: p.yaw + Math.PI, lookY: 1.2 };
    const beamGeo = new THREE.CylinderGeometry(1.2, 1.6, 60, 24, 1, true).translate(0, 30, 0);
    const mat = new THREE.MeshBasicMaterial({ color: pw.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.position.copy(p.pos);
    const L = this.fx.holdLight(pw.color, 60, 25);
    if (L) L.position.copy(p.pos).add(new THREE.Vector3(0, 3, 0));
    this.fx.timedMesh(beam, 4, (o, k) => {
      mat.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.6;
      if (Math.random() < 0.6) this.fx.burst({ pos: p.pos.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(0, 6), rand(-1.5, 1.5))), count: 2, vel: new THREE.Vector3(0, -2, 0), velSpread: 0.6, life: [0.6, 1.2], size: [0.15, 0.35], color: [pw.color, '#ffffff'], sprite: 'spark' });
    }, () => { beamGeo.dispose(); mat.dispose(); this.fx.releaseLight(L); });
    this.fx.ground.spawn(this.world, { shape: 'circle', pos: p.pos, radius: 4, color: pw.color, duration: 4, mode: 'glow' });
    setTimeout(() => {
      this.hud.banner(`You got the Crystal of ${pw.name} ${ROMAN[t]}!`, `New move: ${moves[0]}`, pw.color, 5);
      this.hud.screenFlash(pw.color, 0.5);
      this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.2), pw.color, 90, 7);
    }, 900);
    this.setTemple(t, 'claimed');
    // the player who took it gets the first new move ready
    this.players.forEach((q) => { if (q === p || !this.powers.canUse(q, q.sel.power, q.sel.move)) { q.sel.power = el; q.sel.move = 3 * t + 2; } });
    this.powers.onSelect && this.powers.onSelect(p);
    this.hud.refreshHotbar();
    this.saveNow();
    setTimeout(() => {
      this.cinematic = 0;
      p.cam.orbit = null;
      p.cam.snapBehind(p.yaw);
      this.hud.toast(`Every hero can use ${moves[0]} now! ${p.ctl.key('nextMove')} picks a move, ${p.ctl.key('power')} uses it.`, 'info', 5);
    }, 4200);
  }

  switchCharacter(p, i) {
    if (typeof p === 'number') { i = p; p = this.player; }
    if (i === p.charIndex) return;
    p.setCharacter(i, true);
    const C = CHARACTERS[i], own = C.power;
    if (own != null && this.powers.elementUsable(p, own)) { p.sel.power = own; p.sel.move = [...Array(9).keys()].find((m) => this.powers.canUse(p, own, m)) || 0; }
    else this.fixSelection(p);
    this.powers.cancelCharge(p);
    this.hud.refreshHotbar();
    const col = own != null ? POWERS[own].color : '#ff5a4a';
    this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1), col, 40, 4);
    this.audio.play('portal', { volume: 0.5, pitch: 1.5 });
    if (own == null) this.hud.toastFor(p, `You are now ${C.name} the ${C.title}! ${p.ctl.key('sword')}: jab, cross, kick - jump + ${p.ctl.key('sword')}: flying kick! Power: any you have won`, 'good', 4);
    else this.hud.toastFor(p, `You are now ${C.name}! Power: <b style="color:${col}">${POWERS[own].name}</b> - stronger when ${C.name} uses it`, 'good', 3.5);
    this.saveNow();
  }

  // ---------------------------------------------------------------- moves / powers selection
  selectMove(p, m) {
    if (this.building && this.blocks.builder === p) { const page = Math.floor(this.blocks.selected / 9); this.selectBlock(Math.min(BLOCKS.length - 1, page * 9 + m)); return; }
    if (!this.powers.canUse(p, p.sel.power, m)) { this.audio.play('deny'); this.hud.toastFor(p, this.powers.lockHelp(p.sel.power, m), 'warn', 3); return; }
    p.sel.move = m;
    this.powers.cancelCharge(p);
    this.audio.play('click', { volume: 0.4 });
  }
  nextMove(p) {
    for (let k = 1; k <= 9; k++) {
      const m = (p.sel.move + k) % 9;
      if (this.powers.canUse(p, p.sel.power, m)) { p.sel.move = m; this.audio.play('click', { volume: 0.4 }); return; }
    }
  }
  nextPower(p) {
    const owned = [];
    for (let i = 0; i < 9; i++) if (this.powers.elementUsable(p, i)) owned.push(i);
    if (!owned.length) { this.hud.toastFor(p, 'You have no power moves yet. Win them in the temple trials!', 'info', 2.5); return; }
    if (owned.length === 1 && owned[0] === p.sel.power) { this.hud.toastFor(p, `${POWERS[p.sel.power].name} is your only power so far. Win temple trials in other worlds for more!`, 'info', 2.5); return; }
    const cur = owned.indexOf(p.sel.power);
    const el = owned[(cur + 1) % owned.length];
    p.sel.power = el;
    p.sel.move = [...Array(9).keys()].find((m) => this.powers.canUse(p, el, m)) || 0;
    this.powers.cancelCharge(p);
    this.hud.toastFor(p, `Power: <b style="color:${POWERS[el].color}">${POWERS[el].name}</b>`, 'power', 1.2);
    this.audio.play('click', { volume: 0.5 });
  }
  selectBlock(i) { this.blocks.selected = ((i % BLOCKS.length) + BLOCKS.length) % BLOCKS.length; this.hud.refreshHotbar(); }

  // ---------------------------------------------------------------- objective (one line)
  objective() {
    const s = this.state;
    if (!s || !this.world) return null;
    const L = this.world.landmarks, id = this.worldId;
    const night = isNight(this.timeOfDay) && this.mode.id !== 'creative';
    if (night && L.bed && id !== 'home') return { text: 'Night! Go to sleep in the bed', pos: L.bed.pos };
    if (this.mode.id === 'creative') return { text: this.building ? 'Build! F = place, G = remove, R = next block' : 'Press B to build, hold Space to fly', pos: null };
    const col = (i) => `<b style="color:${POWERS[i].color}">${PORTAL_COLOR_NAMES[i]}</b>`;
    const elName = (i) => `<b style="color:${POWERS[i].color}">${POWERS[i].name}</b>`;
    const worldDone = (i) => s.trials[i].every((n) => n >= 3) && s.crystals[i].every(Boolean);
    if (id === 'home') {
      const k = s.keys.findIndex(Boolean);
      if (k >= 0) return { text: `Use the <b style="color:${POWERS[k].color}">Key to ${DIMENSIONS[k].name}</b> on its portal`, pos: L.portals[k].pos };
      if (this.mode.id === 'hero') {
        // every portal is open: go to the first world that still has trials or a boss
        const next = [...Array(9).keys()].find((i) => !worldDone(i) || !s.bosses[i]);
        if (next == null) return { text: 'You won every move and beat every boss! Explore and have fun.', pos: null };
        return { text: `Go through the ${col(next)} portal to win ${elName(next)} moves`, pos: L.portals[next].pos };
      }
      let next = -1;
      for (let i = 8; i >= 0; i--) if (this.portalState(i) !== 'locked' && (!s.bosses[i] || !worldDone(i))) { next = i; break; }
      if (next < 0) {
        if (s.bosses.every(Boolean)) return { text: 'You beat every key guardian! Explore and have fun.', pos: null };
        const j = s.bosses.findIndex((b, i) => b && this.portalState(i + 1) === 'locked');
        return j >= 0 ? { text: `Get the Key to ${DIMENSIONS[j + 1].name} in ${DIMENSIONS[j].name}`, pos: L.portals[j].pos } : null;
      }
      return { text: `Go through the ${col(next)} portal`, pos: L.portals[next].pos };
    }
    const D = DIMENSIONS[id];
    const key = this.fx.pickups.find((pk) => pk.type === 'key');
    if (key) return { text: `Pick up the <b style="color:${key.color}">Key to ${DIMENSIONS[key.keyFor].name}</b>`, pos: key.pos };
    // the next unfinished trial in this world (any order works, this is just a suggestion)
    const cur = this.trials.cur;
    if (cur) { const t = this.temples()[cur.tier]; return { text: `${TRIALS[cur.k].name} at the ${t.name}: win ${POWER_ATTACKS[id][3 * cur.tier + cur.k].name}!`, pos: null }; }
    for (const t of this.temples()) {
      const n = s.trials[id][t.tier];
      if (n < 3) return { text: `Win the ${TRIALS[n].name} at the ${t.name} for ${elName(id)}: ${POWER_ATTACKS[id][3 * t.tier + n].name}`, pos: t.courtyard ? t.courtyard.pos : t.pos };
      if (!s.crystals[id][t.tier]) return { text: `Take the crystal in the ${t.name} for ${POWER_ATTACKS[id][3 * t.tier + 2].name}`, pos: t.altar };
    }
    if (!s.bosses[id]) {
      if (this.mode.id === 'quest' && D.keyFor != null) return { text: `Beat <b>${D.boss.name}</b> for the Key to ${DIMENSIONS[D.keyFor].name}`, pos: L.bossArena ? L.bossArena.pos : null };
      return { text: `Beat <b>${D.boss.name}</b>${D.keyFor == null ? ', the final boss!' : ''}`, pos: L.bossArena ? L.bossArena.pos : null };
    }
    if (D.keyFor != null && s.keys[D.keyFor]) return { text: 'Take the key home through the portal', pos: L.homePortal ? L.homePortal.pos : null };
    return { text: 'Go home through the portal', pos: L.homePortal ? L.homePortal.pos : null };
  }

  // ---------------------------------------------------------------- temporary walls
  addWall(seg, dur) { this.walls.push({ seg, t: dur }); }
  resolveWalls(pos, r) {
    for (const w of this.walls) {
      const o = w.seg;
      const dx = o.x2 - o.x1, dz = o.z2 - o.z1;
      const L = dx * dx + dz * dz || 1e-6;
      const t = clamp(((pos.x - o.x1) * dx + (pos.z - o.z1) * dz) / L, 0, 1);
      const cx = o.x1 + dx * t, cz = o.z1 + dz * t;
      const ddx = pos.x - cx, ddz = pos.z - cz, d = Math.hypot(ddx, ddz), min = r + o.r;
      if (d < min) { if (d < 1e-4) { pos.x += min; continue; } const k = (min - d) / d; pos.x += ddx * k; pos.z += ddz * k; }
    }
  }

  // ---------------------------------------------------------------- settings + saving
  setSetting(k, v) {
    this.settings[k] = v;
    saveSettings(this.settings);
    if (k === 'volume') this.audio.setVolume(v);
    if (k === 'music') this.audio.setMusic(v);
    if (k === 'quality') { this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, v === 'high' && !this.twoPlayers ? 1.5 : 1)); this.onResize(); }
  }
  saveNow() {
    const s = this.state;
    if (!s || !this.player) return;
    s.time = this.timeOfDay;
    s.world = this.worldId;
    const p = this.player, p2 = this.players[1];
    s.pos = [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)];
    s.yaw = p.yaw;
    s.hp = Math.max(1, Math.round(p.hp)); s.mana = Math.round(p.mana);
    s.character = p.charIndex;
    s.players = this.players.length;
    if (p2) { s.character2 = p2.charIndex; s.hp2 = Math.max(1, Math.round(p2.hp)); s.mana2 = Math.round(p2.mana); }
    s.buddies = this.buddies.serialize();
    s.pets = this.pets.serialize();
    if (this.blocksDirty || this.blocks.count || s.blocks[String(this.worldId)]) { s.blocks[String(this.worldId)] = this.blocks.serialize(); this.blocksDirty = false; }
    saveGame(s);
  }
  markBlocksDirty() { this.blocksDirty = true; this.blockSaveT = 3; }

  // ---------------------------------------------------------------- hero picker preview (in the owner's view)
  previewHero(i, p = this.player) {
    if (this.world == null || !p) return;
    if (this.preview && this.previewIndex === i && this.previewOwner === p) return;
    if (this.preview) { this.scene.remove(this.preview.root); this.preview.dispose(); this.preview = null; }
    this.previewIndex = i; this.previewOwner = p;
    if (i === p.charIndex) { p.rig.root.visible = true; return; }
    const rig = createHero(CHARACTERS[i], { quality: this.settings.quality });
    rig.root.position.copy(p.pos);
    rig.root.rotation.y = p.yaw;
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (CHARACTERS[i].fightStyle === 'fists') rig.setFightStyle('fists'); else rig.setSword(p.sword);
    rig.setArmor(p.armor); rig.setPose('idle');
    this.scene.add(rig.root);
    this.preview = rig;
    p.rig.root.visible = false;
    this.fx.sparkles(p.pos.clone().setY(p.pos.y + 1), CHARACTERS[i].power != null ? POWERS[CHARACTERS[i].power].color : '#ff5a4a', 16, 2);
  }
  startHeroPicker(p) {
    const right = this.twoPlayers && p.index === 1;
    p.cam.orbit = { center: p.pos.clone(), radius: 4.2, height: 1.4, speed: 0, angle: p.yaw + (right ? 0.35 : -0.35), lookY: 1.0, side: right ? -1.1 : 1.1 };
    this.previewIndex = p.charIndex; this.previewOwner = p;
  }
  endPreview() {
    if (this.preview) { this.scene.remove(this.preview.root); this.preview.dispose(); this.preview = null; }
    const p = this.previewOwner;
    this.previewIndex = -1; this.previewOwner = null;
    this.players.forEach((q) => { if (q.rig) q.rig.root.visible = this.phase === 'play'; });
    if (this.phase !== 'play') this.toTitleOrbit();
    else if (p && !this.cinematic) { p.cam.orbit = null; p.cam.snapBehind(p.yaw); }
  }

  // ---------------------------------------------------------------- input
  onLockChange(locked, onPurpose) {
    if (!locked && !onPurpose && this.phase === 'play' && !this.ui.overlay && !this.traveling) { this.wasLocked = true; this.openPause(); }
  }
  onCanvasDown() {
    this.audio.unlock();
    if (this.phase !== 'play' || this.ui.overlay || this.twoPlayers) return;
    if (!this.input.locked && !this.input.lockFailed) {
      this.input.requestLock(); this.ignoreClick = true;
      if (!this.state.hints.mouse) { this.state.hints.mouse = true; this.hud.toast('Mouse on! Move it to turn. Left click = sword, right click = power. Esc frees the mouse.', 'info', 4); }
    }
  }
  openPause() { if (this.phase === 'play' && !this.ui.overlay && this.players.some((p) => !p.dead)) this.ui.open('pause'); }
  resume() { this.ui.closeAll(); if (this.wasLocked && !this.twoPlayers) this.input.requestLock(); this.wasLocked = false; }
  onOverlayChange(closed) {
    if (this.ui.overlay && this.input.locked) { this.wasLocked = true; this.input.exitLock(true); }
    this.hud.root.classList.toggle('dimmed', !!this.ui.overlay);
    if (this.ui.overlay === 'switcher') this.startHeroPicker(this.ui.owner || this.player);
    if (closed === 'switcher' || (!this.ui.overlay && this.preview)) this.endPreview();
  }

  // global keys (pause, map, help); menus are driven by the player who opened them
  onKey(code, e) {
    if (this.ui.overlay || (this.phase !== 'play' && this.ui.screen) || (this.ui.els.players && this.ui.els.players.isConnected)) {
      if (this.ui.navKey(code, e)) return;
    }
    if (this.phase !== 'play' || !this.state || this.ui.overlay) return;
    if (this.traveling || this.cinematic) return;
    if (DEBUG && this.debugKey(code)) return;
    if (code === 'Escape') { this.openPause(); return; }
    if (code === 'KeyM') { this.ui.open('map'); return; }
    // keys card: ONLY Alt + F5 (either order: F5 while holding Alt, or Alt while holding F5)
    const altF5 = (code === 'F5' && ((e && e.altKey) || this.input.keys.has('AltLeft') || this.input.keys.has('AltRight')))
      || ((code === 'AltLeft' || code === 'AltRight') && this.input.keys.has('F5'));
    if (altF5) { this.hud.toggleHelp(); return; }
  }

  debugKey(code) {
    const s = this.state, p = this.player;
    switch (code) {
      case 'F1': s.coins += 10000; this.hud.toast('[debug] +10000 coins', 'info', 1.5); return true;
      case 'F2': this.enemies.defeatNear(40); this.hud.toast('[debug] defeated nearby enemies', 'info', 1.5); return true;
      case 'F3': this.timeOfDay = 0.8; this.duskWarned = true; this.enemies.nightT = 1; this.hud.toast('[debug] night', 'info', 1.5); return true;
      case 'F4': {
        const a = this.world.landmarks.bossArena;
        if (a) { p.placeAt(a.pos.clone().add(new THREE.Vector3((a.radius || 22) + 4, 0, 0)), -Math.PI / 2); p.cam.snapBehind(p.yaw); if (this.players[1]) this.placeBeside(this.players[1], p); }
        else this.hud.toast('[debug] no boss arena here', 'info', 1.5);
        return true;
      }
      case 'F6': {
        const t = this.temples()[0];
        if (t) { p.placeAt(t.altar.clone().add(new THREE.Vector3(0.5, 0, 0.5)), 0); p.cam.snapBehind(0); }
        else this.hud.toast('[debug] no temple here', 'info', 1.5);
        return true;
      }
      case 'F7':
        s.portalsOpen = Array(9).fill(true); s.crystals = s.crystals.map(() => [true, true, true]); s.moves = s.moves.map((r) => r.map(() => true)); s.trials = s.trials.map(() => [3, 3, 3]); s.guardians = s.guardians.map(() => [true, true, true]);
        if (this.worldId === 'home') for (let i = 0; i < 9; i++) { this.world.setPortalState(i, this.portalState(i)); this.world.setCrystals(i, 3); }
        else for (let t = 0; t < 3; t++) this.setTemple(t, this.templeState(t));
        this.hud.refreshHotbar(); this.hud.toast('[debug] everything unlocked', 'info', 1.5); return true;
      case 'F8': {   // cycle the temple courtyards (guardian bosses)
        const ts = this.temples();
        if (!ts.length) { this.hud.toast('[debug] no temples here', 'info', 1.5); return true; }
        this.dbgTemple = ((this.dbgTemple ?? -1) + 1) % ts.length;
        const c = ts[this.dbgTemple].courtyard;
        p.placeAt(c.pos.clone().add(new THREE.Vector3(c.radius + 4, 0, 0)), -Math.PI / 2); p.cam.snapBehind(p.yaw);
        if (this.players[1]) this.placeBeside(this.players[1], p);
        this.hud.toast(`[debug] courtyard of the ${ts[this.dbgTemple].name}`, 'info', 1.5);
        return true;
      }
      case 'F10': this.trials.winNow(); return true;
      case 'F9': {   // give the key
        let k = this.worldId !== 'home' ? DIMENSIONS[this.worldId].keyFor : s.portalsOpen.findIndex((o, i) => !o && i > 0);
        if (k == null || k < 0) { this.hud.toast('[debug] no key to give', 'info', 1.5); return true; }
        this.collectPickup({ type: 'key', keyFor: k, color: POWERS[k].color }, p);
        return true;
      }
    }
    return false;
  }

  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }

  // everything one player does with their own controls (keys, and the optional mouse for player 1 alone)
  playerActions(p, ctl, dt = 1 / 60) {
    const builder = this.building && this.blocks.builder === p;
    const clickL = ctl.mouseClick(0) && !this.ignoreClick, clickR = ctl.mouseClick(2) && !this.ignoreClick;
    if (builder) {
      if (ctl.hit('sword') || clickL) this.blocks.place();
      if (ctl.hit('power') || clickR) this.blocks.breakTarget();
      if (ctl.hit('nextMove')) this.selectBlock(this.blocks.selected + 1);
      this.powers.cancelCharge(p);
    } else {
      if (ctl.hit('sword') || (ctl.down('sword') && !p.attack) || clickL || (ctl.mouseHeld(0) && !p.attack && !this.ignoreClick)) p.tryAttack();
      // power: tap = use the selected move, HOLD ~0.7 s and let go = SUPER (keyboard or right mouse button)
      this.powers.input(p, ctl.down('power') || (ctl.mouseHeld(2) && !this.ignoreClick), dt);
      if (ctl.hit('nextMove')) this.nextMove(p);
      if (ctl.hit('nextPower')) this.nextPower(p);
    }
    const slot = ctl.slotHit();
    if (slot >= 0) this.selectMove(p, slot);
    if (ctl.hit('use')) this.interact(p);
    if (ctl.hit('hero')) this.ui.open('switcher', null, p);
    if (ctl.hit('view')) this.firstPerson.toggle(p);
    if (ctl.hit('build')) {
      if (this.mode.building) {
        if (this.building && this.blocks.builder !== p) this.blocks.builder = p;
        else { this.building = !this.building; this.blocks.builder = this.building ? p : null; }
        this.hud.refreshHotbar();
        this.hud.toastFor(p, this.building ? `Build mode! ${ctl.key('sword')} = place, ${ctl.key('power')} = remove, ${ctl.key('nextMove')} = next block, ${ctl.key('build')} = stop.` : 'Build mode off', 'info', 3);
      } else this.hud.toastFor(p, 'Building is only in Creative mode.', 'info', 2);
    }
  }

  // If the computer struggles (slow frames for a few seconds), lower the picture sharpness a step so the
  // game stays smooth; raise it again when there is plenty of speed to spare. Never above the quality setting.
  autoResolution(dt) {
    if (this.phase !== 'play' || document.hidden || !this.world || this.paused) { this.slowT = 0; this.fastT = 0; return; }
    const max = Math.min(window.devicePixelRatio, this.settings.quality === 'high' && !this.twoPlayers ? 1.5 : 1);
    const pr = this.renderer.getPixelRatio();
    if (dt > 1 / 28) { this.slowT = (this.slowT || 0) + dt; this.fastT = 0; }
    else if (dt < 1 / 50) { this.fastT = (this.fastT || 0) + dt; this.slowT = Math.max(0, (this.slowT || 0) - dt); }
    if (this.slowT > 3 && pr > 0.6) { this.renderer.setPixelRatio(Math.max(0.6, pr - 0.2)); this.onResize(); this.slowT = 0; }
    else if (this.fastT > 15 && pr < max) { this.renderer.setPixelRatio(Math.min(max, pr + 0.2)); this.onResize(); this.fastT = 0; }
  }

  // ---------------------------------------------------------------- per-frame
  frame() {
    const now = performance.now();
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!(dt > 0)) dt = 0.016;
    this.autoResolution(dt);
    this.audio.update(dt);
    if (!this.world) { this.input.endFrame(); this.renderer.render(this.scene, this.camera); return; }   // a world is loading
    if (this.phase === 'play' && this.state) {
      const steps = dt > 0.055 ? 2 : 1;
      for (let k = 0; k < steps; k++) { this.updatePlay(dt / steps); if (k === 0) { this.input.pressed.clear(); this.input.mouse.clicked.clear(); } }
    } else this.updateMenu(dt);
    this.input.endFrame();
    this.render();
  }
  render() {
    const r = this.renderer;
    if (this.phase !== 'play' || this.players.length < 2) {
      r.setScissorTest(false);
      this.firstPerson.beforeRender(0);
      r.render(this.scene, this.camera);
      this.firstPerson.afterRender();
      return;
    }
    // split screen: the shadow map is drawn once and reused for the second view
    const W = window.innerWidth, H = window.innerHeight;
    r.setScissorTest(true);
    this.players.forEach((p, i) => {
      r.setViewport(i * W / 2, 0, W / 2, H);
      r.setScissor(i * W / 2, 0, W / 2, H);
      r.shadowMap.needsUpdate = i === 0;
      r.shadowMap.autoUpdate = i === 0;
      this.firstPerson.beforeRender(i);
      r.render(this.scene, p.view.camera);
      this.firstPerson.afterRender();
    });
    r.shadowMap.autoUpdate = true;
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  }

  updateMenu(dt) {
    this.time += dt;
    if (this.preview) this.preview.update(dt);
    this.cam.update(dt, this.world.landmarks.spawn, 1.8, this.world);
    this.world.update(dt, this.time, this.cam.orbit ? this.cam.orbit.center : this.world.landmarks.spawn, this.camera);
    this.npcs.update(dt);
    this.fx.update(dt, this.time);
  }

  updatePlay(rawDt) {
    const inp = this.input, P = this.player;
    let dt = rawDt;
    if (this.hitStopT > 0) { this.hitStopT -= rawDt; dt = rawDt * 0.06; }
    const paused = this.paused;
    const m = inp.takeMouse();
    if (!paused && !this.cinematic) {
      // optional mouse (player 1 playing alone): turns the hero (camera follows), tilts the camera
      if (P.ctl.useMouse && inp.locked && !P.dead && !P.sleeping) {
        const sens = 0.0022 * this.settings.sensitivity;
        const inv = this.settings.invertY ? -1 : 1;
        if (m.dx) { P.yaw -= m.dx * sens; P.cam.yaw = P.yaw; }
        if (m.dy) { P.cam.rotate(0, m.dy * sens * inv); this.mouseLookT = 4; }
      }
      if (m.wheel) {
        if (this.building && this.blocks.builder === P) this.selectBlock(this.blocks.selected + m.wheel);
        else {
          const was = P.cam.firstPerson;
          P.cam.zoom(m.wheel);
          if (P.cam.firstPerson !== was) this.firstPerson.announce(P);
        }
      }
      for (const p of this.players) {
        if (this.canControl(p)) this.playerActions(p, p.ctl, rawDt);
        else if (p.pw.holding) this.powers.cancelCharge(p);
      }
      if (!inp.mouse.buttons.size) this.ignoreClick = false;
    }
    // each camera swings smoothly behind its hero
    if (!this.ui.overlay) {
      this.mouseLookT = Math.max(0, (this.mouseLookT || 0) - rawDt);
      for (const p of this.players) {
        if (p.cam.orbit) continue;
        p.cam.fpSuspend = !!(p.dead || p.sleeping);
        const fp = p.cam.fp;   // first person: the view turns with the hero right away, looking ahead (not down)
        p.cam.yaw = angleDamp(p.cam.yaw, p.yaw, fp ? 20 : 5, rawDt);
        if (p.index > 0 || this.mouseLookT <= 0) p.cam.pitch = damp(p.cam.pitch, fp ? -0.1 : -0.26, 2, rawDt);
      }
    }
    // food from the Cook is eaten by itself below half health (before any potion)
    for (const p of this.players) {
      p.eatT = Math.max(0, (p.eatT || 0) - rawDt);
      if (!paused && !p.dead && !this.mode.invincible && this.mode.id !== 'creative' && p.hp < p.maxHp * 0.5 && p.eatT <= 0) this.eatFood(p);
    }
    // auto health potion when health gets low
    for (const p of this.players) {
      p.autoPotT = Math.max(0, (p.autoPotT || 0) - rawDt);
      if (!paused && !p.dead && !this.mode.invincible && p.hp < p.maxHp * 0.3 && p.autoPotT <= 0 && (this.state.potions.hp > 0 || this.state.potions.hp_big > 0)) { p.autoPotT = 3; this.drinkHealth(p); }
    }

    if (!paused) {
      this.time += dt;
      this.state.playTime = (this.state.playTime || 0) + dt;
      const sleeping = this.players.some((p) => p.sleeping);
      if (!sleeping) {
        const before = this.timeOfDay;
        this.timeOfDay = (this.timeOfDay + dt / DAY_NIGHT.cycleSeconds) % 1;
        if (this.timeOfDay < before) this.state.day = (this.state.day || 1) + 1;   // midnight: a new day
      }
      const t = this.timeOfDay;
      const night = isNight(t);
      if (!this.duskWarned && t >= 0.72 && t < DAY_NIGHT.nightStart) {
        this.duskWarned = true;
        if (this.mode.id !== 'creative') {
          if (this.worldId === 'home') this.hud.toast('Night is coming! Home Base is safe - night creatures only hunt on the planets.', 'info', 5);
          else this.hud.toast('Night is coming! Sleep in a bed or the night creatures will hunt you!', 'warn', 6);
          this.audio.play('dusk');
        }
      }
      if (t > 0.3 && t < 0.7) this.duskWarned = false;
      if (night !== this.lastNight) { this.lastNight = night; if (!this.boss.fighting) this.audio.setMusicMood(this.moodForTime()); }

      for (const p of this.players) p.update(dt);
      // a knocked-out player comes back after 5 s next to the other one (2 players)
      if (this.twoPlayers) for (const p of this.players) {
        if (!p.dead) continue;
        p.deadT += dt;
        const other = this.players.find((q) => q !== p && !q.dead);
        if (other && p.deadT >= 5) this.revive(p, other);
      }
      this.enemies.update(dt);
      this.boss.update(dt);
      this.powers.update(dt);
      this.allies.update(dt);
      this.trials.update(dt);
      this.npcs.update(dt);
      this.buddies.update(dt);
      this.pets.update(dt);
      this.blocks.update(dt, this.building && this.canControl(this.blocks.builder || P));
      this.fx.update(dt, this.time);
      for (let i = this.walls.length - 1; i >= 0; i--) { this.walls[i].t -= dt; if (this.walls[i].t <= 0) this.walls.splice(i, 1); }
      if (this.cinematic > 0) this.cinematic = Math.max(0, this.cinematic - rawDt);

      this.updatePortals();
      for (const p of this.players) {
        const its = this.interactables(p);
        this.hud.prompt(p, its.length && !p.dead ? its[0].text : '');
      }
      // sword trail (player 1)
      const tip = P.rig && P.rig.swordTip;
      const fpFrom = new THREE.Vector3(), fpTo = new THREE.Vector3();
      if (this.firstPerson.active(P) && (P.fists || this.firstPerson.trail(P, fpFrom, fpTo))) {
        // first person: the streak follows the sword in front of the eyes (fists: no streak)
        const a = P.attack;
        this.fx.trail.update(dt, !P.fists && !!a && a.t > a.hit * 0.4 && a.t < a.dur * 0.85, fpFrom, fpTo);
      } else if (tip && P.rig.handR) {
        const a = P.attack;
        const emitting = !!a && a.t > a.hit * 0.4 && a.t < a.dur * 0.85;
        const tp = tip.getWorldPosition(new THREE.Vector3());
        // fists: a short streak behind the punching fist / kicking foot (the model moves swordTip there)
        const from = P.fists ? tp.clone().add(new THREE.Vector3(0, 0.14, 0)) : P.rig.handR.getWorldPosition(new THREE.Vector3()).lerp(tp, 0.35);
        this.fx.trail.update(dt, emitting, from, tp);
      } else this.fx.trail.update(dt, false);
      this.updatePortalHum();
      this.saveT -= rawDt;
      if (this.saveT <= 0) { this.saveT = 30; this.saveNow(); }
      if (this.blockSaveT > 0) { this.blockSaveT -= rawDt; if (this.blockSaveT <= 0) this.saveNow(); }
    }

    // cameras + world always update (so menus over the game still look alive)
    const ground = (x, z, y) => {
      const h = this.world.heightAt(x, z);
      return this.blocks.count ? Math.max(h, this.blocks.topAt(x, z, y + 0.5, 0.2)) : h;
    };
    for (const p of this.players) {
      p.cam.update(rawDt, p.pos, p.height, this.world, ground);
      if (this.cinematic && p.cam.orbit && !this.ui.overlay) p.cam.orbit.center.copy(p.pos);
    }
    this.firstPerson.update(rawDt);
    const mid = this.players.length > 1 ? P.pos.clone().lerp(this.players[1].pos, 0.5) : P.pos;
    this.world.setTimeOfDay(this.timeOfDay);
    this.world.update(rawDt, this.time, mid, this.camera);
    const nk = this.nightFactor();
    this.nightLights.forEach((L, i) => {
      const p = this.players[i];
      const lan = p && this.npcs.lanternFor(p);   // the Night Watch's lantern: a brighter, warmer light
      L.intensity = p ? nk * (lan ? 30 : 14) : 0;
      L.distance = lan ? 26 : 18;
      if (lan) L.position.copy(lan).setY(lan.y + 0.4);
      else if (p) L.position.set(p.pos.x, p.pos.y + 3.2, p.pos.z);
    });
    if (this.preview) this.preview.update(rawDt);
    if (this.helpAutoHideT > 0 && !paused) { this.helpAutoHideT -= rawDt; if (this.helpAutoHideT <= 0) this.hud.toggleHelp(false); }
    this.hud.update(rawDt);
  }

  nightFactor() {
    const a = Math.cos(this.timeOfDay * Math.PI * 2);   // 1 at midnight, -1 at noon
    let k = clamp((a + 0.15) / 0.5, 0, 1);
    if (this.worldId !== 'home' && DIMENSIONS[this.worldId].biome.alwaysNight) k = Math.max(k, 0.7);
    return k;
  }

  // walk into an open portal: everybody travels together
  updatePortals() {
    const L = this.world.landmarks;
    const list = [];
    if (this.worldId === 'home' && L.portals) L.portals.forEach((pt) => list.push({ pt, target: pt.index, open: this.portalState(pt.index) !== 'locked' }));
    if (L.homePortal) list.push({ pt: L.homePortal, target: 'home', open: true });
    let near = false;
    for (const p of this.players) {
      for (const it of list) {
        const d = Math.hypot(p.pos.x - it.pt.pos.x, p.pos.z - it.pt.pos.z);
        if (d < 3.5) near = true;
        if (d < Math.min(1.9, (it.pt.radius || 2) * 0.8) && this.portalArmed && it.open && !p.dead && Math.abs(p.pos.y - it.pt.pos.y) < 3) {
          this.portalArmed = false;
          this.travel(it.target);
          return;
        }
      }
    }
    if (!near) this.portalArmed = true;
  }
  updatePortalHum() {
    const L = this.world.landmarks;
    let best = 99;
    for (const p of this.players) {
      if (L.portals) L.portals.forEach((pt) => { if (this.portalState(pt.index) !== 'locked') best = Math.min(best, Math.hypot(p.pos.x - pt.pos.x, p.pos.z - pt.pos.z)); });
      if (L.homePortal) best = Math.min(best, Math.hypot(p.pos.x - L.homePortal.pos.x, p.pos.z - L.homePortal.pos.z));
    }
    this.audio.setLoop('portalHum', clamp(1 - best / 12, 0, 1) * 0.8);
    const fl = this.players.find((p) => p.flying);
    this.audio.setLoop('wind', fl ? clamp(Math.hypot(fl.vel.x, fl.vel.z) / 25, 0.15, 1) : 0);
    this.audio.setLoop('lava', this.players.some((p) => p.inLava) ? 0.8 : 0);
  }
}
