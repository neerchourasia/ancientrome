"use strict";
// The shipyard for the naumachia (naval battle): choose a type of ship, put cannons where you want them on each side, pick the
// sail and hull colours, name it and save it. Saved ships are kept in the browser and with your account, and you sail the chosen
// one into the flooded arena (press N in the arena). Used by naval.js for the single-player battle. Depends on game.js, naval.js.

const Shipyard = (() => {
  const KEY = "rome-ships";
  const SLOTS = 7;                                              // cannon positions along each side, bow to stern
  const SLOT_Z = [3.6, 2.4, 1.2, 0, -1.2, -2.4, -3.6];          // along the ship (+z is the bow), in ship units
  const TYPES = {
    liburna: { name: "Liburna", note: "A small, quick scout. Turns sharply but is easy to sink.", hp: 70, scale: 0.66, max: 8.2, turn: 1.35, cannons: 4, masts: [[0.4, 5]] },
    galley: { name: "Galley", note: "The balanced warship. Up to 6 cannons.", hp: 100, scale: 0.8, max: 6.6, turn: 1.0, cannons: 6, masts: [[0.4, 6.5]] },
    trireme: { name: "Trireme", note: "Two masts and a stout hull. Slower, up to 9 cannons.", hp: 130, scale: 0.92, max: 5.8, turn: 0.85, cannons: 9, masts: [[-1.6, 6], [2.2, 5.2]] },
    quinquereme: { name: "Quinquereme", note: "A heavy flagship with a deck castle. Slow and hard to turn, up to 12 cannons.", hp: 175, scale: 1.08, max: 4.8, turn: 0.7, cannons: 12, masts: [[-2.4, 6], [0.2, 7], [2.6, 5.2]] },
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
    return { design: d, hp: t.hp, scale: t.scale, max: t.max, turn: t.turn, sail: SAILS[d.sail], hull: HULLS[d.hull], masts: t.masts, castle: d.type === "quinquereme", name: d.name, ports: d.port.slice(), stars: d.star.slice() };
  }

  // ---------------------------------------------------------------- the picture of the ship (seen from above, bow at the top)

  const geo = { w: 300, h: 440, cx: 150, top: 40, len: 340, half: 46 };
  const slotPos = (side, i) => ({ x: geo.cx + (side === "port" ? -1 : 1) * (geo.half + 4), y: geo.top + 40 + ((SLOT_Z[0] - SLOT_Z[i]) / (SLOT_Z[0] - SLOT_Z[SLOTS - 1])) * (geo.len - 120) });

  function draw() {
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
    if (d.type === "quinquereme") { g.fillStyle = "#4a3320"; g.fillRect(L + 12, bot - 70, geo.half * 2 - 24, 56); }
    // masts and sails
    for (const [mz, mh] of t.masts) {
      const y = geo.top + 40 + ((SLOT_Z[0] - mz) / (SLOT_Z[0] - SLOT_Z[SLOTS - 1])) * (geo.len - 120);
      g.fillStyle = css(SAILS[d.sail]); g.fillRect(geo.cx - 34, y - 6, 68, 12); g.strokeRect(geo.cx - 34, y - 6, 68, 12);
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

  function stats() {
    const d = draft, t = TYPES[d.type], n = count(d), p = d.port.filter(Boolean).length, s = d.star.filter(Boolean).length;
    $s("sy-stats").textContent = `${t.name}: hull ${t.hp}, top speed ${Math.round(t.max * 3.6)} km/h, turning ${t.turn >= 1.2 ? "very sharp" : t.turn >= 0.95 ? "good" : t.turn >= 0.8 ? "slow" : "heavy"}. Cannons ${n} of ${t.cannons} (port ${p}, starboard ${s}). Each side fires together; more cannons on a side hit harder but reload slower (${(1.6 + 0.2 * p).toFixed(1)} s port, ${(1.6 + 0.2 * s).toFixed(1)} s starboard).`;
    $s("sy-note").textContent = t.note;
  }

  function clickCanvas(e) {
    const c = $s("sy-canvas"), r = c.getBoundingClientRect(), x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height);
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) {
      const p = slotPos(side, i);
      if (Math.hypot(x - p.x, y - p.y) < 17) {
        if (draft[side][i]) { if (count(draft) > 1) draft[side][i] = false; else toast("A ship needs at least one cannon."); }
        else if (count(draft) < TYPES[draft.type].cannons) draft[side][i] = true;
        else toast(`A ${TYPES[draft.type].name.toLowerCase()} carries at most ${TYPES[draft.type].cannons} cannons. Take one off first.`);
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
      b.type = "button"; b.className = i === sel ? "on" : ""; b.textContent = `${i === sel ? "▶ " : ""}${s.name} (${TYPES[s.type].name}, ${count(s)} cannons)`;
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
    snapshot: () => ({ ships: clone(ships), sel }),
    restore(raw) {
      if (!raw || !Array.isArray(raw.ships)) return;
      const list = raw.ships.map(sanitize).filter(Boolean).slice(0, MAX_SAVED);
      if (list.length) { ships = list; sel = Math.min(list.length - 1, Math.max(0, raw.sel | 0)); save(); }
    },
    TYPES, SLOTS, SLOT_Z,
  };
})();
