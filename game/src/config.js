// Tuning numbers and colours for Solmar Bay. One place for every dial.
export const TUNE = {
  walkSpeed: 6.5, runSpeed: 11, swimSpeed: 3.5,
  carAccel: 26, carBrake: 40, carMaxSpeed: 42, carReverseMax: 12,
  carTurn: 1.9, carGrip: 0.94,
  playerRadius: 0.7, carSolidRadius: 2.7,
  hitDamage: 14, knockback: 7, hitCooldown: 0.9,
  punchDamage: 12, pistolDamage: 26, rifleDamage: 46,
  focusDrain: 34, focusRegen: 9,
  wantedDecay: 0.012, hideDecay: 0.05,
  dayLength: 480, startHour: 9,
  saveKey: 'solmar-bay-save-v11',
  bestKey: 'solmar-bay-best-v11',
};
export const DISTRICTS = [
  { name: 'Palm Quay', cx: -140, cz: 130, color: 0x2fae8f, desc: 'Marina & boardwalk' },
  { name: 'Coral Row', cx: 0, cz: 0, color: 0x3a7bd5, desc: 'Downtown towers' },
  { name: 'Sunset Fields', cx: 150, cz: 120, color: 0x7fbf3f, desc: 'Suburbs & stables' },
  { name: 'Gull Point', cx: 170, cz: -150, color: 0xc98a3a, desc: 'Cliffs & lighthouse' },
  { name: 'Mangrove Flats', cx: -160, cz: -140, color: 0x4a7a3a, desc: 'Swamp & airboats' },
  { name: 'North Docks', cx: -40, cz: -190, color: 0x8a8f96, desc: 'Warehouses & cranes' },
  { name: 'Tern Isle', cx: -260, cz: -40, color: 0xe8d27a, desc: 'Island beach' },
];
export const PALETTE = {
  sea: 0x1e7fa8, sand: 0xe8d9a0, grass: 0x6fae4e, road: 0x3c4148,
  pavement: 0x9aa0a6, roofA: 0xd95f4b, roofB: 0x4b7fd9, roofC: 0xe8b93e,
  glass: 0x7fc4e8, trunk: 0x6b4a2f, leaf: 0x3f8f3a,
};
export const KEYMAP = [
  ['W A S D', 'Walk / drive (W = forward, away from camera)'],
  ['Shift', 'Run (on foot)'],
  ['Mouse drag', 'Look around / camera'],
  ['E', 'Enter or exit car / interact with nearest thing'],
  ['Space', 'Punch (on foot) / handbrake (driving)'],
  ['F', 'Aim and shoot with owned weapon'],
  ['Q', 'Focus slow-motion aiming'],
  ['P', 'Phone'],
  ['M', 'Map'],
  ['C', 'Switch Ryan / Ian (at safehouse or via phone)'],
  ['R', 'Reload / repair weapon'],
  ['Esc', 'Pause menu'],
  ['H', 'Horn'],
];
export const CAR_MODELS = [
  { name: 'Bayrunner Sedan', price: 4200, top: 34, color: 0xc23b3b },
  { name: 'Coral Coupe', price: 9800, top: 40, color: 0x2b6fd6 },
  { name: 'Dune Buggy', price: 6500, top: 32, color: 0xe8a13a },
  { name: 'Harbor Truck', price: 12000, top: 30, color: 0x5a6b7a },
  { name: 'Sunset Cruiser', price: 18500, top: 44, color: 0x8e44ad },
  { name: 'Gullwing GT', price: 42000, top: 52, color: 0x111111 },
];
export const PLANE_MODELS = [
  { name: 'Skiff Prop', price: 68000, kind: 'plane' },
  { name: 'Bayhawk Jet', price: 240000, kind: 'jet' },
];
export const PROPERTY_LIST = [
  { name: 'Bay Mart Flat', price: 45000 },
  { name: 'Marina Loft', price: 120000 },
  { name: 'Cliff Villa', price: 310000 },
  { name: 'Palm Quay Penthouse', price: 480000 },
];
export const WEAPONS = [
  { name: 'Fists', price: 0, kind: 'melee' },
  { name: 'Harbor Pistol', price: 900, kind: 'pistol', damage: 26 },
  { name: 'Tide Rifle', price: 3400, kind: 'rifle', damage: 46 },
  { name: 'Gull Shotgun', price: 2600, kind: 'rifle', damage: 40 },
];
export function mostExpensiveJet() { return PLANE_MODELS.reduce((a, b) => (b.price > a.price ? b : a)); }
export function mostExpensiveProperty() { return PROPERTY_LIST.reduce((a, b) => (b.price > a.price ? b : a)); }
export function finalePayout() { return mostExpensiveJet().price + mostExpensiveProperty().price; }
export const DISTRICT_GUIDES = {
  'Palm Quay': 'Boardwalk, pier, ferry terminal and The Brass Anchor bar. Vera gives missions here.',
  'Coral Row': 'Downtown towers, casino, hospital, police station and the busiest traffic.',
  'Sunset Fields': 'Quiet suburbs, stables, park, basketball court and the hunting lodge.',
  'Gull Point': 'Cliffs, lighthouse, viewpoint and the best base-jump ledge in the city.',
  'Mangrove Flats': 'Swamp water, reeds, airboats and gators. Tours leave from the dock.',
  'North Docks': 'Warehouses, containers, cranes and the smuggler coves along the shore.',
  'Tern Isle': 'A small island offshore. Ferry from Palm Quay, beach and a lighthouse cottage.',
};
export const HANDLING = {
  'Bayrunner Sedan': { accel: 24, grip: 0.94, turn: 1.8 },
  'Coral Coupe': { accel: 28, grip: 0.96, turn: 2.1 },
  'Dune Buggy': { accel: 22, grip: 0.88, turn: 2.4 },
  'Harbor Truck': { accel: 18, grip: 0.9, turn: 1.5 },
  'Sunset Cruiser': { accel: 30, grip: 0.95, turn: 2.0 },
  'Gullwing GT': { accel: 36, grip: 0.98, turn: 2.3 },
};
export const FERRY_TIMETABLE = [
  { from: 'Palm Quay', to: 'Tern Isle', departs: '07:00' },
  { from: 'Tern Isle', to: 'Palm Quay', departs: '07:30' },
  { from: 'Palm Quay', to: 'Tern Isle', departs: '12:00' },
  { from: 'Tern Isle', to: 'Palm Quay', departs: '12:30' },
  { from: 'Palm Quay', to: 'Tern Isle', departs: '18:00' },
  { from: 'Tern Isle', to: 'Palm Quay', departs: '18:30' },
];
export const BUS_ROUTES = [
  { name: 'Bay Loop', stops: ['Palm Quay', 'Coral Row', 'Sunset Fields', 'Gull Point'] },
  { name: 'Dock Line', stops: ['Coral Row', 'North Docks', 'Mangrove Flats'] },
];
export function districtGuide(name) { return DISTRICT_GUIDES[name] || 'A corner of Solmar Bay.'; }
export const SHOP_HOURS = {
  'The Brass Anchor Bar': 'Open 10:00–02:00. Vera is behind the bar after noon.',
  'Marina Royale Casino': 'Open 24 hours. Slots, tables, and a vault you should not think about.',
  'Harbor Motors': 'Open 09:00–18:00. Six models on the floor, more in the yard.',
  'Gull and Gun': 'Open 09:00–20:00. Pistols, rifles, cleaning kits. No questions.',
  'Tide and Thread': 'Open 10:00–21:00. Fresh outfits shed police heat faster.',
  'Bay Mart': 'Open 07:00–23:00. Food, bait, and the stairs to your safehouse.',
  'Iron Tide Boxing Gym': 'Open 06:00–22:00. Train strength and stamina here.',
  'The Break Room Pool Hall': 'Open 12:00–02:00. Pool, side bets, and regulars with stories.',
  'Coral General Hospital': 'Open 24 hours. Patch-ups cost $150.',
  'Coral Row Police Station': 'Open 24 hours. Bounty posters on the board by the door.',
  'Sunset Stables': 'Open 08:00–18:00. Horses, hay, and the smell of the fields.',
  'Bayview Cinema': 'Open 11:00–23:00. Double features about the bay.',
};
export const NPC_BIOS = {
  Vera: 'Fixer who runs The Brass Anchor. She knows everyone and owes no one.',
  Milo: 'Getaway driver for hire. Never panics, never speeds through school zones.',
  Sana: 'Lookout for hire. Spots police two blocks before anyone else.',
  Otto: 'Mechanic for hire. Fixes cars fast and cheap, asks no questions.',
  Luz: 'Hacker for hire. Disables cameras from a distance, given time.',
  'Smuggler Sam': 'Wanted alive for $2,400. Last seen near the North Docks coves.',
  'Dock Thief': 'Wanted alive for $1,500. Steals containers, not hearts.',
  'Swamp Poacher': 'Wanted alive for $1,800. Hunts gators without a licence.',
};
export const WEATHER_ADVICE = {
  clear: 'Clear skies. The best driving weather Solmar Bay gets.',
  cloudy: 'Cloudy. Good light for photographs, bad light for alibis.',
  rain: 'Rain. Roads are slick, pedestrians hurry, gators get bold.',
  storm: 'Storm. High wind, flying debris, and a city full of shelter.',
};
export function shopHours(name) { return SHOP_HOURS[name] || 'Open most days.'; }
export function npcBio(name) { return NPC_BIOS[name] || 'A face in the crowd of Solmar Bay.'; }
