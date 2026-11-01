"use strict";
// The exchange: 📈 Exchange in the menu. Eight companies sell shares; their prices wander all day (the game server moves them, so everybody sees the same prices and nobody
// can work them out ahead, and there is the odd piece of news). Buy low and sell high: each trade costs a 1% fee. Your shares are kept in the browser and with your account.
// You need to be connected to the game server. The price of a trade is the one the server gives when it fills your order, not the one on your screen.
// Depends on online.js (Online.navalSend, Online.connected), vitals.js and the globals of game.js.

const Exchange = (() => {
  const KEY = "rome-stocks", MAX_HELD = 100000;
  let held = {}, quotes = [], news = [], timer = 0, pending = null;
  const clean = (raw) => { const o = {}; if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (/^[a-z]{2,8}$/.test(k)) { const n = Math.max(0, Math.min(MAX_HELD, Math.floor(Number(v) || 0))); if (n) o[k] = n; } return o; };
  try { held = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(held)); } catch (e) { /* ignore */ } };
  const $x = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "stock", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const worth = () => quotes.reduce((s, q) => s + (held[q.id] || 0) * q.price, 0);

  function spark(hist) {
    const c = document.createElement("canvas"); c.width = 90; c.height = 26; c.className = "ex-spark";
    const g = c.getContext("2d"), lo = Math.min(...hist), hi = Math.max(...hist), span = Math.max(0.01, hi - lo);
    g.strokeStyle = hist[hist.length - 1] >= hist[0] ? "#5fd28a" : "#e5736a"; g.lineWidth = 1.5; g.beginPath();
    hist.forEach((v, i) => { const x = hist.length > 1 ? (i / (hist.length - 1)) * 88 + 1 : 1, y = 24 - ((v - lo) / span) * 22; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke(); return c;
  }

  function render() {
    const body = $x("ex-body"); body.replaceChildren();
    if (!quotes.length) { body.append(el("p", Online.connected ? "Loading prices..." : "The exchange needs the game server: wait to be connected.", "dnote")); }
    for (const q of quotes) {
      const prev = q.hist.length > 1 ? q.hist[q.hist.length - 2] : q.price, ch = prev ? ((q.price - prev) / prev) * 100 : 0, n = held[q.id] || 0;
      const row = el("div", undefined, "ex-row"), nm = el("div", undefined, "ex-name");
      nm.append(el("strong", q.name), el("small", n ? `You own ${n} (${Math.round(n * q.price).toLocaleString()} 🪙)` : "You own none"));
      const pr = el("div", `${q.price.toFixed(2)}`, "ex-price"), cg = el("small", `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%`, ch >= 0 ? "up" : "down"); pr.append(cg);
      const btns = el("div", undefined, "ex-btns");
      for (const [label, side, amt] of [["Buy 1", "buy", 1], ["Buy 10", "buy", 10], ["Sell 1", "sell", 1], ["Sell all", "sell", 0]]) {
        const b = el("button", label); b.type = "button";
        b.addEventListener("click", () => trade(q, side, amt || n));
        btns.append(b);
      }
      row.append(nm, spark(q.hist), pr, btns); body.append(row);
    }
    $x("ex-total").textContent = `Your shares are worth ${Math.round(worth()).toLocaleString()} denarii · you have ${Math.floor(Vitals.coins).toLocaleString()}`;
    const ul = $x("ex-news"); ul.replaceChildren();
    for (const n of [...news].reverse()) ul.append(el("li", `${n.up ? "📈" : "📉"} ${n.text}`));
    if (!news.length) ul.append(el("li", "No news yet.", "dim"));
  }

  function trade(q, side, n) {
    if (!Online.connected) { toast("The exchange needs the game server."); return; }
    if (pending) { toast("One moment: your last order is still being filled."); return; }
    if (n < 1) { toast(side === "sell" ? `You own no ${q.name} shares.` : "Pick an amount."); return; }
    if (side === "sell" && (held[q.id] || 0) < n) { toast(`You own only ${held[q.id] || 0} of ${q.name}.`); return; }
    if (side === "buy" && Vitals.coins < q.price * n * 1.02) { toast(`You need about ${Math.ceil(q.price * n * 1.02)} denarii.`); return; }
    pending = setTimeout(() => { pending = null; }, 4000);
    send({ a: side, id: q.id, n });
  }

  function on(m) {
    if (m.t === "stocks") {
      quotes = Array.isArray(m.list) ? m.list.filter((q) => q && typeof q.price === "number" && Array.isArray(q.hist)) : []; news = Array.isArray(m.news) ? m.news : [];
      if ($x("exchange").classList.contains("show")) render();
    } else if (m.t === "stock_no") { toast(m.msg || "Slow down a little."); }
    else if (m.t === "stock_fill") {
      clearTimeout(pending); pending = null;
      const q = quotes.find((x) => x.id === m.id), name = q ? q.name : m.id, n = held[m.id] || 0;
      if (m.side === "buy") {
        if (Vitals.coins < m.total) { toast("The price moved and you can no longer afford it."); return; }
        Vitals.coins -= m.total; held[m.id] = Math.min(MAX_HELD, n + m.n); Sfx.play("coin");
        toast(`Bought ${m.n} ${name} at ${m.price.toFixed(2)} (fee ${m.fee}): -${m.total} denarii.`);
      } else {
        const sold = Math.min(n, m.n); if (!sold) return;
        const got = Math.max(0, Math.round(m.price * sold - m.fee));
        Vitals.coins += got; held[m.id] = n - sold; if (!held[m.id]) delete held[m.id]; Sfx.play("coin");
        toast(`Sold ${sold} ${name} at ${m.price.toFixed(2)}: +${got} denarii.`);
      }
      save(); send({ a: "list" }); render();
    }
  }

  function open() {
    if (!Online.connected) { toast("The exchange needs the game server: wait to be connected."); return; }
    send({ a: "list" }); render(); openPanel("#exchange");
    clearInterval(timer); timer = setInterval(() => { if (!$x("exchange").classList.contains("show")) { clearInterval(timer); return; } send({ a: "list" }); }, 10000);
  }
  function bind() { const b = $x("btn-exchange"); if (b) b.addEventListener("click", open); }

  return {
    bind, on, open,
    snapshot: () => ({ ...held }),
    restore(raw) { held = clean(raw); save(); },
    merge(raw) { const o = clean(raw); for (const [k, v] of Object.entries(o)) held[k] = Math.max(held[k] || 0, v); save(); },
    get count() { return Object.values(held).reduce((a, b) => a + b, 0); },
  };
})();
