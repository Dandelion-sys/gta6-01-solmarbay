// Money, shops and side work. The wallet is shared between Ryan and
// Ian. Shops sell cars, clothes, weapons, food and upgrades; side jobs
// (taxi fares, deliveries, fishing, busking) pay between missions.
import { CAR_MODELS, PRICES, AIRCRAFT, PROPERTIES, PLACES, clamp, dist2 } from './tuning.js';
export function createEconomy(G) {
  G.shops = {
    dealer: { place: PLACES.dealer, items: CAR_MODELS.map((c) => ({ name: c.name, price: c.price, kind: 'car', top: c.top })) },
    gunshop: { place: PLACES.gunshop, items: [
      { name: 'Palm Pistol', price: PRICES.pistol, kind: 'weapon', weapon: 'pistol' },
      { name: 'Bay Rifle', price: PRICES.rifle, kind: 'weapon', weapon: 'rifle' },
      { name: 'Ammo box', price: PRICES.ammo, kind: 'ammo' },
      { name: 'Cleaning kit', price: PRICES.cleaning, kind: 'clean' },
    ] },
    clothing: { place: PLACES.clothing, items: [
      { name: 'Street outfit', price: PRICES.outfitStreet, kind: 'outfit', outfit: 'street' },
      { name: 'Work outfit', price: PRICES.outfitWork, kind: 'outfit', outfit: 'work' },
      { name: 'Fancy outfit', price: PRICES.outfitFancy, kind: 'outfit', outfit: 'fancy' },
    ] },
    mart: { place: PLACES.mart, items: [
      { name: 'Snack', price: PRICES.food, kind: 'food' },
      { name: 'Fishing rod', price: PRICES.fishingRod, kind: 'rod' },
      { name: 'Camera', price: PRICES.camera, kind: 'camera' },
    ] },
  };
  G.sideJob = null;
}
export function buyItem(G, shopKey, index) {
  const shop = G.shops[shopKey];
  if (!shop) return { ok: false, why: 'No such shop.' };
  const item = shop.items[index];
  if (!item) return { ok: false, why: 'No such item.' };
  const price = shopPrice(G, item);
  if (G.money < price) return { ok: false, why: 'Not enough money.' };
  G.money -= price;
  if (item.kind === 'car') {
    const v = G.spawnVehicle('car', PLACES.dealer.x + 14, PLACES.dealer.z + 8, Math.PI / 2, 0x2E6FB0);
    v.top = item.top; v.owned = true;
    G.inventory.cars = G.inventory.cars || [];
    G.inventory.cars.push(item.name);
  } else if (item.kind === 'weapon') {
    G.inventory.weapons = G.inventory.weapons || [];
    G.inventory.weapons.push({ type: item.weapon, wear: 0, ammo: item.weapon === 'pistol' ? 24 : 12 });
  } else if (item.kind === 'outfit') {
    G.player.outfit = item.outfit;
    G.inventory.outfits = G.inventory.outfits || [];
    if (!G.inventory.outfits.includes(item.outfit)) G.inventory.outfits.push(item.outfit);
  } else if (item.kind === 'food') {
    G.player.health = clamp(G.player.health + 20, 0, 100);
    G.player.strength = clamp(G.player.strength + 1, 0, 100);
  } else if (item.kind === 'ammo') {
    for (const w of G.inventory.weapons || []) w.ammo += 24;
  } else if (item.kind === 'clean') {
    for (const w of G.inventory.weapons || []) w.wear = 0;
  } else if (item.kind === 'rod') { G.inventory.rod = true; }
  else if (item.kind === 'camera') { G.inventory.camera = true; }
  G.stats.spent += price;
  G.sound.chime();
  return { ok: true, item };
}
function shopPrice(G, item) {
  const rep = G.reputation;
  const mult = rep > 30 ? 0.9 : rep < -30 ? 1.15 : 1;
  return Math.round(item.price * mult);
}
export function startTaxiJob(G) {
  const spots = [PLACES.pier, PLACES.casino, PLACES.dealer, PLACES.mart, PLACES.airport, PLACES.ferry];
  const from = spots[Math.floor(Math.random() * spots.length)];
  let to = spots[Math.floor(Math.random() * spots.length)];
  if (to === from) to = PLACES.lighthouse;
  G.sideJob = { kind: 'taxi', stage: 0, from, to, fare: 40 + Math.floor(Math.random() * 60) };
  G.hud.toast(`Taxi fare: pick up at ${from.name}, drop at ${to.name}. Pays $${G.sideJob.fare}.`);
  return G.sideJob;
}
export function startDeliveryJob(G) {
  const spots = [PLACES.mart, PLACES.bar, PLACES.gym, PLACES.hospital, PLACES.stables];
  const to = spots[Math.floor(Math.random() * spots.length)];
  G.sideJob = { kind: 'delivery', stage: 0, from: PLACES.dealer, to, fare: 55 + Math.floor(Math.random() * 70), timer: 150 };
  G.hud.toast(`Delivery to ${to.name} in 150 seconds. Pays $${G.sideJob.fare}.`);
  return G.sideJob;
}
export function updateSideJob(G, dt) {
  const j = G.sideJob;
  if (!j) return;
  if (j.timer !== undefined) {
    j.timer -= dt;
    if (j.timer <= 0) { G.sideJob = null; G.hud.toast('Delivery missed — the customer went elsewhere.'); return; }
  }
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  const target = j.stage === 0 ? j.from : j.to;
  if (dist2(px, pz, target.x, target.z) < 9) {
    if (j.stage === 0) { j.stage = 1; G.hud.toast(`Picked up. Now to ${j.to.name}.`); }
    else {
      G.money += j.fare; G.stats.earned += j.fare;
      G.sound.chime();
      G.hud.toast(`${j.kind === 'taxi' ? 'Fare' : 'Delivery'} done: $${j.fare}.`);
      G.sideJob = null;
    }
  }
}
