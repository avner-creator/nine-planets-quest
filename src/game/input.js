// Keyboard + mouse + pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // keys pressed this frame (by e.code)
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: new Set(), clicked: new Set(), released: new Set() };
    this.locked = false;
    this.lockFailed = false;
    this.dragLook = false;
    this.enabled = true;
    this.onKey = null;           // (code, e) => bool (true = consumed)
    this.onLockChange = null;    // (locked) => void
    this._lastX = 0; this._lastY = 0;
    this._wantUnlock = false;

    // F5 is blocked so it never reloads the game (Alt + F5 shows the keys card); Alt is blocked so the browser
    // menu doesn't grab the keyboard after Alt is let go.
    const PREVENT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'Backquote', 'Slash', 'Quote', 'AltLeft', 'AltRight']);
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (PREVENT.has(e.code) || (e.ctrlKey && ['KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyP'].includes(e.code))) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.onKey && !e.repeat) this.onKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'F5') e.preventDefault(); this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons.clear(); });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.buttons.add(e.button);
      this.mouse.clicked.add(e.button);
      this._lastX = e.clientX; this._lastY = e.clientY;
      if (this.onCanvasDown) this.onCanvasDown(e);
    });
    window.addEventListener('mouseup', (e) => { this.mouse.buttons.delete(e.button); this.mouse.released.add(e.button); });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; }
      else if (this.dragLook && this.mouse.buttons.size && e.target === canvas) {
        this.mouse.dx += e.clientX - this._lastX; this.mouse.dy += e.clientY - this._lastY;
      }
      this._lastX = e.clientX; this._lastY = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.lockFailed = false;
      if (this.onLockChange) this.onLockChange(this.locked, this._wantUnlock);
      this._wantUnlock = false;
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; this.dragLook = true; });
  }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { this.lockFailed = true; this.dragLook = true; });
    } catch (e) { this.lockFailed = true; this.dragLook = true; }
  }
  // exitLock(true) = we are opening a menu on purpose, so the lock-loss should not open the pause menu
  exitLock(onPurpose = true) {
    if (!this.locked) return;
    this._wantUnlock = onPurpose;
    try { document.exitPointerLock(); } catch (e) { /* ignore */ }
  }
  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  takeMouse() { const d = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel }; this.mouse.dx = this.mouse.dy = this.mouse.wheel = 0; return d; }
  endFrame() { this.pressed.clear(); this.mouse.clicked.clear(); this.mouse.released.clear(); }
}
