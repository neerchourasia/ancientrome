"use strict";
// Player controls, HUD, minimap and landmark discovery.

const $ = (s) => document.querySelector(s);
const EYE = 1.7;
const MAP = { x0: -800, x1: 700, z0: -700, z1: 850 };

const player = { x: 165, z: 6, yaw: Math.PI / 2, pitch: -0.02, feet: 0, y: EYE, vx: 0, vz: 0, bob: 0 };
const keys = new Set();
let started = false, dragging = false, locked = false, panelOpen = false;
let mode = "walk"; // "walk", "fight" (Colosseum), "race" (Circus Maximus) or "watch" (spectating)
let renderer, camera, scene, sky, discovered = new Set();

try { discovered = new Set(JSON.parse(localStorage.getItem("rome-discovered") || "[]")); } catch (e) { /* storage unavailable */ }

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
  buildGround(scene);
  buildLandmarks(scene);
  buildInsulae(scene);
  buildTrees(scene);
  buildCitizens(scene);
  Crowd.build(scene);
  Fight.init(scene, camera);
  Race.init(scene);
  Watch.init(scene);
  Naval.init(scene);
  Show.init(scene);
  Nav.init(scene);
  scene.traverse((o) => { if (o.isInstancedMesh) o.frustumCulled = false; });

  buildBaseMap();
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
  else closePanels();
}

// Hotkeys that start or stop things are ignored for a moment after leaving, so a held key can't restart them.
let startLockUntil = 0;
const canStart = () => performance.now() > startLockUntil && !panelOpen;

function wireInput(canvas) {
  addEventListener("keydown", (e) => {
    const k = keyCode(e);
    if (k === "Escape") { leaveMode(); return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(k)) e.preventDefault();
    if (!started) return;
    keys.add(k);
    if (Vitals.resting && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(k)) Vitals.stopRest(); // moving stands you up
    if (e.repeat) return; // one-shot actions fire once per key press, never on auto-repeat

    if (k === "KeyT") cycleTime();
    if (k === "KeyO") toggleSound();
    if (k === "KeyZ") toggleRest();
    if (k === "KeyG" && (mode === "walk" || mode === "watch")) toggleDirections();
    if (mode === "walk" || mode === "watch") {
      if (k === "KeyM") toggleBigMap();
      else if (k === "KeyP") togglePlaces();
      else if (k === "KeyH") toggleControls();
    }
    if (mode === "watch") {
      if (k === "KeyC") Watch.toggleChase();
      else if (k === "KeyV") Watch.stop();
      else if (k === "KeyN") Watch.nextAct();
      else { const m = /^(?:Digit|Key|Numpad)([1-5])$/.exec(k); if (m) Watch.setAct(Number(m[1]) - 1); }
    } else if (mode === "walk" && canStart()) {
      if (k === "KeyF" && inArena(player.x, player.z)) Fight.start();
      else if (k === "KeyL" && inArena(player.x, player.z)) Fight.start({ lion: true });
      else if (k === "KeyU" && inArena(player.x, player.z)) Fight.start({ hunt: true });
      else if (k === "KeyN" && inArena(player.x, player.z)) Naval.start();
      else if (k === "KeyR" && inCircusTrack(player.x, player.z)) Race.start();
      else if (k === "KeyV" && (inColosseum(player.x, player.z) || inCircusArea(player.x, player.z))) Watch.start(inColosseum(player.x, player.z) ? "duel" : "race");
    } else if (mode === "naval") {
      if (k === "Space" || k === "KeyQ" || k === "KeyE") Naval.fire(k);
    } else if (mode === "race") {
      if (k === "Space") Race.whip();
      else if (k === "KeyQ") Race.hop(-1);
      else if (k === "KeyE") Race.hop(1);
      else if (k === "KeyX") Race.toggleCruise();
      else if (k === "KeyC") Race.cycleCamera();
      else { const m = /^(?:Digit|Key|Numpad)([1-9])$/.exec(k); if (m) Race.setPace(Number(m[1])); }
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
    if (started && mode === "walk" && !panelOpen) dragging = true;
  });
  addEventListener("mouseup", (e) => { dragging = false; if (e.button === 2) Fight.mouseBlock = false; if (e.button === 0 && mode === "fight") Fight.release(); });
  $("#prompt").addEventListener("click", () => {
    if ($("#prompt").dataset.kind === "rest") { toggleRest(); return; }
    if (mode !== "walk" || !canStart()) return;
    if (inArena(player.x, player.z)) Fight.start();
    else if (inCircusTrack(player.x, player.z)) Race.start();
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
    $("#help").classList.add("show");
    setTimeout(() => $("#help").classList.remove("show"), 9000);
  });
  $("#btn-map").addEventListener("click", toggleBigMap);
  $("#btn-places").addEventListener("click", togglePlaces);
  $("#btn-dirs").addEventListener("click", toggleDirections);
  $("#btn-sound").addEventListener("click", toggleSound);
  refreshSoundButton();
  $("#dirs-nearest").addEventListener("click", guideMe);
  $("#dirs-stop").addEventListener("click", () => { Nav.clear(); toast("Directions stopped"); closePanels(); });
  $("#btn-time").addEventListener("click", cycleTime);
  $("#btn-controls").addEventListener("click", toggleControls);
  $("#controls-close").addEventListener("click", closePanels);
  $("#controls").addEventListener("click", (e) => { if (e.target.id === "controls") closePanels(); });
  $("#places-close").addEventListener("click", closePanels);
  $("#bigmap-close").addEventListener("click", closePanels);
  $("#bigmap-canvas").addEventListener("click", onBigMapClick);
  $("#minimap").addEventListener("click", toggleBigMap);
}

// ---------- movement ----------

let crashCd = 0;

// What did you run into? Uses the obstacle that blockedAt() last reported.
function describeObstacle(tx, tz) {
  lastBlock = null;
  blockedAt(tx, tz, groundAt(player.x, player.z));
  const b = lastBlock;
  if (!b) return "a wall";
  if (b.t === 2) return "the huge stone wall";
  if (b.y1 - b.y0 > 7) return "a building";
  if (b.t === 1) return "a column";
  return "a wall";
}

function crash(impact, dx, dz, tx, tz) {
  crashCd = 0.8;
  const hard = impact > 9; // running into it
  const what = describeObstacle(tx, tz);
  const dmg = Math.min(8, 1 + impact * 0.35);
  Vitals.hp = Math.max(5, Vitals.hp - dmg);
  player.stun = hard ? 0.7 : 0.4;
  player.shake = hard ? 0.9 : 0.5;
  const len = Math.hypot(dx, dz) || 1, kx = (-dx / len) * 0.8, kz = (-dz / len) * 0.8; // knocked back a step
  if (canMove(player.x, player.z, player.x + kx, player.z + kz)) { player.x += kx; player.z += kz; }
  player.vx = player.vz = 0;
  $("#flash").style.opacity = hard ? 0.5 : 0.28;
  Sfx.play("bump");
  toast(`Ouch! You ran into ${what}${hard ? " at full speed" : ""} (-${Math.round(dmg)} health)`);
}

// Running into a citizen knocks them over.
function bumpCitizens(pace) {
  if (pace < 2.5) return;
  for (const c of CITIZENS.list) {
    if ((c.down || 0) > 0) continue;
    const d = Math.hypot(c.x - player.x, c.z - player.z);
    if (d > 0.95) continue;
    const hard = pace > 8;
    c.down = hard ? 2.4 : 1.4;
    const push = 1.3 / (d || 1);
    const nx = c.x + (c.x - player.x) * push, nz = c.z + (c.z - player.z) * push;
    if (canMove(c.x, c.z, nx, nz)) { c.x = nx; c.z = nz; }
    player.vx *= 0.35; player.vz *= 0.35;
    Sfx.play("oof");
    if (crashCd <= 0) {
      crashCd = 0.5;
      player.shake = Math.max(player.shake || 0, hard ? 0.6 : 0.3);
      if (hard) Vitals.hp = Math.max(5, Vitals.hp - 1.5);
      toast(hard ? "Crash! You knocked over a citizen" : "Oops! You bumped into a citizen");
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

  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 13 : 5.5;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx = -fz, rz = fx;
  let tx = fx * fwd + rx * side, tz = fz * fwd + rz * side;
  const len = Math.hypot(tx, tz);
  if (len > 0) { tx = (tx / len) * speed; tz = (tz / len) * speed; }
  if (player.stun > 0) { player.stun -= dt; tx = tz = 0; } // dazed after a crash
  crashCd = Math.max(0, crashCd - dt);
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
    // speed lost to an obstacle: a hard hit is a crash, a gentle slide along a wall is not
    const lost = (Math.hypot(dx, dz) - Math.hypot(mx, mz)) / dt;
    if (lost > 4 && crashCd <= 0) crash(lost, dx, dz, player.x + dx, player.z + dz);
  }
  bumpCitizens(pace);
  const moving = Math.hypot(player.vx, player.vz);
  player.bob += moving * dt * 1.6;

  const ground = groundAt(player.x, player.z);
  player.feet += (ground - player.feet) * Math.min(1, dt * 14);
  player.y = player.feet + EYE + Math.sin(player.bob) * Math.min(0.045, moving * 0.006);
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
  const [sx, sz] = lm.stand;
  placeAt(sx, sz, yawToward(sx, sz, lm.x, lm.z));
  player.pitch = -0.02;
  closePanels();
}

// ---------- discovery & info card ----------

let currentLm = null, lastCheck = 0;

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
    if (best && !discovered.has(best.id)) {
      discovered.add(best.id);
      try { localStorage.setItem("rome-discovered", JSON.stringify([...discovered])); } catch (e) { /* ignore */ }
      updateProgress();
      toast(discovered.size === LANDMARKS.length ? "You have discovered all of Rome. Ave!" : `Discovered: ${best.name}`);
      Sfx.play("discover");
    }
  }
}

function showCard(lm) {
  const card = $("#card");
  if (!lm) { card.classList.remove("show"); return; }
  $("#card-name").textContent = lm.name;
  $("#card-sub").textContent = lm.sub;
  $("#card-text").textContent = lm.text;
  $("#card-fact").textContent = lm.fact;
  card.classList.add("show");
}

function updateProgress() {
  $("#count").textContent = `${discovered.size} / ${LANDMARKS.length}`;
  $("#bar-fill").style.width = `${(discovered.size / LANDMARKS.length) * 100}%`;
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
  $("#bigmap").classList.remove("show");
  $("#places").classList.remove("show");
  $("#controls").classList.remove("show");
  $("#result").classList.remove("show");
  panelOpen = false;
}
function openPanel(id) {
  if (mode === "fight" || mode === "race" || mode === "naval") return;
  closePanels();
  $(id).classList.add("show");
  panelOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function toggleBigMap() { if (bigMapOpen()) closePanels(); else { openPanel("#bigmap"); drawBigMap(); } }
function openPlaces(m) { placesMode = m; buildPlacesList(); openPanel("#places"); }
function togglePlaces() { if ($("#places").classList.contains("show") && placesMode === "go") closePanels(); else openPlaces("go"); }
function refreshSoundButton() { $("#btn-sound").firstChild.textContent = Sfx.on ? "Sound on " : "Sound off "; }
function toggleSound() { Sfx.init(); Sfx.toggle(); refreshSoundButton(); toast(Sfx.on ? "Sound on" : "Sound off"); }

function toggleDirections() { if ($("#places").classList.contains("show") && placesMode === "dirs") closePanels(); else openPlaces("dirs"); }
function toggleControls() { if ($("#controls").classList.contains("show")) closePanels(); else openPanel("#controls"); }

// End-of-game screen shared by the fight and the race.
function showResult(title, text, buttons) {
  $("#result-title").textContent = title;
  $("#result-text").textContent = text;
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
    else if (inArena(player.x, player.z)) text = Vitals.canFight() ? "F: gladiators · U: animal hunt · L: lion · N: naval battle · V: watch the games" : "Too wounded to fight. Press Z to rest and heal · V: watch the games";
    else if (inCircusTrack(player.x, player.z)) text = !Vitals.canRace() ? "The horses need rest. Press Z to rest at the stables · V: watch a race" : `R: race a chariot (${Vitals.RACE_ENTRY} denarii) · V: watch a race`;
    else if (inColosseum(player.x, player.z)) text = "Press V to watch the games";
    else if (inCircusStands(player.x, player.z)) text = "Press V to watch a chariot race";
    if (!text && Vitals.needsRest(stables)) { text = "Press Z to rest and heal"; p.dataset.kind = "rest"; }
    else if (text.includes("Press Z")) p.dataset.kind = "rest";
  }
  if (p.dataset.t !== text) { p.dataset.t = text; p.textContent = text; p.classList.toggle("show", !!text); }
}

function toggleRest() {
  if (mode !== "walk" || panelOpen) return;
  if (Vitals.resting) { Vitals.stopRest(); return; }
  const stables = inCircusArea(player.x, player.z);
  if (!Vitals.needsRest(stables)) { toast("You are already in good shape"); return; }
  Vitals.startRest();
  toast(stables ? "Resting at the stables: you and the horses recover" : "Resting: you recover. The horses only recover quickly at the Circus stables");
}

let lastCoins = Vitals.coins;
function updateVitalsHud() {
  $("#v-hp").style.width = `${Vitals.hp}%`;
  $("#v-hp").style.background = Vitals.hp < Vitals.MIN_FIGHT_HP ? "#c0392b" : Vitals.hp < 65 ? "#e2b955" : "#3aa557";
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
}

// Guide me: directions to the nearest place you haven't discovered yet (press again to stop).
function guideMe() {
  const pool = LANDMARKS.filter((l) => !discovered.has(l.id));
  const list = pool.length ? pool : LANDMARKS;
  const best = list.reduce((a, b) => (Math.hypot(b.x - player.x, b.z - player.z) < Math.hypot(a.x - player.x, a.z - player.z) ? b : a));
  startDirections(best);
}

let navInfo = null;
function updateNavHud(dt) {
  const card = $("#nav");
  const info = mode === "walk" && started ? Nav.update(dt) : null;
  if (info && info.arrived) { toast(`You have arrived at ${info.arrived}`); navInfo = null; }
  else navInfo = info;
  card.hidden = !navInfo;
  if (!navInfo) return;
  $("#nav-name").textContent = navInfo.name;
  const m = navInfo.remaining;
  $("#nav-dist").textContent = `${m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1) + " km"} · about ${Math.max(1, Math.round(navInfo.eta / 60))} min walk`;
  $("#nav-step").textContent = navInfo.text;
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
  const i = (sky.index + 1) % TIMES.length;
  sky.apply(i);
  toast(TIMES[i].name);
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
  paint(-120, -35, 180, 35, "#f0e8d2"); // Forum plaza
  paint(-150, -285, -90 + 60, -195, "#eee5cf"); // Trajan's Forum
  paint(-210, -285, -90, -195, "#eee5cf");
  paint(-100, -4.5, 420, 4.5, "#8a8378"); // Via Sacra
  for (const s of MAP_SHAPES) {
    g.fillStyle = s.c;
    if (s.k === "r") g.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0);
    else { g.beginPath(); g.ellipse(s.cx, s.cz, s.ax, s.az, 0, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

const pinColor = (lm) => (discovered.has(lm.id) ? "#2f6b3a" : "#b3262b");

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

function tick(dt) {
  // condition: passive recovery, resting, and the HUD
  Vitals.update(dt, { mode, atStables: inCircusArea(player.x, player.z) }) === "refreshed" && toast("You feel refreshed");
  if (mode !== "walk") Vitals.stopRest();
  if (Vitals.resting && (keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD") || keys.has("ArrowUp") || keys.has("ArrowDown") || keys.has("ArrowLeft") || keys.has("ArrowRight"))) Vitals.stopRest();
  updateVitalsHud();
  updateNavHud(dt);
  Sfx.update(dt, { mode, walking: mode === "walk" ? Math.hypot(player.vx, player.vz) : 0, running: keys.has("ShiftLeft") || keys.has("ShiftRight") });
  placesTimer += dt;
  if (placesTimer > 0.6 && $("#places").classList.contains("show")) { placesTimer = 0; refreshPlaceDistances(); }
  if (mode === "fight") Fight.update(dt, keys);
  else if (mode === "race") Race.update(dt, keys);
  else if (mode === "naval") Naval.update(dt, keys);
  else if (mode === "watch") { if (!panelOpen) updatePlayer(dt); Watch.update(dt); }
  else if (started && !panelOpen) {
    if (Vitals.resting) { player.vx = player.vz = 0; player.y += (player.feet + 0.9 - player.y) * Math.min(1, dt * 4); } // sitting down
    else updatePlayer(dt);
  } else if (!started) player.yaw += dt * 0.05; // slow pan behind the title screen

  if (mode !== prevMode) { if (mode === "walk") startLockUntil = performance.now() + 700; prevMode = mode; }
  document.body.classList.toggle("playing", mode !== "walk");
  if (mode === "race") Race.camera(camera, dt);
  else if (mode === "naval") Naval.camera(camera, dt);
  else if (mode === "watch" && Watch.camera(camera, dt)) { /* cinematic camera */ }
  else {
    camera.position.set(player.x, player.y, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
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
window.__rome = { player, placeAt, goTo, LANDMARKS, get discovered() { return discovered; } };
