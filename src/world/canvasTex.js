// Canvas-drawn textures: foliage cards with alpha, runes, name plaques, stripes.
import * as THREE from 'three';
import { RNG } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function toTex(c, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const shade = (l, h = 0, s = 0) => `hsl(${h},${s}%,${Math.round(l)}%)`;

function leafShape(g, len, wid) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid, len * 0.25, wid * 0.9, len * 0.75, 0, len);
  g.bezierCurveTo(-wid * 0.9, len * 0.75, -wid, len * 0.25, 0, 0);
  g.fill();
}

// Broadleaf cluster (oak, birch, bush ...). style: 'round' | 'small' | 'scale'
export function leafClusterTexture(seed = 1, style = 'round') {
  const S = 512; const [c, g] = canvas(S, S); const r = new RNG(seed);
  const n = style === 'small' ? 520 : style === 'scale' ? 900 : 300;
  for (let i = 0; i < n; i++) {
    // distribute in a blobby disc, more in the middle
    const a = r.next() * Math.PI * 2, d = Math.pow(r.next(), 0.6) * S * 0.42;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.92;
    const depth = d / (S * 0.42);
    const l = 58 + r.next() * 26 + (1 - depth) * -10 + (y < S / 2 ? 8 : -4);
    const hue = 75 + r.range(-20, 25), sat = 12 + r.range(0, 22);
    g.fillStyle = shade(l, hue, sat);
    g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2 + r.range(-1.1, 1.1));
    if (style === 'scale') { const s = r.range(6, 11); g.fillRect(-s / 2, -s, s, s * 2); }
    else {
      const len = style === 'small' ? r.range(16, 26) : r.range(26, 44);
      leafShape(g, len, len * r.range(0.28, 0.4));
      g.strokeStyle = shade(l - 12, hue, sat); g.lineWidth = 1; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, len * 0.85); g.stroke();
    }
    g.restore();
  }
  return toTex(c);
}

// Conifer spray (fan from the bottom centre): main twig + side twigs, dense needles.
export function needleTexture(seed = 2) {
  const W = 256, H = 512; const [c, g] = canvas(W, H); const r = new RNG(seed);
  g.lineCap = 'round';
  const twig = (x0, y0, x1, y1, nl, w) => {
    const steps = Math.round(Math.hypot(x1 - x0, y1 - y0) / 3.5); const ang = Math.atan2(x1 - x0, -(y1 - y0));
    for (let i = 0; i < steps; i++) {
      const f = i / steps; const px = x0 + (x1 - x0) * f, py = y0 + (y1 - y0) * f; const L = nl * (1 - f * 0.5) * r.range(0.8, 1.2);
      for (const side of [-1, 1]) {
        const a = ang + side * r.range(0.5, 0.95);
        g.strokeStyle = shade(r.range(46, 76), 110 + r.range(-15, 20), 14); g.lineWidth = r.range(2.2, 3.4);
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(a) * L, py - Math.cos(a) * L); g.stroke();
      }
    }
    g.strokeStyle = shade(32, 30, 30); g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  twig(W / 2, H, W / 2, 20, 30, 5);
  for (let k = 0; k < 9; k++) {
    const f = 0.1 + (k / 9) * 0.8, y = H - f * (H - 30), side = k % 2 ? 1 : -1;
    const spread = (W / 2 - 18) * Math.min(1, 0.35 + f);
    twig(W / 2, y, W / 2 + side * spread, y - r.range(60, 120), 22, 3);
  }
  return toTex(c);
}

// Palm frond: long leaf with dense leaflets, centred, base at bottom.
export function frondTexture(seed = 3) {
  const W = 256, H = 1024; const [c, g] = canvas(W, H); const r = new RNG(seed);
  const n = 85; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const f = i / n; const y = H * (1 - f * 0.97) - 8;
    const len = W * 0.5 * Math.sin(Math.min(1, f * 1.1 + 0.05) * Math.PI) * r.range(0.88, 1.02) + 10;
    for (const side of [-1, 1]) {
      const l = r.range(48, 74);
      g.strokeStyle = shade(l, 82 + r.range(-12, 12), 20); g.lineWidth = r.range(7, 11) * (1 - f * 0.4);
      const ang = side * (1.15 - f * 0.35);
      g.beginPath(); g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + Math.sin(ang) * len * 0.55, y - Math.cos(ang) * len * 0.55 + 6, W / 2 + Math.sin(ang) * len, y - Math.cos(ang) * len * 0.8 + 14);
      g.stroke();
    }
  }
  g.strokeStyle = shade(60, 50, 25); g.lineWidth = 7; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 14); g.stroke();
  return toTex(c);
}

// Hanging moss / willow strands.
export function strandTexture(seed = 4) {
  const W = 256, H = 512; const [c, g] = canvas(W, H); const r = new RNG(seed);
  for (let i = 0; i < 90; i++) {
    const x = r.range(10, W - 10); let y = 0; const len = r.range(0.4, 1) * H;
    g.strokeStyle = shade(r.range(55, 85), 90, 12); g.lineWidth = r.range(1.5, 3.5);
    g.beginPath(); g.moveTo(x, 0);
    let px = x;
    for (y = 0; y < len; y += 16) { px += r.range(-3, 3); g.lineTo(px, y); }
    g.stroke();
  }
  return toTex(c);
}

// Small grass/flower-free dry leaves for shrubs
export function twigLeafTexture(seed = 5) { return leafClusterTexture(seed, 'small'); }

// Rune strip for portal frames (white glyphs on black; used as emissive mask).
export function runeTexture(seed = 6) {
  const W = 1024, H = 64; const [c, g] = canvas(W, H); const r = new RNG(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round';
  const cell = 48;
  for (let x = 12; x < W - cell; x += cell + 8) {
    g.beginPath();
    const strokes = r.int(2, 4);
    for (let s = 0; s < strokes; s++) {
      const ax = x + r.range(0, cell), ay = 10 + r.range(0, 44), bx = x + r.range(0, cell), by = 10 + r.range(0, 44);
      g.moveTo(ax, ay); g.lineTo(bx, by);
    }
    if (r.chance(0.5)) { g.moveTo(x + cell / 2 + 10, 32); g.arc(x + cell / 2, 32, 10, 0, Math.PI * 2); }
    g.stroke();
  }
  return toTex(c, false, true);
}

// Stone plaque with engraved golden name.
export function plaqueTexture(name, accent = '#ffd27a') {
  const W = 512, H = 128; const [c, g] = canvas(W, H); const r = new RNG(name.length * 97 + 13);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#6e6a63'); grd.addColorStop(1, '#4e4a44');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r.next() < 0.5 ? '0,0,0' : '255,255,255'},${r.range(0.03, 0.09)})`; g.fillRect(r.range(0, W), r.range(0, H), r.range(1, 4), r.range(1, 4)); }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
  g.strokeStyle = accent; g.lineWidth = 2; g.strokeRect(14, 14, W - 28, H - 28);
  g.font = 'bold 64px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(name.toUpperCase(), W / 2 + 2, H / 2 + 4);
  g.fillStyle = accent; g.fillText(name.toUpperCase(), W / 2, H / 2 + 1);
  return toTex(c);
}

// Two-colour stripes for market canopies.
export function stripeTexture(a, b, n = 8) {
  const W = 256, H = 64; const [c, g] = canvas(W, H);
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * W) / n, 0, W / n + 1, H); }
  // subtle fabric noise
  const r = new RNG(n * 31 + a.length);
  for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(0,0,0,${r.range(0.02, 0.06)})`; g.fillRect(r.range(0, W), r.range(0, H), 2, 1); }
  return toTex(c, true, true);
}

// Soft round glow sprite (white, alpha falloff).
export function glowTexture() {
  const S = 128; const [c, g] = canvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return toTex(c, false);
}

// Several plaques stacked vertically in one texture (row i = names[i]).
export function plaqueAtlas(names, accents) {
  const W = 512, H = 128; const [c, g] = canvas(W, H * names.length);
  names.forEach((n, i) => {
    const t = plaqueTexture(n, accents[i]);
    g.drawImage(t.image, 0, i * H);
    t.dispose();
  });
  const tex = toTex(c);
  tex.flipY = false;
  return tex;
}

// Glowing padlock with keyhole (white, alpha) for locked portals.
export function lockTexture() {
  const S = 256; const [c, g] = canvas(S, S);
  g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 18;
  g.strokeStyle = '#fff'; g.lineWidth = 22; g.lineCap = 'round';
  g.beginPath(); g.arc(S / 2, 104, 44, Math.PI, 0); g.lineTo(S / 2 + 44, 122); g.moveTo(S / 2 - 44, 104); g.lineTo(S / 2 - 44, 122); g.stroke();
  g.fillStyle = '#fff';
  const x = S / 2 - 70, y = 116, w = 140, h = 104, r = 18;
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.fill();
  g.shadowBlur = 0; g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(S / 2, 156, 15, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(S / 2 - 8, 160); g.lineTo(S / 2 + 8, 160); g.lineTo(S / 2 + 13, 198); g.lineTo(S / 2 - 13, 198); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  const t = toTex(c, false); return t;
}
