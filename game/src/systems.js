// Solmar Bay side systems: repeatable work, car-theft minigames, robbery
// preparation, safehouse upgrades, sports, kayaking, base jumping, airboat
// tours and hurricanes. Each one pays or costs money and shows on the HUD.
import { SIDE_JOBS, STRANGERS, BOUNTIES, TREASURES, CHALLENGES } from './economy.js';

export class SideJobs {
  constructor(game) { this.game = game; this.active = null; }
  list() { return SIDE_JOBS; }
  start(id) {
    const job = SIDE_JOBS.find((j) => j.id === id);
    if (!job) return 'No such job.';
    const hero = this.game.couple.active;
    this.active = { job, x: hero.x + 60, z: hero.z + 40, timer: 90 };
    this.game.hud.toast(`${job.name}: ${job.text} Follow the yellow marker.`, 5);
    return job.name;
  }
  update(dt, hero) {
    if (!this.active) return;
    this.active.timer -= dt;
    const d = Math.hypot(hero.x - this.active.x, hero.z - this.active.z);
    if (d < 6) {
      const pay = this.active.job.pay;
      this.game.couple.addMoney(pay);
      this.game.sound.cash();
      this.game.hud.toast(`${this.active.job.name} done! +$${pay}.`);
      this.active = null;
    } else if (this.active.timer <= 0) {
      this.game.hud.toast('Job expired — the customer gave up.');
      this.active = null;
    }
  }
}

export class CarTheft {
  constructor(game) { this.game = game; this.attempt = null; }
  // Slim-jim timing bar: call begin, then lock() when the bar is in the zone.
  begin(car) {
    this.attempt = { car, bar: 0, dir: 1, zone: 0.45 + Math.random() * 0.2 };
    this.game.hud.toast('Slim jim: press E again when the bar is in the green zone.');
    return this.attempt;
  }
  tick(dt) {
    if (!this.attempt) return;
    this.attempt.bar += dt * 1.4 * this.attempt.dir;
    if (this.attempt.bar > 1) { this.attempt.bar = 1; this.attempt.dir = -1; }
    if (this.attempt.bar < 0) { this.attempt.bar = 0; this.attempt.dir = 1; }
  }
  lock() {
    if (!this.attempt) return false;
    const a = this.attempt;
    const good = Math.abs(a.bar - a.zone) < 0.12;
    this.attempt = null;
    if (good) {
      this.game.enterCar(a.car);
      this.game.hud.toast('The lock clicks open. The car is yours.');
      return true;
    }
    this.game.police.addCrime(1);
    this.game.hud.toast('The alarm screams! The police noticed.');
    return false;
  }
}

export class RobberyPrep {
  constructor(game) {
    this.game = game;
    this.scouted = {}; // shop kind -> {backDoor, safeCode, camerasOff}
  }
  scout(shopKind) {
    const p = this.scouted[shopKind] || { backDoor: false, safeCode: false, camerasOff: false };
    if (!p.backDoor) { p.backDoor = true; this.game.hud.toast('Scouted: the back entrance is the alley door.'); }
    else if (!p.safeCode) { p.safeCode = true; this.game.hud.toast('Scouted: the safe code is written under the counter.'); }
    else if (!p.camerasOff) { p.camerasOff = true; this.game.hud.toast('Scouted: the camera blind spot is the left aisle.'); }
    else { this.game.hud.toast('This shop is fully scouted. Rob it with Ian for a duo bonus.'); }
    this.scouted[shopKind] = p;
    return p;
  }
  ready(shopKind) {
    const p = this.scouted[shopKind];
    return !!(p && p.backDoor && p.safeCode && p.camerasOff);
  }
  rob(shopKind, duo) {
    if (!this.ready(shopKind)) { this.game.hud.toast('Scout the shop first — back door, safe code, cameras.'); return 0; }
    const take = 400 + Math.floor(Math.random() * 500) + (duo ? 300 : 0);
    this.game.couple.addMoney(take);
    this.game.police.addCrime(2);
    this.game.couple.addReputation(-6);
    this.game.sound.cash();
    this.game.hud.toast(`Robbery! +$${take}. The police are coming.`, 5);
    this.scouted[shopKind] = { backDoor: false, safeCode: false, camerasOff: false };
    return take;
  }
}

export class SafehouseUpgrades {
  constructor(game) {
    this.game = game;
    this.owned = { bed: true, workshop: false, armoury: false, decor: false };
    this.crew = [];
  }
  catalogue() {
    return [
      { id: 'workshop', name: 'Workshop', price: 1200, text: 'Repair cars and clean weapons at home.' },
      { id: 'armoury', name: 'Armoury', price: 2500, text: 'Carry a third weapon and store the rest safely.' },
      { id: 'decor', name: 'Decorations', price: 600, text: 'Make the apartment feel like home. Bond +10.' },
    ];
  }
  buy(id) {
    const item = this.catalogue().find((c) => c.id === id);
    if (!item || this.owned[id]) return 'Already owned.';
    if (!this.game.couple.spend(item.price)) return `Need $${item.price}.`;
    this.owned[id] = true;
    if (id === 'decor') this.game.couple.addBond(10);
    this.game.hud.toast(`Safehouse: ${item.name} installed.`);
    return item.name;
  }
  hire(role) {
    const wages = { driver: 300, lookout: 250, hacker: 500 };
    if (!wages[role]) return 'No such role.';
    if (!this.game.couple.spend(wages[role])) return `Need $${wages[role]} to hire a ${role}.`;
    this.crew.push({ role, morale: 70 });
    this.game.hud.toast(`Hired a ${role}. Crew morale 70.`);
    return role;
  }
}

export class SportsAndSea {
  constructor(game) { this.game = game; this.score = { you: 0, them: 0 }; }
  // Basketball pickup game: three quick shots, each one pays.
  shootHoops() {
    const made = Math.random() < 0.6;
    this.score.you += made ? 2 : 0;
    this.score.them += Math.random() < 0.5 ? 2 : 0;
    if (made) { this.game.couple.addMoney(25); this.game.sound.cash(); }
    this.game.hud.toast(made ? `Swish! +$25. Score ${this.score.you}–${this.score.them}.` : `Miss. Score ${this.score.you}–${this.score.them}.`);
    return made;
  }
  // Pool at The Break Room.
  playPool() {
    const won = Math.random() < 0.5;
    if (won) { this.game.couple.addMoney(80); this.game.sound.cash(); this.game.hud.toast('You cleared the table. +$80.'); }
    else { this.game.couple.spend(40); this.game.hud.toast('Lost the frame. -$40.'); }
    return won;
  }
  // Boxing bout at Iron Tide.
  boxBout() {
    const hero = this.game.couple.active;
    const won = hero.strength + Math.random() * 40 > 55;
    if (won) { this.game.couple.addMoney(200); hero.train(); this.game.hud.toast('Won the bout! +$200, strength up.'); }
    else { hero.hurt(15); this.game.hud.toast('Lost the bout. -15 health. Train more.'); }
    return won;
  }
  // Kayak and scuba: dive at a reef site for underwater loot.
  dive() {
    const loot = [0, 60, 120, 250][Math.floor(Math.random() * 4)];
    if (loot > 0) { this.game.couple.addMoney(loot); this.game.sound.cash(); this.game.hud.toast(`Dive loot: +$${loot}.`); }
    else this.game.hud.toast('Nothing but sand and a very confused fish.');
    return loot;
  }
  // Base jump from Gull Point cliffs.
  baseJump() {
    const hero = this.game.couple.active;
    hero.setPosition(330, -300);
    const landing = Math.random();
    if (landing > 0.25) { this.game.couple.addMoney(150); this.game.hud.toast('Clean landing! +$150.'); return true; }
    hero.hurt(20);
    this.game.hud.toast('Rough landing. -20 health.');
    return false;
  }
  // Airboat swamp tour for fares.
  airboatTour() {
    const fare = 90 + Math.floor(Math.random() * 120);
    this.game.couple.addMoney(fare);
    this.game.sound.cash();
    this.game.hud.toast(`Airboat tour done. Fares: +$${fare}.`);
    return fare;
  }
}

export class Hurricane {
  constructor(game) { this.game = game; this.active = false; }
  update(dt, weather) {
    if (weather === 'storm' && !this.active) {
      this.active = true;
      this.game.hud.toast('⚠ STORM FRONT: high wind, flying debris. Help people or loot the chaos.', 5);
    }
    if (weather !== 'storm') this.active = false;
  }
  helpPedestrian() {
    this.game.couple.addReputation(5);
    this.game.couple.addMoney(40);
    this.game.hud.toast('You helped someone to shelter. +Rep, +$40.');
  }
}

export function strangerList() { return STRANGERS; }
export function bountyList() { return BOUNTIES; }
export function treasureList() { return TREASURES; }
export function challengeList() { return CHALLENGES; }
