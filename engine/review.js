// =====================================================================
//  «🔍 Разбор работы» для ученика и родителя.
//  Данные готовит панель учителя (engine/sync.js) в progress/<код>/works/<id>/review,
//  только если учитель включил разбор для этой работы.
// =====================================================================
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LANG = (() => { try { return localStorage.getItem("techlab_lang") || "ru"; } catch (e) { return "ru"; } })();
const L = (ru, ro, en) => ({ ru, ro, en })[LANG] || ru;
const num = (x) => String(Math.round(Number(x) * 10) / 10).replace(".", LANG === "en" ? "." : ",");

let styled = false;
function style() {
  if (styled) return; styled = true;
  document.head.insertAdjacentHTML("beforeend", `<style>
  .rv-ov{position:fixed;inset:0;z-index:2147482000;background:rgba(11,26,59,.55);display:grid;place-items:center;padding:16px;font-family:Manrope,"Segoe UI",Arial,sans-serif}
  .rv-box{background:#fff;color:#0B1A3B;border-radius:22px;width:min(760px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 30px 60px rgba(11,26,59,.35)}
  .rv-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 22px;border-bottom:1px solid #DCE4F2}
  .rv-hd h2{margin:0;font-size:20px;line-height:1.25}
  .rv-hd small{display:block;color:#556A92;font-size:13px;margin-top:4px}
  .rv-x{font:inherit;font-weight:800;border:0;background:#EEF2F8;border-radius:12px;padding:8px 14px;cursor:pointer}
  .rv-sum{display:flex;gap:8px;flex-wrap:wrap;padding:12px 22px 0}
  .rv-sum span{font-size:13px;font-weight:800;border-radius:999px;padding:4px 12px}
  .rv-bd{overflow:auto;padding:14px 22px 22px;display:grid;gap:10px}
  .rv-it{border:1px solid #DCE4F2;border-left-width:6px;border-radius:14px;padding:10px 14px}
  .rv-it.ok{border-left-color:#12A46B}.rv-it.part{border-left-color:#FFB020}.rv-it.bad{border-left-color:#E5484D}.rv-it.wait{border-left-color:#9AA8C7}
  .rv-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
  .rv-q{font-weight:700;line-height:1.35}
  .rv-pt{white-space:nowrap;font-weight:800;font-size:14px;border-radius:10px;padding:2px 10px}
  .ok .rv-pt{background:#E3F8EF;color:#0B7A4F}.part .rv-pt{background:#FFF4DC;color:#8A5A00}.bad .rv-pt{background:#FDECEE;color:#C2253B}.wait .rv-pt{background:#EEF2F8;color:#556A92}
  .rv-l{font-size:14px;margin-top:6px;line-height:1.4}
  .rv-l b{color:#556A92;font-weight:700}
  .rv-l.key{color:#0B7A4F}.rv-l.cm{color:#2E4BFF}
  .rv-btn{font:inherit;font-weight:800;font-size:13px;border:1px solid #BFCBFF;background:#E8EDFF;color:#2E4BFF;border-radius:999px;padding:4px 12px;cursor:pointer;margin-top:6px}
  .rv-btn:hover{background:#D6DEFF}
  @media print{.rv-ov{position:static;background:none;padding:0}.rv-box{box-shadow:none;max-height:none}.rv-x{display:none}}
  </style>`);
}

export const reviewBtn = (id) => `<button type="button" class="rv-btn" data-review="${esc(id)}">🔍 ${esc(L("Разбор работы", "Analiza lucrării", "Review"))}</button>`;

export function openReview(w) {
  if (!w?.review?.items?.length) return;
  style();
  const items = w.review.items;
  const cls = (x) => x.s === null || x.s === undefined ? "wait" : x.s >= x.m ? "ok" : x.s > 0 ? "part" : "bad";
  const n = { ok: 0, part: 0, bad: 0, wait: 0 }; items.forEach((x) => n[cls(x)]++);
  const o = document.createElement("div");
  o.className = "rv-ov";
  o.innerHTML = `<div class="rv-box" role="dialog" aria-modal="true" aria-label="${esc(w.title)}">
    <div class="rv-hd"><div><h2>🔍 ${esc(w.title)}</h2>
      <small>${w.complete ? `${num(w.total)} / ${num(w.max)} ${esc(L("баллов", "puncte", "points"))}${w.qual ? " · " + esc(w.qual) : w.grade ? " · " + esc(L("оценка", "nota", "grade")) + " " + w.grade : ""}` : esc(L("Работа ещё проверяется", "Lucrarea încă se verifică", "Still being checked"))}</small></div>
      <button type="button" class="rv-x">${esc(L("Закрыть", "Închide", "Close"))} ✕</button></div>
    <div class="rv-sum">
      <span style="background:#E3F8EF;color:#0B7A4F">✓ ${esc(L("верно", "corect", "correct"))}: ${n.ok}</span>
      ${n.part ? `<span style="background:#FFF4DC;color:#8A5A00">½ ${esc(L("частично", "parțial", "partly"))}: ${n.part}</span>` : ""}
      <span style="background:#FDECEE;color:#C2253B">✗ ${esc(L("ошибки", "greșeli", "mistakes"))}: ${n.bad}</span>
      ${n.wait ? `<span style="background:#EEF2F8;color:#556A92">⏳ ${esc(L("проверяется", "se verifică", "checking"))}: ${n.wait}</span>` : ""}
    </div>
    <div class="rv-bd">${items.map((x) => {
      const c = cls(x);
      return `<div class="rv-it ${c}"><div class="rv-top"><div class="rv-q">${esc(x.l)}</div>
          <span class="rv-pt">${c === "wait" ? "⏳" : (c === "ok" ? "✓ " : c === "bad" ? "✗ " : "½ ") + num(x.s) + " / " + num(x.m)}</span></div>
        ${x.a ? `<div class="rv-l"><b>${esc(L("Твой ответ:", "Răspunsul tău:", "Your answer:"))}</b> ${esc(x.a)}</div>` : ""}
        ${x.k && c !== "ok" ? `<div class="rv-l key"><b>${esc(L("Правильно:", "Corect:", "Correct:"))}</b> ${esc(x.k)}</div>` : ""}
        ${x.c ? `<div class="rv-l cm"><b>💬</b> ${esc(x.c)}</div>` : ""}</div>`;
    }).join("")}</div></div>`;
  document.body.appendChild(o);
  const close = () => { o.remove(); document.removeEventListener("keydown", key); };
  const key = (e) => { if (e.key === "Escape") close(); };
  o.querySelector(".rv-x").onclick = close;
  o.addEventListener("click", (e) => { if (e.target === o) close(); });
  document.addEventListener("keydown", key);
  o.querySelector(".rv-x").focus();
}

// Подключить кнопки «Разбор» внутри контейнера. works — объект {id: work}
export function bindReview(container, works) {
  container.addEventListener("click", (e) => {
    const b = e.target.closest("[data-review]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    openReview(works[b.dataset.review]);
  });
}
