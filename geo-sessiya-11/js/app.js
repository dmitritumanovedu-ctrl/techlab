/* =========================================================
   Страница ученика: старт → тест («закрытый экран», таймер) → результат + PDF
   ========================================================= */
(function () {
  'use strict';
  const C = window.GEO_CONFIG, G = window.GEO, V = GEO_VARIANTS;
  const KEY = 'geoSession11_state';
  const $ = id => document.getElementById(id);
  let S = null, armed = false, lastViol = 0, tick = null, saveT = null;

  /* ---------- хранение (переживает перезагрузку страницы) ---------- */
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно – тест всё равно работает */ } };
  const clearState = () => { try { localStorage.removeItem(KEY); } catch (e) { } };
  const variant = () => V.find(v => v.id === S.v);
  const violCount = () => (S.viol || []).filter(x => !x.u).length;
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  /* ---------- модальное окно вместо confirm() ---------- */
  function ask(title, html, yes = 'Да', no = 'Отмена') {
    return new Promise(res => {
      $('mTitle').textContent = title; $('mText').innerHTML = html;
      $('mYes').textContent = yes; $('mNo').textContent = no; $('mNo').classList.toggle('hidden', !no);
      $('modal').classList.remove('hidden');
      const done = v => { $('modal').classList.add('hidden'); $('mYes').onclick = $('mNo').onclick = null; res(v); };
      $('mYes').onclick = () => done(true); $('mNo').onclick = () => done(false);
    });
  }

  /* ---------- инициализация ---------- */
  document.title = C.title + ' · 11 класс';
  $('hTitle').textContent = C.title; $('hSub').textContent = C.subtitle;
  $('fMin').textContent = C.durationMin; $('rMax').textContent = C.maxViolations;
  $('footSchool').textContent = $('footSchool2').textContent = C.school + ' · ' + C.year + ' уч. год';
  $('clsList').innerHTML = C.classes.map(c => `<option value="${G.esc(c)}">`).join('');
  $('fVar').innerHTML = '<option value="">Случайный вариант</option>' + V.map(v => `<option value="${v.id}">Вариант ${v.id}</option>`).join('');
  const qv = +new URLSearchParams(location.search).get('v');
  if (V.some(v => v.id === qv)) { $('fVar').value = qv; $('fVar').disabled = true; }

  const prev = load();
  if (prev && prev.submitted) { S = prev; showResult(); }
  else if (prev && prev.v) {
    $('resumeCard').classList.remove('hidden');
    const left = prev.end - Date.now();
    $('resumeInfo').innerHTML = `<b>${G.esc(prev.name)}</b>, ${G.esc(prev.cls)} · Вариант № ${prev.v} · ` +
      (left > 0 ? `осталось <b>${mmss(left)}</b>` : '<b>время истекло</b> – тест будет завершён');
  }

  /* ---------- старт ---------- */
  $('btnStart').onclick = () => {
    const name = $('fName').value.trim().replace(/\s+/g, ' '), cls = $('fClass').value.trim();
    const err = m => { $('startErr').textContent = m; };
    if (name.length < 3 || !/\s/.test(name)) return err('Введите фамилию и имя полностью.');
    if (!cls) return err('Укажите класс.');
    if (!$('fAgree').checked) return err('Отметьте, что вы прочитали правила.');
    if (prev && prev.v && !prev.submitted) return err('Сначала завершите начатый тест (кнопка «Продолжить тест» выше).');
    const v = +$('fVar').value || V[Math.floor(Math.random() * V.length)].id;
    const now = Date.now();
    S = { name, cls, v, start: now, end: now + C.durationMin * 60000, A: {}, self: {}, viol: [], submitted: false };
    save(); goFull(); beginTest();
  };
  $('btnResume').onclick = () => {
    S = prev;
    if (S.end > Date.now()) S.viol.push({ t: Date.now(), r: 'Повторное открытие страницы теста' });
    save(); goFull(); beginTest();
  };

  function goFull() {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => { });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { }
  }
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  /* ---------- тест ---------- */
  function beginTest() {
    if (Date.now() >= S.end) { submit(true); return; }
    const v = variant();
    $('start').classList.add('hidden'); $('test').classList.remove('hidden');
    $('bName').textContent = S.name;
    $('bInfo').textContent = `${S.cls} · Вариант № ${S.v}`;
    $('tasks').innerHTML = G.renderInteractive(v);
    $('nav').innerHTML = v.tasks.map((_, i) => `<a href="#task${i + 1}" data-n="${i + 1}">${i + 1}</a>`).join('');
    restore(); progress();
    document.body.classList.add('exam');
    window.scrollTo(0, 0);
    tickFn(); tick = setInterval(tickFn, 1000);
    setTimeout(() => { armed = true; lastViol = Date.now(); }, 900);
  }

  function restore() {
    document.querySelectorAll('#tasks [data-key]').forEach(el => {
      const k = el.dataset.key, val = S.A[k];
      if (el.type === 'radio') el.checked = val === el.value;
      else el.value = val ?? '';
      if (val) el.classList.add('filled');
    });
  }

  $('tasks').addEventListener('input', onAns);
  $('tasks').addEventListener('change', onAns);
  function onAns(e) {
    const el = e.target, k = el.dataset && el.dataset.key;
    if (!k || !S || S.submitted) return;
    if (el.type === 'radio') { if (el.checked) S.A[k] = el.value; }
    else S.A[k] = el.value;
    el.classList.toggle('filled', !!el.value);
    clearTimeout(saveT); saveT = setTimeout(save, 250);
    progress();
  }

  function answeredTasks() {
    const v = variant(); let n = 0;
    v.tasks.forEach((_, i) => {
      const p = `t${i + 1}_`;
      const done = Object.keys(S.A).some(k => k.startsWith(p) && String(S.A[k]).trim());
      if (done) n++;
      const a = document.querySelector(`#nav a[data-n="${i + 1}"]`); if (a) a.classList.toggle('done', done);
    });
    return n;
  }
  function progress() { $('bProg').textContent = `Отвечено: ${answeredTasks()} из ${variant().tasks.length}`; }

  function tickFn() {
    const left = S.end - Date.now();
    const t = $('timer');
    t.textContent = mmss(left);
    t.classList.toggle('warn', left <= 10 * 60000 && left > 60000);
    t.classList.toggle('crit', left <= 60000);
    if (left <= 0) submit(true);
  }

  /* ---------- «закрытый экран» ---------- */
  function violation(reason) {
    if (!armed || !S || S.submitted || !$('lock').classList.contains('hidden')) return;
    const now = Date.now();
    if (now - lastViol < 1500) return;
    lastViol = now;
    S.viol.push({ t: now, r: reason }); save();
    showLock();
  }
  function showLock() {
    const n = violCount(), max = C.maxViolations;
    document.body.classList.add('locked');
    $('lock').classList.remove('hidden');
    $('lockCount').textContent = `Выход из теста № ${n} (допустимо: ${max})`;
    const blocked = n >= max;
    $('lockTitle').textContent = blocked ? 'Тест заблокирован' : 'Экран теста закрыт';
    $('lockText').textContent = blocked
      ? 'Вы слишком много раз покидали тест. Все выходы записаны в бланк ответов.'
      : 'Вы покинули окно теста. Это нарушение зафиксировано и будет указано в бланке ответов.';
    $('lockReturn').classList.toggle('hidden', blocked);
    $('lockPin').classList.toggle('hidden', !blocked);
    $('pinErr').textContent = ''; $('pinInp').value = '';
    if (blocked) setTimeout(() => $('pinInp').focus(), 50);
  }
  function hideLock() {
    document.body.classList.remove('locked');
    $('lock').classList.add('hidden');
    lastViol = Date.now();
  }
  $('btnBack').onclick = () => { hideLock(); goFull(); };
  $('btnPin').onclick = () => {
    if ($('pinInp').value === String(C.teacherPin)) {
      S.viol.push({ t: Date.now(), r: 'Разблокировано учителем', u: true }); save();
      hideLock(); goFull();
    } else $('pinErr').textContent = 'Неверный PIN.';
  };
  $('pinInp').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnPin').click(); });

  document.addEventListener('visibilitychange', () => { if (document.hidden) violation('Переход на другую вкладку или окно'); });
  window.addEventListener('blur', () => violation('Окно теста потеряло фокус (другая программа)'));
  const onFs = () => { if (!isFull()) violation('Выход из полноэкранного режима'); };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  const block = e => { if (armed) { e.preventDefault(); return false; } };
  ['contextmenu', 'copy', 'cut', 'paste', 'dragstart', 'drop'].forEach(ev => document.addEventListener(ev, block));
  document.addEventListener('keydown', e => {
    if (!armed) return;
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'p', 's', 'u', 'f', 'a'].includes(k) && !(k === 'a' && e.target.matches && e.target.matches('.inp'))) e.preventDefault();
    if (k === 'f12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(k))) e.preventDefault();
  });
  window.addEventListener('beforeunload', e => { if (armed && S && !S.submitted) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- завершение ---------- */
  async function finishAsk() {
    const n = answeredTasks(), all = variant().tasks.length;
    const ok = await ask('Завершить тест?',
      `<p>Вы ответили на <b>${n} из ${all}</b> заданий. Осталось времени: <b>${mmss(S.end - Date.now())}</b>.</p><p>После завершения изменить ответы будет нельзя.</p>`,
      'Завершить', 'Вернуться к тесту');
    if (ok) submit(false);
  }
  $('btnFinish').onclick = finishAsk;
  $('btnFinish2').onclick = finishAsk;

  function submit(auto) {
    if (!S || S.submitted) return;
    armed = false; clearInterval(tick);
    S.submitted = true; S.auto = !!auto; S.finishedAt = auto ? Math.min(Date.now(), S.end) : Date.now();
    save();
    document.body.classList.remove('exam');
    hideLock(); $('modal').classList.add('hidden');
    if (isFull()) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { } }
    showResult();
    if (auto) ask('Время вышло', '<p>Тест завершён автоматически. Ваши ответы сохранены.</p>', 'Понятно', '');
  }

  /* ---------- результат ---------- */
  function showResult() {
    $('start').classList.add('hidden'); $('test').classList.add('hidden'); $('result').classList.remove('hidden');
    window.scrollTo(0, 0);
    renderResult();
  }
  function renderResult() {
    const v = variant(), res = G.score(v, S.A, S.self);
    $('rTitle').textContent = `Результат: ${res.total} из ${res.max} баллов`;
    $('rSub').textContent = `${S.name}, ${S.cls} · Вариант № ${S.v} · выходов из теста: ${violCount()}`;
    $('gMark').textContent = res.grade;
    $('gBox').style.setProperty('--p', Math.round(res.total / res.max * 100));
    $('kTotal').textContent = `${res.total} / ${res.max}`;
    $('kAuto').textContent = `${res.autoPts} / ${res.autoMax}`;
    $('kOpen').textContent = res.openRated ? `${res.openPts} / ${res.openMax}` : `? / ${res.openMax}`;
    $('openWarn').classList.toggle('hidden', !C.showAnswersAfter);
    $('review').innerHTML = C.showAnswersAfter
      ? '<div class="sec">Разбор ответов</div><div class="rv-head"><div>Пункт</div><div>Ваш ответ</div><div>Правильный ответ</div><div>Баллы</div></div>' + G.renderReview(v, res)
      : `<div class="card"><h2>Баллы по заданиям</h2>${res.tasks.map(t => `<div>Задание ${t.n}: <b>${t.pts} / ${t.max}</b></div>`).join('')}<p class="note">Развёрнутые ответы проверит учитель.</p></div>`;
  }
  $('review').addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.self;
    if (!k) return;
    S.self[k] = e.target.value; save();
    const y = window.scrollY; renderResult(); window.scrollTo(0, y);
  });

  /* ---------- PDF и печать ---------- */
  const blankHtml = () => G.renderStudentBlank(variant(), S, G.score(variant(), S.A, S.self), C);
  const fileName = () => `Сессия_География_${S.name.replace(/[^\p{L}\d]+/gu, '_')}_В${S.v}.pdf`;

  $('btnPdf').onclick = () => {
    $('pdfErr').textContent = '';
    if (!window.html2pdf) { $('pdfErr').textContent = 'Модуль PDF не загрузился (нет интернета?). Используйте «Печать бланка» → «Сохранить как PDF».'; return; }
    const el = document.createElement('div');
    el.innerHTML = blankHtml();
    const btn = $('btnPdf'); btn.disabled = true; btn.textContent = 'Создаю PDF…';
    window.html2pdf().set({
      margin: [8, 8, 10, 8], filename: fileName(),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.avoid'] }
    }).from(el).save()
      .catch(() => { $('pdfErr').textContent = 'Не удалось создать PDF. Используйте «Печать бланка» → «Сохранить как PDF».'; })
      .finally(() => { btn.disabled = false; btn.textContent = '⬇ Скачать бланк ответов (PDF)'; });
  };

  $('btnPrint').onclick = () => {
    $('printArea').innerHTML = blankHtml();
    document.body.classList.add('printing');
    window.print();
  };
  window.addEventListener('afterprint', () => document.body.classList.remove('printing'));

  $('btnAgain').onclick = async () => {
    const ok = await ask('Пройти другой вариант?', '<p>Текущий результат будет удалён с этого устройства. Если нужно, сначала скачайте бланк ответов в PDF.</p>', 'Начать заново');
    if (ok) { clearState(); location.href = location.pathname; }
  };
})();
