"use strict";
// Diseases. You can fall ill, and getting better takes medicine, rest or time. Each illness has its own cause and symptoms:
//   Cold ........ from standing about in rain, snow or hail (a cloak halves the chance). You sneeze, you heal slowly.
//   Fever ....... marsh fever: from being out after dark by the harbour (Rome) or in the monsoon (Delhi). It drains your health
//                 and you shiver.
//   Food poisoning from street food (more often in summer): you lose what you ate and some health, for a short while.
//   Heatstroke .. in Delhi's summer, from walking in the midday sun with nothing to drink: you slow down and feel dizzy.
//   Plague ...... every few weeks an outbreak sweeps one city for three days; being in a crowd then can infect you. Serious: it
//                 drains health and slows you for a long time, and only a strong medicine (or a long rest) cures it.
// Sleeping at home and resting speed up recovery. Medicines are sold by the healer in the market. An illness never kills you
// outright: it leaves you at 5 health. Saved with your game. Depends on game.js, weather.js, market.js and tax.js (Speech).

const Disease = (() => {
  const KEY = "rome-disease";
  const D = {
    cold: { name: "Cold", icon: "🤧", secs: 360, drain: 0, regen: 0.5, speed: 1, cure: "a hot herbal drink" },
    fever: { name: "Marsh fever", icon: "🥵", secs: 600, drain: 0.16, regen: 0.4, speed: 0.92, cure: "a bitter tonic" },
    poison: { name: "Food poisoning", icon: "🤢", secs: 100, drain: 0.25, regen: 0.6, speed: 0.9, cure: "time, or a tonic" },
    heat: { name: "Heatstroke", icon: "😵", secs: 240, drain: 0.1, regen: 0.7, speed: 0.78, cure: "shade, water or a cool drink" },
    plague: { name: "Plague", icon: "☠", secs: 1200, drain: 0.32, regen: 0.2, speed: 0.72, cure: "theriac, the strong medicine" },
  };
  let sick = {};                 // kind -> seconds left
  let wetT = 0, marshT = 0, sunT = 0, sneezeT = 8, coughT = 6, tickT = 0, lastOutbreak = "", shownOutbreak = "", hudT = 0, saveT = 0;
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && typeof r === "object") for (const k of Object.keys(D)) if (Number.isFinite(r[k]) && r[k] > 0) sick[k] = Math.min(D[k].secs, r[k]); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(sick)); } catch (e) { /* ignore */ } };
  const $d = (id) => document.getElementById(id);
  const has = (k) => (sick[k] || 0) > 0;
  const any = () => Object.keys(sick).some((k) => sick[k] > 0);

  // ---- plague: one three-day outbreak a year in each city, on days that change from year to year
  function outbreak(c) {
    const year = Math.floor((Time.day - 1) / 28), d = ((Time.day - 1) % 28) + 1;
    const start = 3 + Math.floor(((Math.sin(year * 12.9898 + (c === "delhi" ? 78.233 : 4.1414)) * 43758.5453) % 1 + 1) % 1 * 22);
    return d >= start && d < start + 3 ? start : 0;
  }
  // at your house: in it, or in its grounds (Rome), or on your plot (Delhi). Being ill anywhere else costs you health.
  const atHome = () => (typeof city !== "undefined" && city === "delhi" ? (Delhi.built && (Delhi.homeInside(player.x, player.z) || Delhi.inPlot(player.x, player.z))) : (Home.inside(player.x, player.z) || Math.hypot(player.x - Home.X, player.z - Home.Z) < 16));
  const AWAY = { cold: 0.2, fever: 0.3, poison: 0.35, heat: 0.25, plague: 0.5 };   // health lost per second while ill and away from home
  const indoors = () => (typeof city !== "undefined" && city === "delhi" ? (Delhi.built && Delhi.homeInside(player.x, player.z)) : (Home.inside(player.x, player.z) || (typeof Jobs !== "undefined" && Jobs.inHall(player.x, player.z))));

  function catchIt(k, why) {
    if (has(k) || !D[k]) return;
    sick[k] = D[k].secs; save();
    toast(`${D[k].icon} You have caught ${k === "cold" ? "a cold" : k === "heat" ? "heatstroke" : D[k].name.toLowerCase()}${why ? ` (${why})` : ""}. ${D[k].name === "Plague" ? "Find the healer in the market: you need theriac." : `Cure: ${D[k].cure}.`}`);
    Narrator.say(`You have caught ${D[k].name}.`, { interrupt: true });
    Sfx.play("bump"); render();
  }
  function cure(list, quiet) {
    let any_ = false;
    for (const k of list === "all" ? Object.keys(D) : list) if (has(k)) { sick[k] = 0; any_ = true; }
    save(); render();
    return any_;
  }

  function update(dt) {
    if (typeof started === "undefined" || !started || !(mode === "walk" || mode === "drive" || mode === "watch")) return;
    const c = typeof city !== "undefined" ? city : "rome", out = !indoors(), seasonIdx = Weather.season;
    const cloak = Market.worn.includes("cloak") || Market.worn.includes("royalcloak") ? 0.5 : 1;     // a cloak keeps the wet and the crowd's coughs off
    const wellFed = Vitals.hunger > 50 ? 1 : Vitals.hunger < 20 ? 2.2 : 1.4;               // a hungry body catches things more easily
    // --- catching things
    const wet = Math.max(Weather.rain > 0.2 ? Weather.rain : 0, Weather.snow, Weather.hail);
    wetT = out && wet > 0.2 ? wetT + dt : Math.max(0, wetT - dt * 2);
    if (wetT > 40 && Math.random() < 0.025 * dt * cloak * wellFed) catchIt("cold", "you were out in the wet");
    const night = Time.isNight, harbourNear = c === "rome" && Math.hypot(player.x - 50, player.z - 140) < 110, monsoon = c === "delhi" && seasonIdx === 2;
    marshT = out && night && (harbourNear || monsoon) ? marshT + dt : Math.max(0, marshT - dt);
    if (marshT > 35 && Math.random() < 0.02 * dt * wellFed) catchIt("fever", c === "delhi" ? "the monsoon night air" : "the marshy air by the harbour at night");
    const hot = c === "delhi" && seasonIdx === 1 && Time.hour > 11 && Time.hour < 16 && Weather.rain < 0.1;
    sunT = out && hot && !Vitals.resting ? sunT + dt : Math.max(0, sunT - dt * 1.5);
    if (sunT > 70 && Math.random() < 0.03 * dt * wellFed) catchIt("heat", "the midday sun");
    // plague: an outbreak in this city, in a crowd
    const ob = outbreak(c);
    if (ob && shownOutbreak !== c + ob + Math.floor((Time.day - 1) / 28)) { shownOutbreak = c + ob + Math.floor((Time.day - 1) / 28); toast(`☠ A sickness is spreading through ${c === "delhi" ? "Delhi" : "Rome"}. Keep away from crowds for three days.`); Narrator.say("A sickness is spreading through the city. Keep away from crowds.", { interrupt: true }); }
    if (ob && out && Math.random() < 0.9 * dt) {
      const list = c === "delhi" ? (Delhi.built ? Delhi.people() : []) : CITIZENS.list;
      let near = 0; for (const p of list) if (Math.hypot(p.x - player.x, p.z - player.z) < 7) near++;
      if (near >= 4 && Math.random() < 0.012 * wellFed * cloak) catchIt("plague", "in the crowd");
    }
    // --- being ill
    let drain = 0, regen = 1, slow = 1;
    const away = any() && !atHome();
    if (away && !Disease.warned && any()) { Disease.warned = true; toast("You are ill and away from home: you are losing health. Go home to rest, or buy medicine from the healer."); }
    if (!away) Disease.warned = false;
    for (const k of Object.keys(sick)) {
      if (sick[k] <= 0) continue;
      const home = Vitals.resting || indoors() && Time.isNight;
      sick[k] -= dt * (home ? 3 : 1) * (Vitals.hunger > 60 ? 1.2 : 1);           // rest and good food help you through
      if (k === "heat" && (indoors() || Vitals.resting)) sick[k] -= dt * 6;       // shade
      drain += away ? AWAY[k] : 0; regen = Math.min(regen, D[k].regen); slow = Math.min(slow, D[k].speed);
      if (sick[k] <= 0) { sick[k] = 0; toast(`You feel better: the ${D[k].name.toLowerCase()} has passed.`); render(); }
    }
    Disease.regenMul = regen; Disease.speedMul = slow;
    if (drain > 0) { Vitals.hp = Math.max(Math.min(Vitals.hp, 5), Vitals.hp - drain * dt); }
    // symptoms: sneezes, coughs and groans above your head
    sneezeT -= dt; coughT -= dt;
    if (has("cold") && sneezeT <= 0) { sneezeT = 9 + Math.random() * 8; Speech.say({ x: player.x, z: player.z }, ["Atchoo!", "*sniff*", "Achoo!"][Math.floor(Math.random() * 3)], 1.6); Sfx.play("bump"); }
    if ((has("plague") || has("fever")) && coughT <= 0) { coughT = 8 + Math.random() * 8; Speech.say({ x: player.x, z: player.z }, has("plague") ? "*cough cough*" : "*shivers*", 1.8); }
    const o = $d("sick"); if (o) o.style.opacity = has("plague") ? 0.5 : has("fever") || has("heat") ? 0.32 : has("poison") ? 0.28 : 0;
    if (o) o.dataset.k = has("plague") ? "plague" : has("fever") ? "fever" : has("heat") ? "heat" : has("poison") ? "poison" : "";
    hudT -= dt; if (hudT <= 0) { hudT = 1; render(); }
    saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  }

  function render() {
    const el = $d("v-disease");
    if (!el) return;
    const list = Object.keys(sick).filter((k) => sick[k] > 0);
    el.textContent = (list.length && !atHome() ? "⚠ Ill away from home: losing health. " : "") + list.map((k) => `${D[k].icon} ${D[k].name} (${Math.floor(sick[k] / 60)}:${String(Math.floor(sick[k] % 60)).padStart(2, "0")})`).join(" · ");
    el.className = list.length ? "bad" : "";
  }

  return {
    update, catchIt, cure, render, has, any, D,
    regenMul: 1, speedMul: 1, warned: false,
    get list() { return Object.keys(sick).filter((k) => sick[k] > 0); },
    snapshot: () => ({ ...sick }),
    restore(r) { sick = {}; if (r && typeof r === "object") for (const k of Object.keys(D)) if (Number.isFinite(r[k]) && r[k] > 0) sick[k] = Math.min(D[k].secs, r[k]); save(); render(); },
    outbreak,
  };
})();
