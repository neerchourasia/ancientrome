"use strict";
// The hall of fame: 🏛️ Hall of fame in the menu. Who won the latest tournaments, the podiums of the last weekly cups, and the best players: most wins in each game, the highest ratings,
// the most tournaments and weekly cups won. The game server keeps it all (it is worked out from the profiles of players with an account). Depends on online.js (Online.navalSend,
// Online.connected) and the globals of game.js (openPanel, toast).

const Hall = (() => {
  const GAMES = { xiangqi: "♟️ Xiangqi", kushti: "🤼 Kushti", kites: "🪁 Kite fights", ball: "🏀 Pok-ta-pok", dragon: "🐉 Dragon boats", duel: "⚔️ Duels", wushu: "🥋 Wushu" };
  let view = null;
  const $h = (id) => document.getElementById(id);
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t), d = Math.floor(s / 86400), h = Math.floor(s / 3600); return d >= 1 ? `${d} day${d > 1 ? "s" : ""} ago` : h >= 1 ? `${h} h ago` : "just now"; };
  const list = (body, title, rows, fmt, empty) => {
    body.append(el("h4", title, "tn-round"));
    if (!rows || !rows.length) { body.append(el("p", empty || "Nobody yet.", "dnote small")); return; }
    const ol = el("ol", undefined, "wk-top"); for (const r of rows) ol.append(el("li", fmt(r))); body.append(ol);
  };

  function render() {
    const body = $h("hf-body"); if (!body) return; body.replaceChildren();
    if (!view) { body.append(el("p", Online.connected ? "Loading..." : "The hall of fame needs the game server: wait to be connected.", "dnote")); return; }
    body.append(el("h4", "🏟️ Latest tournament winners", "tn-round"));
    if (!view.tourneys.length) body.append(el("p", "No tournament has finished yet. Open one under 🏟️ Tournaments!", "dnote small"));
    for (const t of view.tourneys.slice(0, 8)) body.append(el("p", `${t.auto ? "📅 " : ""}${(GAMES[t.k] || t.k).replace(/^\S+ /, "")}: ${t.champ} (${t.n} players) · ${ago(t.t)}`, "hf-row"));
    body.append(el("h4", "🥇 Weekly cup podiums", "tn-round"));
    if (!view.weekly.length) body.append(el("p", "No weekly cup has ended yet.", "dnote small"));
    for (const w of view.weekly.slice(0, 6)) body.append(el("p", `${w.theme}: ${w.top.map(([n, p], i) => `${["🥇", "🥈", "🥉"][i]} ${n} (${p})`).join("  ")}`, "hf-row"));
    list(body, "⭐ Highest ratings", view.rating, ([n, r]) => `${n}: ${r}`, "Nobody has played enough games yet (five are needed).");
    list(body, "🏟️ Most tournaments won", view.tw, ([n, c]) => `${n}: ${c}`);
    list(body, "🥇 Most weekly cups won", view.cups, ([n, c]) => `${n}: ${c}`);
    for (const k of Object.keys(GAMES)) if (view.best[k]) list(body, `${GAMES[k]}: most wins`, view.best[k], ([n, w, l, d]) => `${n}: ${w} won, ${l} lost${d ? `, ${d} drawn` : ""}`);
    body.append(el("p", "Only players with an account are listed, and a game needs three matches against real people to count.", "dnote small"));
  }

  function on(m) { if (m.t !== "hall") return; view = m; if ($h("hall").classList.contains("show")) render(); }
  function open() {
    if (!Online.connected) { toast("The hall of fame needs the game server: wait to be connected."); return; }
    Online.navalSend({ t: "hall", a: "get" }); render(); openPanel("#hall");
  }
  function bind() { const b = $h("btn-hall"); if (b) b.addEventListener("click", open); }
  return { bind, on, open };
})();
