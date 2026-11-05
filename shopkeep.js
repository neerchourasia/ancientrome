"use strict";
// Shopkeepers: walk up to the keeper of a shop you can walk into (interiors.js) and press F. The keeper
//   - sells to you: the bakery, taverns and food stalls open the market's food menu, the cloth shops its clothes, and every other shop sells three goods of its own (oil, spices, ink, snorkels...),
//   - buys your goods: a good sold in another city pays 40% more than you paid (the price drops 10% for every one you sold today), one from the same city pays half,
//   - tells you the news of the neighbourhood and where the nearest sight you have not seen is,
//   - has an errand for you now and then: bring a good from another shop in the city, and be paid more than it cost (the daily quest can ask for two of them).
// Press F next to a stool to sit down (press F again to play xiangqi at the table; moving stands you up). The goods you buy stand on a shelf in your house (the same walls as the souvenir shelf).
// Goods, the errand and what you sold today are saved in the browser and with your account's cloud save. Depends on interiors.js, market.js, vitals.js, i18n.js and the globals of game.js.

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
  const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

  let st = { inv: {}, sold: {}, day: 0, errand: null, given: {}, done: 0 };
  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || "null");
      if (r && typeof r === "object") restore(r, true);
    } catch (e) { /* storage unavailable */ }
  }
  function clean(r) {
    const o = { inv: {}, sold: {}, day: Math.max(0, Math.floor(Number(r.day)) || 0), errand: null, given: {}, done: Math.max(0, Math.floor(Number(r.done)) || 0) };
    if (r.inv && typeof r.inv === "object") for (const id of IDS) { const n = Math.floor(Number(r.inv[id])); if (n > 0) o.inv[id] = Math.min(99, n); }
    if (r.sold && typeof r.sold === "object") for (const [k, v] of Object.entries(r.sold)) { const [c, id] = k.split(":"); if (CITY_NAMES[c] && GOODS[id] && Math.floor(Number(v)) > 0) o.sold[k] = Math.min(99, Math.floor(Number(v))); }
    const e = r.errand;
    if (e && typeof e === "object" && GOODS[e.good] && typeof e.shop === "string" && e.shop.length < 40 && Math.floor(e.n) >= 1 && Math.floor(e.n) <= 5) o.errand = { shop: e.shop, name: String(e.name || "").slice(0, 40), good: e.good, n: Math.floor(e.n), reward: Math.max(1, Math.min(2000, Math.floor(e.reward) || 1)), city: CITY_NAMES[e.city] ? e.city : "rome" };
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

  function sellPrice(id, c) {
    const g = GOODS[id], n = st.sold[`${c}:${id}`] || 0;
    return Math.max(1, Math.round(g[1] * (g[2] === c ? 0.5 : 1.4) * Math.pow(0.9, n)));
  }

  // ---------------------------------------------------------------- the panel
  let shop = null, view = "main", note = "";
  function say(m) { note = m; render(); }

  function render() {
    const body = document.getElementById("sk-body"); if (!body || !shop) return;
    today();
    document.getElementById("sk-title").textContent = `${tr(shop.name)} · ${tr(shop.keeper)}`;
    const rows = [], c = shop.city;
    const btn = (label, fn, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", fn); return b; };
    const purse = () => el("p", T_("You have {0} denarii.", Vitals.coins), "dnote");
    if (note) rows.push(el("p", note, "sk-note"));
    if (view === "main") {
      rows.push(el("p", `"${tr(shop.line)}"`, "sk-line"));
      const menu = el("div", undefined, "sk-menu");
      if (shop.trade === "food") menu.append(btn(tr("🍞 See what is cooking"), () => { closePanels(); setTimeout(() => Market.open("food"), 0); }));
      else if (shop.trade === "clothes") menu.append(btn(tr("👘 See the clothes"), () => { closePanels(); setTimeout(() => Market.open("clothes"), 0); }));
      else menu.append(btn(tr("🛒 Buy"), () => { note = ""; view = "buy"; render(); }));
      if (shop.trade === "goods") menu.append(btn(tr("💰 Sell your goods"), () => { note = ""; view = "sell"; render(); }));
      menu.append(btn(tr("🗣️ Ask about the neighbourhood"), () => { note = ""; view = "gossip"; render(); }));
      const e = st.errand;
      menu.append(btn(tr(e && e.shop === shop.id ? "📦 About my errand" : "📦 Any work for me?"), () => { note = ""; view = "errand"; render(); }));
      menu.append(btn(tr("👋 Goodbye"), closePanels));
      rows.push(menu);
    } else if (view === "buy") {
      rows.push(el("h3", tr("For sale")), purse());
      const ul = el("ul", undefined, "mk-items");
      for (const id of soldBy(shop.kindName)) {
        const g = GOODS[id], price = mark(g[1]), li = el("li"), txt = el("span"), b = el("button", T_("Buy · {0}", price));
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
        const g = GOODS[id], p = sellPrice(id, c), li = el("li"), txt = el("span"), b = el("button", T_("Sell · {0}", p));
        txt.append(el("strong", `${tr(g[0])} × ${owns(id)}`), el("small", g[2] === c ? tr("A local good: it sells for half here. Take it to another city.") : T_("Prized here: it comes from {0}.", tr(CITY_NAMES[g[2]]))));
        b.type = "button"; b.addEventListener("click", () => sell(id)); li.append(txt, b); ul.append(li);
      }
      rows.push(ul, back());
    } else if (view === "gossip") {
      rows.push(el("h3", tr("The news")));
      for (const l of gossip()) rows.push(el("p", l, "sk-line"));
      rows.push(back());
    } else if (view === "errand") {
      rows.push(el("h3", tr("Errands")));
      const e = st.errand, mine = e && e.shop === shop.id;
      if (mine) {
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
    }
    body.replaceChildren(...rows);
  }
  const back = () => { const b = el("button", tr("← Back")); b.type = "button"; b.addEventListener("click", () => { note = ""; view = "main"; render(); }); return b; };

  function buy(id) {
    const g = GOODS[id], price = mark(g[1]);
    if (Vitals.coins < price) { say(T_("The {0} costs {1} denarii (you have {2}).", tr(g[0]).toLowerCase(), price, Vitals.coins)); return; }
    Vitals.coins -= price; st.inv[id] = Math.min(99, owns(id) + 1); Sfx.play("coin"); save();
    say(T_("Bought: {0} for {1} denarii.", tr(g[0]), price));
  }
  function sell(id) {
    const p = sellPrice(id, shop.city), g = GOODS[id];
    if (owns(id) < 1) return;
    st.inv[id] = owns(id) - 1; if (!st.inv[id]) delete st.inv[id];
    st.sold[`${shop.city}:${id}`] = (st.sold[`${shop.city}:${id}`] || 0) + 1;
    Vitals.coins += p; Sfx.play("coin"); save();
    say(T_("Sold: {0} for {1} denarii.", tr(g[0]), p));
  }

  // an errand: a good from another goods shop in this city that exists in this era
  function makeOffer() {
    const here = new Set(Interiors.kindsHere(shop.city)), ids = IDS.filter((id) => GOODS[id][2] === shop.city && GOODS[id][5] !== shop.kindName && here.has(GOODS[id][5]));
    if (!ids.length) return null;
    const rnd = hashStr(shop.id + ":" + epoch()), id = ids[Math.floor(rnd() * ids.length)], g = GOODS[id], n = g[1] <= 15 ? 2 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * 2);
    return { shop: shop.id, name: shop.name, good: id, n, reward: Math.round(g[1] * n * 1.6 + 15), city: shop.city };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function handOver() {
    const e = st.errand; if (!e || e.shop !== shop.id || owns(e.good) < e.n) return;
    st.inv[e.good] = owns(e.good) - e.n; if (!st.inv[e.good]) delete st.inv[e.good];
    Vitals.coins += e.reward; st.errand = null; st.done++; Sfx.play("coin"); save();
    if (typeof Online !== "undefined" && Online.connected) Online.navalSend({ t: "errand" });
    say(T_("Thank you! Here are {0} denarii. Errands done: {1}", e.reward, st.done));
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

  function open(k) {
    if (mode !== "walk" || panelOpen) return;
    shop = { id: k.id, name: k.name, keeper: k.keeper, line: k.line, trade: k.trade, city: k.city, kindName: k.name };
    view = "main"; note = "";
    openPanel("#shopkeep"); render();
  }

  // ---------------------------------------------------------------- F: talk, or sit
  let seated = null;
  function act() {
    if (mode !== "walk" || panelOpen) return false;
    if (seated) { if (typeof Online !== "undefined") Online.playXiangqi(); return true; }
    const k = Interiors.keeperNear(player.x, player.z, player.feet);
    if (k) { open(k); return true; }
    const s = Interiors.seatNear(player.x, player.z, player.feet);
    if (s) { sit(s); return true; }
    return false;
  }
  function prompt() {
    if (mode !== "walk" || panelOpen) return "";
    if (seated) return tr("F: play xiangqi at the table · move to stand up");
    const k = Interiors.keeperNear(player.x, player.z, player.feet);
    if (k) return T_("F: talk to {0}", tr(k.keeper).toLowerCase());
    const s = Interiors.seatNear(player.x, player.z, player.feet);
    return s && !s.seat.by ? tr("F: sit down") : s ? tr("This seat is taken") : "";
  }
  function sit(s) {
    if (s.seat.by) { toast(tr("This seat is taken")); return; }
    s.seat.by = "player"; seated = s;
    player.x = s.seat.x; player.z = s.seat.z; player.vx = player.vz = 0; player.yaw = s.seat.yaw;
    Vitals.startRest();
    toast(tr("You sit down. Press F to play xiangqi, or move to stand up."));
  }
  function update() {
    if (seated && !Vitals.resting) { if (seated.seat.by === "player") seated.seat.by = null; seated = null; }
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
    const have = IDS.filter((id) => owns(id) > 0).slice(0, SLOTS);
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
    bind, act, prompt, update, addShelf, GOODS, IDS, owns, total,
    get seated() { return !!seated; },
    get errand() { return st.errand; },
    snapshot: () => JSON.parse(JSON.stringify(st)),
    restore: (r) => restore(r),
    merge(r) { if (!r || typeof r !== "object") return; const o = clean(r); for (const id of IDS) if ((o.inv[id] || 0) > owns(id)) st.inv[id] = o.inv[id]; if (!st.errand && o.errand) st.errand = o.errand; st.done = Math.max(st.done, o.done); save(); },
  };
})();
