// In-game HUD. Shared parts (goal line, coins/potions/keys, boss bar, toasts, banners, help) plus one VIEW per
// player (health/mana/xp, move bar, prompt, minimap, goal marker, damage numbers, enemy health bars).
import * as THREE from 'three';
import { POWERS, POWER_ATTACKS, BLOCKS, xpForLevel, POTIONS, DIMENSIONS, CONTROLS } from '../data.js';
import { powerIcon, blockIcon, potionIcon, coinIcon, lockIcon, img } from './icons.js';
import { clamp, fmt } from './util.js';
import { keyName } from './controls.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const KEY_SVG = (c) => `<svg class="key-ico" viewBox="0 0 32 32"><circle cx="10" cy="11" r="6.5" fill="none" stroke="${c}" stroke-width="3.5"/><path d="M15 15 L27 27 M22 22 L25 19 M25 25 L28 22" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/></svg>`;

// ---------------------------------------------------------------- one player's part of the HUD
class View {
  constructor(hud, player) {
    this.hud = hud; this.game = hud.game; this.player = player;
    const root = el('div', `view view-p${player.index + 1}`);
    root.innerHTML = `
      <div class="hud-flash"></div><div class="hud-vignette"></div><div class="hud-dark"></div>
      <div class="hud-layer dmg-layer"></div><div class="hud-layer bar-layer"></div>
      <div class="obj-marker hidden"><div class="obj-diamond"></div><div class="obj-dist"></div></div>
      <div class="crosshair hidden"><i></i></div>
      <div class="v-stats">
        <div class="v-who"></div>
        <div class="bar hp"><div class="fill"></div><div class="ghost"></div><span></span></div>
        <div class="xp-row"><b class="hlevel"></b><div class="bar xp"><div class="fill"></div></div></div>
        <div class="bar mp"><div class="fill"></div><span></span></div>
        <div class="v-status"></div>
      </div>
      <div class="minimap-wrap"><canvas class="minimap" width="200" height="200"></canvas><div class="mm-n">N</div></div>
      <div class="v-bottom">
        <div class="v-toasts"></div>
        <div class="prompt hidden"></div>
        <div class="move-head"><img class="el-ico" alt=""><b class="el-name"></b><span class="move-name"></span><span class="move-keys"></span></div>
        <div class="hotbar"></div>
      </div>`;
    hud.root.appendChild(root);
    this.root = root;
    const q = (s) => root.querySelector(s);
    this.$ = {
      flash: q('.hud-flash'), vig: q('.hud-vignette'), dark: q('.hud-dark'), dmg: q('.dmg-layer'), bars: q('.bar-layer'),
      marker: q('.obj-marker'), markerDist: q('.obj-dist'), crosshair: q('.crosshair'), who: q('.v-who'), status: q('.v-status'),
      hp: q('.bar.hp .fill'), hpGhost: q('.bar.hp .ghost'), hpText: q('.bar.hp span'), mp: q('.bar.mp .fill'), mpText: q('.bar.mp span'), xp: q('.bar.xp .fill'), level: q('.hlevel'),
      minimap: q('.minimap'), north: q('.mm-n'), toasts: q('.v-toasts'), prompt: q('.prompt'),
      head: q('.move-head'), elIco: q('.el-ico'), elName: q('.el-name'), moveName: q('.move-name'), moveKeys: q('.move-keys'), hotbar: q('.hotbar'),
    };
    this.mm = this.$.minimap.getContext('2d');
    this.slots = [];
    for (let i = 0; i < 9; i++) {
      const s = el('div', 'slot', `<img class="slot-ico" alt=""><div class="cd"></div><img class="lock" src="${lockIcon()}" alt=""><b class="key"></b><span class="cost"></span><i class="own-star"></i><em class="tmpl"></em>`);
      s.addEventListener('mousedown', (e) => { e.stopPropagation(); this.game.selectMove(this.player, i); });
      this.$.hotbar.appendChild(s);
      this.slots.push({ el: s, ico: s.querySelector('.slot-ico'), cd: s.querySelector('.cd'), cost: s.querySelector('.cost'), key: s.querySelector('.key'), tmpl: s.querySelector('.tmpl'), k: -1 });
    }
    this.dmgPool = []; this.dmgActive = [];
    for (let i = 0; i < 30; i++) { const d = el('div', 'dmg'); d.style.display = 'none'; this.$.dmg.appendChild(d); this.dmgPool.push(d); }
    this.barPool = [];
    for (let i = 0; i < 22; i++) { const b = el('div', 'ebar', '<div class="ename"></div><div class="etrack"><div class="efill"></div></div>'); b.style.display = 'none'; this.$.bars.appendChild(b); this.barPool.push({ el: b, name: b.querySelector('.ename'), fill: b.querySelector('.efill') }); }
    this.last = {};
    this.hpGhost = 1; this.vig = 0; this.flashA = 0;
    this._v = new THREE.Vector3();
    this.frame = player.index;
  }
  set(key, val, fn) { if (this.last[key] !== val) { this.last[key] = val; fn(val); } }
  dispose() { this.root.remove(); }
  get rect() { return this.game.viewRect(this.player.index); }   // { x, y, w, h } in CSS px
  get camera() { return this.player.view ? this.player.view.camera : this.game.camera; }

  refreshBar() {
    const g = this.game, p = this.player, P = g.powers;
    const building = g.building && g.blocks.builder === p;
    const sel = p.sel;
    const ks = p.ctl ? p.ctl.keys : {};
    for (let i = 0; i < 9; i++) {
      const s = this.slots[i];
      s.key.textContent = ks.moves && ks.moves[i] ? keyName(ks.moves[i]) : '';
      if (building) {
        const page = Math.floor(g.blocks.selected / 9), bi = page * 9 + i, def = BLOCKS[bi];
        s.el.className = `slot${def ? '' : ' empty'}${bi === g.blocks.selected ? ' selected' : ''}`;
        s.ico.src = def ? blockIcon(def) : ''; s.ico.style.visibility = def ? 'visible' : 'hidden';
        s.cost.textContent = ''; s.tmpl.textContent = ''; s.el.title = def ? def.name : '';
        s.cd.style.background = 'none'; s.k = -1; delete s.ico.dataset.mi;
      } else {
        const mv = POWER_ATTACKS[sel.power][i];
        const ok = P.canUse(p, sel.power, i);
        s.el.className = `slot${i === sel.move ? ' selected' : ''}${ok ? '' : ' locked'}${mv.isSuper ? ' super' : ''}${P.isOwn(p, sel.power) && i < 3 ? ' own' : ''}`;
        s.ico.dataset.mi = `${sel.power}|${i}`; s.ico.src = moveIcon(sel.power, i); s.ico.style.visibility = 'visible';
        s.tmpl.textContent = ok ? '' : P.lockText(sel.power, i);
        s.cost.textContent = ok && g.mode.id !== 'creative' ? P.cost(p, sel.power, i) : '';
        s.el.title = `${mv.name}: ${mv.desc}`;
      }
    }
    const pw = POWERS[sel.power];
    this.$.head.style.setProperty('--pc', building ? '#ffd34a' : pw.color);
    if (building) {
      this.$.elIco.style.display = 'none';
      this.$.elName.textContent = 'Building';
      this.$.moveName.textContent = BLOCKS[g.blocks.selected].name;
      this.$.moveKeys.textContent = `${p.ctl.key('sword')} place  ${p.ctl.key('power')} remove  ${p.ctl.key('nextMove')} next`;
    } else {
      this.$.elIco.style.display = ''; this.$.elIco.src = powerIcon(pw);
      this.$.elName.innerHTML = `${pw.name}${P.isOwn(p, sel.power) ? ' <i class="own-star"></i>' : ''}`;
      const mv = POWER_ATTACKS[sel.power][sel.move];
      this.$.moveName.textContent = mv.name;
      const sup = P.canUse(p, sel.power, 8) && sel.move !== 8 ? `  -  hold ${p.ctl.key('power')}: ${POWER_ATTACKS[sel.power][8].name}` : '';
      this.$.moveKeys.textContent = `${p.ctl.key('power')} use  ${p.ctl.key('nextMove')} next move  ${p.ctl.key('nextPower')} next power${sup}`;
    }
  }
  pulse(i) { const s = this.slots[i]; if (!s) return; s.el.classList.remove('pulse'); void s.el.offsetWidth; s.el.classList.add('pulse'); }
  pulseSuper() { this.pulse(8); }

  toast(text, type = 'info', dur = 2.5) {
    const t = el('div', `toast small ${type}`, text);
    this.$.toasts.appendChild(t);
    while (this.$.toasts.children.length > 2) this.$.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, dur * 1000);
  }
  prompt(text) { this.set('prompt', text || '', (v) => { this.$.prompt.innerHTML = v; this.$.prompt.classList.toggle('hidden', !v); }); }

  drawMinimap() {
    const g = this.game, hud = this.hud, ctx = this.mm, W = 200, cx = 100, cy = 100;
    const p = this.player, yaw = p.cam.yaw;
    if (!hud.mapImg) return;
    const k = 90 / 110;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, 98, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#10141a'; ctx.fillRect(0, 0, W, W);
    const mpp = hud.mapMpp, x0 = -hud.mapR, z0 = -hud.mapR;
    const ex = x0 - p.pos.x, ez = z0 - p.pos.z;
    ctx.setTransform(-cs * mpp * k, -sn * mpp * k, sn * mpp * k, -cs * mpp * k, cx + k * (-cs * ex + sn * ez), cy + k * (-sn * ex - cs * ez));
    ctx.drawImage(hud.mapImg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const toS = (x, z) => { const dx = x - p.pos.x, dz = z - p.pos.z; return [cx + k * (-cs * dx + sn * dz), cy + k * (-sn * dx - cs * dz)]; };
    const clampR = (s, r = 90) => { const dx = s[0] - cx, dy = s[1] - cy, L = Math.hypot(dx, dy); if (L > r) { s[0] = cx + dx / L * r; s[1] = cy + dy / L * r; s.edge = true; } return s; };
    hud.landmarkMarkers().forEach((m) => { const s = clampR(toS(m.x, m.z), m.important ? 90 : 200); if (!s.edge || m.important) hud.drawMarker(ctx, s[0], s[1], m, 1); });
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      const s = toS(e.pos.x, e.pos.z);
      if (Math.hypot(s[0] - cx, s[1] - cy) > 94) continue;
      ctx.fillStyle = e.kind === 'night' ? '#c070ff' : e.kind === 'bandit' ? '#ff9a3a' : '#ff4a4a';
      ctx.beginPath(); ctx.arc(s[0], s[1], e.kind === 'night' || e.captain ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    }
    g.boss.list.forEach((b) => { if (b.alive) { const s = clampR(toS(b.pos.x, b.pos.z)); hud.drawMarker(ctx, s[0], s[1], { kind: 'boss' }, b.role === 'key' ? 1.1 : 0.85); } });
    g.allies.list.forEach((a) => { const s = toS(a.pos.x, a.pos.z); ctx.fillStyle = '#6bff9a'; ctx.beginPath(); ctx.arc(s[0], s[1], 2.5, 0, Math.PI * 2); ctx.fill(); });
    // the other player
    g.players.forEach((o) => { if (o === p) return; const s = clampR(toS(o.pos.x, o.pos.z)); ctx.fillStyle = o.index ? '#5ad1ff' : '#ffd34a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-(p.yaw - yaw));
    ctx.fillStyle = p.index ? '#5ad1ff' : '#ffffff'; ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 7); ctx.lineTo(0, 3); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 97, 0, Math.PI * 2); ctx.stroke();
    const north = toS(p.pos.x, p.pos.z + 1000); const L = Math.hypot(north[0] - cx, north[1] - cy) || 1;
    const sz = this.$.minimap.clientWidth / 200;
    this.$.north.style.transform = `translate(${(north[0] - cx) / L * 85 * sz}px, ${(north[1] - cy) / L * 85 * sz}px)`;
  }

  update(dt) {
    const g = this.game, p = this.player, s = g.state, P = g.powers;
    this.frame++;
    this.set('who', `${p.char.name}|${g.players.length}`, () => { this.$.who.innerHTML = g.players.length > 1 ? `<b>P${p.index + 1}</b> ${p.char.name}` : ''; this.$.who.classList.toggle('hidden', g.players.length < 2); });
    this.set('level', s.level, (v) => { this.$.level.textContent = `Lv ${v}`; });
    const hpK = clamp(p.hp / p.maxHp, 0, 1);
    this.hpGhost = Math.max(hpK, this.hpGhost - dt * 0.6);
    this.$.hp.style.width = `${hpK * 100}%`;
    this.$.hpGhost.style.width = `${this.hpGhost * 100}%`;
    this.set('hpText', `${Math.ceil(p.hp)} / ${p.maxHp}`, (v) => { this.$.hpText.textContent = g.mode.invincible ? 'Invincible' : p.dead ? 'Knocked out!' : v; });
    this.$.mp.style.width = `${clamp(p.mana / p.maxMana, 0, 1) * 100}%`;
    this.set('mpText', `${Math.floor(p.mana)} / ${p.maxMana}`, (v) => { this.$.mpText.textContent = g.mode.id === 'creative' ? 'Infinite' : v; });
    this.$.xp.style.width = `${clamp(s.xp / xpForLevel(s.level), 0, 1) * 100}%`;
    // little status chips: suit / shield / second chance
    const st = [];
    if (p.suit) st.push(`<span style="--c:${p.suit.color}">${p.suit.kind[0].toUpperCase() + p.suit.kind.slice(1)} Suit ${Math.ceil(p.suit.dur - p.suit.t)}s</span>`);
    if (p.shieldT > 0) st.push(`<span style="--c:#ffd34a">Shield ${Math.ceil(p.shieldT)}s</span>`);
    if (p.secondChanceT > 0) st.push(`<span style="--c:#7fffd4">2nd Chance</span>`);
    if (p.dead && g.players.length > 1) st.push(`<span style="--c:#ff6a6a">Back in ${Math.max(0, Math.ceil(5 - p.deadT))}s</span>`);
    this.set('status', st.join(''), (v) => { this.$.status.innerHTML = v; });
    this.root.classList.toggle('low-hp', hpK < 0.25 && !g.mode.invincible && !p.dead);

    // move bar cooldowns
    const building = g.building && g.blocks.builder === p;
    const key = `${p.sel.power}|${p.sel.move}|${p.charIndex}|${building}|${building ? g.blocks.selected : ''}|${s.moves[p.sel.power].join('')}`;
    if (this.barKey !== key) { this.barKey = key; this.refreshBar(); }
    if (!building) {
      for (let i = 0; i < 9; i++) {
        const sl = this.slots[i];
        let k = P.moveFrac(p, p.sel.power, i);
        if (i === 8 && p.pw.holding && p.pw.chargeOk) k = 0;
        const kk = k > 0 ? Math.ceil(k * 50) : 0;
        if (sl.k !== kk) { sl.k = kk; sl.cd.style.background = k > 0 ? `conic-gradient(rgba(0,0,0,0.68) ${k * 360}deg, rgba(0,0,0,0) 0deg)` : 'none'; }
      }
      const ch = P.chargeFrac(p);
      this.slots[8].el.style.setProperty('--charge', `${Math.round(ch * 100)}%`);
      this.slots[8].el.classList.toggle('charging', ch > 0);
      this.slots[8].el.classList.toggle('charged', !!p.pw.charged);
    }

    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.$.flash.style.opacity = this.flashA;
    this.vig = Math.max(0, this.vig - dt * 1.5);
    this.$.vig.style.opacity = this.vig;
    this.$.dark.style.opacity = clamp(p.fadeT / 1.5, 0, 1) * 0.6;
    this.$.crosshair.classList.toggle('hidden', !(p.index === 0 && g.input.locked));
    if (this.frame % 2 === 0) this.drawMinimap();
    this.updateMarker(g.objective(p));
    this.updateFloaters(dt);
  }

  project(pos) {
    const r = this.rect, v = this._v.copy(pos).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * r.w, y: (-v.y * 0.5 + 0.5) * r.h, nx: v.x, ny: v.y };
  }
  updateMarker(obj) {
    const g = this.game, m = this.$.marker, p = this.player;
    if (!obj || !obj.pos || g.paused) { m.classList.add('hidden'); return; }
    const r = this.rect;
    const dist = Math.hypot(obj.pos.x - p.pos.x, obj.pos.z - p.pos.z);
    if (dist < 4) { m.classList.add('hidden'); return; }
    m.classList.remove('hidden');
    const pos = this._v.set(obj.pos.x, obj.pos.y + 2.5, obj.pos.z);
    const cam = this.camera;
    const behind = pos.clone().applyMatrix4(cam.matrixWorldInverse).z > 0;
    pos.project(cam);
    let x = (pos.x * 0.5 + 0.5) * r.w, y = (-pos.y * 0.5 + 0.5) * r.h;
    if (behind) { x = r.w - x; y = r.h - 40; }
    const pad = 50;
    const off = behind || x < pad || x > r.w - pad || y < pad || y > r.h - pad;
    x = clamp(x, pad, r.w - pad); y = clamp(y, pad + 30, r.h - pad - 120);
    m.style.transform = `translate(${x}px, ${y}px)`;
    m.classList.toggle('edge', off);
    this.set('mdist', Math.round(dist), (v2) => { this.$.markerDist.textContent = `${v2} m`; });
  }
  damageNumber(pos, amount, type, label, color) {
    const d = this.dmgPool.pop() || (this.dmgActive.length ? this.dmgActive.shift().el : null);
    if (!d) return;
    const item = { el: d, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), t: 0, life: type === 'crit' ? 1.1 : 0.9 };
    d.className = `dmg ${type}`;
    const txt = amount === 0 && label ? '' : type === 'heal' ? `+${Math.round(amount)}` : `${Math.round(amount)}`;
    d.innerHTML = label ? `<small>${label}</small>${txt}` : txt;
    d.style.color = color && type !== 'crit' && type !== 'player' ? color : '';
    d.style.display = 'block';
    this.dmgActive.push(item);
  }
  updateFloaters(dt) {
    const g = this.game, p = this.player;
    for (let i = this.dmgActive.length - 1; i >= 0; i--) {
      const it = this.dmgActive[i];
      it.t += dt;
      if (it.t >= it.life) { it.el.style.display = 'none'; this.dmgActive.splice(i, 1); this.dmgPool.push(it.el); continue; }
      it.pos.y += dt * 1.4;
      const s = this.project(it.pos);
      if (!s) { it.el.style.opacity = 0; continue; }
      const k = it.t / it.life;
      it.el.style.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const sc = it.t < 0.12 ? 0.6 + it.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (it.t - 0.12));
      it.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${sc})`;
    }
    let n = 0;
    const show = (e, name, cls) => {
      if (n >= this.barPool.length) return;
      const s = this.project(this._v.set(e.pos.x, e.pos.y + e.hitHeight + 0.15, e.pos.z));
      if (!s || s.nx < -1.1 || s.nx > 1.1 || s.ny < -1.1 || s.ny > 1.1) return;
      const b = this.barPool[n++];
      b.el.style.display = 'block';
      b.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      b.fill.style.width = `${clamp(e.hp / e.maxHp, 0, 1) * 100}%`;
      if (b.cls !== cls) { b.cls = cls; b.el.className = cls; }
      if (b.nm !== name) { b.nm = name; b.name.textContent = name; }
    };
    for (const e of g.enemies.list) {
      if (!e.alive || !e.rig) continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      const recent = g.time - e.lastHitT < 6;
      if (d > 38 || (!recent && e.state !== 'chase' && e.state !== 'attack' && d > 12)) continue;
      show(e, (e.kind !== 'monster' && e.kind !== 'minion') || d < 14 ? e.name : '', `ebar ${e.kind}${e.frozenT > 0 ? ' frozen' : ''}${e.captain ? ' captain' : ''}`);
    }
    // sleeping guardians show their name so kids know who is who
    for (const b of g.boss.list) {
      if (!b.alive || b.state === 'fight') continue;
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      if (d < 45) show(b, `${b.name}${b.role === 'key' ? ' (has a key)' : ''}`, 'ebar boss');
    }
    for (let i = n; i < this.barPool.length; i++) { const b = this.barPool[i]; if (b.el.style.display !== 'none') b.el.style.display = 'none'; }
  }
  clearFloaters() {
    this.dmgActive.forEach((it) => { it.el.style.display = 'none'; this.dmgPool.push(it.el); });
    this.dmgActive.length = 0;
    this.barPool.forEach((b) => { b.el.style.display = 'none'; });
  }
}

// icons for moves: the element's icon with a small move badge drawn on top
const moveIconCache = new Map();
function moveIcon(el, m) {
  const key = `${el}|${m}`;
  if (moveIconCache.has(key)) return moveIconCache.get(key);
  const base = new Image();
  const url = powerIcon(POWERS[el]);
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  const mv = POWER_ATTACKS[el][m];
  const done = () => {
    g.clearRect(0, 0, 96, 96);
    g.drawImage(base, 0, 0, 96, 96);
    // kind badge: a little symbol so each move looks different
    g.save(); g.translate(72, 72);
    g.fillStyle = mv.isSuper ? '#ffd34a' : 'rgba(10,14,24,0.85)'; g.strokeStyle = mv.isSuper ? '#fff' : 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = g.fillStyle = mv.isSuper ? '#3a2400' : '#ffffff'; g.lineWidth = 3.5; g.lineCap = 'round';
    switch (mv.kind) {
      case 'projectile': g.beginPath(); g.moveTo(-10, 8); g.lineTo(8, -10); g.moveTo(8, -10); g.lineTo(0, -10); g.moveTo(8, -10); g.lineTo(8, -2); g.stroke(); break;
      case 'cone': g.beginPath(); g.moveTo(-10, 6); g.lineTo(10, -8); g.moveTo(-10, 6); g.lineTo(10, 10); g.stroke(); break;
      case 'line': g.beginPath(); g.moveTo(-11, 0); g.lineTo(11, 0); g.moveTo(5, -6); g.lineTo(11, 0); g.lineTo(5, 6); g.stroke(); break;
      case 'area': g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill(); break;
      case 'self': g.fillRect(-3, -10, 6, 20); g.fillRect(-10, -3, 20, 6); break;
      case 'suit': g.beginPath(); g.moveTo(0, -11); g.lineTo(10, -6); g.lineTo(8, 6); g.lineTo(0, 11); g.lineTo(-8, 6); g.lineTo(-10, -6); g.closePath(); g.stroke(); break;
      case 'dash': g.beginPath(); g.moveTo(-10, -6); g.lineTo(0, 0); g.lineTo(-10, 6); g.moveTo(0, -6); g.lineTo(10, 0); g.lineTo(0, 6); g.stroke(); break;
      case 'instant': g.beginPath(); g.moveTo(3, -11); g.lineTo(-5, 1); g.lineTo(3, 1); g.lineTo(-3, 11); g.stroke(); break;
      case 'storm': g.beginPath(); for (let a = 0; a < 5.5; a += 0.3) { const r = 2 + a * 1.6; a ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); break;
      case 'summon': g.beginPath(); g.arc(0, -4, 5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(0, 10, 9, Math.PI, 0); g.fill(); break;
      case 'wall': g.fillRect(-11, -8, 10, 7); g.fillRect(1, -8, 10, 7); g.fillRect(-6, 1, 12, 7); break;
      case 'super': g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 5 : 12, a = k / 10 * Math.PI * 2 - Math.PI / 2; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); break;
    }
    g.restore();
    const out = c.toDataURL();
    moveIconCache.set(key, out);
    document.querySelectorAll(`img[data-mi="${key}"]`).forEach((im) => { im.src = out; });
  };
  base.onload = done;
  base.src = url;
  if (base.complete) done();
  return moveIconCache.get(key) || url;
}

// ---------------------------------------------------------------- the whole HUD
export class HUD {
  constructor(game) {
    this.game = game;
    const root = el('div', 'hud hidden'); root.id = 'hud';
    document.getElementById('ui').appendChild(root);
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="boss-bar hidden"><div class="boss-name"></div><div class="bar boss"><div class="fill"></div><div class="ghost"></div></div><div class="boss-enrage hidden">ANGRY!</div></div>
        <div class="objective"><span class="obj-arrow"></span><span class="obj-text"></span></div>
        <div class="money-row">
          <div class="mode-badge"></div>
          <div class="coins">${img(coinIcon(), 'ico')}<span></span></div>
          <div class="pot hp">${img(potionIcon(POTIONS[0]), 'ico')}<span></span></div>
          <div class="pot mana">${img(potionIcon(POTIONS[2]), 'ico')}<span></span></div>
          <div class="keys"></div>
        </div>
      </div>
      <div class="split-line hidden"></div>
      <div class="toasts"></div>
      <div class="banner hidden"><div class="banner-title"></div><div class="banner-sub"></div></div>
      <div class="hint hidden"></div>
      <div class="help panel hidden"></div>
      <div class="fade-black hidden"><div class="zzz">Z z z</div></div>
      <div class="trial-count hidden"></div>`;
    const q = (s) => root.querySelector(s);
    this.$ = {
      boss: q('.boss-bar'), bossName: q('.boss-name'), bossFill: q('.bar.boss .fill'), bossGhost: q('.bar.boss .ghost'), bossEnrage: q('.boss-enrage'),
      objective: q('.objective'), objText: q('.obj-text'), objArrow: q('.obj-arrow'),
      coins: q('.coins span'), potHp: q('.pot.hp span'), potMp: q('.pot.mana span'), keys: q('.keys'), split: q('.split-line'),
      toasts: q('.toasts'), banner: q('.banner'), bannerTitle: q('.banner-title'), bannerSub: q('.banner-sub'),
      hint: q('.hint'), help: q('.help'), fade: q('.fade-black'), count: q('.trial-count'), modeBadge: q('.mode-badge'),
    };
    this.views = [];
    this.boss = null; this.bossGhost = 1;
    this.hintQueue = []; this.hintT = 0;
    this.last = {};
    this.mapImg = null;
  }
  show(on) { this.root.classList.toggle('hidden', !on); }
  set(key, val, fn) { if (this.last[key] !== val) { this.last[key] = val; fn(val); } }

  // build one view per player (called when a game starts or players change)
  setPlayers(players) {
    this.views.forEach((v) => v.dispose());
    this.views = players.map((p) => new View(this, p));
    this.root.classList.toggle('two', players.length > 1);
    this.$.split.classList.toggle('hidden', players.length < 2);
    // always show which mode this is (Creative = can't be hurt), so it's never confusing
    const m = this.game.mode;
    if (m) {
      this.$.modeBadge.className = 'mode-badge mode-' + m.id;
      this.$.modeBadge.textContent = m.invincible ? `${m.name} - can't get hurt` : m.name;
    }
    this.buildHelp();
  }
  viewOf(p) { return this.views.find((v) => v.player === p) || this.views[0]; }

  // ---------------------------------------------------------------- map image (drawn once per world)
  buildMap(world, biome) {
    const N = 256, R = world.radius + 12;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d');
    const im = g.createImageData(N, N);
    const grass = new THREE.Color(biome.ground.grass), rock = new THREE.Color(biome.ground.rock), sand = new THREE.Color(biome.ground.sand);
    const liq = new THREE.Color(biome.liquid.color);
    const L = world.liquid;
    const tmp = new THREE.Color();
    const mpp = (R * 2) / N;
    let hmin = Infinity, hmax = -Infinity;
    const H = new Float32Array(N * N);
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      const x = -R + (u + 0.5) * mpp, z = -R + (v + 0.5) * mpp;
      const h = world.heightAt(x, z); H[v * N + u] = h;
      if (Math.hypot(x, z) < world.radius) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
    }
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      const x = -R + (u + 0.5) * mpp, z = -R + (v + 0.5) * mpp;
      const h = H[v * N + u];
      const hx = H[v * N + Math.min(N - 1, u + 1)] - h, hz = H[Math.min(N - 1, v + 1) * N + u] - h;
      const shade = clamp(1 - (hx * 0.6 + hz * 0.4) * 0.35, 0.55, 1.35);
      const t = clamp((h - hmin) / Math.max(1, hmax - hmin), 0, 1);
      if (L && h < L.level) {
        tmp.copy(liq).multiplyScalar(L.type === 'lava' ? 1.3 : 0.9 + 0.2 * clamp((h - L.level + 6) / 6, 0, 1));
        if (L.type === 'ice') tmp.lerp(new THREE.Color('#d8f0ff'), 0.4);
      } else {
        tmp.copy(grass).lerp(rock, clamp((t - 0.55) / 0.45, 0, 1));
        if (L && h < L.level + 1) tmp.lerp(sand, 0.6);
        tmp.multiplyScalar(shade * (0.8 + t * 0.35));
      }
      if (Math.hypot(x, z) > world.radius) tmp.multiplyScalar(0.35);
      const i = (v * N + u) * 4;
      im.data[i] = clamp(tmp.r * 255, 0, 255); im.data[i + 1] = clamp(tmp.g * 255, 0, 255); im.data[i + 2] = clamp(tmp.b * 255, 0, 255); im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    this.mapImg = c; this.mapR = R; this.mapMpp = mpp; this.mapN = N;
    return c;
  }

  landmarkMarkers() {
    const g = this.game, L = g.world && g.world.landmarks, out = [];
    if (!L || !g.state) return out;
    if (L.portals) L.portals.forEach((p) => out.push({ x: p.pos.x, z: p.pos.z, kind: 'portal', color: POWERS[p.index].color, locked: g.portalState(p.index) === 'locked', important: false }));
    if (g.worldId !== 'home') g.temples().forEach((t) => {
      out.push({ x: t.pos.x, z: t.pos.z, kind: 'temple', color: POWERS[g.worldId].color, tier: t.tier, important: true });
      if (t.courtyard && g.mode.id !== 'creative' && g.state.trials[g.worldId][t.tier] < 3) out.push({ x: t.courtyard.pos.x, z: t.courtyard.pos.z, kind: 'trial', color: POWERS[g.worldId].color, important: true });
    });
    if (g.worldId !== 'home') g.temples().forEach((t) => out.push({ x: t.pos.x, z: t.pos.z, kind: 'temple', color: POWERS[g.worldId].color, tier: t.tier, important: true }));
    if (L.shop) out.push({ x: L.shop.pos.x, z: L.shop.pos.z, kind: 'shop', important: true });
    if (L.bed) out.push({ x: L.bed.pos.x, z: L.bed.pos.z, kind: 'bed', important: true });
    if (L.bossArena && !g.state.bosses[g.worldId]) out.push({ x: L.bossArena.pos.x, z: L.bossArena.pos.z, kind: 'arena', important: true });
    g.fx.pickups.forEach((pk) => { if (pk.type === 'key') out.push({ x: pk.pos.x, z: pk.pos.z, kind: 'key', color: pk.color, important: true }); });
    return out;
  }
  drawMarker(ctx, x, y, m, s = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    switch (m.kind) {
      case 'portal':
        ctx.fillStyle = m.locked ? '#666' : m.color; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(0, 0, 2, 3.5, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'temple': {
        const k = 0.8 + (m.tier || 0) * 0.2;
        ctx.scale(k, k);
        ctx.fillStyle = m.color; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, -2); ctx.lineTo(-8, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillRect(-6, -2, 12, 8); ctx.strokeRect(-6, -2, 12, 8);
        break;
      }
      case 'shop':
        ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a6000'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 0.5);
        break;
      case 'bed':
        ctx.fillStyle = '#7ab0ff'; ctx.fillRect(-7, -3, 14, 7); ctx.strokeRect(-7, -3, 14, 7); ctx.fillStyle = '#fff'; ctx.fillRect(-6, -2, 4, 4);
        break;
      case 'trial':   // a courtyard with trials to win: ring + star
        ctx.strokeStyle = m.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd34a'; ctx.beginPath();
        for (let k = 0; k < 10; k++) { const r = k % 2 ? 2.4 : 5.5, a = k / 10 * Math.PI * 2 - Math.PI / 2; k ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke();
        break;
      case 'key':
        ctx.strokeStyle = '#ffd34a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-3, -3, 4, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(7, 7); ctx.stroke();
        break;
      case 'arena': case 'boss':
        ctx.fillStyle = m.kind === 'boss' ? '#ff3030' : '#c83a3a'; ctx.beginPath(); ctx.arc(0, -1, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-2.5, -2, 1.8, 0, Math.PI * 2); ctx.arc(2.5, -2, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(-3, 3, 6, 2);
        break;
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- notifications
  toast(text, type = 'info', dur = 3) {
    const t = el('div', `toast ${type}`, text);
    this.$.toasts.appendChild(t);
    while (this.$.toasts.children.length > 4) this.$.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, dur * 1000);
    if (type === 'good' || type === 'warn') this.game.audio.play('toast', { volume: 0.4 });
  }
  // a message for one player (in their own half when two are playing)
  toastFor(p, text, type = 'info', dur = 2.5) {
    if (!text) return;
    if (this.views.length < 2 || !p) return this.toast(text, type, dur);
    this.viewOf(p).toast(text, type, dur);
  }
  banner(title, sub = '', color = '#ffd34a', dur = 3) {
    const b = this.$.banner;
    this.$.bannerTitle.textContent = title; this.$.bannerTitle.style.color = color;
    this.$.bannerSub.textContent = sub;
    b.classList.remove('hidden', 'show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.add('hidden'), dur * 1000);
  }
  prompt(p, text) { this.viewOf(p).prompt(text); }
  screenFlash(a, b, c) {
    // screenFlash(player, color, strength) or screenFlash(color, strength) for everyone
    if (typeof a === 'string') { this.views.forEach((v) => { v.$.flash.style.background = a; v.flashA = Math.max(v.flashA, b ?? 0.4); }); return; }
    const v = this.viewOf(a); v.$.flash.style.background = b; v.flashA = Math.max(v.flashA, c ?? 0.4);
  }
  damageFlash(p, a) { const v = this.viewOf(p); v.vig = Math.min(1, v.vig + 0.35 + a); }
  fadeBlack(on, zzz = false) { this.$.fade.classList.toggle('hidden', !on); this.$.fade.querySelector('.zzz').style.display = zzz ? 'block' : 'none'; }
  // big 3-2-1 countdown for temple trials (null hides it)
  countdown(text) {
    const c = this.$.count;
    if (!c) return;
    if (!text) { c.classList.add('hidden'); return; }
    c.textContent = text; c.classList.remove('hidden', 'pop'); void c.offsetWidth; c.classList.add('pop');
  }
  hint(text, dur = 6) { this.hintQueue.push({ text, dur }); }
  damageNumber(pos, amount, type = 'hit', label = null, color = null) { this.views.forEach((v) => v.damageNumber(pos, amount, type, label, color)); }
  refreshHotbar() { this.views.forEach((v) => { v.barKey = null; }); }
  pulseSlot(p, m) { this.viewOf(p).pulse(m); }
  pulseSuper(p) { this.viewOf(p).pulseSuper(); }
  setBoss(e) {
    if (e === this.boss) return;
    this.boss = e;
    this.$.boss.classList.toggle('hidden', !e);
    if (e) { this.$.bossName.innerHTML = `${e.name} <small>${e.title}</small>`; this.bossGhost = e.hp / e.maxHp; }
  }

  buildHelp() {
    const g = this.game;
    const card = (ks, label) => {
      const k = (a) => (ks[a] || []).map(keyName).join(' / ');
      return `<div class="help-col"><div class="help-title">${label}</div><div class="keys">
        <div><b>${k('forward')} ${k('back')}</b> walk</div>
        <div><b>${k('left')} ${k('right')}</b> turn</div>
        <div><b>${k('jump')}</b> jump</div>
        <div><b>${k('sword')}</b> sword</div>
        <div><b>${k('power')}</b> power (HOLD for a SUPER)</div>
        <div><b>${k('nextMove')}</b> next move</div>
        <div><b>${k('nextPower')}</b> next power</div>
        <div><b>${k('use')}</b> use / talk / sleep / key</div>
        <div><b>${k('hero')}</b> pick a hero</div>
        <div class="creative-only"><b>Hold ${k('jump')}</b> fly up, <b>${k('down')}</b> down</div>
        <div class="creative-only"><b>${k('build')}</b> build blocks</div>
      </div></div>`;
    };
    const two = g.players && g.players.length > 1;
    const p1 = g.players && g.players[0] && g.players[0].ctl ? g.players[0].ctl.keys : CONTROLS.p1;
    this.$.help.innerHTML = `<div class="help-cols">${card(p1, two ? 'Player 1' : 'Keys')}${two ? card(g.players[1].ctl.keys, 'Player 2') : ''}</div>
      <div class="help-foot"><b>M</b> map &nbsp; <b>Esc</b> pause &nbsp; <b>Alt + F5</b> hide this card${two ? '' : ' &nbsp; <span class="dim">Mouse optional: click the game</span>'}</div>`;
    this.$.help.classList.toggle('creative', g.mode && g.mode.id === 'creative');
  }
  toggleHelp(force) {
    const on = force !== undefined ? force : this.$.help.classList.contains('hidden');
    this.$.help.classList.toggle('hidden', !on);
    this.$.help.classList.toggle('creative', this.game.mode && this.game.mode.id === 'creative');
    return on;
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    const g = this.game, s = g.state;
    if (!s || !g.player) return;
    this.set('coins', s.coins, (v) => { this.$.coins.textContent = fmt(v); });
    this.set('potHp', s.potions.hp + s.potions.hp_big, (v) => { this.$.potHp.textContent = v; });
    this.set('potMp', s.potions.mana, (v) => { this.$.potMp.textContent = v; });
    this.set('keys', s.keys.join(''), () => {
      this.$.keys.innerHTML = s.keys.map((has, i) => (has ? `<span class="key-chip" title="Key to ${DIMENSIONS[i].name}">${KEY_SVG(POWERS[i].color)}<small>${DIMENSIONS[i].name}</small></span>` : '')).join('');
    });
    // goal: one line + an arrow (for player 1's view direction)
    const p = g.player;
    const obj = g.objective(p);
    this.set('obj', obj ? obj.text : '', (v) => { this.$.objText.innerHTML = v; this.$.objective.classList.toggle('hidden', !v); });
    if (obj && obj.pos && g.players.length === 1) {
      const a = Math.atan2(obj.pos.x - p.pos.x, obj.pos.z - p.pos.z) - p.cam.yaw;
      this.$.objArrow.style.display = '';
      this.$.objArrow.style.transform = `rotate(${-a}rad)`;
    } else this.$.objArrow.style.display = 'none';
    if (this.boss) {
      const k = clamp(this.boss.hp / this.boss.maxHp, 0, 1);
      this.bossGhost = Math.max(k, this.bossGhost - dt * 0.35);
      this.$.bossFill.style.width = `${k * 100}%`;
      this.$.bossGhost.style.width = `${this.bossGhost * 100}%`;
      this.$.bossEnrage.classList.toggle('hidden', !this.boss.enraged);
    }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.$.hint.classList.add('hidden'); }
    else if (this.hintQueue.length && !g.paused) {
      const h = this.hintQueue.shift();
      this.$.hint.innerHTML = h.text; this.$.hint.classList.remove('hidden'); this.hintT = h.dur;
    }
    this.views.forEach((v) => v.update(dt));
  }
  clearFloaters() { this.views.forEach((v) => v.clearFloaters()); }
}
