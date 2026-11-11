"use strict";
// The town crier: 📰 Town crier in the menu (People). A newspaper for the city you are in, with its own name (Acta Diurna in Rome, the Bazaar Crier in Delhi, the Sacbé Herald in Cancún, the Capital Gazette
// in Beijing). The front page has three headlines of the day in the spirit of the city (the same for everybody on the same date, so a class reads the same paper); under it, "What happened in the world" lists
// the latest news the game server keeps: guilds founded, things guilds built, caravans that came home (or were ambushed), and which guild now rules a city. That part needs the server. Depends on online.js
// (Online.navalSend, Online.connected) and the globals of game.js (city, mode, panelOpen, openPanel, toast).

const Newspaper = (() => {
  const NAMES = { rome: "Acta Diurna", delhi: "The Bazaar Crier", cancun: "The Sacbé Herald", beijing: "The Capital Gazette" };
  const HEADS = {
    rome: ["Grain ships from Egypt reach Ostia early: bread stays cheap", "Crowds fill the Circus Maximus for the games: the Greens are the favourites", "The emperor's builders work on a new aqueduct", "A fire in the Subura is put out by the vigiles before it spreads", "Senators quarrel in the Curia about the price of oil", "Gladiators of the Colosseum parade through the Forum", "The Tiber floods the low streets: boats on the Via Sacra", "Merchants from Syria sell silk and spices at the market"],
    delhi: ["The emperor's fort glows with lamps for the festival", "Camel caravans from Kabul arrive at the serai with dried fruit", "Chandni Chowk's jewellers show new work for the princes", "The canal runs full: gardens bloom along the Chandni Chowk", "Kite fights over the Yamuna: a boy from the Katra wins", "The mosque courtyard is full for Friday prayers", "Spice merchants say pepper prices are up", "Poets read their verses at the Red Fort"],
    cancun: ["Priests watch Venus rise over El Caracol", "Traders bring cacao and jade along the white road, the sacbé", "A great ball game is held in the ball court: the crowd fills the walls", "The rains come early to the cenote: farmers are glad", "Canoes from Cozumel land salt and shells on the coast", "Builders add a new platform at the Temple of the Warriors", "Merchants from the highlands bring obsidian", "Feathered cloaks are the fashion at the market"],
    beijing: ["The Dragon Boat teams practise on the lake", "Scholars sit the examinations: the city is quiet", "The Temple of Heaven is swept for the emperor's prayers", "Silk merchants open new stalls near the Drum Tower", "The Bell Tower rings the night watch", "Porcelain from Jingdezhen arrives by the Grand Canal", "Lanterns are hung along the hutongs for the festival", "Workers repair a stretch of the Great Wall"],
  };
  const $n = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  let news = [], got = false;

  function headlines() {                                                     // three different ones, the same for everybody on the same date
    const pool = HEADS[city] || HEADS.rome, d = new Date().toISOString().slice(0, 10), out = [];
    for (let k = 0; out.length < 3 && k < 30; k++) { const h = pool[hash(city + d + k) % pool.length]; if (!out.includes(h)) out.push(h); }
    return out;
  }
  const ago = (t) => { const s = Math.max(0, Math.round(Date.now() / 1000 - t)); return s < 90 ? tr("just now") : s < 5400 ? `${Math.round(s / 60)} ${tr("min ago")}` : s < 129600 ? `${Math.round(s / 3600)} ${tr("h ago")}` : `${Math.round(s / 86400)} ${tr("days ago")}`; };
  function render() {
    const body = $n("news-body"); if (!body) return;
    const el = (t, x, c) => { const e = document.createElement(t); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
    const parts = [el("h3", tr(NAMES[city] || NAMES.rome), "np-name"), el("small", new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }), "np-date")];
    headlines().forEach((h, i) => parts.push(el(i ? "p" : "h4", tr(h), i ? "np-line" : "np-head")));
    parts.push(el("h3", `📜 ${tr("What happened in the world")}`));
    const online = typeof Online !== "undefined" && Online.connected;
    if (!online) parts.push(el("p", tr("The world news needs the game server: log in and wait to be connected."), "hire-far"));
    else if (!got) parts.push(el("p", tr("The crier is collecting the news…"), "hire-far"));
    else if (!news.length) parts.push(el("p", tr("Nothing has happened yet."), "hire-far"));
    for (const n of news) parts.push(el("p", `${n.city ? "📍 " : "• "}${n.text} · ${ago(n.t)}`, "np-line"));
    body.replaceChildren(...parts);
  }
  function heard(m) { news = Array.isArray(m.list) ? m.list : []; got = true; if ($n("newspanel") && $n("newspanel").classList.contains("show")) render(); }
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    if (typeof Online !== "undefined" && Online.connected) Online.navalSend({ t: "news" });
    render(); openPanel("#newspanel");
  }
  function bind() { const b = $n("btn-news"); if (b) b.addEventListener("click", open); }
  return { bind, open, heard, headlines };
})();
