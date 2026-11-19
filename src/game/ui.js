// Menus and overlay screens (DOM). Everything works with the keyboard: the player who opened a menu drives it
// with their own move keys (P1: W A S D or arrows when alone, P2: arrows) and presses with their use / power /
// sword / jump key or Enter. Esc goes back.
import { MODES, CHARACTERS, SWORDS, ARMORS, POTIONS, POWERS, DIMENSIONS, GAME_TITLE, POWER_ATTACKS, DIFFICULTIES, DEFAULT_DIFFICULTY, FRIENDLY_NPCS } from '../data.js';
import { powerIcon, swordIcon, armorIcon, potionIcon, coinIcon, lockIcon, portraitIcon, lootIcon, img } from './icons.js';
import { loadGame } from './save.js';
import { fmt } from './util.js';
import { ICON } from './npcs.js';
import { ROMAN } from './powers.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const DIFF_FACE = {
  easy: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#5fd36a" stroke="#fff" stroke-width="3"/><circle cx="23" cy="27" r="4" fill="#1a3a1a"/><circle cx="41" cy="27" r="4" fill="#1a3a1a"/><path d="M19 38q13 13 26 0" fill="none" stroke="#1a3a1a" stroke-width="4" stroke-linecap="round"/></svg>',
  medium: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#ffd34a" stroke="#fff" stroke-width="3"/><circle cx="23" cy="27" r="4" fill="#4a3a10"/><circle cx="41" cy="27" r="4" fill="#4a3a10"/><path d="M21 41h22" stroke="#4a3a10" stroke-width="4" stroke-linecap="round"/></svg>',
  hard: '<svg viewBox="0 0 64 64"><path d="M32 2c4 8 12 10 12 10s6-5 5-10c8 8 11 18 9 28L32 58 6 30C4 20 8 10 15 2c0 5 5 10 5 10s8-2 12-10Z" fill="#ff9a3a"/><circle cx="32" cy="36" r="22" fill="#ff5a4a" stroke="#fff" stroke-width="3"/><path d="M19 27l9 4M45 27l-9 4" stroke="#3a1010" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="34" r="3.5" fill="#3a1010"/><circle cx="40" cy="34" r="3.5" fill="#3a1010"/><path d="M22 47q10-7 20 0" fill="none" stroke="#3a1010" stroke-width="4" stroke-linecap="round"/></svg>',
};
const ICON_FIST = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="11" rx="4" fill="#f2c6a0" stroke="#7a3a2a" stroke-width="1.4"/><path d="M9 7v5M13 7v5M17 8v4" stroke="#7a3a2a" stroke-width="1.2"/><rect x="6" y="17" width="12" height="4" rx="1" fill="#c4242b"/></svg>');
const diffName = (id) => (DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES.find((d) => d.id === DEFAULT_DIFFICULTY)).name;
const SHORT_BIO = {
  aria: 'Fast and nimble.', bram: 'Lots of health.', kira: 'Super fast sword.', leo: 'Strong healing.',
  luna: 'Lots of mana.', rex: 'Hits the hardest.', nova: 'Finds extra coins.', ivy: 'Heals by herself.', zane: 'Sneaky surprise hits.',
};

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.screen = null;
    this.overlay = null;
    this.overlayStack = [];
    this.owner = null;          // the player driving the open menu (null = anyone)
    this.els = {};
    this.focusEl = null;
    this.root.addEventListener('click', (e) => { if (e.target.closest('button, [data-nav]')) game.audio.play('click', { volume: 0.6 }); });
    this.root.addEventListener('mouseover', (e) => {
      const b = e.target.closest('button:not([disabled]), [data-nav]');
      if (b && b !== this._hov) { this._hov = b; game.audio.play('hover', { volume: 0.3 }); this.setFocus(b, false); }
    });
  }

  // ---------------------------------------------------------------- keyboard navigation
  topLayer() {
    if (this.els.confirm && this.els.confirm.isConnected) return this.els.confirm;
    if (this.els.players && this.els.players.isConnected) return this.els.players;
    if (this.overlay && this.els[this.overlay]) return this.els[this.overlay];
    if (this.screen && this.els[this.screen]) return this.els[this.screen];
    return null;
  }
  navItems(layer) { return [...layer.querySelectorAll('button:not([disabled]), [data-nav], input[type=range]')].filter((el) => el.offsetParent !== null); }
  clearFocus() { if (this.focusEl) this.focusEl.classList.remove('kfocus'); this.focusEl = null; }
  setFocus(el, scroll = true) {
    if (this.focusEl === el) return;
    if (this.focusEl) this.focusEl.classList.remove('kfocus');
    this.focusEl = el;
    if (!el) return;
    el.classList.add('kfocus');
    if (scroll && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    if (this.overlay === 'switcher' && el.dataset.i !== undefined) this.game.previewHero(+el.dataset.i, this.owner);
  }
  autoFocus() {
    const layer = this.topLayer();
    if (!layer) return;
    const items = this.navItems(layer);
    const pick = layer.querySelector('.kfirst:not([disabled])') || layer.querySelector('.selected[data-nav]') || layer.querySelector('button.primary:not([disabled])') || items[0];
    this.clearFocus();
    if (pick) this.setFocus(pick);
  }
  // which direction / press does this key mean for the menu owner?
  navAction(code) {
    const p = this.owner;
    const ks = p && p.ctl ? p.ctl.keys : null;
    const has = (a) => ks && (ks[a] || []).includes(code);
    if (code === 'Escape') return 'back';
    if (ks) {
      if (has('forward')) return 'up';
      if (has('back')) return 'down';
      if (has('left')) return 'left';
      if (has('right')) return 'right';
      if (has('use') || has('power') || has('sword') || has('jump') || code === 'Enter' || code === 'NumpadEnter') return 'press';
      if (has('hero') && this.overlay === 'switcher') return 'back';
      return null;
    }
    const map = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      Enter: 'press', NumpadEnter: 'press', Space: 'press', KeyE: 'press', KeyG: 'press', KeyF: 'press', KeyU: 'press', KeyK: 'press', KeyJ: 'press', KeyL: 'press' };
    return map[code] || null;
  }
  navKey(code, e) {
    const layer = this.topLayer();
    if (!layer) return false;
    const g = this.game;
    const items = this.navItems(layer);
    if (!this.focusEl || !items.includes(this.focusEl)) this.autoFocus();
    let act = this.navAction(code);
    if (code === 'KeyM' && this.overlay === 'map') act = 'back';
    if (act === 'back') {
      if (layer === this.els.confirm) { layer.remove(); this.autoFocus(); return true; }
      if (layer === this.els.players) { layer.remove(); this.autoFocus(); return true; }
      if (this.overlay) {
        if (this.overlay === 'dead') return true;
        if (this.overlayStack.length) { this.close(); return true; }
        if (g.phase === 'play') g.resume(); else this.close();
        return true;
      }
      if (this.screen === 'modes') { this.showScreen('title'); return true; }
      return true;
    }
    const f = this.focusEl;
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    if (dirs[act]) {
      if (f && f.type === 'range' && (act === 'left' || act === 'right')) {
        const step = +f.step || 0.1;
        f.value = Math.min(+f.max, Math.max(+f.min, +f.value + (act === 'right' ? step * 2 : -step * 2)));
        f.dispatchEvent(new Event('input'));
        return true;
      }
      const [dx, dy] = dirs[act];
      if (!f) { this.autoFocus(); return true; }
      const r0 = f.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
      let best = null, bs = Infinity;
      for (const it of items) {
        if (it === f) continue;
        const r = it.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
        const along = x * dx + y * dy, side = Math.abs(x * dy - y * dx);
        if (along <= 4) continue;
        const s = along + side * 2.5;
        if (s < bs) { bs = s; best = it; }
      }
      if (best) { this.setFocus(best); g.audio.play('hover', { volume: 0.35 }); }
      return true;
    }
    if (act === 'press') {
      if (f && f.type !== 'range') { g.input.pressed.clear(); f.click(); setTimeout(() => this.autoFocusIfLost(), 0); }
      return true;
    }
    if (this.overlay === 'switcher' && /^Digit[0-9]$/.test(code)) { const i = (+code.slice(5) + 9) % 10; const el = layer.querySelector(`[data-i="${i}"]`); if (el) this.setFocus(el); return true; }
    return true;   // menus swallow other keys
  }
  autoFocusIfLost() {
    const layer = this.topLayer();
    if (!layer) return;
    if (!this.focusEl || !this.focusEl.isConnected || !layer.contains(this.focusEl)) this.autoFocus();
  }

  // ---------------------------------------------------------------- screens
  mount(name, node) {
    if (this.els[name]) this.els[name].remove();
    this.els[name] = node;
    this.root.appendChild(node);
    return node;
  }
  showScreen(name) {
    ['title', 'modes'].forEach((n) => { if (this.els[n]) this.els[n].classList.toggle('hidden', n !== name); });
    this.screen = name;
    this.owner = null;
    if (name === 'title') this.renderTitle();
    if (name === 'modes') this.renderModes();
    this.autoFocus();
  }
  hideScreens() { ['title', 'modes'].forEach((n) => this.els[n] && this.els[n].classList.add('hidden')); this.screen = null; this.clearFocus(); }

  renderTitle() {
    const n = this.mount('title', h(`<div class="screen title-screen">
      <div class="logo"><div class="logo-sub">~ a 3D adventure ~</div><h1>${GAME_TITLE}</h1><div class="planets">${DIMENSIONS.map((d, i) => `<i style="background:${POWERS[i].color};color:${POWERS[i].color}" title="${d.name}"></i>`).join('')}</div></div>
      <div class="title-buttons">
        <button class="btn big primary kfirst" data-a="play">Play</button>
        <button class="btn" data-a="settings">Settings</button>
      </div>
      <div class="title-foot">Use the arrow keys and press Enter</div>
    </div>`));
    n.querySelector('[data-a=play]').onclick = () => { this.game.audio.unlock(); this.showScreen('modes'); };
    n.querySelector('[data-a=settings]').onclick = () => { this.game.audio.unlock(); this.open('settings'); };
  }

  renderModes() {
    const cards = MODES.map((m) => {
      const s = loadGame(m.id);
      const beaten = s ? s.bosses.filter(Boolean).length : 0;
      const info = s ? `<div class="save-info">${img(portraitIcon(CHARACTERS[s.character] || CHARACTERS[0]), 'mini')}${s.players === 2 ? img(portraitIcon(CHARACTERS[s.character2] || CHARACTERS[3]), 'mini') : ''} Level ${s.level} - ${(s.moves || []).flat().filter(Boolean).length} of 81 moves won <b class="diff-chip diff-${s.difficulty || DEFAULT_DIFFICULTY}">${diffName(s.difficulty)}</b></div>` : '<div class="save-info empty">New adventure</div>';
      const btns = s ? `<button class="btn big primary" data-cont="${m.id}">Keep playing</button><button class="btn small" data-new="${m.id}">Start over</button>` : `<button class="btn big primary" data-new="${m.id}">Play</button>`;
      return `<div class="card mode-card mode-${m.id}"><div class="mode-icon">${this.modeIcon(m.id)}</div><h2>${m.name}</h2><p>${m.desc}</p>${info}<div class="card-buttons">${btns}</div></div>`;
    }).join('');
    const n = this.mount('modes', h(`<div class="screen modes-screen"><h1 class="screen-title">How do you want to play?</h1><div class="mode-cards">${cards}</div><button class="btn back" data-a="back">Back</button></div>`));
    n.querySelector('[data-a=back]').onclick = () => this.showScreen('title');
    n.querySelectorAll('[data-cont]').forEach((b) => { b.onclick = () => { this.game.audio.unlock(); const id = b.dataset.cont; this.askPlayers(loadGame(id).players || 1, (np) => this.game.continueGame(id, np)); }; });
    n.querySelectorAll('[data-new]').forEach((b) => {
      b.onclick = () => {
        this.game.audio.unlock();
        const id = b.dataset.new, name = MODES.find((m) => m.id === id).name;
        // Quest / Hero: how many players, then how hard. Creative is always easy.
        const go = () => this.askPlayers(1, (np) => (id === 'creative' ? this.game.newGame(id, np, 'easy') : this.askDifficulty(DEFAULT_DIFFICULTY, (d) => this.game.newGame(id, np, d))));
        if (loadGame(id)) this.confirm(`Start ${name} again from the beginning? Your old ${name} game will be gone.`, go);
        else go();
      };
    });
    const q = n.querySelector('.mode-quest [data-new], .mode-quest [data-cont]');
    if (q) q.classList.add('kfirst');
  }
  // "1 Player / 2 Players"
  askPlayers(def, cb) {
    const n = this.mount('players', h(`<div class="overlay ov-players"><div class="ov-box panel">
      <h1>How many players?</h1>
      <div class="players-row">
        <button class="btn big pl-card ${def === 1 ? 'primary kfirst' : ''}" data-n="1"><span class="pl-num">1</span><span>Player</span><small>Arrow keys or W A S D</small></button>
        <button class="btn big pl-card ${def === 2 ? 'primary kfirst' : ''}" data-n="2"><span class="pl-num">2</span><span>Players</span><small>Split screen: W A S D + arrows</small></button>
      </div>
      <div class="menu-buttons"><button class="btn small" data-a="back">Back</button></div></div></div>`));
    n.querySelectorAll('[data-n]').forEach((b) => { b.onclick = () => { n.remove(); cb(+b.dataset.n); }; });
    n.querySelector('[data-a=back]').onclick = () => { n.remove(); this.autoFocus(); };
    this.clearFocus();
    this.autoFocus();
  }
  // "How hard?" - Easy / Medium / Hard (after picking Quest or Hero and 1 / 2 players)
  askDifficulty(def, cb) {
    const cards = DIFFICULTIES.map((d) => `<button class="btn big diff-card diff-${d.id} ${d.id === def ? 'primary kfirst' : ''}" data-d="${d.id}"><span class="diff-face">${DIFF_FACE[d.id] || ''}</span><span class="diff-name">${d.name}</span><small>${d.desc}</small></button>`).join('');
    const n = this.mount('players', h(`<div class="overlay ov-players ov-diff"><div class="ov-box panel">
      <h1>How hard?</h1>
      <div class="players-row diff-row">${cards}</div>
      <div class="tip">You can change this any time in the pause menu.</div>
      <div class="menu-buttons"><button class="btn small" data-a="back">Back</button></div></div></div>`));
    n.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { n.remove(); cb(b.dataset.d); }; });
    n.querySelector('[data-a=back]').onclick = () => { n.remove(); this.autoFocus(); };
    this.clearFocus();
    this.autoFocus();
  }
  modeText(id) {
    if (id === 'creative') return 'Fly anywhere, build with blocks, nothing can hurt you. You have every power move!';
    if (id === 'quest') return "Start with a wooden sword and your hero's own power. Win temple crystals for new moves and portal keys to open new worlds.";
    return 'You know all 81 power moves already. Beat the bosses and win the portal keys!';
  }
  modeIcon(id) {
    if (id === 'creative') return '<svg viewBox="0 0 64 64"><path d="M32 6 56 18 32 30 8 18Z" fill="#8fd16a"/><path d="M8 18 32 30v28L8 46Z" fill="#6b4a2f"/><path d="M56 18 32 30v28l24-12Z" fill="#4e3622"/></svg>';
    if (id === 'quest') return '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="none" stroke="#ffd34a" stroke-width="4"/><path d="M32 12 38 32 32 52 26 32Z" fill="#ff6a5a"/><circle cx="32" cy="32" r="4" fill="#fff"/></svg>';
    return '<svg viewBox="0 0 64 64"><path d="M32 6 52 14v18c0 14-10 22-20 26C22 54 12 46 12 32V14Z" fill="#5a8aff" stroke="#fff" stroke-width="3"/><path d="M32 18l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z" fill="#ffd34a"/></svg>';
  }

  // ---------------------------------------------------------------- overlays
  open(name, data, owner = null) {
    if (this.overlay === name) return;
    if (this.overlay) this.overlayStack.push(this.overlay);
    else this.owner = owner;
    this.overlay = name;
    this.render(name, data);
    this.game.onOverlayChange();
    this.autoFocus();
  }
  close() {
    const cur = this.overlay;
    if (cur && this.els[cur]) { this.els[cur].remove(); delete this.els[cur]; }
    this.overlay = this.overlayStack.pop() || null;
    if (this.overlay) this.render(this.overlay);
    else this.owner = null;
    this.game.onOverlayChange(cur);
    this.autoFocus();
  }
  closeAll() {
    const was = this.overlay;
    while (this.overlay) { const cur = this.overlay; if (this.els[cur]) { this.els[cur].remove(); delete this.els[cur]; } this.overlay = this.overlayStack.pop() || null; }
    this.overlayStack.length = 0;
    this.owner = null;
    this.game.onOverlayChange(was);
    this.clearFocus();
  }
  render(name, data) { const fn = this['render_' + name]; if (fn) fn.call(this, data); }
  wrap(name, inner, cls = '') {
    const who = this.owner && this.game.players.length > 1 ? `<div class="ov-owner p${this.owner.index + 1}">Player ${this.owner.index + 1}</div>` : '';
    const n = this.mount(name, h(`<div class="overlay ov-${name} ${cls}"><div class="ov-box panel">${who}${inner}</div></div>`));
    n.querySelectorAll('[data-close]').forEach((x) => { x.onclick = () => { if (this.overlayStack.length || this.game.phase !== 'play') this.close(); else this.game.resume(); }; });
    return n;
  }

  render_pause() {
    const g = this.game, D = g.diff;
    const canDiff = !!(g.state && g.mode);   // every mode (Creative too: it changes how tough monsters are)
    const n = this.wrap('pause', `<h1>Paused</h1>
      <div class="menu-buttons">
        <button class="btn big primary" data-a="resume">Play</button>
        <button class="btn" data-a="stuff">My stuff</button>
        <button class="btn" data-a="help">Keys</button>
        ${canDiff ? `<button class="btn diff-btn diff-${D.id}" data-a="diff">Difficulty: ${D.name} &#9656;</button>` : ''}
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn" data-a="quit">Save and go to menu</button>
      </div>`);
    const db = n.querySelector('[data-a=diff]');
    if (db) {
      db.onclick = () => {
        const i = DIFFICULTIES.findIndex((d) => d.id === g.diff.id);
        const nx = DIFFICULTIES[(i + 1) % DIFFICULTIES.length];
        g.setDifficulty(nx.id);
        g.hud.toast(`Difficulty: ${nx.name}. ${nx.desc}`, 'info', 3);
        this.render_pause();
        const again = this.els.pause.querySelector('[data-a=diff]');
        this.clearFocus();
        if (again) this.setFocus(again);
      };
    }
    n.querySelector('[data-a=resume]').onclick = () => this.game.resume();
    n.querySelector('[data-a=stuff]').onclick = () => this.open('inventory');
    n.querySelector('[data-a=help]').onclick = () => { this.game.resume(); this.game.hud.toggleHelp(true); };
    n.querySelector('[data-a=settings]').onclick = () => this.open('settings');
    n.querySelector('[data-a=quit]').onclick = () => this.game.quitToTitle();
  }

  render_settings() {
    const s = this.game.settings;
    const n = this.wrap('settings', `<h1>Settings</h1>
      <div class="settings">
        <label>Graphics <span class="seg" data-k="quality"><button data-v="high">Pretty</button><button data-v="low">Fast</button></span></label>
        <label>Volume <input type="range" min="0" max="1" step="0.05" data-k="volume" value="${s.volume}"><b class="val"></b></label>
        <label>Music <span class="seg" data-k="music"><button data-v="true">On</button><button data-v="false">Off</button></span></label>
        <label>Mouse speed <input type="range" min="0.2" max="3" step="0.05" data-k="sensitivity" value="${s.sensitivity}"><b class="val"></b></label>
        <label>Mouse up/down <span class="seg" data-k="invertY"><button data-v="false">Normal</button><button data-v="true">Flipped</button></span></label>
      </div>
      <div class="tip quality-tip hidden">Graphics change fully after you reload the page.</div>
      <div class="menu-buttons"><button class="btn primary" data-close>Done</button></div>`);
    const refresh = () => {
      n.querySelectorAll('.seg').forEach((seg) => { const k = seg.dataset.k; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(s[k]) === b.dataset.v)); });
      n.querySelectorAll('input[type=range]').forEach((r) => { r.nextElementSibling.textContent = r.dataset.k === 'volume' ? `${Math.round(s.volume * 100)}%` : `x${(+s[r.dataset.k]).toFixed(1)}`; });
    };
    n.querySelectorAll('.seg button').forEach((b) => {
      b.onclick = () => {
        const k = b.parentElement.dataset.k; let v = b.dataset.v;
        if (v === 'true') v = true; else if (v === 'false') v = false;
        if (k === 'quality' && v !== s.quality) n.querySelector('.quality-tip').classList.remove('hidden');
        this.game.setSetting(k, v); refresh();
      };
    });
    n.querySelectorAll('input[type=range]').forEach((r) => { r.oninput = () => { this.game.setSetting(r.dataset.k, +r.value); refresh(); }; });
    refresh();
  }

  confirm(text, yes) {
    const n = this.mount('confirm', h(`<div class="overlay ov-confirm"><div class="ov-box panel small"><p>${text}</p><div class="menu-buttons row"><button class="btn big primary kfirst" data-a="no">No</button><button class="btn big" data-a="yes">Yes</button></div></div></div>`));
    n.querySelector('[data-a=no]').onclick = () => { n.remove(); this.autoFocus(); };
    n.querySelector('[data-a=yes]').onclick = () => { n.remove(); yes(); };
    this.clearFocus();
    this.autoFocus();
  }

  // ---------------------------------------------------------------- shop: big simple buttons
  render_shop() {
    const g = this.game, s = g.state, p = this.owner || g.player;
    const coin = img(coinIcon(), 'coin');
    const nextSw = SWORDS[s.sword + 1], nextAr = ARMORS[s.armor + 1];
    const lootTotal = Object.values(s.loot).reduce((a, v) => a + v.count * v.value, 0);
    const lootCount = Object.values(s.loot).reduce((a, v) => a + v.count, 0);
    const row = (key, icon, label, price, extra = '') => `<button class="btn shop-btn" data-buy="${key}" ${price !== null && s.coins < price ? 'disabled' : ''}>${img(icon, 'ico big')}<span class="shop-label">${label}${extra ? `<small>${extra}</small>` : ''}</span>${price !== null ? `<span class="shop-price">${coin} ${fmt(price)}</span>` : ''}</button>`;
    const rows = [
      nextSw ? row('sword', swordIcon(nextSw), `Upgrade sword: ${nextSw.name}`, nextSw.price, `Now: ${SWORDS[s.sword].name}${g.players.some((q) => q.fists) ? " - it makes Kai's fists stronger too!" : ''}`) : `<div class="shop-done">${img(swordIcon(SWORDS[s.sword]), 'ico big')} You have the best sword!</div>`,
      nextAr ? row('armor', armorIcon(nextAr), `Upgrade armour: ${nextAr.name}`, nextAr.price, `Now: ${ARMORS[s.armor].name}`) : `<div class="shop-done">${img(armorIcon(ARMORS[s.armor]), 'ico big')} You have the best armour!</div>`,
      row('hp', potionIcon(POTIONS[0]), 'Buy a health potion', POTIONS[0].price, `You have ${s.potions.hp + s.potions.hp_big}. You drink them by yourself when you get hurt.`),
      row('mana', potionIcon(POTIONS[2]), 'Buy a mana potion', POTIONS[2].price, `You have ${s.potions.mana}`),
      lootCount ? `<button class="btn shop-btn" data-buy="sell">${img(lootIcon(), 'ico big')}<span class="shop-label">Sell all loot<small>${lootCount} things</small></span><span class="shop-price plus">+ ${coin} ${fmt(lootTotal)}</span></button>` : '',
    ].join('');
    const n = this.wrap('shop', `<div class="shop-head"><h1>Shop</h1><div class="shop-coins">${img(coinIcon(), 'coin big')} ${fmt(s.coins)}</div></div>
      <div class="shop-list">${rows}</div>
      <div class="menu-buttons"><button class="btn" data-close>Bye!</button></div>`, 'shop');
    n.querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.buy;
        if (k === 'sword' || k === 'armor') g.buy(k);
        else if (k === 'hp' || k === 'mana') g.buyPotion(k, 1);
        else if (k === 'sell') g.sellAll();
        this.render_shop();
        const again = this.els.shop.querySelector(`[data-buy="${k}"]:not([disabled])`);
        this.clearFocus();
        if (again) this.setFocus(again); else this.autoFocus();
      };
    });
    void p;
  }

  // ---------------------------------------------------------------- my stuff (progress)
  render_inventory() {
    const g = this.game, s = g.state, p = this.owner || g.player, c = p.char;
    const loot = Object.entries(s.loot).filter(([, v]) => v.count > 0);
    const P = g.powers;
    const elements = POWERS.map((pw, i) => {
      const n = POWER_ATTACKS[i].filter((_, m) => P.canUse(p, i, m)).length;
      const own = P.isOwn(p, i);
      return `<div class="pw ${n ? '' : 'locked'}${own ? ' own' : ''}">${img(powerIcon(pw), 'ico')}${n ? '' : img(lockIcon(), 'lk')}<span>${pw.name}${own ? ' <i class="own-star"></i>' : ''}<small>${n} / 9 moves</small></span></div>`;
    }).join('');
    const worlds = DIMENSIONS.map((d, i) => {
      const cr = s.crystals[i].map((has, t) => `<i class="crys ${has ? 'on' : ''}" style="--c:${POWERS[i].color}" title="Crystal ${ROMAN[t]}"></i>`).join('');
      const key = d.keyFor != null ? (s.portalsOpen[d.keyFor] ? '<b class="ok">Key used</b>' : s.keys[d.keyFor] ? '<b class="ok">Key carried</b>' : s.bosses[i] ? '<b>Key dropped</b>' : '<b class="dim">No key yet</b>') : (s.bosses[i] ? '<b class="ok">Beaten!</b>' : '<b class="dim">Final boss</b>');
      return `<div class="boss-row ${s.bosses[i] ? 'beaten' : ''}"><i style="background:${POWERS[i].color}"></i><span>${d.name}</span><span class="crys-row">${cr}</span>${key}</div>`;
    }).join('');
    this.wrap('inventory', `<div class="inv-head"><h1>My stuff</h1></div>
      <div class="inv-grid">
        <div class="inv-col">
          <div class="char-head">${img(portraitIcon(c), 'big-portrait')}<div><h2>${c.name}</h2><div class="char-title">${c.title} - Level ${s.level}</div></div></div>
          <div class="gear-row">${img(swordIcon(p.sword), 'ico')}<span>${p.weaponName}</span></div>
          <div class="gear-row">${img(armorIcon(p.armor), 'ico')}<span>${p.armor.name}</span></div>
          <div class="gear-row">${img(coinIcon(), 'ico')}<span>${fmt(s.coins)} coins</span></div>
          <div class="gear-row">${img(potionIcon(POTIONS[0]), 'ico')}<span>${s.potions.hp + s.potions.hp_big} health potions, ${s.potions.mana} mana potions</span></div>
          <div class="kv"><span>Monsters beaten</span><b>${s.kills}</b></div>
          <h3>Loot</h3>
          <div class="loot-mini">${loot.length ? loot.map(([nm, v]) => `<div>${nm} <b>x${v.count}</b></div>`).join('') : '<div class="dim">Nothing yet</div>'}</div>
        </div>
        <div class="inv-col">
          <h3>Powers</h3><div class="pw-grid">${elements}</div>
          <h3>Worlds: crystals and keys</h3><div class="boss-list">${worlds}</div>
        </div>
      </div>
      <div class="menu-buttons"><button class="btn primary" data-close>Back</button></div>`, 'wide');
  }

  // ---------------------------------------------------------------- map
  render_map() {
    const g = this.game;
    const n = this.wrap('map', `<div class="inv-head"><h1>${g.worldName}</h1></div><canvas class="bigmap" width="640" height="640"></canvas>
      <div class="legend"><span><i class="lg-you"></i>You</span><span><i class="lg-portal"></i>Portal</span><span><i class="lg-temple"></i>Temple</span><span><i class="lg-shop"></i>Shop</span><span><i class="lg-bed"></i>Bed</span><span><i class="lg-boss"></i>Boss</span><span><i class="lg-enemy"></i>Monster</span><span><i class="lg-night"></i>Night creature</span>${g.state.mapped && g.state.mapped[String(g.worldId)] ? '<span><i class="lg-camp"></i>Bandit camp</span>' : ''}</div>
      <div class="menu-buttons"><button class="btn primary" data-close>Close (M)</button></div>`, 'map');
    const cv = n.querySelector('.bigmap'), ctx = cv.getContext('2d');
    const hud = g.hud;
    if (!hud.mapImg) return;
    const S = 640, R = hud.mapR, k = S / (2 * R);
    ctx.save(); ctx.translate(S / 2, S / 2); ctx.scale(-1, -1); ctx.translate(-S / 2, -S / 2);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(hud.mapImg, 0, 0, S, S);
    ctx.restore();
    const toS = (x, z) => [S / 2 - x * k, S / 2 - z * k];
    hud.landmarkMarkers().forEach((m) => { const s = toS(m.x, m.z); hud.drawMarker(ctx, s[0], s[1], m, 1.6); });
    g.enemies.list.forEach((e) => { if (!e.alive) return; const s = toS(e.pos.x, e.pos.z); ctx.fillStyle = e.kind === 'night' ? '#c070ff' : e.kind === 'bandit' ? '#ff9a3a' : '#ff4a4a'; ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, Math.PI * 2); ctx.fill(); });
    g.boss.list.forEach((b) => { if (b.alive) { const s = toS(b.pos.x, b.pos.z); hud.drawMarker(ctx, s[0], s[1], { kind: 'boss' }, b.role === 'key' ? 2 : 1.5); } });
    g.players.forEach((p) => {
      const s = toS(p.pos.x, p.pos.z);
      ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(-p.yaw);
      ctx.fillStyle = p.index ? '#5ad1ff' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(9, 9); ctx.lineTo(0, 4); ctx.lineTo(-9, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  }

  // ---------------------------------------------------------------- hero picker: cards on one side, live 3D hero in the player's view
  render_switcher() {
    const g = this.game, p = this.owner || g.player;
    const cur = p.charIndex;
    const side = g.players.length > 1 && p.index === 1 ? 'side right' : 'side';
    const locked = (c) => c.unlock === 'dojo' && !(g.state && (g.state.dojo || g.mode.id === 'creative'));
    const powerLine = (c) => (c.power == null
      ? `<em class="hero-power" style="color:#ff8a7a">${img(ICON_FIST, 'pico')}Fists and kicks! Power: any you have won</em>`
      : `<em class="hero-power" style="color:${POWERS[c.power].color}">${img(powerIcon(POWERS[c.power]), 'pico')}Power: ${POWERS[c.power].name} - stronger when ${c.name} uses it</em>`);
    const tile = (c, i) => (locked(c)
      ? `<div class="char-tile locked" data-nav data-i="${i}" data-locked="1">${img(portraitIcon(c))}<div><span>${c.name} ${img(lockIcon(), 'pico')}</span><small>${c.title}</small><em class="hero-power">Visit the Dojo at Home Base</em></div></div>`
      : `<div class="char-tile ${i === cur ? 'selected' : ''}" data-nav data-i="${i}">${img(portraitIcon(c))}<div><span>${c.name}</span><small>${SHORT_BIO[c.id] || c.title}</small>${powerLine(c)}</div></div>`);
    const n = this.wrap('switcher', `<h1>Pick a hero</h1>
      <div class="switch-grid n${CHARACTERS.length}">${CHARACTERS.map(tile).join('')}</div>
      <div class="tip">Every hero has their own power. Move to look, press to pick.</div>`, side);
    n.querySelectorAll('.char-tile').forEach((t) => {
      t.onclick = () => {
        const i = +t.dataset.i;
        if (t.dataset.locked) { g.audio.play('deny'); g.hud.toastFor(p, `${CHARACTERS[i].name} lives in the Dojo at Home Base. Talk to the Dojo Master to play as ${CHARACTERS[i].name}!`, 'warn', 3.5); return; }
        g.resume(); g.switchCharacter(p, i);
      };
    });
  }

  // ---------------------------------------------------------------- talking to your buddy
  render_buddy() {
    const g = this.game, p = this.owner || g.player, b = g.buddies.of(p);
    if (!b) { setTimeout(() => g.resume(), 0); return; }
    const n = this.wrap('buddy', `<h1>${b.name}</h1>
      <p class="dim">${b.waiting ? '"I am waiting right here for you!"' : '"Where are we going next?"'}</p>
      <div class="menu-buttons">
        ${b.waiting ? '<button class="btn big primary" data-a="come">Come with me!</button>' : '<button class="btn big primary" data-a="ok">Let\'s keep going!</button><button class="btn" data-a="wait">Wait here</button>'}
        <button class="btn" data-a="home">Go home</button>
      </div>`);
    const bind = (a, fn) => { const x = n.querySelector(`[data-a=${a}]`); if (x) x.onclick = () => { fn(); g.resume(); }; };
    bind('ok', () => g.buddies.say(b, 'Right behind you!', 2));
    bind('come', () => { b.waiting = false; g.buddies.say(b, "Yay! Let's go!", 2); });
    bind('wait', () => { b.waiting = true; g.buddies.say(b, 'Okay, I will wait right here!', 2.5); });
    bind('home', () => g.buddies.dismiss(b));
  }

  // ---------------------------------------------------------------- Portal Keeper: zap to a place in this world
  render_zap(data = {}) {
    const g = this.game, list = g.npcs.zapTargets();
    this.zapList = list;
    const n = this.wrap('zap', `<h1>Where to?</h1>
      <div class="menu-buttons zap-list">${list.map((t, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-z="${i}">${t.label}${t.sub ? ` <small>${t.sub}</small>` : ''}</button>`).join('')}
        <button class="btn small" data-close>Stay here</button></div>`);
    n.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => { const t = this.zapList[+b.dataset.z]; g.resume(); if (t) g.npcs.zap(t); }; });
    void data;
  }
  // ---------------------------------------------------------------- Animal Tamer: pick a pet
  render_pet() {
    const g = this.game, p = this.owner || g.player, cur = g.pets.of(p);
    const pets = [['dog', 'Dog', 'Loyal and fast - loves fetching coins!'], ['cat', 'Cat', 'Soft and clever.'], ['rabbit', 'Rabbit', 'Hop hop hop!']];
    const n = this.wrap('pet', `<h1>Pick a pet!</h1>
      <p class="dim">${cur ? `${cur.name} the ${cur.kind} will go back to the Tamer if you pick a new pet.` : 'Your pet follows you everywhere - even through portals - and picks up coins for you.'}</p>
      <div class="players-row pet-row">${pets.map(([k, nm, d], i) => `<button class="btn big pl-card pet-card ${i === 0 ? 'primary kfirst' : ''}" data-pet="${k}"><span class="pet-ico">${ICON.tamer}</span><span>${nm}</span><small>${d}</small></button>`).join('')}</div>
      <div class="menu-buttons"><button class="btn small" data-close>Not now</button></div>`);
    n.querySelectorAll('[data-pet]').forEach((b) => { b.onclick = () => { g.resume(); g.pets.give(p, b.dataset.pet); }; });
  }

  // ---------------------------------------------------------------- death / victory
  render_dead(data = {}) {
    const n = this.wrap('dead', `<h1 class="defeat">Oh no! You were knocked out</h1><p>${data.lost ? `You dropped ${fmt(data.lost)} coins.` : 'Don\'t give up!'}</p><p class="dim">${data.where || ''}</p>
      <div class="menu-buttons"><button class="btn big primary" data-a="respawn">Try again</button></div>`, 'dark');
    n.querySelector('[data-a=respawn]').onclick = () => this.game.respawnAll();
  }
  render_victory() {
    this.wrap('victory', `<h1 class="victory">YOU WIN!</h1><p>You beat every key guardian and saved the Nine Planets!</p><p class="dim">You can keep exploring, collecting crystals and upgrading as long as you like.</p>
      <div class="menu-buttons"><button class="btn big primary" data-close>Keep playing</button></div>`, 'gold');
  }

  // ---------------------------------------------------------------- portal travel transition
  transition(text, color) {
    const n = this.mount('transition', h(`<div class="transition"><div class="swirl" style="--c:${color}"></div><div class="tr-text">${text}</div></div>`));
    requestAnimationFrame(() => n.classList.add('on'));
    return n;
  }
  endTransition() {
    const n = this.els.transition;
    if (!n) return;
    n.classList.add('out');
    setTimeout(() => { n.remove(); if (this.els.transition === n) delete this.els.transition; }, 700);
  }
}
