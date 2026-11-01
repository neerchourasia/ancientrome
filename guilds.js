"use strict";
// Guilds: a small club of players (with accounts) with a name, a tag, a chat of their own and a shared treasury. 🛡 Guild in the menu: found one (500 denarii) or join
// one from the list; members chat, put denarii in the treasury and the leader can pay members out of it (up to 3,000 an hour) or send someone away.
// The guild's tag shows before your name in the main chat. The server keeps guilds in memory only, and the numbers come from each player's own game.
// Depends on online.js (Online.navalSend, Online.connected), vitals.js, dialog.js and the globals of game.js.

const Guilds = (() => {
  const COST = 500;
  let mine = null, list = [];
  const $g = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "social", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };

  function render() {
    const out = mine !== null, box = $g("gd-has"), none = $g("gd-none");
    box.hidden = !out; none.hidden = out;
    if (out) {
      $g("gd-title").textContent = `[${mine.tag}] ${mine.name}`;
      $g("gd-money").textContent = `Treasury: ${mine.treasury.toLocaleString()} denarii · ${mine.members.length} of ${mine.max} members`;
      const ul = $g("gd-members"); ul.replaceChildren();
      const lead = mine.me && mine.members.some((m) => m.fid === mine.me && m.leader);
      for (const m of mine.members) {
        const li = el("li", `${m.online ? "● " : "○ "}${m.name}${m.leader ? " 👑" : ""}`);
        if (lead && m.fid !== mine.me) {
          const pay = el("button", "Pay"), kick = el("button", "Send away"); pay.type = kick.type = "button";
          pay.addEventListener("click", () => Dialog.ask(`How many denarii from the treasury to ${m.name}? (1 to 1000)`, "100").then((raw) => { const n = Math.floor(Number(raw)); if (raw !== null && n >= 1) send({ a: "g_pay", fid: m.fid, n }); }));
          kick.addEventListener("click", () => Dialog.confirm(`Send ${m.name} away from the guild?`).then((yes) => { if (yes) send({ a: "g_kick", fid: m.fid }); }));
          li.append(" ", pay, " ", kick);
        }
        ul.append(li);
      }
      const chat = $g("gd-chat"); chat.replaceChildren();
      for (const c of mine.chat) {
        const li = el("li"); if (c.name) { li.append(el("b", c.name), document.createTextNode(": " + c.text)); } else { li.className = "sys"; li.textContent = c.text; }
        chat.append(li);
      }
      chat.scrollTop = chat.scrollHeight;
    } else {
      const ul = $g("gd-list"); ul.replaceChildren();
      if (!list.length) ul.append(el("li", "No guilds yet. Found the first one!", "dim"));
      for (const g of list) {
        const li = el("li", `[${g.tag}] ${g.name} · ${g.n} members · ${g.treasury.toLocaleString()} 🪙`), b = el("button", "Join"); b.type = "button";
        b.addEventListener("click", () => send({ a: "g_join", name: g.name }));
        li.append(" ", b); ul.append(li);
      }
    }
  }

  function on(m) {                                         // the server sent us the guild we are in (or null), the list of guilds, or money
    if (m.t === "guild") { mine = m.g; render(); if (!mine) send({ a: "g_list" }); }
    else if (m.t === "guilds") { list = m.list || []; render(); }
    else if (m.t === "g_paid") { Vitals.coins = Math.max(0, Vitals.coins - m.n); toast(`${m.n} denarii went to ${m.why}.`); }
    else if (m.t === "g_got") { Vitals.coins += m.n; Sfx.play("coin"); toast(`The ${m.from} guild paid you ${m.n} denarii.`); }
  }

  function open() {
    if (!Online.connected || typeof Account === "undefined" || !Account.loggedIn) { toast("Guilds need your account and the game server: log in and wait to be connected."); return; }
    send({ a: "g_me" }); render(); openPanel("#guild");
  }

  function bind() {
    const b = $g("btn-guild"); if (b) b.addEventListener("click", open);
    $g("gd-make").addEventListener("click", () => {
      const name = $g("gd-name").value.trim(), tag = $g("gd-tag").value.trim();
      if (name.length < 3 || tag.length < 2) { toast("A guild needs a name (3 letters or more) and a tag (2 to 4 letters)."); return; }
      if (Vitals.coins < COST) { toast(`Founding a guild costs ${COST} denarii.`); return; }
      send({ a: "g_make", name, tag });
    });
    $g("gd-say-form").addEventListener("submit", (e) => { e.preventDefault(); const t = $g("gd-say").value.trim(); if (t) { send({ a: "g_say", text: t }); $g("gd-say").value = ""; } });
    $g("gd-dep").addEventListener("click", () => Dialog.ask(`How many denarii into the treasury? (you have ${Math.floor(Vitals.coins)})`, "100").then((raw) => {
      const n = Math.floor(Number(raw)); if (raw === null || !(n >= 1)) return;
      if (n > Vitals.coins) { toast("You do not have that much."); return; }
      send({ a: "g_dep", n });
    }));
    $g("gd-leave").addEventListener("click", () => Dialog.confirm("Leave your guild?").then((yes) => { if (yes) send({ a: "g_leave" }); }));
  }
  return { bind, on, open, get inGuild() { return !!mine; } };
})();
