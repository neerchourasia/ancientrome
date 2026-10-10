"use strict";
// Accounts and saving, through Supabase (https://supabase.com): sign up, log in, your character and progress saved
// in the cloud, and whether you have Premium. Talks to Supabase's web API directly, so there is nothing to install.
//
// It stays switched off until supabaseUrl and supabaseAnonKey are filled in in config.js. The anon key is meant to be
// public: what a player can read or change is limited by the row-level-security rules in supabase.sql, not by hiding it.
// Whether you have Premium is only ever READ here; it can only be written by the game server (see server/server.py).

const Account = (() => {
  const cfg = window.ROME_CONFIG || {};
  const SESSION_KEY = "rome-session", PREMIUM_KEY = "rome-premium";
  const base = String(cfg.supabaseUrl || "").replace(/\/+$/, "");
  const anon = String(cfg.supabaseAnonKey || "");
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base) ? anon.length > 10 : false;
  const $a = (id) => document.getElementById(id);

  let session = null, premium = false, lastSaved = "", listeners = [], busy = false;

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
      if (e.status === 400 || e.status === 401) { storeSession(null); premium = false; changed(); }
      return null;
    }
  }

  // ------------------------------------------------------------------ what gets saved

  function snapshot() {
    return {
      character: { name: Character.name, cls: Character.cls, look: Character.look },
      progress: {
        discovered: [...discovered],
        vitals: { hp: Math.round(Vitals.hp), horses: Math.round(Vitals.horses), coins: Vitals.coins },
        time: { hour: +Time.hour.toFixed(2), day: Time.day },
        owned: Market.snapshot(),
        era,
      },
    };
  }

  function apply(row) {
    const c = row.character, p = row.progress || {};
    if (c && typeof c === "object") { Character.set(c); applyCharacter(); }
    if (Array.isArray(p.discovered)) {
      discovered = new Set(p.discovered.filter((id) => LANDMARKS.some((l) => l.id === id && !l.home)));
      try { localStorage.setItem("rome-discovered", JSON.stringify([...discovered])); } catch (e) { /* ignore */ }
      updateProgress();
    }
    const v = p.vitals;
    if (v && typeof v === "object") {
      if (Number.isFinite(v.hp)) Vitals.hp = v.hp;
      if (Number.isFinite(v.horses)) Vitals.horses = v.horses;
      if (Number.isFinite(v.coins)) Vitals.coins = v.coins;
    }
    if (p.owned && typeof p.owned === "object") Market.restore(p.owned);
    if (p.time && Number.isFinite(p.time.hour) && Number.isFinite(p.time.day)) Time.setClock(p.time.hour, p.time.day);
  }

  async function saveNow(quiet) {
    const token = await freshToken();
    if (!token || !session) return false;
    const snap = snapshot(), json = JSON.stringify(snap);
    if (json === lastSaved) return true;
    try {
      await api("/rest/v1/profiles?on_conflict=user_id", { token, prefer: "resolution=merge-duplicates,return=minimal", body: { user_id: session.id, ...snap, updated_at: new Date().toISOString() }, keepalive: true });
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
      const rows = await api("/rest/v1/profiles?select=character,progress&user_id=eq." + encodeURIComponent(session.id), { token });
      if (rows && rows[0] && rows[0].character && rows[0].character.name) {
        apply(rows[0]);
        lastSaved = JSON.stringify(snapshot());
        toast("Welcome back! Your saved game is loaded");
      } else {
        await saveNow(true);
        toast("Account ready: your game is now saved online");
      }
    } catch (e) { toast("Could not load your saved game: " + e.message); }
    await loadPremium();
  }

  async function loadPremium() {
    const token = await freshToken();
    let p = false;
    if (token) {
      try {
        const rows = await api("/rest/v1/entitlements?select=premium&user_id=eq." + encodeURIComponent(session.id), { token });
        p = !!(rows && rows[0] && rows[0].premium);
      } catch (e) { p = premium; }
    }
    if (p !== premium) { premium = p; Character.setPremium(p); }
    changed();
    return p;
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

  async function logOut() {
    await saveNow(true);
    const token = session && session.access_token;
    storeSession(null); premium = false; lastSaved = ""; Character.setPremium(false);
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
    $a("ac-form").hidden = !configured || on;
    $a("ac-in").hidden = !configured || !on;
    if (on) {
      $a("ac-who").textContent = session.email;
      $a("ac-plan").textContent = premium ? "★ Premium" : "Free";
    }
    $a("btn-account").textContent = on ? `Account: ${session.email.split("@")[0].slice(0, 10)}` : "Log in";
  }

  function open() {
    if (mode !== "walk" || (panelOpen && !creatorOpen) || (creatorOpen && !Character.exists)) { toast("Close what is open and stop the game first"); return; }
    if (creatorOpen) closeCreator();
    openPanel("#account");
    renderAccount();
    if (session) loadPremium();
  }

  function bind() {
    $a("btn-account").addEventListener("click", open);
    $a("account-close").addEventListener("click", closePanels);
    $a("account").addEventListener("click", (e) => { if (e.target.id === "account") closePanels(); });
    $a("ac-login").addEventListener("click", () => submit("in"));
    $a("ac-signup").addEventListener("click", () => submit("up"));
    $a("ac-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") submit("in"); });
    $a("ac-save").addEventListener("click", () => saveNow(false));
    $a("ac-logout").addEventListener("click", logOut);
    $a("ac-refresh").addEventListener("click", async () => { const p = await loadPremium(); toast(p ? "Premium is active. Thank you!" : "No Premium on this account yet"); });
    renderAccount();
    if (session) { freshToken().then((t) => { if (t) { loadPremium(); } }); }
    setInterval(() => { if (session && !document.hidden) saveNow(true); }, 30000);
    document.addEventListener("visibilitychange", () => { if (document.hidden && session) saveNow(true); });
  }

  return {
    configured, bind, open, saveNow, loadPremium,
    token: () => (session && session.expires_at - Date.now() / 1000 > 5 ? session.access_token : null),
    get loggedIn() { return !!session; },
    get email() { return session ? session.email : ""; },
    get userId() { return session ? session.id : ""; },
    get premium() { return premium; },
    onChange(f) { listeners.push(f); },
  };
})();
