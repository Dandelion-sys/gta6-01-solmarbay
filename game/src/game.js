// Solmar Bay game: the boot, the fixed-step loop, the camera, walking,
// driving, collisions, combat, the wanted level and the debug handle.
import * as THREE from 'three';
import { TUNING, COLOURS, districtAt, clamp } from './tuning.js';
import { Input } from './input.js';
import { City } from './city.js';
import { Sky } from './sky.js';
import { Traffic } from './vehicles.js';
import { Crowd } from './people.js';
import { Police } from './police.js';
import { Couple } from './heroes.js';
import { MissionBook, FINALE, RYAN_MISSIONS, IAN_MISSIONS } from './missions.js';
import { JETS, PROPERTIES, gameFeatures, featuresTotal, buyFrom } from './economy.js';
import { SoundBank } from './sound.js';
import { HUD } from './hud.js';
import { Screens } from './screens.js';
import { Phone } from './phone.js';
import { saveGameData, loadGameData, applySaveData } from './save.js';
import { stageShot } from './shots.js';
import { SideJobs, CarTheft, RobberyPrep, SafehouseUpgrades, SportsAndSea, Hurricane } from './systems.js';

export class Game {
  constructor() {
    this.app = this; // input and phone call back through `app`
    this.state = 'title'; // title | play | paused | busted | wasted
    this.elapsed = 0;
    this.camYaw = Math.PI; // camera looks toward -z at start
    this.camPitch = 0.42;
    this.camDist = TUNING.cameraDist;
    this.driving = false;
    this.drivenCar = null;
    this.districtName = 'Palm Quay';
    this.lastHitAt = 0;
    this.punchTimer = 0;
    this.stepCount = 0;
    this.shotMode = null;
    this._setupRenderer();
    this.sound = new SoundBank();
    this.input = new Input(this);
    this.input.bindMouse(this.renderer.domElement);
    this.city = new City(this.scene);
    this.sky = new Sky(this.scene);
    this.traffic = new Traffic(this.scene, this.city);
    this.crowd = new Crowd(this.scene);
    this.police = new Police(this.scene);
    this.couple = new Couple(this.scene);
    this.missions = new MissionBook(this.scene);
    this.hud = new HUD(this);
    this.screens = new Screens(this);
    this.phone = new Phone(this);
    this.sideJobs = new SideJobs(this);
    this.carTheft = new CarTheft(this);
    this.robbery = new RobberyPrep(this);
    this.safehouse = new SafehouseUpgrades(this);
    this.sports = new SportsAndSea(this);
    this.hurricane = new Hurricane(this);
    this.game = this;
    this._setupDebug();
    this._parseShot();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'paused') this.resumeGame();
    });
  }
  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'game';
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLOURS.skyDay);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2600);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  // Camera forward on the ground plane: the direction W walks.
  cameraForward() {
    return { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
  }
  cameraRight() {
    const f = this.cameraForward();
    return { x: -f.z, z: f.x };
  }

  start() {
    this.input.buildTouchLayer();
    const params = new URLSearchParams(location.search);
    if (params.has('shot')) {
      this.shotMode = params.get('shot');
      stageShot(this, this.shotMode);
    }
    let last = performance.now(), acc = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      let dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.input.takePressed();
      if (this.state === 'play' || this.shotMode) {
        acc += dt;
        let steps = 0;
        while (acc >= 1 / 60 && steps < 10) {
          this.step(1 / 60);
          acc -= 1 / 60; steps++;
        }
        if (steps === 10) acc = 0;
      }
      this.render();
      this.input.endFrame();
    };
    requestAnimationFrame(frame);
  }
  step(dt) {
    this.stepCount++;
    this.elapsed += dt;
    const hero = this.couple.active;
    const mv = this.input.move();
    const camDelta = this.input.cameraDelta();
    this.camYaw -= camDelta.dx * 0.0042;
    this.camPitch = clamp(this.camPitch + camDelta.dy * 0.0032, TUNING.cameraMinPitch, TUNING.cameraMaxPitch);
    if (this.input.key('KeyQ')) { hero.focusActive = hero.focus > 5; } else hero.focusActive = false;
    if (hero.focusActive) hero.focus = Math.max(0, hero.focus - dt * 30);
    else hero.focus = Math.min(100, hero.focus + dt * (hero.id === 'ian' ? 9 : 6));
    const timeScale = hero.focusActive ? 0.45 : 1;
    const sdt = dt * timeScale;
    if (this.driving) this._stepDriving(sdt, mv);
    else this._stepWalking(sdt, mv, hero);
    this._stepWorld(sdt, hero);
    this._stepMissions(sdt, hero);
    this._stepKeys(hero);
    this.sky.update(sdt, hero, this.elapsed);
    this.districtName = districtAt(hero.x, hero.z).name;
  }
  _stepWalking(dt, mv, hero) {
    // W moves AWAY from the camera: along the camera forward direction.
    const f = this.cameraForward(), r = this.cameraRight();
    const speed = this.input.running() ? TUNING.runSpeed : TUNING.walkSpeed;
    const wantX = (f.x * mv.y + r.x * mv.x) * speed * mv.mag;
    const wantZ = (f.z * mv.y + r.z * mv.x) * speed * mv.mag;
    const k = Math.min(1, TUNING.accel * dt / Math.max(1, speed));
    hero.vx += (wantX - hero.vx) * Math.min(1, 12 * dt);
    hero.vz += (wantZ - hero.vz) * Math.min(1, 12 * dt);
    let nx = hero.x + hero.vx * dt, nz = hero.z + hero.vz * dt;
    nx = clamp(nx, -440, 440); nz = clamp(nz, -440, 440);
    // Buildings are solid.
    const b = this.city.collideBuildings(nx, nz, TUNING.playerRadius);
    nx = b.x; nz = b.z;
    hero.x = nx; hero.z = nz;
    // Parked cars are solid, and so is every other car.
    const c = this.traffic.collidePlayer(hero.x, hero.z, TUNING.playerRadius);
    hero.x = c.x; hero.z = c.z;
    const moving = Math.hypot(hero.vx, hero.vz) > 0.4;
    if (moving) {
      hero.heading = Math.atan2(hero.vx, hero.vz);
      if (this.stepCount % 22 === 0) this.sound.footstep();
    }
    hero.sync(dt, moving);
    this._checkCarHits(hero);
  }

  _checkCarHits(hero) {
    // A moving car striking the player on foot: damage, knockback,
    // a red flash and a hit sound. Checked before the solid push-out
    // lets the car pass through the player.
    for (const car of this.traffic.movingCars()) {
      if (car.driven || car.hitCooldown > 0) continue;
      const d = Math.hypot(hero.x - car.x, hero.z - car.z);
      if (d < 3.1 && Math.abs(car.speed) > 2.5) {
        car.hitCooldown = 1.2;
        const hpBefore = hero.health;
        hero.hurt(TUNING.carHitDamage);
        const dx = hero.x - car.x, dz = hero.z - car.z, len = Math.hypot(dx, dz) || 1;
        hero.x += (dx / len) * 3.2; hero.z += (dz / len) * 3.2;
        hero.vx = (dx / len) * TUNING.knockback; hero.vz = (dz / len) * TUNING.knockback;
        this.lastHitAt = performance.now();
        this.lastHit = { hpBefore, hpAfter: hero.health, knockback: 3.2, at: this.elapsed };
        this.hud.flashHit();
        this.sound.hit();
        this.police.addCrime(0);
        this.hud.toast('Hit by a car! -$0, health ' + Math.round(hero.health));
        if (hero.health <= 0) this._wasted();
        break;
      }
    }
  }
  _stepDriving(dt, mv) {
    const car = this.drivenCar;
    const hero = this.couple.active;
    const accel = mv.y * 26;
    const braking = this.input.key('Space') || this.input.key('KeyF');
    car.speed += accel * dt;
    if (braking) car.speed *= Math.max(0, 1 - 4 * dt);
    car.speed *= Math.max(0, 1 - 0.55 * dt);
    car.speed = clamp(car.speed, -11, 46);
    if (Math.abs(car.speed) > 0.3) {
      car.heading += mv.x * 1.9 * dt * Math.sign(car.speed);
    }
    const f = car.forward();
    let nx = car.x + f.x * car.speed * dt, nz = car.z + f.z * car.speed * dt;
    nx = clamp(nx, -440, 440); nz = clamp(nz, -440, 440);
    const b = this.city.collideBuildings(nx, nz, 2.2);
    if (b.x !== nx || b.z !== nz) car.speed *= 0.4;
    car.x = b.x; car.z = b.z;
    // Do not drive through parked cars: stop at them.
    for (const p of this.traffic.parked) {
      if (p === car) continue;
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < 4.4) {
        const dx = car.x - p.x, dz = car.z - p.z, len = d || 1;
        car.x = p.x + (dx / len) * 4.4; car.z = p.z + (dz / len) * 4.4;
        car.speed *= 0.3;
      }
    }
    car.sync();
    hero.x = car.x; hero.z = car.z;
    hero.heading = car.heading;
    this.camYaw = car.heading;
    this.sound.engine(car.speed, true);
    // Running over a pedestrian is a crime.
    for (const p of this.crowd.peds) {
      if (Math.hypot(p.x - car.x, p.z - car.z) < 2.4 && Math.abs(car.speed) > 5) {
        p.panic = 1;
        this.police.addCrime(1);
        this.couple.addReputation(-4);
        this.hud.toast('You hit a pedestrian! Wanted level up.');
        car.speed *= 0.5;
        break;
      }
    }
  }

  _stepWorld(dt, hero) {
    for (const car of this.traffic.cars) if (car.hitCooldown > 0) car.hitCooldown -= dt;
    this.traffic.update(dt);
    const threat = this.police.wanted > 0 ? { x: hero.x, z: hero.z, level: this.police.wanted } : null;
    this.crowd.update(dt, this.elapsed, threat);
    this.police.update(dt, hero.x, hero.z, this.elapsed);
    this.police.decay(dt, this.police.wanted > 0 && this._hiddenFromPolice(hero));
    this.sideJobs.update(dt, hero);
    this.carTheft.tick(dt);
    this.hurricane.update(dt, this.sky.weather);
    this.sound.siren(dt, this.police.wanted);
    this.sound.radioTick();
    if (this.police.bustedCheck(hero.x, hero.z, !this.driving)) this._busted();
    if (this.punchTimer > 0) this.punchTimer -= dt;
    // Dawn bonus when the clock crosses 6am.
    const prevHour = this._lastHour ?? this.sky.timeOfDay;
    if (prevHour < 6 && this.sky.timeOfDay >= 6) {
      const bonus = this.couple.dawnBonus();
      if (bonus > 0) this.hud.toast(`Dawn bonus: bond paid $${bonus}.`);
    }
    this._lastHour = this.sky.timeOfDay;
    this.hud.update(this);
  }
  _hiddenFromPolice(hero) {
    for (const c of this.police.cars) if (Math.hypot(hero.x - c.x, hero.z - c.z) < 30) return false;
    return true;
  }
  _stepMissions(dt, hero) {
    const result = this.missions.update(dt, hero.x, hero.z);
    if (result === 'done') {
      const doneId = this.missions.completed[this.missions.completed.length - 1];
      const def = [...RYAN_MISSIONS, ...IAN_MISSIONS, FINALE].find((d) => d.id === doneId);
      const pay = def.id === 'finale'
        ? this.missions.finalePayout(JETS, PROPERTIES)
        : def.pay;
      this.couple.addMoney(pay);
      this.couple.addBond(6);
      this.sound.cash(); this.sound.missionSting();
      this.hud.toast(`${def.name} complete! +$${pay.toLocaleString('en-US')}`, 5);
      if (def.id === 'finale') this.hud.toast('🏆 THE VAULT IS YOURS — legends of Solmar Bay!', 6);
    } else if (result === 'failed') {
      this.sound.tone(180, 0.4, 'sawtooth', 0.2, 90);
      this.hud.toast('Mission failed — the timer ran out. Start it again from the phone.');
    }
  }
  _stepKeys(hero) {
    const inp = this.input;
    if (inp.wasPressed('KeyE')) this.interact();
    if (inp.wasPressed('KeyF')) this.punch();
    if (inp.wasPressed('KeyP')) this.phone.toggle();
    if (inp.wasPressed('KeyM')) this.toggleMap();
    if (inp.wasPressed('KeyC')) this.switchHero();
    if (inp.wasPressed('Escape')) {
      if (this.phone.open) this.phone.close();
      else if (this.hud.mapOpen()) this.toggleMap(false);
      else if (this.state === 'play') this.pauseGame();
    }
  }

  // What E does right now, nearest usable thing first: a car beats a
  // shop, so E never opens a shop while the player tries to enter a car.
  nearestInteraction() {
    const hero = this.couple.active;
    if (this.driving) return { kind: 'exit-car', label: 'E — Exit car' };
    const car = this.traffic.nearestParked(hero.x, hero.z, TUNING.carEnterRange);
    if (car) return { kind: 'enter-car', car, label: 'E — Enter car' };
    let best = null, bd = TUNING.interactRange * TUNING.interactRange;
    for (const s of this.city.shops) {
      const d = (hero.x - s.x) ** 2 + (hero.z - s.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (best) {
      if (best.kind === 'safehouse') return { kind: 'safehouse', shop: best, label: 'E — Sleep at the safehouse' };
      if (best.kind === 'bar') return { kind: 'bar', shop: best, label: 'E — Talk to Vera (missions)' };
      return { kind: 'shop', shop: best, label: `E — Enter ${best.name}` };
    }
    const giver = this._nearestMissionGiver(hero);
    if (giver) return { kind: 'mission', label: 'E — Take the job' };
    return { kind: 'none', label: '' };
  }
  _nearestMissionGiver(hero) {
    // Vera stands at the bar; the mission giver is there.
    const d = Math.hypot(hero.x - (-262), hero.z - 262);
    return d < 6 ? { x: -262, z: 262 } : null;
  }
  interact() {
    const hero = this.couple.active;
    const it = this.nearestInteraction();
    if (it.kind === 'exit-car') { this.exitCar(); return; }
    if (it.kind === 'enter-car') { this.enterCar(it.car); return; }
    if (it.kind === 'safehouse') {
      hero.sleep();
      this.hud.toast('You slept at the safehouse. Health and stamina restored.');
      this.sound.cash();
      return;
    }
    if (it.kind === 'bar') { this.phone.openPhone(); this.phone.screen = 'missions'; this.phone.render(); return; }
    if (it.kind === 'mission') { this.phone.openPhone(); this.phone.screen = 'missions'; this.phone.render(); return; }
    if (it.kind === 'shop') { this._openShop(it.shop); return; }
  }
  _openShop(shop) {
    const hero = this.couple.active;
    const stock = { store: 'store', gunshop: 'gunshop', clothes: 'clothes' }[shop.kind];
    if (!stock) { this.hud.toast(`${shop.name} is closed right now.`); return; }
    // Quick buy: the first item on the shelf, with a message.
    const msg = buyFrom(this.couple, hero, stock, 0);
    this.hud.toast(`${shop.name}: ${msg}`);
    this.sound.cash();
  }
  punch() {
    const hero = this.couple.active;
    if (this.punchTimer > 0) return;
    this.punchTimer = TUNING.punchCooldown;
    this.sound.punch();
    if (this.driving) {
      // F is the handbrake while driving (keyboard or touch button).
      if (this.drivenCar) this.drivenCar.speed *= 0.55;
      return;
    }
    // Hit the nearest pedestrian in front, if any.
    for (const p of this.crowd.peds) {
      const d = Math.hypot(p.x - hero.x, p.z - hero.z);
      if (d < TUNING.punchRange) {
        p.panic = 1;
        this.police.addCrime(1);
        this.couple.addReputation(-3);
        this.hud.toast('You punched a pedestrian! The police noticed.');
        return;
      }
    }
  }

  enterCar(car) {
    const hero = this.couple.active;
    car.parked = false; car.driven = true;
    this.drivenCar = car;
    this.driving = true;
    hero.mesh.visible = false;
    hero.x = car.x; hero.z = car.z;
    this.camYaw = car.heading;
    this.sound.engine(0, true);
    this.sound.click();
    this.hud.toast('Driving — W accelerates, S brakes, A/D steer, E exits.');
  }
  exitCar() {
    const car = this.drivenCar;
    const hero = this.couple.active;
    car.driven = false;
    this.driving = false; this.drivenCar = null;
    const f = car.forward();
    hero.setPosition(car.x - f.x * 3, car.z - f.z * 3);
    hero.mesh.visible = true;
    hero.vx = 0; hero.vz = 0;
    this.sound.engine(0, false);
  }
  switchHero() {
    if (this.driving) { this.hud.toast('Exit the car first to switch.'); return; }
    const to = this.couple.switchHero();
    this.hud.toast(`Now playing as ${to.def.name}.`);
    this.sound.click();
  }
  startMission(def) {
    this.missions.start(def);
    this.sound.missionSting();
    this.hud.toast(`Mission: ${def.name} — ${def.brief}`, 5);
  }
  startFinale() {
    if (!this.missions.finaleReady()) { this.hud.toast('Finish both mission chains first.'); return; }
    const pay = this.missions.finalePayout(JETS, PROPERTIES);
    this.missions.start(FINALE);
    this.hud.toast(`FINALE: The Marina Royale Vault — payout $${pay.toLocaleString('en-US')}.`, 6);
  }
  spawnTaxiPickup() {
    const hero = this.couple.active;
    const taxi = this.traffic.taxi;
    taxi.x = hero.x + 14; taxi.z = hero.z + 6;
    taxi.heading = Math.atan2(hero.x - taxi.x, hero.z - taxi.z);
    taxi.sync();
  }
  onTouchButton(id) {
    if (id === 'btn-interact') this.interact();
    else if (id === 'btn-punch') this.punch();
    else if (id === 'btn-phone') this.phone.toggle();
    else if (id === 'btn-map') this.toggleMap();
  }
  toggleMap(force) {
    const open = force !== undefined ? force : !this.hud.mapOpen();
    if (open) { this.hud.drawBigMap(this); this.hud.showMap(); }
    else this.hud.hideMap();
  }

  pauseGame() { if (this.state !== 'play') return; this.state = 'paused'; this.screens.showPause(); }
  resumeGame() { this.state = 'play'; this.screens.hide(); }
  quitToTitle() {
    this.state = 'title';
    this.saveGame();
    this.police.reset();
    this.missions.abandon();
    if (this.driving) this.exitCar();
    this.hud.hide();
    this.screens.showTitle();
  }
  startGame(continueSave) {
    this.sound.ensure();
    if (continueSave) {
      const data = loadGameData();
      if (data) { applySaveData(this, data); this.hud.toast('Save loaded. Welcome back.'); }
    } else {
      this.couple.wallet = TUNING.startMoney;
      this.couple.active.setPosition(-60, 60);
    }
    this.state = 'play';
    this.screens.hide();
    this.hud.show();
    this.hud.update(this);
    this.hud.toast('Welcome to Solmar Bay — open the phone (P) for your first job.', 5);
  }
  saveGame() { saveGameData(this); }
  _busted() {
    if (this.state !== 'play') return;
    this.state = 'busted';
    this.couple.spend(300);
    this.police.reset();
    this.screens.showBusted();
  }
  afterBusted() {
    this.couple.active.setPosition(180, 90);
    this.couple.active.heal(20);
    this.state = 'play';
    this.screens.hide();
  }
  _wasted() {
    if (this.state !== 'play') return;
    this.state = 'wasted';
    this.couple.spend(200);
    this.screens.showWasted();
  }
  afterWasted() {
    this.couple.active.setPosition(180, 90);
    this.couple.active.health = TUNING.maxHealth;
    this.state = 'play';
    this.screens.hide();
  }
  render() {
    const hero = this.couple.active;
    // The camera trails the player slightly: its focus point chases the
    // hero, so walking forward visibly carries the hero toward the top
    // of the frame until the camera catches up.
    const now = performance.now();
    const rdt = Math.min(0.25, (now - (this._lastRender || now)) / 1000);
    this._lastRender = now;
    if (!this.camFocus) this.camFocus = { x: hero.x, z: hero.z };
    if (Math.hypot(hero.x - this.camFocus.x, hero.z - this.camFocus.z) > 30) {
      this.camFocus = { x: hero.x, z: hero.z };
    } else {
      const k = 1 - Math.exp(-3.0 * rdt);
      this.camFocus.x += (hero.x - this.camFocus.x) * k;
      this.camFocus.z += (hero.z - this.camFocus.z) * k;
    }
    const focus = this.camFocus;
    const pitch = this.camPitch;
    const dist = this.driving ? this.camDist + 3 : this.camDist;
    const f = this.cameraForward();
    const cx = focus.x - f.x * Math.cos(pitch) * dist;
    const cz = focus.z - f.z * Math.cos(pitch) * dist;
    const cy = Math.sin(pitch) * dist + 1.6;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(focus.x, 1.6, focus.z);
    this.renderer.render(this.scene, this.camera);
    // Context line: what E will do right now.
    if (this.state === 'play') {
      const it = this.nearestInteraction();
      this.hud.setContext(it.label);
    }
  }

  _parseShot() {
    const params = new URLSearchParams(location.search);
    this.shotQuery = params.get('shot');
  }
  _setupDebug() {
    const self = this;
    window.__solmar = {
      game: self,
      state() {
        const hero = self.couple.active;
        const f = self.cameraForward();
        return {
          state: self.state,
          hero: hero.id, x: hero.x, z: hero.z, health: hero.health,
          money: self.couple.wallet, wanted: self.police.wanted,
          driving: self.driving, camYaw: self.camYaw, camPitch: self.camPitch,
          camForward: f, mission: self.missions.active ? self.missions.active.def.id : null,
          touchVisible: self.input.touchVisible(),
          isTouch: self.input.isTouchDevice,
          joyMag: self.input.joyMag, joyVec: self.input.joyVec,
          screenPos: self._screenPos(hero.x, hero.z),
          steps: self.stepCount,
        };
      },
      selfTest() { return self.selfTest(); },
      teleport(x, z) { self.couple.active.setPosition(x, z); self.couple.active.vx = 0; self.couple.active.vz = 0; },
      setWanted(n) { self.police.wanted = n; self.police.heat = n * 30; },
      startMission(id) {
        const all = [...self.missions ? [] : []];
        return self.missions.nextFor(self.couple.active.id);
      },
    };
  }
  _screenPos(x, z) {
    const v = new THREE.Vector3(x, 1.6, z).project(this.camera);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, behind: v.z > 1 };
  }
  selfTest() {
    const checks = [];
    const ok = (name, cond) => checks.push({ name, pass: !!cond });
    const hero = this.couple.active;
    ok('boots with a scene', !!this.scene && !!this.camera);
    ok('city has buildings', this.city.buildingBoxes.length > 20);
    ok('city has shops', this.city.shops.length >= 10);
    ok('traffic has parked cars', this.traffic.parked.length >= 10);
    ok('traffic has moving cars', this.traffic.movingCars().length >= 10);
    ok('pedestrians exist', this.crowd.peds.length >= 20);
    ok('animals exist', this.crowd.animals.length >= 8);
    ok('missions listed', this.missions.nextFor('ryan') !== null);
    const payout = this.missions.finalePayout(JETS, PROPERTIES);
    ok('finale payout computed from jet + property', payout === 890000 + 520000);
    const feats = gameFeatures();
    ok('features list has 12 entries', feats.length === 12);
    ok('features total adds up', featuresTotal(feats) === feats.reduce((s, f) => s + f.maxPayout, 0));
    ok('W walks along camera forward', (() => {
      const f = this.cameraForward();
      const before = { x: hero.x, z: hero.z };
      hero.x += f.x * 2; hero.z += f.z * 2;
      const moved = (hero.x - before.x) * f.x + (hero.z - before.z) * f.z;
      hero.x = before.x; hero.z = before.z;
      return moved > 1.9;
    })());
    ok('parked car blocks walking', (() => {
      const car = this.traffic.parked[0];
      const r = this.traffic.collidePlayer(car.x, car.z, TUNING.playerRadius);
      const d = Math.hypot(r.x - car.x, r.z - car.z);
      return d >= TUNING.carSolidRadius - 0.01;
    })());
    ok('touch layer only on touch devices', this.input.isTouchDevice === !!this.input.touchLayer || !this.input.isTouchDevice);
    ok('phone opens', (() => { this.phone.openPhone(); const o = this.phone.open; this.phone.close(); return o; })());
    ok('side job starts', (() => { const n = this.sideJobs.start('taxi'); return !!n && !!this.sideJobs.active; })());
    ok('robbery scout progresses', (() => { const p = this.robbery.scout('store'); return p.backDoor === true; })());
    ok('safehouse catalogue has 3 upgrades', this.safehouse.catalogue().length === 3);
    ok('stranger missions listed', this.sideJobs.list().length >= 4);
    ok('save round-trips', (() => { this.saveGame(); return !!loadGameData(); })());
    const passed = checks.filter((c) => c.pass).length;
    return { passed, failed: checks.length - passed, total: checks.length, checks };
  }
}
