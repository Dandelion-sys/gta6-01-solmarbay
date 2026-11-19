// Challenges: nine categories, bronze / silver / gold, each with a payout.
import { CHALLENGE_CATS, RANKS } from './activities.js';
export const CHALLENGE_DEFS = {
  driving: { bronze: 'Drive 5 km without a crash', silver: 'Drive 15 km without a crash', gold: 'Drive 40 km without a crash' },
  shooting: { bronze: 'Hit 5 targets at the range', silver: 'Hit 15 targets at the range', gold: 'Hit 30 targets at the range' },
  flying: { bronze: 'Fly the prop plane once', silver: 'Fly over all seven districts', gold: 'Fly under the causeway bridge' },
  swimming: { bronze: 'Swim 200 m', silver: 'Swim to Tern Isle', gold: 'Dive at all three reef sites' },
  hunting: { bronze: 'Log 3 animals', silver: 'Log 8 animals', gold: 'Log every animal in the guide' },
  racing: { bronze: 'Win a street race', silver: 'Win three street races', gold: 'Win the Bay Grand Prix' },
  stealth: { bronze: 'Finish a tail job unseen', silver: 'Rob a shop without a star', gold: 'Walk through Coral Row at 5 stars unseen' },
  stamina: { bronze: 'Run 2 km', silver: 'Run 5 km', gold: 'Run the whole coast road' },
  style: { bronze: 'Land a base jump', silver: 'Land three base jumps cleanly', gold: 'Land on the casino roof' },
};
export class Challenges {
  constructor(economy) {
    this.economy = economy;
    this.progress = {};
    for (const c of CHALLENGE_CATS) this.progress[c] = { value: 0, rank: null };
  }
  add(cat, n) {
    const p = this.progress[cat]; if (!p) return null;
    p.value += n;
    const thresholds = { driving: [5, 15, 40], shooting: [5, 15, 30], flying: [1, 7, 1], swimming: [200, 1500, 3], hunting: [3, 8, 13], racing: [1, 3, 1], stealth: [1, 1, 1], stamina: [2, 5, 12], style: [1, 3, 1] };
    const t = thresholds[cat];
    let rank = null;
    if (p.value >= t[2]) rank = 'gold'; else if (p.value >= t[1]) rank = 'silver'; else if (p.value >= t[0]) rank = 'bronze';
    if (rank && rank !== p.rank) {
      const order = ['bronze', 'silver', 'gold'];
      if (!p.rank || order.indexOf(rank) > order.indexOf(p.rank)) {
        p.rank = rank;
        const pay = this.economy.setChallenge(cat, rank);
        return { cat, rank, pay, text: CHALLENGE_DEFS[cat][rank] };
      }
    }
    return null;
  }
  rankOf(cat) { return this.progress[cat] ? this.progress[cat].rank : null; }
  valueOf(cat) { return this.progress[cat] ? this.progress[cat].value : 0; }
  summary() {
    return CHALLENGE_CATS.map(c => ({ cat: c, rank: this.rankOf(c), value: this.valueOf(c), next: this.nextGoal(c) }));
  }
  nextGoal(cat) {
    const p = this.progress[cat];
    if (!p) return null;
    if (!p.rank) return CHALLENGE_DEFS[cat].bronze;
    if (p.rank === 'bronze') return CHALLENGE_DEFS[cat].silver;
    if (p.rank === 'silver') return CHALLENGE_DEFS[cat].gold;
    return 'Mastered';
  }
  goldCount() { return CHALLENGE_CATS.filter(c => this.rankOf(c) === 'gold').length; }
}
