"use strict";
// The class dashboard (class-live.html): the teacher's page. The address has the class id and the secret key after the #, so they are never sent anywhere except to the game server, as the
// key to read the class (server.py, "classes"). It asks the server every three seconds and shows every student's progress.
(() => {
  const $ = (id) => document.getElementById(id);
  const h = new URLSearchParams(location.hash.slice(1)), cid = h.get("c") || "", key = h.get("k") || "";
  const cfg = window.ROME_CONFIG || {}, isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const URL_ = isLocal ? "ws://localhost:8765/play" : (cfg.serverUrl || "");
  const http = URL_.replace(/^ws/, "http").replace(/\/play$/, "");
  const CITY = { rome: "Rome", delhi: "Old Delhi", cancun: "Cancún", beijing: "Beijing" };
  let students = [], open = new Set();
  const ago = (s) => (s < 5 ? "now" : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`);
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };

  function render() {
    const rows = $("rows"); rows.replaceChildren();
    for (const s of students) {
      const live = s.ago < 30, tr = el("tr", undefined, "row");
      const hunt = s.hunt ? (s.hunt.done ? `✓ ${Math.floor(s.hunt.done / 60)}:${String(s.hunt.done % 60).padStart(2, "0")}` : `${s.hunt.n} of ${s.hunt.of}`) : "-";
      const latest = s.events.length ? s.events[s.events.length - 1].text : "";
      const cells = [[s.name, ""], [ago(s.ago), live ? "live" : "idle"], [`${CITY[s.city] || "?"}${s.era === "modern" ? " (today)" : ""}`, ""], [String(s.sights.length), ""], [hunt, ""], [String(s.shops), ""], [String(s.errands), ""], [String(s.coins), ""], [latest, ""]];
      for (const [t, cls] of cells) tr.append(el("td", t, cls));
      tr.addEventListener("click", () => { open.has(s.id) ? open.delete(s.id) : open.add(s.id); render(); });
      rows.append(tr);
      if (open.has(s.id)) {
        const more = el("tr", undefined, "more"), td = el("td"); td.colSpan = 9;
        td.append(el("div", `Time in the game: ${ago(s.since).replace(" ago", "")} · goods made: ${s.crafted} · achievements: ${s.ach}`, "sights"));
        td.append(el("div", `Sights: ${s.sights.join(", ") || "none yet"}`, "sights"));
        const ul = el("ul"); for (const e of s.events.slice().reverse()) ul.append(el("li", `${e.text} (${ago(e.ago)})`)); td.append(ul);
        more.append(td); rows.append(more);
      }
    }
    $("count").textContent = `${students.length} student${students.length === 1 ? "" : "s"}`;
    $("active").textContent = `${students.filter((s) => s.ago < 30).length} active now`;
    const hs = students.filter((s) => s.hunt), done = hs.filter((s) => s.hunt.done).length;
    $("hunt").textContent = hs.length ? `Hunt: ${done} of ${hs.length} finished` : "No hunt in this class";
    $("hunt").hidden = !hs.length;
  }

  async function poll() {
    if (!cid || !key || !http) { $("msg").textContent = "This link is missing its class key. Open the dashboard from the teacher page again."; $("msg").className = "err"; return; }
    try {
      const r = await fetch(`${http}/class/view?c=${encodeURIComponent(cid)}&k=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (r.status === 403) { $("msg").textContent = "The server does not accept this key. Open the dashboard from the teacher page again."; $("msg").className = "err"; return; }
      if (!r.ok) throw new Error(String(r.status));
      students = (await r.json()).students || [];
      $("msg").textContent = students.length ? "" : "Waiting for students. They appear here once they open a class link made with \"Let me watch what each student does\" ticked, and have made their character. (The bar at the bottom of their screen then says \"your teacher can see your progress\". A link or code made without it ticked, or before you pressed \"Start a new class\", does not show up here.)";
      $("msg").className = "muted";
      render();
    } catch (e) { $("msg").textContent = "Cannot reach the game server just now. Trying again..."; $("msg").className = "err"; }
  }

  $("csv").addEventListener("click", () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Student", "Last seen (s ago)", "City", "Era", "Sights found", "Hunt", "Shops", "Errands", "Goods made", "Achievements", "Money", "What they did"].map(q).join(",")];
    for (const s of students) lines.push([s.name, s.ago, CITY[s.city] || "", s.era || "", s.sights.length, s.hunt ? (s.hunt.done ? `finished in ${s.hunt.done} s` : `${s.hunt.n} of ${s.hunt.of}`) : "", s.shops, s.errands, s.crafted, s.ach, s.coins, s.events.map((e) => e.text).join("; ")].map(q).join(","));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "class.csv"; a.click();
  });
  $("print").addEventListener("click", () => window.print());
  poll(); setInterval(poll, 3000);
})();
