"use strict";
// The player market: 🏷️ Player market in the menu (players with an account, connected to the game server). Players sell goods and things they own (outfits, pets, weapons, vehicles, treasures) to each other,
// at a price or by auction (1, 6 or 24 hours; the lowest bid is 5% above the top bid, and a bid in the last two minutes gives two minutes more). Every sale pays the seller 95%. Browse the listings,
// buy or bid; sell something of yours; take a listing back (not an auction with a bid on it). The things and the money stay in the browsers: the server is the go-between, and everything that moves
// arrives as MAIL that is applied once (kept in rome-mkt-done) and then acknowledged, so nothing is lost if the page was closed. See server.py, "the player market". Depends on online.js, market.js, shopkeep.js.

const PlayerMarket = (() => {
  const DONE = "rome-mkt-done", TYPES = new Set(["wear", "pet", "weapon", "relic", "car", "mount"]);
  let board = [], fee = 0.05, max = 5, tab = "browse", filter = "", note = "";
  let done = [];
  try { const r = JSON.parse(localStorage.getItem(DONE) || "[]"); if (Array.isArray(r)) done = r.slice(-200); } catch (e) { /* storage unavailable */ }
  const $p = (id) => document.getElementById(id);
  const send = (a, o = {}) => Online.navalSend({ t: "social", a, ...o });
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const nameOf = (id, ik) => (ik === "good" ? (Shopkeep.GOODS[id] ? Shopkeep.GOODS[id][0] : id) : ik === "furn" ? (Furnish.PIECES[id] ? tr(Furnish.PIECES[id][0]) : id) : Market.itemName(id));
  const left = (s) => (s <= 0 ? tr("ended") : s < 3600 ? `${Math.ceil(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

  // ---------------------------------------------------------------- mail: money and things that have come to you
  function apply(mail) {
    if (done.includes(mail.id)) return;
    let ok = true;
    if (mail.item) {
      if (mail.ik === "good") Shopkeep.give(mail.item, mail.n || 1);
      else if (mail.ik === "furn") Furnish.give(mail.item, mail.n || 1, mail.frm);
      else if (!Market.grant(mail.item)) ok = false;                                     // (you already own that one: the money is not taken)
    }
    if (ok && mail.coins) Vitals.coins = Math.max(0, Vitals.coins + mail.coins);
    done.push(mail.id); done = done.slice(-200);
    try { localStorage.setItem(DONE, JSON.stringify(done)); } catch (e) { /* ignore */ }
    toast(ok ? `🏷️ ${tr(mail.text)}` : `🏷️ ${tr("You already own that, so the sale did not go through.")}`);
    if (mail.coins > 0) Sfx.play("coin");
  }
  function on(m) {
    if (m.a === "mail") { apply(m.mail); send("m_ack", { ids: [m.mail.id] }); if ($p("pmarket").classList.contains("show")) send("m_board"); }
    else if (m.a === "board") { board = m.list || []; fee = m.fee || fee; max = m.max || max; render(); }
    else if (m.a === "err") { note = tr(m.text); render(); }
  }

  // ---------------------------------------------------------------- the panel
  function mineSellable() {
    const goods = Shopkeep.IDS.filter((id) => Shopkeep.owns(id) > 0).map((id) => ({ id, ik: "good", n: Shopkeep.owns(id), name: Shopkeep.GOODS[id][0] }));
    const items = Market.snapshot().items.filter((id) => TYPES.has(Market.typeOf(id))).map((id) => ({ id, ik: "item", n: 1, name: Market.itemName(id) }));
    const furn = Object.keys(Furnish.PIECES).filter((id) => Furnish.free(id) > 0).map((id) => ({ id, ik: "furn", n: Furnish.free(id), name: tr(Furnish.PIECES[id][0]) }));
    return goods.concat(furn, items);
  }
  function render() {
    const body = $p("pm-body"); if (!body) return;
    const rows = [];
    const tabs = el("div", undefined, "pm-tabs");
    for (const [k, label] of [["browse", "🛒 Browse"], ["sell", "🏷️ Sell"], ["mine", "📋 My listings"]]) { const b = el("button", tr(label)); b.type = "button"; if (tab === k) b.className = "on"; b.addEventListener("click", () => { tab = k; note = ""; render(); }); tabs.append(b); }
    rows.push(tabs, el("p", tr("You have {0} denarii.").replace("{0}", Math.round(Vitals.coins)), "dnote"));
    if (note) rows.push(el("p", note, "sk-note"));
    if (tab === "browse") {
      const f = el("input"); f.type = "search"; f.placeholder = tr("Search"); f.value = filter; f.addEventListener("input", () => { filter = f.value; render(); f.focus(); });
      rows.push(f);
      const ul = el("ul", undefined, "mk-items");
      for (const L of board.filter((x) => !x.mine && (x.label + x.seller).toLowerCase().includes(filter.toLowerCase()))) {
        const li = el("li"), txt = el("span");
        const auction = L.sale === "auction", price = auction ? (L.bid ? L.bid : L.price) : L.price;
        txt.append(el("strong", `${L.label}${L.n > 1 ? ` × ${L.n}` : ""}`), el("small", auction ? `${tr("Auction")} · ${L.bid ? `${tr("top bid")} ${L.bid} (${L.bidder})` : `${tr("from")} ${L.price}`} · ${left(L.left)} · ${L.seller}` : `${L.seller} · ${left(L.left)}`));
        li.append(txt);
        const owned = L.ik === "item" && Market.owns(L.item);
        if (auction) {
          const amt = el("input"); amt.type = "number"; amt.className = "pm-amt"; amt.value = L.bid ? L.bid + Math.max(1, Math.floor(L.bid * 0.05)) : L.price; amt.min = 1;
          const b = el("button", tr("Bid")); b.type = "button"; b.disabled = owned || Vitals.coins < Number(amt.value); b.addEventListener("click", () => { note = ""; send("m_bid", { id: L.id, amt: Number(amt.value) }); });
          li.append(amt, b);
        } else { const b = el("button", `${tr("Buy")} · ${price}`); b.type = "button"; b.disabled = owned || Vitals.coins < price; b.addEventListener("click", () => { note = ""; send("m_buy", { id: L.id }); }); li.append(b); }
        ul.append(li);
      }
      if (!ul.children.length) rows.push(el("p", tr("Nothing for sale yet. Be the first: press Sell."), "dnote")); else rows.push(ul);
    } else if (tab === "sell") {
      const list = mineSellable();
      if (!list.length) rows.push(el("p", tr("You have nothing to sell yet: buy goods in the shops, or earn outfits, pets and treasures."), "dnote"));
      else {
        const sel = el("select"), qty = el("input"), price = el("input"), sale = el("select"), hours = el("select"), go = el("button", tr("List it"));
        for (const it of list) { const o = el("option", `${it.name}${it.ik !== "item" ? ` (${it.n})` : ""}`); o.value = `${it.ik}:${it.id}`; sel.append(o); }
        qty.type = "number"; qty.min = 1; qty.value = 1; price.type = "number"; price.min = 1; price.placeholder = tr("Price"); price.value = "";
        for (const [v, t] of [["fixed", "At a price"], ["auction", "Auction"]]) { const o = el("option", tr(t)); o.value = v; sale.append(o); }
        for (const h of [1, 6, 24]) { const o = el("option", `${h} h`); o.value = String(h); hours.append(o); } hours.value = "24";
        go.type = "button";
        const sync = () => { const [ik] = sel.value.split(":"); qty.hidden = ik === "item"; hours.hidden = sale.value !== "auction"; };
        sel.addEventListener("change", sync); sale.addEventListener("change", sync); sync();
        go.addEventListener("click", () => {
          const [ik, id] = sel.value.split(":"), n = ik === "good" ? Math.max(1, Math.min(Shopkeep.owns(id), Math.floor(Number(qty.value) || 1))) : ik === "furn" ? Math.max(1, Math.min(Furnish.free(id), Math.floor(Number(qty.value) || 1))) : 1, p = Math.floor(Number(price.value));
          if (!(p >= 1)) { note = tr("Name a price."); render(); return; }
          if (mine().length >= max) { note = tr("You can have up to {0} listings at a time.").replace("{0}", max); render(); return; }
          const ok = ik === "good" ? Shopkeep.take(id, n) : ik === "furn" ? Furnish.take(id, n) : Market.take(id);                    // (out of your pack first: it is in the listing now, and comes back by mail if it does not sell)
          if (!ok) return;
          send("m_list", { item: id, ik, n, price: p, sale: sale.value, hours: Number(hours.value), label: nameOf(id, ik) });
          note = tr("Listed."); tab = "mine"; render();
        });
        const form = el("div", undefined, "pm-form"); form.append(sel, qty, price, sale, hours, go);
        rows.push(form, el("p", tr("The market keeps 5% of every sale. An auction takes the highest bid when it ends; a bid in the last two minutes gives two minutes more."), "dnote small"));
      }
    } else {
      const ul = el("ul", undefined, "mk-items");
      for (const L of mine()) {
        const li = el("li"), txt = el("span"), auction = L.sale === "auction";
        txt.append(el("strong", `${L.label}${L.n > 1 ? ` × ${L.n}` : ""}`), el("small", auction ? `${tr("Auction")} · ${L.bid ? `${tr("top bid")} ${L.bid} (${L.bidder})` : `${tr("from")} ${L.price}`} · ${left(L.left)}` : `${L.price} · ${left(L.left)}`));
        const b = el("button", tr("Take back")); b.type = "button"; b.disabled = auction && !!L.bid; b.addEventListener("click", () => send("m_cancel", { id: L.id })); li.append(txt, b); ul.append(li);
      }
      rows.push(mine().length ? ul : el("p", tr("You have nothing listed."), "dnote"));
    }
    body.replaceChildren(...rows);
  }
  const mine = () => board.filter((x) => x.mine);

  function open() {
    if (typeof Account !== "undefined" && Account.demo) { toast(Account.why ? Account.why(tr("The player market needs an account: log in to trade with other players.")) : tr("The player market needs an account: log in to trade with other players.")); return; }
    if (!Online.connected || typeof Account === "undefined" || !Account.loggedIn) { toast(tr("The player market needs the game server: log in and wait to be connected.")); return; }
    tab = "browse"; note = ""; render(); send("m_board"); send("m_mail"); openPanel("#pmarket");
  }
  function bind() {
    const b = $p("btn-pmarket"); if (b) b.addEventListener("click", open);
    setInterval(() => { if (Online.connected && Account.loggedIn) { send("m_mail"); if ($p("pmarket").classList.contains("show")) send("m_board"); } }, 20000);
  }
  return { bind, open, on };
})();
