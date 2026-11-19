// Solmar Bay input: keyboard + mouse on desktop, touch joystick, camera
// drag and on-screen buttons on touch devices. Desktop behaviour is
// untouched by the touch layer: it only exists when the device has touch.
import { KEYMAP, clamp } from './tuning.js';

export class Input {
  constructor(app) {
    this.app = app;
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseDX = 0; this.mouseDY = 0;
    this.joyActive = false; this.joyId = null;
    this.joyVec = { x: 0, y: 0 }; this.joyMag = 0;
    this.camId = null; this.camDX = 0; this.camDY = 0;
    this.isTouchDevice = false;
    this.touchLayer = null; this.stick = null; this.knob = null;
    this.buttons = {};
    this._pressed = new Set();
    this._framePressed = new Set();
    this._bindKeyboard();
    this._detectTouch();
  }
  _detectTouch() {
    try {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      this.isTouchDevice = coarse || (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    } catch (e) { this.isTouchDevice = false; }
  }
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  wasPressed(code) {
    const hit = this._framePressed.has(code);
    if (hit) this._framePressed.delete(code);
    return hit;
  }
  // Snapshot the presses that arrived since the last frame, so a key
  // pressed during a long render is never lost before a step sees it.
  takePressed() {
    this._framePressed = new Set(this._pressed);
    this._pressed.clear();
  }
  endFrame() { this.mouseDX = 0; this.mouseDY = 0; this.camDX = 0; this.camDY = 0; }
  key(code) { return this.keys.has(code); }

  // Move vector from keyboard: x = strafe right, y = forward.
  keyMove() {
    let x = 0, y = 0;
    if (this.key(KEYMAP.forward)) y += 1;
    if (this.key(KEYMAP.back)) y -= 1;
    if (this.key(KEYMAP.right)) x += 1;
    if (this.key(KEYMAP.left)) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, mag: Math.min(1, len) };
  }
  // Combined move: joystick wins when active, otherwise keyboard.
  move() {
    if (this.joyActive && this.joyMag > 0.04) {
      return { x: this.joyVec.x, y: this.joyVec.y, mag: this.joyMag };
    }
    return this.keyMove();
  }
  running() { return this.key(KEYMAP.run) || this.joyMag > 0.85; }
  bindMouse(canvas) {
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 2) { this.keys.add('MouseRight'); return; }
      dragging = true; lx = e.clientX; ly = e.clientY;
      this.app.sound.ensure();
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !dragging) return;
      this.mouseDX += e.clientX - lx; this.mouseDY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (e.button === 2) this.keys.delete('MouseRight');
      dragging = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // Camera drag deltas this frame, from mouse or from touch.
  cameraDelta() { return { dx: this.mouseDX + this.camDX, dy: this.mouseDY + this.camDY }; }

  // Build the touch layer: joystick bottom-left, camera drag on the right
  // half, action buttons bottom-right. Only called on touch devices.
  buildTouchLayer() {
    if (!this.isTouchDevice) return null;
    const layer = document.createElement('div');
    layer.id = 'touch-layer';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;';
    // Joystick base, bottom-left, clear of the HUD and the centre.
    const base = document.createElement('div');
    base.id = 'touch-stick';
    base.style.cssText = 'position:absolute;left:18px;bottom:20px;width:132px;height:132px;border-radius:50%;background:rgba(255,255,255,0.10);border:2px solid rgba(255,255,255,0.45);pointer-events:auto;touch-action:none;';
    const knob = document.createElement('div');
    knob.id = 'touch-knob';
    knob.style.cssText = 'position:absolute;left:41px;top:41px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.75);border:2px solid rgba(0,0,0,0.25);';
    base.appendChild(knob);
    layer.appendChild(base);
    this.stick = base; this.knob = knob;
    // Camera drag zone: right 55% of the screen, invisible, above canvas.
    const cam = document.createElement('div');
    cam.id = 'touch-camera';
    cam.style.cssText = 'position:absolute;right:0;top:0;width:55%;height:100%;pointer-events:auto;touch-action:none;';
    layer.appendChild(cam);
    // Buttons: E interact (big), punch/handbrake, phone, map.
    const defs = [
      { id: 'btn-interact', label: 'E', sub: 'Use', size: 74, right: 20, bottom: 20 },
      { id: 'btn-punch', label: 'F', sub: 'Hit', size: 58, right: 108, bottom: 26 },
      { id: 'btn-phone', label: 'P', sub: 'Phone', size: 58, right: 20, bottom: 110 },
      { id: 'btn-map', label: 'M', sub: 'Map', size: 58, right: 92, bottom: 108 },
    ];
    for (const d of defs) {
      const b = document.createElement('button');
      b.id = d.id; b.dataset.action = d.id;
      b.innerHTML = `<b>${d.label}</b><span>${d.sub}</span>`;
      b.style.cssText = `position:absolute;right:${d.right}px;bottom:${d.bottom}px;width:${d.size}px;height:${d.size}px;border-radius:50%;background:rgba(20,40,60,0.72);color:#fff;border:2px solid rgba(255,255,255,0.6);font-size:20px;pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;`;
      b.querySelector('span').style.cssText = 'font-size:10px;opacity:0.85;';
      b.querySelector('b').style.cssText = 'line-height:1;';
      layer.appendChild(b);
      this.buttons[d.id] = b;
    }
    document.body.appendChild(layer);
    this.touchLayer = layer;
    this._bindTouch(base, cam);
    return layer;
  }

  _bindTouch(base, camZone) {
    const R = 46; // stick travel radius in px
    let joyTouch = null, camTouch = null, camLX = 0, camLY = 0;
    let smoothX = 0, smoothY = 0;
    const setKnob = (dx, dy) => {
      this.knob.style.left = (41 + dx) + 'px';
      this.knob.style.top = (41 + dy) + 'px';
    };
    base.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyTouch = t.identifier;
      this.joyActive = true; this.joyId = t.identifier;
      smoothX = 0; smoothY = 0;
      this.app.sound.ensure();
    }, { passive: false });
    base.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== joyTouch) continue;
        const r = base.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = (t.clientX - cx) / R, dy = (t.clientY - cy) / R;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        // Smooth the stick so a held finger never jitters.
        smoothX = smoothX * 0.55 + dx * 0.45;
        smoothY = smoothY * 0.55 + dy * 0.45;
        const mag = Math.min(1, Math.hypot(smoothX, smoothY));
        this.joyVec = { x: smoothX, y: -smoothY };
        this.joyMag = mag;
        setKnob(smoothX * R, smoothY * R);
      }
    }, { passive: false });
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyTouch) continue;
        joyTouch = null; this.joyActive = false; this.joyId = null;
        this.joyVec = { x: 0, y: 0 }; this.joyMag = 0;
        smoothX = 0; smoothY = 0; setKnob(0, 0);
      }
    };
    base.addEventListener('touchend', endJoy);
    base.addEventListener('touchcancel', endJoy);
    camZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      camTouch = t.identifier; camLX = t.clientX; camLY = t.clientY;
      this.camId = t.identifier;
    }, { passive: false });
    camZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== camTouch) continue;
        this.camDX += (t.clientX - camLX) * 1.0;
        this.camDY += (t.clientY - camLY) * 1.0;
        camLX = t.clientX; camLY = t.clientY;
      }
    }, { passive: false });
    const endCam = (e) => {
      for (const t of e.changedTouches) if (t.identifier === camTouch) { camTouch = null; this.camId = null; }
    };
    camZone.addEventListener('touchend', endCam);
    camZone.addEventListener('touchcancel', endCam);
    // Buttons: first tap always fires, with a visible press.
    for (const [id, btn] of Object.entries(this.buttons)) {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.style.background = 'rgba(255,200,60,0.9)';
        btn.style.transform = 'scale(0.92)';
        this.app.sound.ensure(); this.app.sound.click();
        this.app.onTouchButton(id);
      }, { passive: false });
      const release = () => { btn.style.background = 'rgba(20,40,60,0.72)'; btn.style.transform = 'scale(1)'; };
      btn.addEventListener('touchend', release);
      btn.addEventListener('touchcancel', release);
    }
  }
  touchVisible() { return !!this.touchLayer && !this.touchLayer.classList.contains('hidden'); }
}
