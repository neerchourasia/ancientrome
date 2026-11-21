"use strict";
// NERCAR space: a wide open field of grass with a few things to fly round, for flying the NERCAR. 🚀 NERCAR space (in the menu) takes you there and gives you a NERCAR to fly (you do not need to own one);
// press the same button again to go back to where you were. It is not a city of its own: it is built far away from the others (x = -12000, which the game server accepts), so you are still "in Rome"
// as far as everything else is concerned, and the walls of the map (BOUNDS) are swapped for the edges of the field while you are in it. The few things to fly round (a tower, a ring of pillars, a gate to
// fly through, slalom walls and big balls) are solid like any building (addBlockerBox / addBlockerCircle in physics.js), so the NERCAR crashes into them if you fly low. Depends on game.js and car.js at run time.

const NercarSpace = (() => {
  const OX = -12000, HALF = 6000;                                  // the middle of the field, and half of its width (the NERCAR crosses 900 m in half a second)
  const K = 4, Z = 2;                                              // the layout below is drawn small: its distances are made K times longer and the things Z times bigger
  const FIELD = { minX: OX - HALF, maxX: OX + HALF, minZ: -HALF, maxZ: HALF };
  let group = null, active = false, saved = null;
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

  function stripes() {                                             // two greens in big squares, so you can see how fast you go
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#4f9d3a"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#5aab44"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(HALF / 10, HALF / 10);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.magFilter = THREE.NearestFilter;
    return t;
  }

  function box(x, z, w, d, h, color, y0 = 0) {                     // a solid block standing on the grass (or hanging at y0)
    x *= K; z *= K; w *= Z; d *= Z; h *= Z; y0 *= Z;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
    m.position.set(OX + x, y0 + h / 2, z); group.add(m);
    addBlockerBox(OX + x - w / 2, OX + x + w / 2, z - d / 2, z + d / 2, y0, y0 + h);
  }
  function ball(x, z, r, color) {
    x *= K; z *= K; r *= Z;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), lam(color));
    m.position.set(OX + x, r, z); group.add(m);
    addBlockerCircle(OX + x, z, r * 0.9, 0, r * 2);
  }

  function build() {
    group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: stripes() }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(OX, 0, 0); group.add(ground);
    box(0, 0, 26, 26, 130, 0xd8d2c4);                                   // the tower in the middle
    for (let i = 0; i < 6; i++) {                                       // a ring of six pillars
      const a = (i / 6) * Math.PI * 2;
      box(Math.cos(a) * 320, Math.sin(a) * 320, 14, 14, 75, i % 2 ? 0xc0392b : 0xe6b422);
    }
    box(-520, -45, 12, 12, 55, 0x2c6fbb); box(-520, 45, 12, 12, 55, 0x2c6fbb); box(-520, 0, 14, 110, 9, 0x2c6fbb, 55);   // a gate to fly through (and a lintel on top)
    for (let i = 0; i < 5; i++) box(420 + i * 60, i % 2 ? 55 : -55, 10, 130, 22, 0x8e44ad);                          // slalom walls
    ball(-180, 420, 28, 0xe74c3c); ball(220, -430, 34, 0x27ae60); ball(560, 360, 24, 0xf39c12);
    group.visible = false;
    scene.add(group);
  }

  function enter() {
    if (active) return;
    if (mode !== "walk" || panelOpen) { toast("Close what is open and get out of what you are in first"); return; }
    if (typeof Subway !== "undefined" && Subway.underground) { toast("Come up from the metro first (U on the platform)."); return; }
    if (!group) build();
    saved = { city, period: periodNow(), x: player.x, z: player.z, yaw: player.yaw };
    if (city !== "rome") arriveIn("rome", null);
    if (periodNow() !== "modern") setPeriod("modern");                 // (the NERCAR is a modern car)
    active = true;
    group.visible = true;
    Object.assign(BOUNDS, FIELD);
    placeAt(OX - HALF + 400, 0, -Math.PI / 2);
    $("#hud .top-left h1").innerHTML = "Time Machine <small>NERCAR space</small>";
    $("#map-title").textContent = "NERCAR space";
    toast("🚀 NERCAR space: W to go, Space to go up, Shift to go down. Press the NERCAR space button again to go back.");
    setTimeout(() => { if (active && mode === "walk") Car.deploy("nercar"); }, 400);
  }

  function leave() {
    if (!active) return;
    active = false;
    if (typeof Car !== "undefined") { if (Car.driving) { Car.debugSet({ alt: 0, vy: 0, v: 0 }); Car.exit(true); } Car.stow(); }
    group.visible = false;
    Object.assign(BOUNDS, ROME_BOUNDS);
    const s = saved; saved = null;
    if (s.city !== "rome") arriveIn(s.city, null);
    placeAt(s.x, s.z, s.yaw);
    if (periodNow() !== s.period) setPeriod(s.period);
    applyEra();
    toast("You are back.");
  }

  const toggle = () => (active ? leave() : enter());
  return { enter, leave, toggle, get active() { return active; }, FIELD };
})();
