"use strict";
// The first few minutes: a small card in the corner walks a new player through six steps and ticks each one off as they do it (walk, look round, open the menu, ask for directions,
// reach a famous place, earn a few denarii). Finishing pays 50 denarii. "Skip" ends it, and it never comes back (🎓 Tutorial in the menu starts it again).
// Depends on vitals.js and the globals of game.js (player, started, mode, currentLm, panelOpen, Character).

const Tutorial = (() => {
  const KEY = "rome-tut";
  let state = "", step = 0, x0 = 0, z0 = 0, yaw0 = 0, coins0 = 0, el = null, doneFlags = {}, timer = 0;
  try { state = localStorage.getItem(KEY) || ""; } catch (e) { /* storage unavailable */ }
  const STEPS = [
    ["Walk about", "Press W A S D (or the arrow keys) and walk around.", () => Math.hypot(player.x - x0, player.z - z0) > 8],
    ["Look around", "Click the game, then move the mouse to turn your head.", () => Math.abs(Math.atan2(Math.sin(player.yaw - yaw0), Math.cos(player.yaw - yaw0))) > 0.9],
    ["Open the menu", "Press the ☰ button at the top right: everything in the game is in there.", () => !!doneFlags.menu],
    ["Ask for directions", "Press G (or the yellow Directions bar) and pick a place: a line leads you there.", () => !!doneFlags.dirs],
    ["Visit a famous place", "Walk to any landmark: its card appears at the bottom left.", () => typeof currentLm !== "undefined" && !!currentLm && !currentLm.home],
    ["Earn some denarii", "Take a job (💼 Jobs), the daily gift, or a quest from a citizen with a yellow !.", () => Vitals.coins > coins0 || Vitals.coins >= 1000],   // (the demo stops at 1,000 denarii, so that counts)
  ];
  const save = (v) => { state = v; try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } };

  function build() {
    el = document.createElement("div"); el.id = "tut"; el.hidden = true;
    el.innerHTML = '<b id="tut-title"></b><p id="tut-text"></p><div class="tut-bar"><i id="tut-fill"></i></div><button id="tut-skip" type="button">Skip tutorial</button>';
    document.body.append(el);
    el.querySelector("#tut-skip").addEventListener("click", () => { save("done"); el.hidden = true; toast("Tutorial skipped. You can start it again from the menu (🎓 Tutorial)."); });
  }
  function show() {
    if (!el) build();
    const [name, text] = STEPS[step];
    el.hidden = false;
    el.querySelector("#tut-title").textContent = `🎓 Step ${step + 1} of ${STEPS.length}: ${name}`;
    el.querySelector("#tut-text").textContent = text;
    el.querySelector("#tut-fill").style.width = `${(step / STEPS.length) * 100}%`;
  }
  function begin() {
    save("on"); step = 0; doneFlags = {}; x0 = player.x; z0 = player.z; yaw0 = player.yaw; coins0 = Vitals.coins; show();
  }
  function tick() {
    if (typeof started === "undefined" || !started || state === "done" || typeof Character === "undefined" || !Character.exists) return;
    if (state === "") { if (mode === "walk" && !panelOpen) begin(); return; }
    if (state !== "on") return;
    if (el && el.hidden) show();
    if (STEPS[step][2]()) {
      Sfx.play("gate"); step++;
      if (step >= STEPS.length) {
        save("done"); el.hidden = true; Vitals.coins += 50; Sfx.play("medal");
        toast("🎓 Tutorial finished: +50 denarii! Explore, make money, and build something great. The menu has everything else.");
      } else { x0 = player.x; z0 = player.z; yaw0 = player.yaw; show(); }
    }
  }
  function bind() {
    const m = document.getElementById("btn-menu"); if (m) m.addEventListener("click", () => { doneFlags.menu = true; });
    const d = document.getElementById("btn-dirs"); if (d) d.addEventListener("click", () => { doneFlags.dirs = true; });
    window.addEventListener("keydown", (e) => { if (e.code === "KeyG") doneFlags.dirs = true; });
    const t = document.getElementById("btn-tut"); if (t) t.addEventListener("click", () => { if (typeof closePanels === "function") closePanels(); if (mode === "walk") begin(); else toast("Start the tutorial while you are walking about."); });
    timer = setInterval(tick, 700);
  }
  return { bind, begin, get state() { return state; } };
})();
