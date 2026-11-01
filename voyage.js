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
    if (Math.random() < 0.55) { coins(90); say("You beat the pirates off and found 90 denarii in their boat!"); } else { coins(-70); say("The pirates won the fight and took 70 denarii."); }
  }

  async function sail(to) {
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
      if (r < 0.4) { say("Calm seas and a fair wind."); } else if (r < 0.65) { coins(15); say("Dolphins race the bow! The crew toss you 15 denarii for luck."); } else if (r < 0.85) { coins(-25); say("A storm! The ship is battered and the repairs cost you 25 denarii."); } else say("A long, lazy swell. You doze on the deck.");
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
    if (!done.includes(to)) { done.push(to); save(); coins(BONUS); Sfx.play("cheer"); toast(`You arrived by sea for the first time: explorer's bonus +${BONUS} denarii!`); }
  }

  function bind() {
    const host = $v("tv-sea"); if (!host) return;
    for (const c of Object.keys(NAMES)) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = `⛵ ${NAMES[c]}`; b.dataset.sea = c;
      b.addEventListener("click", () => sail(c)); host.append(b);
    }
  }
  return { bind, sail, FARE, get count() { return done.length; } };
})();
