// =====================================================================
//  TechLab Pro · регистрация и подключение тарифа: 1) аккаунт  2) тариф  3) оплата
//  Аккаунт — вход через Google (тот же Firebase, что у кабинета учителя).
//  Оплата: когда в CONFIG.payUrl (pro.js) появится ссылка платёжного сервиса,
//  кнопка поведёт туда. Пока ссылки нет — заявка уходит письмом администратору.
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../firebase-config.js";
import { CONFIG, LANG, T as BASE, esc, header, footer, boot, TEACHER } from "./pro.js?v=2";

const auth = getAuth(initializeApp(firebaseConfig));
let USER = null, STEP = 1, SENT = false;
let PLAN = new URLSearchParams(location.search).get("plan") || "month";
if (!["free", "month", "year"].includes(PLAN)) PLAN = "month";

const LOC = { ru: "ru-RU", ro: "ro-RO", en: "en-GB" };
const X = {
ru: { h: "Подключение TechLab", steps: ["Аккаунт", "Тариф", "Оплата"],
  s1h: "Войдите как учитель", s1p: "Аккаунт Google нужен, чтобы ваши классы, работы и оценки были только у вас. Пароль придумывать не нужно.",
  google: "Войти через Google", as: "Вы вошли как", other: "Другой аккаунт", next: "Дальше", back: "Назад",
  s2h: "Выберите тариф", free: "Бесплатный", freeP: `${CONFIG.freeClasses} класс, ${CONFIG.freeWorks} работы, без проверки ИИ`,
  month: "Pro помесячно", monthP: `${CONFIG.priceMonth} в месяц`, year: "Pro на год", yearP: `${CONFIG.priceYear} в год — 2 месяца в подарок`, best: "выгоднее",
  trial: `Первые ${CONFIG.trialDays} дней Pro — бесплатно`,
  s3h: "Оплата", today: "Сегодня", first: "Первое списание", rem: "Напомним на почту за 3 дня до списания", cancel: "Отменить можно в один клик в кабинете",
  card: "Банковская карта · Visa / Mastercard", pay: "Перейти к оплате картой", req: "Отправить заявку на Pro",
  soon: "Оплата картой появится на сайте в ближайшее время. Пока отправьте заявку — Pro включим вручную, пробные 14 дней начнутся с этого момента.",
  sent: "Письмо с заявкой открыто в вашей почте — нажмите в нём «Отправить». Ответим и включим Pro.",
  freeH: "Готово!", freeT: "Бесплатный тариф уже ваш. Откройте кабинет учителя — там можно создать класс и первую работу. Если вы новый учитель на сайте, администратор подтвердит доступ.",
  open: "Открыть кабинет учителя", subj: "Заявка на TechLab Pro", total: "К оплате сегодня", secure: "Данные карты вводятся на защищённой странице платёжного сервиса — TechLab их не видит.",
  err: "Не удалось войти. Разрешите всплывающие окна для этого сайта и попробуйте ещё раз." },
ro: { h: "Conectare TechLab", steps: ["Cont", "Tarif", "Plată"],
  s1h: "Intrați ca profesor", s1p: "Contul Google este necesar ca clasele, lucrările și notele să fie doar ale dvs. Nu trebuie să inventați o parolă.",
  google: "Intră cu Google", as: "Ați intrat ca", other: "Alt cont", next: "Mai departe", back: "Înapoi",
  s2h: "Alegeți tariful", free: "Gratuit", freeP: `${CONFIG.freeClasses} clasă, ${CONFIG.freeWorks} lucrări, fără verificare IA`,
  month: "Pro lunar", monthP: `${CONFIG.priceMonth} pe lună`, year: "Pro anual", yearP: `${CONFIG.priceYear} pe an — 2 luni cadou`, best: "mai avantajos",
  trial: `Primele ${CONFIG.trialDays} zile de Pro — gratuit`,
  s3h: "Plata", today: "Astăzi", first: "Prima plată", rem: "Vă amintim prin e-mail cu 3 zile înainte de plată", cancel: "Anulați dintr-un clic în cabinet",
  card: "Card bancar · Visa / Mastercard", pay: "Treci la plata cu cardul", req: "Trimite cererea pentru Pro",
  soon: "Plata cu cardul va apărea pe site în curând. Deocamdată trimiteți cererea — activăm Pro manual, iar cele 14 zile de probă încep din acel moment.",
  sent: "Scrisoarea cu cererea s-a deschis în poșta dvs. — apăsați în ea „Trimite”. Vă răspundem și activăm Pro.",
  freeH: "Gata!", freeT: "Tariful gratuit este deja al dvs. Deschideți cabinetul profesorului — acolo creați clasa și prima lucrare. Dacă sunteți profesor nou pe site, administratorul va confirma accesul.",
  open: "Deschide cabinetul profesorului", subj: "Cerere TechLab Pro", total: "De plată astăzi", secure: "Datele cardului se introduc pe pagina securizată a serviciului de plată — TechLab nu le vede.",
  err: "Nu s-a reușit intrarea. Permiteți ferestrele pop-up pentru acest site și încercați din nou." },
en: { h: "Get started with TechLab", steps: ["Account", "Plan", "Payment"],
  s1h: "Sign in as a teacher", s1p: "A Google account keeps your classes, tests and grades yours alone. No new password needed.",
  google: "Sign in with Google", as: "Signed in as", other: "Use another account", next: "Continue", back: "Back",
  s2h: "Choose a plan", free: "Free", freeP: `${CONFIG.freeClasses} class, ${CONFIG.freeWorks} tests, no AI marking`,
  month: "Pro monthly", monthP: `${CONFIG.priceMonth} per month`, year: "Pro yearly", yearP: `${CONFIG.priceYear} per year — 2 months free`, best: "best value",
  trial: `First ${CONFIG.trialDays} days of Pro are free`,
  s3h: "Payment", today: "Today", first: "First charge", rem: "We'll email you 3 days before the charge", cancel: "Cancel in one click from your dashboard",
  card: "Bank card · Visa / Mastercard", pay: "Continue to card payment", req: "Send Pro request",
  soon: "Card payment is coming to the site soon. For now, send a request — we'll switch Pro on manually and your 14-day trial starts then.",
  sent: "An email with your request has opened in your mail app — press “Send” there. We'll reply and switch Pro on.",
  freeH: "All set!", freeT: "The free plan is yours. Open the teacher dashboard to create a class and your first test. If you're new to the site, the administrator will confirm your access.",
  open: "Open teacher dashboard", subj: "TechLab Pro request", total: "Due today", secure: "Card details are entered on the payment provider's secure page — TechLab never sees them.",
  err: "Couldn't sign in. Allow pop-ups for this site and try again." },
};

const firstCharge = () => new Date(Date.now() + CONFIG.trialDays * 864e5).toLocaleDateString(LOC[LANG], { day: "numeric", month: "long", year: "numeric" });

function render() {
  const t = BASE[LANG], x = X[LANG];
  document.title = `${x.h} · TechLab`;
  const steps = `<ol class="steps" aria-label="${esc(x.h)}">${x.steps.map((n, i) => `<li class="${i + 1 < STEP ? "done" : i + 1 === STEP ? "on" : ""}"${i + 1 === STEP ? ' aria-current="step"' : ""}><span>${i + 1 < STEP ? "✓" : i + 1}</span>${esc(n)}</li>`).join("")}</ol>`;
  let body = "";
  if (STEP === 1) {
    body = `<h2>${esc(x.s1h)}</h2><p class="muted">${esc(x.s1p)}</p>
      ${USER ? `<div class="who-box"><span class="ava">${esc((USER.displayName || USER.email || "?")[0].toUpperCase())}</span><div><small>${esc(x.as)}</small><b>${esc(USER.email || "")}</b></div><button type="button" class="linkbtn" id="out">${esc(x.other)}</button></div>
        <button type="button" class="btn p big wide" data-go="2">${esc(x.next)}</button>`
      : `<button type="button" class="btn g big wide" id="gIn"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>${esc(x.google)}</button>
        <div class="err" id="err" role="alert"></div>`}`;
  } else if (STEP === 2) {
    const opt = (id, n, p, badge) => `<label class="opt${PLAN === id ? " sel" : ""}"><input type="radio" name="plan" value="${id}" ${PLAN === id ? "checked" : ""}><span class="dot"></span><span class="ot"><b>${esc(n)}</b><small>${esc(p)}</small></span>${badge ? `<span class="chip" style="background:#DDF4EA;color:#145C3E">${esc(badge)}</span>` : ""}</label>`;
    body = `<h2>${esc(x.s2h)}</h2><div class="opts" role="radiogroup">${opt("free", x.free, x.freeP)}${opt("month", x.month, x.monthP)}${opt("year", x.year, x.yearP, x.best)}</div>
      ${PLAN !== "free" ? `<p class="trial">${esc(x.trial)}</p>` : ""}
      <div class="row2"><button type="button" class="btn g" data-go="1">${esc(x.back)}</button><button type="button" class="btn p" data-go="3">${esc(x.next)}</button></div>`;
  } else if (PLAN === "free") {
    body = `<div class="done-ic" aria-hidden="true">✓</div><h2>${esc(x.freeH)}</h2><p class="muted">${esc(x.freeT)}</p><a class="btn p big wide" href="${TEACHER}">${esc(x.open)}</a>
      <div class="row2"><button type="button" class="btn g" data-go="2">${esc(x.back)}</button></div>`;
  } else {
    const price = PLAN === "year" ? CONFIG.priceYear : CONFIG.priceMonth, name = PLAN === "year" ? x.year : x.month;
    body = `<h2>${esc(x.s3h)}</h2>
      <div class="sum"><div class="sum-r"><span>${esc(name)}</span><b>${price}</b></div>
        <div class="sum-r ok"><span>${esc(x.trial)}</span><b>−${price}</b></div>
        <div class="sum-r tot"><span>${esc(x.total)}</span><b>$0</b></div>
        <div class="sum-r"><span>${esc(x.first)}</span><b>${esc(firstCharge())} · ${price}</b></div></div>
      <ul class="ticks"><li>${esc(x.rem)}</li><li>${esc(x.cancel)}</li></ul>
      <div class="cardline"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>${esc(x.card)}</div>
      ${CONFIG.payUrl ? `<button type="button" class="btn p big wide" id="pay">${esc(x.pay)}</button><p class="muted small">${esc(x.secure)}</p>`
        : `<p class="soon">${esc(SENT ? x.sent : x.soon)}</p><button type="button" class="btn p big wide" id="req">${esc(x.req)}</button>`}
      <div class="row2"><button type="button" class="btn g" data-go="2">${esc(x.back)}</button></div>`;
  }
  document.getElementById("app").innerHTML = `${header(t)}<main class="co"><div class="co-in"><h1 class="co-h">${esc(x.h)}</h1>${steps}<section class="co-card">${body}</section></div></main>${footer(t)}`;

  const $ = (s) => document.querySelector(s);
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => { STEP = Number(b.dataset.go); if (STEP > 1 && !USER) STEP = 1; render(); window.scrollTo(0, 0); });
  document.querySelectorAll('input[name="plan"]').forEach((r) => r.onchange = () => { PLAN = r.value; render(); });
  if ($("#gIn")) $("#gIn").onclick = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); STEP = 2; render(); }
    catch (e) { $("#err").textContent = x.err; console.warn(e); }
  };
  if ($("#out")) $("#out").onclick = async () => { await signOut(auth); USER = null; render(); };
  if ($("#pay")) $("#pay").onclick = () => {
    const u = new URL(CONFIG.payUrl);
    if (USER?.email) u.searchParams.set("email", USER.email);
    u.searchParams.set("plan", PLAN);
    location.href = u.href;
  };
  if ($("#req")) $("#req").onclick = () => {
    const body = `Email: ${USER?.email || ""}\nName: ${USER?.displayName || ""}\nPlan: ${PLAN === "year" ? `${x.year} ${CONFIG.priceYear}` : `${x.month} ${CONFIG.priceMonth}`}\nTrial: ${CONFIG.trialDays} days\nLang: ${LANG}`;
    location.href = `mailto:${CONFIG.requestEmail}?subject=${encodeURIComponent(`${x.subj} · ${USER?.email || ""}`)}&body=${encodeURIComponent(body)}`;
    SENT = true; setTimeout(render, 400);
  };
}

onAuthStateChanged(auth, (u) => { USER = u; if (!u) STEP = 1; render(); });
boot(render);
