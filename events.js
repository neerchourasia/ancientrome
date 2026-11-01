"use strict";
// Race events: 🏁 Events in the menu. Each city has three timed courses:
//   STREET RACE: drive any road vehicle through six gates (tall yellow beams) placed at famous places, as fast as you can. The clock starts at the first gate.
//   AIR RACE:    fly any aircraft through the same six gates, high up (fly through the beam about 45 m up). The clock starts at the first gate.
//   METRO TRIAL: drive the metro train yourself from one end of the line to the other and stop properly in the last station. The clock starts when you pull away.
// Press Start in the box, then get going. Getting out of the vehicle ends the run. A medal (gold, silver, bronze) is judged against a par time, and pays 75, 150 or 300
// denarii the first time you win it. Your best times are kept with your account, and the server lists the fastest players of each course.
// Depends on car.js (Car.state, Car.current, Car.driving, Car.MODELS), subway.js, online.js, vitals.js and the globals of game.js (LANDMARKS, city, scene, player).

const Events = (() => {
  const T = THREE;
  const KEY = "rome-events", ALT = 45, MEDALS = [["🥇 Gold", 1, 300], ["🥈 Silver", 1.4, 150], ["🥉 Bronze", 2, 75]];
  const KINDS = { car: { name: "Street race", par: 11, ring: 22 }, air: { name: "Air race", par: 38, ring: 26 }, metro: { name: "Metro trial", par: 16, ring: 0 } };
  let best = {}, tops = {}, active = null;           // best: course id -> { ms, medal (0 = none, 1 gold, 2 silver, 3 bronze) }
  const clean = (raw) => { const o = {}; if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (/^(rome|delhi|cancun)-(car|air|metro)$/.test(k) && v && Number.isFinite(v.ms) && v.ms > 0) o[k] = { ms: Math.round(v.ms), medal: Math.max(0, Math.min(3, Math.floor(Number(v.medal) || 0))) }; return o; };
  try { best = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(best)); } catch (e) { /* ignore */ } };
  const $e = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "social", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const fmt = (ms) => { const s = ms / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`; };
  const medalFor = (c, ms) => { const par = c.par * 1000; for (let i = 0; i < MEDALS.length; i++) if (ms <= par * MEDALS[i][1]) return i + 1; return 0; };

  // ---------------------------------------------------------------- the courses of this city
  function gates() {                                           // six well-spaced places, in a loop around the city (the same every time)
    const lms = LANDMARKS.filter((l) => !l.home && !l.game && Number.isFinite(l.x) && Number.isFinite(l.z));
    if (lms.length < 6) return [];
    const cx = lms.reduce((a, l) => a + l.x, 0) / lms.length, cz = lms.reduce((a, l) => a + l.z, 0) / lms.length;
    lms.sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
    const out = [];
    for (let i = 0; i < 6; i++) { const l = lms[Math.floor((i * lms.length) / 6)], p = l.stand || [l.x, l.z]; out.push({ x: p[0], z: p[1], name: l.name }); }
    return out;
  }
  const lengthOf = (g) => g.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - g[i].x, p.z - g[i].z), 0);
  function courses() {
    const list = [], g = gates();
    if (g.length === 6) {
      const len = Math.round(lengthOf(g));
      for (const kind of ["car", "air"]) list.push({ id: `${city}-${kind}`, kind, gates: g, len, par: len / KINDS[kind].par });
    }
    const L = typeof Subway !== "undefined" ? Subway.LINES[city] : null;
    if (L && era === "modern") {
      const a = L.stations[0], b = L.stations[L.stations.length - 1], len = Math.abs(b.s - a.s);
      list.push({ id: `${city}-metro`, kind: "metro", line: L, from: a, to: b, len, par: len / KINDS.metro.par + 10 });
    }
    return list;
  }

  // ---------------------------------------------------------------- beams
  const beams = [];
  function makeBeam(col) {
    const g = new T.Group(), m = new T.Mesh(new T.CylinderGeometry(3, 3, 90, 16, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    m.position.y = 45; g.add(m);
    const ring = new T.Mesh(new T.TorusGeometry(11, 0.7, 8, 28), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false }));
    ring.position.y = ALT; g.add(ring); g.userData.ring = ring;
    g.visible = false; scene.add(g); return g;
  }
  function placeBeams() {
    if (!beams.length) beams.push(makeBeam(0xffd34a), makeBeam(0x4ad8ff));
    beams.forEach((b, i) => {
      const p = active && active.course.kind !== "metro" ? active.course.gates[active.gate + i] : null;
      b.visible = !!p;
      if (!p) return;
      b.position.set(p.x, groundAt(p.x, p.z), p.z);
      b.userData.ring.visible = active.course.kind === "air";
      const nx = active.course.gates[active.gate + i + 1] || active.course.gates[active.gate + i - 1];
      if (nx) b.userData.ring.rotation.y = Math.atan2(nx.x - p.x, nx.z - p.z);
    });
  }

  // ---------------------------------------------------------------- a run
  function start(c) {
    const st = Car.state(), M = Car.current ? Car.MODELS[Car.current] : null;
    if (c.kind === "metro") {
      if (!(st && M && M.rail && Subway.underground && !Subway.auto)) { toast("Go down to the metro (a blue METRO sign), press F to drive a train yourself, then press Start at an end station."); return; }
    } else if (!(st && M && !M.rail && !!M.fly === (c.kind === "air"))) { toast(c.kind === "air" ? "Get into an aircraft first (and take off), then press Start." : "Get into a car or other road vehicle first, then press Start."); return; }
    active = { course: c, gate: 0, t0: 0, running: false, ms: 0 };
    closePanels(); placeBeams();
    toast(c.kind === "metro" ? `Metro trial: pull away from an end of the line and stop in the station at the other end.` : `${KINDS[c.kind].name}: go through the first gate (${c.gates[0].name}) to start the clock.`);
  }
  function cancel(why) { if (!active) return; active = null; placeBeams(); hud(""); if (why) toast(why); }
  function hud(text) { const h = $e("event-hud"); if (!h) return; h.hidden = !text; h.textContent = text; }

  function finish(ms) {
    ms = Math.round(ms);
    const c = active.course, medal = medalFor(c, ms), prev = best[c.id];
    const had = prev && prev.medal ? MEDALS[prev.medal - 1][2] : 0, now = medal ? MEDALS[medal - 1][2] : 0, pay = Math.max(0, now - had);
    const record = !prev || ms < prev.ms;
    best[c.id] = { ms: record ? ms : prev.ms, medal: prev && prev.medal && (!medal || prev.medal < medal) ? prev.medal : medal }; save();
    if (pay) { Vitals.coins += pay; Sfx.play("coin"); }
    toast(`${KINDS[c.kind].name} done in ${fmt(ms)}! ${medal ? MEDALS[medal - 1][0] : "No medal this time"}${pay ? ` +${pay} denarii` : ""}${record && prev ? " · a new best!" : ""}`);
    if (Online.connected && Account.loggedIn) { send({ a: "ev_time", course: c.id, ms, len: Math.round(c.len) }); }
    active = null; placeBeams(); hud("");
  }

  function update(dt) {
    if (!active || typeof started === "undefined" || !started) return;
    const c = active.course, st = Car.state(), M = Car.current ? Car.MODELS[Car.current] : null;
    if (!st || !M || (c.kind === "metro" ? !M.rail : (M.rail || !!M.fly !== (c.kind === "air")))) { cancel("You left the vehicle: the race is over."); return; }
    if (active.running) active.ms += dt * 1000;
    const secs = fmt(active.ms);
    if (c.kind === "metro") {
      if (!Subway.underground || Subway.auto) { cancel("The metro trial is over."); return; }
      const s = c.line.axis === "x" ? st.x : st.z, A = c.from.s, B = c.to.s;
      if (!active.running) {
        const atA = Math.abs(s - A) < 8, atB = Math.abs(s - B) < 8;
        if ((atA || atB) && Math.abs(st.v) > 1.5) { active.running = true; active.target = atA ? B : A; active.ms = 0; toast("Go!"); }
        hud(`🏁 Metro trial · stand at an end of the line and pull away`);
      } else {
        const d = Math.abs(active.target - s);
        hud(`🏁 Metro trial · ${secs} · ${Math.round(d)} m to go · stop in the station`);
        if (d < 6 && Math.abs(st.v) < 0.3 && active.ms > 8000) finish(active.ms);
      }
      return;
    }
    const g = c.gates[active.gate], d = Math.hypot(st.x - g.x, st.z - g.z), R = KINDS[c.kind].ring + 4;
    const hit = d < R && (c.kind === "car" || Math.abs((st.alt || 0) - ALT) < 30);
    if (hit) {
      if (!active.running) { active.running = true; active.ms = 0; toast("Go!"); Sfx.play("discover"); }
      else Sfx.play("discover");
      if (active.gate === c.gates.length - 1) { finish(active.ms); return; }
      active.gate++; placeBeams();
    }
    const nx = c.gates[active.gate], nd = Math.hypot(st.x - nx.x, st.z - nx.z);
    hud(`🏁 ${KINDS[c.kind].name} · gate ${active.gate + (active.running ? 1 : 0)}/${c.gates.length} · ${active.running ? secs : "go through the first gate"} · ${nx.name}: ${Math.round(nd)} m${c.kind === "air" ? ` · fly through it ${ALT} m up` : ""}`);
  }

  // ---------------------------------------------------------------- the box
  function render() {
    const box = $e("ev-list"); box.replaceChildren();
    const list = courses();
    if (!list.length) box.append(el("p", "No race courses in this city yet.", "dnote"));
    for (const c of list) {
      const b = best[c.id], row = el("div", undefined, "ev-row"), info = el("div", undefined, "ev-info");
      const gold = Math.round(c.par), name = `${KINDS[c.kind].name} · ${Math.round(c.len)} m`;
      info.append(el("strong", name), el("small", `Gold ${fmt(gold * 1000)} · silver ${fmt(gold * 1400)} · bronze ${fmt(gold * 2000)}`),
        el("small", b ? `Your best: ${fmt(b.ms)} ${b.medal ? MEDALS[b.medal - 1][0] : ""}` : "No time yet"));
      const t = tops[c.id];
      if (t && t.length) info.append(el("small", "Fastest: " + t.slice(0, 3).map(([n, ms], i) => `${i + 1}. ${n} ${fmt(ms)}`).join(" · ")));
      const go = el("button", active && active.course.id === c.id ? "Cancel" : "Start"); go.type = "button";
      go.addEventListener("click", () => { if (active && active.course.id === c.id) { cancel("Race cancelled."); closePanels(); } else start(c); });
      row.append(info, go); box.append(row);
    }
  }
  function open() {
    render(); openPanel("#events");
    if (Online.connected && Account.loggedIn) for (const c of courses()) send({ a: "ev_top", course: c.id });
  }
  function on(m) { if (m.t === "ev_top" && typeof m.course === "string" && Array.isArray(m.list)) { tops[m.course] = m.list.filter((r) => Array.isArray(r) && typeof r[0] === "string" && Number.isFinite(r[1])); if ($e("events").classList.contains("show")) render(); } }
  function bind() { const b = $e("btn-events"); if (b) b.addEventListener("click", open); }

  return {
    bind, update, on, open, courses,
    snapshot: () => JSON.parse(JSON.stringify(best)),
    restore(raw) { best = clean(raw); save(); },
    merge(raw) { const o = clean(raw); for (const [k, v] of Object.entries(o)) { const m = best[k]; if (!m) best[k] = v; else { m.ms = Math.min(m.ms, v.ms); if (v.medal && (!m.medal || v.medal < m.medal)) m.medal = v.medal; } } save(); },
    get active() { return active; },
    _medalFor: medalFor,
  };
})();
