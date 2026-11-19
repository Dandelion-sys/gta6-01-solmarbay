// The city of Solmar Bay: ground, sea, districts, roads, buildings, props.
import * as THREE from 'three';
import { PALETTE, DISTRICTS } from './config.js';

function boxMat(color) { return new THREE.MeshLambertMaterial({ color }); }
function box(w, h, d, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat(color));
  m.position.set(x, y, z); parent.add(m); return m;
}
function cone(r, h, color, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), boxMat(color));
  m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(rt, rb, h, color, x, y, z, parent, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10), boxMat(color));
  m.position.set(x, y, z); parent.add(m); return m;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // {x, z, r} circles the player cannot walk through
    this.buildings = [];
    this.palms = [];
    this.shops = [];
    this.roads = [];
    this.buildGround();
    this.buildSea();
    this.buildRoads();
    this.buildDistricts();
    this.buildLandmarks();
    this.buildProps();
    this.buildExtras();
    this.buildSky();
  }
  addCollider(x, z, r) { this.colliders.push({ x, z, r }); }
  buildGround() {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: PALETTE.grass }));
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, 0); this.scene.add(g);
    const sand = new THREE.Mesh(new THREE.RingGeometry(330, 360, 48), new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
    sand.rotation.x = -Math.PI / 2; sand.position.y = 0.05; this.scene.add(sand);
    const isle = new THREE.Mesh(new THREE.CylinderGeometry(46, 52, 3, 24), new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
    isle.position.set(-260, 0.5, -40); this.scene.add(isle);
    const isleGrass = new THREE.Mesh(new THREE.CylinderGeometry(38, 42, 1, 24), new THREE.MeshLambertMaterial({ color: PALETTE.grass }));
    isleGrass.position.set(-260, 2.2, -40); this.scene.add(isleGrass);
  }
  buildSea() {
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }));
    this.sea.rotation.x = -Math.PI / 2; this.sea.position.y = -0.4; this.scene.add(this.sea);
    const cause = box(10, 1.2, 90, 0x8a8f96, -215, 0.4, -40, this.scene);
    cause.name = 'causeway';
  }
  buildSky() {
    this.sun = new THREE.DirectionalLight(0xfff2cc, 2.2);
    this.sun.position.set(120, 180, 60); this.scene.add(this.sun);
    this.amb = new THREE.AmbientLight(0xbfd9ff, 0.9); this.scene.add(this.amb);
    const skyGeo = new THREE.SphereGeometry(900, 16, 12);
    this.skyMat = new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide, fog: false });
    this.sky = new THREE.Mesh(skyGeo, this.skyMat); this.scene.add(this.sky);
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(10 + Math.random() * 12, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
      c.position.set(-350 + Math.random() * 700, 90 + Math.random() * 60, -350 + Math.random() * 700);
      c.scale.y = 0.4; this.scene.add(c); this.clouds.push(c);
    }
  }
  buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
    const paveMat = new THREE.MeshLambertMaterial({ color: PALETTE.pavement });
    const mkRoad = (x, z, w, d) => {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(x, 0.08, z); this.scene.add(r);
      this.roads.push({ x, z, w, d });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w + 6, d + 6), paveMat);
      p.rotation.x = -Math.PI / 2; p.position.set(x, 0.04, z); this.scene.add(p);
    };
    mkRoad(0, 0, 16, 420); mkRoad(0, 0, 420, 16);
    mkRoad(-120, 60, 16, 260); mkRoad(120, -60, 16, 260);
    mkRoad(60, 120, 260, 16); mkRoad(-60, -120, 260, 16);
    mkRoad(170, -60, 16, 200); mkRoad(-160, -60, 200, 16);
    // centre dashes
    for (let i = -200; i < 200; i += 14) {
      const d1 = box(0.6, 0.05, 4, 0xffffff, 0, 0.12, i, this.scene);
      const d2 = box(4, 0.05, 0.6, 0xffffff, i, 0.12, 0, this.scene);
    }
  }
  buildDistricts() {
    // Coral Row towers
    const towerCols = [0x5a7fa8, 0x7fb2d9, 0x9a86c8, 0x6aa8a0];
    for (let i = 0; i < 14; i++) {
      const x = -70 + (i % 4) * 42 + (i % 2) * 8;
      const z = -70 + Math.floor(i / 4) * 42;
      if (Math.abs(x) < 14 || Math.abs(z) < 14) continue;
      const h = 34 + ((i * 37) % 60);
      const t = box(20, h, 20, towerCols[i % 4], x, h / 2, z, this.scene);
      box(22, 2, 22, 0x2c3e50, x, h + 1, z, this.scene);
      this.addCollider(x, z, 15); this.buildings.push(t);
    }
    // Suburban houses in Sunset Fields
    const roofs = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC];
    for (let i = 0; i < 22; i++) {
      const x = 95 + (i % 6) * 22; const z = 75 + Math.floor(i / 6) * 24;
      box(12, 6, 10, 0xf2e6c9, x, 3, z, this.scene);
      cone(9, 4, roofs[i % 3], x, 8, z, this.scene);
      this.addCollider(x, z, 9);
    }
    // Warehouses in North Docks
    for (let i = 0; i < 8; i++) {
      const x = -120 + i * 26; const z = -195;
      box(20, 10, 16, i % 2 ? 0x7a6a55 : 0x556270, x, 5, z, this.scene);
      this.addCollider(x, z, 14);
    }
    // Containers
    const contCols = [0xc23b3b, 0x2b6fd6, 0xe8a13a, 0x3f8f3a];
    for (let i = 0; i < 16; i++) {
      box(8, 3, 3, contCols[i % 4], -150 + (i % 8) * 12, 1.6, -170 + Math.floor(i / 8) * 8, this.scene);
    }
    // Swamp huts in Mangrove Flats
    for (let i = 0; i < 6; i++) {
      const x = -180 + i * 18; const z = -120 - (i % 2) * 14;
      cyl(1, 1, 5, 0x6b4a2f, x - 4, 2.5, z, this.scene);
      box(9, 4, 8, 0x8a6f4d, x, 4, z, this.scene);
      cone(7, 3, 0x5a4632, x, 7.5, z, this.scene);
      this.addCollider(x, z, 7);
    }
  }
  buildLandmarks() {
    // Lighthouse at Gull Point
    cyl(4, 6, 34, 0xffffff, 185, 17, -165, this.scene);
    cyl(3, 3, 4, 0xff2222, 185, 36, -165, this.scene);
    this.lighthouseTop = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    this.lighthouseTop.position.set(185, 38, -165); this.scene.add(this.lighthouseTop);
    this.addCollider(185, -165, 8);
    // Casino Marina Royale
    box(34, 18, 24, 0xd4af37, 45, 9, -35, this.scene);
    box(36, 3, 26, 0x8e44ad, 45, 19.5, -35, this.scene);
    this.addCollider(45, -35, 22);
    this.shops.push({ name: 'Marina Royale Casino', x: 45, z: -35, kind: 'casino', price: 0 });
    // Bar The Brass Anchor
    box(16, 7, 12, 0x8a5a2b, -140, 3.5, 120, this.scene);
    this.addCollider(-140, 120, 10);
    this.shops.push({ name: 'The Brass Anchor Bar', x: -140, z: 120, kind: 'bar', price: 0 });
    // Harbor Motors dealer
    box(26, 8, 18, 0x2b6fd6, -30, 4, 55, this.scene);
    this.shops.push({ name: 'Harbor Motors', x: -30, z: 55, kind: 'cars', price: 0 });
    // Gull and Gun weapons
    box(14, 6, 10, 0x3a3a3a, 25, 3, 40, this.scene);
    this.shops.push({ name: 'Gull and Gun', x: 25, z: 40, kind: 'weapons', price: 0 });
    // Tide and Thread clothing
    box(14, 6, 10, 0xe87aa8, 55, 3, 20, this.scene);
    this.shops.push({ name: 'Tide and Thread', x: 55, z: 20, kind: 'clothes', price: 0 });
    // Bay Mart general store + safehouse above it
    box(18, 7, 14, 0x3f8f3a, -10, 3.5, 75, this.scene);
    box(14, 5, 12, 0xf2e6c9, -10, 9.5, 75, this.scene);
    this.shops.push({ name: 'Bay Mart', x: -10, z: 75, kind: 'store', price: 0 });
    this.shops.push({ name: 'Safehouse (your apartment)', x: -10, z: 75, kind: 'safehouse', price: 0 });
    // Hospital, police station, gym, pool hall
    box(24, 16, 18, 0xffffff, -45, 8, -45, this.scene);
    box(26, 3, 20, 0xff5555, -45, 17.5, -45, this.scene);
    this.shops.push({ name: 'Coral General Hospital', x: -45, z: -45, kind: 'hospital', price: 0 });
    box(18, 9, 14, 0x2c3e50, 70, 4.5, -60, this.scene);
    this.shops.push({ name: 'Coral Row Police Station', x: 70, z: -60, kind: 'police', price: 0 });
    box(16, 7, 12, 0x8a2f2f, 120, 3.5, 90, this.scene);
    this.shops.push({ name: 'Iron Tide Boxing Gym', x: 120, z: 90, kind: 'gym', price: 0 });
    box(15, 6, 11, 0x2f6b4f, 100, 3, 140, this.scene);
    this.shops.push({ name: 'The Break Room Pool Hall', x: 100, z: 140, kind: 'pool', price: 0 });
    // Stables
    box(18, 5, 10, 0x7a5230, 170, 2.5, 150, this.scene);
    this.shops.push({ name: 'Sunset Stables', x: 170, z: 150, kind: 'stables', price: 0 });
    // Airport strip
    const strip = box(8, 0.3, 160, 0x222222, 60, 0.15, -195, this.scene);
    this.shops.push({ name: 'North Docks Airstrip', x: 60, z: -195, kind: 'airport', price: 0 });
    // Ferry terminal + pier at Palm Quay
    box(40, 1, 6, 0x8a6f4d, -160, 0.6, 165, this.scene);
    box(6, 1, 40, 0x8a6f4d, -180, 0.6, 185, this.scene);
    // Tern Isle cottage
    box(10, 5, 8, 0xf2e6c9, -260, 4.5, -40, this.scene);
    cone(7, 3, PALETTE.roofA, -260, 8.5, -40, this.scene);
    this.addCollider(-260, -40, 8);
    // Cranes
    for (let i = 0; i < 3; i++) {
      cyl(1.5, 2, 30, 0xe8a13a, -90 + i * 40, 15, -205, this.scene);
      box(18, 2, 2, 0xe8a13a, -90 + i * 40, 29, -205, this.scene);
    }
  }
  buildProps() {
    // Palm trees along the boardwalk and streets
    for (let i = 0; i < 46; i++) {
      const x = -220 + Math.random() * 440; const z = -220 + Math.random() * 440;
      if (Math.abs(x) < 12 || Math.abs(z) < 12) continue;
      if (Math.hypot(x, z) > 240) continue;
      cyl(0.35, 0.5, 7, PALETTE.trunk, x, 3.5, z, this.scene, 6);
      const top = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), boxMat(PALETTE.leaf));
      top.position.set(x, 7.6, z); top.scale.y = 0.6; this.scene.add(top);
      this.palms.push(top);
    }
    // Benches, stalls, basketball court
    for (let i = 0; i < 10; i++) box(3, 1, 1, 0x8a6f4d, -150 + i * 4, 0.5, 150, this.scene);
    box(30, 0.4, 16, 0x2b6fd6, 140, 0.2, 110, this.scene);
    cyl(0.4, 0.4, 4, 0xe8a13a, 140, 2, 110, this.scene, 8);
    // Buoys and boats
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), boxMat(i % 2 ? 0xff5533 : 0xffffff));
      b.position.set(-300 + i * 40, 0.2, 220 + (i % 3) * 30); this.scene.add(b);
    }
    for (let i = 0; i < 5; i++) {
      const hull = box(10, 2, 4, 0xffffff, -200 + i * 30, 0.6, 190, this.scene);
      box(4, 3, 3, 0x2b6fd6, -200 + i * 30, 3, 190, this.scene);
    }
    // Reeds in the swamp
    for (let i = 0; i < 40; i++) {
      const x = -200 + Math.random() * 90; const z = -170 + Math.random() * 70;
      cyl(0.12, 0.2, 3 + Math.random() * 2, 0x4a7a3a, x, 1.8, z, this.scene, 5);
    }
    // Swamp water pools
    const pool = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshLambertMaterial({ color: 0x2a6a5a }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(-165, 0.12, -135); this.scene.add(pool);
  }
  update(dt, timeOfDay, weather) {
    // Sea bobbing
    this.sea.position.y = -0.4 + Math.sin(performance.now() * 0.0006) * 0.25;
    for (const c of this.clouds) { c.position.x += dt * (weather === 'storm' ? 14 : 2); if (c.position.x > 380) c.position.x = -380; }
    const t = timeOfDay; // 0..24
    const sunH = Math.sin((t - 6) / 12 * Math.PI);
    const day = Math.max(0, Math.min(1, sunH));
    const dusk = (t > 16.5 && t < 19.5) ? 1 - Math.abs(t - 18) / 1.5 : 0;
    this.sun.intensity = 0.25 + day * 2.0;
    this.sun.position.set(Math.cos((t / 24) * Math.PI * 2) * 160, 60 + day * 140, 80);
    this.amb.intensity = 0.35 + day * 0.6;
    const skyCol = new THREE.Color().setHSL(0.58, 0.6, 0.25 + day * 0.45 - dusk * 0.1);
    if (dusk > 0) skyCol.lerp(new THREE.Color(0xff8c42), dusk * 0.55);
    if (weather === 'rain' || weather === 'storm') skyCol.lerp(new THREE.Color(0x5a6a78), 0.5);
    this.skyMat.color.copy(skyCol);
    this.sea.material.color.setHex(weather === 'storm' ? 0x14506e : 0x1e7fa8);
    if (this.lighthouseTop) this.lighthouseTop.material.color.setHex(day > 0.3 ? 0xffe27a : 0xff3333);
  }
  districtAt(x, z) {
    let best = DISTRICTS[0]; let bd = 1e9;
    for (const d of DISTRICTS) { const dd = Math.hypot(x - d.cx, z - d.cz); if (dd < bd) { bd = dd; best = d; } }
    return best;
  }
  buildExtras() {
    // Cinema in Coral Row
    box(22, 12, 16, 0x6a1b9a, 80, 6, 40, this.scene);
    box(24, 2, 18, 0xffd23e, 80, 13, 40, this.scene);
    this.shops.push({ name: 'Bayview Cinema', x: 80, z: 40, kind: 'cinema', price: 0 });
    // Market stalls along the boardwalk
    const stallCols = [0xe87aa8, 0x7fc4e8, 0xe8b93e, 0x3f8f3a];
    for (let i = 0; i < 8; i++) {
      const x = -170 + i * 8;
      box(5, 3, 4, stallCols[i % 4], x, 1.5, 140, this.scene);
      cone(4, 2, 0xffffff, x, 4, 140, this.scene);
    }
    // Beach umbrellas and towels on the south beach
    for (let i = 0; i < 7; i++) {
      const x = -120 + i * 36; const z = 250;
      cyl(0.15, 0.15, 3, 0x8a6f4d, x, 1.5, z, this.scene, 6);
      cone(3, 1.4, i % 2 ? 0xff5533 : 0x2b6fd6, x, 3.4, z, this.scene);
      box(3, 0.2, 1.6, i % 2 ? 0xffe27a : 0x9fe8ff, x + 3, 0.2, z + 2, this.scene);
    }
    // Small planes parked at the airstrip
    for (let i = 0; i < 3; i++) {
      const x = 52 + i * 6; const z = -185 + i * 8;
      box(2, 1, 8, 0xffffff, x, 1, z, this.scene);
      box(7, 0.4, 1.4, 0xffffff, x, 1.2, z + 1, this.scene);
      box(1.6, 1.6, 2, 0x2b6fd6, x, 1.8, z - 1, this.scene);
    }
    // Kayaks on the beach rack
    for (let i = 0; i < 4; i++) {
      const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 3, 4, 8), boxMat(i % 2 ? 0xe8a13a : 0x2fae8f));
      k.rotation.z = Math.PI / 2; k.position.set(-140 + i * 5, 1, 235); this.scene.add(k);
    }
    // Airboats in the swamp
    for (let i = 0; i < 3; i++) {
      box(5, 1.4, 2.4, 0x3f8f3a, -170 + i * 14, 0.8, -120, this.scene);
      cyl(0.1, 1.2, 1.6, 0x888888, -170 + i * 14, 2.2, -120, this.scene, 8);
    }
    // Bus stops with shelters
    for (const [x, z] of [[-8, 30], [30, -8], [-120, 8], [8, 120]]) {
      box(5, 0.3, 2, 0x2b6fd6, x, 3, z, this.scene);
      for (const dx of [-2.2, 2.2]) cyl(0.12, 0.12, 3, 0x555555, x + dx, 1.5, z, this.scene, 6);
      box(5, 1, 0.3, 0x9aa0a6, x, 0.8, z, this.scene);
    }
    // Viewpoint platform at Gull Point
    cyl(6, 7, 2, 0x8a8f96, 178, 1, -150, this.scene, 12);
    box(8, 1, 0.4, 0xc98a3a, 178, 2.4, -144, this.scene);
    // Park fountain in Sunset Fields
    cyl(4, 4, 1, 0x9fc4e8, 140, 0.5, 130, this.scene, 16);
    cyl(0.6, 0.8, 3, 0xffffff, 140, 1.5, 130, this.scene, 8);
    // Deer crossing sign, bus stop signs, lamps along the main road
    for (let i = -180; i <= 180; i += 40) {
      cyl(0.1, 0.1, 5, 0x333333, 10, 2.5, i, this.scene, 6);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
      lamp.position.set(10, 5, i); this.scene.add(lamp);
    }
  }
}
