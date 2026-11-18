// =====================================================================
//  TechLab · «Исходящие» — страховка ответов учеников при плохом интернете.
//
//  Если ответ или сдача работы не дошли до сервера, они сохраняются здесь,
//  в памяти этого компьютера (localStorage), и отправляются заново:
//  каждые 15 секунд, при появлении интернета и при открытии любой страницы TechLab.
//  Пока что-то не отправлено, внизу экрана висит заметная плашка.
//
//  Подключается и как обычный <script>, и через import — работает одинаково.
// =====================================================================
(function () {
  if (window.TLOutbox) return;
  var KEY = "techlab_outbox";
  var DAYS = 7;
  var busy = false;

  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "[]");
      var lim = Date.now() - DAYS * 864e5;
      return Array.isArray(a) ? a.filter(function (x) { return x && x.url && x.at > lim; }) : [];
    } catch (e) { return []; }
  }
  function save(a) {
    try { if (a.length) localStorage.setItem(KEY, JSON.stringify(a)); else localStorage.removeItem(KEY); } catch (e) {}
    paint();
  }
  // Записи для одного адреса склеиваем: для PATCH — поля объединяются (новые важнее), для PUT — берётся последняя.
  function put(url, method, body) {
    var a = load(), old = null;
    for (var i = 0; i < a.length; i++) if (a[i].url === url) { old = a[i]; a.splice(i, 1); break; }
    var b = body;
    if (old && method === "PATCH" && old.method === "PATCH" && old.body && typeof old.body === "object" && body && typeof body === "object") {
      b = Object.assign({}, old.body, body);
    } else if (old && method === "PATCH" && old.method === "PUT" && old.body && typeof old.body === "object" && body && typeof body === "object") {
      // PUT, а потом PATCH к нему — достаточно отправить один PUT с изменениями
      b = Object.assign({}, old.body);
      for (var k in body) setPath(b, k, body[k]);
      method = "PUT";
    }
    a.push({ url: url, method: method, body: b, at: old ? old.at : Date.now(), n: 0 });
    save(a);
  }
  function setPath(o, path, v) {
    var p = String(path).split("/").filter(Boolean), cur = o;
    for (var i = 0; i < p.length - 1; i++) { if (!cur[p[i]] || typeof cur[p[i]] !== "object") cur[p[i]] = {}; cur = cur[p[i]]; }
    if (v === null) delete cur[p[p.length - 1]]; else cur[p[p.length - 1]] = v;
  }
  function peek(url) { var a = load(); for (var i = 0; i < a.length; i++) if (a[i].url === url) return a[i]; return null; }
  function drop(url) { save(load().filter(function (x) { return x.url !== url; })); }

  function send(x, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 8000);
    return fetch(x.url, { method: x.method, body: JSON.stringify(x.body), cache: "no-store", keepalive: JSON.stringify(x.body).length < 60000,
      headers: { "Content-Type": "application/json" }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(t); return r.status; }, function () { clearTimeout(t); return 0; });
  }

  function flush() {
    if (busy) return Promise.resolve();
    var a = load(); if (!a.length) { paint(); return Promise.resolve(); }
    busy = true; paint("sending");
    var i = 0;
    function next() {
      var cur = load(); if (i >= cur.length) return done();
      var x = cur[i];
      return send(x).then(function (st) {
        if (st >= 200 && st < 300) { drop(x.url); return next(); }
        if (st === 401 || st === 403) { console.warn("TechLab: сервер не принял запись", x.url); drop(x.url); return next(); }
        i++; return next();                          // нет связи — попробуем позже
      });
    }
    function done() { busy = false; paint(); }
    return next();
  }

  // ---------- плашка внизу экрана ----------
  var el = null;
  function paint(state) {
    if (!document.body) return;
    var n = load().length;
    if (!n) { if (el) { el.remove(); el = null; } return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "tlOutbox";
      el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:420px;background:#FFF4E5;color:#7A3E00;" +
        "border:2px solid #F0A040;border-radius:14px;padding:10px 14px;font:600 14px/1.35 Roboto,Arial,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.18)";
      document.body.appendChild(el);
    }
    el.innerHTML = "⚠ <b>Нет связи с сервером.</b> Ответы сохранены на этом компьютере и отправятся сами, как только появится интернет. " +
      "Не очищайте браузер. <button type='button' style='margin-left:6px;font:inherit;font-weight:700;border:0;border-radius:8px;padding:4px 10px;background:#F0A040;color:#fff;cursor:pointer'>" +
      (state === "sending" ? "Отправляю…" : "Отправить сейчас (" + n + ")") + "</button>";
    el.querySelector("button").onclick = flush;
  }

  window.TLOutbox = { put: put, peek: peek, drop: drop, flush: flush, send: send, count: function () { return load().length; }, paint: paint };
  window.addEventListener("online", function () { setTimeout(flush, 800); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") flush(); });
  setInterval(flush, 15000);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(flush, 1200); });
  else setTimeout(flush, 1200);
})();
