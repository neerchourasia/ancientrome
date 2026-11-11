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
  // Arriving from "Continue with Google": Supabase sends the browser back here with the login in the address (after the #), or with an error
  let oauth = null, oauthError = "";
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("access_token") && h.get("refresh_token") && h.get("type") !== "recovery") { oauth = { access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: Number(h.get("expires_in")) || 3600 }; history.replaceState(null, "", location.pathname + location.search); }
    else if (h.get("error") && !recoveryToken) { oauthError = h.get("error_description") || h.get("error"); history.replaceState(null, "", location.pathname + location.search); }
  } catch (e) { /* ignore */ }
  let session = null, lastSaved = "", listeners = [], busy = false;
  // Logging in is required whenever accounts are switched on: until someone is logged in, the account screen sits over the game and cannot be closed.
  let gateOpen = false, gateDone = null, leaving = false;
  // The demo: play without an account. Nothing is saved to an account and the online parts (other players, chat, friends) stay off until someone logs in.
  // OFFLINE: 📴 Play offline on the front page (no login, no internet, no time limit and no limit on denarii): the game is saved in this browser (localStorage) and only the parts that need the game server or
  // the account (other players, chat, friends, the market, the cloud save) are off. The game's own files are kept by the offline copy in the browser (sw.js) once the page has been opened online one time.
  let demo = false, demoOver = false, demoTimer = 0, capNoted = 0, classMode = false, offline = false;
  const DEMO_MS = 10 * 60 * 1000, DEMO_COINS = 1000, DEMO_KEY = "rome-demo-end";
  const GATE_TEXT = "You need an account to play. Log in, or create one in a few seconds: your game is saved to it and follows you to any device.";
  const DEMO_OVER_TEXT = "Your demo has ended. Log in, or create a free account in a few seconds, to keep playing: your game is saved to it and follows you to any device.";
  // When this device last saw the saved game on the server (the moment it was saved). If the server's copy is newer, another device (or an older
  // version of this page) saved after us: we load it first, so a device that has been sitting on old progress never writes over a newer saved game.
  const SYNC_KEY = "rome-synced-at";
  let knownAt = "", ready = false;
  try { knownAt = localStorage.getItem(SYNC_KEY) || ""; } catch (e) { /* storage unavailable */ }
  const setKnown = (t) => { knownAt = t; try { localStorage.setItem(SYNC_KEY, t); } catch (e) { /* ignore */ } };

  // "Remember me": ticked (the default), the login is kept on this device until you log out; not ticked, it is kept only for this browser tab and is gone when the tab is closed.
  let remember = true;
  try { remember = localStorage.getItem("rome-remember") !== "0"; } catch (e) { /* storage unavailable */ }
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || "null");
    if (s && typeof s.access_token === "string" && typeof s.refresh_token === "string" && typeof s.id === "string" && typeof s.email === "string") session = s;
  } catch (e) { /* storage unavailable */ }

  const changed = () => {
    for (const f of listeners) { try { f(); } catch (e) { /* ignore */ } }
    renderAccount();
    // logged out while playing (the login ran out and could not be renewed): the account screen comes back over the game
    try { if (configured && !session && !leaving && !demo && typeof started !== "undefined" && started) gate(null); } catch (e) { /* the game is still loading */ }
  };

  function storeSession(s) {
    session = s;
    if (s) { demo = false; demoOver = false; offline = false; clearInterval(demoTimer); }
    try {
      const keep = remember ? localStorage : sessionStorage, other = remember ? sessionStorage : localStorage;
      if (s) { keep.setItem(SESSION_KEY, JSON.stringify(s)); other.removeItem(SESSION_KEY); } else { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); }
    } catch (e) { /* ignore */ }
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
        goods: Shopkeep.snapshot(),
        furniture: typeof Furnish !== "undefined" ? Furnish.snapshot() : {},
        friends: typeof Lives !== "undefined" ? Lives.snapshot() : {},
        mystery: typeof Mystery !== "undefined" ? Mystery.snapshot() : {},
        seasons: typeof Seasons !== "undefined" ? Seasons.snapshot() : {},
        tax: Tax.snapshot(),
        jobs: Jobs.snapshot(),
        ships: Shipyard.snapshot(),
        disease: Disease.snapshot(),
        social: Social.snapshot(),
        trade: typeof Trade !== "undefined" ? Trade.snapshot() : {},
        snorkel: typeof Cancun !== "undefined" ? Cancun.snorkelSnapshot() : { seen: [], rounds: 1 },
        daily: Gifts.snapshot(),
        estate: typeof Estate !== "undefined" ? Estate.snapshot() : {},
        treasure: typeof Treasure !== "undefined" ? Treasure.snapshot() : {},
        ventures: typeof Ventures !== "undefined" ? Ventures.snapshot() : {},
        stocks: typeof Exchange !== "undefined" ? Exchange.snapshot() : {},
        events: typeof Events !== "undefined" ? Events.snapshot() : {},
        ach: typeof Achievements !== "undefined" ? Achievements.snapshot() : {},
        fish: typeof Fishing !== "undefined" ? Fishing.snapshot() : {},
        tmap: typeof TreasureMaps !== "undefined" ? TreasureMaps.snapshot() : {},
        story: typeof Story !== "undefined" ? Story.snapshot() : {},
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
    if (p.goods && typeof p.goods === "object") Shopkeep.restore(p.goods);
    if (p.furniture && typeof p.furniture === "object" && typeof Furnish !== "undefined") Furnish.restore(p.furniture);
    if (p.friends && typeof p.friends === "object" && typeof Lives !== "undefined") Lives.restore(p.friends);
    if (p.mystery && typeof p.mystery === "object" && typeof Mystery !== "undefined") Mystery.restore(p.mystery);
    if (p.seasons && typeof p.seasons === "object" && typeof Seasons !== "undefined") Seasons.restore(p.seasons);
    if (p.tax && typeof p.tax === "object") Tax.restore(p.tax);
    if (p.jobs && typeof p.jobs === "object") Jobs.restore(p.jobs);
    if (p.ships && typeof p.ships === "object") Shipyard.restore(p.ships);
    if (p.disease && typeof p.disease === "object") Disease.restore(p.disease);
    if (p.estate && typeof p.estate === "object" && typeof Estate !== "undefined") Estate.restore(p.estate);
    if (p.treasure && typeof Treasure !== "undefined") Treasure.merge(p.treasure);
    if (p.ventures && typeof p.ventures === "object" && typeof Ventures !== "undefined") Ventures.restore(p.ventures);
    if (p.stocks && typeof p.stocks === "object" && typeof Exchange !== "undefined") Exchange.restore(p.stocks);
    if (p.events && typeof p.events === "object" && typeof Events !== "undefined") Events.restore(p.events);
    if (p.ach && typeof p.ach === "object" && typeof Achievements !== "undefined") Achievements.restore(p.ach);
    if (p.fish && typeof p.fish === "object" && typeof Fishing !== "undefined") Fishing.restore(p.fish);
    if (p.tmap && typeof p.tmap === "object" && typeof TreasureMaps !== "undefined") TreasureMaps.restore(p.tmap);
    if (p.story && typeof p.story === "object" && typeof Story !== "undefined") Story.restore(p.story);
    if (p.social && typeof p.social === "object") Social.restore(p.social);
    if (p.trade && typeof p.trade === "object" && typeof Trade !== "undefined") Trade.restore(p.trade);
    if (p.daily && typeof p.daily === "object") Gifts.restore(p.daily);
    if (p.snorkel && typeof Cancun !== "undefined") Cancun.snorkelRestore(p.snorkel);
    if (p.time && Number.isFinite(p.time.hour) && Number.isFinite(p.time.day)) Time.setClock(p.time.hour, p.time.day);
  }

  // How far along a game is: days lived, things bought, sights found, shifts worked. When this device and the saved game disagree, the one that is further along wins,
  // so a device with little progress (a new one, or one that was left behind) can never wipe out a game that has a lot.
  const richness = (p) => {
    p = p || {};
    const items = p.owned && Array.isArray(p.owned.items) ? p.owned.items.length : 0, found = Array.isArray(p.discovered) ? p.discovered.length : 0;
    const houses = (p.estate && p.estate.owned && typeof p.estate.owned === "object" ? Object.keys(p.estate.owned).length : 0) + (p.ventures && p.ventures.biz ? Object.keys(p.ventures.biz).length : 0) + (p.ventures && p.ventures.museum ? 1 : 0);
    return (p.time && Number.isFinite(p.time.day) ? p.time.day : 0) + items * 3 + found * 3 + houses * 3 + (p.jobs && Number.isFinite(p.jobs.shifts) ? p.jobs.shifts : 0);
  };
  // This device is further along than the saved game: keep it, take in whatever the saved game has that this device lacks (things bought elsewhere), and save it all
  function keepMineOverServer(row, at) {
    const so = row.progress && row.progress.owned ? row.progress.owned : {}, mo = Market.snapshot();
    Market.restore({ house: Math.max(mo.house, so.house | 0), dhouse: Math.max(mo.dhouse, so.dhouse | 0), chouse: Math.max(mo.chouse | 0, so.chouse | 0), bhouse: Math.max(mo.bhouse | 0, so.bhouse | 0), items: [...new Set([...mo.items, ...(Array.isArray(so.items) ? so.items : [])])], worn: mo.worn });
    if (row.progress && row.progress.goods) Shopkeep.merge(row.progress.goods);
    if (typeof Treasure !== "undefined" && row.progress && row.progress.treasure) Treasure.merge(row.progress.treasure);
    if (typeof Ventures !== "undefined" && row.progress && row.progress.ventures) Ventures.merge(row.progress.ventures);
    if (typeof Exchange !== "undefined" && row.progress && row.progress.stocks) Exchange.merge(row.progress.stocks);
    if (typeof Events !== "undefined" && row.progress && row.progress.events) Events.merge(row.progress.events);
    if (typeof Achievements !== "undefined" && row.progress && row.progress.ach) Achievements.merge(row.progress.ach);
    if (typeof Fishing !== "undefined" && row.progress && row.progress.fish) Fishing.merge(row.progress.fish);
    if (typeof Story !== "undefined" && row.progress && row.progress.story) Story.merge(row.progress.story);
    if (typeof Estate !== "undefined" && row.progress && row.progress.estate) Estate.merge(row.progress.estate);   // the houses bought on the other device too
    if (at) setKnown(at);
    lastSaved = "";
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
    if (dirty && richness(mine.progress) > richness(row.progress)) {
      keepMineOverServer(row, at);
      if (!quiet) toast("This game is further along than the saved one, so it was kept and is being saved to your account");
      return true;
    }
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
    Market.restore({ house: Math.max(so.house, mo.house | 0), dhouse: Math.max(so.dhouse, mo.dhouse | 0), chouse: Math.max(so.chouse | 0, mo.chouse | 0), bhouse: Math.max(so.bhouse | 0, mo.bhouse | 0), items: [...new Set([...so.items, ...(mo.items || [])])], worn: so.worn.length ? so.worn : (mo.worn || []) });
    if (mine.progress.goods) Shopkeep.merge(mine.progress.goods);
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
        const mine = snapshot();                                                       // what this device has: things bought here before logging in are kept
        if (richness(mine.progress) > richness(rows[0].progress)) {                    // this device is further along than the saved game: it wins
          keepMineOverServer(rows[0], rows[0].updated_at);
          toast("Welcome back! The game on this device is further along than your saved one, so it was kept and saved");
        } else {
          apply(rows[0]);
          keepLocal(mine, rows[0]);
          if (rows[0].updated_at) setKnown(rows[0].updated_at);
          lastSaved = "";                                                              // the merged game is saved again at once
          toast("Welcome back! Your saved game is loaded");
        }
        await saveNow(true);
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
    if (kind === "up") { try { localStorage.setItem("rome-consent", "1"); } catch (e) { /* ignore */ } }
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
      try { remember ? localStorage.setItem("rome-login-email", email) : localStorage.removeItem("rome-login-email"); } catch (e) { /* ignore */ }
      say(""); changed();
      try { await sync(); } finally { unlock(); }   // the saved game is loaded first, then the game starts
    } catch (e) {
      say(/invalid login/i.test(e.message) ? "That email and password don't match." : /already/i.test(e.message) ? "That email already has an account. Try logging in." : e.message, true);
    } finally { busy = false; }
  }

  // "Continue with Google". Whoever signs in with Google for the first time gets an account (so the 13-or-older box must be ticked once on this device), and an existing account is simply logged in.
  // Supabase must have Google switched on (Authentication > Providers > Google in its dashboard): until it is, a friendly message is shown instead of an error page.
  const consented = () => { try { return localStorage.getItem("rome-consent") === "1"; } catch (e) { return false; } };
  async function googleLogin() {
    if (busy) return;
    const say = (t, bad) => { const m = $a("ac-msg"); m.textContent = t; m.classList.toggle("bad", !!bad); };
    if (!$a("ac-age").checked && !consented()) return say("Please confirm you are 13 or older and agree to the Terms and Privacy Policy (the box below), then press Continue with Google again.", true);
    busy = true; say("Opening Google...");
    try {
      const st = await api("/auth/v1/settings");
      if (!st || !st.external || !st.external.google) { say("Google sign-in is not switched on for this site yet. Log in with your email and password for now.", true); return; }
      try { localStorage.setItem("rome-consent", "1"); } catch (e) { /* ignore */ }
      location.assign(`${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`);
    } catch (e) { say("Could not reach the sign-in service. Try again in a moment.", true); } finally { busy = false; }
  }
  // back from Google: ask Supabase who this is, keep the login, load the saved game
  async function finishGoogle() {
    if (!oauth) return;
    const t = oauth; oauth = null;
    const say = (m, bad) => { const el = $a("ac-msg"); el.textContent = m; el.classList.toggle("bad", !!bad); };
    try {
      const u = await api("/auth/v1/user", { token: t.access_token });
      if (!u || !u.id) throw new Error("Could not read your Google account");
      storeSession({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Math.floor(Date.now() / 1000) + t.expires_in, id: u.id, email: u.email || (u.user_metadata && u.user_metadata.email) || "" });
      say(""); changed();
      try { await sync(); } finally { unlock(); }
    } catch (e) { say("Google sign-in did not work: " + e.message, true); open(); }
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
    leaving = true;
    storeSession(null); admin = false; lastSaved = "";
    if (token) { try { await api("/auth/v1/logout", { token, body: {} }); } catch (e) { /* the token is dropped here either way */ } }
    changed();
    toast("Logged out");
    if (configured) setTimeout(() => location.reload(), 600);   // back to the login screen with a clean game
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
    $a("ac-gate").hidden = !(gateOpen && !on && !recoveryToken);
    $a("ac-gate").textContent = demoOver ? DEMO_OVER_TEXT : GATE_TEXT;
    const st = $a("start");
    if (st && !$a("intro").classList.contains("hidden")) st.textContent = configured && !on ? "Play free" : "Enter Rome";
    for (const g of document.querySelectorAll("#intro [data-guest]")) g.hidden = on;   // "Log in" links are for people who are not logged in
    if (on) {
      $a("ac-who").textContent = session.email;
    }
    $a("btn-account").textContent = on ? `Account: ${session.email.split("@")[0].slice(0, 10)}` : demo ? "Log in to save" : "Log in";
    $a("demo-bar").hidden = !(demo && !on);
  }

  // The login screen that cannot be closed. `done` runs once someone has logged in.
  function gate(done) {
    if (!configured || session) { if (done) done(); return; }
    closePanels();
    gateDone = done || null; gateOpen = true;
    $a("account").classList.add("gate", "show");
    panelOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    for (const eye of document.querySelectorAll("#account .pw-eye")) { const box = eye.parentElement.querySelector("input"); if (box.type !== "password") eye.click(); }
    renderAccount();
  }
  // The demo lasts 10 minutes in all (counted from the first time it is started in this browser) and cannot earn past 1,000 denarii.
  // Returns false when this browser has used its demo up: the login screen is then what comes next.
  function startDemo() {
    let end = 0;
    try { end = Number(localStorage.getItem(DEMO_KEY)) || 0; } catch (e) { /* storage unavailable */ }
    if (!end) { end = Date.now() + DEMO_MS; try { localStorage.setItem(DEMO_KEY, String(end)); } catch (e) { /* ignore */ } }
    if (Date.now() >= end) { demoOver = true; renderAccount(); return false; }
    demo = true;
    const tick = () => {
      const left = end - Date.now();
      if (!demo || session) { clearInterval(demoTimer); return; }
      if (left <= 0) { clearInterval(demoTimer); demoOver = true; gate(null); return; }
      const m = Math.floor(left / 60000), sec = String(Math.floor(left / 1000) % 60).padStart(2, "0");
      $a("demo-text").textContent = `Demo: ${m}:${sec} left · up to ${DEMO_COINS.toLocaleString()} denarii · not saved, other players are off`;
    };
    clearInterval(demoTimer); demoTimer = setInterval(tick, 1000); tick();
    renderAccount();
    return true;
  }
  // Class mode (classmode.js): the demo's offline state without its timer or its limit on denarii, started by a teacher's link. Nothing is saved to an account, there is no login, and the other
  // players, chat and the game server stay off.
  function startClass(c) {
    demo = true; classMode = true; demoOver = false; clearInterval(demoTimer);
    const watched = !!(c && c.cid), bar = $a("demo-bar"), t = watched ? (typeof I18n !== "undefined" ? I18n.t("Class mode: {0} · your teacher can see your progress") : "Class mode: {0} · your teacher can see your progress").replace("{0}", c.name || "Class") : c && c.name ? (typeof I18n !== "undefined" ? I18n.t("Class mode: {0} · not saved · other players are off").replace("{0}", c.name) : `Class mode: ${c.name} · not saved · other players are off`) : (typeof I18n !== "undefined" ? I18n.t("Class mode · not saved · other players are off") : "Class mode · not saved · other players are off");
    $a("demo-text").textContent = t; $a("demo-login").hidden = true; $a("btn-account").hidden = true; bar.hidden = false;
    return true;
  }
  function startOffline() {
    demo = true; offline = true; classMode = false; demoOver = false; clearInterval(demoTimer);
    const T = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t), bar = $a("demo-bar");
    $a("demo-text").textContent = T("Offline: no internet needed · saved on this computer only · other players are off");
    $a("demo-login").textContent = T("Log in (needs internet)"); bar.hidden = false;
    renderAccount();
    return true;
  }
  function demoCapped() {
    if (Date.now() - capNoted < 20000) return;
    capNoted = Date.now();
    toast(`Demo limit: ${DEMO_COINS.toLocaleString()} denarii. Log in to keep earning.`);
  }
  function unlock() {
    if (!gateOpen || !session) return;
    gateOpen = false;
    $a("account").classList.remove("gate");
    closePanels();
    const f = gateDone; gateDone = null;
    if (f) f();
  }

  function open() {
    if (gateOpen) return;
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
    // Remember me: the choice is kept, and the email of a remembered login is filled in next time
    const rm = $a("ac-remember"), em = $a("ac-email");
    rm.checked = remember;
    try { if (remember) { const saved = localStorage.getItem("rome-login-email"); if (saved && !em.value) em.value = saved; } } catch (e) { /* ignore */ }
    rm.addEventListener("change", () => {
      remember = rm.checked;
      try { localStorage.setItem("rome-remember", remember ? "1" : "0"); if (!remember) localStorage.removeItem("rome-login-email"); } catch (e) { /* ignore */ }
      if (session) storeSession(session);                                                  // (moves a login that is already there to the right place)
    });
    $a("ac-login").addEventListener("click", () => submit("in"));
    $a("ac-signup").addEventListener("click", () => submit("up"));
    $a("ac-google").addEventListener("click", googleLogin);
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
    if (oauth) finishGoogle();
    else if (oauthError) { const iv = setInterval(() => { if (typeof started !== "undefined" && started && !panelOpen) { clearInterval(iv); open(); const m = $a("ac-msg"); m.textContent = "Google sign-in did not work: " + oauthError; m.classList.add("bad"); } }, 600); setTimeout(() => clearInterval(iv), 60000); }
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
    configured, bind, open, saveNow, gate, startDemo, startClass, startOffline, demoCapped, DEMO_COINS,
    get offline() { return offline && !session; },
    get classMode() { return classMode && !session; },
    why: (text) => (offline && !session ? (typeof I18n !== "undefined" ? I18n.t("This needs the internet, so it is off in offline mode.") : "This needs the internet, so it is off in offline mode.") : classMode ? (typeof I18n !== "undefined" ? I18n.t("Other players and the game server are off in class mode.") : "Other players and the game server are off in class mode.") : text),
    get demo() { return demo && !session; },
    get locked() { return gateOpen && configured && !session; },
    token: () => (session && session.expires_at - Date.now() / 1000 > 5 ? session.access_token : null),
    get loggedIn() { return !!session; },
    get email() { return session ? session.email : ""; },
    get admin() { return admin; },
    adminUsers,
    get userId() { return session ? session.id : ""; },
    onChange(f) { listeners.push(f); },
  };
})();
