"use strict";
// The class report: when a teacher has switched on "watch what each student does" (class.html), the link has a class id (cid=...) and this file, in each student's browser, tells the game server how the
// student is getting on, every ten seconds, so the teacher's dashboard (class-live.html) can show it. The students are told: the bar at the bottom of the screen says "your teacher can see your
// progress". What is sent: the name the student chose for their character, the city and era, the money, the sights found, how many shops they walked into, errands and goods made, how many achievements,
// the hunt's progress, and a few short lines of what they did ("found the Pantheon", "walked into a tavern"). Never chat, never anything typed, no addresses. The server keeps it in memory for ten hours
// at most (server.py, "classes"). Without a class id nothing is sent at all (online.js). Depends on online.js, hunt.js, shopkeep.js and the globals of game.js.

const ClassReport = (() => {
  const on = () => typeof CLASSMODE !== "undefined" && CLASSMODE.on && !!CLASSMODE.cid;
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  let sid = "", queue = [], last = { city: "", era: "", ach: 0, sights: null, shops: 0 };
  try { sid = localStorage.getItem("rome-csid") || ""; } catch (e) { /* storage unavailable */ }
  if (!/^[0-9a-f]{12}$/.test(sid)) { sid = hex(6); try { localStorage.setItem("rome-csid", sid); } catch (e) { /* ignore */ } }

  const note = (text) => { if (!on()) return; queue.push(String(text).slice(0, 80)); if (queue.length > 20) queue.shift(); };
  const nameOf = (id) => { try { const l = ALL_LANDMARKS.find((x) => x.id === id); return l ? l.name : id; } catch (e) { return id; } };

  function snapshot() {
    const st = typeof Shopkeep !== "undefined" ? Shopkeep.stats : {};
    return {
      city, era, coins: Math.round(Vitals.coins), sights: [...discovered].slice(0, 80), shops: st.visited || 0, errands: st.done || 0, crafted: st.crafted || 0,
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
    Online.classReport(CLASSMODE.cid, sid, Character.name, d, queue.splice(0, 8));
  }
  setInterval(tick, 10000);
  setTimeout(tick, 4000);
  addEventListener("pagehide", () => { if (on()) { note("left the page"); tick(); } });
  return { note, tick };
})();
