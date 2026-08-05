package com.kobiperta.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.location.Location
import android.net.Uri
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
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.Modifier as M
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.location.LocationServices
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.kobiperta.app.data.ApiClient
import com.kobiperta.app.data.AuthUser
import com.kobiperta.app.data.SessionStore
import com.kobiperta.app.data.TodayRow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private val Blue = Color(0xFF0369A1)
private val Dark = Color(0xFF0F172A)
private val Bg = Color(0xFFF1F5F9)

@Composable
fun AppRoot(permissionReady: Boolean) {
    val context = LocalContext.current
    val session = remember { SessionStore(context) }
    val api = remember { ApiClient(session) }
    var user by remember { mutableStateOf(session.currentUser()) }
    var checking by remember { mutableStateOf(session.token != null) }
    var screen by remember { mutableStateOf(if (user != null) "home" else "login") }

    LaunchedEffect(Unit) {
        if (session.token.isNullOrBlank()) {
            checking = false
            return@LaunchedEffect
        }
        try {
            user = api.me()
            screen = "home"
        } catch (_: Exception) {
            session.clear()
            user = null
            screen = "login"
        } finally {
            checking = false
        }
    }

    when {
        checking -> Box(M.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Blue)
        }
        screen == "forgot" -> ForgotScreen(api = api, onBack = { screen = "login" })
        user == null || screen == "login" -> LoginScreen(
            session = session,
            api = api,
            onLoggedIn = {
                user = it
                screen = "home"
            },
            onForgot = { screen = "forgot" },
        )
        else -> HomeScreen(
            api = api,
            user = user!!,
            permissionReady = permissionReady,
            onLogout = {
                session.clear()
                user = null
                screen = "login"
            },
        )
    }
}

@Composable
fun LoginScreen(
    session: SessionStore,
    api: ApiClient,
    onLoggedIn: (AuthUser) -> Unit,
    onForgot: () -> Unit,
) {
    var email by remember { mutableStateOf(session.email.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var apiUrl by remember { mutableStateOf(session.apiBaseUrl) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        M.fillMaxSize().background(Bg).padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("KobiPerTa", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Dark)
        Text(
            "Personel mesai girişi",
            color = Color(0xFF64748B),
            modifier = M.padding(top = 4.dp, bottom = 24.dp),
        )
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("E-posta") },
            singleLine = true,
            modifier = M.fillMaxWidth(),
        )
        Spacer(M.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Şifre") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = M.fillMaxWidth(),
        )
        Spacer(M.height(12.dp))
        OutlinedTextField(
            value = apiUrl,
            onValueChange = { apiUrl = it },
            label = { Text("Sunucu adresi") },
            singleLine = true,
            modifier = M.fillMaxWidth(),
        )
        error?.let {
            Text(it, color = Color(0xFFB91C1C), modifier = M.padding(top = 12.dp))
        }
        Button(
            enabled = !loading,
            onClick = {
                loading = true
                error = null
                session.apiBaseUrl = apiUrl
                scope.launch {
                    try {
                        onLoggedIn(api.login(email.trim(), password))
                    } catch (e: Exception) {
                        error = e.message ?: "Giriş başarısız"
                    } finally {
                        loading = false
                    }
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = Blue),
            modifier = M.fillMaxWidth().padding(top = 20.dp).height(52.dp),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text(if (loading) "Giriş yapılıyor..." else "Giriş yap", fontSize = 16.sp)
        }
        TextButton(onClick = onForgot, modifier = M.align(Alignment.CenterHorizontally)) {
            Text("Şifremi unuttum")
        }
    }
}

@Composable
fun ForgotScreen(api: ApiClient, onBack: () -> Unit) {
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var supportEmail by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        M.fillMaxSize().background(Bg).padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Şifremi unuttum", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Dark)
        Text(
            "E-posta adresinizi yazın. Yönlendirilecek yönetici maili gösterilir.",
            color = Color(0xFF64748B),
            modifier = M.padding(top = 8.dp, bottom = 20.dp),
        )
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("E-posta") },
            singleLine = true,
            modifier = M.fillMaxWidth(),
        )
        message?.let {
            Text(it, modifier = M.padding(top = 12.dp), color = Dark)
        }
        supportEmail?.let { mail ->
            Button(
                onClick = {
                    val intent = Intent(Intent.ACTION_SENDTO).apply {
                        data = Uri.parse(
                            "mailto:$mail?subject=" + Uri.encode("KobiPerTa şifre sıfırlama") +
                                "&body=" + Uri.encode("Merhaba,\n\nŞifremi unuttum.\nE-posta: $email\n"),
                        )
                    }
                    context.startActivity(Intent.createChooser(intent, "Mail gönder"))
                },
                colors = ButtonDefaults.buttonColors(containerColor = Blue),
                modifier = M.fillMaxWidth().padding(top = 16.dp).height(48.dp),
            ) {
                Text("Mail gönder: $mail")
            }
        }
        Button(
            enabled = !loading && email.isNotBlank(),
            onClick = {
                loading = true
                scope.launch {
                    try {
                        val (msg, support) = api.forgotPassword(email.trim())
                        message = msg
                        supportEmail = support
                    } catch (e: Exception) {
                        message = e.message
                    } finally {
                        loading = false
                    }
                }
            },
            modifier = M.fillMaxWidth().padding(top = 12.dp).height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Dark),
        ) {
            Text(if (loading) "Gönderiliyor..." else "Devam et")
        }
        TextButton(onClick = onBack) { Text("Geri dön") }
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
    var myStatus by remember { mutableStateOf("-") }
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
                val mine = list.find { it.fullName == user.fullName }
                myStatus = when {
                    mine?.checkIn != null && mine.checkOut == null -> "Mesai devam ediyor"
                    mine?.checkOut != null -> "Mesai bitti"
                    else -> "Henüz giriş yok"
                }
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
                message = if (pendingType == "CHECK_IN") "Mesaiye başlandı" else "Mesai bitirildi"
                scanning = false
                refresh()
            } catch (e: Exception) {
                message = e.message
            } finally {
                loading = false
            }
        }
    }

    Column(M.fillMaxSize().background(Bg).padding(20.dp)) {
        Row(M.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("KobiPerTa", color = Blue, fontWeight = FontWeight.Bold)
                Text(user.fullName, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = Dark)
                Text(workDate.ifBlank { "Bugün" }, color = Color(0xFF64748B))
            }
            TextButton(onClick = onLogout) { Text("Çıkış") }
        }

        Text(
            myStatus,
            modifier = M.padding(top = 12.dp, bottom = 20.dp),
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            color = Dark,
        )

        BigAction(
            title = "Mesaiye başla",
            subtitle = "Giriş kaydı (GPS + QR)",
            color = Color(0xFF059669),
            enabled = permissionReady && !loading,
            onClick = {
                pendingType = "CHECK_IN"
                scanning = true
            },
        )
        Spacer(M.height(12.dp))
        BigAction(
            title = "QR okut",
            subtitle = "Kamera ile kodu okut",
            color = Blue,
            enabled = permissionReady && !loading,
            onClick = {
                pendingType = if (myStatus == "Mesai devam ediyor") "CHECK_OUT" else "CHECK_IN"
                scanning = true
            },
        )
        Spacer(M.height(12.dp))
        BigAction(
            title = "Mesaiyi bitir",
            subtitle = "Çıkış kaydı (GPS + QR)",
            color = Color(0xFFB45309),
            enabled = permissionReady && !loading,
            onClick = {
                pendingType = "CHECK_OUT"
                scanning = true
            },
        )

        if (loading) {
            CircularProgressIndicator(modifier = M.padding(top = 16.dp), color = Blue)
        }
        message?.let {
            Text(
                it,
                modifier = M.padding(top = 12.dp),
                color = if (it.contains("başland") || it.contains("bitir")) Color(0xFF047857) else Color(0xFFB91C1C),
            )
        }

        Text(
            "Bugün şirket durumu",
            modifier = M.padding(top = 24.dp, bottom = 8.dp),
            fontWeight = FontWeight.SemiBold,
            color = Dark,
        )
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(rows) { row ->
                Column(
                    M.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp)).padding(12.dp),
                ) {
                    Text(row.fullName, fontWeight = FontWeight.SemiBold)
                    Text("Giriş ${row.checkIn ?: "-"}  ·  Çıkış ${row.checkOut ?: "-"}  ·  ${row.status}")
                }
            }
        }
    }

    if (scanning) {
        QrScannerDialog(
            title = if (pendingType == "CHECK_IN") "Mesaiye başla - QR okutun" else "Mesaiyi bitir - QR okutun",
            onCancel = { scanning = false },
            onToken = { punchWithToken(it) },
        )
    }
}

@Composable
private fun BigAction(
    title: String,
    subtitle: String,
    color: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(16.dp),
        modifier = M.fillMaxWidth().height(72.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(subtitle, fontSize = 12.sp)
        }
    }
}

@Composable
fun QrScannerDialog(title: String, onCancel: () -> Unit, onToken: (String) -> Unit) {
    var manual by remember { mutableStateOf("") }
    val lifecycleOwner = LocalLifecycleOwner.current
    var handled by remember { mutableStateOf(false) }

    Box(M.fillMaxSize().background(Color(0xCC0F172A)).padding(16.dp)) {
        Column(
            M.align(Alignment.Center)
                .fillMaxWidth()
                .background(Color.White, RoundedCornerShape(20.dp))
                .padding(16.dp),
        ) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, textAlign = TextAlign.Center)
            Spacer(M.height(8.dp))
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
                                val image = InputImage.fromMediaImage(
                                    mediaImage,
                                    imageProxy.imageInfo.rotationDegrees,
                                )
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
                modifier = M.fillMaxWidth().height(280.dp),
            )
            Spacer(M.height(8.dp))
            OutlinedTextField(
                value = manual,
                onValueChange = { manual = it },
                label = { Text("veya token yapıştır") },
                modifier = M.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onCancel) { Text("Vazgeç") }
                Button(
                    onClick = { if (manual.isNotBlank()) onToken(ApiClient.extractQrToken(manual)) },
                    colors = ButtonDefaults.buttonColors(containerColor = Blue),
                ) { Text("Gönder") }
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
                else cont.resumeWithException(IllegalStateException("Konum alinamadi. GPS acik olsun."))
            }
            .addOnFailureListener { cont.resumeWithException(it) }
    }
