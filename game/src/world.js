// The city of Solmar Bay: island ground, sea, roads, districts, landmarks,
// weather and the day/night sky. Geometry is simple flat-shaded boxes and
// cones so the skyline reads from anywhere and runs on modest hardware.
import * as THREE from 'three';
import { WORLD, COLOURS, DISTRICTS, PLACES } from './config.js';
import { makeRng, range, clamp, lerp } from './rng.js';

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.colliders = [];
    this.buildings = [];
    this.palms = [];
    this.roadLines = [];
    this.weather = 'clear';
    this.weatherTimer = 90;
    this.rainDrops = [];
    this.lights = [];
    this.hour = WORLD.startHour;
    this.buildGround();
    this.buildSea();
    this.buildRoads();
    this.buildDistricts();
    this.buildLandmarks();
    this.buildPalms();
    this.buildRain();
    this.sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
    this.sun.position.set(200, 300, 100);
    scene.add(this.sun);
    this.ambient = new THREE.AmbientLight(0xbfd9ff, 0.9);
    scene.add(this.ambient);
    this.skyMesh = null;
  }
  mat(colour, rough) {
    return new THREE.MeshLambertMaterial({ color: colour, roughness: rough || 0.9 });
  }
  box(w, h, d, colour, x, y, z, collide) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(colour));
    m.position.set(x, y, z);
    this.scene.add(m);
    if (collide !== false) this.colliders.push({ x, z, hw: w / 2, hd: d / 2, h });
    return m;
  }
  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.size * 1.7, WORLD.size * 1.7),
      this.mat(COLOURS.grass));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);
    const beach = new THREE.Mesh(
      new THREE.RingGeometry(WORLD.half - 30, WORLD.half + 42, 48),
      this.mat(COLOURS.sand));
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.05;
    this.scene.add(beach);
    const island = new THREE.Mesh(
      new THREE.CircleGeometry(110, 24),
      this.mat(COLOURS.sand));
    island.rotation.x = -Math.PI / 2;
    island.position.set(-120, 0.05, 560);
    this.scene.add(island);
  }
  buildSea() {
    this.sea = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, 2600),
      new THREE.MeshLambertMaterial({ color: COLOURS.seaDay, transparent: true, opacity: 0.92 }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = WORLD.seaLevel;
    this.scene.add(this.sea);
  }
  buildRoads() {
    const rng = this.rng;
    const roadMat = this.mat(COLOURS.road);
    const paveMat = this.mat(COLOURS.pavement);
    const lines = [-340, -220, -110, 0, 110, 220, 340];
    for (const x of lines) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth, WORLD.size), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(x, 0.08, 0); this.scene.add(r);
      this.roadLines.push({ x1: x, z1: -WORLD.half, x2: x, z2: WORLD.half });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.roadWidth + 10, WORLD.size), paveMat);
      p.rotation.x = -Math.PI / 2; p.position.set(x, 0.04, 0); this.scene.add(p);
    }
    for (const z of lines) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, WORLD.roadWidth), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(0, 0.08, z); this.scene.add(r);
      this.roadLines.push({ x1: -WORLD.half, z1: z, x2: WORLD.half, z2: z });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size, WORLD.roadWidth + 10), paveMat);
      p.rotation.x = -Math.PI / 2; p.position.set(0, 0.04, z); this.scene.add(p);
    }
    // Causeway to Tern Isle
    const cause = new THREE.Mesh(new THREE.PlaneGeometry(16, 180), roadMat);
    cause.rotation.x = -Math.PI / 2; cause.position.set(-120, 0.1, 480); this.scene.add(cause);
    this.roadLines.push({ x1: -120, z1: 400, x2: -120, z2: 560 });
    // Road centre dashes
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (const x of lines) {
      for (let z = -440; z < 440; z += 28) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 7), dashMat);
        d.rotation.x = -Math.PI / 2; d.position.set(x, 0.12, z); this.scene.add(d);
      }
    }
    for (const z of lines) {
      for (let x = -440; x < 440; x += 28) {
        const d = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.7), dashMat);
        d.rotation.x = -Math.PI / 2; d.position.set(x, 0.12, z); this.scene.add(d);
      }
    }
    void rng;
  }
  buildDistricts() {
    const rng = this.rng;
    const palette = [COLOURS.buildingGlass, COLOURS.buildingBrick, COLOURS.buildingCream,
      COLOURS.buildingWhite, 0xd8a0b8, 0x8fb8c8, 0xe8c860];
    for (const d of DISTRICTS) {
      if (d.tag === 'island') continue;
      const count = d.tag === 'downtown' ? 26 : d.tag === 'industrial' ? 16 : 14;
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * (d.r - 25);
        const x = d.cx + Math.cos(a) * rr;
        const z = d.cz + Math.sin(a) * rr;
        if (Math.abs(x % 110) < 14 || Math.abs(z % 110) < 14) continue;
        if (Math.abs(x) > WORLD.half - 30 || Math.abs(z) > WORLD.half - 30) continue;
        const w = range(rng, 16, 34);
        const dep = range(rng, 16, 30);
        const tall = d.tag === 'downtown' ? range(rng, 30, 110) : d.tag === 'suburb' ? range(rng, 6, 12) : range(rng, 10, 26);
        const colour = pick(rng, palette);
        const b = this.box(w, tall, dep, colour, x, tall / 2, z, true);
        this.buildings.push({ mesh: b, x, z, w, h: tall, d: dep, district: d.name });
        const roofCol = pick(rng, [COLOURS.roofRed, COLOURS.roofTeal, COLOURS.roofGold, 0x555c66]);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, dep + 1), this.mat(roofCol));
        roof.position.set(x, tall + 0.6, z);
        this.scene.add(roof);
        if (d.tag === 'downtown' && rng() < 0.5) {
          const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, tall * 0.5, 0.4),
            new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
          glow.position.set(x, tall * 0.55, z + dep / 2 + 0.3);
          this.scene.add(glow);
        }
      }
    }
  }
  buildLandmarks() {
    // Lighthouse at Gull Point
    const lh = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 42, 10),
      this.mat(0xf5f0e0));
    tower.position.y = 21; lh.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 4, 10), this.mat(0xc0392b));
    band.position.y = 30; lh.add(band);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 5, 10), this.mat(0x222831));
    top.position.y = 44; lh.add(top);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(3, 30, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.35 }));
    beam.rotation.z = Math.PI / 2; beam.position.set(17, 44, 0); lh.add(beam);
    this.beacon = beam;
    lh.position.set(-380, 0, -360);
    this.scene.add(lh);
    this.colliders.push({ x: -380, z: -360, hw: 8, hd: 8, h: 46 });
    // Tern Isle cottage + small lighthouse
    this.box(14, 8, 12, COLOURS.buildingCream, -120, 4, 560, true);
    const mini = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 18, 8), this.mat(0xffffff));
    mini.position.set(-95, 9, 545); this.scene.add(mini);
    this.colliders.push({ x: -95, z: 545, hw: 4, hd: 4, h: 18 });
    // Piers and boardwalk
    this.buildPier(-380, 330, 90, 0);
    this.buildPier(-280, 380, 70, Math.PI / 2);
    // Airport strip
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(26, 220), this.mat(0x2c313a));
    strip.rotation.x = -Math.PI / 2; strip.position.set(60, 0.09, -400); this.scene.add(strip);
    // Cranes at North Docks
    for (let i = 0; i < 3; i++) {
      const cx = -60 + i * 70;
      this.box(6, 42, 6, 0xd9a441, cx, 21, -360, true);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(46, 3, 3), this.mat(0xd9a441));
      arm.position.set(cx + 18, 40, -360); this.scene.add(arm);
    }
    // Containers
    const rng = this.rng;
    for (let i = 0; i < 14; i++) {
      const x = range(rng, -140, 160), z = range(rng, -420, -300);
      this.box(12, 3, 3.4, pick(rng, [0xc0392b, 0x2471a3, 0x1e8449, 0xd4ac0d]), x, 1.5, z, true);
    }
    // Shop fronts: named places get a coloured awning box
    const shopCols = { bar: 0x8b5a2b, casino: 0xd9a441, dealer: 0x2471a3, guns: 0x5d6d7e,
      clothes: 0xaf7ac5, store: 0x1e8449, home: 0xe8b84c, stable: 0x7d6608,
      pool: 0x2e86c1, gym: 0xc0392b, hospital: 0xecf0f1, police: 0x2c3e50,
      airport: 0x95a5a6, lodge: 0x6e5108, ferry: 0x148f77, pier: 0x7fb8d8 };
    for (const p of PLACES) {
      this.box(18, 9, 14, shopCols[p.kind] || 0x888888, p.x, 4.5, p.z, true);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(16, 2.4, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      sign.position.set(p.x, 10.2, p.z + 7.2);
      this.scene.add(sign);
    }
    // Basketball court
    const court = new THREE.Mesh(new THREE.PlaneGeometry(28, 16), this.mat(0x2e86c1));
    court.rotation.x = -Math.PI / 2; court.position.set(320, 0.1, 280); this.scene.add(court);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 6, 12), this.mat(0xe67e22));
    hoop.position.set(320, 4, 288); hoop.rotation.x = Math.PI / 2; this.scene.add(hoop);
  }
  buildPier(x, z, len, rot) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(len, 1.4, 8), this.mat(0x8b5a2b));
    pier.position.set(x, 0.8, z); pier.rotation.y = rot; this.scene.add(pier);
    for (let i = -len / 2 + 4; i < len / 2; i += 12) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), this.mat(0x6e4a22));
      post.position.set(x + Math.cos(rot) * i, 0, z + Math.sin(rot) * i);
      this.scene.add(post);
    }
  }
  buildPalms() {
    const rng = this.rng;
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const rr = WORLD.half - 18 - rng() * 40;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (Math.abs(x) < 380 && Math.abs(z) < 380 && Math.abs(x % 110) < 12) continue;
      this.addPalm(x, z, range(rng, 6, 10));
    }
    for (let i = 0; i < 40; i++) {
      const x = range(rng, -420, 420), z = range(rng, -420, 420);
      if (Math.abs(x % 110) < 12 || Math.abs(z % 110) < 12) continue;
      this.addPalm(x, z, range(rng, 5, 9));
    }
  }
  addPalm(x, z, h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, h, 6), this.mat(COLOURS.palmTrunk));
    trunk.position.y = h / 2; trunk.rotation.z = 0.12; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.4, 4), this.mat(COLOURS.palmLeaf));
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6, h + 0.4, Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.palms.push(g);
    this.colliders.push({ x, z, hw: 0.9, hd: 0.9, h });
  }
  buildRain() {
    const geo = new THREE.BufferGeometry();
    const count = 700;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 1] = Math.random() * 60;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.5 }));
    this.rain.visible = false;
    this.scene.add(this.rain);
  }
  districtAt(x, z) {
    let best = null, bd = 1e9;
    for (const d of DISTRICTS) {
      const dd = Math.hypot(x - d.cx, z - d.cz);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  collideCircle(x, z, r) {
    let nx = x, nz = z;
    for (const c of this.colliders) {
      if (Math.abs(x - c.x) > c.hw + r + 2 || Math.abs(z - c.z) > c.hd + r + 2) continue;
      const dx = x - c.x, dz = z - c.z;
      const px = c.hw + r - Math.abs(dx), pz = c.hd + r - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) nx = c.x + Math.sign(dx || 1) * (c.hw + r);
        else nz = c.z + Math.sign(dz || 1) * (c.hd + r);
      }
    }
    const lim = WORLD.half + 30;
    nx = clamp(nx, -lim, lim); nz = clamp(nz, -lim, lim);
    return { x: nx, z: nz };
  }
  update(dt, timeSec, camPos) {
    this.hour = (this.hour + dt / WORLD.dayLength * 24) % 24;
    const dayT = clamp(Math.sin((this.hour - 6) / 12 * Math.PI), 0, 1);
    const duskT = clamp(1 - Math.abs(this.hour - 18.5) / 2.5, 0, 1);
    const sky = new THREE.Color(COLOURS.skyDay).lerp(new THREE.Color(COLOURS.skyNight), 1 - dayT);
    if (duskT > 0 && dayT < 0.9) sky.lerp(new THREE.Color(COLOURS.skyDusk), duskT * 0.5);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky.getHex(), 260, 900);
    this.sun.intensity = 0.4 + 2.0 * dayT;
    this.ambient.intensity = 0.35 + 0.6 * dayT;
    const sunA = (this.hour - 6) / 12 * Math.PI;
    this.sun.position.set(Math.cos(sunA) * 300, 80 + Math.sin(sunA) * 260, 120);
    this.sea.material.color.setHex(dayT > 0.5 ? COLOURS.seaDay : COLOURS.seaNight);
    this.sea.position.y = WORLD.seaLevel + Math.sin(timeSec * 0.5) * 0.12;
    if (this.beacon) this.beacon.rotation.y = timeSec * 0.8;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 90 + Math.random() * 120;
      const roll = Math.random();
      this.weather = roll < 0.55 ? 'clear' : roll < 0.75 ? 'cloudy' : roll < 0.9 ? 'rain' : 'storm';
    }
    const raining = this.weather === 'rain' || this.weather === 'storm';
    this.rain.visible = raining;
    if (raining && camPos) {
      this.rain.position.set(camPos.x, 0, camPos.z);
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * (this.weather === 'storm' ? 55 : 35);
        if (y < 0) y = 60;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  }
}
function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
