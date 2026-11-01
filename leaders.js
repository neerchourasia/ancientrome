"use strict";
// Leaderboards: the richest players, who has the most treasures and who owns the most houses (players with an account). Every minute the game tells the server your
// three numbers; the 🏆 Leaderboard button in the menu shows the top ten of each. You can switch yourself off the boards with the box in the panel.
// Depends on online.js, vitals.js, relics.js, estate.js and the globals of game.js.

const Leaders = (() => {
  const KEY = "rome-leaders-hide";
  let hidden = false, timer = 0;
  try { hidden = localStorage.getItem(KEY) === "1"; } catch (e) { /* storage unavailable */ }
  const $l = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "social", ...o });

  function report() {
    if (!Online.connected || typeof Account === "undefined" || !Account.loggedIn) return;
    if (hidden) { send({ a: "stats", hide: 1 }); return; }
    send({ a: "stats", coins: Math.round(Vitals.coins), relics: Relics.owned.length, houses: Estate.count });
  }

  function show(m) {
    const fill = (id, rows, unit) => {
      const ol = $l(id); ol.replaceChildren();
      if (!rows.length) { const li = document.createElement("li"); li.className = "dim"; li.textContent = "Nobody yet."; ol.append(li); return; }
      for (const [name, n] of rows) { const li = document.createElement("li"); li.textContent = `${name}: ${n.toLocaleString()}${unit}`; ol.append(li); }
    };
    fill("lb-coins", m.coins || [], " denarii"); fill("lb-relics", m.relics || [], " of 12"); fill("lb-houses", m.houses || [], "");
  }

  function open() {
    $l("lb-hide").checked = hidden;
    report(); send({ a: "leaders" });
    openPanel("#leaders");
  }

  function bind() {
    const b = $l("btn-leaders"); if (b) b.addEventListener("click", () => { if (!Online.connected) { toast("The leaderboards need the game server: log in and wait to be connected."); return; } open(); });
    if ($l("lb-hide")) $l("lb-hide").addEventListener("change", (e) => { hidden = e.target.checked; try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch (x) { /* ignore */ } report(); setTimeout(() => send({ a: "leaders" }), 400); });
    timer = setInterval(report, 60000);
    setTimeout(report, 8000);
  }
  return { bind, show, open };
})();
