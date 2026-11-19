// Solmar Bay economy: shops, cars, properties and jets for sale, plus the
// repeatable side work that pays between missions. The most expensive jet
// and the most expensive property set the finale payout (computed, never
// a fixed number).
export const SHOP_STOCK = {
  store: [
    { name: 'Bay Burger', price: 12, heal: 25, energy: 20, kind: 'food' },
    { name: 'Fish Tacos', price: 15, heal: 30, energy: 25, kind: 'food' },
    { name: 'Energy Drink', price: 8, heal: 5, energy: 35, kind: 'food' },
    { name: 'First Aid Kit', price: 60, heal: 60, energy: 0, kind: 'food' },
  ],
  gunshop: [
    { name: 'Pistol', price: 450, kind: 'weapon', damage: 22 },
    { name: 'Shotgun', price: 900, kind: 'weapon', damage: 55 },
    { name: 'Rifle', price: 1600, kind: 'weapon', damage: 40 },
    { name: 'Armour Vest', price: 300, kind: 'armour', armour: 50 },
    { name: 'Weapon Cleaning Kit', price: 90, kind: 'clean', clean: 100 },
  ],
  clothes: [
    { name: 'Street Outfit', price: 120, kind: 'outfit', outfit: 'street' },
    { name: 'Smart Suit', price: 480, kind: 'outfit', outfit: 'suit' },
    { name: 'Beach Set', price: 90, kind: 'outfit', outfit: 'beach' },
    { name: 'Work Coveralls', price: 150, kind: 'outfit', outfit: 'work' },
  ],
};
export const CARS_FOR_SALE = [
  { name: 'Bay Runner', price: 4200, speed: 22, colour: 0xd93a2b },
  { name: 'Coral Cruiser', price: 9800, speed: 28, colour: 0x2b6fd9 },
  { name: 'Sunset GT', price: 24000, speed: 36, colour: 0xf2c14e },
  { name: 'Marina Phantom', price: 61000, speed: 44, colour: 0x1f1f24 },
];
export const PROPERTIES = [
  { name: 'Dockside Flat', price: 18000, income: 120 },
  { name: 'Coral Row Loft', price: 65000, income: 420 },
  { name: 'Gull Point Villa', price: 240000, income: 1500 },
  { name: 'Tern Isle Estate', price: 520000, income: 3400 },
];
export const JETS = [
  { name: 'Bay Hopper', price: 95000, seats: 4 },
  { name: 'Coral Jet', price: 310000, seats: 8 },
  { name: 'Solmar Sovereign', price: 890000, seats: 14 },
];
export const SIDE_JOBS = [
  { id: 'taxi', name: 'Taxi Fare', pay: 90, text: 'Drive a fare across town.' },
  { id: 'delivery', name: 'Courier Run', pay: 140, text: 'Deliver a parcel, beat the clock.' },
  { id: 'fishing', name: 'Fishing', pay: 70, text: 'Catch fish off the pier and sell them.' },
  { id: 'busking', name: 'Busking', pay: 45, text: 'Play for the boardwalk crowd.' },
];
export const STRANGERS = [
  { name: 'Lost Tourist', place: 'Palm Quay', pay: 150, text: 'Show the tourist the lighthouse.' },
  { name: 'Old Fisherman', place: 'Pier', pay: 200, text: 'Find his lucky rod under the pier.' },
  { name: 'Street Musician', place: 'Coral Row', pay: 120, text: 'Bring her a spare guitar string.' },
  { name: 'Retired Sailor', place: 'Marina', pay: 180, text: 'Fetch his logbook from the ferry.' },
  { name: 'Runaway Bride', place: 'Sunset Fields', pay: 250, text: 'Drive her to the airport, fast.' },
  { name: 'Birdwatcher', place: 'Mangrove Flats', pay: 160, text: 'Spot the rare crested pelican.' },
  { name: 'Night Nurse', place: 'Hospital', pay: 140, text: 'Walk her home after her shift.' },
  { name: 'Photo Kid', place: 'Downtown', pay: 100, text: 'Take his photo with the mayor lookalike.' },
];
export const BOUNTIES = [
  { name: 'Skipper Dan', pay: 800, alive: 1200, place: 'North Docks' },
  { name: 'Two-Time Tess', pay: 950, alive: 1400, place: 'Coral Row' },
  { name: 'Silent Marco', pay: 1300, alive: 1900, place: 'Mangrove Flats' },
];
export const TREASURES = [
  { clue: 'Where the gulls sleep above the bay, the light turns twice a day.', place: 'Gull Point Lighthouse', pay: 2500 },
  { clue: 'Under the pier where the boats dream, the tide keeps what it means.', place: 'Palm Quay Pier', pay: 3200 },
  { clue: 'The isle that the ferry forgets holds the gold the old smugglers set.', place: 'Tern Isle', pay: 5000 },
];
export const CHALLENGES = [
  { cat: 'Driving', bronze: 200, silver: 500, gold: 1200 },
  { cat: 'Shooting', bronze: 200, silver: 500, gold: 1200 },
  { cat: 'Flying', bronze: 300, silver: 700, gold: 1500 },
  { cat: 'Swimming', bronze: 150, silver: 400, gold: 900 },
  { cat: 'Hunting', bronze: 250, silver: 600, gold: 1400 },
  { cat: 'Racing', bronze: 300, silver: 700, gold: 1600 },
  { cat: 'Stealth', bronze: 250, silver: 600, gold: 1400 },
  { cat: 'Stamina', bronze: 200, silver: 500, gold: 1100 },
  { cat: 'Style', bronze: 150, silver: 400, gold: 1000 },
];

// A shop visit: buy one item by index. Returns a message for the HUD.
export function buyFrom(couple, hero, kind, index) {
  const stock = SHOP_STOCK[kind];
  if (!stock || !stock[index]) return 'Nothing on that shelf.';
  const item = stock[index];
  const price = Math.round(item.price * couple.outfitPriceFactor());
  if (!couple.spend(price)) return `Need $${price} for ${item.name}. You have $${couple.wallet}.`;
  if (item.kind === 'food') hero.eat(item);
  if (item.kind === 'armour') hero.armour = Math.min(100, hero.armour + item.armour);
  if (item.kind === 'outfit') hero.outfit = item.outfit;
  if (item.kind === 'weapon') hero.weapons = hero.weapons || [], hero.weapons.push(item.name);
  return `Bought ${item.name} for $${price}.`;
}
export function buyCar(couple, index) {
  const car = CARS_FOR_SALE[index];
  if (!car) return 'No such car.';
  if (!couple.spend(car.price)) return `Need $${car.price} for the ${car.name}.`;
  couple.ownedCars = couple.ownedCars || [];
  couple.ownedCars.push(car.name);
  return `You own the ${car.name} now. It waits at Harbor Motors.`;
}
export function buyProperty(couple, index) {
  const p = PROPERTIES[index];
  if (!p) return 'No such property.';
  if (!couple.spend(p.price)) return `Need $${p.price} for ${p.name}.`;
  couple.ownedProps = couple.ownedProps || [];
  couple.ownedProps.push(p.name);
  return `${p.name} is yours. It pays $${p.income} a day.`;
}
// Features list used by the dossier helper and the README systems list.
export function gameFeatures() {
  return [
    { name: 'Open world city', maxPayout: 0 },
    { name: 'Missions (Ryan 6 + Ian 6)', maxPayout: 3200 + 3600 },
    { name: 'Finale vault heist', maxPayout: 890000 + 520000 },
    { name: 'Taxi and courier work', maxPayout: 140 },
    { name: 'Fishing and busking', maxPayout: 70 },
    { name: 'Stranger missions', maxPayout: 250 },
    { name: 'Bounty hunting', maxPayout: 1900 },
    { name: 'Treasure hunts', maxPayout: 5000 },
    { name: 'Challenges', maxPayout: 1600 },
    { name: 'Property income', maxPayout: 3400 },
    { name: 'Wildlife field guide', maxPayout: 400 },
    { name: 'Touch controls', maxPayout: 0 },
  ];
}
export function featuresTotal(list) {
  return list.reduce((sum, f) => sum + (f.maxPayout || 0), 0);
}
