/* ==========================================================================
   مدير المال — تطبيق محلي لتسجيل المصاريف والمداخيل
   كل البيانات تُحفظ في localStorage داخل الجهاز، ولا تُرسل لأي خادم.
   ========================================================================== */
"use strict";

var APP_VERSION = "1.0.0";
var STORE_KEY = "money-manager.v1";

/* Start Helpers */
function $(sel, root) {
  return (root || document).querySelector(sel);
}
function $$(sel, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(sel));
}
function el(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function esc(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}
function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
function clamp(num, min, max) {
  return Math.min(max, Math.max(min, num));
}
/* End Helpers */

/* Start Money
   المبالغ تُخزَّن كأعداد صحيحة (سنتيمات) تفاديًا لأخطاء الكسور العشرية. */
function toMinor(input) {
  var num = parseFloat(String(input == null ? "" : input).replace(/[^\d.-]/g, ""));
  if (!isFinite(num)) return 0;
  return Math.round(num * 100);
}
function fromMinor(minor) {
  return (minor || 0) / 100;
}
/* تنسيق واضح: مسافة للآلاف ونقطة للكسور، بأرقام لاتينية. */
function rawNum(minor) {
  var amount = Math.abs(minor || 0);
  var whole = Math.floor(amount / 100);
  var cents = amount % 100;
  var text = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  if (cents) text += "." + String(cents).padStart(2, "0");
  return (minor < 0 ? "\u2212" : "") + text;
}
/* عزل ثنائي الاتجاه (LRI…PDI) حتى لا ينقلب ترتيب الأرقام داخل الجُمل العربية. */
function isolate(text) {
  return "\u2066" + text + "\u2069";
}
function fmtNum(minor) {
  return isolate(rawNum(minor));
}
function fmt(minor) {
  return isolate(rawNum(minor) + " " + state.settings.currency);
}
function fmtRange(used, budget) {
  return isolate(rawNum(used) + " / " + rawNum(budget));
}
/* End Money */

/* Start Dates */
var MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];
var DAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function isoOf(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, "0");
  var d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}
function dateOf(iso) {
  var parts = String(iso).split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
function todayIso() {
  return isoOf(new Date());
}
/* بداية الفترة المالية التي يقع فيها التاريخ (تراعي «بداية الشهر المالي»). */
function periodStartOf(date) {
  var startDay = state.settings.startDay || 1;
  var start = new Date(date.getFullYear(), date.getMonth(), startDay);
  if (date.getDate() < startDay) start = new Date(date.getFullYear(), date.getMonth() - 1, startDay);
  return start;
}
function periodEndOf(start) {
  return new Date(start.getFullYear(), start.getMonth() + 1, start.getDate() - 1);
}
function shiftPeriod(start, step) {
  return new Date(start.getFullYear(), start.getMonth() + step, start.getDate());
}
function periodLabel(start) {
  var label = MONTHS_AR[start.getMonth()] + " " + start.getFullYear();
  if ((state.settings.startDay || 1) === 1) return label;
  var end = periodEndOf(start);
  return start.getDate() + " " + MONTHS_AR[start.getMonth()] + " ← " + end.getDate() + " " + MONTHS_AR[end.getMonth()];
}
function inPeriod(iso, start) {
  var end = periodEndOf(start);
  return iso >= isoOf(start) && iso <= isoOf(end);
}
function dayLabel(iso) {
  var date = dateOf(iso);
  var diff = Math.round((dateOf(todayIso()) - date) / 86400000);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "أمس";
  return DAYS_AR[date.getDay()] + " " + date.getDate() + " " + MONTHS_AR[date.getMonth()];
}
/* End Dates */

/* Start Store */
function seed() {
  var accounts = [
    { id: uid(), name: "المصاريف اليومية", icon: "👛", opening: 0 },
    { id: uid(), name: "الطوارئ والعلاج", icon: "🏥", opening: 0 },
    { id: uid(), name: "الاستثمار", icon: "📈", opening: 0 }
  ];
  var expense = [
    ["أكل وشرب", "🍽️"], ["نقل", "🚗"], ["فواتير", "🧾"], ["اتصالات وإنترنت", "📱"],
    ["صحة وعلاج", "💊"], ["تعليم", "📚"], ["تسوق", "🛍️"], ["إيجار", "🏠"],
    ["صدقة وزكاة", "🤲"], ["أخرى", "➕"]
  ];
  var income = [["راتب", "💼"], ["عمل حر", "🧰"], ["أرباح استثمار", "📈"], ["هدية", "🎁"], ["أخرى", "➕"]];
  var categories = [];
  expense.forEach(function (row) {
    categories.push({ id: uid(), name: row[0], icon: row[1], kind: "expense" });
  });
  income.forEach(function (row) {
    categories.push({ id: uid(), name: row[0], icon: row[1], kind: "income" });
  });
  return {
    version: 1,
    settings: { currency: "MRU", theme: "auto", startDay: 1 },
    accounts: accounts,
    categories: categories,
    budgets: {},
    recurring: [],
    transactions: []
  };
}

var state = seed();

function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    var data = JSON.parse(raw);
    if (!data || !Array.isArray(data.accounts)) return;
    state = {
      version: 1,
      settings: Object.assign({ currency: "MRU", theme: "auto", startDay: 1 }, data.settings || {}),
      accounts: data.accounts || [],
      categories: data.categories || [],
      budgets: data.budgets || {},
      recurring: data.recurring || [],
      transactions: data.transactions || []
    };
  } catch (err) {
    toast("تعذّرت قراءة البيانات المحفوظة", "critical");
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (err) {
    toast("لم يتم الحفظ — مساحة التخزين ممتلئة", "critical");
  }
}
/* End Store */

/* Start Selectors */
function accountById(id) {
  return state.accounts.filter(function (acc) { return acc.id === id; })[0];
}
function categoryById(id) {
  return state.categories.filter(function (cat) { return cat.id === id; })[0];
}
function categoriesOf(kind) {
  return state.categories.filter(function (cat) { return cat.kind === kind; });
}
function balanceOf(accountId) {
  var account = accountById(accountId);
  var total = account ? account.opening || 0 : 0;
  state.transactions.forEach(function (tx) {
    if (tx.type === "income" && tx.accountId === accountId) total += tx.amount;
    if (tx.type === "expense" && tx.accountId === accountId) total -= tx.amount;
    if (tx.type === "transfer") {
      if (tx.accountId === accountId) total -= tx.amount;
      if (tx.toAccountId === accountId) total += tx.amount;
    }
  });
  return total;
}
function totalBalance() {
  return state.accounts.reduce(function (sum, acc) { return sum + balanceOf(acc.id); }, 0);
}
function periodTransactions(start) {
  return state.transactions.filter(function (tx) { return inPeriod(tx.date, start); });
}
function periodTotals(start) {
  var income = 0;
  var expense = 0;
  periodTransactions(start).forEach(function (tx) {
    if (tx.type === "income") income += tx.amount;
    if (tx.type === "expense") expense += tx.amount;
  });
  return { income: income, expense: expense, net: income - expense };
}
function spentByCategory(start) {
  var map = {};
  periodTransactions(start).forEach(function (tx) {
    if (tx.type !== "expense") return;
    map[tx.categoryId] = (map[tx.categoryId] || 0) + tx.amount;
  });
  return map;
}
/* حالة الميزانية: نسبة الصرف وما يقابلها من لون/أيقونة. */
function budgetStatus(spent, budget) {
  var ratio = budget > 0 ? spent / budget : 0;
  if (ratio >= 1) return { key: "critical", icon: "⛔", text: "تجاوزت الميزانية", ratio: ratio };
  if (ratio >= 0.9) return { key: "serious", icon: "⚠️", text: "على وشك التجاوز", ratio: ratio };
  if (ratio >= 0.75) return { key: "warning", icon: "⚠️", text: "اقتربت من الحد", ratio: ratio };
  return { key: "good", icon: "✅", text: "ضمن الميزانية", ratio: ratio };
}
/* End Selectors */

/* Start Recurring
   العمليات الثابتة (إيجار، فواتير، راتب…) تُولَّد تلقائيًا في يومها من كل شهر،
   بأثر رجعي حتى 12 شهرًا، ودون تكرار لنفس اليوم. */
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function dueDatesOf(rule, today) {
  var dates = [];
  var startIso = rule.startDate || todayIso();
  var cursor = dateOf(startIso);
  var oldest = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  if (cursor < oldest) cursor = oldest;
  var year = cursor.getFullYear();
  var month = cursor.getMonth();
  for (var step = 0; step < 24; step++) {
    var day = Math.min(rule.dayOfMonth || 1, daysInMonth(year, month));
    var iso = isoOf(new Date(year, month, day));
    if (iso >= startIso && iso <= isoOf(today)) dates.push(iso);
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    if (new Date(year, month, 1) > today) break;
  }
  return dates;
}
function postDueRecurring() {
  if (!Array.isArray(state.recurring) || !state.recurring.length) return 0;
  var today = new Date();
  var added = 0;
  state.recurring.forEach(function (rule) {
    if (rule.active === false) return;
    if (!accountById(rule.accountId) || !categoryById(rule.categoryId)) return;
    dueDatesOf(rule, today).forEach(function (iso) {
      var exists = state.transactions.some(function (tx) {
        return tx.recurringId === rule.id && tx.date === iso;
      });
      if (exists) return;
      state.transactions.push({
        id: uid(),
        recurringId: rule.id,
        type: rule.type,
        amount: rule.amount,
        accountId: rule.accountId,
        toAccountId: null,
        categoryId: rule.categoryId,
        note: rule.note || "",
        date: iso,
        createdAt: Date.now()
      });
      added += 1;
    });
  });
  if (added) save();
  return added;
}
/* End Recurring */

/* Start UI Shell */
var ui = {
  view: "home",
  period: null,
  showTable: false,
  showTrendTable: false,
  filters: { q: "", account: "all", kind: "all", allMonths: false }
};

function toast(message, tone) {
  var wrap = $("#toasts");
  var node = el("div", "toast" + (tone ? " is-" + tone : ""), message);
  wrap.appendChild(node);
  setTimeout(function () { node.remove(); }, 3600);
}

function applyTheme() {
  var theme = state.settings.theme || "auto";
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  $("#theme-icon").textContent = theme === "dark" ? "☀️" : theme === "light" ? "🌙" : "🌓";
}

function go(view) {
  ui.view = view;
  $$(".view").forEach(function (section) {
    section.hidden = section.id !== "view-" + view;
  });
  $$(".tab").forEach(function (tab) {
    tab.classList.toggle("is-active", tab.dataset.go === view);
  });
  $("#month-nav").hidden = view === "settings" || view === "accounts";
  window.scrollTo(0, 0);
  render();
}
/* End UI Shell */

/* Start Render: Home */
function renderTiles() {
  var totals = periodTotals(ui.period);
  var rows = [
    { label: "المداخيل", value: totals.income, cls: "pos" },
    { label: "المصاريف", value: totals.expense, cls: "neg" },
    { label: "المتبقّي", value: totals.net, cls: totals.net < 0 ? "neg" : "" }
  ];
  $("#home-tiles").innerHTML = rows.map(function (row) {
    return (
      '<div class="tile"><span class="label">' + esc(row.label) + "</span>" +
      '<span class="value ' + row.cls + '">' + esc(fmtNum(row.value)) + "</span>" +
      '<span class="unit">' + esc(state.settings.currency) + "</span></div>"
    );
  }).join("");
}

function renderAlerts() {
  var spent = spentByCategory(ui.period);
  var alerts = [];
  Object.keys(state.budgets).forEach(function (catId) {
    var budget = state.budgets[catId];
    var category = categoryById(catId);
    if (!budget || !category) return;
    var status = budgetStatus(spent[catId] || 0, budget);
    if (status.key === "good") return;
    alerts.push({ category: category, status: status, spent: spent[catId] || 0, budget: budget });
  });
  alerts.sort(function (a, b) { return b.status.ratio - a.status.ratio; });
  $("#home-alerts-card").hidden = alerts.length === 0;
  $("#home-alerts").innerHTML = alerts.map(function (item) {
    return (
      '<div class="meter-note ' + (item.status.key === "critical" ? "is-critical" : "") + '">' +
      item.status.icon + " " + esc(item.category.name) + " — " + esc(item.status.text) +
      " (" + esc(fmtNum(item.spent)) + " من " + esc(fmt(item.budget)) + ")</div>"
    );
  }).join("");
}

function renderHomeAccounts() {
  var wrap = $("#home-accounts");
  wrap.innerHTML = "";
  if (!state.accounts.length) {
    wrap.innerHTML = '<p class="empty">لا توجد حسابات بعد.</p>';
    return;
  }
  state.accounts.forEach(function (account) {
    var balance = balanceOf(account.id);
    var chip = el("button", "acc-chip");
    chip.type = "button";
    chip.innerHTML =
      '<span class="name">' + esc(account.icon || "👛") + " " + esc(account.name) + "</span>" +
      '<span class="bal ' + (balance < 0 ? "neg" : "") + '" dir="ltr">' + esc(fmt(balance)) + "</span>";
    chip.addEventListener("click", function () { go("accounts"); });
    wrap.appendChild(chip);
  });
}

/* مخطط أفقي بسلسلة واحدة: المقارنة بالحجم، والهوية تحملها التسميات لا اللون. */
function renderBreakdown() {
  var spent = spentByCategory(ui.period);
  var rows = Object.keys(spent).map(function (catId) {
    var category = categoryById(catId);
    return { name: category ? category.icon + " " + category.name : "غير مصنّف", value: spent[catId] };
  }).sort(function (a, b) { return b.value - a.value; });

  var host = $("#home-breakdown");
  $("#toggle-table").textContent = ui.showTable ? "رسم" : "جدول";
  if (!rows.length) {
    host.innerHTML = '<p class="empty">لا توجد مصاريف في هذه الفترة.</p>';
    return;
  }
  var total = rows.reduce(function (sum, row) { return sum + row.value; }, 0);
  var max = rows[0].value;

  if (ui.showTable) {
    host.innerHTML =
      '<table class="data-table"><thead><tr><th>الفئة</th><th class="n">المبلغ</th><th class="n">النسبة</th></tr></thead><tbody>' +
      rows.map(function (row) {
        return "<tr><td>" + esc(row.name) + '</td><td class="n">' + esc(fmtNum(row.value)) +
          '</td><td class="n">' + Math.round((row.value / total) * 100) + "%</td></tr>";
      }).join("") +
      "</tbody></table>";
    return;
  }
  host.innerHTML =
    '<div class="bars">' +
    rows.map(function (row) {
      var width = Math.max(2, Math.round((row.value / max) * 100));
      return (
        '<div class="bar-row"><span class="bar-name">' + esc(row.name) + "</span>" +
        '<span class="bar-value" dir="ltr">' + esc(rawNum(row.value)) + " · " + Math.round((row.value / total) * 100) + "%</span>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + width + '%"></div></div></div>'
      );
    }).join("") +
    "</div>";
}

/* أعمدة زمنية بسلسلة واحدة: مصاريف آخر ستة أشهر، مع تسمية مباشرة انتقائية. */
function renderTrend() {
  var periods = [];
  for (var back = 5; back >= 0; back--) {
    var start = shiftPeriod(ui.period, -back);
    periods.push({ start: start, label: MONTHS_AR[start.getMonth()], value: periodTotals(start).expense });
  }
  var host = $("#home-trend");
  var max = periods.reduce(function (top, row) { return Math.max(top, row.value); }, 0);
  $("#toggle-trend").textContent = ui.showTrendTable ? "رسم" : "جدول";
  if (!max) {
    host.innerHTML = '<p class="empty">لا توجد مصاريف مسجّلة في هذه الأشهر.</p>';
    return;
  }
  if (ui.showTrendTable) {
    host.innerHTML =
      '<table class="data-table"><thead><tr><th>الشهر</th><th class="n">المصاريف</th></tr></thead><tbody>' +
      periods.slice().reverse().map(function (row) {
        return "<tr><td>" + esc(row.label) + " " + row.start.getFullYear() +
          '</td><td class="n">' + esc(rawNum(row.value)) + "</td></tr>";
      }).join("") +
      "</tbody></table>";
    return;
  }
  host.innerHTML =
    '<div class="trend">' +
    periods.map(function (row, index) {
      var isLast = index === periods.length - 1;
      var isMax = row.value === max;
      var height = Math.max(2, Math.round((row.value / max) * 100));
      return (
        '<div class="trend-col" title="' + esc(row.label + " " + row.start.getFullYear() + ": " + rawNum(row.value)) + '">' +
        '<span class="trend-val" dir="ltr">' + (isLast || isMax ? esc(rawNum(row.value)) : "") + "</span>" +
        '<div class="trend-plot"><div class="trend-bar' + (isLast ? " is-current" : "") +
        '" style="height:' + height + '%"></div></div>' +
        '<span class="trend-label">' + esc(row.label) + "</span></div>"
      );
    }).join("") +
    "</div>";
}

function renderRecent() {
  var rows = periodTransactions(ui.period).slice().sort(function (a, b) {
    return a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1);
  }).slice(0, 6);
  var host = $("#home-recent");
  host.innerHTML = "";
  if (!rows.length) {
    host.innerHTML = '<p class="empty">لا توجد عمليات بعد — اضغط زر «+» لتسجيل أول عملية.</p>';
    return;
  }
  rows.forEach(function (tx) { host.appendChild(txRow(tx)); });
}

function renderHome() {
  renderTiles();
  renderAlerts();
  renderHomeAccounts();
  renderBreakdown();
  renderTrend();
  renderRecent();
}
/* End Render: Home */

/* Start Render: Transactions */
function txRow(tx) {
  var account = accountById(tx.accountId);
  var row = el("button", "tx");
  row.type = "button";
  var icon;
  var title;
  var amount;
  var cls = "";
  if (tx.type === "transfer") {
    var to = accountById(tx.toAccountId);
    icon = "↔";
    title = "تحويل";
    amount = fmt(tx.amount);
    row.dataset.sub = (account ? account.name : "?") + " ← " + (to ? to.name : "?");
  } else {
    var category = categoryById(tx.categoryId);
    icon = category ? category.icon : "•";
    title = category ? category.name : "غير مصنّف";
    amount = (tx.type === "income" ? "+" : "−") + " " + fmt(tx.amount);
    cls = tx.type === "income" ? "pos" : "neg";
    row.dataset.sub = account ? account.name : "";
  }
  var sub = [row.dataset.sub, tx.note].filter(Boolean).join(" · ");
  row.innerHTML =
    '<span class="ic">' + esc(icon) + "</span>" +
    '<span class="grow"><span class="t1">' + esc(title) + '</span><span class="t2">' + esc(sub) + "</span></span>" +
    '<span class="amt ' + cls + '" dir="ltr">' + esc(amount) + "</span>";
  row.addEventListener("click", function () { openTxSheet(tx); });
  return row;
}

function renderTx() {
  var filters = ui.filters;
  var query = filters.q.trim();
  var source = filters.allMonths ? state.transactions : periodTransactions(ui.period);
  var rows = source.filter(function (tx) {
    if (filters.kind !== "all" && tx.type !== filters.kind) return false;
    if (filters.account !== "all" && tx.accountId !== filters.account && tx.toAccountId !== filters.account) return false;
    if (query) {
      var category = categoryById(tx.categoryId);
      var haystack = (tx.note || "") + " " + (category ? category.name : "");
      if (haystack.indexOf(query) === -1) return false;
    }
    return true;
  }).sort(function (a, b) {
    return a.date === b.date ? b.createdAt - a.createdAt : (a.date < b.date ? 1 : -1);
  });

  var host = $("#tx-list");
  host.innerHTML = "";
  if (!rows.length) {
    host.innerHTML = '<p class="empty">لا توجد عمليات مطابقة.</p>';
    return;
  }
  var groups = {};
  var order = [];
  rows.forEach(function (tx) {
    if (!groups[tx.date]) { groups[tx.date] = []; order.push(tx.date); }
    groups[tx.date].push(tx);
  });
  order.forEach(function (iso) {
    var group = el("div", "day-group");
    var dayTotal = groups[iso].reduce(function (sum, tx) {
      if (tx.type === "income") return sum + tx.amount;
      if (tx.type === "expense") return sum - tx.amount;
      return sum;
    }, 0);
    var head = el("div", "day-head");
    head.innerHTML = "<span>" + esc(dayLabel(iso)) + '</span><span class="num ' +
      (dayTotal < 0 ? "neg" : "pos") + '">' + esc(fmtNum(dayTotal)) + "</span>";
    group.appendChild(head);
    groups[iso].forEach(function (tx) { group.appendChild(txRow(tx)); });
    host.appendChild(group);
  });
}

function fillTxFilters() {
  var select = $("#tx-account");
  select.innerHTML = '<option value="all">كل الحسابات</option>' +
    state.accounts.map(function (acc) {
      return '<option value="' + esc(acc.id) + '">' + esc(acc.name) + "</option>";
    }).join("");
  select.value = ui.filters.account;
  $("#tx-kind").value = ui.filters.kind;
  $("#tx-search").value = ui.filters.q;
  $("#tx-all-months").checked = ui.filters.allMonths;
}
/* End Render: Transactions */

/* Start Render: Accounts */
function renderAccounts() {
  $("#accounts-total").textContent = fmt(totalBalance());
  $("#accounts-total").dir = "ltr";
  var host = $("#accounts-list");
  host.innerHTML = "";
  if (!state.accounts.length) {
    host.innerHTML = '<p class="empty">لا توجد حسابات — أضف حسابًا للبدء.</p>';
    return;
  }
  state.accounts.forEach(function (account) {
    var balance = balanceOf(account.id);
    var row = el("button", "acc-row");
    row.type = "button";
    row.innerHTML =
      '<span class="ic">' + esc(account.icon || "👛") + "</span>" +
      '<span class="grow">' + esc(account.name) +
      '<span class="sub">الرصيد الافتتاحي: ' + esc(fmtNum(account.opening || 0)) + "</span></span>" +
      '<span class="big-num ' + (balance < 0 ? "neg" : "") + '" dir="ltr">' + esc(fmt(balance)) + "</span>";
    row.addEventListener("click", function () { openAccountSheet(account); });
    host.appendChild(row);
  });
}
/* End Render: Accounts */

/* Start Render: Budgets */
function renderBudgets() {
  var spent = spentByCategory(ui.period);
  var categories = categoriesOf("expense");
  var budgetTotal = categories.reduce(function (sum, cat) { return sum + (state.budgets[cat.id] || 0); }, 0);
  var spentTotal = categories.reduce(function (sum, cat) { return sum + (spent[cat.id] || 0); }, 0);
  $("#budget-total").textContent = fmt(budgetTotal);
  $("#budget-total").dir = "ltr";

  var overall = $("#budget-overall");
  if (budgetTotal > 0) {
    var status = budgetStatus(spentTotal, budgetTotal);
    overall.innerHTML =
      '<div class="meter"><div class="meter-head"><span>صُرف ' + esc(fmtNum(spentTotal)) +
      " من " + esc(fmtNum(budgetTotal)) + '</span><span class="num" dir="ltr">' + Math.round(status.ratio * 100) + "%</span></div>" +
      '<div class="meter-track"><div class="meter-fill is-' + status.key +
      '" style="width:' + clamp(Math.round(status.ratio * 100), 2, 100) + '%"></div></div>' +
      '<div class="meter-note ' + (status.key === "critical" ? "is-critical" : "") + '">' +
      status.icon + " " + esc(status.text) + " — المتبقّي " + esc(fmt(Math.max(0, budgetTotal - spentTotal))) + "</div></div>";
  } else {
    overall.innerHTML = '<p class="empty">لم تحدد ميزانية بعد — اضغط على أي فئة لتحديد حدّها الشهري.</p>';
  }

  var host = $("#budgets-list");
  host.innerHTML = "";
  var card = el("div", "card");
  card.appendChild(el("h2", "card-title", "الحدود الشهرية لكل فئة"));
  categories.forEach(function (category) {
    var budget = state.budgets[category.id] || 0;
    var used = spent[category.id] || 0;
    var status = budgetStatus(used, budget);
    var meter = el("div", "meter");
    var pct = budget > 0 ? clamp(Math.round(status.ratio * 100), 2, 100) : 0;
    meter.innerHTML =
      '<div class="meter-head"><span>' + esc(category.icon) + " " + esc(category.name) + "</span>" +
      '<span class="num">' + esc(budget > 0 ? fmtRange(used, budget) : fmtNum(used)) + "</span></div>" +
      (budget > 0
        ? '<div class="meter-track"><div class="meter-fill is-' + status.key + '" style="width:' + pct + '%"></div></div>' +
          '<div class="meter-note ' + (status.key === "critical" ? "is-critical" : "") + '">' +
          status.icon + " " + esc(status.text) + " · المتبقّي " + esc(fmtNum(Math.max(0, budget - used))) + "</div>"
        : '<div class="meter-note">بدون حد شهري</div>');
    var button = el("button", "link-btn", budget > 0 ? "تعديل الحد" : "تحديد حد");
    button.type = "button";
    button.addEventListener("click", function () { openBudgetSheet(category); });
    meter.appendChild(button);
    card.appendChild(meter);
  });
  host.appendChild(card);
}
/* End Render: Budgets */

/* Start Render Dispatcher */
function render() {
  $("#month-label").textContent = periodLabel(ui.period);
  if (ui.view === "home") renderHome();
  if (ui.view === "tx") { fillTxFilters(); renderTx(); }
  if (ui.view === "accounts") renderAccounts();
  if (ui.view === "budgets") renderBudgets();
  if (ui.view === "settings") renderSettings();
}
/* End Render Dispatcher */

/* Start Sheets */
function openSheet(title, build) {
  $("#sheet-title").textContent = title;
  var body = $("#sheet-body");
  body.innerHTML = "";
  build(body);
  $("#sheet-backdrop").hidden = false;
  document.body.style.overflow = "hidden";
}
/* تأكيد داخل الصفحة: نافذة confirm() قد تكون معطّلة في بعض البيئات المضمّنة. */
function askConfirm(message, onYes, confirmLabel) {
  var backdrop = el("div", "confirm-backdrop");
  var box = el("div", "confirm-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.appendChild(el("p", "confirm-text", message));
  var actions = el("div", "sheet-actions");
  var yesBtn = el("button", "btn danger", confirmLabel || "تأكيد");
  yesBtn.type = "button";
  var noBtn = el("button", "btn ghost", "إلغاء");
  noBtn.type = "button";
  function close() {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  }
  function onKey(event) {
    if (event.key === "Escape") close();
  }
  yesBtn.addEventListener("click", function () { close(); onYes(); });
  noBtn.addEventListener("click", close);
  backdrop.addEventListener("click", function (event) {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);
  actions.appendChild(yesBtn);
  actions.appendChild(noBtn);
  box.appendChild(actions);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  yesBtn.focus();
}

function closeSheet() {
  $("#sheet-backdrop").hidden = true;
  $("#sheet-body").innerHTML = "";
  document.body.style.overflow = "";
}

/* نموذج العملية: مصروف / مدخول / تحويل */
function openTxSheet(existing) {
  var draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: null,
        type: "expense",
        amount: 0,
        accountId: state.accounts.length ? state.accounts[0].id : null,
        toAccountId: null,
        categoryId: null,
        note: "",
        date: todayIso()
      };

  openSheet(existing ? "تعديل العملية" : "عملية جديدة", function (body) {
    function redraw() {
      body.innerHTML = "";

      var seg = el("div", "seg");
      [["expense", "مصروف"], ["income", "مدخول"], ["transfer", "تحويل"]].forEach(function (pair) {
        var button = el("button", "seg-btn" + (draft.type === pair[0] ? " is-on" : ""), pair[1]);
        button.type = "button";
        button.addEventListener("click", function () {
          draft.type = pair[0];
          draft.categoryId = null;
          redraw();
        });
        seg.appendChild(button);
      });
      body.appendChild(seg);

      var amountInput = el("input", "field amount-display");
      amountInput.type = "text";
      amountInput.inputMode = "decimal";
      amountInput.value = draft.amount ? String(fromMinor(draft.amount)) : "";
      amountInput.placeholder = "0";
      amountInput.setAttribute("aria-label", "المبلغ");
      body.appendChild(amountInput);
      body.appendChild(el("div", "amount-unit", state.settings.currency));

      var keypad = el("div", "keypad");
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].forEach(function (key) {
        var button = el("button", null, key);
        button.type = "button";
        button.addEventListener("click", function () {
          if (key === "⌫") amountInput.value = amountInput.value.slice(0, -1);
          else if (key === "." && amountInput.value.indexOf(".") !== -1) return;
          else amountInput.value += key;
        });
        keypad.appendChild(button);
      });
      body.appendChild(keypad);

      if (draft.type === "transfer") {
        body.appendChild(selectRow("من حساب", state.accounts, draft.accountId, function (value) {
          draft.accountId = value;
        }));
        if (!draft.toAccountId) {
          var other = state.accounts.filter(function (acc) { return acc.id !== draft.accountId; })[0];
          draft.toAccountId = other ? other.id : null;
        }
        body.appendChild(selectRow("إلى حساب", state.accounts, draft.toAccountId, function (value) {
          draft.toAccountId = value;
        }));
      } else {
        var chips = el("div", "chips");
        categoriesOf(draft.type).forEach(function (category) {
          var chip = el("button", "chip" + (draft.categoryId === category.id ? " is-on" : ""),
            category.icon + " " + category.name);
          chip.type = "button";
          chip.addEventListener("click", function () {
            draft.categoryId = category.id;
            draft.amount = toMinor(amountInput.value);
            draft.note = noteInput.value;
            draft.date = dateInput.value;
            redraw();
          });
          chips.appendChild(chip);
        });
        var wrap = el("div", "form-row");
        wrap.appendChild(el("span", null, "الفئة"));
        wrap.appendChild(chips);
        body.appendChild(wrap);
        body.appendChild(selectRow("الحساب", state.accounts, draft.accountId, function (value) {
          draft.accountId = value;
        }));
      }

      var dateWrap = el("div", "form-row");
      dateWrap.appendChild(el("span", null, "التاريخ"));
      var dateInput = el("input", "field");
      dateInput.type = "date";
      dateInput.value = draft.date;
      dateWrap.appendChild(dateInput);
      body.appendChild(dateWrap);

      var noteWrap = el("div", "form-row");
      noteWrap.appendChild(el("span", null, "ملاحظة (اختياري)"));
      var noteInput = el("input", "field");
      noteInput.type = "text";
      noteInput.value = draft.note || "";
      noteWrap.appendChild(noteInput);
      body.appendChild(noteWrap);

      var actions = el("div", "sheet-actions");
      var saveBtn = el("button", "btn", "حفظ");
      saveBtn.type = "button";
      saveBtn.addEventListener("click", function () {
        draft.amount = toMinor(amountInput.value);
        draft.note = noteInput.value.trim();
        draft.date = dateInput.value || todayIso();
        commitTx(draft);
      });
      actions.appendChild(saveBtn);
      if (existing) {
        var delBtn = el("button", "btn danger", "حذف");
        delBtn.type = "button";
        delBtn.addEventListener("click", function () {
          askConfirm("حذف هذه العملية؟", function () {
            state.transactions = state.transactions.filter(function (tx) { return tx.id !== existing.id; });
            save();
            closeSheet();
            render();
            toast("تم الحذف");
          }, "حذف");
        });
        actions.appendChild(delBtn);
      }
      body.appendChild(actions);
      amountInput.focus();
    }
    redraw();
  });
}

function selectRow(label, items, value, onChange) {
  var wrap = el("div", "form-row");
  wrap.appendChild(el("span", null, label));
  var select = el("select", "field");
  select.innerHTML = items.map(function (item) {
    return '<option value="' + esc(item.id) + '">' + esc((item.icon || "") + " " + item.name) + "</option>";
  }).join("");
  if (value) select.value = value;
  else if (items.length) onChange(items[0].id);
  select.addEventListener("change", function () { onChange(select.value); });
  wrap.appendChild(select);
  return wrap;
}

function commitTx(draft) {
  if (draft.amount <= 0) return toast("أدخل مبلغًا أكبر من صفر", "warning");
  if (!draft.accountId) return toast("أضف حسابًا أولًا", "warning");
  if (draft.type === "transfer") {
    if (!draft.toAccountId || draft.toAccountId === draft.accountId) return toast("اختر حسابين مختلفين", "warning");
    draft.categoryId = null;
  } else {
    if (!draft.categoryId) return toast("اختر الفئة", "warning");
    draft.toAccountId = null;
  }
  if (draft.id) {
    state.transactions = state.transactions.map(function (tx) {
      return tx.id === draft.id ? Object.assign({}, tx, draft) : tx;
    });
  } else {
    draft.id = uid();
    draft.createdAt = Date.now();
    state.transactions.push(draft);
  }
  save();
  closeSheet();
  ui.period = periodStartOf(dateOf(draft.date));
  render();
  warnIfOverBudget(draft);
  toast("تم الحفظ ✓");
}

/* تنبيه فوري عند تجاوز ميزانية الفئة أو الاقتراب منها. */
function warnIfOverBudget(tx) {
  if (tx.type !== "expense") return;
  var budget = state.budgets[tx.categoryId];
  if (!budget) return;
  var category = categoryById(tx.categoryId);
  var spent = spentByCategory(periodStartOf(dateOf(tx.date)))[tx.categoryId] || 0;
  var status = budgetStatus(spent, budget);
  if (status.key === "good") return;
  var over = spent - budget;
  var message = status.key === "critical"
    ? "⛔ تجاوزت ميزانية «" + category.name + "» بـ " + fmt(over)
    : "⚠️ اقتربت من حد ميزانية «" + category.name + "» — المتبقّي " + fmt(budget - spent);
  toast(message, status.key === "critical" ? "critical" : "warning");
}

function openAccountSheet(existing) {
  var draft = existing
    ? { id: existing.id, name: existing.name, icon: existing.icon, opening: existing.opening || 0 }
    : { id: null, name: "", icon: "👛", opening: 0 };

  openSheet(existing ? "تعديل الحساب" : "حساب جديد", function (body) {
    var nameWrap = el("div", "form-row");
    nameWrap.appendChild(el("span", null, "اسم الحساب"));
    var nameInput = el("input", "field");
    nameInput.value = draft.name;
    nameInput.placeholder = "مثال: الطوارئ والعلاج";
    nameWrap.appendChild(nameInput);
    body.appendChild(nameWrap);

    var iconWrap = el("div", "form-row");
    iconWrap.appendChild(el("span", null, "الأيقونة"));
    var chips = el("div", "chips");
    ["👛", "🏥", "📈", "🏦", "💵", "📱", "🏠", "🚗", "🎓", "🎁"].forEach(function (icon) {
      var chip = el("button", "chip" + (draft.icon === icon ? " is-on" : ""), icon);
      chip.type = "button";
      chip.addEventListener("click", function () {
        draft.icon = icon;
        $$(".chip", chips).forEach(function (other) { other.classList.remove("is-on"); });
        chip.classList.add("is-on");
      });
      chips.appendChild(chip);
    });
    iconWrap.appendChild(chips);
    body.appendChild(iconWrap);

    var openWrap = el("div", "form-row");
    openWrap.appendChild(el("span", null, "الرصيد الافتتاحي"));
    var openInput = el("input", "field");
    openInput.inputMode = "decimal";
    openInput.value = draft.opening ? String(fromMinor(draft.opening)) : "";
    openInput.placeholder = "0";
    openWrap.appendChild(openInput);
    body.appendChild(openWrap);

    var actions = el("div", "sheet-actions");
    var saveBtn = el("button", "btn", "حفظ");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function () {
      var name = nameInput.value.trim();
      if (!name) return toast("اكتب اسم الحساب", "warning");
      draft.name = name;
      draft.opening = toMinor(openInput.value);
      if (draft.id) {
        state.accounts = state.accounts.map(function (acc) {
          return acc.id === draft.id ? Object.assign({}, acc, draft) : acc;
        });
      } else {
        draft.id = uid();
        state.accounts.push(draft);
      }
      save();
      closeSheet();
      render();
      toast("تم الحفظ ✓");
    });
    actions.appendChild(saveBtn);

    if (existing) {
      var delBtn = el("button", "btn danger", "حذف");
      delBtn.type = "button";
      delBtn.addEventListener("click", function () {
        var used = state.transactions.some(function (tx) {
          return tx.accountId === existing.id || tx.toAccountId === existing.id;
        });
        if (used) return toast("لا يمكن حذف حساب له عمليات — يمكنك تغيير اسمه", "warning");
        state.accounts = state.accounts.filter(function (acc) { return acc.id !== existing.id; });
        save();
        closeSheet();
        render();
        toast("تم الحذف");
      });
      actions.appendChild(delBtn);
    }
    body.appendChild(actions);
  });
}

function openBudgetSheet(category) {
  openSheet("ميزانية «" + category.name + "»", function (body) {
    body.appendChild(el("p", "muted", "حدّ شهري يتكرر كل شهر. اتركه فارغًا أو صفرًا لإلغائه."));
    var input = el("input", "field amount-display");
    input.inputMode = "decimal";
    input.value = state.budgets[category.id] ? String(fromMinor(state.budgets[category.id])) : "";
    input.placeholder = "0";
    body.appendChild(input);
    body.appendChild(el("div", "amount-unit", state.settings.currency + " / شهريًا"));

    var actions = el("div", "sheet-actions");
    var saveBtn = el("button", "btn", "حفظ");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function () {
      var amount = toMinor(input.value);
      if (amount > 0) state.budgets[category.id] = amount;
      else delete state.budgets[category.id];
      save();
      closeSheet();
      render();
      toast("تم تحديث الميزانية ✓");
    });
    actions.appendChild(saveBtn);
    body.appendChild(actions);
    input.focus();
  });
}

function openCategoriesSheet() {
  openSheet("إدارة الفئات", function (body) {
    ["expense", "income"].forEach(function (kind) {
      body.appendChild(el("h3", "card-title", kind === "expense" ? "فئات المصاريف" : "فئات المداخيل"));
      var chips = el("div", "chips");
      categoriesOf(kind).forEach(function (category) {
        var chip = el("button", "chip", category.icon + " " + category.name);
        chip.type = "button";
        chip.addEventListener("click", function () { openCategoryEditor(category); });
        chips.appendChild(chip);
      });
      var addChip = el("button", "chip", "➕ فئة جديدة");
      addChip.type = "button";
      addChip.addEventListener("click", function () {
        openCategoryEditor({ id: null, name: "", icon: "🏷️", kind: kind });
      });
      chips.appendChild(addChip);
      body.appendChild(chips);
    });
  });
}

function openCategoryEditor(category) {
  var isNew = !category.id;
  openSheet(isNew ? "فئة جديدة" : "تعديل الفئة", function (body) {
    var nameWrap = el("div", "form-row");
    nameWrap.appendChild(el("span", null, "الاسم"));
    var nameInput = el("input", "field");
    nameInput.value = category.name;
    nameWrap.appendChild(nameInput);
    body.appendChild(nameWrap);

    var iconWrap = el("div", "form-row");
    iconWrap.appendChild(el("span", null, "الأيقونة"));
    var chips = el("div", "chips");
    var picked = category.icon;
    ["🍽️", "🚗", "🧾", "📱", "💊", "📚", "🛍️", "🏠", "🤲", "💼", "🧰", "📈", "🎁", "🏷️", "✈️", "☕"].forEach(function (icon) {
      var chip = el("button", "chip" + (picked === icon ? " is-on" : ""), icon);
      chip.type = "button";
      chip.addEventListener("click", function () {
        picked = icon;
        $$(".chip", chips).forEach(function (other) { other.classList.remove("is-on"); });
        chip.classList.add("is-on");
      });
      chips.appendChild(chip);
    });
    iconWrap.appendChild(chips);
    body.appendChild(iconWrap);

    var actions = el("div", "sheet-actions");
    var saveBtn = el("button", "btn", "حفظ");
    saveBtn.type = "button";
    saveBtn.addEventListener("click", function () {
      var name = nameInput.value.trim();
      if (!name) return toast("اكتب اسم الفئة", "warning");
      if (isNew) {
        state.categories.push({ id: uid(), name: name, icon: picked, kind: category.kind });
      } else {
        state.categories = state.categories.map(function (cat) {
          return cat.id === category.id ? Object.assign({}, cat, { name: name, icon: picked }) : cat;
        });
      }
      save();
      closeSheet();
      render();
      toast("تم الحفظ ✓");
    });
    actions.appendChild(saveBtn);

    if (!isNew) {
      var delBtn = el("button", "btn danger", "حذف");
      delBtn.type = "button";
      delBtn.addEventListener("click", function () {
        var used = state.transactions.some(function (tx) { return tx.categoryId === category.id; });
        if (used) return toast("لا يمكن حذف فئة لها عمليات — يمكنك تغيير اسمها", "warning");
        state.categories = state.categories.filter(function (cat) { return cat.id !== category.id; });
        delete state.budgets[category.id];
        save();
        closeSheet();
        render();
        toast("تم الحذف");
      });
      actions.appendChild(delBtn);
    }
    body.appendChild(actions);
  });
}

function recurringSummary(rule) {
  var category = categoryById(rule.categoryId);
  var account = accountById(rule.accountId);
  return (rule.type === "income" ? "مدخول" : "مصروف") + " · " + (category ? category.name : "؟") +
    " · " + (account ? account.name : "؟") + " · يوم " + (rule.dayOfMonth || 1);
}

function openRecurringSheet() {
  openSheet("العمليات الثابتة", function (body) {
    body.appendChild(el("p", "muted", "تُسجَّل تلقائيًا كل شهر في يومها المحدد (إيجار، فواتير، راتب…)."));
    var rules = state.recurring || [];
    if (!rules.length) {
      body.appendChild(el("p", "empty", "لا توجد عمليات ثابتة بعد."));
    }
    rules.forEach(function (rule) {
      var row = el("button", "acc-row");
      row.type = "button";
      row.innerHTML =
        '<span class="ic">' + (rule.active === false ? "⏸️" : "🔁") + "</span>" +
        '<span class="grow">' + esc(rule.note || (categoryById(rule.categoryId) || {}).name || "عملية ثابتة") +
        '<span class="sub">' + esc(recurringSummary(rule)) + "</span></span>" +
        '<span class="big-num" dir="ltr">' + esc(fmt(rule.amount)) + "</span>";
      row.addEventListener("click", function () { openRecurringEditor(rule); });
      body.appendChild(row);
    });
    var addBtn = el("button", "btn", "+ عملية ثابتة");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      openRecurringEditor({
        id: null, type: "expense", amount: 0,
        accountId: state.accounts.length ? state.accounts[0].id : null,
        categoryId: null, note: "", dayOfMonth: 1, startDate: todayIso(), active: true
      });
    });
    body.appendChild(addBtn);
  });
}

function openRecurringEditor(rule) {
  var draft = JSON.parse(JSON.stringify(rule));
  var isNew = !draft.id;

  openSheet(isNew ? "عملية ثابتة جديدة" : "تعديل العملية الثابتة", function (body) {
    function redraw() {
      body.innerHTML = "";

      var seg = el("div", "seg");
      [["expense", "مصروف"], ["income", "مدخول"]].forEach(function (pair) {
        var button = el("button", draft.type === pair[0] ? "is-on" : null, pair[1]);
        button.type = "button";
        button.addEventListener("click", function () {
          draft.type = pair[0];
          draft.categoryId = null;
          redraw();
        });
        seg.appendChild(button);
      });
      body.appendChild(seg);

      var amountInput = el("input", "field amount-display");
      amountInput.inputMode = "decimal";
      amountInput.value = draft.amount ? String(fromMinor(draft.amount)) : "";
      amountInput.placeholder = "0";
      amountInput.setAttribute("aria-label", "المبلغ");
      body.appendChild(amountInput);
      body.appendChild(el("div", "amount-unit", state.settings.currency + " / شهريًا"));

      var chips = el("div", "chips");
      categoriesOf(draft.type).forEach(function (category) {
        var chip = el("button", "chip" + (draft.categoryId === category.id ? " is-on" : ""),
          category.icon + " " + category.name);
        chip.type = "button";
        chip.addEventListener("click", function () {
          draft.categoryId = category.id;
          draft.amount = toMinor(amountInput.value);
          draft.note = noteInput.value;
          redraw();
        });
        chips.appendChild(chip);
      });
      var catWrap = el("div", "form-row");
      catWrap.appendChild(el("span", null, "الفئة"));
      catWrap.appendChild(chips);
      body.appendChild(catWrap);

      body.appendChild(selectRow("الحساب", state.accounts, draft.accountId, function (value) {
        draft.accountId = value;
      }));

      var dayWrap = el("div", "form-row");
      dayWrap.appendChild(el("span", null, "يوم الشهر"));
      var daySelect = el("select", "field");
      var options = "";
      for (var day = 1; day <= 28; day++) options += '<option value="' + day + '">' + day + "</option>";
      daySelect.innerHTML = options;
      daySelect.value = String(draft.dayOfMonth || 1);
      daySelect.addEventListener("change", function () { draft.dayOfMonth = Number(daySelect.value); });
      dayWrap.appendChild(daySelect);
      body.appendChild(dayWrap);

      var startWrap = el("div", "form-row");
      startWrap.appendChild(el("span", null, "تبدأ من"));
      var startInput = el("input", "field");
      startInput.type = "date";
      startInput.value = draft.startDate || todayIso();
      startWrap.appendChild(startInput);
      body.appendChild(startWrap);

      var noteWrap = el("div", "form-row");
      noteWrap.appendChild(el("span", null, "ملاحظة (اختياري)"));
      var noteInput = el("input", "field");
      noteInput.value = draft.note || "";
      noteWrap.appendChild(noteInput);
      body.appendChild(noteWrap);

      var activeWrap = el("label", "setting");
      activeWrap.appendChild(el("span", null, "مفعّلة"));
      var activeInput = el("input");
      activeInput.type = "checkbox";
      activeInput.checked = draft.active !== false;
      activeWrap.appendChild(activeInput);
      body.appendChild(activeWrap);

      var actions = el("div", "sheet-actions");
      var saveBtn = el("button", "btn", "حفظ");
      saveBtn.type = "button";
      saveBtn.addEventListener("click", function () {
        draft.amount = toMinor(amountInput.value);
        draft.note = noteInput.value.trim();
        draft.dayOfMonth = Number(daySelect.value) || 1;
        draft.startDate = startInput.value || todayIso();
        draft.active = activeInput.checked;
        if (draft.amount <= 0) return toast("أدخل مبلغًا أكبر من صفر", "warning");
        if (!draft.categoryId) return toast("اختر الفئة", "warning");
        if (!draft.accountId) return toast("اختر الحساب", "warning");
        if (isNew) {
          draft.id = uid();
          state.recurring.push(draft);
        } else {
          state.recurring = state.recurring.map(function (item) {
            return item.id === draft.id ? draft : item;
          });
        }
        save();
        var added = postDueRecurring();
        closeSheet();
        render();
        toast(added ? "تم الحفظ ✓ وسُجّلت " + added + " عملية مستحقة" : "تم الحفظ ✓");
      });
      actions.appendChild(saveBtn);

      if (!isNew) {
        var delBtn = el("button", "btn danger", "حذف القاعدة");
        delBtn.type = "button";
        delBtn.addEventListener("click", function () {
          askConfirm("حذف هذه القاعدة؟ العمليات المسجّلة سابقًا تبقى كما هي.", function () {
            state.recurring = state.recurring.filter(function (item) { return item.id !== draft.id; });
            save();
            closeSheet();
            render();
            toast("تم الحذف");
          }, "حذف");
        });
        actions.appendChild(delBtn);
      }
      body.appendChild(actions);
    }
    redraw();
  });
}

function openMonthSheet() {
  openSheet("اختيار الشهر", function (body) {
    var input = el("input", "field");
    input.type = "month";
    input.value = ui.period.getFullYear() + "-" + String(ui.period.getMonth() + 1).padStart(2, "0");
    body.appendChild(input);
    var actions = el("div", "sheet-actions");
    var okBtn = el("button", "btn", "عرض");
    okBtn.type = "button";
    okBtn.addEventListener("click", function () {
      var parts = input.value.split("-");
      if (parts.length === 2) {
        ui.period = new Date(Number(parts[0]), Number(parts[1]) - 1, state.settings.startDay || 1);
        closeSheet();
        render();
      }
    });
    var nowBtn = el("button", "btn ghost", "الشهر الحالي");
    nowBtn.type = "button";
    nowBtn.addEventListener("click", function () {
      ui.period = periodStartOf(new Date());
      closeSheet();
      render();
    });
    actions.appendChild(okBtn);
    actions.appendChild(nowBtn);
    body.appendChild(actions);
  });
}
/* End Sheets */

/* Start Settings */
function renderSettings() {
  $("#set-currency").value = state.settings.currency;
  $("#set-theme").value = state.settings.theme || "auto";
  var startSelect = $("#set-start-day");
  if (!startSelect.options.length) {
    var options = "";
    for (var day = 1; day <= 28; day++) options += '<option value="' + day + '">' + day + "</option>";
    startSelect.innerHTML = options;
  }
  startSelect.value = String(state.settings.startDay || 1);
  $("#app-version").textContent = APP_VERSION;
}

function exportJson() {
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  downloadBlob(blob, "money-manager-" + todayIso() + ".json");
}

function exportCsv() {
  var header = ["التاريخ", "النوع", "الفئة", "الحساب", "إلى حساب", "المبلغ", "ملاحظة"];
  var lines = [header.join(",")];
  state.transactions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (tx) {
    var category = categoryById(tx.categoryId);
    var from = accountById(tx.accountId);
    var to = accountById(tx.toAccountId);
    var kind = tx.type === "income" ? "مدخول" : tx.type === "expense" ? "مصروف" : "تحويل";
    var cells = [tx.date, kind, category ? category.name : "", from ? from.name : "", to ? to.name : "",
      String(fromMinor(tx.amount)), tx.note || ""];
    lines.push(cells.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(","));
  });
  downloadBlob(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    "money-manager-" + todayIso() + ".csv");
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var link = el("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function backupText() {
  return JSON.stringify(state, null, 2);
}

function copyBackup() {
  var text = backupText();
  function fallback() {
    openSheet("نسخة احتياطية", function (body) {
      body.appendChild(el("p", "muted", "انسخ النص كاملًا واحفظه في مكان آمن."));
      var area = el("textarea", "field backup-area");
      area.value = text;
      area.readOnly = true;
      body.appendChild(area);
      area.focus();
      area.select();
    });
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      toast("نُسخت النسخة الاحتياطية ✓");
    }, fallback);
  } else {
    fallback();
  }
}

function pasteBackup() {
  openSheet("لصق نسخة احتياطية", function (body) {
    body.appendChild(el("p", "muted", "الصق هنا محتوى نسخة JSON سبق أن نسختها أو صدّرتها."));
    var area = el("textarea", "field backup-area");
    area.placeholder = '{ "accounts": [...], "transactions": [...] }';
    body.appendChild(area);
    var actions = el("div", "sheet-actions");
    var okBtn = el("button", "btn", "استيراد");
    okBtn.type = "button";
    okBtn.addEventListener("click", function () { applyBackup(area.value); });
    actions.appendChild(okBtn);
    body.appendChild(actions);
    area.focus();
  });
}

function applyBackup(raw) {
  var data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return toast("النص ليس JSON صالحًا", "critical");
  }
  if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
    return toast("النسخة غير صالحة", "critical");
  }
  askConfirm("سيتم استبدال البيانات الحالية بمحتوى النسخة. متابعة؟", function () {
    state = {
      version: 1,
      settings: Object.assign({ currency: "MRU", theme: "auto", startDay: 1 }, data.settings || {}),
      accounts: data.accounts,
      categories: data.categories || [],
      budgets: data.budgets || {},
      recurring: data.recurring || [],
      transactions: data.transactions
    };
    save();
    applyTheme();
    closeSheet();
    ui.period = periodStartOf(new Date());
    render();
    toast("تم الاستيراد ✓");
  }, "استبدال");
}

function importJson(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
        return toast("الملف غير صالح", "critical");
      }
      askConfirm("سيتم استبدال البيانات الحالية بمحتوى النسخة. متابعة؟", function () {
        state = {
          version: 1,
          settings: Object.assign({ currency: "MRU", theme: "auto", startDay: 1 }, data.settings || {}),
          accounts: data.accounts,
          categories: data.categories || [],
          budgets: data.budgets || {},
          recurring: data.recurring || [],
          transactions: data.transactions
        };
        save();
        applyTheme();
        closeSheet();
        ui.period = periodStartOf(new Date());
        render();
        toast("تم الاستيراد ✓");
      }, "استبدال");
    } catch (err) {
      toast("تعذّرت قراءة الملف", "critical");
    }
  };
  reader.readAsText(file);
}
/* End Settings */

/* Start Wiring */
function wire() {
  $("#tabbar").addEventListener("click", function (event) {
    var button = event.target.closest("[data-go]");
    if (button) go(button.dataset.go);
  });
  document.addEventListener("click", function (event) {
    var button = event.target.closest("main [data-go]");
    if (button) go(button.dataset.go);
  });
  $("#month-nav").addEventListener("click", function (event) {
    var button = event.target.closest("[data-month-step]");
    if (!button) return;
    ui.period = shiftPeriod(ui.period, Number(button.dataset.monthStep));
    render();
  });
  $("#month-label").addEventListener("click", openMonthSheet);
  $("#fab").addEventListener("click", function () { openTxSheet(null); });
  $("#sheet-close").addEventListener("click", closeSheet);
  $("#sheet-backdrop").addEventListener("click", function (event) {
    if (event.target === $("#sheet-backdrop")) closeSheet();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !$("#sheet-backdrop").hidden) closeSheet();
  });
  $("#theme-btn").addEventListener("click", function () {
    var order = ["auto", "light", "dark"];
    var next = order[(order.indexOf(state.settings.theme || "auto") + 1) % order.length];
    state.settings.theme = next;
    save();
    applyTheme();
  });
  $("#toggle-table").addEventListener("click", function () {
    ui.showTable = !ui.showTable;
    renderBreakdown();
  });
  $("#tx-search").addEventListener("input", function (event) {
    ui.filters.q = event.target.value;
    renderTx();
  });
  $("#tx-account").addEventListener("change", function (event) {
    ui.filters.account = event.target.value;
    renderTx();
  });
  $("#tx-kind").addEventListener("change", function (event) {
    ui.filters.kind = event.target.value;
    renderTx();
  });
  $("#add-account").addEventListener("click", function () { openAccountSheet(null); });
  $("#add-transfer").addEventListener("click", function () {
    if (state.accounts.length < 2) return toast("تحتاج حسابين على الأقل", "warning");
    openTxSheet({
      id: null, type: "transfer", amount: 0,
      accountId: state.accounts[0].id, toAccountId: state.accounts[1].id,
      categoryId: null, note: "", date: todayIso()
    });
  });
  $("#manage-categories").addEventListener("click", openCategoriesSheet);
  $("#manage-recurring").addEventListener("click", openRecurringSheet);
  $("#toggle-trend").addEventListener("click", function () {
    ui.showTrendTable = !ui.showTrendTable;
    renderTrend();
  });
  $("#tx-all-months").addEventListener("change", function (event) {
    ui.filters.allMonths = event.target.checked;
    renderTx();
  });
  $("#set-currency").addEventListener("change", function (event) {
    state.settings.currency = event.target.value.trim() || "MRU";
    save();
    render();
  });
  $("#set-theme").addEventListener("change", function (event) {
    state.settings.theme = event.target.value;
    save();
    applyTheme();
  });
  $("#set-start-day").addEventListener("change", function (event) {
    state.settings.startDay = Number(event.target.value) || 1;
    save();
    ui.period = periodStartOf(new Date());
    render();
  });
  $("#export-btn").addEventListener("click", exportJson);
  $("#csv-btn").addEventListener("click", exportCsv);
  $("#import-btn").addEventListener("click", function () { $("#import-file").click(); });
  $("#copy-btn").addEventListener("click", copyBackup);
  $("#paste-btn").addEventListener("click", pasteBackup);
  $("#import-file").addEventListener("change", function (event) {
    if (event.target.files && event.target.files[0]) importJson(event.target.files[0]);
    event.target.value = "";
  });
  $("#wipe-btn").addEventListener("click", function () {
    askConfirm("سيتم حذف كل الحسابات والعمليات نهائيًا. هل حفظت نسخة احتياطية؟", function () {
      state = seed();
      save();
      applyTheme();
      ui.period = periodStartOf(new Date());
      render();
      toast("تم حذف البيانات");
    }, "حذف كل شيء");
  });
}

/* Start PWA */
var deferredPrompt = null;
window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  deferredPrompt = event;
  var button = $("#install-btn");
  button.hidden = false;
  $("#install-hint").textContent = "اضغط «تنصيب التطبيق» ليظهر على شاشتك الرئيسية ويعمل بدون إنترنت.";
});
function wireInstall() {
  $("#install-btn").addEventListener("click", function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      $("#install-btn").hidden = true;
    });
  });
  if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
    $("#install-hint").textContent = "التطبيق مُنصَّب على هذا الجهاز ✓";
  } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    $("#install-hint").textContent = "على iPhone: من متصفح Safari اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».";
  }
}
/* End PWA */

function init() {
  document.documentElement.setAttribute("dir", "rtl");
  document.documentElement.setAttribute("lang", "ar");
  load();
  applyTheme();
  ui.period = periodStartOf(new Date());
  var posted = postDueRecurring();
  wire();
  wireInstall();
  go("home");
  if (posted) toast("سُجّلت " + posted + " عملية ثابتة مستحقة");
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* التخزين للعمل دون إنترنت غير متاح */ });
    });
  }
}
init();
/* End Wiring */
