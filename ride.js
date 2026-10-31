"use strict";
// Riding as a passenger. Walk up to another player's car, plane, boat, bus ... and press X: the game server seats you (it says how many seats a vehicle has) and
// you ride along, looking out of the side window. You cannot drive: you only look (move the mouse to look about, X or Esc to get out when it is standing still).
// Nobody else sees you (you are inside), and you are put out beside the vehicle if the driver gets out or leaves.
// The vehicle comes from the other players list in online.js: the driver is a "peer" there, drawn and smoothed like any other player, and the camera sits in it.
// Depends on online.js (Online.peerList, Online.navalSend), game.js (mode, player, camera, toast) and car.js (Car.MODELS).

const Ride = (() => {
  let active = false, driverId = null, driverName = "", seat = 0, look = -1.1, prevYaw = 0, hudEl = null, asked = 0;
  const wrap = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  const SEAT_HEIGHT = { scooter: 0.45, rickshaw: 0.55, oxcart: 1.0, elephant: 4.2 };        // the same heights as online.js uses for a rider
  const driver = () => (driverId === null ? null : Online.peerList().find((p) => p.id === driverId) || null);

  // the driver nearest to you that you could ride with (they must be in a vehicle that is standing, close by)
  function nearest() {
    if (!started || mode !== "walk" || panelOpen || !Online.connected) return null;
    let best = null, bd = 7;
    for (const p of Online.peerList()) {
      if (!p.veh || p.x === null || (p.spd || 0) > 5 || (p.alt || 0) > 3) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  const promptText = () => { if (typeof Car !== "undefined" && Car.nearby()) return ""; const p = nearest(); return p ? `Press X to ride with ${p.name || "them"}` : ""; };

  // X on foot, next to someone's vehicle: ask the server for a seat
  function tryBoard() {
    const p = nearest();
    if (!p || performance.now() - asked < 600) return false;
    asked = performance.now();
    Online.navalSend({ t: "board", id: p.id });
    return true;
  }

  function on(m) {                                         // the server gave us a seat
    const p = Online.peerList().find((q) => q.id === m.id);
    if (!p) return;
    active = true; driverId = m.id; driverName = m.name || (p && p.name) || "the driver"; seat = m.seat || 0;
    look = seat % 2 === 0 ? -1.1 : 1.1;                    // the first passenger looks out of the right side, the next out of the left
    prevYaw = player.yaw = wrap(p.yaw + look); player.pitch = -0.05;
    mode = "ride"; player.vx = player.vz = 0;
    if (document.pointerLockElement) { /* keep the mouse look */ }
    toast(`You are riding with ${driverName}. Move the mouse to look about. X to get out when it has stopped.`);
  }

  function off(m) {                                        // we are out (our own request, or the driver got out or left)
    if (!active) return;
    active = false; driverId = null;
    if (mode === "ride") mode = "walk";
    const x = Number.isFinite(m.x) ? m.x : player.x, z = Number.isFinite(m.z) ? m.z : player.z, yaw = Number.isFinite(m.yaw) ? m.yaw : player.yaw;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);                                              // the right-hand side of the vehicle
    hide();
    placeAt(x + rx * 3.2, z + rz * 3.2, yaw);
    player.vx = player.vz = 0;
    toast(m.why ? m.why : "You got out.");
  }

  const leave = () => { if (active) Online.navalSend({ t: "unboard" }); };
  const lost = () => { if (active) off({ why: "The connection was lost." }); };

  // every frame while riding: go where the driver goes, and look about with the mouse
  function update(dt) {
    const p = driver();
    if (!p || p.x === null) return;                        // (the server will tell us if the driver has gone)
    let dyaw = wrap(player.yaw - prevYaw);                 // the mouse turned our head
    look = Math.max(-2.4, Math.min(2.4, look + dyaw));
    player.yaw = wrap(p.yaw + look); prevYaw = player.yaw;
    player.x = p.x; player.z = p.z; player.feet = groundAt(p.x, p.z) + (p.alt || 0); player.vx = player.vz = 0;
    if (!hudEl) hudEl = document.getElementById("ride-hud");
    if (hudEl) { hudEl.hidden = false; hudEl.textContent = `Riding with ${driverName} · mouse: look about · X: get out`; }
  }

  // the camera sits in the passenger seat of the driver's vehicle
  const eyeV = new THREE.Vector3();
  function camera(cam) {
    const p = driver();
    if (!p || !p.vm) return;
    const M = (typeof Car !== "undefined" && Car.MODELS[p.veh]) || {}, e = M.eye || [0, (SEAT_HEIGHT[p.veh] !== undefined ? SEAT_HEIGHT[p.veh] + 1.3 : 1.35) + (M.camH ? 0.3 : 0), -0.1];
    const row = Math.floor((seat + 1) / 2);
    eyeV.set((seat % 2 === 0 ? 0.8 : -0.8), e[1], e[2] + row * 1.5);
    p.vm.updateMatrixWorld(true);
    cam.position.copy(p.vm.localToWorld(eyeV));
    cam.rotation.order = "YXZ";
    cam.rotation.set(player.pitch, player.yaw, (p.roll || 0) * 0.6);
  }

  function hide() { if (!hudEl) hudEl = document.getElementById("ride-hud"); if (hudEl) hudEl.hidden = true; }
  return { promptText, tryBoard, on, off, leave, lost, update, camera, hide, get active() { return active; } };
})();
