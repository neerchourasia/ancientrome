"use strict";
// Daily gifts: log in on a new day and a gift is waiting. Come back on consecutive days to keep a streak going: the seventh day's gift is the best,
// and every week after that is a little better. Miss a day and the streak starts over. The days are your own computer's calendar days.
// Saved in the browser and in your account's saved game. Depends on vitals.js.

const Gifts = (() => {
  const KEY = "rome-gifts";
  const $g = (id) => document.getElementById(id);
  // what each day of the week gives: denarii, plus a meal (fills the hunger bar) and a rest (heals you) on some days
  const WEEK = [
    { coins: 25, label: "25 denarii" },
    { coins: 40, label: "40 denarii" },
    { coins: 30, food: 60, label: "30 denarii and a hot meal" },
    { coins: 60, label: "60 denarii" },
    { coins: 50, heal: 100, label: "50 denarii and a healing salve" },
    { coins: 90, label: "90 denarii" },
    { coins: 200, food: 100, heal: 100, label: "200 denarii and a feast" },
  ];
  let s = { last: "", streak: 0, total: 0 };
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v.last === "string") s = { last: v.last.slice(0, 10), streak: v.streak | 0, total: v.total | 0 }; } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };

  const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
  const today = () => ymd();
  const claimed = () => s.last === today();
  // the streak you would be on if you claimed now
  function nextStreak() {
    if (!s.last) return 1;
    const gap = daysBetween(s.last, today());
    return gap === 1 ? s.streak + 1 : gap <= 0 ? s.streak : 1;
  }
  function reward(streak) {
    const base = WEEK[(streak - 1) % 7], weeks = Math.floor((streak - 1) / 7), bonus = Math.min(100, weeks * 10);
    return { ...base, coins: base.coins + bonus, label: bonus ? `${base.label} (+${bonus} for your streak)` : base.label };
  }

  function claim() {
    if (claimed()) { toast("You already took today's gift. Come back tomorrow!"); return; }
    const streak = nextStreak(), r = reward(streak);
    s.streak = streak; s.last = today(); s.total++; save();
    Vitals.coins += r.coins;
    if (r.food) Vitals.hunger = Math.min(100, Vitals.hunger + r.food);
    if (r.heal) Vitals.hp = Math.min(100, Vitals.hp + r.heal);
    if (typeof Sfx !== "undefined") Sfx.play("coin");
    toast(`🎁 Day ${streak}: ${r.label}`);
    render();
    if (typeof Account !== "undefined" && Account.loggedIn) Account.saveNow(true);
  }

  function msUntilTomorrow() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n; }

  function render() {
    const ready = !claimed();
    const b = $g("btn-gift");
    if (b) { b.textContent = ready ? "🎁 Daily gift!" : "🎁 Daily gift"; b.classList.toggle("ready", ready); }
    const panel = $g("gift");
    if (!panel || !panel.classList.contains("show")) return;
    const streak = ready ? nextStreak() : s.streak, dayInWeek = (streak - 1) % 7;
    const grid = $g("gf-grid"); grid.replaceChildren();
    WEEK.forEach((w, i) => {
      const r = reward(Math.floor((streak - 1) / 7) * 7 + i + 1), cell = document.createElement("div");
      cell.className = "gf-day" + (i < dayInWeek || (i === dayInWeek && !ready) ? " done" : "") + (i === dayInWeek && ready ? " today" : "");
      const h = document.createElement("b"); h.textContent = `Day ${i + 1}`;
      const t = document.createElement("span"); t.textContent = r.label.replace(" (+", "\n(+");
      cell.append(h, t); grid.append(cell);
    });
    $g("gf-head").textContent = ready ? `Day ${streak} of your streak: your gift is ready!` : `You took today's gift (a ${s.streak}-day streak).`;
    $g("gf-claim").disabled = !ready;
    const ms = msUntilTomorrow();
    $g("gf-next").textContent = ready ? "" : `The next gift is ready in ${Math.floor(ms / 3600000)} h ${Math.floor((ms % 3600000) / 60000)} min.`;
  }

  function open() {
    if (mode !== "walk" || (panelOpen && !creatorOpen)) { toast("Close what is open and stop the game first"); return; }
    if (creatorOpen) return;
    openPanel("#gift"); render();
  }

  let nagged = false;
  function bind() {
    $g("btn-gift").addEventListener("click", open);
    $g("gf-claim").addEventListener("click", claim);
    render();
    setInterval(() => {
      if (!claimed() || $g("gift").classList.contains("show")) render();
      if (!nagged && typeof started !== "undefined" && started && Character.exists && !claimed()) { nagged = true; toast("🎁 Your daily gift is ready: press the Daily gift button"); }
    }, 2000);
  }

  function snapshot() { return { ...s }; }
  function restore(o) {                      // from your account: keep whichever is more recent
    if (!o || typeof o.last !== "string") return;
    if (o.last > s.last || (o.last === s.last && (o.streak | 0) > s.streak)) { s = { last: o.last.slice(0, 10), streak: o.streak | 0, total: o.total | 0 }; save(); }
    render();
  }

  return { bind, snapshot, restore, claim, open, get ready() { return !claimed(); } };
})();
