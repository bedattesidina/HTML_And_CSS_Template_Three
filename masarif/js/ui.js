/* ==========================================================================
   ui.js — أدوات الواجهة: بناء العناصر، اللوح المنسدل، الحوارات، التنبيهات، القفل
   ========================================================================== */
'use strict';

var UI = (function () {

  /* ----- بناء العناصر ----- */

  /**
   * h('div', { class:'x', text:'مرحبا', onclick: fn }, parent)
   * السمات الخاصة: text، html، dataset، style (نص)، وأي onXxx كمستمع.
   */
  function h(tag, attrs, parent) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset') { for (var d in v) node.dataset[d] = v[d]; }
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) node.setAttribute(k, '');
        else node.setAttribute(k, v);
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function icon(id, cls) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (cls) svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ----- اللوح المنسدل ----- */

  var sheetEl, scrimEl, sheetBody, sheetTitle, sheetAction, sheetClose;
  var sheetState = { open: false, onAction: null, onClose: null, lastFocus: null };

  function initSheet() {
    sheetEl = document.getElementById('sheet');
    scrimEl = document.getElementById('scrim');
    sheetBody = document.getElementById('sheetBody');
    sheetTitle = document.getElementById('sheetTitle');
    sheetAction = document.getElementById('sheetAction');
    sheetClose = document.getElementById('sheetClose');

    sheetClose.addEventListener('click', function () { closeSheet(); });
    scrimEl.addEventListener('click', function () { closeSheet(); });
    sheetAction.addEventListener('click', function () {
      if (sheetState.onAction) sheetState.onAction();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (alertState.open) resolveAlert(false);
        else if (sheetState.open) closeSheet();
      }
    });
  }

  /**
   * openSheet({ title, action, onAction, build(body), onClose, cancelLabel })
   * build يستقبل عنصر المحتوى ويملؤه.
   */
  function openSheet(cfg) {
    sheetState.lastFocus = document.activeElement;
    sheetTitle.textContent = cfg.title || '';
    clear(sheetBody);

    if (cfg.action) {
      sheetAction.textContent = cfg.action;
      sheetAction.hidden = false;
      sheetState.onAction = cfg.onAction || null;
    } else {
      sheetAction.hidden = true;
      sheetState.onAction = null;
    }
    sheetClose.textContent = cfg.cancelLabel || 'إلغاء';
    sheetState.onClose = cfg.onClose || null;

    if (cfg.build) cfg.build(sheetBody);

    sheetEl.hidden = false;
    scrimEl.hidden = false;
    // إطار واحد قبل إضافة الصنف حتى تعمل الحركة
    requestAnimationFrame(function () {
      sheetEl.classList.add('is-open');
      scrimEl.classList.add('is-open');
    });
    sheetState.open = true;
    document.body.style.overflow = 'hidden';

    var focusable = sheetBody.querySelector('input, select, textarea, button');
    if (focusable && !cfg.noAutofocus) setTimeout(function () { focusable.focus(); }, 260);
  }

  function closeSheet(skipCallback) {
    if (!sheetState.open) return;
    sheetEl.classList.remove('is-open');
    scrimEl.classList.remove('is-open');
    sheetState.open = false;
    document.body.style.overflow = '';
    if (!skipCallback && sheetState.onClose) sheetState.onClose();
    sheetState.onAction = null;
    sheetState.onClose = null;
    setTimeout(function () {
      if (!sheetState.open) { sheetEl.hidden = true; scrimEl.hidden = true; clear(sheetBody); }
    }, 280);
    if (sheetState.lastFocus && sheetState.lastFocus.focus) {
      try { sheetState.lastFocus.focus(); } catch (e) {}
    }
  }

  function sheetIsOpen() { return sheetState.open; }

  /* ----- حوار تأكيد ----- */

  var alertEl = null, alertState = { open: false, resolve: null };

  function buildAlertHost() {
    if (alertEl) return alertEl;
    alertEl = h('div', { class: 'alert-host', hidden: true }, document.body);
    h('div', { class: 'alert-scrim' }, alertEl);
    h('div', { class: 'alert', role: 'alertdialog', 'aria-modal': 'true' }, alertEl);
    alertEl.querySelector('.alert-scrim').addEventListener('click', function () { resolveAlert(false); });
    return alertEl;
  }

  /**
   * confirm({ title, message, ok, cancel, danger }) → Promise<boolean>
   */
  function confirm(cfg) {
    buildAlertHost();
    var box = alertEl.querySelector('.alert');
    clear(box);
    h('h3', { text: cfg.title || 'تأكيد' }, box);
    if (cfg.message) h('p', { text: cfg.message }, box);
    var actions = h('div', { class: 'alert-actions' }, box);
    h('button', {
      type: 'button', class: 'btn ghost', text: cfg.cancel || 'إلغاء',
      onclick: function () { resolveAlert(false); }
    }, actions);
    h('button', {
      type: 'button', class: 'btn' + (cfg.danger ? ' danger' : ''), text: cfg.ok || 'تأكيد',
      onclick: function () { resolveAlert(true); }
    }, actions);

    alertEl.hidden = false;
    requestAnimationFrame(function () { alertEl.classList.add('is-open'); });
    alertState.open = true;
    setTimeout(function () {
      var b = box.querySelectorAll('button');
      if (b[1]) b[1].focus();
    }, 60);

    return new Promise(function (resolve) { alertState.resolve = resolve; });
  }

  function resolveAlert(value) {
    if (!alertState.open) return;
    alertEl.classList.remove('is-open');
    alertState.open = false;
    setTimeout(function () { if (!alertState.open) alertEl.hidden = true; }, 200);
    var r = alertState.resolve;
    alertState.resolve = null;
    if (r) r(value);
  }

  /* ----- التنبيه المؤقت ----- */

  var toastEl, toastTimer = null;

  function toast(message, ms) {
    if (!toastEl) toastEl = document.getElementById('toast');
    toastEl.firstElementChild.textContent = message;
    toastEl.classList.add('is-open');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-open'); }, ms || 2400);
  }

  /* ----- حقول النماذج ----- */

  /** حقل نصي/رقمي/تاريخ مع تسمية ورسالة خطأ. */
  function field(parent, cfg) {
    var wrap = h('div', { class: 'field' }, parent);
    var id = cfg.id || ('f' + Math.random().toString(36).slice(2, 8));
    h('label', { for: id, text: cfg.label }, wrap);
    var input;
    if (cfg.type === 'textarea') {
      input = h('textarea', { id: id, rows: cfg.rows || 2, placeholder: cfg.placeholder || '' }, wrap);
    } else if (cfg.type === 'select') {
      input = h('select', { id: id }, wrap);
      (cfg.options || []).forEach(function (o) {
        h('option', { value: o.value, text: o.label, selected: o.value === cfg.value }, input);
      });
    } else {
      input = h('input', {
        id: id, type: cfg.type || 'text', placeholder: cfg.placeholder || '',
        inputmode: cfg.inputmode, min: cfg.min, max: cfg.max, step: cfg.step,
        autocomplete: cfg.autocomplete || 'off'
      }, wrap);
    }
    if (cfg.value !== undefined && cfg.type !== 'select') input.value = cfg.value;
    if (cfg.hint) h('p', { class: 'hint', text: cfg.hint }, wrap);
    h('p', { class: 'err-msg', text: cfg.error || 'هذا الحقل مطلوب' }, wrap);
    wrap.input = input;
    wrap.setError = function (msg) {
      wrap.classList.add('err');
      if (msg) wrap.querySelector('.err-msg').textContent = msg;
    };
    wrap.clearError = function () { wrap.classList.remove('err'); };
    input.addEventListener('input', function () { wrap.clearError(); });
    return wrap;
  }

  /** حقل المبلغ الكبير مع رمز العملة. */
  function amountField(parent, cfg) {
    cfg = cfg || {};
    var wrap = h('div', { class: 'field' }, parent);
    h('label', { for: 'amtIn', text: cfg.label || 'المبلغ' }, wrap);
    var box = h('div', { class: 'amount-input' }, wrap);
    var input = h('input', {
      id: 'amtIn', type: 'text', inputmode: 'decimal', placeholder: '0',
      value: cfg.value != null ? cfg.value : '', autocomplete: 'off'
    }, box);
    h('span', { class: 'cur', text: Fmt.symbol() }, box);
    h('p', { class: 'err-msg', text: 'أدخل مبلغًا أكبر من صفر' }, wrap);
    wrap.input = input;
    wrap.setError = function (m) { wrap.classList.add('err'); if (m) wrap.querySelector('.err-msg').textContent = m; };
    wrap.clearError = function () { wrap.classList.remove('err'); };
    input.addEventListener('input', function () { wrap.clearError(); });
    return wrap;
  }

  /** شبكة اختيار واحدة من عدة خيارات (فئة، هدف، حساب). */
  function pickerGrid(parent, cfg) {
    var wrap = h('div', { class: 'field' }, parent);
    if (cfg.label) h('label', { text: cfg.label }, wrap);
    var grid = h('div', { class: 'picker-grid', role: 'radiogroup', 'aria-label': cfg.label || '' }, wrap);
    var selected = cfg.value || null;
    var buttons = [];

    (cfg.items || []).forEach(function (item) {
      var btn = h('button', {
        type: 'button', role: 'radio',
        'aria-pressed': item.id === selected ? 'true' : 'false',
        'aria-checked': item.id === selected ? 'true' : 'false',
        onclick: function () {
          selected = item.id;
          buttons.forEach(function (b) {
            var on = b.dataset.id === selected;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.setAttribute('aria-checked', on ? 'true' : 'false');
          });
          wrap.clearError();
          if (cfg.onChange) cfg.onChange(selected);
        },
        dataset: { id: item.id }
      }, grid);
      h('span', { class: 'e', text: item.icon || '📌' }, btn);
      h('span', { text: item.name }, btn);
      buttons.push(btn);
    });

    h('p', { class: 'err-msg', text: cfg.error || 'اختر عنصرًا' }, wrap);
    wrap.value = function () { return selected; };
    wrap.setError = function (m) { wrap.classList.add('err'); if (m) wrap.querySelector('.err-msg').textContent = m; };
    wrap.clearError = function () { wrap.classList.remove('err'); };
    return wrap;
  }

  /** مفتاح تشغيل/إيقاف. */
  function toggle(parent, cfg) {
    var row = h('label', { class: 'set-row' }, parent);
    var body = h('span', { class: 'body' }, row);
    h('span', { text: cfg.label }, body);
    if (cfg.hint) h('span', { class: 's', text: cfg.hint }, body);
    var sw = h('span', { class: 'switch' }, row);
    var input = h('input', { type: 'checkbox', checked: !!cfg.checked }, sw);
    h('span', null, sw);
    input.addEventListener('change', function () { if (cfg.onChange) cfg.onChange(input.checked); });
    row.input = input;
    return row;
  }

  /** مجموعة أزرار مقسّمة (segmented control). */
  function segmented(parent, items, value, onChange) {
    var seg = h('div', { class: 'seg', role: 'tablist' }, parent);
    var current = value;
    items.forEach(function (it) {
      h('button', {
        type: 'button', role: 'tab',
        'aria-selected': it.value === current ? 'true' : 'false',
        text: it.label,
        onclick: function () {
          current = it.value;
          Array.prototype.forEach.call(seg.children, function (b, i) {
            b.setAttribute('aria-selected', items[i].value === current ? 'true' : 'false');
          });
          onChange(current);
        }
      }, seg);
    });
    seg.setValue = function (v) {
      current = v;
      Array.prototype.forEach.call(seg.children, function (b, i) {
        b.setAttribute('aria-selected', items[i].value === current ? 'true' : 'false');
      });
    };
    return seg;
  }

  /** حالة فراغ. */
  function empty(parent, cfg) {
    var box = h('div', { class: 'empty' }, parent);
    h('div', { class: 'ico', text: cfg.icon || '🗂️', 'aria-hidden': 'true' }, box);
    h('p', { class: 't', text: cfg.title }, box);
    if (cfg.sub) h('p', { class: 's', text: cfg.sub }, box);
    if (cfg.action) {
      h('button', { type: 'button', class: 'btn sm', text: cfg.action, onclick: cfg.onAction, style: 'margin-top:14px' }, box);
    }
    return box;
  }

  /* ----- شاشة القفل برمز PIN ----- */

  var lock = (function () {
    var root, dots, msg, pad, entered = '', mode = 'verify', firstEntry = '', onDone = null;

    function init() {
      root = document.getElementById('lock');
      dots = document.getElementById('lockDots');
      msg = document.getElementById('lockMsg');
      pad = document.getElementById('keypad');
      buildPad();
    }

    function buildPad() {
      clear(pad);
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].forEach(function (k) {
        if (k === 'clear') {
          h('button', { type: 'button', class: 'wide', text: 'مسح', onclick: function () { entered = ''; paint(); } }, pad);
        } else if (k === 'back') {
          h('button', { type: 'button', class: 'wide', text: 'حذف', onclick: function () { entered = entered.slice(0, -1); paint(); } }, pad);
        } else {
          h('button', { type: 'button', text: Fmt.digits(k), onclick: function () { press(k); } }, pad);
        }
      });
    }

    function paint() {
      Array.prototype.forEach.call(dots.children, function (d, i) {
        d.classList.toggle('on', i < entered.length);
      });
    }

    function press(k) {
      if (entered.length >= 4) return;
      entered += k;
      paint();
      if (entered.length === 4) setTimeout(submit, 120);
    }

    function submit() {
      var pin = entered;
      entered = '';
      paint();
      if (mode === 'verify') {
        if (pin === DB.settings().pin) { hide(); if (onDone) onDone(true); }
        else { msg.textContent = 'الرمز غير صحيح، حاول مرة أخرى.'; shake(); }
      } else if (mode === 'set') {
        firstEntry = pin;
        mode = 'confirm';
        document.getElementById('lockTitle').textContent = 'أعد إدخال الرمز للتأكيد';
        msg.textContent = '';
      } else if (mode === 'confirm') {
        if (pin === firstEntry) {
          DB.setSetting('pin', pin);
          DB.setSetting('lockEnabled', true);
          hide();
          toast('تم تعيين رمز القفل');
          if (onDone) onDone(true);
        } else {
          mode = 'set';
          document.getElementById('lockTitle').textContent = 'أدخل رمزًا من ٤ أرقام';
          msg.textContent = 'الرمزان غير متطابقين، ابدأ من جديد.';
          shake();
        }
      }
    }

    function shake() {
      dots.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
         { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
        { duration: 240 }
      );
    }

    function show(nextMode, done) {
      if (!root) init();
      mode = nextMode || 'verify';
      entered = '';
      firstEntry = '';
      onDone = done || null;
      msg.textContent = '';
      buildPad();   // نعيد بناءها لتتبع شكل الأرقام المختار في الإعدادات
      document.getElementById('lockTitle').textContent =
        mode === 'verify' ? 'أدخل رمز القفل' : 'أدخل رمزًا من ٤ أرقام';
      paint();
      root.classList.add('is-open');
    }

    function hide() { if (root) root.classList.remove('is-open'); }
    function isOpen() { return root && root.classList.contains('is-open'); }

    return { init: init, show: show, hide: hide, isOpen: isOpen };
  })();

  /* ----- تنزيل ملف من المتصفح ----- */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: filename }, document.body);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = h('input', { type: 'file', accept: accept || '.json,application/json', style: 'position:fixed;inset-inline-start:-9999px' }, document.body);
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        input.remove();
        if (!f) { resolve(null); return; }
        var reader = new FileReader();
        reader.onload = function () { resolve({ name: f.name, text: String(reader.result) }); };
        reader.onerror = function () { resolve(null); };
        reader.readAsText(f);
      });
      input.click();
    });
  }

  return {
    h: h, clear: clear, icon: icon, esc: esc,
    initSheet: initSheet, openSheet: openSheet, closeSheet: closeSheet, sheetIsOpen: sheetIsOpen,
    confirm: confirm, toast: toast,
    field: field, amountField: amountField, pickerGrid: pickerGrid,
    toggle: toggle, segmented: segmented, empty: empty,
    lock: lock, download: download, pickFile: pickFile
  };
})();
