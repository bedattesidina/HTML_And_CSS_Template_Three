package com.mahfaza.wallet.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mahfaza.wallet.data.TxType
import com.mahfaza.wallet.data.TxnView
import com.mahfaza.wallet.ui.theme.LocalMoneyColors
import com.mahfaza.wallet.util.Fmt

/** صفّ عرض عملية مالية واحدة */
@Composable
fun TxnRow(
    item: TxnView,
    currency: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showDate: Boolean = true,
) {
    val money = LocalMoneyColors.current
    val accent: Color = when (item.txn.type) {
        TxType.INCOME -> money.income
        TxType.EXPENSE -> money.expense
        TxType.TRANSFER -> money.transfer
    }
    val sign = when (item.txn.type) {
        TxType.INCOME -> "+"
        TxType.EXPENSE -> "−"
        TxType.TRANSFER -> ""
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EmojiAvatar(
            emoji = item.emoji,
            color = item.categoryColor?.let { Color(it) } ?: accent,
        )
        HSpace(12)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val subtitle = buildString {
                if (showDate) append(Fmt.shortDate(item.txn.date))
                if (item.txn.type != TxType.TRANSFER && !item.walletName.isNullOrBlank()) {
                    if (isNotEmpty()) append(" • ")
                    append(item.walletName)
                }
                if (item.txn.note.isNotBlank()) {
                    if (isNotEmpty()) append(" • ")
                    append(item.txn.note)
                }
            }
            if (subtitle.isNotBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        HSpace(8)
        Text(
            text = "$sign${Fmt.money(item.txn.amount, currency)}",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = accent,
            maxLines = 1,
        )
    }
}
