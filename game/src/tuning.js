// Solmar Bay tuning: every number and colour the game uses, in one place.
// The island is a square about 700 units across, ringed by sea, with a
// small island offshore reached by a causeway and a ferry.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
// Small seeded random so a seed always builds the same city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const TUNING = {
  step: 1 / 60,
  walkSpeed: 6, runSpeed: 11, swimSpeed: 3,
  carAccel: 26, carBrake: 40, carMax: 34, carReverseMax: 12,
  carTurn: 1.9, carGrip: 6,
  playerRadius: 0.7, carRadius: 2.2,
  dayMinutes: 1440, startMinutes: 480,
  moneyStart: 250, healthMax: 100,
  wantedDecaySeconds: 9, heatPerCrime: 1,
  focusMax: 100, focusDrain: 34, focusRegen: 7,
};
export const DISTRICTS = [
  { name: 'Palm Quay', cx: -250, cz: 210, w: 170, d: 150, ground: 0xE8D9A0, desc: 'marina and boardwalk' },
  { name: 'Coral Row', cx: 0, cz: 0, w: 260, d: 240, ground: 0x9AA5B1, desc: 'downtown towers' },
  { name: 'Sunset Fields', cx: 235, cz: 180, w: 190, d: 170, ground: 0x8FBF6A, desc: 'suburban houses' },
  { name: 'Gull Point', cx: 255, cz: -235, w: 150, d: 150, ground: 0xC9B18A, desc: 'cliffs and lighthouse' },
  { name: 'Mangrove Flats', cx: -250, cz: -220, w: 170, d: 160, ground: 0x5F7D4A, desc: 'swamp and reeds' },
  { name: 'North Docks', cx: 0, cz: -285, w: 240, d: 110, ground: 0x8A8F96, desc: 'warehouses and cranes' },
  { name: 'Tern Isle', cx: 0, cz: 455, w: 170, d: 130, ground: 0xE8D9A0, desc: 'island beach' },
];
// Named places the player can enter or use. x/z are world coordinates.
export const PLACES = {
  bar: { name: 'The Brass Anchor', x: -235, z: 195, district: 'Palm Quay' },
  casino: { name: 'Marina Royale', x: 40, z: -90, district: 'Coral Row' },
  dealer: { name: 'Harbor Motors', x: 120, z: 60, district: 'Coral Row' },
  gunshop: { name: 'Gull and Gun', x: -60, z: 80, district: 'Coral Row' },
  clothing: { name: 'Tide and Thread', x: 90, z: -70, district: 'Coral Row' },
  mart: { name: 'Bay Mart', x: -20, z: 110, district: 'Coral Row' },
  safehouse: { name: 'Safehouse', x: -20, z: 122, district: 'Coral Row' },
  stables: { name: 'Sunset Stables', x: 250, z: 210, district: 'Sunset Fields' },
  poolhall: { name: 'The Break Room', x: -120, z: 40, district: 'Coral Row' },
  gym: { name: 'Iron Tide Gym', x: 150, z: -20, district: 'Coral Row' },
  hospital: { name: 'Solmar General', x: -90, z: -90, district: 'Coral Row' },
  policeStation: { name: 'Bay Police HQ', x: 60, z: 100, district: 'Coral Row' },
  airport: { name: 'Solmar Air Strip', x: 180, z: -290, district: 'North Docks' },
  pier: { name: 'Palm Quay Pier', x: -290, z: 240, district: 'Palm Quay' },
  lighthouse: { name: 'Gull Point Light', x: 300, z: -280, district: 'Gull Point' },
  ferry: { name: 'Tern Ferry Terminal', x: -270, z: 265, district: 'Palm Quay' },
  lodge: { name: 'Hunting Lodge', x: 280, z: 140, district: 'Sunset Fields' },
  docks: { name: 'North Docks Yard', x: -40, z: -290, district: 'North Docks' },
  court: { name: 'Sunset Court', x: 210, z: 150, district: 'Sunset Fields' },
};
export const CAR_COLORS = [0xC0392B, 0x2E6FB0, 0xF1C40F, 0x27AE60, 0xECF0F1, 0x2C3E50, 0xE67E22, 0x8E44AD, 0x16A085, 0xBDC3C7];
export const CAR_MODELS = [
  { name: 'Bay Runner', price: 4200, top: 30 },
  { name: 'Coral Coupe', price: 9800, top: 38 },
  { name: 'Palm Cruiser', price: 6500, top: 32 },
  { name: 'Dune Buggy', price: 5200, top: 28 },
  { name: 'Harbor Van', price: 7100, top: 26 },
  { name: 'Sunset GT', price: 24000, top: 44 },
];
export const AIRCRAFT = [
  { name: 'Sea Skiff', price: 12000 },
  { name: 'Bay Hopper', price: 34000 },
  { name: 'Gullwing Jet', price: 85000 },
];
export const PROPERTIES = [
  { name: 'Quay Flat', price: 18000 },
  { name: 'Coral Loft', price: 45000 },
  { name: 'Cliff Villa', price: 120000 },
];
export const PRICES = {
  food: 12, gym: 25, bed: 400, workshop: 2500, armoury: 3200,
  decor: 800, pistol: 900, rifle: 2400, ammo: 60, cleaning: 40,
  outfitStreet: 150, outfitFancy: 600, outfitWork: 280,
  kayak: 900, scuba: 1400, parachute: 700, airboat: 15000,
  horse: 3200, fishingRod: 120, camera: 450,
};
