/* =====================================================================
   TechLab · «Просмотр учителя» для миссий и квестов.
   Обычный скрипт: ставится сразу ПОСЛЕ строки window.TL_READY=… в миссии.
   Открытие миссии с ?preview (кнопка «👁 Просмотр» в панели) учителем или администратором:
     • не нужен код ученика, миссия не обязана быть открыта;
     • имя и класс подставляются сами, вход нажимается сам;
     • все этапы открыты сразу — можно листать в любом порядке;
     • ничего не пишется в базу: в результатах учеников вас не будет.
   ===================================================================== */
(function () {
  if (!new URLSearchParams(location.search).has("preview")) return;
  var ROOT = (document.currentScript && document.currentScript.src || "").replace(/engine\/preview\.js.*$/, "");
  var ok = import(ROOT + "engine/preview-auth.js?v=1").then(function (m) { return m.isStaffPreview(); }).catch(function () { return false; });
  window.TL_PREVIEW = ok;
  // подменяем «мост» миссии: в режиме просмотра — без записи в базу
  var realResolve = window.__tlr;
  if (typeof realResolve === "function") {
    window.__tlr = function (real) {
      realResolve({
        isOpen: function () { return ok.then(function (p) { return p ? true : real.isOpen(); }); },
        start: function (d) { return ok.then(function (p) { return p ? "preview" : real.start(d); }); },
        progress: function (id, o) { return id === "preview" ? Promise.resolve() : real.progress(id, o); },
        submit: function (id, o) { return id === "preview" ? Promise.resolve(true) : real.submit(id, o); }
      });
    };
  }
  ok.then(function (p) {
    if (!p) return;
    // все этапы открыты
    try { if (typeof window.unlocked === "function") window.unlocked = function () { return true; }; } catch (e) {}
    var go = function () {
      // свежий черновик: прошлый просмотр не мешает
      try { Object.keys(localStorage).forEach(function (k) { if (/^techlab_(tech\d|inf\d|geo\d|math\d)/.test(k)) { var v = JSON.parse(localStorage.getItem(k) || "null"); if (v && /Просмотр/.test(v.fio || v.name || "")) localStorage.removeItem(k); } }); } catch (e) {}
      var fio = document.getElementById("fio") || document.getElementById("inName");
      var cls = document.getElementById("cls") || document.getElementById("inCls");
      if (fio && !fio.value) { fio.value = "Просмотр Учителя"; fio.dispatchEvent(new Event("input", { bubbles: true })); }
      if (cls && cls.tagName === "SELECT" && !cls.value) {
        for (var i = 0; i < cls.options.length; i++) if (cls.options[i].value) { cls.selectedIndex = i; break; }
        cls.dispatchEvent(new Event("change", { bubbles: true }));
      }
      var form = document.getElementById("login");
      setTimeout(function () {
        if (form && form.tagName === "FORM" && form.requestSubmit) form.requestSubmit();
        else { var b = document.getElementById("go") || (form && form.querySelector("button")); if (b) b.click(); }
      }, 150);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else setTimeout(go, 50);
  });
})();
