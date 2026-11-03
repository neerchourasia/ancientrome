"use strict";
// The bulletin board: 📌 Bulletin board in the menu (People) shows the notices pinned in the city you are in. Players with an account can pin one short notice (120 letters) every ten minutes
// and take their own down; a notice stays for a week. Each city has its own board, kept by the game server (saved when it restarts). Anyone can read them.
// Depends on online.js (Online.navalSend, Online.connected) and the globals of game.js (city, openPanel, toast).

const Bulletin = (() => {
  const NAMES = { rome: "Rome", delhi: "Delhi", cancun: "Cancún", beijing: "Beijing" };
  let posts = null, at = "", timer = 0;
  const $b = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "notice", c: city, ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} days ago`; };

  function render() {
    $b("bb-title").textContent = `📌 Notice board of ${NAMES[city] || "the city"}`;
    const ul = $b("bb-list"); ul.replaceChildren();
    if (posts === null || at !== city) { ul.append(el("li", Online.connected ? "Reading the board..." : "The notice board needs the game server: wait to be connected.", "dim")); return; }
    if (!posts.length) ul.append(el("li", "Nothing is pinned here yet. Be the first!", "dim"));
    for (const p of posts) {
      const li = el("li"); li.append(el("b", p.name), document.createTextNode(`: ${p.text} `), el("small", ago(p.t), "dim"));
      if (p.mine) { const b = el("button", "Take down"); b.type = "button"; b.addEventListener("click", () => send({ a: "del", id: p.id })); li.append(" ", b); }
      ul.append(li);
    }
    const can = typeof Account !== "undefined" && Account.loggedIn;
    $b("bb-form").hidden = !can; $b("bb-login").hidden = can;
  }

  function on(m) {
    if (m.t !== "notice") return;
    if (m.a === "list") { posts = Array.isArray(m.posts) ? m.posts : []; at = m.c; if ($b("bulletin").classList.contains("show")) render(); }
    else if (m.a === "no") toast(m.msg || "The notice could not be pinned.");
  }

  function open() {
    if (!Online.connected) { toast("The notice board needs the game server: wait to be connected."); return; }
    posts = null; send({ a: "get" }); render(); openPanel("#bulletin");
    clearInterval(timer); timer = setInterval(() => { if (!$b("bulletin").classList.contains("show")) { clearInterval(timer); return; } send({ a: "get" }); }, 15000);
  }

  function bind() {
    const b = $b("btn-bulletin"); if (b) b.addEventListener("click", open);
    $b("bb-form").addEventListener("submit", (e) => { e.preventDefault(); const t = $b("bb-text").value.trim(); if (t.length < 3) { toast("Write a few words first."); return; } send({ a: "post", text: t }); $b("bb-text").value = ""; });
  }
  return { bind, on, open };
})();
