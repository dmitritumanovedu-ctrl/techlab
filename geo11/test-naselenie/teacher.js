import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../../firebase-config.js";
import { TEST, VARIANTS } from "./questions.js";
import { grade, SCALE } from "./grading.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app"), dlg = $("#dlg");
const fmtNum = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
const fmtTime = (ms) => ms ? new Date(ms).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb), auth = getAuth(fb);
const P = `results/${TEST.id}`;

let KEYS = null, RESULTS = {}, seen = new Set(), filterCls = "", search = "", openId = null, unsub = [];

onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u()); unsub = [];
  if (!user) return showLogin();
  $("#who").innerHTML = `${esc(user.email)} · <a href="#" id="logout" style="color:#fff">выйти</a>`;
  $("#logout").onclick = (e) => { e.preventDefault(); signOut(auth); };
  try {
    KEYS = (await get(ref(db, `keys/${TEST.id}`))).val();
    if (!KEYS) throw new Error("no-keys");
  } catch (e) {
    app.innerHTML = `<div class="card center"><h2>Нет доступа к ключам</h2>
      <p>${e.message === "no-keys" ? "В базе нет ключей ответов. Импортируйте файл <b>keys.json</b> в Realtime Database (шаг 5 инструкции)."
        : "Этот аккаунт не имеет прав учителя. Проверьте, что в правилах базы (Rules) указан именно этот e-mail."}</p></div>`;
    return;
  }
  showDashboard();
});

function showLogin() {
  $("#who").textContent = "";
  app.innerHTML = `<div class="card center"><h2>Вход для учителя</h2>
    <p class="muted">Войдите через свой Google-аккаунт учителя.</p>
    <div class="err" id="err"></div>
    <button class="btn" id="go">Войти через Google</button></div>`;
  $("#go").onclick = async () => {
    $("#err").textContent = "";
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { $("#err").textContent = "Не удалось войти: " + (e.code || e.message); }
  };
}

// ---------- панель ----------
function showDashboard() {
  app.innerHTML = `
  <div class="toolbar noprint" style="margin-bottom:14px">
    <label class="switch"><input type="checkbox" id="swOpen"> <span id="swText">Тест закрыт</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <select id="fCls" style="width:auto"><option value="">Все классы</option>${TEST.classes.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
      <input type="text" id="fSearch" placeholder="Поиск по фамилии" style="width:180px">
      <button class="btn small ghost" id="bKeys">Ключи ответов</button>
      <button class="btn small ghost" id="bCsv">Скачать CSV</button>
      <button class="btn small red" id="bClear">Очистить результаты</button>
    </div>
  </div>
  <div class="stats noprint" id="stats" style="margin-bottom:14px"></div>
  <div class="table-wrap"><table class="res"><thead><tr>
    <th>№</th><th>Ученик</th><th>Класс</th><th>Вар.</th><th>Статус</th><th>Нарушения</th><th>Начало / сдано</th>
    <th>Авто-баллы</th><th>Итог</th><th>Оценка</th><th></th></tr></thead><tbody id="tb"><tr><td colspan="11" class="muted">Ожидание работ…</td></tr></tbody></table></div>
  <p class="muted" style="font-size:14px">Шкала перевода в 10-балльную систему (% от ${TEST.max} б.):
    ${SCALE.map(([p, g]) => `<b>${g}</b> — от ${p}%`).join(" · ")}. Оценка окончательная, когда проверены все развёрнутые ответы.</p>`;

  const sw = $("#swOpen");
  unsub.push(onValue(ref(db, `settings/${TEST.id}/open`), (s) => {
    sw.checked = !!s.val();
    $("#swText").textContent = sw.checked ? "🟢 Тест открыт — ученики могут начинать" : "🔴 Тест закрыт — новые ученики не могут начать";
  }));
  sw.onchange = () => set(ref(db, `settings/${TEST.id}/open`), sw.checked);
  $("#fCls").onchange = (e) => { filterCls = e.target.value; renderTable(); };
  $("#fSearch").oninput = (e) => { search = e.target.value.toLowerCase(); renderTable(); };
  $("#bCsv").onclick = exportCsv;
  $("#bKeys").onclick = showKeys;
  $("#bClear").onclick = async () => {
    const n = Object.keys(RESULTS).length;
    if (!n) return;
    if (!confirm(`Удалить ВСЕ результаты (${n} шт.)? Сначала скачайте CSV. Это действие нельзя отменить.`)) return;
    if (prompt('Для подтверждения напишите слово УДАЛИТЬ') !== "УДАЛИТЬ") return;
    await remove(ref(db, P));
  };

  unsub.push(onValue(ref(db, P), (snap) => {
    RESULTS = snap.val() || {};
    renderTable();
    if (openId && dlg.open) {
      if (!RESULTS[openId]) dlg.close();
      else if (!dlg.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") showCheck(openId, true);
    }
  }));
}

function evaluate(r) {
  const k = KEYS.variants[String(r.variant)];
  return grade({ ...k, points: KEYS.points }, r.answers || {}, r.manual || {});
}

function statusTag(r) {
  if (r.status === "in_progress") return `<span class="tag run">⏳ пишет</span>`;
  const map = { manual: ["done", "✅ сдано"], timeout: ["warn", "⏰ время вышло"], tab: ["auto", "⚠ автосдача: вкладка"],
    blur: ["auto", "⚠ автосдача: другое окно"], close: ["auto", "⚠ автосдача: закрыл страницу"], teacher: ["warn", "завершено учителем"] };
  const [cls, txt] = map[r.reason] || ["done", "сдано"];
  return `<span class="tag ${cls}">${txt}</span>`;
}

function rows() {
  return Object.entries(RESULTS)
    .filter(([, r]) => (!filterCls || r.cls === filterCls) && (!search || String(r.name).toLowerCase().includes(search)))
    .sort((a, b) => (b[1].startedAt || 0) - (a[1].startedAt || 0));
}

function renderTable() {
  const list = rows();
  const all = Object.values(RESULTS);
  const names = {};
  all.forEach((r) => { const k = (r.name + "|" + r.cls).toLowerCase(); names[k] = (names[k] || 0) + 1; });
  const graded = all.filter((r) => r.status === "submitted").map(evaluate).filter((g) => g.complete);
  const avg = graded.length ? graded.reduce((s, g) => s + g.grade, 0) / graded.length : null;
  $("#stats").innerHTML = `
    <div class="stat"><b>${all.length}</b>всего работ</div>
    <div class="stat"><b>${all.filter((r) => r.status === "in_progress").length}</b>пишут сейчас</div>
    <div class="stat"><b>${all.filter((r) => r.status === "submitted").length}</b>сдано</div>
    <div class="stat"><b>${all.filter((r) => ["tab", "blur", "close"].includes(r.reason)).length}</b>автосдач</div>
    <div class="stat"><b>${avg ? fmtNum(avg) : "—"}</b>средняя оценка</div>`;
  const tb = $("#tb");
  if (!list.length) { tb.innerHTML = `<tr><td colspan="11" class="muted">Работ пока нет. Откройте тест переключателем выше.</td></tr>`; return; }
  tb.innerHTML = list.map(([id, r], i) => {
    const g = evaluate(r);
    const dup = names[(r.name + "|" + r.cls).toLowerCase()] > 1 ? ` <span class="tag warn" title="Несколько попыток с этим именем">повтор</span>` : "";
    const fresh = !seen.has(id) && seen.size ? "new" : "";
    const gradeCell = r.status !== "submitted" ? `<span class="grade pending">—</span>`
      : g.complete ? `<span class="grade">${g.grade}</span>` : `<span class="grade pending" title="Предварительно по уже выставленным баллам">≈${g.gradeNow} · проверить ${g.pending}</span>`;
    return `<tr class="${fresh}">
      <td>${list.length - i}</td><td><b>${esc(r.name)}</b>${dup}</td><td>${esc(r.cls)}</td><td>${r.variant}</td>
      <td>${statusTag(r)}</td>
      <td>${r.violations ? `<span class="bad">${r.violations}</span>` : "0"}</td>
      <td>${fmtTime(r.startedAt)} / ${r.status === "submitted" ? fmtTime(r.submittedAt) : "…"}</td>
      <td>${fmtNum(g.auto)}</td>
      <td>${r.status === "submitted" ? `<b>${fmtNum(g.total)}</b> / ${g.max}` : "—"}</td>
      <td>${gradeCell}</td>
      <td><button class="btn small" data-open="${id}">${r.status === "submitted" && !g.complete ? "Проверить" : "Открыть"}</button></td></tr>`;
  }).join("");
  list.forEach(([id]) => seen.add(id));
  if (!seen.size) list.forEach(([id]) => seen.add(id));
  tb.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => showCheck(b.dataset.open));
}

// ---------- проверка работы ----------
function showCheck(id, refresh = false) {
  const r = RESULTS[id]; if (!r) return;
  openId = id;
  const v = VARIANTS.find((x) => x.id === r.variant);
  const k = KEYS.variants[String(r.variant)];
  const g = evaluate(r);
  const A = r.answers || {};
  const byTask = {};
  g.items.forEach((it) => (byTask[it.task] = byTask[it.task] || []).push(it));
  const scrollPos = refresh ? dlg.scrollTop : 0;

  const scoreBox = (it) => `<span>Баллы: <input type="number" class="score-in" min="0" max="${it.max}" step="0.5"
      data-item="${it.key}" value="${it.score ?? ""}" placeholder="?"> / ${it.max}
      ${it.teacher === null && it.auto !== null && it.check ? `<span class="muted" style="font-size:13px">(предложено автоматически)</span>` : ""}
      ${it.autoEmpty ? `<span class="muted" style="font-size:13px">(нет ответа)</span>` : ""}</span>`;
  const mark = (ok) => ok ? `<span class="ok">✓</span>` : `<span class="bad">✗</span>`;

  const parts = v.tasks.map((t) => {
    const its = byTask[t.n] || [];
    const sum = its.reduce((s, i) => s + (i.score ?? 0), 0);
    const need = its.some((i) => i.score === null);
    let inner = "";
    if (t.type === "tf") {
      inner = t.items.map((q) => {
        const kk = k.t1[q.id], a = (A.t1 || {})[q.id] || {};
        const fixIt = its.find((i) => i.key === `t1_${q.id}f`);
        return `<div style="margin-bottom:10px"><b>${q.id}) ${esc(q.concept)}</b> — ${esc(q.text)}<br>
          Ответ: <b>${a.v === "T" ? "Верно" : a.v === "F" ? "Неверно" : "—"}</b> ${mark(a.v === kk.tf)}
          · Ключ: <b>${kk.tf === "T" ? "Верно" : "Неверно"}</b>
          ${kk.tf === "F" ? `<div class="ans">Исправление ученика: ${esc(a.fix || "—")}</div>
            <div class="model">Образец: ${esc(kk.fix)}<br><span class="muted">Верное определение: ${esc(kk.orig)}</span></div>
            <div class="chk-row">${scoreBox(fixIt)}</div>` : ""}</div>`;
      }).join("");
    } else if (t.type === "classify") {
      const a = A.t2 || {};
      inner = t.chips.map((c) => {
        const ans = a[c.id], key = k.t2[c.id];
        return `<div>${mark(Number(ans) === key && ans != null)} ${esc(c.text)} → <b>${ans != null && ans >= 0 ? esc(t.columns[ans]) : "не распределено"}</b>
          ${Number(ans) !== key || ans == null ? ` <span class="muted">(верно: ${esc(t.columns[key])})</span>` : ""}</div>`;
      }).join("");
    } else if (t.type === "mcq") {
      inner = t.options.map((o) => `<div>${o.id === k.t3 ? "✓" : "·"} ${A.t3 === o.id ? "<b>" : ""}${esc(o.text)}${A.t3 === o.id ? "</b> ← ответ ученика" : ""}</div>`).join("");
    } else if (t.type === "chart" || t.type === "open") {
      const it = its[0];
      inner = `${t.chart ? `<div class="muted">Диаграмма: ${esc(t.chart.title)}</div>` : ""}
        <div class="ans">${esc(A["t" + t.n] || "— нет ответа —")}</div>
        <div class="model"><b>Критерии:</b> ${esc(it.criteria)}<br><b>Образец ответа:</b> ${esc(it.model)}</div>
        <div class="chk-row">${scoreBox(it)}</div>`;
    } else if (t.type === "mapid") {
      const a = A.t9 || {};
      inner = t.markers.map((m) => `<div>${mark(a[m.letter] === k.t9[m.letter])} <b>${m.letter}</b>: ${esc(a[m.letter] || "—")}
        ${a[m.letter] !== k.t9[m.letter] ? `<span class="muted">(верно: ${esc(k.t9[m.letter])})</span>` : ""}</div>`).join("");
    } else if (t.type === "mapcalc") {
      const a = A.t10 || {}, why = its.find((i) => i.key === "t10c");
      const calc = its.find((i) => i.key === "t10a"), cat = its.find((i) => i.key === "t10b");
      inner = `<div>а) Ответ: <b>${esc(a.d || "—")}</b> ${mark(calc.auto === 2)} · Ключ: ${esc(k.t10.calc)} <span class="muted">(2 б. при отклонении до 3%, 1 б. — до 10%)</span></div>
        <div>б) Категория: <b>${esc(a.cat || "—")}</b> ${mark(cat.auto === 1)} · Ключ: ${k.t10.cat} <span class="muted">(засчитывается и категория, верная для своего расчёта)</span></div>
        <div style="margin-top:6px">в) Объяснение:</div><div class="ans">${esc(a.why || "— нет ответа —")}</div>
        <div class="model">Образец: ${esc(k.t10.model)}</div><div class="chk-row">${scoreBox(why)}</div>`;
    }
    return `<div class="chk-item ${need ? "need" : ""}"><div class="chk-row"><b>Задание ${t.n}</b>
      <span>${fmtNum(sum)} / ${t.points} б. ${need ? '<span class="tag warn">нужно проверить</span>' : ""}</span></div>
      <div class="muted" style="font-size:14px;margin:4px 0 8px">${esc(t.title)}</div>${inner}</div>`;
  }).join("");

  const events = Object.values(r.events || {}).sort((a, b) => a.at - b.at)
    .map((e) => `${fmtTime(e.at)} — ${esc(e.type)}`).join("<br>");

  dlg.innerHTML = `
    <div class="dlg-head"><div><b>${esc(r.name)}</b> · ${esc(r.cls)} · вариант ${r.variant}</div>
      <button class="btn small ghost" id="dClose" style="background:#fff">Закрыть ✕</button></div>
    <div class="dlg-body">
      <div class="chk-row" style="margin-bottom:12px">
        <div>${statusTag(r)} · Итог: <b>${fmtNum(g.total)} / ${g.max}</b> ·
          Оценка: ${g.complete ? `<span class="grade">${g.grade}</span>` : `<span class="muted">≈${g.gradeNow}, осталось проверить: ${g.pending}</span>`}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${r.status === "submitted" ? `<button class="btn small" id="dUnlock">Разрешить продолжить (+10 мин)</button>` : `<button class="btn small" id="dStop">Завершить работу</button>`}
          <button class="btn small red" id="dDel">Удалить</button>
        </div>
      </div>
      ${r.violations ? `<div class="chk-item need"><b>Нарушения (${r.violations}):</b><div class="events">${events || "—"}</div></div>` : ""}
      ${parts}
    </div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = scrollPos;
  $("#dClose").onclick = () => { openId = null; dlg.close(); };
  dlg.querySelectorAll("[data-item]").forEach((inp) => inp.onchange = () => {
    const val = inp.value === "" ? null : Math.max(0, Math.min(Number(inp.max), Number(inp.value)));
    update(ref(db, `${P}/${id}/manual`), { [inp.dataset.item]: val });
  });
  $("#dUnlock")?.addEventListener("click", () => {
    if (!confirm("Разрешить ученику продолжить работу? Он сможет вернуться к своим ответам ещё на 10 минут.")) return;
    update(ref(db, `${P}/${id}`), { status: "in_progress", reason: null, deadline: Math.max(r.deadline || 0, Date.now() + 10 * 60000) });
  });
  $("#dStop")?.addEventListener("click", () => {
    if (!confirm("Завершить работу ученика сейчас? Будут засчитаны уже сохранённые ответы.")) return;
    update(ref(db, `${P}/${id}`), { status: "submitted", reason: "teacher", submittedAt: Date.now() });
  });
  $("#dDel").onclick = () => {
    if (!confirm(`Удалить работу ученика ${r.name}?`)) return;
    remove(ref(db, `${P}/${id}`)); openId = null; dlg.close();
  };
}
dlg.addEventListener("close", () => { openId = null; });

// ---------- ключи ----------
function showKeys() {
  openId = null;
  const html = VARIANTS.map((v) => {
    const k = KEYS.variants[String(v.id)];
    const t = (n) => v.tasks.find((x) => x.n === n);
    const t2 = t(2), t3 = t(3);
    return `<div class="card" style="break-inside:avoid"><h2>Вариант ${v.id}</h2>
      <p><b>1.</b> ${t(1).items.map((q) => `${q.id}) ${esc(q.concept)} — <b>${k.t1[q.id].tf === "T" ? "Верно" : "Неверно"}</b>${k.t1[q.id].fix ? ` (${esc(k.t1[q.id].fix)})` : ""}`).join("; ")}</p>
      <p><b>2.</b> ${t2.columns.map((c, i) => `<u>${esc(c)}</u>: ${t2.chips.filter((x) => k.t2[x.id] === i).map((x) => esc(x.text)).join(", ")}`).join("; ")}</p>
      <p><b>3.</b> ${esc(t3.options.find((o) => o.id === k.t3).text)}</p>
      <p><b>4.</b> ${esc(k.t4.model)}</p><p><b>5.</b> ${esc(k.t5.model)}</p>
      <p><b>6.</b> ${esc(k.t6.model)}</p><p><b>7.</b> ${esc(k.t7.model)}</p><p><b>8.</b> ${esc(k.t8.model)}</p>
      <p><b>9.</b> ${Object.entries(k.t9).map(([L, n]) => `${L} — ${esc(n)}`).join(", ")}</p>
      <p><b>10.</b> ${esc(k.t10.calc)}; категория ${k.t10.cat}. ${esc(k.t10.model)}</p></div>`;
  }).join("");
  dlg.innerHTML = `<div class="dlg-head noprint"><b>Ключи ответов — 10 вариантов</b>
    <span><button class="btn small ghost" style="background:#fff" id="kPrint">Печать</button>
    <button class="btn small ghost" style="background:#fff" id="kClose">Закрыть ✕</button></span></div>
    <div class="dlg-body"><p class="muted">Критерии: задания 4–5 — ${esc(KEYS.variants["1"].t4.criteria)} Задания 6–7 — ${esc(KEYS.variants["1"].t6.criteria)} Задание 8 — ${esc(KEYS.variants["1"].t8.criteria)}</p>${html}</div>`;
  if (!dlg.open) dlg.showModal();
  $("#kClose").onclick = () => dlg.close();
  $("#kPrint").onclick = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><meta charset="utf-8"><title>Ключи</title><link rel="stylesheet" href="${new URL("test.css", location.href)}"></head><body><main>${dlg.querySelector(".dlg-body").innerHTML}</main></body></html>`);
    w.document.close(); setTimeout(() => w.print(), 500);
  };
}

// ---------- CSV ----------
function exportCsv() {
  const head = ["Ученик", "Класс", "Вариант", "Статус", "Причина сдачи", "Нарушения", "Начало", "Сдано",
    ...Array.from({ length: 10 }, (_, i) => `Зад.${i + 1}`), "Итог", "Макс", "Оценка", "Проверено"];
  const lines = [head];
  for (const [, r] of rows()) {
    const g = evaluate(r);
    const per = Array.from({ length: 10 }, (_, i) => fmtNum(g.items.filter((it) => it.task === i + 1).reduce((s, it) => s + (it.score ?? 0), 0)));
    lines.push([r.name, r.cls, r.variant, r.status === "submitted" ? "сдано" : "пишет", r.reason || "", r.violations || 0,
      r.startedAt ? new Date(r.startedAt).toLocaleString("ru-RU") : "", r.submittedAt ? new Date(r.submittedAt).toLocaleString("ru-RU") : "",
      ...per, fmtNum(g.total), g.max, g.complete ? g.grade : "", g.complete ? "да" : `нет (${g.pending})`]);
  }
  const csv = "﻿" + lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `geo11-naselenie-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
