package com.kobiperta.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier as M
import androidx.core.content.ContextCompat
import com.kobiperta.app.ui.AppRoot
import com.kobiperta.app.ui.theme.KobiPerTaTheme

class MainActivity : ComponentActivity() {
    private var permissionReady by mutableStateOf(false)

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            permissionReady = true
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensurePermissions()
        setContent {
            KobiPerTaTheme {
                Surface(M.fillMaxSize()) {
                    AppRoot(permissionReady = permissionReady)
                }
            }
        }
    }

    private fun ensurePermissions() {
        val needed = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.CAMERA,
        ).filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (needed.isEmpty()) {
            permissionReady = true
        } else {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }
}
