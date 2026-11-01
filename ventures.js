"use strict";
// Businesses and a museum. Open 🏢 Business in the menu.
//   BUSINESSES: buy a bakery, a taxi company, a shipping firm, a theatre troupe or an airline. Bots work for them, and every game morning they pay you their profit (a good or a
//               bad week moves it up or down by a third). Hire more bots (two levels) to make more, or sell the business for 70% of everything you paid.
//   MUSEUM:     buy a museum, put your rare treasures in it, and visitors pay 2% of the worth of the treasures on show every morning (4 treasures on show, then 8, then 12).
// Profit is paid when a new game day starts, for up to 14 days you were away. Saved in the browser and with your account.
// Depends on market.js (Market.relics, take/grant are not needed), relics.js (Relics.owned), vitals.js, home.js (Time) and the globals of game.js.

const Ventures = (() => {
  const KEY = "rome-ventures", SELL_BACK = 0.7, MAX_DAYS = 14;
  const BIZ = [
    { id: "bakery", name: "Corner bakery", price: 800, profit: 40, note: "Fresh bread every morning for the neighbourhood." },
    { id: "taxi", name: "Taxi company", price: 2500, profit: 120, note: "A fleet of cabs driven by bots." },
    { id: "shipping", name: "Shipping firm", price: 6000, profit: 320, note: "Cargo ships bring in goods from far away." },
    { id: "theatre", name: "Theatre troupe", price: 9000, profit: 480, note: "Plays and comedies, with a full house every night." },
    { id: "airline", name: "Airline", price: 20000, profit: 1200, note: "Passenger planes flown by bot pilots." },
  ];
  const HIRE = [{ cost: 0.6, mult: 1.8 }, { cost: 1.0, mult: 2.8 }];          // hiring more bots: the cost (as a share of the price) and the profit multiplier at that level
  const MUSEUM = [{ cost: 3000, slots: 4 }, { cost: 6000, slots: 8 }, { cost: 12000, slots: 12 }];
  let s = { biz: {}, museum: 0, paidDay: 1 };
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && typeof r === "object") s = sanitize(r); } catch (e) { /* storage unavailable */ }

  function sanitize(raw) {
    const out = { biz: {}, museum: Math.max(0, Math.min(3, Math.floor(Number(raw && raw.museum) || 0))), paidDay: Math.max(1, Math.floor(Number(raw && raw.paidDay) || 1)) };
    const b = raw && typeof raw.biz === "object" && raw.biz ? raw.biz : {};
    for (const x of BIZ) if (b[x.id]) out.biz[x.id] = { level: Math.max(0, Math.min(2, Math.floor(Number(b[x.id].level) || 0))) };
    return out;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  const levelOf = (b) => (s.biz[b.id] ? s.biz[b.id].level : -1);
  const profitOf = (b, day) => { const l = levelOf(b); if (l < 0) return 0; const base = b.profit * (l ? HIRE[l - 1].mult : 1), week = 0.7 + 0.6 * seeded(`${b.id}-${Math.floor(day / 7)}`)(); return Math.round(base * week); };   // (a good or bad week)
  const baseProfit = (b) => { const l = levelOf(b); return Math.round(b.profit * (l > 0 ? HIRE[l - 1].mult : 1)); };
  const invested = (b) => b.price + HIRE.slice(0, Math.max(0, levelOf(b))).reduce((t, h) => t + Math.round(b.price * h.cost), 0);
  const museumValue = () => { const slots = s.museum ? MUSEUM[s.museum - 1].slots : 0, vals = Relics.owned.map((id) => Market.priceOf(id)).sort((a, b) => b - a).slice(0, slots); return vals.reduce((t, v) => t + v, 0); };
  const museumIncome = () => Math.round(museumValue() * 0.02);
  const totalFor = (day) => BIZ.reduce((t, b) => t + profitOf(b, day), 0) + museumIncome();

  // ---------------------------------------------------------------- the panel
  const $v = (id) => document.getElementById(id);
  function render() {
    const list = $v("bz-list"); list.replaceChildren();
    for (const b of BIZ) {
      const li = document.createElement("li"), txt = document.createElement("span"), nm = document.createElement("strong"), sm = document.createElement("small"), l = levelOf(b);
      nm.textContent = l < 0 ? b.name : `${b.name} · ${l ? "level " + l : "level 0"}`;
      sm.textContent = l < 0 ? `${b.note} Profit about ${b.profit} denarii a day.` : `${b.note} Profit about ${baseProfit(b)} a day (a good week brings more, a bad week less).`;
      txt.append(nm, sm); li.append(txt);
      const btns = document.createElement("span"); btns.className = "bz-btns";
      const mk = (label, fn, off) => { const x = document.createElement("button"); x.type = "button"; x.textContent = label; x.disabled = !!off; x.addEventListener("click", fn); btns.append(x); return x; };
      if (l < 0) mk(`Buy · ${b.price}`, () => { if (Vitals.coins < b.price) return; Vitals.coins -= b.price; s.biz[b.id] = { level: 0 }; save(); Sfx.play("coin"); toast(`You bought the ${b.name.toLowerCase()}.`); render(); }, Vitals.coins < b.price);
      else {
        if (l < 2) { const cost = Math.round(b.price * HIRE[l].cost); mk(`Hire more bots · ${cost}`, () => { if (Vitals.coins < cost) return; Vitals.coins -= cost; s.biz[b.id].level = l + 1; save(); Sfx.play("discover"); toast(`More bots work at the ${b.name.toLowerCase()}: profit ${baseProfit(b)} a day.`); render(); }, Vitals.coins < cost); }
        let armed = 0; const back = Math.round(invested(b) * SELL_BACK);
        const sell = mk(`Sell · ${back}`, () => { if (!armed || performance.now() - armed > 4000) { armed = performance.now(); sell.textContent = `Sure? Sell for ${back}`; return; } delete s.biz[b.id]; Vitals.coins += back; save(); Sfx.play("coin"); toast(`You sold the ${b.name.toLowerCase()} for ${back} denarii.`); render(); });
      }
      li.append(btns); list.append(li);
    }
    // the museum
    const mu = $v("bz-museum"); mu.replaceChildren();
    const lv = s.museum, next = MUSEUM[lv];
    const info = document.createElement("p"); info.className = "dnote";
    info.textContent = lv ? `Your museum shows up to ${MUSEUM[lv - 1].slots} treasures. You have ${Relics.owned.length}; the ones on show are worth ${museumValue().toLocaleString()}, and visitors pay you ${museumIncome()} denarii a morning (2%).` : `Buy a museum and your treasures earn money: visitors pay 2% of the worth of the treasures on show every morning. You have ${Relics.owned.length} treasure${Relics.owned.length === 1 ? "" : "s"}.`;
    mu.append(info);
    if (next) { const b = document.createElement("button"); b.type = "button"; b.textContent = lv ? `Expand · ${next.cost} (up to ${next.slots} on show)` : `Buy the museum · ${next.cost}`; b.disabled = Vitals.coins < next.cost; b.addEventListener("click", () => { if (Vitals.coins < next.cost) return; Vitals.coins -= next.cost; s.museum = lv + 1; save(); Sfx.play("discover"); toast(lv ? "Your museum is bigger now." : "You bought a museum."); render(); }); mu.append(b); }
    $v("bz-total").textContent = `Today's profit if it were morning: about ${totalFor(Time.day).toLocaleString()} denarii.`;
  }
  const open = () => { render(); openPanel("#ventures"); };

  // ---------------------------------------------------------------- paying out every morning
  let tick = 0;
  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    tick += dt; if (tick < 1) return; tick = 0;
    if (Time.day > s.paidDay) {
      let pay = 0; const days = Math.min(MAX_DAYS, Time.day - s.paidDay);
      for (let d = Time.day - days + 1; d <= Time.day; d++) pay += totalFor(d);
      s.paidDay = Time.day; save();
      if (pay > 0) { Vitals.coins += pay; Sfx.play("coin"); toast(`Your businesses${s.museum ? " and museum" : ""} earned ${pay} denarii${days > 1 ? ` over ${days} days` : ""}.`); }
    } else if (Time.day < s.paidDay) { s.paidDay = Time.day; save(); }
  }

  function bind() { const b = $v("btn-business"); if (b) b.addEventListener("click", open); }

  return {
    bind, update, open,
    snapshot: () => JSON.parse(JSON.stringify(s)),
    restore(raw) { s = sanitize(raw); save(); },
    merge(raw) { const o = sanitize(raw); for (const [id, v] of Object.entries(o.biz)) s.biz[id] = { level: Math.max(v.level, s.biz[id] ? s.biz[id].level : 0) }; s.museum = Math.max(s.museum, o.museum); save(); },
    get count() { return Object.keys(s.biz).length + (s.museum ? 1 : 0); },
    _profit: (day) => totalFor(day),
  };
})();
