"use strict";
// The class report: when a teacher has switched on "watch what each student does" (class.html), the link has a class id (cid=...) and this file, in each student's browser, tells the game server how the
// student is getting on, every five seconds, so the teacher's dashboard (class-live.html) can show it. The students are told: the bar at the bottom of the screen says "your teacher can see your
// progress". What is sent: the name the student chose for their character, the city and era, the money, the sights found, how many shops they walked into, errands and goods made, how many achievements,
// the hunt's progress, and a few short lines of what they did ("found the Pantheon", "walked into a tavern"). Never chat, never anything typed, no addresses. The server keeps it in memory for ten hours
// at most (server.py, "classes"). Without a class id nothing is sent at all (online.js). Depends on online.js, hunt.js, shopkeep.js and the globals of game.js.

const ClassReport = (() => {
  const on = () => typeof CLASSMODE !== "undefined" && CLASSMODE.on && !!CLASSMODE.cid;
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  let sid = "", base = null, queue = [], last = { city: "", era: "", ach: 0, sights: null, shops: 0 };
  try { sid = localStorage.getItem("rome-csid") || ""; } catch (e) { /* storage unavailable */ }
  try { const b = localStorage.getItem("rome-cbase"); if (b !== null && Number.isFinite(Number(b))) base = Number(b); } catch (e) { /* storage unavailable */ }
  if (!/^[0-9a-f]{12}$/.test(sid)) { sid = hex(6); try { localStorage.setItem("rome-csid", sid); } catch (e) { /* ignore */ } }

  let soon = 0;
  const note = (text) => { if (!on()) return; queue.push(String(text).slice(0, 80)); if (queue.length > 20) queue.shift(); if (!soon) soon = setTimeout(() => { soon = 0; tick(); }, 1500); };       // (what they did is reported a moment later, not at the next ten seconds)
  const nameOf = (id) => { try { const l = ALL_LANDMARKS.find((x) => x.id === id); return l ? l.name : id; } catch (e) { return id; } };

  function snapshot() {
    const st = typeof Shopkeep !== "undefined" ? Shopkeep.stats : {}, coins = Math.round(Vitals.coins);
    if (base === null) { base = coins; try { localStorage.setItem("rome-cbase", String(base)); } catch (e) { /* ignore */ } }      // (the money they started the lesson with: the gain is measured from it)
    return {
      city, era, coins, gain: coins - base, sights: [...discovered].slice(0, 80), shops: st.visited || 0, errands: st.done || 0, crafted: st.crafted || 0,
      ach: typeof Achievements !== "undefined" ? Achievements.count : 0, hunt: typeof Hunt !== "undefined" ? Hunt.progress : null,
    };
  }
  function tick() {
    if (!on() || typeof started === "undefined" || !started || !Character.exists) return;
    const d = snapshot();
    if (last.sights === null) { last.sights = new Set(d.sights); last.city = d.city; last.era = d.era; last.ach = d.ach; note("started playing"); }
    for (const id of d.sights) if (!last.sights.has(id)) { last.sights.add(id); note(`found ${nameOf(id)}`); }
    if (d.city !== last.city) { last.city = d.city; note(`went to ${d.city === "cancun" ? "Cancún" : d.city === "delhi" ? "Old Delhi" : d.city === "beijing" ? "Beijing" : "Rome"}`); }
    if (d.era !== last.era) { last.era = d.era; note(`switched to ${d.era === "modern" ? "today" : "the ancient city"}`); }
    if (d.ach > last.ach) { last.ach = d.ach; note("earned an achievement"); }
    if (d.hunt && d.hunt.done && !last.huntDone) { last.huntDone = true; note(`finished the hunt in ${Math.floor(d.hunt.done / 60)}:${String(d.hunt.done % 60).padStart(2, "0")}`); }
    Online.classReport(CLASSMODE.cid, sid, Character.name, d, queue.splice(0, 8), answer);
  }
  // What the teacher can do to the whole class (the dashboard's controls): the answer to every report carries it. A message appears on the screen once, pausing freezes the game and puts a
  // screen over it until the teacher resumes (the browser then asks every two seconds, so resuming is quick), and, if the teacher switched it on, the class leaderboard is shown.
  const $c = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  let seenMsg = 0, fast = 0;
  try { seenMsg = Number(localStorage.getItem("rome-cmsg")) || 0; } catch (e) { /* storage unavailable */ }
  const el = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; };
  function showMessage(text) {
    const box = $c("class-msg"); if (!box) return;
    const b = el("button", "×"); b.type = "button"; b.setAttribute("aria-label", "Close"); b.addEventListener("click", () => { box.hidden = true; });
    box.replaceChildren(el("strong", tr("Your teacher:")), el("span", " " + text), b); box.hidden = false;
    if (typeof Sfx !== "undefined") Sfx.play("discover");
    clearTimeout(showMessage.t); showMessage.t = setTimeout(() => { box.hidden = true; }, 45000);
  }
  function setPaused(p) {
    if (!!window.CLASS_PAUSED === p) return;
    window.CLASS_PAUSED = p;
    const o = $c("class-pause"); if (o) o.hidden = !p;
    if (p) { if (document.pointerLockElement) document.exitPointerLock(); if (typeof keys !== "undefined") keys.clear(); }
    if (p && !fast) fast = setInterval(tick, 2000); else if (!p && fast) { clearInterval(fast); fast = 0; }
  }
  function showBoard(b) {
    const box = $c("class-board"); if (!box) return;
    if (!b) { box.hidden = true; return; }
    const me = typeof Character !== "undefined" ? Character.name : "";
    const list = (title, rows, plus) => {
      const h = el("strong", tr(title)), ol = el("ol");
      if (!rows.length) ol.append(el("li", "-"));
      rows.forEach(([name, n], i) => { const li = el("li", `${["🥇", "🥈", "🥉"][i] || ""} ${name} ${plus && n > 0 ? "+" : ""}${n}`); if (name === me) li.className = "me"; ol.append(li); });
      const d = el("div"); d.append(h, ol); return d;
    };
    box.replaceChildren(el("h3", tr("🏆 Class leaderboard")), list("Richest", b.rich || [], false), list("Biggest gain", b.gain || [], true)); box.hidden = false;
  }
  function answer(a) {
    if (a.msg && a.msg.id > seenMsg) { seenMsg = a.msg.id; try { localStorage.setItem("rome-cmsg", String(seenMsg)); } catch (e) { /* ignore */ } if (a.msg.text) showMessage(a.msg.text); }
    setPaused(!!a.paused);
    showBoard(a.board || null);
  }
  // while the class is paused nothing in the game gets the keys or the mouse
  for (const type of ["keydown", "keyup", "mousedown", "mouseup", "wheel", "contextmenu", "click", "touchstart"]) addEventListener(type, (e) => { if (window.CLASS_PAUSED) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  setInterval(tick, 5000);
  const first = setInterval(() => { if (typeof started !== "undefined" && started && Character.exists) { clearInterval(first); tick(); } }, 500);        // (the first report goes as soon as the character is made)
  addEventListener("pagehide", () => { if (on()) { note("left the page"); tick(); } });
  return { note, tick };
})();
