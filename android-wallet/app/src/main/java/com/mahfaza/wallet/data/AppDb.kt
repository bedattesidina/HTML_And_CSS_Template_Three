package com.mahfaza.wallet.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** قاعدة بيانات التطبيق (SQLite) */
class AppDb private constructor(context: Context) :
    SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION) {

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE wallets(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                emoji TEXT NOT NULL DEFAULT '',
                color INTEGER NOT NULL DEFAULT 0,
                opening_balance REAL NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE categories(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                emoji TEXT NOT NULL DEFAULT '',
                color INTEGER NOT NULL DEFAULT 0,
                type TEXT NOT NULL,
                monthly_budget REAL NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE txns(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                category_id INTEGER,
                wallet_id INTEGER NOT NULL,
                to_wallet_id INTEGER,
                note TEXT NOT NULL DEFAULT '',
                date INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
                FOREIGN KEY(wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
                FOREIGN KEY(to_wallet_id) REFERENCES wallets(id) ON DELETE SET NULL
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX idx_txns_date ON txns(date)")
        db.execSQL("CREATE INDEX idx_txns_wallet ON txns(wallet_id)")
        db.execSQL(
            """
            CREATE TABLE debts(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                person TEXT NOT NULL,
                amount REAL NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                due_date INTEGER,
                created_at INTEGER NOT NULL,
                settled INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE debt_payments(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                debt_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                date INTEGER NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(debt_id) REFERENCES debts(id) ON DELETE CASCADE
            )
            """.trimIndent()
        )
        db.execSQL("CREATE TABLE prefs(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        seed(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // الإصدار الأول، لا توجد ترقيات بعد.
    }

    private fun seed(db: SQLiteDatabase) {
        val wallets = listOf(
            Triple("نقدي", "💵", 0xFF2E7D32),
            Triple("حساب بنكي", "🏦", 0xFF1565C0),
            Triple("محفظة إلكترونية", "📱", 0xFF6A1B9A),
        )
        wallets.forEachIndexed { index, (name, emoji, color) ->
            db.execSQL(
                "INSERT INTO wallets(name, emoji, color, opening_balance, archived, position) VALUES(?,?,?,0,0,?)",
                arrayOf<Any>(name, emoji, color, index)
            )
        }

        val expenses = listOf(
            Triple("طعام وشراب", "🍽", 0xFFEF6C00),
            Triple("مواصلات", "🚌", 0xFF00838F),
            Triple("فواتير", "🧾", 0xFF5D4037),
            Triple("إيجار", "🏠", 0xFF4527A0),
            Triple("تسوّق", "🛒", 0xFFAD1457),
            Triple("صحة ودواء", "💊", 0xFFC62828),
            Triple("تعليم", "📚", 0xFF1565C0),
            Triple("ملابس", "👕", 0xFF00695C),
            Triple("اتصالات وإنترنت", "📶", 0xFF0277BD),
            Triple("ترفيه", "🎮", 0xFF6D4C41),
            Triple("هدايا", "🎁", 0xFFD81B60),
            Triple("صدقة وزكاة", "🤲", 0xFF2E7D32),
            Triple("صيانة", "🔧", 0xFF455A64),
            Triple("مصاريف أخرى", "📦", 0xFF616161),
        )
        val incomes = listOf(
            Triple("راتب", "💼", 0xFF2E7D32),
            Triple("عمل حر", "🖥", 0xFF00838F),
            Triple("مبيعات", "🏷", 0xFFEF6C00),
            Triple("استثمار", "📈", 0xFF1565C0),
            Triple("هدية", "🎁", 0xFFD81B60),
            Triple("دخل آخر", "📦", 0xFF616161),
        )
        fun insertCats(list: List<Triple<String, String, Long>>, type: TxType) {
            list.forEachIndexed { index, (name, emoji, color) ->
                db.execSQL(
                    "INSERT INTO categories(name, emoji, color, type, monthly_budget, archived, position) " +
                        "VALUES(?,?,?,?,0,0,?)",
                    arrayOf<Any>(name, emoji, color, type.code, index)
                )
            }
        }
        insertCats(expenses, TxType.EXPENSE)
        insertCats(incomes, TxType.INCOME)

        db.execSQL("INSERT INTO prefs(key, value) VALUES(?,?)", arrayOf<Any>(Prefs.CURRENCY, "ج.م"))
        db.execSQL("INSERT INTO prefs(key, value) VALUES(?,?)", arrayOf<Any>(Prefs.THEME, "system"))
    }

    companion object {
        const val DB_NAME = "mahfazti.db"
        const val DB_VERSION = 1

        @Volatile
        private var instance: AppDb? = null

        fun get(context: Context): AppDb =
            instance ?: synchronized(this) {
                instance ?: AppDb(context).also { instance = it }
            }
    }
}

/** مفاتيح الإعدادات المحفوظة في جدول prefs */
object Prefs {
    const val CURRENCY = "currency"
    const val THEME = "theme"
}
