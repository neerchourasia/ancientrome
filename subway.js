"use strict";
// The metro: a line under modern Rome and one under modern Delhi. Walk up to a blue METRO sign (a street entrance), press F to go down to the platform, then either
//   F: drive the train yourself (W power, S brake, Space emergency brake: it runs on rails, so you cannot steer, only stop in the stations), or
//   R: ride it as a passenger for a 10 denarii ticket: it drives itself, stops at every station for a few seconds and turns round at the ends.
// You get off with X (or Esc) when the train is standing at a station, and come up at that station's street entrance.
//
// The underground halls are built 300 m up, out past the edge of each city, so nothing in the streets can ever touch them; the physics there is the ordinary
// walkable floor and walls of physics.js. They only show while you are down there, and other players do not see you (you are underground).
// Depends on physics.js, car.js (the "metro" vehicle), vitals.js and the globals of game.js. Rome and Delhi have a line; Cancun does not.

const Subway = (() => {
  const T = THREE;
  const Y0 = 300, WALL = 7, HALF = 6;                       // the hall's floor height, its height and half its width
  const FARE = 10, REWARD = 25, CRUISE = 20, DWELL = 9;     // the passenger ticket, the driver's reward for a good stop, the autopilot's speed and how long it waits at a station
  const basic = (c) => new T.MeshBasicMaterial({ color: c });

  // Each line runs along one axis (`s` is the position along it). `hint` is where to look for the street entrance; the first Delhi station already has its glass entrance.
  const LINES = {
    rome: {
      name: "Linea B", color: 0x1d6fb8, axis: "x", hall: () => BOUNDS.maxZ + 180,
      stations: [{ n: "Colosseo", s: 430, hint: [400, 110] }, { n: "Foro", s: 30, hint: [20, -40] }, { n: "Campidoglio", s: -235, hint: [-235, 20] }, { n: "Ercole Vincitore", s: -430, hint: [-430, 20] }],
    },
    delhi: {
      name: "Yellow Line", color: 0xf2c21b, axis: "z", hall: () => BOUNDS.maxX + 180,
      stations: [{ n: "Chandni Chowk", s: 30, spot: () => [DELHI_X - 212, 24] }, { n: "Connaught Place", s: 480, hint: [DELHI_X - 200, 480] }, { n: "Central Secretariat", s: 900, hint: [DELHI_X - 230, 900] }],
    },
  };
  for (const L of Object.values(LINES)) L.stations.sort((a, b) => a.s - b.s);

  const built = {};                                        // city -> { group (the hall), entrances (the street signs) }
  let under = false, lineKey = "", auto = false, dir = 1, dwell = 0, since = 0, lastRewarded = -1, hudEl = null, serving = null;   // serving: the station the autopilot is standing at (or has just left)

  const line = () => LINES[lineKey || city] || null;
  const hallPos = (L, s, t) => (L.axis === "x" ? [s, L.hall() + t] : [L.hall() + t, s]);   // a point of the hall: s along the line, t across it
  const stationAt = (L, s, within) => { let best = -1, bd = within; L.stations.forEach((st, i) => { const d = Math.abs(st.s - s); if (d < bd) { bd = d; best = i; } }); return best; };
  const along = (L, x, z) => (L.axis === "x" ? x : z);

  // ---------------------------------------------------------------- pictures for signs
  function label(text, sub, bg, fg) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 54px sans-serif"; g.fillText(text, 256, sub ? 48 : 64);
    if (sub) { g.font = "bold 28px sans-serif"; g.fillText(sub, 256, 100); }
    return new T.CanvasTexture(c);
  }

  // ---------------------------------------------------------------- the street entrances
  const freeAt = (x, z) => {
    const g0 = groundAt(x, z);
    for (let dx = -4; dx <= 4; dx += 4) for (let dz = -4; dz <= 4; dz += 4) { if (blockedAt(x + dx, z + dz, g0) || Math.abs(groundAt(x + dx, z + dz) - g0) > 0.3) return false; }
    return true;
  };
  function findSpot(hint) {
    if (freeAt(hint[0], hint[1])) return hint;
    for (let r = 6; r <= 120; r += 6) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, x = hint[0] + Math.cos(a) * r, z = hint[1] + Math.sin(a) * r; if (freeAt(x, z)) return [x, z]; }
    return hint;
  }
  function entrance(L, st, parent) {
    const [x, z] = st.spot ? st.spot() : findSpot(st.hint);
    st.ex = x; st.ez = z;
    if (st.spot) return;                                   // (Chandni Chowk: delhi.js has built its glass entrance there)
    const g = new T.Group(); g.position.set(x, groundAt(x, z), z);
    const grey = new T.MeshLambertMaterial({ color: 0x9a9a9a }), dark = new T.MeshLambertMaterial({ color: 0x1a1a1c }), blue = new T.MeshLambertMaterial({ color: L.color });
    const add = (w, h, d, m, px, py, pz) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.castShadow = true; g.add(b); return b; };
    add(6, 0.2, 8, grey, 0, 0.1, 0); add(3.2, 0.05, 5, dark, 0, 0.23, 0);                                              // the paving and the dark stairwell
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(0.25, 3.4, 0.25, grey, sx * 2.8, 1.8, sz * 3.8);           // four posts and a roof
    add(6.2, 0.3, 8.2, blue, 0, 3.6, 0);
    const tex = label("M  METRO", st.n, "#" + L.color.toString(16).padStart(6, "0"), L.color === 0xf2c21b ? "#1a1a1a" : "#ffffff");
    const face = new T.MeshBasicMaterial({ map: tex });
    const sign = new T.Mesh(new T.BoxGeometry(5, 1.25, 0.25), [dark, dark, dark, dark, face, face]); sign.position.set(0, 9, 0); g.add(sign);              // a tall sign you can see from far
    add(0.2, 7.5, 0.2, grey, 0, 4.5, 0);
    parent.add(g);
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: x - 3, x1: x + 3, z0: z - 4, z1: z + 4, c: "#2f6fd0" });
  }

  // ---------------------------------------------------------------- the underground hall
  function buildHall(L) {
    const g = new T.Group(); g.visible = false;
    const s0 = L.stations[0].s - 45, s1 = L.stations[L.stations.length - 1].s + 45, len = s1 - s0, mid = (s0 + s1) / 2;
    const hbox = (sa, sb, ta, tb, ya, yb, mat) => {                                       // a box between s = sa..sb along the line, t = ta..tb across it and heights ya..yb
      const [x0, z0] = hallPos(L, sa, ta), [x1, z1] = hallPos(L, sb, tb);
      const m = new T.Mesh(new T.BoxGeometry(Math.abs(x1 - x0) || 0.01, yb - ya, Math.abs(z1 - z0) || 0.01), mat);
      m.position.set((x0 + x1) / 2, Y0 + (ya + yb) / 2, (z0 + z1) / 2); g.add(m); return m;
    };
    const floor = basic(0x4a4d53), platform = basic(0x8f949b), track = basic(0x26282c), steel = basic(0xb9bfc7), wallM = basic(0xdcd6c4), band = basic(L.color), ceil = basic(0x2e3036), lamp = basic(0xfffbe6), yellow = basic(0xe8c21b), dk = basic(0x0b0b0d);
    hbox(s0, s1, -HALF - 0.4, HALF + 0.4, -0.6, 0, floor);                                // the floor
    hbox(s0, s1, -2.3, 2.3, 0, 0.03, track);                                              // the track bed
    for (const t of [-0.75, 0.75]) hbox(s0, s1, t - 0.05, t + 0.05, 0.03, 0.16, steel);   // two rails
    for (const sgn of [-1, 1]) { hbox(s0, s1, sgn * 2.3, sgn * 2.5, 0.03, 0.06, yellow); hbox(s0, s1, Math.min(sgn * 2.5, sgn * HALF), Math.max(sgn * 2.5, sgn * HALF), 0, 0.03, platform); }   // the platforms and their yellow edge lines
    for (const sgn of [-1, 1]) { hbox(s0, s1, sgn * HALF, sgn * (HALF + 0.4), 0, WALL, wallM); hbox(s0, s1, sgn * (HALF - 0.02), sgn * (HALF + 0.05), 1.7, 2.2, band); }   // the walls with a coloured band
    hbox(s0, s1, -HALF - 0.4, HALF + 0.4, WALL, WALL + 0.4, ceil);                        // the ceiling
    hbox(s0 - 0.5, s0, -HALF, HALF, 0, WALL, dk); hbox(s1, s1 + 0.5, -HALF, HALF, 0, WALL, dk);   // the dark tunnel ends
    for (let s = s0 + 6; s < s1; s += 12) hbox(s, s + 3, -1.2, 1.2, WALL - 0.12, WALL, lamp); // ceiling lights
    L.stations.forEach((st) => {
      for (let s = st.s - 18; s <= st.s + 18; s += 12) for (const sgn of [-1, 1]) hbox(s - 0.25, s + 0.25, sgn * 3.6, sgn * 4.1, 0, WALL, basic(0xc9c3b3));   // pillars
      const tex = label(st.n.toUpperCase(), L.name, "#" + L.color.toString(16).padStart(6, "0"), L.color === 0xf2c21b ? "#1a1a1a" : "#ffffff");
      const face = new T.MeshBasicMaterial({ map: tex });
      for (const sgn of [-1, 1]) for (const off of [-9, 9]) {
        const [px, pz] = hallPos(L, st.s + off, sgn * (HALF - 0.1)), sign = new T.Mesh(new T.PlaneGeometry(6, 1.5), face);
        sign.position.set(px, Y0 + 3.4, pz);
        if (L.axis === "x") sign.rotation.y = sgn > 0 ? Math.PI : 0; else sign.rotation.y = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(sign);
      }
    });
    scene.add(g);
    // the physics: one walkable floor and walls all round (no era, so a switch of era while down here cannot drop you)
    const [fa, fb] = [hallPos(L, s0, -HALF), hallPos(L, s1, HALF)];
    addPlatformBox(Math.min(fa[0], fb[0]), Math.max(fa[0], fb[0]), Math.min(fa[1], fb[1]), Math.max(fa[1], fb[1]), Y0);
    const wall = (sa, sb, ta, tb) => { const [a, b] = [hallPos(L, sa, ta), hallPos(L, sb, tb)]; addBlockerBox(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), Y0, Y0 + WALL + 1); };
    wall(s0 - 1, s1 + 1, HALF, HALF + 1); wall(s0 - 1, s1 + 1, -HALF - 1, -HALF); wall(s0 - 1, s0, -HALF - 1, HALF + 1); wall(s1, s1 + 1, -HALF - 1, HALF + 1);
    return g;
  }

  function ensure() {
    const L = LINES[city];
    if (!L || era !== "modern" || built[city]) return;
    const group = new T.Group(); scene.add(group);
    for (const st of L.stations) entrance(L, st, group);
    built[city] = { group, hall: buildHall(L) };
    toast(`${L.name}: look for the blue METRO signs.`);
  }

  // ---------------------------------------------------------------- going down, riding and coming up
  const entranceNear = () => {
    const L = LINES[city]; if (!L || !built[city] || era !== "modern" || under || mode !== "walk") return -1;
    return L.stations.findIndex((st) => st.ex !== undefined && Math.hypot(player.x - st.ex, player.z - st.ez) < (st.spot ? 12 : 6.5) && Math.abs(player.feet - groundAt(player.x, player.z)) < 2);
  };

  function down(i) {
    const L = LINES[city]; if (!L) return;
    const st = L.stations[i];
    lineKey = city; under = true; auto = false; since = 0; lastRewarded = -1;
    built[city].hall.visible = true;
    const [x, z] = hallPos(L, st.s, 3.6);
    player.x = x; player.z = z; player.feet = Y0; player.vx = player.vz = player.vy = 0;
    const mid = (L.stations[0].s + L.stations[L.stations.length - 1].s) / 2;
    player.yaw = faceYaw(L, st.s <= mid ? 1 : -1); player.pitch = -0.08;                  // looking along the platform, towards the middle of the line
    toast(`${st.n}. F: drive the train · R: ride it (${FARE} denarii) · U: back up to the street`);
  }

  function up(i) {
    const L = line(); if (!L) return;
    const st = L.stations[Math.max(0, i)];
    under = false; auto = false; lineKey = "";
    for (const b of Object.values(built)) b.hall.visible = false;
    const x = st.ex !== undefined ? st.ex : player.x, z = st.ez !== undefined ? st.ez : player.z;
    player.x = x; player.z = z; player.feet = groundAt(x, z); player.vx = player.vz = player.vy = 0;
  }

  function board(asPassenger) {
    const L = line(); if (!L || !under || mode !== "walk") return;
    const i = stationAt(L, along(L, player.x, player.z), 30); if (i < 0) return;
    if (asPassenger) {
      if (Vitals.coins < FARE) { toast(`A ticket costs ${FARE} denarii.`); return; }
      Vitals.coins -= FARE; Sfx.play("coin");
    }
    const st = L.stations[i], far = Math.abs(L.stations[0].s - st.s) > Math.abs(L.stations[L.stations.length - 1].s - st.s) ? -1 : 1;
    dir = far;                                                                              // toward the farther end of the line
    const [x, z] = hallPos(L, st.s, 0);
    player.x = x; player.z = z; player.yaw = faceYaw(L, dir);
    auto = !!asPassenger; dwell = auto ? 3 : 0; since = 0; lastRewarded = i; serving = st;
    Car.deploy("metro");
    if (Car.current !== "metro") { auto = false; return; }
    Car.nudge({ autopilot: auto });
    if (auto) toast("You are on the train. It stops at every station: press X to get off when it is standing still.");
  }
  const faceYaw = (L, d) => (L.axis === "x" ? (d > 0 ? -Math.PI / 2 : Math.PI / 2) : (d > 0 ? Math.PI : 0));

  // the player pressed a key while walking: F at an entrance or on a platform, R and U on a platform. true = used up.
  function key(k) {
    if (!started || mode !== "walk") return false;
    if (under) {
      if (k === "KeyF") { board(false); return true; }
      if (k === "KeyR") { board(true); return true; }
      if (k === "KeyU") { const L = line(); up(stationAt(L, along(L, player.x, player.z), 40)); return true; }
      return false;
    }
    if (k === "KeyF") { const i = entranceNear(); if (i >= 0) { down(i); return true; } }
    return false;
  }

  // Car asks whether you may get off, and calls afterExit once you have
  const canLeave = (c) => {
    const L = line(); if (!L) return true;
    return Math.abs(c.v) < 0.6 && stationAt(L, along(L, c.x, c.z), 16) >= 0;
  };
  function afterExit(c) {
    const L = line(); if (!L) return;
    const i = stationAt(L, along(L, c.x, c.z), 1e9);
    Car.stow();
    up(i);
    toast(`${L.stations[i].n}. You came up to the street.`);
  }

  // ---------------------------------------------------------------- the autopilot (passengers) and the driver's reward
  const ctl = new Set();
  function control(dt, keys) {
    if (!(mode === "drive" && Car.current === "metro" && under)) return keys;
    const L = line(); if (!L) return keys;
    const c = Car.state(), s = along(L, c.x, c.z);
    since += Math.abs(c.v) * dt;
    if (!auto) {                                                                           // you drive: a good stop in a station pays
      const i = stationAt(L, s, 6);
      if (i >= 0 && Math.abs(c.v) < 0.3 && since > 120 && i !== lastRewarded) { lastRewarded = i; since = 0; Vitals.coins += REWARD; Sfx.play("coin"); toast(`A smooth stop at ${L.stations[i].n}: +${REWARD} denarii`); }
      return keys;
    }
    ctl.clear();
    if (dwell > 0) {                                                                       // standing at a station with the doors open
      dwell -= dt; Car.nudge({ v: 0 });
      if (dwell <= 0) {
        if (!L.stations.some((st) => (st.s - s) * dir > 3)) { dir = -dir; Car.nudge({ yaw: faceYaw(L, dir) }); }      // the end of the line: turn round
        const nx = L.stations.filter((st) => (st.s - s) * dir > 3).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))[0];
        if (nx) toast(`Next stop: ${nx.n}`);
      }
      return ctl;
    }
    if (serving && Math.abs(serving.s - s) > 12) serving = null;                          // far enough away from the station it has just left
    const nx = L.stations.filter((st) => (st.s - s) * dir > 0.3 && st !== serving).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))[0];
    if (!nx) { dwell = 1; return ctl; }
    const d = (nx.s - s) * dir;
    const want = Math.min(CRUISE, Math.sqrt(2 * 1.6 * Math.max(0, d - 0.6)));
    const v = Math.max(0, c.v) + Math.max(-1.9 * dt, Math.min(2.2 * dt, want - Math.max(0, c.v)));
    Car.nudge({ v });
    if (d < 0.8 && v < 0.6) { dwell = DWELL; serving = nx; Car.nudge({ v: 0 }); toast(`${nx.n}. The doors are open: press X to get off, or wait to go on.`); }
    return ctl;
  }

  // ---------------------------------------------------------------- every frame
  function update() {
    if (typeof started === "undefined" || !started) return;
    ensure();
    // anything that took you out of the hall (a respawn, a journey to another city) ends being underground
    if (under && (player.feet < Y0 - 50 || !LINES[city] || era !== "modern")) { under = false; auto = false; lineKey = ""; for (const b of Object.values(built)) b.hall.visible = false; }
    if (!hudEl) hudEl = document.getElementById("metro-hud");
    const L = line(), on = under && mode === "drive" && Car.current === "metro" && L;
    if (hudEl) {
      hudEl.hidden = !on;
      if (on) {
        const c = Car.state(), s = along(L, c.x, c.z), fwd = L.axis === "x" ? -Math.sin(c.yaw) : -Math.cos(c.yaw), mv = Math.sign(c.v) * Math.sign(fwd);   // which way along the line it is moving (0: standing)
        const nx = L.stations.filter((st) => mv === 0 || (st.s - s) * mv > 0.5).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))[0];
        const here = stationAt(L, s, 16);
        hudEl.textContent = `${L.name} · ${Math.round(Math.abs(c.v) * 3.6)} km/h · ${here >= 0 && Math.abs(c.v) < 0.6 ? `at ${L.stations[here].n}: X to get off` : nx ? `next: ${nx.n}, ${Math.round(Math.abs(nx.s - s))} m` : ""}${auto ? " · autopilot" : ""}`;
      }
    }
  }

  function promptAt() {
    if (!started || mode !== "walk" || panelOpen) return "";
    if (under) return `F: drive the train · R: ride it (${FARE} denarii) · U: back up to the street`;
    const i = entranceNear();
    return i >= 0 ? `F: go down to the metro (${LINES[city].stations[i].n})` : "";
  }

  return { update, key, control, canLeave, afterExit, promptAt, get underground() { return under; }, get auto() { return auto; }, LINES };
})();
