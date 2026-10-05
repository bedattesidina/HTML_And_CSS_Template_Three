package com.mahfaza.wallet.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mahfaza.wallet.data.PeriodSummary
import com.mahfaza.wallet.data.TxType
import com.mahfaza.wallet.data.TxnView
import com.mahfaza.wallet.ui.common.EmptyState
import com.mahfaza.wallet.ui.common.ChoiceRow
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.MonthSwitcher
import com.mahfaza.wallet.ui.common.StatTile
import com.mahfaza.wallet.ui.common.TxnRow
import com.mahfaza.wallet.ui.common.VSpace
import com.mahfaza.wallet.ui.theme.LocalMoneyColors
import com.mahfaza.wallet.util.Fmt
import com.mahfaza.wallet.util.MonthRef
import com.mahfaza.wallet.util.startOfDay

private const val FILTER_ALL = "الكل"

@Composable
fun TxnsScreen(
    contentPadding: PaddingValues,
    onOpenTxn: (Long) -> Unit,
) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val money = LocalMoneyColors.current
    val revision by repo.revision.collectAsState()

    var month by remember { mutableStateOf(MonthRef.current()) }
    var typeFilter by remember { mutableStateOf<TxType?>(null) }
    var search by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<TxnView>>(emptyList()) }
    var summary by remember { mutableStateOf(PeriodSummary()) }

    LaunchedEffect(revision, month, typeFilter, search) {
        items = repo.txns(
            from = month.start,
            to = month.end,
            type = typeFilter,
            search = search.takeIf { it.isNotBlank() },
        )
        summary = repo.summary(month.start, month.end)
    }

    val grouped = remember(items) { items.groupBy { startOfDay(it.txn.date) } }
    val filterOptions = remember { listOf(FILTER_ALL, TxType.INCOME.label, TxType.EXPENSE.label, TxType.TRANSFER.label) }
    val selectedFilter = typeFilter?.label ?: FILTER_ALL

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 12.dp,
            bottom = contentPadding.calculateBottomPadding() + 100.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(6.dp),
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
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                label = { Text("بحث في العمليات") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            ChoiceRow(
                options = filterOptions,
                selected = selectedFilter,
                labelOf = { it },
                onSelect = { label ->
                    typeFilter = when (label) {
                        TxType.INCOME.label -> TxType.INCOME
                        TxType.EXPENSE.label -> TxType.EXPENSE
                        TxType.TRANSFER.label -> TxType.TRANSFER
                        else -> null
                    }
                },
            )
        }

        if (items.isEmpty()) {
            item {
                EmptyState(
                    emoji = "🔍",
                    message = "لا توجد عمليات في هذا الشهر",
                )
            }
        }

        grouped.forEach { (day, dayItems) ->
            item {
                Column(modifier = Modifier.fillMaxWidth()) {
                    VSpace(10)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = Fmt.dayWithWeekday(day),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = dayTotalLabel(dayItems, currency),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
                }
            }
            items(dayItems, key = { it.txn.id }) { item ->
                TxnRow(
                    item = item,
                    currency = currency,
                    onClick = { onOpenTxn(item.txn.id) },
                    showDate = false,
                )
            }
        }
    }
}

private fun dayTotalLabel(items: List<TxnView>, currency: String): String {
    val income = items.filter { it.txn.type == TxType.INCOME }.sumOf { it.txn.amount }
    val expense = items.filter { it.txn.type == TxType.EXPENSE }.sumOf { it.txn.amount }
    return when {
        income > 0 && expense > 0 -> "+${Fmt.amount(income)} / −${Fmt.money(expense, currency)}"
        income > 0 -> "+${Fmt.money(income, currency)}"
        expense > 0 -> "−${Fmt.money(expense, currency)}"
        else -> ""
    }
}
