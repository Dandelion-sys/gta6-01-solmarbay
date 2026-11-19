// Missions: Vera's story chains for Ryan and Ian, the shared vault finale,
// stranger side quests and three treasure riddle chains.
import { fmtMoney } from './rng.js';

export const RYAN_CHAIN = [
  { id: 'r1', name: 'First Fare', chain: 'ryan', pay: 350,
    brief: 'Vera needs a cab driver for one shift. Pick up the fare at the pier and drop them at the casino.',
    steps: [{ type: 'goto', x: -380, z: 330, label: 'Pick up the fare at Sunset Pier', radius: 10 },
            { type: 'goto', x: 60, z: -40, label: 'Drop the fare at Marina Royale', radius: 10 }] },
  { id: 'r2', name: 'Against the Clock', chain: 'ryan', pay: 600,
    brief: 'A parcel has to cross the city before the ferry leaves. Drive fast, stay clean.',
    time: 150,
    steps: [{ type: 'goto', x: -300, z: 285, label: 'Collect the parcel at The Brass Anchor', radius: 8 },
            { type: 'goto', x: 60, z: -400, label: 'Deliver to Solmar Airfield', radius: 12 }] },
  { id: 'r3', name: 'Quiet Shadow', chain: 'ryan', pay: 900,
    brief: 'Tail the courier through Coral Row. Stay close but unseen — Focus helps. Do not get spotted.',
    steps: [{ type: 'tail', x: 0, z: 0, label: 'Tail the courier without being seen', radius: 26, hold: 25 }] },
  { id: 'r4', name: 'Repo Man', chain: 'ryan', pay: 1400,
    brief: 'A Gullwing GT is parked at Harbor Motors, unpaid. Take it — the slim jim is in your pocket.',
    steps: [{ type: 'steal', x: 120, z: 60, label: 'Steal the Gullwing GT', radius: 8 },
            { type: 'goto', x: -300, z: 285, label: 'Bring it back to The Brass Anchor', radius: 12, needCar: true }] },
  { id: 'r5', name: 'The Getaway', chain: 'ryan', pay: 2200,
    brief: 'A job went loud at the docks. Grab the bag and lose the police before you reach the safehouse.',
    steps: [{ type: 'goto', x: 0, z: -360, label: 'Grab the bag at North Docks', radius: 10 },
            { type: 'escape', x: -20, z: 152, label: 'Lose the police, then reach the safehouse', radius: 12 }] },
  { id: 'r6', name: 'Bay Run', chain: 'ryan', pay: 3400,
    brief: 'Boat chase across the bay. Follow the smuggler\'s wake to Tern Isle and bring the cargo home.',
    steps: [{ type: 'goto', x: -280, z: 380, label: 'Take the boat at the ferry terminal', radius: 10 },
            { type: 'goto', x: -120, z: 560, label: 'Chase the wake to Tern Isle', radius: 14 }] },
];
export const IAN_CHAIN = [
  { id: 'i1', name: 'Eyes on the Prize', chain: 'ian', pay: 400,
    brief: 'Photograph the casino vault door and the guard rotation. The phone camera does the work.',
    steps: [{ type: 'photo', x: 60, z: -40, label: 'Photograph Marina Royale', radius: 12 }] },
  { id: 'i2', name: 'Case the Joint', chain: 'ian', pay: 750,
    brief: 'Scout the shop on Coral Row: find the back entrance and learn the safe code.',
    steps: [{ type: 'goto', x: 40, z: 110, label: 'Scout Tide and Thread', radius: 8 },
            { type: 'goto', x: 130, z: -60, label: 'Note the patrol route at Bay Precinct', radius: 10 }] },
  { id: 'i3', name: 'Three Drops', chain: 'ian', pay: 1100,
    brief: 'Three packages, three corners of the city. No questions, no stops.',
    steps: [{ type: 'goto', x: -300, z: 285, label: 'Drop one at The Brass Anchor', radius: 8 },
            { type: 'goto', x: 300, z: 240, label: 'Drop two at Sunset Fields', radius: 10 },
            { type: 'goto', x: -330, z: -300, label: 'Drop three at Gull Point', radius: 10 }] },
  { id: 'i4', name: 'The Decoy', chain: 'ian', pay: 1800,
    brief: 'Draw the police away from the docks. Get three stars, then lose them — clean.',
    steps: [{ type: 'wanted', x: 0, z: -360, label: 'Get the police chasing you at North Docks', radius: 20 },
            { type: 'escape', x: 300, z: 240, label: 'Lose them and reach Sunset Fields', radius: 12 }] },
  { id: 'i5', name: 'Dark Windows', chain: 'ian', pay: 2600,
    brief: 'Disable the cameras at Gull and Gun so a later job goes unseen.',
    steps: [{ type: 'disable', x: -60, z: 90, label: 'Disable the cameras at Gull and Gun', radius: 8, hold: 6 }] },
  { id: 'i6', name: 'Break the Cordon', chain: 'ian', pay: 4200,
    brief: 'Ryan is boxed in by a police cordon at the precinct. Get him out.',
    steps: [{ type: 'goto', x: 130, z: -60, label: 'Reach Ryan at Bay Precinct', radius: 10 },
            { type: 'goto', x: -20, z: 152, label: 'Bring Ryan home to the safehouse', radius: 12 }] },
];
export const STRANGERS = [
  { id: 's1', name: 'Lost Tourist', x: -280, z: 380, reward: 250, text: 'A tourist lost their map. Walk them to the lighthouse viewpoint.' },
  { id: 's2', name: 'Lucky Rod', x: -380, z: 330, reward: 300, text: 'A fisherman lost his lucky rod off the pier. Fish it out near the pier.' },
  { id: 's3', name: 'Street Musician', x: 0, z: 0, reward: 200, text: 'A busker needs an audience. Play three songs near the plaza.' },
  { id: 's4', name: 'Retired Sailor', x: -300, z: 285, reward: 400, text: 'An old sailor wants one last look at Tern Isle from the ferry.' },
  { id: 's5', name: 'Runaway Bride', x: 300, z: 240, reward: 500, text: 'A bride ran from her wedding. Drive her to the airfield, fast.' },
  { id: 's6', name: 'Birdwatcher', x: 300, z: -280, reward: 350, text: 'A birdwatcher needs a photo of the night heron in the mangroves.' },
  { id: 's7', name: 'Night Nurse', x: -90, z: -20, reward: 300, text: 'A nurse missed her bus. Give her a lift to the hospital.' },
  { id: 's8', name: 'Young Fan', x: 60, z: -40, reward: 450, text: 'A boy wants a photo with the lookalike at the casino doors.' },
];
export const TREASURES = [
  { id: 't1', name: 'The Gull\'s Cache', reward: 2500,
    clues: ['Where the light turns over the cliffs, look below the white tower.',
            'The pier that points at the sunset keeps a box under its third post.',
            'Dig where the sand meets the boardwalk at Palm Quay.'] },
  { id: 't2', name: 'The Smuggler\'s Tin', reward: 4000,
    clues: ['Crates sleep in rows where the cranes stand tall.',
            'The airboat shed hides what the tide forgot.',
            'Under the last container by the truck yard, the tin waits.'] },
  { id: 't3', name: 'The Captain\'s Chest', reward: 6500,
    clues: ['A cottage on a small isle keeps a captain\'s log.',
            'The ferry bell rings twice for the honest and once for the thief.',
            'Beneath the viewpoint bench on Tern Isle, the chest is buried.'] },
];
export class MissionEngine {
  constructor() {
    this.active = null;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.timeLeft = 0;
    this.completed = { ryan: [], ian: [] };
    this.finaleDone = false;
    this.tailSeen = 0;
    this.log = [];
  }
  nextFor(chain) {
    const list = chain === 'ryan' ? RYAN_CHAIN : IAN_CHAIN;
    const done = this.completed[chain];
    return list.find((m) => !done.includes(m.id)) || null;
  }
  start(mission) {
    this.active = mission;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.timeLeft = mission.time || 0;
    this.tailSeen = 0;
    this.log.push('Started: ' + mission.name);
    return mission;
  }
  currentStep() {
    if (!this.active) return null;
    return this.active.steps[this.stepIndex] || null;
  }
  advance() {
    this.stepIndex++;
    this.stepTimer = 0;
    if (this.stepIndex >= this.active.steps.length) return true;
    return false;
  }
  complete() {
    const m = this.active;
    this.completed[m.chain].push(m.id);
    this.log.push('Completed: ' + m.name + ' +' + fmtMoney(m.pay));
    this.active = null;
    this.stepIndex = 0;
    return m;
  }
  fail(reason) {
    const m = this.active;
    this.log.push('Failed: ' + (m ? m.name : '') + ' — ' + reason);
    this.active = null;
    this.stepIndex = 0;
    return m;
  }
  finaleReady() {
    return this.completed.ryan.length >= RYAN_CHAIN.length &&
      this.completed.ian.length >= IAN_CHAIN.length;
  }
  finalePayout(planes, properties) {
    const bestPlane = planes.reduce((a, b) => (b.price > a.price ? b : a), planes[0]);
    const bestProp = properties.reduce((a, b) => (b.price > a.price ? b : a), properties[0]);
    return { payout: bestPlane.price + bestProp.price, plane: bestPlane, property: bestProp };
  }
}
