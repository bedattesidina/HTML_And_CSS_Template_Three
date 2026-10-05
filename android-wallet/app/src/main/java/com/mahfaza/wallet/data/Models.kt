package com.mahfaza.wallet.data

/** نوع العملية المالية */
enum class TxType(val code: String, val label: String) {
    INCOME("income", "دخل"),
    EXPENSE("expense", "مصروف"),
    TRANSFER("transfer", "تحويل");

    companion object {
        fun from(code: String?): TxType = entries.firstOrNull { it.code == code } ?: EXPENSE
    }
}

/** نوع الدين: لي عند الناس، أو عليّ للناس */
enum class DebtKind(val code: String, val label: String) {
    OWED_TO_ME("owed_to_me", "لي"),
    I_OWE("i_owe", "عليّ");

    companion object {
        fun from(code: String?): DebtKind = entries.firstOrNull { it.code == code } ?: I_OWE
    }
}

data class Wallet(
    val id: Long = 0,
    val name: String = "",
    val emoji: String = "👛",
    val color: Long = 0xFF00695C,
    val openingBalance: Double = 0.0,
    val archived: Boolean = false,
    val position: Int = 0,
)

data class Category(
    val id: Long = 0,
    val name: String = "",
    val emoji: String = "📦",
    val color: Long = 0xFF00695C,
    val type: TxType = TxType.EXPENSE,
    val monthlyBudget: Double = 0.0,
    val archived: Boolean = false,
    val position: Int = 0,
)

data class Txn(
    val id: Long = 0,
    val type: TxType = TxType.EXPENSE,
    val amount: Double = 0.0,
    val categoryId: Long? = null,
    val walletId: Long = 0,
    val toWalletId: Long? = null,
    val note: String = "",
    val date: Long = System.currentTimeMillis(),
)

/** عملية مع بيانات التصنيف والمحفظة لعرضها في القوائم */
data class TxnView(
    val txn: Txn,
    val categoryName: String?,
    val categoryEmoji: String?,
    val categoryColor: Long?,
    val walletName: String?,
    val toWalletName: String?,
) {
    val title: String
        get() = when (txn.type) {
            TxType.TRANSFER -> "تحويل: ${walletName ?: "-"} ← ${toWalletName ?: "-"}"
            else -> categoryName ?: "بدون تصنيف"
        }

    val emoji: String
        get() = if (txn.type == TxType.TRANSFER) "🔄" else (categoryEmoji ?: "📦")
}

data class Debt(
    val id: Long = 0,
    val kind: DebtKind = DebtKind.I_OWE,
    val person: String = "",
    val amount: Double = 0.0,
    val note: String = "",
    val dueDate: Long? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val settled: Boolean = false,
)

data class DebtPayment(
    val id: Long = 0,
    val debtId: Long = 0,
    val amount: Double = 0.0,
    val date: Long = System.currentTimeMillis(),
    val note: String = "",
)

/** دين مع مجموع ما تم سدادُه منه */
data class DebtView(
    val debt: Debt,
    val paid: Double,
) {
    val remaining: Double get() = (debt.amount - paid).coerceAtLeast(0.0)
    val isDone: Boolean get() = debt.settled || remaining <= 0.009
    val progress: Float
        get() = if (debt.amount <= 0) 1f else (paid / debt.amount).coerceIn(0.0, 1.0).toFloat()
}

/** مجموع فئة واحدة خلال فترة */
data class CategoryTotal(
    val category: Category,
    val total: Double,
)

/** ملخص فترة زمنية */
data class PeriodSummary(
    val income: Double = 0.0,
    val expense: Double = 0.0,
) {
    val net: Double get() = income - expense
}
