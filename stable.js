"use strict";
// Racehorses: 🐴 Stable in the menu (Play and compete). Buy a foal (300 denarii), train it (speed or stamina, 25 denarii, each horse rests 90 seconds between sessions, and the closer a stat gets to 100
// the smaller the gains), breed two grown horses into a foal that takes after both (150 denarii, 8 minutes), sell the ones you do not need, and pick the horse that races for you (up to three in the
// stable). The racehorse you pick changes the chariot race in the Circus (offline races): its SPEED adds up to 15% to your top speed and its STAMINA makes your horses tire up to 30% more slowly
// (character.js asks Stable.mod for "racespeed" and "tire"). Every win in the Circus adds a win to its record and a point of speed. Not used in races against other people. Saved in this browser
// (in class mode: this tab). Depends on vitals.js, dialog.js, race.js (Race.isOnline) and the globals of game.js (mode, panelOpen, openPanel, toast).

const Stable = (() => {
  const KEY = "rome-stable", MAX = 3, FOAL = 300, TRAIN = 25, TRAIN_CD = 90000, BREED = 150, BREED_CD = 8 * 60000;
  const NAMES = ["Argo", "Pegasus", "Bucephalus", "Ignis", "Fulmen", "Aquila", "Nox", "Sirocco", "Zephyr", "Brisa", "Tormenta", "Relámpago", "Ashwa", "Badal", "Tara", "Meteor", "Shadow", "Saffron", "Comet", "Ember", "Marble", "Thunder"];
  const $s = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  let st = { horses: [], active: null, next: 1, breed: null };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && Array.isArray(s.horses)) st = { horses: s.horses.slice(0, MAX), active: s.active || null, next: s.next || 1, breed: s.breed || null }; } catch (e) { /* no stable yet */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage unavailable: the stable lasts until the page closes */ } };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const name = () => { const used = new Set(st.horses.map((h) => h.name)); return pick(NAMES.filter((n) => !used.has(n)).concat(["Foal " + st.next])); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const active = () => st.horses.find((h) => h.id === st.active) || null;
  const value = (h) => Math.round(100 + (h.speed + h.stamina) * 3 + h.wins * 25);
  const grown = (h) => h.speed + h.stamina >= 40;

  // what the racehorse you picked does to the race
  function mod(key) {
    const h = active();
    if (!h || (typeof Race !== "undefined" && Race.isOnline && Race.isOnline())) return 1;
    if (key === "racespeed") return 1 + h.speed / 100 * 0.15;
    if (key === "tire") return 1 - h.stamina / 100 * 0.3;
    return 1;
  }
  function won() {
    const h = active(); if (!h) return;
    h.wins++; h.speed = Math.min(100, h.speed + 1); save();
    toast(`🐴 ${h.name}: ${tr("a win for the record")} (${h.wins}) · ${tr("speed")} ${Math.round(h.speed)}`);
  }

  function buy() {
    if (st.horses.length >= MAX) { toast(tr("The stable is full: sell a horse first.")); return; }
    if (Vitals.coins < FOAL) { toast(`${tr("A foal costs")} ${FOAL} ${tr("denarii")}.`); return; }
    Vitals.coins -= FOAL;
    const h = { id: st.next++, name: name(), speed: Math.round(rnd(5, 15)), stamina: Math.round(rnd(5, 15)), wins: 0, t: { speed: 0, stamina: 0 }, born: Date.now() };
    st.horses.push(h); if (!st.active) st.active = h.id; save(); Sfx.play("coin"); render();
  }
  function train(h, stat) {
    const wait = TRAIN_CD - (Date.now() - h.t[stat]);
    if (wait > 0) { toast(`${h.name} ${tr("needs to rest")}: ${Math.ceil(wait / 1000)} s`); return; }
    if (Vitals.coins < TRAIN) { toast(`${tr("Training costs")} ${TRAIN} ${tr("denarii")}.`); return; }
    Vitals.coins -= TRAIN; h.t[stat] = Date.now();
    const gain = Math.max(0.5, Math.round(rnd(3, 8) * (1 - h[stat] / 130) * 10) / 10);
    h[stat] = Math.min(100, Math.round((h[stat] + gain) * 10) / 10); save(); Sfx.play("coin");
    toast(`${h.name}: ${tr(stat === "speed" ? "speed" : "stamina")} +${gain}`); render();
  }
  function sell(h) {
    Dialog.confirm(`${tr("Sell")} ${h.name} ${tr("for")} ${value(h)} ${tr("denarii")}?`).then((yes) => {
      if (!yes) return;
      Vitals.coins += value(h); st.horses = st.horses.filter((x) => x !== h); if (st.active === h.id) st.active = st.horses[0] ? st.horses[0].id : null; save(); Sfx.play("coin"); render();
    });
  }
  function breed(a, b) {
    if (st.breed && st.breed.until > Date.now()) return;
    if (st.horses.length >= MAX) { toast(tr("The stable is full: sell a horse first.")); return; }
    if (Vitals.coins < BREED) { toast(`${tr("Breeding costs")} ${BREED} ${tr("denarii")}.`); return; }
    Vitals.coins -= BREED; st.breed = { a: a.name, b: b.name, sp: (a.speed + b.speed) / 2, stm: (a.stamina + b.stamina) / 2, until: Date.now() + BREED_CD }; save(); toast(`${tr("A foal is on the way")}: ${a.name} + ${b.name}`); render();
  }
  function arrive() {                                                        // the foal is born
    const b = st.breed; if (!b || b.until > Date.now()) return;
    if (st.horses.length >= MAX) return;                                    // (it waits until there is a stall)
    const h = { id: st.next++, name: name(), speed: Math.round(Math.min(100, b.sp * 0.9 + rnd(0, 10))), stamina: Math.round(Math.min(100, b.stm * 0.9 + rnd(0, 10))), wins: 0, t: { speed: 0, stamina: 0 }, born: Date.now(), from: `${b.a} + ${b.b}` };
    st.horses.push(h); st.breed = null; if (!st.active) st.active = h.id; save(); toast(`🐴 ${tr("A foal was born")}: ${h.name}!`);
  }

  const el = (t, x, c) => { const e = document.createElement(t); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
  const btn = (text, fn, dis) => { const b = el("button", text, "tour-go"); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", fn); return b; };
  const bar = (label, v) => { const row = el("div", undefined, "st-bar"); row.append(el("span", `${tr(label)} ${Math.round(v)}`)); const m = el("div", undefined, "st-meter"), f = el("i"); f.style.width = Math.min(100, v) + "%"; m.append(f); row.append(m); return row; };
  function render() {
    const body = $s("stable-body"); if (!body) return;
    const parts = [el("p", tr("Buy a foal, train it, breed two horses and pick the one that races for you in the Circus: speed makes your chariot faster, stamina makes your horses tire more slowly."), "hire-intro")];
    for (const h of st.horses) {
      const card = el("div", undefined, "st-card" + (st.active === h.id ? " on" : ""));
      card.append(el("strong", `🐴 ${h.name}${st.active === h.id ? " ⭐" : ""}`), el("small", `${h.wins} ${tr("wins")} · ${tr("worth")} ${value(h)}${h.from ? " · " + h.from : ""}${grown(h) ? "" : " · " + tr("too young to breed")}`), bar("Speed", h.speed), bar("Stamina", h.stamina));
      const row = el("div", undefined, "st-row");
      for (const k of ["speed", "stamina"]) { const w = Math.ceil((TRAIN_CD - (Date.now() - h.t[k])) / 1000); row.append(btn(`${tr("Train " + k)} · ${TRAIN}${w > 0 ? ` (${w}s)` : ""}`, () => train(h, k), w > 0)); }
      if (st.active !== h.id) row.append(btn(tr("Race with this one"), () => { st.active = h.id; save(); render(); }));
      row.append(btn(tr("Sell"), () => sell(h))); card.append(row); parts.push(card);
    }
    if (!st.horses.length) parts.push(el("p", tr("Your stable is empty."), "hire-far"));
    const b = st.breed;
    if (b) { const w = Math.max(0, Math.ceil((b.until - Date.now()) / 1000)); parts.push(el("p", `🍼 ${b.a} + ${b.b}: ${w > 0 ? `${Math.floor(w / 60)}:${String(w % 60).padStart(2, "0")}` : tr("the foal is waiting for a free stall")}`, "hire-intro")); }
    const row = el("div", undefined, "st-row");
    row.append(btn(`${tr("Buy a foal")} · ${FOAL}`, buy, st.horses.length >= MAX || Vitals.coins < FOAL));
    const pairs = st.horses.filter(grown);
    if (pairs.length >= 2 && !b) row.append(btn(`${tr("Breed the two best")} · ${BREED}`, () => { const s = pairs.slice().sort((x, y) => (y.speed + y.stamina) - (x.speed + x.stamina)); breed(s[0], s[1]); }, st.horses.length >= MAX || Vitals.coins < BREED));
    parts.push(row);
    body.replaceChildren(...parts);
  }
  let timer = 0;
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    arrive(); render(); openPanel("#stablepanel");
    clearInterval(timer); timer = setInterval(() => { if (!$s("stablepanel").classList.contains("show")) { clearInterval(timer); return; } arrive(); render(); }, 1000);
  }
  function bind() { const b = $s("btn-stable"); if (b) b.addEventListener("click", open); setInterval(arrive, 5000); }
  return { bind, open, mod, won, buy, train, breed, get state() { return st; } };
})();
