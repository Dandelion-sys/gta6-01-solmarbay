// Police and the wanted level: patrols, chases, roadblocks, lockdown.
import { TUNE } from './config.js';
export class Police {
  constructor(traffic, game) {
    this.traffic = traffic;
    this.game = game;
    this.wanted = 0; this.heat = 0;
    this.cars = []; this.heli = null; this.heliAngle = 0;
    this.lockdown = false; this.lastSiren = 0;
  }
  addWanted(n, reason) {
    this.wanted = Math.min(6, this.wanted + n);
    this.heat = Math.min(100, this.heat + n * 22);
    return reason || 'crime';
  }
  spawnForLevel() {
    const want = this.wanted >= 3 ? 3 : this.wanted >= 1 ? this.wanted : 0;
    while (this.cars.length < want) {
      const v = this.traffic.addPoliceCar(-100 + Math.random() * 200, -100 + Math.random() * 200);
      this.cars.push(v);
    }
    while (this.cars.length > want) { const v = this.cars.pop(); this.traffic.removeCar(v); }
    this.lockdown = this.wanted >= 6;
  }
  update(dt, player, playerInCar, sound, timeNow) {
    this.spawnForLevel();
    if (this.wanted > 0) {
      // Heat fades when hidden, faster when out of sight and slow.
      const speed = playerInCar ? Math.abs(player.carSpeed || 0) : (player.moving ? 6 : 0);
      const seen = speed > 2;
      this.heat -= dt * (seen ? TUNE.wantedDecay * 10 : TUNE.wantedDecay * 60);
      if (this.heat <= 0) { this.wanted = Math.max(0, this.wanted - 1); this.heat = this.wanted > 0 ? 60 : 0; }
      if (timeNow - this.lastSiren > 2600) { this.lastSiren = timeNow; if (sound) sound.siren(); }
    }
    for (const v of this.cars) {
      // Chase the player: steer toward them, drive fast.
      const dx = player.x - v.x; const dz = player.z - v.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantYaw = Math.atan2(dx, -dz);
      let dy = wantYaw - v.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      v.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, dy));
      const throttle = dist > 6 ? 0.9 : 0.2;
      v.drive(dt, throttle, 0);
      if (v.mesh.userData.lightBar) v.mesh.userData.lightBar.material.color.setHex(Math.floor(timeNow / 300) % 2 ? 0xff2222 : 0x2244ff);
      if (dist < 3.2 && !playerInCar && player.invuln <= 0) {
        player.health -= 6 * dt * 10; this.game.knockFrom(v.x, v.z, 2);
      }
    }
    if (this.wanted >= 4) {
      this.heliAngle += dt * 0.5;
      if (!this.heli) { this.heli = { x: player.x, z: player.z }; }
      this.heli.x = player.x + Math.cos(this.heliAngle) * 24;
      this.heli.z = player.z + Math.sin(this.heliAngle) * 24;
    } else this.heli = null;
  }
  clear() {
    for (const v of this.cars) this.traffic.removeCar(v);
    this.cars = []; this.wanted = 0; this.heat = 0; this.lockdown = false; this.heli = null;
  }
  // Roadblocks at six stars: police cars parked across the main roads.
  roadblocks() {
    if (!this.lockdown) return [];
    return [
      { x: 0, z: 60, road: 'Coral Row south' },
      { x: 0, z: -60, road: 'Coral Row north' },
      { x: 60, z: 0, road: 'Coral Row east' },
      { x: -60, z: 0, road: 'Coral Row west' },
      { x: -160, z: 60, road: 'Palm Quay bridge' },
      { x: 120, z: -60, road: 'Gull Point road' },
    ];
  }
  escapeAdvice() {
    if (this.wanted >= 6) return 'LOCKDOWN: roadblocks on every main road. Change clothes, ditch the car, hide.';
    if (this.wanted >= 4) return 'Helicopter overhead. Break line of sight and stay hidden.';
    if (this.wanted >= 2) return 'Patrol cars are closing in. Lose them, then hide until the heat fades.';
    if (this.wanted === 1) return 'One star. Walk away calmly and the patrol will lose interest.';
    return 'No heat. The bay is yours.';
  }
}
