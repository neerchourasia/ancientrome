"use strict";
// The Market: spend your denarii on a better house and on things to wear. What you own is saved in the browser
// (and with your account's cloud save). Denarii are a game currency earned in fights and races, not real money.
// Depends on game.js, home.js and vitals.js at run time.

const Market = (() => {
  const KEY = "rome-owned";

  // Your home, from the small house you start with. `rest` is how much faster you heal when resting at home.
  const HOUSES = [
    { name: "Small house", price: 0, rest: 1, rent: 0, perk: "Where you start. Sleep here after dark." },
    { name: "House with a garden", price: 150, rest: 1.5, rent: 0, perk: "A walled garden with a fountain, hedges and cypress trees. Resting at home heals 1.5 times faster." },
    { name: "Grand domus", price: 400, rest: 2, rent: 15, perk: "Two wings, a colonnade and a statue. Resting heals twice as fast, and your tenants pay you 15 denarii each morning." },
    { name: "Villa with a tower", price: 1000, rest: 3, rent: 40, perk: "A tower, a pool behind the house and a gilded pavilion. Resting heals 3 times faster, and rent is 40 denarii each morning." },
  ];

  // slot: only one thing per slot is worn at a time
  const ITEMS = {
    wreath: { name: "Laurel wreath", price: 60, slot: "head", note: "The crown of a victor." },
    helmet: { name: "Crested helmet", price: 120, slot: "head", note: "Bronze, with a crimson crest." },
    cloak: { name: "Crimson cloak", price: 90, slot: "back", note: "A cloak fastened with a gold clasp." },
    cuirass: { name: "Gilded breastplate", price: 180, slot: "body", note: "Armour fit for a champion." },
    armbands: { name: "Gold armbands", price: 70, slot: "arms", note: "Worn by gladiators who have won their freedom." },
  };

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
    out.items = [...new Set(items.filter((id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(ITEMS, id)))];
    const slots = new Set();
    for (const id of worn) {
      if (typeof id !== "string" || !out.items.includes(id) || slots.has(ITEMS[id].slot)) continue;
      slots.add(ITEMS[id].slot); out.worn.push(id);
    }
    return out;
  }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const $m = (id) => document.getElementById(id);

  // Put what you own on show: the house, and the accessories on your character.
  function applyAll() {
    Home.setTier(s.house);
    if (avFig) applyAccessories(avFig, s.worn);
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
    if (!it || s.items.includes(id)) return;
    if (Vitals.coins < it.price) { toast(`The ${it.name.toLowerCase()} costs ${it.price} denarii (you have ${Vitals.coins}).`); return; }
    Vitals.coins -= it.price;
    s.items.push(id); save(); Sfx.play("coin");
    wear(id);
    toast(`You bought the ${it.name.toLowerCase()} and put it on.`);
  }

  function wear(id) {
    const it = ITEMS[id];
    if (!it || !s.items.includes(id)) return;
    if (s.worn.includes(id)) s.worn = s.worn.filter((w) => w !== id);
    else s.worn = [...s.worn.filter((w) => ITEMS[w].slot !== it.slot), id]; // replaces what you wore in that slot
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
    const list = $m("mk-items");
    list.replaceChildren(...Object.entries(ITEMS).map(([id, it]) => {
      const li = document.createElement("li"), txt = document.createElement("span"), b = document.createElement("button");
      const name = document.createElement("strong"), note = document.createElement("small");
      name.textContent = it.name; note.textContent = it.note;
      txt.append(name, note);
      b.type = "button";
      if (!s.items.includes(id)) { b.textContent = `Buy · ${it.price}`; b.disabled = Vitals.coins < it.price; b.addEventListener("click", () => buyItem(id)); }
      else { b.textContent = s.worn.includes(id) ? "Take off" : "Wear"; b.classList.toggle("on", s.worn.includes(id)); b.addEventListener("click", () => wear(id)); }
      li.append(txt, b);
      return li;
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
    get worn() { return s.worn.slice(); },
    rent: () => HOUSES[s.house].rent,
    houseName: () => HOUSES[s.house].name,
    snapshot: () => ({ house: s.house, items: s.items.slice(), worn: s.worn.slice() }),
    restore(raw) { s = sanitize(raw); save(); applyAll(); },
  };
})();
