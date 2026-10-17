"use strict";
// The shipyard for the naumachia (naval battle): choose a type of ship, put cannons where you want them on each side, pick the
// sail and hull colours, name it and save it. Saved ships are kept in the browser and with your account, and you sail the chosen
// one into the flooded arena (press N in the arena). Used by naval.js for the single-player battle. Depends on game.js, naval.js.

const Shipyard = (() => {
  const KEY = "rome-ships";
  const SLOTS = 7;                                              // cannon positions along each side, bow to stern
  const SLOT_Z = [3.6, 2.4, 1.2, 0, -1.2, -2.4, -3.6];          // along the ship (+z is the bow), in ship units
  // shape: how the hull is built (naval.js); hw: half the hull's width and lenK: its length against the galley's, in ship units;
  // view: how the ship is drawn in the editor (half width and length in pixels)
  const TYPES = {
    kayak: { name: "Kayak", note: "A narrow one-person boat. Very fast and almost impossible to hit, but a single hit sinks it. Up to 2 cannons.", hp: 30, scale: 0.55, max: 9.6, turn: 1.7, cannons: 2, masts: [], shape: "kayak", hw: 0.45, lenK: 0.7, view: { half: 16, len: 250 } },
    canoe: { name: "Canoe", note: "A dugout canoe with a paddler. Quick and handy. Up to 3 cannons.", hp: 45, scale: 0.6, max: 8.8, turn: 1.5, cannons: 3, masts: [], shape: "canoe", hw: 0.7, lenK: 0.78, view: { half: 24, len: 280 } },
    fishing: { name: "Fishing boat", note: "A little boat with a cabin, a mast and nets. Sturdier than a canoe. Up to 4 cannons.", hp: 65, scale: 0.72, max: 6.2, turn: 1.15, cannons: 4, masts: [[0.8, 4.5]], shape: "fishing", hw: 1.2, lenK: 0.8, view: { half: 36, len: 300 } },
    liburna: { name: "Liburna", note: "A small, quick scout. Turns sharply but is easy to sink. Up to 4 cannons.", hp: 70, scale: 0.66, max: 8.2, turn: 1.35, cannons: 4, masts: [[0.4, 5]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 40, len: 330 } },
    galley: { name: "Galley", note: "The balanced warship. Up to 6 cannons.", hp: 100, scale: 0.8, max: 6.6, turn: 1.0, cannons: 6, masts: [[0.4, 6.5]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 46, len: 340 } },
    trireme: { name: "Trireme", note: "Two masts and a stout hull. Slower, up to 9 cannons.", hp: 130, scale: 0.92, max: 5.8, turn: 0.85, cannons: 9, masts: [[-1.6, 6], [2.2, 5.2]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 48, len: 340 } },
    quinquereme: { name: "Quinquereme", note: "A heavy flagship with a deck castle. Slow and hard to turn, up to 12 cannons.", hp: 175, scale: 1.08, max: 4.8, turn: 0.7, cannons: 12, masts: [[-2.4, 6], [0.2, 7], [2.6, 5.2]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 52, len: 345 } },
    battleship: { name: "Battleship", note: "A huge armoured warship with funnels and turrets. The toughest and the slowest, with every position along both sides (14 cannons).", hp: 260, scale: 1.3, max: 4.2, turn: 0.55, cannons: 14, masts: [], shape: "battleship", hw: 2.1, lenK: 1.3, view: { half: 58, len: 350 } },
  };
  const SAILS = [0x2f8f4a, 0xb3262b, 0x6b3fa0, 0x2f6b8f, 0xc7a21a, 0xe8e0cc, 0x1f1f1f, 0xd9791f];
  const HULLS = [0x7a5230, 0x5a3a20, 0x8a8470, 0x3a4a5a, 0xa0522d, 0x2a2a2a];
  const MAX_SAVED = 4;

  const css = (n) => "#" + n.toString(16).padStart(6, "0");
  const count = (d) => d.port.filter(Boolean).length + d.star.filter(Boolean).length;
  const blank = () => Array(SLOTS).fill(false);
  const standard = () => ({ name: "My galley", type: "galley", sail: 0, hull: 0, port: blank().map((_, i) => [1, 3, 5].includes(i)), star: blank().map((_, i) => [1, 3, 5].includes(i)) }); // three a side, like the galley you started with

  function sanitize(d) {
    const out = { name: "My ship", type: "galley", sail: 0, hull: 0, port: blank(), star: blank() };
    if (!d || typeof d !== "object") return null;
    if (typeof d.name === "string") out.name = d.name.replace(/[^\p{L}\p{N} '\-]/gu, "").slice(0, 20).trim() || "My ship";
    if (TYPES[d.type]) out.type = d.type;
    if (Number.isInteger(d.sail) && d.sail >= 0 && d.sail < SAILS.length) out.sail = d.sail;
    if (Number.isInteger(d.hull) && d.hull >= 0 && d.hull < HULLS.length) out.hull = d.hull;
    let left = TYPES[out.type].cannons;
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) if (Array.isArray(d[side]) && d[side][i] === true && left > 0) { out[side][i] = true; left--; }
    if (count(out) === 0) { out.port[3] = true; out.star[3] = true; }
    return out;
  }

  let ships = [standard()], sel = 0, draft = null;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && Array.isArray(raw.ships)) { const list = raw.ships.map(sanitize).filter(Boolean).slice(0, MAX_SAVED); if (list.length) { ships = list; sel = Math.min(list.length - 1, Math.max(0, raw.sel | 0)); } }
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ships, sel })); } catch (e) { /* ignore */ } };
  const $s = (id) => document.getElementById(id);
  const clone = (d) => JSON.parse(JSON.stringify(d));

  // what naval.js needs to build and sail a ship
  function def(d) {
    d = sanitize(d) || standard();
    const t = TYPES[d.type];
    return { design: d, hp: t.hp, scale: t.scale, max: t.max, turn: t.turn, sail: SAILS[d.sail], hull: HULLS[d.hull], masts: t.masts, shape: t.shape, hw: t.hw, lenK: t.lenK, castle: d.type === "quinquereme", name: d.name, ports: d.port.slice(), stars: d.star.slice() };
  }

  // ---------------------------------------------------------------- the picture of the ship (seen from above, bow at the top)

  const geo = { w: 300, h: 440, cx: 150, top: 40, len: 340, half: 46 };
  const setView = () => { const v = TYPES[draft.type].view; geo.half = v.half; geo.len = v.len; geo.top = 40 + (350 - v.len) / 2; };
  const slotPos = (side, i) => ({ x: geo.cx + (side === "port" ? -1 : 1) * (geo.half + 4), y: geo.top + 40 + ((SLOT_Z[0] - SLOT_Z[i]) / (SLOT_Z[0] - SLOT_Z[SLOTS - 1])) * (geo.len - 120) });

  function draw() {
    setView();
    const c = $s("sy-canvas"), g = c.getContext("2d"), d = draft, t = TYPES[d.type];
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "#1d4b66"; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(255,255,255,.08)"; g.lineWidth = 1;
    for (let y = 10; y < c.height; y += 24) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(70, y - 8, 150, y + 8, 300, y); g.stroke(); }
    // the hull: a pointed bow, a ram, a square stern
    const L = geo.cx - geo.half, R = geo.cx + geo.half, top = geo.top, bot = geo.top + geo.len;
    g.fillStyle = css(HULLS[d.hull]); g.strokeStyle = "#1a120a"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(geo.cx, top); g.bezierCurveTo(R, top + 60, R, top + 90, R, top + 110); g.lineTo(R, bot - 6); g.quadraticCurveTo(R, bot, R - 8, bot); g.lineTo(L + 8, bot); g.quadraticCurveTo(L, bot, L, bot - 6); g.lineTo(L, top + 110); g.bezierCurveTo(L, top + 90, L, top + 60, geo.cx, top); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#9a6a2c"; g.beginPath(); g.moveTo(geo.cx - 7, top + 4); g.lineTo(geo.cx, top - 26); g.lineTo(geo.cx + 7, top + 4); g.closePath(); g.fill(); g.stroke(); // the ram
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(L + 10, top + 90, geo.half * 2 - 20, geo.len - 110); // the deck
    if (t.shape === "battleship") { g.fillStyle = "#6b7078"; g.fillRect(geo.cx - 18, geo.top + 150, 36, 90); g.fillStyle = "#3a3e44"; for (const yy of [170, 215]) { g.beginPath(); g.arc(geo.cx, geo.top + yy, 11, 0, 6.3); g.fill(); } }
    if (d.type === "quinquereme") { g.fillStyle = "#4a3320"; g.fillRect(L + 12, bot - 70, geo.half * 2 - 24, 56); }
    // masts and sails
    for (const [mz, mh] of t.masts) {
      const y = geo.top + 40 + ((SLOT_Z[0] - mz) / (SLOT_Z[0] - SLOT_Z[SLOTS - 1])) * (geo.len - 120);
      const sw2 = Math.min(34, geo.half * 0.72); g.fillStyle = css(SAILS[d.sail]); g.fillRect(geo.cx - sw2, y - 6, sw2 * 2, 12); g.strokeRect(geo.cx - sw2, y - 6, sw2 * 2, 12);
      g.fillStyle = "#2a1f16"; g.beginPath(); g.arc(geo.cx, y, 5, 0, 6.3); g.fill();
    }
    // the cannon slots: filled when a cannon stands there
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) {
      const p = slotPos(side, i), on = d[side][i];
      g.beginPath(); g.arc(p.x, p.y, 13, 0, 6.3);
      g.fillStyle = on ? "#2e2e30" : "rgba(255,255,255,.12)"; g.fill();
      g.lineWidth = 2; g.strokeStyle = on ? "#e2b955" : "rgba(255,255,255,.45)"; g.setLineDash(on ? [] : [4, 3]); g.stroke(); g.setLineDash([]);
      if (on) { g.fillStyle = "#e2b955"; g.beginPath(); g.arc(p.x + (side === "port" ? -3 : 3), p.y, 4, 0, 6.3); g.fill(); }
    }
    g.fillStyle = "rgba(255,255,255,.7)"; g.font = "bold 13px sans-serif"; g.textAlign = "center";
    g.fillText("BOW", geo.cx, 14); g.fillText("port (Q)", 40, geo.h - 14); g.fillText("starboard (E)", 252, geo.h - 14);
  }

  // a small picture of a saved ship from above (bow at the top) with its cannons marked, for the list
  function mini(d) {
    const t = TYPES[d.type], c = document.createElement("canvas"), W2 = 44, H2 = 84;
    c.width = W2; c.height = H2; c.className = "sy-mini"; c.title = "Cannons: " + count(d);
    const g = c.getContext("2d"), half = Math.max(5, t.view.half / 4.2), len = t.view.len / 4.2, top = (H2 - len) / 2 + 3, cx = W2 / 2;
    g.fillStyle = css(HULLS[d.hull]); g.strokeStyle = "#1a120a"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx, top); g.quadraticCurveTo(cx + half, top + 12, cx + half, top + 24); g.lineTo(cx + half, top + len - 2); g.lineTo(cx - half, top + len - 2); g.lineTo(cx - half, top + 24); g.quadraticCurveTo(cx - half, top + 12, cx, top); g.closePath(); g.fill(); g.stroke();
    for (const [mz] of t.masts) { const y = top + 10 + ((SLOT_Z[0] - mz) / (SLOT_Z[0] - SLOT_Z[SLOTS - 1])) * (len - 22); g.fillStyle = css(SAILS[d.sail]); g.fillRect(cx - half * 0.7, y - 1.5, half * 1.4, 3); }
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) {
      const y = top + 10 + (i / (SLOTS - 1)) * (len - 22), x = cx + (side === "port" ? -1 : 1) * (half + 1);
      g.beginPath(); g.arc(x, y, d[side][i] ? 2.6 : 1.4, 0, 6.3);
      g.fillStyle = d[side][i] ? "#ffcf4a" : "rgba(255,255,255,.28)"; g.fill();
      if (d[side][i]) { g.strokeStyle = "#1a120a"; g.lineWidth = 1; g.stroke(); }
    }
    return c;
  }

  const hint = (t) => { const h = $s("sy-hint"); if (h) h.textContent = t; };

  function stats() {
    const d = draft, t = TYPES[d.type], n = count(d), p = d.port.filter(Boolean).length, s = d.star.filter(Boolean).length;
    $s("sy-stats").textContent = `${t.name}: hull ${t.hp}, top speed ${Math.round(t.max * 3.6)} km/h, turning ${t.turn >= 1.2 ? "very sharp" : t.turn >= 0.95 ? "good" : t.turn >= 0.8 ? "slow" : "heavy"}. Cannons ${n} of ${t.cannons} (port ${p}, starboard ${s}). Each side fires together; more cannons on a side hit harder but reload slower (${(1.6 + 0.2 * p).toFixed(1)} s port, ${(1.6 + 0.2 * s).toFixed(1)} s starboard).`;
    $s("sy-note").textContent = t.note;
  }

  function clickCanvas(e) {
    setView();
    const c = $s("sy-canvas"), r = c.getBoundingClientRect(), x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height);
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) {
      const p = slotPos(side, i);
      if (Math.hypot(x - p.x, y - p.y) < 20) {
        if (draft[side][i]) { if (count(draft) > 1) { draft[side][i] = false; hint("Cannon taken off."); } else hint("A ship needs at least one cannon."); }
        else if (count(draft) < TYPES[draft.type].cannons) { draft[side][i] = true; hint("Cannon added."); }
        else {                                                        // at the limit: move the nearest cannon to this spot (same side first)
          let best = null, bd = Infinity;
          for (const s2 of [side, side === "port" ? "star" : "port"]) for (let j = 0; j < SLOTS; j++) if (draft[s2][j]) { const d = Math.abs(j - i) + (s2 === side ? 0 : 3); if (d < bd) { bd = d; best = [s2, j]; } }
          if (best) { draft[best[0]][best[1]] = false; draft[side][i] = true; hint(`Moved a cannon to the ${side === "port" ? "port" : "starboard"} side. (This ship carries at most ${TYPES[draft.type].cannons}.)`); }
        }
        refresh(); return;
      }
    }
  }

  // ---------------------------------------------------------------- the panel

  function sw(parent, list, key) {
    parent.replaceChildren(...list.map((col, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "sy-sw" + (draft[key] === i ? " on" : ""); b.style.background = css(col); b.setAttribute("aria-label", `${key} colour ${i + 1}`);
      b.addEventListener("click", () => { draft[key] = i; refresh(); });
      return b;
    }));
  }

  function refresh() {
    // the saved ships
    $s("sy-list").replaceChildren(...ships.map((s, i) => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = i === sel ? "on" : "";
      const label = document.createElement("span"), nm = document.createElement("strong"), sub = document.createElement("small");
      nm.textContent = `${i === sel ? "▶ " : ""}${s.name}`; sub.textContent = `${TYPES[s.type].name} · ${count(s)} cannons: ${s.port.filter(Boolean).length} port, ${s.star.filter(Boolean).length} starboard`;
      label.append(nm, sub); b.append(mini(i === sel && draft ? draft : s), label);
      b.addEventListener("click", () => { sel = i; draft = clone(ships[i]); save(); refresh(); });
      li.append(b);
      if (ships.length > 1) { const x = document.createElement("button"); x.type = "button"; x.textContent = "✕"; x.title = "Delete this ship"; x.className = "sy-del"; x.addEventListener("click", () => { ships.splice(i, 1); sel = Math.min(sel, ships.length - 1); draft = clone(ships[sel]); save(); refresh(); }); li.append(x); }
      return li;
    }));
    for (const b of document.querySelectorAll("#sy-types button")) { b.classList.toggle("on", b.dataset.type === draft.type); }
    sw($s("sy-sails"), SAILS, "sail"); sw($s("sy-hulls"), HULLS, "hull");
    $s("sy-name").value = draft.name;
    $s("sy-new").disabled = ships.length >= MAX_SAVED;
    draw(); stats();
  }

  function setType(t) {
    if (!TYPES[t] || draft.type === t) return;
    draft.type = t;
    let left = TYPES[t].cannons;                     // keep what fits, from the bow backwards
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) if (draft[side][i]) { if (left > 0) left--; else draft[side][i] = false; }
    if (count(draft) === 0) { draft.port[3] = true; draft.star[3] = true; }
    refresh();
  }

  function commit() { draft.name = $s("sy-name").value.trim() || draft.name; draft = sanitize(draft); ships[sel] = clone(draft); save(); return draft; }

  function open() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    if (!Vitals.canFight()) { toast(`You are too wounded to command a ship (health ${Math.round(Vitals.hp)}/100). Press Z to rest and heal.`); return; }
    draft = clone(ships[sel]);
    openPanel("#shipyard");
    refresh();
  }

  function sail() {
    commit();
    closePanels();
    Naval.start(def(ships[sel]));
  }

  function bind() {
    const row = $s("sy-types");
    for (const [id, t] of Object.entries(TYPES)) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.type = id; b.textContent = t.name;
      b.addEventListener("click", () => setType(id)); row.append(b);
    }
    $s("sy-canvas").addEventListener("click", clickCanvas);
    $s("sy-name").addEventListener("input", () => { draft.name = $s("sy-name").value.slice(0, 20); });
    $s("sy-save").addEventListener("click", () => { commit(); refresh(); toast(`Saved "${ships[sel].name}".`); });
    $s("sy-new").addEventListener("click", () => { if (ships.length >= MAX_SAVED) return; commit(); const n = clone(ships[sel]); n.name = "New ship"; ships.push(n); sel = ships.length - 1; draft = clone(n); save(); refresh(); $s("sy-name").select(); });
    $s("sy-sail").addEventListener("click", sail);
  }

  return {
    bind, open, def, sail,
    selectedDef: () => def(ships[sel]),
    // for the online lobby: choose one of your saved ships (you cannot build one there)
    list: () => ships.map((s, i) => ({ i, label: `${s.name} (${TYPES[s.type].name}, ${count(s)} cannons)` })),
    get sel() { return sel; },
    choose(i) { if (Number.isInteger(i) && i >= 0 && i < ships.length) { sel = i; save(); } },
    onlineDesign: () => { const d = ships[sel]; return { type: d.type, sail: d.sail, hull: d.hull, port: d.port.slice(), star: d.star.slice() }; },
    snapshot: () => ({ ships: clone(ships), sel }),
    restore(raw) {
      if (!raw || !Array.isArray(raw.ships)) return;
      const list = raw.ships.map(sanitize).filter(Boolean).slice(0, MAX_SAVED);
      if (list.length) { ships = list; sel = Math.min(list.length - 1, Math.max(0, raw.sel | 0)); save(); }
    },
    TYPES, SLOTS, SLOT_Z,
  };
})();
