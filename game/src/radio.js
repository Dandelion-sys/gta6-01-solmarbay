// Radio and podcasts: three stations of synthesised tunes and talk.
export const STATIONS = [
  { name: 'Bay FM', kind: 'music', lines: ['Sun on the water, shoes on the sand', 'Drive the coast road, radio loud', 'Solmar nights, neon and salt air'] },
  { name: 'Talk of the Bay', kind: 'talk', lines: ['Callers argue about the ferry timetable again', 'The mayor promises the pier will be fixed by spring', 'A listener asks: who really owns the old lighthouse?'] },
  { name: 'Harbor Podcasts', kind: 'podcast', lines: ['Episode 12: the smugglers of North Docks', 'Episode 13: how the bay got its name', 'Episode 14: gators, gulls and the mangrove'] },
];
export class Radio {
  constructor(sound) {
    this.sound = sound; this.station = 0; this.step = 0; this.timer = 0;
    this.headphones = false;
  }
  next() { this.station = (this.station + 1) % STATIONS.length; this.step = 0; return STATIONS[this.station]; }
  current() { return STATIONS[this.station]; }
  line() { const s = STATIONS[this.station]; return s.lines[this.step % s.lines.length]; }
  tick(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.6;
      this.sound.radioTick(this.station, this.step);
      this.step++;
    }
  }
  toggleHeadphones() { this.headphones = !this.headphones; return this.headphones; }
}
export function radioMelody(station, step) {
  const scales = {
    0: [262, 294, 330, 392, 440, 392, 330, 294],
    1: [220, 220, 262, 220, 330, 294, 262, 220],
    2: [196, 247, 294, 330, 392, 330, 294, 247],
  };
  const s = scales[station] || scales[0];
  return s[step % s.length];
}
