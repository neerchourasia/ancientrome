"use strict";
// Ner place: a small place of its own to travel to. 🏠 Ner place (in the menu) takes you there on foot; the same button takes you back to where you were. It has a paved plaza with a fountain, a gate
// with the name over it, trees and lamps, a few houses, and the Ner store, a shop you can walk into (interiors.js, the kind "ner") that sells Ner, which comes from here ("From Ner place" in shopkeep.js).
// Like car and plane space (nercarspace.js) it is not a city of its own: it is built far away from the others (x = 40000; the game server clamps positions to 20000, which does no harm), so you are still
// "in Rome" as far as everything else is concerned, and the walls of the map (BOUNDS) and the map window (MAP) are swapped for the edges of the place while you are in it.
// Depends on game.js, interiors.js (addHouse) and physics.js at run time.

const NerPlace = (() => {
  const OX = 40000, HALF = 320;                                    // the middle of the place, and half of its width
  const FIELD = { minX: OX - HALF, maxX: OX + HALF, minZ: -HALF, maxZ: HALF };
  let group = null, active = false, saved = null;
  const mats = new Map();
  const lam = (c, o) => { const k = c + (o ? JSON.stringify(o) : ""); if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...o })); return mats.get(k); };

  const tex = (draw, w, h, rep) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep, rep);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    return t;
  };
  // a solid block (x, z are metres from the middle of the place)
  function block(x, z, w, d, h, color, y0 = 0, solid = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
    m.position.set(OX + x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true; group.add(m);
    if (solid) addBlockerBox(OX + x - w / 2, OX + x + w / 2, z - d / 2, z + d / 2, y0, y0 + h);
    return m;
  }
  function cylinder(x, z, r, h, color, y0 = 0, solid = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), lam(color));
    m.position.set(OX + x, y0 + h / 2, z); m.castShadow = true; group.add(m);
    if (solid) addBlockerCircle(OX + x, z, r, y0, y0 + h);
    return m;
  }
  function tree(x, z, s = 1) {
    cylinder(x, z, 0.35 * s, 3.2 * s, 0x5a4630);
    const c = new THREE.Mesh(new THREE.SphereGeometry(2.4 * s, 12, 9), lam(0x2f8f4a)); c.position.set(OX + x, 4.6 * s, z); c.castShadow = true; group.add(c);
  }
  function lamp(x, z) {
    cylinder(x, z, 0.12, 5.2, 0x222222);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 9), new THREE.MeshBasicMaterial({ color: 0xfff1b8 })); b.position.set(OX + x, 5.4, z); group.add(b);
  }
  function label(text, sub, w, h, bg, fg) {
    const t = tex((g, cw, ch) => {
      g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(8, 8, cw - 16, ch - 16);
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 92px Georgia, serif"; g.fillText(text, cw / 2, sub ? ch * 0.42 : ch / 2);
      if (sub) { g.font = "40px Georgia, serif"; g.fillText(sub, cw / 2, ch * 0.76); }
    }, 512, 256);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  }

  function build() {
    group = new THREE.Group();
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 200, HALF * 2 + 200), lam(0x4f9d3a));
    grass.rotation.x = -Math.PI / 2; grass.position.set(OX, 0, 0); grass.receiveShadow = true; group.add(grass);
    const tiles = tex((g, w, h) => { g.fillStyle = "#d9d9d6"; g.fillRect(0, 0, w, h); g.strokeStyle = "#9a9a96"; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = "#cfcfcb"; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); }, 64, 64, 22);
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshLambertMaterial({ map: tiles }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(OX, 0.04, 0); plaza.receiveShadow = true; group.add(plaza);
    // the gate in the south wall of the plaza, with the name of the place over it
    block(-14, 112, 4, 4, 14, 0x111111); block(14, 112, 4, 4, 14, 0x111111); block(0, 112, 32, 4, 3, 0x111111, 14, false);
    const sign = label("NER PLACE", "welcome", 24, 8, "#111111", "#ffffff"); sign.position.set(OX, 17.5, 114.1); group.add(sign);                       // (facing south: what you see arriving)
    const back = label("NER PLACE", "come again", 24, 8, "#111111", "#ffffff"); back.position.set(OX, 17.5, 109.9); back.rotation.y = Math.PI; group.add(back);   // (facing north: what you see leaving)
    // a low wall round the plaza, open at the gate
    const wall = (x, z, w, d) => block(x, z, w, d, 1.4, 0x2a2a2a);
    wall(0, -112, 224, 3); wall(-112, 0, 3, 224); wall(112, 0, 3, 224); wall(-65, 112, 94, 3); wall(65, 112, 94, 3);
    // the fountain in the middle of the plaza
    cylinder(0, 45, 9, 0.9, 0xbcbcb8); const water = cylinder(0, 45, 7.6, 0.2, 0x2fa8d8, 0.8, false); water.material = new THREE.MeshLambertMaterial({ color: 0x2fa8d8, emissive: 0x0b3d52 });
    cylinder(0, 45, 0.9, 4, 0xbcbcb8, 0.9, false);
    // houses at the sides (the Ner store is the one you can walk into)
    for (const [x, z, w, d, h, c] of [[-70, -30, 22, 16, 9, 0x2b2b2b], [70, -30, 22, 16, 9, 0xe9e9e6], [-72, 40, 18, 14, 7, 0xe9e9e6], [72, 40, 18, 14, 7, 0x2b2b2b]]) {
      block(x, z, w, d, h, c); block(x, z, w + 1.4, d + 1.4, 0.8, 0x111111, h, false);
    }
    // lamps and trees
    for (const x of [-30, 30]) for (const z of [-80, 0, 80]) lamp(x, z);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, r = 165 + (i % 3) * 38; tree(Math.cos(a) * r, Math.sin(a) * r, 1 + (i % 4) * 0.12); }
    for (const [x, z] of [[-95, -95], [95, -95], [-95, 95], [95, 95], [-45, 95], [45, 95]]) tree(x, z, 0.9);
    // the Ner store: black, with a white roof, its door on the side facing the gate
    if (typeof Interiors !== "undefined") Interiors.addHouse({ x: OX, z: -45, w: 32, d: 20, h: 7, kinds: "ner", side: "S", signY: 4.2, parent: group, color: 0x262626, band: 0x1c1c1c, roof: "flat", roofColor: 0xf2f2f0 });
    // on the map
    MAP_SHAPES.push({ k: "r", x0: OX - 110, x1: OX + 110, z0: -110, z1: 110, c: "#d9d9d6" }, { k: "r", x0: OX - 16, x1: OX + 16, z0: -55, z1: -35, c: "#262626" }, { k: "e", cx: OX, cz: 45, ax: 9, az: 9, c: "#2fa8d8" });
    for (const [x, z, w, d] of [[-70, -30, 22, 16], [70, -30, 22, 16], [-72, 40, 18, 14], [72, 40, 18, 14]]) MAP_SHAPES.push({ k: "r", x0: OX + x - w / 2, x1: OX + x + w / 2, z0: z - d / 2, z1: z + d / 2, c: "#9a9a96" });
    group.visible = false;
    scene.add(group);
  }

  function enter() {
    if (active) return;
    if (typeof NercarSpace !== "undefined" && NercarSpace.active) { toast("Leave car and plane space first (press its button in the menu)."); return; }
    if (mode !== "walk" || panelOpen) { toast("Close what is open and get out of what you are in first"); return; }
    if (typeof Subway !== "undefined" && Subway.underground) { toast("Come up from the metro first (U on the platform)."); return; }
    if (!group) build();
    saved = { city, x: player.x, z: player.z, yaw: player.yaw };
    if (city !== "rome") arriveIn("rome", null);
    active = true;
    group.visible = true;
    Object.assign(BOUNDS, FIELD);
    Object.assign(MAP, { x0: OX - HALF, x1: OX + HALF, z0: -HALF, z1: HALF });
    placeAt(OX, 150, 0);
    $("#hud .top-left h1").innerHTML = "Time Machine <small>Ner place</small>";
    $("#map-title").textContent = "Ner place";
    toast("🏠 Ner place: walk in through the gate to the Ner store. The menu button takes you back.");
  }

  function leave() {
    if (!active) return;
    active = false;
    group.visible = false;
    Object.assign(BOUNDS, ROME_BOUNDS); Object.assign(MAP, ROME_MAP);
    const s = saved; saved = null;
    if (s.city !== "rome") arriveIn(s.city, null);
    placeAt(s.x, s.z, s.yaw);
    applyEra();
    toast("You are back.");
  }

  const toggle = () => (active ? leave() : enter());
  return { enter, leave, toggle, get active() { return active; }, FIELD };
})();
