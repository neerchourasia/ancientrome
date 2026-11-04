"use strict";
// The daily quest: 📜 Daily quest in the menu. Every day the server picks one small goal for everybody (win or play matches against real people, play a kind of game, carry blocks of the pyramid).
// With an account, finishing it pays denarii, and each day in a row makes the prize bigger. The prize arrives like the weekly cup's (weekly.js). Depends on online.js (Online.navalSend, Online.connected)
// and the globals of game.js (openPanel, toast).

const Daily = (() => {
  let view = null, timer = 0, seen = -1;
  const $d = (id) => document.getElementById(id);
  const send = (o) => Online.navalSend({ t: "daily", ...o });
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const left = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${Math.max(1, m)} min`; };

  function render() {
    const body = $d("dq-body"); if (!body) return; body.replaceChildren();
    if (!view) { body.append(el("p", Online.connected ? "Loading..." : "The daily quest needs the game server: wait to be connected.", "dnote")); return; }
    body.append(el("h3", view.text, "wk-theme"));
    const bar = el("div", undefined, "dq-bar"), fill = el("i"); fill.style.width = `${Math.round(100 * view.p / view.n)}%`; bar.append(fill);
    body.append(bar, el("p", view.done ? "✅ Done for today!" : `${view.p} of ${view.n}`, "wk-you"));
    if (!view.login) body.append(el("p", "Log in to your account to earn the prize and keep a streak.", "dnote"));
    else body.append(el("p", view.done ? `You earned ${view.coins} denarii. Come back tomorrow: the next quest comes in ${left(view.ends)}.` : `Prize: ${view.coins} denarii${view.streak ? ` (day ${view.streak + 1} in a row)` : ""}. A new quest comes in ${left(view.ends)}.`, "dnote"));
    if (view.login) body.append(el("p", `🔥 ${view.streak} day${view.streak === 1 ? "" : "s"} in a row · best ${view.best}`, "dnote"));
    body.append(el("p", `The prize starts at ${view.min} denarii and grows every day in a row, up to ${view.max} on the seventh. Matches against practice bots do not count.`, "dnote small"));
  }

  function on(m) {
    if (m.t !== "daily") return;
    const first = seen < 0;
    if (!first && m.p > seen && !m.done) toast(`📜 Daily quest: ${m.p} of ${m.n}`);
    seen = m.p; view = m;
    if ($d("daily").classList.contains("show")) render();
  }

  function open() {
    if (!Online.connected) { toast("The daily quest needs the game server: wait to be connected."); return; }
    send({ a: "get" }); render(); openPanel("#daily");
    clearInterval(timer); timer = setInterval(() => { if (!$d("daily").classList.contains("show")) { clearInterval(timer); return; } send({ a: "get" }); }, 15000);
  }
  function bind() { const b = $d("btn-daily"); if (b) b.addEventListener("click", open); }
  return { bind, on, open };
})();
