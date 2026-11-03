"use strict";
// Tournaments: 🏟️ Tournaments in the menu. Anyone with an account can open one for xiangqi, kushti, kite fights, pok-ta-pok or dragon boats and others sign up for a few minutes. The server
// draws a bracket (single elimination for two-player games, heats of up to four boats for dragon boats), warns each player 20 seconds before their match and starts it by itself, so stay out
// of other games until you are called (whoever opened it can press Start now once two or more have signed up). Every match can be watched from the bracket. With four or more players the top places win 500, 250 and 100 denarii (up to three prizes a day).
// Depends on online.js (Online.navalSend, Online.connected), audio.js and the globals of game.js (openPanel, toast).

const Tournament = (() => {
  const GAMES = [["xiangqi", "♟️ Xiangqi"], ["kushti", "🤼 Kushti"], ["kites", "🪁 Kite fight"], ["ball", "🏀 Pok-ta-pok"], ["dragon", "🐉 Dragon boats"]];
  const NAMES = Object.fromEntries(GAMES);
  let list = null, view = null, open_ = null, timer = 0, form = { kind: "xiangqi", cap: 8 };
  const $t = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "tourney", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const btn = (text, fn, cls) => { const b = el("button", text, cls); b.type = "button"; b.addEventListener("click", fn); return b; };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function renderList(body) {
    body.append(el("p", "Open a tournament, or sign up for one that is open. A bracket is drawn when sign-up closes, and the matches start by themselves: stay out of other games, and keep this tab open.", "dnote"));
    if (list.login === false) body.append(el("p", "Log in to your account to enter a tournament. Anyone can watch.", "dnote"));
    for (const t of list.list) {
      const row = el("div", undefined, "sp-row");
      const when = t.state === "open" ? `signing up · ${t.n}/${t.cap} · starts in ${mmss(t.in)}` : t.state === "running" ? `${t.round || "under way"} · ${t.n} players` : `won by ${t.champ || "nobody"}`;
      row.append(el("span", `${t.state === "done" ? "🏆 " : t.state === "running" ? "▶ " : "🟢 "}${t.name}: ${when}${t.joined ? "  ·  you are in" : ""}`));
      const b = btn("Bracket", () => { open_ = t.id; send({ a: "get", id: t.id }); });
      row.append(b);
      if (t.state === "open" && !t.joined && list.login) row.append(btn("Sign up", () => send({ a: "join", id: t.id })));
      body.append(row);
    }
    if (!list.list.length) body.append(el("p", "No tournament is on right now.", "dnote"));
    if (list.login) {
      const f = el("div", undefined, "gd-row");
      const sel = el("select"); for (const [k, n] of GAMES) { const o = el("option", n); o.value = k; sel.append(o); } sel.value = form.kind;
      sel.addEventListener("change", () => { form.kind = sel.value; });
      const cap = el("select"); for (const c of [8, 16]) { const o = el("option", `up to ${c} players`); o.value = c; cap.append(o); } cap.value = form.cap;
      cap.addEventListener("change", () => { form.cap = Number(cap.value); });
      f.append(sel, cap, btn("Open a tournament", () => send({ a: "create", kind: form.kind, cap: form.cap })));
      body.append(f);
    }
    body.append(el("p", `With ${list.min} or more players the winner takes ${list.prize[0]} denarii, second ${list.prize[1]} and third ${list.prize[2]}. Wins here count in the weekly cup and your profile too.`, "dnote small"));
  }

  function renderView(body) {
    const v = view;
    body.append(btn("← All tournaments", () => { open_ = null; view = null; render(); send({ a: "list" }); }, "tn-back"));
    body.append(el("h3", v.name, "wk-theme"));
    const status = v.state === "open" ? `Sign-up is open: ${v.n}/${v.cap} players, starts in ${mmss(v.in)}.` : v.state === "running" ? `Under way: ${v.round || ""}.` : v.state === "done" ? `Finished. Winner: ${v.champ}.` : "Cancelled: not enough players.";
    body.append(el("p", status, "dnote"));
    if (v.state === "open") {
      const row = el("div", undefined, "gd-row");
      if (v.joined) row.append(btn("Leave", () => send({ a: "leave", id: v.id }))); else row.append(btn("Sign up", () => send({ a: "join", id: v.id })));
      if (v.host) { const go = btn("Start now", () => send({ a: "start", id: v.id }), "tn-start"); go.disabled = v.n < 2; go.title = v.n < 2 ? "You need at least two players" : "Close sign-up and draw the bracket"; row.append(go); }
      body.append(row);
      body.append(el("p", `Players: ${v.players.join(", ") || "nobody yet"}`, "dnote small"));
    }
    if (v.state === "done" && v.places.length) body.append(el("p", v.places.map(([n, r]) => `${["🥇", "🥈", "🥉"][r - 1]} ${n}`).join("   "), "wk-you"));
    for (const rd of v.rounds) {
      body.append(el("h4", rd.label, "tn-round"));
      for (const m of rd.m) {
        const row = el("div", undefined, `sp-row${m.me ? " tn-me" : ""}`);
        const names = m.ps.map((n) => (m.w.includes(n) && m.st === "done" ? `✔ ${n}` : n)).join(m.ps.length > 2 || v.kind === "dragon" ? ", " : " vs ");
        row.append(el("span", m.bye ? `${m.ps[0]} (bye)` : `${names}${m.st === "live" ? "  ·  playing now" : m.st === "wait" ? "  ·  waiting" : ""}`));
        if (m.st === "live" && m.room) row.append(btn("Watch", () => { closePanels(); Online.navalSend({ t: "watch", a: "join", room: m.room }); }));
        body.append(row);
      }
    }
  }

  function render() {
    const body = $t("tn-body"); if (!body) return; body.replaceChildren();
    if (!Online.connected) { body.append(el("p", "Tournaments need the game server: wait to be connected.", "dnote")); return; }
    if (view && open_) renderView(body); else if (list) renderList(body); else body.append(el("p", "Loading...", "dnote"));
  }

  function on(m) {
    if (m.t !== "tourney") return;
    if (m.a === "list") { list = m; if ($t("tourney").classList.contains("show")) render(); }
    else if (m.a === "view") { view = m; open_ = m.id; if ($t("tourney").classList.contains("show")) render(); }
    else if (m.a === "no") toast(m.msg || "You cannot do that.");
    else if (m.a === "msg") { toast(`🏟️ ${m.msg}`); if ($t("tourney").classList.contains("show")) send({ a: "list" }); }
    else if (m.a === "left") { open_ = null; view = null; send({ a: "list" }); }
    else if (m.a === "call") {
      Sfx.play("chime");
      toast(`🏟️ ${NAMES[m.kind] || m.kind} tournament, ${String(m.label || "").toLowerCase()}: your match${m.vs && m.vs.length ? ` against ${m.vs.join(", ")}` : ""} starts in ${m.in} seconds. Stay out of other games!`);
    }
  }

  function show() {
    send({ a: "list" }); if (open_) send({ a: "get", id: open_ });
    render(); openPanel("#tourney");
    clearInterval(timer);
    timer = setInterval(() => { if (!$t("tourney").classList.contains("show")) { clearInterval(timer); return; } send({ a: "list" }); if (open_) send({ a: "get", id: open_ }); }, 5000);
  }
  function openIt() { if (!Online.connected) { toast("Tournaments need the game server: wait to be connected."); return; } show(); }
  function bind() { const b = $t("btn-tourney"); if (b) b.addEventListener("click", openIt); }
  return { bind, on, open: openIt };
})();
