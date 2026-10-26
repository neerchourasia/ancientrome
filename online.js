"use strict";
// Playing real people: the browser side of server/server.py.
//
// The browser sends only what the player does (where they are, a swing, a block, race progress); the SERVER decides
// health, damage, hits and who finished first, and sends the result back. So nothing here can be used to cheat.
// Depends on game.js (mode, player, createFigure, ...), race.js and account.js at run time.

const Online = (() => {
  const cfg = window.ROME_CONFIG || {};
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const URL = isLocal ? "ws://localhost:8765/play" : (cfg.serverUrl || ""); // on your own computer the test server is used
  const $o = (id) => document.getElementById(id);

  let ws = null, welcome = null, helloKey = "", waiting = false, pingT = null, lobbyMsg = "";
  let duel = null;
  let raceSendT = 0;

  const send = (obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  const accountToken = () => (typeof Account !== "undefined" ? Account.token() : null);

  // ------------------------------------------------------------------ connection

  function connect() {
    if (!URL) return;
    const key = [accountToken(), Character.name, Character.cls, JSON.stringify(Character.look), Market.worn.join(), Market.pet].join("|");
    if (ws && ws.readyState <= 1) {
      if (key === helloKey || duel || waiting) return;   // fine as it is
      ws.close();                                         // you logged in or changed character: connect again
    }
    helloKey = key; welcome = null; setMsg("Connecting to the game server...");
    let sock;
    try { sock = new WebSocket(URL); } catch (e) { setMsg("Can't reach the game server."); return; }
    ws = sock;
    sock.onopen = () => {
      send({ t: "hello", token: accountToken(), name: Character.name || "Player", cls: Character.cls, look: { ...Character.look, acc: Market.worn, pet: Market.pet, weapon: Market.weapon }, rank: Social.rank, friends: Social.helloFriends() });
      clearInterval(pingT); pingT = setInterval(() => send({ t: "ping" }), 25000);
    };
    sock.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch (err) { return; } if (m && typeof m === "object") onMessage(m); };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null; welcome = null; waiting = false; clearInterval(pingT); clearPeers();
      if (duel) endFight("The connection to the game server was lost.", "Disconnected");
      else if (Race.isOnline()) Race.stop();
      else if (Naval.isOnline()) Naval.stop();
      setMsg(URL ? "Disconnected from the game server." : "");
      refreshLobby();
    };
    sock.onerror = () => setMsg("Can't reach the game server. It may be switched off.");
  }

  function setMsg(t) { lobbyMsg = t; refreshLobby(); }

  function onMessage(m) {
    switch (m.t) {
      case "welcome": welcome = m; Admin.server = !!m.admin; if (m.rank) Social.setRank(m.rank); Festival.sync(); setMsg(""); break;
      case "fest": case "diyas": Festival.remote(m); break;
      case "shoved": gotShoved(m); break;
      case "shove_ok": toast(`You shoved ${m.name}`); noteKnock(); break;
      case "shove_no": toast(m.msg || "You could not shove them"); break;
      case "shove_fx": { const p = peers.get(m.id); if (p) p.down = 1.4; break; }
      case "fr_invite": case "fr_state": case "fr_in": case "fr_added": case "fr_removed": case "fr_presence": case "fr_online": case "fr_msg": case "dm": case "top": Social.on(m); break;
      case "chat": Chat.add(m); break;
      case "chat_log": Chat.history(m.m); break;
      case "adminwho": Admin.showOnline(m.who || []); break;
      case "kicked": Chat.add({ sys: 1, text: `An admin kicked you for ${m.minutes || 10} minutes.` }); break;
      case "queued": waiting = true; setMsg(`Looking for ${m.mode === "duel" ? "an opponent of your level" : m.mode === "coop" ? "teammates" : m.mode === "naval" ? "other captains" : "racers"}... (${m.waiting} waiting)`); break;
      case "left": waiting = false; setMsg(""); break;
      case "error": waiting = false; setMsg(m.msg || "Something went wrong."); if (m.code === "name") { toast(m.msg || "That name is not allowed."); if (mode === "walk" && typeof openCreator === "function") openCreator(false); } break;
      case "match": waiting = false; setMsg(""); if (m.mode === "race") Race.startOnline(m); else if (m.mode === "naval") Naval.startOnline(m); else startFight(m); break;
      case "duel": case "coop": onFight(m); break;
      case "world": onWorld(m); break;
      case "houses": Robbery.setHouses(m.h, m.mine); break;
      case "heist_no": toast(m.msg || "You cannot rob that house."); break;
      case "heist": Robbery.begin(m); break;
      case "heistpos": Robbery.pos(m); break;
      case "heist_end": Robbery.end(m); break;
      case "race": Race.onlineState(m); break;
      case "naval": Naval.onlineState(m); break;
      case "end": if ((m.mode === "race" || (m.mode === "naval" && !m.coop) || (m.mode === "duel" && !duel)) && m.rank && Account.loggedIn) rankNote(m.rank); if (m.mode === "duel" && !duel) break; if (m.mode === "race") Race.onlineEnd(m); else if (m.mode === "naval") Naval.onlineEnd(m); else onFightEnd(m); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ the lobby

  function refreshLobby() {
    const box = $o("online");
    if (!box) return;
    const ready = !!welcome && !waiting;
    $o("on-status").textContent = !URL ? "Online play is not switched on yet." : (lobbyMsg || (welcome ? (waiting ? "" : "Pick a game.") : "Connecting..."));
    $o("on-duel").disabled = !ready;
    if (typeof Social !== "undefined") Social.render();
    $o("on-race").disabled = !ready;
    $o("on-coop").disabled = !ready;
    $o("on-naval").disabled = !ready;
    $o("on-cancel").hidden = !waiting;
    $o("on-botrow").hidden = !(welcome && welcome.bots);
  }

  function openLobby() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    if (city !== "rome") { toast("The online games are held in Rome. Press B to travel back."); return; }
    openPanel("#online");
    fillShips();
    connect();
    refreshLobby();
  }

  function queue(game) {
    if (!welcome) { connect(); return; }
    send({ t: "queue", mode: game, bot: $o("on-bot").checked, ship: game === "naval" ? Shipyard.onlineDesign() : undefined });
  }

  // the ship picker for the naval battle: your saved ships (you build them in the shipyard in the arena, not here)
  function fillShips() {
    const sel = $o("on-ship");
    sel.replaceChildren(...Shipyard.list().map((s) => { const o = document.createElement("option"); o.value = s.i; o.textContent = s.label; return o; }));
    sel.value = Shipyard.sel;
  }

  function leaveQueue() { send({ t: "leave" }); waiting = false; setMsg(""); }

  // ------------------------------------------------------------------ the open world: other players walking about

  // Whenever you are just walking (not in a game), the server tells you who is near you in the same city, and you see
  // them as named characters. They are only for show: nobody can touch anybody.
  const peers = new Map();
  let walkSendT = 0;

  function clearPeers() { for (const p of peers.values()) { if (p.fig.g.parent) p.fig.g.parent.remove(p.fig.g); if (p.pet && p.pet.g.parent) p.pet.g.parent.remove(p.pet.g); dropVehicles(p); } peers.clear(); peerCount(); }

  function peerCount() {
    const e = $o("v-peers");
    if (e) e.textContent = peers.size ? `👥 ${peers.size} other player${peers.size === 1 ? "" : "s"} nearby` : "";
  }

  function onWorld(m) {
    for (const [id, name, cls, look] of m.i || []) {
      if (peers.has(id)) continue;
      const fig = createFigure();
      paintFigure(fig.mats, look || {});
      applyAccessories(fig, look && look.acc);
      fig.g.add(label(String(name || "Player"), "#ffe9a8"));
      fig.g.visible = false;
      scene.add(fig.g);
      const pet = look && Pets.make(look.pet);
      if (pet) { pet.g.visible = false; scene.add(pet.g); pet.kind = look.pet; pet.x = null; pet.a = Math.random() * 6; }
      peers.set(id, { id, fig, pet, name, x: null, z: null, tx: 0, tz: 0, yaw: 0, tyaw: 0, spd: 0, ph: 0 });
      toast(`${name || "A player"} is nearby`);
    }
    for (const [id, x, z, yaw, spd, veh, park, alt, roll] of m.p || []) {
      const p = peers.get(id);
      if (!p) continue;
      p.tx = x; p.tz = z; p.tyaw = yaw; p.spd = spd; p.veh = veh || null; p.parkAt = park || null; p.talt = alt || 0; p.troll = roll || 0;
      if (p.alt === undefined) { p.alt = p.talt; p.roll = p.troll; }
      if (p.x === null) { p.x = x; p.z = z; p.yaw = yaw; }
    }
    for (const id of m.g || []) {
      const p = peers.get(id);
      if (p) { scene.remove(p.fig.g); if (p.pet) scene.remove(p.pet.g); dropVehicles(p); peers.delete(id); }
    }
    peerCount();
  }

  // every frame: glide the other players to where they are, with a walking swing
  function peersUpdate(dt) {
    const show = mode === "walk" || mode === "drive" || mode === "watch";
    for (const p of peers.values()) {
      if (p.x === null) continue;
      const k = Math.min(1, dt * 8);
      p.x += (p.tx - p.x) * k; p.z += (p.tz - p.z) * k;
      let dy = p.tyaw - p.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      p.yaw += dy * k;
      const g = p.fig.g;
      g.visible = show;
      g.position.set(p.x, groundAt(p.x, p.z), p.z);
      g.rotation.y = p.yaw;
      if (p.down > 0) { p.down -= dt; g.rotation.x = 1.35 * Math.min(1, Math.max(0, p.down) / 0.35); } else if (g.rotation.x) g.rotation.x = 0;   // a player who was shoved lies on the ground for a moment
      p.ph += dt * (p.spd / 5.5) * 6.2;
      const sw = p.spd > 0.3 ? Math.sin(p.ph) * Math.min(1, p.spd / 8.5) * 0.7 : 0, a = p.fig.parts;
      a.armL.rotation.x = sw; a.armR.rotation.x = -sw; a.legL.rotation.x = -sw; a.legR.rotation.x = sw;
      vehicleUpdate(p, dt, show);
      if (p.pet) petUpdate(p, dt, show && !p.vm);
    }
  }

  // Another player shoved you: you are pushed back a couple of steps and stumble (no damage)
  function gotShoved(m) {
    if (mode !== "walk") return;
    const nx = player.x + (m.dx || 0) * 2.2, nz = player.z + (m.dz || 0) * 2.2;
    if (canMove(player.x, player.z, nx, nz)) { player.x = nx; player.z = nz; }
    player.vx = player.vz = 0; player.stun = Math.max(player.stun || 0, 0.8); player.shake = Math.max(player.shake || 0, 0.6);
    Sfx.play("oof");
    toast(`${m.by || "Someone"} shoved you!`);
  }
  function shovePeer(id) { send({ t: "shove", to: id }); }

  // the vehicle they are in (they sit in it, or are hidden inside a closed car) and the one they left parked
  function dropVehicles(p) {
    if (p.vm) { scene.remove(p.vm); p.vm = null; }
    if (p.pm) { scene.remove(p.pm); p.pm = null; }
    p.vkind = p.pkind = null;
  }

  const SEAT = { scooter: 0.45, rickshaw: 0.55, oxcart: 1.0, elephant: 4.2 };       // how high the rider sits; closed cars hide them
  function vehicleUpdate(p, dt, show) {
    if ((p.veh || null) !== (p.vkind || null)) {
      if (p.vm) { scene.remove(p.vm); p.vm = null; }
      p.vkind = p.veh || null;
      if (p.veh) { p.vm = Car.model(p.veh); scene.add(p.vm); }
    }
    const riding = !!p.vm;
    if (riding) {
      const g = p.vm, seat = SEAT[p.veh];
      g.visible = show;
      p.alt = (p.alt || 0) + ((p.talt || 0) - (p.alt || 0)) * Math.min(1, dt * 6); p.roll = (p.roll || 0) + ((p.troll || 0) - (p.roll || 0)) * Math.min(1, dt * 6);   // an aircraft is drawn up in the air, leaning into its turns
      g.position.set(p.x, groundAt(p.x, p.z) + p.alt, p.z);
      g.rotation.order = "YXZ"; g.rotation.set(0, p.yaw, p.roll);
      for (const r of g.userData.rotors || []) r.o.rotation[r.axis] += r.s * dt;                                      // helicopter and propeller blades turn
      if (g.userData.prop) g.userData.prop.rotation.z += 40 * dt;
      p.fig.g.visible = show && seat !== undefined;
      if (seat !== undefined) p.fig.g.position.y += seat;
      for (const w of g.userData.wheels || []) w.rotation.x += (p.spd * dt) / 0.34;
      p.vph = (p.vph || 0) + p.spd * dt * 1.1;
      (g.userData.legs || []).forEach((l, i) => { l.rotation.x = Math.sin(p.vph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 * Math.min(1, p.spd / 2); });
    }
    const pk = p.parkAt;
    if (pk && (!p.pm || p.pkind !== pk[0])) { if (p.pm) scene.remove(p.pm); p.pkind = pk[0]; p.pm = Car.model(pk[0]); scene.add(p.pm); }
    if (!pk && p.pm) { scene.remove(p.pm); p.pm = null; p.pkind = null; }
    if (p.pm) { p.pm.visible = show; p.pm.position.set(pk[1], groundAt(pk[1], pk[2]), pk[2]); p.pm.rotation.y = pk[3]; }
  }

  // their companion: a hound trots behind them, an eagle circles above (it follows them, so nothing is sent for it)
  function petUpdate(p, dt, show) {
    const pet = p.pet, g = pet.g, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = -fz, rz = fx;
    g.visible = show;
    pet.t = (pet.t || 0) + dt;
    if (pet.fly) {
      pet.a += dt * pet.fly.rate;
      g.position.set(p.x + Math.cos(pet.a) * pet.fly.r, groundAt(p.x, p.z) + pet.fly.h + Math.sin(pet.t * 1.6) * 0.3, p.z + Math.sin(pet.a) * pet.fly.r);
      g.rotation.y = -pet.a + Math.PI;
      const flap = Math.sin(pet.t * pet.fly.flap) * 0.55;
      pet.wings[0].rotation.z = flap; pet.wings[1].rotation.z = -flap;
      return;
    }
    const tx = p.x - fx * 2 + rx * 1.1, tz = p.z - fz * 2 + rz * 1.1;
    if (pet.x === null) { pet.x = tx; pet.z = tz; pet.yaw = p.yaw; }
    const dx = tx - pet.x, dz = tz - pet.z, d = Math.hypot(dx, dz);
    let moved = 0;
    if (d > 0.25) { const step = Math.min(d, Math.min(9, d * 3.2) * dt); pet.x += (dx / d) * step; pet.z += (dz / d) * step; moved = step; }
    if (d > 28) { pet.x = tx; pet.z = tz; }
    const speed = moved / Math.max(dt, 0.001);
    const want = speed > 0.6 ? Math.atan2(-dx, -dz) : p.yaw;
    let dy = want - pet.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    pet.yaw += dy * Math.min(1, dt * 8);
    g.position.set(pet.x, groundAt(pet.x, pet.z), pet.z);
    g.rotation.y = pet.yaw;
    const sw = Math.sin(pet.t * Math.min(speed, 9) * 1.9) * 0.8 * Math.min(1, speed / 2.5);
    pet.legs.forEach((l, i) => { l.rotation.x = i === 0 || i === 3 ? sw : -sw; });
    pet.tail.rotation.y = Math.sin(pet.t * 9) * (speed < 0.6 ? 0.6 : 0.25);
  }

  // every 0.2 s while you walk: where you are (the server decides who can see you)
  // Is this name allowed? The game server checks (and asks an AI as well, when it has one); if it cannot be reached the name is let through here and checked when you connect
  async function checkName(name) {
    if (!URL) return { ok: true };
    const http = URL.replace(/^ws/, "http").replace(/\/play$/, ""), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(`${http}/name?n=${encodeURIComponent(name)}`, { signal: ctl.signal });
      return r.ok ? await r.json() : { ok: true };
    } catch (e) { return { ok: true }; } finally { clearTimeout(timer); }
  }

  function walkTick(dt) {
    walkSendT -= dt;
    if (walkSendT > 0) return;
    walkSendT = 0.2;
    if (!ws || ws.readyState !== 1 || !welcome || duel || !started) return;
    if (mode !== "walk" && mode !== "drive") return;
    const share = Car.share();
    send({ t: "walk", c: city, x: +player.x.toFixed(1), z: +player.z.toFixed(1), yaw: +player.yaw.toFixed(2), s: +(Car.speed || Math.hypot(player.vx || 0, player.vz || 0)).toFixed(1), v: share.veh || undefined, k: share.park || undefined, h: Market.house, a: Math.round(Car.state() ? Car.state().alt : 0), r: +(Car.state() ? Car.state().roll : 0).toFixed(2) });
  }

  function bind() {
    setInterval(() => { if (started && Character.exists && !document.hidden && (mode === "walk" || mode === "drive") && !duel && !waiting) connect(); }, 4000); // stay connected, so you see the others
    $o("on-duel").addEventListener("click", () => queue("duel"));
    $o("on-race").addEventListener("click", () => queue("race"));
    $o("on-coop").addEventListener("click", () => queue("coop"));
    $o("on-naval").addEventListener("click", () => queue("naval"));
    $o("on-ship").addEventListener("change", () => Shipyard.choose(Number($o("on-ship").value)));
    $o("on-cancel").addEventListener("click", leaveQueue);
    $o("on-close").addEventListener("click", () => { if (waiting) leaveQueue(); closePanels(); });
    $o("btn-online").addEventListener("click", openLobby);
  }

  // ------------------------------------------------------------------ fights: duels and team battles

  const ENEMY_HP = 80; // what the server gives each enemy bot (used for the "enemies left" bar)

  function label(text, color) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "bold 30px sans-serif"; g.textAlign = "center";
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 8, 256, 48);
    g.fillStyle = color || "#fff"; g.fillText(text, 128, 44);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set(2.4, 0.6, 1); s.position.y = 2.2; s.renderOrder = 10;
    return s;
  }

  // Raise the sword arm overhead, chop forward (the hit lands at 0.28 s), then recover. Used for every figure.
  function pose(parts, swing, block) {
    if (swing >= 0) {
      const p = Math.min(1, swing / 0.7);
      parts.armR.rotation.x = p < 0.4 ? 2.8 + (1.4 - 2.8) * (p / 0.4) : 1.4 * (1 - (p - 0.4) / 0.6);
    }
    parts.armL.rotation.x = block ? 1.3 : parts.armL.rotation.x;
  }

  const near = (x, z, r) => Math.hypot(ARENA.cx + x - player.x, ARENA.cz + z - player.z) < r;

  function startFight(m) {
    if (mode !== "walk") return;
    closePanels();
    Vitals.stopRest();
    const me = m.you, coop = m.mode === "coop";
    duel = { kind: m.mode, ranked: !!m.ranked, you: me, radius: m.radius, players: m.players, figs: {}, st: {}, block: false, sendT: 0, over: false, rev: {}, enemies: m.enemies || 0, notice: "" };
    for (const p of m.players) {
      const x = p.x !== undefined ? p.x : (p.i === 0 ? -12 : 12), z = p.z || 0, yaw = p.yaw !== undefined ? p.yaw : (p.i === 0 ? -Math.PI / 2 : Math.PI / 2);
      duel.st[p.i] = { x, z, yaw, hp: 100, st: 100, swing: -1, block: 0, down: 0, team: p.role === "enemy" ? 1 : 0 };
      if (p.i === me) continue;
      const f = createFigure();
      paintFigure(f.mats, p.look);
      applyAccessories(f, p.look.acc);
      Weapons.setFigure(f, p.look.weapon);
      f.sword.visible = true;
      f.g.rotation.order = "YXZ";
      f.g.add(label(p.name, p.role === "enemy" ? "#ff9d8c" : p.role === "ally" ? "#9fd8a8" : "#fff"));
      f.g.position.set(ARENA.cx + x, 0, ARENA.cz + z);
      f.g.rotation.y = yaw;
      scene.add(f.g);
      duel.figs[p.i] = f;
    }
    mode = "online";
    Weapons.setFigure(avFig, Market.weapon);
    avFig.sword.visible = true;
    avatar.rotation.order = "YXZ";
    const mine = duel.st[me];
    placeAt(ARENA.cx + mine.x, ARENA.cz + mine.z, mine.yaw);
    player.pitch = -0.05;
    Crowd.setCheer(true);
    $o("online-hud").classList.add("show");
    $o("online-hud").classList.toggle("coop", coop);
    $o("od-me-name").textContent = m.players[me].name;
    const foe = m.players.find((p) => p.i !== me && p.role !== "enemy" && !coop);
    $o("od-foe-name").textContent = coop ? "" : (foe ? foe.name : "");
    const team = $o("od-team");
    team.replaceChildren(...(coop ? m.players.filter((p) => p.i !== me && p.role !== "enemy").map((p) => {
      const chip = document.createElement("div"), nm = document.createElement("span"), bar = document.createElement("div"), fill = document.createElement("div");
      chip.className = "od-chip"; chip.dataset.i = p.i; nm.textContent = p.name.replace(" (ally bot)", ""); bar.className = "bar"; bar.append(fill);
      chip.append(nm, bar);
      return chip;
    }) : []));
    toast(coop ? "Team battle! Beat all 5 bots together. Stand next to a fallen teammate for 3 seconds to revive them." : m.ranked ? "Ranked duel! Win to climb the ladder. Space swings, hold Shift to block" : "Duel! Space swings, hold Shift to block");
    Sfx.play("horn");
  }

  function swing() {
    if (!duel || duel.over) return;
    const s = duel.st[duel.you];
    if (s.down || s.swing >= 0 || s.st < 14 * Weapons.cur().cost) return;
    send({ t: "swing" });
    s.swing = 0; Sfx.play("swing"); // show it at once; the server confirms
  }

  const nameOf = (i) => (duel.players.find((p) => p.i === i) || {}).name || "Someone";

  function onFight(m) {
    if (!duel || duel.over) return;
    for (const row of m.p) {
      const [i, x, z, yaw, hp, st, sw, bl, down, team] = row;
      const s = duel.st[i];
      if (!s) continue;
      if (i !== duel.you && s.swing < 0 && sw >= 0 && near(x, z, 28)) Sfx.play("swing");
      Object.assign(s, { x, z, yaw, hp, st, swing: sw, block: bl, down: down || 0 });
      if (team !== undefined) s.team = team;
      if (i === duel.you && !s.down) {
        const dx = ARENA.cx + x - player.x, dz = ARENA.cz + z - player.z;
        if (Math.hypot(dx, dz) > 2.2) { player.x = ARENA.cx + x; player.z = ARENA.cz + z; } // the server moved you back
      }
    }
    duel.rev = Object.fromEntries(m.rev || []);
    for (const e of m.ev || []) {
      if (e[0] === "hit") {
        if (e[2] === duel.you) { Sfx.play("hurt"); player.shake = 0.7; $o("flash").style.opacity = 0.4; }
        else { const t = duel.st[e[2]]; if (t && near(t.x, t.z, 28)) Sfx.play("hit"); }
      } else if (e[0] === "block") Sfx.play("clash");
      else if (e[0] === "down" && duel.kind === "coop") {
        const t = duel.st[e[1]];
        if (e[1] === duel.you) toast("You are down! A teammate can revive you by standing next to you.");
        else if (t && t.team === 0) toast(`${nameOf(e[1]).replace(" (ally bot)", "")} is down! Stand next to them for 3 seconds to revive.`);
        else Sfx.play("cheer");
      } else if (e[0] === "revive") { Sfx.play("discover"); toast(e[1] === duel.you ? "You are back on your feet!" : `${nameOf(e[1]).replace(" (ally bot)", "")} is back up!`); }
    }
  }

  function update(dt, keys) {
    if (!duel) return;
    const me = duel.st[duel.you];
    if (!me.down) {
      updatePlayer(dt);
      const lx = player.x - ARENA.cx, lz = player.z - ARENA.cz, r = Math.hypot(lx, lz), max = duel.radius - 0.9;
      if (r > max) { player.x = ARENA.cx + (lx * max) / r; player.z = ARENA.cz + (lz * max) / r; }
      const blocking = keys.has("ShiftLeft") || keys.has("ShiftRight");
      if (blocking !== duel.block) { duel.block = blocking; send({ t: "block", on: blocking }); }
      duel.sendT -= dt;
      if (duel.sendT <= 0) { duel.sendT = 0.066; send({ t: "pos", x: +(player.x - ARENA.cx).toFixed(2), z: +(player.z - ARENA.cz).toFixed(2), yaw: +player.yaw.toFixed(3) }); }
    } else { player.vx = player.vz = 0; duel.block = false; }
    const k = Math.min(1, dt * 12);
    for (const i of Object.keys(duel.figs)) {
      const f = duel.figs[i], s = duel.st[i];
      const tx = ARENA.cx + s.x, tz = ARENA.cz + s.z, px = f.g.position.x, pz = f.g.position.z;
      f.g.position.x += (tx - px) * k; f.g.position.z += (tz - pz) * k;
      f.g.position.y += ((s.down ? groundAt(tx, tz) + 0.3 : groundAt(tx, tz)) - f.g.position.y) * k;
      let dy = s.yaw - f.g.rotation.y; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      f.g.rotation.y += dy * k;
      f.g.rotation.x += ((s.down ? -Math.PI / 2 : 0) - f.g.rotation.x) * Math.min(1, dt * 8);   // fallen fighters lie down
      const speed = s.down ? 0 : Math.hypot(tx - px, tz - pz) / Math.max(dt, 0.001);
      f.phase = (f.phase || 0) + dt * Math.min(speed, 8) * 1.1;
      const w = Math.min(1, speed / 5) * 0.7 * Math.sin(f.phase);
      f.parts.armL.rotation.x = -w; f.parts.armR.rotation.x = w; f.parts.legL.rotation.x = -w; f.parts.legR.rotation.x = w;
      pose(f.parts, s.swing, s.block);
    }
    if (me.swing >= 0) me.swing = Math.min(me.swing + dt / Weapons.cur().time, 0.69); // keep the animation moving between server updates
    $o("od-me-hp").style.width = `${me.hp}%`;
    $o("od-st").style.width = `${me.st}%`;
    if (duel.kind === "coop") {
      const enemies = duel.players.filter((p) => p.role === "enemy"), alive = enemies.filter((p) => !duel.st[p.i].down);
      const hpSum = enemies.reduce((t, p) => t + duel.st[p.i].hp, 0);
      $o("od-foe-name").textContent = `Enemies left: ${alive.length} of ${enemies.length}`;
      $o("od-foe-hp").style.width = `${Math.max(0, (hpSum / (enemies.length * ENEMY_HP)) * 100)}%`;
      for (const chip of $o("od-team").children) {
        const s = duel.st[chip.dataset.i];
        chip.classList.toggle("down", !!s.down);
        chip.lastChild.firstChild.style.width = `${s.hp}%`;
      }
      const reviving = Object.entries(duel.rev).filter(([, sec]) => sec > 0).map(([i, sec]) => (Number(i) === duel.you ? `A teammate is reviving you: ${Math.round((sec / 3) * 100)}%` : `Reviving ${nameOf(Number(i)).replace(" (ally bot)", "")}: ${Math.round((sec / 3) * 100)}%`));
      $o("od-note").textContent = me.down && !reviving.length ? "You are down. Stay close to your teammates: one of them can revive you." : reviving.join("  ·  ");
    } else {
      const foe = duel.st[duel.players.find((p) => p.i !== duel.you).i];
      $o("od-foe-hp").style.width = `${foe.hp}%`;
      $o("od-note").textContent = "";
    }
    const f = $o("flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6);
  }

  // Your own figure uses the walking avatar; this lets game.js pose its arms (and lay it down if you are knocked out).
  function poseMine(parts) {
    if (!duel) return;
    const s = duel.st[duel.you];
    pose(parts, s.swing, duel.block);
    avatar.rotation.x += ((s.down ? -Math.PI / 2 : 0) - avatar.rotation.x) * 0.2;
    if (s.down) avatar.position.y += 0.3;
  }

  // after a game against real people: your new rating (the server worked it out; it is only shown here)
  function ladderText(rk) {
    if (!rk || !Account.loggedIn) return "";
    const before = Social.rank.r;
    Social.setRank(rk);
    return rk.farm ? " Your rating did not change: you have played these people a lot lately." : ` Rating ${before} → ${rk.r} (${rk.delta >= 0 ? "+" : ""}${rk.delta}), ${Social.tier(rk.r)[1]}.`;
  }
  function rankNote(rk) { const t = ladderText(rk).trim(); if (t) { toast(t); Chat.add({ sys: 1, text: t }); } }

  function onFightEnd(m) {
    if (!duel) return;
    if (m.mode === "coop") {
      const prize = m.won ? 50 : 0;
      Vitals.coins += prize;
      const why = { cleared: "All five bots are beaten. Well fought, team!", defeated: `Your whole team was knocked out. You beat ${m.kills} of ${m.enemies} bots.`, time: `Time ran out. You beat ${m.kills} of ${m.enemies} bots.`, empty: "Everyone left." }[m.reason] || "";
      endFight(`${why}${prize ? ` Prize: +${prize} denarii.` : ""}${ladderText(m.rank)}`, m.won ? "Victory for the team!" : "Defeat");
      return;
    }
    const won = m.winner === duel.you, draw = m.winner === -1;
    const why = { ko: won ? "You knocked your opponent out." : "You were knocked out.", time: "Time ran out.", left: won ? "Your opponent left the arena." : "You left." }[m.reason] || "";
    const prize = won ? (duel.ranked ? 40 : 30) : 0;
    Vitals.coins += prize;
    const ladder = duel.ranked ? ladderText(m.rank) : "";
    endFight(`${why}${prize ? ` Prize: +${prize} denarii.` : ""}${ladder}`, draw ? "A draw" : won ? (duel.ranked ? "Ranked victory!" : "Victory in the arena!") : "Defeat");
  }

  function endFight(text, title) {
    if (!duel) return;
    const kind = duel.kind, ranked = duel.ranked;
    duel.over = true;
    for (const i of Object.keys(duel.figs)) scene.remove(duel.figs[i].g);
    duel = null;
    $o("online-hud").classList.remove("show", "coop");
    avFig.sword.visible = false;
    avatar.rotation.x = 0; avatar.rotation.order = "XYZ";
    Crowd.setCheer(false);
    mode = "walk";
    placeAt(ARENA.cx - 16, ARENA.cz, -Math.PI / 2);
    showResult(title, text, [
      { label: kind === "coop" ? "Fight again" : ranked ? "Ranked again" : "Duel again", fn: () => { closePanels(); openLobby(); } },
      { label: "Leave the arena", fn: closePanels },
    ]);
  }

  // Esc / Leave while in a fight (a race is left through Race.stop, which calls leaveGame)
  function leave() {
    if (!duel) return;
    send({ t: "leave" });
    endFight("You left the battle.", "You left");
  }

  // ------------------------------------------------------------------ races (the rest lives in race.js)

  function raceTick(dt, s, d) {
    raceSendT -= dt;
    if (raceSendT > 0) return;
    raceSendT = 0.1;
    send({ t: "race", s: +s.toFixed(1), d: +d.toFixed(1) });
  }

  function leaveGame() { send({ t: "leave" }); }

  return { bind, connect, checkName, openLobby, queue, update, swing, leave, leaveGame, raceTick, navalSend: send, ladderText, poseMine, walkTick, peersUpdate, get connected() { return !!ws && ws.readyState === 1 && !!welcome; }, peerList: () => [...peers.values()], shovePeer, get inDuel() { return !!duel; }, peek: () => duel, get available() { return !!URL; } };
})();
