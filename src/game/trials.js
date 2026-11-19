// Temple TRIALS: outside Creative every power move is won in its own fight. Each temple (tier t) runs 3 trials in
// its courtyard, one per move: 0 'wave' -> move 3t, 1 'champion' -> move 3t+1, 2 'guardian' (the temple guardian
// boss) -> the temple opens and its crystal gives move 3t+2. Walk into a courtyard to start the next trial.
import * as THREE from 'three';
import { DIMENSIONS, POWERS, POWER_ATTACKS, TRIALS } from '../data.js';
import { rand, pick } from './util.js';

const BREAK = 4;          // seconds between trials
const COUNTDOWN = 3;

export class Trials {
  constructor(game) {
    this.game = game;
    this.cur = null;        // { tier, k, phase: 'countdown'|'fight'|'won', t, enemies, boss, shown }
    this.cool = 0;          // after a win / reset: wait before the next countdown
    this.ringT = 0;
  }
  get active() { return !!this.cur; }
  done(i, t) { const s = this.game.state; return s ? s.trials[i][t] : 0; }
  moveFor(t, k) { return 3 * t + k; }
  moveName(i, t, k) { return POWER_ATTACKS[i][3 * t + k].name; }
  label(i, t, k) { return `Trial ${k + 1} of 3: ${TRIALS[k].name}`; }

  clear() {
    if (this.cur) this.removeFoes(this.cur);
    this.cur = null;
    this.cool = 0;
    this.game.hud.countdown(null);
  }
  removeFoes(c) {
    const g = this.game;
    (c.enemies || []).forEach((e) => { if (e.alive) { e.fadingAway = true; g.enemies.kill(e); } });
    if (c.boss && c.boss.alive) g.boss.remove(c.boss);
    c.enemies = []; c.boss = null;
  }
  // players standing in a courtyard (+ margin)
  inside(court, margin = 0) {
    return this.game.players.filter((p) => !p.dead && Math.hypot(p.pos.x - court.pos.x, p.pos.z - court.pos.z) < (court.radius || 20) + margin);
  }

  update(dt) {
    const g = this.game, s = g.state;
    if (!s || g.worldId === 'home' || g.mode.id === 'creative' || !g.world) { if (this.cur) this.clear(); return; }
    const i = g.worldId;
    const temples = g.temples();
    this.cool = Math.max(0, this.cool - dt);
    // gentle rings on courtyards that still have trials, so kids can find them
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = 2.2;
      temples.forEach((t) => {
        if (!t.courtyard || this.done(i, t.tier) >= 3) return;
        if (g.enemies.minPlayerDist(t.courtyard.pos.x, t.courtyard.pos.z) > 80) return;
        g.fx.ground.spawn(g.world, { shape: 'circle', pos: t.courtyard.pos, radius: t.courtyard.radius || 20, color: POWERS[i].color, duration: 2, mode: 'ring', opacity: 0.7 });
      });
    }
    const c = this.cur;
    if (!c) {
      if (this.cool > 0 || g.traveling || g.ui.overlay) return;
      for (const t of temples) {
        const k = this.done(i, t.tier);
        if (!t.courtyard || k >= 3) continue;
        if (this.inside(t.courtyard).length) { this.start(t, k); break; }
      }
      return;
    }
    const t = temples[c.tier];
    c.t += dt;
    // nobody left in the courtyard (or everybody knocked out): this trial stops; won trials stay won
    if (!this.inside(t.courtyard, 6).length) { this.fail(c); return; }
    if (c.phase === 'countdown') {
      const n = Math.ceil(COUNTDOWN - c.t);
      if (n !== c.shown) { c.shown = n; g.hud.countdown(n > 0 ? String(n) : 'GO!'); g.audio.play(n > 0 ? 'click' : 'dusk', { volume: n > 0 ? 0.8 : 0.6, pitch: n > 0 ? 1.4 : 1.2 }); }
      if (c.t >= COUNTDOWN) { c.phase = 'fight'; c.t = 0; this.spawnFoes(t, c); setTimeout(() => g.hud.countdown(null), 600); }
      return;
    }
    if (c.phase === 'fight') {
      if (c.k < 2) {
        if (c.enemies.length && c.enemies.every((e) => !e.alive)) this.win(c);
      } else if (c.boss && !c.boss.alive) {
        // the guardian's defeat is handled by game.onGuardianDefeated -> this.onGuardianWon
      }
    }
  }

  start(t, k) {
    const g = this.game, i = g.worldId;
    const mv = this.moveName(i, t.tier, k);
    this.cur = { tier: t.tier, k, phase: 'countdown', t: 0, enemies: [], boss: null, shown: -1 };
    const what = k < 2 ? `win ${mv.toUpperCase()}!` : `beat the guardian for ${mv.toUpperCase()}!`;
    g.hud.banner(this.label(i, t.tier, k), `${t.name}: ${what}`, POWERS[i].color, 3.2);
    g.audio.play('dusk', { volume: 0.6 });
    if (!g.state.hints.trials) { g.state.hints.trials = true; g.hud.toast('A temple trial! Stay in the courtyard and win the fight. If you leave, the trial stops.', 'info', 5); }
  }

  spawnFoes(t, c) {
    const g = this.game, i = g.worldId, D = DIMENSIONS[i], court = t.courtyard;
    const spot = () => g.enemies.findSpot(court.pos, 3, (court.radius || 20) * 0.75, 20) || court.pos.clone();
    if (c.k === 0) {
      const n = TRIALS[0].count[c.tier] * (g.players.length > 1 ? 1.5 : 1);
      const total = Math.max(1, Math.round(n) + g.diff.waveExtra);   // Easy: one fewer, Hard: two more
      for (let j = 0; j < total; j++) {
        const e = g.enemies.spawnTrial(pick(D.enemies), spot(), { hpMul: TRIALS[0].hpMul * (1 + c.tier * 0.25) });
        if (e) c.enemies.push(e);
      }
      g.audio.play('growl', { volume: 0.6 });
    } else if (c.k === 1) {
      const def = pick(D.enemies);
      const e = g.enemies.spawnTrial(def, court.pos.clone().setY(g.world.heightAt(court.pos.x, court.pos.z)), {
        hpMul: TRIALS[1].hpMul * (1 + c.tier * 0.3) * (g.players.length > 1 ? 1.4 : 1), sizeMul: 1.8, dmgMul: 1.5, name: `Champion ${def.name}`, tint: POWERS[i].color,
      });
      if (e) { c.enemies.push(e); g.audio.play('bossRoar', { volume: 0.6, pitch: 1.3 }); g.players.forEach((p) => p.cam.shake(0.3)); }
    } else {
      const b = g.boss.spawn(D.temples[c.tier].boss, court.pos, court.radius || 20, 'guardian', c.tier);
      b.trial = true;
      c.boss = b;
      g.boss.wake(b);
    }
  }

  win(c) {
    const g = this.game, s = g.state, i = g.worldId;
    const t = g.temples()[c.tier];
    const m = this.moveFor(c.tier, c.k);
    s.trials[i][c.tier] = Math.max(s.trials[i][c.tier], c.k + 1);
    if (c.k < 2) {
      s.moves[i][m] = true;
      g.hud.banner(`You won ${POWER_ATTACKS[i][m].name.toUpperCase()}!`, `A new ${POWERS[i].name} move for ${g.players.length > 1 ? 'both of you' : 'you'}! (${POWER_ATTACKS[i][m].desc})`, POWERS[i].color, 4);
      g.onMoveWon(i, m);
    }
    this.cur = null;
    this.cool = BREAK;
    g.celebrate();
    g.audio.play('levelUp');
    g.saveNow();
    void t;
  }
  fail(c) {
    const g = this.game;
    this.removeFoes(c);
    this.cur = null;
    this.cool = 2;
    g.hud.countdown(null);
    if (c.phase === 'fight') g.hud.toast('Trial stopped. Come back into the courtyard to try again!', 'warn', 3.5);
  }
  // the temple guardian (trial 3) was beaten
  onGuardianWon(i, tier) {
    const g = this.game, s = g.state;
    s.trials[i][tier] = 3;
    if (this.cur && this.cur.tier === tier && this.cur.k === 2) { this.cur = null; this.cool = BREAK; }
    void s;
  }
  // debug: win the running trial right now
  winNow() {
    const g = this.game, c = this.cur;
    if (!c) { g.hud.toast('[debug] no trial running - walk into a courtyard', 'info', 2); return; }
    if (c.phase === 'countdown') { c.phase = 'fight'; c.t = 0; this.spawnFoes(g.temples()[c.tier], c); g.hud.countdown(null); }
    if (c.k < 2) { c.enemies.forEach((e) => { if (e.alive) g.enemies.hit(e, e.hp + 1, { source: 'debug' }); }); this.win(c); }
    else if (c.boss && c.boss.alive) g.enemies.hit(c.boss, c.boss.hp + 1, { source: 'debug' });
  }
}

export { rand, THREE };
