package com.mahfaza.wallet.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
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
import com.mahfaza.wallet.data.Category
import com.mahfaza.wallet.data.TxType
import com.mahfaza.wallet.ui.common.AmountField
import com.mahfaza.wallet.ui.common.ChoiceRow
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
fun CategoriesScreen(onBack: () -> Unit) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val scope = rememberCoroutineScope()
    val revision by repo.revision.collectAsState()

    var type by remember { mutableStateOf(TxType.EXPENSE) }
    var categories by remember { mutableStateOf<List<Category>>(emptyList()) }
    var editing by remember { mutableStateOf<Category?>(null) }
    var deleting by remember { mutableStateOf<Category?>(null) }

    LaunchedEffect(revision, type) {
        categories = repo.categories(type = type, includeArchived = true)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("التصنيفات") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        editing = Category(type = type, position = categories.size)
                    }) {
                        Icon(Icons.Filled.Add, contentDescription = "إضافة تصنيف")
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
                ChoiceRow(
                    options = listOf(TxType.EXPENSE, TxType.INCOME),
                    selected = type,
                    labelOf = { if (it == TxType.EXPENSE) "تصنيفات المصروفات" else "تصنيفات الدخل" },
                    onSelect = { type = it },
                )
            }

            if (categories.isEmpty()) {
                item {
                    EmptyState(emoji = "🏷", message = "لا توجد تصنيفات. أضف تصنيفًا من زر +")
                }
            }

            items(categories, key = { it.id }) { category ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        EmojiAvatar(emoji = category.emoji, color = Color(category.color))
                        HSpace(12)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = category.name + if (category.archived) " (مخفي)" else "",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            if (category.monthlyBudget > 0) {
                                Text(
                                    text = "ميزانية شهرية: ${Fmt.money(category.monthlyBudget, currency)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                    Row(modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = { editing = category }) { Text("تعديل") }
                        TextButton(onClick = {
                            scope.launch { repo.saveCategory(category.copy(archived = !category.archived)) }
                        }) {
                            Text(if (category.archived) "إظهار" else "إخفاء")
                        }
                        TextButton(onClick = { deleting = category }) {
                            Text("حذف", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }

    val target = editing
    if (target != null) {
        CategoryDialog(
            category = target,
            currency = currency,
            onDismiss = { editing = null },
            onSave = { updated ->
                scope.launch { repo.saveCategory(updated) }
                editing = null
            },
        )
    }

    val toDelete = deleting
    if (toDelete != null) {
        ConfirmDialog(
            title = "حذف التصنيف",
            message = "العمليات المرتبطة بهذا التصنيف ستبقى لكن بدون تصنيف. يمكنك إخفاؤه بدلًا من حذفه.",
            confirmLabel = "حذف",
            onConfirm = { scope.launch { repo.deleteCategory(toDelete.id) } },
            onDismiss = { deleting = null },
        )
    }
}

@Composable
private fun CategoryDialog(
    category: Category,
    currency: String,
    onDismiss: () -> Unit,
    onSave: (Category) -> Unit,
) {
    var name by remember { mutableStateOf(category.name) }
    var emoji by remember { mutableStateOf(category.emoji) }
    var color by remember { mutableStateOf(category.color) }
    var type by remember { mutableStateOf(category.type) }
    var budget by remember { mutableStateOf(category.monthlyBudget.toInputText()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (category.id == 0L) "تصنيف جديد" else "تعديل التصنيف") },
        text = {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    EmojiPickerButton(emoji = emoji, color = color, onPick = { emoji = it })
                    HSpace(12)
                    TextFieldRow(
                        value = name,
                        onValueChange = { name = it },
                        label = "اسم التصنيف",
                        modifier = Modifier.weight(1f),
                    )
                }
                VSpace(12)
                ChoiceRow(
                    options = listOf(TxType.EXPENSE, TxType.INCOME),
                    selected = type,
                    labelOf = { it.label },
                    onSelect = { type = it },
                )
                if (type == TxType.EXPENSE) {
                    VSpace(12)
                    AmountField(
                        value = budget,
                        onValueChange = { budget = it },
                        label = "ميزانية شهرية (اختياري)",
                        currency = currency,
                    )
                }
                VSpace(12)
                Text("اللون", style = MaterialTheme.typography.labelLarge)
                VSpace(8)
                ColorPickerRow(selected = color, onPick = { color = it })
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (name.isNotBlank()) {
                        onSave(
                            category.copy(
                                name = name.trim(),
                                emoji = emoji,
                                color = color,
                                type = type,
                                monthlyBudget = if (type == TxType.EXPENSE) budget.toAmount() else 0.0,
                            )
                        )
                    }
                },
            ) { Text("حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } },
    )
}
