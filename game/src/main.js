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
};

const MISSIONS = [
  { id: 1, title: 'M1 — First Wheels', giver: 'Marisol', text: 'Steal a car and drive it to the yellow beacon at the marina.', reward: 500 },
  { id: 2, title: 'M2 — Package Run', giver: 'Marisol', text: 'Pick up the package at the north docks, then deliver it downtown before the timer runs out.', reward: 800 },
  { id: 3, title: 'M3 — Lose the Heat', giver: 'Marisol', text: 'Get the cops riled up to 3 stars, then shake them and go clean.', reward: 1200 },
];

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

// ---------- three.js setup ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5e8);
scene.fog = new THREE.Fog(0x9fd0e8, 160, 420);
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

// ground: grass base, then roads, sidewalks, beach + ocean
const ground = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshStandardMaterial({ map: grassTex }));
ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0); ground.receiveShadow = true;
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
  g.position.set(x, 0, z); world.add(g);
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
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffdf80, emissiveIntensity: 0.7 }));
    lamp.position.set(x, 6.1, z); world.add(lamp);
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

// player: Rico Vane — teal shirt, dark jeans, red cap
const player = makePerson(0x1e8a8a, 0x2a2f45, 0xd9a066);
const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
cap.position.y = 1.82; player.add(cap);
const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.26), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
capBrim.position.set(0, 1.79, 0.3); player.add(capBrim);
player.position.set(-HALF + BLOCK / 2, 0, 20);
scene.add(player);
const playerState = { x: player.position.x, z: player.position.z, y: 0, vy: 0, heading: 0, walkPhase: 0, onGround: true };

// ---------- cars ----------
const CAR_TYPES = [
  { type: 'sedan', color: 0xc0392b, len: 4.2, w: 1.9, h: 0.62, topSpeed: 26 },
  { type: 'sedan', color: 0x2e6fb0, len: 4.2, w: 1.9, h: 0.62, topSpeed: 26 },
  { type: 'taxi', color: 0xf5c518, len: 4.2, w: 1.9, h: 0.62, topSpeed: 25 },
  { type: 'pickup', color: 0x4a7a3a, len: 4.6, w: 2.0, h: 0.72, topSpeed: 24 },
  { type: 'truck', color: 0x8a8f96, len: 6.2, w: 2.3, h: 1.1, topSpeed: 19 },
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
// police cars (spawned by wanted level)
const police = [];
function spawnPolice() {
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
  peds.push({ mesh: p, x, z, heading: rng() * Math.PI * 2, speed: rr(1, 2), target: null, down: false, downTimer: 0, phase: rng() * 6 });
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
};
function startMission(i) {
  state.mission = i; state.missionStage = 1;
  if (i === 0) { setBeacon(SPOTS.marina.x, SPOTS.marina.z); }
  if (i === 1) { setBeacon(SPOTS.docks.x, SPOTS.docks.z); }
  if (i === 2) { beacon.visible = false; }
  updateObjective();
}
function updateObjective() {
  const t = document.getElementById('objTitle'), s = document.getElementById('objText');
  if (state.mission >= MISSIONS.length) { t.textContent = 'Free Roam — King of the Bay'; s.textContent = 'All missions done. Explore Solmar Bay, earn cash, dodge the law.'; return; }
  const m = MISSIONS[state.mission];
  t.textContent = m.title + '  ·  $' + m.reward;
  let extra = '';
  if (state.mission === 1 && state.missionStage === 2) extra = ' — deliver to downtown!';
  if (state.mission === 2) extra = state.wanted >= 3 ? ' — now LOSE the cops!' : ' — cause some trouble to reach 3 stars!';
  if (state.mission === 1) extra += '  ⏱ ' + Math.max(0, Math.ceil(state.missionTimer)) + 's';
  s.textContent = 'Marisol: ' + m.text + extra;
}
function completeMission() {
  const m = MISSIONS[state.mission];
  state.cash += m.reward;
  toast('Mission complete! +$' + m.reward + ' — Marisol sends her regards.');
  chime(); beacon.visible = false;
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
  if (e.code === 'KeyM') { state.muted = !state.muted; toast(state.muted ? 'Sound muted' : 'Sound on'); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyE') tryEnterExitCar();
  if (e.code === 'KeyF') punch();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => { mouseDown = true; if (state.mode === 'play') shoot(); });
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
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, mission: state.mission })); } catch (e) {}
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
    if (s) { state.cash = s.cash || 0; state.mission = Math.min(s.mission || 0, MISSIONS.length - 1); }
  }
  document.getElementById('start').classList.add('hidden');
  document.getElementById('hud').classList.add('on');
  state.mode = 'play';
  startMission(state.mission);
  updateHUD();
  toast('Marisol: Rico, I got work. Check your objective.');
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
  thud();
  const fx = Math.sin(playerState.heading), fz = Math.cos(playerState.heading);
  for (const p of peds) {
    if (p.down) continue;
    const dx = p.x - playerState.x, dz = p.z - playerState.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2 && dx * fx + dz * fz > 0) {
      p.down = true; p.downTimer = 4; p.mesh.rotation.x = -Math.PI / 2; p.mesh.position.y = 0.3;
      addWanted(1, 'You knocked someone out!');
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
  state.health -= n;
  if (state.health <= 0) {
    state.health = 0; state.mode = 'dead';
    document.getElementById('wastedText').textContent = cause + ' — Rico went down in Solmar Bay.';
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
  const starsEl = document.getElementById('stars');
  let s = '';
  for (let i = 0; i < 5; i++) s += i < state.wanted ? '★' : '<span class="off">★</span>';
  starsEl.innerHTML = s;
  document.getElementById('speedo').firstChild.textContent = Math.round(Math.abs(state.speed) * 2.2);
  document.getElementById('crosshair').style.display = (!state.inCar && state.mode === 'play') ? 'block' : 'none';
}
function drawMinimap() {
  const W = 180, scale = W / (CITY + 60);
  mm.clearRect(0, 0, W, W);
  mm.fillStyle = '#0e2f45'; mm.fillRect(0, 0, W, W);
  mm.fillStyle = '#e8d5a0'; mm.fillRect(W - 26, 0, 26, W); // beach/ocean edge
  mm.fillStyle = '#1e7fa8'; mm.fillRect(W - 14, 0, 14, W);
  mm.strokeStyle = '#3a4a55'; mm.lineWidth = 5;
  for (let i = 0; i <= GRID; i++) {
    const c = (-HALF + i * BLOCK + HALF + 30) * scale;
    mm.beginPath(); mm.moveTo(c, 0); mm.lineTo(c, W); mm.stroke();
    mm.beginPath(); mm.moveTo(0, c); mm.lineTo(W, c); mm.stroke();
  }
  const dot = (x, z, color, r) => {
    mm.fillStyle = color;
    mm.beginPath(); mm.arc((x + HALF + 30) * scale, (z + HALF + 30) * scale, r, 0, Math.PI * 2); mm.fill();
  };
  if (beacon.visible) dot(beaconPos.x, beaconPos.z, '#ffd23f', 6);
  for (const po of police) dot(po.mesh.position.x, po.mesh.position.z, '#ff4444', 3.5);
  for (const c of parkedCars) dot(c.mesh.position.x, c.mesh.position.z, '#9fb6c9', 2);
  const px = state.inCar ? state.inCar.mesh.position.x : playerState.x;
  const pz = state.inCar ? state.inCar.mesh.position.z : playerState.z;
  dot(px, pz, '#7dff9a', 4);
  mm.strokeStyle = '#7dff9a'; mm.lineWidth = 1;
  mm.beginPath(); mm.arc((px + HALF + 30) * scale, (pz + HALF + 30) * scale, 7, 0, Math.PI * 2); mm.stroke();
}

// ---------- per-frame updates ----------
function updatePlayer(dt) {
  const run = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = run ? 9 : 5;
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
  nx = clamp(nx, -HALF - 8, HALF + 24); nz = clamp(nz, -HALF - 8, HALF + 8);
  playerState.x = nx; playerState.z = nz;
  if (mx !== 0 || mz !== 0) {
    playerState.heading = Math.atan2(wx, wz);
    playerState.walkPhase += dt * (run ? 13 : 9);
  }
  if (keys['Space'] && playerState.onGround) { playerState.vy = 7.5; playerState.onGround = false; }
  playerState.vy -= 22 * dt;
  playerState.y += playerState.vy * dt;
  if (playerState.y <= 0) { playerState.y = 0; playerState.vy = 0; playerState.onGround = true; }
  player.position.set(playerState.x, playerState.y, playerState.z);
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
      state.missionStage = 2; setBeacon(SPOTS.downtown.x, SPOTS.downtown.z);
      toast('Package picked up! Deliver it downtown — fast!');
      chime(); updateObjective();
    }
  }
  if (state.mission === 1 && state.missionStage === 2) {
    if (Math.hypot(px - SPOTS.downtown.x, pz - SPOTS.downtown.z) < 6) completeMission();
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
  const accel = keys['KeyW'] || keys['ArrowUp'] ? 1 : keys['KeyS'] || keys['ArrowDown'] ? -0.6 : 0;
  const steerIn = (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0) - (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
  const top = c.spec.topSpeed;
  c.speed += accel * 16 * dt;
  c.speed -= c.speed * 0.55 * dt;
  if (!accel) c.speed -= Math.sign(c.speed) * 4 * dt;
  if (Math.abs(c.speed) < 0.15 && !accel) c.speed = 0;
  c.speed = clamp(c.speed, -top * 0.4, top);
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
  c.mesh.position.x = clamp(c.mesh.position.x, -HALF - 6, HALF + 24);
  c.mesh.position.z = clamp(c.mesh.position.z, -HALF - 6, HALF + 6);
  state.speed = c.speed;
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
    for (const w of t.mesh.userData.wheels) w.rotation.x += t.speed * dt * 2;
  }
}
function updatePeds(dt) {
  for (const p of peds) {
    if (p.down) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) { p.down = false; p.mesh.rotation.x = 0; p.mesh.position.y = 0; }
      continue;
    }
    if (!p.target || Math.hypot(p.target.x - p.x, p.target.z - p.z) < 1) {
      let tx = p.x + rr(-30, 30), tz = p.z + rr(-30, 30), g = 0;
      while ((isRoad(tx, tz) || collideCircle(tx, tz, 1.5)) && g++ < 30) { tx = p.x + rr(-30, 30); tz = p.z + rr(-30, 30); }
      p.target = { x: clamp(tx, -HALF, HALF), z: clamp(tz, -HALF, HALF) };
    }
    const dx = p.target.x - p.x, dz = p.target.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    p.heading = Math.atan2(dx, dz);
    p.x += (dx / d) * p.speed * dt; p.z += (dz / d) * p.speed * dt;
    p.mesh.position.set(p.x, 0, p.z);
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
      damagePlayer(8 * dt * 3, 'The Solmar Bay Police took Rico down');
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
        if (state.wanted === 0) { for (const po of police) scene.remove(po.mesh); police.length = 0; }
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
    tx = c.position.x - Math.sin(h) * 11; ty = 5.2; tz = c.position.z - Math.cos(h) * 11;
    lx = c.position.x + Math.sin(h) * 8; ly = 2; lz = c.position.z + Math.cos(h) * 8;
    camYaw = h + Math.PI;
  } else {
    tx = playerState.x - Math.sin(camYaw) * camDist;
    ty = playerState.y + 3.4 + camPitch * 6;
    tz = playerState.z - Math.cos(camYaw) * camDist;
    lx = playerState.x; ly = playerState.y + 1.6; lz = playerState.z;
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
}

// ---------- deterministic shot scenes ----------
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
  } else if (state.shot === 'mission') {
    startMission(1); state.missionStage = 2; state.missionTimer = 64;
    setBeacon(SPOTS.downtown.x, SPOTS.downtown.z);
    const c = parkedCars[3];
    state.inCar = c; c.stolen = true; c.speed = 10; state.speed = 10;
    c.mesh.position.set(-48, 0, -12); c.mesh.rotation.y = Math.PI / 2;
    player.visible = false;
    updateHUD(); updateObjective();
    camera.position.set(-58, 9, -12); camera.lookAt(-12, 2, -12);
  }
  window.__shotReady = false;
  setTimeout(() => { renderer.render(scene, camera); window.__shotReady = true; }, 600);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
let hudTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.time += dt;
  if (state.mode === 'play' && !state.shot) {
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
window.__solmar = { state, buildingCount, playerState, parkedCars, camera };
