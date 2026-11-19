// Missions. Vera, the fixer at The Brass Anchor bar, hands out the story
// jobs one at a time, in order. Ryan has six, Ian has six, and the finale
// unlocks when both chains are done. Each mission pays more than the last.
import * as THREE from 'three';
import { PLACES, AIRCRAFT, PROPERTIES, clamp, dist2 } from './tuning.js';
export const RYAN_MISSIONS = [
  { name: 'First Fare', brief: 'Vera needs a taxi driver for the morning rush. Pick up the fare at the pier and drop them at the casino.', pay: 150, timed: 0 },
  { name: 'Hot Delivery', brief: 'A parcel for the docks, and the clock is running. Get it to North Docks before the timer ends.', pay: 300, timed: 120 },
  { name: 'Quiet Tail', brief: 'Follow the mark from Coral Row without being seen. Use Focus to slow things down when it gets tight.', pay: 500, timed: 0 },
  { name: 'Repo Run', brief: 'A car in Sunset Fields has missed its payments. Take it quietly and bring it to the dealer.', pay: 800, timed: 0 },
  { name: 'The Getaway', brief: 'A job went loud at the pool hall. Drive fast, lose the police, and get to the safehouse.', pay: 1200, timed: 0 },
  { name: 'Bay Chase', brief: 'A boat is running for the open water. Take the skiff from the pier and run it down across the bay.', pay: 1800, timed: 0 },
];
export const IAN_MISSIONS = [
  { name: 'Eyes on the Prize', brief: 'Photograph the casino vault door and the guard rotation. The phone camera is your best friend.', pay: 200, timed: 0 },
  { name: 'Scout the Shop', brief: 'Case Bay Mart for a future job: find the back entrance and learn the safe code.', pay: 350, timed: 0 },
  { name: 'Drop Points', brief: 'Three packages, three corners of the city, no questions asked. Do not get followed.', pay: 600, timed: 180 },
  { name: 'Decoy Drive', brief: 'Draw the police away from Coral Row while Ryan works. Lose them at Gull Point.', pay: 900, timed: 0 },
  { name: 'Dark Cameras', brief: 'Disable the cameras around the casino service yard so the crew can move unseen.', pay: 1400, timed: 0 },
  { name: 'The Rescue', brief: 'Ryan is boxed in by a police cordon at the docks. Break through and get him out.', pay: 2000, timed: 0 },
];
export function finalePayout() {
  const topPlane = Math.max(...AIRCRAFT.map((a) => a.price));
  const topHome = Math.max(...PROPERTIES.map((p) => p.price));
  return topPlane + topHome;
}
export const FINALE = {
  name: 'The Marina Royale Vault',
  brief: 'Both chains done. Ryan and Ian rob the casino vault together, switch between them mid-job, and escape by boat and car. The payout is the most expensive aircraft plus the most expensive property in the city.',
};
export function startMission(G, who) {
  const list = who === 'ryan' ? RYAN_MISSIONS : IAN_MISSIONS;
  const idx = G.missions[who];
  if (idx >= list.length) return null;
  const def = list[idx];
  const m = {
    who, index: idx, def, stage: 0, timer: def.timed || 0,
    target: missionTarget(G, who, idx, 0), done: false, label: def.name,
  };
  G.missions.active = m;
  if (!G.missionBeam) {
    const geo = new THREE.CylinderGeometry(2.5, 2.5, 60, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFD94D, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    G.missionBeam = new THREE.Mesh(geo, mat);
    G.scene.add(G.missionBeam);
  }
  G.missionBeam.visible = true;
  G.missionBeam.position.set(m.target.x, 30, m.target.z);
  return m;
}
function missionTarget(G, who, idx, stage) {
  const P = PLACES;
  const spots = {
    ryan: [[P.pier, P.casino], [P.bar, P.policeStation], [P.casino, P.airport], [P.stables, P.dealer], [P.poolhall, P.safehouse], [P.pier, P.ferry]],
    ian: [[P.casino, P.casino], [P.mart, P.mart], [P.bar, P.docks, P.lighthouse], [P.casino, P.lighthouse], [P.casino, P.casino], [P.policeStation, P.safehouse]],
  };
  const chain = spots[who][idx] || [P.bar, P.casino];
  const place = chain[Math.min(stage, chain.length - 1)];
  return { x: place.x, z: place.z, r: 8, label: place.name };
}
export function updateMissions(G, dt) {
  const m = G.missions.active;
  if (!m) return;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) { failMission(G, 'Out of time.'); return; }
  }
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  const t = m.target;
  const d = dist2(px, pz, t.x, t.z);
  m.distance = d;
  if (G.missionBeam) G.missionBeam.position.set(t.x, 30, t.z);
  if (d < t.r) {
    m.stage++;
    if (m.stage >= missionStages(G, m)) { completeMission(G); return; }
    m.target = missionTarget(G, m.who, m.index, m.stage);
    G.hud.toast(`Next: ${m.target.label}`);
    G.sound.chime();
  }
  // The tailing job: stay close but not too close.
  if (m.who === 'ryan' && m.index === 2) {
    if (d < 4) { failMission(G, 'Spotted. The mark made you.'); }
  }
}
function missionStages(G, m) {
  if (m.who === 'ian' && m.index === 2) return 3;
  return 2;
}
function failMission(G, why) {
  const m = G.missions.active;
  G.missions.active = null;
  if (G.missionBeam) G.missionBeam.visible = false;
  G.hud.toast(`Mission failed: ${why}`);
  G.hud.showBriefing('Mission failed', `${why} Talk to Vera at The Brass Anchor to try again.`);
}
function completeMission(G) {
  const m = G.missions.active;
  G.missions.active = null;
  if (G.missionBeam) G.missionBeam.visible = false;
  let pay = m.def.pay;
  if (m.who === 'ryan' && m.index === 5) pay = m.def.pay;
  G.money += pay;
  G.stats.earned += pay;
  G.stats.best = Math.max(G.stats.best, G.money);
  G.missions[m.who]++;
  G.bond = clamp(G.bond + 4, 0, 100);
  G.sound.sting(); G.sound.chime();
  G.hud.showBriefing('Mission complete', `${m.def.name} paid $${pay}. Vera has more work at The Brass Anchor.`);
  if (G.missions.ryan >= 6 && G.missions.ian >= 6 && !G.missions.finaleDone) {
    G.hud.showBriefing('The big one', 'Both chains are done. The Marina Royale vault heist is ready — talk to Vera to start it.');
  }
  saveProgress(G);
}
function saveProgress(G) {
  try { G.saveGame(); } catch (e) {}
}
export function startFinale(G) {
  if (G.missions.ryan < 6 || G.missions.ian < 6 || G.missions.finaleDone) return null;
  const pay = finalePayout();
  const m = {
    who: 'both', index: 99, def: { name: FINALE.name, brief: FINALE.brief, pay, timed: 0 },
    stage: 0, timer: 0, target: { x: PLACES.casino.x, z: PLACES.casino.z, r: 8, label: 'Marina Royale vault' },
    done: false, label: FINALE.name, finale: true,
  };
  G.missions.active = m;
  return m;
}
