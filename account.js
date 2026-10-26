"use strict";
// Accounts and saving, through Supabase (https://supabase.com): sign up, log in, your character and progress saved
// in the cloud. Talks to Supabase's web API directly, so there is nothing to install.
//
// It stays switched off until supabaseUrl and supabaseAnonKey are filled in in config.js. The anon key is meant to be
// public: what a player can read or change is limited by the row-level-security rules in supabase.sql, not by hiding it.

const Account = (() => {
  const cfg = window.ROME_CONFIG || {};
  const SESSION_KEY = "rome-session";
  const base = String(cfg.supabaseUrl || "").replace(/\/+$/, "");
  const anon = String(cfg.supabaseAnonKey || "");
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base) ? anon.length > 10 : false;
  const $a = (id) => document.getElementById(id);

  let admin = false, recoveryToken = null;
  // Arriving from a password-reset email: the link carries a short-lived token in the address
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("type") === "recovery" && h.get("access_token")) { recoveryToken = h.get("access_token"); history.replaceState(null, "", location.pathname + location.search); }
  } catch (e) { /* ignore */ }
  let session = null, lastSaved = "", listeners = [], busy = false;
  // When this device last saw the saved game on the server (the moment it was saved). If the server's copy is newer, another device (or an older
  // version of this page) saved after us: we load it first, so a device that has been sitting on old progress never writes over a newer saved game.
  const SYNC_KEY = "rome-synced-at";
  let knownAt = "", ready = false;
  try { knownAt = localStorage.getItem(SYNC_KEY) || ""; } catch (e) { /* storage unavailable */ }
  const setKnown = (t) => { knownAt = t; try { localStorage.setItem(SYNC_KEY, t); } catch (e) { /* ignore */ } };

  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (s && typeof s.access_token === "string" && typeof s.refresh_token === "string" && typeof s.id === "string" && typeof s.email === "string") session = s;
  } catch (e) { /* storage unavailable */ }

  const changed = () => { for (const f of listeners) { try { f(); } catch (e) { /* ignore */ } } renderAccount(); };

  function storeSession(s) {
    session = s;
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  async function api(path, opt = {}) {
    const headers = { apikey: anon, "Content-Type": "application/json" };
    headers.Authorization = "Bearer " + (opt.token || anon);
    if (opt.prefer) headers.Prefer = opt.prefer;
    const res = await fetch(base + path, { method: opt.method || (opt.body ? "POST" : "GET"), headers, body: opt.body ? JSON.stringify(opt.body) : undefined, keepalive: !!opt.keepalive });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!res.ok) {
      const msg = data && (data.msg || data.error_description || data.message || data.error) ? String(data.msg || data.error_description || data.message || data.error) : `Error ${res.status}`;
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return data;
  }

  function sessionFrom(d) {
    if (!d || !d.access_token || !d.user) return null;
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), id: d.user.id, email: d.user.email || "" };
  }

  // A usable login token (refreshed if it is about to run out), or null.
  async function freshToken() {
    if (!session) return null;
    if (session.expires_at - Date.now() / 1000 > 60) return session.access_token;
    try {
      const s = sessionFrom(await api("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } }));
      if (!s) throw new Error("no session");
      storeSession(s);
      return s.access_token;
    } catch (e) {
      if (e.status === 400 || e.status === 401) { storeSession(null); changed(); }
      return null;
    }
  }

  // ------------------------------------------------------------------ what gets saved

  function snapshot() {
    return {
      character: { name: Character.name, cls: Character.cls, look: Character.look },
      progress: {
        discovered: [...discovered],
        vitals: { hp: Math.round(Vitals.hp), horses: Math.round(Vitals.horses), coins: Vitals.coins, hunger: Math.round(Vitals.hunger) },
        time: { hour: +Time.hour.toFixed(2), day: Time.day },
        owned: Market.snapshot(),
        tax: Tax.snapshot(),
        jobs: Jobs.snapshot(),
        ships: Shipyard.snapshot(),
        disease: Disease.snapshot(),
        social: Social.snapshot(),
        snorkel: typeof Cancun !== "undefined" ? Cancun.snorkelSnapshot() : { seen: [], rounds: 1 },
        daily: Gifts.snapshot(),
        era,
      },
    };
  }

  function apply(row) {
    const c = row.character, p = row.progress || {};
    if (c && typeof c === "object") { Character.set(c); applyCharacter(); }
    if (Array.isArray(p.discovered)) {
      discovered = new Set(p.discovered.filter((id) => ALL_LANDMARKS.some((l) => l.id === id && !l.home && !l.game)));
      try { localStorage.setItem("rome-discovered", JSON.stringify([...discovered])); } catch (e) { /* ignore */ }
      updateProgress();
    }
    const v = p.vitals;
    if (v && typeof v === "object") {
      if (Number.isFinite(v.hp)) Vitals.hp = v.hp;
      if (Number.isFinite(v.horses)) Vitals.horses = v.horses;
      if (Number.isFinite(v.coins)) Vitals.coins = v.coins;
      if (Number.isFinite(v.hunger)) Vitals.hunger = v.hunger;
    }
    if (p.owned && typeof p.owned === "object") Market.restore(p.owned);
    if (p.tax && typeof p.tax === "object") Tax.restore(p.tax);
    if (p.jobs && typeof p.jobs === "object") Jobs.restore(p.jobs);
    if (p.ships && typeof p.ships === "object") Shipyard.restore(p.ships);
    if (p.disease && typeof p.disease === "object") Disease.restore(p.disease);
    if (p.social && typeof p.social === "object") Social.restore(p.social);
    if (p.daily && typeof p.daily === "object") Gifts.restore(p.daily);
    if (p.snorkel && typeof Cancun !== "undefined") Cancun.snorkelRestore(p.snorkel);
    if (p.time && Number.isFinite(p.time.hour) && Number.isFinite(p.time.day)) Time.setClock(p.time.hour, p.time.day);
  }

  // Load a saved game that was made after the last time this device looked (on another computer, say). Whatever this device has bought or found
  // since then is kept as well, so nothing is lost: the purchases of both devices end up together. Returns true if the server's copy was loaded.
  async function pull(quiet) {
    const token = await freshToken();
    if (!token || !session) return false;
    const rows = await api("/rest/v1/profiles?select=character,progress,updated_at&user_id=eq." + encodeURIComponent(session.id), { token });
    const row = rows && rows[0];
    if (!row || !row.character || !row.character.name) return false;
    const at = row.updated_at || "";
    if (knownAt && Date.parse(at) <= Date.parse(knownAt)) return false;                  // nothing newer than what we already have
    const mine = snapshot(), dirty = !knownAt || JSON.stringify(mine) !== lastSaved;     // an unsaved change, or a device that never checked before
    apply(row);
    if (dirty) keepLocal(mine, row);
    setKnown(at);
    lastSaved = dirty ? "" : JSON.stringify(snapshot());                                 // (after a merge, the merged game is saved again at once)
    if (!quiet) toast("Your saved game was loaded from your account");
    return true;
  }

  // Put back what this device had that the saved game lacks: things bought, sights found, the bigger house, and (if this device had played longer) the purse
  function keepLocal(mine, row) {
    const mo = mine.progress.owned || {}, so = Market.snapshot();
    Market.restore({ house: Math.max(so.house, mo.house | 0), dhouse: Math.max(so.dhouse, mo.dhouse | 0), items: [...new Set([...so.items, ...(mo.items || [])])], worn: so.worn.length ? so.worn : (mo.worn || []) });
    if (Array.isArray(mine.progress.discovered)) {
      discovered = new Set([...discovered, ...mine.progress.discovered.filter((id) => ALL_LANDMARKS.some((l) => l.id === id && !l.home && !l.game))]);
      try { localStorage.setItem("rome-discovered", JSON.stringify([...discovered])); } catch (e) { /* ignore */ }
      updateProgress();
    }
    const theirDay = row.progress && row.progress.time ? row.progress.time.day : 0, v = mine.progress.vitals;
    if (mine.progress.time && mine.progress.time.day > theirDay && v) { if (Number.isFinite(v.coins)) Vitals.coins = v.coins; if (Number.isFinite(v.hp)) Vitals.hp = v.hp; if (Number.isFinite(v.hunger)) Vitals.hunger = v.hunger; }
  }

  async function saveNow(quiet) {
    const token = await freshToken();
    if (!token || !session || !ready) return false;                                       // (not before the saved game has been looked at)
    let snap = snapshot(), json = JSON.stringify(snap);
    if (json === lastSaved) return true;
    try { if (await pull(true)) { snap = snapshot(); json = JSON.stringify(snap); } } catch (e) { /* offline: save anyway below */ }
    try {
      const at = new Date().toISOString();
      await api("/rest/v1/profiles?on_conflict=user_id", { token, prefer: "resolution=merge-duplicates,return=minimal", body: { user_id: session.id, ...snap, updated_at: at }, keepalive: true });
      setKnown(at);
      lastSaved = json;
      if (!quiet) toast("Game saved to your account");
      return true;
    } catch (e) {
      if (!quiet) toast("Could not save: " + e.message);
      return false;
    }
  }

  // After logging in: your saved game wins on a new device; a first login uploads what you have here.
  async function sync() {
    const token = await freshToken();
    if (!token) return;
    try {
      const rows = await api("/rest/v1/profiles?select=character,progress,updated_at&user_id=eq." + encodeURIComponent(session.id), { token });
      ready = true;
      if (rows && rows[0] && rows[0].character && rows[0].character.name) {
        apply(rows[0]);
        if (rows[0].updated_at) setKnown(rows[0].updated_at);
        lastSaved = JSON.stringify(snapshot());
        toast("Welcome back! Your saved game is loaded");
      } else {
        await saveNow(true);
        toast("Account ready: your game is now saved online");
      }
    } catch (e) { toast("Could not load your saved game: " + e.message); }
    await checkAdmin();
  }

  // Admins (the emails in the database's `admins` table, see supabase-admin.sql) get an Admin panel.
  async function checkAdmin() {
    const token = await freshToken();
    let ok = false;
    if (token) { try { ok = (await api("/rest/v1/rpc/is_admin", { token, body: {} })) === true; } catch (e) { ok = false; } }
    if (ok !== admin) { admin = ok; changed(); }
  }
  async function adminUsers() {
    const token = await freshToken();
    if (!token) throw new Error("Log in first");
    return api("/rest/v1/rpc/admin_users", { token, body: {} });
  }

  // ------------------------------------------------------------------ sign up / log in / log out

  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254; }

  async function submit(kind) {
    if (busy) return;
    const email = $a("ac-email").value.trim(), password = $a("ac-pass").value;
    const say = (t, bad) => { const m = $a("ac-msg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
    if (!validEmail(email)) return say("Please enter a valid email address.", true);
    if (password.length < 8) return say("Your password needs at least 8 characters.", true);
    if (kind === "up" && !$a("ac-age").checked) return say("Please confirm you are 13 or older and agree to the Terms and Privacy Policy.", true);
    busy = true; say(kind === "up" ? "Creating your account..." : "Logging in...");
    try {
      if (kind === "up") {
        const d = await api("/auth/v1/signup", { body: { email, password } });
        const s = sessionFrom(d);
        if (!s) { say("Almost there: we sent a confirmation link to your email. Click it, then log in here.", false); return; }
        storeSession(s); $a("ac-pass").value = "";
      } else {
        const s = sessionFrom(await api("/auth/v1/token?grant_type=password", { body: { email, password } }));
        if (!s) throw new Error("Could not log in");
        storeSession(s); $a("ac-pass").value = "";
      }
      say(""); changed();
      await sync();
    } catch (e) {
      say(/invalid login/i.test(e.message) ? "That email and password don't match." : /already/i.test(e.message) ? "That email already has an account. Try logging in." : e.message, true);
    } finally { busy = false; }
  }

  // "Forgot your password?": Supabase emails a link that brings you back here to choose a new one.
  async function forgot() {
    const email = $a("ac-email").value.trim(), say = (t, bad) => { const m = $a("ac-msg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
    if (!validEmail(email)) return say("Type your email address above first, then press this again.", true);
    try {
      await api("/auth/v1/recover?redirect_to=" + encodeURIComponent(location.origin + location.pathname), { body: { email } });
      say("If that email has an account, we have sent it a link to choose a new password. Check your inbox (and spam).");
    } catch (e) { say(/rate|seconds/i.test(e.message) ? "Please wait a minute before asking for another email." : e.message, true); }
  }

  async function setNewPassword() {
    const pw = $a("ac-newpass").value, say = (t, bad) => { const m = $a("ac-msg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
    if (pw.length < 8) return say("Your password needs at least 8 characters.", true);
    try {
      await api("/auth/v1/user", { method: "PUT", token: recoveryToken, body: { password: pw } });
      recoveryToken = null; $a("ac-newpass").value = "";
      say("Your password is changed. Log in with the new one.");
      renderAccount();
    } catch (e) { say(/expired|invalid|jwt/i.test(e.message) ? "That link has expired. Press \"Forgot your password?\" again for a new one." : e.message, true); }
  }

  async function logOut() {
    await saveNow(true);
    const token = session && session.access_token;
    storeSession(null); admin = false; lastSaved = "";
    if (token) { try { await api("/auth/v1/logout", { token, body: {} }); } catch (e) { /* the token is dropped here either way */ } }
    changed();
    toast("Logged out");
  }

  // ------------------------------------------------------------------ the screen

  function renderAccount() {
    const out = $a("account");
    if (!out) return;
    const on = !!session;
    $a("ac-off").hidden = configured;
    $a("ac-form").hidden = !configured || on || !!recoveryToken;
    $a("ac-reset").hidden = !configured || !recoveryToken;
    $a("ac-in").hidden = !configured || !on;
    if (on) {
      $a("ac-who").textContent = session.email;
    }
    $a("btn-account").textContent = on ? `Account: ${session.email.split("@")[0].slice(0, 10)}` : "Log in";
  }

  function open() {
    if (mode !== "walk" || (panelOpen && !creatorOpen) || (creatorOpen && !Character.exists)) { toast("Close what is open and stop the game first"); return; }
    if (creatorOpen) closeCreator();
    openPanel("#account");
    for (const eye of document.querySelectorAll("#account .pw-eye")) { const box = eye.parentElement.querySelector("input"); if (box.type !== "password") eye.click(); }   // a password box always starts hidden
    renderAccount();
  }

  function bind() {
    $a("btn-account").addEventListener("click", open);
    $a("account-close").addEventListener("click", closePanels);
    $a("account").addEventListener("click", (e) => { if (e.target.id === "account") closePanels(); });
    $a("ac-login").addEventListener("click", () => submit("in"));
    $a("ac-signup").addEventListener("click", () => submit("up"));
    // the eye: show what you typed in a password box, or hide it again
    for (const eye of document.querySelectorAll("#account .pw-eye")) {
      const box = eye.parentElement.querySelector("input");
      eye.addEventListener("click", () => {
        const show = box.type === "password";
        box.type = show ? "text" : "password";
        eye.textContent = show ? "🙈" : "👁"; eye.classList.toggle("on", show);
        eye.setAttribute("aria-label", show ? "Hide password" : "Show password"); eye.title = show ? "Hide password" : "Show password";
        box.focus();
      });
    }
    $a("ac-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") submit("in"); });
    $a("ac-save").addEventListener("click", () => saveNow(false));
    $a("ac-forgot").addEventListener("click", forgot);
    $a("ac-setpass").addEventListener("click", setNewPassword);
    $a("ac-newpass").addEventListener("keydown", (e) => { if (e.key === "Enter") setNewPassword(); });
    if (recoveryToken) { const iv = setInterval(() => { if (typeof started !== "undefined" && started && !panelOpen) { clearInterval(iv); open(); toast("Choose your new password"); } }, 800); }
    $a("ac-logout").addEventListener("click", logOut);
    renderAccount();
    // a device that is already logged in looks at the saved game first (it may have been played on another computer), and only then starts saving
    if (session) freshToken().then(async (t) => {
      try { if (t) await pull(false); } catch (e) { /* offline: the game carries on with what this device has */ }
      ready = true;
      if (t) checkAdmin();
    });
    setInterval(() => { if (session && !document.hidden) saveNow(true); }, 30000);
    document.addEventListener("visibilitychange", () => { if (document.hidden && session) saveNow(true); });
  }

  return {
    configured, bind, open, saveNow,
    token: () => (session && session.expires_at - Date.now() / 1000 > 5 ? session.access_token : null),
    get loggedIn() { return !!session; },
    get email() { return session ? session.email : ""; },
    get admin() { return admin; },
    adminUsers,
    get userId() { return session ? session.id : ""; },
    onChange(f) { listeners.push(f); },
  };
})();
