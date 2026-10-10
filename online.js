"use strict";
// Playing real people: the browser side of server/server.py.
//
// The browser sends only what the player does (where they are, a swing, a block, race progress); the SERVER decides
// health, damage, hits and who finished first, and sends the result back. So nothing here can be used to cheat.
// Depends on game.js (mode, player, createFigure, ...), race.js and account.js at run time.

const Online = (() => {
  const cfg = window.ROME_CONFIG || {};
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const URL = cfg.serverUrl || (isLocal ? "ws://localhost:8765/play" : "");
  const $o = (id) => document.getElementById(id);

  let ws = null, welcome = null, helloKey = "", waiting = false, pingT = null, lobbyMsg = "";
  let duel = null;
  let raceSendT = 0;

  const send = (obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  const accountToken = () => (typeof Account !== "undefined" ? Account.token() : null);

  // ------------------------------------------------------------------ connection

  function connect() {
    if (!URL) return;
    const key = [accountToken(), Account.premium, Character.name, Character.cls, JSON.stringify(Character.look)].join("|");
    if (ws && ws.readyState <= 1) {
      if (key === helloKey || duel || waiting) return;   // fine as it is
      ws.close();                                         // you logged in or changed character: connect again
    }
    helloKey = key; welcome = null; setMsg("Connecting to the game server...");
    let sock;
    try { sock = new WebSocket(URL); } catch (e) { setMsg("Can't reach the game server."); return; }
    ws = sock;
    sock.onopen = () => {
      send({ t: "hello", token: accountToken(), name: Character.name || "Player", cls: Character.cls, look: Character.look });
      clearInterval(pingT); pingT = setInterval(() => send({ t: "ping" }), 25000);
    };
    sock.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch (err) { return; } if (m && typeof m === "object") onMessage(m); };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null; welcome = null; waiting = false; clearInterval(pingT);
      if (duel) endDuel("The connection to the game server was lost.", "Disconnected");
      else if (Race.isOnline()) Race.stop();
      setMsg(URL ? "Disconnected from the game server." : "");
      refreshLobby();
    };
    sock.onerror = () => setMsg("Can't reach the game server. It may be switched off.");
  }

  function setMsg(t) { lobbyMsg = t; refreshLobby(); }

  function onMessage(m) {
    switch (m.t) {
      case "welcome": welcome = m; setMsg(""); break;
      case "queued": waiting = true; setMsg(`Looking for ${m.mode === "duel" ? "an opponent" : "racers"}... (${m.waiting} waiting)`); break;
      case "left": waiting = false; setMsg(""); break;
      case "error": waiting = false; setMsg(m.msg || "Something went wrong."); break;
      case "match": waiting = false; setMsg(""); if (m.mode === "duel") startDuel(m); else Race.startOnline(m); break;
      case "duel": onDuel(m); break;
      case "race": Race.onlineState(m); break;
      case "end": if (m.mode === "duel") onDuelEnd(m); else Race.onlineEnd(m); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ the lobby

  function refreshLobby() {
    const box = $o("online");
    if (!box) return;
    const premiumNeeded = !!(welcome && welcome.premiumRequired && !welcome.premium);
    const ready = !!welcome && !premiumNeeded && !waiting;
    $o("on-status").textContent = !URL ? "Online play is not switched on yet." : (lobbyMsg || (premiumNeeded ? (welcome.account ? "Playing real people is a Premium feature." : "Log in with a Premium account to play real people.") : (welcome ? (waiting ? "" : "Pick a game.") : "Connecting...")));
    $o("on-duel").disabled = !ready;
    $o("on-race").disabled = !ready;
    $o("on-cancel").hidden = !waiting;
    $o("on-botrow").hidden = !(welcome && welcome.bots);
    $o("on-login").hidden = !(premiumNeeded && !welcome.account);
    $o("on-premium").hidden = !premiumNeeded;
  }

  function openLobby() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#online");
    connect();
    refreshLobby();
  }

  function queue(game) {
    if (!welcome) { connect(); return; }
    send({ t: "queue", mode: game, bot: $o("on-bot").checked });
  }

  function leaveQueue() { send({ t: "leave" }); waiting = false; setMsg(""); }

  function bind() {
    $o("on-duel").addEventListener("click", () => queue("duel"));
    $o("on-race").addEventListener("click", () => queue("race"));
    $o("on-cancel").addEventListener("click", leaveQueue);
    $o("on-close").addEventListener("click", () => { if (waiting) leaveQueue(); closePanels(); });
    $o("on-login").addEventListener("click", () => { closePanels(); Account.open(); });
    $o("on-premium").addEventListener("click", () => { closePanels(); openPremium(); });
    $o("btn-online").addEventListener("click", openLobby);
  }

  // ------------------------------------------------------------------ duels

  function label(text) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "bold 30px sans-serif"; g.textAlign = "center";
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 8, 256, 48);
    g.fillStyle = "#fff"; g.fillText(text, 128, 44);
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

  function startDuel(m) {
    if (mode !== "walk") return;
    closePanels();
    Vitals.stopRest();
    const me = m.you;
    duel = { you: me, radius: m.radius, names: m.players.map((p) => p.name), figs: {}, st: m.players.map(() => ({ x: 0, z: 0, yaw: 0, hp: 100, st: 100, swing: -1, block: 0, prevSwing: -1 })), block: false, sendT: 0, over: false };
    for (const p of m.players) {
      if (p.i === me) continue;
      const f = createFigure();
      paintFigure(f.mats, p.look);
      f.sword.visible = true;
      f.g.add(label(p.name));
      f.g.position.set(ARENA.cx + (p.i === 0 ? -12 : 12), 0, ARENA.cz);
      scene.add(f.g);
      duel.figs[p.i] = f;
    }
    mode = "online";
    avFig.sword.visible = true;
    placeAt(ARENA.cx + (me === 0 ? -12 : 12), ARENA.cz, me === 0 ? -Math.PI / 2 : Math.PI / 2);
    player.pitch = -0.05;
    Crowd.setCheer(true);
    $o("online-hud").classList.add("show");
    $o("od-me-name").textContent = m.players[me].name;
    const other = m.players.find((p) => p.i !== me);
    $o("od-foe-name").textContent = other ? other.name : "";
    toast("Duel! Space swings, hold Shift to block");
    Sfx.play("horn");
  }

  function swing() {
    if (!duel || duel.over) return;
    const s = duel.st[duel.you];
    if (s.swing >= 0 || s.st < 14) return;
    send({ t: "swing" });
    s.swing = 0; s.prevSwing = 0; Sfx.play("swing"); // show it at once; the server confirms
  }

  function onDuel(m) {
    if (!duel || duel.over) return;
    for (const p of m.p) {
      const [i, x, z, yaw, hp, st, sw, bl] = p;
      const s = duel.st[i];
      if (i !== duel.you && s.swing < 0 && sw >= 0) Sfx.play("swing");
      Object.assign(s, { x, z, yaw, hp, st, swing: sw, block: bl });
      if (i === duel.you) {
        const dx = ARENA.cx + x - player.x, dz = ARENA.cz + z - player.z;
        if (Math.hypot(dx, dz) > 2.2) { player.x = ARENA.cx + x; player.z = ARENA.cz + z; } // the server moved you back
      }
    }
    for (const e of m.ev || []) {
      if (e[0] === "hit") {
        if (e[2] === duel.you) { Sfx.play("hurt"); player.shake = 0.7; $o("flash").style.opacity = 0.4; }
        else Sfx.play("hit");
      } else if (e[0] === "block") Sfx.play("clash");
    }
  }

  function update(dt, keys) {
    if (!duel) return;
    updatePlayer(dt);
    const lx = player.x - ARENA.cx, lz = player.z - ARENA.cz, r = Math.hypot(lx, lz), max = duel.radius - 0.9;
    if (r > max) { player.x = ARENA.cx + (lx * max) / r; player.z = ARENA.cz + (lz * max) / r; }
    const blocking = keys.has("ShiftLeft") || keys.has("ShiftRight");
    if (blocking !== duel.block) { duel.block = blocking; send({ t: "block", on: blocking }); }
    duel.sendT -= dt;
    if (duel.sendT <= 0) { duel.sendT = 0.066; send({ t: "pos", x: +(player.x - ARENA.cx).toFixed(2), z: +(player.z - ARENA.cz).toFixed(2), yaw: +player.yaw.toFixed(3) }); }
    const k = Math.min(1, dt * 12);
    for (const i of Object.keys(duel.figs)) {
      const f = duel.figs[i], s = duel.st[i];
      const tx = ARENA.cx + s.x, tz = ARENA.cz + s.z, px = f.g.position.x, pz = f.g.position.z;
      f.g.position.x += (tx - px) * k; f.g.position.z += (tz - pz) * k; f.g.position.y = groundAt(tx, tz);
      let dy = s.yaw - f.g.rotation.y; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      f.g.rotation.y += dy * k;
      const speed = Math.hypot(tx - px, tz - pz) / Math.max(dt, 0.001);
      f.phase = (f.phase || 0) + dt * Math.min(speed, 8) * 1.1;
      const w = Math.min(1, speed / 5) * 0.7 * Math.sin(f.phase);
      f.parts.armL.rotation.x = -w; f.parts.armR.rotation.x = w; f.parts.legL.rotation.x = -w; f.parts.legR.rotation.x = w;
      pose(f.parts, s.swing, s.block);
      if (s.swing < 0) s.prevSwing = -1;
    }
    const me = duel.st[duel.you], foe = duel.st[1 - duel.you];
    if (me.swing >= 0) me.swing = Math.min(me.swing + dt, 0.69); // keep the animation moving between server updates
    $o("od-me-hp").style.width = `${me.hp}%`;
    $o("od-foe-hp").style.width = `${foe.hp}%`;
    $o("od-st").style.width = `${me.st}%`;
    const f = $o("flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6);
  }

  // Your own figure uses the walking avatar; this lets game.js pose its arms during a duel.
  function poseMine(parts) {
    if (!duel) return;
    const s = duel.st[duel.you];
    pose(parts, s.swing, duel.block);
  }

  function onDuelEnd(m) {
    if (!duel) return;
    const won = m.winner === duel.you, draw = m.winner === -1;
    const why = { ko: won ? "You knocked your opponent out." : "You were knocked out.", time: "Time ran out.", left: won ? "Your opponent left the arena." : "You left." }[m.reason] || "";
    const prize = won ? 30 : 0;
    Vitals.coins += prize;
    endDuel(`${why}${prize ? ` Prize: +${prize} denarii.` : ""}`, draw ? "A draw" : won ? "Victory in the arena!" : "Defeat");
  }

  function endDuel(text, title) {
    if (!duel) return;
    duel.over = true;
    for (const i of Object.keys(duel.figs)) scene.remove(duel.figs[i].g);
    duel = null;
    $o("online-hud").classList.remove("show");
    avFig.sword.visible = false;
    Crowd.setCheer(false);
    mode = "walk";
    placeAt(ARENA.cx - 16, ARENA.cz, -Math.PI / 2);
    showResult(title, text, [
      { label: "Duel again", fn: () => { closePanels(); openLobby(); } },
      { label: "Leave the arena", fn: closePanels },
    ]);
  }

  // Esc / Leave while in a duel (a race is left through Race.stop, which calls leaveGame)
  function leave() {
    if (!duel) return;
    send({ t: "leave" });
    endDuel("You left the duel.", "You left");
  }

  // ------------------------------------------------------------------ races (the rest lives in race.js)

  function raceTick(dt, s, d) {
    raceSendT -= dt;
    if (raceSendT > 0) return;
    raceSendT = 0.1;
    send({ t: "race", s: +s.toFixed(1), d: +d.toFixed(1) });
  }

  function leaveGame() { send({ t: "leave" }); }

  return { bind, openLobby, queue, update, swing, leave, leaveGame, raceTick, poseMine, get inDuel() { return !!duel; }, peek: () => duel, get available() { return !!URL; } };
})();
