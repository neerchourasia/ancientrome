"use strict";
// Teacher login for class.html and class-live.html. Making class links and watching a class need an account (Google, or email and password): the page stays hidden until someone is logged in.
// It uses the same Supabase accounts and the same saved login (localStorage "rome-session") as the game, so logging in on one logs in on the other. This file stands alone (account.js depends on
// the game). Students never log in: class links and codes work without an account.
// The class keys (the secrets that let the dashboard read a class: one for each of the teacher's classes) are kept in the teacher's account (Supabase user_metadata.classes), so they follow the teacher to any computer and never have to
// travel in a link. The first time, the key a browser already had (rome-class-key from before logins) is moved into the account, so class links already given out keep working.
// "Continue with Google" needs Google to be switched on in the Supabase dashboard (Authentication > Providers > Google); until it is, a friendly message is shown.

const TeacherAuth = (() => {
  const cfg = window.ROME_CONFIG || {};
  const base = String(cfg.supabaseUrl || "").replace(/\/+$/, ""), anon = String(cfg.supabaseAnonKey || "");
  const configured = (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) && anon.length > 10;
  const SESSION_KEY = "rome-session", OLD_KEY = "rome-class-key", CONSENT = "rome-consent";
  let session = null, onReady = null, oauth = null, oauthError = "", busy = false, bar = null;

  // ---------------------------------------------------------------- Supabase
  async function api(path, opt = {}) {
    const headers = { apikey: anon, "Content-Type": "application/json", Authorization: "Bearer " + (opt.token || anon) };
    const res = await fetch(base + path, { method: opt.method || (opt.body ? "POST" : "GET"), headers, body: opt.body ? JSON.stringify(opt.body) : undefined });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
    if (!res.ok) {
      const err = new Error(data && (data.msg || data.error_description || data.message || data.error) ? String(data.msg || data.error_description || data.message || data.error) : `Error ${res.status}`);
      err.status = res.status; throw err;
    }
    return data;
  }
  const sessionFrom = (d) => (d && d.access_token && d.user ? { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), id: d.user.id, email: d.user.email || "" } : null);
  const store = (s) => { session = s; try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } };
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (s && typeof s.access_token === "string" && typeof s.refresh_token === "string" && typeof s.id === "string" && typeof s.email === "string") session = s;
  } catch (e) { /* storage unavailable */ }
  // back from Google: the login (or an error) is in the address after the #
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (h.get("access_token") && h.get("refresh_token")) oauth = { access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: Number(h.get("expires_in")) || 3600 };
    else if (h.get("error")) oauthError = h.get("error_description") || h.get("error");
    if (oauth || oauthError) history.replaceState(null, "", location.pathname + location.search);
  } catch (e) { /* ignore */ }

  // a usable login token (renewed if it is about to run out), or null
  async function token() {
    if (!session) return null;
    if (session.expires_at - Date.now() / 1000 > 60) return session.access_token;
    try {
      const s = sessionFrom(await api("/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } }));
      if (!s) throw new Error("no session");
      store(s); return s.access_token;
    } catch (e) { if (e.status === 400 || e.status === 401) store(null); return null; }
  }

  // ---------------------------------------------------------------- the class key
  const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  const classId = async (k) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k))), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 8);
  // A teacher can have up to eight classes (a period 1, a period 2...): each has a name and its own secret key, kept in the account (user_metadata.classes = [{ n: name, k: key }]). The key the account
  // had before there were several (user_metadata.class_key, or the one a browser made before logins) becomes the first class, so class links already given out keep working.
  const MAX_CLASSES = 8, CUR_KEY = "rome-teacher-class";
  let list = [];
  const okKey = (k) => /^[0-9a-f]{32}$/.test(k || "");
  async function saveList() { await api("/auth/v1/user", { method: "PUT", token: await token(), body: { data: { classes: list } } }); }
  async function loadClasses() {
    const u = await api("/auth/v1/user", { token: await token() }), md = (u && u.user_metadata) || {};
    list = Array.isArray(md.classes) ? md.classes.filter((c) => c && okKey(c.k)).map((c) => ({ n: String(c.n || "Class").slice(0, 30), k: c.k })).slice(0, MAX_CLASSES) : [];
    if (!list.length) {
      let k = md.class_key;
      if (!okKey(k)) { try { k = localStorage.getItem(OLD_KEY) || ""; } catch (e) { k = ""; } }      // (the key this browser made before there were logins)
      if (!okKey(k)) k = hex(16);
      list = [{ n: "My class", k }];
      await saveList();
    }
    try { localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
    return list;
  }
  // the class this browser last looked at (by its id), or the first
  async function currentIndex() {
    let want = ""; try { want = localStorage.getItem(CUR_KEY) || ""; } catch (e) { /* ignore */ }
    for (let i = 0; i < list.length; i++) if (await classId(list[i].k) === want) return i;
    return 0;
  }
  async function choose(i) { try { localStorage.setItem(CUR_KEY, await classId(list[i].k)); } catch (e) { /* ignore */ } }
  async function addClass(name) { if (list.length >= MAX_CLASSES) throw new Error(`You can have up to ${MAX_CLASSES} classes.`); list.push({ n: String(name || `Class ${list.length + 1}`).slice(0, 30), k: hex(16) }); await saveList(); return list.length - 1; }
  async function renameClass(i, name) { if (list[i]) { list[i].n = String(name || "Class").slice(0, 30); await saveList(); } }
  async function removeClass(i) { if (list.length <= 1) throw new Error("Keep at least one class."); list.splice(i, 1); await saveList(); }

  // ---------------------------------------------------------------- the login box
  const consented = () => { try { return localStorage.getItem(CONSENT) === "1"; } catch (e) { return false; } };
  function build() {
    const st = document.createElement("style");
    st.textContent = `#t-login { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: #1c1610; }
      #t-login .card { width: min(420px, 100%); background: #2a2118; border: 1px solid rgba(226,185,85,.35); border-radius: 12px; padding: 20px; display: grid; gap: 12px; color: #f1ead8; font: 16px/1.5 system-ui, sans-serif; }
      #t-login h1 { margin: 0; font: 700 1.5rem Georgia, serif; } #t-login p { margin: 0; color: #c9bd9f; } #t-login label { display: grid; gap: 4px; font-weight: 600; }
      #t-login input[type=email], #t-login input[type=password] { font: inherit; padding: 9px 10px; border-radius: 8px; border: 1px solid rgba(226,185,85,.35); background: #14100b; color: #f1ead8; }
      #t-login .g { display: flex; align-items: center; justify-content: center; gap: 10px; font: 600 1rem system-ui; cursor: pointer; padding: 11px 14px; border: 1px solid #dadce0; border-radius: 8px; color: #3c4043; background: #fff; }
      #t-login .or { display: flex; align-items: center; gap: 10px; color: #c9bd9f; font-size: .85rem; } #t-login .or::before, #t-login .or::after { content: ""; flex: 1; border-top: 1px solid rgba(226,185,85,.3); }
      #t-login .row { display: flex; gap: 10px; flex-wrap: wrap; } #t-login .b { font: 700 1rem system-ui; cursor: pointer; padding: 10px 16px; border: 0; border-radius: 8px; color: #2a2118; background: #e2b955; }
      #t-login .chk { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; font-size: .9rem; } #t-login .chk input { margin-top: 4px; width: 18px; height: 18px; } #t-login a { color: #e2b955; }
      #t-msg { min-height: 1.3em; color: #c9bd9f; } #t-msg.bad { color: #f0a090; }
      #t-bar { display: flex; gap: 12px; justify-content: flex-end; align-items: center; padding: 8px 14px; font: 14px system-ui, sans-serif; color: #c9bd9f; background: #14100b; border-bottom: 1px solid rgba(226,185,85,.25); }
      #t-bar button { font: 600 .85rem system-ui; cursor: pointer; padding: 5px 12px; border: 1px solid rgba(226,185,85,.5); border-radius: 6px; color: #e2b955; background: transparent; }`;
    document.head.append(st);
    const box = document.createElement("div");
    box.id = "t-login"; box.hidden = true;
    box.innerHTML = `<div class="card" role="dialog" aria-label="Teacher login">
      <h1>Teacher login</h1>
      <p>Log in to make class links and to watch your class. Students never need to log in.</p>
      <button type="button" class="g" id="t-google"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>Continue with Google</span></button>
      <div class="or">or use your email</div>
      <label>Email <input id="t-email" type="email" autocomplete="email" maxlength="254"></label>
      <label>Password <input id="t-pass" type="password" autocomplete="current-password" maxlength="72" placeholder="at least 8 characters"></label>
      <label class="chk"><input id="t-age" type="checkbox"><span>I am an adult (a teacher) and I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
      <div class="row"><button type="button" class="b" id="t-in">Log in</button><button type="button" class="b" id="t-up">Create account</button></div>
      <p id="t-msg" role="status"></p>
      <p><small>Forgot your password? Reset it on the game's login screen (Log in &rarr; Forgot your password?), then come back here.</small></p>
    </div>`;
    document.body.append(box);
    const $ = (id) => document.getElementById(id);
    $("t-google").addEventListener("click", google);
    $("t-in").addEventListener("click", () => emailLogin("in"));
    $("t-up").addEventListener("click", () => emailLogin("up"));
    $("t-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") emailLogin("in"); });
  }
  const $t = (id) => document.getElementById(id);
  const say = (t, bad) => { const m = $t("t-msg"); if (!m) return; m.textContent = t; m.classList.toggle("bad", !!bad); };
  const showApp = (on) => { const app = document.getElementById("t-app"); if (app) app.hidden = !on; const box = $t("t-login"); if (box) box.hidden = on; };

  async function emailLogin(kind) {
    if (busy) return;
    const email = $t("t-email").value.trim(), password = $t("t-pass").value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say("Please enter a valid email address.", true);
    if (password.length < 8) return say("Your password needs at least 8 characters.", true);
    if (kind === "up" && !$t("t-age").checked) return say("Please tick the box to say you are an adult and agree to the Terms and Privacy Policy.", true);
    busy = true; say(kind === "up" ? "Creating your account..." : "Logging in...");
    try {
      let s;
      if (kind === "up") {
        s = sessionFrom(await api("/auth/v1/signup", { body: { email, password } }));
        if (!s) { say("Almost there: we sent a confirmation link to your email. Click it, then log in here.", false); return; }
        try { localStorage.setItem(CONSENT, "1"); } catch (e) { /* ignore */ }
      } else s = sessionFrom(await api("/auth/v1/token?grant_type=password", { body: { email, password } }));
      if (!s) throw new Error("Could not log in");
      store(s); $t("t-pass").value = ""; say(""); await enter();
    } catch (e) {
      say(/invalid login/i.test(e.message) ? "That email and password don't match." : /already/i.test(e.message) ? "That email already has an account. Try logging in." : e.message, true);
    } finally { busy = false; }
  }

  async function google() {
    if (busy) return;
    if (!$t("t-age").checked && !consented()) return say("Please tick the box to say you are an adult and agree to the Terms and Privacy Policy, then press Continue with Google again.", true);
    busy = true; say("Opening Google...");
    try {
      const st = await api("/auth/v1/settings");
      if (!st || !st.external || !st.external.google) { say("Google sign-in is not switched on for this site yet. Log in with your email and password for now.", true); return; }
      try { localStorage.setItem(CONSENT, "1"); } catch (e) { /* ignore */ }
      location.assign(`${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`);
    } catch (e) { say("Could not reach the sign-in service. Try again in a moment.", true); } finally { busy = false; }
  }

  // logged in: show the page, with a bar to log out, and give the page its class key
  async function enter() {
    try {
      await loadClasses();
      const idx = await currentIndex();
      showApp(true);
      if (!bar) {
        bar = document.createElement("div"); bar.id = "t-bar";
        const who = document.createElement("span"); who.textContent = `Logged in as ${session.email}`;
        const out = document.createElement("button"); out.type = "button"; out.textContent = "Log out";
        out.addEventListener("click", () => { store(null); location.reload(); });
        bar.append(who, out); document.body.prepend(bar);
      }
      if (onReady) { const f = onReady; onReady = null; await f({ email: session.email, key: list[idx].k, classes: list, index: idx }); }
    } catch (e) { store(null); showApp(false); say("Could not load your account: " + e.message, true); }
  }

  // the page calls this once: fn({ email, key, classes, index }) runs when a teacher is logged in (key is the key of the class last looked at)
  async function start(fn) {
    onReady = fn;
    build();
    showApp(false);
    if (!configured) { say("Logging in is not switched on yet. (The site owner connects accounts in config.js.)", true); return; }
    if (oauth) {
      try {
        const u = await api("/auth/v1/user", { token: oauth.access_token });
        if (!u || !u.id) throw new Error("Could not read your Google account");
        store({ access_token: oauth.access_token, refresh_token: oauth.refresh_token, expires_at: Math.floor(Date.now() / 1000) + oauth.expires_in, id: u.id, email: u.email || (u.user_metadata && u.user_metadata.email) || "" });
      } catch (e) { say("Google sign-in did not work: " + e.message, true); }
    } else if (oauthError) say("Google sign-in did not work: " + oauthError, true);
    if (await token()) await enter();
  }

  return { start, classId, addClass, renameClass, removeClass, choose, get classes() { return list; }, MAX_CLASSES, get email() { return session ? session.email : ""; } };
})();
