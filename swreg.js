"use strict";
// Saves the game in the browser so it opens without the internet (sw.js). Only on the real website (not from a local file, where browsers do not allow it) and only when the browser has the feature.
// In class mode a small line in the bar says when the computer has no internet and that the game still works.
(() => {
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    const v = (document.currentScript && new URL(document.currentScript.src).searchParams.get("v")) || "0";
    addEventListener("load", () => navigator.serviceWorker.register(`sw.js?v=${v}`).catch(() => { /* not allowed here: the game works as before */ }));
  }
})();
