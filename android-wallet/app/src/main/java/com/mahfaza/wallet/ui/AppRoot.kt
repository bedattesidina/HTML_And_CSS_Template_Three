package com.mahfaza.wallet.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.mahfaza.wallet.data.Prefs
import com.mahfaza.wallet.data.Repository
import com.mahfaza.wallet.ui.common.LocalCurrency
import com.mahfaza.wallet.ui.common.LocalRepo
import com.mahfaza.wallet.ui.screens.CategoriesScreen
import com.mahfaza.wallet.ui.screens.DebtEditScreen
import com.mahfaza.wallet.ui.screens.DebtsScreen
import com.mahfaza.wallet.ui.screens.HomeScreen
import com.mahfaza.wallet.ui.screens.SettingsScreen
import com.mahfaza.wallet.ui.screens.StatsScreen
import com.mahfaza.wallet.ui.screens.TxEditScreen
import com.mahfaza.wallet.ui.screens.TxnsScreen
import com.mahfaza.wallet.ui.screens.WalletsScreen
import com.mahfaza.wallet.ui.theme.MahfaztiTheme

object Routes {
    const val HOME = "home"
    const val TXNS = "txns"
    const val STATS = "stats"
    const val DEBTS = "debts"
    const val SETTINGS = "settings"
    const val WALLETS = "wallets"
    const val CATEGORIES = "categories"
    const val TX_EDIT = "tx_edit"
    const val DEBT_EDIT = "debt_edit"

    fun txEdit(id: Long) = "$TX_EDIT/$id"
    fun debtEdit(id: Long) = "$DEBT_EDIT/$id"
}

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab(Routes.HOME, "الرئيسية", Icons.Filled.Home),
    Tab(Routes.TXNS, "العمليات", Icons.AutoMirrored.Filled.List),
    Tab(Routes.STATS, "التقارير", Icons.Filled.DateRange),
    Tab(Routes.DEBTS, "الديون", Icons.Filled.Person),
    Tab(Routes.SETTINGS, "الإعدادات", Icons.Filled.Settings),
)

@Composable
fun AppRoot(repository: Repository) {
    val revision by repository.revision.collectAsState()
    var currency by remember { mutableStateOf("ج.م") }
    var themeMode by remember { mutableStateOf("system") }

    LaunchedEffect(revision) {
        currency = repository.pref(Prefs.CURRENCY, "ج.م")
        themeMode = repository.pref(Prefs.THEME, "system")
    }

    val darkTheme = when (themeMode) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }

    MahfaztiTheme(darkTheme = darkTheme) {
        CompositionLocalProvider(
            LocalRepo provides repository,
            LocalCurrency provides currency,
            LocalLayoutDirection provides LayoutDirection.Rtl,
        ) {
            AppScaffold()
        }
    }
}

@Composable
private fun AppScaffold() {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val isTopLevel = TABS.any { it.route == currentRoute }

    Scaffold(
        bottomBar = {
            if (isTopLevel) {
                NavigationBar {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = currentRoute == tab.route,
                            onClick = { navController.switchTab(tab.route) },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                            alwaysShowLabel = false,
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            if (currentRoute == Routes.HOME || currentRoute == Routes.TXNS) {
                FloatingActionButton(
                    onClick = { navController.navigate(Routes.txEdit(0L)) },
                    containerColor = MaterialTheme.colorScheme.primary,
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "إضافة عملية")
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier,
        ) {
            composable(Routes.HOME) {
                HomeScreen(
                    contentPadding = padding,
                    onAddTxn = { navController.navigate(Routes.txEdit(0L)) },
                    onOpenTxn = { id -> navController.navigate(Routes.txEdit(id)) },
                    onOpenWallets = { navController.navigate(Routes.WALLETS) },
                    onOpenDebts = { navController.switchTab(Routes.DEBTS) },
                    onOpenTxns = { navController.switchTab(Routes.TXNS) },
                )
            }
            composable(Routes.TXNS) {
                TxnsScreen(
                    contentPadding = padding,
                    onOpenTxn = { id -> navController.navigate(Routes.txEdit(id)) },
                )
            }
            composable(Routes.STATS) {
                StatsScreen(contentPadding = padding)
            }
            composable(Routes.DEBTS) {
                DebtsScreen(
                    contentPadding = padding,
                    onEditDebt = { id -> navController.navigate(Routes.debtEdit(id)) },
                )
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    contentPadding = padding,
                    onOpenWallets = { navController.navigate(Routes.WALLETS) },
                    onOpenCategories = { navController.navigate(Routes.CATEGORIES) },
                )
            }
            composable(Routes.WALLETS) {
                WalletsScreen(onBack = { navController.popBackStack() })
            }
            composable(Routes.CATEGORIES) {
                CategoriesScreen(onBack = { navController.popBackStack() })
            }
            composable("${Routes.TX_EDIT}/{id}") { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: 0L
                TxEditScreen(txnId = id, onBack = { navController.popBackStack() })
            }
            composable("${Routes.DEBT_EDIT}/{id}") { entry ->
                val id = entry.arguments?.getString("id")?.toLongOrNull() ?: 0L
                DebtEditScreen(debtId = id, onBack = { navController.popBackStack() })
            }
        }
    }
}

private fun NavHostController.switchTab(route: String) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
