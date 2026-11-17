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
  // корень сайта = папка, где лежит engine/
  var ROOT = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/engine\/guard\.js.*$/, "") : "/";
  })();

  // «сменить ученика» / «выйти» внутри миссий и игр → полный выход на стартовую
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("#logout, [data-tl-switch]");
    if (!b || document.getElementById("home")) return;   // на стартовой своя кнопка
    e.preventDefault(); e.stopImmediatePropagation();
    window.TechLabGuard.signOut();
  }, true);
})();
