"use strict";
// Light graphics for slow computers (a school laptop, an old Chromebook). Light mode draws the picture at three quarters of the size, with no shadows and no edge smoothing, a shorter view distance and
// fewer people, which on a slow graphics chip can double the frame rate. It is on when the link has low=1 (class.html has a box for it), when the browser remembers it (rome-low), or when the game notices
// it is running slowly: under 20 frames a second for two checks of four seconds each. The game then says so and starts again in light mode (class mode keeps the student's progress across the restart,
// because it lives in the tab). The button in the menu (⚡ Graphics) and in the class bar switches it by hand, either way. Light mode is decided when the page loads (the renderer is made then), so
// switching reloads the page. Depends on classmode.js (CLASSMODE.low) and game.js (toast).

const Perf = (() => {
  const low = () => !!(window.CLASSMODE && CLASSMODE.low);
  let acc = 0, frames = 0, slow = 0, off = false, offered = false;
  const remember = (on) => { try { localStorage.setItem("rome-low", on ? "1" : "0"); } catch (e) { /* storage unavailable */ } };

  function set(on, why) {
    remember(on);
    if (typeof toast === "function") toast(why || (on ? "Light graphics on: the page reloads..." : "Normal graphics: the page reloads..."));
    setTimeout(() => location.reload(), 1500);
  }
  // called every frame with the time the frame took
  function frame(dt) {
    if (off || low() || typeof started === "undefined" || !started || document.hidden || dt > 0.6) return;     // (a pause, or a tab that was in the background, is not slowness)
    acc += dt; frames++;
    if (acc < 4) return;
    const fps = frames / acc; acc = 0; frames = 0;
    slow = fps < 20 ? slow + 1 : 0;
    if (slow >= 2 && !offered) { offered = true; set(true, "The game is running slowly, so it is switching to light graphics..."); }
  }
  const label = () => (low() ? "⚡ Light graphics: on" : "⚡ Light graphics: off");
  function bind() {
    for (const id of ["btn-gfx", "class-low"]) {
      const b = document.getElementById(id); if (!b) continue;
      b.textContent = label();
      b.addEventListener("click", () => { off = true; set(!low()); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
  return { frame, set, get low() { return low(); } };
})();
