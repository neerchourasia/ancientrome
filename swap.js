"use strict";
// Trading with a friend (or, from the Challenge list, with another player who has an account: see the limits and the ten seconds' wait for strangers in server.py). In the Friends list, press 🔁 Trade beside a friend who is online: they are asked, and if they say yes you both see a window with what
// you each offer (up to six things you own, and some denarii). Every change unlocks both sides; when you are both happy, press Lock in, and the swap happens.
// Anything outfits, pets, weapons, vehicles and treasures can be swapped. Depends on market.js (Market.typeOf, priceOf, grant, take), online.js, dialog.js.

const Swap = (() => {
  const TYPES = new Set(["wear", "pet", "weapon", "relic", "car", "mount"]);
  let active = false, withName = "", chosen = new Set(), theirs = { items: [], coins: 0, ok: false }, locked = false, watch = 0, stranger = false, limits = { items: 6, coins: 100000 }, waitT = 0, waitLeft = 0;
  const $w = (id) => document.getElementById(id);
  const send = (a, o = {}) => Online.navalSend({ t: "social", a, ...o });
  const mineList = () => Market.snapshot().items.filter((id) => TYPES.has(Market.typeOf(id)));

  const request = (f) => send("trade_req", { fid: f.fid });
  const requestId = (p) => send("trade_req_id", { id: p.id });                    // someone from the Challenge list, who may not be a friend
  const stopWait = () => { clearInterval(waitT); waitT = 0; waitLeft = 0; };

  function offer() {                                      // tell them what you now offer (this unlocks both sides)
    locked = false;
    stopWait();
    const coins = Math.max(0, Math.min(Vitals.coins, limits.coins, Math.floor(Number($w("sw-coins").value) || 0)));
    $w("sw-coins").value = coins;
    send("trade_offer", { items: [...chosen].slice(0, limits.items), coins });
    render();
  }

  function render() {
    if (!active) return;
    $w("sw-title").textContent = `Trade with ${withName}`;
    const box = $w("sw-mine"); box.replaceChildren();
    for (const id of mineList()) {
      const li = document.createElement("li"), lab = document.createElement("label"), cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = chosen.has(id); cb.disabled = !chosen.has(id) && chosen.size >= limits.items;
      cb.addEventListener("change", () => { if (cb.checked) chosen.add(id); else chosen.delete(id); offer(); });
      lab.append(cb, ` ${Market.itemName(id)} (worth ${Market.priceOf(id)})`); li.append(lab); box.append(li);
    }
    if (!box.children.length) { const li = document.createElement("li"); li.textContent = "You have nothing to swap yet (outfits, pets, weapons, vehicles and treasures can be swapped)."; box.append(li); }
    const their = $w("sw-theirs"); their.replaceChildren();
    for (const id of theirs.items) { const li = document.createElement("li"); li.textContent = `${Market.itemName(id)} (worth ${Market.priceOf(id)})`; their.append(li); }
    if (theirs.coins) { const li = document.createElement("li"); li.textContent = `${theirs.coins} denarii`; their.append(li); }
    if (!their.children.length) { const li = document.createElement("li"); li.textContent = `${withName} has offered nothing yet.`; their.append(li); }
    $w("sw-status").textContent = locked ? (theirs.ok ? "Both locked in..." : `You are locked in. Waiting for ${withName}.`) : theirs.ok ? `${withName} is locked in: check what they offer, then press Lock in.` : "Choose what to offer, then press Lock in.";
    $w("sw-lock").disabled = locked;
    const note = $w("sw-note");
    if (note) { note.hidden = !stranger; note.textContent = stranger ? `${withName} is not your friend. A trade like this holds at most ${limits.items} things and ${limits.coins} denarii from each of you, and when you have both locked in there are ${10} seconds to look again or cancel. Only trade what you have checked: nothing can be taken back afterwards.` : ""; }
    if (waitLeft > 0) $w("sw-status").textContent = `Both locked in. The trade completes in ${waitLeft} second${waitLeft === 1 ? "" : "s"}: press Cancel the trade if anything looks wrong.`;
  }

  function begin(name, isStranger, lim) {
    stopWait(); stranger = !!isStranger; limits = lim && lim.items ? lim : { items: 6, coins: 100000 };
    active = true; withName = name; chosen = new Set(); theirs = { items: [], coins: 0, ok: false }; locked = false;
    $w("sw-coins").value = 0; render(); openPanel("#swap");
    clearInterval(watch); watch = setInterval(() => { if (active && !$w("swap").classList.contains("show")) { send("trade_cancel"); end(); } }, 400);
  }
  function end() { active = false; clearInterval(watch); stopWait(); }

  function finish(m) {                                    // the swap is agreed: give what you promised, take what you are given
    const give = m.give || {}, get = m.get || {};
    for (const id of give.items || []) Market.take(id);
    if (give.coins) Vitals.coins = Math.max(0, Vitals.coins - give.coins);
    let gained = 0;
    for (const id of get.items || []) { if (!Market.grant(id)) gained += Math.round((Market.priceOf(id) || 0) * 0.5); }     // (one you already own is paid out at half its worth)
    Vitals.coins += (get.coins || 0) + gained;
    end(); closePanels(); Sfx.play("discover");
    toast(`Trade done with ${withName}: you got ${(get.items || []).map((i) => Market.itemName(i)).join(", ") || "no things"}${get.coins ? ` and ${get.coins} denarii` : ""}${gained ? ` (${gained} denarii for ones you already had)` : ""}.`);
    if (typeof Account !== "undefined") Account.saveNow(true);
  }

  function on(m) {
    switch (m.s) {
      case "req": Dialog.confirm(m.stranger ? `${m.name} (rating ${m.r}), who is not your friend, wants to trade with you. Trades with strangers are limited and nothing can be taken back. Accept?` : `${m.name} wants to trade with you. Accept?`).then((yes) => send(yes ? "trade_yes" : "trade_no", { fid: m.fid })); break;
      case "open": begin(m.name, m.stranger, m.limits); break;
      case "wait": stopWait(); waitLeft = Math.max(1, m.secs | 0); waitT = setInterval(() => { waitLeft = Math.max(0, waitLeft - 1); if (!waitLeft) stopWait(); render(); }, 1000); render(); break;
      case "theirs": stopWait(); theirs = { items: m.items || [], coins: m.coins || 0, ok: false }; locked = false; render(); break;
      case "theirs_ok": theirs.ok = true; render(); break;
      case "unlock": stopWait(); locked = false; render(); break;
      case "done": finish(m); break;
      case "closed": if (active) { end(); closePanels(); } toast(m.why || "The trade was stopped."); break;
    }
  }

  function bind() {
    if (!$w("sw-lock")) return;
    $w("sw-coins").addEventListener("change", offer);
    $w("sw-lock").addEventListener("click", () => { if (!active || locked) return; locked = true; send("trade_ok"); render(); });
    $w("sw-cancel").addEventListener("click", () => { send("trade_cancel"); end(); closePanels(); });
  }

  return { bind, request, requestId, on, get active() { return active; } };
})();
