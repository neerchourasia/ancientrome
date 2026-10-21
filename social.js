"use strict";
// Friends, friend requests, friend chats and your ranked rating. They need an account (the game server knows who you are only when you log in).
// The server (server/server.py) keeps who is whose friend while it runs, and your browser keeps a copy in your saved game and sends it back
// each time you connect, so a restart of the server loses nothing. A friendship counts only when both people have it.
// Depends on online.js (the connection), account.js and chat.js at run time.

const Social = (() => {
  const $s = (id) => document.getElementById(id);
  const friends = new Map();          // fid -> { fid, name, online, unread }
  const requests = new Map();         // fid -> name
  const invites = new Map();          // fid -> name of a friend who asked you to sail with them
  const convos = new Map();           // fid -> [{ mine, text, at }]
  let rank = { r: 1000, w: 0, l: 0, d: 0 }, myFid = "", sel = "", notice = "", online = [], top = null;
  const KEY = () => `rome-social-${Account.userId || "guest"}`;

  const TIERS = [[0, "Tiro", "🥉"], [900, "Gladiator", "🥈"], [1100, "Veteran", "🥇"], [1300, "Champion", "🏆"], [1500, "Legend of the Arena", "👑"]];
  function tier(r) { let t = TIERS[0]; for (const x of TIERS) if (r >= x[0]) t = x; return t; }
  const rankText = (k = rank) => { const t = tier(k.r); return `${t[2]} ${t[1]} · ${k.r} (${k.w} won, ${k.l} lost${k.d ? `, ${k.d} drawn` : ""})`; };

  // ------------------------------------------------------------------ saving

  function snapshot() { return { rank: { ...rank }, friends: [...friends.values()].map((f) => ({ fid: f.fid, name: f.name })) }; }
  function restore(o) {
    if (!o || typeof o !== "object") return;
    if (o.rank && Number.isFinite(o.rank.r)) rank = { r: Math.round(o.rank.r), w: o.rank.w | 0, l: o.rank.l | 0, d: o.rank.d | 0 };
    for (const f of Array.isArray(o.friends) ? o.friends : []) if (f && /^[0-9a-f]{12}$/.test(f.fid) && !friends.has(f.fid)) friends.set(f.fid, { fid: f.fid, name: String(f.name || "Friend").slice(0, 16), online: false, unread: 0 });
    render();
  }
  function persist() { try { if (Account.loggedIn) localStorage.setItem(KEY(), JSON.stringify(snapshot())); } catch (e) { /* ignore */ } }
  function load() {
    friends.clear(); requests.clear(); convos.clear(); rank = { r: 1000, w: 0, l: 0, d: 0 }; myFid = ""; sel = "";
    try { if (Account.loggedIn) restore(JSON.parse(localStorage.getItem(KEY()) || "null")); } catch (e) { /* ignore */ }
    render();
  }
  function saveConvo(fid) { try { localStorage.setItem(`${KEY()}-dm-${fid}`, JSON.stringify((convos.get(fid) || []).slice(-40))); } catch (e) { /* ignore */ } }
  function convo(fid) {
    if (!convos.has(fid)) { let list = []; try { list = JSON.parse(localStorage.getItem(`${KEY()}-dm-${fid}`) || "[]"); } catch (e) { /* ignore */ } convos.set(fid, Array.isArray(list) ? list : []); }
    return convos.get(fid);
  }

  const send = (obj) => Online.navalSend({ t: "social", ...obj });
  const unreadTotal = () => [...friends.values()].reduce((n, f) => n + (f.unread || 0), 0) + requests.size + invites.size;

  // ------------------------------------------------------------------ messages from the server

  function say(text) { notice = text; const el = $s("fr-status"); if (el) el.textContent = text; }

  function on(m) {
    switch (m.t) {
      case "fr_state": {
        myFid = m.fid || myFid;
        if (m.rank) rank = m.rank;
        for (const f of m.friends || []) { const cur = friends.get(f.fid); friends.set(f.fid, { fid: f.fid, name: f.name, online: !!f.online, unread: cur ? cur.unread : 0 }); }
        for (const f of friends.values()) if (!(m.friends || []).some((x) => x.fid === f.fid)) f.online = false;
        requests.clear(); for (const r of m.requests || []) requests.set(r.fid, r.name);
        if (requests.size) toast(`👥 ${requests.size} friend request${requests.size === 1 ? "" : "s"} waiting: open Friends`);
        persist(); break;
      }
      case "fr_invite": invites.set(m.fid, m.name); toast(`⚓ ${m.name} invites you to sail together! Open Friends`); if (typeof Sfx !== "undefined") Sfx.play("horn"); setTimeout(() => { invites.delete(m.fid); render(); }, 90000); break;
      case "fr_in": requests.set(m.fid, m.name); toast(`👥 ${m.name} wants to be your friend`); if (typeof Sfx !== "undefined") Sfx.play("beep"); break;
      case "fr_added": friends.set(m.fid, { fid: m.fid, name: m.name, online: !!m.online, unread: 0 }); requests.delete(m.fid); toast(`👥 ${m.name} is now your friend`); persist(); break;
      case "fr_removed": { const f = friends.get(m.fid); friends.delete(m.fid); convos.delete(m.fid); if (sel === m.fid) sel = ""; if (f) say(`${f.name} is no longer on your friends list.`); persist(); break; }
      case "fr_presence": { const f = friends.get(m.fid); if (f) { f.online = !!m.online; f.name = m.name || f.name; if (m.online) Chat.add({ sys: 1, text: `👥 ${f.name} is online` }); } break; }
      case "fr_online": online = m.list || []; break;
      case "fr_msg": say(m.msg); toast(m.msg); break;
      case "dm": {
        const other = m.from === myFid ? m.to : m.from, f = friends.get(other);
        if (!f) break;
        convo(other).push({ mine: m.from === myFid, text: m.text, at: m.at ? m.at * 1000 : Date.now() }); saveConvo(other);
        if (m.from !== myFid && !(sel === other && $s("friends").classList.contains("show"))) { f.unread = (f.unread || 0) + 1; toast(`💬 ${f.name}: ${m.text.slice(0, 40)}`); if (typeof Sfx !== "undefined") Sfx.play("beep"); }
        break;
      }
      case "top": top = m; break;
      default: break;
    }
    render();
  }

  function setRank(k) { if (k && Number.isFinite(k.r)) { rank = { r: k.r, w: k.w | 0, l: k.l | 0, d: k.d | 0 }; persist(); render(); } }

  // ------------------------------------------------------------------ the screen

  const li = (parent, ...kids) => { const e = document.createElement("li"); e.append(...kids); parent.append(e); return e; };
  const btn = (label, fn, cls) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (cls) b.className = cls; b.addEventListener("click", fn); return b; };
  const span = (text, cls) => { const s = document.createElement("span"); s.textContent = text; if (cls) s.className = cls; return s; };

  function render() {
    const badge = unreadTotal();
    const b = $s("btn-friends");
    if (b) b.textContent = badge ? `👥 Friends (${badge})` : "👥 Friends";
    const rk = $s("on-rank");
    if (rk) rk.textContent = Account.loggedIn ? `Your rank: ${rankText()}` : "Log in to your account to keep a rank.";
    const tl = $s("on-top");
    if (tl && top) {
      tl.replaceChildren(...(top.list.length ? top.list : [{ name: "nobody yet", r: "", w: 0, l: 0 }]).map((x, i) => { const e = document.createElement("li"); e.textContent = x.r === "" ? x.name : `${x.name}: ${x.r} (${x.w}-${x.l})`; return e; }));
    }
    const vc = $s("v-char");                         // the badge beside your name on the main screen
    if (vc && Character.exists) {
      vc.textContent = `${Character.name} · ${Character.className}`;
      if (Account.loggedIn) { const t = tier(rank.r), bd = span(`${t[2]} ${rank.r}`, "rank-badge"); bd.title = `Ranked rating: ${rankText()}`; vc.append(" ", bd); }
    }
    const panel = $s("friends");
    if (!panel || !panel.classList.contains("show")) return;
    const login = !Account.loggedIn;
    $s("fr-login").hidden = !login; $s("fr-main").hidden = login;
    $s("fr-status").textContent = notice || (Online.connected ? "" : "Connecting to the game server...");
    $s("fr-rank").textContent = login ? "" : `Your rank: ${rankText()}`;
    const iv = $s("fr-invlist"); iv.replaceChildren();
    $s("fr-invs").hidden = !invites.size;
    for (const [fid, name] of invites) li(iv, span(`⚓ ${name} wants to sail with you`), btn("Sail!", () => sailWith(fid, true)), btn("No thanks", () => { invites.delete(fid); render(); }));
    const rq = $s("fr-reqlist"); rq.replaceChildren();
    $s("fr-reqs").hidden = !requests.size;
    for (const [fid, name] of requests) li(rq, span(name), btn("Accept", () => send({ a: "ans", fid, ok: true })), btn("Decline", () => { requests.delete(fid); send({ a: "ans", fid, ok: false }); render(); }));
    const fl = $s("fr-list"); fl.replaceChildren();
    const list = [...friends.values()].sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
    if (!list.length) li(fl, span("No friends yet. Add someone below.", "dim"));
    for (const f of list) li(fl, span(f.online ? "🟢" : "⚪"), span(f.name + (f.unread ? ` (${f.unread} new)` : "")), btn("Chat", () => select(f.fid)), ...(f.online ? [btn("⚓ Sail", () => sailWith(f.fid, false))] : []), btn("Remove", () => { if (confirm(`Remove ${f.name} from your friends?`)) send({ a: "del", fid: f.fid }); }));
    const chat = $s("fr-chat"), cur = friends.get(sel);
    chat.hidden = !cur;
    if (cur) {
      $s("fr-chat-title").textContent = `💬 ${cur.name}${cur.online ? "" : " (offline: they will get it when they are back)"}`;
      const log = $s("fr-log"); log.replaceChildren();
      for (const m of convo(sel).slice(-40)) { const row = document.createElement("div"); row.className = m.mine ? "me" : "them"; row.textContent = (m.mine ? "You" : cur.name) + ": " + m.text; log.append(row); }
      if (!convo(sel).length) { const row = document.createElement("div"); row.className = "dim"; row.textContent = "Say hello!"; log.append(row); }
      log.scrollTop = 1e6;
    }
    const ol = $s("fr-online"); ol.replaceChildren();
    for (const p of online) li(ol, span(p.name), p.friend ? span("friend", "dim") : p.sent ? span("asked", "dim") : btn("Add friend", () => { send({ a: "req", fid: p.fid }); p.sent = true; render(); }));
    if (!online.length) li(ol, span("Nobody else with an account is online right now.", "dim"));
  }

  // sail together: invite a friend (or accept their invitation); the naval crew battle is fought in Rome, against the practice ships
  function sailWith(fid, accepting) {
    if (typeof city !== "undefined" && city !== "rome") { toast("The naval battle is held in Rome. Press B to travel back first."); return; }
    if (mode !== "walk") { toast("Finish what you are doing first"); return; }
    if (accepting) invites.delete(fid);
    send({ a: accepting ? "accept" : "invite", fid, ship: Shipyard.onlineDesign() });
    render();
  }

  function select(fid) {
    sel = fid; const f = friends.get(fid); if (f) f.unread = 0;
    render(); setTimeout(() => { const i = $s("fr-input"); if (i) i.focus(); }, 30);
  }

  function open() {
    if (mode !== "walk" || (panelOpen && !creatorOpen)) { toast("Close what is open and stop the game first"); return; }
    if (creatorOpen) return;
    notice = ""; openPanel("#friends"); Online.connect(); render();
    if (Account.loggedIn) send({ a: "online" });
  }

  function bind() {
    $s("btn-friends").addEventListener("click", open);
    $s("fr-refresh").addEventListener("click", () => { notice = ""; send({ a: "online" }); });
    $s("fr-add").addEventListener("submit", (e) => { e.preventDefault(); const n = $s("fr-name").value.trim(); if (n) { send({ a: "req", name: n }); $s("fr-name").value = ""; } });
    $s("fr-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = $s("fr-input").value.trim();
      if (t && sel) { send({ a: "dm", to: sel, text: t }); $s("fr-input").value = ""; }
    });
    $s("fr-input").addEventListener("keydown", (e) => { if (e.key === "Escape") e.stopPropagation(); });
    $s("on-top-btn").addEventListener("click", () => send({ a: "top" }));
    Account.onChange(() => { load(); });
    setInterval(() => { if ($s("friends").classList.contains("show") && Account.loggedIn && Online.connected) send({ a: "online" }); }, 15000);
    load();
  }

  return { unread: unreadTotal, bind, on, load, open, render, restore, snapshot, setRank, tier, rankText, get rank() { return { ...rank }; }, helloFriends: () => [...friends.values()].map((f) => ({ fid: f.fid, name: f.name })) };
})();
