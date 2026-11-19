// Pedestrians and animals. Pedestrians walk the pavements, react to
// crimes, and sometimes call the police. Animals live in their corners:
// gulls by the water, dogs in the suburbs, deer in the fields, fish
// under the water and alligators in the swamp.
import * as THREE from 'three';
import { clamp, dist2, mulberry32 } from './tuning.js';
const PED_SHIRTS = [0xE67E22, 0x1ABC9C, 0x9B59B6, 0xF1C40F, 0xE74C3C, 0x3498DB, 0xECF0F1, 0x2ECC71];
export function makePedMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: PED_SHIRTS[Math.floor(rng() * PED_SHIRTS.length)] });
  const skin = new THREE.MeshLambertMaterial({ color: 0xC98E6B });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2A2E35 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), shirt);
  torso.position.y = 1.1; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 1.62; g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.2), pants);
  legL.position.set(-0.13, 0.38, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.13; g.add(legR);
  g.userData = { legL, legR, phase: rng() * 6 };
  return g;
}
export function spawnPeds(G) {
  const rng = mulberry32(G.seed + 31);
  G.peds = [];
  const spots = [
    [-60, 80], [60, -40], [-180, 200], [180, 150], [-250, -180],
    [0, 110], [120, -70], [-120, -40], [240, 200], [-20, 0],
  ];
  for (let i = 0; i < 34; i++) {
    const s = spots[i % spots.length];
    const mesh = makePedMesh(rng);
    const x = s[0] + (rng() - 0.5) * 40;
    const z = s[1] + (rng() - 0.5) * 40;
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    G.peds.push({
      mesh, x, z, heading: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 1.2, state: 'walk',
      panic: 0, targetX: x, targetZ: z, wait: rng() * 4,
    });
  }
}
export function updatePeds(G, dt) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  for (const p of G.peds) {
    if (p.panic > 0) {
      p.panic -= dt;
      const d = dist2(p.x, p.z, px, pz) || 1;
      p.x += ((p.x - px) / d) * 7 * dt;
      p.z += ((p.z - pz) / d) * 7 * dt;
      p.heading = Math.atan2(p.x - px, p.z - pz);
    } else if (p.wait > 0) {
      p.wait -= dt;
      if (p.wait <= 0) {
        p.targetX = clamp(p.x + (Math.random() - 0.5) * 90, -330, 330);
        p.targetZ = clamp(p.z + (Math.random() - 0.5) * 90, -330, 330);
      }
    } else {
      const dx = p.targetX - p.x, dz = p.targetZ - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) { p.wait = 2 + Math.random() * 5; continue; }
      p.heading = Math.atan2(dx, dz);
      p.x += (dx / d) * p.speed * dt;
      p.z += (dz / d) * p.speed * dt;
      const u = p.mesh.userData;
      u.phase += dt * p.speed * 3;
      u.legL.rotation.x = Math.sin(u.phase) * 0.5;
      u.legR.rotation.x = -Math.sin(u.phase) * 0.5;
    }
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
  }
}
export function spawnAnimals(G) {
  const rng = mulberry32(G.seed + 55);
  G.animals = [];
  const defs = [
    { kind: 'gull', n: 10, cx: -280, cz: 240, r: 90, color: 0xF5F0E1 },
    { kind: 'pelican', n: 4, cx: -260, cz: -260, r: 60, color: 0xE8D9A0 },
    { kind: 'dog', n: 5, cx: 235, cz: 180, r: 80, color: 0x8A6D3B },
    { kind: 'deer', n: 6, cx: 260, cz: 120, r: 70, color: 0xA67C52 },
    { kind: 'fish', n: 12, cx: -320, cz: 0, r: 120, color: 0x5DADE2 },
    { kind: 'alligator', n: 3, cx: -250, cz: -220, r: 60, color: 0x4A6741 },
  ];
  for (const d of defs) {
    for (let i = 0; i < d.n; i++) {
      const mesh = makeAnimalMesh(d.kind, d.color);
      const x = d.cx + (rng() - 0.5) * d.r * 2;
      const z = d.cz + (rng() - 0.5) * d.r * 2;
      mesh.position.set(x, d.kind === 'gull' || d.kind === 'pelican' ? 12 + rng() * 8 : (d.kind === 'fish' ? -2 : 0), z);
      G.scene.add(mesh);
      G.animals.push({ kind: d.kind, mesh, x, z, heading: rng() * 6.28, speed: 1 + rng() * 2, cx: d.cx, cz: d.cz, r: d.r, phase: rng() * 6 });
    }
  }
}
function makeAnimalMesh(kind, color) {
  const mat = new THREE.MeshLambertMaterial({ color });
  const g = new THREE.Group();
  if (kind === 'gull' || kind === 'pelican') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), mat);
    body.rotation.x = Math.PI / 2; g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.6), mat);
    g.add(wing);
  } else if (kind === 'fish') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 6), mat);
    body.rotation.z = Math.PI / 2; g.add(body);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.4), mat);
    body.position.y = 0.55; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), mat);
    head.position.set(0, 0.75, 0.85); g.add(head);
  }
  return g;
}
export function updateAnimals(G, dt) {
  for (const a of G.animals) {
    a.phase += dt * 2;
    if (Math.random() < dt * 0.1) a.heading = Math.random() * Math.PI * 2;
    const sp = a.kind === 'gull' || a.kind === 'pelican' ? a.speed * 3 : a.speed;
    a.x += Math.sin(a.heading) * sp * dt;
    a.z += Math.cos(a.heading) * sp * dt;
    const d = Math.hypot(a.x - a.cx, a.z - a.cz);
    if (d > a.r) { a.heading = Math.atan2(a.cx - a.x, a.cz - a.z); }
    const bob = a.kind === 'gull' || a.kind === 'pelican' ? Math.sin(a.phase) * 1.5 : 0;
    const y = a.kind === 'fish' ? -2 : (a.kind === 'gull' || a.kind === 'pelican' ? 12 + bob : 0);
    a.mesh.position.set(a.x, y, a.z);
    a.mesh.rotation.y = a.heading;
    if (a.kind === 'alligator') a.mesh.position.y = Math.sin(a.phase * 0.5) * 0.1;
  }
}
export function scarePeds(G, x, z, radius) {
  for (const p of G.peds) {
    if (dist2(p.x, p.z, x, z) < radius) p.panic = 3 + Math.random() * 2;
  }
}
