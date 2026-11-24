// =====================================================================
//  TechLab · удобная таблица результатов для всех страниц учителя.
//
//  Что делает (подключается одной строкой в teacher.js любой работы):
//   • строка «прилипает» к выделению: щелчок по строке — она подсвечивается,
//     как в Excel, и видно все баллы этого ученика; ↑ ↓ — следующая строка;
//   • шапка таблицы и столбцы «№» и «Ученик» не уезжают при прокрутке;
//   • щелчок по заголовку столбца — сортировка (по баллам, оценке, дате,
//     фамилии, классу, статусу…), второй щелчок — наоборот, третий — сброс;
//   • нумерация 1, 2, 3… сверху вниз всегда в текущем порядке;
//   • ⏹ «Завершить» и ⛔ «Блок» у каждого, кто пишет; ↩ «Продолжить»;
//   • ⏹ «Завершить у всех пишущих» — для выбранного класса или всех.
//
//  Подключение:
//    import { enhanceResults } from "../../engine/restable.js?v=1";
//    enhanceResults({ db, ref, update, path: P, records: () => RESULTS });
// =====================================================================
const CSS = `
.tl-wrap{max-height:calc(100vh - 140px);overflow:auto !important;position:relative}
.tl-wrap table.res{overflow:visible !important;border-collapse:separate !important;border-spacing:0}
.tl-wrap table.res thead th{position:sticky;top:0;z-index:3;background:var(--tl-head,#EEF3FA) !important;cursor:pointer;user-select:none;white-space:nowrap}
.tl-wrap table.res thead th:hover{background:#E1EAF7 !important}
.tl-wrap table.res thead th.tl-nosort{cursor:default}
.tl-wrap table.res thead th .tl-ar{color:#2E4BFF;font-size:11px;margin-left:3px}
.tl-wrap table.res thead th::after{content:none !important}
.tl-wrap table.res thead th:not(.tl-nosort):not(.tl-on)::after{content:" ⇅" !important;opacity:.35;font-size:.9em;color:inherit}
.tl-wrap table.res .tl-stk{position:sticky;z-index:2;background:var(--tl-bg,#fff)}
.tl-wrap table.res thead th.tl-stk{z-index:4}
.tl-wrap table.res tbody tr{cursor:pointer}
.tl-wrap table.res tbody tr:hover td{background:#F3F7FD !important}
.tl-wrap table.res tbody tr.tl-sel td{background:#FFF3C4 !important;box-shadow:inset 0 2px 0 #E0A800,inset 0 -2px 0 #E0A800}
.tl-wrap table.res tbody tr.tl-sel td:first-child{box-shadow:inset 3px 0 0 #E0A800,inset 0 2px 0 #E0A800,inset 0 -2px 0 #E0A800}
.tl-wrap table.res tbody td.tl-num{color:#8A93A6;font-weight:700;text-align:center}
.tl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 8px;font-size:14px}
.tl-bar .tl-sp{flex:1}
.tl-bar .tl-hint{color:#8A93A6;font-size:12.5px}
.tl-act{display:inline-flex;gap:4px;margin-left:4px;vertical-align:middle}
.tl-btn{border:1px solid #D5DCE8;background:#fff;border-radius:8px;padding:4px 9px;font:600 12.5px/1.2 inherit;cursor:pointer;white-space:nowrap;color:#1A2340}
.tl-btn:hover{border-color:#2E4BFF;background:#F0F4FF}
.tl-btn.stop{color:#9A5B00;border-color:#F0C873;background:#FFF8E6}
.tl-btn.stop:hover{background:#FFEFC2}
.tl-btn.block{color:#B3261E;border-color:#F2B8B5;background:#FFF1F0}
.tl-btn.block:hover{background:#FFE0DD}
.tl-btn.big{padding:8px 14px;font-size:14px}
.tl-btn:disabled{opacity:.45;cursor:default}
.tl-tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:6px;font-size:11.5px;font-weight:700;background:#FFE0DD;color:#B3261E;vertical-align:middle}
.tl-tag.t{background:#FFF1C9;color:#8A5A00}
.tl-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#1A2340;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.25)}
@media print{.tl-wrap{max-height:none;overflow:visible !important}.tl-bar,.tl-act{display:none !important}}
`;

const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem("tl_rt_" + k) || "null"); localStorage.setItem("tl_rt_" + k, JSON.stringify(v)); } catch (e) { return null; } };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function toast(msg) {
  const t = document.createElement("div"); t.className = "tl-toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}

// значение ячейки для сортировки: data-sort, число (24/24 → 24; ≈7 → 7), дата, текст
function cellKey(td) {
  if (!td) return { n: null, s: "" };
  const ds = td.getAttribute("data-sort");
  if (ds !== null && ds !== "") { const n = Number(ds); return isNaN(n) ? { n: null, s: ds.toLowerCase() } : { n, s: "" }; }
  const t = td.textContent.replace(/\s+/g, " ").trim();
  if (!t || /^[—–-]$/.test(t)) return { n: null, s: "", empty: true };
  const d = t.match(/(\d{2})\.(\d{2})\.(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (d) return { n: new Date(+d[3], +d[2] - 1, +d[1], +(d[4] || 0), +(d[5] || 0)).getTime(), s: "" };
  // число: «24», «24/24», «60 / 60», «≈7 · проверить 2», «85%», «7 из 10»; «12 «Б»» — это текст
  const m = t.match(/^[≈~]?\s*(-?\d+(?:[.,]\d+)?)\s*(?:$|\/|·|%|из\s|б\.?(?:\s|$)|\()/);
  if (m) return { n: parseFloat(m[1].replace(",", ".")), s: "" };
  return { n: null, s: t.toLowerCase() };
}

export function enhanceResults({ db, ref, update, path, records }) {
  if (!document.getElementById("tl-rt-css")) {
    const st = document.createElement("style"); st.id = "tl-rt-css"; st.textContent = CSS; document.head.appendChild(st);
  }
  const pageKey = location.pathname.replace(/\/index\.html$/, "/") + location.search.replace(/[?&](v|embed)=[^&]*/g, "");
  let sort = LS("sort:" + pageKey) || null;      // { col, dir }
  let selId = null;
  const setUp = new WeakSet();

  const P = () => (typeof path === "function" ? path() : path);
  const R = () => (records && records()) || {};
  const idOf = (tr) => tr?.querySelector("[data-open]")?.getAttribute("data-open") || tr?.getAttribute("data-id") || null;
  const write = (id, obj) => update(ref(db, `${P()}/${id}`), obj);

  async function finishOne(id, block) {
    const r = R()[id]; if (!r) return;
    const obj = { status: "submitted", reason: block ? "blocked" : "teacher", submittedAt: Date.now() };
    if (block) obj.blocked = true;
    await write(id, obj);
  }
  async function unlockOne(id) {
    const r = R()[id]; if (!r) return;
    await write(id, { status: "in_progress", reason: null, blocked: null, deadline: Math.max(r.deadline || 0, Date.now() + 10 * 60000) });
  }

  function apply(table) {
    const tb = table.tBodies[0]; if (!tb) return;
    const wrap = table.closest(".table-wrap") || table.parentElement;
    if (!setUp.has(table)) {
      setUp.add(table);
      table.classList.add("tl-own");                     // старая сортировка (sorttable.js) эту таблицу больше не трогает
      table.__tlObs?.disconnect();
      // снимаем обработчики старой сортировки (копия заголовка без них); класс tl-s оставляем, чтобы она не цеплялась снова
      [...table.tHead.rows[0].cells].forEach((th) => { const c = th.cloneNode(true); c.classList.add("tl-s"); c.classList.remove("asc", "desc"); th.replaceWith(c); });
      wrap.classList.add("tl-wrap");
      // фон для «прилипших» столбцов — как у таблицы
      let el = table, bg = "";
      while (el && el !== document.documentElement) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = c; break; } el = el.parentElement; }
      if (bg) wrap.style.setProperty("--tl-bg", bg);
      // заголовки: сортировка
      const ths = [...table.tHead.rows[0].cells];
      ths.forEach((th, i) => {
        const txt = th.textContent.trim();
        if (!txt || txt === "№") { th.classList.add("tl-nosort"); return; }
        th.title = "Нажмите, чтобы отсортировать";
        th.addEventListener("click", () => {
          if (!sort || sort.col !== i) sort = { col: i, dir: txt === "№" || /Ученик|Класс|Статус/.test(txt) ? 1 : -1 };
          else if (sort.dir === (txt === "№" || /Ученик|Класс|Статус/.test(txt) ? 1 : -1)) sort.dir = -sort.dir;
          else sort = null;
          LS("sort:" + pageKey, sort); refresh(table);
        });
      });
      // панель над таблицей
      if (!wrap.previousElementSibling?.classList.contains("tl-bar")) {
        const bar = document.createElement("div"); bar.className = "tl-bar";
        bar.innerHTML = `<button class="tl-btn stop big" data-tl="all">⏹ Завершить у всех пишущих</button>
          <span class="tl-sp"></span><span class="tl-hint">Щелчок по строке — выделить ученика (↑ ↓ — соседняя строка) · щелчок по заголовку — сортировка</span>`;
        wrap.parentElement.insertBefore(bar, wrap);
        bar.querySelector('[data-tl="all"]').onclick = async () => {
          const ids = [...tb.rows].map(idOf).filter((id) => id && R()[id]?.status === "in_progress");
          const cls = document.querySelector("#fCls")?.value;
          if (!ids.length) return toast("Сейчас никто не пишет" + (cls ? ` в ${cls}` : "") + ".");
          if (!confirm(`Завершить работу у ${ids.length} учеников${cls ? ` (${cls})` : ""}, которые сейчас пишут?\nБудут засчитаны уже сохранённые ответы.`)) return;
          await Promise.all(ids.map((id) => finishOne(id, false)));
          toast(`Завершено работ: ${ids.length}`);
        };
      }
      // выделение строки
      tb.addEventListener("click", (e) => {
        if (e.target.closest("button,a,input,select,label")) return;
        const tr = e.target.closest("tr"); const id = idOf(tr); if (!id) return;
        selId = selId === id ? null : id; paintSel(tb);
      });
      // действия в строке
      tb.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-tl-act]"); if (!b) return;
        e.stopPropagation();
        const id = b.getAttribute("data-tl-id"), r = R()[id], act = b.getAttribute("data-tl-act"); if (!r) return;
        if (act === "stop" && confirm(`Завершить работу: ${r.name}?\nБудут засчитаны уже сохранённые ответы.`)) { b.disabled = true; await finishOne(id, false); toast(`Работа завершена: ${r.name}`); }
        if (act === "block" && confirm(`Заблокировать: ${r.name}?\nРабота сразу остановится и будет отмечена «⛔ заблокирован». Ответы сохранятся, вы сможете проверить их или разрешить продолжить.`)) { b.disabled = true; await finishOne(id, true); toast(`Заблокирован: ${r.name}`); }
        if (act === "go" && confirm(`Разрешить ${r.name} продолжить работу? Будет добавлено 10 минут.`)) { b.disabled = true; await unlockOne(id); toast(`Можно продолжать: ${r.name}`); }
      });
      // ↑ ↓
      document.addEventListener("keydown", (e) => {
        if (!selId || !document.body.contains(table) || e.target.closest?.("input,textarea,select") || document.querySelector("dialog[open]")) return;
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const rows = [...tb.rows].filter(idOf), i = rows.findIndex((tr) => idOf(tr) === selId);
        const nx = rows[i + (e.key === "ArrowDown" ? 1 : -1)]; if (!nx) return;
        e.preventDefault(); selId = idOf(nx); paintSel(tb); nx.scrollIntoView({ block: "nearest" });
      });
      // таблица перерисовывается при каждом изменении в базе — повторяем оформление
      const obs = new MutationObserver(() => refresh(table));
      OBS.set(table, obs); obs.observe(tb, { childList: true });
    }
    refresh(table);
  }

  const OBS = new WeakMap();
  function refresh(table) {
    const tb = table.tBodies[0]; if (!tb) return;
    const obs = OBS.get(table); obs?.disconnect();          // свои перестановки не считаем «перерисовкой»
    try {
      const head = [...table.tHead.rows[0].cells];
      const numCol = head.findIndex((th) => th.textContent.trim() === "№");
      const nameCol = head.findIndex((th) => /Ученик/.test(th.textContent));
      const rows = [...tb.rows].filter((tr) => idOf(tr));
      const rest = [...tb.rows].filter((tr) => !idOf(tr));
      // сортировка
      if (sort && head[sort.col]) {
        const k = (tr) => cellKey(tr.cells[sort.col]);
        rows.sort((a, b) => {
          const x = k(a), y = k(b);
          if (x.empty !== y.empty) return x.empty ? 1 : -1;            // пустые — всегда внизу
          if (x.n !== null && y.n !== null) return (x.n - y.n) * sort.dir;
          if (x.n !== null) return -1; if (y.n !== null) return 1;
          return x.s.localeCompare(y.s, "ru") * sort.dir;
        });
      }
      rows.forEach((tr) => tb.appendChild(tr)); rest.forEach((tr) => tb.appendChild(tr));
      // нумерация 1, 2, 3… и кнопки действий
      rows.forEach((tr, i) => {
        if (numCol >= 0 && tr.cells[numCol]) { tr.cells[numCol].textContent = i + 1; tr.cells[numCol].classList.add("tl-num"); }
        const id = idOf(tr), r = R()[id]; if (!r) return;
        const cell = tr.querySelector("[data-open]")?.parentElement;
        if (cell && !cell.querySelector(".tl-act")) {
          let html = "";
          if (r.status === "in_progress") html = `<button class="tl-btn stop" data-tl-act="stop" data-tl-id="${esc(id)}" title="Завершить работу ученика (ответы сохранятся)">⏹ Завершить</button><button class="tl-btn block" data-tl-act="block" data-tl-id="${esc(id)}" title="Остановить работу и отметить как заблокированную (например, списывает)">⛔ Блок</button>`;
          else if (r.reason === "teacher" || r.reason === "blocked" || r.blocked) html = `<button class="tl-btn" data-tl-act="go" data-tl-id="${esc(id)}" title="Разрешить ученику продолжить (+10 минут)">↩ Продолжить</button>`;
          if (html) cell.insertAdjacentHTML("beforeend", `<span class="tl-act">${html}</span>`);
        }
        const nm = nameCol >= 0 ? tr.cells[nameCol] : null;
        if (nm && !nm.querySelector(".tl-tag")) {
          if (r.blocked || r.reason === "blocked") nm.insertAdjacentHTML("beforeend", `<span class="tl-tag">⛔ заблокирован</span>`);
          else if (r.reason === "teacher") nm.insertAdjacentHTML("beforeend", `<span class="tl-tag t">⏹ завершил учитель</span>`);
        }
      });
      // «прилипшие» столбцы слева — от первого до «Ученик» включительно (обычно «№» и «Ученик»)
      if (nameCol >= 0 && nameCol <= 2) {
        let left = 0;
        for (let c = 0; c <= nameCol; c++) {
          [head[c], ...[...tb.rows].map((tr) => tr.cells.length === head.length ? tr.cells[c] : null)].filter(Boolean)
            .forEach((td) => { td.classList.add("tl-stk"); td.style.left = left + "px"; });
          left += head[c].getBoundingClientRect().width;
        }
      }
      // стрелка сортировки
      head.forEach((th, i) => { th.querySelector(".tl-ar")?.remove(); th.classList.toggle("tl-on", !!sort && sort.col === i); if (sort && sort.col === i) th.insertAdjacentHTML("beforeend", `<span class="tl-ar">${sort.dir > 0 ? "▲" : "▼"}</span>`); });
      paintSel(tb);
    } finally { obs?.observe(tb, { childList: true }); }
  }
  function paintSel(tb) { [...tb.rows].forEach((tr) => tr.classList.toggle("tl-sel", !!selId && idOf(tr) === selId)); }

  // ищем таблицы результатов сейчас и после каждой смены экрана
  const scan = () => document.querySelectorAll("table.res").forEach((t) => {
    if (!setUp.has(t) && t.tHead && t.tBodies[0] && /Ученик/.test(t.tHead.textContent)) apply(t);
  });
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
}
