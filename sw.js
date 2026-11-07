"use strict";
// The service worker: the page works when the internet is slow, patchy or gone. The first time a computer opens the game with the internet on, this file saves all of the game's files in the
// browser (about 3 MB); from then on the page opens from that copy, so a school Wi-Fi that drops in the middle of a lesson changes nothing: the game itself needs no internet in class mode. Only
// the teacher dashboard and playing against other people need it. Pages (the front page, the teacher page) are fetched from the internet first, for three seconds, so a new version arrives as soon
// as there is one; the game's own files carry their version in the address (?v=), so they are taken from the saved copy and the right ones are fetched whenever the version changes. The saved copy
// belongs to one version (sw.js?v=N): a new version saves its own and throws the old one away. Registered by swreg.js. Nothing is saved from other sites (the game server is never touched).

const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const CACHE = `tm-${VERSION}`;

// every file the front page uses: read from the front page itself, so this list can never be out of date
async function assets() {
  const html = await (await fetch("./index.html", { cache: "no-store" })).text();
  const urls = new Set(["./", "./index.html", "./favicon.svg"]);
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const u = new URL(m[1], self.location.href);
    if (u.origin === self.location.origin && !u.pathname.endsWith("/guide/") && !/\.html$/.test(u.pathname.replace("index.html", ""))) urls.add(u.pathname + u.search);
  }
  return [...urls];
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const list = await assets();
    await Promise.all(list.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => { /* a missing file must not stop the rest */ })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("tm-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), ms))]);

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;           // (the game server and everything else: not ours)
  if (url.pathname.startsWith("/guide/")) return;
  if (req.mode === "navigate") {                                                     // pages: the internet first (three seconds), then the saved copy
    e.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), 3000);
        if (res.ok && (url.pathname === "/" || /\/(index|class|class-live)\.html$/.test(url.pathname))) { const c = await caches.open(CACHE); c.put(new Request(url.origin + url.pathname), res.clone()); }
        return res;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match(url.origin + url.pathname)) || (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }
  e.respondWith((async () => {                                                       // the game's files: the saved copy first
    const cache = await caches.open(CACHE), hit = await cache.match(req);
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
    catch (err) { return Response.error(); }
  })());
});
