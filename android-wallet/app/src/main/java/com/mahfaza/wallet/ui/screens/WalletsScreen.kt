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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mahfaza.wallet.data.Wallet
import com.mahfaza.wallet.ui.common.AmountField
import com.mahfaza.wallet.ui.common.ColorPickerRow
import com.mahfaza.wallet.ui.common.ConfirmDialog
import com.mahfaza.wallet.ui.common.EmojiAvatar
import com.mahfaza.wallet.ui.common.EmojiPickerButton
import com.mahfaza.wallet.ui.common.EmptyState
import com.mahfaza.wallet.ui.common.HSpace
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.SectionCard
import com.mahfaza.wallet.ui.common.TextFieldRow
import com.mahfaza.wallet.ui.common.VSpace
import com.mahfaza.wallet.ui.common.toAmount
import com.mahfaza.wallet.ui.common.toInputText
import com.mahfaza.wallet.util.Fmt
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletsScreen(onBack: () -> Unit) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val scope = rememberCoroutineScope()
    val revision by repo.revision.collectAsState()

    var wallets by remember { mutableStateOf<List<Pair<Wallet, Double>>>(emptyList()) }
    var editing by remember { mutableStateOf<Wallet?>(null) }
    var deleting by remember { mutableStateOf<Wallet?>(null) }

    LaunchedEffect(revision) {
        wallets = repo.walletsWithBalance(includeArchived = true)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("المحافظ") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                actions = {
                    IconButton(onClick = { editing = Wallet(position = wallets.size) }) {
                        Icon(Icons.Filled.Add, contentDescription = "إضافة محفظة")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = 16.dp,
                end = 16.dp,
                top = padding.calculateTopPadding() + 12.dp,
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text(
                    text = "الرصيد الإجمالي: ${Fmt.money(wallets.filter { !it.first.archived }.sumOf { it.second }, currency)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
            }

            if (wallets.isEmpty()) {
                item {
                    EmptyState(emoji = "👛", message = "أضف محفظتك الأولى من زر +")
                }
            }

            items(wallets, key = { it.first.id }) { (wallet, balance) ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        EmojiAvatar(emoji = wallet.emoji, color = Color(wallet.color))
                        HSpace(12)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = wallet.name + if (wallet.archived) " (مؤرشفة)" else "",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "الرصيد الافتتاحي: ${Fmt.money(wallet.openingBalance, currency)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(
                            text = Fmt.money(balance, currency),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color(wallet.color),
                        )
                    }
                    VSpace(4)
                    Row(modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = { editing = wallet }) { Text("تعديل") }
                        TextButton(onClick = {
                            scope.launch { repo.saveWallet(wallet.copy(archived = !wallet.archived)) }
                        }) {
                            Text(if (wallet.archived) "إلغاء الأرشفة" else "أرشفة")
                        }
                        TextButton(onClick = { deleting = wallet }) {
                            Text("حذف", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }

    val target = editing
    if (target != null) {
        WalletDialog(
            wallet = target,
            currency = currency,
            onDismiss = { editing = null },
            onSave = { updated ->
                scope.launch { repo.saveWallet(updated) }
                editing = null
            },
        )
    }

    val toDelete = deleting
    if (toDelete != null) {
        ConfirmDialog(
            title = "حذف المحفظة",
            message = "سيتم حذف المحفظة وكل العمليات المرتبطة بها. يمكنك أرشفتها بدلًا من الحذف.",
            confirmLabel = "حذف",
            onConfirm = { scope.launch { repo.deleteWallet(toDelete.id) } },
            onDismiss = { deleting = null },
        )
    }
}

@Composable
private fun WalletDialog(
    wallet: Wallet,
    currency: String,
    onDismiss: () -> Unit,
    onSave: (Wallet) -> Unit,
) {
    var name by remember { mutableStateOf(wallet.name) }
    var emoji by remember { mutableStateOf(wallet.emoji) }
    var color by remember { mutableStateOf(wallet.color) }
    var opening by remember { mutableStateOf(wallet.openingBalance.toInputText()) }
    var archived by remember { mutableStateOf(wallet.archived) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (wallet.id == 0L) "محفظة جديدة" else "تعديل المحفظة") },
        text = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    EmojiPickerButton(emoji = emoji, color = color, onPick = { emoji = it })
                    HSpace(12)
                    TextFieldRow(
                        value = name,
                        onValueChange = { name = it },
                        label = "اسم المحفظة",
                        modifier = Modifier.weight(1f),
                    )
                }
                VSpace(12)
                AmountField(
                    value = opening,
                    onValueChange = { opening = it },
                    label = "الرصيد الافتتاحي",
                    currency = currency,
                )
                VSpace(12)
                Text("اللون", style = MaterialTheme.typography.labelLarge)
                VSpace(8)
                ColorPickerRow(selected = color, onPick = { color = it })
                if (wallet.id != 0L) {
                    VSpace(8)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = archived, onCheckedChange = { archived = it })
                        Text("مؤرشفة")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (name.isNotBlank()) {
                        onSave(
                            wallet.copy(
                                name = name.trim(),
                                emoji = emoji,
                                color = color,
                                openingBalance = opening.toAmount(),
                                archived = archived,
                            )
                        )
                    }
                },
            ) { Text("حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}
