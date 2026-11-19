// Missions: Vera's story chains for Ryan and Ian, plus the computed finale.
import { finalePayout, mostExpensiveJet, mostExpensiveProperty } from './config.js';
function mkMissions() {
  return {
    ryan: [
      { id: 'r1', name: 'First Fare', brief: 'Drive the taxi to the pier and pick up Vera\'s friend. Steady driving, no damage.', target: { x: -160, z: 165 }, pay: 400, timed: 0 },
      { id: 'r2', name: 'Clockwork Delivery', brief: 'Deliver the parcel to Coral Row before the timer runs out.', target: { x: 45, z: -35 }, pay: 700, timed: 90 },
      { id: 'r3', name: 'Quiet Tail', brief: 'Follow the courier on foot. Stay close, stay unseen. Use Focus (Q) to slow time.', target: { x: 120, z: -60 }, pay: 1000, timed: 0 },
      { id: 'r4', name: 'Repo Man', brief: 'Steal the parked Coral Coupe by the dealer and bring it to the docks.', target: { x: -30, z: 55 }, pay: 1400, timed: 0 },
      { id: 'r5', name: 'Getaway Driver', brief: 'Pick up the crew at the casino and lose the police. Two stars are already on you.', target: { x: 45, z: -35 }, pay: 2000, timed: 0 },
      { id: 'r6', name: 'Bay Chase', brief: 'Chase the smuggler boat along the bay road and ram it off the causeway.', target: { x: -215, z: -40 }, pay: 2800, timed: 120 },
    ],
    ian: [
      { id: 'i1', name: 'Eyes on the Vault', brief: 'Photograph the casino vault door from the plaza. Do not get spotted.', target: { x: 45, z: -35 }, pay: 500, timed: 0 },
      { id: 'i2', name: 'Scout the Shop', brief: 'Case Bay Mart: find the back entrance and note the camera positions.', target: { x: -10, z: 75 }, pay: 800, timed: 0 },
      { id: 'i3', name: 'Drop-Off Run', brief: 'Three drop-offs across town. Follow the markers in order.', target: { x: 150, z: 120 }, pay: 1200, timed: 150 },
      { id: 'i4', name: 'Decoy Drive', brief: 'Draw the police away from Coral Row. Lose them, then come home.', target: { x: 0, z: 0 }, pay: 1600, timed: 0 },
      { id: 'i5', name: 'Lights Out', brief: 'Disable the cameras at Gull and Gun so the crew can work unseen.', target: { x: 25, z: 40 }, pay: 2200, timed: 0 },
      { id: 'i6', name: 'Break the Cordon', brief: 'Ryan is trapped by a police cordon at the docks. Get him out.', target: { x: -40, z: -190 }, pay: 3000, timed: 0 },
    ],
  };
}
export class Missions {
  constructor() {
    this.chains = mkMissions();
    this.progress = { ryan: 0, ian: 0 };
    this.active = null; this.activeChar = 'ryan';
    this.finaleDone = false; this.finaleActive = false;
    this.timer = 0; this.stage = 0;
  }
  current(char) { return this.chains[char][this.progress[char]] || null; }
  bothDone() { return this.progress.ryan >= 6 && this.progress.ian >= 6; }
  start(char) {
    if (this.finaleActive) return { name: 'The Marina Vault', brief: 'Rob the casino vault together, then escape by boat and car.', target: { x: 45, z: -35 }, pay: finalePayout() };
    const m = this.current(char);
    if (!m) return null;
    this.active = m; this.activeChar = char; this.timer = m.timed; this.stage = 0;
    return m;
  }
  startFinale() {
    this.finaleActive = true; this.timer = 300;
    this.active = { id: 'finale', name: 'The Marina Vault', brief: 'Crack the vault, grab the take, escape by boat. Payout is the dearest jet plus the dearest property in Solmar Bay.', target: { x: 45, z: -35 }, pay: finalePayout() };
    return this.active;
  }
  atTarget(x, z) {
    if (!this.active) return false;
    return Math.hypot(x - this.active.target.x, z - this.active.target.z) < 10;
  }
  complete() {
    if (!this.active) return 0;
    const pay = this.active.pay;
    if (this.active.id === 'finale') { this.finaleDone = true; this.finaleActive = false; }
    else if (this.activeChar === 'ryan') this.progress.ryan++;
    else this.progress.ian++;
    this.active = null; this.timer = 0;
    return pay;
  }
  update(dt) {
    if (this.active && this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) { this.active = null; this.timer = 0; return 'failed'; }
    }
    return null;
  }
  statusText() {
    if (this.finaleActive) return 'FINALE: The Marina Vault — crack it, escape by boat';
    if (this.active) return `Mission: ${this.active.name} — ${this.active.brief}`;
    if (this.bothDone()) return 'Both chains done! Start the Marina Vault heist at the casino.';
    const r = this.current('ryan'); const i = this.current('ian');
    const next = this.activeChar === 'ryan' ? r : i;
    return next ? `Next: ${next.name} — talk to Vera at The Brass Anchor (E)` : 'All missions done!';
  }
}
export function finaleBreakdown() {
  const jet = mostExpensiveJet(); const prop = mostExpensiveProperty();
  return `${jet.name} $${jet.price.toLocaleString()} + ${prop.name} $${prop.price.toLocaleString()} = $${finalePayout().toLocaleString()}`;
}
