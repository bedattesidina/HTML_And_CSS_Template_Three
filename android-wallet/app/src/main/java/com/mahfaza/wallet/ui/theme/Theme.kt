package com.mahfaza.wallet.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

private val BrandLight = Color(0xFF00695C)
private val BrandDark = Color(0xFF4DB6AC)

private val LightScheme = lightColorScheme(
    primary = BrandLight,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFB2DFDB),
    onPrimaryContainer = Color(0xFF00251F),
    secondary = Color(0xFF00838F),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFB2EBF2),
    onSecondaryContainer = Color(0xFF00282E),
    tertiary = Color(0xFFEF6C00),
    onTertiary = Color.White,
    background = Color(0xFFF5F7F6),
    onBackground = Color(0xFF13201E),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF13201E),
    surfaceVariant = Color(0xFFE2EBE8),
    onSurfaceVariant = Color(0xFF42504D),
    outline = Color(0xFF9EAEAA),
    outlineVariant = Color(0xFFCEDAD7),
    error = Color(0xFFC62828),
    onError = Color.White,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
)

private val DarkScheme = darkColorScheme(
    primary = BrandDark,
    onPrimary = Color(0xFF00322B),
    primaryContainer = Color(0xFF005045),
    onPrimaryContainer = Color(0xFFB2DFDB),
    secondary = Color(0xFF4DD0E1),
    onSecondary = Color(0xFF00363D),
    secondaryContainer = Color(0xFF004F58),
    onSecondaryContainer = Color(0xFFB2EBF2),
    tertiary = Color(0xFFFFB74D),
    onTertiary = Color(0xFF452B00),
    background = Color(0xFF101413),
    onBackground = Color(0xFFE2E6E4),
    surface = Color(0xFF181D1C),
    onSurface = Color(0xFFE2E6E4),
    surfaceVariant = Color(0xFF2A3230),
    onSurfaceVariant = Color(0xFFBFC9C6),
    outline = Color(0xFF6B7976),
    outlineVariant = Color(0xFF3A4442),
    error = Color(0xFFEF9A9A),
    onError = Color(0xFF4B0F0F),
    errorContainer = Color(0xFF6E1F1F),
    onErrorContainer = Color(0xFFFFDAD6),
)

/** ألوان خاصة بالمبالغ لا توجد في نظام ألوان مِتيريال */
data class MoneyColors(
    val income: Color,
    val expense: Color,
    val transfer: Color,
    val owedToMe: Color,
    val iOwe: Color,
    val incomeSoft: Color,
    val expenseSoft: Color,
)

private val LightMoney = MoneyColors(
    income = Color(0xFF2E7D32),
    expense = Color(0xFFC62828),
    transfer = Color(0xFF1565C0),
    owedToMe = Color(0xFF2E7D32),
    iOwe = Color(0xFFD84315),
    incomeSoft = Color(0xFFE3F2E5),
    expenseSoft = Color(0xFFFDE7E7),
)

private val DarkMoney = MoneyColors(
    income = Color(0xFF81C784),
    expense = Color(0xFFEF9A9A),
    transfer = Color(0xFF90CAF9),
    owedToMe = Color(0xFF81C784),
    iOwe = Color(0xFFFFAB91),
    incomeSoft = Color(0xFF1C2A1E),
    expenseSoft = Color(0xFF2E1B1B),
)

val LocalMoneyColors = staticCompositionLocalOf { LightMoney }

@Composable
fun MahfaztiTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalMoneyColors provides if (darkTheme) DarkMoney else LightMoney) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkScheme else LightScheme,
            content = content,
        )
    }
}
