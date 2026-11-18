// Solmar Bay — an original open-world crime game.
// A sun-soaked coastal city: steal cars, run missions for the fixer Marisol,
// dodge the Solmar Bay Police, and climb from broke drifter to king of the bay.
// Everything here is original: city, characters, vehicles, story, art and sound.
// Built with three.js (vendored), procedural canvas textures, synthesized WebAudio.

import * as THREE from 'three';

// ---------- deterministic RNG ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const params = new URLSearchParams(location.search);
const seedParam = parseInt(params.get('seed') || '7', 10) || 7;
const shotMode = params.get('shot') || '';
let rng = mulberry32(seedParam);
function rr(a, b) { return a + rng() * (b - a); }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ---------- game state ----------
const SAVE_KEY = 'solmar-bay-save-v1';
const state = {
  mode: 'start', // start | play | pause | dead
  cash: 0,
  health: 100,
  wanted: 0,
  mission: 0, // index into MISSIONS
  missionStage: 0, // 0 idle, 1 go to pickup, 2 deliver, 3 done
  missionTimer: 0,
  inCar: null,
  speed: 0,
  muted: false,
  shot: shotMode,
  cleanTimer: 0, // seconds with no police nearby
  kills: 0,
  time: 0,
  radio: 0, // index into RADIO_STATIONS
  weapon: 'pistol',
  charMissions: { Ryan: 0, Ian: 0 },
  ammo: { pistol: Infinity, shotgun: 24, smg: 120, knife: Infinity, grenade: 3, molotov: 3, bazooka: 1, sniper: 5 },
  activeChar: 0,
  armor: 0, // vest: absorbs damage before health, 0-100
  dayTime: 0.34, // 0-1 across one game day; starts ~08:10 morning
  weather: 'clear', // clear | rain
};

const MISSIONS = [
  { id: 1, title: 'M1 — First Wheels', giver: 'Marisol', text: 'Steal a car and drive it to the yellow beacon at the marina.', reward: 500 },
  { id: 2, title: 'M2 — Package Run', giver: 'Marisol', text: 'Pick up the package at the north docks, then deliver it to Solmar Intl airport on the far west side before the timer runs out.', reward: 800 },
  { id: 3, title: 'M3 — Lose the Heat', giver: 'Marisol', text: 'Get the cops riled up to 3 stars, then shake them and go clean.', reward: 1200 },
];

const RADIO_STATIONS = [
  { name: 'Solmar FM 88.5', desc: 'synthwave', bpm: 112, bass: [55, 55, 65.41, 49], arp: [220, 261.63, 329.63, 392, 329.63, 261.63] },
  { name: 'Bay Beats 101.1', desc: 'hip-hop', bpm: 92, bass: [41.2, 41.2, 55, 36.71], arp: [110, 130.81, 98, 146.83] },
  { name: 'Coast Rock 95.3', desc: 'rock', bpm: 128, bass: [82.41, 82.41, 98, 73.42], arp: [164.81, 196, 246.94, 196, 164.81, 130.81] },
];
const WEAPONS = {
  pistol: { name: 'Pistol', dmg: 1, rate: 0.35, pellets: 1, spread: 0.01, auto: false },
  shotgun: { name: 'Shotgun', dmg: 1, rate: 0.9, pellets: 5, spread: 0.09, auto: false },
  smg: { name: 'SMG', dmg: 1, rate: 0.09, pellets: 1, spread: 0.05, auto: true },
  knife: { name: 'Knife', dmg: 2, rate: 0.28, pellets: 1, spread: 0, auto: false, melee: true },
  grenade: { name: 'Grenade', dmg: 3, rate: 0.8, pellets: 1, spread: 0, auto: false, thrown: true },
  molotov: { name: 'Molotov', dmg: 2, rate: 0.8, pellets: 1, spread: 0, auto: false, thrown: true },
  bazooka: { name: 'Bazooka', dmg: 5, rate: 1.6, pellets: 1, spread: 0, auto: false, thrown: true },
  sniper: { name: 'Sniper Rifle', dmg: 5, rate: 1.4, pellets: 1, spread: 0.002, auto: false, range: 220 },
};
const DAY_LENGTH = 540; // seconds per game day (9 minutes)
let radioGain = null, radioStep = 0, radioNextTime = 0;
const DAY_KEYS = [
  { t: 0.00, sky: 0x0b1e3a, fog: 0x0b1e3a, hemi: 0.25, sun: 0.0, sunCol: 0x8899ff },
  { t: 0.22, sky: 0x0b1e3a, fog: 0x16283f, hemi: 0.3, sun: 0.05, sunCol: 0xffb080 },
  { t: 0.30, sky: 0xf2a56b, fog: 0xe8b48a, hemi: 0.7, sun: 0.9, sunCol: 0xffc080 },
  { t: 0.38, sky: 0x87c5e8, fog: 0x9fd0e8, hemi: 0.95, sun: 1.6, sunCol: 0xfff2d0 },
  { t: 0.62, sky: 0x87c5e8, fog: 0x9fd0e8, hemi: 0.95, sun: 1.6, sunCol: 0xfff2d0 },
  { t: 0.72, sky: 0xe8853f, fog: 0xd98a5a, hemi: 0.6, sun: 0.8, sunCol: 0xff9030 },
  { t: 0.80, sky: 0x1a2a4a, fog: 0x1a2a4a, hemi: 0.3, sun: 0.0, sunCol: 0x8899ff },
  { t: 1.00, sky: 0x0b1e3a, fog: 0x0b1e3a, hemi: 0.25, sun: 0.0, sunCol: 0x8899ff },
];
let lampMats = [], rainNodes = null, weatherTimer = 180, lightningTimer = 0, rainDark = 0;
let stars = null, moon = null, moonLight = null;
let fireTimer = 0, switchTimer = 0, switchTarget = 0, switchSwapped = false;
let heliAlt = 0, boatBob = 0;

// ---------- audio: WebAudio synth only ----------
let AC = null, engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenLfo = null;
function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    engineOsc = AC.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
    engineGain = AC.createGain(); engineGain.gain.value = 0;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(AC.destination); engineOsc.start();
    sirenOsc = AC.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 700;
    sirenGain = AC.createGain(); sirenGain.gain.value = 0;
    sirenLfo = AC.createOscillator(); sirenLfo.type = 'square'; sirenLfo.frequency.value = 0.9;
    const lfoGain = AC.createGain(); lfoGain.gain.value = 260;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain); sirenGain.connect(AC.destination);
    sirenOsc.start(); sirenLfo.start();
  } catch (e) { AC = null; }
}
function beep(freq, dur, type, vol) {
  if (!AC || state.muted) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.15, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
  o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
}
function chime() { beep(660, 0.12, 'sine', 0.2); setTimeout(() => beep(990, 0.2, 'sine', 0.2), 110); }
function gunshot() {
  if (!AC || state.muted) return;
  const len = AC.sampleRate * 0.18, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  const src = AC.createBufferSource(); src.buffer = buf;
  const g = AC.createGain(); g.gain.value = 0.5;
  src.connect(g); g.connect(AC.destination); src.start();
}
function thud() { beep(90, 0.15, 'triangle', 0.3); }
function radioNote(freq, when, dur, type, vol) {
  if (!AC || !radioGain || state.muted) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g); g.connect(radioGain); o.start(when); o.stop(when + dur + 0.05);
}
function radioKick(when) {
  if (!AC || !radioGain || state.muted) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(120, when);
  o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
  g.gain.setValueAtTime(0.22, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
  o.connect(g); g.connect(radioGain); o.start(when); o.stop(when + 0.2);
}
function radioTick() {
  if (!AC || state.mode !== 'play' || state.muted) { radioNextTime = 0; return; }
  if (!radioGain) {
    radioGain = AC.createGain(); radioGain.gain.value = 0.5;
    radioGain.connect(AC.destination);
  }
  if (radioNextTime < AC.currentTime) radioNextTime = AC.currentTime + 0.05;
  const st = RADIO_STATIONS[state.radio];
  const stepDur = 60 / st.bpm / 4;
  while (radioNextTime < AC.currentTime + 0.25) {
    const s = radioStep % 16;
    const bassNote = st.bass[Math.floor(s / 4) % st.bass.length];
    if (s % 4 === 0) radioNote(bassNote, radioNextTime, stepDur * 3.5, 'sawtooth', 0.11);
    if (state.radio === 0 && s % 2 === 0) radioNote(st.arp[(radioStep * 3) % st.arp.length], radioNextTime, stepDur * 1.6, 'sine', 0.05);
    if (state.radio === 1) {
      if (s === 0 || s === 7 || s === 10) radioKick(radioNextTime);
      if (s % 4 === 2) radioNote(st.arp[s % st.arp.length] * 2, radioNextTime, stepDur, 'triangle', 0.05);
    }
    if (state.radio === 2) {
      if (s % 4 === 0) radioKick(radioNextTime);
      radioNote(st.arp[s % st.arp.length], radioNextTime, stepDur * 1.8, 'square', 0.045);
      if (s === 8) radioNote(st.arp[2] * 2, radioNextTime, stepDur * 2, 'square', 0.04);
    }
    radioStep++;
    radioNextTime += stepDur;
  }
}
function cycleRadio() {
  state.radio = (state.radio + 1) % RADIO_STATIONS.length;
  radioStep = 0; radioNextTime = 0;
  const st = RADIO_STATIONS[state.radio];
  toast('Radio: ' + st.name + ' — ' + st.desc);
  updateHUD();
}
function cycleWeapon(key) {
  const order = ['pistol', 'shotgun', 'smg', 'knife', 'grenade', 'molotov', 'bazooka', 'sniper'];
  const w = order[Number(key) - 1];
  if (!w) return;
  state.weapon = w;
  fireTimer = 0;
  toast('Weapon: ' + WEAPONS[w].name + (state.ammo[w] === Infinity ? ' (infinite ammo)' : ' — ' + state.ammo[w] + ' rounds'));
  updateHUD();
}
// Feature 9: spoken mission dialogue via built-in speechSynthesis. No files,
// no network; if the browser has no voices it silently does nothing.
function speakLine(text) {
  if (state.muted || state.shot) return;
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.0;
    u.pitch = 0.9;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) { /* no voices available — game continues silently */ }
}
function stopSpeech() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) {}
}

// ---------- three.js setup ----------
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
sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 500;
scene.add(sun);
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
sunBall.position.set(220, 190, -160);
scene.add(sunBall);
// Feature 11: stars + moon for the night sky
{
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(320 * 3);
  for (let i = 0; i < 320; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.45 + 0.12;
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
  crater.position.set(-262, 224, 191); crater.visible = false; scene.add(crater);
  moon.userData.crater = crater;
  moonLight = new THREE.DirectionalLight(0x8fa8d8, 0);
  moonLight.position.set(-200, 180, 140);
  scene.add(moonLight);
}

// ---------- procedural canvas textures ----------
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function buildingTexture(base, lit) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 10; y += 22) {
      for (let x = 10; x < w - 10; x += 20) {
        g.fillStyle = rng() < 0.55 ? lit : '#2b3a4a';
        g.fillRect(x, y, 12, 14);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, 12, 3);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 8, w, 8);
  });
}
const BUILDING_COLORS = ['#d8a06a', '#c97b5a', '#e8c98f', '#7fa8c9', '#b98a7a', '#9fb27a', '#d9b8c4', '#8fb8a8'];
const WINDOW_LITS = ['#ffe9a8', '#bfe8ff', '#fff3c0'];
const roadTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#33383e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f5d76e'; g.fillRect(w / 2 - 2, 0, 4, 18); g.fillRect(w / 2 - 2, 54, 4, 18); g.fillRect(w / 2 - 2, 108, 4, 18);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
});
roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
const sandTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#e8d5a0'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { g.fillStyle = rng() < 0.5 ? '#dcc98e' : '#f2e2b0'; g.fillRect(rng() * w, rng() * h, 2, 2); }
});
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(8, 8);
const grassTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#7fae62'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 120; i++) { g.fillStyle = rng() < 0.5 ? '#6d9c52' : '#93c176'; g.fillRect(rng() * w, rng() * h, 2, 3); }
});
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(20, 20);

// ---------- city layout ----------
const BLOCK = 24;         // block pitch (road centre to road centre)
const ROAD_W = 7;
const GRID = 9;           // 9x9 blocks
const CITY = GRID * BLOCK; // ~216 wide
const HALF = CITY / 2;
// Feature 24: terrain heightmap — the map is NOT flat. City stays flat;
// outer zones roll, the north rises into mountains, the beach slopes to sea.
function groundHeight(x, z) {
  if (Math.abs(x) < HALF + 12 && Math.abs(z) < HALF + 12) return 0;
  let h = 2.2 * Math.sin(x * 0.021) * Math.cos(z * 0.017) + 1.4 * Math.sin(x * 0.047 + 1.3) * Math.sin(z * 0.039 + 0.7);
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

function addBox(w, h, d, color, x, y, z, opts) {
  const mat = opts && opts.mat ? opts.mat : new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts && opts.shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
  (opts && opts.parent ? opts.parent : world).add(m);
  return m;
}

// ground: displaced terrain mesh with per-zone vertex colours
const groundGeo = new THREE.PlaneGeometry(560, 560, 110, 110);
groundGeo.rotateX(-Math.PI / 2);
{
  const pos = groundGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x7fae62), cFarm = new THREE.Color(0x9ab854), cForest = new THREE.Color(0x4a7a3a),
    cDesert = new THREE.Color(0xd9b380), cSand = new THREE.Color(0xe8d5a0), cRock = new THREE.Color(0x8a7a68),
    cSwamp = new THREE.Color(0x5a7a42), cTmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, -0.05 + h);
    if (x > HALF) cTmp.copy(cSand);
    else if (z < -230) cTmp.copy(cRock);
    else if (z < -150) cTmp.copy(cForest);
    else if (z > 150) cTmp.copy(cDesert);
    else if (x < -140) cTmp.copy(cFarm);
    else if (x < -195 && z > 200) cTmp.copy(cSwamp);
    else cTmp.copy(cGrass);
    colors[i * 3] = cTmp.r; colors[i * 3 + 1] = cTmp.g; colors[i * 3 + 2] = cTmp.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true }));
ground.receiveShadow = true;
world.add(ground);

// ocean + beach on the east edge (x > HALF + 14)
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(180, 560), new THREE.MeshStandardMaterial({ color: 0x1e7fa8, roughness: 0.25, metalness: 0.35 }));
ocean.rotation.x = -Math.PI / 2; ocean.position.set(HALF + 14 + 90, 0.1, 0);
world.add(ocean);
const beach = new THREE.Mesh(new THREE.PlaneGeometry(28, 560), new THREE.MeshStandardMaterial({ map: sandTex }));
beach.rotation.x = -Math.PI / 2; beach.position.set(HALF + 14, 0.05, 0); beach.receiveShadow = true;
world.add(beach);
// boardwalk strip
addBox(4, 0.3, 560, 0xb98d5f, HALF + 11, 0.1, 0, { shadow: false });

// roads: grid lines
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex });
for (let i = 0; i <= GRID; i++) {
  const c = -HALF + i * BLOCK;
  const rx = new THREE.Mesh(new THREE.PlaneGeometry(CITY + ROAD_W, ROAD_W), roadMat.clone());
  rx.material.map = roadTex.clone(); rx.material.map.repeat.set((CITY + ROAD_W) / 14, 1); rx.material.map.needsUpdate = true;
  rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.02, c); rx.receiveShadow = true; world.add(rx);
  const rz = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, CITY + ROAD_W), roadMat.clone());
  rz.material.map = roadTex.clone(); rz.material.map.repeat.set(1, (CITY + ROAD_W) / 14); rz.material.map.needsUpdate = true;
  rz.rotation.x = -Math.PI / 2; rz.position.set(c, 0.02, 0); rz.receiveShadow = true; world.add(rz);
}
// sidewalks around each block
const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 1 });
for (let ix = 0; ix < GRID; ix++) {
  for (let iz = 0; iz < GRID; iz++) {
    const cx = -HALF + BLOCK / 2 + ix * BLOCK, cz = -HALF + BLOCK / 2 + iz * BLOCK;
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - ROAD_W + 2, BLOCK - ROAD_W + 2), sidewalkMat);
    sw.rotation.x = -Math.PI / 2; sw.position.set(cx, 0.03, cz); sw.receiveShadow = true; world.add(sw);
  }
}
function isRoad(x, z) {
  for (let i = 0; i <= GRID; i++) {
    const c = -HALF + i * BLOCK;
    if (Math.abs(x - c) < ROAD_W / 2 + 0.4) return true;
    if (Math.abs(z - c) < ROAD_W / 2 + 0.4) return true;
  }
  return false;
}
function collideCircle(x, z, r) {
  for (const b of colliders) {
    if (Math.abs(x - b.x) < b.hx + r && Math.abs(z - b.z) < b.hz + r) return b;
  }
  return null;
}

// buildings: 100+ with window textures, a few towers downtown
const buildingMats = [];
let buildingCount = 0;
for (let ix = 0; ix < GRID; ix++) {
  for (let iz = 0; iz < GRID; iz++) {
    const cx = -HALF + BLOCK / 2 + ix * BLOCK, cz = -HALF + BLOCK / 2 + iz * BLOCK;
    const downtown = Math.abs(cx) < 50 && Math.abs(cz) < 50;
    const n = downtown ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const ox = k === 0 ? -4 : 4, oz = k === 0 ? 3 : -4;
      const w = rr(6, 9), d = rr(6, 9);
      const h = downtown ? rr(18, 46) : rr(6, 16);
      const tex = buildingTexture(pick(BUILDING_COLORS), pick(WINDOW_LITS));
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      const b = addBox(w, h, d, 0xffffff, cx + ox, h / 2, cz + oz, { mat });
      b.userData.isBuilding = true;
      colliders.push({ x: cx + ox, z: cz + oz, hx: w / 2, hz: d / 2 });
      // rooftop box
      addBox(w * 0.4, 1.2, d * 0.4, 0x666666, cx + ox, h + 0.6, cz + oz);
      buildingCount++;
    }
  }
}
// marina + docks landmark on the beach side
addBox(30, 3, 8, 0x8a6a4a, HALF + 22, 1.5, 40);
addBox(4, 2, 4, 0xd8d8d8, HALF + 22, 4, 40);

// palm trees + streetlights
const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1 });
const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x3f9e4d, roughness: 0.9 });
function makePalm(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, 5, 6), palmTrunkMat);
  trunk.position.y = 2.5; trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.9), palmLeafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.3, 5.1, Math.sin(a) * 1.3);
    leaf.rotation.y = -a; leaf.rotation.z = 0.35; leaf.castShadow = true; g.add(leaf);
  }
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a22 }));
  nut.position.y = 4.9; g.add(nut);
  g.position.set(x, groundHeight(x, z), z); world.add(g);
}
for (let i = 0; i < 60; i++) {
  const x = rr(-HALF, HALF + 10), z = rr(-HALF, HALF);
  if (isRoad(x, z) || collideCircle(x, z, 2)) continue;
  if (Math.abs(x - (HALF + 14)) < 16) { makePalm(x, z); continue; }
  if (rng() < 0.6) makePalm(x, z);
}
for (let i = 0; i <= GRID; i++) {
  for (let j = 0; j <= GRID; j += 2) {
    const x = -HALF + i * BLOCK + ROAD_W / 2 + 0.6, z = -HALF + j * BLOCK;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.set(x, 3, z); pole.castShadow = true; world.add(pole);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.7 });
    lampMats.push(lampMat);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), lampMat);
    lamp.position.set(x, 6.1, z); world.add(lamp);
  }
}

// ---------- V2 world beyond the city: farmland, forest, desert hills, highway ----------
function zonePatch(w, d, color, x, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); m.receiveShadow = true; world.add(m);
  return m;
}
function makeTree(x, z, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.4 * s, 2.4 * s, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a22, roughness: 1 }));
  trunk.position.y = 1.2 * s; trunk.castShadow = true; g.add(trunk);
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.9 * s, 4.4 * s, 8), new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 0.95 }));
  top.position.y = 4.2 * s; top.castShadow = true; g.add(top);
  g.position.set(x, groundHeight(x, z), z); world.add(g);
}
{
  // farmland west: patchwork fields (ground vertex colours carry the tint)
  // + farmhouses
  for (const [fx, fz] of [[-190, -110], [-230, 110], [-185, 90]]) {
    const gy = groundHeight(fx, fz);
    addBox(7, 4, 6, 0xd8c8a8, fx, 2 + gy, fz);
    addBox(7.6, 1.6, 6.6, 0x8a4a2a, fx, 4.8 + gy, fz);
    colliders.push({ x: fx, z: fz, hx: 3.8, hz: 3.3 });
  }
  for (let i = 0; i < 14; i++) makeTree(rr(-275, -140), rr(-130, 130), rr(0.8, 1.4));
  // forest north: dense trees
  for (let i = 0; i < 46; i++) makeTree(rr(-270, 270), rr(-275, -150), rr(0.9, 1.7));
  // desert hills south: sandy floor + rocky hills
  for (let i = 0; i < 9; i++) {
    const hx = -240 + i * 60 + rr(-14, 14), hz = 185 + rr(-20, 55);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(rr(16, 30), 12, 8), new THREE.MeshStandardMaterial({ color: 0xb98d5f, roughness: 1 }));
    hill.scale.y = 0.45; hill.position.set(hx, 0, hz); hill.castShadow = true; world.add(hill);
    colliders.push({ x: hx, z: hz, hx: 14, hz: 14 });
  }
  for (let i = 0; i < 12; i++) {
    const cx = rr(-260, 260), cz = rr(160, 270);
    const cactus = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, rr(2.5, 4.5), 8), new THREE.MeshStandardMaterial({ color: 0x3f8a4d, roughness: 1 }));
    cactus.position.set(cx, 1.8, cz); cactus.castShadow = true; world.add(cactus);
  }
  // highway west out of town + north/south connectors
  const hwMat = new THREE.MeshStandardMaterial({ map: roadTex });
  const hw = new THREE.Mesh(new THREE.PlaneGeometry(170, 10), hwMat.clone());
  hw.material.map = roadTex.clone(); hw.material.map.repeat.set(12, 1); hw.material.map.needsUpdate = true;
  hw.rotation.x = -Math.PI / 2; hw.position.set(-HALF - 85, 0.02, 0); hw.receiveShadow = true; world.add(hw);
  const hwN = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), hwMat.clone());
  hwN.material.map = roadTex.clone(); hwN.material.map.repeat.set(1, 4); hwN.material.map.needsUpdate = true;
  hwN.rotation.x = -Math.PI / 2; hwN.position.set(0, 0.02, -HALF - 30); world.add(hwN);
  const hwS = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), hwMat.clone());
  hwS.material.map = roadTex.clone(); hwS.material.map.repeat.set(1, 4); hwS.material.map.needsUpdate = true;
  hwS.rotation.x = -Math.PI / 2; hwS.position.set(48, 0.02, HALF + 30); world.add(hwS);
}

// ---------- Feature 10: big map — mountain ring at the edges ----------
{
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 1 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf0f4f8, roughness: 0.9 });
  const peaks = [
    { x: -330, z: -260, h: 110, r: 90 }, { x: -330, z: 0, h: 95, r: 80 },
    { x: -330, z: 260, h: 120, r: 95 }, { x: 330, z: -260, h: 100, r: 85 },
    { x: 330, z: 260, h: 105, r: 88 }, { x: -120, z: -340, h: 90, r: 78 },
    { x: 140, z: -340, h: 98, r: 82 }, { x: 0, z: 340, h: 92, r: 80 },
    { x: -260, z: 340, h: 88, r: 75 },
  ];
  for (const pk of peaks) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(pk.r, pk.h, 8), rockMat);
    m.position.set(pk.x, pk.h / 2 - 4, pk.z); m.castShadow = true; world.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(pk.r * 0.42, pk.h * 0.32, 8), snowMat);
    cap.position.set(pk.x, pk.h - 4 - pk.h * 0.16, pk.z); world.add(cap);
  }
  // winding dirt road climbing the west mountain face (visual switchbacks)
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0xa88a5a, roughness: 1 });
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(46, 5), dirtMat);
    seg.rotation.x = -Math.PI / 2;
    seg.rotation.z = i % 2 === 0 ? 0.35 : -0.35;
    seg.position.set(-300 + (i % 2) * 18, 2 + i * 7, -40 + i * 22);
    world.add(seg);
  }
  const view = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1, 16), new THREE.MeshStandardMaterial({ color: 0x9a8a6a }));
  view.position.set(-292, 34, 48); world.add(view);
}

// ---------- Map shape (Florida-like, original names): keys, central lake, swamp, west town ----------
{
  // keys: a chain of small sandy islands in the southern sea
  const keySpots = [[150, 180], [176, 222], [148, 256], [202, 158], [188, 268]];
  for (const [kx, kz] of keySpots) {
    const isl = new THREE.Mesh(new THREE.CircleGeometry(rr(7, 11), 16), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
    isl.rotation.x = -Math.PI / 2; isl.position.set(kx, 0.12, kz); isl.receiveShadow = true; world.add(isl);
  }
  makePalm(152, 182); makePalm(176, 220); makePalm(200, 160);
  // big central lake in the northern forest basin
  const bigLake = new THREE.Mesh(new THREE.CircleGeometry(32, 28), new THREE.MeshStandardMaterial({ color: 0x2a8ab0, roughness: 0.2, metalness: 0.4 }));
  bigLake.rotation.x = -Math.PI / 2; bigLake.position.set(60, 0.08, -205); world.add(bigLake);
  // swamp / wetland in the southwest, with reeds (ground vertex colours tint it)
  for (let i = 0; i < 24; i++) {
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, rr(1.5, 3), 5), new THREE.MeshStandardMaterial({ color: 0x5a8a3a, roughness: 1 }));
    reed.position.set(rr(-275, -195), 1.2, rr(205, 265)); world.add(reed);
  }
  // small town on the west coast: a cluster of houses + a main street
  const townMat = new THREE.MeshStandardMaterial({ map: roadTex });
  const townSt = new THREE.Mesh(new THREE.PlaneGeometry(12, 90), townMat.clone());
  townSt.material.map = roadTex.clone(); townSt.material.map.repeat.set(1, 6); townSt.material.map.needsUpdate = true;
  townSt.rotation.x = -Math.PI / 2; townSt.position.set(-258, 0.02, -60); world.add(townSt);
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
function makePerson(shirt, pants, skin) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const shirtM = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsM = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtM);
  body.position.y = 1.05; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skinM);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
  hair.position.y = 1.66; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), pantsM);
  legL.position.set(-0.16, 0.35, 0); legL.castShadow = true; g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirtM);
  armL.position.set(-0.42, 1.05, 0); armL.castShadow = true; g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  g.userData = { legL, legR, armL, armR, body };
  return g;
}

// player: Ian — woman, coral shirt, dark jeans, dark hair bun
let player = makePerson(0xd94f70, 0x3a2a4a, 0xd9a066);
const ianBun = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianBun.position.set(0, 1.92, -0.12); player.add(ianBun);
const ianHair = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianHair.position.y = 1.68; player.add(ianHair);
// Feature 35: extra hair parts (hidden until the barber changes the style)
const ianMohawk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianMohawk.position.y = 1.95; ianMohawk.visible = false; player.add(ianMohawk);
const ianLong = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.18), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianLong.position.set(0, 1.3, -0.28); ianLong.visible = false; player.add(ianLong);
const ianShort = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x3a1e10 }));
ianShort.position.y = 1.68; ianShort.visible = false; player.add(ianShort);
player.userData.hair = { bun: ianBun, top: ianHair, mohawk: ianMohawk, long: ianLong, short: ianShort };
player.userData.tattoos = [];
player.position.set(-HALF + BLOCK / 2, 0, 20);
scene.add(player);
let playerState = { x: player.position.x, z: player.position.z, y: 0, vy: 0, heading: 0, walkPhase: 0, onGround: true };
// Final roster (2 characters): Ian (woman) + Ryan (male, yellow shirt,
// blue cap). Each keeps his/her own spot on the map; cash and missions are
// shared across the whole crew. Marisol stays the fixer NPC.
const ryan = makePerson(0xe8b820, 0x27435e, 0xd9a066);
const ryanCap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0x1e5aa8 }));
ryanCap.position.y = 1.82; ryan.add(ryanCap);
const ryanBrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.26), new THREE.MeshStandardMaterial({ color: 0x1e5aa8 }));
ryanBrim.position.set(0, 1.79, 0.3); ryan.add(ryanBrim);
const ryanTop = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanTop.position.y = 1.68; ryanTop.visible = false; ryan.add(ryanTop);
const ryanMohawk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanMohawk.position.y = 1.95; ryanMohawk.visible = false; ryan.add(ryanMohawk);
const ryanLong = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.0, 0.18), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanLong.position.set(0, 1.3, -0.28); ryanLong.visible = false; ryan.add(ryanLong);
const ryanShort = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
ryanShort.position.y = 1.68; ryanShort.visible = false; ryan.add(ryanShort);
ryan.userData.hair = { cap: ryanCap, brim: ryanBrim, top: ryanTop, mohawk: ryanMohawk, long: ryanLong, short: ryanShort };
ryan.userData.tattoos = [];
ryan.position.set(HALF + 6, 0, -20);
scene.add(ryan);
const ryanState = { x: HALF + 6, z: -20, y: 0, vy: 0, heading: -1.2, walkPhase: 0, onGround: true };
const CHARS = [
  { name: 'Ian', mesh: player, st: playerState, outfit: 0xd94f70, hairstyle: 'bun', hairColor: 0x3a1e10, tattoos: [] },
  { name: 'Ryan', mesh: ryan, st: ryanState, outfit: 0xe8b820, hairstyle: 'cap', hairColor: 0x1a1a1a, tattoos: [] },
];
// ---------- Feature 35: barber (hairstyles + hair colour) and tattoos ----------
function setHairstyle(ch, style) {
  const h = ch.mesh.userData.hair;
  if (!h) return;
  for (const k of Object.keys(h)) h[k].visible = false;
  if (style === 'bun') { if (h.bun) h.bun.visible = true; if (h.top) h.top.visible = true; }
  else if (style === 'cap') { if (h.cap) h.cap.visible = true; if (h.brim) h.brim.visible = true; }
  else if (style === 'short') { if (h.short) h.short.visible = true; }
  else if (style === 'long') { if (h.top) h.top.visible = true; if (h.long) h.long.visible = true; }
  else if (style === 'mohawk') { if (h.mohawk) h.mohawk.visible = true; }
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
    m.position.set(0, 1.25, -0.33); m.rotation.y = Math.PI;
  }
  if (!m) return;
  g.add(m);
  ch.tattoos.push(design);
  toast(ch.name + ' got a new tattoo: ' + design + '!');
}
function activeName() { return CHARS[state.activeChar].name; }
function switchCharacter() {
  if (state.mode !== 'play' || switchTimer > 0) return;
  if (state.inCar && (state.inCar.kind === 'heli' || state.inCar.kind === 'plane') && (state.inCar.alt || 0) > 1.5) { toast('Land before switching characters.'); return; }
  if (state.inCar) tryEnterExitVehicle();
  switchTarget = (state.activeChar + 1) % CHARS.length;
  switchTimer = 1.5; switchSwapped = false;
  toast('Switching to ' + CHARS[switchTarget].name + '…');
  beep(520, 0.12, 'sine', 0.15);
}
function finishSwitch() {
  const from = CHARS[state.activeChar];
  from.st.x = playerState.x; from.st.z = playerState.z; from.st.heading = playerState.heading;
  state.activeChar = switchTarget;
  const next = CHARS[state.activeChar];
  player = next.mesh; playerState = next.st;
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
// ---------- Feature 23: parachute ----------
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
  if (chute.mesh) { player.remove(chute.mesh); chute.mesh = null; }
}
function bailOut() {
  if (state.mode !== 'play' || !state.inCar) return;
  const c = state.inCar;
  if ((c.kind === 'heli' || c.kind === 'plane') && (c.alt || 0) > 5) {
    playerState.x = c.mesh.position.x; playerState.z = c.mesh.position.z;
    playerState.y = c.alt; playerState.vy = 0; playerState.onGround = false;
    c.speed = 0;
    state.inCar = null; state.speed = 0;
    player.visible = true;
    player.position.set(playerState.x, playerState.y, playerState.z);
    toast('Bailed out! Press Space to open the parachute.');
    beep(440, 0.15, 'sine', 0.2);
  } else if (c.kind === 'heli' || c.kind === 'plane') {
    toast('Too low to bail out — climb higher first.');
  }
}

// ---------- cars ----------
const CAR_TYPES = [
  { type: 'sedan', color: 0xc0392b, len: 4.2, w: 1.9, h: 0.62, topSpeed: 26 },
  { type: 'sedan', color: 0x2e6fb0, len: 4.2, w: 1.9, h: 0.62, topSpeed: 26 },
  { type: 'taxi', color: 0xf5c518, len: 4.2, w: 1.9, h: 0.62, topSpeed: 25 },
  { type: 'pickup', color: 0x4a7a3a, len: 4.6, w: 2.0, h: 0.72, topSpeed: 24 },
  { type: 'truck', color: 0x8a8f96, len: 6.2, w: 2.3, h: 1.1, topSpeed: 19 },
  { type: 'muscle', color: 0xe86a1e, len: 4.4, w: 2.0, h: 0.6, topSpeed: 30 },
  { type: 'supercar', color: 0xffd23f, len: 4.4, w: 2.0, h: 0.5, topSpeed: 42, accel: 26, steerRate: 0.7 },
  { type: 'firetruck', color: 0xc0392b, len: 6.2, w: 2.3, h: 1.4, topSpeed: 22 },
  { type: 'ambulance', color: 0xf0f0f0, len: 5.2, w: 2.1, h: 1.3, topSpeed: 26 },
  { type: 'bus', color: 0x2e6fb0, len: 9, w: 2.5, h: 2.2, topSpeed: 20 },
  { type: 'police', color: 0xf0f0f0, len: 4.4, w: 1.95, h: 0.66, topSpeed: 30 },
];
function makeCarMesh(spec) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.len), bodyM);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabM = new THREE.MeshStandardMaterial({ color: spec.type === 'truck' ? spec.color : 0x1c2833, roughness: 0.2, metalness: 0.4 });
  const cabLen = spec.type === 'pickup' ? spec.len * 0.32 : spec.type === 'truck' ? spec.len * 0.3 : spec.len * 0.5;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.82, 0.55, cabLen), cabM);
  cab.position.set(0, 0.55 + spec.h / 2 + 0.26, spec.type === 'pickup' ? spec.len * 0.18 : spec.type === 'truck' ? spec.len * 0.28 : -spec.len * 0.05);
  cab.castShadow = true; g.add(cab);
  if (spec.type === 'truck') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.96, 1.5, spec.len * 0.55), new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.6 }));
    box.position.set(0, 1.35, -spec.len * 0.18); box.castShadow = true; g.add(box);
  }
  if (spec.type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xaa8800, emissiveIntensity: 0.4 }));
    sign.position.set(0, 1.42, -0.2); g.add(sign);
  }
  if (spec.type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.42, -0.2); g.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    r.position.set(-0.22, 1.52, -0.2); g.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1 }));
    b.position.set(0.22, 1.52, -0.2); g.add(b);
    g.userData.lightR = r; g.userData.lightB = b;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.02, 0.2, spec.len * 0.9), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    stripe.position.y = 0.55; g.add(stripe);
  }
  if (spec.type === 'firetruck' || spec.type === 'ambulance') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    bar.position.set(0, 0.55 + spec.h / 2 + 0.56, -0.2); g.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1 }));
    r.position.set(-0.22, 0.55 + spec.h / 2 + 0.66, -0.2); g.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: spec.type === 'firetruck' ? 0xffffff : 0x2244ff, emissive: spec.type === 'firetruck' ? 0xffffff : 0x0022ff, emissiveIntensity: 1 }));
    b.position.set(0.22, 0.55 + spec.h / 2 + 0.66, -0.2); g.add(b);
    g.userData.lightR = r; g.userData.lightB = b;
    if (spec.type === 'ambulance') {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 0.4 }));
      cross.position.set(0, 1.1, spec.len / 2 + 0.02); g.add(cross);
    }
  }
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  const wheels = [];
  for (const [wx, wz] of [[-spec.w / 2, spec.len * 0.32], [spec.w / 2, spec.len * 0.32], [-spec.w / 2, -spec.len * 0.32], [spec.w / 2, -spec.len * 0.32]]) {
    const wh = new THREE.Mesh(wheelGeo, wheelM);
    wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.36, wz); wh.castShadow = true; g.add(wh); wheels.push(wh);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffee88, emissiveIntensity: 0.8 }));
  hl.position.set(-0.55, 0.6, spec.len / 2 + 0.01); g.add(hl);
  const hr = hl.clone(); hr.position.x = 0.55; g.add(hr);
  g.userData.headlights = [hl, hr];
  g.userData.wheels = wheels;
  g.userData.spec = spec;
  return g;
}
function roadPoint() {
  const i = Math.floor(rr(0, GRID + 1));
  const c = -HALF + i * BLOCK;
  if (rng() < 0.5) return { x: c + (rng() < 0.5 ? 1.8 : -1.8), z: rr(-HALF, HALF), heading: rng() < 0.5 ? 0 : Math.PI };
  return { x: rr(-HALF, HALF), z: c + (rng() < 0.5 ? 1.8 : -1.8), heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
}

// parked cars the player can steal
const parkedCars = [];
for (let i = 0; i < 12; i++) {
  const spec = pick(CAR_TYPES.filter(c => c.type !== 'police'));
  const mesh = makeCarMesh(spec);
  const p = roadPoint();
  mesh.position.set(p.x, 0, p.z); mesh.rotation.y = p.heading;
  scene.add(mesh);
  parkedCars.push({ mesh, spec, speed: 0, steer: 0, stolen: false });
}
// traffic AI cars on road loops
const traffic = [];
for (let i = 0; i < 14; i++) {
  const spec = pick(CAR_TYPES.filter(c => c.type !== 'police'));
  const mesh = makeCarMesh(spec);
  const p = roadPoint();
  mesh.position.set(p.x, 0, p.z); mesh.rotation.y = p.heading;
  scene.add(mesh);
  traffic.push({ mesh, spec, speed: rr(7, 11), heading: p.heading, loop: Math.floor(rr(0, GRID + 1)), turnAt: 0 });
}
// ---------- V2 vehicle variety: motorcycle, bicycle, buggy ----------
function makeMotoMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.1), bodyM);
  tank.position.y = 0.75; tank.castShadow = true; g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
  seat.position.set(0, 0.82, -0.55); g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  bar.position.set(0, 1.0, 0.45); g.add(bar);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12);
  for (const wz of [0.85, -0.85]) {
    const wh = new THREE.Mesh(wg, wheelM);
    wh.rotation.z = Math.PI / 2; wh.position.set(0, 0.36, wz); wh.castShadow = true; g.add(wh);
  }
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffee88, emissiveIntensity: 0.9 }));
  hl.position.set(0, 0.75, 1.02); g.add(hl);
  g.userData.wheels = [];
  return g;
}
function makeBicycleMesh(color) {
  const g = new THREE.Group();
  const frameM = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), frameM);
  bar.rotation.x = Math.PI / 2; bar.position.y = 0.75; g.add(bar);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), frameM);
  post.position.set(0, 0.65, -0.45); post.rotation.x = 0.5; g.add(post);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  seat.position.set(0, 1.0, -0.6); g.add(seat);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  handle.position.set(0, 1.0, 0.55); g.add(handle);
  const tyreM = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.95 });
  const tg = new THREE.TorusGeometry(0.34, 0.05, 8, 16);
  for (const wz of [0.62, -0.62]) {
    const tyre = new THREE.Mesh(tg, tyreM);
    tyre.position.set(0, 0.34, wz); tyre.castShadow = true; g.add(tyre);
  }
  g.userData.wheels = [];
  return g;
}
function makeBuggyMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.6), bodyM);
  tub.position.y = 0.62; tub.castShadow = true; g.add(tub);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.35, -0.4); g.add(roll);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  seat.position.set(-0.35, 0.95, -0.5); g.add(seat);
  const seat2 = seat.clone(); seat2.position.x = 0.35; g.add(seat2);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wg = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 0.85], [0.95, 0.85], [-0.95, -0.85], [0.95, -0.85]]) {
    const wh = new THREE.Mesh(wg, wheelM);
    wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.48, wz); wh.castShadow = true; g.add(wh); wheels.push(wh);
  }
  g.userData.wheels = wheels;
  return g;
}
// Feature 15: rideable horse — Feature 16: quad bike (ATV)
function makeHorseMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.7), bodyM);
  body.position.y = 1.15; body.castShadow = true; g.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.4), bodyM);
  neck.position.set(0, 1.7, 0.85); neck.rotation.x = 0.5; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.7), bodyM);
  head.position.set(0, 2.0, 1.2); g.add(head);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
  mane.position.set(0, 1.85, 0.7); mane.rotation.x = 0.5; g.add(mane);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
  tail.position.set(0, 1.1, -0.95); tail.rotation.x = -0.4; g.add(tail);
  const legM = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 });
  const legs = [];
  for (const [lx, lz] of [[-0.25, 0.6], [0.25, 0.6], [-0.25, -0.6], [0.25, -0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6), legM);
    leg.position.set(lx, 0.45, lz); leg.castShadow = true; g.add(leg); legs.push(leg);
  }
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x8a2a2a }));
  saddle.position.set(0, 1.55, 0); g.add(saddle);
  g.userData.legs = legs; g.userData.wheels = [];
  return g;
}
function makeQuadMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 2.1), bodyM);
  body.position.y = 0.62; body.castShadow = true; g.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.9), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  seat.position.set(0, 0.9, -0.45); g.add(seat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  bar.position.set(0, 1.0, 0.7); g.add(bar);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x444444 }));
  rack.position.set(0, 0.85, -1.0); g.add(rack);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.75, 0.7], [0.75, 0.7], [-0.75, -0.7], [0.75, -0.7]]) {
    const wh = new THREE.Mesh(wg, wheelM);
    wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.42, wz); wh.castShadow = true; g.add(wh); wheels.push(wh);
  }
  g.userData.wheels = wheels;
  return g;
}
const extraVehicles = [];
function addExtraVehicle(kind, mesh, spec, x, z, heading) {
  mesh.position.set(x, 0, z); mesh.rotation.y = heading;
  scene.add(mesh);
  const v = { mesh, spec, kind, speed: 0, steer: 0, stolen: false, alt: 0 };
  extraVehicles.push(v);
  return v;
}
{
  const spots = [
    { kind: 'moto', color: 0xc0392b, top: 34, accel: 22, steer: 0.85, name: 'motorcycle' },
    { kind: 'moto', color: 0x2e6fb0, top: 33, accel: 21, steer: 0.85, name: 'motorcycle' },
    { kind: 'moto', color: 0x222222, top: 35, accel: 23, steer: 0.9, name: 'motorcycle' },
    { kind: 'bike', color: 0x2ecc71, top: 12, accel: 8, steer: 0.7, name: 'bicycle' },
    { kind: 'bike', color: 0xe8b820, top: 11, accel: 8, steer: 0.7, name: 'bicycle' },
    { kind: 'buggy', color: 0xe86a1e, top: 23, accel: 15, steer: 0.6, name: 'dune buggy' },
    { kind: 'buggy', color: 0x1e8a8a, top: 23, accel: 15, steer: 0.6, name: 'dune buggy' },
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
  // Feature 15: horses grazing at the farms
  addExtraVehicle('horse', makeHorseMesh(0x8a5a2a), { type: 'horse', topSpeed: 18, accel: 14, steerRate: 0.7, label: 'horse' }, -195, -30, 0.8);
  addExtraVehicle('horse', makeHorseMesh(0x3a2a1a), { type: 'horse', topSpeed: 18, accel: 14, steerRate: 0.7, label: 'horse' }, -215, 50, -1.2);
  // Feature 16: quad bikes — farm, beach, desert foothills
  addExtraVehicle('quad', makeQuadMesh(0x2ecc71), { type: 'quad', topSpeed: 24, accel: 17, steerRate: 0.8, label: 'quad bike' }, -180, 80, 0.3);
  addExtraVehicle('quad', makeQuadMesh(0xe86a1e), { type: 'quad', topSpeed: 24, accel: 17, steerRate: 0.8, label: 'quad bike' }, HALF + 16, -110, 1.0);
  addExtraVehicle('quad', makeQuadMesh(0x9b59b6), { type: 'quad', topSpeed: 24, accel: 17, steerRate: 0.8, label: 'quad bike' }, 60, 230, -0.6);
}
// ---------- V2 air & sea: helicopter, boat, ambient planes ----------
function makeHeliMesh(color) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 4.4), bodyM);
  body.position.y = 1.1; body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.0), new THREE.MeshStandardMaterial({ color: 0x1c2833, roughness: 0.15, metalness: 0.5 }));
  glass.position.set(0, 1.25, 1.9); g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.2), bodyM);
  tail.position.set(0, 1.3, -3.4); tail.castShadow = true; g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), bodyM);
  fin.position.set(0, 1.7, -4.8); g.add(fin);
  const rotorM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.08, 0.35), rotorM);
  rotor.position.y = 2.0; g.add(rotor);
  const rotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 9.5), rotorM);
  rotor2.position.y = 2.0; g.add(rotor2);
  g.userData.rotor = rotor; g.userData.rotor2 = rotor2; g.userData.wheels = [];
  const skidM = new THREE.MeshStandardMaterial({ color: 0x333333 });
  for (const sx of [-0.8, 0.8]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.4), skidM);
    skid.position.set(sx, 0.15, 0); g.add(skid);
  }
  return g;
}
function makeBoatMesh(color) {
  const g = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 5.2), hullM);
  hull.position.y = 0.45; hull.castShadow = true; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 4), hullM);
  bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.45, 3.2); g.add(bow);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 3.4), new THREE.MeshStandardMaterial({ color: 0xf0ead8 }));
  deck.position.set(0, 0.9, -0.4); g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cabin.position.set(0, 1.3, -0.8); cabin.castShadow = true; g.add(cabin);
  g.userData.wheels = [];
  return g;
}
function makePlaneMesh(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.4 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 9, 10), m);
  fus.rotation.x = Math.PI / 2; g.add(fus);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 2.2), m);
  g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 1.4), m);
  tail.position.z = -4; g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 1.4), m);
  fin.position.set(0, 1.2, -4); g.add(fin);
  return g;
}
// Feature 4A: flyable aircraft variety — prop, jet, seaplane
function makePropPlaneMesh(color) {
  const g = makePlaneMesh(color);
  const propM = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.4, 0.12), propM);
  prop.position.set(0, 0, 4.7); g.add(prop);
  const prop2 = prop.clone(); prop2.rotation.z = Math.PI / 2; g.add(prop2);
  g.userData.prop = prop; g.userData.prop2 = prop2; g.userData.wheels = [];
  return g;
}
function makeJetMesh(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.7 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 10, 10), m);
  fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 10), m);
  nose.rotation.x = Math.PI / 2; nose.position.z = 6.1; g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 2.4), m);
  wing.position.z = -0.5; wing.rotation.y = 0.25; g.add(wing);
  const wing2 = wing.clone(); wing2.rotation.y = -0.25; g.add(wing2);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 1.6), m);
  fin.position.set(0, 1.4, -4.2); g.add(fin);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xff9030, emissive: 0xff6000, emissiveIntensity: 1.2 }));
  flame.rotation.x = -Math.PI / 2; flame.position.z = -5.8; g.add(flame);
  g.userData.wheels = [];
  return g;
}
function makeSeaplaneMesh(color) {
  const g = makePropPlaneMesh(color);
  const floatM = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.4 });
  for (const sx of [-1.1, 1.1]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.4, 8), floatM);
    fl.rotation.x = Math.PI / 2; fl.position.set(sx, -1.2, 0.4); g.add(fl);
  }
  return g;
}
const helis = [], boats = [], ambientPlanes = [];
{
  const heliPad = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.9 }));
  heliPad.position.set(-HALF + 3 * BLOCK, 0.12, HALF - 2 * BLOCK); heliPad.receiveShadow = true; world.add(heliPad);
  const hMark = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
  hMark.position.set(-HALF + 3 * BLOCK, 0.26, HALF - 2 * BLOCK); world.add(hMark);
  const h1 = makeHeliMesh(0xd94f2e);
  h1.position.set(-HALF + 3 * BLOCK, 0.3, HALF - 2 * BLOCK); scene.add(h1);
  helis.push({ mesh: h1, spec: { type: 'heli', topSpeed: 30, label: 'helicopter' }, kind: 'heli', speed: 0, steer: 0, stolen: false, alt: 0 });
  const h2 = makeHeliMesh(0x2e6fb0);
  h2.position.set(HALF + 4, 0.3, -30); scene.add(h2);
  helis.push({ mesh: h2, spec: { type: 'heli', topSpeed: 30, label: 'helicopter' }, kind: 'heli', speed: 0, steer: 0, stolen: false, alt: 0 });
  const b1 = makeBoatMesh(0xf0f0f0);
  b1.position.set(HALF + 20, 0.15, 40); b1.rotation.y = 0.4; scene.add(b1);
  boats.push({ mesh: b1, spec: { type: 'boat', topSpeed: 20, label: 'speedboat' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  const b2 = makeBoatMesh(0x1e8a8a);
  b2.position.set(HALF + 21, 0.15, -16); b2.rotation.y = -0.5; scene.add(b2);
  boats.push({ mesh: b2, spec: { type: 'boat', topSpeed: 20, label: 'speedboat' }, kind: 'boat', speed: 0, steer: 0, stolen: false, alt: 0 });
  for (let i = 0; i < 2; i++) {
    const pl = makePlaneMesh(i === 0 ? 0xe8e8e8 : 0xc9d6e8);
    pl.position.set(-260 + i * 180, 85 + i * 18, -120 + i * 90);
    scene.add(pl);
    ambientPlanes.push({ mesh: pl, speed: 26 + i * 5, dir: 1 });
  }
}
// ---------- V2 weapon pickups (glowing, respawn) ----------
const weaponPickups = [];
function spawnPickup(idx) {
  const kinds = ['shotgun', 'smg', 'grenade', 'molotov', 'shotgun', 'smg', 'grenade', 'bazooka'];
  const kind = kinds[idx % kinds.length];
  const color = kind === 'shotgun' ? 0xff8c1a : kind === 'smg' ? 0x2ee6ff : kind === 'grenade' ? 0x2ecc71 : kind === 'molotov' ? 0xff7a1a : 0xff2a7a;
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 }));
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.08, 8, 20), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2; g.add(ring);
  const p = roadPoint();
  g.position.set(p.x, 1.4, p.z);
  scene.add(g);
  weaponPickups.push({ mesh: g, kind, timer: 0, taken: false });
}
for (let i = 0; i < 8; i++) spawnPickup(i);
function updatePickups(dt) {
  for (let i = 0; i < weaponPickups.length; i++) {
    const pk = weaponPickups[i];
    if (pk.taken) {
      pk.timer -= dt;
      if (pk.timer <= 0) {
        const p = roadPoint();
        pk.mesh.position.set(p.x, 1.4, p.z);
        pk.mesh.visible = true; pk.taken = false;
      }
      continue;
    }
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 1.4 + Math.sin(state.time * 2.5 + i) * 0.25;
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(pk.mesh.position.x - px, pk.mesh.position.z - pz) < 2.4) {
      pk.taken = true; pk.timer = 20; pk.mesh.visible = false;
      const grant = pk.kind === 'shotgun' ? 12 : pk.kind === 'smg' ? 60 : pk.kind === 'bazooka' ? 1 : 3;
      const keyNum = { shotgun: '2', smg: '3', knife: '4', grenade: '5', molotov: '6', bazooka: '7' }[pk.kind];
      state.ammo[pk.kind] = (state.ammo[pk.kind] || 0) + grant;
      state.weapon = pk.kind;
      toast('Picked up ' + WEAPONS[pk.kind].name + '! +' + grant + ' rounds. Press ' + keyNum + ' to use it.');
      chime(); updateHUD();
    }
  }
}
// ---------- Feature 8: vest pickups (blue-grey, +50 armor, cap 100) ----------
const vestPickups = [];
function spawnVest(idx) {
  const g = new THREE.Group();
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.32), new THREE.MeshStandardMaterial({ color: 0x4a6fa5, emissive: 0x2a4a7a, emissiveIntensity: 0.9, roughness: 0.6 }));
  g.add(vest);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.34), new THREE.MeshStandardMaterial({ color: 0xdfe8f2, emissive: 0x8fa8c8, emissiveIntensity: 0.5 }));
  stripe.position.y = 0.2; g.add(stripe);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 20), new THREE.MeshBasicMaterial({ color: 0x7fb2e8 }));
  ring.rotation.x = Math.PI / 2; g.add(ring);
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
        pk.mesh.visible = true; pk.taken = false;
      }
      continue;
    }
    pk.mesh.rotation.y += dt * 1.5;
    pk.mesh.position.y = 1.4 + Math.sin(state.time * 2 + i * 1.3) * 0.22;
    const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
    const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
    if (Math.hypot(pk.mesh.position.x - px, pk.mesh.position.z - pz) < 2.4) {
      pk.taken = true; pk.timer = 25; pk.mesh.visible = false;
      state.armor = Math.min(100, state.armor + 50);
      toast('Vest picked up! Armor ' + Math.round(state.armor) + '/100 — it takes hits before your health does.');
      chime(); updateHUD();
    }
  }
}
function updateAmbientPlanes(dt) {
  for (const pl of ambientPlanes) {
    pl.mesh.position.x += pl.speed * dt * pl.dir;
    pl.mesh.rotation.y = pl.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (pl.mesh.position.x > 300) pl.mesh.position.x = -300;
    if (pl.mesh.position.x < -300) pl.mesh.position.x = 300;
  }
}
// police cars (spawned by wanted level)
const police = [];
const policeBikes = [];
function spawnPolice() {
  const outside = Math.abs(playerState.x) > HALF || Math.abs(playerState.z) > HALF;
  if (outside && police.filter((p) => p.sheriff).length < 2) { spawnSheriff(); return; }
  const spec = CAR_TYPES.find(c => c.type === 'police');
  const mesh = makeCarMesh(spec);
  const a = rng() * Math.PI * 2;
  mesh.position.set(playerState.x + Math.cos(a) * 45, 0, playerState.z + Math.sin(a) * 45);
  scene.add(mesh);
  police.push({ mesh, spec, speed: 0, heading: 0 });
}

// pedestrians on sidewalks
const PED_SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c, 0xe67e22];
const peds = [];
for (let i = 0; i < 20; i++) {
  const p = makePerson(pick(PED_SHIRTS), pick([0x2c3e50, 0x5d4037, 0x37474f]), pick([0xd9a066, 0x8a5a33, 0xf0c8a0]));
  let x = rr(-HALF, HALF), z = rr(-HALF, HALF);
  let guard = 0;
  while ((isRoad(x, z) || collideCircle(x, z, 1.5)) && guard++ < 40) { x = rr(-HALF, HALF); z = rr(-HALF, HALF); }
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
function updateCompanion(dt) {
  // companion only during the shared story missions
  if (state.mission >= MISSIONS.length || state.mode !== 'play') return;
  const comp = CHARS[1 - state.activeChar];
  const mesh = comp.mesh;
  if (state.inCar) {
    // rides in the vehicle — passenger seat beside the driver
    const c = state.inCar.mesh;
    const h = c.rotation.y;
    mesh.position.set(c.position.x + Math.cos(h) * 1.3, c.position.y + 0.4, c.position.z - Math.sin(h) * 1.3);
    mesh.rotation.y = h;
    mesh.visible = true;
    return;
  }
  const dx = playerState.x - mesh.position.x, dz = playerState.z - mesh.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 3) {
    const sp = d > 10 ? 6 : 3.5;
    mesh.position.x += (dx / d) * sp * dt;
    mesh.position.z += (dz / d) * sp * dt;
    mesh.rotation.y = Math.atan2(dx, dz);
    comp.st.x = mesh.position.x; comp.st.z = mesh.position.z;
  }
  mesh.position.y = groundHeight(mesh.position.x, mesh.position.z);
  mesh.visible = true;
  // companion helps shoot during missions
  companionShootTimer -= dt;
  if (companionShootTimer <= 0) {
    companionShootTimer = 3;
    for (let i = police.length - 1; i >= 0; i--) {
      const po = police[i];
      if (Math.hypot(po.mesh.position.x - playerState.x, po.mesh.position.z - playerState.z) < 18) {
        scene.remove(po.mesh); police.splice(i, 1);
        beep(880, 0.1, 'square', 0.12);
        toast(CHARS[1 - state.activeChar].name + ' took out a cop for you!');
        break;
      }
    }
  }
}

function startMission(i) {
  state.mission = i; state.missionStage = 1;
  if (i === 0) { setBeacon(SPOTS.marina.x, SPOTS.marina.z); speakLine(activeName() + ', first job. Steal a car and bring it to the marina beacon.'); }
  if (i === 1) { setBeacon(SPOTS.docks.x, SPOTS.docks.z); speakLine('Package at the north docks. Grab it, then deliver it downtown before the clock runs out.'); }
  if (i === 2) { beacon.visible = false; speakLine('Time to make some noise. Get to three stars, then lose the cops.'); }
  updateObjective();
  phoneMsgText = 'Marisol: ' + MISSIONS[i].text;
  if (state.mode === 'play' && !state.shot) toast('New message from Marisol — press U to read it.');
}
function updateObjective() {
  const t = document.getElementById('objTitle'), s = document.getElementById('objText');
  if (state.mission >= MISSIONS.length) { t.textContent = 'Free Roam — King of the Bay'; s.textContent = 'All missions done. Explore Solmar Bay, earn cash, dodge the law.'; return; }
  const m = MISSIONS[state.mission];
  t.textContent = m.title + '  ·  $' + m.reward;
  let extra = '';
  if (state.mission === 1 && state.missionStage === 2) extra = ' — deliver to the airport!';
  if (state.mission === 2) extra = state.wanted >= 3 ? ' — now LOSE the cops!' : ' — cause some trouble to reach 3 stars!';
  if (state.mission === 1) extra += '  ⏱ ' + Math.max(0, Math.ceil(state.missionTimer)) + 's';
  s.textContent = 'Marisol: ' + m.text + extra;
}
function completeMission() {
  const m = MISSIONS[state.mission];
  state.cash += m.reward;
  toast('Mission complete! +$' + m.reward + ' — Marisol sends her regards.');
  speakLine('Clean work, ' + activeName() + '. ' + m.reward + ' dollars, as promised. Marisol sends her regards.');
  chime(); beacon.visible = false;
  // Story rule: Ryan & Ian are a couple — a short duo scene after each mission
  const duo = [
    'Ryan: That went smooth. Ian: Smooth? You nearly drove into the sea. Ryan: Nearly counts.',
    'Ian: Next time YOU drive. Ryan: You say that every time, love. Ian: And every time I am right.',
    'Ryan: Marisol is going to love us. Ian: She already does — she just charges extra for it.',
  ];
  showStory(duo[state.mission] || duo[0]);
  state.mission++; state.missionStage = 0;
  if (state.mission < MISSIONS.length) { setTimeout(() => startMission(state.mission), 1200); if (state.mission === 1) state.missionTimer = 90; }
  saveGame(); updateObjective(); updateHUD();
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
function updateTaxi(dt) {
  if (!taxiCall) return;
  const px = playerState.x, pz = playerState.z;
  const dx = px - taxiCall.mesh.position.x, dz = pz - taxiCall.mesh.position.z;
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
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, mission: state.mission, charMissions: state.charMissions, skills, packagesFound })); } catch (e) {}
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
    if (ex.timer <= 0) { scene.remove(ex.mesh); explosions.splice(i, 1); }
  }
}
function updateFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i];
    f.timer -= dt;
    f.burnTimer -= dt;
    if (f.burnTimer <= 0) {
      f.burnTimer = 0.5;
      for (const p of peds) {
        if (!p.down && Math.hypot(p.x - f.mesh.position.x, p.z - f.mesh.position.z) < 4.5) {
          p.down = true; p.downTimer = 4; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
        }
      }
    }
    f.mesh.material.opacity = 0.5 + Math.sin(state.time * 8) * 0.2;
    if (f.timer <= 0) { scene.remove(f.mesh); fires.splice(i, 1); }
  }
}
function knifeAttack() {
  if (fireTimer > 0) return;
  fireTimer = WEAPONS.knife.rate;
  thud();
  const fx = Math.sin(playerState.heading), fz = Math.cos(playerState.heading);
  for (const p of peds) {
    if (p.down) continue;
    const dx = p.x - playerState.x, dz = p.z - playerState.z;
    if (Math.hypot(dx, dz) < 2.6 && dx * fx + dz * fz > 0) {
      p.down = true; p.downTimer = 5; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
      if (p.isBounty) collectBounty(p);
      addWanted(1, 'Knife attack!');
      toast('Knife hit — faster and nastier than a punch.');
      break;
    }
  }
}
function shootWeapon() {
  if (state.mode !== 'play') return;
  if (state.weapon === 'knife') { knifeAttack(); return; }
  if (state.weapon === 'grenade' || state.weapon === 'molotov' || state.weapon === 'bazooka') {
    if (fireTimer > 0) return;
    if (state.ammo[state.weapon] <= 0) { toast('Out of ' + WEAPONS[state.weapon].name + 's — buy more at Bay Arms.'); fireTimer = 0.4; return; }
    fireTimer = WEAPONS[state.weapon].rate;
    state.ammo[state.weapon]--;
    throwWeapon();
    updateHUD();
    return;
  }
  if (state.inCar && state.inCar.kind === 'heli') { toast('No drive-by from a helicopter — land first.'); return; }
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
  audioInit(); gunshot();
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
          pd.down = true; pd.downTimer = 6; pd.mesh.rotation.x = -Math.PI / 2; pd.mesh.position.y = 0.3;
          state.kills++;
          addSkill('shooting', 5);
          if (pd.isBounty) collectBounty(pd);
          addWanted(1, 'Shots fired! Cops are coming.');
          break;
        }
      }
      // Feature 19: hunting — meat/hide sells for cash
      for (const an of animals) {
        if (an.mesh === obj && !an.down && an.kind !== 'bird' && an.kind !== 'fish') {
          an.down = true; an.downTimer = 8; an.mesh.rotation.x = -Math.PI / 2; an.mesh.position.y = 0.3;
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
  scene.add(tracer); tracerTimer = 0.08;
  updateHUD();
}
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
    if (Math.abs(c.speed) > 8) { thud(); damagePlayer(c.kind === 'moto' ? 12 : 6, 'You crashed hard'); }
    c.speed *= -0.25;
  } else {
    c.mesh.position.x = nx; c.mesh.position.z = nz;
  }
  if (c.kind === 'buggy') c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z) + (Math.abs(c.speed) > 2 ? Math.abs(Math.sin(state.time * 9)) * 0.25 : 0);
  else c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z);
  c.mesh.position.x = clamp(c.mesh.position.x, -280, HALF + 24);
  c.mesh.position.z = clamp(c.mesh.position.z, -280, 280);
  state.speed = c.speed;
  for (const p of peds) {
    if (p.down) continue;
    if (Math.hypot(p.x - c.mesh.position.x, p.z - c.mesh.position.z) < 1.8 && Math.abs(c.speed) > 3) {
      p.down = true; p.downTimer = 6; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
      addWanted(1, 'You hit a pedestrian!');
    }
  }
  checkMissionSpot();
}
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
      if (Math.abs(c.speed) > 10) { thud(); damagePlayer(6, 'You crashed the plane'); }
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
  if (!collideCircle(nx, nz, 0.8)) { c.mesh.position.x = nx; c.mesh.position.z = nz; }
  else c.speed *= 0.5;
  c.mesh.position.x = clamp(c.mesh.position.x, -280, 280);
  c.mesh.position.z = clamp(c.mesh.position.z, -280, 280);
  // jump with Space — small hop over low obstacles
  if (!c.jumpVy) c.jumpVy = 0;
  if (!c.jumpY) c.jumpY = 0;
  if (keys['Space'] && c.jumpY === 0) c.jumpVy = 5.5;
  c.jumpVy -= 18 * dt;
  c.jumpY = Math.max(0, c.jumpY + c.jumpVy * dt);
  if (c.jumpY === 0) c.jumpVy = 0;
  c.mesh.position.y = groundHeight(c.mesh.position.x, c.mesh.position.z) + c.jumpY;
  const legs = c.mesh.userData.legs || [];
  legs.forEach((leg, i) => { leg.rotation.x = Math.sin(state.time * 10 + i * Math.PI) * clamp(Math.abs(c.speed) / 10, 0, 1) * 0.7; });
  state.speed = c.speed;
  checkMissionSpot();
}
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
  // Feature 13: boats sail the sea AND the river; land blocks them.
  const inSea = nx >= HALF + 10 && nx <= 275 && nz >= -270 && nz <= 270;
  const inRiver = onRiver(nx, nz);
  if (inSea || inRiver) { c.mesh.position.x = nx; c.mesh.position.z = nz; }
  else { c.speed *= 0.5; }
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
function punch() {
  if (state.mode !== 'play' || state.inCar) return;
  if (castOrReel()) return;
  thud();
  const fx = Math.sin(playerState.heading), fz = Math.cos(playerState.heading);
  for (const p of peds) {
    if (p.down) continue;
    const dx = p.x - playerState.x, dz = p.z - playerState.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2 && dx * fx + dz * fz > 0) {
      if (p.isBounty) {
        p.down = true; p.downTimer = 4; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
        collectBounty(p);
        addWanted(1, 'You knocked someone out!');
        break;
      }
      // Feature 32: punched peds react — angry ones fight back, scared ones flee screaming
      if (rng() < 0.45) {
        p.angry = true; p.angryTimer = 5; p.attackCd = 0;
        toast('That pedestrian is ANGRY — they are fighting back!');
        beep(180, 0.2, 'sawtooth', 0.2);
      } else {
        p.flee = true; p.speed = 6;
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
function damagePlayer(n, cause) {
  if (state.mode !== 'play') return;
  // Feature 8: vest absorbs damage first, before health drops.
  if (state.armor > 0 && n > 0) {
    const absorbed = Math.min(state.armor, n);
    state.armor -= absorbed;
    n -= absorbed;
    if (absorbed > 0) toast('Vest took ' + Math.round(absorbed) + ' damage — armor ' + Math.round(state.armor) + ' left.');
  }
  state.health -= n;
  if (state.health <= 0) {
    state.health = 0; state.mode = 'dead';
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
setupShot();
animate();
window.__solmar = { state, buildingCount, playerState, parkedCars, camera, scene, police, policeBikes, roadblocks, extraVehicles, helis, boats, planes, traffic, buses, BUS_STOPS, CHARS, RADIO_STATIONS, WEAPONS, weaponPickups, vestPickups, ambientPlanes, movingBoats, hunters, AIRPORTS, RACE_CPS, RACE_START, animals, SHOPS, HEIST_STAGES, HEIST_REWARD, groundHeight, chute, heist, ownedProperties, skills, skillLevel, packages, packagesFound: () => packagesFound, golf, streetEvent: () => streetEvent, fireJob: () => fireJob, medicJob: () => medicJob, busJob: () => busJob, taxiJob: () => taxiJob, charMission: () => charMission, onRiver, fish, race, taxiActive: () => !!taxiCall, speak: speakLine, damage: damagePlayer, startRace, togglePhone, openShop, startHeist, startCharMission, startDriverJob, startGolf, collectPassiveIncome, spawnStreetEvent, togglePhotoMode, takePhoto, toggleScope, showStory };
if (window.__r4exports) Object.assign(window.__solmar, window.__r4exports);
