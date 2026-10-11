"use strict";
// The Market: spend your denarii on a better house, things to wear, a companion, decorations, supplies and training.
// What you own is saved in the browser (and with your account's cloud save). Denarii are a game currency earned in
// fights and races, not real money. Depends on game.js, home.js, pets.js and vitals.js at run time.

const Market = (() => {
  const KEY = "rome-owned";

  // Your home, from the small house you start with. `rest` is how much faster you heal when resting at home.
  const HOUSES = [
    { name: "Small house", price: 0, rest: 1, rent: 0, perk: "Where you start. Sleep here after dark." },
    { name: "House with a garden", price: 150, rest: 1.5, rent: 0, perk: "A walled garden with a fountain, hedges and cypress trees. Resting at home heals 1.5 times faster." },
    { name: "Grand domus", price: 400, rest: 2, rent: 15, perk: "Two wings, a colonnade and a statue. Resting heals twice as fast, and your tenants pay you 15 denarii each morning." },
    { name: "Villa with a tower", price: 1000, rest: 3, rent: 40, perk: "A tower, a pool behind the house and a gilded pavilion. Resting heals 3 times faster, and rent is 40 denarii each morning." },
  ];

  // type: wear (worn on your character, one per slot), pet (a companion, one at a time), decor (decorates your house),
  // supply (used up at once) or perk (a permanent bonus in single-player games).
  const ITEMS = {
    wreath: { type: "wear", slot: "head", name: "Laurel wreath", price: 60, note: "The crown of a victor." },
    helmet: { type: "wear", slot: "head", name: "Crested helmet", price: 120, note: "Bronze, with a crimson crest." },
    crown: { type: "wear", slot: "head", name: "Golden crown", price: 250, note: "Fit for an emperor." },
    cloak: { type: "wear", slot: "back", name: "Crimson cloak", price: 90, note: "Fastened with a gold clasp." },
    royalcloak: { type: "wear", slot: "back", name: "Royal purple cloak", price: 140, note: "Tyrian purple: once only emperors could wear it." },
    cuirass: { type: "wear", slot: "body", name: "Gilded breastplate", price: 180, note: "Armour fit for a champion." },
    armbands: { type: "wear", slot: "arms", name: "Gold armbands", price: 70, note: "Worn by gladiators who have won their freedom." },
    boots: { type: "wear", slot: "feet", name: "Hobnailed boots", price: 50, note: "Legionary boots, built for long marches." },
    shield: { type: "wear", slot: "hand", name: "Round shield", price: 110, note: "Painted red, with a bronze boss." },
    hound: { type: "pet", slot: "pet", name: "Hound", price: 150, note: "A loyal dog that trots along behind you." },
    eagle: { type: "pet", slot: "pet", name: "Eagle", price: 220, note: "The eagle of Rome, circling above you." },
    scooter: { type: "car", name: "Vespa scooter", price: 250, note: "Quick and nimble. Top speed 54 km/h." },
    citycar: { type: "car", name: "City car", price: 500, note: "A blue runabout. Top speed 86 km/h." },
    sportscar: { type: "car", name: "Sports car", price: 1200, note: "Low, red and fast. Top speed 130 km/h." },
    rickshaw: { type: "car", name: "Cycle rickshaw", price: 200, note: "Pedal-powered, in bright colours. Top speed 25 km/h." },
    oxcart: { type: "mount", name: "Bullock cart", price: 150, note: "A wooden cart pulled by an ox. Top speed 18 km/h." },
    elephant: { type: "mount", name: "Elephant", price: 800, note: "A tall elephant with a red and gold howdah. Top speed 32 km/h, and you can see over the crowd." },
    banners: { type: "decor", name: "Door banners", price: 60, note: "Two crimson banners either side of your front door." },
    mosaic: { type: "decor", name: "Mosaic floor", price: 90, note: "A patterned floor of coloured tiles inside your house." },
    salve: { type: "supply", name: "Healing salve", price: 40, note: "Heals 40 health at once." },
    fodder: { type: "supply", name: "Fodder for the horses", price: 40, note: "Restores 40 points of your horses' fitness at once." },
    horses: { type: "perk", name: "Well-bred horses", price: 350, note: "Your racing horses tire 15% more slowly." },
    training: { type: "perk", name: "Gladiator training", price: 400, note: "Your sword hits 10% harder against the arena's gladiators (not in duels against real people)." },
  };
  const SECTIONS = [
    ["Things to wear", "wear"], ["Companions", "pet"], ["Cars and rickshaws (modern cities only)", "car"], ["Carts and elephants (ancient cities only)", "mount"], ["Decorate your house", "decor"], ["Supplies", "supply"], ["Training and horses", "perk"],
  ];
  const PERKS = { horses: { tire: 0.85 }, training: { melee: 1.1 } };

  let s = { house: 0, items: [], worn: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) s = sanitize(raw);
  } catch (e) { /* storage unavailable */ }

  // Anything odd in saved data (edited, or from an older version) is dropped.
  function sanitize(raw) {
    const out = { house: 0, items: [], worn: [] };
    if (raw && Number.isInteger(raw.house) && raw.house >= 0 && raw.house < HOUSES.length) out.house = raw.house;
    const items = Array.isArray(raw && raw.items) ? raw.items : [], worn = Array.isArray(raw && raw.worn) ? raw.worn : [];
    out.items = [...new Set(items.filter((id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(ITEMS, id) && ITEMS[id].type !== "supply"))];
    const slots = new Set();
    for (const id of worn) {
      if (typeof id !== "string" || !out.items.includes(id) || !ITEMS[id].slot || slots.has(ITEMS[id].slot)) continue;
      slots.add(ITEMS[id].slot); out.worn.push(id);
    }
    return out;
  }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const $m = (id) => document.getElementById(id);

  // Put what you own on show: the house, what is in it, what you wear and who follows you.
  function applyAll() {
    Home.setTier(s.house);
    Home.setDecor({ banners: s.items.includes("banners"), mosaic: s.items.includes("mosaic") });
    if (avFig) applyAccessories(avFig, s.worn.filter((id) => ITEMS[id].type === "wear"));
    Pets.set(s.worn.find((id) => ITEMS[id].type === "pet"));
    render();
  }

  function buyHouse() {
    const next = HOUSES[s.house + 1];
    if (!next) return;
    if (Vitals.coins < next.price) { toast(`You need ${next.price} denarii for the ${next.name.toLowerCase()} (you have ${Vitals.coins}).`); return; }
    Vitals.coins -= next.price;
    s.house += 1; save(); applyAll(); Sfx.play("coin");
    toast(`You bought the ${next.name.toLowerCase()}! Go and see it near the Colosseum road.`);
    Narrator.say(`You bought the ${next.name}.`, { interrupt: true });
  }

  function buyItem(id) {
    const it = ITEMS[id];
    if (!it || (it.type !== "supply" && s.items.includes(id))) return;
    if (Vitals.coins < it.price) { toast(`The ${it.name.toLowerCase()} costs ${it.price} denarii (you have ${Vitals.coins}).`); return; }
    if (it.type === "supply") {
      if (id === "salve" ? Vitals.hp >= 99 : Vitals.horses >= 99) { toast(id === "salve" ? "You are already in good health." : "Your horses are already fit."); return; }
      Vitals.coins -= it.price;
      if (id === "salve") Vitals.hp = Vitals.hp + 40; else Vitals.horses = Vitals.horses + 40;
      Sfx.play("coin"); render();
      toast(id === "salve" ? `The salve heals you. Health ${Math.round(Vitals.hp)}/100.` : `Your horses feel stronger. Fitness ${Math.round(Vitals.horses)}/100.`);
      return;
    }
    Vitals.coins -= it.price;
    s.items.push(id); save(); Sfx.play("coin");
    if (it.type === "car" || it.type === "mount") { applyAll(); closePanels(); Car.deploy(id); return; } // it appears next to you
    if (it.slot) wear(id); else applyAll();
    toast(it.type === "perk" ? `${it.name}: yours for good.` : it.type === "decor" ? `You decorated your house with the ${it.name.toLowerCase()}.` : `You bought the ${it.name.toLowerCase()} and took it with you.`);
  }

  // Wear (or take off) something, or bring a companion along (or send it home)
  function wear(id) {
    const it = ITEMS[id];
    if (!it || !it.slot || !s.items.includes(id)) return;
    if (s.worn.includes(id)) s.worn = s.worn.filter((w) => w !== id);
    else s.worn = [...s.worn.filter((w) => ITEMS[w].slot !== it.slot), id]; // replaces what you had in that slot
    save(); applyAll();
  }

  function render() {
    const box = $m("market");
    if (!box) return;
    $m("mk-coins").textContent = Vitals.coins;
    const cur = HOUSES[s.house], next = HOUSES[s.house + 1];
    $m("mk-house-name").textContent = cur.name;
    $m("mk-house-perk").textContent = cur.perk;
    $m("mk-house-buy").hidden = !next;
    $m("mk-house-next").hidden = !next;
    if (next) {
      $m("mk-house-next").textContent = `Next: ${next.name}. ${next.perk}`;
      $m("mk-house-buy").textContent = `Buy for ${next.price} denarii`;
      $m("mk-house-buy").disabled = Vitals.coins < next.price;
    } else $m("mk-house-perk").textContent += " It is the finest house in Rome.";

    $m("mk-sections").replaceChildren(...SECTIONS.flatMap(([title, type]) => {
      const h = document.createElement("h3"), ul = document.createElement("ul");
      h.textContent = title; ul.className = "mk-items";
      const need = type === "car" ? "modern" : type === "mount" ? "ancient" : null;
      if (need && era !== need) { // these only exist in one era
        const li = document.createElement("li"), note = document.createElement("small");
        note.textContent = need === "modern" ? "Cars and rickshaws only exist in the modern cities. Press K to go there, then come back to buy one." : "Carts and elephants only live in the ancient cities (Ancient Rome and Mughal Delhi). Press K to go there, then come back to buy one.";
        li.append(note); ul.append(li);
        return [h, ul];
      }
      for (const [id, it] of Object.entries(ITEMS).filter(([, x]) => x.type === type)) {
        const li = document.createElement("li"), txt = document.createElement("span"), b = document.createElement("button");
        const name = document.createElement("strong"), note = document.createElement("small");
        name.textContent = it.name; note.textContent = it.note;
        txt.append(name, note);
        b.type = "button";
        const owned = s.items.includes(id);
        if (it.type === "supply" || !owned) { b.textContent = `Buy · ${it.price}`; b.disabled = Vitals.coins < it.price; b.addEventListener("click", () => buyItem(id)); }
        else if (it.type === "car" || it.type === "mount") { const out = Car.current === id; b.textContent = out ? "Park it away" : "Take it out"; b.classList.toggle("on", out); b.addEventListener("click", () => { if (out) { Car.stow(); render(); } else { closePanels(); Car.deploy(id); } }); }
        else if (it.slot) { b.textContent = s.worn.includes(id) ? (it.type === "pet" ? "Send home" : "Take off") : (it.type === "pet" ? "Bring along" : "Wear"); b.classList.toggle("on", s.worn.includes(id)); b.addEventListener("click", () => wear(id)); }
        else { b.textContent = "Owned"; b.disabled = true; b.classList.add("on"); }
        li.append(txt, b);
        ul.append(li);
      }
      return [h, ul];
    }));
  }

  function open() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#market");
    render();
  }

  function bind() {
    $m("btn-market").addEventListener("click", open);
    $m("market-close").addEventListener("click", closePanels);
    $m("market").addEventListener("click", (e) => { if (e.target.id === "market") closePanels(); });
    $m("mk-house-buy").addEventListener("click", buyHouse);
    applyAll();
  }

  return {
    bind, open, render, ITEMS,
    get house() { return s.house; },
    get worn() { return s.worn.filter((id) => ITEMS[id].type === "wear"); }, // what other players can see
    get pet() { return s.worn.find((id) => ITEMS[id].type === "pet") || null; },
    owns: (id) => s.items.includes(id),
    perk: (key) => s.items.reduce((m, id) => m * ((PERKS[id] && PERKS[id][key]) || 1), 1),
    rent: () => HOUSES[s.house].rent,
    houseName: () => HOUSES[s.house].name,
    snapshot: () => ({ house: s.house, items: s.items.slice(), worn: s.worn.slice() }),
    restore(raw) { s = sanitize(raw); save(); applyAll(); },
  };
})();
