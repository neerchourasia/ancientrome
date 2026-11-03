"use strict";
// Gamepad support: plug in (or pair by Bluetooth) a game controller (a Switch Pro Controller or Joy-Cons, an Xbox or PlayStation pad...), press a button once so the browser notices it,
// and play. It uses the browser's Gamepad API (Chrome, Edge, Firefox and Safari on a computer, and Chrome on Android) and presses the same keys you would, so every part of the game works.
//   Left stick  walk (strafe); in a vehicle, steer and gas      Right stick  look around (on foot)       L1  run / block (hold)        R1  shove
//   Bottom button  jump / swing / paddle / whip (Space)         Right button  interact (F)               Left button  get in or out of a vehicle (X)       Top button  rest (Z)
//   R2 gas (W)   L2 brake (S)   D-pad up map (M)   D-pad down controls help (H)   D-pad left and right turn (Q, E)   Select directions (G)   Start close (Esc)   Stick clicks: camera (C), ancient/modern (K)
// (These are the buttons by position, the same on every pad: the bottom button is A on an Xbox pad and B on a Nintendo one.) While a menu or panel is open, the left stick and D-pad
// move between its buttons, the right button presses the one you are on and the bottom button closes the panel. Depends on game.js (keys, sendKey, started, panelOpen, mode, player, toast).

const Pad = (() => {
  const KEY = "rome-pad", DEAD = 0.25, LOOK_YAW = 2.6, LOOK_PITCH = 1.8;
  let enabled = true, pad = null, last = 0, shown = false, navT = 0, panelBtn = false;
  try { enabled = localStorage.getItem(KEY) !== "off"; } catch (e) { /* storage unavailable */ }
  const BUTTONS = { 0: "Space", 1: "KeyF", 2: "KeyX", 3: "KeyZ", 4: "ShiftLeft", 5: "KeyR", 8: "KeyG", 9: "Escape", 10: "KeyC", 11: "KeyK", 12: "KeyM", 13: "KeyH", 14: "KeyQ", 15: "KeyE" };
  const held = new Set();
  function press(code, down) {
    if (down === held.has(code)) return;
    if (down) { held.add(code); keys.add(code); sendKey("keydown", code); }
    else { held.delete(code); keys.delete(code); sendKey("keyup", code); }
  }
  const releaseAll = () => { for (const c of [...held]) press(c, false); };
  const dz = (v) => (Math.abs(v) < DEAD ? 0 : v);

  function find() {
    const list = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    let best = null;
    for (const p of list) if (p && p.connected && (!best || (p.mapping === "standard" && best.mapping !== "standard"))) best = p;
    return best;
  }

  // the panel that is open on top, and the buttons in it that can be pressed
  function openPanel_() {
    const roots = [...document.querySelectorAll('#account.show, #online.show, .dpanel.show, #market.show, #bigmap.show, #places.show, #controls.show, #result.show, #creator.show, #dialog:not([hidden])')];
    return roots.length ? roots[roots.length - 1] : null;
  }
  function focusables(root) {
    return [...root.querySelectorAll('button, input:not([type="hidden"]), select, a[href]')].filter((e) => !e.disabled && !e.hidden && e.offsetParent !== null);
  }
  function moveFocus(root, dir) {
    const list = focusables(root); if (!list.length) return;
    let i = list.indexOf(document.activeElement);
    i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    list[i].focus(); list[i].scrollIntoView({ block: "nearest" });
  }

  function poll(now) {
    requestAnimationFrame(poll);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!enabled) { if (held.size) releaseAll(); return; }
    const p = find();
    if (!p) { if (pad) { pad = null; releaseAll(); toast("Gamepad disconnected."); } return; }
    if (!pad || pad.index !== p.index) {
      pad = p;
      if (!shown) { shown = true; toast(`🎮 Gamepad connected (${String(p.id).replace(/\s*\(.*$/, "").slice(0, 40)}): left stick walks, right stick looks, bottom button jumps, right button is F. D-pad down shows the controls.`); }
    }
    pad = p;
    if (typeof started === "undefined" || !started) { releaseAll(); return; }
    const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
    const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
    const root = typeof panelOpen !== "undefined" && panelOpen ? openPanel_() : null;
    if (root || (typeof panelOpen !== "undefined" && panelOpen)) {
      // a menu is open: the stick and D-pad move between its buttons, the right button presses one, the bottom button (or Start) closes it
      for (const c of [...held]) if (c !== "Escape") press(c, false);
      navT -= dt;
      const dir = (ly > 0.5 || b(13) || b(15) || lx > 0.6) ? 1 : (ly < -0.5 || b(12) || b(14) || lx < -0.6) ? -1 : 0;
      if (dir && navT <= 0 && root) { moveFocus(root, dir); navT = 0.22; } else if (!dir) navT = 0;
      const a = b(1);
      if (a && !panelBtn && document.activeElement && root && root.contains(document.activeElement)) document.activeElement.click();
      const close = b(0) || b(9);
      press("Escape", close && !panelBtn);
      panelBtn = a || close;
      return;
    }
    panelBtn = false;
    const foot = typeof mode !== "undefined" && (mode === "walk" || mode === "online" || mode === "watch");
    press("KeyA", lx < -0.5); press("KeyD", lx > 0.5);
    press("KeyW", ly < -0.5 || b(7) || (p.buttons[7] && p.buttons[7].value > 0.3)); press("KeyS", ly > 0.5 || (p.buttons[6] && p.buttons[6].value > 0.3));
    for (const i of Object.keys(BUTTONS)) press(BUTTONS[i], b(Number(i)));
    if (foot && (rx || ry)) {                                  // look around, like moving the mouse
      player.yaw -= rx * LOOK_YAW * dt;
      player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - ry * LOOK_PITCH * dt));
    }
  }

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch (e) { /* ignore */ }
    if (!enabled) releaseAll();
    label();
    toast(enabled ? (find() ? "Gamepad on." : "Gamepad on: connect a controller and press a button on it.") : "Gamepad off.");
  }
  const label = () => { const b = document.getElementById("btn-pad"); if (b) b.textContent = enabled ? "🎮 Gamepad: on" : "🎮 Gamepad: off"; };

  function bind() {
    const b = document.getElementById("btn-pad"); if (b) b.addEventListener("click", toggle);
    label();
    addEventListener("gamepadconnected", () => { shown = false; });
    addEventListener("gamepaddisconnected", () => releaseAll());
    requestAnimationFrame(poll);
  }
  return { bind, toggle, get connected() { return !!pad; }, get on() { return enabled; } };
})();
