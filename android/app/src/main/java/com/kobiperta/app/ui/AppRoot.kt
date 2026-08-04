package com.kobiperta.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.kobiperta.app.data.ApiClient
import com.kobiperta.app.data.AuthUser
import com.kobiperta.app.data.TodayRow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

@Composable
fun AppRoot(permissionReady: Boolean) {
    val api = remember { ApiClient() }
    var user by remember { mutableStateOf<AuthUser?>(null) }

    if (user == null) {
        LoginScreen(api) { user = it }
    } else {
        HomeScreen(
            api = api,
            user = user!!,
            permissionReady = permissionReady,
            onLogout = { user = null; api.token = null },
        )
    }
}

@Composable
fun LoginScreen(api: ApiClient, onLoggedIn: (AuthUser) -> Unit) {
    var email by remember { mutableStateOf("personel@kobiperta.local") }
    var password by remember { mutableStateOf("personel123") }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(Color(0xFF0F172A), Color(0xFF0369A1)))
            )
            .padding(24.dp)
    ) {
        Column(modifier = Modifier.align(Alignment.Center), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("KobiPerTa", color = Color(0xFF7DD3FC), style = MaterialTheme.typography.labelLarge)
            Text(
                "Personel giriş / çıkış",
                color = Color.White,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.SemiBold,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("E-posta") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Şifre") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let { Text(it, color = Color(0xFFFCA5A5)) }
            Button(
                enabled = !loading,
                onClick = {
                    loading = true
                    error = null
                    scope.launch {
                        try {
                            onLoggedIn(api.login(email.trim(), password))
                        } catch (e: Exception) {
                            error = e.message
                        } finally {
                            loading = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (loading) "Giriş..." else "Giriş yap")
            }
        }
    }
}

@Composable
fun HomeScreen(
    api: ApiClient,
    user: AuthUser,
    permissionReady: Boolean,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var workDate by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf<List<TodayRow>>(emptyList()) }
    var message by remember { mutableStateOf<String?>(null) }
    var scanning by remember { mutableStateOf(false) }
    var pendingType by remember { mutableStateOf("CHECK_IN") }
    var loading by remember { mutableStateOf(false) }

    fun refresh() {
        scope.launch {
            try {
                val (date, list) = api.today()
                workDate = date
                rows = list
            } catch (e: Exception) {
                message = e.message
            }
        }
    }

    LaunchedEffect(Unit) { refresh() }

    fun punchWithToken(token: String) {
        loading = true
        message = null
        scope.launch {
            try {
                val loc = currentLocation(context)
                api.punch(pendingType, loc.latitude, loc.longitude, token)
                message = if (pendingType == "CHECK_IN") "Giriş kaydedildi" else "Çıkış kaydedildi"
                scanning = false
                refresh()
            } catch (e: Exception) {
                message = e.message
            } finally {
                loading = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
            .padding(16.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("KobiPerTa", color = Color(0xFF0284C7), style = MaterialTheme.typography.labelLarge)
                Text(user.fullName, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text(workDate.ifBlank { "Bugün" }, color = Color(0xFF64748B))
            }
            TextButton(onClick = onLogout) { Text("Çıkış") }
        }

        Spacer(Modifier = Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = permissionReady && !loading,
                onClick = {
                    pendingType = "CHECK_IN"
                    scanning = true
                },
            ) { Text("Giriş") }
            Button(
                enabled = permissionReady && !loading,
                onClick = {
                    pendingType = "CHECK_OUT"
                    scanning = true
                },
            ) { Text("Çıkış") }
            TextButton(onClick = { refresh() }) { Text("Yenile") }
        }

        message?.let {
            Text(
                it,
                modifier = Modifier.padding(top = 8.dp),
                color = if (it.contains("kaydedildi")) Color(0xFF047857) else Color(0xFFB91C1C),
            )
        }

        if (loading) {
            CircularProgressIndicator(modifier = Modifier.padding(top = 12.dp))
        }

        Text(
            "Şirket personeli",
            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
            style = MaterialTheme.typography.titleMedium,
        )
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rows) { row ->
                Card(shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier = Modifier.padding(14.dp)) {
                        Text(row.fullName, fontWeight = FontWeight.SemiBold)
                        Text("Giriş: ${row.checkIn ?: "—"}  ·  Çıkış: ${row.checkOut ?: "—"}")
                        Text("Durum: ${row.status}", color = Color(0xFF475569))
                    }
                }
            }
        }
    }

    if (scanning) {
        QrScannerDialog(
            title = if (pendingType == "CHECK_IN") "Giriş için QR okutun" else "Çıkış için QR okutun",
            onCancel = { scanning = false },
            onToken = { punchWithToken(it) },
        )
    }
}

@Composable
fun QrScannerDialog(title: String, onCancel: () -> Unit, onToken: (String) -> Unit) {
    var manual by remember { mutableStateOf("") }
    val lifecycleOwner = LocalLifecycleOwner.current
    var handled by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xCC0F172A))
            .padding(16.dp)
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .background(Color.White, RoundedCornerShape(20.dp))
                .padding(16.dp)
        ) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier = Modifier.height(8.dp))
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                    cameraProviderFuture.addListener({
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }
                        val analysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                        val scanner = BarcodeScanning.getClient()
                        analysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { imageProxy ->
                            val mediaImage = imageProxy.image
                            if (mediaImage != null && !handled) {
                                val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                                scanner.process(image)
                                    .addOnSuccessListener { barcodes ->
                                        val raw = barcodes.firstOrNull()?.rawValue
                                        if (!raw.isNullOrBlank() && !handled) {
                                            handled = true
                                            onToken(ApiClient.extractQrToken(raw))
                                        }
                                    }
                                    .addOnCompleteListener { imageProxy.close() }
                            } else {
                                imageProxy.close()
                            }
                        }
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            analysis,
                        )
                    }, ContextCompat.getMainExecutor(ctx))
                    previewView
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(280.dp),
            )
            Spacer(Modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = manual,
                onValueChange = { manual = it },
                label = { Text("veya QR token yapıştır") },
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onCancel) { Text("Vazgeç") }
                Button(onClick = { if (manual.isNotBlank()) onToken(ApiClient.extractQrToken(manual)) }) {
                    Text("Manuel gönder")
                }
            }
        }
    }
}

@SuppressLint("MissingPermission")
suspend fun currentLocation(context: Context): Location =
    suspendCancellableCoroutine { cont ->
        val client = LocationServices.getFusedLocationProviderClient(context)
        client.lastLocation
            .addOnSuccessListener { loc ->
                if (loc != null) cont.resume(loc)
                else cont.resumeWithException(IllegalStateException("Konum alınamadı. GPS açık mı?"))
            }
            .addOnFailureListener { cont.resumeWithException(it) }
    }
