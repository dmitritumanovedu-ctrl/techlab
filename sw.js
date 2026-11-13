// TechLab · service worker: быстрый запуск, установка как приложение, экран «нет интернета».
// Стратегия «сначала сеть»: ученики всегда получают свежие тесты, а кэш — только запасной вариант.
// Ответы тестов хранятся в Firebase и через этот файл НЕ проходят.
const CACHE = "techlab-v2";
const SHELL = ["./", "index.html", "style-e2.css?v=8", "start-e2.js?v=8", "home.js?v=5", "install.js?v=1", "tests.js?v=8",
  "firebase-config.js", "engine/people.js?v=1", "manifest.webmanifest", "offline.html", "privacy.html", "demo/", "engine/consent.js?v=1",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // Firebase, шрифты, CDN — напрямую
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match("offline.html")) || Response.error();
      return Response.error();
    }
  })());
});
