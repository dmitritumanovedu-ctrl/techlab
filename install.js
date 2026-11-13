// Установка TechLab как приложения (компьютер, Android, iPhone) + регистрация service worker
const btn = document.getElementById("installBtn");
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let deferred = null;

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js", { scope: "./" }).catch((e) => console.warn("SW:", e)));
}

if (btn && !standalone) {
  btn.hidden = false;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; btn.classList.add("ready"); });
  addEventListener("appinstalled", () => { btn.hidden = true; toast("✓ TechLab установлен — ищи значок на рабочем столе"); });
  btn.onclick = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === "accepted") btn.hidden = true;
      return;
    }
    help();
  };
}

function help() {
  const steps = isIOS
    ? [["Открой сайт в <b>Safari</b>", "в Chrome на iPhone установка не работает"], ["Нажми кнопку <b>«Поделиться»</b>", "квадрат со стрелкой вверх внизу экрана"], ["Выбери <b>«На экран „Домой“»</b>", "прокрути список вниз"], ["Нажми <b>«Добавить»</b>", "значок TechLab появится на экране"]]
    : isAndroid
      ? [["Открой сайт в <b>Chrome</b>", ""], ["Нажми меню <b>⋮</b>", "три точки справа вверху"], ["Выбери <b>«Установить приложение»</b>", "или «Добавить на главный экран»"], ["Подтверди <b>«Установить»</b>", "значок TechLab появится среди приложений"]]
      : [["Открой сайт в <b>Chrome</b> или <b>Edge</b>", "в Firefox установка недоступна"], ["Найди значок <b>«Установить»</b>", "справа в адресной строке (монитор со стрелкой) или меню ⋮ → «Установить TechLab»"], ["Нажми <b>«Установить»</b>", "TechLab откроется отдельным окном"], ["Готово!", "ярлык появится на рабочем столе и в меню «Пуск»"]];
  const o = document.createElement("div");
  o.className = "code-ov";
  o.innerHTML = `<div class="code-box inst-box" role="dialog" aria-modal="true" aria-labelledby="instT">
    <h2 id="instT">📲 Установить TechLab</h2>
    <p>${isIOS ? "На iPhone и iPad:" : isAndroid ? "На телефоне Android:" : "На компьютере:"}</p>
    <ol class="inst">${steps.map(([a, b]) => `<li><span>${a}</span>${b ? `<small>${b}</small>` : ""}</li>`).join("")}</ol>
    <small>Приложение бесплатное, весит меньше 1 МБ и обновляется само. Для тестов нужен интернет.</small>
    <div class="cb-row"><button type="button" class="btn-p" id="instOk">Понятно</button></div></div>`;
  document.body.appendChild(o);
  o.querySelector("#instOk").onclick = () => o.remove();
  o.addEventListener("click", (e) => { if (e.target === o) o.remove(); });
}

function toast(t) {
  const d = document.createElement("div"); d.className = "inst-toast"; d.textContent = t;
  document.body.appendChild(d); setTimeout(() => d.remove(), 3500);
}
