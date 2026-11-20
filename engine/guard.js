/* =====================================================================
   TechLab · «Чистый компьютер для каждого ученика».
   Обычный (не модульный) скрипт: ставится В <head> каждой страницы теста / миссии / игры
   и выполняется РАНЬШЕ кода самой страницы.

   Беда была такая: миссии и тесты помнят незаконченную работу на компьютере
   (localStorage). Пришёл следующий класс — и игра открывалась с фамилией прошлого ученика.

   Теперь черновики «принадлежат» ученику, который вошёл по коду:
     • вошёл другой ученик (или никто) — чужие черновики стираются до запуска страницы;
     • в черновике миссии записано другое имя — он тоже стирается;
     • кнопка «сменить ученика» внутри миссии выходит из учётной записи
       и возвращает на стартовую страницу, где следующий ученик вводит свой код.
   ===================================================================== */
(function () {
  var OWN = "techlab_owner", SKEY = "techlab_student";
  // корень сайта = папка, где лежит engine/
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/engine\/guard\.js.*$/, "") : "/";
  })();

  // какие ключи — это черновики работ (а не настройки сайта)
  var DRAFT = /^techlab_(attempt_|tech\d|inf\d|geo\d|math\d|work_|game_)/;
  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  var L = ls(); if (!L) return;
  function session() { try { return JSON.parse(L.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-яăâîșşțţ0-9]+/gi, " ").trim().split(" ").sort().join(" "); }
  function drafts() { var out = []; for (var i = 0; i < L.length; i++) { var k = L.key(i); if (k && DRAFT.test(k)) out.push(k); } return out; }
  function purge(keep) {
    drafts().forEach(function (k) {
      if (keep) {
        // черновик миссии с именем — оставляем, только если это имя вошедшего ученика
        try { var v = JSON.parse(L.getItem(k)); if (v && typeof v === "object" && (v.fio || v.name) && norm(v.fio || v.name) === norm(keep)) return; } catch (e) {}
        if (k.indexOf("techlab_attempt_") === 0) return;   // попытка теста — проверяется по владельцу ниже
      }
      L.removeItem(k);
    });
  }
  var S = session(), me = S && S.code ? S.code : "";
  var owner = L.getItem(OWN);
  var last = Number(L.getItem(OWN + "_at")) || 0;
  L.setItem(OWN + "_at", String(Date.now()));
  // больше 50 минут никто не работал на этом компьютере — это уже другой урок
  if (Date.now() - last > 50 * 60000) { purge(null); L.setItem(OWN, me); }
  else if (owner === null || owner !== me) {
    purge(null);                                // сменился ученик → все черновики прошлого — прочь
    L.setItem(OWN, me);
  } else if (S) {
    purge(S.name);                              // тот же код, но в черновике чужое имя → прочь
  }
  // пока страница открыта, отмечаем «компьютер занят» (длинные тесты, например сессия на 90 минут)
  setInterval(function () { try { L.setItem(OWN + "_at", String(Date.now())); } catch (e) {} }, 60000);
  window.TechLabGuard = {
    purge: function () { purge(null); },
    // выйти из ученика полностью и уйти на стартовую страницу
    signOut: function () {
      purge(null);
      try { L.removeItem(SKEY); L.setItem(OWN, ""); } catch (e) {}
      location.replace(ROOT);
    }
  };

  // ---------- вход только по коду ----------
  // Тест, миссию или квест можно открыть, только войдя по своему коду: учитель видит, кто работал.
  // Без кода страница закрыта экраном «Войди по своему коду» → стартовая страница → вход → назад сюда.
  // Учитель на своём компьютере (вошёл в панель учителя через Google) видит страницу в режиме просмотра.
  if (!S) {
    var lockCss = document.createElement("style");
    lockCss.id = "tl-lock";
    lockCss.textContent = "html.tl-locked body>*:not(.tl-gate){display:none!important}" +
      ".tl-gate{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:20px;background:#F4F6FB;font-family:Roboto,Manrope,'Segoe UI',Arial,sans-serif;color:#0B1A3B}" +
      ".tl-gate .b{background:#fff;border:1px solid #DCE4F2;border-radius:16px;padding:28px 30px;max-width:440px;width:100%;box-sizing:border-box;text-align:center}" +
      ".tl-gate h1{font-size:24px;margin:0 0 8px}.tl-gate p{margin:0 0 18px;color:#556A92;font-size:15px;line-height:1.5}" +
      ".tl-gate a.go{display:block;background:#1A73E8;color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:14px;border-radius:10px}" +
      ".tl-gate a.go:hover{background:#1557B0}.tl-gate small{display:block;margin-top:14px;color:#6B7A99;font-size:13px}" +
      ".tl-gate small a{color:#1A73E8}.tl-teach{position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#FFF4DC;color:#5A4300;font:600 13px Arial,sans-serif;text-align:center;padding:6px}";
    document.head.appendChild(lockCss);
    document.documentElement.classList.add("tl-locked");
    var showGate = function () {
      if (!document.documentElement.classList.contains("tl-locked") || document.querySelector(".tl-gate")) return;
      var next = location.pathname + location.search;
      var g = document.createElement("div");
      g.className = "tl-gate";
      g.innerHTML = '<div class="b" role="dialog" aria-labelledby="tlg-h"><h1 id="tlg-h">Войди по своему коду</h1>' +
        '<p>Задания открываются только после входа. Код — на карточке, которую выдал учитель.</p>' +
        '<a class="go" href="' + ROOT + '?next=' + encodeURIComponent(next) + '#login">Ввести код</a>' +
        '<small>Нет карточки? Спроси у учителя. · <a href="' + ROOT + '">На стартовую</a></small></div>';
      document.body.appendChild(g);
    };
    var unlock = function () {
      document.documentElement.classList.remove("tl-locked");
      var g = document.querySelector(".tl-gate"); if (g) g.remove();
      var bn = document.createElement("div"); bn.className = "tl-teach";
      bn.textContent = "Режим учителя: просмотр без кода ученика";
      document.body.appendChild(bn);
    };
    // ?preview — «просмотр учителя» из панели: проверяем вход учителя и открываем страницу без кода
    var PVQ = /[?&]preview(=|&|$)/.test(location.search);
    if (PVQ) {
      import(ROOT + "engine/preview-auth.js?v=1").then(function (m) { return m.isStaffPreview(); }).catch(function () { return false; })
        .then(function (ok) {
          var go = function () { if (ok) { document.documentElement.classList.remove("tl-locked"); var g = document.querySelector(".tl-gate"); if (g) g.remove(); } else showGate(); };
          if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
        });
    } else if (document.body) showGate(); else document.addEventListener("DOMContentLoaded", showGate);
    // учитель вошёл на этом компьютере в панель учителя? (Firebase хранит вход в IndexedDB)
    try {
      var rq = indexedDB.open("firebaseLocalStorageDb");
      rq.onsuccess = function () {
        var db = rq.result;
        if (!db.objectStoreNames.contains("firebaseLocalStorage")) { db.close(); return; }
        var all = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAll();
        all.onsuccess = function () {
          var ok = (all.result || []).some(function (x) { return x && String(x.fbase_key || "").indexOf("firebase:authUser:") === 0 && x.value && x.value.email; });
          db.close();
          if (ok && !PVQ) { if (document.body) unlock(); else document.addEventListener("DOMContentLoaded", unlock); }
        };
      };
    } catch (e) {}
  }

  // «сменить ученика» / «выйти» внутри миссий и игр → полный выход на стартовую
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("#logout, [data-tl-switch]");
    if (!b || document.getElementById("home")) return;   // на стартовой своя кнопка
    e.preventDefault(); e.stopImmediatePropagation();
    window.TechLabGuard.signOut();
  }, true);
})();
