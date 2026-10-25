"use strict";
// Player controls, HUD, minimap and landmark discovery.

const $ = (s) => document.querySelector(s);
const EYE = 1.7;
const MAP = { x0: -800, x1: 700, z0: -700, z1: 850 }; // the map of whichever city you are in (Delhi swaps in its own)
const ROME_MAP = { ...MAP }, ROME_BOUNDS = { ...BOUNDS };
let city = "rome"; // "rome", "delhi" or "cancun": press B (or the Travel button) to go to the next one
const NEXT_CITY = { rome: "delhi", delhi: "cancun", cancun: "rome" };

const player = { x: 165, z: 6, yaw: Math.PI / 2, pitch: -0.02, feet: 0, y: EYE, vx: 0, vz: 0, bob: 0, airY: 0, vy: 0 };
const GRAVITY = 22, JUMP_SPEED = 7.2;
const keys = new Set();
let started = false, dragging = false, locked = false, panelOpen = false;
let mode = "walk"; // "walk", "fight" (Colosseum), "race" (Circus Maximus) or "watch" (spectating)
let renderer, camera, scene, sky, discovered = new Set();
let era = "ancient"; // "ancient" (c. 128 AD) or "modern" (today); K switches

try { // saved progress is only trusted if it names real landmarks, so edited or corrupted storage cannot inflate the count
  const saved = JSON.parse(localStorage.getItem("rome-discovered") || "[]");
  if (Array.isArray(saved)) discovered = new Set(saved.filter((id) => ALL_LANDMARKS.some((l) => l.id === id && !l.home && !l.game)));
} catch (e) { /* storage unavailable */ }
try { if (localStorage.getItem("rome-era") === "modern") era = "modern"; } catch (e) { /* storage unavailable */ }

// ---------- setup ----------

function init() {
  const canvas = $("#view");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, 1, 0.3, 3000);
  camera.rotation.order = "YXZ";

  sky = buildSky(scene);
  sky.setHour(Time.hour, true);
  buildGround(scene);
  buildLandmarks(scene);
  Stalls.build(scene, Stalls.SITES.rome.x, Stalls.SITES.rome.z, "rome");
  Stalls.armoury(scene, ARENA.cx, ARENA.cz + 16.5);   // the armourer at the south edge of the arena
  Jobs.build(scene);
  Robbery.init(scene);
  Festival.init(scene);
  Theatre.init(scene);
  Guards.build(scene);
  Police.init(scene);
  Jail.bind();
  Harbour.build(scene);
  Home.build();
  buildInsulae(scene);
  Jail.buildRome(scene);
  Stalls.street(scene, "rome", [["Colosseum", 305, 66], ["Via Sacra", 110, 16], ["Forum", 50, 42], ["Capitoline", -235, 8], ["Pantheon", -455, -440], ["Trajan's Forum", -150, -210], ["Circus", -190, 132], ["Harbour", 74, 80], ["Forum Boarium", -405, 55], ["Theatre of Pompey", -655, -50], ["Via Domus", 150, -44]]);
  buildTrees(scene);
  buildCitizens(scene);
  Modern.build(scene);
  buildAvatar();
  buildCreator();
  Account.bind();
  Online.bind();
  Chat.bind();
  Social.bind();
  Gifts.bind();
  Tax.bind();
  Admin.bind();
  Market.bind();
  Shipyard.bind();
  applyCharacter();
  Crowd.build(scene);
  Fight.init(scene, camera);
  Race.init(scene);
  Watch.init(scene);
  Naval.init(scene);
  Show.init(scene);
  Nav.init(scene);
  DGames.init(scene);
  scene.traverse((o) => { if (o.isInstancedMesh) o.frustumCulled = false; });
  Weather.init(sky, scene);
  Speech.init(scene);
  applyEra();

  buildBaseMap();
  refreshViewButton();
  buildPlacesList();
  updateProgress();
  wireInput(canvas);
  addEventListener("resize", resize);
  resize();
  placeAt(player.x, player.z);
  requestAnimationFrame(loop);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  creatorCamera(creatorOpen);
  if (bigMapOpen()) drawBigMap();
}

// ---------- input ----------

// Some embedded browsers omit event.code, so fall back to event.key.
function keyCode(e) {
  if (e.code && e.code !== "Unidentified") return e.code;
  const k = e.key;
  if (!k) return "";
  if (k === " ") return "Space";
  if (k === "Shift") return "ShiftLeft";
  if (k.length === 1) return "Key" + k.toUpperCase();
  return k;
}

// Leave whatever activity is running (fight, race, naval battle or spectating).
function leaveMode() {
  if (mode === "fight") Fight.stop();
  else if (mode === "race") Race.stop();
  else if (mode === "naval") Naval.stop();
  else if (mode === "watch") Watch.stop();
  else if (mode === "online") Online.leave();
  else if (mode === "drive") Car.exit();
  else if (mode === "dgame" || DGames.running) DGames.stop();
  else closePanels();
}

// Hotkeys that start or stop things are ignored for a moment after leaving, so a held key can't restart them.
let startLockUntil = 0;
const homeHere = (x, z) => (city === "delhi" ? Delhi.homeInside(x, z) : city === "cancun" ? Cancun.homeInside(x, z) : Home.inside(x, z)); // your bed: the house in Rome, the haveli in Delhi
const canStart = () => performance.now() > startLockUntil && !panelOpen && deathT === 0;

function wireInput(canvas) {
  addEventListener("keydown", (e) => {
    const k = keyCode(e);
    if (k === "Escape") { if (city === "cancun" && Cancun.snorkeling && mode === "walk" && !panelOpen) { Cancun.stopSnorkel(); toast("You lift your head out of the water."); return; } leaveMode(); return; }   // Esc: come up for air when snorkelling
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // typing a name: leave the keys alone
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(k)) e.preventDefault();
    if (!started) return;
    if (creatorOpen) return; // the character screen is open
    keys.add(k);
    if (Vitals.resting && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(k)) Vitals.stopRest(); // moving stands you up
    if (e.repeat) return; // one-shot actions fire once per key press, never on auto-repeat

    if (k === "KeyR" && mode === "walk" && !panelOpen && !inCircusTrack(player.x, player.z) && !inArena(player.x, player.z)) { shove(); return; }   // R: shove the citizen in front of you
    if (k === "KeyF" && mode === "drive" && Car.flyOn()) return;   // in a plane at the edge of the city: fly on to the next one
    if ((k === "KeyL" || k === "KeyU") && mode === "walk" && !panelOpen && !inArena(player.x, player.z) && Festival.key(k)) return;   // festival activities: L a lantern, U colours
    if (k === "KeyT") cycleTime();
    if (k === "KeyO") toggleSound();
    if (k === "KeyJ") toggleVoice();
    if (k === "KeyZ") toggleRest();
    if (k === "KeyK") toggleEra();
    if (k === "Enter" && (mode === "walk" || mode === "drive" || mode === "watch") && !panelOpen && !creatorOpen) { e.preventDefault(); Chat.open(); return; }
    if (k === "KeyB") openTravel();
    if (k === "KeyN" && city === "delhi" && mode === "walk" && !panelOpen && canStart()) DGames.open();
    if (k === "KeyX" && (mode === "walk" || mode === "drive") && !panelOpen) Car.toggleEnter();
    if (k === "KeyY" && mode === "walk" && !panelOpen && canStart()) openCreator(false);
    if (k === "Space" && mode === "walk" && !panelOpen && sleepT <= 0 && player.airY <= 0.02 && player.stun <= 0) { player.vy = JUMP_SPEED; Sfx.play("jump"); }
    if (k === "KeyG" && (mode === "walk" || mode === "watch")) toggleDirections();
    if (mode === "walk" || mode === "watch") {
      if (k === "KeyM") toggleBigMap();
      else if (k === "KeyP") togglePlaces();
      else if (k === "KeyH") toggleControls();
      else if (k === "KeyC" && mode === "walk") cycleView(e.shiftKey ? -1 : 1);
    }
    if (mode === "drive" && k === "KeyC") Car.togglePilot();
    if (mode === "walk") { const m = /^(?:Digit|Key|Numpad)([1-9])$/.exec(k); if (m) setWalkLevel(Number(m[1])); }
    if (mode === "watch") {
      if (k === "KeyC") Watch.toggleChase();
      else if (k === "KeyV") Watch.stop();
      else if (k === "KeyN") Watch.nextAct();
      else { const m = /^(?:Digit|Key|Numpad)([1-5])$/.exec(k); if (m) Watch.setAct(Number(m[1]) - 1); }
    } else if (mode === "walk" && canStart()) {
      if (k === "KeyF" && city === "cancun" && Cancun.promptText() && Cancun.act()) { /* hired snorkel gear, or put your face in the water */ }
      else if (k === "KeyF" && Stalls.at(player.x, player.z, player.feet)) Stalls.open();
      else if (k === "KeyF" && Jobs.at(player.x, player.z, player.feet)) Jobs.act();
      else if (k === "KeyF" && Garage.at(player.x, player.z, player.feet)) Garage.open();
      else if (k === "KeyF" && Dresser.at(player.x, player.z, player.feet)) Dresser.open();
      else if (k === "KeyF" && Cage.at(player.x, player.z, player.feet)) Cage.open();
      else if (k === "KeyF" && Robbery.at(player.x, player.z, player.feet)) Robbery.act();
      else if (k === "KeyF" && Harbour.at(player.x, player.z, player.feet)) Harbour.board();
      else if (city === "rome" && era === "modern" && ["KeyF", "KeyL", "KeyU", "KeyN", "KeyR", "KeyV"].includes(k)) toast("Games only work in Ancient Rome. Press K to switch back.");
      else if (k === "KeyF" && city === "delhi") DGames.playHere();
      else if (k === "KeyF" && inArena(player.x, player.z)) Fight.start();
      else if (k === "KeyL" && inArena(player.x, player.z)) Fight.start({ lion: true });
      else if (k === "KeyU" && inArena(player.x, player.z)) Fight.start({ hunt: true });
      else if (k === "KeyN" && inArena(player.x, player.z)) Shipyard.open();
      else if (k === "KeyR" && inCircusTrack(player.x, player.z)) Race.start();
      else if (k === "KeyV" && era === "ancient" && city === "rome" && Theatre.inTheatre(player.x, player.z)) Watch.start("theatre");
      else if (k === "KeyV" && (inColosseum(player.x, player.z) || inCircusArea(player.x, player.z))) Watch.start(inColosseum(player.x, player.z) ? "duel" : "race");
    } else if (mode === "naval") {
      if (k === "Space" || k === "KeyQ" || k === "KeyE") Naval.fire(k);
      else if (k === "KeyF" && Naval.harbour) Harbour.action();
    } else if (mode === "race") {
      if (k === "Space") Race.whip();
      else if (k === "KeyQ") Race.hop(-1);
      else if (k === "KeyE") Race.hop(1);
      else if (k === "KeyX") Race.toggleCruise();
      else if (k === "KeyC") Race.cycleCamera();
      else { const m = /^(?:Digit|Key|Numpad)([1-9])$/.exec(k); if (m) Race.setPace(Number(m[1])); }
    } else if (mode === "dgame") {
      DGames.key(k);
    } else if (mode === "online") {
      if (k === "Space") Online.swing();
    } else if (k === "Space" && mode === "fight") {
      Fight.attack();
    }
  });
  addEventListener("keyup", (e) => { const k = keyCode(e); keys.delete(k); if (k === "Space" && mode === "fight") Fight.release(); });
  addEventListener("blur", () => { keys.clear(); Fight.mouseBlock = false; });

  // Buttons keep keyboard focus after a click, so Space or Enter would press them again. Drop the focus.
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("button"); if (b) b.blur(); });
  $("#leave").addEventListener("click", leaveMode);
  $("#nav-close").addEventListener("click", () => { Nav.clear(); toast("Directions stopped"); });

  canvas.addEventListener("mousedown", (e) => {
    if (mode === "fight") { if (e.button === 2) Fight.mouseBlock = true; else Fight.attack(); return; }
    if (mode === "naval") { Naval.fire("Space"); return; }
    if (mode === "dgame") { DGames.fire(); return; }
    if (started && mode === "walk" && !panelOpen) dragging = true;
  });
  let downAt = null;
  canvas.addEventListener("mousedown", (e) => { downAt = { x: e.clientX, y: e.clientY }; }, true);
  canvas.addEventListener("mouseup", (e) => { // a plain click (not a drag) on your parked car sends it to your garage
    if (e.button === 0 && mode === "walk" && !panelOpen && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) Car.clickAt(e.clientX, e.clientY, camera, renderer.domElement);
  });
  addEventListener("mouseup", (e) => { dragging = false; if (e.button === 2) Fight.mouseBlock = false; if (e.button === 0 && mode === "fight") Fight.release(); });
  $("#prompt").addEventListener("click", () => {
    if ($("#prompt").dataset.kind === "rest") { toggleRest(); return; }
    if ($("#prompt").dataset.kind === "car") { Car.enter(); return; }
    if ($("#prompt").dataset.kind === "dgame") { DGames.playHere(); return; }
    if ($("#prompt").dataset.kind === "stall") { Stalls.open(); return; }
    if ($("#prompt").dataset.kind === "job") { Jobs.act(); return; }
    if ($("#prompt").dataset.kind === "garage") { Garage.open(); return; }
    if ($("#prompt").dataset.kind === "dresser") { Dresser.open(); return; }
    if ($("#prompt").dataset.kind === "cage") { Cage.open(); return; }
    if ($("#prompt").dataset.kind === "cancun") { Cancun.act(); return; }
    if ($("#prompt").dataset.kind === "shove") { shove(); return; }
    if ($("#prompt").dataset.kind === "rob") { Robbery.act(); return; }
    if ($("#prompt").dataset.kind === "harbour") { Harbour.board(); return; }
    if (mode !== "walk" || !canStart() || era === "modern") return;
    if (inArena(player.x, player.z)) Fight.start();
    else if (inCircusTrack(player.x, player.z)) Race.start();
    else if (era === "ancient" && city === "rome" && Theatre.inTheatre(player.x, player.z)) Watch.start("theatre");
    else if (inColosseum(player.x, player.z)) Watch.start("duel");
    else if (inCircusStands(player.x, player.z)) Watch.start("race");
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("mousemove", (e) => {
    if (!started || panelOpen || !(dragging || locked)) return;
    player.yaw -= e.movementX * 0.0026;
    player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - e.movementY * 0.0026));
  });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === canvas; });
  canvas.addEventListener("dblclick", () => {
    if (!started || panelOpen || mode !== "walk") return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not available here */ }
  });

  $("#start").addEventListener("click", () => {
    started = true;
    Sfx.init();
    $("#intro").classList.add("hidden");
    if (!Character.exists) openCreator(true);
    $("#help").classList.add("show");
    setTimeout(() => $("#help").classList.remove("show"), 9000);
  });
  $("#btn-dgames").addEventListener("click", () => DGames.open());
  for (const b of document.querySelectorAll(".dclose")) b.addEventListener("click", closePanels);
  $("#btn-city").addEventListener("click", openTravel);
  for (const b of document.querySelectorAll("#travel .tv-list button")) b.addEventListener("click", () => { closePanels(); travel(b.dataset.city); });
  $("#btn-map").addEventListener("click", toggleBigMap);
  $("#btn-places").addEventListener("click", togglePlaces);
  $("#btn-dirs").addEventListener("click", toggleDirections);
  $("#btn-sound").addEventListener("click", toggleSound);
  $("#btn-jobs").addEventListener("click", () => Jobs.openList());
  $("#btn-shove").addEventListener("click", () => { if (mode === "walk" && !panelOpen) shove(); else toast("Shoving works while you are walking about"); });
  // the menu of buttons: closed until you want it (☰ Menu); a dot on it says a gift or a friend's message is waiting
  {
    const bar = document.querySelector(".top-right .buttons"), mb = $("#btn-menu");
    let open = false;
    try { open = localStorage.getItem("rome-menu") === "open"; } catch (e) { /* ignore */ }
    const show = (v) => {
      open = v; bar.classList.toggle("collapsed", !v); mb.setAttribute("aria-expanded", String(v)); mb.querySelector(".mi").textContent = v ? "✕" : "☰"; mb.title = v ? "Hide the menu" : "Menu";
      try { localStorage.setItem("rome-menu", v ? "open" : "closed"); } catch (e) { /* ignore */ }
    };
    mb.addEventListener("click", () => show(!open));
    show(open);
    setInterval(() => mb.classList.toggle("alert", !open && ((typeof Gifts !== "undefined" && Gifts.ready) || (typeof Social !== "undefined" && Social.unread() > 0))), 1500);
  }
  $("#btn-music").addEventListener("click", () => { Sfx.init(); Music.toggle(); refreshMusicButton(); toast(Music.on ? "Music on" : "Music off"); });
  refreshMusicButton();
  $("#btn-voice").addEventListener("click", toggleVoice);
  refreshVoiceButton();
  refreshSoundButton();
  $("#dirs-nearest").addEventListener("click", guideMe);
  $("#dirs-home").addEventListener("click", () => startDirections(LANDMARKS.find((l) => l.home)));
  $("#btn-view").addEventListener("click", () => { if (mode === "walk") cycleView(1); else toast("The camera view can be changed while walking"); });
  $("#btn-era").addEventListener("click", toggleEra);
  $("#btn-char").addEventListener("click", () => { if (mode === "walk" && !panelOpen && canStart()) openCreator(false); else toast("Close what is open and stop the game first"); });
  canvas.addEventListener("wheel", (e) => {
    if (!started || panelOpen || mode !== "walk" || viewId() === "first") return;
    e.preventDefault();
    camZoom = Math.max(0.5, Math.min(2.6, camZoom * (e.deltaY > 0 ? 1.1 : 0.91)));
  }, { passive: false });
  $("#dirs-stop").addEventListener("click", () => { Nav.clear(); toast("Directions stopped"); closePanels(); });
  $("#btn-time").addEventListener("click", cycleTime);
  $("#btn-controls").addEventListener("click", toggleControls);
  $("#controls-close").addEventListener("click", closePanels);
  $("#controls").addEventListener("click", (e) => { if (e.target.id === "controls") closePanels(); });
  $("#places-close").addEventListener("click", closePanels);
  $("#bigmap-close").addEventListener("click", closePanels);
  $("#bigmap-canvas").addEventListener("click", onBigMapClick);
  $("#minimap").addEventListener("click", toggleBigMap);
  wireTouch(canvas);
}

// ---------- touch controls (phones / tablets) ----------
// Reuses the existing keyboard-driven game logic: the joystick and buttons just add or remove the same key
// codes the keyboard would, or dispatch the same synthetic key events, so fight.js/race.js/naval.js need no
// changes at all.

const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

function sendKey(type, code) { dispatchEvent(new KeyboardEvent(type, { code })); }

// A button that fires a one-shot key event on touch (jump, whip, a lane hop, cruise) or holds a key down for
// as long as it's pressed (block, dodge, drawing the bow).
function tcButton(id, code, opts = {}) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (opts.toggle) { const on = keys.has(code) ? (keys.delete(code), false) : (keys.add(code), true); el.classList.toggle("active", on); sendKey(on ? "keydown" : "keyup", code); return; }
    keys.add(code);
    el.classList.add("active");
    sendKey("keydown", code);
    if (!opts.hold) { keys.delete(code); sendKey("keyup", code); el.classList.remove("active"); }
  }, { passive: false });
  if (opts.hold) {
    const up = (e) => { e.preventDefault(); keys.delete(code); sendKey("keyup", code); el.classList.remove("active"); };
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
  }
}

function wireTouch(canvas) {
  if (!isTouch) return;
  document.body.classList.add("touch");

  // The joystick: left thumb, drives the same WASD keys the keyboard does (diagonals included).
  const stick = $("#tc-stick"), knob = $("#tc-knob");
  const R = 46;
  let stickId = null, cx = 0, cz = 0;
  const setDir = (dx, dy) => {
    for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) keys.delete(k);
    if (Math.hypot(dx, dy) < R * 0.22) return;
    const a = Math.atan2(dx, -dy); // 0 = up (forward)
    if (a > -Math.PI * 0.875 && a < -Math.PI * 0.125) keys.add("KeyA");
    if (a > Math.PI * 0.125 && a < Math.PI * 0.875) keys.add("KeyD");
    if (a > -Math.PI * 0.625 && a < Math.PI * 0.625) keys.add("KeyW");
    if (a > Math.PI * 0.375 || a < -Math.PI * 0.375) keys.add("KeyS");
  };
  stick.addEventListener("touchstart", (e) => {
    if (stickId !== null) return;
    const t = e.changedTouches[0], r = stick.getBoundingClientRect();
    stickId = t.identifier; cx = r.left + r.width / 2; cz = r.top + r.height / 2;
    e.preventDefault();
  }, { passive: false });
  stick.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      let dx = t.clientX - cx, dy = t.clientY - cz;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      setDir(dx, dy);
    }
    e.preventDefault();
  }, { passive: false });
  const stickEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null;
      knob.style.transform = "";
      for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) keys.delete(k);
    }
  };
  stick.addEventListener("touchend", stickEnd);
  stick.addEventListener("touchcancel", stickEnd);

  // Dragging anywhere else on the view looks around, the same as a mouse drag.
  let lookId = null, lookX = 0, lookY = 0;
  canvas.addEventListener("touchstart", (e) => {
    if (!started || panelOpen || lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
  }, { passive: true });
  canvas.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId || !started || panelOpen) continue;
      player.yaw -= (t.clientX - lookX) * 0.0032;
      player.pitch = Math.max(-1.35, Math.min(1.35, player.pitch - (t.clientY - lookY) * 0.0032));
      lookX = t.clientX; lookY = t.clientY;
    }
  }, { passive: true });
  const lookEnd = (e) => { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; };
  canvas.addEventListener("touchend", lookEnd);
  canvas.addEventListener("touchcancel", lookEnd);

  tcButton("#tc-jump", "Space");
  tcButton("#tc-run", "ShiftLeft", { toggle: true });
  tcButton("#tc-attack", "Space", { hold: true });
  tcButton("#tc-block", "ShiftLeft", { hold: true });
  tcButton("#tc-fire", "Space");
  tcButton("#tc-whip", "Space");
  tcButton("#tc-hopL", "KeyQ");
  tcButton("#tc-hopR", "KeyE");
  tcButton("#tc-oattack", "Space");
  tcButton("#tc-oblock", "ShiftLeft", { hold: true });
  tcButton("#tc-cruise", "KeyX"); // Race tracks cruise on/off itself and shows its own on-screen message
}

// ---------- movement ----------

let crashCd = 0, scrapeCd = 0;

// Scraping along a wall or building: it slows you down and wears you out (the faster you go, the worse it is).
// Number keys 1-9 pick how fast you walk (4 is a normal walking pace, 9 is a sprint).
const WALK_SPEEDS = [1.5, 2.5, 4, 5.5, 7, 8.5, 10, 11.5, 13];
let walkLevel = 4;
const walkSpeed = () => WALK_SPEEDS[walkLevel - 1] * Disease.speedMul * Robbery.chaseBoost;   // illness slows you
function setWalkLevel(n) {
  walkLevel = n;
  toast(`Walking speed ${n}/9${n === 1 ? " (a slow stroll)" : n === 4 ? " (normal)" : n === 9 ? " (sprint)" : ""}`);
}

function scrape(pace, dt, tx, tz) {
  const k = Math.max(0, 1 - 3 * dt);
  player.vx *= k; player.vz *= k;
  Vitals.hp = Math.max(0, Vitals.hp - (1.4 + pace * 0.22) * dt);
  player.shake = Math.max(player.shake || 0, 0.18);
  if (scrapeCd <= 0) {
    scrapeCd = 1.1;
    Sfx.play("scrape");
    toast(`You are scraping along ${describeObstacle(tx, tz)}: it slows you down and hurts`);
  }
}

// What did you run into? Uses the obstacle that blockedAt() last reported.
function describeObstacle(tx, tz) {
  lastBlock = null;
  blockedAt(tx, tz, groundAt(player.x, player.z));
  const b = lastBlock;
  if (!b) return "a wall";
  if (b.mine) return "your parked car";
  if (b.era === "modern" && b.t === 1) return "a lamp post";
  if (b.era === "modern" && b.y1 === 1.5) return "a parked car";
  if (b.t === 2) return "the huge stone wall";
  if (b.y1 - b.y0 > 7) return "a building";
  if (b.t === 1) return "a column";
  return "a wall";
}

// A moving car hits you: it hurts more the faster it was going, and throws you to the side.
function carHit(h) {
  crashCd = 1.4;
  const dmg = Math.min(50, 10 + h.v * 3.4);
  Vitals.hp = Math.max(0, Vitals.hp - dmg);
  player.stun = 0.9; player.shake = 1;
  $("#flash").style.opacity = 0.6;
  const kx = h.rx * h.side * 2.6, kz = h.rz * h.side * 2.6;
  if (canMove(player.x, player.z, player.x + kx, player.z + kz)) { player.x += kx; player.z += kz; }
  player.vx = player.vz = 0;
  DGames.bumped();
  Sfx.play("bump");
  toast(`${h.what ? h.what[0].toUpperCase() + h.what.slice(1) : "A car"} hit you! (-${Math.round(dmg)} health)`);
}

function crash(impact, dx, dz, tx, tz) {
  crashCd = 0.8;
  const hard = impact > 9; // running into it
  const what = describeObstacle(tx, tz);
  const dmg = Math.min(18, 2 + impact * 0.7);
  Vitals.hp = Math.max(0, Vitals.hp - dmg);
  player.stun = hard ? 0.7 : 0.4;
  player.shake = hard ? 0.9 : 0.5;
  const len = Math.hypot(dx, dz) || 1, kx = (-dx / len) * 0.8, kz = (-dz / len) * 0.8; // knocked back a step
  if (canMove(player.x, player.z, player.x + kx, player.z + kz)) { player.x += kx; player.z += kz; }
  player.vx = player.vz = 0;
  $("#flash").style.opacity = hard ? 0.5 : 0.28;
  Sfx.play("bump");
  toast(`Ouch! You ran into ${what}${hard ? " at full speed" : ""} (-${Math.round(dmg)} health)`);
}

// Knocking over too many citizens gets you arrested: the guards take you to the arena for a trial by combat
// (four gladiators and then a lion, with the sword). Only in Ancient Rome.
const knockTimes = [];
function noteKnock() {
  if (era === "modern" && mode !== "fight") { Guards.crime(18, "knocking people over"); return; }   // today the police (on foot and in cars) come after you
  if (city !== "rome" || era !== "ancient" || mode === "fight") return;
  knockTimes.push(clock);
  Guards.crime(18, "knocking people over");
  while (knockTimes.length && clock - knockTimes[0] > 150) knockTimes.shift(); // forgotten after two and a half minutes
  if (knockTimes.length === 3) toast("The guards are watching you! Stop knocking people over");
  else if (knockTimes.length === 5) toast("One more and the guards will arrest you!");
  else if (knockTimes.length >= 7) arrest();
}

function arrest() {
  if (mode !== "walk" && mode !== "drive") return;
  knockTimes.length = 0;
  if (mode === "drive") Car.exit(true);
  Vitals.stopRest(); Nav.clear();
  toast("The guards seize you!");
  Narrator.say("The guards seize you! For knocking over so many citizens you must face a trial by combat: four gladiators and a lion, with a sword.", { interrupt: true });
  $("#sleep").classList.add("on");
  setTimeout(() => {
    $("#sleep").classList.remove("on");
    if (mode !== "walk") return;
    Fight.start({ trial: true });
    toast("Trial by combat! Beat four gladiators and a lion with your sword to win your freedom");
  }, 1600);
}

// R: shove the citizen standing in front of you (within about two steps) so they fall over, whatever your pace. The guards notice, like with any knock-over.
let shoveCd = 0;
// the other player standing in front of you within reach (nearer than `limit`), or { close } for one who is close by but not in front
function shovablePlayer(limit = 1e9) {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let peer = null, pd = limit, close = null;
  if (typeof Online === "undefined") return { peer, close };
  for (const p of Online.peerList()) {
    if (p.x === null || !p.id || (p.down || 0) > 0) continue;
    const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
    if (d < 0.05 || d > 4.5) continue;
    if (d <= 2.8 && (dx * fx + dz * fz) / d >= 0.35 && d < pd) { peer = p; pd = d; } else close = close || p;
  }
  return { peer, close };
}
function shove() {
  if (shoveCd > 0 || sleepT > 0 || player.stun > 0) return;
  shoveCd = 0.8;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let best = null, bd = 1e9;
  for (const c of peopleHere()) {
    if ((c.down || 0) > 0) continue;
    const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz);
    if (d > 2.1 || d < 0.05 || (dx * fx + dz * fz) / d < 0.6 || d >= bd) continue;
    best = c; bd = d;
  }
  Sfx.play("swing");
  let peer = null, pd = bd;                                   // other players count too (the game server checks they really are that close)
  const near = shovablePlayer(pd);
  if (near.peer) peer = near.peer;
  if (peer) { Online.shovePeer(peer.id); return; }   // the guards only hear of it when the server says the shove landed (Online: shove_ok)
  if (!best) { toast(near.close ? `${near.close.name} is close: face them and step a little nearer, then press R` : "Nobody within reach. Step up to someone and press R to shove them"); return; }
  best.down = 1.8;
  noteKnock();
  Speech.rammed(best, false);
  const nx = best.x + fx * 1.6, nz = best.z + fz * 1.6;
  if (canMove(best.x, best.z, nx, nz)) { best.x = nx; best.z = nz; }
  Sfx.play("oof");
  toast("You shoved a citizen over");
}

// Running into a citizen knocks them over.
function bumpCitizens(pace) {
  if (pace < 2.5) return;
  for (const c of peopleHere()) {
    if ((c.down || 0) > 0) continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d > 0.95) continue;
    const hard = pace > 8;
    c.down = hard ? 2.4 : 1.4;
    noteKnock();
    Speech.rammed(c, hard);
    const push = 1.3 / (d || 1);
    const nx = c.x + (c.x - player.x) * push, nz = c.z + (c.z - player.z) * push;
    if (canMove(c.x, c.z, nx, nz)) { c.x = nx; c.z = nz; }
    player.vx *= 0.35; player.vz *= 0.35;
    Sfx.play("oof");
    if (crashCd <= 0) {
      crashCd = 0.5;
      player.shake = Math.max(player.shake || 0, hard ? 0.6 : 0.3);
      if (hard) Vitals.hp = Math.max(0, Vitals.hp - 5);
      toast(hard ? "Crash! You knocked over a citizen" : "Oops! You bumped into a citizen");
      DGames.bumped();
    }
    break;
  }
}

function updatePlayer(dt) {
  let fwd = 0, side = 0, turn = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) side += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) side -= 1;
  if (keys.has("KeyQ")) turn += 1;
  if (keys.has("KeyE")) turn -= 1;
  player.yaw += turn * 1.9 * dt;

  const speed = (mode === "online" ? 5.5 : keys.has("ShiftLeft") || keys.has("ShiftRight") ? Math.max(13 * Disease.speedMul * Robbery.chaseBoost, walkSpeed()) : walkSpeed()) * (city === "cancun" ? Cancun.swimMul() : 1); // in a duel everyone is the same speed (Shift blocks); swimming is slower
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = -fz, rz = fx;
  let tx = fx * fwd + rx * side, tz = fz * fwd + rz * side;
  const len = Math.hypot(tx, tz);
  if (len > 0) { tx = (tx / len) * speed; tz = (tz / len) * speed; }
  if (player.stun > 0) { player.stun -= dt; tx = tz = 0; } // dazed after a crash
  if (sleepT > 0) tx = tz = 0; // asleep
  crashCd = Math.max(0, crashCd - dt); shoveCd = Math.max(0, shoveCd - dt);
  scrapeCd = Math.max(0, scrapeCd - dt);
  const a = Math.min(1, dt * 9);
  player.vx += (tx - player.vx) * a;
  player.vz += (tz - player.vz) * a;

  const dx = player.vx * dt, dz = player.vz * dt, pace = Math.hypot(player.vx, player.vz);
  if (Math.abs(dx) + Math.abs(dz) > 1e-5) {
    let mx = 0, mz = 0;
    if (canMove(player.x, player.z, player.x + dx, player.z + dz)) { mx = dx; mz = dz; }
    else if (canMove(player.x, player.z, player.x + dx, player.z)) mx = dx;
    else if (canMove(player.x, player.z, player.x, player.z + dz)) mz = dz;
    else { player.vx = 0; player.vz = 0; }
    player.x += mx; player.z += mz;
    // A hard hit is a crash, grinding along a wall is a scrape, and brushing past one is nothing
    const lost = Math.hypot(dx - mx, dz - mz) / dt; // how fast you were pushing into the obstacle
    if (lost > 4 && crashCd <= 0) crash(lost, dx, dz, player.x + dx, player.z + dz);
    else if (lost > 0.6) scrape(pace, dt, player.x + dx, player.z + dz); // grinding along a wall
  }
  bumpCitizens(pace);
  const moving = Math.hypot(player.vx, player.vz);
  player.bob += moving * dt * 1.6;

  const ground = groundAt(player.x, player.z);
  player.feet += (ground - player.feet) * Math.min(1, dt * 14);

  // jumping: a simple hop, with gravity pulling you back down to the ground you're standing on
  if (player.airY > 0 || player.vy > 0) {
    player.vy -= GRAVITY * dt;
    player.airY = Math.max(0, player.airY + player.vy * dt);
    if (player.airY <= 0) { player.airY = 0; player.vy = 0; }
  }

  player.y = player.feet + player.airY + EYE + Math.sin(player.bob) * Math.min(0.045, moving * 0.006);
}

// Teleport to (x, z), moving to the nearest open spot if that one is blocked.
function placeAt(x, z, yaw) {
  for (let r = 0; r < 60; r += 2) {
    for (let k = 0; k < (r === 0 ? 1 : 12); k++) {
      const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (px < BOUNDS.minX || px > BOUNDS.maxX || pz < BOUNDS.minZ || pz > BOUNDS.maxZ) continue;
      const g = groundAt(px, pz);
      if (!blockedAt(px, pz, g)) {
        player.x = px; player.z = pz; player.feet = g; player.vx = player.vz = 0;
        if (yaw !== undefined) player.yaw = yaw;
        return;
      }
    }
  }
}

const yawToward = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));

function goTo(lm) {
  if (Jail.active) { toast("You are in jail: wait out your sentence or bribe the guard."); return; }
  const [sx, sz] = lm.stand;
  placeAt(sx, sz, yawToward(sx, sz, lm.x, lm.z));
  player.pitch = -0.02;
  closePanels();
}

// ---------- your own avatar, for third-person view ----------

let avatar, avParts, avPhase = 0, avMats = null;

// Camera views, cycled with C (Shift+C goes back). Every view except "first" shows your own character.
const VIEWS = [
  { id: "close", name: "Close behind" },
  { id: "far", name: "Far behind" },
  { id: "side", name: "Side" },
  { id: "front", name: "Front" },
  { id: "top", name: "Bird's-eye" },
  { id: "first", name: "First person" },
];
let viewIndex = 0, camZoom = 1; // camZoom: the mouse wheel moves the camera closer or further away
try { const i = VIEWS.findIndex((v) => v.id === localStorage.getItem("rome-view")); if (i >= 0) viewIndex = i; } catch (e) { /* storage unavailable */ }
const viewId = () => (typeof Cancun !== "undefined" && city === "cancun" && Cancun.snorkeling ? "first" : VIEWS[viewIndex].id);   // snorkelling is always seen through your own mask; your usual camera comes back when you surface

// A person: you, and the other players online.
function createFigure() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a273 });
  const robe = new THREE.MeshLambertMaterial({ color: 0xf3e6c8 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x9c3a2e });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.33, 0.78, 8), robe);
  torso.position.y = 0.98; torso.castShadow = true; g.add(torso);
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 8), trim);
  sash.position.y = 0.72; g.add(sash);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skin);
  head.position.y = 1.52; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
  hair.position.set(0, 1.57, 0.035); g.add(hair); // set back a little so the forehead shows
  // a face on the front of the head (you face local -z)
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1a1410 });
  for (const ex of [-0.07, 0.07]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), eyeMat); eye.position.set(ex, 1.53, -0.182); g.add(eye); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), skin);
  nose.position.set(0, 1.49, -0.192); g.add(nose);

  const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6); armGeo.translate(0, -0.25, 0);
  const legGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.62, 6); legGeo.translate(0, -0.31, 0);
  const mkLimb = (geo, mat, x, y, z) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; piv.add(m); g.add(piv);
    return piv;
  };
  const armL = mkLimb(armGeo, skin, -0.29, 1.32, 0);
  const armR = mkLimb(armGeo, skin, 0.29, 1.32, 0);
  const legL = mkLimb(legGeo, robe, -0.13, 0.62, 0);
  const legR = mkLimb(legGeo, robe, 0.13, 0.62, 0);

  // accessories bought in the Market (hidden until worn)
  const metal = (c) => new THREE.MeshLambertMaterial({ color: c, emissive: 0x241a05 });
  const acc = {};
  const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 16), new THREE.MeshLambertMaterial({ color: 0x4f7a3a }));
  wreath.rotation.x = Math.PI / 2; wreath.position.y = 1.62;
  const helmet = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), metal(0xb08a3a));
  dome.position.y = 1.54;
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.4), new THREE.MeshLambertMaterial({ color: 0xa8342c }));
  crest.position.y = 1.83;
  helmet.add(dome, crest);
  const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.0, 0.04), new THREE.MeshLambertMaterial({ color: 0xa8342c, side: THREE.DoubleSide }));
  cloak.position.set(0, 1.0, 0.24); cloak.rotation.x = 0.1;
  const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), metal(0xd9b44a));
  clasp.position.set(0, 1.42, -0.2);
  const cuirass = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.35, 0.5, 10), metal(0xcfa84a));
  cuirass.position.y = 1.12;
  const bands = [armL, armR].map((arm) => { const b = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 12), metal(0xd9b44a)); b.rotation.x = Math.PI / 2; b.position.y = -0.12; arm.add(b); return b; }); // on the upper arms, so they swing with them
  const crown = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 14, 1, true), metal(0xe0b83c));
  ring.position.y = 1.7; crown.add(ring);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), metal(0xe0b83c)); tip.position.set(Math.cos(a) * 0.2, 1.81, Math.sin(a) * 0.2); crown.add(tip); }
  const royalcloak = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.15, 0.04), new THREE.MeshLambertMaterial({ color: 0x6a1b5e, side: THREE.DoubleSide }));
  royalcloak.position.set(0, 0.95, 0.25); royalcloak.rotation.x = 0.12;
  const trim2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.05), metal(0xe0b83c));
  trim2.position.set(0, 0.4, 0.27);
  const boots = [legL, legR].map((leg) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0x4a3322 })); b.position.y = -0.5; leg.add(b); return b; });
  const shield = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), new THREE.MeshLambertMaterial({ color: 0xa8342c }));
  disc.rotation.z = Math.PI / 2;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), metal(0xb08a3a));
  boss.position.x = -0.04;
  shield.add(disc, boss); shield.position.set(-0.08, -0.3, -0.12); armL.add(shield);
  acc.wreath = [wreath]; acc.helmet = [helmet]; acc.crown = [crown]; acc.cloak = [cloak, clasp]; acc.royalcloak = [royalcloak, trim2];
  acc.cuirass = [cuirass]; acc.armbands = bands; acc.boots = boots; acc.shield = [shield];
  for (const list of Object.values(acc)) for (const o of list) { o.visible = false; if (!o.parent) g.add(o); }

  // a short sword in the right hand (shown in duels)
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.025), new THREE.MeshLambertMaterial({ color: 0xc9ced4 }));
  blade.position.y = -0.98;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06), new THREE.MeshLambertMaterial({ color: 0x8a6a2a }));
  guard.position.y = -0.52;
  sword.add(blade, guard);
  sword.visible = false;
  armR.add(sword);
  return { g, parts: { armL, armR, legL, legR }, mats: { skin, robe, trim, hair: hairMat }, sword, acc, hair };
}

function paintFigure(mats, look) {
  mats.skin.color.setHex(Character.color("skin", look.skin));
  mats.hair.color.setHex(Character.color("hair", look.hair));
  mats.robe.color.setHex(Character.color("toga", look.toga));
  mats.trim.color.setHex(Character.color("sash", look.sash));
}

// Show the accessories in `ids` on a figure (yours, or another player's online).
function applyAccessories(fig, ids) {
  const worn = new Set(Array.isArray(ids) ? ids : []);
  for (const [id, list] of Object.entries(fig.acc)) for (const o of list) o.visible = worn.has(id);
  fig.hair.visible = !worn.has("helmet");
}

let avFig = null;
function buildAvatar() {
  avFig = createFigure();
  avFig.g.visible = false;
  scene.add(avFig.g);
  avatar = avFig.g; avParts = avFig.parts; avMats = avFig.mats;
}

function updateAvatar(dt) {
  avatar.visible = ((viewId() !== "first" || creatorOpen) && mode === "walk") || mode === "online";
  if (!avatar.visible) return;
  avatar.position.set(player.x, player.feet + player.airY + (city === "cancun" ? Cancun.avatarDrop() : 0), player.z);   // swimming: in the water up to your chest
  avatar.rotation.y = player.yaw;
  const pace = Math.hypot(player.vx, player.vz);
  if (pace > 0.3) avPhase += dt * (pace / 5.5) * 6.2;
  const swing = pace > 0.3 ? Math.sin(avPhase) * Math.min(1, pace / 8.5) * 0.7 : 0;
  avParts.armL.rotation.x = swing; avParts.armR.rotation.x = -swing;
  avParts.legL.rotation.x = -swing; avParts.legR.rotation.x = swing;
  if (mode === "online") Online.poseMine(avParts);
}

function refreshViewButton() { $("#btn-view").innerHTML = `View: ${VIEWS[viewIndex].name} <kbd>C</kbd>`; }

function cycleView(dir) {
  viewIndex = (viewIndex + dir + VIEWS.length) % VIEWS.length;
  camZoom = 1;
  try { localStorage.setItem("rome-view", viewId()); } catch (e) { /* ignore */ }
  refreshViewButton();
  toast(`Camera ${viewIndex + 1}/${VIEWS.length}: ${VIEWS[viewIndex].name}${viewId() === "first" ? " (you can't see yourself)" : ""}`);
}

// The chase cameras: put the camera at an offset from you (pulled in when a wall is in the way) and look toward you.
function chaseCamera() {
  let id = creatorOpen ? "front" : (mode === "online" && viewId() === "first" ? "close" : viewId());
  if (id === "top" && homeHere(player.x, player.z)) id = "close"; // the roof would hide you
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = -fz, rz = fx; // forward and right
  const z = creatorOpen ? (innerWidth > 700 ? 0.62 : 1.5) : camZoom; // narrow screens: pull back so the whole figure fits above the panel
  let dx = -fx, dz = -fz, dist = 4.2 * z, up = 0, pitch = player.pitch, yaw = player.yaw, tilt = 0.6;
  if (id === "far") { dist = 10 * z; up = 2.6 * z; pitch = player.pitch - 0.14; tilt = 0.4; }
  else if (id === "side") { dx = rx; dz = rz; dist = 5 * z; up = 0.3; yaw = Math.atan2(rx, rz); pitch = -0.06; tilt = 0; }
  else if (id === "front") { dx = fx; dz = fz; dist = 3.4 * z; up = 0.1; yaw = player.yaw + Math.PI; pitch = -0.05; tilt = 0; }
  else if (id === "top") { up = 11 * z; dist = up / Math.tan(1.15); pitch = -1.15; tilt = 0; } // high up, looking down at you at an angle
  let d = dist;
  for (; d > 0.9; d -= 0.25) if (!blockedAt(player.x + dx * d, player.z + dz * d, player.feet + 1.0)) break;
  const cx = player.x + dx * d, cz = player.z + dz * d;
  const wd = city === "cancun" ? Cancun.camDrop() : 0;                                                    // in the water the camera sinks with you (and goes under the surface when you snorkel)
  const cy = wd ? player.y + wd + up - Math.sin(player.pitch) * d * tilt : Math.max(groundAt(cx, cz) + 0.5, player.y + up - Math.sin(player.pitch) * d * tilt);
  camera.position.set(cx, cy, cz);
  camera.rotation.set(pitch, yaw, 0);
}

// ---------- your character: name, class and look ----------

let creatorOpen = false, draft = null;

function applyLook(look) {
  if (avMats) paintFigure(avMats, look);
}

function applyCharacter() {
  applyLook(Character.look);
  $("#v-char").textContent = Character.exists ? `${Character.name} · ${Character.className}` : "";
  if (typeof Social !== "undefined") Social.render();   // puts your rank badge back beside your name
}

// Slides the 3D view to the right so you can see yourself beside the character panel.
function creatorCamera(on) {
  if (!camera) return;
  const w = innerWidth, h = innerHeight;
  if (on && w > 700) camera.setViewOffset(w, h, -w * 0.2, 0, w, h); // panel on the left: slide the view right
  else if (on) camera.setViewOffset(w, h, 0, h * 0.24, w, h); // panel along the bottom: slide the view up
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

function buildCreator() {
  const mk = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
  for (const id of Object.keys(Character.CLASSES)) {
    const c = Character.CLASSES[id];
    const b = mk("button", "cr-class"), ul = mk("ul");
    b.type = "button"; b.dataset.id = id;
    for (const t of c.perks) ul.append(mk("li", "", t));
    b.append(mk("strong", "", c.name), mk("small", "", c.blurb), ul);
    b.addEventListener("click", () => { draft.cls = id; refreshCreator(); });
    $("#cr-classes").append(b);
  }
  for (const part of Object.keys(Character.COLORS)) {
    Character.COLORS[part].forEach((hex, i) => {
      const s = mk("button", "swatch");
      s.type = "button"; s.dataset.part = part; s.dataset.i = i;
      s.style.background = "#" + hex.toString(16).padStart(6, "0");
      s.setAttribute("aria-label", `${part} colour ${i + 1}`);
      s.addEventListener("click", () => {
        draft.look[part] = i; $("#cr-note").textContent = ""; refreshCreator();
      });
      $(`#cr-${part}`).append(s);
    });
  }
  $("#cr-name").addEventListener("input", (e) => { draft.name = e.target.value; });
  $("#cr-ok").addEventListener("click", confirmCreator);
  $("#cr-cancel").addEventListener("click", () => { if (Character.exists) closeCreator(); });
  $("#cr-name").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmCreator(); });
}

function refreshCreator() {
  for (const b of document.querySelectorAll(".cr-class")) b.classList.toggle("on", b.dataset.id === draft.cls);
  for (const s of document.querySelectorAll(".swatch")) s.classList.toggle("on", draft.look[s.dataset.part] === Number(s.dataset.i));
  applyLook(draft.look);
}

function openCreator(first) {
  if (mode !== "walk" || creatorOpen) return;
  closePanels();
  draft = { name: Character.name, cls: Character.cls, look: { ...Character.look } };
  creatorOpen = true; panelOpen = true;
  document.body.classList.add("creating");
  Vitals.stopRest();
  player.vx = player.vz = 0; keys.clear();
  $("#creator").classList.add("show");
  $("#cr-name").value = draft.name;
  $("#cr-cancel").hidden = !Character.exists;
  $("#cr-ok").textContent = first ? "Begin" : "Save";
  $("#cr-note").textContent = "Pick a name, a class and your look.";
  if (document.pointerLockElement) document.exitPointerLock();
  creatorCamera(true);
  refreshCreator();
  setTimeout(() => { try { $("#cr-name").focus(); } catch (e) { /* ignore */ } }, 50);
}

function closeCreator() {
  creatorOpen = false; panelOpen = false;
  document.body.classList.remove("creating");
  $("#creator").classList.remove("show");
  try { document.activeElement.blur(); } catch (e) { /* ignore */ }
  creatorCamera(false);
  applyCharacter(); // drops any unsaved preview
}

function confirmCreator() {
  const name = Character.cleanName(draft.name);
  if (name.length < 2) { toast("Give your character a name (2 to 16 letters)"); $("#cr-name").focus(); return; }
  Character.set({ name, cls: draft.cls, look: draft.look });
  closeCreator();
  toast(`Welcome, ${Character.name} the ${Character.className}`);
  Narrator.say(`Welcome, ${Character.name} the ${Character.className}.`, { interrupt: true });
}

// ---------- discovery & info card ----------

let currentLm = null, lastCheck = 0;
let DISCOVERABLE = LANDMARKS.filter((l) => !l.home && !l.game); // your house is on the map but is not a sight to discover
const DISCOVER_REWARD = 50;
const seenCount = () => DISCOVERABLE.filter((l) => discovered.has(l.id)).length;

function checkLandmarks(t) {
  if (t - lastCheck < 0.25) return;
  lastCheck = t;
  let best = null, bestD = Infinity;
  for (const lm of LANDMARKS) {
    const d = Math.hypot(player.x - lm.x, player.z - lm.z);
    if (d < lm.r && d / lm.r < bestD) { best = lm; bestD = d / lm.r; }
  }
  if (best !== currentLm) {
    currentLm = best;
    showCard(best);
    if (best && !best.home && !best.game && !discovered.has(best.id)) {
      discovered.add(best.id);
      try { localStorage.setItem("rome-discovered", JSON.stringify([...discovered])); } catch (e) { /* ignore */ }
      updateProgress();
      Vitals.coins += DISCOVER_REWARD; // every new sight pays 50 denarii, once
      toast(seenCount() === DISCOVERABLE.length ? (city === "delhi" ? "You have discovered all of Old Delhi. Wah!" : city === "cancun" ? "You have discovered all of Cancún and Chichén Itzá. ¡Increíble!" : "You have discovered all of Rome. Ave!") + ` (+${DISCOVER_REWARD} denarii)` : `Discovered: ${best.name} (+${DISCOVER_REWARD} denarii)`);
      Sfx.play("discover");
    }
  }
}

const spokenAt = {};
function showCard(lm) {
  const card = $("#card");
  if (!lm) { card.classList.remove("show"); Narrator.stop(); return; }
  if (!(spokenAt[lm.id] > performance.now() - 90000)) {
    spokenAt[lm.id] = performance.now();
    Narrator.say(`${lm.name}. ${lm.text} Did you know? ${lm.fact}`, { interrupt: true });
  }
  $("#card-name").textContent = lm.name;
  $("#card-sub").textContent = lm.sub;
  $("#card-text").textContent = lm.text;
  $("#card-fact").textContent = lm.fact;
  const modernNote = $("#card-modern");
  if (era === "modern" && lm.modern) { modernNote.textContent = "Today: " + lm.modern; modernNote.hidden = false; }
  else modernNote.hidden = true;
  card.classList.add("show");
}

function updateProgress() {
  $("#count").textContent = `${seenCount()} / ${DISCOVERABLE.length}`;
  $("#bar-fill").style.width = `${(seenCount() / DISCOVERABLE.length) * 100}%`;
  buildPlacesList();
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

// ---------- panels ----------

const bigMapOpen = () => $("#bigmap").classList.contains("show");
function closePanels() {
  $("#account").classList.remove("show");
  $("#online").classList.remove("show");
  for (const p of document.querySelectorAll(".dpanel.show")) p.classList.remove("show");
  $("#market").classList.remove("show");
  if (creatorOpen) { if (!Character.exists) return; closeCreator(); } // the first-time screen cannot be skipped
  $("#bigmap").classList.remove("show");
  $("#places").classList.remove("show");
  $("#controls").classList.remove("show");
  $("#result").classList.remove("show");
  panelOpen = false;
}
function openPanel(id) {
  if (mode === "fight" || mode === "race" || mode === "naval" || mode === "online" || mode === "drive" || mode === "dgame") return;
  if (creatorOpen && !Character.exists) return;
  closePanels();
  $(id).classList.add("show");
  panelOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function toggleBigMap() { if (bigMapOpen()) closePanels(); else { openPanel("#bigmap"); drawBigMap(); } }
function openPlaces(m) { placesMode = m; buildPlacesList(); openPanel("#places"); }
function togglePlaces() { if ($("#places").classList.contains("show") && placesMode === "go") closePanels(); else openPlaces("go"); }
function refreshVoiceButton() { $("#btn-voice").firstChild.textContent = Narrator.on ? "Voice on " : "Voice off "; }
function toggleVoice() {
  if (!Narrator.supported) { toast("This browser can't read text aloud"); return; }
  Narrator.toggle();
  refreshVoiceButton();
  toast(Narrator.on ? "Voice on: captions will be read aloud" : "Voice off");
  if (Narrator.on) Narrator.say("The narrator is on.", { repeat: true });
}
function refreshSoundButton() { $("#btn-sound").firstChild.textContent = Sfx.on ? "Sound on " : "Sound off "; }
function refreshMusicButton() { $("#btn-music").textContent = Music.on ? "Music on" : "Music off"; }
function toggleSound() { Sfx.init(); Sfx.toggle(); refreshSoundButton(); toast(Sfx.on ? "Sound on" : "Sound off"); }

// ---------- Ancient Rome / Modern Rome ----------

const ERA_NAMES = { rome: ["Ancient Rome", "Modern Rome"], delhi: ["Mughal Delhi", "Modern Delhi"], cancun: ["Maya Chichén Itzá", "Modern Cancún"] };

// The places you can see in this city and era (Delhi's Metro station only exists today).
function refreshLandmarks() {
  const list = (city === "delhi" ? DELHI_LANDMARKS : city === "cancun" ? CANCUN_LANDMARKS : ROME_LANDMARKS).filter((l) => !l.only || l.only === era);
  LANDMARKS.splice(0, LANDMARKS.length, ...list);
  DISCOVERABLE = LANDMARKS.filter((l) => !l.home && !l.game);
  currentLm = null;
  showCard(null);
  updateProgress();
}

function applyEra() {
  const modern = era === "modern";
  applyWorldEra(modern);
  applyInsulaeEra(modern);
  applyCitizensEra(modern);
  Modern.apply(modern);
  if (Delhi.built) Delhi.setEra(modern);
  if (Cancun.built) Cancun.setEra(modern);
  Car.onEra(modern); // cars and rickshaws only exist today, carts and elephants only in the ancient cities
  Crowd.setVisible(!modern);
  Jobs.setEra(modern);
  Guards.setEra(modern);
  const [oldName, newName] = ERA_NAMES[city];
  $("#era-badge").textContent = modern ? newName : oldName;
  $("#era-badge").classList.toggle("ancient", !modern);
  $("#btn-era").innerHTML = modern ? `${oldName} <kbd>K</kbd>` : `${newName} <kbd>K</kbd>`;
  $("#btn-city").innerHTML = "✈ Travel <kbd>B</kbd>";
  for (const b of document.querySelectorAll("#travel .tv-list button")) { b.disabled = b.dataset.city === city; b.classList.toggle("here", b.dataset.city === city); }
  $("#hud .top-left h1").innerHTML = city === "rome" ? (modern ? "Time Machine <small>Modern Rome · today</small>" : "Time Machine <small>Ancient Rome · c. 128 AD</small>") : city === "cancun" ? (modern ? "Time Machine <small>Cancún · today</small>" : "Time Machine <small>Chichén Itzá · c. 1000 AD</small>") : (modern ? "Time Machine <small>Modern Delhi · today</small>" : "Time Machine <small>Mughal Delhi · c. 1650</small>");
  $("#btn-dgames").hidden = city !== "delhi";
  $("#map-title").textContent = city === "rome" ? "Map of Rome" : city === "cancun" ? "Map of Cancún and Chichén Itzá" : "Map of Old Delhi";
  refreshLandmarks();
}

function toggleEra() {
  if (mode !== "walk") { toast("Leave the game first to switch eras"); return; }
  era = era === "ancient" ? "modern" : "ancient";
  try { localStorage.setItem("rome-era", era); } catch (e) { /* ignore */ }
  applyEra();
  Nav.clear(); // a route drawn in the other era may no longer be walkable
  if (blockedAt(player.x, player.z, player.feet)) placeAt(player.x, player.z); // something appeared where you stand
  const modern = era === "modern";
  const say = city === "delhi"
    ? (modern ? "Modern Delhi: the old city as it stands today" : "Mughal Delhi, around 1650, under the emperor Shah Jahan")
    : city === "cancun" ? (modern ? "Cancún today: the ruins of Chichén Itzá, and the Hotel Zone on the coast" : "Chichén Itzá and the Maya coast, around 1000 AD")
    : (modern ? "Modern Rome: the city as it stands today" : "Ancient Rome, c. 128 AD");
  toast(say);
  Narrator.say(city === "delhi" ? (modern ? "Modern Delhi. The old city as it stands today." : "Mughal Delhi, around 1650, under the emperor Shah Jahan.") : city === "cancun" ? (modern ? "Cancún today. The ruins of Chichén Itzá, and the Hotel Zone on the Caribbean coast." : "Chichén Itzá, around the year 1000, at the height of the Maya city.") : (modern ? "Modern Rome. The city as it stands today." : "Ancient Rome, around 128 AD, under the emperor Hadrian."), { interrupt: true });
  if (currentLm) showCard(currentLm); // refresh the open card's "today" note
}

// Travel between Rome and Old Delhi: the screen fades, you arrive in the other city.
let travelBusy = false;
const mapCache = {};
// The Travel button (or B): a list of the cities, and you choose where to go.
function openTravel() {
  if (Jail.active) { toast("You are in jail: wait out your sentence or bribe the guard."); return; }
  if ($("#travel").classList.contains("show")) { closePanels(); return; }
  if (mode !== "walk" || panelOpen || sleepT > 0 || !started) { toast("Close what is open and stop the game first to travel"); return; }
  for (const b of document.querySelectorAll("#travel .tv-list button")) { b.disabled = b.dataset.city === city; b.classList.toggle("here", b.dataset.city === city); }
  openPanel("#travel");
}

function travel(to) {
  if (Jail.active) { toast("You are in jail: wait out your sentence or bribe the guard."); return; }
  if (mode !== "walk" || panelOpen || sleepT > 0 || !started) { toast("Close what is open and stop the game first to travel"); return; }
  if (to === city || travelBusy) return;
  travelBusy = true;
  Vitals.stopRest(); Nav.clear();
  $("#sleep").classList.add("on");
  setTimeout(() => {
    try { arriveIn(to); } catch (err) { console.error(err); toast("Could not travel"); }
    $("#sleep").classList.remove("on");
    travelBusy = false;
  }, 900);
}

function arriveIn(to) {
  city = to;
  if (to === "delhi") {
    Delhi.build(scene);
    Object.assign(BOUNDS, Delhi.BOUNDS); Object.assign(MAP, Delhi.MAP);
  } else if (to === "cancun") {
    Cancun.build(scene);
    Object.assign(BOUNDS, Cancun.BOUNDS); Object.assign(MAP, Cancun.MAP);
  } else { Object.assign(BOUNDS, ROME_BOUNDS); Object.assign(MAP, ROME_MAP); }
  Delhi.show(to === "delhi");
  Cancun.show(to === "cancun");
  if (!mapCache[to]) { buildBaseMap(); mapCache[to] = baseMap; } else baseMap = mapCache[to];
  applyEra();
  if (to === "delhi") placeAt(Delhi.SPAWN.x, Delhi.SPAWN.z, Delhi.SPAWN.yaw);
  else if (to === "cancun") placeAt(Cancun.SPAWN.x, Cancun.SPAWN.z, Cancun.SPAWN.yaw);
  else placeAt(165, 6, Math.PI / 2);
  player.pitch = -0.02;
  const modern = era === "modern";
  const msg = to === "cancun" ? `Cancún and Chichén Itzá: ${modern ? "the ruins today, and the Hotel Zone on the coast" : "the Maya city around 1000 AD, and the coast"}. Climb El Castillo, the big pyramid in front of you. The market stalls are south of the plaza (press G, then The Market, for directions).` : to === "delhi" ? `Delhi: ${modern ? "the old city today" : "Shahjahanabad, c. 1650"}. Walk down Chandni Chowk to the Red Fort. The market stalls are in the square south of the Lahori Gate (press G, then The Market, for directions).` : "Back in Rome. The market square is south of the Forum (press G, then The Market).";
  toast(msg);
  Narrator.say(to === "cancun" ? (modern ? "Welcome to Cancún. The ruins of Chichén Itzá are around you, and the Caribbean coast is to the east." : "Welcome to Chichén Itzá, the great Maya city, around the year 1000. The pyramid of Kukulcán is in front of you.") : to === "delhi" ? (modern ? "Welcome to Old Delhi, as it stands today. The Red Fort is at the end of Chandni Chowk." : "Welcome to Shahjahanabad, the walled capital of the Mughal emperor Shah Jahan, around 1650. The Red Fort is at the end of Chandni Chowk.") : "Back in Rome.", { interrupt: true });
}

function toggleDirections() { if ($("#places").classList.contains("show") && placesMode === "dirs") closePanels(); else openPlaces("dirs"); }
function toggleControls() { if ($("#controls").classList.contains("show")) closePanels(); else openPanel("#controls"); }

// End-of-game screen shared by the fight and the race.
function showResult(title, text, buttons) {
  $("#result-title").textContent = title;
  $("#result-text").textContent = text;
  Narrator.say(`${title}${/[.!?]$/.test(title) ? "" : "."} ${text}`, { interrupt: true });
  $("#result-buttons").replaceChildren(...buttons.map((b) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = b.label;
    btn.addEventListener("click", b.fn);
    return btn;
  }));
  openPanel("#result");
}

// Shows "Press F / R" when standing in the arena or on the racetrack.
function updatePrompt() {
  const p = $("#prompt");
  let text = "";
  if (mode === "walk" && !panelOpen) {
    const stables = inCircusArea(player.x, player.z);
    p.dataset.kind = "";
    if (Vitals.resting) text = "Resting... move to stand up";
    else if (era === "modern" && (inArena(player.x, player.z) || inCircusTrack(player.x, player.z) || inColosseum(player.x, player.z) || inCircusStands(player.x, player.z))) text = "The games only ran in Ancient Rome. Press K to go back";
    else if (inArena(player.x, player.z)) text = Vitals.canFight() ? "F: gladiators · U: animal hunt · L: lion · N: build your ship and fight a naval battle · V: watch the games" : "Too wounded to fight. Press Z to rest and heal · V: watch the games";
    else if (inCircusTrack(player.x, player.z)) text = !Vitals.canRace() ? "The horses need rest. Press Z to rest at the stables · V: watch a race" : `R: race a chariot (${Math.round(Vitals.RACE_ENTRY * Character.mod("fee"))} denarii) · V: watch a race`;
    else if (era === "ancient" && city === "rome" && Theatre.inTheatre(player.x, player.z)) text = "Press V to watch a play";
    else if (inColosseum(player.x, player.z)) text = "Press V to watch the games";
    else if (inCircusStands(player.x, player.z)) text = "Press V to watch a chariot race";
    if (!text && city === "delhi") { const v = Delhi.venueAt(player.x, player.z, player.feet); if (v) { text = v.text; p.dataset.kind = "dgame"; } }
    if (!text) { const st = Stalls.at(player.x, player.z, player.feet); if (st) { text = st.id === "board" ? "F: read the job board" : `F: shop at the ${st.name}`; p.dataset.kind = "stall"; } }
    if (!text) { const jp = Jobs.at(player.x, player.z, player.feet); if (jp) { text = jp.text; p.dataset.kind = "job"; } }
    if (!text) { const rb = Robbery.at(player.x, player.z, player.feet); if (rb) { text = `F: break into ${rb.name}'s house and rob it`; p.dataset.kind = "rob"; } }
    if (!text && Dresser.at(player.x, player.z, player.feet)) { text = "F: open your dresser (see what you can wear)"; p.dataset.kind = "dresser"; }
    if (!text && mode === "walk") { const sp = shovablePlayer().peer; if (sp) { text = `R: shove ${sp.name}`; p.dataset.kind = "shove"; } }
    if (!text && city === "cancun") { const ct = Cancun.promptText(); if (ct) { text = ct; p.dataset.kind = "cancun"; } }
    if (!text && Cage.at(player.x, player.z, player.feet)) { text = "F: open the cage (choose which animal comes with you)"; p.dataset.kind = "cage"; }
    if (!text) { const hb = Harbour.at(player.x, player.z, player.feet); if (hb) { text = hb.text; p.dataset.kind = "harbour"; } }
    if (!text && Garage.at(player.x, player.z, player.feet)) { text = "F: open your garage"; p.dataset.kind = "garage"; }
    if (!text && Car.nearby()) { text = `Press X to ${Car.verb} your ${Car.MODELS[Car.current].name.toLowerCase()}`; p.dataset.kind = "car"; }
    if (!text && Vitals.needsRest(stables)) { text = "Press Z to rest and heal"; p.dataset.kind = "rest"; }
    else if (text.includes("Press Z")) p.dataset.kind = "rest";
  }
  if (p.dataset.t !== text) { p.dataset.t = text; p.textContent = text; p.classList.toggle("show", !!text); }
}

function toggleRest() {
  if (mode !== "walk" || panelOpen || sleepT > 0) return;
  if (homeHere(player.x, player.z) && Time.bedtime) { startSleep(false); return; }
  if (Vitals.resting) { Vitals.stopRest(); return; }
  const stables = inCircusArea(player.x, player.z);
  if (!Vitals.needsRest(stables)) { toast("You are already in good shape"); return; }
  Vitals.startRest();
  toast(stables ? "Resting at the stables: you and the horses recover" : "Resting: you recover. The horses only recover quickly at the Circus stables");
}

// Hunger warnings: you must eat. Food is sold at the market square (the food stall).
let hungerBand = 0;
function hungerWarn() {
  const h = Vitals.hunger, band = h <= 0.01 ? 3 : h <= 15 ? 2 : h <= 40 ? 1 : 0;
  if (band > hungerBand) {
    toast(band === 1 ? "You are getting hungry. Buy food at the food stall in the market square (see Places)." : band === 2 ? "You are very hungry! Eat soon." : "You are starving! You lose health until you eat. Buy food now.");
    if (band >= 2) Narrator.say(band === 3 ? "You are starving." : "You are very hungry.", { interrupt: false });
  }
  hungerBand = band;
}
let lastCoins = Vitals.coins;
function updateVitalsHud() {
  $("#v-hp").style.width = `${Vitals.hp}%`;
  $("#v-hp").style.background = Vitals.hp < Vitals.MIN_FIGHT_HP ? "#c0392b" : Vitals.hp < 65 ? "#e2b955" : "#3aa557";
  $("#v-hunger").style.width = `${Vitals.hunger}%`;
  $("#v-hunger").style.background = Vitals.hunger <= 15 ? "#c0392b" : Vitals.hunger < 40 ? "#e2b955" : "#3aa557";
  $("#v-hunger-n").textContent = `Food ${Math.round(Vitals.hunger)}`;
  hungerWarn();
  $("#v-horse").style.width = `${Vitals.horses}%`;
  $("#v-horse").style.background = Vitals.horses < Vitals.MIN_RACE_HORSES ? "#c0392b" : Vitals.horses < 65 ? "#e2b955" : "#3aa557";
  if (Vitals.coins > lastCoins) Sfx.play("coin");
  lastCoins = Vitals.coins;
  $("#v-coins").textContent = Vitals.coins;
  const hurt = Vitals.hp < 99.5 || Vitals.horses < 99.5;
  $("#v-rest").textContent = Vitals.resting ? "Resting..." : (hurt && (mode === "walk" || mode === "watch")) ? "Recovering slowly (press Z to rest)" : "";
}

let placesMode = "go"; // "go": rows teleport you. "dirs": rows give walking directions.

function buildPlacesList() {
  const dirs = placesMode === "dirs";
  const ul = $("#places-list");
  const list = dirs ? [...LANDMARKS].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z)) : LANDMARKS;
  ul.replaceChildren(...list.map((lm) => {
    const li = document.createElement("li");
    li.dataset.id = lm.id;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "go";
    const seen = discovered.has(lm.id);
    b.innerHTML = `<span class="dot ${seen ? "seen" : ""}"></span><span><strong></strong><small></small><em class="away"></em></span>`;
    b.querySelector("strong").textContent = lm.name;
    b.querySelector("small").textContent = lm.sub;
    b.title = dirs ? `Walking directions to ${lm.name}` : "Teleport here";
    b.addEventListener("click", () => (dirs ? startDirections(lm) : goTo(lm)));
    const d = document.createElement("button");
    d.type = "button";
    d.className = "dir";
    d.textContent = dirs ? "Teleport" : "Directions";
    d.title = dirs ? `Teleport to ${lm.name}` : `Walking directions to ${lm.name}`;
    d.addEventListener("click", () => (dirs ? goTo(lm) : startDirections(lm)));
    li.append(b, d);
    return li;
  }));
  $("#places-title").textContent = dirs ? "Directions: where to?" : "Places";
  $("#places-actions").hidden = !dirs;
  $("#places").classList.toggle("dirs", dirs);
  $("#dirs-stop").hidden = !Nav.dest;
  refreshPlaceDistances();
}

// Distance and compass direction from you to each place, shown in the Places list.
function refreshPlaceDistances() {
  for (const li of document.querySelectorAll("#places-list li")) {
    const lm = LANDMARKS.find((l) => l.id === li.dataset.id);
    if (!lm) continue;
    const dx = lm.x - player.x, dz = lm.z - player.z, d = Math.hypot(dx, dz);
    li.querySelector(".away").textContent = `${d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1) + " km"} ${Nav.cardinal(dx, dz)}`;
  }
}

// ---------- directions ----------

function startDirections(lm) {
  Nav.set(lm);
  closePanels();
  toast(Nav.found ? `Directions to ${lm.name}: follow the gold markers` : `Directions to ${lm.name} (no walkable route found, heading straight)`);
  let len = 0;
  for (let i = 1; i < Nav.route.length; i++) len += Math.hypot(Nav.route[i].x - Nav.route[i - 1].x, Nav.route[i].z - Nav.route[i - 1].z);
  navCall = "";
  Narrator.say(`Directions to ${lm.name}. About ${Math.round(len / 10) * 10} metres, roughly ${Math.max(1, Math.round(len / 5.5 / 60))} minutes on foot. Follow the gold markers.`, { interrupt: true });
}

let navCall = ""; // the last turn call-out that was spoken, so each is said once

// Guide me: directions to the nearest place you haven't discovered yet (press again to stop).
function guideMe() {
  const pool = DISCOVERABLE.filter((l) => !discovered.has(l.id));
  const list = pool.length ? pool : LANDMARKS;
  const best = list.reduce((a, b) => (Math.hypot(b.x - player.x, b.z - player.z) < Math.hypot(a.x - player.x, a.z - player.z) ? b : a));
  startDirections(best);
}

let navInfo = null;
function updateNavHud(dt) {
  const card = $("#nav");
  const info = mode === "walk" && started ? Nav.update(dt) : null;
  if (info && info.arrived) { toast(`You have arrived at ${info.arrived}`); Narrator.say(`You have arrived at ${info.arrived}.`, { interrupt: true }); navInfo = null; }
  else navInfo = info;
  card.hidden = !navInfo;
  if (!navInfo) return;
  $("#nav-name").textContent = navInfo.name;
  const m = navInfo.remaining;
  $("#nav-dist").textContent = `${m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km"} · about ${Math.max(1, Math.round(navInfo.eta / 60))} min walk`;
  $("#nav-step").textContent = navInfo.text;
  const turn = /^In (\d+) m, turn (.+)$/.exec(navInfo.text); // say each upcoming turn at about 200, 100 and 50 metres
  if (turn) {
    const d = Number(turn[1]), bucket = d <= 60 ? 50 : d <= 120 ? 100 : d <= 220 ? 200 : 0, call = `${bucket}-${turn[2]}`;
    if (bucket && call !== navCall) { navCall = call; Narrator.say(`In ${bucket} metres, turn ${turn[2]}.`, { interrupt: true }); }
  } else navCall = "";
  $("#nav-arrow").style.transform = `rotate(${navInfo.arrow}rad)`;
}

// Draws the route as a blue line with a flag at the destination; `to` converts world coordinates to canvas coordinates.
function drawRoute(g, to, lineW, flagR) {
  const r = Nav.route;
  if (!Nav.dest || r.length < 2) return;
  g.save();
  g.lineJoin = g.lineCap = "round";
  g.strokeStyle = "#ffffff"; g.lineWidth = lineW + 2;
  g.beginPath(); r.forEach((p, i) => { const [x, y] = to(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  g.strokeStyle = Nav.found ? "#1a73e8" : "#d9822b"; g.lineWidth = lineW;
  if (!Nav.found) g.setLineDash([lineW * 2, lineW * 1.5]);
  g.beginPath(); r.forEach((p, i) => { const [x, y] = to(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  const [dx, dy] = to(Nav.dest.stand[0], Nav.dest.stand[1]);
  g.setLineDash([]);
  g.fillStyle = "#ffd24a"; g.strokeStyle = "#2a2118"; g.lineWidth = 2;
  g.beginPath(); g.arc(dx, dy, flagR, 0, Math.PI * 2); g.fill(); g.stroke();
  g.restore();
}

function cycleTime() {
  if (sleepT > 0) return;
  const h = Time.nextPreset();
  sky.setHour(h, true);
  toast(h === 4 ? "You stayed up all night..." : `${phaseName(h)}: ${Time.label()}`);
}

// ---------- maps ----------

const S = 1.3; // base-map pixels per metre
let baseMap;

function buildBaseMap() {
  const w = Math.round((MAP.x1 - MAP.x0) * S), h = Math.round((MAP.z1 - MAP.z0) * S);
  baseMap = document.createElement("canvas");
  baseMap.width = w; baseMap.height = h;
  const g = baseMap.getContext("2d");

  // terrain shading at 1 px per 2 m, then scaled up
  const lw = Math.round((MAP.x1 - MAP.x0) / 2), lh = Math.round((MAP.z1 - MAP.z0) / 2);
  const low = document.createElement("canvas");
  low.width = lw; low.height = lh;
  const lg = low.getContext("2d");
  const img = lg.createImageData(lw, lh);
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const x = MAP.x0 + i * 2, z = MAP.z0 + j * 2;
      const hh = heightAt(x, z);
      const shade = (heightAt(x + 3, z + 3) - hh) * -1.6; // light from the north-west
      const t = Math.min(1, hh / 22);
      const k = (j * lw + i) * 4;
      img.data[k] = Math.max(0, Math.min(255, 226 - 70 * t + shade));
      img.data[k + 1] = Math.max(0, Math.min(255, 212 - 20 * t + shade));
      img.data[k + 2] = Math.max(0, Math.min(255, 176 - 60 * t + shade));
      img.data[k + 3] = 255;
    }
  }
  lg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(low, 0, 0, w, h);

  g.save();
  g.scale(S, S);
  g.translate(-MAP.x0, -MAP.z0);
  const paint = (x0, z0, x1, z1, c) => { g.fillStyle = c; g.fillRect(x0, z0, x1 - x0, z1 - z0); };
  if (city === "rome") {
    paint(-120, -35, 180, 35, "#f0e8d2"); // Forum plaza
    paint(-150, -285, -90 + 60, -195, "#eee5cf"); // Trajan's Forum
    paint(-210, -285, -90, -195, "#eee5cf");
    paint(-100, -4.5, 420, 4.5, "#8a8378"); // Via Sacra
  }
  for (const s of MAP_SHAPES) {
    g.fillStyle = s.c;
    if (s.k === "r") g.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0);
    else { g.beginPath(); g.ellipse(s.cx, s.cz, s.ax, s.az, 0, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

const pinColor = (lm) => (lm.game ? "#d98a1f" : discovered.has(lm.id) ? "#2f6b3a" : "#b3262b");

function drawMiniMap() {
  const c = $("#minimap"), g = c.getContext("2d"), n = c.width, k = n / 340; // 340 m across
  g.clearRect(0, 0, n, n);
  g.save();
  g.beginPath(); g.arc(n / 2, n / 2, n / 2 - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = "#cfc3a3"; g.fillRect(0, 0, n, n);
  g.translate(n / 2, n / 2);
  g.rotate(player.yaw);
  g.scale(k, k);
  g.translate(-player.x, -player.z);
  g.drawImage(baseMap, MAP.x0, MAP.z0, MAP.x1 - MAP.x0, MAP.z1 - MAP.z0);
  drawRoute(g, (x, z) => [x, z], 5 / k, 8 / k);
  for (const lm of LANDMARKS) {
    g.fillStyle = pinColor(lm);
    g.beginPath(); g.arc(lm.x, lm.z, 7 / k, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 1.5 / k; g.stroke();
  }
  for (const gd of Guards.positions()) {   // the city guards: small red dots (they flash when they are after you)
    g.fillStyle = gd.chase && Math.floor(performance.now() / 250) % 2 ? "#ffd36b" : "#c0262b"; g.strokeStyle = "#fff"; g.lineWidth = 1.2 / k;
    g.beginPath(); g.arc(gd.x, gd.z, 4.5 / k, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.restore();
  // player arrow (always points up)
  g.fillStyle = "#1a5fd0"; g.strokeStyle = "#fff"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(n / 2, n / 2 - 11); g.lineTo(n / 2 + 8, n / 2 + 9); g.lineTo(n / 2, n / 2 + 4); g.lineTo(n / 2 - 8, n / 2 + 9); g.closePath();
  g.fill(); g.stroke();
}

function bigMapScale(c) { return Math.min(c.width / (MAP.x1 - MAP.x0), c.height / (MAP.z1 - MAP.z0)); }

function drawBigMap() {
  const c = $("#bigmap-canvas");
  const size = Math.floor(Math.min(innerWidth - 40, innerHeight - 110));
  c.width = size * (MAP.x1 - MAP.x0) / (MAP.z1 - MAP.z0); c.height = size;
  const g = c.getContext("2d"), s = bigMapScale(c);
  g.drawImage(baseMap, 0, 0, c.width, c.height);
  drawRoute(g, (x, z) => [(x - MAP.x0) * s, (z - MAP.z0) * s], 5, 9);
  g.font = "600 12px system-ui, sans-serif";
  g.textBaseline = "middle";
  for (const lm of LANDMARKS) {
    const x = (lm.x - MAP.x0) * s, y = (lm.z - MAP.z0) * s;
    g.fillStyle = pinColor(lm);
    g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
    g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,.9)"; g.strokeText(lm.name, x + 10, y);
    g.fillStyle = "#2a2118"; g.fillText(lm.name, x + 10, y);
  }
  for (const gd of Guards.positions()) {
    g.fillStyle = "#c0262b"; g.strokeStyle = "#fff"; g.lineWidth = 1.5;
    g.beginPath(); g.arc((gd.x - MAP.x0) * s, (gd.z - MAP.z0) * s, 4, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const px = (player.x - MAP.x0) * s, py = (player.z - MAP.z0) * s;
  g.save();
  g.translate(px, py); g.rotate(-player.yaw);
  g.fillStyle = "#1a5fd0"; g.strokeStyle = "#fff"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

function onBigMapClick(e) {
  const c = e.currentTarget, r = c.getBoundingClientRect(), s = bigMapScale(c);
  const x = MAP.x0 + ((e.clientX - r.left) * (c.width / r.width)) / s;
  const z = MAP.z0 + ((e.clientY - r.top) * (c.height / r.height)) / s;
  // clicking a landmark pin gives walking directions to it; clicking anywhere else drops you there
  const pin = LANDMARKS.find((lm) => Math.hypot((lm.x - x) * s * (r.width / c.width), (lm.z - z) * s * (r.height / c.height)) < 12);
  if (pin) { startDirections(pin); return; }
  placeAt(x, z);
  closePanels();
}

// ---------- HUD ----------

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function updateCompass() {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const bearing = ((Math.atan2(fx, -fz) * 180) / Math.PI + 360) % 360;
  $("#compass").textContent = `${DIRS[Math.round(bearing / 45) % 8]} ${Math.round(bearing)}°`;
}

// ---------- loop ----------

let last = performance.now(), clock = 0, prevMode = "walk", errorCount = 0, placesTimer = 0;


// ---------- dying ----------
// If your health reaches zero (a bad crash, being run over, scraping along walls) you die: you black out, are carried
// home and have to stay there for a whole day while you recover. Games leave you wounded instead.

let deathT = 0, deathFrom = null, lowWarnT = 0, deathPending = null; // deathPending: why you are about to die (set when you are killed in the arena)

function startDeath() {
  if (deathT > 0) return;
  if (mode === "drive") Car.exit(true);
  Vitals.stopRest(); Nav.clear();
  sleepT = 0; slept = false; $("#sleep").classList.remove("on");   // no "Sleeping..." screen on top of the death screen
  deathT = 0.001; deathFrom = { hour: Time.hour, day: Time.day, moved: false };
  Sfx.play("oof");
  const d = $("#death");
  d.querySelector("h2").textContent = "You died";
  d.querySelector("p").textContent = `${deathPending || ""} You are carried home, and you must stay there for a day to recover.`.trim();
  const cause = deathPending; deathPending = null;
  d.classList.remove("lapse"); d.classList.add("on");
  Narrator.say(`You have died. ${cause || ""} You are carried home, and you must stay there for a day to recover.`, { interrupt: true });
}

function updateDeath(dt) {
  if (deathT === 0) {
    if (started && Vitals.hp <= 0.01 && !deathPending) deathPending = Vitals.hunger <= 0.01 ? "You starved to death." : "You were killed."; // remembered, so healing while a result screen is open cannot save you
    if (!started || sleepT > 0 || !(mode === "walk" || mode === "drive") || panelOpen) return; // (wait until the result screen is closed)
    if (deathPending) startDeath();
    else if (Vitals.hp < 14) { lowWarnT -= dt; if (lowWarnT <= 0) { lowWarnT = 25; toast("You are badly hurt! Another crash could kill you. Press Z to rest"); } }
    return;
  }
  deathT += dt;
  const BLACK = 2.2, LAPSE = 7;
  if (deathT >= 1.4 && !deathFrom.moved) {
    deathFrom.moved = true;
    if (city === "delhi") { const h = Delhi.homeSpot(); placeAt(h.x, h.z, 0); } else if (city === "cancun") { const h = Cancun.homeSpot(); placeAt(h.x, h.z, 0); } else placeAt(Home.X, Home.Z - 2.5, 0);
    player.pitch = -0.02;
  }
  if (deathT > BLACK) { // the day passes: the sky runs through a whole day and night
    const f = Math.min(1, (deathT - BLACK) / LAPSE), total = deathFrom.hour + 24 * f;
    Time.setClock(total % 24, deathFrom.day + Math.floor(total / 24));
    sky.setHour(Time.hour, true);
    const d = $("#death");
    d.classList.add("lapse");
    d.querySelector("h2").textContent = "A day at home";
    d.querySelector("p").textContent = `${Time.label()}: you rest while the day goes by...`;
  }
  if (deathT >= BLACK + LAPSE + 0.6) {
    deathT = 0;
    Vitals.hp = 55; Vitals.horses = Vitals.horses + 25; Vitals.hunger = Math.max(Vitals.hunger, 50); // the doctor feeds you a little
    const fee = Math.min(Vitals.coins, 25); Vitals.coins -= fee;
    const rent = Market.rent(); if (rent) Vitals.coins += rent;
    $("#death").classList.remove("on", "lapse");
    toast(`Day ${Time.day}: you are on your feet again. The doctor charged ${fee} denarii${rent ? `, and your tenants paid ${rent}` : ""}`);
    Narrator.say(`Day ${Time.day}. You are on your feet again, but still weak. Be careful out there.`, { interrupt: true });
    Vitals.save();
  }
}

// ---------- days, nights and your house ----------

let sleepT = 0, slept = false, sleepCollapse = false, lastStage = 0, wasHome = false, lastClock = "";

function startSleep(collapse) {
  if (sleepT > 0 || deathT > 0) return;           // not while you are dying: the two black screens would pile up
  sleepT = 0.001; slept = false; sleepCollapse = collapse;
  Vitals.stopRest(); Nav.clear && Nav.clear();
  toast(collapse ? "You are so tired that you collapse..." : "You lie down in your bed...");
}

function wakeUp() {
  Time.wake();
  sky.setHour(Time.hour, true);
  Vitals.horses = Vitals.horses + 25;
  if (sleepCollapse) {
    const lost = Math.min(Vitals.coins, 15);
    Vitals.coins = Vitals.coins - lost;
    Vitals.hp = 60;
    if (city === "delhi") { const h = Delhi.homeSpot(); placeAt(h.x, h.z, 0); } else if (city === "cancun") { const h = Cancun.homeSpot(); placeAt(h.x, h.z, 0); } else placeAt(Home.X, Home.Z - 2.5, 0); // you are carried home
    toast(`Day ${Time.day}: you woke in your bed. You collapsed in the street and a thief took ${lost} denarii`);
    Narrator.say(`Day ${Time.day}. You collapsed from tiredness, and were carried home. Next time, sleep in your bed at night.`, { interrupt: true });
  } else {
    Vitals.hp = 100;
    const rent = Market.rent();
    if (rent) Vitals.coins += rent;
    toast(`Day ${Time.day}: you wake at dawn, fully rested${rent ? `. Your tenants paid you ${rent} denarii` : ""}`);
    Narrator.say(`Day ${Time.day}. You wake at dawn, fully rested.`, { interrupt: true });
  }
  Sfx.play("discover");
  Vitals.save();
}

// Runs every frame: the clock, the sky, night warnings, the house and the sleep fade.
function updateTime(dt) {
  const sleeping = sleepT > 0;
  if (started && !sleeping && deathT === 0) Time.advance(dt);
  sky.setHour(Time.hour);
  Home.update(sky.night);
  Modern.update(sky.night, dt, player.x, player.z);
  if (started && mode === "walk" && !creatorOpen && !panelOpen && crashCd <= 0) { const h = hitsHere(player.x, player.z); if (h) carHit(h); }

  const label = Time.label() + (Time.late && !sleeping ? " · sleepy: sleep before 4:00" : "");
  if (label !== lastClock) { lastClock = label; $("#clock").textContent = label; }

  if (started && mode === "walk" && !sleeping) {
    const stage = Time.late ? 2 : Time.bedtime ? 1 : 0;
    if (stage !== lastStage) {
      lastStage = stage;
      if (stage === 1) toast("Night is falling. Head home to sleep (press G, choose Your House)");
      else if (stage === 2) toast("It is very late! Go home and sleep, or you will collapse");
    }
    const inHome = homeHere(player.x, player.z);
    if (inHome !== wasHome) {
      wasHome = inHome;
      if (inHome) toast(Time.bedtime ? "Your house. Press Z to sleep until morning" : "Your house. You can sleep here after dark (Z rests)");
    }
    if (Time.exhausted) startSleep(true);
  }
  const hint = $("#sleep-hint");
  const showHint = started && mode === "walk" && !sleeping && wasHome && Time.bedtime;
  if (hint.classList.contains("show") !== showHint) hint.classList.toggle("show", showHint);

  // the sleep fade: dark, wake up, light again
  if (sleeping) {
    sleepT += dt;
    $("#sleep").classList.toggle("on", sleepT < 2.4 && deathT === 0);
    if (sleepT >= 1.2 && !slept) { slept = true; wakeUp(); }
    if (sleepT >= 3.6) { sleepT = 0; slept = false; }
  }
}

function tick(dt) {
  updateTime(dt);
  updateDeath(dt);
  Weather.update(dt);
  Tax.update(dt); Speech.update(dt); Stalls.update(dt); Jail.update(dt); Guards.update(dt); Police.update(dt); Disease.update(dt); Jobs.update(dt); Garage.update(dt); Robbery.update(dt); Festival.update(dt);
  // condition: passive recovery, resting, and the HUD
  Vitals.update(dt, { mode, regenMul: Disease.regenMul, atStables: inCircusArea(player.x, player.z), restBoost: city === "delhi" ? (Delhi.inPlot(player.x, player.z) ? Market.houseRest() : 1) : city === "cancun" ? (Cancun.inHome(player.x, player.z) ? Market.houseRest() : 1) : Home.restBoost(player.x, player.z) }) === "refreshed" && toast("You feel refreshed");
  if (mode !== "walk") Vitals.stopRest();
  if (Vitals.resting && (keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD") || keys.has("ArrowUp") || keys.has("ArrowDown") || keys.has("ArrowLeft") || keys.has("ArrowRight"))) Vitals.stopRest();
  updateVitalsHud();
  updateNavHud(dt);
  Music.update(dt, mode === "walk" || mode === "drive" || mode === "watch");
  Sfx.update(dt, { mode, engine: Car.speed01(), driving: Car.driving && Car.motor, night: sky.night, walking: mode === "walk" ? Math.hypot(player.vx, player.vz) : 0, running: keys.has("ShiftLeft") || keys.has("ShiftRight") || (mode === "walk" && walkLevel >= 7) });
  placesTimer += dt;
  if (placesTimer > 0.6 && $("#places").classList.contains("show")) { placesTimer = 0; refreshPlaceDistances(); }
  if (mode === "fight") Fight.update(dt, keys);
  else if (mode === "race") Race.update(dt, keys);
  else if (mode === "naval") Naval.update(dt, keys);
  else if (mode === "online") Online.update(dt, keys);
  else if (mode === "drive") Car.update(dt, keys);
  else if (mode === "dgame") DGames.update(dt, keys);
  else if (mode === "watch") { if (!panelOpen) updatePlayer(dt); Watch.update(dt); }
  else if (started && !panelOpen && deathT === 0) {
    if (Vitals.resting) { player.vx = player.vz = 0; player.y += (player.feet + 0.9 - player.y) * Math.min(1, dt * 4); } // sitting down
    else updatePlayer(dt);
  } else if (!started) player.yaw += dt * 0.05; // slow pan behind the title screen

  if (mode !== prevMode) { if (mode === "walk") startLockUntil = performance.now() + 700; prevMode = mode; }
  document.body.classList.toggle("playing", mode !== "walk");
  document.body.classList.toggle("dueling", mode === "online");
  if (mode === "race") Race.camera(camera, dt);
  else if (mode === "naval") Naval.camera(camera, dt);
  else if (mode === "drive") Car.camera(camera, dt);
  else if (mode === "dgame" && DGames.camera(camera, dt)) { /* the game's own camera */ }
  else if (mode === "watch" && Watch.camera(camera, dt)) { /* cinematic camera */ }
  else {
    if ((mode === "walk" && (viewId() !== "first" || creatorOpen)) || mode === "online") chaseCamera();
    else {
      camera.position.set(player.x, player.y + (city === "cancun" ? Cancun.camDrop() : 0), player.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
    }
    if (player.shake > 0) { // shake after a crash
      camera.position.x += (Math.random() - 0.5) * player.shake * 0.25;
      camera.position.y += (Math.random() - 0.5) * player.shake * 0.2;
      camera.position.z += (Math.random() - 0.5) * player.shake * 0.25;
      camera.rotation.z = (Math.random() - 0.5) * player.shake * 0.05;
      player.shake = Math.max(0, player.shake - dt * 2.4);
    }
    if (mode === "walk" || mode === "watch") { const f = $("#flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6); }
  }
  sky.follow(camera.position);
  updateCitizens(dt, clock);
  Online.walkTick(dt); Online.peersUpdate(dt);
  if (city === "delhi") Delhi.update(dt, player.x, player.z);
  if (city === "cancun") Cancun.update(dt, player.x, player.z);
  DGames.tickRun(dt);
  updateAvatar(dt);
  Pets.update(dt);
  Cage.update(dt);
  Doors.update(dt);
  Crowd.update(dt, clock);
  renderer.render(scene, camera);

  if (started) { checkLandmarks(clock); updateCompass(); drawMiniMap(); updatePrompt(); if (bigMapOpen()) drawBigMap(); }
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; clock += dt;
  try {
    tick(dt);
  } catch (err) {
    // One failing frame must not freeze the whole game: report it and drop back to walking.
    console.error(err);
    if (++errorCount <= 3) { toast("Something went wrong, returning to walking mode"); try { leaveMode(); } catch (e2) { mode = "walk"; } }
  }
  requestAnimationFrame(loop);
}

init();
window.__rome = { player, placeAt, goTo, travel, LANDMARKS, get discovered() { return discovered; } };
