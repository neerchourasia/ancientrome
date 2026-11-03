"use strict";
// The travel clip: when you travel to another city (✈ Travel, or B) a short animation plays while the game builds the city: in the modern era an airliner flies over the clouds, in
// the ancient era a sailing ship crosses the sea (and a river boat takes you to inland Beijing, over the Grand Canal). It is drawn on a canvas, plays about four and a half seconds
// and can be skipped with a click, Space, Enter or Esc. The city is built under the clip just before it ends, so what you see afterwards is the new city. Depends on audio.js (Sfx).

const TravelClip = (() => {
  const NAMES = { rome: "Rome", delhi: "Delhi", cancun: "Cancún", beijing: "Beijing" };
  const DUR = 4.6, ARRIVE = 3.6, W = 960, H = 540;
  const LON = { cancun: -87, rome: 12, delhi: 77, beijing: 116 };                         // (east is to the right, so a trip to Beijing heads right and a trip to Cancún heads left)
  const headingOf = (from, to) => ((LON[to] ?? 0) >= (LON[from] ?? 0) ? 1 : -1);
  let ov = null, cv = null, g = null, textEl = null, subEl = null, raf = 0, run = null;

  function build() {
    ov = document.createElement("div"); ov.id = "tclip"; ov.setAttribute("aria-hidden", "true");
    ov.innerHTML = '<canvas id="tclip-cv" width="960" height="540"></canvas><div id="tclip-text"><b></b><small></small></div><button id="tclip-skip" type="button">Skip ▸</button>';
    document.body.append(ov);
    cv = ov.querySelector("#tclip-cv"); g = cv.getContext("2d"); textEl = ov.querySelector("b"); subEl = ov.querySelector("small");
    ov.addEventListener("click", () => finish());
  }

  const wave = (x, t, amp, len, speed, ph) => Math.sin((x / len) + t * speed + ph) * amp;

  function cloud(x, y, s, alpha) {
    g.fillStyle = `rgba(255,255,255,${alpha})`;
    for (const [dx, dy, r] of [[0, 0, 34], [38, -10, 42], [82, 0, 36], [44, 12, 38], [-30, 10, 26], [112, 10, 24]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); }
  }

  function drawPlane(t) {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#2f6fb8"); sky.addColorStop(0.65, "#8fc4ee"); sky.addColorStop(1, "#f6dcb4"); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,244,200,.85)"; g.beginPath(); g.arc(760, 130, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,244,200,.25)"; g.beginPath(); g.arc(760, 130, 86, 0, Math.PI * 2); g.fill();
    for (const [y, s, sp, a] of [[120, 0.8, 30, 0.55], [380, 1.2, 190, 0.8], [240, 1.0, 90, 0.7], [450, 1.6, 300, 0.9], [60, 0.7, 20, 0.45]]) {
      for (let k = 0; k < 3; k++) cloud(((k * 520 - t * sp) % 1560 + 1560) % 1560 - 200, y + k * 17, s, a);
    }
    const px = W * 0.5 + Math.sin(t * 0.7) * 14, py = H * 0.43 + Math.sin(t * 1.6) * 8, tilt = Math.sin(t * 0.9) * 0.03;
    g.save(); g.translate(px, py); g.rotate(-0.04 + tilt);
    const trail = g.createLinearGradient(-60, 0, -460, 0); trail.addColorStop(0, "rgba(255,255,255,.7)"); trail.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = trail; g.fillRect(-460, 8, 400, 7);
    g.fillStyle = "#c33a2f"; g.beginPath(); g.moveTo(-150, -14); g.lineTo(-195, -88); g.lineTo(-160, -88); g.lineTo(-100, -14); g.closePath(); g.fill();   // the tail fin
    g.fillStyle = "#f4f6f8"; g.beginPath(); g.moveTo(-190, -4); g.quadraticCurveTo(-190, -34, -140, -36); g.lineTo(120, -36); g.quadraticCurveTo(205, -30, 232, 4); g.quadraticCurveTo(205, 34, 120, 38); g.lineTo(-140, 38); g.quadraticCurveTo(-190, 34, -190, -4); g.fill();   // the body
    g.fillStyle = "#c9d3de"; g.beginPath(); g.moveTo(-190, 12); g.quadraticCurveTo(-170, 38, -140, 38); g.lineTo(120, 38); g.quadraticCurveTo(190, 36, 226, 14); g.lineTo(-190, 14); g.fill();
    g.fillStyle = "#c33a2f"; g.fillRect(-120, 2, 300, 5);                                                                                                  // the stripe
    g.fillStyle = "#2a4a6a"; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(-96 + i * 17.5, -12, 4.2, 0, Math.PI * 2); g.fill(); }                  // the windows
    g.beginPath(); g.moveTo(178, -24); g.quadraticCurveTo(210, -26, 222, -8); g.lineTo(184, -8); g.closePath(); g.fill();                                  // the cockpit
    g.fillStyle = "#aeb9c6"; g.beginPath(); g.moveTo(-20, 30); g.lineTo(-100, 118); g.lineTo(-62, 118); g.lineTo(70, 30); g.closePath(); g.fill();              // the wing
    g.fillStyle = "#7b8794"; g.beginPath(); g.ellipse(10, 78, 36, 14, 0, 0, Math.PI * 2); g.fill();                                                       // the engine
    g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.ellipse(-30 + Math.sin(t * 40) * 1.5, 78, 4, 13, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawBoat(t, river) {
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62); sky.addColorStop(0, river ? "#9fb8c9" : "#78aee0"); sky.addColorStop(1, "#f7e3bf"); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,238,190,.9)"; g.beginPath(); g.arc(210, 170, 40, 0, Math.PI * 2); g.fill();
    for (const [y, s, sp, a] of [[90, 0.7, 14, 0.7], [170, 0.9, 22, 0.6]]) for (let k = 0; k < 3; k++) cloud(((k * 520 - t * sp) % 1560 + 1560) % 1560 - 200, y, s, a);
    const hy = H * 0.62;
    g.strokeStyle = "#fff"; g.lineWidth = 2.5;                                                                                                            // the gulls (a river has few)
    if (!river) for (let k = 0; k < 4; k++) { const gx = ((k * 260 - t * (50 + k * 8)) % 1100 + 1100) % 1100 - 80, gy = 90 + k * 30 + Math.sin(t * 1.3 + k) * 10, f = Math.sin(t * 6 + k * 2) * 7; g.beginPath(); g.moveTo(gx - 14, gy + f); g.quadraticCurveTo(gx - 6, gy - 6, gx, gy); g.quadraticCurveTo(gx + 6, gy - 6, gx + 14, gy + f); g.stroke(); }
    if (river) { g.fillStyle = "#6f8f5a"; g.fillRect(0, hy - 26, W, 30); g.fillStyle = "#587a46"; for (let x = -20; x < W + 40; x += 46) { g.beginPath(); g.arc(x + ((-t * 18) % 46), hy - 20, 22, Math.PI, 0); g.fill(); } }   // the banks and willows
    const layers = river ? [["#4f7f8a", 6, 0.7], ["#5f9399", 8, 0.9], ["#7cb0ae", 10, 1.1]] : [["#14487a", 9, 0.8], ["#1f6aa5", 12, 1.1], ["#3d94c9", 15, 1.4]];
    const waveAt = (x, i) => wave(x, t, layers[i][1], 46 + i * 20, layers[i][2] * 2.2, i * 1.7);
    g.fillStyle = layers[0][0]; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 12) g.lineTo(x, hy + 8 + waveAt(x, 0)); g.lineTo(W, H); g.closePath(); g.fill();
    // the ship, riding the middle wave
    const bx = W * 0.5, slope = (waveAt(bx + 10, 1) - waveAt(bx - 10, 1)) / 20, by = hy + 36 + waveAt(bx, 1) * 0.9;
    g.save(); g.translate(bx, by); g.rotate(slope * 0.9 + Math.sin(t * 1.1) * 0.015);
    g.strokeStyle = "#5a3b22"; g.lineWidth = 7; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -230); g.stroke();                                           // the mast
    g.lineWidth = 5; g.beginPath(); g.moveTo(-104, -214); g.lineTo(104, -214); g.stroke();                                                                 // the yard
    const bulge = 12 + Math.sin(t * 1.4) * 4;
    g.fillStyle = "#f2e6c8"; g.beginPath(); g.moveTo(-100, -212); g.quadraticCurveTo(-100 + bulge * 2, -120, -96, -34); g.lineTo(96, -34); g.quadraticCurveTo(100 + bulge * 2, -120, 100, -212); g.closePath(); g.fill();   // the sail
    g.fillStyle = "#b33a2a"; g.fillRect(-98, -150, 196, 22); g.fillStyle = "#e0c66a"; g.fillRect(-98, -146, 196, 4);                                        // its red band
    g.strokeStyle = "#5a3b22"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -230); g.lineTo(-170, -22); g.moveTo(0, -230); g.lineTo(150, -22); g.stroke();       // the ropes
    g.fillStyle = "#7a4a24"; g.beginPath(); g.moveTo(-190, -30); g.quadraticCurveTo(-176, 22, -120, 30); g.lineTo(130, 30); g.quadraticCurveTo(190, 20, 206, -44); g.lineTo(190, -34); g.lineTo(-180, -34); g.closePath(); g.fill();   // the hull
    g.fillStyle = "#e0c66a"; g.fillRect(-176, -34, 366, 6);
    g.fillStyle = "#4a2e16"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(-120 + i * 52, -8, 5, 0, Math.PI * 2); g.fill(); }
    g.restore();
    for (let i = 1; i < layers.length; i++) { g.fillStyle = layers[i][0]; g.globalAlpha = i === 2 ? 0.92 : 0.95; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 12) g.lineTo(x, hy + 28 + i * 26 + waveAt(x, i)); g.lineTo(W, H); g.closePath(); g.fill(); }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 2;                                                                                              // the wake and foam
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = bx - 120; x > 0; x -= 14) { const y = by + 28 + k * 5 + Math.sin((x + t * 60) / 12) * 2; if (x === bx - 120) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
  }

  function drawRoute(p, plane, dir, from, to) {                                          // the line along the bottom: from where you left to where you are going, the way you are heading
    const x0 = dir > 0 ? 140 : W - 140, x1 = dir > 0 ? W - 140 : 140, y = H - 54;
    g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 3; g.setLineDash([2, 9]); g.lineCap = "round"; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]);
    g.strokeStyle = "#ffe08a"; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + (x1 - x0) * p, y); g.stroke();
    g.fillStyle = "#fff"; for (const x of [x0, x1]) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
    g.font = "bold 15px Georgia, serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 5;
    g.fillText(NAMES[from] || "", x0, y + 28); g.fillText(NAMES[to] || "", x1, y + 28); g.shadowBlur = 0;
    g.save(); g.translate(x0 + (x1 - x0) * p, y - 12); if (dir < 0) g.scale(-1, 1); g.font = "26px sans-serif"; g.textAlign = "center"; g.fillText(plane ? "✈️" : "⛵", 0, 0); g.restore();
  }
  function drawScene(kind, t, river, dir) {                                              // the picture itself, mirrored when the trip goes west
    g.save(); if (dir < 0) { g.translate(W, 0); g.scale(-1, 1); }
    if (kind === "plane") drawPlane(t); else drawBoat(t, river);
    g.restore();
  }

  function frame(now) {
    if (!run) return;
    const t = (now - run.t0) / 1000, p = Math.min(1, t / DUR);
    drawScene(run.kind, t, run.river, run.dir); drawRoute(p, run.kind === "plane", run.dir, run.from, run.to);
    const fade = t < 0.45 ? 1 - t / 0.45 : t > DUR - 0.5 ? (t - (DUR - 0.5)) / 0.5 : 0;
    if (fade > 0) { g.fillStyle = `rgba(5,6,12,${Math.min(1, fade)})`; g.fillRect(0, 0, W, H); }
    raf = requestAnimationFrame(frame);
  }

  function arrive() { if (run && !run.arrived) { run.arrived = true; try { run.at(); } catch (err) { console.error(err); } } }
  function finish() {
    if (!run) return;
    arrive();
    clearTimeout(run.t1); clearTimeout(run.t2); cancelAnimationFrame(raf);
    removeEventListener("keydown", onKey, true);
    ov.classList.remove("show");
    const done = run.done; run = null;
    try { done(); } catch (err) { console.error(err); }
  }
  function onKey(e) { if (e.code === "Escape" || e.code === "Space" || e.code === "Enter") { e.preventDefault(); e.stopPropagation(); finish(); } }

  // o: { from, to, era ("ancient" or "modern"), at (builds the new city: called just before the end, or when skipped), done }
  function play(o) {
    if (run) return false;
    if (!ov) build();
    const modern = o.era === "modern", river = !modern && (o.to === "beijing" || o.from === "beijing");
    run = { kind: modern ? "plane" : "boat", river, dir: headingOf(o.from, o.to), from: o.from, to: o.to, at: o.at, done: o.done, t0: performance.now(), arrived: false };
    const verb = modern ? "Flying" : "Sailing";
    textEl.textContent = `${verb} to ${NAMES[o.to] || o.to}`;
    subEl.textContent = `${NAMES[o.from] || o.from} → ${NAMES[o.to] || o.to}${modern ? "" : river ? " · by river boat along the Grand Canal" : " · across the sea"}`;
    ov.classList.add("show");
    addEventListener("keydown", onKey, true);
    try { Sfx.play(modern ? "jet" : "sail"); } catch (e) { /* ignore */ }
    run.t1 = setTimeout(arrive, ARRIVE * 1000);                                           // (timers, not animation frames: a hidden tab must not get stuck on the clip)
    run.t2 = setTimeout(finish, DUR * 1000 + 100);
    raf = requestAnimationFrame(frame);
    return true;
  }
  // draws one frame without playing (for looking at the artwork): TravelClip.preview("plane" or "boat", seconds, river, from, to)
  function preview(kind, t, river, from = "rome", to = "beijing") {
    if (!ov) build();
    textEl.textContent = `${kind === "plane" ? "Flying" : "Sailing"} to ${NAMES[to]}`; subEl.textContent = `${NAMES[from]} → ${NAMES[to]}`;
    ov.classList.add("show"); drawScene(kind, t, !!river, headingOf(from, to)); drawRoute(Math.min(1, t / DUR), kind === "plane", headingOf(from, to), from, to);
  }
  return { play, preview, hide: () => ov && ov.classList.remove("show"), get active() { return !!run; } };
})();
