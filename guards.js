"use strict";
// The city guards. Soldiers of the city watch walk their rounds in Rome and in Old Delhi (and police in the modern cities).
// Commit a crime near them (rob a house, knock people over) and your WANTED level goes up: when it is high enough, any guard
// who sees you shouts and chases you, and calls the others nearby. Get away (out of their sight for a while) and the level falls.
// Get caught and you pay a fine (100 denarii, or all you have) and spend a moment in the cells. If you are in the middle of a
// robbery, being caught by the guards ends it as caught. Depends on game.js, tax.js (Speech), robbery.js and car.js.

const Guards = (() => {
  const T = THREE;
  const CYLG = new T.CylinderGeometry(1, 1, 1, 10), CONEG = new T.ConeGeometry(1, 1, 8);
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const FINE = 100;
  const WATCH = 45, CATCH = 2.4, GIVE_UP = 100;                       // metres: how far they see you, how close to grab you, when they lose you
  // each city's rounds: lists of waypoints (the guards walk from one to the next, and so on)
  const ROUTES = {
    rome: [[[60, -14]], [[-30, 10]], [[300, 36]], [[150, 50]], [[50, 76]], [[-205, 108]], [[-235, 12]], [[200, -30]], [[240, 30]], [[-690, -60]], [[-480, -440]], [[30, -6], [80, -10]], [[180, 6], [260, 4]], [[30, 0], [150, 6], [250, 0], [310, 44]], [[170, 60], [250, -42], [150, -40], [50, 42]], [[-200, -10], [-150, -190], [-100, -60], [30, -8]], [[-205, 100], [-170, 70], [-200, 20], [-230, 0]], [[50, 78], [100, 70], [60, 100], [0, 60]], [[-480, -440], [-420, -360], [-300, -300], [-200, -200]], [[310, 44], [380, 80], [300, 100], [250, 60]], [[-290, 40], [-300, -20], [-330, -90], [-400, 20]]],
    delhi: [[[-48, -6]], [[-40, 24]], [[-100, 3]], [[-50, 58]], [[-140, 210]], [[-615, 38]], [[70, 18]], [[-215, 6]], [[-45, 0], [-200, 5], [-350, 8], [-500, 5]], [[-60, 45], [-50, 56], [-20, 30], [20, 8]], [[70, 20], [20, -30], [-40, -40], [-30, -10]], [[-140, 205], [-150, 120], [-110, 40], [-200, 10]], [[-615, 36], [-560, 4], [-450, 12], [-300, 20]], [[-420, 20], [-380, -8], [-250, 6], [-120, 12]]],
  };
  const guards = [];                // { g, city, route, wp, x, z, state: "walk" | "chase", ...}
  let scene = null, wanted = 0, lastSeen = 0, jailT = 0, hudT = 0, shoutT = 0, delhiMade = false;
  const $g = (id) => document.getElementById(id);

  function model(c, e) {
    const g = new T.Group(), police = e === "modern", delhi = c === "delhi";
    const body = new T.Mesh(CYLG, lam(police ? 0x2a3f6a : delhi ? 0x2f6b4a : 0x9a2a2a)); body.scale.set(0.38, 1.3, 0.38); body.position.y = 0.65; g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.23, 10, 8), lam(0xd8a77a)); head.position.y = 1.55; g.add(head);
    if (police) { const cap = new T.Mesh(CYLG, lam(0x1c2a4a)); cap.scale.set(0.26, 0.16, 0.26); cap.position.y = 1.78; g.add(cap); }
    else if (delhi) { const t = new T.Mesh(new T.SphereGeometry(0.27, 10, 8), lam(0xe8e4d6)); t.scale.set(1, 0.8, 1); t.position.y = 1.75; g.add(t); }
    else { const h = new T.Mesh(CYLG, lam(0x8a8d92)); h.scale.set(0.24, 0.24, 0.24); h.position.y = 1.78; g.add(h); const crest = new T.Mesh(new T.BoxGeometry(0.06, 0.2, 0.4), lam(0xb3262b)); crest.position.y = 1.98; g.add(crest); }
    if (!police) {
      const spear = new T.Mesh(CYLG, lam(0x6a4c2a)); spear.scale.set(0.03, 2.2, 0.03); spear.position.set(0.4, 1.1, 0); g.add(spear);
      const tip = new T.Mesh(CONEG, lam(0xb0b4ba)); tip.scale.set(0.07, 0.3, 0.07); tip.position.set(0.4, 2.3, 0); g.add(tip);
    } else { const stick = new T.Mesh(CYLG, lam(0x1a1a1a)); stick.scale.set(0.04, 0.6, 0.04); stick.position.set(0.4, 0.9, 0.1); g.add(stick); }
    const cloak = new T.Mesh(new T.BoxGeometry(0.62, 1.1, 0.07), lam(police ? 0x3a5a9a : delhi ? 0xd9a928 : 0xc0262b)); cloak.position.set(0, 1.0, 0.24); g.add(cloak);   // a bright cloak, so you can see them from afar
    const lantern = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), new T.MeshBasicMaterial({ color: police ? 0x9ad0ff : 0xffb347 })); lantern.position.set(-0.42, 1.0, -0.1); g.add(lantern);   // and a lantern that glows after dark
    g.traverse((m) => { m.castShadow = true; });
    g.scale.setScalar(1.12);
    return g;
  }

  function spawn(c, parent, offset) {
    const routes = ROUTES[c];
    routes.forEach((route, i) => {
      for (let k = 0; k < (c === "rome" ? 1 : 1); k++) {
        const [wx, wz] = route[0], g = model(c, "ancient"); parent.add(g);
        guards.push({ g, city: c, route: route.map(([x, z]) => [x + offset, z]), wp: route.length > 1 ? 1 : 0, x: wx + offset, z: wz, state: "walk", sp: 1.5 + (i % 3) * 0.2, stuck: 0, hold: 0, lost: 0, shout: 0, ph: Math.random() * 6 });
        guards[guards.length - 1].g.position.set(wx + offset, 0, wz);
      }
    });
  }

  const here = (c) => typeof city !== "undefined" && city === c;

  // the guards' look follows the era (soldiers, or police today)
  function setEra(modern) {
    for (const gd of guards) { const p = gd.g.parent; p.remove(gd.g); gd.g = model(gd.city, modern ? "modern" : "ancient"); p.add(gd.g); gd.g.position.set(gd.x, groundAt(gd.x, gd.z), gd.z); }
  }

  function build(sc) { scene = sc; spawn("rome", sc, 0); }
  function buildDelhi(parent) { if (delhiMade) return; delhiMade = true; spawn("delhi", parent, typeof DELHI_X !== "undefined" ? DELHI_X : 6000); setEra(typeof era !== "undefined" && era === "modern"); }

  // a crime: your wanted level goes up (100 is the most). The nearest guards hear of it at once.
  function crime(amount, why, at) {
    if (!started) return;
    wanted = Math.min(100, wanted + amount);
    if (wanted >= 35) { toast(`⭐ Wanted${why ? ` for ${why}` : ""}! The guards are after you.`); }
    if (amount >= 60) for (const gd of guards) if (gd.city === (typeof city !== "undefined" ? city : "rome") && Math.hypot(gd.x - (at ? at.x : player.x), gd.z - (at ? at.z : player.z)) < 160) gd.state = "chase";
    render();
  }

  function render() {
    const el = $g("wanted");
    if (!el) return;
    const stars = wanted >= 75 ? 3 : wanted >= 50 ? 2 : wanted >= 25 ? 1 : 0;
    el.textContent = stars ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)} Wanted: the guards are after you` : "";
    el.classList.toggle("show", stars > 0);
  }

  function moveTo(gd, tx, tz, sp, dt) {
    const dx = tx - gd.x, dz = tz - gd.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt);
    let nx = gd.x + (dx / d) * st, nz = gd.z + (dz / d) * st; const y = groundAt(gd.x, gd.z);
    if (blockedAt(nx, nz, y)) { if (!blockedAt(nx, gd.z, y)) nz = gd.z; else if (!blockedAt(gd.x, nz, y)) nx = gd.x; else { gd.stuck += dt; return d; } }
    gd.stuck = 0; gd.x = nx; gd.z = nz; gd.g.position.set(nx, groundAt(nx, nz), nz); gd.g.rotation.y = Math.atan2(dx, dz);
    return d;
  }

  function caught() {
    if (jailT > 0) return;
    // in the middle of a robbery the guards ending it is the robbery's own rule (lose 100 denarii to the owner)
    if (typeof Robbery !== "undefined" && Robbery.active && Robbery.role === "thief") { Robbery.guardsCaught(); wanted = 0; for (const g of guards) g.state = "walk"; render(); return; }
    jailT = 3.2;
    const fine = Math.min(FINE, Vitals.coins); Vitals.coins -= fine; wanted = 0;
    if (mode === "drive") Car.exit(true);
    Vitals.stopRest(); Nav.clear();
    $g("sleep").classList.add("on");
    toast(`The guards catch you! Fine: ${fine} denarii. You spend a while in the cells.`); Narrator.say(`The guards caught you. You pay a fine of ${fine} denarii.`, { interrupt: true });
    Sfx.play("oof");
    setTimeout(() => {
      const c = typeof city !== "undefined" ? city : "rome";
      if (c === "delhi") placeAt(DELHI_X - 40, 6, -Math.PI / 2); else placeAt(40, -12, Math.PI / 2);   // let out at the guardhouse by the Forum / the Lahori Gate
      $g("sleep").classList.remove("on");
      for (const g of guards) g.state = "walk";
      toast("You are let out. Behave yourself!"); render();
    }, 2600);
  }

  function update(dt) {
    if (!scene || typeof started === "undefined" || !started) return;
    jailT = Math.max(0, jailT - dt);
    const c = typeof city !== "undefined" ? city : "rome", live = (mode === "walk" || mode === "drive") && jailT <= 0;
    let nearest = 1e9, anyChasing = false;
    for (const gd of guards) {
      gd.g.visible = gd.city === c;
      if (gd.city !== c) continue;
      const d = Math.hypot(player.x - gd.x, player.z - gd.z);
      nearest = Math.min(nearest, d);
      // a guard who sees a wanted person gives chase
      if (live && gd.state === "walk" && wanted >= 35 && d < WATCH) { gd.state = "chase"; gd.shout = 0; }
      if (gd.state === "chase") {
        if (!live) { gd.state = "walk"; continue; }
        anyChasing = true;
        gd.shout -= dt;
        if (gd.shout <= 0 && d < 40) { gd.shout = 6 + Math.random() * 4; const lines = typeof era !== "undefined" && era === "modern" ? ["Police! Stop!", "Stop right there!"] : c === "delhi" ? ["Ruko!", "Pakdo usse!", "Stop, thief!"] : ["Halt!", "Stop in the name of Rome!", "Seize them!"];
          Speech.say({ x: gd.x, z: gd.z }, lines[Math.floor(Math.random() * lines.length)], 2.4); }
        const sp = 6.2 + Math.min(2.6, wanted / 40);                       // they run: faster the more wanted you are
        moveTo(gd, player.x, player.z, sp, dt);
        if (d < CATCH && !(mode === "drive" && Car.speed > 9)) { caught(); break; }
        if (d > GIVE_UP) gd.lost += dt; else gd.lost = 0;
        if (gd.lost > 8) { gd.state = "walk"; gd.lost = 0; }
        else for (const o of guards) if (o !== gd && o.city === c && o.state === "walk" && Math.hypot(o.x - gd.x, o.z - gd.z) < 70 && wanted >= 35) o.state = "chase";   // the call goes out
      } else {
        // on their rounds
        const [tx, tz] = gd.route[gd.wp];
        if (gd.hold > 0) { gd.hold -= dt; }
        else if (moveTo(gd, tx, tz, gd.sp, dt) < 2.5 || gd.stuck > 3) { gd.wp = (gd.wp + 1) % gd.route.length; gd.hold = 1 + Math.random() * 3; gd.stuck = 0; }
        if (!gd.hold) { gd.ph += dt * gd.sp * 2.4; gd.g.position.y = groundAt(gd.x, gd.z) + Math.abs(Math.sin(gd.ph)) * 0.05; }
      }
    }
    // the wanted level falls while nobody is chasing you
    if (live) { if (!anyChasing) wanted = Math.max(0, wanted - 5 * dt); else wanted = Math.max(0, wanted - 0.4 * dt); }
    hudT -= dt; if (hudT <= 0) { hudT = 0.5; render(); }
  }

  const nearest = () => Math.min(...guards.filter((g) => g.city === (typeof city !== "undefined" ? city : "rome")).map((g) => Math.hypot(g.x - player.x, g.z - player.z)));
  const positions = () => guards.filter((g) => g.city === (typeof city !== "undefined" ? city : "rome")).map((g) => ({ x: g.x, z: g.z, chase: g.state === "chase" }));
  return { build, buildDelhi, update, crime, positions, setEra, caught, nearest, count: () => guards.length, get wanted() { return wanted; }, set wanted(v) { wanted = v; render(); } };
})();
