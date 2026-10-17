"use strict";
// Taxes, and what people think of you. Every 30 days you owe the tax collector some denarii (more if you own a better house
// or are rich). Pay it from the 💰 Tax button. If the day passes and you have not, people hate you: they shout "Tax dodger!"
// as you pass, and the Market charges you more. After 15 days overdue the collectors seize your savings. Paying makes people
// forgive you over the next few days.
//
// Also here: Speech, the bubbles over people's heads, used when you ram into someone and when people jeer at a tax dodger.
// Depends on game.js, market.js and city.js at run time.

const Speech = (() => {
  const pool = [];
  let scene = null;

  function init(sc) {
    scene = sc;
    for (let i = 0; i < 5; i++) {
      const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
      const tex = new THREE.CanvasTexture(cv);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      sp.visible = false; sp.renderOrder = 15; sp.center.set(0.5, 0);
      scene.add(sp);
      pool.push({ sp, cv, tex, t: 0, ttl: 0, who: null, x: 0, z: 0 });
    }
  }

  function draw(b, text) {
    const g = b.cv.getContext("2d"), w = 512, h = 128;
    g.clearRect(0, 0, w, h);
    g.font = "bold 34px sans-serif";
    const tw = Math.min(w - 40, g.measureText(text).width + 36);
    g.fillStyle = "rgba(255,255,255,.96)"; g.strokeStyle = "#2a2118"; g.lineWidth = 4;
    const x0 = (w - tw) / 2, y0 = 14, hh = 70, r = 22;
    g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x0 + tw - r, y0); g.quadraticCurveTo(x0 + tw, y0, x0 + tw, y0 + r); g.lineTo(x0 + tw, y0 + hh - r); g.quadraticCurveTo(x0 + tw, y0 + hh, x0 + tw - r, y0 + hh);
    g.lineTo(w / 2 + 12, y0 + hh); g.lineTo(w / 2, y0 + hh + 24); g.lineTo(w / 2 - 12, y0 + hh); g.lineTo(x0 + r, y0 + hh); g.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - r); g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = "#2a2118"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, y0 + hh / 2 + 2, tw - 24);
    b.tex.needsUpdate = true;
  }

  // Someone says something over their head. `who` is a person ({ x, z }) that the bubble follows.
  function say(who, text, ttl = 2.6) {
    if (!scene || !who) return;
    let b = pool.find((p) => p.ttl <= 0) || pool.slice().sort((a, c) => a.ttl - c.ttl)[0];
    draw(b, text);
    b.who = who; b.ttl = ttl; b.t = 0; b.sp.visible = true;
  }

  function update(dt) {
    for (const b of pool) {
      if (b.ttl <= 0) continue;
      b.ttl -= dt; b.t += dt;
      if (b.ttl <= 0 || !b.who) { b.sp.visible = false; continue; }
      const x = b.who.x, z = b.who.z, dist = Math.hypot(x - camera.position.x, z - camera.position.z), k = Math.max(0.5, Math.min(5, dist / 10));
      b.sp.position.set(x, groundAt(x, z) + 2.15, z);
      b.sp.scale.set(5.2 * k, 1.3 * k, 1);
      b.sp.material.opacity = Math.min(1, b.ttl * 2.5);
    }
  }

  // What people say when you run into them (angrier if you were running), by place and time.
  const RAM = {
    rome: ["Watch where you're going!", "By Jupiter, are you blind?", "Barbarian!", "Guards! Guards!", "My toga!", "Have you no manners?", "Gods above, what was that?"],
    delhi: ["Arre! Dekh ke chalo!", "Oye! Are you mad?", "Hey, watch it!", "Kya kar rahe ho?!", "Arre baba, my feet!", "Look where you're going!", "Hai Ram!"],
    modern: ["Hey! Watch it!", "Are you blind?!", "I'll call the police!", "My phone!", "What is wrong with you?!", "Ow! That hurt!", "Idiot!"],
  };
  const HARD = ["You could have killed me!", "Help! Madman!", "Somebody stop them!", "I'll remember you!", "Criminal!"];
  const JEER = ["Tax dodger!", "Pay your taxes!", "Shame on you!", "Thief of the treasury!", "There goes the tax cheat!", "Nobody likes a tax dodger.", "Pay up!"];
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

  function rammed(who, hard) {
    const set = era === "modern" && city === "rome" ? RAM.modern : city === "delhi" ? RAM.delhi : RAM.rome;
    say(who, hard && Math.random() < 0.5 ? pickOne(HARD) : pickOne(set));
  }
  const jeer = (who) => say(who, pickOne(JEER), 3);

  return { init, update, say, rammed, jeer };
})();

const Tax = (() => {
  const KEY = "rome-tax", PERIOD = 30, SEIZE_AFTER = 15;
  let nextDue = null, hate = 0, owed = 0, jeerT = 6, warnedFor = -1, seizedFor = -1, lastDay = null, noticeT = 0;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Number.isFinite(s.nextDue)) { nextDue = s.nextDue; hate = Number.isFinite(s.hate) ? Math.max(0, Math.min(100, s.hate)) : 0; }
  } catch (e) { /* storage unavailable */ }

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ nextDue, hate: Math.round(hate) })); } catch (e) { /* ignore */ } };
  const $t = (id) => document.getElementById(id);

  // What you owe: a base sum, more for a better house in either city, and a little for being rich.
  function amount() {
    const o = Market.snapshot();
    return Math.round(20 + 15 * (o.house + (o.dhouse || 0)) + Math.min(150, Vitals.coins * 0.04) + Math.max(0, daysOverdue()) * 3);
  }
  const daysLeft = () => nextDue - Time.day;
  const daysOverdue = () => (nextDue === null ? 0 : Time.day - nextDue);
  const overdue = () => nextDue !== null && Time.day >= nextDue;

  function pay() {
    const cost = amount();
    if (Vitals.coins < cost) { toast(`You need ${cost} denarii for the tax and you have ${Vitals.coins}.`); return false; }
    Vitals.coins -= cost;
    nextDue = Time.day + PERIOD; warnedFor = seizedFor = -1;
    save(); Sfx.play("coin");
    toast(overdue() ? "Tax paid" : `Tax paid: ${cost} denarii. The next is due on day ${nextDue}.`);
    Narrator.say("Tax paid. The collector writes your name in his book.", { interrupt: true });
    render();
    return true;
  }

  function render() {
    const line = $t("v-tax");
    if (nextDue === null) return;
    const dl = daysLeft();
    line.textContent = overdue() ? `TAX OVERDUE (${daysOverdue()} day${daysOverdue() === 1 ? "" : "s"}): people hate you` : dl <= 5 ? `Tax due in ${dl} day${dl === 1 ? "" : "s"}: ${amount()} denarii` : `Tax due on day ${nextDue}`;
    line.className = overdue() ? "bad" : dl <= 5 ? "warn" : "";
    $t("btn-tax").textContent = overdue() ? "💰 Tax OVERDUE" : "💰 Tax";
    $t("btn-tax").classList.toggle("alert", overdue() || dl <= 5);
    if ($t("tax").classList.contains("show")) {
      $t("tax-text").textContent = overdue()
        ? `You are ${daysOverdue()} day${daysOverdue() === 1 ? "" : "s"} late with your tax. People hate you: they jeer as you pass and the Market charges you 25% more. In ${Math.max(0, SEIZE_AFTER - daysOverdue())} more days the collectors will take your savings.`
        : `Tax is due every ${PERIOD} days. The next payment is due on day ${nextDue} (${Math.max(0, dl)} days from now). If you miss it, people turn against you.`;
      $t("tax-amount").textContent = `${amount()} denarii`;
      $t("tax-pay").disabled = Vitals.coins < amount();
      $t("tax-pay").textContent = overdue() ? "Pay the tax now" : "Pay early";
      $t("tax-have").textContent = `You have ${Vitals.coins} denarii.`;
    }
  }

  function open() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#tax"); render();
  }

  // Every frame: the date, people's mood, jeers and the collectors.
  function update(dt) {
    if (!started) return;
    if (nextDue === null) { nextDue = Time.day + PERIOD; save(); }
    const day = Time.day;
    if (day !== lastDay) {
      lastDay = day;
      const dl = daysLeft();
      if (dl === 5 || dl === 1) { toast(`The tax collector's notice: ${amount()} denarii are due in ${dl} day${dl === 1 ? "" : "s"}. Pay from the 💰 Tax button.`); Narrator.say(`The tax collector reminds you that your tax is due in ${dl} day${dl === 1 ? "" : "s"}.`); }
      else if (dl === 0 && warnedFor !== nextDue) { warnedFor = nextDue; toast("Your tax is due today! Pay it now, or people will turn against you."); }
      else if (overdue() && daysOverdue() === 1) { toast("You missed the tax: people hate you now. Pay it from the 💰 Tax button."); Narrator.say("You missed the tax payment. The people hate you now.", { interrupt: true }); }
      render();
    }
    // goodwill: it grows while you owe, and fades after you pay
    const perSec = 100 / 1200; // a game day is 20 minutes
    hate = overdue() ? Math.min(100, hate + perSec * 25 * dt) : Math.max(0, hate - perSec * 20 * dt);
    noticeT += dt;
    if (noticeT > 2) { noticeT = 0; render(); save(); }
    // after a fortnight overdue the collectors take what they can
    if (overdue() && daysOverdue() >= SEIZE_AFTER && seizedFor !== nextDue && mode === "walk" && !panelOpen) {
      seizedFor = nextDue;
      const take = Math.min(Vitals.coins, amount() * 2);
      Vitals.coins -= take; nextDue = Time.day + PERIOD;
      toast(`The tax collectors seize ${take} denarii from you! The debt is cleared, but people still remember.`);
      Narrator.say(`The tax collectors have seized ${take} denarii from you.`, { interrupt: true });
      Sfx.play("bump"); render(); save();
    }
    // people jeer as you walk past
    if (hate > 10 && (mode === "walk" || mode === "drive")) {
      jeerT -= dt;
      if (jeerT <= 0) {
        jeerT = Math.max(2.5, 8 - hate / 18) + Math.random() * 4;
        const list = city === "delhi" ? Delhi.people() : CITIZENS.list;
        let best = null, bd = 16;
        for (const c of list) { if ((c.down || 0) > 0) continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { best = c; bd = d; } }
        if (best) Speech.jeer(best);
      }
    }
  }

  function bind() {
    $t("btn-tax").addEventListener("click", open);
    $t("tax-pay").addEventListener("click", pay);
    render();
  }

  return {
    bind, update, pay, open, amount,
    get hated() { return hate > 10; },
    get priceMul() { return hate > 10 ? 1.25 : 1; },
    snapshot: () => ({ nextDue, hate: Math.round(hate) }),
    restore(t) { if (t && Number.isFinite(t.nextDue)) { nextDue = t.nextDue; hate = Number.isFinite(t.hate) ? Math.max(0, Math.min(100, t.hate)) : 0; save(); render(); } },
    debug: () => ({ nextDue, hate, day: Time.day }),
  };
})();
