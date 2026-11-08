"use strict";
// The tour guide: 🧭 in the menu (Getting around). Pick a tour (the nearest three sights, a grand tour of six, or the sights you have not found yet) and a guide appears beside you with a flag
// and walks you from sight to sight along a walkable route (Nav.path), telling you about the next stop as you go (read aloud when the voice is on). The guide waits when you fall behind, stops at
// each sight so the sight's own card (history, fact, today) opens as you arrive, and moves on when you press Next stop (or after a while). The tour ends by itself if you travel to another
// city or change era. It is only on your screen: nothing is sent to the server, so it works in class mode and offline. Depends on game.js (LANDMARKS, discovered, player, groundAt, era, city, mode,
// openPanel, toast), nav.js (path), tax.js (Speech) and narrator.js.

const Tour = (() => {
  const T = THREE;
  const SPEED = 4.2, FAR = 30, NEAR = 14, STOP_MAX = 45;                // metres per second; how far behind you may fall before the guide waits, and how close you must be to go on; seconds at a stop
  const $t = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  let scene = null, guide = null, hud = null, tour = null, hold = 0, waitSay = 0;

  // ---- the guide: a figure with a staff and a bright flag, dressed for the city and the era
  function model() {
    const modern = typeof era !== "undefined" && era === "modern", c = typeof city !== "undefined" ? city : "rome";
    const robe = modern ? 0x2f6fb0 : c === "delhi" ? 0xd9a928 : c === "cancun" ? 0x2f8f6a : c === "beijing" ? 0xb3262b : 0xf0ece0;
    const g = new T.Group(), skin = lam(0xc9976a);
    const body = new T.Mesh(new T.CylinderGeometry(0.34, 0.42, 1.35, 12), lam(robe)); body.position.y = 0.68; g.add(body);
    const sash = new T.Mesh(new T.CylinderGeometry(0.43, 0.43, 0.16, 12), lam(modern ? 0xf2f2f2 : 0xb3262b)); sash.position.y = 0.95; g.add(sash);
    const head = new T.Mesh(new T.SphereGeometry(0.23, 12, 9), skin); head.position.y = 1.56; g.add(head);
    const hat = modern ? new T.Mesh(new T.CylinderGeometry(0.24, 0.28, 0.12, 12), lam(0xe8c13a)) : c === "delhi" ? new T.Mesh(new T.SphereGeometry(0.27, 10, 8), lam(0xe8e4d6)) : new T.Mesh(new T.CylinderGeometry(0.26, 0.26, 0.07, 12), lam(0x6a4c2a));
    hat.position.y = modern ? 1.78 : c === "delhi" ? 1.75 : 1.8; g.add(hat);
    const arm = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.8, 8), lam(robe)); arm.position.set(0.42, 1.12, 0); arm.rotation.z = -0.4; g.add(arm);
    const pole = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 3.4, 6), lam(0x6a4c2a)); pole.position.set(0.62, 1.7, 0); g.add(pole);
    const flag = new T.Mesh(new T.PlaneGeometry(1.0, 0.62), new T.MeshBasicMaterial({ color: 0xffd24a, side: T.DoubleSide })); flag.position.set(1.12, 3.1, 0); g.add(flag);
    const knob = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), new T.MeshBasicMaterial({ color: 0xffd24a })); knob.position.set(0.62, 3.42, 0); g.add(knob);
    g.userData = { body, flag };
    g.traverse((m) => { m.castShadow = true; });
    return g;
  }

  // ---- the tours: sights in the city you are in, nearest first
  const sights = () => LANDMARKS.filter((l) => !l.home && !l.game && l.stand);
  function nearestFirst(list, n) {
    const left = list.slice(), out = []; let x = player.x, z = player.z;
    while (out.length < n && left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((l, i) => { const d = Math.hypot(l.stand[0] - x, l.stand[1] - z); if (d < bd) { bd = d; bi = i; } });
      const l = left.splice(bi, 1)[0]; out.push(l); x = l.stand[0]; z = l.stand[1];
    }
    return out;
  }
  function options() {
    const all = sights(), unseen = all.filter((l) => !discovered.has(l.id));
    const opts = [{ title: "Quick tour", note: "the three sights nearest to you", stops: nearestFirst(all, 3) }];
    if (all.length > 4) opts.push({ title: "Grand tour", note: "six sights, one after the other", stops: nearestFirst(all, 6) });
    if (unseen.length) opts.push({ title: "Sights you have not seen", note: "the nearest ones you have not discovered yet", stops: nearestFirst(unseen, 5) });
    return opts.filter((o) => o.stops.length);
  }
  const length = (stops) => { let d = 0, x = player.x, z = player.z; for (const l of stops) { d += Math.hypot(l.stand[0] - x, l.stand[1] - z); x = l.stand[0]; z = l.stand[1]; } return d; };

  // ---- the panel
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    const body = $t("tour-body"), el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
    const parts = [];
    if (tour) {
      parts.push(el("p", `${tr("Tour")}: ${tr(tour.title)}. ${tr("Stop")} ${tour.i + 1} / ${tour.stops.length}.`));
      const stop = el("button", tr("End the tour"), "tour-go"); stop.type = "button"; stop.addEventListener("click", () => { end(); closePanels(); }); parts.push(stop);
    } else {
      parts.push(el("p", tr("A guide walks with you from sight to sight and tells you about each one. Pick a tour, then follow the flag."), "tour-intro"));
      for (const o of options()) {
        const row = el("div", undefined, "tour-opt"), mins = Math.max(1, Math.round(length(o.stops) / SPEED / 60));
        row.append(el("strong", tr(o.title)), el("small", `${tr(o.note)} · ${o.stops.length} ${tr("stops")} · ~${mins} ${tr("min")}`));
        const ul = el("ul"); for (const l of o.stops) ul.append(el("li", tr(l.name)));
        const go = el("button", `🧭 ${tr("Follow the guide")}`, "tour-go"); go.type = "button"; go.addEventListener("click", () => start(o));
        row.append(ul, go); parts.push(row);
      }
      if (parts.length === 1) parts.push(el("p", tr("There are no sights to visit here.")));
    }
    body.replaceChildren(...parts);
    openPanel("#tourpanel");
  }

  // ---- the walk
  function start(o) {
    closePanels(); end(true);
    tour = { title: o.title, stops: o.stops, i: -1, path: [], pi: 0, state: "lead", t: 0, waiting: false, city: city, era: era };
    const dx = -Math.sin(player.yaw) * 3, dz = -Math.cos(player.yaw) * 3;
    guide = { g: model(), x: player.x + dx, z: player.z + dz, yaw: player.yaw + Math.PI, ph: 0 };
    scene.add(guide.g);
    place();
    next();
    toast(tr("Follow the guide with the flag!"));
  }
  function end(quiet) {
    if (guide) { scene.remove(guide.g); guide = null; }
    if (tour && !quiet) toast(tr("The tour is over."));
    tour = null; render();
  }
  function place() { guide.g.position.set(guide.x, groundAt(guide.x, guide.z), guide.z); guide.g.rotation.y = guide.yaw; }

  // set off for the next stop
  function next() {
    tour.i++;
    if (tour.i >= tour.stops.length) { finish(); return; }
    const lm = tour.stops[tour.i], p = Nav.path(guide.x, guide.z, lm.stand[0], lm.stand[1]);
    tour.path = p && p.length > 1 ? p : [{ x: guide.x, z: guide.z }, { x: lm.stand[0], z: lm.stand[1] }];
    tour.pi = 1; tour.state = "lead"; tour.t = 0; tour.waiting = false;
    const first = String(lm.text || "").split(/(?<=[.!?])\s/)[0];
    tour.says = `${tr("Next stop")}: ${tr(lm.name)}. ${tr(lm.sub)}.`;
    if (typeof Narrator !== "undefined") Narrator.say(`${tr(lm.name)}. ${first}`, { interrupt: true });
    render();
  }
  function finish() {
    const n = tour.stops.length;
    toast(`${tr("That is the end of the tour. Thank you for following me!")} (${n} ${tr("stops")})`);
    if (typeof Sfx !== "undefined") Sfx.play("medal");
    end(true);
  }

  // ---- the little card at the top left
  function render() {
    if (!hud) return;
    if (!tour || tour.i < 0 || tour.i >= tour.stops.length) { hud.hidden = true; return; }
    const lm = tour.stops[tour.i], el = (tag, text) => { const e = document.createElement(tag); e.textContent = text; return e; };
    const head = el("strong", `🧭 ${tr(tour.title)} · ${tr("Stop")} ${tour.i + 1} / ${tour.stops.length}`);
    const line = el("p", tour.state === "stop" ? `${tr("We are at")} ${tr(lm.name)}. ${tr("Look around; the card has the story.")}` : tour.waiting ? tr("I will wait for you!") : tour.says || "");
    const skip = el("button", tr("Next stop ▶")), stop = el("button", tr("End the tour"));
    skip.type = stop.type = "button";
    skip.addEventListener("click", () => {                                                          // (on the way: the guide is at the stop at once and you walk there; at the stop: on to the next one)
      if (!tour) return;
      if (tour.state === "lead") { guide.x = lm.stand[0]; guide.z = lm.stand[1]; tour.state = "stop"; tour.t = 0; tour.waiting = false; render(); } else next();
    });
    stop.addEventListener("click", () => end());
    const row = document.createElement("div"); row.append(skip, stop);
    hud.replaceChildren(head, line, row); hud.hidden = false;
    hud.dataset.key = `${tour.i}${tour.state}${tour.waiting ? 1 : 0}`;
  }

  function update(dt) {
    if (!tour || !guide || typeof started === "undefined" || !started) return;
    if (tour.city !== city || tour.era !== era) { end(); return; }
    guide.ph += dt;
    const d = Math.hypot(player.x - guide.x, player.z - guide.z), lm = tour.stops[tour.i], key = `${tour.i}${tour.state}${tour.waiting ? 1 : 0}`;
    if (mode !== "walk") { place(); return; }                                                         // (while you drive or fight the guide stands and waits)
    if (tour.state === "lead") {
      if (d > FAR && !tour.waiting) { tour.waiting = true; waitSay = 0; } else if (d < NEAR && tour.waiting) tour.waiting = false;
      if (tour.waiting) {
        guide.yaw = Math.atan2(-(player.x - guide.x), -(player.z - guide.z));
        waitSay -= dt; if (waitSay <= 0) { waitSay = 12; if (typeof Speech !== "undefined") Speech.say(guide, tr("Keep up!"), 3); }
      } else {
        const p = tour.path[tour.pi]; let dx = p.x - guide.x, dz = p.z - guide.z, dist = Math.hypot(dx, dz);
        const step = SPEED * dt;
        if (dist <= step + 0.05) { guide.x = p.x; guide.z = p.z; tour.pi++; if (tour.pi >= tour.path.length) { tour.state = "stop"; tour.t = 0; if (typeof Speech !== "undefined") Speech.say(guide, tr("We are here!"), 3); } }
        else { guide.x += dx / dist * step; guide.z += dz / dist * step; const ty = Math.atan2(-dx, -dz); let da = ty - guide.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); guide.yaw += da * Math.min(1, dt * 8); }
      }
    } else if (tour.state === "stop") {
      tour.t += dt;
      guide.yaw = Math.atan2(-(player.x - guide.x), -(player.z - guide.z));
      if (tour.t > STOP_MAX && d < NEAR) next();
    }
    const walking = tour.state === "lead" && !tour.waiting, u = guide.g.userData;
    u.body.rotation.z = walking ? Math.sin(guide.ph * 9) * 0.05 : 0; u.flag.rotation.y = Math.sin(guide.ph * 4) * 0.3;
    guide.g.position.y = groundAt(guide.x, guide.z) + (walking ? Math.abs(Math.sin(guide.ph * 9)) * 0.06 : 0);
    guide.g.position.x = guide.x; guide.g.position.z = guide.z; guide.g.rotation.y = guide.yaw;
    if (hud && hud.dataset.key !== key) render();
  }

  function build(sc) {
    scene = sc;
    hud = document.createElement("div"); hud.id = "tour-hud"; hud.hidden = true; document.body.appendChild(hud);
  }
  function bind() {
    const b = $t("btn-tour"); if (b) b.addEventListener("click", open);
  }
  return { build, bind, open, update, get active() { return !!tour; }, end };
})();
