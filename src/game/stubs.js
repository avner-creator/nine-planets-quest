// Stand-ins for the World and Models modules (see CONTRACTS.md).
// The game uses these automatically when src/world/world.js or src/models/*.js are missing or broken.
import * as THREE from 'three';
import { DIMENSIONS, HOME, POWERS } from '../data.js';

// ------------------------------------------------------------------ noise
function makeNoise(seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = rnd();
  const v = (ix, iz) => P[((ix & 255) << 8) | (iz & 255)];
  const n = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    let fx = x - ix, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = v(ix, iz), b = v(ix + 1, iz), c = v(ix, iz + 1), d = v(ix + 1, iz + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
  };
  return (x, z, oct = 4) => {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { sum += n(x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ world
export async function buildWorld(id, { renderer, scene, quality }) {
  const isHome = id === 'home';
  const dim = isHome ? HOME : DIMENSIONS[id];
  const biome = dim.biome;
  const seed = isHome ? 999 : 100 + id * 37;
  const noise = makeNoise(seed);
  const radius = 250;
  const SIZE = 640, N = quality === 'high' ? 160 : 110, CELL = SIZE / N;
  const group = new THREE.Group(); group.name = 'stubWorld';
  scene.add(group);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const liquidLevel = -1.5;

  // landmarks layout
  const L = { spawn: V(0, 0, 0), spawnYaw: Math.PI };
  const pads = [];
  if (isHome) {
    L.spawn.set(0, 0, 14); L.spawnYaw = Math.PI;
    L.bed = { pos: V(38, 0, 26), radius: 2.2 };
    L.shop = { pos: V(-32, 0, 22), merchant: V(-32, 0, 19.5), merchantYaw: 0, radius: 6 };
    L.portals = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i - 4) * 0.33;
      const px = Math.sin(a) * 26, pz = -18 + Math.cos(a) * 26;
      L.portals.push({ index: i, pos: V(px, 0, pz), yaw: Math.atan2(0 - px, -18 - pz), radius: 1.8 });
    }
    L.villagers = [V(-10, 0, 30), V(12, 0, 34), V(-24, 0, 6), V(26, 0, 8), V(4, 0, 40)];
    pads.push({ x: 0, z: -18, r: 34 }, { x: 0, z: 14, r: 14 }, { x: 38, z: 26, r: 12 }, { x: -32, z: 22, r: 10 });
  } else {
    L.spawn.set(0, 0, 0); L.spawnYaw = 0;
    L.homePortal = { pos: V(0, 0, -7), yaw: 0, radius: 1.8 };
    L.shop = { pos: V(24, 0, 12), merchant: V(24, 0, 9.5), merchantYaw: Math.PI * 1.25, radius: 6 };
    L.bed = { pos: V(30, 0, 18), radius: 2 };
    const ta = 2.2 + id * 0.7;
    const tp = V(Math.cos(ta) * 95, 0, Math.sin(ta) * 95);
    const tyaw = Math.atan2(-tp.x, -tp.z);
    L.temple = { pos: tp, door: V(tp.x + Math.sin(tyaw) * 6, 0, tp.z + Math.cos(tyaw) * 6), altar: V(tp.x - Math.sin(tyaw) * 2, 0, tp.z - Math.cos(tyaw) * 2), radius: 9, yaw: tyaw };
    const ba = ta + Math.PI * 0.9;
    L.bossArena = { pos: V(Math.cos(ba) * 150, 0, Math.sin(ba) * 150), radius: 24 };
    pads.push({ x: 0, z: 0, r: 14 }, { x: 24, z: 14, r: 12 }, { x: tp.x, z: tp.z, r: 16 }, { x: L.bossArena.pos.x, z: L.bossArena.pos.z, r: 30 });
  }
  const camps = [];
  if (!isHome) {
    for (let k = 0; k < 3; k++) {
      const a = 0.6 + k * 2.1 + id * 0.3;
      const p = V(Math.cos(a) * 175, 0, Math.sin(a) * 175);
      camps.push({ pos: p, radius: 10 });
      pads.push({ x: p.x, z: p.z, r: 14 });
    }
  }
  const lakeX = isHome ? 60 : -60, lakeZ = isHome ? -70 : 50;

  const baseH = (x, z) => {
    let h = (noise(x * 0.006 + 10, z * 0.006 + 10, 4) - 0.45) * 26 + (noise(x * 0.03, z * 0.03, 2) - 0.5) * 3;
    const dl = Math.hypot(x - lakeX, z - lakeZ);
    h -= 9 * (1 - sstep(18, 48, dl));
    const r = Math.hypot(x, z);
    if (r > radius - 20) h += (r - (radius - 20)) * 0.7 + noise(x * 0.05, z * 0.05, 2) * 10 * sstep(radius - 20, radius + 20, r);
    return h;
  };
  pads.forEach((p) => { p.h = Math.max(baseH(p.x, p.z), liquidLevel + 1.4); });
  const fullH = (x, z) => {
    let h = baseH(x, z);
    for (const p of pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      const w = 1 - sstep(p.r, p.r + 14, d);
      if (w > 0) h = h + (p.h - h) * w;
    }
    return h;
  };
  const W = N + 1, H = new Float32Array(W * W);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) H[j * W + i] = fullH(-SIZE / 2 + i * CELL, -SIZE / 2 + j * CELL);
  const heightAt = (x, z) => {
    let fx = (x + SIZE / 2) / CELL, fz = (z + SIZE / 2) / CELL;
    fx = Math.min(N - 1e-4, Math.max(0, fx)); fz = Math.min(N - 1e-4, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
    // match the triangle split of PlaneGeometry (diagonal from (i,j+1) to (i+1,j))
    if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
    return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  };
  const normalAt = (x, z) => V(heightAt(x - 0.5, z) - heightAt(x + 0.5, z), 1, heightAt(x, z - 0.5) - heightAt(x, z + 0.5)).normalize();
  const setY = (v) => { v.y = heightAt(v.x, v.z); return v; };
  setY(L.spawn);
  if (L.bed) setY(L.bed.pos);
  if (L.shop) { setY(L.shop.pos); setY(L.shop.merchant); }
  if (L.portals) L.portals.forEach((p) => setY(p.pos));
  if (L.homePortal) setY(L.homePortal.pos);
  if (L.temple) { setY(L.temple.pos); setY(L.temple.door); setY(L.temple.altar); }
  if (L.bossArena) setY(L.bossArena.pos);
  if (L.villagers) L.villagers.forEach(setY);
  camps.forEach((c) => setY(c.pos));

  // ground mesh
  const g = new THREE.PlaneGeometry(SIZE, SIZE, N, N); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const gc = biome.ground;
  const cG = new THREE.Color(gc.grass), cG2 = new THREE.Color(gc.grass2), cR = new THREE.Color(gc.rock), cS = new THREE.Color(gc.sand), cD = new THREE.Color(gc.dirt);
  const tmp = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    const i = Math.round((x + SIZE / 2) / CELL), j = Math.round((z + SIZE / 2) / CELL);
    const h = H[j * W + i]; pos.setY(k, h);
    const nrm = normalAt(x, z);
    tmp.copy(cG).lerp(cG2, noise(x * 0.04, z * 0.04, 2));
    if (noise(x * 0.02 + 50, z * 0.02, 2) > 0.68) tmp.lerp(cD, 0.6);
    if (h < liquidLevel + 1.2) tmp.lerp(cS, 0.85);
    tmp.lerp(cR, sstep(0.82, 0.62, nrm.y));
    const sh = 0.9 + noise(x * 0.2, z * 0.2, 1) * 0.2;
    cols[k * 3] = tmp.r * sh; cols[k * 3 + 1] = tmp.g * sh; cols[k * 3 + 2] = tmp.b * sh;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const ground = new THREE.Mesh(track(g), track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  ground.receiveShadow = true; group.add(ground);

  // liquid
  const lq = biome.liquid;
  const liquid = { type: lq.type, level: liquidLevel };
  const lqMat = track(new THREE.MeshStandardMaterial({
    color: lq.color, roughness: lq.type === 'ice' ? 0.15 : 0.08, metalness: 0.1,
    transparent: lq.type === 'water', opacity: lq.type === 'water' ? 0.82 : 1,
    emissive: lq.type === 'lava' ? new THREE.Color(lq.color) : new THREE.Color(0), emissiveIntensity: lq.type === 'lava' ? 1.2 : 0,
  }));
  const lqMesh = new THREE.Mesh(track(new THREE.CircleGeometry(330, 48).rotateX(-Math.PI / 2)), lqMat);
  lqMesh.position.y = liquidLevel; lqMesh.receiveShadow = true; group.add(lqMesh);

  // lights + sky
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a3a2a, 0.7); group.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  group.add(sun); group.add(sun.target);
  const skyZ = new THREE.Color(biome.sky.zenith), skyH = new THREE.Color(biome.sky.horizon), fogC = new THREE.Color(biome.fog.color);
  const nightC = new THREE.Color('#0b1226');
  scene.fog = new THREE.FogExp2(fogC.clone(), biome.fog.density);
  scene.background = skyH.clone();
  // sky dome with simple gradient
  const skyU = { top: { value: skyZ.clone() }, bot: { value: skyH.clone() } };
  const skyMat = track(new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float t = smoothstep(-0.05, 0.6, vP.y); gl_FragColor = vec4(mix(bot, top, t), 1.0); }',
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(900, 24, 12)), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false; group.add(sky);
  const stars = (() => {
    const n = 600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.3 + 0.1; p.set([Math.cos(a) * Math.cos(e) * 850, Math.sin(e) * 850, Math.sin(a) * Math.cos(e) * 850], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.Points(track(sg), track(new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })));
    m.frustumCulled = false; group.add(m); return m;
  })();

  // trees + rocks
  const colliders = { circles: [], segments: [] };
  const nearPad = (x, z, extra) => pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + extra);
  const rnd = (() => { let s = seed * 7 + 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const kinds = biome.trees.kinds;
  const treeCount = Math.round((quality === 'high' ? 320 : 200) * Math.max(0.3, biome.trees.density));
  const trunkGeo = track(new THREE.CylinderGeometry(0.25, 0.4, 1, 6).translate(0, 0.5, 0));
  const leafKind = kinds[0];
  const crownGeo = track(['pine', 'snowpine', 'charred', 'dead', 'crystal'].includes(leafKind)
    ? new THREE.ConeGeometry(1.8, 4.5, 7).translate(0, 2.25, 0) : new THREE.IcosahedronGeometry(2.2, 1));
  const trunkMat = track(new THREE.MeshStandardMaterial({ color: biome.trees.trunk, roughness: 0.9 }));
  const leafCol = biome.trees.leaf === '#000000' ? biome.trees.trunk : biome.trees.leaf;
  const leafMat = track(new THREE.MeshStandardMaterial({ color: leafCol, roughness: 0.85, emissive: leafKind === 'crystal' || leafKind === 'giantmushroom' ? new THREE.Color(leafCol) : 0x000000, emissiveIntensity: 0.35 }));
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, leafMat, treeCount);
  trunks.castShadow = crowns.castShadow = true; trunks.receiveShadow = crowns.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  let placed = 0;
  const noCrown = leafKind === 'dead' || leafKind === 'charred' || leafKind === 'cactus';
  for (let tries = 0; tries < treeCount * 6 && placed < treeCount; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (radius - 15);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < liquidLevel + 0.8 || nearPad(x, z, 6) || normalAt(x, z).y < 0.8) continue;
    const s = 0.8 + rnd() * 0.6, th = 3 + rnd() * 3;
    q.setFromAxisAngle(sv.set(0, 1, 0), rnd() * 6.28);
    m4.compose(pv.set(x, h - 0.2, z), q, sv.set(s, th, s)); trunks.setMatrixAt(placed, m4);
    m4.compose(pv.set(x, h + th * 0.75, z), q, noCrown ? sv.set(0.001, 0.001, 0.001) : sv.set(s, s, s)); crowns.setMatrixAt(placed, m4);
    colliders.circles.push({ x, z, r: 0.45 * s });
    placed++;
  }
  trunks.count = crowns.count = placed;
  group.add(trunks, crowns);
  const rockGeo = track(new THREE.DodecahedronGeometry(1, 0));
  const rockMat = track(new THREE.MeshStandardMaterial({ color: gc.rock, roughness: 0.95, flatShading: true }));
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 70); let rc = 0;
  for (let tries = 0; tries < 400 && rc < 70; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (radius - 10);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (nearPad(x, z, 4)) continue;
    const s = 0.6 + rnd() * 1.6;
    m4.compose(pv.set(x, heightAt(x, z) - s * 0.3, z), q.setFromAxisAngle(sv.set(0, 1, 0), rnd() * 6), sv.set(s * 1.2, s * 0.8, s));
    rocks.setMatrixAt(rc++, m4);
    colliders.circles.push({ x, z, r: s * 0.95 });
  }
  rocks.count = rc; rocks.castShadow = true; rocks.receiveShadow = true; group.add(rocks);

  // structure helpers
  const stoneMat = track(new THREE.MeshStandardMaterial({ color: '#9a958c', roughness: 0.9 }));
  const woodMat = track(new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.85 }));
  const roofMat = track(new THREE.MeshStandardMaterial({ color: '#8a3a2a', roughness: 0.8 }));
  const clothMat = track(new THREE.MeshStandardMaterial({ color: '#c9a76a', roughness: 0.9, side: THREE.DoubleSide }));
  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const addBox = (mat, x, y, z, sx, sy, sz, yaw = 0, parent = group) => {
    const m = new THREE.Mesh(boxGeo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = yaw;
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  // walled building centred at (cx,cz) with door on +local Z side, rotated by yaw
  const building = (cx, cz, w, d, hgt, yaw, mat, doorW = 2.4) => {
    const b = new THREE.Group(); b.position.set(cx, heightAt(cx, cz), cz); b.rotation.y = yaw; group.add(b);
    const t = 0.5;
    addBox(mat, 0, hgt / 2, -d / 2, w, hgt, t, 0, b);
    addBox(mat, -w / 2, hgt / 2, 0, t, hgt, d, 0, b);
    addBox(mat, w / 2, hgt / 2, 0, t, hgt, d, 0, b);
    const side = (w - doorW) / 2;
    addBox(mat, -w / 2 + side / 2, hgt / 2, d / 2, side, hgt, t, 0, b);
    addBox(mat, w / 2 - side / 2, hgt / 2, d / 2, side, hgt, t, 0, b);
    addBox(mat, 0, hgt - 0.5, d / 2, doorW, 1, t, 0, b);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const tw = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
    const seg = (a, c) => { const p = tw(...a), q2 = tw(...c); colliders.segments.push({ x1: p[0], z1: p[1], x2: q2[0], z2: q2[1], r: 0.35 }); };
    seg([-w / 2, -d / 2], [w / 2, -d / 2]); seg([-w / 2, -d / 2], [-w / 2, d / 2]); seg([w / 2, -d / 2], [w / 2, d / 2]);
    seg([-w / 2, d / 2], [-doorW / 2, d / 2]); seg([doorW / 2, d / 2], [w / 2, d / 2]);
    return b;
  };
  const stall = (p, yaw) => {
    const b = new THREE.Group(); b.position.copy(p); b.rotation.y = yaw; group.add(b);
    addBox(woodMat, 0, 0.55, 0, 3.6, 1.1, 1, 0, b);
    [[-1.7, -0.4], [1.7, -0.4], [-1.7, 1.4], [1.7, 1.4]].forEach(([x, z]) => addBox(woodMat, x, 1.4, z - 1.8, 0.18, 2.8, 0.18, 0, b));
    const roof = addBox(clothMat, 0, 2.85, -1.3, 4.2, 0.12, 2.6, 0, b); roof.rotation.x = 0.15;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    colliders.segments.push({ x1: p.x - 1.8 * cs, z1: p.z + 1.8 * sn, x2: p.x + 1.8 * cs, z2: p.z - 1.8 * sn, r: 0.55 });
    return b;
  };
  const bedMesh = (p, yaw) => {
    const b = new THREE.Group(); b.position.copy(p); b.rotation.y = yaw; group.add(b);
    addBox(woodMat, 0, 0.25, 0, 1.2, 0.5, 2.2, 0, b);
    addBox(track(new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.9 })), 0, 0.55, 0.2, 1.1, 0.15, 1.6, 0, b);
    addBox(track(new THREE.MeshStandardMaterial({ color: '#f2efe6', roughness: 0.9 })), 0, 0.6, -0.8, 0.9, 0.18, 0.45, 0, b);
  };

  // portals
  const portalObjs = [];
  const torusGeo = track(new THREE.TorusGeometry(2.1, 0.32, 10, 36));
  const discGeo = track(new THREE.CircleGeometry(1.95, 32));
  const makePortal = (p, yaw, colorHex) => {
    const g2 = new THREE.Group(); g2.position.copy(p); g2.rotation.y = yaw; group.add(g2);
    const ringMat = track(new THREE.MeshStandardMaterial({ color: '#6d6a66', roughness: 0.6, metalness: 0.3, emissive: new THREE.Color(colorHex), emissiveIntensity: 0.6 }));
    const ring = new THREE.Mesh(torusGeo, ringMat); ring.position.y = 2.5; ring.castShadow = true; g2.add(ring);
    const discMat = track(new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    const disc = new THREE.Mesh(discGeo, discMat); disc.position.y = 2.5; g2.add(disc);
    addBox(stoneMat, 0, 0.15, 0, 5, 0.3, 1.6, 0, g2);
    const obj = { g: g2, ring, ringMat, disc, discMat, color: new THREE.Color(colorHex), state: 'open' };
    portalObjs.push(obj); return obj;
  };
  const setPortalVisual = (o, state) => {
    o.state = state;
    if (state === 'locked') { o.disc.visible = false; o.ringMat.emissiveIntensity = 0.0; o.ringMat.color.set('#4a4744'); }
    else if (state === 'cleared') { o.disc.visible = true; o.ringMat.color.set('#d8b04a'); o.ringMat.emissive.set('#ffcc4d'); o.ringMat.emissiveIntensity = 0.6; }
    else { o.disc.visible = true; o.ringMat.color.set('#6d6a66'); o.ringMat.emissive.copy(o.color); o.ringMat.emissiveIntensity = 0.7; }
  };

  let templeSeal = null, altarMat = null;
  if (isHome) {
    const house = building(38, 26, 10, 8, 4, Math.PI, track(new THREE.MeshStandardMaterial({ color: '#b9ad97', roughness: 0.9 })));
    const roof = new THREE.Mesh(track(new THREE.ConeGeometry(7.6, 3.2, 4)), roofMat); roof.position.set(0, 5.6, 0); roof.rotation.y = Math.PI / 4; roof.castShadow = true; house.add(roof);
    bedMesh(L.bed.pos.clone().setY(heightAt(38, 26)).add(V(0, 0, 1.5)), 0);
    L.bed.pos.z += 1.5;
    stall(L.shop.pos, 0);
    L.portals.forEach((p) => makePortal(p.pos, p.yaw, POWERS[p.index].color));
    const plaza = new THREE.Mesh(track(new THREE.CircleGeometry(33, 48).rotateX(-Math.PI / 2)), stoneMat);
    plaza.position.set(0, pads[0].h + 0.04, -18); plaza.receiveShadow = true; group.add(plaza);
  } else {
    makePortal(L.homePortal.pos, 0, '#e8f0ff');
    stall(L.shop.pos, L.shop.merchantYaw);
    bedMesh(L.bed.pos, 0.4);
    const t = L.temple;
    const tb = building(t.pos.x, t.pos.z, 12, 12, 6, t.yaw, stoneMat, 3);
    [[-6.6, 6.6], [6.6, 6.6], [-6.6, -6.6], [6.6, -6.6]].forEach(([x, z]) => addBox(stoneMat, x, 3.5, z, 1.2, 7, 1.2, 0, tb));
    const roof = new THREE.Mesh(track(new THREE.ConeGeometry(10, 4, 4)), stoneMat); roof.position.y = 8; roof.rotation.y = Math.PI / 4; tb.add(roof);
    altarMat = track(new THREE.MeshStandardMaterial({ color: '#ddd', emissive: new THREE.Color(POWERS[id].color), emissiveIntensity: 1 }));
    addBox(stoneMat, 0, 0.6, -2, 1.6, 1.2, 1.2, 0, tb);
    const gem = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.5)), altarMat); gem.position.set(0, 1.8, -2); tb.add(gem);
    templeSeal = new THREE.Mesh(track(new THREE.PlaneGeometry(3, 4.8)), track(new THREE.MeshBasicMaterial({ color: POWERS[id].color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
    templeSeal.position.set(0, 2.4, 6.1); tb.add(templeSeal);
    const ar = new THREE.InstancedMesh(boxGeo, stoneMat, 16);
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = L.bossArena.pos.x + Math.cos(a) * 26, z = L.bossArena.pos.z + Math.sin(a) * 26;
      m4.compose(pv.set(x, heightAt(x, z) + 1.5, z), q.setFromAxisAngle(sv.set(0, 1, 0), -a), sv.set(1.4, 3 + (k % 3), 1.4)); ar.setMatrixAt(k, m4);
    }
    ar.castShadow = true; group.add(ar);
    const tentGeo = track(new THREE.ConeGeometry(2, 2.6, 4).translate(0, 1.3, 0));
    camps.forEach((c) => {
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1, x = c.pos.x + Math.cos(a) * 6, z = c.pos.z + Math.sin(a) * 6;
        const tent = new THREE.Mesh(tentGeo, clothMat); tent.position.set(x, heightAt(x, z), z); tent.castShadow = true; group.add(tent);
        colliders.circles.push({ x, z, r: 1.6 });
      }
      const fire = new THREE.Mesh(track(new THREE.ConeGeometry(0.5, 1.2, 6)), track(new THREE.MeshBasicMaterial({ color: '#ff8a2a' })));
      fire.position.copy(c.pos).add(V(0, 0.6, 0)); group.add(fire);
    });
  }

  // monster spawns
  const monsterSpawns = [];
  const avoid = [L.spawn, L.shop && L.shop.pos, L.homePortal && L.homePortal.pos].filter(Boolean);
  for (let tries = 0; tries < 2000 && monsterSpawns.length < 30 && !isHome; tries++) {
    const a = rnd() * Math.PI * 2, r = 50 + Math.sqrt(rnd()) * (radius - 70);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < liquidLevel + 0.6) continue;
    if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 45)) continue;
    if (monsterSpawns.some((p) => Math.hypot(p.x - x, p.z - z) < 18)) continue;
    monsterSpawns.push(V(x, h, z));
  }

  const alwaysNight = !!biome.alwaysNight;
  const sunDir = new THREE.Vector3();
  let curT = 0.3;
  const world = {
    id, name: dim.name, radius, heightAt, normalAt, liquid, colliders, landmarks: L, monsterSpawns,
    banditCamps: camps, sun,
    setTimeOfDay(t) {
      curT = t;
      const a = (t - 0.25) * Math.PI * 2;
      const el = Math.sin(a);
      let day = sstep(-0.12, 0.25, el);
      if (alwaysNight) day = 0.12;
      sunDir.set(Math.cos(a) * 0.8, Math.max(0.25, Math.abs(el)), 0.45).normalize();
      sun.userData.dir = sunDir;
      sun.intensity = 0.35 + 2.0 * day;
      sun.color.set(day > 0.3 ? biome.sky.sun : '#9fb4ff');
      hemi.intensity = 0.35 + 0.5 * day;
      const top = nightC.clone().lerp(skyZ, day), bot = nightC.clone().lerp(skyH, day);
      skyU.top.value.copy(top); skyU.bot.value.copy(bot);
      scene.background.copy(bot);
      scene.fog.color.copy(fogC).lerp(nightC, 1 - day).multiplyScalar(0.6 + 0.4 * day);
      stars.material.opacity = 1 - day;
      renderer.toneMappingExposure = 0.8 + 0.25 * day;
    },
    setPortalState(i, state) { if (isHome && portalObjs[i]) setPortalVisual(portalObjs[i], state); },
    setTempleState(state) {
      if (isHome || !templeSeal) return;
      templeSeal.visible = state === 'sealed';
      altarMat.emissiveIntensity = state === 'open' ? 2.2 : state === 'claimed' ? 0.15 : 0.5;
    },
    update(dt, time, playerPos) {
      const d = sun.userData.dir || sunDir.set(0.5, 1, 0.3).normalize();
      if (playerPos) { sun.target.position.copy(playerPos); sun.position.copy(playerPos).addScaledVector(d, 120); }
      portalObjs.forEach((o, k) => { o.disc.rotation.z = time * 0.8 + k; o.discMat.opacity = 0.6 + Math.sin(time * 3 + k) * 0.15; });
      if (liquid.type === 'lava') lqMat.emissiveIntensity = 1.0 + Math.sin(time * 1.5) * 0.25;
      if (templeSeal) templeSeal.material.opacity = 0.45 + Math.sin(time * 4) * 0.15;
    },
    dispose() {
      scene.remove(group);
      disposables.forEach((o) => o.dispose && o.dispose());
      trunks.dispose(); crowns.dispose(); rocks.dispose();
      sun.shadow.map && sun.shadow.map.dispose();
      scene.fog = null; scene.background = null;
    },
  };
  world.setTimeOfDay(curT);
  if (isHome) for (let i = 0; i < 9; i++) world.setPortalState(i, 'open');
  else world.setTempleState('sealed');
  return world;
}

// ------------------------------------------------------------------ rigs
const geoCache = {};
const G = (key, make) => geoCache[key] || (geoCache[key] = make());
const capsule = (r, l) => G('cap' + r + '_' + l, () => new THREE.CapsuleGeometry(r, l, 4, 10));
const sphere = (r) => G('sph' + r, () => new THREE.SphereGeometry(r, 14, 10));
const box = () => G('box', () => new THREE.BoxGeometry(1, 1, 1));
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const mesh = (geo, m, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o;
};

function flashable(root) {
  const mats = [];
  root.traverse((o) => { if (o.isMesh && o.material && o.material.emissive && !o.userData.glow) mats.push(o.material); });
  const base = mats.map((m) => m.emissive.clone());
  let flashT = 0, tint = null, frozen = false;
  const apply = () => mats.forEach((m, i) => {
    if (flashT > 0) m.emissive.set(0xff3030).multiplyScalar(flashT * 3);
    else if (frozen) m.emissive.set(0x3a8cff).multiplyScalar(0.6);
    else if (tint !== null) m.emissive.set(tint).multiplyScalar(0.5);
    else m.emissive.copy(base[i]);
  });
  return {
    flash() { flashT = 0.18; apply(); },
    setTint(h) { tint = h; apply(); },
    setFrozen(f) { frozen = f; apply(); },
    get frozen() { return frozen; },
    update(dt) { if (flashT > 0) { flashT = Math.max(0, flashT - dt); apply(); } },
    dispose() { mats.forEach((m) => m.dispose()); },
  };
}

function humanoid({ skin = '#e0b090', outfit = '#557', accent = '#aa8', hair = '#432', scale = 1, broad = false, eyes = null, hood = false }) {
  const root = new THREE.Object3D();
  const body = new THREE.Group(); body.scale.setScalar(scale); root.add(body);
  const mSkin = mat(skin), mOut = mat(outfit), mAcc = mat(accent), mHair = mat(hair);
  const w = broad ? 1.18 : 1;
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips);
  const torso = mesh(capsule(0.24 * w, 0.42), mOut, hips, 0, 0.38, 0);
  mesh(box(), mAcc, hips, 0, 0.08, 0, 0.5 * w, 0.1, 0.32);
  const head = new THREE.Group(); head.position.y = 0.86; hips.add(head);
  mesh(sphere(0.17), mSkin, head, 0, 0.1, 0);
  mesh(sphere(0.18), hood ? mOut : mHair, head, 0, 0.16, -0.03, 1, 0.75, 1);
  const eyeMat = eyes ? new THREE.MeshBasicMaterial({ color: eyes }) : mat('#222');
  [-0.06, 0.06].forEach((x) => { const e = mesh(sphere(0.025), eyeMat, head, x, 0.12, 0.155); e.userData.glow = !!eyes; });
  const limb = (x, y, parent, r, l, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); parent.add(p); mesh(capsule(r, l), m, p, 0, -l / 2 - r, 0); return p; };
  const armL = limb(-0.33 * w, 0.62, hips, 0.07 * w, 0.48, mOut);
  const armR = limb(0.33 * w, 0.62, hips, 0.07 * w, 0.48, mOut);
  const handR = new THREE.Object3D(); handR.position.set(0, -0.68, 0.04); armR.add(handR);
  mesh(sphere(0.08), mSkin, handR);
  mesh(sphere(0.08), mSkin, armL, 0, -0.68, 0.04);
  const legL = limb(-0.13, 0, hips, 0.09 * w, 0.62, mAcc);
  const legR = limb(0.13, 0, hips, 0.09 * w, 0.62, mAcc);
  return { root, body, hips, torso, head, armL, armR, handR, legL, legR, mOut, scale };
}

function makeSword(def) {
  const g = new THREE.Group();
  const blade = mat(def.blade, { metalness: def.metalness, roughness: def.roughness, emissive: def.emissive ? new THREE.Color(def.emissive) : 0x000000 });
  mesh(box(), blade, g, 0, 0, 0.55, 0.06, 0.02, 0.9);
  mesh(box(), mat('#5a4030'), g, 0, 0, -0.02, 0.05, 0.05, 0.22);
  mesh(box(), mat('#b8a060', { metalness: 0.8, roughness: 0.3 }), g, 0, 0, 0.1, 0.28, 0.05, 0.05);
  const tip = new THREE.Object3D(); tip.position.set(0, 0, 1.0); g.add(tip);
  return { g, tip };
}

function makeRig(h, { height = 1.8, radius = 0.45 } = {}) {
  let pose = 'idle', speed = 0, phase = 0, act = null, actT = 0, sword = null;
  let fl = null; let armorPlate = null;
  const rig = {
    root: h.root, height: height * h.scale, radius, handR: h.handR, swordTip: null,
    setSword(def) {
      if (sword) { h.handR.remove(sword.g); sword = null; }
      rig.swordTip = null;
      if (def) { sword = makeSword(def); sword.g.rotation.x = Math.PI / 2; h.handR.add(sword.g); rig.swordTip = sword.tip; }
      fl = null;
    },
    setArmor(def) {
      if (armorPlate) { h.hips.remove(armorPlate); armorPlate = null; }
      if (def && def.color) { armorPlate = mesh(capsule(0.27, 0.3), mat(def.color, { metalness: 0.8, roughness: 0.35 }), h.hips, 0, 0.45, 0); }
      fl = null;
    },
    setPose(p) { pose = p; },
    setMoveSpeed(s) { speed = s; },
    attack(combo = 0) { act = { type: 'attack', combo, dur: 0.45 }; actT = 0; return { duration: 0.45, hitTime: 0.2 }; },
    cast() { act = { type: 'cast', dur: 0.6 }; actT = 0; return { duration: 0.6, releaseTime: 0.3 }; },
    hurt() { (fl || (fl = flashable(h.root))).flash(); },
    update(dt) {
      if (fl) fl.update(dt);
      phase += dt * (2 + speed * 1.6);
      const sw = pose === 'walk' || pose === 'run' ? Math.sin(phase) * Math.min(1, 0.3 + speed * 0.12) : 0;
      h.legL.rotation.x = sw; h.legR.rotation.x = -sw;
      h.armL.rotation.x = -sw * 0.8; h.armR.rotation.x = sw * 0.8;
      h.armL.rotation.z = 0; h.armR.rotation.z = 0;
      h.body.rotation.x = 0; h.body.position.y = 0;
      h.root.children[0].rotation.z = 0;
      if (pose === 'idle') { h.hips.position.y = 0.95 + Math.sin(phase * 0.5) * 0.01; }
      if (pose === 'jump' || pose === 'fall') { h.legL.rotation.x = 0.5; h.legR.rotation.x = -0.2; h.armL.rotation.z = -0.6; h.armR.rotation.z = 0.6; }
      if (pose === 'fly' || pose === 'swim') { h.body.rotation.x = 1.1; h.body.position.y = 0.6; h.legL.rotation.x = Math.sin(phase) * 0.3; h.legR.rotation.x = -Math.sin(phase) * 0.3; h.armL.rotation.z = -1.2; h.armR.rotation.z = 1.2; }
      if (pose === 'sleep' || pose === 'dead') { h.body.rotation.x = -Math.PI / 2; h.body.position.y = 0.25; }
      if (pose === 'build') { h.armR.rotation.x = -1.2; }
      if (act) {
        actT += dt;
        const k = Math.min(1, actT / act.dur);
        if (act.type === 'attack') {
          const s = Math.sin(k * Math.PI);
          if (act.combo === 2) { h.armR.rotation.x = -2.6 + k * 3.4; }
          else { h.armR.rotation.x = -1.4; h.armR.rotation.z = (act.combo === 0 ? 1 : -1) * (1.2 - k * 2.4); }
          h.hips.rotation.y = (act.combo === 1 ? -1 : 1) * s * 0.4;
        } else { h.armR.rotation.x = -1.6 * Math.sin(k * Math.PI); h.armL.rotation.x = -1.6 * Math.sin(k * Math.PI); }
        if (k >= 1) { act = null; h.hips.rotation.y = 0; }
      }
    },
    dispose() { h.root.traverse((o) => { if (o.isMesh && o.material) o.material.dispose(); }); h.root.removeFromParent(); },
  };
  return rig;
}

export function createHero(def) {
  const l = def.look || {};
  const h = humanoid({ skin: l.skin, outfit: l.outfit, accent: l.accent, hair: l.hair, broad: l.build === 'broad', hood: l.hairStyle === 'hood' || l.hairStyle === 'helmet' });
  if (l.cape) { const c = mesh(box(), mat(l.accent, { side: THREE.DoubleSide }), h.hips, 0, 0.3, -0.25, 0.5, 0.9, 0.04); c.rotation.x = 0.12; }
  return makeRig(h);
}

export function createNPC(kind, { outfit = '#556', seed = 1 } = {}) {
  const r = (seed * 9301 + 49297) % 233280 / 233280;
  const opts = {
    merchant: { outfit: '#7a4a2a', accent: '#e8d8b0', hair: '#5a3a20' },
    villager: { outfit: ['#4a6a9a', '#9a5a4a', '#5a8a4a', '#8a7a4a'][Math.floor(r * 4)], accent: '#5a4a3a', hair: ['#2a1a10', '#a07040', '#d8c080'][Math.floor(r * 3)] },
    bandit: { outfit, accent: '#3a3028', hair: '#222', hood: true },
    bandit_captain: { outfit, accent: '#b02020', hair: '#222', hood: true, scale: 1.15, broad: true },
  }[kind] || { outfit };
  const h = humanoid({ skin: ['#e0b090', '#c08060', '#8a5a3a', '#f0c8a8'][Math.floor(r * 4)], ...opts });
  const rig = makeRig(h);
  if (kind === 'bandit') rig.setSword({ blade: '#9a9a9a', metalness: 0.8, roughness: 0.4 });
  if (kind === 'bandit_captain') rig.setSword({ blade: '#d0d4da', metalness: 1, roughness: 0.2 });
  if (kind === 'merchant') mesh(box(), mat('#e8d8b0'), h.hips, 0, 0.2, 0.2, 0.42, 0.6, 0.05);
  return rig;
}

function mobCommon(root, body, { height, radius, hitHeight }, animate) {
  let pose = 'idle', speed = 0, phase = 0, act = null, actT = 0, frozen = false, dead = 0;
  const fl = flashable(root);
  return {
    root, height, radius, hitHeight,
    setPose(p) { pose = p; }, setMoveSpeed(s) { speed = s; },
    attack() { act = { dur: 0.6 }; actT = 0; return { duration: 0.6, hitTime: 0.3 }; },
    hurt() { fl.flash(); }, setFrozen(f) { frozen = f; fl.setFrozen(f); }, setTint(h) { fl.setTint(h); },
    update(dt) {
      fl.update(dt);
      if (frozen) return;
      phase += dt * (2 + speed * 1.5);
      let a = 0;
      if (act) { actT += dt; a = Math.sin(Math.min(1, actT / act.dur) * Math.PI); if (actT >= act.dur) act = null; }
      if (pose === 'dead') { dead = Math.min(1, dead + dt * 3); body.rotation.z = dead * 1.4; body.position.y = -dead * 0.3; return; }
      animate(phase, pose === 'move' ? 1 : 0, a);
    },
    dispose() { fl.dispose(); root.removeFromParent(); },
  };
}

export function createEnemy(def) {
  const s = def.size || 1;
  const root = new THREE.Object3D(); const body = new THREE.Group(); body.scale.setScalar(s); root.add(body);
  const m = mat(def.color, { roughness: 0.6 });
  const eyeM = new THREE.MeshBasicMaterial({ color: def.eyes || '#ffe14a' });
  const eyes = (parent, y, z, sp = 0.12, r = 0.06) => [-sp, sp].forEach((x) => { const e = mesh(sphere(r), eyeM, parent, x, y, z); e.userData.glow = true; });
  let h = 1, anim;
  switch (def.shape) {
    case 'slime': {
      const b = mesh(sphere(0.55), mat(def.color, { roughness: 0.2, transparent: true, opacity: 0.85 }), body, 0, 0.5, 0, 1, 0.85, 1); eyes(body, 0.6, 0.45);
      h = 1; anim = (p, mv, a) => { const k = Math.abs(Math.sin(p * (mv ? 1.5 : 0.7))); b.scale.set(1 + k * 0.12 + a * 0.2, 0.85 - k * 0.15 + a * 0.2, 1 + k * 0.12); b.position.y = 0.5 + (mv ? k * 0.3 : 0); };
      break;
    }
    case 'quadruped': case 'insect': {
      const ins = def.shape === 'insect';
      const tor = mesh(ins ? sphere(0.5) : capsule(0.3, 0.8), m, body, 0, ins ? 0.5 : 0.75, 0, ins ? 1.1 : 1, ins ? 0.55 : 1, ins ? 1.3 : 1);
      if (!ins) tor.rotation.x = Math.PI / 2;
      const head = new THREE.Group(); head.position.set(0, ins ? 0.5 : 0.95, ins ? 0.6 : 0.65); body.add(head);
      mesh(sphere(ins ? 0.28 : 0.26), m, head, 0, 0, 0.1, 1, 0.9, 1.2); eyes(head, 0.08, 0.36, 0.1, 0.05);
      const legs = [];
      const n = ins ? 6 : 4;
      for (let k = 0; k < n; k++) {
        const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
        const p = new THREE.Group(); p.position.set(side * (ins ? 0.45 : 0.22), ins ? 0.45 : 0.6, (ins ? 0.4 - row * 0.4 : 0.35 - row * 0.7)); body.add(p);
        const lg = mesh(capsule(0.06, ins ? 0.45 : 0.5), m, p, side * (ins ? 0.15 : 0), -0.3, 0); if (ins) lg.rotation.z = side * 0.7;
        legs.push(p);
      }
      h = ins ? 0.9 : 1.2;
      anim = (p, mv, a) => { legs.forEach((lg, k) => { lg.rotation.x = mv * Math.sin(p * 1.6 + k * 1.7) * 0.6; }); head.rotation.x = -a * 0.6; head.position.z = (ins ? 0.6 : 0.65) + a * 0.25; };
      break;
    }
    case 'golem': {
      const tor = mesh(box(), mat(def.color, { roughness: 0.95, flatShading: true }), body, 0, 1.3, 0, 1.1, 1.1, 0.7);
      mesh(box(), m, body, 0, 2.05, 0.05, 0.5, 0.45, 0.45); eyes(body, 2.1, 0.28, 0.1, 0.05);
      const aL = new THREE.Group(); aL.position.set(-0.75, 1.75, 0); body.add(aL); mesh(box(), m, aL, 0, -0.6, 0, 0.38, 1.2, 0.38);
      const aR = new THREE.Group(); aR.position.set(0.75, 1.75, 0); body.add(aR); mesh(box(), m, aR, 0, -0.6, 0, 0.38, 1.2, 0.38);
      const lL = new THREE.Group(); lL.position.set(-0.3, 0.75, 0); body.add(lL); mesh(box(), m, lL, 0, -0.38, 0, 0.4, 0.76, 0.4);
      const lR = new THREE.Group(); lR.position.set(0.3, 0.75, 0); body.add(lR); mesh(box(), m, lR, 0, -0.38, 0, 0.4, 0.76, 0.4);
      h = 2.3;
      anim = (p, mv, a) => { const sw = mv * Math.sin(p) * 0.5; lL.rotation.x = sw; lR.rotation.x = -sw; aL.rotation.x = -sw * 0.6 - a * 2.2; aR.rotation.x = sw * 0.6 - a * 2.2; tor.rotation.x = a * 0.2; };
      break;
    }
    case 'flyer': {
      const b = new THREE.Group(); body.add(b);
      mesh(sphere(0.35), m, b, 0, 0, 0, 1, 0.9, 1.1); eyes(b, 0.08, 0.3, 0.1, 0.05);
      const wm = mat(def.color, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      const wL = new THREE.Group(); b.add(wL); mesh(box(), wm, wL, -0.5, 0, 0, 0.8, 0.03, 0.45);
      const wR = new THREE.Group(); b.add(wR); mesh(box(), wm, wR, 0.5, 0, 0, 0.8, 0.03, 0.45);
      h = 1.6;
      anim = (p, mv, a) => { b.position.y = 1.3 + Math.sin(p * 0.8) * 0.15 - a * 0.3; b.position.z = a * 0.5; const f = Math.sin(p * 4) * 0.7; wL.rotation.z = f; wR.rotation.z = -f; };
      break;
    }
    case 'serpent': {
      const segs = [];
      for (let k = 0; k < 7; k++) segs.push(mesh(sphere(0.32 - k * 0.025), m, body, 0, 0.32, -k * 0.42));
      eyes(segs[0], 0.12, 0.25, 0.1, 0.05);
      h = 0.8;
      anim = (p, mv, a) => { segs.forEach((sg, k) => { sg.position.x = Math.sin(p * 1.4 - k * 0.8) * 0.25 * (mv + 0.3); }); segs[0].position.y = 0.32 + a * 0.5; segs[0].position.z = a * 0.4; };
      break;
    }
    default: { // humanoid
      const hu = humanoid({ skin: def.color, outfit: def.color, accent: def.color, hair: def.color, eyes: def.eyes || '#ffe14a' });
      body.add(hu.root);
      h = 1.85;
      anim = (p, mv, a) => { const sw = mv * Math.sin(p) * 0.7; hu.legL.rotation.x = sw; hu.legR.rotation.x = -sw; hu.armL.rotation.x = -sw - a * 1.5; hu.armR.rotation.x = sw - a * 2.2; };
    }
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return mobCommon(root, body, { height: h * s, radius: 0.5 * s * (def.shape === 'golem' ? 1.3 : 1), hitHeight: (h + 0.4) * s }, anim);
}

const BOSS_MOVES = {
  treant: ['slam', 'sweep', 'summon', 'roar', 'stomp'],
  serpent: ['volley', 'beam', 'sweep', 'roar', 'charge'],
  golem: ['slam', 'stomp', 'volley', 'roar', 'charge'],
  giant: ['slam', 'sweep', 'stomp', 'roar', 'volley'],
  colossus: ['slam', 'stomp', 'beam', 'roar', 'summon'],
  drake: ['charge', 'beam', 'volley', 'sweep', 'roar'],
  sphinx: ['beam', 'sweep', 'slam', 'roar', 'summon'],
  king: ['charge', 'sweep', 'volley', 'summon', 'roar', 'beam'],
  reaper: ['sweep', 'charge', 'beam', 'summon', 'roar', 'volley'],
};
export function createBoss(def) {
  const s = (def.size || 5) / 2.2;
  const hu = humanoid({ skin: def.color, outfit: def.color, accent: def.accent, hair: def.accent, broad: true, eyes: def.accent, scale: s });
  const root = hu.root;
  const glowM = new THREE.MeshStandardMaterial({ color: def.accent, emissive: new THREE.Color(def.accent), emissiveIntensity: 1.2 });
  const crown = mesh(G('crown', () => new THREE.ConeGeometry(0.2, 0.35, 5)), glowM, hu.head, 0, 0.35, 0); crown.userData.glow = true;
  [-1, 1].forEach((sd) => { const sp = mesh(G('spike', () => new THREE.ConeGeometry(0.1, 0.4, 5)), glowM, hu.hips, sd * 0.3, 0.75, -0.05); sp.rotation.z = -sd * 0.6; sp.userData.glow = true; });
  const mouth = new THREE.Object3D(); mouth.position.set(0, 0.06, 0.2); hu.head.add(mouth);
  const fl = flashable(root);
  let pose = 'idle', speed = 0, phase = 0, act = null, actT = 0, frozen = false, dead = 0;
  return {
    root, height: 1.9 * s, radius: 0.55 * s, hitHeight: 2.2 * s, mouth,
    moves: BOSS_MOVES[def.shape] || ['slam', 'sweep', 'roar'],
    setPose(p) { pose = p; }, setMoveSpeed(v) { speed = v; },
    play(move) { const dur = move === 'roar' ? 1.6 : move === 'beam' ? 2.0 : 1.4; act = { move, dur }; actT = 0; return { duration: dur, hitTime: dur * 0.55 }; },
    hurt() { fl.flash(); }, setFrozen(f) { frozen = f; fl.setFrozen(f); },
    setEnraged(e) { glowM.emissive.set(e ? '#ff3a1a' : def.accent); glowM.emissiveIntensity = e ? 2.5 : 1.2; },
    update(dt) {
      fl.update(dt);
      if (frozen) return;
      phase += dt * (1.5 + speed * 0.8);
      if (pose === 'dead') { dead = Math.min(1, dead + dt * 1.5); hu.body.rotation.x = -dead * 1.5; return; }
      const sw = pose === 'move' ? Math.sin(phase) * 0.6 : 0;
      hu.legL.rotation.x = sw; hu.legR.rotation.x = -sw; hu.armL.rotation.x = -sw * 0.6; hu.armR.rotation.x = sw * 0.6; hu.armL.rotation.z = 0; hu.armR.rotation.z = 0; hu.hips.rotation.y = 0;
      hu.hips.position.y = 0.95;
      if (act) {
        actT += dt; const k = Math.min(1, actT / act.dur), up = k < 0.55 ? k / 0.55 : 1 - (k - 0.55) / 0.45;
        switch (act.move) {
          case 'slam': case 'stomp': hu.armL.rotation.x = hu.armR.rotation.x = -2.8 * up; hu.hips.position.y = 0.95 + up * 0.2; break;
          case 'sweep': hu.armR.rotation.x = -1.5; hu.armR.rotation.z = 1.5 - k * 3; hu.hips.rotation.y = 0.8 - k * 1.6; break;
          case 'roar': hu.armL.rotation.z = -1.3 * up; hu.armR.rotation.z = 1.3 * up; hu.head.rotation.x = -0.5 * up; break;
          case 'charge': hu.body.rotation.x = 0.5 * up; break;
          default: hu.armR.rotation.x = -1.6 * up; hu.armL.rotation.x = -1.6 * up;
        }
        if (k >= 1) { act = null; hu.head.rotation.x = 0; hu.body.rotation.x = 0; }
      }
    },
    dispose() { fl.dispose(); root.removeFromParent(); },
  };
}
