package com.mahfaza.wallet.util

import java.util.Calendar
import java.util.Locale

/** أسماء الشهور بالعربية */
val ARABIC_MONTHS = arrayOf(
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
)

val ARABIC_DAYS = arrayOf(
    "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"
)

object Fmt {

    /** تنسيق المبلغ: 1,250.75 أو 1,250 إذا لم توجد كسور */
    fun amount(value: Double): String {
        val rounded = Math.round(value * 100.0) / 100.0
        val abs = Math.abs(rounded)
        return if (abs % 1.0 == 0.0) {
            String.format(Locale.US, "%,d", rounded.toLong())
        } else {
            String.format(Locale.US, "%,.2f", rounded)
        }
    }

    /** المبلغ مع رمز العملة */
    fun money(value: Double, currency: String): String = "${amount(value)} $currency"

    /** المبلغ مع إشارة الزيادة أو النقص */
    fun signedMoney(value: Double, currency: String): String {
        val sign = if (value > 0) "+" else if (value < 0) "−" else ""
        return "$sign${amount(Math.abs(value))} $currency"
    }

    fun date(millis: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = millis }
        return "${c.get(Calendar.DAY_OF_MONTH)} ${ARABIC_MONTHS[c.get(Calendar.MONTH)]} ${c.get(Calendar.YEAR)}"
    }

    fun shortDate(millis: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = millis }
        return "${c.get(Calendar.DAY_OF_MONTH)} ${ARABIC_MONTHS[c.get(Calendar.MONTH)]}"
    }

    fun dayWithWeekday(millis: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = millis }
        val weekday = ARABIC_DAYS[c.get(Calendar.DAY_OF_WEEK) - 1]
        return "$weekday • ${date(millis)}"
    }

    fun monthTitle(year: Int, month: Int): String = "${ARABIC_MONTHS[month]} $year"

    fun shortMonth(millis: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = millis }
        return ARABIC_MONTHS[c.get(Calendar.MONTH)].take(4)
    }

    fun percent(value: Float): String = "${Math.round(value * 100f)}%"
}

/** يمثّل شهرًا ميلاديًا ويحسب بدايته ونهايته */
data class MonthRef(val year: Int, val month: Int) {

    val start: Long
        get() = Calendar.getInstance().apply {
            clear()
            set(year, month, 1, 0, 0, 0)
        }.timeInMillis

    /** أول لحظة من الشهر التالي */
    val end: Long
        get() = Calendar.getInstance().apply {
            clear()
            set(year, month, 1, 0, 0, 0)
            add(Calendar.MONTH, 1)
        }.timeInMillis

    val title: String get() = Fmt.monthTitle(year, month)

    fun plus(months: Int): MonthRef {
        val c = Calendar.getInstance().apply {
            clear()
            set(year, month, 1)
            add(Calendar.MONTH, months)
        }
        return MonthRef(c.get(Calendar.YEAR), c.get(Calendar.MONTH))
    }

    fun isCurrent(): Boolean = this == current()

    companion object {
        fun current(): MonthRef {
            val c = Calendar.getInstance()
            return MonthRef(c.get(Calendar.YEAR), c.get(Calendar.MONTH))
        }

        fun of(millis: Long): MonthRef {
            val c = Calendar.getInstance().apply { timeInMillis = millis }
            return MonthRef(c.get(Calendar.YEAR), c.get(Calendar.MONTH))
        }
    }
}

/** بداية اليوم الذي يقع فيه الوقت المعطى */
fun startOfDay(millis: Long): Long = Calendar.getInstance().apply {
    timeInMillis = millis
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
}.timeInMillis

/** نهاية اليوم (أول لحظة من الغد) */
fun startOfNextDay(millis: Long): Long = Calendar.getInstance().apply {
    timeInMillis = startOfDay(millis)
    add(Calendar.DAY_OF_MONTH, 1)
}.timeInMillis
