package com.mahfaza.wallet.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mahfaza.wallet.data.Category
import com.mahfaza.wallet.data.CategoryTotal
import com.mahfaza.wallet.data.PeriodSummary
import com.mahfaza.wallet.data.TxType
import com.mahfaza.wallet.ui.common.ChoiceRow
import com.mahfaza.wallet.ui.common.EmptyState
import com.mahfaza.wallet.ui.common.HSpace
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.ProgressBar
import com.mahfaza.wallet.ui.common.SectionCard
import com.mahfaza.wallet.ui.common.StatTile
import com.mahfaza.wallet.ui.common.MonthSwitcher
import com.mahfaza.wallet.ui.common.VSpace
import com.mahfaza.wallet.ui.theme.LocalMoneyColors
import com.mahfaza.wallet.util.Fmt
import com.mahfaza.wallet.util.MonthRef

@Composable
fun StatsScreen(contentPadding: PaddingValues) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val money = LocalMoneyColors.current
    val revision by repo.revision.collectAsState()

    var month by remember { mutableStateOf(MonthRef.current()) }
    var breakdownType by remember { mutableStateOf(TxType.EXPENSE) }
    var summary by remember { mutableStateOf(PeriodSummary()) }
    var totals by remember { mutableStateOf<List<CategoryTotal>>(emptyList()) }
    var trend by remember { mutableStateOf<List<Pair<MonthRef, PeriodSummary>>>(emptyList()) }
    var budgets by remember { mutableStateOf<List<Pair<Category, Double>>>(emptyList()) }

    LaunchedEffect(revision, month, breakdownType) {
        summary = repo.summary(month.start, month.end)
        totals = repo.categoryTotals(month.start, month.end, breakdownType)
        trend = repo.monthlySummaries(6)
        budgets = repo.budgets(month.start, month.end)
    }

    val sum = totals.sumOf { it.total }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 14.dp,
            bottom = contentPadding.calculateBottomPadding() + 40.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            MonthSwitcher(
                title = month.title,
                onPrev = { month = month.plus(-1) },
                onNext = { month = month.plus(1) },
            )
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(
                    label = "الدخل",
                    value = Fmt.money(summary.income, currency),
                    color = money.income,
                    modifier = Modifier.weight(1f),
                )
                StatTile(
                    label = "المصروف",
                    value = Fmt.money(summary.expense, currency),
                    color = money.expense,
                    modifier = Modifier.weight(1f),
                )
                StatTile(
                    label = "الصافي",
                    value = Fmt.money(summary.net, currency),
                    color = if (summary.net >= 0) money.income else money.expense,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            SectionCard(title = "التوزيع على التصنيفات") {
                ChoiceRow(
                    options = listOf(TxType.EXPENSE, TxType.INCOME),
                    selected = breakdownType,
                    labelOf = { it.label },
                    onSelect = { breakdownType = it },
                    colorOf = { if (it == TxType.INCOME) money.income else money.expense },
                )
                VSpace(14)
                if (totals.isEmpty()) {
                    EmptyState(emoji = "📊", message = "لا توجد بيانات لهذا الشهر")
                } else {
                    totals.forEachIndexed { index, row ->
                        if (index > 0) VSpace(12)
                        val share = if (sum <= 0) 0f else (row.total / sum).toFloat()
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(text = row.category.emoji, fontSize = 16.sp)
                                HSpace(6)
                                Text(
                                    text = row.category.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1,
                                )
                                Text(
                                    text = "${Fmt.percent(share)}  •  ${Fmt.money(row.total, currency)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            VSpace(6)
                            ProgressBar(fraction = share, color = Color(row.category.color))
                        }
                    }
                }
            }
        }

        item {
            SectionCard(title = "آخر ٦ أشهر") {
                TrendChart(trend = trend, incomeColor = money.income, expenseColor = money.expense)
                VSpace(10)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LegendDot(color = money.income, label = "دخل")
                    HSpace(14)
                    LegendDot(color = money.expense, label = "مصروف")
                }
            }
        }

        if (budgets.isNotEmpty()) {
            item {
                SectionCard(title = "متابعة الميزانيات") {
                    budgets.forEachIndexed { index, (category, spent) ->
                        if (index > 0) VSpace(12)
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
                                    text = if (over) "تجاوزت بـ ${Fmt.money(spent - category.monthlyBudget, currency)}"
                                    else "متبقي ${Fmt.money(category.monthlyBudget - spent, currency)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (over) money.expense else money.income,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                            VSpace(6)
                            ProgressBar(
                                fraction = fraction,
                                color = if (over) money.expense else Color(category.color),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TrendChart(
    trend: List<Pair<MonthRef, PeriodSummary>>,
    incomeColor: Color,
    expenseColor: Color,
) {
    val maxValue = trend.flatMap { listOf(it.second.income, it.second.expense) }.maxOrNull() ?: 0.0
    if (trend.isEmpty() || maxValue <= 0.0) {
        EmptyState(emoji = "📈", message = "لا توجد بيانات كافية بعد")
        return
    }
    val chartHeight = 120
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height((chartHeight + 26).dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        trend.forEach { (ref, value) ->
            Column(
                modifier = Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(
                    modifier = Modifier.height(chartHeight.dp),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Bar(
                        heightDp = ((value.income / maxValue) * chartHeight).toInt(),
                        color = incomeColor,
                    )
                    Bar(
                        heightDp = ((value.expense / maxValue) * chartHeight).toInt(),
                        color = expenseColor,
                    )
                }
                VSpace(6)
                Text(
                    text = shortMonthLabel(ref.month),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun Bar(heightDp: Int, color: Color) {
    Box(
        modifier = Modifier
            .width(12.dp)
            .height(heightDp.coerceAtLeast(3).dp)
            .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
            .background(color),
    )
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .width(12.dp)
                .height(12.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(color),
        )
        HSpace(6)
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val SHORT_MONTHS = arrayOf(
    "ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"
)

private fun shortMonthLabel(month: Int): String = SHORT_MONTHS[month.coerceIn(0, 11)]
