"use strict";
// The admin page (admin.html), apart from the game. Sign in with the same email and password as in the game (the login is the same one: if you are already signed in to the game on this device you
// come straight in). Only emails in the database's `admins` table (supabase-admin.sql) get in: the page asks Supabase (`is_admin`) and the game server asks it again before it answers anything. It has the
// tabs of the old admin box inside the game (Users, Online now, Visitors, User journey, Chat log, Suspicious activity) and works through its own connection to the game server (a "panel" connection: it is not
// a player, so it is not in the online list and not in the visitor log). Depends on config.js (the Supabase and game server addresses). Nothing of the game itself is loaded here.

(() => {
  const cfg = window.ROME_CONFIG || {};
  const base = String(cfg.supabaseUrl || "").replace(/\/+$/, ""), anon = String(cfg.supabaseAnonKey || "");
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const WS_URL = isLocal ? "ws://localhost:8765/play" : (cfg.serverUrl || "");
  const KEY = "rome-session";
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- the login (the same one as the game's: rome-session)
  let session = null;
  const read = () => { for (const st of [localStorage, sessionStorage]) { try { const s = JSON.parse(st.getItem(KEY) || "null"); if (s && typeof s.access_token === "string" && typeof s.refresh_token === "string" && typeof s.email === "string") return s; } catch (e) { /* unavailable */ } } return null; };
  const store = (s, remember) => {
    try { const keep = remember === false ? sessionStorage : localStorage, other = remember === false ? localStorage : sessionStorage; if (s) { keep.setItem(KEY, JSON.stringify(s)); other.removeItem(KEY); } else { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } } catch (e) { /* ignore */ }
    session = s;
  };
  async function api(path, opt = {}) {
    const res = await fetch(base + path, { method: opt.body ? "POST" : "GET", headers: { apikey: anon, "Content-Type": "application/json", Authorization: "Bearer " + (opt.token || anon) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
    const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!res.ok) { const err = new Error(data && (data.msg || data.error_description || data.message || data.error) ? String(data.msg || data.error_description || data.message || data.error) : `Error ${res.status}`); err.status = res.status; throw err; }
    return data;
  }
  const sessionFrom = (d) => (d && d.access_token && d.user ? { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), id: d.user.id, email: d.user.email || "" } : null);
  async function token() {
    if (!session) return null;
    if ((session.expires_at || 0) - Date.now() / 1000 > 60) return session.access_token;
    try { const s = sessionFrom(await api("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } })); if (!s) throw new Error("no session"); store(s, localStorage.getItem(KEY) !== null); return s.access_token; }
    catch (e) { if (e.status === 400 || e.status === 401) store(null); return null; }
  }
  const isAdmin = async (t) => { try { return (await api("/rest/v1/rpc/is_admin", { token: t, body: {} })) === true; } catch (e) { return false; } };

  function showLogin(msg) { $("app").hidden = true; $("login").hidden = false; $("login-msg").textContent = msg || ""; closeSocket(); }
  async function enter() {
    session = read();
    const t = await token();
    if (!t) return showLogin("");
    if (!(await isAdmin(t))) { $("login-msg").textContent = ""; showLogin(`${session ? session.email : "This account"} is not an admin. Sign in with an admin account.`); return; }
    $("login").hidden = true; $("app").hidden = false; $("who").textContent = session.email;
    loadUsers(); connect();
  }

  // ---------------------------------------------------------------- the connection to the game server
  let ws = null, pingT = 0, pollT = 0, retryT = 0, wanted = false, welcomed = false;
  const pill = (text, cls) => { const p = $("conn"); p.textContent = text; p.className = "pill" + (cls ? " " + cls : ""); };
  const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const admin = (o) => send({ t: "admin", ...o });
  function closeSocket() { wanted = false; clearInterval(pingT); clearInterval(pollT); clearTimeout(retryT); if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* ignore */ } } }
  async function connect() {
    wanted = true; clearTimeout(retryT);
    if (!WS_URL) { pill("No game server address", "off"); return; }
    const t = await token(); if (!t || !wanted) return;
    pill("Connecting...");
    let sock; try { sock = new WebSocket(WS_URL); } catch (e) { pill("Cannot reach the game server", "off"); return; }
    ws = sock; welcomed = false;
    sock.onopen = () => { send({ t: "hello", vid: "adminpage", token: t, name: "Admin", cls: "gladiator", look: {}, panel: 1 }); clearInterval(pingT); pingT = setInterval(() => send({ t: "ping" }), 25000); };
    sock.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch (err) { return; } if (m && typeof m === "object") onMessage(m); };
    sock.onclose = () => { if (ws !== sock) return; ws = null; welcomed = false; clearInterval(pingT); clearInterval(pollT); pill("Disconnected: trying again...", "off"); if (wanted) retryT = setTimeout(connect, 5000); };   // (the free game server sleeps when nobody plays: it takes about half a minute to wake up)
    sock.onerror = () => pill("Cannot reach the game server (it may be waking up)", "off");
  }
  function onMessage(m) {
    switch (m.t) {
      case "welcome": welcomed = true; pill("Connected", "on"); $("msg").textContent = ""; loadLive(); clearInterval(pollT); pollT = setInterval(() => { if (!document.hidden) loadLive(); }, 15000); break;
      case "error": $("msg").textContent = m.msg || "The game server refused the connection."; if (m.code === "admin") { wanted = false; pill("Not an admin on the game server", "off"); } break;
      case "chat": if (m.sys) $("msg").textContent = m.text; break;
      case "adminwho": showOnline(m.who || [], m); break;
      case "adminvisits": showVisits(m); break;
      case "adminjourney": showJourney(m); break;
      case "adminchat": showChat(m); break;
      case "adminevents": showEvents(m.e || []); break;
      case "kicked": break;
      default: break;
    }
  }
  const loadLive = () => { for (const a of ["who", "events", "visits", "journey", "chatlog"]) admin({ a }); };

  // ---------------------------------------------------------------- the tables
  const cell = (row, text, cls) => { const c = row.insertCell(); c.textContent = text == null ? "" : text; if (cls) c.className = cls; return c; };
  const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");
  const button = (parent, label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", fn); parent.append(b); };
  const header = (t, cols) => { t.replaceChildren(); const head = t.insertRow(); for (const h of cols) { const th = document.createElement("th"); th.textContent = h; head.append(th); } };
  const later = () => setTimeout(loadLive, 600);
  const blockVisitor = (name, vid) => { if (confirm(`Block ${name} (${String(vid).slice(0, 8)}) from the game for 30 days and remove them now?`)) { admin({ a: "block", vid }); later(); } };

  let usersRows = [], blockedUids = new Set(), blockedEmails = new Set();
  function renderUsers() {
    const t = $("t-users"), me = (session && session.email || "").toLowerCase();
    header(t, ["Email", "Character", "Denarii", "Day", "Items", "Joined", "Last login", "Last saved", ""]);
    for (const u of usersRows) {
      const r = t.insertRow(), email = (u.email || "").toLowerCase(), blocked = (u.user_id && blockedUids.has(u.user_id)) || blockedEmails.has(email);
      if (blocked) r.className = "lv-high";
      cell(r, u.email); cell(r, u.character_name ? `${u.character_name}${u.class_name ? " (" + u.class_name + ")" : ""}` : "no character yet");
      cell(r, u.coins == null ? "" : Number(u.coins).toLocaleString()); cell(r, u.game_day == null ? "" : u.game_day); cell(r, u.items == null ? "" : u.items); cell(r, when(u.created_at)); cell(r, when(u.last_sign_in_at)); cell(r, when(u.saved_at));
      const act = r.insertCell();
      if (email === me) { act.textContent = "you"; continue; }
      const ask = (a) => admin({ a, email: u.email, uid: u.user_id });
      if (blocked) { act.append("BLOCKED "); button(act, "Unblock", () => { ask("unblockacct"); later(); }); }
      else { button(act, "Kick", () => { if (confirm(`Kick ${u.email} out of the game for 10 minutes?`)) ask("kickacct"); }); button(act, "Block", () => { if (confirm(`Block ${u.email} from the game for 30 days and remove them now?`)) { ask("blockacct"); later(); } }); }
    }
  }
  async function loadUsers() {
    $("n-users").textContent = "Loading..."; $("t-users").replaceChildren();
    try {
      const t = await token(); if (!t) return showLogin("Your sign-in ran out: please sign in again.");
      usersRows = await api("/rest/v1/rpc/admin_users", { token: t, body: {} });
      const total = usersRows.reduce((a, u) => a + (Number(u.coins) || 0), 0);
      $("n-users").textContent = `${usersRows.length} account${usersRows.length === 1 ? "" : "s"}${usersRows.some((u) => u.coins !== undefined) ? ` · ${total.toLocaleString()} denarii in all (as last saved)` : ""}`;
      renderUsers();
    } catch (e) { $("n-users").textContent = "Could not load the list: " + e.message; }
  }

  function showOnline(list, m) {
    if (m) { blockedUids = new Set(m.blocked_uids || []); blockedEmails = new Set((m.blocked_emails || []).map((e) => String(e).toLowerCase())); if (usersRows.length) renderUsers(); }
    const t = $("t-online"); header(t, ["Name", "Denarii", "City", "Place", "Doing", "Coordinates", "Account", ""]);
    $("n-online").textContent = `${list.length} online now`; $("b-online").textContent = list.length || "";
    for (const p of list) {
      const r = t.insertRow();
      cell(r, p.name + (p.admin ? " ★" : "") + (p.muted ? " (muted)" : "")); cell(r, p.coins == null ? "" : Number(p.coins).toLocaleString()); cell(r, p.where_city || p.city || "menu"); cell(r, p.where_place || ""); cell(r, p.where_doing || p.room || ""); cell(r, p.where_xz || ""); cell(r, p.acct ? "yes" : "guest");
      const act = r.insertCell();
      if (p.admin) continue;
      button(act, p.muted ? "Unmute" : "Mute 10 min", () => { admin({ a: p.muted ? "unmute" : "mute", id: p.id, min: 10 }); setTimeout(loadLive, 400); });
      button(act, "Kick", () => { if (confirm(`Kick ${p.name} for 10 minutes?`)) { admin({ a: "kick", id: p.id }); later(); } });
      button(act, "Give 🪙", () => { const raw = prompt(`How many denarii do you give to ${p.name}?`, "1000"), n = Math.floor(Number(raw)); if (raw !== null && n >= 1) admin({ a: "give", id: p.id, n }); });
      button(act, "Block", () => { if (confirm(`Block ${p.name} from the game for 30 days and remove them right now?`)) { admin({ a: "block", id: p.id }); later(); } });
    }
  }

  function showVisits(m) {
    const list = m.v || [], t = $("t-visits"), total = m.total || list.length;
    header(t, ["Last seen", "First seen", "Opened", "Played", "Name", "Account", "Device", "Address", "Flags", "Id", ""]);
    $("n-visits").textContent = `${total} visitor${total === 1 ? "" : "s"} in the log`; $("b-visits").textContent = total || "";
    for (const v of list) {
      const r = t.insertRow(); if (v.flags) r.className = v.flags > 2 ? "lv-high" : "lv-medium";
      cell(r, (v.online ? "● " : "") + when(v.last)); cell(r, when(v.first)); cell(r, v.visits); cell(r, v.plays); cell(r, v.name || ""); cell(r, v.acct || "guest"); cell(r, v.ua); cell(r, v.last_ip || v.last_ip_mask); cell(r, v.flags || ""); cell(r, String(v.vid || "").slice(0, 8));
      const act = r.insertCell();
      if (v.blocked) { act.append("BLOCKED "); button(act, "Unblock", () => { admin({ a: "unblock", vid: v.vid }); later(); }); }
      else button(act, "Block", () => blockVisitor(v.name || "this visitor", v.vid));
    }
  }

  function showEvents(list) {
    const t = $("t-events"); header(t, ["When", "What", "Details", "Who", "Address", "Id", ""]);
    $("n-events").textContent = list.length ? `${list.length} recent` : "nothing suspicious so far"; $("b-events").textContent = list.length || ""; $("b-events").classList.toggle("hot", list.some((e) => e.level === "high"));
    for (const e of list) {
      const r = t.insertRow(); r.className = e.level === "high" ? "lv-high" : e.level === "medium" ? "lv-medium" : "";
      cell(r, when(e.t)); cell(r, e.kind); cell(r, e.detail); cell(r, e.who || ""); cell(r, e.ip_full || e.ip); cell(r, e.vid || "");
      const act = r.insertCell(); if (e.vid) button(act, "Block", () => blockVisitor(e.who || "this visitor", e.vid));
    }
  }

  function showChat(m) {
    const list = m.m || [], t = $("t-chat"); header(t, ["Time", "Who", "Message", "Id", ""]);
    $("n-chat").textContent = `${list.length} recent message${list.length === 1 ? "" : "s"}`; $("b-chat").textContent = list.length || "";
    for (const e of list) {
      const r = t.insertRow(); cell(r, new Date(e.ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); cell(r, (e.adm ? "★ " : "") + e.name); cell(r, e.text); cell(r, String(e.vid || "").slice(0, 8));
      const act = r.insertCell(); if (e.vid && !e.adm) button(act, "Block", () => blockVisitor(e.name, e.vid));
    }
  }

  const CITY = { rome: "Rome", delhi: "Delhi", cancun: "Cancún", beijing: "Beijing" };
  const MODE = { fight: "Started a gladiator fight", race: "Started a chariot race", naval: "Started a naval battle", online: "Went into online play", dgame: "Played a game in Delhi", watch: "Watched a show" };
  const up = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  function say(kind, d) {
    switch (kind) {
      case "arrive": return up(d) || "Opened the game"; case "play": return up(d); case "city": return `Went to ${CITY[d] || d}`; case "era": return `Switched to ${d} times`; case "mode": return MODE[d] || `Started ${d}`;
      case "vehicle": return up(d); case "discover": return `Discovered ${d}`; case "job": return up(d); case "buy": return `Got ${d}`; case "sell": return `Sold ${d}`; case "death": return "Died"; case "money": return `Money: ${d}`;
      case "login": return "Logged in"; case "demo": return "Switched to the demo"; case "logout": return "Logged out"; case "left": return up(d) || "Left"; default: return up(d) || kind;
    }
  }
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  function showJourney(m) {
    if (m.list) {
      const t = $("t-jlist"); header(t, ["Name", "Account", "Device", "Visits", "Steps", "Last seen", ""]);
      $("n-journey").textContent = `${m.list.length} visitor${m.list.length === 1 ? "" : "s"} with a journey`; $("b-journey").textContent = m.list.length || "";
      for (const v of m.list) { const r = t.insertRow(); cell(r, v.name || "unknown"); cell(r, v.acct || "guest"); cell(r, v.ua); cell(r, v.sessions); cell(r, v.events); cell(r, when(v.last)); button(r.insertCell(), "View", () => admin({ a: "journey", vid: v.vid })); }
      return;
    }
    const box = $("jdetail"); box.replaceChildren();
    const h = document.createElement("h2"); h.textContent = `${m.name || "Unknown visitor"} (${String(m.vid).slice(0, 8)})`; box.append(h);
    for (const s of m.sessions || []) {
      const card = document.createElement("div"); card.className = "visit";
      const top = document.createElement("strong"), mins = Math.max(0, Math.round((Date.parse(s.last) - Date.parse(s.start)) / 60000));
      top.textContent = `${when(s.start)} · ${mins < 1 ? "under a minute" : mins + " min"} · ${s.ua || "unknown device"} · ${s.events.length} step${s.events.length === 1 ? "" : "s"}`; card.append(top);
      const ol = document.createElement("ol");
      for (const [sec, kind, d] of s.events) { const li = document.createElement("li"), tm = document.createElement("time"); tm.textContent = clock(sec); li.append(tm, " " + say(kind, d)); ol.append(li); }
      card.append(ol); box.append(card);
    }
  }

  // ---------------------------------------------------------------- the page
  function showTab(name) {
    for (const b of document.querySelectorAll(".tab")) b.classList.toggle("on", b.dataset.tab === name);
    for (const p of document.querySelectorAll(".pane")) p.hidden = p.dataset.pane !== name;
  }
  for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => showTab(b.dataset.tab));
  $("refresh").addEventListener("click", () => { loadUsers(); if (welcomed) loadLive(); else connect(); });
  $("signout").addEventListener("click", () => { store(null); showLogin("Signed out."); });
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault(); const msg = $("login-msg"); msg.textContent = "Signing in...";
    try {
      const s = sessionFrom(await api("/auth/v1/token?grant_type=password", { body: { email: $("login-email").value.trim(), password: $("login-pass").value } }));
      if (!s) throw new Error("The email or the password is wrong.");
      store(s, $("login-remember").checked); $("login-pass").value = ""; msg.textContent = ""; await enter();
    } catch (err) { msg.textContent = err.status === 400 ? "The email or the password is wrong." : err.message; }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && $("app").hidden === false && wanted && !welcomed && !ws) connect(); });
  if (!base || !anon) showLogin("This site has no account service set up (config.js).");
  else enter();
})();
