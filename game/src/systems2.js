// Phase-two systems, part two: safehouse upgrades and crew, stranger
// missions, bounty hunting, treasure hunts, challenges, sports, kayaking
// and diving, base jumping, airboat tours, the hunting lodge, hurricanes,
// transport, social, radio and body stats.
import { clamp, dist2, PLACES, PRICES } from './tuning.js';
export const STRANGERS = [
  { id: 'tourist', name: 'Lost tourist', text: 'Find the lighthouse viewpoint and bring back a photo.', pay: 80 },
  { id: 'fisherman', name: 'Fisherman', text: 'His lucky rod went overboard at the pier. Fish it out.', pay: 120 },
  { id: 'musician', name: 'Street musician', text: 'Busk with him at Coral Row for one song.', pay: 60 },
  { id: 'sailor', name: 'Retired sailor', text: 'Deliver his sea charts to the ferry terminal.', pay: 90 },
  { id: 'bride', name: 'Runaway bride', text: 'Drive her to Gull Point before the wedding starts.', pay: 150 },
  { id: 'birdwatcher', name: 'Birdwatcher', text: 'Photograph a pelican in Mangrove Flats.', pay: 100 },
  { id: 'nurse', name: 'Night-shift nurse', text: 'Escort her safely to the hospital after dark.', pay: 110 },
  { id: 'boy', name: 'Excited boy', text: 'Take his photo with the Sunset GT at the dealer.', pay: 70 },
];
export const TREASURE_CLUES = [
  ['Where the gulls shout loudest and the light turns at night, dig where the cliff meets the sky.', 'lighthouse'],
  ['Under the pier where the fishermen mend their nets, the sand keeps a sailor’s savings.', 'pier'],
  ['Between the cranes where the containers sleep, a smuggler left a box that never sailed.', 'docks'],
];
export function buySafehouseUpgrade(G, key) {
  const prices = { bed: PRICES.bed, workshop: PRICES.workshop, armoury: PRICES.armoury, decor: PRICES.decor };
  if (G.systems.safehouse[key]) return { ok: false, why: 'Already owned.' };
  const price = prices[key];
  if (G.money < price) return { ok: false, why: 'Not enough money.' };
  G.money -= price;
  G.systems.safehouse[key] = true;
  if (key === 'bed') G.player.health = 100;
  G.hud.toast(`Safehouse upgrade bought: ${key}.`);
  return { ok: true };
}
export function hireCrew(G, role) {
  const cost = 500;
  if (G.money < cost) return { ok: false, why: 'Hiring costs $500.' };
  if (G.systems.safehouse.crew.find((c) => c.role === role)) return { ok: false, why: 'Already hired.' };
  G.money -= cost;
  G.systems.safehouse.crew.push({ role, morale: 70 });
  G.hud.toast(`Hired a ${role}. Crew morale 70.`);
  return { ok: true };
}
export function takeBounty(G, index) {
  const targets = ['Smuggler Sam', 'Dockside Dan', 'Quay Quinn', 'Marina Max'];
  const name = targets[index % targets.length];
  if (G.systems.bounties.taken.includes(name)) return { ok: false, why: 'Already on the board.' };
  G.systems.bounties.taken.push(name);
  G.hud.toast(`Bounty taken: ${name}. Bring them in alive for $1,500.`);
  return { ok: true, name };
}
export function nextTreasureClue(G) {
  const chain = G.systems.treasure.chain;
  if (chain >= TREASURE_CLUES.length) return { ok: false, why: 'All treasure found.' };
  const clue = TREASURE_CLUES[chain];
  G.hud.showBriefing('Treasure clue', clue[0]);
  return { ok: true, clue: clue[0] };
}
export function digTreasure(G) {
  const chain = G.systems.treasure.chain;
  if (chain >= TREASURE_CLUES.length) return { ok: false };
  const place = PLACES[TREASURE_CLUES[chain][1]];
  const d = dist2(G.player.mesh.position.x, G.player.mesh.position.z, place.x, place.z);
  if (d > 12) return { ok: false, why: 'Not at the right spot yet.' };
  const loot = 800 + chain * 700;
  G.money += loot;
  G.systems.treasure.chain++;
  G.sound.sting();
  G.hud.toast(`Treasure found! $${loot} in buried loot.`);
  return { ok: true, loot };
}
export function playBasketball(G) {
  const win = Math.random() < 0.5 + G.player.strength / 400;
  if (win) { G.money += 60; G.systems.sports.wins++; G.hud.toast('Pickup game won! $60 and bragging rights.'); }
  else G.hud.toast('Pickup game lost. Run it back tomorrow.');
  return win;
}
export function goFishing(G) {
  if (!G.inventory.rod) return { ok: false, why: 'Buy a fishing rod at Bay Mart first.' };
  const nearWater = Math.abs(G.player.mesh.position.x) > 320 || G.player.mesh.position.z > 320 || G.player.mesh.position.z < -320;
  if (!nearWater) return { ok: false, why: 'Fish from the beach, the pier or the shore.' };
  const catchValue = 15 + Math.floor(Math.random() * 45);
  G.money += catchValue;
  G.stats.earned += catchValue;
  G.hud.toast(`Caught a fish! Sold at the pier for $${catchValue}.`);
  return { ok: true, value: catchValue };
}
export function goBusking(G) {
  const tip = 8 + Math.floor(Math.random() * 22) + (G.bond >= 40 ? 10 : 0);
  G.money += tip;
  G.stats.earned += tip;
  G.hud.toast(`Busking at Coral Row earned $${tip} in tips.`);
  return { ok: true, tip };
}
export function rentKayak(G) {
  if (G.money < 25) return { ok: false, why: 'Kayak rental is $25.' };
  G.money -= 25;
  G.systems.kayak = true;
  G.hud.toast('Kayak rented. Paddle the bay — dive sites are marked on the map.');
  return { ok: true };
}
export function diveReef(G) {
  if (!G.systems.kayak) return { ok: false, why: 'Rent a kayak first.' };
  const loot = 40 + Math.floor(Math.random() * 160);
  G.money += loot;
  G.stats.earned += loot;
  G.systems.scuba = true;
  G.hud.toast(`Dove the reef and found $${loot} in underwater loot.`);
  return { ok: true, loot };
}
export function baseJump(G) {
  const atCliff = dist2(G.player.mesh.position.x, G.player.mesh.position.z, PLACES.lighthouse.x, PLACES.lighthouse.z) < 25;
  if (!atCliff) return { ok: false, why: 'Base jumps happen at the Gull Point ledge.' };
  if (G.money < 20) return { ok: false, why: 'Parachute hire is $20.' };
  G.money -= 20;
  G.systems.baseJump++;
  const score = 50 + Math.floor(Math.random() * 150);
  G.money += score;
  G.hud.toast(`Clean jump off Gull Point! Landing bonus $${score}.`);
  return { ok: true, score };
}
export function airboatTour(G) {
  const inSwamp = dist2(G.player.mesh.position.x, G.player.mesh.position.z, -250, -220) < 90;
  if (!inSwamp) return { ok: false, why: 'Airboat tours run from Mangrove Flats.' };
  const fare = 60 + Math.floor(Math.random() * 90);
  G.money += fare;
  G.systems.airboat.tours++;
  G.hud.toast(`Airboat tour done. Tourists paid $${fare}. Watch the alligators.`);
  return { ok: true, fare };
}
export function huntAnimal(G, kind) {
  if (!G.inventory.weapons.length) return { ok: false, why: 'You need a weapon to hunt.' };
  const near = G.animals.find((a) => a.kind === kind && dist2(a.x, a.z, G.player.mesh.position.x, G.player.mesh.position.z) < 30);
  if (!near) return { ok: false, why: `No ${kind} nearby.` };
  G.systems.hunting.pelts++;
  const value = 45 + Math.floor(Math.random() * 80);
  G.money += value;
  G.animals.splice(G.animals.indexOf(near), 1);
  G.scene.remove(near.mesh);
  G.hud.toast(`Clean hunt. Pelt sold for $${value}.`);
  return { ok: true, value };
}
export const CHALLENGES = [
  { id: 'driving', name: 'Driving', ranks: { bronze: 100, silver: 250, gold: 500 } },
  { id: 'shooting', name: 'Shooting', ranks: { bronze: 100, silver: 250, gold: 500 } },
  { id: 'flying', name: 'Flying', ranks: { bronze: 150, silver: 300, gold: 600 } },
  { id: 'swimming', name: 'Swimming', ranks: { bronze: 80, silver: 200, gold: 400 } },
  { id: 'hunting', name: 'Hunting', ranks: { bronze: 120, silver: 280, gold: 550 } },
  { id: 'racing', name: 'Racing', ranks: { bronze: 150, silver: 350, gold: 700 } },
  { id: 'stealth', name: 'Stealth', ranks: { bronze: 120, silver: 280, gold: 550 } },
  { id: 'stamina', name: 'Stamina', ranks: { bronze: 80, silver: 200, gold: 400 } },
  { id: 'style', name: 'Style', ranks: { bronze: 100, silver: 250, gold: 500 } },
];
export function claimChallenge(G, id, rank) {
  const c = CHALLENGES.find((x) => x.id === id);
  if (!c || !c.ranks[rank]) return { ok: false, why: 'No such challenge.' };
  const key = `${id}:${rank}`;
  if (G.systems.challenges[key]) return { ok: false, why: 'Already claimed.' };
  G.systems.challenges[key] = true;
  G.money += c.ranks[rank];
  G.hud.toast(`${c.name} ${rank} rank claimed: $${c.ranks[rank]}.`);
  return { ok: true, pay: c.ranks[rank] };
}
export function helpInStorm(G) {
  if (!G.systems.hurricane.active) return { ok: false, why: 'No storm right now.' };
  G.systems.hurricane.helped++;
  changeRep(G, 6);
  G.hud.toast('You helped a pedestrian reach shelter during the storm.');
  return { ok: true };
}
function changeRep(G, n) {
  G.reputation = clamp(G.reputation + n, -100, 100);
}
export function strangerQuest(G, id) {
  const s = STRANGERS.find((x) => x.id === id);
  if (!s) return { ok: false, why: 'No such stranger.' };
  if (G.systems.strangers[id]) return { ok: false, why: 'Already helped.' };
  G.systems.strangers[id] = true;
  G.money += s.pay;
  G.stats.earned += s.pay;
  G.bond = clamp(G.bond + 2, 0, 100);
  changeRep(G, 3);
  G.hud.toast(`${s.name}: done! Paid $${s.pay}.`);
  return { ok: true, pay: s.pay };
}
export function giftPartner(G) {
  if (G.money < 40) return { ok: false, why: 'A gift costs $40.' };
  G.money -= 40;
  G.bond = clamp(G.bond + 8, 0, 100);
  G.hud.toast('A small gift for your partner. The bond grows.');
  return { ok: true };
}
