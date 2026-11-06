"use strict";
// Voyages: a slower way to travel between the cities, by sea. In the Travel box (T) choose "by sea": it costs 50 denarii and takes about half a minute, and the sea has its own
// surprises on the way: calm water, dolphins, a storm that needs repairs, flotsam to pick up, or pirates (pay them off, or fight them and take your chances).
// The first time you arrive in each city by sea pays an explorer's bonus of 100 denarii. Depends on dialog.js, vitals.js and the globals of game.js (arriveIn, travelBusy, city, mode, panelOpen).

const Voyage = (() => {
  const FARE = 50, KEY = "rome-voyages", BONUS = 100;
  const NAMES = { rome: "Rome (Ostia)", delhi: "Delhi (by the Yamuna)", cancun: "Cancún" };
  let done = [];
  try { const r = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(r)) done = r.filter((c) => NAMES[c]); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* ignore */ } };
  const $v = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let box = null, logEl = null, barEl = null;

  function build() {
    box = document.createElement("div"); box.id = "voyage"; box.hidden = true;
    box.innerHTML = '<div class="vy-sea"><div class="vy-ship" aria-hidden="true">⛵</div></div><h2 id="vy-title"></h2><div class="vy-bar"><i id="vy-fill"></i></div><ul id="vy-log"></ul>';
    document.body.append(box); logEl = box.querySelector("#vy-log"); barEl = box.querySelector("#vy-fill");
  }
  const say = (t) => { const li = document.createElement("li"); li.textContent = t; logEl.append(li); logEl.scrollTop = logEl.scrollHeight; };
  const coins = (n) => { Vitals.coins = Math.max(0, Vitals.coins + n); };
  const progress = (f) => { barEl.style.width = `${Math.round(f * 100)}%`; };

  async function pirates() {
    const pay = await Dialog.confirm("Pirates! A black sail closes on you. OK: pay them 40 denarii to leave you alone. Cancel: fight them.");
    if (pay) { coins(-40); say("You paid the pirates 40 denarii and they sailed away."); return; }
    if (Math.random() < 0.55) { coins(90); say("You beat the pirates off and found 90 denarii in their boat!"); } else { coins(-70); say("The pirates won the fight and took 70 denarii."); const gone = typeof Trade !== "undefined" ? Trade.caravanLoss(0.5) : 0; if (gone) say(`They also took ${gone} crate${gone === 1 ? "" : "s"} of your caravan's goods.`); }
  }

  // the Silk Road: Beijing and Old Delhi are joined by a caravan road (40 denarii, about 35 seconds): sandstorms, oases and bandits on the way; a caravan of goods can go this way too (trade.js)
  const ROAD = { beijing: "Beijing", delhi: "Old Delhi" }, ROAD_FARE = 40, ROAD_KEY = "rome-roads";
  let roads = [];
  try { const r = JSON.parse(localStorage.getItem(ROAD_KEY) || "[]"); if (Array.isArray(r)) roads = r.filter((c) => ROAD[c]); } catch (e) { /* storage unavailable */ }
  async function bandits() {
    const pay = await Dialog.confirm("Bandits block the road! OK: pay them 40 denarii to let you through. Cancel: fight them.");
    if (pay) { coins(-40); say("You paid the bandits 40 denarii and they stepped aside."); return; }
    if (Math.random() < 0.55) { coins(80); say("You drove the bandits off and found 80 denarii in their camp!"); }
    else { coins(-70); say("The bandits won the fight and took 70 denarii."); const gone = typeof Trade !== "undefined" ? Trade.caravanLoss(0.5) : 0; if (gone) say(`They also took ${gone} crate${gone === 1 ? "" : "s"} of your caravan's goods.`); }
  }
  async function road(to) {
    const from = typeof city !== "undefined" ? city : "";
    if (!ROAD[to] || !ROAD[from] || to === from) { toast("The Silk Road joins Beijing and Old Delhi."); return; }
    if (mode !== "walk" || sleepT > 0 || !started || travelBusy) { toast("Stop what you are doing first to set off."); return; }
    if (Subway.underground) { toast("Come up from the metro first (U on the platform)."); return; }
    if (Vitals.coins < ROAD_FARE) { toast(`The caravan road costs ${ROAD_FARE} denarii.`); return; }
    closePanels(); travelBusy = true; Vitals.stopRest(); Nav.clear();
    coins(-ROAD_FARE); Sfx.play("camelbell");
    if (!box) build();
    logEl.replaceChildren(); progress(0); $v("vy-title").textContent = `On the Silk Road to ${ROAD[to]}`; box.hidden = false;
    try {
      say(`You join a caravan (${ROAD_FARE} denarii). The camels' bells ring and the city falls behind.`); await sleep(3500); progress(0.2);
      const r = Math.random(); Sfx.play("bell");
      if (r < 0.35) say("A clear road and good grass for the animals.");
      else if (r < 0.6) { coins(20); say("An oasis! The caravan rests, and you sell a little water for 20 denarii."); }
      else if (r < 0.85) { coins(-25); say("A sandstorm! You shelter behind the camels, and the lost tent costs you 25 denarii."); if (typeof Trade !== "undefined" && Trade.caravanLoss(0.001)) say("One crate of your caravan's goods was buried in the sand."); }
      else { coins(10); say("Merchants from a passing caravan trade news with you (+10 denarii)."); }
      await sleep(6000); progress(0.55);
      const q = Math.random();
      if (q < 0.3) await bandits();
      else if (q < 0.6) { coins(30); say("You sleep at a caravanserai and sell a map of the road for 30 denarii."); }
      else say("The road winds on through red hills.");
      await sleep(5000); progress(0.9);
      say(`${ROAD[to]} rises out of the dust.`); await sleep(2500); progress(1);
    } catch (err) { console.error(err); }
    box.hidden = true;
    try { arriveIn(to); } catch (err) { console.error(err); toast("Could not arrive"); }
    travelBusy = false;
    if (typeof Trade !== "undefined") Trade.caravanMoved(to);
    if (!roads.includes(to)) { roads.push(to); try { localStorage.setItem(ROAD_KEY, JSON.stringify(roads)); } catch (e) { /* ignore */ } coins(BONUS); Sfx.play("cheer"); toast(`You arrived by the Silk Road for the first time: bonus +${BONUS} denarii!`); }
  }

  async function sail(to) {
    if (typeof city !== "undefined" && city === "beijing") { toast("Beijing is far from the sea: take the Silk Road to Delhi (🐪 in the Travel box), or use the Travel button (B)."); return; }
    if (!NAMES[to] || to === city) { toast("You are already there."); return; }
    if (Subway.underground) { toast("Come up from the metro first (U on the platform)."); return; }
    if (Jail.active) { toast("You are in jail: wait out your sentence or bribe the guard."); return; }
    if (mode !== "walk" || sleepT > 0 || !started || travelBusy) { toast("Stop what you are doing first to sail."); return; }
    if (Vitals.coins < FARE) { toast(`The passage costs ${FARE} denarii.`); return; }
    closePanels(); travelBusy = true; Vitals.stopRest(); Nav.clear();
    coins(-FARE); Sfx.play("horn");
    if (!box) build();
    logEl.replaceChildren(); progress(0); $v("vy-title").textContent = `Sailing to ${NAMES[to]}`; box.hidden = false;
    try {
      say(`You board a ship (${FARE} denarii). The sails fill and the shore slips away.`); await sleep(3500); progress(0.2);
      const r = Math.random(); Sfx.play("splash");
      if (r < 0.4) { say("Calm seas and a fair wind."); } else if (r < 0.65) { coins(15); say("Dolphins race the bow! The crew toss you 15 denarii for luck."); } else if (r < 0.85) { coins(-25); say("A storm! The ship is battered and the repairs cost you 25 denarii."); if (typeof Trade !== "undefined" && Trade.caravanLoss(0.001)) say("One crate of your caravan's goods went overboard."); } else say("A long, lazy swell. You doze on the deck.");
      await sleep(6000); progress(0.55);
      const q = Math.random();
      if (q < 0.3) await pirates();
      else if (q < 0.65) { const f = 40 + Math.floor(Math.random() * 9) * 10; coins(f); say(`You spot a floating crate and haul it aboard: ${f} denarii of goods sold on the spot.`); }
      else say("Gulls wheel overhead: land is near.");
      await sleep(5000); progress(0.9);
      say(`${NAMES[to]} rises out of the haze.`); await sleep(2500); progress(1);
    } catch (err) { console.error(err); }
    box.hidden = true;
    try { arriveIn(to); } catch (err) { console.error(err); toast("Could not arrive"); }
    travelBusy = false;
    if (typeof Trade !== "undefined") Trade.caravanMoved(to);
    if (!done.includes(to)) { done.push(to); save(); coins(BONUS); Sfx.play("cheer"); toast(`You arrived by sea for the first time: explorer's bonus +${BONUS} denarii!`); }
  }

  function bind() {
    const host = $v("tv-sea"); if (!host) return;
    for (const c of Object.keys(NAMES)) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = `⛵ ${NAMES[c]}`; b.dataset.sea = c;
      b.addEventListener("click", () => sail(c)); host.append(b);
    }
    for (const c of Object.keys(ROAD)) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = `🐪 ${ROAD[c]} by the Silk Road`; b.dataset.road = c; b.hidden = true;
      b.addEventListener("click", () => road(c)); host.append(b);
    }
    setInterval(() => { for (const b of host.querySelectorAll("[data-road]")) b.hidden = !(typeof city !== "undefined" && ROAD[city] && city !== b.dataset.road); }, 1000);
  }
  return { bind, sail, road, FARE, get count() { return done.length; } };
})();
