"use strict";
// Class mode: a link from a teacher (index.html?class=Latin7&latin=1&era=ancient&city=rome&fights=0&lang=en) starts the game at once, with no login and no saving to any account.
// This file is the first script on the page, because it has to run before any other script reads the browser's storage: in class mode the game's saved data (character, money, what you
// own) goes into sessionStorage instead of localStorage, so every student starts fresh, a shared computer keeps nothing from the lesson once the tab is closed, and a real player's saved
// game on the same computer is never touched. The rest of the game reads window.CLASSMODE (account.js starts the offline "class" state, game.js applies the options, fight.js closes
// the arena when fights=0, latin.js shows Latin names). Options: class (any name: it only appears on the screen), latin=1 (Latin names for Rome), era=ancient|modern, city=rome|delhi|cancun|beijing,
// fights=0 (no gladiator fights), lang=en|es|it|hi|zh, at=<sight id> (start there), hour=<0-24> (start at that hour), hunt=<sight ids, comma separated> (a scavenger hunt: hunt.js), low=1 (light graphics), cid=<8 hex digits> (the teacher watches the class: classreport.js), cur=denarii (keep the game's own money; otherwise the money of a class is called aspcgua). The teacher page (class.html) builds these links. ?latin=1 on its own also works for any player, without class mode.

(() => {
  const q = new URLSearchParams(location.search);
  const clean = (s, n) => String(s || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, n);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  // An offline copy (the zip a teacher can download: opened from the computer's own files) is always a class: no login, nothing sent anywhere.
  const offline = location.protocol === "file:";
  let low = q.get("low") === "1";                                                                        // light graphics for slow computers (also switched on by itself when the game runs slowly: perf.js)
  try { if (!low && localStorage.getItem("rome-low") === "1") low = true; } catch (e) { /* storage unavailable */ }
  const C = {
    low, offline, on: q.has("class") || offline, name: clean(q.get("class") || (offline ? "Offline" : ""), 30),
    latin: q.get("latin") === "1" || q.get("la") === "1",
    era: pick(q.get("era"), ["ancient", "modern"], "ancient"), city: pick(q.get("city"), ["rome", "delhi", "cancun", "beijing"], "rome"),
    fights: q.get("fights") !== "0", lang: pick(q.get("lang"), ["en", "es", "it", "hi", "zh"], "en"), shared: false,
    at: /^[a-z0-9-]{1,24}$/.test(q.get("at") || "") ? q.get("at") : "",                                                   // start at this sight (its id in landmarks.js)
    hour: Number.isFinite(parseFloat(q.get("hour"))) ? Math.max(0, Math.min(24, parseFloat(q.get("hour")))) % 24 : null,   // start at this hour of the day
    cur: q.get("cur") === "denarii" ? "denarii" : "aspcgua",                                                          // the money of the class: a made-up one (aspcgua) unless the link says denarii (i18n.js changes the word)
    cid: /^[0-9a-f]{8}$/.test(q.get("cid") || "") ? q.get("cid") : "",                                              // the class id: the students of this class report their progress to the teacher (classreport.js)
    hunt: (q.get("hunt") || "").split(",").filter((s) => /^[a-z0-9-]{1,24}$/.test(s)).slice(0, 12),                       // the sights to find (the class scavenger hunt: hunt.js)
  };
  window.CLASSMODE = C;
  if (!C.on) return;
  try { if (!low && sessionStorage.getItem("rome-low") === "1") C.low = true; } catch (e) { /* ignore */ }
  try { Object.defineProperty(window, "localStorage", { configurable: true, get: () => window.sessionStorage }); }
  catch (e) { C.shared = true; }                                          // (a browser that does not allow it: the class still works, but the lesson's data stays on this computer)
  try { sessionStorage.setItem("rome-lang", C.lang); } catch (e) { /* storage unavailable */ }
})();
