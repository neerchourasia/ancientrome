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

  let noConnectUntil = 0;                                   // after a kick or a block the browser stops trying to come back
  function connect() {
    if (!URL || Date.now() < noConnectUntil) return;
    if (typeof Account !== "undefined" && Account.demo) { setMsg("Online play needs an account: log in to play with other people."); return; }   // the demo is offline
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
      send({ t: "hello", vid: visitorId(), token: accountToken(), name: Character.name || "Player", cls: Character.cls, look: { ...Character.look, acc: Market.worn, pet: Market.pet, weapon: Market.weapon }, rank: Social.rank, friends: Social.helloFriends() });
      clearInterval(pingT); pingT = setInterval(() => send({ t: "ping" }), 25000);
    };
    sock.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch (err) { return; } if (m && typeof m === "object") onMessage(m); };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null; welcome = null; waiting = false; clearInterval(pingT); clearPeers();
      if (typeof Ride !== "undefined") Ride.lost();
      if (typeof Mini !== "undefined" && Mini.active) Mini.lost();
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
      case "fr_gift": case "fr_gave": case "fr_invite": case "fr_state": case "fr_in": case "fr_added": case "fr_removed": case "fr_presence": case "fr_online": case "fr_msg": case "dm": case "top": Social.on(m); break;
      case "chat": Chat.add(m); break;
      case "chat_log": Chat.history(m.m); break;
      case "adminwho": Admin.showOnline(m.who || [], m); break;
      case "adminvisits": Admin.showVisits(m); break;
      case "adminjourney": Admin.showJourney(m); break;
      case "adminchat": Admin.showChat(m); break;
      case "fr_trade": Swap.on(m); break;
      case "leaders": Leaders.show(m); break;
      case "chal": onChallenge(m); break;
      case "guild": case "guilds": case "g_paid": case "g_got": Guilds.on(m); break;
      case "stocks": case "stock_fill": case "stock_no": Exchange.on(m); break;
      case "ev_top": Events.on(m); break;
      case "pyr": case "pyr_done": Cancun.pyrOn(m); break;
      case "weekly": case "weekly_prize": Weekly.on(m); break;
      case "emote": { const q = peers.get(m.id); if (q) q.emote = { e: m.e, t: 0 }; break; }
      case "ride": if (m.on) Ride.on(m); else Ride.off(m); break;
      case "ridenote": toast(m.text); break;
      case "adminevents": Admin.showEvents(m.e || []); break;
      case "kicked": noConnectUntil = Date.now() + (m.minutes || 10) * 60000; Chat.add({ sys: 1, text: m.blocked ? "An admin blocked you from the game." : `An admin kicked you for ${m.minutes || 10} minutes.` }); toast(m.blocked ? "You were blocked from the game by an admin." : "An admin kicked you."); break;
      case "queued": waiting = true; setMsg(`Looking for ${m.mode === "duel" ? "an opponent of your level" : m.mode === "coop" ? "teammates" : m.mode === "naval" ? "other captains" : m.mode === "brawl" ? "other brawlers" : m.mode === "derby" ? "other drivers" : m.mode === "kushti" || m.mode === "kites" || m.mode === "ball" ? "an opponent" : m.mode === "dragon" ? "other crews" : m.mode === "wushu" ? "a wushu opponent" : m.mode === "team2" ? "a partner and opponents" : "racers"}... (${m.waiting} waiting)`); break;
      case "left": waiting = false; setMsg(""); break;
      case "error": waiting = false; setMsg(m.msg || "Something went wrong."); if (m.code === "name") { toast(m.msg || "That name is not allowed."); if (mode === "walk" && typeof openCreator === "function") openCreator(false); } break;
      case "match": waiting = false; setMsg(""); if (m.mode === "dragon" || m.mode === "xiangqi") { toCity("beijing"); Mini.start(m); } else if (m.mode === "ball") { toCity("cancun"); Mini.start(m); } else if (m.mode === "kushti" || m.mode === "kites") Mini.start(m); else if ((m.mode === "wushu" ? toCity("beijing") : toCity("rome")), m.mode === "race" || m.mode === "derby") Race.startOnline(m); else if (m.mode === "naval") Naval.startOnline(m); else startFight(m); break;
      case "duel": case "coop": case "arena": onFight(m); break;
      case "mini": Mini.on(m); break;
      case "dragon": Mini.onDragon(m); break;
      case "world": onWorld(m); break;
      case "houses": Robbery.setHouses(m.h, m.mine); break;
      case "heist_no": toast(m.msg || "You cannot rob that house."); break;
      case "heist": Robbery.begin(m); break;
      case "heistpos": Robbery.pos(m); break;
      case "heist_end": Robbery.end(m); break;
      case "race": case "derby": Race.onlineState(m); break;
      case "naval": Naval.onlineState(m); break;
      case "end": if (m.mode === "xiangqi") { Mini.end(m); break; } if (m.mode === "dragon") { if (m.rank && Account.loggedIn) rankNote(m.rank); Mini.endDragon(m); break; } if (m.mode === "kushti" || m.mode === "kites" || m.mode === "ball") { Mini.end(m); break; } if ((m.mode === "race" || m.mode === "derby" || (m.mode === "naval" && !m.coop) || (m.mode === "duel" && !duel)) && m.rank && Account.loggedIn) rankNote(m.rank); if (m.mode === "duel" && !duel) break; if (m.mode === "race" || m.mode === "derby") Race.onlineEnd(m); else if (m.mode === "naval") Naval.onlineEnd(m); else onFightEnd(m); break;
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
    $o("on-brawl").disabled = !ready;
    $o("on-derby").disabled = !ready;
    for (const [id, c] of [["on-kushti", "delhi"], ["on-kites", "delhi"], ["on-ball", "cancun"], ["on-dragon", "beijing"], ["on-wushu", "beijing"], ["on-xiangqi", "beijing"]]) { $o(id).hidden = city !== c; $o(id).disabled = !ready; }
    $o("on-team2").disabled = !ready;
    $o("on-cancel").hidden = !waiting;
    $o("on-botrow").hidden = !(welcome && welcome.bots);
  }

  function openLobby() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#online");
    fillShips();
    connect();
    refreshLobby();
  }

  // ------------------------------------------------------------------ challenge someone who is online right now

  let chalList = [];
  function renderChal() {
    const ul = $o("ch-list"); ul.replaceChildren();
    if (!chalList.length) { const li = document.createElement("li"); li.className = "dim"; li.textContent = welcome ? "Nobody else is online right now." : "Connecting to the game server..."; ul.append(li); return; }
    for (const p of chalList) {
      const li = document.createElement("li"), t = document.createElement("span");
      t.textContent = `${p.name} · rating ${p.r}${p.busy ? " · in a game" : ""} `;
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Challenge"; b.disabled = !!p.busy;
      b.addEventListener("click", () => { send({ t: "challenge", a: "send", id: p.id, game: $o("ch-game").value }); b.disabled = true; });
      li.append(t, b); ul.append(li);
    }
  }
  function openChallenge() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    connect(); chalList = []; renderChal(); openPanel("#challenge");
    const ask = () => { if (welcome) send({ t: "challenge", a: "list" }); };
    ask(); setTimeout(ask, 1500);
  }
  function onChallenge(m) {
    if (m.a === "list") { chalList = Array.isArray(m.list) ? m.list : []; if ($o("challenge").classList.contains("show")) renderChal(); }
    else if (m.a === "sent") toast(`Challenge sent to ${m.name}. Waiting for them to answer (45 seconds)...`);
    else if (m.a === "declined") toast(`${m.name} said no.`);
    else if (m.a === "no") toast(m.msg || "The challenge did not work.");
    else if (m.a === "in") {
      if (mode !== "walk" || duel || typeof started === "undefined" || !started) { send({ t: "challenge", a: "decline", from: m.from }); return; }   // busy: the challenger is told no
      Sfx.play("chime");
      Dialog.confirm(`${m.name} (rating ${m.r}) challenges you to ${m.what || "a ranked duel"}. Accept?`).then((yes) => send({ t: "challenge", a: yes ? "accept" : "decline", from: m.from }));
    }
  }

  // the arena games are held in Rome and the ball game on the Great Ball Court in Cancún: from another city you are taken there for the match and brought back to where you stood afterwards
  let sentFrom = null;
  function toCity(name) {
    if (city === name) return;
    if (!sentFrom) sentFrom = { city, x: player.x, z: player.z, yaw: player.yaw };
    arriveIn(name);
    toast(`You are taken to ${name === "rome" ? "Rome" : "Cancún"} for the match, and brought back afterwards.`);
  }
  function comeBack() {
    if (!sentFrom || mode !== "walk" || panelOpen || duel || waiting || (typeof Race !== "undefined" && Race.active) || (typeof Mini !== "undefined" && Mini.active)) return;
    const b = sentFrom; sentFrom = null;
    arriveIn(b.city); placeAt(b.x, b.z, b.yaw);
  }

  // standing on the Great Ball Court in Cancún: F starts a game of pok-ta-pok (a real person if one is waiting, otherwise a practice bot)
  function atBallCourt() {
    return city === "cancun" && mode === "walk" && !panelOpen && typeof started !== "undefined" && started && !waiting && Math.abs(player.x - (CANCUN_X - 150)) < 14 && Math.abs(player.z + 35) < 36;
  }
  // standing on the pier at Kunming Lake in Beijing: F starts a dragon boat race against three practice crews at once
  const atDock = () => city === "beijing" && mode === "walk" && !panelOpen && typeof started !== "undefined" && started && !waiting && Beijing.atDock();
  // standing at the gate of the wushu courtyard in Beijing: F starts a bare-handed bout against Master Li at once
  const atWushu = () => city === "beijing" && mode === "walk" && !panelOpen && typeof started !== "undefined" && started && !waiting && Beijing.atWushu();
  // standing at the xiangqi pavilion in Beijing: F starts a game against a practice bot at once
  const atXiangqi = () => city === "beijing" && mode === "walk" && !panelOpen && typeof started !== "undefined" && started && !waiting && Beijing.atXiangqi();
  function playXiangqi() {
    if (typeof Account !== "undefined" && Account.demo) { toast("Xiangqi against others (or the bot) needs the game server, so it needs an account: log in first."); return; }
    if (!welcome) { connect(); toast("Connecting to the game server... press F again in a moment."); return; }
    send({ t: "queue", mode: "xiangqi", bot: true, practice: true });
  }
  function playWushu() {
    if (typeof Account !== "undefined" && Account.demo) { toast("The wushu bout needs the game server, so it needs an account: log in first."); return; }
    if (!welcome) { connect(); toast("Connecting to the game server... press F again in a moment."); return; }
    send({ t: "queue", mode: "wushu", bot: true, practice: true });
  }
  function playDragon() {
    if (typeof Account !== "undefined" && Account.demo) { toast("The dragon boat race needs the game server, so it needs an account: log in first."); return; }
    if (!welcome) { connect(); toast("Connecting to the game server... press F again in a moment."); return; }
    send({ t: "queue", mode: "dragon", bot: true, practice: true });
  }
  function playBall() {
    if (typeof Account !== "undefined" && Account.demo) { toast("Pok-ta-pok needs the game server, so it needs an account: log in first."); return; }
    if (!welcome) { connect(); toast("Connecting to the game server... press F again in a moment."); return; }
    send({ t: "queue", mode: "ball", bot: true, practice: true });      // a practice game against a bot at once (play real people from the PvP menu)
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
    const show = mode === "walk" || mode === "drive" || mode === "watch" || mode === "ride";
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
      if (p.emote) Emotes.peer(p, dt);
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
  // A random id this browser makes up once (nothing to do with who you are), so the admins' visitor list can tell visitors apart
  function visitorId() {
    try {
      let v = localStorage.getItem("rome-vid");
      if (!/^[a-f0-9]{32}$/.test(v || "")) { v = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("rome-vid", v); }
      return v;
    } catch (e) { return undefined; }
  }
  // Tell the game server that someone opened the site (once per page load): the admins' visitor list shows when, what kind of device, and the character name if there is one
  function visit() {
    if (!URL || !visitorId()) return;
    const http = URL.replace(/^ws/, "http").replace(/\/play$/, "");
    try { fetch(`${http}/visit?v=${visitorId()}&n=${encodeURIComponent(Character.exists ? Character.name : "")}`, { keepalive: true }).catch(() => {}); } catch (e) { /* ignore */ }
  }

  // Tell the game server a few things the visitor did on this visit (the admins' User journey): short lines like "went to Delhi", no chat and nothing typed
  function journey(sid, events) {
    if (!URL || !visitorId() || !events.length) return;
    const http = URL.replace(/^ws/, "http").replace(/\/play$/, "");
    try { fetch(`${http}/journey?v=${visitorId()}&s=${sid}&n=${encodeURIComponent(Character.exists ? Character.name : "")}&e=${encodeURIComponent(JSON.stringify(events))}`, { keepalive: true }).catch(() => {}); } catch (e) { /* ignore */ }
  }

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
    if (typeof Subway !== "undefined" && Subway.underground) return;   // down in the metro nobody can see you
    if (typeof Ride !== "undefined" && Ride.active) return;            // a passenger has no position of their own: the server puts them where the driver is
    if (!ws || ws.readyState !== 1 || !welcome || duel || !started) return;
    if (mode !== "walk" && mode !== "drive") return;
    const share = Car.share();
    send({ t: "walk", tp: (typeof lastTeleport !== "undefined" && performance.now() - lastTeleport < 2000) ? 1 : undefined, c: city, x: +player.x.toFixed(1), z: +player.z.toFixed(1), yaw: +player.yaw.toFixed(2), s: +(Car.speed || Math.hypot(player.vx || 0, player.vz || 0)).toFixed(1), v: share.veh || undefined, k: share.park || undefined, h: Market.house, a: Math.round(Car.state() ? Car.state().alt : 0), d: Math.round(Vitals.coins), r: +(Car.state() ? Car.state().roll : 0).toFixed(2) });
  }

  function bind() {
    visit();
    setInterval(() => { if (started && Character.exists && !document.hidden && (mode === "walk" || mode === "drive") && !duel && !waiting) connect(); }, 4000); // stay connected, so you see the others
    $o("on-duel").addEventListener("click", () => queue("duel"));
    $o("on-race").addEventListener("click", () => queue("race"));
    $o("on-coop").addEventListener("click", () => queue("coop"));
    $o("on-naval").addEventListener("click", () => queue("naval"));
    $o("on-brawl").addEventListener("click", () => queue("brawl"));
    $o("on-derby").addEventListener("click", () => queue("derby"));
    $o("on-kushti").addEventListener("click", () => queue("kushti"));
    $o("on-kites").addEventListener("click", () => queue("kites"));
    $o("on-ball").addEventListener("click", () => queue("ball"));
    $o("on-dragon").addEventListener("click", () => queue("dragon"));
    $o("on-wushu").addEventListener("click", () => queue("wushu"));
    $o("on-xiangqi").addEventListener("click", () => queue("xiangqi"));
    $o("on-team2").addEventListener("click", () => queue("team2"));
    $o("on-ship").addEventListener("change", () => Shipyard.choose(Number($o("on-ship").value)));
    $o("on-cancel").addEventListener("click", leaveQueue);
    $o("on-close").addEventListener("click", () => { if (waiting) leaveQueue(); closePanels(); });
    $o("btn-online").addEventListener("click", openLobby);
    $o("btn-chal").addEventListener("click", openChallenge);
    setInterval(comeBack, 700);
    $o("ch-refresh").addEventListener("click", () => { if (welcome) send({ t: "challenge", a: "list" }); });
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

  let C0 = { cx: ARENA.cx, cz: ARENA.cz };      // where the fight is held: the Colosseum arena in Rome, or the wushu courtyard in Beijing
  const near = (x, z, r) => Math.hypot(C0.cx + x - player.x, C0.cz + z - player.z) < r;

  function startFight(m) {
    if (mode !== "walk") return;
    closePanels();
    Vitals.stopRest();
    C0 = m.mode === "wushu" ? { cx: BEIJING_X + Beijing.WUSHU.x, cz: Beijing.WUSHU.z } : { cx: ARENA.cx, cz: ARENA.cz };
    const me = m.you, coop = m.mode === "coop", arena = m.mode === "brawl" || m.mode === "team2";
    const teamOf = (p) => (p.team !== undefined ? p.team : p.role === "enemy" ? 1 : 0);
    duel = { kind: m.mode, ranked: !!m.ranked, you: me, radius: m.radius, players: m.players, figs: {}, st: {}, block: false, sendT: 0, over: false, rev: {}, enemies: m.enemies || 0, notice: "" };
    for (const p of m.players) {
      const x = p.x !== undefined ? p.x : (p.i === 0 ? -12 : 12), z = p.z || 0, yaw = p.yaw !== undefined ? p.yaw : (p.i === 0 ? -Math.PI / 2 : Math.PI / 2);
      duel.st[p.i] = { x, z, yaw, hp: 100, st: 100, swing: -1, block: 0, down: 0, team: teamOf(p) };
      if (p.i === me) continue;
      const f = createFigure();
      paintFigure(f.mats, p.look);
      applyAccessories(f, p.look.acc);
      Weapons.setFigure(f, p.look.weapon);
      f.sword.visible = m.mode !== "wushu";
      f.g.rotation.order = "YXZ";
      f.g.add(label(p.name.replace(" (practice bot)", " (bot)"), arena ? (teamOf(p) === duel.st[me].team && m.mode === "team2" ? "#9fd8a8" : "#ff9d8c") : p.role === "enemy" ? "#ff9d8c" : p.role === "ally" ? "#9fd8a8" : "#fff"));
      f.g.position.set(C0.cx + x, 0, C0.cz + z);
      f.g.rotation.y = yaw;
      scene.add(f.g);
      duel.figs[p.i] = f;
    }
    mode = "online";
    Weapons.setFigure(avFig, Market.weapon);
    avFig.sword.visible = m.mode !== "wushu";
    avatar.rotation.order = "YXZ";
    const mine = duel.st[me];
    placeAt(C0.cx + mine.x, C0.cz + mine.z, mine.yaw);
    player.pitch = -0.05;
    Crowd.setCheer(true);
    $o("online-hud").classList.add("show");
    $o("online-hud").classList.toggle("coop", coop || arena);
    $o("od-me-name").textContent = m.players[me].name;
    const foe = m.players.find((p) => p.i !== me && p.role !== "enemy" && !coop && !arena);
    $o("od-foe-name").textContent = coop || arena ? "" : (foe ? foe.name : "");
    const team = $o("od-team"), mates = coop ? m.players.filter((p) => p.i !== me && p.role !== "enemy") : m.mode === "team2" ? m.players.filter((p) => p.i !== me && teamOf(p) === teamOf(m.players[me])) : [];
    team.replaceChildren(...(mates.length ? mates.map((p) => {
      const chip = document.createElement("div"), nm = document.createElement("span"), bar = document.createElement("div"), fill = document.createElement("div");
      chip.className = "od-chip"; chip.dataset.i = p.i; nm.textContent = p.name.replace(" (ally bot)", ""); bar.className = "bar"; bar.append(fill);
      chip.append(nm, bar);
      return chip;
    }) : []));
    toast(m.mode === "brawl" ? "Arena brawl! Every fighter for themselves: be the last one standing. Space swings, hold Shift to block" : m.mode === "team2" ? "2 v 2! Beat both opponents together. Space swings, hold Shift to block" : coop ? "Team battle! Beat all 5 bots together. Stand next to a fallen teammate for 3 seconds to revive them." : m.ranked ? "Ranked duel! Win to climb the ladder. Space swings, hold Shift to block" : "Duel! Space swings, hold Shift to block");
    Sfx.play("horn");
  }

  function swing() {
    if (typeof Mini !== "undefined" && Mini.is3d) { Mini.swing(); return; }
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
        const dx = C0.cx + x - player.x, dz = C0.cz + z - player.z;
        if (Math.hypot(dx, dz) > 2.2) { player.x = C0.cx + x; player.z = C0.cz + z; } // the server moved you back
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
    if (typeof Mini !== "undefined" && Mini.is3d) { Mini.update(dt, keys); return; }
    if (!duel) return;
    const me = duel.st[duel.you];
    if (!me.down) {
      updatePlayer(dt);
      const lx = player.x - C0.cx, lz = player.z - C0.cz, r = Math.hypot(lx, lz), max = duel.radius - 0.9;
      if (r > max) { player.x = C0.cx + (lx * max) / r; player.z = C0.cz + (lz * max) / r; }
      const blocking = keys.has("ShiftLeft") || keys.has("ShiftRight");
      if (blocking !== duel.block) { duel.block = blocking; send({ t: "block", on: blocking }); }
      duel.sendT -= dt;
      if (duel.sendT <= 0) { duel.sendT = 0.066; send({ t: "pos", x: +(player.x - C0.cx).toFixed(2), z: +(player.z - C0.cz).toFixed(2), yaw: +player.yaw.toFixed(3) }); }
    } else { player.vx = player.vz = 0; duel.block = false; }
    const k = Math.min(1, dt * 12);
    for (const i of Object.keys(duel.figs)) {
      const f = duel.figs[i], s = duel.st[i];
      const tx = C0.cx + s.x, tz = C0.cz + s.z, px = f.g.position.x, pz = f.g.position.z;
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
    } else if (duel.kind === "brawl" || duel.kind === "team2") {
      const myTeam = me.team, foes = duel.players.filter((p) => duel.st[p.i].team !== myTeam), alive = foes.filter((p) => !duel.st[p.i].down);
      $o("od-foe-name").textContent = duel.kind === "brawl" ? `Fighters left: ${alive.length} of ${foes.length}` : `Opponents left: ${alive.length} of ${foes.length}`;
      $o("od-foe-hp").style.width = `${Math.max(0, alive.length ? alive.reduce((t, p) => t + duel.st[p.i].hp, 0) / foes.length : 0)}%`;
      for (const chip of $o("od-team").children) {
        const s = duel.st[chip.dataset.i];
        chip.classList.toggle("down", !!s.down);
        chip.lastChild.firstChild.style.width = `${s.hp}%`;
      }
      $o("od-note").textContent = me.down ? "You are out. Stay and watch how it ends (Esc leaves)." : "";
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
    if (m.mode === "brawl" || m.mode === "team2") {
      const first = m.place === 0 && m.won, many = m.n >= 4;
      const prize = m.mode === "brawl" ? (first ? 80 : m.place === 1 && many ? 30 : 0) : (first ? 50 : 0);
      Vitals.coins += prize;
      const ord = ["1st", "2nd", "3rd", "4th", "5th", "6th"][m.place] || `${m.place + 1}th`;
      const why = m.mode === "brawl" ? (first ? "You are the last one standing!" : m.reason === "time" ? `Time ran out. You finished ${ord}.` : `You were knocked out. You finished ${ord} of ${m.n}.`) : (first ? "Your team beat both opponents. Well fought!" : m.reason === "time" ? "Time ran out and the other team had more health." : "Your team was beaten.");
      endFight(`${why}${prize ? ` Prize: +${prize} denarii.` : ""}${m.ranked ? ladderText(m.rank) : ""}`, first ? (m.mode === "brawl" ? "Champion of the brawl!" : "Victory for the team!") : "Defeat");
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
    placeAt(C0.cx - (kind === "wushu" ? 29 : 16), C0.cz, -Math.PI / 2);
    showResult(title, text, [
      { label: kind !== "duel" ? "Fight again" : ranked ? "Ranked again" : "Duel again", fn: () => { closePanels(); openLobby(); } },
      { label: "Leave the arena", fn: closePanels },
    ]);
  }

  // Esc / Leave while in a fight (a race is left through Race.stop, which calls leaveGame)
  function leave() {
    if (typeof Mini !== "undefined" && Mini.active) { Mini.leave(); return; }
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

  return { bind, connect, atBallCourt, playBall, atDock, playDragon, atWushu, playWushu, atXiangqi, playXiangqi, checkName, journey, openLobby, queue, update, swing, leave, leaveGame, raceTick, navalSend: send, ladderText, poseMine, walkTick, peersUpdate, get connected() { return !!ws && ws.readyState === 1 && !!welcome; }, peerList: () => [...peers.values()], shovePeer, get inDuel() { return !!duel; }, peek: () => duel, get available() { return !!URL; } };
})();
