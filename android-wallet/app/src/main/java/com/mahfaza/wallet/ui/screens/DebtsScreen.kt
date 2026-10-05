package com.mahfaza.wallet.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mahfaza.wallet.data.DebtKind
import com.mahfaza.wallet.data.DebtPayment
import com.mahfaza.wallet.data.DebtView
import com.mahfaza.wallet.ui.common.AmountField
import com.mahfaza.wallet.ui.common.ChoiceRow
import com.mahfaza.wallet.ui.common.ConfirmDialog
import com.mahfaza.wallet.ui.common.EmojiAvatar
import com.mahfaza.wallet.ui.common.EmptyState
import com.mahfaza.wallet.ui.common.HSpace
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.ProgressBar
import com.mahfaza.wallet.ui.common.SectionCard
import com.mahfaza.wallet.ui.common.StatTile
import com.mahfaza.wallet.ui.common.VSpace
import com.mahfaza.wallet.ui.common.toAmount
import com.mahfaza.wallet.ui.theme.LocalMoneyColors
import com.mahfaza.wallet.util.Fmt
import kotlinx.coroutines.launch

private const val DEBTS_ALL = "الكل"
private const val DEBTS_MINE = "لي عند الآخرين"
private const val DEBTS_OWED = "عليّ للآخرين"

@Composable
fun DebtsScreen(
    contentPadding: PaddingValues,
    onEditDebt: (Long) -> Unit,
) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val money = LocalMoneyColors.current
    val scope = rememberCoroutineScope()
    val revision by repo.revision.collectAsState()

    var filter by remember { mutableStateOf(DEBTS_ALL) }
    var debts by remember { mutableStateOf<List<DebtView>>(emptyList()) }
    var totals by remember { mutableStateOf(0.0 to 0.0) }
    var payFor by remember { mutableStateOf<DebtView?>(null) }
    var deleteFor by remember { mutableStateOf<DebtView?>(null) }

    LaunchedEffect(revision, filter) {
        val kind = when (filter) {
            DEBTS_MINE -> DebtKind.OWED_TO_ME
            DEBTS_OWED -> DebtKind.I_OWE
            else -> null
        }
        debts = repo.debts(kind)
        totals = repo.debtTotals()
    }

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
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile(
                    label = "لي عند الآخرين",
                    value = Fmt.money(totals.first, currency),
                    color = money.owedToMe,
                    modifier = Modifier.weight(1f),
                )
                StatTile(
                    label = "عليّ للآخرين",
                    value = Fmt.money(totals.second, currency),
                    color = money.iOwe,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        item {
            Button(
                onClick = { onEditDebt(0L) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("+ إضافة دين جديد", modifier = Modifier.padding(vertical = 4.dp))
            }
        }

        item {
            ChoiceRow(
                options = listOf(DEBTS_ALL, DEBTS_OWED, DEBTS_MINE),
                selected = filter,
                labelOf = { it },
                onSelect = { filter = it },
            )
        }

        if (debts.isEmpty()) {
            item {
                EmptyState(
                    emoji = "🤝",
                    message = "لا توجد ديون مسجّلة. أضف دينًا لتتابع ما لك وما عليك.",
                )
            }
        }

        items(debts, key = { it.debt.id }) { view ->
            DebtCard(
                view = view,
                currency = currency,
                onEdit = { onEditDebt(view.debt.id) },
                onPay = { payFor = view },
                onToggleSettled = {
                    scope.launch { repo.setDebtSettled(view.debt.id, !view.debt.settled) }
                },
                onDelete = { deleteFor = view },
            )
        }
    }

    val paying = payFor
    if (paying != null) {
        PaymentDialog(
            view = paying,
            currency = currency,
            onDismiss = { payFor = null },
            onConfirm = { amount ->
                scope.launch {
                    repo.addPayment(DebtPayment(debtId = paying.debt.id, amount = amount))
                    val updated = repo.debt(paying.debt.id)
                    if (updated != null && updated.remaining <= 0.009) {
                        repo.setDebtSettled(paying.debt.id, true)
                    }
                }
                payFor = null
            },
        )
    }

    val deleting = deleteFor
    if (deleting != null) {
        ConfirmDialog(
            title = "حذف الدين",
            message = "سيتم حذف الدين وكل دفعاته.",
            confirmLabel = "حذف",
            onConfirm = { scope.launch { repo.deleteDebt(deleting.debt.id) } },
            onDismiss = { deleteFor = null },
        )
    }
}

@Composable
private fun DebtCard(
    view: DebtView,
    currency: String,
    onEdit: () -> Unit,
    onPay: () -> Unit,
    onToggleSettled: () -> Unit,
    onDelete: () -> Unit,
) {
    val money = LocalMoneyColors.current
    val accent = if (view.debt.kind == DebtKind.OWED_TO_ME) money.owedToMe else money.iOwe
    val due: Long? = view.debt.dueDate
    val overdue = due != null && due < System.currentTimeMillis() && !view.isDone

    SectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EmojiAvatar(
                emoji = if (view.debt.kind == DebtKind.OWED_TO_ME) "📥" else "📤",
                color = accent,
            )
            HSpace(12)
            Column(modifier = Modifier.weight(1f).clickable { onEdit() }) {
                Text(
                    text = view.debt.person,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                Text(
                    text = if (view.debt.kind == DebtKind.OWED_TO_ME) "لي عنده" else "عليّ له",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = Fmt.money(view.remaining, currency),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (view.isDone) money.income else accent,
                )
                Text(
                    text = "من ${Fmt.money(view.debt.amount, currency)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        VSpace(10)
        ProgressBar(fraction = view.progress, color = if (view.isDone) money.income else accent)

        if (view.debt.note.isNotBlank() || due != null) {
            VSpace(8)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (due != null) {
                    Text(
                        text = "الاستحقاق: ${Fmt.date(due)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (overdue) money.expense else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (overdue) FontWeight.Bold else FontWeight.Normal,
                    )
                }
                if (view.debt.note.isNotBlank()) {
                    if (due != null) HSpace(8)
                    Text(
                        text = view.debt.note,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
            }
        }

        VSpace(6)
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (!view.isDone) {
                TextButton(onClick = onPay) { Text("سدّد دفعة") }
            }
            TextButton(onClick = onToggleSettled) {
                Text(if (view.debt.settled) "إعادة فتح" else "تم السداد")
            }
            TextButton(onClick = onEdit) { Text("تعديل") }
            TextButton(onClick = onDelete) {
                Text("حذف", color = MaterialTheme.colorScheme.error)
            }
        }

        if (view.isDone) {
            Text(
                text = "✅ تم تسوية هذا الدين",
                style = MaterialTheme.typography.labelMedium,
                color = money.income,
            )
        }
    }
}

@Composable
private fun PaymentDialog(
    view: DebtView,
    currency: String,
    onDismiss: () -> Unit,
    onConfirm: (Double) -> Unit,
) {
    var text by remember { mutableStateOf("") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("سداد دفعة") },
        text = {
            Column {
                Text(
                    text = "${view.debt.person} • المتبقي ${Fmt.money(view.remaining, currency)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                VSpace(12)
                AmountField(
                    value = text,
                    onValueChange = { text = it },
                    label = "مبلغ الدفعة",
                    currency = currency,
                )
                VSpace(8)
                TextButton(onClick = { text = Fmt.amount(view.remaining).replace(",", "") }) {
                    Text("سداد كامل المتبقي")
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val amount = text.toAmount()
                    if (amount > 0) onConfirm(amount)
                },
            ) { Text("تسجيل") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("إلغاء") }
        },
    )
}
