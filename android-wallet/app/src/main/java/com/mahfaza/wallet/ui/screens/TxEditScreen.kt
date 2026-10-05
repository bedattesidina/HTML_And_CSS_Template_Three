package com.mahfaza.wallet.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mahfaza.wallet.data.Category
import com.mahfaza.wallet.data.TxType
import com.mahfaza.wallet.data.Txn
import com.mahfaza.wallet.data.Wallet
import com.mahfaza.wallet.ui.common.AmountField
import com.mahfaza.wallet.ui.common.ChoiceRow
import com.mahfaza.wallet.ui.common.ConfirmDialog
import com.mahfaza.wallet.ui.common.DateField
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.TextFieldRow
import com.mahfaza.wallet.ui.common.VSpace
import com.mahfaza.wallet.ui.common.toAmount
import com.mahfaza.wallet.ui.common.toInputText
import com.mahfaza.wallet.ui.theme.LocalMoneyColors
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TxEditScreen(txnId: Long, onBack: () -> Unit) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val money = LocalMoneyColors.current
    val scope = rememberCoroutineScope()

    var type by remember { mutableStateOf(TxType.EXPENSE) }
    var amountText by remember { mutableStateOf("") }
    var categoryId by remember { mutableStateOf<Long?>(null) }
    var walletId by remember { mutableStateOf<Long?>(null) }
    var toWalletId by remember { mutableStateOf<Long?>(null) }
    var note by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(System.currentTimeMillis()) }
    var error by remember { mutableStateOf<String?>(null) }
    var askDelete by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(txnId == 0L) }

    var wallets by remember { mutableStateOf<List<Wallet>>(emptyList()) }
    var categories by remember { mutableStateOf<List<Category>>(emptyList()) }

    LaunchedEffect(txnId) {
        wallets = repo.wallets()
        if (txnId != 0L) {
            repo.txn(txnId)?.let { view ->
                type = view.txn.type
                amountText = view.txn.amount.toInputText()
                categoryId = view.txn.categoryId
                walletId = view.txn.walletId
                toWalletId = view.txn.toWalletId
                note = view.txn.note
                date = view.txn.date
            }
            loaded = true
        }
        if (walletId == null) walletId = wallets.firstOrNull()?.id
    }

    LaunchedEffect(type, loaded) {
        if (type != TxType.TRANSFER) {
            categories = repo.categories(type)
            if (categories.none { it.id == categoryId }) {
                categoryId = categories.firstOrNull()?.id
            }
        }
    }

    val accent = when (type) {
        TxType.INCOME -> money.income
        TxType.EXPENSE -> money.expense
        TxType.TRANSFER -> money.transfer
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (txnId == 0L) "عملية جديدة" else "تعديل العملية") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                actions = {
                    if (txnId != 0L) {
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
                options = listOf(TxType.EXPENSE, TxType.INCOME, TxType.TRANSFER),
                selected = type,
                labelOf = { it.label },
                onSelect = { type = it },
                colorOf = {
                    when (it) {
                        TxType.INCOME -> money.income
                        TxType.EXPENSE -> money.expense
                        TxType.TRANSFER -> money.transfer
                    }
                },
            )

            VSpace(16)
            AmountField(
                value = amountText,
                onValueChange = { amountText = it },
                label = "المبلغ",
                currency = currency,
                isError = error != null && amountText.toAmount() <= 0,
            )

            VSpace(16)
            if (type == TxType.TRANSFER) {
                Text("من محفظة", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                VSpace(8)
                WalletPicker(wallets = wallets, selectedId = walletId, onSelect = { walletId = it })
                VSpace(16)
                Text("إلى محفظة", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                VSpace(8)
                WalletPicker(
                    wallets = wallets.filter { it.id != walletId },
                    selectedId = toWalletId,
                    onSelect = { toWalletId = it },
                )
            } else {
                Text("التصنيف", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                VSpace(8)
                CategoryGrid(
                    categories = categories,
                    selectedId = categoryId,
                    onSelect = { categoryId = it },
                )
                VSpace(16)
                Text("المحفظة", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                VSpace(8)
                WalletPicker(wallets = wallets, selectedId = walletId, onSelect = { walletId = it })
            }

            VSpace(16)
            DateField(label = "التاريخ", millis = date, onChange = { date = it })

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

            VSpace(20)
            Button(
                onClick = {
                    val amount = amountText.toAmount()
                    val selectedWallet = walletId
                    error = when {
                        amount <= 0.0 -> "أدخل مبلغًا صحيحًا"
                        selectedWallet == null -> "اختر محفظة"
                        type != TxType.TRANSFER && categoryId == null -> "اختر تصنيفًا"
                        type == TxType.TRANSFER && toWalletId == null -> "اختر المحفظة المحوَّل إليها"
                        type == TxType.TRANSFER && toWalletId == selectedWallet -> "اختر محفظتين مختلفتين"
                        else -> null
                    }
                    if (error == null && selectedWallet != null) {
                        scope.launch {
                            repo.saveTxn(
                                Txn(
                                    id = txnId,
                                    type = type,
                                    amount = amount,
                                    categoryId = if (type == TxType.TRANSFER) null else categoryId,
                                    walletId = selectedWallet,
                                    toWalletId = if (type == TxType.TRANSFER) toWalletId else null,
                                    note = note.trim(),
                                    date = date,
                                )
                            )
                            onBack()
                        }
                    }
                },
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = accent,
                    contentColor = Color.White,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = if (txnId == 0L) "حفظ العملية" else "حفظ التعديلات",
                    modifier = Modifier.padding(vertical = 6.dp),
                )
            }
            VSpace(24)
        }
    }

    if (askDelete) {
        ConfirmDialog(
            title = "حذف العملية",
            message = "سيتم حذف هذه العملية نهائيًا.",
            confirmLabel = "حذف",
            onConfirm = {
                scope.launch {
                    repo.deleteTxn(txnId)
                    onBack()
                }
            },
            onDismiss = { askDelete = false },
        )
    }
}

@Composable
private fun WalletPicker(wallets: List<Wallet>, selectedId: Long?, onSelect: (Long) -> Unit) {
    ChoiceRow(
        options = wallets,
        selected = wallets.firstOrNull { it.id == selectedId },
        labelOf = { "${it.emoji} ${it.name}" },
        onSelect = { onSelect(it.id) },
        colorOf = { Color(it.color) },
    )
}

@Composable
private fun CategoryGrid(categories: List<Category>, selectedId: Long?, onSelect: (Long) -> Unit) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        categories.chunked(4).forEach { rowItems ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                rowItems.forEach { category ->
                    CategoryCell(
                        category = category,
                        selected = category.id == selectedId,
                        onClick = { onSelect(category.id) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(4 - rowItems.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun CategoryCell(
    category: Category,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val color = Color(category.color)
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) color.copy(alpha = 0.22f) else MaterialTheme.colorScheme.surfaceVariant)
            .clickable { onClick() }
            .padding(vertical = 10.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text = category.emoji, fontSize = 22.sp)
        }
        VSpace(4)
        Text(
            text = category.name,
            style = MaterialTheme.typography.labelSmall,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        )
    }
}
