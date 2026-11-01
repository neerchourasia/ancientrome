"use strict";
// Quests from citizens. Each game day a few citizens in each city (four) need help: you can tell them by a yellow ! above their heads. Walk up and press F:
//   a LETTER: take it to another citizen (a blue ? floats over them; look for it) and press F next to them, or
//   a VISIT: go and stand at a landmark (the game draws the way, press G for directions)
// within six minutes, and you are paid in denarii. One quest at a time; a citizen only gives one quest a day. 📜 Quest in the menu shows or gives up your quest.
// Depends on relics.js (so a sparkling citizen is not also a quest giver), vitals.js, home.js (Time) and the globals of game.js (peopleHere, LANDMARKS, startDirections).

const Quests = (() => {
  const T = THREE;
  const GIVERS = 4, REACH = 3.4, TIME = 360;
  const NAMES = {
    rome: ["Marcus", "Lucia", "Gaius", "Julia", "Titus", "Cornelia", "Quintus", "Livia", "Decimus", "Flavia"], delhi: ["Aarav", "Priya", "Rohan", "Meera", "Kabir", "Anaya", "Vikram", "Sana", "Arjun", "Zoya"],
    cancun: ["Mateo", "Sofía", "Diego", "Valentina", "Santiago", "Camila", "Emilio", "Lucía", "Andrés", "Ximena"],
  };
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const nameOf = (i) => { const l = NAMES[city] || NAMES.rome; return l[i % l.length]; };

  let key = "", givers = [], active = null, doneToday = 0, total = 0;
  try { total = Math.max(0, Math.floor(Number(localStorage.getItem("rome-quests-done"))) || 0); } catch (e) { /* storage unavailable */ }
  const marks = [];                                       // reusable markers: yellow ! over the givers, one blue ? over the person to find
  function makeMark(sym, col) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = col; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 4; g.stroke();
    g.fillStyle = "#fff"; g.font = "bold 40px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(sym, 32, 34);
    const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthWrite: false, transparent: true }));
    s.scale.set(1, 1, 1); s.visible = false; scene.add(s); return s;
  }
  const ensureMarks = () => { if (!marks.length) { for (let i = 0; i < GIVERS; i++) marks.push(makeMark("!", "#d9a21b")); marks.push(makeMark("?", "#2a6fd0")); } };

  function choose() {
    const list = peopleHere(), k = `${city}-${Payroll.epoch()}-${list.length}`;
    if (k === key) return;
    key = k; givers = []; doneToday = 0;
    if (!list.length) return;
    const rnd = seeded(`quests-${city}-${Payroll.epoch()}`), skip = new Set((typeof Relics !== "undefined" ? Relics._carriers() : []).map((c) => c.p));
    const used = new Set();
    for (let n = 0, tries = 0; n < GIVERS && tries < 60; tries++) {
      const i = Math.floor(rnd() * list.length);
      if (used.has(i) || skip.has(list[i])) continue;
      used.add(i); givers.push({ p: list[i], i, used: false, seed: Math.floor(rnd() * 1e6) }); n++;
    }
  }

  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    ensureMarks(); choose();
    const t = performance.now() / 1000;
    marks.forEach((m, k) => {
      let p = null;
      if (k < GIVERS) { const g = givers[k]; if (g && !g.used && !active) p = g.p; else if (g && !g.used && active) p = g.p; }
      else if (active && active.kind === "letter" && !active.done) p = active.target;
      if (!p) { m.visible = false; return; }
      m.visible = true; m.position.set(p.x, groundAt(p.x, p.z) + 2.6 + Math.sin(t * 3 + k) * 0.12, p.z);
      const s = 0.9 + Math.sin(t * 4 + k) * 0.08; m.scale.set(s, s, 1);
      m.material.opacity = k < GIVERS && active ? 0.45 : 1;                           // (dimmed while you already have a quest)
    });
    if (active) {
      active.left -= dt;
      if (active.left <= 0) { toast("Time is up: the quest is over."); finish(false); }
      else if (active.kind === "visit" && Math.hypot(player.x - active.lm.x, player.z - active.lm.z) < (active.lm.r || 20) + 8) complete();
      showHud();
    } else hideHud();
  }

  // ---------------------------------------------------------------- a quest giver
  function giverAt() {
    if (!started || mode !== "walk" || panelOpen) return null;
    let best = null, bd = REACH;
    for (const g of givers) { if (g.used) continue; const d = Math.hypot(g.p.x - player.x, g.p.z - player.z); if (d < bd) { bd = d; best = g; } }
    return best;
  }
  function targetAt() {
    if (!active || active.kind !== "letter" || active.done || !started || mode !== "walk" || panelOpen) return null;
    return Math.hypot(active.target.x - player.x, active.target.z - player.z) < REACH ? active : null;
  }
  const at = () => giverAt() || targetAt();
  const promptText = () => (targetAt() ? `F: give the letter to ${active.targetName}` : giverAt() ? (active ? "This citizen needs help (finish your quest first)" : "F: this citizen needs help") : "");

  let cur = null;
  const $q = (id) => document.getElementById(id);
  function offer(g) {
    const rnd = seeded(`q-${g.seed}`), list = peopleHere(), giverName = nameOf(g.i);
    let q;
    if (rnd() < 0.5 && list.length > 8) {                                                  // a letter for another citizen, a good walk away
      let j = Math.floor(rnd() * list.length), tries = 0;
      while ((list[j] === g.p || Math.hypot(list[j].x - g.p.x, list[j].z - g.p.z) < 90) && tries++ < 40) j = Math.floor(rnd() * list.length);
      const d = Math.hypot(list[j].x - g.p.x, list[j].z - g.p.z);
      q = { kind: "letter", target: list[j], targetName: nameOf(j + 3), reward: Math.min(160, Math.round((30 + d / 8) / 5) * 5), text: `${giverName}: Please take this letter to ${nameOf(j + 3)}. Look for the blue ? floating over their head, then press F beside them.` };
    } else {
      const lms = LANDMARKS.filter((l) => !l.home && !l.game && Math.hypot(l.x - g.p.x, l.z - g.p.z) > 80), lm = lms[Math.floor(rnd() * lms.length)] || LANDMARKS[0];
      const d = Math.hypot(lm.x - g.p.x, lm.z - g.p.z);
      q = { kind: "visit", lm, reward: Math.min(160, Math.round((35 + d / 8) / 5) * 5), text: `${giverName}: I would love news of ${lm.name}. Go and stand there for me, and I will pay you. (Press G for directions.)` };
    }
    q.giver = g; q.left = TIME; q.done = false;
    return q;
  }
  function open() {
    const t = targetAt(); if (t) { deliver(); return; }
    const g = giverAt(); if (!g || active) { if (g && active) toast("Finish your quest first."); return; }
    cur = offer(g);
    $q("qs-text").textContent = cur.text; $q("qs-pay").textContent = `Reward: ${cur.reward} denarii · time: ${Math.round(TIME / 60)} minutes`;
    openPanel("#quest");
  }
  function accept() {
    if (!cur || active) return;
    active = cur; cur.giver.used = true; cur = null; closePanels();
    toast(active.kind === "letter" ? `Quest: take the letter to ${active.targetName}. Look for the blue ?` : `Quest: go to ${active.lm.name}.`);
    if (active.kind === "visit" && typeof startDirections === "function") { try { startDirections(active.lm); } catch (e) { /* ignore */ } }
  }
  function deliver() { if (active && active.kind === "letter" && !active.done) complete(); }
  function complete() {
    const q = active; if (!q || q.done) return;
    q.done = true; q.reward = Math.round(q.reward * (typeof PetPerks !== "undefined" ? PetPerks.mul("quest") : 1)); Vitals.coins += q.reward; Sfx.play("discover"); doneToday++; total++; try { localStorage.setItem("rome-quests-done", String(total)); } catch (e) { /* ignore */ }
    toast(`Quest done! +${q.reward} denarii.`); finish(true);
  }
  function finish(ok) { active = null; hideHud(); }
  function giveUp() {
    if (!active) { toast("No quest right now. Look for a citizen with a yellow !."); return; }
    Dialog.confirm("Give up your quest?").then((yes) => { if (yes) { toast("You gave up the quest."); finish(false); } });
  }

  let hud = null;
  const hideHud = () => { if (!hud) hud = document.getElementById("quest-hud"); if (hud) hud.hidden = true; };
  function showHud() {
    if (!hud) hud = document.getElementById("quest-hud"); if (!hud) return;
    const s = Math.max(0, Math.ceil(active.left)), what = active.kind === "letter" ? `take the letter to ${active.targetName} (blue ?)` : `go to ${active.lm.name}`;
    hud.hidden = false; hud.textContent = `📜 ${what} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} · +${active.reward}`;
  }

  function bind() {
    if ($q("qs-accept")) { $q("qs-accept").addEventListener("click", accept); $q("qs-no").addEventListener("click", () => { cur = null; closePanels(); }); }
    const b = $q("btn-quest"); if (b) b.addEventListener("click", giveUp);
  }

  return { bind, update, at, open, promptText, get total() { return total; }, get active() { return active; }, _givers: () => givers };
})();
