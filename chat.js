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
      li.append(who, document.createTextNode(": " + entry.text));
      if (entry.w) li.className = "whisper";
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
    if (!Online.connected) { add({ sys: 1, text: "Not connected to the game server yet. Try again in a moment." }); return; }
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
    if (!Online.connected) add({ sys: 1, text: "Not connected to the game server yet. Try again in a moment." });
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

  async function loadUsers() {
    const t = $a("ad-users"), msg = $a("ad-msg");
    t.replaceChildren(); msg.textContent = "Loading...";
    try {
      const rows = await Account.adminUsers();
      msg.textContent = `${rows.length} account${rows.length === 1 ? "" : "s"} signed up`;
      const head = t.insertRow();
      for (const h of ["Email", "Character", "Joined", "Last login", "Last saved"]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
      for (const u of rows) {
        const r = t.insertRow();
        cell(r, u.email); cell(r, u.character_name ? `${u.character_name}${u.class_name ? " (" + u.class_name + ")" : ""}` : "no character yet"); cell(r, when(u.created_at)); cell(r, when(u.last_sign_in_at)); cell(r, when(u.saved_at));
      }
    } catch (e) { msg.textContent = "Could not load the list: " + e.message; }
  }

  function loadOnline() { Online.navalSend({ t: "admin", a: "who" }); Online.navalSend({ t: "admin", a: "events" }); Online.navalSend({ t: "admin", a: "visits" }); }

  // everyone who opened the site
  function showVisits(m) {
    const t = $a("ad-visits"), list = m.v || [];
    t.replaceChildren();
    $a("ad-visits-n").textContent = `${m.total || list.length} visitor${(m.total || list.length) === 1 ? "" : "s"} in the log`;
    const head = t.insertRow();
    for (const h of ["Last seen", "First seen", "Opened", "Played", "Name", "Account", "Device", "Address", "Flags", "Id", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const v of list) {
      const r = t.insertRow();
      if (v.flags) r.className = v.flags > 2 ? "lv-high" : "lv-medium";
      cell(r, (v.online ? "● " : "") + when(v.last)); cell(r, when(v.first)); cell(r, v.visits); cell(r, v.plays); cell(r, v.name || ""); cell(r, v.acct || "guest"); cell(r, v.ua); cell(r, v.last_ip_mask); cell(r, v.flags || ""); cell(r, String(v.vid || "").slice(0, 8));
      const act = r.insertCell();
      if (v.blocked) { act.textContent = "BLOCKED "; button(act, "Unblock", () => { Online.navalSend({ t: "admin", a: "unblock", vid: v.vid }); setTimeout(loadOnline, 600); }); }
      else button(act, "Block", () => { if (confirm(`Block ${v.name || "this visitor"} (${String(v.vid).slice(0, 8)}) from the game for 30 days and remove them now?`)) { Online.navalSend({ t: "admin", a: "block", vid: v.vid }); setTimeout(loadOnline, 600); } });
    }
  }

  // suspicious activity
  function showEvents(list) {
    const t = $a("ad-events");
    t.replaceChildren();
    $a("ad-events-n").textContent = list.length ? `${list.length} recent` : "nothing suspicious so far";
    const head = t.insertRow();
    for (const h of ["When", "What", "Details", "Who", "Address", "Id", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const e of list) {
      const r = t.insertRow();
      r.className = e.level === "high" ? "lv-high" : e.level === "medium" ? "lv-medium" : "";
      cell(r, when(e.t)); cell(r, e.kind); cell(r, e.detail); cell(r, e.who || ""); cell(r, e.ip); cell(r, e.vid || "");
      const act = r.insertCell();
      if (e.vid) button(act, "Block", () => { if (confirm(`Block ${e.who || "this visitor"} (${e.vid}) from the game for 30 days and remove them now?`)) { Online.navalSend({ t: "admin", a: "block", vid: e.vid }); setTimeout(loadOnline, 600); } });
    }
  }

  function showOnline(list) {
    const t = $a("ad-online");
    t.replaceChildren();
    $a("ad-online-n").textContent = `${list.length} online now`;
    const head = t.insertRow();
    for (const h of ["Name", "City", "Place", "Doing", "Coordinates", "Account", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const p of list) {
      const r = t.insertRow();
      cell(r, p.name + (p.admin ? " ★" : "") + (p.muted ? " (muted)" : ""));
      cell(r, p.where_city || p.city || "menu"); cell(r, p.where_place || ""); cell(r, p.where_doing || p.room || ""); cell(r, p.where_xz || ""); cell(r, p.acct ? "yes" : "guest");
      const act = r.insertCell();
      if (!p.admin) {
        button(act, p.muted ? "Unmute" : "Mute 10 min", () => { Online.navalSend({ t: "admin", a: p.muted ? "unmute" : "mute", id: p.id, min: 10 }); setTimeout(loadOnline, 400); });
        button(act, "Kick", () => { if (confirm(`Kick ${p.name} for 10 minutes?`)) { Online.navalSend({ t: "admin", a: "kick", id: p.id }); setTimeout(loadOnline, 600); } });
        button(act, "Block", () => { if (confirm(`Block ${p.name} from the game for 30 days and remove them right now?`)) { Online.navalSend({ t: "admin", a: "block", id: p.id }); setTimeout(loadOnline, 600); } });
      }
    }
  }

  function openPanel_() {
    if (!Account.admin) { toast("Only an admin account can open this."); return; }
    if (mode !== "walk" || (panelOpen && !creatorOpen) || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#admin");
    loadUsers(); loadOnline();
  }

  function bind() {
    $a("btn-admin").addEventListener("click", openPanel_);
    $a("ad-refresh").addEventListener("click", () => { loadUsers(); loadOnline(); });
    Account.onChange(() => { $a("btn-admin").hidden = !Account.admin; });
    $a("btn-admin").hidden = !Account.admin;
  }

  return { bind, showOnline, showVisits, showEvents, set server(v) { serverAdmin = !!v; }, get server() { return serverAdmin; } };
})();
