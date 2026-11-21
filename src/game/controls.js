// One small "controls" object per player: maps actions to keys from data.js CONTROLS
// (and, for player 1 playing alone, the arrow keys and the optional mouse).
import { CONTROLS } from '../data.js';

const ACTIONS = ['forward', 'back', 'left', 'right', 'jump', 'down', 'sword', 'power', 'nextMove', 'nextPower', 'use', 'hero', 'build', 'view', 'moves'];

export function keysetFor(playerIndex, players) {
  const base = playerIndex === 0 ? CONTROLS.p1 : CONTROLS.p2;
  const ks = {};
  for (const a of ACTIONS) ks[a] = [...(base[a] || [])];
  if (playerIndex === 0 && players === 1 && CONTROLS.p1SoloExtra) {
    for (const [a, keys] of Object.entries(CONTROLS.p1SoloExtra)) ks[a] = [...(ks[a] || []), ...keys];
  }
  ks.label = base.label || (playerIndex === 0 ? 'Player 1' : 'Player 2');
  return ks;
}

// readable key names for help cards / prompts
export function keyName(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', Slash: '/', Semicolon: ';', Enter: 'Enter' };
  return map[code] || code;
}

export class Controls {
  constructor(input, keyset, { mouse = false } = {}) {
    this.input = input;
    this.keys = keyset;
    this.useMouse = mouse;
  }
  down(action) { const ks = this.keys[action]; return !!ks && ks.some((k) => this.input.down(k)); }
  hit(action) { const ks = this.keys[action]; return !!ks && ks.some((k) => this.input.hit(k)); }
  owns(code) { return ACTIONS.some((a) => (this.keys[a] || []).includes(code)); }
  is(action, code) { return (this.keys[action] || []).includes(code); }
  slotHit() { const s = this.keys.moves || []; for (let i = 0; i < s.length; i++) if (this.input.hit(s[i])) return i; return -1; }
  key(action) { return keyName((this.keys[action] || [])[0]); }
  // turning: +1 = left, -1 = right
  turn() { return (this.down('left') ? 1 : 0) - (this.down('right') ? 1 : 0); }
  move() { return (this.down('forward') ? 1 : 0) - (this.down('back') ? 1 : 0); }
  // optional mouse (player 1): clicking the game always swings / casts, even when the browser
  // does not hand over the mouse pointer (turning with the mouse still needs the pointer, playing alone)
  get mouseReady() { return this.useMouse; }
  mouseClick(button) { return this.mouseReady && this.input.mouse.clicked.has(button); }
  mouseHeld(button) { return this.mouseReady && this.input.mouse.buttons.has(button); }
}
