package com.mahfaza.wallet

import android.app.Application
import com.mahfaza.wallet.data.AppDb
import com.mahfaza.wallet.data.Repository

class WalletApp : Application() {
    val repository: Repository by lazy { Repository(AppDb.get(this)) }
}
