"use strict";
// Shopkeepers: walk up to the keeper of a shop you can walk into (interiors.js) and press F. The keeper
//   - sells to you: the bakery, taverns and food stalls open the market's food menu, the cloth shops its clothes, and every other shop sells three goods of its own (oil, spices, ink, snorkels...),
//   - buys your goods: a good sold in another city pays 40% more than you paid (the price drops 10% for every one you sold today), one from the same city pays half,
//   - tells you the news of the neighbourhood and where the nearest sight you have not seen is,
//   - has an errand for you now and then: bring a good from another shop in the city, and be paid more than it cost (the daily quest can ask for two of them).
// Press F next to a stool to sit down (press F again for dice and xiangqi at the table; moving stands you up). The goods you buy stand on a shelf in your house (the same walls as the souvenir shelf).
// More: a price board (which goods each city wants today: +35%, or 25% less when there is plenty), shops you can buy (they earn every day, more when you stock the shelves with goods), regular customers (three
// stars: up to 10% off, errands pay more, the keeper knows your name), inns (a room for the night in a tavern or hotel), workbenches (combine two or three goods into a better one), dice at the table (against the keeper),
// and a pickpocket who slips into a shop now and then. A friend sitting near you at a table is seen sitting (online.js).
// Goods, the errand, your shops, your regulars and what you sold today are saved in the browser and with your account's cloud save. Depends on interiors.js, market.js, vitals.js, i18n.js and the globals of game.js.

const Shopkeep = (() => {
  const T = THREE, KEY = "rome-goods";
  // id: [name, price, city it comes from, shape, colour, the shop that sells it (its kind's name)]
  const GOODS = {
    nails: ["Box of iron nails", 14, "rome", "box", 0x6a6a6a, "Workshop"], hammer: ["Smith's hammer", 30, "rome", "tool", 0x7a6a58, "Workshop"], mirror: ["Bronze mirror", 55, "rome", "disc", 0xb08d3e, "Workshop"],
    oliveoil: ["Olive oil jar", 20, "rome", "jar", 0xb7a23a, "Oil seller"], lampoil: ["Lamp oil", 12, "rome", "bottle", 0xcfc060, "Oil seller"], soap: ["Scented soap", 9, "rome", "box", 0xe8d8b0, "Oil seller"],
    lamp: ["Clay lamp", 10, "rome", "cup", 0xc4673c, "Potter"], cup: ["Painted cup", 8, "rome", "cup", 0xa94f2c, "Potter"], amphora: ["Fine amphora", 35, "rome", "jar", 0xd98b5a, "Potter"],
    saffron: ["Saffron", 45, "delhi", "jar", 0xe0731a, "Spice shop"], cumin: ["Cumin seeds", 14, "delhi", "sack", 0x8a6a2a, "Spice shop"], pepper: ["Black pepper", 22, "delhi", "sack", 0x2a2a2a, "Spice shop"],
    silverring: ["Silver ring", 60, "delhi", "ring", 0xc0c0c8, "Jeweller"], bangle: ["Gold bangle", 120, "delhi", "ring", 0xe0b040, "Jeweller"], pearls: ["Pearl strand", 90, "delhi", "ring", 0xf0e8e0, "Jeweller"],
    attar: ["Rose attar", 40, "delhi", "bottle", 0xb04a6a, "Attar seller"], sandal: ["Sandalwood oil", 35, "delhi", "bottle", 0xc0a060, "Attar seller"], incense: ["Incense sticks", 12, "delhi", "box", 0x8a5a3a, "Attar seller"],
    postcard: ["Postcard", 5, "cancun", "box", 0x3f8a6a, "Visitor centre"], guidebook: ["Guidebook", 18, "cancun", "box", 0x2a5a6a, "Visitor centre"], jadecharm: ["Jade charm", 50, "cancun", "ring", 0x3fa575, "Visitor centre"],
    strawhat: ["Straw hat", 15, "cancun", "disc", 0xe0c060, "Hotel lobby"], sunscreen: ["Sunscreen", 10, "cancun", "bottle", 0xf2c21b, "Hotel lobby"], cocktail: ["Coconut cocktail", 12, "cancun", "cup", 0xf0f0e0, "Hotel lobby"],
    sandals: ["Beach sandals", 14, "cancun", "box", 0xe23b3b, "Beach shop"], towel: ["Beach towel", 16, "cancun", "box", 0x2f8fe0, "Beach shop"], shellnecklace: ["Seashell necklace", 20, "cancun", "ring", 0xf0e0d0, "Beach shop"],
    mask: ["Diving mask", 35, "cancun", "disc", 0x2f8fe0, "Dive shop"], fins: ["Fins", 28, "cancun", "box", 0x1a1a2a, "Dive shop"], compass: ["Waterproof compass", 40, "cancun", "disc", 0xb08d3e, "Dive shop"],
    ink: ["Ink stick", 12, "beijing", "box", 0x1c1612, "Brush shop"], brush: ["Calligraphy brush", 18, "beijing", "tool", 0x8a4a2a, "Brush shop"], paper: ["Rice paper", 10, "beijing", "scroll", 0xe9e7df, "Brush shop"],
    longjing: ["Longjing tea", 30, "beijing", "jar", 0x5a7a3a, "Tea shop"], jasmine: ["Jasmine tea", 22, "beijing", "jar", 0xe0e0d0, "Tea shop"], teapot: ["Clay teapot", 45, "beijing", "jar", 0x8a4a2a, "Tea shop"],
    cacao: ["Cacao beans", 10, "cancun", "sack", 0x5a3a22, "Cacao seller"], vanilla: ["Vanilla pods", 25, "cancun", "tool", 0x2a1a10, "Cacao seller"], honey: ["Honey jar", 14, "cancun", "jar", 0xd9a030, "Cacao seller"],
    obsidian: ["Obsidian blade", 45, "cancun", "tool", 0x1a1a22, "Obsidian trader"], copal: ["Copal incense", 12, "cancun", "box", 0xe0d8b0, "Obsidian trader"], bowl: ["Painted bowl", 18, "cancun", "cup", 0xc4673c, "Obsidian trader"],
    snacks: ["Snack box", 6, "beijing", "box", 0xe23b3b, "Convenience store"], umbrella: ["Umbrella", 15, "beijing", "tool", 0x2c7fe0, "Convenience store"], phonecard: ["Phone card", 8, "beijing", "box", 0xf2c21b, "Convenience store"],
  };
  // what the keepers can make from your goods: id: [name, value, city, shape, colour, ""] (made, not sold), and the recipe (the shop kind with the workbench, what it takes)
  Object.assign(GOODS, {
    perfumedlamp: ["Perfumed lamp", 75, "rome", "cup", 0xd9a05a, ""], engravedmirror: ["Engraved mirror", 140, "rome", "disc", 0xc8b070, ""], saffronoil: ["Saffron oil", 90, "rome", "bottle", 0xe0a020, ""],
    masalabox: ["Masala box", 120, "delhi", "box", 0xc4562a, ""], pearlring: ["Pearl ring", 190, "delhi", "ring", 0xf4eee8, ""], giftincense: ["Incense gift set", 80, "delhi", "box", 0x9a6a4a, ""],
    seacompass: ["Sea compass", 90, "cancun", "disc", 0x4a7aa0, ""], cacaotreats: ["Cacao treats", 60, "cancun", "sack", 0x6a3a22, ""], ritualknife: ["Ritual knife", 90, "cancun", "tool", 0x22222a, ""],
    scholarset: ["Scholar's set", 70, "beijing", "scroll", 0xd8d0b8, ""], teaset: ["Tea gift set", 100, "beijing", "jar", 0xa86a3a, ""],
  });
  const CRAFTS = {
    perfumedlamp: ["Potter", "lamp", "attar"], engravedmirror: ["Workshop", "mirror", "silverring"], saffronoil: ["Oil seller", "oliveoil", "saffron"], masalabox: ["Spice shop", "cumin", "pepper", "saffron"],
    pearlring: ["Jeweller", "silverring", "pearls"], giftincense: ["Attar seller", "incense", "sandal"], seacompass: ["Dive shop", "compass", "shellnecklace"], cacaotreats: ["Cacao seller", "cacao", "vanilla", "honey"],
    ritualknife: ["Obsidian trader", "obsidian", "copal"], scholarset: ["Brush shop", "brush", "ink", "paper"], teaset: ["Tea shop", "longjing", "teapot"],
  };
  const IDS = Object.keys(GOODS), CITY_NAMES = { rome: "Rome", delhi: "Old Delhi", cancun: "Cancún", beijing: "Beijing" };
  const soldBy = (kind) => IDS.filter((id) => GOODS[id][5] === kind);

  const GOSSIP = {
    "rome-ancient": ["The chariots race at the Circus Maximus most days. A good horse is worth every denarius.", "Be careful on the Via Sacra at night. The watch cannot be everywhere."],
    "rome-modern": ["Tourists everywhere, and they all want the same photo of the Colosseum.", "The best coffee in the district is just round the corner. Ask anyone."],
    "delhi-ancient": ["The emperor's elephants pass through Chandni Chowk on festival days. Stand well back!", "A good merchant knows every lane between the Red Fort and the Jama Masjid."],
    "delhi-modern": ["Chandni Chowk is the oldest bazaar in Delhi, and still the busiest.", "Take the metro to Chandni Chowk: the lanes are too narrow for a car."],
    "cancun-ancient": ["At the equinox the serpent of light crawls down El Castillo. People come from far to see it.", "Mind the ball court: the players there are not gentle."],
    "cancun-modern": ["The reef is full of fish, and they say there are chests hidden on the sea floor.", "The hotel zone never sleeps, but the ruins close at sunset."],
    "beijing-ancient": ["The Forbidden City has nine thousand rooms, and nobody may enter without leave.", "On festival days the lanterns hang from every roof in the hutong."],
    "beijing-modern": ["From the top of the China Zun you can see the whole city.", "The hutongs are quiet in the morning. The best dumplings are sold there."],
    common: ["Prices go up when the tax collector is angry. Keep on his good side.", "Rest when you are hurt. A night's sleep at home mends more than any salve.", "Press G to be guided to the nearest sight you have not seen.", "The daily quest pays more every day in a row. Do not miss a day."],
  };
  const OWN_MAX = 5, STOCK_MAX = 6, REGULAR = [0, 100, 400, 1000], DISCOUNT = [0, 0.03, 0.06, 0.10], FACES = "⚀⚁⚂⚃⚄⚅";
  const level = (spent) => REGULAR.reduce((l, t, i) => (spent >= t ? i : l), 0);
  const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

  const blank = () => ({ inv: {}, sold: {}, day: 0, errand: null, given: {}, done: 0, shops: {}, rep: {}, visited: [], profit: 0, crafted: 0, dice: { w: 0, l: 0 }, inn: 0 });
  let st = blank();
  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || "null");
      if (r && typeof r === "object") restore(r, true);
    } catch (e) { /* storage unavailable */ }
  }
  function clean(r) {
    const o = blank(), num = (v, hi) => Math.max(0, Math.min(hi, Math.floor(Number(v)) || 0));
    o.day = num(r.day, 1e9); o.done = num(r.done, 1e6); o.profit = num(r.profit, 1e9); o.crafted = num(r.crafted, 1e6); o.inn = num(r.inn, 1e6);
    if (r.dice && typeof r.dice === "object") o.dice = { w: num(r.dice.w, 1e6), l: num(r.dice.l, 1e6) };
    if (Array.isArray(r.visited)) o.visited = [...new Set(r.visited.filter((v) => typeof v === "string" && v.length < 40))].slice(0, 400);
    if (r.rep && typeof r.rep === "object") for (const [k, v] of Object.entries(r.rep).slice(0, 400)) if (k.length < 40 && Number(v) > 0) o.rep[k] = num(v, 1e7);
    if (r.shops && typeof r.shops === "object") for (const [k, v] of Object.entries(r.shops).slice(0, 12)) {
      if (k.length >= 40 || !v || typeof v !== "object" || !CITY_NAMES[v.city]) continue;
      const stock = {}; let n = 0;
      if (v.stock && typeof v.stock === "object") for (const id of IDS) { const c = num(v.stock[id], STOCK_MAX); if (c && n + c <= STOCK_MAX) { stock[id] = c; n += c; } }
      o.shops[k] = { at: Math.max(0, Number(v.at) || Date.now()), name: String(v.name || "").slice(0, 30), city: v.city, price: num(v.price, 1e6), stock };
    }
    if (r.inv && typeof r.inv === "object") for (const id of IDS) { const n = Math.floor(Number(r.inv[id])); if (n > 0) o.inv[id] = Math.min(99, n); }
    if (r.sold && typeof r.sold === "object") for (const [k, v] of Object.entries(r.sold)) { const [c, id] = k.split(":"); if (CITY_NAMES[c] && GOODS[id] && Math.floor(Number(v)) > 0) o.sold[k] = Math.min(99, Math.floor(Number(v))); }
    const e = r.errand;
    if (e && typeof e === "object" && GOODS[e.good] && GOODS[e.good][5] && typeof e.shop === "string" && e.shop.length < 40 && Math.floor(e.n) >= 1 && Math.floor(e.n) <= 5) o.errand = { shop: e.shop, name: String(e.name || "").slice(0, 40), good: e.good, n: Math.floor(e.n), reward: Math.max(1, Math.min(2000, Math.floor(e.reward) || 1)), city: CITY_NAMES[e.city] ? e.city : "rome" };
    if (r.given && typeof r.given === "object") for (const [k, v] of Object.entries(r.given)) if (typeof k === "string" && k.length < 40 && Number.isFinite(Number(v))) o.given[k] = Number(v);
    return o;
  }
  function restore(r, quiet) { st = clean(r); if (!quiet) save(); refresh(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } refresh(); }
  const epoch = () => (typeof Payroll !== "undefined" ? Payroll.epoch() : 0);
  function today() { if (st.day !== epoch()) { st.day = epoch(); st.sold = {}; st.given = {}; } }

  // ---------------------------------------------------------------- words
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const T_ = (tpl, ...args) => tr(tpl).replace(/\{(\d)\}/g, (_, i) => args[+i]);
  const cityNow = () => (typeof city !== "undefined" ? city : "rome");
  const mark = (p) => Math.round(p * (typeof Tax !== "undefined" ? Tax.priceMul : 1));
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const owns = (id) => st.inv[id] || 0;
  const total = () => Object.values(st.inv).reduce((a, b) => a + b, 0);

  // what each city wants today (the same for everybody: it changes every game day): +35% for a good in demand, -25% when there is plenty
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const demandOf = (c, id) => { const r = hashStr(`${epoch()}|${c}|${id}`)(); return r < 0.2 ? 1.35 : r > 0.88 ? 0.75 : 1; };
  function sellPrice(id, c) {
    const g = GOODS[id], n = st.sold[`${c}:${id}`] || 0;
    return Math.max(1, Math.round(g[1] * (g[2] === c ? 0.5 : 1.4) * demandOf(c, id) * Math.pow(0.9, n)));
  }
  const repOf = (id) => level(st.rep[id] || 0);
  const buyPrice = (id) => Math.max(1, Math.round(mark(GOODS[id][1]) * (1 - DISCOUNT[repOf(shop.id)] - (st.shops[shop.id] ? 0.3 : 0))));
  const shopCost = () => mark(shop.trade === "food" ? 900 : shop.trade === "clothes" ? 1100 : 1300);
  const rateOf = (o) => Math.round(o.price / 20 + Object.entries(o.stock).reduce((a, [id, n]) => a + GOODS[id][1] * 0.08 * n, 0));
  const pendingOf = (o) => Math.round(rateOf(o) * (typeof Payroll !== "undefined" ? Payroll.realDays(o.at) : 0));
  const stocked = (o) => Object.values(o.stock).reduce((a, b) => a + b, 0);
  const stars = (l) => "★".repeat(l) + "☆".repeat(3 - l);
  const recipesOf = (kind) => Object.entries(CRAFTS).filter(([, r]) => r[0] === kind);

  // ---------------------------------------------------------------- the panel
  let shop = null, view = "main", note = "", sure = { key: "", at: 0 };
  function say(m) { note = m; render(); }
  const armed = (key) => { if (sure.key === key && performance.now() - sure.at < 4000) { sure.key = ""; return true; } sure = { key, at: performance.now() }; return false; };

  function render() {
    const body = document.getElementById("sk-body"); if (!body || !shop) return;
    today();
    document.getElementById("sk-title").textContent = `${tr(shop.name)} · ${tr(shop.keeper)}`;
    const rows = [], c = shop.city, mine = st.shops[shop.id], L = repOf(shop.id);
    const btn = (label, fn, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", fn); return b; };
    const purse = () => el("p", T_("You have {0} denarii.", Vitals.coins), "dnote");
    const go = (v) => () => { note = ""; view = v; render(); };
    if (note) rows.push(el("p", note, "sk-note"));
    if (view === "main") {
      rows.push(el("p", `"${tr(shop.line)}"`, "sk-line"));
      if (L > 0) rows.push(el("p", `${stars(L)} ${T_("Regular customer: {0}% off", Math.round(DISCOUNT[L] * 100))}`, "dnote"));
      if (mine) rows.push(el("p", T_("🏪 This is your shop. Waiting for you: {0} denarii.", pendingOf(mine)), "dnote"));
      const menu = el("div", undefined, "sk-menu");
      if (shop.trade === "food") menu.append(btn(tr("🍞 See what is cooking"), () => { closePanels(); setTimeout(() => Market.open("food"), 0); }));
      else if (shop.trade === "clothes") menu.append(btn(tr("👘 See the clothes"), () => { closePanels(); setTimeout(() => Market.open("clothes"), 0); }));
      else menu.append(btn(tr("🛒 Buy"), go("buy")));
      if (shop.trade === "goods") menu.append(btn(tr("💰 Sell your goods"), go("sell")));
      if (recipesOf(shop.kindName).length) menu.append(btn(tr("🛠️ Workbench"), go("craft")));
      menu.append(btn(tr("📊 Price board"), go("board")), btn(tr("🗣️ Ask about the neighbourhood"), go("gossip")));
      const e = st.errand;
      menu.append(btn(tr(e && e.shop === shop.id ? "📦 About my errand" : "📦 Any work for me?"), go("errand")));
      if (shop.kindName === "Tavern" || shop.kindName === "Hotel lobby") menu.append(btn(T_("🛏️ Rent a room for the night · {0}", innPrice()), rentRoom));
      menu.append(mine ? btn(tr("🏪 Manage your shop"), go("own")) : btn(T_("🏪 Buy this shop · {0}", shopCost()), go("own")));
      menu.append(btn(tr("👋 Goodbye"), closePanels));
      rows.push(menu);
    } else if (view === "buy") {
      rows.push(el("h3", tr("For sale")), purse());
      const ul = el("ul", undefined, "mk-items");
      for (const id of soldBy(shop.kindName)) {
        const g = GOODS[id], price = buyPrice(id), li = el("li"), txt = el("span"), b = el("button", T_("Buy · {0}", price));
        txt.append(el("strong", tr(g[0])), el("small", owns(id) ? T_("You have {0}.", owns(id)) : tr(`From ${CITY_NAMES[g[2]]}`)));
        b.type = "button"; b.disabled = Vitals.coins < price || owns(id) >= 99;
        b.addEventListener("click", () => buy(id)); li.append(txt, b); ul.append(li);
      }
      rows.push(ul, back());
    } else if (view === "sell") {
      rows.push(el("h3", tr("Your goods")), purse());
      const ul = el("ul", undefined, "mk-items"), have = IDS.filter((id) => owns(id) > 0);
      if (!have.length) rows.push(el("p", tr("You have no goods to sell. Buy some in the shops, and sell them in another city for more."), "dnote"));
      for (const id of have) {
        const g = GOODS[id], p = sellPrice(id, c), d = demandOf(c, id), li = el("li"), txt = el("span"), b = el("button", T_("Sell · {0}", p));
        const why = g[2] === c ? tr("A local good: it sells for half here. Take it to another city.") : T_("Prized here: it comes from {0}.", tr(CITY_NAMES[g[2]]));
        txt.append(el("strong", `${tr(g[0])} × ${owns(id)}${d > 1 ? " ▲" : d < 1 ? " ▼" : ""}`), el("small", why + (d > 1 ? " " + tr("In demand today.") : d < 1 ? " " + tr("Plenty of it today.") : "")));
        b.type = "button"; b.addEventListener("click", () => sell(id)); li.append(txt, b); ul.append(li);
      }
      rows.push(ul, back());
    } else if (view === "board") {
      rows.push(el("h3", tr("Price board")), el("p", tr("What the cities want today (the board changes every day). In demand: +35%. Plenty: 25% less."), "dnote"));
      for (const [cc, name] of Object.entries(CITY_NAMES)) {
        const want = IDS.filter((id) => demandOf(cc, id) > 1), plenty = IDS.filter((id) => demandOf(cc, id) < 1);
        rows.push(el("h3", `${tr(name)}${cc === c ? " ⌂" : ""}`));
        const list = (ids) => ids.slice().sort((x, y) => GOODS[y][1] - GOODS[x][1]).slice(0, 6).map((id) => `${owns(id) ? "★ " : ""}${tr(GOODS[id][0])}`).join(", ") + (ids.length > 6 ? "…" : "");
        rows.push(el("p", `▲ ${list(want) || "-"}`, "sk-line"), el("p", `▼ ${list(plenty) || "-"}`, "dnote"));
      }
      rows.push(el("p", tr("★ = you have it."), "dnote"), back());
    } else if (view === "gossip") {
      rows.push(el("h3", tr("The news")));
      for (const l of gossip()) rows.push(el("p", l, "sk-line"));
      rows.push(back());
    } else if (view === "errand") {
      rows.push(el("h3", tr("Errands")));
      const e = st.errand, mineE = e && e.shop === shop.id;
      if (mineE) {
        const g = GOODS[e.good], have = owns(e.good);
        rows.push(el("p", T_("Bring me {0} × {1} from the {2}. I will pay {3} denarii.", e.n, tr(g[0]), tr(g[5]), e.reward), "sk-line"), el("p", T_("You have {0}.", have), "dnote"));
        rows.push(btn(tr("📦 Hand them over"), () => handOver(), have < e.n), btn(tr("✖ Give up the errand"), () => { st.errand = null; save(); say(tr("Never mind. Maybe another time.")); }));
      } else if (e) {
        const g = GOODS[e.good];
        rows.push(el("p", T_("You are already running an errand for the {0}: {1} × {2}.", tr(e.name), e.n, tr(g[0])), "sk-line"));
      } else if (st.given[shop.id] === st.day) rows.push(el("p", tr("Nothing more today, friend. Come back tomorrow."), "sk-line"));
      else {
        const offer = makeOffer();
        if (!offer) rows.push(el("p", tr("Nothing for you right now."), "sk-line"));
        else {
          const g = GOODS[offer.good];
          rows.push(el("p", T_("Bring me {0} × {1} from the {2}. I will pay {3} denarii.", offer.n, tr(g[0]), tr(g[5]), offer.reward), "sk-line"));
          rows.push(btn(tr("✅ I will do it"), () => { st.errand = offer; st.given[shop.id] = st.day; save(); say(tr("Good. Be quick about it.")); }));
        }
      }
      rows.push(back());
    } else if (view === "craft") {
      rows.push(el("h3", tr("Workbench")), el("p", tr("Combine goods into something better. The new good sells for more than the ones you put in."), "dnote"));
      for (const [id, r] of recipesOf(shop.kindName)) {
        const g = GOODS[id], needs = r.slice(1), ok = needs.every((n) => owns(n) >= needs.filter((x) => x === n).length), box = el("div", undefined, "sk-recipe");
        box.append(el("strong", `${tr(g[0])} (${T_("worth {0}", g[1])})`), el("small", needs.map((n) => `${tr(GOODS[n][0])} (${owns(n)})`).join(" + ")));
        const b = btn(tr("Make it"), () => craft(id), !ok); box.append(b); rows.push(box);
      }
      rows.push(back());
    } else if (view === "own") {
      if (!mine) {
        rows.push(el("h3", tr("Buy this shop")), el("p", T_("The keeper will stay on and run it for you. It earns every day, and more when you stock the shelves with your goods. You can own up to {0} shops.", OWN_MAX), "dnote"), purse());
        const cost = shopCost();
        rows.push(btn(T_("Buy · {0}", cost), () => buyShop(cost), Vitals.coins < cost || Object.keys(st.shops).length >= OWN_MAX));
      } else {
        rows.push(el("h3", tr("Your shop")), el("p", T_("It earns {0} denarii a day.", rateOf(mine)), "sk-line"), el("p", T_("Waiting for you: {0} denarii.", pendingOf(mine)), "dnote"));
        rows.push(btn(tr("💰 Collect"), collect, pendingOf(mine) < 1));
        rows.push(el("h3", T_("Stock the shelves ({0}/{1})", stocked(mine), STOCK_MAX)));
        const ul = el("ul", undefined, "mk-items");
        for (const id of IDS.filter((x) => owns(x) > 0)) {
          const g = GOODS[id], li = el("li"), txt = el("span"), b = el("button", T_("Stock 1 · +{0} a day", Math.max(1, Math.round(g[1] * 0.08))));
          txt.append(el("strong", `${tr(g[0])} × ${owns(id)}`), el("small", mine.stock[id] ? T_("On the shelves: {0}", mine.stock[id]) : ""));
          b.type = "button"; b.disabled = stocked(mine) >= STOCK_MAX; b.addEventListener("click", () => stock(id)); li.append(txt, b); ul.append(li);
        }
        rows.push(ul);
        const back60 = Math.round(mine.price * 0.6);
        rows.push(btn(sure.key === "sellshop" ? T_("Sure? Sell for {0}", back60) : T_("Sell the shop · {0}", back60), () => { if (armed("sellshop")) sellShop(); else render(); }));
      }
      rows.push(back());
    } else if (view === "table") {
      rows.push(el("h3", tr("At the table")), purse());
      if (!classroom) rows.push(el("p", T_("Dice against {0}: the higher total wins (the keeper wins ties; doubles pay double).", tr(shop.keeper).toLowerCase()), "dnote"));
      const bets = el("div", undefined, "sk-menu");
      if (!classroom) for (const bet of [5, 10, 25, 50]) bets.append(btn(T_("🎲 Bet {0}", bet), () => dice(bet), Vitals.coins < bet));
      bets.append(btn(tr("♟️ A game of xiangqi (practice)"), () => { closePanels(); if (typeof Online !== "undefined") Online.playXiangqi(); }), btn(tr("👋 Goodbye"), closePanels));
      rows.push(bets);
    }
    body.replaceChildren(...rows);
  }
  const back = () => { const b = el("button", tr("← Back")); b.type = "button"; b.addEventListener("click", () => { note = ""; view = "main"; render(); }); return b; };

  function buy(id) {
    const g = GOODS[id], price = buyPrice(id);
    if (Vitals.coins < price) { say(T_("The {0} costs {1} denarii (you have {2}).", tr(g[0]).toLowerCase(), price, Vitals.coins)); return; }
    const before = repOf(shop.id);
    Vitals.coins -= price; st.inv[id] = Math.min(99, owns(id) + 1); st.rep[shop.id] = (st.rep[shop.id] || 0) + price; Sfx.play("coin"); save();
    say(T_("Bought: {0} for {1} denarii.", tr(g[0]), price) + (repOf(shop.id) > before ? " " + T_("★ You are a regular customer now: {0}% off.", Math.round(DISCOUNT[repOf(shop.id)] * 100)) : ""));
  }
  function sell(id) {
    const p = sellPrice(id, shop.city), g = GOODS[id];
    if (owns(id) < 1) return;
    st.inv[id] = owns(id) - 1; if (!st.inv[id]) delete st.inv[id];
    st.sold[`${shop.city}:${id}`] = (st.sold[`${shop.city}:${id}`] || 0) + 1;
    if (g[2] !== shop.city) st.profit += Math.max(0, p - g[1]);
    st.rep[shop.id] = (st.rep[shop.id] || 0) + Math.round(p / 2);
    Vitals.coins += p; Sfx.play("coin"); save();
    say(T_("Sold: {0} for {1} denarii.", tr(g[0]), p));
  }

  // an errand: a good from another goods shop in this city that exists in this era
  function makeOffer() {
    const here = new Set(Interiors.kindsHere(shop.city)), ids = IDS.filter((id) => GOODS[id][5] && GOODS[id][2] === shop.city && GOODS[id][5] !== shop.kindName && here.has(GOODS[id][5]));
    if (!ids.length) return null;
    const rnd = hashStr(shop.id + ":" + epoch()), id = ids[Math.floor(rnd() * ids.length)], g = GOODS[id], n = g[1] <= 15 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
    return { shop: shop.id, name: shop.name, good: id, n, reward: Math.round(g[1] * n * 1.6 + 15), city: shop.city };
  }
  function handOver() {
    const e = st.errand; if (!e || e.shop !== shop.id || owns(e.good) < e.n) return;
    const pay = Math.round(e.reward * (1 + 0.05 * repOf(shop.id)));
    st.inv[e.good] = owns(e.good) - e.n; if (!st.inv[e.good]) delete st.inv[e.good];
    if (typeof ClassReport !== "undefined") ClassReport.note(`did an errand for a ${shop.kindName.toLowerCase()}`);
    Vitals.coins += pay; st.errand = null; st.done++; st.rep[shop.id] = (st.rep[shop.id] || 0) + Math.round(pay / 2); Sfx.play("coin"); save();
    if (typeof Online !== "undefined" && Online.connected) Online.navalSend({ t: "errand" });
    say(T_("Thank you! Here are {0} denarii. Errands done: {1}", pay, st.done));
  }

  // the workbench: the goods go in, a better one comes out
  function craft(id) {
    const r = CRAFTS[id]; if (!r || r[0] !== shop.kindName) return;
    const needs = r.slice(1);
    if (!needs.every((n) => owns(n) >= needs.filter((x) => x === n).length)) return;
    for (const n of needs) { st.inv[n] = owns(n) - 1; if (!st.inv[n]) delete st.inv[n]; }
    st.inv[id] = Math.min(99, owns(id) + 1); st.crafted++; Sfx.play("clink"); save();
    say(T_("Made: {0}.", tr(GOODS[id][0])));
  }

  // shops of your own
  function buyShop(cost) {
    if (st.shops[shop.id] || Object.keys(st.shops).length >= OWN_MAX || Vitals.coins < cost) return;
    Vitals.coins -= cost; st.shops[shop.id] = { at: Date.now(), name: shop.kindName, city: shop.city, price: cost, stock: {} }; Sfx.play("discover"); save();
    view = "own"; say(T_("Bought! You own the {0} now.", tr(shop.kindName).toLowerCase()));
  }
  function collect() {
    const o = st.shops[shop.id]; if (!o) return;
    const n = pendingOf(o); if (n < 1) { say(tr("Nothing to collect yet.")); return; }
    Vitals.coins += n; o.at = Date.now(); Sfx.play("coin"); save(); say(T_("Collected {0} denarii.", n));
  }
  function stock(id) {
    const o = st.shops[shop.id]; if (!o || owns(id) < 1 || stocked(o) >= STOCK_MAX) return;
    o.at = Date.now() - Math.round(pendingOf(o) / Math.max(1, rateOf(o)) * (typeof Payroll !== "undefined" ? Payroll.DAY_MS : 1));    // (what it has earned so far stays: only the rate changes from now)
    st.inv[id] = owns(id) - 1; if (!st.inv[id]) delete st.inv[id];
    o.stock[id] = (o.stock[id] || 0) + 1; save(); render();
  }
  function sellShop() {
    const o = st.shops[shop.id]; if (!o) return;
    const n = pendingOf(o) + Math.round(o.price * 0.6);
    for (const [id, c] of Object.entries(o.stock)) st.inv[id] = Math.min(99, owns(id) + c);
    delete st.shops[shop.id]; Vitals.coins += n; Sfx.play("coin"); save(); view = "main"; say(T_("You sold the shop and the goods came back to you. Paid: {0} denarii.", n));
  }

  // an inn: a room for the night (a tavern or a hotel)
  const innPrice = () => mark(shop.kindName === "Hotel lobby" ? 60 : 30);
  function rentRoom() {
    const price = innPrice();
    if (!Time.bedtime) { say(tr("The rooms are for the night. Come back after dark.")); return; }
    if (Vitals.coins < price) { say(T_("A room costs {0} denarii (you have {1}).", price, Vitals.coins)); return; }
    Vitals.coins -= price; st.inn++; save(); closePanels(); startSleep(false, true);
  }

  // dice at the table: two dice each, the higher total wins your bet back; the keeper wins ties; doubles pay double
  const classroom = typeof CLASSMODE !== "undefined" && CLASSMODE.on;                  // (no betting in a class)
  function dice(bet) {
    if (classroom || Vitals.coins < bet) return;
    const d = () => 1 + Math.floor(Math.random() * 6), me = [d(), d()], ke = [d(), d()], ms = me[0] + me[1], ks = ke[0] + ke[1], face = (a) => a.map((v) => FACES[v - 1]).join(" ");
    Sfx.play("rattle");
    let result;
    if (ms > ks) { const gain = bet * (me[0] === me[1] ? 2 : 1); Vitals.coins += gain; st.dice.w++; result = T_("You win {0} denarii!", gain); }
    else { Vitals.coins -= bet; st.dice.l++; result = T_(ms === ks ? "A tie: the keeper wins. You lose {0} denarii." : "You lose {0} denarii.", bet); }
    save(); say(`${T_("You rolled {0} ({1}); the keeper rolled {2} ({3}).", face(me), ms, face(ke), ks)} ${result}`);
  }

  // what the keeper tells you: two lines of local news, a tip, and the nearest sight you have not seen
  function gossip() {
    const c = cityNow(), e = typeof era !== "undefined" ? era : "ancient", pool = GOSSIP[`${c}-${e}`] || [], out = [];
    out.push(pool[Math.floor(Math.random() * pool.length)] || GOSSIP.common[0]);
    out.push(GOSSIP.common[Math.floor(Math.random() * GOSSIP.common.length)]);
    const list = (typeof DISCOVERABLE !== "undefined" ? DISCOVERABLE : []).filter((l) => !discovered.has(l.id) && (!l.only || l.only === e) && Math.hypot(l.x - player.x, l.z - player.z) < 1600);
    if (list.length) {
      const l = list.reduce((a, b) => (Math.hypot(b.x - player.x, b.z - player.z) < Math.hypot(a.x - player.x, a.z - player.z) ? b : a)), dx = l.x - player.x, dz = l.z - player.z, d = Math.round(Math.hypot(dx, dz) / 10) * 10;
      const dir = DIRS[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
      out.push(T_("Have you seen the {0}? It is about {1} {2} to the {3}.", l.name, d, tr(e === "modern" ? "metres" : "paces"), tr(dir)));
    }
    return out.map((l) => tr(l));
  }

  function open(k, v) {
    if (mode !== "walk" || panelOpen) return;
    shop = { id: k.id, name: k.name, keeper: k.keeper, line: k.line, trade: k.trade, city: k.city, kindName: k.name };
    view = v || "main"; note = "";
    if (typeof Journal !== "undefined") Journal.menu();
    openPanel("#shopkeep"); render();
  }

  // ---------------------------------------------------------------- F: talk, or sit (and at the table, F opens the dice and the games)
  let seated = null, seenSit = new Set(), inT = 0, thiefCd = 60;
  function act() {
    if (mode !== "walk" || panelOpen) return false;
    if (seated) { open(Interiors.infoOf(seated.p), "table"); return true; }
    const k = Interiors.keeperNear(player.x, player.z, player.feet);
    if (k) { open(k); return true; }
    const s = Interiors.seatNear(player.x, player.z, player.feet);
    if (s) { sit(s); return true; }
    return false;
  }
  function prompt() {
    if (mode !== "walk" || panelOpen) return "";
    if (seated) return tr("F: dice and games at the table · move to stand up");
    const k = Interiors.keeperNear(player.x, player.z, player.feet);
    if (k) return T_("F: talk to {0}", tr(k.keeper).toLowerCase());
    const s = Interiors.seatNear(player.x, player.z, player.feet);
    return s && !s.seat.by ? tr("F: sit down") : s ? tr("This seat is taken") : "";
  }
  function sit(s) {
    if (s.seat.by) { toast(tr("This seat is taken")); return; }
    s.seat.by = "player"; seated = s; seenSit = new Set();
    player.x = s.seat.x; player.z = s.seat.z; player.vx = player.vz = 0; player.yaw = s.seat.yaw;
    Vitals.startRest();
    toast(tr("You sit down. Press F for dice and games, or move to stand up."));
  }
  function update(dt) {
    if (seated && !Vitals.resting) { if (seated.seat.by === "player") seated.seat.by = null; seated = null; }
    if (seated && typeof Online !== "undefined" && Online.peerList) {                                         // a friend sits down near you
      for (const p of Online.peerList()) if (p.sit && p.x !== null && !seenSit.has(p.id) && Math.hypot(p.x - player.x, p.z - player.z) < 3.6) { seenSit.add(p.id); toast(T_("{0} sits at your table.", p.name || "Someone")); }
    }
    // a pickpocket slips in at the door now and then while you are in a shop with some money on you
    const here = mode === "walk" && !panelOpen ? Interiors.inside() : null;
    thiefCd -= dt;
    if (!here) { inT = 0; return; }
    inT += dt;
    if (inT > 15 && thiefCd <= 0 && Vitals.coins >= 100 && typeof Thieves !== "undefined" && !Thieves.active && Math.random() < dt / 80) {
      const w = Interiors.doorOf(here.p);
      if (w && Thieves.spawnAt(w[0], w[1])) {
        thiefCd = 150;
        toast(tr("🥷 A pickpocket slips in at the door! Catch him before he gets away."));
        if (typeof Speech !== "undefined" && here.p.keeperW) Speech.say({ x: here.p.keeperW[0], z: here.p.keeperW[1] }, tr("Stop that thief!"), 3);
      }
    }
  }
  const visit = (id) => { if (!st.visited.includes(id) && st.visited.length < 400) { st.visited.push(id); save(); } };
  function greet(id, kind) {
    if (st.shops[id]) return T_("🏪 Your {0}: welcome, boss!", tr(kind.name).toLowerCase());
    if (repOf(id) >= 1) return T_("Welcome back, {0}! \"{1}\"", (typeof Character !== "undefined" && Character.name) || tr("friend"), tr(kind.line));
    return null;
  }

  // ---------------------------------------------------------------- the goods shelf in your house (beside the souvenir shelf)
  const ROWS = [0.85, 1.4, 1.95], LEN = 3.0, SLOTS = 9, shelves = [];
  function prop(id) {
    const g = GOODS[id], mat = new T.MeshLambertMaterial({ color: g[4], emissive: 0x151008 }), grp = new T.Group();
    const add = (geo, x = 0, y = 0, z = 0, rx = 0, rz = 0, m = mat) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; grp.add(o); return o; };
    const dark = new T.MeshLambertMaterial({ color: 0x3a2a1a });
    switch (g[3]) {
      case "jar": add(new T.CylinderGeometry(0.1, 0.12, 0.24, 12), 0, 0.12); add(new T.CylinderGeometry(0.05, 0.07, 0.07, 10), 0, 0.27, 0, 0, 0, dark); break;
      case "bottle": add(new T.CylinderGeometry(0.07, 0.08, 0.2, 10), 0, 0.1); add(new T.CylinderGeometry(0.03, 0.04, 0.1, 8), 0, 0.25); break;
      case "disc": add(new T.CylinderGeometry(0.17, 0.17, 0.03, 18), 0, 0.2, 0, Math.PI / 2.4); break;
      case "ring": add(new T.TorusGeometry(0.1, 0.025, 6, 16), 0, 0.12, 0, Math.PI / 2.6); break;
      case "tool": add(new T.BoxGeometry(0.34, 0.04, 0.05), 0, 0.03); add(new T.BoxGeometry(0.09, 0.09, 0.07), -0.16, 0.06, 0, 0, 0, dark); break;
      case "cup": add(new T.CylinderGeometry(0.09, 0.06, 0.12, 12), 0, 0.06); break;
      case "sack": add(new T.SphereGeometry(0.13, 10, 8), 0, 0.1).scale.y = 0.85; break;
      case "scroll": add(new T.CylinderGeometry(0.04, 0.04, 0.3, 8), 0, 0.05, 0, 0, Math.PI / 2); break;
      default: add(new T.BoxGeometry(0.22, 0.12, 0.16), 0, 0.06);
    }
    return grp;
  }
  // addShelf(parent, { x, z, face, floor }): like Souvenirs.addShelf: three boards against a wall, centred on x, z, its front facing "e" (+x), "w" (-x), "n" (-z) or "s" (+z)
  function addShelf(parent, cfg) {
    if (!parent) return;
    const wood = new T.MeshLambertMaterial({ color: 0x6b4a2b }), face = cfg.face || "e", alongX = face === "n" || face === "s", fl = cfg.floor == null ? 0.15 : cfg.floor;
    const box = (along, h, y, a, n) => { const m = new T.Mesh(BOX, wood); m.scale.set(alongX ? along : n, h, alongX ? n : along); m.position.set(cfg.x + (alongX ? a : 0), fl + y, cfg.z + (alongX ? 0 : a)); m.castShadow = true; parent.add(m); };
    for (const y of ROWS) box(LEN, 0.05, y - 0.025, 0, 0.36);
    for (const d of [-1, 1]) box(0.06, ROWS[2] + 0.1, (ROWS[2] + 0.1) / 2, d * (LEN / 2 - 0.03), 0.34);
    const turn = { e: Math.PI / 2, w: -Math.PI / 2, n: Math.PI, s: 0 }[face], shelf = { slots: [] };
    for (let i = 0; i < SLOTS; i++) {
      const row = Math.floor(i / 3), col = i % 3, a = -LEN / 2 + 0.45 + col * ((LEN - 0.9) / 2), holder = new T.Group();
      holder.position.set(cfg.x + (alongX ? a : 0.02 * (face === "e" ? 1 : -1)), fl + ROWS[row], cfg.z + (alongX ? 0.02 * (face === "s" ? 1 : -1) : a));
      holder.rotation.y = turn; parent.add(holder); shelf.slots.push({ holder, id: "" });
    }
    shelves.push(shelf); refresh();
  }
  function refresh() {
    const have = IDS.filter((id) => owns(id) > 0).sort((x, y) => GOODS[y][1] - GOODS[x][1]).slice(0, SLOTS);          // (the dearest nine)
    for (const sh of shelves) sh.slots.forEach((s, i) => {
      const id = have[i] || "";
      if (s.id === id) return;
      s.holder.clear(); s.id = id;
      if (id) s.holder.add(prop(id));
    });
  }

  load();
  function bind() {
    setInterval(refresh, 4000);
    document.getElementById("shopkeep").addEventListener("click", (e) => { if (e.target.id === "shopkeep") closePanels(); });
  }

  return {
    bind, act, prompt, update, addShelf, visit, greet, GOODS, IDS, owns, total,
    get seated() { return !!seated; },
    get stats() { return { visited: st.visited.length, done: st.done, profit: st.profit, owned: Object.keys(st.shops).length, crafted: st.crafted, diceWins: st.dice.w, inn: st.inn, regulars: Object.values(st.rep).filter((v) => level(v) >= 3).length }; },
    ownsShop: (id) => !!st.shops[id],
    // the player market (playermarket.js): goods put up for sale leave your pack, and come back (or arrive) by mail
    give(id, n = 1) { if (GOODS[id] && n > 0) { st.inv[id] = Math.min(99, owns(id) + Math.floor(n)); save(); } },
    take(id, n = 1) { if (!GOODS[id] || owns(id) < n) return false; st.inv[id] = owns(id) - n; if (!st.inv[id]) delete st.inv[id]; save(); return true; },
    get errand() { return st.errand; },
    snapshot: () => JSON.parse(JSON.stringify(st)),
    restore: (r) => restore(r),
    merge(r) { if (!r || typeof r !== "object") return; const o = clean(r); for (const id of IDS) if ((o.inv[id] || 0) > owns(id)) st.inv[id] = o.inv[id]; if (!st.errand && o.errand) st.errand = o.errand; st.done = Math.max(st.done, o.done); save(); },
  };
})();
