// Icons drawn on canvas (no emoji, no image files). Each returns a cached data URL.
const cache = new Map();
function make(key, size, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; } else { r *= 1 + f; gg *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${gg | 0},${b | 0})`;
}

export function powerIcon(p) {
  return make('pw' + p.id, 96, (g, s) => {
    const c = s / 2;
    const grd = g.createRadialGradient(c, c * 0.8, 4, c, c, c);
    grd.addColorStop(0, shade(p.color, 0.25)); grd.addColorStop(0.7, shade(p.color, -0.35)); grd.addColorStop(1, shade(p.color, -0.7));
    g.fillStyle = grd; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
    g.save(); g.translate(c, c);
    switch (p.id) {
      case 'life':
        g.lineWidth = 6; g.beginPath(); g.moveTo(0, 28); g.quadraticCurveTo(-4, 4, 2, -10); g.stroke();
        g.beginPath(); g.ellipse(-13, -6, 15, 8, -0.6, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(14, -16, 15, 8, 0.7, 0, Math.PI * 2); g.fill();
        break;
      case 'healing':
        g.beginPath(); g.moveTo(0, 26);
        g.bezierCurveTo(-34, 2, -22, -28, 0, -12); g.bezierCurveTo(22, -28, 34, 2, 0, 26); g.fill();
        g.fillStyle = shade(p.color, -0.45); g.fillRect(-4, -12, 8, 24); g.fillRect(-12, -4, 24, 8);
        break;
      case 'fire':
        g.beginPath(); g.moveTo(0, -30);
        g.bezierCurveTo(10, -14, 24, -6, 20, 10); g.bezierCurveTo(17, 26, 4, 30, 0, 30);
        g.bezierCurveTo(-4, 30, -19, 26, -20, 10); g.bezierCurveTo(-21, -2, -10, -6, -8, -16);
        g.bezierCurveTo(-4, -8, -2, -6, 0, -30); g.fill();
        g.fillStyle = shade(p.color, 0.1); g.beginPath(); g.moveTo(0, -4); g.bezierCurveTo(10, 8, 10, 24, 0, 26); g.bezierCurveTo(-10, 24, -10, 10, 0, -4); g.fill();
        break;
      case 'ice':
        g.lineWidth = 5;
        for (let k = 0; k < 6; k++) {
          g.save(); g.rotate(k * Math.PI / 3);
          g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -30); g.moveTo(0, -18); g.lineTo(-9, -26); g.moveTo(0, -18); g.lineTo(9, -26); g.stroke();
          g.restore();
        }
        break;
      case 'earth':
        g.beginPath(); g.moveTo(-32, 24); g.lineTo(-18, -14); g.lineTo(-8, 4); g.lineTo(2, -28); g.lineTo(16, 2); g.lineTo(22, -10); g.lineTo(32, 24); g.closePath(); g.fill();
        g.fillStyle = shade(p.color, -0.4); g.beginPath(); g.moveTo(2, -28); g.lineTo(16, 2); g.lineTo(6, 24); g.lineTo(-2, 24); g.closePath(); g.fill();
        break;
      case 'lightning':
        g.beginPath(); g.moveTo(8, -32); g.lineTo(-16, 4); g.lineTo(-2, 4); g.lineTo(-10, 32); g.lineTo(18, -6); g.lineTo(3, -6); g.lineTo(14, -32); g.closePath(); g.fill();
        break;
      case 'light':
        g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
        g.lineWidth = 5;
        for (let k = 0; k < 8; k++) { g.save(); g.rotate(k * Math.PI / 4); g.beginPath(); g.moveTo(0, -19); g.lineTo(0, -31); g.stroke(); g.restore(); }
        break;
      case 'darkness':
        g.lineWidth = 5;
        for (let k = 0; k < 3; k++) {
          g.save(); g.rotate(k * Math.PI * 2 / 3); g.beginPath();
          for (let a = 0; a < 3.2; a += 0.1) { const r = 4 + a * 8; const x = Math.cos(a) * r, y = Math.sin(a) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke(); g.restore();
        }
        g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
        break;
      case 'death':
        g.lineWidth = 6; g.beginPath(); g.moveTo(-14, 30); g.lineTo(10, -24); g.stroke();
        g.beginPath(); g.moveTo(8, -26); g.quadraticCurveTo(-18, -38, -32, -10); g.quadraticCurveTo(-16, -24, 10, -18); g.closePath(); g.fill();
        break;
    }
    g.restore();
  });
}

export function swordIcon(def) {
  return make('sw' + def.id, 64, (g) => {
    g.translate(32, 32); g.rotate(-Math.PI / 4);
    g.fillStyle = def.blade; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-5, 6); g.lineTo(-5, -20); g.lineTo(0, -28); g.lineTo(5, -20); g.lineTo(5, 6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-1, -22, 2, 26);
    g.fillStyle = '#c9a54a'; g.fillRect(-12, 6, 24, 5); g.strokeRect(-12, 6, 24, 5);
    g.fillStyle = '#5a3a22'; g.fillRect(-3, 11, 6, 14); g.fillStyle = '#c9a54a'; g.beginPath(); g.arc(0, 27, 4, 0, Math.PI * 2); g.fill();
  });
}

export function armorIcon(def) {
  return make('ar' + def.id, 64, (g) => {
    const col = def.color || '#b8a888';
    g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(14, 10); g.lineTo(24, 6); g.quadraticCurveTo(32, 14, 40, 6); g.lineTo(50, 10); g.lineTo(56, 24); g.lineTo(46, 28);
    g.lineTo(46, 56); g.lineTo(18, 56); g.lineTo(18, 28); g.lineTo(8, 24); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(22, 22, 6, 28);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(32, 16); g.lineTo(32, 54); g.stroke();
  });
}

export function potionIcon(def) {
  return make('po' + def.id, 64, (g) => {
    g.fillStyle = 'rgba(220,240,255,0.35)'; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(26, 8); g.lineTo(38, 8); g.lineTo(38, 22); g.quadraticCurveTo(54, 30, 52, 44); g.quadraticCurveTo(50, 58, 32, 58);
    g.quadraticCurveTo(14, 58, 12, 44); g.quadraticCurveTo(10, 30, 26, 22); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = def.color; g.beginPath(); g.moveTo(14, 38); g.quadraticCurveTo(32, 32, 50, 38); g.quadraticCurveTo(50, 56, 32, 56); g.quadraticCurveTo(14, 56, 14, 38); g.fill();
    g.fillStyle = '#8a5a3a'; g.fillRect(25, 3, 14, 7);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(22, 40, 3, 7, 0.3, 0, Math.PI * 2); g.fill();
    if (def.id === 'hp_big') { g.fillStyle = '#fff'; g.fillRect(29, 40, 6, 14); g.fillRect(25, 44, 14, 6); }
  });
}

export function coinIcon() {
  return make('coin', 48, (g) => {
    const grd = g.createRadialGradient(20, 18, 2, 24, 24, 22);
    grd.addColorStop(0, '#fff3b0'); grd.addColorStop(0.5, '#ffcc33'); grd.addColorStop(1, '#b8860b');
    g.fillStyle = grd; g.beginPath(); g.arc(24, 24, 20, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a6000'; g.lineWidth = 2.5; g.stroke();
    g.beginPath(); g.arc(24, 24, 13, 0, Math.PI * 2); g.strokeStyle = 'rgba(138,96,0,0.6)'; g.stroke();
    g.fillStyle = '#8a6000'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('9', 24, 25);
  });
}

export function lootIcon() {
  return make('loot', 64, (g) => {
    g.fillStyle = '#a8763e'; g.strokeStyle = '#5a3a1a'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(22, 18); g.quadraticCurveTo(6, 34, 12, 50); g.quadraticCurveTo(32, 62, 52, 50); g.quadraticCurveTo(58, 34, 42, 18); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c99a5a'; g.beginPath(); g.ellipse(32, 16, 12, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ffe07a'; g.beginPath(); g.arc(32, 38, 6, 0, Math.PI * 2); g.fill();
  });
}

export function lockIcon() {
  return make('lock', 48, (g) => {
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 5; g.beginPath(); g.arc(24, 20, 9, Math.PI, 0); g.stroke();
    g.fillStyle = '#e8e8e8'; g.fillRect(11, 20, 26, 20);
    g.fillStyle = '#333'; g.beginPath(); g.arc(24, 28, 3.5, 0, Math.PI * 2); g.fill(); g.fillRect(22.5, 28, 3, 7);
  });
}

export function portraitIcon(ch) {
  return make('pt' + ch.id, 128, (g, s) => {
    const L = ch.look;
    const bg = g.createLinearGradient(0, 0, 0, s); bg.addColorStop(0, shade(L.accent, 0.3)); bg.addColorStop(1, shade(L.outfit, -0.2));
    g.fillStyle = bg; g.fillRect(0, 0, s, s);
    // shoulders
    g.fillStyle = L.outfit; g.beginPath(); g.ellipse(64, 132, 50, 36, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = L.accent; g.fillRect(56, 96, 16, 32);
    if (L.cape) { g.fillStyle = shade(L.accent, -0.2); g.fillRect(14, 112, 12, 16); g.fillRect(102, 112, 12, 16); }
    // neck + head
    g.fillStyle = shade(L.skin, -0.12); g.fillRect(55, 80, 18, 18);
    g.fillStyle = L.skin; g.beginPath(); g.ellipse(64, 60, 25, 29, 0, 0, Math.PI * 2); g.fill();
    // hair
    g.fillStyle = L.hair;
    const hs = L.hairStyle;
    if (hs === 'helmet') {
      g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(64, 54, 29, Math.PI, 0); g.lineTo(93, 62); g.lineTo(35, 62); g.fill();
      g.fillStyle = '#6d757e'; g.fillRect(61, 26, 6, 40);
    } else if (hs === 'hood') {
      g.fillStyle = L.outfit; g.beginPath(); g.arc(64, 58, 33, Math.PI * 0.95, Math.PI * 0.05); g.lineTo(98, 100); g.lineTo(30, 100); g.fill();
      g.fillStyle = L.skin; g.beginPath(); g.ellipse(64, 62, 20, 22, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = L.accent; g.fillRect(44, 68, 40, 12);
    } else if (hs !== 'bald') {
      g.beginPath(); g.arc(64, 52, 27, Math.PI * 1.02, Math.PI * 1.98); g.quadraticCurveTo(80, 40, 64, 40); g.quadraticCurveTo(44, 40, 38, 52); g.fill();
      g.beginPath(); g.ellipse(64, 38, 26, 12, 0, 0, Math.PI * 2); g.fill();
      if (hs === 'long' || hs === 'braid') { g.fillRect(36, 44, 9, hs === 'long' ? 50 : 30); g.fillRect(83, 44, 9, hs === 'long' ? 50 : 30); }
      if (hs === 'braid') { for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(88, 80 + k * 9, 5, 0, Math.PI * 2); g.fill(); } }
      if (hs === 'ponytail') { g.beginPath(); g.ellipse(92, 50, 8, 22, -0.4, 0, Math.PI * 2); g.fill(); }
      if (hs === 'bun') { g.beginPath(); g.arc(64, 22, 11, 0, Math.PI * 2); g.fill(); }
      if (hs === 'spiky') { for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(64 + k * 10 - 7, 36); g.lineTo(64 + k * 12, 16); g.lineTo(64 + k * 10 + 7, 36); g.fill(); } }
    }
    // face
    g.fillStyle = '#222'; g.beginPath(); g.arc(55, 62, 3, 0, Math.PI * 2); g.arc(73, 62, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = shade(L.skin, -0.4); g.lineWidth = 2.5; g.beginPath(); g.arc(64, 70, 8, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  });
}

export function blockIcon(def) {
  return make('bl' + def.id, 64, (g) => {
    const top = def.top || def.color;
    const f = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    g.globalAlpha = def.transparent ? 0.75 : 1;
    f([[32, 6], [58, 18], [32, 30], [6, 18]], shade(top, 0.15));
    f([[6, 18], [32, 30], [32, 60], [6, 48]], shade(def.color, -0.1));
    f([[58, 18], [32, 30], [32, 60], [58, 48]], shade(def.color, -0.35));
    if (def.emissive) { g.globalAlpha = 0.6; g.fillStyle = def.emissive; g.beginPath(); g.arc(32, 32, 10, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(32, 30); g.lineTo(32, 60); g.moveTo(6, 18); g.lineTo(32, 30); g.lineTo(58, 18); g.stroke();
  });
}

// small helper: <img> HTML string
export const img = (src, cls = '') => `<img class="${cls}" src="${src}" alt="" draggable="false">`;
