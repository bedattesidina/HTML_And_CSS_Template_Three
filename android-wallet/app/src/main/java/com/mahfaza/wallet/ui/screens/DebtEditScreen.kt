package com.mahfaza.wallet.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mahfaza.wallet.data.Debt
import com.mahfaza.wallet.data.DebtKind
import com.mahfaza.wallet.data.DebtPayment
import com.mahfaza.wallet.ui.common.AmountField
import com.mahfaza.wallet.ui.common.ChoiceRow
import com.mahfaza.wallet.ui.common.ConfirmDialog
import com.mahfaza.wallet.ui.common.DateField
import com.mahfaza.wallet.ui.common.EmptyState
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.SectionCard
import com.mahfaza.wallet.ui.common.TextFieldRow
import com.mahfaza.wallet.ui.common.VSpace
import com.mahfaza.wallet.ui.common.toAmount
import com.mahfaza.wallet.ui.common.toInputText
import com.mahfaza.wallet.ui.theme.LocalMoneyColors
import com.mahfaza.wallet.util.Fmt
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DebtEditScreen(debtId: Long, onBack: () -> Unit) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val money = LocalMoneyColors.current
    val scope = rememberCoroutineScope()
    val revision by repo.revision.collectAsState()

    var kind by remember { mutableStateOf(DebtKind.I_OWE) }
    var person by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var hasDueDate by remember { mutableStateOf(false) }
    var dueDate by remember { mutableStateOf(System.currentTimeMillis()) }
    var createdAt by remember { mutableStateOf(System.currentTimeMillis()) }
    var settled by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var askDelete by remember { mutableStateOf(false) }
    var payments by remember { mutableStateOf<List<DebtPayment>>(emptyList()) }
    var paid by remember { mutableStateOf(0.0) }

    LaunchedEffect(debtId, revision) {
        if (debtId != 0L) {
            repo.debt(debtId)?.let { view ->
                kind = view.debt.kind
                person = view.debt.person
                amountText = view.debt.amount.toInputText()
                note = view.debt.note
                hasDueDate = view.debt.dueDate != null
                dueDate = view.debt.dueDate ?: System.currentTimeMillis()
                createdAt = view.debt.createdAt
                settled = view.debt.settled
                paid = view.paid
            }
            payments = repo.payments(debtId)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (debtId == 0L) "دين جديد" else "تفاصيل الدين") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                actions = {
                    if (debtId != 0L) {
                        IconButton(onClick = { askDelete = true }) {
                            Icon(
                                Icons.Filled.Delete,
                                contentDescription = "حذف",
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            ChoiceRow(
                options = listOf(DebtKind.I_OWE, DebtKind.OWED_TO_ME),
                selected = kind,
                labelOf = { if (it == DebtKind.I_OWE) "عليّ للآخرين" else "لي عند الآخرين" },
                onSelect = { kind = it },
                colorOf = { if (it == DebtKind.I_OWE) money.iOwe else money.owedToMe },
            )

            VSpace(16)
            TextFieldRow(
                value = person,
                onValueChange = { person = it },
                label = "اسم الشخص أو الجهة",
            )

            VSpace(12)
            AmountField(
                value = amountText,
                onValueChange = { amountText = it },
                label = "قيمة الدين",
                currency = currency,
            )

            VSpace(12)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = hasDueDate, onCheckedChange = { hasDueDate = it })
                Text("تحديد تاريخ استحقاق")
            }
            if (hasDueDate) {
                DateField(label = "تاريخ الاستحقاق", millis = dueDate, onChange = { dueDate = it })
            }

            VSpace(12)
            TextFieldRow(
                value = note,
                onValueChange = { note = it },
                label = "ملاحظة (اختياري)",
            )

            val errorMessage = error
            if (errorMessage != null) {
                VSpace(10)
                Text(
                    text = errorMessage,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            VSpace(18)
            Button(
                onClick = {
                    val amount = amountText.toAmount()
                    error = when {
                        person.isBlank() -> "اكتب اسم الشخص"
                        amount <= 0.0 -> "أدخل مبلغًا صحيحًا"
                        else -> null
                    }
                    if (error == null) {
                        scope.launch {
                            repo.saveDebt(
                                Debt(
                                    id = debtId,
                                    kind = kind,
                                    person = person.trim(),
                                    amount = amount,
                                    note = note.trim(),
                                    dueDate = if (hasDueDate) dueDate else null,
                                    createdAt = createdAt,
                                    settled = settled,
                                )
                            )
                            onBack()
                        }
                    }
                },
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = if (debtId == 0L) "حفظ الدين" else "حفظ التعديلات",
                    modifier = Modifier.padding(vertical = 6.dp),
                )
            }

            if (debtId != 0L) {
                VSpace(20)
                SectionCard(title = "الدفعات (${Fmt.money(paid, currency)})") {
                    if (payments.isEmpty()) {
                        EmptyState(emoji = "💸", message = "لا توجد دفعات مسجّلة")
                    } else {
                        payments.forEachIndexed { index, payment ->
                            if (index > 0) HorizontalDivider()
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = Fmt.money(payment.amount, currency),
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.bodyLarge,
                                    )
                                    Text(
                                        text = Fmt.date(payment.date),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                TextButton(onClick = {
                                    scope.launch { repo.deletePayment(payment.id) }
                                }) {
                                    Text("حذف", color = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
            VSpace(24)
        }
    }

    if (askDelete) {
        ConfirmDialog(
            title = "حذف الدين",
            message = "سيتم حذف الدين وكل دفعاته نهائيًا.",
            confirmLabel = "حذف",
            onConfirm = {
                scope.launch {
                    repo.deleteDebt(debtId)
                    onBack()
                }
            },
            onDismiss = { askDelete = false },
        )
    }
}
