"use strict";
// City games against real people: kushti wrestling and a kite fight (Old Delhi) and the ball game pok-ta-pok (Cancún). Each is a small two-player game on a drawing that covers the screen.
// The browser only says what you are doing (a key press, where your kite or your player is); the game server decides every throw, cut and point and who wins (it is also what a
// practice bot is, when nobody else is looking). You pick one in 🌐 Play online, or challenge somebody to it from 🎯 Challenge someone. Winning pays 40 denarii (20 against a bot)
// and counts towards your rank when it is against another person. Depends on online.js (Online.navalSend, Online.ladderText, Online.openLobby), vitals.js and the globals of game.js.

const Mini = (() => {
  const W = 640, H = 360;
  const TITLES = { kushti: "🤼 Kushti wrestling in the akhara", kites: "🪁 Kite fight over Old Delhi", ball: "⚽ Pok-ta-pok on the Great Ball Court" };
  const HELP = {
    kushti: "Wait for GO, then press Space as fast as you can. More presses than your opponent wins the throw. First to two throws wins.",
    kites: "A D W S (or the arrow keys) fly your kite. Get close to the other kite and press Space to pull: their string frays. First string cut loses. Esc leaves.",
    ball: "A D (or the arrows) move you, Space hits the ball when it is close. It scores 1 when it lands on their side and 3 through the stone ring on their wall. First to 7. Esc leaves.",
  };
  let ov = null, cv = null, g = null, head = null, help = null, m = null, st = null, raf = 0, last = 0, sendT = 0, note = "", noteT = 0;
  const held = new Set();
  let kite = { x: 22, y: 30 }, bx = 25, ball = [50, 30], hitAt = [0, 0], pullAt = [0, 0];
  const send = (o) => Online.navalSend(o);
  const me = () => (m ? m.you : 0), foe = () => 1 - me();
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
    if (typeof mode === "undefined" || mode !== "walk") { send({ t: "leave" }); return; }
    if (!ov) build();
    closePanels(); Vitals.stopRest();
    if (document.pointerLockElement) document.exitPointerLock();
    m = msg; st = null; note = ""; held.clear(); kite = { x: m.you === 0 ? 22 : 78, y: 30 }; bx = m.you === 0 ? 25 : 75; ball = [50, 30]; hitAt = [0, 0]; pullAt = [0, 0];
    mode = "online";
    head.textContent = `${TITLES[m.kind || m.mode]}${m.ranked ? " (ranked)" : ""}`;
    m.kind = m.mode; help.textContent = HELP[m.kind];
    ov.classList.add("show");
    addEventListener("keydown", onKey, true); addEventListener("keyup", onUp, true);
    last = performance.now(); raf = requestAnimationFrame(loop);
    Sfx.play("horn");
  }

  const GAME_KEYS = new Set(["Space", "KeyA", "KeyD", "KeyW", "KeyS", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"]);
  function onKey(e) {
    if (!m || !GAME_KEYS.has(e.code)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.code === "Escape") { leave(); return; }
    if (e.repeat) return;
    held.add(e.code);
    if (e.code === "Space" || (m.kind === "ball" && (e.code === "KeyW" || e.code === "ArrowUp"))) {
      if (m.kind === "kushti") { if (st && st.ph === "mash") send({ t: "press" }); }
      else if (m.kind === "kites") { send({ t: "pull" }); pullAt[me()] = performance.now(); Sfx.play("swing"); }
      else if (m.kind === "ball") { send({ t: "hit" }); }
    }
  }
  function onUp(e) { if (m && GAME_KEYS.has(e.code)) { held.delete(e.code); e.stopPropagation(); } }
  const dir = (neg, pos) => (neg.some((k) => held.has(k)) ? -1 : 0) + (pos.some((k) => held.has(k)) ? 1 : 0);

  function loop(now) {
    if (!m) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (m.kind === "kites") {
      kite.x = Math.max(2, Math.min(98, kite.x + dir(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]) * 40 * dt));
      kite.y = Math.max(4, Math.min(56, kite.y + dir(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]) * 40 * dt));
      sendT -= dt; if (sendT <= 0) { sendT = 0.08; send({ t: "kite", x: +kite.x.toFixed(1), y: +kite.y.toFixed(1) }); }
    } else if (m.kind === "ball") {
      const lo = me() === 0 ? 3 : 53, hi = me() === 0 ? 47 : 97;
      bx = Math.max(lo, Math.min(hi, bx + dir(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]) * 42 * dt));
      sendT -= dt; if (sendT <= 0) { sendT = 0.06; send({ t: "ballx", x: +bx.toFixed(1) }); }
      if (st && st.b) { ball[0] += (st.b[0] - ball[0]) * Math.min(1, dt * 18); ball[1] += (st.b[1] - ball[1]) * Math.min(1, dt * 18); }
    }
    noteT -= dt; if (noteT <= 0) note = "";
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  function on(s) {
    if (!m || s.k !== m.kind) return;
    st = s;
    for (const e of s.ev || []) {
      if (e[0] === "throw") { Sfx.play("hit"); setNote(e[1] === me() ? "You win the throw!" : `${nameOf(e[1])} wins the throw.`); }
      else if (e[0] === "draw") setNote("A draw: the throw is wrestled again.");
      else if (e[0] === "hit") { hitAt[e[1]] = performance.now(); Sfx.play("stone"); }
      else if (e[0] === "point") { Sfx.play(e[2] > 1 ? "medal" : "coin"); setNote(`${e[1] === me() ? "You score" : nameOf(e[1]) + " scores"} ${e[2]}${e[3] === "ring" ? " through the ring!" : ""}`); }
    }
    if (m.kind === "kites" && s.p) for (let i = 0; i < 2; i++) if (s.p[i][3]) pullAt[i] = performance.now();
  }
  function setNote(t) { note = t; noteT = 2.2; }

  // ------------------------------------------------------------------ drawing
  const label = (t, x, y, size = 18, color = "#fff3cf", align = "center") => { g.font = `bold ${size}px Georgia, serif`; g.textAlign = align; g.fillStyle = color; g.fillText(t, x, y); };
  function scoreLine() {
    const s = st ? st.s : [0, 0];
    const col = (i) => (i === me() ? "#9fe0ff" : "#ffb09c");
    label(`${nameOf(0)}`, 150, 26, 16, col(0)); label(`${s[0]}`, 280, 30, 26, col(0));
    label("–", 320, 28, 22); label(`${s[1]}`, 360, 30, 26, col(1)); label(`${nameOf(1)}`, 490, 26, 16, col(1));
  }
  function draw(now) {
    g.clearRect(0, 0, W, H);
    if (m.kind === "kushti") drawKushti(now); else if (m.kind === "kites") drawKites(now); else drawBall(now);
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

  function kiteAt(i) { const p = i === me() ? kite : st && st.p ? { x: st.p[i][0], y: st.p[i][1] } : { x: i ? 78 : 22, y: 30 }; return { x: (p.x / 100) * W, y: H - 24 - (p.y / 60) * (H - 70) }; }
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
      if (i === me()) label("you", k.x, k.y - 28, 13, "#fff");
    }
    const a = kiteAt(0), b = kiteAt(1);
    if (Math.abs(a.x - b.x) < 58 && Math.abs(a.y - b.y) < 46) label("⚔ close: pull!", (a.x + b.x) / 2, Math.min(a.y, b.y) - 36, 16, "#fff3a0");
  }

  const X = (x) => (x / 100) * W, Y = (y) => H - 44 - (y / 50) * (H - 130);
  function drawBall(now) {
    g.fillStyle = "#e9d7a8"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#cdb98a"; g.fillRect(0, H - 44, W, 44);
    g.fillStyle = "#b9a374"; g.fillRect(0, 0, 14, H); g.fillRect(W - 14, 0, 14, H);               // the two long walls
    g.strokeStyle = "#d8a933"; g.lineWidth = 5;
    for (const wx of [14, W - 14]) { g.beginPath(); g.ellipse(wx, (Y(21) + Y(27)) / 2, 8, (Y(21) - Y(27)) / 2, 0, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#6f5a35"; g.fillRect(X(50) - 3, Y(12), 6, H - 44 - Y(12));                       // the net
    scoreLine();
    const px = (i) => (i === me() ? bx : st && st.p ? st.p[i] : i ? 75 : 25);
    for (let i = 0; i < 2; i++) {
      const x = X(px(i)), up = now - hitAt[i] < 160, col = i === me() ? "#2d6cb0" : "#b04a2d";
      g.fillStyle = col; g.fillRect(x - 12, H - 44 - 52, 24, 40); g.fillStyle = "#e7b98b"; g.beginPath(); g.arc(x, H - 44 - 62, 11, 0, Math.PI * 2); g.fill();
      g.strokeStyle = col; g.lineWidth = 6; g.lineCap = "round"; g.beginPath(); g.moveTo(x, H - 44 - 38); g.lineTo(x + (i ? -1 : 1) * 18, H - 44 - (up ? 70 : 24)); g.stroke();
      g.fillStyle = col; g.fillRect(x - 10, H - 44 - 12, 8, 12); g.fillRect(x + 2, H - 44 - 12, 8, 12);
      if (i === me()) label("you", x, H - 44 - 82, 13, "#2d4f80");
    }
    g.fillStyle = "#7a2d12"; g.beginPath(); g.arc(X(ball[0]), Math.min(H - 52, Y(Math.max(0, ball[1]))), 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#3a1406"; g.lineWidth = 2; g.stroke();
  }

  // ------------------------------------------------------------------ the end
  function cleanup() {
    cancelAnimationFrame(raf); raf = 0;
    removeEventListener("keydown", onKey, true); removeEventListener("keyup", onUp, true);
    held.clear(); if (ov) ov.classList.remove("show");
    m = null; st = null;
    if (mode === "online") mode = "walk";
  }
  function end(res) {
    if (!m) return;
    const kind = m.kind, won = res.winner === me(), draw = res.winner === -1, ranked = !!res.ranked;
    const prize = won ? (ranked ? 40 : 20) : 0;
    Vitals.coins += prize;
    const why = { throws: won ? "You won two throws." : "Two throws went against you.", cut: won ? "You cut their string!" : "Your string was cut.", score: won ? "You reached seven points first." : "They reached seven points first.", time: draw ? "Time ran out with the score level." : won ? "Time ran out and you were ahead." : "Time ran out and they were ahead.", left: won ? "Your opponent left the game." : "You left.", empty: "Everyone left." }[res.reason] || "";
    const ladder = ranked && res.rank && typeof Online !== "undefined" ? Online.ladderText(res.rank) : "";
    cleanup();
    showResult(draw ? "A draw" : won ? "Victory!" : "Defeat", `${why}${prize ? ` Prize: +${prize} denarii.` : ""}${ladder}`, [
      { label: "Play again", fn: () => { closePanels(); Online.openLobby(); } },
      { label: "Close", fn: closePanels },
    ]);
    return kind;
  }
  function leave() {
    if (!m) return;
    send({ t: "leave" });
    cleanup(); toast("You left the game.");
  }
  function lost() { if (m) { cleanup(); toast("The connection to the game server was lost."); } }

  return { start, on, end, leave, lost, get active() { return !!m; } };
})();
