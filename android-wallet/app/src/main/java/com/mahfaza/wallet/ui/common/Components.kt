package com.mahfaza.wallet.ui.common

import android.app.DatePickerDialog
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mahfaza.wallet.util.Fmt
import java.util.Calendar

/** بطاقة بسيطة بعنوان */
@Composable
fun SectionCard(
    title: String? = null,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (title != null || action != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (title != null) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f),
                        )
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                    action?.invoke()
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
            content()
        }
    }
}

/** دائرة ملوّنة تحتوي رمزًا تعبيريًا */
@Composable
fun EmojiAvatar(
    emoji: String,
    color: Color,
    size: Int = 44,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(color.copy(alpha = 0.16f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = emoji, fontSize = (size * 0.45f).sp)
    }
}

/** شريط تقدّم ملوّن */
@Composable
fun ProgressBar(
    fraction: Float,
    color: Color,
    modifier: Modifier = Modifier,
    height: Int = 8,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .height(height.dp)
                .clip(CircleShape)
                .background(color),
        )
    }
}

/** حقل إدخال مبلغ */
@Composable
fun AmountField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    currency: String,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { input ->
            val cleaned = input.replace("٫", ".").replace(",", ".")
            if (cleaned.isEmpty() || cleaned.matches(Regex("^\\d{0,12}(\\.\\d{0,2})?$"))) {
                onValueChange(cleaned)
            }
        },
        label = { Text("$label ($currency)") },
        singleLine = true,
        isError = isError,
        keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal),
        modifier = modifier.fillMaxWidth(),
    )
}

/** زر يفتح منتقي التاريخ الخاص بالنظام */
@Composable
fun DateField(
    label: String,
    millis: Long,
    onChange: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    OutlinedButton(
        onClick = {
            val base = Calendar.getInstance().apply { timeInMillis = millis }
            DatePickerDialog(
                context,
                { _, year, month, day ->
                    val picked = Calendar.getInstance().apply {
                        timeInMillis = millis
                        set(Calendar.YEAR, year)
                        set(Calendar.MONTH, month)
                        set(Calendar.DAY_OF_MONTH, day)
                    }
                    onChange(picked.timeInMillis)
                },
                base.get(Calendar.YEAR),
                base.get(Calendar.MONTH),
                base.get(Calendar.DAY_OF_MONTH),
            ).show()
        },
        shape = RoundedCornerShape(14.dp),
        modifier = modifier.fillMaxWidth().heightIn(min = 54.dp),
    ) {
        Text(text = "$label: ${Fmt.date(millis)}")
    }
}

/** صفّ اختيار من بين عدة خيارات */
@Composable
fun <T> ChoiceRow(
    options: List<T>,
    selected: T?,
    labelOf: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    colorOf: ((T) -> Color)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            val accent = colorOf?.invoke(option) ?: MaterialTheme.colorScheme.primary
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (isSelected) accent else MaterialTheme.colorScheme.surfaceVariant)
                    .clickable { onSelect(option) }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(
                    text = labelOf(option),
                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                    fontSize = 14.sp,
                )
            }
        }
    }
}

/** منتقي الرموز التعبيرية */
@Composable
fun EmojiPickerDialog(
    current: String,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("اختر رمزًا") },
        text = {
            LazyVerticalGrid(
                columns = GridCells.Fixed(6),
                modifier = Modifier.heightIn(max = 320.dp),
            ) {
                items(EMOJI_CHOICES) { emoji ->
                    Box(
                        modifier = Modifier
                            .padding(4.dp)
                            .size(44.dp)
                            .clip(CircleShape)
                            .background(
                                if (emoji == current) MaterialTheme.colorScheme.primaryContainer
                                else Color.Transparent
                            )
                            .clickable { onPick(emoji) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(text = emoji, fontSize = 22.sp)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("إغلاق") }
        },
    )
}

/** منتقي اللون */
@Composable
fun ColorPickerRow(
    selected: Long,
    onPick: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        COLOR_CHOICES.forEach { value ->
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(Color(value))
                    .border(
                        width = if (value == selected) 3.dp else 0.dp,
                        color = MaterialTheme.colorScheme.onSurface,
                        shape = CircleShape,
                    )
                    .clickable { onPick(value) },
            )
        }
    }
}

/** حوار تأكيد */
@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String = "تأكيد",
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = {
                onConfirm()
                onDismiss()
            }) { Text(confirmLabel, color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("إلغاء") }
        },
    )
}

/** رسالة عند عدم وجود بيانات */
@Composable
fun EmptyState(
    emoji: String,
    message: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = emoji, fontSize = 40.sp)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/** بطاقة إحصاء صغيرة */
@Composable
fun StatTile(
    label: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f)),
        border = BorderStroke(1.dp, color.copy(alpha = 0.25f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color,
            )
        }
    }
}

/** شريط تنقّل بين الشهور */
@Composable
fun MonthSwitcher(
    title: String,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        TextButton(onClick = onPrev) { Text("‹ السابق") }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        TextButton(onClick = onNext) { Text("التالي ›") }
    }
}

/** حقل نص عادي */
@Composable
fun TextFieldRow(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = singleLine,
        modifier = modifier.fillMaxWidth(),
    )
}

/** زر صغير لاختيار الرمز التعبيري مع فتح الحوار */
@Composable
fun EmojiPickerButton(
    emoji: String,
    color: Long,
    onPick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    Box(
        modifier = modifier
            .size(56.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color(color).copy(alpha = 0.16f))
            .clickable { open = true },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = emoji, fontSize = 26.sp)
    }
    if (open) {
        EmojiPickerDialog(
            current = emoji,
            onDismiss = { open = false },
            onPick = {
                onPick(it)
                open = false
            },
        )
    }
}

@Composable
fun VSpace(height: Int) {
    Spacer(modifier = Modifier.height(height.dp))
}

@Composable
fun HSpace(width: Int) {
    Spacer(modifier = Modifier.width(width.dp))
}

val COLOR_CHOICES = listOf(
    0xFF00695C, 0xFF2E7D32, 0xFF1565C0, 0xFF6A1B9A, 0xFFAD1457,
    0xFFC62828, 0xFFEF6C00, 0xFFF9A825, 0xFF5D4037, 0xFF455A64,
    0xFF00838F, 0xFF4527A0, 0xFF827717, 0xFFD81B60, 0xFF616161,
)

val EMOJI_CHOICES = listOf(
    "💵", "💰", "🏦", "💳", "📱", "👛",
    "🍽", "☕", "🍔", "🛒", "👕", "👟",
    "🚌", "🚗", "⛽", "🚕", "✈️", "🚆",
    "🏠", "🔑", "💡", "🚿", "🧾", "📶",
    "💊", "🏥", "📚", "🎓", "🎮", "🎬",
    "🎁", "🤲", "🔧", "🧹", "👶", "🐶",
    "💼", "🖥", "🏷", "📈", "🎯", "📦",
)
