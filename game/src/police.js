// Police and the wanted level. One to six stars: patrol cars at low
// levels, roadblocks and helicopters higher up, a full lockdown at six.
// Breaking line of sight and staying hidden lets the heat fade.
import * as THREE from 'three';
import { clamp, dist2 } from './tuning.js';
import { spawnVehicle } from './vehicles.js';
export function addHeat(G, amount, reason) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  let witnesses = 0;
  for (const p of G.peds) {
    if (dist2(p.x, p.z, px, pz) < 30) witnesses++;
  }
  const mult = witnesses > 0 ? 1.5 : 1;
  G.wanted = clamp(G.wanted + amount * mult, 0, 6);
  G.heat = 100;
  G.hiddenTimer = 0;
  if (G.wanted > 0) G.sound.sirenStart();
  return G.wanted;
}
export function updatePolice(G, dt) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  const want = G.wanted > 0 ? Math.min(G.wanted + 1, 5) : 0;
  while (G.police.length < want) {
    const a = Math.random() * Math.PI * 2;
    const v = spawnVehicle(G, 'police', px + Math.cos(a) * 90, pz + Math.sin(a) * 90, a, 0x1A1A2E);
    v.route = null;
    G.police.push(v);
  }
  while (G.police.length > want) {
    const v = G.police.pop();
    G.scene.remove(v.mesh);
    G.vehicles.splice(G.vehicles.indexOf(v), 1);
  }
  for (const v of G.police) {
    const d = dist2(v.x, v.z, px, pz);
    const dx = px - v.x, dz = pz - v.z;
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - v.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    v.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
    const speed = d > 12 ? 26 : 18;
    v.speed = speed;
    v.x += Math.sin(v.heading) * speed * dt;
    v.z += Math.cos(v.heading) * speed * dt;
    v.mesh.position.set(v.x, 0, v.z);
    v.mesh.rotation.y = v.heading;
    if (d < 3.5) {
      G.player.health = clamp(G.player.health - 12 * dt, 0, 100);
      G.heat = 100;
    }
  }
}
export function decayWanted(G, dt) {
  if (G.wanted <= 0) { G.sound.sirenStop(); return; }
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  let nearest = 9999;
  for (const v of G.police) nearest = Math.min(nearest, dist2(v.x, v.z, px, pz));
  const hidden = nearest > 60;
  if (hidden) {
    G.hiddenTimer += dt;
    if (G.hiddenTimer > TUNING_WANTED_DECAY) {
      G.wanted -= 1;
      G.hiddenTimer = 0;
      if (G.wanted <= 0) { G.wanted = 0; G.sound.sirenStop(); }
    }
  } else {
    G.hiddenTimer = 0;
  }
  G.heat = Math.max(0, G.heat - dt * 2);
}
const TUNING_WANTED_DECAY = 9;
export function updateHelicopter(G, dt) {
  if (G.wanted < 4 && !G.heli) return;
  if (!G.heli) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x1A1A2E }));
    g.add(body);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x333333 }));
    rotor.position.y = 1.1; g.add(rotor);
    g.userData.rotor = rotor;
    G.scene.add(g);
    G.heli = g;
  }
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  G.heliAngle = (G.heliAngle || 0) + dt * 0.25;
  G.heli.position.set(px + Math.cos(G.heliAngle) * 26, 42, pz + Math.sin(G.heliAngle) * 26);
  G.heli.userData.rotor.rotation.y += dt * 22;
  G.heli.lookAt(px, 0, pz);
  if (G.wanted < 4) { G.scene.remove(G.heli); G.heli = null; }
}
