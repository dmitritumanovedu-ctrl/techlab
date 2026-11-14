// Если ученик вошёл на стартовой странице по своему коду — тест сам подставляет фамилию, имя и класс.
// Подключается одной строкой в любой тест или миссию:  <script type="module" src="../../engine/autofill.js"></script>
import "./consent.js?v=2";
import { getSession } from "./people.js";

const S = getSession();
if (S) {
  const fill = () => {
    for (const id of ["inName", "fio"]) {
      const el = document.getElementById(id);
      if (el && !el.dataset.tlFilled) {
        el.value = S.name; el.readOnly = true; el.dataset.tlFilled = "1";
        el.style.background = "#EEF2F8"; el.title = "Вы вошли по личному коду";
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    for (const id of ["inCls", "cls"]) {
      const el = document.getElementById(id);
      if (el && el.tagName === "SELECT" && !el.dataset.tlFilled && [...el.options].some((o) => o.value === S.cls || o.text === S.cls)) {
        el.value = S.cls; el.dataset.tlFilled = "1";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  };
  fill();
  new MutationObserver(fill).observe(document.documentElement, { childList: true, subtree: true });
}
