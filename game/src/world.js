// The city of Solmar Bay: one continuous island, seven districts, roads,
// buildings, palms, piers, beaches and the causeway to Tern Isle.
// Everything is simple flat-shaded geometry with strong colours.
import * as THREE from 'three';
import { DISTRICTS, PLACES, clamp, mulberry32 } from './tuning.js';
const ROAD_X = [-300, -180, -60, 60, 180, 300];
const ROAD_Z = [-280, -160, -40, 80, 200, 300];
export function buildCity(G) {
  const rng = mulberry32(G.seed);
  const scene = G.scene;
  G.colliders = [];
  G.buildings = [];
  G.palmTrees = [];
  // Island ground: a big slab, then district-coloured patches on top.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(720, 2, 700),
    new THREE.MeshLambertMaterial({ color: 0xB9A86F }));
  ground.position.set(0, -1, 0); scene.add(ground);
  for (const d of DISTRICTS) {
    if (d.name === 'Tern Isle') continue;
    const patch = new THREE.Mesh(
      new THREE.BoxGeometry(d.w, 0.4, d.d),
      new THREE.MeshLambertMaterial({ color: d.ground }));
    patch.position.set(d.cx, 0.2, d.cz);
    scene.add(patch);
  }
  // Tern Isle slab and the causeway bridge.
  const isle = new THREE.Mesh(
    new THREE.BoxGeometry(180, 2, 140),
    new THREE.MeshLambertMaterial({ color: 0xE8D9A0 }));
  isle.position.set(0, -1, 455); scene.add(isle);
  const bridge = new THREE.Mesh(
    new THREE.BoxGeometry(16, 1, 110),
    new THREE.MeshLambertMaterial({ color: 0x7A7F85 }));
  bridge.position.set(0, 0.4, 395); scene.add(bridge);
  buildRoads(G);
  buildDowntown(G, rng);
  buildHouses(G, rng);
  buildDocks(G, rng);
  buildPalms(G, rng);
  buildLandmarks(G);
  buildBeachProps(G, rng);
}
function buildRoads(G) {
  const scene = G.scene;
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3A3F44 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xF5F0E1 });
  for (const x of ROAD_X) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 700), roadMat);
    r.position.set(x, 0.35, 0); scene.add(r);
    for (let z = -330; z < 340; z += 24) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.32, 8), dashMat);
      d.position.set(x, 0.36, z); scene.add(d);
    }
  }
  for (const z of ROAD_Z) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(720, 0.3, 10), roadMat);
    r.position.set(0, 0.35, z); scene.add(r);
    for (let x = -340; x < 350; x += 24) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(8, 0.32, 0.6), dashMat);
      d.position.set(x, 0.36, z); scene.add(d);
    }
  }
  // Ring road around the coast for scenic drives.
  const ring = new THREE.Mesh(new THREE.BoxGeometry(700, 0.3, 8), roadMat);
  ring.position.set(0, 0.35, 330); scene.add(ring);
  const ring2 = ring.clone(); ring2.position.z = -330; scene.add(ring2);
}
function buildDowntown(G, rng) {
  const scene = G.scene;
  const glass = [0x7FB3D5, 0xA9CCE3, 0x5D8AA8, 0x8FB8D8];
  const concrete = [0xD5D8DC, 0xEAEDED, 0xF9E79F, 0xF5CBA7];
  let n = 0;
  for (let gx = -1; gx <= 1; gx++) {
    for (let gz = -1; gz <= 1; gz++) {
      if (gx === 0 && gz === 0) continue;
      const x = gx * 120 + (rng() - 0.5) * 8;
      const z = gz * 120 + (rng() - 0.5) * 8;
      const h = 18 + rng() * 55 + (Math.abs(gx) + Math.abs(gz) === 1 ? 20 : 0);
      const w = 16 + rng() * 10, d = 16 + rng() * 10;
      const mat = new THREE.MeshLambertMaterial({
        color: n % 3 === 0 ? glass[Math.floor(rng() * glass.length)] : concrete[Math.floor(rng() * concrete.length)],
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, h / 2, z); scene.add(b);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 2, d * 0.7),
        new THREE.MeshLambertMaterial({ color: 0x5D6D7E }));
      roof.position.set(x, h + 1, z); scene.add(roof);
      G.colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
      G.buildings.push(b);
      n++;
    }
  }
  // The casino tower, taller than the rest, with a gold crown.
  const casino = new THREE.Mesh(new THREE.BoxGeometry(34, 62, 26),
    new THREE.MeshLambertMaterial({ color: 0x1A5276 }));
  casino.position.set(40, 31, -90); scene.add(casino);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(36, 4, 28),
    new THREE.MeshLambertMaterial({ color: 0xF1C40F }));
  crown.position.set(40, 64, -90); scene.add(crown);
  G.colliders.push({ x0: 23, z0: -103, x1: 57, z1: -77 });
  G.buildings.push(casino);
}
function buildHouses(G, rng) {
  const scene = G.scene;
  const colors = [0xF5CBA7, 0xAED6F1, 0xF9E79F, 0xD5F5E3, 0xFADBD8, 0xEAF2F8];
  for (let i = 0; i < 46; i++) {
    const x = 170 + rng() * 150, z = 110 + rng() * 140;
    if (Math.abs(x - 180) < 12 || Math.abs(z - 200) < 12) continue;
    const w = 9 + rng() * 5, d = 8 + rng() * 5, h = 5 + rng() * 3;
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: colors[Math.floor(rng() * colors.length)] }));
    house.position.set(x, h / 2, z); scene.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.75, 3, 4),
      new THREE.MeshLambertMaterial({ color: 0x922B21 }));
    roof.position.set(x, h + 1.5, z); roof.rotation.y = Math.PI / 4; scene.add(roof);
    G.colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
    G.buildings.push(house);
  }
}
function buildDocks(G, rng) {
  const scene = G.scene;
  for (let i = 0; i < 8; i++) {
    const x = -130 + i * 38, z = -290;
    const wh = new THREE.Mesh(new THREE.BoxGeometry(26, 12, 20),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0x7F8C8D : 0x95A5A6 }));
    wh.position.set(x, 6, z); scene.add(wh);
    G.colliders.push({ x0: x - 13, z0: z - 10, x1: x + 13, z1: z + 10 });
    G.buildings.push(wh);
  }
  // Cranes: tall yellow frames over the container yard.
  for (let i = 0; i < 3; i++) {
    const x = -90 + i * 90;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 34, 2),
      new THREE.MeshLambertMaterial({ color: 0xF1C40F }));
    leg.position.set(x, 17, -310); scene.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 2),
      new THREE.MeshLambertMaterial({ color: 0xF1C40F }));
    arm.position.set(x + 10, 33, -310); scene.add(arm);
  }
}
function buildPalms(G, rng) {
  const scene = G.scene;
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8A6D3B });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2E9E5B });
  for (let i = 0; i < 90; i++) {
    const x = -340 + rng() * 680, z = -330 + rng() * 660;
    if (Math.abs(x) < 40 && Math.abs(z) < 40) continue;
    if (rng() > 0.55 && (Math.abs(x) < 320 && Math.abs(z) < 310)) continue;
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.y = 3.5; trunk.rotation.z = (rng() - 0.5) * 0.15;
    palm.add(trunk);
    for (let j = 0; j < 6; j++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (j / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.4, 7.2, Math.sin(a) * 1.4);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    scene.add(palm);
    G.palmTrees.push(palm);
  }
}
function buildLandmarks(G) {
  const scene = G.scene;
  // Lighthouse at Gull Point: white tower with a red top.
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 26, 10),
    new THREE.MeshLambertMaterial({ color: 0xF5F0E1 }));
  tower.position.set(300, 13, -280); scene.add(tower);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 10),
    new THREE.MeshLambertMaterial({ color: 0xC0392B }));
  lamp.position.set(300, 27, -280); scene.add(lamp);
  G.colliders.push({ x0: 295, z0: -285, x1: 305, z1: -275 });
  // The pier at Palm Quay: wooden planks out over the water.
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 70),
    new THREE.MeshLambertMaterial({ color: 0x8A6D3B }));
  pier.position.set(-290, 0.6, 275); scene.add(pier);
  // Airport strip: a long runway with a windsock and two small planes.
  const runway = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 220),
    new THREE.MeshLambertMaterial({ color: 0x2C3E50 }));
  runway.position.set(180, 0.4, -290); scene.add(runway);
  for (const px of [170, 195]) {
    const plane = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xEAF2F8 }));
    fus.rotation.x = Math.PI / 2; plane.add(fus);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 1.8),
      new THREE.MeshLambertMaterial({ color: 0x2E6FB0 }));
    plane.add(wing);
    plane.position.set(px, 1.2, -260); scene.add(plane);
  }
}
function buildBeachProps(G, rng) {
  const scene = G.scene;
  // Beach umbrellas and a few boats pulled up on the sand.
  const umbMat = new THREE.MeshLambertMaterial({ color: 0xE74C3C });
  for (let i = 0; i < 8; i++) {
    const x = -300 + i * 80, z = 320;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0xF5F0E1 }));
    pole.position.set(x, 1.5, z); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 8), umbMat);
    top.position.set(x, 3.2, z); scene.add(top);
  }
  for (let i = 0; i < 4; i++) {
    const boat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 6),
      new THREE.MeshLambertMaterial({ color: [0xEAF2F8, 0xF1C40F, 0x2E6FB0, 0xE67E22][i] }));
    boat.position.set(-280 + i * 30, 0.4, 300);
    boat.rotation.y = (rng() - 0.5) * 0.6;
    scene.add(boat);
  }
}
export function collideCircle(G, obj, radius) {
  // obj has .x/.z (a vehicle) or .position (a mesh). Push out of buildings.
  const px = obj.position ? obj.position.x : obj.x;
  const pz = obj.position ? obj.position.z : obj.z;
  for (const b of G.colliders) {
    const cx = clamp(px, b.x0, b.x1), cz = clamp(pz, b.z0, b.z1);
    const dx = px - cx, dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.01;
      const push = (radius - d) / d;
      const nx = px + dx * push, nz = pz + dz * push;
      if (obj.position) { obj.position.x = nx; obj.position.z = nz; }
      else { obj.x = nx; obj.z = nz; }
      if (obj.speed !== undefined) obj.speed *= 0.4;
      return true;
    }
  }
  return false;
}
export function keepOnIsland(G, obj) {
  const px = obj.position ? obj.position.x : obj.x;
  const pz = obj.position ? obj.position.z : obj.z;
  let nx = px, nz = pz;
  const onIsle = pz > 380 && pz < 530 && Math.abs(px) < 90;
  if (!onIsle) {
    nx = clamp(px, -345, 345);
    nz = clamp(pz, -340, 340);
    if (pz > 340 && pz < 380 && Math.abs(px) > 10) nz = 340;
  } else {
    nx = clamp(px, -85, 85);
    nz = clamp(pz, 385, 525);
  }
  if (obj.position) { obj.position.x = nx; obj.position.z = nz; }
  else { obj.x = nx; obj.z = nz; }
}
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (Math.abs(x - d.cx) < d.w / 2 && Math.abs(z - d.cz) < d.d / 2) return d.name;
  }
  if (z > 380) return 'Tern Isle';
  return 'Solmar Bay';
}
