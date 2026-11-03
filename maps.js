"use strict";
// Treasure maps. 🗺 Treasure map in the menu: for 100 denarii a map-seller marks a spot in the city you are in and gives you a clue ("about 220 m north-west of the Pantheon"). Walk there;
// a line on the screen tells you how warm you are (cold, cool, warm, hot, burning) as you get close, and a cross shows on the ground when you are near. Press F on the cross to dig:
// 120 to 300 denarii, and now and then a rare treasure. One map at a time, and the seller needs five minutes between maps. Kept in the browser and with your account.
// Depends on market.js (Market.grant, Market.relics), vitals.js and the globals of game.js (LANDMARKS, city, player, scene, groundAt, blockedAt, BOUNDS).

const TreasureMaps = (() => {
  const T = THREE;
  const KEY = "rome-tmap", PRICE = 100, GAP = 5 * 60 * 1000, REACH = 2.6;
  let m = null, lastBuy = 0, mark = null, hud = null;                      // m: { city, x, z, clue }
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && Number.isFinite(r.x) && Number.isFinite(r.z) && typeof r.city === "string") { m = { city: r.city, x: r.x, z: r.z, clue: String(r.clue || "").slice(0, 120) }; lastBuy = Number(r.at) || 0; } } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(m ? { ...m, at: lastBuy } : { at: lastBuy })); } catch (e) { /* ignore */ } };
  const DIRS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
  const dirName = (dx, dz) => DIRS[((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  const okSpot = (x, z) => x > BOUNDS.minX + 15 && x < BOUNDS.maxX - 15 && z > BOUNDS.minZ + 15 && z < BOUNDS.maxZ - 15 && !blockedAt(x, z, groundAt(x, z)) && groundAt(x, z) > -0.2 && !(city === "cancun" && Cancun.inWater(x, z)) && !(city === "beijing" && Beijing.inWater(x, z)) && Math.abs(groundAt(x, z)) < 4;

  function buy() {
    if (typeof started === "undefined" || !started) return;
    if (m && m.city === city) { toast(`You already have a map: ${m.clue}`); return; }
    if (Date.now() - lastBuy < GAP && lastBuy) { toast(`The map-seller needs a few minutes before the next map (${Math.ceil((GAP - (Date.now() - lastBuy)) / 60000)} min).`); return; }
    if (Vitals.coins < PRICE) { toast(`A map costs ${PRICE} denarii.`); return; }
    let spot = null;
    for (let i = 0; i < 300 && !spot; i++) {
      const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 380, x = player.x + Math.cos(a) * d, z = player.z + Math.sin(a) * d;
      if (okSpot(x, z)) spot = { x, z };
    }
    if (!spot) { toast("The map-seller shrugs: no good place to bury anything round here."); return; }
    const lms = LANDMARKS.filter((l) => !l.home && !l.game); let best = null, bd = Infinity;
    for (const l of lms) { const d = Math.hypot(l.x - spot.x, l.z - spot.z); if (d < bd) { bd = d; best = l; } }
    const clue = best ? `About ${Math.max(10, Math.round(bd / 10) * 10)} m ${dirName(spot.x - best.x, spot.z - best.z)} of ${best.name}.` : "Somewhere in the city.";
    Vitals.coins -= PRICE; Sfx.play("coin");
    m = { city, x: spot.x, z: spot.z, clue }; lastBuy = Date.now(); save();
    toast(`🗺 You buy a treasure map. The clue: ${clue} The screen tells you how warm you are as you get close.`);
  }

  function dig() {
    if (!m) return;
    const r = Math.random(), gold = 120 + Math.floor(Math.random() * 19) * 10;
    Vitals.coins += gold; Sfx.play("medal");
    let extra = "";
    if (r < 0.08 && typeof Market !== "undefined" && Market.relics) {
      const have = new Set(Market.snapshot().items), free = Market.relics.filter((x) => !have.has(x[0]));
      if (free.length) { const x = free[Math.floor(Math.random() * free.length)]; Market.grant(x[0]); extra = ` and a rare treasure: the ${x[1].toLowerCase()}!`; }
    }
    toast(`⛏ You dig up a chest: +${gold} denarii${extra}`);
    m = null; save(); if (mark) mark.visible = false; if (hud) hud.hidden = true;
  }

  const near = () => !!m && m.city === city && typeof started !== "undefined" && started && mode === "walk" && !panelOpen && Math.hypot(player.x - m.x, player.z - m.z) < REACH + 1;
  const at = () => near();
  const promptText = () => (near() ? "F: dig here for treasure" : "");

  function update() {
    if (typeof started === "undefined" || !started) return;
    if (!hud) hud = document.getElementById("tmap-hud");
    if (!mark) {
      mark = new T.Group(); const mat = new T.MeshBasicMaterial({ color: 0xff2a14 });
      for (const r of [Math.PI / 4, -Math.PI / 4]) { const b = new T.Mesh(new T.BoxGeometry(4.2, 0.12, 0.6), mat); b.rotation.y = r; b.position.y = 0.1; mark.add(b); }
      const beam = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 60, 10, 1, true), new T.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false })); beam.position.y = 30; mark.add(beam);   // a light pillar: you can see where the cross is from a long way off
      mark.visible = false; scene.add(mark);
    }
    if (!m || m.city !== city) { mark.visible = false; if (hud) hud.hidden = true; return; }
    const d = Math.hypot(player.x - m.x, player.z - m.z);
    mark.visible = d < 160; if (mark.visible) mark.position.set(m.x, groundAt(m.x, m.z), m.z);
    if (hud) {
      hud.hidden = mode !== "walk" && mode !== "drive";
      hud.textContent = `🗺 ${d > 300 ? "Cold" : d > 150 ? "Cool" : d > 60 ? "Warm" : d > 25 ? "Hot" : "Burning!"} · ${m.clue}`;
    }
  }

  function bind() { const b = document.getElementById("btn-tmap"); if (b) b.addEventListener("click", () => { closePanels(); if (m && m.city === city) toast(`🗺 Your map: ${m.clue}`); else buy(); }); }

  return {
    bind, update, at, act: dig, promptText,
    snapshot: () => (m ? { ...m, at: lastBuy } : { at: lastBuy }),
    restore(raw) { if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.z) && typeof raw.city === "string") { m = { city: raw.city, x: raw.x, z: raw.z, clue: String(raw.clue || "").slice(0, 120) }; } else m = null; lastBuy = Number(raw && raw.at) || 0; save(); },
    get active() { return m; }, _buy: buy,
  };
})();
