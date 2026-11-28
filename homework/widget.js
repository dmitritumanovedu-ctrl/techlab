/*
 * TechLab — раздел «Домашнее задание» для комнаты ученика.
 *
 * Подключение в любую страницу комнаты (две строки + место для раздела):
 *   <div id="homework"></div>
 *   <script src="/techlab/homework/config.js"></script>
 *   <script src="/techlab/homework/widget.js"></script>
 *   <script>TechLabHomework.mount('#homework', '5Б');</script>
 *
 * Второй параметр — класс ученика ("5Б", "5 «Б»", "5b" — всё подходит).
 */
(function () {
  var CSS = '' +
    '.tlhw{font-family:Inter,system-ui,sans-serif;color:#0f1e3d}' +
    '.tlhw *{box-sizing:border-box}' +
    '.tlhw-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}' +
    '.tlhw-h h2{margin:0;font-size:22px}' +
    '.tlhw-refresh{border:1px solid #c7d7f2;background:#fff;border-radius:10px;padding:8px 12px;font:600 14px Inter,sans-serif;cursor:pointer;min-height:40px;color:#0f1e3d}' +
    '.tlhw-ann{background:#fff1e6;border:1px solid #fdba74;border-radius:14px;padding:14px 16px;margin-bottom:12px}' +
    '.tlhw-ann b{display:block;color:#9a3412;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}' +
    '.tlhw-ann h3{margin:0 0 4px;font-size:17px}' +
    '.tlhw-ann p,.tlhw-card p{margin:0;white-space:pre-line;font-size:15px;line-height:1.45;color:#24324f}' +
    '.tlhw-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}' +
    '.tlhw-card{background:#fff;border:1px solid #c7d7f2;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px}' +
    '.tlhw-top{display:flex;gap:6px;flex-wrap:wrap;align-items:center}' +
    '.tlhw-tag{font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;background:#dbeafe;color:#1e3a8a}' +
    '.tlhw-new{background:#ea580c;color:#fff}' +
    '.tlhw-card h3{margin:0;font-size:17px}' +
    '.tlhw-due{font-size:13px;font-weight:600;color:#4b5a7a}' +
    '.tlhw-due.late{color:#991b1b}.tlhw-due.soon{color:#9a3412}' +
    '.tlhw-file{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 14px;border-radius:10px;min-height:44px}' +
    '.tlhw-file:hover{background:#1e3a8a;color:#fff}' +
    '.tlhw-empty{background:#fff;border:1px dashed #93c5fd;border-radius:14px;padding:22px;text-align:center;color:#4b5a7a}';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function day(s) { var d = new Date(s); d.setHours(0, 0, 0, 0); return d; }
  function fmt(s) {
    var d = new Date(s); if (isNaN(d)) return s;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
  function dueInfo(due) {
    if (!due) return '';
    var diff = Math.round((day(due) - day(new Date())) / 86400000);
    var cls = diff < 0 ? 'late' : diff <= 1 ? 'soon' : '';
    var txt = diff < 0 ? 'Срок прошёл (' + fmt(due) + ')' : diff === 0 ? 'Сдать сегодня' : diff === 1 ? 'Сдать завтра' : 'Сдать до ' + fmt(due);
    return '<div class="tlhw-due ' + cls + '">' + txt + '</div>';
  }
  var DOWNLOAD_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';

  function render(box, items) {
    var ann = items.filter(function (i) { return i.type === 'announce'; });
    var hw = items.filter(function (i) { return i.type !== 'announce'; });
    var freshSince = Date.now() - 3 * 86400000;
    var html = '<div class="tlhw-h"><h2>Домашнее задание</h2><button type="button" class="tlhw-refresh">Обновить</button></div>';
    html += ann.map(function (a) {
      return '<div class="tlhw-ann"><b>Объявление · ' + fmt(a.created) + '</b>' +
        (a.title ? '<h3>' + esc(a.title) + '</h3>' : '') + '<p>' + esc(a.text) + '</p>' +
        (a.fileUrl ? '<p style="margin-top:8px"><a class="tlhw-file" href="' + esc(a.fileUrl) + '" target="_blank" rel="noopener">' + DOWNLOAD_ICON + esc(a.fileName || 'Файл') + '</a></p>' : '') +
        '</div>';
    }).join('');
    if (!hw.length) {
      html += '<div class="tlhw-empty">Домашних заданий пока нет. Отдыхай!</div>';
    } else {
      html += '<div class="tlhw-list">' + hw.map(function (h) {
        var isNew = new Date(h.created).getTime() > freshSince;
        return '<article class="tlhw-card"><div class="tlhw-top">' +
          (h.subject ? '<span class="tlhw-tag">' + esc(h.subject) + '</span>' : '') +
          (isNew ? '<span class="tlhw-tag tlhw-new">Новое</span>' : '') +
          '</div><h3>' + esc(h.title || 'Задание') + '</h3>' +
          (h.text ? '<p>' + esc(h.text) + '</p>' : '') + dueInfo(h.due) +
          (h.fileUrl ? '<a class="tlhw-file" href="' + esc(h.fileUrl) + '" target="_blank" rel="noopener">' + DOWNLOAD_ICON + 'Открыть файл</a>' : '') +
          '<div style="font-size:12px;color:#64748b">Задано ' + fmt(h.created) + '</div></article>';
      }).join('') + '</div>';
    }
    box.innerHTML = html;
  }

  function mount(target, klass) {
    var box = typeof target === 'string' ? document.querySelector(target) : target;
    if (!box) return;
    if (!document.getElementById('tlhw-css')) {
      var st = document.createElement('style'); st.id = 'tlhw-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    box.classList.add('tlhw');
    var API = window.TECHLAB_HW_API;

    function load() {
      box.innerHTML = '<div class="tlhw-empty">Загружаю задания…</div>';
      if (!API || API.indexOf('http') !== 0) {
        box.innerHTML = '<div class="tlhw-empty">Раздел ещё не подключён: в config.js нет адреса сервера.</div>';
        return;
      }
      fetch(API + '?action=list&klass=' + encodeURIComponent(klass || ''))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) throw new Error(d.error);
          render(box, d.items || []);
          box.querySelector('.tlhw-refresh').onclick = load;
        })
        .catch(function () {
          box.innerHTML = '<div class="tlhw-empty">Не удалось загрузить задания. Проверь интернет и нажми «Обновить».<br><br><button type="button" class="tlhw-refresh">Обновить</button></div>';
          box.querySelector('.tlhw-refresh').onclick = load;
        });
    }
    load();
  }

  window.TechLabHomework = { mount: mount };
})();
