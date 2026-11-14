import { t } from "./engine/i18n.js?v=1";
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
  addEventListener("appinstalled", () => { btn.hidden = true; toast(t("inst_done")); });
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
  const steps = t(isIOS ? "inst_steps_ios" : isAndroid ? "inst_steps_and" : "inst_steps_pc");
  const o = document.createElement("div");
  o.className = "code-ov";
  o.innerHTML = `<div class="code-box inst-box" role="dialog" aria-modal="true" aria-labelledby="instT">
    <h2 id="instT">${t("inst_h")}</h2>
    <p>${t(isIOS ? "inst_ios" : isAndroid ? "inst_and" : "inst_pc")}</p>
    <ol class="inst">${steps.map(([a, b]) => `<li><span>${a}</span>${b ? `<small>${b}</small>` : ""}</li>`).join("")}</ol>
    <small>${t("inst_note")}</small>
    <div class="cb-row"><button type="button" class="btn-p" id="instOk">${t("ok")}</button></div></div>`;
  document.body.appendChild(o);
  o.querySelector("#instOk").onclick = () => o.remove();
  o.addEventListener("click", (e) => { if (e.target === o) o.remove(); });
}

function toast(t) {
  const d = document.createElement("div"); d.className = "inst-toast"; d.textContent = t;
  document.body.appendChild(d); setTimeout(() => d.remove(), 3500);
}
