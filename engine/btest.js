// =====================================================================
//  TechLab · движок тестов из конструктора
//  Общий для страницы ученика (b/), конструктора и проверки учителя.
//  Тест хранится в базе как данные: builder/<id> (полный, только учитель),
//  pub/<id> (для учеников, БЕЗ ответов), keys/<id> (снимок с ответами для проверки).
// =====================================================================
import { toGrade, qualOf } from "./grading.js?v=5";

export const TYPES = ["choice", "tf", "input", "match", "sort", "open"];

// ---------- мелочи ----------
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[«»"“”„]/g, "").replace(/\s+/g, " ").trim();
export const fmtNum = (n) => String(Math.round(n * 1000) / 1000).replace(".", ",");
export const half = (x) => Math.round(x * 2) / 2;
export function uid(p = "") {
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  return p + a[0].toString(36).slice(0, 5) + a[1].toString(36).slice(0, 3);
}
export function parseNum(s) {
  const t = String(s ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.eE+\-]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------- случайные числа с «зерном»: один и тот же вариант у ученика и учителя ----------
function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
export function rng(seed) {
  let a = hash(String(seed));
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- формулы для заданий с числами: A/B, (A+B)*2, sqrt(A), A^2 ----------
export function evalFormula(expr, vars = {}) {
  const s = String(expr || "").replace(/,/g, ".").replace(/×/g, "*").replace(/÷|:/g, "/");
  let i = 0;
  const peek = () => s[i], skip = () => { while (s[i] === " ") i++; };
  function num() { skip(); let j = i; while (/[0-9.]/.test(s[i] || "")) i++; if (j === i) throw new Error("число"); return parseFloat(s.slice(j, i)); }
  function atom() {
    skip();
    if (peek() === "(") { i++; const v = add(); skip(); if (s[i++] !== ")") throw new Error(")"); return v; }
    if (peek() === "-") { i++; return -atom(); }
    if (/[A-Za-zА-Яа-я_]/.test(peek() || "")) {
      let j = i; while (/[A-Za-zА-Яа-я_0-9]/.test(s[i] || "")) i++;
      const name = s.slice(j, i); skip();
      if (peek() === "(") { i++; const v = add(); skip(); if (s[i++] !== ")") throw new Error(")");
        if (name === "sqrt") return Math.sqrt(v); if (name === "abs") return Math.abs(v); if (name === "round") return Math.round(v);
        throw new Error("функция " + name); }
      if (!(name in vars)) throw new Error("нет параметра " + name);
      return Number(vars[name]);
    }
    return num();
  }
  function pow() { let v = atom(); skip(); while (peek() === "^") { i++; v = Math.pow(v, atom()); skip(); } return v; }
  function mul() { let v = pow(); skip(); while (peek() === "*" || peek() === "/") { const op = s[i++]; const r = pow(); v = op === "*" ? v * r : v / r; skip(); } return v; }
  function add() { let v = mul(); skip(); while (peek() === "+" || peek() === "-") { const op = s[i++]; const r = mul(); v = op === "+" ? v + r : v - r; skip(); } return v; }
  const v = add(); skip();
  if (i < s.length) throw new Error("лишний символ «" + s[i] + "»");
  if (!Number.isFinite(v)) throw new Error("не число");
  return v;
}
const roundTo = (x, d) => { const k = Math.pow(10, d); return Math.round(x * k) / k; };

// ---------- вариант: порядок заданий, перемешанные ответы, числа параметров ----------
// Работает и с полным тестом, и с публичной версией (нужны только id и параметры).
export function variantOf(test, v) {
  const items = test.items || [];
  const order = test.shuffle ? shuffled(items.map((x) => x.id), rng(test.id + ":order:" + v)) : items.map((x) => x.id);
  const per = {};
  for (const it of items) {
    const rnd = rng(test.id + ":" + v + ":" + it.id), d = {};
    if (it.type === "choice") d.opts = shuffled((it.options || []).map((o) => o.id), rnd);
    if (it.type === "match") d.right = shuffled((it.right || it.pairs?.map((p) => ({ id: p.rid })) || []).map((o) => o.id), rnd);
    if (it.type === "sort") d.cards = shuffled((it.cards || []).map((o) => o.id), rnd);
    if (it.params?.length) {
      d.params = {};
      for (const p of it.params) {
        const min = Number(p.min) || 0, max = Number(p.max ?? min), step = Number(p.step) || 1;
        const n = Math.max(0, Math.floor((max - min) / step + 1e-9));
        const dec = (String(step).split(".")[1] || "").length;
        d.params[p.name] = roundTo(min + step * Math.floor(rnd() * (n + 1)), dec);
      }
    }
    per[it.id] = d;
  }
  return { v, order, per };
}
export const fillParams = (text, params) => String(text || "").replace(/\{([A-Za-zА-Яа-я_][A-Za-zА-Яа-я_0-9]*)\}/g, (m, k) => (params && k in params ? fmtNum(params[k]) : m));

// ---------- публичная версия: без правильных ответов ----------
export function toPublic(t) {
  return {
    id: t.id, title: t.title || "", subject: t.subject || "", grade: t.grade || "", kind: t.kind || "to",
    minutes: Number(t.minutes) || 30, variants: Math.max(1, Number(t.variants) || 1), scale: t.scale || "10",
    shuffle: !!t.shuffle, protect: { fullscreen: t.protect?.fullscreen !== false, autosubmit: t.protect?.autosubmit !== false },
    items: (t.items || []).map((it) => {
      const b = { id: it.id, type: it.type, text: it.text || "", pts: Number(it.pts) || 0 };
      if (it.type === "choice") { b.multi = !!it.multi; b.options = (it.options || []).map((o) => ({ id: o.id, t: o.t })); }
      if (it.type === "tf") { b.explain = !!it.explain; b.whyPts = Number(it.whyPts) || 0; }
      if (it.type === "input") { b.mode = it.mode || "num"; b.unit = it.unit || ""; if (b.mode === "num" && it.params?.length) b.params = it.params.map((p) => ({ name: p.name, min: p.min, max: p.max, step: p.step })); }
      if (it.type === "match") { b.left = (it.pairs || []).map((p) => ({ id: p.id, t: p.l })); b.right = (it.pairs || []).map((p) => ({ id: p.rid, t: p.r })); }
      if (it.type === "sort") { b.groups = (it.groups || []).map((g) => g.name); b.cards = (it.cards || []).map((c) => ({ id: c.id, t: c.t })); }
      return b;
    }),
  };
}
export const maxOf = (t) => (t.items || []).reduce((s, it) => s + (Number(it.pts) || 0) + (it.type === "tf" && it.explain ? Number(it.whyPts) || 0 : 0), 0);

// ---------- новое задание по типу ----------
export function newItem(type) {
  const it = { id: uid("q"), type, text: "", pts: 1 };
  if (type === "choice") { it.multi = false; it.options = [0, 1, 2, 3].map((i) => ({ id: uid("o"), t: "", ok: i === 0 })); }
  if (type === "tf") { it.answer = "T"; it.explain = false; it.whyPts = 1; it.model = ""; }
  if (type === "input") { it.mode = "num"; it.answer = ""; it.formula = ""; it.dec = 0; it.tol = 0; it.params = []; it.unit = ""; }
  if (type === "match") { it.pts = 3; it.pairs = [0, 1, 2].map(() => ({ id: uid("l"), rid: uid("r"), l: "", r: "" })); }
  if (type === "sort") { it.pts = 2; it.groups = [{ name: "" }, { name: "" }]; it.cards = [0, 1, 2, 3].map((i) => ({ id: uid("c"), t: "", g: i % 2 })); }
  if (type === "open") { it.pts = 3; it.criteria = ""; it.model = ""; }
  return it;
}

// ---------- импорт заданий из JSON (ответ ИИ или файл) ----------
export function importItems(text) {
  let s = String(text || "").trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  const arr = JSON.parse(s);
  if (!Array.isArray(arr)) throw new Error("not array");
  const out = [];
  for (const x of arr) {
    const type = TYPES.includes(x.type) ? x.type : null; if (!type) continue;
    const it = newItem(type);
    it.text = String(x.text || x.question || ""); it.pts = Number(x.pts ?? x.points) || it.pts;
    if (type === "choice") {
      const opts = (x.options || []).map(String);
      const corr = [].concat(x.correct ?? 0).map(Number);
      it.options = opts.map((t, i) => ({ id: uid("o"), t, ok: corr.includes(i) }));
      it.multi = corr.length > 1;
    }
    if (type === "tf") { it.answer = x.answer === false || /^(f|false|неверно|fals)/i.test(String(x.answer)) ? "F" : "T"; if (x.explain) { it.explain = true; it.model = String(x.model || ""); } }
    if (type === "input") {
      const ans = [].concat(x.answer ?? "");
      const n = parseNum(ans[0]);
      if (ans.length === 1 && n !== null && /^[\s\d.,\-+]+$/.test(String(ans[0]))) { it.mode = "num"; it.answer = String(ans[0]); it.tol = Number(x.tol) || 0; }
      else { it.mode = "text"; it.answer = ans.map(String).join("; "); }
    }
    if (type === "match") it.pairs = (x.pairs || []).map((p) => ({ id: uid("l"), rid: uid("r"), l: String(p[0] ?? p.l ?? ""), r: String(p[1] ?? p.r ?? "") }));
    if (type === "sort") { it.groups = (x.groups || []).map((g) => ({ name: String(g) })); it.cards = (x.cards || []).map((c) => ({ id: uid("c"), t: String(c[0] ?? c.t ?? ""), g: Number(c[1] ?? c.g) || 0 })); }
    if (type === "open") { it.criteria = String(x.criteria || ""); it.model = String(x.model || ""); }
    out.push(it);
  }
  return out;
}

// ---------- проверка попытки ----------
// test — полный тест (снимок keys/<id>), r — запись результата {variant, answers, manual, ai}
export function gradeAttempt(test, r) {
  const V = variantOf(test, r.variant || 1);
  const A = r.answers || {}, M = r.manual || {}, AI = r.ai || {};
  const items = [];
  const add = (x) => {
    x.teacher = Number.isFinite(M[x.k]) ? M[x.k] : null;
    const a = AI[x.k]; x.ai = a && Number.isFinite(a.score) ? Math.max(0, Math.min(x.max, a.score)) : null; x.aiData = a || null;
    if (x.check && x.empty) x.auto = 0;
    x.score = x.teacher ?? x.ai ?? x.auto;
    items.push(x);
  };
  (test.items || []).forEach((it, idx) => {
    const n = idx + 1, d = V.per[it.id] || {}, a = A[it.id], pts = Number(it.pts) || 0;
    const q = fillParams(it.text, d.params);
    if (it.type === "choice") {
      const okIds = (it.options || []).filter((o) => o.ok).map((o) => o.id);
      const txt = (id) => (it.options || []).find((o) => o.id === id)?.t || "";
      let auto = 0, chosen = [];
      if (it.multi) {
        chosen = Array.isArray(a) ? a : [];
        const good = chosen.filter((x) => okIds.includes(x)).length, bad = chosen.length - good;
        auto = okIds.length ? half(Math.max(0, (good - bad) / okIds.length) * pts) : 0;
      } else { chosen = a ? [a] : []; auto = okIds.includes(a) ? pts : 0; }
      add({ k: it.id, n, type: it.type, label: q, max: pts, auto, answer: chosen.map(txt).join("; "), key: okIds.map(txt).join("; ") });
    } else if (it.type === "tf") {
      const v = a?.v;
      add({ k: it.id, n, type: it.type, label: q, max: pts, auto: v === it.answer ? pts : 0, answer: v === "T" ? "✓" : v === "F" ? "✗" : "", key: it.answer === "T" ? "✓" : "✗" });
      if (it.explain) {
        const why = String(a?.why || "").trim(), wp = Number(it.whyPts) || 0;
        add({ k: it.id + "_why", n, type: "open", label: q + " — ✎", max: wp, auto: why ? null : 0, check: !!why, empty: !why,
          answer: why, key: it.model || "", question: q, model: it.model || "", criteria: "Объяснение к утверждению «верно/неверно». Правильная отметка: " + (it.answer === "T" ? "верно" : "неверно") + "." });
      }
    } else if (it.type === "input") {
      let ok = false, keyTxt = "";
      if ((it.mode || "num") === "num") {
        let exp = null;
        try { exp = it.formula ? evalFormula(it.formula, d.params || {}) : parseNum(it.answer); } catch (e) { exp = null; }
        if (exp !== null && Number.isFinite(Number(it.dec)) && it.formula) exp = roundTo(exp, Number(it.dec) || 0);
        const x = parseNum(a), tol = Math.abs(Number(String(it.tol ?? 0).replace(",", "."))) || 0;
        ok = exp !== null && x !== null && Math.abs(x - exp) <= tol + 1e-9;
        keyTxt = exp === null ? "?" : fmtNum(exp) + (tol ? " ± " + fmtNum(tol) : "");
      } else {
        const list = String(it.answer || "").split(";").map(norm).filter(Boolean);
        ok = list.includes(norm(a)); keyTxt = String(it.answer || "");
      }
      add({ k: it.id, n, type: it.type, label: q, max: pts, auto: ok ? pts : 0, answer: String(a ?? ""), key: keyTxt + (it.unit ? " " + it.unit : "") });
    } else if (it.type === "match") {
      const pairs = it.pairs || [], ans = a || {};
      const good = pairs.filter((p) => ans[p.id] === p.rid).length;
      const rt = (rid) => pairs.find((p) => p.rid === rid)?.r || "—";
      add({ k: it.id, n, type: it.type, label: q, max: pts, auto: pairs.length ? half(good / pairs.length * pts) : 0,
        answer: pairs.map((p) => `${p.l} → ${ans[p.id] ? rt(ans[p.id]) : "—"}`).join("; "), key: pairs.map((p) => `${p.l} → ${p.r}`).join("; ") });
    } else if (it.type === "sort") {
      const cards = it.cards || [], ans = a || {}, G = (it.groups || []).map((g) => g.name);
      const good = cards.filter((c) => Number(ans[c.id]) === Number(c.g) && ans[c.id] !== undefined && ans[c.id] !== "").length;
      add({ k: it.id, n, type: it.type, label: q, max: pts, auto: cards.length ? half(good / cards.length * pts) : 0,
        answer: cards.map((c) => `${c.t} → ${ans[c.id] !== undefined && ans[c.id] !== "" ? G[ans[c.id]] ?? "—" : "—"}`).join("; "),
        key: cards.map((c) => `${c.t} → ${G[c.g] ?? ""}`).join("; ") });
    } else if (it.type === "open") {
      const txt = String(a || "").trim();
      add({ k: it.id, n, type: it.type, label: q, max: pts, auto: txt ? null : 0, check: !!txt, empty: !txt, answer: txt, key: it.model || "",
        question: q, model: it.model || "", criteria: it.criteria || "" });
    }
  });
  const max = items.reduce((s, x) => s + x.max, 0);
  const total = items.reduce((s, x) => s + (x.score ?? 0), 0);
  const pending = items.filter((x) => x.score === null).length;
  const pct = max ? Math.round(total / max * 100) : 0;
  const res = { items, max, total, pct, pending, complete: !pending, grade: toGrade(total, max) };
  if (test.scale === "qual") { const q = qualOf(pct); res.qual = q[1]; res.qualName = q[2]; }
  return res;
}

// ---------- как задание выглядит у ученика ----------
// t — публичный (или полный) тест, it — задание, d — данные варианта, a — ответ, n — номер, L — подписи на языке интерфейса
export function renderItem(it, d, a, n, L, opts = {}) {
  d = d || {};
  const dis = opts.disabled ? " disabled" : "";
  const head = `<div class="task-head"><span class="task-num">${esc(L.task)} ${n}</span><span class="pts">${(Number(it.pts) || 0) + (it.type === "tf" && it.explain ? Number(it.whyPts) || 0 : 0)} ${esc(L.pts)}</span></div>
    <p class="task-title">${esc(fillParams(it.text, d.params)) || `<span class="muted">${esc(L.noText)}</span>`}</p>`;
  let body = "";
  if (it.type === "choice") {
    const ids = d.opts || (it.options || []).map((o) => o.id);
    const chosen = it.multi ? (Array.isArray(a) ? a : []) : [a];
    body = (it.multi ? `<p class="muted bt-hint">${esc(L.multi)}</p>` : "") + ids.map((id) => {
      const o = (it.options || []).find((x) => x.id === id); if (!o) return "";
      const on = chosen.includes(id);
      return `<label class="opt ${on ? "on" : ""}"><input type="${it.multi ? "checkbox" : "radio"}" name="i_${it.id}" value="${id}" data-q="${it.id}" data-role="choice"${on ? " checked" : ""}${dis}> <span>${esc(o.t)}</span></label>`;
    }).join("");
  } else if (it.type === "tf") {
    const v = a?.v;
    body = `<div class="tf-row" role="group" aria-label="${esc(L.tf)}">
      <button type="button" class="btn ${v === "T" ? "" : "ghost"}" data-q="${it.id}" data-role="tf" data-v="T" aria-pressed="${v === "T"}"${dis}>${esc(L.yes)}</button>
      <button type="button" class="btn ${v === "F" ? "" : "ghost"}" data-q="${it.id}" data-role="tf" data-v="F" aria-pressed="${v === "F"}"${dis}>${esc(L.no)}</button></div>` +
      (it.explain ? `<label class="f bt-sub" for="w_${it.id}">${esc(L.why)}</label><textarea id="w_${it.id}" data-q="${it.id}" data-role="why" rows="2"${dis}>${esc(a?.why || "")}</textarea>` : "");
  } else if (it.type === "input") {
    const numMode = (it.mode || "num") === "num";
    body = `<div class="bt-inrow"><label class="sr" for="in_${it.id}">${esc(L.answer)}</label>
      <input type="text" id="in_${it.id}" data-q="${it.id}" data-role="input" value="${esc(a ?? "")}" autocomplete="off" ${numMode ? 'inputmode="decimal"' : ""} placeholder="${esc(numMode ? L.numPh : L.textPh)}"${dis}>
      ${it.unit ? `<span class="bt-unit">${esc(it.unit)}</span>` : ""}</div>`;
  } else if (it.type === "match") {
    const left = it.left || (it.pairs || []).map((p) => ({ id: p.id, t: p.l }));
    const rightAll = it.right || (it.pairs || []).map((p) => ({ id: p.rid, t: p.r }));
    const rOrder = (d.right || rightAll.map((x) => x.id)).map((id) => rightAll.find((x) => x.id === id)).filter(Boolean);
    const ans = a || {};
    body = `<div class="bt-match">${left.map((l, i) => `<div class="bt-mrow"><label for="m_${it.id}_${l.id}">${esc(l.t)}</label>
      <select id="m_${it.id}_${l.id}" data-q="${it.id}" data-role="match" data-l="${l.id}"${dis}><option value="">${esc(L.pick)}</option>
      ${rOrder.map((r) => `<option value="${r.id}" ${ans[l.id] === r.id ? "selected" : ""}>${esc(r.t)}</option>`).join("")}</select></div>`).join("")}</div>`;
  } else if (it.type === "sort") {
    const G = it.groups ? it.groups.map((g) => (typeof g === "string" ? g : g.name)) : [];
    const cardsAll = it.cards || [];
    const cards = (d.cards || cardsAll.map((c) => c.id)).map((id) => cardsAll.find((c) => c.id === id)).filter(Boolean);
    const ans = a || {};
    body = `<p class="muted bt-hint">${esc(L.sortHint)}</p><div class="bt-match">${cards.map((c) => `<div class="bt-mrow"><label for="s_${it.id}_${c.id}">${esc(c.t)}</label>
      <select id="s_${it.id}_${c.id}" data-q="${it.id}" data-role="sort" data-c="${c.id}"${dis}><option value="">${esc(L.pick)}</option>
      ${G.map((g, gi) => `<option value="${gi}" ${String(ans[c.id]) === String(gi) ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></div>`).join("")}</div>`;
  } else if (it.type === "open") {
    body = `<label class="sr" for="o_${it.id}">${esc(L.answer)}</label><textarea id="o_${it.id}" data-q="${it.id}" data-role="open" rows="4" placeholder="${esc(L.openPh)}"${dis}>${esc(a || "")}</textarea>`;
  }
  return `<section class="card task bt-task" id="t_${it.id}">${head}${body}</section>`;
}

// Есть ли ответ на задание (для счётчика «заполнено»)
export function answered(it, a) {
  if (a === undefined || a === null) return false;
  if (it.type === "choice") return it.multi ? Array.isArray(a) && a.length > 0 : !!a;
  if (it.type === "tf") return !!a.v;
  if (it.type === "match" || it.type === "sort") { const need = it.type === "match" ? (it.left || it.pairs || []).length : (it.cards || []).length; return Object.values(a).filter((x) => x !== "" && x !== null && x !== undefined).length >= need; }
  return String(a).trim() !== "";
}
