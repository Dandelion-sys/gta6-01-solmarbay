// Solmar Bay sky, sea and weather: a day/night cycle, sun and moon,
// clouds, rain and storm fronts. The sea is one big animated plane.
import * as THREE from 'three';
import { COLOURS, TUNING, clamp, lerp } from './tuning.js';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.timeOfDay = 10.2; // hours, morning
    this.weather = 'clear'; // clear | cloudy | rain | storm
    this.weatherTimer = 120;
    this.rainDrops = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sun = new THREE.DirectionalLight(0xfff2c0, 2.2);
    this.sun.position.set(200, 300, 100);
    scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6a8f5f, 1.1);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0x9fc8e8, 220, 900);
    // Sea: a wide plane with a gentle vertex swell, animated in update.
    const geo = new THREE.PlaneGeometry(2400, 2400, 48, 48);
    this.sea = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: COLOURS.sea }));
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = -0.7;
    this.group.add(this.sea);
    this.seaBase = geo.attributes.position.array.slice();
    // Sun disc and moon disc.
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 24),
      new THREE.MeshBasicMaterial({ color: 0xe8ecf2, fog: false }));
    this.group.add(this.sunDisc, this.moonDisc);
    // Clouds: flat white puffs drifting slowly.
    this.clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(9 + j * 3, 8, 6), cloudMat);
        puff.position.set(j * 10 - 10, j * 1.5, (j % 2) * 5);
        puff.scale.y = 0.45;
        c.add(puff);
      }
      c.position.set(-500 + Math.random() * 1000, 120 + Math.random() * 60, -500 + Math.random() * 1000);
      this.clouds.push(c);
      this.group.add(c);
    }
    // Rain: a points cloud that only shows while it rains.
    const rainGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { pos[i * 3] = Math.random() * 300 - 150; pos[i * 3 + 1] = Math.random() * 60; pos[i * 3 + 2] = Math.random() * 300 - 150; }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xaaccee, size: 0.7, transparent: true, opacity: 0.7 }));
    this.rain.visible = false;
    this.group.add(this.rain);
  }

  update(dt, playerPos, elapsed) {
    this.timeOfDay += dt / TUNING.dayLengthSec * 24;
    if (this.timeOfDay >= 24) this.timeOfDay -= 24;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 90 + Math.random() * 120;
      const roll = Math.random();
      this.weather = roll < 0.55 ? 'clear' : roll < 0.75 ? 'cloudy' : roll < 0.9 ? 'rain' : 'storm';
    }
    const t = this.timeOfDay;
    const dayF = clamp(Math.sin((t - 6) / 12 * Math.PI), 0, 1);
    const duskF = clamp(1 - Math.abs(t - 18.5) / 1.8, 0, 1) + clamp(1 - Math.abs(t - 6.2) / 1.5, 0, 1);
    const skyCol = new THREE.Color(COLOURS.skyNight).lerp(new THREE.Color(COLOURS.skyDay), dayF);
    skyCol.lerp(new THREE.Color(COLOURS.skyDusk), clamp(duskF, 0, 1) * 0.55);
    this.scene.background = skyCol;
    if (this.scene.fog) this.scene.fog.color.copy(skyCol);
    this.sun.intensity = 0.25 + dayF * 2.0;
    this.hemi.intensity = 0.35 + dayF * 0.8;
    const ang = ((t - 6) / 12) * Math.PI;
    this.sun.position.set(Math.cos(ang) * 300, Math.sin(ang) * 300 + 40, 120);
    this.sunDisc.position.set(Math.cos(ang) * 700, Math.sin(ang) * 700 + 60, -300);
    this.sunDisc.lookAt(0, 0, 0);
    this.moonDisc.position.set(-Math.cos(ang) * 700, -Math.sin(ang) * 700 + 80, 300);
    this.moonDisc.lookAt(0, 0, 0);
    // Sea swell.
    const pos = this.sea.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.seaBase[i * 3], by = this.seaBase[i * 3 + 1];
      pos.array[i * 3 + 2] = Math.sin(bx * 0.02 + elapsed * 0.9) * 0.12 + Math.cos(by * 0.025 + elapsed * 0.7) * 0.1;
    }
    pos.needsUpdate = true;
    for (const c of this.clouds) {
      c.position.x += dt * (this.weather === 'storm' ? 22 : 4);
      if (c.position.x > 560) c.position.x = -560;
    }
    this.rain.visible = this.weather === 'rain' || this.weather === 'storm';
    if (this.rain.visible) {
      this.rain.position.set(playerPos.x, 0, playerPos.z);
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.array[i * 3 + 1] - dt * (this.weather === 'storm' ? 55 : 34);
        if (y < 0) y = 55;
        p.array[i * 3 + 1] = y;
      }
      p.needsUpdate = true;
    }
  }
  clockString() {
    const h = Math.floor(this.timeOfDay), m = Math.floor((this.timeOfDay - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  isNight() { return this.timeOfDay < 5.5 || this.timeOfDay > 19.5; }
  weatherLabel() {
    return { clear: 'Clear skies', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm front' }[this.weather];
  }
}
