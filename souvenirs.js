"use strict";
// Souvenirs: 🏺 Souvenirs in the menu. Four small keepsakes for every city, each one yours the first time you discover a particular sight (a coin from the Forum, a rubber ball from the
// Great Ball Court, a red lantern from Tiananmen...). Nothing needs saving of its own: they come from the sights you have discovered, which are kept with your account. The ones you have
// stand on the shelf on the west wall of your house in Rome, and the trophy room shows all sixteen (and what to do to find the missing ones). The game server is told which you have, so they
// show on your profile. Depends on game.js (discovered, ALL_LANDMARKS, worldScene, toast, openPanel), home.js and online.js.

const Souvenirs = (() => {
  // [id, city, emoji, name, the sight that gives it, a line about it]
  const LIST = [
    ["rome-denarius", "rome", "🪙", "A silver denarius", "forum", "A coin with the emperor's head. A day's pay for a soldier was about one denarius."],
    ["rome-rudis", "rome", "🗡️", "A wooden practice sword", "colosseum", "A rudis. A gladiator who won his freedom was given one, and so became a rudiarius."],
    ["rome-pantheon", "rome", "🏛️", "A tiny Pantheon", "pantheon", "Its real dome is still the biggest unreinforced concrete dome in the world."],
    ["rome-wheel", "rome", "☸️", "A chariot wheel", "circus", "A model wheel from the Circus Maximus, which held a quarter of a million people."],
    ["delhi-gate", "delhi", "🏯", "A red sandstone gate", "d-lahori", "The Lahori Gate was the main entrance to the Red Fort."],
    ["delhi-diya", "delhi", "🪔", "A brass diya", "d-jama", "A little lamp of oil and a cotton wick, lit at Diwali and in the evening prayers."],
    ["delhi-feather", "delhi", "🪶", "A peacock feather", "d-diwankhas", "The Peacock Throne of the Mughals was covered with gold and jewels."],
    ["delhi-spice", "delhi", "🧂", "A jar of spices", "d-chandni", "Chandni Chowk has sold spices for nearly four hundred years."],
    ["cancun-castillo", "cancun", "🔺", "A model of El Castillo", "c-castillo", "At the equinox the sun makes a snake of light slide down its stairs."],
    ["cancun-ball", "cancun", "🏀", "A rubber ball", "c-ballcourt", "The Maya made rubber from the sap of a tree and played with it a thousand years before Europe knew it."],
    ["cancun-jade", "cancun", "💚", "A jade bead", "c-cenote", "Jade was worth more than gold to the Maya."],
    ["cancun-conch", "cancun", "🐚", "A conch shell", "c-reef", "A conch was blown like a trumpet at Maya ceremonies."],
    ["beijing-lantern", "beijing", "🏮", "A red lantern", "b-tiananmen", "Red is the colour of luck and joy, and lanterns hang under the roofs of the Forbidden City."],
    ["beijing-brick", "beijing", "🧱", "A brick of the Great Wall", "b-wall", "Ming builders baked the bricks in kilns by the wall, and sticky rice mortar held them."],
    ["beijing-seal", "beijing", "🟩", "A jade seal", "b-harmony", "An emperor's seal was the sign of his power: whoever held it could write the law."],
    ["beijing-heaven", "beijing", "⛩️", "A model of the Temple of Heaven", "b-heaven", "Its blue roof is the colour of the sky: here the emperor prayed for the harvest."],
  ];
  const CITIES = { rome: "Rome", delhi: "Old Delhi", cancun: "Cancún", beijing: "Beijing" };
  const lmName = (id) => { const l = ALL_LANDMARKS.find((x) => x.id === id); return l ? l.name : id; };
  const have = () => LIST.filter((s) => discovered.has(s[4]));
  const sig = () => have().map((s) => s[0]).join(",");
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };

  // ---------------------------------------------------------------- the shelf in the house in Rome (the west wall, between the door and the chest)
  const SHELF = { x: 249.72, z: 50.0, len: 3.0, floor: 0.15, rows: [0.85, 1.4, 1.95] };
  const props = {};                                    // id -> mesh
  function make(id) {
    const T = THREE, g = new T.Group(), add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
    const gold = lambert(0xd9b44a, { emissive: 0x2a2005 }), wood = lambert(0x8a5a2b), stone = lambert(0xb9b2a0), red = lambert(0xb3262b), bronze = lambert(0xb08d3e), jade = lambert(0x3fa575), blue = lambert(0x2f5fa8), cream = lambert(0xefe6cf);
    switch (id) {
      case "rome-denarius": add(new T.CylinderGeometry(0.13, 0.13, 0.025, 20), gold, 0, 0.13, 0, Math.PI / 2, 0, 0.3); break;
      case "rome-rudis": add(new T.BoxGeometry(0.42, 0.035, 0.05), wood, 0, 0.03, 0); add(new T.BoxGeometry(0.1, 0.045, 0.06), lambert(0x5a3e22), -0.2, 0.03, 0); break;
      case "rome-pantheon": add(new T.CylinderGeometry(0.14, 0.14, 0.1, 16), cream, 0, 0.05, 0); add(new T.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone, 0, 0.1, 0); add(new T.BoxGeometry(0.2, 0.05, 0.04), cream, 0, 0.05, 0.15); break;
      case "rome-wheel": add(new T.TorusGeometry(0.14, 0.02, 6, 20), wood, 0, 0.15, 0, 0, Math.PI / 2, 0); add(new T.CylinderGeometry(0.03, 0.03, 0.05, 8), bronze, 0, 0.15, 0, 0, 0, Math.PI / 2); add(new T.BoxGeometry(0.02, 0.26, 0.02), wood, 0, 0.15, 0); break;
      case "delhi-gate": add(new T.BoxGeometry(0.3, 0.16, 0.1), lambert(0xa8442e), 0, 0.08, 0); add(new T.BoxGeometry(0.1, 0.1, 0.12), lambert(0x2a1c14), 0, 0.05, 0); for (const x of [-0.1, 0, 0.1]) add(new T.SphereGeometry(0.03, 8, 6), cream, x, 0.19, 0); break;
      case "delhi-diya": add(new T.CylinderGeometry(0.1, 0.06, 0.05, 12), bronze, 0, 0.025, 0); add(new T.SphereGeometry(0.03, 8, 6), new T.MeshBasicMaterial({ color: 0xffc860 }), 0, 0.09, 0); break;
      case "delhi-feather": add(new T.ConeGeometry(0.045, 0.34, 8), lambert(0x1f8a8a), 0, 0.2, 0, 0, 0, 0.5); add(new T.SphereGeometry(0.04, 8, 6), blue, 0.04, 0.3, 0); break;
      case "delhi-spice": add(new T.CylinderGeometry(0.08, 0.09, 0.15, 12), lambert(0xc4621f), 0, 0.075, 0); add(new T.CylinderGeometry(0.06, 0.06, 0.04, 12), wood, 0, 0.17, 0); break;
      case "cancun-castillo": for (let i = 0; i < 4; i++) add(new T.BoxGeometry(0.3 - i * 0.07, 0.06, 0.3 - i * 0.07), stone, 0, 0.03 + i * 0.06, 0); add(new T.BoxGeometry(0.07, 0.06, 0.07), cream, 0, 0.27, 0); break;
      case "cancun-ball": add(new T.SphereGeometry(0.1, 14, 10), lambert(0x6a3b22), 0, 0.1, 0); break;
      case "cancun-jade": add(new T.SphereGeometry(0.07, 12, 8), jade, 0, 0.07, 0); add(new T.SphereGeometry(0.05, 12, 8), jade, 0.12, 0.05, 0.02); break;
      case "cancun-conch": add(new T.ConeGeometry(0.08, 0.22, 10), lambert(0xe9b9a2), 0, 0.08, 0, 0, 0, Math.PI / 2 - 0.25); break;
      case "beijing-lantern": add(new T.CylinderGeometry(0.1, 0.1, 0.16, 12), red, 0, 0.12, 0); for (const y of [0.03, 0.21]) add(new T.CylinderGeometry(0.06, 0.06, 0.03, 10), gold, 0, y, 0); break;
      case "beijing-brick": add(new T.BoxGeometry(0.26, 0.1, 0.12), lambert(0x8f8a82), 0, 0.05, 0); break;
      case "beijing-seal": add(new T.BoxGeometry(0.14, 0.1, 0.14), jade, 0, 0.05, 0); add(new T.SphereGeometry(0.045, 8, 6), jade, 0, 0.13, 0); break;
      case "beijing-heaven": for (let i = 0; i < 3; i++) add(new T.CylinderGeometry(0.1 - i * 0.025, 0.12 - i * 0.025, 0.05, 14), i === 0 ? cream : blue, 0, 0.025 + i * 0.07, 0); add(new T.ConeGeometry(0.03, 0.08, 8), gold, 0, 0.26, 0); break;
    }
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    return g;
  }
  let built = false, last = "";
  function build(scene) {
    if (built || !scene) return; built = true;
    const T = THREE, wood = lambert(0x6b4a2b);
    const box = (w, h, d, x, y, z) => { const m = shadowed(new T.Mesh(BOX, wood)); m.scale.set(w, h, d); m.position.set(x, y, z); scene.add(m); };
    for (const y of SHELF.rows) box(0.36, 0.05, SHELF.len, SHELF.x, SHELF.floor + y - 0.025, SHELF.z);            // the boards
    for (const dz of [-1, 1]) box(0.34, SHELF.rows[2] + 0.1, 0.06, SHELF.x, SHELF.floor + (SHELF.rows[2] + 0.1) / 2, SHELF.z + dz * (SHELF.len / 2 - 0.03));   // the two ends
    const per = Math.ceil(LIST.length / SHELF.rows.length);
    LIST.forEach((s, i) => {                                           // each keepsake has its own place on the shelf, kept in the order of the list
      const row = Math.floor(i / per), col = i % per, m = make(s[0]);
      m.position.set(SHELF.x + 0.02, SHELF.floor + SHELF.rows[row], SHELF.z - SHELF.len / 2 + 0.3 + col * ((SHELF.len - 0.6) / Math.max(1, per - 1)));
      m.rotation.y = Math.PI / 2;
      m.visible = false; scene.add(m); props[s[0]] = m;
    });
    refresh();
  }
  function refresh() {
    const got = new Set(have().map((s) => s[0]));
    for (const id of Object.keys(props)) props[id].visible = got.has(id);
  }

  // ---------------------------------------------------------------- the trophy room
  function render() {
    const body = document.getElementById("sv-body"); if (!body) return; body.replaceChildren();
    const got = new Set(have().map((s) => s[0]));
    body.append(el("p", `${got.size} of ${LIST.length} souvenirs. Each one is yours the first time you discover a particular sight. They stand on the shelf in your house in Rome, and show on your profile.`, "dnote"));
    for (const [c, name] of Object.entries(CITIES)) {
      body.append(el("h4", name, "tn-round"));
      for (const s of LIST.filter((x) => x[1] === c)) {
        const row = el("div", undefined, `sp-row${got.has(s[0]) ? "" : " sv-lock"}`), t = el("span");
        t.textContent = got.has(s[0]) ? `${s[2]} ${s[3]}: ${s[5]}` : `🔒 ${s[3]}: discover ${lmName(s[4])}`;
        row.append(t); body.append(row);
      }
    }
  }
  function open() { render(); openPanel("#souv"); }

  // ---------------------------------------------------------------- finding one, and telling the server
  function found(id) {
    const s = LIST.find((x) => x[4] === id); if (!s) return;
    refresh(); tell();
    setTimeout(() => { Sfx.play("medal"); toast(`🎁 Souvenir: ${s[2]} ${s[3]}! It is on the shelf in your house. (🏺 Souvenirs in the menu)`); }, 1600);
  }
  let told = "";
  function tell() {
    const now = sig();
    if (now === told || !Online.connected) return;
    told = now; Online.navalSend({ t: "souv", ids: have().map((s) => s[0]) });
  }
  function bind() {
    const b = document.getElementById("btn-souv"); if (b) b.addEventListener("click", open);
    setInterval(() => { const now = sig(); if (now !== last) { last = now; refresh(); } tell(); }, 3000);            // (the saved game can arrive after the page has started)
  }
  return { bind, build, refresh, found, open, list: LIST, have };
})();
