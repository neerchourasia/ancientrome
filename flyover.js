"use strict";
// Flyover of Ancient Rome: 🦅 Flyover of Rome in the menu (Getting around). You rise above the city and all you do is hover and look: the camera circles slowly over a famous sight, names it, then glides on
// to the next (the Forum, the Colosseum, the Palatine, the Circus Maximus, the Theatre of Pompey, the Pantheon, Trajan's Column, the Capitoline). Nothing to steer. If you want to look for yourself:
// drag the mouse to look round, the wheel brings you closer or takes you higher, Space stops the tour and you hover where you are (W A S D glide, E up, Q down), Space again goes on with the tour.
// Esc or Land puts you back on the ground where you were. Your character does not move (only the camera does), and it only works in Ancient Rome. Depends on the globals of game.js (mode, player, camera,
// LANDMARKS, groundAt, BOUNDS, era, city, toast, closePanels), Narrator and music.

const Flyover = (() => {
  // the sights, in the order of the tour: [landmark id, how far from it the camera circles (m), how high above the ground (m), seconds spent circling]
  const STOPS = [["forum", 150, 95, 16], ["colosseum", 215, 120, 18], ["palatine", 175, 105, 14], ["circus", 270, 135, 18], ["hercules", 140, 90, 10], ["pompey", 190, 105, 14], ["pantheon", 150, 92, 16], ["trajan", 150, 90, 12], ["capitolium", 150, 100, 14]];
  const SPIN = 0.05;                                       // radians a second round a sight
  const lmOf = (id) => LANDMARKS.find((l) => l.id === id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const ease = (u) => u * u * (3 - 2 * u);
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

  let active = false, auto = true, stops = [], idx = 0, phase = "move", t = 0, spin = 1, a0 = 0, zoom = 1, clock = 0;
  let from = null, to = null, fromLook = null, toLook = null, dur = 8;            // a glide from one place to the next
  let cx = 0, cy = 0, cz = 0, yaw = 0, pitch = -0.4, offY = 0, offP = 0, dragging = false, last = null;
  let bar = null, nameEl = null, subEl = null, toggleBtn = null;

  const groundHere = (x, z) => groundAt(x, z);
  const lookOf = (s) => ({ x: s.lm.x, y: groundHere(s.lm.x, s.lm.z) + 14, z: s.lm.z });
  const stopPos = (s, a) => ({ x: s.lm.x + Math.cos(a) * s.r * zoom, z: s.lm.z + Math.sin(a) * s.r * zoom, y: groundHere(s.lm.x, s.lm.z) + s.alt * zoom });
  function aim(p, q) { return { yaw: Math.atan2(-(q.x - p.x), -(q.z - p.z)), pitch: Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z)) }; }

  // ---------------------------------------------------------------- the bar at the bottom (the name of the sight, and the buttons)
  function makeBar() {
    if (bar) return;
    bar = document.createElement("div"); bar.id = "flyover-bar";
    bar.style.cssText = "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:60;background:rgba(30,22,12,.9);color:#f4ead6;border:1px solid #e2b955;border-radius:12px;padding:10px 14px;font:600 .85rem system-ui,sans-serif;display:none;flex-direction:column;gap:6px;align-items:center;max-width:94vw;text-align:center";
    nameEl = document.createElement("strong"); nameEl.style.cssText = "font:700 1.05rem Georgia,serif;color:#e2b955";
    subEl = document.createElement("span"); subEl.style.cssText = "opacity:.85";
    const help = document.createElement("small"); help.style.cssText = "opacity:.7;font-weight:500"; help.textContent = tr("Drag to look · wheel: closer or higher · Space: hover here or go on · W A S D glide, E up, Q down · Esc to land");
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px";
    const mk = (label, f) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.style.cssText = "font:inherit;cursor:pointer;padding:5px 10px;border-radius:7px;border:1px solid rgba(255,255,255,.3);background:#ffd24a;color:#2a2118"; b.addEventListener("click", f); row.append(b); return b; };
    toggleBtn = mk("", () => toggle()); mk(tr("⌂ Land"), () => stop());
    bar.append(nameEl, subEl, row, help); document.body.append(bar);
  }
  function caption() {
    if (!bar) return;
    const s = stops[idx], named = s && auto;                                           // (on the tour: the sight it circles, or the next one while it glides there)
    nameEl.textContent = named ? tr(s.lm.name) : tr("Over Ancient Rome");
    subEl.textContent = named ? tr(s.lm.sub || "") : "";
    toggleBtn.textContent = auto ? tr("⏸ Hover here") : tr("▶ Tour the sights");
  }

  // ---------------------------------------------------------------- start and stop
  function start() {
    if (active) return;
    if (typeof started === "undefined" || !started) return;
    if (city !== "rome" || era !== "ancient") { toast(tr("The flyover is of Ancient Rome: go to Rome in the ancient time first (the city button, and K for the era).")); return; }
    if (mode !== "walk" || deathT > 0 || sleepT > 0 || (typeof Jail !== "undefined" && Jail.active)) { toast(tr("Close what is open and stop what you are doing first.")); return; }
    if ((typeof Interiors !== "undefined" && Interiors.inside && Interiors.inside()) || Home.inside(player.x, player.z)) { toast(tr("Step outside first: the flyover starts from the street.")); return; }
    closePanels();
    stops = STOPS.map(([id, r, alt, secs]) => ({ lm: lmOf(id), r, alt, secs })).filter((s) => s.lm);
    if (!stops.length) return;
    makeBar(); active = true; auto = true; zoom = 1; offY = offP = 0; clock = 0; last = null;
    mode = "flyover";
    cx = player.x; cy = player.feet + 1.7; cz = player.z; yaw = player.yaw; pitch = player.pitch || 0;
    let best = 0, bd = 1e12; stops.forEach((s, i) => { const d = Math.hypot(s.lm.x - cx, s.lm.z - cz); if (d < bd) { bd = d; best = i; } });
    glideTo(best, { x: cx - Math.sin(yaw) * 40, y: cy - 4, z: cz - Math.cos(yaw) * 40 });
    bar.style.display = "flex"; caption();
    attach();
    toast(tr("Flyover of Ancient Rome: just hover and look. Esc to land."));
  }
  function stop() {
    if (!active) return;
    active = false; dragging = false; mode = "walk";
    detach();
    if (bar) bar.style.display = "none";
    camera.rotation.z = 0;
    toast(tr("You are back on the ground."));
  }

  // glide from where the camera is to a circling place round sight i (arriving from the side it is coming from)
  function glideTo(i, lookNow) {
    idx = i; phase = "move"; t = 0;
    const s = stops[i], a = Math.atan2(cz - s.lm.z, cx - s.lm.x);
    a0 = a;
    from = { x: cx, y: cy, z: cz }; to = stopPos(s, a);
    fromLook = lookNow || (() => { const p = { x: cx - Math.sin(yaw) * 80, z: cz - Math.cos(yaw) * 80 }; return { x: p.x, y: Math.max(groundHere(p.x, p.z), cy + Math.tan(pitch) * 80), z: p.z }; })();
    toLook = lookOf(s);
    dur = Math.max(6, Math.min(16, Math.hypot(to.x - from.x, to.z - from.z) / 24));
    spin = i % 2 ? -1 : 1;
    caption();
  }
  function toggle() {
    if (!active) return;
    if (auto) { auto = false; phase = "free"; caption(); toast(tr("Hovering. W A S D glide, E up, Q down, drag to look. Space goes on with the tour.")); }
    else {
      auto = true; let best = 0, bd = 1e12; stops.forEach((s, i) => { const d = Math.hypot(s.lm.x - cx, s.lm.z - cz); if (d < bd) { bd = d; best = i; } });
      offY = offP = 0; glideTo(best);
    }
  }

  // ---------------------------------------------------------------- the mouse and the keys (only while the flyover is on)
  function onDown(ev) { if (!active || ev.button > 0 || (bar && bar.contains(ev.target))) return; dragging = true; last = { x: ev.clientX, y: ev.clientY }; }
  function onMove(ev) {
    if (!active || !dragging || !last) return;
    const dx = ev.clientX - last.x, dy = ev.clientY - last.y; last = { x: ev.clientX, y: ev.clientY };
    if (auto) { offY = Math.max(-1.4, Math.min(1.4, offY - dx * 0.005)); offP = Math.max(-0.7, Math.min(0.7, offP - dy * 0.005)); }
    else { yaw -= dx * 0.005; pitch = Math.max(-1.45, Math.min(0.6, pitch - dy * 0.005)); }
  }
  function onUp() { dragging = false; }
  function onWheel(ev) { if (!active || (bar && bar.contains(ev.target))) return; ev.preventDefault(); zoom = Math.max(0.5, Math.min(2.2, zoom * (ev.deltaY > 0 ? 1.1 : 0.9))); }
  function onKey(ev) {
    if (!active) return;
    if (ev.code === "Space") { ev.preventDefault(); ev.stopImmediatePropagation(); if (!ev.repeat) toggle(); }
  }
  function attach() {
    window.addEventListener("pointerdown", onDown, true); window.addEventListener("pointermove", onMove, true); window.addEventListener("pointerup", onUp, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false }); window.addEventListener("keydown", onKey, true);
  }
  function detach() {
    window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("pointermove", onMove, true); window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("wheel", onWheel, true); window.removeEventListener("keydown", onKey, true);
  }

  // ---------------------------------------------------------------- every frame
  function update(dt, keys) {
    if (!active) return;
    if (city !== "rome" || era !== "ancient") { stop(); return; }                      // (K switched the era, or you travelled)
    dt = Math.min(dt, 0.1); clock += dt;
    if (auto) {
      t += dt;
      let look;
      if (phase === "move") {
        const u = Math.min(1, t / dur), e = ease(u);
        cx = from.x + (to.x - from.x) * e; cz = from.z + (to.z - from.z) * e; cy = from.y + (to.y - from.y) * e + Math.sin(u * Math.PI) * 22;
        look = { x: fromLook.x + (toLook.x - fromLook.x) * e, y: fromLook.y + (toLook.y - fromLook.y) * e, z: fromLook.z + (toLook.z - fromLook.z) * e };
        if (u >= 1) { phase = "orbit"; t = 0; caption(); const s = stops[idx]; if (typeof Narrator !== "undefined") { try { Narrator.say(`${tr(s.lm.name)}. ${tr(s.lm.sub || "")}`); } catch (e2) { /* ignore */ } } }
      } else {
        const s = stops[idx], p = stopPos(s, a0 + spin * SPIN * t);
        cx = p.x; cy = p.y; cz = p.z; look = lookOf(s);
        if (t > s.secs) glideTo((idx + 1) % stops.length, look);
      }
      const want = aim({ x: cx, y: cy, z: cz }, look);
      const k = Math.min(1, dt * 3);
      yaw += wrap(want.yaw + offY - yaw) * k; pitch += (want.pitch + offP - pitch) * k;
      if (!dragging) { offY *= Math.max(0, 1 - dt * 0.7); offP *= Math.max(0, 1 - dt * 0.7); }                          // (what you looked round at eases back to the sight)
    } else {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx, sp = 34 * zoom * (keys.has("ShiftLeft") ? 2.5 : 1);
      let mx = 0, mz = 0, my = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) { mx += fx; mz += fz; } if (keys.has("KeyS") || keys.has("ArrowDown")) { mx -= fx; mz -= fz; }
      if (keys.has("KeyD") || keys.has("ArrowRight")) { mx += rx; mz += rz; } if (keys.has("KeyA") || keys.has("ArrowLeft")) { mx -= rx; mz -= rz; }
      if (keys.has("KeyE")) my += 1; if (keys.has("KeyQ")) my -= 1;
      cx += mx * sp * dt; cz += mz * sp * dt; cy += my * 22 * dt;
      cx = Math.max(BOUNDS.minX + 5, Math.min(BOUNDS.maxX - 5, cx)); cz = Math.max(BOUNDS.minZ + 5, Math.min(BOUNDS.maxZ - 5, cz));
      cy = Math.max(groundHere(cx, cz) + 35, Math.min(groundHere(cx, cz) + 420, cy));
    }
  }
  function cameraUpdate(cam) {
    if (!active) return false;
    const bob = Math.sin(clock * 0.7) * 1.1;
    cam.position.set(cx, cy + bob, cz);
    cam.rotation.set(pitch, yaw, Math.sin(clock * 0.45) * 0.012);
    return true;
  }

  function wire() { const b = document.getElementById("btn-flyover"); if (b) b.addEventListener("click", start); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();

  return { start, stop, update, camera: cameraUpdate, get active() { return active; }, get auto() { return auto; }, get state() { return { phase, idx, auto, zoom }; } };
})();
