// Solmar Bay — tuning numbers, colours, key map and price lists.
// Every value here was picked for this game: bright coastal palette,
// forgiving driving, and mission payouts that grow along each chain.
export const WORLD = {
  size: 920, half: 460, seaLevel: -0.4, roadWidth: 14,
  dayLength: 480, startHour: 9.5, gravity: 22,
  walkSpeed: 7, runSpeed: 12, swimSpeed: 4,
  carAccel: 26, carBrake: 40, carTop: 46, carReverseTop: 14,
  carTurn: 2.1, wantedDecay: 0.05, maxWanted: 6,
};
export const COLOURS = {
  skyDay: 0x7ec8ee, skyDusk: 0xff9a5c, skyNight: 0x0d1b33,
  seaDay: 0x1e90c8, seaNight: 0x0a2a4a, sand: 0xf2e3b3,
  grass: 0x62b25a, road: 0x3a3f46, pavement: 0x9aa0a6,
  palmTrunk: 0x8a6a45, palmLeaf: 0x2f9e44,
  buildingGlass: 0x7fb8d8, buildingBrick: 0xc96f4a,
  buildingCream: 0xf0e0c0, buildingWhite: 0xeef2f2,
  roofRed: 0xb03a2e, roofTeal: 0x1f7a6d, roofGold: 0xd9a441,
};
export const KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', interact: 'KeyE', punch: 'KeyF', shoot: 'Mouse0',
  focus: 'KeyQ', phone: 'KeyP', map: 'KeyM', pause: 'Escape',
  switchHero: 'KeyC', horn: 'KeyH', reload: 'KeyR', jump: 'Space',
  camera: 'KeyV', mute: 'KeyN', save: 'KeyL', enterExit: 'KeyE',
};
export const KEY_LABELS = [
  ['W A S D', 'Walk / drive'], ['Shift', 'Run / boost'],
  ['E', 'Interact / enter & exit car'], ['F', 'Punch'],
  ['Mouse click', 'Shoot (when armed)'], ['Q', 'Focus (slow motion aim)'],
  ['Space', 'Jump'], ['P', 'Phone'], ['M', 'Big map'],
  ['C', 'Switch Ryan / Ian'], ['H', 'Horn'], ['R', 'Reload'],
  ['V', 'Camera view'], ['Esc', 'Pause'], ['N', 'Mute sound'],
];
export const DISTRICTS = [
  { name: 'Palm Quay', cx: -300, cz: 300, r: 150, tint: 0x2fa8a0, tag: 'marina' },
  { name: 'Coral Row', cx: 0, cz: 0, r: 170, tint: 0x3a86d8, tag: 'downtown' },
  { name: 'Sunset Fields', cx: 300, cz: 240, r: 160, tint: 0x7fae4c, tag: 'suburb' },
  { name: 'Gull Point', cx: -330, cz: -300, r: 130, tint: 0x8a7fb8, tag: 'cliff' },
  { name: 'Mangrove Flats', cx: 300, cz: -280, r: 150, tint: 0x4c7a3a, tag: 'swamp' },
  { name: 'North Docks', cx: 0, cz: -360, r: 140, tint: 0x9a6a3a, tag: 'industrial' },
  { name: 'Tern Isle', cx: -120, cz: 560, r: 90, tint: 0xe8b84c, tag: 'island' },
];
export const PLACES = [
  { id: 'anchor', name: 'The Brass Anchor', kind: 'bar', x: -300, z: 285, price: 0 },
  { id: 'casino', name: 'Marina Royale', kind: 'casino', x: 60, z: -40, price: 0 },
  { id: 'motors', name: 'Harbor Motors', kind: 'dealer', x: 120, z: 60, price: 0 },
  { id: 'gunshop', name: 'Gull and Gun', kind: 'guns', x: -60, z: 90, price: 0 },
  { id: 'clothes', name: 'Tide and Thread', kind: 'clothes', x: 40, z: 110, price: 0 },
  { id: 'mart', name: 'Bay Mart', kind: 'store', x: -20, z: 140, price: 0 },
  { id: 'safehouse', name: 'Safehouse', kind: 'home', x: -20, z: 152, price: 0 },
  { id: 'stables', name: 'Sunset Stables', kind: 'stable', x: 300, z: 200, price: 0 },
  { id: 'poolhall', name: 'The Break Room', kind: 'pool', x: -140, z: -60, price: 0 },
  { id: 'gym', name: 'Iron Tide Gym', kind: 'gym', x: 90, z: -110, price: 0 },
  { id: 'hospital', name: 'Solmar General', kind: 'hospital', x: -90, z: -20, price: 0 },
  { id: 'police', name: 'Bay Precinct', kind: 'police', x: 130, z: -60, price: 0 },
  { id: 'airport', name: 'Solmar Airfield', kind: 'airport', x: 60, z: -400, price: 0 },
  { id: 'lodge', name: 'Hunting Lodge', kind: 'lodge', x: 340, z: 300, price: 0 },
  { id: 'ferry', name: 'Tern Ferry Terminal', kind: 'ferry', x: -280, z: 380, price: 0 },
  { id: 'pier', name: 'Sunset Pier', kind: 'pier', x: -380, z: 330, price: 0 },
];
export const CARS_FOR_SALE = [
  { id: 'sunny', name: 'Sunny Coupe', price: 2400, top: 34, accel: 22, colour: 0xffd23f },
  { id: 'dune', name: 'Dune Buggy', price: 5200, top: 38, accel: 26, colour: 0xe86a33 },
  { id: 'harbor', name: 'Harbor Sedan', price: 6800, top: 40, accel: 24, colour: 0x3a86d8 },
  { id: 'gull', name: 'Gullwing GT', price: 14500, top: 50, accel: 32, colour: 0xc0392b },
  { id: 'storm', name: 'Storm Interceptor', price: 22000, top: 56, accel: 36, colour: 0x222831 },
  { id: 'marina', name: 'Marina Cruiser', price: 31000, top: 44, accel: 28, colour: 0x1f7a6d },
];
export const PLANES_FOR_SALE = [
  { id: 'kite', name: 'Kite Prop', price: 48000, kind: 'plane' },
  { id: 'heron', name: 'Heron Twin', price: 120000, kind: 'plane' },
  { id: 'albatross', name: 'Albatross Jet', price: 340000, kind: 'plane' },
];
export const BOATS_FOR_SALE = [
  { id: 'dinghy', name: 'Bay Dinghy', price: 9000, kind: 'boat' },
  { id: 'skiff', name: 'Marlin Skiff', price: 26000, kind: 'boat' },
  { id: 'yacht', name: 'Solmar Yacht', price: 180000, kind: 'boat' },
];
export const PROPERTIES_FOR_SALE = [
  { id: 'shack', name: 'Pier Shack', price: 15000, income: 40 },
  { id: 'flat', name: 'Quay Flat', price: 55000, income: 150 },
  { id: 'villa', name: 'Cliff Villa', price: 210000, income: 600 },
  { id: 'marina', name: 'Marina Penthouse', price: 480000, income: 1400 },
];
export const WEAPONS_FOR_SALE = [
  { id: 'fists', name: 'Fists', price: 0, damage: 12, range: 2.2, ammo: 0, slot: 'melee' },
  { id: 'pistol', name: 'Harbor Pistol', price: 800, damage: 22, range: 55, ammo: 12, slot: 'pistol' },
  { id: 'revolver', name: 'Quay Revolver', price: 1500, damage: 40, range: 60, ammo: 6, slot: 'pistol' },
  { id: 'smg', name: 'Tide SMG', price: 3200, damage: 16, range: 45, ammo: 30, slot: 'rifle' },
  { id: 'rifle', name: 'Gull Rifle', price: 5400, damage: 55, range: 110, ammo: 8, slot: 'rifle' },
  { id: 'shotgun', name: 'Breaker Shotgun', price: 4600, damage: 70, range: 22, ammo: 6, slot: 'rifle' },
];
export const CLOTHES_FOR_SALE = [
  { id: 'tee', name: 'Bay Tee', price: 60, heat: 0 },
  { id: 'hawaiian', name: 'Hawaiian Shirt', price: 140, heat: 0 },
  { id: 'suit', name: 'Marina Suit', price: 900, heat: -1 },
  { id: 'hoodie', name: 'Night Hoodie', price: 220, heat: -1 },
  { id: 'hiVis', name: 'Dock Hi-Vis', price: 180, heat: -2 },
  { id: 'tux', name: 'Casino Tux', price: 2400, heat: -1 },
];
export const FOOD_FOR_SALE = [
  { id: 'taco', name: 'Fish Taco', price: 12, health: 15, stamina: 6 },
  { id: 'burger', name: 'Bay Burger', price: 18, health: 25, stamina: 8 },
  { id: 'smoothie', name: 'Mango Smoothie', price: 9, health: 8, stamina: 14 },
  { id: 'feast', name: 'Seafood Feast', price: 45, health: 50, stamina: 20 },
];
export const ANIMALS = [
  { id: 'gull', name: 'Bay Gull', zone: 'coast', rare: false, points: 10 },
  { id: 'pelican', name: 'Pelican', zone: 'coast', rare: false, points: 15 },
  { id: 'dog', name: 'Stray Dog', zone: 'suburb', rare: false, points: 10 },
  { id: 'deer', name: 'Field Deer', zone: 'fields', rare: false, points: 20 },
  { id: 'gator', name: 'Swamp Alligator', zone: 'swamp', rare: false, points: 30 },
  { id: 'fish', name: 'Reef Fish', zone: 'sea', rare: false, points: 10 },
  { id: 'heron', name: 'Night Heron', zone: 'swamp', rare: true, points: 60 },
  { id: 'fox', name: 'Dune Fox', zone: 'cliff', rare: true, points: 60 },
  { id: 'turtle', name: 'Bay Turtle', zone: 'sea', rare: true, points: 80 },
];
export const RADIO_STATIONS = [
  { id: 'wave', name: 'Wave FM', kind: 'music', desc: 'Sunny coastal pop' },
  { id: 'talk', name: 'Bay Talk', kind: 'talk', desc: 'City news and callers' },
  { id: 'pod', name: 'Tide Pod', kind: 'podcast', desc: 'True crime of the bay' },
];
