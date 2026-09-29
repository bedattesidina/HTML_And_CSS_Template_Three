/* ==========================================================================
   charts.js — رسوم التقارير

   قرارات التصميم (مأخوذة من إجراء التحقق لا من الذوق):
   • أعمدة الفئات مقارنة مقدار، والطول وحده يحمل المعنى — فلون واحد لكل
     الأعمدة، بلا سلّم ألوان وبلا مفتاح (سلسلة واحدة لا تحتاج مفتاحًا).
   • المخطط الشهري سلسلتان (دخل/مصروف) بلونين من ترتيب اللوحة الثابت:
     أزرق ثم برتقالي. اجتاز هذا الزوج كل الفحوص على سطحَي التطبيق
     (فاتح ‎#ffffff‎ وداكن ‎#1c1c1e‎): فصل عمى الألوان ΔE ‎24.7‎ فاتح و‎26.8‎ داكن،
     والتباين فوق ‎3:1‎ في الوضعين. لم نستخدم الأخضر/الأحمر لأن فصلهما
     يهبط إلى ΔE ‎6.9‎ عند عمى اللون الأحمر-الأخضر.
   • محور قيمة واحد دائمًا، ولا مخطط بمحورين.
   • لكل رسم جدول بديل حتى لا يكون اللون هو الناقل الوحيد للمعنى.
   ========================================================================== */
'use strict';

var Charts = (function () {

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var tip = null;
  var seq = 0;

  function el(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function h(tag, attrs, parent) {
    var node = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ----- التلميحة العائمة المشتركة ----- */

  function ensureTip() {
    if (tip && tip.isConnected) return tip;
    tip = document.createElement('div');
    tip.className = 'viz-tip';
    document.body.appendChild(tip);
    return tip;
  }

  function showTip(html, clientX, clientY) {
    var t = ensureTip();
    t.innerHTML = html;
    t.classList.add('is-open');
    var r = t.getBoundingClientRect();
    var x = clientX - r.width / 2;
    var y = clientY - r.height - 12;
    x = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    if (y < 8) y = clientY + 16;
    t.style.left = x + 'px';
    t.style.top = (y + window.scrollY) + 'px';
  }

  function hideTip() {
    if (tip) tip.classList.remove('is-open');
  }

  /** يربط التلميحة بعنصر: تعمل بالمؤشر واللمس ولوحة المفاتيح. */
  function bindTip(node, buildHtml, onEnter, onLeave) {
    function enter(ev) {
      var p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
      showTip(buildHtml(), p.clientX, p.clientY);
      if (onEnter) onEnter();
    }
    function leave() { hideTip(); if (onLeave) onLeave(); }
    node.addEventListener('mouseenter', enter);
    node.addEventListener('mousemove', enter);
    node.addEventListener('mouseleave', leave);
    node.addEventListener('touchstart', function (ev) { enter(ev); }, { passive: true });
    node.addEventListener('touchend', leave);
    node.addEventListener('focus', function () {
      var r = node.getBoundingClientRect();
      showTip(buildHtml(), r.left + r.width / 2, r.top);
      if (onEnter) onEnter();
    });
    node.addEventListener('blur', leave);
  }

  /* ----- زر الجدول البديل ----- */

  function addTableView(wrap, headers, rows, opts) {
    var id = 'vizt' + (++seq);
    var btn = h('button', {
      type: 'button', class: 'viz-table-toggle',
      'aria-expanded': 'false', 'aria-controls': id, text: 'عرض الأرقام في جدول'
    }, wrap);

    var table = h('table', { class: 'viz-table', id: id, hidden: 'hidden' }, wrap);
    var thead = h('thead', null, table);
    var tr = h('tr', null, thead);
    headers.forEach(function (head, i) {
      h('th', { text: head, scope: 'col', style: i ? 'text-align:end' : '' }, tr);
    });
    var tbody = h('tbody', null, table);
    rows.forEach(function (r) {
      var row = h('tr', null, tbody);
      r.forEach(function (cell, i) {
        if (i === 0) h('th', { text: cell, scope: 'row', style: 'font-weight:600' }, row);
        else h('td', { text: cell, class: 'num' }, row);
      });
    });
    if (opts && opts.foot) {
      var tf = h('tfoot', null, table);
      var ftr = h('tr', null, tf);
      opts.foot.forEach(function (cell, i) {
        if (i === 0) h('th', { text: cell, scope: 'row' }, ftr);
        else h('td', { text: cell, class: 'num' }, ftr);
      });
    }

    btn.addEventListener('click', function () {
      var open = table.hasAttribute('hidden');
      if (open) table.removeAttribute('hidden'); else table.setAttribute('hidden', 'hidden');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'إخفاء الجدول' : 'عرض الأرقام في جدول';
    });
    return table;
  }

  /* ======================================================================
     ١. قائمة أعمدة أفقية للفئات
     مقارنة مقدار: لون واحد، ترتيب تنازلي، قيمة مكتوبة على كل صف.
     rows: [{ label, value, icon, count }]
     ====================================================================== */

  function barList(container, rows, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (!rows.length) {
      h('p', { class: 'empty', html: '<span class="ico">📊</span><span class="t">لا توجد بيانات لهذا الشهر</span>' }, container);
      return;
    }

    var maxN = opts.max || 8;
    var shown = rows.slice(0, maxN);
    var rest = rows.slice(maxN);
    if (rest.length) {
      shown.push({
        label: 'فئات أخرى (' + Fmt.digits(rest.length) + ')',
        icon: '➕',
        value: rest.reduce(function (s, r) { return s + r.value; }, 0),
        count: rest.reduce(function (s, r) { return s + (r.count || 0); }, 0),
        isRest: true
      });
    }

    var total = rows.reduce(function (s, r) { return s + r.value; }, 0);
    var max = shown.reduce(function (m, r) { return Math.max(m, r.value); }, 0) || 1;
    var color = opts.color || cssVar('--accent', '#2a78d6');

    var list = h('ul', { class: 'barlist', role: 'list' }, container);
    shown.forEach(function (r) {
      var li = h('li', { class: 'barlist-row', tabindex: '0' }, list);
      var head = h('div', { class: 'barlist-head' }, li);
      h('span', { class: 'barlist-name', text: (r.icon ? r.icon + ' ' : '') + r.label }, head);
      h('span', { class: 'barlist-val', text: Fmt.num(r.value) }, head);
      var track = h('div', { class: 'barlist-track' }, li);
      var fill = h('span', { class: 'barlist-fill' }, track);
      fill.style.width = Math.max(2, (r.value / max) * 100) + '%';
      fill.style.background = r.isRest ? cssVar('--baseline', '#c3c2b7') : color;

      bindTip(li, function () {
        var share = total ? Math.round((r.value / total) * 100) : 0;
        return '<span class="swatch" style="background:' + (r.isRest ? cssVar('--baseline') : color) + '"></span>' +
               esc(r.label) + '<br><span class="tv">' + esc(Fmt.money(r.value)) + ' · ' +
               Fmt.digits(share) + '٪' + (r.count ? ' · ' + Fmt.plural(r.count, 'حركة واحدة', 'حركتان', 'حركات', 'حركة') : '') + '</span>';
      });
    });

    addTableView(
      container,
      [opts.nameHeader || 'الفئة', 'المبلغ', 'النسبة'],
      rows.map(function (r) {
        return [r.label, Fmt.num(r.value), Fmt.digits(total ? Math.round((r.value / total) * 100) : 0) + '٪'];
      }),
      { foot: ['المجموع', Fmt.num(total), '١٠٠٪'.replace('١٠٠', Fmt.digits(100))] }
    );
  }

  /* ======================================================================
     ٢. أعمدة شهرية: دخل ومصروف — سلسلتان، محور قيمة واحد
     data: [{ month, income, expense }]  (من الأقدم إلى الأحدث)
     العرض بترتيب عربي: الأقدم يمينًا والأحدث يسارًا.
     ====================================================================== */

  function columns(container, data, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (!data.length) return;

    var W = 340, H = 196;
    var padTop = 14, padBottom = 30, padStart = 40, padEnd = 6;   // padStart = جهة اليمين (محور القيمة)
    var plotW = W - padStart - padEnd;
    var plotH = H - padTop - padBottom;
    var x1 = W - padStart;          // الحد الأيمن للرسم (بداية القراءة بالعربية)
    var x0 = padEnd;                // الحد الأيسر

    var cIncome = cssVar('--series-1', '#2a78d6');
    var cExpense = cssVar('--series-2', '#eb6834');
    var surface = cssVar('--surface-1', '#ffffff');

    var maxVal = 0;
    data.forEach(function (d) { maxVal = Math.max(maxVal, d.income, d.expense); });
    var scaleMax = niceMax(maxVal);
    // وحدة واحدة للمحور كله بدل لاصقة «أ» على كل وسم
    var unit = scaleMax >= 1000000 ? 1000000 : scaleMax >= 1000 ? 1000 : 1;
    var unitLabel = unit === 1000000 ? 'الأرقام بالمليون' : unit === 1000 ? 'الأرقام بالألف' : '';

    var wrap = h('div', { class: 'viz-wrap' }, container);
    var fig = h('figure', { class: 'viz' }, wrap);
    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'أعمدة الدخل والمصروف لآخر ' + Fmt.plural(data.length, 'شهر واحد', 'شهرين', 'أشهر', 'شهرًا') +
                    '. الأرقام كاملة في الجدول أسفل الرسم.'
    }, fig);

    /* خطوط الشبكة ووسوم محور القيمة (على اليمين، كما يُقرأ) */
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var v = (scaleMax / ticks) * i;
      var y = padTop + plotH - (v / scaleMax) * plotH;
      el('line', { x1: x0, x2: x1, y1: y, y2: y, class: i === 0 ? 'axisline' : 'gridline' }, svg);
      el('text', { x: W - padStart + 6, y: y + 3.5, class: 'tick', 'text-anchor': 'start' }, svg)
        .textContent = Fmt.num(v / unit, unit === 1 ? 0 : (v / unit) % 1 ? 1 : 0);
    }

    var groupW = plotW / data.length;
    var gap = 2;                                  // فاصل السطح بين العمودين
    var barW = Math.max(6, (groupW - 14 - gap) / 2);

    data.forEach(function (d, idx) {
      // idx = 0 هو الأقدم ⇒ يُرسم على اليمين
      var gRight = x1 - idx * groupW;
      var gCenter = gRight - groupW / 2;

      var xIncome = gCenter + gap / 2;            // الدخل على يمين المجموعة
      var xExpense = gCenter - gap / 2 - barW;

      var g = el('g', { class: 'viz-mark' }, svg);

      drawBar(g, xIncome, d.income, cIncome);
      drawBar(g, xExpense, d.expense, cExpense);

      el('text', {
        x: gCenter, y: H - padBottom + 14, class: 'tick', 'text-anchor': 'middle'
      }, svg).textContent = Fmt.monthShort(d.month);

      var hit = el('rect', {
        x: gCenter - groupW / 2, y: padTop, width: groupW, height: plotH,
        class: 'viz-hit', tabindex: '0', role: 'button',
        'aria-label': Fmt.monthName(d.month) + '، دخل ' + Fmt.money(d.income) + '، مصروف ' + Fmt.money(d.expense)
      }, svg);

      bindTip(hit, function () {
        return '<b>' + esc(Fmt.monthName(d.month)) + '</b><br>' +
          '<span class="swatch" style="background:' + cIncome + '"></span>الدخل <span class="tv">' + esc(Fmt.money(d.income)) + '</span><br>' +
          '<span class="swatch" style="background:' + cExpense + '"></span>المصروف <span class="tv">' + esc(Fmt.money(d.expense)) + '</span><br>' +
          '<span class="tv">الصافي ' + esc(Fmt.signed(d.income - d.expense, d.income - d.expense < 0 ? 'expense' : 'income')) + '</span>';
      }, function () {
        fig.classList.add('is-hover');
        g.classList.add('is-on');
      }, function () {
        fig.classList.remove('is-hover');
        g.classList.remove('is-on');
      });
    });

    function drawBar(parent, x, value, fill) {
      var hgt = scaleMax > 0 ? (value / scaleMax) * plotH : 0;
      if (hgt < 0.5) return;
      var y = padTop + plotH - hgt;
      el('path', {
        d: roundedTop(x, y, barW, hgt, Math.min(4, barW / 2)),
        fill: fill,
        stroke: surface,
        'stroke-width': 1
      }, parent);
    }

    /* المفتاح حاضر دائمًا مع سلسلتين */
    var legend = h('ul', { class: 'viz-legend', role: 'list' }, fig);
    [['الدخل', cIncome], ['المصروف', cExpense]].forEach(function (pair) {
      var li = h('li', null, legend);
      var sw = h('i', null, li);
      sw.style.background = pair[1];
      h('span', { text: pair[0] }, li);
    });

    h('figcaption', {
      text: (opts.caption || 'الأقدم على اليمين والأحدث على اليسار') +
            (unitLabel ? ' · ' + unitLabel : '')
    }, fig);

    addTableView(
      wrap,
      ['الشهر', 'الدخل', 'المصروف', 'الصافي'],
      data.slice().reverse().map(function (d) {
        return [Fmt.monthName(d.month), Fmt.num(d.income), Fmt.num(d.expense), Fmt.num(d.income - d.expense)];
      })
    );
  }

  /* ======================================================================
     ٣. بطاقة رقم واحد مع خط اتجاه صغير (sparkline)
     ====================================================================== */

  function sparkline(container, values, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (values.length < 2) return;
    var W = 120, H = 34, pad = 3;
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = (max - min) || 1;
    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': opts.label || 'خط اتجاه'
    }, container);
    var pts = values.map(function (v, i) {
      // الأقدم يمينًا: نعكس محور س
      var x = W - pad - (i / (values.length - 1)) * (W - pad * 2);
      var y = pad + (1 - (v - min) / span) * (H - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    el('polyline', {
      points: pts.join(' '), fill: 'none',
      stroke: opts.color || cssVar('--accent', '#2a78d6'),
      'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }, svg);
    var lastX = W - pad - ((values.length - 1) / (values.length - 1)) * 0;
    el('circle', {
      cx: pts[pts.length - 1].split(',')[0], cy: pts[pts.length - 1].split(',')[1],
      r: 3, fill: opts.color || cssVar('--accent', '#2a78d6'),
      stroke: cssVar('--surface-1', '#fff'), 'stroke-width': 2
    }, svg);
    return lastX;
  }

  /* ----- أدوات ----- */

  /** مسار مستطيل بزاويتين عُلويّتين مستديرتين وقاعدة ملتصقة بخط الأساس. */
  function roundedTop(x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt);
    return 'M' + x + ',' + (y + hgt) +
           'L' + x + ',' + (y + r) +
           'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
           'L' + (x + w - r) + ',' + y +
           'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
           'L' + (x + w) + ',' + (y + hgt) + 'Z';
  }

  /** حد أعلى «مريح» للمحور: 1، 2، 2.5، 5 أو 10 × قوة عشرة. */
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / exp;
    var step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return step * exp;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  return {
    barList: barList,
    columns: columns,
    sparkline: sparkline,
    hideTip: hideTip,
    niceMax: niceMax
  };
})();
