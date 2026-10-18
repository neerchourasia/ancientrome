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
  // ports / stars: which of the seven positions along each side a cannon can go (so each boat holds a different number);
  // scale: the boat's size in the arena; shape / hw / lenK: how the hull is built (naval.js); view: how it is drawn in the editor
  const TYPES = {
    kayak: { name: "Kayak", note: "A narrow one-person boat: 1 cannon, on the port side. Very fast and almost impossible to hit, but one hit sinks it.", hp: 30, scale: 0.5, max: 9.6, turn: 1.7, ports: [3], stars: [], masts: [], shape: "kayak", hw: 0.45, lenK: 0.7, view: { half: 15, len: 210 } },
    canoe: { name: "Canoe", note: "A dugout canoe with a paddler: 2 cannons. Quick and handy.", hp: 45, scale: 0.6, max: 8.8, turn: 1.5, ports: [3], stars: [3], masts: [], shape: "canoe", hw: 0.7, lenK: 0.78, view: { half: 22, len: 250 } },
    fishing: { name: "Fishing boat", note: "A little boat with a cabin, a mast and nets: 4 cannons. Sturdier than a canoe.", hp: 65, scale: 0.55, max: 6.2, turn: 1.15, ports: [2, 4], stars: [2, 4], masts: [[0.8, 4.5]], shape: "fishing", hw: 1.1, lenK: 0.75, view: { half: 27, len: 255 } },
    liburna: { name: "Liburna", note: "A small, quick warship: 6 cannons. Turns sharply but is easy to sink.", hp: 70, scale: 0.8, max: 8.2, turn: 1.35, ports: [1, 3, 5], stars: [1, 3, 5], masts: [[0.4, 5]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 38, len: 310 } },
    galley: { name: "Galley", note: "The balanced warship: 8 cannons.", hp: 100, scale: 0.9, max: 6.6, turn: 1.0, ports: [0, 2, 4, 6], stars: [0, 2, 4, 6], masts: [[0.4, 6.5]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 43, len: 325 } },
    trireme: { name: "Trireme", note: "Two masts and a stout hull: 10 cannons. Slower.", hp: 130, scale: 1.0, max: 5.8, turn: 0.85, ports: [0, 1, 3, 5, 6], stars: [0, 1, 3, 5, 6], masts: [[-1.6, 6], [2.2, 5.2]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 48, len: 338 } },
    quinquereme: { name: "Quinquereme", note: "A heavy flagship with a deck castle: 12 cannons. Slow and hard to turn.", hp: 175, scale: 1.15, max: 4.8, turn: 0.7, ports: [0, 1, 2, 4, 5, 6], stars: [0, 1, 2, 4, 5, 6], masts: [[-2.4, 6], [0.2, 7], [2.6, 5.2]], shape: "galley", hw: 1.5, lenK: 1, view: { half: 53, len: 346 } },
    battleship: { name: "Battleship", note: "A huge armoured warship with funnels and turrets: 14 cannons, every position on both sides. The toughest and the slowest.", hp: 260, scale: 1.4, max: 4.2, turn: 0.55, ports: [0, 1, 2, 3, 4, 5, 6], stars: [0, 1, 2, 3, 4, 5, 6], masts: [], shape: "battleship", hw: 2.1, lenK: 1.3, view: { half: 58, len: 352 } },
  };
  for (const t of Object.values(TYPES)) t.cannons = t.ports.length + t.stars.length;   // the most a boat can hold
  const allowed = (type, side, i) => TYPES[type][side === "port" ? "ports" : "stars"].includes(i);
  const SAILS = [0x2f8f4a, 0xb3262b, 0x6b3fa0, 0x2f6b8f, 0xc7a21a, 0xe8e0cc, 0x1f1f1f, 0xd9791f];
  const HULLS = [0x7a5230, 0x5a3a20, 0x8a8470, 0x3a4a5a, 0xa0522d, 0x2a2a2a];
  const MAX_SAVED = 4;
  const CANNON_PRICE = 200, START_CANNONS = 6;       // each cannon costs 200 denarii; you start with the six of the starter galley

  const css = (n) => "#" + n.toString(16).padStart(6, "0");
  const count = (d) => d.port.filter(Boolean).length + d.star.filter(Boolean).length;
  const blank = () => Array(SLOTS).fill(false);
  const sides = () => Array(SLOTS).fill(2);               // aim: 0 ahead, 1 ahead and out, 2 straight out of the side, 3 astern and out, 4 astern
  const AIMS = [["Ahead", "fires forward"], ["Ahead & out", "forward and to the side"], ["Side", "straight out of the side"], ["Astern & out", "backward and to the side"], ["Astern", "fires backward"]];
  let pick = null;                                        // the cannon you have selected in the editor: { side, i }
  const standard = () => ({ name: "My galley", type: "galley", sail: 0, hull: 0, port: blank().map((_, i) => [0, 2, 4].includes(i)), star: blank().map((_, i) => [0, 2, 4].includes(i)), pa: sides(), sa: sides() }); // three a side, like the galley you started with

  function sanitize(d) {
    const out = { name: "My ship", type: "galley", sail: 0, hull: 0, port: blank(), star: blank(), pa: sides(), sa: sides() };
    if (!d || typeof d !== "object") return null;
    if (typeof d.name === "string") out.name = d.name.replace(/[^\p{L}\p{N} '\-]/gu, "").slice(0, 20).trim() || "My ship";
    if (TYPES[d.type]) out.type = d.type;
    if (Number.isInteger(d.sail) && d.sail >= 0 && d.sail < SAILS.length) out.sail = d.sail;
    if (Number.isInteger(d.hull) && d.hull >= 0 && d.hull < HULLS.length) out.hull = d.hull;
    let left = TYPES[out.type].cannons;
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) if (Array.isArray(d[side]) && d[side][i] === true && left > 0 && allowed(out.type, side, i)) { out[side][i] = true; left--; }
    for (const k of ["pa", "sa"]) if (Array.isArray(d[k])) for (let i = 0; i < SLOTS; i++) if (Number.isInteger(d[k][i]) && d[k][i] >= 0 && d[k][i] <= 4) out[k][i] = d[k][i];
    if (count(out) === 0) { const t = TYPES[out.type]; out.port[t.ports[0] === undefined ? 0 : t.ports[Math.floor(t.ports.length / 2)]] = t.ports.length > 0; if (t.stars.length) out.star[t.stars[Math.floor(t.stars.length / 2)]] = true; }
    return out;
  }

  let ships = [standard()], sel = 0, draft = null, owned = START_CANNONS;   // owned: how many cannons you have bought (a ship can carry up to that many)
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && Array.isArray(raw.ships)) { const list = raw.ships.map(sanitize).filter(Boolean).slice(0, MAX_SAVED); if (list.length) { ships = list; sel = Math.min(list.length - 1, Math.max(0, raw.sel | 0)); } }
    owned = Math.max(START_CANNONS, Number.isInteger(raw && raw.owned) ? raw.owned : 0, ...ships.map(count)); // ships saved before cannons had a price keep theirs
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ships, sel, owned })); } catch (e) { /* ignore */ } };
  const $s = (id) => document.getElementById(id);
  const clone = (d) => JSON.parse(JSON.stringify(d));

  // what naval.js needs to build and sail a ship
  function def(d) {
    d = sanitize(d) || standard();
    const t = TYPES[d.type];
    return { design: d, hp: t.hp, scale: t.scale, max: t.max, turn: t.turn, sail: SAILS[d.sail], hull: HULLS[d.hull], masts: t.masts, shape: t.shape, hw: t.hw, lenK: t.lenK, castle: d.type === "quinquereme", name: d.name, ports: d.port.slice(), stars: d.star.slice(), paims: d.pa.slice(), saims: d.sa.slice() };
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
      if (!allowed(d.type, side, i)) continue;
      const p = slotPos(side, i), on = d[side][i];
      g.beginPath(); g.arc(p.x, p.y, 13, 0, 6.3);
      g.fillStyle = on ? "#2e2e30" : "rgba(255,255,255,.12)"; g.fill();
      g.lineWidth = 2; g.strokeStyle = on ? "#e2b955" : "rgba(255,255,255,.45)"; g.setLineDash(on ? [] : [4, 3]); g.stroke(); g.setLineDash([]);
      if (on) {                                                    // the barrel, pointing the way the cannon is aimed
        const th = d[side === "port" ? "pa" : "sa"][i] * Math.PI / 4, out = side === "port" ? -1 : 1, ex = p.x + out * Math.sin(th) * 22, ey = p.y - Math.cos(th) * 22;
        g.strokeStyle = "#e2b955"; g.lineWidth = 5; g.lineCap = "round"; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(ex, ey); g.stroke(); g.lineCap = "butt";
      }
      if (pick && pick.side === side && pick.i === i && on) { g.beginPath(); g.arc(p.x, p.y, 18, 0, 6.3); g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.stroke(); }
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
      if (!allowed(d.type, side, i)) continue;
      const y = top + 10 + (i / (SLOTS - 1)) * (len - 22), x = cx + (side === "port" ? -1 : 1) * (half + 1);
      g.beginPath(); g.arc(x, y, d[side][i] ? 2.6 : 1.4, 0, 6.3);
      g.fillStyle = d[side][i] ? "#ffcf4a" : "rgba(255,255,255,.28)"; g.fill();
      if (d[side][i]) {
        g.strokeStyle = "#1a120a"; g.lineWidth = 1; g.stroke();
        const th = d[side === "port" ? "pa" : "sa"][i] * Math.PI / 4, out = side === "port" ? -1 : 1;
        g.strokeStyle = "#ffcf4a"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + out * Math.sin(th) * 6, y - Math.cos(th) * 6); g.stroke();
      }
    }
    return c;
  }

  const hint = (t) => { const h = $s("sy-hint"); if (h) h.textContent = t; };

  function stats() {
    const d = draft, t = TYPES[d.type], n = count(d), p = d.port.filter(Boolean).length, s = d.star.filter(Boolean).length;
    $s("sy-stats").textContent = `${t.name}: hull ${t.hp}, top speed ${Math.round(t.max * 3.6)} km/h, turning ${t.turn >= 1.2 ? "very sharp" : t.turn >= 0.95 ? "good" : t.turn >= 0.8 ? "slow" : "heavy"}. Cannons ${n} of ${t.cannons} (port ${p}, starboard ${s}). Each side fires together; more cannons on a side hit harder but reload slower (${(1.6 + 0.2 * p).toFixed(1)} s port, ${(1.6 + 0.2 * s).toFixed(1)} s starboard).`;
    $s("sy-note").textContent = t.note;
    $s("sy-owned").textContent = `You own ${owned} cannons (you can use them on any ship, and move them for free). Another costs ${CANNON_PRICE} denarii: you have ${Vitals.coins}.`;
  }

  function clickCanvas(e) {
    setView();
    const c = $s("sy-canvas"), r = c.getBoundingClientRect(), x = (e.clientX - r.left) * (c.width / r.width), y = (e.clientY - r.top) * (c.height / r.height);
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) {
      const p = slotPos(side, i);
      if (allowed(draft.type, side, i) && Math.hypot(x - p.x, y - p.y) < 20) {
        const aimKey = side === "port" ? "pa" : "sa";
        if (draft[side][i]) { pick = { side, i }; hint("Cannon selected: choose which way it points below, or take it off."); }
        else if (count(draft) < TYPES[draft.type].cannons) {
          if (count(draft) >= owned) {                              // you must buy another cannon first
            if (Vitals.coins < CANNON_PRICE) { hint(`A new cannon costs ${CANNON_PRICE} denarii and you have ${Vitals.coins}. (You own ${owned} cannons.)`); toast(`A cannon costs ${CANNON_PRICE} denarii.`); refresh(); return; }
            Vitals.coins -= CANNON_PRICE; owned++; save(); Sfx.play("coin");
            hint(`Bought a cannon for ${CANNON_PRICE} denarii. You now own ${owned}. Choose which way it points below.`);
          } else hint("Cannon added. Choose which way it points below.");
          draft[side][i] = true; draft[aimKey][i] = 2; pick = { side, i };
        }
        else {                                                        // at the limit: move the nearest cannon to this spot (same side first)
          let best = null, bd = Infinity;
          for (const s2 of [side, side === "port" ? "star" : "port"]) for (let j = 0; j < SLOTS; j++) if (draft[s2][j]) { const d = Math.abs(j - i) + (s2 === side ? 0 : 3); if (d < bd) { bd = d; best = [s2, j]; } }
          if (best) { const oldAim = draft[best[0] === "port" ? "pa" : "sa"][best[1]]; draft[best[0]][best[1]] = false; draft[side][i] = true; draft[aimKey][i] = oldAim; pick = { side, i }; hint(`Moved a cannon to the ${side === "port" ? "port" : "starboard"} side. (This ship carries at most ${TYPES[draft.type].cannons}.)`); }
        }
        refresh(); return;
      }
    }
    pick = null; refresh();
  }

  // the aim buttons for the selected cannon
  function aimBar() {
    const bar = $s("sy-aim");
    if (!pick || !draft[pick.side][pick.i]) { pick = null; bar.hidden = true; return; }
    bar.hidden = false;
    const key = pick.side === "port" ? "pa" : "sa", cur = draft[key][pick.i];
    $s("sy-aim-title").textContent = `${pick.side === "port" ? "Port" : "Starboard"} cannon ${pick.i + 1} of ${SLOTS} (counting from the bow): which way does it point?`;
    for (const b of bar.querySelectorAll("button[data-aim]")) b.classList.toggle("on", Number(b.dataset.aim) === cur);
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
    aimBar(); draw(); stats();
  }

  function setType(t) {
    if (!TYPES[t] || draft.type === t) return;
    draft.type = t; pick = null;
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) if (draft[side][i] && !allowed(t, side, i)) {   // a cannon whose spot this boat lacks moves to the nearest spot it has
      draft[side][i] = false;
      const list = TYPES[t][side === "port" ? "ports" : "stars"].filter((j) => !draft[side][j]).sort((a, b) => Math.abs(a - i) - Math.abs(b - i));
      if (list.length) { draft[side][list[0]] = true; draft[side === "port" ? "pa" : "sa"][list[0]] = 2; }
    }
    let left = TYPES[t].cannons;
    for (const side of ["port", "star"]) for (let i = 0; i < SLOTS; i++) if (draft[side][i]) { if (left > 0) left--; else draft[side][i] = false; }
    if (count(draft) === 0) draft = sanitize(draft);
    refresh();
  }

  function commit() { draft.name = $s("sy-name").value.trim() || draft.name; draft = sanitize(draft); ships[sel] = clone(draft); save(); if (typeof Account !== "undefined") Account.saveNow(true); return draft; }

  function open() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    if (!Vitals.canFight()) { toast(`You are too wounded to command a ship (health ${Math.round(Vitals.hp)}/100). Press Z to rest and heal.`); return; }
    draft = clone(ships[sel]); pick = null;
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
    const bar = $s("sy-aim"), row2 = bar.querySelector(".sy-aims");
    AIMS.forEach(([name, note], k) => { const b = document.createElement("button"); b.type = "button"; b.dataset.aim = k; b.textContent = name; b.title = `${name}: ${note}`; b.addEventListener("click", () => { if (!pick) return; draft[pick.side === "port" ? "pa" : "sa"][pick.i] = k; hint(`Aimed ${note}.`); refresh(); }); row2.append(b); });
    $s("sy-aim-off").addEventListener("click", () => { if (!pick) return; if (count(draft) <= 1) { hint("A ship needs at least one cannon."); return; } draft[pick.side][pick.i] = false; pick = null; hint("Cannon taken off (you keep it, and can put it on again for free)."); refresh(); });
    $s("sy-canvas").addEventListener("click", clickCanvas);
    $s("sy-name").addEventListener("input", () => { draft.name = $s("sy-name").value.slice(0, 20); });
    $s("sy-save").addEventListener("click", () => { commit(); refresh(); toast(`Saved "${ships[sel].name}".`); });
    $s("sy-new").addEventListener("click", () => { if (ships.length >= MAX_SAVED) return; commit(); const n = clone(ships[sel]); n.name = "New ship"; ships.push(n); sel = ships.length - 1; draft = clone(n); save(); refresh(); $s("sy-name").select(); });
    $s("sy-sail").addEventListener("click", sail);
  }

  return {
    bind, open, def, sail,
    selectedDef: () => def(ships[sel]),
    // for the harbour: a picture and the main figures of each saved ship
    miniAt: (i) => mini(ships[i]),
    info: (i) => { const d = ships[i], t = TYPES[d.type]; return { i, name: d.name, type: t.name, hp: t.hp, kmh: Math.round(t.max * 3.6), cannons: count(d), hold: 3 + Math.floor(t.hp / 35) }; },
    // for the online lobby: choose one of your saved ships (you cannot build one there)
    list: () => ships.map((s, i) => ({ i, label: `${s.name} (${TYPES[s.type].name}, ${count(s)} cannons)` })),
    get sel() { return sel; },
    choose(i) { if (Number.isInteger(i) && i >= 0 && i < ships.length) { sel = i; save(); } },
    onlineDesign: () => { const d = ships[sel]; return { type: d.type, sail: d.sail, hull: d.hull, port: d.port.slice(), star: d.star.slice(), pa: d.pa.slice(), sa: d.sa.slice() }; },
    snapshot: () => ({ ships: clone(ships), sel, owned }),
    restore(raw) {
      if (!raw || !Array.isArray(raw.ships)) return;
      if (Number.isInteger(raw.owned)) owned = Math.max(START_CANNONS, raw.owned);
      const list = raw.ships.map(sanitize).filter(Boolean).slice(0, MAX_SAVED);
      if (list.length) {                                  // keep the ships you made on this device that the cloud save does not have yet
        const merged = list.slice();
        for (const s of ships) if (merged.length < MAX_SAVED && !merged.some((m) => m.name === s.name && JSON.stringify(m) === JSON.stringify(s))) if (!merged.some((m) => m.name === s.name)) merged.push(s);
        ships = merged; sel = Math.min(merged.length - 1, Math.max(0, raw.sel | 0)); owned = Math.max(owned, ...ships.map(count)); save();
      }
    },
    TYPES, SLOTS, SLOT_Z,
  };
})();
