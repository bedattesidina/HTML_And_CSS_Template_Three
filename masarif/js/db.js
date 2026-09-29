/* ==========================================================================
   db.js — نموذج البيانات والتخزين المحلي
   كل شيء يُحفظ في localStorage على جهاز المستخدم. لا خادم، لا حساب، لا إنترنت.
   ========================================================================== */
'use strict';

var DB = (function () {

  var KEY = 'masarif.store.v1';
  var SCHEMA = 1;

  var store = null;
  var listeners = [];

  /* ----- مساعدات ----- */

  function uid(prefix) {
    return (prefix || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  /** يبني مفتاح تاريخ مبطَّنًا بصفر: dayKey('2026-09', 3) === '2026-09-03' */
  function dayKey(monthKey, day) {
    return monthKey + '-' + (day < 10 ? '0' : '') + day;
  }

  /** يُصحّح صيغة تاريخ قد تصل بلا تبطين، حتى تبقى المقارنة النصية سليمة. */
  function normalizeDate(key) {
    var p = String(key || '').split('-');
    if (p.length !== 3) return Fmt.today();
    var y = p[0], m = p[1], d = p[2];
    if (m.length < 2) m = '0' + m;
    if (d.length < 2) d = '0' + d;
    return y + '-' + m + '-' + d;
  }

  function sum(list, pick) {
    var t = 0;
    for (var i = 0; i < list.length; i++) t += Number(pick ? pick(list[i]) : list[i]) || 0;
    return t;
  }

  /* ----- الفئات والحسابات الافتراضية ----- */

  /* فئات النظام مرتبطة بحركات الديون والمدخرات: لا تُحذف ولا يُغيَّر نوعها. */
  var SYSTEM_CATEGORIES = [
    { id: 'sys_debt_in',  name: 'دين استلمته',   type: 'income',  icon: '📥', system: true },
    { id: 'sys_collect',  name: 'تحصيل دين لي',  type: 'income',  icon: '🤝', system: true },
    { id: 'sys_debt_pay', name: 'سداد دين عليّ',  type: 'expense', icon: '📤', system: true },
    { id: 'sys_lend',     name: 'إقراض شخص',     type: 'expense', icon: '💸', system: true }
  ];

  var DEFAULT_CATEGORIES = [
    { name: 'طعام وشراب',      type: 'expense', icon: '🍲' },
    { name: 'بقالة ومشتريات',  type: 'expense', icon: '🛒' },
    { name: 'مقاهي ومطاعم',    type: 'expense', icon: '☕' },
    { name: 'نقل ومواصلات',    type: 'expense', icon: '🚗' },
    { name: 'إيجار ومنزل',     type: 'expense', icon: '🏠' },
    { name: 'فواتير وخدمات',   type: 'expense', icon: '💡' },
    { name: 'هاتف وإنترنت',    type: 'expense', icon: '📱' },
    { name: 'صحة وأدوية',      type: 'expense', icon: '🏥' },
    { name: 'تعليم',           type: 'expense', icon: '🎓' },
    { name: 'ملابس',           type: 'expense', icon: '👕' },
    { name: 'صدقة وزكاة',      type: 'expense', icon: '🤲' },
    { name: 'هدايا ومناسبات',  type: 'expense', icon: '🎁' },
    { name: 'سفر',             type: 'expense', icon: '✈️' },
    { name: 'صيانة وإصلاح',    type: 'expense', icon: '🔧' },
    { name: 'مصروف آخر',       type: 'expense', icon: '📦' },

    { name: 'راتب',            type: 'income',  icon: '💼' },
    { name: 'مكافأة وعلاوة',   type: 'income',  icon: '🧾' },
    { name: 'عمل حر',          type: 'income',  icon: '🛠️' },
    { name: 'أرباح واستثمار',  type: 'income',  icon: '📈' },
    { name: 'إيجار مستلم',     type: 'income',  icon: '🏠' },
    { name: 'هدية',            type: 'income',  icon: '🎁' },
    { name: 'دخل آخر',         type: 'income',  icon: '💰' }
  ];

  var DEFAULT_ACCOUNTS = [
    { name: 'نقداً',            icon: '💵', opening: 0 },
    { name: 'حساب بنكي',        icon: '🏦', opening: 0 },
    { name: 'محفظة الهاتف',     icon: '📲', opening: 0 }
  ];

  function freshStore() {
    var cats = SYSTEM_CATEGORIES.map(function (c) { return Object.assign({ budget: null }, c); });
    DEFAULT_CATEGORIES.forEach(function (c, i) {
      cats.push({ id: uid('cat'), name: c.name, type: c.type, icon: c.icon, budget: null, order: i });
    });
    var accounts = DEFAULT_ACCOUNTS.map(function (a) {
      return { id: uid('acc'), name: a.name, icon: a.icon, opening: a.opening, archived: false };
    });
    return {
      schema: SCHEMA,
      createdAt: new Date().toISOString(),
      settings: {
        name: '',
        currency: 'MRU',
        decimals: 0,
        digits: 'latin',
        calendar: 'greg',
        theme: 'auto',
        monthStartDay: 1,
        pin: null,
        lockEnabled: false,
        lastRecurringRun: null
      },
      categories: cats,
      accounts: accounts,
      tx: [],
      debts: [],
      goals: [],
      recurring: []
    };
  }

  /* ----- التحميل والحفظ ----- */

  function safeParse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function migrate(data) {
    if (!data || typeof data !== 'object') return freshStore();
    var base = freshStore();
    // نُبقي البيانات ونُكمل الحقول الناقصة بقيم افتراضية
    data.settings = Object.assign({}, base.settings, data.settings || {});
    ['categories', 'accounts', 'tx', 'debts', 'goals', 'recurring'].forEach(function (k) {
      if (!Array.isArray(data[k])) data[k] = [];
    });
    // نضمن وجود فئات النظام دائمًا
    SYSTEM_CATEGORIES.forEach(function (sc) {
      if (!data.categories.some(function (c) { return c.id === sc.id; })) {
        data.categories.push(Object.assign({ budget: null }, sc));
      }
    });
    if (!data.accounts.length) data.accounts = base.accounts;
    data.schema = SCHEMA;
    return data;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    store = raw ? migrate(safeParse(raw)) : freshStore();
    Fmt.setConfig(store.settings);
    return store;
  }

  var saveTimer = null;
  function save(immediate) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    function write() {
      try {
        localStorage.setItem(KEY, JSON.stringify(store));
      } catch (e) {
        // الحصة ممتلئة أو التخزين محظور (تصفّح خاص) — نُبلّغ الواجهة
        emit('storage-error', e);
      }
    }
    if (immediate) write(); else saveTimer = setTimeout(write, 120);
  }

  /** يكتب فورًا أي حفظ مؤجَّل — يُستدعى قبل إغلاق الصفحة حتى لا يضيع تعديل. */
  function flush() { if (saveTimer) save(true); }

  function commit(event) {
    save();
    emit(event || 'change');
  }

  /* ----- الاشتراك في التغييرات ----- */

  function on(fn) { listeners.push(fn); return function () { off(fn); }; }
  function off(fn) { listeners = listeners.filter(function (f) { return f !== fn; }); }
  function emit(event, payload) {
    listeners.forEach(function (fn) { try { fn(event, payload); } catch (e) { console.error(e); } });
  }

  /* ----- الإعدادات ----- */

  function settings() { return store.settings; }

  function setSetting(key, value) {
    store.settings[key] = value;
    Fmt.setConfig(store.settings);
    commit('settings');
  }

  /* ----- الفئات ----- */

  /** categories('expense', { noSystem:true }) يُخفي فئات الديون التلقائية. */
  function categories(type, opts) {
    var list = store.categories.filter(function (c) {
      if (type && c.type !== type) return false;
      if (opts && opts.noSystem && c.system) return false;
      return true;
    });
    return list.sort(function (a, b) {
      if (!!a.system !== !!b.system) return a.system ? 1 : -1;   // فئات النظام في الآخر
      return (a.order || 0) - (b.order || 0);
    });
  }

  function category(id) {
    return store.categories.find(function (c) { return c.id === id; }) || null;
  }

  function categoryLabel(id) {
    var c = category(id);
    return c ? c.name : 'بدون فئة';
  }

  function categoryIcon(id) {
    var c = category(id);
    return c ? c.icon : '❔';
  }

  function addCategory(data) {
    var c = {
      id: uid('cat'),
      name: String(data.name || '').trim() || 'فئة جديدة',
      type: data.type === 'income' ? 'income' : 'expense',
      icon: data.icon || '📌',
      budget: data.budget != null && data.budget !== '' ? Number(data.budget) : null,
      order: store.categories.length
    };
    store.categories.push(c);
    commit('categories');
    return c;
  }

  function updateCategory(id, patch) {
    var c = category(id);
    if (!c) return null;
    if (patch.name !== undefined) c.name = String(patch.name).trim() || c.name;
    if (patch.icon !== undefined) c.icon = patch.icon;
    if (patch.budget !== undefined) {
      c.budget = patch.budget === '' || patch.budget == null ? null : Number(patch.budget);
    }
    if (patch.type !== undefined && !c.system) c.type = patch.type;
    commit('categories');
    return c;
  }

  /** لا نحذف فئة مستعملة حتى لا تصبح المعاملات بلا مرجع — نُبلّغ المتصل بالعدد. */
  function categoryUsage(id) {
    return store.tx.filter(function (t) { return t.categoryId === id; }).length;
  }

  function deleteCategory(id, moveToId) {
    var c = category(id);
    if (!c || c.system) return false;
    if (moveToId) {
      store.tx.forEach(function (t) { if (t.categoryId === id) t.categoryId = moveToId; });
      store.recurring.forEach(function (r) { if (r.categoryId === id) r.categoryId = moveToId; });
    } else if (categoryUsage(id) > 0) {
      return false;
    }
    store.categories = store.categories.filter(function (x) { return x.id !== id; });
    commit('categories');
    return true;
  }

  /* ----- الحسابات ----- */

  function accounts(includeArchived) {
    return store.accounts.filter(function (a) { return includeArchived || !a.archived; });
  }

  function account(id) {
    return store.accounts.find(function (a) { return a.id === id; }) || null;
  }

  function accountLabel(id) {
    var a = account(id);
    return a ? a.name : '—';
  }

  function addAccount(data) {
    var a = {
      id: uid('acc'),
      name: String(data.name || '').trim() || 'حساب',
      icon: data.icon || '💳',
      opening: Number(data.opening) || 0,
      archived: false
    };
    store.accounts.push(a);
    commit('accounts');
    return a;
  }

  function updateAccount(id, patch) {
    var a = account(id);
    if (!a) return null;
    if (patch.name !== undefined) a.name = String(patch.name).trim() || a.name;
    if (patch.icon !== undefined) a.icon = patch.icon;
    if (patch.opening !== undefined) a.opening = Number(patch.opening) || 0;
    if (patch.archived !== undefined) a.archived = !!patch.archived;
    commit('accounts');
    return a;
  }

  function deleteAccount(id) {
    if (accounts().length <= 1) return false;          // يبقى حساب واحد على الأقل
    if (store.tx.some(function (t) { return t.accountId === id; })) {
      updateAccount(id, { archived: true });           // مستعمل: نؤرشفه بدل حذفه
      return true;
    }
    store.accounts = store.accounts.filter(function (a) { return a.id !== id; });
    commit('accounts');
    return true;
  }

  function defaultAccountId() {
    var a = accounts()[0];
    return a ? a.id : null;
  }

  /* ----- المعاملات -----
     الأنواع: income دخل، expense مصروف، saving تحويل إلى هدف ادخار،
     withdraw سحب من هدف ادخار. */

  var IN_TYPES = { income: 1, withdraw: 1 };

  function signOf(type) { return IN_TYPES[type] ? 1 : -1; }

  function transactions() { return store.tx; }

  function tx(id) {
    return store.tx.find(function (t) { return t.id === id; }) || null;
  }

  function normalizeTx(data) {
    var type = ['income', 'expense', 'saving', 'withdraw'].indexOf(data.type) >= 0 ? data.type : 'expense';
    return {
      type: type,
      amount: Math.abs(Number(data.amount) || 0),
      categoryId: (type === 'income' || type === 'expense') ? (data.categoryId || null) : null,
      goalId: (type === 'saving' || type === 'withdraw') ? (data.goalId || null) : null,
      accountId: data.accountId || defaultAccountId(),
      date: normalizeDate(data.date || Fmt.today()),
      note: String(data.note || '').trim(),
      debtId: data.debtId || null,
      recurringId: data.recurringId || null
    };
  }

  function addTx(data, opts) {
    var t = Object.assign({ id: uid('tx'), createdAt: new Date().toISOString() }, normalizeTx(data));
    store.tx.push(t);
    if (!(opts && opts.silent)) commit('tx');
    return t;
  }

  function updateTx(id, patch) {
    var t = tx(id);
    if (!t) return null;
    Object.assign(t, normalizeTx(Object.assign({}, t, patch)));
    commit('tx');
    return t;
  }

  function deleteTx(id) {
    var t = tx(id);
    if (!t) return false;
    store.tx = store.tx.filter(function (x) { return x.id !== id; });
    // إن كانت الحركة مرتبطة بقسط دين، نفصل الربط حتى لا يبقى القسط معلّقًا
    if (t.debtId) {
      store.debts.forEach(function (d) {
        (d.payments || []).forEach(function (p) { if (p.txId === id) p.txId = null; });
        if (d.txId === id) d.txId = null;
      });
    }
    commit('tx');
    return true;
  }

  /* ----- الاستعلامات والحسابات ----- */

  /** يرتّب تنازليًا بالتاريخ ثم بوقت الإدخال. */
  function byDateDesc(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (a.createdAt || '') < (b.createdAt || '') ? 1 : -1;
  }

  function inMonth(list, mKey) {
    return list.filter(function (t) { return Fmt.monthKey(t.date) === mKey; });
  }

  function filterTx(q) {
    q = q || {};
    var list = store.tx.slice();
    if (q.month) list = inMonth(list, q.month);
    if (q.from) list = list.filter(function (t) { return t.date >= q.from; });
    if (q.to) list = list.filter(function (t) { return t.date <= q.to; });
    if (q.type) list = list.filter(function (t) { return t.type === q.type; });
    if (q.types) list = list.filter(function (t) { return q.types.indexOf(t.type) >= 0; });
    if (q.categoryId) list = list.filter(function (t) { return t.categoryId === q.categoryId; });
    if (q.accountId) list = list.filter(function (t) { return t.accountId === q.accountId; });
    if (q.goalId) list = list.filter(function (t) { return t.goalId === q.goalId; });
    if (q.search) {
      var s = String(q.search).trim().toLowerCase();
      if (s) {
        list = list.filter(function (t) {
          var hay = (t.note || '') + ' ' + categoryLabel(t.categoryId) + ' ' + accountLabel(t.accountId);
          return hay.toLowerCase().indexOf(s) >= 0 || String(t.amount).indexOf(s) >= 0;
        });
      }
    }
    return list.sort(byDateDesc);
  }

  /** الرصيد المتاح للصرف = أرصدة الافتتاح + الدخل والسحب − المصروف والادخار. */
  function balance() {
    var open = sum(store.accounts, function (a) { return a.opening; });
    var flow = sum(store.tx, function (t) { return signOf(t.type) * t.amount; });
    return open + flow;
  }

  function accountBalance(accId) {
    var a = account(accId);
    if (!a) return 0;
    var flow = sum(store.tx.filter(function (t) { return t.accountId === accId; }),
                   function (t) { return signOf(t.type) * t.amount; });
    return (a.opening || 0) + flow;
  }

  /** مجاميع شهر واحد: الدخل، المصروف، المدخر، والصافي. */
  function monthTotals(mKey) {
    var list = inMonth(store.tx, mKey);
    var income = 0, expense = 0, saving = 0, withdraw = 0;
    list.forEach(function (t) {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
      else if (t.type === 'saving') saving += t.amount;
      else if (t.type === 'withdraw') withdraw += t.amount;
    });
    return {
      month: mKey,
      income: income,
      expense: expense,
      saving: saving,
      withdraw: withdraw,
      net: income - expense,
      count: list.length
    };
  }

  /** تفصيل شهر حسب الفئة، مرتّبًا تنازليًا بالمبلغ. */
  function byCategory(mKey, type) {
    var list = inMonth(store.tx, mKey).filter(function (t) { return t.type === (type || 'expense'); });
    var map = {};
    list.forEach(function (t) {
      var k = t.categoryId || 'none';
      if (!map[k]) map[k] = { categoryId: t.categoryId, total: 0, count: 0 };
      map[k].total += t.amount;
      map[k].count++;
    });
    var total = sum(list, function (t) { return t.amount; });
    return Object.keys(map).map(function (k) {
      var r = map[k];
      r.name = categoryLabel(r.categoryId);
      r.icon = categoryIcon(r.categoryId);
      r.share = total ? r.total / total : 0;
      return r;
    }).sort(function (a, b) { return b.total - a.total; });
  }

  /** سلسلة آخر n شهر منتهية عند mKey — للأعمدة الشهرية. */
  function monthlySeries(mKey, n) {
    var out = [];
    for (var i = (n || 6) - 1; i >= 0; i--) out.push(monthTotals(Fmt.addMonths(mKey, -i)));
    return out;
  }

  /** حالة الميزانيات لشهر: لكل فئة لها سقف، المصروف والنسبة. */
  function budgets(mKey) {
    var spentByCat = {};
    inMonth(store.tx, mKey).forEach(function (t) {
      if (t.type !== 'expense' || !t.categoryId) return;
      spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount;
    });
    return store.categories
      .filter(function (c) { return c.type === 'expense' && c.budget > 0; })
      .map(function (c) {
        var spent = spentByCat[c.id] || 0;
        return {
          categoryId: c.id,
          name: c.name,
          icon: c.icon,
          budget: c.budget,
          spent: spent,
          left: c.budget - spent,
          ratio: c.budget > 0 ? spent / c.budget : 0
        };
      })
      .sort(function (a, b) { return b.ratio - a.ratio; });
  }

  /** كل الأشهر التي فيها حركة، تنازليًا — لمنتقي الشهر. */
  function activeMonths() {
    var set = {};
    store.tx.forEach(function (t) { set[Fmt.monthKey(t.date)] = 1; });
    set[Fmt.monthKeyOf(new Date())] = 1;
    return Object.keys(set).sort().reverse();
  }

  /* ----- أهداف الادخار ----- */

  function goals() { return store.goals; }

  function goal(id) {
    return store.goals.find(function (g) { return g.id === id; }) || null;
  }

  function addGoal(data) {
    var g = {
      id: uid('goal'),
      name: String(data.name || '').trim() || 'هدف ادخار',
      icon: data.icon || '🎯',
      target: Math.abs(Number(data.target) || 0),
      deadline: data.deadline || null,
      note: String(data.note || '').trim(),
      done: false,
      createdAt: new Date().toISOString()
    };
    store.goals.push(g);
    commit('goals');
    return g;
  }

  function updateGoal(id, patch) {
    var g = goal(id);
    if (!g) return null;
    if (patch.name !== undefined) g.name = String(patch.name).trim() || g.name;
    if (patch.icon !== undefined) g.icon = patch.icon;
    if (patch.target !== undefined) g.target = Math.abs(Number(patch.target) || 0);
    if (patch.deadline !== undefined) g.deadline = patch.deadline || null;
    if (patch.note !== undefined) g.note = String(patch.note).trim();
    if (patch.done !== undefined) g.done = !!patch.done;
    commit('goals');
    return g;
  }

  function deleteGoal(id) {
    // نُبقي الحركات ونفصل ربطها بالهدف حتى لا يختلّ الرصيد
    store.tx.forEach(function (t) { if (t.goalId === id) t.goalId = null; });
    store.goals = store.goals.filter(function (g) { return g.id !== id; });
    commit('goals');
    return true;
  }

  function goalProgress(id) {
    var g = goal(id);
    if (!g) return null;
    var saved = 0;
    store.tx.forEach(function (t) {
      if (t.goalId !== id) return;
      if (t.type === 'saving') saved += t.amount;
      else if (t.type === 'withdraw') saved -= t.amount;
    });
    return {
      goal: g,
      saved: saved,
      left: Math.max(0, g.target - saved),
      ratio: g.target > 0 ? saved / g.target : 0
    };
  }

  function savingsTotal() {
    var t = 0;
    store.tx.forEach(function (x) {
      if (x.type === 'saving') t += x.amount;
      else if (x.type === 'withdraw') t -= x.amount;
    });
    return t;
  }

  /* ----- الديون -----
     direction: owedByMe = دين عليّ، owedToMe = دين لي عند غيري. */

  function debts(filter) {
    var list = store.debts.slice();
    if (filter && filter.direction) {
      list = list.filter(function (d) { return d.direction === filter.direction; });
    }
    if (filter && filter.open) list = list.filter(function (d) { return !isDebtSettled(d); });
    return list.sort(function (a, b) {
      var sa = isDebtSettled(a) ? 1 : 0, sb = isDebtSettled(b) ? 1 : 0;
      if (sa !== sb) return sa - sb;                       // غير المسدّد أولًا
      var da = a.dueDate || '9999-99-99', db = b.dueDate || '9999-99-99';
      if (da !== db) return da < db ? -1 : 1;              // الأقرب استحقاقًا أولًا
      return a.date < b.date ? 1 : -1;
    });
  }

  function debt(id) {
    return store.debts.find(function (d) { return d.id === id; }) || null;
  }

  function debtPaid(d) {
    return sum(d.payments || [], function (p) { return p.amount; });
  }

  function debtRemaining(d) {
    return Math.max(0, (Number(d.amount) || 0) - debtPaid(d));
  }

  function isDebtSettled(d) {
    return debtRemaining(d) <= 0.0001;
  }

  /**
   * يضيف دينًا. إن كان affectsBalance صحيحًا نُسجّل حركة مقابلة:
   * دين عليّ ⇒ دخل (استلمت مالًا)، دين لي ⇒ مصروف (أقرضت مالًا).
   */
  function addDebt(data) {
    var d = {
      id: uid('debt'),
      direction: data.direction === 'owedToMe' ? 'owedToMe' : 'owedByMe',
      person: String(data.person || '').trim() || 'بدون اسم',
      amount: Math.abs(Number(data.amount) || 0),
      date: data.date || Fmt.today(),
      dueDate: data.dueDate || null,
      note: String(data.note || '').trim(),
      accountId: data.accountId || defaultAccountId(),
      payments: [],
      txId: null,
      createdAt: new Date().toISOString()
    };
    store.debts.push(d);

    if (data.affectsBalance) {
      var t = addTx({
        type: d.direction === 'owedByMe' ? 'income' : 'expense',
        amount: d.amount,
        categoryId: d.direction === 'owedByMe' ? 'sys_debt_in' : 'sys_lend',
        accountId: d.accountId,
        date: d.date,
        note: (d.direction === 'owedByMe' ? 'دين من ' : 'إقراض ') + d.person,
        debtId: d.id
      }, { silent: true });
      d.txId = t.id;
    }
    commit('debts');
    return d;
  }

  function updateDebt(id, patch) {
    var d = debt(id);
    if (!d) return null;
    if (patch.person !== undefined) d.person = String(patch.person).trim() || d.person;
    if (patch.amount !== undefined) d.amount = Math.abs(Number(patch.amount) || 0);
    if (patch.date !== undefined) d.date = patch.date;
    if (patch.dueDate !== undefined) d.dueDate = patch.dueDate || null;
    if (patch.note !== undefined) d.note = String(patch.note).trim();
    if (patch.accountId !== undefined) d.accountId = patch.accountId;
    // نُبقي الحركة الأصلية متوافقة مع المبلغ والتاريخ
    if (d.txId) {
      var t = tx(d.txId);
      if (t) {
        if (patch.amount !== undefined) t.amount = d.amount;
        if (patch.date !== undefined) t.date = d.date;
      }
    }
    commit('debts');
    return d;
  }

  function deleteDebt(id, alsoDeleteTx) {
    var d = debt(id);
    if (!d) return false;
    if (alsoDeleteTx) {
      var ids = {};
      if (d.txId) ids[d.txId] = 1;
      (d.payments || []).forEach(function (p) { if (p.txId) ids[p.txId] = 1; });
      store.tx = store.tx.filter(function (t) { return !ids[t.id]; });
    } else {
      store.tx.forEach(function (t) { if (t.debtId === id) t.debtId = null; });
    }
    store.debts = store.debts.filter(function (x) { return x.id !== id; });
    commit('debts');
    return true;
  }

  /**
   * يسجّل قسطًا. affectsBalance: سداد دين عليّ ⇒ مصروف،
   * تحصيل دين لي ⇒ دخل.
   */
  function addPayment(debtId, data) {
    var d = debt(debtId);
    if (!d) return null;
    var p = {
      id: uid('pay'),
      amount: Math.abs(Number(data.amount) || 0),
      date: data.date || Fmt.today(),
      note: String(data.note || '').trim(),
      txId: null
    };
    if (p.amount <= 0) return null;
    d.payments = d.payments || [];
    d.payments.push(p);

    if (data.affectsBalance) {
      var t = addTx({
        type: d.direction === 'owedByMe' ? 'expense' : 'income',
        amount: p.amount,
        categoryId: d.direction === 'owedByMe' ? 'sys_debt_pay' : 'sys_collect',
        accountId: data.accountId || d.accountId,
        date: p.date,
        note: (d.direction === 'owedByMe' ? 'سداد لـ ' : 'تحصيل من ') + d.person,
        debtId: d.id
      }, { silent: true });
      p.txId = t.id;
    }
    commit('debts');
    return p;
  }

  function deletePayment(debtId, paymentId, alsoDeleteTx) {
    var d = debt(debtId);
    if (!d) return false;
    var p = (d.payments || []).find(function (x) { return x.id === paymentId; });
    if (!p) return false;
    if (alsoDeleteTx && p.txId) {
      store.tx = store.tx.filter(function (t) { return t.id !== p.txId; });
    }
    d.payments = d.payments.filter(function (x) { return x.id !== paymentId; });
    commit('debts');
    return true;
  }

  function debtTotals() {
    var owedByMe = 0, owedToMe = 0, overdue = 0;
    var t = Fmt.today();
    store.debts.forEach(function (d) {
      var rem = debtRemaining(d);
      if (rem <= 0) return;
      if (d.direction === 'owedByMe') owedByMe += rem; else owedToMe += rem;
      if (d.dueDate && d.dueDate < t) overdue++;
    });
    return { owedByMe: owedByMe, owedToMe: owedToMe, net: owedToMe - owedByMe, overdue: overdue };
  }

  /* ----- الحركات المتكررة (الراتب والفواتير الشهرية) ----- */

  function recurring() { return store.recurring; }

  function recurringItem(id) {
    return store.recurring.find(function (r) { return r.id === id; }) || null;
  }

  function addRecurring(data) {
    var r = {
      id: uid('rec'),
      title: String(data.title || '').trim() || (data.type === 'income' ? 'راتب شهري' : 'فاتورة شهرية'),
      type: data.type === 'income' ? 'income' : 'expense',
      amount: Math.abs(Number(data.amount) || 0),
      categoryId: data.categoryId || null,
      accountId: data.accountId || defaultAccountId(),
      day: Math.min(31, Math.max(1, Number(data.day) || 1)),
      note: String(data.note || '').trim(),
      active: data.active !== false,
      startMonth: data.startMonth || Fmt.monthKeyOf(new Date()),
      lastPosted: null,
      createdAt: new Date().toISOString()
    };
    store.recurring.push(r);
    commit('recurring');
    return r;
  }

  function updateRecurring(id, patch) {
    var r = recurringItem(id);
    if (!r) return null;
    ['title', 'note'].forEach(function (k) {
      if (patch[k] !== undefined) r[k] = String(patch[k]).trim();
    });
    if (patch.amount !== undefined) r.amount = Math.abs(Number(patch.amount) || 0);
    if (patch.categoryId !== undefined) r.categoryId = patch.categoryId;
    if (patch.accountId !== undefined) r.accountId = patch.accountId;
    if (patch.day !== undefined) r.day = Math.min(31, Math.max(1, Number(patch.day) || 1));
    if (patch.active !== undefined) r.active = !!patch.active;
    if (patch.type !== undefined) r.type = patch.type === 'income' ? 'income' : 'expense';
    commit('recurring');
    return r;
  }

  function deleteRecurring(id) {
    store.recurring = store.recurring.filter(function (r) { return r.id !== id; });
    commit('recurring');
    return true;
  }

  /**
   * يُسجّل الحركات المتكررة المستحقة حتى اليوم.
   * يوم 31 في شهر أقصر يُرحَّل إلى آخر يوم في ذلك الشهر.
   * محمي من التكرار: لا يُسجّل شهرًا مرّتين (نتحقق من recurringId + الشهر).
   */
  function runRecurring() {
    var todayKey = Fmt.today();
    var thisMonth = Fmt.monthKey(todayKey);
    var posted = [];

    store.recurring.forEach(function (r) {
      if (!r.active || r.amount <= 0) return;
      var m = r.startMonth || thisMonth;
      var guard = 0;
      while (m <= thisMonth && guard++ < 240) {
        var day = Math.min(r.day, Fmt.lastDayOfMonth(m));
        var dateKey = dayKey(m, day);
        var alreadyPosted = store.tx.some(function (t) {
          return t.recurringId === r.id && Fmt.monthKey(t.date) === m;
        });
        if (!alreadyPosted && dateKey <= todayKey) {
          var t = addTx({
            type: r.type,
            amount: r.amount,
            categoryId: r.categoryId,
            accountId: r.accountId,
            date: dateKey,
            note: r.note || r.title,
            recurringId: r.id
          }, { silent: true });
          posted.push(t);
          r.lastPosted = dateKey;
        }
        m = Fmt.addMonths(m, 1);
      }
    });

    store.settings.lastRecurringRun = todayKey;
    if (posted.length) commit('tx'); else save();
    return posted;
  }

  /* ----- النسخ الاحتياطي ----- */

  function exportData() {
    return JSON.stringify({
      app: 'masarif',
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      data: store
    }, null, 2);
  }

  /** يستورد نسخة. mode: 'replace' يستبدل الكل، 'merge' يدمج بدون تكرار. */
  function importData(raw, mode) {
    var parsed = safeParse(typeof raw === 'string' ? raw : JSON.stringify(raw));
    if (!parsed) return { ok: false, error: 'الملف غير صالح — تعذّر قراءة محتواه.' };
    var incoming = parsed.data || parsed;
    if (!incoming || !Array.isArray(incoming.tx)) {
      return { ok: false, error: 'الملف لا يحتوي بيانات مصاريف.' };
    }
    if (mode === 'merge') {
      var added = { tx: 0, debts: 0, goals: 0, categories: 0, accounts: 0, recurring: 0 };
      ['categories', 'accounts', 'goals', 'recurring', 'debts', 'tx'].forEach(function (k) {
        (incoming[k] || []).forEach(function (item) {
          if (!item || !item.id) return;
          if (store[k].some(function (x) { return x.id === item.id; })) return;
          store[k].push(item);
          added[k]++;
        });
      });
      store = migrate(store);
      Fmt.setConfig(store.settings);
      commit('import');
      return { ok: true, mode: 'merge', added: added };
    }
    store = migrate(incoming);
    Fmt.setConfig(store.settings);
    save(true);
    emit('import');
    return { ok: true, mode: 'replace' };
  }

  function resetAll() {
    store = freshStore();
    Fmt.setConfig(store.settings);
    save(true);
    emit('reset');
  }

  /** يحذف الحركات والديون والأهداف ويُبقي الفئات والحسابات والإعدادات. */
  function clearTransactions() {
    store.tx = [];
    store.debts = [];
    store.goals = [];
    store.recurring.forEach(function (r) { r.lastPosted = null; });
    commit('reset-tx');
  }

  function raw() { return store; }

  function stats() {
    return {
      tx: store.tx.length,
      debts: store.debts.length,
      goals: store.goals.length,
      categories: store.categories.length,
      accounts: store.accounts.length,
      recurring: store.recurring.length,
      since: store.tx.length ? store.tx.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0].date : null
    };
  }

  /* ----- بيانات تجريبية (للعرض والتجربة) ----- */

  function seedDemo() {
    var accId = defaultAccountId();
    var expCats = categories('expense').filter(function (c) { return !c.system; });
    var incCats = categories('income').filter(function (c) { return !c.system; });
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
    function find(name, list) {
      return list.find(function (c) { return c.name === name; }) || list[0];
    }

    var salaryCat = find('راتب', incCats);
    addRecurring({
      title: 'الراتب الشهري', type: 'income', amount: 42000,
      categoryId: salaryCat.id, accountId: accId, day: 1,
      startMonth: Fmt.addMonths(Fmt.monthKeyOf(new Date()), -5), note: 'راتب الوظيفة'
    });

    var typical = {
      'طعام وشراب': [300, 1400], 'بقالة ومشتريات': [800, 4500], 'مقاهي ومطاعم': [150, 900],
      'نقل ومواصلات': [200, 1200], 'إيجار ومنزل': [8000, 8000], 'فواتير وخدمات': [600, 1800],
      'هاتف وإنترنت': [500, 900], 'صحة وأدوية': [400, 2500], 'ملابس': [900, 3500],
      'صدقة وزكاة': [500, 2000], 'تعليم': [1000, 3000]
    };

    for (var back = 5; back >= 0; back--) {
      var m = Fmt.addMonths(Fmt.monthKeyOf(new Date()), -back);
      var last = Fmt.lastDayOfMonth(m);
      var maxDay = (back === 0) ? Fmt.fromKey(Fmt.today()).getDate() : last;
      var n = 16 + Math.floor(Math.random() * 10);
      for (var i = 0; i < n; i++) {
        var cat = pick(expCats);
        var range = typical[cat.name] || [200, 1500];
        var amt = Math.round((range[0] + Math.random() * (range[1] - range[0])) / 10) * 10;
        var day = 1 + Math.floor(Math.random() * maxDay);
        addTx({
          type: 'expense', amount: amt, categoryId: cat.id, accountId: accId,
          date: dayKey(m, day), note: ''
        }, { silent: true });
      }
      if (Math.random() > 0.45) {
        var ic = pick(incCats);
        addTx({
          type: 'income', amount: 2000 + Math.round(Math.random() * 9000),
          categoryId: ic.id, accountId: accId,
          date: dayKey(m, Math.min(maxDay, 12)), note: 'دخل إضافي'
        }, { silent: true });
      }
      addTx({
        type: 'saving', amount: 3000 + Math.round(Math.random() * 4000) , goalId: null,
        accountId: accId, date: dayKey(m, Math.min(maxDay, 3)), note: 'ادخار شهري'
      }, { silent: true });
    }

    // سقوف ميزانية لبعض الفئات
    [['طعام وشراب', 9000], ['بقالة ومشتريات', 14000], ['نقل ومواصلات', 6000], ['مقاهي ومطاعم', 2500]]
      .forEach(function (pair) {
        var c = expCats.find(function (x) { return x.name === pair[0]; });
        if (c) c.budget = pair[1];
      });

    var g1 = addGoal({ name: 'شراء سيارة', icon: '🚙', target: 900000, deadline: null });
    var g2 = addGoal({ name: 'حج وعمرة', icon: '🕋', target: 250000, deadline: null });
    // نربط حركات الادخار بالهدفين بالتناوب
    var savings = store.tx.filter(function (t) { return t.type === 'saving'; });
    savings.forEach(function (t, i) { t.goalId = i % 2 ? g2.id : g1.id; });

    addDebt({
      direction: 'owedByMe', person: 'محمد الأمين', amount: 60000,
      date: Fmt.addMonths(Fmt.monthKeyOf(new Date()), -2) + '-14',
      dueDate: Fmt.addMonths(Fmt.monthKeyOf(new Date()), 1) + '-14',
      note: 'سلفة لتجهيز المنزل', affectsBalance: true
    });
    var d2 = addDebt({
      direction: 'owedToMe', person: 'فاطمة بنت أحمد', amount: 25000,
      date: Fmt.addMonths(Fmt.monthKeyOf(new Date()), -1) + '-05',
      dueDate: Fmt.addMonths(Fmt.monthKeyOf(new Date()), -1) + '-28',
      note: 'قرض شخصي', affectsBalance: true
    });
    addPayment(d2.id, { amount: 10000, date: Fmt.today(), affectsBalance: true, note: 'قسط أول' });
    addDebt({
      direction: 'owedByMe', person: 'دكان الحاج', amount: 8500,
      date: Fmt.monthKeyOf(new Date()) + '-02', dueDate: null,
      note: 'حساب البقالة', affectsBalance: false
    });

    runRecurring();
    commit('seed');
  }

  return {
    // الدورة
    load: load, save: save, flush: flush, on: on, off: off, raw: raw, stats: stats,
    // الإعدادات
    settings: settings, setSetting: setSetting,
    // الفئات
    categories: categories, category: category, categoryLabel: categoryLabel,
    categoryIcon: categoryIcon, addCategory: addCategory, updateCategory: updateCategory,
    deleteCategory: deleteCategory, categoryUsage: categoryUsage,
    // الحسابات
    accounts: accounts, account: account, accountLabel: accountLabel, addAccount: addAccount,
    updateAccount: updateAccount, deleteAccount: deleteAccount, defaultAccountId: defaultAccountId,
    accountBalance: accountBalance,
    // المعاملات
    transactions: transactions, tx: tx, addTx: addTx, updateTx: updateTx, deleteTx: deleteTx,
    filterTx: filterTx, balance: balance, monthTotals: monthTotals, byCategory: byCategory,
    monthlySeries: monthlySeries, budgets: budgets, activeMonths: activeMonths,
    // المدخرات
    goals: goals, goal: goal, addGoal: addGoal, updateGoal: updateGoal, deleteGoal: deleteGoal,
    goalProgress: goalProgress, savingsTotal: savingsTotal,
    // الديون
    debts: debts, debt: debt, addDebt: addDebt, updateDebt: updateDebt, deleteDebt: deleteDebt,
    addPayment: addPayment, deletePayment: deletePayment, debtPaid: debtPaid,
    debtRemaining: debtRemaining, isDebtSettled: isDebtSettled, debtTotals: debtTotals,
    // المتكررة
    recurring: recurring, recurringItem: recurringItem, addRecurring: addRecurring,
    updateRecurring: updateRecurring, deleteRecurring: deleteRecurring, runRecurring: runRecurring,
    // النسخ والصيانة
    exportData: exportData, importData: importData, resetAll: resetAll,
    clearTransactions: clearTransactions, seedDemo: seedDemo
  };
})();
