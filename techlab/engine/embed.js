// TechLab · страница учителя внутри панели администратора (iframe).
// Прячет свою шапку и боковые колонки — меню даёт сама панель.
// Ссылки на панель администратора и на стартовую открываются во всём окне, а не внутри рамки.
(function () {
  var inFrame = false;
  try { inFrame = window.self !== window.top && window.top.location.pathname.indexOf("/admin/") !== -1; } catch (e) { inFrame = false; }
  if (!inFrame) return;
  document.documentElement.classList.add("embed");
  var st = document.createElement("style");
  st.textContent = "html.embed header.top, html.embed .bd-top, html.embed .rz-top, html.embed .ad-side, html.embed .sh-l, html.embed .sh-r, html.embed .backlink, html.embed #siteFoot{display:none!important}" +
    "html.embed .sh{grid-template-columns:minmax(0,1fr)!important;max-width:none!important}html.embed .ad-app{grid-template-columns:1fr!important;background:none!important}" +
    "html.embed body{background:transparent}html.embed .rz-main,html.embed .ad-main{padding-top:8px}";
  document.head.appendChild(st);
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    var u = new URL(a.href, location.href);
    if (u.origin !== location.origin) return;
    var p = u.pathname;
    if (p.indexOf("/admin/") !== -1 || !/\/(teacher|b)\//.test(p)) { e.preventDefault(); window.top.location.href = u.href; }
  }, true);
})();
