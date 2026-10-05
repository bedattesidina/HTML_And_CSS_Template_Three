package com.mahfaza.wallet.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mahfaza.wallet.data.Category
import com.mahfaza.wallet.data.PeriodSummary
import com.mahfaza.wallet.data.TxnView
import com.mahfaza.wallet.data.Wallet
import com.mahfaza.wallet.ui.common.EmojiAvatar
import com.mahfaza.wallet.ui.common.EmptyState
import com.mahfaza.wallet.ui.common.HSpace
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.ProgressBar
import com.mahfaza.wallet.ui.common.SectionCard
import com.mahfaza.wallet.ui.common.StatTile
import com.mahfaza.wallet.ui.common.TxnRow
import com.mahfaza.wallet.ui.common.VSpace
import com.mahfaza.wallet.ui.theme.LocalMoneyColors
import com.mahfaza.wallet.util.Fmt
import com.mahfaza.wallet.util.MonthRef

@Composable
fun HomeScreen(
    contentPadding: PaddingValues,
    onAddTxn: () -> Unit,
    onOpenTxn: (Long) -> Unit,
    onOpenWallets: () -> Unit,
    onOpenDebts: () -> Unit,
    onOpenTxns: () -> Unit,
) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val money = LocalMoneyColors.current
    val revision by repo.revision.collectAsState()
    val month = remember { MonthRef.current() }

    var total by remember { mutableStateOf(0.0) }
    var summary by remember { mutableStateOf(PeriodSummary()) }
    var wallets by remember { mutableStateOf<List<Pair<Wallet, Double>>>(emptyList()) }
    var recent by remember { mutableStateOf<List<TxnView>>(emptyList()) }
    var debtTotals by remember { mutableStateOf(0.0 to 0.0) }
    var budgets by remember { mutableStateOf<List<Pair<Category, Double>>>(emptyList()) }

    LaunchedEffect(revision) {
        wallets = repo.walletsWithBalance()
        total = wallets.sumOf { it.second }
        summary = repo.summary(month.start, month.end)
        recent = repo.txns(limit = 8)
        debtTotals = repo.debtTotals()
        budgets = repo.budgets(month.start, month.end)
    }

    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 14.dp,
            bottom = contentPadding.calculateBottomPadding() + 100.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            BalanceHeader(
                total = total,
                currency = currency,
                monthTitle = month.title,
            )
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(
                    label = "دخل الشهر",
                    value = Fmt.money(summary.income, currency),
                    color = money.income,
                    modifier = Modifier.weight(1f),
                )
                StatTile(
                    label = "مصروف الشهر",
                    value = Fmt.money(summary.expense, currency),
                    color = money.expense,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            SectionCard(
                title = "المحافظ",
                action = { TextButton(onClick = onOpenWallets) { Text("إدارة") } },
            ) {
                if (wallets.isEmpty()) {
                    EmptyState(emoji = "👛", message = "أضف محفظة من زر الإدارة")
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        wallets.forEach { (wallet, balance) ->
                            WalletChip(wallet = wallet, balance = balance, currency = currency)
                        }
                    }
                }
            }
        }

        item {
            SectionCard(
                title = "الديون",
                action = { TextButton(onClick = onOpenDebts) { Text("التفاصيل") } },
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StatTile(
                        label = "لي عند الآخرين",
                        value = Fmt.money(debtTotals.first, currency),
                        color = money.owedToMe,
                        modifier = Modifier.weight(1f),
                    )
                    StatTile(
                        label = "عليّ للآخرين",
                        value = Fmt.money(debtTotals.second, currency),
                        color = money.iOwe,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        if (budgets.isNotEmpty()) {
            item {
                SectionCard(title = "ميزانية ${month.title}") {
                    budgets.forEachIndexed { index, (category, spent) ->
                        if (index > 0) {
                            VSpace(12)
                        }
                        BudgetRow(category = category, spent = spent, currency = currency)
                    }
                }
            }
        }

        item {
            SectionCard(
                title = "أحدث العمليات",
                action = { TextButton(onClick = onOpenTxns) { Text("الكل") } },
            ) {
                if (recent.isEmpty()) {
                    EmptyState(
                        emoji = "📝",
                        message = "لا توجد عمليات بعد. اضغط + لإضافة أول عملية.",
                    )
                } else {
                    recent.forEachIndexed { index, item ->
                        if (index > 0) HorizontalDivider()
                        TxnRow(
                            item = item,
                            currency = currency,
                            onClick = { onOpenTxn(item.txn.id) },
                        )
                    }
                }
            }
        }

        item {
            TextButton(onClick = onAddTxn, modifier = Modifier.fillMaxWidth()) {
                Text("+ إضافة عملية جديدة")
            }
        }
    }
}

@Composable
private fun BalanceHeader(total: Double, currency: String, monthTitle: String) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.horizontalGradient(
                    listOf(scheme.primary, scheme.secondary)
                )
            )
            .padding(20.dp),
    ) {
        Column {
            Text(
                text = "الرصيد الحالي",
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.labelLarge,
            )
            VSpace(6)
            Text(
                text = Fmt.money(total, currency),
                color = Color.White,
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
            )
            VSpace(6)
            Text(
                text = monthTitle,
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun WalletChip(wallet: Wallet, balance: Double, currency: String) {
    Column(
        modifier = Modifier
            .width(140.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color(wallet.color).copy(alpha = 0.10f))
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EmojiAvatar(emoji = wallet.emoji, color = Color(wallet.color), size = 32)
            HSpace(8)
            Text(
                text = wallet.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
        VSpace(8)
        Text(
            text = Fmt.money(balance, currency),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = Color(wallet.color),
            maxLines = 1,
        )
    }
}

@Composable
private fun BudgetRow(category: Category, spent: Double, currency: String) {
    val money = LocalMoneyColors.current
    val fraction = if (category.monthlyBudget <= 0) 0f
    else (spent / category.monthlyBudget).coerceIn(0.0, 1.0).toFloat()
    val over = spent > category.monthlyBudget
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text = category.emoji, fontSize = 16.sp)
            HSpace(6)
            Text(
                text = category.name,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
                maxLines = 1,
            )
            Text(
                text = "${Fmt.amount(spent)} / ${Fmt.money(category.monthlyBudget, currency)}",
                style = MaterialTheme.typography.bodySmall,
                color = if (over) money.expense else MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = if (over) FontWeight.Bold else FontWeight.Normal,
            )
        }
        VSpace(6)
        ProgressBar(
            fraction = fraction,
            color = if (over) money.expense else Color(category.color),
        )
    }
}
