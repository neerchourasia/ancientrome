"use strict";
// The class dashboard (class-live.html): the teacher's page. The teacher has to be logged in (teacher-auth.js); the class key comes from the teacher's account (never from the address), and goes only
// to the game server, as the key to read the class (server.py, "classes"). It asks the server every three seconds and shows every student's progress.
(() => {
  const $ = (id) => document.getElementById(id);
  let cid = "", key = "";                                             // (the class id and the class key of the logged-in teacher)
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
      const cells = [[s.name, ""], [ago(s.ago), live ? "live" : "idle"], [`${CITY[s.city] || "?"}${s.era === "modern" ? " (today)" : ""}`, ""], [String(s.sights.length), ""], [hunt, ""], [String(s.shops), ""], [String(s.errands), ""], [String(s.words || 0), ""], [String(s.coins), ""], [latest, ""]];
      for (const [t, cls] of cells) tr.append(el("td", t, cls));
      tr.addEventListener("click", () => { open.has(s.id) ? open.delete(s.id) : open.add(s.id); render(); });
      rows.append(tr);
      if (open.has(s.id)) {
        const more = el("tr", undefined, "more"), td = el("td"); td.colSpan = 10;
        td.append(el("div", `Time in the game: ${ago(s.since).replace(" ago", "")} · goods made: ${s.crafted} · achievements: ${s.ach}`, "sights"));
        td.append(el("div", `Sights: ${s.sights.join(", ") || "none yet"}`, "sights"));
        const ul = el("ul"); for (const e of s.events.slice().reverse()) ul.append(el("li", `${e.text} (${ago(e.ago)})`)); td.append(ul);
        more.append(td); rows.append(more);
      }
    }
    const board = (id, key, min) => {
      const ol = $(id); ol.replaceChildren();
      const rows = students.filter((s) => s[key] > min).sort((a, b) => b[key] - a[key]).slice(0, 5);
      if (!rows.length) { ol.append(el("li", "Nobody yet.", "muted")); return; }
      rows.forEach((s, i) => { const li = el("li", `${["🥇", "🥈", "🥉"][i] || ""} ${s.name}`); li.append(el("span", `  ${key === "gain" ? "+" : ""}${s[key]}`)); ol.append(li); });
    };
    board("lb-rich", "coins", 0); board("lb-gain", "gain", 0);
    $("count").textContent = `${students.length} student${students.length === 1 ? "" : "s"}`;
    $("active").textContent = `${students.filter((s) => s.ago < 30).length} active now`;
    const hs = students.filter((s) => s.hunt), done = hs.filter((s) => s.hunt.done).length;
    $("hunt").textContent = hs.length ? `Hunt: ${done} of ${hs.length} finished` : "No hunt in this class";
    $("hunt").hidden = !hs.length;
  }

  async function poll() {
    if (!cid || !key || !http) { $("msg").textContent = "Could not find your class key. Log in again, or open the dashboard from the teacher page."; $("msg").className = "err"; return; }
    try {
      const r = await fetch(`${http}/class/view?c=${encodeURIComponent(cid)}&k=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (r.status === 403) { $("msg").textContent = "The server does not accept your class key. Open the dashboard from the teacher page again."; $("msg").className = "err"; return; }
      if (!r.ok) throw new Error(String(r.status));
      const view = await r.json(); students = view.students || []; showState(view);
      $("msg").textContent = students.length ? "" : "Waiting for students. They appear here once they open a class link made with \"Let me watch what each student does\" ticked, and have made their character. (The bar at the bottom of their screen then says \"your teacher can see your progress\". A link or code made without it ticked, or before you pressed \"Start a new class\", does not show up here.)";
      $("msg").className = "muted";
      render();
    } catch (e) { $("msg").textContent = "Cannot reach the game server just now. Trying again..."; $("msg").className = "err"; }
  }

  $("csv").addEventListener("click", () => {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Student", "Last seen (s ago)", "City", "Era", "Sights found", "Hunt", "Shops", "Errands", "Latin words", "Goods made", "Achievements", "Money", "Gain this lesson", "What they did"].map(q).join(",")];
    for (const s of students) lines.push([s.name, s.ago, CITY[s.city] || "", s.era || "", s.sights.length, s.hunt ? (s.hunt.done ? `finished in ${s.hunt.done} s` : `${s.hunt.n} of ${s.hunt.of}`) : "", s.shops, s.errands, s.words || 0, s.crafted, s.ach, s.coins, s.gain || 0, s.events.map((e) => e.text).join("; ")].map(q).join(","));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = "class.csv"; a.click();
  });
  $("print").addEventListener("click", () => window.print());

  // what the teacher can do to the whole class: a message, pause and resume, show the leaderboard to the students (server.py, class_set)
  let paused = false;
  function showState(s) {
    paused = !!s.paused;
    $("cm-pause").textContent = paused ? "▶ Resume the class" : "⏸ Pause the class"; $("cm-pause").classList.toggle("on", paused);
    $("cm-state").textContent = paused ? "The class is paused: every student sees a screen that says so." : "";
    if (document.activeElement !== $("cm-board")) $("cm-board").checked = !!s.board;
  }
  async function control(params) {
    if (!cid || !key || !http) return;
    try {
      const q = new URLSearchParams({ c: cid, k: key, ...params });
      const r = await fetch(`${http}/class/set?${q}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      showState(await r.json());
      return true;
    } catch (e) { $("msg").textContent = "Could not reach the game server. Try again."; $("msg").className = "err"; }
  }
  $("cm-send").addEventListener("click", async () => { const t = $("cm-text").value.trim(); if (t && await control({ m: t })) { $("cm-text").value = ""; $("cm-send").textContent = "Sent ✓"; setTimeout(() => { $("cm-send").textContent = "Send to everyone"; }, 2000); } });
  $("cm-text").addEventListener("keydown", (e) => { if (e.key === "Enter") $("cm-send").click(); });
  $("cm-pause").addEventListener("click", () => control({ p: paused ? "0" : "1" }));
  $("cm-board").addEventListener("change", () => control({ b: $("cm-board").checked ? "1" : "0" }));
  // a teacher with several classes picks one here (the address can name one: class-live.html?class=<class id>)
  TeacherAuth.start(async (info) => {
    const want = new URLSearchParams(location.search).get("class") || "";
    let idx = info.index;
    for (let i = 0; want && i < info.classes.length; i++) if (await TeacherAuth.classId(info.classes[i].k) === want) idx = i;
    const use = async (i) => {
      key = info.classes[i].k; cid = await TeacherAuth.classId(key); students = []; open.clear(); await TeacherAuth.choose(i);
      $("sub").textContent = `${info.classes[i].n}: everything the students in your class do, as it happens. Click a student to see what they did.`;
      poll();
    };
    if (info.classes.length > 1) {
      const sel = $("cl-select"); info.classes.forEach((c, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = c.n; sel.append(o); });
      sel.value = String(idx); sel.addEventListener("change", () => use(Number(sel.value))); $("cl-wrap").hidden = false;
    }
    await use(idx); setInterval(poll, 3000);
  });
})();
