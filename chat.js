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
    else {
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
    timer = setInterval(refresh, 1500);
    add({ sys: 1, text: "Press Enter to chat. /help lists the commands." });
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

  function loadOnline() { Online.navalSend({ t: "admin", a: "who" }); }

  function showOnline(list) {
    const t = $a("ad-online");
    t.replaceChildren();
    $a("ad-online-n").textContent = `${list.length} online now`;
    const head = t.insertRow();
    for (const h of ["Name", "Where", "Account", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const p of list) {
      const r = t.insertRow();
      cell(r, p.name + (p.admin ? " ★" : "") + (p.muted ? " (muted)" : ""));
      cell(r, p.room ? p.room : p.city || "menu"); cell(r, p.acct ? "yes" : "guest");
      const act = r.insertCell();
      if (!p.admin) {
        button(act, p.muted ? "Unmute" : "Mute 10 min", () => { Online.navalSend({ t: "admin", a: p.muted ? "unmute" : "mute", id: p.id, min: 10 }); setTimeout(loadOnline, 400); });
        button(act, "Kick", () => { if (confirm(`Kick ${p.name} for 10 minutes?`)) { Online.navalSend({ t: "admin", a: "kick", id: p.id }); setTimeout(loadOnline, 600); } });
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

  return { bind, showOnline, set server(v) { serverAdmin = !!v; }, get server() { return serverAdmin; } };
})();
