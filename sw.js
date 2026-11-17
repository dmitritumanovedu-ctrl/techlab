// TechLab · service worker: быстрый запуск, установка как приложение, экран «нет интернета».
// Стратегия «сначала сеть, но не дольше 4 секунд»: ученики получают свежие тесты,
// а если интернет тормозит — сразу открывается сохранённая копия (и обновляется в фоне).
// Ответы тестов хранятся в Firebase и через этот файл НЕ проходят.
const CACHE = "techlab-v10";
const NET_WAIT = 4000;
const SHELL = ["./", "index.html", "style-e2.css?v=9", "theme-classroom.css?v=3", "start-e2.js?v=16", "home.js?v=13", "engine/review.js?v=1", "engine/guard.js?v=2", "engine/shell.js?v=2", "install.js?v=2", "tests.js?v=8",
  "firebase-config.js", "engine/people.js?v=2", "engine/people.js?v=3", "engine/i18n.js?v=1", "engine/fbrest.js?v=1", "engine/nav.js?v=2",
  "manifest.webmanifest", "offline.html", "privacy.html", "demo/", "engine/consent.js?v=2",
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
    const net = fetch(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));                                   // сеть дописывает кэш даже после ответа из кэша
    const hit = await caches.match(req);
    if (!hit) {                                                          // в кэше нет — ждём сеть сколько нужно
      try { return await net; }
      catch (err) { return req.mode === "navigate" ? ((await caches.match("offline.html")) || Response.error()) : Response.error(); }
    }
    // в кэше есть: даём сети 4 секунды, потом отдаём сохранённую копию
    const slow = new Promise((ok) => setTimeout(() => ok(hit), NET_WAIT));
    try { return await Promise.race([net, slow]); } catch (err) { return hit; }
  })());
});
