"use strict";
// City games against real people: kushti wrestling and a kite fight (Old Delhi), drawn on a picture that covers the screen, and the ball game pok-ta-pok, played in 3D on the real
// Great Ball Court at Chichén Itzá in Cancún, like the fights in the Colosseum (you walk about the court and hit the ball with Space). The browser only says what you are doing (a key
// press, where your kite or you are standing); the game server decides every throw, cut and point and who wins (it is also what a practice bot is, when nobody else is looking). You pick one in 🌐 Play online, or challenge somebody to it from 🎯 Challenge someone. Winning pays 40 denarii (20 against a bot)
// and counts towards your rank when it is against another person. Depends on online.js (Online.navalSend, Online.ladderText, Online.openLobby), vitals.js and the globals of game.js.

const Mini = (() => {
  const W = 640, H = 360;
  const TITLES = { xiangqi: "♟ Xiangqi (Chinese chess)", kushti: "🤼 Kushti wrestling in the akhara", kites: "🪁 Kite fight over Old Delhi", ball: "⚽ Pok-ta-pok on the Great Ball Court" };
  const HELP = {
    xiangqi: "Click one of your pieces, then where it should go (green marks show where it may move). Red moves first. A side with no legal move loses. You have 10 minutes on your clock. Esc leaves (and loses).",
    kushti: "Wait for GO, then press Space as fast as you can. More presses than your opponent wins the throw. First to two throws wins.",
    kites: "A D W S (or the arrow keys) fly your kite. Get close to the other kite and press Space to pull: their string frays. First string cut loses. Esc leaves.",
    ball: "WASD walk, Space strikes the ball with your hip when it is close (as in the real game, never with the hands or feet), towards the way you face. Don't let it land on your half (the other player scores 1). Send it through a stone ring on a long wall and you win the whole match at once. First to 5. Esc leaves.",
  };
  let ov = null, cv = null, g = null, head = null, help = null, m = null, st = null, raf = 0, last = 0, sendT = 0, note = "", noteT = 0;
  const held = new Set();
  let kite = { x: 22, y: 30 }, hitAt = [0, 0], pullAt = [0, 0];
  let dg = null;      // the dragon boat race: { boats, hud, t0 (when the drum starts), beat, len, dist (each boat's smoothed distance), best (your last stroke) }
  let bg = null;      // the 3D ball game: { ball (the mesh), fig (the other player's figure), hud, last (when each player last hit) }
  const send = (o) => Online.navalSend(o);
  const me = () => (m ? m.you : 0), foe = () => 1 - me();
  const mine = (i) => !!m && !m.watch && i === m.you;                  // (when you are only watching, nobody on the screen is you)
  const nameOf = (i) => (m && m.players[i] ? m.players[i].name : "?");

  function build() {
    ov = document.createElement("div"); ov.id = "mini";
    ov.innerHTML = '<h2 id="mini-head"></h2><canvas id="mini-cv" width="640" height="360"></canvas><p id="mini-help"></p><button id="mini-leave" type="button">Leave the game</button>';
    document.body.append(ov);
    cv = ov.querySelector("#mini-cv"); g = cv.getContext("2d"); head = ov.querySelector("#mini-head"); help = ov.querySelector("#mini-help");
    ov.querySelector("#mini-leave").addEventListener("click", leave);
  }

  // ------------------------------------------------------------------ starting, keys and the loop
  function start(msg) {
    if (m) return;
    if (typeof mode === "undefined" || mode !== "walk") { send(msg.watch ? { t: "watch", a: "leave" } : { t: "leave" }); return; }
    if (msg.mode === "ball") return start3d(msg);
    if (msg.mode === "dragon") return startDragon(msg);
    if (!ov) build();
    closePanels(); Vitals.stopRest();
    if (document.pointerLockElement) document.exitPointerLock();
    m = msg; st = null; note = ""; held.clear(); kite = { x: m.you === 0 ? 22 : 78, y: 30 }; hitAt = [0, 0]; pullAt = [0, 0];
    mode = "online";
    m.title = m.watch ? `👀 ${m.players.map((p) => p.name).join(" vs ")}` : `${TITLES[m.mode]}${m.ranked ? " (ranked)" : ""}`; head.textContent = m.title;
    m.kind = m.mode; help.textContent = m.watch ? "You are watching this match. Press 1 2 3 4 to cheer. Esc or the button stops." : HELP[m.kind];
    ov.querySelector("#mini-leave").textContent = m.watch ? "Stop watching" : "Leave the game";
    if (m.kind === "xiangqi") xqSetup();
    ov.classList.add("show");
    addEventListener("keydown", onKey, true); addEventListener("keyup", onUp, true);
    last = performance.now(); raf = requestAnimationFrame(loop);
    if (!m.watch) Sfx.play("horn"); else cheerBar(true);
  }

  const GAME_KEYS = new Set(["Space", "KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"]);
  function onKey(e) {
    if (!m || !GAME_KEYS.has(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.code === "Escape") { leave(); return; }
    if (m.replay) { if (e.repeat) return; if (e.code === "ArrowRight" || e.code === "KeyD") rpStep(1); else if (e.code === "ArrowLeft" || e.code === "KeyA") rpStep(-1); else if (e.code === "Space") { m.replay.auto = !m.replay.auto; m.replay.t = 0; } return; }
    if (e.repeat || m.watch) return;
    held.add(e.code);
    if (e.code === "Space") {
      if (m.kind === "kushti") { if (st && st.ph === "mash") send({ t: "press" }); }
      else if (m.kind === "kites") { send({ t: "pull" }); pullAt[me()] = performance.now(); Sfx.play("swing"); }
    }
  }
  function onUp(e) { if (m && GAME_KEYS.has(e.code)) { held.delete(e.code); e.stopPropagation(); } }
  const dir = (neg, pos) => (neg.some((k) => held.has(k)) ? -1 : 0) + (pos.some((k) => held.has(k)) ? 1 : 0);

  function loop(now) {
    if (!m) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (m.kind === "kites" && !m.watch) {
      kite.x = Math.max(2, Math.min(98, kite.x + dir(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]) * 40 * dt));
      kite.y = Math.max(4, Math.min(56, kite.y + dir(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]) * 40 * dt));
      sendT -= dt; if (sendT <= 0) { sendT = 0.08; send({ t: "kite", x: +kite.x.toFixed(1), y: +kite.y.toFixed(1) }); }
    }
    if (m.replay && m.replay.auto) { m.replay.t -= dt; if (m.replay.t <= 0) { m.replay.t = 1.1; if (!rpStep(1)) m.replay.auto = false; } }
    noteT -= dt; if (noteT <= 0) note = "";
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function on(s) {
    if (!m || s.k !== m.kind) return;
    st = s;
    if (head && m.title) head.textContent = m.title + (s.w ? ` · 👀 ${s.w} watching` : "");
    for (const e of s.ev || []) {
      if (e[0] === "move") { Sfx.play(e[4] ? "hit" : "clack"); if (e[1] !== me()) setNote(e[4] ? "They took a piece." : ""); }
      else if (e[0] === "throw") { Sfx.play("hit"); setNote(mine(e[1]) ? "You win the throw!" : `${nameOf(e[1])} wins the throw.`); }
      else if (e[0] === "draw") setNote("A draw: the throw is wrestled again.");
      else if (e[0] === "hit") { hitAt[e[1]] = performance.now(); Sfx.play("bounce"); }
      else if (e[0] === "point") { Sfx.play(e[3] === "ring" ? "ring" : e[2] > 1 ? "medal" : "coin"); setNote(e[3] === "ring" ? `${mine(e[1]) ? "You" : nameOf(e[1])} sent it through the ring!` : `${e[1] === me() ? "You score" : nameOf(e[1]) + " scores"} ${e[2]}`); }
    }
    if (m.kind === "kites" && s.p) for (let i = 0; i < 2; i++) if (s.p[i][3]) pullAt[i] = performance.now();
  }
  function setNote(t) { note = t; noteT = 2.2; }

  // ------------------------------------------------------------------ drawing
  const label = (t, x, y, size = 18, color = "#fff3cf", align = "center") => { g.font = `bold ${size}px Georgia, serif`; g.textAlign = align; g.fillStyle = color; g.fillText(t, x, y); };
  function scoreLine() {
    const s = st ? st.s : [0, 0];
    const col = (i) => (i === me() ? "#9fe0ff" : "#ffb09c");          // (when watching, the first player is blue and the second red)
    label(`${nameOf(0)}`, 150, 26, 16, col(0)); label(`${s[0]}`, 280, 30, 26, col(0));
    label("–", 320, 28, 22); label(`${s[1]}`, 360, 30, 26, col(1)); label(`${nameOf(1)}`, 490, 26, 16, col(1));
  }
  function draw(now) {
    g.clearRect(0, 0, W, H);
    if (m.kind === "kushti") drawKushti(now); else if (m.kind === "xiangqi") drawXq(); else drawKites(now);
    if (note) label(note, W / 2, H - 14, 20, "#ffe08a");
  }

  function drawKushti(now) {
    const c = st ? st.c : [0, 0], ph = st ? st.ph : "ready", left = st ? st.left : 3;
    g.fillStyle = "#5c4126"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#c79a5a"; g.beginPath(); g.ellipse(W / 2, 230, 270, 96, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#8a6636"; g.lineWidth = 9; g.stroke();
    scoreLine();
    const tot = c[0] + c[1], frac = tot ? c[0] / tot : 0.5;
    g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(60, 48, W - 120, 16);
    g.fillStyle = "#5aa9e6"; g.fillRect(60, 48, (W - 120) * frac, 16); g.fillStyle = "#e66a5a"; g.fillRect(60 + (W - 120) * frac, 48, (W - 120) * (1 - frac), 16);
    label(`${c[0]}`, 40, 62, 16, "#9fe0ff"); label(`${c[1]}`, W - 40, 62, 16, "#ffb09c");
    const lean = Math.max(-90, Math.min(90, (c[0] - c[1]) * 7)), wob = ph === "mash" ? Math.sin(now / 45) * 4 : 0;
    const fig = (x, col, face) => {
      g.fillStyle = col; g.beginPath(); g.roundRect ? g.roundRect(x - 26, 190, 52, 74, 14) : g.rect(x - 26, 190, 52, 74); g.fill();
      g.fillStyle = "#e7b98b"; g.beginPath(); g.arc(x, 176, 20, 0, Math.PI * 2); g.fill();
      g.strokeStyle = col; g.lineWidth = 10; g.lineCap = "round"; g.beginPath(); g.moveTo(x + face * 20, 208); g.lineTo(x + face * 52, 218 + wob); g.stroke();
    };
    fig(W / 2 - 52 + lean + wob, "#2d6cb0", 1); fig(W / 2 + 52 + lean - wob, "#b04a2d", -1);
    const msg = ph === "ready" ? `Get ready... ${Math.ceil(left)}` : ph === "mash" ? `MASH SPACE!  ${Math.ceil(left)}` : "";
    if (msg) label(msg, W / 2, 112, 30, ph === "mash" ? "#ffe08a" : "#fff3cf");
  }

  function kiteAt(i) { const p = mine(i) ? kite : st && st.p ? { x: st.p[i][0], y: st.p[i][1] } : { x: i ? 78 : 22, y: 30 }; return { x: (p.x / 100) * W, y: H - 24 - (p.y / 60) * (H - 70) }; }
  function drawKites(now) {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#5f9fe0"); sky.addColorStop(1, "#ffd9a0"); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = "#a8523a"; g.fillRect(0, H - 24, W, 24);                                       // the red fort's wall
    for (let x = 0; x < W; x += 28) g.fillRect(x, H - 32, 16, 10);
    scoreLine();
    const colors = ["#2d6cb0", "#c0392b"], p = st && st.p ? st.p : [[22, 30, 100, 0], [78, 30, 100, 0]];
    for (let i = 0; i < 2; i++) {
      const bar = 190, x0 = i === 0 ? 40 : W - 40 - bar;
      g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x0, 42, bar, 10); g.fillStyle = colors[i]; g.fillRect(x0, 42, bar * Math.max(0, p[i][2]) / 100, 10);
    }
    for (let i = 0; i < 2; i++) {
      const k = kiteAt(i), pulling = now - pullAt[i] < 500;
      g.strokeStyle = pulling ? "#fff3a0" : "rgba(255,255,255,.7)"; g.lineWidth = pulling ? 3 : 1.5;
      g.beginPath(); g.moveTo(i === 0 ? W * 0.25 : W * 0.75, H - 24); g.quadraticCurveTo((k.x + (i === 0 ? W * 0.25 : W * 0.75)) / 2, k.y + (H - k.y) * 0.65, k.x, k.y); g.stroke();
      g.fillStyle = colors[i]; g.beginPath(); g.moveTo(k.x, k.y - 22); g.lineTo(k.x + 15, k.y); g.lineTo(k.x, k.y + 22); g.lineTo(k.x - 15, k.y); g.closePath(); g.fill();
      g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(k.x, k.y - 22); g.lineTo(k.x, k.y + 22); g.moveTo(k.x - 15, k.y); g.lineTo(k.x + 15, k.y); g.stroke();
      g.strokeStyle = colors[i]; g.beginPath(); g.moveTo(k.x, k.y + 22); for (let t = 1; t <= 4; t++) g.lineTo(k.x + (t % 2 ? -6 : 6), k.y + 22 + t * 7); g.stroke();
      if (mine(i)) label("you", k.x, k.y - 28, 13, "#fff");
    }
    const a = kiteAt(0), b = kiteAt(1);
    if (Math.abs(a.x - b.x) < 58 && Math.abs(a.y - b.y) < 46) label("⚔ close: pull!", (a.x + b.x) / 2, Math.min(a.y, b.y) - 36, 16, "#fff3a0");
  }

  // ------------------------------------------------------------------ pok-ta-pok in 3D, on the real Great Ball Court
  // The court is 30 m wide and 70 m long, centred on (CANCUN_X - 150, -35) with its long walls east and west of you. You and the other player each keep to your own half (north and
  // south of the middle line). The server owns the ball; here it is only drawn where the server says it is.
  const court = () => ({ x: CANCUN_X - 150, z: -35 });
  const HALF_U = 12.5, HALF_W = 34;

  function makeBallFig(pl, color) {
    const fig = createFigure(); paintFigure(fig.mats, pl.look); applyAccessories(fig, pl.look.acc);
    fig.sword.visible = false; fig.g.rotation.order = "YXZ";
    const nm = document.createElement("canvas"); nm.width = 256; nm.height = 64; const x = nm.getContext("2d");
    x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(0, 8, 256, 48); x.fillStyle = color; x.fillText(pl.name.replace(" (practice bot)", " (bot)"), 128, 44);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nm), depthTest: false, transparent: true })); tag.scale.set(2.4, 0.6, 1); tag.position.y = 2.2; tag.renderOrder = 10; fig.g.add(tag);
    scene.add(fig.g); return fig;
  }
  function start3dWatch(msg) {                                         // watching: both players are drawn, you stand beside the court's south end and can walk about
    if (city !== "cancun") { send({ t: "watch", a: "leave" }); toast("The ball game is played on the Great Ball Court in Cancún."); return; }
    closePanels(); Vitals.stopRest();
    m = msg; m.kind = "ball"; st = null; note = ""; sendT = 0;
    const c = court();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshLambertMaterial({ color: 0x7a2d12 })); ball.position.set(c.x, 6, c.z); scene.add(ball);
    const figs = m.players.map((pl, i) => { const f = makeBallFig(pl, i === 0 ? "#9fe0ff" : "#ffb09c"); f.g.position.set(c.x, 0.05, c.z + (i === 0 ? -12 : 12)); return f; });
    const hud = document.createElement("div"); hud.id = "ball-hud"; hud.innerHTML = '<b id="bh-score"></b><span id="bh-note"></span><small id="bh-help"></small>'; document.body.append(hud);
    hud.querySelector("#bh-help").textContent = "You are watching. Walk about to find a good view. 1 2 3 4 cheer. Esc stops watching.";
    bg = { ball, figs, hud, watch: true, tx: [c.x, c.x], tz: [c.z - 12, c.z + 12], tyaw: [0, Math.PI], phase: [0, 0] };
    mode = "online"; placeAt(c.x + 18, c.z + 40, Math.PI); player.pitch = -0.1; cheerBar(true);
    toast(`Watching pok-ta-pok: ${m.players.map((p) => p.name).join(" vs ")}.`);
  }
  function updateBallWatch(dt) {
    updatePlayer(dt);
    const c = court(), k = Math.min(1, dt * 14);
    if (st && st.b) { bg.ball.position.x += (c.x + st.b[0] - bg.ball.position.x) * k; bg.ball.position.y += (st.b[1] - bg.ball.position.y) * k; bg.ball.position.z += (c.z + st.b[2] - bg.ball.position.z) * k; }
    bg.figs.forEach((f, i) => {
      if (st && st.p && st.p[i]) { bg.tx[i] = c.x + st.p[i][0]; bg.tz[i] = c.z + st.p[i][1]; bg.tyaw[i] = st.p[i][2]; }
      const px = f.g.position.x, pz = f.g.position.z;
      f.g.position.x += (bg.tx[i] - px) * k; f.g.position.z += (bg.tz[i] - pz) * k; f.g.position.y = 0.05;
      let dy = bg.tyaw[i] - f.g.rotation.y; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; f.g.rotation.y += dy * k;
      const speed = Math.hypot(bg.tx[i] - px, bg.tz[i] - pz) / Math.max(dt, 0.001); f.phase = (f.phase || 0) + dt * Math.min(speed, 8) * 1.1;
      const w = Math.min(1, speed / 5) * 0.7 * Math.sin(f.phase), hit = performance.now() - hitAt[i] < 220;
      f.parts.armL.rotation.x = -w; f.parts.armR.rotation.x = hit ? 2.2 : w; f.parts.legL.rotation.x = -w; f.parts.legR.rotation.x = w;
    });
    noteT -= dt; if (noteT <= 0) note = "";
    const s = st ? st.s : [0, 0];
    bg.hud.querySelector("#bh-score").textContent = `${nameOf(0)} ${s[0]}  –  ${s[1]} ${nameOf(1)}${st && st.w ? `  ·  👀 ${st.w}` : ""}`;
    bg.hud.querySelector("#bh-note").textContent = note;
  }

  function start3d(msg) {
    if (msg.watch) return start3dWatch(msg);
    if (city !== "cancun") { send({ t: "leave" }); toast("The ball game is played on the Great Ball Court in Cancún."); return; }
    closePanels(); Vitals.stopRest();
    m = msg; m.kind = "ball"; st = null; note = ""; sendT = 0;
    const c = court(), me0 = m.you === 0, pl = m.players[foe()];
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), new THREE.MeshLambertMaterial({ color: 0x7a2d12 }));
    ball.position.set(c.x, 6, c.z); scene.add(ball);
    const fig = createFigure(); paintFigure(fig.mats, pl.look); applyAccessories(fig, pl.look.acc);
    fig.sword.visible = false; fig.g.rotation.order = "YXZ";
    const nm = document.createElement("canvas"); nm.width = 256; nm.height = 64; const x = nm.getContext("2d");
    x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(0, 8, 256, 48); x.fillStyle = "#ffb09c"; x.fillText(pl.name.replace(" (practice bot)", " (bot)"), 128, 44);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nm), depthTest: false, transparent: true })); tag.scale.set(2.4, 0.6, 1); tag.position.y = 2.2; tag.renderOrder = 10; fig.g.add(tag);
    fig.g.position.set(c.x, 0.05, c.z + (me0 ? 12 : -12)); fig.g.rotation.y = me0 ? 0 : Math.PI; scene.add(fig.g);
    const hud = document.createElement("div"); hud.id = "ball-hud"; hud.innerHTML = '<b id="bh-score"></b><span id="bh-note"></span><small id="bh-help"></small>'; document.body.append(hud);
    hud.querySelector("#bh-help").textContent = HELP.ball;
    bg = { ball, fig, hud, last: [0, 0], tx: c.x, tz: c.z + (me0 ? 12 : -12), tyaw: me0 ? 0 : Math.PI, phase: 0, prev: null };
    mode = "online";
    placeAt(c.x, c.z + (me0 ? -12 : 12), me0 ? Math.PI : 0); player.pitch = -0.12;
    Sfx.play("horn"); toast(`Pok-ta-pok${m.ranked ? " (ranked)" : ""}! Hit the ball with Space, keep it off your half.`);
  }

  function swing() { if (m && m.watch) return; if (bg && m) { send({ t: "hit", yaw: +player.yaw.toFixed(3) }); } else if (dg && m) { send({ t: "stroke" }); } }

  function update(dt) {
    if (dg && m) { updateDragon(dt); return; }
    if (!bg || !m) return;
    if (bg.watch) { updateBallWatch(dt); return; }
    updatePlayer(dt);
    const c = court(), lo = me() === 0 ? -HALF_W : 0.8, hi = me() === 0 ? -0.8 : HALF_W;
    player.x = Math.max(c.x - HALF_U, Math.min(c.x + HALF_U, player.x)); player.z = Math.max(c.z + lo, Math.min(c.z + hi, player.z));
    sendT -= dt; if (sendT <= 0) { sendT = 0.066; send({ t: "pos", x: +(player.x - c.x).toFixed(2), z: +(player.z - c.z).toFixed(2), yaw: +player.yaw.toFixed(3) }); }
    const k = Math.min(1, dt * 14);
    if (st && st.b) {
      bg.ball.position.x += (c.x + st.b[0] - bg.ball.position.x) * k; bg.ball.position.y += (st.b[1] - bg.ball.position.y) * k; bg.ball.position.z += (c.z + st.b[2] - bg.ball.position.z) * k;
    }
    if (st && st.p) { const o = st.p[foe()]; bg.tx = c.x + o[0]; bg.tz = c.z + o[1]; bg.tyaw = o[2]; }
    const f = bg.fig, px = f.g.position.x, pz = f.g.position.z;
    f.g.position.x += (bg.tx - px) * k; f.g.position.z += (bg.tz - pz) * k; f.g.position.y = 0.05;
    let dy = bg.tyaw - f.g.rotation.y; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI; f.g.rotation.y += dy * k;
    const speed = Math.hypot(bg.tx - px, bg.tz - pz) / Math.max(dt, 0.001); f.phase = (f.phase || 0) + dt * Math.min(speed, 8) * 1.1;
    const w = Math.min(1, speed / 5) * 0.7 * Math.sin(f.phase), hit = performance.now() - hitAt[foe()] < 220;
    f.parts.armL.rotation.x = -w; f.parts.armR.rotation.x = hit ? 2.2 : w; f.parts.legL.rotation.x = -w; f.parts.legR.rotation.x = w;
    noteT -= dt; if (noteT <= 0) note = "";
    const s = st ? st.s : [0, 0];
    bg.hud.querySelector("#bh-score").textContent = `${nameOf(0)} ${s[0]}  –  ${s[1]} ${nameOf(1)}`;
    bg.hud.querySelector("#bh-note").textContent = note;
  }

  function cleanup3d() {
    if (!bg) return;
    scene.remove(bg.ball); if (bg.figs) bg.figs.forEach((f) => scene.remove(f.g)); else scene.remove(bg.fig.g); bg.hud.remove(); bg = null; cheerBar(false);
    const c = court(); placeAt(c.x + 18, c.z + 40, Math.PI); player.pitch = -0.02;       // back on foot beside the court's south end
  }

  // ------------------------------------------------------------------ the dragon boat race on Kunming Lake (Beijing)
  // Four dragon boats race 250 m east across the lake. A drum beats every 0.6 s: press Space (or A and D in turn) on each beat. The server keeps the beat and judges every stroke.
  const BOAT_COLORS = [0xd9341f, 0x2c7fe0, 0x2f8f4a, 0xf2c21b];
  function makeBoat(color) {
    const g = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ color }), dark = new THREE.MeshLambertMaterial({ color: 0x3a2a1a }), gold = new THREE.MeshLambertMaterial({ color: 0xe2b52a }), skin = new THREE.MeshLambertMaterial({ color: 0xd9a77a });
    const part = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
    const BOXG = new THREE.BoxGeometry(1, 1, 1), SPH = new THREE.SphereGeometry(1, 10, 8);
    part(BOXG, mat, 0, 0.35, 0, 15, 0.9, 1.7); part(BOXG, dark, 0, 0.82, 0, 14, 0.12, 1.5);                  // the long hull and its deck
    part(BOXG, mat, 8.2, 0.7, 0, 1.6, 0.8, 1.2); part(BOXG, mat, -8.3, 0.9, 0, 1.4, 1.0, 1.2);               // the raised bow and stern
    part(BOXG, mat, 9.4, 1.4, 0, 0.7, 1.8, 0.7);                                                              // the neck of the dragon
    const head = part(SPH, gold, 10.1, 2.4, 0, 0.9, 0.7, 0.7);                                               // the dragon's head, with horns and a red mouth
    part(new THREE.ConeGeometry(0.18, 0.9, 6), gold, 9.9, 3.2, 0.3).rotation.z = -0.3; part(new THREE.ConeGeometry(0.18, 0.9, 6), gold, 9.9, 3.2, -0.3).rotation.z = -0.3;
    part(BOXG, new THREE.MeshLambertMaterial({ color: 0xb02a22 }), 10.7, 2.15, 0, 0.7, 0.2, 0.5);
    part(new THREE.ConeGeometry(0.3, 1.6, 6), gold, -9.3, 1.9, 0).rotation.z = 0.7;                           // the tail
    const drum = part(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 12), new THREE.MeshLambertMaterial({ color: 0xa8281f }), 6.4, 1.3, 0); drum.userData.drum = true;
    const rows = [];                                                                                           // the paddlers, two long rows
    for (let k = 0; k < 10; k++) for (const sz of [-1, 1]) {
      const x = 4 - k * 1.3, body = part(BOXG, mat, x, 1.25, sz * 0.55, 0.45, 0.6, 0.4), head2 = part(SPH, skin, x, 1.78, sz * 0.55, 0.2, 0.2, 0.2), pad = part(BOXG, dark, x, 1.0, sz * 1.05, 0.12, 0.12, 1.8);
      rows.push({ body, head2, pad, k, sz });
    }
    g.userData.rows = rows; g.userData.drum = drum;
    return g;
  }

  function startDragon(msg) {
    if (city !== "beijing") { send(msg.watch ? { t: "watch", a: "leave" } : { t: "leave" }); toast("The dragon boat race is on Kunming Lake in Beijing."); return; }
    closePanels(); Vitals.stopRest();
    m = msg; m.kind = "dragon"; st = null; note = "";
    const c = { x: BEIJING_X + Beijing.COURSE.x0, lanes: Beijing.COURSE.lanes };
    const boats = m.players.map((pl, i) => {
      const g = makeBoat(BOAT_COLORS[i % 4]); g.position.set(c.x, 0.06, c.lanes[i % 4]); scene.add(g);
      const nm = document.createElement("canvas"); nm.width = 256; nm.height = 64; const x = nm.getContext("2d");
      x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(0,0,0,.55)"; x.fillRect(0, 8, 256, 48); x.fillStyle = mine(i) ? "#9fe0ff" : "#fff3cf"; x.fillText(pl.name.replace(" (practice bot)", ""), 128, 44);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nm), depthTest: false, transparent: true })); tag.scale.set(4, 1, 1); tag.position.set(0, 5, 0); tag.renderOrder = 10; g.add(tag);
      return { g, s: 0, v: 0, phase: Math.random() * 6, last: 0 };
    });
    const hud = document.createElement("div"); hud.id = "dragon-hud";
    hud.innerHTML = '<b id="dh-pos"></b><div id="dh-drum"><i></i></div><span id="dh-note"></span><small id="dh-help"></small>'; document.body.append(hud);
    hud.querySelector("#dh-help").textContent = m.watch ? "You are watching: the camera follows the leading boat. 1 2 3 4 cheer. Esc stops watching." : "Press Space (or A and D in turn) on every beat of the drum. Strokes on the beat drive the boat hard. Esc leaves.";
    dg = { boats, hud, t0: performance.now() + m.countdown * 1000, beat: m.beat * 1000, len: m.length, last: -1, noteT: 0, cx: c.x };
    mode = "online"; Beijing.setBoating(true);
    addEventListener("keydown", onDragonKey, true);
    player.yaw = -Math.PI / 2; player.pitch = -0.14; player.vx = player.vz = 0;
    if (m.watch) { cheerBar(true); toast(`Watching the dragon boat race: ${m.players.map((p) => p.name).join(", ")}.`); }
    else { Sfx.play("horn"); toast("Dragon boat race! Paddle on the beat of the drum."); }
  }
  function onDragonKey(e) {
    if (!dg || !m) return;
    if (e.code === "Escape") { e.preventDefault(); e.stopPropagation(); leave(); return; }
    if (m.watch) return;
    if (e.code !== "Space" && e.code !== "KeyA" && e.code !== "KeyD" && e.code !== "ArrowLeft" && e.code !== "ArrowRight") return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    if (performance.now() < dg.t0 - 300) return;
    send({ t: "stroke" }); dg.boats[me()].last = performance.now();
  }
  function onDragon(s) {
    if (!dg || s.t !== "dragon") return;
    st = s;
    for (const e of s.ev || []) if (e[0] === "stroke" && e[1] === me()) { dg.q = e[2]; dg.qT = performance.now(); }
  }

  function updateDragon(dt) {
    const now = performance.now(), tNow = now - dg.t0;
    // the camera follows your boat (or, when watching, the one in front)
    const focus = m.watch ? dg.boats.reduce((best, b, i) => (b.s > dg.boats[best].s ? i : best), 0) : me();
    const mine = dg.boats[focus];
    for (let i = 0; i < dg.boats.length; i++) {
      const b = dg.boats[i], row = st && st.p ? st.p[i] : null;
      if (row) { b.s += (row[1] - b.s) * Math.min(1, dt * 6); b.v = row[2]; }
      b.s += b.v * dt * 0.2;
      b.g.position.x = dg.cx + b.s; b.g.position.y = 0.06 + Math.sin(now / 400 + i) * 0.04;
      b.g.rotation.z = Math.sin(now / 500 + i * 2) * 0.012;
      b.phase += dt * (1.5 + b.v * 1.4);
      for (const r of b.g.userData.rows) { const sw = Math.sin(b.phase + r.k * 0.2 + (r.sz > 0 ? 0 : 0)); r.pad.rotation.z = sw * 0.5; r.pad.position.y = 1.0 + Math.max(0, sw) * 0.35; r.body.rotation.z = sw * 0.12; r.head2.position.x = r.body.position.x + sw * 0.08; }
      const k = b.g.userData.drum; if (i === focus) k.scale.set(1 + 0.25 * Math.max(0, 1 - (((tNow % dg.beat) + dg.beat) % dg.beat) / 140), 1, 1 + 0.25 * Math.max(0, 1 - (((tNow % dg.beat) + dg.beat) % dg.beat) / 140));
    }
    player.x = mine.g.position.x + 1.5; player.z = mine.g.position.z; player.feet = 1.0; player.y = player.feet + EYE; player.yaw = -Math.PI / 2; player.vx = player.vz = 0;
    // the drum: a sound on every beat, a circle that pulses, and the countdown before the start
    const beatNo = Math.floor(tNow / dg.beat);
    if (tNow >= 0 && beatNo !== dg.last) { dg.last = beatNo; Sfx.play("drum"); }
    const phase = tNow >= 0 ? ((tNow % dg.beat) + dg.beat) % dg.beat : 0;
    const ring = dg.hud.querySelector("#dh-drum i"); ring.style.transform = `scale(${1 + 0.6 * Math.max(0, 1 - phase / 160)})`; ring.style.opacity = tNow < 0 ? 0.35 : 1;
    const order = dg.boats.map((b, i) => [i, b.s]).sort((a, b) => b[1] - a[1]).map((x) => x[0]), place = order.indexOf(focus) + 1;
    const q = dg.q !== undefined && now - dg.qT < 700 ? (dg.q >= 1 ? "Perfect!" : dg.q >= 0.6 ? "Good" : "Ragged...") : "";
    if (m.watch) dg.hud.querySelector("#dh-pos").textContent = tNow < 0 ? `Get ready... ${Math.ceil(-tNow / 1000)}` : `${nameOf(focus)} leads · ${Math.min(dg.len, Math.round(mine.s))} / ${Math.round(dg.len)} m${st && st.w ? `  ·  👀 ${st.w}` : ""}`;
    else dg.hud.querySelector("#dh-pos").textContent = tNow < 0 ? `Get ready... ${Math.ceil(-tNow / 1000)}` : `${["1st", "2nd", "3rd", "4th"][place - 1]} of ${dg.boats.length} · ${Math.min(dg.len, Math.round(mine.s))} / ${Math.round(dg.len)} m · ${Math.round(mine.v * 3.6)} km/h`;
    dg.hud.querySelector("#dh-note").textContent = tNow < 0 ? "" : q;
  }

  function endDragon(res) {
    if (!m || !dg) return;
    if (m.watch) {
      const first = res.order[0], table = res.order.map((o, k) => `${k + 1}. ${o.name}${o.time != null ? ` (${o.time.toFixed(1)} s)` : " (did not finish)"}`).join("  ·  ");
      cleanup();
      showResult(first && first.time != null ? `${first.name} won the race` : "The race is over", `${table}.`, [
        { label: "Watch another", fn: () => { closePanels(); openWatch(); } },
        { label: "Close", fn: closePanels },
      ]);
      return;
    }
    const idx = m.you, rank = res.order.findIndex((o) => o.i === idx) + 1, n = res.order.length;
    const prize = rank === 1 ? 60 : rank === 2 && n >= 3 ? 25 : 0;
    Vitals.coins += prize;
    const me0 = res.order[rank - 1], ords = ["", "1st", "2nd", "3rd", "4th"];
    const table = res.order.map((o, k) => `${k + 1}. ${o.name}${o.time != null ? ` (${o.time.toFixed(1)} s)` : " (did not finish)"}`).join("  ·  ");
    cleanup();
    showResult(rank === 1 ? "You won the dragon boat race!" : `You finished ${ords[rank] || "last"}`, `${table}. ${me0 && me0.strokes ? `${me0.perfect} of your ${me0.strokes} strokes were right on the beat.` : ""}${prize ? ` Prize: +${prize} denarii.` : ""}`, [
      { label: "Race again", fn: () => { closePanels(); Online.openLobby(); } },
      { label: "Close", fn: closePanels },
    ]);
  }
  function cleanupDragon() {
    if (!dg) return;
    removeEventListener("keydown", onDragonKey, true);
    for (const b of dg.boats) scene.remove(b.g);
    dg.hud.remove(); dg = null; Beijing.setBoating(false); cheerBar(false);
    placeAt(BEIJING_X + Beijing.DOCK.x - 3, Beijing.DOCK.z, -Math.PI / 2); player.pitch = -0.02;
  }

  // ------------------------------------------------------------------ xiangqi (Chinese chess): the board is drawn here, every rule is the server's
  const XQ_CH = { R: "俥", H: "傌", E: "相", A: "仕", G: "帥", C: "炮", P: "兵", r: "車", h: "馬", e: "象", a: "士", g: "將", c: "砲", p: "卒" };
  const XQ = { x0: 36, y0: 36, cell: 56 };
  let xqSel = null;
  const xqIdx = (r, c) => (me() === 1 ? (9 - r) * 9 + (8 - c) : r * 9 + c);              // the board turns round so your side is always at the bottom
  const xqPos = (i) => { let r = Math.floor(i / 9), c = i % 9; if (me() === 1) { r = 9 - r; c = 8 - c; } return { x: XQ.x0 + c * XQ.cell, y: XQ.y0 + r * XQ.cell }; };
  function xqClick(e) {
    if (!m || m.watch || m.kind !== "xiangqi" || !st || st.turn !== me()) return;
    const rect = cv.getBoundingClientRect(), k = cv.width / rect.width, x = (e.clientX - rect.left) * k, y = (e.clientY - rect.top) * k;
    const c = Math.round((x - XQ.x0) / XQ.cell), r = Math.round((y - XQ.y0) / XQ.cell);
    if (c < 0 || c > 8 || r < 0 || r > 9 || Math.hypot(x - (XQ.x0 + c * XQ.cell), y - (XQ.y0 + r * XQ.cell)) > XQ.cell * 0.55) return;
    const i = xqIdx(r, c), own = (ch) => ch !== "." && (ch === ch.toUpperCase()) === (me() === 0);
    if (xqSel !== null && st.legal.some((l) => l[0] === xqSel && l[1] === i)) { send({ t: "move", f: xqSel, to: i }); xqSel = null; return; }
    xqSel = own(st.b[i]) && st.legal.some((l) => l[0] === i) ? i : null;
  }
  function xqResign() { Dialog.confirm("Resign this game?").then((yes) => { if (yes && m && m.kind === "xiangqi") send({ t: "resign" }); }); }
  function xqSetup() {
    cv.width = 520; cv.height = 580; cv.style.aspectRatio = "520 / 580"; cv.style.width = "min(94vw, 62vh)";
    cv.addEventListener("click", xqClick);
    const b = ov.querySelector("#mini-resign") || Object.assign(document.createElement("button"), { id: "mini-resign", type: "button", textContent: "Resign" });
    b.onclick = xqResign; b.hidden = !!m.watch; ov.insertBefore(b, ov.querySelector("#mini-leave"));
    xqSel = null;
  }
  function xqCleanup() {
    if (!cv || !cv.style.aspectRatio) return;
    cv.removeEventListener("click", xqClick); cv.width = 640; cv.height = 360; cv.style.aspectRatio = ""; cv.style.width = "";
    const b = ov.querySelector("#mini-resign"); if (b) b.hidden = true;
  }
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  function drawXq() {
    const { x0, y0, cell } = XQ;
    g.fillStyle = "#c9a265"; g.fillRect(0, 0, 520, 580);
    g.strokeStyle = "#4a3418"; g.lineWidth = 2; g.strokeRect(x0 - 8, y0 - 8, 8 * cell + 16, 9 * cell + 16);
    g.lineWidth = 1.4;
    for (let r = 0; r < 10; r++) { g.beginPath(); g.moveTo(x0, y0 + r * cell); g.lineTo(x0 + 8 * cell, y0 + r * cell); g.stroke(); }
    for (let c = 0; c < 9; c++) {
      g.beginPath(); g.moveTo(x0 + c * cell, y0); g.lineTo(x0 + c * cell, y0 + 4 * cell); g.moveTo(x0 + c * cell, y0 + 5 * cell); g.lineTo(x0 + c * cell, y0 + 9 * cell); g.stroke();
      if (c === 0 || c === 8) { g.beginPath(); g.moveTo(x0 + c * cell, y0 + 4 * cell); g.lineTo(x0 + c * cell, y0 + 5 * cell); g.stroke(); }
    }
    for (const r0 of [0, 7]) for (const s of [[3, 5], [5, 3]]) { g.beginPath(); g.moveTo(x0 + s[0] * cell, y0 + r0 * cell); g.lineTo(x0 + s[1] * cell, y0 + (r0 + 2) * cell); g.stroke(); }    // the two palaces
    g.fillStyle = "#6a4a20"; g.font = "bold 24px serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("楚 河", x0 + 2 * cell, y0 + 4.5 * cell); g.fillText("漢 界", x0 + 6 * cell, y0 + 4.5 * cell);
    if (!st) { label("Setting up the board...", 260, 290, 20); return; }
    if (st.last) for (const i of st.last) { const p = xqPos(i); g.fillStyle = "rgba(120,190,255,.45)"; g.fillRect(p.x - cell / 2 + 3, p.y - cell / 2 + 3, cell - 6, cell - 6); }
    for (let i = 0; i < 90; i++) {
      const ch = st.b[i]; if (ch === ".") continue;
      const p = xqPos(i), red = ch === ch.toUpperCase();
      g.beginPath(); g.arc(p.x, p.y, 24, 0, Math.PI * 2); g.fillStyle = "#f4e3b8"; g.fill(); g.lineWidth = i === xqSel ? 4 : 2; g.strokeStyle = i === xqSel ? "#ffb400" : red ? "#b3262b" : "#222"; g.stroke();
      g.beginPath(); g.arc(p.x, p.y, 19, 0, Math.PI * 2); g.lineWidth = 1; g.stroke();
      g.fillStyle = red ? "#b3262b" : "#1a1a1a"; g.font = "bold 27px serif"; g.fillText(XQ_CH[ch], p.x, p.y + 1);
    }
    if (xqSel !== null) for (const l of st.legal) if (l[0] === xqSel) { const p = xqPos(l[1]); g.beginPath(); g.arc(p.x, p.y, st.b[l[1]] === "." ? 7 : 27, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = "rgba(30,150,70,.9)"; if (st.b[l[1]] === ".") { g.fillStyle = "rgba(30,150,70,.8)"; g.fill(); } else g.stroke(); }
    const mineT = st.turn === me();
    const clk = (i) => (m.replay ? "" : `  ${mmss(st.clk[i])}`);
    label(`${nameOf(foe())}${clk(foe())}`, 260, 20, 15, st.turn === foe() ? "#ffe08a" : "#4a3418");
    label(`${nameOf(me())}${m.watch ? "" : " (you)"}${clk(me())}`, 260, 568, 15, mineT ? "#7a1a10" : "#4a3418");
    if (st.check) label(mineT && !m.watch ? "You are in check!" : "Check!", 260, 290, 22, "#b3262b");
    label(m.replay ? `Move ${m.replay.i} of ${m.replay.mv.length}` : m.watch ? `${nameOf(st.turn)} to move` : mineT ? "Your move" : "Waiting for their move...", 60, 20, 14, mineT ? "#7a1a10" : "#4a3418");
  }

  // ------------------------------------------------------------------ the end
  function cleanup() {
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener("keydown", onKey, true); removeEventListener("keyup", onUp, true);
    held.clear(); if (ov) ov.classList.remove("show");
    xqCleanup(); cleanup3d(); cleanupDragon();
    const rpBar = document.getElementById("mini-rp"); if (rpBar) rpBar.remove();
    cheerBar(false);
    m = null; st = null;
    if (mode === "online") mode = "walk";
  }
  function end(res) {
    if (!m) return;
    if (m.watch) {                                                       // a match you watched: no prize and no rating, just who won
      const names = m.players.map((p) => p.name), draw = res.winner === -1, kind = m.kind;
      cleanup();
      showResult(draw ? "A draw" : `${names[res.winner]} won`, `${names[0]} against ${names[1]}: ${res.score && kind !== "xiangqi" ? res.score.join(" to ") : ""}${res.reason ? ` (${res.reason})` : ""}.`.replace(": ()", ""), [
        { label: "Watch another", fn: () => { closePanels(); openWatch(); } },
        { label: "Close", fn: closePanels },
      ]);
      return kind;
    }
    const kind = m.kind, won = res.winner === me(), draw = res.winner === -1, ranked = !!res.ranked;
    const prize = won ? (ranked ? 40 : 20) : 0;
    Vitals.coins += prize;
    const why = { throws: won ? "You won two throws." : "Two throws went against you.", cut: won ? "You cut their string!" : "Your string was cut.", score: won ? "You reached five points first." : "They reached five points first.", ring: won ? "You sent the ball through the ring: you win the match at once!" : "They sent the ball through the ring and won the match at once.", checkmate: won ? "Checkmate! Their general has no escape." : "Checkmate: your general has no escape.", stalemate: won ? "They have no legal move left: in xiangqi that loses." : "You have no legal move left: in xiangqi that loses.", resign: won ? "They resigned." : "You resigned.", repetition: "The same position came up three times: a draw.", draw: "No piece was taken for 60 moves each: a draw.", time: draw ? "Time ran out with the score level." : won ? "Time ran out and you were ahead." : "Time ran out and they were ahead.", left: won ? "Your opponent left the game." : "You left.", empty: "Everyone left." }[res.reason] || "";
    const ladder = ranked && res.rank && typeof Online !== "undefined" ? Online.ladderText(res.rank) : "";
    cleanup();
    showResult(draw ? "A draw" : won ? "Victory!" : "Defeat", `${why}${prize ? ` Prize: +${prize} denarii.` : ""}${ladder}`, [
      ...(res.rp ? [{ label: "Watch the replay", fn: () => { closePanels(); send({ t: "replay", id: res.rp }); } }] : []),
      { label: "Play again", fn: () => { closePanels(); Online.openLobby(); } },
      { label: "Close", fn: closePanels },
    ]);
    return kind;
  }
  function leave() {
    if (!m) return;
    if (m.replay) { cleanup(); return; }
    send(m.watch ? { t: "watch", a: "leave" } : { t: "leave" });
    const was = m.watch; cleanup(); toast(was ? "You stopped watching." : "You left the game.");
  }
  function lost() { if (m) { cleanup(); toast("The connection to the game server was lost."); } }

  // ------------------------------------------------------------------ replaying a finished xiangqi game (from a profile, or from the end of your own game)
  function rpBoard(rp, n) {
    const b = rp.b0.split("");
    for (let i = 0; i < n; i++) { const [f, t] = rp.mv[i]; b[t] = b[f]; b[f] = "."; }
    return b.join("");
  }
  function rpStep(d) {
    const r = m && m.replay; if (!r) return false;
    const n = Math.max(0, Math.min(r.mv.length, r.i + d)); if (n === r.i) return false;
    r.i = n;
    st = { k: "xiangqi", b: rpBoard(r, n), turn: n % 2, legal: [], last: n ? r.mv[n - 1] : null, check: false, clk: [0, 0], s: [0, 0], ev: [] };
    if (d > 0) Sfx.play("clack");
    return true;
  }
  function replay(msg) {
    if (!msg.rp || typeof msg.b0 !== "string") { toast("That replay is no longer kept."); return; }
    if (m || typeof mode === "undefined" || mode !== "walk") return;
    if (!ov) build();
    closePanels(); Vitals.stopRest();
    if (document.pointerLockElement) document.exitPointerLock();
    const rp = msg.rp;
    m = { kind: "xiangqi", mode: "xiangqi", watch: true, you: 0, players: rp.names.map((n) => ({ name: n })), replay: { mv: rp.mv, b0: msg.b0, i: 0, auto: false, t: 0 } };
    m.title = `▶ ${rp.names[0]} vs ${rp.names[1]}${rp.w === -1 ? " (draw)" : ` (${rp.names[rp.w]} won)`}`;
    note = ""; held.clear(); mode = "online"; head.textContent = m.title;
    help.textContent = "Replay: Left and Right arrows step through the moves, Space plays them on. Esc closes.";
    ov.querySelector("#mini-leave").textContent = "Close the replay";
    xqSetup(); rpStep(0); st = { k: "xiangqi", b: msg.b0, turn: 0, legal: [], last: null, check: false, clk: [0, 0], s: [0, 0], ev: [] };
    const bar = document.createElement("div"); bar.id = "mini-rp";
    for (const [label, fn] of [["◀ Back", () => rpStep(-1)], ["▶ Play / pause", () => { m.replay.auto = !m.replay.auto; m.replay.t = 0; }], ["Next ▶", () => rpStep(1)]]) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", fn); bar.append(b);
    }
    ov.insertBefore(bar, ov.querySelector("#mini-leave"));
    ov.classList.add("show");
    addEventListener("keydown", onKey, true); addEventListener("keyup", onUp, true);
    last = performance.now(); raf = requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ cheering: watchers press 1 to 4 (or the buttons) and everybody in the match sees the emoji float up
  const CHEERS = ["👏", "🔥", "🎉", "😮"];
  function cheerKey(e) {
    if (!m || !m.watch || e.repeat || e.ctrlKey || e.metaKey || e.altKey || !/^Digit[1-4]$/.test(e.code)) return;
    e.preventDefault(); e.stopPropagation(); send({ t: "watch", a: "cheer", e: CHEERS[Number(e.code.slice(5)) - 1] });
  }
  function cheerBar(on) {
    const old = document.getElementById("cheer-bar"); if (old) old.remove();
    removeEventListener("keydown", cheerKey, true);
    if (!on) return;
    const bar = document.createElement("div"); bar.id = "cheer-bar";
    CHEERS.forEach((emo, i) => { const b = document.createElement("button"); b.type = "button"; b.textContent = emo; b.title = `Cheer (${i + 1})`; b.addEventListener("click", () => send({ t: "watch", a: "cheer", e: emo })); bar.append(b); });
    document.body.append(bar); addEventListener("keydown", cheerKey, true);
  }
  function onCheer(c) {                                                 // somebody shouted: an emoji with their name floats up
    if (!c || !CHEERS.includes(c.e)) return;
    const f = document.createElement("div"); f.className = "cheer-float"; f.style.left = `${15 + Math.random() * 70}%`;
    f.textContent = `${c.e} `; const n = document.createElement("small"); n.textContent = String(c.name || "").slice(0, 16); f.append(n);
    document.body.append(f); setTimeout(() => f.remove(), 3200);
  }

  // ------------------------------------------------------------------ the list of matches you can watch (PvP menu: Watch a match)
  let specTimer = 0;
  const SPEC_NAMES = { xiangqi: "Xiangqi", kushti: "Kushti", kites: "Kite fight", ball: "Pok-ta-pok", dragon: "Dragon boat race" };
  function openWatch() {
    if (!Online.connected) { toast("Watching needs the game server: wait to be connected."); return; }
    if (typeof mode !== "undefined" && mode !== "walk") return;
    send({ t: "watch", a: "list" }); renderWatch(null); openPanel("#spec");
    clearInterval(specTimer); specTimer = setInterval(() => { if (!document.getElementById("spec").classList.contains("show")) { clearInterval(specTimer); return; } send({ t: "watch", a: "list" }); }, 4000);
  }
  function renderWatch(list) {
    const body = document.getElementById("spec-body"); if (!body) return; body.replaceChildren();
    if (!list) { const p = document.createElement("p"); p.className = "dnote"; p.textContent = "Looking for matches..."; body.append(p); return; }
    if (!list.length) { const p = document.createElement("p"); p.className = "dnote"; p.textContent = "No match between real people is on right now. Start one in Play online, then others can watch you."; body.append(p); return; }
    for (const r of list) {
      const row = document.createElement("div"); row.className = "sp-row";
      const t = document.createElement("span"); t.textContent = `${r.tour ? "🏟️ " : ""}${SPEC_NAMES[r.kind] || r.kind}: ${r.names.join(" vs ")}  ·  ${Math.floor(r.sec / 60)} min${r.n ? `  ·  👀 ${r.n}` : ""}`;
      const b = document.createElement("button"); b.type = "button"; b.textContent = "Watch";
      b.addEventListener("click", () => { closePanels(); send({ t: "watch", a: "join", room: r.room }); });
      row.append(t, b); body.append(row);
    }
  }
  function onWatch(w) {
    if (w.a === "list") renderWatch(Array.isArray(w.list) ? w.list : []);
    else if (w.a === "no") toast(w.msg || "You cannot watch that match.");
  }

  return { start, on, onWatch, onCheer, openWatch, replay, onDragon, end, endDragon, leave, lost, swing, update, get active() { return !!m; }, get is3d() { return !!bg || !!dg; } };
})();
