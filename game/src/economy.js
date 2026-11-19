// Economy and side work: wallet, shops, properties, jobs, challenges,
// sports, water play, base jumping, airboat tours and storm looting.
import { CARS_FOR_SALE, PLANES_FOR_SALE, BOATS_FOR_SALE, PROPERTIES_FOR_SALE,
  WEAPONS_FOR_SALE, CLOTHES_FOR_SALE, FOOD_FOR_SALE } from './config.js';
import { clamp, fmtMoney } from './rng.js';

export class Economy {
  constructor() {
    this.money = 1250;
    this.bestMoney = 1250;
    this.ownedCars = ['sunny'];
    this.ownedPlanes = [];
    this.ownedBoats = [];
    this.ownedProperties = ['safehouse'];
    this.weapons = [{ id: 'fists', ammo: 0, wear: 0 }];
    this.weaponIndex = 0;
    this.ownedOutfits = ['tee'];
    this.crew = [];
    this.upgrades = { bed: false, workshop: false, armoury: false, decor: false };
    this.challenges = {};
    this.treasuresFound = [];
    this.strangersDone = [];
    this.bountiesDone = [];
    this.fishCaught = 0;
    this.kayakBest = 0;
    this.jumpsLanded = 0;
    this.toursDone = 0;
    this.sportWins = { basketball: 0, pool: 0, boxing: 0 };
    this.job = null;
    this.jobTimer = 0;
    this.jobTarget = null;
  }
  earn(n, why) {
    this.money += n;
    if (this.money > this.bestMoney) this.bestMoney = this.money;
    return why + ' +' + fmtMoney(n);
  }
  spend(n) {
    if (this.money < n) return false;
    this.money -= n;
    return true;
  }
  priceMultiplier(rep) {
    if (rep >= 50) return 0.9;
    if (rep >= 15) return 0.95;
    if (rep <= -50) return 1.15;
    if (rep <= -15) return 1.08;
    return 1;
  }
  buyCar(id, rep) {
    const car = CARS_FOR_SALE.find((c) => c.id === id);
    if (!car || this.ownedCars.includes(id)) return null;
    const price = Math.round(car.price * this.priceMultiplier(rep));
    if (!this.spend(price)) return null;
    this.ownedCars.push(id);
    return car;
  }
  buyWeapon(id, rep) {
    const w = WEAPONS_FOR_SALE.find((x) => x.id === id);
    if (!w || this.weapons.some((x) => x.id === id)) return null;
    const price = Math.round(w.price * this.priceMultiplier(rep));
    if (!this.spend(price)) return null;
    this.weapons.push({ id: w.id, ammo: w.ammo, wear: 0 });
    return w;
  }
  buyOutfit(id, rep) {
    const o = CLOTHES_FOR_SALE.find((x) => x.id === id);
    if (!o || this.ownedOutfits.includes(id)) return null;
    const price = Math.round(o.price * this.priceMultiplier(rep));
    if (!this.spend(price)) return null;
    this.ownedOutfits.push(id);
    return o;
  }
  buyFood(id) {
    const f = FOOD_FOR_SALE.find((x) => x.id === id);
    if (!f) return null;
    if (!this.spend(f.price)) return null;
    return f;
  }
  buyProperty(id) {
    const p = PROPERTIES_FOR_SALE.find((x) => x.id === id);
    if (!p || this.ownedProperties.includes(id)) return null;
    if (!this.spend(p.price)) return null;
    this.ownedProperties.push(id);
    return p;
  }
  buyPlane(id) {
    const p = PLANES_FOR_SALE.find((x) => x.id === id);
    if (!p || this.ownedPlanes.includes(id)) return null;
    if (!this.spend(p.price)) return null;
    this.ownedPlanes.push(id);
    return p;
  }
  buyBoat(id) {
    const b = BOATS_FOR_SALE.find((x) => x.id === id);
    if (!b || this.ownedBoats.includes(id)) return null;
    if (!this.spend(b.price)) return null;
    this.ownedBoats.push(id);
    return b;
  }
  buyUpgrade(id) {
    const prices = { bed: 800, workshop: 2500, armoury: 4000, decor: 1200 };
    if (this.upgrades[id] || !prices[id]) return null;
    if (!this.spend(prices[id])) return null;
    this.upgrades[id] = true;
    return id;
  }
  hireCrew(role) {
    const wages = { driver: 900, lookout: 700, hacker: 1400, muscle: 1100 };
    if (this.crew.some((c) => c.role === role) || !wages[role]) return null;
    if (!this.spend(wages[role])) return null;
    const member = { role, morale: 70 };
    this.crew.push(member);
    return member;
  }
  currentWeapon() { return this.weapons[this.weaponIndex] || this.weapons[0]; }
  weaponDef() {
    const w = this.currentWeapon();
    return WEAPONS_FOR_SALE.find((x) => x.id === w.id) || WEAPONS_FOR_SALE[0];
  }
  cycleWeapon() {
    this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
    return this.currentWeapon();
  }
  cleanWeapon() {
    const w = this.currentWeapon();
    if (w.wear <= 0) return false;
    if (!this.spend(50)) return false;
    w.wear = 0;
    return true;
  }
  startTaxi() {
    this.job = { kind: 'taxi', stage: 'pickup', pay: 120, timer: 90 };
    this.jobTarget = { x: -380, z: 330, label: 'Pick up the passenger' };
    return this.job;
  }
  startDelivery() {
    this.job = { kind: 'delivery', stage: 'drop', pay: 160, timer: 120 };
    this.jobTarget = { x: 300, z: -280, label: 'Deliver the parcel' };
    return this.job;
  }
  startFishing() {
    this.job = { kind: 'fishing', stage: 'wait', pay: 0, timer: 8 };
    this.jobTarget = null;
    return this.job;
  }
  startBusking() {
    this.job = { kind: 'busking', stage: 'play', pay: 0, timer: 20 };
    this.jobTarget = null;
    return this.job;
  }
  finishJob() {
    const j = this.job;
    this.job = null;
    this.jobTarget = null;
    return j;
  }
  recordChallenge(cat, score) {
    const rank = score >= 90 ? 'gold' : score >= 60 ? 'silver' : score >= 30 ? 'bronze' : 'none';
    const prev = this.challenges[cat] || 'none';
    const order = { none: 0, bronze: 1, silver: 2, gold: 3 };
    if (order[rank] > order[prev]) {
      this.challenges[cat] = rank;
      const payout = { bronze: 200, silver: 500, gold: 1200 }[rank] || 0;
      if (payout) this.earn(payout, cat + ' ' + rank);
      return rank;
    }
    return prev;
  }
  dawnIncome() {
    let income = 0;
    for (const id of this.ownedProperties) {
      const p = PROPERTIES_FOR_SALE.find((x) => x.id === id);
      if (p) income += p.income;
    }
    if (income > 0) this.earn(income, 'Property income');
    return income;
  }
}
