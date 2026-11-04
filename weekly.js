"use strict";
// The weekly cup: 🏆 Weekly cup in the menu. Every Monday a new week begins with a theme (Pyramid Week, Dragon Boat Festival, Arena Week...). With an account, you score points all week
// by playing against real people (a win is worth 3, anything else 1, and the week's games count double) and by laying blocks of the pyramid in Cancún. At the end of the week the top three
// win 1000, 600 and 300 denarii and everybody with 10 points or more gets 100. The prize is sent to you the next time you are online. The game server keeps the scores.
// Depends on online.js (Online.navalSend, Online.connected), vitals.js and the globals of game.js (openPanel, toast).

const Weekly = (() => {
  const KEY = "rome-weekly-paid";
  let view = null, timer = 0, paid = [];
  try { paid = JSON.parse(localStorage.getItem(KEY) || "[]"); if (!Array.isArray(paid)) paid = []; } catch (e) { paid = []; }
  const $w = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "weekly", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const left = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d} day${d > 1 ? "s" : ""} ${h} h` : h ? `${h} h ${m} min` : `${m} min`; };

  function render() {
    const body = $w("wk-body"); body.replaceChildren();
    if (!view) { body.append(el("p", Online.connected ? "Loading..." : "The weekly cup needs the game server: wait to be connected.", "dnote")); return; }
    const th = view.theme;
    body.append(el("h3", `${th.name}`, "wk-theme"), el("p", th.blurb, "wk-blurb"), el("p", `Ends in ${left(view.ends)}.`, "dnote"));
    const you = el("p", undefined, "wk-you");
    you.textContent = !view.login ? "Log in to your account to score points and win prizes." : view.you && view.you.pts ? `You have ${view.you.pts} point${view.you.pts === 1 ? "" : "s"}, ${view.you.rank ? "number " + view.you.rank + " of " + view.n : "not on the board yet"}.` : "You have no points yet. Play a game against a real person!";
    body.append(you);
    const ol = el("ol", undefined, "wk-top");
    for (const [name, pts] of view.top) ol.append(el("li", `${name}: ${pts}`));
    if (!view.top.length) ol.append(el("li", "Nobody has scored yet. Be the first!", "dim"));
    body.append(ol);
    body.append(el("p", `Prizes: 🥇 ${view.prizes[0]}, 🥈 ${view.prizes[1]}, 🥉 ${view.prizes[2]} denarii, and ${view.part[0]} for everyone with ${view.part[1]} points or more.`, "dnote small"));
    if (view.last && view.last.top && view.last.top.length) body.append(el("p", `Last week (${view.last.theme}): ${view.last.top.map(([n, p], i) => `${["🥇", "🥈", "🥉"][i]} ${n} (${p})`).join(", ")}`, "dnote small"));
  }

  function on(m) {
    if (m.t === "weekly") { view = m; if ($w("weekly").classList.contains("show")) render(); return; }
    if (m.t !== "weekly_prize" || !Array.isArray(m.prizes)) return;
    const ids = [];
    for (const p of m.prizes) {
      if (!p || typeof p.id !== "string") continue;
      ids.push(p.id);
      if (paid.includes(`${p.id}`)) continue;                                           // (paid already, and only the confirmation was lost)
      const coins = Math.max(0, Math.min(5000, Math.floor(Number(p.coins)) || 0));
      Vitals.coins += coins; paid.push(p.id); paid = paid.slice(-50);
      try { localStorage.setItem(KEY, JSON.stringify(paid)); } catch (e) { /* ignore */ }
      Sfx.play("medal");
      toast(p.quest ? `📜 Daily quest done${p.rank > 1 ? `, ${p.rank} days in a row` : ""}! +${coins} denarii.` : p.tour ? `🏟️ ${p.theme}: you finished number ${p.rank}! +${coins} denarii.` : `🏆 ${p.theme}: you finished number ${p.rank} with ${p.pts} points! +${coins} denarii.`);
    }
    if (ids.length) send({ a: "ack", ids });
  }

  function open() {
    if (!Online.connected) { toast("The weekly cup needs the game server: wait to be connected."); return; }
    send({ a: "get" }); render(); openPanel("#weekly");
    clearInterval(timer); timer = setInterval(() => { if (!$w("weekly").classList.contains("show")) { clearInterval(timer); return; } send({ a: "get" }); }, 15000);
  }
  function bind() { const b = $w("btn-weekly"); if (b) b.addEventListener("click", open); }
  return { bind, on, open };
})();
