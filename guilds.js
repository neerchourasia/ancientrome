"use strict";
// Guilds: a small club of players (with accounts) with a name, a tag, a chat of their own and a shared treasury. 🛡 Guild in the menu: found one (500 denarii) or join
// one from the list (you can be in up to three: a row of buttons at the top opens the one you want, and ➕ finds or founds another); members chat, put denarii in the treasury and the leader can pay members out of it (up to 3,000 an hour) or send someone away.
// The guild's tag shows before your name in the main chat. The game server keeps guilds and saves them when it restarts. The leader can pin a message of the day. The numbers come from each player's own game.
// Depends on online.js (Online.navalSend, Online.connected), vitals.js, dialog.js and the globals of game.js.

const Guilds = (() => {
  const COST = 500;
  const COLORS = ["#b3342d", "#2d6bb3", "#2f8a4f", "#c9a227", "#7a3fa0", "#d9731f", "#2a2a2a", "#2aa8a0"], EMBLEMS = ["🦅", "🐺", "🐉", "🦁", "🌙", "⭐", "🐘", "🦊"];
  let mine = null, list = [], adding = false;                                  // adding: the join-or-found screen is open on top of the guild you are in
  const badge = (color, emblem) => { const b = document.createElement("span"); b.textContent = EMBLEMS[emblem % 8] || "🛡"; b.style.cssText = `display:inline-block;min-width:1.7em;text-align:center;padding:1px 4px;margin-right:6px;border-radius:5px;background:${COLORS[color % 8] || COLORS[0]};color:#fff`; return b; };
  const $g = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "social", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };

  function render() {
    const out = mine !== null, box = $g("gd-has"), none = $g("gd-none");
    box.hidden = !out || adding; none.hidden = out && !adding;
    $g("gd-back").hidden = !(out && adding);
    const all = (mine && mine.all) || [], sw = $g("gd-switch");
    sw.hidden = !out || all.length < 1; sw.replaceChildren();
    if (out) {
      for (const a of all) { const b = el("button", `[${a.tag}] ${a.name}`, a.on ? "on" : ""); b.type = "button"; b.disabled = a.on && !adding; b.addEventListener("click", () => { adding = false; if (a.on) render(); else send({ a: "g_switch", name: a.name }); }); sw.append(b); }
      if (all.length < 3) { const b = el("button", "➕", adding ? "on" : ""); b.type = "button"; b.title = "Join or found another guild (you can be in up to 3)"; b.addEventListener("click", () => { adding = true; send({ a: "g_list" }); render(); }); sw.append(b); }
    }
    if (out && !adding) {
      $g("gd-title").replaceChildren(badge(mine.color, mine.emblem), document.createTextNode(`[${mine.tag}] ${mine.name}`));
      $g("gd-week").textContent = `This week: ${mine.pts} points · rank ${mine.rank} of ${mine.of}${mine.wins ? ` · ${mine.wins} week${mine.wins === 1 ? "" : "s"} won` : ""}. The best guild of the week wins ${mine.prize} denarii (at least 20 points). Points: a specimen 1, a season set 10, a case 10 (15 as a team), a caravan 5, a dish or a harvest 1.${mine.last ? ` Last week: [${mine.last.tag}] ${mine.last.name} (${mine.last.pts}).` : ""}`;
      $g("gd-money").textContent = `Treasury: ${mine.treasury.toLocaleString()} denarii · ${mine.members.length} of ${mine.max} members`;
      const ul = $g("gd-members"); ul.replaceChildren();
      const lead = mine.me && mine.members.some((m) => m.fid === mine.me && m.leader);
      $g("gd-motd").hidden = !mine.motd; $g("gd-motd").textContent = mine.motd ? `📜 ${mine.motd}` : ""; $g("gd-setmotd").hidden = !lead;
      for (const m of mine.members) {
        const li = el("li", `${m.online ? "● " : "○ "}${m.name}${m.leader ? " 👑" : ""} · ${m.pts || 0} pts`);
        if (lead && m.fid !== mine.me) {
          const pay = el("button", "Pay"), kick = el("button", "Send away"); pay.type = kick.type = "button";
          pay.addEventListener("click", () => Dialog.ask(`How many denarii from the treasury to ${m.name}? (1 to 1000)`, "100").then((raw) => { const n = Math.floor(Number(raw)); if (raw !== null && n >= 1) send({ a: "g_pay", fid: m.fid, n }); }));
          kick.addEventListener("click", () => Dialog.confirm(`Send ${m.name} away from the guild?`).then((yes) => { if (yes) send({ a: "g_kick", fid: m.fid }); }));
          li.append(" ", pay, " ", kick);
        }
        ul.append(li);
      }
      $g("gd-look").hidden = !lead;
      const gc = $g("gd-chest"); gc.replaceChildren();
      const total = Object.values(mine.chest || {}).reduce((a, b) => a + b, 0);
      $g("gd-chest-n").textContent = `Guild chest: ${total} of ${mine.chest_max} goods (you may take 10 an hour)`;
      for (const id of Object.keys(mine.chest || {})) {
        const li = el("li", `${Shopkeep.GOODS[id] ? Shopkeep.GOODS[id][0] : id} × ${mine.chest[id]} `), b = el("button", "Take 1"); b.type = "button"; b.addEventListener("click", () => send({ a: "g_gtake", item: id, n: 1 })); li.append(b); gc.append(li);
      }
      const sel = $g("gd-gsel"), keep = sel.value; sel.replaceChildren();
      for (const id of Shopkeep.IDS) if (Shopkeep.owns(id) > 0) { const o = el("option", `${Shopkeep.GOODS[id][0]} (${Shopkeep.owns(id)})`); o.value = id; sel.append(o); }
      if (keep) sel.value = keep;
      $g("gd-gput").disabled = !sel.options.length;
      const chat = $g("gd-chat"); chat.replaceChildren();
      for (const c of mine.chat) {
        const li = el("li"); if (c.name) { li.append(el("b", c.name), document.createTextNode(": " + c.text)); } else { li.className = "sys"; li.textContent = c.text; }
        chat.append(li);
      }
      chat.scrollTop = chat.scrollHeight;
    }
    if (!out || adding) {
      const ul = $g("gd-list"); ul.replaceChildren();
      if (!list.length) ul.append(el("li", "No guilds yet. Found the first one!", "dim"));
      for (const g of list) {
        const li = el("li", `[${g.tag}] ${g.name} · ${g.n} members · ${g.pts || 0} pts · ${g.treasury.toLocaleString()} 🪙`), b = el("button", g.in ? "Joined" : "Join"); b.type = "button"; b.disabled = !!g.in; li.prepend(badge(g.color || 0, g.emblem || 0));
        b.addEventListener("click", () => send({ a: "g_join", name: g.name }));
        li.append(" ", b); ul.append(li);
      }
    }
  }

  function on(m) {                                         // the server sent us the guild we are in (or null), the list of guilds, or money
    if (m.t === "guild") { adding = false; mine = m.g; render(); if (!mine) send({ a: "g_list" }); }
    else if (m.t === "guilds") { list = m.list || []; render(); }
    else if (m.t === "g_paid") { Vitals.coins = Math.max(0, Vitals.coins - m.n); toast(`${m.n} denarii went to ${m.why}.`); }
    else if (m.t === "g_good") { if (m.dir === "dep") Shopkeep.take(m.item, m.n); else { Shopkeep.give(m.item, m.n); Sfx.play("thud"); toast(`${m.n} × ${Shopkeep.GOODS[m.item] ? Shopkeep.GOODS[m.item][0] : m.item} from the guild chest.`); } if (mine) render(); }
    else if (m.t === "g_got") { Vitals.coins += m.n; Sfx.play("coin"); toast(`The ${m.from} guild paid you ${m.n} denarii.`); }
  }

  function open() {
    if (!Online.connected || typeof Account === "undefined" || !Account.loggedIn) { toast("Guilds need your account and the game server: log in and wait to be connected."); return; }
    adding = false; send({ a: "g_me" }); render(); openPanel("#guild");
  }

  function bind() {
    const b = $g("btn-guild"); if (b) b.addEventListener("click", open);
    $g("gd-back").addEventListener("click", () => { adding = false; render(); });
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
    $g("gd-setmotd").addEventListener("click", () => Dialog.ask("A message for your guild (up to 140 letters; leave it empty to clear it)", mine && mine.motd || "").then((raw) => { if (raw !== null) send({ a: "g_motd", text: raw }); }));
    $g("gd-colour").addEventListener("click", () => { if (mine) send({ a: "g_look", color: (mine.color + 1) % 8, emblem: mine.emblem }); });
    $g("gd-emblem").addEventListener("click", () => { if (mine) send({ a: "g_look", color: mine.color, emblem: (mine.emblem + 1) % 8 }); });
    $g("gd-gput").addEventListener("click", () => { const id = $g("gd-gsel").value, n = Math.min(5, Shopkeep.owns(id)); if (id && n > 0) send({ a: "g_gdep", item: id, n }); });
    $g("gd-leave").addEventListener("click", () => Dialog.confirm(mine && mine.all && mine.all.length > 1 ? `Leave ${mine.name}? (You stay in your other guilds.)` : "Leave your guild?").then((yes) => { if (yes) send({ a: "g_leave" }); }));
  }
  return { bind, on, open, score: (k) => { if (mine && typeof Online !== "undefined" && Online.connected) send({ a: "g_score", k }); }, get inGuild() { return !!mine; }, get mine() { return mine; } };
})();
