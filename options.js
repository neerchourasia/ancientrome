"use strict";
// Page options from the address, read before any other script: ?low=1 (light graphics for slow computers; also switched on by itself when the game runs slowly: perf.js, and kept in the browser as rome-low)
// and ?latin=1 (Latin names for Rome: latin.js). Read by game.js, perf.js, latin.js, period.js and the city files through window.GAMEOPTS.

(() => {
  const q = new URLSearchParams(location.search);
  let low = q.get("low") === "1";
  try { if (!low && localStorage.getItem("rome-low") === "1") low = true; } catch (e) { /* storage unavailable */ }
  window.GAMEOPTS = { low, latin: q.get("latin") === "1" || q.get("la") === "1" };
})();
