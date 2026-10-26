"use strict";
// Trading between the modern cities. Each city sells some goods cheaply and wants others dear: buy crates at the trading depot in one city, carry them
// in your vehicle (an aircraft, to reach another city: press F at the edge of the city to fly on) and sell them where they cost more. Press E in a
// vehicle, stopped on the ground within 250 m of the city's market. A vehicle's hold is its own: how many crates it carries depends on the vehicle (a
// bicycle one, a light plane twelve, a cargo freighter four hundred). Crashing loses the cargo. Prices drift every day, and the more you buy or sell the
// worse the price gets for that day. Saved in the browser and in your account. Depends on car.js, stalls.js (SITES), home.js (Time) and vitals.js.

const Trade = (() => {
  const KEY = "rome-hold";
  const GOODS = [
    { id: "spices", name: "Spices", icon: "🌶", base: { rome: 90, delhi: 40, cancun: 70 } },
    { id: "silk", name: "Silk", icon: "🧵", base: { rome: 110, delhi: 60, cancun: 120 } },
    { id: "oil", name: "Olive oil", icon: "🫒", base: { rome: 35, delhi: 70, cancun: 65 } },
    { id: "tea", name: "Tea", icon: "🍵", base: { rome: 60, delhi: 25, cancun: 55 } },
    { id: "cacao", name: "Cacao", icon: "🍫", base: { rome: 75, delhi: 85, cancun: 30 } },
    { id: "jade", name: "Jade", icon: "💎", base: { rome: 160, delhi: 170, cancun: 100 } },
  ];
  // crates each vehicle can carry
  const CAP = { bicycle: 1, scooter: 2, motorcycle: 3, rickshaw: 3, sportscar: 2, citycar: 6, taxi: 6, suv: 12, truck: 40, bus: 30, plane: 12, gyro: 3, glider: 0, balloon: 8, helicopter: 14, tiltrotor: 24,
    blimp: 60, vlj: 8, lightjet: 12, midjet: 16, supermid: 20, heavyjet: 30, airliner: 90, b777x: 200, a350: 180, cargo: 400, transport: 300, fighter: 2, bomber: 150 };
  const ZONE = 250, SPREAD = 0.04, IMPACT = 0.006;
  let hold = {}, impact = { day: -1, map: {} }, el = null, openNow = false;
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") hold = v.hold && typeof v.hold === "object" ? v.hold : {}; } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ hold })); } catch (e) { /* ignore */ } };
  const day = () => Math.floor(Time.day);
  const rnd = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
  const sanitizeHold = (raw) => {
    const out = {};
    if (raw && typeof raw === "object") for (const [vid, goods] of Object.entries(raw)) {
      if (!CAP[vid] || !goods || typeof goods !== "object") continue;
      const g = {}; for (const gd of GOODS) { const n = Math.floor(Number(goods[gd.id])); if (n > 0) g[gd.id] = Math.min(n, CAP[vid]); }
      if (Object.keys(g).length) out[vid] = g;
    }
    return out;
  };
  hold = sanitizeHold(hold);

  const where = () => (typeof city !== "undefined" ? city : "rome");
  const used = (vid) => Object.values(hold[vid] || {}).reduce((a, b) => a + b, 0);
  // the price of a crate here today (the middle price, before the buying or selling margin)
  function price(gd, c = where()) {
    if (impact.day !== day()) impact = { day: day(), map: {} };
    return gd.base[c] * (0.88 + 0.24 * rnd(`${c}-${gd.id}-${day()}`)) * (1 + (impact.map[`${c}-${gd.id}`] || 0));
  }
  const avg = (gd) => (gd.base.rome + gd.base.delhi + gd.base.cancun) / 3;
  const nearDepot = () => {
    const s = typeof Stalls !== "undefined" ? Stalls.SITES[where()] : null, st = Car.state();
    return !!s && !!st && Math.hypot(st.x - s.x, st.z - s.z) < ZONE;
  };
  // can you trade here and now?
  function canTrade() {
    if (era !== "modern" || !Car.driving) return false;
    const st = Car.state();
    return !!st && st.alt < 0.8 && Math.abs(st.v) < 3 && !!CAP[Car.current] && nearDepot();
  }
  // a line for the fares banner: what to press, or why you cannot
  function hint() {
    if (era !== "modern" || !Car.driving || !CAP[Car.current]) return "";
    if (!nearDepot()) return "";
    const st = Car.state(), n = used(Car.current);
    if (st.alt >= 0.8 || Math.abs(st.v) >= 3) return n ? `You are carrying ${n} crate${n === 1 ? "" : "s"}. Stop on the ground near the market to trade.` : "";
    return `Press <kbd>E</kbd> to trade goods${n ? ` (you are carrying ${n} crate${n === 1 ? "" : "s"})` : ""}.`;
  }

  function buy(gd, n) {
    const vid = Car.current, cap = CAP[vid];
    let got = 0, cost = 0;
    for (let i = 0; i < n && used(vid) < cap; i++) {
      const p = Math.round(price(gd) * (1 + SPREAD));
      if (Vitals.coins < p) break;
      Vitals.coins -= p; cost += p; got++;
      const k = `${where()}-${gd.id}`; impact.map[k] = Math.min(0.4, (impact.map[k] || 0) + IMPACT);
      (hold[vid] = hold[vid] || {})[gd.id] = (hold[vid][gd.id] || 0) + 1;
    }
    if (got) { save(); Sfx.play("coin"); toast(`You buy ${got} crate${got === 1 ? "" : "s"} of ${gd.name.toLowerCase()} for ${cost} denarii.`); }
    else toast(used(vid) >= cap ? "Your hold is full." : "You cannot afford that.");
    render();
  }
  function sell(gd, n) {
    const vid = Car.current, have = (hold[vid] || {})[gd.id] || 0;
    let sold = 0, got = 0;
    for (let i = 0; i < Math.min(n, have); i++) {
      const p = Math.round(price(gd) * (1 - SPREAD));
      Vitals.coins += p; got += p; sold++;
      const k = `${where()}-${gd.id}`; impact.map[k] = Math.max(-0.4, (impact.map[k] || 0) - IMPACT);
    }
    if (sold) { hold[vid][gd.id] -= sold; if (hold[vid][gd.id] <= 0) delete hold[vid][gd.id]; if (!Object.keys(hold[vid]).length) delete hold[vid]; save(); Sfx.play("coin"); toast(`You sell ${sold} crate${sold === 1 ? "" : "s"} of ${gd.name.toLowerCase()} for ${got} denarii.`); }
    render();
  }

  // ---- the panel
  function build() {
    el = document.createElement("div"); el.id = "trade"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Trading depot");
    el.innerHTML = '<div class="box"><header><h2 id="tr-title">Trading depot</h2><button id="trade-close" type="button" aria-label="Close">×</button></header><p class="mk-purse" id="tr-purse"></p><p class="mk-note" id="tr-hold"></p><ul class="mk-items" id="tr-list"></ul><p class="mk-note">Prices change every day. Fly on to another city with F at the edge of the city to sell where goods are dear.</p></div>';
    document.body.appendChild(el);
    el.querySelector("#trade-close").addEventListener("click", close);
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
  }
  function render() {
    if (!el) return;
    const vid = Car.current, M = Car.MODELS[vid], cap = CAP[vid] || 0, here = where();
    el.querySelector("#tr-title").textContent = `Trading depot · ${{ rome: "Rome", delhi: "Delhi", cancun: "Cancún" }[here] || here}`;
    el.querySelector("#tr-purse").innerHTML = `Your purse: <b>${Vitals.coins}</b> denarii.`;
    el.querySelector("#tr-hold").textContent = `Your ${M ? M.name.toLowerCase() : "vehicle"} holds ${used(vid)} of ${cap} crates.`;
    const ul = el.querySelector("#tr-list"); ul.replaceChildren();
    for (const gd of GOODS) {
      const p = price(gd), b = Math.round(p * (1 + SPREAD)), s = Math.round(p * (1 - SPREAD)), have = (hold[vid] || {})[gd.id] || 0, rel = p / avg(gd);
      const li = document.createElement("li"), txt = document.createElement("span"), name = document.createElement("strong"), note = document.createElement("small"), btns = document.createElement("span");
      name.textContent = `${gd.icon} ${gd.name}${rel < 0.85 ? "  ▼ cheap here" : rel > 1.15 ? "  ▲ dear here" : ""}`;
      note.textContent = `Buy ${b} · Sell ${s} per crate · you carry ${have}`;
      btns.style.cssText = "display:flex;flex-direction:row;gap:6px";
      const mk = (label, fn, dis) => { const x = document.createElement("button"); x.type = "button"; x.textContent = label; x.disabled = !!dis; x.addEventListener("click", fn); btns.append(x); };
      mk("Buy 1", () => buy(gd, 1), used(vid) >= cap || Vitals.coins < b);
      mk("Buy max", () => buy(gd, 9999), used(vid) >= cap || Vitals.coins < b);
      mk("Sell all", () => sell(gd, 9999), !have);
      txt.append(name, note); li.append(txt, btns); ul.append(li);
    }
  }
  function open() {
    if (!canTrade()) { const h = hint(); toast(h ? h.replace(/<[^>]+>/g, "") : era !== "modern" ? "Trading depots only work in the modern cities." : !Car.driving ? "Get in a vehicle first: goods travel in your vehicle." : !CAP[Car.current] ? "This vehicle cannot carry goods." : "Stop on the ground within about 250 m of the market to trade."); return false; }
    if (!el) build();
    openNow = true; el.classList.add("show"); render();
    return true;
  }
  function close() { openNow = false; if (el) el.classList.remove("show"); }

  function update() { if (openNow && !canTrade()) close(); }
  // a crash (or dying) loses the goods of the vehicle you were in
  function lose() { const vid = Car.current; if (vid && hold[vid]) { delete hold[vid]; save(); toast("Your cargo was lost in the crash!"); } }

  return {
    open, close, update, hint, lose, canTrade,
    get isOpen() { return openNow; },
    snapshot: () => JSON.parse(JSON.stringify(hold)),
    restore(raw) { hold = sanitizeHold(raw); save(); },
    debug: () => ({ hold, prices: GOODS.map((g) => [g.id, Math.round(price(g, "rome")), Math.round(price(g, "delhi")), Math.round(price(g, "cancun"))]) }),
  };
})();
