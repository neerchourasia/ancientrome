"use strict";
// Chat with the other players, and the admin panel. Messages go through the game server (server/server.py), which cleans
// them, limits how fast they come, masks swearing and lets admins mute or kick. Press Enter to type, Enter again to send (the chat stays open
// so you can keep on typing), Esc or Enter on an empty line to close. `/w name message` whispers to one person; `/help` lists the commands. Depends on online.js and account.js.

const Chat = (() => {
  const $c = (id) => document.getElementById(id);
  const lines = [];                      // { el, at }
  const SHOW_FOR = 14000;                // how long a new line stays on screen when the chat is closed
  let open = false, timer = null;

  const send = (obj) => Online.navalSend(obj);

  function add(entry) {
    const li = document.createElement("li");
    if (entry.sys) { li.className = "sys"; li.textContent = entry.text; }
    else if (entry.pic && PIC_OK.test(entry.pic)) {                  // a small picture, with what they wrote under it
      const who = document.createElement("b");
      who.textContent = entry.name; if (entry.adm) { who.className = "adm"; who.textContent = "★ " + who.textContent; }
      li.append(who, document.createTextNode(entry.text ? ": " + entry.text : ": sent a picture"));
      const im = document.createElement("img"); im.className = "chat-pic"; im.alt = "A picture from " + entry.name; im.src = entry.pic;
      im.addEventListener("click", () => bigPic(entry.pic)); li.append(im);
    } else if (entry.sing) {                                           // a line of a song: shown in the chat and over the singer's head
      li.className = "sing"; const who = document.createElement("b"); who.textContent = entry.name; li.append(who, document.createTextNode(" " + entry.text));
      singBubble(entry);
    } else {
      const who = document.createElement("b");
      who.textContent = entry.w ? (entry.name === Character.name && entry.to ? `You → ${entry.to}` : `${entry.name} (whisper)`) : entry.name;
      if (entry.adm) { who.className = "adm"; who.textContent = "★ " + who.textContent; }
      if ((entry.tag || entry.title) && !entry.w) who.textContent = `${entry.tag ? `[${entry.tag}] ` : ""}${who.textContent}${entry.title ? ` the ${entry.title}` : ""}`;
      li.append(who, document.createTextNode(": " + entry.text));
      if (entry.w) li.className = "whisper";
    }
    if (entry.ts) {                                                    // when it was sent, in your own time zone (hover for the date)
      const when = new Date(entry.ts * 1000), tm = document.createElement("time");
      tm.className = "ct"; tm.textContent = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); tm.title = when.toLocaleString();
      li.prepend(tm, " ");
    }
    $c("chat-log").append(li);
    lines.push({ el: li, at: performance.now() });
    while (lines.length > 60) { lines.shift().el.remove(); }
    refresh();
    $c("chat-log").scrollTop = 1e6;
    if (!entry.sys && entry.name !== Character.name && typeof Sfx !== "undefined") Sfx.play("beep");
  }

  // a singing player's line floats over their head (yours over you, other players' over their figures when they are in view)
  function singBubble(entry) {
    try {
      if (entry.name === Character.name) { Speech.say(player, entry.text, 2.4); return; }
      const p = Online.peerList().find((q) => q.name === entry.name && q.x !== null);
      if (p) Speech.say({ x: p.x, z: p.z }, entry.text, 2.4);
    } catch (e) { /* no bubble */ }
  }

  // ---- pictures: shrunk to a tiny JPEG in the browser (the game server takes only small ones), sent as text
  const PIC_OK = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, PIC_MAX = 3400;
  function bigPic(src) {
    let box = $c("pic-big");
    if (!box) { box = document.createElement("div"); box.id = "pic-big"; box.append(document.createElement("img")); box.addEventListener("click", () => box.classList.remove("show")); document.body.append(box); }
    box.firstChild.src = src; box.classList.add("show");
  }
  async function shrink(file) {
    const bmp = await createImageBitmap(file);
    for (const side of [96, 80, 64, 52, 40]) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      for (const q of [0.6, 0.45, 0.3, 0.2]) { const url = c.toDataURL("image/jpeg", q); if (url.length <= PIC_MAX && PIC_OK.test(url)) return url; }
    }
    return null;
  }
  async function sendPic(file) {
    if (!file || !/^image\//.test(file.type)) { add({ sys: 1, text: "That is not a picture." }); return; }
    if (!Account.loggedIn) { add({ sys: 1, text: "Log in to your account to send pictures." }); return; }
    if (!Online.connected) { add({ sys: 1, text: (Account.demo ? Account.why("Chat needs an account: log in to talk to other players.") : "Not connected to the game server yet. Try again in a moment.") }); return; }
    try {
      const pic = await shrink(file);
      if (!pic) { add({ sys: 1, text: "That picture could not be made small enough." }); return; }
      const input = $c("chat-input"), text = input.value.trim(); input.value = "";
      send({ t: "chat", text, pic });
    } catch (e) { add({ sys: 1, text: "That picture could not be read." }); }
  }

  function history(list) {
    $c("chat-log").replaceChildren(); lines.length = 0;
    for (const e of list || []) add(e);
    for (const l of lines) l.at = 0;     // old lines do not pop up again
    refresh();
  }

  // while the chat is closed only fresh lines show, and they fade away
  function refresh() {
    const t = performance.now();
    for (const l of lines) l.el.hidden = !open && t - l.at > SHOW_FOR;
    $c("chat").classList.toggle("open", open);
    $c("chat").classList.toggle("quiet", !open && lines.every((l) => l.el.hidden));
  }

  function openChat() {
    if (open) return;
    open = true;
    $c("chat-form").hidden = false;
    refresh();
    $c("chat-input").focus();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function closeChat() {
    if (!open) return;
    open = false;
    $c("chat-form").hidden = true;
    $c("chat-input").blur();
    refresh();
  }

  function submit(e) {
    e.preventDefault();
    const input = $c("chat-input"), text = input.value.trim();
    input.value = "";
    if (!text) { closeChat(); return; }   // Enter on an empty line closes the chat
    if (!Online.connected) add({ sys: 1, text: (Account.demo ? Account.why("Chat needs an account: log in to talk to other players.") : "Not connected to the game server yet. Try again in a moment.") });
    else send({ t: "chat", text });
    input.focus();                          // stay open, so you can keep on messaging (Esc or an empty Enter closes it)
  }

  function bind() {
    $c("chat-form").addEventListener("submit", submit);
    $c("chat-input").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); closeChat(); } });
    $c("btn-chat").addEventListener("click", () => (open ? closeChat() : openChat()));
    $c("chat-pic").addEventListener("click", () => $c("chat-file").click());
    $c("chat-file").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; sendPic(f); });
    $c("chat-input").addEventListener("paste", (e) => { const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); sendPic(f); } });
    timer = setInterval(refresh, 1500);
    add({ sys: 1, text: "Press Enter to chat. /help lists the commands. /sing sings a song." });
    lines[0].at = performance.now();
  }

  return { bind, add, history, open: openChat, close: closeChat, get isOpen() { return open; } };
})();

// ------------------------------------------------------------------ the admin panel

const Admin = (() => {
  const $a = (id) => document.getElementById(id);
  let serverAdmin = false;
  const cell = (row, text, cls) => { const c = row.insertCell(); c.textContent = text == null ? "" : text; if (cls) c.className = cls; return c; };
  const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "never");

  function button(parent, label, fn) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.addEventListener("click", fn);
    parent.append(b);
  }

  // the list of accounts has Kick and Block on each row; the game server says which accounts are blocked right now
  let usersRows = [], blockedUids = new Set(), blockedEmails = new Set();
  function renderUsers() {
    const t = $a("ad-users"), rows = usersRows, me = (Account.email || "").toLowerCase();
    t.replaceChildren();
    const head = t.insertRow();
    for (const h of ["Email", "Character", "Denarii", "Day", "Items", "Joined", "Last login", "Last saved", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const u of rows) {
      const r = t.insertRow(), email = (u.email || "").toLowerCase(), blocked = (u.user_id && blockedUids.has(u.user_id)) || blockedEmails.has(email);
      if (blocked) r.className = "lv-high";
      cell(r, u.email); cell(r, u.character_name ? `${u.character_name}${u.class_name ? " (" + u.class_name + ")" : ""}` : "no character yet");
      cell(r, u.coins == null ? "" : Number(u.coins).toLocaleString()); cell(r, u.game_day == null ? "" : u.game_day); cell(r, u.items == null ? "" : u.items); cell(r, when(u.created_at)); cell(r, when(u.last_sign_in_at)); cell(r, when(u.saved_at));
      const act = r.insertCell();
      if (email === me) { act.textContent = "you"; continue; }
      const ask = (m) => Online.navalSend({ t: "admin", a: m, email: u.email, uid: u.user_id });
      if (blocked) { act.textContent = "BLOCKED "; button(act, "Unblock", () => { ask("unblockacct"); setTimeout(loadOnline, 600); }); }
      else {
        button(act, "Kick", () => { Dialog.confirm(`Kick ${u.email} out of the game for 10 minutes?`).then((yes) => { if (yes) ask("kickacct"); }); });
        button(act, "Block", () => { Dialog.confirm(`Block ${u.email} from the game for 30 days and remove them now?`).then((yes) => { if (yes) { ask("blockacct"); setTimeout(loadOnline, 600); } }); });
      }
    }
  }

  async function loadUsers() {
    const t = $a("ad-users"), msg = $a("ad-msg");
    t.replaceChildren(); msg.textContent = "Loading...";
    try {
      const rows = await Account.adminUsers();
      usersRows = rows;
      const total = rows.reduce((a, u) => a + (Number(u.coins) || 0), 0);
      msg.textContent = `${rows.length} account${rows.length === 1 ? "" : "s"} signed up${rows.some((u) => u.coins !== undefined) ? ` · ${total.toLocaleString()} denarii in all (as last saved)` : ""}`;
      renderUsers();
    } catch (e) { msg.textContent = "Could not load the list: " + e.message; }
  }

  // the grouped tab bar at the top of the panel (People: Users, Online now, Visitors, Suspicious activity; Tools: Restore items)
  function showTab(name) {
    for (const b of document.querySelectorAll("#admin .ad-tab")) b.classList.toggle("on", b.dataset.tab === name);
    for (const pane of document.querySelectorAll("#admin .ad-pane")) pane.hidden = pane.dataset.pane !== name;
  }

  function loadOnline() { Online.navalSend({ t: "admin", a: "who" }); Online.navalSend({ t: "admin", a: "events" }); Online.navalSend({ t: "admin", a: "visits" }); Online.navalSend({ t: "admin", a: "journey" }); Online.navalSend({ t: "admin", a: "chatlog" }); }

  // the Chat log tab: the last public messages with who sent them, newest first, each with a Block button
  function showChat(m) {
    const t = $a("ad-chat"), list = m.m || [];
    t.replaceChildren();
    $a("ad-chat-n").textContent = `${list.length} recent message${list.length === 1 ? "" : "s"}`;
    $a("ad-chat-b").textContent = list.length || "";
    const head = t.insertRow();
    for (const h of ["Time", "Who", "Message", "Id", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const e of list) {
      const r = t.insertRow();
      cell(r, new Date(e.ts * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })); cell(r, (e.adm ? "★ " : "") + e.name); cell(r, e.text); cell(r, e.vid || "");
      const act = r.insertCell();
      if (e.vid && !e.adm) button(act, "Block", () => { Dialog.confirm(`Block ${e.name} (${e.vid}) from the game for 30 days and remove them now?`).then((yes) => { if (yes) { Online.navalSend({ t: "admin", a: "block", vid: e.vid }); setTimeout(loadOnline, 600); } }); });
    }
  }

  // the User journey tab: a list of visitors, and each visit of the one you pick as a timeline
  const CITY = { rome: "Rome", delhi: "Delhi", cancun: "Cancún", beijing: "Beijing" };
  const MODE = { fight: "Started a gladiator fight", race: "Started a chariot race", naval: "Started a naval battle", online: "Went into online play", dgame: "Played a game in Delhi", watch: "Watched a show" };
  const up = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
  function say(kind, d) {
    switch (kind) {
      case "arrive": return up(d) || "Opened the game";
      case "play": return up(d);
      case "city": return `Went to ${CITY[d] || d}`;
      case "era": return `Switched to ${d} times`;
      case "mode": return MODE[d] || `Started ${d}`;
      case "vehicle": return up(d);
      case "discover": return `Discovered ${d}`;
      case "job": return up(d);
      case "buy": return `Got ${d}`;
      case "sell": return `Sold ${d}`;
      case "death": return "Died";
      case "money": return `Money: ${d}`;
      case "login": return "Logged in";
      case "demo": return "Switched to the demo";
      case "logout": return "Logged out";
      case "left": return up(d) || "Left";
      default: return up(d) || kind;
    }
  }
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  function showJourney(m) {
    if (m.list) {
      const t = $a("ad-jlist");
      t.replaceChildren();
      $a("ad-journey-n").textContent = `${m.list.length} visitor${m.list.length === 1 ? "" : "s"} with a journey`;
      $a("ad-journey-b").textContent = m.list.length || "";
      const head = t.insertRow();
      for (const h of ["Name", "Account", "Device", "Visits", "Steps", "Last seen", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
      for (const v of m.list) {
        const r = t.insertRow();
        cell(r, v.name || "unknown"); cell(r, v.acct || "guest"); cell(r, v.ua); cell(r, v.sessions); cell(r, v.events); cell(r, when(v.last));
        button(r.insertCell(), "View", () => Online.navalSend({ t: "admin", a: "journey", vid: v.vid }));
      }
      return;
    }
    const box = $a("ad-jdetail");
    box.replaceChildren();
    const h = document.createElement("h3"); h.textContent = `${m.name || "Unknown visitor"} (${String(m.vid).slice(0, 8)})`; box.append(h);
    for (const s of m.sessions || []) {
      const card = document.createElement("div"); card.className = "ad-visit";
      const top = document.createElement("strong"), mins = Math.max(0, Math.round((Date.parse(s.last) - Date.parse(s.start)) / 60000));
      top.textContent = `${when(s.start)} · ${mins < 1 ? "under a minute" : mins + " min"} · ${s.ua || "unknown device"} · ${s.events.length} step${s.events.length === 1 ? "" : "s"}`;
      card.append(top);
      const ol = document.createElement("ol");
      for (const [sec, kind, d] of s.events) { const li = document.createElement("li"); const tm = document.createElement("time"); tm.textContent = clock(sec); li.append(tm, " " + say(kind, d)); ol.append(li); }
      card.append(ol); box.append(card);
    }
  }

  // everyone who opened the site
  function showVisits(m) {
    const t = $a("ad-visits"), list = m.v || [];
    t.replaceChildren();
    $a("ad-visits-n").textContent = `${m.total || list.length} visitor${(m.total || list.length) === 1 ? "" : "s"} in the log`;
    $a("ad-visits-b").textContent = m.total || list.length;
    const head = t.insertRow();
    for (const h of ["Last seen", "First seen", "Opened", "Played", "Name", "Account", "Device", "Address", "Flags", "Id", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const v of list) {
      const r = t.insertRow();
      if (v.flags) r.className = v.flags > 2 ? "lv-high" : "lv-medium";
      cell(r, (v.online ? "● " : "") + when(v.last)); cell(r, when(v.first)); cell(r, v.visits); cell(r, v.plays); cell(r, v.name || ""); cell(r, v.acct || "guest"); cell(r, v.ua); cell(r, v.last_ip || v.last_ip_mask); cell(r, v.flags || ""); cell(r, String(v.vid || "").slice(0, 8));
      const act = r.insertCell();
      if (v.blocked) { act.textContent = "BLOCKED "; button(act, "Unblock", () => { Online.navalSend({ t: "admin", a: "unblock", vid: v.vid }); setTimeout(loadOnline, 600); }); }
      else button(act, "Block", () => { Dialog.confirm(`Block ${v.name || "this visitor"} (${String(v.vid).slice(0, 8)}) from the game for 30 days and remove them now?`).then((yes) => { if (yes) { Online.navalSend({ t: "admin", a: "block", vid: v.vid }); setTimeout(loadOnline, 600); } }); });
    }
  }

  // suspicious activity
  function showEvents(list) {
    const t = $a("ad-events");
    t.replaceChildren();
    $a("ad-events-n").textContent = list.length ? `${list.length} recent` : "nothing suspicious so far";
    $a("ad-events-b").textContent = list.length || "";
    $a("ad-events-b").classList.toggle("hot", list.some((e) => e.level === "high"));
    const head = t.insertRow();
    for (const h of ["When", "What", "Details", "Who", "Address", "Id", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const e of list) {
      const r = t.insertRow();
      r.className = e.level === "high" ? "lv-high" : e.level === "medium" ? "lv-medium" : "";
      cell(r, when(e.t)); cell(r, e.kind); cell(r, e.detail); cell(r, e.who || ""); cell(r, e.ip_full || e.ip); cell(r, e.vid || "");
      const act = r.insertCell();
      if (e.vid) button(act, "Block", () => { Dialog.confirm(`Block ${e.who || "this visitor"} (${e.vid}) from the game for 30 days and remove them now?`).then((yes) => { if (yes) { Online.navalSend({ t: "admin", a: "block", vid: e.vid }); setTimeout(loadOnline, 600); } }); });
    }
  }

  function showOnline(list, m) {
    if (m) { blockedUids = new Set(m.blocked_uids || []); blockedEmails = new Set((m.blocked_emails || []).map((e) => String(e).toLowerCase())); if (usersRows.length) renderUsers(); }
    const t = $a("ad-online");
    t.replaceChildren();
    $a("ad-online-n").textContent = `${list.length} online now`;
    $a("ad-online-b").textContent = list.length;
    const head = t.insertRow();
    for (const h of ["Name", "Denarii", "City", "Place", "Doing", "Coordinates", "Account", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const p of list) {
      const r = t.insertRow();
      cell(r, p.name + (p.admin ? " ★" : "") + (p.muted ? " (muted)" : "")); cell(r, p.coins == null ? "" : Number(p.coins).toLocaleString());
      cell(r, p.where_city || p.city || "menu"); cell(r, p.where_place || ""); cell(r, p.where_doing || p.room || ""); cell(r, p.where_xz || ""); cell(r, p.acct ? "yes" : "guest");
      const act = r.insertCell();
      if (!p.admin) {
        button(act, p.muted ? "Unmute" : "Mute 10 min", () => { Online.navalSend({ t: "admin", a: p.muted ? "unmute" : "mute", id: p.id, min: 10 }); setTimeout(loadOnline, 400); });
        button(act, "Kick", () => { Dialog.confirm(`Kick ${p.name} for 10 minutes?`).then((yes) => { if (yes) { Online.navalSend({ t: "admin", a: "kick", id: p.id }); setTimeout(loadOnline, 600); } }); });
        button(act, "Give 🪙", () => { Dialog.ask(`How many denarii do you give to ${p.name}?`, "1000").then((raw) => { const n = Math.floor(Number(raw)); if (raw !== null && n >= 1) Online.navalSend({ t: "admin", a: "give", id: p.id, n }); }); });
        button(act, "Block", () => { Dialog.confirm(`Block ${p.name} from the game for 30 days and remove them right now?`).then((yes) => { if (yes) { Online.navalSend({ t: "admin", a: "block", id: p.id }); setTimeout(loadOnline, 600); } }); });
      }
    }
  }

  function openPanel_() {
    if (!Account.admin) { toast("Only an admin account can open this."); return; }
    if (mode !== "walk" || (panelOpen && !creatorOpen) || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#admin");
    showTab("users");
    fillItems(); loadUsers(); loadOnline();
  }

  // the owner's way to put back something they lost (admin accounts only: the panel is hidden from everyone else)
  function fillItems() {
    const sel = $a("ad-item"); sel.replaceChildren();
    for (const [id, name, type] of Market.grantable()) { const o = document.createElement("option"); o.value = id; o.textContent = `${name} (${type === "car" ? "vehicle or aircraft" : type})`; sel.append(o); }
  }
  function bind() {
    $a("ad-give").addEventListener("click", () => {
      if (!Account.admin) return;
      const id = $a("ad-item").value;
      if (id && Market.grant(id)) { toast(`Restored: ${Market.itemName(id)}`); Account.saveNow(true); fillItems(); } else toast("Nothing to restore.");
    });
    $a("ad-givecoins").addEventListener("click", () => {
      if (!Account.admin) return;
      const n = Math.max(1, Math.min(100000, Math.floor(Number($a("ad-coins").value) || 0)));
      Vitals.coins += n; toast(`Added ${n} denarii.`); Account.saveNow(true);
    });
    $a("btn-admin").addEventListener("click", openPanel_);
    for (const b of document.querySelectorAll("#admin .ad-tab")) b.addEventListener("click", () => showTab(b.dataset.tab));
    document.querySelector("#admin .ad-back").addEventListener("click", closePanels);
    $a("ad-refresh").addEventListener("click", () => { loadUsers(); loadOnline(); });
    Account.onChange(() => { $a("btn-admin").hidden = !Account.admin; });
    $a("btn-admin").hidden = !Account.admin;
  }

  return { bind, showOnline, showVisits, showEvents, showJourney, showChat, set server(v) { serverAdmin = !!v; }, get server() { return serverAdmin; } };
})();
