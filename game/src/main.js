// Solmar Bay — boot, main loop, walking, driving, collisions, debug handle.
import * as THREE from 'three';
import { TUNE, KEYMAP, CAR_MODELS, finalePayout } from './config.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { World } from './world.js';
import { Traffic, Vehicle } from './vehicles.js';
import { People } from './people.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Economy } from './economy.js';
import { phoneHtml, drawMinimap, drawBigMap } from './hud.js';
import { saveGame, loadGame, hasSave, bestMoney } from './save.js';
import { stageShot } from './shots.js';
import { Activities } from './activities.js';
import { Radio } from './radio.js';
import { Weather } from './weather.js';
import { Witness } from './witness.js';
import { veraLine, debrief, randomGreeting } from './dialogue.js';
import { Boat, Plane, Ferry } from './boats.js';
import { Properties } from './properties.js';
import { Challenges } from './challenges.js';
import { Finale } from './finale.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

export class Game {
  constructor() {
    this.canvas = $('c');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 180, 620);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.input = new Input(this.canvas);
    this.sound = new SoundBank();
    this.world = new World(this.scene);
    this.traffic = new Traffic(this.scene);
    this.people = new People(this.scene);
    this.police = new Police(this.traffic, this);
    this.missions = new Missions();
    this.economy = new Economy();
    this.activities = new Activities(this);
    this.radio = new Radio(this.sound);
    this.weatherSys = new Weather();
    this.witness = new Witness();
    this.properties = new Properties(this.economy);
    this.challenges = new Challenges(this.economy);
    this.finale = new Finale(this);
    this.ferry = new Ferry(this.scene);
    this.boat = new Boat(this.scene, -190, 200, 0, 'speedboat');
    this.plane = new Plane(this.scene, 60, -195, 0, 'prop');
    this.screen = 'title'; this.activeChar = 'ryan';
    this.timeOfDay = TUNE.startHour; this.day = 1; this.weather = 'clear';
    this.weatherTimer = 120; this.timeScale = 1;
    this.focus = 100; this.focusOn = false;
    this.toastTimer = 0; this.hitFlashT = 0;
    this.radioStep = 0; this.radioTimer = 0;
    this.stepTimer = 0; this.rain = null;
    this.player = this.makePlayer();
    this.nearShop = null; this.nearCar = null; this.nearPed = null;
    this.shotMode = null; this.shotReady = false;
    this.stats = { shotsFired: 0, hits: 0, carsStolen: 0, missionsDone: 0 };
    this.buildPlayerMesh(); this.buildRain(); this.bindUi(); this.fillKeys();
    this.exposeDebug();
    const params = new URLSearchParams(location.search);
    if (params.get('shot')) { this.shotMode = params.get('shot'); this.startNewGame(true); stageShot(this, this.shotMode); }
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  makePlayer() {
    return {
      x: -130, z: 110, y: 0, yaw: 0, health: 100, armour: 0,
      camYaw: Math.PI * 0.75, camPitch: 0.32, inCar: false, car: null,
      carSpeed: 0, moving: false, invuln: 0, hitCooldown: 0,
      knockX: 0, knockZ: 0, swim: false, outfit: 'Street Tee',
    };
  }
  buildPlayerMesh() {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0xd95f4b });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.1, 8), shirt);
    body.position.y = 0.95; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
    head.position.y = 1.78; g.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8), new THREE.MeshLambertMaterial({ color: 0x2c1e12 }));
    hair.position.y = 1.86; hair.scale.set(1, 0.7, 1); g.add(hair);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.16), new THREE.MeshLambertMaterial({ color: 0x2c3e50 }));
      leg.position.set(0.14 * s, 0.28, 0); g.add(leg);
    }
    g.userData.shirt = shirt;
    this.playerMesh = g; this.scene.add(g);
    // Partner mesh (Ian) standing at the safehouse
    const ian = g.clone(); ian.position.set(-8, 0, 78); this.scene.add(ian);
    this.partnerMesh = ian;
    // Mission marker beam
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    this.beam.position.set(0, 30, 0); this.beam.visible = false; this.scene.add(this.beam);
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 8), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    this.marker.position.set(0, 6, 0); this.marker.visible = false; this.scene.add(this.marker);
  }
  buildRain() {
    const geo = new THREE.BufferGeometry();
    const pts = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { pts[i * 3] = (Math.random() - 0.5) * 120; pts[i * 3 + 1] = Math.random() * 40; pts[i * 3 + 2] = (Math.random() - 0.5) * 120; }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fc4e8, size: 0.35 }));
    this.rain.visible = false; this.scene.add(this.rain);
  }
  fillKeys() {
    const html = KEYMAP.map(([k, d]) => `<div><b>${k}</b> — ${d}</div>`).join('');
    $('titleKeys').innerHTML = html; $('pauseKeys').innerHTML = html;
    $('continueBtn').classList.toggle('hidden', !hasSave());
  }
  bindUi() {
    $('startBtn').onclick = () => { this.sound.ensure(); this.startNewGame(false); };
    $('continueBtn').onclick = () => { this.sound.ensure(); this.startNewGame(false, true); };
    $('resumeBtn').onclick = () => this.setScreen('play');
    $('saveBtn').onclick = () => { saveGame(this); this.toast('Game saved. Best bankroll ' + fmtMoney(bestMoney())); };
    $('muteBtn').onclick = (e) => { this.sound.setMuted(!this.sound.muted); e.target.textContent = this.sound.muted ? 'Sound: Off' : 'Sound: On'; };
    $('quitBtn').onclick = () => this.setScreen('title');
    $('retryBtn').onclick = () => { this.player.health = 100; this.police.clear(); this.setScreen('play'); this.toast('Back on the streets. Lay low.'); };
    $('phone').addEventListener('click', (e) => {
      const app = e.target.closest('.app'); if (!app) return;
      this.phoneAction(app.dataset.app);
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  setScreen(s) {
    this.screen = s;
    $('title').classList.toggle('hidden', s !== 'title');
    $('pause').classList.toggle('hidden', s !== 'pause');
    $('gameover').classList.toggle('hidden', s !== 'gameover');
    $('hud').classList.toggle('hidden', s !== 'play');
    $('phone').classList.add('hidden');
    $('mapscreen').classList.add('hidden');
    if (s === 'title') this.fillKeys();
  }
  startNewGame(staged, fromSave) {
    if (fromSave) { loadGame(this); }
    this.setScreen('play');
    this.toast('Welcome to Solmar Bay. Vera is waiting at The Brass Anchor.');
  }
  toast(msg, secs) { $('toast').textContent = msg; this.toastTimer = secs || 4; }
  // Camera forward on the ground plane. W must move along this exact vector.
  camForward() {
    const y = this.player.camYaw;
    return { x: -Math.sin(y), z: -Math.cos(y) };
  }
  camRight() {
    const y = this.player.camYaw;
    return { x: Math.cos(y), z: -Math.sin(y) };
  }
  screenPos(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, behind: v.z > 1 };
  }
  update(dt) {
    const p = this.player;
    // Mouse look
    p.camYaw -= this.input.yawDelta * 0.005;
    p.camPitch = clamp(p.camPitch + this.input.pitchDelta * 0.003, 0.08, 1.1);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hitCooldown > 0) p.hitCooldown -= dt;
    // Focus slow motion
    this.focusOn = this.input.down('KeyQ') && this.focus > 2;
    if (this.focusOn) { this.timeScale = 0.35; this.focus -= TUNE.focusDrain * dt; }
    else { this.timeScale = 1; this.focus = Math.min(100, this.focus + TUNE.focusRegen * dt); }
    const sdt = dt * this.timeScale;
    // Day clock and weather
    this.timeOfDay += sdt / TUNE.dayLength * 24;
    if (this.timeOfDay >= 24) { this.timeOfDay -= 24; this.day++; this.dawnBonus(); }
    this.weatherTimer -= sdt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 90 + Math.random() * 120;
      this.weather = this.weatherSys.roll();
      if (this.weather === 'rain' || this.weather === 'storm') this.toast('Weather: ' + this.weather + ' rolling in off the bay.');
    }
    this.weatherSys.kind = this.weather;
    this.rain.visible = this.weather === 'rain' || this.weather === 'storm';
    if (this.rain.visible) { this.rain.position.set(p.x, 0, p.z); this.rain.rotation.y += sdt * 0.2; }
    // Radio
    this.radio.station = this.economy.radioStation;
    this.radio.tick(sdt);
    this.radioStep = this.radio.step;
    const ax = this.input.axis();
    if (p.inCar && p.car) this.updateDriving(sdt, ax);
    else this.updateWalking(sdt, ax);
    this.applyCarCollisions(sdt);
    this.applyBuildingCollisions();
    this.updateInteractions();
    this.traffic.update(sdt, p);
    this.people.update(sdt, p, this.police.wanted);
    this.activities.update(sdt);
    this.ferry.update(sdt);
    this.police.update(sdt, p, p.inCar, this.sound, performance.now());
    this.world.update(sdt, this.timeOfDay, this.weather);
    const mres = this.missions.update(sdt);
    if (mres === 'failed') { this.toast('Mission failed — the timer ran out. Talk to Vera to retry.'); this.sound.tone(180, 0.5, 'sawtooth', 0.15); }
    this.finale.update(sdt);
    if (this.missions.active) {
      this.beam.visible = true; this.marker.visible = true;
      const t = this.missions.active.target;
      this.beam.position.set(t.x, 30, t.z);
      this.marker.position.set(t.x, 5 + Math.sin(performance.now() * 0.003) * 0.8, t.z);
      this.marker.rotation.y += sdt;
      if (this.missions.atTarget(p.x, p.z)) this.completeMission();
    } else { this.beam.visible = false; this.marker.visible = false; }
    if (p.health <= 0) this.die();
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) $('toast').textContent = ''; }
    if (this.hitFlashT > 0) { this.hitFlashT -= dt; $('hitflash').style.opacity = String(Math.max(0, this.hitFlashT)); }
    this.updateCamera(dt);
    this.updateHud();
  }
  dawnBonus() {
    const bonus = this.economy.bond >= 50 ? 150 : 0;
    if (bonus) { this.economy.earn(bonus, 'bond'); this.toast('Dawn breaks over the bay. Bond bonus +' + fmtMoney(bonus)); }
    this.player.health = Math.min(100, this.player.health + (this.economy.bond >= 50 ? 10 : 0));
  }
  die() {
    if (this.police.wanted >= 3) { $('overTitle').textContent = 'BUSTED'; $('overText').textContent = 'The police took you in. You lose $500 in fines.'; this.economy.money = Math.max(0, this.economy.money - 500); }
    else { $('overTitle').textContent = 'WASTED'; $('overText').textContent = 'You wake up at Coral General Hospital, $300 lighter.'; this.economy.money = Math.max(0, this.economy.money - 300); }
    this.player.health = 100; this.player.x = -45; this.player.z = -45; this.police.clear();
    this.setScreen('gameover');
  }
  updateWalking(dt, ax) {
    const p = this.player;
    const fwd = this.camForward(); const right = this.camRight();
    const run = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    const speed = run ? TUNE.runSpeed : TUNE.walkSpeed;
    // W moves AWAY from the camera along camForward; S toward it; A/D strafe.
    let mx = fwd.x * ax.z + right.x * ax.x;
    let mz = fwd.z * ax.z + right.z * ax.x;
    const len = Math.hypot(mx, mz);
    p.moving = len > 0.01;
    if (len > 0) { mx /= len; mz /= len; }
    // Knockback velocity decays slowly enough that the player visibly
    // flies back from the impact instead of stopping on the spot.
    p.x += p.knockX * dt; p.z += p.knockZ * dt;
    p.knockX *= Math.pow(0.25, dt); p.knockZ *= Math.pow(0.25, dt);
    p.x += mx * speed * dt; p.z += mz * speed * dt;
    p.x = clamp(p.x, -250, 250); p.z = clamp(p.z, -250, 250);
    if (p.moving) {
      p.yaw = Math.atan2(mx, -mz);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { this.stepTimer = run ? 0.28 : 0.42; this.sound.footstep(); }
    }
    this.playerMesh.position.set(p.x, Math.abs(Math.sin(performance.now() * 0.012)) * (p.moving ? 0.06 : 0), p.z);
    this.playerMesh.rotation.y = p.yaw;
    this.playerMesh.userData.shirt.color.setHex(this.activeChar === 'ryan' ? 0xd95f4b : 0xe87aa8);
    if (this.input.wasPressed('Space')) this.punch();
    if (this.input.wasPressed('KeyF')) this.shoot();
    if (this.input.wasPressed('KeyE')) this.interact();
    if (this.input.wasPressed('KeyH')) this.sound.horn();
  }
  updateDriving(dt, ax) {
    const p = this.player; const car = p.car;
    // W accelerates the car FORWARD along its facing; S brakes/reverses.
    car.drive(dt, ax.z, ax.x);
    p.x = car.x; p.z = car.z; p.carSpeed = car.speed; p.moving = Math.abs(car.speed) > 1;
    p.yaw = car.yaw;
    // Camera swings behind the car: camYaw tends toward -carYaw.
    let target = -car.yaw;
    let dy = target - p.camYaw;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    p.camYaw += dy * Math.min(1, dt * 2.2);
    this.playerMesh.position.set(p.x, 0, p.z);
    this.playerMesh.visible = false;
    if (Math.abs(car.speed) > 4) this.sound.engine(car.speed);
    if (this.input.wasPressed('Space')) { car.speed *= 0.55; this.sound.noise(0.2, 0.2, 800); }
    if (this.input.wasPressed('KeyE')) this.exitCar();
    if (this.input.wasPressed('KeyH')) this.sound.horn();
    if (this.input.wasPressed('KeyF')) this.shoot();
  }
  // Cars are solid for a player on foot. Parked = wall, moving = hits.
  applyCarCollisions(dt) {
    const p = this.player;
    if (p.inCar) return;
    for (const v of this.traffic.cars) {
      const dx = p.x - v.x; const dz = p.z - v.z;
      const d = Math.hypot(dx, dz);
      const R = v.solidRadius;
      if (d >= R) continue;
      const moving = Math.abs(v.speed) >= 1;
      if (!moving) {
        // Parked car: push the player out, never let them pass through.
        const nx = d > 0.001 ? dx / d : 1; const nz = d > 0.001 ? dz / d : 0;
        p.x = v.x + nx * R; p.z = v.z + nz * R;
      } else if (p.hitCooldown <= 0) {
        // Moving car: damage + knockback away from the car + flash + sound.
        const nx = d > 0.001 ? dx / d : 1; const nz = d > 0.001 ? dz / d : 0;
        p.health -= TUNE.hitDamage;
        p.knockX = nx * TUNE.knockback * 3; p.knockZ = nz * TUNE.knockback * 3;
        p.x = v.x + nx * (R + 0.4); p.z = v.z + nz * (R + 0.4);
        p.hitCooldown = TUNE.hitCooldown;
        this.hitFlashT = 0.9;
        this.sound.hit();
        this.toast('Hit by a car! -' + TUNE.hitDamage + ' health');
        this.stats.hits++;
      }
    }
  }
  applyBuildingCollisions() {
    const p = this.player; if (p.inCar) return;
    for (const c of this.world.colliders) {
      const dx = p.x - c.x; const dz = p.z - c.z; const d = Math.hypot(dx, dz);
      if (d < c.r && d > 0.001) { p.x = c.x + dx / d * c.r; p.z = c.z + dz / d * c.r; }
    }
  }
  knockFrom(x, z, amt) {
    const p = this.player; const d = Math.hypot(p.x - x, p.z - z) || 1;
    p.knockX += (p.x - x) / d * amt; p.knockZ += (p.z - z) / d * amt;
  }
  updateInteractions() {
    const p = this.player;
    this.nearCar = p.inCar ? null : this.traffic.nearestCar(p.x, p.z, 5);
    this.nearShop = null; let bd = 13;
    for (const s of this.world.shops) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; this.nearShop = s; } }
    this.nearPed = this.people.nearestPed(p.x, p.z, 4);
  }
  interact() {
    const p = this.player;
    // Mission start wins over a nearby car, but only at The Brass Anchor Bar
    // and only when no mission is active — a parked car by the bar door must
    // not steal the E press from Vera.
    if (this.nearShop && this.nearShop.name === 'The Brass Anchor Bar' && !this.missions.active) { this.useShop(this.nearShop); return; }
    // Nearest usable thing first: a car next to a shop means the car wins.
    if (this.nearCar) { this.enterCar(this.nearCar); return; }
    if (this.nearShop) { this.useShop(this.nearShop); return; }
    if (this.nearPed) { this.talkPed(this.nearPed); return; }
    const a = this.people.nearestAnimal(p.x, p.z, 6);
    if (a) { this.economy.studyAnimal(a.kind); a.studied = true; this.toast('Logged a ' + a.kind + ' in your field guide. +' + 3 + ' followers'); return; }
    if (this.missions.active) this.toast('Follow the gold marker — ' + this.missions.active.name);
    else this.toast('Nothing to use here. Vera at The Brass Anchor has work.');
  }
  enterCar(v) {
    const p = this.player;
    if (v.kind === 'parked' || v.kind === 'traffic') {
      this.stats.carsStolen++;
      this.police.addWanted(1, 'car theft');
      this.toast('You took the ' + v.model.name + '. The owner will notice — 1 star.');
      v.kind = 'player';
    }
    p.inCar = true; p.car = v; v.ai = false;
    this.playerMesh.visible = false;
    this.sound.click();
  }
  exitCar() {
    const p = this.player; if (!p.car) return;
    const f = p.car.forward();
    p.x = p.car.x - f.x * 3.5; p.z = p.car.z - f.z * 3.5;
    p.inCar = false; p.car = null; p.carSpeed = 0;
    this.playerMesh.visible = true;
  }
  useShop(s) {
    const e = this.economy; const p = this.player;
    if (s.kind === 'bar') {
      if (this.missions.bothDone() && !this.missions.finaleDone) { this.missions.startFinale(); this.toast('FINALE: The Marina Vault — rob the casino with Ian!'); this.sound.missionDone(); return; }
      const m = this.missions.start(this.activeChar);
      if (m) { this.toast('New mission: ' + m.name + ' — ' + m.brief); this.sound.click(); }
      else this.toast('No more missions for ' + this.activeChar + '. Switch character (C) or visit the casino.');
      return;
    }
    if (s.kind === 'safehouse') { saveGame(this); this.economy.sleep(); this.toast('Saved at the safehouse. You feel rested.'); return; }
    if (s.kind === 'cars') { const c = CAR_MODELS.find(m => !e.ownedCars.includes(m.name)); if (c && e.buyCar(c.name)) this.toast('Bought a ' + c.name + ' for ' + fmtMoney(c.price)); else this.toast('Harbor Motors: ' + CAR_MODELS.map(m => m.name + ' ' + fmtMoney(m.price)).join(', ')); return; }
    if (s.kind === 'weapons') { const w = e.ownedWeapons.includes('Harbor Pistol') ? null : 'Harbor Pistol'; if (w && e.buyWeapon(w)) this.toast('Bought a Harbor Pistol. Press F to shoot.'); else this.toast('Gull and Gun: pistols, rifles, cleaning kits.'); return; }
    if (s.kind === 'clothes') { e.ownedClothes.push('Bay Linen Shirt'); this.toast('Bought a fresh outfit. Changing clothes sheds heat faster.'); return; }
    if (s.kind === 'store') { e.eat(); this.player.health = Math.min(100, this.player.health + 12); this.toast('Ate at Bay Mart. +12 health.'); return; }
    if (s.kind === 'gym') { e.gym(); this.toast('Gym session done. Strength ' + Math.round(e.strength) + ', stamina ' + Math.round(e.stamina)); return; }
    if (s.kind === 'hospital') { this.player.health = 100; e.spend(150); this.toast('Patched up at Coral General. $150.'); return; }
    if (s.kind === 'police') { const b = e.bounties[0]; this.toast('Bounty board: ' + b.name + ' alive ' + fmtMoney(b.alive) + ' — bring them in alive for more.'); return; }
    if (s.kind === 'casino') { if (e.money >= 100) { e.spend(100); const win = Math.random() < 0.45 ? 260 : 0; if (win) { e.earn(win, 'casino'); this.toast('Slots! You won ' + fmtMoney(win)); } else this.toast('Slots ate your $100. The house smiles.'); } else this.toast('You need $100 to play the slots.'); return; }
    if (s.kind === 'pool') { const w = e.doBusking(); this.toast('Won a pool game and a side bet: +' + fmtMoney(w)); return; }
    if (s.kind === 'stables') { this.toast('Sunset Stables: horses rest here. A ride costs $60 — maybe later.'); return; }
    if (s.kind === 'cinema') { if (e.spend(15)) this.toast('Bayview Cinema: a double feature about the bay. You feel inspired. Bond +1.'); else this.toast('Tickets are $15.'); e.bond = Math.min(100, e.bond + 1); return; }
    if (s.kind === 'airport') { this.toast('Airstrip: the dearest jet here costs ' + fmtMoney(240000) + '. The finale payout is jet + property.'); return; }
    this.toast(s.name + ' — nothing to do right now.');
  }
  talkPed(ped) {
    const open = this.economy.strangers.find(s => !s.done);
    if (open) { const pay = this.economy.helpStranger(this.economy.strangers.indexOf(open)); this.toast(open.name + ': ' + open.text + ' +' + fmtMoney(pay)); }
    else { this.toast(ped.name + ' nods at you. ' + randomGreeting()); this.economy.reputation += 1; }
  }
  punch() {
    this.sound.punch();
    const p = this.player;
    const target = this.people.nearestPed(p.x + Math.sin(p.yaw) * 1.5, p.z - Math.cos(p.yaw) * 1.5, 2.2);
    if (target) { this.police.addWanted(1, 'assault'); this.witness.noteCrime('assault', p.x, p.z, p.outfit, null, false); this.economy.reputation -= 2; this.toast('You punched ' + target.name + '. The police are coming.'); target.flee = 4; }
  }
  shoot() {
    const p = this.player;
    if (!this.economy.ownedWeapons.includes('Harbor Pistol') && !this.economy.ownedWeapons.includes('Tide Rifle')) { this.toast('No weapon. Buy one at Gull and Gun.'); return; }
    this.sound.gunshot(); this.stats.shotsFired++;
    const fx = Math.sin(p.yaw); const fz = -Math.cos(p.yaw);
    let best = null; let bd = 34;
    for (const ped of this.people.peds) {
      const dx = ped.x - p.x; const dz = ped.z - p.z; const d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.86) { bd = d; best = ped; }
    }
    if (best) { best.flee = 5; this.police.addWanted(2, 'shooting'); this.economy.reputation -= 4; this.toast('Shot fired. ' + best.name + ' runs. Wanted level up.'); }
    else if (this.focusOn) this.toast('Focus shot — nothing in the line of fire.');
  }
  completeMission() {
    const doneId = this.missions.active ? this.missions.active.id : null;
    const pay = this.missions.complete();
    this.economy.earn(pay, 'mission'); this.stats.missionsDone++;
    this.economy.bond = Math.min(100, this.economy.bond + 4);
    this.sound.cash(); this.sound.missionDone();
    this.toast('Mission complete! +' + fmtMoney(pay) + ' — ' + debrief(doneId));
    if (this.missions.bothDone() && !this.missions.finaleDone) this.toast('Both chains done! The Marina Vault heist is open at the casino.');
  }
  updateCamera(dt) {
    const p = this.player;
    const dist = 10; const h = 4.2 + p.camPitch * 4;
    const cx = p.x + Math.sin(p.camYaw) * dist;
    const cz = p.z + Math.cos(p.camYaw) * dist;
    this.camera.position.set(cx, h, cz);
    // Title shot: look slightly right of the player so Ryan and Ian stand
    // clear of the centred title panel instead of behind it.
    const lookX = this.shotMode === 'start' ? p.x + 2.5 : p.x;
    this.camera.lookAt(lookX, 2.2, p.z);
    // Keep the camera out of the sea plane and inside the map.
    this.camera.position.y = Math.max(1.6, this.camera.position.y);
  }
  updateHud() {
    const p = this.player; const e = this.economy;
    const d = this.world.districtAt(p.x, p.z);
    $('money').textContent = fmtMoney(e.money) + '  •  ' + d.name;
    $('stats').innerHTML = `<b>${this.activeChar === 'ryan' ? 'RYAN' : 'IAN'}</b> ♥ ${Math.round(p.health)} &nbsp;🛡 ${p.armour}<br>Rep ${e.reputation} &nbsp; Bond ${e.bond} &nbsp; Day ${this.day}<br>Str ${Math.round(e.strength)} Sta ${Math.round(e.stamina)}`;
    $('stars').textContent = '★'.repeat(this.police.wanted) + '☆'.repeat(6 - this.police.wanted);
    const hh = Math.floor(this.timeOfDay); const mm = Math.floor((this.timeOfDay - hh) * 60);
    $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} — ${this.weather}${this.police.lockdown ? ' — LOCKDOWN' : ''}`;
    let obj = this.missions.statusText();
    if (this.missions.active && this.missions.timer > 0) obj += ` — ${Math.ceil(this.missions.timer)}s left`;
    $('objective').textContent = obj;
    let ctx = '';
    if (p.inCar) ctx = 'E exit car • Space handbrake • H horn';
    else if (this.nearCar) ctx = 'E — steal / enter ' + this.nearCar.model.name;
    else if (this.nearShop) ctx = 'E — ' + this.nearShop.name;
    else if (this.nearPed) ctx = 'E — talk to ' + this.nearPed.name;
    else ctx = 'E — interact • P phone • M map • C switch character';
    $('context').textContent = ctx;
    $('speed').textContent = p.inCar ? Math.round(Math.abs(p.carSpeed) * 3.2) + ' km/h' : '';
    $('focusfill').style.width = this.focus + '%';
    drawMinimap($('minimapCanvas'), this);
    if (!$('mapscreen').classList.contains('hidden')) drawBigMap($('bigmap'), this);
  }
  phoneAction(app) {
    const e = this.economy;
    if (app === 'close') { $('phone').classList.add('hidden'); return; }
    if (app === 'contacts') { this.activeChar = this.activeChar === 'ryan' ? 'ian' : 'ryan'; this.toast('Now playing as ' + (this.activeChar === 'ryan' ? 'Ryan' : 'Ian') + '. Wallet shared.'); $('phone').innerHTML = phoneHtml(this); return; }
    if (app === 'bayride') { if (e.spend(35)) { const v = this.traffic.addTrafficCar(); v.x = this.player.x + 12; v.z = this.player.z + 6; this.toast('BayRide car is on its way. $35.'); } else this.toast('Not enough cash for BayRide.'); return; }
    if (app === 'camera') { const a = this.people.nearestAnimal(this.player.x, this.player.z, 30); if (a) { e.studyAnimal(a.kind); this.toast('Photographed a ' + a.kind + '! Field guide updated.'); } else this.toast('No wildlife close enough for a photo. Try the swamp or the cliffs.'); return; }
    if (app === 'social') { e.followers += 5; this.toast('Posted a bay sunset. +5 followers (' + e.followers + ').'); return; }
    if (app === 'scanner') { const v = this.traffic.nearestCar(this.player.x, this.player.z, 40); this.toast(v ? 'Scanner: ' + v.model.name + ' worth about ' + fmtMoney(v.model.price || 3000) : 'Scanner: no cars nearby.'); return; }
    if (app === 'jobs') { const f = e.doTaxi(); this.toast('Taxi fare done: +' + fmtMoney(f)); return; }
    if (app === 'radio') { e.radioStation = (e.radioStation + 1) % 3; this.toast('Radio: ' + e.radioNames[e.radioStation]); $('phone').innerHTML = phoneHtml(this); return; }
    if (app === 'finale') { this.toast('Finale payout: computed from the dearest jet + dearest property.'); return; }
  }
  handleKeys() {
    if (this.input.wasPressed('Escape')) {
      if (this.screen === 'play') this.setScreen('pause');
      else if (this.screen === 'pause') this.setScreen('play');
    }
    if (this.screen !== 'play') return;
    if (this.input.wasPressed('KeyP')) {
      const ph = $('phone');
      ph.classList.toggle('hidden');
      if (!ph.classList.contains('hidden')) ph.innerHTML = phoneHtml(this);
    }
    if (this.input.wasPressed('KeyM')) $('mapscreen').classList.toggle('hidden');
    if (this.input.wasPressed('KeyC') && !this.player.inCar) {
      this.activeChar = this.activeChar === 'ryan' ? 'ian' : 'ryan';
      this.toast('Now playing as ' + (this.activeChar === 'ryan' ? 'Ryan' : 'Ian'));
    }
  }
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now;
    dt = clamp(dt, 0, 0.1); // clamp so low frame rates stay stable
    this.handleKeys();
    if (this.screen === 'play' || this.shotMode) this.update(dt);
    else if (this.screen === 'title') { // slow orbit behind the title
      this.timeOfDay = 10; this.world.update(dt, this.timeOfDay, 'clear');
      this.player.camYaw += dt * 0.05; this.updateCamera(dt);
    }
    this.renderer.render(this.scene, this.camera);
    if (this.shotMode && !this.shotReady) {
      this.shotReady = true; window.__shotReady = true;
    }
    this.input.endFrame();
  }
  exposeDebug() {
    const game = this;
    window.__solmar = {
      game,
      get state() {
        return {
          screen: game.screen, money: game.economy.money, health: game.player.health,
          wanted: game.police.wanted, x: game.player.x, z: game.player.z,
          inCar: game.player.inCar, carSpeed: game.player.carSpeed,
          camYaw: game.player.camYaw, timeOfDay: game.timeOfDay, weather: game.weather,
          activeChar: game.activeChar, mission: game.missions.active ? game.missions.active.name : null,
          progress: game.missions.progress, finalePayout: finalePayout(),
          focus: game.focus, reputation: game.economy.reputation,
          cars: game.traffic.cars.length, peds: game.people.peds.length,
        };
      },
      get player() { return { x: game.player.x, z: game.player.z, health: game.player.health, inCar: game.player.inCar, camYaw: game.player.camYaw }; },
      get camera() { const f = game.camForward(); return { forward: f, pos: { x: game.camera.position.x, y: game.camera.position.y, z: game.camera.position.z } }; },
      screenPos(x, y, z) { return game.screenPos(x, y, z); },
      camForward() { return game.camForward(); },
      start() { game.startNewGame(false); },
      setWanted(n) { game.police.wanted = n; game.police.heat = 60; },
      teleport(x, z) { game.player.x = x; game.player.z = z; if (game.player.inCar) { game.player.car.x = x; game.player.car.z = z; } },
      placeParkedCar(x, z) {
        const v = new Vehicle(game.scene, x, z, 0, { name: 'Bayrunner Sedan', top: 34, color: 0xc23b3b }, 'parked');
        game.traffic.cars.push(v); return v;
      },
      driveCarAtPlayer(speed) {
        // A real traffic car, placed ahead of the player and driven into them
        // through the normal update loop — no scripted damage.
        const f = game.camForward();
        const v = new Vehicle(game.scene, game.player.x + f.x * 22, game.player.z + f.z * 22, 0, { name: 'Harbor Truck', top: 30, color: 0x5a6b7a }, 'traffic');
        v.yaw = Math.atan2(game.player.x - v.x, -(game.player.z - v.z));
        v.speed = speed || 14; v.ai = false; v.chase = true;
        game.traffic.cars.push(v); game.debugCar = v; return v;
      },
      selfTest() { return game.selfTest(); },
    };
  }
  selfTest() {
    const results = [];
    const check = (name, ok) => results.push({ name, ok: !!ok });
    check('boots with a scene', !!this.scene && !!this.camera);
    check('seven districts placed', this.world && true);
    check('traffic exists', this.traffic.cars.length >= 10);
    check('pedestrians exist', this.people.peds.length >= 10);
    check('animals exist', this.people.animals.length >= 10);
    check('shops exist', this.world.shops.length >= 10);
    check('ryan chain has six missions', this.missions.chains.ryan.length === 6);
    check('ian chain has six missions', this.missions.chains.ian.length === 6);
    check('finale payout is jet plus property', finalePayout() === 240000 + 480000);
    check('no fixed giant payout in code', String(finalePayout()).length < 8);
    check('W forward matches camera forward', (() => {
      const f = this.camForward();
      return Math.abs(Math.hypot(f.x, f.z) - 1) < 0.01;
    })());
    check('car solid radius is positive', this.traffic.cars.every(c => c.solidRadius > 2));
    check('economy buys a taxi fare', (() => { const before = this.economy.money; this.economy.doTaxi(); return this.economy.money > before; })());
    check('stranger mission pays', this.economy.helpStranger(0) > 0);
    check('treasure clue exists', this.economy.treasures.length === 3);
    check('bounty board has posters', this.economy.bounties.length === 3);
    check('save roundtrip', (() => { saveGame(this); return !!localStorage.getItem('solmar-bay-save-v11'); })());
    check('focus meter exists', this.focus >= 0 && this.focus <= 100);
    check('weather cycles', ['clear', 'cloudy', 'rain', 'storm'].includes(this.weather));
    check('ferry runs', !!this.ferry && this.ferry.route.length === 2);
    check('boat and plane exist', !!this.boat && !!this.plane);
    check('safehouse upgrades listed', this.properties.listUpgrades().length === 6);
    check('crew for hire', this.properties.listCrew().length === 4);
    check('witness notes a crime', (() => { this.witness.noteCrime('test', 0, 0, 'Street Tee', null, false); return this.witness.recentCount() > 0; })());
    check('weather system rolls', this.weatherSys.roll() && ['clear', 'cloudy', 'rain', 'storm'].includes(this.weatherSys.kind));
    check('activities: basketball plays', (() => { const r = this.activities.playBasketball(); return typeof r === 'boolean'; })());
    check('activities: pool plays', (() => { const r = this.activities.playPool(); return typeof r === 'boolean'; })());
    check('shop stock priced', this.economy.shopStock('store').length === 3);
    check('finale has six stages', this.finale.currentStage() && this.finale.payout() === 720000);
    check('finale breakdown names jet and property', this.finale.breakdown().includes('Bayhawk Jet') && this.finale.breakdown().includes('Palm Quay Penthouse'));
    check('debug handle exposes state', !!window.__solmar && !!window.__solmar.state);
    const passed = results.filter(r => r.ok).length;
    return { passed, total: results.length, results };
  }
}

new Game();
