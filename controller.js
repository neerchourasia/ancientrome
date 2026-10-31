"use strict";
// A hardware controller: an Arduino with a joystick and a 4x4 keypad (see arduino/joystick_controller) plugged into the computer by USB. The browser talks to it
// with the Web Serial API (Chrome or Edge on a computer; Firefox and Safari do not have it). The Arduino sends lines like "-62,100,0,5" (the stick's x and y, each
// -100..100, then the stick button 0/1, then the keypad key being pressed, if any) and this file presses the same keys you would: A and D turn, W and S walk
// or drive (and fly), Space jumps (press the stick down), and each keypad key presses a game key (the table below). It also tells the Arduino when you pick up a
// coin or get hurt, so a buzzer on it can beep. Depends on game.js (keys, sendKey, toast), vitals.js.

const Controller = (() => {
  const BAUD = 115200, ON = 35, OFF = 20, QUIET_MS = 1200;
  // What each keypad key does: the keyboard key it presses. Change this table to change the keypad.
  //   1 map          2 directions    3 places        A interact (shop, talk, jobs ...)
  //   4 rest         5 camera view   6 vehicle (X)   B trade (E, in a vehicle)
  //   7 era (K)      8 travel (B)    9 time (T)      C your character
  //   * help (H)     0 Esc (close)   # sound (O)     D voice (J)
  const KEYPAD = { "1": "KeyM", "2": "KeyG", "3": "KeyP", "A": "KeyF", "4": "KeyZ", "5": "KeyC", "6": "KeyX", "B": "KeyE", "7": "KeyK", "8": "KeyB", "9": "KeyT", "C": "KeyY", "*": "KeyH", "0": "Escape", "#": "KeyO", "D": "KeyJ" };
  let port = null, reader = null, writer = null, connected = false, lastAt = 0, coins = null, hp = null, btnEl = null, lastKey = "";
  const held = new Set();

  // press or release a key exactly like the keyboard (and the touch buttons) do
  function press(code, on) {
    if (on === held.has(code)) return;
    if (on) { held.add(code); keys.add(code); sendKey("keydown", code); } else { held.delete(code); keys.delete(code); sendKey("keyup", code); }
  }
  const releaseAll = () => { for (const c of [...held]) press(c, false); lastKey = ""; };
  const releaseStick = () => { for (const c of ["KeyA", "KeyD", "KeyW", "KeyS", "Space"]) press(c, false); };
  // a little hysteresis, so a stick near the edge of the dead zone does not flicker
  const axis = (v, neg, pos) => { press(neg, v <= -(held.has(neg) ? OFF : ON)); press(pos, v >= (held.has(pos) ? OFF : ON)); };

  function line(text) {
    const m = /^\s*(-?\d{1,3})\s*,\s*(-?\d{1,3})\s*,\s*([01])\s*(?:,\s*([0-9A-D*#]?)\s*)?$/.exec(text);
    if (!m) return;                                         // (the first line after the Arduino restarts can be garbage)
    lastAt = performance.now();
    if (typeof started === "undefined" || !started) { releaseAll(); return; }
    if (panelOpen) releaseStick();                          // (with a panel open the stick does nothing, but the keypad still can, for example to close it)
    else { axis(Number(m[1]), "KeyA", "KeyD"); axis(Number(m[2]), "KeyS", "KeyW"); press("Space", m[3] === "1"); }
    const k = m[4] || "";                                   // the keypad: a key goes down when it is first seen and up when it is let go
    if (k !== lastKey) {
      if (lastKey && KEYPAD[lastKey]) press(KEYPAD[lastKey], false);
      if (k && KEYPAD[k]) press(KEYPAD[k], true);
      lastKey = k;
    }
  }

  const label = () => { if (btnEl) { btnEl.textContent = connected ? "🎮 Controller: on" : "🎮 Controller"; btnEl.classList.toggle("on", connected); } };

  async function open(p) {
    port = p;
    await port.open({ baudRate: BAUD });
    connected = true; coins = hp = null; lastAt = performance.now(); label();
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

  // tell the Arduino when you collect a coin or get hurt (a buzzer there can beep)
  const tell = (c) => { if (writer) writer.write(new TextEncoder().encode(c)).catch(() => {}); };
  function watch() {
    if (!connected) return;
    if (performance.now() - lastAt > QUIET_MS) releaseAll();                 // nothing arriving (a pulled cable): let go of every key
    if (typeof Vitals === "undefined") return;
    if (coins !== null && Vitals.coins > coins) tell("C");
    if (hp !== null && Vitals.hp < hp - 0.5) tell("H");
    coins = Vitals.coins; hp = Vitals.hp;
  }

  function bind() {
    btnEl = document.getElementById("btn-controller");
    if (btnEl) btnEl.addEventListener("click", connect);
    setInterval(watch, 250);
    if (!("serial" in navigator)) return;
    // a controller that was allowed before connects by itself, when the page opens and whenever it is plugged in
    const auto = async () => { if (connected) return; try { const ps = await navigator.serial.getPorts(); if (ps.length) open(ps[0]).catch(() => close()); } catch (e) { /* ignore */ } };
    auto();
    navigator.serial.addEventListener("connect", auto);
  }

  return { bind, connect, get connected() { return connected; }, _line: line };
})();
