/* ==========================================================================
   format.js — تنسيق الأرقام والعملات والتواريخ بالعربية
   ملف عادي (بدون وحدات) حتى يعمل التطبيق عند فتح index.html مباشرة.
   ========================================================================== */
'use strict';

var Fmt = (function () {

  /* ----- العملات المدعومة ----- */
  var CURRENCIES = {
    MRU: { name: 'أوقية موريتانية', symbol: 'أوقية', decimals: 0 },
    MAD: { name: 'درهم مغربي',      symbol: 'د.م',   decimals: 2 },
    DZD: { name: 'دينار جزائري',    symbol: 'د.ج',   decimals: 2 },
    TND: { name: 'دينار تونسي',     symbol: 'د.ت',   decimals: 3 },
    LYD: { name: 'دينار ليبي',      symbol: 'د.ل',   decimals: 3 },
    EGP: { name: 'جنيه مصري',       symbol: 'ج.م',   decimals: 2 },
    SAR: { name: 'ريال سعودي',      symbol: 'ر.س',   decimals: 2 },
    AED: { name: 'درهم إماراتي',    symbol: 'د.إ',   decimals: 2 },
    QAR: { name: 'ريال قطري',       symbol: 'ر.ق',   decimals: 2 },
    KWD: { name: 'دينار كويتي',     symbol: 'د.ك',   decimals: 3 },
    BHD: { name: 'دينار بحريني',    symbol: 'د.ب',   decimals: 3 },
    OMR: { name: 'ريال عُماني',      symbol: 'ر.ع',   decimals: 3 },
    JOD: { name: 'دينار أردني',     symbol: 'د.أ',   decimals: 3 },
    IQD: { name: 'دينار عراقي',     symbol: 'د.ع',   decimals: 0 },
    YER: { name: 'ريال يمني',       symbol: 'ر.ي',   decimals: 0 },
    SDG: { name: 'جنيه سوداني',     symbol: 'ج.س',   decimals: 2 },
    SYP: { name: 'ليرة سورية',      symbol: 'ل.س',   decimals: 0 },
    USD: { name: 'دولار أمريكي',    symbol: '$',     decimals: 2 },
    EUR: { name: 'يورو',            symbol: '€',     decimals: 2 }
  };

  /* أرقام هندية-عربية للعرض الاختياري */
  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  var MONTHS_SHORT = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون',
                      'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];

  var WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  /* الإعدادات الحالية — يحدّثها db.js عند كل تغيير */
  var conf = { currency: 'MRU', decimals: 0, digits: 'latin', calendar: 'greg' };

  function setConfig(next) {
    if (!next) return;
    if (next.currency && CURRENCIES[next.currency]) conf.currency = next.currency;
    if (typeof next.decimals === 'number') conf.decimals = next.decimals;
    if (next.digits) conf.digits = next.digits;
    if (next.calendar) conf.calendar = next.calendar;
  }

  function currency() { return CURRENCIES[conf.currency] || CURRENCIES.MRU; }
  function symbol() { return currency().symbol; }

  /* ----- الأرقام ----- */

  function toArabicDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; });
  }

  function digits(s) {
    return conf.digits === 'arabic' ? toArabicDigits(s) : String(s);
  }

  /** تجميع الآلاف يدويًا حتى لا تتغيّر النتيجة بتغيّر لغة المتصفح. */
  function groupInt(intStr) {
    var out = '';
    for (var i = 0; i < intStr.length; i++) {
      if (i > 0 && (intStr.length - i) % 3 === 0) out += ',';
      out += intStr[i];
    }
    return out;
  }

  /**
   * يحوّل رقمًا إلى نص مجمَّع. الأرقام الكبيرة بلا كسور افتراضيًا لأن
   * الأوقية لا تُستعمل عمليًا بالكسور.
   */
  function num(value, decimals) {
    var d = typeof decimals === 'number' ? decimals : conf.decimals;
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    var neg = n < 0;
    var fixed = Math.abs(n).toFixed(d);
    var parts = fixed.split('.');
    var out = groupInt(parts[0]) + (parts[1] ? '.' + parts[1] : '');
    return digits((neg ? '-' : '') + out);
  }

  /** مبلغ مع رمز العملة، مثل: «12,500 أوقية». */
  function money(value, decimals) {
    return num(value, decimals) + ' ' + symbol();
  }

  /**
   * مبلغ بإشارة صريحة. نعزل «الإشارة + الرقم» بمحرفَي عزل من اليسار لليمين
   * حتى لا يفصل خوارزم الاتجاه ثنائي الاتجاه الإشارةَ عن رقمها.
   */
  function signedNum(value, kind) {
    var sign = kind === 'income' ? '+' : kind === 'expense' ? '−' : (Number(value) < 0 ? '−' : '');
    return '\u2066' + sign + num(Math.abs(Number(value) || 0)) + '\u2069';
  }

  /** مثل signedNum لكن مع رمز العملة: «+٣٠٠ أوقية». */
  function signed(value, kind) {
    return signedNum(value, kind) + ' ' + symbol();
  }

  /** صيغة مختصرة للمحاور: 12.5 ألف / 1.2 مليون. */
  function compact(value) {
    var n = Math.abs(Number(value) || 0);
    var sign = Number(value) < 0 ? '-' : '';
    if (n >= 1e6) return digits(sign + trimZero(n / 1e6) + ' م');
    if (n >= 1e3) return digits(sign + trimZero(n / 1e3) + ' أ');
    return digits(sign + Math.round(n));
  }

  function trimZero(x) {
    var s = x.toFixed(x < 100 ? 1 : 0);
    return s.replace(/\.0$/, '');
  }

  /** يقرأ مبلغًا كتبه المستخدم: يقبل الأرقام العربية والفواصل والمسافات. */
  function parseAmount(raw) {
    if (raw === null || raw === undefined) return NaN;
    var s = String(raw).trim();
    if (!s) return NaN;
    // أرقام هندية-عربية وفارسية إلى لاتينية
    s = s.replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x0660); })
         .replace(/[۰-۹]/g, function (c) { return String(c.charCodeAt(0) - 0x06F0); });
    s = s.replace(/[٫،]/g, '.')   // الفاصلة العشرية العربية
         .replace(/[٬\s,'٬]/g, '')      // فواصل الآلاف والمسافات
         .replace(/[^\d.\-+]/g, '');
    // نرفض المدخلات التي لا تحتوي رقمًا واحدًا على الأقل حتى لا تصبح «س» صفرًا
    if (!/\d/.test(s)) return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  /* ----- التواريخ ----- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** اليوم بصيغة YYYY-MM-DD حسب التوقيت المحلي. */
  function today() { return toKey(new Date()); }

  function toKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  /** يحوّل YYYY-MM-DD إلى Date محلي (بدون انزياح المنطقة الزمنية). */
  function fromKey(key) {
    var p = String(key || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }

  function monthKey(key) { return String(key || '').slice(0, 7); }

  function monthKeyOf(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1);
  }

  /** «سبتمبر 2026» */
  function monthName(mKey) {
    var p = String(mKey).split('-');
    var m = (+p[1] || 1) - 1;
    return MONTHS[m] + ' ' + digits(p[0]);
  }

  function monthShort(mKey) {
    var p = String(mKey).split('-');
    return MONTHS_SHORT[(+p[1] || 1) - 1];
  }

  /** ينقل مفتاح شهر بعدد من الأشهر: addMonths('2026-01', -2) === '2025-11' */
  function addMonths(mKey, delta) {
    var p = String(mKey).split('-');
    var d = new Date(+p[0], (+p[1] || 1) - 1 + delta, 1);
    return monthKeyOf(d);
  }

  /** «الاثنين، 28 سبتمبر 2026» — أو بالتقويم الهجري إن اختاره المستخدم. */
  function longDate(key) {
    var d = fromKey(key);
    if (conf.calendar === 'hijri') {
      var h = hijri(d);
      if (h) return WEEKDAYS[d.getDay()] + '، ' + h;
    }
    return WEEKDAYS[d.getDay()] + '، ' + digits(d.getDate()) + ' ' +
           MONTHS[d.getMonth()] + ' ' + digits(d.getFullYear());
  }

  /** «28 سبتمبر» */
  function shortDate(key) {
    var d = fromKey(key);
    return digits(d.getDate()) + ' ' + MONTHS[d.getMonth()];
  }

  function hijri(date) {
    // نثبّت نظام الأرقام على اختيار المستخدم حتى لا تفرضه اللغة السعودية
    var nu = conf.digits === 'arabic' ? 'arab' : 'latn';
    try {
      return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-' + nu, {
        day: 'numeric', month: 'long', year: 'numeric'
      }).format(date);
    } catch (e) { return null; }
  }

  /** «اليوم» / «أمس» / «الاثنين، 28 سبتمبر 2026» */
  function friendlyDate(key) {
    var t = today();
    if (key === t) return 'اليوم';
    var y = new Date();
    y.setDate(y.getDate() - 1);
    if (key === toKey(y)) return 'أمس';
    return longDate(key);
  }

  /** فرق الأيام بين تاريخين بصيغة المفتاح (b − a). */
  function daysBetween(aKey, bKey) {
    var a = fromKey(aKey), b = fromKey(bKey);
    return Math.round((b - a) / 86400000);
  }

  /** «متأخر ٣ أيام» / «بعد ١٠ أيام» — للديون. */
  function dueLabel(dueKey) {
    var diff = daysBetween(today(), dueKey);
    if (diff === 0) return 'يستحق اليوم';
    if (diff < 0) return 'متأخر ' + plural(-diff, 'يومًا واحدًا', 'يومين', 'أيام', 'يومًا');
    return 'بعد ' + plural(diff, 'يوم واحد', 'يومين', 'أيام', 'يومًا');
  }

  /**
   * جمع عربي صحيح بأربع صيغ:
   *   ١ → «حركة واحدة» · ٢ → «حركتان» · ٣-١٠ → «٥ حركات» · ١١+ → «٢٢ حركة»
   */
  function plural(n, one, two, few, many) {
    n = Number(n) || 0;
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return digits(n) + ' ' + few;
    return digits(n) + ' ' + (many || few);
  }

  /** آخر يوم في الشهر: lastDayOfMonth('2026-02') === 28 */
  function lastDayOfMonth(mKey) {
    var p = String(mKey).split('-');
    return new Date(+p[0], +p[1], 0).getDate();
  }

  return {
    CURRENCIES: CURRENCIES,
    MONTHS: MONTHS,
    WEEKDAYS: WEEKDAYS,
    setConfig: setConfig,
    currency: currency,
    symbol: symbol,
    digits: digits,
    num: num,
    money: money,
    signed: signed,
    signedNum: signedNum,
    compact: compact,
    parseAmount: parseAmount,
    today: today,
    toKey: toKey,
    fromKey: fromKey,
    monthKey: monthKey,
    monthKeyOf: monthKeyOf,
    monthName: monthName,
    monthShort: monthShort,
    addMonths: addMonths,
    longDate: longDate,
    shortDate: shortDate,
    friendlyDate: friendlyDate,
    daysBetween: daysBetween,
    dueLabel: dueLabel,
    plural: plural,
    lastDayOfMonth: lastDayOfMonth
  };
})();
