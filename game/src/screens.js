// Solmar Bay screens: title, pause and game-over overlays, with the key
// map written the same way in all three places and in the README.
import { KEYMAP } from './tuning.js';

export const KEYMAP_TEXT = [
  ['W A S D', 'Walk / drive (W walks away from the camera)'],
  ['Mouse drag', 'Look around (touch: drag the right side)'],
  ['Shift', 'Run'],
  ['E', 'Interact / enter car (touch: E button)'],
  ['F', 'Punch / handbrake (touch: F button)'],
  ['Q', 'Focus — slow-motion aim'],
  ['C', 'Switch Ryan / Ian'],
  ['P', 'Phone (touch: P button)'],
  ['M', 'Map (touch: M button)'],
  ['Esc', 'Pause'],
];

export class Screens {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.id = 'screens';
    this.el.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg, rgba(8,30,48,0.82), rgba(20,80,110,0.72));color:#fff;font-family:"Trebuchet MS",Verdana,sans-serif;overflow:auto;';
    document.body.appendChild(this.el);
    this.mode = 'title';
    this._renderTitle();
  }
  _keyRows() {
    return KEYMAP_TEXT.map(([k, d]) => `<tr><td style="padding:3px 12px 3px 0;font-weight:bold;color:#ffd23f;white-space:nowrap;">${k}</td><td style="padding:3px 0;">${d}</td></tr>`).join('');
  }
  _renderTitle() {
    this.mode = 'title';
    this.el.innerHTML = `
    <div style="max-width:640px;width:92vw;padding:28px;text-align:center;">
      <div style="font-size:15px;letter-spacing:4px;color:#7dff9a;">A SUN-SOAKED OPEN WORLD</div>
      <h1 style="font-size:56px;line-height:1;margin:8px 0;color:#ffd23f;text-shadow:0 4px 0 rgba(0,0,0,0.4);">SOLMAR BAY</h1>
      <p style="font-size:16px;line-height:1.5;opacity:0.95;">Ryan and Ian — a couple starting over in a bay city of marinas, towers and swamps. Steal cars, take jobs from Vera at The Brass Anchor, outrun the police, and rob the Marina Royale vault.</p>
      <div style="display:flex;gap:16px;justify-content:center;margin:16px 0;">
        <div style="background:rgba(255,255,255,0.12);border-radius:12px;padding:12px 18px;text-align:left;"><b style="color:#7fb3d5;">RYAN</b><br>39 · negotiator<br>Smooth talker, better prices</div>
        <div style="background:rgba(255,255,255,0.12);border-radius:12px;padding:12px 18px;text-align:left;"><b style="color:#ff9a9a;">IAN</b><br>38 · driver<br>Fast hands, fast Focus</div>
      </div>
      <table style="margin:0 auto;text-align:left;font-size:14px;">${this._keyRows()}</table>
      <p style="margin-top:10px;font-size:14px;opacity:0.9;">Touch: left stick to walk and drive · drag the right side to look · E / F / P / M buttons.</p>
      <button id="btn-start" style="margin-top:16px;padding:14px 44px;font-size:20px;font-weight:bold;background:#ffd23f;color:#3a2500;border:none;border-radius:14px;cursor:pointer;">▶ Start New Game</button>
      <button id="btn-continue" style="margin-top:16px;margin-left:10px;padding:14px 26px;font-size:16px;background:#2b6fd9;color:#fff;border:none;border-radius:14px;cursor:pointer;">Continue</button>
      <p style="margin-top:12px;font-size:12px;opacity:0.7;">Best wallet so far: <span id="title-best">$0</span> · Free to play · No payments, no wallet needed</p>
    </div>`;
    this.el.querySelector('#btn-start').addEventListener('click', () => this.app.startGame(false));
    this.el.querySelector('#btn-continue').addEventListener('click', () => this.app.startGame(true));
    const best = Number(localStorage.getItem('solmar-best') || 0);
    this.el.querySelector('#title-best').textContent = '$' + best.toLocaleString('en-US');
  }
  showPause() {
    this.mode = 'pause';
    this.el.style.display = 'flex';
    this.el.innerHTML = `
    <div style="max-width:560px;width:92vw;padding:28px;text-align:center;">
      <h1 style="font-size:40px;color:#ffd23f;">PAUSED</h1>
      <p style="margin:8px 0;">${this.app.game.couple.active.def.name} · $${this.app.game.couple.wallet.toLocaleString('en-US')} · ${this.app.game.missions.progressText()}</p>
      <table style="margin:12px auto;text-align:left;font-size:14px;">${this._keyRows()}</table>
      <button id="btn-resume" style="padding:12px 36px;font-size:18px;background:#2ed573;color:#062;border:none;border-radius:12px;cursor:pointer;">Resume</button>
      <button id="btn-save" style="padding:12px 26px;font-size:16px;background:#2b6fd9;color:#fff;border:none;border-radius:12px;cursor:pointer;margin-left:8px;">Save</button>
      <button id="btn-quit" style="padding:12px 26px;font-size:16px;background:#d93a2b;color:#fff;border:none;border-radius:12px;cursor:pointer;margin-left:8px;">Quit to title</button>
      <div style="margin-top:14px;"><label><input type="checkbox" id="chk-mute" ${this.app.sound.muted ? 'checked' : ''}> Mute sound</label></div>
    </div>`;
    this.el.querySelector('#btn-resume').addEventListener('click', () => this.app.resumeGame());
    this.el.querySelector('#btn-save').addEventListener('click', () => { this.app.saveGame(); this.app.hud.toast('Game saved.'); });
    this.el.querySelector('#btn-quit').addEventListener('click', () => this.app.quitToTitle());
    this.el.querySelector('#chk-mute').addEventListener('change', (e) => this.app.sound.setMuted(e.target.checked));
  }
  showBusted() {
    this.mode = 'busted';
    this.el.style.display = 'flex';
    this.el.innerHTML = `
    <div style="max-width:520px;width:92vw;padding:28px;text-align:center;">
      <h1 style="font-size:44px;color:#ff6a5a;">BUSTED</h1>
      <p style="margin:10px 0;font-size:16px;">The Bay Police caught ${this.app.game.couple.active.def.name}. Bail cost $300 and the heat is gone — for now.</p>
      <button id="btn-busted" style="padding:12px 36px;font-size:18px;background:#ffd23f;color:#3a2500;border:none;border-radius:12px;cursor:pointer;">Back to the streets</button>
    </div>`;
    this.el.querySelector('#btn-busted').addEventListener('click', () => this.app.afterBusted());
  }
  showWasted() {
    this.mode = 'wasted';
    this.el.style.display = 'flex';
    this.el.innerHTML = `
    <div style="max-width:520px;width:92vw;padding:28px;text-align:center;">
      <h1 style="font-size:44px;color:#ff6a5a;">WASTED</h1>
      <p style="margin:10px 0;font-size:16px;">${this.app.game.couple.active.def.name} woke up at Coral General Hospital, $200 lighter.</p>
      <button id="btn-wasted" style="padding:12px 36px;font-size:18px;background:#ffd23f;color:#3a2500;border:none;border-radius:12px;cursor:pointer;">Get back up</button>
    </div>`;
    this.el.querySelector('#btn-wasted').addEventListener('click', () => this.app.afterWasted());
  }
  hide() { this.el.style.display = 'none'; this.mode = 'play'; }
  showTitle() { this.el.style.display = 'flex'; this._renderTitle(); }
}
