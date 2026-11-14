// Бланки для печати: 5 вариантов тренировочного итогового теста (без ответов)
import { TEST, VARIANTS, shopText, stHtml, buyText, exprHtml, mText } from "./questions.js?v=1";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sq = (w = "") => `<span class="sq ${w}"></span>`;
const lines = (n) => `<div class="lines">${"<i></i>".repeat(n)}</div>`;
const row = (body, p) => `<div class="row"><div class="body">${body}</div><div class="pc">${p ?? ""}</div></div>`;

function page(v) {
  return `<section class="sheet">
    <header>
      <div class="ttl"><b>${esc(TEST.title)}</b><span>${esc(TEST.subtitle)}</span></div>
      <div class="time">Время выполнения<br>работы: ${TEST.minutes} минут</div>
    </header>
    <div class="who"><span>Фамилия, имя: <i class="ln w1"></i></span><span>Класс: <i class="ln w2"></i></span><span>Дата: <i class="ln w2"></i></span><b class="var">Вариант ${v.id}</b></div>
    <div class="cols-h"><span></span><span>Баллы</span></div>

    ${row(`<p class="q"><b class="n">1.</b> ${esc(shopText(v))}</p>`)}
    ${row(`<p><b>а)</b> Впишите в рамку букву <b>И</b>, если высказывание истинно, или букву <b>Л</b>, если оно ложно:</p>
      <div class="tf">${v.st.map((s) => `<div><span class="m">${stHtml(s)}.</span> ${sq()}</div>`).join("")}</div>`, 3)}
    ${row(`<p><b>б)</b> Найдите <i>D</i><sub>${v.b.price}</sub>.</p><p class="m big"><i>D</i><sub>${v.b.price}</sub> = { <span class="dot"></span> }</p>`, 8)}
    ${row(`<p><b>в)</b> Дополните, чтобы получить верное равенство:</p><p class="m big">${v.budget} : ${v.a.price} = ${sq("w")} (остаток ${sq("w")}).</p>`, 2)}
    ${row(`<p><b>г)</b> ${esc(buyText(v))}</p>
      <table class="buy"><tr><th>Вариант</th><th>${esc(v.a.many)}</th><th>${esc(v.b.many)}</th><th>Проверка: стоимость</th></tr>
      ${[1, 2, 3].map((i) => `<tr><td>${i}</td><td></td><td></td><td></td></tr>`).join("")}</table>`, 6)}

    ${row(`<p class="q"><b class="n">2.</b> Дано числовое выражение:</p><p class="m expr">${exprHtml(v.ex)}.</p>`)}
    ${row(`<p><b>а)</b> Найдите значение числового выражения.</p>${lines(3)}`, 5)}
    ${row(`<p><b>б)</b> Впишите в рамку один из терминов «чётное», «нечётное»:</p>
      <p><i>Число, полученное в пункте</i> <b>а)</b>, <i>является</i> ${sq("wide")} <i>числом.</i></p>`, 2)}
    ${row(`<p><b>в)</b> Поставьте скобки в выражение так, чтобы полученный результат ${mText(v.m)}. Обоснуйте!</p>
      <p class="m expr sm">${exprHtml(v.ex)}</p>${lines(3)}`, 7)}

    <div class="scale"><b>Схема оценивания теста</b>
      <table><tr><th>Отметка</th>${TEST.scale.map(([, g]) => `<td>${g}</td>`).join("")}</tr>
      <tr><th>Сумма баллов</th>${TEST.scale.map(([min], i) => `<td>${i ? TEST.scale[i - 1][0] - 1 : TEST.max}–${min}</td>`).join("")}</tr></table>
      <div class="sum">Сумма баллов: ${sq("w")} &nbsp; Отметка: ${sq()}</div></div>
  </section>`;
}
function draw() {
  const sel = $("#sel").value, n = Math.max(1, Math.min(40, Number($("#copies").value) || 1));
  const list = sel === "all" ? VARIANTS : VARIANTS.filter((v) => String(v.id) === sel);
  $("#pages").innerHTML = list.map((v) => Array.from({ length: n }, () => page(v)).join("")).join("");
}
$("#sel").onchange = draw; $("#copies").oninput = draw;
$("#print").onclick = () => window.print();
draw();
