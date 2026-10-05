package com.mahfaza.wallet.ui.common

import androidx.compose.runtime.staticCompositionLocalOf
import com.mahfaza.wallet.data.Repository

val LocalRepo = staticCompositionLocalOf<Repository> {
    error("لم يتم تمرير مستودع البيانات")
}

val LocalCurrency = staticCompositionLocalOf { "ج.م" }

/** تحويل نص المبلغ المكتوب إلى رقم */
fun String.toAmountOrNull(): Double? =
    trim().replace("٫", ".").replace(",", ".").replace("٬", "").toDoubleOrNull()

fun String.toAmount(): Double = toAmountOrNull() ?: 0.0

/** نص المبلغ لحقول الإدخال (بدون رمز العملة) */
fun Double.toInputText(): String =
    if (this == 0.0) "" else if (this % 1.0 == 0.0) toLong().toString() else toString()
