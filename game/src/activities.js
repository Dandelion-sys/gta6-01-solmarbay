// Phase-two activities: jobs, sports, jumps, tours, hunts and the ferry.
import { TUNE } from './config.js';
export const CHALLENGE_CATS = ['driving', 'shooting', 'flying', 'swimming', 'hunting', 'racing', 'stealth', 'stamina', 'style'];
export const RANKS = { bronze: 200, silver: 600, gold: 1500 };
export class Activities {
  constructor(game) {
    this.game = game;
    this.taxiActive = false; this.taxiTarget = null; this.taxiTimer = 0;
    this.deliveryActive = false; this.deliveryCount = 0;
    this.fishing = false; this.fishTimer = 0;
    this.kayakActive = false; this.jumpActive = false; this.parachute = false;
    this.tourActive = false; this.tourStops = 0;
    this.basketballScore = [0, 0]; this.poolBalls = 8;
    this.boxingRound = 0; this.boxingHp = 100;
    this.ferryTimer = 0; this.ferryAt = 'Palm Quay';
    this.hurricane = false; this.hurricaneTimer = 0;
    this.swim = false; this.diveSite = null;
    this.huntTarget = null;
  }
  startTaxi() {
    const g = this.game;
    this.taxiActive = true; this.taxiTimer = 120;
    const spots = [[-160, 165], [45, -35], [150, 120], [170, -150], [-40, -190]];
    this.taxiTarget = spots[Math.floor(Math.random() * spots.length)];
    g.toast('Taxi fare: pick up the passenger and take them to the marker. 120s.');
    return this.taxiTarget;
  }
  updateTaxi(dt) {
    if (!this.taxiActive) return;
    this.taxiTimer -= dt;
    if (this.taxiTimer <= 0) { this.taxiActive = false; this.game.toast('The passenger gave up and walked away.'); return; }
    const g = this.game;
    if (Math.hypot(g.player.x - this.taxiTarget[0], g.player.z - this.taxiTarget[1]) < 10) {
      this.taxiActive = false;
      const fare = g.economy.doTaxi();
      g.toast('Fare complete: +' + fare + ' dollars. Nice driving.');
      g.sound.cash();
    }
  }
  startDelivery() {
    this.deliveryActive = true; this.deliveryCount = 0;
    this.game.toast('Delivery run: three parcels, three markers. Go!');
    return true;
  }
  startFishing() {
    const g = this.game;
    const nearWater = Math.hypot(g.player.x, g.player.z) > 250 || Math.abs(g.player.x + 180) < 30;
    if (!nearWater) { g.toast('You need to be by the water to fish. Try the pier.'); return false; }
    this.fishing = true; this.fishTimer = 4 + Math.random() * 4;
    g.toast('Line in the water... wait for a bite.');
    return true;
  }
  updateFishing(dt) {
    if (!this.fishing) return;
    this.fishTimer -= dt;
    if (this.fishTimer <= 0) {
      this.fishing = false;
      const g = this.game; const pay = g.economy.doFishing();
      g.toast('Caught a bay snapper! Sold for +' + pay + ' dollars.');
      g.sound.cash();
    }
  }
  startTour() {
    this.tourActive = true; this.tourStops = 0;
    this.game.toast('Airboat tour: drive the tourists past three swamp stops.');
    return true;
  }
  tourStop() {
    this.tourStops++;
    const g = this.game;
    if (this.tourStops >= 3) {
      this.tourActive = false;
      const pay = g.economy.doTour();
      g.toast('Tour complete! The tourists loved the gators. +' + pay);
      g.sound.cash();
    } else g.toast('Tour stop ' + this.tourStops + '/3 — the tourists are snapping photos.');
  }
  startKayak() {
    this.kayakActive = true;
    this.game.toast('Kayak out on the bay. Paddle with W, steer with A/D.');
    return true;
  }
  baseJump() {
    const g = this.game;
    const high = g.player.y > 20 || Math.hypot(g.player.x - 185, g.player.z + 165) < 20;
    if (!high) { g.toast('Find a high spot to jump from — the cliffs or the tallest tower.'); return false; }
    this.jumpActive = true; this.parachute = false;
    g.toast('Jump! Press Space to open the parachute.');
    return true;
  }
  openParachute() {
    if (!this.jumpActive) return false;
    this.parachute = true;
    this.game.toast('Parachute open. Steer to the landing circle.');
    return true;
  }
  landJump(good) {
    if (!this.jumpActive) return 0;
    this.jumpActive = false; this.parachute = false;
    const pay = this.game.economy.setChallenge('style', good ? 'gold' : 'bronze');
    this.game.toast(good ? 'Perfect landing! +' + pay : 'Rough landing, but you walked away. +' + pay);
    return pay;
  }
  playBasketball() {
    const g = this.game;
    const ours = 8 + Math.floor(Math.random() * 12);
    const theirs = 6 + Math.floor(Math.random() * 12);
    this.basketballScore = [ours, theirs];
    const win = ours > theirs;
    if (win) { const pay = 120; g.economy.earn(pay, 'basketball'); g.toast('Pickup game: you win ' + ours + '-' + theirs + '! +' + pay); }
    else g.toast('Pickup game: you lose ' + ours + '-' + theirs + '. The court wants a rematch.');
    g.economy.stamina = Math.max(10, g.economy.stamina - 4);
    return win;
  }
  playPool() {
    const g = this.game;
    const win = Math.random() < 0.55;
    if (win) { const pay = g.economy.doBusking() + 60; g.toast('You clear the table at The Break Room. +' + pay); }
    else g.toast('You scratch on the eight ball. The regulars laugh kindly.');
    return win;
  }
  boxBout() {
    const g = this.game;
    this.boxingRound++;
    const win = Math.random() < (0.4 + g.economy.strength / 250);
    if (win) { const pay = 200 + this.boxingRound * 50; g.economy.earn(pay, 'boxing'); g.toast('You win the bout at Iron Tide! +' + pay); }
    else { g.player.health = Math.max(20, g.player.health - 15); g.toast('You lose the bout. The coach says: train more, come back.'); }
    g.economy.strength += 2;
    return win;
  }
  ferryRide() {
    const g = this.game;
    if (this.ferryTimer > 0) { g.toast('The ferry is already on its way.'); return false; }
    this.ferryTimer = 30;
    const dest = this.ferryAt === 'Palm Quay' ? 'Tern Isle' : 'Palm Quay';
    g.toast('Ferry to ' + dest + ' leaves in 30 seconds. Stand on the pier.');
    return true;
  }
  updateFerry(dt) {
    if (this.ferryTimer <= 0) return;
    this.ferryTimer -= dt;
    if (this.ferryTimer <= 0) {
      const g = this.game;
      this.ferryAt = this.ferryAt === 'Palm Quay' ? 'Tern Isle' : 'Palm Quay';
      if (this.ferryAt === 'Tern Isle') { g.player.x = -260; g.player.z = -30; }
      else { g.player.x = -160; g.player.z = 160; }
      g.toast('The ferry docks at ' + this.ferryAt + '. Welcome ashore.');
    }
  }
  startHurricane() {
    this.hurricane = true; this.hurricaneTimer = 60;
    this.game.weather = 'storm';
    this.game.toast('HURRICANE WARNING: storm front crossing the bay. Take shelter or loot the chaos.');
    return true;
  }
  updateHurricane(dt) {
    if (!this.hurricane) return;
    this.hurricaneTimer -= dt;
    if (this.hurricaneTimer <= 0) { this.hurricane = false; this.game.weather = 'clear'; this.game.toast('The storm passes. The bay is calm again.'); }
  }
  swimToggle(on) {
    this.swim = on;
    if (on) this.game.toast('You are swimming. Watch your stamina.');
    return on;
  }
  diveAtSite() {
    const g = this.game;
    const sites = [[-200, 200], [200, 220], [-280, 100]];
    let near = null;
    for (const s of sites) if (Math.hypot(g.player.x - s[0], g.player.z - s[1]) < 25) near = s;
    if (!near) { g.toast('No marked reef site here. Dive sites are marked on the map.'); return 0; }
    const loot = 300 + Math.floor(Math.random() * 700);
    g.economy.earn(loot, 'scuba loot');
    g.toast('Underwater loot recovered: +' + loot + ' dollars!');
    return loot;
  }
  huntAnimal(kind) {
    const g = this.game;
    const ok = ['deer', 'gator', 'dog'].includes(kind);
    if (!ok) { g.toast('That animal is protected. The field guide says: photograph, do not hunt.'); return 0; }
    g.economy.pelts++;
    const pay = 180 + Math.floor(Math.random() * 220);
    g.economy.earn(pay, 'pelt');
    g.toast('Pelt taken and sold to the lodge: +' + pay);
    return pay;
  }
  update(dt) {
    this.updateTaxi(dt); this.updateFishing(dt); this.updateFerry(dt); this.updateHurricane(dt);
    if (this.swim) { this.game.economy.stamina = Math.max(0, this.game.economy.stamina - dt * 2); }
  }
}
