/* ==========================================================================
   app.js — الشاشات والتنقّل والنماذج
   ========================================================================== */
'use strict';

var App = (function () {

  var h = UI.h, clear = UI.clear;

  var state = {
    screen: 'home',
    month: Fmt.monthKeyOf(new Date()),
    reportMonth: Fmt.monthKeyOf(new Date()),
    reportKind: 'expense',
    txType: '',
    txSearch: '',
    debtTab: 'owedByMe',
    unlocked: false
  };

  var SCREENS = {
    home:    { title: 'الرئيسية',  sub: 'نظرة عامة على محفظتك',        tab: true },
    tx:      { title: 'المعاملات', sub: 'كل الحركات مع البحث والتصفية', tab: true },
    debts:   { title: 'الديون',    sub: 'ما عليك وما لك',              tab: true },
    reports: { title: 'التقارير',  sub: 'أين يذهب مالك',               tab: true },
    goals:   { title: 'المدخرات',  sub: 'أهدافك وتقدّمك فيها',          tab: false },
    more:    { title: 'المزيد',    sub: 'الإعدادات والنسخ الاحتياطي',   tab: false }
  };

  var EMOJIS = ['🍲', '🛒', '☕', '🚗', '🏠', '💡', '📱', '🏥', '🎓', '👕', '🤲', '🎁', '✈️',
                '🔧', '📦', '💼', '🧾', '🛠️', '📈', '💰', '🎯', '🚙', '🕋', '💵', '🏦', '📲',
                '⚽', '📚', '🐐', '🌾', '💧', '🔌', '🧴', '✂️', '🎉', '👶', '🐟', '🍞'];

  /* ======================================================================
     التنقّل
     ====================================================================== */

  function go(screen) {
    if (!SCREENS[screen]) screen = 'home';
    state.screen = screen;
    Charts.hideTip();

    Object.keys(SCREENS).forEach(function (k) {
      var sec = document.getElementById('screen-' + k);
      if (sec) sec.classList.toggle('is-active', k === screen);
    });

    document.querySelectorAll('.tabbar button[data-screen]').forEach(function (b) {
      b.setAttribute('aria-selected', b.dataset.screen === screen ? 'true' : 'false');
    });

    document.getElementById('screenTitle').firstChild.nodeValue = SCREENS[screen].title;
    document.getElementById('screenSub').textContent = SCREENS[screen].sub;
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    var map = {
      home: renderHome, tx: renderTx, debts: renderDebts,
      reports: renderReports, goals: renderGoals, more: renderMore
    };
    var fn = map[state.screen];
    if (fn) fn(document.getElementById('screen-' + state.screen));
  }

  /* ======================================================================
     عناصر مشتركة
     ====================================================================== */

  /** شريط تنقّل بين الأشهر. */
  function monthNav(parent, value, onChange) {
    var nav = h('div', { class: 'month-nav' }, parent);
    // في الاتجاه من اليمين إلى اليسار: الزر الأول (يمينًا) يعود للشهر السابق
    var prev = h('button', { type: 'button', 'aria-label': 'الشهر السابق' }, nav);
    prev.appendChild(UI.icon('i-next'));   // يشير يمينًا: رجوع في الزمن
    prev.addEventListener('click', function () { onChange(Fmt.addMonths(value, -1)); });

    var label = h('div', { class: 'name' }, nav);
    var isNow = value === Fmt.monthKeyOf(new Date());
    label.textContent = Fmt.monthName(value) + (isNow ? ' · هذا الشهر' : '');

    var next = h('button', { type: 'button', 'aria-label': 'الشهر التالي' }, nav);
    next.appendChild(UI.icon('i-prev'));   // يشير يسارًا: تقدّم في الزمن
    next.disabled = value >= Fmt.monthKeyOf(new Date());
    next.style.opacity = next.disabled ? 0.35 : 1;
    next.addEventListener('click', function () {
      if (!next.disabled) onChange(Fmt.addMonths(value, 1));
    });
    return nav;
  }

  /** صف حركة واحدة قابل للنقر. */
  function txRow(parent, t) {
    var isIn = t.type === 'income' || t.type === 'withdraw';
    var li = h('li', null, parent);
    var btn = h('button', { type: 'button', class: 'row', onclick: function () { txSheet(t.id); } }, li);

    var label, iconText;
    if (t.type === 'saving' || t.type === 'withdraw') {
      var g = t.goalId ? DB.goal(t.goalId) : null;
      iconText = g ? g.icon : '🏦';
      label = (t.type === 'saving' ? 'ادخار' : 'سحب من الادخار') + (g ? ' · ' + g.name : '');
    } else {
      iconText = DB.categoryIcon(t.categoryId);
      label = DB.categoryLabel(t.categoryId);
    }

    h('span', { class: 'avatar', text: iconText, 'aria-hidden': 'true' }, btn);
    var body = h('span', { class: 'body' }, btn);
    h('span', { class: 't', text: t.note || label }, body);
    h('span', {
      class: 's',
      text: (t.note ? label + ' · ' : '') + DB.accountLabel(t.accountId) +
            (t.recurringId ? ' · متكرر' : '')
    }, body);
    h('span', {
      class: 'amt ' + (isIn ? 'in' : 'out'),
      text: Fmt.signedNum(t.amount, isIn ? 'income' : 'expense')
    }, btn);
    return li;
  }

  /** قائمة حركات مجمَّعة بالأيام مع مجموع كل يوم. */
  function txGroupedList(parent, list) {
    var card = h('div', { class: 'card flush' }, parent);
    if (!list.length) {
      UI.empty(card, { icon: '🧾', title: 'لا توجد حركات', sub: 'أضف أول حركة بزر ‎+‎ في الأسفل.' });
      return card;
    }
    var byDay = {};
    var order = [];
    list.forEach(function (t) {
      if (!byDay[t.date]) { byDay[t.date] = []; order.push(t.date); }
      byDay[t.date].push(t);
    });
    order.forEach(function (day) {
      var items = byDay[day];
      var net = items.reduce(function (s, t) {
        return s + ((t.type === 'income' || t.type === 'withdraw') ? t.amount : -t.amount);
      }, 0);
      var head = h('div', { class: 'day-head' }, card);
      h('span', { text: Fmt.friendlyDate(day) }, head);
      h('span', { class: 'n', text: Fmt.signedNum(net, net >= 0 ? 'income' : 'expense') }, head);
      var ul = h('ul', { class: 'rows' }, card);
      items.forEach(function (t) { txRow(ul, t); });
    });
    return card;
  }

  /** شريط نسبة (ميزانية أو هدف). */
  function meter(parent, ratio) {
    var track = h('div', { class: 'meter' }, parent);
    var fill = h('span', null, track);
    fill.style.width = Math.min(100, Math.max(0, ratio * 100)) + '%';
    if (ratio >= 1) fill.classList.add('over');
    else if (ratio >= 0.8) fill.classList.add('warn');
    return track;
  }

  /* ======================================================================
     ١. الرئيسية
     ====================================================================== */

  function renderHome(root) {
    clear(root);
    var nowMonth = Fmt.monthKeyOf(new Date());
    var totals = DB.monthTotals(nowMonth);
    var s = DB.settings();

    /* بطاقة الرصيد */
    var card = h('div', { class: 'balance' }, root);
    h('div', { class: 'lbl', text: s.name ? 'رصيد ' + s.name : 'الرصيد الحالي' }, card);
    h('div', { class: 'amount', text: Fmt.money(DB.balance()) }, card);
    var split = h('div', { class: 'split' }, card);
    var inBox = h('div', null, split);
    h('div', { class: 'k', text: 'دخل ' + Fmt.monthName(nowMonth).split(' ')[0] }, inBox);
    h('div', { class: 'v', text: Fmt.num(totals.income) }, inBox);
    var outBox = h('div', null, split);
    h('div', { class: 'k', text: 'مصروف الشهر' }, outBox);
    h('div', { class: 'v', text: Fmt.num(totals.expense) }, outBox);

    /* صف أرقام: الصافي، الادخار، الديون */
    var debtT = DB.debtTotals();
    var tiles = h('div', { class: 'debt-total' }, root);
    var t1 = h('div', null, tiles);
    h('div', { class: 'k', text: 'صافي الشهر' }, t1);
    h('div', {
      class: 'v ' + (totals.net >= 0 ? 'in' : 'out'),
      text: Fmt.signed(totals.net, totals.net >= 0 ? 'income' : 'expense')
    }, t1);
    var t2 = h('div', null, tiles);
    h('div', { class: 'k', text: 'مجموع المدخرات' }, t2);
    h('div', { class: 'v', text: Fmt.num(DB.savingsTotal()) }, t2);

    if (debtT.owedByMe > 0 || debtT.owedToMe > 0) {
      var dTiles = h('div', { class: 'debt-total' }, root);
      var d1 = h('div', null, dTiles);
      h('div', { class: 'k', text: 'ديون عليّ' }, d1);
      h('div', { class: 'v out', text: Fmt.num(debtT.owedByMe) }, d1);
      var d2 = h('div', null, dTiles);
      h('div', { class: 'k', text: 'ديون لي' }, d2);
      h('div', { class: 'v in', text: Fmt.num(debtT.owedToMe) }, d2);
      if (debtT.overdue) {
        h('p', {
          class: 'section-label',
          style: 'color:var(--critical);margin-top:-4px',
          text: '⚠️ لديك ' + Fmt.plural(debtT.overdue, 'دين متأخر', 'دينان متأخران', 'ديون متأخرة', 'دين متأخر') + ' عن موعد السداد.'
        }, root);
      }
    }

    /* أزرار سريعة */
    var quick = h('div', { class: 'card', style: 'display:flex;gap:9px' }, root);
    h('button', {
      type: 'button', class: 'btn sm', style: 'flex:1;background:var(--expense)',
      text: '− مصروف', onclick: function () { txSheet(null, 'expense'); }
    }, quick);
    h('button', {
      type: 'button', class: 'btn sm', style: 'flex:1;background:var(--income)',
      text: '+ دخل', onclick: function () { txSheet(null, 'income'); }
    }, quick);
    h('button', {
      type: 'button', class: 'btn sm ghost', style: 'flex:1',
      text: '🏦 ادخار', onclick: function () { txSheet(null, 'saving'); }
    }, quick);

    /* الميزانيات */
    var buds = DB.budgets(nowMonth);
    if (buds.length) {
      var bCard = h('div', { class: 'card' }, root);
      var bt = h('h2', { class: 'card-title' }, bCard);
      h('span', { text: 'ميزانيات الشهر' }, bt);
      h('button', {
        class: 'link', type: 'button', text: 'إدارة',
        onclick: function () { categoriesListSheet('expense'); }
      }, bt);
      buds.slice(0, 4).forEach(function (b) {
        var box = h('div', { class: 'budget' }, bCard);
        var hd = h('div', { class: 'hd' }, box);
        h('span', { text: b.icon + ' ' + b.name }, hd);
        h('span', { class: 'v', text: Fmt.num(b.spent) + ' من ' + Fmt.num(b.budget) }, hd);
        meter(box, b.ratio);
        if (b.left < 0) {
          h('p', { class: 'note over', text: 'تجاوزت السقف بـ ' + Fmt.money(-b.left) }, box);
        } else {
          h('p', { class: 'note muted', text: 'المتبقي ' + Fmt.money(b.left) }, box);
        }
      });
    }

    /* أهداف الادخار */
    var goals = DB.goals();
    if (goals.length) {
      var gCard = h('div', { class: 'card' }, root);
      var gt = h('h2', { class: 'card-title' }, gCard);
      h('span', { text: 'أهداف الادخار' }, gt);
      h('button', { class: 'link', type: 'button', text: 'الكل', onclick: function () { go('goals'); } }, gt);
      goals.slice(0, 3).forEach(function (g) {
        var p = DB.goalProgress(g.id);
        var box = h('div', { class: 'budget' }, gCard);
        var hd = h('div', { class: 'hd' }, box);
        h('span', { text: g.icon + ' ' + g.name }, hd);
        h('span', { class: 'v', text: Fmt.num(p.saved) + ' من ' + Fmt.num(g.target) }, hd);
        meter(box, Math.min(1, p.ratio));
      });
    }

    /* أقرب الديون */
    var openDebts = DB.debts({ open: true }).filter(function (d) { return d.dueDate; }).slice(0, 3);
    if (openDebts.length) {
      var dCard = h('div', { class: 'card flush' }, root);
      var dh = h('h2', { class: 'card-title', style: 'padding:16px 16px 10px;margin:0' }, dCard);
      h('span', { text: 'أقرب الديون استحقاقًا' }, dh);
      h('button', { class: 'link', type: 'button', text: 'الكل', onclick: function () { go('debts'); } }, dh);
      var dul = h('ul', { class: 'rows' }, dCard);
      openDebts.forEach(function (d) { debtRow(dul, d); });
    }

    /* آخر الحركات */
    var recent = DB.filterTx({}).slice(0, 6);
    var rCard = h('div', { class: 'card flush' }, root);
    var rh = h('h2', { class: 'card-title', style: 'padding:16px 16px 10px;margin:0' }, rCard);
    h('span', { text: 'آخر الحركات' }, rh);
    h('button', { class: 'link', type: 'button', text: 'الكل', onclick: function () { go('tx'); } }, rh);
    if (!recent.length) {
      UI.empty(rCard, {
        icon: '👋', title: 'ابدأ بتسجيل أول حركة',
        sub: 'اضغط زر ‎+‎ في الأسفل، أو جرّب بيانات تجريبية من «المزيد».'
      });
    } else {
      var rul = h('ul', { class: 'rows' }, rCard);
      recent.forEach(function (t) { txRow(rul, t); });
    }
  }

  /* ======================================================================
     ٢. المعاملات
     ====================================================================== */

  function renderTx(root) {
    clear(root);

    monthNav(root, state.month, function (m) { state.month = m; renderTx(root); });

    var search = h('div', { class: 'search' }, root);
    search.appendChild(UI.icon('i-search'));
    var input = h('input', {
      type: 'search', placeholder: 'ابحث في الملاحظات والفئات والمبالغ',
      value: state.txSearch, 'aria-label': 'بحث'
    }, search);
    input.addEventListener('input', function () {
      state.txSearch = input.value;
      paint();
    });

    UI.segmented(root, [
      { value: '', label: 'الكل' },
      { value: 'expense', label: 'مصروف' },
      { value: 'income', label: 'دخل' },
      { value: 'saving', label: 'ادخار' }
    ], state.txType, function (v) { state.txType = v; paint(); });

    var summary = h('div', { class: 'debt-total' }, root);
    var listHost = h('div', null, root);

    paint();

    function paint() {
      var q = { month: state.month, search: state.txSearch };
      if (state.txType === 'saving') q.types = ['saving', 'withdraw'];
      else if (state.txType) q.type = state.txType;
      var list = DB.filterTx(q);

      clear(summary);
      var totals = DB.monthTotals(state.month);
      var a = h('div', null, summary);
      h('div', { class: 'k', text: 'دخل الشهر' }, a);
      h('div', { class: 'v in', text: Fmt.num(totals.income) }, a);
      var b = h('div', null, summary);
      h('div', { class: 'k', text: 'مصروف الشهر' }, b);
      h('div', { class: 'v out', text: Fmt.num(totals.expense) }, b);

      clear(listHost);
      h('p', {
        class: 'section-label',
        text: list.length
          ? Fmt.plural(list.length, 'حركة واحدة', 'حركتان', 'حركات', 'حركة') + ' في هذا العرض'
          : 'لا نتائج لهذا العرض'
      }, listHost);
      txGroupedList(listHost, list);
    }
  }

  /* ======================================================================
     ٣. الديون
     ====================================================================== */

  function debtRow(parent, d) {
    var rem = DB.debtRemaining(d);
    var paid = DB.debtPaid(d);
    var settled = DB.isDebtSettled(d);
    var li = h('li', null, parent);
    var btn = h('button', { type: 'button', class: 'row', onclick: function () { debtDetailSheet(d.id); } }, li);
    h('span', {
      class: 'avatar', 'aria-hidden': 'true',
      text: settled ? '✅' : (d.direction === 'owedByMe' ? '📤' : '📥')
    }, btn);
    var body = h('span', { class: 'body' }, btn);
    h('span', { class: 't', text: d.person }, body);

    var bits = [];
    if (paid > 0 && !settled) bits.push('سُدّد ' + Fmt.num(paid) + ' من ' + Fmt.num(d.amount));
    else if (!settled) bits.push('الأصل ' + Fmt.num(d.amount));
    if (d.note) bits.push(d.note);
    h('span', { class: 's', text: settled ? 'مسدّد بالكامل' : bits.join(' · ') }, body);

    var tail = h('span', { class: 'amt ' + (d.direction === 'owedByMe' ? 'out' : 'in'), style: 'text-align:end' }, btn);
    tail.textContent = settled ? '—' : Fmt.num(rem);
    if (!settled && d.dueDate) {
      var t = Fmt.today();
      var cls = d.dueDate < t ? 'due' : (Fmt.daysBetween(t, d.dueDate) <= 7 ? 'soon' : '');
      if (cls) {
        var badge = h('div', { class: 'badge ' + cls, text: Fmt.dueLabel(d.dueDate), style: 'margin-top:4px' });
        tail.appendChild(badge);
      }
    }
    return li;
  }

  function renderDebts(root) {
    clear(root);
    var t = DB.debtTotals();

    var tiles = h('div', { class: 'debt-total' }, root);
    var a = h('div', null, tiles);
    h('div', { class: 'k', text: 'ديون عليّ' }, a);
    h('div', { class: 'v out', text: Fmt.num(t.owedByMe) }, a);
    var b = h('div', null, tiles);
    h('div', { class: 'k', text: 'ديون لي' }, b);
    h('div', { class: 'v in', text: Fmt.num(t.owedToMe) }, b);

    var netCard = h('div', { class: 'card', style: 'display:flex;align-items:center;gap:10px' }, root);
    h('span', { class: 'avatar', text: '⚖️', 'aria-hidden': 'true' }, netCard);
    var nb = h('div', { style: 'flex:1' }, netCard);
    h('div', { style: 'font-size:13px;font-weight:700;color:var(--text-muted)', text: 'الصافي' }, nb);
    h('div', {
      style: 'font-size:18px;font-weight:800',
      text: t.net >= 0 ? 'لك ' + Fmt.money(t.net) : 'عليك ' + Fmt.money(-t.net)
    }, nb);

    h('button', {
      type: 'button', class: 'btn', text: '＋ إضافة دين',
      onclick: function () { debtSheet(null, state.debtTab); },
      style: 'margin-bottom:14px'
    }, root);

    UI.segmented(root, [
      { value: 'owedByMe', label: 'عليّ' },
      { value: 'owedToMe', label: 'لي' },
      { value: 'settled', label: 'مسدّدة' }
    ], state.debtTab, function (v) { state.debtTab = v; renderDebts(root); });

    var list;
    if (state.debtTab === 'settled') {
      list = DB.debts().filter(function (d) { return DB.isDebtSettled(d); });
    } else {
      list = DB.debts({ direction: state.debtTab }).filter(function (d) { return !DB.isDebtSettled(d); });
    }

    var card = h('div', { class: 'card flush' }, root);
    if (!list.length) {
      UI.empty(card, {
        icon: state.debtTab === 'settled' ? '✅' : '🧾',
        title: state.debtTab === 'settled' ? 'لا ديون مسدّدة بعد'
             : state.debtTab === 'owedByMe' ? 'لا ديون عليك — الحمد لله' : 'لا ديون لك عند أحد',
        sub: state.debtTab === 'settled' ? 'ستظهر هنا الديون التي أُكمل سدادها.' : 'اضغط «إضافة دين» لتسجيل واحد.'
      });
    } else {
      var ul = h('ul', { class: 'rows' }, card);
      list.forEach(function (d) { debtRow(ul, d); });
    }
  }

  /* ======================================================================
     ٤. المدخرات
     ====================================================================== */

  function renderGoals(root) {
    clear(root);
    var total = DB.savingsTotal();

    var card = h('div', { class: 'balance', style: 'background:linear-gradient(135deg,var(--income),#0f7a55);box-shadow:0 10px 28px rgba(15,122,85,.3)' }, root);
    h('div', { class: 'lbl', text: 'مجموع ما ادّخرته' }, card);
    h('div', { class: 'amount', text: Fmt.money(total) }, card);

    h('button', {
      type: 'button', class: 'btn', text: '＋ هدف ادخار جديد',
      onclick: function () { goalSheet(null); }, style: 'margin-bottom:14px'
    }, root);

    var goals = DB.goals();
    if (!goals.length) {
      var empty = h('div', { class: 'card' }, root);
      UI.empty(empty, {
        icon: '🎯', title: 'لا أهداف بعد',
        sub: 'حدّد هدفًا (سيارة، حج، طوارئ) وحوّل إليه كل شهر مبلغًا.'
      });
      return;
    }

    goals.forEach(function (g) {
      var p = DB.goalProgress(g.id);
      var box = h('div', { class: 'card' }, root);
      var hd = h('h2', { class: 'card-title' }, box);
      h('span', { text: g.icon + ' ' + g.name }, hd);
      h('button', { class: 'link', type: 'button', text: 'تعديل', onclick: function () { goalSheet(g.id); } }, hd);

      h('div', {
        style: 'font-size:22px;font-weight:800;margin-bottom:2px',
        text: Fmt.money(p.saved)
      }, box);
      h('div', {
        style: 'font-size:13px;color:var(--text-muted);margin-bottom:9px',
        text: g.target > 0
          ? 'من هدف ' + Fmt.money(g.target) + ' · ' + Fmt.digits(Math.round(p.ratio * 100)) + '٪'
          : 'بدون مبلغ هدف محدّد'
      }, box);
      if (g.target > 0) meter(box, Math.min(1, p.ratio));

      if (g.deadline) {
        h('p', {
          class: 'note muted', style: 'font-size:12.5px;margin:8px 0 0;font-weight:600',
          text: '🗓️ الموعد: ' + Fmt.shortDate(g.deadline) + ' — ' + Fmt.dueLabel(g.deadline)
        }, box);
      }
      if (p.left > 0 && g.target > 0) {
        h('p', {
          class: 'note muted', style: 'font-size:12.5px;margin:6px 0 0;font-weight:600',
          text: 'يتبقّى ' + Fmt.money(p.left)
        }, box);
      }

      var actions = h('div', { style: 'display:flex;gap:8px;margin-top:13px' }, box);
      h('button', {
        type: 'button', class: 'btn sm', style: 'flex:1',
        text: '＋ إيداع', onclick: function () { txSheet(null, 'saving', { goalId: g.id }); }
      }, actions);
      h('button', {
        type: 'button', class: 'btn sm ghost', style: 'flex:1',
        text: '− سحب', onclick: function () { txSheet(null, 'withdraw', { goalId: g.id }); }
      }, actions);
    });
  }

  /* ======================================================================
     ٥. التقارير
     ====================================================================== */

  function renderReports(root) {
    clear(root);
    monthNav(root, state.reportMonth, function (m) { state.reportMonth = m; renderReports(root); });

    var m = state.reportMonth;
    var t = DB.monthTotals(m);
    var savingRate = t.income > 0 ? (t.income - t.expense) / t.income : 0;

    /* صف أرقام رئيسية — لا رسم لرقم واحد */
    var k1 = h('div', { class: 'debt-total' }, root);
    var a = h('div', null, k1);
    h('div', { class: 'k', text: 'الدخل' }, a);
    h('div', { class: 'v in', text: Fmt.num(t.income) }, a);
    var b = h('div', null, k1);
    h('div', { class: 'k', text: 'المصروف' }, b);
    h('div', { class: 'v out', text: Fmt.num(t.expense) }, b);

    var k2 = h('div', { class: 'debt-total' }, root);
    var c = h('div', null, k2);
    h('div', { class: 'k', text: 'الصافي' }, c);
    h('div', {
      class: 'v ' + (t.net >= 0 ? 'in' : 'out'),
      text: Fmt.signed(t.net, t.net >= 0 ? 'income' : 'expense')
    }, c);
    var d = h('div', null, k2);
    h('div', { class: 'k', text: 'نسبة الادخار من الدخل' }, d);
    h('div', {
      class: 'v', text: t.income > 0 ? Fmt.digits(Math.round(savingRate * 100)) + '٪' : '—'
    }, d);

    /* نسبة المصروف من الدخل — مقياس واحد لا مخطط دائري */
    if (t.income > 0) {
      var mCard = h('div', { class: 'card' }, root);
      var mh = h('h2', { class: 'card-title' }, mCard);
      h('span', { text: 'المصروف من الدخل' }, mh);
      h('span', {
        class: 'link', style: 'color:var(--text-muted)',
        text: Fmt.digits(Math.round((t.expense / t.income) * 100)) + '٪'
      }, mh);
      meter(mCard, t.expense / t.income);
      h('p', {
        class: 'note muted', style: 'font-size:12.5px;margin:8px 0 0;font-weight:600',
        text: t.expense <= t.income
          ? 'بقي لك ' + Fmt.money(t.income - t.expense) + ' من دخل هذا الشهر.'
          : 'صرفت أكثر من دخلك بـ ' + Fmt.money(t.expense - t.income) + '.'
      }, mCard);
    }

    /* أعمدة آخر ٦ أشهر */
    var cCard = h('div', { class: 'card' }, root);
    h('h2', { class: 'card-title', html: '<span>الدخل والمصروف — آخر ٦ أشهر</span>' }, cCard);
    var host = h('div', null, cCard);
    var series = DB.monthlySeries(m, 6);
    if (series.some(function (x) { return x.income || x.expense; })) {
      Charts.columns(host, series, {});
    } else {
      UI.empty(host, { icon: '📈', title: 'لا بيانات كافية بعد', sub: 'سجّل حركات لعدة أشهر لتظهر المقارنة.' });
    }

    /* تفصيل الفئات */
    var catCard = h('div', { class: 'card' }, root);
    var ch = h('h2', { class: 'card-title' }, catCard);
    h('span', { text: 'التفصيل حسب الفئة' }, ch);
    var segHost = h('div', null, catCard);
    UI.segmented(segHost, [
      { value: 'expense', label: 'المصروف' },
      { value: 'income', label: 'الدخل' }
    ], state.reportKind, function (v) { state.reportKind = v; paintCats(); });
    var catHost = h('div', null, catCard);
    paintCats();

    function paintCats() {
      var rows = DB.byCategory(m, state.reportKind).map(function (r) {
        return { label: r.name, value: r.total, icon: r.icon, count: r.count };
      });
      Charts.barList(catHost, rows, {
        nameHeader: 'الفئة',
        color: getComputedStyle(document.documentElement)
          .getPropertyValue(state.reportKind === 'income' ? '--series-3' : '--series-1').trim()
      });
    }

    /* الحسابات */
    var accCard = h('div', { class: 'card flush' }, root);
    h('h2', { class: 'card-title', style: 'padding:16px 16px 6px;margin:0', html: '<span>أرصدة الحسابات</span>' }, accCard);
    var aul = h('ul', { class: 'rows' }, accCard);
    DB.accounts().forEach(function (acc) {
      var li = h('li', { class: 'row' }, aul);
      h('span', { class: 'avatar', text: acc.icon, 'aria-hidden': 'true' }, li);
      var body = h('span', { class: 'body' }, li);
      h('span', { class: 't', text: acc.name }, body);
      var n = DB.filterTx({ accountId: acc.id }).length;
      h('span', { class: 's', text: Fmt.plural(n, 'حركة واحدة', 'حركتان', 'حركات', 'حركة') }, body);
      var bal = DB.accountBalance(acc.id);
      h('span', { class: 'amt ' + (bal >= 0 ? 'in' : 'out'), text: Fmt.num(bal) }, li);
    });
  }

  /* ======================================================================
     ٦. المزيد والإعدادات
     ====================================================================== */

  function settingsRow(parent, cfg) {
    var node = h(cfg.onClick ? 'button' : 'div', {
      class: 'set-row' + (cfg.danger ? ' danger' : ''),
      type: cfg.onClick ? 'button' : null,
      onclick: cfg.onClick || null
    }, parent);
    if (cfg.icon) h('span', { class: 'avatar', text: cfg.icon, 'aria-hidden': 'true' }, node);
    var body = h('span', { class: 'body' }, node);
    h('span', { text: cfg.label }, body);
    if (cfg.sub) h('span', { class: 's', text: cfg.sub }, body);
    if (cfg.value) h('span', { class: 'val', text: cfg.value }, node);
    if (cfg.onClick) node.appendChild(UI.icon('i-chev', 'chev'));
    return node;
  }

  function renderMore(root) {
    clear(root);
    var s = DB.settings();
    var st = DB.stats();

    var name = h('div', { class: 'card' }, root);
    var nf = UI.field(name, {
      label: 'اسمك (يظهر على بطاقة الرصيد)', value: s.name, placeholder: 'اختياري'
    });
    nf.input.addEventListener('change', function () {
      DB.setSetting('name', nf.input.value.trim());
      UI.toast('تم الحفظ');
    });
    nf.style.marginBottom = '0';

    h('p', { class: 'section-label', text: 'الدفاتر' }, root);
    var books = h('div', { class: 'card flush' }, root);
    settingsRow(books, {
      icon: '🏦', label: 'المدخرات والأهداف',
      sub: Fmt.plural(DB.goals().length, 'هدف واحد', 'هدفان', 'أهداف', 'هدفًا') + ' · ' + Fmt.money(DB.savingsTotal()),
      onClick: function () { go('goals'); }
    });
    settingsRow(books, {
      icon: '🔁', label: 'الراتب والحركات المتكررة',
      sub: Fmt.plural(DB.recurring().length, 'حركة واحدة', 'حركتان', 'حركات', 'حركة') + ' متكررة',
      onClick: recurringListSheet
    });
    settingsRow(books, {
      icon: '🏷️', label: 'الفئات والميزانيات',
      sub: Fmt.plural(DB.categories().length, 'فئة واحدة', 'فئتان', 'فئات', 'فئة'),
      onClick: function () { categoriesListSheet('expense'); }
    });
    settingsRow(books, {
      icon: '💳', label: 'الحسابات والمحافظ',
      sub: Fmt.plural(DB.accounts().length, 'حساب واحد', 'حسابان', 'حسابات', 'حسابًا'),
      onClick: accountsListSheet
    });

    h('p', { class: 'section-label', text: 'العرض' }, root);
    var disp = h('div', { class: 'card flush' }, root);
    settingsRow(disp, {
      icon: '💱', label: 'العملة', value: Fmt.currency().name, onClick: currencySheet
    });
    settingsRow(disp, {
      icon: '🔢', label: 'شكل الأرقام',
      value: s.digits === 'arabic' ? '١٢٣' : '123',
      onClick: function () {
        DB.setSetting('digits', s.digits === 'arabic' ? 'latin' : 'arabic');
        UI.toast('تم تغيير شكل الأرقام');
      }
    });
    settingsRow(disp, {
      icon: '🗓️', label: 'التقويم',
      value: s.calendar === 'hijri' ? 'هجري' : 'ميلادي',
      onClick: function () {
        DB.setSetting('calendar', s.calendar === 'hijri' ? 'greg' : 'hijri');
        UI.toast('تم تغيير التقويم');
      }
    });
    settingsRow(disp, {
      icon: '🌗', label: 'المظهر',
      value: s.theme === 'dark' ? 'ليلي' : s.theme === 'light' ? 'نهاري' : 'حسب النظام',
      onClick: function () {
        var next = s.theme === 'auto' ? 'light' : s.theme === 'light' ? 'dark' : 'auto';
        DB.setSetting('theme', next);
        applyTheme();
      }
    });

    h('p', { class: 'section-label', text: 'الخصوصية' }, root);
    var priv = h('div', { class: 'card flush' }, root);
    UI.toggle(priv, {
      label: 'قفل التطبيق برمز',
      hint: 'رمز من ٤ أرقام يُطلب عند كل فتح. البيانات تبقى على جهازك.',
      checked: !!s.lockEnabled,
      onChange: function (on) {
        if (on) {
          UI.lock.show('set', function () { render(); });
        } else {
          DB.setSetting('lockEnabled', false);
          DB.setSetting('pin', null);
          UI.toast('تم إلغاء القفل');
        }
      }
    });
    if (s.lockEnabled) {
      settingsRow(priv, {
        icon: '🔑', label: 'تغيير الرمز',
        onClick: function () { UI.lock.show('set'); }
      });
    }

    h('p', { class: 'section-label', text: 'النسخ الاحتياطي' }, root);
    var backup = h('div', { class: 'card flush' }, root);
    settingsRow(backup, {
      icon: '⬇️', label: 'تصدير نسخة احتياطية',
      sub: 'ملف JSON يحتوي كل بياناتك',
      onClick: function () {
        UI.download('masarif-' + Fmt.today() + '.json', DB.exportData());
        UI.toast('تم تصدير النسخة');
      }
    });
    settingsRow(backup, {
      icon: '⬆️', label: 'استيراد نسخة', sub: 'استبدال البيانات الحالية أو دمجها',
      onClick: importSheet
    });
    settingsRow(backup, {
      icon: '📊', label: 'تصدير الحركات إلى CSV',
      sub: 'لفتحها في Excel أو Google Sheets',
      onClick: exportCsv
    });

    h('p', { class: 'section-label', text: 'الصيانة' }, root);
    var maint = h('div', { class: 'card flush' }, root);
    if (!st.tx) {
      settingsRow(maint, {
        icon: '🧪', label: 'تحميل بيانات تجريبية',
        sub: 'ستة أشهر من الحركات لتجربة التطبيق',
        onClick: function () {
          DB.seedDemo();
          UI.toast('تمت إضافة بيانات تجريبية');
          go('home');
        }
      });
    }
    settingsRow(maint, {
      icon: '🧹', label: 'حذف الحركات والديون والأهداف',
      sub: 'تبقى الفئات والحسابات والإعدادات', danger: true,
      onClick: function () {
        UI.confirm({
          title: 'حذف الحركات؟',
          message: 'سيُحذف ' + Fmt.digits(st.tx) + ' حركة وكل الديون والأهداف. لا يمكن التراجع.',
          ok: 'حذف', danger: true
        }).then(function (yes) {
          if (yes) { DB.clearTransactions(); UI.toast('تم الحذف'); go('home'); }
        });
      }
    });
    settingsRow(maint, {
      icon: '⚠️', label: 'إعادة التطبيق إلى حالته الأولى',
      sub: 'حذف كل شيء بما فيه الفئات والإعدادات', danger: true,
      onClick: function () {
        UI.confirm({
          title: 'إعادة ضبط كاملة؟',
          message: 'سيُحذف كل شيء نهائيًا. صدّر نسخة احتياطية أولًا إن أردت الاحتفاظ ببياناتك.',
          ok: 'إعادة الضبط', danger: true
        }).then(function (yes) {
          if (yes) { DB.resetAll(); applyTheme(); UI.toast('تمت إعادة الضبط'); go('home'); }
        });
      }
    });

    var about = h('div', { class: 'card' }, root);
    h('p', {
      style: 'margin:0;font-size:13px;color:var(--text-muted);line-height:1.7',
      html: '<b>مصاريف</b> — دفتر الحسابات و الدخل.<br>' +
            'يعمل بدون إنترنت، وكل بياناتك محفوظة على هذا الجهاز فقط: لا حساب، لا خادم، لا مشاركة.<br>' +
            (st.since ? 'أول حركة مسجّلة: ' + UI.esc(Fmt.shortDate(st.since)) + ' · ' : '') +
            Fmt.digits(st.tx) + ' حركة · ' + Fmt.digits(st.debts) + ' دين · ' + Fmt.digits(st.goals) + ' هدف.'
    }, about);
  }

  /* ======================================================================
     نماذج: الحركات
     ====================================================================== */

  function goalItems() {
    var items = [{ id: '', name: 'ادخار عام', icon: '🏦' }];
    DB.goals().forEach(function (g) { items.push({ id: g.id, name: g.name, icon: g.icon }); });
    return items;
  }

  function txSheet(txId, presetType, preset) {
    var existing = txId ? DB.tx(txId) : null;
    var type = existing ? existing.type : (presetType || 'expense');
    preset = preset || {};

    UI.openSheet({
      title: existing ? 'تعديل الحركة' : 'حركة جديدة',
      action: 'حفظ',
      build: function (body) {
        var typeHost = h('div', null, body);
        var formHost = h('div', null, body);

        UI.segmented(typeHost, [
          { value: 'expense', label: 'مصروف' },
          { value: 'income', label: 'دخل' },
          { value: 'saving', label: 'ادخار' },
          { value: 'withdraw', label: 'سحب' }
        ], type, function (v) { type = v; paint(); });

        var refs = {};
        paint();

        function paint() {
          clear(formHost);
          refs.amount = UI.amountField(formHost, {
            value: existing ? existing.amount : (preset.amount || '')
          });

          if (type === 'saving' || type === 'withdraw') {
            refs.target = UI.pickerGrid(formHost, {
              label: type === 'saving' ? 'إلى أي هدف؟' : 'من أي هدف؟',
              items: goalItems(),
              value: existing ? (existing.goalId || '') : (preset.goalId || '')
            });
          } else {
            var cats = DB.categories(type, { noSystem: true }).map(function (c) {
              return { id: c.id, name: c.name, icon: c.icon };
            });
            refs.target = UI.pickerGrid(formHost, {
              label: 'الفئة',
              items: cats,
              value: existing ? existing.categoryId : (preset.categoryId || (cats[0] && cats[0].id)),
              error: 'اختر فئة'
            });
          }

          refs.account = UI.field(formHost, {
            label: 'الحساب', type: 'select',
            value: existing ? existing.accountId : (preset.accountId || DB.defaultAccountId()),
            options: DB.accounts().map(function (a) {
              return { value: a.id, label: a.icon + ' ' + a.name };
            })
          });

          refs.date = UI.field(formHost, {
            label: 'التاريخ', type: 'date',
            value: existing ? existing.date : (preset.date || Fmt.today())
          });

          refs.note = UI.field(formHost, {
            label: 'ملاحظة', type: 'textarea',
            placeholder: 'مثال: مشتريات السوق الأسبوعية',
            value: existing ? existing.note : ''
          });

          if (existing) {
            h('button', {
              type: 'button', class: 'btn danger', text: '🗑️ حذف هذه الحركة',
              onclick: function () {
                UI.confirm({ title: 'حذف الحركة؟', ok: 'حذف', danger: true }).then(function (yes) {
                  if (!yes) return;
                  DB.deleteTx(existing.id);
                  UI.closeSheet();
                  UI.toast('تم حذف الحركة');
                });
              }
            }, formHost);
          }
        }

        UI.openSheet.save = null;
        sheetSave = function () {
          var amount = Fmt.parseAmount(refs.amount.input.value);
          if (!(amount > 0)) { refs.amount.setError('أدخل مبلغًا أكبر من صفر'); return; }

          var data = {
            type: type,
            amount: amount,
            accountId: refs.account.input.value,
            date: refs.date.input.value || Fmt.today(),
            note: refs.note.input.value
          };

          if (type === 'saving' || type === 'withdraw') {
            data.goalId = refs.target.value() || null;
          } else {
            var cid = refs.target.value();
            if (!cid) { refs.target.setError('اختر فئة'); return; }
            data.categoryId = cid;
          }

          if (existing) { DB.updateTx(existing.id, data); UI.toast('تم تحديث الحركة'); }
          else { DB.addTx(data); UI.toast('تمت إضافة الحركة'); }
          UI.closeSheet();
        };
      },
      onAction: function () { if (sheetSave) sheetSave(); }
    });
  }

  var sheetSave = null;

  /* ======================================================================
     نماذج: الديون
     ====================================================================== */

  function debtSheet(debtId, direction) {
    var existing = debtId ? DB.debt(debtId) : null;
    var dir = existing ? existing.direction : (direction === 'owedToMe' ? 'owedToMe' : 'owedByMe');

    UI.openSheet({
      title: existing ? 'تعديل الدين' : 'دين جديد',
      action: 'حفظ',
      build: function (body) {
        if (!existing) {
          UI.segmented(body, [
            { value: 'owedByMe', label: 'دين عليّ' },
            { value: 'owedToMe', label: 'دين لي' }
          ], dir, function (v) { dir = v; hint.textContent = hintText(); });
        }
        var hint = h('p', {
          class: 'section-label', style: 'margin-top:0', text: hintText()
        }, body);

        var person = UI.field(body, {
          label: 'الاسم', placeholder: 'اسم الشخص أو الجهة',
          value: existing ? existing.person : '', error: 'اكتب الاسم'
        });
        var amount = UI.amountField(body, {
          label: 'المبلغ الأصلي', value: existing ? existing.amount : ''
        });
        var date = UI.field(body, {
          label: 'تاريخ الدين', type: 'date', value: existing ? existing.date : Fmt.today()
        });
        var due = UI.field(body, {
          label: 'تاريخ السداد المتوقّع (اختياري)', type: 'date',
          value: existing && existing.dueDate ? existing.dueDate : ''
        });
        var account = UI.field(body, {
          label: 'الحساب', type: 'select',
          value: existing ? existing.accountId : DB.defaultAccountId(),
          options: DB.accounts().map(function (a) { return { value: a.id, label: a.icon + ' ' + a.name }; })
        });
        var note = UI.field(body, {
          label: 'ملاحظة', type: 'textarea', value: existing ? existing.note : '',
          placeholder: 'سبب الدين أو تفاصيله'
        });

        var affects = null;
        if (!existing) {
          affects = UI.toggle(body, {
            label: 'أضف المبلغ إلى الرصيد الآن',
            hint: dir === 'owedByMe'
              ? 'لأنك استلمت المال فعلًا — يُسجَّل كدخل.'
              : 'لأنك دفعت المال فعلًا — يُسجَّل كمصروف.',
            checked: true
          });
          affects.style.borderTop = '0';
          affects.style.padding = '12px 0';
        }

        if (existing) {
          h('button', {
            type: 'button', class: 'btn danger', text: '🗑️ حذف الدين',
            onclick: function () {
              UI.confirm({
                title: 'حذف الدين؟',
                message: 'هل تحذف أيضًا الحركات المالية المرتبطة به من الرصيد؟',
                ok: 'حذف الدين والحركات', cancel: 'إلغاء', danger: true
              }).then(function (yes) {
                if (!yes) return;
                DB.deleteDebt(existing.id, true);
                UI.closeSheet();
                UI.toast('تم حذف الدين');
              });
            }
          }, body);
        }

        function hintText() {
          return dir === 'owedByMe'
            ? '📤 مال أخذته من غيرك ويجب أن تُرجعه.'
            : '📥 مال أعطيته لغيرك وتنتظر رجوعه.';
        }

        sheetSave = function () {
          var ok = true;
          if (!person.input.value.trim()) { person.setError('اكتب الاسم'); ok = false; }
          var amt = Fmt.parseAmount(amount.input.value);
          if (!(amt > 0)) { amount.setError('أدخل مبلغًا أكبر من صفر'); ok = false; }
          if (!ok) return;

          var data = {
            direction: dir,
            person: person.input.value,
            amount: amt,
            date: date.input.value || Fmt.today(),
            dueDate: due.input.value || null,
            accountId: account.input.value,
            note: note.input.value
          };
          if (existing) {
            DB.updateDebt(existing.id, data);
            UI.toast('تم تحديث الدين');
          } else {
            data.affectsBalance = affects ? affects.input.checked : false;
            DB.addDebt(data);
            UI.toast('تم تسجيل الدين');
          }
          UI.closeSheet();
        };
      },
      onAction: function () { if (sheetSave) sheetSave(); }
    });
  }

  function debtDetailSheet(debtId) {
    var d = DB.debt(debtId);
    if (!d) return;

    UI.openSheet({
      title: d.person,
      cancelLabel: 'إغلاق',
      noAutofocus: true,
      build: function (body) {
        var rem = DB.debtRemaining(d);
        var paid = DB.debtPaid(d);
        var settled = DB.isDebtSettled(d);

        var head = h('div', { class: 'card' }, body);
        h('p', {
          style: 'margin:0 0 4px;font-size:13px;font-weight:700;color:var(--text-muted)',
          text: d.direction === 'owedByMe' ? '📤 دين عليّ' : '📥 دين لي'
        }, head);
        h('p', {
          style: 'margin:0;font-size:27px;font-weight:800',
          text: settled ? 'مسدّد بالكامل' : Fmt.money(rem)
        }, head);
        h('p', {
          style: 'margin:4px 0 12px;font-size:13px;color:var(--text-muted)',
          text: 'الأصل ' + Fmt.money(d.amount) + ' · سُدّد ' + Fmt.money(paid)
        }, head);
        meter(head, d.amount > 0 ? paid / d.amount : 0);
        h('p', {
          style: 'margin:10px 0 0;font-size:13px;color:var(--text-secondary);line-height:1.7',
          text: 'تاريخ الدين: ' + Fmt.shortDate(d.date) +
                (d.dueDate ? ' · السداد: ' + Fmt.shortDate(d.dueDate) + ' (' + Fmt.dueLabel(d.dueDate) + ')' : '')
        }, head);
        if (d.note) {
          h('p', {
            style: 'margin:6px 0 0;font-size:13px;color:var(--text-muted);line-height:1.7',
            text: d.note
          }, head);
        }

        var actions = h('div', { style: 'display:flex;gap:9px;margin-bottom:14px' }, body);
        if (!settled) {
          h('button', {
            type: 'button', class: 'btn', style: 'flex:1',
            text: d.direction === 'owedByMe' ? '＋ سدّد قسطًا' : '＋ سجّل تحصيلًا',
            onclick: function () { UI.closeSheet(true); setTimeout(function () { paymentSheet(d.id); }, 300); }
          }, actions);
        }
        h('button', {
          type: 'button', class: 'btn ghost', style: 'flex:1', text: '✏️ تعديل',
          onclick: function () { UI.closeSheet(true); setTimeout(function () { debtSheet(d.id); }, 300); }
        }, actions);

        h('p', { class: 'section-label', text: 'الأقساط المسدّدة' }, body);
        var card = h('div', { class: 'card flush' }, body);
        var pays = (d.payments || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        if (!pays.length) {
          UI.empty(card, { icon: '💸', title: 'لا أقساط بعد' });
        } else {
          var ul = h('ul', { class: 'rows' }, card);
          pays.forEach(function (p) {
            var li = h('li', { class: 'row' }, ul);
            h('span', { class: 'avatar', text: '✔️', 'aria-hidden': 'true' }, li);
            var b = h('span', { class: 'body' }, li);
            h('span', { class: 't', text: Fmt.money(p.amount) }, b);
            h('span', { class: 's', text: Fmt.shortDate(p.date) + (p.note ? ' · ' + p.note : '') }, b);
            var del = h('button', {
              type: 'button', class: 'icon-btn', 'aria-label': 'حذف القسط',
              onclick: function () {
                UI.confirm({
                  title: 'حذف القسط؟',
                  message: p.txId ? 'ستُحذف أيضًا حركته المالية من الرصيد.' : '',
                  ok: 'حذف', danger: true
                }).then(function (yes) {
                  if (!yes) return;
                  DB.deletePayment(d.id, p.id, true);
                  UI.closeSheet(true);
                  setTimeout(function () { debtDetailSheet(d.id); }, 300);
                });
              }
            }, li);
            del.appendChild(UI.icon('i-trash'));
          });
        }
      }
    });
  }

  function paymentSheet(debtId) {
    var d = DB.debt(debtId);
    if (!d) return;
    var rem = DB.debtRemaining(d);

    UI.openSheet({
      title: d.direction === 'owedByMe' ? 'سداد قسط لـ ' + d.person : 'تحصيل من ' + d.person,
      action: 'حفظ',
      build: function (body) {
        h('p', {
          class: 'section-label', style: 'margin-top:0',
          text: 'المتبقي ' + Fmt.money(rem)
        }, body);

        var amount = UI.amountField(body, { label: 'مبلغ القسط', value: rem });
        var date = UI.field(body, { label: 'التاريخ', type: 'date', value: Fmt.today() });
        var account = UI.field(body, {
          label: 'الحساب', type: 'select', value: d.accountId || DB.defaultAccountId(),
          options: DB.accounts().map(function (a) { return { value: a.id, label: a.icon + ' ' + a.name }; })
        });
        var note = UI.field(body, { label: 'ملاحظة', value: '', placeholder: 'اختياري' });
        var affects = UI.toggle(body, {
          label: 'اخصم المبلغ من الرصيد',
          hint: d.direction === 'owedByMe'
            ? 'يُسجَّل كمصروف لأنك دفعت المال.'
            : 'يُسجَّل كدخل لأنك استلمت المال.',
          checked: true
        });
        affects.style.borderTop = '0';
        affects.style.padding = '12px 0';

        sheetSave = function () {
          var amt = Fmt.parseAmount(amount.input.value);
          if (!(amt > 0)) { amount.setError('أدخل مبلغًا أكبر من صفر'); return; }
          if (amt > rem + 0.001) {
            amount.setError('المبلغ أكبر من المتبقي (' + Fmt.money(rem) + ')');
            return;
          }
          DB.addPayment(d.id, {
            amount: amt,
            date: date.input.value || Fmt.today(),
            note: note.input.value,
            accountId: account.input.value,
            affectsBalance: affects.input.checked
          });
          UI.closeSheet();
          UI.toast('تم تسجيل القسط');
        };
      },
      onAction: function () { if (sheetSave) sheetSave(); }
    });
  }

  /* ======================================================================
     نماذج: الأهداف والفئات والحسابات والمتكررة
     ====================================================================== */

  function emojiPicker(parent, label, value) {
    var wrap = h('div', { class: 'field' }, parent);
    h('label', { text: label }, wrap);
    var grid = h('div', { class: 'picker-grid', style: 'grid-template-columns:repeat(auto-fill,minmax(52px,1fr))' }, wrap);
    var selected = value || EMOJIS[0];
    var btns = [];
    EMOJIS.forEach(function (e) {
      var b = h('button', {
        type: 'button', 'aria-pressed': e === selected ? 'true' : 'false',
        'aria-label': 'رمز ' + e, style: 'min-height:52px',
        onclick: function () {
          selected = e;
          btns.forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.e === selected ? 'true' : 'false'); });
        },
        dataset: { e: e }
      }, grid);
      h('span', { class: 'e', text: e }, b);
      btns.push(b);
    });
    wrap.value = function () { return selected; };
    return wrap;
  }

  function goalSheet(goalId) {
    var g = goalId ? DB.goal(goalId) : null;
    UI.openSheet({
      title: g ? 'تعديل الهدف' : 'هدف ادخار جديد',
      action: 'حفظ',
      build: function (body) {
        var name = UI.field(body, {
          label: 'اسم الهدف', placeholder: 'مثال: شراء سيارة',
          value: g ? g.name : '', error: 'اكتب اسم الهدف'
        });
        var target = UI.amountField(body, { label: 'المبلغ المستهدف', value: g ? g.target : '' });
        var deadline = UI.field(body, {
          label: 'الموعد المستهدف (اختياري)', type: 'date',
          value: g && g.deadline ? g.deadline : ''
        });
        var ico = emojiPicker(body, 'الرمز', g ? g.icon : '🎯');
        var note = UI.field(body, { label: 'ملاحظة', type: 'textarea', value: g ? g.note : '' });

        if (g) {
          h('button', {
            type: 'button', class: 'btn danger', text: '🗑️ حذف الهدف',
            onclick: function () {
              UI.confirm({
                title: 'حذف الهدف؟',
                message: 'تبقى حركات الادخار في سجلّك لكن بلا هدف مرتبط.',
                ok: 'حذف', danger: true
              }).then(function (yes) {
                if (!yes) return;
                DB.deleteGoal(g.id);
                UI.closeSheet();
                UI.toast('تم حذف الهدف');
              });
            }
          }, body);
        }

        sheetSave = function () {
          if (!name.input.value.trim()) { name.setError('اكتب اسم الهدف'); return; }
          var data = {
            name: name.input.value,
            target: Fmt.parseAmount(target.input.value) || 0,
            deadline: deadline.input.value || null,
            icon: ico.value(),
            note: note.input.value
          };
          if (g) { DB.updateGoal(g.id, data); UI.toast('تم تحديث الهدف'); }
          else { DB.addGoal(data); UI.toast('تمت إضافة الهدف'); }
          UI.closeSheet();
        };
      },
      onAction: function () { if (sheetSave) sheetSave(); }
    });
  }

  function categoriesListSheet(type) {
    var kind = type || 'expense';
    UI.openSheet({
      title: 'الفئات والميزانيات',
      cancelLabel: 'إغلاق',
      noAutofocus: true,
      build: function (body) {
        var segHost = h('div', null, body);
        var listHost = h('div', null, body);
        UI.segmented(segHost, [
          { value: 'expense', label: 'فئات المصروف' },
          { value: 'income', label: 'فئات الدخل' }
        ], kind, function (v) { kind = v; paint(); });
        paint();

        function paint() {
          clear(listHost);
          h('button', {
            type: 'button', class: 'btn', text: '＋ فئة جديدة',
            style: 'margin-bottom:14px',
            onclick: function () { UI.closeSheet(true); setTimeout(function () { categorySheet(null, kind); }, 300); }
          }, listHost);

          var card = h('div', { class: 'card flush' }, listHost);
          var ul = h('ul', { class: 'rows' }, card);
          DB.categories(kind).forEach(function (c) {
            var li = h('li', null, ul);
            var btn = h('button', {
              type: 'button', class: 'row',
              onclick: function () { UI.closeSheet(true); setTimeout(function () { categorySheet(c.id, kind); }, 300); }
            }, li);
            h('span', { class: 'avatar', text: c.icon, 'aria-hidden': 'true' }, btn);
            var b = h('span', { class: 'body' }, btn);
            h('span', { class: 't', text: c.name }, b);
            var used = DB.categoryUsage(c.id);
            h('span', {
              class: 's',
              text: (c.system ? 'فئة نظام · ' : '') +
                    (c.budget > 0 ? 'ميزانية ' + Fmt.money(c.budget) + ' · ' : '') +
                    Fmt.plural(used, 'حركة واحدة', 'حركتان', 'حركات', 'حركة')
            }, b);
            if (c.budget > 0) h('span', { class: 'amt', text: Fmt.num(c.budget) }, btn);
          });
        }
      }
    });
  }

  function categorySheet(catId, type) {
    var c = catId ? DB.category(catId) : null;
    var kind = c ? c.type : (type || 'expense');

    UI.openSheet({
      title: c ? 'تعديل الفئة' : 'فئة جديدة',
      action: 'حفظ',
      build: function (body) {
        var name = UI.field(body, {
          label: 'اسم الفئة', value: c ? c.name : '', error: 'اكتب اسم الفئة'
        });
        var ico = emojiPicker(body, 'الرمز', c ? c.icon : '📌');
        var budget = null;
        if (kind === 'expense') {
          budget = UI.amountField(body, {
            label: 'سقف شهري للميزانية (اختياري)',
            value: c && c.budget ? c.budget : ''
          });
          h('p', {
            class: 'hint', style: 'margin:-8px 0 14px;font-size:12px;color:var(--text-muted)',
            text: 'اتركه فارغًا إن لم ترد تحديد سقف. عند تجاوزه يتحوّل الشريط إلى الأحمر.'
          }, body);
        }

        if (c && !c.system) {
          h('button', {
            type: 'button', class: 'btn danger', text: '🗑️ حذف الفئة',
            onclick: function () {
              var used = DB.categoryUsage(c.id);
              if (used > 0) {
                UI.confirm({
                  title: 'الفئة مستعملة',
                  message: 'فيها ' + Fmt.digits(used) + ' حركة. احذف الحركات أو انقلها لفئة أخرى أولًا.',
                  ok: 'حسنًا', cancel: 'إلغاء'
                });
                return;
              }
              UI.confirm({ title: 'حذف الفئة؟', ok: 'حذف', danger: true }).then(function (yes) {
                if (!yes) return;
                DB.deleteCategory(c.id);
                UI.closeSheet();
                UI.toast('تم حذف الفئة');
              });
            }
          }, body);
        }

        sheetSave = function () {
          if (!name.input.value.trim()) { name.setError('اكتب اسم الفئة'); return; }
          var data = { name: name.input.value, icon: ico.value(), type: kind };
          if (budget) {
            var b = Fmt.parseAmount(budget.input.value);
            data.budget = isFinite(b) && b > 0 ? b : null;
          }
          if (c) { DB.updateCategory(c.id, data); UI.toast('تم تحديث الفئة'); }
          else { DB.addCategory(data); UI.toast('تمت إضافة الفئة'); }
          UI.closeSheet();
        };
      },
      onAction: function () { if (sheetSave) sheetSave(); }
    });
  }

  function accountsListSheet() {
    UI.openSheet({
      title: 'الحسابات والمحافظ',
      cancelLabel: 'إغلاق',
      noAutofocus: true,
      build: function (body) {
        h('button', {
          type: 'button', class: 'btn', text: '＋ حساب جديد', style: 'margin-bottom:14px',
          onclick: function () { UI.closeSheet(true); setTimeout(function () { accountSheet(null); }, 300); }
        }, body);

        var card = h('div', { class: 'card flush' }, body);
        var ul = h('ul', { class: 'rows' }, card);
        DB.accounts(true).forEach(function (a) {
          var li = h('li', null, ul);
          var btn = h('button', {
            type: 'button', class: 'row',
            onclick: function () { UI.closeSheet(true); setTimeout(function () { accountSheet(a.id); }, 300); }
          }, li);
          h('span', { class: 'avatar', text: a.icon, 'aria-hidden': 'true' }, btn);
          var b = h('span', { class: 'body' }, btn);
          h('span', { class: 't', text: a.name + (a.archived ? ' (مؤرشف)' : '') }, b);
          h('span', { class: 's', text: 'الرصيد الافتتاحي ' + Fmt.money(a.opening) }, b);
          var bal = DB.accountBalance(a.id);
          h('span', { class: 'amt ' + (bal >= 0 ? 'in' : 'out'), text: Fmt.num(bal) }, btn);
        });
      }
    });
  }

  function accountSheet(accId) {
    var a = accId ? DB.account(accId) : null;
    UI.openSheet({
      title: a ? 'تعديل الحساب' : 'حساب جديد',
      action: 'حفظ',
      build: function (body) {
        var name = UI.field(body, {
          label: 'اسم الحساب', placeholder: 'مثال: بنكيلي', value: a ? a.name : '',
          error: 'اكتب اسم الحساب'
        });
        var opening = UI.amountField(body, {
          label: 'الرصيد الافتتاحي', value: a ? a.opening : 0
        });
        h('p', {
          class: 'hint', style: 'margin:-8px 0 14px;font-size:12px;color:var(--text-muted)',
          text: 'المبلغ الموجود في هذا الحساب قبل أن تبدأ التسجيل في التطبيق.'
        }, body);
        var ico = emojiPicker(body, 'الرمز', a ? a.icon : '💳');

        if (a) {
          h('button', {
            type: 'button', class: 'btn danger', text: '🗑️ حذف الحساب',
            onclick: function () {
              UI.confirm({
                title: 'حذف الحساب؟',
                message: 'إن كانت فيه حركات فسيُؤرشف بدل حذفه حتى لا تفقد سجلّك.',
                ok: 'حذف', danger: true
              }).then(function (yes) {
                if (!yes) return;
                if (DB.deleteAccount(a.id)) { UI.closeSheet(); UI.toast('تم'); }
                else UI.toast('لا يمكن حذف الحساب الأخير');
              });
            }
          }, body);
        }

        sheetSave = function () {
          if (!name.input.value.trim()) { name.setError('اكتب اسم الحساب'); return; }
          var data = {
            name: name.input.value,
            opening: Fmt.parseAmount(opening.input.value) || 0,
            icon: ico.value()
          };
          if (a) { DB.updateAccount(a.id, data); UI.toast('تم تحديث الحساب'); }
          else { DB.addAccount(data); UI.toast('تمت إضافة الحساب'); }
          UI.closeSheet();
        };
      },
      onAction: function () { if (sheetSave) sheetSave(); }
    });
  }

  function recurringListSheet() {
    UI.openSheet({
      title: 'الراتب والحركات المتكررة',
      cancelLabel: 'إغلاق',
      noAutofocus: true,
      build: function (body) {
        h('p', {
          class: 'section-label', style: 'margin-top:0',
          text: 'تُسجَّل هذه الحركات تلقائيًا كل شهر في اليوم الذي تحدّده — حتى لو لم تفتح التطبيق، تُستدرك عند أول فتح.'
        }, body);

        h('button', {
          type: 'button', class: 'btn', text: '＋ إضافة راتب أو فاتورة', style: 'margin-bottom:14px',
          onclick: function () { UI.closeSheet(true); setTimeout(function () { recurringSheet(null); }, 300); }
        }, body);

        var list = DB.recurring();
        var card = h('div', { class: 'card flush' }, body);
        if (!list.length) {
          UI.empty(card, {
            icon: '🔁', title: 'لا حركات متكررة',
            sub: 'أضف راتبك الشهري ليُسجَّل تلقائيًا كل شهر.'
          });
          return;
        }
        var ul = h('ul', { class: 'rows' }, card);
        list.forEach(function (r) {
          var li = h('li', null, ul);
          var btn = h('button', {
            type: 'button', class: 'row',
            onclick: function () { UI.closeSheet(true); setTimeout(function () { recurringSheet(r.id); }, 300); }
          }, li);
          h('span', {
            class: 'avatar', 'aria-hidden': 'true',
            text: r.type === 'income' ? '💼' : DB.categoryIcon(r.categoryId)
          }, btn);
          var b = h('span', { class: 'body' }, btn);
          h('span', { class: 't', text: r.title + (r.active ? '' : ' (موقوف)') }, b);
          h('span', {
            class: 's',
            text: 'كل شهر يوم ' + Fmt.digits(r.day) + ' · ' + DB.categoryLabel(r.categoryId)
          }, b);
          h('span', {
            class: 'amt ' + (r.type === 'income' ? 'in' : 'out'),
            text: Fmt.signedNum(r.amount, r.type)
          }, btn);
        });
      }
    });
  }

  function recurringSheet(recId) {
    var r = recId ? DB.recurringItem(recId) : null;
    var kind = r ? r.type : 'income';

    UI.openSheet({
      title: r ? 'تعديل الحركة المتكررة' : 'راتب أو فاتورة متكررة',
      action: 'حفظ',
      build: function (body) {
        var catHost;
        UI.segmented(body, [
          { value: 'income', label: 'دخل (راتب)' },
          { value: 'expense', label: 'مصروف (فاتورة)' }
        ], kind, function (v) { kind = v; paintCats(); });

        var title = UI.field(body, {
          label: 'الاسم', placeholder: 'مثال: الراتب الشهري',
          value: r ? r.title : '', error: 'اكتب الاسم'
        });
        var amount = UI.amountField(body, { label: 'المبلغ', value: r ? r.amount : '' });
        catHost = h('div', null, body);
        var catRef = null;
        paintCats();

        var day = UI.field(body, {
          label: 'يوم الشهر', type: 'number', min: 1, max: 31, inputmode: 'numeric',
          value: r ? r.day : 1,
          hint: 'إن اخترت يومًا لا يوجد في شهر قصير (مثل ٣١)، يُسجَّل في آخر يوم من ذلك الشهر.'
        });
        var account = UI.field(body, {
          label: 'الحساب', type: 'select', value: r ? r.accountId : DB.defaultAccountId(),
          options: DB.accounts().map(function (a) { return { value: a.id, label: a.icon + ' ' + a.name }; })
        });
        var note = UI.field(body, { label: 'ملاحظة', value: r ? r.note : '' });

        var active = UI.toggle(body, {
          label: 'مُفعّلة', hint: 'أوقفها مؤقتًا بدون حذفها.',
          checked: r ? r.active : true
        });
        active.style.borderTop = '0';
        active.style.padding = '12px 0';

        if (r) {
          h('button', {
            type: 'button', class: 'btn danger', text: '🗑️ حذف الحركة المتكررة',
            onclick: function () {
              UI.confirm({
                title: 'حذف المتكررة؟',
                message: 'تبقى الحركات التي سُجّلت سابقًا في سجلّك.',
                ok: 'حذف', danger: true
              }).then(function (yes) {
                if (!yes) return;
                DB.deleteRecurring(r.id);
                UI.closeSheet();
                UI.toast('تم الحذف');
              });
            }
          }, body);
        }

        function paintCats() {
          clear(catHost);
          var items = DB.categories(kind, { noSystem: true }).map(function (c) {
            return { id: c.id, name: c.name, icon: c.icon };
          });
          var current = (r && r.categoryId && DB.category(r.categoryId) && DB.category(r.categoryId).type === kind)
            ? r.categoryId : (items[0] && items[0].id);
          catRef = UI.pickerGrid(catHost, { label: 'الفئة', items: items, value: current });
        }

        sheetSave = function () {
          var ok = true;
          if (!title.input.value.trim()) { title.setError('اكتب الاسم'); ok = false; }
          var amt = Fmt.parseAmount(amount.input.value);
          if (!(amt > 0)) { amount.setError('أدخل مبلغًا أكبر من صفر'); ok = false; }
          if (!ok) return;

          var data = {
            title: title.input.value,
            type: kind,
            amount: amt,
            categoryId: catRef.value(),
            accountId: account.input.value,
            day: Number(day.input.value) || 1,
            note: note.input.value,
            active: active.input.checked
          };
          if (r) DB.updateRecurring(r.id, data);
          else DB.addRecurring(data);
          var posted = DB.runRecurring();
          UI.closeSheet();
          UI.toast(posted.length
            ? 'تم الحفظ وسُجّلت ' + Fmt.plural(posted.length, 'حركة واحدة', 'حركتان', 'حركات', 'حركة')
            : 'تم الحفظ');
        };
      },
      onAction: function () { if (sheetSave) sheetSave(); }
    });
  }

  function currencySheet() {
    UI.openSheet({
      title: 'العملة',
      cancelLabel: 'إغلاق',
      noAutofocus: true,
      build: function (body) {
        var card = h('div', { class: 'card flush' }, body);
        var ul = h('ul', { class: 'rows' }, card);
        var current = DB.settings().currency;
        Object.keys(Fmt.CURRENCIES).forEach(function (code) {
          var c = Fmt.CURRENCIES[code];
          var li = h('li', null, ul);
          var btn = h('button', {
            type: 'button', class: 'row',
            onclick: function () {
              DB.setSetting('currency', code);
              DB.setSetting('decimals', c.decimals);
              UI.closeSheet();
              UI.toast('العملة الآن: ' + c.name);
            }
          }, li);
          h('span', { class: 'avatar', text: c.symbol.slice(0, 3), 'aria-hidden': 'true' }, btn);
          var b = h('span', { class: 'body' }, btn);
          h('span', { class: 't', text: c.name }, b);
          h('span', { class: 's', text: code + ' · ' + c.symbol }, b);
          if (code === current) h('span', { class: 'amt in', text: '✓' }, btn);
        });
      }
    });
  }

  function importSheet() {
    UI.openSheet({
      title: 'استيراد نسخة',
      cancelLabel: 'إغلاق',
      noAutofocus: true,
      build: function (body) {
        h('p', {
          class: 'section-label', style: 'margin-top:0',
          text: 'اختر ملف JSON صدّرته من هذا التطبيق.'
        }, body);

        function run(mode) {
          UI.pickFile().then(function (file) {
            if (!file) return;
            var res = DB.importData(file.text, mode);
            if (!res.ok) { UI.toast(res.error); return; }
            applyTheme();
            UI.closeSheet();
            go('home');
            UI.toast(mode === 'merge' ? 'تم دمج النسخة' : 'تم استيراد النسخة');
          });
        }

        h('button', {
          type: 'button', class: 'btn', text: '🔄 دمج مع بياناتي الحالية',
          style: 'margin-bottom:10px', onclick: function () { run('merge'); }
        }, body);
        h('p', {
          style: 'margin:0 0 18px;font-size:12.5px;color:var(--text-muted)',
          text: 'يُضيف ما ليس موجودًا ولا يحذف شيئًا.'
        }, body);

        h('button', {
          type: 'button', class: 'btn danger', text: '⚠️ استبدال كل بياناتي',
          onclick: function () {
            UI.confirm({
              title: 'استبدال البيانات؟',
              message: 'سيُحذف كل ما في التطبيق الآن ويُستبدل بمحتوى الملف.',
              ok: 'استبدال', danger: true
            }).then(function (yes) { if (yes) run('replace'); });
          }
        }, body);
      }
    });
  }

  function exportCsv() {
    var rows = [['التاريخ', 'النوع', 'المبلغ', 'الفئة', 'الهدف', 'الحساب', 'ملاحظة']];
    var typeName = { income: 'دخل', expense: 'مصروف', saving: 'ادخار', withdraw: 'سحب من الادخار' };
    DB.filterTx({}).forEach(function (t) {
      var g = t.goalId ? DB.goal(t.goalId) : null;
      rows.push([
        t.date, typeName[t.type] || t.type, String(t.amount),
        t.categoryId ? DB.categoryLabel(t.categoryId) : '',
        g ? g.name : '', DB.accountLabel(t.accountId), t.note || ''
      ]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell).replace(/"/g, '""');
        return /[",\n;]/.test(s) ? '"' + s + '"' : s;
      }).join(',');
    }).join('\r\n');
    // BOM حتى يفتح Excel العربية بشكل صحيح
    UI.download('masarif-' + Fmt.today() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
    UI.toast('تم تصدير ' + Fmt.digits(rows.length - 1) + ' حركة');
  }

  /* ======================================================================
     المظهر والتشغيل
     ====================================================================== */

  function applyTheme() {
    var theme = DB.settings().theme;
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    // نوفّق لون شريط الحالة في iOS مع الخلفية الفعلية
    var dark = theme === 'dark' ||
      (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.remove(); });
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = dark ? '#000000' : '#f2f2f7';
    document.head.appendChild(meta);
  }

  function boot() {
    DB.load();
    UI.initSheet();
    UI.lock.init();
    applyTheme();

    document.querySelectorAll('.tabbar button[data-screen]').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.screen); });
    });
    document.getElementById('fab').addEventListener('click', function () { txSheet(null, 'expense'); });
    document.getElementById('moreBtn').addEventListener('click', function () { go('more'); });
    document.getElementById('themeBtn').addEventListener('click', function () {
      var t = DB.settings().theme;
      var next = t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto';
      DB.setSetting('theme', next);
      applyTheme();
      UI.toast(next === 'auto' ? 'المظهر: حسب النظام' : next === 'light' ? 'المظهر: نهاري' : 'المظهر: ليلي');
    });

    // أي تغيير في البيانات يُعيد رسم الشاشة الحالية
    DB.on(function (event) {
      if (event === 'storage-error') {
        UI.toast('تعذّر الحفظ على هذا الجهاز — تأكّد أنك لا تستخدم التصفّح الخاص.');
        return;
      }
      render();
    });

    // استدراك الحركات المتكررة المستحقة
    var posted = DB.runRecurring();

    // اختصارات الشاشة الرئيسية في iOS تفتح رابطًا مثل ‎?add=expense‎
    var params = new URLSearchParams(location.search);
    var startScreen = params.get('screen');
    var quickAdd = params.get('add');

    function afterUnlock() {
      go(SCREENS[startScreen] ? startScreen : 'home');
      if (quickAdd === 'expense' || quickAdd === 'income') {
        setTimeout(function () { txSheet(null, quickAdd); }, 320);
      }
      if (location.search) {
        history.replaceState(null, '', location.pathname);
      }
    }

    var s = DB.settings();
    if (s.lockEnabled && s.pin) {
      UI.lock.show('verify', afterUnlock);
    } else {
      afterUnlock();
    }

    if (posted.length) {
      setTimeout(function () {
        UI.toast('سُجّلت ' + Fmt.plural(posted.length, 'حركة متكررة', 'حركتان متكررتان', 'حركات متكررة', 'حركة متكررة') + ' تلقائيًا');
      }, 700);
    }

    // لا نترك حفظًا مؤجَّلًا عند إغلاق الصفحة أو تصغير التطبيق
    window.addEventListener('pagehide', function () { DB.flush(); });

    // إعادة القفل عند العودة إلى التطبيق بعد غياب طويل
    var hiddenAt = null;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { DB.flush(); hiddenAt = Date.now(); return; }
      var away = hiddenAt ? Date.now() - hiddenAt : 0;
      if (DB.settings().lockEnabled && DB.settings().pin && away > 60000 && !UI.lock.isOpen()) {
        UI.lock.show('verify');
      }
    });

    // تسجيل عامل الخدمة للعمل دون إنترنت (يحتاج http/https لا file://)
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* التطبيق يعمل بدونه */ });
      });
    }
  }

  return { boot: boot, go: go, render: render, txSheet: txSheet, applyTheme: applyTheme };
})();

document.addEventListener('DOMContentLoaded', function () { App.boot(); });
