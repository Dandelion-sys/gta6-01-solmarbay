// Solmar Bay tuning: every number the game balances on, in one place.
// Distances are in metres, speeds in metres per second, money in dollars.
export const TUNING = {
  worldSize: 920,
  seaLevel: -0.4,
  walkSpeed: 5.2,
  runSpeed: 9.0,
  sprintSpeed: 12.5,
  accel: 34,
  friction: 26,
  turnSpeed: 2.6,
  playerRadius: 0.55,
  carSolidRadius: 2.6,
  carEnterRange: 4.2,
  interactRange: 4.5,
  punchRange: 2.2,
  punchDamage: 18,
  punchCooldown: 0.45,
  maxHealth: 100,
  maxArmour: 100,
  carHitDamage: 14,
  knockback: 11,
  wantedDecay: 0.02,
  wantedPerCrime: 1,
  policeChaseSpeed: 17,
  trafficSpeed: 9,
  trafficCount: 26,
  pedCount: 42,
  dayLengthSec: 480,
  startMoney: 850,
  cameraDist: 8.5,
  cameraHeight: 3.4,
  cameraMinPitch: 0.12,
  cameraMaxPitch: 1.05,
};
// District palettes and the seven districts of Solmar Bay.
export const DISTRICTS = [
  { name: 'Palm Quay', cx: -260, cz: 260, r: 170, wall: 0xf2c14e, roof: 0xd94f3d, note: 'marina and boardwalk' },
  { name: 'Coral Row', cx: 60, cz: 40, r: 200, wall: 0x7fb3d5, roof: 0x2e5f8a, note: 'downtown towers' },
  { name: 'Sunset Fields', cx: -280, cz: -260, r: 180, wall: 0xf7d9a0, roof: 0xc96f4a, note: 'suburbs and stables' },
  { name: 'Gull Point', cx: 300, cz: -300, r: 150, wall: 0xd8cfc0, roof: 0x8a7f70, note: 'cliffs and lighthouse' },
  { name: 'Mangrove Flats', cx: 300, cz: 280, r: 160, wall: 0x7a9a5b, roof: 0x4a6b3a, note: 'swamp and airboats' },
  { name: 'North Docks', cx: -40, cz: -330, r: 170, wall: 0x9aa5ad, roof: 0x5b6b73, note: 'warehouses and cranes' },
  { name: 'Tern Isle', cx: 430, cz: 430, r: 90, wall: 0xf5e6c8, roof: 0x3d7ea6, note: 'offshore island' },
];

// Colours for the city, sea, sky and vehicles.
export const COLOURS = {
  road: 0x3a3f46, roadLine: 0xf5d76e, pavement: 0xb8b0a0,
  grass: 0x6fae5e, sand: 0xf0dcb0, sea: 0x2a7fa8, seaDeep: 0x145a7d,
  skyDay: 0x87ceeb, skyDusk: 0xff9e5e, skyNight: 0x0d1b2e,
  sun: 0xfff2c0, palmTrunk: 0x8a6b45, palmLeaf: 0x3f9e4d,
  carPaints: [0xd93a2b, 0x2b6fd9, 0xf2c14e, 0x2ed573, 0xf5f0e6, 0x1f1f24, 0x9b59b6, 0xff7f50],
  taxi: 0xf7c948, police: 0x1c2733, policeLight: 0x2f7bff,
};
export const KEYMAP = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', interact: 'KeyE', punch: 'KeyF', aim: 'MouseRight',
  shoot: 'MouseLeft', focus: 'KeyQ', phone: 'KeyP', map: 'KeyM',
  pause: 'Escape', switchHero: 'KeyC', handbrake: 'Space',
};
export function districtAt(x, z) {
  let best = DISTRICTS[0], bd = 1e9;
  for (const d of DISTRICTS) {
    const dd = (x - d.cx) ** 2 + (z - d.cz) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
