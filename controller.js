"use strict";
// A hardware controller: an Arduino with a joystick, a 4x4 keypad, an IR remote, a buzzer and a 4-digit display (see arduino/joystick_controller) plugged into the
// computer by USB. The browser talks to it with the Web Serial API (Chrome or Edge on a computer; Firefox and Safari do not have it).
// The Arduino sends lines like "-62,100,0,5,9": the stick's x and y (each -100..100), the stick button (0/1), the keypad key being pressed and the number of the
// remote key being held, the last three possibly empty. This file presses the same keys you would: the stick walks and turns (or steers in a vehicle) and
// jumps when pressed, the keypad and the remote press game keys (the tables below), and the remote's number keys set your walking speed.
// It also tells the Arduino what is happening, for the buzzer (C coin, H hurt, L landmark, J job, W win, X defeat) and the display (D denarii, P health).
// Depends on game.js (keys, sendKey, toast, mode, panelOpen), vitals.js.

const Controller = (() => {
  const BAUD = 115200, ON = 35, OFF = 20, QUIET_MS = 1200;
  // What each keypad key does: the keyboard key it presses. Change this table to change the keypad.
  //   1 map          2 directions    3 places        A interact (shop, talk, jobs ...)
  //   4 rest         5 camera view   6 vehicle (X)   B trade (E, in a vehicle)
  //   7 era (K)      8 travel (B)    9 time (T)      C your character
  //   * help (H)     0 Esc (close)   # sound (O)     D voice (J)
  const KEYPAD = { "1": "KeyM", "2": "KeyG", "3": "KeyP", "A": "KeyF", "4": "KeyZ", "5": "KeyC", "6": "KeyX", "B": "KeyE", "7": "KeyK", "8": "KeyB", "9": "KeyT", "C": "KeyY", "*": "KeyH", "0": "Escape", "#": "KeyO", "D": "KeyJ" };
  // The IR remote, by the number each key sends (the common 21-key kit remote, and the 17-key one with the same layout). Arrows and the middle row are by position.
  //   top row:     Esc (close)    faster          interact (F)          1-9: your walking speed (Digit1 .. Digit9)
  //   second row:  turn left      jump            turn right            0: map     EQ / 100+: directions     ST/REPT / 200+: places
  //   third row:   back           slower          forward
  // "@left" and "@right" turn you on foot and steer in a vehicle; "@faster" and "@slower" step your walking speed up or down.
  const IR = {
    0x45: "Escape", 0x46: "@faster", 0x47: "KeyF",
    0x44: "@left", 0x40: "Space", 0x43: "@right",
    0x07: "KeyS", 0x15: "@slower", 0x09: "KeyW",
    0x16: "KeyM", 0x19: "KeyG", 0x0D: "KeyP",
    0x0C: "Digit1", 0x18: "Digit2", 0x5E: "Digit3", 0x08: "Digit4", 0x1C: "Digit5", 0x5A: "Digit6", 0x42: "Digit7", 0x52: "Digit8", 0x4A: "Digit9",
  };
  // Remotes differ, so you can teach the game yours (the 🎮 Learn remote button): what it learns is kept in this browser and replaces the table above.
  const IR_KEY = "rome-ir-map";
  let irMap = IR;
  try { const saved = JSON.parse(localStorage.getItem(IR_KEY) || "null"); if (saved && typeof saved === "object" && Object.keys(saved).length) irMap = saved; } catch (e) { /* storage unavailable */ }
  const LEARN = [["Forward (the up arrow)", "KeyW"], ["Back (the down arrow)", "KeyS"], ["Turn left (the left arrow)", "@left"], ["Turn right (the right arrow)", "@right"], ["Jump (the middle OK key)", "Space"],
    ["Faster (a plus or volume up)", "@faster"], ["Slower (a minus or volume down)", "@slower"], ["Interact (F)", "KeyF"], ["Close or back (Esc)", "Escape"], ["Map", "KeyM"],
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`Walking speed ${n} (the key marked ${n})`, "Digit" + n])];
  let learning = -1, learned = {}, learnNote = "";
  let learnEl = null, port = null, reader = null, writer = null, connected = false, lastAt = 0, coins = null, hp = null, btnEl = null, hudEl = null, hudText = "";
  let lastKey = "", keyHeld = "", lastIr = -1, irHeld = "";
  let seenLandmarks = null, shifts = null, wasDead = false, sentCoins = null, sentHp = null, sentAt = 0;

  // Keys are held on behalf of a source (the stick, the keypad or the remote): a key stays down while any source holds it.
  const held = new Map();
  function press(code, on, src = "stick") {
    let set = held.get(code);
    if (on) { if (!set) held.set(code, set = new Set()); if (set.has(src)) return; set.add(src); if (set.size === 1) { keys.add(code); sendKey("keydown", code); } }
    else { if (!set || !set.delete(src)) return; if (!set.size) { held.delete(code); keys.delete(code); sendKey("keyup", code); } }
  }
  const releaseSource = (src) => { for (const [code, set] of [...held]) if (set.has(src)) press(code, false, src); };
  const releaseAll = () => { for (const src of ["stick", "keypad", "remote"]) releaseSource(src); lastKey = keyHeld = irHeld = ""; lastIr = -1; };
  // a little hysteresis, so a stick near the edge of the dead zone does not flicker
  const axis = (v, neg, pos) => { press(neg, v <= -(held.has(neg) && held.get(neg).has("stick") ? OFF : ON)); press(pos, v >= (held.has(pos) && held.get(pos).has("stick") ? OFF : ON)); };
  // on foot (and in the online lobby) A and D slide you sideways and Q and E turn you; in a vehicle, a plane or a fight A and D steer
  const onFoot = () => typeof mode !== "undefined" && (mode === "walk" || mode === "online" || mode === "watch");

  // what a key of the keypad or remote does when it goes down: the key to hold (or "" for a one-off action)
  function begin(token) {
    if (token === "@left") return onFoot() ? "KeyQ" : "KeyA";
    if (token === "@right") return onFoot() ? "KeyE" : "KeyD";
    if (token === "@faster" || token === "@slower") {
      if (typeof mode !== "undefined" && mode === "walk" && typeof setWalkLevel === "function") setWalkLevel(Math.max(1, Math.min(9, walkLevel + (token === "@faster" ? 1 : -1))));
      return "";
    }
    return token;
  }

  function line(text) {
    const m = /^\s*(-?\d{1,3})\s*,\s*(-?\d{1,3})\s*,\s*([01])\s*(?:,\s*([0-9A-D*#]?)\s*(?:,\s*(\d{0,3})\s*)?)?$/.exec(text);
    if (!m) return;                                         // (the first line after the Arduino restarts can be garbage)
    lastAt = performance.now();
    show(m[1], m[2], m[3], m[4] || "", m[5] || "");
    if (typeof started === "undefined" || !started) { releaseAll(); return; }
    if (panelOpen) releaseSource("stick");                  // (with a panel open the stick does nothing, but the keypad and remote still can, for example to close it)
    else {
      const foot = onFoot(), [L, R] = foot ? ["KeyQ", "KeyE"] : ["KeyA", "KeyD"];
      for (const c of foot ? ["KeyA", "KeyD"] : ["KeyQ", "KeyE"]) press(c, false);
      axis(Number(m[1]), L, R); axis(Number(m[2]), "KeyS", "KeyW"); press("Space", m[3] === "1");
    }
    const k = m[4] || "";                                   // the keypad: a key goes down when it is first seen and up when it is let go
    if (k !== lastKey) {
      if (keyHeld) press(keyHeld, false, "keypad");
      keyHeld = "";
      if (k && KEYPAD[k] && !(k === "B" && mode !== "drive")) { keyHeld = begin(KEYPAD[k]); if (keyHeld) press(keyHeld, true, "keypad"); }   // (B is "trade", which only exists in a vehicle: on foot E would turn you)
      lastKey = k;
    }
    const ir = m[5] === "" || m[5] === undefined ? -1 : Number(m[5]);   // the remote: the same, by the number of the key
    if (ir !== lastIr) {
      if (irHeld) press(irHeld, false, "remote");
      irHeld = "";
      if (learning >= 0) { if (ir >= 0) learnPress(ir); }
      else if (ir >= 0 && irMap[ir]) { irHeld = begin(irMap[ir]); if (irHeld) press(irHeld, true, "remote"); }
      lastIr = ir;
    }
  }

  // a small readout of what the Arduino is sending, so you can see the stick working even when the game does not move
  function show(x, y, b, k, ir) {
    if (!hudEl) return;
    const note = learning >= 0 ? `  LEARNING: press the remote key for  ${LEARN[learning][0]}   (Enter on the keyboard skips, Esc stops)` : typeof started === "undefined" || !started ? "  (press Enter Rome / Demo first)" : typeof panelOpen !== "undefined" && panelOpen ? "  (a menu is open: the stick is off, close it with 0)" : "";
    const t = `🎮 x ${String(x).padStart(4)}  y ${String(y).padStart(4)}  stick ${b === "1" ? "DOWN" : "up"}  key ${k || "-"}  remote ${ir === "" ? "-" : "#" + ir}${note}`;
    if (t !== hudText) { hudText = t; hudEl.textContent = t; }
  }
  const label = () => { if (btnEl) { btnEl.textContent = connected ? "🎮 Controller: on" : "🎮 Controller"; btnEl.classList.toggle("on", connected); } if (learnEl) learnEl.hidden = !connected; };

  async function open(p) {
    port = p;
    await port.open({ baudRate: BAUD });
    connected = true; coins = hp = null; sentCoins = sentHp = null; lastAt = performance.now(); label();
    if (hudEl) { hudEl.hidden = false; hudEl.textContent = "🎮 waiting for the Arduino..."; hudText = ""; }
    toast("Controller connected: stick to walk and turn, press it to jump.");
    writer = port.writable.getWriter();
    const dec = new TextDecoderStream(), piped = port.readable.pipeTo(dec.writable).catch(() => {});
    reader = dec.readable.getReader();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
        if (buf.length > 200) buf = "";
      }
    } catch (e) { /* unplugged */ }
    await close(piped);
  }

  async function close(piped) {
    releaseAll();
    const wasOn = connected;
    connected = false; label();
    if (hudEl) hudEl.hidden = true;
    try { if (reader) await reader.cancel(); } catch (e) { /* ignore */ }
    try { if (writer) { writer.releaseLock(); } } catch (e) { /* ignore */ }
    try { if (piped) await piped; } catch (e) { /* ignore */ }
    try { if (port) await port.close(); } catch (e) { /* ignore */ }
    reader = writer = null; port = null;
    if (wasOn) toast("Controller disconnected.");
  }

  async function connect() {
    if (connected) { if (port) { try { await reader.cancel(); } catch (e) { /* ignore */ } } return; }   // a second click disconnects
    if (!("serial" in navigator)) { toast("A controller needs Chrome or Edge on a computer."); return; }
    try { await open(await navigator.serial.requestPort()); }
    catch (e) { if (e && e.name !== "NotFoundError") toast("Could not open the controller: " + (e.message || e)); await close(); }
  }

  // ---------------------------------------------------------------- telling the Arduino what happens (the buzzer's tunes and the display)
  const tell = (text) => { if (writer) writer.write(new TextEncoder().encode(text)).catch(() => {}); };
  const WIN = /victor|\bwon\b|\bwin\b|winner|champion|first place|1st|triumph|well fought|cleared|profitable|delivered|congrat/i;
  const LOSE = /defeat|\blost\b|\blose\b|killed|\bdead\b|\bdied\b|knocked out|sunk|wreck|losing|failed/i;
  function resultSound(title) { if (LOSE.test(title)) tell("X"); else if (WIN.test(title)) tell("W"); }

  // ---------------------------------------------------------------- teaching the game your remote
  function learnStart() {
    if (!connected) { toast("Connect the controller first (🎮 Controller)."); return; }
    learning = 0; learned = {};
    toast("Press the remote key for each thing the game asks (see the box at the bottom left). Enter skips one, Esc stops.");
  }
  function learnDone(save) {
    learning = -1;
    if (save && Object.keys(learned).length) { irMap = learned; try { localStorage.setItem(IR_KEY, JSON.stringify(learned)); } catch (e) { /* ignore */ } toast(`Remote learned: ${Object.keys(learned).length} keys.`); }
    else toast("Remote learning stopped.");
  }
  function learnPress(code) {
    if (learned[code]) { toast("That key is already used. Press another one (Enter skips this one)."); return; }
    learned[code] = LEARN[learning][1];
    if (++learning >= LEARN.length) learnDone(true);
  }
  addEventListener("keydown", (e) => {
    if (learning < 0) return;
    if (e.code === "Enter") { e.preventDefault(); if (++learning >= LEARN.length) learnDone(true); }
    else if (e.code === "Escape") learnDone(true);
  }, true);

  function watch() {
    if (!connected) return;
    if (performance.now() - lastAt > QUIET_MS) releaseAll();                 // nothing arriving (a pulled cable): let go of every key
    if (typeof Vitals === "undefined") return;
    if (coins !== null && Vitals.coins > coins) tell("C");
    if (hp !== null && Vitals.hp < hp - 0.5) tell("H");
    coins = Vitals.coins; hp = Vitals.hp;
    // the display: your denarii, and your health (it shows it for a moment when it drops)
    const c = Math.round(Vitals.coins), h = Math.round(Vitals.hp), t = performance.now();
    if (c !== sentCoins || h !== sentHp || t - sentAt > 5000) { tell(`D${Math.max(0, c)}\nP${Math.max(0, h)}\n`); sentCoins = c; sentHp = h; sentAt = t; }
    // landmarks, jobs and dying
    try {
      const n = discovered.size;
      if (seenLandmarks !== null && n > seenLandmarks) tell("L");
      seenLandmarks = n;
      const s = Jobs.snapshot().shifts;
      if (shifts !== null && s > shifts) tell("J");
      shifts = s;
      const dead = deathT > 0;
      if (dead && !wasDead) tell("X");
      wasDead = dead;
    } catch (e) { /* the game is still loading */ }
  }

  function bind() {
    btnEl = document.getElementById("btn-controller"); hudEl = document.getElementById("ctl-hud");
    if (btnEl) btnEl.addEventListener("click", connect);
    learnEl = document.getElementById("btn-learn"); if (learnEl) learnEl.addEventListener("click", learnStart);
    setInterval(watch, 250);
    // a win or a defeat on the results screen plays a tune on the buzzer
    const shown = window.showResult;
    if (typeof shown === "function") window.showResult = function (title, ...rest) { try { resultSound(String(title || "")); } catch (e) { /* ignore */ } return shown.call(this, title, ...rest); };
    if (!("serial" in navigator)) return;
    // a controller that was allowed before connects by itself, when the page opens and whenever it is plugged in
    const auto = async () => { if (connected) return; try { const ps = await navigator.serial.getPorts(); if (ps.length) open(ps[0]).catch(() => close()); } catch (e) { /* ignore */ } };
    auto();
    navigator.serial.addEventListener("connect", auto);
  }

  return { bind, connect, get connected() { return connected; }, _line: line };
})();
