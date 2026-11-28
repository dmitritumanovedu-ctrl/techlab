/*
 * TechLab — кнопка «Уроки и ДЗ» на любой странице сайта.
 * Подключается ОДНОЙ строкой перед </body>:
 *   <script src="https://dmitritumanovedu-ctrl.github.io/techlab/homework/hub.js"></script>
 *
 * Показывает в правом нижнем углу кнопку. В ней:
 *   — кнопки уроков для класса ученика (новые добавляются на странице учителя, вкладка «Кнопка урока»);
 *   — объявления и домашнее задание.
 */
(function () {
  if (window.__tlHub) return; window.__tlHub = true;
  var BASE = (document.currentScript && document.currentScript.src || '').replace(/hub\.js.*$/, '');

  // Уроки, которые видны всегда (даже без сервера)
  var BUILT_IN = [
    { title: 'Подготовка к контрольной: Редактирование изображений', subject: 'Технологическое воспитание',
      url: 'https://dmitritumanovedu-ctrl.github.io/techlab/review-5/index.html', targets: ['5'] },
    { title: 'Пиксель-рейд: Графические форматы', subject: 'Технологическое воспитание',
      url: 'https://dmitritumanovedu-ctrl.github.io/techlab/formats-5/index.html', targets: ['5'] }
  ];
  var GRADES = ['5', '6', '7', '11', '12'], LETTERS = ['А', 'Б', 'В', 'Г'];
  var KEY = 'techlab_hub_class';

  function load(src, cb) { var s = document.createElement('script'); s.src = src; s.onload = cb; s.onerror = cb; document.head.appendChild(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function getK() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setK(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function norm(s) {
    var lat = { A: 'А', B: 'Б', V: 'В', G: 'Г' };
    return String(s || '').toUpperCase().replace(/[^0-9A-ZА-ЯЁ]/g, '').replace(/[A-Z]/g, function (c) { return lat[c] || c; });
  }
  function fits(targets, k) {
    if (k === 'ALL') return true;
    var g = (k.match(/^\d+/) || [''])[0];
    return (targets || []).some(function (t) { t = norm(t); return t === 'ALL' || t === g || t === k; });
  }

  var CSS = '' +
    '#tlhub-btn{position:fixed;right:20px;bottom:20px;z-index:99998;background:#ea580c;color:#fff;border:0;border-radius:999px;padding:14px 20px;font:700 16px Inter,Rubik,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:8px;min-height:52px}' +
    '#tlhub-btn:hover{background:#c2410c}' +
    '#tlhub-btn b{background:#fff;color:#c2410c;border-radius:999px;padding:1px 8px;font-size:13px}' +
    '#tlhub{position:fixed;inset:0;z-index:99999;background:rgba(15,30,61,.55);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 12px}' +
    '#tlhub.on{display:flex}' +
    '#tlhub .box{background:#f4f8ff;border-radius:18px;max-width:900px;width:100%;font-family:Inter,Rubik,system-ui,sans-serif;color:#0f1e3d;overflow:hidden}' +
    '#tlhub .top{background:#1e3a8a;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
    '#tlhub .top h2{margin:0;font-size:20px;flex:1}' +
    '#tlhub .top button,#tlhub select{border:0;border-radius:10px;padding:9px 12px;font:600 14px Inter,sans-serif;cursor:pointer;min-height:40px}' +
    '#tlhub .in{padding:20px}' +
    '#tlhub h3{margin:0 0 10px;font-size:18px}' +
    '#tlhub .lessons{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:24px}' +
    '#tlhub .lesson{display:flex;flex-direction:column;gap:6px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:14px;padding:16px;min-height:96px}' +
    '#tlhub .lesson:hover{background:#1e3a8a}' +
    '#tlhub .lesson small{opacity:.85;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}' +
    '#tlhub .lesson span{font-weight:800;font-size:17px;line-height:1.3}' +
    '#tlhub .lesson i{font-style:normal;margin-top:auto;font-weight:700;color:#fde68a}' +
    '#tlhub .pick{display:flex;flex-wrap:wrap;gap:8px}' +
    '#tlhub .pick button{border:1px solid #c7d7f2;background:#fff;border-radius:999px;padding:9px 14px;font:600 15px Inter,sans-serif;cursor:pointer;min-height:42px}' +
    '#tlhub .pick button:hover{border-color:#1d4ed8}' +
    '#tlhub .empty{background:#fff;border:1px dashed #93c5fd;border-radius:14px;padding:18px;text-align:center;color:#4b5a7a;margin-bottom:24px}';

  var items = [], klass = getK();
  var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  var btn = document.createElement('button'); btn.id = 'tlhub-btn'; btn.type = 'button';
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3z"/><path d="M18 8h2v12"/></svg>Уроки и ДЗ <b id="tlhub-n" style="display:none"></b>';
  var ov = document.createElement('div'); ov.id = 'tlhub';
  ov.innerHTML = '<div class="box" role="dialog" aria-label="Уроки и домашнее задание"><div class="top"><h2>Уроки и домашнее задание</h2>' +
    '<span id="tlhub-k"></span><button type="button" id="tlhub-x">Закрыть</button></div><div class="in" id="tlhub-in"></div></div>';
  function mountUI() { document.body.appendChild(btn); document.body.appendChild(ov); }
  if (document.body) mountUI(); else document.addEventListener('DOMContentLoaded', mountUI);
  // если страница перерисовывает себя и убирает кнопку — возвращаем её
  setInterval(function () { if (document.body && !document.getElementById('tlhub-btn')) mountUI(); }, 1000);

  btn.onclick = function () { ov.classList.add('on'); render(); };
  ov.addEventListener('click', function (e) { if (e.target === ov || e.target.id === 'tlhub-x') ov.classList.remove('on'); });

  function lessonsFor(k) {
    var server = items.filter(function (i) { return i.type === 'lesson'; }).map(function (i) {
      return { title: i.title, subject: i.subject, url: i.fileUrl, targets: i.targets, text: i.text };
    });
    var urls = {}; return server.concat(BUILT_IN).filter(function (l) {
      if (urls[l.url] || !fits(l.targets, k)) return false; urls[l.url] = 1; return true;
    });
  }
  function count() {
    var n = klass ? lessonsFor(klass).length : 0, el = document.getElementById('tlhub-n');
    if (el) { el.textContent = n; el.style.display = n ? '' : 'none'; }
  }

  function render() {
    var box = document.getElementById('tlhub-in'), kl = document.getElementById('tlhub-k');
    if (!klass) {
      kl.innerHTML = '';
      box.innerHTML = '<h3>В каком ты классе?</h3><div class="pick">' +
        GRADES.map(function (g) { return LETTERS.map(function (l) { return '<button type="button" data-k="' + g + l + '">' + g + ' «' + l + '»</button>'; }).join(''); }).join('') +
        '<button type="button" data-k="ALL">Учитель — показать всё</button></div>';
      box.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { klass = b.dataset.k; setK(klass); count(); render(); fetchItems(); }; });
      return;
    }
    kl.innerHTML = '<button type="button" id="tlhub-ch">' + (klass === 'ALL' ? 'Учитель' : esc(klass.replace(/^(\d+)(.*)$/, '$1 «$2»'))) + ' · сменить</button>';
    document.getElementById('tlhub-ch').onclick = function () { klass = ''; setK(''); render(); };
    var ls = lessonsFor(klass);
    box.innerHTML = '<h3>Уроки</h3>' + (ls.length ? '<div class="lessons">' + ls.map(function (l) {
      return '<a class="lesson" href="' + esc(l.url) + '"><small>' + esc(l.subject || 'Урок') + '</small><span>' + esc(l.title) + '</span>' +
        (l.text ? '<small style="text-transform:none;letter-spacing:0">' + esc(l.text) + '</small>' : '') + '<i>Открыть ▶</i></a>';
    }).join('') + '</div>' : '<div class="empty">Пока уроков нет.</div>') + '<div id="tlhub-hw"></div>';
    if (window.TechLabHomework) window.TechLabHomework.mount('#tlhub-hw', klass === 'ALL' ? '' : klass);
  }

  function fetchItems() {
    var API = window.TECHLAB_HW_API || '';
    if (API.indexOf('http') !== 0) { count(); return; }
    fetch(API + '?action=list&klass=' + encodeURIComponent(klass === 'ALL' ? '' : klass))
      .then(function (r) { return r.json(); })
      .then(function (d) { items = (d && d.items) || []; count(); if (ov.classList.contains('on')) render(); })
      .catch(count);
  }
  load(BASE + 'config.js', function () { load(BASE + 'widget.js', fetchItems); });
  count();
})();
