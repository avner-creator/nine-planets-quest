// Friendly people + animals in every world (Home Base and all 9 planets), built from WORLD_NPCS in data.js:
//  - HELPERS (E = their ability): Healer, Guide, Blacksmith, Potion Brewer, Mana Sage, Shield Guard, Cook, Farmer,
//    Bard, Map Maker, Portal Keeper, Fortune Teller, Coin Keeper, Trainer, Quest Giver, Animal Tamer, Night Watch,
//  - BUDDY posts (knight / archer / mage): E = they join you, follow you through portals and fight next to you,
//  - ROAMERS who stroll, look around, wave and chat, and ANIMALS that potter about,
//  - PETS from the Animal Tamer: they follow you everywhere and pick up coins for you.
// Friendly people can never be hurt: enemies ignore them (except buddies) and swords / powers pass through them.
import * as THREE from 'three';
import { DIMENSIONS, POWERS, SWORDS, ARMORS, FRIENDLY_NPCS, WORLD_NPCS, NPC_NAMES, CROPS, RECIPES, CHARACTERS } from '../data.js';
import { createNPC, createCritter, npcKindReady } from './modules.js';
import { rand, randInt, angleDamp, yawTo, pick, clamp, mulberry } from './util.js';

// ---------------------------------------------------------------- looks + words
// clothes that fit each world (roamers) - helpers wear their own colour so kids can spot them
const OUTFITS = {
  home: ['#4a6a9a', '#9a5a4a', '#5a8a4a', '#8a7a4a', '#7a4a8a', '#3f7f8f'],
  0: ['#4f7d2f', '#6b5236', '#3f6f25', '#8a6a3a'],          // Verdania: greens + browns
  1: ['#f2f2f2', '#2d6aa8', '#7fd0d8', '#e8d8b0'],          // Aquaria: sailor whites + sea blues
  2: ['#5a2a1e', '#2b2421', '#8a3a1a', '#4a3a30'],          // Pyros: soot + ember reds
  3: ['#b02a2a', '#2a3a6a', '#7a5a3a', '#e8edf2'],          // Glacia: warm winter coats
  4: ['#b5653a', '#8a4a2a', '#d9a66e', '#6a4a2a'],          // Terragon: leather + canyon tans
  5: ['#e8c020', '#3a4a6a', '#5a6a7a', '#2e3a52'],          // Voltara: yellow raincoats + slate
  6: ['#f5ead0', '#e8d8a8', '#ffffff', '#d9b878'],          // Solara: light desert robes
  7: ['#2a1f3a', '#1e1828', '#4a2a6a', '#3a2a5a'],          // Umbra: dark cloaks
  8: ['#5a5552', '#3a3432', '#6a2a2a', '#4a4442'],          // Necros: grey + deep crimson
};
const LOOK = {
  healer: '#e8f8ee', guide: '#d9a520', smith: '#4a3a2e', brewer: '#7a4aa8', sage: '#3a5aa8', guard: '#7a8090', cook: '#f2efe6',
  farmer: '#6a8a3a', bard: '#c03a5a', mapmaker: '#3a7a6a', portalkeeper: '#6a3ab0', fortune: '#8a2a8a', banker: '#2a6a3a',
  trainer: '#a85a2a', questgiver: '#c08a20', tamer: '#5a7a2a', watchman: '#2a3a5a', knight: '#3a5a8a', archer: '#3f6a2a', mage: '#4a3aa8', sensei: '#f4f1ea',
};
const LINES = {
  any: ['Hi!', 'Hello there!', 'Have you tried the temple trials?', 'The shop has potions if you need them!', 'Go hero, go!', 'What a lovely day!', 'Nice sword!'],
  home: ['Home Base is the safest place there is!', 'The portals lead to nine planets!', 'Night creatures never come here.', 'Sleep in your bed when it gets dark!', 'I heard each planet has three temples!'],
  0: ['The slimes are bouncy, but they bite!', 'I love the big lake here.', 'The trees are so tall!'],
  1: ['Mind the crabs on the beach!', 'The water is lovely today!', 'I saw a pirate ship last night!'],
  2: ["Don't step in the lava!", "Phew, it's toasty here!", 'The volcano rumbles at night...'],
  3: ['Brrr! Keep warm!', 'The frozen lake is slippery!', 'Snow wolves are fast - be careful!'],
  4: ['Hellooo! The canyons echo!', 'Rock golems are slow, but strong!', 'Watch out for falling rocks!'],
  5: ['Did you hear that thunder?', 'I hope lightning does not hit me!', 'The crystals hum when it storms.'],
  6: ['The oasis water is so clear!', 'Stay out of the midday sun!', 'I found a golden statue once!'],
  7: ["It's always twilight here...", 'The mushrooms glow so pretty!', "Don't be scared of the dark!"],
  8: ['This place gives me the shivers!', 'Be brave, hero!', 'The red moon is watching...'],
};
const ROAM_LINES = {
  villager: ['What a lovely day!', 'Nice sword!', 'Go hero, go!'],
  farmer: ['My carrots are growing so well!', 'The chickens laid lots of eggs today!'],
  child: ['When I grow up I want to be a hero like you!', 'Tag, you are it!', 'I saw a butterfly!', 'Can I hold your sword? Just kidding!'],
  elder: ['In my day we only had ONE planet!', 'Be brave, young hero.', 'My knees say rain is coming.'],
  traveler: ['I have walked through all nine portals!', 'Every planet has its own sky!', 'My feet are so tired!'],
  fisher: ['The fish are biting today!', 'I caught a fish THIS big!', 'Shh... you will scare the fish!'],
  miner: ['I found a shiny crystal!', 'Dig dig dig!', 'Watch your head in the caves!'],
  monk: ['Breathe in... breathe out...', 'Be calm like the water.', 'Peace and kindness, hero.'],
  explorer: ['I am making a map of everything!', 'Have you seen the temples? So cool!', 'Adventure is out there!'],
};
const HELLO = {
  healer: ['Hurt? I can heal you!', 'Feeling ouchy? Come here!'],
  guide: ['Lost? Ask me what to do next!', 'I know the way!'],
  smith: ['Clang clang! Want a sharper sword?', 'My hammer makes swords super sharp!'],
  brewer: ['Bubble bubble! Want a free potion?', 'My potions taste like strawberries!'],
  sage: ['Need more magic? I can help!', 'Breathe in the mana...'],
  guard: ['Want a magic shield?', 'I will keep you safe!'],
  cook: ['Mmm, something smells yummy!', "Bring me crops and I'll cook!"],
  farmer: ['Want some crops? Take them to the Cook!', 'My field is full of goodies!'],
  bard: ['La la la! Want to hear a song?', 'My songs make you speedy!'],
  mapmaker: ['I drew a map of this whole world!', 'Want my map?'],
  portalkeeper: ['I can zap you anywhere here!', 'Zip zap! Where to?'],
  fortune: ['I see... a hero! That is you!', 'Want to hear your fortune?'],
  banker: ['Coins, coins, shiny coins!', 'I have a gift for you every day!'],
  trainer: ['Ready for training?', 'Hit the dummy as fast as you can!'],
  questgiver: ['I have a job for a hero!', 'Psst! Want a side quest?'],
  tamer: ['Every hero needs a pet!', 'Want a furry friend?'],
  watchman: ['When it gets dark, I can walk with you.', 'My lantern makes night creatures weak!'],
  knight: ['Want me to come with you?', 'My shield is ready!'],
  archer: ['Want me to come with you?', 'I never miss!'],
  mage: ['Want me to come with you?', 'My magic is ready!'],
  sensei: ['Welcome to my dojo!', 'Hi-yah! Punch, kick, never give up!'],
};
const ANIMAL_SAYS = { dog: ['Woof!', 'Woof woof!'], cat: ['Mew!', 'Purrr...'], chicken: ['Cluck cluck!', 'Bawk!'], rabbit: ['*sniff sniff*', '*hop hop*'], deer: ['*munch munch*'], penguin: ['Squawk!', '*waddle waddle*'] };
const ANIMAL_SPEED = { dog: 2.6, cat: 1.6, chicken: 1.0, rabbit: 2.2, deer: 1.8, penguin: 0.8 };
const FORTUNES = [
  'You will find a shiny treasure very soon!', 'A big monster will be scared of you today!', 'Your next adventure will be AMAZING!',
  'Someone will say something nice to you today.', 'You will be extra lucky with coins!', 'A dragon dreams of being your friend.',
  'You will laugh so hard today!', 'Your sword will sparkle in the sunshine.', 'A tiny animal thinks you are the best!',
];
const PET_NAMES = { dog: ['Biscuit', 'Pepper', 'Max', 'Waffles'], cat: ['Whiskers', 'Mittens', 'Ginger', 'Socks'], rabbit: ['Clover', 'Thumper', 'Snowball', 'Hops'] };
const COMPASS = ['north', 'north-west', 'west', 'south-west', 'south', 'south-east', 'east', 'north-east'];
const HOME_GARDEN = { x: 52, z: 47 };   // the garden next to the house (from the Home layout)

// little SVG icons for name tags and buff chips (no emoji)
const S = (body) => `<svg viewBox="0 0 24 24">${body}</svg>`;
export const ICON = {
  healer: S('<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="#5fe08a" stroke="#fff" stroke-width="1.5"/>'),
  guide: S('<path d="M12 2l3 7 7 .6-5.4 4.6L18.2 22 12 18l-6.2 4 1.6-7.8L2 9.6 9 9z" fill="#ffd34a" stroke="#7a5a00"/>'),
  smith: S('<path d="M10 9l2-1 9 12-2 2z" fill="#b07a40" stroke="#222"/><path d="M2 7l7-5 5 5-4 3z" fill="#c8d0d8" stroke="#222"/>'),
  brewer: S('<path d="M9 2h6v2h-1v5l6 10a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l6-10V4H9z" fill="#ff5a6a" stroke="#fff" stroke-width="1.2"/>'),
  sage: S('<path d="M12 2C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-13z" fill="#5aa0ff" stroke="#fff" stroke-width="1.2"/>'),
  guard: S('<path d="M12 2l8 3v6c0 6-4 10-8 11-4-1-8-5-8-11V5z" fill="#c8d4e0" stroke="#3a4a5a" stroke-width="1.5"/>'),
  cook: S('<path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" fill="#e0e4ea" stroke="#3a4a5a" stroke-width="1.3"/><path d="M8 8c0-2 2-2 2-4M12 8c0-2 2-2 2-4M16 8c0-2 2-2 2-4" fill="none" stroke="#fff" stroke-width="1.4"/>'),
  farmer: S('<path d="M12 22V9" stroke="#c8a040" stroke-width="2"/><ellipse cx="12" cy="6" rx="2.6" ry="4" fill="#e3c46a" stroke="#8a6a20"/><ellipse cx="7.5" cy="10" rx="2.2" ry="3.4" fill="#e3c46a" stroke="#8a6a20" transform="rotate(-30 7.5 10)"/><ellipse cx="16.5" cy="10" rx="2.2" ry="3.4" fill="#e3c46a" stroke="#8a6a20" transform="rotate(30 16.5 10)"/>'),
  bard: S('<path d="M9 18V5l11-2v13" fill="none" stroke="#ff8ac0" stroke-width="2.4"/><circle cx="6.5" cy="18" r="3" fill="#ff8ac0"/><circle cx="17.5" cy="16" r="3" fill="#ff8ac0"/>'),
  mapmaker: S('<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z" fill="#f0e0b0" stroke="#7a5a2a" stroke-width="1.2"/><path d="M5 12l3 1 3-3 4 2" fill="none" stroke="#d04a3a" stroke-width="1.6"/>'),
  portalkeeper: S('<circle cx="12" cy="12" r="9" fill="none" stroke="#b07aff" stroke-width="3"/><circle cx="12" cy="12" r="4" fill="#e0c8ff"/>'),
  fortune: S('<circle cx="12" cy="10" r="7.5" fill="#b07ae8" stroke="#fff" stroke-width="1.2"/><circle cx="9.5" cy="7.5" r="2" fill="#fff" opacity=".7"/><path d="M6 19h12l-2 3H8z" fill="#8a5a2a"/>'),
  banker: S('<circle cx="12" cy="12" r="9" fill="#ffcc33" stroke="#8a6000" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="none" stroke="#8a6000"/>'),
  trainer: S('<circle cx="12" cy="12" r="9" fill="#fff" stroke="#d03a3a" stroke-width="3"/><circle cx="12" cy="12" r="4" fill="#d03a3a"/>'),
  questgiver: S('<circle cx="12" cy="12" r="10" fill="#ffd34a" stroke="#7a5a00" stroke-width="1.2"/><path d="M12 6v8" stroke="#3a2a00" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="18" r="1.7" fill="#3a2a00"/>'),
  tamer: S('<circle cx="12" cy="15" r="4.5" fill="#d09a6a"/><circle cx="6" cy="10" r="2.2" fill="#d09a6a"/><circle cx="18" cy="10" r="2.2" fill="#d09a6a"/><circle cx="9.5" cy="6" r="2.2" fill="#d09a6a"/><circle cx="14.5" cy="6" r="2.2" fill="#d09a6a"/>'),
  watchman: S('<path d="M9 5h6l1 3v9l-1 3H9l-1-3V8z" fill="#ffd36a" stroke="#4a3a20" stroke-width="1.5"/><path d="M10 2h4" stroke="#4a3a20" stroke-width="2"/>'),
  knight: S('<path d="M12 2l8 3v6c0 6-4 10-8 11-4-1-8-5-8-11V5z" fill="#5a8ad8" stroke="#fff" stroke-width="1.4"/><path d="M12 6v12M8 10h8" stroke="#fff" stroke-width="2"/>'),
  archer: S('<path d="M7 3c8 3 8 15 0 18" fill="none" stroke="#c08a4a" stroke-width="2.5"/><path d="M7 3v18" stroke="#eee"/><path d="M4 12h15m-3-3 3 3-3 3" stroke="#eee" stroke-width="1.6" fill="none"/>'),
  mage: S('<path d="M4 20L15 9" stroke="#c08a4a" stroke-width="2.5" stroke-linecap="round"/><path d="M17 2l1.4 3.6L22 7l-3.6 1.4L17 12l-1.4-3.6L12 7l3.6-1.4z" fill="#b9b0ff"/>'),
  sensei: S('<rect x="5" y="7" width="14" height="11" rx="4" fill="#f2c6a0" stroke="#7a3a2a" stroke-width="1.4"/><path d="M9 7v5M13 7v5M17 8v4" stroke="#7a3a2a" stroke-width="1.2"/><rect x="6" y="17" width="12" height="4" rx="1" fill="#c4242b"/>'),
  pet: S('<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z" fill="#ff6a9a" stroke="#fff" stroke-width="1.2"/>'),
  sword: S('<path d="M12 2l2 3v10h-4V5z" fill="#d8e4f0" stroke="#3a4a5a"/><path d="M7 15h10v2H7z" fill="#c08a4a"/><path d="M11 17h2v5h-2z" fill="#6a4a2a"/>'),
  speed: S('<path d="M13 2L4 14h7l-2 8 10-13h-7z" fill="#7af0a0" stroke="#fff" stroke-width="1.2"/>'),
  luck: S('<circle cx="8" cy="8" r="4.5" fill="#4fd36a"/><circle cx="16" cy="8" r="4.5" fill="#4fd36a"/><circle cx="8" cy="16" r="4.5" fill="#4fd36a"/><circle cx="16" cy="16" r="4.5" fill="#4fd36a"/><path d="M12 12l5 10" stroke="#2a7a3a" stroke-width="2"/>'),
};
// timed helper boosts (p.buffs[k] = seconds left; shield = hits left)
export const BUFFS = {
  sharp: { name: 'Sharp', icon: ICON.sword, color: '#d8e4f0' },
  sage: { name: 'Mana x2', icon: ICON.sage, color: '#5aa0ff' },
  shield: { name: 'Shield', icon: ICON.guard, color: '#c8d4e0', hits: true },
  snack: { name: 'Speedy', icon: ICON.speed, color: '#7af0a0' },
  song: { name: 'Song', icon: ICON.bard, color: '#ff8ac0' },
  luck: { name: 'Lucky', icon: ICON.luck, color: '#4fd36a' },
};

const titleOf = (kind) => (FRIENDLY_NPCS[kind] ? FRIENDLY_NPCS[kind].name.replace(/ Buddy$/, '') : 'Friend');
function plural(name) {
  const w = name.split(' '), last = w.pop();
  let p = last;
  if (/(s|x|ch|sh)$/i.test(last)) p = last + 'es';
  else if (/[^aeiou]y$/i.test(last)) p = last.slice(0, -1) + 'ies';
  else if (/fe$/i.test(last)) p = last.slice(0, -2) + 'ves';
  else if (/[^f]f$/i.test(last)) p = last.slice(0, -1) + 'ves';
  else p = last + 's';
  return [...w, p].join(' ');
}
const worldName = (id) => (id === 'home' ? 'Home Base' : DIMENSIONS[id].name);
export const RECIPE_OF = Object.fromEntries(RECIPES.map((r) => [r.food, r]));

// a person: the real model kind when the Models module has it, otherwise a villager in that helper's colour
function makePerson(game, model, outfit, seed, quality, kind) {
  // Kai the Dojo Master: 'sensei' when the models have it, else the trainer look, else a villager in a white gi colour
  if (model === 'sensei' && !npcKindReady('sensei') && npcKindReady('trainer')) model = 'trainer';
  const real = npcKindReady(model);
  const rig = createNPC(real ? model : 'villager', { outfit, seed, quality });
  if (!real) {
    if (kind === 'knight') { rig.setArmor(ARMORS[3]); rig.setSword(SWORDS[3]); }
    if (kind === 'guard' || kind === 'watchman') rig.setArmor(ARMORS[2]);
  }
  return rig;
}

// shared bits of simple geometry (dummy, lantern, arrows, field)
let SH = null;
function shared() {
  if (SH) return SH;
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,240,190,1)'); grd.addColorStop(0.35, 'rgba(255,200,110,0.55)'); grd.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  SH = {
    wood: m('#8a5a2a'), straw: m('#d8b860'), sack: m('#c8a878'), red: m('#d03a3a'), white: m('#f4f4f4'), dirt: m('#5a3e26', { roughness: 1 }),
    leaf: m('#4f9a30'), carrot: m('#f08a24'), wheat: m('#e3c46a'), metal: m('#3a3a40', { metalness: 0.6, roughness: 0.4 }),
    flame: new THREE.MeshBasicMaterial({ color: '#ffe08a' }),
    glow: new THREE.SpriteMaterial({ map: glowTex, color: '#ffd890', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10), box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 14, 10), cone: new THREE.ConeGeometry(1, 1, 6),
    shaft: new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5).rotateX(Math.PI / 2),
    tip: new THREE.ConeGeometry(0.05, 0.14, 6).rotateX(Math.PI / 2).translate(0, 0, 0.46),
    fletch: new THREE.BoxGeometry(0.12, 0.005, 0.14).translate(0, 0, -0.36),
    arrowMat: m('#c8a070'), tipMat: m('#c8d0d8', { metalness: 0.7, roughness: 0.3 }), fletchMat: m('#f4f4f4', { side: THREE.DoubleSide }),
  };
  return SH;
}
const part = (geo, mat, parent, x, y, z, sx, sy, sz) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; parent.add(o); return o; };
function arrowMesh() {
  const s = shared(), g = new THREE.Group();
  g.add(new THREE.Mesh(s.shaft, s.arrowMat), new THREE.Mesh(s.tip, s.tipMat), new THREE.Mesh(s.fletch, s.fletchMat));
  const f2 = new THREE.Mesh(s.fletch, s.fletchMat); f2.rotation.z = Math.PI / 2; g.add(f2);
  return g;
}
// the trainer's straw practice dummy: a target for swords and powers that only counts hits
function makeDummy(pos) {
  const s = shared(), root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  part(s.cyl, s.wood, root, 0, 0.04, 0, 0.4, 0.08, 0.4);
  part(s.cyl, s.wood, body, 0, 0.95, 0, 0.07, 1.9, 0.07);
  part(s.cyl, s.straw, body, 0, 1.15, 0, 0.3, 0.75, 0.3);
  part(s.box, s.wood, body, 0, 1.38, 0, 1.15, 0.08, 0.08);
  part(s.sph, s.sack, body, 0, 1.72, 0, 0.21, 0.23, 0.21);
  part(s.cyl, s.red, body, 0, 1.18, 0.29, 0.2, 0.02, 0.2).rotation.x = Math.PI / 2;
  part(s.cyl, s.white, body, 0, 1.18, 0.3, 0.12, 0.02, 0.12).rotation.x = Math.PI / 2;
  part(s.cyl, s.red, body, 0, 1.18, 0.31, 0.05, 0.02, 0.05).rotation.x = Math.PI / 2;
  root.position.copy(pos);
  let wob = 0, t = 0;
  const rig = {
    root, height: 1.9, radius: 0.45, hitHeight: 2.0, handR: null, swordTip: null, moves: [],
    setPose() {}, setMoveSpeed() {}, setFrozen() {}, setTint() {}, setEnraged() {}, setSword() {}, setArmor() {}, play() { return { duration: 0.3, hitTime: 0.1 }; },
    attack() { return { duration: 0.3, hitTime: 0.1 }; }, cast() { return { duration: 0.3, hitTime: 0.1 }; },
    hurt() { wob = 1; },
    update(dt) { t += dt; wob = Math.max(0, wob - dt * 2.2); body.rotation.x = Math.sin(t * 18) * 0.25 * wob; body.rotation.z = Math.cos(t * 13) * 0.12 * wob; },
    dispose() { root.removeFromParent(); },
  };
  return {
    isDummy: true, kind: 'dummy', name: 'Practice Dummy', alive: true, pos: pos.clone(), home: pos.clone(), yaw: 0, rig,
    radius: 0.45, height: 1.9, hitHeight: 2.0, hp: 1, maxHp: 1, vel: new THREE.Vector3(), knock: new THREE.Vector3(),
    frozenT: 0, rootedT: 0, burnT: 0, burnDps: 0, burnTick: 0, noticed: true, state: 'idle', def: { color: '#d8b860', name: 'Practice Dummy' }, lastHitT: -100,
  };
}
// a lantern in the Night Watch's hand (a real light only while he walks with you, see game.nightLights)
function addLantern(rig) {
  const s = shared(), g = new THREE.Group();
  part(s.box, s.metal, g, 0, 0.16, 0, 0.16, 0.03, 0.16);
  part(s.box, s.metal, g, 0, -0.08, 0, 0.18, 0.03, 0.18);
  const fl = part(s.sph, s.flame, g, 0, 0.04, 0, 0.07, 0.1, 0.07); fl.castShadow = false;
  const glow = new THREE.Sprite(s.glow); glow.scale.setScalar(1.3); g.add(glow);
  const hand = rig.handR;
  if (hand) { g.position.set(0, -0.12, 0.05); hand.add(g); } else { g.position.set(0.38, 0.95, 0.25); rig.root.add(g); }
  return { group: g, glow };
}
// a little crop field next to a farmer on the planets (Home has its garden)
function makeField(world, center, yaw) {
  const s = shared(), g = new THREE.Group();
  const W = 4.4, D = 3.2;
  const ca = Math.cos(yaw), sa = Math.sin(yaw);
  const at = (lx, lz) => ({ x: center.x + lx * ca + lz * sa, z: center.z - lx * sa + lz * ca });
  const geo = new THREE.PlaneGeometry(W, D, 6, 4).rotateX(-Math.PI / 2);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const w = at(pa.getX(i), pa.getZ(i)); pa.setY(i, world.heightAt(w.x, w.z) - center.y + 0.06); }
  geo.computeVertexNormals();
  const soil = new THREE.Mesh(geo, s.dirt); soil.receiveShadow = true; g.add(soil);
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 5; k++) {
      const lx = -W / 2 + 0.5 + k * 0.85, lz = -D / 2 + 0.55 + r * 1.05, w = at(lx, lz), y = world.heightAt(w.x, w.z) - center.y;
      if (r === 1) { part(s.cone, s.wheat, g, lx, y + 0.35, lz, 0.12, 0.6, 0.12); }
      else { part(s.cone, s.leaf, g, lx, y + 0.22, lz, 0.14, 0.4, 0.14); part(s.sph, s.carrot, g, lx + 0.06, y + 0.08, lz, 0.06, 0.06, 0.06); }
    }
  }
  g.position.copy(center); g.rotation.y = yaw;
  return g;
}

// ================================================================ friendly people of the current world
export class NPCs {
  constructor(game) {
    this.game = game; this.list = []; this.cool = {}; this.dummies = []; this.training = null;
    this.posts = []; this.wanderPts = []; this.roster = []; this.extras = []; this.noGo = []; this._v = new THREE.Vector3();
  }
  get wid() { return this.game.worldId; }
  get wkey() { return this.wid === 'home' ? 'home' : String(this.wid); }
  clear() {
    this.endTraining(false, true);
    this.dummies.forEach((d) => { d.alive = false; this.game.scene.remove(d.rig.root); });
    this.dummies.length = 0;
    this.list.forEach((n) => { this.game.scene.remove(n.rig.root); n.rig.dispose(); });
    this.list.length = 0;
    this.extras.forEach((o) => this.game.scene.remove(o));
    this.extras.length = 0;
    this.merchant = null;
  }
  isDark() { return this.game.moodForTime() === 'night'; }
  rnd() { return this._rng ? this._rng() : Math.random(); }

  // a dry, open spot near `c` (not in courtyards, the boss arena, bandit camps, portals or trees)
  spot(c, minR, maxR, tries = 24, avoid = null) {
    const g = this.game, w = g.world, L = w.landmarks;
    for (let t = 0; t < tries; t++) {
      const a = this.rnd() * Math.PI * 2, r = minR + (maxR - minR) * this.rnd();
      const p = new THREE.Vector3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r);
      if (Math.hypot(p.x, p.z) > w.radius - 12) continue;
      const h = w.heightAt(p.x, p.z);
      if (w.liquid && w.liquid.type !== 'ice' && h < w.liquid.level + 0.3) continue;
      if (g.inBossZone && g.inBossZone(p)) continue;
      if ((w.banditCamps || []).some((cp) => Math.hypot(cp.pos.x - p.x, cp.pos.z - p.z) < (cp.radius || 10) + 18)) continue;
      if (L.portals && L.portals.some((pt) => Math.hypot(pt.pos.x - p.x, pt.pos.z - p.z) < 5)) continue;
      if (L.homePortal && Math.hypot(L.homePortal.pos.x - p.x, L.homePortal.pos.z - p.z) < 5) continue;
      if (L.bed && Math.hypot(L.bed.pos.x - p.x, L.bed.pos.z - p.z) < 3) continue;
      if (avoid && avoid.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3.4)) continue;
      if (this.noGo.some((z) => Math.hypot(z.x - p.x, z.z - p.z) < z.r && Math.hypot(z.x - c.x, z.z - c.z) >= z.r)) continue;   // e.g. inside the dojo
      if (Math.abs(w.heightAt(p.x + 1, p.z) - w.heightAt(p.x - 1, p.z)) > 1.2 || Math.abs(w.heightAt(p.x, p.z + 1) - w.heightAt(p.x, p.z - 1)) > 1.2) continue;
      const test = p.clone();
      if (g.colliders && g.colliders.resolve(test, 0.8)) continue;   // not inside a tree / wall
      p.y = h;
      return p;
    }
    return null;
  }

  onWorldLoaded() {
    this.clear();
    const g = this.game, w = g.world, L = w.landmarks, id = this.wid, home = id === 'home';
    const wn = home ? 0 : id + 1;
    if (L.shop && L.shop.merchant) {
      const rig = createNPC('merchant', { outfit: '#7a4a2a', seed: 11, quality: g.settings.quality });
      const pos = L.shop.merchant.clone(); pos.y = w.heightAt(pos.x, pos.z);
      this.merchant = this.add(rig, pos, L.shop.merchantYaw || 0, 'merchant', { role: 'merchant', name: 'Shop' });
    }
    // everything is placed with a seeded random, so helpers stand in the same spot every visit
    this._rng = mulberry(7919 * (wn + 1) + 13);
    const base = L.spawn.clone(), shop = L.shop ? L.shop.pos.clone() : base.clone();
    const list = WORLD_NPCS[home ? 'home' : id] || ['healer', 'guide', 'knight', 'villager'];
    const start = (wn * 7 + 3) % NPC_NAMES.length;
    this.roster = list.map((kind, slot) => ({ kind, slot, def: FRIENDLY_NPCS[kind] || FRIENDLY_NPCS.villager, first: NPC_NAMES[(start + slot * 11) % NPC_NAMES.length] }));
    // Home: the Dojo Master (Kai) - in the Dojo when the world has one - and the dojo's 4 practice dummies
    const dojo = home && L.dojo && L.dojo.pos ? L.dojo : null;
    this.noGo = dojo ? [{ x: dojo.pos.x, z: dojo.pos.z, r: (dojo.radius || 8) + 1 }] : [];
    if (home) {
      const m = dojo && dojo.master ? dojo.master.clone() : null;
      this.roster.push({ kind: 'sensei', slot: this.roster.length, def: { name: 'Dojo Master', model: 'sensei', role: 'helper' }, first: 'Kai', fixed: m, yaw: m && Number.isFinite(dojo.masterYaw) ? dojo.masterYaw : null });
    }
    if (dojo && Array.isArray(dojo.dummies)) {
      const c = dojo.mat && dojo.mat.pos ? dojo.mat.pos : dojo.pos;
      dojo.dummies.forEach((v) => { const p = new THREE.Vector3(v.x, w.heightAt(v.x, v.z), v.z); this.addDummy(p, c, { dojo: true }); });
    }
    const avoid = [base];
    if (L.shop && L.shop.merchant) avoid.push(L.shop.merchant);
    let k = 0;
    for (const r of this.roster) {
      if (r.def.role !== 'helper' && r.def.role !== 'buddy') continue;
      let pos = null;
      if (r.fixed) pos = r.fixed;
      if (!pos && r.kind === 'trainer' && dojo) {   // the Home Trainer works in the Dojo (its dummies count for the challenge)
        const c = dojo.mat && dojo.mat.pos ? dojo.mat.pos : dojo.pos;
        pos = this.spot(c, 1.5, Math.max(2.5, ((dojo.mat && dojo.mat.radius) || 4) * 0.8), 30, avoid);
        if (pos) r.faceTo = c;
      }
      if (!pos && r.kind === 'cook' && home) {   // Home: the Cook works by the house, a short walk from the Farmer's garden
        const gc = new THREE.Vector3(HOME_GARDEN.x, 0, HOME_GARDEN.z);
        pos = this.spot(gc, 11, 16, 30, avoid);
      }
      if (!pos && r.kind === 'farmer' && home && w.heightAt) {
        const gc = new THREE.Vector3(HOME_GARDEN.x, w.heightAt(HOME_GARDEN.x, HOME_GARDEN.z), HOME_GARDEN.z);
        if (Math.hypot(gc.x - base.x, gc.z - base.z) < w.radius) pos = this.spot(gc, 8.5, 11, 30, avoid);
        if (pos) r.faceTo = gc;
      }
      if (!pos) {
        const near = k % 2 === 0 ? base : shop; k++;
        pos = this.spot(near, 4, 11, 30, avoid) || this.spot(near, 6, 18, 30, avoid) || this.spot(base, 3, 26, 40) || base.clone().add(new THREE.Vector3(3 + k, 0, 3));
      }
      pos.y = w.heightAt(pos.x, pos.z);
      avoid.push(pos);
      r.post = pos;
      if (r.kind === 'farmer' && !r.faceTo) {   // planets: a little field next to the farmer
        const fyaw = yawTo(pos.x, pos.z, base.x, base.z);
        const fc = this.spot(pos, 3.2, 4.2, 16, avoid.filter((q) => q !== pos));
        if (fc) { const f = makeField(w, fc, fyaw); g.scene.add(f); this.extras.push(f); r.faceTo = fc; }
      }
    }
    // wander points for roamers + animals
    const pts = home && L.villagers && L.villagers.length ? L.villagers.map((v) => v.clone()) : [];
    for (let j = 0; j < 6; j++) { const p = this.spot(j % 2 ? shop : base, 8, 30); if (p) pts.push(p); }
    this.wanderPts = pts.length ? pts : [base.clone()];
    this.roster.forEach((r) => this.spawnFrom(r));
    this._rng = null;
  }
  spawnFrom(r) {
    const g = this.game, w = g.world, id = this.wid, role = r.def.role;
    if (role === 'buddy' && g.buddies.taken(id, r.slot)) return null;
    const wn = id === 'home' ? 0 : id + 1;
    const seed = 1000 + wn * 97 + r.slot * 13;
    const outfits = OUTFITS[id] || OUTFITS.home;
    const posted = role === 'helper' || role === 'buddy';
    let rig;
    if (role === 'animal') rig = createCritter(r.def.model, { seed, quality: 'low' });
    else rig = makePerson(g, r.def.model, role === 'roamer' ? outfits[r.slot % outfits.length] : (LOOK[r.kind] || outfits[0]), seed, role === 'roamer' ? 'low' : g.settings.quality, r.kind);
    let pos;
    if (posted) pos = r.post.clone();
    else { const p0 = this.wanderPts[r.slot % this.wanderPts.length]; pos = this.spot(p0, 0, 4) || p0.clone(); }
    pos.y = w.heightAt(pos.x, pos.z);
    const face = r.faceTo || w.landmarks.spawn;
    const yaw = r.yaw != null ? r.yaw : posted ? yawTo(pos.x, pos.z, face.x, face.z) : this.rnd() * 6.28;
    const n = this.add(rig, pos, yaw, r.kind, { role, slot: r.slot, first: r.first, tagged: posted, name: posted ? `${r.first} the ${r.def.name.replace(/ Buddy$/, '')}` : '' });
    n.post = pos.clone();
    if (!posted || r.kind === 'watchman') { n.target = pos.clone(); n.wait = rand(1, 5); }
    if (r.kind === 'watchman') n.lantern = addLantern(rig);
    return n;
  }
  // a buddy who went home is back at their post
  restorePost(slot) {
    const r = this.roster[slot];
    if (!r || this.list.some((n) => n.slot === slot)) return;
    const n = this.spawnFrom(r);
    if (n) this.game.fx.sparkles(n.pos.clone().setY(n.pos.y + 1), '#7af0ff', 30, 3);
  }
  add(rig, pos, yaw, kind, o = {}) {
    rig.root.position.copy(pos);
    rig.root.rotation.y = yaw;
    const shadow = o.role !== 'animal';
    rig.root.traverse((m) => { if (m.isMesh) m.castShadow = shadow; });
    rig.setPose('idle');
    this.game.scene.add(rig.root);
    const n = {
      rig, pos: pos.clone(), post: pos.clone(), yaw, homeYaw: yaw, kind, role: o.role || 'helper', slot: o.slot ?? -1, first: o.first || '', name: o.name || '', tagged: !!o.tagged,
      pose: 'idle', radius: Math.min(0.45, rig.radius || 0.4), height: rig.height || 1.8, say: null, sayT: 0, greetT: rand(0, 4), acc: 0, waveT: 0, lookYaw: null,
    };
    this.list.push(n);
    return n;
  }
  remove(n) { const i = this.list.indexOf(n); if (i >= 0) this.list.splice(i, 1); this.game.scene.remove(n.rig.root); n.rig.dispose(); }

  // ---------------------------------------------------------------- talking
  say(n, text, dur = 3.5) { n.say = text; n.sayT = dur; }
  wave(n) { n.waveT = 0.8; if (n.role === 'animal') n.rig.attack(); else n.rig.cast('light'); }   // animals: a happy hop
  lineFor(n) {
    const id = this.wid, w = this.game.world;
    if (n.role === 'animal') return pick(ANIMAL_SAYS[n.kind] || ['...']);
    const pool = [...LINES.any, ...(LINES[id] || []), ...(ROAM_LINES[n.kind] || []), ...(ROAM_LINES[n.kind] || [])];
    if (id !== 'home' && w.banditCamps && w.banditCamps.length && Math.random() < 0.3) {
      const c = w.banditCamps.reduce((a, b) => (Math.hypot(b.pos.x - n.pos.x, b.pos.z - n.pos.z) < Math.hypot(a.pos.x - n.pos.x, a.pos.z - n.pos.z) ? b : a));
      const ang = Math.atan2(-(c.pos.x - n.pos.x), c.pos.z - n.pos.z);   // +Z is north on the map
      return `Watch out for the bandits to the ${COMPASS[(Math.round(ang / (Math.PI / 4)) + 8) % 8]}!`;
    }
    return pick(pool);
  }
  coolLeft(key) { return Math.max(0, Math.ceil((this.cool[key] || 0) - this.game.time)); }
  setCool(key, s) { this.cool[key] = this.game.time + s; }
  find(kind) { return this.list.find((n) => n.kind === kind) || null; }

  // the "Press E" line for each friendly person near player p
  interactables(p, E, out) {
    const g = this.game;
    for (const n of this.list) {
      if (n.kind === 'merchant') continue;
      const dn = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
      if (dn > (n.role === 'animal' ? 2.6 : 3.2)) continue;
      out.push({ d: dn + (n.role === 'roamer' || n.role === 'animal' ? 0.5 : 0), text: this.promptText(n, p, E), act: () => this.talk(n, p) });
    }
    if (this.training) {
      const T = this.training;
      const near = this.dummies.filter((d) => (T.dojo ? d.dojo : d === T.dummy)).map((d) => Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z));
      const dd = near.length ? Math.min(...near) : 99;
      if (dd < 5) out.push({ d: dd, text: `Hit the dummy! <b>${T.hits} / 10</b> - ${Math.ceil(T.t)} s`, act: null });
    }
    void g;
  }
  promptText(n, p, E) {
    const g = this.game, nm = `<b>${n.name}</b>`;
    switch (n.kind) {
      case 'healer': return `Press ${E}: ${nm} heals you`;
      case 'guide': return `Press ${E} to ask ${nm} what to do`;
      case 'smith': return `Press ${E}: ${nm} sharpens your sword`;
      case 'brewer': return `Press ${E}: a free Health Potion from ${nm}`;
      case 'sage': return `Press ${E}: ${nm} fills your mana`;
      case 'guard': return `Press ${E}: a magic shield from ${nm}`;
      case 'cook': return this.cropCount() ? `Press ${E}: ${nm} cooks your crops` : `Press ${E}: a tasty snack from ${nm}`;
      case 'farmer': return `Press ${E}: crops from ${nm}`;
      case 'bard': return `Press ${E}: ${nm} plays a speedy song`;
      case 'mapmaker': return `Press ${E}: get the map from ${nm}`;
      case 'portalkeeper': return `Press ${E}: ${nm} zaps you somewhere`;
      case 'fortune': return `Press ${E}: ${nm} tells your fortune`;
      case 'banker': return `Press ${E}: today's coin gift from ${nm}`;
      case 'trainer': return this.training ? `Hit the dummy! <b>${this.training.hits} / 10</b>` : `Press ${E}: training challenge with ${nm}`;
      case 'questgiver': return `Press ${E}: ask ${nm} for a side quest`;
      case 'tamer': return `Press ${E}: get a pet from ${nm}`;
      case 'watchman': return n.escort === p ? `Press ${E}: ${nm} goes back to the post` : this.isDark() ? `Press ${E}: ${nm} walks with you (lantern!)` : `Press ${E} to say hi to ${nm}`;
      case 'sensei': return !g.state.dojo ? `Press ${E} to talk to ${nm}` : n.offerT && g.time < n.offerT ? `Press ${E} again to play as Kai!` : `Press ${E}: a fighting tip from ${nm}`;
      case 'knight': case 'archer': case 'mage': return g.buddies.of(p) ? `${nm}: "Want me to come instead?" Press ${E}` : `${nm}: "Want me to come with you?" Press ${E}`;
      default: break;
    }
    if (n.role === 'animal') return `Press ${E} to pet the ${(FRIENDLY_NPCS[n.kind] || { name: 'animal' }).name.toLowerCase()}`;
    return `Press ${E} to say hi`;
  }

  // E with a friendly person (p = the player who pressed E)
  talk(n, p) {
    const g = this.game, s = g.state, wk = this.wkey;
    const yes = (text, dur = 3.5) => { this.say(n, text, dur); this.wave(n); g.audio.play('toast'); };
    const wait = (left, what = 'Come back') => this.say(n, `${what} in ${left} seconds!`, 3);
    const B = p.buffs || (p.buffs = {});
    switch (n.kind) {
      case 'healer': {
        const left = this.coolLeft('healer:' + wk);
        if (left > 0) { this.say(n, `My healing magic needs a little rest. Come back in ${left} seconds!`, 3); return; }
        this.setCool('healer:' + wk, 60);
        g.players.forEach((q) => {
          if (q.dead) return;
          q.hp = q.maxHp; q.mana = q.maxMana;
          g.fx.sparkles(q.pos.clone().setY(q.pos.y + 1.2), '#7fffd4', 50, 4);
          g.fx.ground.spawn(g.world, { shape: 'circle', pos: q.pos, radius: 2.4, color: '#7fffd4', duration: 1.4, mode: 'glow' });
          g.hud.screenFlash(q, '#7fffd4', 0.3);
        });
        g.audio.play('power_healing');
        this.wave(n);
        this.say(n, g.players.length > 1 ? 'There you go, both of you are good as new!' : 'There you go, good as new!', 3);
        return;
      }
      case 'guide': {
        const obj = g.objective(p);
        const plain = obj ? obj.text.replace(/<[^>]+>/g, '') : 'Explore and have fun!';
        yes(`Here is what I would do next: ${plain}! Follow the yellow marker.`, 5);
        g.hud.toastFor(p, `Guide: ${plain}`, 'info', 4);
        g.hud.pulseMarker(p);
        const tip = this.helperTip();
        if (tip) setTimeout(() => { if (this.list.includes(n)) this.say(n, tip, 5); }, 5200);
        return;
      }
      case 'smith':
        if (B.sharp > 0) { this.say(n, `Your sword is still super sharp! (${Math.ceil(B.sharp)} s)`, 3); return; }
        B.sharp = 180;
        g.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.3), '#ffe9a8', 40, 4);
        g.audio.play('hit', { pitch: 1.6, volume: 0.6 }); setTimeout(() => g.audio.play('hit', { pitch: 1.7, volume: 0.5 }), 220);
        yes('Clang! Clang! Your sword is super sharp now!');
        g.hud.toastFor(p, 'Sharp sword: +25% sword damage for 3 minutes!', 'good', 3);
        return;
      case 'brewer': {
        const left = this.coolLeft('brewer:' + wk);
        if (left > 0) { wait(left, 'My next potion is bubbling. Come back'); return; }
        this.setCool('brewer:' + wk, 180);
        s.potions.hp = (s.potions.hp || 0) + 1;
        g.audio.play('potion');
        g.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.2), '#ff5a6a', 30, 3);
        yes('Here, a fresh Health Potion! It tastes like strawberries!');
        g.hud.toastFor(p, '+1 Health Potion (you drink it by yourself when you get hurt)', 'good', 3);
        g.saveNow();
        return;
      }
      case 'sage': {
        const left = this.coolLeft('sage:' + p.index);
        if (left > 0) { wait(left, 'The magic needs to gather again. Come back'); return; }
        this.setCool('sage:' + p.index, 120);
        p.mana = p.maxMana; B.sage = 120;
        g.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.2), '#5aa0ff', 50, 4);
        g.audio.play('power_light', { volume: 0.5 });
        yes('Your mana is full - and it comes back twice as fast for 2 minutes!');
        return;
      }
      case 'guard': {
        if (B.shield > 0) { this.say(n, `You still have your shield! It blocks ${B.shield} more hit${B.shield > 1 ? 's' : ''}.`, 3); return; }
        const left = this.coolLeft('guard:' + p.index);
        if (left > 0) { wait(left, 'My shield magic is recharging. Come back'); return; }
        this.setCool('guard:' + p.index, 30);
        B.shield = 3;
        g.fx.ring(p.pos.clone().setY(p.pos.y + 1), '#c8d4e0', 2.5, 0.6);
        g.audio.play('shield');
        yes('There! Your magic shield blocks the next 3 hits!');
        return;
      }
      case 'cook': return this.cook(n, p);
      case 'farmer': return this.farm(n, p);
      case 'bard': {
        const left = this.coolLeft('bard:' + wk);
        if (left > 0) { wait(left, 'My fingers need a rest. Come back'); return; }
        this.setCool('bard:' + wk, 90);
        g.players.forEach((q) => { if (Math.hypot(q.pos.x - n.pos.x, q.pos.z - n.pos.z) < 20) (q.buffs || (q.buffs = {})).song = 90; });
        for (let i = 0; i < 6; i++) setTimeout(() => g.fx.burst({ pos: n.pos.clone().setY(n.pos.y + 2), count: 3, spread: 0.6, up: 1.5, life: [0.8, 1.3], size: [0.3, 0.5], color: ['#ff8ac0', '#ffd34a', '#7af0ff'], sprite: 'spark' }), i * 250);
        g.audio.play('levelUp', { pitch: 1.5, volume: 0.45 });
        yes(g.players.length > 1 ? 'La la la! Now you are BOTH speedy for 90 seconds!' : 'La la la! You move and swing faster for 90 seconds!');
        return;
      }
      case 'mapmaker': {
        s.mapped = s.mapped || {};
        if (s.mapped[wk]) { this.say(n, 'You already have my map! Press M to look at it.', 3); return; }
        s.mapped[wk] = true;
        yes('Here is my map! Every temple, bandit camp and the boss are on it now.');
        g.hud.toastFor(p, 'Map updated! Temples, bandit camps and the boss are on your map (M) and minimap.', 'good', 4);
        g.saveNow();
        return;
      }
      case 'portalkeeper': this.say(n, 'Zip zap! Where do you want to go?', 2.5); g.ui.open('zap', { n }, p); return;
      case 'fortune': {
        const left = this.coolLeft('fortune:' + p.index);
        if (left > 0) { wait(left, 'The crystal ball is cloudy. Come back'); return; }
        this.setCool('fortune:' + p.index, 180);
        B.luck = 120;
        g.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.4), '#b07ae8', 40, 4);
        yes(`${pick(FORTUNES)} ...and you are LUCKY: double coins for 2 minutes!`, 5);
        return;
      }
      case 'banker': {
        s.day = s.day || 1;
        if (s.bankDay === s.day) { this.say(n, 'That was your gift for today. Come back tomorrow!', 3); return; }
        s.bankDay = s.day;
        let L = this.wid === 'home' ? 1 : DIMENSIONS[this.wid].level;
        if (this.wid === 'home') for (let i = 0; i < 9; i++) if (g.portalState(i) !== 'locked') L = Math.max(L, DIMENSIONS[i].level);
        const amount = 25 + 25 * L;
        g.fx.dropCoins(n.pos.clone().add(new THREE.Vector3(Math.sin(n.yaw), 0.4, Math.cos(n.yaw))), amount);
        yes(`Here is your gift for today: ${amount} coins!`);
        g.saveNow();
        return;
      }
      case 'trainer': return this.startTraining(n, p);
      case 'questgiver': return this.questTalk(n, p);
      case 'tamer': this.say(n, 'Which pet would you like?', 2.5); g.ui.open('pet', { n }, p); return;
      case 'watchman': return this.watchTalk(n, p);
      case 'sensei': return this.dojoTalk(n, p);
      case 'knight': case 'archer': case 'mage': g.buddies.recruit(p, n); return;
      default: break;
    }
    if (n.role === 'animal') {
      this.say(n, pick(ANIMAL_SAYS[n.kind] || ['...']), 2);
      n.rig.attack();
      g.fx.burst({ pos: n.pos.clone().setY(n.pos.y + n.height + 0.2), count: 4, spread: 0.3, up: 1.2, life: [0.6, 1], size: [0.25, 0.4], color: ['#ff6a9a', '#ffb0c8'], sprite: 'spark' });
      g.audio.play('click', { pitch: 1.8, volume: 0.5 });
      return;
    }
    this.say(n, this.lineFor(n), 3.5);
    this.wave(n);
  }
  // the Guide tells you about a helper in this world
  helperTip() {
    const has = (k) => this.list.find((n) => n.kind === k);
    const tips = [];
    const f = has('farmer'), c = has('cook');
    if (f && c) tips.push(`${f.name} is giving away crops - ${c.name} can turn them into yummy food!`);
    for (const k of ['smith', 'bard', 'tamer', 'trainer', 'banker', 'questgiver', 'portalkeeper', 'mapmaker', 'brewer', 'sage', 'guard', 'fortune', 'watchman']) {
      const n = has(k);
      if (n) tips.push(`Have you met ${n.name}? ${FRIENDLY_NPCS[k].does}`);
    }
    const k = this.list.find((n) => n.kind === 'sensei');
    if (k && !this.game.state.dojo) tips.push(`Visit ${k.name}${this.game.world.landmarks.dojo ? ' in the Dojo' : ''} - you can learn to play as him!`);
    const b = this.list.find((n) => n.role === 'buddy');
    if (b) tips.push(`${b.name} can come with you as your buddy!`);
    return tips.length ? pick(tips) : null;
  }

  // ---------------------------------------------------------------- farmer + cook
  bag() { const s = this.game.state; return s.bag || (s.bag = {}); }
  cropCount() { const b = this.bag(); return CROPS.reduce((a, c) => a + (b[c.id] || 0), 0); }
  farm(n, p) {
    const g = this.game, key = `farmer:${this.wkey}:${n.slot}`;
    const left = this.coolLeft(key);
    if (left > 0) { this.say(n, `My plants are still growing. Come back in ${left} seconds!`, 3); return; }
    this.setCool(key, 120);
    const b = this.bag(), got = {};
    const k = randInt(1, 3);
    for (let i = 0; i < k; i++) { const c = pick(CROPS); got[c.id] = (got[c.id] || 0) + 1; b[c.id] = (b[c.id] || 0) + 1; }
    const words = Object.entries(got).map(([id, c]) => `${c} ${CROPS.find((x) => x.id === id).name.replace(/s$/, c > 1 ? 's' : '')}`);
    const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0];
    Object.keys(got).forEach((id) => g.fx.sparkles(p.pos.clone().setY(p.pos.y + 1.2), CROPS.find((x) => x.id === id).color, 16, 2.5));
    this.wave(n);
    g.audio.play('loot');
    const cook = this.find('cook');
    this.say(n, `Fresh from my field: ${list}! Take ${k > 1 ? 'them' : 'it'} to ${cook ? cook.name : 'a Cook'}!`, 4);
    g.hud.toastFor(p, `+ ${list} <small>(in your bag - a Cook makes food from crops)</small>`, 'loot', 3);
    g.saveNow();
  }
  cook(n, p) {
    const g = this.game, b = this.bag();
    if (!this.cropCount()) {
      const left = this.coolLeft('cook:' + p.index);
      if (left > 0) { this.say(n, `Bring me crops from a Farmer and I'll cook something yummy! (Snack in ${left} s)`, 3.5); return; }
      this.setCool('cook:' + p.index, 60);
      const B = p.buffs || (p.buffs = {});
      p.addHot(p.maxHp * 0.4, 60); B.snack = Math.max(B.snack || 0, 60);
      this.wave(n);
      g.audio.play('potion', { pitch: 0.8 });
      this.say(n, "Bring me crops from a Farmer and I'll cook something yummy! Here, a little snack for now.", 4.5);
      g.hud.toastFor(p, 'Snack! You heal slowly and run faster for 60 seconds.', 'good', 3);
      return;
    }
    const made = [];
    for (const r of RECIPES) {
      const c = b[r.crop] || 0;
      if (!c) continue;
      b[r.crop] = 0; b[r.food] = (b[r.food] || 0) + c;
      made.push(`${c} ${c > 1 && !/s$/.test(r.name) && r.name !== 'Bread' && r.name !== 'Carrot Soup' ? r.name + 's' : r.name}`);
    }
    // a little cooking show: steam puffs + sizzle
    const top = n.pos.clone().setY(n.pos.y + 1.4);
    for (let i = 0; i < 5; i++) setTimeout(() => g.fx.burst({ pos: top, count: 4, blend: 'normal', spread: 0.4, up: 1.6, life: [0.8, 1.4], size: [0.4, 0.8], sizeEnd: 2, alpha: 0.5, color: '#ffffff', sprite: 'smoke' }), i * 180);
    g.audio.play('burn', { volume: 0.5, pitch: 1.3 });
    setTimeout(() => g.audio.play('loot'), 800);
    this.wave(n);
    const list = made.length > 1 ? `${made.slice(0, -1).join(', ')} and ${made[made.length - 1]}` : made[0];
    this.say(n, `Here you go - ${list}!`, 4);
    g.hud.toastFor(p, `Cooked: ${list}! <small>You eat food by yourself when you get hurt.</small>`, 'good', 3.5);
    g.saveNow();
  }

  // ---------------------------------------------------------------- trainer + practice dummies (Home: the dojo's 4 dummies)
  addDummy(pos, face, o = {}) {
    const d = makeDummy(pos);
    Object.assign(d, o);
    if (face) d.rig.root.rotation.y = yawTo(pos.x, pos.z, face.x, face.z);
    this.game.scene.add(d.rig.root);
    this.dummies.push(d);
    return d;
  }
  removeDummy(d) {
    const i = this.dummies.indexOf(d);
    if (i >= 0) this.dummies.splice(i, 1);
    d.alive = false;
    this.game.scene.remove(d.rig.root);
  }
  startTraining(n, p) {
    const g = this.game;
    if (this.training) { this.say(n, 'Hit the dummy, quick!', 2); return; }
    const left = this.coolLeft('trainer:' + p.index);
    if (left > 0) { this.say(n, `Have a little rest first! Try again in ${left} seconds.`, 3); return; }
    const dojo = this.dummies.filter((d) => d.dojo);
    let dummy = null;
    if (!dojo.length || Math.hypot(dojo[0].pos.x - n.pos.x, dojo[0].pos.z - n.pos.z) > 25) {
      const fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
      const pos = this.spot(new THREE.Vector3(n.pos.x + fx * 3.5, 0, n.pos.z + fz * 3.5), 0, 2, 16, [n.pos]) || this.spot(n.pos, 3, 5, 20) || n.pos.clone().add(new THREE.Vector3(fx * 3, 0, fz * 3));
      pos.y = g.world.heightAt(pos.x, pos.z);
      dummy = this.addDummy(pos, p.pos, { temp: true });
      g.fx.dust(pos, '#b8a890', 10, 1.2);
    }
    this.training = { p, n, hits: 0, t: 15, lastHit: -1, dummy, dojo: !dummy };
    this.wave(n);
    const what = dummy ? 'the dummy' : 'the dojo dummies';
    this.say(n, `Hit ${what} 10 times in 15 seconds! GO!`, 3);
    g.hud.toastFor(p, `Training! Hit ${what} 10 times in 15 seconds - with your ${p.char.fightStyle === 'fists' ? 'fists' : 'sword'} or powers!`, 'info', 3);
    g.audio.play('dusk', { volume: 0.5, pitch: 1.3 });
  }
  // a hit on a practice dummy: it bounces and shows the damage, but never breaks
  hitDummy(e, dmg, o = {}) {
    const g = this.game, T = this.training;
    if (!o.by || !g.players.includes(o.by) || o.source === 'buddy') return 0;
    if (g.time - (e.lastBump || -1) < 0.1) return 0;
    e.lastBump = g.time;
    e.rig.hurt();
    dmg = Math.max(1, Math.round(dmg));
    const counts = T && (T.dojo ? e.dojo : e === T.dummy);
    if (counts) T.hits++;
    g.hud.damageNumber(this._v.set(e.pos.x, e.pos.y + 2.1, e.pos.z), dmg, o.crit ? 'crit' : (o.power ? 'power' : 'hit'), counts ? `Hit ${T.hits}!` : null, o.color);
    g.fx.burst({ pos: this._v.set(e.pos.x, e.pos.y + 1.2, e.pos.z), count: 8, spread: 0.2, velSpread: 3, up: 2, gravity: 8, life: [0.3, 0.6], size: [0.08, 0.16], color: ['#e3c46a', '#ffffff'], sprite: 'spark' });
    if (counts && T.hits >= 10) this.endTraining(true);
    return dmg;
  }
  endTraining(won, silent = false) {
    const T = this.training, g = this.game;
    this.training = null;
    if (!T) return;
    if (T.dummy) {
      if (!silent) g.fx.sparkles(T.dummy.pos.clone().setY(T.dummy.pos.y + 1.2), '#e3c46a', 30, 3);
      this.removeDummy(T.dummy);
    }
    if (silent) return;
    if (won) {
      const xp = Math.round((30 + 10 * g.state.level) * g.diff.xp);
      T.p.addXp(xp);
      this.setCool('trainer:' + T.p.index, 20);
      this.say(T.n, `Amazing! 10 hits with ${Math.ceil(T.t)} seconds left!`, 4);
      g.hud.banner('Training done!', `+${xp} XP`, '#ffd34a', 2.5);
      g.audio.play('unlock');
      g.saveNow();
    } else {
      this.setCool('trainer:' + T.p.index, 4);
      this.say(T.n, `Almost! You got ${T.hits} hits. Try again!`, 4);
      g.hud.toastFor(T.p, `Time is up: ${T.hits} of 10 hits. Talk to the Trainer to try again!`, 'info', 3);
    }
  }
  updateDummies(dt) {
    for (const d of this.dummies) { d.pos.copy(d.home); d.alive = true; d.frozenT = 0; d.rig.root.position.copy(d.home); d.rig.update(dt); }
    const T = this.training;
    if (!T) return;
    T.t -= dt;
    T.n.say = `${T.hits} / 10 hits - ${Math.max(0, Math.ceil(T.t))} s`; T.n.sayT = 1;
    if (T.t <= 0 || T.p.dead || Math.hypot(T.p.pos.x - T.n.pos.x, T.p.pos.z - T.n.pos.z) > 40) this.endTraining(false);
  }

  // ---------------------------------------------------------------- quest giver: a small side quest per world
  questTalk(n, p) {
    const g = this.game, s = g.state, id = this.wid, q = s.sideQuest;
    if (q) {
      if (q.world === id) { this.say(n, `Keep going! You beat ${q.got} of ${q.n} ${q.label}.`, 3.5); return; }
      this.say(n, `You are already on a quest in ${worldName(q.world)}. Finish that one first!`, 3.5); return;
    }
    if (id === 'home') { this.say(n, 'There are no monsters at Home Base - ask me on a planet!', 3); return; }
    const D = DIMENSIONS[id];
    const useBandits = (g.world.banditCamps || []).length && D.bandit && Math.random() < 0.35;
    let quest;
    if (useBandits) { const k = randInt(3, 5); quest = { type: 'bandit', name: D.bandit.name, n: k, label: plural(D.bandit.name) }; }
    else { const def = pick(D.enemies); const k = randInt(4, 7); quest = { type: 'monster', name: def.name, n: k, label: plural(def.name) }; }
    Object.assign(quest, { world: id, got: 0, giver: n.name, coins: 40 + 25 * D.level, xp: 40 + 30 * D.level });
    s.sideQuest = quest;
    this.wave(n);
    g.audio.play('toast');
    this.say(n, `Please beat ${quest.n} ${quest.label} for me! I will give you ${quest.coins} coins and XP.`, 5);
    g.hud.toastFor(p, `Side quest: beat ${quest.n} ${quest.label} in ${D.name}!`, 'info', 4);
    g.saveNow();
  }
  onEnemyKilled(e) {
    const g = this.game, s = g.state, q = s && s.sideQuest;
    if (!q || q.world !== this.wid) return;
    const ok = q.type === 'bandit' ? e.kind === 'bandit' : (e.kind !== 'night' && e.kind !== 'bandit' && e.def && e.def.name === q.name);
    if (!ok) return;
    q.got++;
    if (q.got < q.n) { g.hud.toast(`Side quest: ${q.got} / ${q.n} ${q.label}`, 'info', 2); return; }
    s.sideQuest = null;
    s.questsDone = (s.questsDone || 0) + 1;
    const coins = Math.round(q.coins * g.diff.coins), xp = Math.round(q.xp * g.diff.xp);
    s.coins += coins;
    g.player.addXp(xp);
    g.audio.play('unlock');
    g.hud.banner('Side quest done!', `${q.giver} says thank you: +${coins} coins, +${xp} XP`, '#ffd34a', 3.5);
    g.saveNow();
  }
  questText() {
    const s = this.game.state, q = s && s.sideQuest;
    if (!q) return '';
    return `Side quest: beat ${q.n} ${q.label} (${q.got}/${q.n})${q.world !== this.wid ? ` in ${worldName(q.world)}` : ''}`;
  }

  // ---------------------------------------------------------------- portal keeper
  zapTargets() {
    const g = this.game, L = g.world.landmarks, s = g.state, out = [];
    if (this.wid !== 'home') g.temples().forEach((t) => {
      const need = g.mode.id !== 'creative' && s.trials[this.wid][t.tier] < 3;
      const st = g.templeState(t.tier);
      out.push({ id: 't' + t.tier, label: t.name, sub: need ? 'Trials' : st === 'open' ? 'Crystal waiting!' : 'Done', pos: need && t.courtyard ? t.courtyard.pos : (t.door || t.pos), r: need && t.courtyard ? (t.courtyard.radius || 18) + 9 : 5 });
    });
    if (L.bossArena && !s.bosses[this.wid]) out.push({ id: 'boss', label: 'Boss arena', sub: DIMENSIONS[this.wid] ? DIMENSIONS[this.wid].boss.name : '', pos: L.bossArena.pos, r: (L.bossArena.radius || 22) + 9 });
    if (L.shop) out.push({ id: 'shop', label: 'Trading post', sub: 'Shop', pos: L.shop.pos, r: 5 });
    return out;
  }
  zap(dest) {
    const g = this.game, w = g.world;
    const to = this.spot(dest.pos, dest.r, dest.r + 10, 40) || this.spot(dest.pos, 3, dest.r + 20, 40) || dest.pos.clone();
    to.y = w.heightAt(to.x, to.z);
    g.players.forEach((q) => g.fx.sparkles(q.pos.clone().setY(q.pos.y + 1), '#b07aff', 40, 4));
    const P = g.player;
    P.placeAt(to, yawTo(to.x, to.z, dest.pos.x, dest.pos.z));
    if (g.players[1]) g.placeBeside(g.players[1], P);
    g.players.forEach((q) => { q.cam.snapBehind(q.yaw); g.fx.sparkles(q.pos.clone().setY(q.pos.y + 1), '#b07aff', 50, 5); });
    g.buddies.list.forEach((b) => { if (!b.waiting && !b.dead) g.buddies.placeNear(b); });
    g.pets.list.forEach((pt) => g.pets.placeNear(pt));
    this.list.forEach((n) => { if (n.escort) { n.pos.copy(n.escort.pos).add(new THREE.Vector3(1.5, 0, -1.5)); n.pos.y = w.heightAt(n.pos.x, n.pos.z); } });
    g.portalArmed = false;
    g.audio.play('portal', { pitch: 1.4, volume: 0.7 });
    g.hud.toast(`Zap! Welcome to the ${dest.label}.`, 'good', 2.5);
  }

  // ---------------------------------------------------------------- the Dojo Master: unlocks Kai as a hero
  dojoTalk(n, p) {
    const g = this.game, s = g.state, kai = CHARACTERS.findIndex((c) => c.id === 'kai');
    const Q = p.ctl.key('hero'), F = p.ctl.key('sword');
    if (kai < 0) { this.say(n, 'Hi-yah! Welcome to my dojo!', 3); return; }
    if (!s.dojo) {
      s.dojo = true;
      this.wave(n);
      this.say(n, `Welcome to my dojo, hero! Punch, kick, never give up! You can now play as me! Press ${Q} to pick heroes.`, 6);
      g.hud.banner('Kai unlocked!', `The Dojo Master is a hero now - fists and kicks, no sword needed! (${Q} picks heroes)`, '#ff5a4a', 4.5);
      g.audio.play('unlock');
      g.fx.sparkles(n.pos.clone().setY(n.pos.y + 1.4), '#ff5a4a', 60, 5);
      n.offerT = g.time + 10;
      g.saveNow();
      return;
    }
    if (p.charIndex === kai) {
      this.say(n, pick([`Press ${F} three times: jab, cross, roundhouse kick!`, `Jump, then press ${F} for a FLYING KICK!`, 'The dummies never break - hit them as much as you like!', 'A better sword from the shop makes your fists stronger too!']), 4);
      this.wave(n);
      return;
    }
    if (n.offerT && g.time < n.offerT) { n.offerT = 0; g.switchCharacter(p, kai); this.say(n, 'Hi-yah! Now YOU are the Dojo Master!', 3); return; }
    n.offerT = g.time + 8;
    this.say(n, `${pick(['Fists are fast! Kai hits super quick.', 'Jump and kick - the flying kick throws monsters up in the air!', 'Practice on my dummies - they never break!'])} Want to be the Dojo Master? Press ${p.ctl.key('use')} again!`, 6);
    this.wave(n);
  }

  // ---------------------------------------------------------------- night watch: walks with you at night with a lantern
  watchTalk(n, p) {
    const g = this.game;
    if (n.escort === p) { n.escort = null; this.say(n, 'Okay! Back to my post. Stay safe!', 3); return; }
    if (!this.isDark()) { this.say(n, 'When it gets dark, come and find me. Night creatures near my lantern get hit twice as hard!', 4.5); this.wave(n); return; }
    if (n.escort) { this.say(n, `I am already walking with Player ${n.escort.index + 1}!`, 3); return; }
    n.escort = p;
    this.wave(n);
    g.audio.play('unlock', { pitch: 1.2, volume: 0.5 });
    this.say(n, "Let's go! My lantern will light the way.", 3);
    g.hud.toastFor(p, `${n.name} walks with you! Night creatures near the lantern take double damage.`, 'good', 4);
  }
  // where player p's lantern light should be (null = no watchman with p)
  lanternFor(p) {
    for (const n of this.list) if (n.escort === p && n.lantern) return n.lantern.group.getWorldPosition(this._v);
    return null;
  }
  // night creatures near a lantern take double damage
  watchBoost(pos) {
    for (const n of this.list) if (n.escort && Math.hypot(n.escort.pos.x - pos.x, n.escort.pos.z - pos.z) < 14) return true;
    return false;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, w = g.world;
    if (!w) return;
    const players = g.players;
    const dark = this.isDark();
    this.updateDummies(dt);
    for (const n of this.list) {
      let d = 999, near = null;
      for (const p of players) { const dd = Math.hypot(p.pos.x - n.pos.x, p.pos.z - n.pos.z); if (dd < d) { d = dd; near = p; } }
      if (n.sayT > 0) { n.sayT -= dt; if (n.sayT <= 0) n.say = null; }
      if (n.escort && (!dark || !players.includes(n.escort))) { n.escort = null; this.say(n, 'Good morning! My night watch is over.', 3); }
      // far away: think less often (and stay hidden beyond 70 m)
      let ndt = dt;
      if (d > 40 && !n.escort) { n.acc += dt; if (n.acc < (d > 70 ? 0.5 : 0.2)) continue; ndt = Math.min(n.acc, 0.6); n.acc = 0; }
      n.greetT = Math.max(0, n.greetT - ndt);
      n.waveT = Math.max(0, n.waveT - ndt);
      // say hi when a player comes close
      if (near && d < 4 && n.greetT <= 0 && g.phase === 'play' && n.kind !== 'merchant') {
        n.greetT = 14 + rand(0, 6);
        if (n.role === 'roamer') { this.wave(n); this.say(n, this.lineFor(n), 3); }
        else if (n.role === 'animal') { if (Math.random() < 0.6) this.say(n, this.lineFor(n), 2); }
        else if (!(n.kind === 'trainer' && this.training)) this.say(n, pick(HELLO[n.kind] || ['Hello!']), 2.8);
      }
      let speed = 0;
      if (n.escort) speed = this.follow(n, n.escort, ndt);
      else if (n.role === 'roamer' || n.role === 'animal' || (n.kind === 'watchman' && !dark)) speed = this.wander(n, near, d, ndt);
      else {
        // helpers stand at their post, look at you, and walk back if they were pushed away
        const want = near && d < 9 ? yawTo(n.pos.x, n.pos.z, near.pos.x, near.pos.z) : n.homeYaw;
        const back = Math.hypot(n.post.x - n.pos.x, n.post.z - n.pos.z);
        if (back > 0.6 && !(near && d < 1.6)) {
          const sp = Math.min(1.4, back * 2);
          n.pos.x += (n.post.x - n.pos.x) / back * sp * ndt; n.pos.z += (n.post.z - n.pos.z) / back * sp * ndt;
          n.yaw = angleDamp(n.yaw, yawTo(n.pos.x, n.pos.z, n.post.x, n.post.z), 6, ndt);
          speed = sp;
        } else n.yaw = angleDamp(n.yaw, want, 4, ndt);
      }
      // friendly people step aside instead of blocking you
      for (const p of players) {
        const dx = n.pos.x - p.pos.x, dz = n.pos.z - p.pos.z, dd = Math.hypot(dx, dz), min = n.radius + p.radius + 0.1;
        if (dd < min && dd > 0.001) { const k = Math.min(min - dd, 4 * ndt + 0.02) / dd; n.pos.x += dx * k; n.pos.z += dz * k; }
      }
      n.pos.y = w.heightAt(n.pos.x, n.pos.z);
      if (w.liquid && w.liquid.type === 'ice') n.pos.y = Math.max(n.pos.y, w.liquid.level);
      const pose = speed > 3.2 ? 'run' : speed > 0.2 ? 'walk' : 'idle';
      if (pose !== n.pose) { n.pose = pose; n.rig.setPose(pose); }
      n.rig.setMoveSpeed(speed);
      const vis = d < 70 || !!n.escort;
      n.rig.root.visible = vis;
      if (vis) n.rig.update(ndt);
      n.rig.root.position.copy(n.pos);
      n.rig.root.rotation.y = n.yaw;
      if (n.lantern) n.lantern.glow.visible = dark;
    }
  }
  // stroll between the wander points (animals potter about close to where they are)
  wander(n, near, d, dt) {
    const g = this.game, w = g.world;
    const animal = n.role === 'animal';
    if (n.wait > 0 || (!animal && near && d < 3.2)) {
      n.wait -= dt;
      if (!animal && near && d < 6) n.yaw = angleDamp(n.yaw, yawTo(n.pos.x, n.pos.z, near.pos.x, near.pos.z), 3, dt);
      else if (Math.random() < dt * 0.4) n.lookYaw = n.yaw + rand(-1.2, 1.2);
      if (n.lookYaw != null && !(near && d < 6 && !animal)) n.yaw = angleDamp(n.yaw, n.lookYaw, 2, dt);
      return 0;
    }
    const tx = n.target.x - n.pos.x, tz = n.target.z - n.pos.z, td = Math.hypot(tx, tz);
    if (td < 0.6) {
      n.lookYaw = null;
      if (animal) {
        n.wait = rand(1, n.kind === 'chicken' ? 3 : 5);
        // a curious dog trots over to a player now and then
        const c = n.kind === 'dog' && near && d < 12 && Math.random() < 0.5 ? near.pos : null;
        const t = c ? this.spot(c, 1.5, 2.5, 6) : this.spot(n.post, 0, n.kind === 'deer' ? 12 : 7, 6);
        if (t) n.target.copy(t);
      } else {
        n.wait = rand(2, 7);
        const b = this.wanderPts.length ? pick(this.wanderPts) : n.pos;
        const t = this.spot(n.kind === 'watchman' ? n.post : b, 0, 7, 6);
        if (t) n.target.copy(t);
      }
      return 0;
    }
    const sp = animal ? (ANIMAL_SPEED[n.kind] || 1.5) : 1.4;
    n.pos.x += tx / td * sp * dt; n.pos.z += tz / td * sp * dt;
    if (g.colliders) g.colliders.resolve(n.pos, 0.35);
    n.yaw = angleDamp(n.yaw, Math.atan2(tx, tz), 5, dt);
    if (w.liquid && w.liquid.type !== 'ice' && w.heightAt(n.pos.x, n.pos.z) < w.liquid.level) { n.pos.x -= tx / td * sp * dt * 2; n.pos.z -= tz / td * sp * dt * 2; n.wait = 1; n.target.copy(n.post); }
    return sp;
  }
  // walk next to a player (the Night Watch)
  follow(n, o, dt) {
    const g = this.game;
    const tx = o.pos.x - Math.cos(o.yaw) * 1.8 - Math.sin(o.yaw) * 1.2, tz = o.pos.z + Math.sin(o.yaw) * 1.8 - Math.cos(o.yaw) * 1.2;
    const dx = tx - n.pos.x, dz = tz - n.pos.z, d = Math.hypot(dx, dz);
    if (d > 35) { n.pos.set(tx, 0, tz); return 0; }
    if (d < 0.8) { n.yaw = angleDamp(n.yaw, o.yaw, 4, dt); return 0; }
    const sp = Math.min(7.5, d * 2.2);
    n.pos.x += dx / d * sp * dt; n.pos.z += dz / d * sp * dt;
    if (g.colliders) g.colliders.resolve(n.pos, 0.35);
    n.yaw = angleDamp(n.yaw, Math.atan2(dx, dz), 8, dt);
    return sp;
  }
}

// ================================================================ buddies: friendly fighters that come with you
const BUDDY = {
  knight: { hp: [140, 45], dmg: [10, 6], take: 0.5 },
  archer: { hp: [100, 35], dmg: [8, 5], take: 0.7, range: 8 },
  mage: { hp: [100, 35], dmg: [9, 6], take: 0.7, range: 7 },
};
export class Buddies {
  constructor(game) { this.game = game; this.list = []; this._v = new THREE.Vector3(); }
  of(p) { return this.list.find((b) => b.owner === p) || null; }
  level() { const id = this.game.worldId; return id === 'home' ? 1 : DIMENSIONS[id].level; }
  // is the buddy from this post away with someone?
  taken(worldId, slot) { return this.list.some((b) => b.homeWorld === worldId && b.slot === slot); }

  make(owner, { kind = 'knight', name, seed, outfit, homeWorld, slot = -1 }) {
    const g = this.game;
    if (!BUDDY[kind]) kind = 'knight';
    const rig = makePerson(g, (FRIENDLY_NPCS[kind] || FRIENDLY_NPCS.knight).model, outfit || LOOK[kind], seed, g.settings.quality, kind);
    rig.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.scene.add(rig.root);
    const b = {
      owner, rig, kind, name: `Buddy ${name}`, short: name, seed, outfit: outfit || LOOK[kind], homeWorld, slot, pos: owner.pos.clone(), yaw: owner.yaw, vel: new THREE.Vector3(),
      hp: 1, maxHp: 1, dead: false, restT: 0, waiting: false, attack: null, cd: 0, combo: 0, pose: '', radius: 0.42, height: rig.height || 1.8,
      sleeping: false, fadeT: 0, say: null, sayT: 0, tagged: true,
      stat: (k, d = 1) => d,
      hurt: (amt, from, o = {}) => this.hurt(b, amt, from, o),
    };
    this.gear(b);
    this.list.push(b);
    this.placeNear(b);
    return b;
  }
  gear(b) {
    const L = this.level(), K = BUDDY[b.kind];
    b.maxHp = Math.round(K.hp[0] + K.hp[1] * L); b.hp = b.maxHp;
    b.dmg = K.dmg[0] + K.dmg[1] * L;
    if (b.kind === 'knight') { b.rig.setSword(SWORDS[clamp(1 + Math.floor(L * 0.7), 1, 6)]); b.rig.setArmor(ARMORS[clamp(1 + Math.floor(L / 3), 1, 4)]); }
  }
  recruit(p, post) {
    const g = this.game;
    const old = this.of(p);
    if (old) this.dismiss(old, 'Okay! Have fun with your new buddy!');
    const b = this.make(p, { kind: post.kind, name: post.first || post.name.split(' ')[0], seed: 900 + Math.floor(Math.random() * 999), outfit: LOOK[post.kind], homeWorld: g.worldId, slot: post.slot });
    b.pos.copy(post.pos); b.rig.root.position.copy(b.pos);
    g.npcs.remove(post);
    g.fx.sparkles(b.pos.clone().setY(b.pos.y + 1), '#7af0ff', 30, 3);
    g.audio.play('unlock', { pitch: 1.3, volume: 0.6 });
    g.hud.toastFor(p, `${b.name} the ${titleOf(b.kind)} joined you! Press ${p.ctl.key('use')} next to ${b.short} to talk.`, 'good', 3.5);
    this.say(b, b.kind === 'archer' ? 'My bow is ready!' : b.kind === 'mage' ? 'Magic time!' : 'Right behind you!', 2.5);
    g.saveNow();
  }
  // "go home": the buddy leaves (and is back at their post if that is in this world)
  dismiss(b, text = 'Bye bye! See you soon!') {
    const g = this.game;
    const i = this.list.indexOf(b);
    if (i < 0) return;
    this.list.splice(i, 1);
    g.fx.sparkles(b.pos.clone().setY(b.pos.y + 1), '#7af0ff', 30, 3);
    g.scene.remove(b.rig.root); b.rig.dispose();
    g.hud.toastFor(b.owner, `${b.name}: "${text}"`, 'info', 3);
    if (b.homeWorld === g.worldId && b.slot >= 0) g.npcs.restorePost(b.slot);
    g.saveNow();
  }
  say(b, text, dur = 3) { b.say = text; b.sayT = dur; }
  placeNear(b) {
    const g = this.game, o = b.owner, w = g.world;
    if (!w) return;
    const side = new THREE.Vector3(Math.cos(o.yaw), 0, -Math.sin(o.yaw));
    b.pos.copy(o.pos).addScaledVector(side, 1.8).addScaledVector(new THREE.Vector3(Math.sin(o.yaw), 0, Math.cos(o.yaw)), -1.5);
    if (g.colliders) g.colliders.resolve(b.pos, b.radius);
    b.pos.y = w.heightAt(b.pos.x, b.pos.z);
    b.rig.root.position.copy(b.pos);
    b.rig.root.visible = !b.dead;
  }
  // before travelling: a buddy who was told to wait goes home
  beforeTravel() { [...this.list].forEach((b) => { if (b.waiting) this.dismiss(b, 'I waited, but now I am going home!'); }); }
  // after travelling: following buddies come along
  onWorldChanged() {
    [...this.list].forEach((b) => {
      if (b.waiting) { this.dismiss(b, 'I waited, but now I am going home!'); return; }
      this.gear(b);
      if (!b.dead) this.placeNear(b);
    });
  }
  clearAll() { this.list.forEach((b) => { this.game.scene.remove(b.rig.root); b.rig.dispose(); }); this.list.length = 0; }
  // from a save: [{ kind, name, seed, outfit, homeWorld, slot } | null, ...] by player index
  load(saved) {
    this.clearAll();
    (saved || []).forEach((s, i) => { const p = this.game.players[i]; if (s && p) this.make(p, { ...s, kind: s.kind || 'knight', slot: s.slot ?? -1 }); });
  }
  serialize() {
    return this.game.players.map((p) => { const b = this.of(p); return b && !b.waiting ? { kind: b.kind, name: b.short, seed: b.seed, outfit: b.outfit, homeWorld: b.homeWorld, slot: b.slot } : null; });
  }

  hurt(b, amt, from) {
    const g = this.game;
    if (b.dead || g.paused) return 0;
    const dmg = Math.max(1, Math.round(amt * BUDDY[b.kind].take));
    b.hp -= dmg;
    b.rig.hurt();
    g.hud.damageNumber(b.pos.clone().setY(b.pos.y + b.height + 0.2), dmg, 'player');
    if (b.kind === 'knight' && Math.random() < 0.3) g.fx.hitSparks(this._v.set(b.pos.x, b.pos.y + 1.1, b.pos.z), '#c8d4e0', false);
    if (from) { const dx = b.pos.x - from.x, dz = b.pos.z - from.z, d = Math.hypot(dx, dz) || 1; b.vel.x += dx / d * 3; b.vel.z += dz / d * 3; }
    if (b.hp <= 0) {
      // knocked out: they fade away to rest, and are back at your side after 30 s
      b.hp = 0; b.dead = true; b.restT = 30; b.attack = null;
      g.fx.sparkles(b.pos.clone().setY(b.pos.y + 1), '#ffffff', 40, 3);
      g.fx.burst({ pos: b.pos.clone().setY(b.pos.y + 1), count: 16, blend: 'normal', spread: 0.6, up: 1, life: [0.6, 1], size: [0.6, 1], sizeEnd: 1.6, alpha: 0.5, color: '#c8d8ff', sprite: 'smoke' });
      b.rig.root.visible = false;
      g.hud.toastFor(b.owner, `${b.name} needs a rest - back in 30 seconds!`, 'warn', 3);
    }
    return dmg;
  }

  target(b, range = 12) {
    const g = this.game, o = b.owner;
    let best = null, bd = range;
    for (const e of g.enemies.targets()) {
      if (e.isDummy) continue;
      const d = Math.hypot(e.pos.x - b.pos.x, e.pos.z - b.pos.z) - e.radius;
      if (Math.hypot(e.pos.x - o.pos.x, e.pos.z - o.pos.z) > 20) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  boltColor() { const id = this.game.worldId; return id === 'home' ? '#8fd0ff' : POWERS[id].color; }
  // archer arrows and mage bolts fly to the target (and gently home in on it)
  shoot(b, e) {
    const g = this.game, mage = b.kind === 'mage';
    const from = new THREE.Vector3(b.pos.x + Math.sin(b.yaw) * 0.5, b.pos.y + 1.4, b.pos.z + Math.cos(b.yaw) * 0.5);
    const aim = () => new THREE.Vector3(e.pos.x, e.pos.y + (e.height || 1.5) * 0.55, e.pos.z);
    const sp = mage ? 20 : 30, color = mage ? this.boltColor() : '#f0e0b0';
    const vel = aim().sub(from).normalize().multiplyScalar(sp);
    const dmg = b.dmg * (mage ? 1.05 : 0.9) * rand(0.9, 1.1);
    const o = {
      pos: from, vel, life: 2.5, color, groundGrace: 0.35,
      hit: (pr) => e.alive && Math.hypot(pr.pos.x - e.pos.x, pr.pos.z - e.pos.z) < e.radius + 0.6 && Math.abs(pr.pos.y - (e.pos.y + (e.height || 1.5) * 0.5)) < (e.height || 1.5) * 0.7 + 0.5,
      onHit: (pr, kind) => {
        if (kind !== 'target' || !e.alive) return;
        g.enemies.hit(e, dmg, { source: 'buddy', by: b.owner, knock: mage ? 2 : 1.2, from: b.pos, color: mage ? color : '#ffe9a8', power: mage && g.worldId !== 'home' ? POWERS[g.worldId].id : undefined });
        g.fx.hitSparks(pr.pos, color, mage);
      },
      onUpdate: (pr, dt) => { if (e.alive) pr.vel.lerp(aim().sub(pr.pos).normalize().multiplyScalar(sp), Math.min(1, dt * 5)); },
    };
    if (mage) Object.assign(o, { size: 0.75, trail: { color: [color, '#ffffff'], count: 2 } });
    else Object.assign(o, { mesh: arrowMesh(), noSprite: true });
    g.fx.projectile(o);
    g.audio.play(mage ? 'zap' : 'swing', { volume: 0.35, pitch: mage ? 1.3 : 1.6 });
  }

  update(dt) {
    const g = this.game, w = g.world;
    if (!w) return;
    for (const b of this.list) {
      const o = b.owner, K = BUDDY[b.kind];
      b.sayT = Math.max(0, b.sayT - dt); if (b.sayT <= 0) b.say = null;
      if (b.dead) {
        b.restT -= dt;
        if (b.restT <= 0) { b.dead = false; b.hp = b.maxHp; this.placeNear(b); g.fx.sparkles(b.pos.clone().setY(b.pos.y + 1), '#7af0ff', 30, 3); this.say(b, "I'm back!", 2); g.hud.toastFor(o, `${b.name} is back!`, 'good', 2); }
        continue;
      }
      b.cd -= dt;
      const ranged = !!K.range;
      const e = b.waiting ? null : this.target(b, ranged ? 16 : 12);
      let tx, tz, spd = 0, stand = false;
      if (e) { tx = e.pos.x; tz = e.pos.z; }
      else if (b.waiting) { tx = b.pos.x; tz = b.pos.z; }
      else { tx = o.pos.x + Math.cos(o.yaw) * 1.8 - Math.sin(o.yaw) * 1.6; tz = o.pos.z - Math.sin(o.yaw) * 1.8 - Math.cos(o.yaw) * 1.6; }
      let dx = tx - b.pos.x, dz = tz - b.pos.z, d = Math.hypot(dx, dz);
      const reach = e ? (ranged ? K.range + 3 : e.radius + 1.6) : 0;
      if (b.attack) {
        b.attack.t += dt;
        if (!b.attack.done && b.attack.t >= b.attack.hit) {
          b.attack.done = true;
          const t = b.attack.e;
          if (ranged) { if (t && t.alive) this.shoot(b, t); }
          else if (t && t.alive && Math.hypot(t.pos.x - b.pos.x, t.pos.z - b.pos.z) < t.radius + 2.6) {
            g.enemies.hit(t, b.dmg * rand(0.9, 1.1), { source: 'buddy', by: o, knock: 3, from: b.pos, color: '#9fe8ff' });
            g.fx.hitSparks(this._v.set(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z), '#9fe8ff', b.attack.combo === 2);
            g.audio.play('hit', { volume: 0.4, pitch: 1.15 });
          }
        }
        if (b.attack.t >= b.attack.dur) b.attack = null;
        if (b.attack && b.attack.e && b.attack.e.alive) b.yaw = angleDamp(b.yaw, yawTo(b.pos.x, b.pos.z, b.attack.e.pos.x, b.attack.e.pos.z), 10, dt);
      } else if (e && d < reach) {
        if (ranged && d < K.range - 3) {
          // too close: step back a little, then shoot
          tx = b.pos.x - dx; tz = b.pos.z - dz; dx = -dx; dz = -dz; spd = 3.5; stand = true;
        }
        b.yaw = angleDamp(b.yaw, Math.atan2(e.pos.x - b.pos.x, e.pos.z - b.pos.z), 10, dt);
        if (b.cd <= 0 && !stand) {
          let r;
          if (ranged) r = b.rig.cast(b.kind === 'mage' ? (g.worldId === 'home' ? 'lightning' : POWERS[g.worldId].id) : 'lightning');
          else { b.combo = (b.combo + 1) % 3; r = b.rig.attack(b.combo); }
          const hitAt = ranged ? (r.releaseTime ?? r.hitTime) : r.hitTime;
          b.attack = { t: 0, dur: Math.max(0.35, r.duration), hit: clamp(hitAt, 0.12, 0.55), done: false, e, combo: b.combo };
          b.cd = ranged ? (b.kind === 'archer' ? 1.25 : 1.6) : 0.9;
          if (!ranged) g.audio.play('swing', { volume: 0.35, pitch: 1.1 });
        }
      } else if (!b.waiting && d > (e ? reach * 0.9 : 1.0)) {
        spd = Math.min(e ? 6.5 : 7.5, d * 2.5);
        if (!e && d > 30) this.placeNear(b);   // fell far behind: catch up
      }
      if (spd > 0 && d > 0.01) { b.vel.x += (dx / d * spd - b.vel.x) * Math.min(1, dt * 8); b.vel.z += (dz / d * spd - b.vel.z) * Math.min(1, dt * 8); if (!stand) b.yaw = angleDamp(b.yaw, Math.atan2(dx, dz), 8, dt); }
      else b.vel.multiplyScalar(Math.exp(-dt * 8));
      b.pos.x += b.vel.x * dt; b.pos.z += b.vel.z * dt;
      if (g.colliders) g.colliders.resolve(b.pos, b.radius);
      g.resolveWalls(b.pos, b.radius);
      let gy = w.heightAt(b.pos.x, b.pos.z);
      if (w.liquid && w.liquid.type === 'ice') gy = Math.max(gy, w.liquid.level);
      if (w.liquid && w.liquid.type === 'water' && gy < w.liquid.level - 1.2) gy = w.liquid.level - 1.2;
      b.pos.y += (gy - b.pos.y) * Math.min(1, dt * 15);
      if (!b.waiting && !e) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.02 * dt);
      const hs = Math.hypot(b.vel.x, b.vel.z);
      const pose = hs > 4 ? 'run' : hs > 0.4 ? 'walk' : 'idle';
      if (pose !== b.pose) { b.pose = pose; b.rig.setPose(pose); }
      b.rig.setMoveSpeed(hs);
      b.rig.update(dt);
      b.rig.root.visible = true;
      b.rig.root.position.copy(b.pos);
      b.rig.root.rotation.y = b.yaw;
      // a soft friendly glow so kids can tell buddies from bandits
      if (Math.random() < dt * 3) g.fx.burst({ pos: this._v.set(b.pos.x, b.pos.y + b.height + 0.25, b.pos.z), count: 1, up: 0.5, life: [0.4, 0.7], size: [0.15, 0.28], color: ['#7af0ff', '#ffffff'], sprite: 'spark' });
    }
  }
}

// ================================================================ pets from the Animal Tamer
export class Pets {
  constructor(game) { this.game = game; this.list = []; this._v = new THREE.Vector3(); }
  of(p) { return this.list.find((x) => x.owner === p) || null; }
  give(p, kind) {
    const g = this.game;
    const old = this.of(p);
    if (old) this.remove(old);
    const names = PET_NAMES[kind] || ['Buddy'];
    const used = new Set(this.list.map((x) => x.short));
    const name = names.find((nm) => !used.has(nm)) || names[0];
    const pet = this.make(p, { kind, name });
    g.fx.sparkles(pet.pos.clone().setY(pet.pos.y + 0.6), '#ff6a9a', 30, 3);
    g.audio.play('unlock', { pitch: 1.6, volume: 0.6 });
    g.hud.toastFor(p, `${name} the ${kind} is your pet now! ${name} follows you everywhere and picks up coins for you.`, 'good', 4);
    this.say(pet, (ANIMAL_SAYS[kind] || ['!'])[0], 2);
    g.saveNow();
  }
  make(owner, { kind, name }) {
    const g = this.game;
    const rig = createCritter(kind, { seed: 77 + owner.index * 31 + kind.length, quality: 'low' });
    g.scene.add(rig.root);
    const x = { owner, kind, name, short: name, rig, pos: owner.pos.clone(), yaw: owner.yaw, pose: '', radius: 0.3, height: rig.height || 0.6, say: null, sayT: 0, tagged: true, coin: null, happyT: 0 };
    this.list.push(x);
    this.placeNear(x);
    return x;
  }
  remove(x) { const i = this.list.indexOf(x); if (i >= 0) this.list.splice(i, 1); this.game.scene.remove(x.rig.root); x.rig.dispose(); }
  say(x, text, dur = 2) { x.say = text; x.sayT = dur; }
  pat(x) {
    const g = this.game;
    x.rig.attack(); x.happyT = 1;
    this.say(x, pick(ANIMAL_SAYS[x.kind] || ['!']), 2);
    g.fx.burst({ pos: x.pos.clone().setY(x.pos.y + x.height + 0.2), count: 5, spread: 0.3, up: 1.2, life: [0.6, 1], size: [0.25, 0.4], color: ['#ff6a9a', '#ffb0c8'], sprite: 'spark' });
    g.audio.play('click', { pitch: 1.8, volume: 0.5 });
  }
  placeNear(x) {
    const g = this.game, o = x.owner, w = g.world;
    if (!w) return;
    x.pos.set(o.pos.x - Math.cos(o.yaw) * 1.2 - Math.sin(o.yaw) * 1.2, 0, o.pos.z + Math.sin(o.yaw) * 1.2 - Math.cos(o.yaw) * 1.2);
    if (g.colliders) g.colliders.resolve(x.pos, x.radius);
    x.pos.y = w.heightAt(x.pos.x, x.pos.z);
    x.rig.root.position.copy(x.pos);
    x.coin = null;
  }
  onWorldChanged() { this.list.forEach((x) => this.placeNear(x)); }
  clearAll() { [...this.list].forEach((x) => this.remove(x)); }
  load(saved) { this.clearAll(); (saved || []).forEach((s, i) => { const p = this.game.players[i]; if (s && p && PET_NAMES[s.kind]) this.make(p, s); }); }
  serialize() { return this.game.players.map((p) => { const x = this.of(p); return x ? { kind: x.kind, name: x.short } : null; }); }

  update(dt) {
    const g = this.game, w = g.world;
    if (!w) return;
    const pk = g.fx.pickups;
    for (const x of this.list) {
      const o = x.owner;
      x.sayT = Math.max(0, x.sayT - dt); if (x.sayT <= 0) x.say = null;
      x.happyT = Math.max(0, x.happyT - dt);
      // fetch coins lying near the owner
      if (x.coin && (!pk.includes(x.coin) || x.coin.magnet)) x.coin = null;
      if (!x.coin) {
        let best = null, bd = 12;
        for (const c of pk) {
          if (c.type !== 'coin' || c.magnet || c.t < 0.6) continue;
          if (Math.hypot(c.pos.x - o.pos.x, c.pos.z - o.pos.z) > 16) continue;
          const d = Math.hypot(c.pos.x - x.pos.x, c.pos.z - x.pos.z);
          if (d < bd) { bd = d; best = c; }
        }
        x.coin = best;
      }
      let tx, tz, fast = false;
      if (x.coin) { tx = x.coin.pos.x; tz = x.coin.pos.z; fast = true; }
      else { tx = o.pos.x - Math.cos(o.yaw) * 1.2 - Math.sin(o.yaw) * 1.4; tz = o.pos.z + Math.sin(o.yaw) * 1.2 - Math.cos(o.yaw) * 1.4; }
      const dx = tx - x.pos.x, dz = tz - x.pos.z, d = Math.hypot(dx, dz);
      let sp = 0;
      if (x.coin && d < 0.7) {
        const i = pk.indexOf(x.coin);
        if (i >= 0) { pk.splice(i, 1); g.collectPickup(x.coin, o); g.fx.sparkles(x.pos.clone().setY(x.pos.y + 0.5), '#ffcc33', 8, 2); }
        x.coin = null;
      } else if (d > 30) this.placeNear(x);
      else if (d > (x.coin ? 0.1 : 0.9)) {
        sp = Math.min(fast ? 8 : 7.5, d * 2.6);
        x.pos.x += dx / d * sp * dt; x.pos.z += dz / d * sp * dt;
        x.yaw = angleDamp(x.yaw, Math.atan2(dx, dz), 9, dt);
      } else x.yaw = angleDamp(x.yaw, yawTo(x.pos.x, x.pos.z, o.pos.x, o.pos.z), 3, dt);
      if (g.colliders) g.colliders.resolve(x.pos, x.radius);
      let gy = w.heightAt(x.pos.x, x.pos.z);
      if (w.liquid && w.liquid.type === 'ice') gy = Math.max(gy, w.liquid.level);
      x.pos.y += (gy - x.pos.y) * Math.min(1, dt * 15);
      const pose = sp > 3.5 ? 'run' : sp > 0.3 ? 'walk' : 'idle';
      if (pose !== x.pose) { x.pose = pose; x.rig.setPose(pose); }
      x.rig.setMoveSpeed(sp);
      x.rig.update(dt);
      x.rig.root.position.copy(x.pos);
      x.rig.root.rotation.y = x.yaw;
    }
  }
}

export { POWERS };
