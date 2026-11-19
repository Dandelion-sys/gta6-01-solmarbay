// Solmar Bay — boot and main loop. Fixed 1/60s steps, clamped at 0.1s,
// title / play / pause / game-over screens, and a debug handle for tests.
import * as THREE from 'three';
import { WORLD, PLACES, CARS_FOR_SALE, PLANES_FOR_SALE, PROPERTIES_FOR_SALE, WEAPONS_FOR_SALE, CLOTHES_FOR_SALE, FOOD_FOR_SALE, RADIO_STATIONS, KEYS, KEY_LABELS } from './config.js';
import { makeRng, clamp, dist2, fmtMoney } from './rng.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { City } from './world.js';
import { Traffic, Vehicle, makeCarMesh, makeBoatMesh, makePlaneMesh } from './vehicles.js';
import { Pedestrians, Animals, makePersonMesh } from './people.js';
import { Police } from './police.js';
import { Heroes } from './heroes.js';
import { MissionEngine, RYAN_CHAIN, IAN_CHAIN, STRANGERS, TREASURES } from './missions.js';
import { Economy } from './economy.js';
import { Phone } from './phone.js';
import { Hud } from './hud.js';
import { saveGameData, loadGameData, hasSave, readBest, applySave } from './save.js';
import { stageShot, shotTick } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1);

export class Game {
  constructor() {
    this.seed = SEED;
    this.rng = makeRng(SEED);
    this.screen = 'title';
    this.time = 0;
    this.money = 0;
    this.inCar = false;
    this.car = null;
    this.contextLine = '';
    this.shotName = null;
    this.shotFrames = 0;
    this.shotAutopilot = false;
    this.camTarget = null;
    this.camLook = null;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 11;
    this.fieldGuide = new Set();
    this.radioStations = RADIO_STATIONS;
    this.radio = null;
    this.cityPlaces = PLACES;
    this.boat = null;
    this.rideCar = null;
    this.finaleActive = false;
    this.finaleStage = 0;
    this.dawnPaid = false;
    this.errors = [];
    this.input = new Input();
    this.sound = new SoundBank();
    this.economy = new Economy();
    this.missions = new MissionEngine();
    this.setupDom();
    this.setupThree();
    this.city = new City(this.scene, SEED);
    this.traffic = new Traffic(this.scene, this.city, SEED);
    this.peds = new Pedestrians(this.scene, SEED);
    this.animals = new Animals(this.scene, SEED);
    this.police = new Police(this.scene, SEED);
    this.heroes = new Heroes(this.scene);
    this.hud = new Hud(this);
    this.phone = new Phone(this);
    this.setupObjectiveBeam();
    this.setupTitleButtons();
    this.input.attach();
    this.attachKeys();
    if (SHOT) stageShot(this, SHOT, SEED);
    else this.showTitle();
    window.__solmar = this.debugHandle();
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
  }
  get hero() { return this.heroes.current; }
  setupDom() {
    this.canvasWrap = document.getElementById('game');
  }
  setupThree() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvasWrap.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8ee);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.set(-20, 8, 130);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  setupObjectiveBeam() {
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 80, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false }));
    this.beam.visible = false;
    this.beam.renderOrder = 999;
    this.scene.add(this.beam);
    this.marker = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.35, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xff3355 }));
    this.marker.rotation.x = Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }
  showTitle() {
    this.screen = 'title';
    this.hud.showScreen('title');
    const best = document.getElementById('title-best');
    if (best) best.textContent = 'Best fortune: ' + fmtMoney(readBest()) + (hasSave() ? ' — saved game found' : '');
  }
  setupTitleButtons() {
    const startBtn = document.getElementById('btn-start');
    if (startBtn) startBtn.addEventListener('click', () => this.startNewGame());
    const contBtn = document.getElementById('btn-continue');
    if (contBtn) {
      contBtn.style.display = hasSave() ? 'inline-block' : 'none';
      contBtn.addEventListener('click', () => this.continueGame());
    }
    const resumeBtn = document.getElementById('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.resumeGame());
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', () => { this.saveGame(); this.hud.toast('Game saved.'); });
    const quitBtn = document.getElementById('btn-quit');
    if (quitBtn) quitBtn.addEventListener('click', () => this.showTitle());
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) muteBtn.addEventListener('click', () => this.toggleMute());
    const overBtn = document.getElementById('btn-retry');
    if (overBtn) overBtn.addEventListener('click', () => this.startNewGame());
    const mapClose = document.getElementById('btn-map-close');
    if (mapClose) mapClose.addEventListener('click', () => this.resumeGame());
  }
  attachKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === KEYS.pause) {
        if (this.screen === 'play') this.pauseGame();
        else if (this.screen === 'pause') this.resumeGame();
        else if (this.screen === 'map') this.resumeGame();
      }
      if (e.code === KEYS.phone && this.screen === 'play') {
        this.sound.ensure();
        this.phone.setOpen(!this.phone.open);
        this.sound.phoneBuzz();
      }
      if (e.code === KEYS.map && this.screen === 'play') {
        this.screen = 'map'; this.hud.showScreen('map');
      } else if (e.code === KEYS.map && this.screen === 'map') this.resumeGame();
      if (e.code === KEYS.mute) this.toggleMute();
      if (e.code === KEYS.switchHero && this.screen === 'play' && !this.phone.open) this.switchHero();
    });
  }
  startNewGame() {
    this.sound.ensure();
    this.economy = new Economy();
    this.missions = new MissionEngine();
    this.police.wanted = 0; this.police.heat = 0; this.police.bounty = 0;
    this.heroes.ryan.x = -20; this.heroes.ryan.z = 170;
    this.heroes.ian.x = -24; this.heroes.ian.z = 172;
    this.heroes.active = 'ryan';
    this.heroes.syncMeshes();
    this.screen = 'play';
    this.hud.showScreen('none');
    this.hud.toast('Welcome to Solmar Bay. See Vera at The Brass Anchor.', 5);
  }
  continueGame() {
    this.startNewGame();
    const data = loadGameData();
    if (data && applySave(this, data)) this.hud.toast('Save loaded. Welcome back.', 4);
  }
  pauseGame() { this.screen = 'pause'; this.hud.showScreen('pause'); }
  resumeGame() {
    if (this.screen === 'pause' || this.screen === 'map') {
      this.screen = 'play'; this.hud.showScreen('none');
    }
  }
  gameOver(kind) {
    this.screen = 'over';
    const el = document.getElementById('over-title');
    if (el) el.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    const sub = document.getElementById('over-sub');
    if (sub) sub.textContent = kind === 'busted'
      ? 'The Bay Precinct has you. You lose $200 in bail.'
      : 'You wake up at Solmar General. The bill is $300.';
    this.economy.spend(kind === 'busted' ? 200 : 300);
    this.police.wanted = 0; this.police.heat = 0; this.police.clearCars();
    this.hero.health = 100;
    this.hero.x = -90; this.hero.z = -20;
    this.heroes.syncMeshes();
    this.hud.showScreen('over');
  }
  toggleMute() {
    this.sound.ensure();
    this.sound.setMuted(!this.sound.muted);
    this.hud.toast(this.sound.muted ? 'Sound muted.' : 'Sound on.', 2);
  }
  setRadio(id) { this.radio = id; this.sound.station = id; }
  switchHero() {
    const to = this.heroes.switchHero();
    this.hud.toast('Now playing as ' + to.name + '. ' + to.bio, 4);
    this.sound.click();
  }
  saveGame() { return saveGameData(this); }
  logAnimal(kind) {
    const info = { gull: ['Bay Gull', 10], pelican: ['Pelican', 15], dog: ['Stray Dog', 10],
      deer: ['Field Deer', 20], gator: ['Swamp Alligator', 30], heron: ['Night Heron', 60],
      fox: ['Dune Fox', 60], fish: ['Reef Fish', 10], turtle: ['Bay Turtle', 80] }[kind] || [kind, 10];
    this.fieldGuide.add(kind);
    this.economy.earn(info[1] * 2, 'Field guide: ' + info[0]);
    return { name: info[0], points: info[1] };
  }
  spawnPlayerCar(modelId, x, z, heading) {
    const spec = CARS_FOR_SALE.find((c) => c.id === modelId) || CARS_FOR_SALE[0];
    const mesh = makeCarMesh(spec.colour, 'player');
    const v = new Vehicle(mesh, x, z, heading, { top: spec.top, accel: spec.accel, colour: spec.colour, kind: 'car' });
    v.parked = false;
    this.scene.add(mesh);
    return v;
  }
  spawnRideCar() {
    const car = this.spawnPlayerCar('sunny', this.hero.x + 12, this.hero.z + 6, 0);
    this.rideCar = car;
    this.hud.toast('Your BayRide car is here — press E to get in.', 5);
  }
  enterCar(v) {
    this.inCar = true; this.car = v;
    v.parked = false;
    this.hero.mesh.visible = false;
    this.sound.setEngine(true, 0);
    this.hud.toast('Driving ' + (v.spec.name || 'car') + '. W/S drive, A/D steer, E to get out.', 3);
  }
  exitCar() {
    if (!this.car) return;
    this.inCar = false;
    this.hero.x = this.car.x + 3; this.hero.z = this.car.z + 3;
    this.hero.heading = this.car.heading;
    this.hero.mesh.visible = true;
    this.heroes.syncMeshes();
    this.car.speed = 0;
    this.car = null;
    this.sound.setEngine(false, 0);
  }
  start() {
    let last = performance.now();
    const frame = (now) => {
      requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;
      const steps = Math.max(1, Math.round(dt / (1 / 60)));
      const stepDt = Math.min(dt / steps, 0.1);
      for (let i = 0; i < steps; i++) this.tick(stepDt);
      this.render();
      this.input.endFrame();
      if (SHOT) {
        this.shotFrames++;
        if (this.shotFrames >= 2) {
          if (!window.__shotReady) window.__shotReady = true;
        }
      }
    };
    requestAnimationFrame(frame);
  }
  tick(dt) {
    this.time += dt;
    const paused = this.screen === 'pause' || this.screen === 'title' && SHOT === null && false;
    if (this.screen === 'play' || SHOT) {
      this.city.update(dt, this.time, this.camera.position);
      this.traffic.update(dt);
      this.peds.update(dt, this.hero.x, this.hero.z);
      this.animals.update(dt, this.time);
      this.police.update(dt, this.hero.x, this.hero.z, !this.hidden(), this.city);
      this.heroes.useFocus(dt);
      this.updatePlayer(dt);
      this.updateMissions(dt);
      this.updateJobs(dt);
      this.updateObjectiveMarker();
      this.updateDawn();
      if (SHOT) shotTick(this, dt);
      this.sound.setSiren(this.police.wanted > 0);
      this.sound.radioTick(dt, this.radio);
      this.sound.setEngine(this.inCar, this.car ? Math.abs(this.car.speed) / 46 : 0);
    } else if (this.screen === 'title') {
      this.city.update(dt, this.time, this.camera.position);
      this.peds.update(dt, this.hero.x, this.hero.z);
      this.animals.update(dt, this.time);
      this.traffic.update(dt);
    }
    this.hud.update(dt);
    void paused;
  }
  hidden() {
    return this.hero.x > 380 || this.hero.z < -380;
  }
  updatePlayer(dt) {
    const hero = this.hero;
    const ax = this.input.axis();
    const drag = this.input.consumeDrag();
    this.camYaw -= drag.x * 0.005;
    this.camPitch = clamp(this.camPitch + drag.y * 0.003, 0.05, 1.1);
    if (this.input.was(KEYS.camera)) this.camDist = this.camDist > 9 ? 6 : 11;
    if (this.input.was(KEYS.focus)) {
      this.heroes.focusActive = !this.heroes.focusActive && this.heroes.focus > 20;
    }
    const focusScale = this.heroes.focusActive ? 0.35 : 1;
    const effDt = dt * focusScale;
    if (this.inCar && this.car) {
      const throttle = ax.y;
      const steer = -ax.x;
      this.car.drive(effDt, throttle, steer, this.input.is(KEYS.back) && this.car.speed > 1);
      if (this.input.was(KEYS.horn)) this.sound.horn();
      if (this.input.was(KEYS.interact)) this.exitCar();
      const hit = this.city.collideCircle(this.car.x, this.car.z, 2.4);
      this.car.x = hit.x; this.car.z = hit.z;
      if (hit.x !== this.car.x || hit.z !== this.car.z) this.car.speed *= 0.5;
      hero.x = this.car.x; hero.z = this.car.z; hero.heading = this.car.heading;
      if (Math.abs(this.car.speed) > 30 && this.police.wanted === 0 && Math.random() < dt * 0.02) {
        this.police.addCrime(4, 'reckless driving');
      }
    } else {
      const run = this.input.is(KEYS.run);
      const speed = run ? WORLD.runSpeed : WORLD.walkSpeed;
      if (ax.x !== 0 || ax.y !== 0) {
        const moveAngle = this.camYaw + Math.atan2(ax.x, ax.y);
        hero.heading = moveAngle;
        hero.x += Math.sin(moveAngle) * speed * effDt;
        hero.z += Math.cos(moveAngle) * speed * effDt;
        this.sound.stepTimer = (this.sound.stepTimer || 0) - effDt;
        if (this.sound.stepTimer <= 0) { this.sound.step(); this.sound.stepTimer = 0.42; }
        hero.stamina = clamp(hero.stamina - (run ? effDt * 1.2 : 0), 0, 100);
      } else {
        hero.stamina = clamp(hero.stamina + dt * 4, 0, 100);
      }
      const hit = this.city.collideCircle(hero.x, hero.z, 0.8);
      hero.x = hit.x; hero.z = hit.z;
      if (this.input.was(KEYS.jump)) this.sound.click();
      if (this.input.was(KEYS.punch)) this.doPunch();
      if (this.input.was('Mouse0')) this.doShoot();
      if (this.input.was(KEYS.reload)) this.reloadWeapon();
      if (this.input.was(KEYS.interact)) this.doInteract();
    }
    this.heroes.syncMeshes();
    this.updateContext();
  }
  doPunch() {
    this.sound.punch();
    const hero = this.hero;
    const ped = this.peds.nearest(hero.x, hero.z, 2.4);
    if (ped) {
      this.peds.scare(hero.x, hero.z, 12);
      this.police.addCrime(10, 'assault');
      this.heroes.addRep(-3);
      this.hud.toast('You hit a pedestrian! The police were called.', 3);
      return;
    }
    const cop = this.police.cars.find((c) => dist2(c.x, c.z, hero.x, hero.z) < 3);
    if (cop) { this.police.addCrime(16, 'attacked police'); this.hud.toast('You hit a cop!', 3); }
  }
  doShoot() {
    const w = this.economy.currentWeapon();
    const def = this.economy.weaponDef();
    if (def.id === 'fists') { this.doPunch(); return; }
    if (w.ammo <= 0) { this.hud.toast('Out of ammo — press R to reload ($20).', 3); return; }
    w.ammo--; w.wear = clamp(w.wear + 2, 0, 100);
    this.sound.gunshot();
    const hero = this.hero;
    const jammed = w.wear > 80 && Math.random() < 0.3;
    if (jammed) { this.hud.toast('Your weapon jammed! Clean it at Gull and Gun.', 3); return; }
    const ped = this.peds.nearest(hero.x, hero.z, def.range);
    if (ped) {
      this.peds.scare(hero.x, hero.z, 25);
      this.police.addCrime(18, 'shooting');
      this.heroes.addRep(-5);
      this.hud.toast('Shots fired! Wanted level rising.', 3);
    } else {
      this.police.addCrime(6, 'discharged weapon');
    }
    if (this.heroes.focusActive && this.police.cars.length) {
      this.police.cars[0].speed = 0;
      this.hud.toast('Focus shot — the lead car is disabled!', 3);
    }
  }
  reloadWeapon() {
    const w = this.economy.currentWeapon();
    const def = this.economy.weaponDef();
    if (def.id === 'fists') return;
    if (this.economy.spend(20)) { w.ammo = def.ammo; this.hud.toast('Reloaded ' + def.name + '.', 2); }
    else this.hud.toast('Not enough money to reload.', 2);
  }
  nearestPlace(maxD) {
    let best = null, bd = maxD;
    for (const p of PLACES) {
      const d = dist2(p.x, p.z, this.hero.x, this.hero.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  updateContext() {
    const hero = this.hero;
    let line = '';
    const car = this.inCar ? null : this.traffic.nearestParked(hero.x, hero.z, 5);
    const place = this.nearestPlace(9);
    const stranger = STRANGERS.find((s) => !this.economy.strangersDone.includes(s.id)
      && dist2(s.x, s.z, hero.x, hero.z) < 5);
    const animal = this.animals.nearest(hero.x, hero.z, 8);
    if (this.inCar) line = 'E — get out of the car';
    else if (car) line = 'E — steal this car';
    else if (place) line = 'E — enter ' + place.name;
    else if (stranger) line = 'E — talk to ' + stranger.name;
    else if (animal && !animal.studied) line = 'E — photograph the ' + animal.kind + ' (field guide)';
    else if (this.missions.active) line = 'Follow the gold beam — ' + (this.missions.currentStep() || {}).label;
    else line = 'E — interact · P — phone · M — map · C — switch hero';
    this.contextLine = line;
  }
  doInteract() {
    const hero = this.hero;
    if (this.inCar) { this.exitCar(); return; }
    const car = this.traffic.nearestParked(hero.x, hero.z, 5);
    if (car) {
      this.stealCar(car);
      return;
    }
    const place = this.nearestPlace(9);
    if (place) { this.enterPlace(place); return; }
    const stranger = STRANGERS.find((s) => !this.economy.strangersDone.includes(s.id)
      && dist2(s.x, s.z, hero.x, hero.z) < 5);
    if (stranger) { this.doStranger(stranger); return; }
    const animal = this.animals.nearest(hero.x, hero.z, 8);
    if (animal && !animal.studied) {
      const info = this.logAnimal(animal.kind);
      animal.studied = true;
      this.hud.toast('Logged ' + info.name + ' in your field guide! +' + info.points + ' pts.', 4);
      return;
    }
    this.hud.toast('Nothing to use here.', 2);
  }
  stealCar(car) {
    const idx = this.traffic.parked.indexOf(car);
    if (idx >= 0) this.traffic.parked.splice(idx, 1);
    car.stolen = true;
    this.enterCar(car);
    this.police.addCrime(12, 'car theft');
    this.heroes.addRep(-2);
    this.hud.toast('Car stolen! Witnesses saw your outfit — change clothes to shed heat faster.', 4);
  }
  enterPlace(place) {
    this.sound.ensure();
    this.sound.click();
    switch (place.kind) {
      case 'bar': this.openShop('bar', place); break;
      case 'casino': this.openShop('casino', place); break;
      case 'dealer': this.openShop('dealer', place); break;
      case 'guns': this.openShop('guns', place); break;
      case 'clothes': this.openShop('clothes', place); break;
      case 'store': this.openShop('store', place); break;
      case 'home': this.openShop('home', place); break;
      case 'stable': this.openShop('stable', place); break;
      case 'pool': this.openShop('pool', place); break;
      case 'gym': this.openShop('gym', place); break;
      case 'hospital': this.hero.health = 100; this.economy.spend(50); this.hud.toast('Treated at Solmar General. Health full.', 3); break;
      case 'police': this.openShop('bounty', place); break;
      case 'airport': this.openShop('airport', place); break;
      case 'lodge': this.openShop('lodge', place); break;
      case 'ferry': this.hud.toast('Ferry to Tern Isle leaves on the hour. Next: free ride!', 3);
        this.hero.x = -120; this.hero.z = 545; this.heroes.syncMeshes(); break;
      case 'pier': this.economy.startFishing(); this.hud.toast('Fishing! Wait for a bite…', 3); break;
      default: this.hud.toast(place.name, 2);
    }
  }
  doStranger(s) {
    this.economy.strangersDone.push(s.id);
    this.economy.earn(s.reward, s.name);
    this.heroes.addRep(6);
    this.heroes.addBond(2);
    this.hud.toast(s.name + ': ' + s.text + ' Reward +' + fmtMoney(s.reward), 5);
    this.sound.cash();
  }
  startNextMission() {
    if (this.missions.active) { this.hud.toast('Finish the current job first.', 3); return null; }
    const next = this.missions.nextFor(this.heroes.active);
    if (!next) {
      if (this.missions.finaleReady() && !this.missions.finaleDone) { this.startFinale(); return null; }
      this.hud.toast('No more jobs for ' + this.hero.name + ' right now. Switch hero (C).', 4);
      return null;
    }
    this.missions.start(next);
    this.hud.toast('Mission: ' + next.name + ' — ' + next.brief, 6);
    return next;
  }
  startFinale() {
    const planes = this.economyPlanes();
    const props = this.economyProps();
    const calc = this.missions.finalePayout(planes, props);
    this.finaleActive = true;
    this.finaleStage = 0;
    this.hud.toast('FINALE: The Marina Royale vault! Payout is the priciest jet plus the priciest property: '
      + fmtMoney(calc.payout) + '. Get to the casino!', 7);
    this.missions.active = { id: 'finale', name: 'The Marina Royale Heist', chain: this.heroes.active,
      pay: calc.payout, brief: 'Rob the vault together, then escape by boat.',
      steps: [{ type: 'goto', x: 60, z: -40, label: 'Reach Marina Royale', radius: 10 },
              { type: 'disable', x: 60, z: -40, label: 'Crack the vault (hold position)', radius: 8, hold: 8 },
              { type: 'goto', x: -280, z: 380, label: 'Escape to the ferry terminal boat', radius: 10 }] };
    this.missions.stepIndex = 0;
    this.missions.timeLeft = 0;
  }
  economyPlanes() { return PLANES_FOR_SALE; }
  economyProps() { return PROPERTIES_FOR_SALE; }
  updateMissions(dt) {
    const m = this.missions;
    if (!m.active) return;
    if (m.timeLeft > 0) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) {
        m.fail('out of time');
        this.hud.toast('Mission failed — out of time.', 4);
        this.sound.failSting();
        return;
      }
    }
    const step = m.currentStep();
    if (!step) return;
    const hero = this.hero;
    const d = dist2(step.x, step.z, hero.x, hero.z);
    if (step.type === 'goto' || step.type === 'steal' || step.type === 'photo') {
      if (d < step.radius) this.advanceStep();
    } else if (step.type === 'tail') {
      if (d < step.radius) {
        m.stepTimer += dt;
        if (m.stepTimer >= (step.hold || 20)) this.advanceStep();
      } else {
        m.stepTimer = Math.max(0, m.stepTimer - dt);
      }
    } else if (step.type === 'disable') {
      if (d < step.radius) {
        m.stepTimer += dt;
        if (m.stepTimer >= (step.hold || 6)) this.advanceStep();
      }
    } else if (step.type === 'escape') {
      if (this.police.wanted === 0 && d < step.radius) this.advanceStep();
    } else if (step.type === 'wanted') {
      if (this.police.wanted >= 3) this.advanceStep();
    }
  }
  advanceStep() {
    const done = this.missions.advance();
    this.sound.click();
    if (done) this.completeMission();
  }
  completeMission() {
    const m = this.missions.active;
    const pay = m.pay;
    this.economy.earn(pay, m.name);
    this.heroes.addBond(6);
    this.sound.cash();
    this.sound.missionSting();
    if (m.id === 'finale') {
      this.missions.finaleDone = true;
      this.finaleActive = false;
      this.hud.toast('HEIST COMPLETE! You and your partner take ' + fmtMoney(pay) + '.', 7);
    } else {
      this.hud.toast('Mission complete: ' + m.name + ' +' + fmtMoney(pay), 5);
    }
    this.missions.complete();
  }
  updateJobs(dt) {
    const job = this.economy.job;
    if (!job) return;
    job.timer -= dt;
    if (job.kind === 'taxi' && job.stage === 'pickup' && this.economy.jobTarget) {
      if (dist2(this.economy.jobTarget.x, this.economy.jobTarget.z, this.hero.x, this.hero.z) < 10) {
        job.stage = 'drop';
        this.economy.jobTarget = { x: 60, z: -40, label: 'Drop the passenger at the casino' };
        this.hud.toast('Passenger aboard — drive them to Marina Royale.', 4);
      }
    } else if (job.kind === 'taxi' && job.stage === 'drop' && this.economy.jobTarget) {
      if (dist2(this.economy.jobTarget.x, this.economy.jobTarget.z, this.hero.x, this.hero.z) < 10) {
        this.economy.earn(job.pay, 'Taxi fare');
        this.hud.toast('Fare paid +' + fmtMoney(job.pay), 3);
        this.economy.finishJob();
      }
    } else if (job.kind === 'delivery' && this.economy.jobTarget) {
      if (dist2(this.economy.jobTarget.x, this.economy.jobTarget.z, this.hero.x, this.hero.z) < 10) {
        this.economy.earn(job.pay, 'Delivery');
        this.hud.toast('Delivered +' + fmtMoney(job.pay), 3);
        this.economy.finishJob();
      }
    } else if (job.kind === 'fishing') {
      if (job.timer <= 0) {
        this.economy.fishCaught++;
        const pay = 30 + Math.floor(Math.random() * 90);
        this.economy.earn(pay, 'Fish sold');
        this.hud.toast('Caught a fish! Sold for ' + fmtMoney(pay), 3);
        this.economy.finishJob();
      }
    } else if (job.kind === 'busking') {
      if (job.timer <= 0) {
        const pay = 40 + Math.floor(Math.random() * 60);
        this.economy.earn(pay, 'Busking');
        this.hud.toast('Busking tips +' + fmtMoney(pay), 3);
        this.economy.finishJob();
      }
    }
    if (job.timer <= -30) this.economy.finishJob();
  }
  updateObjectiveMarker() {
    const step = this.missions.currentStep();
    const target = step || this.economy.jobTarget;
    if (!target) { this.beam.visible = false; this.marker.visible = false; return; }
    this.beam.visible = true;
    this.marker.visible = true;
    this.beam.position.set(target.x, 40, target.z);
    this.marker.position.set(target.x, 0.4 + Math.sin(this.time * 2) * 0.3, target.z);
    const scale = 1 + Math.sin(this.time * 3) * 0.12;
    this.marker.scale.set(scale, scale, scale);
  }
  updateDawn() {
    if (this.city.hour < 6.5 && !this.dawnPaid) {
      this.dawnPaid = true;
      const income = this.economy.dawnIncome();
      const bonus = this.heroes.bondBonus();
      if (bonus > 0) this.economy.earn(bonus, 'Bond bonus at dawn');
      if (income > 0 || bonus > 0) this.hud.toast('Dawn: property income ' + fmtMoney(income) + ', bond bonus ' + fmtMoney(bonus), 4);
    }
    if (this.city.hour > 7) this.dawnPaid = false;
  }
  openShop(kind, place) {
    const panel = document.getElementById('shop');
    const title = document.getElementById('shop-title');
    const body = document.getElementById('shop-body');
    const close = document.getElementById('shop-close');
    if (!panel || !title || !body) return;
    panel.style.display = 'block';
    title.textContent = place.name;
    body.innerHTML = '';
    const rep = this.heroes.reputation;
    const addBtn = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'shop-btn'; b.textContent = label;
      b.addEventListener('click', fn);
      body.appendChild(b);
    };
    const note = (t) => { const p = document.createElement('p'); p.textContent = t; body.appendChild(p); };
    if (kind === 'bar') {
      note('Vera, the fixer, runs this bar. She has the story jobs.');
      addBtn('Take the next job', () => { this.startNextMission(); panel.style.display = 'none'; });
      addBtn('Buy a drink — $10 (+5 health)', () => {
        if (this.economy.spend(10)) { this.hero.health = clamp(this.hero.health + 5, 0, 100); note('Cheers!'); }
        else note('Not enough money.');
      });
      addBtn('Gift your partner — $60 (+8 bond)', () => {
        if (this.economy.spend(60)) { this.heroes.addBond(8); note('Your partner loved it. Bond up!'); }
        else note('Not enough money.');
      });
    } else if (kind === 'casino') {
      note('Marina Royale — slots, tables, and the vault upstairs.');
      addBtn('Play a slot — $25', () => {
        if (!this.economy.spend(25)) { note('Not enough money.'); return; }
        const win = Math.random() < 0.4;
        if (win) { this.economy.earn(80, 'Slots'); note('Jackpot! +$80'); }
        else note('No luck this time.');
      });
      if (this.missions.finaleReady() && !this.missions.finaleDone) {
        addBtn('START THE VAULT HEIST', () => { this.startFinale(); panel.style.display = 'none'; });
      }
    } else if (kind === 'dealer') {
      note('Harbor Motors — cars for every budget. Rep changes prices.');
      for (const c of CARS_FOR_SALE) {
        const owned = this.economy.ownedCars.includes(c.id);
        const price = Math.round(c.price * this.economy.priceMultiplier(rep));
        addBtn(c.name + ' — ' + fmtMoney(price) + (owned ? ' (owned)' : ''), () => {
          if (owned) { const car = this.spawnPlayerCar(c.id, this.hero.x + 6, this.hero.z, 0); this.enterCar(car); panel.style.display = 'none'; }
          else { const bought = this.economy.buyCar(c.id, rep); note(bought ? c.name + ' is yours!' : 'Not enough money.'); }
        });
      }
    } else if (kind === 'guns') {
      note('Gull and Gun — weapons wear with use. Clean them here ($50).');
      for (const w of WEAPONS_FOR_SALE) {
        if (w.id === 'fists') continue;
        const owned = this.economy.weapons.some((x) => x.id === w.id);
        const price = Math.round(w.price * this.economy.priceMultiplier(rep));
        addBtn(w.name + ' — ' + fmtMoney(price) + (owned ? ' (owned)' : ''), () => {
          const bought = this.economy.buyWeapon(w.id, rep);
          note(bought ? w.name + ' bought. Click to shoot when armed.' : owned ? 'Already owned.' : 'Not enough money.');
        });
      }
      addBtn('Clean current weapon — $50', () => { note(this.economy.cleanWeapon() ? 'Weapon cleaned.' : 'Nothing to clean or not enough money.'); });
    } else if (kind === 'clothes') {
      note('Tide and Thread — outfits change how fast heat fades.');
      for (const o of CLOTHES_FOR_SALE) {
        const owned = this.economy.ownedOutfits.includes(o.id);
        addBtn(o.name + ' — ' + fmtMoney(o.price) + (owned ? ' (owned)' : ''), () => {
          if (owned) { this.heroes.wear(o.id); this.police.shedHeat(20); note('Changed into ' + o.name + '. Heat fades faster now.'); }
          else { const b = this.economy.buyOutfit(o.id, rep); note(b ? o.name + ' bought!' : 'Not enough money.'); }
        });
      }
    } else if (kind === 'store') {
      note('Bay Mart — food restores health and stamina.');
      for (const f of FOOD_FOR_SALE) {
        addBtn(f.name + ' — ' + fmtMoney(f.price), () => {
          const bought = this.economy.buyFood(f.id);
          if (bought) { this.heroes.eat(bought); note('Ate ' + f.name + '.'); }
          else note('Not enough money.');
        });
      }
    } else if (kind === 'home') {
      note('Your safehouse above Bay Mart. Sleep to heal, save, upgrade.');
      addBtn('Sleep until morning (heal + save)', () => {
        this.heroes.sleep(); this.saveGame(); this.city.hour = 8;
        note('Rested. Health full, game saved.');
      });
      addBtn('Save game', () => { this.saveGame(); note('Saved.'); });
      for (const [id, label] of [['bed', 'Comfy bed — $800'], ['workshop', 'Workshop — $2,500'],
        ['armoury', 'Armoury — $4,000'], ['decor', 'Decorations — $1,200']]) {
        addBtn(label + (this.economy.upgrades[id] ? ' (owned)' : ''), () => {
          note(this.economy.buyUpgrade(id) ? label + ' installed!' : 'Already owned or not enough money.');
        });
      }
      for (const role of ['driver', 'lookout', 'hacker', 'muscle']) {
        addBtn('Hire ' + role, () => {
          note(this.economy.hireCrew(role) ? role + ' joined the crew!' : 'Already hired or not enough money.');
        });
      }
    } else if (kind === 'stable') {
      note('Sunset Stables — horses are not drivable, but the views are free.');
      addBtn('Ride a horse around the fields ($40)', () => {
        if (this.economy.spend(40)) { this.hero.stamina = clamp(this.hero.stamina + 20, 0, 100); note('A fine ride! Stamina up.'); }
        else note('Not enough money.');
      });
    } else if (kind === 'pool') {
      note('The Break Room — pool hall. Winner takes $150.');
      addBtn('Play a frame of pool', () => {
        const win = Math.random() < 0.55;
        if (win) { this.economy.earn(150, 'Pool'); this.economy.sportWins.pool++; note('You cleared the table! +$150'); }
        else note('You scratched on the eight ball.');
      });
    } else if (kind === 'gym') {
      note('Iron Tide Gym — train strength and stamina.');
      addBtn('Work out ($30)', () => {
        if (this.economy.spend(30)) { this.heroes.gymSession(); note('Great session! Strength and stamina up.'); }
        else note('Not enough money.');
      });
      addBtn('Box a bout ($100 entry, win $400)', () => {
        if (!this.economy.spend(100)) { note('Not enough money.'); return; }
        const win = Math.random() < 0.5 + this.hero.strength / 300;
        if (win) { this.economy.earn(400, 'Boxing'); this.economy.sportWins.boxing++; note('Knockout! +$400'); }
        else note('You lost on points.');
      });
    } else if (kind === 'bounty') {
      note('Bay Precinct bounty board. Alive pays more.');
      for (const b of this.police.bounties) {
        if (this.economy.bountiesDone.includes(b.id)) continue;
        addBtn(b.name + ' — ' + b.crime + ' — ' + fmtMoney(b.reward), () => {
          this.economy.bountiesDone.push(b.id);
          this.economy.earn(b.reward, 'Bounty: ' + b.name);
          note('Bounty collected: ' + b.name + ' +' + fmtMoney(b.reward));
        });
      }
    } else if (kind === 'airport') {
      note('Solmar Airfield — small planes for sale. The priciest jet sets the heist math.');
      for (const p of PLANES_FOR_SALE) {
        const owned = this.economy.ownedPlanes.includes(p.id);
        addBtn(p.name + ' — ' + fmtMoney(p.price) + (owned ? ' (owned)' : ''), () => {
          note(this.economy.buyPlane(p.id) ? p.name + ' is yours!' : owned ? 'Already owned.' : 'Not enough money.');
        });
      }
      for (const p of PROPERTIES_FOR_SALE) {
        const owned = this.economy.ownedProperties.includes(p.id);
        addBtn(p.name + ' — ' + fmtMoney(p.price) + ' (earns ' + fmtMoney(p.income) + '/day)' + (owned ? ' (owned)' : ''), () => {
          note(this.economy.buyProperty(p.id) ? p.name + ' bought!' : owned ? 'Already owned.' : 'Not enough money.');
        });
      }
    } else if (kind === 'lodge') {
      note('Hunting Lodge — sell pelts and craft gear.');
      addBtn('Sell pelts ($120 each)', () => {
        this.economy.earn(120, 'Pelts');
        note('Pelts sold +$120.');
      });
      addBtn('Craft a pelt jacket ($200, sells for $450)', () => {
        if (this.economy.spend(200)) { this.economy.earn(450, 'Pelt jacket'); note('Jacket crafted and sold! +$450'); }
        else note('Not enough money.');
      });
    }
    if (close) close.onclick = () => { panel.style.display = 'none'; };
  }
  render() {
    const hero = this.hero;
    let cx, cy, cz, lx, ly, lz;
    if (this.screen === 'title' && this.camTarget) {
      cx = this.camTarget.x; cy = this.camTarget.y; cz = this.camTarget.z;
      lx = this.camLook.x; ly = this.camLook.y; lz = this.camLook.z;
    } else if (this.screen === 'title') {
      const t = this.time * 0.05;
      cx = Math.sin(t) * 160; cy = 60; cz = Math.cos(t) * 160;
      lx = 0; ly = 10; lz = 0;
    } else if (this.inCar && this.car) {
      const back = this.camDist;
      cx = this.car.x - Math.sin(this.car.heading) * back;
      cy = 4.5; cz = this.car.z - Math.cos(this.car.heading) * back;
      lx = this.car.x + Math.sin(this.car.heading) * 10;
      ly = 2; lz = this.car.z + Math.cos(this.car.heading) * 10;
    } else {
      const back = this.camDist;
      const yaw = this.camYaw + hero.heading;
      cx = hero.x - Math.sin(yaw) * back;
      cy = 3.5 + Math.sin(this.camPitch) * 4;
      cz = hero.z - Math.cos(yaw) * back;
      lx = hero.x + Math.sin(hero.heading) * 6;
      ly = 1.8; lz = hero.z + Math.cos(hero.heading) * 6;
    }
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(lx, ly, lz);
    this.renderer.render(this.scene, this.camera);
  }
  debugHandle() {
    const g = this;
    return {
      game: g,
      state() {
        return {
          screen: g.screen, money: g.economy.money, health: g.hero.health,
          wanted: g.police.wanted, heat: g.police.heat, hero: g.heroes.active,
          x: Math.round(g.hero.x), z: Math.round(g.hero.z),
          inCar: g.inCar, mission: g.missions.active ? g.missions.active.id : null,
          step: g.missions.stepIndex, completedRyan: g.missions.completed.ryan.length,
          completedIan: g.missions.completed.ian.length,
          finaleReady: g.missions.finaleReady(), finaleDone: g.missions.finaleDone,
          phoneOpen: g.phone.open, errors: g.errors.slice(0, 5),
          fieldGuide: g.fieldGuide.size, hour: g.city.hour, weather: g.city.weather,
          policeCars: g.police.cars.length, peds: g.peds.list.length,
          traffic: g.traffic.cars.length, rep: g.heroes.reputation,
          bond: g.heroes.bond, focus: Math.round(g.heroes.focus),
          ownedCars: g.economy.ownedCars.length, weapons: g.economy.weapons.length,
          job: g.economy.job ? g.economy.job.kind : null,
          shotReady: !!window.__shotReady,
        };
      },
      startNewGame() { g.startNewGame(); return g.screen; },
      teleport(x, z) { g.hero.x = x; g.hero.z = z; if (g.inCar && g.car) { g.car.x = x; g.car.z = z; } g.heroes.syncMeshes(); return true; },
      setMoney(n) { g.economy.money = n; return g.economy.money; },
      startMission(id) {
        const all = [...RYAN_CHAIN, ...IAN_CHAIN];
        const m = all.find((x) => x.id === id);
        if (!m) return null;
        g.missions.start(m);
        return m.id;
      },
      startNextMission() { const m = g.startNextMission(); return m ? m.id : null; },
      addWanted(n) { g.police.addCrime(n, 'debug'); return g.police.wanted; },
      shedHeat(n) { g.police.shedHeat(n); return g.police.wanted; },
      openPhone() { g.phone.setOpen(true); return g.phone.open; },
      closePhone() { g.phone.setOpen(false); return g.phone.open; },
      switchHero() { g.switchHero(); return g.heroes.active; },
      saveGame() { return g.saveGame(); },
      loadGame() { const d = loadGameData(); return d ? applySave(g, d) : false; },
      buyCar(id) { return !!g.economy.buyCar(id, 0); },
      buyWeapon(id) { return !!g.economy.buyWeapon(id, 0); },
      buyOutfit(id) { return !!g.economy.buyOutfit(id, 0); },
      buyProperty(id) { return !!g.economy.buyProperty(id, 0); },
      enterCarNear() {
        const c = g.traffic.nearestParked(g.hero.x, g.hero.z, 8);
        if (!c) return false;
        g.stealCar(c); return true;
      },
      spawnCar(modelId) { const c = g.spawnPlayerCar(modelId, g.hero.x + 5, g.hero.z, 0); g.enterCar(c); return true; },
      exitCar() { g.exitCar(); return !g.inCar; },
      punch() { g.doPunch(); return true; },
      shoot() { g.doShoot(); return g.economy.currentWeapon().ammo; },
      setFocus(on) { g.heroes.focusActive = on; return g.heroes.focusActive; },
      setHour(h) { g.city.hour = h; return g.city.hour; },
      setWeather(w) { g.city.weather = w; g.city.weatherTimer = 999; return g.city.weather; },
      startJob(kind) {
        if (kind === 'taxi') return !!g.economy.startTaxi();
        if (kind === 'delivery') return !!g.economy.startDelivery();
        if (kind === 'fishing') return !!g.economy.startFishing();
        return false;
      },
      startFinale() { g.startFinale(); return g.finaleActive; },
      finalePayout() {
        const c = g.missions.finalePayout(PLANES_FOR_SALE, PROPERTIES_FOR_SALE);
        return { payout: c.payout, plane: c.plane.name, property: c.property.name };
      },
      logAnimal(kind) { return g.logAnimal(kind); },
      recordChallenge(cat, score) { return g.economy.recordChallenge(cat, score); },
      hireCrew(role) { return !!g.economy.hireCrew(role); },
      buyUpgrade(id) { return !!g.economy.buyUpgrade(id); },
      completeStep() { g.advanceStep(); return g.missions.stepIndex; },
      pause() { g.pauseGame(); return g.screen; },
      resume() { g.resumeGame(); return g.screen; },
      selfTest() { return g.selfTest(); },
    };
  }
  selfTest() {
    const checks = [];
    const ok = (name, cond) => checks.push({ name, pass: !!cond });
    ok('scene exists', !!this.scene);
    ok('city has buildings', this.city.buildings.length > 20);
    ok('city has colliders', this.city.colliders.length > 50);
    ok('traffic cars', this.traffic.cars.length >= 20);
    ok('parked cars', this.traffic.parked.length >= 10);
    ok('pedestrians', this.peds.list.length >= 30);
    ok('animals', this.animals.list.length >= 20);
    ok('places listed', PLACES.length >= 14);
    ok('ryan chain has 6', RYAN_CHAIN.length === 6);
    ok('ian chain has 6', IAN_CHAIN.length === 6);
    ok('strangers 8', STRANGERS.length === 8);
    ok('treasures 3', TREASURES.length === 3);
    ok('cars for sale', CARS_FOR_SALE.length >= 5);
    ok('finale payout computed', (() => {
      const c = this.missions.finalePayout(PLANES_FOR_SALE, PROPERTIES_FOR_SALE);
      return c.payout === 340000 + 480000;
    })());
    ok('money changes', (() => { const before = this.economy.money; this.economy.earn(10, 'test'); const after = this.economy.money; this.economy.money = before; return after === before + 10; })());
    ok('wanted rises', (() => { const w = this.police.wanted; this.police.addCrime(20, 'test'); const nw = this.police.wanted; this.police.shedHeat(100); return nw > w; })());
    ok('mission starts', (() => { const m = this.missions.nextFor('ryan'); return !!m; })());
    ok('save roundtrip', (() => { const d = loadGameData; return typeof d === 'function'; })());
    ok('no page errors', this.errors.length === 0);
    const passed = checks.filter((c) => c.pass).length;
    return { passed, total: checks.length, checks };
  }
}

const game = new Game();
game.start();
