"use strict";
// Player-made challenges: "beat my time to the Colosseum". 🏁 Challenge a friend (in the menu) lets you pick a sight in the city you are in, then times you from where you stand to the sight (walk, run, ride:
// anything goes). When you arrive you get a link; whoever opens it starts at the same spot, the same city and the same era, with your time to beat. Their clock starts when they first move and stops
// when they reach the sight. The link carries everything (the sight, the starting spot, the time, the era, your character name): there is no server, no account and no prize, and the time is on the
// honour of the one who made it. After a challenge the finish screen offers a link to send back ("now beat mine"). Not in class mode (a class sends nothing outside the lesson).
// Depends on game.js (ALL_LANDMARKS, city, era, player, placeAt, arriveIn, setPeriod, openPanel, toast, started, Character) at run time.

const Challenge = (() => {
  const KEY = "rome-chal";                    // a challenge link waiting for the game to be ready (kept for this browser tab: logging in can reload the page)
  const PERIODS = ["ancient", "mid", "modern"];
  const $c = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const classroom = () => !!(window.CLASSMODE && CLASSMODE.on);
  const lm = (id) => ALL_LANDMARKS.find((l) => l.id === id && !l.home && !l.game);
  const homeOf = (id) => (id.startsWith("d-") ? "delhi" : id.startsWith("c-") ? "cancun" : id.startsWith("b-") ? "beijing" : "rome");
  const clean = (s) => String(s || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 16);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

  // the challenge in the link of this page, cleaned (null when there is none or it does not make sense)
  function fromQuery(q) {
    const id = q.get("ch") || "", per = q.get("cp") || "ancient";
    const cx = parseFloat(q.get("cx")), cz = parseFloat(q.get("cz")), ct = parseInt(q.get("ct"), 10);
    if (!/^[a-z0-9-]{1,24}$/.test(id) || !PERIODS.includes(per) || !Number.isFinite(cx) || !Number.isFinite(cz) || Math.abs(cx) > 5000 || Math.abs(cz) > 5000) return null;
    return { id, per, cx, cz, ct: Number.isFinite(ct) ? Math.max(0, Math.min(36000, ct)) : 0, by: clean(q.get("cb")) };
  }
  let pending = null;
  if (!classroom()) {
    try {
      const p = fromQuery(new URLSearchParams(location.search));
      if (p) {
        pending = p;
        try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage unavailable */ }
        const rest = new URLSearchParams(location.search);
        for (const k of ["ch", "cx", "cz", "ct", "cp", "cb"]) rest.delete(k);
        history.replaceState(null, "", location.pathname + (rest.toString() ? "?" + rest.toString() : "") + location.hash);
      } else { const s = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (s && s.id) pending = fromQuery(new URLSearchParams({ ch: s.id, cp: s.per, cx: s.cx, cz: s.cz, ct: s.ct, cb: s.by })); }
    } catch (e) { /* ignore */ }
  }
  const forget = () => { pending = null; try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } };

  // the run in progress: { l: sight, city, per, cx, cz, t0 (0 until the clock starts), beat: seconds to beat, by: who made it, taken: it came from a link }
  let run = null, last = 0, hud = null, lastLink = "";

  function linkFor(r, secs) {
    const q = new URLSearchParams({ ch: r.l.id, cx: Math.round(r.cx), cz: Math.round(r.cz), ct: Math.round(secs), cp: r.per, cb: clean(Character.name) });
    return `${location.origin}/?${q.toString()}`;
  }

  function showHud() {
    hud = hud || $c("chal-hud");
    if (!hud) return;
    if (!run) { hud.hidden = true; return; }
    const lines = [];
    const h = document.createElement("strong"); h.textContent = `🏁 ${tr("To")} ${tr(run.l.name)}`; lines.push(h);
    const t = document.createElement("div"); t.className = "ch-time";
    t.textContent = run.t0 ? mmss((Date.now() - run.t0) / 1000) : tr("Your clock starts when you move");
    lines.push(t);
    if (run.beat) { const b = document.createElement("div"); b.className = "ch-beat"; b.textContent = `${run.by || tr("Your friend")}: ${mmss(run.beat)}`; lines.push(b); }
    const x = document.createElement("button"); x.type = "button"; x.className = "ch-x"; x.textContent = "✕"; x.title = tr("Stop this challenge"); x.addEventListener("click", cancel); lines.push(x);
    hud.replaceChildren(...lines); hud.hidden = false;
  }

  function begin(l) {                      // you start a run of your own at the spot where you stand
    run = { l, city, per: periodNow(), cx: player.x, cz: player.z, t0: Date.now(), beat: 0, by: "", taken: false };
    closePanels(); showHud(); toast(`🏁 ${tr("Go! Get to")} ${tr(l.name)}`);
  }

  function arm(p, l) {                           // a friend's challenge: the clock starts when you first move
    run = { l, city, per: periodNow(), cx: player.x, cz: player.z, t0: 0, beat: p.ct, by: p.by, taken: true };
    showHud();
    toast(`🏁 ${p.by || tr("Your friend")} ${tr("challenges you")}: ${tr("reach")} ${tr(l.name)}${p.ct ? ` ${tr("in under")} ${mmss(p.ct)}` : ""}. ${tr("Your clock starts when you move!")}`);
  }

  function cancel() { if (run) { run = null; showHud(); toast(tr("Challenge stopped")); } }

  function finish() {
    const secs = Math.max(1, Math.round((Date.now() - run.t0) / 1000)), r = run;
    run = null; showHud();
    lastLink = linkFor(r, secs);
    const body = $c("cd-body"), p = (t) => { const e = document.createElement("p"); e.textContent = t; return e; };
    const lines = [p(`${tr("You reached")} ${tr(r.l.name)} ${tr("in")} ${mmss(secs)}.`)];
    if (r.taken && r.beat) {
      const who = r.by || tr("Your friend"), diff = Math.abs(r.beat - secs);
      lines.push(p(secs < r.beat ? `🏆 ${tr("You beat")} ${who}! ${diff} ${tr("seconds faster than")} ${mmss(r.beat)}.` : secs === r.beat ? `🤝 ${tr("A tie with")} ${who} (${mmss(r.beat)}).` : `${who} ${tr("was faster")}: ${mmss(r.beat)}. ${diff} ${tr("seconds to find.")}`));
    }
    lines.push(p(tr(r.taken ? "Send this link back to challenge them to beat your time:" : "Send this link to a friend and challenge them to beat your time:")));
    const inp = document.createElement("input"); inp.type = "text"; inp.readOnly = true; inp.value = lastLink; inp.addEventListener("focus", () => inp.select()); lines.push(inp);
    body.replaceChildren(...lines);
    $c("cd-again").hidden = !r.taken;
    $c("cd-share").hidden = !navigator.share;
    again = r.taken ? { p: { id: r.l.id, per: r.per, cx: r.cx, cz: r.cz, ct: r.beat, by: r.by }, l: r.l } : null;
    openPanel("#chal-done");
    if (typeof Sfx !== "undefined") Sfx.play("medal");
  }
  let again = null;

  function update(dt) {
    if (!run || typeof started === "undefined" || !started) return;
    last -= dt; if (last > 0) return; last = 0.15;
    if (city !== run.city || periodNow() !== run.per) { cancel(); return; }          // (leaving the city or the era ends it)
    if (!run.t0 && Math.hypot(player.x - run.cx, player.z - run.cz) > 2) { run.t0 = Date.now(); }
    if (run.t0 && Math.hypot(player.x - run.l.x, player.z - run.l.z) < run.l.r) { finish(); return; }
    showHud();
  }

  // the picker: the sights of the city you are in (and the era), the nearest first
  function open() {
    if (classroom()) return;
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    const here = ALL_LANDMARKS.filter((l) => !l.home && !l.game && homeOf(l.id) === city && (!l.only || l.only === era) && Math.hypot(player.x - l.x, player.z - l.z) > l.r)
      .sort((a, b) => Math.hypot(player.x - a.x, player.z - a.z) - Math.hypot(player.x - b.x, player.z - b.z));
    const ul = $c("cp-list");
    ul.replaceChildren(...here.map((l) => {
      const li = document.createElement("li"), b = document.createElement("button"), d = Math.round(Math.hypot(player.x - l.x, player.z - l.z));
      b.type = "button"; b.textContent = `${tr(l.name)} · ${d} m`; b.addEventListener("click", () => begin(l)); li.append(b); return li;
    }));
    $c("cp-empty").hidden = !!here.length;
    openPanel("#chal-pick");
  }

  // a link has been opened: once the game is running and the character exists, go to the spot and arm the challenge
  function accept() {
    if (!pending) return;
    const p = pending, l = lm(p.id);
    forget();
    if (!l) { toast(tr("That challenge is not in this version of the game")); return; }
    if (p.per !== periodNow()) setPeriod(p.per);
    const home = homeOf(l.id);
    if (home !== city) arriveIn(home, null);
    setTimeout(() => { placeAt(p.cx, p.cz, yawToward(p.cx, p.cz, l.x, l.z)); arm(p, l); }, 800);          // (after the city has been built)
  }
  const wait = setInterval(() => {
    if (!pending) { clearInterval(wait); return; }
    if (typeof started === "undefined" || !started || typeof Character === "undefined" || !Character.exists || creatorOpen || panelOpen) return;
    clearInterval(wait); accept();
  }, 500);

  function bind() {
    const b = $c("btn-chal");
    if (classroom()) { if (b) b.hidden = true; return; }
    if (b) b.addEventListener("click", open);
    $c("cd-copy").addEventListener("click", () => {
      const done = () => toast(tr("Challenge link copied: send it to a friend"));
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastLink).then(done, () => toast(tr("Press Ctrl+C (or Cmd+C) to copy the link")));
      else toast(tr("Press Ctrl+C (or Cmd+C) to copy the link"));
    });
    $c("cd-share").addEventListener("click", () => navigator.share({ title: "Time Machine", text: `Beat my time in Time Machine: ${Character.name}`, url: lastLink }).catch(() => { /* cancelled */ }));
    $c("cd-again").addEventListener("click", () => { if (!again) return; closePanels(); const a = again; again = null; placeAt(a.p.cx, a.p.cz, yawToward(a.p.cx, a.p.cz, a.l.x, a.l.z)); arm(a.p, a.l); });
    $c("cd-close").addEventListener("click", closePanels);
    const intro = $c("chal-intro");
    if (intro && pending) {
      const l = lm(pending.id);
      if (l) { intro.textContent = `🏁 ${pending.by || "A friend"} challenges you: reach ${l.name}${pending.ct ? ` in under ${mmss(pending.ct)}` : ""}. Press Play!`; intro.hidden = false; }
    }
  }
  return { bind, update, open, get active() { return !!run; }, get waiting() { return !!pending; } };
})();
