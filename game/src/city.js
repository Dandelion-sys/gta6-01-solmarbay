// Solmar Bay city: one continuous island, seven districts, roads, beach,
// pier, lighthouse, and every place the player can use. All geometry is
// simple flat-shaded boxes and cylinders with strong colours.
import * as THREE from 'three';
import { COLOURS, DISTRICTS } from './tuning.js';

function box(w, h, d, colour, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: colour }));
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, colour, x, y, z, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 10),
    new THREE.MeshLambertMaterial({ color: colour }));
  m.position.set(x, y, z);
  return m;
}
export function makePalm(x, z, s) {
  const g = new THREE.Group();
  g.add(cyl(0.18 * s, 0.28 * s, 5 * s, COLOURS.palmTrunk, 0, 2.5 * s, 0, 7));
  for (let i = 0; i < 6; i++) {
    const leaf = box(0.5 * s, 0.08 * s, 2.6 * s, COLOURS.palmLeaf, 0, 5.1 * s, 0);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1 * s, 5.1 * s, Math.sin(a) * 1.1 * s);
    leaf.rotation.y = -a; leaf.rotation.z = 0.35;
    g.add(leaf);
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.35 * s, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2a })));
  g.children[7].position.set(0, 4.9 * s, 0);
  g.position.set(x, 0, z);
  return g;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.buildingBoxes = []; // {x, z, hx, hz} for collision
    this.shops = [];         // interactable places
    this.parkedSpots = [];   // {x, z, heading}
    this.landmarks = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._ground();
    this._roads();
    this._districts();
    this._beachAndPier();
    this._lighthouse();
    this._palms();
    this._parkedCars();
    this._streetProps();
  }
  _ground() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(980, 980),
      new THREE.MeshLambertMaterial({ color: COLOURS.grass }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    this.group.add(ground);
    const sand = new THREE.Mesh(new THREE.RingGeometry(430, 470, 48),
      new THREE.MeshLambertMaterial({ color: COLOURS.sand }));
    sand.rotation.x = -Math.PI / 2; sand.position.y = 0.02;
    this.group.add(sand);
  }
  _roads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: COLOURS.road });
    const lineMat = new THREE.MeshLambertMaterial({ color: COLOURS.roadLine });
    for (let i = -3; i <= 3; i++) {
      const c = i * 120;
      const h = new THREE.Mesh(new THREE.PlaneGeometry(860, 14), roadMat);
      h.rotation.x = -Math.PI / 2; h.position.set(0, 0.05, c);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(14, 860), roadMat);
      v.rotation.x = -Math.PI / 2; v.position.set(c, 0.05, 0);
      this.group.add(h, v);
      for (let k = -7; k <= 7; k++) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.7), lineMat);
        dash.rotation.x = -Math.PI / 2; dash.position.set(k * 60, 0.08, c);
        const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 6), lineMat);
        dash2.rotation.x = -Math.PI / 2; dash2.position.set(c, 0.08, k * 60);
        this.group.add(dash, dash2);
      }
    }
    // Causeway to Tern Isle.
    const cause = new THREE.Mesh(new THREE.PlaneGeometry(26, 220), roadMat);
    cause.rotation.x = -Math.PI / 2; cause.rotation.z = Math.PI / 4;
    cause.position.set(360, 0.06, 360);
    this.group.add(cause);
  }

  _addBuilding(x, z, w, h, d, wall, roof, kind, label) {
    const b = box(w, h, d, wall, x, h / 2, z);
    this.group.add(b);
    const r = box(w + 0.6, 0.8, d + 0.6, roof, x, h + 0.4, z);
    this.group.add(r);
    // Lit windows: small bright boxes on the front face.
    const winMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0x554411 });
    const cols = Math.max(2, Math.floor(w / 7)), rows = Math.max(2, Math.floor(h / 7));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if ((i * 7 + j * 3) % 3 === 0) continue;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), winMat);
      win.position.set(x - w / 2 + 3 + i * ((w - 6) / Math.max(1, cols - 1)), 3 + j * ((h - 6) / Math.max(1, rows - 1)), z + d / 2 + 0.06);
      this.group.add(win);
    }
    this.buildingBoxes.push({ x, z, hx: w / 2 + 0.4, hz: d / 2 + 0.4 });
    if (kind) this.shops.push({ name: label || kind, kind, x, z, w, h, d });
    return b;
  }
  _districts() {
    // Coral Row towers.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const x = 60 + Math.cos(a) * (60 + (i % 3) * 34);
      const z = 40 + Math.sin(a) * (60 + (i % 2) * 30);
      const h = 34 + ((i * 37) % 60);
      this._addBuilding(x, z, 22, h, 22, 0x8fb8d8, 0x2e5f8a, null);
    }
    // Palm Quay low blocks and the bar.
    for (let i = 0; i < 8; i++) {
      this._addBuilding(-300 + (i % 4) * 46, 220 + Math.floor(i / 4) * 60, 26, 12 + (i % 3) * 4, 20, 0xf2c14e, 0xd94f3d, null);
    }
    // Sunset Fields houses.
    for (let i = 0; i < 12; i++) {
      const x = -340 + (i % 4) * 44, z = -300 + Math.floor(i / 4) * 44;
      this._addBuilding(x, z, 16, 7, 14, 0xf7d9a0, 0xc96f4a, null);
    }
    // North Docks warehouses.
    for (let i = 0; i < 6; i++) {
      this._addBuilding(-120 + i * 52, -330, 40, 14, 26, 0x9aa5ad, 0x5b6b73, null);
    }
    // Named places the player can use.
    this._addBuilding(-262, 262, 30, 12, 22, 0xe8a34c, 0x7a3b1e, 'bar', 'The Brass Anchor');
    this._addBuilding(96, 10, 46, 26, 34, 0xd8b25a, 0x8a1f3d, 'casino', 'Marina Royale');
    this._addBuilding(150, -20, 34, 12, 24, 0x5a8fd8, 0x1f4a6e, 'dealer', 'Harbor Motors');
    this._addBuilding(30, 150, 24, 10, 18, 0x7a5a8a, 0x3d2a4a, 'gunshop', 'Gull and Gun');
    this._addBuilding(-40, 130, 24, 10, 18, 0x4a9e8a, 0x2a5a4a, 'clothes', 'Tide and Thread');
    this._addBuilding(-120, 60, 28, 11, 20, 0xd85a5a, 0x6e1f1f, 'store', 'Bay Mart');
    this._addBuilding(-120, 96, 22, 14, 16, 0xf0dcb0, 0xc96f4a, 'safehouse', 'Safehouse');
    this._addBuilding(180, 90, 30, 12, 22, 0xf5f0e6, 0x9a2a2a, 'hospital', 'Coral General Hospital');
    this._addBuilding(120, 130, 30, 12, 22, 0x2a3a5a, 0x1c2733, 'police', 'Bay Police Station');
    this._addBuilding(-300, -180, 26, 10, 18, 0xc9a06a, 0x5a3a1a, 'stable', 'Sunset Stables');
    this._addBuilding(-180, 200, 24, 10, 18, 0x3a6a8a, 0x1a3a4a, 'pool', 'The Break Room');
    this._addBuilding(-220, -60, 26, 10, 20, 0x8a3a3a, 0x4a1a1a, 'gym', 'Iron Tide Gym');
    // Shipping containers at the docks.
    const contCols = [0xd93a2b, 0x2b6fd9, 0xf2c14e, 0x2ed573];
    for (let i = 0; i < 10; i++) {
      this.group.add(box(12, 3, 3, contCols[i % 4], -160 + (i % 5) * 16, 1.5, -290 + Math.floor(i / 5) * 8));
    }
    // Cranes.
    for (let i = 0; i < 3; i++) {
      const x = -200 + i * 70;
      this.group.add(cyl(1.2, 1.6, 34, 0xf2c14e, x, 17, -360, 8));
      this.group.add(box(26, 2, 2, 0xf2c14e, x + 8, 33, -360));
    }
  }

  _beachAndPier() {
    // Pier at Palm Quay reaching into the bay.
    for (let i = 0; i < 10; i++) {
      this.group.add(box(8, 0.6, 7, 0x8a6b45, -262, 0.6, 330 + i * 7));
    }
    for (let i = 0; i < 4; i++) {
      this.group.add(box(3, 3, 3, 0xf5f0e6, -258 + i * 2, 2.2, 392));
    }
    // Boats in the marina.
    for (let i = 0; i < 6; i++) {
      const boat = new THREE.Group();
      boat.add(box(3, 1.2, 8, 0xf5f0e6, 0, 0.6, 0));
      boat.add(box(1.6, 2, 2.4, 0x2b6fd9, 0, 1.8, -1));
      boat.position.set(-300 + i * 18, -0.2, 400 + (i % 2) * 14);
      boat.rotation.y = (i % 3) * 0.4;
      this.group.add(boat);
    }
    // Basketball court in Sunset Fields.
    const court = new THREE.Mesh(new THREE.PlaneGeometry(26, 15),
      new THREE.MeshLambertMaterial({ color: 0x2a6db0 }));
    court.rotation.x = -Math.PI / 2; court.position.set(-240, 0.07, -220);
    this.group.add(court);
    this.group.add(cyl(0.15, 0.15, 4, 0xd93a2b, -228, 2, -220, 6));
    // Airport strip at North Docks.
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(200, 18),
      new THREE.MeshLambertMaterial({ color: 0x4a4f55 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(120, 0.06, -380);
    this.group.add(strip);
    const plane = new THREE.Group();
    plane.add(cyl(0.9, 0.9, 9, 0xf5f0e6, 0, 1, 0, 8));
    plane.children[0].rotation.x = Math.PI / 2;
    plane.add(box(11, 0.25, 1.8, 0xd93a2b, 0, 1, 0));
    plane.position.set(120, 0.5, -380);
    this.group.add(plane);
  }
  _lighthouse() {
    const g = new THREE.Group();
    g.add(cyl(4, 5.5, 26, 0xf5f0e6, 0, 13, 0, 12));
    g.add(cyl(4.2, 4.2, 3, 0xd93a2b, 0, 8, 0, 12));
    g.add(cyl(4.2, 4.2, 3, 0xd93a2b, 0, 18, 0, 12));
    g.add(cyl(2.6, 2.6, 4, 0x2a2a2a, 0, 28, 0, 10));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    beam.rotation.z = Math.PI / 2; beam.position.set(22, 28, 0);
    beam.name = 'lighthouse-beam';
    g.add(beam);
    g.position.set(330, 0, -330);
    this.group.add(g);
    this.landmarks.push({ name: 'Gull Point Lighthouse', x: 330, z: -330 });
    // Tern Isle cottage.
    this._addBuilding(430, 430, 14, 7, 12, 0xf5e6c8, 0x3d7ea6, null);
    this.landmarks.push({ name: 'Tern Isle', x: 430, z: 430 });
  }
  _palms() {
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + (i % 5) * 0.13;
      const r = 425 + ((i * 29) % 30);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.group.add(makePalm(x, z, 0.9 + ((i * 13) % 10) / 18));
    }
    for (let i = 0; i < 24; i++) {
      const x = -360 + ((i * 53) % 700), z = -360 + ((i * 97) % 700);
      if (Math.abs(x % 120) < 12 || Math.abs(z % 120) < 12) continue;
      this.group.add(makePalm(x, z, 1));
    }
  }
  _parkedCars() {
    const spots = [
      [-100, 40, 0], [-80, 40, 0], [40, 60, 1.57], [60, 60, 1.57],
      [-140, 80, 0], [170, 0, 0], [130, 110, 1.57], [-260, 300, 0],
      [-200, -140, 0], [200, 140, 1.57], [-60, -100, 0], [90, -60, 1.57],
      [-280, -220, 0], [320, 240, 1.57], [0, -200, 0], [240, -260, 0],
    ];
    for (const [x, z, h] of spots) this.parkedSpots.push({ x, z, heading: h });
  }
  // Push a circle (player or car) out of every building box.
  collideBuildings(x, z, radius) {
    let nx = x, nz = z;
    for (const b of this.buildingBoxes) {
      const cx = Math.max(b.x - b.hx, Math.min(nx, b.x + b.hx));
      const cz = Math.max(b.z - b.hz, Math.min(nz, b.z + b.hz));
      const dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * radius; nz = cz + (dz / d) * radius;
        } else {
          nx = b.x + (b.hx + radius) * (nx >= b.x ? 1 : -1);
        }
      }
    }
    return { x: nx, z: nz };
  }

  _streetProps() {
    // Street lamps along the main roads.
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let i = -3; i <= 3; i++) {
      for (let k = -2; k <= 2; k++) {
        const x = i * 120 + 9, z = k * 120;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), lampMat);
        pole.position.set(x, 3, z);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), glowMat);
        lamp.position.set(x, 6.1, z);
        this.group.add(pole, lamp);
      }
    }
    // Market stalls on the Palm Quay boardwalk.
    const stallCols = [0xd93a2b, 0x2b6fd9, 0xf2c14e, 0x2ed573];
    for (let i = 0; i < 8; i++) {
      const x = -290 + i * 12, z = 300;
      this.group.add(box(4, 1, 3, 0x8a6b45, x, 0.5, z));
      const roof = box(4.6, 0.15, 3.6, stallCols[i % 4], x, 2.6, z);
      roof.rotation.z = 0.08;
      this.group.add(roof);
      this.group.add(cyl(0.08, 0.08, 2.4, 0x5a5a5a, x - 2, 1.4, z - 1.5, 6));
      this.group.add(cyl(0.08, 0.08, 2.4, 0x5a5a5a, x + 2, 1.4, z - 1.5, 6));
    }
    // Benches and bins in the park.
    for (let i = 0; i < 6; i++) {
      const x = -260 + (i % 3) * 20, z = -200 + Math.floor(i / 3) * 16;
      this.group.add(box(3, 0.15, 0.8, 0x8a6b45, x, 0.5, z));
      this.group.add(box(0.2, 0.5, 0.8, 0x5a5a5a, x - 1.3, 0.25, z));
      this.group.add(box(0.2, 0.5, 0.8, 0x5a5a5a, x + 1.3, 0.25, z));
      this.group.add(cyl(0.4, 0.35, 0.9, 0x3a6a3a, x + 4, 0.45, z, 8));
    }
    // Billboards over Coral Row.
    const ads = ['SOLMAR BAY', 'MARINA ROYALE', 'HARBOR MOTORS', 'TIDE & THREAD'];
    for (let i = 0; i < 4; i++) {
      const board = box(16, 5, 0.6, 0x1c2733, -60 + i * 60, 22, 170);
      this.group.add(board);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(15, 4.4),
        new THREE.MeshBasicMaterial({ color: [0xffd23f, 0xd93a2b, 0x2b6fd9, 0x2ed573][i] }));
      face.position.set(-60 + i * 60, 22, 170.35);
      this.group.add(face);
      this.landmarks.push({ name: ads[i], x: -60 + i * 60, z: 170 });
    }
    // Ferry at the terminal.
    const ferry = new THREE.Group();
    ferry.add(box(8, 3, 22, 0xf5f0e6, 0, 1.5, 0));
    ferry.add(box(5, 3, 8, 0x2b6fd9, 0, 4.5, -4));
    ferry.add(box(7, 0.8, 20, 0x2a7fa8, 0, 3.2, 0));
    ferry.position.set(-240, -0.2, 410);
    this.group.add(ferry);
    this.landmarks.push({ name: 'Ferry Terminal', x: -240, z: 410 });
    // Horses at the Sunset Stables.
    const horseMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
    for (let i = 0; i < 3; i++) {
      const horse = new THREE.Group();
      horse.add(box(1.8, 0.8, 0.7, 0x6b4a2a, 0, 1.1, 0));
      horse.add(box(0.5, 0.9, 0.5, 0x6b4a2a, 0.95, 1.7, 0));
      horse.children[0].material = horseMat;
      horse.position.set(-306 + i * 8, 0, -176);
      this.group.add(horse);
    }
    // Traffic lights at the downtown crossings.
    for (const [x, z] of [[0, 0], [120, 120], [-120, 120], [120, -120]]) {
      this.group.add(cyl(0.15, 0.15, 5, 0x2a2a2a, x + 8, 2.5, z + 8, 6));
      this.group.add(box(0.7, 1.8, 0.5, 0x1a1a1a, x + 8, 5.6, z + 8));
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x2ed573 }));
      light.position.set(x + 8, 6.1, z + 8.3);
      this.group.add(light);
    }
  }
}
