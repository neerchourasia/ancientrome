"use strict";
// Guild caravans: 🐪 Guild caravans in the menu (People). The guild leader sends a caravan of trade goods from one city to another, paid from the guild's treasury (500, 1,500 or 4,000
// denarii). It is on the road for four minutes (the game server keeps the time, so it goes on while everybody is away) and then the goods are sold and the money goes back into the treasury:
// the farther apart the two cities, the better the price, and a guild with a landmark of its own in the city it goes to (🏗 Guild builds) sells for more. One caravan in six is ambushed by bandits and
// comes back with a third of its worth. Three can be on the road at once. The whole guild sees them here and in its chat. Depends on online.js, guilds.js (Guilds.mine), dialog.js and the globals of game.js (mode, panelOpen, openPanel, toast).

const GuildCaravans = (() => {
  const CITIES = [["rome", "Rome"], ["delhi", "Delhi"], ["beijing", "Beijing"], ["cancun", "Cancún"]], STAKES = [500, 1500, 4000], ORDER = CITIES.map((c) => c[0]);
  const $c = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const nameOf = (c) => tr((CITIES.find((x) => x[0] === c) || [c, c])[1]);
  let timer = 0, asked = 0, pick = { from: "rome", to: "cancun", stake: 500 };
  const worth = (from, to, stake) => Math.round(stake * (1.25 + 0.12 * Math.abs(ORDER.indexOf(from) - ORDER.indexOf(to))));
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  function render() {
    const body = $c("caravan-body"); if (!body) return;
    const el = (t, x, c) => { const e = document.createElement(t); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
    const mine = typeof Guilds !== "undefined" ? Guilds.mine : null, lead = !!(mine && mine.me && mine.members.some((m) => m.fid === mine.me && m.leader)), cv = (mine && mine.cv) || [];
    const parts = [el("p", tr("The guild leader sends a caravan of trade goods to another city, paid from the treasury. It comes back with the goods sold. The farther the road, the better the price, and one in six is ambushed by bandits."), "bd-intro")];
    if (!mine) { parts.push(el("p", tr("Join or found a guild (🛡 Guild) to send caravans."), "bd-intro")); body.replaceChildren(...parts); return; }
    parts.push(el("p", `${tr("Your guild's treasury")}: ${mine.treasury.toLocaleString()} ${tr("denarii")}${lead ? "" : " · " + tr("only the guild leader can send a caravan")}`, "bd-intro"));
    const road = el("div", undefined, "bd-city"); road.append(el("h3", `🐪 ${tr("On the road")} (${cv.length} / 3)`));
    if (!cv.length) road.append(el("small", tr("No caravans on the road.")));
    for (const c of cv) { const row = el("div", undefined, "bd-row"); row.append(el("span", `${nameOf(c.a)} → ${nameOf(c.b)}`, "bd-name"), el("small", `${c.stake.toLocaleString()} ${tr("denarii of goods")} · ${c.left > 0 ? clock(c.left) : tr("arriving")}`)); road.append(row); }
    parts.push(road);
    if (lead) {
      const box = el("div", undefined, "bd-city"); box.append(el("h3", tr("Send a caravan")));
      const sel = (key, opts, label) => { const s = el("select"); for (const [v, t] of opts) { const o = el("option", t); o.value = v; s.append(o); } s.value = String(pick[key]); s.addEventListener("change", () => { pick[key] = key === "stake" ? Number(s.value) : s.value; render(); }); const l = el("label", `${label} `); l.append(s); return l; };
      const row = el("div", undefined, "bd-row");
      row.append(sel("from", CITIES.map(([v, t]) => [v, tr(t)]), tr("From")), sel("to", CITIES.map(([v, t]) => [v, tr(t)]), tr("to")), sel("stake", STAKES.map((s) => [s, `${s.toLocaleString()}`]), tr("goods")));
      box.append(row);
      const ok = pick.from !== pick.to && mine.treasury >= pick.stake && cv.length < 3, go = el("button", `${tr("Send")} · ${pick.stake.toLocaleString()}`); go.type = "button"; go.disabled = !ok;
      const hint = pick.from === pick.to ? tr("choose two different cities") : cv.length >= 3 ? tr("three caravans are already on the road") : mine.treasury < pick.stake ? tr("the treasury is too small") : `${tr("about")} ${worth(pick.from, pick.to, pick.stake).toLocaleString()} ${tr("denarii when it sells")} · 4 ${tr("minutes")}`;
      go.addEventListener("click", () => Dialog.confirm(`${tr("Send a caravan from")} ${nameOf(pick.from)} ${tr("to")} ${nameOf(pick.to)} ${tr("with")} ${pick.stake.toLocaleString()} ${tr("denarii of goods from the treasury")}?`).then((yes) => { if (yes) { Online.navalSend({ t: "social", a: "g_caravan", from: pick.from, to: pick.to, stake: pick.stake }); setTimeout(() => Online.navalSend({ t: "social", a: "g_me" }), 600); } }));
      const hr = el("div", undefined, "bd-row"); hr.append(el("small", hint), go); box.append(hr); parts.push(box);
    }
    body.replaceChildren(...parts);
  }
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    if (typeof Online === "undefined" || !Online.connected) { toast(tr("Guild caravans need the game server: log in and wait to be connected.")); return; }
    if (typeof Account !== "undefined" && Account.loggedIn) Online.navalSend({ t: "social", a: "g_me" });
    render(); openPanel("#caravanpanel");
    clearInterval(timer); asked = 0;
    timer = setInterval(() => {                                                              // the clocks count down; the guild is asked again now and then
      if (!$c("caravanpanel").classList.contains("show")) { clearInterval(timer); return; }
      const mine = typeof Guilds !== "undefined" ? Guilds.mine : null;
      if (mine && mine.cv) for (const c of mine.cv) c.left = Math.max(0, c.left - 1);
      if (++asked % 8 === 0) Online.navalSend({ t: "social", a: "g_me" });
      render();
    }, 1000);
  }
  function bind() { const b = $c("btn-caravans"); if (b) b.addEventListener("click", open); }
  return { bind, open, render };
})();
