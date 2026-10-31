"use strict";
// The visitor's journey: a short list of what they did on this visit ("went to Delhi", "bought a plane", "started the naval battle"), sent to the game server
// a few lines at a time so the admins' User journey tab can show it. It watches the game (where you are, what you own, which game you are in) instead of
// being called from everywhere, and it never records chat or anything you type. Only the demo and logged-in players on a server that is switched on send anything.
// Depends on online.js (Online.journey), account.js, market.js, vitals.js and the globals of game.js.

const Journey = (() => {
  const sid = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const t0 = Date.now();
  let queue = [], last = {}, items = null, shifts = null, coins = null, poll = 0, flushAt = 0, startedNoted = false;

  const note = (kind, detail) => { queue.push([Math.round((Date.now() - t0) / 1000), kind, String(detail == null ? "" : detail).slice(0, 60)]); if (queue.length > 80) queue.shift(); };
  const flush = () => { while (queue.length) Online.journey(sid, queue.splice(0, 8)); };
  const nameOf = (id) => { try { const l = ALL_LANDMARKS.find((x) => x.id === id); return l ? l.name : id; } catch (e) { return id; } };
  const itemName = (id) => { try { return Market.itemName(id) || id; } catch (e) { return id; } };

  function who() { return Account.loggedIn ? "logged in" : Account.demo ? "demo" : "guest"; }

  function watch() {
    if (typeof started === "undefined" || !started) return;
    if (!startedNoted) { startedNoted = true; note("play", `started playing (${who()}), ${city} ${era}`); last = { city, era, mode, car: Car.current || "", who: who(), dead: false }; items = new Set(Market.snapshot().items); shifts = Jobs.snapshot().shifts; coins = Vitals.coins; last.seen = discovered.size; return; }
    if (city !== last.city) { note("city", city); last.city = city; }
    if (era !== last.era) { note("era", era); last.era = era; }
    if (mode !== last.mode) {
      if (mode !== "walk" && mode !== "drive") note("mode", mode);
      last.mode = mode;
    }
    const car = Car.current || "";
    if (car !== last.car || (mode === "drive") !== !!last.driving) {
      if (car && mode === "drive" && !last.driving) note("vehicle", `got in ${(Car.MODELS[car] || {}).name || car}`);
      else if (car && car !== last.car) note("vehicle", `took out ${(Car.MODELS[car] || {}).name || car}`);
      else if (!car && last.car) note("vehicle", "put the vehicle away");
      last.car = car; last.driving = mode === "drive";
    }
    if (discovered.size > last.seen) { for (const id of discovered) if (!last.ids || !last.ids.has(id)) { if (last.ids) note("discover", nameOf(id)); } last.ids = new Set(discovered); }
    last.seen = discovered.size; if (!last.ids) last.ids = new Set(discovered);
    const w = who(); if (w !== last.who) { note(w === "logged in" ? "login" : w === "demo" ? "demo" : "logout", w); last.who = w; }
    const dead = deathT > 0; if (dead && !last.dead) note("death", "died"); last.dead = dead;
    const cur = new Set(Market.snapshot().items);
    for (const id of cur) if (!items.has(id)) note("buy", itemName(id));
    for (const id of items) if (!cur.has(id)) note("sell", itemName(id));
    items = cur;
    const sh = Jobs.snapshot().shifts; if (sh > shifts) note("job", `finished a job shift (${sh} in all)`); shifts = sh;
    const c = Vitals.coins; if (Math.abs(c - coins) >= 300) { note("money", `${c > coins ? "+" : ""}${Math.round(c - coins)} denarii (now ${c})`); coins = c; }
  }

  function update() {
    const t = performance.now(); if (t - poll < 1000) return; poll = t;   // once a second of real time (the game's own clock can run slow)
    try { watch(); } catch (e) { if (!api.warned) { api.warned = true; console.warn("Journey:", e.message); } }   // the recorder must never get in the way of the game
    flushAt += 1; if (flushAt >= 15) { flushAt = 0; flush(); }
  }

  function bind() {
    note("arrive", `opened the game (${document.documentElement.clientWidth < 700 ? "phone" : "computer"})`);
    document.addEventListener("visibilitychange", () => { if (document.hidden) { note("left", "left the page"); flush(); } });
    addEventListener("pagehide", () => { note("left", "closed the game"); flush(); });
    setTimeout(flush, 3000);
  }

  const api = { bind, update, warned: false, pending: () => queue.slice() };
  return api;
})();
