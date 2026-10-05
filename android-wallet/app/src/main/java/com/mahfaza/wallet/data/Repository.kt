package com.mahfaza.wallet.data

import android.content.ContentValues
import android.database.Cursor
import com.mahfaza.wallet.util.Fmt
import com.mahfaza.wallet.util.MonthRef
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext

/**
 * طبقة الوصول إلى البيانات. كل الدوال تعمل على خيط منفصل،
 * وأي تعديل يرفع قيمة [revision] فتُحدِّث الشاشات نفسها تلقائيًا.
 */
class Repository(private val appDb: AppDb) {

    val revision = MutableStateFlow(0L)

    private fun bump() {
        revision.value = revision.value + 1
    }

    private suspend fun <T> io(block: () -> T): T = withContext(Dispatchers.IO) { block() }

    private fun <T> list(sql: String, args: Array<String>? = null, map: (Cursor) -> T): List<T> {
        val out = ArrayList<T>()
        appDb.readableDatabase.rawQuery(sql, args).use { c ->
            while (c.moveToNext()) out.add(map(c))
        }
        return out
    }

    private fun scalar(sql: String, args: Array<String>? = null): Double {
        appDb.readableDatabase.rawQuery(sql, args).use { c ->
            if (c.moveToNext() && !c.isNull(0)) return c.getDouble(0)
        }
        return 0.0
    }

    // ------------------------------------------------------------------ المحافظ

    private fun walletOf(c: Cursor) = Wallet(
        id = c.getLong(c.getColumnIndexOrThrow("id")),
        name = c.getString(c.getColumnIndexOrThrow("name")),
        emoji = c.getString(c.getColumnIndexOrThrow("emoji")),
        color = c.getLong(c.getColumnIndexOrThrow("color")),
        openingBalance = c.getDouble(c.getColumnIndexOrThrow("opening_balance")),
        archived = c.getInt(c.getColumnIndexOrThrow("archived")) == 1,
        position = c.getInt(c.getColumnIndexOrThrow("position")),
    )

    suspend fun wallets(includeArchived: Boolean = false): List<Wallet> = io {
        val where = if (includeArchived) "" else "WHERE archived = 0"
        list("SELECT * FROM wallets $where ORDER BY position, id", null, this::walletOf)
    }

    suspend fun walletsWithBalance(includeArchived: Boolean = false): List<Pair<Wallet, Double>> = io {
        val where = if (includeArchived) "" else "WHERE w.archived = 0"
        list(
            """
            SELECT w.*, (
                w.opening_balance
                + COALESCE((SELECT SUM(amount) FROM txns WHERE wallet_id = w.id AND type = 'income'), 0)
                - COALESCE((SELECT SUM(amount) FROM txns WHERE wallet_id = w.id AND type = 'expense'), 0)
                - COALESCE((SELECT SUM(amount) FROM txns WHERE wallet_id = w.id AND type = 'transfer'), 0)
                + COALESCE((SELECT SUM(amount) FROM txns WHERE to_wallet_id = w.id AND type = 'transfer'), 0)
            ) AS balance
            FROM wallets w $where ORDER BY w.position, w.id
            """.trimIndent()
        ) { c -> walletOf(c) to c.getDouble(c.getColumnIndexOrThrow("balance")) }
    }

    /** مجموع أرصدة المحافظ غير المؤرشفة */
    suspend fun totalBalance(): Double = walletsWithBalance().sumOf { it.second }

    suspend fun saveWallet(wallet: Wallet): Long = io {
        val values = ContentValues().apply {
            put("name", wallet.name)
            put("emoji", wallet.emoji)
            put("color", wallet.color)
            put("opening_balance", wallet.openingBalance)
            put("archived", if (wallet.archived) 1 else 0)
            put("position", wallet.position)
        }
        val db = appDb.writableDatabase
        val id = if (wallet.id == 0L) {
            db.insert("wallets", null, values)
        } else {
            db.update("wallets", values, "id = ?", arrayOf(wallet.id.toString()))
            wallet.id
        }
        bump()
        id
    }

    suspend fun deleteWallet(id: Long) = io {
        appDb.writableDatabase.delete("wallets", "id = ?", arrayOf(id.toString()))
        bump()
    }

    // ---------------------------------------------------------------- التصنيفات

    private fun categoryOf(c: Cursor) = Category(
        id = c.getLong(c.getColumnIndexOrThrow("id")),
        name = c.getString(c.getColumnIndexOrThrow("name")),
        emoji = c.getString(c.getColumnIndexOrThrow("emoji")),
        color = c.getLong(c.getColumnIndexOrThrow("color")),
        type = TxType.from(c.getString(c.getColumnIndexOrThrow("type"))),
        monthlyBudget = c.getDouble(c.getColumnIndexOrThrow("monthly_budget")),
        archived = c.getInt(c.getColumnIndexOrThrow("archived")) == 1,
        position = c.getInt(c.getColumnIndexOrThrow("position")),
    )

    suspend fun categories(type: TxType? = null, includeArchived: Boolean = false): List<Category> = io {
        val conditions = ArrayList<String>()
        if (!includeArchived) conditions.add("archived = 0")
        if (type != null) conditions.add("type = '${type.code}'")
        val where = if (conditions.isEmpty()) "" else "WHERE " + conditions.joinToString(" AND ")
        list("SELECT * FROM categories $where ORDER BY position, id", null, this::categoryOf)
    }

    suspend fun saveCategory(category: Category): Long = io {
        val values = ContentValues().apply {
            put("name", category.name)
            put("emoji", category.emoji)
            put("color", category.color)
            put("type", category.type.code)
            put("monthly_budget", category.monthlyBudget)
            put("archived", if (category.archived) 1 else 0)
            put("position", category.position)
        }
        val db = appDb.writableDatabase
        val id = if (category.id == 0L) {
            db.insert("categories", null, values)
        } else {
            db.update("categories", values, "id = ?", arrayOf(category.id.toString()))
            category.id
        }
        bump()
        id
    }

    suspend fun deleteCategory(id: Long) = io {
        appDb.writableDatabase.delete("categories", "id = ?", arrayOf(id.toString()))
        bump()
    }

    // ----------------------------------------------------------------- العمليات

    private fun txnViewOf(c: Cursor): TxnView {
        val catIdx = c.getColumnIndexOrThrow("category_id")
        val toIdx = c.getColumnIndexOrThrow("to_wallet_id")
        val txn = Txn(
            id = c.getLong(c.getColumnIndexOrThrow("id")),
            type = TxType.from(c.getString(c.getColumnIndexOrThrow("type"))),
            amount = c.getDouble(c.getColumnIndexOrThrow("amount")),
            categoryId = if (c.isNull(catIdx)) null else c.getLong(catIdx),
            walletId = c.getLong(c.getColumnIndexOrThrow("wallet_id")),
            toWalletId = if (c.isNull(toIdx)) null else c.getLong(toIdx),
            note = c.getString(c.getColumnIndexOrThrow("note")) ?: "",
            date = c.getLong(c.getColumnIndexOrThrow("date")),
        )
        val colorIdx = c.getColumnIndexOrThrow("cat_color")
        return TxnView(
            txn = txn,
            categoryName = c.getString(c.getColumnIndexOrThrow("cat_name")),
            categoryEmoji = c.getString(c.getColumnIndexOrThrow("cat_emoji")),
            categoryColor = if (c.isNull(colorIdx)) null else c.getLong(colorIdx),
            walletName = c.getString(c.getColumnIndexOrThrow("wallet_name")),
            toWalletName = c.getString(c.getColumnIndexOrThrow("to_wallet_name")),
        )
    }

    private val txnSelect = """
        SELECT t.*, c.name AS cat_name, c.emoji AS cat_emoji, c.color AS cat_color,
               w.name AS wallet_name, w2.name AS to_wallet_name
        FROM txns t
        LEFT JOIN categories c ON c.id = t.category_id
        LEFT JOIN wallets w ON w.id = t.wallet_id
        LEFT JOIN wallets w2 ON w2.id = t.to_wallet_id
    """.trimIndent()

    suspend fun txns(
        from: Long? = null,
        to: Long? = null,
        type: TxType? = null,
        walletId: Long? = null,
        categoryId: Long? = null,
        search: String? = null,
        limit: Int? = null,
    ): List<TxnView> = io {
        val conditions = ArrayList<String>()
        val args = ArrayList<String>()
        if (from != null) conditions.add("t.date >= $from")
        if (to != null) conditions.add("t.date < $to")
        if (type != null) conditions.add("t.type = '${type.code}'")
        if (walletId != null) conditions.add("(t.wallet_id = $walletId OR t.to_wallet_id = $walletId)")
        if (categoryId != null) conditions.add("t.category_id = $categoryId")
        if (!search.isNullOrBlank()) {
            conditions.add("(t.note LIKE ? OR c.name LIKE ? OR w.name LIKE ?)")
            val like = "%${search.trim()}%"
            args.add(like); args.add(like); args.add(like)
        }
        val where = if (conditions.isEmpty()) "" else "WHERE " + conditions.joinToString(" AND ")
        val limitSql = if (limit != null) "LIMIT $limit" else ""
        list(
            "$txnSelect $where ORDER BY t.date DESC, t.id DESC $limitSql",
            if (args.isEmpty()) null else args.toTypedArray(),
            ::txnViewOf,
        )
    }

    suspend fun txn(id: Long): TxnView? = io {
        list("$txnSelect WHERE t.id = $id", null, this::txnViewOf).firstOrNull()
    }

    suspend fun saveTxn(txn: Txn): Long = io {
        val values = ContentValues().apply {
            put("type", txn.type.code)
            put("amount", txn.amount)
            if (txn.categoryId == null) putNull("category_id") else put("category_id", txn.categoryId)
            put("wallet_id", txn.walletId)
            if (txn.toWalletId == null) putNull("to_wallet_id") else put("to_wallet_id", txn.toWalletId)
            put("note", txn.note)
            put("date", txn.date)
        }
        val db = appDb.writableDatabase
        val id = if (txn.id == 0L) {
            values.put("created_at", System.currentTimeMillis())
            db.insert("txns", null, values)
        } else {
            db.update("txns", values, "id = ?", arrayOf(txn.id.toString()))
            txn.id
        }
        bump()
        id
    }

    suspend fun deleteTxn(id: Long) = io {
        appDb.writableDatabase.delete("txns", "id = ?", arrayOf(id.toString()))
        bump()
    }

    // ------------------------------------------------------------- التقارير

    suspend fun summary(from: Long, to: Long): PeriodSummary = io {
        val income = scalar("SELECT SUM(amount) FROM txns WHERE type = 'income' AND date >= $from AND date < $to")
        val expense = scalar("SELECT SUM(amount) FROM txns WHERE type = 'expense' AND date >= $from AND date < $to")
        PeriodSummary(income, expense)
    }

    suspend fun categoryTotals(from: Long, to: Long, type: TxType): List<CategoryTotal> = io {
        list(
            """
            SELECT c.*, SUM(t.amount) AS total
            FROM txns t JOIN categories c ON c.id = t.category_id
            WHERE t.type = '${type.code}' AND t.date >= $from AND t.date < $to
            GROUP BY c.id ORDER BY total DESC
            """.trimIndent()
        ) { c -> CategoryTotal(categoryOf(c), c.getDouble(c.getColumnIndexOrThrow("total"))) }
    }

    /** مجاميع الأشهر الأخيرة من الأقدم إلى الأحدث */
    suspend fun monthlySummaries(months: Int): List<Pair<MonthRef, PeriodSummary>> = io {
        val current = MonthRef.current()
        (months - 1 downTo 0).map { back ->
            val ref = current.plus(-back)
            val income = scalar(
                "SELECT SUM(amount) FROM txns WHERE type = 'income' AND date >= ${ref.start} AND date < ${ref.end}"
            )
            val expense = scalar(
                "SELECT SUM(amount) FROM txns WHERE type = 'expense' AND date >= ${ref.start} AND date < ${ref.end}"
            )
            ref to PeriodSummary(income, expense)
        }
    }

    /** مصروف كل تصنيف خلال الشهر مقابل الميزانية المحددة له */
    suspend fun budgets(from: Long, to: Long): List<Pair<Category, Double>> = io {
        list(
            """
            SELECT c.*, COALESCE((
                SELECT SUM(t.amount) FROM txns t
                WHERE t.category_id = c.id AND t.type = 'expense' AND t.date >= $from AND t.date < $to
            ), 0) AS spent
            FROM categories c
            WHERE c.monthly_budget > 0 AND c.archived = 0 AND c.type = 'expense'
            ORDER BY c.position, c.id
            """.trimIndent()
        ) { c -> categoryOf(c) to c.getDouble(c.getColumnIndexOrThrow("spent")) }
    }

    // --------------------------------------------------------------- الديون

    private fun debtOf(c: Cursor): Debt {
        val dueIdx = c.getColumnIndexOrThrow("due_date")
        return Debt(
            id = c.getLong(c.getColumnIndexOrThrow("id")),
            kind = DebtKind.from(c.getString(c.getColumnIndexOrThrow("kind"))),
            person = c.getString(c.getColumnIndexOrThrow("person")),
            amount = c.getDouble(c.getColumnIndexOrThrow("amount")),
            note = c.getString(c.getColumnIndexOrThrow("note")) ?: "",
            dueDate = if (c.isNull(dueIdx)) null else c.getLong(dueIdx),
            createdAt = c.getLong(c.getColumnIndexOrThrow("created_at")),
            settled = c.getInt(c.getColumnIndexOrThrow("settled")) == 1,
        )
    }

    suspend fun debts(kind: DebtKind? = null): List<DebtView> = io {
        val where = if (kind != null) "WHERE d.kind = '${kind.code}'" else ""
        list(
            """
            SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments p WHERE p.debt_id = d.id), 0) AS paid
            FROM debts d $where
            ORDER BY d.settled, COALESCE(d.due_date, d.created_at)
            """.trimIndent()
        ) { c -> DebtView(debtOf(c), c.getDouble(c.getColumnIndexOrThrow("paid"))) }
    }

    suspend fun debt(id: Long): DebtView? = io {
        list(
            """
            SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments p WHERE p.debt_id = d.id), 0) AS paid
            FROM debts d WHERE d.id = $id
            """.trimIndent()
        ) { c -> DebtView(debtOf(c), c.getDouble(c.getColumnIndexOrThrow("paid"))) }.firstOrNull()
    }

    suspend fun saveDebt(debt: Debt): Long = io {
        val values = ContentValues().apply {
            put("kind", debt.kind.code)
            put("person", debt.person)
            put("amount", debt.amount)
            put("note", debt.note)
            if (debt.dueDate == null) putNull("due_date") else put("due_date", debt.dueDate)
            put("settled", if (debt.settled) 1 else 0)
        }
        val db = appDb.writableDatabase
        val id = if (debt.id == 0L) {
            values.put("created_at", debt.createdAt)
            db.insert("debts", null, values)
        } else {
            db.update("debts", values, "id = ?", arrayOf(debt.id.toString()))
            debt.id
        }
        bump()
        id
    }

    suspend fun deleteDebt(id: Long) = io {
        appDb.writableDatabase.delete("debts", "id = ?", arrayOf(id.toString()))
        bump()
    }

    suspend fun setDebtSettled(id: Long, settled: Boolean) = io {
        val values = ContentValues().apply { put("settled", if (settled) 1 else 0) }
        appDb.writableDatabase.update("debts", values, "id = ?", arrayOf(id.toString()))
        bump()
    }

    suspend fun payments(debtId: Long): List<DebtPayment> = io {
        list("SELECT * FROM debt_payments WHERE debt_id = $debtId ORDER BY date DESC, id DESC") { c ->
            DebtPayment(
                id = c.getLong(c.getColumnIndexOrThrow("id")),
                debtId = c.getLong(c.getColumnIndexOrThrow("debt_id")),
                amount = c.getDouble(c.getColumnIndexOrThrow("amount")),
                date = c.getLong(c.getColumnIndexOrThrow("date")),
                note = c.getString(c.getColumnIndexOrThrow("note")) ?: "",
            )
        }
    }

    suspend fun addPayment(payment: DebtPayment) = io {
        val values = ContentValues().apply {
            put("debt_id", payment.debtId)
            put("amount", payment.amount)
            put("date", payment.date)
            put("note", payment.note)
        }
        appDb.writableDatabase.insert("debt_payments", null, values)
        bump()
    }

    suspend fun deletePayment(id: Long) = io {
        appDb.writableDatabase.delete("debt_payments", "id = ?", arrayOf(id.toString()))
        bump()
    }

    /** إجمالي المتبقي من الديون: (لي، عليّ) */
    suspend fun debtTotals(): Pair<Double, Double> = io {
        fun remaining(kind: DebtKind) = scalar(
            """
            SELECT SUM(MAX(d.amount - COALESCE((SELECT SUM(amount) FROM debt_payments p WHERE p.debt_id = d.id), 0), 0))
            FROM debts d WHERE d.kind = '${kind.code}' AND d.settled = 0
            """.trimIndent()
        )
        remaining(DebtKind.OWED_TO_ME) to remaining(DebtKind.I_OWE)
    }

    // -------------------------------------------------------------- الإعدادات

    suspend fun pref(key: String, default: String): String = io {
        appDb.readableDatabase.rawQuery("SELECT value FROM prefs WHERE key = ?", arrayOf(key)).use { c ->
            if (c.moveToNext()) c.getString(0) else default
        }
    }

    suspend fun setPref(key: String, value: String) = io {
        val values = ContentValues().apply {
            put("key", key)
            put("value", value)
        }
        appDb.writableDatabase.insertWithOnConflict(
            "prefs", null, values, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE
        )
        bump()
    }

    // ------------------------------------------------------------ تصدير ومسح

    /** تصدير كل العمليات بصيغة CSV */
    suspend fun exportCsv(): String = io {
        val sb = StringBuilder("﻿")
        sb.append("التاريخ,النوع,المبلغ,التصنيف,المحفظة,إلى محفظة,ملاحظة\n")
        fun esc(value: String): String = "\"" + value.replace("\"", "\"\"") + "\""
        list("$txnSelect ORDER BY t.date DESC, t.id DESC", null, this::txnViewOf).forEach { v ->
            sb.append(esc(Fmt.date(v.txn.date))).append(',')
                .append(esc(v.txn.type.label)).append(',')
                .append(Fmt.amount(v.txn.amount)).append(',')
                .append(esc(v.categoryName ?: "")).append(',')
                .append(esc(v.walletName ?: "")).append(',')
                .append(esc(v.toWalletName ?: "")).append(',')
                .append(esc(v.txn.note)).append('\n')
        }
        sb.append('\n')
        sb.append("الديون\n")
        sb.append("النوع,الشخص,المبلغ,المسدد,المتبقي,تاريخ الاستحقاق,ملاحظة\n")
        debtsBlocking().forEach { d ->
            sb.append(esc(d.debt.kind.label)).append(',')
                .append(esc(d.debt.person)).append(',')
                .append(Fmt.amount(d.debt.amount)).append(',')
                .append(Fmt.amount(d.paid)).append(',')
                .append(Fmt.amount(d.remaining)).append(',')
                .append(esc(d.debt.dueDate?.let { Fmt.date(it) } ?: "")).append(',')
                .append(esc(d.debt.note)).append('\n')
        }
        sb.toString()
    }

    private fun debtsBlocking(): List<DebtView> = list(
        """
        SELECT d.*, COALESCE((SELECT SUM(amount) FROM debt_payments p WHERE p.debt_id = d.id), 0) AS paid
        FROM debts d ORDER BY d.settled, COALESCE(d.due_date, d.created_at)
        """.trimIndent()
    ) { c -> DebtView(debtOf(c), c.getDouble(c.getColumnIndexOrThrow("paid"))) }

    suspend fun clearTransactions() = io {
        appDb.writableDatabase.delete("txns", null, null)
        bump()
    }

    suspend fun clearEverything() = io {
        val db = appDb.writableDatabase
        db.delete("txns", null, null)
        db.delete("debt_payments", null, null)
        db.delete("debts", null, null)
        bump()
    }
}
