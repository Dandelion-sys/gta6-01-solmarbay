// Keyboard and mouse input: one action per key, edge-triggered presses.
import { KEYS } from './config.js';
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.mouseX = 0; this.mouseY = 0;
    this.dragging = false; this.dragDX = 0; this.dragDY = 0;
    this.lastMouseDown = 0;
    this._onKeyDown = (e) => this.keyDown(e);
    this._onKeyUp = (e) => this.keyUp(e);
    this._onMouseDown = (e) => this.mouseDown(e);
    this._onMouseUp = (e) => this.mouseUp(e);
    this._onMouseMove = (e) => this.mouseMove(e);
    this._onBlur = () => { this.down.clear(); this.pressed.clear(); };
  }
  attach() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('blur', this._onBlur);
  }
  keyDown(e) {
    if (e.repeat) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    this.down.add(e.code);
    this.pressed.add(e.code);
  }
  keyUp(e) { this.down.delete(e.code); }
  mouseDown(e) {
    this.dragging = true; this.mouseX = e.clientX; this.mouseY = e.clientY;
    this.lastMouseDown = performance.now();
    this.pressed.add('Mouse0');
  }
  mouseUp(e) { this.dragging = false; this.down.delete('Mouse0'); }
  mouseMove(e) {
    if (this.dragging) {
      this.dragDX += e.clientX - this.mouseX;
      this.dragDY += e.clientY - this.mouseY;
    }
    this.mouseX = e.clientX; this.mouseY = e.clientY;
  }
  is(code) { return this.down.has(code); }
  was(code) { return this.pressed.has(code); }
  axis() {
    let x = 0, y = 0;
    if (this.is(KEYS.forward) || this.is('ArrowUp')) y += 1;
    if (this.is(KEYS.back) || this.is('ArrowDown')) y -= 1;
    if (this.is(KEYS.left) || this.is('ArrowLeft')) x -= 1;
    if (this.is(KEYS.right) || this.is('ArrowRight')) x += 1;
    return { x, y };
  }
  consumeDrag() { const d = { x: this.dragDX, y: this.dragDY }; this.dragDX = 0; this.dragDY = 0; return d; }
  endFrame() { this.pressed.clear(); }
}
