// Keyboard and mouse input. One action per key; E is the single context
// key and the HUD always says what E will do right now.
export const KEYMAP = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', interact: 'KeyE', enterCar: 'KeyF',
  punch: 'KeyQ', aim: 'MouseRight', shoot: 'MouseLeft',
  focus: 'KeyC', phone: 'KeyP', map: 'KeyM', pause: 'Escape',
  switchChar: 'KeyT', radio: 'KeyR', horn: 'KeyH', jump: 'Space',
};
export function createInput() {
  return {
    keys: new Set(), pressed: new Set(), mouseDX: 0, mouseDY: 0,
    mouseDown: false, mouseRight: false, dragging: false,
    down(code) { return this.keys.has(code); },
    hit(code) { return this.pressed.has(code); },
    clearPressed() { this.pressed.clear(); this.mouseDX = 0; this.mouseDY = 0; },
  };
}
export function attachInput(input, element) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code); input.pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  element.addEventListener('mousedown', (e) => {
    input.mouseDown = true; input.dragging = true;
    if (e.button === 2) input.mouseRight = true;
    if (e.button === 0) input.pressed.add('MouseLeft');
  });
  window.addEventListener('mouseup', (e) => {
    input.mouseDown = false; input.dragging = false;
    if (e.button === 2) input.mouseRight = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (input.dragging) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  element.addEventListener('contextmenu', (e) => e.preventDefault());
}
