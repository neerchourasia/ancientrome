"use strict";
// Mount hire: 🐎 Hire a mount in the menu (Getting around). Every city has a hire stand (a rail with animals and a sign): walk up to it, open the menu and hire a donkey, a horse, a camel or an
// elephant for 10 minutes. You pay, the animal appears under you and you ride it like one you own (Car.deploy with anyEra: a hired animal can be ridden in every time of every city, so a
// horse can be hired on the beach in modern Cancún too); when the time is up the stable hand leads it away. Where the animal did not exist, there is nothing to hire: no horses in the
// Americas before 1492, so the Maya city of Cancún has no stand until the Spanish arrive (the middle time) or today. Each stand stands in the first clear patch of ground near its sight (the
// same place for everybody). Depends on car.js (Car.model, Car.deploy, Car.stow, Car.current), vitals.js and the globals of game.js (scene, city, era, skin, player, started, mode, openPanel, closePanels, toast, startDirections).

const MountHire = (() => {
  const T = THREE, MINUTES = 10, REACH = 40;
  const PRICE = { donkey: 15, horse: 40, camel: 30, elephant: 70 };
  const WHY = { donkey: "slow, cheap and sure-footed", horse: "fast: top speed 65 km/h", camel: "tall and calm: you ride high above the crowd", elephant: "huge: everyone makes way" };
  const STAND = {                                                          // where each city's stand is and what it is called
    rome: { near: "circus", name: "The Circus stables", animals: ["horse", "donkey"] },
    delhi: { near: "d-serai", name: "The caravanserai", animals: ["camel", "horse", "elephant"] },
    cancun: { near: "c-casita", name: "The ranch", animals: ["horse", "donkey"] },
    beijing: { near: "b-market", name: "The caravan yard", animals: ["camel", "horse"] },
  };
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const $h = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  let scene = null, shown = null, key = "", sites = {}, siteT = 1.5, hud = null, until = 0, hired = "";

  const period = () => (era === "modern" ? "modern" : skin ? "mid" : "ancient");
  const animalsHere = () => (city === "cancun" && period() === "ancient" ? [] : STAND[city].animals);

  // ---- where it stands
  function pickSite() {
    const lm = ALL_LANDMARKS.find((l) => l.id === STAND[city].near); if (!lm) return null;
    const saved = dynBlockers.map((d) => d.on); dynBlockers.forEach((d) => { d.on = false; });
    try {
      const [bx, bz] = lm.stand || [lm.x, lm.z], g0 = groundAt(bx, bz);
      for (const rad of [14, 20, 28, 38, 50, 64, 80]) for (let a = 0; a < 16; a++) {
        const cx = bx + Math.cos(a * Math.PI / 8) * rad, cz = bz + Math.sin(a * Math.PI / 8) * rad, yaw = Math.atan2(lm.x - cx, lm.z - cz), s = Math.sin(yaw), c = Math.cos(yaw);
        const ok = [[0, 0], [-5, 0], [5, 0], [0, 3], [0, -3], [-5, 3], [5, 3], [-5, -3], [5, -3]].every(([dx, dz]) => { const x = cx + dx * c + dz * s, z = cz - dx * s + dz * c, y = groundAt(x, z); return y > -0.02 && Math.abs(y - g0) < 2 && !blockedAt(x, z, y); });
        if (ok) return [cx, cz, yaw];
      }
    } finally { dynBlockers.forEach((d, i) => { d.on = saved[i]; }); }
    return null;
  }

  // ---- the stand: a rail, hay, a sign and two of the animals tied to it
  function make(animals) {
    const g = new T.Group(), wood = lam(0x7a5a34), hay = lam(0xd2b04a);
    const bar = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); };
    bar(10, 0.18, 0.18, wood, 0, 1.05, 0); bar(10, 0.18, 0.18, wood, 0, 0.6, 0);
    for (const x of [-5, -2.5, 0, 2.5, 5]) bar(0.22, 1.5, 0.22, wood, x, 0.75, 0);
    for (const x of [-4.2, 4.2]) bar(1.4, 0.8, 0.9, hay, x, 0.4, 1.6);
    animals.slice(0, 3).forEach((id, i) => { const a = Car.model(id); a.position.set(-3 + i * 3, 0, -1.8); a.rotation.y = Math.PI + (i - 1) * 0.15; g.add(a); });
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128; const x = cv.getContext("2d");
    x.fillStyle = "rgba(34,26,16,.9)"; x.strokeStyle = "#e2b955"; x.lineWidth = 6; x.beginPath(); x.roundRect(6, 14, 500, 100, 18); x.fill(); x.stroke();
    x.fillStyle = "#f1ead8"; x.font = "bold 40px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("🐎 " + tr("Mount hire"), 256, 50, 470);
    x.font = "26px sans-serif"; x.fillStyle = "#e2b955"; x.fillText(`${MINUTES} ${tr("minutes")} · ${tr("open the menu")}`, 256, 88, 470);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false })); sp.scale.set(8, 2, 1); sp.position.set(0, 5, 0); g.add(sp);
    return g;
  }
  function rebuild() {
    if (shown) { scene.remove(shown.g); shown = null; }
    key = `${city}|${period()}`; const p = sites[key]; if (!p || !animalsHere().length) return;
    const g = make(animalsHere()); g.position.set(p[0], groundAt(p[0], p[1]), p[1]); g.rotation.y = p[2]; scene.add(g); shown = { g, at: p };
  }
  const here = () => { const p = sites[`${city}|${period()}`]; return p && animalsHere().length ? p : null; };
  const near = () => { const p = here(); return !!p && Math.hypot(player.x - p[0], player.z - p[1]) < REACH; };

  // ---- hiring
  function hire(id) {
    if (!near()) { toast(tr("Walk up to the hire stand first.")); return; }
    if (Vitals.coins < PRICE[id]) { toast(tr("You cannot afford that.")); return; }
    Car.stow(); Vitals.coins -= PRICE[id];
    closePanels();
    if (Car.deploy(id, true) === false || Car.current !== id) { Vitals.coins += PRICE[id]; toast(tr("There is no room here. Find an open street.")); return; }
    hired = id; until = Date.now() + MINUTES * 60000;
    toast(`🐎 ${tr("Hired")}: ${tr(Car.MODELS[id].name)} · ${MINUTES} ${tr("minutes")} (-${PRICE[id]})`);
  }
  function release(quiet) {
    if (!hired) return;
    if (Car.current === hired) Car.stow();
    hired = ""; until = 0; if (hud) hud.hidden = true;
    if (!quiet) toast(`🐎 ${tr("Your hire has ended and the stable hand leads the animal away.")}`);
  }

  // ---- the panel
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    const body = $h("hire-body"), el = (t, x, c) => { const e = document.createElement(t); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
    const parts = [];
    if (!animalsHere().length) parts.push(el("p", tr("There were no horses, camels or donkeys here yet: they did not live in the Americas until the Spanish brought them. Travel to another time or city to hire one."), "hire-intro"));
    else {
      parts.push(el("p", `${tr(STAND[city].name)}: ${tr("hire an animal for")} ${MINUTES} ${tr("minutes. You can ride it anywhere, in any time.")}`, "hire-intro"));
      if (!near()) {
        const p = here(); parts.push(el("p", tr("The hire stand is not near you."), "hire-far"));
        if (p) { const go = el("button", tr("Directions"), "tour-go"); go.type = "button"; go.addEventListener("click", () => { closePanels(); startDirections({ name: tr("Mount hire"), stand: [p[0] + 4, p[1] + 5] }); }); parts.push(go); }
      } else for (const id of animalsHere()) {
        const row = el("div", undefined, "hire-row"), txt = el("span"), b = el("button", `${tr("Hire")} · ${PRICE[id]}`, "tour-go");
        txt.append(el("strong", tr(Car.MODELS[id].name)), el("small", tr(WHY[id]))); b.type = "button"; b.disabled = Vitals.coins < PRICE[id]; b.addEventListener("click", () => hire(id));
        row.append(txt, b); parts.push(row);
      }
      if (hired) { const r = el("button", tr("Give the animal back"), "tour-go"); r.type = "button"; r.addEventListener("click", () => { release(true); closePanels(); }); parts.push(r); }
    }
    body.replaceChildren(...parts); openPanel("#hirepanel");
  }

  function update(dt) {
    if (!scene || typeof started === "undefined" || !started) return;
    const k = `${city}|${period()}`;
    if (!sites[k] && mode === "walk" && STAND[city]) { siteT -= dt; if (siteT <= 0) { sites[k] = pickSite() || null; siteT = 1.5; } }
    if (k !== key || (!!shown !== !!here())) rebuild();
    if (hired) {
      const left = until - Date.now();
      if (Car.current !== hired) { release(true); return; }                 // you put it away yourself (or an aircraft or a metro took its place)
      if (left <= 0) { release(false); return; }
      if (!hud) { hud = document.createElement("div"); hud.id = "hire-hud"; document.body.appendChild(hud); }
      hud.hidden = false; const s = Math.ceil(left / 1000); hud.textContent = `🐎 ${tr(Car.MODELS[hired].name)} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
  }
  function bind() { const b = $h("btn-hire"); if (b) b.addEventListener("click", open); }
  function build(sc) { scene = sc; }
  return { build, bind, open, update, hire, release, get near() { return near(); }, get active() { return !!hired; }, get site() { return here(); }, get shown() { return shown; }, PRICE, MINUTES };
})();
