// The Marina Vault finale: staged heist with duo switching between Ryan
// and Ian, escape by boat and car. Payout is computed, never fixed.
import { finalePayout } from './config.js';
import { finaleBreakdown } from './missions.js';
export const FINALE_STAGES = [
  { id: 'enter', name: 'Enter the casino', text: 'Walk in through the front doors. Smile. You belong here.', target: { x: 45, z: -35 } },
  { id: 'vault', name: 'Crack the vault', text: 'Ian works the vault while Ryan watches the floor. Hold position.', target: { x: 45, z: -35 } },
  { id: 'grab', name: 'Grab the take', text: 'The vault is open. Take everything that is not nailed down.', target: { x: 45, z: -35 } },
  { id: 'boat', name: 'Escape by boat', text: 'Out the back, to the pier. The speedboat is waiting.', target: { x: -180, z: 185 } },
  { id: 'car', name: 'Escape by car', text: 'Ditch the boat at the docks and drive. Lose the police.', target: { x: -40, z: -190 } },
  { id: 'home', name: 'Get home', text: 'Back to the safehouse. Count the money. You did it.', target: { x: -10, z: 75 } },
];
export class Finale {
  constructor(game) {
    this.game = game;
    this.active = false; this.stage = 0; this.done = false;
    this.timer = 0; this.swaps = 0;
  }
  payout() { return finalePayout(); }
  breakdown() { return finaleBreakdown(); }
  start() {
    this.active = true; this.stage = 0; this.timer = 420; this.done = false;
    const g = this.game;
    g.missions.startFinale();
    g.police.addWanted(2, 'casino heist');
    g.toast('FINALE: The Marina Vault — ' + FINALE_STAGES[0].name + '. ' + FINALE_STAGES[0].text);
    return FINALE_STAGES[0];
  }
  currentStage() { return FINALE_STAGES[this.stage] || null; }
  swapCharacter() {
    const g = this.game;
    g.activeChar = g.activeChar === 'ryan' ? 'ian' : 'ryan';
    this.swaps++;
    g.toast('Now ' + (g.activeChar === 'ryan' ? 'Ryan' : 'Ian') + ' takes the lead. ' + this.currentStage().text);
    return g.activeChar;
  }
  atStageTarget(x, z) {
    const s = this.currentStage();
    if (!s) return false;
    return Math.hypot(x - s.target.x, z - s.target.z) < 12;
  }
  advance() {
    const g = this.game;
    const finished = this.currentStage();
    this.stage++;
    if (this.stage >= FINALE_STAGES.length) {
      this.active = false; this.done = true;
      const pay = this.payout();
      g.economy.earn(pay, 'finale');
      g.missions.finaleDone = true; g.missions.finaleActive = false; g.missions.active = null;
      g.police.clear();
      g.sound.missionDone();
      g.toast('HEIST COMPLETE! The take: ' + pay.toLocaleString('en-US') + ' dollars. ' + this.breakdown());
      return { done: true, pay };
    }
    const next = this.currentStage();
    g.toast('Stage ' + (this.stage + 1) + '/' + FINALE_STAGES.length + ': ' + next.name + ' — ' + next.text);
    g.sound.cash();
    return { done: false, stage: next, finished: finished.name };
  }
  update(dt) {
    if (!this.active) return null;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = false;
      this.game.toast('The heist fell apart — the timer ran out. Vera will give you one more shot.');
      return 'failed';
    }
    const g = this.game;
    if (this.atStageTarget(g.player.x, g.player.z)) return this.advance();
    return null;
  }
  statusText() {
    if (this.done) return 'The Marina Vault is done. You are rich. Enjoy Solmar Bay.';
    if (!this.active) return 'Finale ready: rob the Marina Royale vault with Ryan and Ian.';
    const s = this.currentStage();
    return `FINALE ${this.stage + 1}/${FINALE_STAGES.length}: ${s.name} — ${Math.ceil(this.timer)}s left`;
  }
}
