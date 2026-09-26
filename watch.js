"use strict";
// Spectator mode: watch AI gladiators fight in the Colosseum or AI chariots race in the Circus Maximus.
// You stay in the stands and can still walk around; press C for a cinematic camera.

const inColosseum = (x, z) => ((x - 430) / 94) ** 2 + ((z - 30) / 78) ** 2 < 0.97 * 0.97;
const inCircusArea = (x, z) => Math.abs(x + 230) < 78 && z > 125 && z < 745;
const inCircusStands = (x, z) => inCircusArea(x, z) && !inCircusTrack(x, z);

const Watch = (() => {
  const NAMES = ["Priscus", "Verus", "Spiculus", "Flamma", "Tetraites", "Crixus", "Hilarus", "Marcus Attilius", "Celadus"];
  const LOOKS = [[0x8f3a2a, 0x2b5fa8], [0x2f6b8f, 0xd8b03a], [0x4b2f63, 0xb3262b], [0x3f6b3a, 0xeeeeee], [0x8a6a2b, 0x1f1f1f]];
  const NO_KEYS = new Set();
  const el = (id) => document.getElementById(id);

  // The day's programme, as at the real games: animal hunt in the morning, myth dramas at midday, gladiators in the afternoon.
  const PROGRAM = ["hunt", "orpheus", "icarus", "hercules", "duel"];
  const ACT_TITLES = {
    hunt: "Venatio: the animal hunt",
    orpheus: "Drama: Orpheus and the beasts",
    icarus: "Drama: Daedalus and Icarus",
    hercules: "Drama: Hercules and the Nemean Lion",
    duel: "Gladiator matches",
  };

  let scene, kind = null, chase = false, orbit = 0, pause = 0, msgTimer;
  let bout = null, boutCount = 0, actIdx = 0, actPause = 0, duelBouts = 0;

  function init(sc) { scene = sc; }

  function msg(text, ms = 2600) {
    Narrator.say(text);
    const m = el("center-msg");
    m.textContent = text;
    m.classList.add("show");
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => m.classList.remove("show"), ms);
  }

  // ---------- start / stop ----------

  function start(k) {
    if (kind) return;
    kind = k; chase = false; pause = 0; boutCount = 0;
    mode = "watch";
    closePanels();
    Crowd.setCheer(true);
    el("watch-keys").classList.add("show");
    if (k === "duel") {
      if (!inColosseum(player.x, player.z) || inArena(player.x, player.z)) placeAt(430, 80, 0); // south seats, facing the arena
      el("duel-hud").classList.add("show");
      startAct(0);
    } else {
      if (!inCircusStands(player.x, player.z)) placeAt(-166, 430, Math.PI / 2);
      Race.start({ watch: true });
    }
    player.pitch = -0.18;
  }

  function stop() {
    if (!kind) return;
    Narrator.stop();
    if (Race.active) Race.stop();
    clearBout();
    Show.clear();
    el("subtitle").textContent = "";
    kind = null; chase = false; mode = "walk";
    el("duel-hud").classList.remove("show");
    el("watch-keys").classList.remove("show");
    el("center-msg").classList.remove("show");
    Crowd.setCheer(false);
    camera.fov = 70; camera.updateProjectionMatrix();
  }

  // ---------- the programme ----------

  function startAct(i) {
    clearBout();
    Show.clear();
    actIdx = ((i % PROGRAM.length) + PROGRAM.length) % PROGRAM.length;
    actPause = 0;
    const name = PROGRAM[actIdx];
    el("act-title").textContent = ACT_TITLES[name];
    el("act-step").textContent = `Act ${actIdx + 1} of ${PROGRAM.length}`;
    el("duel-bars").style.display = name === "duel" ? "block" : "none";
    el("subtitle").textContent = "";
    if (name === "duel") { duelBouts = 0; boutCount = 0; newBout(); }
    else { Show.start(name); msg(ACT_TITLES[name], 2600); }
  }

  const nextAct = () => { if (kind === "duel") startAct(actIdx + 1); };
  const setAct = (i) => { if (kind === "duel") startAct(i); };

  function toggleChase() {
    chase = !chase;
    if (!chase) { camera.fov = 70; camera.updateProjectionMatrix(); }
    msg(chase ? "Cinematic camera" : "Stands view", 1200);
  }

  // ---------- gladiator match ----------

  function makeFighter(name, x, z, look) {
    const def = {
      name, hp: 100, dmg: 12 + Math.random() * 5, speed: 3.2 + Math.random() * 0.6, windup: 0.55 + Math.random() * 0.2,
      recover: 0.8 + Math.random() * 0.2, blockP: 0.25, poise: 0.3, color: look[0], plume: look[1],
    };
    const mesh = Fight.makeFoe(def);
    mesh.g.position.set(x, 0, z);
    scene.add(mesh.g);
    return { def, mesh, hp: 100, x, z, state: "approach", t: 0.8 + Math.random() * 0.6, blockT: 0, flash: 0, swing: -1, yield: false, winner: false };
  }

  function newBout() {
    clearBout();
    const first = boutCount++ === 0;
    let n1 = first ? "Priscus" : NAMES[Math.floor(Math.random() * NAMES.length)], n2 = first ? "Verus" : n1;
    while (n2 === n1) n2 = NAMES[Math.floor(Math.random() * NAMES.length)];
    const i = Math.floor(Math.random() * LOOKS.length);
    const j = (i + 1 + Math.floor(Math.random() * (LOOKS.length - 1))) % LOOKS.length;
    bout = { a: makeFighter(n1, ARENA.cx - 14, ARENA.cz, LOOKS[i]), b: makeFighter(n2, ARENA.cx + 14, ARENA.cz, LOOKS[j]), phase: "intro", t: 2.5, draw: first };
    msg(`${n1} vs ${n2}`, 2400);
  }

  function clearBout() {
    if (!bout) return;
    scene.remove(bout.a.mesh.g); scene.remove(bout.b.mesh.g);
    bout = null;
  }

  function clampArena(o) {
    const e = ((o.x - ARENA.cx) / ARENA.ax) ** 2 + ((o.z - ARENA.cz) / ARENA.az) ** 2;
    if (e > 1) { const k = 1 / Math.sqrt(e); o.x = ARENA.cx + (o.x - ARENA.cx) * k; o.z = ARENA.cz + (o.z - ARENA.cz) * k; }
  }

  function strike(f, o, dist) {
    if (dist > 3.1) return;
    let dmg = f.def.dmg * (0.85 + Math.random() * 0.3);
    if (o.blockT > 0) { dmg *= 0.15; f.state = "stagger"; f.t = 0.45; }
    else { o.flash = 0.18; if (o.state !== "windup" || Math.random() >= o.def.poise) { o.state = "stagger"; o.t = 0.35; } }
    o.hp -= dmg;
  }

  function updateFighter(f, o, dt) {
    const dx = o.x - f.x, dz = o.z - f.z, dist = Math.hypot(dx, dz) || 0.01, m = f.mesh, def = f.def;
    f.flash -= dt;
    f.blockT = Math.max(0, f.blockT - dt);
    m.mats[0].emissive.setHex(f.flash > 0 ? 0x771111 : f.state === "windup" ? 0x553300 : 0x000000);
    m.g.rotation.y = Math.atan2(dx, dz);

    if (f.yield || f.winner) {
      const kneel = f.yield ? -0.35 : 0;
      m.g.position.y += (kneel - m.g.position.y) * Math.min(1, dt * 5);
      m.arm.rotation.x += (2.8 - m.arm.rotation.x) * Math.min(1, dt * 6);
      return;
    }
    if (bout.phase === "fight") {
      f.t -= dt;
      const step = (dir, speed) => { f.x += (dx / dist) * dir * speed * dt; f.z += (dz / dist) * dir * speed * dt; };
      if (f.state === "approach") {
        if (dist > 2.4) step(1, def.speed);
        else if (f.t <= 0) {
          f.state = "windup"; f.t = def.windup;
          if ((o.state === "approach" || o.state === "recover") && Math.random() < o.def.blockP) o.blockT = def.windup + 0.25;
        }
      } else if (f.state === "windup") {
        if (f.t <= 0) { strike(f, o, dist); if (f.state === "windup") { f.state = "recover"; f.t = def.recover; f.swing = 0; } }
      } else if (f.state === "recover") {
        if (dist < 3.6) step(-1, 1.6);
        if (f.t <= 0) { f.state = "approach"; f.t = 0.15 + Math.random() * 0.6; }
      } else if (f.state === "stagger") {
        step(-1, 0.6);
        if (f.t <= 0) { f.state = "approach"; f.t = 0.3; }
      }
    }
    if (dist < 1.4) { f.x -= (dx / dist) * (1.4 - dist) * 0.5; f.z -= (dz / dist) * (1.4 - dist) * 0.5; }
    clampArena(f);
    m.g.position.x = f.x; m.g.position.z = f.z;

    let a = -0.5;
    if (f.state === "windup") a = -0.5 + 2.9 * (1 - f.t / def.windup);
    else if (f.swing >= 0) { f.swing += dt / 0.22; a = 2.4 - Math.min(1, f.swing) * 3.7; if (f.swing >= 1) f.swing = -1; }
    m.arm.rotation.x += (a - m.arm.rotation.x) * Math.min(1, dt * 22);
    const sz = f.blockT > 0 ? 0.55 : 0.2, sx = f.blockT > 0 ? -0.15 : -0.52;
    m.shieldG.position.z += (sz - m.shieldG.position.z) * Math.min(1, dt * 14);
    m.shieldG.position.x += (sx - m.shieldG.position.x) * Math.min(1, dt * 14);
  }

  function updateDuel(dt) {
    if (!bout) return;
    bout.t -= dt;
    if (bout.phase === "intro" && bout.t <= 0) { bout.phase = "fight"; msg("Fight!", 900); }
    const { a, b } = bout;
    updateFighter(a, b, dt);
    updateFighter(b, a, dt);

    if (bout.phase === "fight" && (a.hp <= 28 || b.hp <= 28)) {
      bout.phase = "verdict"; bout.t = 5;
      Sfx.play("cheer");
      a.state = b.state = "idle";
      if (bout.draw) {
        a.yield = b.yield = true;
        msg("A draw! Like Priscus and Verus at the Colosseum's opening in 80 AD, both are awarded the rudis.", 4800);
      } else {
        const loser = a.hp < b.hp ? a : b, winner = loser === a ? b : a;
        loser.yield = true; winner.winner = true;
        msg(Math.random() < 0.7 ? `${loser.def.name} yields. The crowd calls for mercy: missio!` : `${winner.def.name} wins. The editor upholds the result.`, 4800);
      }
    }
    if (bout.phase === "verdict" && bout.t <= 0) { if (++duelBouts >= 2) { startAct(actIdx + 1); return; } newBout(); }

    if (bout) {
      el("da-name").textContent = bout.a.def.name;
      el("db-name").textContent = bout.b.def.name;
      el("da-fill").style.width = `${Math.max(0, bout.a.hp)}%`;
      el("db-fill").style.width = `${Math.max(0, bout.b.hp)}%`;
    }
  }

  // ---------- per-frame ----------

  function update(dt) {
    if (!kind) return;
    if (kind === "duel") {
      if (PROGRAM[actIdx] === "duel") updateDuel(dt);
      else {
        const r = Show.update(dt);
        el("subtitle").textContent = Show.subtitle;
        Narrator.say(Show.subtitle);
        if (r.done) { actPause += dt; if (actPause > 2.5) startAct(actIdx + 1); }
      }
      return;
    }
    if (Race.active) { Race.update(dt, NO_KEYS); pause = 4; }
    else { pause -= dt; if (pause <= 0) Race.start({ watch: true }); }
  }

  // Returns true when the cinematic camera drove the view this frame.
  function camera_(cam, dt) {
    if (!kind || !chase) return false;
    if (kind === "race") {
      if (!Race.active) return false;
      Race.camera(cam, dt, Race.leader());
      return true;
    }
    let mx, mz, radius = 11, height = 3.6;
    if (PROGRAM[actIdx] === "duel") {
      if (!bout) return false;
      mx = (bout.a.x + bout.b.x) / 2; mz = (bout.a.z + bout.b.z) / 2;
    } else {
      const f = Show.focus(); mx = f.x; mz = f.z; radius = 16; height = 5.5;
    }
    orbit += dt * 0.28;
    cam.position.set(mx + Math.cos(orbit) * radius, height, mz + Math.sin(orbit) * radius);
    cam.lookAt(mx, 1.3, mz);
    return true;
  }

  return { init, start, stop, update, toggleChase, nextAct, setAct, camera: camera_, get active() { return !!kind; } };
})();
