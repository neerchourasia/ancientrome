"use strict";
// Profiles: 👤 Profile in the menu (You) shows your own page, and the Profile button beside a friend shows theirs. A profile has the name, rating and results (wins, losses, draws), the results in
// each game, the cups won in the weekly cup, and the last twelve matches against real people: a finished xiangqi game can be replayed move by move. Only players with an account have one.
// "Copy link" gives an address (?profile=...) that opens someone's profile for anyone who plays. Depends on online.js (Online.navalSend, Online.connected), pvpgames.js (Mini.replay) and game.js.

const Profile = (() => {
  const GAMES = { duel: "Duels", coop: "Team battles", race: "Chariot races", naval: "Naval battles", brawl: "Arena brawls", team2: "2 v 2 fights", derby: "Chariot derbies", kushti: "Kushti", kites: "Kite fights", ball: "Pok-ta-pok", dragon: "Dragon boats", wushu: "Wushu", xiangqi: "Xiangqi" };
  const RES = { w: "🟢 Won", l: "🔴 Lost", d: "⚪ Draw" };
  const $p = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "profile", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} days ago`; };
  let cur = null;

  function render() {
    const body = $p("pf-body"); body.replaceChildren();
    if (!cur) { body.append(el("p", Online.connected ? "Loading..." : "Profiles need the game server: wait to be connected.", "dnote")); return; }
    if (cur.none) { body.append(el("p", "There is no profile here yet. A profile starts when a player with an account finishes a match against a real person (log in, then try Play online).", "dnote")); return; }
    body.append(el("h3", `${cur.name}${cur.online ? " 🟢" : ""}`, "pf-name"));
    body.append(el("p", `Rating ${cur.r} · ${cur.w} won, ${cur.l} lost, ${cur.d} drawn${cur.fav ? ` · favourite: ${GAMES[cur.fav] || cur.fav}` : ""}`, "pf-sum"));
    const c = cur.cups || [0, 0, 0];
    if (c[0] || c[1] || c[2]) body.append(el("p", `Weekly cup: 🥇 ${c[0]}  🥈 ${c[1]}  🥉 ${c[2]}`, "pf-sum"));
    if (cur.sv && cur.sv.length) body.append(el("p", `🏺 Souvenirs ${cur.sv.length}/16: ${cur.sv.map((id) => (Souvenirs.list.find((s) => s[0] === id) || [0, 0, ""])[2]).join(" ")}`, "pf-sum"));
    if (cur.tw) body.append(el("p", `🏟️ Tournaments won: ${cur.tw}`, "pf-sum"));
    const kinds = Object.keys(cur.games || {}).sort((a, b) => cur.games[b].reduce((x, y) => x + y, 0) - cur.games[a].reduce((x, y) => x + y, 0));
    if (kinds.length) {
      const t = el("table", undefined, "pf-table");
      for (const k of kinds) { const [w, l, d] = cur.games[k], tr = el("tr"); tr.append(el("td", GAMES[k] || k), el("td", `${w} won`), el("td", `${l} lost`), el("td", `${d} drawn`)); t.append(tr); }
      body.append(t);
    }
    if ((cur.hist || []).length) {
      body.append(el("h4", "Recent matches"));
      const ul = el("ul", undefined, "pf-hist");
      for (const h of cur.hist) {
        const li = el("li"); li.append(el("span", `${RES[h.r] || h.r}: ${GAMES[h.k] || h.k} vs ${(h.vs || []).join(", ") || "?"} · ${ago(h.t)}`));
        if (h.rp) { const b = el("button", "▶ Replay"); b.type = "button"; b.addEventListener("click", () => send2({ t: "replay", id: h.rp })); li.append(b); }
        ul.append(li);
      }
      body.append(ul);
    }
    const link = el("button", "Copy link to this profile"); link.type = "button";
    link.addEventListener("click", () => {
      const url = `${location.origin}${location.pathname}?profile=${cur.fid}`;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast("Link copied."), () => toast(url));
    });
    body.append(link);
  }
  const send2 = (o) => Online.navalSend(o);

  function on(m) {
    if (m.t === "profile") { cur = m; if ($p("profile").classList.contains("show")) render(); }
    else if (m.t === "replay") Mini.replay(m);
  }
  function open(fid) {
    if (!Online.connected) { toast("Profiles need the game server: wait to be connected."); return; }
    cur = null; send(fid ? { fid } : {}); render(); openPanel("#profile");
  }
  function bind() {
    const b = $p("btn-profile"); if (b) b.addEventListener("click", () => open());
    let want = null;
    try { want = new URLSearchParams(location.search).get("profile"); } catch (e) { /* ignore */ }
    if (want && /^[0-9a-f]{12}$/.test(want)) {                                          // a shared link: show that profile as soon as the game has started and is online
      const t = setInterval(() => { if (typeof started !== "undefined" && started && Online.connected && mode === "walk") { clearInterval(t); open(want); } }, 1000);
    }
  }
  return { bind, on, open };
})();
