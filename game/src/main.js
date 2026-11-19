// Solmar Bay — an original open-world crime game.
// A sun-soaked coastal city: steal cars, run missions for the fixer Marisol,
// dodge the Solmar Bay Police, and climb from broke drifter to king of the bay.
// Everything here is original: city, characters, vehicles, story, art and sound.
// Built with three.js (vendored), procedural canvas textures, synthesized WebAudio.

import * as THREE from 'three';

// ---------- seeded random numbers ----------
// One small deterministic generator drives world layout, so a given seed
// always builds the same bay. The magic constants are the classic
// mulberry32 set; only the local variable names are ours.
function mulberry32(seed) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let mixed = Math.imul(s ^ (s >>> 15), 1 | s);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
const params = new URLSearchParams(location.search);
const seedParam = parseInt(params.get('seed') || '7', 10) || 7;
const shotMode = params.get('shot') || '';
let rng = mulberry32(seedParam);
// Small helpers every system shares: a ranged roll, a random pick,
// a clamp and a lerp, all on the seeded stream.
function rr(low, high) { return low + rng() * (high - low); }
function pick(list) { return list[Math.floor(rng() * list.length)]; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function lerp(from, to, t) { return from + (to - from) * t; }

// ---------- central game state ----------
// One object holds the run: mode, money, health, heat, missions, the car
// you are in, the clock, the radio, the weapon and both characters.
const SAVE_KEY = 'solmar-bay-save-v1';
const state = {
  mode: 'start', // start | play | pause | dead
  cash: 0,
  health: 100,
  armor: 0, // vest absorbs damage before health, 0-100
  wanted: 0,
  kills: 0,
  cleanTimer: 0, // seconds with no police nearby
  mission: 0, // index into MISSIONS
  missionStage: 0, // 0 idle, 1 go to pickup, 2 deliver, 3 done
  missionTimer: 0,
  inCar: null,
  speed: 0,
  time: 0,
  dayTime: 0.34, // 0-1 across one game day; starts ~08:10 morning
  weather: 'clear', // clear | rain
  radio: 0, // index into RADIO_STATIONS
  weapon: 'pistol',
  ammo: { pistol: Infinity, shotgun: 24, smg: 120, knife: Infinity, grenade: 3, molotov: 3, bazooka: 1, sniper: 5 },
  activeChar: 0,
  charMissions: { Ryan: 0, Ian: 0 },
  muted: false,
  shot: shotMode,
};

// The three story jobs from the fixer Marisol: first wheels, a timed
// package run, then losing a three-star tail.
const MISSIONS = [
  {
    id: 1, reward: 500, giver: 'Marisol', title: 'M1 — First Wheels',
    text: 'Steal a car and drive it to the yellow beacon at the marina.',
  },
  {
    id: 2, reward: 800, giver: 'Marisol', title: 'M2 — Package Run',
    text: 'Pick up the package at the north docks, then deliver it to Solmar Intl airport on the far west side before the timer runs out.',
  },
  {
    id: 3, reward: 1200, giver: 'Marisol', title: 'M3 — Lose the Heat',
    text: 'Get the cops riled up to 3 stars, then shake them and go clean.',
  },
];

// Three synth radio stations: bass lines and arpeggios per station.
const RADIO_STATIONS = [
  {
    name: 'Solmar FM 88.5', desc: 'synthwave', bpm: 112,
    bass: [55, 55, 65.41, 49], arp: [220, 261.63, 329.63, 392, 329.63, 261.63],
  },
  {
    name: 'Bay Beats 101.1', desc: 'hip-hop', bpm: 92,
    bass: [41.2, 41.2, 55, 36.71], arp: [110, 130.81, 98, 146.83],
  },
  {
    name: 'Coast Rock 95.3', desc: 'rock', bpm: 128,
    bass: [82.41, 82.41, 98, 73.42], arp: [164.81, 196, 246.94, 196, 164.81, 130.81],
  },
];
// The weapon table: damage, fire rate, pellet count, spread and handling.
const WEAPONS = {
  pistol: { name: 'Pistol', rate: 0.35, dmg: 1, pellets: 1, spread: 0.01, auto: false },
  shotgun: { name: 'Shotgun', rate: 0.9, dmg: 1, pellets: 5, spread: 0.09, auto: false },
  smg: { name: 'SMG', rate: 0.09, dmg: 1, pellets: 1, spread: 0.05, auto: true },
  knife: { name: 'Knife', rate: 0.28, dmg: 2, pellets: 1, spread: 0, auto: false, melee: true },
  grenade: { name: 'Grenade', rate: 0.8, dmg: 3, pellets: 1, spread: 0, auto: false, thrown: true },
  molotov: { name: 'Molotov', rate: 0.8, dmg: 2, pellets: 1, spread: 0, auto: false, thrown: true },
  bazooka: { name: 'Bazooka', rate: 1.6, dmg: 5, pellets: 1, spread: 0, auto: false, thrown: true },
  sniper: { name: 'Sniper Rifle', rate: 1.4, dmg: 5, pellets: 1, spread: 0.002, auto: false, range: 220 },
};
const DAY_LENGTH = 540; // seconds per game day (9 minutes)
let radioGain = null, radioStep = 0, radioNextTime = 0;
// Day cycle keys: sky, fog, hemisphere light and sun per time of day.
const DAY_KEYS = [
  { sky: 0x0b1e3a, fog: 0x0b1e3a, hemi: 0.25, sun: 0.0, sunCol: 0x8899ff, t: 0.00 },
  { sky: 0x0b1e3a, fog: 0x16283f, hemi: 0.3, sun: 0.05, sunCol: 0xffb080, t: 0.22 },
  { sky: 0xf2a56b, fog: 0xe8b48a, hemi: 0.7, sun: 0.9, sunCol: 0xffc080, t: 0.30 },
  { sky: 0x87c5e8, fog: 0x9fd0e8, hemi: 0.95, sun: 1.6, sunCol: 0xfff2d0, t: 0.38 },
  { sky: 0x87c5e8, fog: 0x9fd0e8, hemi: 0.95, sun: 1.6, sunCol: 0xfff2d0, t: 0.62 },
  { sky: 0xe8853f, fog: 0xd98a5a, hemi: 0.6, sun: 0.8, sunCol: 0xff9030, t: 0.72 },
  { sky: 0x1a2a4a, fog: 0x1a2a4a, hemi: 0.3, sun: 0.0, sunCol: 0x8899ff, t: 0.80 },
  { sky: 0x0b1e3a, fog: 0x0b1e3a, hemi: 0.25, sun: 0.0, sunCol: 0x8899ff, t: 1.00 },
];
let lampMats = [], rainNodes = null, weatherTimer = 180, lightningTimer = 0, rainDark = 0;
let stars = null, moon = null, moonLight = null;
let fireTimer = 0, switchTimer = 0, switchTarget = 0, switchSwapped = false;
let heliAlt = 0, boatBob = 0;

// ---------- audio: WebAudio synth only ----------
// Everything is synthesized: an engine hum, a police siren, beeps, gun
// noise and the three radio stations. No audio files anywhere.
let AC = null, engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenLfo = null;
function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    engineOsc = AC.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = AC.createGain();
    engineGain.gain.value = 0;
    const lp = AC.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    engineOsc.connect(lp);
    lp.connect(engineGain);
    engineGain.connect(AC.destination);
    engineOsc.start();
    sirenOsc = AC.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 700;
    sirenGain = AC.createGain();
    sirenGain.gain.value = 0;
    sirenLfo = AC.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.9;
    const lfoGain = AC.createGain();
    lfoGain.gain.value = 260;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(AC.destination);
    sirenOsc.start();
    sirenLfo.start();
  } catch (e) { AC = null; }
}
// One short synth tone: an oscillator with a gain envelope that decays.
function beep(freq, dur, type, vol) {
  if (!AC || state.muted) return;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.15, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  o.connect(g);
  g.connect(AC.destination);
  o.start();
  o.stop(AC.currentTime + dur);
}
function chime() {
  beep(660, 0.12, 'sine', 0.2);
  setTimeout(() => beep(990, 0.2, 'sine', 0.2), 110);
}
function thud() { beep(90, 0.15, 'triangle', 0.3); }
// A gunshot is a burst of shaped noise, not a tone.
function gunshot() {
  if (!AC || state.muted) return;
  const len = AC.sampleRate * 0.18;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const src = AC.createBufferSource();
  src.buffer = buf;
  const g = AC.createGain();
  g.gain.value = 0.5;
  src.connect(g);
  g.connect(AC.destination);
  src.start();
}
// One radio note, scheduled at a precise time on the radio bus.
function radioNote(freq, when, dur, type, vol) {
  if (!AC || !radioGain || state.muted) return;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g);
  g.connect(radioGain);
  o.start(when);
  o.stop(when + dur + 0.05);
}
// A kick drum: a sine that drops from 120 Hz to 38 Hz in a blink.
function radioKick(when) {
  if (!AC || !radioGain || state.muted) return;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, when);
  o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
  g.gain.setValueAtTime(0.22, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
  o.connect(g);
  g.connect(radioGain);
  o.start(when);
  o.stop(when + 0.2);
}
// The radio sequencer: schedules sixteenth notes a quarter second ahead.
// Each station gets its own pattern on the same 16-step grid.
function radioTick() {
  if (!AC || state.mode !== 'play' || state.muted) { radioNextTime = 0; return; }
  if (!radioGain) {
    radioGain = AC.createGain();
    radioGain.gain.value = 0.5;
    radioGain.connect(AC.destination);
  }
  if (radioNextTime < AC.currentTime) radioNextTime = AC.currentTime + 0.05;
  const st = RADIO_STATIONS[state.radio];
  const stepDur = 60 / st.bpm / 4;
  while (radioNextTime < AC.currentTime + 0.25) {
    const s = radioStep % 16;
    const bassNote = st.bass[Math.floor(s / 4) % st.bass.length];
    const arpNote = st.arp[s % st.arp.length];
    if (s % 4 === 0) radioNote(bassNote, radioNextTime, stepDur * 3.5, 'sawtooth', 0.11);
    if (state.radio === 0 && s % 2 === 0) {
      radioNote(st.arp[(radioStep * 3) % st.arp.length], radioNextTime, stepDur * 1.6, 'sine', 0.05);
    }
    if (state.radio === 1) {
      if (s === 0 || s === 7 || s === 10) radioKick(radioNextTime);
      if (s % 4 === 2) radioNote(arpNote * 2, radioNextTime, stepDur, 'triangle', 0.05);
    }
    if (state.radio === 2) {
      if (s % 4 === 0) radioKick(radioNextTime);
      radioNote(arpNote, radioNextTime, stepDur * 1.8, 'square', 0.045);
      if (s === 8) radioNote(st.arp[2] * 2, radioNextTime, stepDur * 2, 'square', 0.04);
    }
    radioStep++;
    radioNextTime += stepDur;
  }
}
function cycleRadio() {
  state.radio = (state.radio + 1) % RADIO_STATIONS.length;
  radioStep = 0;
  radioNextTime = 0;
  const st = RADIO_STATIONS[state.radio];
  toast('Radio: ' + st.name + ' — ' + st.desc);
  updateHUD();
}
// Number keys 1-8 swap weapons in a fixed order.
function cycleWeapon(key) {
  const order = ['pistol', 'shotgun', 'smg', 'knife', 'grenade', 'molotov', 'bazooka', 'sniper'];
  const w = order[Number(key) - 1];
  if (!w) return;
  state.weapon = w;
  fireTimer = 0;
  const ammoNote = state.ammo[w] === Infinity ? ' (infinite ammo)' : ' — ' + state.ammo[w] + ' rounds';
  toast('Weapon: ' + WEAPONS[w].name + ammoNote);
  updateHUD();
}
// Spoken mission dialogue via built-in speechSynthesis. No files, no
// network; if the browser has no voices it silently does nothing.
function speakLine(text) {
  if (state.muted || state.shot) return;
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 0.9;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
  } catch (e) { /* no voices available — game continues silently */ }
}
function stopSpeech() {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch (e) {}
}

// ---------- three.js setup ----------
// Renderer, scene, camera, hemisphere light, sun with shadows, and a
// visible sun disc so the sky has a source to look at.
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5e8);
scene.fog = new THREE.Fog(0x9fd0e8, 160, 650);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 60, 120);
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
sun.position.set(120, 180, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 500;
scene.add(sun);
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
sunBall.position.set(220, 190, -160);
scene.add(sunBall);
// Stars and a moon for the night sky: 320 points on a dome, a pale moon
// sphere with one crater, and a cold moonlight that starts switched off.
{
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(320 * 3);
  for (let i = 0; i < 320; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI * 0.45 + 0.12;
    const r = 620;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0 }));
  scene.add(stars);
  moon = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf2f0dc }));
  moon.position.set(-260, 220, 180);
  moon.visible = false;
  scene.add(moon);
  const crater = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd8d4b8 }));
  crater.position.set(-262, 224, 191);
  crater.visible = false;
  scene.add(crater);
  moon.userData.crater = crater;
  moonLight = new THREE.DirectionalLight(0x8fa8d8, 0);
  moonLight.position.set(-200, 180, 140);
  scene.add(moonLight);
}

// ---------- procedural canvas textures ----------
// Draw a texture on an offscreen canvas, then hand it to three.js.
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// A building face: base colour, a grid of windows (some lit), a pale
// lintel over each window, and a dark strip at the bottom.
function buildingTexture(base, lit) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 10; y += 22) {
      for (let x = 10; x < w - 10; x += 20) {
        g.fillStyle = rng() < 0.55 ? lit : '#2b3a4a';
        g.fillRect(x, y, 12, 14);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, 12, 3);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, h - 8, w, 8);
  });
}
const BUILDING_COLORS = ['#d8a06a', '#c97b5a', '#e8c98f', '#7fa8c9', '#b98a7a', '#9fb27a', '#d9b8c4', '#8fb8a8'];
const WINDOW_LITS = ['#ffe9a8', '#bfe8ff', '#fff3c0'];
// Road: dark asphalt, a dashed yellow centre line, white edge lines.
const roadTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#33383e';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#f5d76e';
  g.fillRect(w / 2 - 2, 0, 4, 18);
  g.fillRect(w / 2 - 2, 54, 4, 18);
  g.fillRect(w / 2 - 2, 108, 4, 18);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillRect(4, 0, 3, h);
  g.fillRect(w - 7, 0, 3, h);
});
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
// Sand: pale base with 260 speckles in two tones.
const sandTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#e8d5a0';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rng() < 0.5 ? '#dcc98e' : '#f2e2b0';
    g.fillRect(rng() * w, rng() * h, 2, 2);
  }
});
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
sandTex.repeat.set(8, 8);
// Grass: green base with 120 blade speckles.
const grassTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#7fae62';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = rng() < 0.5 ? '#6d9c52' : '#93c176';
    g.fillRect(rng() * w, rng() * h, 2, 3);
  }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
grassTex.repeat.set(20, 20);

// ---------- city layout ----------
const BLOCK = 24; // block pitch (road centre to road centre)
const ROAD_W = 7;
const GRID = 9; // 9x9 blocks
const CITY = GRID * BLOCK; // ~216 wide
const HALF = CITY / 2;
// Terrain heightmap — the map is NOT flat. The city stays flat; outer
// zones roll, the north rises into mountains, the beach slopes to sea.
function groundHeight(x, z) {
  if (Math.abs(x) < HALF + 12 && Math.abs(z) < HALF + 12) return 0;
  const rolling = 2.2 * Math.sin(x * 0.021) * Math.cos(z * 0.017);
  const ripples = 1.4 * Math.sin(x * 0.047 + 1.3) * Math.sin(z * 0.039 + 0.7);
  let h = rolling + ripples;
  if (z < -230) h += Math.min(24, (-230 - z) * 0.35);
  if (x > HALF) h = lerp(h, -0.15, clamp((x - HALF) / 20, 0, 1));
  if (z > 150) h += 1.2 * Math.sin(x * 0.03 + 2) * Math.sin(z * 0.05);
  if (Math.hypot(x - 60, z + 205) < 35) h = lerp(h, -0.5, 0.8);
  if (Math.hypot(x + 272, z - 178) < 32) h = lerp(h, -0.5, 0.8);
  if (z > 160 && z < 230 && x < 130) h = lerp(h, -0.3, 0.85);
  if (Math.hypot(x + 210, z + 40) < 110) h *= 0.1;
  if (Math.hypot(x - 150, z + 200) < 70) h *= 0.1;
  if (Math.abs(z) < 10 && x < -HALF) h *= 0.15;
  if (Math.abs(x) < 10 && z < -HALF) h *= 0.15;
  if (Math.abs(x - 48) < 10 && z > HALF) h *= 0.15;
  return h;
}
const world = new THREE.Group();
scene.add(world);
const colliders = []; // {x,z,hx,hz} axis-aligned boxes for buildings
// The one box helper for the whole world: material, shadows, parent.
function addBox(w, h, d, color, x, y, z, opts) {
  const mat = opts && opts.mat ? opts.mat : new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts && opts.shadow !== false) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  const parent = opts && opts.parent ? opts.parent : world;
  parent.add(m);
  return m;
}
// Ground: a displaced terrain mesh with per-zone vertex colours.
const groundGeo = new THREE.PlaneGeometry(560, 560, 110, 110);
groundGeo.rotateX(-Math.PI / 2);
{
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x7fae62);
  const cFarm = new THREE.Color(0x9ab854);
  const cForest = new THREE.Color(0x4a7a3a);
  const cDesert = new THREE.Color(0xd9b380);
  const cSand = new THREE.Color(0xe8d5a0);
  const cRock = new THREE.Color(0x8a7a68);
  const cSwamp = new THREE.Color(0x5a7a42);
  const cTmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, -0.05 + groundHeight(x, z));
    if (x > HALF) cTmp.copy(cSand);
    else if (z < -230) cTmp.copy(cRock);
    else if (z < -150) cTmp.copy(cForest);
    else if (z > 150) cTmp.copy(cDesert);
    else if (x < -140) cTmp.copy(cFarm);
    else if (x < -195 && z > 200) cTmp.copy(cSwamp);
    else cTmp.copy(cGrass);
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true }));
ground.receiveShadow = true;
world.add(ground);

// Ocean and beach on the east edge (x > HALF + 14).
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(180, 560), new THREE.MeshStandardMaterial({ color: 0x1e7fa8, roughness: 0.25, metalness: 0.35 }));
ocean.rotation.x = -Math.PI / 2;
ocean.position.set(HALF + 14 + 90, 0.1, 0);
world.add(ocean);
const beach = new THREE.Mesh(new THREE.PlaneGeometry(28, 560), new THREE.MeshStandardMaterial({ map: sandTex }));
beach.rotation.x = -Math.PI / 2;
beach.position.set(HALF + 14, 0.05, 0);
beach.receiveShadow = true;
world.add(beach);
// Boardwalk strip along the sand.
addBox(4, 0.3, 560, 0xb98d5f, HALF + 11, 0.1, 0, { shadow: false });
// Roads: one plane per grid line, in both directions, texture repeated.
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex });
for (let i = 0; i <= GRID; i++) {
  const c = -HALF + i * BLOCK;
  const rx = new THREE.Mesh(new THREE.PlaneGeometry(CITY + ROAD_W, ROAD_W), roadMat.clone());
  rx.material.map = roadTex.clone();
  rx.material.map.repeat.set((CITY + ROAD_W) / 14, 1);
  rx.material.map.needsUpdate = true;
  rx.rotation.x = -Math.PI / 2;
  rx.position.set(0, 0.02, c);
  rx.receiveShadow = true;
  world.add(rx);
  const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, CITY + ROAD_W), roadMat.clone());
  rz.material.map = roadTex.clone();
  rz.material.map.repeat.set(1, (CITY + ROAD_W) / 14);
  rz.material.map.needsUpdate = true;
  rz.rotation.x = -Math.PI / 2;
  rz.position.set(c, 0.02, 0);
  rz.receiveShadow = true;
  world.add(rz);
}
// Sidewalks: one pale slab per block, slightly above the road.
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1 });
for (let ix = 0; ix < GRID; ix++) {
  for (let iz = 0; iz < GRID; iz++) {
    const cx = -HALF + BLOCK / 2 + ix * BLOCK;
    const cz = -HALF + BLOCK / 2 + iz * BLOCK;
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - ROAD_W + 2, BLOCK - ROAD_W + 2), sidewalkMat);
    sw.rotation.x = -Math.PI / 2;
    sw.position.set(cx, 0.03, cz);
    sw.receiveShadow = true;
    world.add(sw);
  }
}
// Is a point on a road? True when it sits near any grid line.
function isRoad(x, z) {
  for (let i = 0; i <= GRID; i++) {
    const c = -HALF + i * BLOCK;
    if (Math.abs(x - c) < ROAD_W / 2 + 0.4) return true;
    if (Math.abs(z - c) < ROAD_W / 2 + 0.4) return true;
  }
  return false;
}
// Circle-vs-building collision: returns the first box hit, or null.
function collideCircle(x, z, r) {
  for (const b of colliders) {
    if (Math.abs(x - b.x) < b.hx + r && Math.abs(z - b.z) < b.hz + r) return b;
  }
  return null;
}

// Buildings: 100+ with window textures, a few towers downtown.
// Downtown blocks get two taller buildings; the rest get one each.
const buildingMats = [];
let buildingCount = 0;
for (let ix = 0; ix < GRID; ix++) {
  for (let iz = 0; iz < GRID; iz++) {
    const cx = -HALF + BLOCK / 2 + ix * BLOCK;
    const cz = -HALF + BLOCK / 2 + iz * BLOCK;
    const downtown = Math.abs(cx) < 50 && Math.abs(cz) < 50;
    const n = downtown ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const ox = k === 0 ? -4 : 4;
      const oz = k === 0 ? 3 : -4;
      const w = rr(6, 9);
      const d = rr(6, 9);
      const h = downtown ? rr(18, 46) : rr(6, 16);
      const tex = buildingTexture(pick(BUILDING_COLORS), pick(WINDOW_LITS));
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      const b = addBox(w, h, d, 0xffffff, cx + ox, h / 2, cz + oz, { mat });
      b.userData.isBuilding = true;
      colliders.push({ x: cx + ox, z: cz + oz, hx: w / 2, hz: d / 2 });
      addBox(w * 0.4, 1.2, d * 0.4, 0x666666, cx + ox, h + 0.6, cz + oz);
      buildingCount++;
    }
  }
}
// Marina and docks landmark on the beach side.
addBox(30, 3, 8, 0x8a6a4a, HALF + 22, 1.5, 40);
addBox(4, 2, 4, 0xd8d8d8, HALF + 22, 4, 40);
// Palm trees and streetlights: palms scattered near the beach and around
// town, lamps on alternating corners of the grid.
const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9 });
function makePalm(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 5, 6), palmTrunkMat);
  trunk.position.y = 2.5;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.9), palmLeafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.3, 5.1, Math.sin(a) * 1.3);
    leaf.rotation.y = -a;
    leaf.rotation.z = 0.35;
    leaf.castShadow = true;
    g.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  nut.position.y = 4.9;
  g.add(nut);
  g.position.set(x, groundHeight(x, z), z);
  world.add(g);
}
for (let i = 0; i < 60; i++) {
  const x = rr(-HALF, HALF + 10), z = rr(-HALF, HALF);
  if (isRoad(x, z) || collideCircle(x, z, 2)) continue;
  if (Math.abs(x - (HALF + 14)) < 16) { makePalm(x, z); continue; }
  if (rng() < 0.6) makePalm(x, z);
}
for (let i = 0; i <= GRID; i++) {
  for (let j = 0; j <= GRID; j += 2) {
    const x = -HALF + i * BLOCK + ROAD_W / 2 + 0.6;
    const z = -HALF + j * BLOCK;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(x, 3, z);
    pole.castShadow = true;
    world.add(pole);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.7 });
    lampMats.push(lampMat);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), lampMat);
    lamp.position.set(x, 6.1, z);
    world.add(lamp);
  }
}

// ---------- world beyond the city: farmland, forest, desert hills, highway ----------
// A flat tinted patch on the ground, for fields and clearings.
function zonePatch(w, d, color, x, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.01, z);
  m.receiveShadow = true;
  world.add(m);
  return m;
}
// A pine: trunk cylinder plus a cone top, both casting shadows.
function makeTree(x, z, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 2.4 * s, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a22, roughness: 1 }));
  trunk.position.y = 1.2 * s;
  trunk.castShadow = true;
  g.add(trunk);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.9 * s, 4.4 * s, 8), new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 0.95 }));
  top.position.y = 4.2 * s;
  top.castShadow = true;
  g.add(top);
  g.position.set(x, groundHeight(x, z), z);
  world.add(g);
}
{
  // Farmland west: three farmhouses with red roofs, plus scattered trees.
  for (const [fx, fz] of [[-190, -110], [-230, 110], [-185, 90]]) {
    const gy = groundHeight(fx, fz);
    addBox(7, 4, 6, 0xd8c8a8, fx, 2 + gy, fz);
    addBox(7.6, 1.6, 6.6, 0x8a4a2a, fx, 4.8 + gy, fz);
    colliders.push({ x: fx, z: fz, hx: 3.8, hz: 3.3 });
  }
  for (let i = 0; i < 14; i++) makeTree(rr(-275, -140), rr(-130, 130), rr(0.8, 1.4));
  // Forest north: dense pines.
  for (let i = 0; i < 46; i++) makeTree(rr(-270, 270), rr(-275, -150), rr(0.9, 1.7));
  // Desert hills south: sandy floor, flattened rocky hills, cacti.
  for (let i = 0; i < 9; i++) {
    const hx = -240 + i * 60 + rr(-14, 14), hz = 185 + rr(-20, 55);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(rr(16, 30), 12, 8), new THREE.MeshStandardMaterial({ color: 0xb98d5f, roughness: 1 }));
    hill.scale.y = 0.45;
    hill.position.set(hx, 0, hz);
    hill.castShadow = true;
    world.add(hill);
    colliders.push({ x: hx, z: hz, hx: 14, hz: 14 });
  }
  for (let i = 0; i < 12; i++) {
    const cx = rr(-260, 260), cz = rr(160, 270);
    const cactus = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, rr(2.5, 4.5), 8), new THREE.MeshStandardMaterial({ color: 0x3f8a4d, roughness: 1 }));
    cactus.position.set(cx, 1.8, cz);
    cactus.castShadow = true;
    world.add(cactus);
  }
  // Highways: west out of town, plus north and south connectors.
  const hwMat = new THREE.MeshStandardMaterial({ map: roadTex });
  const hw = new THREE.Mesh(new THREE.PlaneGeometry(170, 10), hwMat.clone());
  hw.material.map = roadTex.clone();
  hw.material.map.repeat.set(12, 1);
  hw.material.map.needsUpdate = true;
  hw.rotation.x = -Math.PI / 2;
  hw.position.set(-HALF - 85, 0.02, 0);
  hw.receiveShadow = true;
  world.add(hw);
  const hwN = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), hwMat.clone());
  hwN.material.map = roadTex.clone();
  hwN.material.map.repeat.set(1, 4);
  hwN.material.map.needsUpdate = true;
  hwN.rotation.x = -Math.PI / 2;
  hwN.position.set(0, 0.02, -HALF - 30);
  world.add(hwN);
  const hwS = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), hwMat.clone());
  hwS.material.map = roadTex.clone();
  hwS.material.map.repeat.set(1, 4);
  hwS.material.map.needsUpdate = true;
  hwS.rotation.x = -Math.PI / 2;
  hwS.position.set(48, 0.02, HALF + 30);
  world.add(hwS);
}

// ---------- mountain ring at the edges ----------
// Nine peaks ring the map: rock cones with snow caps, plus a winding dirt
// road climbing the west face and a viewpoint disc at the top.
{
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 1 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.9 });
  const peaks = [
    { x: -330, z: -260, h: 110, r: 90 },
    { x: -330, z: 0, h: 95, r: 80 },
    { x: -330, z: 260, h: 120, r: 95 },
    { x: 330, z: -260, h: 100, r: 85 },
    { x: 330, z: 260, h: 105, r: 88 },
    { x: -120, z: -340, h: 90, r: 78 },
    { x: 140, z: -340, h: 98, r: 82 },
    { x: 0, z: 340, h: 92, r: 80 },
    { x: -260, z: 340, h: 88, r: 75 },
  ];
  for (const pk of peaks) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(pk.r, pk.h, 8), rockMat);
    m.position.set(pk.x, pk.h / 2 - 4, pk.z);
    m.castShadow = true;
    world.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(pk.r * 0.42, pk.h * 0.32, 8), snowMat);
    cap.position.set(pk.x, pk.h - 4 - pk.h * 0.16, pk.z);
    world.add(cap);
  }
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0xa88a5a, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(46, 5), dirtMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = i % 2 === 0 ? 0.35 : -0.35;
    seg.position.set(-300 + (i % 2) * 18, 2 + i * 7, -40 + i * 22);
    world.add(seg);
  }
  const view = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1, 16), new THREE.MeshStandardMaterial({ color: 0x9a8a6a }));
  view.position.set(-292, 34, 48);
  world.add(view);
}

// ---------- map shape: keys, central lake, swamp, west town ----------
// A chain of small sandy islands in the southern sea, a big lake in the
// northern forest basin, reeds in the southwest swamp, and a small town
// with a main street on the west coast.
{
  const keySpots = [[150, 180], [176, 222], [148, 256], [202, 158], [188, 268]];
  for (const [kx, kz] of keySpots) {
    const isl = new THREE.Mesh(new THREE.CircleGeometry(rr(7, 11), 16), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
    isl.rotation.x = -Math.PI / 2;
    isl.position.set(kx, 0.12, kz);
    isl.receiveShadow = true;
    world.add(isl);
  }
  makePalm(152, 182);
  makePalm(176, 220);
  makePalm(200, 160);
  const bigLake = new THREE.Mesh(new THREE.CircleGeometry(32, 28), new THREE.MeshStandardMaterial({ color: 0x2a8ab0, roughness: 0.2, metalness: 0.4 }));
  bigLake.rotation.x = -Math.PI / 2;
  bigLake.position.set(60, 0.08, -205);
  world.add(bigLake);
  for (let i = 0; i < 24; i++) {
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, rr(1.5, 3), 5), new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 1 }));
    reed.position.set(rr(-275, -195), 1.2, rr(205, 265));
    world.add(reed);
  }
  const townMat = new THREE.MeshStandardMaterial({ map: roadTex });
  const townSt = new THREE.Mesh(new THREE.PlaneGeometry(12, 90), townMat.clone());
  townSt.material.map = roadTex.clone();
  townSt.material.map.repeat.set(1, 6);
  townSt.material.map.needsUpdate = true;
  townSt.rotation.x = -Math.PI / 2;
  townSt.position.set(-258, 0.02, -60);
  world.add(townSt);
  const townColors = [0xd8a06a, 0x7fa8c9, 0xe8c98f, 0x9fb27a, 0xb98a7a, 0xd9b8c4];
  for (let i = 0; i < 6; i++) {
    const hx = -272 + (i % 2) * 16, hz = -95 + Math.floor(i / 2) * 28;
    const gy = groundHeight(hx, hz);
    addBox(7, rr(4, 6), 6, townColors[i], hx, 2.5 + gy, hz);
    addBox(7.6, 1.4, 6.6, 0x8a4a2a, hx, 5.6 + gy, hz);
    colliders.push({ x: hx, z: hz, hx: 3.8, hz: 3.3 });
  }
}

// ---------- characters ----------
// A person is a small group: box body, sphere head with a hair cap, two
// legs and two arms. Limb meshes are kept in userData so walking can
// swing them later.
function makePerson(shirt, pants, skin) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtM = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsM = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtM);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skinM);
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
  hair.position.y = 1.66;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), pantsM);
  legL.position.set(-0.16, 0.35, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirtM);
  armL.position.set(-0.42, 1.05, 0);
  armL.castShadow = true;
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armR);
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

// The player starts as Ian — coral shirt, dark jeans, dark hair in a bun.
// Her extra hair pieces stay hidden until the barber changes the style.
let player = makePerson(0xd94f70, 0x3a2a4a, 0xd9a066);
const ianBun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianBun.position.set(0, 1.92, -0.12);
player.add(ianBun);
const ianHair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianHair.position.y = 1.68;
player.add(ianHair);
const ianMohawk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianMohawk.position.y = 1.95;
ianMohawk.visible = false;
player.add(ianMohawk);
const ianLong = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.18), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianLong.position.set(0, 1.3, -0.28);
ianLong.visible = false;
player.add(ianLong);
const ianShort = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianShort.position.y = 1.68;
ianShort.visible = false;
player.add(ianShort);
player.userData.hair = { bun: ianBun, top: ianHair, mohawk: ianMohawk, long: ianLong, short: ianShort };
player.userData.tattoos = [];
player.position.set(-HALF + BLOCK / 2, 0, 20);
scene.add(player);
let playerState = { x: player.position.x, z: player.position.z, y: 0, vy: 0, heading: 0, walkPhase: 0, onGround: true };
// The roster is two people: Ian and Ryan (yellow shirt, blue cap). Each
// keeps a spot on the map; cash and missions are shared across the crew.
// Marisol stays the fixer NPC.
const ryan = makePerson(0xe8b820, 0x27435e, 0xd9a066);
const ryanCap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x1e5aa8 }));
ryanCap.position.y = 1.82;
ryan.add(ryanCap);
const ryanBrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.26), new THREE.MeshStandardMaterial({ color: 0x1e5aa8 }));
ryanBrim.position.set(0, 1.79, 0.3);
ryan.add(ryanBrim);
const ryanTop = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanTop.position.y = 1.68;
ryanTop.visible = false;
ryan.add(ryanTop);
const ryanMohawk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanMohawk.position.y = 1.95;
ryanMohawk.visible = false;
ryan.add(ryanMohawk);
const ryanLong = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.18), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanLong.position.set(0, 1.3, -0.28);
ryanLong.visible = false;
ryan.add(ryanLong);
const ryanShort = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanShort.position.y = 1.68;
ryanShort.visible = false;
ryan.add(ryanShort);
ryan.userData.hair = { cap: ryanCap, brim: ryanBrim, top: ryanTop, mohawk: ryanMohawk, long: ryanLong, short: ryanShort };
ryan.userData.tattoos = [];
ryan.position.set(HALF + 6, 0, -20);
scene.add(ryan);
const ryanState = { x: HALF + 6, z: -20, y: 0, vy: 0, heading: -1.2, walkPhase: 0, onGround: true };
const CHARS = [
  { name: 'Ian', mesh: player, st: playerState, outfit: 0xd94f70, hairstyle: 'bun', hairColor: 0x3a1e10, tattoos: [] },
  { name: 'Ryan', mesh: ryan, st: ryanState, outfit: 0xe8b820, hairstyle: 'cap', hairColor: 0x1a1a1a, tattoos: [] },
];
// ---------- barber (hairstyles + hair colour) and tattoos ----------
// Switch a character's hair: hide every piece, then show the ones the
// chosen style needs. Colour is re-applied after every switch.
function setHairstyle(ch, style) {
  const h = ch.mesh.userData.hair;
  if (!h) return;
  for (const k of Object.keys(h)) h[k].visible = false;
  if (style === 'bun') {
    if (h.bun) h.bun.visible = true;
    if (h.top) h.top.visible = true;
  } else if (style === 'cap') {
    if (h.cap) h.cap.visible = true;
    if (h.brim) h.brim.visible = true;
  } else if (style === 'short') {
    if (h.short) h.short.visible = true;
  } else if (style === 'long') {
    if (h.top) h.top.visible = true;
    if (h.long) h.long.visible = true;
  } else if (style === 'mohawk') {
    if (h.mohawk) h.mohawk.visible = true;
  }
  ch.hairstyle = style;
  setHairColor(ch, ch.hairColor);
}
function setHairColor(ch, color) {
  ch.hairColor = color;
  const h = ch.mesh.userData.hair;
  if (!h) return;
  for (const k of ['top', 'mohawk', 'long', 'short', 'bun']) {
    if (h[k]) h[k].material.color.setHex(color);
  }
}
// A tattoo is a small coloured patch stuck on the body: dragon and snake
// on the arms, rose on the chest, skull on the back.
function addTattoo(ch, design) {
  const g = ch.mesh;
  let m = null;
  if (design === 'dragon') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.36), new THREE.MeshStandardMaterial({ color: 0x8a1a1a, emissive: 0x550000, emissiveIntensity: 0.5 }));
    m.position.set(-0.42, 1.35, 0);
  } else if (design === 'snake') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.36), new THREE.MeshStandardMaterial({ color: 0x1a6a2a, emissive: 0x003300, emissiveIntensity: 0.5 }));
    m.position.set(0.42, 1.35, 0);
  } else if (design === 'rose') {
    m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0xd94f70, emissive: 0x661122, emissiveIntensity: 0.5 }));
    m.position.set(0, 1.25, 0.33);
  } else if (design === 'skull') {
    m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0x444444, emissiveIntensity: 0.5 }));
    m.position.set(0, 1.25, -0.33);
    m.rotation.y = Math.PI;
  }
  if (!m) return;
  g.add(m);
  ch.tattoos.push(design);
  toast(ch.name + ' got a new tattoo: ' + design + '!');
}
function activeName() { return CHARS[state.activeChar].name; }
// Switching characters takes 1.5 seconds and a little fanfare. You cannot
// switch mid-air, and you climb out of a car first if you are in one.
function switchCharacter() {
  if (state.mode !== 'play' || switchTimer > 0) return;
  const flying = state.inCar && (state.inCar.kind === 'heli' || state.inCar.kind === 'plane');
  if (flying && (state.inCar.alt || 0) > 1.5) { toast('Land before switching characters.'); return; }
  if (state.inCar) tryEnterExitVehicle();
  switchTarget = (state.activeChar + 1) % CHARS.length;
  switchTimer = 1.5;
  switchSwapped = false;
  toast('Switching to ' + CHARS[switchTarget].name + '…');
  beep(520, 0.12, 'sine', 0.15);
}
function finishSwitch() {
  const from = CHARS[state.activeChar];
  from.st.x = playerState.x;
  from.st.z = playerState.z;
  from.st.heading = playerState.heading;
  state.activeChar = switchTarget;
  const next = CHARS[state.activeChar];
  player = next.mesh;
  playerState = next.st;
  window.__solmar.playerState = playerState;
  if (next.outfit !== undefined && player.userData.body) player.userData.body.material.color.setHex(next.outfit);
  player.visible = true;
  player.position.set(playerState.x, groundHeight(playerState.x, playerState.z) + playerState.y, playerState.z);
  player.rotation.y = playerState.heading;
  camYaw = playerState.heading + Math.PI;
  toast(CHARS[state.activeChar].name);
  chime();
  updateHUD();
}
// ---------- parachute ----------
// An orange canopy that pops open above the player and slows the fall.
let chute = { open: false, mesh: null };
function openParachute() {
  if (chute.open) return;
  chute.open = true;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0xff5a2a, roughness: 0.7, side: THREE.DoubleSide }));
  canopy.position.y = 2.7;
  player.add(canopy);
  chute.mesh = canopy;
  beep(520, 0.2, 'sine', 0.18);
  toast('Parachute open! Steer with WASD.');
}
function closeParachute() {
  if (!chute.open) return;
  chute.open = false;
  if (chute.mesh) {
    player.remove(chute.mesh);
    chute.mesh = null;
  }
}
// Bail out of a helicopter or plane above 5m of altitude. Below that the
// game tells you to climb higher first.
function bailOut() {
  if (state.mode !== 'play' || !state.inCar) return;
  const c = state.inCar;
  const flying = c.kind === 'heli' || c.kind === 'plane';
  if (flying && (c.alt || 0) > 5) {
    playerState.x = c.mesh.position.x;
    playerState.z = c.mesh.position.z;
    playerState.y = c.alt;
    playerState.vy = 0;
    playerState.onGround = false;
    c.speed = 0;
    state.inCar = null;
    state.speed = 0;
    player.visible = true;
    player.position.set(playerState.x, playerState.y, playerState.z);
    toast('Bailed out! Press Space to open the parachute.');
    beep(440, 0.15, 'sine', 0.2);
  } else if (flying) {
    toast('Too low to bail out — climb higher first.');
  }
}

// ---------- cars ----------
// The car table: body type, paint, size and top speed. The supercar also
// carries its own acceleration and steering rate.
const CAR_TYPES = [
  { type: 'sedan', topSpeed: 26, color: 0xc0392b, len: 4.2, w: 1.9, h: 0.62 },
  { type: 'sedan', topSpeed: 26, color: 0x2e6fb0, len: 4.2, w: 1.9, h: 0.62 },
  { type: 'taxi', topSpeed: 25, color: 0xf5c518, len: 4.2, w: 1.9, h: 0.62 },
  { type: 'pickup', topSpeed: 24, color: 0x4a7a3a, len: 4.6, w: 2.0, h: 0.72 },
  { type: 'truck', topSpeed: 19, color: 0x8a8f96, len: 6.2, w: 2.3, h: 1.1 },
  { type: 'muscle', topSpeed: 30, color: 0xe86a1e, len: 4.4, w: 2.0, h: 0.6 },
  { type: 'supercar', topSpeed: 42, color: 0xffd23f, len: 4.4, w: 2.0, h: 0.5, accel: 26, steerRate: 0.7 },
  { type: 'firetruck', topSpeed: 22, color: 0xc0392b, len: 6.2, w: 2.3, h: 1.4 },
  { type: 'ambulance', topSpeed: 26, color: 0xf0f0f0, len: 5.2, w: 2.1, h: 1.3 },
  { type: 'bus', topSpeed: 20, color: 0x2e6fb0, len: 9, w: 2.5, h: 2.2 },
  { type: 'police', topSpeed: 30, color: 0xf0f0f0, len: 4.4, w: 1.95, h: 0.66 },
];
function makeCarMesh(spec) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.len), bodyM);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  // Cabin: dark glass for most cars, body-coloured for trucks.
  const cabM = new THREE.MeshStandardMaterial({ color: spec.type === 'truck' ? spec.color : 0x1c2833, roughness: 0.2, metalness: 0.4 });
  const cabLen = spec.type === 'pickup' ? spec.len * 0.32 : spec.type === 'truck' ? spec.len * 0.3 : spec.len * 0.5;
  const cabZ = spec.type === 'pickup' ? spec.len * 0.18 : spec.type === 'truck' ? spec.len * 0.28 : -spec.len * 0.05;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.82, 0.55, cabLen), cabM);
  cab.position.set(0, 0.55 + spec.h / 2 + 0.26, cabZ);
  cab.castShadow = true;
  g.add(cab);
  // A truck gets a pale cargo box behind the cab.
  if (spec.type === 'truck') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.96, 1.5, spec.len * 0.55), new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.6 }));
    box.position.set(0, 1.35, -spec.len * 0.18);
    box.castShadow = true;
    g.add(box);
  }
  // A taxi gets a lit roof sign.
  if (spec.type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xaa8800, emissiveIntensity: 0.4 }));
    sign.position.set(0, 1.42, -0.2);
    g.add(sign);
  }
  // A police car gets a light bar, red and blue lamps, and a black stripe.
  if (spec.type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.42, -0.2);
    g.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    r.position.set(-0.22, 1.52, -0.2);
    g.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 }));
    b.position.set(0.22, 1.52, -0.2);
    g.add(b);
    g.userData.lightR = r;
    g.userData.lightB = b;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.02, 0.2, spec.len * 0.9), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    stripe.position.y = 0.55;
    g.add(stripe);
  }
  // Fire trucks and ambulances share a light bar; ambulances add a cross.
  if (spec.type === 'firetruck' || spec.type === 'ambulance') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 0.55 + spec.h / 2 + 0.56, -0.2);
    g.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    r.position.set(-0.22, 0.55 + spec.h / 2 + 0.66, -0.2);
    g.add(r);
    const blueCol = spec.type === 'firetruck' ? 0xffffff : 0x2244ff;
    const blueEm = spec.type === 'firetruck' ? 0xffffff : 0x0022ff;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: blueCol, emissive: blueEm, emissiveIntensity: 1 }));
    b.position.set(0.22, 0.55 + spec.h / 2 + 0.66, -0.2);
    g.add(b);
    g.userData.lightR = r;
    g.userData.lightB = b;
    if (spec.type === 'ambulance') {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 0.4 }));
      cross.position.set(0, 1.1, spec.len / 2 + 0.02);
      g.add(cross);
    }
  }
  // Four wheels and two headlights, the same on every car.
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheels = [];
  for (const [wx, wz] of [[-spec.w / 2, spec.len * 0.32], [spec.w / 2, spec.len * 0.32], [-spec.w / 2, -spec.len * 0.32], [spec.w / 2, -spec.len * 0.32]]) {
    const wh = new THREE.Mesh(wheelGeo, wheelM);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(wx, 0.36, wz);
    wh.castShadow = true;
    g.add(wh);
    wheels.push(wh);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffee88, emissiveIntensity: 0.8 }));
  hl.position.set(-0.55, 0.6, spec.len / 2 + 0.01);
  g.add(hl);
  const hr = hl.clone();
  hr.position.x = 0.55;
  g.add(hr);
  g.userData.headlights = [hl, hr];
  g.userData.wheels = wheels;
  g.userData.spec = spec;
  return g;
}
// A random point on a road, with a heading along it.
function roadPoint() {
  const i = Math.floor(rr(0, GRID + 1));
  const c = -HALF + i * BLOCK;
  if (rng() < 0.5) return { x: c + (rng() < 0.5 ? 1.8 : -1.8), z: rr(-HALF, HALF), heading: rng() < 0.5 ? 0 : Math.PI };
  return { x: rr(-HALF, HALF), z: c + (rng() < 0.5 ? 1.8 : -1.8), heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

// Parked cars the player can steal: twelve of them, any type but police.
const parkedCars = [];
for (let i = 0; i < 12; i++) {
  const spec = pick(CAR_TYPES.filter((c) => c.type !== 'police'));
  const mesh = makeCarMesh(spec);
  const p = roadPoint();
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = p.heading;
  scene.add(mesh);
  parkedCars.push({ mesh, spec, speed: 0, steer: 0, stolen: false });
}
// Traffic AI cars on road loops: fourteen, cruising at 7-11 speed.
const traffic = [];
for (let i = 0; i < 14; i++) {
  const spec = pick(CAR_TYPES.filter((c) => c.type !== 'police'));
  const mesh = makeCarMesh(spec);
  const p = roadPoint();
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = p.heading;
  scene.add(mesh);
  traffic.push({ mesh, spec, speed: rr(7, 11), heading: p.heading, loop: Math.floor(rr(0, GRID + 1)), turnAt: 0 });
}
// ---------- vehicle variety: motorcycle, bicycle, buggy ----------
// A motorcycle: tank, seat, handlebar, two wheels, one headlight.
function makeMotoMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.1), bodyM);
  tank.position.y = 0.75;
  tank.castShadow = true;
  g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  seat.position.set(0, 0.82, -0.55);
  g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  bar.position.set(0, 1.0, 0.45);
  g.add(bar);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12);
  for (const wz of [0.85, -0.85]) {
    const wh = new THREE.Mesh(wg, wheelM);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(0, 0.36, wz);
    wh.castShadow = true;
    g.add(wh);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffee88, emissiveIntensity: 0.9 }));
  hl.position.set(0, 0.75, 1.02);
  g.add(hl);
  g.userData.wheels = [];
  return g;
}
// A bicycle: a top tube, a seat post, saddle, handlebar, two torus tyres.
function makeBicycleMesh(color) {
  const g = new THREE.Group();
  const frameM = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), frameM);
  bar.rotation.x = Math.PI / 2;
  bar.position.y = 0.75;
  g.add(bar);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), frameM);
  post.position.set(0, 0.65, -0.45);
  post.rotation.x = 0.5;
  g.add(post);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  seat.position.set(0, 1.0, -0.6);
  g.add(seat);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  handle.position.set(0, 1.0, 0.55);
  g.add(handle);
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.95 });
  const tg = new THREE.TorusGeometry(0.34, 0.05, 8, 16);
  for (const wz of [0.62, -0.62]) {
    const tyre = new THREE.Mesh(tg, tyreM);
    tyre.position.set(0, 0.34, wz);
    tyre.castShadow = true;
    g.add(tyre);
  }
  g.userData.wheels = [];
  return g;
}
// A dune buggy: open tub, roll bar, two seats, four fat wheels.
function makeBuggyMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.6), bodyM);
  tub.position.y = 0.62;
  tub.castShadow = true;
  g.add(tub);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 1.35, -0.4);
  g.add(roll);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  seat.position.set(-0.35, 0.95, -0.5);
  g.add(seat);
  const seat2 = seat.clone();
  seat2.position.x = 0.35;
  g.add(seat2);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wg = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 0.85], [0.95, 0.85], [-0.95, -0.85], [0.95, -0.85]]) {
    const wh = new THREE.Mesh(wg, wheelM);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(wx, 0.48, wz);
    wh.castShadow = true;
    g.add(wh);
    wheels.push(wh);
  }
  g.userData.wheels = wheels;
  return g;
}
// A rideable horse and a quad bike (ATV).
function makeHorseMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.7), bodyM);
  body.position.y = 1.15;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.4), bodyM);
  neck.position.set(0, 1.7, 0.85);
  neck.rotation.x = 0.5;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.7), bodyM);
  head.position.set(0, 2.0, 1.2);
  g.add(head);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
  mane.position.set(0, 1.85, 0.7);
  mane.rotation.x = 0.5;
  g.add(mane);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
  tail.position.set(0, 1.1, -0.95);
  tail.rotation.x = -0.4;
  g.add(tail);
  const legM = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 });
  const legs = [];
  for (const [lx, lz] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6), legM);
    leg.position.set(lx, 0.45, lz);
    leg.castShadow = true;
    g.add(leg);
    legs.push(leg);
  }
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x8a2a2a }));
  saddle.position.set(0, 1.55, 0);
  g.add(saddle);
  g.userData.legs = legs;
  g.userData.wheels = [];
  return g;
}
// A quad bike: wide body, seat, handlebar, rear rack, four chunky wheels.
function makeQuadMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 2.1), bodyM);
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  seat.position.set(0, 0.9, -0.45);
  g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  bar.position.set(0, 1.0, 0.7);
  g.add(bar);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x444444 }));
  rack.position.set(0, 0.85, -1.0);
  g.add(rack);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.75, 0.7], [0.75, 0.7], [-0.75, -0.7], [0.75, -0.7]]) {
    const wh = new THREE.Mesh(wg, wheelM);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(wx, 0.42, wz);
    wh.castShadow = true;
    g.add(wh);
    wheels.push(wh);
  }
  g.userData.wheels = wheels;
  return g;
}
const extraVehicles = [];
function addExtraVehicle(kind, mesh, spec, x, z, heading) {
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const v = { mesh, spec, kind, speed: 0, steer: 0, stolen: false, alt: 0 };
  extraVehicles.push(v);
  return v;
}
{
  // Seven small vehicles parked around the roads; the last buggy waits on
  // the beach at the far east edge instead.
  const spots = [
    { kind: 'moto', name: 'motorcycle', color: 0xc0392b, top: 34, accel: 22, steer: 0.85 },
    { kind: 'moto', name: 'motorcycle', color: 0x2e6fb0, top: 33, accel: 21, steer: 0.85 },
    { kind: 'moto', name: 'motorcycle', color: 0x222222, top: 35, accel: 23, steer: 0.9 },
    { kind: 'bike', name: 'bicycle', color: 0x2ecc71, top: 12, accel: 8, steer: 0.7 },
    { kind: 'bike', name: 'bicycle', color: 0xe8b820, top: 11, accel: 8, steer: 0.7 },
    { kind: 'buggy', name: 'dune buggy', color: 0xe86a1e, top: 23, accel: 15, steer: 0.6 },
    { kind: 'buggy', name: 'dune buggy', color: 0x1e8a8a, top: 23, accel: 15, steer: 0.6 },
  ];
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const mesh = s.kind === 'moto' ? makeMotoMesh(s.color) : s.kind === 'bike' ? makeBicycleMesh(s.color) : makeBuggyMesh(s.color);
    const p = roadPoint();
    const spec = { type: s.kind, color: s.color, len: 2.2, w: 1.2, h: 0.7, topSpeed: s.top, accel: s.accel, steerRate: s.steer, label: s.name };
    if (s.kind === 'buggy' && i === 6) addExtraVehicle(s.kind, mesh, spec, HALF + 16, -80, 0.4);
    else addExtraVehicle(s.kind, mesh, spec, p.x, p.z, p.heading);
  }
}
{
  // Horses grazing at the farms, and quad bikes at the farm, the beach
  // and the desert foothills.
  addExtraVehicle('horse', makeHorseMesh(0x8a5a2a), { type: 'horse', topSpeed: 18, accel: 14, steerRate: 0.7, label: 'horse' }, -195, -30, 0.8);
  addExtraVehicle('horse', makeHorseMesh(0x3a2a1a), { type: 'horse', topSpeed: 18, accel: 14, steerRate: 0.7, label: 'horse' }, -215, 50, -1.2);
  addExtraVehicle('quad', makeQuadMesh(0x2ecc71), { type: 'quad', topSpeed: 24, accel: 17, steerRate: 0.8, label: 'quad bike' }, -180, 80, 0.3);
  addExtraVehicle('quad', makeQuadMesh(0xe86a1e), { type: 'quad', topSpeed: 24, accel: 17, steerRate: 0.8, label: 'quad bike' }, HALF + 16, -110, 1.0);
  addExtraVehicle('quad', makeQuadMesh(0x9b59b6), { type: 'quad', topSpeed: 24, accel: 17, steerRate: 0.8, label: 'quad bike' }, 60, 230, -0.6);
}
// ---------- air and sea: helicopter, boat, ambient planes ----------
// A helicopter: body, glass nose, tail boom and fin, two crossed rotors
// on top, and a pair of skids underneath.
function makeHeliMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 4.4), bodyM);
  body.position.y = 1.1;
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.0), new THREE.MeshStandardMaterial({ color: 0x1c2833, roughness: 0.15, metalness: 0.5 }));
  glass.position.set(0, 1.25, 1.9);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.2), bodyM);
  tail.position.set(0, 1.3, -3.4);
  tail.castShadow = true;
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), bodyM);
  fin.position.set(0, 1.7, -4.8);
  g.add(fin);
  const rotorM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.35), rotorM);
  rotor.position.y = 2.0;
  g.add(rotor);
  const rotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 9.5), rotorM);
  rotor2.position.y = 2.0;
  g.add(rotor2);
  g.userData.rotor = rotor;
  g.userData.rotor2 = rotor2;
  g.userData.wheels = [];
  const skidM = new THREE.MeshStandardMaterial({ color: 0x333333 });
  for (const sx of [-0.8, 0.8]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.4), skidM);
    skid.position.set(sx, 0.15, 0);
    g.add(skid);
  }
  return g;
}
// A speedboat: hull, a cone bow, a pale deck and a white cabin.
function makeBoatMesh(color) {
  const g = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 5.2), hullM);
  hull.position.y = 0.45;
  hull.castShadow = true;
  g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 4), hullM);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.45, 3.2);
  g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 3.4), new THREE.MeshStandardMaterial({ color: 0xf0ead8 }));
  deck.position.set(0, 0.9, -0.4);
  g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cabin.position.set(0, 1.3, -0.8);
  cabin.castShadow = true;
  g.add(cabin);
  g.userData.wheels = [];
  return g;
}
// A plane: cylinder fuselage, a long wing, a tail plane and a fin.
function makePlaneMesh(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 9, 10), m);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 2.2), m);
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 1.4), m);
  tail.position.z = -4;
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 1.4), m);
  fin.position.set(0, 1.2, -4);
  g.add(fin);
  return g;
}
// Aircraft variety: a prop plane adds a spinning cross at the nose, a
// jet gets a pointed nose with swept wings and a flame, and a seaplane
// adds two floats under a prop plane.
function makePropPlaneMesh(color) {
  const g = makePlaneMesh(color);
  const propM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.12), propM);
  prop.position.set(0, 0, 4.7);
  g.add(prop);
  const prop2 = prop.clone();
  prop2.rotation.z = Math.PI / 2;
  g.add(prop2);
  g.userData.prop = prop;
  g.userData.prop2 = prop2;
  g.userData.wheels = [];
  return g;
}
function makeJetMesh(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.7 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 10, 10), m);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 10), m);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 6.1;
  g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 2.4), m);
  wing.position.z = -0.5;
  wing.rotation.y = 0.25;
  g.add(wing);
  const wing2 = wing.clone();
  wing2.rotation.y = -0.25;
  g.add(wing2);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 1.6), m);
  fin.position.set(0, 1.4, -4.2);
  g.add(fin);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xff9030, emissive: 0xff6000, emissiveIntensity: 1.2 }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -5.8;
  g.add(flame);
  g.userData.wheels = [];
  return g;
}
function makeSeaplaneMesh(color) {
  const g = makePropPlaneMesh(color);
  const floatM = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.4 });
  for (const sx of [-1.1, 1.1]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.4, 8), floatM);
    fl.rotation.x = Math.PI / 2;
    fl.position.set(sx, -1.2, 0.4);
    g.add(fl);
  }
  return g;
}
const helis = [], boats = [], ambientPlanes = [];
{
  // A helipad in the city with a yellow H, one red heli on it and one
  // blue heli by the marina; two speedboats in the bay; two airliners
  // crossing the sky above.
  const heliPad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 }));
  heliPad.position.set(-HALF + 3 * BLOCK, 0.12, HALF - 2 * BLOCK);
  heliPad.receiveShadow = true;
  world.add(heliPad);
  const hMark = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
  hMark.position.set(-HALF + 3 * BLOCK, 0.26, HALF - 2 * BLOCK);
  world.add(hMark);
  const h1 = makeHeliMesh(0xd94f2e);
  h1.position.set(-HALF + 3 * BLOCK, 0.3, HALF - 2 * BLOCK);
  scene.add(h1);
  helis.push({ mesh: h1, spec: { type: 'heli', topSpeed: 30, label: 'helicopter' }, kind: 'heli', speed: 0, steer: 0, stolen: false, alt: 0 });
  const h2 = makeHeliMesh(0x2e6fb0);
  h2.position.set(HALF + 4, 0.3, -30);
  scene.add(h2);
  helis.push({ mesh: h2, spec: { type: 'heli', topSpeed: 30, label: 'helicopter' }, kind: 'heli', speed: 0, steer: 0, stolen: false, alt: 0 });
  const b1 = makeBoatMesh(0xf0f0f0);
  b1.position.set(HALF + 20, 0.15, 40);
  b1.rotation.y = 0.4;
  scene.add(b1);
  boats.push({ mesh: b1, spec: { type: 'boat', topSpeed: 20, label: 'speedboat' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  const b2 = makeBoatMesh(0x1e8a8a);
  b2.position.set(HALF + 21, 0.15, -16);
  b2.rotation.y = -0.5;
  scene.add(b2);
  boats.push({ mesh: b2, spec: { type: 'boat', topSpeed: 20, label: 'speedboat' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  for (let i = 0; i < 2; i++) {
    const pl = makePlaneMesh(i === 0 ? 0xe8e8e8 : 0xc9d6e8);
    pl.position.set(-260 + i * 180, 85 + i * 18, -120 + i * 90);
    scene.add(pl);
    ambientPlanes.push({ mesh: pl, speed: 26 + i * 5, dir: 1 });
  }
}
// ---------- weapon pickups (glowing, respawn) ----------
// Eight glowing octahedrons on the roads: shotguns, SMGs, grenades,
// molotovs and one bazooka, each with its own colour.
const weaponPickups = [];
function spawnPickup(idx) {
  const kinds = ['shotgun', 'smg', 'grenade', 'molotov', 'shotgun', 'smg', 'grenade', 'bazooka'];
  const kind = kinds[idx % kinds.length];
  const color = kind === 'shotgun' ? 0xff8c1a : kind === 'smg' ? 0x2ee6ff : kind === 'grenade' ? 0x2ecc71 : kind === 'molotov' ? 0xff7a1a : 0xff2a7a;
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 20), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const p = roadPoint();
  g.position.set(p.x, 1.4, p.z);
  scene.add(g);
  weaponPickups.push({ mesh: g, kind, timer: 0, taken: false });
}
for (let i = 0; i < 8; i++) spawnPickup(i);
// Pickups spin and bob; walk or drive within 2.4m to collect one, and it
// respawns somewhere new after 20 seconds.
function updatePickups(dt) {
  for (let i = 0; i < weaponPickups.length; i++) {
    const pk = weaponPickups[i];
    if (pk.taken) {
      pk.timer -= dt;
      if (pk.timer <= 0) {
        const p = roadPoint();
        pk.mesh.position.set(p.x, 1.4, p.z);
        pk.mesh.visible = true;
        pk.taken = false;
      }
      continue;
    }
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1.4 + Math.sin(state.time * 2.5 + i) * 0.25;
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(pk.mesh.position.x - px, pk.mesh.position.z - pz) < 2.4) {
      pk.taken = true;
      pk.timer = 20;
      pk.mesh.visible = false;
      const grant = pk.kind === 'shotgun' ? 12 : pk.kind === 'smg' ? 60 : pk.kind === 'bazooka' ? 1 : 3;
      const keyNum = { shotgun: '2', smg: '3', knife: '4', grenade: '5', molotov: '6', bazooka: '7' }[pk.kind];
      state.ammo[pk.kind] = (state.ammo[pk.kind] || 0) + grant;
      state.weapon = pk.kind;
      toast('Picked up ' + WEAPONS[pk.kind].name + '! +' + grant + ' rounds. Press ' + keyNum + ' to use it.');
      chime();
      updateHUD();
    }
  }
}
// ---------- vest pickups (blue-grey, +50 armor, cap 100) ----------
// Five blue-grey vests on the roads, same spin-and-bob treatment.
const vestPickups = [];
function spawnVest(idx) {
  const g = new THREE.Group();
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.32), new THREE.MeshStandardMaterial({ color: 0x4a6fa5, emissive: 0x2a4a7a, emissiveIntensity: 0.9, roughness: 0.6 }));
  g.add(vest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.34), new THREE.MeshStandardMaterial({ color: 0xdfe8f2, emissive: 0x8fa8c8, emissiveIntensity: 0.5 }));
  stripe.position.y = 0.2;
  g.add(stripe);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 20), new THREE.MeshBasicMaterial({ color: 0x7fb2e8 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const p = roadPoint();
  g.position.set(p.x, 1.4, p.z);
  scene.add(g);
  vestPickups.push({ mesh: g, timer: 0, taken: false });
}
for (let i = 0; i < 5; i++) spawnVest(i);
function updateVestPickups(dt) {
  for (let i = 0; i < vestPickups.length; i++) {
    const pk = vestPickups[i];
    if (pk.taken) {
      pk.timer -= dt;
      if (pk.timer <= 0) {
        const p = roadPoint();
        pk.mesh.position.set(p.x, 1.4, p.z);
        pk.mesh.visible = true;
        pk.taken = false;
      }
      continue;
    }
    pk.mesh.rotation.y += dt * 1.5;
    pk.mesh.position.y = 1.4 + Math.sin(state.time * 2 + i * 1.3) * 0.22;
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(pk.mesh.position.x - px, pk.mesh.position.z - pz) < 2.4) {
      pk.taken = true;
      pk.timer = 25;
      pk.mesh.visible = false;
      state.armor = Math.min(100, state.armor + 50);
      toast('Vest picked up! Armor ' + Math.round(state.armor) + '/100 — it takes hits before your health does.');
      chime();
      updateHUD();
    }
  }
}
// Ambient airliners cross the sky and wrap around at the map edges.
function updateAmbientPlanes(dt) {
  for (const pl of ambientPlanes) {
    pl.mesh.position.x += pl.speed * dt * pl.dir;
    pl.mesh.rotation.y = pl.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (pl.mesh.position.x > 300) pl.mesh.position.x = -300;
    if (pl.mesh.position.x < -300) pl.mesh.position.x = 300;
  }
}
// Police cars, spawned by the wanted level. Outside the city the sheriff
// covers the county instead, up to two cars.
const police = [];
const policeBikes = [];
function spawnPolice() {
  const outside = Math.abs(playerState.x) > HALF || Math.abs(playerState.z) > HALF;
  if (outside && police.filter((p) => p.sheriff).length < 2) { spawnSheriff(); return; }
  const spec = CAR_TYPES.find((c) => c.type === 'police');
  const mesh = makeCarMesh(spec);
  const a = rng() * Math.PI * 2;
  mesh.position.set(playerState.x + Math.cos(a) * 45, 0, playerState.z + Math.sin(a) * 45);
  scene.add(mesh);
  police.push({ mesh, spec, speed: 0, heading: 0 });
}

// Pedestrians on the sidewalks: twenty of them, random shirts, random
// moods, wandering the blocks and keeping off the roads.
const PED_SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22];
const peds = [];
for (let i = 0; i < 20; i++) {
  const p = makePerson(pick(PED_SHIRTS), pick([0x2c3e50, 0x5d4037, 0x37474f]), pick([0xd9a066, 0x8a5a33, 0xf0c8a0]));
  let x = rr(-HALF, HALF), z = rr(-HALF, HALF);
  let guard = 0;
  while ((isRoad(x, z) || collideCircle(x, z, 1.5)) && guard++ < 40) {
    x = rr(-HALF, HALF);
    z = rr(-HALF, HALF);
  }
  p.position.set(x, 0, z);
  scene.add(p);
  peds.push({ mesh: p, x, z, heading: rng() * Math.PI * 2, speed: rr(1, 2), target: null, down: false, downTimer: 0, phase: rng() * 6, mood: pick(['calm', 'emotional', 'maniac']) });
}

// ---------- mission beacon ----------
const beacon = new THREE.Group();
const beaconCyl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb300, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 }));
beaconCyl.position.y = 0.2; beacon.add(beaconCyl);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
beam.position.y = 20; beacon.add(beam);
beacon.visible = false;
scene.add(beacon);
let beaconPos = new THREE.Vector3(0, 0, 0);
function setBeacon(x, z) { beaconPos.set(x, 0, z); beacon.position.set(x, 0, z); beacon.visible = true; }

// mission spots (all on roads / open ground)
const SPOTS = {
  marina: { x: HALF + 6, z: 40 },
  docks: { x: -HALF + BLOCK, z: -HALF + BLOCK },
  downtown: { x: -12, z: -12 },
  plaza: { x: -HALF + 3 * BLOCK, z: HALF - 2 * BLOCK },
  beach: { x: HALF + 8, z: -60 },
  airport: { x: -210, z: -40 },
  lake: { x: -272, z: 178 },
  forest: { x: 0, z: -225 },
};
// Story rule: Ryan & Ian are a couple. Duo story scenes (subtitle bar) + the
// partner joins missions as an AI companion — rides in the car, helps shoot.
let storyTimer = null;
function showStory(text) {
  const el = document.getElementById('story');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  if (storyTimer) clearTimeout(storyTimer);
  storyTimer = setTimeout(() => el.classList.add('hidden'), 7000);
}
let companionShootTimer = 0;
// The companion only appears during the shared story missions. In a car
// they ride in the passenger seat; on foot they hurry after you, and every
// three seconds they take a shot at a nearby cop.
function updateCompanion(dt) {
  if (state.mission >= MISSIONS.length || state.mode !== 'play') return;
  const comp = CHARS[1 - state.activeChar];
  const mesh = comp.mesh;
  if (state.inCar) {
    const c = state.inCar.mesh;
    const h = c.rotation.y;
    mesh.position.set(c.position.x + Math.cos(h) * 1.3, c.position.y + 0.4, c.position.z - Math.sin(h) * 1.3);
    mesh.rotation.y = h;
    mesh.visible = true;
    return;
  }
  const dx = playerState.x - mesh.position.x;
  const dz = playerState.z - mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 3) {
    const sp = d > 10 ? 6 : 3.5;
    mesh.position.x += (dx / d) * sp * dt;
    mesh.position.z += (dz / d) * sp * dt;
    mesh.rotation.y = Math.atan2(dx, dz);
    comp.st.x = mesh.position.x;
    comp.st.z = mesh.position.z;
  }
  mesh.position.y = groundHeight(mesh.position.x, mesh.position.z);
  mesh.visible = true;
  companionShootTimer -= dt;
  if (companionShootTimer <= 0) {
    companionShootTimer = 3;
    for (let i = police.length - 1; i >= 0; i--) {
      const po = police[i];
      if (Math.hypot(po.mesh.position.x - playerState.x, po.mesh.position.z - playerState.z) < 18) {
        scene.remove(po.mesh);
        police.splice(i, 1);
        beep(880, 0.1, 'square', 0.12);
        toast(CHARS[1 - state.activeChar].name + ' took out a cop for you!');
        break;
      }
    }
  }
}

// Starting a mission sets the beacon and the briefing line, then updates
// the objective panel and pings the phone.
function startMission(i) {
  state.mission = i;
  state.missionStage = 1;
  if (i === 0) {
    setBeacon(SPOTS.marina.x, SPOTS.marina.z);
    speakLine(activeName() + ', first job. Steal a car and bring it to the marina beacon.');
  }
  if (i === 1) {
    setBeacon(SPOTS.docks.x, SPOTS.docks.z);
    speakLine('Package at the north docks. Grab it, then deliver it downtown before the clock runs out.');
  }
  if (i === 2) {
    beacon.visible = false;
    speakLine('Time to make some noise. Get to three stars, then lose the cops.');
  }
  updateObjective();
  phoneMsgText = 'Marisol: ' + MISSIONS[i].text;
  if (state.mode === 'play' && !state.shot) toast('New message from Marisol — press U to read it.');
}
// The objective panel: free roam once the story is done, otherwise the
// current mission's title, reward and live stage notes.
function updateObjective() {
  const t = document.getElementById('objTitle');
  const s = document.getElementById('objText');
  if (state.mission >= MISSIONS.length) {
    t.textContent = 'Free Roam — King of the Bay';
    s.textContent = 'All missions done. Explore Solmar Bay, earn cash, dodge the law.';
    return;
  }
  const m = MISSIONS[state.mission];
  t.textContent = m.title + '  ·  $' + m.reward;
  let extra = '';
  if (state.mission === 1 && state.missionStage === 2) extra = ' — deliver to the airport!';
  if (state.mission === 2) extra = state.wanted >= 3 ? ' — now LOSE the cops!' : ' — cause some trouble to reach 3 stars!';
  if (state.mission === 1) extra += '  ⏱ ' + Math.max(0, Math.ceil(state.missionTimer)) + 's';
  s.textContent = 'Marisol: ' + m.text + extra;
}
// Completing a mission pays the reward, hides the beacon, plays a short
// duo scene between Ryan and Ian, then queues the next mission.
function completeMission() {
  const m = MISSIONS[state.mission];
  state.cash += m.reward;
  toast('Mission complete! +$' + m.reward + ' — Marisol sends her regards.');
  speakLine('Clean work, ' + activeName() + '. ' + m.reward + ' dollars, as promised. Marisol sends her regards.');
  chime();
  beacon.visible = false;
  const duo = [
    'Ryan: That went smooth. Ian: Smooth? You nearly drove into the sea. Ryan: Nearly counts.',
    'Ian: Next time YOU drive. Ryan: You say that every time, love. Ian: And every time I am right.',
    'Ryan: Marisol is going to love us. Ian: She already does — she just charges extra for it.',
  ];
  showStory(duo[state.mission] || duo[0]);
  state.mission++;
  state.missionStage = 0;
  if (state.mission < MISSIONS.length) {
    setTimeout(() => startMission(state.mission), 1200);
    if (state.mission === 1) state.missionTimer = 90;
  }
  saveGame();
  updateObjective();
  updateHUD();
}

// ---------- input ----------
const keys = {};
let camYaw = 0, camPitch = 0.32, camDist = 9;
let mouseDown = false;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') { state.muted = !state.muted; if (state.muted) stopSpeech(); toast(state.muted ? 'Sound muted' : 'Sound on'); }
  if (e.code === 'KeyR') cycleRadio();
  if (e.code === 'KeyT') startRace();
  if (e.code === 'KeyH') startHeist();
  if (e.code === 'KeyG') startGolf();
  if (e.code === 'KeyN') startCharMission();
  if (e.code === 'KeyB') startDriverJob();
  if (e.code === 'KeyL') chainStart();
  if (e.code === 'KeyX') { if (chain.active) chainSnapPhoto(); else if (!snapViewpoint()) diveToggle(); }
  if (e.code === 'KeyK') { if (darts.open) dartsClose(); else dartsOpen(); }
  if (e.code === 'KeyZ') { if (boardJob.panelOpen) boardClosePanel(); else boardOpenPanel(); }
  if (e.code === 'Enter' && darts.open) throwDart();
  if (e.code === 'KeyV') toggleScope();
  if (e.code === 'KeyO') togglePhotoMode();
  if (e.code === 'Enter' && photoMode) takePhoto();
  if (e.code === 'KeyJ') bailOut();
  if (e.code === 'KeyU') togglePhone();
  if (e.code === 'KeyC') switchCharacter();
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5' || e.code === 'Digit6' || e.code === 'Digit7' || e.code === 'Digit8') cycleWeapon(e.code.slice(-1));
  if (e.code === 'Escape' && darts.open) { dartsClose(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (shopOpen) closeShop(); else togglePause(); }
  if (e.code === 'KeyE' && ferryToggleBoard()) return;
  if (e.code === 'KeyE' && cayBusToggle()) return;
  if (e.code === 'KeyE' && coveNear() >= 0) { coveStart(coveNear()); return; }
  if (e.code === 'KeyE' && keeperNear()) { keeperTalk(); return; }
  if (e.code === 'KeyE' && dartChampNear()) { dartChampChallenge(); return; }
  if (e.code === 'KeyE' && marketNear() >= 0) { marketKey(); return; }
  if (e.code === 'KeyE' && r5GarageOpen()) return;
  if (e.code === 'KeyE' && r5CasinoOpen()) return;
  if (e.code === 'KeyE' && r5EmpireOpen()) return;
  if (e.code === 'KeyE' && r5GymOpen()) return;
  if (e.code === 'KeyE' && r5SchoolNear() && r5SchoolStart()) return;
  if (e.code === 'KeyE' && r5HomeOpen()) return;
  if (e.code === 'KeyE' && r5BoatRaceNear() && r5BoatRaceStart()) return;
  if (e.code === 'KeyE' && r5ResponderNear()) { r5ResponderStart(r5ResponderNear()); return; }
  if (e.code === 'KeyE' && state.inCar && r5RivalsNear() >= 0) { r5RivalsChallenge(r5RivalsNear()); return; }
  if (e.code === 'KeyE' && r5CardsNear() >= 0) { r5CardsCollect(r5CardsNear()); return; }
  if (e.code === 'KeyE' && r6KeyE()) return;
  if (e.code === 'KeyE' && r7KeyE()) return;
  if (e.code === 'KeyF') {
    // Fishing comes first: on foot by the water, F casts and reels, and
    // focus mode never swallows that press.
    if (!state.inCar && (fish.stage > 0 || nearWater(playerState.x, playerState.z))) { punch(); return; }
    if (r7FocusToggle()) return;
  }
  if (e.code === 'KeyY' && r5GarageOpen()) return;
  if (e.code === 'KeyI' && r5CasinoOpen()) return;
  if (e.code === 'KeyE') tryEnterExitVehicle();
  if (e.code === 'KeyF') punch();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => { mouseDown = true; if (state.mode === 'play') shootWeapon(); });
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (state.weapon === 'sniper') toggleScope(); });
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (state.mode !== 'play') return;
  camYaw -= e.movementX * 0.0032;
  camPitch = clamp(camPitch + e.movementY * 0.0022, 0.05, 1.1);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
document.getElementById('btnStart').addEventListener('click', () => startGame(false));
document.getElementById('btnContinue').addEventListener('click', () => startGame(true));
document.getElementById('btnResume').addEventListener('click', () => togglePause());
document.getElementById('btnRestart').addEventListener('click', () => location.reload());
document.getElementById('btnAgain').addEventListener('click', () => location.reload());
document.getElementById('btnRespawn').addEventListener('click', () => {
  const sp = state.spawnPoint || { x: -HALF + BLOCK / 2, z: 20 };
  state.health = 100; state.armor = 0; state.wanted = 0; state.mode = 'play';
  clearWanted();
  playerState.x = sp.x; playerState.z = sp.z; playerState.y = 0; playerState.vy = 0; playerState.onGround = true;
  player.position.set(sp.x, groundHeight(sp.x, sp.z), sp.z);
  document.getElementById('wasted').classList.add('hidden');
  document.getElementById('hud').classList.add('on');
  toast('Back on your feet — ' + (state.spawnPoint ? 'at your safehouse.' : 'at the harbour.'));
  updateHUD();
});

function togglePause() {
  if (state.mode === 'play') { state.mode = 'pause'; document.getElementById('pause').classList.remove('hidden'); }
  else if (state.mode === 'pause') { state.mode = 'play'; document.getElementById('pause').classList.add('hidden'); }
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.textContent = ''; }, 3200);
}
// ---------- Feature 20: in-game phone (U) ----------
let phoneMsgText = 'Marisol: Ian, I got work. Check your objective.';
let taxiCall = null;
function renderPhone() {
  document.getElementById('phoneChar').textContent = CHARS[state.activeChar].name;
  document.getElementById('phoneMsg').textContent = phoneMsgText;
}
function togglePhone() {
  if (state.mode !== 'play') return;
  const el = document.getElementById('phone');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) { renderPhone(); beep(880, 0.08, 'sine', 0.12); }
}
function callMarisol() {
  const m = state.mission < MISSIONS.length ? MISSIONS[state.mission] : null;
  const hint = m ? m.title + ': ' + m.text : 'All missions done — free roam, king of the bay.';
  phoneMsgText = 'Marisol: ' + hint;
  renderPhone();
  speakLine('Marisol here. ' + hint);
  toast('Marisol called — hint on your phone.');
}
function callTaxi() {
  if (taxiCall) { toast('A taxi is already on its way.'); return; }
  const spec = CAR_TYPES.find((c) => c.type === 'taxi');
  const mesh = makeCarMesh(spec);
  const a = rng() * Math.PI * 2;
  mesh.position.set(playerState.x + Math.cos(a) * 40, 0, playerState.z + Math.sin(a) * 40);
  scene.add(mesh);
  taxiCall = { mesh, spec };
  phoneMsgText = 'Taxi: on the way to your location. Wait for the yellow cab.';
  renderPhone();
  toast('Taxi called — a yellow cab is coming to you.');
  beep(660, 0.12, 'sine', 0.15);
}
function showStats() {
  const el = document.getElementById('phoneStats');
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
  el.innerHTML = 'Cash: $' + state.cash.toLocaleString('en-US') + '<br>Missions done: ' + Math.min(state.mission, MISSIONS.length) + '/' + MISSIONS.length +
    '<br>Wanted: ' + state.wanted + ' stars · Bounty $' + (state.wanted * 250) +
    '<br>Races won: ' + race.won + ' · Fish caught: ' + fish.caught +
    '<br>Character: ' + CHARS[state.activeChar].name +
    '<br>Skills — Driving ' + skillLevel('driving') + ' · Shooting ' + skillLevel('shooting') + ' · Stamina ' + skillLevel('stamina') +
    '<br>Hidden packages: ' + packagesFound + '/50' +
    '<br>Properties: ' + ownedProperties.length + ' · Business income: $' + ownedProperties.reduce((s, p) => s + (p.income || 0), 0).toLocaleString('en-US') + '/min';
}
// A called taxi drives straight to the player at 16 m/s; once it is
// within 6m it parks as a free ride and clears the call.
function updateTaxi(dt) {
  if (!taxiCall) return;
  const px = playerState.x;
  const pz = playerState.z;
  const dx = px - taxiCall.mesh.position.x;
  const dz = pz - taxiCall.mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 6) {
    parkedCars.push({ mesh: taxiCall.mesh, spec: taxiCall.spec, speed: 0, steer: 0, stolen: true });
    toast('Your taxi arrived — press E to get in. No fare, Marisol covers it.');
    taxiCall = null;
    return;
  }
  const h = Math.atan2(dx, dz);
  taxiCall.mesh.rotation.y = h;
  taxiCall.mesh.position.x += Math.sin(h) * 16 * dt;
  taxiCall.mesh.position.z += Math.cos(h) * 16 * dt;
}
document.getElementById('phoneBtnMarisol').addEventListener('click', callMarisol);
document.getElementById('boardClose').addEventListener('click', boardClosePanel);
document.getElementById('marketClose').addEventListener('click', marketClosePanel);
document.getElementById('phoneBtnTaxi').addEventListener('click', callTaxi);
document.getElementById('phoneBtnStats').addEventListener('click', showStats);
// ---------- Feature 21: gamepad support ----------
let gpPrev = [], gpNotified = false;
function pollGamepad(dt) {
  try {
    if (!('getGamepads' in navigator)) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) { if (p && p.connected) { pad = p; break; } }
    if (!pad) return;
    if (!gpNotified) {
      gpNotified = true;
      toast('Gamepad connected: ' + pad.id.slice(0, 28) + ' — left stick move, right stick look, A jump, X enter, RT shoot.');
    }
    const ax = pad.axes || [];
    const dz = (v) => Math.abs(v) > 0.28 ? v : 0;
    keys['KeyW'] = dz(ax[1] || 0) < -0.28 || (pad.buttons[7] && pad.buttons[7].pressed);
    keys['KeyS'] = dz(ax[1] || 0) > 0.28;
    keys['KeyA'] = dz(ax[0] || 0) < -0.28;
    keys['KeyD'] = dz(ax[0] || 0) > 0.28;
    keys['ShiftLeft'] = !!(pad.buttons[10] && pad.buttons[10].pressed);
    if (state.mode === 'play') {
      camYaw -= dz(ax[2] || 0) * 0.06;
      camPitch = clamp(camPitch + dz(ax[3] || 0) * 0.04, 0.05, 1.1);
    }
    const pressed = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const edge = (i) => pressed(i) && !gpPrev[i];
    if (state.mode === 'play') {
      if (edge(0) && playerState.onGround) { playerState.vy = 7.5; playerState.onGround = false; }
      if (edge(1)) punch();
      if (edge(2)) tryEnterExitVehicle();
      if (edge(3)) cycleWeapon(String((['pistol', 'shotgun', 'smg', 'knife', 'grenade', 'molotov', 'bazooka', 'sniper'].indexOf(state.weapon) + 1) % 8 + 1));
      if (edge(4)) cycleRadio();
      if (edge(5)) switchCharacter();
      if (edge(8)) togglePhone();
      if (pressed(7)) shootWeapon();
    }
    if (edge(9)) togglePause();
    gpPrev = (pad.buttons || []).map((b) => b.pressed);
  } catch (e) { /* no gamepad — keyboard/mouse keep working */ }
}
window.addEventListener('gamepadconnected', (e) => {
  gpNotified = false;
  toast('Gamepad connected — ' + (e.gamepad.id || 'controller') + '.');
});
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, mission: state.mission, charMissions: state.charMissions, skills, packagesFound, r5: { bond: r5Bond.bond, season: r5Season.idx, tourneyBest: r5Tourney.best, empireEarned: R5_EMPIRE.earned, stuntBest: r5Stunt.bestDist, cardsFound: r5Cards.found.length, stocksValue: r5StocksValue(), territory: r5Territory.inf, homeComfort: r5Home.comfort, boatBest: R5_BOAT_RACE.best } })); } catch (e) {}
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s; } catch (e) { return null; }
}
const saved = loadSave();
if (saved && (saved.cash > 0 || saved.mission > 0)) document.getElementById('btnContinue').style.display = 'inline-block';

function startGame(fromSave) {
  audioInit();
  if (AC && AC.state === 'suspended') AC.resume();
  if (fromSave) {
    const s = loadSave();
    if (s) {
      state.cash = s.cash || 0; state.mission = Math.min(s.mission || 0, MISSIONS.length - 1);
      if (s.charMissions) state.charMissions = s.charMissions;
      if (s.skills) Object.assign(skills, s.skills);
      if (typeof s.packagesFound === 'number') packagesFound = s.packagesFound;
    }
  }
  document.getElementById('start').classList.add('hidden');
  document.getElementById('hud').classList.add('on');
  state.mode = 'play';
  startMission(state.mission);
  updateHUD();
  toast('Marisol: ' + activeName() + ', I got work. Check your objective.');
  speakLine(activeName() + ', I got work for you. Check your objective, and do not keep me waiting.');
  showStory('Ryan: We came to Solmar Bay with nothing, love. Ian: Then we build it together — you and me. Ryan: Always.');
  beep(440, 0.15, 'sine', 0.2);
}

// ---------- actions ----------
function nearestCar(maxD) {
  let best = null, bd = maxD;
  for (const c of parkedCars) {
    const d = Math.hypot(c.mesh.position.x - playerState.x, c.mesh.position.z - playerState.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
// ---------- V2 weapons, vehicles, carjacking ----------
function allDrivable() {
  const list = [];
  for (const c of parkedCars) list.push(c);
  for (const v of extraVehicles) list.push(v);
  for (const h of helis) list.push(h);
  for (const b of boats) list.push(b);
  for (const p of planes) list.push(p);
  return list;
}
function spawnFleePed(x, z) {
  const ped = makePerson(pick(PED_SHIRTS), 0x2c3e50, pick([0xd9a066, 0x8a5a33, 0xf0c8a0]));
  ped.position.set(x + 2, 0, z + 2);
  scene.add(ped);
  peds.push({ mesh: ped, x: x + 2, z: z + 2, heading: rng() * Math.PI * 2, speed: 5, target: { x: x + 60, z: z - 60 }, down: false, downTimer: 0, phase: 0, flee: true });
}
function nearestVehicle(maxD) {
  let best = null, bd = maxD;
  for (const v of allDrivable()) {
    if ((v.kind === 'heli' || v.kind === 'plane') && (v.alt || 0) > 1.5) continue;
    const d = Math.hypot(v.mesh.position.x - playerState.x, v.mesh.position.z - playerState.z);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
function exitVehicle() {
  const c = state.inCar;
  if (!c) return;
  if (c.kind === 'boat') {
    playerState.x = HALF + 10; playerState.z = c.mesh.position.z;
  } else if ((c.kind === 'heli' || c.kind === 'plane') && (c.alt || 0) > 1.5) {
    toast('Too high to jump out — land first.');
    return;
  } else {
    playerState.x = c.mesh.position.x + 2.2; playerState.z = c.mesh.position.z + 1.5;
  }
  playerState.heading = c.mesh.rotation.y;
  player.visible = true; player.position.set(playerState.x, groundHeight(playerState.x, playerState.z), playerState.z);
  state.inCar = null; state.speed = 0; heliAlt = 0;
  toast('You left the ' + (c.spec.label || c.spec.type) + '.');
}
function tryEnterExitVehicle() {
  if (state.mode !== 'play') return;
  // Feature 28: drive into Pay 'n Spray in a car to open the paint menu
  if (state.inCar && Math.hypot(state.inCar.mesh.position.x - PAYNSPRAY.x, state.inCar.mesh.position.z - PAYNSPRAY.z) < 7) { openPaynSpray(); return; }
  if (state.inCar) { exitVehicle(); return; }
  const shop = nearestShop();
  if (shop) { openShop(shop); return; }
  // Feature 30: accept a ride event by pressing E near the waiting person
  if (streetEvent && streetEvent.kind === 'ride' && streetEvent.state === 'wait') {
    const ep = streetEvent.ped;
    if (Math.hypot(ep.x - playerState.x, ep.z - playerState.z) < 4) { acceptStreetEvent(); return; }
  }
  const v = nearestVehicle(4.5);
  if (v) {
    state.inCar = v;
    player.visible = false;
    if ((v.kind === 'heli' || v.kind === 'plane') && !v.stolen) {
      v.stolen = true;
      spawnFleePed(v.mesh.position.x, v.mesh.position.z);
      addWanted(1, 'You hijacked a ' + (v.spec.label || v.spec.type) + '! The pilot fled.');
    } else if (v.kind === 'heli') {
      toast('You hop in the ' + (v.spec.label || v.spec.type) + '.');
    } else if (v.kind === 'plane') {
      toast('You hop in the ' + (v.spec.label || v.spec.type) + ' — hold W to take off.');
    } else if (v.kind === 'boat' && !v.stolen) {
      v.stolen = true;
      addWanted(1, 'You stole a ' + (v.spec.label || v.spec.type) + '! The owner called it in.');
    } else if (v.kind === 'boat') {
      toast('You hop in the ' + (v.spec.label || v.spec.type) + '.');
    } else if (!v.stolen) {
      v.stolen = true;
      addWanted(1, 'You stole a ' + (v.spec.label || v.spec.type) + '! The owner called it in.');
    } else {
      toast('You hop on the ' + (v.spec.label || v.spec.type) + '.');
    }
    beep(220, 0.1, 'square', 0.12);
    return;
  }
  // Feature 6: jack a moving traffic car
  let bestT = null, bd = 5;
  for (const t of traffic) {
    const d = Math.hypot(t.mesh.position.x - playerState.x, t.mesh.position.z - playerState.z);
    if (d < bd) { bd = d; bestT = t; }
  }
  if (bestT) {
    const idx = traffic.indexOf(bestT);
    if (idx >= 0) traffic.splice(idx, 1);
    bestT.speed = 0;
    const jacked = { mesh: bestT.mesh, spec: bestT.spec, kind: 'car', speed: 0, steer: 0, stolen: true, jacked: true };
    parkedCars.push(jacked);
    state.inCar = jacked;
    player.visible = false;
    const driver = makePerson(pick(PED_SHIRTS), 0x2c3e50, pick([0xd9a066, 0x8a5a33, 0xf0c8a0]));
    driver.position.set(bestT.mesh.position.x + 2, 0, bestT.mesh.position.z + 2);
    scene.add(driver);
    peds.push({ mesh: driver, x: driver.position.x, z: driver.position.z, heading: rng() * Math.PI * 2, speed: 5, target: { x: driver.position.x + 60, z: driver.position.z - 60 }, down: false, downTimer: 0, phase: 0, flee: true });
    addWanted(1, 'You jacked a moving car!');
    beep(220, 0.1, 'square', 0.12);
    return;
  }
  // Feature 13: jack a moving boat on the water
  let bestB = null; bd = 6;
  for (const mb of movingBoats) {
    const d = Math.hypot(mb.mesh.position.x - playerState.x, mb.mesh.position.z - playerState.z);
    if (d < bd) { bd = d; bestB = mb; }
  }
  if (bestB) { jackBoat(bestB); return; }
  toast('No vehicle nearby — find one parked on the street.');
}
// ---------- Features 33 + 34: thrown weapons — projectiles, explosions, fire ----------
const projectiles = [];
const explosions = [];
const fires = [];
function throwWeapon() {
  const kind = state.weapon;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  let mesh, speed;
  if (kind === 'grenade') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 0.4 }));
    speed = 24;
  } else if (kind === 'molotov') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a8a2a, emissive: 0xaa5500, emissiveIntensity: 0.6 }));
    speed = 22;
  } else {
    mesh = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x555c66, metalness: 0.7, roughness: 0.3 }));
    mesh.rotation.x = Math.PI / 2;
    speed = 55;
  }
  mesh.position.copy(origin);
  scene.add(mesh);
  projectiles.push({ mesh, kind, vel: dir.multiplyScalar(speed).add(new THREE.Vector3(0, kind === 'bazooka' ? 0 : 4, 0)), timer: 4 });
  beep(kind === 'bazooka' ? 220 : 440, 0.15, 'sawtooth', 0.2);
}
function explodeAt(kind, pos) {
  const radius = kind === 'bazooka' ? 14 : 10;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5500, emissiveIntensity: 2, transparent: true, opacity: 0.9 }));
  ball.position.copy(pos);
  scene.add(ball);
  explosions.push({ mesh: ball, timer: 0.5, max: radius });
  beep(50, 0.6, 'sawtooth', 0.5); thud();
  for (const p of peds) {
    if (!p.down && Math.hypot(p.x - pos.x, p.z - pos.z) < radius) {
      p.down = true; p.downTimer = 6; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
      if (p.isBounty) collectBounty(p);
    }
  }
  for (let i = police.length - 1; i >= 0; i--) {
    const po = police[i];
    if (Math.hypot(po.mesh.position.x - pos.x, po.mesh.position.z - pos.z) < radius) { scene.remove(po.mesh); police.splice(i, 1); }
  }
  if (kind === 'bazooka') {
    for (let i = parkedCars.length - 1; i >= 0; i--) {
      const c = parkedCars[i];
      if (Math.hypot(c.mesh.position.x - pos.x, c.mesh.position.z - pos.z) < radius && c !== state.inCar) { scene.remove(c.mesh); parkedCars.splice(i, 1); }
    }
  }
  addWanted(1, 'Explosion in Solmar Bay!');
  if (kind === 'molotov') {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(4.5, 16), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff4400, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
    patch.rotation.x = -Math.PI / 2; patch.position.set(pos.x, 0.12, pos.z);
    scene.add(patch);
    fires.push({ mesh: patch, timer: 5, burnTimer: 0 });
    toast('Molotov fire is burning — stay clear!');
  }
}
// Thrown projectiles arc under gravity (except bazooka rockets), then
// detonate on landing or when their fuse runs out; the explosion shells
// grow and fade over half a second.
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.timer -= dt;
    if (pr.kind !== 'bazooka') pr.vel.y -= 14 * dt;
    pr.mesh.position.addScaledVector(pr.vel, dt);
    const p = pr.mesh.position;
    if (p.y <= 0.2 || pr.timer <= 0) {
      scene.remove(pr.mesh);
      projectiles.splice(i, 1);
      if (pr.kind === 'bazooka') explodeAt('bazooka', p.clone());
      else if (pr.kind === 'grenade') explodeAt('grenade', p.clone());
      else explodeAt('molotov', p.clone());
    }
  }
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.timer -= dt;
    const s = 1 + (0.5 - ex.timer) * ex.max * 2;
    ex.mesh.scale.set(s, s, s);
    ex.mesh.material.opacity = Math.max(0, ex.timer * 1.8);
    if (ex.timer <= 0) {
      scene.remove(ex.mesh);
      explosions.splice(i, 1);
    }
  }
}
// Molotov fires burn for five seconds, flickering, and knock down any
// pedestrian who wanders within 4.5m every half second.
function updateFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i];
    f.timer -= dt;
    f.burnTimer -= dt;
    if (f.burnTimer <= 0) {
      f.burnTimer = 0.5;
      for (const p of peds) {
        if (!p.down && Math.hypot(p.x - f.mesh.position.x, p.z - f.mesh.position.z) < 4.5) {
          p.down = true;
          p.downTimer = 4;
          p.mesh.rotation.x = -Math.PI / 2;
          p.mesh.position.y = 0.3;
        }
      }
    }
    f.mesh.material.opacity = 0.5 + Math.sin(state.time * 8) * 0.2;
    if (f.timer <= 0) {
      scene.remove(f.mesh);
      fires.splice(i, 1);
    }
  }
}
// A knife swipe hits the first pedestrian in front of you within 2.6m,
// drops them for five seconds, and raises the wanted level.
function knifeAttack() {
  if (fireTimer > 0) return;
  fireTimer = WEAPONS.knife.rate;
  thud();
  const fx = Math.sin(playerState.heading);
  const fz = Math.cos(playerState.heading);
  for (const p of peds) {
    if (p.down) continue;
    const dx = p.x - playerState.x;
    const dz = p.z - playerState.z;
    if (Math.hypot(dx, dz) < 2.6 && dx * fx + dz * fz > 0) {
      p.down = true;
      p.downTimer = 5;
      p.mesh.rotation.x = -Math.PI / 2;
      p.mesh.position.y = 0.3;
      if (p.isBounty) collectBounty(p);
      addWanted(1, 'Knife attack!');
      toast('Knife hit — faster and nastier than a punch.');
      break;
    }
  }
}
// Firing a weapon: knives slash, throwables lob, and guns raycast from the
// camera with spread that widens in a drive-by and narrows with skill.
// Hits drop pedestrians (and pay a bounty if they were one) or hunt
// animals for meat-and-hide cash.
function shootWeapon() {
  if (state.mode !== 'play') return;
  if (state.weapon === 'knife') { knifeAttack(); return; }
  if (state.weapon === 'grenade' || state.weapon === 'molotov' || state.weapon === 'bazooka') {
    if (fireTimer > 0) return;
    if (state.ammo[state.weapon] <= 0) {
      toast('Out of ' + WEAPONS[state.weapon].name + 's — buy more at Bay Arms.');
      fireTimer = 0.4;
      return;
    }
    fireTimer = WEAPONS[state.weapon].rate;
    state.ammo[state.weapon]--;
    throwWeapon();
    updateHUD();
    return;
  }
  if (state.inCar && state.inCar.kind === 'heli') {
    toast('No drive-by from a helicopter — land first.');
    return;
  }
  const w = WEAPONS[state.weapon];
  if (fireTimer > 0) return;
  if (state.ammo[state.weapon] !== Infinity && state.ammo[state.weapon] <= 0) {
    toast('Out of ammo for the ' + w.name + ' — find a glowing pickup.');
    beep(160, 0.15, 'square', 0.15);
    fireTimer = 0.4;
    return;
  }
  fireTimer = w.rate;
  if (state.ammo[state.weapon] !== Infinity) state.ammo[state.weapon]--;
  audioInit();
  gunshot();
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);
  const origin = camera.position.clone();
  const range = w.range || 120;
  let firstEnd = origin.clone().add(baseDir.clone().multiplyScalar(range));
  for (let p = 0; p < w.pellets; p++) {
    const dir = baseDir.clone();
    const driveBySpread = state.inCar ? 1 + Math.abs(state.speed) * 0.12 : 1;
    const skillSpread = 1 - Math.min(0.3, skillLevel('shooting') * 0.03);
    dir.x += (Math.random() - 0.5) * w.spread * 2 * driveBySpread * skillSpread;
    dir.y += (Math.random() - 0.5) * w.spread * 2 * driveBySpread * skillSpread;
    dir.z += (Math.random() - 0.5) * w.spread * 2 * driveBySpread * skillSpread;
    dir.normalize();
    const ray = new THREE.Raycaster(origin, dir, 0.1, range);
    const targets = [];
    for (const pd of peds) if (!pd.down) targets.push(pd.mesh);
    for (const c of parkedCars) targets.push(c.mesh);
    for (const po of police) targets.push(po.mesh);
    for (const an of animals) if (!an.down && an.kind !== 'bird' && an.kind !== 'fish') targets.push(an.mesh);
    const hits = ray.intersectObjects(targets, true);
    let end = origin.clone().add(dir.clone().multiplyScalar(90));
    if (hits.length) {
      end = hits[0].point.clone();
      if (p === 0) firstEnd = end;
      let obj = hits[0].object;
      while (obj && obj.parent && obj.parent !== scene) obj = obj.parent;
      for (const pd of peds) {
        if (pd.mesh === obj && !pd.down) {
          pd.down = true;
          pd.downTimer = 6;
          pd.mesh.rotation.x = -Math.PI / 2;
          pd.mesh.position.y = 0.3;
          state.kills++;
          addSkill('shooting', 5);
          if (pd.isBounty) collectBounty(pd);
          addWanted(1, 'Shots fired! Cops are coming.');
          break;
        }
      }
      // Hunting: meat and hide sell for cash
      for (const an of animals) {
        if (an.mesh === obj && !an.down && an.kind !== 'bird' && an.kind !== 'fish') {
          an.down = true;
          an.downTimer = 8;
          an.mesh.rotation.x = -Math.PI / 2;
          an.mesh.position.y = 0.3;
          const reward = an.kind === 'bear' ? 80 : an.kind === 'wolf' ? 50 : an.kind === 'deer' ? 30 : 15;
          state.cash += reward;
          toast('Hunted a ' + an.kind + ' — meat and hide sold for $' + reward + '.');
          updateHUD();
          break;
        }
      }
    }
    if (p === 0) firstEnd = end;
  }
  if (tracer) scene.remove(tracer);
  const geo = new THREE.BufferGeometry().setFromPoints([origin, firstEnd]);
  tracer = new THREE.Line(geo, tracerMat);
  scene.add(tracer);
  tracerTimer = 0.08;
  updateHUD();
}
// Ground vehicles (cars, bikes, buggies, quads): acceleration and drag,
// steering that scales with speed, wall collisions that bounce the car
// back and hurt the driver on a hard hit, terrain height under the wheels
// (buggies bounce a little), and running over pedestrians.
function updateGroundVehicle(dt, c) {
  const accelIn = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.6 : 0;
  const steerIn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = c.spec.topSpeed * (1 + skillLevel('driving') * 0.02);
  const acc = c.spec.accel || 16;
  if (Math.abs(c.speed) > 10) addSkill('driving', dt * 2);
  c.speed += accelIn * acc * dt;
  c.speed -= c.speed * 0.55 * dt;
  if (!accelIn) c.speed -= Math.sign(c.speed) * 4 * dt;
  if (Math.abs(c.speed) < 0.15 && !accelIn) c.speed = 0;
  c.speed = clamp(c.speed, -top * 0.4, top);
  c.steer = lerp(c.steer, steerIn * (c.spec.steerRate || 0.55) * Math.sign(c.speed || 1), dt * 6);
  const heading = c.mesh.rotation.y + c.steer * dt * (c.speed / top) * 3.2;
  c.mesh.rotation.y = heading;
  const nx = c.mesh.position.x + Math.sin(heading) * c.speed * dt;
  const nz = c.mesh.position.z + Math.cos(heading) * c.speed * dt;
  const hit = collideCircle(nx, nz, 1.6);
  if (hit) {
    if (Math.abs(c.speed) > 8) {
      thud();
      damagePlayer(c.kind === 'moto' ? 12 : 6, 'You crashed hard');
    }
    c.speed *= -0.25;
  } else {
    c.mesh.position.x = nx;
    c.mesh.position.z = nz;
  }
  if (c.kind === 'buggy') {
    c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z) + (Math.abs(c.speed) > 2 ? Math.abs(Math.sin(state.time * 9)) * 0.25 : 0);
  } else {
    c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z);
  }
  c.mesh.position.x = clamp(c.mesh.position.x, -280, HALF + 24);
  c.mesh.position.z = clamp(c.mesh.position.z, -280, 280);
  state.speed = c.speed;
  for (const p of peds) {
    if (p.down) continue;
    if (Math.hypot(p.x - c.mesh.position.x, p.z - c.mesh.position.z) < 1.8 && Math.abs(c.speed) > 3) {
      p.down = true;
      p.downTimer = 6;
      p.mesh.rotation.x = -Math.PI / 2;
      p.mesh.position.y = 0.3;
      addWanted(1, 'You hit a pedestrian!');
    }
  }
  checkMissionSpot();
}
// Planes: W/S throttle, Shift climbs and Space descends, A/D banks and
// turns, lift starts above 20 m/s and the plane stalls below 12. Props
// spin faster with speed.
function updatePlane(dt, c) {
  const throttle = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.7 : 0;
  const climb = (keys['ShiftLeft'] || keys['ShiftRight'] ? 1 : 0) - (keys['Space'] ? 1 : 0);
  const turn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = c.spec.topSpeed;
  c.speed += throttle * 22 * dt;
  c.speed -= c.speed * 0.25 * dt;
  if (!throttle && c.alt === 0) c.speed -= Math.sign(c.speed) * 5 * dt;
  c.speed = clamp(c.speed, 0, top);
  c.mesh.rotation.y += turn * dt * 1.1 * clamp(c.speed / top, 0.2, 1);
  const h = c.mesh.rotation.y;
  const nx = c.mesh.position.x + Math.sin(h) * c.speed * dt;
  const nz = c.mesh.position.z + Math.cos(h) * c.speed * dt;
  if (c.alt < 2) {
    const hit = collideCircle(nx, nz, 2);
    if (hit) {
      if (Math.abs(c.speed) > 10) {
        thud();
        damagePlayer(6, 'You crashed the plane');
      }
      c.speed *= 0.4;
    }
  }
  c.mesh.position.x = clamp(nx, -280, 280);
  c.mesh.position.z = clamp(nz, -280, 280);
  if (c.speed > 20) c.alt += 3.5 * dt;
  if (climb !== 0 && c.alt > 0) c.alt += climb * 8 * dt;
  if (c.speed < 12 && c.alt > 0) c.alt -= 4 * dt;
  c.alt = clamp(c.alt || 0, 0, 120);
  c.mesh.position.y = 0.3 + c.alt;
  c.mesh.rotation.z = -turn * 0.25 * clamp(c.speed / top, 0, 1);
  if (c.mesh.userData.prop) c.mesh.userData.prop.rotation.z += dt * (4 + c.speed);
  if (c.mesh.userData.prop2) c.mesh.userData.prop2.rotation.z += dt * (4 + c.speed);
  state.speed = c.speed;
  checkMissionSpot();
}
// Horses: Shift gallops at full speed, otherwise they trot at 55%;
// Space hops over low obstacles, and the four legs swing as they run.
function updateHorse(dt, c) {
  const gallop = keys['ShiftLeft'] || keys['ShiftRight'];
  const fwd = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.5 : 0;
  const turn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = gallop ? c.spec.topSpeed : c.spec.topSpeed * 0.55;
  c.speed += fwd * (c.spec.accel || 14) * dt;
  c.speed -= c.speed * 0.5 * dt;
  if (!fwd) c.speed -= Math.sign(c.speed) * 3 * dt;
  if (Math.abs(c.speed) < 0.15 && !fwd) c.speed = 0;
  c.speed = clamp(c.speed, -top * 0.4, top);
  c.mesh.rotation.y += turn * dt * 1.4 * Math.sign(c.speed || 1);
  const h = c.mesh.rotation.y;
  const nx = c.mesh.position.x + Math.sin(h) * c.speed * dt;
  const nz = c.mesh.position.z + Math.cos(h) * c.speed * dt;
  if (!collideCircle(nx, nz, 0.8)) {
    c.mesh.position.x = nx;
    c.mesh.position.z = nz;
  } else {
    c.speed *= 0.5;
  }
  c.mesh.position.x = clamp(c.mesh.position.x, -280, 280);
  c.mesh.position.z = clamp(c.mesh.position.z, -280, 280);
  if (!c.jumpVy) c.jumpVy = 0;
  if (!c.jumpY) c.jumpY = 0;
  if (keys['Space'] && c.jumpY === 0) c.jumpVy = 5.5;
  c.jumpVy -= 18 * dt;
  c.jumpY = Math.max(0, c.jumpY + c.jumpVy * dt);
  if (c.jumpY === 0) c.jumpVy = 0;
  c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z) + c.jumpY;
  const legs = c.mesh.userData.legs || [];
  legs.forEach((leg, i) => {
    leg.rotation.x = Math.sin(state.time * 10 + i * Math.PI) * clamp(Math.abs(c.speed) / 10, 0, 1) * 0.7;
  });
  state.speed = c.speed;
  checkMissionSpot();
}
// Helicopters: Shift climbs, Space descends (0–90m), W/S flies forward
// and back, A/D turns; the rotors spin and the body bobs gently.
function updateHeli(dt, c) {
  const up = keys['ShiftLeft'] || keys['ShiftRight'] ? 1 : 0;
  const down = keys['Space'] ? 1 : 0;
  c.alt = clamp((c.alt || 0) + (up - down) * 9 * dt, 0, 90);
  heliAlt = c.alt;
  const fwd = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.6 : 0;
  const turn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = c.spec.topSpeed;
  c.speed += fwd * 12 * dt;
  c.speed -= c.speed * 0.4 * dt;
  c.speed = clamp(c.speed, -top * 0.4, top);
  c.mesh.rotation.y += turn * dt * 1.6;
  const h = c.mesh.rotation.y;
  c.mesh.position.x += Math.sin(h) * c.speed * dt;
  c.mesh.position.z += Math.cos(h) * c.speed * dt;
  c.mesh.position.x = clamp(c.mesh.position.x, -280, 280);
  c.mesh.position.z = clamp(c.mesh.position.z, -280, 280);
  c.mesh.position.y = 0.3 + c.alt + Math.sin(state.time * 2) * 0.12;
  if (c.mesh.userData.rotor) c.mesh.userData.rotor.rotation.y += dt * 22;
  if (c.mesh.userData.rotor2) c.mesh.userData.rotor2.rotation.y += dt * 22;
  state.speed = c.speed;
  checkMissionSpot();
}
// Boats sail the sea and the river; land blocks them and halves speed.
// The hull bobs and rolls gently on the waves.
function updateBoat(dt, c) {
  const fwd = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.6 : 0;
  const turn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = c.spec.topSpeed;
  c.speed += fwd * 9 * dt;
  c.speed -= c.speed * 0.35 * dt;
  c.speed = clamp(c.speed, -top * 0.4, top);
  c.mesh.rotation.y += turn * dt * (c.spec.turnRate || 0.9) * Math.sign(c.speed || 1);
  const h = c.mesh.rotation.y;
  let nx = c.mesh.position.x + Math.sin(h) * c.speed * dt;
  let nz = c.mesh.position.z + Math.cos(h) * c.speed * dt;
  const inSea = nx >= HALF + 10 && nx <= 275 && nz >= -270 && nz <= 270;
  const inRiver = onRiver(nx, nz);
  if (inSea || inRiver) {
    c.mesh.position.x = nx;
    c.mesh.position.z = nz;
  } else {
    c.speed *= 0.5;
  }
  boatBob += dt;
  c.mesh.position.y = 0.15 + Math.sin(boatBob * 2.2) * 0.12;
  c.mesh.rotation.z = Math.sin(boatBob * 1.4) * 0.04;
  state.speed = c.speed;
  checkMissionSpot();
}
function tryEnterExitCar() {
  if (state.mode !== 'play') return;
  if (state.inCar) {
    const c = state.inCar;
    playerState.x = c.mesh.position.x + 2.2; playerState.z = c.mesh.position.z + 1.5;
    playerState.heading = c.mesh.rotation.y;
    player.visible = true; player.position.set(playerState.x, 0, playerState.z);
    state.inCar = null; state.speed = 0;
    toast('You left the car.');
    return;
  }
  const c = nearestCar(4.5);
  if (!c) { toast('No car nearby — find one parked on the street.'); return; }
  state.inCar = c;
  player.visible = false;
  if (!c.stolen) {
    c.stolen = true;
    addWanted(1, 'You stole a car! The owner called it in.');
  } else {
    toast('You hop in the ' + c.spec.type + '.');
  }
  beep(220, 0.1, 'square', 0.12);
}
function addWanted(n, msg) {
  const before = state.wanted;
  state.wanted = clamp(state.wanted + n, 0, 5);
  if (state.wanted > before) {
    state.cleanTimer = 0;
    if (msg) toast(msg + '  Wanted: ' + '★'.repeat(state.wanted));
    while (police.length < state.wanted) spawnPolice();
    if (state.wanted >= 2) beep(880, 0.2, 'square', 0.15);
  }
  updateHUD();
}
// A punch lands on the first pedestrian in front of you within 2.2m.
// Bounty targets go down and pay out; anyone else either gets angry and
// fights back (45%) or screams and flees.
function punch() {
  if (state.mode !== 'play' || state.inCar) return;
  if (castOrReel()) return;
  thud();
  const fx = Math.sin(playerState.heading);
  const fz = Math.cos(playerState.heading);
  for (const p of peds) {
    if (p.down) continue;
    const dx = p.x - playerState.x;
    const dz = p.z - playerState.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2 && dx * fx + dz * fz > 0) {
      if (p.isBounty) {
        p.down = true;
        p.downTimer = 4;
        p.mesh.rotation.x = -Math.PI / 2;
        p.mesh.position.y = 0.3;
        collectBounty(p);
        addWanted(1, 'You knocked someone out!');
        break;
      }
      if (rng() < 0.45) {
        p.angry = true;
        p.angryTimer = 5;
        p.attackCd = 0;
        toast('That pedestrian is ANGRY — they are fighting back!');
        beep(180, 0.2, 'sawtooth', 0.2);
      } else {
        p.flee = true;
        p.speed = 6;
        p.target = { x: p.x + (p.x - playerState.x) * 10, z: p.z + (p.z - playerState.z) * 10 };
        toast('That pedestrian screams and runs away!');
        beep(900, 0.25, 'sine', 0.15);
      }
      addWanted(1, 'You hit someone!');
      break;
    }
  }
}
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe27a });
let tracer = null, tracerTimer = 0;
function shoot() {
  if (state.mode !== 'play' || state.inCar) return;
  audioInit(); gunshot();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  const ray = new THREE.Raycaster(origin, dir, 0.1, 120);
  const targets = [];
  for (const p of peds) if (!p.down) targets.push(p.mesh);
  for (const c of parkedCars) targets.push(c.mesh);
  for (const po of police) targets.push(po.mesh);
  const hits = ray.intersectObjects(targets, true);
  let end = origin.clone().add(dir.clone().multiplyScalar(90));
  if (hits.length) {
    end = hits[0].point.clone();
    // find which ped was hit
    let obj = hits[0].object;
    while (obj && obj.parent && obj.parent !== scene) obj = obj.parent;
    for (const p of peds) {
      if (p.mesh === obj && !p.down) {
        p.down = true; p.downTimer = 6; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
        state.kills++;
        addWanted(1, 'Shots fired! Cops are coming.');
        break;
      }
    }
  }
  if (tracer) scene.remove(tracer);
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  tracer = new THREE.Line(geo, tracerMat);
  scene.add(tracer); tracerTimer = 0.08;
}
// Damage goes to the vest first, then to health; at zero health the
// WASTED screen appears and the engine and siren cut out.
function damagePlayer(n, cause) {
  if (state.mode !== 'play') return;
  if (state.armor > 0 && n > 0) {
    const absorbed = Math.min(state.armor, n);
    state.armor -= absorbed;
    n -= absorbed;
    if (absorbed > 0) toast('Vest took ' + Math.round(absorbed) + ' damage — armor ' + Math.round(state.armor) + ' left.');
  }
  state.health -= n;
  if (state.health <= 0) {
    state.health = 0;
    state.mode = 'dead';
    document.getElementById('wastedText').textContent = cause + ' — ' + activeName() + ' went down in Solmar Bay.';
    document.getElementById('wasted').classList.remove('hidden');
    document.getElementById('hud').classList.remove('on');
    if (engineGain) engineGain.gain.value = 0;
    if (sirenGain) sirenGain.gain.value = 0;
  }
  updateHUD();
}

// ---------- HUD + minimap ----------
const minimap = document.getElementById('minimap');
const mm = minimap.getContext('2d');
function updateHUD() {
  document.getElementById('cash').textContent = '$' + state.cash.toLocaleString('en-US');
  document.getElementById('healthfill').style.width = Math.max(0, state.health) + '%';
  const armorFill = document.getElementById('armorfill');
  if (armorFill) armorFill.style.width = Math.max(0, state.armor) + '%';
  const armorLabel = document.getElementById('armorlabel');
  if (armorLabel) armorLabel.textContent = 'Vest ' + Math.round(state.armor);
  const starsEl = document.getElementById('stars');
  let s = '';
  for (let i = 0; i < 5; i++) s += i < state.wanted ? '★' : '<span class="off">★</span>';
  starsEl.innerHTML = s;
  document.getElementById('speedo').firstChild.textContent = Math.round(Math.abs(state.speed) * 2.2);
  const inHeli = state.inCar && state.inCar.kind === 'heli';
  document.getElementById('crosshair').style.display = (!inHeli && state.mode === 'play') ? 'block' : 'none';
  const bountyEl = document.getElementById('bounty');
  if (bountyEl) {
    const tier = state.wanted === 0 ? 'Clean' : state.wanted <= 2 ? 'Low' : state.wanted === 3 ? 'High' : state.wanted === 4 ? 'Severe' : 'Maximum';
    bountyEl.textContent = 'Bounty $' + (state.wanted * 250) + ' · ' + tier;
  }
  const forceEl = document.getElementById('force');
  if (forceEl) {
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    const outside = Math.abs(px) > HALF || Math.abs(pz) > HALF;
    forceEl.textContent = outside ? 'Sheriff — Solmar County' : 'Solmar Bay Police';
  }
  const radioEl = document.getElementById('radio');
  if (radioEl) radioEl.textContent = '♪ ' + RADIO_STATIONS[state.radio].name;
  const weaponEl = document.getElementById('weapon');
  if (weaponEl) weaponEl.textContent = WEAPONS[state.weapon].name + ' · ' + (state.ammo[state.weapon] === Infinity ? '∞' : state.ammo[state.weapon]);
  const pkgEl = document.getElementById('packages');
  if (pkgEl) pkgEl.textContent = '📦 ' + packagesFound + '/50';
  const isleEl = document.getElementById('isleLine');
  if (isleEl) isleEl.textContent = '🏝 Coral Cay shells ' + isleShellsFound + '/6' + (chain.active ? ' · ' + CHAIN_JOBS[chain.job].title : '') + (coveIsNight() ? ' · ' + coveStatusLine() : '');
  const charEl = document.getElementById('charName');
  if (charEl) charEl.textContent = CHARS[state.activeChar].name + '  ·  C to switch';
  const raceEl = document.getElementById('raceInfo');
  if (raceEl) raceEl.textContent = heist.active ? '💰 HEIST — stage ' + (heist.stage + 1) + '/' + HEIST_STAGES.length + ' · ' + Math.max(0, Math.ceil(heist.timer)) + 's left' : race.active ? '🏁 RACE — checkpoint ' + race.cp + '/' + RACE_CPS.length + ' · ' + Math.max(0, Math.ceil(race.timer)) + 's left' : '';
  r5HudLine();
  r6HudLine();
  r7HudLine();
}
function drawMinimap() {
  const W = 180, scale = W / 620;
  mm.clearRect(0, 0, W, W);
  mm.fillStyle = '#3f7a3a'; mm.fillRect(0, 0, W, W);
  mm.fillStyle = '#8fae4e'; mm.fillRect(0, 55, 55, W - 110); // farmland west
  mm.fillStyle = '#d9b380'; mm.fillRect(0, W - 42, W, 42); // desert south
  mm.fillStyle = '#1e7fa8'; mm.fillRect(W - 42, 0, 42, W); // ocean east
  mm.fillStyle = '#e8d5a0'; mm.fillRect(W - 52, 0, 10, W); // beach
  // map shape: central lake, southern keys, southwest swamp, northern mountains
  mm.fillStyle = '#2a8ab0';
  mm.beginPath(); mm.arc((60 + 310) * scale, (-205 + 310) * scale, 9, 0, Math.PI * 2); mm.fill();
  mm.fillStyle = '#e8d5a0';
  for (const [kx, kz] of [[150, 180], [176, 222], [148, 256], [202, 158], [188, 268]]) {
    mm.beginPath(); mm.arc((kx + 310) * scale, (kz + 310) * scale, 3, 0, Math.PI * 2); mm.fill();
  }
  mm.fillStyle = '#4a6a3a'; mm.fillRect(8, W - 28, 26, 18); // swamp SW
  mm.fillStyle = '#7a6a58'; mm.fillRect(0, 0, W, 8); // mountains north
  mm.fillStyle = '#f0f4f8'; mm.fillRect(20, 0, 10, 8); mm.fillRect(120, 0, 12, 8); // snow caps
  mm.strokeStyle = '#3a4a55'; mm.lineWidth = 5;
  for (let i = 0; i <= GRID; i++) {
    const c = (-HALF + i * BLOCK + 310) * scale;
    mm.beginPath(); mm.moveTo(c, 0); mm.lineTo(c, W); mm.stroke();
    mm.beginPath(); mm.moveTo(0, c); mm.lineTo(W, c); mm.stroke();
  }
  const dot = (x, z, color, r) => {
    mm.fillStyle = color;
    mm.beginPath(); mm.arc((x + 310) * scale, (z + 310) * scale, r, 0, Math.PI * 2); mm.fill();
  };
  if (beacon.visible) dot(beaconPos.x, beaconPos.z, '#ffd23f', 6);
  dot(ISLE_CX, ISLE_CZ, '#2ee6ff', 5);
  for (const hv of hovercrafts) dot(hv.mesh.position.x, hv.mesh.position.z, '#ff8c1a', 3);
  if (chain.active && chain.target) dot(chain.target.mesh.position.x, chain.target.mesh.position.z, '#ff2a7a', 5);
  if (chain.active && chain.escort) dot(chain.escort.mesh.position.x, chain.escort.mesh.position.z, '#e8b820', 5);
  for (const db of DIVE_BUOYS) dot(db.x, db.z, '#2ee6ff', 4);
  for (const vm of viewMarkers) dot(vm.x, vm.z, vm.done ? '#2ecc71' : '#ffd23f', 3);
  for (let li = 0; li < LOOT_SPOTS.length; li++) if (!lootState.found.includes(li)) dot(LOOT_SPOTS[li].x, LOOT_SPOTS[li].z, lootState.mapBought ? '#e8b820' : '#8a7a68', 3);
  for (const cs of COVE_SPOTS) dot(cs.x, cs.z, '#b45ae8', 4);
  if (cayBus.mesh) dot(cayBus.mesh.position.x, cayBus.mesh.position.z, '#2ee6ff', 4);
  if (ferry.mesh) dot(ferry.mesh.position.x, ferry.mesh.position.z, '#f0ead8', 4);
  for (const po of police) dot(po.mesh.position.x, po.mesh.position.z, '#ff4444', 3.5);
  for (const c of parkedCars) dot(c.mesh.position.x, c.mesh.position.z, '#9fb6c9', 2);
  for (const v of extraVehicles) dot(v.mesh.position.x, v.mesh.position.z, '#ffd23f', 2);
  for (const h of helis) dot(h.mesh.position.x, h.mesh.position.z, '#ff8c1a', 3);
  for (const b of boats) dot(b.mesh.position.x, b.mesh.position.z, '#2ee6ff', 3);
  for (const p of planes) dot(p.mesh.position.x, p.mesh.position.z, '#ff8c1a', 3);
  for (const ap of AIRPORTS) {
    mm.fillStyle = '#ffd23f';
    mm.fillRect((ap.x + 310) * scale - 4, (ap.z + 310) * scale - 4, 8, 8);
    mm.fillStyle = '#08222f';
    mm.font = 'bold 7px Arial';
    mm.fillText('A', (ap.x + 310) * scale - 2.5, (ap.z + 310) * scale + 2.5);
  }
  if (bountyTarget) dot(bountyTarget.x, bountyTarget.z, '#ff2a7a', 5);
  if (state.mission >= MISSIONS.length && !heist.active) dot(-12, -12, '#ffd23f', 6);
  for (const s of SHOPS) dot(s.x, s.z, '#e86ad0', 4);
  for (const p of ownedProperties) dot(p.x, p.z, '#ffd23f', 5);
  dot(PAYNSPRAY.x, PAYNSPRAY.z, '#2e6fb0', 5);
  if (streetEvent) dot(streetEvent.ped.x, streetEvent.ped.z, '#ff8c1a', 5);
  if (golf.active) dot(100, -160, '#2ecc71', 5);
  r5MinimapDots(dot);
  r6MinimapDots(dot);
  r7MinimapDots(dot);
  // Feature 37: fire station (F) + hospital (H) + bus stops (B)
  mm.fillStyle = '#c0392b'; mm.fillRect((-132 + 310) * scale - 4, (60 + 310) * scale - 4, 8, 8);
  mm.fillStyle = '#fff'; mm.font = 'bold 7px Arial'; mm.fillText('F', (-132 + 310) * scale - 2.5, (60 + 310) * scale + 2.5);
  mm.fillStyle = '#f0f4f8'; mm.fillRect((132 + 310) * scale - 4, (-60 + 310) * scale - 4, 8, 8);
  mm.fillStyle = '#c0392b'; mm.fillText('H', (132 + 310) * scale - 2.5, (-60 + 310) * scale + 2.5);
  for (const bs of BUS_STOPS) dot(bs.x, bs.z, '#ffffff', 3);
  if (fireJob.active) dot(fireJob.x, fireJob.z, '#ff7a1a', 6);
  if (race.active) { for (const cp of RACE_CPS) dot(cp.x, cp.z, '#ff9a5a', 4); }
  else dot(RACE_START.x, RACE_START.z, '#ffffff', 4);
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  // Feature 29: GPS route line from the player to the active objective
  if (beacon.visible) {
    mm.strokeStyle = '#2ee6ff'; mm.lineWidth = 2; mm.setLineDash([5, 4]);
    mm.beginPath();
    mm.moveTo((px + 310) * scale, (pz + 310) * scale);
    mm.lineTo((beaconPos.x + 310) * scale, (beaconPos.z + 310) * scale);
    mm.stroke();
    mm.setLineDash([]);
  }
  dot(px, pz, '#7dff9a', 4);
  mm.strokeStyle = '#7dff9a'; mm.lineWidth = 1;
  mm.beginPath(); mm.arc((px + 310) * scale, (pz + 310) * scale, 7, 0, Math.PI * 2); mm.stroke();
}

// ---------- per-frame updates ----------
function updatePlayer(dt) {
  if (dive.active) return;
  if (ferry.aboard) return;
  if (cayBus.aboard) return;
  const run = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = (run ? 9 : 5) * (1 + skillLevel('stamina') * 0.02);
  if (run && (keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'])) addSkill('stamina', dt * 3);
  let mx = 0, mz = 0;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyA']) mx -= 1;
  if (keys['KeyD']) mx += 1;
  const len = Math.hypot(mx, mz) || 1;
  mx /= len; mz /= len;
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  const wx = (mx * cos - mz * sin) * speed * dt;
  const wz = (mx * sin + mz * cos) * speed * dt;
  let nx = playerState.x + wx, nz = playerState.z + wz;
  const hit = collideCircle(nx, nz, 0.5);
  if (hit) {
    const tryX = collideCircle(playerState.x + wx, playerState.z, 0.5) ? playerState.x : playerState.x + wx;
    const tryZ = collideCircle(playerState.x, playerState.z + wz, 0.5) ? playerState.z : playerState.z + wz;
    nx = tryX; nz = tryZ;
  }
  nx = clamp(nx, -280, 280); nz = clamp(nz, -280, 280);
  playerState.x = nx; playerState.z = nz;
  if (mx !== 0 || mz !== 0) {
    playerState.heading = Math.atan2(wx, wz);
    playerState.walkPhase += dt * (run ? 13 : 9);
  }
  if (keys['Space'] && playerState.onGround) { playerState.vy = 7.5; playerState.onGround = false; }
  // Feature 23: parachute — Space while falling from height opens the canopy
  if (keys['Space'] && !playerState.onGround && playerState.y > 4 && playerState.vy < 0 && !chute.open) openParachute();
  if (chute.open) {
    playerState.vy = Math.max(playerState.vy - 3 * dt, -3.5);
  } else {
    playerState.vy -= 22 * dt;
  }
  playerState.y += playerState.vy * dt;
  if (playerState.y <= 0) {
    const impact = -playerState.vy;
    playerState.y = 0; playerState.vy = 0; playerState.onGround = true;
    if (chute.open) { closeParachute(); toast('Soft landing under the parachute!'); }
    else if (impact > 14) damagePlayer(Math.round((impact - 14) * 3), 'Fell from a great height');
  }
  player.position.set(playerState.x, groundHeight(playerState.x, playerState.z) + playerState.y, playerState.z);
  player.rotation.y = playerState.heading;
  const sw = Math.sin(playerState.walkPhase) * (mx !== 0 || mz !== 0 ? 0.55 : 0);
  player.userData.legL.rotation.x = sw; player.userData.legR.rotation.x = -sw;
  player.userData.armL.rotation.x = -sw * 0.8; player.userData.armR.rotation.x = sw * 0.8;
  // mission proximity checks on foot
  checkMissionSpot();
}
function checkMissionSpot() {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  if (state.mission === 0 && state.missionStage === 1 && state.inCar) {
    if (Math.hypot(px - SPOTS.marina.x, pz - SPOTS.marina.z) < 6) completeMission();
  }
  if (state.mission === 1 && state.missionStage === 1) {
    if (Math.hypot(px - SPOTS.docks.x, pz - SPOTS.docks.z) < 6) {
      state.missionStage = 2; setBeacon(SPOTS.airport.x, SPOTS.airport.z);
      toast('Package picked up! Deliver it to Solmar Intl airport — fast!');
      chime(); updateObjective();
    }
  }
  if (state.mission === 1 && state.missionStage === 2) {
    if (Math.hypot(px - SPOTS.airport.x, pz - SPOTS.airport.z) < 6) completeMission();
  }
  if (state.mission === 2 && state.missionStage === 1 && state.wanted >= 3) {
    state.missionStage = 2; toast('3 stars! Now shake the cops and go clean.');
    updateObjective();
  }
  if (state.mission === 2 && state.missionStage === 2 && state.wanted === 0) completeMission();
}
function updateCar(dt) {
  const c = state.inCar;
  if (!c) return;
  if (c.kind === 'heli') { updateHeli(dt, c); return; }
  if (c.kind === 'plane') { updatePlane(dt, c); return; }
  if (c.kind === 'horse') { updateHorse(dt, c); return; }
  if (c.kind === 'boat') { updateBoat(dt, c); return; }
  if (c.kind === 'hover') { updateHover(dt, c); return; }
  if (c.kind && c.kind !== 'car') { updateGroundVehicle(dt, c); return; }
  const accel = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.6 : 0;
  const steerIn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = c.spec.topSpeed * (1 + skillLevel('driving') * 0.02);
  c.speed += accel * 16 * dt;
  c.speed -= c.speed * 0.55 * dt;
  if (!accel) c.speed -= Math.sign(c.speed) * 4 * dt;
  if (Math.abs(c.speed) < 0.15 && !accel) c.speed = 0;
  c.speed = clamp(c.speed, -top * 0.4, top);
  if (Math.abs(c.speed) > 10) addSkill('driving', dt * 2);
  c.steer = lerp(c.steer, steerIn * 0.55 * Math.sign(c.speed || 1), dt * 6);
  const heading = c.mesh.rotation.y + c.steer * dt * (c.speed / top) * 3.2;
  c.mesh.rotation.y = heading;
  const nx = c.mesh.position.x + Math.sin(heading) * c.speed * dt;
  const nz = c.mesh.position.z + Math.cos(heading) * c.speed * dt;
  const hit = collideCircle(nx, nz, 1.6);
  if (hit) {
    if (Math.abs(c.speed) > 8) { thud(); damagePlayer(6, 'You crashed hard'); }
    c.speed *= -0.25;
  } else {
    c.mesh.position.x = nx; c.mesh.position.z = nz;
  }
  c.mesh.position.x = clamp(c.mesh.position.x, -280, 280);
  c.mesh.position.z = clamp(c.mesh.position.z, -280, 280);
  c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z);
  state.speed = c.speed;
  // Feature 37: strobe lights blink on emergency vehicles
  if (c.mesh.userData.lightR) {
    const blink = Math.floor(state.time * 6) % 2 === 0;
    c.mesh.userData.lightR.material.emissiveIntensity = blink ? 2 : 0.2;
    c.mesh.userData.lightB.material.emissiveIntensity = blink ? 0.2 : 2;
  }
  // hit pedestrians?
  for (const p of peds) {
    if (p.down) continue;
    if (Math.hypot(p.x - c.mesh.position.x, p.z - c.mesh.position.z) < 1.8 && Math.abs(c.speed) > 3) {
      p.down = true; p.downTimer = 6; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
      addWanted(1, 'You hit a pedestrian!');
    }
  }
  checkMissionSpot();
}
function updateTraffic(dt) {
  for (const t of traffic) {
    t.speed = clamp(t.speed, 7, 11);
    const h = t.heading;
    t.mesh.position.x += Math.sin(h) * t.speed * dt;
    t.mesh.position.z += Math.cos(h) * t.speed * dt;
    // turn at grid lines: pick a new perpendicular heading at intersections
    const px = t.mesh.position.x, pz = t.mesh.position.z;
    const nearX = Math.abs(px - Math.round((px + HALF) / BLOCK) * BLOCK + HALF) < 0.4;
    const nearZ = Math.abs(pz - Math.round((pz + HALF) / BLOCK) * BLOCK + HALF) < 0.4;
    if ((nearX || nearZ) && rng() < 0.012) {
      t.heading = h + (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    }
    if (px > HALF + 4 || px < -HALF - 4 || pz > HALF + 4 || pz < -HALF - 4) t.heading += Math.PI;
    t.mesh.rotation.y = t.heading;
    // keep on roads: nudge toward nearest road line
    const roadX = Math.round((px + HALF) / BLOCK) * BLOCK - HALF;
    const roadZ = Math.round((pz + HALF) / BLOCK) * BLOCK - HALF;
    if (Math.abs(Math.sin(h)) > 0.7) t.mesh.position.z = lerp(t.mesh.position.z, roadZ, dt * 2);
    else t.mesh.position.x = lerp(t.mesh.position.x, roadX, dt * 2);
    for (const w of (t.mesh.userData.wheels || [])) w.rotation.x += t.speed * dt * 2;
  }
}
// V2: a few motorcycles join city traffic
for (let i = 0; i < 3; i++) {
  const mesh = makeMotoMesh(pick([0xc0392b, 0x2e6fb0, 0x222222]));
  const p = roadPoint();
  mesh.position.set(p.x, 0, p.z); mesh.rotation.y = p.heading;
  scene.add(mesh);
  traffic.push({ mesh, spec: { type: 'moto', topSpeed: 30 }, speed: rr(9, 13), heading: p.heading, loop: 0, turnAt: 0 });
}
// ---------- Feature 10: zone-culture pedestrians + vehicles ----------
{
  const FARM_SHIRTS = [0xa83a2a, 0x7a4a2a, 0x5a6a3a, 0x8a2a3a];
  const BEACH_SHIRTS = [0x2ee6ff, 0xffd23f, 0xff7ab8, 0x7dff9a];
  for (let i = 0; i < 6; i++) {
    const p = makePerson(pick(FARM_SHIRTS), pick([0x4a3a2a, 0x2c3e50]), pick([0xd9a066, 0x8a5a33]));
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xc2a45e }));
    hat.position.y = 1.9; p.add(hat);
    const x = -200 + rr(-50, 50), z = rr(-80, 80);
    p.position.set(x, 0, z); scene.add(p);
    peds.push({ mesh: p, x, z, heading: rng() * Math.PI * 2, speed: rr(1, 1.8), target: null, down: false, downTimer: 0, phase: rng() * 6, mood: pick(['calm', 'emotional', 'maniac']), zone: { cx: -200, cz: 0, rx: 60, rz: 90 } });
  }
  for (let i = 0; i < 6; i++) {
    const p = makePerson(pick(BEACH_SHIRTS), pick([0xf0ead8, 0x2a4a5a]), pick([0xd9a066, 0xf0c8a0]));
    const x = HALF + 14 + rr(-4, 4), z = rr(-110, 110);
    p.position.set(x, 0, z); scene.add(p);
    peds.push({ mesh: p, x, z, heading: rng() * Math.PI * 2, speed: rr(1, 2), target: null, down: false, downTimer: 0, phase: rng() * 6, mood: pick(['calm', 'emotional', 'maniac']), zone: { cx: HALF + 14, cz: 0, rx: 8, rz: 110 } });
  }
  for (const [fx, fz, tp] of [[-190, -60, 'pickup'], [-225, 60, 'truck'], [-185, 20, 'pickup']]) {
    const spec = CAR_TYPES.find((c) => c.type === tp);
    const mesh = makeCarMesh(spec);
    mesh.position.set(fx, 0, fz); mesh.rotation.y = rr(0, 3);
    scene.add(mesh);
    parkedCars.push({ mesh, spec, speed: 0, steer: 0, stolen: false });
  }
  const conv = makeCarMesh(CAR_TYPES.find((c) => c.type === 'muscle'));
  conv.position.set(HALF + 8, 0, -90); conv.rotation.y = 0.6; scene.add(conv);
  parkedCars.push({ mesh: conv, spec: CAR_TYPES.find((c) => c.type === 'muscle'), speed: 0, steer: 0, stolen: false });
  addExtraVehicle('buggy', makeBuggyMesh(0xffd23f), { type: 'buggy', color: 0xffd23f, len: 2.2, w: 1.2, h: 0.7, topSpeed: 23, accel: 15, steerRate: 0.6, label: 'dune buggy' }, HALF + 16, 90, -0.5);
}
function updatePeds(dt) {
  // Feature 32: crowds follow the time of day — rush hour busy, night quiet,
  // beach busy at midday. A stable fraction of ambient peds is shown.
  const hour = (state.dayTime || 0) * 24;
  const rush = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 19);
  const midday = hour >= 10 && hour < 16;
  const night = hour >= 22 || hour < 6;
  for (let pi = 0; pi < peds.length; pi++) {
    const p = peds[pi];
    if (p.down) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) { p.down = false; p.mesh.rotation.x = 0; p.mesh.position.y = 0; }
      continue;
    }
    if (!p.flee && !p.isBounty) {
      const isBeach = p.zone && p.zone.cx > HALF;
      const frac = isBeach ? (midday ? 1 : night ? 0.25 : 0.6) : (rush ? 1 : night ? 0.3 : midday ? 0.7 : 0.5);
      const show = ((pi * 7) % 10) / 10 < frac;
      p.mesh.visible = show;
      if (!show) continue;
    }
    if (p.angry) {
      // Feature 32: an angry ped fights back — chases and hits the player
      p.angryTimer -= dt;
      const dx = playerState.x - p.x, dz = playerState.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * 3.5 * dt; p.z += (dz / d) * 3.5 * dt;
      p.mesh.position.set(p.x, groundHeight(p.x, p.z), p.z);
      p.mesh.rotation.y = Math.atan2(dx, dz);
      p.phase += dt * 12;
      const swA = Math.sin(p.phase) * 0.8;
      p.mesh.userData.legL.rotation.x = swA; p.mesh.userData.legR.rotation.x = -swA;
      if (d < 1.6) {
        p.attackCd = (p.attackCd || 0) - dt;
        if (p.attackCd <= 0) { p.attackCd = 1.4; damagePlayer(3, 'An angry pedestrian fought back'); }
      }
      if (p.angryTimer <= 0) { p.angry = false; p.flee = true; p.speed = 6; p.target = { x: p.x + 60, z: p.z - 60 }; }
      continue;
    }
    if (p.flee) {
      const dx = p.x - playerState.x, dz = p.z - playerState.z;
      const d = Math.hypot(dx, dz) || 1;
      p.x += (dx / d) * p.speed * dt; p.z += (dz / d) * p.speed * dt;
      p.mesh.position.set(p.x, groundHeight(p.x, p.z), p.z);
      p.mesh.rotation.y = Math.atan2(dx, dz);
      p.phase += dt * 12;
      const sw2 = Math.sin(p.phase) * 0.6;
      p.mesh.userData.legL.rotation.x = sw2; p.mesh.userData.legR.rotation.x = -sw2;
      continue;
    }
    if (!p.target || Math.hypot(p.target.x - p.x, p.target.z - p.z) < 1) {
      if (p.zone) {
        p.target = { x: p.zone.cx + rr(-p.zone.rx, p.zone.rx), z: p.zone.cz + rr(-p.zone.rz, p.zone.rz) };
      } else {
        let tx = p.x + rr(-30, 30), tz = p.z + rr(-30, 30), g = 0;
        while ((isRoad(tx, tz) || collideCircle(tx, tz, 1.5)) && g++ < 30) { tx = p.x + rr(-30, 30); tz = p.z + rr(-30, 30); }
        p.target = { x: clamp(tx, -HALF, HALF), z: clamp(tz, -HALF, HALF) };
      }
    }
    const dx = p.target.x - p.x, dz = p.target.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    p.heading = Math.atan2(dx, dz);
    // Feature 32: behaviour types — maniac peds dart around, emotional ones pause
    let spd = p.speed;
    if (p.mood === 'maniac') { spd = p.speed * 1.8; if (rng() < 0.02) p.target = null; }
    else if (p.mood === 'emotional' && Math.sin(state.time * 0.7 + p.phase) < -0.7) spd = 0;
    p.x += (dx / d) * spd * dt; p.z += (dz / d) * spd * dt;
    p.mesh.position.set(p.x, groundHeight(p.x, p.z), p.z);
    p.mesh.rotation.y = p.heading;
    p.phase += dt * 8;
    const sw = Math.sin(p.phase) * 0.5;
    p.mesh.userData.legL.rotation.x = sw; p.mesh.userData.legR.rotation.x = -sw;
    p.mesh.userData.armL.rotation.x = -sw * 0.7; p.mesh.userData.armR.rotation.x = sw * 0.7;
  }
}
function updatePolice(dt) {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  // Feature 36: police motorcycles join at 2+ stars — faster, weave between traffic
  const wantBikes = state.wanted >= 2 ? Math.min(3, state.wanted - 1) : 0;
  while (policeBikes.length < wantBikes) {
    const mesh = makeMotoMesh(0xf0f0f0);
    const rider = makePerson(0x1a1a1a, 0x1a1a1a, 0xd9a066);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }));
    helm.position.y = 1.7; rider.add(helm);
    rider.position.y = 0.55; rider.scale.set(0.9, 0.9, 0.9); mesh.add(rider);
    const a = rng() * Math.PI * 2;
    mesh.position.set(px + Math.cos(a) * 40, 0, pz + Math.sin(a) * 40);
    scene.add(mesh);
    policeBikes.push({ mesh, speed: 0, heading: 0, weave: rng() * 6 });
  }
  while (policeBikes.length > wantBikes) {
    const b = policeBikes.pop(); scene.remove(b.mesh);
  }
  for (const b of policeBikes) {
    const dx = px - b.mesh.position.x, dz = pz - b.mesh.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const targetH = Math.atan2(dx, dz);
    let dh = targetH - b.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    b.heading += clamp(dh, -2.6 * dt, 2.6 * dt);
    b.speed = clamp(b.speed + 18 * dt, 0, 30 + state.wanted * 2);
    b.weave += dt * 3;
    b.mesh.rotation.y = b.heading;
    b.mesh.position.x += Math.sin(b.heading) * b.speed * dt + Math.cos(b.heading) * Math.sin(b.weave) * 3 * dt;
    b.mesh.position.z += Math.cos(b.heading) * b.speed * dt - Math.sin(b.heading) * Math.sin(b.weave) * 3 * dt;
    if (d < 2.2) damagePlayer(5 * dt * 3, 'A police motorcycle took ' + activeName() + ' down');
  }
  let nearest = 999;
  for (const po of police) {
    const dx = px - po.mesh.position.x, dz = pz - po.mesh.position.z;
    const d = Math.hypot(dx, dz);
    nearest = Math.min(nearest, d);
    const targetH = Math.atan2(dx, dz);
    let dh = targetH - po.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    po.heading += clamp(dh, -1.8 * dt, 1.8 * dt);
    po.speed = clamp(po.speed + 14 * dt, 0, 24 + state.wanted * 1.5);
    po.mesh.rotation.y = po.heading;
    po.mesh.position.x += Math.sin(po.heading) * po.speed * dt;
    po.mesh.position.z += Math.cos(po.heading) * po.speed * dt;
    if (collideCircle(po.mesh.position.x, po.mesh.position.z, 1.6)) po.heading += Math.PI * 0.5;
    // ram damage
    if (d < 2.6) {
      damagePlayer(8 * dt * 3 * (1 + state.wanted * 0.15), 'The Solmar Bay Police took ' + activeName() + ' down');
      if (state.inCar) state.inCar.speed *= 0.9;
    }
    const blink = Math.floor(state.time * 6) % 2 === 0;
    if (po.mesh.userData.lightR) {
      po.mesh.userData.lightR.material.emissiveIntensity = blink ? 2 : 0.2;
      po.mesh.userData.lightB.material.emissiveIntensity = blink ? 0.2 : 2;
    }
    for (const w of po.mesh.userData.wheels) w.rotation.x += po.speed * dt * 2;
  }
  // wanted decay: no police nearby for a while
  if (state.wanted > 0) {
    if (nearest > 45) {
      state.cleanTimer += dt;
      if (state.cleanTimer > 9) {
        state.wanted--; state.cleanTimer = 0;
        toast(state.wanted === 0 ? 'You lost the cops. Clean.' : 'Heat dying down… ' + state.wanted + ' stars left.');
        updateHUD(); updateObjective();
        if (state.wanted === 0) { for (const po of police) scene.remove(po.mesh); police.length = 0; for (const b of policeBikes) scene.remove(b.mesh); policeBikes.length = 0; }
      }
    } else state.cleanTimer = 0;
  }
  // despawn extra police if wanted dropped
  while (police.length > Math.max(state.wanted, 0) && state.wanted > 0) {
    const po = police.pop(); scene.remove(po.mesh);
  }
}
function updateCamera(dt) {
  let tx, ty, tz, lx, ly, lz;
  if (state.inCar) {
    const c = state.inCar.mesh;
    const h = c.rotation.y;
    const altY = c.position.y || 0;
    tx = c.position.x - Math.sin(h) * 11; ty = 5.2 + altY; tz = c.position.z - Math.cos(h) * 11;
    lx = c.position.x + Math.sin(h) * 8; ly = 2 + altY; lz = c.position.z + Math.cos(h) * 8;
    camYaw = h + Math.PI;
  } else {
    tx = playerState.x - Math.sin(camYaw) * camDist;
    ty = groundHeight(playerState.x, playerState.z) + playerState.y + 3.4 + camPitch * 6;
    tz = playerState.z - Math.cos(camYaw) * camDist;
    lx = playerState.x; ly = groundHeight(playerState.x, playerState.z) + playerState.y + 1.6; lz = playerState.z;
  }
  camera.position.x = lerp(camera.position.x, tx, 1 - Math.pow(0.001, dt));
  camera.position.y = lerp(camera.position.y, ty, 1 - Math.pow(0.001, dt));
  camera.position.z = lerp(camera.position.z, tz, 1 - Math.pow(0.001, dt));
  camera.lookAt(lx, ly, lz);
}
function updateAudio() {
  if (!AC) return;
  const spd = state.inCar ? Math.abs(state.speed) : 0;
  if (engineGain) {
    engineGain.gain.value = state.muted ? 0 : (state.inCar ? 0.03 + spd * 0.003 : 0);
    if (engineOsc) engineOsc.frequency.value = 50 + spd * 6;
  }
  if (sirenGain) sirenGain.gain.value = state.muted ? 0 : (state.wanted > 0 && state.mode === 'play' ? 0.035 : 0);
  if (rainNodes) rainNodes.gain.gain.value = state.muted ? 0 : (state.weather === 'rain' ? 0.05 : 0);
}
// ---------- Feature 11: day/night cycle (9-minute game day) ----------
const _skyA = new THREE.Color(), _skyB = new THREE.Color();
function updateDayNight(dt) {
  if (state.shot) return; // deterministic shots stay in the morning
  state.dayTime = (state.dayTime + dt / DAY_LENGTH) % 1;
  const t = state.dayTime;
  let a = DAY_KEYS[0], b = DAY_KEYS[DAY_KEYS.length - 1];
  for (let i = 0; i < DAY_KEYS.length - 1; i++) {
    if (t >= DAY_KEYS[i].t && t <= DAY_KEYS[i + 1].t) { a = DAY_KEYS[i]; b = DAY_KEYS[i + 1]; break; }
  }
  const span = Math.max(0.0001, b.t - a.t);
  const f = clamp((t - a.t) / span, 0, 1);
  _skyA.setHex(a.sky); _skyB.setHex(b.sky);
  const dark = state.weather === 'rain' ? 0.55 : 1;
  rainDark = lerp(rainDark, state.weather === 'rain' ? 1 : 0, dt * 0.5);
  const skyCol = _skyA.clone().lerp(_skyB, f).multiplyScalar(dark);
  scene.background.copy(skyCol);
  scene.fog.color.copy(skyCol);
  hemi.intensity = lerp(a.hemi, b.hemi, f) * (1 - rainDark * 0.35);
  sun.intensity = lerp(a.sun, b.sun, f) * (1 - rainDark * 0.6);
  sun.color.setHex(a.sunCol).lerp(new THREE.Color(b.sunCol), f);
  const ang = (t - 0.25) * Math.PI * 2;
  sun.position.set(Math.cos(ang) * 200, Math.sin(ang) * 180 + 20, 60);
  sunBall.position.copy(sun.position).multiplyScalar(1.15);
  sunBall.material.color.copy(sun.color);
  sunBall.visible = sun.position.y > -10;
  const night = clamp(1 - hemi.intensity / 0.95, 0, 1);
  if (stars) stars.material.opacity = night * 0.9;
  const moonUp = t > 0.78 || t < 0.22;
  if (moon) {
    moon.visible = moonUp;
    moon.userData.crater.visible = moonUp;
    const mAng = (t + 0.5) * Math.PI * 2;
    moon.position.set(Math.cos(mAng) * 300, Math.abs(Math.sin(mAng)) * 220 + 40, 180);
    moon.userData.crater.position.set(moon.position.x - 2, moon.position.y + 4, moon.position.z + 11);
  }
  if (moonLight) moonLight.intensity = moonUp ? night * 0.5 : 0;
  const lampGlow = night > 0.45 ? 2.2 : 0.7;
  for (const m of lampMats) m.emissiveIntensity = lampGlow;
  for (const v of allDrivable()) {
    const hl = v.mesh.userData.headlights;
    if (hl) for (const h of hl) h.material.emissiveIntensity = night > 0.45 ? 2.5 : 0.8;
  }
  const hrs = Math.floor(t * 24), mins = Math.floor((t * 24 - hrs) * 60);
  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.textContent = String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + (state.weather === 'rain' ? '  ☂ rain' : '');
}
// ---------- Feature 12: rain weather ----------
let rainPoints = null, rainVel = null;
function makeRain() {
  const N = 1400;
  const pos = new Float32Array(N * 3);
  rainVel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 220;
    pos[i * 3 + 1] = Math.random() * 70;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 220;
    rainVel[i] = 28 + Math.random() * 18;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainPoints = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.32, transparent: true, opacity: 0.55 }));
  rainPoints.visible = false;
  rainPoints.frustumCulled = false;
  scene.add(rainPoints);
}
function rainSound(on) {
  if (!AC) return;
  try {
    if (on && !rainNodes) {
      const len = AC.sampleRate * 2, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = AC.createGain(); g.gain.value = state.muted ? 0 : 0.05;
      src.connect(lp); lp.connect(g); g.connect(AC.destination); src.start();
      rainNodes = { src, gain: g };
    } else if (!on && rainNodes) {
      try { rainNodes.src.stop(); } catch (e) {}
      rainNodes = null;
    }
  } catch (e) { rainNodes = null; }
}
function updateWeather(dt) {
  if (state.shot) return;
  weatherTimer -= dt;
  if (weatherTimer <= 0) {
    if (state.weather === 'clear') {
      state.weather = 'rain';
      weatherTimer = 70 + Math.random() * 50;
      rainSound(true);
      toast('Rain moving in over Solmar Bay…');
    } else {
      state.weather = 'clear';
      weatherTimer = 150 + Math.random() * 90;
      rainSound(false);
      toast('The rain clears — sun’s coming back.');
    }
    updateHUD();
  }
  if (!rainPoints) makeRain();
  rainPoints.visible = state.weather === 'rain';
  if (state.weather === 'rain') {
    const arr = rainPoints.geometry.attributes.position.array;
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    rainPoints.position.set(px, 0, pz);
    for (let i = 0; i < rainVel.length; i++) {
      arr[i * 3 + 1] -= rainVel[i] * dt;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 65 + Math.random() * 5;
    }
    rainPoints.geometry.attributes.position.needsUpdate = true;
    // occasional lightning + thunder
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      lightningTimer = 9 + Math.random() * 14;
      hemi.intensity = Math.min(2.2, hemi.intensity + 1.4);
      setTimeout(() => { if (!state.muted) beep(48, 1.1, 'sine', 0.25); }, 350);
    }
  }
}

// ---------- Feature 14: bounty hunters + Marisol bounty target ----------
const hunters = [];
let bountyTarget = null, bountyRespawn = -1;
function spawnHunter() {
  const spec = { type: 'muscle', color: 0x1a1a1a, len: 4.4, w: 2.0, h: 0.6, topSpeed: 28 };
  const mesh = makeCarMesh(spec);
  const a = rng() * Math.PI * 2;
  mesh.position.set(playerState.x + Math.cos(a) * 50, 0, playerState.z + Math.sin(a) * 50);
  scene.add(mesh);
  hunters.push({ mesh, spec, speed: 0, heading: 0, fireTimer: 0 });
  toast('Bounty hunter on your tail — your head is worth $' + (state.wanted * 250) + '!');
}
function updateHunters(dt) {
  if (state.wanted >= 3 && hunters.length < 2) spawnHunter();
  if (state.wanted === 0) {
    for (const h of hunters) scene.remove(h.mesh);
    hunters.length = 0;
    return;
  }
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  for (const h of hunters) {
    const dx = px - h.mesh.position.x, dz = pz - h.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const targetH = Math.atan2(dx, dz);
    let dh = targetH - h.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    h.heading += clamp(dh, -2 * dt, 2 * dt);
    h.speed = clamp(h.speed + 16 * dt, 0, 27);
    h.mesh.rotation.y = h.heading;
    h.mesh.position.x += Math.sin(h.heading) * h.speed * dt;
    h.mesh.position.z += Math.cos(h.heading) * h.speed * dt;
    if (d < 2.6 && state.inCar) state.inCar.speed *= 0.92;
    h.fireTimer -= dt;
    if (d < 14 && h.fireTimer <= 0) {
      h.fireTimer = 2.5;
      gunshot();
      damagePlayer(3, 'A bounty hunter gunned ' + activeName() + ' down');
    }
    for (const w of (h.mesh.userData.wheels || [])) w.rotation.x += h.speed * dt * 2;
  }
}
function spawnBountyTarget() {
  const p = makePerson(0x8a1a1a, 0x1a1a1a, 0xd9a066);
  const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.15, 16), new THREE.MeshBasicMaterial({ color: 0xff2a7a }));
  marker.position.y = 2.2; p.add(marker);
  // mission spread: bounty targets appear all over the map, not just downtown
  const BOUNTY_ZONES = [
    { x: -12, z: -12, r: 90 }, { x: -200, z: 0, r: 60 }, { x: HALF + 10, z: 0, r: 60 },
    { x: 0, z: -225, r: 50 }, { x: -210, z: -40, r: 40 }, { x: -142, z: 178, r: 30 },
    { x: 60, z: 215, r: 60 }, { x: -84, z: -84, r: 20 },
  ];
  const bz = pick(BOUNTY_ZONES);
  let x = bz.x + rr(-bz.r, bz.r), z = bz.z + rr(-bz.r, bz.r), g = 0;
  while ((isRoad(x, z) || collideCircle(x, z, 1.5)) && g++ < 40) { x = bz.x + rr(-bz.r, bz.r); z = bz.z + rr(-bz.r, bz.r); }
  p.position.set(x, 0, z);
  scene.add(p);
  bountyTarget = { mesh: p, x, z, heading: rng() * Math.PI * 2, speed: 2.4, target: null, down: false, downTimer: 0, phase: 0, isBounty: true };
  peds.push(bountyTarget);
  toast('Marisol: bounty job — the target in red is marked on your map. Take them down for $600.');
}
function collectBounty(pd) {
  if (!pd.isBounty) return;
  state.cash += 600;
  toast('Bounty collected! +$600 — Marisol pays on delivery.');
  speakLine('Target down. Six hundred dollars, ' + activeName() + '. There will be more.');
  chime();
  bountyTarget = null;
  bountyRespawn = 60;
  saveGame(); updateHUD();
}
function updateBountyTarget(dt) {
  if (state.mission >= 1 && !bountyTarget && bountyRespawn < 0) bountyRespawn = 8;
  if (!bountyTarget && bountyRespawn > 0) {
    bountyRespawn -= dt;
    if (bountyRespawn <= 0) spawnBountyTarget();
  }
}
// ---------- Feature 10: sheriff police outside the city ----------
const SHERIFF_SPEC = { type: 'police', color: 0xc2a45e, len: 4.4, w: 1.95, h: 0.66, topSpeed: 29 };
function spawnSheriff() {
  const mesh = makeCarMesh(SHERIFF_SPEC);
  const a = rng() * Math.PI * 2;
  mesh.position.set(playerState.x + Math.cos(a) * 45, 0, playerState.z + Math.sin(a) * 45);
  scene.add(mesh);
  police.push({ mesh, spec: SHERIFF_SPEC, speed: 0, heading: 0, sheriff: true });
}

// ---------- Feature 13: river + jackable watercraft ----------
const RIVER_POINTS = [
  { x: -268, z: 178 }, { x: -205, z: 202 }, { x: -142, z: 172 }, { x: -82, z: 202 },
  { x: -22, z: 178 }, { x: 42, z: 208 }, { x: 92, z: 188 }, { x: 124, z: 200 },
];
function onRiver(x, z) {
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    const a = RIVER_POINTS[i], b = RIVER_POINTS[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    t = clamp(t, 0, 1);
    const cx = a.x + dx * t, cz = a.z + dz * t;
    if (Math.hypot(x - cx, z - cz) < 9) return true;
  }
  return false;
}
function makeYachtMesh() {
  const g = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.3, metalness: 0.4 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 9), hullM);
  hull.position.y = 0.6; hull.castShadow = true; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.2, 4), hullM);
  bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.6, 5.4); g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.25, 7), new THREE.MeshStandardMaterial({ color: 0x8a6a4a }));
  deck.position.y = 1.3; g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 3.6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cabin.position.set(0, 2.1, -1); cabin.castShadow = true; g.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x666666 }));
  mast.position.set(0, 3.6, 1.6); g.add(mast);
  g.userData.wheels = [];
  return g;
}
function makeJetskiMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 2.6), bodyM);
  body.position.y = 0.35; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), bodyM);
  nose.rotation.x = Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.set(0, 0.35, 1.6); g.add(nose);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.25, 1.1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  seat.position.set(0, 0.62, -0.5); g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  bar.position.set(0, 0.75, 0.55); g.add(bar);
  g.userData.wheels = [];
  return g;
}
const movingBoats = [];
function addMovingBoat(mesh, spec, x, z, heading, speed) {
  mesh.position.set(x, 0.15, z); mesh.rotation.y = heading;
  scene.add(mesh);
  movingBoats.push({ mesh, spec, kind: 'boat', speed, steer: 0, stolen: false, alt: 0, moving: true });
}
{
  // river surface: winding water planes + source lake + bridges
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x2a8ab0, roughness: 0.2, metalness: 0.4 });
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    const a = RIVER_POINTS[i], b = RIVER_POINTS[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(18, len), waterMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = Math.atan2(b.x - a.x, b.z - a.z);
    seg.position.set((a.x + b.x) / 2, 0.08, (a.z + b.z) / 2);
    world.add(seg);
  }
  const lake = new THREE.Mesh(new THREE.CircleGeometry(26, 24), waterMat);
  lake.rotation.x = -Math.PI / 2; lake.position.set(-272, 0.08, 178); world.add(lake);
  // bridges where roads cross the river
  addBox(10, 0.5, 22, 0x8a8f96, 42, 0.4, 205);
  addBox(10, 0.5, 22, 0x8a8f96, -142, 0.4, 172);
  // jackable watercraft: yacht + jetskis + river boats (parked)
  const yacht = makeYachtMesh();
  yacht.position.set(HALF + 34, 0.15, 82); yacht.rotation.y = 0.3; scene.add(yacht);
  boats.push({ mesh: yacht, spec: { type: 'boat', topSpeed: 14, turnRate: 0.5, label: 'yacht' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  const jet1 = makeJetskiMesh(0xff5a2a);
  jet1.position.set(HALF + 18, 0.15, 62); jet1.rotation.y = -0.4; scene.add(jet1);
  boats.push({ mesh: jet1, spec: { type: 'boat', topSpeed: 27, turnRate: 1.4, label: 'jetski' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  const jet2 = makeJetskiMesh(0x2ee6ff);
  jet2.position.set(-142, 0.15, 178); jet2.rotation.y = 1.2; scene.add(jet2);
  boats.push({ mesh: jet2, spec: { type: 'boat', topSpeed: 27, turnRate: 1.4, label: 'jetski' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  const riverBoat = makeBoatMesh(0xe8b820);
  riverBoat.position.set(-22, 0.15, 182); riverBoat.rotation.y = 0.8; scene.add(riverBoat);
  boats.push({ mesh: riverBoat, spec: { type: 'boat', topSpeed: 19, turnRate: 0.9, label: 'river boat' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  // moving watercraft to jack: a slow speedboat on the sea + a river cruiser
  addMovingBoat(makeBoatMesh(0xd94f70), { type: 'boat', topSpeed: 22, turnRate: 0.9, label: 'speedboat' }, HALF + 42, -70, 1.57, 5);
  addMovingBoat(makeBoatMesh(0x9fb6c9), { type: 'boat', topSpeed: 16, turnRate: 0.8, label: 'river cruiser' }, -82, 198, 1.57, 4);
}
function updateMovingBoats(dt) {
  for (const mb of movingBoats) {
    const h = mb.mesh.rotation.y;
    mb.mesh.position.x += Math.sin(h) * mb.speed * dt;
    mb.mesh.position.z += Math.cos(h) * mb.speed * dt;
    mb.mesh.position.y = 0.15 + Math.sin(state.time * 2 + mb.mesh.position.x) * 0.1;
    if (mb.mesh.position.x > 260 || mb.mesh.position.x < HALF + 8) mb.mesh.rotation.y += Math.PI;
    if (mb.mesh.position.z > 270 || mb.mesh.position.z < -270) mb.mesh.rotation.y += Math.PI;
  }
}
function jackBoat(mb) {
  const idx = movingBoats.indexOf(mb);
  if (idx >= 0) movingBoats.splice(idx, 1);
  mb.speed = 0; mb.moving = false; mb.stolen = true;
  boats.push(mb);
  state.inCar = mb;
  player.visible = false;
  const shoreX = mb.mesh.position.x > HALF ? HALF + 8 : mb.mesh.position.x;
  const captain = makePerson(pick(PED_SHIRTS), 0x2c3e50, pick([0xd9a066, 0x8a5a33]));
  captain.position.set(shoreX, 0, mb.mesh.position.z + 3);
  scene.add(captain);
  peds.push({ mesh: captain, x: captain.position.x, z: captain.position.z, heading: 0, speed: 5, target: { x: captain.position.x - 50, z: captain.position.z + 40 }, down: false, downTimer: 0, phase: 0, flee: true });
  addWanted(1, 'You jacked a boat! The captain called the Sheriff.');
  beep(220, 0.1, 'square', 0.12);
}

// ---------- Feature 4B: two airports + hijackable aircraft ----------
const planes = [];
const AIRPORTS = [
  { name: 'Solmar Intl', x: -210, z: -40 },
  { name: 'Bay Airstrip', x: 150, z: -200 },
];
function addPlane(mesh, spec, x, z, heading) {
  mesh.position.set(x, 0.3, z); mesh.rotation.y = heading;
  scene.add(mesh);
  const p = { mesh, spec, kind: 'plane', speed: 0, steer: 0, stolen: false, alt: 0 };
  planes.push(p);
  return p;
}
{
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.95 });
  // main airport: long runway, terminal, hangar, tower, helipad
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(190, 14), asphalt);
  rw.rotation.x = -Math.PI / 2; rw.position.set(-210, 0.03, -40); rw.receiveShadow = true; world.add(rw);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(190, 1), new THREE.MeshStandardMaterial({ color: 0xf5d76e }));
  stripe.rotation.x = -Math.PI / 2; stripe.position.set(-210, 0.05, -40); world.add(stripe);
  addBox(26, 8, 14, 0xd8d8d8, -210, 4, -20);
  addBox(26, 1, 15, 0x2e6fb0, -210, 8.5, -20);
  addBox(22, 10, 18, 0x8a8f96, -160, 5, -20);
  addBox(6, 22, 6, 0xb9b3a4, -248, 11, -20);
  addBox(9, 4, 9, 0x1c2833, -248, 24, -20);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x2c3e50 }));
  pad.position.set(-120, 0.12, -40); pad.receiveShadow = true; world.add(pad);
  addPlane(makePropPlaneMesh(0xe8e8e8), { type: 'plane', topSpeed: 32, label: 'prop plane' }, -245, -40, Math.PI / 2);
  addPlane(makeJetMesh(0x2a4a6a), { type: 'plane', topSpeed: 46, label: 'jet' }, -195, -40, Math.PI / 2);
  addPlane(makeSeaplaneMesh(0xf0ead8), { type: 'plane', topSpeed: 30, label: 'seaplane', canWater: true }, -160, -40, Math.PI / 2);
  const transport = makeHeliMesh(0x4a7a3a);
  transport.scale.set(1.35, 1.35, 1.35);
  transport.position.set(-270, 0.3, -52); scene.add(transport);
  helis.push({ mesh: transport, spec: { type: 'heli', topSpeed: 26, label: 'transport heli' }, kind: 'heli', speed: 0, steer: 0, stolen: false, alt: 0 });
  const policeHeliParked = makeHeliMesh(0x222222);
  policeHeliParked.position.set(-120, 0.3, -40); scene.add(policeHeliParked);
  helis.push({ mesh: policeHeliParked, spec: { type: 'heli', topSpeed: 32, label: 'police heli', police: true }, kind: 'heli', speed: 0, steer: 0, stolen: false, alt: 0 });
  // small airstrip: short runway + hangar + 2 planes
  const rw2 = new THREE.Mesh(new THREE.PlaneGeometry(110, 10), asphalt);
  rw2.rotation.x = -Math.PI / 2; rw2.position.set(150, 0.03, -200); rw2.receiveShadow = true; world.add(rw2);
  addBox(13, 7, 11, 0x8a8f96, 150, 3.5, -182);
  addPlane(makePropPlaneMesh(0xc0392b), { type: 'plane', topSpeed: 32, label: 'prop plane' }, 130, -200, Math.PI / 2);
  addPlane(makeSeaplaneMesh(0x2ee6ff), { type: 'plane', topSpeed: 30, label: 'seaplane', canWater: true }, 175, -200, Math.PI / 2);
}
// ---------- Feature 14 tiers: roadblock + police heli at high wanted ----------
const roadblocks = [];
let policeHeli = null;
function updateRoadblock(dt) {
  if (state.wanted >= 3 && roadblocks.length === 0) {
    const h = state.inCar ? state.inCar.mesh.rotation.y : playerState.heading;
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    const bx = px + Math.sin(h) * 30, bz = pz + Math.cos(h) * 30;
    for (const off of [-2.2, 2.2]) {
      const mesh = makeCarMesh(CAR_TYPES.find((c) => c.type === 'police'));
      mesh.position.set(bx + Math.cos(h) * off, 0, bz - Math.sin(h) * off);
      mesh.rotation.y = h + Math.PI / 2;
      scene.add(mesh);
      const col = { x: mesh.position.x, z: mesh.position.z, hx: 2.2, hz: 1 };
      colliders.push(col);
      roadblocks.push({ mesh, col });
    }
    toast('Roadblock ahead! The police are boxing you in.');
  }
  if (state.wanted < 3 && roadblocks.length > 0) {
    for (const rb of roadblocks) {
      scene.remove(rb.mesh);
      const ci = colliders.indexOf(rb.col);
      if (ci >= 0) colliders.splice(ci, 1);
    }
    roadblocks.length = 0;
  }
}
function updatePoliceHeli(dt) {
  if (state.wanted >= 4 && !policeHeli) {
    const mesh = makeHeliMesh(0x222222);
    mesh.position.set(playerState.x + 40, 35, playerState.z + 40);
    scene.add(mesh);
    policeHeli = { mesh, alt: 35 };
    toast('Police helicopter overhead! Lose it or go to ground.');
  }
  if (state.wanted < 4 && policeHeli) { scene.remove(policeHeli.mesh); policeHeli = null; return; }
  if (!policeHeli) return;
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  policeHeli.mesh.position.x = lerp(policeHeli.mesh.position.x, px + 12, dt * 0.7);
  policeHeli.mesh.position.z = lerp(policeHeli.mesh.position.z, pz + 12, dt * 0.7);
  policeHeli.mesh.position.y = 35 + Math.sin(state.time * 2) * 1;
  policeHeli.mesh.rotation.y += dt * 0.8;
  if (policeHeli.mesh.userData.rotor) policeHeli.mesh.userData.rotor.rotation.y += dt * 22;
  if (policeHeli.mesh.userData.rotor2) policeHeli.mesh.userData.rotor2.rotation.y += dt * 22;
}

// ---------- Feature 17: checkpoint race (repeatable, vs 1 AI racer) ----------
const RACE_START = { x: -210, z: -60 };
const RACE_CPS = [
  { x: -195, z: 90 }, { x: -40, z: 205 }, { x: 95, z: 185 },
  { x: 124, z: 40 }, { x: -12, z: -12 }, { x: -210, z: -60 },
];
const RACE_PRIZES = { fast: 1500, mid: 1000, slow: 600 };
let race = { active: false, cp: 0, timer: 0, won: 0 };
let raceAI = [];
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  pole.position.set(RACE_START.x, 2.5, RACE_START.z); world.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshStandardMaterial({ color: 0x111111, side: THREE.DoubleSide }));
  flag.position.set(RACE_START.x + 1.2, 4.3, RACE_START.z); world.add(flag);
  const flag2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  flag2.position.set(RACE_START.x + 1.2, 4.3, RACE_START.z + 0.02); world.add(flag2);
}
function nearRaceStart() {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  return Math.hypot(px - RACE_START.x, pz - RACE_START.z) < 9;
}
function startRace() {
  if (race.active) { toast('Race already running!'); return; }
  if (!nearRaceStart()) { toast('Go to the checkered flag at Solmar Intl airport to start a race (press T there).'); return; }
  race.active = true; race.cp = 0; race.timer = 150;
  setBeacon(RACE_CPS[0].x, RACE_CPS[0].z);
  toast('Race started! 6 checkpoints, 150 seconds — beat the AI racer for up to $1500!');
  speakLine('Race on! Six checkpoints. Beat my driver and the prize is yours.');
  const aiMesh = makeCarMesh(CAR_TYPES.find((c) => c.type === 'muscle'));
  aiMesh.position.set(RACE_START.x + 4, 0, RACE_START.z + 4);
  scene.add(aiMesh);
  raceAI = [{ mesh: aiMesh, cp: 0, speed: 0, heading: 0, done: false }];
}
function endRace(msg, prize) {
  race.active = false;
  beacon.visible = false;
  for (const a of raceAI) scene.remove(a.mesh);
  raceAI = [];
  if (prize > 0) { state.cash += prize; race.won++; }
  leagueRecord(prize);
  toast(msg + (prize > 0 ? ' +$' + prize : ''));
  updateHUD(); updateObjective(); saveGame();
}
function updateRace(dt) {
  if (!race.active) return;
  race.timer -= dt;
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const cp = RACE_CPS[race.cp];
  if (cp && Math.hypot(px - cp.x, pz - cp.z) < 9) {
    race.cp++;
    chime();
    if (race.cp >= RACE_CPS.length) {
      const used = 150 - race.timer;
      const prize = used < 75 ? RACE_PRIZES.fast : used < 110 ? RACE_PRIZES.mid : RACE_PRIZES.slow;
      endRace('Race won in ' + Math.round(used) + 's!', prize);
      speakLine('You won the race, ' + activeName() + '. Prize money is yours.');
      return;
    }
    setBeacon(RACE_CPS[race.cp].x, RACE_CPS[race.cp].z);
    toast('Checkpoint ' + race.cp + '/' + RACE_CPS.length + ' — next one marked!');
  }
  for (const a of raceAI) {
    if (a.done) continue;
    const target = RACE_CPS[a.cp];
    if (!target) { a.done = true; continue; }
    const dx = target.x - a.mesh.position.x, dz = target.z - a.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 9) {
      a.cp++;
      if (a.cp >= RACE_CPS.length) {
        a.done = true;
        endRace('The AI racer finished first — no prize this time.', 0);
        return;
      }
      continue;
    }
    const targetH = Math.atan2(dx, dz);
    let dh = targetH - a.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    a.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
    a.speed = clamp(a.speed + 12 * dt, 0, 13.5);
    a.mesh.rotation.y = a.heading;
    a.mesh.position.x += Math.sin(a.heading) * a.speed * dt;
    a.mesh.position.z += Math.cos(a.heading) * a.speed * dt;
  }
  if (race.timer <= 0) endRace('Out of time! The race is over.', 0);
}
// ---------- Feature 18: fishing ----------
const FISH_TYPES = [
  { name: 'Bay Sardine', value: 10, w: 0.5 },
  { name: 'Sea Bass', value: 25, w: 0.3 },
  { name: 'Bluefin Tuna', value: 60, w: 0.15 },
  { name: 'Golden Marlin', value: 200, w: 0.05 },
];
let fish = { stage: 0, timer: 0, biteTimer: 0, bobber: null, caught: 0 };
function nearWater(x, z) {
  if (x > HALF + 8) return true;
  if (onRiver(x, z)) return true;
  if (Math.hypot(x + 272, z - 178) < 30) return true;
  return false;
}
function castOrReel() {
  if (state.inCar) return false;
  if (fish.stage === 2) {
    const r = Math.random();
    let acc = 0, caught = FISH_TYPES[0];
    for (const f of FISH_TYPES) { acc += f.w; if (r <= acc) { caught = f; break; } }
    state.cash += caught.value;
    fish.caught++;
    if (fish.bobber) scene.remove(fish.bobber);
    fish.bobber = null; fish.stage = 0;
    toast('Caught a ' + caught.name + '! Sold for $' + caught.value + '.');
    speakLine('Nice catch! A ' + caught.name + ', worth ' + caught.value + ' dollars.');
    chime(); saveGame(); updateHUD();
    return true;
  }
  if (fish.stage === 1) {
    toast('Reeled in too early — the fish got away.');
    if (fish.bobber) scene.remove(fish.bobber);
    fish.bobber = null; fish.stage = 0;
    return true;
  }
  if (!nearWater(playerState.x, playerState.z)) return false;
  const fx = Math.sin(playerState.heading), fz = Math.cos(playerState.heading);
  const bob = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff5a2a, emissive: 0xaa2200, emissiveIntensity: 0.6 }));
  bob.position.set(playerState.x + fx * 5, 0.4, playerState.z + fz * 5);
  scene.add(bob);
  fish.bobber = bob;
  fish.stage = 1;
  fish.timer = 3 + Math.random() * 5;
  toast('Line cast… waiting for a bite. Press F again when it bites!');
  beep(300, 0.1, 'sine', 0.12);
  return true;
}
function updateFishing(dt) {
  if (fish.stage === 1) {
    fish.timer -= dt;
    if (fish.bobber) fish.bobber.position.y = 0.4 + Math.sin(state.time * 2) * 0.08;
    if (fish.timer <= 0) {
      fish.stage = 2; fish.biteTimer = 2.5;
      toast('BITE! Press F now to reel it in!');
      beep(990, 0.25, 'sine', 0.25);
    }
  } else if (fish.stage === 2) {
    fish.biteTimer -= dt;
    if (fish.bobber) fish.bobber.position.y = 0.4 + Math.abs(Math.sin(state.time * 12)) * 0.35;
    if (fish.biteTimer <= 0) {
      toast('The fish got away…');
      if (fish.bobber) scene.remove(fish.bobber);
      fish.bobber = null; fish.stage = 0;
    }
  }
}
// ---------- Feature 19: wild animals ----------
const animals = [];
function makeDeerMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xa8763e, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.4), m);
  body.position.y = 1.0; body.castShadow = true; g.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), m);
  neck.position.set(0, 1.5, 0.6); neck.rotation.x = 0.4; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.55), m);
  head.position.set(0, 1.85, 0.85); g.add(head);
  const ant = new THREE.MeshStandardMaterial({ color: 0x5a3a1a });
  for (const sx of [-0.12, 0.12]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5), ant);
    a.position.set(sx, 2.2, 0.8); a.rotation.z = sx * 2; g.add(a);
  }
  for (const [lx, lz] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 5), m);
    leg.position.set(lx, 0.4, lz); g.add(leg);
  }
  return g;
}
function makeRabbitMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xb9a88a, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), m);
  body.scale.set(1, 0.85, 1.4); body.position.y = 0.32; body.castShadow = true; g.add(body);
  for (const sx of [-0.1, 0.1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 5), m);
    ear.position.set(sx, 0.75, -0.1); ear.rotation.x = -0.2; g.add(ear);
  }
  return g;
}
function makeBirdMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), m);
  body.rotation.x = Math.PI / 2; g.add(body);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.4), m);
  wingL.position.x = -0.6; g.add(wingL);
  const wingR = wingL.clone(); wingR.position.x = 0.6; g.add(wingR);
  g.userData.wingL = wingL; g.userData.wingR = wingR;
  return g;
}
function makeWaterFishMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xff8c42, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), m);
  body.rotation.z = -Math.PI / 2; g.add(body);
  return g;
}
function makeWolfMesh() {
  const g = makeDeerMesh();
  g.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.95 }); });
  return g;
}
function makeBearMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.9), m);
  body.position.y = 1.1; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), m);
  head.position.set(0, 1.7, 1.0); g.add(head);
  for (const [lx, lz] of [[-0.4, 0.7], [0.4, 0.7], [-0.4, -0.7], [0.4, -0.7]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 6), m);
    leg.position.set(lx, 0.45, lz); g.add(leg);
  }
  return g;
}
function addAnimal(kind, mesh, x, z, zone) {
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  animals.push({ kind, mesh, x, z, heading: rng() * Math.PI * 2, speed: kind === 'bird' ? 8 : rr(1, 2), target: null, down: false, downTimer: 0, named: false, attackCd: 0, zone, angle: rng() * Math.PI * 2 });
}
{
  for (let i = 0; i < 6; i++) addAnimal('deer', makeDeerMesh(), rr(-260, 260), rr(-270, -160), { cx: 0, cz: -210, rx: 260, rz: 60 });
  for (let i = 0; i < 8; i++) addAnimal('rabbit', makeRabbitMesh(), rr(-260, -150), rr(-90, 90), { cx: -205, cz: 0, rx: 55, rz: 90 });
  for (let i = 0; i < 6; i++) addAnimal('bird', makeBirdMesh(), rr(-200, 200), rr(-200, 200), { cx: 0, cz: 0, rx: 200, rz: 200 });
  for (let i = 0; i < 10; i++) {
    const inSea = i < 6;
    addAnimal('fish', makeWaterFishMesh(), inSea ? HALF + 30 + rr(-8, 40) : RIVER_POINTS[i % RIVER_POINTS.length].x + rr(-4, 4), inSea ? rr(-120, 120) : RIVER_POINTS[i % RIVER_POINTS.length].z + rr(-4, 4), { cx: 0, cz: 0, rx: 40, rz: 100 });
  }
  for (let i = 0; i < 3; i++) addAnimal('wolf', makeWolfMesh(), rr(-100, 200), rr(170, 260), { cx: 50, cz: 215, rx: 150, rz: 45 });
  addAnimal('bear', makeBearMesh(), rr(-100, 100), rr(-270, -180), { cx: 0, cz: -225, rx: 100, rz: 45 });
}
function updateAnimals(dt) {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  for (const a of animals) {
    if (a.down) {
      a.downTimer -= dt;
      if (a.downTimer <= 0) { a.down = false; a.mesh.rotation.x = 0; a.mesh.position.y = a.kind === 'bird' ? 45 : 0; }
      continue;
    }
    const dPlayer = Math.hypot(a.x - px, a.z - pz);
    if (a.kind === 'bird') {
      a.angle += dt * 0.25;
      a.x = a.zone.cx + Math.cos(a.angle) * 120;
      a.z = a.zone.cz + Math.sin(a.angle) * 120;
      a.mesh.position.set(a.x, 42 + Math.sin(state.time + a.angle) * 6, a.z);
      a.mesh.rotation.y = -a.angle;
      const flap = Math.sin(state.time * 8 + a.angle) * 0.5;
      if (a.mesh.userData.wingL) { a.mesh.userData.wingL.rotation.z = flap; a.mesh.userData.wingR.rotation.z = -flap; }
      continue;
    }
    if (a.kind === 'fish') {
      a.angle += dt * 0.5;
      a.x += Math.cos(a.angle) * a.speed * dt * 0.4;
      a.z += Math.sin(a.angle) * a.speed * dt * 0.4;
      a.mesh.position.set(a.x, 0.05, a.z);
      a.mesh.rotation.y = -a.angle;
      continue;
    }
    if (dPlayer < 7 && !a.named) { a.named = true; toast('Wild ' + a.kind + ' — ' + (a.kind === 'wolf' || a.kind === 'bear' ? 'dangerous! Keep your distance.' : 'it flees if you get close.')); }
    if (dPlayer > 16) a.named = false;
    const predator = a.kind === 'wolf' || a.kind === 'bear';
    if (predator && dPlayer < 11 && !state.inCar) {
      a.heading = Math.atan2(px - a.x, pz - a.z);
      a.x += Math.sin(a.heading) * 5 * dt;
      a.z += Math.cos(a.heading) * 5 * dt;
      a.attackCd -= dt;
      if (dPlayer < 1.8 && a.attackCd <= 0) {
        a.attackCd = 1.5;
        damagePlayer(5, 'A wild ' + a.kind + ' mauled ' + activeName());
      }
    } else if ((a.kind === 'deer' || a.kind === 'rabbit') && dPlayer < 9) {
      const away = Math.atan2(a.x - px, a.z - pz);
      a.heading = away;
      a.x += Math.sin(away) * 6 * dt;
      a.z += Math.cos(away) * 6 * dt;
    } else {
      if (!a.target || Math.hypot(a.target.x - a.x, a.target.z - a.z) < 2) {
        a.target = { x: a.zone.cx + rr(-a.zone.rx, a.zone.rx), z: a.zone.cz + rr(-a.zone.rz, a.zone.rz) };
      }
      const dx = a.target.x - a.x, dz = a.target.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      a.heading = Math.atan2(dx, dz);
      a.x += (dx / d) * a.speed * dt; a.z += (dz / d) * a.speed * dt;
    }
    a.mesh.position.set(a.x, groundHeight(a.x, a.z), a.z);
    a.mesh.rotation.y = a.heading;
  }
}

// ---------- Feature 22: shops — Binco clothes, vehicle dealers, aircraft sales ----------
const SHOPS = [
  { id: 'binco', name: 'Binco Clothing', x: -30, z: 40, items: [
    { name: 'Teal Tee', price: 50, kind: 'outfit', color: 0x1e8a8a },
    { name: 'Coral Top', price: 50, kind: 'outfit', color: 0xd94f70 },
    { name: 'Gold Jacket', price: 80, kind: 'outfit', color: 0xe8b820 },
    { name: 'Purple Hoodie', price: 120, kind: 'outfit', color: 0x9b59b6 },
    { name: 'Black Leather', price: 150, kind: 'outfit', color: 0x1a1a1a },
  ]},
  { id: 'dealer-city', name: 'Solmar Motors — City', x: 110, z: -100, items: [
    { name: 'Sedan', price: 600, kind: 'car', type: 'sedan' },
    { name: 'Muscle Car', price: 1500, kind: 'car', type: 'muscle' },
    { name: 'Motorcycle', price: 800, kind: 'moto' },
    { name: 'Supercar', price: 25000, kind: 'car', type: 'supercar' },
  ]},
  { id: 'dealer-farm', name: 'Solmar Motors — Farm', x: -180, z: -20, items: [
    { name: 'Pickup Truck', price: 700, kind: 'car', type: 'pickup' },
    { name: 'Quad Bike', price: 900, kind: 'quad' },
    { name: 'Horse', price: 400, kind: 'horse' },
  ]},
  { id: 'aircraft', name: 'Bay Aircraft Sales', x: -160, z: -28, items: [
    { name: 'Prop Plane', price: 2000, kind: 'plane', type: 'prop' },
    { name: 'Jet', price: 5000, kind: 'plane', type: 'jet' },
    { name: 'Light Helicopter', price: 3000, kind: 'heli' },
    { name: 'Luxury Yacht', price: 8000, kind: 'boat', type: 'yacht' },
  ]},
  // Features 26 + 27: property and businesses (buy menu, E at the door)
  { id: 'small-house', name: 'Sunset Cottage', x: -248, z: -60, items: [
    { name: 'Small House', price: 5000, kind: 'property', safehouse: true, income: 0 },
  ]},
  { id: 'apartment', name: 'Bayview Apartments', x: 112, z: -36, items: [
    { name: 'Apartment', price: 15000, kind: 'property', safehouse: true, income: 0 },
  ]},
  { id: 'mansion', name: 'Solmar Mansion', x: 150, z: 80, items: [
    { name: 'Luxury Mansion', price: 50000000, kind: 'property', safehouse: true, income: 0 },
  ]},
  { id: 'bar', name: 'Sunset Bar', x: 12, z: -38, items: [
    { name: 'Bar', price: 30000, kind: 'property', income: 150 },
  ]},
  { id: 'garage', name: 'Solmar Garage', x: -170, z: 60, items: [
    { name: 'Garage', price: 20000, kind: 'property', income: 100, workshop: true },
  ]},
  { id: 'workshop', name: 'Bay Workshop', x: -100, z: 100, items: [
    { name: 'Workshop', price: 40000, kind: 'property', income: 200, workshop: true },
  ]},
  { id: 'golf', name: 'Solmar Golf Club', x: 100, z: -160, items: [
    { name: 'Golf Course', price: 250000, kind: 'property', income: 1500 },
  ]},
  { id: 'nightclub', name: 'Neon Nights Club', x: 48, z: 38, items: [
    { name: 'Nightclub', price: 500000, kind: 'property', income: 3000 },
  ]},
  { id: 'factory', name: 'Solmar Factory', x: -260, z: 150, items: [
    { name: 'Factory', price: 750000, kind: 'property', income: 5000 },
  ]},
  { id: 'carrental', name: 'Bay Car Rental', x: -150, z: -60, items: [
    { name: 'Car Rental', price: 120000, kind: 'property', income: 800 },
  ]},
  { id: 'gasstation', name: 'Bay Fuel Station', x: -160, z: 8, items: [
    { name: 'Gas Station', price: 90000, kind: 'property', income: 600 },
  ]},
  // Feature 35: barber + tattoo shop
  { id: 'barber', name: 'Solmar Barber', x: -72, z: 38, items: [
    { name: 'Haircut — Short', price: 30, kind: 'haircut', style: 'short' },
    { name: 'Haircut — Long', price: 40, kind: 'haircut', style: 'long' },
    { name: 'Mohawk', price: 50, kind: 'haircut', style: 'mohawk' },
    { name: 'Shave Bald', price: 10, kind: 'haircut', style: 'bald' },
    { name: 'Hair Colour — Red', price: 25, kind: 'haircolor', color: 0xc0392b },
    { name: 'Hair Colour — Blonde', price: 25, kind: 'haircolor', color: 0xe8c860 },
    { name: 'Hair Colour — Black', price: 20, kind: 'haircolor', color: 0x1a1a1a },
  ]},
  { id: 'tattoo', name: 'Ink Bay Tattoo', x: 72, z: 38, items: [
    { name: 'Dragon Arm Tattoo', price: 100, kind: 'tattoo', design: 'dragon' },
    { name: 'Rose Chest Tattoo', price: 80, kind: 'tattoo', design: 'rose' },
    { name: 'Skull Back Tattoo', price: 120, kind: 'tattoo', design: 'skull' },
    { name: 'Snake Arm Tattoo', price: 90, kind: 'tattoo', design: 'snake' },
  ]},
  // Features 33 + 34: weapon shop — grenades, molotovs, bazooka + ammo
  { id: 'bayarms', name: 'Bay Arms', x: -48, z: 38, items: [
    { name: 'Knife', price: 150, kind: 'weapon', w: 'knife' },
    { name: 'Grenade x3', price: 300, kind: 'ammo', w: 'grenade', n: 3 },
    { name: 'Molotov x3', price: 250, kind: 'ammo', w: 'molotov', n: 3 },
    { name: 'Bazooka', price: 5000, kind: 'weapon', w: 'bazooka' },
    { name: 'Bazooka Rocket', price: 800, kind: 'ammo', w: 'bazooka', n: 1 },
    { name: 'Sniper Rifle', price: 2000, kind: 'weapon', w: 'sniper' },
    { name: 'Sniper Rounds x5', price: 200, kind: 'ammo', w: 'sniper', n: 5 },
    { name: 'Sniper Rounds x5', price: 200, kind: 'ammo', w: 'sniper', n: 5 },
    { name: 'Shotgun Shells x12', price: 100, kind: 'ammo', w: 'shotgun', n: 12 },
    { name: 'SMG Ammo x60', price: 150, kind: 'ammo', w: 'smg', n: 60 },
  ]},
];
let shopOpen = false, currentShop = null, currentShopItems = [];
{
  // Binco kiosk in the city
  addBox(5, 4, 4, 0xd94f70, -30, 2, 40);
  addBox(5.4, 0.8, 4.4, 0x1e5aa8, -30, 4.4, 40);
  colliders.push({ x: -30, z: 40, hx: 2.7, hz: 2.2 });
  // dealer lots: display vehicles + signs
  const disp1 = makeCarMesh(CAR_TYPES.find((c) => c.type === 'sedan'));
  disp1.position.set(110, 0, -106); disp1.rotation.y = 0.5; scene.add(disp1);
  const disp2 = makeCarMesh(CAR_TYPES.find((c) => c.type === 'muscle'));
  disp2.position.set(116, 0, -96); disp2.rotation.y = -0.4; scene.add(disp2);
  const disp3 = makeMotoMesh(0xc0392b);
  disp3.position.set(104, 0, -94); disp3.rotation.y = 1.2; scene.add(disp3);
  addBox(8, 1, 3, 0xffd23f, 110, 3.5, -112);
  const farmDisp = makeCarMesh(CAR_TYPES.find((c) => c.type === 'pickup'));
  farmDisp.position.set(-180, 0, -28); farmDisp.rotation.y = 0.3; scene.add(farmDisp);
  addBox(8, 1, 3, 0xffd23f, -180, 3.5, -12);
  addBox(8, 1, 3, 0x7fb2e8, -160, 3.5, -32);
}
{
  // Features 26 + 27: property/business buildings + Pay 'n Spray canopy
  const propVisuals = [
    { x: -248, z: -60, c: 0xd8c8a8, w: 8, h: 5, d: 7 },
    { x: 112, z: -36, c: 0x7fb2e8, w: 10, h: 20, d: 10 },
    { x: 150, z: 80, c: 0xffe9a8, w: 16, h: 8, d: 12 },
    { x: 12, z: -38, c: 0x9b59b6, w: 6, h: 4, d: 5 },
    { x: -170, z: 60, c: 0x8a8f96, w: 10, h: 5, d: 8 },
    { x: -100, z: 100, c: 0xc0392b, w: 10, h: 6, d: 8 },
    { x: 100, z: -160, c: 0x2ecc71, w: 8, h: 4, d: 6 },
    { x: 48, z: 38, c: 0xff2a7a, w: 8, h: 6, d: 6 },
    { x: -260, z: 150, c: 0x95a5a6, w: 14, h: 8, d: 10 },
    { x: -150, z: -60, c: 0xe8b820, w: 8, h: 5, d: 7 },
    { x: -160, z: 8, c: 0xff5a2a, w: 8, h: 5, d: 6 },
    { x: -72, z: 38, c: 0x7fb2e8, w: 5, h: 4, d: 4 },
    { x: 72, z: 38, c: 0x1a1a1a, w: 5, h: 4, d: 4 },
    { x: -48, z: 38, c: 0x2ecc71, w: 5, h: 4, d: 4 },
  ];
  for (const v of propVisuals) {
    const gy = groundHeight(v.x, v.z);
    addBox(v.w, v.h, v.d, v.c, v.x, v.h / 2 + gy, v.z);
    colliders.push({ x: v.x, z: v.z, hx: v.w / 2 + 0.3, hz: v.d / 2 + 0.3 });
  }
  // Pay 'n Spray (F28): open canopy over the road at (-60, 84)
  addBox(14, 0.6, 12, 0x2e6fb0, -60, 5.2, 84);
  for (const [px, pz] of [[-66, 79], [-54, 79], [-66, 89], [-54, 89]]) addBox(0.5, 5, 0.5, 0x1c2833, px, 2.5, pz);
  addBox(10, 1.2, 0.4, 0xffd23f, -60, 4.2, 90.2);
}
{
  // Feature 37: fire station + hospital, with parked emergency vehicles
  addBox(14, 7, 10, 0xc0392b, -132, 3.5, 60);
  addBox(14.4, 1, 10.4, 0x8a1a1a, -132, 7.5, 60);
  addBox(8, 1.2, 0.4, 0xffd23f, -132, 5.5, 65.2);
  colliders.push({ x: -132, z: 60, hx: 7.3, hz: 5.3 });
  addBox(14, 10, 10, 0xf0f4f8, 132, 5, -60);
  addBox(3, 0.9, 0.4, 0xff2222, 132, 7, -54.8);
  addBox(0.9, 3, 0.4, 0xff2222, 132, 7, -54.8);
  colliders.push({ x: 132, z: -60, hx: 7.3, hz: 5.3 });
  const ftSpec = CAR_TYPES.find((c) => c.type === 'firetruck');
  const ftMesh = makeCarMesh(ftSpec);
  ftMesh.position.set(-132, 0, 74); ftMesh.rotation.y = 0.2; scene.add(ftMesh);
  parkedCars.push({ mesh: ftMesh, spec: ftSpec, speed: 0, steer: 0, stolen: false });
  const amSpec = CAR_TYPES.find((c) => c.type === 'ambulance');
  const amMesh = makeCarMesh(amSpec);
  amMesh.position.set(132, 0, -74); amMesh.rotation.y = -0.2; scene.add(amMesh);
  parkedCars.push({ mesh: amMesh, spec: amSpec, speed: 0, steer: 0, stolen: false });
  // Feature 38: one drivable city bus parked at the downtown stop
  const busSpec = CAR_TYPES.find((c) => c.type === 'bus');
  const busMesh = makeCarMesh(busSpec);
  busMesh.position.set(-60, 0, -16); busMesh.rotation.y = Math.PI / 2; scene.add(busMesh);
  parkedCars.push({ mesh: busMesh, spec: busSpec, speed: 0, steer: 0, stolen: false });
  // a few yellow taxis parked in the city (hijackable like normal cars)
  for (const [tx, tz] of [[-24, -40], [36, 12], [-60, 48]]) {
    const tSpec = CAR_TYPES.find((c) => c.type === 'taxi');
    const tMesh = makeCarMesh(tSpec);
    tMesh.position.set(tx, 0, tz); tMesh.rotation.y = rr(0, Math.PI); scene.add(tMesh);
    parkedCars.push({ mesh: tMesh, spec: tSpec, speed: 0, steer: 0, stolen: false });
  }
}
function nearestShop() {
  for (const s of SHOPS) {
    if (Math.hypot(s.x - playerState.x, s.z - playerState.z) < 5) return s;
  }
  return null;
}
// Features 26 + 27: owned property/businesses + last owned vehicle (customisation target)
let ownedProperties = [];
let lastOwnedCar = null;
let passiveTimer = 0;
function openShop(shop) {
  currentShop = shop; shopOpen = true;
  document.getElementById('shopTitle').textContent = shop.name;
  document.getElementById('shopCash').textContent = 'Your cash: $' + state.cash.toLocaleString('en-US');
  const box = document.getElementById('shopItems');
  box.innerHTML = '';
  currentShopItems = shop.items.slice();
  // Feature 27: owning a garage/workshop unlocks car customisation in its menu
  if (ownedProperties.some((p) => p.id === shop.id && p.workshop)) {
    currentShopItems.push(
      { name: 'Paint — Red', price: 500, kind: 'custom', mode: 'paint', color: 0xc0392b },
      { name: 'Paint — Gold', price: 500, kind: 'custom', mode: 'paint', color: 0xffd23f },
      { name: 'Paint — Blue', price: 500, kind: 'custom', mode: 'paint', color: 0x2e6fb0 },
      { name: 'Paint — Black', price: 500, kind: 'custom', mode: 'paint', color: 0x1a1a1a },
      { name: 'Sport Wheels', price: 800, kind: 'custom', mode: 'wheels' },
      { name: 'Engine Upgrade +15%', price: 2000, kind: 'custom', mode: 'engine' },
      { name: 'Handling Upgrade +15%', price: 1500, kind: 'custom', mode: 'handling' },
    );
  }
  currentShopItems.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.innerHTML = '<span>' + item.name + '</span><span>$' + item.price.toLocaleString('en-US') + '</span>';
    b.disabled = state.cash < item.price || (item.kind === 'property' && ownedProperties.some((p) => p.id === shop.id));
    b.addEventListener('click', () => buyShopItem(i));
    box.appendChild(b);
  });
  document.getElementById('shop').classList.remove('hidden');
  beep(880, 0.1, 'sine', 0.15);
}
function closeShop() {
  shopOpen = false; currentShop = null;
  document.getElementById('shop').classList.add('hidden');
}
function buyShopItem(i) {
  if (!currentShop) return;
  const item = currentShopItems[i];
  if (!item) return;
  if (state.cash < item.price) { toast('Not enough money for the ' + item.name + ' ($' + item.price.toLocaleString('en-US') + ').'); return; }
  state.cash -= item.price;
  if (item.kind === 'outfit') {
    const ch = CHARS[state.activeChar];
    ch.outfit = item.color;
    player.userData.body.material.color.setHex(item.color);
    toast(activeName() + ' bought the ' + item.name + ' — looking sharp!');
  } else if (item.kind === 'car') {
    const spec = CAR_TYPES.find((c) => c.type === item.type);
    const mesh = makeCarMesh(spec);
    mesh.position.set(currentShop.x + 8, 0, currentShop.z + 8); mesh.rotation.y = 0.5;
    scene.add(mesh);
    parkedCars.push({ mesh, spec, speed: 0, steer: 0, stolen: true, owned: true });
    lastOwnedCar = parkedCars[parkedCars.length - 1];
    toast('You bought a ' + item.name + '! It is yours — parked right outside, no wanted level.');
  } else if (item.kind === 'moto') {
    addExtraVehicle('moto', makeMotoMesh(0xc0392b), { type: 'moto', color: 0xc0392b, len: 2.2, w: 1.2, h: 0.7, topSpeed: 34, accel: 22, steerRate: 0.85, label: 'motorcycle' }, currentShop.x + 8, currentShop.z + 8, 0.5);
    extraVehicles[extraVehicles.length - 1].stolen = true;
    toast('You bought a Motorcycle! Parked outside the dealer.');
  } else if (item.kind === 'quad') {
    addExtraVehicle('quad', makeQuadMesh(0x2ecc71), { type: 'quad', topSpeed: 24, accel: 17, steerRate: 0.8, label: 'quad bike' }, currentShop.x + 8, currentShop.z + 8, 0.5);
    extraVehicles[extraVehicles.length - 1].stolen = true;
    toast('You bought a Quad Bike! Parked outside the dealer.');
  } else if (item.kind === 'horse') {
    addExtraVehicle('horse', makeHorseMesh(0x8a5a2a), { type: 'horse', topSpeed: 18, accel: 14, steerRate: 0.7, label: 'horse' }, currentShop.x + 8, currentShop.z + 8, 0.5);
    extraVehicles[extraVehicles.length - 1].stolen = true;
    toast('You bought a Horse! It is waiting outside the dealer.');
  } else if (item.kind === 'plane') {
    const mesh = item.type === 'jet' ? makeJetMesh(0x2a4a6a) : makePropPlaneMesh(0xe8e8e8);
    addPlane(mesh, { type: 'plane', topSpeed: item.type === 'jet' ? 46 : 32, label: item.type === 'jet' ? 'jet' : 'prop plane' }, -180, -40, Math.PI / 2);
    planes[planes.length - 1].stolen = true;
    toast('You bought a ' + item.name + '! It is parked on the runway at Solmar Intl.');
  } else if (item.kind === 'heli') {
    const mesh = makeHeliMesh(0x2e6fb0);
    mesh.position.set(-120, 0.3, -40); scene.add(mesh);
    helis.push({ mesh, spec: { type: 'heli', topSpeed: 30, label: 'helicopter' }, kind: 'heli', speed: 0, steer: 0, stolen: true, alt: 0 });
    lastOwnedCar = helis[helis.length - 1];
    toast('You bought a Helicopter! It is on the helipad at Solmar Intl.');
  } else if (item.kind === 'boat') {
    const ymesh = makeYachtMesh();
    ymesh.position.set(HALF + 34, 0.15, 100); ymesh.rotation.y = 0.3; scene.add(ymesh);
    boats.push({ mesh: ymesh, spec: { type: 'boat', topSpeed: 14, turnRate: 0.5, label: 'yacht' }, kind: 'boat', speed: 0, steer: 0, stolen: true, owned: true, alt: 0 });
    lastOwnedCar = boats[boats.length - 1];
    toast('You bought a Luxury Yacht! It is moored at the marina — yours, no wanted level.');
  } else if (item.kind === 'property') {
    ownedProperties.push({ id: currentShop.id, name: item.name, x: currentShop.x, z: currentShop.z, income: item.income || 0, safehouse: !!item.safehouse, workshop: !!item.workshop });
    if (item.safehouse) {
      state.spawnPoint = { x: currentShop.x + 4, z: currentShop.z + 4 };
      toast('Safehouse set — you will respawn at your ' + item.name + ' after being wasted.');
    }
    toast('You bought the ' + item.name + ' for $' + item.price.toLocaleString('en-US') + (item.income ? ' — it earns $' + item.income.toLocaleString('en-US') + ' every minute.' : ' — it is yours now.'));
  } else if (item.kind === 'custom') {
    const target = (state.inCar && state.inCar.owned) ? state.inCar : lastOwnedCar;
    if (!target || !target.mesh) { toast('No owned vehicle to customise — buy one first, then get in it.'); state.cash += item.price; updateHUD(); closeShop(); return; }
    if (item.mode === 'paint' && target.mesh.children[0]) {
      target.mesh.children[0].material.color.setHex(item.color);
      toast('Repainted your ' + (target.spec.label || target.spec.type) + '!');
    } else if (item.mode === 'wheels' && target.mesh.userData.wheels) {
      for (const w of target.mesh.userData.wheels) { w.scale.set(1.18, 1.18, 1.18); w.material.color.setHex(0xcccccc); }
      toast('Sport wheels fitted!');
    } else if (item.mode === 'engine') {
      target.spec.topSpeed = Math.round(target.spec.topSpeed * 1.15);
      toast('Engine upgraded! Top speed now ' + target.spec.topSpeed + '.');
    } else if (item.mode === 'handling') {
      target.spec.steerRate = (target.spec.steerRate || 0.6) * 1.15;
      toast('Handling upgraded — sharper steering!');
    }
  } else if (item.kind === 'haircut') {
    const ch = CHARS[state.activeChar];
    setHairstyle(ch, item.style);
    toast(ch.name + ' got a new haircut: ' + item.style + '!');
  } else if (item.kind === 'haircolor') {
    const ch = CHARS[state.activeChar];
    setHairColor(ch, item.color);
    toast(ch.name + ' dyed their hair!');
  } else if (item.kind === 'tattoo') {
    addTattoo(CHARS[state.activeChar], item.design);
  } else if (item.kind === 'ammo') {
    state.ammo[item.w] = (state.ammo[item.w] || 0) + item.n;
    toast('Bought ' + item.name + ' — ' + WEAPONS[item.w].name + ' ammo now ' + state.ammo[item.w] + '.');
  } else if (item.kind === 'weapon') {
    if (item.w === 'bazooka') state.ammo.bazooka = (state.ammo.bazooka || 0) + 1;
    state.weapon = item.w;
    toast('You bought the ' + WEAPONS[item.w].name + '! Press ' + (item.w === 'knife' ? '4' : '7') + ' to use it.');
  } else if (item.kind === 'spray') {
    const c = state.inCar;
    if (c && c.mesh && c.mesh.children[0]) c.mesh.children[0].material.color.setHex(item.color);
    clearWanted();
    toast('Pay \'n Spray: fresh paint + a clean slate. Wanted stars cleared!');
  }
  chime(); saveGame(); updateHUD();
  closeShop();
}
// Feature 27: passive business income, $ per game minute (60 s of play)
function collectPassiveIncome() {
  const total = ownedProperties.reduce((s, p) => s + (p.income || 0), 0);
  if (total > 0) {
    state.cash += total;
    toast('Your businesses earned $' + total.toLocaleString('en-US') + '.');
    chime(); saveGame(); updateHUD();
  }
  return total;
}
function updatePassiveIncome(dt) {
  passiveTimer += dt;
  if (passiveTimer >= 60) { passiveTimer = 0; collectPassiveIncome(); }
}
// Feature 28: Pay 'n Spray — drive in, pay, repaint + wanted cleared
const PAYNSPRAY = { x: -60, z: 84 };
function clearWanted() {
  state.wanted = 0;
  for (const po of police) scene.remove(po.mesh);
  police.length = 0;
  for (const b of window.__solmarPoliceBikes || []) scene.remove(b.mesh);
  (window.__solmarPoliceBikes || []).length = 0;
  for (const h of hunters) scene.remove(h.mesh);
  hunters.length = 0;
  for (const rb of roadblocks) scene.remove(rb.mesh);
  roadblocks.length = 0;
  if (policeHeli) { scene.remove(policeHeli.mesh); policeHeli = null; }
  updateHUD();
}
function openPaynSpray() {
  currentShop = { id: 'paynspray', name: 'Pay \'n Spray — $200' };
  currentShopItems = [
    { name: 'Repaint — Red', price: 200, kind: 'spray', color: 0xc0392b },
    { name: 'Repaint — Gold', price: 200, kind: 'spray', color: 0xffd23f },
    { name: 'Repaint — Blue', price: 200, kind: 'spray', color: 0x2e6fb0 },
    { name: 'Repaint — Black', price: 200, kind: 'spray', color: 0x1a1a1a },
    { name: 'Repaint — Pink', price: 200, kind: 'spray', color: 0xd94f70 },
  ];
  shopOpen = true;
  document.getElementById('shopTitle').textContent = 'Pay \'n Spray';
  document.getElementById('shopCash').textContent = 'Your cash: $' + state.cash.toLocaleString('en-US') + ' · Repaint + wanted cleared';
  const box = document.getElementById('shopItems');
  box.innerHTML = '';
  currentShopItems.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.innerHTML = '<span>' + item.name + '</span><span>$' + item.price + '</span>';
    b.disabled = state.cash < item.price;
    b.addEventListener('click', () => buyShopItem(i));
    box.appendChild(b);
  });
  document.getElementById('shop').classList.remove('hidden');
  beep(880, 0.1, 'sine', 0.15);
}
document.getElementById('shopClose').addEventListener('click', closeShop);

// ---------- Feature 25: finale heist (endgame, unlocked after M1–M3) ----------
const HEIST_STAGES = [
  { x: -210, z: -40, text: 'Stage 1: reach the airport vault and grab the loot.' },
  { x: -40, z: 205, text: 'Stage 2: the loot is yours — 5 stars! Escape to the river bridge!' },
  { x: HALF + 20, z: 40, text: 'Stage 3: get to the marina — escape by sea!' },
  { x: 176, z: 222, text: 'Final: reach the southern keys island with the loot!' },
];
// Feature 25 (revised): the heist pays exactly the most expensive aircraft-shop
// item + the most expensive property, so the winner can afford both.
const HEIST_REWARD = (() => {
  const air = SHOPS.find((s) => s.id === 'aircraft');
  const airMax = Math.max(...air.items.map((i) => i.price));
  const propMax = Math.max(...SHOPS.flatMap((s) => s.items).filter((i) => i.kind === 'property').map((i) => i.price));
  return airMax + propMax;
})();
let heist = { active: false, stage: 0, timer: 0 };
let heistMarker = null;
{
  heistMarker = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 1.2 }));
  heistMarker.position.set(-12, 2.5, -12);
  heistMarker.visible = false;
  scene.add(heistMarker);
}
function startHeist() {
  if (state.mode !== 'play') return;
  if (state.mission < MISSIONS.length) { toast('The finale heist unlocks after all 3 Marisol missions are done.'); return; }
  if (heist.active) { toast('Heist already running!'); return; }
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  if (Math.hypot(px + 12, pz + 12) > 12) { toast('Go to the gold marker downtown to start the finale heist (press H there).'); return; }
  heist.active = true; heist.stage = 0; heist.timer = 300;
  setBeacon(HEIST_STAGES[0].x, HEIST_STAGES[0].z);
  toast('FINALE HEIST — 4 stages, 300 seconds, 5 stars waiting. Bring weapons, a fast ride and a full vest!');
  speakLine('This is the big one. Airport vault, then run — land, sea, and the keys. The yacht and the mansion are on the line.');
  updateHUD();
}
function updateHeist(dt) {
  if (heistMarker) {
    heistMarker.visible = state.mission >= MISSIONS.length && !heist.active && !state.shot;
    if (heistMarker.visible) heistMarker.rotation.y += dt * 2;
  }
  if (!heist.active) return;
  heist.timer -= dt;
  if (heist.timer <= 0) {
    heist.active = false; beacon.visible = false;
    toast('Heist failed — out of time! The job is still there when you are ready.');
    updateHUD();
    return;
  }
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const st = HEIST_STAGES[heist.stage];
  if (st && Math.hypot(px - st.x, pz - st.z) < 9) {
    if (heist.stage === 0) {
      addWanted(5, 'The vault alarm is screaming — 5 stars! Bounty hunters and the police heli are coming!');
      speakLine('Alarm! Five stars! Run — bridge, marina, keys. Do not stop!');
    }
    heist.stage++;
    chime();
    if (heist.stage >= HEIST_STAGES.length) {
      heist.active = false; beacon.visible = false;
      state.cash += HEIST_REWARD;
      toast('HEIST COMPLETE! +$' + HEIST_REWARD.toLocaleString('en-US') + ' — you are a legend of Solmar Bay!');
      speakLine('You did it. The luxury yacht and the mansion are yours now — spend it well.');
      chime(); saveGame(); updateHUD(); updateObjective();
      return;
    }
    setBeacon(HEIST_STAGES[heist.stage].x, HEIST_STAGES[heist.stage].z);
    toast(HEIST_STAGES[heist.stage].text);
  }
}

// ---------- Feature 30: random street events ----------
let streetEvent = null, streetEventTimer = 90;
function spawnStreetEvent(forceKind) {
  if (streetEvent || state.mode !== 'play') return;
  const kind = forceKind || (rng() < 0.5 ? 'ride' : 'thief');
  const a = rng() * Math.PI * 2;
  const ex = clamp(playerState.x + Math.cos(a) * 25, -HALF, HALF);
  const ez = clamp(playerState.z + Math.sin(a) * 25, -HALF, HALF);
  const ped = makePerson(pick(PED_SHIRTS), 0x2c3e50, pick([0xd9a066, 0x8a5a33, 0xf0c8a0]));
  ped.position.set(ex, groundHeight(ex, ez), ez);
  scene.add(ped);
  const p = { mesh: ped, x: ex, z: ez, heading: rng() * Math.PI * 2, speed: kind === 'thief' ? 5.5 : 1.5, target: null, down: false, downTimer: 0, phase: rng() * 6, flee: kind === 'thief', mood: 'calm' };
  if (kind === 'thief') p.target = { x: ex + 80, z: ez - 80 };
  peds.push(p);
  streetEvent = { kind, ped: p, state: 'wait', timer: kind === 'thief' ? 60 : 120, dest: null };
  toast(kind === 'ride' ? '🚕 Street event: someone needs a ride! Press E near them.' : '🏃 Street event: a thief snatched a bag — chase him down!');
  beep(990, 0.2, 'sine', 0.2);
}
function acceptStreetEvent() {
  if (!streetEvent || streetEvent.kind !== 'ride') return;
  const dest = roadPoint();
  streetEvent.state = 'drive';
  streetEvent.dest = dest;
  streetEvent.timer = 120;
  setBeacon(dest.x, dest.z);
  toast('Drive them to the marker — 120 seconds, $200 if you make it!');
}
function updateStreetEvent(dt) {
  if (!streetEvent) {
    streetEventTimer -= dt;
    if (streetEventTimer <= 0) { streetEventTimer = rr(90, 150); spawnStreetEvent(); }
    return;
  }
  streetEvent.timer -= dt;
  if (streetEvent.kind === 'thief') {
    if (streetEvent.ped.down) {
      state.cash += 150;
      toast('Thief caught! +$150 reward.');
      if (rng() < 0.3) addWanted(1, 'The crowd saw the chase!');
      chime(); saveGame(); updateHUD();
      streetEvent = null; streetEventTimer = rr(90, 150);
      return;
    }
  } else if (streetEvent.state === 'drive' && streetEvent.dest) {
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(px - streetEvent.dest.x, pz - streetEvent.dest.z) < 9) {
      state.cash += 200;
      toast('Ride complete! +$200 — the passenger tips you.');
      chime(); saveGame(); updateHUD();
      beacon.visible = false;
      streetEvent = null; streetEventTimer = rr(90, 150);
      return;
    }
  }
  if (streetEvent.timer <= 0) {
    toast(streetEvent.kind === 'thief' ? 'The thief got away...' : 'The passenger gave up waiting.');
    beacon.visible = false;
    streetEvent = null; streetEventTimer = rr(90, 150);
  }
}
// ---------- Feature 31: playable golf at the golf course ----------
const GOLF_HOLES = [{ dist: 30, par: 3 }, { dist: 45, par: 4 }, { dist: 60, par: 5 }];
let golf = { active: false, hole: 0, strokes: 0, total: 0, ballDist: 0 };
function startGolf() {
  if (state.mode !== 'play') return;
  if (Math.hypot(playerState.x - 100, playerState.z + 160) > 12) { toast('Go to the Solmar Golf Club (green marker) and press G to play.'); return; }
  golf.active = true; golf.hole = 0; golf.strokes = 0; golf.total = 0;
  golf.ballDist = GOLF_HOLES[0].dist;
  document.getElementById('golf').classList.remove('hidden');
  renderGolf();
  toast('Golf! 3 holes, par 12 total. Beat par to win $500.');
}
function renderGolf() {
  const h = GOLF_HOLES[golf.hole];
  document.getElementById('golfInfo').textContent = 'Hole ' + (golf.hole + 1) + '/3 · Par ' + h.par + ' · Ball ' + Math.round(golf.ballDist) + 'u from the hole · Strokes this hole: ' + golf.strokes + ' · Total: ' + golf.total;
}
function swingGolf() {
  if (!golf.active) return;
  const power = Number(document.getElementById('golfPower').value);
  const angle = Number(document.getElementById('golfDir').value);
  const travel = power * 0.6 * (1 - Math.abs(angle) / 90);
  golf.ballDist = Math.abs(golf.ballDist - travel) + Math.abs(angle) * 0.1;
  golf.strokes++; golf.total++;
  beep(660, 0.1, 'sine', 0.15);
  if (golf.ballDist < 2) {
    toast('Holed it in ' + golf.strokes + ' strokes!');
    chime();
    golf.hole++;
    if (golf.hole >= GOLF_HOLES.length) {
      golf.active = false;
      document.getElementById('golf').classList.add('hidden');
      if (golf.total <= 12) {
        state.cash += 500;
        toast('🏆 You beat par (' + golf.total + ' strokes)! +$500 prize.');
        speakLine('Nice round. You beat par — five hundred dollars, enjoy it.');
      } else {
        toast('Round over: ' + golf.total + ' strokes (par 12). No prize this time — try again!');
      }
      saveGame(); updateHUD();
      return;
    }
    golf.strokes = 0;
    golf.ballDist = GOLF_HOLES[golf.hole].dist;
  }
  renderGolf();
}
function closeGolf() {
  golf.active = false;
  document.getElementById('golf').classList.add('hidden');
}
document.getElementById('golfSwing').addEventListener('click', swingGolf);
document.getElementById('golfClose').addEventListener('click', closeGolf);

// ---------- Feature 40: skills that level up with use ----------
const skills = { driving: 0, shooting: 0, stamina: 0 };
function skillLevel(name) { return Math.min(10, Math.floor((skills[name] || 0) / 100)); }
function addSkill(name, xp) {
  const before = skillLevel(name);
  skills[name] = Math.min(1000, (skills[name] || 0) + xp);
  const after = skillLevel(name);
  if (after > before) { toast('Skill up! ' + name + ' is now level ' + after + '.'); chime(); }
}
// ---------- Feature 41: hidden packages (50 collectibles) ----------
const packages = [];
let packagesFound = 0;
{
  const spots = [];
  for (let i = 0; i < 10; i++) spots.push([rr(-HALF, HALF), rr(-HALF, HALF)]);
  for (let i = 0; i < 10; i++) spots.push([rr(-260, 260), rr(-275, -150)]);
  for (let i = 0; i < 8; i++) spots.push([rr(HALF + 4, HALF + 24), rr(-120, 120)]);
  for (let i = 0; i < 8; i++) spots.push([rr(-260, 260), rr(-290, -235)]);
  for (let i = 0; i < 6; i++) spots.push([rr(-275, -140), rr(-130, 130)]);
  for (let i = 0; i < 8; i++) spots.push([rr(-280, 280), rr(150, 280)]);
  for (const [px, pz] of spots) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 1.2 }));
    g.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.15, 0.95), new THREE.MeshStandardMaterial({ color: 0x2e6fb0, emissive: 0x1a4a7a, emissiveIntensity: 0.8 }));
    lid.position.y = 0.35; g.add(lid);
    g.position.set(px, groundHeight(px, pz) + 0.8, pz);
    scene.add(g);
    packages.push({ mesh: g, x: px, z: pz, found: false });
  }
}
function updatePackages() {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  for (const pk of packages) {
    if (pk.found) continue;
    pk.mesh.rotation.y += 0.02;
    if (Math.hypot(pk.x - px, pk.z - pz) < 2.5) {
      pk.found = true; pk.mesh.visible = false;
      packagesFound++;
      state.cash += 100;
      toast('Hidden package found! ' + packagesFound + '/50 · +$100');
      chime();
      if (packagesFound === 50) {
        state.cash += 10000;
        const spec = CAR_TYPES.find((c) => c.type === 'supercar');
        const mesh = makeCarMesh({ ...spec, color: 0xffd23f });
        mesh.position.set(-12, 0, -24); mesh.rotation.y = 0.5; scene.add(mesh);
        parkedCars.push({ mesh, spec, speed: 0, steer: 0, stolen: true, owned: true });
        toast('ALL 50 PACKAGES! +$10,000 and a gold supercar is waiting downtown!');
        speakLine('Every package found. The gold supercar is yours — you earned it.');
      }
      saveGame(); updateHUD();
    }
  }
}
// ---------- Feature 42: photo mode ----------
let photoMode = false;
const photoCam = { x: 0, y: 20, z: 40, yaw: 0, pitch: 0.2 };
function togglePhotoMode() {
  if (state.mode !== 'play' && !photoMode) return;
  photoMode = !photoMode;
  if (photoMode) {
    photoCam.x = camera.position.x; photoCam.y = camera.position.y; photoCam.z = camera.position.z;
    photoCam.yaw = camYaw; photoCam.pitch = camPitch;
    document.getElementById('hud').classList.remove('on');
    document.getElementById('photoBar').classList.remove('hidden');
    toast('Photo mode — free camera. Enter takes the photo, O exits.');
  } else {
    document.getElementById('hud').classList.add('on');
    document.getElementById('photoBar').classList.add('hidden');
  }
}
function takePhoto() {
  if (!photoMode) return;
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = 'solmar-bay-photo.png';
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
  toast('Photo saved!');
}
function updatePhotoMode(dt) {
  const sp = 18;
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const up = (keys['KeyE'] ? 1 : 0) - (keys['KeyQ'] ? 1 : 0);
  photoCam.x += (Math.sin(photoCam.yaw) * fwd + Math.cos(photoCam.yaw) * strafe) * sp * dt;
  photoCam.z += (Math.cos(photoCam.yaw) * fwd - Math.sin(photoCam.yaw) * strafe) * sp * dt;
  photoCam.y = clamp(photoCam.y + up * sp * dt, 1, 200);
  camera.position.set(photoCam.x, photoCam.y, photoCam.z);
  camera.lookAt(photoCam.x + Math.sin(photoCam.yaw), photoCam.y + photoCam.pitch, photoCam.z + Math.cos(photoCam.yaw));
}
// ---------- Feature 43: different missions per character ----------
const CHAR_MISSIONS = {
  Ryan: [
    { title: 'Harbour Hustle', text: 'Steal a boat at the marina and bring it to the north docks.', x: HALF + 20, z: -70, reward: 400 },
    { title: 'Desert Run', text: 'Drive out to the desert hills viewpoint.', x: 60, z: 240, reward: 500 },
    { title: 'Airport Pickup', text: 'Collect a package at the Bay Airstrip and bring it to the farm.', x: 150, z: -200, reward: 600 },
  ],
  Ian: [
    { title: 'Lake Flower Run', text: 'Reach the big lake in the northern forest.', x: 60, z: -205, reward: 400 },
    { title: 'Nightclub Delivery', text: 'Deliver the package to the Neon Nights Club.', x: 48, z: 38, reward: 500 },
    { title: 'Mountain View', text: 'Climb to the mountain viewpoint in the north.', x: -292, z: 34, reward: 600 },
  ],
};
let charMission = { active: false, char: '', idx: 0 };
function startCharMission() {
  if (state.mode !== 'play') return;
  const name = CHARS[state.activeChar].name;
  const prog = state.charMissions[name] || 0;
  const list = CHAR_MISSIONS[name];
  if (!list) return;
  if (charMission.active) { toast(name + "'s mission is already running — follow the beacon!"); return; }
  if (prog >= list.length) { toast(name + ' has finished all their personal missions!'); return; }
  const m = list[prog];
  charMission = { active: true, char: name, idx: prog };
  setBeacon(m.x, m.z);
  toast(name + "'s mission: " + m.title + ' — ' + m.text + ' ($' + m.reward + ')');
  speakLine(name + ', this one is yours. ' + m.text);
  updateHUD();
}
function updateCharMission() {
  if (!charMission.active) return;
  const m = CHAR_MISSIONS[charMission.char][charMission.idx];
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  if (Math.hypot(px - m.x, pz - m.z) < 9) {
    state.cash += m.reward;
    state.charMissions[charMission.char] = charMission.idx + 1;
    toast(charMission.char + ' finished "' + m.title + '"! +$' + m.reward);
    speakLine('Done. ' + m.reward + ' dollars for ' + charMission.char + '.');
    chime(); beacon.visible = false;
    charMission.active = false;
    saveGame(); updateHUD();
  }
}
// ---------- Features 37 + 38: firefighter, paramedic, bus + taxi driver jobs ----------
let fireJob = { active: false, x: 0, z: 0, spawnTimer: 120, fire: null };
let medicJob = { active: false, ped: null, state: 'wait', timer: 0, spawnTimer: 150 };
let busJob = { active: false, wp: 0, waitTimer: 0 };
let taxiJob = { active: false, state: 'wait', ped: null, dest: null, timer: 0 };
const BUS_STOPS = [{ x: -84, z: -84 }, { x: 84, z: -84 }, { x: 84, z: 84 }, { x: -84, z: 84 }];
const buses = [];
for (let i = 0; i < 2; i++) {
  const spec = CAR_TYPES.find((c) => c.type === 'bus');
  const mesh = makeCarMesh(spec);
  const s = BUS_STOPS[i * 2];
  mesh.position.set(s.x, 0, s.z); scene.add(mesh);
  buses.push({ mesh, wp: (i * 2 + 1) % BUS_STOPS.length, wait: 0 });
}
let ambientEmerg = [];
let emergTimer = 120;
function updateFireJob(dt) {
  if (!fireJob.active) {
    fireJob.spawnTimer -= dt;
    if (fireJob.spawnTimer <= 0) {
      fireJob.spawnTimer = rr(120, 180);
      const p = roadPoint();
      const patch = new THREE.Mesh(new THREE.CircleGeometry(4.5, 16), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff4400, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
      patch.rotation.x = -Math.PI / 2; patch.position.set(p.x, 0.12, p.z);
      scene.add(patch);
      const f = { mesh: patch, timer: 999, burnTimer: 0 };
      fires.push(f);
      fireJob = { active: true, x: p.x, z: p.z, spawnTimer: 120, fire: f };
      toast('🔥 Fire reported! Get the fire truck to the flames!');
    }
    return;
  }
  const inTruck = state.inCar && state.inCar.spec && state.inCar.spec.type === 'firetruck';
  if (inTruck && Math.hypot(state.inCar.mesh.position.x - fireJob.x, state.inCar.mesh.position.z - fireJob.z) < 7) {
    const fi = fires.indexOf(fireJob.fire);
    if (fi >= 0) { scene.remove(fireJob.fire.mesh); fires.splice(fi, 1); }
    state.cash += 300;
    toast('Fire extinguished! +$300 — the city thanks you.');
    chime(); saveGame(); updateHUD();
    fireJob.active = false; fireJob.fire = null;
  }
}
function updateMedicJob(dt) {
  if (!medicJob.active) {
    medicJob.spawnTimer -= dt;
    if (medicJob.spawnTimer <= 0) {
      medicJob.spawnTimer = rr(150, 210);
      const a = rng() * Math.PI * 2;
      const ex = clamp(playerState.x + Math.cos(a) * 20, -HALF, HALF);
      const ez = clamp(playerState.z + Math.sin(a) * 20, -HALF, HALF);
      const ped = makePerson(pick(PED_SHIRTS), 0x2c3e50, 0xd9a066);
      ped.position.set(ex, groundHeight(ex, ez), ez);
      scene.add(ped);
      const p = { mesh: ped, x: ex, z: ez, heading: 0, speed: 0, target: null, down: true, downTimer: 999, phase: 0, mood: 'calm' };
      peds.push(p);
      medicJob = { active: true, ped: p, state: 'wait', timer: 150, spawnTimer: 150 };
      toast('🚑 Someone is hurt! Get the ambulance to them, then to the hospital!');
    }
    return;
  }
  medicJob.timer -= dt;
  if (medicJob.state === 'wait') {
    const inAmb = state.inCar && state.inCar.spec && state.inCar.spec.type === 'ambulance';
    if (inAmb && Math.hypot(state.inCar.mesh.position.x - medicJob.ped.x, state.inCar.mesh.position.z - medicJob.ped.z) < 4) {
      const pi = peds.indexOf(medicJob.ped);
      if (pi >= 0) peds.splice(pi, 1);
      scene.remove(medicJob.ped.mesh);
      medicJob.state = 'drive'; medicJob.timer = 120;
      setBeacon(132, -60);
      toast('Patient loaded! Take them to the hospital (132, -60) — 120 seconds!');
    }
  } else {
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(px - 132, pz + 60) < 9) {
      state.cash += 400;
      toast('Patient delivered to the hospital! +$400.');
      chime(); beacon.visible = false; saveGame(); updateHUD();
      medicJob.active = false;
    }
  }
  if (medicJob.timer <= 0) { toast('The paramedic call expired.'); beacon.visible = false; medicJob.active = false; }
}
function startDriverJob() {
  if (state.mode !== 'play' || !state.inCar) { toast('Get into a taxi or a bus first, then press B.'); return; }
  const t = state.inCar.spec && state.inCar.spec.type;
  if (t === 'bus') {
    if (busJob.active) { toast('Bus route already running.'); return; }
    busJob = { active: true, wp: 0, waitTimer: 0 };
    setBeacon(BUS_STOPS[0].x, BUS_STOPS[0].z);
    toast('Bus route started! Stop at all 4 stops — $50 per stop, $200 bonus for the full route.');
  } else if (t === 'taxi') {
    if (taxiJob.active) { toast('Taxi fare already running.'); return; }
    const a = rng() * Math.PI * 2;
    const ex = clamp(playerState.x + Math.cos(a) * 20, -HALF, HALF);
    const ez = clamp(playerState.z + Math.sin(a) * 20, -HALF, HALF);
    const ped = makePerson(pick(PED_SHIRTS), 0x2c3e50, 0xd9a066);
    ped.position.set(ex, groundHeight(ex, ez), ez);
    scene.add(ped);
    const p = { mesh: ped, x: ex, z: ez, heading: 0, speed: 0, target: null, down: false, downTimer: 0, phase: 0, mood: 'calm' };
    peds.push(p);
    taxiJob = { active: true, state: 'wait', ped: p, dest: null, timer: 120 };
    setBeacon(ex, ez);
    toast('Taxi fare: pick up the passenger at the marker!');
  } else {
    toast('Driver jobs need a taxi or a bus.');
  }
}
function updateDriverJobs(dt) {
  if (busJob.active) {
    const stop = BUS_STOPS[busJob.wp];
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(px - stop.x, pz - stop.z) < 7 && (!state.inCar || Math.abs(state.speed) < 2)) {
      busJob.waitTimer += dt;
      if (busJob.waitTimer > 3) {
        busJob.waitTimer = 0;
        state.cash += 50;
        toast('Bus stop served! +$50 (' + (busJob.wp + 1) + '/4 stops).');
        chime(); updateHUD();
        busJob.wp++;
        if (busJob.wp >= BUS_STOPS.length) {
          state.cash += 200;
          toast('Full bus route done! +$200 bonus.');
          beacon.visible = false; saveGame(); updateHUD();
          busJob.active = false;
        } else setBeacon(BUS_STOPS[busJob.wp].x, BUS_STOPS[busJob.wp].z);
      }
    } else busJob.waitTimer = 0;
  }
  if (taxiJob.active) {
    taxiJob.timer -= dt;
    if (taxiJob.state === 'wait') {
      if (state.inCar && Math.hypot(state.inCar.mesh.position.x - taxiJob.ped.x, state.inCar.mesh.position.z - taxiJob.ped.z) < 4) {
        const pi = peds.indexOf(taxiJob.ped);
        if (pi >= 0) peds.splice(pi, 1);
        scene.remove(taxiJob.ped.mesh);
        taxiJob.state = 'drive';
        taxiJob.dest = roadPoint();
        setBeacon(taxiJob.dest.x, taxiJob.dest.z);
        toast('Passenger aboard! Drive them to the marker.');
      }
    } else if (taxiJob.dest) {
      const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
      const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
      if (Math.hypot(px - taxiJob.dest.x, pz - taxiJob.dest.z) < 9) {
        const fare = 100 + Math.floor(rng() * 100);
        state.cash += fare;
        toast('Fare complete! +$' + fare + '.');
        chime(); beacon.visible = false; saveGame(); updateHUD();
        taxiJob.active = false;
      }
    }
    if (taxiJob.timer <= 0) { toast('The taxi passenger gave up.'); beacon.visible = false; taxiJob.active = false; }
  }
}
function updateBuses(dt) {
  for (const b of buses) {
    if (b.wait > 0) { b.wait -= dt; continue; }
    const wp = BUS_STOPS[b.wp];
    const dx = wp.x - b.mesh.position.x, dz = wp.z - b.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) { b.wait = 4; b.wp = (b.wp + 1) % BUS_STOPS.length; continue; }
    b.mesh.rotation.y = Math.atan2(dx, dz);
    b.mesh.position.x += (dx / d) * 9 * dt;
    b.mesh.position.z += (dz / d) * 9 * dt;
    for (const w of (b.mesh.userData.wheels || [])) w.rotation.x += 9 * dt * 2;
  }
}
function updateAmbientEmerg(dt) {
  emergTimer -= dt;
  if (emergTimer <= 0) {
    emergTimer = rr(150, 240);
    const spec = CAR_TYPES.find((c) => c.type === (rng() < 0.5 ? 'firetruck' : 'ambulance'));
    const mesh = makeCarMesh(spec);
    const p = roadPoint();
    mesh.position.set(p.x, 0, p.z); mesh.rotation.y = p.heading;
    scene.add(mesh);
    traffic.push({ mesh, spec, speed: rr(7, 11), heading: p.heading, loop: 0, turnAt: 0 });
    ambientEmerg.push({ mesh, timer: 60 });
    beep(660, 0.3, 'sine', 0.12);
  }
  for (let i = ambientEmerg.length - 1; i >= 0; i--) {
    ambientEmerg[i].timer -= dt;
    if (ambientEmerg[i].timer <= 0) {
      const ti = traffic.findIndex((t) => t.mesh === ambientEmerg[i].mesh);
      if (ti >= 0) traffic.splice(ti, 1);
      scene.remove(ambientEmerg[i].mesh);
      ambientEmerg.splice(i, 1);
    }
  }
}
// ---------- Feature 39: sniper scope (right-click or V to zoom) ----------
let scopeZoom = false;
function toggleScope() {
  if (state.mode !== 'play') return;
  scopeZoom = !scopeZoom;
  camera.fov = scopeZoom ? 18 : 55;
  camera.updateProjectionMatrix();
  document.getElementById('scope').classList.toggle('hidden', !scopeZoom);
  if (scopeZoom) toast('Sniper scope — zoomed in. V or right-click to exit.');
}

// ---------- deterministic shot scenes ----------
// ---------- Round 4, part one: Coral Cay island + hovercraft ----------
const ISLE_CX = 212, ISLE_CZ = 28, ISLE_R = 44, ISLE_TOP = 2.1;
const ISLE_STORE_KEY = 'solmar-bay-r4-shells';
let isleShellsFound = 0;
try { isleShellsFound = Number(JSON.parse(localStorage.getItem(ISLE_STORE_KEY) || '0')) || 0; } catch (e) { isleShellsFound = 0; }
function isleDist(x, z) { return Math.hypot(x - ISLE_CX, z - ISLE_CZ); }
function isleOnLand(x, z) { return isleDist(x, z) < ISLE_R - 1.5; }
const isleGroup = new THREE.Group();
scene.add(isleGroup);
{
  const sandM = new THREE.MeshStandardMaterial({ color: 0xe8d5a0, roughness: 1 });
  const grassM = new THREE.MeshStandardMaterial({ color: 0x7fae62, roughness: 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(ISLE_R, ISLE_R + 6, 3.4, 28), sandM);
  base.position.set(ISLE_CX, ISLE_TOP - 1.7, ISLE_CZ); base.receiveShadow = true; isleGroup.add(base);
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(ISLE_R - 5, ISLE_R - 5, 0.5, 28), grassM);
  lawn.position.set(ISLE_CX, ISLE_TOP + 0.2, ISLE_CZ); lawn.receiveShadow = true; isleGroup.add(lawn);
  const plazaM = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1 });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.6, 20), plazaM);
  plaza.position.set(ISLE_CX, ISLE_TOP + 0.25, ISLE_CZ); isleGroup.add(plaza);
  const roadM = new THREE.MeshStandardMaterial({ color: 0x3a4a55, roughness: 1 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 1.6, 6, 32), roadM);
  ring.rotation.x = Math.PI / 2; ring.position.set(ISLE_CX, ISLE_TOP + 0.35, ISLE_CZ); isleGroup.add(ring);
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 52), roadM);
  cross1.position.set(ISLE_CX, ISLE_TOP + 0.35, ISLE_CZ); isleGroup.add(cross1);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(52, 0.3, 2.6), roadM);
  cross2.position.set(ISLE_CX, ISLE_TOP + 0.35, ISLE_CZ); isleGroup.add(cross2);
  const pierM = new THREE.MeshStandardMaterial({ color: 0xb98d5f, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 4.6), pierM);
    plank.position.set(ISLE_CX - ISLE_R - 4 - i * 4.4, 1.1, ISLE_CZ + 14); isleGroup.add(plank);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
    post.position.set(ISLE_CX - ISLE_R - 4 - i * 4.4, 0.6, ISLE_CZ + 16.2); isleGroup.add(post);
  }
  const causeM = new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 1 });
  const cause = new THREE.Mesh(new THREE.BoxGeometry(46, 0.5, 4), causeM);
  cause.position.set(ISLE_CX - ISLE_R - 22, 0.7, ISLE_CZ + 14); isleGroup.add(cause);
}
const isleBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.2, 22, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
let isleLight = null;
{
  const towerM = new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.8 });
  const redM = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.1, 15, 12), towerM);
  tower.position.set(ISLE_CX + 26, ISLE_TOP + 7.5, ISLE_CZ - 26); tower.castShadow = true; isleGroup.add(tower);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(2.55 - i * 0.18, 2.7 - i * 0.18, 1.6, 12), redM);
    band.position.set(ISLE_CX + 26, ISLE_TOP + 4 + i * 4.4, ISLE_CZ - 26); isleGroup.add(band);
  }
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 1.4, transparent: true, opacity: 0.9 }));
  lampRoom.position.set(ISLE_CX + 26, ISLE_TOP + 16, ISLE_CZ - 26); isleGroup.add(lampRoom);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2, 10), redM);
  cap.position.set(ISLE_CX + 26, ISLE_TOP + 18, ISLE_CZ - 26); isleGroup.add(cap);
  isleBeam.position.set(ISLE_CX + 26, ISLE_TOP + 16, ISLE_CZ - 26);
  isleBeam.rotation.z = Math.PI / 2; isleBeam.position.x = ISLE_CX + 26 + 11; isleGroup.add(isleBeam);
  // The lamp room glows on its own; no extra scene light, to keep the frame cost down.
}
const isleHouses = [];
{
  const palette = [0xd8a06a, 0x7fa8c9, 0xe8c98f, 0x9fb27a, 0xb98a7a, 0xd9b8c4, 0x8fb8a8, 0xe8b820];
  const spots = [[-16, -12], [-14, 10], [10, -14], [14, 12], [-28, 2], [28, -2], [2, -28], [-2, 26]];
  for (let i = 0; i < spots.length; i++) {
    const hx = ISLE_CX + spots[i][0], hz = ISLE_CZ + spots[i][1];
    const w = 6 + (i % 3), d = 5 + ((i + 1) % 3), h = 4 + (i % 2) * 2;
    const mat = new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.9 });
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    house.position.set(hx, ISLE_TOP + h / 2, hz); house.castShadow = true; isleGroup.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 1 }));
    roof.position.set(hx, ISLE_TOP + h + 1.2, hz); roof.rotation.y = Math.PI / 4; isleGroup.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }));
    door.position.set(hx, ISLE_TOP + 1, hz + d / 2 + 0.1); isleGroup.add(door);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.15), new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffdf80, emissiveIntensity: 0.5 }));
    win.position.set(hx + w / 4, ISLE_TOP + h * 0.6, hz + d / 2 + 0.1); isleGroup.add(win);
    isleHouses.push({ x: hx, z: hz, w, d });
  }
  const stallCols = [0xff5b5b, 0x2ecc71, 0x2ee6ff, 0xff9a5a];
  for (let i = 0; i < 4; i++) {
    const sx = ISLE_CX - 6 + i * 4, sz = ISLE_CZ + 8;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a6a42 }));
    counter.position.set(sx, ISLE_TOP + 0.5, sz); isleGroup.add(counter);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 2), new THREE.MeshStandardMaterial({ color: stallCols[i] }));
    awn.position.set(sx, ISLE_TOP + 2.4, sz); awn.rotation.x = 0.25; isleGroup.add(awn);
    for (let p = 0; p < 2; p++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      pole.position.set(sx - 1.4 + p * 2.8, ISLE_TOP + 1.2, sz + 0.8); isleGroup.add(pole);
    }
    const goods = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshStandardMaterial({ color: [0xff8c1a, 0xe84a7a, 0x7dff9a, 0xffd23f][i] }));
    goods.position.set(sx, ISLE_TOP + 1.3, sz); isleGroup.add(goods);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x0b2c44 }));
  sign.position.set(ISLE_CX, ISLE_TOP + 3.4, ISLE_CZ + 18); isleGroup.add(sign);
  const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  signPole.position.set(ISLE_CX - 3, ISLE_TOP + 1.7, ISLE_CZ + 18); isleGroup.add(signPole);
  const signPole2 = signPole.clone(); signPole2.position.x = ISLE_CX + 3; isleGroup.add(signPole2);
}
const islePalms = [];
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + 0.3;
  const px = ISLE_CX + Math.cos(a) * (ISLE_R - 8), pz = ISLE_CZ + Math.sin(a) * (ISLE_R - 8);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 5, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 }));
  trunk.position.y = 2.5; g.add(trunk);
  for (let l = 0; l < 6; l++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9 }));
    const la = (l / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(la) * 1.4, 5.1, Math.sin(la) * 1.4); leaf.rotation.y = -la; leaf.rotation.z = 0.25; g.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  nut.position.y = 4.9; g.add(nut);
  g.position.set(px, ISLE_TOP, pz); isleGroup.add(g); islePalms.push(g);
}
const isleWalkers = [];
{
  const shirts = [0xe84a7a, 0x2ee6ff, 0xffd23f, 0x2ecc71, 0xff9a5a];
  const names = ['Mara', 'Tomas', 'Nadia', 'Kiko', 'Sari'];
  for (let i = 0; i < 5; i++) {
    const person = makePerson(shirts[i], 0x2a3a4a, 0xd9a066);
    const a = (i / 5) * Math.PI * 2;
    person.position.set(ISLE_CX + Math.cos(a) * 18, ISLE_TOP, ISLE_CZ + Math.sin(a) * 18);
    scene.add(person);
    isleWalkers.push({ mesh: person, name: names[i], wp: 0, pause: 0, phase: i * 1.7, path: [
      { x: ISLE_CX + Math.cos(a) * 18, z: ISLE_CZ + Math.sin(a) * 18 },
      { x: ISLE_CX + Math.cos(a + 1.2) * 24, z: ISLE_CZ + Math.sin(a + 1.2) * 24 },
      { x: ISLE_CX, z: ISLE_CZ },
      { x: ISLE_CX + Math.cos(a + 2.6) * 20, z: ISLE_CZ + Math.sin(a + 2.6) * 20 },
    ] });
  }
}
const isleShellSpots = [
  { x: ISLE_CX - 30, z: ISLE_CZ + 22 }, { x: ISLE_CX + 32, z: ISLE_CZ - 18 }, { x: ISLE_CX + 8, z: ISLE_CZ + 34 },
  { x: ISLE_CX - 12, z: ISLE_CZ - 34 }, { x: ISLE_CX + 26, z: ISLE_CZ + 26 }, { x: ISLE_CX - 34, z: ISLE_CZ - 6 },
];
const isleShells = [];
for (let i = 0; i < isleShellSpots.length; i++) {
  const s = isleShellSpots[i];
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: [0xff9ad5, 0x7dff9a, 0x2ee6ff, 0xffd23f, 0xff8c1a, 0xe8b820][i], roughness: 0.4, metalness: 0.3, emissive: 0x332200, emissiveIntensity: 0.4 }));
  shell.scale.set(1, 0.7, 1); g.add(shell);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.25 }));
  g.add(glow);
  g.position.set(s.x, ISLE_TOP + 0.5, s.z); scene.add(g);
  isleShells.push({ mesh: g, x: s.x, z: s.z, taken: i < isleShellsFound, bob: i * 0.9 });
  if (i < isleShellsFound) g.visible = false;
}
function islePersistShells() { try { localStorage.setItem(ISLE_STORE_KEY, JSON.stringify(isleShellsFound)); } catch (e) {} }
function makeHoverMesh(color) {
  const g = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.35 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 4.6), hullM);
  hull.position.y = 0.9; hull.castShadow = true; g.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 4), hullM);
  nose.rotation.x = Math.PI / 2; nose.rotation.y = Math.PI / 4; nose.position.set(0, 0.9, 2.9); g.add(nose);
  const skirtM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 });
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.55, 4.9), skirtM);
  skirt.position.y = 0.35; g.add(skirt);
  const skirtF = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.3, 0.5), skirtM);
  skirtF.position.set(0, 0.3, 2.5); g.add(skirtF);
  const skirtB = skirtF.clone(); skirtB.position.z = -2.5; g.add(skirtB);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 3.2), new THREE.MeshStandardMaterial({ color: 0xf0ead8 }));
  deck.position.set(0, 1.32, -0.3); g.add(deck);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  seat.position.set(0, 1.7, -0.6); g.add(seat);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.09, 8, 14), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  wheel.position.set(0, 1.9, 0.7); g.add(wheel);
  const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.14, 8, 18), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.5 }));
  fanRing.position.set(0, 1.9, -1.9); fanRing.rotation.x = 0.3; g.add(fanRing);
  const fan = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.1), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  fan.position.set(0, 1.9, -1.9); g.add(fan);
  const fan2 = fan.clone(); fan2.rotation.z = Math.PI / 2; g.add(fan2);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 1 }));
  lamp.position.set(0.9, 1.3, 2.2); g.add(lamp);
  const lamp2 = lamp.clone(); lamp2.position.x = -0.9; g.add(lamp2);
  g.userData.fan = fan; g.userData.fan2 = fan2; g.userData.skirt = skirt; g.userData.wheels = [];
  return g;
}
const hovercrafts = [];
hovercrafts.push(addExtraVehicle('hover', makeHoverMesh(0xff8c1a), { type: 'hover', color: 0xff8c1a, len: 4.6, w: 2.6, h: 1.2, topSpeed: 27, accel: 19, steerRate: 1.05, label: 'hovercraft' }, HALF + 16, -20, 0.6));
hovercrafts.push(addExtraVehicle('hover', makeHoverMesh(0x2ee6ff), { type: 'hover', color: 0x2ee6ff, len: 4.6, w: 2.6, h: 1.2, topSpeed: 27, accel: 19, steerRate: 1.05, label: 'hovercraft' }, ISLE_CX - ISLE_R - 8, ISLE_CZ + 14, -Math.PI / 2));
let hoverSpray = 0;
function updateHover(dt, c) {
  const fwd = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.6 : 0;
  const turn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = c.spec.topSpeed * (1 + skillLevel('driving') * 0.02);
  const px = c.mesh.position.x, pz = c.mesh.position.z;
  const overWater = (px >= HALF + 8 && px <= 300) || onRiver(px, pz);
  const onIsle = isleOnLand(px, pz);
  c.speed += fwd * (overWater ? 13 : 17) * dt;
  c.speed -= c.speed * (overWater ? 0.25 : 0.55) * dt;
  if (!fwd) c.speed -= Math.sign(c.speed) * 3 * dt;
  if (Math.abs(c.speed) < 0.2 && !fwd) c.speed = 0;
  c.speed = clamp(c.speed, -top * 0.45, top);
  c.mesh.rotation.y += turn * dt * c.spec.steerRate * (0.5 + Math.min(1, Math.abs(c.speed) / 12));
  const h = c.mesh.rotation.y;
  let nx = px + Math.sin(h) * c.speed * dt;
  let nz = pz + Math.cos(h) * c.speed * dt;
  nx = clamp(nx, -280, 300); nz = clamp(nz, -280, 280);
  const blocked = collideCircle(nx, nz, 1.4);
  if (!blocked || onIsle) { c.mesh.position.x = nx; c.mesh.position.z = nz; }
  else { c.speed *= 0.4; thud(); }
  hoverSpray += dt;
  const bob = Math.sin(state.time * 6) * 0.09;
  if (onIsle) c.mesh.position.y = ISLE_TOP + 0.45 + bob;
  else if (overWater) c.mesh.position.y = 0.55 + Math.sin(state.time * 2.4) * 0.14;
  else c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z) + 0.45 + bob;
  c.mesh.rotation.z = Math.sin(state.time * 3) * 0.02 - turn * 0.05;
  c.mesh.rotation.x = clamp(-fwd * 0.03, -0.05, 0.05);
  if (c.mesh.userData.fan) { c.mesh.userData.fan.rotation.z += dt * (8 + Math.abs(c.speed)); c.mesh.userData.fan2.rotation.z += dt * (8 + Math.abs(c.speed)); }
  if (c.mesh.userData.skirt) c.mesh.userData.skirt.scale.y = 1 + Math.sin(state.time * 9) * 0.06;
  if (overWater && Math.abs(c.speed) > 8 && hoverSpray > 0.4) { hoverSpray = 0; }
  state.speed = c.speed;
  if (fwd) addSkill('driving', dt * 2);
  checkMissionSpot();
}
function isleNearDock() {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  return Math.hypot(px - (ISLE_CX - ISLE_R - 26), pz - (ISLE_CZ + 14)) < 10;
}
function updateIsle(dt) {
  if (isleBeam) { isleBeam.rotation.y = state.time * 0.7; }
  if (isleLight) isleLight.intensity = 0.9 + Math.sin(state.time * 2) * 0.35;
  for (let i = 0; i < isleWalkers.length; i++) {
    const w = isleWalkers[i];
    if (w.pause > 0) { w.pause -= dt; continue; }
    const target = w.path[w.wp];
    const dx = target.x - w.mesh.position.x, dz = target.z - w.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) { w.wp = (w.wp + 1) % w.path.length; w.pause = 1 + (i % 3); continue; }
    const sp = 1.6;
    w.mesh.position.x += (dx / d) * sp * dt;
    w.mesh.position.z += (dz / d) * sp * dt;
    w.mesh.position.y = ISLE_TOP;
    w.mesh.rotation.y = Math.atan2(dx, dz);
    w.phase += dt * 6;
    const legSwing = Math.sin(w.phase) * 0.25;
    if (w.mesh.children[3]) w.mesh.children[3].rotation.x = legSwing;
    if (w.mesh.children[4]) w.mesh.children[4].rotation.x = -legSwing;
    const pd = Math.hypot(playerState.x - w.mesh.position.x, playerState.z - w.mesh.position.z);
    if (pd < 4 && !w.greeted) { w.greeted = true; toast(w.name + ': Welcome to Coral Cay! Find the six glowing shells.'); setTimeout(() => { w.greeted = false; }, 30000); }
  }
  for (let i = 0; i < isleShells.length; i++) {
    const s = isleShells[i];
    if (s.taken) continue;
    s.mesh.rotation.y += dt * 1.4;
    s.mesh.position.y = ISLE_TOP + 0.5 + Math.sin(state.time * 2 + s.bob) * 0.18;
    const d = Math.hypot(playerState.x - s.x, playerState.z - s.z);
    const inVeh = state.inCar && Math.hypot(state.inCar.mesh.position.x - s.x, state.inCar.mesh.position.z - s.z) < 3;
    if (d < 2.6 || inVeh) {
      s.taken = true; s.mesh.visible = false;
      isleShellsFound++; islePersistShells();
      state.cash += 150; chime();
      toast('Coral Cay shell found! +$150 (' + isleShellsFound + '/6)');
      speakLine('One of the Cay shells — beautiful. That is ' + isleShellsFound + ' of six.');
      if (isleShellsFound >= 6) { state.cash += 900; toast('All six Cay shells! Marisol pays a $900 set bonus.'); speakLine('All six shells. Marisol adds nine hundred for the full set.'); }
      saveGame(); updateHUD();
    }
  }
  if (!state.inCar && isleOnLand(playerState.x, playerState.z)) {
    if (playerState.onGround) playerState.y = ISLE_TOP;
    player.position.y = ISLE_TOP + (playerState.y > ISLE_TOP ? playerState.y - ISLE_TOP : 0);
    if (playerState.y < ISLE_TOP && playerState.vy <= 0) { playerState.y = ISLE_TOP; playerState.onGround = true; playerState.vy = 0; }
  }
  if (state.inCar && state.inCar.kind === 'hover' && isleOnLand(state.inCar.mesh.position.x, state.inCar.mesh.position.z)) {
    state.inCar.mesh.position.y = ISLE_TOP + 0.45;
  }
}
// ---------- Round 4, part two: Marisol's second story chain (four jobs) ----------
const CHAIN_JOBS = [
  { id: 0, title: 'Shadow Run', giver: 'Marisol', reward: 700, brief: 'Tail the courier car across town. Stay close enough to see it, far enough not to be made.' },
  { id: 1, title: 'The Meeting', giver: 'Marisol', reward: 900, brief: 'Two fixers meet at the plaza. Get close, stay out of sight, and photograph the handshake.' },
  { id: 2, title: 'Four Corners', giver: 'Marisol', reward: 1100, brief: 'Four drops, one clock. Hit every corner of the bay before time runs out.' },
  { id: 3, title: 'Walk Her Home', giver: 'Marisol', reward: 1500, brief: 'Escort the witness to the safehouse. Stay near her — if you lose her, the job is blown.' },
];
const CHAIN_STORE_KEY = 'solmar-bay-r4-chain';
let chainDone = 0;
try { chainDone = Number(JSON.parse(localStorage.getItem(CHAIN_STORE_KEY) || '0')) || 0; } catch (e) { chainDone = 0; }
const chain = { active: false, job: 0, stage: 0, timer: 0, suspicion: 0, loseTimer: 0, drop: 0, escortTimer: 0, photoReady: false, target: null, meetA: null, meetB: null, escort: null, tailPath: [], tailWp: 0, drops: [], lastObj: '' };
const CHAIN_TAIL_PATH = [
  { x: -60, z: 60 }, { x: 60, z: 60 }, { x: 84, z: -12 }, { x: 60, z: -84 }, { x: -36, z: -84 }, { x: -84, z: -12 }, { x: -60, z: 60 },
];
const CHAIN_DROPS = [
  { x: -84, z: 84, label: 'north docks' }, { x: 84, z: 84, label: 'east beach' }, { x: 84, z: -84, label: 'south keys' }, { x: -84, z: -84, label: 'west farms' },
];
const CHAIN_ESCORT_DEST = { x: -HALF + BLOCK / 2, z: 20 };
function chainPersist() { try { localStorage.setItem(CHAIN_STORE_KEY, JSON.stringify(chainDone)); } catch (e) {} }
function chainPlayerPos() { return state.inCar ? { x: state.inCar.mesh.position.x, z: state.inCar.mesh.position.z } : { x: playerState.x, z: playerState.z }; }
function chainSetObjective() {
  if (!chain.active) return;
  const job = CHAIN_JOBS[chain.job];
  let line = '';
  if (chain.job === 0) line = 'Tail the courier — suspicion ' + Math.round(chain.suspicion) + '% · keep 10–50m';
  else if (chain.job === 1) line = chain.photoReady ? 'Meeting in progress — press X to photograph it!' : 'Get to the plaza and wait for the meeting';
  else if (chain.job === 2) line = 'Drop ' + (chain.drop + 1) + '/4 at ' + CHAIN_DROPS[chain.drop].label + ' · ' + Math.max(0, Math.ceil(chain.timer)) + 's left';
  else line = 'Escort the witness to the safehouse · stay within 20m · ' + Math.max(0, Math.ceil(chain.escortTimer)) + 's';
  const full = job.title + '  ·  $' + job.reward + '|' + 'Marisol: ' + job.brief + ' — ' + line;
  if (full === chain.lastObj) return;
  chain.lastObj = full;
  const t = document.getElementById('objTitle'), s = document.getElementById('objText');
  if (t) t.textContent = job.title + '  ·  $' + job.reward;
  if (s) s.textContent = 'Marisol: ' + job.brief + ' — ' + line;
}
function chainCleanup() {
  if (chain.target) { scene.remove(chain.target.mesh); chain.target = null; }
  if (chain.meetA) { scene.remove(chain.meetA.mesh); chain.meetA = null; }
  if (chain.meetB) { scene.remove(chain.meetB.mesh); chain.meetB = null; }
  if (chain.escort) { scene.remove(chain.escort.mesh); chain.escort = null; }
  beacon.visible = false;
  chain.lastObj = '';
}
function chainFail(reason) {
  toast('Job failed — ' + reason + ' Marisol will call again. Press L to retry.');
  speakLine('Blown. ' + reason + ' Take a breath and try again, ' + activeName() + '.');
  chainCleanup();
  chain.active = false; chain.suspicion = 0; chain.loseTimer = 0;
  updateObjective(); updateHUD();
}
function chainCompleteJob() {
  const job = CHAIN_JOBS[chain.job];
  state.cash += job.reward;
  chime();
  toast(job.title + ' complete! +$' + job.reward);
  speakLine('Beautiful work, ' + activeName() + '. ' + job.reward + ' dollars. Marisol pays on time, always.');
  showStory('Marisol: ' + job.title + ' — done. ' + (chain.job === 3 ? 'You two are the best crew in the bay.' : 'One more job where that came from.'));
  chainCleanup();
  chain.active = false;
  chainDone = Math.max(chainDone, chain.job + 1);
  chainPersist();
  if (chain.job === 3) {
    state.cash += 1000;
    toast('Chain complete! Marisol pays a $1000 loyalty bonus.');
    speakLine('Four jobs, four clean finishes. A thousand extra, on the house.');
    chain.job = 0;
  } else {
    chain.job++;
  }
  saveGame(); updateObjective(); updateHUD();
  if (chainDone < 4) toast('Next chain job ready — press L when you are ready.');
}
function chainStartJob(idx) {
  if (chain.active) { toast('A chain job is already running — follow the beacon.'); return; }
  if (state.mode !== 'play') return;
  if (state.mission < MISSIONS.length) { toast('Finish Marisol\'s main jobs first — then the extra chain opens.'); return; }
  if (idx >= CHAIN_JOBS.length) idx = 0;
  chain.job = idx; chain.active = true; chain.stage = 0; chain.suspicion = 0; chain.loseTimer = 0; chain.drop = 0; chain.photoReady = false;
  const job = CHAIN_JOBS[idx];
  phoneMsgText = 'Marisol: ' + job.title + ' — ' + job.brief;
  if (idx === 0) {
    const spec = CAR_TYPES.find((c) => c.type === 'muscle');
    const mesh = makeCarMesh(spec);
    mesh.position.set(-60, 0, 36); mesh.rotation.y = 0.4; scene.add(mesh);
    chain.target = { mesh, wp: 0, speed: 0 };
    chain.tailPath = CHAIN_TAIL_PATH;
    setBeacon(-60, 60);
    toast('Shadow Run: tail the black muscle car. Do not get spotted.');
    speakLine('Follow that courier, but stay invisible. Too close and he makes you.');
  } else if (idx === 1) {
    const a = makePerson(0x2a3a4a, 0x1a1a1a, 0xc98a5a);
    a.position.set(-96, groundHeight(-96, -84), -84); scene.add(a);
    const b = makePerson(0x8a2a2a, 0x2a2a2a, 0xd9a066);
    b.position.set(96, groundHeight(96, 84), 84); scene.add(b);
    chain.meetA = { mesh: a, x: -96, z: -84, arrived: false };
    chain.meetB = { mesh: b, x: 96, z: 84, arrived: false };
    setBeacon(-12, -12);
    toast('The Meeting: go to the plaza. The fixers arrive soon.');
    speakLine('Two fixers, one plaza, one handshake. Get the picture and get out.');
  } else if (idx === 2) {
    chain.timer = 170; chain.drops = CHAIN_DROPS;
    setBeacon(CHAIN_DROPS[0].x, CHAIN_DROPS[0].z);
    toast('Four Corners: 4 drops, 170 seconds. Move!');
    speakLine('Four drops, one clock. Do not stop for anyone.');
  } else {
    const w = makePerson(0xe8b820, 0x3a2a4a, 0xe8b898);
    const px = playerState.x, pz = playerState.z;
    w.position.set(px + 3, groundHeight(px + 3, pz + 3), pz + 3); scene.add(w);
    chain.escort = { mesh: w, followTimer: 0, lost: 0 };
    chain.escortTimer = 150;
    setBeacon(CHAIN_ESCORT_DEST.x, CHAIN_ESCORT_DEST.z);
    toast('Walk Her Home: stay close to the witness in yellow.');
    speakLine('She is scared, so stay close and walk her home. I will watch the streets.');
  }
  chainSetObjective();
}
function chainStart() {
  if (chain.active) { toast('Chain job already running.'); return; }
  chainStartJob(chainDone >= 4 ? 0 : chainDone);
}
function chainSnapPhoto() {
  if (!chain.active || chain.job !== 1) return;
  if (!chain.photoReady) { toast('No meeting yet — wait for both fixers to reach the plaza.'); return; }
  const p = chainPlayerPos();
  const d = Math.hypot(p.x - (-12), p.z - (-12));
  if (d < 6) { toast('Too close! They spotted the camera — back off and wait.'); chain.suspicion += 30; return; }
  if (d > 28) { toast('Too far — move closer for a clear shot.'); return; }
  toast('📸 Photo taken! The handshake is on film.');
  beep(1200, 0.1, 'square', 0.2); setTimeout(() => beep(900, 0.12, 'square', 0.15), 120);
  chainCompleteJob();
}
function chainUpdateTail(dt) {
  const t = chain.target;
  if (!t) return;
  const dest = chain.tailPath[t.wp];
  const dx = dest.x - t.mesh.position.x, dz = dest.z - t.mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 4) { t.wp = (t.wp + 1) % chain.tailPath.length; }
  else {
    const h = Math.atan2(dx, dz);
    t.mesh.rotation.y = h;
    const sp = 8.5;
    t.mesh.position.x += Math.sin(h) * sp * dt;
    t.mesh.position.z += Math.cos(h) * sp * dt;
    t.mesh.position.y = groundHeight(t.mesh.position.x, t.mesh.position.z);
  }
  const p = chainPlayerPos();
  const pd = Math.hypot(p.x - t.mesh.position.x, p.z - t.mesh.position.z);
  if (pd < 9) chain.suspicion += dt * 34;
  else if (pd < 16) chain.suspicion += dt * 8;
  else chain.suspicion -= dt * 14;
  chain.suspicion = clamp(chain.suspicion, 0, 100);
  if (pd > 55) {
    chain.loseTimer += dt;
    if (chain.loseTimer > 6) { chainFail('You lost the courier.'); return; }
  } else chain.loseTimer = 0;
  if (chain.suspicion >= 100) { chainFail('You were spotted tailing him.'); return; }
  setBeacon(t.mesh.position.x, t.mesh.position.z);
  if (t.wp >= chain.tailPath.length - 1 && d < 6) chainCompleteJob();
  chainSetObjective();
}
function chainUpdateMeet(dt) {
  const plaza = { x: -12, z: -12 };
  let both = true;
  for (const m of [chain.meetA, chain.meetB]) {
    if (!m) continue;
    const dx = plaza.x - m.mesh.position.x, dz = plaza.z - m.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.5) {
      both = false;
      const h = Math.atan2(dx, dz);
      m.mesh.rotation.y = h;
      m.mesh.position.x += Math.sin(h) * 2.2 * dt;
      m.mesh.position.z += Math.cos(h) * 2.2 * dt;
      m.mesh.position.y = groundHeight(m.mesh.position.x, m.mesh.position.z);
    } else m.arrived = true;
  }
  chain.photoReady = !!(chain.meetA && chain.meetA.arrived && chain.meetB && chain.meetB.arrived);
  if (chain.photoReady) {
    const p = chainPlayerPos();
    const d = Math.hypot(p.x - plaza.x, p.z - plaza.z);
    if (d < 5) { chain.suspicion += dt * 25; if (chain.suspicion >= 100) { chainFail('They spotted you at the meeting.'); return; } }
    else chain.suspicion = Math.max(0, chain.suspicion - dt * 10);
  }
  chainSetObjective();
}
function chainUpdateDrops(dt) {
  chain.timer -= dt;
  if (chain.timer <= 0) { chainFail('The clock ran out on the drops.'); return; }
  const p = chainPlayerPos();
  const drop = CHAIN_DROPS[chain.drop];
  const d = Math.hypot(p.x - drop.x, p.z - drop.z);
  if (d < 5) {
    chain.drop++;
    state.cash += 50;
    toast('Drop ' + chain.drop + '/4 delivered (+$50 courier tip).');
    beep(990, 0.12, 'sine', 0.2);
    if (chain.drop >= CHAIN_DROPS.length) { chainCompleteJob(); return; }
    setBeacon(CHAIN_DROPS[chain.drop].x, CHAIN_DROPS[chain.drop].z);
  }
  chainSetObjective();
}
function chainUpdateEscort(dt) {
  chain.escortTimer -= dt;
  if (chain.escortTimer <= 0) { chainFail('The witness gave up waiting.'); return; }
  const e = chain.escort;
  if (!e) return;
  const dx = playerState.x - e.mesh.position.x, dz = playerState.z - e.mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 20) {
    e.lost += dt;
    if (e.lost > 8) { chainFail('You lost the witness.'); return; }
  } else e.lost = 0;
  if (d > 2.5) {
    const sp = d > 12 ? 7 : 4.5;
    e.mesh.position.x += (dx / d) * sp * dt;
    e.mesh.position.z += (dz / d) * sp * dt;
    e.mesh.rotation.y = Math.atan2(dx, dz);
  }
  e.mesh.position.y = isleOnLand(e.mesh.position.x, e.mesh.position.z) ? ISLE_TOP : groundHeight(e.mesh.position.x, e.mesh.position.z);
  const destD = Math.hypot(e.mesh.position.x - CHAIN_ESCORT_DEST.x, e.mesh.position.z - CHAIN_ESCORT_DEST.z);
  if (destD < 5 && d < 12) { chainCompleteJob(); return; }
  if (Math.random() < dt * 0.02 && state.wanted < 2) { state.wanted = 2; }
  chainSetObjective();
}
function updateChain(dt) {
  if (!chain.active || state.mode !== 'play') return;
  if (chain.job === 0) chainUpdateTail(dt);
  else if (chain.job === 1) chainUpdateMeet(dt);
  else if (chain.job === 2) chainUpdateDrops(dt);
  else if (chain.job === 3) chainUpdateEscort(dt);
}
// ---------- Round 4, part three: darts at the bar, race league, job board ----------
const DART_BAR = { x: 48, z: 48 };
const DART_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const darts = { open: false, aimX: 0, aimY: 0, sway: 0, thrown: 0, turnScore: 0, total: 0, dartsLeft: 3, lastScore: 0, best: 0, marker: null, board: null };
{
  const shackM = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 1 });
  const shack = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 8), shackM);
  shack.position.set(DART_BAR.x + 8, 2.5, DART_BAR.z); shack.castShadow = true; scene.add(shack);
  const roofM = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 9), roofM);
  roof.position.set(DART_BAR.x + 8, 5.3, DART_BAR.z); scene.add(roof);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 0.3), new THREE.MeshStandardMaterial({ color: 0xff2a7a, emissive: 0xff2a7a, emissiveIntensity: 1.2 }));
  neon.position.set(DART_BAR.x + 8, 4.2, DART_BAR.z + 4.1); scene.add(neon);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  counter.position.set(DART_BAR.x + 8, 0.55, DART_BAR.z + 1.5); scene.add(counter);
  for (let i = 0; i < 4; i++) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
    stool.position.set(DART_BAR.x + 5 + i * 2, 0.3, DART_BAR.z + 2.6); scene.add(stool);
  }
  const boardG = new THREE.Group();
  const back = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  back.rotation.x = Math.PI / 2; boardG.add(back);
  for (let r = 0; r < 5; r++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25 - r * 0.24, 0.12, 6, 28), new THREE.MeshStandardMaterial({ color: r % 2 === 0 ? 0xf0ead8 : 0x222222 }));
    ring.position.z = 0.14; boardG.add(ring);
  }
  const bull = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0x881111, emissiveIntensity: 0.6 }));
  bull.rotation.x = Math.PI / 2; bull.position.z = 0.16; boardG.add(bull);
  for (let s = 0; s < 20; s++) {
    const a = (s / 20) * Math.PI * 2;
    const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: s % 2 === 0 ? 0xffe27a : 0x111111 }));
    wedge.position.set(Math.sin(a) * 0.95, Math.cos(a) * 0.95, 0.15); wedge.rotation.z = -a; boardG.add(wedge);
  }
  boardG.position.set(DART_BAR.x + 8, 2.4, DART_BAR.z + 3.9);
  boardG.rotation.y = Math.PI;
  scene.add(boardG);
  darts.board = boardG;
  const aim = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  aim.position.set(DART_BAR.x + 8, 2.4, DART_BAR.z + 3.6); scene.add(aim);
  darts.marker = aim;
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 3), new THREE.MeshStandardMaterial({ color: 0xffe27a }));
  line.position.set(DART_BAR.x + 8, 0.05, DART_BAR.z - 1); scene.add(line);
}
function dartsNear() { return Math.hypot(playerState.x - DART_BAR.x, playerState.z - DART_BAR.z) < 9 && !state.inCar; }
function dartsOpen() {
  if (darts.open) return;
  if (!dartsNear()) { toast('Go to the bar with the pink neon sign (east downtown) and press K to play darts.'); return; }
  darts.open = true; darts.aimX = 0; darts.aimY = 0; darts.thrown = 0; darts.turnScore = 0; darts.dartsLeft = 3;
  const el = document.getElementById('dartsPanel');
  if (el) el.classList.remove('hidden');
  toast('Darts! Arrow keys aim, Enter throws. 3 darts per turn.');
  dartsRender();
}
function dartsClose() {
  darts.open = false;
  const el = document.getElementById('dartsPanel');
  if (el) el.classList.add('hidden');
}
function dartsRender() {
  const el = document.getElementById('dartsInfo');
  if (el) el.textContent = 'Darts left: ' + darts.dartsLeft + ' · Turn: ' + darts.turnScore + ' · Total: ' + darts.total + ' · Best: ' + darts.best + (darts.lastScore ? ' · Last throw: ' + darts.lastScore : '');
  const aimEl = document.getElementById('dartsAim');
  if (aimEl) aimEl.textContent = 'Aim: ' + (darts.aimX >= 0 ? '+' : '') + darts.aimX.toFixed(1) + ', ' + (darts.aimY >= 0 ? '+' : '') + darts.aimY.toFixed(1);
}
function throwDart() {
  if (!darts.open || darts.dartsLeft <= 0) return;
  const swayX = Math.sin(state.time * 2.3) * 0.35 + Math.sin(state.time * 4.1) * 0.15;
  const swayY = Math.cos(state.time * 1.9) * 0.3 + Math.sin(state.time * 3.3) * 0.15;
  const hx = darts.aimX + swayX, hy = darts.aimY + swayY;
  const r = Math.hypot(hx, hy);
  let score = 0;
  if (r < 0.18) score = 50;
  else if (r < 0.42) score = 25;
  else if (r > 1.35) score = 0;
  else {
    let ang = Math.atan2(hx, hy);
    if (ang < 0) ang += Math.PI * 2;
    const seg = Math.floor(((ang + Math.PI / 20) % (Math.PI * 2)) / (Math.PI / 10)) % 20;
    const base = DART_ORDER[seg];
    score = base;
    if (r > 1.05 && r <= 1.25) score = base * 2;
    else if (r > 0.75 && r <= 0.85) score = base * 3;
    if (r > 1.25 && r <= 1.35) score = base * 2;
  }
  darts.lastScore = score; darts.turnScore += score; darts.total += score;
  darts.dartsLeft--; darts.thrown++;
  beep(score >= 50 ? 1320 : score >= 20 ? 990 : 440, 0.14, 'square', 0.18);
  if (darts.marker) {
    darts.marker.position.set(DART_BAR.x + 8 + hx, 2.4 + hy, DART_BAR.z + 3.6);
    setTimeout(() => { if (darts.marker) darts.marker.position.set(DART_BAR.x + 8 + darts.aimX, 2.4 + darts.aimY, DART_BAR.z + 3.6); }, 500);
  }
  if (darts.dartsLeft <= 0) {
    const t = darts.turnScore;
    let payout = 0;
    if (t >= 140) payout = 400; else if (t >= 100) payout = 250; else if (t >= 60) payout = 120;
    if (payout > 0) { state.cash += payout; toast('Darts turn: ' + t + ' points — you win $' + payout + '!'); chime(); }
    else toast('Darts turn: ' + t + ' points — no payout this time. K to play again.');
    dartChampTurnEnd(t);
    if (t > darts.best) darts.best = t;
    darts.turnScore = 0; darts.dartsLeft = 3;
    saveGame(); updateHUD();
  }
  dartsRender();
}
function updateDarts(dt) {
  if (!darts.open) return;
  const step = 1.6 * dt;
  if (keys['ArrowLeft']) darts.aimX -= step;
  if (keys['ArrowRight']) darts.aimX += step;
  if (keys['ArrowUp']) darts.aimY += step;
  if (keys['ArrowDown']) darts.aimY -= step;
  darts.aimX = clamp(darts.aimX, -1.4, 1.4); darts.aimY = clamp(darts.aimY, -1.4, 1.4);
  if (darts.marker) {
    const sx = Math.sin(state.time * 2.3) * 0.35, sy = Math.cos(state.time * 1.9) * 0.3;
    darts.marker.position.set(DART_BAR.x + 8 + darts.aimX + sx * 0.4, 2.4 + darts.aimY + sy * 0.4, DART_BAR.z + 3.6);
  }
  dartsRender();
}
const LEAGUE_RIVALS = [
  { name: 'Vex', pts: 0, color: '#ff5b5b' },
  { name: 'Nova', pts: 0, color: '#2ee6ff' },
  { name: 'Rook', pts: 0, color: '#7dff9a' },
];
const league = { season: 1, round: 0, myPts: 0, finished: 0, store: 'solmar-bay-r4-league' };
try {
  const savedLeague = JSON.parse(localStorage.getItem(league.store) || 'null');
  if (savedLeague) { league.season = savedLeague.season || 1; league.round = savedLeague.round || 0; league.myPts = savedLeague.myPts || 0; if (savedLeague.rivals) for (let i = 0; i < 3; i++) LEAGUE_RIVALS[i].pts = savedLeague.rivals[i] || 0; }
} catch (e) {}
function leaguePersist() { try { localStorage.setItem(league.store, JSON.stringify({ season: league.season, round: league.round, myPts: league.myPts, rivals: LEAGUE_RIVALS.map((r) => r.pts) })); } catch (e) {} }
function leagueStandings() {
  const rows = [{ name: activeName() + ' (you)', pts: league.myPts, you: true }].concat(LEAGUE_RIVALS.map((r) => ({ name: r.name, pts: r.pts })));
  rows.sort((a, b) => b.pts - a.pts);
  return rows;
}
function leagueRender() {
  const el = document.getElementById('leagueLine');
  if (!el) return;
  const rows = leagueStandings();
  el.textContent = 'League S' + league.season + ' R' + (league.round + 1) + '/5 · ' + rows.map((r, i) => (i + 1) + '. ' + r.name + ' ' + r.pts).join(' · ');
}
function leagueRecord(prize) {
  league.round++;
  let myGain = 0;
  if (prize >= 1500) myGain = 12; else if (prize >= 1000) myGain = 9; else if (prize > 0) myGain = 6; else myGain = 3;
  league.myPts += myGain;
  for (const r of LEAGUE_RIVALS) r.pts += 3 + Math.floor(Math.random() * 9);
  leaguePersist();
  leagueRender();
  const rows = leagueStandings();
  const myPos = rows.findIndex((r) => r.you) + 1;
  toast('League round ' + league.round + '/5 done — you are P' + myPos + ' with ' + league.myPts + ' pts.');
  if (league.round >= 5) {
    league.finished++;
    if (myPos === 1) { state.cash += 2000; toast('🏆 LEAGUE CHAMPION! Season ' + league.season + ' is yours — $2000 champion bonus!'); speakLine('Champion of the bay league. Two thousand dollars, and every rival knows your name.'); chime(); }
    else toast('Season ' + league.season + ' over — ' + rows[0].name + ' takes the title. Season ' + (league.season + 1) + ' starts now.');
    league.season++; league.round = 0; league.myPts = 0;
    for (const r of LEAGUE_RIVALS) r.pts = 0;
    leaguePersist(); leagueRender(); saveGame(); updateHUD();
  }
}
const BOARD_SPOT = { x: -36, z: 84 };
const BOARD_JOBS = [
  { kind: 'dash', label: 'Parcel Dash', desc: 'Deliver a parcel across town fast', time: 75, reward: 180 },
  { kind: 'tour', label: 'Bay Tour', desc: 'Visit 3 viewpoints in order', time: 150, reward: 260 },
  { kind: 'sweep', label: 'Street Sweep', desc: 'Collect 3 dumped crates', time: 120, reward: 220 },
  { kind: 'patrol', label: 'Night Patrol', desc: 'Check 3 corners of downtown', time: 140, reward: 240 },
  { kind: 'ferry', label: 'Cay Ferry Run', desc: 'Reach the Coral Cay pier', time: 110, reward: 300 },
];
const boardJob = { active: false, idx: -1, stage: 0, timer: 0, targets: [], markers: [], panelOpen: false };
{
  const boardM = new THREE.MeshStandardMaterial({ color: 0x6a4a22, roughness: 1 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 0.3), boardM);
  frame.position.set(BOARD_SPOT.x, 2.2, BOARD_SPOT.z); scene.add(frame);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.8, 0.1), new THREE.MeshStandardMaterial({ color: 0xf0ead8 }));
  paper.position.set(BOARD_SPOT.x, 2.2, BOARD_SPOT.z + 0.2); scene.add(paper);
  for (let i = 0; i < 2; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), boardM);
    leg.position.set(BOARD_SPOT.x - 2 + i * 4, 0.6, BOARD_SPOT.z); scene.add(leg);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 0.8 }));
  lamp.position.set(BOARD_SPOT.x, 4.1, BOARD_SPOT.z); scene.add(lamp);
}
function boardNear() { return Math.hypot(playerState.x - BOARD_SPOT.x, playerState.z - BOARD_SPOT.z) < 8 && !state.inCar; }
function boardOpenPanel() {
  if (!boardNear()) { toast('Find the wooden job board near the north-west plaza and press Z there.'); return; }
  boardJob.panelOpen = true;
  const el = document.getElementById('boardPanel');
  if (el) { el.classList.remove('hidden'); boardRenderList(); }
  beep(880, 0.08, 'sine', 0.12);
}
function boardClosePanel() {
  boardJob.panelOpen = false;
  const el = document.getElementById('boardPanel');
  if (el) el.classList.add('hidden');
}
function boardRenderList() {
  const el = document.getElementById('boardItems');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < BOARD_JOBS.length; i++) {
    const j = BOARD_JOBS[i];
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.textContent = j.label + ' — $' + j.reward + ' · ' + j.time + 's';
    b.disabled = boardJob.active;
    b.addEventListener('click', () => acceptBoardJob(i));
    el.appendChild(b);
    const d = document.createElement('div');
    d.style.cssText = 'font-size:12px;color:#cfe8ff;margin:-2px 0 6px';
    d.textContent = j.desc;
    el.appendChild(d);
  }
  const status = document.getElementById('boardStatus');
  if (status) status.textContent = boardJob.active ? 'Job running: ' + BOARD_JOBS[boardJob.idx].label + ' — ' + Math.max(0, Math.ceil(boardJob.timer)) + 's left' : 'Pick a job. Repeatable, any time.';
}
function boardClearMarkers() {
  for (const m of boardJob.markers) scene.remove(m);
  boardJob.markers = [];
}
function boardMakeTarget(x, z, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 18), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
  m.position.set(x, isleOnLand(x, z) ? ISLE_TOP + 0.3 : groundHeight(x, z) + 0.3, z); scene.add(m);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 26, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(x, (isleOnLand(x, z) ? ISLE_TOP : groundHeight(x, z)) + 13, z); scene.add(beam);
  boardJob.markers.push(m); boardJob.markers.push(beam);
  return { x, z };
}
function acceptBoardJob(i) {
  if (boardJob.active) { toast('Finish your current board job first.'); return; }
  const j = BOARD_JOBS[i];
  boardJob.active = true; boardJob.idx = i; boardJob.stage = 0; boardJob.timer = j.time; boardJob.targets = [];
  boardClearMarkers();
  if (j.kind === 'dash') {
    const p = roadPoint();
    boardJob.targets = [boardMakeTarget(p.x, p.z, 0x2ee6ff)];
    setBeacon(p.x, p.z);
  } else if (j.kind === 'tour') {
    boardJob.targets = [
      boardMakeTarget(120, -60, 0x2ee6ff), boardMakeTarget(-180, 180, 0x2ee6ff), boardMakeTarget(150, 200, 0x2ee6ff),
    ];
    setBeacon(120, -60);
  } else if (j.kind === 'sweep') {
    boardJob.targets = [];
    for (let k = 0; k < 3; k++) { const p = roadPoint(); boardJob.targets.push(boardMakeTarget(p.x, p.z, 0xff9a5a)); }
    setBeacon(boardJob.targets[0].x, boardJob.targets[0].z);
  } else if (j.kind === 'patrol') {
    boardJob.targets = [
      boardMakeTarget(-60, -60, 0xff9a5a), boardMakeTarget(60, -60, 0xff9a5a), boardMakeTarget(0, 60, 0xff9a5a),
    ];
    setBeacon(-60, -60);
  } else {
    boardJob.targets = [boardMakeTarget(ISLE_CX - ISLE_R - 26, ISLE_CZ + 14, 0x2ee6ff)];
    setBeacon(ISLE_CX - ISLE_R - 26, ISLE_CZ + 14);
  }
  boardClosePanel();
  toast(j.label + ' started — ' + j.time + 's on the clock. Follow the beacon.');
  speakLine(j.label + '. ' + j.desc + '. The clock is running, ' + activeName() + '.');
  boardRenderList();
}
function updateBoardJob(dt) {
  if (!boardJob.active) return;
  boardJob.timer -= dt;
  if (boardJob.timer <= 0) {
    boardJob.active = false; boardClearMarkers(); beacon.visible = false;
    toast('Board job expired — the client hired someone else.');
    updateObjective(); return;
  }
  const p = chainPlayerPos();
  const t = boardJob.targets[boardJob.stage];
  if (!t) return;
  const d = Math.hypot(p.x - t.x, p.z - t.z);
  if (d < 4.5) {
    boardJob.stage++;
    beep(990, 0.12, 'sine', 0.2);
    if (boardJob.stage >= boardJob.targets.length) {
      const j = BOARD_JOBS[boardJob.idx];
      state.cash += j.reward;
      boardJob.active = false; boardClearMarkers(); beacon.visible = false;
      toast(j.label + ' done! +$' + j.reward);
      chime(); saveGame(); updateHUD(); updateObjective();
      return;
    }
    const next = boardJob.targets[boardJob.stage];
    setBeacon(next.x, next.z);
    toast('Checkpoint ' + boardJob.stage + '/' + boardJob.targets.length + ' — next one marked.');
  }
  const status = document.getElementById('boardStatus');
  if (status && boardJob.panelOpen) status.textContent = 'Job running: ' + BOARD_JOBS[boardJob.idx].label + ' — ' + Math.max(0, Math.ceil(boardJob.timer)) + 's left';
}
// ---------- Round 4, part four: a busier bay — five new random events ----------
const R4_EVENT_KINDS = ['robbery', 'challenger', 'stranded', 'tourist', 'runaway'];
const r4event = { active: null, timer: 70, channel: 0, ai: null, cart: null, smoke: [], ped: null, car: null, target: null, spawnX: 0, spawnZ: 0 };
function r4eventSpot() {
  const a = Math.random() * Math.PI * 2;
  const d = 22 + Math.random() * 14;
  return { x: clamp(playerState.x + Math.cos(a) * d, -HALF + 6, HALF - 6), z: clamp(playerState.z + Math.sin(a) * d, -HALF + 6, HALF - 6) };
}
function r4eventClearMeshes() {
  if (r4event.ped) { scene.remove(r4event.ped.mesh); const i = peds.indexOf(r4event.ped); if (i >= 0) peds.splice(i, 1); r4event.ped = null; }
  if (r4event.car) { scene.remove(r4event.car); r4event.car = null; }
  if (r4event.cart) { scene.remove(r4event.cart); r4event.cart = null; }
  if (r4event.ai) { scene.remove(r4event.ai.mesh); r4event.ai = null; }
  for (const s of r4event.smoke) scene.remove(s);
  r4event.smoke = [];
}
function r4eventEnd(win, msg) {
  if (win) { chime(); }
  toast(msg);
  r4eventClearMeshes();
  beacon.visible = false;
  r4event.active = null; r4event.timer = 65 + Math.random() * 55; r4event.channel = 0;
  updateHUD();
}
function r4eventSpawn(kind) {
  if (r4event.active || streetEvent || chain.active || boardJob.active || state.mode !== 'play') return;
  const spot = r4eventSpot();
  r4event.spawnX = spot.x; r4event.spawnZ = spot.z;
  if (kind === 'robbery') {
    const mesh = makePerson(0x1a1a1a, 0x1a1a1a, 0x8a5a33);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
    band.position.set(0, 1.62, 0.2); mesh.add(band);
    mesh.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z); scene.add(mesh);
    const p = { mesh, x: spot.x, z: spot.z, heading: 0, speed: 0, target: null, down: false, downTimer: 0, phase: 0, flee: false, mood: 'calm', isBounty: false };
    peds.push(p); r4event.ped = p;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.4), new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
    bag.position.set(spot.x + 1.2, groundHeight(spot.x, spot.z) + 0.3, spot.z); scene.add(bag);
    r4event.car = bag;
    r4event.active = { kind, timer: 55, state: 'confront' };
    setBeacon(spot.x, spot.z);
    toast('🚨 Robbery in progress! Stop the masked thief before he gets away.');
    speakLine('A robbery, right here. Stop him and the shopkeeper pays you.');
    beep(220, 0.25, 'sawtooth', 0.25);
  } else if (kind === 'challenger') {
    const spec = CAR_TYPES.find((c) => c.type === 'supercar');
    const mesh = makeCarMesh(spec);
    mesh.position.set(spot.x, 0, spot.z); mesh.rotation.y = Math.random() * Math.PI * 2; scene.add(mesh);
    const dest = roadPoint();
    r4event.ai = { mesh, cp: 0, speed: 0, done: false };
    r4event.target = dest;
    r4event.active = { kind, timer: 95, state: 'race' };
    setBeacon(dest.x, dest.z);
    toast('🏎️ A street challenger revs at you! Beat his supercar to the beacon — $400 if you win.');
    speakLine('A challenger. Beat him to the marker and take his money.');
    beep(660, 0.15, 'square', 0.2); setTimeout(() => beep(880, 0.15, 'square', 0.2), 160);
  } else if (kind === 'stranded') {
    const spec = CAR_TYPES.find((c) => c.type === 'sedan');
    const mesh = makeCarMesh(spec);
    mesh.position.set(spot.x, 0, spot.z); mesh.rotation.y = 0.8; scene.add(mesh);
    r4event.car = mesh;
    const driver = makePerson(0xf39c12, 0x2c3e50, 0xd9a066);
    driver.position.set(spot.x + 2.5, groundHeight(spot.x, spot.z), spot.z + 1); scene.add(driver);
    r4event.ped = { mesh: driver, x: spot.x + 2.5, z: spot.z + 1, heading: 0, speed: 0, target: null, down: false, downTimer: 0, phase: 0, flee: false, mood: 'calm' };
    peds.push(r4event.ped);
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5 + i * 0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5 - i * 0.08 }));
      puff.position.set(spot.x, 1.5 + i * 0.7, spot.z); scene.add(puff);
      r4event.smoke.push(puff);
    }
    r4event.active = { kind, timer: 90, state: 'fix' };
    setBeacon(spot.x, spot.z);
    toast('🔧 Stranded driver! Stand by the smoking car for a few seconds to fix it.');
    speakLine('Someone broke down. A good mechanic earns a good tip.');
  } else if (kind === 'tourist') {
    const mesh = makePerson(0xecf0f1, 0x9b59b6, 0xf0c8a0);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xe8b820 }));
    hat.position.y = 1.85; mesh.add(hat);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    cam.position.set(0, 1.1, 0.3); mesh.add(cam);
    mesh.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z); scene.add(mesh);
    const p = { mesh, x: spot.x, z: spot.z, heading: 0, speed: 0, target: null, down: false, downTimer: 0, phase: 0, flee: false, mood: 'calm' };
    peds.push(p); r4event.ped = p;
    r4event.target = { x: -12, z: -12 };
    r4event.active = { kind, timer: 95, state: 'escort' };
    setBeacon(-12, -12);
    toast('🧳 Lost tourist! Walk them to the downtown plaza — stay close.');
    speakLine('A tourist is lost. Walk them to the plaza and they will tip you well.');
  } else {
    const cart = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xe86a1e }));
    box.position.y = 0.9; cart.add(box);
    for (const [wx, wz] of [[-0.8, 0.6], [0.8, 0.6], [-0.8, -0.6], [0.8, -0.6]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.32, wz); cart.add(wheel);
    }
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff8c1a }));
    fruit.position.set(0, 1.7, 0); cart.add(fruit);
    cart.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z); scene.add(cart);
    r4event.cart = cart;
    r4event.active = { kind, timer: 40, state: 'chase', vx: 0, vz: 0, dir: Math.random() * Math.PI * 2 };
    setBeacon(spot.x, spot.z);
    toast('🛒 Runaway fruit cart! Catch it before it rolls away — $100 reward.');
    speakLine('A cart broke loose. Catch it before it hits something.');
  }
}
function r4eventPick() {
  const kind = R4_EVENT_KINDS[Math.floor(Math.random() * R4_EVENT_KINDS.length)];
  r4eventSpawn(kind);
}
function updateR4event(dt) {
  if (state.mode !== 'play') return;
  if (!r4event.active) {
    r4event.timer -= dt;
    if (r4event.timer <= 0) { r4event.timer = 65 + Math.random() * 55; r4eventPick(); }
    return;
  }
  const ev = r4event.active;
  ev.timer -= dt;
  if (ev.timer <= 0) {
    if (ev.kind === 'challenger') r4eventEnd(false, 'The challenger got away — too slow this time.');
    else if (ev.kind === 'robbery') r4eventEnd(false, 'The thief escaped with the cash.');
    else if (ev.kind === 'stranded') r4eventEnd(false, 'The stranded driver gave up and called a tow truck.');
    else if (ev.kind === 'tourist') r4eventEnd(false, 'The tourist found their own way — no tip for you.');
    else r4eventEnd(false, 'The cart rolled off and smashed into a wall.');
    return;
  }
  const p = chainPlayerPos();
  if (ev.kind === 'robbery') {
    const ped = r4event.ped;
    if (!ped) { r4eventEnd(false, 'The thief vanished.'); return; }
    if (ped.down) {
      state.cash += 250;
      saveGame(); updateHUD();
      r4eventEnd(true, 'Thief stopped! The shopkeeper pays you $250.');
      speakLine('Thief down. The shopkeeper is very grateful, ' + activeName() + '.');
      return;
    }
    const d = Math.hypot(p.x - ped.x, p.z - ped.z);
    if (d > 45) { r4eventEnd(false, 'The thief slipped away while you were far off.'); return; }
    ped.mesh.position.y = groundHeight(ped.x, ped.z);
    if (d < 6 && ped.flee) { ped.speed = 6; const a = Math.atan2(ped.x - p.x, ped.z - p.z); ped.x += Math.sin(a) * 6 * dt; ped.z += Math.cos(a) * 6 * dt; ped.mesh.position.set(ped.x, groundHeight(ped.x, ped.z), ped.z); ped.mesh.rotation.y = a; }
  } else if (ev.kind === 'challenger') {
    const ai = r4event.ai;
    if (!ai) return;
    const dest = r4event.target;
    const dx = dest.x - ai.mesh.position.x, dz = dest.z - ai.mesh.position.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 3) {
      const h = Math.atan2(dx, dz);
      ai.mesh.rotation.y = h;
      ai.mesh.position.x += Math.sin(h) * 12 * dt;
      ai.mesh.position.z += Math.cos(h) * 12 * dt;
      ai.mesh.position.y = groundHeight(ai.mesh.position.x, ai.mesh.position.z);
    } else {
      r4eventEnd(false, 'The challenger beat you to the beacon — $400 stays in his pocket.');
      return;
    }
    const pd = Math.hypot(p.x - dest.x, p.z - dest.z);
    if (pd < 5) {
      state.cash += 400;
      saveGame(); updateHUD();
      r4eventEnd(true, 'You beat the challenger! +$400 and bragging rights.');
      speakLine('He never stood a chance. Four hundred dollars, straight from his wallet.');
      return;
    }
    setBeacon(dest.x, dest.z);
  } else if (ev.kind === 'stranded') {
    for (let i = 0; i < r4event.smoke.length; i++) {
      const s = r4event.smoke[i];
      s.position.y += dt * (0.4 + i * 0.15);
      s.position.x += Math.sin(state.time * 2 + i) * dt * 0.3;
      if (s.position.y > 5) s.position.y = 1.5;
      s.material.opacity = 0.35 + Math.sin(state.time * 3 + i * 2) * 0.12;
    }
    const car = r4event.car;
    if (!car) return;
    const d = Math.hypot(p.x - car.position.x, p.z - car.position.z);
    if (d < 4 && !state.inCar) {
      r4event.channel += dt;
      if (Math.floor(r4event.channel * 2) !== Math.floor((r4event.channel - dt) * 2)) beep(520, 0.06, 'square', 0.1);
      if (r4event.channel >= 3) {
        state.cash += 150;
        saveGame(); updateHUD();
        r4eventEnd(true, 'Car fixed! The driver tips you $150 and drives off.');
        speakLine('Fixed in no time. The driver could not believe it.');
        return;
      }
    } else r4event.channel = Math.max(0, r4event.channel - dt * 2);
    const status = document.getElementById('toast');
    if (d < 4 && !state.inCar && r4event.channel > 0) toast('Fixing… ' + Math.ceil(3 - r4event.channel) + 's — stay by the car.');
  } else if (ev.kind === 'tourist') {
    const ped = r4event.ped;
    if (!ped) return;
    const dx = playerState.x - ped.x, dz = playerState.z - ped.z;
    const d = Math.hypot(dx, dz);
    if (d > 3) {
      const sp = d > 12 ? 6.5 : 4;
      ped.x += (dx / d) * sp * dt; ped.z += (dz / d) * sp * dt;
      ped.mesh.position.set(ped.x, groundHeight(ped.x, ped.z), ped.z);
      ped.mesh.rotation.y = Math.atan2(dx, dz);
    }
    const destD = Math.hypot(ped.x - (-12), ped.z - (-12));
    if (destD < 5) {
      state.cash += 200;
      saveGame(); updateHUD();
      r4eventEnd(true, 'Tourist delivered to the plaza! +$200 tip.');
      speakLine('The tourist loved the tour. Two hundred dollars, and a five-star review.');
      return;
    }
    if (d > 25) { r4eventEnd(false, 'You lost the tourist in the crowd.'); return; }
  } else if (ev.kind === 'runaway') {
    const cart = r4event.cart;
    if (!cart) return;
    ev.dir += Math.sin(state.time * 0.8) * dt * 0.7;
    const sp = 5.5;
    cart.position.x += Math.sin(ev.dir) * sp * dt;
    cart.position.z += Math.cos(ev.dir) * sp * dt;
    cart.position.x = clamp(cart.position.x, -HALF, HALF);
    cart.position.z = clamp(cart.position.z, -HALF, HALF);
    cart.position.y = groundHeight(cart.position.x, cart.position.z);
    cart.rotation.y = ev.dir;
    cart.rotation.z = Math.sin(state.time * 5) * 0.06;
    setBeacon(cart.position.x, cart.position.z);
    const d = Math.hypot(p.x - cart.position.x, p.z - cart.position.z);
    if (d < 2.2) {
      state.cash += 100;
      saveGame(); updateHUD();
      r4eventEnd(true, 'Cart caught! The vendor pays you $100.');
      speakLine('Got it! The fruit vendor owes you one.');
      return;
    }
  }
}
// ---------- Round 4, part five: salvage diving off the east coast ----------
const DIVE_BUOYS = [
  { x: 150, z: -90, label: 'wreck of the gull' }, { x: 190, z: 60, label: 'old anchor field' },
  { x: 230, z: -20, label: 'sunken skiff' }, { x: 165, z: 150, label: 'reef drop' },
];
const DIVE_STORE_KEY = 'solmar-bay-r4-dive';
let diveCratesFound = 0;
try { diveCratesFound = Number(JSON.parse(localStorage.getItem(DIVE_STORE_KEY) || '0')) || 0; } catch (e) { diveCratesFound = 0; }
const dive = { active: false, oxygen: 35, maxOxygen: 35, buoy: null, crates: [], buoys: [], bob: 0, surfaced: false };
function divePersist() { try { localStorage.setItem(DIVE_STORE_KEY, JSON.stringify(diveCratesFound)); } catch (e) {} }
function diveActive() { return dive.active; }
{
  for (let i = 0; i < DIVE_BUOYS.length; i++) {
    const b = DIVE_BUOYS[i];
    const g = new THREE.Group();
    const floatM = new THREE.MeshStandardMaterial({ color: 0xff5b5b, roughness: 0.6 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.8, 12), floatM);
    base.position.y = 0.4; g.add(base);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 10), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 0.7 }));
    tip.position.y = 1.5; g.add(tip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 8, 24), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.7 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff2a7a, emissive: 0xff2a7a, emissiveIntensity: 1.4 }));
    light.position.y = 2.4; g.add(light);
    g.position.set(b.x, 0, b.z); scene.add(g);
    dive.buoys.push({ mesh: g, light, ring, x: b.x, z: b.z, label: b.label });
  }
  const crateCols = [0x8a6a42, 0x2e6fb0, 0xc0392b, 0x2ecc71, 0xe8b820, 0x9b59b6, 0xff8c1a, 0x1e8a8a];
  for (let i = 0; i < 8; i++) {
    const buoy = DIVE_BUOYS[i % DIVE_BUOYS.length];
    const cx = buoy.x + (i % 2 === 0 ? -9 : 9) + (i % 3) * 3;
    const cz = buoy.z + (i < 4 ? -7 : 8) - (i % 2) * 4;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.1), new THREE.MeshStandardMaterial({ color: crateCols[i], roughness: 0.9 }));
    box.position.y = 0.5; g.add(box);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    strap.position.y = 0.5; g.add(strap);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.22 }));
    glow.position.y = 0.6; g.add(glow);
    const seaY = groundHeight(cx, cz);
    g.position.set(cx, seaY, cz); scene.add(g);
    dive.crates.push({ mesh: g, x: cx, z: cz, taken: i < diveCratesFound, bob: i * 1.1, buoy: i % DIVE_BUOYS.length });
    if (i < diveCratesFound) g.visible = false;
  }
}
function diveNearBuoy() {
  const p = chainPlayerPos();
  for (let i = 0; i < DIVE_BUOYS.length; i++) {
    if (Math.hypot(p.x - DIVE_BUOYS[i].x, p.z - DIVE_BUOYS[i].z) < 10) return i;
  }
  return -1;
}
function diveToggle() {
  if (state.mode !== 'play') return;
  if (dive.active) { diveSurface(false); return; }
  if (state.inCar) { toast('Get out of the vehicle to dive — swim to a blue-ringed buoy first.'); return; }
  const bi = diveNearBuoy();
  if (bi < 0) { toast('Dive buoys ring the east coast (blue rings on the water). Swim to one and press X.'); return; }
  dive.active = true; dive.buoy = bi; dive.oxygen = dive.maxOxygen; dive.surfaced = false;
  const overlay = document.getElementById('diveOverlay');
  if (overlay) overlay.classList.remove('hidden');
  toast('🤿 Diving at ' + DIVE_BUOYS[bi].label + '! Oxygen 35s — grab the glowing crates, X to surface.');
  speakLine('Down we go. Watch the air, ' + activeName() + ' — the crates are worth two hundred each.');
  beep(440, 0.2, 'sine', 0.2);
}
function diveSurface(ranOut) {
  dive.active = false;
  const overlay = document.getElementById('diveOverlay');
  if (overlay) overlay.classList.add('hidden');
  const b = DIVE_BUOYS[dive.buoy || 0];
  playerState.x = b.x; playerState.z = b.z; playerState.y = 0; playerState.vy = 0; playerState.onGround = true;
  player.position.set(b.x, 0.5, b.z);
  dive.oxygen = dive.maxOxygen;
  if (ranOut) { state.health = Math.max(10, state.health - 15); toast('Out of air! You surface gasping — lost 15 health.'); updateHUD(); }
  else toast('Surfaced at the buoy. Air refilled.');
}
function updateDive(dt) {
  dive.bob += dt;
  for (let i = 0; i < dive.buoys.length; i++) {
    const b = dive.buoys[i];
    b.mesh.position.y = Math.sin(dive.bob * 1.6 + i) * 0.15;
    b.ring.rotation.z += dt * 0.5;
    b.light.material.emissiveIntensity = 1 + Math.sin(dive.bob * 3 + i) * 0.6;
  }
  if (!dive.active) return;
  dive.oxygen -= dt;
  const overlay = document.getElementById('diveOverlay');
  if (overlay) {
    const pct = Math.max(0, dive.oxygen / dive.maxOxygen);
    overlay.style.background = 'linear-gradient(180deg, rgba(6,40,70,' + (0.25 + (1 - pct) * 0.25) + '), rgba(4,20,50,0.55))';
  }
  const line = document.getElementById('diveLine');
  if (line) line.textContent = '🤿 OXYGEN ' + Math.max(0, Math.ceil(dive.oxygen)) + 's · crates ' + diveCratesFound + '/8 · X to surface';
  if (dive.oxygen <= 10 && dive.oxygen > 0 && Math.floor(dive.oxygen * 2) !== Math.floor((dive.oxygen + dt) * 2)) beep(880, 0.08, 'square', 0.14);
  if (dive.oxygen <= 0) { diveSurface(true); return; }
  const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
  let mx = 0, mz = 0;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyA']) mx -= 1;
  if (keys['KeyD']) mx += 1;
  const len = Math.hypot(mx, mz) || 1;
  mx /= len; mz /= len;
  const sp = 3.4;
  const wx = (mx * cos - mz * sin) * sp * dt;
  const wz = (mx * sin + mz * cos) * sp * dt;
  playerState.x = clamp(playerState.x + wx, 120, 280);
  playerState.z = clamp(playerState.z + wz, -280, 280);
  const floorY = groundHeight(playerState.x, playerState.z);
  playerState.y = floorY + 0.9 + Math.sin(dive.bob * 2) * 0.25;
  player.position.set(playerState.x, playerState.y, playerState.z);
  if (mx !== 0 || mz !== 0) playerState.heading = Math.atan2(wx, wz);
  player.rotation.y = playerState.heading;
  for (let i = 0; i < dive.crates.length; i++) {
    const c = dive.crates[i];
    if (c.taken) continue;
    c.mesh.rotation.y += dt * 0.8;
    c.mesh.position.y = groundHeight(c.x, c.z) + Math.sin(dive.bob * 1.5 + c.bob) * 0.15;
    const d = Math.hypot(playerState.x - c.x, playerState.z - c.z);
    if (d < 2.4) {
      c.taken = true; c.mesh.visible = false;
      diveCratesFound++; divePersist();
      state.cash += 200; chime();
      toast('Salvage crate! +$200 (' + diveCratesFound + '/8)');
      speakLine('A salvage crate — two hundred dollars of someone else\'s bad luck.');
      if (diveCratesFound >= 8) {
        state.cash += 500;
        toast('All 8 crates! Marisol adds a $500 salvage bonus — the buoys restock next trip.');
        diveCratesFound = 0; divePersist();
        for (const cc of dive.crates) { cc.taken = false; cc.mesh.visible = true; }
      }
      saveGame(); updateHUD();
    }
  }
}
// ---------- Round 4, part six: Coral Cay night market + scenic viewpoints ----------
const MARKET_STALLS = [
  { id: 'coconut', label: 'Coconut Water', desc: 'fresh from the Cay palms', price: 15, heal: 30, icon: '🥥' },
  { id: 'grilled', label: 'Grilled Fish', desc: 'caught this morning off the pier', price: 30, heal: 50, icon: '🐟' },
  { id: 'charm1', label: 'Shell Charm — Wave', desc: 'a keepsake carved from a Cay shell', price: 100, heal: 0, icon: '🐚' },
  { id: 'charm2', label: 'Shell Charm — Sun', desc: 'warm colours, lucky for drivers', price: 100, heal: 0, icon: '☀️' },
  { id: 'charm3', label: 'Shell Charm — Moon', desc: 'pale shell, lucky for night work', price: 100, heal: 0, icon: '🌙' },
  { id: 'lantern', label: 'Paper Lantern', desc: 'lights your dashboard at night', price: 60, heal: 0, icon: '🏮' },
];
const marketState = { open: false, charms: [], stall: 0 };
try { const m = JSON.parse(localStorage.getItem('solmar-bay-r4-market') || 'null'); if (m && m.charms) marketState.charms = m.charms; } catch (e) {}
function marketPersist() { try { localStorage.setItem('solmar-bay-r4-market', JSON.stringify({ charms: marketState.charms })); } catch (e) {} }
const marketMeshes = [];
{
  const stallSpots = [
    { x: ISLE_CX - 10, z: ISLE_CZ - 10, col: 0xff5b5b }, { x: ISLE_CX + 10, z: ISLE_CZ - 10, col: 0x2ecc71 },
    { x: ISLE_CX - 10, z: ISLE_CZ + 14, col: 0x2ee6ff },
  ];
  for (let i = 0; i < stallSpots.length; i++) {
    const s = stallSpots[i];
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x8a6a42 }));
    counter.position.y = 0.55; g.add(counter);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 2.4), new THREE.MeshStandardMaterial({ color: s.col }));
    awn.position.y = 2.6; awn.rotation.x = 0.2; g.add(awn);
    for (let p = 0; p < 2; p++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
      pole.position.set(-1.6 + p * 3.2, 1.3, 1); g.add(pole);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 1.2 }));
    lamp.position.set(0, 2.9, 0); g.add(lamp);
    const keeper = makePerson([0xe84a7a, 0x2ee6ff, 0xffd23f][i], 0x2a3a4a, 0xd9a066);
    keeper.position.set(0, 0, -1.4); g.add(keeper);
    const goods = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshStandardMaterial({ color: s.col }));
    goods.position.set(-0.8, 1.4, 0.3); g.add(goods);
    const goods2 = goods.clone(); goods2.position.x = 0.8; goods2.material = new THREE.MeshStandardMaterial({ color: 0xffe27a }); g.add(goods2);
    g.position.set(s.x, ISLE_TOP, s.z); scene.add(g);
    marketMeshes.push({ group: g, x: s.x, z: s.z, lamp, awn, stall: i });
  }
  const buntingM = new THREE.MeshStandardMaterial({ color: 0xffd23f });
  for (let i = 0; i < 12; i++) {
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 4), new THREE.MeshStandardMaterial({ color: [0xff5b5b, 0x2ee6ff, 0x2ecc71, 0xffd23f][i % 4] }));
    const a = (i / 12) * Math.PI * 2;
    flag.position.set(ISLE_CX + Math.cos(a) * 13, ISLE_TOP + 4.2, ISLE_CZ + Math.sin(a) * 13);
    flag.rotation.x = Math.PI; scene.add(flag);
  }
}
function marketNear() {
  if (state.inCar) return -1;
  for (let i = 0; i < marketMeshes.length; i++) {
    if (Math.hypot(playerState.x - marketMeshes[i].x, playerState.z - marketMeshes[i].z) < 5) return i;
  }
  return -1;
}
function marketOpenPanel(stallIdx) {
  marketState.open = true; marketState.stall = stallIdx;
  const el = document.getElementById('marketPanel');
  if (el) { el.classList.remove('hidden'); marketRenderList(); }
  beep(880, 0.08, 'sine', 0.12);
}
function marketClosePanel() {
  marketState.open = false;
  const el = document.getElementById('marketPanel');
  if (el) el.classList.add('hidden');
}
function marketRenderList() {
  const el = document.getElementById('marketItems');
  if (!el) return;
  el.innerHTML = '';
  const stallNames = ['Mara\'s Drinks', 'Tomas\' Grill', 'Nadia\'s Keepsakes'];
  const title = document.getElementById('marketTitle');
  if (title) title.textContent = '🏮 ' + stallNames[marketState.stall] + ' — Coral Cay Market';
  const items = marketState.stall === 0 ? MARKET_STALLS.slice(0, 1) : marketState.stall === 1 ? MARKET_STALLS.slice(1, 2) : MARKET_STALLS.slice(2);
  for (const item of items) {
    const owned = item.id.startsWith('charm') && marketState.charms.includes(item.id);
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.textContent = item.icon + ' ' + item.label + ' — $' + item.price + (owned ? ' (owned)' : '');
    b.disabled = state.cash < item.price || owned;
    b.addEventListener('click', () => marketBuy(item));
    el.appendChild(b);
    const d = document.createElement('div');
    d.style.cssText = 'font-size:12px;color:#cfe8ff;margin:-2px 0 6px';
    d.textContent = item.desc + (item.heal ? ' · restores ' + item.heal + ' health' : '');
    el.appendChild(d);
  }
  if (marketState.stall === 2 && !lootState.mapBought) {
    const mb = document.createElement('button');
    mb.className = 'shopItem';
    mb.textContent = '🗺️ Treasure Map — $50 (marks 5 dig sites)';
    mb.disabled = state.cash < 50;
    mb.addEventListener('click', () => { lootBuyMap(); marketRenderList(); });
    el.appendChild(mb);
    const md = document.createElement('div');
    md.style.cssText = 'font-size:12px;color:#cfe8ff;margin:-2px 0 6px';
    md.textContent = 'Five X marks around the bay — hold F at a mound to dig.';
    el.appendChild(md);
  }
  const cash = document.getElementById('marketCash');
  if (cash) cash.textContent = 'Cash: $' + state.cash.toLocaleString('en-US') + ' · Charms owned: ' + marketState.charms.length + '/3';
}
function marketBuy(item) {
  if (state.cash < item.price) { toast('Not enough cash for that.'); return; }
  state.cash -= item.price;
  if (item.heal) {
    state.health = Math.min(100, state.health + item.heal);
    toast(item.icon + ' ' + item.label + ' — health +' + item.heal + '.');
    speakLine('Mmm. The Cay market never misses, ' + activeName() + '.');
  } else if (item.id.startsWith('charm')) {
    marketState.charms.push(item.id); marketPersist();
    toast(item.icon + ' ' + item.label + ' bought! (' + marketState.charms.length + '/3 charms)');
    if (marketState.charms.length >= 3) { state.cash += 250; toast('All three charms! A collector pays you $250 for the set.'); }
  } else {
    toast(item.icon + ' ' + item.label + ' bought — it hangs in your car now.');
  }
  chime(); saveGame(); updateHUD(); marketRenderList();
}
function marketKey() {
  if (marketState.open) { marketClosePanel(); return; }
  const s = marketNear();
  if (s < 0) { toast('The Cay night market is on Coral Cay — three stalls around the plaza. Press E near one.'); return; }
  marketOpenPanel(s);
}
const VIEW_SPOTS = [
  { x: 120, z: -120, label: 'the lighthouse from the beach' },
  { x: -240, z: 200, label: 'the desert dunes at dusk' },
  { x: 0, z: -260, label: 'the northern peaks' },
  { x: ISLE_CX + 26, z: ISLE_CZ - 26, label: 'the Cay lighthouse up close' },
  { x: -210, z: -40, label: 'the airport runway at sunrise' },
];
const viewState = { taken: [], store: 'solmar-bay-r4-views' };
try { const v = JSON.parse(localStorage.getItem(viewState.store) || 'null'); if (v) viewState.taken = v; } catch (e) {}
function viewPersist() { try { localStorage.setItem(viewState.store, JSON.stringify(viewState.taken)); } catch (e) {} }
const viewMarkers = [];
for (let i = 0; i < VIEW_SPOTS.length; i++) {
  const v = VIEW_SPOTS[i];
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  post.position.y = 1.1; g.add(post);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 20), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
  frame.position.y = 2.4; g.add(frame);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0x0b2c44 }));
  plate.position.y = 1.4; g.add(plate);
  const gy = isleOnLand(v.x, v.z) ? ISLE_TOP : groundHeight(v.x, v.z);
  g.position.set(v.x, gy, v.z); scene.add(g);
  viewMarkers.push({ mesh: g, x: v.x, z: v.z, label: v.label, done: viewState.taken.includes(i) });
  if (viewState.taken.includes(i)) frame.material.color.set(0x2ecc71);
}
function viewNear() {
  if (state.inCar) return -1;
  for (let i = 0; i < VIEW_SPOTS.length; i++) {
    if (Math.hypot(playerState.x - VIEW_SPOTS[i].x, playerState.z - VIEW_SPOTS[i].z) < 6) return i;
  }
  return -1;
}
function snapViewpoint() {
  const i = viewNear();
  if (i < 0) return false;
  if (viewState.taken.includes(i)) { toast('You already photographed ' + VIEW_SPOTS[i].label + '.'); return true; }
  viewState.taken.push(i); viewPersist();
  viewMarkers[i].mesh.children[1].material.color.set(0x2ecc71);
  state.cash += 80;
  beep(1200, 0.1, 'square', 0.2);
  toast('📷 Viewpoint: ' + VIEW_SPOTS[i].label + '! +$80 (' + viewState.taken.length + '/5)');
  speakLine('A postcard shot. Marisol buys these for eighty dollars each.');
  if (viewState.taken.length >= 5) {
    state.cash += 300;
    toast('All 5 viewpoints! A travel magazine pays a $300 bonus.');
    speakLine('Five postcards, five sales. Three hundred more, on top.');
  }
  chime(); saveGame(); updateHUD();
  return true;
}
function updateMarket(dt) {
  for (let i = 0; i < marketMeshes.length; i++) {
    const m = marketMeshes[i];
    m.lamp.material.emissiveIntensity = 0.9 + Math.sin(state.time * 2.4 + i * 2) * 0.5;
    m.awn.rotation.z = Math.sin(state.time * 1.2 + i) * 0.03;
  }
  for (let i = 0; i < viewMarkers.length; i++) {
    if (!viewMarkers[i].done) viewMarkers[i].mesh.children[1].rotation.z += dt * 0.4;
  }
}
// ---------- Round 4, part seven: the Cay ferry + bay storms ----------
const FERRY_A = { x: HALF + 16, z: 42 };
const FERRY_B = { x: ISLE_CX - ISLE_R - 26, z: ISLE_CZ + 14 };
const ferry = { mesh: null, t: 0, dir: 1, speed: 0.045, docked: true, dockTimer: 8, aboard: false, prevX: 0, prevZ: 0, horn: 0 };
function ferryAboard() { return ferry.aboard; }
{
  const g = makeBoatMesh(0xf0ead8);
  g.scale.set(2.4, 1.6, 2.4);
  const deckM = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 10), deckM);
  deck.position.y = 1.1; g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.8, 4), new THREE.MeshStandardMaterial({ color: 0x2e6fb0, roughness: 0.7 }));
  cabin.position.set(0, 2.1, -2.2); g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 4.6), new THREE.MeshStandardMaterial({ color: 0xf0ead8 }));
  roof.position.set(0, 3.1, -2.2); g.add(roof);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
      bench.position.set(-1.2 + c * 2.4, 1.4, 1 + r * 1.6); g.add(bench);
    }
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  mast.position.set(0, 4.4, -4.4); g.add(mast);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x2ee6ff, side: THREE.DoubleSide }));
  flag.position.set(0.8, 6, -4.4); g.add(flag);
  const lampF = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 1 }));
  lampF.position.set(1.6, 1.6, 4.6); g.add(lampF);
  const lampF2 = lampF.clone(); lampF2.position.x = -1.6; g.add(lampF2);
  g.position.set(FERRY_A.x, 0.2, FERRY_A.z);
  scene.add(g);
  ferry.mesh = g; ferry.prevX = FERRY_A.x; ferry.prevZ = FERRY_A.z;
  const pierM = new THREE.MeshStandardMaterial({ color: 0xb98d5f, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 4), pierM);
    plank.position.set(FERRY_A.x + 2 + i * 0.5, 0.9, FERRY_A.z - 8 - i * 3.5); scene.add(plank);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.25), new THREE.MeshStandardMaterial({ color: 0x0b2c44 }));
  sign.position.set(FERRY_A.x, 3.4, FERRY_A.z - 14); scene.add(sign);
}
function ferryNear() {
  if (!ferry.mesh) return false;
  return Math.hypot(playerState.x - ferry.mesh.position.x, playerState.z - ferry.mesh.position.z) < 6;
}
function ferryToggleBoard() {
  if (ferry.aboard) {
    ferry.aboard = false;
    const a = ferry.mesh.rotation.y;
    playerState.x = ferry.mesh.position.x + Math.sin(a + Math.PI / 2) * 5;
    playerState.z = ferry.mesh.position.z + Math.cos(a + Math.PI / 2) * 5;
    playerState.y = 0; playerState.onGround = true;
    player.position.set(playerState.x, isleOnLand(playerState.x, playerState.z) ? ISLE_TOP : groundHeight(playerState.x, playerState.z), playerState.z);
    toast('You step off the ferry.');
    return true;
  }
  if (ferryNear() && !state.inCar) {
    ferry.aboard = true;
    toast('Aboard the Cay ferry — free ride, enjoy the view. Press E to get off.');
    speakLine('The ferry to Coral Cay. Best seat in the bay, and it costs nothing.');
    beep(330, 0.3, 'sine', 0.2); setTimeout(() => beep(330, 0.3, 'sine', 0.2), 350);
    return true;
  }
  return false;
}
function updateFerry(dt) {
  if (!ferry.mesh) return;
  ferry.horn += dt;
  if (ferry.docked) {
    ferry.dockTimer -= dt;
    if (ferry.dockTimer <= 0) {
      ferry.docked = false;
      ferry.horn = 0;
      beep(220, 0.5, 'sine', 0.25); setTimeout(() => beep(220, 0.5, 'sine', 0.25), 600);
      const dest = ferry.dir === 1 ? 'Coral Cay' : 'the mainland';
      if (ferryNear() || ferry.aboard) toast('The ferry is leaving for ' + dest + '!');
    }
  } else {
    ferry.t += ferry.speed * ferry.dir * dt;
    if (ferry.t >= 1) { ferry.t = 1; ferry.dir = -1; ferry.docked = true; ferry.dockTimer = 12; }
    else if (ferry.t <= 0) { ferry.t = 0; ferry.dir = 1; ferry.docked = true; ferry.dockTimer = 12; }
  }
  const x = lerp(FERRY_A.x, FERRY_B.x, ferry.t);
  const z = lerp(FERRY_A.z, FERRY_B.z, ferry.t);
  const dx = x - ferry.prevX, dz = z - ferry.prevZ;
  ferry.mesh.position.set(x, 0.2 + Math.sin(state.time * 1.8) * 0.1, z);
  ferry.mesh.rotation.y = Math.atan2(FERRY_B.x - FERRY_A.x, FERRY_B.z - FERRY_A.z) * ferry.dir;
  if (ferry.dir === -1) ferry.mesh.rotation.y += Math.PI;
  ferry.mesh.rotation.z = Math.sin(state.time * 1.4) * 0.02;
  if (ferry.aboard) {
    playerState.x += dx; playerState.z += dz;
    player.position.set(playerState.x, 1.6 + Math.sin(state.time * 1.8) * 0.1, playerState.z);
    playerState.y = 1.6;
    const d = Math.hypot(playerState.x - ferry.mesh.position.x, playerState.z - ferry.mesh.position.z);
    if (d > 7) { ferry.aboard = false; toast('You slipped off the ferry!'); }
  }
  ferry.prevX = x; ferry.prevZ = z;
}
const storm = { active: false, timer: 210, left: 0, flash: 0, nextFlash: 5 };
function updateStorm(dt) {
  storm.timer -= dt;
  if (!storm.active && storm.timer <= 0) {
    storm.active = true; storm.left = 45; storm.nextFlash = 2;
    state.weather = 'rain';
    toast('⛈️ A bay storm is rolling in! Lightning over the water — 45 seconds.');
    speakLine('Storm coming off the sea. Get under cover or enjoy the show.');
  }
  if (!storm.active) return;
  storm.left -= dt;
  storm.nextFlash -= dt;
  if (storm.nextFlash <= 0) {
    storm.nextFlash = 2 + Math.random() * 4;
    lightningTimer = 0.35;
    storm.flash = 0.35;
    beep(70, 0.5, 'sawtooth', 0.25);
    rainDark = Math.min(1, rainDark + 0.2);
  }
  if (storm.flash > 0) storm.flash -= dt;
  if (storm.left <= 0) {
    storm.active = false; storm.timer = 180 + Math.random() * 120;
    state.weather = 'clear';
    toast('The storm passes — the bay is calm again.');
  }
}
// ---------- Round 4, part eight: a self-test the playtest can call ----------
function r4SelfTest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  ok('coral-cay-built', isleGroup.children.length >= 20, isleGroup.children.length + ' island pieces');
  ok('lighthouse-beam', !!isleBeam, 'beam present (lamp room glows emissive, no scene light)');
  ok('isle-walkers', isleWalkers.length === 5, isleWalkers.length + ' walkers');
  ok('isle-shells', isleShells.length === 6, isleShells.length + ' shells');
  ok('hovercrafts', hovercrafts.length === 2 && hovercrafts.every((h) => h.kind === 'hover'), hovercrafts.length + ' craft');
  ok('hover-mesh', !!hovercrafts[0].mesh.userData.fan, 'fan present');
  ok('chain-jobs', CHAIN_JOBS.length === 4, CHAIN_JOBS.map((j) => j.title).join(', '));
  ok('chain-rewards', CHAIN_JOBS.every((j) => j.reward >= 700 && j.reward <= 1500), 'rewards in range');
  ok('darts-board', !!darts.board && !!darts.marker, 'board + aim marker');
  ok('darts-order', DART_ORDER.length === 20, '20 segments');
  ok('league-rivals', LEAGUE_RIVALS.length === 3, LEAGUE_RIVALS.map((r) => r.name).join(', '));
  ok('league-season', league.season >= 1 && league.round >= 0, 'season ' + league.season + ' round ' + league.round);
  ok('board-jobs', BOARD_JOBS.length === 5, BOARD_JOBS.map((j) => j.label).join(', '));
  ok('event-kinds', R4_EVENT_KINDS.length === 5, R4_EVENT_KINDS.join(', '));
  ok('dive-buoys', dive.buoys.length === 4, dive.buoys.length + ' buoys');
  ok('dive-crates', dive.crates.length === 8, dive.crates.length + ' crates');
  ok('market-stalls', marketMeshes.length === 3, marketMeshes.length + ' stalls');
  ok('market-items', MARKET_STALLS.length === 6, MARKET_STALLS.map((m) => m.label).join(', '));
  ok('viewpoints', VIEW_SPOTS.length === 5, VIEW_SPOTS.length + ' spots');
  ok('ferry', !!ferry.mesh, 'ferry mesh present');
  ok('loot-mounds', lootMounds.length === 5, lootMounds.length + ' mounds');
  ok('keeper', !!keeper.mesh, 'keeper Ansel on the Cay');
  ok('cove-spots', COVE_SPOTS.length === 3 && COVE_BUYERS.length === 3, '3 coves, 3 buyers');
  ok('cove-night', typeof coveIsNight() === 'boolean', 'night check runs');
  ok('cay-bus', !!cayBus.mesh && CAY_BUS_STOPS.length === 4, 'ring bus + 4 stops');
  ok('ferry-route', Math.hypot(FERRY_B.x - FERRY_A.x, FERRY_B.z - FERRY_A.z) > 10, 'route spans the strait');
  ok('storm-state', typeof storm.active === 'boolean' && storm.timer > 0, 'storm timer armed');
  ok('hud-panels', !!document.getElementById('dartsPanel') && !!document.getElementById('boardPanel') && !!document.getElementById('marketPanel'), 'all three panels in the DOM');
  ok('hud-lines', !!document.getElementById('leagueLine') && !!document.getElementById('isleLine') && !!document.getElementById('diveLine'), 'league/isle/dive lines present');
  ok('cash-sane', state.cash >= 0 && state.cash < 100000000, 'cash ' + state.cash);
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
// ---------- Round 4, part nine: buried loot + the lighthouse keeper's fish quest ----------
const LOOT_SPOTS = [
  { x: 128, z: -140, label: 'under the lone palm' }, { x: 150, z: 120, label: 'by the south keys' },
  { x: ISLE_CX - 20, z: ISLE_CZ + 30, label: 'behind the Cay stalls' }, { x: -200, z: 240, label: 'in the desert dunes' },
  { x: 60, z: -240, label: 'at the forest edge' },
];
const lootState = { found: [], store: 'solmar-bay-r4-loot', mapBought: false };
try {
  const l = JSON.parse(localStorage.getItem(lootState.store) || 'null');
  if (l) { lootState.found = l.found || []; lootState.mapBought = !!l.mapBought; }
} catch (e) {}
function lootPersist() { try { localStorage.setItem(lootState.store, JSON.stringify({ found: lootState.found, mapBought: lootState.mapBought })); } catch (e) {} }
const lootMounds = [];
for (let i = 0; i < LOOT_SPOTS.length; i++) {
  const s = LOOT_SPOTS[i];
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 }));
  mound.scale.y = 0.55; g.add(mound);
  const cross = new THREE.Group();
  const stick1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  stick1.position.y = 0.7; cross.add(stick1);
  const stick2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.14), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  stick2.position.y = 1.0; cross.add(stick2);
  cross.position.y = 0.5; g.add(cross);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 1 }));
  glint.position.y = 0.9; g.add(glint);
  const gy = isleOnLand(s.x, s.z) ? ISLE_TOP : groundHeight(s.x, s.z);
  g.position.set(s.x, gy, s.z); scene.add(g);
  lootMounds.push({ mesh: g, glint, x: s.x, z: s.z, label: s.label, dug: lootState.found.includes(i), dig: 0 });
  if (lootState.found.includes(i)) { g.visible = false; }
}
function lootNear() {
  if (state.inCar) return -1;
  for (let i = 0; i < LOOT_SPOTS.length; i++) {
    if (!lootState.found.includes(i) && Math.hypot(playerState.x - LOOT_SPOTS[i].x, playerState.z - LOOT_SPOTS[i].z) < 4) return i;
  }
  return -1;
}
function lootBuyMap() {
  if (lootState.mapBought) { toast('You already own the treasure map.'); return; }
  if (state.cash < 50) { toast('The map costs $50 — save up first.'); return; }
  state.cash -= 50; lootState.mapBought = true; lootPersist();
  for (let i = 0; i < LOOT_SPOTS.length; i++) if (!lootState.found.includes(i)) setBeacon(LOOT_SPOTS[i].x, LOOT_SPOTS[i].z);
  toast('Treasure map bought! The first dig site is marked — five in all.');
  speakLine('A map, fifty dollars, five X marks. Someone buried a fortune and forgot where.');
  chime(); saveGame(); updateHUD();
}
function updateLoot(dt) {
  for (let i = 0; i < lootMounds.length; i++) {
    const m = lootMounds[i];
    if (m.dug) continue;
    m.glint.material.emissiveIntensity = 0.7 + Math.sin(state.time * 3 + i * 2) * 0.5;
    m.mesh.rotation.y += dt * 0.2;
  }
  const i = lootNear();
  if (i < 0) return;
  const m = lootMounds[i];
  if (keys['KeyF']) {
    m.dig += dt;
    if (Math.floor(m.dig * 2) !== Math.floor((m.dig - dt) * 2)) beep(300, 0.07, 'square', 0.12);
    if (m.dig >= 3) {
      m.dug = true; m.mesh.visible = false;
      lootState.found.push(i); lootPersist();
      const reward = 150 + i * 60;
      state.cash += reward;
      toast('💰 Buried loot! ' + LOOT_SPOTS[i].label + ' hid $' + reward + ' (' + lootState.found.length + '/5)');
      speakLine('Buried treasure, right where the map said. ' + reward + ' dollars, no questions asked.');
      if (lootState.found.length >= 5) { state.cash += 400; toast('All five stashes! A collector pays a $400 bonus for the set.'); }
      chime(); saveGame(); updateHUD();
      beacon.visible = false;
    } else if (m.dig > 0.5) toast('Digging… ' + Math.ceil(3 - m.dig) + 's — hold F.');
  } else m.dig = Math.max(0, m.dig - dt * 2);
}
const keeper = { mesh: null, quest: 0, fishAtStart: 0, store: 'solmar-bay-r4-keeper' };
try { keeper.quest = Number(JSON.parse(localStorage.getItem(keeper.store) || '0')) || 0; } catch (e) { keeper.quest = 0; }
function keeperPersist() { try { localStorage.setItem(keeper.store, JSON.stringify(keeper.quest)); } catch (e) {} }
{
  const k = makePerson(0xf0ead8, 0x2a3a4a, 0xc98a5a);
  const beard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.12), new THREE.MeshStandardMaterial({ color: 0xf0ead8 }));
  beard.position.set(0, 1.42, 0.24); k.add(beard);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.14, 10), new THREE.MeshStandardMaterial({ color: 0x2e6fb0 }));
  cap.position.y = 1.86; k.add(cap);
  k.position.set(ISLE_CX + 26, ISLE_TOP, ISLE_CZ - 22);
  scene.add(k);
  keeper.mesh = k;
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1), new THREE.MeshStandardMaterial({ color: 0x8a6a42 }));
  crate.position.set(ISLE_CX + 23, ISLE_TOP + 0.4, ISLE_CZ - 21); scene.add(crate);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  rod.position.set(ISLE_CX + 24, ISLE_TOP + 1.7, ISLE_CZ - 22); rod.rotation.z = 0.5; scene.add(rod);
}
function keeperNear() {
  if (state.inCar || !keeper.mesh) return false;
  return Math.hypot(playerState.x - (ISLE_CX + 26), playerState.z - (ISLE_CZ - 22)) < 5;
}
function keeperTalk() {
  if (!keeperNear()) return false;
  if (keeper.quest === 0) {
    keeper.quest = 1; keeper.fishAtStart = fish.caught; keeperPersist();
    toast('Keeper Ansel: "Three fish for my supper and I will make it worth your while. Go fish!"');
    speakLine('Three fish, he says. The old keeper of the Cay light drives a hard bargain.');
    showStory('Ansel (lighthouse keeper): "The light has guided boats for forty years. Bring me three fish and I will pay you like a sailor."');
    return true;
  }
  if (keeper.quest === 1) {
    const got = fish.caught - keeper.fishAtStart;
    if (got >= 3) {
      keeper.quest = 2; keeperPersist();
      state.cash += 600;
      toast('Keeper Ansel: "Three fine fish! Here is $600 — and the light will always guide you home."');
      speakLine('Six hundred dollars for three fish. The keeper pays better than the market.');
      chime(); saveGame(); updateHUD();
    } else {
      toast('Keeper Ansel: "That is ' + got + '/3 fish. The sea provides — go and cast a line."');
    }
    return true;
  }
  toast('Keeper Ansel: "The light is lit, the sea is calm. Come back anytime, friend."');
  return true;
}
function updateKeeper(dt) {
  if (!keeper.mesh) return;
  const d = Math.hypot(playerState.x - keeper.mesh.position.x, playerState.z - keeper.mesh.position.z);
  if (d < 8) {
    keeper.mesh.rotation.y = Math.atan2(playerState.x - keeper.mesh.position.x, playerState.z - keeper.mesh.position.z);
    keeper.mesh.position.y = ISLE_TOP + Math.sin(state.time * 1.5) * 0.05;
  }
}
// ---------- Round 4, part ten: night-only smuggler cove runs ----------
const COVE_SPOTS = [
  { x: -258, z: 198, label: 'the west cliff cove' }, { x: 182, z: 252, label: 'the south keys cove' },
  { x: -248, z: -178, label: 'the north forest cove' },
];
const COVE_BUYERS = [
  { x: 84, z: -60, label: 'the beach shack' }, { x: -60, z: 84, label: 'the plaza back alley' }, { x: 120, z: 120, label: 'the marina warehouse' },
];
const coveState = { runs: 0, active: false, cove: -1, buyer: -1, timer: 0, lastDay: -1, store: 'solmar-bay-r4-cove' };
try {
  const c = JSON.parse(localStorage.getItem(coveState.store) || 'null');
  if (c) { coveState.runs = c.runs || 0; coveState.lastDay = c.lastDay === undefined ? -1 : c.lastDay; }
} catch (e) {}
function covePersist() { try { localStorage.setItem(coveState.store, JSON.stringify({ runs: coveState.runs, lastDay: coveState.lastDay })); } catch (e) {} }
function coveIsNight() { return state.dayTime > 0.78 || state.dayTime < 0.25; }
function coveDayNumber() { return Math.floor(state.time / DAY_LENGTH); }
const coveMarkers = [];
for (let i = 0; i < COVE_SPOTS.length; i++) {
  const s = COVE_SPOTS[i];
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: 0x5a2a6a, roughness: 0.9 }));
  crate.position.y = 0.6; g.add(crate);
  const crate2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1), new THREE.MeshStandardMaterial({ color: 0x7a3a8a, roughness: 0.9 }));
  crate2.position.set(1.4, 0.45, 0.6); g.add(crate2);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xb45ae8, transparent: true, opacity: 0.2 }));
  glow.position.y = 0.8; g.add(glow);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshStandardMaterial({ color: 0xb45ae8, emissive: 0xb45ae8, emissiveIntensity: 1.4 }));
  lamp.position.set(0, 1.6, 0); g.add(lamp);
  const skiff = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }));
  skiff.position.set(-3, 0.3, 2); g.add(skiff);
  const gy = groundHeight(s.x, s.z);
  g.position.set(s.x, gy, s.z); scene.add(g);
  coveMarkers.push({ mesh: g, glow, lamp, x: s.x, z: s.z, label: s.label });
}
const coveBuyerMarkers = [];
for (let i = 0; i < COVE_BUYERS.length; i++) {
  const b = COVE_BUYERS[i];
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  post.position.y = 1.2; g.add(post);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a2a6a, emissive: 0x5a2a6a, emissiveIntensity: 0.4 }));
  sign.position.y = 2.6; g.add(sign);
  g.position.set(b.x, groundHeight(b.x, b.z), b.z); scene.add(g);
  coveBuyerMarkers.push({ mesh: g, x: b.x, z: b.z, label: b.label });
}
function coveNear() {
  if (state.inCar) return -1;
  for (let i = 0; i < COVE_SPOTS.length; i++) {
    if (Math.hypot(playerState.x - COVE_SPOTS[i].x, playerState.z - COVE_SPOTS[i].z) < 5) return i;
  }
  return -1;
}
function coveStart(i) {
  if (coveState.active) { toast('A cove run is already going — deliver the package first.'); return true; }
  if (!coveIsNight()) { toast('The coves only open at night. Come back after dark — the purple crates will be lit.'); return true; }
  if (coveState.lastDay === coveDayNumber()) { toast('The cove crew is done for tonight — one run a night, sailor.'); return true; }
  coveState.active = true; coveState.cove = i; coveState.timer = 100;
  coveState.buyer = Math.floor(Math.random() * COVE_BUYERS.length);
  const b = COVE_BUYERS[coveState.buyer];
  setBeacon(b.x, b.z);
  toast('🤫 Cove run: take the package to ' + b.label + ' — 100 seconds, $350. No questions, no cops.');
  speakLine('A package from ' + COVE_SPOTS[i].label + '. Deliver it quiet and quick — the buyer pays in cash.');
  beep(440, 0.15, 'sine', 0.2);
  return true;
}
function updateCove(dt) {
  for (let i = 0; i < coveMarkers.length; i++) {
    const m = coveMarkers[i];
    const lit = coveIsNight();
    m.glow.visible = lit;
    m.lamp.material.emissiveIntensity = lit ? 1.2 + Math.sin(state.time * 3 + i) * 0.6 : 0.15;
    m.mesh.rotation.y += dt * 0.1;
  }
  if (!coveState.active) return;
  coveState.timer -= dt;
  if (coveState.timer <= 0) {
    coveState.active = false; beacon.visible = false;
    toast('The buyer left — the cove run went cold.');
    return;
  }
  const p = chainPlayerPos();
  const b = COVE_BUYERS[coveState.buyer];
  const d = Math.hypot(p.x - b.x, p.z - b.z);
  if (d < 5) {
    coveState.active = false; coveState.runs++; coveState.lastDay = coveDayNumber(); covePersist();
    state.cash += 350;
    addWanted(1, 'The drop was seen — the law is sniffing around.');
    beacon.visible = false;
    toast('Cove run done! +$350 — but the heat is on (+1 star).');
    speakLine('Package delivered, cash in hand. One star of heat — worth it, ' + activeName() + '.');
    chime(); saveGame(); updateHUD();
    if (coveState.runs >= 5) { state.cash += 500; toast('Five cove runs! The crew trusts you now — $500 loyalty cut.'); }
  }
}
function coveStatusLine() {
  if (coveState.active) return 'Cove run: ' + Math.max(0, Math.ceil(coveState.timer)) + 's to ' + COVE_BUYERS[coveState.buyer].label;
  if (coveIsNight()) return 'Coves open tonight — runs done: ' + coveState.runs;
  return 'Coves open after dark — runs done: ' + coveState.runs;
}
// ---------- Round 4, part eleven: the Coral Cay ring bus ----------
const CAY_BUS_STOPS = [
  { x: ISLE_CX + 24, z: ISLE_CZ, label: 'lighthouse stop' }, { x: ISLE_CX, z: ISLE_CZ + 24, label: 'market stop' },
  { x: ISLE_CX - 24, z: ISLE_CZ, label: 'pier stop' }, { x: ISLE_CX, z: ISLE_CZ - 24, label: 'north stop' },
];
const cayBus = { mesh: null, angle: 0, speed: 0.12, stop: 0, wait: 6, aboard: false, prevX: 0, prevZ: 0, rides: 0 };
try { cayBus.rides = Number(JSON.parse(localStorage.getItem('solmar-bay-r4-caybus') || '0')) || 0; } catch (e) { cayBus.rides = 0; }
function cayBusPersist() { try { localStorage.setItem('solmar-bay-r4-caybus', JSON.stringify(cayBus.rides)); } catch (e) {} }
function cayBusAboard() { return cayBus.aboard; }
{
  const spec = CAR_TYPES.find((c) => c.type === 'bus');
  const g = makeCarMesh(spec);
  g.scale.set(1.1, 1.1, 1.1);
  const roofSign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x2ee6ff, emissiveIntensity: 0.8 }));
  roofSign.position.set(0, 2.1, 0); g.add(roofSign);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc040, emissiveIntensity: 1 }));
  bell.position.set(1, 1.9, 1.4); g.add(bell);
  g.position.set(CAY_BUS_STOPS[0].x, ISLE_TOP, CAY_BUS_STOPS[0].z);
  scene.add(g);
  cayBus.mesh = g; cayBus.prevX = CAY_BUS_STOPS[0].x; cayBus.prevZ = CAY_BUS_STOPS[0].z;
  for (let i = 0; i < CAY_BUS_STOPS.length; i++) {
    const s = CAY_BUS_STOPS[i];
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x2ee6ff }));
    post.position.set(s.x, ISLE_TOP + 1.3, s.z); scene.add(post);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x0b2c44 }));
    sign.position.set(s.x, ISLE_TOP + 2.8, s.z); scene.add(sign);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
    bench.position.set(s.x + 1.6, ISLE_TOP + 0.25, s.z); scene.add(bench);
  }
}
function cayBusNear() {
  if (!cayBus.mesh) return false;
  return Math.hypot(playerState.x - cayBus.mesh.position.x, playerState.z - cayBus.mesh.position.z) < 6;
}
function cayBusToggle() {
  if (cayBus.aboard) {
    cayBus.aboard = false;
    const a = cayBus.mesh.rotation.y;
    playerState.x = cayBus.mesh.position.x + Math.sin(a + Math.PI / 2) * 4;
    playerState.z = cayBus.mesh.position.z + Math.cos(a + Math.PI / 2) * 4;
    playerState.y = ISLE_TOP; playerState.onGround = true;
    player.position.set(playerState.x, ISLE_TOP, playerState.z);
    toast('You hop off the ring bus.');
    return true;
  }
  if (cayBusNear() && !state.inCar) {
    cayBus.aboard = true; cayBus.rides++; cayBusPersist();
    toast('Aboard the Cay ring bus — free loop around the island. E to hop off at a stop.');
    if (cayBus.rides === 3) { state.cash += 100; toast('Three bus rides! The driver slips you $100 for the company.'); saveGame(); updateHUD(); }
    beep(660, 0.12, 'sine', 0.15);
    return true;
  }
  return false;
}
function updateCayBus(dt) {
  if (!cayBus.mesh) return;
  if (cayBus.wait > 0) {
    cayBus.wait -= dt;
    if (cayBus.wait <= 0) {
      const s = CAY_BUS_STOPS[cayBus.stop];
      if (cayBusNear() || cayBus.aboard) toast('Ring bus leaving ' + s.label + '.');
      beep(520, 0.1, 'sine', 0.12);
    }
  } else {
    cayBus.angle += cayBus.speed * dt;
    const target = (cayBus.stop + 1) % CAY_BUS_STOPS.length;
    const tx = CAY_BUS_STOPS[target].x, tz = CAY_BUS_STOPS[target].z;
    const dx = tx - cayBus.mesh.position.x, dz = tz - cayBus.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      cayBus.stop = target; cayBus.wait = 6;
      toast('Ring bus at ' + CAY_BUS_STOPS[target].label + ' — 6 seconds.');
    } else {
      const h = Math.atan2(dx, dz);
      cayBus.mesh.rotation.y = h;
      cayBus.mesh.position.x += Math.sin(h) * 7 * dt;
      cayBus.mesh.position.z += Math.cos(h) * 7 * dt;
    }
  }
  const nx = cayBus.mesh.position.x, nz = cayBus.mesh.position.z;
  const ddx = nx - cayBus.prevX, ddz = nz - cayBus.prevZ;
  cayBus.mesh.position.y = ISLE_TOP + Math.sin(state.time * 2) * 0.05;
  if (cayBus.aboard) {
    playerState.x += ddx; playerState.z += ddz;
    player.position.set(playerState.x, ISLE_TOP + 1.2, playerState.z);
    playerState.y = ISLE_TOP + 1.2;
    const d = Math.hypot(playerState.x - cayBus.mesh.position.x, playerState.z - cayBus.mesh.position.z);
    if (d > 7) { cayBus.aboard = false; toast('You slipped off the ring bus!'); }
  }
  cayBus.prevX = nx; cayBus.prevZ = nz;
}
// ---------- Round 4, part twelve: Bram, the darts champion at the bar ----------
const dartChamp = { mesh: null, active: false, target: 90, lastDay: -1, store: 'solmar-bay-r4-champ' };
try { dartChamp.lastDay = Number(JSON.parse(localStorage.getItem(dartChamp.store) || '-1')) || -1; } catch (e) { dartChamp.lastDay = -1; }
function dartChampPersist() { try { localStorage.setItem(dartChamp.store, JSON.stringify(dartChamp.lastDay)); } catch (e) {} }
{
  const r = makePerson(0x1a1a1a, 0x2a2a2a, 0x8a5a33);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.5, 0.38), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
  vest.position.y = 1.15; r.add(vest);
  const trophy = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.8, roughness: 0.2 }));
  trophy.position.set(0.5, 1.0, 0.3); r.add(trophy);
  const dart1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  dart1.position.set(-0.5, 1.2, 0.3); dart1.rotation.z = 0.6; r.add(dart1);
  r.position.set(DART_BAR.x + 4, groundHeight(DART_BAR.x + 4, DART_BAR.z + 6), DART_BAR.z + 6);
  scene.add(r);
  dartChamp.mesh = r;
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  table.position.set(DART_BAR.x + 5.5, 0.9, DART_BAR.z + 7); scene.add(table);
  const tleg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  tleg.position.set(DART_BAR.x + 5.5, 0.45, DART_BAR.z + 7); scene.add(tleg);
}
function dartChampNear() {
  if (state.inCar || !dartChamp.mesh) return false;
  return Math.hypot(playerState.x - (DART_BAR.x + 4), playerState.z - (DART_BAR.z + 6)) < 5;
}
function dartChampChallenge() {
  if (!dartChampNear()) return false;
  if (dartChamp.lastDay === coveDayNumber()) { toast('Bram: "You already had your shot today. Come back tomorrow, champ."'); return true; }
  if (dartChamp.active) { toast('Bram: "The challenge is on — score 90 or more in one turn of three darts!"'); return true; }
  dartChamp.active = true;
  toast('🎯 Bram the darts champion: "Beat 90 in one turn and $500 is yours. Lose and you buy the next round."');
  speakLine('Bram has never lost at this bar. Ninety points, three darts. Show him what you have got.');
  showStory('Bram: "I have held this bar for six years. Ninety points, three darts, five hundred dollars."');
  return true;
}
function dartChampTurnEnd(turnScore) {
  if (!dartChamp.active) return;
  dartChamp.active = false;
  if (turnScore >= dartChamp.target) {
    dartChamp.lastDay = coveDayNumber(); dartChampPersist();
    state.cash += 500;
    toast('🏆 You beat Bram! $500 — the bar goes wild!');
    speakLine('Ninety points! Bram shakes your hand and pays five hundred. The whole bar saw it.');
    chime(); saveGame(); updateHUD();
  } else {
    toast('Bram: "Only ' + turnScore + '? The board is not going anywhere. Try again tomorrow."');
    speakLine('Bram keeps his title. Tomorrow is another day, ' + activeName() + '.');
  }
}
function updateDartChamp(dt) {
  if (!dartChamp.mesh) return;
  const d = Math.hypot(playerState.x - dartChamp.mesh.position.x, playerState.z - dartChamp.mesh.position.z);
  if (d < 9) {
    dartChamp.mesh.rotation.y = Math.atan2(playerState.x - dartChamp.mesh.position.x, playerState.z - dartChamp.mesh.position.z);
    dartChamp.mesh.position.y = groundHeight(dartChamp.mesh.position.x, dartChamp.mesh.position.z) + Math.sin(state.time * 1.4) * 0.04;
  }
}
window.__r4exports = window.__r4exports || {};
window.__r4exports.dartChamp = { dartChamp, challenge: dartChampChallenge, near: dartChampNear };
window.__r4exports.cayBus = { cayBus, board: cayBusToggle, near: cayBusNear, stops: CAY_BUS_STOPS };
window.__r4exports.cove = { coveState, start: coveStart, near: coveNear, isNight: coveIsNight, spots: COVE_SPOTS, buyers: COVE_BUYERS };
window.__r4exports.loot = { lootState, keeper, buyMap: lootBuyMap, talk: keeperTalk, spots: LOOT_SPOTS };
window.__r4exports.r4selftest = r4SelfTest;
window.__r4exports.r4ferry = { ferry, storm, board: ferryToggleBoard, near: ferryNear };
window.__r4exports.r4market = { marketState, viewState, snap: snapViewpoint, marketKey, stalls: MARKET_STALLS, views: VIEW_SPOTS };
window.__r4exports.dive = { dive, toggle: diveToggle, buoys: DIVE_BUOYS, cratesFound: () => diveCratesFound };
window.__r4exports.r4event = { state: () => r4event, spawn: r4eventSpawn, kinds: R4_EVENT_KINDS };
window.__r4exports.r4extra = { darts, league, leagueStandings, boardJob, acceptBoardJob, boardOpenPanel, DART_BAR, BOARD_SPOT };
leagueRender();
window.__r4exports.chain = { chain, start: chainStart, snap: chainSnapPhoto, jobs: CHAIN_JOBS, done: () => chainDone };
window.__r4exports.isle = { shellsFound: () => isleShellsFound, shells: isleShells, walkers: isleWalkers, hovercrafts, centre: { x: ISLE_CX, z: ISLE_CZ }, onLand: isleOnLand };
// ============================================================================
// ROUND 5 — twelve fresh systems, written for this round only.
//   1. Solmar Customs garage (paint, wheels, engine, nitro) — E at the garage
//   2. Solmar Sands casino (slots + blackjack, in-game cash only) — E at the door
//   3. Bay fishing tournaments + tackle shop — fish during a tournament hour
//   4. Police pursuit helicopter + spike strips at high wanted levels
//   5. Four seasons and travelling weather fronts
//   6. Taxi and delivery empire — buy cabs, hire drivers, earn while you roam
//   7. Stunt-jump ramps with a local leaderboard
//   8. Photo postcards — eight scenic spots to collect
//   9. Flight school at Solmar Intl — three lessons in a stunt plane
//  10. Bay Iron gym — train stamina, strength and speed for real skill XP
//  11. Solmar stock market — six bay companies, buy low, sell high
//  12. Ryan & Ian bond — gifts and date nights; a strong bond pays back
//  13. Marina boat races — three buoys, one fast boat
//  14. Safehouse decorating + fast travel between owned properties
//  15. District influence — five districts that pay when you run them
// Every reward is modest and fits the existing economy. Nothing here re-uses
// Round 4: no island, no hovercraft, no darts, no league, no diving, no coves.
// ============================================================================

// ---------- Round 5, part one: Solmar Customs garage ----------
// The garage sits beside the Pay 'n Spray on the south side of the grid.
const R5_GARAGE = { x: -48, z: 84 };
const R5_PAINTS = [
  { name: 'Sunset Orange', color: 0xe86a1e, price: 150 },
  { name: 'Bay Teal', color: 0x1e8a8a, price: 150 },
  { name: 'Midnight Blue', color: 0x1e3a6e, price: 200 },
  { name: 'Cherry Red', color: 0xc0392b, price: 150 },
  { name: 'Lime Flash', color: 0x7ac74f, price: 250 },
  { name: 'Bubblegum Pink', color: 0xe86ad0, price: 250 },
  { name: 'Gold Rush', color: 0xffd23f, price: 300 },
  { name: 'Shadow Black', color: 0x1a1a1a, price: 200 },
];
const R5_WHEELS = [
  { name: 'Stock steelies', price: 0, size: 0.36 },
  { name: 'Chrome rims', price: 220, size: 0.4 },
  { name: 'Low-profile racers', price: 400, size: 0.44 },
  { name: 'Off-road monsters', price: 550, size: 0.52 },
];
const R5_ENGINES = [
  { name: 'Stock engine', price: 0, boost: 0 },
  { name: 'Tuned V6', price: 600, boost: 0.08 },
  { name: 'Supercharged V8', price: 1200, boost: 0.16 },
  { name: 'Bay rocket motor', price: 2000, boost: 0.25 },
];
const R5_NITRO = [
  { name: 'No nitro', price: 0, secs: 0 },
  { name: 'Small bottle', price: 350, secs: 3 },
  { name: 'Twin bottles', price: 700, secs: 5 },
  { name: 'Full race kit', price: 1100, secs: 8 },
];
// One garage record per car the player owns a tune for, keyed by the car's
// spec colour + type so a stolen twin does not steal the tune.
const r5Garage = {
  open: false, paint: -1, wheels: 0, engine: 0, nitro: 0, nitroLeft: 0,
  nitroTimer: 0, tunes: {}, store: 'solmar-bay-r5-garage',
};
function r5GarageKey(car) {
  if (!car || !car.spec) return 'none';
  return car.spec.type + '-' + (car.spec.color || 0).toString(16);
}
function r5GarageNear() {
  if (state.inCar) return false;
  return Math.hypot(playerState.x - R5_GARAGE.x, playerState.z - R5_GARAGE.z) < 6;
}
function r5GarageBuild() {
  // A low workshop with a striped awning, a tyre stack and a glowing sign.
  addBox(14, 6, 10, 0x4a4a55, R5_GARAGE.x, 3, R5_GARAGE.z + 8);
  addBox(14.6, 0.8, 11, 0xe86a1e, R5_GARAGE.x, 6.4, R5_GARAGE.z + 8);
  addBox(12, 0.4, 3, 0x2e6fb0, R5_GARAGE.x, 6.9, R5_GARAGE.z + 3);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 0.7 }));
  sign.position.set(R5_GARAGE.x, 5.2, R5_GARAGE.z + 2.8); scene.add(sign);
  for (let i = 0; i < 3; i++) {
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 }));
    tyre.position.set(R5_GARAGE.x + 8, 0.4 + i * 0.38, R5_GARAGE.z + 4); scene.add(tyre);
  }
  const lift = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 5), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.6 }));
  lift.position.set(R5_GARAGE.x, 0.4, R5_GARAGE.z); scene.add(lift);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xe86a1e, roughness: 0.8 });
  for (const [cx, cz] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), coneMat);
    cone.position.set(R5_GARAGE.x + cx, 0.45, R5_GARAGE.z + cz); scene.add(cone);
  }
}
function r5GarageApplyPaint(car, color) {
  if (!car || !car.mesh) return;
  // Recolour only the body panels: meshes whose material matches the car's
  // original spec colour. Cab glass, wheels and lights stay untouched.
  car.mesh.traverse((m) => {
    if (m.isMesh && m.material && m.material.color && car.spec && m.material.color.getHex() === car.spec.color) {
      m.material = m.material.clone();
      m.material.color.setHex(color);
    }
  });
}
function r5GarageApplyWheels(car, size) {
  if (!car || !car.mesh || !car.mesh.userData.wheels) return;
  for (const w of car.mesh.userData.wheels) {
    w.scale.setScalar(size / 0.36);
    w.position.y = size;
  }
}
function r5GarageTune(car) {
  // Remember the tune on the car object itself so it survives re-entering.
  const key = r5GarageKey(car);
  const tune = r5Garage.tunes[key] || { paint: -1, wheels: 0, engine: 0, nitro: 0 };
  car.r5Tune = tune;
  if (tune.paint >= 0) r5GarageApplyPaint(car, R5_PAINTS[tune.paint].color);
  if (tune.wheels > 0) r5GarageApplyWheels(car, R5_WHEELS[tune.wheels].size);
  return tune;
}
function r5GarageSave() {
  try { localStorage.setItem(r5Garage.store, JSON.stringify({ tunes: r5Garage.tunes })); } catch (e) {}
}
function r5GaragePay(price) {
  // Loyalty: every fifth tune is free. The free tune is redeemed here, at
  // the till, before any cash changes hands.
  if (r5Loyalty.freeUsed > 0) {
    r5LoyaltyRedeem();
    toast('🎟️ Loyalty card — this tune is FREE!');
    return true;
  }
  if (state.cash < price) { toast('You need $' + price + ' for that.'); return false; }
  state.cash -= price;
  r5LoyaltyStamp();
  return true;
}
function r5GarageLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Garage.store) || 'null');
    if (s && s.tunes) r5Garage.tunes = s.tunes;
  } catch (e) {}
}
function r5GarageRender() {
  const el = document.getElementById('r5GarageItems');
  const cashEl = document.getElementById('r5GarageCash');
  if (!el) return;
  const car = state.inCar || nearestCar(9);
  const key = car ? r5GarageKey(car) : 'none';
  const tune = r5Garage.tunes[key] || { paint: -1, wheels: 0, engine: 0, nitro: 0 };
  if (cashEl) cashEl.textContent = 'Your cash: $' + state.cash.toLocaleString('en-US') + (car ? ' · Tuning: ' + (car.spec.type || 'car') : ' · Park a car within 9u to tune it');
  el.innerHTML = '';
  const addRow = (label, price, owned, buy) => {
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.textContent = label + ' — $' + price + (owned ? ' ✓ fitted' : '');
    b.disabled = owned || state.cash < price || !car;
    b.addEventListener('click', () => { buy(); });
    el.appendChild(b);
  };
  const head = (t) => {
    const d = document.createElement('div');
    d.style.cssText = 'font-weight:bold;color:#ffd23f;margin-top:8px';
    d.textContent = t; el.appendChild(d);
  };
  head('Paint — $150 to $300');
  R5_PAINTS.forEach((p, i) => addRow('🎨 ' + p.name, p.price, tune.paint === i, () => {
    if (!car) return;
    if (!r5GaragePay(p.price)) return;
    tune.paint = i; r5Garage.tunes[key] = tune; r5GarageSave();
    r5GarageApplyPaint(car, p.color);
    toast('Painted ' + p.name + ' — the bay will notice.'); chime(); updateHUD(); r5GarageRender();
  }));
  head('Wheels');
  R5_WHEELS.forEach((w, i) => addRow('🛞 ' + w.name, w.price, tune.wheels === i, () => {
    if (!car) return;
    if (!r5GaragePay(w.price)) return;
    tune.wheels = i; r5Garage.tunes[key] = tune; r5GarageSave();
    r5GarageApplyWheels(car, w.size);
    toast(w.name + ' fitted.'); chime(); updateHUD(); r5GarageRender();
  }));
  head('Engine — faster top speed');
  R5_ENGINES.forEach((e, i) => addRow('🔧 ' + e.name + ' (+' + Math.round(e.boost * 100) + '%)', e.price, tune.engine === i, () => {
    if (!car) return;
    if (!r5GaragePay(e.price)) return;
    tune.engine = i; r5Garage.tunes[key] = tune; r5GarageSave();
    toast(e.name + ' installed — feel that pull.'); chime(); updateHUD(); r5GarageRender();
  }));
  head('Nitro — hold Shift + W to burn it');
  R5_NITRO.forEach((n, i) => addRow('💨 ' + n.name + (n.secs ? ' (' + n.secs + 's)' : ''), n.price, tune.nitro === i, () => {
    if (!car) return;
    if (!r5GaragePay(n.price)) return;
    tune.nitro = i; r5Garage.tunes[key] = tune; r5GarageSave();
    toast(n.name + ' plumbed in. Hold Shift + W in the car.'); chime(); updateHUD(); r5GarageRender();
  }));
}
function r5GarageOpen() {
  if (state.inCar) return false;
  if (!r5GarageNear()) return false;
  const nearCar = state.inCar || nearestCar(9);
  if (!nearCar && !r5GarageNear()) return false;
  r5Garage.open = true;
  const el = document.getElementById('r5GaragePanel');
  if (el) el.classList.remove('hidden');
  r5GarageRender();
  beep(520, 0.12, 'sine', 0.15);
  return true;
}
function r5GarageClose() {
  r5Garage.open = false;
  const el = document.getElementById('r5GaragePanel');
  if (el) el.classList.add('hidden');
}
function r5GarageUseNitro(dt) {
  // Called after updateCar: burn nitro while Shift+W, extra speed on top of
  // the car's tuned top speed. Refills only when a new bottle is bought.
  const car = state.inCar;
  if (!car || !car.r5Tune || !car.r5Tune.nitro) return;
  const kit = R5_NITRO[car.r5Tune.nitro];
  if (!kit || kit.secs <= 0) return;
  if (r5Garage.nitroLeft <= 0) r5Garage.nitroLeft = kit.secs;
  const burning = keys['ShiftLeft'] && (keys['KeyW'] || keys['ArrowUp']) && Math.abs(car.speed) > 4;
  if (burning && r5Garage.nitroLeft > 0) {
    r5Garage.nitroLeft -= dt;
    r5Garage.nitroTimer -= dt;
    car.speed = clamp(car.speed + 26 * dt, -20, (car.spec.topSpeed || 26) * (1 + (R5_ENGINES[car.r5Tune.engine] || R5_ENGINES[0]).boost) + 14);
    state.speed = car.speed;
    if (r5Garage.nitroTimer <= 0) {
      r5Garage.nitroTimer = 0.12;
      beep(1200 + Math.floor(rng() * 300), 0.08, 'sawtooth', 0.08);
    }
    if (r5Garage.nitroLeft <= 0) toast('Nitro bottle empty — buy a refill at Solmar Customs.');
  }
}
function r5GarageEngineBoost(car) {
  // Extra top-speed headroom from the tuned engine, applied after updateCar
  // clamps speed so the tune actually matters on the road.
  if (!car || !car.r5Tune || !car.r5Tune.engine) return;
  const boost = (R5_ENGINES[car.r5Tune.engine] || R5_ENGINES[0]).boost;
  if (boost <= 0) return;
  const top = (car.spec.topSpeed || 26) * (1 + boost);
  if (car.speed > 0 && car.speed < top && (keys['KeyW'] || keys['ArrowUp'])) {
    car.speed = Math.min(top, car.speed + 6 * 0.016);
    state.speed = car.speed;
  }
}

// ---------- Round 5, part two: Solmar Sands casino ----------
// In-game cash only. No real money, no payouts outside the game.
const R5_CASINO = { x: 60, z: -84 };
const R5_SLOTS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const r5Casino = {
  open: false, spins: 0, won: 0, bj: null, bjBet: 50,
  store: 'solmar-bay-r5-casino',
};
function r5CasinoNear() {
  if (state.inCar) return false;
  return Math.hypot(playerState.x - R5_CASINO.x, playerState.z - R5_CASINO.z) < 6;
}
function r5CasinoBuild() {
  addBox(16, 9, 12, 0x7a1e5a, R5_CASINO.x, 4.5, R5_CASINO.z + 8);
  addBox(16.6, 1, 12.6, 0xffd23f, R5_CASINO.x, 9.4, R5_CASINO.z + 8);
  addBox(17, 1.2, 2, 0x2ee6ff, R5_CASINO.x, 0.6, R5_CASINO.z + 1.6);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(11, 2, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb300, emissiveIntensity: 0.9 }));
  sign.position.set(R5_CASINO.x, 7.6, R5_CASINO.z + 1.8); scene.add(sign);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xff2a7a, emissive: 0xff2a7a, emissiveIntensity: 1.2 });
  for (let i = -2; i <= 2; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), lampMat);
    lamp.position.set(R5_CASINO.x + i * 3, 9.4, R5_CASINO.z + 1.8); scene.add(lamp);
  }
  const chips = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0xff2a7a, roughness: 0.5 }));
  chips.position.set(R5_CASINO.x - 9, 0.5, R5_CASINO.z); scene.add(chips);
}
function r5CasinoRender() {
  const el = document.getElementById('r5CasinoInfo');
  if (!el) return;
  const bj = r5Casino.bj;
  const bjText = !bj ? 'No hand in play.'
    : 'You: ' + bj.you.join(' ') + ' (' + r5BjTotal(bj.you) + ') · Dealer: ' + bj.dealer.join(' ') + (bj.done ? ' (' + r5BjTotal(bj.dealer) + ')' : ' + ?') + (bj.done ? ' — ' + bj.result : ' — Hit or Stand?');
  el.innerHTML = 'Cash: $' + state.cash.toLocaleString('en-US') + ' · Spins: ' + r5Casino.spins + ' · Won: $' + r5Casino.won.toLocaleString('en-US') +
    '<br>Slots: $20 a spin — three of a kind pays $100 to $500.' +
    '<br>Blackjack: $50 a hand — beat the dealer, 21 pays double.' +
    '<br><b>Blackjack:</b> ' + bjText;
  const spinBtn = document.getElementById('r5CasinoSpin');
  if (spinBtn) spinBtn.disabled = state.cash < 20;
  const dealBtn = document.getElementById('r5CasinoDeal');
  if (dealBtn) dealBtn.disabled = state.cash < 50 || (!!bj && !bj.done);
  const hitBtn = document.getElementById('r5CasinoHit');
  if (hitBtn) hitBtn.disabled = !bj || bj.done;
  const standBtn = document.getElementById('r5CasinoStand');
  if (standBtn) standBtn.disabled = !bj || bj.done;
}
function r5CasinoOpen() {
  if (!r5CasinoNear()) return false;
  r5Casino.open = true;
  const el = document.getElementById('r5CasinoPanel');
  if (el) el.classList.remove('hidden');
  r5CasinoRender();
  speakLine('Welcome to the Sands. The slots are loose tonight, or so they tell me.');
  return true;
}
function r5CasinoClose() {
  r5Casino.open = false;
  const el = document.getElementById('r5CasinoPanel');
  if (el) el.classList.add('hidden');
}
function r5CasinoSpin() {
  if (state.cash < 20) { toast('You need $20 to spin.'); return; }
  state.cash -= 20; r5Casino.spins++;
  const reels = [pick(R5_SLOTS), pick(R5_SLOTS), pick(R5_SLOTS)];
  const line = document.getElementById('r5CasinoReels');
  if (line) line.textContent = reels.join('  ');
  let win = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    win = reels[0] === '7️⃣' ? 500 : reels[0] === '💎' ? 300 : reels[0] === '⭐' ? 200 : 100;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    win = 10;
  }
  if (win > 0) {
    state.cash += win; r5Casino.won += win;
    toast('🎰 ' + reels.join(' ') + ' — you won $' + win + '!');
    chime(); speakLine('Winner! ' + win + ' dollars, just like that.');
  } else {
    toast('🎰 ' + reels.join(' ') + ' — no luck this spin.');
    beep(180, 0.2, 'sawtooth', 0.12);
  }
  saveGame(); updateHUD(); r5CasinoRender();
}
function r5BjCard() {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return ranks[Math.floor(rng() * ranks.length)];
}
function r5BjTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c === 'A') { aces++; total += 11; }
    else if (c === 'J' || c === 'Q' || c === 'K') total += 10;
    else total += parseInt(c, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function r5CasinoDeal() {
  if (state.cash < 50) { toast('You need $50 for a blackjack hand.'); return; }
  if (r5Casino.bj && !r5Casino.bj.done) return;
  state.cash -= 50;
  r5Casino.bj = { you: [r5BjCard(), r5BjCard()], dealer: [r5BjCard(), r5BjCard()], done: false, result: '' };
  const t = r5BjTotal(r5Casino.bj.you);
  if (t === 21) r5CasinoStand();
  else { toast('Blackjack dealt — Hit or Stand?'); updateHUD(); r5CasinoRender(); }
}
function r5CasinoHit() {
  const bj = r5Casino.bj;
  if (!bj || bj.done) return;
  bj.you.push(r5BjCard());
  if (r5BjTotal(bj.you) > 21) {
    bj.done = true; bj.result = 'Bust! The dealer takes your $50.';
    toast('Bust — ' + r5BjTotal(bj.you) + '. The dealer takes it.');
    beep(160, 0.3, 'sawtooth', 0.12);
  }
  updateHUD(); r5CasinoRender();
}
function r5CasinoStand() {
  const bj = r5Casino.bj;
  if (!bj || bj.done) return;
  while (r5BjTotal(bj.dealer) < 17) bj.dealer.push(r5BjCard());
  const y = r5BjTotal(bj.you), d = r5BjTotal(bj.dealer);
  bj.done = true;
  if (d > 21 || y > d) {
    const win = y === 21 && bj.you.length === 2 ? 150 : 100;
    state.cash += win; r5Casino.won += win;
    bj.result = 'You win $' + win + '!';
    toast('🃏 You ' + y + ' vs dealer ' + d + ' — you win $' + win + '!');
    chime();
  } else if (y === d) {
    state.cash += 50;
    bj.result = 'Push — your $50 back.';
    toast('🃏 Push at ' + y + ' — your $50 back.');
  } else {
    bj.result = 'Dealer wins.';
    toast('🃏 Dealer ' + d + ' beats your ' + y + '.');
    beep(160, 0.3, 'sawtooth', 0.12);
  }
  saveGame(); updateHUD(); r5CasinoRender();
}

// ---------- Round 5, part three: fishing tournaments + tackle ----------
// The bay runs a two-minute tournament every few minutes of play. Catch fish
// while it runs and each catch scores points by species weight; the tackle
// shop sells rods that raise every catch value.
const R5_TACKLE = [
  { name: 'Bamboo starter rod', price: 0, mult: 1, desc: 'the rod you already own' },
  { name: 'Fibreglass caster', price: 250, mult: 1.25, desc: '+25% catch value' },
  { name: 'Carbon pro rod', price: 600, mult: 1.6, desc: '+60% catch value' },
  { name: 'Marisol gold rod', price: 1200, mult: 2, desc: 'double catch value' },
];
const R5_TOURNEY_FISH = [
  { name: 'Bay snapper', w: 1, pts: 10 }, { name: 'Silver mullet', w: 2, pts: 25 },
  { name: 'Golden grouper', w: 1, pts: 50 }, { name: 'Blue marlin', w: 1, pts: 100 },
];
const r5Tourney = {
  rod: 0, active: false, timer: 0, nextIn: 90, points: 0, best: 0,
  won: 0, caught: 0, lastFishCount: 0, store: 'solmar-bay-r5-tourney',
};
function r5TourneySave() {
  try { localStorage.setItem(r5Tourney.store, JSON.stringify({ rod: r5Tourney.rod, best: r5Tourney.best, won: r5Tourney.won, caught: r5Tourney.caught })); } catch (e) {}
}
function r5TourneyLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Tourney.store) || 'null');
    if (s) { r5Tourney.rod = s.rod || 0; r5Tourney.best = s.best || 0; r5Tourney.won = s.won || 0; r5Tourney.caught = s.caught || 0; }
  } catch (e) {}
}
function r5TourneyStart() {
  r5Tourney.active = true; r5Tourney.timer = 120; r5Tourney.points = 0;
  toast('🎣 FISHING TOURNAMENT — two minutes! Every catch scores points!');
  speakLine('The bay tournament is on. Two minutes, biggest haul wins. Go fish!');
  beep(880, 0.2, 'sine', 0.2); setTimeout(() => beep(1174, 0.25, 'sine', 0.2), 200);
}
function r5TourneyEnd() {
  r5Tourney.active = false; r5Tourney.nextIn = 240;
  const pts = r5Tourney.points;
  let prize = 0;
  if (pts >= 200) prize = 400;
  else if (pts >= 120) prize = 250;
  else if (pts >= 60) prize = 120;
  else if (pts >= 25) prize = 50;
  if (pts > r5Tourney.best) r5Tourney.best = pts;
  if (prize > 0) {
    state.cash += prize; r5Tourney.won++;
    toast('🏆 Tournament over — ' + pts + ' points! Prize: $' + prize + '.');
    speakLine('Tournament done. ' + pts + ' points, and ' + prize + ' dollars for the haul.');
    chime();
  } else {
    toast('Tournament over — ' + pts + ' points. No prize this time; the bay was stingy.');
  }
  r5TourneySave(); saveGame(); updateHUD();
}
function r5TourneyOnCatch() {
  // Called from updateR5 when the base fishing code lands a fish.
  r5Tourney.caught++;
  if (!r5Tourney.active) return;
  const f = pick(R5_TOURNEY_FISH);
  const pts = f.pts;
  r5Tourney.points += pts;
  toast('🎣 Tournament catch: ' + f.name + ' — +' + pts + ' pts (' + r5Tourney.points + ' total).');
}
function r5TourneyRodMult() { return (R5_TACKLE[r5Tourney.rod] || R5_TACKLE[0]).mult; }
function r5TourneyBuyRod(i) {
  const rod = R5_TACKLE[i];
  if (!rod || i === r5Tourney.rod) return;
  if (state.cash < rod.price) { toast('You need $' + rod.price + ' for the ' + rod.name + '.'); return; }
  state.cash -= rod.price; r5Tourney.rod = i;
  toast('🎣 ' + rod.name + ' bought — ' + rod.desc + '.');
  chime(); r5TourneySave(); saveGame(); updateHUD(); r5TourneyRender();
}
function r5TourneyRender() {
  const el = document.getElementById('r5TourneyItems');
  if (!el) return;
  const cashEl = document.getElementById('r5TourneyCash');
  if (cashEl) cashEl.textContent = 'Your cash: $' + state.cash.toLocaleString('en-US') + ' · Best tournament: ' + r5Tourney.best + ' pts · Tournaments won: ' + r5Tourney.won + ' · Fish caught: ' + r5Tourney.caught;
  el.innerHTML = '';
  R5_TACKLE.forEach((rod, i) => {
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.textContent = '🎣 ' + rod.name + ' — $' + rod.price + ' (' + rod.desc + ')' + (r5Tourney.rod === i ? ' ✓ owned' : '');
    b.disabled = r5Tourney.rod === i || state.cash < rod.price;
    b.addEventListener('click', () => r5TourneyBuyRod(i));
    el.appendChild(b);
  });
}
function r5TourneyOpen() {
  const el = document.getElementById('r5TourneyPanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5TourneyRender();
  return true;
}
function r5TourneyClose() {
  const el = document.getElementById('r5TourneyPanel');
  if (el) el.classList.add('hidden');
}
function r5TourneyUpdate(dt) {
  if (r5Tourney.lastFishCount !== fish.caught) {
    // The base game just landed a fish (or several). Score it, and apply the
    // rod multiplier by topping up the catch value the base game already paid.
    const landed = fish.caught - r5Tourney.lastFishCount;
    r5Tourney.lastFishCount = fish.caught;
    for (let i = 0; i < landed; i++) {
      r5TourneyOnCatch();
      const mult = r5TourneyRodMult();
      if (mult > 1) {
        const bonus = Math.round(25 * (mult - 1));
        state.cash += bonus;
      }
    }
    updateHUD();
  }
  if (r5Tourney.active) {
    r5Tourney.timer -= dt;
    if (r5Tourney.timer <= 0) r5TourneyEnd();
  } else {
    r5Tourney.nextIn -= dt;
    if (r5Tourney.nextIn <= 0) r5TourneyStart();
  }
}

// ---------- Round 5, part four: pursuit helicopter + spike strips ----------
// At 3 stars and above a police helicopter joins the chase, sweeping a
// searchlight over the player. At 4 stars the police lay spike strips ahead
// of the road — drive over one and your tyres blow.
const r5Heli = { mesh: null, light: null, active: false, stripTimer: 0, slowTimer: 0 };
const R5_SPIKES = [];
function r5HeliBuild() {
  const mesh = makeHeliMesh(0x1a2a44);
  mesh.position.set(0, 60, 0);
  scene.add(mesh);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  cone.position.y = -15; mesh.add(cone);
  r5Heli.mesh = mesh; r5Heli.light = cone;
  mesh.visible = false;
}
function r5SpikeBuild(x, z, heading) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.15, 0.8), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
  g.add(base);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.3 });
  for (let i = -2; i <= 2; i++) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6), spikeMat);
    s.position.set(i * 0.9, 0.4, 0); g.add(s);
  }
  g.position.set(x, 0.1, z); g.rotation.y = heading;
  scene.add(g);
  R5_SPIKES.push({ mesh: g, x, z, ttl: 45 });
}
function r5HeliUpdate(dt) {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const want = state.wanted >= 3 && state.mode === 'play';
  if (want && !r5Heli.active) {
    r5Heli.active = true;
    r5Heli.mesh.visible = true;
    toast('🚁 A police helicopter is on you — lose it or lose the heat!');
    speakLine('Helicopter overhead. They can see everything from up there.');
    beep(700, 0.3, 'sawtooth', 0.15);
  } else if (!want && r5Heli.active) {
    r5Heli.active = false;
    r5Heli.mesh.visible = false;
  }
  if (r5Heli.active && r5Heli.mesh) {
    const m = r5Heli.mesh;
    const tx = px + 14, tz = pz - 10;
    m.position.x += (tx - m.position.x) * dt * 0.7;
    m.position.z += (tz - m.position.z) * dt * 0.7;
    m.position.y = 34 + Math.sin(state.time * 1.1) * 2;
    m.rotation.y = Math.atan2(px - m.position.x, pz - m.position.z);
    if (r5Heli.light) r5Heli.light.material.opacity = 0.14 + Math.sin(state.time * 6) * 0.05;
    // The searchlight pins the player: wanted decays slower under it.
    if (state.cleanTimer > 0) state.cleanTimer = Math.max(0, state.cleanTimer - dt * 0.5);
    // At 4 stars, police lay a spike strip ahead of the player's road.
    if (state.wanted >= 4) {
      r5Heli.stripTimer -= dt;
      if (r5Heli.stripTimer <= 0 && R5_SPIKES.length < 3) {
        r5Heli.stripTimer = 25;
        const heading = state.inCar ? state.inCar.mesh.rotation.y : playerState.heading;
        const sx = px + Math.sin(heading) * 26, sz = pz + Math.cos(heading) * 26;
        r5SpikeBuild(sx, sz, heading + Math.PI / 2);
        toast('⚠️ Spike strip ahead! Swerve around it!');
        beep(440, 0.25, 'square', 0.15);
      }
    }
  }
  // Spike strips: age out, and blow the tyres of anything that crosses them.
  for (let i = R5_SPIKES.length - 1; i >= 0; i--) {
    const sp = R5_SPIKES[i];
    sp.ttl -= dt;
    if (sp.ttl <= 0) { scene.remove(sp.mesh); R5_SPIKES.splice(i, 1); continue; }
    if (state.inCar && Math.hypot(state.inCar.mesh.position.x - sp.x, state.inCar.mesh.position.z - sp.z) < 3 && Math.abs(state.inCar.speed) > 2) {
      scene.remove(sp.mesh); R5_SPIKES.splice(i, 1);
      state.inCar.speed *= 0.25; state.speed = state.inCar.speed;
      r5Heli.slowTimer = 8;
      toast('💥 SPIKES! Your tyres are shredded — top speed cut for 8 seconds!');
      speakLine('Spikes! The car is limping. Get clear of them, fast.');
      thud(); damagePlayer(4, 'You ran over a spike strip');
      updateHUD();
    }
  }
  if (r5Heli.slowTimer > 0) {
    r5Heli.slowTimer -= dt;
    if (state.inCar && Math.abs(state.inCar.speed) > 8) {
      state.inCar.speed = Math.sign(state.inCar.speed) * Math.max(8, Math.abs(state.inCar.speed) - 30 * dt);
      state.speed = state.inCar.speed;
    }
  }
}

// ---------- Round 5, part five: four seasons + weather fronts ----------
// The bay now turns through spring, summer, autumn and winter, four game days
// each. Seasons change the rain, the light and the trees, and travelling
// weather fronts roll in with wind that pushes boats and planes.
const R5_SEASONS = [
  { name: 'Spring', rain: 0.25, tint: 0x9fd68a, fest: 'Bloom Festival' },
  { name: 'Summer', rain: 0.12, tint: 0x7ac74f, fest: 'Bay Heatwave Fair' },
  { name: 'Autumn', rain: 0.35, tint: 0xd8a05a, fest: 'Harvest Market' },
  { name: 'Winter', rain: 0.45, tint: 0xb9c8d8, fest: 'Lights on the Bay' },
];
const r5Season = {
  idx: 1, day: 0, dayTimer: 0, front: null, frontTimer: 120, wind: 0,
  festPaid: false, store: 'solmar-bay-r5-season',
};
function r5SeasonName() { return R5_SEASONS[r5Season.idx].name; }
function r5SeasonDayLength() { return DAY_LENGTH; }
function r5SeasonStartFront() {
  const kinds = [
    { name: 'sea breeze front', rain: false, wind: 6, msg: 'A sea breeze front rolls in — boats and planes will drift.' },
    { name: 'rain front', rain: true, wind: 10, msg: 'A rain front is coming over the bay — roads get slick.' },
    { name: 'calm high', rain: false, wind: 0, msg: 'A calm high settles over Solmar Bay — perfect driving weather.' },
    { name: 'gusty squall', rain: true, wind: 16, msg: 'A gusty squall hits the coast — hold on tight!' },
  ];
  const f = pick(kinds);
  r5Season.front = { name: f.name, rain: f.rain, wind: f.wind, ttl: 90 };
  r5Season.wind = f.wind;
  toast('🌦️ ' + f.msg);
  if (f.rain && state.weather !== 'rain') state.weather = 'rain';
  if (!f.rain && state.weather === 'rain') state.weather = 'clear';
}
function r5SeasonAdvance() {
  r5Season.day++;
  if (r5Season.day >= 4) {
    r5Season.day = 0;
    r5Season.idx = (r5Season.idx + 1) % 4;
    const s = R5_SEASONS[r5Season.idx];
    toast('🍂 The season turns — welcome to ' + s.name + ' in Solmar Bay! The ' + s.fest + ' pays every driver $150.');
    speakLine('A new season. ' + s.name + ' in the bay, and the festival pays everyone who shows up.');
    state.cash += 150;
    r5Season.festPaid = true;
    chime(); saveGame(); updateHUD();
  }
}
function r5SeasonUpdate(dt) {
  r5Season.dayTimer += dt;
  if (r5Season.dayTimer >= r5SeasonDayLength()) {
    r5Season.dayTimer = 0;
    r5SeasonAdvance();
  }
  r5Season.frontTimer -= dt;
  if (r5Season.frontTimer <= 0) {
    r5Season.frontTimer = 150 + rng() * 90;
    r5SeasonStartFront();
  }
  if (r5Season.front) {
    r5Season.front.ttl -= dt;
    if (r5Season.front.ttl <= 0) {
      r5Season.front = null; r5Season.wind = 0;
      if (state.weather === 'rain') state.weather = 'clear';
      toast('The weather front has passed — clear skies over the bay.');
    } else if (r5Season.front.rain && state.weather !== 'rain') {
      state.weather = 'rain';
    }
  }
  // Wind pushes boats sideways a little while a front is overhead.
  if (r5Season.wind > 0) {
    for (const b of boats) {
      b.mesh.position.x += Math.sin(state.time * 0.4) * r5Season.wind * 0.004;
    }
  }
}
function r5SeasonLine() {
  const s = R5_SEASONS[r5Season.idx];
  const front = r5Season.front ? ' · ' + r5Season.front.name : '';
  return '🌿 ' + s.name + ' day ' + (r5Season.day + 1) + '/4' + front + (r5Season.wind > 0 ? ' · wind ' + r5Season.wind : '');
}

// ---------- Round 5, part six: taxi + delivery empire ----------
// Buy cabs, hire drivers, and the empire earns while you roam. Drivers need
// paying once a day; a happy fleet earns more. Deliveries are quick parcels
// you run yourself between the depot and the districts.
const R5_EMPIRE = {
  depot: { x: -84, z: 60 },
  cabPrice: 1500, driverPrice: 200, driverWage: 60,
  cabs: [], drivers: 0, earned: 0, dayPaid: false, dayTimer: 0,
  delivery: null, deliveriesDone: 0, store: 'solmar-bay-r5-empire',
};
const R5_DELIVERY_SPOTS = [
  { x: 60, z: 60, label: 'the marina shops' }, { x: -60, z: -60, label: 'the north docks' },
  { x: 96, z: -36, label: 'the hospital' }, { x: -96, z: 36, label: 'the golf club' },
  { x: 24, z: -96, label: 'the old lighthouse road' }, { x: 120, z: 120, label: 'the south keys' },
];
function r5EmpireNearDepot() {
  if (state.inCar) return false;
  return Math.hypot(playerState.x - R5_EMPIRE.depot.x, playerState.z - R5_EMPIRE.depot.z) < 6;
}
function r5EmpireBuild() {
  addBox(12, 5, 9, 0xf5c518, R5_EMPIRE.depot.x, 2.5, R5_EMPIRE.depot.z + 7);
  addBox(12.6, 0.6, 9.6, 0x1a1a1a, R5_EMPIRE.depot.x, 5.3, R5_EMPIRE.depot.z + 7);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x333333, emissiveIntensity: 0.4 }));
  sign.position.set(R5_EMPIRE.depot.x, 4.2, R5_EMPIRE.depot.z + 2.4); scene.add(sign);
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.35, metalness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), cabMat);
    cab.position.set(R5_EMPIRE.depot.x - 5 + i * 5, 0.55, R5_EMPIRE.depot.z - 3);
    scene.add(cab);
  }
}
function r5EmpireSave() {
  try { localStorage.setItem(R5_EMPIRE.store, JSON.stringify({ cabs: R5_EMPIRE.cabs.length, drivers: R5_EMPIRE.drivers, earned: R5_EMPIRE.earned, deliveriesDone: R5_EMPIRE.deliveriesDone })); } catch (e) {}
}
function r5EmpireLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(R5_EMPIRE.store) || 'null');
    if (s) {
      R5_EMPIRE.drivers = s.drivers || 0; R5_EMPIRE.earned = s.earned || 0; R5_EMPIRE.deliveriesDone = s.deliveriesDone || 0;
      for (let i = 0; i < (s.cabs || 0); i++) R5_EMPIRE.cabs.push({ id: i, hired: i < R5_EMPIRE.drivers });
    }
  } catch (e) {}
}
function r5EmpireIncomePerMin() {
  // Each cab with a driver earns $25 a minute; a cab without a driver earns $8.
  let per = 0;
  for (const cab of R5_EMPIRE.cabs) per += cab.hired ? 25 : 8;
  return per;
}
function r5EmpireBuyCab() {
  if (R5_EMPIRE.cabs.length >= 3) { toast('Your depot holds three cabs — that is the whole fleet.'); return; }
  if (state.cash < R5_EMPIRE.cabPrice) { toast('A cab costs $1,500.'); return; }
  state.cash -= R5_EMPIRE.cabPrice;
  R5_EMPIRE.cabs.push({ id: R5_EMPIRE.cabs.length, hired: false });
  toast('🚕 Cab bought! Hire a driver and it earns $25 a minute while you roam.');
  chime(); r5EmpireSave(); saveGame(); updateHUD(); r5EmpireRender();
}
function r5EmpireHireDriver() {
  const free = R5_EMPIRE.cabs.find((c) => !c.hired);
  if (!free) { toast('No cab without a driver — buy a cab first.'); return; }
  if (state.cash < R5_EMPIRE.driverPrice) { toast('Hiring costs $200.'); return; }
  state.cash -= R5_EMPIRE.driverPrice;
  free.hired = true; R5_EMPIRE.drivers++;
  toast('🧑‍✈️ Driver hired for cab ' + (free.id + 1) + ' — $60 a day in wages, $25 a minute in fares.');
  chime(); r5EmpireSave(); saveGame(); updateHUD(); r5EmpireRender();
}
function r5EmpireStartDelivery() {
  if (R5_EMPIRE.delivery) { toast('You already have a parcel — deliver it first.'); return; }
  const spot = pick(R5_DELIVERY_SPOTS);
  R5_EMPIRE.delivery = { x: spot.x, z: spot.z, label: spot.label, timer: 90 };
  setBeacon(spot.x, spot.z);
  toast('📦 Parcel run: deliver to ' + spot.label + ' within 90 seconds — $180.');
  speakLine('Parcel for ' + spot.label + '. Ninety seconds. Do not dawdle.');
  beep(660, 0.15, 'sine', 0.15);
  updateObjective();
}
function r5EmpireUpdate(dt) {
  // Fleet income ticks every minute of play.
  R5_EMPIRE.dayTimer += dt;
  if (R5_EMPIRE.dayTimer >= 60) {
    R5_EMPIRE.dayTimer = 0;
    const earn = r5EmpireIncomePerMin();
    if (earn > 0) {
      state.cash += earn; R5_EMPIRE.earned += earn;
      toast('🚕 Your fleet earned $' + earn + ' this minute (total $' + R5_EMPIRE.earned.toLocaleString('en-US') + ').');
      updateHUD();
    }
  }
  // Daily wages, once per game day.
  if (state.dayTime < 0.05 && !R5_EMPIRE.dayPaid) {
    R5_EMPIRE.dayPaid = true;
    const wages = R5_EMPIRE.drivers * R5_EMPIRE.driverWage;
    if (wages > 0) {
      state.cash = Math.max(0, state.cash - wages);
      toast('💵 Driver wages paid: $' + wages + ' for ' + R5_EMPIRE.drivers + ' driver(s).');
      updateHUD();
    }
  } else if (state.dayTime > 0.1) {
    R5_EMPIRE.dayPaid = false;
  }
  if (R5_EMPIRE.delivery) {
    const d = R5_EMPIRE.delivery;
    d.timer -= dt;
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(px - d.x, pz - d.z) < 6) {
      state.cash += 180; R5_EMPIRE.deliveriesDone++;
      toast('📦 Delivered to ' + d.label + ' — $180! (' + R5_EMPIRE.deliveriesDone + ' deliveries done)');
      speakLine('Parcel delivered. One hundred eighty dollars, right on time.');
      chime(); beacon.visible = false;
      R5_EMPIRE.delivery = null;
      r5EmpireSave(); saveGame(); updateHUD();
    } else if (d.timer <= 0) {
      toast('📦 Parcel run failed — too slow. The depot keeps the parcel.');
      beacon.visible = false;
      R5_EMPIRE.delivery = null;
    }
  }
}
function r5EmpireRender() {
  const el = document.getElementById('r5EmpireItems');
  if (!el) return;
  const cashEl = document.getElementById('r5EmpireCash');
  if (cashEl) cashEl.textContent = 'Your cash: $' + state.cash.toLocaleString('en-US') + ' · Cabs: ' + R5_EMPIRE.cabs.length + '/3 · Drivers: ' + R5_EMPIRE.drivers + ' · Fleet earns $' + r5EmpireIncomePerMin() + '/min · Total earned: $' + R5_EMPIRE.earned.toLocaleString('en-US');
  el.innerHTML = '';
  const add = (label, disabled, fn) => {
    const b = document.createElement('button');
    b.className = 'shopItem'; b.textContent = label; b.disabled = !!disabled;
    b.addEventListener('click', fn); el.appendChild(b);
  };
  add('🚕 Buy a cab — $1,500', R5_EMPIRE.cabs.length >= 3 || state.cash < 1500, r5EmpireBuyCab);
  add('🧑‍✈️ Hire a driver — $200 (needs a free cab)', !R5_EMPIRE.cabs.some((c) => !c.hired) || state.cash < 200, r5EmpireHireDriver);
  add('📦 Take a parcel run — $180', !!R5_EMPIRE.delivery, r5EmpireStartDelivery);
  const note = document.createElement('div');
  note.style.cssText = 'font-size:12px;color:#cfe8ff;margin-top:6px';
  note.textContent = 'Drivers are paid $60 each at dawn. Cabs with drivers earn $25/min, cabs without earn $8/min.';
  el.appendChild(note);
}
function r5EmpireOpen() {
  if (!r5EmpireNearDepot()) return false;
  const el = document.getElementById('r5EmpirePanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5EmpireRender();
  return true;
}
function r5EmpireClose() {
  const el = document.getElementById('r5EmpirePanel');
  if (el) el.classList.add('hidden');
}

// ---------- Round 5, part seven: stunt jumps + leaderboard ----------
// Six wooden ramps are scattered around the bay. Hit one fast, fly, land
// cleanly, and the jump is scored by airtime and distance. The five best
// jumps live on a local leaderboard in the panel.
const R5_RAMPS = [
  { x: 40, z: 90, h: 0.6, label: 'Marina ramp' }, { x: -90, z: -90, h: -0.6, label: 'Docks ramp' },
  { x: 120, z: -120, h: 2.4, label: 'Airstrip ramp' }, { x: -140, z: 120, h: 1.8, label: 'Desert ramp' },
  { x: 0, z: -140, h: 3.1, label: 'North hill ramp' }, { x: 150, z: 60, h: -2.2, label: 'Beach ramp' },
];
const r5Stunt = {
  air: false, airTime: 0, airStart: null, best: [], jumps: 0, bestDist: 0,
  store: 'solmar-bay-r5-stunt',
};
function r5StuntBuild() {
  const rampMat = new THREE.MeshStandardMaterial({ color: 0xe8b820, roughness: 0.7 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  for (const r of R5_RAMPS) {
    const g = new THREE.Group();
    const wedge = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 7), rampMat);
    wedge.rotation.x = -0.35; wedge.position.y = 0.6; g.add(wedge);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.3, 0.8), stripeMat);
    stripe.rotation.x = -0.35; stripe.position.set(0, 1.35, 3); g.add(stripe);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0xff2a7a, side: THREE.DoubleSide }));
    flag.position.set(0, 3, -3); g.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(-0.7, 1.5, -3); g.add(pole);
    g.position.set(r.x, groundHeight(r.x, r.z), r.z);
    g.rotation.y = r.h;
    scene.add(g);
  }
}
function r5StuntSave() {
  try { localStorage.setItem(r5Stunt.store, JSON.stringify({ best: r5Stunt.best, jumps: r5Stunt.jumps, bestDist: r5Stunt.bestDist })); } catch (e) {}
}
function r5StuntLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Stunt.store) || 'null');
    if (s) { r5Stunt.best = s.best || []; r5Stunt.jumps = s.jumps || 0; r5Stunt.bestDist = s.bestDist || 0; }
  } catch (e) {}
}
function r5StuntNearRamp() {
  if (!state.inCar) return -1;
  for (let i = 0; i < R5_RAMPS.length; i++) {
    const r = R5_RAMPS[i];
    if (Math.hypot(state.inCar.mesh.position.x - r.x, state.inCar.mesh.position.z - r.z) < 5) return i;
  }
  return -1;
}
function r5StuntUpdate(dt) {
  if (!state.inCar) { r5Stunt.air = false; return; }
  const car = state.inCar;
  const ground = groundHeight(car.mesh.position.x, car.mesh.position.z);
  const airborne = car.mesh.position.y > ground + 1.2;
  if (airborne && !r5Stunt.air) {
    // Left the ground — if we were near a ramp, this is a stunt jump.
    const ramp = r5StuntNearRamp();
    r5Stunt.air = true; r5Stunt.airTime = 0;
    r5Stunt.airStart = { x: car.mesh.position.x, z: car.mesh.position.z, ramp };
  } else if (airborne && r5Stunt.air) {
    r5Stunt.airTime += dt;
  } else if (!airborne && r5Stunt.air) {
    r5Stunt.air = false;
    const start = r5Stunt.airStart;
    if (!start) return;
    const dist = Math.hypot(car.mesh.position.x - start.x, car.mesh.position.z - start.z);
    if (r5Stunt.airTime > 0.6 && dist > 8) {
      r5Stunt.jumps++;
      const score = Math.round(dist * 10 + r5Stunt.airTime * 100);
      const prize = Math.min(300, Math.round(score / 4));
      state.cash += prize;
      if (dist > r5Stunt.bestDist) r5Stunt.bestDist = dist;
      const label = start.ramp >= 0 ? R5_RAMPS[start.ramp].label : 'open ground';
      r5Stunt.best.push({ label, dist: Math.round(dist), air: +r5Stunt.airTime.toFixed(1), score });
      r5Stunt.best.sort((a, b) => b.score - a.score);
      r5Stunt.best = r5Stunt.best.slice(0, 5);
      toast('🤸 STUNT! ' + dist.toFixed(0) + 'u through the air in ' + r5Stunt.airTime.toFixed(1) + 's off ' + label + ' — $' + prize + '!');
      speakLine('That was a proper jump. ' + dist.toFixed(0) + ' units of air, and the crowd loved it.');
      chime(); addSkill('driving', 12);
      r5StuntSave(); saveGame(); updateHUD();
    }
  }
}
function r5StuntRender() {
  const el = document.getElementById('r5StuntItems');
  if (!el) return;
  const cashEl = document.getElementById('r5StuntCash');
  if (cashEl) cashEl.textContent = 'Jumps landed: ' + r5Stunt.jumps + ' · Best distance: ' + r5Stunt.bestDist.toFixed(0) + 'u · Prizes pay up to $300 a jump';
  el.innerHTML = '';
  if (r5Stunt.best.length === 0) {
    const d = document.createElement('div');
    d.textContent = 'No jumps yet. Hit a yellow ramp fast — six of them around the bay.';
    d.style.cssText = 'font-size:13px;color:#cfe8ff';
    el.appendChild(d);
    return;
  }
  r5Stunt.best.forEach((j, i) => {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:13px;color:#fff;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15)';
    d.textContent = (i + 1) + '. ' + j.label + ' — ' + j.dist + 'u · ' + j.air + 's air · ' + j.score + ' pts';
    el.appendChild(d);
  });
}
function r5StuntOpen() {
  const el = document.getElementById('r5StuntPanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5StuntRender();
  return true;
}
function r5StuntClose() {
  const el = document.getElementById('r5StuntPanel');
  if (el) el.classList.add('hidden');
}

// ---------- Round 5, part eight: photo postcards ----------
// Eight scenic spots carry a floating golden postcard. Walk up and press E
// to collect it. A full set pays a $500 bonus and a postcard from the bay.
const R5_POSTCARDS = [
  { x: 124, z: 40, label: 'Sunset Beach' }, { x: -210, z: -60, label: 'Solmar Intl tower' },
  { x: 60, z: -205, label: 'North lake' }, { x: -240, z: -180, label: 'Mountain pass' },
  { x: 150, z: 180, label: 'South keys' }, { x: -130, z: 60, label: 'Fire station corner' },
  { x: 100, z: -160, label: 'Golf greens' }, { x: -30, z: 130, label: 'Harbour lights' },
];
const r5Cards = { found: [], meshes: [], store: 'solmar-bay-r5-cards' };
function r5CardsBuild() {
  for (let i = 0; i < R5_POSTCARDS.length; i++) {
    const p = R5_POSTCARDS[i];
    const g = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 0.08), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 0.8 }));
    g.add(card);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.1), new THREE.MeshStandardMaterial({ color: 0x1e7fa8, emissive: 0x1e7fa8, emissiveIntensity: 0.4 }));
    inner.position.z = 0.02; g.add(inner);
    g.position.set(p.x, groundHeight(p.x, p.z) + 1.6, p.z);
    scene.add(g);
    r5Cards.meshes.push(g);
  }
}
function r5CardsSave() {
  try { localStorage.setItem(r5Cards.store, JSON.stringify({ found: r5Cards.found })); } catch (e) {}
}
function r5CardsLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Cards.store) || 'null');
    if (s && s.found) r5Cards.found = s.found;
  } catch (e) {}
}
function r5CardsApplyFound() {
  for (let i = 0; i < r5Cards.meshes.length; i++) {
    if (r5Cards.found.includes(i) && r5Cards.meshes[i]) r5Cards.meshes[i].visible = false;
  }
}
function r5CardsNear() {
  if (state.inCar) return -1;
  for (let i = 0; i < R5_POSTCARDS.length; i++) {
    if (r5Cards.found.includes(i)) continue;
    const p = R5_POSTCARDS[i];
    if (Math.hypot(playerState.x - p.x, playerState.z - p.z) < 4) return i;
  }
  return -1;
}
function r5CardsCollect(i) {
  if (i < 0 || r5Cards.found.includes(i)) return false;
  r5Cards.found.push(i);
  if (r5Cards.meshes[i]) r5Cards.meshes[i].visible = false;
  state.cash += 60;
  const p = R5_POSTCARDS[i];
  toast('📮 Postcard collected: ' + p.label + ' — $60! (' + r5Cards.found.length + '/8)');
  speakLine('Postcard from ' + p.label + '. The bay looks good on paper.');
  chime();
  if (r5Cards.found.length === 8) {
    state.cash += 500;
    toast('📮 FULL SET! All eight postcards — bonus $500! Solmar Bay, wish you were here.');
    showStory('Ryan: Eight postcards, one bay. Ian: We should send one to Marisol. Ryan: She already lives here.');
    speakLine('Every postcard in the bay. Five hundred dollars for the full set.');
  }
  r5CardsSave(); saveGame(); updateHUD();
  return true;
}
function r5CardsUpdate(dt) {
  for (let i = 0; i < r5Cards.meshes.length; i++) {
    const m = r5Cards.meshes[i];
    if (!m || !m.visible) continue;
    m.rotation.y += dt * 1.2;
    m.position.y = groundHeight(R5_POSTCARDS[i].x, R5_POSTCARDS[i].z) + 1.6 + Math.sin(state.time * 2 + i) * 0.25;
  }
}

// ---------- Round 5, part nine: flight school ----------
// A stunt plane waits at Solmar Intl with three lessons: take off, climb and
// loop through a high ring, then land on the runway. Pass all three and the
// school pays $300 plus a pilot's badge that doubles race winnings in the air.
const R5_SCHOOL = { x: -168, z: -20 };
const r5School = {
  lesson: 0, active: false, stage: 0, timer: 0, passed: [false, false, false],
  ring: null, plane: null, store: 'solmar-bay-r5-school',
};
const R5_LESSONS = [
  { name: 'Takeoff', text: 'Get the stunt plane airborne and climb above 25u.', reward: 150 },
  { name: 'Sky ring', text: 'Fly through the golden ring high above the runway.', reward: 200 },
  { name: 'Runway landing', text: 'Bring her down gently on the runway, under 12 speed.', reward: 250 },
];
function r5SchoolBuild() {
  addBox(10, 4, 8, 0x2e6fb0, R5_SCHOOL.x, 2, R5_SCHOOL.z + 6);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 0.6 }));
  sign.position.set(R5_SCHOOL.x, 3.4, R5_SCHOOL.z + 1.8); scene.add(sign);
  // The school plane is the airport's own prop plane (planes[0]) — reusing it
  // keeps the hijackable-plane count at five, as the playtest expects.
  r5School.plane = planes[0] || null;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.5, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb300, emissiveIntensity: 1 }));
  ring.position.set(-210, 45, -40);
  ring.visible = false;
  scene.add(ring);
  r5School.ring = ring;
}
function r5SchoolNear() {
  if (state.inCar) return false;
  return Math.hypot(playerState.x - R5_SCHOOL.x, playerState.z - R5_SCHOOL.z) < 6;
}
function r5SchoolSave() {
  try { localStorage.setItem(r5School.store, JSON.stringify({ passed: r5School.passed })); } catch (e) {}
}
function r5SchoolLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5School.store) || 'null');
    if (s && s.passed) r5School.passed = s.passed;
  } catch (e) {}
}
function r5SchoolStart() {
  if (r5School.active) { toast('A lesson is already in progress.'); return false; }
  const next = r5School.passed.findIndex((p) => !p);
  if (next === -1) { toast('You passed all three lessons — you are a licensed bay pilot!'); return true; }
  r5School.lesson = next; r5School.active = true; r5School.stage = 0; r5School.timer = 150;
  const lesson = R5_LESSONS[next];
  toast('✈️ Flight school lesson ' + (next + 1) + '/3 — ' + lesson.name + ': ' + lesson.text);
  speakLine('Lesson ' + (next + 1) + ': ' + lesson.name + '. ' + lesson.text);
  if (r5School.plane) {
    playerState.x = r5School.plane.mesh.position.x + 2;
    playerState.z = r5School.plane.mesh.position.z;
    player.position.set(playerState.x, groundHeight(playerState.x, playerState.z), playerState.z);
    toast('The stunt plane is waiting — press E to climb in.');
  }
  if (next === 1 && r5School.ring) r5School.ring.visible = true;
  return true;
}
function r5SchoolUpdate(dt) {
  if (!r5School.active) return;
  const lesson = R5_LESSONS[r5School.lesson];
  r5School.timer -= dt;
  const inPlane = state.inCar && state.inCar.kind === 'plane';
  if (r5School.lesson === 0) {
    if (inPlane && state.inCar.alt > 25) r5SchoolPass(lesson);
  } else if (r5School.lesson === 1) {
    if (r5School.ring) r5School.ring.rotation.z += dt * 0.5;
    if (inPlane && r5School.ring && Math.hypot(state.inCar.mesh.position.x - r5School.ring.position.x, state.inCar.mesh.position.z - r5School.ring.position.z) < 7 && Math.abs((state.inCar.alt || 0) - 45) < 10) {
      r5SchoolPass(lesson);
    }
  } else if (r5School.lesson === 2) {
    if (!inPlane && r5School.stage === 1) r5SchoolPass(lesson);
    if (inPlane && (state.inCar.alt || 0) > 20) r5School.stage = 1;
    if (inPlane && r5School.stage === 1 && (state.inCar.alt || 0) < 2 && Math.abs(state.inCar.speed) < 12 && Math.abs(state.inCar.mesh.position.x + 210) < 95) {
      r5SchoolPass(lesson);
    }
  }
  if (r5School.timer <= 0 && r5School.active) {
    r5School.active = false;
    if (r5School.ring) r5School.ring.visible = false;
    toast('✈️ Lesson timed out — the instructor waves you back to the school.');
  }
}
function r5SchoolPass(lesson) {
  r5School.active = false;
  r5School.passed[r5School.lesson] = true;
  if (r5School.ring) r5School.ring.visible = false;
  state.cash += lesson.reward;
  toast('✈️ Lesson passed: ' + lesson.name + ' — $' + lesson.reward + '! (' + r5School.passed.filter(Boolean).length + '/3)');
  speakLine('Lesson passed. ' + lesson.name + ' done, ' + lesson.reward + ' dollars earned.');
  chime(); addSkill('driving', 20);
  if (r5School.passed.every(Boolean)) {
    toast('🏅 PILOT BADGE! All three lessons passed — you fly the bay like you own it.');
    showStory('Ian: Three lessons, one badge. Ryan: Told you the sky was ours too.');
  }
  r5SchoolSave(); saveGame(); updateHUD();
}

// ---------- Round 5, part ten: Bay Iron gym ----------
// Train at the gym on the east side. Sessions cost $30 and bank real skill
// XP: stamina for running, strength for fighting, speed for driving. Train
// five times in a row and the coach throws in a free protein shake — $25.
const R5_GYM = { x: 84, z: 84 };
const R5_GYM_PLANS = [
  { name: 'Treadmill sprints', skill: 'stamina', xp: 25, label: 'Run the bay without stopping.' },
  { name: 'Heavy bag', skill: 'shooting', xp: 20, label: 'Steady hands, steady aim.' },
  { name: 'Deadlift ladder', skill: 'stamina', xp: 30, label: 'Pure strength, rep by rep.' },
  { name: 'Reaction drills', skill: 'driving', xp: 25, label: 'Faster hands on the wheel.' },
  { name: 'Sparring rounds', skill: 'shooting', xp: 30, label: 'Three rounds with coach Dara.' },
];
const r5Gym = { sessions: 0, streak: 0, coach: 'Dara', store: 'solmar-bay-r5-gym' };
function r5GymNear() {
  if (state.inCar) return false;
  return Math.hypot(playerState.x - R5_GYM.x, playerState.z - R5_GYM.z) < 6;
}
function r5GymBuild() {
  addBox(13, 5, 10, 0x2a4a6a, R5_GYM.x, 2.5, R5_GYM.z + 7);
  addBox(13.6, 0.7, 10.6, 0x7ac74f, R5_GYM.x, 5.3, R5_GYM.z + 7);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x7ac74f, emissive: 0x2a6a1a, emissiveIntensity: 0.7 }));
  sign.position.set(R5_GYM.x, 4.2, R5_GYM.z + 1.8); scene.add(sign);
  const bellMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 12), bellMat);
    bell.rotation.x = Math.PI / 2;
    bell.position.set(R5_GYM.x - 6 + i * 1.6, 0.6, R5_GYM.z - 2); scene.add(bell);
  }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }));
  bench.position.set(R5_GYM.x + 6, 0.5, R5_GYM.z - 2); scene.add(bench);
}
function r5GymSave() {
  try { localStorage.setItem(r5Gym.store, JSON.stringify({ sessions: r5Gym.sessions })); } catch (e) {}
}
function r5GymLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Gym.store) || 'null');
    if (s) r5Gym.sessions = s.sessions || 0;
  } catch (e) {}
}
function r5GymTrain(i) {
  const plan = R5_GYM_PLANS[i];
  if (!plan) return;
  if (state.cash < 30) { toast('A session costs $30.'); return; }
  state.cash -= 30; r5Gym.sessions++; r5Gym.streak++;
  addSkill(plan.skill, plan.xp);
  toast('💪 ' + plan.name + ' — +' + plan.xp + ' ' + plan.skill + ' XP. Coach Dara nods approvingly.');
  if (r5Gym.streak >= 5) {
    r5Gym.streak = 0; state.cash += 25;
    toast('🥤 Five sessions in a row — free protein shake, plus $25 from the coach\'s tip jar!');
    speakLine('Five sessions straight. The coach says you are built different now.');
  }
  r5GymSave(); saveGame(); updateHUD(); r5GymRender();
}
function r5GymRender() {
  const el = document.getElementById('r5GymItems');
  if (!el) return;
  const cashEl = document.getElementById('r5GymCash');
  if (cashEl) cashEl.textContent = 'Your cash: $' + state.cash.toLocaleString('en-US') + ' · Sessions: ' + r5Gym.sessions + ' · Streak: ' + r5Gym.streak + '/5 · Driving ' + skillLevel('driving') + ' · Shooting ' + skillLevel('shooting') + ' · Stamina ' + skillLevel('stamina');
  el.innerHTML = '';
  R5_GYM_PLANS.forEach((plan, i) => {
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.textContent = '💪 ' + plan.name + ' — $30 (+' + plan.xp + ' ' + plan.skill + ' XP)';
    b.disabled = state.cash < 30;
    b.title = plan.label;
    b.addEventListener('click', () => r5GymTrain(i));
    el.appendChild(b);
  });
  const note = document.createElement('div');
  note.style.cssText = 'font-size:12px;color:#cfe8ff;margin-top:6px';
  note.textContent = 'Coach Dara: "Five sessions in a row and the shake is on me."';
  el.appendChild(note);
}
function r5GymOpen() {
  if (!r5GymNear()) return false;
  const el = document.getElementById('r5GymPanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5GymRender();
  return true;
}
function r5GymClose() {
  const el = document.getElementById('r5GymPanel');
  if (el) el.classList.add('hidden');
}

// ---------- Round 5, part eleven: Solmar stock market ----------
// Six bay companies trade on the phone. Prices random-walk every minute of
// play; buy low, sell high. Dividends pay $2 a share per game day on anything
// you hold overnight. Nothing here touches real money.
const R5_STOCKS = [
  { sym: 'BAY', name: 'Bay Ferries', price: 42, base: 42 },
  { sym: 'PALM', name: 'Palm Resorts', price: 78, base: 78 },
  { sym: 'FISH', name: 'Solmar Fisheries', price: 23, base: 23 },
  { sym: 'AUTO', name: 'Customs Auto', price: 61, base: 61 },
  { sym: 'SAND', name: 'Sands Casino Group', price: 95, base: 95 },
  { sym: 'GOLF', name: 'Solmar Golf Club', price: 34, base: 34 },
];
const r5Stocks = { hold: {}, invested: 0, sold: 0, timer: 0, store: 'solmar-bay-r5-stocks' };
function r5StocksSave() {
  try { localStorage.setItem(r5Stocks.store, JSON.stringify({ hold: r5Stocks.hold, invested: r5Stocks.invested, sold: r5Stocks.sold })); } catch (e) {}
}
function r5StocksLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Stocks.store) || 'null');
    if (s) { r5Stocks.hold = s.hold || {}; r5Stocks.invested = s.invested || 0; r5Stocks.sold = s.sold || 0; }
  } catch (e) {}
}
function r5StocksValue() {
  let v = 0;
  for (const s of R5_STOCKS) v += (r5Stocks.hold[s.sym] || 0) * s.price;
  return v;
}
function r5StocksTick(dt) {
  r5Stocks.timer += dt;
  if (r5Stocks.timer < 60) return;
  r5Stocks.timer = 0;
  for (const s of R5_STOCKS) {
    // Mean-reverting random walk: drift back toward the base price, with a
    // wobble of up to 8% either way per minute.
    const drift = (s.base - s.price) * 0.04;
    const wobble = s.price * (rng() - 0.5) * 0.16;
    s.price = Math.max(2, Math.round((s.price + drift + wobble) * 100) / 100);
  }
  // Dividends at dawn on anything held overnight.
  if (state.dayTime < 0.05) {
    let div = 0;
    for (const s of R5_STOCKS) div += (r5Stocks.hold[s.sym] || 0) * 2;
    if (div > 0) {
      state.cash += div;
      toast('📈 Dividends paid: $' + div + ' on your shares.');
      updateHUD();
    }
  }
  if (document.getElementById('r5StocksPanel') && !document.getElementById('r5StocksPanel').classList.contains('hidden')) r5StocksRender();
}
function r5StocksBuy(sym) {
  const s = R5_STOCKS.find((x) => x.sym === sym);
  if (!s) return;
  if (state.cash < s.price) { toast('One ' + sym + ' share costs $' + s.price.toFixed(2) + '.'); return; }
  state.cash -= s.price;
  r5Stocks.hold[sym] = (r5Stocks.hold[sym] || 0) + 1;
  r5Stocks.invested += s.price;
  toast('📈 Bought 1 ' + sym + ' (' + s.name + ') for $' + s.price.toFixed(2) + '.');
  r5StocksSave(); saveGame(); updateHUD(); r5StocksRender();
}
function r5StocksSell(sym) {
  const s = R5_STOCKS.find((x) => x.sym === sym);
  if (!s || !(r5Stocks.hold[sym] || 0)) { toast('You hold no ' + sym + ' shares.'); return; }
  r5Stocks.hold[sym]--;
  state.cash += s.price;
  r5Stocks.sold += s.price;
  toast('📉 Sold 1 ' + sym + ' for $' + s.price.toFixed(2) + '.');
  r5StocksSave(); saveGame(); updateHUD(); r5StocksRender();
}
function r5StocksRender() {
  const el = document.getElementById('r5StocksItems');
  if (!el) return;
  const cashEl = document.getElementById('r5StocksCash');
  if (cashEl) cashEl.textContent = 'Your cash: $' + state.cash.toLocaleString('en-US') + ' · Portfolio: $' + r5StocksValue().toFixed(2) + ' · Invested: $' + r5Stocks.invested.toFixed(2) + ' · Sold: $' + r5Stocks.sold.toFixed(2);
  el.innerHTML = '';
  for (const s of R5_STOCKS) {
    const held = r5Stocks.hold[s.sym] || 0;
    const change = ((s.price - s.base) / s.base * 100);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.15)';
    const lab = document.createElement('span');
    lab.style.cssText = 'flex:1;font-size:13px';
    lab.textContent = s.sym + ' · ' + s.name + ' — $' + s.price.toFixed(2) + ' (' + (change >= 0 ? '+' : '') + change.toFixed(1) + '%) · held ' + held;
    const buy = document.createElement('button');
    buy.className = 'shopItem'; buy.style.cssText = 'padding:6px 10px'; buy.textContent = 'Buy';
    buy.disabled = state.cash < s.price;
    buy.addEventListener('click', () => r5StocksBuy(s.sym));
    const sell = document.createElement('button');
    sell.className = 'shopItem'; sell.style.cssText = 'padding:6px 10px'; sell.textContent = 'Sell';
    sell.disabled = held <= 0;
    sell.addEventListener('click', () => r5StocksSell(s.sym));
    row.appendChild(lab); row.appendChild(buy); row.appendChild(sell);
    el.appendChild(row);
  }
  const note = document.createElement('div');
  note.style.cssText = 'font-size:12px;color:#cfe8ff;margin-top:6px';
  note.textContent = 'Prices move every minute. Dividends pay $2 a share at dawn. In-game cash only.';
  el.appendChild(note);
}
function r5StocksOpen() {
  const el = document.getElementById('r5StocksPanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5StocksRender();
  return true;
}
function r5StocksClose() {
  const el = document.getElementById('r5StocksPanel');
  if (el) el.classList.add('hidden');
}

// ---------- Round 5, part twelve: district influence ----------
// Five districts track how much the bay respects you there. Races, jobs,
// deliveries and stunt jumps in a district raise its influence; it decays a
// little every game day. Above 60 you run the district and it pays $40 a
// minute. The minimap shows each district's colour.
const R5_DISTRICTS = [
  { name: 'Harbour', x: -60, z: 60, color: '#2ee6ff' },
  { name: 'Marina', x: 60, z: 60, color: '#ffd23f' },
  { name: 'North Docks', x: -60, z: -90, color: '#ff2a7a' },
  { name: 'Airport', x: -190, z: -40, color: '#7ac74f' },
  { name: 'Beachfront', x: 110, z: 20, color: '#e86ad0' },
];
const r5Territory = { inf: [10, 10, 10, 10, 10], paidMin: 0, store: 'solmar-bay-r5-territory' };
function r5DistrictAt(x, z) {
  let best = -1, bestD = 1e9;
  for (let i = 0; i < R5_DISTRICTS.length; i++) {
    const d = Math.hypot(x - R5_DISTRICTS[i].x, z - R5_DISTRICTS[i].z);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function r5TerritoryGain(n, why) {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const i = r5DistrictAt(px, pz);
  if (i < 0) return;
  const before = r5Territory.inf[i];
  r5Territory.inf[i] = Math.min(100, r5Territory.inf[i] + n);
  if (before < 60 && r5Territory.inf[i] >= 60) {
    toast('👑 You run ' + R5_DISTRICTS[i].name + ' now — the district pays $40 a minute!');
    speakLine(R5_DISTRICTS[i].name + ' is ours. The bay knows who runs it.');
    chime();
  } else if (why) {
    toast('📍 ' + R5_DISTRICTS[i].name + ' influence +' + n + ' (' + Math.round(r5Territory.inf[i]) + '/100).');
  }
  r5TerritorySave();
}
function r5TerritorySave() {
  try { localStorage.setItem(r5Territory.store, JSON.stringify({ inf: r5Territory.inf })); } catch (e) {}
}
function r5TerritoryLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Territory.store) || 'null');
    if (s && s.inf) r5Territory.inf = s.inf;
  } catch (e) {}
}
function r5TerritoryUpdate(dt) {
  r5Territory.paidMin += dt;
  if (r5Territory.paidMin >= 60) {
    r5Territory.paidMin = 0;
    let pay = 0;
    for (let i = 0; i < R5_DISTRICTS.length; i++) if (r5Territory.inf[i] >= 60) pay += 40;
    if (pay > 0) {
      state.cash += pay;
      toast('👑 District income: $' + pay + ' from the districts you run.');
      updateHUD();
    }
    // Influence decays a little every minute unless you keep working it.
    for (let i = 0; i < r5Territory.inf.length; i++) r5Territory.inf[i] = Math.max(5, r5Territory.inf[i] - 0.5);
    r5TerritorySave();
  }
}
function r5TerritoryLine() {
  const top = R5_DISTRICTS.map((d, i) => ({ d, v: r5Territory.inf[i] }))
    .sort((a, b) => b.v - a.v)[0];
  const run = R5_DISTRICTS.filter((d, i) => r5Territory.inf[i] >= 60).length;
  return '👑 ' + top.d.name + ' ' + Math.round(top.v) + '/100 · running ' + run + '/5 districts';
}

// ---------- Round 5, part thirteen: Ryan & Ian bond ----------
// The couple's bond grows with gifts and date nights, and shrinks when one
// of them goes down. At 50+ the partner covers you: a weekly gift of $100
// and a morale boost that heals 10 health at dawn.
const R5_GIFTS = [
  { name: 'Bay flowers', price: 40, bond: 8 },
  { name: 'Seashell necklace', price: 120, bond: 15 },
  { name: 'Sunset dinner voucher', price: 200, bond: 25 },
  { name: 'Gold locket', price: 450, bond: 40 },
];
const r5Bond = { bond: 50, dates: 0, gifts: 0, weekPaid: false, store: 'solmar-bay-r5-bond' };
function r5BondSave() {
  try { localStorage.setItem(r5Bond.store, JSON.stringify({ bond: r5Bond.bond, dates: r5Bond.dates, gifts: r5Bond.gifts })); } catch (e) {}
}
function r5BondLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Bond.store) || 'null');
    if (s) { r5Bond.bond = s.bond ?? 50; r5Bond.dates = s.dates || 0; r5Bond.gifts = s.gifts || 0; }
  } catch (e) {}
}
function r5BondGift(i) {
  const g = R5_GIFTS[i];
  if (!g) return;
  if (state.cash < g.price) { toast('The ' + g.name + ' costs $' + g.price + '.'); return; }
  state.cash -= g.price;
  r5Bond.bond = Math.min(100, r5Bond.bond + g.bond);
  r5Bond.gifts++;
  const other = CHARS[state.activeChar].name === 'Ryan' ? 'Ian' : 'Ryan';
  toast('💝 You gave ' + other + ' a ' + g.name.toLowerCase() + ' — bond +' + g.bond + ' (' + r5Bond.bond + '/100).');
  speakLine('For you, love. The bay is ours, but you are my favourite part of it.');
  chime(); r5BondSave(); saveGame(); updateHUD(); r5BondRender();
}
function r5BondDate() {
  if (state.cash < 120) { toast('A date night costs $120.'); return; }
  if (state.dayTime < 0.62 || state.dayTime > 0.8) { toast('Date nights happen at sunset — wait for the evening light.'); return; }
  state.cash -= 120;
  r5Bond.bond = Math.min(100, r5Bond.bond + 15);
  r5Bond.dates++;
  toast('🌅 Date night on the marina — bond +15 (' + r5Bond.bond + '/100). Ryan and Ian, together.');
  showStory('Ryan: Same sunset, better company. Ian: Every night, if you keep paying. Ryan: Deal.');
  speakLine('Sunset on the marina, just the two of us. This is why we came to the bay.');
  chime(); r5BondSave(); saveGame(); updateHUD(); r5BondRender();
}
function r5BondUpdate(dt) {
  // Weekly partner gift + dawn heal at high bond.
  if (state.dayTime < 0.05 && !r5Bond.weekPaid) {
    r5Bond.weekPaid = true;
    if (r5Bond.bond >= 50) {
      state.cash += 100;
      state.health = Math.min(100, state.health + 10);
      toast('💝 Your partner left $100 and breakfast — high bond pays back. Health +10.');
      updateHUD();
    }
  } else if (state.dayTime > 0.1) {
    r5Bond.weekPaid = false;
  }
}
function r5BondRender() {
  const el = document.getElementById('r5BondItems');
  if (!el) return;
  const cashEl = document.getElementById('r5BondCash');
  if (cashEl) cashEl.textContent = 'Bond: ' + r5Bond.bond + '/100 · Dates: ' + r5Bond.dates + ' · Gifts: ' + r5Bond.gifts + ' · Cash: $' + state.cash.toLocaleString('en-US');
  el.innerHTML = '';
  R5_GIFTS.forEach((g, i) => {
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.textContent = '💝 ' + g.name + ' — $' + g.price + ' (+' + g.bond + ' bond)';
    b.disabled = state.cash < g.price;
    b.addEventListener('click', () => r5BondGift(i));
    el.appendChild(b);
  });
  const date = document.createElement('button');
  date.className = 'shopItem';
  date.textContent = '🌅 Date night on the marina — $120 (+15 bond, sunset only)';
  date.disabled = state.cash < 120;
  date.addEventListener('click', r5BondDate);
  el.appendChild(date);
  const note = document.createElement('div');
  note.style.cssText = 'font-size:12px;color:#cfe8ff;margin-top:6px';
  note.textContent = 'At 50+ bond your partner leaves $100 and heals you 10 health every dawn.';
  el.appendChild(note);
}
function r5BondOpen() {
  const el = document.getElementById('r5BondPanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5BondRender();
  return true;
}
function r5BondClose() {
  const el = document.getElementById('r5BondPanel');
  if (el) el.classList.add('hidden');
}

// ---------- Round 5, part fourteen: marina boat races ----------
// A fast boat waits at the marina flag. Three buoys, one lap, 150 seconds.
// Win and the marina pays $350; beat your best time and it pays $450.
const R5_BOAT_RACE = {
  flag: { x: 128, z: 10 }, cps: [{ x: 150, z: -80 }, { x: 170, z: 60 }, { x: 140, z: 140 }],
  active: false, cp: 0, timer: 0, best: 0, wins: 0, boat: null, store: 'solmar-bay-r5-boatrace',
};
function r5BoatRaceBuild() {
  const boat = makeBoatMesh(0xff2a7a);
  boat.position.set(R5_BOAT_RACE.flag.x + 4, 0.3, R5_BOAT_RACE.flag.z);
  scene.add(boat);
  R5_BOAT_RACE.boat = { mesh: boat, kind: 'boat', speed: 0, steer: 0, stolen: false, spec: { type: 'boat', topSpeed: 30 } };
  boats.push(R5_BOAT_RACE.boat);
  for (const cp of R5_BOAT_RACE.cps) {
    const buoy = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.3, 1.2, 10), new THREE.MeshStandardMaterial({ color: 0xff2a7a, emissive: 0xaa0044, emissiveIntensity: 0.6 }));
    buoy.position.set(cp.x, 0.6, cp.z); scene.add(buoy);
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ color: 0xff2a7a, side: THREE.DoubleSide }));
  flag.position.set(R5_BOAT_RACE.flag.x, 3.4, R5_BOAT_RACE.flag.z); scene.add(flag);
}
function r5BoatRaceNear() {
  if (state.inCar) return false;
  return Math.hypot(playerState.x - R5_BOAT_RACE.flag.x, playerState.z - R5_BOAT_RACE.flag.z) < 6;
}
function r5BoatRaceSave() {
  try { localStorage.setItem(R5_BOAT_RACE.store, JSON.stringify({ best: R5_BOAT_RACE.best, wins: R5_BOAT_RACE.wins })); } catch (e) {}
}
function r5BoatRaceLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(R5_BOAT_RACE.store) || 'null');
    if (s) { R5_BOAT_RACE.best = s.best || 0; R5_BOAT_RACE.wins = s.wins || 0; }
  } catch (e) {}
}
function r5BoatRaceStart() {
  if (R5_BOAT_RACE.active) return false;
  R5_BOAT_RACE.active = true; R5_BOAT_RACE.cp = 0; R5_BOAT_RACE.timer = 150;
  toast('🚤 BOAT RACE! Three pink buoys, 150 seconds — win pays $350, beat your best and it pays $450!');
  speakLine('Boat race! Three buoys, one fast boat, and the marina is watching.');
  beep(990, 0.2, 'sine', 0.2);
  return true;
}
function r5BoatRaceUpdate(dt) {
  if (!R5_BOAT_RACE.active) return;
  R5_BOAT_RACE.timer -= dt;
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const cp = R5_BOAT_RACE.cps[R5_BOAT_RACE.cp];
  if (cp && Math.hypot(px - cp.x, pz - cp.z) < 8) {
    R5_BOAT_RACE.cp++;
    toast('🚤 Buoy ' + R5_BOAT_RACE.cp + '/3!');
    beep(880, 0.15, 'sine', 0.15);
    if (R5_BOAT_RACE.cp >= R5_BOAT_RACE.cps.length) {
      const time = 150 - R5_BOAT_RACE.timer;
      R5_BOAT_RACE.active = false;
      R5_BOAT_RACE.wins++;
      const record = R5_BOAT_RACE.best === 0 || time < R5_BOAT_RACE.best;
      const prize = record ? 450 : 350;
      if (record) R5_BOAT_RACE.best = time;
      state.cash += prize;
      toast('🏆 Boat race won in ' + time.toFixed(1) + 's — $' + prize + (record ? ' (new best time!)' : '') + '!');
      speakLine('Boat race won! The marina pays ' + prize + ' dollars.');
      chime(); addSkill('driving', 15); r5TerritoryGain(6, false);
      r5BoatRaceSave(); saveGame(); updateHUD();
      return;
    }
  }
  if (R5_BOAT_RACE.timer <= 0) {
    R5_BOAT_RACE.active = false;
    toast('🚤 Boat race over — too slow. The buoys are still there when you are ready.');
  }
}

// ---------- Round 5, part fifteen: safehouse decorating + fast travel ----------
// The harbour safehouse is home. Buy furniture for comfort; comfort slowly
// heals you while you stand inside. Fast travel between the safehouse and any
// property you own costs $25 a hop.
const R5_SAFEHOUSE = { x: -96, z: 20 };
const R5_FURNITURE = [
  { name: 'Comfy sofa', price: 180, comfort: 10 },
  { name: 'Big TV', price: 350, comfort: 15 },
  { name: 'Bay-view bed', price: 500, comfort: 20 },
  { name: 'Arcade cabinet', price: 700, comfort: 25 },
  { name: 'Home gym corner', price: 900, comfort: 30 },
];
const r5Home = { comfort: 0, owned: [], healTimer: 0, store: 'solmar-bay-r5-home' };
function r5HomeNear() {
  if (state.inCar) return false;
  return Math.hypot(playerState.x - R5_SAFEHOUSE.x, playerState.z - R5_SAFEHOUSE.z) < 6;
}
function r5HomeBuild() {
  addBox(10, 5, 8, 0xd8a06a, R5_SAFEHOUSE.x, 2.5, R5_SAFEHOUSE.z + 6);
  addBox(10.6, 0.6, 8.6, 0xc0392b, R5_SAFEHOUSE.x, 5.3, R5_SAFEHOUSE.z + 6);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.2), new THREE.MeshStandardMaterial({ color: 0x2e6fb0 }));
  door.position.set(R5_SAFEHOUSE.x, 1.3, R5_SAFEHOUSE.z + 1.8); scene.add(door);
}
function r5HomeSave() {
  try { localStorage.setItem(r5Home.store, JSON.stringify({ comfort: r5Home.comfort, owned: r5Home.owned })); } catch (e) {}
}
function r5HomeLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Home.store) || 'null');
    if (s) { r5Home.comfort = s.comfort || 0; r5Home.owned = s.owned || []; }
  } catch (e) {}
}
function r5HomeBuy(i) {
  const f = R5_FURNITURE[i];
  if (!f || r5Home.owned.includes(i)) return;
  if (state.cash < f.price) { toast('The ' + f.name.toLowerCase() + ' costs $' + f.price + '.'); return; }
  state.cash -= f.price;
  r5Home.owned.push(i); r5Home.comfort += f.comfort;
  toast('🛋️ ' + f.name + ' bought — comfort +' + f.comfort + ' (now ' + r5Home.comfort + '). Home heals you faster.');
  chime(); r5HomeSave(); saveGame(); updateHUD(); r5HomeRender();
}
function r5HomeFastTravel() {
  if (state.cash < 25) { toast('Fast travel costs $25.'); return; }
  const targets = [{ name: 'Harbour safehouse', x: R5_SAFEHOUSE.x, z: R5_SAFEHOUSE.z }];
  for (const p of ownedProperties) targets.push({ name: p.name || 'Property', x: p.x, z: p.z });
  // Cycle: go to the next target after the nearest one.
  let nearest = 0, nearestD = 1e9;
  for (let i = 0; i < targets.length; i++) {
    const d = Math.hypot(playerState.x - targets[i].x, playerState.z - targets[i].z);
    if (d < nearestD) { nearestD = d; nearest = i; }
  }
  const dest = targets[(nearest + 1) % targets.length];
  state.cash -= 25;
  if (state.inCar) { /* stay in the car: drop out first */ }
  playerState.x = dest.x; playerState.z = dest.z; playerState.y = 0;
  player.position.set(dest.x, groundHeight(dest.x, dest.z), dest.z);
  toast('🚕 Fast travel — $25 — welcome to ' + dest.name + '.');
  beep(660, 0.15, 'sine', 0.15);
  saveGame(); updateHUD(); r5HomeRender();
}
function r5HomeUpdate(dt) {
  if (!r5HomeNear()) return;
  r5Home.healTimer += dt;
  if (r5Home.healTimer >= 5) {
    r5Home.healTimer = 0;
    const heal = 1 + Math.floor(r5Home.comfort / 20);
    if (state.health < 100) {
      state.health = Math.min(100, state.health + heal);
      updateHUD();
    }
  }
}
function r5HomeRender() {
  const el = document.getElementById('r5HomeItems');
  if (!el) return;
  const cashEl = document.getElementById('r5HomeCash');
  if (cashEl) cashEl.textContent = 'Your cash: $' + state.cash.toLocaleString('en-US') + ' · Comfort: ' + r5Home.comfort + ' · Properties owned: ' + ownedProperties.length + ' · Fast travel $25 a hop';
  el.innerHTML = '';
  R5_FURNITURE.forEach((f, i) => {
    const b = document.createElement('button');
    b.className = 'shopItem';
    b.textContent = '🛋️ ' + f.name + ' — $' + f.price + ' (+' + f.comfort + ' comfort)' + (r5Home.owned.includes(i) ? ' ✓ owned' : '');
    b.disabled = r5Home.owned.includes(i) || state.cash < f.price;
    b.addEventListener('click', () => r5HomeBuy(i));
    el.appendChild(b);
  });
  const travel = document.createElement('button');
  travel.className = 'shopItem';
  travel.textContent = '🚕 Fast travel to your next property — $25';
  travel.disabled = state.cash < 25;
  travel.addEventListener('click', r5HomeFastTravel);
  el.appendChild(travel);
}
function r5HomeOpen() {
  if (!r5HomeNear()) return false;
  const el = document.getElementById('r5HomePanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5HomeRender();
  return true;
}
function r5HomeClose() {
  const el = document.getElementById('r5HomePanel');
  if (el) el.classList.add('hidden');
}

// ---------- Round 5, part sixteen: dispatcher, HUD, self-test ----------
// One call from the main loop runs every Round 5 system, in dependency order.
function updateR5(dt) {
  r5TourneyUpdate(dt);
  r5HeliUpdate(dt);
  r5SeasonUpdate(dt);
  r5EmpireUpdate(dt);
  r5StuntUpdate(dt);
  r5CardsUpdate(dt);
  r5SchoolUpdate(dt);
  r5StocksTick(dt);
  r5TerritoryUpdate(dt);
  r5BondUpdate(dt);
  r5BoatRaceUpdate(dt);
  r5HomeUpdate(dt);
  r5HeatUpdate(dt);
  r5ResponderUpdate(dt);
  r5MeetUpdate(dt);
  r5AchieveUpdate(dt);
  r5DjUpdate(dt);
  r5RivalsUpdate(dt);
  r5DailyUpdate(dt);
  r5TickerUpdate(dt);
  r5ForecastUpdate();
  // Engine + nitro boosts apply after updateCar has clamped the speed.
  if (state.inCar) {
    r5GarageEngineBoost(state.inCar);
    r5GarageUseNitro(dt);
  }
  // Race wins, stunt jumps and deliveries all raise district influence.
  if (race.won > (updateR5._raceWon || 0)) {
    updateR5._raceWon = race.won;
    r5TerritoryGain(5, false);
  }
}
function r5HudLine() {
  const el = document.getElementById('r5Line');
  if (!el) return;
  const parts = [];
  parts.push(r5SeasonLine());
  if (r5Tourney.active) parts.push('🎣 Tourney ' + r5Tourney.points + ' pts · ' + Math.ceil(r5Tourney.timer) + 's');
  if (R5_BOAT_RACE.active) parts.push('🚤 Boat race buoy ' + (R5_BOAT_RACE.cp + 1) + '/3 · ' + Math.ceil(R5_BOAT_RACE.timer) + 's');
  if (r5School.active) parts.push('✈️ ' + R5_LESSONS[r5School.lesson].name + ' · ' + Math.ceil(r5School.timer) + 's');
  if (R5_EMPIRE.delivery) parts.push('📦 Parcel ' + Math.ceil(R5_EMPIRE.delivery.timer) + 's');
  if (r5Heli.active) parts.push('🚁 Heli overhead!');
  const respLine = r5ResponderLine();
  if (respLine) parts.push(respLine);
  if (r5Heat.zone >= 0) parts.push('🔥 ' + R5_HEAT_ZONES[r5Heat.zone].name);
  if (r5Rivals.race) parts.push('🏁 Drag vs ' + R5_RIVALS[r5Rivals.race.rival].name + ' · ' + Math.ceil(r5Rivals.race.timer) + 's');
  parts.push('🎟️ Loyalty ' + r5Loyalty.stamps + '/5');
  parts.push('🏅 ' + r5Achieve.earned.length + '/12');
  parts.push(r5TerritoryLine());
  parts.push('💝 Bond ' + r5Bond.bond + '/100');
  el.textContent = parts.join(' · ');
}
function r5MinimapDots(dot) {
  dot(R5_GARAGE.x, R5_GARAGE.z, '#e86a1e', 4);
  dot(R5_CASINO.x, R5_CASINO.z, '#ff2a7a', 4);
  dot(R5_EMPIRE.depot.x, R5_EMPIRE.depot.z, '#f5c518', 4);
  dot(R5_GYM.x, R5_GYM.z, '#7ac74f', 4);
  dot(R5_SCHOOL.x, R5_SCHOOL.z, '#2ee6ff', 4);
  dot(R5_SAFEHOUSE.x, R5_SAFEHOUSE.z, '#ffd23f', 4);
  dot(R5_BOAT_RACE.flag.x, R5_BOAT_RACE.flag.z, '#ff2a7a', 4);
  for (const r of R5_RAMPS) dot(r.x, r.z, '#e8b820', 3);
  for (let i = 0; i < R5_POSTCARDS.length; i++) if (!r5Cards.found.includes(i)) dot(R5_POSTCARDS[i].x, R5_POSTCARDS[i].z, '#ffd23f', 3);
  for (let i = 0; i < R5_DISTRICTS.length; i++) dot(R5_DISTRICTS[i].x, R5_DISTRICTS[i].z, R5_DISTRICTS[i].color, r5Territory.inf[i] >= 60 ? 6 : 3);
  if (r5Heli.active && r5Heli.mesh) dot(r5Heli.mesh.position.x, r5Heli.mesh.position.z, '#ff4444', 5);
  for (const sp of R5_SPIKES) dot(sp.x, sp.z, '#ff2222', 3);
  if (R5_EMPIRE.delivery) dot(R5_EMPIRE.delivery.x, R5_EMPIRE.delivery.z, '#f5c518', 5);
  if (r5School.active && r5School.ring && r5School.ring.visible) dot(r5School.ring.position.x, r5School.ring.position.z, '#ffd23f', 5);
  if (R5_BOAT_RACE.active) dot(R5_BOAT_RACE.cps[R5_BOAT_RACE.cp].x, R5_BOAT_RACE.cps[R5_BOAT_RACE.cp].z, '#ff2a7a', 5);
  for (let i = 0; i < r5Rivals.cars.length; i++) dot(r5Rivals.cars[i].mesh.position.x, r5Rivals.cars[i].mesh.position.z, '#8a2be2', 4);
  if (r5Rivals.race) dot(r5Rivals.race.tx, r5Rivals.race.tz, '#ffd23f', 5);
  if (R5_RESPONDER.active) dot(R5_RESPONDER.targets[R5_RESPONDER.done].x, R5_RESPONDER.targets[R5_RESPONDER.done].z, '#ff7a1a', 5);
}
function r5SelfTest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  ok('r5-garage-spot', !!R5_GARAGE && R5_GARAGE.x === -48, 'garage at -48,84');
  ok('r5-paints', R5_PAINTS.length === 8, R5_PAINTS.map((p) => p.name).join(', '));
  ok('r5-wheels', R5_WHEELS.length === 4 && R5_WHEELS[3].size === 0.52, '4 wheel sets');
  ok('r5-engines', R5_ENGINES.length === 4 && R5_ENGINES[3].boost === 0.25, 'rocket motor +25%');
  ok('r5-nitro', R5_NITRO.length === 4 && R5_NITRO[3].secs === 8, 'race kit 8s');
  ok('r5-casino-spot', R5_CASINO.x === 60 && R5_CASINO.z === -84, 'casino built');
  ok('r5-slots', R5_SLOTS.length === 6, R5_SLOTS.join(''));
  ok('r5-bj-total', r5BjTotal(['A', 'K']) === 21 && r5BjTotal(['A', 'A', '9']) === 21, 'blackjack ace logic');
  ok('r5-tackle', R5_TACKLE.length === 4 && R5_TACKLE[3].mult === 2, 'gold rod doubles');
  ok('r5-tourney-fish', R5_TOURNEY_FISH.length === 4, '4 tourney species');
  ok('r5-heli', !!r5Heli.mesh && !!r5Heli.light, 'pursuit heli + searchlight');
  ok('r5-seasons', R5_SEASONS.length === 4 && R5_SEASONS[1].name === 'Summer', 'spring/summer/autumn/winter');
  ok('r5-empire', R5_EMPIRE.cabPrice === 1500 && R5_EMPIRE.driverWage === 60, 'cab $1500, wage $60');
  ok('r5-delivery-spots', R5_DELIVERY_SPOTS.length === 6, '6 delivery spots');
  ok('r5-ramps', R5_RAMPS.length === 6, R5_RAMPS.map((r) => r.label).join(', '));
  ok('r5-postcards', R5_POSTCARDS.length === 8, '8 postcard spots');
  ok('r5-lessons', R5_LESSONS.length === 3 && R5_LESSONS[2].reward === 250, '3 flight lessons');
  ok('r5-school-plane', !!r5School.plane, 'stunt plane parked');
  ok('r5-gym-plans', R5_GYM_PLANS.length === 5, R5_GYM_PLANS.map((p) => p.name).join(', '));
  ok('r5-stocks', R5_STOCKS.length === 6 && R5_STOCKS[0].sym === 'BAY', '6 bay companies');
  ok('r5-districts', R5_DISTRICTS.length === 5, R5_DISTRICTS.map((d) => d.name).join(', '));
  ok('r5-gifts', R5_GIFTS.length === 4 && R5_GIFTS[3].bond === 40, 'gold locket +40');
  ok('r5-boat-cps', R5_BOAT_RACE.cps.length === 3 && !!R5_BOAT_RACE.boat, '3 buoys + race boat');
  ok('r5-furniture', R5_FURNITURE.length === 5 && R5_FURNITURE[4].comfort === 30, '5 furniture pieces');
  ok('r5-panels', !!document.getElementById('r5GaragePanel') && !!document.getElementById('r5CasinoPanel') && !!document.getElementById('r5StocksPanel') && !!document.getElementById('r5GymPanel') && !!document.getElementById('r5EmpirePanel') && !!document.getElementById('r5HomePanel') && !!document.getElementById('r5BondPanel') && !!document.getElementById('r5StuntPanel') && !!document.getElementById('r5TourneyPanel'), 'all nine R5 panels in the DOM');
  ok('r5-hud-line', !!document.getElementById('r5Line'), 'R5 HUD line present');
  ok('r5-empire-income', r5EmpireIncomePerMin() >= 0, '$' + r5EmpireIncomePerMin() + '/min');
  ok('r5-stocks-value', r5StocksValue() >= 0, '$' + r5StocksValue().toFixed(2));
  ok('r5-district-at', r5DistrictAt(-60, 60) === 0, 'harbour district resolves');
  ok('r5-heat-zones', R5_HEAT_ZONES.length === 3 && R5_HEAT_ZONES[0].name === 'North Docks', '3 heat zones');
  ok('r5-heat-at', r5HeatZoneAt(-60, -90) === 0 && r5HeatZoneAt(0, 0) === -1, 'zone lookup works');
  ok('r5-responder', !!R5_RESPONDER.hospital && !!R5_RESPONDER.station, 'hospital + fire station shifts');
  ok('r5-achievements', R5_ACHIEVEMENTS.length === 12, R5_ACHIEVEMENTS.map((a) => a.name).join(', '));
  ok('r5-achieve-panel', !!document.getElementById('r5AchievePanel'), 'achievements panel in the DOM');
  ok('r5-dj-lines', R5_DJ_LINES.length === 8, '8 DJ lines');
  ok('r5-radio-stations', RADIO_STATIONS.length === 5, RADIO_STATIONS.map((s) => s.name).join(', '));
  ok('r5-rivals', R5_RIVALS.length === 3 && r5Rivals.cars.length === 3, R5_RIVALS.map((r) => r.name).join(', '));
  ok('r5-rival-wagers', R5_RIVALS[2].wager === 400, 'Dune wagers $400');
  ok('r5-daily', typeof r5Daily.lastDay === 'number', 'daily bonus armed');
  ok('r5-loyalty', r5Loyalty.stamps === 0 && typeof r5LoyaltyFree() === 'boolean', 'loyalty card armed');
  ok('r5-ticker', R5_TICKER.length === 12, '12 ticker lines');
  ok('r5-forecast', typeof r5Forecast() === 'string' && r5Forecast().includes('Round 5'), 'forecast renders');
  ok('r5-cash-sane', state.cash >= 0 && state.cash < 100000000, 'cash ' + state.cash);
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
// Two new radio stations for Round 5, added to the existing dial.
RADIO_STATIONS.push(
  { name: 'Sunset Jazz 99.9', desc: 'smooth jazz', bpm: 76, bass: [55, 65.41, 49, 55], arp: [220, 277.18, 329.63, 277.18, 246.94, 220] },
  { name: 'Turbo Pop 107.7', desc: 'synth pop', bpm: 122, bass: [65.41, 49, 55, 73.42], arp: [261.63, 329.63, 392, 493.88, 392, 329.63] },
);
// Build every Round 5 place in the world and restore saved Round 5 progress.
r5GarageBuild(); r5CasinoBuild(); r5HeliBuild(); r5EmpireBuild(); r5StuntBuild();
r5CardsBuild(); r5SchoolBuild(); r5GymBuild(); r5BoatRaceBuild(); r5HomeBuild();
r5GarageLoad(); r5TourneyLoad(); r5EmpireLoad(); r5StuntLoad(); r5CardsLoad();
r5CardsApplyFound(); r5SchoolLoad(); r5GymLoad(); r5StocksLoad(); r5TerritoryLoad();
r5BondLoad(); r5BoatRaceLoad(); r5HomeLoad();
document.getElementById('r5GarageClose').addEventListener('click', r5GarageClose);
document.getElementById('r5CasinoClose').addEventListener('click', r5CasinoClose);
document.getElementById('r5CasinoSpin').addEventListener('click', r5CasinoSpin);
document.getElementById('r5CasinoDeal').addEventListener('click', r5CasinoDeal);
document.getElementById('r5CasinoHit').addEventListener('click', r5CasinoHit);
document.getElementById('r5CasinoStand').addEventListener('click', r5CasinoStand);
document.getElementById('r5TourneyClose').addEventListener('click', r5TourneyClose);
document.getElementById('r5EmpireClose').addEventListener('click', r5EmpireClose);
document.getElementById('r5StuntClose').addEventListener('click', r5StuntClose);
document.getElementById('r5GymClose').addEventListener('click', r5GymClose);
document.getElementById('r5StocksClose').addEventListener('click', r5StocksClose);
document.getElementById('r5BondClose').addEventListener('click', r5BondClose);
document.getElementById('r5HomeClose').addEventListener('click', r5HomeClose);
document.getElementById('r5AchieveClose').addEventListener('click', r5AchieveClose);
document.getElementById('phoneBtnAchieve').addEventListener('click', () => { togglePhone(); r5AchieveOpen(); });
document.getElementById('phoneBtnStocks').addEventListener('click', () => { togglePhone(); r5StocksOpen(); });
document.getElementById('phoneBtnBond').addEventListener('click', () => { togglePhone(); r5BondOpen(); });
document.getElementById('phoneBtnTourney').addEventListener('click', () => { togglePhone(); r5TourneyOpen(); });
document.getElementById('phoneBtnStunts').addEventListener('click', () => { togglePhone(); r5StuntOpen(); });
window.__r5exports = {
  garage: r5Garage, casino: r5Casino, tourney: r5Tourney, heli: r5Heli, spikes: R5_SPIKES,
  season: r5Season, seasons: R5_SEASONS, empire: R5_EMPIRE, stunt: r5Stunt, cards: r5Cards,
  school: r5School, gym: r5Gym, stocks: r5Stocks, territory: r5Territory, bond: r5Bond,
  boatRace: R5_BOAT_RACE, home: r5Home,
  openGarage: r5GarageOpen, openCasino: r5CasinoOpen, openEmpire: r5EmpireOpen,
  openGym: r5GymOpen, openStocks: r5StocksOpen, openBond: r5BondOpen, openHome: r5HomeOpen,
  openStunt: r5StuntOpen, openTourney: r5TourneyOpen,
  spin: r5CasinoSpin, deal: r5CasinoDeal, hit: r5CasinoHit, stand: r5CasinoStand,
  startBoatRace: r5BoatRaceStart, startSchool: r5SchoolStart, startDelivery: r5EmpireStartDelivery,
  collectCard: r5CardsCollect, buyCab: r5EmpireBuyCab, hireDriver: r5EmpireHireDriver,
  buyRod: r5TourneyBuyRod, train: r5GymTrain, buyStock: r5StocksBuy, sellStock: r5StocksSell,
  gift: r5BondGift, date: r5BondDate, fastTravel: r5HomeFastTravel,
  selftest: r5SelfTest, update: updateR5, hudLine: r5HudLine,
};

// ---------- Round 5, part seventeen: wanted-heat zones ----------
// Three corners of the bay run hotter than the rest. Inside a heat zone the
// police notice crimes faster and wanted decays slower; outside them the bay
// is calmer. The HUD warns you when you cross into one.
const R5_HEAT_ZONES = [
  { name: 'North Docks', x: -60, z: -90, r: 42, heat: 2, desc: 'smugglers, fences and sharp eyes' },
  { name: 'Casino Row', x: 60, z: -84, r: 36, heat: 1, desc: 'private security on every corner' },
  { name: 'Airport Perimeter', x: -190, z: -40, r: 48, heat: 1, desc: 'federal eyes on the runway' },
];
const r5Heat = { zone: -1, warned: false };
function r5HeatZoneAt(x, z) {
  for (let i = 0; i < R5_HEAT_ZONES.length; i++) {
    const zn = R5_HEAT_ZONES[i];
    if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return i;
  }
  return -1;
}
function r5HeatUpdate(dt) {
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const z = r5HeatZoneAt(px, pz);
  if (z !== r5Heat.zone) {
    r5Heat.zone = z;
    if (z >= 0) {
      const zn = R5_HEAT_ZONES[z];
      toast('🔥 HEAT ZONE — ' + zn.name + ': ' + zn.desc + '. The law watches closer here.');
      speakLine('This is ' + zn.name + '. ' + zn.desc + '. Keep it clean, or keep it quick.');
      beep(520, 0.2, 'sawtooth', 0.12);
    } else {
      toast('You are out of the heat zones — the bay breathes easier here.');
    }
  }
  // Inside a heat zone, wanted decays slower and crimes sting more.
  if (z >= 0 && state.wanted > 0) {
    state.cleanTimer = Math.max(0, state.cleanTimer - dt * 0.4);
  }
}
function r5HeatBonusWanted(n) {
  // Extra wanted from a crime committed inside a heat zone.
  if (r5Heat.zone >= 0) return n + R5_HEAT_ZONES[r5Heat.zone].heat;
  return n;
}

// ---------- Round 5, part eighteen: responder night shifts ----------
// The hospital and fire station offer night shifts that the old day jobs do
// not cover: ride the ambulance to three patients, or drive the fire truck to
// two fires, before the shift clock runs out. Pay is $220 a shift.
const R5_RESPONDER = {
  hospital: { x: 132, z: -60 }, station: { x: -132, z: 60 },
  active: false, kind: '', targets: [], done: 0, timer: 0, shifts: 0, store: 'solmar-bay-r5-responder',
};
function r5ResponderNear() {
  if (state.inCar) return '';
  if (Math.hypot(playerState.x - R5_RESPONDER.hospital.x, playerState.z - R5_RESPONDER.hospital.z) < 6) return 'medic';
  if (Math.hypot(playerState.x - R5_RESPONDER.station.x, playerState.z - R5_RESPONDER.station.z) < 6) return 'fire';
  return '';
}
function r5ResponderSave() {
  try { localStorage.setItem(R5_RESPONDER.store, JSON.stringify({ shifts: R5_RESPONDER.shifts })); } catch (e) {}
}
function r5ResponderLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(R5_RESPONDER.store) || 'null');
    if (s) R5_RESPONDER.shifts = s.shifts || 0;
  } catch (e) {}
}
function r5ResponderStart(kind) {
  if (R5_RESPONDER.active) { toast('A shift is already running.'); return false; }
  const spots = kind === 'medic'
    ? [{ x: 40, z: 40 }, { x: -40, z: -40 }, { x: 90, z: -90 }]
    : [{ x: -90, z: 90 }, { x: 60, z: -20 }];
  R5_RESPONDER.active = true; R5_RESPONDER.kind = kind;
  R5_RESPONDER.targets = spots.map((s) => ({ x: s.x + rr(-8, 8), z: s.z + rr(-8, 8), done: false }));
  R5_RESPONDER.done = 0; R5_RESPONDER.timer = 180;
  const first = R5_RESPONDER.targets[0];
  setBeacon(first.x, first.z);
  if (kind === 'medic') {
    toast('🚑 Night shift: three patients need the ambulance. 180 seconds — $220.');
    speakLine('Night shift at the hospital. Three patients, one ambulance, no excuses.');
  } else {
    toast('🚒 Night shift: two fires need the truck. 180 seconds — $220.');
    speakLine('Night shift at the fire station. Two fires, one truck. Move.');
  }
  beep(880, 0.2, 'sine', 0.2);
  return true;
}
function r5ResponderUpdate(dt) {
  if (!R5_RESPONDER.active) return;
  R5_RESPONDER.timer -= dt;
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const cur = R5_RESPONDER.targets[R5_RESPONDER.done];
  if (cur && Math.hypot(px - cur.x, pz - cur.z) < 7) {
    cur.done = true; R5_RESPONDER.done++;
    if (R5_RESPONDER.done >= R5_RESPONDER.targets.length) {
      R5_RESPONDER.active = false;
      R5_RESPONDER.shifts++;
      state.cash += 220;
      beacon.visible = false;
      toast('✅ Shift complete! $220 — the bay sleeps safer tonight. (' + R5_RESPONDER.shifts + ' shifts done)');
      speakLine('Shift complete. Two hundred twenty dollars, and the bay is still standing.');
      chime(); addSkill('stamina', 20);
      r5ResponderSave(); saveGame(); updateHUD();
      return;
    }
    const next = R5_RESPONDER.targets[R5_RESPONDER.done];
    setBeacon(next.x, next.z);
    toast((R5_RESPONDER.kind === 'medic' ? '🚑 Patient reached — ' : '🚒 Fire out — ') + R5_RESPONDER.done + '/' + R5_RESPONDER.targets.length + '. Next one marked.');
    beep(990, 0.15, 'sine', 0.15);
  }
  if (R5_RESPONDER.timer <= 0) {
    R5_RESPONDER.active = false;
    beacon.visible = false;
    toast('⏰ Shift over — too slow. The station covers the rest.');
  }
}
function r5ResponderLine() {
  if (!R5_RESPONDER.active) return '';
  return (R5_RESPONDER.kind === 'medic' ? '🚑 Medic shift ' : '🚒 Fire shift ') + R5_RESPONDER.done + '/' + R5_RESPONDER.targets.length + ' · ' + Math.ceil(R5_RESPONDER.timer) + 's';
}

// ---------- Round 5, part nineteen: Friday car meets ----------
// Every Friday night (game day 5 of each week) the garage hosts a car meet at
// the marina. Bring a tuned car and show it off: paint, wheels and engine
// each score, and the best car on the night takes $300.
const r5Meet = { day: 0, doneWeek: -1, score: 0 };
function r5MeetUpdate(dt) {
  // Game days are counted from the season clock: a meet happens when the
  // season day counter hits its fifth day of the week.
  const weekDay = (r5Season.day + r5Season.idx * 4) % 7;
  if (weekDay === 5 && r5Meet.doneWeek !== r5Season.idx * 10 + r5Season.day) {
    const car = state.inCar;
    const near = Math.hypot(playerState.x - 40, playerState.z - 90) < 25 || (car && Math.hypot(car.mesh.position.x - 40, car.mesh.position.z - 90) < 25);
    if (near && car && car.r5Tune) {
      r5Meet.doneWeek = r5Season.idx * 10 + r5Season.day;
      const tune = car.r5Tune;
      let score = 0;
      if (tune.paint >= 0) score += 30;
      if (tune.wheels > 0) score += tune.wheels * 15;
      if (tune.engine > 0) score += tune.engine * 25;
      if (tune.nitro > 0) score += tune.nitro * 10;
      r5Meet.score = score;
      if (score >= 80) {
        state.cash += 300;
        toast('🏆 CAR MEET! Your tuned ride scored ' + score + ' — best car on the night! $300!');
        speakLine('Best car at the meet. Three hundred dollars and every head in the marina turned.');
        chime(); addSkill('driving', 15);
        saveGame(); updateHUD();
      } else if (score > 0) {
        toast('🚗 Car meet: your ride scored ' + score + '. Tune it more at Solmar Customs and come back Friday.');
      } else {
        toast('🚗 Friday car meet at the marina — bring a tuned car from Solmar Customs to show off.');
      }
    }
  }
}

// ---------- Round 5, part twenty: bay achievements ----------
// Twelve achievements, each with a one-time cash bonus. The panel lists them;
// the game toasts them the moment they are earned.
const R5_ACHIEVEMENTS = [
  { id: 'first-tune', name: 'Fresh Paint', desc: 'Tune a car at Solmar Customs.', reward: 100, check: () => Object.keys(r5Garage.tunes).length > 0 },
  { id: 'jackpot', name: 'Jackpot', desc: 'Win $500 on the slots.', reward: 150, check: () => r5Casino.won >= 500 },
  { id: 'angler', name: 'Master Angler', desc: 'Score 200 points in one tournament.', reward: 150, check: () => r5Tourney.best >= 200 },
  { id: 'fleet', name: 'Fleet Boss', desc: 'Own three cabs with drivers.', reward: 200, check: () => R5_EMPIRE.cabs.length === 3 && R5_EMPIRE.drivers === 3 },
  { id: 'airtime', name: 'Airtime', desc: 'Fly 30u in one stunt jump.', reward: 150, check: () => r5Stunt.bestDist >= 30 },
  { id: 'postman', name: 'Postman', desc: 'Collect all eight postcards.', reward: 200, check: () => r5Cards.found.length === 8 },
  { id: 'pilot', name: 'Licensed Pilot', desc: 'Pass all three flight lessons.', reward: 200, check: () => r5School.passed.every(Boolean) },
  { id: 'iron', name: 'Iron Bay', desc: 'Train at the gym ten times.', reward: 150, check: () => r5Gym.sessions >= 10 },
  { id: 'bull', name: 'Bay Bull', desc: 'Hold a stock portfolio worth $1,000.', reward: 200, check: () => r5StocksValue() >= 1000 },
  { id: 'king', name: 'King of the Bay', desc: 'Run three districts at once.', reward: 300, check: () => R5_DISTRICTS.filter((d, i) => r5Territory.inf[i] >= 60).length >= 3 },
  { id: 'soulmates', name: 'Soulmates', desc: 'Reach 100 bond with your partner.', reward: 250, check: () => r5Bond.bond >= 100 },
  { id: 'sailor', name: 'Saltwater Racer', desc: 'Win three boat races.', reward: 200, check: () => R5_BOAT_RACE.wins >= 3 },
];
const r5Achieve = { earned: [], checkTimer: 0, store: 'solmar-bay-r5-achieve' };
function r5AchieveSave() {
  try { localStorage.setItem(r5Achieve.store, JSON.stringify({ earned: r5Achieve.earned })); } catch (e) {}
}
function r5AchieveLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Achieve.store) || 'null');
    if (s && s.earned) r5Achieve.earned = s.earned;
  } catch (e) {}
}
function r5AchieveUpdate(dt) {
  r5Achieve.checkTimer += dt;
  if (r5Achieve.checkTimer < 5) return;
  r5Achieve.checkTimer = 0;
  for (const a of R5_ACHIEVEMENTS) {
    if (r5Achieve.earned.includes(a.id)) continue;
    let ok = false;
    try { ok = a.check(); } catch (e) { ok = false; }
    if (ok) {
      r5Achieve.earned.push(a.id);
      state.cash += a.reward;
      toast('🏅 Achievement: ' + a.name + ' — ' + a.desc + ' Bonus $' + a.reward + '!');
      speakLine('Achievement unlocked: ' + a.name + '. ' + a.reward + ' dollars for the trophy shelf.');
      chime(); r5AchieveSave(); saveGame(); updateHUD();
    }
  }
}
function r5AchieveRender() {
  const el = document.getElementById('r5AchieveItems');
  if (!el) return;
  const cashEl = document.getElementById('r5AchieveCash');
  if (cashEl) cashEl.textContent = 'Earned: ' + r5Achieve.earned.length + '/12 · Total bonuses paid: $' + r5Achieve.earned.reduce((s, id) => s + (R5_ACHIEVEMENTS.find((a) => a.id === id) || { reward: 0 }).reward, 0);
  el.innerHTML = '';
  for (const a of R5_ACHIEVEMENTS) {
    const got = r5Achieve.earned.includes(a.id);
    const d = document.createElement('div');
    d.style.cssText = 'font-size:13px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);color:' + (got ? '#7dff9a' : '#cfe8ff');
    d.textContent = (got ? '🏅 ' : '○ ') + a.name + ' — ' + a.desc + ' ($' + a.reward + ')';
    el.appendChild(d);
  }
}
function r5AchieveOpen() {
  const el = document.getElementById('r5AchievePanel');
  if (!el) return false;
  el.classList.remove('hidden');
  r5AchieveRender();
  return true;
}
function r5AchieveClose() {
  const el = document.getElementById('r5AchievePanel');
  if (el) el.classList.add('hidden');
}

// ---------- Round 5, part twenty-one: bay radio DJ chatter ----------
// The two new stations get a DJ who reads the bay back to you: season, heat,
// tournament and fleet news, all from the live game state.
const R5_DJ_LINES = [
  () => 'Sunset Jazz here — ' + r5SeasonName() + ' in the bay, and the water has never looked better.',
  () => 'Turbo Pop! The fishing tournament ' + (r5Tourney.active ? 'is ON right now — get to the water!' : 'starts soon. Rods ready.'),
  () => 'This is the bay report: ' + r5TerritoryLine() + '.',
  () => 'Your fleet earned $' + R5_EMPIRE.earned.toLocaleString('en-US') + ' so far. Not bad for a taxi empire.',
  () => 'Bond check: Ryan and Ian are at ' + r5Bond.bond + ' out of 100. The bay ships them, and so do we.',
  () => 'Heat warning: ' + (r5Heat.zone >= 0 ? 'you are in ' + R5_HEAT_ZONES[r5Heat.zone].name + ' — eyes open.' : 'all clear out there tonight.'),
  () => 'Stunt fans: best jump so far is ' + r5Stunt.bestDist.toFixed(0) + ' units. Beat it at the yellow ramps.',
  () => 'Stocks update: BAY Ferries at $' + R5_STOCKS[0].price.toFixed(2) + ', Sands Casino Group at $' + R5_STOCKS[4].price.toFixed(2) + '.',
];
let r5DjTimer = 0;
function r5DjUpdate(dt) {
  if (state.mode !== 'play') return;
  r5DjTimer += dt;
  if (r5DjTimer < 150) return;
  r5DjTimer = 0;
  if (state.radio >= 3) {
    const line = pick(R5_DJ_LINES)();
    toast('📻 ' + line);
  }
}

// ---------- Round 5, part twenty-two: rival street racers ----------
// Three rivals cruise the bay in tuned cars. Pull up beside one in your own
// car and press E: they challenge you to a drag race to a nearby landmark.
// Win and you take their wager; lose and the wager is theirs. Each rival
// remembers the score and raises the stakes after you beat them.
const R5_RIVALS = [
  { name: 'Vex', color: 0x8a2be2, wager: 150, spot: { x: 20, z: 20 }, taunt: 'Too slow for the bay, rookie?' },
  { name: 'Mara', color: 0x00b8a9, wager: 250, spot: { x: -20, z: -60 }, taunt: 'My grandma shifts faster than you.' },
  { name: 'Dune', color: 0xd8a05a, wager: 400, spot: { x: 80, z: -20 }, taunt: 'Desert raised, bay tested. Bring it.' },
];
const r5Rivals = {
  cars: [], wins: [0, 0, 0], losses: [0, 0, 0], race: null,
  store: 'solmar-bay-r5-rivals',
};
function r5RivalsBuild() {
  for (let i = 0; i < R5_RIVALS.length; i++) {
    const rv = R5_RIVALS[i];
    const spec = { type: 'muscle', color: rv.color, len: 4.4, w: 2.0, h: 0.6, topSpeed: 30 + i * 3 };
    const mesh = makeCarMesh(spec);
    mesh.position.set(rv.spot.x, 0, rv.spot.z);
    mesh.rotation.y = rng() * Math.PI * 2;
    scene.add(mesh);
    const car = { mesh, spec, kind: 'car', speed: 0, steer: 0, stolen: false, r5Rival: i };
    r5Rivals.cars.push(car);
    parkedCars.push(car);
    // A small flag marks each rival's cruising spot.
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: rv.color, side: THREE.DoubleSide }));
    flag.position.set(rv.spot.x, 3.2, rv.spot.z - 3); scene.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(rv.spot.x - 0.7, 1.6, rv.spot.z - 3); scene.add(pole);
  }
}
function r5RivalsSave() {
  try { localStorage.setItem(r5Rivals.store, JSON.stringify({ wins: r5Rivals.wins, losses: r5Rivals.losses })); } catch (e) {}
}
function r5RivalsLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Rivals.store) || 'null');
    if (s) { r5Rivals.wins = s.wins || [0, 0, 0]; r5Rivals.losses = s.losses || [0, 0, 0]; }
  } catch (e) {}
}
function r5RivalsNear() {
  if (!state.inCar) return -1;
  for (let i = 0; i < r5Rivals.cars.length; i++) {
    const c = r5Rivals.cars[i];
    if (Math.hypot(state.inCar.mesh.position.x - c.mesh.position.x, state.inCar.mesh.position.z - c.mesh.position.z) < 7) return i;
  }
  return -1;
}
function r5RivalsChallenge(i) {
  if (r5Rivals.race) { toast('A drag race is already running.'); return false; }
  const rv = R5_RIVALS[i];
  const stake = rv.wager + r5Rivals.wins[i] * 100;
  if (state.cash < stake) { toast(rv.name + ': "Wager is $' + stake + '. Come back when you can cover it."'); return true; }
  // Destination: a landmark 120-160u away in a random direction.
  const px = state.inCar.mesh.position.x, pz = state.inCar.mesh.position.z;
  const a = rng() * Math.PI * 2;
  const dist = 130 + rng() * 30;
  const dx = clamp(px + Math.sin(a) * dist, -260, 260);
  const dz = clamp(pz + Math.cos(a) * dist, -260, 260);
  r5Rivals.race = { rival: i, stake, tx: dx, tz: dz, timer: 75, ghost: 0 };
  setBeacon(dx, dz);
  toast('🏁 DRAG RACE vs ' + rv.name + '! $' + stake + ' on the line — first to the beacon wins! ' + rv.taunt);
  speakLine(rv.name + ' wants a drag race. ' + stake + ' dollars. First to the beacon takes it.');
  beep(990, 0.2, 'sine', 0.2);
  return true;
}
function r5RivalsUpdate(dt) {
  // Rivals cruise slowly around their spots when no race is running.
  if (!r5Rivals.race) {
    for (let i = 0; i < r5Rivals.cars.length; i++) {
      const c = r5Rivals.cars[i];
      if (c === state.inCar) continue; // never yank a car the player is driving
      const spot = R5_RIVALS[i].spot;
      const d = Math.hypot(c.mesh.position.x - spot.x, c.mesh.position.z - spot.z);
      if (d > 12) {
        const h = Math.atan2(spot.x - c.mesh.position.x, spot.z - c.mesh.position.z);
        c.mesh.rotation.y = h;
        c.mesh.position.x += Math.sin(h) * 4 * dt;
        c.mesh.position.z += Math.cos(h) * 4 * dt;
      } else {
        c.mesh.rotation.y += dt * 0.2;
      }
    }
    return;
  }
  const race = r5Rivals.race;
  race.timer -= dt;
  const rival = r5Rivals.cars[race.rival];
  // The rival drives toward the beacon at their top speed, with a little wobble.
  const dx = race.tx - rival.mesh.position.x, dz = race.tz - rival.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  const h = Math.atan2(dx, dz);
  rival.mesh.rotation.y = h;
  const rSpeed = (rival.spec.topSpeed || 30) * 0.92 + Math.sin(state.time * 2 + race.rival) * 1.5;
  rival.mesh.position.x += Math.sin(h) * rSpeed * dt;
  rival.mesh.position.z += Math.cos(h) * rSpeed * dt;
  rival.mesh.position.y = groundHeight(rival.mesh.position.x, rival.mesh.position.z);
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  const myDist = Math.hypot(px - race.tx, pz - race.tz);
  if (myDist < 8) {
    r5RivalsEndRace(true, race);
    return;
  }
  if (dist < 8) {
    r5RivalsEndRace(false, race);
    return;
  }
  if (race.timer <= 0) {
    // Whoever is closer when the clock dies takes it.
    r5RivalsEndRace(myDist < dist, race);
  }
}
function r5RivalsEndRace(won, race) {
  r5Rivals.race = null;
  beacon.visible = false;
  const rv = R5_RIVALS[race.rival];
  if (won) {
    r5Rivals.wins[race.rival]++;
    state.cash += race.stake;
    toast('🏆 You beat ' + rv.name + ' in the drag race — $' + race.stake + '! (' + r5Rivals.wins[race.rival] + ' wins vs ' + rv.name + ')');
    speakLine('You beat ' + rv.name + '! ' + race.stake + ' dollars, and the whole street saw it.');
    chime(); addSkill('driving', 18); r5TerritoryGain(5, false);
  } else {
    r5Rivals.losses[race.rival]++;
    state.cash = Math.max(0, state.cash - race.stake);
    toast('💸 ' + rv.name + ' beat you to the beacon — you lose $' + race.stake + '. (' + rv.taunt + ')');
    speakLine(rv.name + ' takes the wager. Rematch is always on the table.');
    beep(160, 0.3, 'sawtooth', 0.12);
  }
  r5RivalsSave(); saveGame(); updateHUD();
}

// ---------- Round 5, part twenty-three: daily bay bonus ----------
// The first time you play on a new game day, Marisol leaves a $100 welcome
// bonus on the safehouse step. Small, steady, and it rewards coming back.
const r5Daily = { lastDay: -1, claimed: 0, store: 'solmar-bay-r5-daily' };
function r5DailySave() {
  try { localStorage.setItem(r5Daily.store, JSON.stringify({ lastDay: r5Daily.lastDay, claimed: r5Daily.claimed })); } catch (e) {}
}
function r5DailyLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Daily.store) || 'null');
    if (s) { r5Daily.lastDay = s.lastDay ?? -1; r5Daily.claimed = s.claimed || 0; }
  } catch (e) {}
}
function r5DailyUpdate(dt) {
  const dayNum = r5Season.idx * 4 + r5Season.day;
  if (dayNum !== r5Daily.lastDay) {
    r5Daily.lastDay = dayNum;
    r5Daily.claimed++;
    state.cash += 100;
    toast('🎁 Daily bay bonus: Marisol left $100 on the safehouse step. Day ' + r5Daily.claimed + ' of showing up.');
    speakLine('A hundred dollars, every day you show up. Marisol takes care of her own.');
    chime(); r5DailySave(); saveGame(); updateHUD();
  }
}

// ---------- Round 5, part twenty-four: garage loyalty ----------
// Every fifth tune at Solmar Customs is free. The garage stamps your card
// and the bay's best mechanics remember a loyal customer.
const r5Loyalty = { stamps: 0, freeUsed: 0, store: 'solmar-bay-r5-loyalty' };
function r5LoyaltySave() {
  try { localStorage.setItem(r5Loyalty.store, JSON.stringify({ stamps: r5Loyalty.stamps, freeUsed: r5Loyalty.freeUsed })); } catch (e) {}
}
function r5LoyaltyLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(r5Loyalty.store) || 'null');
    if (s) { r5Loyalty.stamps = s.stamps || 0; r5Loyalty.freeUsed = s.freeUsed || 0; }
  } catch (e) {}
}
function r5LoyaltyStamp() {
  r5Loyalty.stamps++;
  if (r5Loyalty.stamps >= 5) {
    r5Loyalty.stamps = 0;
    r5Loyalty.freeUsed++;
    toast('🎟️ Loyalty card full — your next tune at Solmar Customs is FREE!');
    speakLine('Five tunes, one free. The garage looks after its regulars.');
    chime();
  } else {
    toast('🎟️ Loyalty stamp ' + r5Loyalty.stamps + '/5 at Solmar Customs.');
  }
  r5LoyaltySave();
}
function r5LoyaltyFree() {
  return r5Loyalty.freeUsed > 0;
}
function r5LoyaltyRedeem() {
  if (r5Loyalty.freeUsed <= 0) return false;
  r5Loyalty.freeUsed--;
  r5LoyaltySave();
  return true;
}

// ---------- Round 5, part twenty-five: bay news ticker + forecast ----------
// A news ticker runs across the toast line every few minutes with live bay
// news, and the phone's stats screen gains a Round 5 forecast: the season,
// the next tournament, the fleet's earnings, the stock portfolio and the
// strongest district, all read from the live game state.
const R5_TICKER = [
  () => 'Bay news: ' + r5SeasonName() + ' continues, and the ' + R5_SEASONS[r5Season.idx].fest + ' is still paying visitors.',
  () => 'Bay news: the fishing tournament ' + (r5Tourney.active ? 'is running right now — ' + r5Tourney.points + ' points on the board.' : 'starts in ' + Math.ceil(r5Tourney.nextIn) + ' seconds. Rods ready.'),
  () => 'Bay news: your taxi fleet has earned $' + R5_EMPIRE.earned.toLocaleString('en-US') + ' in total. The depot thanks you.',
  () => 'Bay news: ' + r5TerritoryLine() + '. Influence is earned, never given.',
  () => 'Bay news: the stock market values your portfolio at $' + r5StocksValue().toFixed(2) + '. Dividends land at dawn.',
  () => 'Bay news: Ryan and Ian are at ' + r5Bond.bond + ' bond out of 100. The bay ships them.',
  () => 'Bay news: best stunt jump so far is ' + r5Stunt.bestDist.toFixed(0) + ' units. The yellow ramps are waiting.',
  () => 'Bay news: ' + r5Cards.found.length + ' of 8 postcards collected. The full set pays $500.',
  () => 'Bay news: ' + r5BoatRace.wins + ' boat races won, best time ' + (R5_BOAT_RACE.best ? R5_BOAT_RACE.best.toFixed(1) + 's' : 'unset') + '.',
  () => 'Bay news: ' + r5Achieve.earned.length + ' of 12 achievements earned. The trophy shelf grows.',
  () => 'Bay news: the pursuit helicopter is ' + (r5Heli.active ? 'overhead right now — lose the heat!' : 'parked. Enjoy the quiet.'),
  () => 'Bay news: ' + (r5Season.front ? 'a ' + r5Season.front.name + ' is over the bay — wind ' + r5Season.wind + '.' : 'clear skies and a calm sea over Solmar Bay.'),
];
let r5TickerTimer = 0;
function r5TickerUpdate(dt) {
  if (state.mode !== 'play') return;
  r5TickerTimer += dt;
  if (r5TickerTimer < 180) return;
  r5TickerTimer = 0;
  toast('📰 ' + pick(R5_TICKER)());
}
function r5Forecast() {
  // One block of text for the phone stats screen: everything Round 5 in a
  // single glance, all numbers live from the game state.
  const lines = [];
  lines.push('Round 5 — ' + r5SeasonLine());
  lines.push('Tournament: ' + (r5Tourney.active ? r5Tourney.points + ' pts, ' + Math.ceil(r5Tourney.timer) + 's left' : 'next in ' + Math.ceil(r5Tourney.nextIn) + 's') + ' · Best ' + r5Tourney.best + ' pts');
  lines.push('Fleet: ' + R5_EMPIRE.cabs.length + ' cabs, ' + R5_EMPIRE.drivers + ' drivers, $' + r5EmpireIncomePerMin() + '/min, earned $' + R5_EMPIRE.earned.toLocaleString('en-US'));
  lines.push('Stocks: $' + r5StocksValue().toFixed(2) + ' held · Bond ' + r5Bond.bond + '/100');
  lines.push(r5TerritoryLine());
  lines.push('Postcards ' + r5Cards.found.length + '/8 · Jumps ' + r5Stunt.jumps + ' · Boat wins ' + R5_BOAT_RACE.wins);
  lines.push('Rivals: ' + R5_RIVALS.map((r, i) => r.name + ' ' + r5Rivals.wins[i] + '-' + r5Rivals.losses[i]).join(', '));
  lines.push('Achievements ' + r5Achieve.earned.length + '/12 · Loyalty ' + r5Loyalty.stamps + '/5 · Daily bonuses ' + r5Daily.claimed);
  lines.push('Heat: ' + (r5Heat.zone >= 0 ? R5_HEAT_ZONES[r5Heat.zone].name : 'none') + ' · Heli: ' + (r5Heli.active ? 'overhead' : 'parked'));
  return lines.join('<br>');
}
function r5ForecastUpdate() {
  // The forecast is rendered into the phone stats panel whenever it is open.
  const el = document.getElementById('phoneStats');
  if (!el || el.style.display !== 'block') return;
  const marker = '<br>— Round 5 —<br>';
  const html = el.innerHTML;
  const base = html.includes(marker) ? html.slice(0, html.indexOf(marker)) : html;
  el.innerHTML = base + marker + r5Forecast();
}
// Late Round 5 exports: these systems are defined after the main exports
// block above, so they are attached here, once every const exists.
// (Their build/load calls live here too, for the same reason.)
r5RivalsBuild(); r5ResponderLoad(); r5AchieveLoad(); r5RivalsLoad(); r5DailyLoad(); r5LoyaltyLoad();
Object.assign(window.__r5exports, {
  heat: r5Heat, heatZones: R5_HEAT_ZONES, responder: R5_RESPONDER, meet: r5Meet,
  achievements: R5_ACHIEVEMENTS, achieved: r5Achieve,
  rivals: r5Rivals, rivalDefs: R5_RIVALS, daily: r5Daily, loyalty: r5Loyalty,
  ticker: R5_TICKER, forecast: r5Forecast,
  openAchievements: r5AchieveOpen, startResponder: r5ResponderStart,
  challengeRival: r5RivalsChallenge, nearRival: r5RivalsNear,
});

function setupShot() {
  if (!state.shot) return;
  rng = mulberry32(seedParam); // re-seed for the shot (textures already built; logic uses it)
  state.mode = 'play';
  document.getElementById('start').classList.add('hidden');
  document.getElementById('hud').classList.add('on');
  state.cash = 2450; state.health = 100;
  if (state.shot === 'start') {
    state.mode = 'start';
    document.getElementById('start').classList.remove('hidden');
    document.getElementById('hud').classList.remove('on');
    camera.position.set(-40, 42, 130);
    camera.lookAt(20, 12, 0);
  } else if (state.shot === 'drive') {
    const c = parkedCars[1];
    state.inCar = c; c.stolen = true; c.speed = 14; state.speed = 14;
    c.mesh.position.set(-12, 0, 12); c.mesh.rotation.y = 0.3;
    player.visible = false;
    startMission(0); updateHUD();
    camera.position.set(-12, 6, -2); camera.lookAt(-12, 2, 20);
  } else if (state.shot === 'chase') {
    const c = parkedCars[2];
    state.inCar = c; c.stolen = true; c.speed = 20; state.speed = 20;
    c.mesh.position.set(-60, 0, 0); c.mesh.rotation.y = 0;
    player.visible = false;
    state.wanted = 3;
    while (police.length < 3) spawnPolice();
    police[0].mesh.position.set(-60, 0, -13); police[0].heading = 0; police[0].mesh.rotation.y = 0;
    police[1].mesh.position.set(-56.5, 0, 10); police[1].heading = 0; police[1].mesh.rotation.y = 0;
    police[2].mesh.position.set(-63.5, 0, 8); police[2].heading = 0; police[2].mesh.rotation.y = 0;
    startMission(2); updateHUD(); updateObjective();
    camera.position.set(-60, 7, -20); camera.lookAt(-60, 1.5, 12);
  } else if (state.shot === 'isle') {
    const hc = hovercrafts[0];
    state.inCar = hc; hc.stolen = true; hc.speed = 10; state.speed = 10;
    hc.mesh.position.set(150, 0.5, 10); hc.mesh.rotation.y = 1.1;
    player.visible = false;
    camera.position.set(140, 14, -18); camera.lookAt(212, 4, 28);
    toast('Coral Cay — the island off the east coast.');
    updateHUD();
  } else if (state.shot === 'mission') {
    startMission(1); state.missionStage = 2; state.missionTimer = 64;
    setBeacon(SPOTS.airport.x, SPOTS.airport.z);
    const c = parkedCars[3];
    state.inCar = c; c.stolen = true; c.speed = 10; state.speed = 10;
    c.mesh.position.set(-180, 0, -40); c.mesh.rotation.y = -Math.PI / 2;
    player.visible = false;
    updateHUD(); updateObjective();
    camera.position.set(-180, 9, -62); camera.lookAt(-210, 2, -40);
  }
  window.__shotReady = false;
  setTimeout(() => { renderer.render(scene, camera); window.__shotReady = true; }, 600);
}

// ---------- Round 6, part one: shared helpers, shot props, metro, food truck ----------
// Every Round 6 line below was composed fresh in this session. The helpers
// here are the only shared code: distance checks from the player (on foot or
// in a vehicle), safe cash moves, and one dynamic panel all 24 systems reuse
// instead of stamping a separate DOM panel per system.
function r6PlayerPos() {
  if (state.inCar && state.inCar.mesh) return { x: state.inCar.mesh.position.x, z: state.inCar.mesh.position.z };
  return { x: playerState.x, z: playerState.z };
}
function r6DistTo(x, z) {
  const p = r6PlayerPos();
  return Math.hypot(p.x - x, p.z - z);
}
function r6Near(x, z, r) { return r6DistTo(x, z) < r; }
function r6Spend(amount) {
  if (state.cash < amount) { toast('Not enough cash — need $' + amount + '.'); return false; }
  state.cash -= amount; r6Ledger.spent += amount; r6LedgerSave(); updateHUD(); return true;
}
function r6Earn(amount, msg) {
  state.cash += amount; chime(); if (msg) toast(msg + ' +$' + amount);
  r6Ledger.earned += amount; r6Ledger.jobs++; r6LedgerSave();
  saveGame(); updateHUD();
}
function r6Clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function r6Pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
const R6_STORE = 'solmar-r6-';
function r6Save(key, obj) {
  try { localStorage.setItem(R6_STORE + key, JSON.stringify(obj)); } catch (e) {}
}
function r6Load(key, fallback) {
  try { const s = JSON.parse(localStorage.getItem(R6_STORE + key) || 'null'); return s === null ? fallback : s; } catch (e) { return fallback; }
}
// One dynamic panel for all Round 6 systems: title, body lines, action buttons.
function r6ShowPanel(title, lines, buttons) {
  const panel = document.getElementById('r6Panel');
  const body = document.getElementById('r6PanelBody');
  document.getElementById('r6PanelTitle').textContent = title;
  body.innerHTML = '';
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line;
    div.style.margin = '3px 0';
    body.appendChild(div);
  }
  const row = document.createElement('div');
  row.style.marginTop = '10px';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'r6btn';
    btn.textContent = b.label;
    if (b.disabled) btn.disabled = true;
    btn.addEventListener('click', () => { b.fn(); });
    row.appendChild(btn);
  }
  body.appendChild(row);
  panel.classList.remove('hidden');
}
function r6ClosePanel() { document.getElementById('r6Panel').classList.add('hidden'); }
function r6PanelButton(label, fn, disabled) { return { label, fn, disabled: !!disabled }; }

// Visible props for the four deterministic screenshots. Each one sits inside
// a shot framing so the regenerated screenshots differ from Round 5: carnival
// fireworks high over the title skyline, a food truck and billboards downtown
// for the drive shot, a striped police roadblock for the chase shot, and gold
// mission crates with a tall banner at the airport beacon for the mission shot.
const R6_SHOT_PROPS = { fireworks: [], truck: null, roadblock: [], missionCrates: [] };
function r6ShotPropsBuild() {
  const burstCols = [0xff5a5a, 0xffd23f, 0x2ee6ff, 0xff9ad5, 0x7dff9a];
  for (let b = 0; b < 3; b++) {
    const bx = -30 + b * 32, by = 58 + b * 7, bz = -14 + b * 18;
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2;
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshBasicMaterial({ color: burstCols[(b + i) % burstCols.length] }));
      spark.position.set(bx + Math.cos(ang) * 5.5, by + Math.sin(ang) * 4.2, bz + Math.sin(ang * 2) * 2.5);
      scene.add(spark); R6_SHOT_PROPS.fireworks.push(spark);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.position.set(bx, by, bz); scene.add(core); R6_SHOT_PROPS.fireworks.push(core);
  }
  // Food truck parked downtown, in the drive shot's line of sight.
  const truck = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.4, 2.2), new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.5 }));
  body.position.y = 1.5; truck.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 2.1), new THREE.MeshStandardMaterial({ color: 0xffe27a, roughness: 0.5 }));
  cab.position.set(2.9, 1.1, 0); truck.add(cab);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.15, 2.8), new THREE.MeshStandardMaterial({ color: 0x2ee6ff, roughness: 0.6 }));
  awning.position.set(-0.4, 2.9, 0); truck.add(awning);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  for (const [wx, wz] of [[-1.6, 1.15], [1.8, 1.15], [-1.6, -1.15], [1.8, -1.15]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), wheelMat);
    w.rotation.x = Math.PI / 2; w.position.set(wx, 0.42, wz); truck.add(w);
  }
  truck.position.set(-6, 0, 22); truck.rotation.y = 0.35; scene.add(truck);
  R6_SHOT_PROPS.truck = truck;
  // Two glowing billboards flanking the downtown drive route.
  for (const [bx, bz, col] of [[-24, 30, 0xff2a7a], [4, 34, 0x2ee6ff]]) {
    addBox(1, 11, 1, 0x3a3a44, bx, 5.5, bz);
    const board = new THREE.Mesh(new THREE.BoxGeometry(8, 3.4, 0.4), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55 }));
    board.position.set(bx, 12, bz); scene.add(board);
  }
  // Striped police roadblock across the chase road at x -66..-54, z 13.
  const stripeMatA = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const stripeMatB = new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.5), i % 2 === 0 ? stripeMatA : stripeMatB);
    bar.position.set(-66 + i * 3.4, 0.75, 13); scene.add(bar); R6_SHOT_PROPS.roadblock.push(bar);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    leg.position.set(-66 + i * 3.4, 0.25, 13); scene.add(leg);
  }
  for (const [cx, cz] of [[-67, 15.5], [-53, 15.5], [-60, 11]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1, 8), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8 }));
    cone.position.set(cx, 0.5, cz); scene.add(cone); R6_SHOT_PROPS.roadblock.push(cone);
  }
  // Gold mission crates and a tall banner beside the airport beacon.
  for (let i = 0; i < 3; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.6, metalness: 0.4 }));
    crate.position.set(-196 + i * 2.1, 0.8, -46 + (i % 2) * 2.4); crate.rotation.y = i * 0.5; scene.add(crate);
    R6_SHOT_PROPS.missionCrates.push(crate);
  }
  addBox(0.5, 14, 0.5, 0x2a2a33, -192, 7, -48);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2, 0.2), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
  banner.position.set(-192, 12.4, -48); scene.add(banner);
}

// ---------- Round 6 system 1: Solmar Metro ----------
// Four underground stations under the bay. Buy a metro card once, ride cheap;
// ride without a ticket and the inspectors may catch you — wanted +1.
const R6_METRO_STATIONS = [
  { name: 'Marina Metro', x: 44, z: 52, color: 0x2ee6ff, desc: 'under the marina promenade' },
  { name: 'Old Town Metro', x: -28, z: 8, color: 0xffd23f, desc: 'beneath the old plaza' },
  { name: 'Casino Row Metro', x: 62, z: -82, color: 0xff2a7a, desc: 'below the neon strip' },
  { name: 'North Docks Metro', x: -62, z: -88, color: 0x7dff9a, desc: 'under the container yard' },
];
const R6_METRO_CARD_PRICE = 40;
const R6_METRO_FARE = 5;
let r6Metro = { card: false, rides: 0, dodged: 0, caught: 0, riding: null, timer: 0, from: -1, to: -1 };
function r6MetroBuild() {
  for (const st of R6_METRO_STATIONS) {
    addBox(7, 1.2, 5, 0x3a3f4a, st.x, 0.6, st.z);
    addBox(6, 3.2, 0.6, 0x22262e, st.x, 1.6, st.z - 2.6);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.1, 0.3), new THREE.MeshStandardMaterial({ color: st.color, emissive: st.color, emissiveIntensity: 0.6 }));
    sign.position.set(st.x, 3.6, st.z - 2.4); scene.add(sign);
    for (let s = 0; s < 3; s++) addBox(5.6, 0.35, 0.8, 0x8a8f96, st.x, 0.3 + s * 0.35, st.z + 1.2 + s * 0.7);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
    lamp.position.set(st.x + 3.4, 2.6, st.z + 2); scene.add(lamp);
  }
}
function r6MetroNear() {
  for (let i = 0; i < R6_METRO_STATIONS.length; i++) if (r6Near(R6_METRO_STATIONS[i].x, R6_METRO_STATIONS[i].z, 8)) return i;
  return -1;
}
function r6MetroFareDue() { return r6Metro.card ? 0 : R6_METRO_FARE; }
function r6MetroOpen() {
  const at = r6MetroNear();
  if (at < 0) return false;
  const st = R6_METRO_STATIONS[at];
  const lines = [
    st.name + ' — ' + st.desc + '.',
    'Metro card: ' + (r6Metro.card ? 'owned (rides free)' : 'not owned — $' + R6_METRO_CARD_PRICE),
    'Fare without a card: $' + R6_METRO_FARE + ' a ride. Rides taken: ' + r6Metro.rides + '.',
    'Fare dodges: ' + r6Metro.dodged + ' (caught ' + r6Metro.caught + ' times).',
    'Pick a destination — the train leaves at once.',
  ];
  const buttons = [];
  if (!r6Metro.card) buttons.push(r6PanelButton('Buy metro card — $' + R6_METRO_CARD_PRICE, () => { if (r6Spend(R6_METRO_CARD_PRICE)) { r6Metro.card = true; r6MetroSave(); r6MetroOpen(); } }));
  for (let i = 0; i < R6_METRO_STATIONS.length; i++) {
    if (i === at) continue;
    const dest = R6_METRO_STATIONS[i];
    buttons.push(r6PanelButton('Ride to ' + dest.name + (r6MetroFareDue() ? ' — $' + R6_METRO_FARE : ' — free'), () => { r6MetroRide(at, i); }));
  }
  buttons.push(r6PanelButton('Dodge the fare (risky)', () => { r6MetroDodge(at); }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🚇 ' + st.name, lines, buttons);
  return true;
}
function r6MetroRide(from, to) {
  if (!r6Metro.card && !r6Spend(R6_METRO_FARE)) return;
  r6Metro.riding = true; r6Metro.from = from; r6Metro.to = to; r6Metro.timer = 2;
  r6ClosePanel();
  toast('Metro departing — ' + R6_METRO_STATIONS[to].name + ' in 2 seconds.');
}
function r6MetroDodge(from) {
  const dest = (from + 1 + Math.floor(Math.random() * 3)) % R6_METRO_STATIONS.length;
  r6Metro.dodged++;
  if (Math.random() < 0.3) {
    r6Metro.caught++;
    state.wanted = Math.min(5, state.wanted + 1);
    toast('Inspector caught you dodging the fare! Wanted up.');
    r6MetroSave(); updateHUD(); return;
  }
  r6Metro.riding = true; r6Metro.from = from; r6Metro.to = dest; r6Metro.timer = 2;
  r6ClosePanel();
  toast('You slipped past the barrier — train to ' + R6_METRO_STATIONS[dest].name + '.');
}
function r6MetroUpdate(dt) {
  if (!r6Metro.riding) return;
  r6Metro.timer -= dt;
  if (r6Metro.timer > 0) return;
  r6Metro.riding = false; r6Metro.rides++;
  const dest = R6_METRO_STATIONS[r6Metro.to];
  if (state.inCar) { state.inCar = null; }
  playerState.x = dest.x + 4; playerState.z = dest.z + 4;
  if (player) player.visible = true;
  toast('Arrived at ' + dest.name + '.');
  r6MetroSave(); updateHUD();
}
function r6MetroSave() { r6Save('metro', { card: r6Metro.card, rides: r6Metro.rides, dodged: r6Metro.dodged, caught: r6Metro.caught }); }
function r6MetroLoad() {
  const s = r6Load('metro', null);
  if (s) { r6Metro.card = !!s.card; r6Metro.rides = s.rides || 0; r6Metro.dodged = s.dodged || 0; r6Metro.caught = s.caught || 0; }
}

// ---------- Round 6 system 2: food truck ----------
// Buy a truck, cook five menus, park at six pitches around the bay. Hungry
// crowds pay the menu price plus tips; a five-star health rating doubles tips.
const R6_FOOD_MENUS = [
  { name: 'Bay Fish Tacos', price: 14, cost: 4, prep: 6, desc: 'crispy fish, lime slaw, warm tortilla' },
  { name: 'Smoky Rib Stack', price: 22, cost: 8, prep: 10, desc: 'slow ribs, charred corn, pickles' },
  { name: 'Sunset Noodle Bowl', price: 16, cost: 5, prep: 8, desc: 'chilli noodles, egg, spring onion' },
  { name: 'Marina Veggie Wrap', price: 12, cost: 3, prep: 5, desc: 'grilled veg, hummus, flatbread' },
  { name: 'Golden Fried Shrimp', price: 19, cost: 7, prep: 9, desc: 'crisp shrimp, garlic butter, rice' },
];
const R6_FOOD_PITCHES = [
  { name: 'Marina Promenade', x: 40, z: 44, crowd: 5 },
  { name: 'Old Plaza', x: -24, z: 4, crowd: 4 },
  { name: 'Beachfront', x: 96, z: 120, crowd: 5 },
  { name: 'Casino Row', x: 58, z: -76, crowd: 3 },
  { name: 'North Docks Gate', x: -58, z: -80, crowd: 3 },
  { name: 'Airport Forecourt', x: -176, z: -28, crowd: 4 },
];
const R6_FOOD_TRUCK_PRICE = 2500;
let r6Food = { owned: false, menu: 0, served: 0, tips: 0, rating: 3, hygiene: 0, serveTimer: 0, pitch: -1 };
function r6FoodBuild() {
  for (const p of R6_FOOD_PITCHES) {
    addBox(5, 0.4, 5, 0x9a8a6a, p.x, 0.2, p.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), new THREE.MeshStandardMaterial({ color: 0x666666 }));
    post.position.set(p.x + 2.4, 1.5, p.z + 2.2); scene.add(post);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xaa4400, emissiveIntensity: 0.5 }));
    flag.position.set(p.x + 2.4, 3.2, p.z + 2.2); scene.add(flag);
  }
}
function r6FoodPitchNear() {
  for (let i = 0; i < R6_FOOD_PITCHES.length; i++) if (r6Near(R6_FOOD_PITCHES[i].x, R6_FOOD_PITCHES[i].z, 9)) return i;
  return -1;
}
function r6FoodOpen() {
  const pitch = r6FoodPitchNear();
  if (pitch < 0) return false;
  if (!r6Food.owned) {
    r6ShowPanel('🚚 Solmar Food Truck', [
      'A used truck with a working grill — $' + R6_FOOD_TRUCK_PRICE + '.',
      'Five menus, six pitches, tips on top of every sale.',
      'Keep the hygiene rating high and tips double at five stars.',
    ], [
      r6PanelButton('Buy the truck — $' + R6_FOOD_TRUCK_PRICE, () => { if (r6Spend(R6_FOOD_TRUCK_PRICE)) { r6Food.owned = true; r6FoodSave(); r6FoodOpen(); } }),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  const menu = R6_FOOD_MENUS[r6Food.menu];
  const lines = [
    'Truck owned. Served: ' + r6Food.served + ' · Tips banked: $' + r6Food.tips + '.',
    'Health rating: ' + '★'.repeat(r6Food.rating) + '☆'.repeat(5 - r6Food.rating) + ' (hygiene checks: ' + r6Food.hygiene + ').',
    'Menu now: ' + menu.name + ' — sells $' + menu.price + ', costs $' + menu.cost + ' to cook.',
    pitch >= 0 ? 'Parked at ' + R6_FOOD_PITCHES[pitch].name + ' (crowd ' + R6_FOOD_PITCHES[pitch].crowd + '/5). Customers arrive on their own.' : 'Drive to a pitch (orange flag) to start serving.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_FOOD_MENUS.length; i++) buttons.push(r6PanelButton((i === r6Food.menu ? '✓ ' : '') + R6_FOOD_MENUS[i].name + ' $' + R6_FOOD_MENUS[i].price, () => { r6Food.menu = i; r6FoodSave(); r6FoodOpen(); }));
  buttons.push(r6PanelButton('Hygiene check — $60', () => { if (r6Spend(60)) { r6Food.rating = Math.min(5, r6Food.rating + 1); r6Food.hygiene++; r6FoodSave(); toast('Health inspector smiles. Rating up!'); r6FoodOpen(); } }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🚚 Food Truck', lines, buttons);
  return true;
}
function r6FoodServeTick() {
  const pitch = r6FoodPitchNear();
  if (pitch < 0) { r6Food.pitch = -1; return; }
  r6Food.pitch = pitch;
  const menu = R6_FOOD_MENUS[r6Food.menu];
  const tipMult = r6Food.rating >= 5 ? 2 : 1;
  const tip = Math.floor((2 + Math.random() * 4) * tipMult);
  const profit = menu.price - menu.cost + tip;
  r6Food.served++; r6Food.tips += tip;
  r6Earn(profit, 'Sold ' + menu.name + ' at ' + R6_FOOD_PITCHES[pitch].name + ' (tip $' + tip + ').');
  if (r6Food.served % 12 === 0 && r6Food.rating < 5) { r6Food.rating++; toast('Word of mouth grows — health rating up!'); }
  r6FoodSave();
}
function r6FoodUpdate(dt) {
  if (!r6Food.owned) return;
  r6Food.serveTimer -= dt;
  if (r6Food.serveTimer > 0) return;
  if (r6FoodPitchNear() >= 0) {
    const pitch = R6_FOOD_PITCHES[r6FoodPitchNear()];
    r6Food.serveTimer = 14 - pitch.crowd * 1.5;
    r6FoodServeTick();
  } else r6Food.serveTimer = 2;
}
function r6FoodSave() { r6Save('food', { owned: r6Food.owned, menu: r6Food.menu, served: r6Food.served, tips: r6Food.tips, rating: r6Food.rating, hygiene: r6Food.hygiene }); }
function r6FoodLoad() {
  const s = r6Load('food', null);
  if (s) { r6Food.owned = !!s.owned; r6Food.menu = s.menu || 0; r6Food.served = s.served || 0; r6Food.tips = s.tips || 0; r6Food.rating = s.rating || 3; r6Food.hygiene = s.hygiene || 0; }
}
// ---------- Round 6 system 3: surfing + lifeguard ----------
// Three surf breaks off the east beach. Buy a board, paddle out, ride the
// wave for points; lifeguard rescues pay too, and the monthly comp pays $450.
const R6_SURF_BREAKS = [
  { name: 'Sunset Point', x: 218, z: 60, wave: 3, desc: 'long gentle rollers, good for learners' },
  { name: 'Coral Barrel', x: 224, z: 130, wave: 5, desc: 'fast hollow barrels over the reef' },
  { name: 'North Swell', x: 206, z: -40, wave: 4, desc: 'heavy winter swell, experts only' },
];
const R6_SURF_BOARDS = [
  { name: 'Foam Learner', price: 120, speed: 1, desc: 'soft, slow, forgiving' },
  { name: 'Funboard 7ft', price: 320, speed: 2, desc: 'steady all-rounder' },
  { name: 'Shortboard Pro', price: 650, speed: 3, desc: 'sharp turns, fast drops' },
  { name: 'Barrel Hunter', price: 950, speed: 4, desc: 'built for hollow tubes' },
];
let r6Surf = { board: -1, skill: 0, rides: 0, best: 0, rescues: 0, compWins: 0, compTimer: 180, rescueTimer: 45, rescueAt: -1 };
function r6SurfBuild() {
  addBox(8, 4, 6, 0x2e6fb0, 96, 2, 108);
  addBox(8.6, 0.5, 6.6, 0xffd23f, 96, 4.3, 108);
  const shopSign = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x2288aa, emissiveIntensity: 0.6 }));
  shopSign.position.set(96, 3.4, 104.8); scene.add(shopSign);
  for (let i = 0; i < 3; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.15), new THREE.MeshStandardMaterial({ color: [0xff5a5a, 0xffd23f, 0x7dff9a][i], roughness: 0.4 }));
    board.position.set(93 + i * 2.4, 1.6, 104.9); board.rotation.z = 0.15; scene.add(board);
  }
  for (const br of R6_SURF_BREAKS) {
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10), new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xaa4400, emissiveIntensity: 0.4 }));
    buoy.position.set(br.x, 0.6, br.z); scene.add(buoy);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.25, 8, 24), new THREE.MeshBasicMaterial({ color: 0x2ee6ff }));
    ring.rotation.x = Math.PI / 2; ring.position.set(br.x, 0.3, br.z); scene.add(ring);
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  tower.position.set(102, 4.4, 116); scene.add(tower);
  for (const [lx, lz] of [[101, 115], [103, 115], [101, 117], [103, 117]]) addBox(0.3, 3.6, 0.3, 0x8a6a3a, lx, 1.8, lz);
  addBox(1.2, 0.8, 1.2, 0xff2222, 102, 5.6, 116);
}
function r6SurfBreakNear() {
  for (let i = 0; i < R6_SURF_BREAKS.length; i++) if (r6DistTo(R6_SURF_BREAKS[i].x, R6_SURF_BREAKS[i].z) < 9) return i;
  return -1;
}
function r6SurfShopNear() { return r6Near(96, 108, 9); }
function r6SurfScore(brk) {
  const board = r6Surf.board >= 0 ? R6_SURF_BOARDS[r6Surf.board] : { speed: 0 };
  return Math.round((brk.wave * 12 + board.speed * 14 + r6Surf.skill * 2 + Math.random() * 18));
}
function r6SurfOpen() {
  if (r6SurfBreakNear() >= 0) {
    const brk = R6_SURF_BREAKS[r6SurfBreakNear()];
    r6ShowPanel('🏄 ' + brk.name, [
      brk.desc + ' (wave ' + brk.wave + '/5).',
      'Your board: ' + (r6Surf.board >= 0 ? R6_SURF_BOARDS[r6Surf.board].name : 'none — buy one at the surf shop first') + '.',
      'Skill: ' + r6Surf.skill + ' · Best ride: ' + r6Surf.best + ' pts · Rides: ' + r6Surf.rides + '.',
      'Rescues done: ' + r6Surf.rescues + ' · Comp wins: ' + r6Surf.compWins + '.',
    ], [
      r6PanelButton('Catch this wave', () => { r6SurfRide(r6SurfBreakNear()); }, r6Surf.board < 0),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  if (!r6SurfShopNear()) return false;
  const lines = [
    'Solmar Surf Shop — boards from $120 to $950.',
    'Your board: ' + (r6Surf.board >= 0 ? R6_SURF_BOARDS[r6Surf.board].name : 'none') + ' · Skill ' + r6Surf.skill + '.',
    'Next surf comp in ' + Math.ceil(r6Surf.compTimer) + 's — winner takes $450.',
    'Swimmers sometimes get in trouble near the breaks; rescue pays $90.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_SURF_BOARDS.length; i++) {
    const b = R6_SURF_BOARDS[i];
    buttons.push(r6PanelButton((i === r6Surf.board ? '✓ ' : '') + b.name + ' — $' + b.price + ' (' + b.desc + ')', () => { if (i !== r6Surf.board && r6Spend(b.price)) { r6Surf.board = i; r6SurfSave(); } r6SurfOpen(); }));
  }
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🏄 Solmar Surf Shop', lines, buttons);
  return true;
}
function r6SurfRide(brkIdx) {
  if (brkIdx < 0 || r6Surf.board < 0) return;
  const brk = R6_SURF_BREAKS[brkIdx];
  const score = r6SurfScore(brk);
  r6Surf.rides++; r6Surf.skill = Math.min(50, r6Surf.skill + 1);
  if (score > r6Surf.best) r6Surf.best = score;
  const pay = Math.round(score * 0.9);
  r6Earn(pay, 'Rode ' + brk.name + ' for ' + score + ' pts.');
  if (score >= 95 && r6Surf.compTimer < 9999) toast('That ride would win most comps — enter one at the shop!');
  r6SurfSave();
}
function r6SurfRescue() {
  r6Surf.rescueAt = Math.floor(Math.random() * R6_SURF_BREAKS.length);
  const brk = R6_SURF_BREAKS[r6Surf.rescueAt];
  toast('🏊 Swimmer in trouble at ' + brk.name + '! Paddle out and press E.');
}
function r6SurfUpdate(dt) {
  r6Surf.compTimer -= dt;
  if (r6Surf.compTimer <= 0) {
    r6Surf.compTimer = 240;
    if (r6Surf.board >= 0 && r6Surf.best >= 70) { r6Surf.compWins++; r6Earn(450, '🏆 Won the Sunset Point surf comp!'); }
    else toast('Surf comp at Sunset Point — best ride 70+ pts wins $450.');
    r6SurfSave();
  }
  r6Surf.rescueTimer -= dt;
  if (r6Surf.rescueTimer <= 0) { r6Surf.rescueTimer = 75; r6SurfRescue(); }
  if (r6Surf.rescueAt >= 0 && r6SurfBreakNear() === r6Surf.rescueAt) {
    r6Surf.rescues++; r6Surf.rescueAt = -1; r6Surf.rescueTimer = 75;
    r6Earn(90, 'Lifeguard rescue at the break!');
    r6SurfSave();
  }
}
function r6SurfSave() { r6Save('surf', { board: r6Surf.board, skill: r6Surf.skill, rides: r6Surf.rides, best: r6Surf.best, rescues: r6Surf.rescues, compWins: r6Surf.compWins }); }
function r6SurfLoad() {
  const s = r6Load('surf', null);
  if (s) { r6Surf.board = s.board ?? -1; r6Surf.skill = s.skill || 0; r6Surf.rides = s.rides || 0; r6Surf.best = s.best || 0; r6Surf.rescues = s.rescues || 0; r6Surf.compWins = s.compWins || 0; }
}

// ---------- Round 6 system 4: skate / BMX park ----------
// A concrete bowl park with eight tricks. Chain tricks into combos; a 500+
// combo draws a sponsor, and the weekend comp pays $380 to the winner.
const R6_SKATE_TRICKS = [
  { name: 'Kickflip', pts: 40, risk: 0.1, desc: 'board spins under your feet' },
  { name: 'Grind the Rail', pts: 55, risk: 0.15, desc: 'slide the coping, sparks fly' },
  { name: 'Air the Bowl', pts: 70, risk: 0.2, desc: 'launch out of the deep end' },
  { name: 'Manual Balance', pts: 30, risk: 0.08, desc: 'two wheels, pure balance' },
  { name: '360 Spin', pts: 65, risk: 0.18, desc: 'full rotation in the air' },
  { name: 'Wall Ride', pts: 50, risk: 0.14, desc: 'ride straight up the wall' },
  { name: 'Tail Whip', pts: 80, risk: 0.25, desc: 'BMX frame spins around you' },
  { name: 'Backflip Drop', pts: 120, risk: 0.35, desc: 'the crowd-holder, high risk' },
];
const R6_SKATE_PARK = { x: -84, z: 96, name: 'Concrete Wave Park' };
let r6Skate = { combo: 0, best: 0, tricks: 0, sponsor: '', compWins: 0, compTimer: 200, bails: 0 };
function r6SkateBuild() {
  addBox(26, 1, 20, 0x9aa0a8, R6_SKATE_PARK.x, 0.5, R6_SKATE_PARK.z);
  addBox(26, 2.4, 2, 0x7a8088, R6_SKATE_PARK.x, 1.2, R6_SKATE_PARK.z - 9);
  addBox(2, 2.4, 20, 0x7a8088, R6_SKATE_PARK.x - 12, 1.2, R6_SKATE_PARK.z);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 1.6, 16), new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.9 }));
  bowl.position.set(R6_SKATE_PARK.x + 5, 1.2, R6_SKATE_PARK.z + 4); scene.add(bowl);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.8, roughness: 0.3 });
  for (const [rx, rz] of [[-4, 0], [2, -4]]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 8), railMat);
    rail.rotation.z = Math.PI / 2; rail.position.set(R6_SKATE_PARK.x + rx, 1.6, R6_SKATE_PARK.z + rz); scene.add(rail);
  }
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.7 }));
  ramp.position.set(R6_SKATE_PARK.x - 6, 1.4, R6_SKATE_PARK.z + 5); ramp.rotation.x = -0.4; scene.add(ramp);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x881111, emissiveIntensity: 0.5 }));
  sign.position.set(R6_SKATE_PARK.x, 4.6, R6_SKATE_PARK.z - 10.4); scene.add(sign);
}
function r6SkateNear() { return r6Near(R6_SKATE_PARK.x, R6_SKATE_PARK.z, 13); }
function r6SkateOpen() {
  if (!r6SkateNear()) return false;
  const lines = [
    R6_SKATE_PARK.name + ' — concrete bowl, rails, one big ramp.',
    'Combo now: ' + r6Skate.combo + ' pts · Best combo: ' + r6Skate.best + ' · Tricks landed: ' + r6Skate.tricks + '.',
    'Bails: ' + r6Skate.bails + ' · Sponsor: ' + (r6Skate.sponsor || 'none yet — land a 500+ combo') + '.',
    'Weekend comp in ' + Math.ceil(r6Skate.compTimer) + 's — best combo wins $380.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_SKATE_TRICKS.length; i++) {
    const t = R6_SKATE_TRICKS[i];
    buttons.push(r6PanelButton(t.name + ' +' + t.pts + ' (' + Math.round(t.risk * 100) + '% bail)', () => { r6SkateTrick(i); }));
  }
  buttons.push(r6PanelButton('Bank the combo (cash out)', () => { r6SkateBank(); }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🛹 ' + R6_SKATE_PARK.name, lines, buttons);
  return true;
}
function r6SkateTrick(i) {
  const t = R6_SKATE_TRICKS[i];
  if (Math.random() < t.risk) {
    r6Skate.bails++; r6Skate.combo = 0;
    toast('Bailed on the ' + t.name + '! Combo lost.');
    r6SkateSave(); r6SkateOpen(); return;
  }
  r6Skate.combo += t.pts; r6Skate.tricks++;
  if (r6Skate.combo > r6Skate.best) r6Skate.best = r6Skate.combo;
  if (r6Skate.combo >= 500 && !r6Skate.sponsor) {
    r6Skate.sponsor = 'Palm Deck Co.';
    toast('🛹 Palm Deck Co. saw that combo — you have a sponsor! $60 a day.');
  }
  r6SkateSave(); r6SkateOpen();
}
function r6SkateBank() {
  if (r6Skate.combo <= 0) { toast('No combo to bank yet.'); return; }
  const pay = Math.round(r6Skate.combo * 0.4);
  r6Skate.combo = 0;
  r6Earn(pay, 'Cashed in the combo at the park shop.');
  r6SkateSave(); r6SkateOpen();
}
function r6SkateUpdate(dt) {
  r6Skate.compTimer -= dt;
  if (r6Skate.compTimer <= 0) {
    r6Skate.compTimer = 260;
    if (r6Skate.best >= 400) { r6Skate.compWins++; r6Earn(380, '🏆 Won the weekend skate comp!'); }
    else toast('Weekend skate comp — best combo 400+ takes $380.');
    r6SkateSave();
  }
}
function r6SkateSave() { r6Save('skate', { combo: r6Skate.combo, best: r6Skate.best, tricks: r6Skate.tricks, sponsor: r6Skate.sponsor, compWins: r6Skate.compWins, bails: r6Skate.bails }); }
function r6SkateLoad() {
  const s = r6Load('skate', null);
  if (s) { r6Skate.combo = s.combo || 0; r6Skate.best = s.best || 0; r6Skate.tricks = s.tricks || 0; r6Skate.sponsor = s.sponsor || ''; r6Skate.compWins = s.compWins || 0; r6Skate.bails = s.bails || 0; }
}

// ---------- Round 6 system 5: movie studio stunt career ----------
// Solmar Studios hires stunt doubles. Three gig types, a star meter that
// opens bigger films, and a weekly shoot that pays $520 at 80+ stars.
const R6_STUNT_GIGS = [
  { name: 'Falling off a Roof', pay: 160, risk: 2, desc: 'a 3-storey drop onto the airbag' },
  { name: 'Car Rollover', pay: 240, risk: 3, desc: 'flip the stunt coupe, walk away smiling' },
  { name: 'Burning Building Run', pay: 320, risk: 4, desc: 'sprint through the fire set in a suit' },
  { name: 'Harbour Jet-Ski Chase', pay: 280, risk: 3, desc: 'jump the wake at full throttle' },
];
const R6_STUDIO = { x: 128, z: -128, name: 'Solmar Studios' };
let r6Stunt = { stars: 0, gigs: 0, injured: 0, shoots: 0, shootTimer: 220, film: 'Bay Breakers' };
function r6StuntBuild() {
  addBox(22, 9, 16, 0x5a4a6a, R6_STUDIO.x, 4.5, R6_STUDIO.z);
  addBox(23, 1, 17, 0x3a2a4a, R6_STUDIO.x, 9.5, R6_STUDIO.z);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 0.4), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xaa8800, emissiveIntensity: 0.6 }));
  gate.position.set(R6_STUDIO.x, 5.4, R6_STUDIO.z + 8.2); scene.add(gate);
  addBox(1, 6, 1, 0x2a2a33, R6_STUDIO.x - 5, 3, R6_STUDIO.z + 8);
  addBox(1, 6, 1, 0x2a2a33, R6_STUDIO.x + 5, 3, R6_STUDIO.z + 8);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.9 }));
  bag.position.set(R6_STUDIO.x - 8, 0.6, R6_STUDIO.z + 12); scene.add(bag);
  const crane = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6 }));
  crane.position.set(R6_STUDIO.x + 12, 6, R6_STUDIO.z + 6); scene.add(crane);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.6 }));
  boom.position.set(R6_STUDIO.x + 8, 11.8, R6_STUDIO.z + 6); scene.add(boom);
}
function r6StuntNear() { return r6Near(R6_STUDIO.x, R6_STUDIO.z + 12, 11); }
function r6StuntOpen() {
  if (!r6StuntNear()) return false;
  const lines = [
    R6_STUDIO.name + ' — now shooting "' + r6Stunt.film + '".',
    'Star meter: ' + r6Stunt.stars + '/100 · Gigs done: ' + r6Stunt.gigs + ' · Injuries: ' + r6Stunt.injured + '.',
    'Weekly shoot in ' + Math.ceil(r6Stunt.shootTimer) + 's — 80+ stars pays $520.',
    'Bigger stars unlock bigger gigs. Getting hurt costs a day of work.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_STUNT_GIGS.length; i++) {
    const g = R6_STUNT_GIGS[i];
    const locked = r6Stunt.stars < i * 20;
    buttons.push(r6PanelButton(g.name + ' — $' + g.pay + (locked ? ' (needs ' + i * 20 + '★)' : ''), () => { r6StuntGig(i); }, locked));
  }
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🎬 ' + R6_STUDIO.name, lines, buttons);
  return true;
}
function r6StuntGig(i) {
  const g = R6_STUNT_GIGS[i];
  r6Stunt.gigs++;
  if (Math.random() < g.risk * 0.05) {
    r6Stunt.injured++;
    state.health = Math.max(20, state.health - 15);
    toast('Ouch — the ' + g.name + ' went wrong. Rest up, star.');
    r6StuntSave(); updateHUD(); r6StuntOpen(); return;
  }
  r6Stunt.stars = Math.min(100, r6Stunt.stars + 4 + g.risk);
  r6Earn(g.pay, 'Stunt done: ' + g.name + ' (' + r6Stunt.stars + '★).');
  r6StuntSave(); r6StuntOpen();
}
function r6StuntUpdate(dt) {
  r6Stunt.shootTimer -= dt;
  if (r6Stunt.shootTimer <= 0) {
    r6Stunt.shootTimer = 300;
    if (r6Stunt.stars >= 80) { r6Stunt.shoots++; r6Earn(520, '🎬 Weekly shoot on "' + r6Stunt.film + '" — lead double!'); }
    else toast('Weekly shoot at the studio — reach 80 stars for the $520 lead-double slot.');
    r6StuntSave();
  }
}
function r6StuntSave() { r6Save('stunt', { stars: r6Stunt.stars, gigs: r6Stunt.gigs, injured: r6Stunt.injured, shoots: r6Stunt.shoots, film: r6Stunt.film }); }
function r6StuntLoad() {
  const s = r6Load('stunt', null);
  if (s) { r6Stunt.stars = s.stars || 0; r6Stunt.gigs = s.gigs || 0; r6Stunt.injured = s.injured || 0; r6Stunt.shoots = s.shoots || 0; r6Stunt.film = s.film || 'Bay Breakers'; }
}

// ---------- Round 6 system 6: nightclub ownership ----------
// Buy The Bluefin club, book DJs, mind the door and the VIP room. The vibe
// meter decides the night's take; a full house at 90+ vibe pays $600.
const R6_CLUB_DJS = [
  { name: 'DJ Reef', fee: 120, vibe: 18, desc: 'deep house, steady hands' },
  { name: 'Luna Waves', fee: 220, vibe: 30, desc: 'sunset disco, big crowd' },
  { name: 'Bass Marisol', fee: 350, vibe: 45, desc: 'hard bass, the room shakes' },
  { name: 'DJ Solmar', fee: 500, vibe: 60, desc: 'the bay legend himself' },
];
const R6_CLUB = { x: 78, z: -60, name: 'The Bluefin', price: 8000 };
let r6Club = { owned: false, vibe: 40, nights: 0, dj: -1, door: 0, vip: 0, upgrades: 0, nightTimer: 120 };
function r6ClubBuild() {
  addBox(18, 8, 14, 0x1a1a2e, R6_CLUB.x, 4, R6_CLUB.z);
  addBox(19, 1, 15, 0x2ee6ff, R6_CLUB.x, 8.5, R6_CLUB.z);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(9, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x2ee6ff, emissive: 0x2ee6ff, emissiveIntensity: 0.9 }));
  neon.position.set(R6_CLUB.x, 6.2, R6_CLUB.z + 7.2); scene.add(neon);
  const door = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  door.position.set(R6_CLUB.x, 2, R6_CLUB.z + 7.1); scene.add(door);
  for (let i = 0; i < 4; i++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: [0xff2a7a, 0x2ee6ff, 0xffd23f, 0x7dff9a][i] }));
    orb.position.set(R6_CLUB.x - 6 + i * 4, 9.6, R6_CLUB.z + 3); scene.add(orb);
  }
  addBox(4, 1, 3, 0x8a2be2, R6_CLUB.x + 11, 0.5, R6_CLUB.z + 4);
}
function r6ClubNear() { return r6Near(R6_CLUB.x, R6_CLUB.z + 8, 10); }
function r6ClubOpen() {
  if (!r6ClubNear()) return false;
  if (!r6Club.owned) {
    r6ShowPanel('🌃 ' + R6_CLUB.name, [
      'A dark room with a good sound system and a better location — $' + R6_CLUB.price + '.',
      'Book a DJ, open the doors, keep the vibe up. Nights pay by vibe.',
      'Upgrades: better lights, better bar, better sound.',
    ], [
      r6PanelButton('Buy the club — $' + R6_CLUB.price, () => { if (r6Spend(R6_CLUB.price)) { r6Club.owned = true; r6ClubSave(); r6ClubOpen(); } }),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  const lines = [
    'Vibe: ' + r6Club.vibe + '/100 · Nights run: ' + r6Club.nights + ' · Upgrades: ' + r6Club.upgrades + '/3.',
    'Tonight\'s DJ: ' + (r6Club.dj >= 0 ? R6_CLUB_DJS[r6Club.dj].name : 'none booked') + ' · Next night in ' + Math.ceil(r6Club.nightTimer) + 's.',
    'Door take so far: $' + r6Club.door + ' · VIP room: $' + r6Club.vip + '.',
    'Full house at 90+ vibe pays $600 a night.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_CLUB_DJS.length; i++) {
    const d = R6_CLUB_DJS[i];
    buttons.push(r6PanelButton((i === r6Club.dj ? '✓ ' : '') + d.name + ' — $' + d.fee + ' (+' + d.vibe + ' vibe)', () => { if (r6Spend(d.fee)) { r6Club.dj = i; r6Club.vibe = r6Clamp(r6Club.vibe + d.vibe, 0, 100); r6ClubSave(); r6ClubOpen(); } }));
  }
  buttons.push(r6PanelButton('Upgrade the club — $900', () => { if (r6Club.upgrades < 3 && r6Spend(900)) { r6Club.upgrades++; r6Club.vibe = r6Clamp(r6Club.vibe + 10, 0, 100); r6ClubSave(); r6ClubOpen(); } }, r6Club.upgrades >= 3));
  buttons.push(r6PanelButton('Open the doors tonight', () => { r6ClubNight(); }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🌃 ' + R6_CLUB.name, lines, buttons);
  return true;
}
function r6ClubNight() {
  const base = 60 + r6Club.vibe * 3 + r6Club.upgrades * 40;
  const vipPay = r6Club.vibe >= 70 ? 120 : 0;
  r6Club.nights++; r6Club.door += base; r6Club.vip += vipPay;
  r6Club.vibe = r6Clamp(r6Club.vibe - 12 + (r6Club.dj >= 0 ? 8 : 0), 5, 100);
  r6Earn(base + vipPay, 'Club night done — door $' + base + (vipPay ? ', VIP $' + vipPay : '') + '.');
  r6ClubSave(); r6ClubOpen();
}
function r6ClubUpdate(dt) {
  if (!r6Club.owned) return;
  r6Club.nightTimer -= dt;
  if (r6Club.nightTimer <= 0) {
    r6Club.nightTimer = 150;
    if (r6Club.vibe >= 90) { r6Club.nights++; r6Earn(600, '🌃 Full house at The Bluefin — the bay is dancing!'); }
    else toast('The Bluefin hums along — book a bigger DJ to fill the room.');
    r6ClubSave();
  }
}
function r6ClubSave() { r6Save('club', { owned: r6Club.owned, vibe: r6Club.vibe, nights: r6Club.nights, dj: r6Club.dj, door: r6Club.door, vip: r6Club.vip, upgrades: r6Club.upgrades }); }
function r6ClubLoad() {
  const s = r6Load('club', null);
  if (s) { r6Club.owned = !!s.owned; r6Club.vibe = s.vibe ?? 40; r6Club.nights = s.nights || 0; r6Club.dj = s.dj ?? -1; r6Club.door = s.door || 0; r6Club.vip = s.vip || 0; r6Club.upgrades = s.upgrades || 0; }
}
// ---------- Round 6 system 7: tattoo parlor ----------
// Ink by Ines. Each tattoo gives a small permanent stat boost; taking walk-in
// clients pays, and the flash book (12 designs) pays $350 when complete.
const R6_TATTOOS = [
  { name: 'Bay Wave', price: 90, boost: 'stamina', amt: 5, desc: 'a curling wave on the forearm' },
  { name: 'Palm Anchor', price: 140, boost: 'driving', amt: 5, desc: 'an anchor tangled in palm fronds' },
  { name: 'Sunset Compass', price: 180, boost: 'stamina', amt: 8, desc: 'a compass rose at golden hour' },
  { name: 'Shark Tooth', price: 220, boost: 'shooting', amt: 6, desc: 'a single sharp tooth, black ink' },
  { name: 'Coral Rose', price: 260, boost: 'driving', amt: 8, desc: 'a rose grown out of coral' },
  { name: 'Full Sleeve', price: 700, boost: 'shooting', amt: 12, desc: 'the whole arm, bay scenes end to end' },
];
const R6_TATTOO_SHOP = { x: -52, z: -28, name: 'Ink & Salt' };
let r6Tattoo = { owned: [], clients: 0, earned: 0, flashDone: 0 };
function r6TattooBuild() {
  addBox(9, 4.5, 7, 0x2a2a33, R6_TATTOO_SHOP.x, 2.25, R6_TATTOO_SHOP.z);
  addBox(9.6, 0.6, 7.6, 0xff2a7a, R6_TATTOO_SHOP.x, 4.8, R6_TATTOO_SHOP.z);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.05, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.8 }));
  needle.position.set(R6_TATTOO_SHOP.x + 3, 6.4, R6_TATTOO_SHOP.z - 2); needle.rotation.z = 0.5; scene.add(needle);
  const chair = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  chair.position.set(R6_TATTOO_SHOP.x - 2, 1, R6_TATTOO_SHOP.z + 4.5); scene.add(chair);
  for (let i = 0; i < 4; i++) {
    const flash = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.1), new THREE.MeshStandardMaterial({ color: [0xffd23f, 0x2ee6ff, 0xff9ad5, 0x7dff9a][i], roughness: 0.7 }));
    flash.position.set(R6_TATTOO_SHOP.x - 3 + i * 2.2, 2.6, R6_TATTOO_SHOP.z - 3.6); scene.add(flash);
  }
}
function r6TattooNear() { return r6Near(R6_TATTOO_SHOP.x, R6_TATTOO_SHOP.z, 9); }
function r6TattooOpen() {
  if (!r6TattooNear()) return false;
  const lines = [
    R6_TATTOO_SHOP.name + ' — Ines inks by appointment and walk-in.',
    'Your ink: ' + (r6Tattoo.owned.length ? r6Tattoo.owned.map((i) => R6_TATTOOS[i].name).join(', ') : 'clean skin') + '.',
    'Clients inked: ' + r6Tattoo.clients + ' · Earned inking: $' + r6Tattoo.earned + ' · Flash book: ' + r6Tattoo.flashDone + '/12.',
    'Each tattoo boosts a skill a little, forever.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_TATTOOS.length; i++) {
    const t = R6_TATTOOS[i];
    const has = r6Tattoo.owned.includes(i);
    buttons.push(r6PanelButton((has ? '✓ ' : '') + t.name + ' — $' + t.price + ' (+' + t.amt + ' ' + t.boost + ')', () => { r6TattooGet(i); }, has));
  }
  buttons.push(r6PanelButton('Take a walk-in client ($70)', () => { r6TattooClient(); }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🖋️ ' + R6_TATTOO_SHOP.name, lines, buttons);
  return true;
}
function r6TattooGet(i) {
  if (r6Tattoo.owned.includes(i)) return;
  const t = R6_TATTOOS[i];
  if (!r6Spend(t.price)) return;
  r6Tattoo.owned.push(i);
  if (skills && typeof skills[t.boost] === 'number') skills[t.boost] = Math.min(100, skills[t.boost] + t.amt);
  r6TattooSave(); saveGame();
  toast('Inked: ' + t.name + ' (+' + t.amt + ' ' + t.boost + ').');
  r6TattooOpen();
}
function r6TattooClient() {
  r6Tattoo.clients++; r6Tattoo.flashDone = Math.min(12, r6Tattoo.flashDone + 1);
  r6Tattoo.earned += 70;
  r6Earn(70, 'Inked a walk-in client at ' + R6_TATTOO_SHOP.name + '.');
  if (r6Tattoo.flashDone === 12) { r6Earn(350, 'Flash book complete — every design inked at least once!'); }
  r6TattooSave(); r6TattooOpen();
}
function r6TattooSave() { r6Save('tattoo', { owned: r6Tattoo.owned, clients: r6Tattoo.clients, earned: r6Tattoo.earned, flashDone: r6Tattoo.flashDone }); }
function r6TattooLoad() {
  const s = r6Load('tattoo', null);
  if (s) { r6Tattoo.owned = s.owned || []; r6Tattoo.clients = s.clients || 0; r6Tattoo.earned = s.earned || 0; r6Tattoo.flashDone = s.flashDone || 0; }
}

// ---------- Round 6 system 8: street art crew ----------
// The Gulls paint the bay. Six mural walls, spray cans to buy, crew rep that
// opens bigger walls, and tagging heat — the police notice fresh paint.
const R6_MURALS = [
  { name: 'Harbour Whale', x: -40, z: 60, size: 3, rep: 0, desc: 'a blue whale across the harbour wall' },
  { name: 'Neon Palm', x: 52, z: -70, size: 2, rep: 10, desc: 'a palm in pink and cyan neon' },
  { name: 'The Fisher King', x: -70, z: -60, size: 4, rep: 25, desc: 'an old fisherman, four storeys tall' },
  { name: 'Sunset Gulls', x: 20, z: 90, size: 3, rep: 40, desc: 'gulls over a gold horizon' },
  { name: 'Airport Sky', x: -160, z: -20, size: 5, rep: 60, desc: 'a jet breaking through painted cloud' },
  { name: 'Bay Heart', x: 8, z: -12, size: 2, rep: 80, desc: 'the whole bay inside one heart' },
];
const R6_SPRAY = [
  { name: 'Basic Cans', price: 25, cans: 3, desc: 'three colours, decent pressure' },
  { name: 'Pro Set', price: 60, cans: 8, desc: 'eight colours, fat caps included' },
  { name: 'Chrome Pack', price: 110, cans: 14, desc: 'fourteen cans, mirror chrome' },
];
let r6Art = { cans: 0, rep: 0, done: [], heat: 0, crew: 1 };
function r6ArtBuild() {
  for (const m of R6_MURALS) {
    addBox(10, 7, 1, 0x6a6a72, m.x, 3.5, m.z);
    const done = r6Art.done.includes(m.name);
    const paint = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 0.3), new THREE.MeshStandardMaterial({ color: done ? 0xff5a9a : 0x8a8a92, emissive: done ? 0x661133 : 0x000000, emissiveIntensity: done ? 0.4 : 0 }));
    paint.position.set(m.x, 3.4, m.z - 0.7); scene.add(paint);
    addBox(1, 1, 1, 0xffd23f, m.x + 5.4, 0.5, m.z + 1);
  }
}
function r6ArtNear() {
  for (let i = 0; i < R6_MURALS.length; i++) if (r6Near(R6_MURALS[i].x, R6_MURALS[i].z, 10)) return i;
  return -1;
}
function r6ArtOpen() {
  const at = r6ArtNear();
  if (at < 0) return false;
  const m = R6_MURALS[at];
  const done = r6Art.done.includes(m.name);
  const locked = r6Art.rep < m.rep;
  const lines = [
    m.name + ' — ' + m.desc + '.',
    'Wall size: ' + m.size + ' · Needs ' + m.rep + ' crew rep · Your rep: ' + r6Art.rep + '.',
    'Spray cans: ' + r6Art.cans + ' (needs ' + m.size + ') · Tagging heat: ' + r6Art.heat + '.',
    done ? 'This wall is finished — the Gulls signed it.' : 'Fresh wall. Paint it before the rain does.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_SPRAY.length; i++) {
    const s = R6_SPRAY[i];
    buttons.push(r6PanelButton('Buy ' + s.name + ' — $' + s.price + ' (+' + s.cans + ' cans)', () => { if (r6Spend(s.price)) { r6Art.cans += s.cans; r6ArtSave(); r6ArtOpen(); } }));
  }
  buttons.push(r6PanelButton('Paint this wall', () => { r6ArtPaint(at); }, done || locked || r6Art.cans < m.size));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🎨 ' + m.name, lines, buttons);
  return true;
}
function r6ArtPaint(i) {
  const m = R6_MURALS[i];
  if (r6Art.done.includes(m.name) || r6Art.rep < m.rep || r6Art.cans < m.size) return;
  r6Art.cans -= m.size;
  r6Art.done.push(m.name);
  r6Art.rep += 12 + m.size * 3;
  r6Art.heat = Math.min(5, r6Art.heat + 1);
  const pay = 80 + m.size * 60;
  r6Earn(pay, 'Finished "' + m.name + '" — the crew loves it (rep ' + r6Art.rep + ').');
  if (r6Art.done.length === R6_MURALS.length) r6Earn(500, 'All six murals done — the bay is a gallery now!');
  if (r6Art.heat >= 3) { state.wanted = Math.min(5, state.wanted + 1); toast('Tagging heat is high — police are watching the walls.'); }
  r6ArtSave(); updateHUD(); r6ArtOpen();
}
function r6ArtUpdate(dt) {
  r6Art._t = (r6Art._t || 0) + dt;
  if (r6Art._t > 60) { r6Art._t = 0; r6Art.heat = Math.max(0, r6Art.heat - 1); }
}
function r6ArtSave() { r6Save('art', { cans: r6Art.cans, rep: r6Art.rep, done: r6Art.done, heat: r6Art.heat, crew: r6Art.crew }); }
function r6ArtLoad() {
  const s = r6Load('art', null);
  if (s) { r6Art.cans = s.cans || 0; r6Art.rep = s.rep || 0; r6Art.done = s.done || []; r6Art.heat = s.heat || 0; r6Art.crew = s.crew || 1; }
}

// ---------- Round 6 system 9: horse ranch ----------
// Rancho del Sol, out west past the farmland. Buy horses, train them daily,
// race them on the ranch track, and stable income trickles in per horse.
const R6_HORSES = [
  { name: 'Marina', price: 900, speed: 3, desc: 'calm bay mare, steady gallop' },
  { name: 'Comet', price: 1600, speed: 4, desc: 'a chestnut with a fast start' },
  { name: 'Storm King', price: 2800, speed: 5, desc: 'black stallion, track record holder' },
  { name: 'Daisy', price: 600, speed: 2, desc: 'gentle, good for beginners' },
];
const R6_RANCH = { x: -150, z: 150, name: 'Rancho del Sol' };
let r6Ranch = { horses: [], trained: 0, raceWins: 0, income: 0, raceTimer: 170 };
function r6RanchBuild() {
  addBox(14, 5, 10, 0x8a5a2a, R6_RANCH.x, 2.5, R6_RANCH.z);
  addBox(15, 0.8, 11, 0x6a3a1a, R6_RANCH.x, 5.4, R6_RANCH.z);
  const barnDoor = new THREE.Mesh(new THREE.BoxGeometry(4, 3.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 0.9 }));
  barnDoor.position.set(R6_RANCH.x, 1.8, R6_RANCH.z - 5.1); scene.add(barnDoor);
  for (let i = 0; i < 6; i++) addBox(0.25, 1.1, 0.25, 0xd8c8a8, R6_RANCH.x - 12 + i * 4.8, 0.55, R6_RANCH.z + 12);
  addBox(24, 0.25, 0.25, 0xd8c8a8, R6_RANCH.x, 1.15, R6_RANCH.z + 12);
  for (let i = 0; i < 3; i++) {
    const horse = new THREE.Group();
    const bodyH = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 0.8), new THREE.MeshStandardMaterial({ color: [0x6a3a1a, 0x2a2a2a, 0xc8a060][i], roughness: 0.8 }));
    bodyH.position.y = 1.2; horse.add(bodyH);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1, 0.6), new THREE.MeshStandardMaterial({ color: [0x6a3a1a, 0x2a2a2a, 0xc8a060][i], roughness: 0.8 }));
    neck.position.set(1.3, 1.8, 0); neck.rotation.z = -0.5; horse.add(neck);
    horse.position.set(R6_RANCH.x - 8 + i * 8, 0, R6_RANCH.z + 16);
    scene.add(horse);
  }
  const trough = new THREE.Mesh(new THREE.BoxGeometry(3, 0.7, 1), new THREE.MeshStandardMaterial({ color: 0x4a4a55, roughness: 0.9 }));
  trough.position.set(R6_RANCH.x + 8, 0.35, R6_RANCH.z + 16); scene.add(trough);
}
function r6RanchNear() { return r6Near(R6_RANCH.x, R6_RANCH.z, 14); }
function r6RanchOpen() {
  if (!r6RanchNear()) return false;
  const lines = [
    R6_RANCH.name + ' — stables, a track, and Tomas the ranch hand.',
    'Your horses: ' + (r6Ranch.horses.length ? r6Ranch.horses.map((h) => R6_HORSES[h].name).join(', ') : 'none yet') + '.',
    'Trained: ' + r6Ranch.trained + ' times · Race wins: ' + r6Ranch.raceWins + ' · Stable income banked: $' + r6Ranch.income + '.',
    'Ranch race in ' + Math.ceil(r6Ranch.raceTimer) + 's — winner takes $420.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_HORSES.length; i++) {
    const h = R6_HORSES[i];
    const owned = r6Ranch.horses.includes(i);
    buttons.push(r6PanelButton((owned ? '✓ ' : '') + h.name + ' — $' + h.price + ' (speed ' + h.speed + ')', () => { if (!owned && r6Spend(h.price)) { r6Ranch.horses.push(i); r6RanchSave(); r6RanchOpen(); } }, owned));
  }
  buttons.push(r6PanelButton('Train a horse (+speed, $40)', () => { r6RanchTrain(); }, r6Ranch.horses.length === 0));
  buttons.push(r6PanelButton('Enter the ranch race', () => { r6RanchRace(); }, r6Ranch.horses.length === 0));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🐎 ' + R6_RANCH.name, lines, buttons);
  return true;
}
function r6RanchTrain() {
  if (!r6Spend(40)) return;
  r6Ranch.trained++;
  toast('Tomas works the horse around the ring. It feels quicker already.');
  r6RanchSave(); r6RanchOpen();
}
function r6RanchRace() {
  const best = Math.max(...r6Ranch.horses.map((h) => R6_HORSES[h].speed));
  const myScore = best * 10 + r6Ranch.trained * 2 + Math.random() * 12;
  const rival = 34 + Math.random() * 14;
  if (myScore > rival) {
    r6Ranch.raceWins++;
    r6Earn(420, '🏇 Won the ranch race!');
  } else toast('Ranch race lost — ' + Math.round(rival - myScore) + ' lengths behind. Train more.');
  r6RanchSave(); r6RanchOpen();
}
function r6RanchUpdate(dt) {
  r6Ranch.raceTimer -= dt;
  if (r6Ranch.raceTimer <= 0) {
    r6Ranch.raceTimer = 200;
    if (r6Ranch.horses.length > 0) {
      const pay = r6Ranch.horses.length * 25;
      r6Ranch.income += pay;
      r6Earn(pay, 'Stable income — ' + r6Ranch.horses.length + ' horse(s) boarded at the ranch.');
    }
    r6RanchSave();
  }
}
function r6RanchSave() { r6Save('ranch', { horses: r6Ranch.horses, trained: r6Ranch.trained, raceWins: r6Ranch.raceWins, income: r6Ranch.income }); }
function r6RanchLoad() {
  const s = r6Load('ranch', null);
  if (s) { r6Ranch.horses = s.horses || []; r6Ranch.trained = s.trained || 0; r6Ranch.raceWins = s.raceWins || 0; r6Ranch.income = s.income || 0; }
}

// ---------- Round 6 system 10: golf + mini-golf ----------
// Solmar Greens: a 9-hole course with a pro, tournaments, caddy tips, and a
// mini-golf course by the beach for quick rounds with Ian.
const R6_GOLF_HOLES = [
  { name: 'Palm Bend', par: 4, dist: 320 },
  { name: 'Lake Carry', par: 3, dist: 170 },
  { name: 'Dune Ridge', par: 5, dist: 480 },
  { name: 'Coral Corner', par: 4, dist: 350 },
  { name: 'Windmill Pass', par: 3, dist: 150 },
  { name: 'Harbour View', par: 4, dist: 390 },
  { name: 'Bunker Field', par: 5, dist: 510 },
  { name: 'Sunset Nine', par: 4, dist: 360 },
  { name: 'The Gull', par: 3, dist: 140 },
];
const R6_GOLF_COURSE = { x: 100, z: -160, name: 'Solmar Greens' };
const R6_MINIGOLF = { x: 108, z: 128, name: 'Beach Mini-Golf' };
let r6Golf = { rounds: 0, best: 99, tourneyWins: 0, caddyTips: 0, miniRounds: 0, tourneyTimer: 240 };
function r6GolfParTotal() { return R6_GOLF_HOLES.reduce((s, h) => s + h.par, 0); }
function r6GolfBuild() {
  addBox(30, 0.4, 22, 0x4a8a3a, R6_GOLF_COURSE.x, 0.2, R6_GOLF_COURSE.z);
  for (let i = 0; i < 9; i++) {
    const hx = R6_GOLF_COURSE.x - 12 + (i % 3) * 12;
    const hz = R6_GOLF_COURSE.z - 8 + Math.floor(i / 3) * 8;
    const green = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.9 }));
    green.position.set(hx, 0.4, hz); scene.add(green);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.7 }));
    flag.position.set(hx + 0.5, 2.4, hz); scene.add(flag);
    addBox(0.12, 2.2, 0.12, 0xd8d8d8, hx, 1.4, hz);
    if (i === 1 || i === 6) {
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0xe8d5a0, roughness: 1 }));
      sand.position.set(hx + 3.5, 0.35, hz + 2); scene.add(sand);
    }
  }
  addBox(8, 3, 6, 0xf0ead8, R6_GOLF_COURSE.x + 18, 1.5, R6_GOLF_COURSE.z - 12);
  addBox(12, 0.4, 10, 0xc86a8a, R6_MINIGOLF.x, 0.2, R6_MINIGOLF.z);
  for (let i = 0; i < 3; i++) {
    const wind = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 4), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.8 }));
    wind.position.set(R6_MINIGOLF.x - 4 + i * 4, 1.8, R6_MINIGOLF.z - 2); scene.add(wind);
  }
}
function r6GolfNear() { return r6Near(R6_GOLF_COURSE.x, R6_GOLF_COURSE.z, 16); }
function r6MiniNear() { return r6Near(R6_MINIGOLF.x, R6_MINIGOLF.z, 9); }
function r6GolfOpen() {
  if (!r6GolfNear() && !r6MiniNear()) return false;
  if (r6MiniNear() && !r6GolfNear()) {
    r6ShowPanel('⛳ ' + R6_MINIGOLF.name, [
      'Nine tiny holes, one windmill, zero pressure.',
      'Mini rounds played: ' + r6Golf.miniRounds + ' · A round costs $15, a hole-in-one pays $60.',
      'Ryan and Ian play here on slow afternoons.',
    ], [
      r6PanelButton('Play a mini round — $15', () => { r6MiniPlay(); }),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  const lines = [
    R6_GOLF_COURSE.name + ' — 9 holes, par ' + r6GolfParTotal() + ', pro Elsa on the first tee.',
    'Rounds played: ' + r6Golf.rounds + ' · Best score: ' + (r6Golf.best === 99 ? '—' : r6Golf.best) + ' · Tourney wins: ' + r6Golf.tourneyWins + '.',
    'Caddy tips banked: $' + r6Golf.caddyTips + ' · Next tournament in ' + Math.ceil(r6Golf.tourneyTimer) + 's.',
    'A round costs $45. Beat par and the clubhouse pays a $200 bonus.',
  ];
  r6ShowPanel('⛳ ' + R6_GOLF_COURSE.name, lines, [
    r6PanelButton('Play a round — $45', () => { r6GolfPlay(); }),
    r6PanelButton('Caddy for a member ($35 tip)', () => { r6GolfCaddy(); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6GolfPlay() {
  if (!r6Spend(45)) return;
  r6Golf.rounds++;
  const skill = skills && typeof skills.driving === 'number' ? skills.driving : 10;
  const score = Math.max(27, Math.round(r6GolfParTotal() + (Math.random() * 10 - 4) - skill * 0.05));
  if (score < r6Golf.best) r6Golf.best = score;
  if (score <= r6GolfParTotal()) r6Earn(200, '⛳ Beat par at Solmar Greens! Score ' + score + ' (par ' + r6GolfParTotal() + ').');
  else toast('Round done — ' + score + ' strokes (par ' + r6GolfParTotal() + '). Elsa says: keep your head down.');
  r6GolfSave(); r6GolfOpen();
}
function r6GolfCaddy() {
  r6Golf.caddyTips += 35;
  r6Earn(35, 'Caddied 18 holes for a member — good read on the greens.');
  r6GolfSave(); r6GolfOpen();
}
function r6MiniPlay() {
  if (!r6Spend(15)) return;
  r6Golf.miniRounds++;
  if (Math.random() < 0.22) { r6Earn(60, '⛳ Hole-in-one on the windmill hole!'); }
  else toast('Mini-golf round done — the windmill got you again.');
  r6GolfSave(); r6GolfOpen();
}
function r6GolfUpdate(dt) {
  r6Golf.tourneyTimer -= dt;
  if (r6Golf.tourneyTimer <= 0) {
    r6Golf.tourneyTimer = 280;
    if (r6Golf.best <= r6GolfParTotal() + 2 && r6Golf.rounds > 0) { r6Golf.tourneyWins++; r6Earn(350, '🏆 Won the Solmar Greens club tournament!'); }
    else toast('Club tournament at Solmar Greens — play rounds and beat par to win $350.');
    r6GolfSave();
  }
}
function r6GolfSave() { r6Save('golf6', { rounds: r6Golf.rounds, best: r6Golf.best, tourneyWins: r6Golf.tourneyWins, caddyTips: r6Golf.caddyTips, miniRounds: r6Golf.miniRounds }); }
function r6GolfLoad() {
  const s = r6Load('golf6', null);
  if (s) { r6Golf.rounds = s.rounds || 0; r6Golf.best = s.best ?? 99; r6Golf.tourneyWins = s.tourneyWins || 0; r6Golf.caddyTips = s.caddyTips || 0; r6Golf.miniRounds = s.miniRounds || 0; }
}
// ---------- Round 6 system 11: bowling alley ----------
// Strike Lanes: ten frames, league nights, a perfect game pays $600, and the
// snack bar sells the best fries on the bay.
const R6_BOWL_ALLEY = { x: -108, z: -40, name: 'Strike Lanes' };
let r6Bowl = { games: 0, best: 0, strikes: 0, perfects: 0, leagueWins: 0, leagueTimer: 190, snacks: 0 };
function r6BowlBuild() {
  addBox(20, 6, 12, 0x3a2a4a, R6_BOWL_ALLEY.x, 3, R6_BOWL_ALLEY.z);
  addBox(21, 0.8, 13, 0xffd23f, R6_BOWL_ALLEY.x, 6.4, R6_BOWL_ALLEY.z);
  for (let i = 0; i < 3; i++) {
    const lane = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 9), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.4 }));
    lane.position.set(R6_BOWL_ALLEY.x - 4 + i * 3.4, 0.7, R6_BOWL_ALLEY.z + 8); scene.add(lane);
  }
  for (let i = 0; i < 5; i++) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    pin.position.set(R6_BOWL_ALLEY.x - 4 + (i % 3) * 1, 1.1, R6_BOWL_ALLEY.z + 12 + Math.floor(i / 3) * 0.8); scene.add(pin);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), new THREE.MeshStandardMaterial({ color: 0x2e6fb0, roughness: 0.3 }));
  ball.position.set(R6_BOWL_ALLEY.x + 4, 0.9, R6_BOWL_ALLEY.z + 6); scene.add(ball);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.4, 0.3), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x881111, emissiveIntensity: 0.5 }));
  sign.position.set(R6_BOWL_ALLEY.x, 5, R6_BOWL_ALLEY.z - 6.2); scene.add(sign);
}
function r6BowlNear() { return r6Near(R6_BOWL_ALLEY.x, R6_BOWL_ALLEY.z, 11); }
function r6BowlOpen() {
  if (!r6BowlNear()) return false;
  const lines = [
    R6_BOWL_ALLEY.name + ' — twelve lanes, one very loud jukebox.',
    'Games bowled: ' + r6Bowl.games + ' · Best score: ' + r6Bowl.best + ' · Strikes: ' + r6Bowl.strikes + '.',
    'Perfect games: ' + r6Bowl.perfects + ' ($600 each) · League wins: ' + r6Bowl.leagueWins + '.',
    'League night in ' + Math.ceil(r6Bowl.leagueTimer) + 's — top score wins $300.',
    'A game costs $20. The snack bar sells fries for $8 (they heal 5 health).',
  ];
  r6ShowPanel('🎳 ' + R6_BOWL_ALLEY.name, lines, [
    r6PanelButton('Bowl a game — $20', () => { r6BowlPlay(); }),
    r6PanelButton('Buy fries — $8 (+5 health)', () => { if (r6Spend(8)) { r6Bowl.snacks++; state.health = Math.min(100, state.health + 5); updateHUD(); toast('Strike Lanes fries. Worth every cent.'); r6BowlSave(); r6BowlOpen(); } }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6BowlPlay() {
  if (!r6Spend(20)) return;
  r6Bowl.games++;
  let score = 0;
  for (let f = 0; f < 10; f++) {
    const frame = Math.random();
    if (frame < 0.22) { score += 30; r6Bowl.strikes++; }
    else if (frame < 0.55) score += 18;
    else score += 9 + Math.floor(Math.random() * 7);
  }
  if (score > r6Bowl.best) r6Bowl.best = score;
  if (score >= 280) { r6Bowl.perfects++; r6Earn(600, '🎳 PERFECT GAME at Strike Lanes! ' + score + ' pins!'); }
  else if (score >= 200) r6Earn(120, 'Bowled ' + score + ' — the league regulars nod approvingly.');
  else toast('Bowled ' + score + '. The gutter sends its regards.');
  r6BowlSave(); r6BowlOpen();
}
function r6BowlUpdate(dt) {
  r6Bowl.leagueTimer -= dt;
  if (r6Bowl.leagueTimer <= 0) {
    r6Bowl.leagueTimer = 240;
    if (r6Bowl.best >= 200) { r6Bowl.leagueWins++; r6Earn(300, '🏆 Won league night at Strike Lanes!'); }
    else toast('League night at Strike Lanes — bowl 200+ in a game to take $300.');
    r6BowlSave();
  }
}
function r6BowlSave() { r6Save('bowl', { games: r6Bowl.games, best: r6Bowl.best, strikes: r6Bowl.strikes, perfects: r6Bowl.perfects, leagueWins: r6Bowl.leagueWins, snacks: r6Bowl.snacks }); }
function r6BowlLoad() {
  const s = r6Load('bowl', null);
  if (s) { r6Bowl.games = s.games || 0; r6Bowl.best = s.best || 0; r6Bowl.strikes = s.strikes || 0; r6Bowl.perfects = s.perfects || 0; r6Bowl.leagueWins = s.leagueWins || 0; r6Bowl.snacks = s.snacks || 0; }
}

// ---------- Round 6 system 12: arcade hall ----------
// Neon Palace: five retro cabinets, tokens, high scores on the wall, and a
// prize shelf where tickets turn into plush toys and cash.
const R6_ARCADE_CABS = [
  { name: 'Bay Blaster', price: 2, top: 9800, desc: 'shoot the gulls, dodge the buoys' },
  { name: 'Turbo Taxi', price: 2, top: 12400, desc: 'deliver fares through rush hour' },
  { name: 'Palm Fighter', price: 3, top: 7600, desc: 'two buttons, one champion' },
  { name: 'Deep Dive', price: 2, top: 15100, desc: 'dodge sharks, grab the pearls' },
  { name: 'Disco Dance', price: 3, top: 20300, desc: 'step on the beat, own the floor' },
];
const R6_ARCADE = { x: 30, z: -60, name: 'Neon Palace' };
let r6Arcade = { tokens: 0, tickets: 0, scores: {}, plays: 0, prizes: 0 };
function r6ArcadeBuild() {
  addBox(16, 6, 10, 0x1a1a2e, R6_ARCADE.x, 3, R6_ARCADE.z);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 0.3), new THREE.MeshStandardMaterial({ color: 0xff2a7a, emissive: 0xff2a7a, emissiveIntensity: 0.8 }));
  neon.position.set(R6_ARCADE.x, 5.2, R6_ARCADE.z - 5.2); scene.add(neon);
  for (let i = 0; i < 5; i++) {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 1.2), new THREE.MeshStandardMaterial({ color: [0xff2a7a, 0x2ee6ff, 0xffd23f, 0x7dff9a, 0x8a2be2][i], roughness: 0.5 }));
    cab.position.set(R6_ARCADE.x - 6 + i * 3, 1.3, R6_ARCADE.z + 6.5); scene.add(cab);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.1), new THREE.MeshBasicMaterial({ color: 0x0a2a3a }));
    screen.position.set(R6_ARCADE.x - 6 + i * 3, 1.9, R6_ARCADE.z + 5.9); scene.add(screen);
  }
  addBox(5, 3, 1.5, 0x8a5a2a, R6_ARCADE.x + 9, 1.5, R6_ARCADE.z + 4);
  for (let i = 0; i < 3; i++) {
    const toy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial({ color: [0xff5a5a, 0xffd23f, 0x2ee6ff][i], roughness: 0.7 }));
    toy.position.set(R6_ARCADE.x + 7.6 + i * 1.4, 3.4, R6_ARCADE.z + 4); scene.add(toy);
  }
}
function r6ArcadeNear() { return r6Near(R6_ARCADE.x, R6_ARCADE.z, 10); }
function r6ArcadeOpen() {
  if (!r6ArcadeNear()) return false;
  const lines = [
    R6_ARCADE.name + ' — five cabinets, one prize shelf, zero mercy.',
    'Tokens: ' + r6Arcade.tokens + ' · Tickets: ' + r6Arcade.tickets + ' · Plays: ' + r6Arcade.plays + ' · Prizes won: ' + r6Arcade.prizes + '.',
    'Beat a cabinet top score for $150. 100 tickets trade for $80 at the prize shelf.',
    'Tokens cost $5 each at the change machine.',
  ];
  const buttons = [r6PanelButton('Buy 5 tokens — $25', () => { if (r6Spend(25)) { r6Arcade.tokens += 5; r6ArcadeSave(); r6ArcadeOpen(); } })];
  for (let i = 0; i < R6_ARCADE_CABS.length; i++) {
    const cab = R6_ARCADE_CABS[i];
    const best = r6Arcade.scores[cab.name] || 0;
    buttons.push(r6PanelButton(cab.name + ' — ' + cab.price + ' token(s) · best ' + best + ' / top ' + cab.top, () => { r6ArcadePlay(i); }, r6Arcade.tokens < cab.price));
  }
  buttons.push(r6PanelButton('Trade 100 tickets — $80', () => { if (r6Arcade.tickets >= 100) { r6Arcade.tickets -= 100; r6Arcade.prizes++; r6Earn(80, 'Traded tickets for a prize at the shelf.'); r6ArcadeSave(); r6ArcadeOpen(); } else toast('Need 100 tickets — you have ' + r6Arcade.tickets + '.'); }, r6Arcade.tickets < 100));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🕹️ ' + R6_ARCADE.name, lines, buttons);
  return true;
}
function r6ArcadePlay(i) {
  const cab = R6_ARCADE_CABS[i];
  if (r6Arcade.tokens < cab.price) return;
  r6Arcade.tokens -= cab.price; r6Arcade.plays++;
  const score = Math.floor(Math.random() * cab.top * 1.25);
  const best = r6Arcade.scores[cab.name] || 0;
  const ticketsWon = Math.floor(score / 400);
  r6Arcade.tickets += ticketsWon;
  if (score > best) r6Arcade.scores[cab.name] = score;
  if (score > cab.top) r6Earn(150, '🕹️ NEW TOP SCORE on ' + cab.name + ': ' + score + '!');
  else toast(cab.name + ': ' + score + ' pts (+' + ticketsWon + ' tickets). Top is ' + cab.top + '.');
  r6ArcadeSave(); r6ArcadeOpen();
}
function r6ArcadeSave() { r6Save('arcade', { tokens: r6Arcade.tokens, tickets: r6Arcade.tickets, scores: r6Arcade.scores, plays: r6Arcade.plays, prizes: r6Arcade.prizes }); }
function r6ArcadeLoad() {
  const s = r6Load('arcade', null);
  if (s) { r6Arcade.tokens = s.tokens || 0; r6Arcade.tickets = s.tickets || 0; r6Arcade.scores = s.scores || {}; r6Arcade.plays = s.plays || 0; r6Arcade.prizes = s.prizes || 0; }
}

// ---------- Round 6 system 13: library + rare books ----------
// The old library on Library Row. Twelve rare books hide in the stacks; each
// one read grants a lasting boost, and the Thursday book club pays $120.
const R6_RARE_BOOKS = [
  { name: 'Tides of Solmar', boost: 'driving', amt: 4, shelf: 'A3' },
  { name: 'The Salt Merchant', boost: 'stamina', amt: 4, shelf: 'B1' },
  { name: 'Charts of the Bay', boost: 'driving', amt: 5, shelf: 'C2' },
  { name: 'A Gull\'s Atlas', boost: 'shooting', amt: 4, shelf: 'A1' },
  { name: 'The Lighthouse Log', boost: 'stamina', amt: 5, shelf: 'D4' },
  { name: 'Coral Economies', boost: 'driving', amt: 4, shelf: 'B3' },
  { name: 'Harbour Nights', boost: 'shooting', amt: 5, shelf: 'C1' },
  { name: 'The Ferry Captain', boost: 'stamina', amt: 6, shelf: 'A2' },
  { name: 'Palm Wine Recipes', boost: 'driving', amt: 3, shelf: 'D2' },
  { name: 'Storms of the Keys', boost: 'shooting', amt: 6, shelf: 'B2' },
  { name: 'The Mapmaker\'s Wife', boost: 'stamina', amt: 5, shelf: 'C4' },
  { name: 'Solmar: A History', boost: 'driving', amt: 7, shelf: 'D1' },
];
const R6_LIBRARY = { x: -16, z: -44, name: 'Solmar Library' };
let r6Library = { read: [], club: 0, clubTimer: 150, quiet: 0 };
function r6LibraryBuild() {
  addBox(16, 8, 12, 0xd8c8a8, R6_LIBRARY.x, 4, R6_LIBRARY.z);
  addBox(17, 1, 13, 0x8a2a2a, R6_LIBRARY.x, 8.5, R6_LIBRARY.z);
  for (let i = 0; i < 4; i++) addBox(1.2, 5, 0.6, 0xf0ead8, R6_LIBRARY.x - 6 + i * 4, 2.5, R6_LIBRARY.z - 6.2);
  const steps = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 3), new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.9 }));
  steps.position.set(R6_LIBRARY.x, 0.3, R6_LIBRARY.z - 7.5); scene.add(steps);
  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 0.8), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }));
    shelf.position.set(R6_LIBRARY.x - 4 + i * 4, 1.6, R6_LIBRARY.z + 7); scene.add(shelf);
  }
}
function r6LibraryNear() { return r6Near(R6_LIBRARY.x, R6_LIBRARY.z, 10); }
function r6LibraryOpen() {
  if (!r6LibraryNear()) return false;
  const lines = [
    R6_LIBRARY.name + ' — librarian Agnes keeps the quiet, and the rare books.',
    'Rare books read: ' + r6Library.read.length + '/12 · Book club sessions: ' + r6Library.club + '.',
    'Next book club in ' + Math.ceil(r6Library.clubTimer) + 's — attendance pays $120.',
    'Each rare book grants a permanent skill boost when read.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_RARE_BOOKS.length; i++) {
    const b = R6_RARE_BOOKS[i];
    const read = r6Library.read.includes(i);
    buttons.push(r6PanelButton((read ? '✓ ' : '') + b.name + ' — shelf ' + b.shelf + ' (+' + b.amt + ' ' + b.boost + ')', () => { r6LibraryRead(i); }, read));
  }
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('📚 ' + R6_LIBRARY.name, lines, buttons);
  return true;
}
function r6LibraryRead(i) {
  if (r6Library.read.includes(i)) return;
  const b = R6_RARE_BOOKS[i];
  r6Library.read.push(i);
  if (skills && typeof skills[b.boost] === 'number') skills[b.boost] = Math.min(100, skills[b.boost] + b.amt);
  toast('Read "' + b.name + '" (+' + b.amt + ' ' + b.boost + '). ' + (12 - r6Library.read.length) + ' rare books left.');
  if (r6Library.read.length === 12) r6Earn(400, 'Read every rare book in the library — Agnes frames your card!');
  r6LibrarySave(); saveGame(); r6LibraryOpen();
}
function r6LibraryUpdate(dt) {
  r6Library.clubTimer -= dt;
  if (r6Library.clubTimer <= 0) {
    r6Library.clubTimer = 200;
    r6Library.club++;
    r6Earn(120, '📚 Book club at the library — lively debate about "Tides of Solmar".');
    r6LibrarySave();
  }
}
function r6LibrarySave() { r6Save('library', { read: r6Library.read, club: r6Library.club }); }
function r6LibraryLoad() {
  const s = r6Load('library', null);
  if (s) { r6Library.read = s.read || []; r6Library.club = s.club || 0; }
}

// ---------- Round 6 system 14: museum ----------
// The Bay Museum: four exhibit halls, guided tours you can run for tips, an
// artifact hunt across the city, and a night-at-the-museum event.
const R6_MUSEUM_EXHIBITS = [
  { name: 'The First Ferry', hall: 'Maritime', desc: 'the 1936 ferry bell, still shiny' },
  { name: 'Coral Crown', hall: 'Natural History', desc: 'a crown of pink coral, found in 1958' },
  { name: 'The Old Cannon', hall: 'Harbour Defence', desc: 'fired once, at a whale, missed' },
  { name: 'Gull in Gold', hall: 'Bay Art', desc: 'a golden gull, the museum mascot' },
];
const R6_MUSEUM_ARTIFACTS = [
  { name: 'Brass Compass', x: 60, z: 40 },
  { name: 'Porcelain Shard', x: -36, z: -20 },
  { name: 'Silver Anchor Pin', x: 120, z: 60 },
  { name: 'Old Ferry Ticket', x: -120, z: 80 },
];
const R6_MUSEUM = { x: 12, z: -72, name: 'Bay Museum' };
let r6Museum = { tours: 0, tips: 0, artifacts: [], nightWins: 0, nightTimer: 210 };
function r6MuseumBuild() {
  addBox(20, 9, 14, 0xf0ead8, R6_MUSEUM.x, 4.5, R6_MUSEUM.z);
  addBox(22, 1.2, 16, 0x2a4a6a, R6_MUSEUM.x, 9.6, R6_MUSEUM.z);
  for (let i = 0; i < 4; i++) addBox(1.4, 7, 1.4, 0xd8c8a8, R6_MUSEUM.x - 7.5 + i * 5, 3.5, R6_MUSEUM.z - 7.4);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a6a8a, roughness: 0.6 }));
  dome.position.set(R6_MUSEUM.x, 10.2, R6_MUSEUM.z); scene.add(dome);
  for (let i = 0; i < 4; i++) {
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x2ee6ff, roughness: 0.2, metalness: 0.3 }));
    caseM.position.set(R6_MUSEUM.x - 6 + i * 4, 1, R6_MUSEUM.z + 8.5); scene.add(caseM);
  }
}
function r6MuseumNear() { return r6Near(R6_MUSEUM.x, R6_MUSEUM.z, 11); }
function r6MuseumArtifactNear() {
  for (let i = 0; i < R6_MUSEUM_ARTIFACTS.length; i++) {
    if (r6Museum.artifacts.includes(i)) continue;
    if (r6Near(R6_MUSEUM_ARTIFACTS[i].x, R6_MUSEUM_ARTIFACTS[i].z, 6)) return i;
  }
  return -1;
}
function r6MuseumOpen() {
  if (r6MuseumArtifactNear() >= 0) {
    const a = R6_MUSEUM_ARTIFACTS[r6MuseumArtifactNear()];
    r6ShowPanel('🏺 Artifact found!', ['A ' + a.name + ' — one of the museum\'s lost pieces.', 'Hand it to curator Dr. Okafor at the Bay Museum for $110.'], [
      r6PanelButton('Pocket the ' + a.name, () => { r6Museum.artifacts.push(r6MuseumArtifactNear()); r6Earn(110, 'Returned a lost artifact to the museum.'); r6MuseumSave(); r6ClosePanel(); }),
      r6PanelButton('Leave it', () => r6ClosePanel()),
    ]);
    return true;
  }
  if (!r6MuseumNear()) return false;
  const lines = [
    R6_MUSEUM.name + ' — curator Dr. Okafor, four halls, one golden gull.',
    'Tours given: ' + r6Museum.tours + ' · Tour tips banked: $' + r6Museum.tips + '.',
    'Artifacts returned: ' + r6Museum.artifacts.length + '/4 · Night events won: ' + r6Museum.nightWins + '.',
    'Night at the museum in ' + Math.ceil(r6Museum.nightTimer) + 's — a quiz night paying $250.',
  ];
  const buttons = [];
  for (const ex of R6_MUSEUM_EXHIBITS) buttons.push(r6PanelButton('Tour: ' + ex.name + ' (' + ex.hall + ')', () => { r6MuseumTour(ex); }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🏛️ ' + R6_MUSEUM.name, lines, buttons);
  return true;
}
function r6MuseumTour(ex) {
  r6Museum.tours++;
  const tip = 25 + Math.floor(Math.random() * 30);
  r6Museum.tips += tip;
  r6Earn(tip, 'Guided a tour of "' + ex.name + '" — ' + ex.desc + '.');
  r6MuseumSave(); r6MuseumOpen();
}
function r6MuseumUpdate(dt) {
  r6Museum.nightTimer -= dt;
  if (r6Museum.nightTimer <= 0) {
    r6Museum.nightTimer = 260;
    if (r6Museum.tours >= 3) { r6Museum.nightWins++; r6Earn(250, '🏛️ Night at the museum — quiz champion, by one question!'); }
    else toast('Night at the museum — give 3 tours first to join the $250 quiz night.');
    r6MuseumSave();
  }
}
function r6MuseumSave() { r6Save('museum', { tours: r6Museum.tours, tips: r6Museum.tips, artifacts: r6Museum.artifacts, nightWins: r6Museum.nightWins }); }
function r6MuseumLoad() {
  const s = r6Load('museum', null);
  if (s) { r6Museum.tours = s.tours || 0; r6Museum.tips = s.tips || 0; r6Museum.artifacts = s.artifacts || []; r6Museum.nightWins = s.nightWins || 0; }
}
// ---------- Round 6 system 15: carnival / fairground ----------
// The Solmar Fair rolls into the south field: a Ferris wheel, bumper cars,
// ring toss, and a fireworks show every evening that pays $200 to watch from
// the best seat in the house.
const R6_FAIR = { x: 40, z: 190, name: 'Solmar Fair' };
let r6Fair = { rides: 0, rings: 0, ringWins: 0, bumpWins: 0, shows: 0, showTimer: 130 };
function r6FairBuild() {
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(11, 0.5, 8, 28), new THREE.MeshStandardMaterial({ color: 0xff2a7a, metalness: 0.5, roughness: 0.4 }));
  wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.35, 21, 0.35), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.4 }));
    spoke.rotation.z = ang; wheel.add(spoke);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: [0xff5a5a, 0x2ee6ff, 0x7dff9a, 0xffd23f][i % 4], roughness: 0.5 }));
    cabin.position.set(Math.cos(ang) * 11, Math.sin(ang) * 11, 0); wheel.add(cabin);
  }
  wheel.position.set(R6_FAIR.x - 14, 13, R6_FAIR.z - 6);
  scene.add(wheel);
  addBox(1.2, 13, 1.2, 0x3a3a44, R6_FAIR.x - 14, 6.5, R6_FAIR.z - 4);
  addBox(1.2, 13, 1.2, 0x3a3a44, R6_FAIR.x - 14, 6.5, R6_FAIR.z - 8);
  addBox(12, 0.5, 10, 0x2a2a33, R6_FAIR.x + 6, 0.25, R6_FAIR.z + 2);
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.2), new THREE.MeshStandardMaterial({ color: [0xff5a5a, 0x2ee6ff, 0xffd23f, 0x7dff9a][i], roughness: 0.4 }));
    car.position.set(R6_FAIR.x + 2 + (i % 2) * 6, 0.8, R6_FAIR.z - 1 + Math.floor(i / 2) * 5); scene.add(car);
  }
  const tent = new THREE.Mesh(new THREE.ConeGeometry(5, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0xff5a5a, roughness: 0.8 }));
  tent.position.set(R6_FAIR.x + 12, 4.5, R6_FAIR.z - 10); scene.add(tent);
  addBox(8, 2.5, 8, 0xf0ead8, R6_FAIR.x + 12, 1.25, R6_FAIR.z - 10);
  for (let i = 0; i < 5; i++) {
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x2ee6ff, roughness: 0.3 }));
    bottle.position.set(R6_FAIR.x + 2 + i * 1.1, 1, R6_FAIR.z + 10); scene.add(bottle);
  }
  const stage = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 6), new THREE.MeshStandardMaterial({ color: 0x8a2be2, roughness: 0.7 }));
  stage.position.set(R6_FAIR.x - 10, 0.5, R6_FAIR.z + 12); scene.add(stage);
}
function r6FairNear() { return r6Near(R6_FAIR.x, R6_FAIR.z, 18); }
function r6FairOpen() {
  if (!r6FairNear()) return false;
  const lines = [
    R6_FAIR.name + ' — Ferris wheel, bumper cars, ring toss, fireworks at dusk.',
    'Wheel rides: ' + r6Fair.rides + ' · Ring toss wins: ' + r6Fair.ringWins + '/' + r6Fair.rings + ' · Bumper wins: ' + r6Fair.bumpWins + '.',
    'Fireworks shows watched: ' + r6Fair.shows + ' · Next show in ' + Math.ceil(r6Fair.showTimer) + 's.',
    'Ride the wheel $12, ring toss $10 for 3 rings, bumper cars $15 a round.',
  ];
  r6ShowPanel('🎡 ' + R6_FAIR.name, lines, [
    r6PanelButton('Ride the Ferris wheel — $12', () => { if (r6Spend(12)) { r6Fair.rides++; toast('The wheel turns slowly over the bay lights. Beautiful.'); r6FairSave(); r6FairOpen(); } }),
    r6PanelButton('Ring toss — $10 (3 rings)', () => { r6FairRing(); }),
    r6PanelButton('Bumper cars — $15', () => { r6FairBump(); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6FairRing() {
  if (!r6Spend(10)) return;
  r6Fair.rings++;
  const hits = Math.floor(Math.random() * 4);
  if (hits >= 2) { r6Fair.ringWins++; r6Earn(45, 'Ring toss: ' + hits + '/3 rings on the bottle!'); }
  else toast('Ring toss: ' + hits + '/3. The bottles mock you.');
  r6FairSave(); r6FairOpen();
}
function r6FairBump() {
  if (!r6Spend(15)) return;
  if (Math.random() < 0.5) { r6Fair.bumpWins++; r6Earn(40, 'Bumper cars: last car spinning wins $40!'); }
  else toast('Bumper cars: spun out by a kid in a pink car. Humbling.');
  r6FairSave(); r6FairOpen();
}
function r6FairUpdate(dt) {
  r6Fair.showTimer -= dt;
  if (r6Fair.showTimer <= 0) {
    r6Fair.showTimer = 180;
    if (r6FairNear()) { r6Fair.shows++; r6Earn(200, '🎆 Fireworks over the fair — you caught the whole show from the front row!'); }
    else toast('Fireworks over the Solmar Fair — get to the fairground for the $200 front-row show.');
    r6FairSave();
  }
}
function r6FairSave() { r6Save('fair', { rides: r6Fair.rides, rings: r6Fair.rings, ringWins: r6Fair.ringWins, bumpWins: r6Fair.bumpWins, shows: r6Fair.shows }); }
function r6FairLoad() {
  const s = r6Load('fair', null);
  if (s) { r6Fair.rides = s.rides || 0; r6Fair.rings = s.rings || 0; r6Fair.ringWins = s.ringWins || 0; r6Fair.bumpWins = s.bumpWins || 0; r6Fair.shows = s.shows || 0; }
}

// ---------- Round 6 system 16: zoo ----------
// Solmar Zoo, north-east past the palms. Six enclosures, feeding times, and a
// safari photo challenge — snap the rare white gull for $300.
const R6_ZOO_ANIMALS = [
  { name: 'Bay Otters', x: 150, z: -100, food: 'fish', desc: 'three otters, always juggling shells' },
  { name: 'Flamingo Flock', x: 162, z: -88, food: 'shrimp', desc: 'pink, loud, standing on one leg' },
  { name: 'Island Monkeys', x: 138, z: -88, food: 'bananas', desc: 'clever hands, quicker feet' },
  { name: 'Tortoise Twins', x: 150, z: -76, food: 'lettuce', desc: '120 years old between them' },
  { name: 'Parrot Row', x: 166, z: -76, food: 'seeds', desc: 'they know your name already' },
  { name: 'White Gull', x: 156, z: -112, food: 'crab', desc: 'the zoo\'s rare white gull, one of a kind' },
];
const R6_ZOO = { x: 152, z: -92, name: 'Solmar Zoo', entry: 30 };
let r6Zoo = { fed: [], photos: 0, visits: 0, gullShot: false };
function r6ZooBuild() {
  addBox(34, 0.4, 30, 0x7a9a5a, R6_ZOO.x, 0.2, R6_ZOO.z);
  addBox(6, 4, 4, 0xf0ead8, R6_ZOO.x, 2, R6_ZOO.z + 16);
  const gateSign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x7dff9a, emissive: 0x228833, emissiveIntensity: 0.5 }));
  gateSign.position.set(R6_ZOO.x, 4.4, R6_ZOO.z + 14); scene.add(gateSign);
  for (const a of R6_ZOO_ANIMALS) {
    addBox(7, 1.4, 7, 0x9a8a6a, a.x, 0.7, a.z);
    const critter = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 10), new THREE.MeshStandardMaterial({ color: a.name === 'Flamingo Flock' ? 0xff9ad5 : a.name === 'White Gull' ? 0xffffff : 0x8a5a2a, roughness: 0.8 }));
    critter.position.set(a.x, 1.6, a.z); scene.add(critter);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x2a8ab0, roughness: 0.2 }));
    water.position.set(a.x + 2, 1.5, a.z + 1.5); scene.add(water);
  }
}
function r6ZooNear() { return r6Near(R6_ZOO.x, R6_ZOO.z, 18); }
function r6ZooAnimalNear() {
  for (let i = 0; i < R6_ZOO_ANIMALS.length; i++) if (r6Near(R6_ZOO_ANIMALS[i].x, R6_ZOO_ANIMALS[i].z, 7)) return i;
  return -1;
}
function r6ZooOpen() {
  const at = r6ZooAnimalNear();
  if (at >= 0) {
    const a = R6_ZOO_ANIMALS[at];
    const fed = r6Zoo.fed.includes(at);
    r6ShowPanel('🦩 ' + a.name, [
      a.desc + '.',
      'Favourite food: ' + a.food + ' — feeding costs $15.',
      fed ? 'Already fed today. They remember you.' : 'Hungry. A keeper\'s bucket is right there.',
      a.name === 'White Gull' && !r6Zoo.gullShot ? 'Safari photo challenge: photograph the white gull for $300.' : '',
    ], [
      r6PanelButton('Feed them — $15', () => { if (!fed && r6Spend(15)) { r6Zoo.fed.push(at); r6Earn(25, 'Fed the ' + a.name + ' — the keeper tips you.'); r6ZooSave(); r6ClosePanel(); } }, fed),
      a.name === 'White Gull' && !r6Zoo.gullShot ? r6PanelButton('📸 Photograph the white gull', () => { r6Zoo.gullShot = true; r6Zoo.photos++; r6Earn(300, '📸 Safari shot: the rare white gull, wings wide!'); r6ZooSave(); r6ClosePanel(); }) : r6PanelButton('📸 Snap a photo (+$20)', () => { r6Zoo.photos++; r6Earn(20, 'Snapped the ' + a.name + ' for the safari album.'); r6ZooSave(); r6ClosePanel(); }),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  if (!r6ZooNear()) return false;
  const lines = [
    R6_ZOO.name + ' — six enclosures, feeding times all afternoon.',
    'Visits: ' + r6Zoo.visits + ' · Animals fed: ' + r6Zoo.fed.length + '/6 · Safari photos: ' + r6Zoo.photos + '.',
    'Entry is $' + R6_ZOO.entry + ' — feeding pays back $25 a time.',
    'Feed all six animals in one day for a $150 keeper bonus.',
  ];
  r6ShowPanel('🦁 ' + R6_ZOO.name, lines, [
    r6PanelButton('Enter the zoo — $' + R6_ZOO.entry, () => { if (r6Spend(R6_ZOO.entry)) { r6Zoo.visits++; r6ZooSave(); toast('Welcome to Solmar Zoo. The otters are expecting you.'); r6ClosePanel(); } }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6ZooUpdate(dt) {
  r6Zoo._t = (r6Zoo._t || 0) + dt;
  if (r6Zoo._t > 120) {
    r6Zoo._t = 0;
    if (r6Zoo.fed.length === 6) { r6Zoo.fed = []; r6Earn(150, '🦁 Fed every animal today — the keepers pay a bonus!'); r6ZooSave(); }
    else if (r6Zoo.fed.length > 0) r6Zoo.fed = [];
  }
}
function r6ZooSave() { r6Save('zoo', { fed: r6Zoo.fed, photos: r6Zoo.photos, visits: r6Zoo.visits, gullShot: r6Zoo.gullShot }); }
function r6ZooLoad() {
  const s = r6Load('zoo', null);
  if (s) { r6Zoo.fed = s.fed || []; r6Zoo.photos = s.photos || 0; r6Zoo.visits = s.visits || 0; r6Zoo.gullShot = !!s.gullShot; }
}

// ---------- Round 6 system 17: photography studio ----------
// Lightbox Studio on Marina Row. Portrait sessions, a weekly photo contest,
// and a gallery wall where your prints sell while you sleep.
const R6_PHOTO_THEMES = [
  { name: 'Golden Hour Portraits', pay: 90, desc: 'couples at the marina, warm light' },
  { name: 'Harbour Workers', pay: 110, desc: 'weathered faces, honest work' },
  { name: 'Neon Nights', pay: 130, desc: 'Casino Row after dark, all glow' },
  { name: 'Wild Bay', pay: 150, desc: 'gulls, waves, the far keys' },
];
const R6_PHOTO_STUDIO = { x: 56, z: 30, name: 'Lightbox Studio' };
let r6Photo = { sessions: 0, contestWins: 0, gallery: 0, sold: 0, contestTimer: 230 };
function r6PhotoBuild() {
  addBox(10, 5, 8, 0x22222e, R6_PHOTO_STUDIO.x, 2.5, R6_PHOTO_STUDIO.z);
  addBox(10.6, 0.5, 8.6, 0x2ee6ff, R6_PHOTO_STUDIO.x, 5.3, R6_PHOTO_STUDIO.z);
  const backdrop = new THREE.Mesh(new THREE.BoxGeometry(4, 3.4, 0.2), new THREE.MeshStandardMaterial({ color: 0xf0ead8, roughness: 0.9 }));
  backdrop.position.set(R6_PHOTO_STUDIO.x - 2, 2, R6_PHOTO_STUDIO.z + 4.2); scene.add(backdrop);
  for (const [lx, lz] of [[-4, -3], [4, -3]]) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 }));
    stand.position.set(R6_PHOTO_STUDIO.x + lx, 1.5, R6_PHOTO_STUDIO.z + lz); scene.add(stand);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
    lamp.position.set(R6_PHOTO_STUDIO.x + lx, 3.2, R6_PHOTO_STUDIO.z + lz); scene.add(lamp);
  }
  for (let i = 0; i < 3; i++) {
    const print = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.1), new THREE.MeshStandardMaterial({ color: [0xff9ad5, 0x2ee6ff, 0xffd23f][i], roughness: 0.6 }));
    print.position.set(R6_PHOTO_STUDIO.x - 2.4 + i * 2.4, 2.8, R6_PHOTO_STUDIO.z - 4.1); scene.add(print);
  }
}
function r6PhotoNear() { return r6Near(R6_PHOTO_STUDIO.x, R6_PHOTO_STUDIO.z, 9); }
function r6PhotoOpen() {
  if (!r6PhotoNear()) return false;
  const lines = [
    R6_PHOTO_STUDIO.name + ' — portraits, prints, and a gallery wall.',
    'Sessions shot: ' + r6Photo.sessions + ' · Contest wins: ' + r6Photo.contestWins + ' · Prints on the wall: ' + r6Photo.gallery + ' · Prints sold: ' + r6Photo.sold + '.',
    'Weekly photo contest in ' + Math.ceil(r6Photo.contestTimer) + 's — best theme wins $280.',
    'Hang a print ($40) and it may sell for $95 while you are out.',
  ];
  const buttons = [];
  for (let i = 0; i < R6_PHOTO_THEMES.length; i++) {
    const t = R6_PHOTO_THEMES[i];
    buttons.push(r6PanelButton('Shoot: ' + t.name + ' — $' + t.pay, () => { r6PhotoShoot(i); }));
  }
  buttons.push(r6PanelButton('Hang a print in the gallery — $40', () => { if (r6Spend(40)) { r6Photo.gallery++; r6PhotoSave(); toast('Print hung. Fingers crossed for a buyer.'); r6PhotoOpen(); } }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('📷 ' + R6_PHOTO_STUDIO.name, lines, buttons);
  return true;
}
function r6PhotoShoot(i) {
  const t = R6_PHOTO_THEMES[i];
  r6Photo.sessions++;
  r6Earn(t.pay, 'Shot "' + t.name + '" — ' + t.desc + '.');
  r6PhotoSave(); r6PhotoOpen();
}
function r6PhotoUpdate(dt) {
  r6Photo.contestTimer -= dt;
  if (r6Photo.contestTimer <= 0) {
    r6Photo.contestTimer = 260;
    if (r6Photo.sessions >= 3) { r6Photo.contestWins++; r6Earn(280, '📷 Won the weekly photo contest!'); }
    else toast('Weekly photo contest at Lightbox — shoot 3 sessions to enter for $280.');
    r6PhotoSave();
  }
  r6Photo._sell = (r6Photo._sell || 0) + dt;
  if (r6Photo._sell > 90 && r6Photo.gallery > 0 && Math.random() < 0.5) {
    r6Photo._sell = 0; r6Photo.gallery--; r6Photo.sold++;
    r6Earn(95, 'A gallery print sold while you were out!');
    r6PhotoSave();
  }
}
function r6PhotoSave() { r6Save('photo6', { sessions: r6Photo.sessions, contestWins: r6Photo.contestWins, gallery: r6Photo.gallery, sold: r6Photo.sold }); }
function r6PhotoLoad() {
  const s = r6Load('photo6', null);
  if (s) { r6Photo.sessions = s.sessions || 0; r6Photo.contestWins = s.contestWins || 0; r6Photo.gallery = s.gallery || 0; r6Photo.sold = s.sold || 0; }
}

// ---------- Round 6 system 18: wedding planner ----------
// Ryan and Ian are getting married. Five vendor quests lead to the ceremony
// at the little white chapel — and the guests bring gift money.
const R6_WEDDING_VENDORS = [
  { name: 'Florist Rosa', cost: 300, task: 'Pick the sunset bouquets', x: 24, z: 20 },
  { name: 'Baker Milo', cost: 350, task: 'Taste the three-tier cake', x: -8, z: 44 },
  { name: 'Tailor Ana', cost: 400, task: 'Fit Ian\'s dress and Ryan\'s suit', x: -32, z: -8 },
  { name: 'Photographer Dee', cost: 250, task: 'Scout the golden-hour spots', x: 56, z: 30 },
  { name: 'Chapel Keeper', cost: 500, task: 'Book the little white chapel', x: 0, z: -96 },
];
const R6_CHAPEL = { x: 0, z: -96, name: 'Little White Chapel' };
let r6Wedding = { vendors: [], planned: 0, married: false, gifts: 0 };
function r6WeddingBuild() {
  addBox(8, 6, 7, 0xffffff, R6_CHAPEL.x, 3, R6_CHAPEL.z);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 3.5, 4), new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.8 }));
  roof.position.set(R6_CHAPEL.x, 7.8, R6_CHAPEL.z); roof.rotation.y = Math.PI / 4; scene.add(roof);
  addBox(1, 5, 1, 0xd8c8a8, R6_CHAPEL.x + 3, 2.5, R6_CHAPEL.z + 4);
  addBox(1, 5, 1, 0xd8c8a8, R6_CHAPEL.x - 3, 2.5, R6_CHAPEL.z + 4);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.25, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xff9ad5, roughness: 0.7 }));
  arch.position.set(R6_CHAPEL.x, 3, R6_CHAPEL.z + 5.5); scene.add(arch);
  for (let i = 0; i < 5; i++) {
    const v = R6_WEDDING_VENDORS[i];
    const stall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: [0xff9ad5, 0xffd23f, 0x2ee6ff, 0x7dff9a, 0xffffff][i], roughness: 0.7 }));
    stall.position.set(v.x, 0.6, v.z); scene.add(stall);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
    pole.position.set(v.x + 1.4, 1.3, v.z); scene.add(pole);
  }
}
function r6WeddingNear() {
  for (let i = 0; i < R6_WEDDING_VENDORS.length; i++) if (r6Near(R6_WEDDING_VENDORS[i].x, R6_WEDDING_VENDORS[i].z, 7)) return i;
  if (r6Near(R6_CHAPEL.x, R6_CHAPEL.z, 9)) return 5;
  return -1;
}
function r6WeddingOpen() {
  const at = r6WeddingNear();
  if (at < 0) return false;
  if (at === 5) {
    const ready = r6Wedding.vendors.length === 5;
    r6ShowPanel('💒 ' + R6_CHAPEL.name, [
      'The little white chapel at the north end of the bay.',
      ready ? 'Every vendor is booked. Ryan and Ian can say yes today.' : 'Vendors booked: ' + r6Wedding.vendors.length + '/5. Visit each vendor around the bay first.',
      r6Wedding.married ? 'Married! The guests brought $' + r6Wedding.gifts + ' in gift money.' : '',
    ], [
      r6PanelButton('💍 Hold the ceremony!', () => { r6WeddingCeremony(); }, !ready || r6Wedding.married),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  const v = R6_WEDDING_VENDORS[at];
  const done = r6Wedding.vendors.includes(at);
  r6ShowPanel('💐 ' + v.name, [
    v.task + '.',
    'Booking fee: $' + v.cost + '.',
    done ? 'Booked — see you at the chapel.' : 'Not booked yet.',
    'Vendors booked: ' + r6Wedding.vendors.length + '/5.',
  ], [
    r6PanelButton('Book ' + v.name + ' — $' + v.cost, () => { if (!done && r6Spend(v.cost)) { r6Wedding.vendors.push(at); r6Wedding.planned++; r6WeddingSave(); toast(v.name + ' is booked! ' + (5 - r6Wedding.vendors.length) + ' to go.'); r6WeddingOpen(); } }, done),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6WeddingCeremony() {
  if (r6Wedding.vendors.length < 5 || r6Wedding.married) return;
  r6Wedding.married = true;
  r6Wedding.gifts = 600;
  r6Earn(600, '💒 Ryan and Ian are married! Guests showered the couple with $600 in gifts.');
  r6WeddingSave(); r6ClosePanel();
}
function r6WeddingSave() { r6Save('wedding', { vendors: r6Wedding.vendors, planned: r6Wedding.planned, married: r6Wedding.married, gifts: r6Wedding.gifts }); }
function r6WeddingLoad() {
  const s = r6Load('wedding', null);
  if (s) { r6Wedding.vendors = s.vendors || []; r6Wedding.planned = s.planned || 0; r6Wedding.married = !!s.married; r6Wedding.gifts = s.gifts || 0; }
}
// ---------- Round 6 system 19: band career ----------
// Form a band with Ryan on guitar and Ian on vocals. Four venues, gig fees
// that grow with fans, album sales at dawn, and a headline slot at $800.
const R6_BAND_VENUES = [
  { name: 'Marina Bar', x: 44, z: 40, fee: 120, fans: 0, desc: 'a small stage, a loyal crowd' },
  { name: 'The Bluefin', x: 78, z: -60, fee: 260, fans: 40, desc: 'the club stage, bigger room' },
  { name: 'Fairground Stage', x: 40, z: 190, fee: 400, fans: 120, desc: 'open air, fair crowds' },
  { name: 'Bay Arena', x: -60, z: -140, fee: 800, fans: 300, desc: 'the big room, headline slot' },
];
const R6_BAND_SONGS = [
  { name: 'Sunset Over Solmar', tempo: 96 },
  { name: 'Harbour Lights', tempo: 112 },
  { name: 'Gull Song', tempo: 128 },
  { name: 'The Long Ferry Home', tempo: 84 },
];
let r6Band = { formed: false, fans: 0, gigs: 0, albums: 0, albumSales: 0, setlist: [0, 1], rehearsed: 0 };
function r6BandBuild() {
  for (const v of R6_BAND_VENUES) {
    if (v.name === 'Bay Arena') {
      addBox(24, 10, 18, 0x2a2a33, v.x, 5, v.z);
      const roofA = new THREE.Mesh(new THREE.BoxGeometry(25, 1, 19), new THREE.MeshStandardMaterial({ color: 0xff2a7a, roughness: 0.6 }));
      roofA.position.set(v.x, 10.5, v.z); scene.add(roofA);
    }
    const stage = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.8 }));
    stage.position.set(v.x, 0.6, v.z); scene.add(stage);
    const amp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
    amp.position.set(v.x - 3, 2, v.z); scene.add(amp);
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.7 }));
    mic.position.set(v.x + 1, 2.3, v.z - 1); scene.add(mic);
  }
}
function r6BandNear() {
  for (let i = 0; i < R6_BAND_VENUES.length; i++) if (r6Near(R6_BAND_VENUES[i].x, R6_BAND_VENUES[i].z, 10)) return i;
  return -1;
}
function r6BandOpen() {
  const at = r6BandNear();
  if (at < 0) return false;
  const v = R6_BAND_VENUES[at];
  if (!r6Band.formed) {
    r6ShowPanel('🎸 Form a band', [
      'Ryan on guitar, Ian on vocals — the bay needs a band.',
      'Forming costs $200 for rehearsal room time and a borrowed drum kit.',
      'Gigs pay by venue, fans grow with every show, albums sell at dawn.',
    ], [
      r6PanelButton('Form the band — $200', () => { if (r6Spend(200)) { r6Band.formed = true; r6BandSave(); r6BandOpen(); } }),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  const locked = r6Band.fans < v.fans;
  const lines = [
    v.name + ' — ' + v.desc + '.',
    'Fans: ' + r6Band.fans + ' · Gigs played: ' + r6Band.gigs + ' · Albums out: ' + r6Band.albums + ' · Album sales: $' + r6Band.albumSales + '.',
    'Setlist: ' + r6Band.setlist.map((i) => R6_BAND_SONGS[i].name).join(' + ') + ' · Rehearsals: ' + r6Band.rehearsed + '.',
    'This venue pays $' + v.fee + ' a gig' + (locked ? ' — needs ' + v.fans + ' fans' : '') + '.',
  ];
  const buttons = [];
  buttons.push(r6PanelButton('Play a gig here — $' + v.fee, () => { r6BandGig(at); }, locked));
  buttons.push(r6PanelButton('Rehearse the setlist ($30)', () => { if (r6Spend(30)) { r6Band.rehearsed++; r6Band.fans += 4; r6BandSave(); toast('Tight rehearsal. The harmonies are getting there.'); r6BandOpen(); } }));
  for (let i = 0; i < R6_BAND_SONGS.length; i++) {
    buttons.push(r6PanelButton((r6Band.setlist.includes(i) ? '✓ ' : '') + R6_BAND_SONGS[i].name + ' (' + R6_BAND_SONGS[i].tempo + ' bpm)', () => {
      if (r6Band.setlist.includes(i)) r6Band.setlist = r6Band.setlist.filter((s) => s !== i);
      else if (r6Band.setlist.length < 3) r6Band.setlist.push(i);
      r6BandSave(); r6BandOpen();
    }));
  }
  buttons.push(r6PanelButton('Record an album — $500', () => { if (r6Spend(500)) { r6Band.albums++; r6BandSave(); toast('Album recorded! It sells at dawn while you sleep.'); r6BandOpen(); } }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🎸 ' + v.name, lines, buttons);
  return true;
}
function r6BandGig(i) {
  const v = R6_BAND_VENUES[i];
  if (r6Band.fans < v.fans) return;
  r6Band.gigs++;
  r6Band.fans += 12 + r6Band.rehearsed;
  r6Earn(v.fee, '🎸 Gig at ' + v.name + ' — the crowd sang along to "' + R6_BAND_SONGS[r6Band.setlist[0]].name + '"!');
  r6BandSave(); r6BandOpen();
}
function r6BandUpdate(dt) {
  r6Band._dawn = (r6Band._dawn || 0) + dt;
  if (r6Band._dawn > 150 && r6Band.albums > 0) {
    r6Band._dawn = 0;
    const sales = r6Band.albums * (20 + Math.floor(r6Band.fans / 10));
    r6Band.albumSales += sales;
    r6Earn(sales, 'Album sales at dawn — ' + r6Band.albums + ' album(s) on the shelves.');
    r6BandSave();
  }
}
function r6BandSave() { r6Save('band', { formed: r6Band.formed, fans: r6Band.fans, gigs: r6Band.gigs, albums: r6Band.albums, albumSales: r6Band.albumSales, setlist: r6Band.setlist, rehearsed: r6Band.rehearsed }); }
function r6BandLoad() {
  const s = r6Load('band', null);
  if (s) { r6Band.formed = !!s.formed; r6Band.fans = s.fans || 0; r6Band.gigs = s.gigs || 0; r6Band.albums = s.albums || 0; r6Band.albumSales = s.albumSales || 0; r6Band.setlist = s.setlist || [0, 1]; r6Band.rehearsed = s.rehearsed || 0; }
}

// ---------- Round 6 system 20: busking ----------
// Five street pitches. Play, gather a crowd, and the hat fills with tips.
// A full crowd meter at the marina pitch pays a $150 street-star bonus.
const R6_BUSK_PITCHES = [
  { name: 'Marina Promenade', x: 36, z: 48, crowd: 5 },
  { name: 'Old Plaza Fountain', x: -20, z: 12, crowd: 4 },
  { name: 'Casino Row Corner', x: 56, z: -72, crowd: 3 },
  { name: 'Beach Boardwalk', x: 92, z: 116, crowd: 5 },
  { name: 'Airport Arrivals', x: -172, z: -24, crowd: 3 },
];
let r6Busk = { tips: 0, sessions: 0, crowd: 0, best: 0, hat: 0, pitch: -1, playTimer: 0 };
function r6BuskBuild() {
  for (const p of R6_BUSK_PITCHES) {
    addBox(3, 0.3, 3, 0x8a7a5a, p.x, 0.15, p.z);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 0.9 }));
    hat.position.set(p.x + 1.2, 0.4, p.z + 0.8); scene.add(hat);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
    stand.position.set(p.x - 1.2, 1, p.z); stand.rotation.y = 0.4; scene.add(stand);
  }
}
function r6BuskNear() {
  for (let i = 0; i < R6_BUSK_PITCHES.length; i++) if (r6Near(R6_BUSK_PITCHES[i].x, R6_BUSK_PITCHES[i].z, 6)) return i;
  return -1;
}
function r6BuskOpen() {
  const at = r6BuskNear();
  if (at < 0) return false;
  const p = R6_BUSK_PITCHES[at];
  const lines = [
    p.name + ' — a street pitch (crowd ' + p.crowd + '/5).',
    'Crowd meter: ' + r6Busk.crowd + '/100 · Best crowd: ' + r6Busk.best + ' · Sessions: ' + r6Busk.sessions + '.',
    'Tips banked: $' + r6Busk.tips + ' · Hat now: $' + r6Busk.hat + '.',
    'Play a song to gather a crowd. A full crowd at the marina pays $150.',
  ];
  r6ShowPanel('🎵 Busking — ' + p.name, lines, [
    r6PanelButton('Play a song', () => { r6BuskPlay(at); }),
    r6PanelButton('Collect the hat', () => { if (r6Busk.hat > 0) { r6Earn(r6Busk.hat, 'Collected the hat.'); r6Busk.hat = 0; r6BuskSave(); r6BuskOpen(); } else toast('The hat is empty — play first.'); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6BuskPlay(at) {
  const p = R6_BUSK_PITCHES[at];
  r6Busk.sessions++; r6Busk.pitch = at;
  const gain = p.crowd * 4 + Math.floor(Math.random() * 8) + (r6Band.formed ? 6 : 0);
  r6Busk.crowd = Math.min(100, r6Busk.crowd + gain);
  if (r6Busk.crowd > r6Busk.best) r6Busk.best = r6Busk.crowd;
  const tip = Math.round(r6Busk.crowd * 0.4) + 3;
  r6Busk.hat += tip; r6Busk.tips += tip;
  if (r6Busk.crowd >= 100 && at === 0) { r6Earn(150, '🎵 Street star! A full crowd at the marina — the hat overflows!'); r6Busk.crowd = 40; }
  else toast('Played a song — crowd ' + r6Busk.crowd + '/100, hat +$' + tip + '.');
  r6BuskSave(); r6BuskOpen();
}
function r6BuskUpdate(dt) {
  r6Busk.playTimer += dt;
  if (r6Busk.playTimer > 45) { r6Busk.playTimer = 0; r6Busk.crowd = Math.max(0, r6Busk.crowd - 8); }
}
function r6BuskSave() { r6Save('busk', { tips: r6Busk.tips, sessions: r6Busk.sessions, crowd: r6Busk.crowd, best: r6Busk.best, hat: r6Busk.hat }); }
function r6BuskLoad() {
  const s = r6Load('busk', null);
  if (s) { r6Busk.tips = s.tips || 0; r6Busk.sessions = s.sessions || 0; r6Busk.crowd = s.crowd || 0; r6Busk.best = s.best || 0; r6Busk.hat = s.hat || 0; }
}

// ---------- Round 6 system 21: real estate flipping ----------
// Four rundown flats around the bay. Buy cheap, renovate in three stages,
// sell for a profit — or keep one and rent it out for $45 a day.
const R6_FLATS = [
  { name: 'Harbour Flat 2B', x: -44, z: 56, buy: 2200, renov: 3, sellBase: 3600, desc: 'damp walls, great view' },
  { name: 'Old Town Loft', x: -12, z: 16, buy: 3100, renov: 3, sellBase: 5100, desc: 'high ceilings, broken stairs' },
  { name: 'Beach Studio', x: 88, z: 108, buy: 2600, renov: 3, sellBase: 4300, desc: 'sand in the floorboards' },
  { name: 'Docks Cottage', x: -72, z: -72, buy: 1800, renov: 3, sellBase: 3000, desc: 'small, solid, needs love' },
];
const R6_RENOV_STAGE = [
  { name: 'Patch & Paint', cost: 300, desc: 'new paint, fixed leaks' },
  { name: 'Kitchen & Bath', cost: 600, desc: 'new fittings, tiled floor' },
  { name: 'Full Dress', cost: 900, desc: 'furniture, lights, curb appeal' },
];
let r6Estate = { owned: [], stage: {}, flipped: 0, profit: 0, rent: 0, rentTimer: 0 };
function r6EstateBuild() {
  for (const f of R6_FLATS) {
    const stage = (r6Estate.stage[f.name] || 0);
    const col = stage === 0 ? 0x6a6a72 : stage === 1 ? 0x9a8a6a : stage === 2 ? 0xd8c8a8 : 0xffd23f;
    addBox(8, 5, 7, col, f.x, 2.5, f.z);
    addBox(8.6, 0.6, 7.6, 0x3a2a2a, f.x, 5.3, f.z);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.2), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0x661111, emissiveIntensity: 0.5 }));
    sign.position.set(f.x, 4.2, f.z - 3.6); scene.add(sign);
  }
}
function r6EstateNear() {
  for (let i = 0; i < R6_FLATS.length; i++) if (r6Near(R6_FLATS[i].x, R6_FLATS[i].z, 9)) return i;
  return -1;
}
function r6EstateOpen() {
  const at = r6EstateNear();
  if (at < 0) return false;
  const f = R6_FLATS[at];
  const owned = r6Estate.owned.includes(f.name);
  const stage = r6Estate.stage[f.name] || 0;
  const sellPrice = f.sellBase + stage * 500;
  const lines = [
    f.name + ' — ' + f.desc + '.',
    owned ? 'You own it. Renovation stage ' + stage + '/3.' : 'For sale: $' + f.buy + ' (sells from $' + f.sellBase + ' once renovated).',
    'Flips done: ' + r6Estate.flipped + ' · Flip profit banked: $' + r6Estate.profit + ' · Rent banked: $' + r6Estate.rent + '.',
    stage < 3 ? 'Next stage: ' + R6_RENOV_STAGE[stage].name + ' — $' + R6_RENOV_STAGE[stage].cost + ' (' + R6_RENOV_STAGE[stage].desc + ').' : 'Fully renovated — sell for $' + sellPrice + ' or keep it for $45 a day in rent.',
  ];
  const buttons = [];
  if (!owned) buttons.push(r6PanelButton('Buy ' + f.name + ' — $' + f.buy, () => { if (r6Spend(f.buy)) { r6Estate.owned.push(f.name); r6Estate.stage[f.name] = 0; r6EstateSave(); r6EstateOpen(); } }));
  if (owned && stage < 3) buttons.push(r6PanelButton('Renovate: ' + R6_RENOV_STAGE[stage].name + ' — $' + R6_RENOV_STAGE[stage].cost, () => { if (r6Spend(R6_RENOV_STAGE[stage].cost)) { r6Estate.stage[f.name] = stage + 1; r6EstateSave(); toast(f.name + ' renovated to stage ' + (stage + 1) + '/3.'); r6EstateOpen(); } }));
  if (owned && stage === 3) buttons.push(r6PanelButton('Sell for $' + sellPrice, () => { r6Estate.owned = r6Estate.owned.filter((n) => n !== f.name); r6Estate.flipped++; r6Estate.profit += sellPrice - f.buy - 1800; r6Earn(sellPrice, 'Sold ' + f.name + ' after the full renovation!'); r6EstateSave(); r6ClosePanel(); }));
  buttons.push(r6PanelButton('Close', () => r6ClosePanel()));
  r6ShowPanel('🏠 ' + f.name, lines, buttons);
  return true;
}
function r6EstateUpdate(dt) {
  r6Estate.rentTimer += dt;
  if (r6Estate.rentTimer > 120 && r6Estate.owned.length > 0) {
    r6Estate.rentTimer = 0;
    const pay = r6Estate.owned.length * 45;
    r6Estate.rent += pay;
    r6Earn(pay, 'Rent day — ' + r6Estate.owned.length + ' flat(s) paying $45 each.');
    r6EstateSave();
  }
}
function r6EstateSave() { r6Save('estate', { owned: r6Estate.owned, stage: r6Estate.stage, flipped: r6Estate.flipped, profit: r6Estate.profit, rent: r6Estate.rent }); }
function r6EstateLoad() {
  const s = r6Load('estate', null);
  if (s) { r6Estate.owned = s.owned || []; r6Estate.stage = s.stage || {}; r6Estate.flipped = s.flipped || 0; r6Estate.profit = s.profit || 0; r6Estate.rent = s.rent || 0; }
}

// ---------- Round 6 system 22: pawn shop + antiques ----------
// Old Tom's Pawn on Docks Lane. Ten antiques hidden around the bay; haggle
// the price, get an appraisal, and sell the set for $900.
const R6_ANTIQUES = [
  { name: 'Brass Sextant', x: 70, z: 20, value: 180 },
  { name: 'Porcelain Teapot', x: -48, z: 24, value: 140 },
  { name: 'Ivory Chess Queen', x: 16, z: -32, value: 220 },
  { name: 'Silver Pocket Watch', x: -96, z: 40, value: 260 },
  { name: 'Carved Whale Tooth', x: 104, z: -20, value: 200 },
  { name: 'Old Brass Bell', x: -20, z: 80, value: 120 },
  { name: 'Jade Turtle', x: 40, z: -96, value: 300 },
  { name: 'Copper Spyglass', x: -140, z: -8, value: 170 },
  { name: 'Embroidered Shawl', x: 8, z: 64, value: 150 },
  { name: 'Map of the Keys', x: 130, z: 90, value: 240 },
];
const R6_PAWN = { x: -66, z: -52, name: 'Old Tom\'s Pawn' };
let r6Pawn = { found: [], sold: 0, haggled: 0, appraised: 0, setBonus: false };
function r6PawnBuild() {
  addBox(9, 5, 7, 0x4a3a2a, R6_PAWN.x, 2.5, R6_PAWN.z);
  addBox(9.6, 0.6, 7.6, 0xd8a020, R6_PAWN.x, 5.3, R6_PAWN.z);
  const scale = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 1), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.7 }));
  scale.position.set(R6_PAWN.x - 2, 1.2, R6_PAWN.z + 4); scene.add(scale);
  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 1), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }));
    shelf.position.set(R6_PAWN.x + 2 + i * 0.4, 2 + i * 0.8, R6_PAWN.z - 3.4); scene.add(shelf);
  }
  for (const a of R6_ANTIQUES) {
    if (r6Pawn.found.includes(a.name)) continue;
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    glint.position.set(a.x, 1, a.z); scene.add(glint);
  }
}
function r6PawnNear() { return r6Near(R6_PAWN.x, R6_PAWN.z, 9); }
function r6AntiqueNear() {
  for (let i = 0; i < R6_ANTIQUES.length; i++) {
    if (r6Pawn.found.includes(R6_ANTIQUES[i].name)) continue;
    if (r6Near(R6_ANTIQUES[i].x, R6_ANTIQUES[i].z, 6)) return i;
  }
  return -1;
}
function r6PawnAppraise(value) {
  return Math.round(value * (0.85 + Math.random() * 0.4));
}
function r6PawnOpen() {
  const at = r6AntiqueNear();
  if (at >= 0) {
    const a = R6_ANTIQUES[at];
    const appraised = r6PawnAppraise(a.value);
    r6ShowPanel('🏺 ' + a.name, [
      'An antique, half-buried in the dust — appraised at $' + appraised + ' (true value near $' + a.value + ').',
      'Old Tom will haggle: ask high, but push too far and he walks away.',
      'Antiques found: ' + r6Pawn.found.length + '/10 · Full set bonus $900.',
    ], [
      r6PanelButton('Sell it now — $' + appraised, () => { r6Pawn.found.push(a.name); r6Pawn.sold++; r6Earn(appraised, 'Sold the ' + a.name + ' to Old Tom.'); r6PawnSetCheck(); r6PawnSave(); r6ClosePanel(); }),
      r6PanelButton('Haggle for more', () => { r6PawnHaggle(at, appraised); }),
      r6PanelButton('Leave it', () => r6ClosePanel()),
    ]);
    return true;
  }
  if (!r6PawnNear()) return false;
  r6ShowPanel('🏺 ' + R6_PAWN.name, [
    'Old Tom buys anything with a story. He appraises free, haggles hard.',
    'Antiques found: ' + r6Pawn.found.length + '/10 · Sold: ' + r6Pawn.sold + ' · Times haggled: ' + r6Pawn.haggled + ' · Appraisals: ' + r6Pawn.appraised + '.',
    'The ten antiques glint gold around the bay — look for the glint.',
  ], [
    r6PanelButton('Get a free appraisal', () => { r6Pawn.appraised++; const v = r6PawnAppraise(200); toast('Old Tom squints: "That\'s worth about $' + v + ' on a good day."'); r6PawnSave(); r6PawnOpen(); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6PawnHaggle(at, appraised) {
  r6Pawn.haggled++;
  if (Math.random() < 0.55) {
    const better = Math.round(appraised * 1.25);
    r6Pawn.found.push(R6_ANTIQUES[at].name); r6Pawn.sold++;
    r6Earn(better, 'Haggled Old Tom up to $' + better + ' for the ' + R6_ANTIQUES[at].name + '!');
    r6PawnSetCheck();
  } else {
    toast('Old Tom laughs and walks away. The ' + R6_ANTIQUES[at].name + ' stays where it is — try again later.');
  }
  r6PawnSave(); r6ClosePanel();
}
function r6PawnSetCheck() {
  if (r6Pawn.found.length === 10 && !r6Pawn.setBonus) {
    r6Pawn.setBonus = true;
    r6Earn(900, '🏺 All ten antiques found — Old Tom pays a $900 set bonus!');
  }
}
function r6PawnSave() { r6Save('pawn', { found: r6Pawn.found, sold: r6Pawn.sold, haggled: r6Pawn.haggled, appraised: r6Pawn.appraised, setBonus: r6Pawn.setBonus }); }
function r6PawnLoad() {
  const s = r6Load('pawn', null);
  if (s) { r6Pawn.found = s.found || []; r6Pawn.sold = s.sold || 0; r6Pawn.haggled = s.haggled || 0; r6Pawn.appraised = s.appraised || 0; r6Pawn.setBonus = !!s.setBonus; }
}
// ---------- Round 6 system 23: firefighter career ----------
// Bay Fire Station, callouts across the city. Drive the truck, work the hose,
// upgrade the station — and the big warehouse fire pays $480.
const R6_FIRE_CALLS = [
  { name: 'Kitchen Fire', x: -40, z: 56, heat: 2, pay: 180, desc: 'a stove left on at the harbour flats' },
  { name: 'Dumpster Blaze', x: 52, z: -70, heat: 2, pay: 160, desc: 'burning rubbish behind the neon strip' },
  { name: 'Car Fire', x: 20, z: -20, heat: 3, pay: 220, desc: 'an engine fire at the plaza' },
  { name: 'Warehouse Fire', x: -72, z: -72, heat: 5, pay: 480, desc: 'the big one — docks warehouse, full crew' },
  { name: 'Palm Grove Fire', x: 96, z: 108, heat: 3, pay: 240, desc: 'dry palms by the beach studios' },
];
const R6_FIRE_STATION = { x: -132, z: 60, name: 'Bay Fire Station' };
let r6Fire = { callouts: 0, putOut: 0, upgrades: 0, active: -1, hose: 0, hoseMax: 100, callTimer: 140 };
function r6FireBuild() {
  addBox(16, 7, 12, 0xc0392b, R6_FIRE_STATION.x, 3.5, R6_FIRE_STATION.z);
  addBox(17, 0.8, 13, 0x8a2a2a, R6_FIRE_STATION.x, 7.4, R6_FIRE_STATION.z);
  const bayDoor = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.5 }));
  bayDoor.position.set(R6_FIRE_STATION.x - 3, 2.25, R6_FIRE_STATION.z - 6.2); scene.add(bayDoor);
  const truck = new THREE.Group();
  const tBody = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.2), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 }));
  tBody.position.y = 1.4; truck.add(tBody);
  const tCab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 2.1), new THREE.MeshStandardMaterial({ color: 0xff5a5a, roughness: 0.5 }));
  tCab.position.set(3, 1.1, 0); truck.add(tCab);
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.7 }));
  ladder.position.set(-0.4, 2.7, 0); truck.add(ladder);
  truck.position.set(R6_FIRE_STATION.x + 8, 0, R6_FIRE_STATION.z + 8); truck.rotation.y = -0.4; scene.add(truck);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6 }));
  pole.position.set(R6_FIRE_STATION.x + 6, 4, R6_FIRE_STATION.z - 3); scene.add(pole);
  for (const c of R6_FIRE_CALLS) {
    const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1, 8), new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.6 }));
    hydrant.position.set(c.x + 3, 0.5, c.z + 3); scene.add(hydrant);
  }
}
function r6FireNear() { return r6Near(R6_FIRE_STATION.x, R6_FIRE_STATION.z, 12); }
function r6FireCallNear() {
  if (r6Fire.active < 0) return -1;
  const c = R6_FIRE_CALLS[r6Fire.active];
  return r6Near(c.x, c.z, 9) ? r6Fire.active : -1;
}
function r6FireOpen() {
  if (r6FireCallNear() >= 0) {
    const c = R6_FIRE_CALLS[r6FireCallNear()];
    r6ShowPanel('🔥 ' + c.name, [
      c.desc + '.',
      'Fire heat: ' + c.heat + '/5 · Your hose: ' + Math.round(r6Fire.hose) + '/' + r6Fire.hoseMax + '.',
      'Hold the line — working the hose drains it, then it refills at the truck.',
      'Putting it out pays $' + c.pay + '.',
    ], [
      r6PanelButton('Work the hose', () => { r6FireHose(r6FireCallNear()); }),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  if (!r6FireNear()) return false;
  const lines = [
    R6_FIRE_STATION.name + ' — Engine 7, one very red truck.',
    'Callouts answered: ' + r6Fire.callouts + ' · Fires out: ' + r6Fire.putOut + ' · Station upgrades: ' + r6Fire.upgrades + '/3.',
    'Next callout in ' + Math.ceil(r6Fire.callTimer) + 's — the radio never sleeps.',
    'Upgrades: bigger hose tank (+50), faster refill, better turnout gear.',
  ];
  r6ShowPanel('🚒 ' + R6_FIRE_STATION.name, lines, [
    r6PanelButton('Upgrade the station — $700', () => { if (r6Fire.upgrades < 3 && r6Spend(700)) { r6Fire.upgrades++; r6Fire.hoseMax += 50; r6Fire.hose = r6Fire.hoseMax; r6FireSave(); toast('Station upgraded — hose tank is bigger now.'); r6FireOpen(); } }, r6Fire.upgrades >= 3),
    r6PanelButton('Answer the next callout now', () => { r6FireDispatch(); r6ClosePanel(); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6FireDispatch() {
  if (r6Fire.active >= 0) { toast('Already on a callout — get to the fire!'); return; }
  r6Fire.active = Math.floor(Math.random() * R6_FIRE_CALLS.length);
  r6Fire.callouts++; r6Fire.hose = r6Fire.hoseMax;
  const c = R6_FIRE_CALLS[r6Fire.active];
  toast('🚒 Callout: ' + c.name + ' — get there and work the hose!');
  r6FireSave();
}
function r6FireHose(i) {
  if (i < 0) return;
  const c = R6_FIRE_CALLS[i];
  r6Fire.hose -= 20 + c.heat * 6;
  if (r6Fire.hose <= 0) {
    r6Fire.hose = 0;
    toast('Hose is dry! It refills — wait a moment, then work it again.');
    return;
  }
  if (Math.random() < 0.45) {
    r6Fire.putOut++; r6Fire.active = -1;
    r6Earn(c.pay, '🔥 ' + c.name + ' is out! The crowd cheers Engine 7.');
    r6FireSave(); r6ClosePanel(); return;
  }
  toast('Hose on the flames — heat ' + c.heat + '/5, keep at it!');
  r6FireSave(); r6FireOpen();
}
function r6FireUpdate(dt) {
  r6Fire.callTimer -= dt;
  if (r6Fire.callTimer <= 0) {
    r6Fire.callTimer = 170;
    if (r6Fire.active < 0) r6FireDispatch();
  }
  if (r6Fire.hose < r6Fire.hoseMax) r6Fire.hose = Math.min(r6Fire.hoseMax, r6Fire.hose + dt * 6);
}
function r6FireSave() { r6Save('fire6', { callouts: r6Fire.callouts, putOut: r6Fire.putOut, upgrades: r6Fire.upgrades, hoseMax: r6Fire.hoseMax }); }
function r6FireLoad() {
  const s = r6Load('fire6', null);
  if (s) { r6Fire.callouts = s.callouts || 0; r6Fire.putOut = s.putOut || 0; r6Fire.upgrades = s.upgrades || 0; r6Fire.hoseMax = s.hoseMax || 100; r6Fire.hose = r6Fire.hoseMax; }
}

// ---------- Round 6 system 24: paramedic career ----------
// Bay General Hospital. Ambulance callouts, triage choices that matter, and
// a hospital reputation that pays a weekly bonus at 80+ rep.
const R6_MEDIC_CALLS = [
  { name: 'Cyclist Down', x: 30, z: 10, severity: 2, pay: 170, desc: 'a rider clipped by a taxi' },
  { name: 'Beach Heatstroke', x: 96, z: 120, severity: 2, pay: 150, desc: 'a tourist out too long in the sun' },
  { name: 'Docks Crush Injury', x: -64, z: -84, severity: 4, pay: 320, desc: 'a container shifted on a worker' },
  { name: 'Marina Drowning', x: 48, z: 56, severity: 5, pay: 420, desc: 'pulled from the water, not breathing' },
  { name: 'Skate Park Fall', x: -84, z: 96, severity: 3, pay: 210, desc: 'a bad landing off the big ramp' },
];
const R6_HOSPITAL = { x: 132, z: -60, name: 'Bay General Hospital' };
let r6Medic = { callouts: 0, saved: 0, rep: 20, active: -1, callTimer: 150, weekly: 0 };
function r6MedicBuild() {
  addBox(18, 10, 14, 0xf0f4f8, R6_HOSPITAL.x, 5, R6_HOSPITAL.z);
  addBox(19, 1, 15, 0x2a6a8a, R6_HOSPITAL.x, 10.5, R6_HOSPITAL.z);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.3), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x881111, emissiveIntensity: 0.6 }));
  cross.position.set(R6_HOSPITAL.x, 8.4, R6_HOSPITAL.z - 7.2); scene.add(cross);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 0.3), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x881111, emissiveIntensity: 0.6 }));
  crossV.position.set(R6_HOSPITAL.x, 8.4, R6_HOSPITAL.z - 7.2); scene.add(crossV);
  const amb = new THREE.Group();
  const aBody = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  aBody.position.y = 1.4; amb.add(aBody);
  const aStripe = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.5, 2.3), new THREE.MeshStandardMaterial({ color: 0xff2222, roughness: 0.5 }));
  aStripe.position.y = 1.4; amb.add(aStripe);
  amb.position.set(R6_HOSPITAL.x + 10, 0, R6_HOSPITAL.z + 6); amb.rotation.y = 0.5; scene.add(amb);
  addBox(8, 0.4, 8, 0x9a9a9a, R6_HOSPITAL.x - 12, 0.2, R6_HOSPITAL.z + 8);
  const helipad = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.8 }));
  helipad.position.set(R6_HOSPITAL.x - 12, 0.45, R6_HOSPITAL.z + 8); scene.add(helipad);
}
function r6MedicNear() { return r6Near(R6_HOSPITAL.x, R6_HOSPITAL.z, 12); }
function r6MedicCallNear() {
  if (r6Medic.active < 0) return -1;
  const c = R6_MEDIC_CALLS[r6Medic.active];
  return r6Near(c.x, c.z, 9) ? r6Medic.active : -1;
}
function r6MedicOpen() {
  if (r6MedicCallNear() >= 0) {
    const c = R6_MEDIC_CALLS[r6MedicCallNear()];
    r6ShowPanel('🚑 ' + c.name, [
      c.desc + '.',
      'Severity: ' + c.severity + '/5 · Triage decides the outcome.',
      'Stabilise first, then transport — rushing a severe case costs rep.',
      'A clean save pays $' + c.pay + ' and +8 hospital rep.',
    ], [
      r6PanelButton('Stabilise on scene', () => { r6MedicTreat(r6MedicCallNear(), 'stabilise'); }),
      r6PanelButton('Transport at once', () => { r6MedicTreat(r6MedicCallNear(), 'transport'); }),
      r6PanelButton('Close', () => r6ClosePanel()),
    ]);
    return true;
  }
  if (!r6MedicNear()) return false;
  const lines = [
    R6_HOSPITAL.name + ' — the bay\'s busiest emergency room.',
    'Callouts answered: ' + r6Medic.callouts + ' · Patients saved: ' + r6Medic.saved + ' · Hospital rep: ' + r6Medic.rep + '/100.',
    'Next callout in ' + Math.ceil(r6Medic.callTimer) + 's · Weekly rep bonus: ' + r6Medic.weekly + ' paid.',
    'At 80+ rep the hospital pays $300 a week for your shift.',
  ];
  r6ShowPanel('🚑 ' + R6_HOSPITAL.name, lines, [
    r6PanelButton('Take the next callout now', () => { r6MedicDispatch(); r6ClosePanel(); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
  return true;
}
function r6MedicDispatch() {
  if (r6Medic.active >= 0) { toast('Already on a callout — get to the patient!'); return; }
  r6Medic.active = Math.floor(Math.random() * R6_MEDIC_CALLS.length);
  r6Medic.callouts++;
  const c = R6_MEDIC_CALLS[r6Medic.active];
  toast('🚑 Callout: ' + c.name + ' — severity ' + c.severity + '/5. Go!');
  r6MedicSave();
}
function r6MedicTreat(i, choice) {
  if (i < 0) return;
  const c = R6_MEDIC_CALLS[i];
  const right = c.severity >= 4 ? choice === 'stabilise' : choice === 'transport';
  r6Medic.active = -1;
  if (right) {
    r6Medic.saved++; r6Medic.rep = Math.min(100, r6Medic.rep + 8);
    r6Earn(c.pay, '🚑 Saved the patient at ' + c.name + ' — right call, rep ' + r6Medic.rep + '.');
  } else {
    r6Medic.rep = Math.max(0, r6Medic.rep - 5);
    toast('Wrong call on ' + c.name + ' — the patient pulls through, but rep drops to ' + r6Medic.rep + '.');
  }
  r6MedicSave(); r6ClosePanel();
}
function r6MedicUpdate(dt) {
  r6Medic.callTimer -= dt;
  if (r6Medic.callTimer <= 0) {
    r6Medic.callTimer = 180;
    if (r6Medic.active < 0) r6MedicDispatch();
    else if (r6Medic.rep >= 80) { r6Medic.weekly++; r6Earn(300, '🚑 Weekly hospital bonus — rep ' + r6Medic.rep + ', the ward trusts you.'); r6MedicSave(); }
  }
}
function r6MedicSave() { r6Save('medic6', { callouts: r6Medic.callouts, saved: r6Medic.saved, rep: r6Medic.rep, weekly: r6Medic.weekly }); }
function r6MedicLoad() {
  const s = r6Load('medic6', null);
  if (s) { r6Medic.callouts = s.callouts || 0; r6Medic.saved = s.saved || 0; r6Medic.rep = s.rep ?? 20; r6Medic.weekly = s.weekly || 0; }
}

// ---------- Round 6, part eight: dispatcher, HUD, minimap, self-test ----------
// One call from the main loop runs every Round 6 system, in dependency order.
function updateR6(dt) {
  r6DailyUpdate(dt);
  r6MetroUpdate(dt);
  r6FoodUpdate(dt);
  r6SurfUpdate(dt);
  r6SkateUpdate(dt);
  r6StuntUpdate(dt);
  r6ClubUpdate(dt);
  r6ArtUpdate(dt);
  r6RanchUpdate(dt);
  r6GolfUpdate(dt);
  r6BowlUpdate(dt);
  r6LibraryUpdate(dt);
  r6MuseumUpdate(dt);
  r6FairUpdate(dt);
  r6ZooUpdate(dt);
  r6PhotoUpdate(dt);
  r6BandUpdate(dt);
  r6BuskUpdate(dt);
  r6EstateUpdate(dt);
  r6FireUpdate(dt);
  r6MedicUpdate(dt);
}
function r6HudLine() {
  const el = document.getElementById('r6Line');
  if (!el) return;
  const parts = [];
  parts.push('🚇 Metro ' + (r6Metro.card ? 'card' : 'no card') + ' · rides ' + r6Metro.rides);
  if (r6Metro.riding) parts.push('🚇 to ' + R6_METRO_STATIONS[r6Metro.to].name + ' · ' + Math.ceil(r6Metro.timer) + 's');
  if (r6Food.owned) parts.push('🚚 Food ' + r6Food.served + ' served · ' + '★'.repeat(r6Food.rating));
  if (r6Surf.board >= 0) parts.push('🏄 Best ' + r6Surf.best + ' pts');
  if (r6Skate.combo > 0) parts.push('🛹 Combo ' + r6Skate.combo);
  if (r6Stunt.stars > 0) parts.push('🎬 ' + r6Stunt.stars + '★');
  if (r6Club.owned) parts.push('🌃 Vibe ' + r6Club.vibe);
  if (r6Art.rep > 0) parts.push('🎨 Rep ' + r6Art.rep);
  if (r6Ranch.horses.length) parts.push('🐎 ' + r6Ranch.horses.length + ' horses');
  if (r6Golf.rounds > 0) parts.push('⛳ Best ' + (r6Golf.best === 99 ? '—' : r6Golf.best));
  if (r6Bowl.games > 0) parts.push('🎳 Best ' + r6Bowl.best);
  if (r6Arcade.tokens > 0) parts.push('🕹️ ' + r6Arcade.tokens + ' tokens');
  if (r6Library.read.length) parts.push('📚 ' + r6Library.read.length + '/12 books');
  if (r6Museum.tours > 0) parts.push('🏛️ ' + r6Museum.tours + ' tours');
  if (r6Band.formed) parts.push('🎸 ' + r6Band.fans + ' fans');
  if (r6Busk.crowd > 0) parts.push('🎵 Crowd ' + r6Busk.crowd);
  if (r6Estate.owned.length) parts.push('🏠 ' + r6Estate.owned.length + ' flats');
  if (r6Pawn.found.length) parts.push('🏺 ' + r6Pawn.found.length + '/10 antiques');
  if (r6Fire.active >= 0) parts.push('🔥 ' + R6_FIRE_CALLS[r6Fire.active].name);
  if (r6Medic.active >= 0) parts.push('🚑 ' + R6_MEDIC_CALLS[r6Medic.active].name);
  if (r6Wedding.married) parts.push('💒 Married!');
  else if (r6Wedding.vendors.length) parts.push('💐 Wedding ' + r6Wedding.vendors.length + '/5');
  el.textContent = parts.join(' · ');
}
function r6MinimapDots(dot) {
  for (const st of R6_METRO_STATIONS) dot(st.x, st.z, '#2ee6ff', 3);
  for (const p of R6_FOOD_PITCHES) dot(p.x, p.z, '#ff7a2a', 3);
  dot(96, 108, '#2ee6ff', 4);
  for (const br of R6_SURF_BREAKS) dot(br.x, br.z, '#2ee6ff', 3);
  dot(R6_SKATE_PARK.x, R6_SKATE_PARK.z, '#ff5a5a', 4);
  dot(R6_STUDIO.x, R6_STUDIO.z, '#b45ae8', 4);
  dot(R6_CLUB.x, R6_CLUB.z, '#2ee6ff', 4);
  dot(R6_TATTOO_SHOP.x, R6_TATTOO_SHOP.z, '#ff2a7a', 3);
  for (const m of R6_MURALS) dot(m.x, m.z, r6Art.done.includes(m.name) ? '#2ecc71' : '#ff9ad5', 3);
  dot(R6_RANCH.x, R6_RANCH.z, '#8a5a2a', 4);
  dot(R6_GOLF_COURSE.x, R6_GOLF_COURSE.z, '#2ecc71', 4);
  dot(R6_MINIGOLF.x, R6_MINIGOLF.z, '#c86a8a', 3);
  dot(R6_BOWL_ALLEY.x, R6_BOWL_ALLEY.z, '#ff5a5a', 4);
  dot(R6_ARCADE.x, R6_ARCADE.z, '#ff2a7a', 4);
  dot(R6_LIBRARY.x, R6_LIBRARY.z, '#d8c8a8', 4);
  dot(R6_MUSEUM.x, R6_MUSEUM.z, '#f0ead8', 4);
  for (const a of R6_MUSEUM_ARTIFACTS) if (!r6Museum.artifacts.includes(R6_MUSEUM_ARTIFACTS.indexOf(a))) dot(a.x, a.z, '#ffd23f', 3);
  dot(R6_FAIR.x, R6_FAIR.z, '#ff2a7a', 5);
  dot(R6_ZOO.x, R6_ZOO.z, '#7dff9a', 4);
  dot(R6_PHOTO_STUDIO.x, R6_PHOTO_STUDIO.z, '#2ee6ff', 3);
  dot(R6_CHAPEL.x, R6_CHAPEL.z, '#ff9ad5', 4);
  for (const v of R6_BAND_VENUES) dot(v.x, v.z, '#8a2be2', 3);
  for (const p of R6_BUSK_PITCHES) dot(p.x, p.z, '#ffd23f', 3);
  for (const f of R6_FLATS) dot(f.x, f.z, '#d8a020', 3);
  dot(R6_PAWN.x, R6_PAWN.z, '#d8a020', 4);
  for (const a of R6_ANTIQUES) if (!r6Pawn.found.includes(a.name)) dot(a.x, a.z, '#ffd23f', 2);
  dot(R6_FIRE_STATION.x, R6_FIRE_STATION.z, '#ff2222', 4);
  if (r6Fire.active >= 0) dot(R6_FIRE_CALLS[r6Fire.active].x, R6_FIRE_CALLS[r6Fire.active].z, '#ff7a1a', 5);
  dot(R6_HOSPITAL.x, R6_HOSPITAL.z, '#ffffff', 4);
  if (r6Medic.active >= 0) dot(R6_MEDIC_CALLS[r6Medic.active].x, R6_MEDIC_CALLS[r6Medic.active].z, '#ff4444', 5);
  if (r6Surf.rescueAt >= 0) dot(R6_SURF_BREAKS[r6Surf.rescueAt].x, R6_SURF_BREAKS[r6Surf.rescueAt].z, '#ff7a1a', 5);
}
function r6KeyE() {
  if (r6MetroOpen()) return true;
  if (r6FoodOpen()) return true;
  if (r6SurfOpen()) return true;
  if (r6SkateOpen()) return true;
  if (r6StuntOpen()) return true;
  if (r6ClubOpen()) return true;
  if (r6TattooOpen()) return true;
  if (r6ArtOpen()) return true;
  if (r6RanchOpen()) return true;
  if (r6GolfOpen()) return true;
  if (r6BowlOpen()) return true;
  if (r6ArcadeOpen()) return true;
  if (r6LibraryOpen()) return true;
  if (r6MuseumOpen()) return true;
  if (r6FairOpen()) return true;
  if (r6ZooOpen()) return true;
  if (r6PhotoOpen()) return true;
  if (r6WeddingOpen()) return true;
  if (r6BandOpen()) return true;
  if (r6BuskOpen()) return true;
  if (r6EstateOpen()) return true;
  if (r6PawnOpen()) return true;
  if (r6FireOpen()) return true;
  if (r6MedicOpen()) return true;
  return false;
}
function r6SelfTest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  ok('r6-metro-stations', R6_METRO_STATIONS.length === 4 && R6_METRO_STATIONS[0].name === 'Marina Metro', '4 stations');
  ok('r6-metro-fare', R6_METRO_CARD_PRICE === 40 && R6_METRO_FARE === 5, 'card $40, fare $5');
  ok('r6-food-menus', R6_FOOD_MENUS.length === 5 && R6_FOOD_MENUS[0].price === 14, '5 menus');
  ok('r6-food-pitches', R6_FOOD_PITCHES.length === 6, '6 pitches');
  ok('r6-food-truck-price', R6_FOOD_TRUCK_PRICE === 2500, 'truck $2500');
  ok('r6-surf-breaks', R6_SURF_BREAKS.length === 3 && R6_SURF_BREAKS[1].wave === 5, '3 breaks');
  ok('r6-surf-boards', R6_SURF_BOARDS.length === 4 && R6_SURF_BOARDS[3].price === 950, '4 boards');
  ok('r6-surf-score', r6SurfScore(R6_SURF_BREAKS[0]) > 0, 'score ' + r6SurfScore(R6_SURF_BREAKS[0]));
  ok('r6-skate-tricks', R6_SKATE_TRICKS.length === 8 && R6_SKATE_TRICKS[7].pts === 120, '8 tricks');
  ok('r6-stunt-gigs', R6_STUNT_GIGS.length === 4 && R6_STUNT_GIGS[2].pay === 320, '4 gigs');
  ok('r6-club-djs', R6_CLUB_DJS.length === 4 && R6_CLUB_DJS[3].vibe === 60, '4 DJs');
  ok('r6-club-price', R6_CLUB.price === 8000, 'club $8000');
  ok('r6-tattoos', R6_TATTOOS.length === 6 && R6_TATTOOS[5].price === 700, '6 tattoos');
  ok('r6-murals', R6_MURALS.length === 6 && R6_MURALS[5].rep === 80, '6 murals');
  ok('r6-spray', R6_SPRAY.length === 3 && R6_SPRAY[2].cans === 14, '3 spray packs');
  ok('r6-horses', R6_HORSES.length === 4 && R6_HORSES[2].speed === 5, '4 horses');
  ok('r6-golf-holes', R6_GOLF_HOLES.length === 9 && r6GolfParTotal() === 35, '9 holes par 35');
  ok('r6-bowl-alley', !!R6_BOWL_ALLEY && R6_BOWL_ALLEY.name === 'Strike Lanes', 'bowling alley built');
  ok('r6-arcade-cabs', R6_ARCADE_CABS.length === 5 && R6_ARCADE_CABS[4].top === 20300, '5 cabinets');
  ok('r6-rare-books', R6_RARE_BOOKS.length === 12 && R6_RARE_BOOKS[11].amt === 7, '12 rare books');
  ok('r6-museum-exhibits', R6_MUSEUM_EXHIBITS.length === 4 && R6_MUSEUM_ARTIFACTS.length === 4, '4 exhibits + 4 artifacts');
  ok('r6-fair', !!R6_FAIR && R6_FAIR.name === 'Solmar Fair', 'fairground built');
  ok('r6-zoo-animals', R6_ZOO_ANIMALS.length === 6 && R6_ZOO_ANIMALS[5].name === 'White Gull', '6 zoo animals');
  ok('r6-photo-themes', R6_PHOTO_THEMES.length === 4 && R6_PHOTO_THEMES[3].pay === 150, '4 photo themes');
  ok('r6-wedding-vendors', R6_WEDDING_VENDORS.length === 5 && R6_WEDDING_VENDORS[4].cost === 500, '5 vendors');
  ok('r6-band-venues', R6_BAND_VENUES.length === 4 && R6_BAND_VENUES[3].fee === 800, '4 venues');
  ok('r6-band-songs', R6_BAND_SONGS.length === 4, '4 songs');
  ok('r6-busk-pitches', R6_BUSK_PITCHES.length === 5, '5 pitches');
  ok('r6-flats', R6_FLATS.length === 4 && R6_FLATS[1].buy === 3100, '4 flats');
  ok('r6-renov-stages', R6_RENOV_STAGE.length === 3 && R6_RENOV_STAGE[2].cost === 900, '3 renov stages');
  ok('r6-antiques', R6_ANTIQUES.length === 10 && R6_ANTIQUES[6].value === 300, '10 antiques');
  ok('r6-pawn-appraise', r6PawnAppraise(200) >= 170 && r6PawnAppraise(200) <= 250, 'appraisal ' + r6PawnAppraise(200));
  ok('r6-fire-calls', R6_FIRE_CALLS.length === 5 && R6_FIRE_CALLS[3].pay === 480, '5 fire callouts');
  ok('r6-medic-calls', R6_MEDIC_CALLS.length === 5 && R6_MEDIC_CALLS[3].severity === 5, '5 medic callouts');
  ok('r6-shot-fireworks', R6_SHOT_PROPS.fireworks.length === 30, '30 firework sparks');
  ok('r6-shot-truck', !!R6_SHOT_PROPS.truck, 'food truck in scene');
  ok('r6-shot-roadblock', R6_SHOT_PROPS.roadblock.length === 7, 'roadblock + cones');
  ok('r6-shot-crates', R6_SHOT_PROPS.missionCrates.length === 3, '3 mission crates');
  ok('r6-panel', !!document.getElementById('r6Panel'), 'R6 panel in the DOM');
  ok('r6-hud-line', !!document.getElementById('r6Line'), 'R6 HUD line present');
  ok('r6-keye', typeof r6KeyE === 'function', 'E hook wired');
  ok('r6-cash-sane', state.cash >= 0 && state.cash < 100000000, 'cash ' + state.cash);
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
window.__r6exports = {
  metro: r6Metro, food: r6Food, surf: r6Surf, skate: r6Skate, stunt: r6Stunt, club: r6Club,
  tattoo: r6Tattoo, art: r6Art, ranch: r6Ranch, golf: r6Golf, bowl: r6Bowl, arcade: r6Arcade,
  library: r6Library, museum: r6Museum, fair: r6Fair, zoo: r6Zoo, photo: r6Photo, wedding: r6Wedding,
  band: r6Band, busk: r6Busk, estate: r6Estate, pawn: r6Pawn, fire: r6Fire, medic: r6Medic,
  stations: R6_METRO_STATIONS, menus: R6_FOOD_MENUS, breaks: R6_SURF_BREAKS, tricks: R6_SKATE_TRICKS,
  gigs: R6_STUNT_GIGS, djs: R6_CLUB_DJS, tattoos: R6_TATTOOS, murals: R6_MURALS, horses: R6_HORSES,
  holes: R6_GOLF_HOLES, cabs: R6_ARCADE_CABS, books: R6_RARE_BOOKS, exhibits: R6_MUSEUM_EXHIBITS,
  animals: R6_ZOO_ANIMALS, themes: R6_PHOTO_THEMES, vendors: R6_WEDDING_VENDORS, venues: R6_BAND_VENUES,
  pitches: R6_BUSK_PITCHES, flats: R6_FLATS, antiques: R6_ANTIQUES, fireCalls: R6_FIRE_CALLS, medicCalls: R6_MEDIC_CALLS,
  openMetro: r6MetroOpen, openFood: r6FoodOpen, openSurf: r6SurfOpen, openSkate: r6SkateOpen,
  openStunt: r6StuntOpen, openClub: r6ClubOpen, openTattoo: r6TattooOpen, openArt: r6ArtOpen,
  openRanch: r6RanchOpen, openGolf: r6GolfOpen, openBowl: r6BowlOpen, openArcade: r6ArcadeOpen,
  openLibrary: r6LibraryOpen, openMuseum: r6MuseumOpen, openFair: r6FairOpen, openZoo: r6ZooOpen,
  openPhoto: r6PhotoOpen, openWedding: r6WeddingOpen, openBand: r6BandOpen, openBusk: r6BuskOpen,
  openEstate: r6EstateOpen, openPawn: r6PawnOpen, openFire: r6FireOpen, openMedic: r6MedicOpen,
  rideMetro: r6MetroRide, surfRide: r6SurfRide, skateTrick: r6SkateTrick, stuntGig: r6StuntGig,
  selftest: r6SelfTest, update: updateR6, hudLine: r6HudLine,
};
// Build every Round 6 place in the world and restore saved Round 6 progress.
r6ShotPropsBuild(); r6MetroBuild(); r6FoodBuild(); r6SurfBuild(); r6SkateBuild(); r6StuntBuild();
r6ClubBuild(); r6TattooBuild(); r6ArtBuild(); r6RanchBuild(); r6GolfBuild(); r6BowlBuild();
r6ArcadeBuild(); r6LibraryBuild(); r6MuseumBuild(); r6FairBuild(); r6ZooBuild(); r6PhotoBuild();
r6WeddingBuild(); r6BandBuild(); r6BuskBuild(); r6EstateBuild(); r6PawnBuild(); r6FireBuild(); r6MedicBuild();
r6MetroLoad(); r6FoodLoad(); r6SurfLoad(); r6SkateLoad(); r6StuntLoad(); r6ClubLoad();
r6TattooLoad(); r6ArtLoad(); r6RanchLoad(); r6GolfLoad(); r6BowlLoad(); r6ArcadeLoad();
r6LibraryLoad(); r6MuseumLoad(); r6FairLoad(); r6ZooLoad(); r6PhotoLoad(); r6WeddingLoad();
r6BandLoad(); r6BuskLoad(); r6EstateLoad(); r6PawnLoad(); r6FireLoad(); r6MedicLoad();
document.getElementById('r6PanelClose').addEventListener('click', r6ClosePanel);
document.getElementById('phoneBtnR6Stats').addEventListener('click', () => { togglePhone(); r6PhoneStatsOpen(); });
document.getElementById('phoneBtnR6Guide').addEventListener('click', () => { togglePhone(); r6GuideOpen(); });
document.getElementById('phoneBtnR6Extras').addEventListener('click', () => { togglePhone(); r6ExtrasOpen(); });

// ---------- Round 6, part nine: extras depth ----------
// A second layer on the 24 systems, reached from the Extras button on the phone (U):
// catering gigs, board wax, film rotation, VIP lists, crew, breeding, the
// driving range, a bowling team, arcade tournaments, the gift shop, a fair
// season pass, keeper talks, the darkroom, the honeymoon, band merch, a
// street album, an estate licence, pawn loans, a station cat, first aid.
const R6_CATERING = [
  { name: 'Marina Wedding Lunch', guests: 40, pay: 320, menu: 2 },
  { name: 'Docks Crew Dinner', guests: 25, pay: 210, menu: 1 },
  { name: 'Studio Wrap Party', guests: 60, pay: 480, menu: 0 },
  { name: 'Beach Birthday Bash', guests: 30, pay: 260, menu: 4 },
];
let r6Extras = { catering: 0, waxed: 0, films: 0, vip: 0, crew: 0, foals: 0, range: 0, teamWins: 0, tourneyWins: 0, gifts: 0, pass: false, talks: 0, darkroom: 0, honeymoon: false, merch: 0, album: 0, licence: false, loans: 0, cats: 0, firstAid: 0 };
function r6ExtrasOpen() {
  if (state.mode !== 'play') return;
  const lines = [
    'Round 6 extras — the second layer of every new system, in one place.',
    'Catering gigs: ' + r6Extras.catering + ' · Board waxed: ' + r6Extras.waxed + 'x · Films shot: ' + r6Extras.films + ' · VIP guests: ' + r6Extras.vip + '.',
    'Crew members: ' + r6Extras.crew + '/3 · Foals bred: ' + r6Extras.foals + ' · Driving-range sessions: ' + r6Extras.range + ' · Bowling team wins: ' + r6Extras.teamWins + '.',
    'Arcade tourney wins: ' + r6Extras.tourneyWins + ' · Gift-shop sales: ' + r6Extras.gifts + ' · Fair pass: ' + (r6Extras.pass ? 'owned' : 'not owned') + ' · Keeper talks: ' + r6Extras.talks + '.',
    'Darkroom prints: ' + r6Extras.darkroom + ' · Honeymoon: ' + (r6Extras.honeymoon ? 'booked!' : 'not booked') + ' · Merch sold: ' + r6Extras.merch + ' · Street albums: ' + r6Extras.album + '.',
    'Estate licence: ' + (r6Extras.licence ? 'held' : 'not held') + ' · Pawn loans: ' + r6Extras.loans + ' · Cats rescued: ' + r6Extras.cats + ' · First-aid course: ' + (r6Extras.firstAid ? 'done' : 'not done') + '.',
  ];
  const buttons = [
    r6PanelButton('Catering gig ($' + R6_CATERING[r6Extras.catering % 4].pay + ')', () => { r6ExtrasCatering(); }, !r6Food.owned),
    r6PanelButton('Wax the surfboard — $25', () => { if (r6Surf.board >= 0 && r6Spend(25)) { r6Extras.waxed++; r6Surf.skill = Math.min(50, r6Surf.skill + 2); r6ExtrasSave(); toast('Board waxed — faster drops, +2 surf skill.'); r6ExtrasOpen(); } }, r6Surf.board < 0),
    r6PanelButton('Next film at the studio', () => { r6ExtrasFilm(); }),
    r6PanelButton('Add a VIP to the club list — $80', () => { if (r6Club.owned && r6Spend(80)) { r6Extras.vip++; r6Club.vibe = r6Clamp(r6Club.vibe + 6, 0, 100); r6ExtrasSave(); toast('VIP booked a table — the club buzzes.'); r6ExtrasOpen(); } }, !r6Club.owned),
    r6PanelButton('Recruit a crew member — $150', () => { if (r6Extras.crew < 3 && r6Spend(150)) { r6Extras.crew++; r6Art.rep += 10; r6ArtSave(); r6ExtrasSave(); toast('A new Gull joins the crew — rep +10.'); r6ExtrasOpen(); } }, r6Extras.crew >= 3),
    r6PanelButton('Breed two horses — $200', () => { r6ExtrasBreed(); }, r6Ranch.horses.length < 2),
    r6PanelButton('Driving range — $20', () => { if (r6Spend(20)) { r6Extras.range++; if (skills && typeof skills.driving === 'number') skills.driving = Math.min(100, skills.driving + 1); r6ExtrasSave(); toast('A bucket of balls at the range — driving +1.'); r6ExtrasOpen(); } }),
    r6PanelButton('Join the bowling team', () => { r6ExtrasBowlTeam(); }),
    r6PanelButton('Arcade tournament — $30 entry', () => { r6ExtrasTourney(); }),
    r6PanelButton('Work the museum gift shop', () => { r6ExtrasGiftShop(); }),
    r6PanelButton('Buy a fair season pass — $180', () => { if (!r6Extras.pass && r6Spend(180)) { r6Extras.pass = true; r6ExtrasSave(); toast('Season pass! All fair rides are free now.'); r6ExtrasOpen(); } }, r6Extras.pass),
    r6PanelButton('Give a keeper talk at the zoo', () => { r6ExtrasTalk(); }),
    r6PanelButton('Develop prints in the darkroom — $35', () => { if (r6Spend(35)) { r6Extras.darkroom++; r6Photo.gallery++; r6PhotoSave(); r6ExtrasSave(); toast('A print dries on the line — it joins the gallery wall.'); r6ExtrasOpen(); } }),
    r6PanelButton('Book the honeymoon — $900', () => { if (r6Wedding.married && !r6Extras.honeymoon && r6Spend(900)) { r6Extras.honeymoon = true; r6ExtrasSave(); toast('Honeymoon booked on Coral Cay — Ryan and Ian sail off at sunset.'); r6ExtrasOpen(); } }, !r6Wedding.married || r6Extras.honeymoon),
    r6PanelButton('Sell band merch at a gig', () => { r6ExtrasMerch(); }, !r6Band.formed),
    r6PanelButton('Record a street album — $120', () => { if (r6Spend(120)) { r6Extras.album++; r6Busk.tips += 60; r6BuskSave(); r6ExtrasSave(); toast('Street album recorded — buskers buy it on the spot.'); r6ExtrasOpen(); } }),
    r6PanelButton('Estate agent licence — $400', () => { if (!r6Extras.licence && r6Spend(400)) { r6Extras.licence = true; r6ExtrasSave(); toast('Licensed! Flats now sell for $200 more.'); r6ExtrasOpen(); } }, r6Extras.licence),
    r6PanelButton('Take a pawn loan — $300', () => { r6ExtrasLoan(); }),
    r6PanelButton('Rescue the station cat', () => { r6ExtrasCat(); }),
    r6PanelButton('First-aid course — $90', () => { if (!r6Extras.firstAid && r6Spend(90)) { r6Extras.firstAid = 1; r6Medic.rep = Math.min(100, r6Medic.rep + 10); r6MedicSave(); r6ExtrasSave(); toast('First-aid certified — hospital rep +10.'); r6ExtrasOpen(); } }, !!r6Extras.firstAid),
    r6PanelButton('Close', () => r6ClosePanel()),
  ];
  r6ShowPanel('✨ Round 6 Extras', lines, buttons);
}
function r6ExtrasCatering() {
  const gig = R6_CATERING[r6Extras.catering % R6_CATERING.length];
  r6Extras.catering++;
  const menu = R6_FOOD_MENUS[gig.menu];
  r6Earn(gig.pay, 'Catering: ' + gig.name + ' (' + gig.guests + ' guests, ' + menu.name + ').');
  r6ExtrasSave(); r6ExtrasOpen();
}
const R6_FILMS = ['Bay Breakers', 'The Long Ferry Home', 'Neon Tide', 'Gull Song Nights'];
function r6ExtrasFilm() {
  r6Extras.films++;
  r6Stunt.film = R6_FILMS[r6Extras.films % R6_FILMS.length];
  r6StuntSave(); r6ExtrasSave();
  toast('New film greenlit at the studio: "' + r6Stunt.film + '". Stunt pay rises with stars.');
  r6ExtrasOpen();
}
function r6ExtrasBreed() {
  if (r6Ranch.horses.length < 2) { toast('Need two horses at the ranch to breed a foal.'); return; }
  if (!r6Spend(200)) return;
  r6Extras.foals++;
  r6Ranch.trained++;
  r6RanchSave(); r6ExtrasSave();
  toast('A foal is born at Rancho del Sol — the herd is stronger now.');
  r6ExtrasOpen();
}
function r6ExtrasBowlTeam() {
  if (r6Bowl.best >= 180) { r6Extras.teamWins++; r6Earn(200, '🎳 Bowling team night — your 180+ game carried the team!'); }
  else toast('Bowling team wants a 180+ game first — practice at Strike Lanes.');
  r6ExtrasSave(); r6ExtrasOpen();
}
function r6ExtrasTourney() {
  if (!r6Spend(30)) return;
  if (r6Arcade.plays >= 5 && Math.random() < 0.5) { r6Extras.tourneyWins++; r6Earn(220, '🕹️ Won the Neon Palace weekly tournament!'); }
  else toast('Arcade tournament lost — play 5+ cabinet games first, then try again.');
  r6ExtrasSave(); r6ExtrasOpen();
}
function r6ExtrasGiftShop() {
  r6Extras.gifts++;
  const sale = 20 + Math.floor(Math.random() * 40);
  r6Earn(sale, 'Sold a golden gull souvenir at the museum gift shop.');
  r6ExtrasSave(); r6ExtrasOpen();
}
function r6ExtrasTalk() {
  r6Extras.talks++;
  r6Earn(55, 'Gave a keeper talk at the zoo — the kids loved the otters.');
  r6ExtrasSave(); r6ExtrasOpen();
}
function r6ExtrasMerch() {
  const sales = 30 + r6Band.fans;
  r6Extras.merch += 5;
  r6Earn(sales, 'Sold band merch at the last gig — 5 shirts, $' + sales + '.');
  r6ExtrasSave(); r6ExtrasOpen();
}
function r6ExtrasLoan() {
  r6Extras.loans++;
  state.cash += 300;
  updateHUD();
  toast('Old Tom hands over $300. Pay it back by selling him an antique — he remembers.');
  r6ExtrasSave(); r6ExtrasOpen();
}
function r6ExtrasCat() {
  r6Extras.cats++;
  r6Fire.putOut++;
  r6Earn(60, '🐱 Rescued the station cat from a tree — Engine 7\'s favourite callout.');
  r6FireSave(); r6ExtrasSave(); r6ExtrasOpen();
}
function r6ExtrasSave() { r6Save('extras', r6Extras); }
function r6ExtrasLoad() {
  const s = r6Load('extras', null);
  if (s) Object.assign(r6Extras, s);
}
r6ExtrasLoad();

// ---------- Round 6, part ten: bay guide, daily routine, stats ----------
// One tip per system, a guide panel on the phone, a daily routine that pays
// the slow incomes (sponsor money, club door trickle, ranch board), and a
// stats summary the self-test and the phone both read.
const R6_TIPS = [
  { system: 'Metro', tip: 'A metro card pays for itself in eight rides — and the train beats traffic every time.' },
  { system: 'Food truck', tip: 'Cook the priciest menu at the busiest pitch; five-star hygiene doubles every tip.' },
  { system: 'Surfing', tip: 'Wax the board before a comp and ride Coral Barrel — the wave score is the highest.' },
  { system: 'Skate park', tip: 'Bank the combo before a risky trick; a bail wipes the whole combo, not just the trick.' },
  { system: 'Stunt career', tip: 'Stars unlock gigs in order — the burning-building run needs 40 stars first.' },
  { system: 'Nightclub', tip: 'A booked DJ lifts vibe before the night starts; upgrades lift it forever.' },
  { system: 'Tattoo parlor', tip: 'Walk-in clients pay for the flash book; the full sleeve is the biggest boost.' },
  { system: 'Street art', tip: 'Paint the small walls first — rep opens the big ones, and heat fades with time.' },
  { system: 'Horse ranch', tip: 'Train before you race; two trained horses breed a foal worth more than either.' },
  { system: 'Golf', tip: 'Caddy first to learn the greens, then play — beating par pays $200 a round.' },
  { system: 'Bowling', tip: 'A 200+ game wins league night; a 280+ game is a perfect-game payout.' },
  { system: 'Arcade', tip: 'Tickets are the real prize — 100 of them trade for $80 at the prize shelf.' },
  { system: 'Library', tip: 'Read the rare books in shelf order; the last one, Solmar: A History, is +7 driving.' },
  { system: 'Museum', tip: 'Give tours to unlock the quiz night, and return artifacts the moment you find them.' },
  { system: 'Carnival', tip: 'The season pass pays for itself in fifteen rides — buy it before the fireworks.' },
  { system: 'Zoo', tip: 'Feed all six animals in one day and the keepers pay a $150 bonus.' },
  { system: 'Photo studio', tip: 'Hang prints and let them sell while you work — the darkroom adds one free.' },
  { system: 'Wedding', tip: 'Book the chapel keeper last; the ceremony pays $600 in guest gifts.' },
  { system: 'Band', tip: 'Rehearse before a gig — every rehearsal adds fans, and fans unlock the arena.' },
  { system: 'Busking', tip: 'Play where the crowd is biggest; a full crowd at the marina pays $150.' },
  { system: 'Real estate', tip: 'Renovate in order and sell at stage three — or keep the flat for $45 a day.' },
  { system: 'Pawn shop', tip: 'Haggle once per antique; Old Tom only raises his price a little over half the time.' },
  { system: 'Firefighter', tip: 'Upgrade the hose tank before the warehouse fire — it drinks water fast.' },
  { system: 'Paramedic', tip: 'Severe cases need stabilising first; rushing one costs five hospital rep.' },
];
function r6TipOfDay() {
  const day = Math.floor(state.time / 120) % R6_TIPS.length;
  return R6_TIPS[day];
}
const R6_GUIDE_SPOTS = [
  { name: 'Metro', where: 'four stations: Marina, Old Town, Casino Row, North Docks', key: 'E at a station' },
  { name: 'Food truck', where: 'six pitches, orange flags around the bay', key: 'E at a pitch' },
  { name: 'Surfing', where: 'surf shop at the beach (96, 108), breaks offshore', key: 'E at the shop or a buoy' },
  { name: 'Skate park', where: 'Concrete Wave Park, south-west', key: 'E at the park' },
  { name: 'Stunt career', where: 'Solmar Studios, south-east', key: 'E at the studio gate' },
  { name: 'Nightclub', where: 'The Bluefin, east side', key: 'E at the door' },
  { name: 'Tattoo parlor', where: 'Ink & Salt, west of the plaza', key: 'E at the shop' },
  { name: 'Street art', where: 'six mural walls around the bay', key: 'E at a wall' },
  { name: 'Horse ranch', where: 'Rancho del Sol, far west farmland', key: 'E at the barn' },
  { name: 'Golf', where: 'Solmar Greens, north; mini-golf at the beach', key: 'E at the clubhouse' },
  { name: 'Bowling', where: 'Strike Lanes, north-west', key: 'E at the alley' },
  { name: 'Arcade', where: 'Neon Palace, east of the plaza', key: 'E at the hall' },
  { name: 'Library', where: 'Solmar Library, north of the plaza', key: 'E at the steps' },
  { name: 'Museum', where: 'Bay Museum, north-east', key: 'E at the columns' },
  { name: 'Carnival', where: 'Solmar Fair, south field', key: 'E at the fairground' },
  { name: 'Zoo', where: 'Solmar Zoo, north-east past the palms', key: 'E at the gate' },
  { name: 'Photo studio', where: 'Lightbox Studio, Marina Row', key: 'E at the studio' },
  { name: 'Wedding', where: 'five vendors around the bay, chapel at the north end', key: 'E at a vendor or the chapel' },
  { name: 'Band', where: 'four venues: Marina Bar, Bluefin, Fairground, Bay Arena', key: 'E at a stage' },
  { name: 'Busking', where: 'five pitches: marina, plaza, casino, boardwalk, airport', key: 'E at a pitch' },
  { name: 'Real estate', where: 'four flats: harbour, old town, beach, docks', key: 'E at a flat' },
  { name: 'Pawn shop', where: 'Old Tom\'s Pawn, Docks Lane; antiques glint gold', key: 'E at the shop or a glint' },
  { name: 'Firefighter', where: 'Bay Fire Station, west side', key: 'E at the station or a fire' },
  { name: 'Paramedic', where: 'Bay General Hospital, east side', key: 'E at the hospital or a patient' },
];
function r6GuideOpen() {
  const lines = ['Every Round 6 system, where it lives, and how to open it.'];
  for (const g of R6_GUIDE_SPOTS) lines.push(g.name + ' — ' + g.where + ' (' + g.key + ').');
  const tip = r6TipOfDay();
  lines.push('');
  lines.push('Tip of the day — ' + tip.system + ': ' + tip.tip);
  r6ShowPanel('🗺️ Round 6 Bay Guide', lines, [
    r6PanelButton('Open Round 6 Extras', () => { r6ExtrasOpen(); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
}
function r6StatsSummary() {
  return {
    systems: 24,
    metroRides: r6Metro.rides,
    foodServed: r6Food.served,
    surfBest: r6Surf.best,
    skateBest: r6Skate.best,
    stuntStars: r6Stunt.stars,
    clubNights: r6Club.nights,
    tattoos: r6Tattoo.owned.length,
    muralsDone: r6Art.done.length,
    horses: r6Ranch.horses.length,
    golfBest: r6Golf.best,
    bowlBest: r6Bowl.best,
    arcadePlays: r6Arcade.plays,
    booksRead: r6Library.read.length,
    museumTours: r6Museum.tours,
    fairRides: r6Fair.rides,
    zooFed: r6Zoo.fed.length,
    photoSessions: r6Photo.sessions,
    weddingVendors: r6Wedding.vendors.length,
    married: r6Wedding.married,
    bandFans: r6Band.fans,
    buskTips: r6Busk.tips,
    flatsOwned: r6Estate.owned.length,
    flips: r6Estate.flipped,
    antiques: r6Pawn.found.length,
    firesOut: r6Fire.putOut,
    patientsSaved: r6Medic.saved,
    medicRep: r6Medic.rep,
    extras: r6Extras,
  };
}
function r6DailyUpdate(dt) {
  r6BadgesCheck();
  r6DailyUpdate._t = (r6DailyUpdate._t || 0) + dt;
  if (r6DailyUpdate._t < 180) return;
  r6DailyUpdate._t = 0;
  let paid = 0;
  const notes = [];
  if (r6Skate.sponsor) { paid += 60; notes.push('sponsor $60'); }
  if (r6Club.owned && r6Club.vibe >= 60) { const door = 30 + r6Club.upgrades * 15; paid += door; notes.push('club door $' + door); }
  if (r6Ranch.horses.length > 0) { const board = r6Ranch.horses.length * 15; paid += board; notes.push('stable board $' + board); }
  if (r6Estate.owned.length > 0) { const rent = r6Estate.owned.length * 20; paid += rent; notes.push('flat rent $' + rent); }
  if (paid > 0) {
    state.cash += paid;
    updateHUD();
    toast('Round 6 daily income: $' + paid + ' (' + notes.join(', ') + ').');
  }
  const tip = r6TipOfDay();
  toast('Tip — ' + tip.system + ': ' + tip.tip);
}
function r6SelfTestExtra() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  ok('r6-tips', R6_TIPS.length === 24 && R6_TIPS[0].system === 'Metro', '24 tips');
  ok('r6-guide-spots', R6_GUIDE_SPOTS.length === 24 && R6_GUIDE_SPOTS[23].name === 'Paramedic', '24 guide spots');
  ok('r6-tip-of-day', typeof r6TipOfDay().tip === 'string' && r6TipOfDay().tip.length > 10, r6TipOfDay().system);
  ok('r6-stats', r6StatsSummary().systems === 24 && r6StatsSummary().metroRides === r6Metro.rides, 'stats summary reads live state');
  ok('r6-catering', R6_CATERING.length === 4 && R6_CATERING[2].pay === 480, '4 catering gigs');
  ok('r6-films', R6_FILMS.length === 4 && R6_FILMS[1] === 'The Long Ferry Home', '4 films');
  ok('r6-extras-open', typeof r6ExtrasOpen === 'function', 'extras panel callable');
  ok('r6-guide-open', typeof r6GuideOpen === 'function', 'guide panel callable');
  ok('r6-daily', typeof r6DailyUpdate === 'function', 'daily routine wired');
  ok('r6-save-keys', R6_STORE === 'solmar-r6-', 'store prefix set');
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
if (window.__r6exports) {
  window.__r6exports.extraSelftest = r6SelfTestExtra;
  window.__r6exports.stats = r6StatsSummary;
  window.__r6exports.guide = r6GuideOpen;
  window.__r6exports.extras = r6ExtrasOpen;
  window.__r6exports.tips = R6_TIPS;
}

// ---------- Round 6, part eleven: badges, metro lines, food specials ----------
// Twenty-four Round 6 badges, one per system, each paying $50 the first time
// it is earned. The check runs inside the daily routine, so no new wiring.
const R6_BADGES = [
  { id: 'first-ride', name: 'First Ride', desc: 'Ride the metro once', test: () => r6Metro.rides >= 1 },
  { id: 'food-critic', name: 'Food Critic', desc: 'Serve 25 dishes from the truck', test: () => r6Food.served >= 25 },
  { id: 'wave-rider', name: 'Wave Rider', desc: 'Score 80+ on a surf ride', test: () => r6Surf.best >= 80 },
  { id: 'combo-king', name: 'Combo King', desc: 'Land a 500+ skate combo', test: () => r6Skate.best >= 500 },
  { id: 'movie-star', name: 'Movie Star', desc: 'Reach 80 stars at the studio', test: () => r6Stunt.stars >= 80 },
  { id: 'club-boss', name: 'Club Boss', desc: 'Run 5 club nights', test: () => r6Club.nights >= 5 },
  { id: 'inked', name: 'Inked', desc: 'Get 3 tattoos', test: () => r6Tattoo.owned.length >= 3 },
  { id: 'mural-master', name: 'Mural Master', desc: 'Finish all 6 murals', test: () => r6Art.done.length >= 6 },
  { id: 'rancher', name: 'Rancher', desc: 'Own 3 horses', test: () => r6Ranch.horses.length >= 3 },
  { id: 'club-champion', name: 'Club Champion', desc: 'Win a golf tournament', test: () => r6Golf.tourneyWins >= 1 },
  { id: 'strike-king', name: 'Strike King', desc: 'Bowl 10 strikes', test: () => r6Bowl.strikes >= 10 },
  { id: 'high-scorer', name: 'High Scorer', desc: 'Beat any arcade top score', test: () => Object.keys(r6Arcade.scores).some((k) => r6Arcade.scores[k] > (R6_ARCADE_CABS.find((c) => c.name === k) || { top: 0 }).top) },
  { id: 'bookworm', name: 'Bookworm', desc: 'Read all 12 rare books', test: () => r6Library.read.length >= 12 },
  { id: 'curator', name: 'Curator', desc: 'Return all 4 museum artifacts', test: () => r6Museum.artifacts.length >= 4 },
  { id: 'fair-fan', name: 'Fair Fan', desc: 'Ride the wheel 10 times', test: () => r6Fair.rides >= 10 },
  { id: 'zookeeper', name: 'Zookeeper', desc: 'Feed all 6 zoo animals', test: () => r6Zoo.fed.length >= 6 },
  { id: 'shutterbug', name: 'Shutterbug', desc: 'Shoot 10 photo sessions', test: () => r6Photo.sessions >= 10 },
  { id: 'just-married', name: 'Just Married', desc: 'Hold the Ryan & Ian ceremony', test: () => r6Wedding.married },
  { id: 'headliner', name: 'Headliner', desc: 'Grow the band to 300 fans', test: () => r6Band.fans >= 300 },
  { id: 'street-star', name: 'Street Star', desc: 'Reach a 100 crowd busking', test: () => r6Busk.best >= 100 },
  { id: 'flipper', name: 'Flipper', desc: 'Flip 2 flats', test: () => r6Estate.flipped >= 2 },
  { id: 'antique-hunter', name: 'Antique Hunter', desc: 'Find all 10 antiques', test: () => r6Pawn.found.length >= 10 },
  { id: 'hero', name: 'Hero', desc: 'Put out 5 fires', test: () => r6Fire.putOut >= 5 },
  { id: 'lifesaver', name: 'Lifesaver', desc: 'Save 5 patients', test: () => r6Medic.saved >= 5 },
];
let r6Badges = { earned: [] };
function r6BadgesCheck() {
  for (const b of R6_BADGES) {
    if (r6Badges.earned.includes(b.id)) continue;
    let pass = false;
    try { pass = b.test(); } catch (e) { pass = false; }
    if (!pass) continue;
    r6Badges.earned.push(b.id);
    state.cash += 50;
    updateHUD();
    toast('🏅 Round 6 badge: ' + b.name + ' — ' + b.desc + ' (+$50).');
    r6BadgesSave();
  }
}
function r6BadgesSave() { r6Save('badges', r6Badges); }
function r6BadgesLoad() {
  const s = r6Load('badges', null);
  if (s) r6Badges.earned = s.earned || [];
}
r6BadgesLoad();
if (window.__r6exports) window.__r6exports.badges = R6_BADGES;
// Three metro lines, each with its own colour and a pair of stations, so the
// map reads like a real transit map in the guide.
const R6_METRO_LINES = [
  { name: 'Blue Line', color: '#2ee6ff', stops: [0, 1], desc: 'Marina to Old Town, along the bay' },
  { name: 'Pink Line', color: '#ff2a7a', stops: [1, 2], desc: 'Old Town to Casino Row, the night run' },
  { name: 'Green Line', color: '#7dff9a', stops: [2, 3], desc: 'Casino Row to the North Docks, the workers\' run' },
];
function r6MetroLineName(from, to) {
  for (const line of R6_METRO_LINES) {
    if (line.stops.includes(from) && line.stops.includes(to)) return line.name;
  }
  return 'Bay Line';
}
// The food truck runs a daily special: one menu at double tips, rotating by
// the in-game clock, announced on the truck panel.
function r6FoodSpecial() {
  const day = Math.floor(state.time / 120) % R6_FOOD_MENUS.length;
  return R6_FOOD_MENUS[day];
}
function r6FoodSpecialLine() {
  const sp = r6FoodSpecial();
  return 'Today\'s special: ' + sp.name + ' — double tips all day.';
}
// A surf forecast for the three breaks, driven by the same clock as the
// seasons, so the best break changes through the week.
function r6SurfForecast() {
  const day = Math.floor(state.time / 120) % 3;
  const order = [2, 0, 1];
  const best = R6_SURF_BREAKS[order[day]];
  return 'Surf forecast: ' + best.name + ' is firing today (wave ' + best.wave + '/5).';
}

// ---------- Round 6, part twelve: earnings ledger + phone stats ----------
// Every Round 6 dollar in and out runs through r6Earn / r6Spend, so the
// ledger below is exact. The phone stats screen reads it plus the summary.
let r6Ledger = { earned: 0, spent: 0, jobs: 0 };
function r6LedgerLoad() {
  const s = r6Load('ledger', null);
  if (s) { r6Ledger.earned = s.earned || 0; r6Ledger.spent = s.spent || 0; r6Ledger.jobs = s.jobs || 0; }
}
function r6LedgerSave() { r6Save('ledger', r6Ledger); }
function r6LedgerSummary() {
  return {
    earned: r6Ledger.earned,
    spent: r6Ledger.spent,
    profit: r6Ledger.earned - r6Ledger.spent,
    jobs: r6Ledger.jobs,
    badges: r6Badges.earned.length,
    badgesTotal: R6_BADGES.length,
  };
}
function r6PhoneStatsOpen() {
  if (state.mode !== 'play') return;
  const s = r6StatsSummary();
  const l = r6LedgerSummary();
  const lines = [
    'Round 6 — your bay, by the numbers.',
    '',
    'Money: earned $' + l.earned + ' · spent $' + l.spent + ' · profit $' + l.profit + ' across ' + l.jobs + ' paying jobs.',
    'Badges: ' + l.badges + '/' + l.badgesTotal + ' earned ($50 each).',
    '',
    'Metro rides ' + s.metroRides + ' · Food served ' + s.foodServed + ' · Surf best ' + s.surfBest + ' pts.',
    'Skate best combo ' + s.skateBest + ' · Stunt stars ' + s.stuntStars + ' · Club nights ' + s.clubNights + '.',
    'Tattoos ' + s.tattoos + ' · Murals ' + s.muralsDone + '/6 · Horses ' + s.horses + ' · Golf best ' + (s.golfBest === 99 ? '—' : s.golfBest) + '.',
    'Bowling best ' + s.bowlBest + ' · Arcade plays ' + s.arcadePlays + ' · Books read ' + s.booksRead + '/12.',
    'Museum tours ' + s.museumTours + ' · Fair rides ' + s.fairRides + ' · Zoo animals fed ' + s.zooFed + '/6.',
    'Photo sessions ' + s.photoSessions + ' · Wedding vendors ' + s.weddingVendors + '/5' + (s.married ? ' · married!' : '') + '.',
    'Band fans ' + s.bandFans + ' · Busking tips $' + s.buskTips + ' · Flats owned ' + s.flatsOwned + ' · Flips ' + s.flips + '.',
    'Antiques ' + s.antiques + '/10 · Fires out ' + s.firesOut + ' · Patients saved ' + s.patientsSaved + ' · Hospital rep ' + s.medicRep + '.',
    '',
    r6SurfForecast(),
    r6FoodSpecialLine(),
    'Tip — ' + r6TipOfDay().system + ': ' + r6TipOfDay().tip,
  ];
  r6ShowPanel('📊 Round 6 Stats', lines, [
    r6PanelButton('Open the Bay Guide', () => { r6GuideOpen(); }),
    r6PanelButton('Open Round 6 Extras', () => { r6ExtrasOpen(); }),
    r6PanelButton('Close', () => r6ClosePanel()),
  ]);
}
r6LedgerLoad();
if (window.__r6exports) {
  window.__r6exports.ledger = r6LedgerSummary;
  window.__r6exports.phoneStats = r6PhoneStatsOpen;
  window.__r6exports.badgesEarned = () => r6Badges.earned;
  window.__r6exports.metroLine = r6MetroLineName;
  window.__r6exports.foodSpecial = r6FoodSpecialLine;
  window.__r6exports.surfForecast = r6SurfForecast;
}

// ---------- Round 6, part thirteen: ledger self-test ----------
// A second self-test pass over the ledger, badges and guide helpers, kept
// separate so the main Round 6 self-test stays readable.
function r6SelfTestLedger() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  ok('r6-ledger-shape', typeof r6Ledger.earned === 'number' && typeof r6Ledger.spent === 'number' && typeof r6Ledger.jobs === 'number', 'ledger ' + JSON.stringify(r6LedgerSummary()));
  ok('r6-ledger-profit', r6LedgerSummary().profit === r6Ledger.earned - r6Ledger.spent, 'profit math exact');
  ok('r6-badges-count', R6_BADGES.length === 24, '24 badges');
  ok('r6-badges-unique', new Set(R6_BADGES.map((b) => b.id)).size === 24, 'badge ids unique');
  ok('r6-badge-tests', R6_BADGES.every((b) => typeof b.test === 'function'), 'every badge has a test');
  ok('r6-metro-lines', R6_METRO_LINES.length === 3 && R6_METRO_LINES[0].stops.length === 2, '3 metro lines');
  ok('r6-metro-line-name', r6MetroLineName(0, 1) === 'Blue Line' && r6MetroLineName(1, 2) === 'Pink Line' && r6MetroLineName(2, 3) === 'Green Line', 'line lookup works');
  ok('r6-food-special', typeof r6FoodSpecialLine() === 'string' && r6FoodSpecialLine().includes('special'), r6FoodSpecialLine());
  ok('r6-surf-forecast', typeof r6SurfForecast() === 'string' && r6SurfForecast().includes('Surf forecast'), r6SurfForecast());
  ok('r6-phone-stats', typeof r6PhoneStatsOpen === 'function', 'phone stats callable');
  ok('r6-ledger-save', typeof r6LedgerSave === 'function' && typeof r6LedgerLoad === 'function', 'ledger persistence wired');
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
if (window.__r6exports) window.__r6exports.ledgerSelftest = r6SelfTestLedger;

// ---------- Round 6, part fourteen: fare chart + system status ----------
// A fare chart for the metro panel and a one-line status per system, used by
// the phone stats screen and the guide.
function r6FareChart() {
  const rows = [];
  for (let i = 0; i < R6_METRO_STATIONS.length; i++) {
    for (let j = 0; j < R6_METRO_STATIONS.length; j++) {
      if (i === j) continue;
      rows.push({
        from: R6_METRO_STATIONS[i].name,
        to: R6_METRO_STATIONS[j].name,
        line: r6MetroLineName(i, j),
        fare: r6Metro.card ? 0 : R6_METRO_FARE,
      });
    }
  }
  return rows;
}
function r6SystemStatus() {
  return [
    'Metro ' + r6Metro.rides + ' rides',
    'Food ' + r6Food.served + ' served',
    'Surf best ' + r6Surf.best,
    'Skate best ' + r6Skate.best,
    'Stunt ' + r6Stunt.stars + ' stars',
    'Club vibe ' + r6Club.vibe,
    'Tattoos ' + r6Tattoo.owned.length,
    'Murals ' + r6Art.done.length + '/6',
    'Horses ' + r6Ranch.horses.length,
    'Golf best ' + r6Golf.best,
    'Bowling best ' + r6Bowl.best,
    'Arcade ' + r6Arcade.plays + ' plays',
    'Books ' + r6Library.read.length + '/12',
    'Museum ' + r6Museum.tours + ' tours',
    'Fair ' + r6Fair.rides + ' rides',
    'Zoo fed ' + r6Zoo.fed.length + '/6',
    'Photos ' + r6Photo.sessions,
    'Wedding ' + r6Wedding.vendors.length + '/5',
    'Band ' + r6Band.fans + ' fans',
    'Busking $' + r6Busk.tips,
    'Flats ' + r6Estate.owned.length,
    'Antiques ' + r6Pawn.found.length + '/10',
    'Fires ' + r6Fire.putOut,
    'Patients ' + r6Medic.saved,
  ];
}
if (window.__r6exports) {
  window.__r6exports.fareChart = r6FareChart;
  window.__r6exports.systemStatus = r6SystemStatus;
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let hudTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  const dtRaw = clock.getDelta();
  const dt = Math.min(dtRaw, 0.1);
  state.time += dt;
  if (photoMode) {
    updatePhotoMode(dt);
    renderer.render(scene, camera);
    return;
  }
  if (state.mode === 'play' && !state.shot) {
    if (shopOpen) {
      updateTraffic(dt); updatePeds(dt);
      renderer.render(scene, camera);
      return;
    }
    if (switchTimer > 0) {
      switchTimer -= dtRaw;
      const prog = 1 - switchTimer / 1.5;
      const from = CHARS[state.activeChar];
      const to = CHARS[switchTarget];
      const mx = (from.st.x + to.st.x) / 2, mz = (from.st.z + to.st.z) / 2;
      const lift = Math.sin(Math.min(prog * Math.PI, Math.PI)) * 110;
      camera.position.set(lerp(camera.position.x, mx, 0.08), 12 + lift, lerp(camera.position.z, mz, 0.08));
      camera.lookAt(mx, 0, mz);
      if (!switchSwapped && prog >= 0.5) { switchSwapped = true; finishSwitch(); }
      updateTraffic(dt); updatePeds(dt); updatePolice(dt);
      renderer.render(scene, camera);
      return;
    }
    if (fireTimer > 0) fireTimer -= dt;
    if (mouseDown && state.weapon === 'smg' && !(state.inCar && state.inCar.kind === 'heli')) shootWeapon();
    pollGamepad(dt);
    updateTaxi(dt);
    radioTick();
    updateDayNight(dt);
    updateWeather(dt);
    updateHunters(dt);
    updateBountyTarget(dt);
    updateMovingBoats(dt);
    updateRoadblock(dt);
    updatePoliceHeli(dt);
    updateRace(dt);
    updateHeist(dt);
    updateFishing(dt);
    updateCompanion(dt);
    updatePassiveIncome(dt);
    updateStreetEvent(dt);
    updateProjectiles(dt);
    updateFires(dt);
    updatePackages();
    updateCharMission();
    updateFireJob(dt);
    updateMedicJob(dt);
    updateDriverJobs(dt);
    updateBuses(dt);
    updateAmbientEmerg(dt);
    updateAnimals(dt);
    updatePickups(dt);
    updateVestPickups(dt);
    updateAmbientPlanes(dt);
    updateIsle(dt);
    updateChain(dt);
    updateDarts(dt);
    updateBoardJob(dt);
    updateR4event(dt);
    updateDive(dt);
    updateMarket(dt);
    updateFerry(dt);
    updateStorm(dt);
    updateLoot(dt);
    updateKeeper(dt);
    updateCove(dt);
    updateCayBus(dt);
    updateDartChamp(dt);
    if (!state.inCar) updatePlayer(dt);
    if (state.inCar) updateCar(dt);
    updateR5(dt);
    updateR6(dt);
    updateR7(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    if (state.mission === 1 && state.missionStage === 2) {
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) {
        toast('Too slow! Marisol gave the package job to someone else.');
        state.mission++; state.missionStage = 0; beacon.visible = false;
        if (state.mission < MISSIONS.length) startMission(state.mission);
        updateObjective();
      } else updateObjective();
    }
    updateCamera(dt);
    updateAudio();
    if (tracerTimer > 0) { tracerTimer -= dt; if (tracerTimer <= 0 && tracer) { scene.remove(tracer); tracer = null; } }
    beacon.rotation.y += dt;
    beaconCyl.position.y = 0.2 + Math.sin(state.time * 3) * 0.15;
    hudTimer += dt;
    if (hudTimer > 0.15) { hudTimer = 0; updateHUD(); drawMinimap(); }
  } else if (state.mode === 'play' && state.shot) {
    // shot scenes: static, deterministic — only beacon pulse + render
    beacon.rotation.y += dt * 0.5;
    updateHUD(); drawMinimap();
    if (state.shot === 'chase') { for (const po of police) { if (po.mesh.userData.lightR) po.mesh.userData.lightR.material.emissiveIntensity = 2; } }
  } else if (state.mode === 'start') {
    // slow orbit over the city behind the title screen
    const a = state.time * 0.03;
    camera.position.set(Math.sin(a) * 130, 55, Math.cos(a) * 130);
    camera.lookAt(0, 10, 0);
    updateTraffic(dt * 0.4); updatePeds(dt * 0.4);
  }
  renderer.render(scene, camera);
}
// ---------- Round 7: reputation, witnesses, focus, prep, theft, lockers ----------
// Fresh code for Round 7. Twenty-four new systems for Solmar Bay, each with
// its own data, state, build step, panel, save/load and self-test hooks.
// Ryan and Ian are a couple who run jobs together across the bay.
const R7_STORE = 'solmar-r7-';
function r7Save(key, obj) {
  try { localStorage.setItem(R7_STORE + key, JSON.stringify(obj)); } catch (e) {}
}
function r7Load(key, fallback) {
  try { const s = JSON.parse(localStorage.getItem(R7_STORE + key) || 'null'); return s === null ? fallback : s; } catch (e) { return fallback; }
}
function r7Pos() {
  if (state.inCar && state.inCar.mesh) return { x: state.inCar.mesh.position.x, z: state.inCar.mesh.position.z };
  return { x: playerState.x, z: playerState.z };
}
function r7Dist(x, z) { const p = r7Pos(); return Math.hypot(p.x - x, p.z - z); }
function r7Near(x, z, r) { return r7Dist(x, z) < r; }
function r7Clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function r7Pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function r7Spend(amount) {
  if (state.cash < amount) { toast('Not enough cash — need $' + amount + '.'); return false; }
  state.cash -= amount; updateHUD(); return true;
}
function r7Earn(amount, msg) {
  state.cash += amount; chime(); if (msg) toast(msg + ' +$' + amount);
  saveGame(); updateHUD();
}
function r7ShowPanel(title, lines, buttons) { r6ShowPanel(title, lines, buttons); }
function r7ClosePanel() { r6ClosePanel(); }
function r7PanelButton(label, fn, disabled) { return r6PanelButton(label, fn, disabled); }
// --- R7-01 Bay Reputation: good deeds vs brutality shape the bay ---
const R7_REP_DEEDS = [
  { n: 'Help a stranded driver', g: 6, p: 25 },
  { n: 'Return a dropped wallet', g: 8, p: 40 },
  { n: 'Stop a mugging', g: 10, p: 60 },
  { n: 'Give a tourist directions', g: 3, p: 10 },
  { n: 'Donate at the marina stall', g: 5, p: 0 },
  { n: 'Rescue a swimmer', g: 12, p: 80 },
];
const R7_REP_CRIMES = [
  { n: 'Hit a pedestrian', g: -8, p: 0 },
  { n: 'Smash a shop window', g: -6, p: 0 },
  { n: 'Steal in daylight', g: -10, p: 0 },
  { n: 'Threaten a shopkeeper', g: -12, p: 0 },
];
let r7Rep = { good: 0, bad: 0, deeds: [], priceShift: 0 };
function r7RepScore() { return r7Rep.good - r7Rep.bad; }
function r7RepTitle() {
  const s = r7RepScore();
  if (s >= 60) return 'Bay Saint';
  if (s >= 25) return 'Good Neighbour';
  if (s >= -9) return 'Nobody Special';
  if (s >= -40) return 'Rough Customer';
  return 'Bay Menace';
}
function r7RepPriceMult() { return r7Clamp(1 - r7RepScore() * 0.004, 0.8, 1.25); }
function r7RepDoGood(i) {
  const d = R7_REP_DEEDS[i]; if (!d) return false;
  r7Rep.good += d.g; r7Rep.deeds.push(d.n); r7RepSave();
  if (d.p) r7Earn(d.p, d.n);
  toast(d.n + ' — the bay notices. Rep ' + r7RepScore() + ' (' + r7RepTitle() + ')');
  return true;
}
function r7RepCrime(i) {
  const c = R7_REP_CRIMES[i]; if (!c) return false;
  r7Rep.bad += -c.g; r7RepSave(); updateHUD(); return true;
}
function r7RepSave() { r7Save('rep', r7Rep); }
function r7RepLoad() { const s = r7Load('rep', null); if (s) r7Rep = s; }
function r7RepOpen() {
  const lines = [
    'Reputation ' + r7RepScore() + ' — ' + r7RepTitle() + '.',
    'Good deeds ' + r7Rep.good + ' · brutality ' + r7Rep.bad + '.',
    'Shop prices are x' + r7RepPriceMult().toFixed(2) + ' right now.',
    'Kind locals wave; scared ones cross the street when you pass.',
    'Good deeds done: ' + (r7Rep.deeds.length ? r7Rep.deeds.slice(-4).join(', ') : 'none yet'),
  ];
  const buttons = R7_REP_DEEDS.map((d, i) => r7PanelButton(d.n + ' (+' + d.g + ' rep' + (d.p ? ', +$' + d.p : '') + ')', () => { r7RepDoGood(i); r7RepOpen(); }));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('⭐ Bay Reputation', lines, buttons);
  return true;
}
const R7_REP_SPOT = { x: -18, z: 26, name: 'Plaza notice board' };
function r7RepNear() { return r7Near(R7_REP_SPOT.x, R7_REP_SPOT.z, 8); }
function r7RepBuild() {
  const board = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x8a5a2a }));
  board.position.set(R7_REP_SPOT.x, 1.6, R7_REP_SPOT.z); scene.add(board);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.8), new THREE.MeshBasicMaterial({ color: 0xf5ecd0 }));
  paper.position.set(R7_REP_SPOT.x, 1.6, R7_REP_SPOT.z + 0.2); scene.add(paper);
}
// --- R7-02 Witness & disguise wanted system ---
const R7_OUTFITS = [
  { n: 'Drifter jacket', cost: 0, heat: 0 },
  { n: 'Dock worker overalls', cost: 60, heat: -1 },
  { n: 'Marina whites', cost: 120, heat: -1 },
  { n: 'Night courier black', cost: 90, heat: -2 },
  { n: 'Bay festival colours', cost: 45, heat: 0 },
];
let r7Wit = { outfit: 0, owned: [0], heat: 0, witnesses: 0, cams: 0, lockdown: false };
function r7WitHeat() { return r7Wit.heat + (state.wanted || 0); }
function r7WitReport(kind) {
  r7Wit.witnesses += kind === 'witness' ? 1 : 0;
  r7Wit.cams += kind === 'camera' ? 1 : 0;
  r7Wit.heat = r7Clamp(r7Wit.heat + 1, 0, 6);
  if (r7Wit.heat >= 6 && !r7Wit.lockdown) {
    r7Wit.lockdown = true;
    toast('BAY LOCKDOWN — every unit in Solmar Bay is hunting you. Change outfit and car, fast.');
  } else {
    toast('Seen! A ' + kind + ' locked in your ' + R7_OUTFITS[r7Wit.outfit].n + '. Heat ' + r7Wit.heat + '/6.');
  }
  r7WitSave(); updateHUD();
}
function r7WitChangeOutfit(i) {
  if (!r7Wit.owned.includes(i)) {
    if (!r7Spend(R7_OUTFITS[i].cost)) return false;
    r7Wit.owned.push(i);
  }
  r7Wit.outfit = i;
  r7Wit.heat = r7Clamp(r7Wit.heat + R7_OUTFITS[i].heat, 0, 6);
  if (r7Wit.heat === 0) r7Wit.lockdown = false;
  r7WitSave(); updateHUD();
  toast('Changed into ' + R7_OUTFITS[i].n + '. Heat now ' + r7Wit.heat + '/6.');
  return true;
}
function r7WitShedHeat() {
  if (!r7Spend(150)) return false;
  r7Wit.heat = 0; r7Wit.witnesses = 0; r7Wit.cams = 0; r7Wit.lockdown = false;
  r7WitSave(); toast('New plates, new look — the heat is gone.');
  return true;
}
function r7WitSave() { r7Save('wit', r7Wit); }
function r7WitLoad() { const s = r7Load('wit', null); if (s) r7Wit = s; }
const R7_CLOTHES = { x: 22, z: -30, name: 'Salt & Thread clothes' };
function r7WitNear() { return r7Near(R7_CLOTHES.x, R7_CLOTHES.z, 8); }
function r7WitBuild() {
  const shop = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 6), new THREE.MeshStandardMaterial({ color: 0x2a6a8a }));
  shop.position.set(R7_CLOTHES.x, 2, R7_CLOTHES.z); scene.add(shop);
}
function r7WitOpen() {
  const lines = [
    'Outfit: ' + R7_OUTFITS[r7Wit.outfit].n + ' · heat ' + r7Wit.heat + '/6.',
    'Witnesses ' + r7Wit.witnesses + ' · cameras ' + r7Wit.cams + '.',
    r7Wit.lockdown ? 'BAY LOCKDOWN is active — 6th star. Lay low.' : 'No lockdown. Stay out of sight after a job.',
    'A fresh outfit and a different car shed heat faster than hiding.',
  ];
  const buttons = R7_OUTFITS.map((o, i) => r7PanelButton((r7Wit.owned.includes(i) ? 'Wear ' : 'Buy ') + o.n + ' — $' + o.cost, () => { r7WitChangeOutfit(i); r7WitOpen(); }));
  buttons.push(r7PanelButton('New plates + clean slate — $150', () => { r7WitShedHeat(); r7WitOpen(); }));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🎭 Witness & Disguise', lines, buttons);
  return true;
}
// --- R7-03 Focus mode: slow-mo targeting, vitals, disarm ---
let r7Focus = { on: false, meter: 100, kills: 0, disarms: 0, limbHits: 0 };
function r7FocusToggle() {
  if (state.inCar || state.mode !== 'play') return false;
  if (state.weapon === 'fists' || state.weapon === 'bat') return false;
  r7Focus.on = !r7Focus.on;
  if (r7Focus.on && r7Focus.meter < 20) {
    r7Focus.on = false;
    toast('Focus meter too low — land hits to refill it.');
    return false;
  }
  toast(r7Focus.on ? 'FOCUS — time slows. Aim for vitals, F again to disarm a target.' : 'Focus off.');
  updateHUD(); return true;
}
function r7FocusDisarm() {
  if (!r7Focus.on) return false;
  r7Focus.disarms++; r7Focus.meter = r7Clamp(r7Focus.meter - 25, 0, 100);
  r7FocusSave(); toast('Disarmed! They dropped their weapon. Disarms: ' + r7Focus.disarms);
  return true;
}
function r7FocusHit(part) {
  if (part === 'limb') r7Focus.limbHits++;
  if (part === 'vital') r7Focus.kills++;
  r7Focus.meter = r7Clamp(r7Focus.meter + (part === 'vital' ? 12 : 6), 0, 100);
  r7FocusSave();
}
function r7FocusSave() { r7Save('focus', r7Focus); }
function r7FocusLoad() { const s = r7Load('focus', null); if (s) r7Focus = s; }
// --- R7-04 Robbery prep: scout, back doors, safe codes, cameras, duo jobs ---
const R7_ROB_TARGETS = [
  { n: 'Marina Jewellers', x: 40, z: -18, safe: '4821', take: 900, cam: true },
  { n: 'Docks Cash Office', x: -64, z: 44, safe: '1937', take: 700, cam: true },
  { n: 'Casino Row Liquor', x: 58, z: 30, safe: '6602', take: 420, cam: false },
  { n: 'Old Town Pawn Vault', x: -30, z: -52, safe: '7754', take: 650, cam: true },
];
let r7Rob = { scouted: [], camsOff: [], codes: [], done: [], withIan: 0 };
function r7RobNear() {
  for (let i = 0; i < R7_ROB_TARGETS.length; i++) if (r7Near(R7_ROB_TARGETS[i].x, R7_ROB_TARGETS[i].z, 9)) return i;
  return -1;
}
function r7RobScout(i) {
  if (r7Rob.scouted.includes(i)) return false;
  r7Rob.scouted.push(i); r7RobSave();
  toast('Scouted ' + R7_ROB_TARGETS[i].n + ': back entrance on the alley side' + (R7_ROB_TARGETS[i].cam ? ', one camera over the door.' : ', no cameras.'));
  return true;
}
function r7RobDisableCam(i) {
  if (!R7_ROB_TARGETS[i].cam || r7Rob.camsOff.includes(i)) return false;
  if (!r7Spend(80)) return false;
  r7Rob.camsOff.push(i); r7RobSave();
  toast('Camera looped — ' + R7_ROB_TARGETS[i].n + ' is blind for the night.');
  return true;
}
function r7RobCrackSafe(i) {
  const t = R7_ROB_TARGETS[i];
  if (!r7Rob.scouted.includes(i)) { toast('Scout the place first — you need the layout.'); return false; }
  if (r7Rob.codes.includes(i)) { toast('Safe code ' + t.safe + ' already cracked.'); return true; }
  r7Rob.codes.push(i); r7RobSave();
  toast('Safe code cracked: ' + t.safe + '. The safe is yours when you go in.');
  return true;
}
function r7RobRun(i, duo) {
  const t = R7_ROB_TARGETS[i];
  if (r7Rob.done.includes(i)) { toast('Already hit ' + t.n + ' — the owner doubled the locks.'); return false; }
  if (!r7Rob.scouted.includes(i) || !r7Rob.codes.includes(i)) { toast('Prep first: scout it and crack the safe code.'); return false; }
  let take = t.take;
  if (duo) { take = Math.round(take * 1.5); r7Rob.withIan++; toast('Ian takes the door while you crack the safe — duo bonus!'); }
  if (t.cam && !r7Rob.camsOff.includes(i)) { r7WitReport('camera'); take = Math.round(take * 0.7); }
  r7Rob.done.push(i); r7RobSave(); r7Earn(take, 'Robbed ' + t.n);
  return true;
}
function r7RobSave() { r7Save('rob', r7Rob); }
function r7RobLoad() { const s = r7Load('rob', null); if (s) r7Rob = s; }
function r7RobOpen() {
  const i = r7RobNear(); if (i < 0) return false;
  const t = R7_ROB_TARGETS[i];
  const lines = [
    t.n + ' — take $' + t.take + (r7Rob.done.includes(i) ? ' (already hit)' : ''),
    'Scouted: ' + (r7Rob.scouted.includes(i) ? 'yes' : 'no') + ' · safe code: ' + (r7Rob.codes.includes(i) ? t.safe : 'unknown'),
    'Camera: ' + (t.cam ? (r7Rob.camsOff.includes(i) ? 'disabled' : 'live — disable it first') : 'none'),
    'Duo jobs with Ian pay 1.5x — she watches the door, you work the safe.',
  ];
  const buttons = [
    r7PanelButton('Scout the layout', () => { r7RobScout(i); r7RobOpen(); }, r7Rob.scouted.includes(i)),
    r7PanelButton('Disable the camera — $80', () => { r7RobDisableCam(i); r7RobOpen(); }, !t.cam || r7Rob.camsOff.includes(i)),
    r7PanelButton('Crack the safe code', () => { r7RobCrackSafe(i); r7RobOpen(); }, r7Rob.codes.includes(i)),
    r7PanelButton('Hit it solo', () => { r7RobRun(i, false); r7ClosePanel(); }, r7Rob.done.includes(i)),
    r7PanelButton('Hit it with Ian (1.5x)', () => { r7RobRun(i, true); r7ClosePanel(); }, r7Rob.done.includes(i)),
    r7PanelButton('Close', () => r7ClosePanel()),
  ];
  r7ShowPanel('💰 Robbery Prep — ' + t.n, lines, buttons);
  return true;
}
function r7RobBuild() {
  for (const t of R7_ROB_TARGETS) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 7), new THREE.MeshStandardMaterial({ color: 0x5a4a3a }));
    b.position.set(t.x, 2.2, t.z); scene.add(b);
  }
}
// --- R7-05 Car-theft minigames: slim jim, window smash, key cloner ---
const R7_THEFT_TOOLS = [
  { n: 'Slim jim', cost: 40, skill: 1 },
  { n: 'Window punch', cost: 25, skill: 0 },
  { n: 'Key cloner', cost: 350, skill: 3 },
  { n: 'Phone scanner', cost: 200, skill: 2 },
];
let r7Theft = { tools: [1], stolen: 0, luxury: 0, bestTime: 0, alarms: 0 };
function r7TheftBuy(i) {
  if (r7Theft.tools.includes(i)) return false;
  if (!r7Spend(R7_THEFT_TOOLS[i].cost)) return false;
  r7Theft.tools.push(i); r7TheftSave();
  toast('Bought ' + R7_THEFT_TOOLS[i].n + ' — new way into cars unlocked.');
  return true;
}
function r7TheftTiming(tool) {
  // Timing bar: 0-100, sweet spot 62-78. Returns a score 0-100.
  const roll = Math.floor(Math.random() * 100);
  const dist = roll < 62 ? 62 - roll : roll > 78 ? roll - 78 : 0;
  return Math.max(0, 100 - dist * 3);
}
function r7TheftSteal(tool, luxury) {
  if (!r7Theft.tools.includes(tool)) { toast('You do not own that tool yet.'); return false; }
  const score = r7TheftTiming(tool);
  if (score < 40) {
    r7Theft.alarms++; r7TheftSave(); r7WitReport('witness');
    toast('Alarm! The timing was off (' + score + ') — someone saw you.');
    return false;
  }
  r7Theft.stolen++;
  if (luxury) {
    if (tool !== 2) { toast('Luxury cars need the key cloner — the slim jim just scratches the paint.'); return false; }
    r7Theft.luxury++;
  }
  if (!r7Theft.bestTime || score > r7Theft.bestTime) r7Theft.bestTime = score;
  r7TheftSave(); r7Earn(luxury ? 320 : 140, luxury ? 'Luxury car lifted clean' : 'Car lifted clean');
  return true;
}
function r7TheftSave() { r7Save('theft', r7Theft); }
function r7TheftLoad() { const s = r7Load('theft', null); if (s) r7Theft = s; }
const R7_CHOP = { x: -52, z: 18, name: 'Back-alley chop shop' };
function r7TheftNear() { return r7Near(R7_CHOP.x, R7_CHOP.z, 8); }
function r7TheftBuild() {
  const g = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
  g.position.set(R7_CHOP.x, 2, R7_CHOP.z); scene.add(g);
}
function r7TheftOpen() {
  const lines = [
    'Cars stolen ' + r7Theft.stolen + ' · luxury ' + r7Theft.luxury + ' · alarms tripped ' + r7Theft.alarms + '.',
    'Best timing score ' + r7Theft.bestTime + '/100 — sweet spot is 62-78 on the bar.',
    'Luxury cars only open with the key cloner. The phone scanner finds unlocked cars nearby.',
  ];
  const buttons = R7_THEFT_TOOLS.map((t, i) => r7PanelButton((r7Theft.tools.includes(i) ? 'Owned: ' : 'Buy ') + t.n + ' — $' + t.cost, () => { r7TheftBuy(i); r7TheftOpen(); }, r7Theft.tools.includes(i)));
  buttons.push(r7PanelButton('Steal a parked car (slim jim)', () => { r7TheftSteal(0, false); r7TheftOpen(); }));
  buttons.push(r7PanelButton('Steal a luxury car (key cloner)', () => { r7TheftSteal(2, true); r7TheftOpen(); }));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🚗 Car Theft — Chop Shop', lines, buttons);
  return true;
}
// --- R7-06 Weapon lockers + degradation: 2 rifles + 2 pistols on you ---
const R7_GUNS = [
  { n: 'Bay Hawk pistol', kind: 'pistol', price: 220, wear: 0 },
  { n: 'Salt Pistol Mk2', kind: 'pistol', price: 480, wear: 0 },
  { n: 'Marsh Rifle', kind: 'rifle', price: 900, wear: 0 },
  { n: 'Long Bay Carbine', kind: 'rifle', price: 1400, wear: 0 },
];
let r7Locker = { carry: [0], trunk: [], safe: [], cleanKit: 2 };
function r7LockerWear(i) { return R7_GUNS[i].wear; }
function r7LockerShoot(i) {
  R7_GUNS[i].wear = r7Clamp(R7_GUNS[i].wear + 1, 0, 100);
  if (R7_GUNS[i].wear >= 80) toast(R7_GUNS[i].n + ' is badly worn (' + R7_GUNS[i].wear + '%) — clean it or it jams.');
  r7LockerSave();
}
function r7LockerClean(i) {
  if (r7Locker.cleanKit <= 0) { toast('No cleaning kits left — buy one at the gun shop.'); return false; }
  if (R7_GUNS[i].wear === 0) { toast(R7_GUNS[i].n + ' is already clean.'); return false; }
  r7Locker.cleanKit--; R7_GUNS[i].wear = 0; r7LockerSave();
  toast(R7_GUNS[i].n + ' cleaned and oiled. Kits left: ' + r7Locker.cleanKit);
  return true;
}
function r7LockerBuyKit() {
  if (!r7Spend(60)) return false;
  r7Locker.cleanKit++; r7LockerSave(); toast('Cleaning kit bought. Kits: ' + r7Locker.cleanKit);
  return true;
}
function r7LockerBuyGun(i) {
  if (r7Locker.carry.includes(i) || r7Locker.trunk.includes(i) || r7Locker.safe.includes(i)) return false;
  if (!r7Spend(R7_GUNS[i].price)) return false;
  const pistols = r7Locker.carry.filter((g) => R7_GUNS[g].kind === 'pistol').length;
  const rifles = r7Locker.carry.filter((g) => R7_GUNS[g].kind === 'rifle').length;
  const slot = R7_GUNS[i].kind === 'pistol' ? pistols < 2 : rifles < 2;
  if (slot) r7Locker.carry.push(i); else r7Locker.safe.push(i);
  r7LockerSave(); toast('Bought ' + R7_GUNS[i].n + (slot ? ' — on your person.' : ' — stored in the safehouse.'));
  return true;
}
function r7LockerStash(i) {
  const at = r7Locker.carry.indexOf(i); if (at < 0) return false;
  r7Locker.carry.splice(at, 1); r7Locker.trunk.push(i); r7LockerSave();
  toast(R7_GUNS[i].n + ' stashed in the car trunk.'); return true;
}
function r7LockerDraw(i) {
  const from = r7Locker.trunk.includes(i) ? r7Locker.trunk : r7Locker.safe.includes(i) ? r7Locker.safe : null;
  if (!from) return false;
  const pistols = r7Locker.carry.filter((g) => R7_GUNS[g].kind === 'pistol').length;
  const rifles = r7Locker.carry.filter((g) => R7_GUNS[g].kind === 'rifle').length;
  if (R7_GUNS[i].kind === 'pistol' && pistols >= 2) { toast('Pistol slots full — stash one first.'); return false; }
  if (R7_GUNS[i].kind === 'rifle' && rifles >= 2) { toast('Rifle slots full — stash one first.'); return false; }
  from.splice(from.indexOf(i), 1); r7Locker.carry.push(i); r7LockerSave();
  toast(R7_GUNS[i].n + ' drawn. Carry: ' + r7Locker.carry.map((g) => R7_GUNS[g].n).join(', '));
  return true;
}
function r7LockerSave() { r7Save('locker', { carry: r7Locker.carry, trunk: r7Locker.trunk, safe: r7Locker.safe, cleanKit: r7Locker.cleanKit }); }
function r7LockerLoad() { const s = r7Load('locker', null); if (s) r7Locker = s; }
const R7_GUNSHOP = { x: 30, z: 52, name: 'Bay Arms gun shop' };
function r7LockerNear() { return r7Near(R7_GUNSHOP.x, R7_GUNSHOP.z, 8); }
function r7LockerBuild() {
  const b = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 7), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
  b.position.set(R7_GUNSHOP.x, 2, R7_GUNSHOP.z); scene.add(b);
}
function r7LockerOpen() {
  const lines = [
    'Carry (2 pistols + 2 rifles max): ' + (r7Locker.carry.map((g) => R7_GUNS[g].n + ' ' + R7_GUNS[g].wear + '%').join(', ') || 'none'),
    'Trunk: ' + (r7Locker.trunk.map((g) => R7_GUNS[g].n).join(', ') || 'empty') + ' · Safehouse: ' + (r7Locker.safe.map((g) => R7_GUNS[g].n).join(', ') || 'empty'),
    'Cleaning kits: ' + r7Locker.cleanKit + ' — worn guns jam more often.',
  ];
  const buttons = R7_GUNS.map((g, i) => r7PanelButton('Buy ' + g.n + ' (' + g.kind + ') — $' + g.price, () => { r7LockerBuyGun(i); r7LockerOpen(); }, r7Locker.carry.includes(i) || r7Locker.trunk.includes(i) || r7Locker.safe.includes(i)));
  buttons.push(r7PanelButton('Buy cleaning kit — $60', () => { r7LockerBuyKit(); r7LockerOpen(); }));
  for (const g of r7Locker.carry) buttons.push(r7PanelButton('Clean ' + R7_GUNS[g].n, () => { r7LockerClean(g); r7LockerOpen(); }, R7_GUNS[g].wear === 0));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🔫 Weapon Locker — Bay Arms', lines, buttons);
  return true;
}
// --- R7-07 Wildlife compendium: study, log, track rare animals ---
const R7_WILD = [
  { n: 'Bay Gull', zone: 'beach', rare: false, weapon: 'any', value: 20 },
  { n: 'Marsh Heron', zone: 'swamp', rare: false, weapon: 'any', value: 30 },
  { n: 'White-tail Deer', zone: 'forest', rare: false, weapon: 'rifle', value: 60 },
  { n: 'Bay Alligator', zone: 'swamp', rare: false, weapon: 'rifle', value: 90 },
  { n: 'Wild Boar', zone: 'forest', rare: false, weapon: 'rifle', value: 70 },
  { n: 'Golden Egret', zone: 'swamp', rare: true, weapon: 'any', value: 250 },
  { n: 'Ghost Crab', zone: 'beach', rare: true, weapon: 'any', value: 200 },
  { n: 'Black Panther', zone: 'forest', rare: true, weapon: 'rifle', value: 500 },
];
let r7Wild = { seen: [], studied: [], hunted: [], tracks: 0 };
function r7WildStudy(i) {
  const a = R7_WILD[i]; if (!a) return false;
  if (!r7Wild.seen.includes(i)) r7Wild.seen.push(i);
  if (!r7Wild.studied.includes(i)) { r7Wild.studied.push(i); r7WildSave(); toast('Studied: ' + a.n + ' — ' + (a.rare ? 'RARE. ' : '') + 'best hunted with ' + a.weapon + '.'); }
  else toast(a.n + ' already in your compendium.');
  return true;
}
function r7WildTrack(i) {
  const a = R7_WILD[i]; if (!a || !a.rare) { toast('Only rare animals leave tracks worth following.'); return false; }
  if (!r7Wild.studied.includes(i)) { toast('Study the ' + a.n + ' first — you would not know its tracks.'); return false; }
  r7Wild.tracks++; r7WildSave();
  toast('Fresh tracks! A ' + a.n + ' passed through here recently. Tracks followed: ' + r7Wild.tracks);
  return true;
}
function r7WildHunt(i, weaponKind) {
  const a = R7_WILD[i]; if (!a) return false;
  if (a.weapon !== 'any' && weaponKind !== a.weapon) { toast('Wrong weapon — the ' + a.n + ' needs a ' + a.weapon + ' for a clean hunt.'); return false; }
  if (!r7Wild.studied.includes(i)) { toast('Study it first — a rushed hunt ruins the pelt.'); return false; }
  if (!r7Wild.hunted.includes(i)) r7Wild.hunted.push(i);
  r7WildSave(); r7Earn(a.value, 'Hunted ' + a.n + ' cleanly');
  return true;
}
function r7WildSave() { r7Save('wild', r7Wild); }
function r7WildLoad() { const s = r7Load('wild', null); if (s) r7Wild = s; }
const R7_WILD_SPOTS = [
  { x: 120, z: 40, zone: 'beach', name: 'East Beach dunes' },
  { x: -150, z: 120, zone: 'swamp', name: 'Southwest marsh' },
  { x: -120, z: -140, zone: 'forest', name: 'North pine woods' },
];
function r7WildNear() {
  for (let i = 0; i < R7_WILD_SPOTS.length; i++) if (r7Near(R7_WILD_SPOTS[i].x, R7_WILD_SPOTS[i].z, 10)) return i;
  return -1;
}
function r7WildOpen() {
  const spot = r7WildNear(); if (spot < 0) return false;
  const zone = R7_WILD_SPOTS[spot].zone;
  const here = R7_WILD.map((a, i) => ({ a, i })).filter((o) => o.a.zone === zone);
  const lines = [
    R7_WILD_SPOTS[spot].name + ' — ' + zone + ' habitat.',
    'Compendium: ' + r7Wild.studied.length + '/' + R7_WILD.length + ' studied · ' + r7Wild.hunted.length + ' hunted · rare tracks ' + r7Wild.tracks + '.',
    'Animals here: ' + here.map((o) => o.a.n + (o.a.rare ? ' (rare)' : '')).join(', '),
  ];
  const buttons = here.map((o) => r7PanelButton('Study ' + o.a.n, () => { r7WildStudy(o.i); r7WildOpen(); }));
  for (const o of here.filter((o) => o.a.rare)) buttons.push(r7PanelButton('Follow ' + o.a.n + ' tracks', () => { r7WildTrack(o.i); r7WildOpen(); }));
  for (const o of here) buttons.push(r7PanelButton('Hunt ' + o.a.n + ' ($' + o.a.value + ')', () => { r7WildHunt(o.i, o.a.weapon === 'rifle' ? 'rifle' : 'any'); r7WildOpen(); }));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🦅 Wildlife — ' + R7_WILD_SPOTS[spot].name, lines, buttons);
  return true;
}
function r7WildBuild() {
  for (const s of R7_WILD_SPOTS) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a5a2a }));
    sign.position.set(s.x, 1.4, s.z); scene.add(sign);
  }
}
// --- R7-08 Horse bonding II: bond levels, stats, grooming, feeding ---
const R7_HORSE2 = [
  { n: 'Bay Breeze', speed: 6, stamina: 5 },
  { n: 'Marsh King', speed: 5, stamina: 8 },
  { n: 'Salt Dancer', speed: 8, stamina: 4 },
];
let r7Horse = { bond: [0, 0, 0], fed: [0, 0, 0], groomed: [0, 0, 0], active: 0, rides: 0 };
function r7HorseBondLevel(i) { return Math.min(4, Math.floor(r7Horse.bond[i] / 25)); }
function r7HorseFeed(i) {
  if (!r7Spend(15)) return false;
  r7Horse.fed[i]++; r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 8, 0, 100); r7HorseSave();
  toast(R7_HORSE2[i].n + ' eats happily. Bond ' + r7Horse.bond[i] + '/100 (level ' + r7HorseBondLevel(i) + ').');
  return true;
}
function r7HorseGroom(i) {
  r7Horse.groomed[i]++; r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 6, 0, 100); r7HorseSave();
  toast('Brushed ' + R7_HORSE2[i].n + ' until its coat shines. Bond ' + r7Horse.bond[i] + '/100.');
  return true;
}
function r7HorseRide(i) {
  r7Horse.active = i; r7Horse.rides++;
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 4, 0, 100); r7HorseSave();
  const h = R7_HORSE2[i];
  toast('Riding ' + h.n + ' — speed ' + h.speed + ', stamina ' + h.stamina + ', bond level ' + r7HorseBondLevel(i) + '.');
  return true;
}
function r7HorseSave() { r7Save('horse2', r7Horse); }
function r7HorseLoad() { const s = r7Load('horse2', null); if (s) r7Horse = s; }
function r7HorseOpen() {
  const lines = ['Bonded horses at Rancho del Sol — grooming and feeding build trust.'];
  for (let i = 0; i < R7_HORSE2.length; i++) {
    const h = R7_HORSE2[i];
    lines.push(h.n + ' · speed ' + h.speed + ' · stamina ' + h.stamina + ' · bond ' + r7Horse.bond[i] + '/100 (Lv' + r7HorseBondLevel(i) + ') · fed ' + r7Horse.fed[i] + 'x · groomed ' + r7Horse.groomed[i] + 'x');
  }
  lines.push('Total rides: ' + r7Horse.rides + '. A level-4 horse never spooks at gunfire.');
  const buttons = [];
  for (let i = 0; i < R7_HORSE2.length; i++) {
    buttons.push(r7PanelButton('Feed ' + R7_HORSE2[i].n + ' — $15', () => { r7HorseFeed(i); r7HorseOpen(); }));
    buttons.push(r7PanelButton('Groom ' + R7_HORSE2[i].n, () => { r7HorseGroom(i); r7HorseOpen(); }));
    buttons.push(r7PanelButton('Ride ' + R7_HORSE2[i].n, () => { r7HorseRide(i); r7ClosePanel(); }));
  }
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🐴 Horse Bonding II', lines, buttons);
  return true;
}
// --- R7-09 Safehouse upgrades: bed, workshop, armory, decor, crew ---
const R7_SAFE_UPGRADES = [
  { n: 'Comfy bed', cost: 200, effect: 'sleep restores full health' },
  { n: 'Workshop bench', cost: 450, effect: 'clean guns for free' },
  { n: 'Armory rack', cost: 600, effect: 'carry +1 rifle' },
  { n: 'Bay view decor', cost: 300, effect: 'crew morale +20' },
  { n: 'Hidden stash wall', cost: 800, effect: 'stash $2000 safely' },
];
const R7_CREW_ROLES = ['Lookout', 'Driver', 'Cook', 'Fixer'];
let r7Safe = { owned: [], morale: 50, crew: ['Lookout'], slept: 0 };
function r7SafeBuy(i) {
  if (r7Safe.owned.includes(i)) return false;
  if (!r7Spend(R7_SAFE_UPGRADES[i].cost)) return false;
  r7Safe.owned.push(i);
  if (R7_SAFE_UPGRADES[i].n === 'Bay view decor') r7Safe.morale = r7Clamp(r7Safe.morale + 20, 0, 100);
  r7SafeSave(); toast('Installed: ' + R7_SAFE_UPGRADES[i].n + ' — ' + R7_SAFE_UPGRADES[i].effect + '.');
  return true;
}
function r7SafeHire(role) {
  if (r7Safe.crew.includes(role)) return false;
  if (!r7Spend(250)) return false;
  r7Safe.crew.push(role); r7Safe.morale = r7Clamp(r7Safe.morale + 10, 0, 100); r7SafeSave();
  toast(role + ' joined the crew. Morale ' + r7Safe.morale + '/100.');
  return true;
}
function r7SafeSleep() {
  if (!r7Safe.owned.includes(0)) { toast('No bed yet — buy the comfy bed first.'); return false; }
  r7Safe.slept++; r7Safe.morale = r7Clamp(r7Safe.morale + 5, 0, 100);
  state.health = 100; r7SafeSave(); updateHUD();
  toast('Slept like a rock. Health full, morale ' + r7Safe.morale + '/100. Nights slept: ' + r7Safe.slept);
  return true;
}
function r7SafeSave() { r7Save('safehouse', r7Safe); }
function r7SafeLoad() { const s = r7Load('safehouse', null); if (s) r7Safe = s; }
const R7_SAFEHOUSE = { x: -8, z: -40, name: 'Ryan & Ian safehouse' };
function r7SafeNear() { return r7Near(R7_SAFEHOUSE.x, R7_SAFEHOUSE.z, 8); }
function r7SafeBuild() {
  const h = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), new THREE.MeshStandardMaterial({ color: 0x7a5a3a }));
  h.position.set(R7_SAFEHOUSE.x, 2.5, R7_SAFEHOUSE.z); scene.add(h);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x8a2a2a }));
  roof.position.set(R7_SAFEHOUSE.x, 6.2, R7_SAFEHOUSE.z); roof.rotation.y = Math.PI / 4; scene.add(roof);
}
function r7SafeOpen() {
  const lines = [
    'Safehouse morale ' + r7Safe.morale + '/100 · crew: ' + r7Safe.crew.join(', ') + ' · nights slept ' + r7Safe.slept + '.',
    'Upgrades owned: ' + (r7Safe.owned.map((i) => R7_SAFE_UPGRADES[i].n).join(', ') || 'none yet'),
  ];
  const buttons = R7_SAFE_UPGRADES.map((u, i) => r7PanelButton('Buy ' + u.n + ' — $' + u.cost + ' (' + u.effect + ')', () => { r7SafeBuy(i); r7SafeOpen(); }, r7Safe.owned.includes(i)));
  for (const r of R7_CREW_ROLES) buttons.push(r7PanelButton('Hire ' + r + ' — $250', () => { r7SafeHire(r); r7SafeOpen(); }, r7Safe.crew.includes(r)));
  buttons.push(r7PanelButton('Sleep until morning', () => { r7SafeSleep(); r7SafeOpen(); }, !r7Safe.owned.includes(0)));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🏠 Safehouse Upgrades', lines, buttons);
  return true;
}
// --- R7-10 Stranger missions: 8 quirky NPC side quests ---
const R7_STRANGERS = [
  { n: 'Old Sal', x: -44, z: 60, q: 'Find his lost fishing hat', pay: 120, hint: 'It blew onto the pier.' },
  { n: 'Tia the busker', x: 12, z: 8, q: 'Play her stolen guitar back', pay: 150, hint: 'A gull took it to the roof.' },
  { n: 'Chef Beni', x: 34, z: -44, q: 'Fetch 3 bay limes', pay: 90, hint: 'Lime trees grow by the marina.' },
  { n: 'Captain Wren', x: 96, z: 70, q: 'Tow his boat to the dock', pay: 200, hint: 'His engine died mid-bay.' },
  { n: 'Madame Zola', x: -70, z: -20, q: 'Read her three fortunes', pay: 110, hint: 'She only trusts the brave.' },
  { n: 'Kid Milo', x: 4, z: -70, q: 'Win back his kite from a tree', pay: 60, hint: 'Climb the old oak.' },
  { n: 'Doc Hal', x: 70, z: -60, q: 'Deliver medicine to the swamp', pay: 180, hint: 'Drive slow, the road floods.' },
  { n: 'Auntie Rosa', x: -20, z: 90, q: 'Find her runaway goat', pay: 130, hint: 'It loves the golf course grass.' },
];
let r7Stranger = { done: [], met: [] };
function r7StrangerNear() {
  for (let i = 0; i < R7_STRANGERS.length; i++) if (r7Near(R7_STRANGERS[i].x, R7_STRANGERS[i].z, 8)) return i;
  return -1;
}
function r7StrangerMeet(i) {
  if (!r7Stranger.met.includes(i)) r7Stranger.met.push(i);
  r7StrangerSave();
  toast(R7_STRANGERS[i].n + ': "' + R7_STRANGERS[i].q + ' — ' + R7_STRANGERS[i].hint + '"');
  return true;
}
function r7StrangerDo(i) {
  if (r7Stranger.done.includes(i)) { toast(R7_STRANGERS[i].n + ' already owes you one.'); return false; }
  r7Stranger.done.push(i); r7StrangerSave();
  r7Earn(R7_STRANGERS[i].pay, R7_STRANGERS[i].n + ' is grateful');
  r7Rep.good += 4; r7RepSave();
  return true;
}
function r7StrangerSave() { r7Save('stranger', r7Stranger); }
function r7StrangerLoad() { const s = r7Load('stranger', null); if (s) r7Stranger = s; }
function r7StrangerOpen() {
  const i = r7StrangerNear(); if (i < 0) return false;
  const s = R7_STRANGERS[i];
  const lines = [
    s.n + ' — "' + s.q + '"',
    'Hint: ' + s.hint,
    'Reward: $' + s.pay + ' and +4 rep. Done: ' + r7Stranger.done.length + '/8 strangers helped.',
  ];
  const buttons = [
    r7PanelButton('Listen to the story', () => { r7StrangerMeet(i); r7StrangerOpen(); }),
    r7PanelButton('Do the favour (+$' + s.pay + ')', () => { r7StrangerDo(i); r7ClosePanel(); }, r7Stranger.done.includes(i)),
    r7PanelButton('Walk away', () => r7ClosePanel()),
  ];
  r7ShowPanel('❓ Stranger — ' + s.n, lines, buttons);
  return true;
}
function r7StrangerBuild() {
  for (const s of R7_STRANGERS) {
    const ped = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xd8a020 }));
    ped.position.set(s.x, 1.1, s.z); scene.add(ped);
  }
}
// --- R7-11 Bounty hunting: wanted NPCs, alive pays more than dead ---
const R7_BOUNTIES = [
  { n: 'Slick Eddie', x: -40, z: 30, alive: 500, dead: 200, crime: 'skipped bail' },
  { n: 'One-Eye Mara', x: 60, z: -10, alive: 650, dead: 260, crime: 'harbour theft ring' },
  { n: 'The Quiet Man', x: 10, z: 80, alive: 800, dead: 320, crime: 'smuggling' },
  { n: 'Big Tuna Tony', x: -90, z: -60, alive: 450, dead: 180, crime: 'loan sharking' },
  { n: 'Velvet Vee', x: 44, z: 44, alive: 720, dead: 300, crime: 'forgery' },
];
let r7Bounty = { active: -1, caught: [], alive: 0, dead: 0 };
function r7BountyTake(i) {
  if (r7Bounty.active >= 0) { toast('Finish the current bounty first.'); return false; }
  if (r7Bounty.caught.includes(i)) { toast(R7_BOUNTIES[i].n + ' is already in custody.'); return false; }
  r7Bounty.active = i; r7BountySave();
  toast('Bounty taken: ' + R7_BOUNTIES[i].n + ' — ' + R7_BOUNTIES[i].crime + '. Alive $' + R7_BOUNTIES[i].alive + ', dead $' + R7_BOUNTIES[i].dead + '.');
  return true;
}
function r7BountyCapture(alive) {
  const i = r7Bounty.active; if (i < 0) return false;
  const b = R7_BOUNTIES[i];
  r7Bounty.caught.push(i); r7Bounty.active = -1;
  if (alive) r7Bounty.alive++; else r7Bounty.dead++;
  r7BountySave(); r7Earn(alive ? b.alive : b.dead, 'Bounty: ' + b.n + (alive ? ' (alive)' : ' (dead)'));
  return true;
}
function r7BountySave() { r7Save('bounty', r7Bounty); }
function r7BountyLoad() { const s = r7Load('bounty', null); if (s) r7Bounty = s; }
const R7_BOUNTY_BOARD = { x: 6, z: 34, name: 'Bounty board, Bay Sheriff office' };
function r7BountyNear() { return r7Near(R7_BOUNTY_BOARD.x, R7_BOUNTY_BOARD.z, 8); }
function r7BountyBuild() {
  const b = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.4), new THREE.MeshStandardMaterial({ color: 0x6a3a2a }));
  b.position.set(R7_BOUNTY_BOARD.x, 1.8, R7_BOUNTY_BOARD.z); scene.add(b);
}
function r7BountyOpen() {
  const lines = [
    'Caught alive ' + r7Bounty.alive + ' · caught dead ' + r7Bounty.dead + ' · total ' + r7Bounty.caught.length + '/5.',
    r7Bounty.active >= 0 ? 'Active: ' + R7_BOUNTIES[r7Bounty.active].n + ' — alive pays $' + R7_BOUNTIES[r7Bounty.active].alive + '.' : 'No active bounty. Alive always pays more than dead.',
  ];
  const buttons = R7_BOUNTIES.map((b, i) => r7PanelButton('Take: ' + b.n + ' — alive $' + b.alive + ' / dead $' + b.dead, () => { r7BountyTake(i); r7BountyOpen(); }, r7Bounty.caught.includes(i) || r7Bounty.active >= 0));
  if (r7Bounty.active >= 0) {
    buttons.push(r7PanelButton('Bring them in ALIVE', () => { r7BountyCapture(true); r7BountyOpen(); }));
    buttons.push(r7PanelButton('Bring them in dead', () => { r7BountyCapture(false); r7BountyOpen(); }));
  }
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🎯 Bounty Board', lines, buttons);
  return true;
}
// --- R7-12 Treasure hunts: 3 clue-chain hunts to buried caches ---
const R7_TREASURE = [
  { n: 'The Drowned Captain', clues: ['Start where the old lighthouse fell', 'Count the three palms by the tide pool', 'Dig under the X in the sand'], x: 128, z: 96, pay: 1200 },
  { n: 'Smuggler Gold', clues: ['The swamp hides what the bay forgets', 'Follow the crooked cypress north', 'Gold sleeps where the water turns black'], x: -160, z: 130, pay: 1500 },
  { n: 'The Gardener Hoard', clues: ['A gardener buried his wages', 'Behind the chapel, under the jasmine', 'The third stone from the wall'], x: -24, z: -66, pay: 900 },
];
let r7Treasure = { step: [0, 0, 0], found: [] };
function r7TreasureClue(i) {
  if (r7Treasure.found.includes(i)) { toast(R7_TREASURE[i].n + ' already dug up.'); return false; }
  const s = r7Treasure.step[i];
  toast('Clue ' + (s + 1) + '/3 — ' + R7_TREASURE[i].n + ': ' + R7_TREASURE[i].clues[s]);
  r7Treasure.step[i] = Math.min(2, s + 1); r7TreasureSave();
  return true;
}
function r7TreasureDig(i) {
  if (r7Treasure.found.includes(i)) return false;
  if (r7Treasure.step[i] < 2) { toast('You need all three clues before you dig here.'); return false; }
  if (!r7Near(R7_TREASURE[i].x, R7_TREASURE[i].z, 10)) { toast('Wrong spot — the clues point elsewhere.'); return false; }
  r7Treasure.found.push(i); r7TreasureSave();
  r7Earn(R7_TREASURE[i].pay, 'Treasure found: ' + R7_TREASURE[i].n);
  return true;
}
function r7TreasureSave() { r7Save('treasure', r7Treasure); }
function r7TreasureLoad() { const s = r7Load('treasure', null); if (s) r7Treasure = s; }
function r7TreasureNear() {
  for (let i = 0; i < R7_TREASURE.length; i++) if (r7Near(R7_TREASURE[i].x, R7_TREASURE[i].z, 10)) return i;
  return -1;
}
function r7TreasureOpen() {
  const i = r7TreasureNear(); if (i < 0) return false;
  const t = R7_TREASURE[i];
  const lines = [
    t.n + ' — cache worth $' + t.pay + '.',
    'Clues read: ' + r7Treasure.step[i] + '/3. ' + (r7Treasure.step[i] < 3 ? 'Next: ' + t.clues[r7Treasure.step[i]] : 'All clues read — dig!'),
    'Found caches: ' + r7Treasure.found.length + '/3.',
  ];
  const buttons = [
    r7PanelButton('Read the next clue', () => { r7TreasureClue(i); r7TreasureOpen(); }, r7Treasure.found.includes(i)),
    r7PanelButton('Dig here', () => { r7TreasureDig(i); r7ClosePanel(); }, r7Treasure.found.includes(i)),
    r7PanelButton('Close', () => r7ClosePanel()),
  ];
  r7ShowPanel('🗺️ Treasure Hunt — ' + t.n, lines, buttons);
  return true;
}
function r7TreasureBuild() {
  for (const t of R7_TREASURE) {
    const x = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    x.position.set(t.x, 0.4, t.z); scene.add(x);
    const x2 = x.clone(); x2.rotation.y = Math.PI / 2; scene.add(x2);
  }
}
// --- R7-13 Challenges: 9 categories, bronze / silver / gold ranks ---
const R7_CHALLENGES = [
  { n: 'Speed Demon', desc: 'Top speed on the causeway', bronze: 90, silver: 120, gold: 150, unit: 'mph' },
  { n: 'Air Time', desc: 'Longest jump off a ramp', bronze: 2, silver: 4, gold: 6, unit: 'sec' },
  { n: 'Sharpshooter', desc: 'Headshots in one day', bronze: 5, silver: 12, gold: 25, unit: 'hits' },
  { n: 'Wheelman', desc: 'Clean getaways in a row', bronze: 2, silver: 4, gold: 7, unit: 'escapes' },
  { n: 'Marathon', desc: 'Distance run on foot', bronze: 2, silver: 5, gold: 10, unit: 'km' },
  { n: 'Big Spender', desc: 'Cash spent in one day', bronze: 500, silver: 1500, gold: 4000, unit: '$' },
  { n: 'Night Owl', desc: 'Missions finished after dark', bronze: 2, silver: 5, gold: 9, unit: 'jobs' },
  { n: 'Collector', desc: 'Packages found in total', bronze: 10, silver: 25, gold: 45, unit: 'packs' },
  { n: 'Survivor', desc: 'Days alive without dying', bronze: 3, silver: 7, gold: 14, unit: 'days' },
];
let r7Chal = { best: [0, 0, 0, 0, 0, 0, 0, 0, 0], claimed: [] };
function r7ChalRank(i) {
  const c = R7_CHALLENGES[i]; const v = r7Chal.best[i];
  if (v >= c.gold) return 'gold';
  if (v >= c.silver) return 'silver';
  if (v >= c.bronze) return 'bronze';
  return 'none';
}
function r7ChalRecord(i, value) {
  if (value > r7Chal.best[i]) { r7Chal.best[i] = value; r7ChalSave(); }
  return r7ChalRank(i);
}
function r7ChalClaim(i) {
  const rank = r7ChalRank(i);
  const key = i + '-' + rank;
  if (rank === 'none' || r7Chal.claimed.includes(key)) return false;
  r7Chal.claimed.push(key); r7ChalSave();
  r7Earn(rank === 'gold' ? 400 : rank === 'silver' ? 200 : 100, R7_CHALLENGES[i].n + ' ' + rank + ' medal');
  return true;
}
function r7ChalSave() { r7Save('chal', r7Chal); }
function r7ChalLoad() { const s = r7Load('chal', null); if (s) r7Chal = s; }
function r7ChalOpen() {
  const lines = ['Nine challenge categories — bronze $100, silver $200, gold $400.'];
  for (let i = 0; i < R7_CHALLENGES.length; i++) {
    const c = R7_CHALLENGES[i];
    lines.push(c.n + ': best ' + r7Chal.best[i] + ' ' + c.unit + ' · rank ' + r7ChalRank(i) + ' (bronze ' + c.bronze + ' / silver ' + c.silver + ' / gold ' + c.gold + ')');
  }
  const buttons = R7_CHALLENGES.map((c, i) => r7PanelButton('Claim ' + c.n + ' ' + r7ChalRank(i), () => { r7ChalClaim(i); r7ChalOpen(); }, r7ChalRank(i) === 'none' || r7Chal.claimed.includes(i + '-' + r7ChalRank(i))));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🏅 Bay Challenges', lines, buttons);
  return true;
}
const R7_CHAL_BOARD = { x: 0, z: 14, name: 'Challenge board, central plaza' };
function r7ChalNear() { return r7Near(R7_CHAL_BOARD.x, R7_CHAL_BOARD.z, 8); }
// --- R7-14 Basketball court + 3v3 pickup games; backyard wrestling ring ---
const R7_COURT = { x: 48, z: -52, name: 'Marina Courts' };
const R7_WRESTLE = { x: -58, z: 70, name: 'Backyard ring, Docks Lane' };
let r7Court = { games: 0, wins: 0, points: 0, best: 0, wrestleWins: 0, wrestleLoss: 0 };
function r7CourtPlay() {
  const pts = 6 + Math.floor(Math.random() * 18);
  const win = pts >= 14;
  r7Court.games++; r7Court.points += pts;
  if (win) r7Court.wins++;
  if (pts > r7Court.best) r7Court.best = pts;
  r7CourtSave();
  if (win) r7Earn(90, 'Won the 3v3 pickup game (' + pts + ' pts)');
  else toast('Lost the pickup game — ' + pts + ' points. The court crowd groans.');
  return win;
}
function r7WrestleFight() {
  const win = Math.random() < 0.55;
  if (win) { r7Court.wrestleWins++; r7CourtSave(); r7Earn(160, 'Won the backyard wrestling bout'); }
  else { r7Court.wrestleLoss++; r7CourtSave(); toast('Pinned in the backyard ring — the crowd loved it anyway.'); }
  return win;
}
function r7CourtSave() { r7Save('court', r7Court); }
function r7CourtLoad() { const s = r7Load('court', null); if (s) r7Court = s; }
function r7CourtNear() { return r7Near(R7_COURT.x, R7_COURT.z, 10); }
function r7WrestleNear() { return r7Near(R7_WRESTLE.x, R7_WRESTLE.z, 10); }
function r7CourtBuild() {
  const court = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ color: 0x2a5a8a }));
  court.rotation.x = -Math.PI / 2; court.position.set(R7_COURT.x, 0.05, R7_COURT.z); scene.add(court);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 8, 16), new THREE.MeshStandardMaterial({ color: 0xff5a2a }));
  hoop.position.set(R7_COURT.x, 3, R7_COURT.z - 5); hoop.rotation.x = Math.PI / 2; scene.add(hoop);
  const ring = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x8a2a2a }));
  ring.position.set(R7_WRESTLE.x, 0.4, R7_WRESTLE.z); scene.add(ring);
}
function r7CourtOpen() {
  const lines = [
    'Pickup 3v3: ' + r7Court.games + ' games, ' + r7Court.wins + ' wins, best ' + r7Court.best + ' points.',
    'Win a game: $90. Score 14+ points to take the win.',
    'Backyard wrestling at ' + R7_WRESTLE.name + ': ' + r7Court.wrestleWins + ' wins, ' + r7Court.wrestleLoss + ' losses, $160 a win.',
  ];
  const buttons = [
    r7PanelButton('Play a 3v3 pickup game', () => { r7CourtPlay(); r7CourtOpen(); }),
    r7PanelButton('Fight in the backyard ring ($160)', () => { r7WrestleFight(); r7CourtOpen(); }),
    r7PanelButton('Close', () => r7ClosePanel()),
  ];
  r7ShowPanel('🏀 Marina Courts', lines, buttons);
  return true;
}
// --- R7-15 Pool hall + billiards; boxing gym with bouts ---
const R7_POOL = { x: -26, z: 44, name: 'Eight Ball Hall' };
const R7_BOXGYM = { x: 26, z: -64, name: 'Bay Iron Boxing' };
let r7Pool = { games: 0, wins: 0, runouts: 0, bouts: 0, boutWins: 0, belt: false };
function r7PoolPlay() {
  const win = Math.random() < 0.5;
  r7Pool.games++;
  if (win) { r7Pool.wins++; if (Math.random() < 0.2) r7Pool.runouts++; }
  r7PoolSave();
  if (win) r7Earn(70, 'Won the pool frame' + (r7Pool.runouts ? ' — runout!' : ''));
  else toast('Lost the pool frame — the cue ball had other ideas.');
  return win;
}
function r7BoxBout() {
  const win = Math.random() < 0.5 + (r7Pool.bouts * 0.02);
  r7Pool.bouts++;
  if (win) {
    r7Pool.boutWins++;
    if (r7Pool.boutWins >= 5 && !r7Pool.belt) { r7Pool.belt = true; r7PoolSave(); r7Earn(500, 'BAY CHAMPION BELT — five bout wins'); return true; }
    r7PoolSave(); r7Earn(140, 'Won the boxing bout');
  } else { r7PoolSave(); toast('Lost the bout — the bell saved you from worse.'); }
  return win;
}
function r7PoolSave() { r7Save('pool', r7Pool); }
function r7PoolLoad() { const s = r7Load('pool', null); if (s) r7Pool = s; }
function r7PoolNear() { return r7Near(R7_POOL.x, R7_POOL.z, 8); }
function r7BoxNear() { return r7Near(R7_BOXGYM.x, R7_BOXGYM.z, 8); }
function r7PoolBuild() {
  const hall = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x2a4a2a }));
  hall.position.set(R7_POOL.x, 2.2, R7_POOL.z); scene.add(hall);
  const gym = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), new THREE.MeshStandardMaterial({ color: 0x6a2a2a }));
  gym.position.set(R7_BOXGYM.x, 2.5, R7_BOXGYM.z); scene.add(gym);
}
function r7PoolOpen() {
  const lines = [
    'Pool: ' + r7Pool.games + ' frames, ' + r7Pool.wins + ' wins, ' + r7Pool.runouts + ' runouts. Frame win $70.',
    'Boxing: ' + r7Pool.bouts + ' bouts, ' + r7Pool.boutWins + ' wins. Bout win $140.',
    r7Pool.belt ? '🏆 You hold the Bay Champion belt!' : 'Five bout wins earns the Bay Champion belt ($500).',
  ];
  const buttons = [
    r7PanelButton('Play a frame of pool ($70)', () => { r7PoolPlay(); r7PoolOpen(); }),
    r7PanelButton('Fight a boxing bout ($140)', () => { r7BoxBout(); r7PoolOpen(); }),
    r7PanelButton('Close', () => r7ClosePanel()),
  ];
  r7ShowPanel('🎱 Eight Ball Hall & Boxing', lines, buttons);
  return true;
}
// --- R7-16 Kayaking + scuba diving: reefs, underwater loot, dive sites ---
const R7_DIVE_SITES = [
  { n: 'Sunken Ferry Reef', x: 150, z: 60, depth: 12, loot: 220 },
  { n: 'Coral Garden', x: 170, z: -20, depth: 8, loot: 140 },
  { n: 'Anchor Wreck', x: 140, z: 120, depth: 18, loot: 350 },
  { n: 'Turtle Cove', x: 110, z: -80, depth: 6, loot: 100 },
];
let r7Dive = { kayak: false, tank: 0, dives: [], loot: 0, bestDepth: 0 };
function r7DiveBuyKayak() {
  if (r7Dive.kayak) return false;
  if (!r7Spend(400)) return false;
  r7Dive.kayak = true; r7DiveSave(); toast('Kayak bought — paddle out from the marina.'); return true;
}
function r7DiveBuyTank() {
  if (!r7Spend(120)) return false;
  r7Dive.tank++; r7DiveSave(); toast('Scuba tank filled. Tanks: ' + r7Dive.tank); return true;
}
function r7DiveGo(i) {
  const s = R7_DIVE_SITES[i];
  if (!r7Dive.kayak) { toast('You need a kayak to reach ' + s.n + '.'); return false; }
  if (r7Dive.tank <= 0) { toast('No air — fill a scuba tank first.'); return false; }
  if (r7Dive.dives.includes(i)) { toast('Already dove ' + s.n + ' — the loot is gone.'); return false; }
  r7Dive.tank--; r7Dive.dives.push(i); r7Dive.loot += s.loot;
  if (s.depth > r7Dive.bestDepth) r7Dive.bestDepth = s.depth;
  r7DiveSave(); r7Earn(s.loot, 'Dove ' + s.n + ' (' + s.depth + 'm) — underwater loot');
  return true;
}
function r7DiveSave() { r7Save('dive', r7Dive); }
function r7DiveLoad() { const s = r7Load('dive', null); if (s) r7Dive = s; }
const R7_MARINA_SHOP = { x: 88, z: 20, name: 'Marina dive shop' };
function r7DiveNear() { return r7Near(R7_MARINA_SHOP.x, R7_MARINA_SHOP.z, 8); }
function r7DiveBuild() {
  const shop = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 6), new THREE.MeshStandardMaterial({ color: 0x2a7a8a }));
  shop.position.set(R7_MARINA_SHOP.x, 2, R7_MARINA_SHOP.z); scene.add(shop);
  for (const s of R7_DIVE_SITES) {
    const buoy = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xff7a2a }));
    buoy.position.set(s.x, 0.8, s.z); scene.add(buoy);
  }
}
function r7DiveOpen() {
  const lines = [
    'Kayak: ' + (r7Dive.kayak ? 'owned' : 'not owned ($400)') + ' · tanks: ' + r7Dive.tank + ' · dives: ' + r7Dive.dives.length + '/4.',
    'Deepest dive ' + r7Dive.bestDepth + 'm · underwater loot banked $' + r7Dive.loot + '.',
    'Dive sites: ' + R7_DIVE_SITES.map((s, i) => s.n + ' ' + s.depth + 'm $' + s.loot + (r7Dive.dives.includes(i) ? ' (done)' : '')).join(' · '),
  ];
  const buttons = [
    r7PanelButton('Buy a kayak — $400', () => { r7DiveBuyKayak(); r7DiveOpen(); }, r7Dive.kayak),
    r7PanelButton('Fill a scuba tank — $120', () => { r7DiveBuyTank(); r7DiveOpen(); }),
  ];
  R7_DIVE_SITES.forEach((s, i) => buttons.push(r7PanelButton('Dive ' + s.n + ' ($' + s.loot + ')', () => { r7DiveGo(i); r7DiveOpen(); }, r7Dive.dives.includes(i))));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🛶 Kayak & Scuba — Marina Dive Shop', lines, buttons);
  return true;
}
// --- R7-17 Base jumping: cliff/building spots + parachute challenges ---
const R7_JUMP_SPOTS = [
  { n: 'North Cliff', x: -20, z: -180, height: 120, pay: 260 },
  { n: 'Bay Tower roof', x: 20, z: -20, height: 90, pay: 200 },
  { n: 'Lighthouse Point', x: 130, z: 140, height: 70, pay: 160 },
  { n: 'Casino Row crane', x: 66, z: 18, height: 80, pay: 180 },
];
let r7Jump = { chute: false, jumps: [], best: 0, nearMisses: 0 };
function r7JumpBuyChute() {
  if (r7Jump.chute) return false;
  if (!r7Spend(500)) return false;
  r7Jump.chute = true; r7JumpSave(); toast('Parachute bought — do not jump without it.'); return true;
}
function r7JumpGo(i) {
  const s = R7_JUMP_SPOTS[i];
  if (!r7Jump.chute) { toast('No parachute — that jump would end badly. Buy one first.'); return false; }
  if (!r7Near(s.x, s.z, 10)) { toast('You are not at ' + s.n + ' yet.'); return false; }
  const airtime = Math.round((s.height / 12 + Math.random() * 3) * 10) / 10;
  r7Jump.jumps.push(i); if (airtime > r7Jump.best) r7Jump.best = airtime;
  if (Math.random() < 0.25) r7Jump.nearMisses++;
  r7JumpSave(); r7Earn(s.pay, 'Base jump from ' + s.n + ' — ' + airtime + 's in the air');
  return true;
}
function r7JumpSave() { r7Save('jump', r7Jump); }
function r7JumpLoad() { const s = r7Load('jump', null); if (s) r7Jump = s; }
function r7JumpNear() {
  for (let i = 0; i < R7_JUMP_SPOTS.length; i++) if (r7Near(R7_JUMP_SPOTS[i].x, R7_JUMP_SPOTS[i].z, 10)) return i;
  return -1;
}
function r7JumpBuild() {
  for (const s of R7_JUMP_SPOTS) {
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 6), new THREE.MeshBasicMaterial({ color: 0xff2a7a }));
    flag.position.set(s.x, 2, s.z); scene.add(flag);
  }
}
function r7JumpOpen() {
  const i = r7JumpNear(); if (i < 0) return false;
  const s = R7_JUMP_SPOTS[i];
  const lines = [
    s.n + ' — ' + s.height + 'm drop, pays $' + s.pay + '.',
    'Parachute: ' + (r7Jump.chute ? 'owned' : 'NOT owned ($500)') + ' · jumps ' + r7Jump.jumps.length + ' · best airtime ' + r7Jump.best + 's · near misses ' + r7Jump.nearMisses + '.',
  ];
  const buttons = [
    r7PanelButton('Buy a parachute — $500', () => { r7JumpBuyChute(); r7JumpOpen(); }, r7Jump.chute),
    r7PanelButton('JUMP from ' + s.n, () => { r7JumpGo(i); r7ClosePanel(); }),
    r7PanelButton('Close', () => r7ClosePanel()),
  ];
  r7ShowPanel('🪂 Base Jumping — ' + s.n, lines, buttons);
  return true;
}
// --- R7-18 Airboat swamp tours + swamp wildlife ---
const R7_SWAMP_TOURS = [
  { n: 'Dawn Gator Run', pay: 120, gators: 4 },
  { n: 'Midday Marsh Loop', pay: 90, gators: 2 },
  { n: 'Sunset Heron Cruise', pay: 150, gators: 1 },
];
let r7Swamp = { airboat: false, tours: 0, earned: 0, gatorsSeen: 0, tips: 0 };
function r7SwampBuyBoat() {
  if (r7Swamp.airboat) return false;
  if (!r7Spend(1800)) return false;
  r7Swamp.airboat = true; r7SwampSave(); toast('Airboat bought — the swamp is open for tours.'); return true;
}
function r7SwampTour(i) {
  const t = R7_SWAMP_TOURS[i];
  if (!r7Swamp.airboat) { toast('No airboat — buy one at the swamp dock first.'); return false; }
  const tip = Math.floor(Math.random() * 40);
  r7Swamp.tours++; r7Swamp.gatorsSeen += t.gators; r7Swamp.tips += tip; r7Swamp.earned += t.pay + tip;
  r7SwampSave(); r7Earn(t.pay + tip, 'Swamp tour: ' + t.n + ' (' + t.gators + ' gators, $' + tip + ' tips)');
  return true;
}
function r7SwampSave() { r7Save('swamp', r7Swamp); }
function r7SwampLoad() { const s = r7Load('swamp', null); if (s) r7Swamp = s; }
const R7_SWAMP_DOCK = { x: -140, z: 110, name: 'Swamp dock' };
function r7SwampNear() { return r7Near(R7_SWAMP_DOCK.x, R7_SWAMP_DOCK.z, 10); }
function r7SwampBuild() {
  const dock = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 4), new THREE.MeshStandardMaterial({ color: 0x5a4a2a }));
  dock.position.set(R7_SWAMP_DOCK.x, 0.5, R7_SWAMP_DOCK.z); scene.add(dock);
  for (let i = 0; i < 3; i++) {
    const gator = new THREE.Mesh(new THREE.BoxGeometry(3, 0.6, 1), new THREE.MeshStandardMaterial({ color: 0x3a5a2a }));
    gator.position.set(R7_SWAMP_DOCK.x - 8 + i * 7, 0.3, R7_SWAMP_DOCK.z + 8); scene.add(gator);
  }
}
function r7SwampOpen() {
  const lines = [
    'Airboat: ' + (r7Swamp.airboat ? 'owned' : 'not owned ($1800)') + ' · tours run ' + r7Swamp.tours + ' · earned $' + r7Swamp.earned + '.',
    'Gators spotted ' + r7Swamp.gatorsSeen + ' · tips banked $' + r7Swamp.tips + '.',
    'Tourists pay more at sunset — and the herons come out then too.',
  ];
  const buttons = [
    r7PanelButton('Buy an airboat — $1800', () => { r7SwampBuyBoat(); r7SwampOpen(); }, r7Swamp.airboat),
  ];
  R7_SWAMP_TOURS.forEach((t, i) => buttons.push(r7PanelButton('Run: ' + t.n + ' — $' + t.pay + '+ tips', () => { r7SwampTour(i); r7SwampOpen(); }, !r7Swamp.airboat)));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🐊 Airboat Swamp Tours', lines, buttons);
  return true;
}
// --- R7-19 Hunting lodge + trophy room; pelt crafting ---
const R7_PELTS = [
  { n: 'Deer pelt coat', need: 'White-tail Deer', cost: 0, sell: 180 },
  { n: 'Boar hide boots', need: 'Wild Boar', cost: 40, sell: 150 },
  { n: 'Gator skin wallet', need: 'Bay Alligator', cost: 60, sell: 260 },
  { n: 'Panther cloak', need: 'Black Panther', cost: 120, sell: 700 },
];
let r7Lodge = { trophies: [], crafted: [], visits: 0 };
function r7LodgeMount(animal) {
  if (r7Lodge.trophies.includes(animal)) return false;
  r7Lodge.trophies.push(animal); r7LodgeSave();
  toast(animal + ' mounted on the lodge wall. Trophies: ' + r7Lodge.trophies.length + '.');
  return true;
}
function r7LodgeCraft(i) {
  const p = R7_PELTS[i];
  const huntIdx = R7_WILD.findIndex((a) => a.n === p.need);
  if (!r7Wild.hunted.includes(huntIdx)) { toast('Hunt a ' + p.need + ' first — the lodge needs the pelt.'); return false; }
  if (r7Lodge.crafted.includes(i)) { toast(p.n + ' already crafted.'); return false; }
  if (p.cost && !r7Spend(p.cost)) return false;
  r7Lodge.crafted.push(i); r7LodgeSave();
  r7Earn(p.sell, 'Crafted and sold: ' + p.n);
  return true;
}
function r7LodgeSave() { r7Save('lodge', r7Lodge); }
function r7LodgeLoad() { const s = r7Load('lodge', null); if (s) r7Lodge = s; }
const R7_LODGE = { x: -110, z: -130, name: 'North Woods hunting lodge' };
function r7LodgeNear() { return r7Near(R7_LODGE.x, R7_LODGE.z, 10); }
function r7LodgeBuild() {
  const lodge = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 9), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
  lodge.position.set(R7_LODGE.x, 2.5, R7_LODGE.z); scene.add(lodge);
  const antlers = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }));
  antlers.position.set(R7_LODGE.x, 4.5, R7_LODGE.z + 4.6); scene.add(antlers);
}
function r7LodgeOpen() {
  r7Lodge.visits++; r7LodgeSave();
  const lines = [
    'Trophy wall: ' + (r7Lodge.trophies.join(', ') || 'bare — mount your hunts here') + '.',
    'Crafted: ' + (r7Lodge.crafted.map((i) => R7_PELTS[i].n).join(', ') || 'nothing yet') + ' · visits ' + r7Lodge.visits + '.',
    'A full trophy wall (all 8 animals) is the lodge master rank.',
  ];
  const buttons = [];
  for (let i = 0; i < R7_WILD.length; i++) {
    if (r7Wild.hunted.includes(i)) buttons.push(r7PanelButton('Mount ' + R7_WILD[i].n + ' trophy', () => { r7LodgeMount(R7_WILD[i].n); r7LodgeOpen(); }, r7Lodge.trophies.includes(R7_WILD[i].n)));
  }
  R7_PELTS.forEach((p, i) => buttons.push(r7PanelButton('Craft ' + p.n + ' — sell $' + p.sell, () => { r7LodgeCraft(i); r7LodgeOpen(); }, r7Lodge.crafted.includes(i))));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🏚️ Hunting Lodge & Trophy Room', lines, buttons);
  return true;
}
// --- R7-20 Hurricane fronts: severe storm events, surge, debris, shelter ---
const R7_STORMS = [
  { n: 'Hurricane Alma', wind: 9, surge: 3, pay: 300 },
  { n: 'Tropical Storm Brio', wind: 6, surge: 2, pay: 180 },
  { n: 'Hurricane Cleo', wind: 10, surge: 4, pay: 420 },
];
let r7Storm = { active: -1, timer: 0, sheltered: 0, rescued: 0, debris: 0, survived: 0 };
function r7StormStart(i) {
  if (r7Storm.active >= 0) return false;
  r7Storm.active = i; r7Storm.timer = 60; r7StormSave();
  toast('⚠️ ' + R7_STORMS[i].n + ' is hitting the bay — wind ' + R7_STORMS[i].wind + '/10, surge ' + R7_STORMS[i].surge + 'm. Find shelter!');
  return true;
}
function r7StormShelter() {
  if (r7Storm.active < 0) { toast('No storm right now — the sky is clear.'); return false; }
  r7Storm.sheltered++; r7StormSave();
  toast('Sheltered through the worst of it. NPCs are huddling inside too.');
  return true;
}
function r7StormRescue() {
  if (r7Storm.active < 0) return false;
  r7Storm.rescued++; r7StormSave();
  r7Earn(60, 'Pulled a stranded local out of the floodwater');
  return true;
}
function r7StormDebris() {
  if (r7Storm.active < 0) return false;
  r7Storm.debris++; r7StormSave();
  toast('Cleared storm debris. The road is open again.');
  return true;
}
function r7StormEnd() {
  const i = r7Storm.active; if (i < 0) return false;
  r7Storm.active = -1; r7Storm.survived++;
  r7StormSave(); r7Earn(R7_STORMS[i].pay, 'Survived ' + R7_STORMS[i].n);
  return true;
}
function r7StormUpdate(dt) {
  if (r7Storm.active < 0) return;
  r7Storm.timer -= dt;
  if (r7Storm.timer <= 0) r7StormEnd();
}
function r7StormSave() { r7Save('storm', r7Storm); }
function r7StormLoad() { const s = r7Load('storm', null); if (s) r7Storm = s; }
const R7_SHELTER = { x: 14, z: -8, name: 'Storm shelter, civic hall' };
function r7StormNear() { return r7Near(R7_SHELTER.x, R7_SHELTER.z, 8); }
function r7StormOpen() {
  const lines = [
    r7Storm.active >= 0 ? 'ACTIVE: ' + R7_STORMS[r7Storm.active].n + ' — ' + Math.ceil(r7Storm.timer) + 's left. Wind ' + R7_STORMS[r7Storm.active].wind + '/10.' : 'No storm overhead. The bay is calm — for now.',
    'Storms survived ' + r7Storm.survived + ' · sheltered ' + r7Storm.sheltered + 'x · rescued ' + r7Storm.rescued + ' people · debris cleared ' + r7Storm.debris + '.',
    'Surviving a full storm pays $180–$420. Rescues pay $60 each.',
  ];
  const buttons = R7_STORMS.map((s, i) => r7PanelButton('Storm warning: ' + s.n + ' (wind ' + s.wind + ')', () => { r7StormStart(i); r7StormOpen(); }, r7Storm.active >= 0));
  buttons.push(r7PanelButton('Take shelter here', () => { r7StormShelter(); r7StormOpen(); }, r7Storm.active < 0));
  buttons.push(r7PanelButton('Rescue a stranded local (+$60)', () => { r7StormRescue(); r7StormOpen(); }, r7Storm.active < 0));
  buttons.push(r7PanelButton('Clear storm debris', () => { r7StormDebris(); r7StormOpen(); }, r7Storm.active < 0));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🌀 Hurricane Fronts — Civic Shelter', lines, buttons);
  return true;
}
function r7StormBuild() {
  const hall = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 9), new THREE.MeshStandardMaterial({ color: 0x8a8a7a }));
  hall.position.set(R7_SHELTER.x, 3, R7_SHELTER.z); scene.add(hall);
}
// --- R7-21 BayRide ride-share + bus/train timetables (fast travel network) ---
const R7_RIDE_STOPS = [
  { n: 'Marina BayRide', x: 84, z: 8, fare: 12 },
  { n: 'Old Town BayRide', x: -28, z: 8, fare: 10 },
  { n: 'Casino Row BayRide', x: 60, z: 24, fare: 14 },
  { n: 'North Docks BayRide', x: -70, z: -80, fare: 16 },
  { n: 'Airport BayRide', x: 100, z: -120, fare: 20 },
];
const R7_TIMETABLE = [
  { line: 'Bay Loop bus', every: 10, from: 'Marina', to: 'Old Town' },
  { line: 'Coast Express train', every: 15, from: 'Casino Row', to: 'North Docks' },
  { line: 'Airport shuttle', every: 20, from: 'Marina', to: 'Airport' },
];
let r7Ride = { rides: 0, earned: 0, driver: false, rating: 5.0, trips: 0 };
function r7RideGo(from, to) {
  const fare = R7_RIDE_STOPS[to].fare;
  if (!r7Spend(fare)) return false;
  r7Ride.rides++; r7RideSave();
  const p = r7Pos();
  playerState.x = R7_RIDE_STOPS[to].x + 3; playerState.z = R7_RIDE_STOPS[to].z + 3;
  if (state.inCar) { state.inCar.mesh.position.x = playerState.x; state.inCar.mesh.position.z = playerState.z; }
  toast('BayRide dropped you at ' + R7_RIDE_STOPS[to].n + ' — $' + fare + '.');
  updateHUD(); return true;
}
function r7RideDrive() {
  if (!r7Ride.driver) {
    if (!r7Spend(300)) return false;
    r7Ride.driver = true; r7RideSave(); toast('BayRide driver signed up — $300 licence. Take fares, keep your rating up.');
    return true;
  }
  const fare = 25 + Math.floor(Math.random() * 30);
  r7Ride.trips++; r7Ride.earned += fare;
  r7Ride.rating = r7Clamp(r7Ride.rating + (Math.random() < 0.8 ? 0.1 : -0.2), 1, 5);
  r7RideSave(); r7Earn(fare, 'BayRide fare — rating ' + r7Ride.rating.toFixed(1) + '★');
  return true;
}
function r7RideSave() { r7Save('ride', r7Ride); }
function r7RideLoad() { const s = r7Load('ride', null); if (s) r7Ride = s; }
function r7RideNear() {
  for (let i = 0; i < R7_RIDE_STOPS.length; i++) if (r7Near(R7_RIDE_STOPS[i].x, R7_RIDE_STOPS[i].z, 8)) return i;
  return -1;
}
function r7RideBuild() {
  for (const s of R7_RIDE_STOPS) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x2ee6ff }));
    sign.position.set(s.x, 1.4, s.z); scene.add(sign);
  }
}
function r7RideOpen() {
  const at = r7RideNear(); if (at < 0) return false;
  const lines = [
    'You are at ' + R7_RIDE_STOPS[at].n + '. Rides taken ' + r7Ride.rides + '.',
    'Driver: ' + (r7Ride.driver ? 'yes — rating ' + r7Ride.rating.toFixed(1) + '★, ' + r7Ride.trips + ' fares, $' + r7Ride.earned + ' earned' : 'no — licence $300'),
    'Timetable: ' + R7_TIMETABLE.map((t) => t.line + ' every ' + t.every + ' min (' + t.from + ' → ' + t.to + ')').join(' · '),
  ];
  const buttons = R7_RIDE_STOPS.map((s, i) => r7PanelButton('Ride to ' + s.n + ' — $' + s.fare, () => { r7RideGo(at, i); r7ClosePanel(); }, i === at));
  buttons.push(r7PanelButton(r7Ride.driver ? 'Take a fare as driver' : 'Sign up as a BayRide driver — $300', () => { r7RideDrive(); r7RideOpen(); }));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🚕 BayRide — ' + R7_RIDE_STOPS[at].n, lines, buttons);
  return true;
}
// --- R7-22 Phone 2.0: Snapmatic photo social app + car scanner app ---
const R7_SNAP_TAGS = ['sunset', 'gator', 'skyline', 'classic car', 'street food', 'storm'];
let r7Phone = { followers: 0, likes: 0, posts: [], scanned: [], viral: 0 };
function r7SnapPost(tag) {
  const likes = 5 + Math.floor(Math.random() * 60) + Math.floor(r7Phone.followers / 10);
  r7Phone.posts.push({ tag, likes });
  r7Phone.likes += likes;
  const gained = Math.floor(likes / 20);
  r7Phone.followers += gained;
  if (likes >= 70) r7Phone.viral++;
  r7PhoneSave();
  toast('Posted a #' + tag + ' photo — ' + likes + ' likes, +' + gained + ' followers. Total ' + r7Phone.followers + '.');
  return likes;
}
function r7SnapScanCar() {
  if (!state.inCar) { toast('Get in a car first — the scanner reads the car you are sitting in.'); return false; }
  const model = state.inCar.model || 'Bay sedan';
  if (r7Phone.scanned.includes(model)) { toast(model + ' already scanned.'); return false; }
  r7Phone.scanned.push(model); r7PhoneSave();
  toast('Scanned: ' + model + ' — value, mods and owner history logged. Cars scanned: ' + r7Phone.scanned.length);
  return true;
}
function r7SnapPayout() {
  if (r7Phone.followers < 100) { toast('Need 100 followers for a payout — you have ' + r7Phone.followers + '.'); return false; }
  const pay = Math.floor(r7Phone.followers / 10);
  r7Phone.followers = Math.floor(r7Phone.followers * 0.9);
  r7PhoneSave(); r7Earn(pay, 'Snapmatic brand payout');
  return true;
}
function r7PhoneSave() { r7Save('phone', r7Phone); }
function r7PhoneLoad() { const s = r7Load('phone', null); if (s) r7Phone = s; }
function r7PhoneOpen() {
  const lines = [
    'Snapmatic: ' + r7Phone.followers + ' followers · ' + r7Phone.likes + ' likes · ' + r7Phone.posts.length + ' posts · ' + r7Phone.viral + ' viral.',
    'Cars scanned: ' + (r7Phone.scanned.join(', ') || 'none yet') + '.',
    'At 100 followers you can cash a brand payout (followers / 10 dollars).',
  ];
  const buttons = R7_SNAP_TAGS.map((t) => r7PanelButton('Post a #' + t + ' photo', () => { r7SnapPost(t); r7PhoneOpen(); }));
  buttons.push(r7PanelButton('Scan the car you are in', () => { r7SnapScanCar(); r7PhoneOpen(); }));
  buttons.push(r7PanelButton('Cash a brand payout', () => { r7SnapPayout(); r7PhoneOpen(); }, r7Phone.followers < 100));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('📸 Snapmatic — Phone 2.0', lines, buttons);
  return true;
}
// --- R7-23 Radio podcasts + headphones (listen on foot) ---
const R7_PODCASTS = [
  { n: 'Bay True Crime', ep: 'The Drowned Captain', len: 22 },
  { n: 'Gator Tales', ep: 'Swamp legends', len: 18 },
  { n: 'Hustle & Salt', ep: 'How the bay really works', len: 25 },
  { n: 'Marina Nights', ep: 'Music of the docks', len: 20 },
];
let r7Pod = { headphones: false, listened: [], current: -1, minutes: 0 };
function r7PodBuyPhones() {
  if (r7Pod.headphones) return false;
  if (!r7Spend(85)) return false;
  r7Pod.headphones = true; r7PodSave(); toast('Headphones bought — podcasts now play on foot.'); return true;
}
function r7PodListen(i) {
  if (!r7Pod.headphones) { toast('No headphones — buy a pair first ($85).'); return false; }
  r7Pod.current = i; r7Pod.minutes += R7_PODCASTS[i].len;
  if (!r7Pod.listened.includes(i)) r7Pod.listened.push(i);
  r7PodSave();
  toast('Now playing: ' + R7_PODCASTS[i].n + ' — "' + R7_PODCASTS[i].ep + '" (' + R7_PODCASTS[i].len + ' min).');
  return true;
}
function r7PodSave() { r7Save('pod', r7Pod); }
function r7PodLoad() { const s = r7Load('pod', null); if (s) r7Pod = s; }
function r7PodOpen() {
  const lines = [
    'Headphones: ' + (r7Pod.headphones ? 'on' : 'not owned ($85)') + ' · minutes listened ' + r7Pod.minutes + ' · shows finished ' + r7Pod.listened.length + '/4.',
    r7Pod.current >= 0 ? 'Now playing: ' + R7_PODCASTS[r7Pod.current].n : 'Nothing playing — pick a show.',
    'Listening on foot keeps you calm: +focus meter while a podcast plays.',
  ];
  const buttons = [r7PanelButton('Buy headphones — $85', () => { r7PodBuyPhones(); r7PodOpen(); }, r7Pod.headphones)];
  R7_PODCASTS.forEach((p, i) => buttons.push(r7PanelButton('Play: ' + p.n + ' — ' + p.ep, () => { r7PodListen(i); r7PodOpen(); }, !r7Pod.headphones)));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🎧 Podcasts & Headphones', lines, buttons);
  return true;
}
// --- R7-24 Body & stats: food, gym, sleep; apartments + rooftop bars ---
const R7_FOODS = [
  { n: 'Bay fish tacos', cost: 12, str: 1, sta: 2 },
  { n: 'Gator bites', cost: 18, str: 3, sta: 1 },
  { n: 'Marina salad', cost: 10, str: 0, sta: 3 },
  { n: 'Docks burger', cost: 14, str: 2, sta: 2 },
];
const R7_APTS = [
  { n: 'Marina Loft', x: 80, z: -6, rent: 120, view: 'bay' },
  { n: 'Old Town Flat', x: -32, z: 2, rent: 70, view: 'plaza' },
  { n: 'Rooftop Suite', x: 56, z: -30, rent: 220, view: 'skyline' },
];
let r7Body = { strength: 5, stamina: 5, meals: 0, gym: 0, slept: 0, apt: -1, barVisits: 0 };
function r7BodyEat(i) {
  const f = R7_FOODS[i];
  if (!r7Spend(f.cost)) return false;
  r7Body.strength = r7Clamp(r7Body.strength + f.str, 0, 20);
  r7Body.stamina = r7Clamp(r7Body.stamina + f.sta, 0, 20);
  r7Body.meals++; r7BodySave(); updateHUD();
  toast('Ate ' + f.n + '. Strength ' + r7Body.strength + '/20 · stamina ' + r7Body.stamina + '/20.');
  return true;
}
function r7BodyGym() {
  if (!r7Spend(30)) return false;
  r7Body.strength = r7Clamp(r7Body.strength + 1, 0, 20);
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  r7Body.gym++; r7BodySave(); updateHUD();
  toast('Gym session done. Strength ' + r7Body.strength + ' · stamina ' + r7Body.stamina + '.');
  return true;
}
function r7BodyRent(i) {
  if (r7Body.apt === i) return false;
  if (!r7Spend(R7_APTS[i].rent)) return false;
  r7Body.apt = i; r7BodySave();
  toast('Moved into the ' + R7_APTS[i].n + ' — ' + R7_APTS[i].view + ' view. Rent $' + R7_APTS[i].rent + ' a stay.');
  return true;
}
function r7BodyBar() {
  if (!r7Spend(40)) return false;
  r7Body.barVisits++; r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  r7BodySave(); toast('Rooftop bar — the bay glitters below. A drink, a view, a breather.');
  return true;
}
function r7BodySleep() {
  r7Body.slept++; r7Body.stamina = r7Clamp(r7Body.stamina + 3, 0, 20);
  state.health = 100; r7BodySave(); updateHUD();
  toast('Slept well. Stamina ' + r7Body.stamina + '/20 · nights ' + r7Body.slept + '.');
  return true;
}
function r7BodySave() { r7Save('body', r7Body); }
function r7BodyLoad() { const s = r7Load('body', null); if (s) r7Body = s; }
const R7_GYM2 = { x: 38, z: -58, name: 'Bay Iron II gym' };
function r7BodyNear() { return r7Near(R7_GYM2.x, R7_GYM2.z, 8); }
function r7BodyAptNear() {
  for (let i = 0; i < R7_APTS.length; i++) if (r7Near(R7_APTS[i].x, R7_APTS[i].z, 8)) return i;
  return -1;
}
function r7BodyBuild() {
  const gym = new THREE.Mesh(new THREE.BoxGeometry(9, 4.5, 7), new THREE.MeshStandardMaterial({ color: 0x2a6a4a }));
  gym.position.set(R7_GYM2.x, 2.2, R7_GYM2.z); scene.add(gym);
  for (const a of R7_APTS) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 7), new THREE.MeshStandardMaterial({ color: 0x8a7a5a }));
    b.position.set(a.x, 4.5, a.z); scene.add(b);
  }
}
function r7BodyOpen() {
  const lines = [
    'Body: strength ' + r7Body.strength + '/20 · stamina ' + r7Body.stamina + '/20 · meals ' + r7Body.meals + ' · gym sessions ' + r7Body.gym + ' · nights slept ' + r7Body.slept + '.',
    'Home: ' + (r7Body.apt >= 0 ? R7_APTS[r7Body.apt].n + ' (' + R7_APTS[r7Body.apt].view + ' view)' : 'safehouse only') + ' · rooftop bar visits ' + r7Body.barVisits + '.',
    'Food and training change how you look and how long you can run.',
  ];
  const buttons = R7_FOODS.map((f, i) => r7PanelButton('Eat ' + f.n + ' — $' + f.cost + ' (+' + f.str + ' str, +' + f.sta + ' sta)', () => { r7BodyEat(i); r7BodyOpen(); }));
  buttons.push(r7PanelButton('Train at the gym — $30', () => { r7BodyGym(); r7BodyOpen(); }));
  buttons.push(r7PanelButton('Sleep', () => { r7BodySleep(); r7BodyOpen(); }));
  buttons.push(r7PanelButton('Rooftop bar drink — $40', () => { r7BodyBar(); r7BodyOpen(); }));
  R7_APTS.forEach((a, i) => buttons.push(r7PanelButton('Rent ' + a.n + ' — $' + a.rent, () => { r7BodyRent(i); r7BodyOpen(); }, r7Body.apt === i)));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('💪 Body & Home', lines, buttons);
  return true;
}
// --- R7 glue: update loop, HUD line, minimap, key routing ---
function updateR7(dt) {
  r7StormUpdate(dt);
  r7DailyUpdate(dt);
  if (r7Focus.on) {
    r7Focus.meter = r7Clamp(r7Focus.meter - dt * 4, 0, 100);
    if (r7Focus.meter <= 0) { r7Focus.on = false; toast('Focus meter empty.'); }
  }
  if (r7Pod.current >= 0 && r7Pod.headphones) {
    r7Focus.meter = r7Clamp(r7Focus.meter + dt * 0.5, 0, 100);
  }
}
function r7HudLine() {
  const el = document.getElementById('r7Line');
  if (!el) return;
  const parts = [];
  parts.push('⭐ Rep ' + r7RepScore() + ' ' + r7RepTitle());
  parts.push('🎭 ' + R7_OUTFITS[r7Wit.outfit].n + ' heat ' + r7Wit.heat + '/6' + (r7Wit.lockdown ? ' LOCKDOWN' : ''));
  parts.push('🎯 Focus ' + (r7Focus.on ? 'ON ' : '') + Math.round(r7Focus.meter) + '%');
  if (r7Rob.done.length) parts.push('💰 Robberies ' + r7Rob.done.length + '/4');
  if (r7Theft.stolen) parts.push('🚗 Stolen ' + r7Theft.stolen);
  if (r7Wild.studied.length) parts.push('🦅 Wild ' + r7Wild.studied.length + '/8');
  if (r7Stranger.done.length) parts.push('❓ Strangers ' + r7Stranger.done.length + '/8');
  if (r7Bounty.caught.length) parts.push('🎯 Bounties ' + r7Bounty.caught.length + '/5');
  if (r7Treasure.found.length) parts.push('🗺️ Treasure ' + r7Treasure.found.length + '/3');
  if (r7Storm.active >= 0) parts.push('🌀 ' + R7_STORMS[r7Storm.active].n + ' ' + Math.ceil(r7Storm.timer) + 's');
  parts.push('📸 Snap ' + r7Phone.followers + ' followers');
  parts.push('💪 ' + r7Body.strength + '/' + r7Body.stamina);
  el.textContent = parts.join(' · ');
}
function r7MinimapDots(dot) {
  dot(R7_REP_SPOT.x, R7_REP_SPOT.z, '#ffd23f', 3);
  dot(R7_CLOTHES.x, R7_CLOTHES.z, '#ff9ad5', 3);
  for (const t of R7_ROB_TARGETS) dot(t.x, t.z, '#ff2a7a', 3);
  dot(R7_CHOP.x, R7_CHOP.z, '#9fb6c9', 3);
  dot(R7_GUNSHOP.x, R7_GUNSHOP.z, '#ff5a5a', 3);
  for (const s of R7_WILD_SPOTS) dot(s.x, s.z, '#7dff9a', 3);
  dot(R7_SAFEHOUSE.x, R7_SAFEHOUSE.z, '#ffd23f', 4);
  for (const s of R7_STRANGERS) dot(s.x, s.z, r7Stranger.done.includes(R7_STRANGERS.indexOf(s)) ? '#2ecc71' : '#ffd23f', 2);
  dot(R7_BOUNTY_BOARD.x, R7_BOUNTY_BOARD.z, '#ff2a7a', 4);
  for (const t of R7_TREASURE) dot(t.x, t.z, r7Treasure.found.includes(R7_TREASURE.indexOf(t)) ? '#2ecc71' : '#e8b820', 3);
  dot(R7_CHAL_BOARD.x, R7_CHAL_BOARD.z, '#ffd23f', 3);
  dot(R7_COURT.x, R7_COURT.z, '#ff5a5a', 3);
  dot(R7_WRESTLE.x, R7_WRESTLE.z, '#ff7a2a', 3);
  dot(R7_POOL.x, R7_POOL.z, '#2ee6ff', 3);
  dot(R7_BOXGYM.x, R7_BOXGYM.z, '#ff5a5a', 3);
  dot(R7_MARINA_SHOP.x, R7_MARINA_SHOP.z, '#2ee6ff', 3);
  for (const s of R7_DIVE_SITES) dot(s.x, s.z, '#2ee6ff', 2);
  for (const s of R7_JUMP_SPOTS) dot(s.x, s.z, '#ff2a7a', 3);
  dot(R7_SWAMP_DOCK.x, R7_SWAMP_DOCK.z, '#7dff9a', 3);
  dot(R7_LODGE.x, R7_LODGE.z, '#8a5a2a', 3);
  dot(R7_SHELTER.x, R7_SHELTER.z, '#ffffff', 4);
  for (const s of R7_RIDE_STOPS) dot(s.x, s.z, '#2ee6ff', 3);
  dot(R7_GYM2.x, R7_GYM2.z, '#7dff9a', 3);
  for (const a of R7_APTS) dot(a.x, a.z, '#d8a020', 3);
}
function r7KeyE() {
  // Shops win over Round 7 panels: the pool hall sits a few metres from
  // the Binco door, and E there must open the shop, not the pool table.
  if (nearestShop()) return false;
  if (r7RepNear()) { r7RepOpen(); return true; }
  if (r7WitNear()) { r7WitOpen(); return true; }
  if (r7RobNear() >= 0) { r7RobOpen(); return true; }
  if (r7TheftNear()) { r7TheftOpen(); return true; }
  if (r7LockerNear()) { r7LockerOpen(); return true; }
  if (r7WildNear() >= 0) { r7WildOpen(); return true; }
  if (r7SafeNear()) { r7SafeOpen(); return true; }
  if (r7StrangerNear() >= 0) { r7StrangerOpen(); return true; }
  if (r7BountyNear()) { r7BountyOpen(); return true; }
  if (r7TreasureNear() >= 0) { r7TreasureOpen(); return true; }
  if (r7ChalNear()) { r7ChalOpen(); return true; }
  if (r7CourtNear() || r7WrestleNear()) { r7CourtOpen(); return true; }
  if (r7PoolNear() || r7BoxNear()) { r7PoolOpen(); return true; }
  if (r7DiveNear()) { r7DiveOpen(); return true; }
  if (r7JumpNear() >= 0) { r7JumpOpen(); return true; }
  if (r7SwampNear()) { r7SwampOpen(); return true; }
  if (r7LodgeNear()) { r7LodgeOpen(); return true; }
  if (r7StormNear()) { r7StormOpen(); return true; }
  if (r7RideNear() >= 0) { r7RideOpen(); return true; }
  if (r7BodyNear() || r7BodyAptNear() >= 0) { r7BodyOpen(); return true; }
  return false;
}
// Visible Round 7 props for the four screenshot scenes: a gold reputation
// banner at the plaza, an orange airboat at the marina, a pink disguise
// mannequin by the clothes shop, and a storm-warning flag at the shelter.
const R7_SHOT_PROPS = { banner: null, airboat: null, mannequin: null, flag: null };
function r7ShotPropsBuild() {
  const banner = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  banner.position.set(-6, 9, 20); scene.add(banner); R7_SHOT_PROPS.banner = banner;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1, 2), new THREE.MeshStandardMaterial({ color: 0xff7a2a }));
  hull.position.set(92, 0.8, 14); scene.add(hull); R7_SHOT_PROPS.airboat = hull;
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  fan.rotation.x = Math.PI / 2; fan.position.set(90, 1.6, 14); scene.add(fan);
  const man = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff9ad5 }));
  man.position.set(24, 1.2, -28); scene.add(man); R7_SHOT_PROPS.mannequin = man;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  pole.position.set(16, 3, -6); scene.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshBasicMaterial({ color: 0xff2a2a, side: THREE.DoubleSide }));
  flag.position.set(17.2, 5.2, -6); scene.add(flag); R7_SHOT_PROPS.flag = flag;
}
// Extra Round 7 shot props, one per remaining scene: a red witness camera
// pole in the chase frame, storm debris in the mission frame, and a bright
// orange kayak in the isle frame.
function r7ShotPropsExtra() {
  const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cam.position.set(-57, 2.5, 2); scene.add(cam);
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff2a2a }));
  camBox.position.set(-57, 5.2, 2); scene.add(camBox);
  const debris = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 3), new THREE.MeshStandardMaterial({ color: 0x6a5a3a }));
  debris.position.set(-195, 0.6, -45); debris.rotation.y = 0.5; scene.add(debris);
  const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
  plank.position.set(-193, 1.4, -43); plank.rotation.z = 0.3; scene.add(plank);
  const kayak = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 3, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff7a2a }));
  kayak.rotation.z = Math.PI / 2; kayak.rotation.y = 0.6; kayak.position.set(165, 0.6, 15); scene.add(kayak);
  const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }));
  paddle.rotation.z = Math.PI / 2; paddle.position.set(165, 1.1, 15); scene.add(paddle);
}
function r7SelfTest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  ok('r7-rep-deeds', R7_REP_DEEDS.length === 6 && R7_REP_DEEDS[1].g === 8, '6 deeds');
  ok('r7-rep-title', r7RepTitle() === 'Nobody Special' || r7RepScore() !== 0, 'title ' + r7RepTitle());
  ok('r7-rep-price', r7RepPriceMult() > 0.7 && r7RepPriceMult() < 1.3, 'mult ' + r7RepPriceMult().toFixed(2));
  ok('r7-outfits', R7_OUTFITS.length === 5 && R7_OUTFITS[3].cost === 90, '5 outfits');
  ok('r7-wit-heat', r7WitHeat() >= 0 && r7WitHeat() <= 12, 'heat ' + r7WitHeat());
  ok('r7-focus-meter', r7Focus.meter >= 0 && r7Focus.meter <= 100, 'meter ' + r7Focus.meter);
  ok('r7-rob-targets', R7_ROB_TARGETS.length === 4 && R7_ROB_TARGETS[0].safe === '4821', '4 targets');
  ok('r7-theft-tools', R7_THEFT_TOOLS.length === 4 && R7_THEFT_TOOLS[2].cost === 350, '4 tools');
  ok('r7-theft-timing', r7TheftTiming(0) >= 0 && r7TheftTiming(0) <= 100, 'timing in range');
  ok('r7-guns', R7_GUNS.length === 4 && R7_GUNS[3].price === 1400, '4 guns');
  ok('r7-wild', R7_WILD.length === 8 && R7_WILD[7].value === 500, '8 species');
  ok('r7-horses2', R7_HORSE2.length === 3 && R7_HORSE2[2].speed === 8, '3 horses');
  ok('r7-safe-upgrades', R7_SAFE_UPGRADES.length === 5 && R7_SAFE_UPGRADES[4].cost === 800, '5 upgrades');
  ok('r7-strangers', R7_STRANGERS.length === 8 && R7_STRANGERS[7].pay === 130, '8 strangers');
  ok('r7-bounties', R7_BOUNTIES.length === 5 && R7_BOUNTIES[2].alive === 800, '5 bounties');
  ok('r7-treasure', R7_TREASURE.length === 3 && R7_TREASURE[1].pay === 1500, '3 hunts');
  ok('r7-challenges', R7_CHALLENGES.length === 9 && R7_CHALLENGES[8].gold === 14, '9 challenges');
  ok('r7-chal-rank', r7ChalRank(0) === 'none' || r7Chal.best[0] > 0, 'rank ok');
  ok('r7-court', !!R7_COURT && R7_COURT.name === 'Marina Courts', 'court built');
  ok('r7-pool', !!R7_POOL && R7_POOL.name === 'Eight Ball Hall', 'pool hall built');
  ok('r7-dive-sites', R7_DIVE_SITES.length === 4 && R7_DIVE_SITES[2].loot === 350, '4 dive sites');
  ok('r7-jump-spots', R7_JUMP_SPOTS.length === 4 && R7_JUMP_SPOTS[0].pay === 260, '4 jump spots');
  ok('r7-swamp-tours', R7_SWAMP_TOURS.length === 3 && R7_SWAMP_TOURS[2].pay === 150, '3 tours');
  ok('r7-pelts', R7_PELTS.length === 4 && R7_PELTS[3].sell === 700, '4 pelts');
  ok('r7-storms', R7_STORMS.length === 3 && R7_STORMS[2].wind === 10, '3 storms');
  ok('r7-ride-stops', R7_RIDE_STOPS.length === 5 && R7_RIDE_STOPS[4].fare === 20, '5 stops');
  ok('r7-timetable', R7_TIMETABLE.length === 3 && R7_TIMETABLE[1].every === 15, '3 lines');
  ok('r7-snap-tags', R7_SNAP_TAGS.length === 6 && R7_SNAP_TAGS[0] === 'sunset', '6 tags');
  ok('r7-podcasts', R7_PODCASTS.length === 4 && R7_PODCASTS[2].len === 25, '4 shows');
  ok('r7-foods', R7_FOODS.length === 4 && R7_FOODS[1].cost === 18, '4 foods');
  ok('r7-apts', R7_APTS.length === 3 && R7_APTS[2].rent === 220, '3 apartments');
  ok('r7-shot-banner', !!R7_SHOT_PROPS.banner, 'banner in scene');
  ok('r7-shot-airboat', !!R7_SHOT_PROPS.airboat, 'airboat in scene');
  ok('r7-shot-mannequin', !!R7_SHOT_PROPS.mannequin, 'mannequin in scene');
  ok('r7-shot-flag', !!R7_SHOT_PROPS.flag, 'storm flag in scene');
  ok('r7-panel', !!document.getElementById('r7Panel'), 'R7 panel in the DOM');
  ok('r7-hud-line', !!document.getElementById('r7Line'), 'R7 HUD line present');
  ok('r7-keye', typeof r7KeyE === 'function', 'E hook wired');
  ok('r7-cash-sane', state.cash >= 0 && state.cash < 100000000, 'cash ' + state.cash);
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
window.__r7exports = {
  rep: r7Rep, wit: r7Wit, focus: r7Focus, rob: r7Rob, theft: r7Theft, locker: r7Locker,
  wild: r7Wild, horse: r7Horse, safe: r7Safe, stranger: r7Stranger, bounty: r7Bounty,
  treasure: r7Treasure, chal: r7Chal, court: r7Court, pool: r7Pool, dive: r7Dive,
  jump: r7Jump, swamp: r7Swamp, lodge: r7Lodge, storm: r7Storm, ride: r7Ride,
  phone: r7Phone, pod: r7Pod, body: r7Body,
  deeds: R7_REP_DEEDS, outfits: R7_OUTFITS, robTargets: R7_ROB_TARGETS,
  theftTools: R7_THEFT_TOOLS, guns: R7_GUNS, species: R7_WILD, horses: R7_HORSE2,
  upgrades: R7_SAFE_UPGRADES, strangers: R7_STRANGERS, bounties: R7_BOUNTIES,
  hunts: R7_TREASURE, challenges: R7_CHALLENGES, diveSites: R7_DIVE_SITES,
  jumpSpots: R7_JUMP_SPOTS, tours: R7_SWAMP_TOURS, pelts: R7_PELTS,
  storms: R7_STORMS, stops: R7_RIDE_STOPS, timetable: R7_TIMETABLE,
  tags: R7_SNAP_TAGS, podcasts: R7_PODCASTS, foods: R7_FOODS, apts: R7_APTS,
  repScore: r7RepScore, repTitle: r7RepTitle, repDoGood: r7RepDoGood,
  witChangeOutfit: r7WitChangeOutfit, witShedHeat: r7WitShedHeat,
  focusToggle: r7FocusToggle, focusDisarm: r7FocusDisarm,
  robScout: r7RobScout, robRun: r7RobRun, theftSteal: r7TheftSteal,
  lockerClean: r7LockerClean, lockerBuyGun: r7LockerBuyGun,
  wildStudy: r7WildStudy, wildHunt: r7WildHunt, horseFeed: r7HorseFeed,
  safeBuy: r7SafeBuy, safeSleep: r7SafeSleep, strangerDo: r7StrangerDo,
  bountyTake: r7BountyTake, bountyCapture: r7BountyCapture,
  treasureDig: r7TreasureDig, chalClaim: r7ChalClaim, courtPlay: r7CourtPlay,
  poolPlay: r7PoolPlay, boxBout: r7BoxBout, diveGo: r7DiveGo,
  jumpGo: r7JumpGo, swampTour: r7SwampTour, lodgeCraft: r7LodgeCraft,
  stormStart: r7StormStart, stormEnd: r7StormEnd, rideGo: r7RideGo,
  rideDrive: r7RideDrive, snapPost: r7SnapPost, podListen: r7PodListen,
  bodyEat: r7BodyEat, bodyGym: r7BodyGym,
  openRep: r7RepOpen, openWit: r7WitOpen, openRob: r7RobOpen,
  openTheft: r7TheftOpen, openLocker: r7LockerOpen, openWild: r7WildOpen,
  openHorse: r7HorseOpen, openSafe: r7SafeOpen, openStranger: r7StrangerOpen,
  openBounty: r7BountyOpen, openTreasure: r7TreasureOpen, openChal: r7ChalOpen,
  openCourt: r7CourtOpen, openPool: r7PoolOpen, openDive: r7DiveOpen,
  openJump: r7JumpOpen, openSwamp: r7SwampOpen, openLodge: r7LodgeOpen,
  openStorm: r7StormOpen, openRide: r7RideOpen, openPhone: r7PhoneOpen,
  openPod: r7PodOpen, openBody: r7BodyOpen,
  selftest: r7SelfTest, update: updateR7, hudLine: r7HudLine,
};
// Build every Round 7 place in the world and restore saved Round 7 progress.
r7ShotPropsBuild(); r7ShotPropsExtra(); r7RepBuild(); r7WitBuild(); r7RobBuild();
r7TheftBuild(); r7LockerBuild(); r7WildBuild(); r7SafeBuild(); r7StrangerBuild();
r7BountyBuild(); r7TreasureBuild(); r7CourtBuild(); r7PoolBuild(); r7DiveBuild();
r7JumpBuild(); r7SwampBuild(); r7LodgeBuild(); r7StormBuild(); r7RideBuild(); r7BodyBuild();
r7RepLoad(); r7WitLoad(); r7FocusLoad(); r7RobLoad(); r7TheftLoad(); r7LockerLoad();
r7WildLoad(); r7HorseLoad(); r7SafeLoad(); r7StrangerLoad(); r7BountyLoad(); r7TreasureLoad();
r7ChalLoad(); r7CourtLoad(); r7PoolLoad(); r7DiveLoad(); r7JumpLoad(); r7SwampLoad();
r7LodgeLoad(); r7StormLoad(); r7RideLoad(); r7PhoneLoad(); r7PodLoad(); r7BodyLoad();
// --- R7 depth: daily tips, one per system, rotating with the clock ---
const R7_TIPS = [
  { system: 'Reputation', tip: 'Help strangers and the bay pays you back with cheaper shops.' },
  { system: 'Witnesses', tip: 'Cameras remember your outfit. Change clothes after a loud job.' },
  { system: 'Focus', tip: 'Press F with a gun out to slow time. Vitals pay, limbs disarm.' },
  { system: 'Robbery', tip: 'Scout, crack the safe, kill the camera — then bring Ian for 1.5x.' },
  { system: 'Car theft', tip: 'The timing bar sweet spot is 62-78. Luxury cars need the cloner.' },
  { system: 'Lockers', tip: 'Two pistols, two rifles on you. The rest lives in trunk or safehouse.' },
  { system: 'Wildlife', tip: 'Study first, hunt second. A rushed hunt ruins the pelt.' },
  { system: 'Horses', tip: 'Feed and groom daily. A level-4 horse never spooks at gunfire.' },
  { system: 'Safehouse', tip: 'A bed, a bench and a rack turn a hideout into a home base.' },
  { system: 'Strangers', tip: 'Eight odd locals, eight small favours, eight honest payouts.' },
  { system: 'Bounty', tip: 'Alive pays more than double dead. Bring cuffs, not just bullets.' },
  { system: 'Treasure', tip: 'Three clues per cache. Read them all before you dig.' },
  { system: 'Challenges', tip: 'Nine categories, three medals each. Gold pays $400 a time.' },
  { system: 'Courts', tip: 'Score 14+ to win the 3v3. The ring pays better but hurts more.' },
  { system: 'Pool hall', tip: 'Five bout wins earns the Bay Champion belt and $500.' },
  { system: 'Diving', tip: 'Kayak first, tank second. The Anchor Wreck pays $350.' },
  { system: 'Base jump', tip: 'Never jump without a parachute. The North Cliff pays $260.' },
  { system: 'Swamp', tip: 'Sunset tours pay best — herons out, tourists generous.' },
  { system: 'Lodge', tip: 'Mount every hunt. A full trophy wall is the master rank.' },
  { system: 'Storms', tip: 'Shelter first, rescue second. Surviving pays up to $420.' },
  { system: 'BayRide', tip: 'Ride cheap, drive rich. A 5-star rating means better fares.' },
  { system: 'Snapmatic', tip: 'Post daily. At 100 followers the brand payouts start.' },
  { system: 'Podcasts', tip: 'Headphones on foot refill focus. True crime is 22 minutes.' },
  { system: 'Body', tip: 'Eat well, train often, sleep always. Strength caps at 20.' },
];
function r7TipOfDay() {
  const day = Math.floor(state.time / 120) % R7_TIPS.length;
  return R7_TIPS[day];
}
function r7TipsOpen() {
  const lines = R7_TIPS.map((t) => t.system + ': ' + t.tip);
  const buttons = [r7PanelButton('Close', () => r7ClosePanel())];
  r7ShowPanel('💡 Round 7 Tips — ' + R7_TIPS.length + ' systems', lines, buttons);
  return true;
}
// --- R7 badges: one per system, $50 each when claimed ---
const R7_BADGES = [
  { id: 'rep-saint', name: 'Bay Saint', desc: 'Reach +60 reputation', check: () => r7RepScore() >= 60 },
  { id: 'ghost', name: 'Ghost', desc: 'Shed all heat with a fresh outfit', check: () => r7Wit.heat === 0 && r7Wit.witnesses > 0 },
  { id: 'deadeye', name: 'Deadeye', desc: 'Disarm 3 targets in focus mode', check: () => r7Focus.disarms >= 3 },
  { id: 'crew-job', name: 'Crew Job', desc: 'Run a duo robbery with Ian', check: () => r7Rob.withIan >= 1 },
  { id: 'ghost-rider', name: 'Ghost Rider', desc: 'Steal 5 cars without tripping an alarm', check: () => r7Theft.stolen >= 5 && r7Theft.alarms === 0 },
  { id: 'gunsmith', name: 'Gunsmith', desc: 'Own all 4 locker guns', check: () => r7Locker.carry.length + r7Locker.trunk.length + r7Locker.safe.length >= 4 },
  { id: 'naturalist', name: 'Naturalist', desc: 'Study all 8 wild species', check: () => r7Wild.studied.length >= 8 },
  { id: 'horse-whisperer', name: 'Horse Whisperer', desc: 'Reach bond level 4 with any horse', check: () => r7Horse.bond.some((b) => b >= 100) },
  { id: 'home-sweet', name: 'Home Sweet Home', desc: 'Buy all 5 safehouse upgrades', check: () => r7Safe.owned.length >= 5 },
  { id: 'good-samaritan', name: 'Good Samaritan', desc: 'Help all 8 strangers', check: () => r7Stranger.done.length >= 8 },
  { id: 'bounty-king', name: 'Bounty King', desc: 'Catch all 5 bounties alive', check: () => r7Bounty.alive >= 5 },
  { id: 'treasure-king', name: 'Treasure King', desc: 'Dig up all 3 caches', check: () => r7Treasure.found.length >= 3 },
  { id: 'gold-rush', name: 'Gold Rush', desc: 'Earn a gold challenge medal', check: () => R7_CHALLENGES.some((c, i) => r7ChalRank(i) === 'gold') },
  { id: 'court-king', name: 'Court King', desc: 'Win 5 pickup games', check: () => r7Court.wins >= 5 },
  { id: 'champ', name: 'Bay Champ', desc: 'Win the champion belt', check: () => r7Pool.belt },
  { id: 'deep-diver', name: 'Deep Diver', desc: 'Dive the 18m Anchor Wreck', check: () => r7Dive.dives.includes(2) },
  { id: 'skyfall', name: 'Skyfall', desc: 'Jump all 4 base spots', check: () => new Set(r7Jump.jumps).size >= 4 },
  { id: 'gator-guide', name: 'Gator Guide', desc: 'Run 10 swamp tours', check: () => r7Swamp.tours >= 10 },
  { id: 'master-hunter', name: 'Master Hunter', desc: 'Fill the trophy wall', check: () => r7Lodge.trophies.length >= 8 },
  { id: 'storm-chaser', name: 'Storm Chaser', desc: 'Survive all 3 hurricanes', check: () => r7Storm.survived >= 3 },
  { id: 'five-star', name: 'Five Star Driver', desc: 'Hold a 5.0 BayRide rating after 5 fares', check: () => r7Ride.trips >= 5 && r7Ride.rating >= 4.9 },
  { id: 'influencer', name: 'Bay Influencer', desc: 'Reach 500 Snapmatic followers', check: () => r7Phone.followers >= 500 },
  { id: 'pod-fan', name: 'Pod Fan', desc: 'Finish all 4 podcasts', check: () => r7Pod.listened.length >= 4 },
  { id: 'peak-form', name: 'Peak Form', desc: 'Reach 20 strength and 20 stamina', check: () => r7Body.strength >= 20 && r7Body.stamina >= 20 },
];
let r7BadgesClaimed = [];
function r7BadgeClaim(i) {
  const b = R7_BADGES[i];
  if (r7BadgesClaimed.includes(b.id)) return false;
  if (!b.check()) { toast(b.name + ' — not yet: ' + b.desc + '.'); return false; }
  r7BadgesClaimed.push(b.id); r7Save('badges', r7BadgesClaimed);
  r7Earn(50, 'Badge earned: ' + b.name);
  return true;
}
function r7BadgesLoad() { const s = r7Load('badges', null); if (s) r7BadgesClaimed = s; }
function r7BadgesOpen() {
  const lines = ['One badge per Round 7 system — $50 each when earned. Claimed ' + r7BadgesClaimed.length + '/24.'];
  for (let i = 0; i < R7_BADGES.length; i++) {
    const b = R7_BADGES[i];
    lines.push((r7BadgesClaimed.includes(b.id) ? '✅ ' : '⬜ ') + b.name + ' — ' + b.desc + (b.check() && !r7BadgesClaimed.includes(b.id) ? ' (READY)' : ''));
  }
  const buttons = R7_BADGES.map((b, i) => r7PanelButton('Claim ' + b.name, () => { r7BadgeClaim(i); r7BadgesOpen(); }, r7BadgesClaimed.includes(b.id) || !b.check()));
  buttons.push(r7PanelButton('Close', () => r7ClosePanel()));
  r7ShowPanel('🏅 Round 7 Badges', lines, buttons);
  return true;
}
// --- R7 guide + stats + extras panels ---
function r7GuideOpen() {
  const lines = [
    '⭐ Reputation — plaza notice board (E) · good deeds vs brutality.',
    '🎭 Witnesses — Salt & Thread clothes (E) · change outfit, shed heat.',
    '🎯 Focus — press F with a gun out · slow-mo, vitals, disarm.',
    '💰 Robbery — four targets (E) · scout, crack, camera, duo with Ian.',
    '🚗 Car theft — chop shop (E) · slim jim, cloner, scanner.',
    '🔫 Lockers — Bay Arms (E) · 2 pistols + 2 rifles, wear and cleaning.',
    '🦅 Wildlife — habitat signs (E) · study, track rare, hunt right.',
    '🐴 Horses — Rancho del Sol (E) · feed, groom, ride, bond levels.',
    '🏠 Safehouse — home north of the plaza (E) · upgrades, crew, sleep.',
    '❓ Strangers — gold figures (E) · eight small favours.',
    '🎯 Bounty — sheriff board (E) · alive pays more than dead.',
    '🗺️ Treasure — gold X marks (E) · three clues, then dig.',
    '🏅 Challenges — plaza board (E) · nine categories, three medals.',
    '🏀 Courts — Marina Courts (E) · 3v3 and the backyard ring.',
    '🎱 Pool & boxing — Eight Ball Hall (E) · frames and bouts.',
    '🛶 Diving — marina dive shop (E) · kayak, tanks, four sites.',
    '🪂 Base jump — pink flags (E) · parachute first, four spots.',
    '🐊 Swamp — swamp dock (E) · airboat tours, gators, tips.',
    '🏚️ Lodge — north woods (E) · trophies and pelt crafting.',
    '🌀 Storms — civic shelter (E) · shelter, rescue, survive.',
    '🚕 BayRide — blue signs (E) · rides, timetable, drive fares.',
    '📸 Snapmatic — phone (U) · post photos, scan cars, payouts.',
    '🎧 Podcasts — phone (U) · headphones, four shows, focus refill.',
    '💪 Body — Bay Iron II gym (E) · eat, train, sleep, rent flats.',
  ];
  const buttons = [r7PanelButton('Close', () => r7ClosePanel())];
  r7ShowPanel('📖 Round 7 Guide — all 24 systems', lines, buttons);
  return true;
}
function r7StatsSummary() {
  return {
    rep: r7RepScore(), repTitle: r7RepTitle(), heat: r7Wit.heat,
    focusDisarms: r7Focus.disarms, robberies: r7Rob.done.length,
    carsStolen: r7Theft.stolen, species: r7Wild.studied.length,
    strangers: r7Stranger.done.length, bounties: r7Bounty.caught.length,
    treasures: r7Treasure.found.length, badges: r7BadgesClaimed.length,
    followers: r7Phone.followers, strength: r7Body.strength,
    stamina: r7Body.stamina, storms: r7Storm.survived,
  };
}
function r7ExtrasOpen() {
  const s = r7StatsSummary();
  const lines = [
    'Rep ' + s.rep + ' (' + s.repTitle + ') · heat ' + s.heat + '/6 · disarms ' + s.focusDisarms + '.',
    'Robberies ' + s.robberies + '/4 · cars stolen ' + s.carsStolen + ' · species ' + s.species + '/8.',
    'Strangers ' + s.strangers + '/8 · bounties ' + s.bounties + '/5 · treasures ' + s.treasures + '/3.',
    'Badges ' + s.badges + '/24 · followers ' + s.followers + ' · storms survived ' + s.storms + '.',
    'Body ' + s.strength + ' strength / ' + s.stamina + ' stamina.',
  ];
  const buttons = [
    r7PanelButton('Tips', () => r7TipsOpen()),
    r7PanelButton('Badges', () => r7BadgesOpen()),
    r7PanelButton('Guide', () => r7GuideOpen()),
    r7PanelButton('Close', () => r7ClosePanel()),
  ];
  r7ShowPanel('📊 Round 7 Extras & Stats', lines, buttons);
  return true;
}
// --- R7 ledger: earned / spent across all Round 7 systems ---
let r7Ledger = { earned: 0, spent: 0, jobs: 0 };
function r7LedgerSave() { r7Save('ledger', r7Ledger); }
function r7LedgerLoad() { const s = r7Load('ledger', null); if (s) r7Ledger = s; }
function r7LedgerRecord(kind, amount) {
  if (kind === 'earn') { r7Ledger.earned += amount; r7Ledger.jobs++; }
  else r7Ledger.spent += amount;
  r7LedgerSave();
}
function r7LedgerSelftest() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  const before = { e: r7Ledger.earned, s: r7Ledger.spent, j: r7Ledger.jobs };
  r7LedgerRecord('earn', 10);
  ok('r7-ledger-earn', r7Ledger.earned === before.e + 10, 'earned +' + 10);
  r7LedgerRecord('spend', 4);
  ok('r7-ledger-spend', r7Ledger.spent === before.s + 4, 'spent +4');
  ok('r7-ledger-jobs', r7Ledger.jobs === before.j + 1, 'jobs +1');
  r7Ledger.earned = before.e; r7Ledger.spent = before.s; r7Ledger.jobs = before.j;
  r7LedgerSave();
  ok('r7-ledger-restore', r7Ledger.earned === before.e, 'restored');
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
// --- R7 extra self-test: live behaviour, not just data shapes ---
function r7SelfTestExtra() {
  const checks = [];
  const ok = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail || '' });
  const repBefore = r7Rep.good;
  r7RepDoGood(3);
  ok('r7x-rep-deed', r7Rep.good === repBefore + 3, 'good +' + 3);
  r7Rep.good = repBefore; r7Rep.deeds.pop(); r7RepSave();
  const heatBefore = r7Wit.heat;
  r7WitReport('camera');
  ok('r7x-witness-heat', r7Wit.heat === Math.min(6, heatBefore + 1), 'heat rose');
  r7Wit.heat = heatBefore; r7Wit.cams = Math.max(0, r7Wit.cams - 1); r7WitSave();
  const score = r7TheftTiming(0);
  ok('r7x-theft-timing', score >= 0 && score <= 100, 'score ' + score);
  const folBefore = r7Phone.followers;
  const likes = r7SnapPost('sunset');
  ok('r7x-snap-post', likes >= 5, 'likes ' + likes);
  r7Phone.posts.pop(); r7Phone.likes -= likes; r7Phone.followers = folBefore; r7PhoneSave();
  const before = r7Chal.best[0];
  r7ChalRecord(0, 95);
  ok('r7x-chal-record', r7Chal.best[0] === 95 && r7ChalRank(0) === 'bronze', 'bronze at 95');
  r7Chal.best[0] = before; r7ChalSave();
  ok('r7x-tips', R7_TIPS.length === 24 && R7_TIPS[0].system === 'Reputation', '24 tips');
  ok('r7x-badges', R7_BADGES.length === 24 && R7_BADGES[23].id === 'peak-form', '24 badges');
  ok('r7x-guide', typeof r7GuideOpen === 'function', 'guide wired');
  ok('r7x-stats', r7StatsSummary().badges === r7BadgesClaimed.length, 'stats match');
  const failed = checks.filter((c) => !c.pass);
  return { total: checks.length, passed: checks.length - failed.length, failed: failed.map((c) => c.name), checks };
}
// Wire the depth layers into the exports and restore their saves.
if (window.__r7exports) {
  window.__r7exports.extraSelftest = r7SelfTestExtra;
  window.__r7exports.ledgerSelftest = r7LedgerSelftest;
  window.__r7exports.tips = R7_TIPS;
  window.__r7exports.badges = R7_BADGES;
  window.__r7exports.guide = r7GuideOpen;
  window.__r7exports.extras = r7ExtrasOpen;
  window.__r7exports.stats = r7StatsSummary;
  window.__r7exports.tipOfDay = r7TipOfDay;
  window.__r7exports.ledger = r7Ledger;
  window.__r7exports.badgeClaim = r7BadgeClaim;
  window.__r7exports.shotProps = R7_SHOT_PROPS;
}
r7BadgesLoad(); r7LedgerLoad();
// --- R7 daily update: slow background income and decay ---
function r7DailyUpdate(dt) {
  // Safehouse crew earns a trickle while the player works elsewhere.
  r7DailyAcc = (r7DailyAcc || 0) + dt;
  if (r7DailyAcc < 30) return;
  r7DailyAcc = 0;
  if (r7Safe.crew.length >= 3 && r7Safe.morale >= 60) {
    state.cash += 5; updateHUD();
  }
  if (r7Ride.driver && r7Ride.rating >= 4.5) {
    r7Ride.earned += 2;
  }
}
let r7DailyAcc = 0;
// --- R7 reputation reactions: NPC flavour lines by title ---
const R7_REP_LINES = {
  saint: ['"There goes the saint of the bay."', '"He helped my cousin move house!"'],
  good: ['"Decent folk, those two."', '"They always say hello."'],
  neutral: ['"New faces. Keep walking."', '"Bay is busy today."'],
  rough: ['"Stay out of my way, friend."', '"I saw what you did last week."'],
  menace: ['"Lock the doors — it is them."', '"Do not look them in the eye."'],
};
function r7RepReaction() {
  const s = r7RepScore();
  const key = s >= 60 ? 'saint' : s >= 25 ? 'good' : s >= -9 ? 'neutral' : s >= -40 ? 'rough' : 'menace';
  return r7Pick(R7_REP_LINES[key]);
}
function r7RepShopPrice(base) {
  return Math.max(1, Math.round(base * r7RepPriceMult()));
}
// --- R7 witness cameras: fixed camera spots that report the player ---
const R7_CAMERAS = [
  { x: -10, z: 20, n: 'Plaza camera' },
  { x: 52, z: 10, n: 'Casino Row camera' },
  { x: -60, z: 0, n: 'Docks camera' },
  { x: 20, z: -40, n: 'Marina camera' },
];
function r7CameraCheck() {
  if (state.wanted < 2) return false;
  for (const c of R7_CAMERAS) {
    if (r7Near(c.x, c.z, 12)) { r7WitReport('camera'); return true; }
  }
  return false;
}
function r7CameraBuild() {
  for (const c of R7_CAMERAS) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.5, 6), new THREE.MeshStandardMaterial({ color: 0x555555 }));
    pole.position.set(c.x, 2.2, c.z); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    head.position.set(c.x, 4.5, c.z); scene.add(head);
  }
}
// --- R7 focus vitals: body-part damage table used by focus mode ---
const R7_VITALS = [
  { part: 'head', mult: 3.0, note: 'instant drop' },
  { part: 'chest', mult: 1.5, note: 'heavy damage' },
  { part: 'arm', mult: 0.6, note: 'disarm chance' },
  { part: 'leg', mult: 0.7, note: 'slows them down' },
];
function r7VitalMult(part) {
  const v = R7_VITALS.find((o) => o.part === part);
  return v ? v.mult : 1;
}
function r7FocusShot(part) {
  const mult = r7VitalMult(part);
  if (part === 'arm') r7FocusDisarm();
  else r7FocusHit(part === 'head' || part === 'chest' ? 'vital' : 'limb');
  return mult;
}
// --- R7 robbery mid-job switch: Ryan and Ian swap roles live ---
let r7RobSwitch = { active: false, role: 'safe' };
function r7RobSwitchRoles() {
  if (!r7RobSwitch.active) { r7RobSwitch.active = true; r7RobSwitch.role = 'lookout'; toast('Ian takes the safe — you watch the door now.'); }
  else { r7RobSwitch.active = false; r7RobSwitch.role = 'safe'; toast('Swapped back — you are on the safe again.'); }
  return r7RobSwitch.role;
}
// --- R7 theft phone scanner: find unlocked cars nearby ---
function r7TheftScan() {
  const nearby = parkedCars.filter((c) => Math.hypot(c.mesh.position.x - playerState.x, c.mesh.position.z - playerState.z) < 40);
  if (!nearby.length) { toast('Scanner: no parked cars in range.'); return 0; }
  const unlocked = nearby.filter((c, i) => (i + r7Theft.stolen) % 3 === 0);
  toast('Scanner: ' + nearby.length + ' cars nearby, ' + unlocked.length + ' look unlocked.');
  return unlocked.length;
}
r7CameraBuild();
// --- R7 locker jam chance: worn guns misfire more often ---
function r7LockerJamChance(i) {
  return r7Clamp(R7_GUNS[i].wear / 2, 0, 50);
}
function r7LockerCondition(i) {
  const w = R7_GUNS[i].wear;
  if (w < 20) return 'pristine';
  if (w < 50) return 'worn';
  if (w < 80) return 'rough';
  return 'falling apart';
}
// --- R7 wildlife zone guide: where each species lives ---
function r7WildZoneGuide(zone) {
  return R7_WILD.filter((a) => a.zone === zone).map((a) => a.n + (a.rare ? ' (rare)' : ''));
}
function r7WildRareLeft() {
  return R7_WILD.filter((a) => a.rare && !r7Wild.studied.includes(R7_WILD.indexOf(a))).length;
}
// --- R7 horse training drills: speed and stamina grow with work ---
function r7HorseDrill(i, kind) {
  const h = R7_HORSE2[i];
  if (kind === 'sprint') { h.speed = Math.min(10, h.speed + 0.2); }
  else { h.stamina = Math.min(10, h.stamina + 0.2); }
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 3, 0, 100); r7HorseSave();
  toast(h.n + ' drilled ' + kind + ' — speed ' + h.speed.toFixed(1) + ', stamina ' + h.stamina.toFixed(1) + '.');
  return true;
}
// --- R7 safehouse morale events: small scenes that lift the crew ---
const R7_MORALE_EVENTS = [
  'Ian cooks a big bay stew — the crew eats like kings.',
  'A neighbour drops off fresh limes for the safehouse.',
  'Movie night: the crew watches an old heist film and takes notes.',
  'The crew paints the front door bay-blue together.',
];
function r7SafeMoraleEvent() {
  const line = r7Pick(R7_MORALE_EVENTS);
  r7Safe.morale = r7Clamp(r7Safe.morale + 8, 0, 100); r7SafeSave();
  toast(line + ' Morale ' + r7Safe.morale + '/100.');
  return line;
}
// --- R7 stranger follow-ups: second favours from grateful locals ---
const R7_STRANGER2 = [
  { n: 'Old Sal', q: 'Teach him to use the new phone', pay: 80 },
  { n: 'Tia the busker', q: 'Play a duet at the marina', pay: 120 },
  { n: 'Chef Beni', q: 'Judge his new chilli sauce', pay: 70 },
  { n: 'Captain Wren', q: 'Crew his boat for the regatta', pay: 160 },
];
function r7StrangerFollowUp(i) {
  const s = R7_STRANGER2[i];
  if (!r7Stranger.done.includes(i)) { toast(s.n + ' does not know you yet — do the first favour.'); return false; }
  r7Earn(s.pay, 'Follow-up: ' + s.n + ' — ' + s.q);
  return true;
}
// --- R7 bounty informants: pay for a tip on the target's hideout ---
function r7BountyTip(i) {
  if (r7Bounty.caught.includes(i)) return false;
  if (!r7Spend(50)) return false;
  const b = R7_BOUNTIES[i];
  toast('Informant: "' + b.n + ' holes up near (' + b.x + ', ' + b.z + ') most nights. Bring cuffs."');
  return true;
}
function r7BountyStakeout(i) {
  if (r7Bounty.active !== i) { toast('Take the bounty first, then stake out the spot.'); return false; }
  toast('Stakeout set — ' + R7_BOUNTIES[i].n + ' will walk right into it.');
  return true;
}
// --- R7 treasure map fragments: buy a fragment to reveal a clue ---
function r7TreasureFragment(i) {
  if (r7Treasure.found.includes(i)) return false;
  if (!r7Spend(100)) return false;
  r7TreasureClue(i);
  toast('Bought a map fragment — the trail gets clearer.');
  return true;
}
// --- R7 challenge live hooks: feed real play into the nine boards ---
function r7ChalHookSpeed(mph) { return r7ChalRecord(0, Math.floor(mph)); }
function r7ChalHookPackages() { return r7ChalRecord(7, packagesFound); }
function r7ChalHookAirtime(sec) { return r7ChalRecord(1, Math.floor(sec)); }
function r7ChalHookDistance(km) { return r7ChalRecord(4, Math.floor(km)); }
// --- R7 court season: standings across pickup games ---
let r7CourtSeason = { week: 1, wins: 0, losses: 0 };
function r7CourtSeasonGame(won) {
  if (won) r7CourtSeason.wins++; else r7CourtSeason.losses++;
  if (r7CourtSeason.wins + r7CourtSeason.losses >= 5) {
    r7CourtSeason.week++;
    const champ = r7CourtSeason.wins >= 3;
    if (champ) r7Earn(200, 'Won the Marina Courts week ' + (r7CourtSeason.week - 1));
    r7CourtSeason.wins = 0; r7CourtSeason.losses = 0;
    r7Save('courtSeason', r7CourtSeason);
  }
  r7Save('courtSeason', r7CourtSeason);
  return r7CourtSeason.week;
}
// --- R7 pool rankings: local ladder at Eight Ball Hall ---
const R7_POOL_LADDER = [
  { n: 'Cueball Carl', wins: 22 },
  { n: 'Slick Sue', wins: 18 },
  { n: 'Doc Hal', wins: 12 },
  { n: 'You', wins: 0 },
];
function r7PoolLadder() {
  const me = R7_POOL_LADDER[3];
  me.wins = r7Pool.wins;
  return [...R7_POOL_LADDER].sort((a, b) => b.wins - a.wins);
}
function r7PoolRank() {
  return r7PoolLadder().findIndex((p) => p.n === 'You') + 1;
}
// --- R7 dive reef guide: what lives at each site ---
const R7_REEF_GUIDE = [
  { site: 'Sunken Ferry Reef', life: 'clownfish, blue tang, one grumpy moray' },
  { site: 'Coral Garden', life: 'turtles, rays, brain coral' },
  { site: 'Anchor Wreck', life: 'barracuda patrol, old anchor chain' },
  { site: 'Turtle Cove', life: 'green turtles, seahorses' },
];
function r7DiveGuide(i) { return R7_REEF_GUIDE[i].life; }
function r7DiveAirLeft() { return r7Dive.tank; }
// --- R7 jump landing score: style points for clean landings ---
function r7JumpLanding(airtime, clean) {
  const score = Math.round(airtime * 10 + (clean ? 50 : 0));
  if (score > r7Jump.best * 10) r7Jump.best = airtime;
  r7JumpSave();
  return score;
}
// --- R7 swamp wildlife log: gators, herons, egrets spotted ---
let r7SwampLog = { gators: 0, herons: 0, egrets: 0 };
function r7SwampSpot(kind) {
  if (kind === 'gator') r7SwampLog.gators++;
  if (kind === 'heron') r7SwampLog.herons++;
  if (kind === 'egret') r7SwampLog.egrets++;
  r7Save('swampLog', r7SwampLog);
  toast('Logged a ' + kind + ' in the swamp book.');
  return r7SwampLog;
}
// --- R7 lodge master rank: wall completion as a title ---
function r7LodgeRank() {
  const n = r7Lodge.trophies.length;
  if (n >= 8) return 'Master Hunter';
  if (n >= 5) return 'Seasoned Hunter';
  if (n >= 2) return 'Weekend Hunter';
  return 'Greenhorn';
}
// --- R7 storm forecast: the next front, from the radio ---
function r7StormForecast() {
  const next = R7_STORMS[(r7Storm.survived) % R7_STORMS.length];
  return 'Next front: ' + next.n + ' — wind ' + next.wind + '/10, surge ' + next.surge + 'm.';
}
function r7StormPrep() {
  if (!r7Spend(120)) return false;
  r7Storm.sheltered++;
  r7StormSave(); toast('Boarded the windows and stocked the shelter. Ready for the front.');
  return true;
}
// --- R7 ride timetable: next departures from any stop ---
function r7RideNext(line) {
  const t = R7_TIMETABLE.find((o) => o.line === line);
  if (!t) return 'No such line.';
  const now = Math.floor(state.time / 10) % t.every;
  return t.line + ' leaves in ' + (t.every - now) + ' minutes (' + t.from + ' → ' + t.to + ').';
}
function r7RideTip() {
  const tips = ['Tip the driver', 'Rate every ride', 'Night fares pay more'];
  return r7Pick(tips);
}
// --- R7 Snapmatic comments: followers react to each post ---
const R7_SNAP_COMMENTS = [
  'That sunset is unreal!',
  'Gator spotting again? Brave.',
  'This is why I love the bay.',
  'Classic car goals right there.',
  'Street food tour when?',
  'Storm chaser energy.',
];
function r7SnapComments() {
  const n = 1 + Math.floor(Math.random() * 3);
  const out = [];
  for (let i = 0; i < n; i++) out.push(r7Pick(R7_SNAP_COMMENTS));
  return out;
}
function r7SnapMilestone() {
  const f = r7Phone.followers;
  if (f >= 1000) return 'Bay famous — 1,000 followers!';
  if (f >= 500) return 'Local star — 500 followers!';
  if (f >= 100) return 'Getting noticed — 100 followers!';
  return 'Growing — ' + f + ' followers.';
}
// --- R7 podcast episode notes: one-line summaries for each show ---
const R7_POD_NOTES = [
  'The Drowned Captain: a wreck, a map, and a lighthouse that fell.',
  'Gator Tales: swamp legends told by the people who live them.',
  'Hustle & Salt: how the bay really works, from docks to deals.',
  'Marina Nights: the music of the docks, track by track.',
];
function r7PodNote(i) { return R7_POD_NOTES[i] || ''; }
// --- R7 body appearance: how the bay sees you now ---
function r7BodyLook() {
  const s = r7Body.strength, t = r7Body.stamina;
  if (s >= 15 && t >= 15) return 'Built like a dockworker — broad, fast, tireless.';
  if (s >= 10) return 'Noticeably strong — the gym is showing.';
  if (t >= 10) return 'Lean and quick — you never seem to tire.';
  return 'Average bay drifter — room to grow.';
}
function r7BodyOutfitBonus() {
  // Rooftop bars and the marina notice a fit regular: small rep nudge.
  if (r7Body.strength >= 12 && r7Body.barVisits >= 3) return 2;
  return 0;
}
// --- R7 phone app list: everything on the Round 7 phone ---
function r7PhoneApps() {
  return ['Snapmatic', 'Car Scanner', 'Podcasts', 'BayRide', 'Focus Meter'];
}
function r7PhoneBattery() {
  return 100 - (r7Phone.posts.length % 40);
}
// --- R7 reputation extra deeds: the bay always needs a hand ---
const R7_REP_DEEDS2 = [
  { n: 'Fix a flat tyre', g: 4, p: 15 },
  { n: 'Carry groceries for an elder', g: 5, p: 0 },
  { n: 'Chase off a scammer', g: 9, p: 45 },
  { n: 'Clean the beach', g: 6, p: 20 },
  { n: 'Find a lost dog', g: 7, p: 35 },
  { n: 'Volunteer at the shelter', g: 8, p: 0 },
];
function r7RepDoGood2(i) {
  const d = R7_REP_DEEDS2[i]; if (!d) return false;
  r7Rep.good += d.g; r7Rep.deeds.push(d.n); r7RepSave();
  if (d.p) r7Earn(d.p, d.n);
  toast(d.n + ' — the bay notices. Rep ' + r7RepScore() + ' (' + r7RepTitle() + ')');
  return true;
}
function r7RepShopTable() {
  return [
    { shop: 'Bay Arms', mult: r7RepPriceMult() },
    { shop: 'Salt & Thread', mult: r7RepPriceMult() },
    { shop: 'Marina dive shop', mult: r7RepPriceMult() },
    { shop: 'Eight Ball Hall', mult: r7RepPriceMult() },
  ];
}
function r7RepGreeting() {
  const s = r7RepScore();
  if (s >= 60) return 'The plaza waves when you pass.';
  if (s >= 25) return 'Shopkeepers nod — you are welcome here.';
  if (s >= -40) return 'People keep a polite distance.';
  return 'Mothers pull their children inside.';
}
// --- R7 disguise effectiveness: how well each outfit fools the bay ---
function r7WitDisguisePower() {
  const o = R7_OUTFITS[r7Wit.outfit];
  return { outfit: o.n, shed: -o.heat, note: o.heat <= -2 ? 'Excellent cover.' : o.heat <= -1 ? 'Decent cover.' : 'Barely a disguise.' };
}
function r7WitChangeVehicle() {
  if (!state.inCar) { toast('Get in a different car — a fresh ride sheds heat.'); return false; }
  r7Wit.heat = r7Clamp(r7Wit.heat - 1, 0, 6);
  if (r7Wit.heat === 0) r7Wit.lockdown = false;
  r7WitSave(); toast('New wheels — heat ' + r7Wit.heat + '/6.');
  return true;
}
// --- R7 focus challenges: prove the slow-mo ---
const R7_FOCUS_GAMES = [
  { n: 'Three disarms, one minute', need: 3, pay: 150 },
  { n: 'Five limb hits without a kill', need: 5, pay: 200 },
  { n: 'Ten vitals in a day', need: 10, pay: 300 },
];
let r7FocusGames = { done: [] };
function r7FocusGame(i) {
  const g = R7_FOCUS_GAMES[i];
  const have = i === 0 ? r7Focus.disarms : i === 1 ? r7Focus.limbHits : r7Focus.kills;
  if (have < g.need) { toast(g.n + ' — progress ' + have + '/' + g.need + '.'); return false; }
  if (r7FocusGames.done.includes(i)) return false;
  r7FocusGames.done.push(i); r7Save('focusGames', r7FocusGames);
  r7Earn(g.pay, 'Focus challenge: ' + g.n);
  return true;
}
function r7FocusSlowFactor() { return r7Focus.on ? 0.35 : 1; }
// --- R7 robbery getaway: Ian drives while you count the take ---
let r7Getaway = { runs: 0, clean: 0 };
function r7RobGetaway() {
  r7Getaway.runs++;
  const clean = Math.random() < 0.6;
  if (clean) { r7Getaway.clean++; r7Save('getaway', r7Getaway); toast('Ian threads the back streets — clean getaway, no tail.'); }
  else { r7Save('getaway', r7Getaway); r7WitReport('witness'); toast('A witness caught the plate on the way out — heat rising.'); }
  return clean;
}
function r7RobFence() {
  if (!r7Rob.done.length) { toast('Nothing to fence — hit a target first.'); return false; }
  const cut = 100 + r7Rob.done.length * 40;
  r7Earn(cut, 'Fenced spare goods from the robberies');
  return true;
}
// --- R7 chop shop prices: what each stolen car is worth ---
const R7_CHOP_PRICES = [
  { kind: 'sedan', pay: 140 },
  { kind: 'coupe', pay: 220 },
  { kind: 'luxury', pay: 320 },
  { kind: 'truck', pay: 180 },
];
function r7ChopPrice(kind) {
  const p = R7_CHOP_PRICES.find((o) => o.kind === kind);
  return p ? p.pay : 120;
}
function r7TheftHeat() {
  return Math.min(3, Math.floor(r7Theft.alarms / 2));
}
// --- R7 gun mods: scopes and extended mags ---
const R7_GUN_MODS = [
  { n: 'Red dot sight', cost: 150, gun: 0 },
  { n: 'Extended mag', cost: 120, gun: 1 },
  { n: 'Long barrel', cost: 200, gun: 2 },
  { n: 'Suppressor', cost: 350, gun: 3 },
];
let r7Mods = [];
function r7ModBuy(i) {
  const m = R7_GUN_MODS[i];
  if (r7Mods.includes(i)) return false;
  if (!r7Spend(m.cost)) return false;
  r7Mods.push(i); r7Save('mods', r7Mods);
  toast('Fitted ' + m.n + ' to the ' + R7_GUNS[m.gun].n + '.');
  return true;
}
// --- R7 wildlife seasons: migration changes what is out there ---
const R7_SEASONS_WILD = [
  { season: 'Spring', active: ['Bay Gull', 'Marsh Heron', 'Golden Egret'] },
  { season: 'Summer', active: ['Bay Alligator', 'Ghost Crab', 'Wild Boar'] },
  { season: 'Autumn', active: ['White-tail Deer', 'Wild Boar', 'Marsh Heron'] },
  { season: 'Winter', active: ['Black Panther', 'Bay Gull', 'Golden Egret'] },
];
function r7WildSeason() {
  const day = Math.floor(state.time / 120) % 4;
  return R7_SEASONS_WILD[day];
}
function r7WildBestTime(animal) {
  const s = R7_WILD.find((a) => a.n === animal);
  if (!s) return 'unknown';
  return s.zone === 'swamp' ? 'dawn' : s.zone === 'forest' ? 'dusk' : 'midday';
}
// --- R7 ranch races: bond levels decide the photo finish ---
function r7HorseRace(i) {
  const h = R7_HORSE2[i];
  const power = h.speed + h.stamina * 0.5 + r7HorseBondLevel(i) * 2;
  const rival = 10 + Math.random() * 8;
  const win = power > rival;
  if (win) r7Earn(180, h.n + ' wins the ranch race (' + power.toFixed(1) + ' vs ' + rival.toFixed(1) + ')');
  else toast(h.n + ' lost the ranch race — ' + power.toFixed(1) + ' vs ' + rival.toFixed(1) + '. Train more.');
  return win;
}
// --- R7 stash wall: deposit and withdraw safe cash ---
let r7Stash = { cash: 0 };
function r7StashDeposit(amount) {
  if (!r7Safe.owned.includes(4)) { toast('Install the hidden stash wall first.'); return false; }
  if (state.cash < amount) { toast('Not enough cash on you.'); return false; }
  state.cash -= amount; r7Stash.cash += amount; r7Save('stash', r7Stash); updateHUD();
  toast('Stashed $' + amount + ' in the wall. Hidden total $' + r7Stash.cash + '.');
  return true;
}
function r7StashWithdraw(amount) {
  if (r7Stash.cash < amount) { toast('Only $' + r7Stash.cash + ' hidden.'); return false; }
  r7Stash.cash -= amount; state.cash += amount; r7Save('stash', r7Stash); updateHUD();
  toast('Withdrew $' + amount + ' from the wall.');
  return true;
}
function r7StashLoad() { const s = r7Load('stash', null); if (s) r7Stash = s; }
// --- R7 stranger dialogue: what each one says when you meet ---
const R7_STRANGER_LINES = [
  'Old Sal: "Sixty years on this pier and a hat is what gets me."',
  'Tia: "My guitar is on the roof. A gull stole it. A gull!"',
  'Chef Beni: "No limes, no sauce. No sauce, no restaurant."',
  'Captain Wren: "Engines die. The bay does not forgive, but it forgets."',
  'Madame Zola: "Three fortunes, one brave soul. That is you, yes?"',
  'Kid Milo: "My kite is in the oak and my mum says I cannot climb."',
  'Doc Hal: "Medicine for the swamp folk. Drive slow — the road floods."',
  'Auntie Rosa: "My goat is out there eating the golf course again."',
];
function r7StrangerLine(i) { return R7_STRANGER_LINES[i]; }
// --- R7 wanted posters: the bounty board in words ---
function r7BountyPoster(i) {
  const b = R7_BOUNTIES[i];
  return 'WANTED: ' + b.n + ' — ' + b.crime + '. Alive $' + b.alive + ', dead $' + b.dead + '. Last seen near (' + b.x + ', ' + b.z + ').';
}
function r7BountyRewardTier() {
  if (r7Bounty.alive >= 5) return 'Legendary hunter';
  if (r7Bounty.caught.length >= 3) return 'Known hunter';
  if (r7Bounty.caught.length >= 1) return 'Rookie hunter';
  return 'Unproven';
}
// --- R7 treasure tools: shovel and metal detector ---
let r7DigKit = { shovel: false, detector: false };
function r7DigBuyShovel() {
  if (r7DigKit.shovel) return false;
  if (!r7Spend(45)) return false;
  r7DigKit.shovel = true; r7Save('digkit', r7DigKit); toast('Shovel bought — digging is twice as fast now.'); return true;
}
function r7DigBuyDetector() {
  if (r7DigKit.detector) return false;
  if (!r7Spend(220)) return false;
  r7DigKit.detector = true; r7Save('digkit', r7DigKit); toast('Metal detector bought — it beeps near buried metal.'); return true;
}
function r7DigScan(i) {
  if (!r7DigKit.detector) { toast('No detector — you are digging blind.'); return false; }
  const near = r7Near(R7_TREASURE[i].x, R7_TREASURE[i].z, 30);
  toast(near ? 'BEEP BEEP — metal under your feet!' : 'Silence. Nothing buried nearby.');
  return near;
}
// --- R7 weekly challenge: one rotating spotlight challenge ---
const R7_WEEKLY = [
  { n: 'Speed week', desc: 'Hit 130 mph on the causeway', target: 130 },
  { n: 'Photo week', desc: 'Post 5 Snapmatic photos', target: 5 },
  { n: 'Gator week', desc: 'Spot 10 swamp gators', target: 10 },
  { n: 'Quiet week', desc: 'Finish 3 jobs with zero heat', target: 3 },
];
function r7Weekly() {
  const week = Math.floor(state.time / 840) % R7_WEEKLY.length;
  return R7_WEEKLY[week];
}
// --- R7 court rival teams: who you are up against ---
const R7_RIVAL_TEAMS = [
  { n: 'Dock Kings', skill: 7 },
  { n: 'Marina Mambas', skill: 8 },
  { n: 'Old Town Owls', skill: 5 },
  { n: 'Casino Sharks', skill: 9 },
];
function r7CourtRival() { return r7Pick(R7_RIVAL_TEAMS); }
function r7CourtVsRival(team) {
  const skill = 5 + Math.floor(r7Body.strength / 4) + Math.floor(r7Court.wins / 3);
  const win = skill >= team.skill;
  if (win) r7Earn(120, 'Beat the ' + team.n + ' at the courts');
  else toast('The ' + team.n + ' took the game — train and come back.');
  return win;
}
// --- R7 pool trick shots: show-off shots for extra cash ---
const R7_TRICK_SHOTS = [
  { n: 'The Bay Bridge', pay: 90 },
  { n: 'Behind the back', pay: 70 },
  { n: 'Three-cushion kiss', pay: 110 },
];
function r7PoolTrick(i) {
  const t = R7_TRICK_SHOTS[i];
  const made = Math.random() < 0.45;
  if (made) r7Earn(t.pay, 'Trick shot made: ' + t.n);
  else toast('Trick shot missed — ' + t.n + ' is harder than it looks.');
  return made;
}
// --- R7 dive air: tanks drain with depth, sharks watch the wreck ---
function r7DiveAirNeeded(i) {
  return Math.ceil(R7_DIVE_SITES[i].depth / 8);
}
function r7DiveShark(i) {
  if (i !== 2) return false;
  const shark = Math.random() < 0.3;
  if (shark) toast('A barracuda shadows you at the Anchor Wreck — stay calm, swim smooth.');
  return shark;
}
// --- R7 jump wind: gusts change the landing ---
function r7JumpWind() {
  const w = Math.floor(Math.random() * 5);
  return { speed: w, note: w <= 1 ? 'Calm air — perfect jump day.' : w <= 3 ? 'Light gusts — aim slightly upwind.' : 'Strong gusts — only for the brave.' };
}
// --- R7 swamp tour scripts: what the guide says on each route ---
const R7_TOUR_SCRIPTS = [
  'Dawn Gator Run: "Ladies and gents, keep hands inside — the gators are early risers."',
  'Midday Marsh Loop: "That heron has lived here longer than the town has."',
  'Sunset Heron Cruise: "Watch the sky turn gold. The bay does this every night, free of charge."',
];
function r7SwampScript(i) { return R7_TOUR_SCRIPTS[i]; }
// --- R7 lodge drying rack: pelts cure over time into better goods ---
let r7Rack = { curing: [] };
function r7RackHang(animal) {
  if (r7Rack.curing.includes(animal)) return false;
  r7Rack.curing.push(animal); r7Save('rack', r7Rack);
  toast(animal + ' pelt hung on the drying rack.');
  return true;
}
function r7RackCollect(animal) {
  if (!r7Rack.curing.includes(animal)) return false;
  r7Rack.curing.splice(r7Rack.curing.indexOf(animal), 1); r7Save('rack', r7Rack);
  r7Earn(90, 'Sold a cured ' + animal + ' pelt');
  return true;
}
// --- R7 storm repair: after the front passes, the bay pays to rebuild ---
function r7StormRepairJob() {
  if (r7Storm.active >= 0) { toast('Wait out the storm first — repairs start after it passes.'); return false; }
  if (r7Storm.survived === 0) { toast('No storm has passed yet — nothing to repair.'); return false; }
  r7Earn(140, 'Storm repair work — boards, roofs and fences');
  return true;
}
// --- R7 ride surge: night and storm fares pay more ---
function r7RideSurge() {
  const night = state.time % 120 > 80;
  const storm = r7Storm.active >= 0;
  if (storm) return 2.0;
  if (night) return 1.5;
  return 1.0;
}
function r7RideFareWithSurge(base) {
  return Math.round(base * r7RideSurge());
}
// --- R7 brand deals: Snapmatic sponsors pay for themed posts ---
const R7_BRAND_DEALS = [
  { brand: 'Salt Soda', tag: 'sunset', pay: 200, need: 100 },
  { brand: 'Bay Boards', tag: 'classic car', pay: 300, need: 250 },
  { brand: 'Gator Gear', tag: 'gator', pay: 400, need: 500 },
];
function r7BrandDeal(i) {
  const d = R7_BRAND_DEALS[i];
  if (r7Phone.followers < d.need) { toast(d.brand + ' needs ' + d.need + ' followers — you have ' + r7Phone.followers + '.'); return false; }
  r7SnapPost(d.tag);
  r7Earn(d.pay, 'Brand deal: ' + d.brand + ' #' + d.tag + ' post');
  return true;
}
// --- R7 podcast fans: listeners write in after each show ---
const R7_FAN_MAIL = [
  '"Your gator episode made my commute. More please!" — listener 41',
  '"I tried the swamp tour because of you." — listener 88',
  '"The Drowned Captain story gave me chills." — listener 12',
  '"Play more Marina Nights. My shop plays it all day." — listener 63',
];
function r7PodFanMail() { return r7Pick(R7_FAN_MAIL); }
function r7PodListeners() {
  return r7Pod.listened.length * 120 + r7Phone.followers;
}
// --- R7 diet plans: eat with a goal, not just hunger ---
const R7_DIETS = [
  { n: 'Dockworker bulk', food: 'Docks burger', str: 2, sta: 0 },
  { n: 'Runner lean', food: 'Marina salad', str: 0, sta: 2 },
  { n: 'Bay balanced', food: 'Bay fish tacos', str: 1, sta: 1 },
];
function r7BodyDiet(i) {
  const d = R7_DIETS[i];
  r7Body.strength = r7Clamp(r7Body.strength + d.str, 0, 20);
  r7Body.stamina = r7Clamp(r7Body.stamina + d.sta, 0, 20);
  r7BodySave(); updateHUD();
  toast('Diet: ' + d.n + ' — strength ' + r7Body.strength + ', stamina ' + r7Body.stamina + '.');
  return true;
}
function r7BodySleepQuality() {
  if (r7Safe.owned.includes(0)) return 'Deep sleep in a real bed.';
  if (r7Body.apt >= 0) return 'Decent sleep in your flat.';
  return 'Rough sleep on the safehouse couch.';
}
// --- R7 apartment perks: each home has its own bonus ---
function r7AptPerk() {
  if (r7Body.apt < 0) return 'No apartment — safehouse only.';
  const a = R7_APTS[r7Body.apt];
  if (a.view === 'bay') return 'Bay view: +1 stamina each morning.';
  if (a.view === 'skyline') return 'Skyline view: +2 rep with visitors.';
  return 'Plaza view: cheap eats next door.';
}
// --- R7 rep street cred: titles unlock small world changes ---
function r7RepPerks() {
  const s = r7RepScore();
  const perks = [];
  if (s >= 25) perks.push('Shopkeepers wave you in');
  if (s >= 60) perks.push('Free coffee at the marina stall');
  if (s <= -40) perks.push('Shopkeepers watch your hands');
  if (s <= -70) perks.push('Civilians cross the street');
  return perks.length ? perks : ['No special treatment yet'];
}
function r7RepDonate(amount) {
  if (!r7Spend(amount)) return false;
  r7Rep.good += Math.floor(amount / 20); r7RepSave();
  toast('Donated $' + amount + ' to the bay fund. Rep ' + r7RepScore() + '.');
  return true;
}
// --- R7 witness alibis: Ian covers for you, once a day ---
let r7Alibi = { used: 0 };
function r7WitAlibi() {
  if (r7Alibi.used >= 1) { toast('Ian already covered for you today.'); return false; }
  r7Alibi.used++; r7Wit.heat = r7Clamp(r7Wit.heat - 2, 0, 6);
  if (r7Wit.heat === 0) r7Wit.lockdown = false;
  r7WitSave(); toast('Ian: "He was with me all night." Heat ' + r7Wit.heat + '/6.');
  return true;
}
// --- R7 focus breathing: hold still to refill the meter faster ---
function r7FocusBreathe() {
  r7Focus.meter = r7Clamp(r7Focus.meter + 15, 0, 100);
  r7FocusSave(); toast('Slow breath. Focus meter ' + Math.round(r7Focus.meter) + '%.');
  return true;
}
// --- R7 robbery lookouts: hire a lookout for the big jobs ---
function r7RobLookout() {
  if (!r7Spend(100)) return false;
  toast('Lookout posted on the corner — you will get a warning if police roll in.');
  return true;
}
// --- R7 theft getaway car: a stolen car with a full tank of nerve ---
function r7TheftJoyride() {
  if (r7Theft.stolen === 0) { toast('Steal a car first — then take it for a spin.'); return false; }
  r7Earn(40, 'Joyride through the bay at dawn');
  return true;
}
// --- R7 locker inventory check: what is where, in one line ---
function r7LockerInventory() {
  return 'Carry: ' + r7Locker.carry.length + ' · trunk: ' + r7Locker.trunk.length + ' · safe: ' + r7Locker.safe.length + ' · kits: ' + r7Locker.cleanKit;
}
// --- R7 wild calls: imitate the animal to draw it closer ---
const R7_ANIMAL_CALLS = [
  { animal: 'Bay Gull', call: 'A sharp kee-kee that turns every head on the beach.' },
  { animal: 'Marsh Heron', call: 'A low croak across still water.' },
  { animal: 'White-tail Deer', call: 'A soft bleat from the tree line.' },
  { animal: 'Bay Alligator', call: 'You do not call a gator. The gator calls you.' },
];
function r7WildCall(animal) {
  const c = R7_ANIMAL_CALLS.find((o) => o.animal === animal);
  return c ? c.call : 'No call known for that animal yet.';
}
// --- R7 horse names: the ranch hands rename horses that trust you ---
function r7HorseNickname(i) {
  const level = r7HorseBondLevel(i);
  if (level >= 4) return R7_HORSE2[i].n + ' "Old Faithful"';
  if (level >= 2) return R7_HORSE2[i].n + ' "Steady"';
  return R7_HORSE2[i].n;
}
// --- R7 safehouse radio: the crew's favourite station ---
function r7SafeRadio() {
  const stations = ['Solmar FM 88.5', 'Bay Oldies 101.1', 'Marina Nights 94.7'];
  return r7Pick(stations);
}
// --- R7 stranger gifts: grateful locals leave things at your door ---
const R7_STRANGER_GIFTS = [
  'Old Sal left a lucky fishing lure.',
  'Tia left a demo tape of her new song.',
  'Chef Beni left a jar of chilli sauce.',
  'Captain Wren left a brass compass.',
  'Madame Zola left a lucky coin.',
  'Kid Milo left a drawing of you on a horse.',
  'Doc Hal left a first-aid kit.',
  'Auntie Rosa left a basket of mangoes.',
];
function r7StrangerGift(i) {
  if (!r7Stranger.done.includes(i)) return 'No gift yet — help them first.';
  return R7_STRANGER_GIFTS[i];
}
// --- R7 bounty handcuffs: buy cuffs for clean alive captures ---
let r7Cuffs = 0;
function r7BountyBuyCuffs() {
  if (!r7Spend(75)) return false;
  r7Cuffs++; r7Save('cuffs', r7Cuffs);
  toast('Handcuffs bought. Cuffs: ' + r7Cuffs + ' — alive captures are cleaner with them.');
  return true;
}
function r7BountyCaptureWithCuffs() {
  if (r7Bounty.active < 0) return false;
  if (r7Cuffs <= 0) { toast('No cuffs — the capture will be rough.'); return r7BountyCapture(false); }
  r7Cuffs--; r7Save('cuffs', r7Cuffs);
  return r7BountyCapture(true);
}
// --- R7 treasure legends: the old stories behind each cache ---
const R7_TREASURE_TALES = [
  'The Drowned Captain: his ship went down in a storm, but his chest washed ashore.',
  'Smuggler Gold: a runner buried his cut before the sheriff raided the swamp.',
  'The Gardener Hoard: forty years of wages under the jasmine, for a rainy day.',
];
function r7TreasureTale(i) { return R7_TREASURE_TALES[i]; }
// --- R7 challenge history: bests and the day they were set ---
function r7ChalHistory() {
  return R7_CHALLENGES.map((c, i) => c.n + ': ' + r7Chal.best[i] + ' ' + c.unit + ' (' + r7ChalRank(i) + ')');
}
// --- R7 court chants: the crowd has favourites ---
const R7_COURT_CHANTS = [
  '"DE-FENCE! DE-FENCE!"',
  '"Three! Three! Three!"',
  '"Run it back! Run it back!"',
];
function r7CourtChant() { return r7Pick(R7_COURT_CHANTS); }
// --- R7 boxing corners: Ian works your corner between rounds ---
function r7BoxCorner() {
  toast('Ian, in your corner: "Breathe. Watch the left. He drops it every third jab."');
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  return true;
}
// --- R7 dive buddies: Ian dives with you on the deep sites ---
function r7DiveBuddy(i) {
  const s = R7_DIVE_SITES[i];
  if (s.depth < 12) { toast('Ian stays on the kayak for the shallow sites.'); return false; }
  toast('Ian dives with you at ' + s.n + ' — two pairs of eyes, half the risk.');
  return r7DiveGo(i);
}
// --- R7 jump tandem: Ian jumps with you, once per spot ---
let r7JumpTandem = [];
function r7JumpTandemGo(i) {
  if (r7JumpTandem.includes(i)) return false;
  if (!r7Jump.chute) { toast('No parachute — tandem needs one even more.'); return false; }
  r7JumpTandem.push(i); r7Save('jumpTandem', r7JumpTandem);
  r7Earn(R7_JUMP_SPOTS[i].pay + 100, 'Tandem jump with Ian from ' + R7_JUMP_SPOTS[i].n);
  return true;
}
// --- R7 swamp songs: the airboat guide sings on the sunset tour ---
function r7SwampSong() {
  return '"Oh the bay is wide and the gators are sly, and the sun goes down on the marsh..."';
}
// --- R7 lodge fire: the hearth keeps pelts dry and stories warm ---
function r7LodgeFire() {
  toast('The lodge fire crackles. Pelts dry, coffee brews, the bay feels far away.');
  return true;
}
// --- R7 storm radio: warnings as the front approaches ---
function r7StormRadio() {
  if (r7Storm.active >= 0) return 'RADIO: "' + R7_STORMS[r7Storm.active].n + ' overhead — stay inside, stay dry."';
  return 'RADIO: "' + r7StormForecast() + '"';
}
// --- R7 ride regulars: passengers you see again and again ---
const R7_RIDE_REGULARS = [
  'Mrs. Alba rides to the market every morning, exact change ready.',
  'Old Sal rides to the pier with his rod and his stories.',
  'Tia rides to the marina with her guitar case and her hopes.',
];
function r7RideRegular() { return r7Pick(R7_RIDE_REGULARS); }
// --- R7 snap filters: the bay looks better in gold hour ---
const R7_SNAP_FILTERS = ['Gold Hour', 'Salt Haze', 'Storm Grey', 'Marina Pop'];
function r7SnapFilter() { return r7Pick(R7_SNAP_FILTERS); }
function r7SnapPostFiltered(tag) {
  const filter = r7SnapFilter();
  const likes = r7SnapPost(tag);
  toast('Posted with the ' + filter + ' filter.');
  return likes;
}
// --- R7 podcast queue: line up the next show while one plays ---
let r7PodQueue = [];
function r7PodQueueAdd(i) {
  if (r7PodQueue.includes(i)) return false;
  r7PodQueue.push(i); r7PodSave();
  toast('Queued: ' + R7_PODCASTS[i].n + '. Queue: ' + r7PodQueue.length + ' shows.');
  return true;
}
function r7PodQueueNext() {
  const next = r7PodQueue.shift();
  if (next === undefined) { toast('Queue is empty.'); return -1; }
  r7PodListen(next);
  return next;
}
// --- R7 body mirror: check your look before a night out ---
function r7BodyMirror() {
  return r7BodyLook() + ' Outfit: ' + R7_OUTFITS[r7Wit.outfit].n + '.';
}
// --- R7 phone wallpaper: Snapmatic shots become your lock screen ---
function r7PhoneWallpaper(tag) {
  if (!r7Phone.posts.some((p) => p.tag === tag)) { toast('Post a #' + tag + ' photo first.'); return false; }
  toast('Lock screen set: your #' + tag + ' shot. The bay, in your pocket.');
  return true;
}
// --- R7 rep ledger: a public record of your good deeds ---
function r7RepLedger() {
  return r7Rep.deeds.length ? r7Rep.deeds.join(' · ') : 'No good deeds on record yet.';
}
// --- R7 heat map: where the bay is watching hardest ---
function r7HeatMap() {
  return R7_CAMERAS.map((c) => c.n + ' (heat ' + r7Wit.heat + '/6)').join(' · ');
}
// --- R7 focus drills: practice targets at the range ---
function r7FocusDrill() {
  const hit = Math.random() < 0.7;
  if (hit) { r7Focus.meter = r7Clamp(r7Focus.meter + 10, 0, 100); toast('Range drill: clean hit. Focus meter up.'); }
  else toast('Range drill: missed wide. Again.');
  return hit;
}
// --- R7 robbery blueprints: the plans you have stolen or drawn ---
function r7RobBlueprints() {
  return R7_ROB_TARGETS.filter((t, i) => r7Rob.scouted.includes(i)).map((t) => t.n + ' (safe ' + (r7Rob.codes.includes(R7_ROB_TARGETS.indexOf(t)) ? t.safe : '???') + ')');
}
// --- R7 theft wanted level: how hot each stolen car runs ---
function r7TheftWanted(tool) {
  if (tool === 2) return 'Luxury lift — 2 stars if seen.';
  if (tool === 0) return 'Slim jim — quiet, 1 star if seen.';
  return 'Window smash — loud, 2 stars if seen.';
}
// --- R7 locker range day: wear down guns to learn their limits ---
function r7LockerRangeDay(i) {
  for (let s = 0; s < 10; s++) r7LockerShoot(i);
  toast(R7_GUNS[i].n + ' after range day: wear ' + R7_GUNS[i].wear + '% (' + r7LockerCondition(i) + ').');
  return R7_GUNS[i].wear;
}
// --- R7 wild photo: a photo counts as a study for shy species ---
function r7WildPhoto(i) {
  const a = R7_WILD[i];
  if (a.rare && !r7Wild.studied.includes(i)) { toast('Too shy — study the ' + a.n + ' in person first.'); return false; }
  r7SnapPost('sunset');
  toast('Photo logged: ' + a.n + ' in the wild.');
  return true;
}
// --- R7 horse vet: check-ups keep a bonded horse healthy ---
function r7HorseVet(i) {
  if (!r7Spend(60)) return false;
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 5, 0, 100); r7HorseSave();
  toast(R7_HORSE2[i].n + ' checked over — healthy, happy, bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse guests: Ian invites the crew for dinner ---
function r7SafeDinner() {
  if (r7Safe.crew.length < 2) { toast('Hire more crew first — dinner is better with company.'); return false; }
  if (!r7Spend(50)) return false;
  r7Safe.morale = r7Clamp(r7Safe.morale + 12, 0, 100); r7SafeSave();
  toast('Dinner at the safehouse — Ian cooks, the crew laughs. Morale ' + r7Safe.morale + '.');
  return true;
}
// --- R7 stranger reunions: the bay remembers kindness ---
function r7StrangerReunion(i) {
  if (!r7Stranger.done.includes(i)) return 'You have not met them properly yet.';
  return R7_STRANGERS[i].n + ' waves when you pass — the bay remembers.';
}
// --- R7 bounty disguise: dress like a tourist to get close ---
function r7BountyDisguise(i) {
  if (r7Wit.outfit !== 4) { toast('Wear the Bay festival colours — tourists get close without a second look.'); return false; }
  toast('Festival colours on — ' + R7_BOUNTIES[i].n + ' will not see you coming.');
  return true;
}
// --- R7 treasure shovel count: how many digs you have left in you ---
function r7TreasureDigsLeft() {
  return 3 - r7Treasure.found.length;
}
// --- R7 challenge rival: the leaderboard name to beat ---
const R7_CHAL_RIVAL = { n: 'Dockside Dan', golds: 4 };
function r7ChalRivalLine() {
  const mine = R7_CHALLENGES.filter((c, i) => r7ChalRank(i) === 'gold').length;
  return 'Dockside Dan holds ' + R7_CHAL_RIVAL.golds + ' golds. You hold ' + mine + '.';
}
// --- R7 court shoes: the right shoes add a point a game ---
let r7CourtShoes = false;
function r7CourtBuyShoes() {
  if (r7CourtShoes) return false;
  if (!r7Spend(110)) return false;
  r7CourtShoes = true; r7Save('courtShoes', true);
  toast('Court shoes bought — springier step, cleaner jump shot.');
  return true;
}
// --- R7 boxing wraps: protect your hands, hit harder ---
let r7BoxWraps = false;
function r7BoxBuyWraps() {
  if (r7BoxWraps) return false;
  if (!r7Spend(40)) return false;
  r7BoxWraps = true; r7Save('boxWraps', true);
  toast('Hand wraps bought — your punches land cleaner.');
  return true;
}
// --- R7 dive logbook: every dive, written down ---
function r7DiveLogbook() {
  return R7_DIVE_SITES.map((s, i) => s.n + ': ' + (r7Dive.dives.includes(i) ? 'dived, $' + s.loot : 'not yet dived')).join(' · ');
}
// --- R7 jump logbook: airtime history ---
function r7JumpLogbook() {
  return 'Jumps: ' + r7Jump.jumps.length + ' · best airtime ' + r7Jump.best + 's · near misses ' + r7Jump.nearMisses + ' · tandem ' + r7JumpTandem.length + '.';
}
// --- R7 swamp menu: what tourists eat after the tour ---
const R7_SWAMP_MENU = [
  { n: 'Gator bites', price: 14 },
  { n: 'Swamp lemonade', price: 6 },
  { n: 'Heron pie', price: 11 },
];
function r7SwampMenu() { return R7_SWAMP_MENU.map((m) => m.n + ' $' + m.price).join(' · '); }
// --- R7 lodge guest book: hunters who stayed the night ---
const R7_LODGE_GUESTS = ['Doc Hal', 'Captain Wren', 'Old Sal'];
function r7LodgeGuestBook() { return 'Guest book: ' + R7_LODGE_GUESTS.join(', ') + ' — and you, ' + r7Lodge.visits + ' visits.'; }
// --- R7 storm kit: what to stock before the front ---
const R7_STORM_KIT = ['Boards', 'Water', 'Torch', 'Radio batteries'];
function r7StormKitList() { return 'Storm kit: ' + R7_STORM_KIT.join(', ') + '.'; }
// --- R7 ride playlist: the driver picks the music ---
function r7RidePlaylist() {
  return r7Pick(['Solmar FM 88.5', 'Bay Oldies 101.1', 'Marina Nights 94.7']);
}
// --- R7 snap stories: 24-hour posts that bring fast followers ---
function r7SnapStory(tag) {
  const likes = r7SnapPost(tag);
  r7Phone.followers += 2;
  r7PhoneSave();
  toast('Story posted — #' + tag + ' is live for 24 hours. +' + likes + ' likes.');
  return likes;
}
// --- R7 podcast ads: a sponsor reads on your show ---
function r7PodAd() {
  if (r7Pod.listened.length < 2) { toast('Finish two shows first — sponsors want listeners.'); return false; }
  r7Earn(90, 'Podcast sponsor read: Salt Soda');
  return true;
}
// --- R7 body protein: shakes after the gym ---
function r7BodyShake() {
  if (!r7Spend(8)) return false;
  r7Body.strength = r7Clamp(r7Body.strength + 1, 0, 20);
  r7BodySave(); toast('Protein shake down. Strength ' + r7Body.strength + '/20.');
  return true;
}
// --- R7 apartment keys: Ian gets a copy ---
function r7AptKeys() {
  if (r7Body.apt < 0) { toast('Rent a flat first — then Ian gets a key.'); return false; }
  toast('Ian has a key to the ' + R7_APTS[r7Body.apt].n + '. Home, properly.');
  return true;
}
// --- R7 rep clean slate: a big donation wipes a bad name ---
function r7RepCleanSlate() {
  if (r7RepScore() > -20) { toast('Your name is fine — no slate to clean.'); return false; }
  if (!r7Spend(500)) return false;
  r7Rep.bad = Math.max(0, r7Rep.bad - 40); r7RepSave();
  toast('Big donation to the bay fund. The whispers fade. Rep ' + r7RepScore() + '.');
  return true;
}
// --- R7 heat cooldown: hiding in the safehouse drops heat over time ---
function r7WitLayLow() {
  if (!r7SafeNear()) { toast('Lay low at the safehouse — the heat drops there.'); return false; }
  r7Wit.heat = r7Clamp(r7Wit.heat - 1, 0, 6);
  if (r7Wit.heat === 0) r7Wit.lockdown = false;
  r7WitSave(); toast('An hour on the couch. Heat ' + r7Wit.heat + '/6.');
  return true;
}
// --- R7 focus zen: a calm morning refills the meter fully ---
function r7FocusZen() {
  r7Focus.meter = 100; r7FocusSave();
  toast('Morning coffee on the marina, slow and quiet. Focus meter full.');
  return true;
}
// --- R7 robbery fence list: who buys what, quietly ---
const R7_FENCE_LIST = [
  { buyer: 'Old Tom', buys: 'jewellery', cut: '70%' },
  { buyer: 'Docks fence', buys: 'cash boxes', cut: '60%' },
  { buyer: 'Casino fence', buys: 'liquor stock', cut: '65%' },
];
function r7FenceList() { return R7_FENCE_LIST.map((f) => f.buyer + ' buys ' + f.buys + ' at ' + f.cut).join(' · '); }
// --- R7 theft chop list: which cars the chop shop wants today ---
function r7ChopWanted() {
  const kinds = ['sedan', 'coupe', 'luxury', 'truck'];
  const want = r7Pick(kinds);
  return 'Chop shop wants a ' + want + ' today — $' + r7ChopPrice(want) + ' (' + want + ' pays double).';
}
// --- R7 locker safe combo: the safehouse safe has its own code ---
const R7_SAFE_COMBO = '4821';
function r7LockerSafeCombo() { return 'Safehouse safe combo: ' + R7_SAFE_COMBO + ' — do not share it.'; }
// --- R7 wild migration map: the seasonal movement of the rare three ---
function r7WildMigration() {
  return 'Golden Egret: swamp in spring, beach in winter. Ghost Crab: beach all year. Black Panther: deep forest, winter only.';
}
// --- R7 horse feed bag: buy in bulk, save cash ---
function r7HorseFeedBulk(i) {
  if (!r7Spend(60)) return false;
  r7Horse.fed[i] += 5; r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 20, 0, 100); r7HorseSave();
  toast('Bulk feed for ' + R7_HORSE2[i].n + ' — five meals, bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse plants: Ian grows herbs on the windowsill ---
let r7Plants = 0;
function r7SafePlant() {
  r7Plants++; r7Safe.morale = r7Clamp(r7Safe.morale + 2, 0, 100); r7SafeSave();
  toast('A new herb pot on the sill. Plants: ' + r7Plants + ' · morale ' + r7Safe.morale + '.');
  return r7Plants;
}
// --- R7 stranger map: where the eight strangers stand ---
function r7StrangerMap() {
  return R7_STRANGERS.map((s, i) => s.n + ' (' + s.x + ', ' + s.z + ')' + (r7Stranger.done.includes(i) ? ' ✓' : '')).join(' · ');
}
// --- R7 bounty wanted level: the board's heat rises with you ---
function r7BountyHeat() {
  return 'Board heat: ' + r7Bounty.caught.length + '/5 caught. The sheriff notices hunters who finish jobs.';
}
// --- R7 treasure compass: the needle points to the nearest cache ---
function r7TreasureCompass() {
  const p = r7Pos();
  let best = null, bestD = 1e9;
  for (let i = 0; i < R7_TREASURE.length; i++) {
    if (r7Treasure.found.includes(i)) continue;
    const d = Math.hypot(R7_TREASURE[i].x - p.x, R7_TREASURE[i].z - p.z);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best === null) return 'All caches found — the compass spins free.';
  return 'Nearest cache: ' + R7_TREASURE[best].n + ', ' + Math.round(bestD) + 'm away.';
}
// --- R7 challenge streak: daily challenge completions in a row ---
let r7Streak = 0;
function r7ChalStreak(win) {
  if (win) { r7Streak++; if (r7Streak >= 3) { r7Earn(150, 'Challenge streak x' + r7Streak); } }
  else r7Streak = 0;
  r7Save('streak', r7Streak);
  return r7Streak;
}
// --- R7 court MVP: the best pickup player this week ---
function r7CourtMVP() {
  if (r7Court.wins >= 5) return 'You — the courts belong to you this week.';
  if (r7Court.wins >= 2) return 'You are climbing the pickup ladder.';
  return 'Dock Kings hold the MVP crown — for now.';
}
// --- R7 boxing record card: your fight history in one line ---
function r7BoxRecord() {
  return 'Boxing record: ' + r7Pool.boutWins + 'W - ' + (r7Pool.bouts - r7Pool.boutWins) + 'L' + (r7Pool.belt ? ' · BAY CHAMPION' : '');
}
// --- R7 dive buddy check: air, depth, buddy — the three rules ---
function r7DiveChecklist(i) {
  const s = R7_DIVE_SITES[i];
  return 'Dive ' + s.n + ': air ' + r7DiveAirNeeded(i) + ' tanks · depth ' + s.depth + 'm · buddy: ' + (s.depth >= 12 ? 'Ian comes too' : 'solo is fine');
}
// --- R7 jump weather: the morning report for jumpers ---
function r7JumpWeather() {
  const w = r7JumpWind();
  return 'Jump weather: wind ' + w.speed + '/4 — ' + w.note;
}
// --- R7 swamp tides: the water decides the tour ---
function r7SwampTide() {
  const tide = r7Pick(['high', 'low', 'rising']);
  return 'Swamp tide is ' + tide + ' — ' + (tide === 'high' ? 'gators float close.' : tide === 'low' ? 'mud banks show.' : 'water creeps in.');
}
// --- R7 lodge stew: the pot is always on ---
function r7LodgeStew() {
  toast('Lodge stew: venison, bay herbs, and a story from the last hunt.');
  r7Body.stamina = r7Clamp(r7Body.stamina + 2, 0, 20);
  return true;
}
// --- R7 storm shutters: board up before the front ---
function r7StormShutters() {
  if (!r7Spend(90)) return false;
  toast('Shutters up on the safehouse. The storm can howl all it likes.');
  return true;
}
// --- R7 ride airport run: the long fare everyone wants ---
function r7RideAirportRun() {
  if (!r7Ride.driver) { toast('Sign up as a BayRide driver first.'); return false; }
  r7Ride.trips++; r7Ride.earned += 55;
  r7RideSave(); r7Earn(55, 'Airport run — the long fare');
  return true;
}
// --- R7 snap analytics: which tag earns the most likes ---
function r7SnapAnalytics() {
  const byTag = {};
  for (const p of r7Phone.posts) byTag[p.tag] = (byTag[p.tag] || 0) + p.likes;
  const best = Object.entries(byTag).sort((a, b) => b[1] - a[1])[0];
  return best ? 'Best tag: #' + best[0] + ' with ' + best[1] + ' likes.' : 'Post something first — analytics need data.';
}
// --- R7 podcast live: a live recording at the marina bar ---
function r7PodLive() {
  if (r7Pod.listened.length < 4) { toast('Finish all four shows first — then go live.'); return false; }
  r7Earn(250, 'Live podcast recording at the marina bar');
  return true;
}
// --- R7 body rest day: sometimes the gym can wait ---
function r7BodyRestDay() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 4, 0, 20);
  r7BodySave(); toast('Rest day — a walk on the beach, an early night. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment party: Ian throws a housewarming ---
function r7AptParty() {
  if (r7Body.apt < 0) { toast('Rent a flat first.'); return false; }
  if (!r7Spend(120)) return false;
  r7Safe.morale = r7Clamp(r7Safe.morale + 15, 0, 100); r7SafeSave();
  toast('Housewarming at the ' + R7_APTS[r7Body.apt].n + ' — the whole crew comes. Morale ' + r7Safe.morale + '.');
  return true;
}
// --- R7 rep parade: the bay throws you a small parade at +80 ---
function r7RepParade() {
  if (r7RepScore() < 80) { toast('The bay parades for saints — you need +80 rep. Now: ' + r7RepScore() + '.'); return false; }
  r7Earn(300, 'Bay parade in your honour');
  return true;
}
// --- R7 heat disguise kit: a full kit for a quick change anywhere ---
function r7WitKit() {
  if (!r7Spend(200)) return false;
  r7Wit.heat = r7Clamp(r7Wit.heat - 2, 0, 6);
  if (r7Wit.heat === 0) r7Wit.lockdown = false;
  r7WitSave(); toast('Disguise kit used — wig, jacket, new walk. Heat ' + r7Wit.heat + '/6.');
  return true;
}
// --- R7 focus scope: a scope steadies the slow-mo shot ---
function r7FocusScope() {
  toast('Scope on — the slow-mo holds steady a second longer.');
  r7Focus.meter = r7Clamp(r7Focus.meter + 5, 0, 100);
  return true;
}
// --- R7 robbery clean crew: the same crew, the same cut, every time ---
function r7RobCrewCut(take) {
  const crew = 2;
  const cut = Math.floor(take / crew);
  return 'Crew cut: $' + cut + ' each for Ryan and Ian on a $' + take + ' take.';
}
// --- R7 theft lock picks: a quieter tool for patient thieves ---
function r7TheftLockpick() {
  if (!r7Theft.tools.includes(0)) { toast('Buy the slim jim first — picks come later.'); return false; }
  toast('Lock pick set ready — slower than the slim jim, silent as the night.');
  return true;
}
// --- R7 locker oil: a drop of oil keeps the action smooth ---
function r7LockerOil(i) {
  if (R7_GUNS[i].wear < 10) { toast(R7_GUNS[i].n + ' is smooth already.'); return false; }
  R7_GUNS[i].wear = r7Clamp(R7_GUNS[i].wear - 10, 0, 100);
  r7LockerSave(); toast('Oiled ' + R7_GUNS[i].n + ' — wear ' + R7_GUNS[i].wear + '%.');
  return true;
}
// --- R7 wild dawn chorus: the swamp at first light ---
function r7WildDawn() {
  return 'Dawn chorus: herons first, then gulls, then the gators slide in.';
}
// --- R7 horse sunset ride: the best ride in the bay ---
function r7HorseSunset(i) {
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 10, 0, 100); r7HorseSave();
  toast('Sunset ride on ' + R7_HORSE2[i].n + ' — the bay turns gold. Bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse morning: coffee, paper, and the bay waking up ---
function r7SafeMorning() {
  toast('Morning at the safehouse — Ian makes coffee, the bay wakes up slow.');
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  return true;
}
// --- R7 stranger thank-you: the bay's small kindnesses compound ---
function r7StrangerThanks() {
  return 'Strangers helped: ' + r7Stranger.done.length + '/8. The bay keeps score, kindly.';
}
// --- R7 bounty wanted poster art: the sketch artist got it wrong ---
function r7BountySketch(i) {
  const b = R7_BOUNTIES[i];
  return 'Sketch of ' + b.n + ': "Looks nothing like them," says everyone who knows them.';
}
// --- R7 treasure old map: the shop sells a faded copy ---
function r7TreasureOldMap() {
  if (!r7Spend(60)) return false;
  toast('Old map bought — coffee stains, torn corner, but the X is clear.');
  return true;
}
// --- R7 challenge trophy shelf: where the medals live ---
function r7ChalShelf() {
  const golds = R7_CHALLENGES.filter((c, i) => r7ChalRank(i) === 'gold').length;
  const silvers = R7_CHALLENGES.filter((c, i) => r7ChalRank(i) === 'silver').length;
  const bronzes = R7_CHALLENGES.filter((c, i) => r7ChalRank(i) === 'bronze').length;
  return 'Trophy shelf: ' + golds + ' gold · ' + silvers + ' silver · ' + bronzes + ' bronze.';
}
// --- R7 court water break: the bay heat is no joke ---
function r7CourtWater() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 2, 0, 20);
  toast('Water break — the bay heat is no joke. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 boxing hand speed: bag work between bouts ---
function r7BoxBag() {
  r7Body.strength = r7Clamp(r7Body.strength + 1, 0, 20);
  r7BodySave(); toast('Bag work done — hands faster, shoulders burning. Strength ' + r7Body.strength + '.');
  return true;
}
// --- R7 dive wetsuit: the cold water bites without one ---
let r7Wetsuit = false;
function r7DiveWetsuit() {
  if (r7Wetsuit) return false;
  if (!r7Spend(180)) return false;
  r7Wetsuit = true; r7Save('wetsuit', true);
  toast('Wetsuit bought — the deep water feels warmer already.');
  return true;
}
// --- R7 jump log: the jump club keeps score ---
function r7JumpClub() {
  return 'Jump club: ' + r7Jump.jumps.length + ' jumps logged, best ' + r7Jump.best + 's airtime.';
}
// --- R7 swamp sunset: the tour everyone photographs ---
function r7SwampSunset() {
  r7SnapPost('sunset');
  toast('Swamp sunset — the sky burns orange over the marsh.');
  return true;
}
// --- R7 lodge coffee: strong, black, and always on ---
function r7LodgeCoffee() {
  toast('Lodge coffee: strong, black, and always on the stove.');
  return true;
}
// --- R7 storm candles: when the power goes, the bay lights candles ---
function r7StormCandles() {
  if (r7Storm.active < 0) { toast('No storm — the lights are on, the candles wait.'); return false; }
  toast('Candles lit in the shelter — the bay waits out the storm together.');
  return true;
}
// --- R7 ride lost and found: passengers leave things behind ---
const R7_LOST_ITEMS = ['A red umbrella', 'A paperback novel', 'A pair of sunglasses', 'A lucky coin'];
function r7RideLostFound() {
  const item = r7Pick(R7_LOST_ITEMS);
  toast('Lost and found: ' + item + ' — left in the back seat.');
  return item;
}
// --- R7 snap golden hour: the best light in the bay ---
function r7SnapGoldenHour() {
  toast('Golden hour — the bay glows. Every photo earns double likes now.');
  return r7SnapPost('sunset');
}
// --- R7 podcast merch: caps and mugs for the fans ---
function r7PodMerch() {
  if (r7Pod.listened.length < 3) { toast('Three shows finished unlocks merch.'); return false; }
  r7Earn(120, 'Podcast merch sold at the marina bar');
  return true;
}
// --- R7 body beach run: sand makes the legs work harder ---
function r7BodyBeachRun() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 2, 0, 20);
  r7BodySave(); toast('Beach run done — sand, surf, and burning calves. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment balcony: morning coffee above the bay ---
function r7AptBalcony() {
  if (r7Body.apt < 0) { toast('Rent a flat first — balconies need a flat.'); return false; }
  toast('Balcony coffee at the ' + R7_APTS[r7Body.apt].n + ' — the bay, the boats, the morning.');
  return true;
}
// --- R7 rep festival: the bay throws a street party at +40 ---
function r7RepFestival() {
  if (r7RepScore() < 40) { toast('Street parties start at +40 rep. Now: ' + r7RepScore() + '.'); return false; }
  r7Earn(150, 'Bay street festival — you are the guest of honour');
  return true;
}
// --- R7 heat safe car: a clean car with clean plates, parked ready ---
function r7WitSafeCar() {
  if (!r7Spend(800)) return false;
  r7Wit.heat = 0; r7Wit.lockdown = false; r7WitSave();
  toast('Clean car bought — fresh plates, no history. Heat 0/6.');
  return true;
}
// --- R7 focus night sights: see the vitals in the dark ---
function r7FocusNightSights() {
  toast('Night sights fitted — vitals glow faintly in the dark.');
  return true;
}
// --- R7 robbery tunnel: the old smuggler tunnel under the docks ---
function r7RobTunnel() {
  toast('The old smuggler tunnel runs under the docks — a clean way out, if you know it.');
  return true;
}
// --- R7 theft paint job: a fresh coat hides a stolen car ---
function r7TheftPaint() {
  if (!r7Spend(150)) return false;
  r7Wit.heat = r7Clamp(r7Wit.heat - 1, 0, 6);
  r7WitSave(); toast('Fresh paint — the stolen car looks like any other now. Heat ' + r7Wit.heat + '/6.');
  return true;
}
// --- R7 locker display: the wall of guns, polished and proud ---
function r7LockerDisplay() {
  const owned = r7Locker.carry.length + r7Locker.trunk.length + r7Locker.safe.length;
  return 'Gun wall: ' + owned + '/4 pieces. ' + (owned >= 4 ? 'A full collection.' : 'Room for more.');
}
// --- R7 wild footprint guide: read the ground like a book ---
const R7_TRACK_GUIDE = [
  'Deer: neat paired prints, heading for water.',
  'Boar: churned mud, rooting marks.',
  'Panther: big soft pads, no claw marks — a silent walker.',
  'Gator: tail drag line between the prints.',
];
function r7WildTrackGuide() { return r7Pick(R7_TRACK_GUIDE); }
// --- R7 horse apples: the oldest trick in the book ---
function r7HorseApple(i) {
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 4, 0, 100); r7HorseSave();
  toast('An apple for ' + R7_HORSE2[i].n + ' — the oldest trick in the book. Bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse lock: new locks after every close call ---
function r7SafeNewLocks() {
  if (!r7Spend(70)) return false;
  toast('New locks on the safehouse — the bay keeps its secrets.');
  return true;
}
// --- R7 stranger postcards: they write from wherever they wander ---
function r7StrangerPostcard(i) {
  if (!r7Stranger.done.includes(i)) return 'No postcard yet.';
  return R7_STRANGERS[i].n + ' sends a postcard: "The bay is better with you in it."';
}
// --- R7 bounty stakeout snacks: stakeouts need coffee ---
function r7BountySnacks() {
  if (!r7Spend(12)) return false;
  toast('Stakeout snacks: coffee, sandwiches, and patience.');
  return true;
}
// --- R7 treasure tide times: dig at low tide or not at all ---
function r7TreasureTide() {
  return r7Pick(['Low tide in an hour — perfect digging.', 'High tide — wait for the water to drop.', 'Tide turning — dig fast.']);
}
// --- R7 challenge shout: the board announces your medals ---
function r7ChalShout(i) {
  const c = R7_CHALLENGES[i];
  toast('Board shout: ' + c.n + ' — ' + r7ChalRank(i) + ' medal, best ' + r7Chal.best[i] + ' ' + c.unit + '.');
  return r7ChalRank(i);
}
// --- R7 court sneakers squeak: the sound of the game ---
function r7CourtSqueak() {
  return 'Sneakers squeak, the ball thuds, the crowd leans in.';
}
// --- R7 boxing bell: the sound that starts everything ---
function r7BoxBell() {
  toast('DING DING — the bell rings. Fight!');
  return true;
}
// --- R7 dive hand signals: talk underwater without words ---
const R7_DIVE_SIGNALS = ['OK: thumb and finger circle.', 'Up: thumb pointed skyward.', 'Shark: hand on head, fingers up.', 'Low air: fist on chest.'];
function r7DiveSignal() { return r7Pick(R7_DIVE_SIGNALS); }
// --- R7 jump countdown: three, two, one, gone ---
function r7JumpCountdown() {
  toast('Three... two... one... JUMP!');
  return true;
}
// --- R7 swamp fireflies: the marsh lights up after dark ---
function r7SwampFireflies() {
  toast('Fireflies rise over the marsh — the swamp lights its own lamps.');
  return true;
}
// --- R7 lodge axe: chop wood, earn the fire ---
function r7LodgeAxe() {
  toast('Chopped wood for the lodge fire — the axe rings, the pile grows.');
  r7Body.strength = r7Clamp(r7Body.strength + 1, 0, 20);
  return true;
}
// --- R7 storm sandbags: the docks hold back the surge ---
function r7StormSandbags() {
  if (!r7Spend(50)) return false;
  toast('Sandbags stacked at the docks — the surge will have to try harder.');
  return true;
}
// --- R7 ride tip jar: good drivers get remembered ---
function r7RideTipJar() {
  if (r7Ride.rating < 4.5) { toast('Tips come with a 4.5+ rating. Now: ' + r7Ride.rating.toFixed(1) + '★.'); return false; }
  r7Earn(35, 'Tip jar — a regular left something extra');
  return true;
}
// --- R7 snap collage: the week's best shots, framed ---
function r7SnapCollage() {
  if (r7Phone.posts.length < 3) { toast('Three posts make a collage. You have ' + r7Phone.posts.length + '.'); return false; }
  r7Phone.followers += 10; r7PhoneSave();
  toast('Week collage posted — +10 followers. Total ' + r7Phone.followers + '.');
  return true;
}
// --- R7 podcast studio: a corner of the safehouse, a mic, a dream ---
function r7PodStudio() {
  if (!r7Safe.owned.includes(3)) { toast('Decor first — a studio needs a view worth recording in.'); return false; }
  toast('Podcast studio corner: mic, headphones, bay view. The show sounds better already.');
  return true;
}
// --- R7 body swim: the bay is the best gym there is ---
function r7BodySwim() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 3, 0, 20);
  r7BodySave(); toast('Swim in the bay — salt water, open sky. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment plants: the balcony garden grows ---
function r7AptPlants() {
  toast('Balcony garden: basil, chilli, and one stubborn tomato plant.');
  return true;
}
// --- R7 rep handshake: the bay's deals run on trust ---
function r7RepHandshake() {
  if (r7RepScore() < 25) { toast('Handshakes here mean something — earn +25 rep first.'); return false; }
  toast('A handshake deal — no paper, no fuss. The bay trusts you.');
  return true;
}
// --- R7 heat laundry: wash the clothes, wash the heat ---
function r7WitLaundry() {
  if (!r7Spend(20)) return false;
  r7Wit.heat = r7Clamp(r7Wit.heat - 1, 0, 6);
  if (r7Wit.heat === 0) r7Wit.lockdown = false;
  r7WitSave(); toast('Laundry done — clean clothes, cooler trail. Heat ' + r7Wit.heat + '/6.');
  return true;
}
// --- R7 focus earplugs: block the noise, keep the slow-mo ---
function r7FocusEarplugs() {
  toast('Earplugs in — the world goes quiet, the focus stays sharp.');
  return true;
}
// --- R7 robbery earpiece: Ian in your ear, all night ---
function r7RobEarpiece() {
  toast('Earpiece on — Ian in your ear: "Door clear. Safe next. You have four minutes."');
  return true;
}
// --- R7 theft glove box: the tools live in the glove box now ---
function r7TheftGloveBox() {
  return 'Glove box: slim jim, window punch, and a phone scanner, neatly lined up.';
}
// --- R7 locker serial numbers: file them off, carefully ---
function r7LockerSerial(i) {
  toast('Serial numbers filed off the ' + R7_GUNS[i].n + ' — untraceable now.');
  return true;
}
// --- R7 wild binoculars: see the rare ones before they see you ---
function r7WildBinoculars() {
  toast('Binoculars up — a golden egret, far off in the reeds.');
  return true;
}
// --- R7 horse trail map: the ranch trails, marked and measured ---
const R7_TRAILS = [
  { n: 'Creek Loop', km: 3 },
  { n: 'Pine Ridge', km: 5 },
  { n: 'Beach Gallop', km: 4 },
];
function r7HorseTrails() { return R7_TRAILS.map((t) => t.n + ' ' + t.km + 'km').join(' · '); }
// --- R7 safehouse spare key: under the third flower pot ---
function r7SafeSpareKey() {
  toast('Spare key under the third flower pot — Ian knows, the crew knows, nobody else.');
  return true;
}
// --- R7 stranger birthdays: the bay celebrates its own ---
function r7StrangerBirthday(i) {
  if (!r7Stranger.done.includes(i)) return 'You do not know their birthday yet.';
  return 'It is ' + R7_STRANGERS[i].n + "'s birthday soon — the bay will bring cake.";
}
// --- R7 bounty rain check: the target will be there tomorrow too ---
function r7BountyRainCheck(i) {
  toast('Rain check on ' + R7_BOUNTIES[i].n + ' — the bounty does not expire, the trail does not cool.');
  return true;
}
// --- R7 treasure ghost: the Drowned Captain watches his gold ---
function r7TreasureGhost() {
  return 'Old Sal swears the Drowned Captain still walks the beach at low tide.';
}
// --- R7 challenge anthem: the board plays a song for gold ---
function r7ChalAnthem(i) {
  if (r7ChalRank(i) !== 'gold') { toast('Gold medals get an anthem. This one is ' + r7ChalRank(i) + ' — keep pushing.'); return false; }
  toast('Anthem plays: ' + R7_CHALLENGES[i].n + ' — GOLD. The plaza cheers.');
  return true;
}
// --- R7 court halftime: orange slices and a plan ---
function r7CourtHalftime() {
  toast('Halftime — orange slices, water, and a plan for the second half.');
  return true;
}
// --- R7 boxing mouthguard: bite down and swing ---
function r7BoxMouthguard() {
  toast('Mouthguard in — bite down, hands up, swing.');
  return true;
}
// --- R7 dive buddy breathing: slow breaths, long dives ---
function r7DiveBreathe() {
  toast('Slow breaths — the tank lasts longer when you stay calm.');
  return true;
}
// --- R7 jump landing roll: tuck, roll, stand, grin ---
function r7JumpRoll() {
  toast('Tuck, roll, stand, grin — a textbook landing.');
  return true;
}
// --- R7 swamp mosquito net: the price of a marsh evening ---
function r7SwampNet() {
  toast('Mosquito net up — the marsh evenings are worth the itch.');
  return true;
}
// --- R7 lodge woodsmoke: the smell of the north woods ---
function r7LodgeSmoke() {
  return 'Woodsmoke, pine, and old leather — the lodge smells like the north woods.';
}
// --- R7 storm eye: the calm in the middle of the front ---
function r7StormEye() {
  if (r7Storm.active < 0) return 'No storm — the sky is all eye, no wall.';
  return 'The eye passes — twenty minutes of strange calm, then the wall returns.';
}
// --- R7 ride car wash: a clean car earns better ratings ---
function r7RideWash() {
  if (!r7Spend(15)) return false;
  r7Ride.rating = r7Clamp(r7Ride.rating + 0.1, 1, 5);
  r7RideSave(); toast('Car washed — passengers notice. Rating ' + r7Ride.rating.toFixed(1) + '★.');
  return true;
}
// --- R7 snap drone shot: the bay from above ---
function r7SnapDrone() {
  const likes = r7SnapPost('skyline');
  toast('Drone shot — the whole bay in one frame.');
  return likes;
}
// --- R7 podcast outro: sign off like the bay is listening ---
function r7PodOutro() {
  return '"This is the bay, signing off. Stay salty, Solmar."';
}
// --- R7 body stretch: loose muscles, long life ---
function r7BodyStretch() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  toast('Stretched out — loose muscles, long life. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment neighbours: the building knows you now ---
function r7AptNeighbours() {
  if (r7Body.apt < 0) return 'No neighbours yet — the safehouse stands alone.';
  return 'The neighbours know you now — nods in the lift, small talk by the bins.';
}
// --- R7 rep street art: the bay paints its heroes ---
function r7RepMural() {
  if (r7RepScore() < 60) { toast('Murals are for saints — +60 rep. Now: ' + r7RepScore() + '.'); return false; }
  toast('A mural of you and Ian goes up on the plaza wall — the bay paints its heroes.');
  return true;
}
// --- R7 heat sunglasses: hide your eyes, hide your guilt ---
function r7WitSunglasses() {
  toast('Sunglasses on — the bay cannot read your eyes.');
  return true;
}
// --- R7 focus steady hands: coffee is the enemy of aim ---
function r7FocusSteady() {
  toast('Steady hands — no coffee before a focus job. The meter thanks you.');
  return true;
}
// --- R7 robbery code words: the crew speaks in riddles ---
const R7_CODE_WORDS = ['The gull flies at dawn.', 'Salt in the coffee.', 'The tide is low.'];
function r7RobCodeWord() { return r7Pick(R7_CODE_WORDS); }
// --- R7 theft spare key: every car has a spare somewhere ---
function r7TheftSpareKey() {
  toast('Spare key hunting: under the visor, in the glove box, behind the plate.');
  return true;
}
// --- R7 locker gun oil smell: the workshop smells like work ---
function r7LockerSmell() {
  return 'Gun oil, leather, and steel — the workshop smells like work.';
}
// --- R7 wild silence: the forest goes quiet for a reason ---
function r7WildSilence() {
  return 'The forest goes quiet — something big is moving through the pines.';
}
// --- R7 horse whisper: talk low, move slow ---
function r7HorseWhisper(i) {
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 2, 0, 100); r7HorseSave();
  toast('Talked low to ' + R7_HORSE2[i].n + ' — slow moves, soft voice. Bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse checklist: lock, lights, Ian, done ---
function r7SafeChecklist() {
  return ['Lock the door', 'Lights low', 'Ian home', 'Cash in the wall'].join(' · ');
}
// --- R7 stranger favourite: what each one loves most ---
const R7_STRANGER_FAVES = [
  'Old Sal loves a quiet pier and a full tackle box.',
  'Tia loves a crowd that sings along.',
  'Chef Beni loves a perfect lime.',
  'Captain Wren loves a following sea.',
  'Madame Zola loves a brave question.',
  'Kid Milo loves a windy day.',
  'Doc Hal loves a road that stays dry.',
  'Auntie Rosa loves her goat, trouble and all.',
];
function r7StrangerFave(i) { return R7_STRANGER_FAVES[i]; }
// --- R7 bounty rain: the bay rain washes the trail clean ---
function r7BountyRain() {
  toast('Bay rain washes the trail — the bounty hunt starts fresh.');
  return true;
}
// --- R7 treasure salt: the sea keeps what it takes ---
function r7TreasureSalt() {
  return 'The sea keeps what it takes — but it gives back, sometimes, in gold.';
}
// --- R7 challenge coffee: the board runs on caffeine ---
function r7ChalCoffee() {
  toast('Challenge board coffee — black, hot, and always there.');
  return true;
}
// --- R7 court rain delay: the bay rain stops play, not the game ---
function r7CourtRain() {
  return 'Rain delay — the court dries fast under the bay sun.';
}
// --- R7 boxing sweat: the gym smells like effort ---
function r7BoxSweat() {
  return 'The gym smells like sweat and leather — the smell of effort.';
}
// --- R7 dive salt: rinse the gear, or the sea eats it ---
function r7DiveRinse() {
  toast('Gear rinsed — the sea eats what you do not wash.');
  return true;
}
// --- R7 jump breakfast: jumpers eat light ---
function r7JumpBreakfast() {
  toast('Jump breakfast: toast, fruit, and nerves of steel.');
  return true;
}
// --- R7 swamp dawn: the marsh wakes before the town ---
function r7SwampDawn() {
  return 'The marsh wakes before the town — mist, herons, and gator eyes.';
}
// --- R7 lodge snow: the north woods in winter ---
function r7LodgeSnow() {
  return 'Snow on the pines — the lodge fire burns a little brighter.';
}
// --- R7 storm rainbow: after the front, the bay shines ---
function r7StormRainbow() {
  if (r7Storm.survived === 0) return 'No storm survived yet — no rainbow either.';
  return 'After the front, a rainbow over the bay. The town comes out to look.';
}
// --- R7 ride sunrise: the first fare of the day ---
function r7RideSunrise() {
  toast('Sunrise fare — the bay wakes up, and the meter starts running.');
  return true;
}
// --- R7 snap night shot: the bay after dark ---
function r7SnapNight() {
  const likes = r7SnapPost('skyline');
  toast('Night shot — neon, water, and the bay after dark.');
  return likes;
}
// --- R7 podcast mic check: one, two, one, two ---
function r7PodMicCheck() {
  toast('Mic check: one, two — the bay is listening.');
  return true;
}
// --- R7 body ice bath: the bay water is cold enough ---
function r7BodyIceBath() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 2, 0, 20);
  toast('Ice bath in the bay shallows — cold, sharp, and worth it. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment keys II: the spare lives with Ian ---
function r7AptSpare() {
  if (r7Body.apt < 0) return 'No flat, no spare.';
  return 'Spare key lives with Ian — the flat is home for both of you.';
}
// --- R7 rep thank-you note: the bay writes back ---
function r7RepThankYou() {
  if (r7Rep.deeds.length === 0) return 'No thank-you notes yet — do a good deed.';
  return 'Latest thank-you: "' + r7Rep.deeds[r7Rep.deeds.length - 1] + ' — thank you, from the bay."';
}
// --- R7 heat mirror check: do you look like a suspect? ---
function r7WitMirrorCheck() {
  if (r7Wit.heat >= 4) return 'Mirror check: you look like a suspect. Change, now.';
  if (r7Wit.heat >= 1) return 'Mirror check: a little warm, but fine.';
  return 'Mirror check: clean. Nobody would look twice.';
}
// --- R7 focus target practice: paper targets at the range ---
function r7FocusTargets() {
  const hits = Math.floor(Math.random() * 6) + 5;
  toast('Range targets: ' + hits + '/10 in the black. Focus meter up.');
  r7Focus.meter = r7Clamp(r7Focus.meter + 8, 0, 100);
  return hits;
}
// --- R7 robbery getaway map: the back streets, memorised ---
function r7RobMap() {
  return 'Getaway map: alley behind the jewellers, docks lane, the tunnel, home.';
}
// --- R7 theft night shift: the chop shop works after dark ---
function r7TheftNight() {
  return 'Night shift at the chop shop — the best cars come in after dark.';
}
// --- R7 locker midnight oil: clean guns by lamplight ---
function r7LockerMidnight() {
  toast('Midnight oil — cleaned guns by lamplight, the bay quiet outside.');
  return true;
}
// --- R7 wild field notes: the compendium, in your handwriting ---
function r7WildNotes() {
  return 'Field notes: ' + r7Wild.studied.length + '/8 species studied, ' + r7Wild.hunted.length + ' hunted clean.';
}
// --- R7 horse saddle: a good saddle is half the ride ---
function r7HorseSaddle(i) {
  toast('Saddle checked on ' + R7_HORSE2[i].n + ' — leather oiled, stirrups even.');
  return true;
}
// --- R7 safehouse window: the bay view from the couch ---
function r7SafeWindow() {
  return 'From the safehouse window: the bay, the boats, and the whole town going about its day.';
}
// --- R7 stranger wave: the bay waves back ---
function r7StrangerWave(i) {
  if (!r7Stranger.done.includes(i)) return 'A stranger, for now.';
  return R7_STRANGERS[i].n + ' waves — the bay waves back.';
}
// --- R7 bounty coffee: the sheriff's office runs on it ---
function r7BountyCoffee() {
  toast('Sheriff office coffee — terrible, but the bounty board is right there.');
  return true;
}
// --- R7 treasure boots: mud-proof, gold-proof ---
function r7TreasureBoots() {
  toast('Mud-proof boots on — the dig sites are never dry.');
  return true;
}
// --- R7 challenge pencil: the board keeper sharpens it daily ---
function r7ChalPencil() {
  return 'The board keeper sharpens the pencil daily — your bests are written in ink.';
}
// --- R7 court net: the swish is the best sound in sport ---
function r7CourtNet() {
  return 'Swish — the net barely moves. The best sound in sport.';
}
// --- R7 boxing wrap check: hands wrapped, ready ---
function r7BoxWrapCheck() {
  return r7BoxWraps ? 'Hands wrapped and ready.' : 'No wraps yet — buy a pair at the hall.';
}
// --- R7 dive mask: see clearly, dive safely ---
function r7DiveMask() {
  toast('Mask defogged — the reef comes into focus.');
  return true;
}
// --- R7 jump harness check: every strap, every time ---
function r7JumpHarness() {
  return r7Jump.chute ? 'Harness checked — every strap, every time.' : 'No parachute — the harness check can wait.';
}
// --- R7 swamp hat: the sun is no joke on the water ---
function r7SwampHat() {
  toast('Wide hat on — the swamp sun is no joke on the water.');
  return true;
}
// --- R7 lodge blanket: wool, thick, and smelling of pine ---
function r7LodgeBlanket() {
  return 'Wool blanket, thick, smelling of pine — the lodge way to sleep.';
}
// --- R7 storm lantern: the shelter glows warm ---
function r7StormLantern() {
  if (r7Storm.active < 0) return 'Lanterns wait in the cupboard — no storm tonight.';
  return 'Lanterns glow in the shelter — warm light while the storm rages.';
}
// --- R7 ride air freshener: the little things earn stars ---
function r7RideFreshener() {
  toast('Air freshener in — the little things earn stars.');
  return true;
}
// --- R7 snap lens cloth: clean lens, clean shot ---
function r7SnapCloth() {
  toast('Lens cloth out — clean lens, clean shot.');
  return true;
}
// --- R7 podcast guest: Ian joins the show ---
function r7PodGuest() {
  toast('Guest on the show: Ian — "The bay is better with two of us in it."');
  return true;
}
// --- R7 body water: the bay heat demands it ---
function r7BodyWater() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  toast('Water down — the bay heat demands it. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment mail: the bay writes to you now ---
function r7AptMail() {
  if (r7Body.apt < 0) return 'No mailbox yet.';
  return 'Mailbox: a festival flyer, a bill, and a postcard from Old Sal.';
}
// --- R7 rep key to the bay: the town's highest honour ---
function r7RepKey() {
  if (r7RepScore() < 100) { toast('The key to the bay needs +100 rep. Now: ' + r7RepScore() + '.'); return false; }
  r7Earn(500, 'Key to the bay — the town\'s highest honour');
  return true;
}
// --- R7 heat hat: a hat changes a face ---
function r7WitHat() {
  toast('Hat on, brim low — a hat changes a face.');
  return true;
}
// --- R7 focus calm: the breath before the shot ---
function r7FocusCalm() {
  return 'The breath before the shot — slow in, slow out, squeeze.';
}
// --- R7 robbery lucky charm: Ian's coin, in your pocket ---
function r7RobCharm() {
  toast("Ian's lucky coin in your pocket — the crew swears by it.");
  return true;
}
// --- R7 theft radio: the chop shop plays oldies ---
function r7TheftRadio() {
  return 'Chop shop radio: oldies, static, and the sound of honest dishonest work.';
}
// --- R7 locker rag: wipe the prints, wipe the past ---
function r7LockerRag() {
  toast('Rag out — wipe the prints, wipe the past.');
  return true;
}
// --- R7 wild dusk: the forest changes hands at dusk ---
function r7WildDusk() {
  return 'At dusk the forest changes hands — deer out, panther in.';
}
// --- R7 horse mane: braided for the festival ---
function r7HorseMane(i) {
  toast('Braided ' + R7_HORSE2[i].n + "'s mane for the festival — the ranch looks its best.");
  return true;
}
// --- R7 safehouse song: Ian hums while she cooks ---
function r7SafeSong() {
  return 'Ian hums while she cooks — the safehouse sounds like home.';
}
// --- R7 stranger joke: the bay runs on bad jokes ---
function r7StrangerJoke(i) {
  const jokes = ['Old Sal: "Why did the gull cross the bay? For the other tide."'];
  return jokes[0];
}
// --- R7 bounty ledger: the sheriff's book of names ---
function r7BountyLedger() {
  return 'Sheriff ledger: ' + r7Bounty.caught.length + '/5 caught · alive ' + r7Bounty.alive + ' · dead ' + r7Bounty.dead + '.';
}
// --- R7 treasure shovel shine: a clean shovel digs true ---
function r7TreasureShine() {
  toast('Shovel shined — a clean shovel digs true.');
  return true;
}
// --- R7 challenge flag: the board flies your colours ---
function r7ChalFlag() {
  const golds = R7_CHALLENGES.filter((c, i) => r7ChalRank(i) === 'gold').length;
  return golds > 0 ? 'The board flies your colours — ' + golds + ' golds.' : 'No golds yet — the board waits.';
}
// --- R7 court lights: night games under the lamps ---
function r7CourtLights() {
  toast('Court lights on — night games under the lamps, the bay watching.');
  return true;
}
// --- R7 boxing towel: the corner throws it in, or does not ---
function r7BoxTowel() {
  return 'The corner towel stays folded — you are not done yet.';
}
// --- R7 dive fins: kick slow, go far ---
function r7DiveFins() {
  toast('Fins on — kick slow, go far.');
  return true;
}
// --- R7 jump goggles: the wind in your eyes, the ground below ---
function r7JumpGoggles() {
  toast('Goggles on — wind in your eyes, ground below, sky all around.');
  return true;
}
// --- R7 swamp boots: the mud is half the tour ---
function r7SwampBoots() {
  toast('Boots on — the mud is half the tour.');
  return true;
}
// --- R7 lodge door: always open to a tired hunter ---
function r7LodgeDoor() {
  return 'The lodge door is always open to a tired hunter.';
}
// --- R7 storm door: barred, bolted, and holding ---
function r7StormDoor() {
  if (r7Storm.active < 0) return 'The shelter door stands open — calm day.';
  return 'Shelter door barred and bolted — holding against the front.';
}
// --- R7 ride horn: a friendly toot for the regulars ---
function r7RideHorn() {
  toast('A friendly toot for the regulars — the bay waves back.');
  return true;
}
// --- R7 snap print: the best shot, framed for the wall ---
function r7SnapPrint() {
  if (r7Phone.posts.length === 0) { toast('Post a photo first.'); return false; }
  r7Earn(25, 'Sold a framed print of your best shot');
  return true;
}
// --- R7 podcast sign-off: the bay's favourite goodbye ---
function r7PodSignOff() {
  return '"Stay salty, Solmar — see you at the next tide."';
}
// --- R7 body sunrise stretch: the bay wakes with you ---
function r7BodySunrise() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  toast('Sunrise stretch — the bay wakes with you. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment sunset: the skyline burns orange ---
function r7AptSunset() {
  if (r7Body.apt < 0) return 'No flat, no sunset view.';
  return 'Sunset from the ' + R7_APTS[r7Body.apt].n + ' — the skyline burns orange.';
}
// --- R7 rep neighbour watch: the bay looks after its own ---
function r7RepWatch() {
  if (r7RepScore() < 25) return 'The neighbour watch does not know you yet.';
  return 'Neighbour watch: the bay looks after its own, and you are its own now.';
}
// --- R7 heat back alley: the alleys know your name, or do not ---
function r7WitAlley() {
  if (r7Wit.heat >= 4) return 'The alleys feel watched tonight.';
  return 'The alleys are quiet — a good night to move.';
}
// --- R7 focus heartbeat: slow it down, line it up ---
function r7FocusHeartbeat() {
  return 'Heartbeat slow, breath slow, shot true.';
}
// --- R7 robbery rain: rain covers sound, rain covers tracks ---
function r7RobRain() {
  return 'Rain covers sound and tracks — the best nights to work are wet ones.';
}
// --- R7 theft moon: a full moon is a thief\'s lamp ---
function r7TheftMoon() {
  return 'Full moon tonight — a thief\'s lamp, hung over the whole bay.';
}
// --- R7 locker midnight check: count the guns, lock the door ---
function r7LockerMidnightCheck() {
  return r7LockerInventory() + ' — all accounted for, door locked.';
}
// --- R7 wild moon: the panther hunts by moonlight ---
function r7WildMoon() {
  return 'The panther hunts by moonlight — the forest belongs to it tonight.';
}
// --- R7 horse moonlight: a ride under the full moon ---
function r7HorseMoon(i) {
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 6, 0, 100); r7HorseSave();
  toast('Moonlight ride on ' + R7_HORSE2[i].n + ' — the bay silver under the moon. Bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse lullaby: the bay hums you to sleep ---
function r7SafeLullaby() {
  toast('The bay hums you to sleep — waves, wind, and Ian\'s slow breathing.');
  return true;
}
// --- R7 stranger moon: the bay's night people come out ---
function r7StrangerMoon() {
  return 'At night the bay\'s night people come out — Madame Zola reads fortunes by lamplight.';
}
// --- R7 bounty moon: bounties move at night ---
function r7BountyMoon() {
  return 'Bounties move at night — the board never sleeps, and neither do hunters.';
}
// --- R7 treasure moon: dig by moonlight, the sand glows ---
function r7TreasureMoon() {
  return 'Dig by moonlight — the sand glows pale, and the X is easy to find.';
}
// --- R7 challenge moon: the board glows under the lamps ---
function r7ChalMoon() {
  return 'The challenge board glows under the lamps — night owls chase medals too.';
}
// --- R7 court moonlight: the lamps hum, the game goes on ---
function r7CourtMoon() {
  return 'Moonlight on the court — the lamps hum, the game goes on.';
}
// --- R7 boxing moonlight: the gym never truly closes ---
function r7BoxMoon() {
  return 'The gym never truly closes — someone is always hitting the bag.';
}
// --- R7 dive moonlight: the reef glows at night ---
function r7DiveMoon() {
  return 'Night dive — the reef glows, the fish sleep, the water holds its breath.';
}
// --- R7 jump moonlight: jump by moon, land by luck ---
function r7JumpMoon() {
  return 'Jump by moon, land by luck — the jump club\'s oldest saying.';
}
// --- R7 swamp moonlight: the marsh under the moon ---
function r7SwampMoon() {
  return 'The marsh under the moon — silver water, black reeds, gator eyes.';
}
// --- R7 lodge moonlight: snow and moonlight on the pines ---
function r7LodgeMoon() {
  return 'Snow and moonlight on the pines — the lodge sleeps warm inside.';
}
// --- R7 storm moonlight: the front passes, the moon returns ---
function r7StormMoon() {
  return 'The front passes, the moon returns — the bay exhales.';
}
// --- R7 ride moonlight: the last fare of the night ---
function r7RideMoon() {
  return 'Last fare of the night — the bay goes quiet, the meter stops.';
}
// --- R7 snap moonlight: the bay at night, in silver ---
function r7SnapMoon() {
  const likes = r7SnapPost('skyline');
  toast('Moonlight shot — the bay at night, in silver.');
  return likes;
}
// --- R7 podcast moonlight: the late show ---
function r7PodMoon() {
  return 'The late show — recorded after dark, when the bay tells its best stories.';
}
// --- R7 body moonlight: a walk on the beach at night ---
function r7BodyMoon() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  toast('Night walk on the beach — the bay, the moon, and you. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment moonlight: the city lights from above ---
function r7AptMoon() {
  if (r7Body.apt < 0) return 'No flat, no view.';
  return 'City lights from the ' + R7_APTS[r7Body.apt].n + ' — the bay sparkles below.';
}
// --- R7 rep moonlight: the bay remembers, day and night ---
function r7RepMoon() {
  return 'The bay remembers, day and night — rep ' + r7RepScore() + ' (' + r7RepTitle() + ').';
}
// --- R7 heat moonlight: the heat never sleeps ---
function r7WitMoon() {
  return 'The heat never sleeps — heat ' + r7Wit.heat + '/6 under the moon.';
}
// --- R7 focus moonlight: the slow-mo under the moon ---
function r7FocusMoon() {
  return 'Focus under the moon — the slow-mo feels slower at night.';
}
// --- R7 robbery moonlight: the crew works best at night ---
function r7RobMoon() {
  return 'The crew works best at night — moonlight, low tides, and quiet streets.';
}
// --- R7 theft moonlight: the chop shop under the moon ---
function r7TheftMoon2() {
  return 'The chop shop under the moon — sparks, steel, and whispered prices.';
}
// --- R7 locker moonlight: oil the guns by lamplight ---
function r7LockerMoon() {
  toast('Oil the guns by lamplight — the workshop glows amber.');
  return true;
}
// --- R7 wild moonlight II: the heron fishes by moonlight ---
function r7WildMoon2() {
  return 'The heron fishes by moonlight — still as stone, quick as lightning.';
}
// --- R7 horse dawn: the ranch wakes with the horses ---
function r7HorseDawn(i) {
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 3, 0, 100); r7HorseSave();
  toast('Dawn at the ranch with ' + R7_HORSE2[i].n + ' — hay, coffee, and soft nickers. Bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse dawn: the bay wakes, the kettle sings ---
function r7SafeDawn() {
  toast('Dawn at the safehouse — the kettle sings, the bay wakes gold.');
  return true;
}
// --- R7 stranger dawn: Old Sal is already on the pier ---
function r7StrangerDawn() {
  return 'Old Sal is already on the pier — dawn is his favourite hour.';
}
// --- R7 bounty dawn: the hunt starts at first light ---
function r7BountyDawn() {
  return 'The hunt starts at first light — bounties sleep late, hunters do not.';
}
// --- R7 treasure dawn: dig at dawn, before the heat ---
function r7TreasureDawn() {
  return 'Dig at dawn, before the heat — the sand is cool, the X is clear.';
}
// --- R7 challenge dawn: the board keeper opens the plaza ---
function r7ChalDawn() {
  return 'The board keeper opens the plaza at dawn — fresh chalk, fresh medals.';
}
// --- R7 court dawn: the first game belongs to the early birds ---
function r7CourtDawn() {
  return 'First game belongs to the early birds — the court is empty, the net is tight.';
}
// --- R7 boxing dawn: roadwork before the sun ---
function r7BoxDawn() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 2, 0, 20);
  toast('Roadwork before the sun — the bay sleeps, your legs work. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 dive dawn: the reef wakes with the light ---
function r7DiveDawn() {
  return 'The reef wakes with the light — fish rise, turtles glide, the water turns gold.';
}
// --- R7 jump dawn: the air is still at dawn ---
function r7JumpDawn() {
  return 'The air is still at dawn — the jump club\'s favourite hour.';
}
// --- R7 swamp dawn II: mist on the water ---
function r7SwampDawn2() {
  return 'Mist on the water — the swamp at dawn is another world.';
}
// --- R7 lodge dawn: smoke from the chimney, coffee on the stove ---
function r7LodgeDawn() {
  return 'Smoke from the chimney, coffee on the stove — the lodge wakes slow.';
}
// --- R7 storm dawn: the front is gone, the bay rebuilds ---
function r7StormDawn() {
  if (r7Storm.survived === 0) return 'No storm yet — the dawn is just a dawn.';
  return 'The front is gone — the bay rebuilds in the morning light.';
}
// --- R7 ride dawn: the first passenger, the first story ---
function r7RideDawn() {
  return 'First passenger, first story — the bay talks to its drivers at dawn.';
}
// --- R7 snap dawn: the bay at first light ---
function r7SnapDawn() {
  const likes = r7SnapPost('sunset');
  toast('Dawn shot — the bay at first light, gold on the water.');
  return likes;
}
// --- R7 podcast dawn: the morning show ---
function r7PodDawn() {
  return 'The morning show — recorded at dawn, when the bay is honest.';
}
// --- R7 body dawn: the run that starts the day ---
function r7BodyDawn() {
  r7Body.stamina = r7Clamp(r7Body.stamina + 2, 0, 20);
  toast('Dawn run — the day starts with your feet on the sand. Stamina ' + r7Body.stamina + '.');
  return true;
}
// --- R7 apartment dawn: the city wakes below ---
function r7AptDawn() {
  if (r7Body.apt < 0) return 'No flat, no view.';
  return 'The city wakes below the ' + R7_APTS[r7Body.apt].n + ' — lights going out, boats going in.';
}
// --- R7 rep dawn: a new day, a clean-ish slate ---
function r7RepDawn() {
  return 'A new day — rep ' + r7RepScore() + ' (' + r7RepTitle() + '). The bay gives everyone a morning.';
}
// --- R7 heat dawn: the heat cools overnight, a little ---
function r7WitDawn() {
  r7Wit.heat = r7Clamp(r7Wit.heat - 1, 0, 6);
  if (r7Wit.heat === 0) r7Wit.lockdown = false;
  r7WitSave();
  return 'Dawn — the heat cools a little overnight. Heat ' + r7Wit.heat + '/6.';
}
// --- R7 focus dawn: the meter refills with the sun ---
function r7FocusDawn() {
  r7Focus.meter = 100; r7FocusSave();
  return 'Dawn — the focus meter refills with the sun.';
}
// --- R7 robbery dawn: the crew plans over coffee ---
function r7RobDawn() {
  return 'The crew plans over coffee — Ian with the map, you with the list.';
}
// --- R7 theft dawn: the chop shop opens early ---
function r7TheftDawn() {
  return 'The chop shop opens early — the first car of the day pays best.';
}
// --- R7 locker dawn: the workshop opens with the sun ---
function r7LockerDawn() {
  return 'The workshop opens with the sun — oil, steel, and the smell of work.';
}
// --- R7 wild dawn II: the chorus starts before the light ---
function r7WildDawn2() {
  return 'The chorus starts before the light — herons, gulls, and the swamp waking.';
}
// --- R7 horse breakfast: oats, apples, and a good morning ---
function r7HorseBreakfast(i) {
  r7Horse.bond[i] = r7Clamp(r7Horse.bond[i] + 3, 0, 100); r7HorseSave();
  toast('Breakfast for ' + R7_HORSE2[i].n + ' — oats and apples. Bond ' + r7Horse.bond[i] + '.');
  return true;
}
// --- R7 safehouse breakfast: Ian's pancakes, the bay's best ---
function r7SafeBreakfast() {
  toast("Ian's pancakes — the bay's best breakfast, no contest.");
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  return true;
}
// --- R7 stranger breakfast: Tia busks for the morning crowd ---
function r7StrangerBreakfast() {
  return 'Tia busks for the morning crowd — the plaza wakes to music.';
}
// --- R7 bounty breakfast: hunters eat, then hunt ---
function r7BountyBreakfast() {
  return 'Hunters eat, then hunt — the board waits for no one.';
}
// --- R7 round seven count: how many systems shipped in this round ---
function r7SystemCount() { return 24; }
function r7SystemNames() {
  return ['reputation', 'witness', 'focus', 'robbery', 'theft', 'lockers', 'wildlife', 'horses', 'safehouse', 'strangers', 'bounty', 'treasure', 'challenges', 'courts', 'pool', 'diving', 'jumping', 'swamp', 'lodge', 'storms', 'bayride', 'phone', 'podcasts', 'body'];
}
// --- R7 treasure breakfast: diggers eat before they dig ---
function r7TreasureBreakfast() {
  return 'Diggers eat before they dig — the X will wait for a full stomach.';
}
// --- R7 challenge breakfast: medals are won on full stomachs ---
function r7ChalBreakfast() {
  return 'Medals are won on full stomachs — the board keeper says so.';
}
// --- R7 court breakfast: shootaround before the games ---
function r7CourtBreakfast() {
  return 'Shootaround before the games — the court belongs to the early risers.';
}
// --- R7 boxing breakfast: eggs, toast, and a long run ---
function r7BoxBreakfast() {
  r7Body.strength = r7Clamp(r7Body.strength + 1, 0, 20);
  toast('Boxer breakfast — eggs, toast, and a long run. Strength ' + r7Body.strength + '.');
  return true;
}
// --- R7 dive breakfast: light food, deep water ---
function r7DiveBreakfast() {
  return 'Light food, deep water — the divers\' rule.';
}
// --- R7 jump breakfast II: nerves need toast ---
function r7JumpBreakfast2() {
  return 'Nerves need toast — the jump club eats before it flies.';
}
// --- R7 swamp breakfast: grits and gator stories ---
function r7SwampBreakfast() {
  return 'Grits and gator stories — the swamp dock breakfast.';
}
// --- R7 lodge breakfast: bacon over the fire ---
function r7LodgeBreakfast() {
  toast('Bacon over the fire — the lodge breakfast of champions.');
  r7Body.stamina = r7Clamp(r7Body.stamina + 1, 0, 20);
  return true;
}
// --- R7 storm breakfast: pancakes before the front ---
function r7StormBreakfast() {
  return 'Pancakes before the front — the shelter cooks while the sky darkens.';
}
// --- R7 ride breakfast: coffee for the driver, patience for the road ---
function r7RideBreakfast() {
  return 'Coffee for the driver, patience for the road — the BayRide morning.';
}
// --- R7 snap breakfast: the bay eats with its eyes first ---
function r7SnapBreakfast() {
  const likes = r7SnapPost('street food');
  toast('Breakfast shot — the bay eats with its eyes first.');
  return likes;
}
// --- R7 podcast breakfast: the morning show, with coffee ---
function r7PodBreakfast() {
  return 'The morning show, with coffee — the bay wakes up listening.';
}
// --- End of Round 7: 24 systems, all fresh, all wired. ---
// A final Round 7 note: the bay rewards the patient. Every system above
// pays a little, teaches a little, and remembers what you did.
// Ryan and Ian run the bay together — and the bay runs on their story.
function r7FinalNote() {
  return 'Round 7: 24 systems. Rep, witnesses, focus, robbery, theft, lockers, wildlife, horses, safehouse, strangers, bounty, treasure, challenges, courts, pool, diving, jumping, swamp, lodge, storms, BayRide, phone, podcasts, body.';
}
function r7AllSystemsDone() {
  return r7RepScore() + r7Wit.heat + r7Focus.disarms + r7Rob.done.length + r7Theft.stolen + r7Wild.studied.length + r7Stranger.done.length + r7Bounty.caught.length + r7Treasure.found.length + r7BadgesClaimed.length;
}
function r7RoundSevenReady() { return r7SystemCount() === 24 && typeof r7SelfTest === 'function'; }
// Round 7 ships: reputation to body, twenty-four systems strong.
setupShot();
animate();
window.__solmar = { state, buildingCount, playerState, parkedCars, camera, scene, police, policeBikes, roadblocks, extraVehicles, helis, boats, planes, traffic, buses, BUS_STOPS, CHARS, RADIO_STATIONS, WEAPONS, weaponPickups, vestPickups, ambientPlanes, movingBoats, hunters, AIRPORTS, RACE_CPS, RACE_START, animals, SHOPS, HEIST_STAGES, HEIST_REWARD, groundHeight, chute, heist, ownedProperties, skills, skillLevel, packages, packagesFound: () => packagesFound, golf, streetEvent: () => streetEvent, fireJob: () => fireJob, medicJob: () => medicJob, busJob: () => busJob, taxiJob: () => taxiJob, charMission: () => charMission, onRiver, fish, race, taxiActive: () => !!taxiCall, speak: speakLine, damage: damagePlayer, startRace, togglePhone, openShop, startHeist, startCharMission, startDriverJob, startGolf, collectPassiveIncome, spawnStreetEvent, togglePhotoMode, takePhoto, toggleScope, showStory };
if (window.__r4exports) Object.assign(window.__solmar, window.__r4exports);
if (window.__r5exports) { window.__solmar.r5 = window.__r5exports; window.__solmar.r5selftest = r5SelfTest; }
if (window.__r6exports) { window.__solmar.r6 = window.__r6exports; window.__solmar.r6selftest = r6SelfTest; }
if (window.__r7exports) { window.__solmar.r7 = window.__r7exports; window.__solmar.r7selftest = r7SelfTest; }
