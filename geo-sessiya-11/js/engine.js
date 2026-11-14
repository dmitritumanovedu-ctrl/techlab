/* =========================================================
   Движок теста: отображение заданий, проверка, бланки, барем
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------- утилиты ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е')
    .replace(/[«»"'`.,;:!?()\[\]\/\\–—\-]/g, ' ').replace(/\s+/g, ' ').trim();

  function nums(s) {
    s = String(s ?? '').replace(/[−–—]/g, '-').replace(/,/g, '.').replace(/\s+/g, '');
    return (s.match(/[-+]?\d+(?:\.\d+)?/g) || []).map(parseFloat);
  }
  /* последнее число в строке: «5600 – 200 = 5400» → 5400 */
  const numLast = s => { const a = nums(s); return a.length ? a[a.length - 1] : NaN; };
  const numFirst = s => { const a = nums(s); return a.length ? a[0] : NaN; };

  function fmt(n) {
    if (!isFinite(n)) return '—';
    const r = Math.round(n * 100) / 100;
    return (r < 0 ? '–' : '') + String(Math.abs(r)).replace('.', ',');
  }
  const fmtT = n => (n > 0 ? '+' : '') + fmt(n);
  const deg = n => fmt(n) + '°';

  function kwHit(ans, list, not) {
    const n = norm(ans);
    if (!n) return -1;
    if (not && not.some(x => n.includes(norm(x)))) return -1;
    return list.findIndex(x => n.includes(norm(x)));
  }

  const LET = ['А', 'Б', 'В', 'Г'];
  const HEM = { с: 'с. ш.', ю: 'ю. ш.', в: 'в. д.', з: 'з. д.' };
  const HEM_FULL = { с: 'северной широты', ю: 'южной широты', в: 'восточной долготы', з: 'западной долготы' };

  const SECTIONS = {
    1: 'I. Познавательная область «Знание и понимание»',
    4: 'II. Познавательная область «Применение»',
    7: 'III. Познавательная область «Интеграция (синтез) и перенос»'
  };

  const SCALE = [[47, 49, 10], [42, 46, 9], [35, 41, 8], [32, 34, 7], [25, 31, 6], [15, 24, 5], [10, 14, 4], [6, 9, 3], [4, 5, 2], [0, 3, 1]];
  const SCALE_PCT = ['96–100 %', '86–95 %', '76–85 %', '66–75 %', '51–65 %', '31–50 %', '20–30 %', '11–19 %', '6–10 %', '0–5 %'];
  const grade = t => { for (const [a, b, g] of SCALE) if (t >= a) return g; return 1; };

  const TITLES = {
    tf: 'Верно / неверно', industry: 'Отрасли промышленности', group: 'Группировка', match: 'Установление соответствия',
    coords: 'Географические координаты', extent: 'Протяжённость по градусной сети', alt: 'Температура воздуха и высота',
    demo: 'Демографические показатели', statement: 'Задание на основе утверждения'
  };

  /* ---------- элементы форм (для ученика) ---------- */
  const inp = (key, ph = '', cls = '') =>
    `<input type="text" class="inp ${cls}" data-key="${key}" placeholder="${esc(ph)}" autocomplete="off" spellcheck="false">`;
  const ta = (key, rows = 4) => `<textarea class="inp ta" data-key="${key}" rows="${rows}" placeholder="Развёрнутый ответ…" spellcheck="false"></textarea>`;
  const sel = (key, opts, cls = '') =>
    `<select class="inp sel ${cls}" data-key="${key}"><option value="">—</option>${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>`;
  const hemSel = (key, axis) => sel(key, axis === 'lat' ? [['с', 'северной широты'], ['ю', 'южной широты']] : [['в', 'восточной долготы'], ['з', 'западной долготы']], 'hem');

  /* ---------- элементы бумажного бланка ---------- */
  const L = (n = 1) => `<div class="pl" style="--n:${n}"></div>`;
  const U = (w = 9) => `<span class="pu" style="width:${w}em"></span>`;

  const critText = it => {
    if (it.c) return it.c;
    if (it.k === 'multi') return 'По 1 б. за каждый правильный пример; всего – 2 б.';
    if (it.k !== 'open') return '1 б. за правильный ответ.';
    if (it.p === 2) return '1 б. – частично правильный ответ; 2 б. – правильный и полный ответ.';
    return '1 б. – правильное указание; 2 б. – указание и частичная аргументация (оценка); 3 б. – правильный, полный и аргументированный ответ.';
  };

  /* нумерация подпунктов: «б)», «в)» продолжают предыдущий пункт */
  function itemNumbers(items) {
    let k = 0;
    return items.map(it => /^[бвгд]\)/.test(it.q) ? '' : (++k) + ')');
  }

  /* ================= ТИПЫ ЗАДАНИЙ ================= */
  const T = {};

  /* ---- 1. Верно / неверно ---- */
  T.tf = {
    instr: 'Прочитайте приведённые ниже утверждения. Если считаете, что утверждение верное, отметьте букву <b>В</b>. Если считаете, что утверждение неверное, отметьте букву <b>Н</b> и напишите вместо подчёркнутых слов другие слова, делающие утверждение верным.',
    inter(t, p) {
      return `<p class="instr">${this.instr}</p>` + t.items.map((it, i) => `
        <div class="tf">
          <div class="tf-text"><b>${i + 1})</b> ${it.t}</div>
          <div class="tf-ctrl">
            <label class="seg"><input type="radio" name="${p}${i}" data-key="${p}${i}" value="В"><span>В</span></label>
            <label class="seg"><input type="radio" name="${p}${i}" data-key="${p}${i}" value="Н"><span>Н</span></label>
            ${inp(p + i + 'f', 'Исправление (если выбрали Н)', 'fix')}
          </div>
        </div>`).join('');
    },
    paper(t) {
      return `<p>${this.instr.replace(/<\/?b>/g, '')}</p>` + t.items.map((it, i) => `
        <div class="pp-tf"><div class="pp-tf-l">${U(7)}<br>${U(7)}</div><div class="pp-tf-vn">В&nbsp;&nbsp;&nbsp;Н</div><div class="pp-tf-t">${i + 1}) ${it.t}</div></div>`).join('');
    },
    key: t => t.items.map((it, i) => `${i + 1}) ${it.ok ? 'Верно (В).' : 'Неверно (Н). Правильный ответ: <b>' + esc(it.ans) + '</b>.'}`).join('<br>'),
    crit: () => 'По 2 б. за каждый правильный ответ; 1 б. – если правильно отмечена буква Н, но не написаны слова, делающие утверждение верным; всего – 6 б.',
    blocks: () => [6],
    score(t, p, A) {
      return t.items.map((it, i) => {
        const v = A[p + i] || '', f = A[p + i + 'f'] || '';
        let pts = 0;
        if (it.ok) pts = v === 'В' ? 2 : 0;
        else if (v === 'Н') pts = kwHit(f, it.fix, it.not) >= 0 ? 2 : 1;
        return {
          label: `Утверждение ${i + 1}`, max: 2, pts,
          ans: v ? (v + (v === 'Н' ? (f ? ' → ' + f : ' (исправление не написано)') : '')) : '',
          show: it.ok ? 'В (верно)' : 'Н → ' + it.ans
        };
      });
    }
  };

  /* ---- 2. Отрасли промышленности ---- */
  const IND_HEAD = ['Отрасли/подотрасли промышленности', 'Сырьё (по одному примеру)', 'Готовый продукт (по одному примеру)'];
  const IND_SHORT = ['отрасль', 'сырьё', 'продукт'];
  T.industry = {
    instr: 'Проанализируйте информацию в таблице и заполните свободные ячейки, указав в каждой из них по одному недостающему элементу: название отрасли/подотрасли промышленности, пример сырья или готовой продукции.',
    inter(t, p) {
      return `<p class="instr">${this.instr}</p><div class="tbl-wrap"><table class="grid"><thead><tr>${IND_HEAD.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
        t.rows.map((r, ri) => '<tr>' + r.map((c, ci) => c.g ? `<td class="given">${esc(c.g)}</td>` : `<td>${inp(p + ri + ci, 'Впишите…')}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>';
    },
    paper(t) {
      return `<p>${this.instr}</p><table class="pp-grid"><tr>${IND_HEAD.map(h => `<th>${h}</th>`).join('')}</tr>` +
        t.rows.map(r => '<tr>' + r.map(c => `<td>${c.g ? esc(c.g) : ''}</td>`).join('') + '</tr>').join('') + '</table>';
    },
    key: t => `<table class="pp-grid sm"><tr>${IND_HEAD.map(h => `<th>${h}</th>`).join('')}</tr>` +
      t.rows.map(r => '<tr>' + r.map(c => c.g ? `<td><i>${esc(c.g)}</i></td>` : `<td><b>${esc(c.s)}</b></td>`).join('') + '</tr>').join('') + '</table>',
    crit: () => 'По 1 б. за каждый правильный ответ; всего – 6 б. Если в одной ячейке записано более одного варианта ответа и хотя бы один из них неверный, баллы не начисляются.',
    blocks: () => [6],
    score(t, p, A) {
      const out = [];
      t.rows.forEach((r, ri) => r.forEach((c, ci) => {
        if (c.g) return;
        const v = A[p + ri + ci] || '';
        out.push({ label: `Строка ${ri + 1}: ${IND_SHORT[ci]}`, max: 1, pts: kwHit(v, c.a) >= 0 ? 1 : 0, ans: v, show: c.s });
      }));
      return out;
    }
  };

  /* ---- 3a. Группировка ---- */
  T.group = {
    inter(t, p) {
      return `<p class="instr">${esc(t.title)}</p><p class="hint">Для каждого объекта выберите группу, к которой он относится.</p>` +
        t.items.map((it, i) => `<div class="grp"><div class="grp-name">${esc(it)}</div><div class="grp-opts">` +
          t.groups.map((g, gi) => `<label class="seg wide"><input type="radio" name="${p}${i}" data-key="${p}${i}" value="${gi}"><span>${esc(g)}</span></label>`).join('') +
          '</div></div>').join('');
    },
    paper(t) {
      return `<p>${esc(t.title)}</p><p class="pp-list">${t.items.map(esc).join(', ')}</p><table class="pp-grid"><tr>${t.groups.map(g => `<th>${esc(g)}</th>`).join('')}</tr>` +
        `<tr>${t.groups.map(() => `<td class="tall"></td>`).join('')}</tr></table>`;
    },
    key: t => t.groups.map((g, gi) => `<b>${esc(g)}:</b> ${t.items.filter((_, i) => t.key[i] === gi).join(', ')}.`).join('<br>'),
    crit: () => 'По 1 б. за каждый правильно отнесённый объект; всего – 6 б.',
    blocks: () => [6],
    score(t, p, A) {
      return t.items.map((it, i) => {
        const v = A[p + i];
        return { label: it, max: 1, pts: v !== undefined && v !== '' && +v === t.key[i] ? 1 : 0, ans: v !== undefined && v !== '' ? t.groups[+v] : '', show: t.groups[t.key[i]] };
      });
    }
  };

  /* ---- 3b. Соответствие ---- */
  T.match = {
    sub: ' Напишите напротив каждой буквы столбика А две соответствующие ей цифры из столбика Б (каждая цифра используется только один раз).',
    digits: t => t.opts.map((_, j) => [String(j + 1), String(j + 1)]),
    inter(t, p) {
      return `<p class="instr">${esc(t.title)}${this.sub}</p><div class="match">
        <div class="match-l"><div class="mh">Столбик А</div>${t.left.map((l, i) => `<div class="ml"><b>${LET[i]})</b> ${esc(l)}<span class="ml-sel">${sel(p + i + 'a', this.digits(t), 'dig')}${sel(p + i + 'b', this.digits(t), 'dig')}</span></div>`).join('')}</div>
        <div class="match-r"><div class="mh">Столбик Б</div>${t.opts.map((o, j) => `<div class="mr"><b>${j + 1})</b> ${esc(o)}</div>`).join('')}</div></div>`;
    },
    paper(t) {
      return `<p>${esc(t.title)}${this.sub}</p><table class="pp-match"><tr><th>Столбик А</th><th>Столбик Б</th></tr><tr><td>` +
        t.left.map((l, i) => `<div class="pm-l">${U(5)} ${LET[i]}) ${esc(l)}</div>`).join('') + '</td><td>' +
        t.opts.map((o, j) => `<div>${j + 1}) ${esc(o)}</div>`).join('') + '</td></tr></table>';
    },
    right: (t, i) => t.key.map((k, j) => k === i ? j + 1 : 0).filter(Boolean),
    key(t) { return t.left.map((l, i) => `${LET[i]}) ${esc(l)} – <b>${this.right(t, i).join(', ')}</b>`).join('<br>'); },
    crit: () => 'По 1 б. за каждую правильно указанную цифру; всего – 6 б.',
    blocks: () => [6],
    score(t, p, A) {
      return t.left.map((l, i) => {
        const ch = [...new Set([A[p + i + 'a'], A[p + i + 'b']].filter(Boolean).map(Number))];
        const ok = this.right(t, i);
        return { label: `${LET[i]}) ${l}`, max: 2, pts: ch.filter(d => ok.includes(d)).length, ans: ch.join(', '), show: ok.join(', ') };
      });
    }
  };

  /* ---- 4. Координаты ---- */
  T.coords = {
    instr: t => `Определите географические координаты (только в градусах) ${esc(t.obj)}, применив градусную сетку ${esc(t.map)} (допустимое отклонение ±2°):`,
    inter(t, p) {
      return `<p class="instr">${this.instr(t)}</p>
        <div class="row"><span class="lbl">географическая широта:</span>${inp(p + 'la', '°', 'deg')}<span>°</span>${hemSel(p + 'lh', 'lat')}</div>
        <div class="row"><span class="lbl">географическая долгота:</span>${inp(p + 'lo', '°', 'deg')}<span>°</span>${hemSel(p + 'oh', 'lon')}</div>`;
    },
    paper(t) {
      return `<p>${this.instr(t)}</p><p>географическая широта: ${U(4)}° ${U(11)} широты</p><p>географическая долгота: ${U(4)}° ${U(11)} долготы</p>`;
    },
    key: t => `${esc(t.obj[0].toUpperCase() + t.obj.slice(1))}: <b>${t.lat[0]}° ${HEM_FULL[t.lat[1]]}; ${t.lon[0]}° ${HEM_FULL[t.lon[1]]}</b> (допустимое отклонение ±2°).`,
    crit: () => 'По 1 б. за правильное определение географической широты и долготы (±2°) – всего 2 б.; по 1 б. за правильное указание полушарий – всего 2 б.',
    blocks: () => [4],
    score(t, p, A) {
      const la = numLast(A[p + 'la']), lo = numLast(A[p + 'lo']);
      return [
        { label: 'Широта (градусы)', max: 1, pts: Math.abs(la - t.lat[0]) <= 2 ? 1 : 0, ans: A[p + 'la'] || '', show: t.lat[0] + '° (±2°)' },
        { label: 'Широта (полушарие)', max: 1, pts: A[p + 'lh'] === t.lat[1] ? 1 : 0, ans: HEM[A[p + 'lh']] || '', show: HEM[t.lat[1]] },
        { label: 'Долгота (градусы)', max: 1, pts: Math.abs(lo - t.lon[0]) <= 2 ? 1 : 0, ans: A[p + 'lo'] || '', show: t.lon[0] + '° (±2°)' },
        { label: 'Долгота (полушарие)', max: 1, pts: A[p + 'oh'] === t.lon[1] ? 1 : 0, ans: HEM[A[p + 'oh']] || '', show: HEM[t.lon[1]] }
      ];
    }
  };

  /* ---- 5. Протяжённость ---- */
  const EXT = t => t.axis === 'lat'
    ? { pt: ['крайней северной точки', 'крайней южной точки'], what: 'географическую широту', arc: 'дуги 1° меридиана', short: 'шир.' }
    : { pt: ['крайней западной точки', 'крайней восточной точки'], what: 'географическую долготу', arc: 'дуги 1° экватора', short: 'долг.' };
  const extDeg = (a, ha, b, hb) => ha === hb ? Math.abs(a - b) : a + b;
  T.extent = {
    instr: t => `Определите протяжённость ${esc(t.name)} ${esc(t.how)}, в градусах и километрах, применив градусную сеть ${esc(t.map)}. Следуйте приведённому ниже алгоритму и все расчёты выполните в тесте.`,
    inter(t, p) {
      const e = EXT(t);
      return `<p class="instr">${this.instr(t)}</p>
        <div class="step"><b>1)</b> Определите ${e.what} обеих точек (допустимое отклонение ±2°):
          <div class="row"><span class="lbl">${e.pt[0]}:</span>${inp(p + 'a', '°', 'deg')}<span>°</span>${hemSel(p + 'ah', t.axis)}</div>
          <div class="row"><span class="lbl">${e.pt[1]}:</span>${inp(p + 'b', '°', 'deg')}<span>°</span>${hemSel(p + 'bh', t.axis)}</div></div>
        <div class="step"><b>2)</b> Вычислите расстояние в градусах:${inp(p + 'd', 'например: 10° + 20° = 30°', 'calc')}</div>
        <div class="step"><b>3)</b> Укажите длину ${e.arc} в километрах:${inp(p + 'k', 'км', 'calc')}</div>
        <div class="step"><b>4)</b> Рассчитайте расстояние в километрах:${inp(p + 'km', 'например: 30° × 111 км = 3330 км', 'calc')}</div>`;
    },
    paper(t) {
      const e = EXT(t);
      return `<p>${this.instr(t)}</p>
        <p>1) Определите ${e.what} обеих точек (допустимое отклонение ±2°): ${U(3)}° ${U(9)} ${e.short}; ${U(3)}° ${U(9)} ${e.short}</p>
        <p>2) Вычислите расстояние в градусах: ${U(18)}</p>
        <p>3) Укажите длину ${e.arc} в километрах: ${U(12)}</p>
        <p>4) Рассчитайте расстояние в километрах: ${U(18)}</p>`;
    },
    calc(t) {
      const [a, b] = t.p, same = a[1] === b[1];
      const lo = t.deg - 4, hi = t.deg + 4, k = t.kd;
      return { same, lo, hi, k, km: t.deg * k, kmLo: lo * k, kmHi: hi * k, expr: same ? `${Math.max(a[0], b[0])}° – ${Math.min(a[0], b[0])}° = ${t.deg}°` : `${a[0]}° + ${b[0]}° = ${t.deg}°` };
    },
    key(t) {
      const c = this.calc(t), e = EXT(t), [a, b] = t.p;
      return `1) ${e.what[0].toUpperCase() + e.what.slice(1)} точек: <b>${a[0]}° ${HEM[a[1]]}; ${b[0]}° ${HEM[b[1]]}</b> (±2°).<br>
        2) Протяжённость в градусах: <b>${c.expr}</b>. Допускаются значения от ${c.lo}° до ${c.hi}° с учётом допустимого отклонения.<br>
        3) 1° ${t.axis === 'lat' ? 'меридиана' : 'экватора'} ≈ <b>${fmt(c.k)} км</b>.<br>
        4) Протяжённость в километрах: <b>${t.deg}° × ${fmt(c.k)} км ≈ ${fmt(Math.round(c.km))} км</b>. Допускаются значения от ${fmt(Math.round(c.kmLo))} до ${fmt(Math.round(c.kmHi))} км.`;
    },
    crit: () => '1) По 1 б. за правильное определение координаты и полушария каждой точки; всего – 4 б. 2) 1 б. за правильное вычисление с учётом полушарий и 1 б. за правильный результат; всего – 2 б. 3) 1 б. за правильное указание величины. 4) 1 б. за правильный расчёт протяжённости в километрах.',
    blocks: () => [4, 2, 1, 1],
    score(t, p, A) {
      const c = this.calc(t), e = EXT(t);
      const a = numLast(A[p + 'a']), b = numLast(A[p + 'b']), ha = A[p + 'ah'], hb = A[p + 'bh'];
      const d = numLast(A[p + 'd']), k = numLast(A[p + 'k']), km = numLast(A[p + 'km']);
      let dp = 0;
      if (d >= c.lo && d <= c.hi) dp = 2;
      else if (isFinite(a) && isFinite(b) && ha && hb && Math.abs(d - extDeg(a, ha, b, hb)) <= 0.5) dp = 1;
      const kOk = k >= 110 && k <= 112;
      const kmOk = (isFinite(d) && isFinite(k) && d > 0 && k > 0 && Math.abs(km - d * k) <= Math.max(d * k * 0.01, 2)) || (km >= c.kmLo && km <= c.kmHi);
      return [
        { label: e.pt[0][0].toUpperCase() + e.pt[0].slice(1) + ' (градусы)', max: 1, pts: Math.abs(a - t.p[0][0]) <= 2 ? 1 : 0, ans: A[p + 'a'] || '', show: t.p[0][0] + '° (±2°)' },
        { label: e.pt[0][0].toUpperCase() + e.pt[0].slice(1) + ' (полушарие)', max: 1, pts: ha === t.p[0][1] ? 1 : 0, ans: HEM[ha] || '', show: HEM[t.p[0][1]] },
        { label: e.pt[1][0].toUpperCase() + e.pt[1].slice(1) + ' (градусы)', max: 1, pts: Math.abs(b - t.p[1][0]) <= 2 ? 1 : 0, ans: A[p + 'b'] || '', show: t.p[1][0] + '° (±2°)' },
        { label: e.pt[1][0].toUpperCase() + e.pt[1].slice(1) + ' (полушарие)', max: 1, pts: hb === t.p[1][1] ? 1 : 0, ans: HEM[hb] || '', show: HEM[t.p[1][1]] },
        { label: 'Расстояние в градусах', max: 2, pts: dp, ans: A[p + 'd'] || '', show: `${c.expr} (${c.lo}°–${c.hi}°)` },
        { label: 'Длина дуги 1°', max: 1, pts: kOk ? 1 : 0, ans: A[p + 'k'] || '', show: `≈ ${fmt(c.k)} км` },
        { label: 'Расстояние в километрах', max: 1, pts: kmOk ? 1 : 0, ans: A[p + 'km'] || '', show: `${t.deg}° × ${fmt(c.k)} ≈ ${Math.round(c.km)} км` }
      ];
    }
  };

  /* ---- 6. Температура и высота ---- */
  const GR = [0.6, 0.64, 0.65];
  function gradOf(s) {
    const a = nums(s).filter(x => ![100, 1000, 1].includes(Math.abs(x)));
    if (!a.length) return NaN;
    let g = Math.abs(a[0]);
    if (g >= 3) g /= 10;           // 6 °C на 1 км → 0,6 °C на 100 м
    return g;
  }
  const near = (x, y, tol) => isFinite(x) && Math.abs(x - y) <= tol;
  T.alt = {
    instr(t) {
      if (t.mode === 'foot') return `Определите температуру атмосферного воздуха у подножия горы, на высоте ${t.foot} м, если на её вершине, на высоте ${t.top} м, в данный момент температура воздуха равна ${fmtT(t.tTop)} °С. Следуйте алгоритму и выполните все вычисления в тесте.`;
      if (t.mode === 'top') return `Определите температуру атмосферного воздуха на вершине горы высотой ${t.top} м, если у её подножия, на высоте ${t.foot} м, в данный момент температура воздуха равна ${fmtT(t.tFoot)} °С. Следуйте алгоритму и выполните все вычисления в тесте.`;
      return `Определите абсолютную высоту вершины горы, если у её подножия, на высоте ${t.foot} м, температура воздуха равна ${fmtT(t.tFoot)} °С, а на вершине в тот же момент – ${fmtT(t.tTop)} °С. Следуйте алгоритму и выполните все вычисления в тесте.`;
    },
    steps(t) {
      if (t.mode === 'height') return ['Рассчитайте разницу температур между подножием и вершиной:', 'Укажите вертикальный термический градиент:',
        'Рассчитайте относительную высоту горы (разницу высот), применив вертикальный термический градиент:', 'Определите абсолютную высоту вершины горы:'];
      return ['Рассчитайте разницу в высоте:', 'Укажите вертикальный термический градиент:', 'Рассчитайте разницу температур, применив вертикальный термический градиент:',
        t.mode === 'foot' ? `Рассчитайте температуру воздуха у подножия, на высоте ${t.foot} м:` : `Рассчитайте температуру воздуха на вершине, на высоте ${t.top} м:`];
    },
    inter(t, p) {
      const ph = ['', 'например: 0,6 °С на 100 м', '', ''];
      return `<p class="instr">${this.instr(t)}</p>` + this.steps(t).map((s, i) => `<div class="step"><b>${i + 1})</b> ${s}${inp(p + (i + 1), ph[i] || 'Расчёт и ответ', 'calc')}</div>`).join('');
    },
    paper(t) { return `<p>${this.instr(t)}</p>` + this.steps(t).map((s, i) => `<p>${i + 1}) ${s} ${U(14)}</p>`).join(''); },
    calc(t) {
      if (t.mode === 'height') {
        const dT = t.tFoot - t.tTop, h6 = dT / 0.6 * 100, h64 = dT / 0.64 * 100;
        return { dT, h6, h64, a6: t.foot + h6, a64: t.foot + h64 };
      }
      const D = t.top - t.foot, d6 = D * 0.006, d64 = D * 0.0064;
      const r = x => t.mode === 'foot' ? t.tTop + x : t.tFoot - x;
      return { D, d6, d64, r6: r(d6), r64: r(d64) };
    },
    key(t) {
      const c = this.calc(t);
      if (t.mode === 'height') return `1) Разница температур: <b>${fmtT(t.tFoot)} °С – (${fmtT(t.tTop)} °С) = ${fmt(c.dT)} °С</b>.<br>
        2) Вертикальный термический градиент: <b>0,6 °С на 100 м</b> (6 °С на 1 км; допускается 0,64 °С / 6,4 °С).<br>
        3) Относительная высота: <b>${fmt(c.dT)} °С : 0,6 °С × 100 м = ${fmt(Math.round(c.h6))} м</b>. Допускается: ${fmt(c.dT)} : 0,64 × 100 ≈ ${fmt(Math.round(c.h64))} м.<br>
        4) Абсолютная высота вершины: <b>${t.foot} м + ${fmt(Math.round(c.h6))} м = ${fmt(Math.round(c.a6))} м</b>. Допускается ≈ ${fmt(Math.round(c.a64))} м.`;
      const sign = t.mode === 'foot' ? `${fmtT(t.tTop)} °С + ${fmt(c.d6)} °С` : `${fmtT(t.tFoot)} °С – ${fmt(c.d6)} °С`;
      const sign64 = t.mode === 'foot' ? `${fmtT(t.tTop)} + ${fmt(c.d64)}` : `${fmtT(t.tFoot)} – ${fmt(c.d64)}`;
      return `1) Разница высот: <b>${t.top} м – ${t.foot} м = ${c.D} м</b> (${fmt(c.D / 1000)} км).<br>
        2) Вертикальный термический градиент: <b>0,6 °С на 100 м</b> (6 °С на 1 км; допускается 0,64 °С / 6,4 °С).<br>
        3) Разница температур: <b>${c.D} м × 0,6 °С : 100 м = ${fmt(c.d6)} °С</b>. Допускается: ${c.D} × 0,64 : 100 = ${fmt(c.d64)} °С.<br>
        4) Температура ${t.mode === 'foot' ? 'у подножия' : 'на вершине'}: <b>${sign} = ${fmtT(c.r6)} °С</b>. Допускается: ${sign64} = ${fmtT(c.r64)} °С.`;
    },
    crit: () => 'По 1 б. за каждый правильный ответ; всего – 4 б. Если ошибка допущена в предыдущем шаге, а последующие действия выполнены верно на основе полученного результата, баллы за них начисляются.',
    blocks: () => [4],
    score(t, p, A) {
      const c = this.calc(t), s = this.steps(t);
      const v1 = numLast(A[p + 1]), g = gradOf(A[p + 2]), v3 = numLast(A[p + 3]), v4 = numLast(A[p + 4]);
      const gOk = GR.some(x => Math.abs(g - x) < 0.001), gUse = g >= 0.5 && g <= 0.7 ? g : NaN;
      let ok1, ok3, ok4, sh;
      if (t.mode === 'height') {
        ok1 = near(v1, c.dT, 0.1);
        ok3 = near(v3, c.h6, 3) || near(v3, c.h64, 3) || (isFinite(gUse) && near(v3, v1 / gUse * 100, 3));
        ok4 = near(v4, c.a6, 3) || near(v4, c.a64, 3) || near(v4, t.foot + v3, 3);
        sh = [fmt(c.dT) + ' °С', '0,6 °С на 100 м', `${Math.round(c.h6)} м`, `${Math.round(c.a6)} м`];
      } else {
        const v1m = isFinite(v1) && Math.abs(v1) < 20 ? v1 * 1000 : v1;
        ok1 = near(v1m, c.D, 1);
        ok3 = near(v3, c.d6, 0.11) || near(v3, c.d64, 0.11) || (isFinite(gUse) && near(v3, v1m * gUse / 100, 0.11));
        const base = t.mode === 'foot' ? t.tTop + Math.abs(v3) : t.tFoot - Math.abs(v3);
        ok4 = near(v4, c.r6, 0.11) || near(v4, c.r64, 0.11) || (isFinite(v3) && near(v4, base, 0.11));
        sh = [c.D + ' м', '0,6 °С на 100 м', fmt(c.d6) + ' °С', fmtT(c.r6) + ' °С'];
      }
      return [ok1, gOk, ok3, ok4].map((ok, i) => ({ label: `Шаг ${i + 1}`, max: 1, pts: ok ? 1 : 0, ans: A[p + (i + 1)] || '', show: sh[i], q: s[i] }));
    }
  };

  /* ---- общие подпункты (7, 8) ---- */
  function itemsInter(items, p) {
    const no = itemNumbers(items);
    return items.map((it, i) => {
      let f;
      if (it.k === 'open') f = ta(p + i, it.p >= 3 ? 5 : 4);
      else if (it.k === 'multi') f = `<div class="two">${inp(p + i + 'a', 'Пример 1')}${inp(p + i + 'b', 'Пример 2')}</div>`;
      else if (it.k === 'num') f = inp(p + i, 'Расчёт и ответ, например: 10,0 – 6,7 = 3,3 ‰', 'calc');
      else f = inp(p + i, 'Ответ');
      return `<div class="it${no[i] ? '' : ' sub'}"><div class="q">${no[i] ? `<b>${no[i]}</b> ` : ''}${esc(it.q)} <span class="pmax">${it.p} б.</span></div>${f}</div>`;
    }).join('');
  }
  function itemsPaper(items) {
    const no = itemNumbers(items);
    return items.map((it, i) => {
      let f;
      if (it.k === 'open') f = L(it.p >= 3 ? 6 : 4);
      else if (it.k === 'multi') f = `<div>${U(15)}; ${U(15)}</div>`;
      else f = L(1);
      return `<div class="pp-it${no[i] ? '' : ' sub'}">${no[i] ? no[i] + ' ' : ''}${esc(it.q)}${f}</div>`;
    }).join('');
  }
  function itemsKey(items) {
    const no = itemNumbers(items);
    return items.map((it, i) => `${no[i] ? no[i] + ' ' : '&nbsp;&nbsp;&nbsp;'}${it.k === 'open' ? esc(it.s) : '<b>' + esc(it.s) + '</b>'}`).join('<br>') +
      (items.some(i => i.k === 'open') ? '<br><i>Примечание: к развёрнутым ответам допускаются и другие правильные ответы.</i>' : '');
  }
  function itemsCrit(items) {
    const no = itemNumbers(items);
    return items.map((it, i) => `${no[i] || '&nbsp;&nbsp;&nbsp;'} ${critText(it)}`).join('<br>');
  }
  function itemsScore(items, p, A, self) {
    const no = itemNumbers(items);
    let last = '';
    return items.map((it, i) => {
      if (no[i]) last = no[i];
      const lab = (no[i] || last + ' ' + it.q.slice(0, 2));
      if (it.k === 'multi') {
        const hits = [A[p + i + 'a'], A[p + i + 'b']].map(v => kwHit(v, it.a)).filter(h => h >= 0);
        return { label: 'Пункт ' + lab, q: it.q, max: 2, pts: Math.min(2, new Set(hits).size), ans: [A[p + i + 'a'], A[p + i + 'b']].filter(Boolean).join('; '), show: it.s };
      }
      if (it.k === 'num') return { label: 'Пункт ' + lab, q: it.q, max: 1, pts: near(numLast(A[p + i]), it.n, it.tol) ? 1 : 0, ans: A[p + i] || '', show: it.s };
      if (it.k === 'kw') return { label: 'Пункт ' + lab, q: it.q, max: it.p, pts: kwHit(A[p + i], it.a, it.not) >= 0 ? it.p : 0, ans: A[p + i] || '', show: it.s };
      const sv = self && self[p + i] !== undefined && self[p + i] !== '' ? Math.min(+self[p + i], it.p) : null;
      return { label: 'Пункт ' + lab, q: it.q, max: it.p, pts: sv ?? 0, rated: sv !== null, open: true, key: p + i, ans: A[p + i] || '', show: it.s, crit: critText(it) };
    });
  }

  /* ---- 7. Демография ---- */
  T.demo = {
    instr: t => `В таблице представлены некоторые статистические данные о демографической ситуации ${esc(t.country)}. Проанализируйте данные таблицы и выполните приведённые ниже задания.`,
    table: (t, cls) => `<div class="tbl-cap">Некоторые демографические показатели населения ${esc(t.country)}</div><table class="${cls}"><tr><th>Демографические показатели</th>${t.years.map(y => `<th>${y}</th>`).join('')}</tr>` +
      t.rows.map(r => `<tr><td>${esc(r[0])}</td>${r.slice(1).map(x => `<td class="c">${esc(x)}</td>`).join('')}</tr>`).join('') + '</table>' +
      `<div class="tbl-note">${t.note ? esc(t.note) + ' ' : ''}Данные округлены и приведены для учебных целей.</div>`,
    inter(t, p) { return `<p class="instr">${this.instr(t)}</p><div class="tbl-wrap">${this.table(t, 'grid demo')}</div>` + itemsInter(t.items, p); },
    paper(t) { return `<p>${this.instr(t)}</p>${this.table(t, 'pp-grid demo')}` + itemsPaper(t.items); },
    key: t => itemsKey(t.items), crit: t => itemsCrit(t.items),
    blocks: t => t.items.map(i => i.p),
    score: (t, p, A, self) => itemsScore(t.items, p, A, self)
  };

  /* ---- 8. Утверждение ---- */
  T.statement = {
    inter(t, p) { return `<blockquote class="quote">«${esc(t.quote)}»</blockquote><p class="instr">Исходя из этого утверждения, выполните задания:</p>` + itemsInter(t.items, p); },
    paper(t) { return `<p>«${esc(t.quote)}»</p><p>Исходя из этого утверждения, выполните задания:</p>` + itemsPaper(t.items); },
    key: t => itemsKey(t.items), crit: t => itemsCrit(t.items),
    blocks: t => t.items.map(i => i.p),
    score: (t, p, A, self) => itemsScore(t.items, p, A, self)
  };

  /* ================= ОБЩИЕ ФУНКЦИИ ================= */
  const pre = n => `t${n}_`;

  function score(v, A, self) {
    A = A || {};
    const tasks = v.tasks.map((t, i) => {
      const parts = T[t.type].score(t, pre(i + 1), A, self || {});
      return { n: i + 1, type: t.type, parts, max: parts.reduce((s, x) => s + x.max, 0), pts: parts.reduce((s, x) => s + x.pts, 0) };
    });
    const all = tasks.flatMap(t => t.parts);
    const auto = all.filter(x => !x.open), open = all.filter(x => x.open);
    const total = tasks.reduce((s, t) => s + t.pts, 0), max = tasks.reduce((s, t) => s + t.max, 0);
    return {
      tasks, total, max, grade: grade(total),
      autoPts: auto.reduce((s, x) => s + x.pts, 0), autoMax: auto.reduce((s, x) => s + x.max, 0),
      openPts: open.reduce((s, x) => s + x.pts, 0), openMax: open.reduce((s, x) => s + x.max, 0),
      openRated: open.every(x => x.rated)
    };
  }

  /* блок «L 0 1 2 …» в колонке баллов */
  const ptsCol = blocks => blocks.map(n => `<div class="pb"><span>L</span>${Array.from({ length: n + 1 }, (_, i) => `<span>${i}</span>`).join('')}</div>`).join('');

  function renderInteractive(v) {
    return v.tasks.map((t, i) => {
      const n = i + 1, tp = T[t.type], mx = tp.blocks(t).reduce((a, b) => a + b, 0);
      return (SECTIONS[n] ? `<div class="sec" id="sec${n}">${SECTIONS[n]}</div>` : '') +
        `<section class="task" id="task${n}" data-n="${n}"><header class="task-h"><span class="task-n">${n}</span><span class="task-t">${TITLES[t.type]}</span><span class="task-p">${mx} б.</span></header><div class="task-b">${tp.inter(t, pre(n))}</div></section>`;
    }).join('');
  }

  function paperHead(cfg, title) {
    return `<div class="pp-head"><div class="pp-t1">${title}</div><div class="pp-t2">Подготовка к зимней сессии по географии · 11 класс (реальный и гуманитарный профиль)</div><div class="pp-t3">${esc(cfg.school)} · ${esc(cfg.year)} учебный год</div></div>`;
  }

  function renderPaper(v, cfg) {
    let rows = '';
    v.tasks.forEach((t, i) => {
      const n = i + 1, tp = T[t.type];
      if (SECTIONS[n]) rows += `<tr class="pp-sec"><td></td><td colspan="2">${SECTIONS[n]}</td></tr>`;
      rows += `<tr><td class="pp-n">${n}.</td><td class="pp-c">${tp.paper(t)}</td><td class="pp-p">${ptsCol(tp.blocks(t))}</td></tr>`;
    });
    return `<div class="paper">${paperHead(cfg, 'ТРЕНИРОВОЧНОЕ ТЕСТИРОВАНИЕ')}
      <table class="pp-meta"><tr><td>Ф.И. ученика ${U(16)}</td><td>Всего баллов: <b>49</b></td></tr>
      <tr><td>Класс ${U(6)}&nbsp;&nbsp; Дата «${U(2)}» ${U(7)} 20${U(2)} г.</td><td>Набрано баллов ${U(4)}&nbsp; Отметка ${U(3)}</td></tr></table>
      <div class="pp-var">Вариант № ${v.id}</div>
      <div class="pp-mat">Время выполнения: ${cfg.durationMin} минут. Необходимые материалы: ручка, школьные географические атласы.</div>
      <table class="pp-tbl"><thead><tr><th>№</th><th>ЗАДАНИЯ</th><th>БАЛЛЫ</th></tr></thead><tbody>${rows}
      <tr class="pp-tot"><td></td><td>Итого:</td><td>49 б.</td></tr></tbody></table>
      <div class="pp-sign"><div>Учитель ${U(12)} ${esc(cfg.teacher)}</div><div>Ассистент ${U(12)} ( ${U(10)} )</div></div></div>`;
  }

  function renderKey(v, cfg) {
    const rows = v.tasks.map((t, i) => {
      const tp = T[t.type], mx = tp.blocks(t).reduce((a, b) => a + b, 0);
      return `<tr><td class="pp-n">${i + 1}.</td><td>${tp.key(t)}</td><td class="crit">${tp.crit(t)}</td><td class="c"><b>${mx}</b></td></tr>`;
    }).join('');
    return `<div class="paper">${paperHead(cfg, 'СХЕМА ОЦЕНИВАНИЯ (БАРЕМ)')}<div class="pp-var">Вариант № ${v.id}</div>
      <table class="pp-tbl key"><thead><tr><th>№</th><th>Ожидаемый ответ</th><th>Критерии оценивания</th><th>Баллы</th></tr></thead><tbody>${rows}
      <tr class="pp-tot"><td></td><td colspan="2">ИТОГО</td><td class="c">49 б.</td></tr></tbody></table>
      <div class="pp-sign"><div>Преподаватель: ${esc(cfg.teacher)}</div></div></div>`;
  }

  function renderScale(cfg) {
    return `<div class="paper">${paperHead(cfg, 'ШКАЛА ПЕРЕВОДА БАЛЛОВ В ОТМЕТКУ')}
      <table class="pp-tbl scale"><thead><tr><th>Отметка</th><th>Количество баллов согласно тесту</th><th>Процент выполнения</th></tr></thead><tbody>` +
      SCALE.map(([a, b, g], i) => `<tr><td class="c"><b>«${g}»</b></td><td class="c">${a}–${b}</td><td class="c">${SCALE_PCT[i]}</td></tr>`).join('') +
      `</tbody></table><div class="pp-sign"><div>Преподаватель: ${esc(cfg.teacher)}</div></div></div>`;
  }

  /* заполненный бланк ученика (для PDF) */
  function renderStudentBlank(v, S, res, cfg) {
    const dt = ms => ms ? new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const dur = S.finishedAt && S.start ? Math.round((S.finishedAt - S.start) / 60000) : '—';
    const rows = res.tasks.map((t, i) => {
      const parts = t.parts.map(x => `<tr class="bp"><td>${esc(x.label)}${x.q && x.open ? `<div class="bq">${esc(x.q)}</div>` : ''}</td><td class="ba">${x.ans ? esc(x.ans).replace(/\n/g, '<br>') : '<span class="empty">нет ответа</span>'}</td><td class="c">${x.open ? (x.rated ? x.pts : '?') + '/' + x.max + '<div class="tag">учитель</div>' : x.pts + '/' + x.max}</td></tr>`).join('');
      return `<tr class="bt avoid"><td colspan="3"><b>Задание ${t.n}.</b> ${TITLES[t.type]} <span class="bt-p">${t.pts} из ${t.max} б.</span></td></tr>${parts}`;
    }).join('');
    const viol = (S.viol || []).length
      ? (S.viol || []).map((x, i) => `${i + 1}) ${new Date(x.t).toLocaleTimeString('ru-RU')} – ${esc(x.r)}`).join('<br>')
      : 'Нарушений не зафиксировано.';
    return `<div class="paper blank">${paperHead(cfg, 'БЛАНК ОТВЕТОВ · ТРЕНИРОВОЧНОЕ ТЕСТИРОВАНИЕ')}
      <table class="pp-meta b"><tr><td>Ученик: <b>${esc(S.name)}</b></td><td>Класс: <b>${esc(S.cls)}</b></td><td>Вариант № <b>${v.id}</b></td></tr>
      <tr><td>Начало: ${dt(S.start)}</td><td>Окончание: ${dt(S.finishedAt)}</td><td>Затрачено: ${dur} мин${S.auto ? ' (время истекло)' : ''}</td></tr></table>
      <table class="b-tbl"><thead><tr><th style="width:30%">Пункт</th><th>Ответ ученика</th><th style="width:13%">Баллы</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="pp-meta b sum avoid"><tr><td>Автоматическая проверка: <b>${res.autoPts} из ${res.autoMax}</b></td><td>Развёрнутые ответы (оценка учителя / самооценка): <b>${res.openRated ? res.openPts : '—'} из ${res.openMax}</b></td></tr>
      <tr><td>Предварительный результат: <b>${res.total} из ${res.max}</b></td><td>Предварительная отметка: <b>«${res.grade}»</b></td></tr></table>
      <div class="b-viol avoid"><b>Протокол «закрытого экрана»:</b><br>${viol}</div>
      <div class="pp-sign avoid"><div>Проверено учителем: ${U(5)} баллов, отметка ${U(4)}</div><div>Подпись учителя ${U(10)} ${esc(cfg.teacher)}</div></div></div>`;
  }

  /* правильные ответы на всё (для самопроверки) */
  function renderReview(v, res) {
    return res.tasks.map(t => `<section class="task rv"><header class="task-h"><span class="task-n">${t.n}</span><span class="task-t">${TITLES[t.type]}</span><span class="task-p ${t.pts === t.max ? 'ok' : ''}">${t.pts} / ${t.max}</span></header><div class="task-b">` +
      t.parts.map(x => x.open
        ? `<div class="rv-open"><div class="rv-q">${esc(x.label)}. ${esc(x.q)}</div><div class="rv-a"><span>Ваш ответ:</span> ${x.ans ? esc(x.ans).replace(/\n/g, '<br>') : '<i>нет ответа</i>'}</div>
            <div class="rv-s"><span>Образец ответа:</span> ${esc(x.show)}</div><div class="rv-c"><span>Критерии:</span> ${esc(x.crit)}</div>
            <div class="rv-self"><span>Оцените свой ответ по критериям:</span> ${Array.from({ length: x.max + 1 }, (_, k) => `<label class="seg"><input type="radio" name="self_${x.key}" data-self="${x.key}" value="${k}" ${x.rated && x.pts === k ? 'checked' : ''}><span>${k}</span></label>`).join('')} <small>из ${x.max}</small></div></div>`
        : `<div class="rv-row ${x.pts === x.max ? 'ok' : x.pts > 0 ? 'half' : 'bad'}"><div class="rv-l">${esc(x.label)}</div><div class="rv-y">${x.ans ? esc(x.ans) : '<i>нет ответа</i>'}</div><div class="rv-k">${esc(x.show)}</div><div class="rv-p">${x.pts}/${x.max}</div></div>`
      ).join('') + '</div></section>').join('');
  }

  const api = { esc, norm, nums, numLast, kwHit, fmt, grade, SCALE, TITLES, T, score, renderInteractive, renderPaper, renderKey, renderScale, renderStudentBlank, renderReview };
  if (typeof module !== 'undefined') module.exports = api; else root.GEO = api;
})(typeof window !== 'undefined' ? window : globalThis);
