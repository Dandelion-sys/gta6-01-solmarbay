// Economy and phase-two systems: shops, reputation, jobs, strangers, bounties,
// treasure, challenges, sports, kayaking, base jumping, tours, radio, body stats.
import { CAR_MODELS, PLANE_MODELS, PROPERTY_LIST, WEAPONS } from './config.js';
export class Economy {
  constructor() {
    this.money = 2500; this.reputation = 0; this.bond = 20;
    this.ownedCars = ['Bayrunner Sedan']; this.ownedWeapons = ['Fists'];
    this.ownedProps = ['Bay Mart Flat']; this.ownedClothes = ['Street Tee'];
    this.strength = 50; this.stamina = 50; this.weight = 78;
    this.fish = 0; this.pelts = 0; this.photos = 0; this.followers = 12;
    this.bountiesDone = 0; this.treasureFound = 0; this.challenges = {};
    this.strangers = [
      { name: 'Lost tourist', done: false, pay: 150, text: 'Find my camera at the pier.' },
      { name: 'Fisherman', done: false, pay: 200, text: 'My lucky rod is in the mangroves.' },
      { name: 'Street musician', done: false, pay: 120, text: 'Play a duet with me at the boardwalk.' },
      { name: 'Retired sailor', done: false, pay: 250, text: 'Fetch my charts from the ferry office.' },
      { name: 'Runaway bride', done: false, pay: 300, text: 'Drive me to Gull Point, fast.' },
      { name: 'Birdwatcher', done: false, pay: 180, text: 'Photograph a pelican for my book.' },
      { name: 'Night nurse', done: false, pay: 220, text: 'Bring medicine to the hospital.' },
      { name: 'Young fan', done: false, pay: 100, text: 'Take a photo with the lookalike at the cinema.' },
    ];
    this.bounties = [
      { name: 'Smuggler Sam', alive: 2400, dead: 900 },
      { name: 'Dock Thief', alive: 1500, dead: 600 },
      { name: 'Swamp Poacher', alive: 1800, dead: 700 },
    ];
    this.treasures = [
      { clue: 'Where the lighthouse watches the dawn, look beneath the third bench.', found: false, pay: 5000 },
      { clue: 'The old ferry bell rings for no one; dig where its shadow falls at noon.', found: false, pay: 8000 },
      { clue: 'Beneath the palm that leans over the swamp pool, the captain hid his chest.', found: false, pay: 12000 },
    ];
    this.radioStation = 0; this.radioNames = ['Bay FM — music', 'Talk of the Bay', 'Harbor Podcasts'];
  }
  canAfford(n) { return this.money >= n; }
  spend(n) { if (!this.canAfford(n)) return false; this.money -= n; return true; }
  earn(n, why) { this.money += n; return n; }
  shopPrice(base) { return Math.round(base * (1 - this.reputation * 0.002)); }
  buyCar(name) {
    const c = CAR_MODELS.find(m => m.name === name); if (!c || this.ownedCars.includes(name)) return false;
    if (!this.spend(c.price)) return false; this.ownedCars.push(name); return true;
  }
  buyWeapon(name) {
    const w = WEAPONS.find(m => m.name === name); if (!w || this.ownedWeapons.includes(name)) return false;
    if (!this.spend(w.price)) return false; this.ownedWeapons.push(name); return true;
  }
  buyProperty(name) {
    const p = PROPERTY_LIST.find(m => m.name === name); if (!p || this.ownedProps.includes(name)) return false;
    if (!this.spend(p.price)) return false; this.ownedProps.push(name); return true;
  }
  doTaxi() { const f = 60 + Math.floor(Math.random() * 140); this.earn(f, 'taxi'); return f; }
  doDelivery() { const f = 90 + Math.floor(Math.random() * 160); this.earn(f, 'delivery'); return f; }
  doFishing() { const f = 40 + Math.floor(Math.random() * 90); this.fish++; this.earn(f, 'fishing'); return f; }
  doBusking() { const f = 20 + Math.floor(Math.random() * 60); this.earn(f, 'busking'); return f; }
  doTour() { const f = 150 + Math.floor(Math.random() * 150); this.earn(f, 'airboat tour'); return f; }
  doKayak() { const f = 50 + Math.floor(Math.random() * 80); this.earn(f, 'kayak'); return f; }
  helpStranger(i) { const s = this.strangers[i]; if (!s || s.done) return 0; s.done = true; this.reputation += 8; this.bond += 2; this.earn(s.pay, 'stranger'); return s.pay; }
  catchBounty(i, alive) { const b = this.bounties[i]; if (!b) return 0; this.bountiesDone++; const p = alive ? b.alive : b.dead; this.earn(p, 'bounty'); return p; }
  findTreasure(i) { const t = this.treasures[i]; if (!t || t.found) return 0; t.found = true; this.treasureFound++; this.earn(t.pay, 'treasure'); return t.pay; }
  setChallenge(cat, rank) { this.challenges[cat] = rank; const pay = { bronze: 200, silver: 600, gold: 1500 }[rank] || 0; this.earn(pay, 'challenge'); return pay; }
  eat() { this.strength += 1; this.weight += 0.4; this.spend(25); }
  gym() { this.strength += 3; this.stamina += 2; this.weight -= 0.3; this.spend(40); }
  sleep() { this.stamina = Math.min(100, this.stamina + 30); this.bond += 1; }
  studyAnimal(kind) { this.photos++; this.followers += 3; return kind; }
  // Shop stock lists, priced with the reputation discount applied.
  shopStock(kind) {
    const stock = {
      store: [{ name: 'Bay Sandwich', price: 25 }, { name: 'Energy Drink', price: 12 }, { name: 'Fishing Bait', price: 30 }],
      weapons: [{ name: 'Harbor Pistol', price: 900 }, { name: 'Tide Rifle', price: 3400 }, { name: 'Cleaning Kit', price: 120 }],
      clothes: [{ name: 'Bay Linen Shirt', price: 180 }, { name: 'Marina Jacket', price: 420 }, { name: 'Sunset Dress', price: 380 }],
      cars: CAR_MODELS.map(c => ({ name: c.name, price: c.price })),
    };
    return (stock[kind] || []).map(i => ({ ...i, price: this.shopPrice(i.price) }));
  }
  buyStock(kind, name) {
    const item = this.shopStock(kind).find(i => i.name === name);
    if (!item || !this.spend(item.price)) return false;
    if (kind === 'weapons') this.ownedWeapons.push(name);
    if (kind === 'clothes') this.ownedClothes.push(name);
    return true;
  }
}
