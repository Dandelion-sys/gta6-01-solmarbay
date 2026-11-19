// Solmar Bay missions: Vera the fixer hands out the story jobs, one at
// a time, in order. Ryan has six, Ian has six, then the finale unlocks.
// The finale payout is computed from the most expensive jet and property.
import * as THREE from 'three';

export const RYAN_MISSIONS = [
  { id: 'r1', name: 'First Fare', hero: 'ryan', pay: 400, x: 60, z: 120, timed: 0,
    brief: 'Taxi shift: pick up the fare at Coral Row and drop them at the pier.',
    debrief: 'Clean driving. Vera noticed.' },
  { id: 'r2', name: 'Against the Clock', hero: 'ryan', pay: 750, x: -300, z: -180, timed: 90,
    brief: 'Deliver the package to Sunset Stables before the timer runs out.',
    debrief: 'Right on time. The client pays double next time.' },
  { id: 'r3', name: 'Quiet Tail', hero: 'ryan', pay: 1100, x: 180, z: 90, timed: 0,
    brief: 'Tail the courier through Coral Row. Stay close, stay unseen. Q is Focus.',
    debrief: 'You ghosted him the whole way. Textbook.' },
  { id: 'r4', name: 'Repo Man', hero: 'ryan', pay: 1600, x: 170, z: 0, timed: 0,
    brief: 'Repossess the red coupe parked outside Harbor Motors. E to take it.',
    debrief: 'The car is ours now. Vera is impressed.' },
  { id: 'r5', name: 'The Getaway', hero: 'ryan', pay: 2400, x: -120, z: -330, timed: 120,
    brief: 'Drive the crew out of North Docks and lose the police. Two stars and counting.',
    debrief: 'You shook them. Nobody drives like you do.' },
  { id: 'r6', name: 'Bay Run', hero: 'ryan', pay: 3200, x: -262, z: 390, timed: 150,
    brief: 'Boat chase across the bay: reach the pier boat and outrun the patrol.',
    debrief: 'The bay is yours. One chain left: Ian’s.' },
];
export const IAN_MISSIONS = [
  { id: 'i1', name: 'Long Lens', hero: 'ian', pay: 500, x: 96, z: 10, timed: 0,
    brief: 'Photo recon: photograph the Marina Royale vault door from the plaza.',
    debrief: 'The vault door, the cameras, the guard rotation. All noted.' },
  { id: 'i2', name: 'Scout the Shop', hero: 'ian', pay: 900, x: 30, z: 150, timed: 0,
    brief: 'Scout Gull and Gun: find the back entrance and the safe code.',
    debrief: 'Back door, safe code, blind spot. Ready when you are.' },
  { id: 'i3', name: 'Drop-offs', hero: 'ian', pay: 1300, x: 300, z: 280, timed: 120,
    brief: 'Three drop-offs across Mangrove Flats. Keep moving, don’t linger.',
    debrief: 'Three drops, zero witnesses. Beautiful.' },
  { id: 'i4', name: 'Decoy Drive', hero: 'ian', pay: 1900, x: 120, z: 130, timed: 0,
    brief: 'Decoy drive: pull two stars of police away from the station, then lose them.',
    debrief: 'They chased you for an hour. Vera owes you a drink.' },
  { id: 'i5', name: 'Dark Cameras', hero: 'ian', pay: 2600, x: 96, z: 10, timed: 90,
    brief: 'Disable the casino cameras before the guard round ends.',
    debrief: 'Blind as a bat. The vault is next.' },
  { id: 'i6', name: 'Break the Cordon', hero: 'ian', pay: 3600, x: 120, z: 130, timed: 120,
    brief: 'Rescue Ryan from the police cordon at the station. Bring a car.',
    debrief: 'You pulled him out clean. Both chains are done.' },
];
export const FINALE = {
  id: 'finale', name: 'The Marina Royale Vault', hero: 'both', pay: 0,
  x: 96, z: 10, timed: 300,
  brief: 'Rob the casino vault together, switch between Ryan and Ian, escape by boat and car.',
  debrief: 'The vault is empty and the bay is yours. Legends of Solmar Bay.',
};

export class MissionBook {
  constructor(scene) {
    this.scene = scene;
    this.ryanDone = 0; this.ianDone = 0;
    this.active = null; // {def, timer, startedAt}
    this.completed = [];
    this.finaleDone = false;
    // Objective beam: a tall glowing cylinder marking the target.
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true), beamMat);
    this.beam.position.y = 30; this.beam.visible = false;
    scene.add(this.beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.6 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 24), ringMat);
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.1; this.ring.visible = false;
    scene.add(this.ring);
  }
  nextFor(heroId) {
    const list = heroId === 'ryan' ? RYAN_MISSIONS : IAN_MISSIONS;
    const done = heroId === 'ryan' ? this.ryanDone : this.ianDone;
    return done < list.length ? list[done] : null;
  }
  finaleReady() { return this.ryanDone >= RYAN_MISSIONS.length && this.ianDone >= IAN_MISSIONS.length; }
  start(def) {
    this.active = { def, timer: def.timed || 0, elapsed: 0 };
    this.beam.position.set(def.x, 30, def.z);
    this.ring.position.set(def.x, 0.1, def.z);
    this.beam.visible = true; this.ring.visible = true;
    return this.active;
  }
  // Returns 'done' | 'failed' | null.
  update(dt, px, pz) {
    if (!this.active) return null;
    const a = this.active;
    a.elapsed += dt;
    if (a.timer > 0) {
      a.timer -= dt;
      if (a.timer <= 0) { this.abandon(); return 'failed'; }
    }
    const d = Math.hypot(px - a.def.x, pz - a.def.z);
    if (d < 5) {
      const def = a.def;
      this.active = null;
      this.beam.visible = false; this.ring.visible = false;
      this.completed.push(def.id);
      if (def.id === 'finale') this.finaleDone = true;
      else if (def.hero === 'ryan') this.ryanDone++;
      else this.ianDone++;
      return 'done';
    }
    return null;
  }
  abandon() {
    this.active = null;
    this.beam.visible = false; this.ring.visible = false;
  }
  progressText() {
    return `Ryan ${this.ryanDone}/6 · Ian ${this.ianDone}/6` + (this.finaleReady() ? ' · FINALE READY' : '');
  }
  // The finale payout is computed, never written as a fixed number.
  finalePayout(jets, properties) {
    const bestJet = Math.max(...jets.map((j) => j.price));
    const bestProp = Math.max(...properties.map((p) => p.price));
    return bestJet + bestProp;
  }
}
