// Уведомление об обработке данных и согласие (требование Microsoft Store и Закона РМ № 195/2024).
// Язык — общий для сайта (engine/i18n.js), переключатель RU · RO · EN прямо в окне.
// Показывается один раз на устройстве — до того, как ученик введёт имя или код. Подключается в тестах через autofill.js
// и на стартовой странице / в кабинете родителя отдельной строкой.
import { t, LANG, mountLangSwitch } from "./i18n.js?v=1";
const KEY = "techlab_consent_v1";
const root = new URL("../", import.meta.url).href;   // корень сайта (engine/ лежит в корне)

function accepted() { try { return localStorage.getItem(KEY) === "1"; } catch (e) { return true; } }
function accept() { try { localStorage.setItem(KEY, "1"); } catch (e) {} }

function show() {
  if (accepted() || document.getElementById("tl-consent")) return;
  const T = { h: t("c_h"), p: t("c_p"), l: t("c_l"), ok: t("c_ok") };
  const o = document.createElement("div");
  o.id = "tl-consent";
  o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-labelledby", "tl-consent-h");
  o.innerHTML = `<style>
    #tl-consent{position:fixed;inset:0;z-index:2147483000;background:rgba(11,26,59,.72);display:grid;place-items:center;padding:16px;font-family:Manrope,"Segoe UI",Arial,sans-serif}
    #tl-consent .b{background:#fff;color:#0B1A3B;border-radius:22px;padding:26px;max-width:460px;width:100%;box-shadow:0 30px 80px rgba(0,0,0,.4)}
    #tl-consent h2{margin:0 0 8px;font-size:22px}#tl-consent p{margin:0 0 14px;line-height:1.5;color:#33456E}
    #tl-consent a{color:#2E4BFF;font-weight:700}
    #tl-consent .r{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:8px}
    #tl-consent button{font:inherit;font-weight:800;border:0;border-radius:12px;padding:12px 20px;cursor:pointer}
    #tl-consent .ok{background:#2E4BFF;color:#fff;flex:1}
    #tl-consent .lsw{display:flex;justify-content:flex-end;margin:-6px -6px 4px 0}
    #tl-consent .lang-sw button{padding:5px 11px;border-radius:999px}
  </style><div class="b"><div class="lsw" id="tl-consent-lang"></div><div style="font-size:34px" aria-hidden="true">🔒</div>
    <h2 id="tl-consent-h">${T.h}</h2><p>${T.p}</p>
    <p><a href="${root}privacy.html${LANG === "ro" ? "#ro" : ""}" target="_blank" rel="noopener">${T.l} ↗</a></p>
    <div class="r"><button type="button" class="ok">${T.ok}</button></div></div>`;
  document.body.appendChild(o);
  o.querySelector(".ok").onclick = () => { accept(); o.remove(); };
  mountLangSwitch(o.querySelector("#tl-consent-lang"));   // смена языка перезагружает страницу
  o.querySelector(".ok").focus();
}

if (document.body) show(); else addEventListener("DOMContentLoaded", () => show());
