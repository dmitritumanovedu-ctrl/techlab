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
  .rv-ai{border:1px solid #CFD8FF;background:#F4F6FF;border-radius:14px;padding:10px 14px;font-size:14px;line-height:1.45}
  .rv-ai b{color:#2E4BFF}.rv-ai div{margin-top:4px}
  .rv-pdf{font:inherit;font-weight:800;border:0;background:#2E4BFF;color:#fff;border-radius:12px;padding:8px 14px;cursor:pointer;margin-right:6px}
  @media print{.rv-ov{position:static;background:none;padding:0}.rv-box{box-shadow:none;max-height:none}.rv-x{display:none}}
  </style>`);
}

export const reviewBtn = (id) => `<button type="button" class="rv-btn" data-review="${esc(id)}">🔍 ${esc(L("Разбор работы", "Analiza lucrării", "Review"))}</button>`;

// Итоговая строка работы: баллы и оценка / квалификатив
const headLine = (w) => w.complete ? `${num(w.total)} / ${num(w.max)} ${L("баллов", "puncte", "points")}${w.qual ? " · " + w.qual : w.grade ? " · " + L("оценка", "nota", "grade") + " " + w.grade : ""}` : L("Работа ещё проверяется", "Lucrarea încă se verifică", "Still being checked");
const aiBlock = (S) => S && (S.strengths || S.gaps || S.advice) ? `<div class="rv-ai"><b>🤖 ${esc(L("Разбор ИИ", "Analiza AI", "AI review"))}</b>
  ${S.strengths ? `<div>✅ ${esc(L("Получилось:", "Reușit:", "Strengths:"))} ${esc(S.strengths)}</div>` : ""}
  ${S.gaps ? `<div>🎯 ${esc(L("Повторить:", "De repetat:", "To review:"))} ${esc(S.gaps)}</div>` : ""}
  ${S.advice ? `<div>💡 ${esc(L("Совет:", "Sfat:", "Advice:"))} ${esc(S.advice)}</div>` : ""}</div>` : "";

export function openReview(w, who = null) {
  if (!w?.review?.items?.length) return;
  style();
  const items = w.review.items;
  const cls = (x) => x.s === null || x.s === undefined ? "wait" : x.s >= x.m ? "ok" : x.s > 0 ? "part" : "bad";
  const n = { ok: 0, part: 0, bad: 0, wait: 0 }; items.forEach((x) => n[cls(x)]++);
  const o = document.createElement("div");
  o.className = "rv-ov";
  o.innerHTML = `<div class="rv-box" role="dialog" aria-modal="true" aria-label="${esc(w.title)}">
    <div class="rv-hd"><div><h2>🔍 ${esc(w.title)}</h2>
      <small>${esc(headLine(w))}</small></div>
      <div style="white-space:nowrap"><button type="button" class="rv-pdf">📄 PDF</button><button type="button" class="rv-x">${esc(L("Закрыть", "Închide", "Close"))} ✕</button></div></div>
    <div class="rv-sum">
      <span style="background:#E3F8EF;color:#0B7A4F">✓ ${esc(L("верно", "corect", "correct"))}: ${n.ok}</span>
      ${n.part ? `<span style="background:#FFF4DC;color:#8A5A00">½ ${esc(L("частично", "parțial", "partly"))}: ${n.part}</span>` : ""}
      <span style="background:#FDECEE;color:#C2253B">✗ ${esc(L("ошибки", "greșeli", "mistakes"))}: ${n.bad}</span>
      ${n.wait ? `<span style="background:#EEF2F8;color:#556A92">⏳ ${esc(L("проверяется", "se verifică", "checking"))}: ${n.wait}</span>` : ""}
    </div>
    <div class="rv-bd">${aiBlock(w.summary)}${items.map((x) => {
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
  o.querySelector(".rv-pdf").onclick = () => printWorks([{ title: w.title, who, date: w.date, head: headLine(w), items, summary: w.summary, keys: w.review.lv >= 2 }]);
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

// =====================================================================
//  PDF выполненной работы: открывает страницу для печати → «Сохранить как PDF».
//  docs: [{ title, who:{name,cls}, date, head, items:[{l,s,m,a,k,c}], summary, keys }]
//  Используется учеником и родителем (кнопка «📄 PDF» в разборе) и учителем (миссии, тренажёры).
// =====================================================================
export function printWorks(docs, docTitle = "") {
  const w = window.open("", "_blank");
  if (!w) { alert(L("Разрешите всплывающие окна для этого сайта, чтобы сохранить PDF.", "Permiteți ferestrele pop-up pentru a salva PDF.", "Allow pop-ups to save the PDF.")); return; }
  const cls = (x) => x.s === null || x.s === undefined ? "wait" : x.s >= x.m ? "ok" : x.s > 0 ? "part" : "bad";
  const mark = (x) => { const c = cls(x); return c === "wait" ? "⏳" : (c === "ok" ? "✓ " : c === "bad" ? "✗ " : "½ ") + num(x.s) + " / " + num(x.m); };
  const page = (d) => {
    const n = { ok: 0, part: 0, bad: 0 }; (d.items || []).forEach((x) => { const c = cls(x); if (n[c] !== undefined) n[c]++; });
    const S = d.summary;
    return `<section class="pg"><header><div class="brand">TechLab</div><h1>${esc(d.title)}</h1>
      <table class="meta"><tr><td>${esc(L("Ученик", "Elev", "Student"))}:</td><td><b>${esc(d.who?.name || "—")}</b></td><td>${esc(L("Класс", "Clasa", "Class"))}:</td><td><b>${esc(d.who?.cls || "—")}</b></td></tr>
      <tr><td>${esc(L("Дата", "Data", "Date"))}:</td><td>${d.date ? new Date(d.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}</td><td>${esc(L("Итог", "Rezultat", "Result"))}:</td><td><b>${esc(d.head || "")}</b></td></tr></table>
      <div class="sum">✓ ${n.ok} · ½ ${n.part} · ✗ ${n.bad}</div></header>
      ${S && (S.strengths || S.gaps || S.advice) ? `<div class="ai"><b>🤖 ${esc(L("Разбор ИИ", "Analiza AI", "AI review"))}</b>${S.strengths ? `<p>✅ ${esc(S.strengths)}</p>` : ""}${S.gaps ? `<p>🎯 ${esc(S.gaps)}</p>` : ""}${S.advice ? `<p>💡 ${esc(S.advice)}</p>` : ""}</div>` : ""}
      ${(d.items || []).map((x) => `<div class="it ${cls(x)}"><div class="top"><span>${esc(x.l)}</span><b>${mark(x)}</b></div>
        ${x.a ? `<div class="ln"><i>${esc(L("Ответ ученика:", "Răspunsul elevului:", "Answer:"))}</i> ${esc(x.a)}</div>` : ""}
        ${x.k && (d.keys !== false) && cls(x) !== "ok" ? `<div class="ln key"><i>${esc(L("Правильно:", "Corect:", "Correct:"))}</i> ${esc(x.k)}</div>` : ""}
        ${x.c ? `<div class="ln cm"><i>💬</i> ${esc(x.c)}</div>` : ""}</div>`).join("")}
      <footer>${esc(L("Подпись учителя", "Semnătura profesorului", "Teacher's signature"))}: ____________________</footer></section>`;
  };
  w.document.write(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(docTitle || docs[0]?.title || "TechLab")}</title><style>
    body{font-family:"Segoe UI",Arial,sans-serif;color:#0B1A3B;margin:0;padding:16px;font-size:13px}
    .hint{background:#FFF4DC;border:1px solid #F5D48A;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:14px}
    .pg{max-width:780px;margin:0 auto 24px;page-break-after:always}.pg:last-child{page-break-after:auto}
    header{border-bottom:2px solid #2E4BFF;padding-bottom:8px;margin-bottom:10px}.brand{color:#2E4BFF;font-weight:800;font-size:12px;letter-spacing:.1em}
    h1{font-size:19px;margin:2px 0 6px}.meta td{padding:1px 10px 1px 0;font-size:13px}.sum{font-weight:700;color:#556A92;margin-top:4px}
    .ai{border:1px solid #CFD8FF;background:#F4F6FF;border-radius:10px;padding:8px 12px;margin:8px 0}.ai p{margin:4px 0}
    .it{border:1px solid #DCE4F2;border-left:5px solid #9AA8C7;border-radius:8px;padding:6px 10px;margin:6px 0;break-inside:avoid}
    .it.ok{border-left-color:#12A46B}.it.part{border-left-color:#FFB020}.it.bad{border-left-color:#E5484D}
    .top{display:flex;justify-content:space-between;gap:10px;font-weight:600}.top b{white-space:nowrap}
    .ln{margin-top:3px}.ln i{color:#556A92;font-style:normal;font-weight:700}.key{color:#0B7A4F}.cm{color:#2E4BFF}
    footer{margin-top:16px;color:#556A92}
    @media print{.hint{display:none}body{padding:0}}
  </style></head><body><div class="hint">📄 ${esc(L("Чтобы сохранить PDF: в окне печати выберите «Сохранить как PDF» и нажмите «Сохранить».", "Pentru PDF: alegeți «Salvare ca PDF» în fereastra de imprimare.", "To save as PDF: choose “Save as PDF” in the print dialog."))}</div>
  ${docs.map(page).join("")}</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 500);
}
