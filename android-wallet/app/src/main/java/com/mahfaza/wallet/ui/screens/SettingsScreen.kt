package com.mahfaza.wallet.ui.screens

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.mahfaza.wallet.data.Prefs
import com.mahfaza.wallet.ui.common.ChoiceRow
import com.mahfaza.wallet.ui.common.ConfirmDialog
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.common.SectionCard
import com.mahfaza.wallet.ui.common.TextFieldRow
import com.mahfaza.wallet.ui.common.VSpace
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private val CURRENCIES = listOf(
    "ج.م", "ر.س", "د.إ", "د.ك", "د.ب", "ر.ع", "د.أ", "ل.ل", "ل.س",
    "د.ع", "ر.ي", "د.ل", "د.ت", "د.ج", "درهم", "$", "€", "£", "₺",
)

private val THEME_OPTIONS = listOf(
    "system" to "حسب النظام",
    "light" to "فاتح",
    "dark" to "داكن",
)

@Composable
fun SettingsScreen(
    contentPadding: PaddingValues,
    onOpenWallets: () -> Unit,
    onOpenCategories: () -> Unit,
) {
    val repo = LocalRepo.current
    val currency = LocalCurrency.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val revision by repo.revision.collectAsState()

    var themeMode by remember { mutableStateOf("system") }
    var customCurrency by remember { mutableStateOf<String?>(null) }
    var askClearTxns by remember { mutableStateOf(false) }
    var askClearAll by remember { mutableStateOf(false) }

    LaunchedEffect(revision) {
        themeMode = repo.pref(Prefs.THEME, "system")
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
            SectionCard(title = "العملة") {
                ChoiceRow(
                    options = CURRENCIES,
                    selected = currency,
                    labelOf = { it },
                    onSelect = { picked ->
                        scope.launch { repo.setPref(Prefs.CURRENCY, picked) }
                    },
                )
                VSpace(10)
                TextButton(onClick = { customCurrency = currency }) {
                    Text("رمز عملة مخصص…")
                }
            }
        }

        item {
            SectionCard(title = "المظهر") {
                ChoiceRow(
                    options = THEME_OPTIONS,
                    selected = THEME_OPTIONS.firstOrNull { it.first == themeMode },
                    labelOf = { it.second },
                    onSelect = { option ->
                        scope.launch { repo.setPref(Prefs.THEME, option.first) }
                    },
                )
            }
        }

        item {
            SectionCard(title = "الإدارة") {
                SettingRow(title = "المحافظ", subtitle = "إضافة وتعديل المحافظ وأرصدتها", onClick = onOpenWallets)
                HorizontalDivider()
                SettingRow(
                    title = "التصنيفات والميزانيات",
                    subtitle = "تصنيفات الدخل والمصروفات والميزانية الشهرية",
                    onClick = onOpenCategories,
                )
            }
        }

        item {
            SectionCard(title = "النسخ والتصدير") {
                SettingRow(
                    title = "تصدير البيانات (CSV)",
                    subtitle = "ملف يفتح في Excel أو Google Sheets",
                    onClick = {
                        scope.launch {
                            val csv = repo.exportCsv()
                            val file = withContext(Dispatchers.IO) {
                                val dir = File(context.cacheDir, "exports")
                                dir.mkdirs()
                                val out = File(dir, "mahfazti.csv")
                                out.writeText(csv)
                                out
                            }
                            val uri = FileProvider.getUriForFile(
                                context,
                                "${context.packageName}.fileprovider",
                                file,
                            )
                            val intent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/csv"
                                putExtra(Intent.EXTRA_STREAM, uri)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            context.startActivity(Intent.createChooser(intent, "تصدير البيانات"))
                        }
                    },
                )
            }
        }

        item {
            SectionCard(title = "منطقة الخطر") {
                SettingRow(
                    title = "حذف كل العمليات",
                    subtitle = "تبقى المحافظ والتصنيفات كما هي",
                    danger = true,
                    onClick = { askClearTxns = true },
                )
                HorizontalDivider()
                SettingRow(
                    title = "حذف كل البيانات",
                    subtitle = "العمليات والديون والدفعات",
                    danger = true,
                    onClick = { askClearAll = true },
                )
            }
        }

        item {
            SectionCard(title = "عن التطبيق") {
                Text(
                    text = "محفظتي — متابعة الدخل والمصاريف والديون.\n" +
                        "الإصدار 1.0.0 • كل البيانات محفوظة على جهازك فقط، بدون إنترنت وبدون حسابات.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }

    val editingCurrency = customCurrency
    if (editingCurrency != null) {
        var text by remember(editingCurrency) { mutableStateOf(editingCurrency) }
        AlertDialog(
            onDismissRequest = { customCurrency = null },
            title = { Text("رمز العملة") },
            text = {
                TextFieldRow(value = text, onValueChange = { text = it }, label = "مثال: ج.م")
            },
            confirmButton = {
                TextButton(onClick = {
                    val value = text.trim()
                    if (value.isNotEmpty()) {
                        scope.launch { repo.setPref(Prefs.CURRENCY, value) }
                    }
                    customCurrency = null
                }) { Text("حفظ") }
            },
            dismissButton = {
                TextButton(onClick = { customCurrency = null }) { Text("إلغاء") }
            },
        )
    }

    if (askClearTxns) {
        ConfirmDialog(
            title = "حذف كل العمليات",
            message = "لا يمكن التراجع عن هذه الخطوة.",
            confirmLabel = "حذف",
            onConfirm = {
                scope.launch {
                    repo.clearTransactions()
                    Toast.makeText(context, "تم حذف العمليات", Toast.LENGTH_SHORT).show()
                }
            },
            onDismiss = { askClearTxns = false },
        )
    }

    if (askClearAll) {
        ConfirmDialog(
            title = "حذف كل البيانات",
            message = "سيتم حذف العمليات والديون والدفعات. لا يمكن التراجع.",
            confirmLabel = "حذف الكل",
            onConfirm = {
                scope.launch {
                    repo.clearEverything()
                    Toast.makeText(context, "تم حذف البيانات", Toast.LENGTH_SHORT).show()
                }
            },
            onDismiss = { askClearAll = false },
        )
    }
}

@Composable
private fun SettingRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    danger: Boolean = false,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 12.dp),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
