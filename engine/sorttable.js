// TechLab · сортировка таблиц результатов щелчком по заголовку столбца.
// Работает и когда таблица перерисовывается при новых данных: выбранная сортировка сохраняется.
(function () {
  var SEL = "table.res:not(.calc-t):not(.scale-t), table.bd-table";
  var KEY = "tl_sort_" + location.pathname;
  var state = {};
  try { state = JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch (e) { state = {}; }

  var st = document.createElement("style");
  st.textContent = "th.tl-s{cursor:pointer;user-select:none;white-space:nowrap}th.tl-s:hover{color:#2E4BFF}" +
    "th.tl-s::after{content:' ⇅';opacity:.35;font-size:.9em}th.tl-s.asc::after{content:' ▲';opacity:1;color:#2E4BFF}th.tl-s.desc::after{content:' ▼';opacity:1;color:#2E4BFF}";
  document.head.appendChild(st);

  var DATE = /(\d{2})\.(\d{2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/;
  function cellKey(td) {
    if (!td) return null;
    if (td.hasAttribute("data-sort")) { var v = td.getAttribute("data-sort"); return v === "" ? null : (isNaN(+v) ? v.toLowerCase() : +v); }
    var t = (td.textContent || "").replace(/\s+/g, " ").trim();
    if (!t || t === "—" || t === "…" || t === "-") return null;
    var d = t.match(DATE);
    if (d) return new Date(+d[3], +d[2] - 1, +d[1], +(d[4] || 0), +(d[5] || 0)).getTime();
    // число: «38 / 40», «≈4 · проверить 5», «85%», «7»; а «11 «В»» — это класс, текст
    var n = t.replace(/^[≈~]/, "").match(/^-?\d+(?:[.,]\d+)?(?=\s*(?:\/|·|%|$))/);
    if (n) {
      // «9. DIACON SOFIA» — это номер в журнале перед фамилией, а не число
      if (/^\d+\.\s+\D/.test(t)) return t.replace(/^\d+\.\s+/, "").toLowerCase();
      return parseFloat(n[0].replace(",", "."));
    }
    return t.replace(/^\d+\.\s+/, "").toLowerCase();     // «9. DIACON SOFIA» — номер из журнала не мешает фамилии
  }
  function headText(th) { return (th.textContent || "").replace(/[⇅▲▼]/g, "").trim(); }
  function tid(table) { var all = document.querySelectorAll(SEL); return Array.prototype.indexOf.call(all, table); }

  // таблицы результатов с «Завершить / Блок» сортирует engine/restable.js — здесь их не трогаем
  function own(table) { return table.classList.contains("tl-own"); }
  function apply(table) {
    if (own(table)) return;
    var tb = table.tBodies[0]; if (!tb) return;
    var s = state[tid(table)];
    var ths = table.tHead ? table.tHead.rows[0].cells : [];
    for (var i = 0; i < ths.length; i++) ths[i].classList.remove("asc", "desc");
    if (!s) return;
    var col = -1;
    for (var j = 0; j < ths.length; j++) if (headText(ths[j]) === s.h) col = j;
    if (col < 0) return;
    ths[col].classList.add(s.d > 0 ? "asc" : "desc");
    var rows = Array.prototype.slice.call(tb.rows);
    if (rows.length < 2 || rows.some(function (r) { return r.cells.length < 2; })) return;
    var keyed = rows.map(function (r, i) { return { r: r, k: cellKey(r.cells[col]), i: i }; });
    keyed.sort(function (a, b) {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1;            // пустые — всегда в конце
      if (b.k === null) return -1;
      var c = (typeof a.k === "number" && typeof b.k === "number") ? a.k - b.k
        : String(a.k).localeCompare(String(b.k), "ru", { numeric: true });
      return c * s.d || a.i - b.i;
    });
    var numCol = headText(ths[0]) === "№";
    var same = keyed.every(function (x, n) { return x.r === rows[n]; });
    // менять DOM только если порядок действительно другой — иначе наблюдатель зациклится
    if (!same) keyed.forEach(function (x) { tb.appendChild(x.r); });
    if (numCol) keyed.forEach(function (x, n) { if (x.r.cells[0].textContent !== String(n + 1)) x.r.cells[0].textContent = n + 1; });
  }

  function prepare(table) {
    if (own(table)) return;
    if (!table.tHead || !table.tHead.rows[0]) return;
    var ths = table.tHead.rows[0].cells;
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i], h = headText(th);
      if (!h || h === "№" || th.classList.contains("tl-s")) continue;
      th.classList.add("tl-s"); th.title = "Сортировать по столбцу «" + h + "»";
      th.addEventListener("click", function (ev) {
        var th = ev.currentTarget, t = th.closest("table"), id = tid(t), h = headText(th), cur = state[id];
        // первый щелчок: числа и даты — по убыванию (лучшие и свежие сверху), текст — по алфавиту
        var first = (h.match(/Ученик|Класс|Фамил|Статус|Elev|Student|Name|Clas/i)) ? 1 : -1;
        state[id] = { h: h, d: cur && cur.h === h ? -cur.d : first };
        try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
        apply(t);
      });
    }
    if (!table.__tlObs) {
      table.__tlObs = new MutationObserver(function () { prepare(table); });
      table.__tlObs.observe(table, { childList: true, subtree: true });
    }
    apply(table);
  }

  function scan() { document.querySelectorAll(SEL).forEach(prepare); }
  new MutationObserver(function () { scan(); }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== "loading") scan(); else document.addEventListener("DOMContentLoaded", scan);
})();
