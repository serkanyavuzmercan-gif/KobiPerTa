package com.kobiperta.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import android.provider.Settings
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
import androidx.compose.foundation.layout.size
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
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.kobiperta.app.data.ApiClient
import com.kobiperta.app.data.AuthUser
import com.kobiperta.app.data.SessionStore
import com.kobiperta.app.data.TodayRow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import java.util.concurrent.atomic.AtomicBoolean

private val Blue = Color(0xFF0369A1)
private val Dark = Color(0xFF0F172A)
private val Bg = Color(0xFFF1F5F9)

/** Keeps the spinner up long enough that the result does not flash past the user. */
private const val FEEDBACK_DELAY_MS = 5_000L

/** Matches the server rule that blocks a check-out right after a check-in. */
private const val PUNCH_COOLDOWN_MS = 5 * 60_000L

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
        error?.let { msg ->
            Text(msg, color = Color(0xFFB91C1C), modifier = M.padding(top = 12.dp))
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
    var messageOk by remember { mutableStateOf(false) }
    var scanning by remember { mutableStateOf(false) }
    var pendingType by remember { mutableStateOf("CHECK_IN") }
    var loading by remember { mutableStateOf(false) }
    var waitSeconds by remember { mutableStateOf(0) }
    var gpsEnabled by remember { mutableStateOf(locationServicesEnabled(context)) }
    var cooldownUntil by remember { mutableStateOf(0L) }
    var nowMs by remember { mutableStateOf(System.currentTimeMillis()) }

    val cooldownLeftSec = ((cooldownUntil - nowMs) / 1000).toInt().coerceAtLeast(0)

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

    LaunchedEffect(Unit) {
        while (true) {
            nowMs = System.currentTimeMillis()
            gpsEnabled = locationServicesEnabled(context)
            delay(1000)
        }
    }

    fun runPunch(type: String, mode: String, qrToken: String? = null) {
        loading = true
        message = null
        waitSeconds = (FEEDBACK_DELAY_MS / 1000).toInt()
        scope.launch {
            val startedAt = System.currentTimeMillis()
            val ticker = launch {
                while (waitSeconds > 0) {
                    delay(1000)
                    waitSeconds -= 1
                }
            }
            val outcome = runCatching {
                if (!locationServicesEnabled(context)) {
                    error("Telefonunuzun konum (GPS) servisi kapalı. Ayarlardan konumu açıp tekrar deneyin.")
                }
                val loc = currentLocation(context)
                api.punch(type, loc.latitude, loc.longitude, mode = mode, qrToken = qrToken)
            }
            val elapsed = System.currentTimeMillis() - startedAt
            if (elapsed < FEEDBACK_DELAY_MS) delay(FEEDBACK_DELAY_MS - elapsed)
            ticker.cancel()
            waitSeconds = 0

            val suffix = if (mode == "qr") " (QR)" else ""
            outcome
                .onSuccess {
                    messageOk = true
                    message = if (type == "CHECK_IN") "Giriş yapıldı$suffix" else "Çıkış yapıldı$suffix"
                    cooldownUntil = System.currentTimeMillis() + PUNCH_COOLDOWN_MS
                    refresh()
                }
                .onFailure {
                    messageOk = false
                    message = it.message ?: "İşlem başarısız"
                }
            loading = false
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
            modifier = M.padding(top = 12.dp, bottom = 12.dp),
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
            color = Dark,
        )

        if (!gpsEnabled) {
            Column(
                M.fillMaxWidth()
                    .background(Color(0xFFFEF3C7), RoundedCornerShape(12.dp))
                    .padding(12.dp),
            ) {
                Text("Konum servisi kapalı", fontWeight = FontWeight.Bold, color = Color(0xFF92400E))
                Text(
                    "Giriş-çıkış yapabilmek için telefonunuzun GPS/konum servisini açın.",
                    color = Color(0xFF92400E),
                    fontSize = 13.sp,
                )
                Button(
                    onClick = {
                        context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFB45309)),
                    modifier = M.padding(top = 8.dp),
                    shape = RoundedCornerShape(10.dp),
                ) {
                    Text("Konum ayarlarını aç")
                }
            }
            Spacer(M.height(12.dp))
        }

        val cooldownText = if (cooldownLeftSec > 0) {
            "Yeni işlem için ${cooldownLeftSec / 60} dk ${cooldownLeftSec % 60} sn"
        } else {
            null
        }
        val actionsEnabled = permissionReady && !loading && gpsEnabled && cooldownLeftSec == 0

        BigAction(
            title = "Mesaiye başla",
            subtitle = cooldownText ?: "Konum ile giriş",
            color = Color(0xFF059669),
            enabled = actionsEnabled,
            onClick = { runPunch("CHECK_IN", "gps") },
        )
        Spacer(M.height(12.dp))
        BigAction(
            title = "QR okut",
            subtitle = cooldownText ?: "Kamera ile otomatik kayıt",
            color = Blue,
            enabled = actionsEnabled,
            onClick = {
                pendingType = if (myStatus == "Mesai devam ediyor") "CHECK_OUT" else "CHECK_IN"
                scanning = true
            },
        )
        Spacer(M.height(12.dp))
        BigAction(
            title = "Mesaiyi bitir",
            subtitle = cooldownText ?: "Konum ile çıkış",
            color = Color(0xFFB45309),
            enabled = actionsEnabled,
            onClick = { runPunch("CHECK_OUT", "gps") },
        )

        if (loading) {
            Row(
                M.padding(top = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = M.size(22.dp), color = Blue)
                Text(
                    if (waitSeconds > 0) "İşleminiz kaydediliyor… $waitSeconds sn" else "İşleminiz kaydediliyor…",
                    modifier = M.padding(start = 12.dp),
                    color = Dark,
                )
            }
        }
        message?.let {
            Text(
                it,
                modifier = M.padding(top = 12.dp),
                fontWeight = FontWeight.SemiBold,
                color = if (messageOk) Color(0xFF047857) else Color(0xFFB91C1C),
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
            title = if (pendingType == "CHECK_IN") "QR okut — giriş" else "QR okut — çıkış",
            onCancel = { scanning = false },
            onToken = { token ->
                scanning = false
                runPunch(pendingType, "qr", token)
            },
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
    val lifecycleOwner = LocalLifecycleOwner.current
    val handled = remember { AtomicBoolean(false) }
    var statusText by remember { mutableStateOf("QR kodu kameraya gösterin…") }

    Box(M.fillMaxSize().background(Color(0xCC0F172A)).padding(16.dp)) {
        Column(
            M.align(Alignment.Center)
                .fillMaxWidth()
                .background(Color.White, RoundedCornerShape(20.dp))
                .padding(16.dp),
        ) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp, textAlign = TextAlign.Center)
            Text(
                statusText,
                color = Color(0xFF64748B),
                modifier = M.padding(top = 6.dp, bottom = 8.dp),
                textAlign = TextAlign.Center,
            )
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val mainExecutor = ContextCompat.getMainExecutor(ctx)
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
                        analysis.setAnalyzer(mainExecutor) { imageProxy ->
                            val mediaImage = imageProxy.image
                            if (mediaImage == null || handled.get()) {
                                imageProxy.close()
                                return@setAnalyzer
                            }
                            val image = InputImage.fromMediaImage(
                                mediaImage,
                                imageProxy.imageInfo.rotationDegrees,
                            )
                            scanner.process(image)
                                .addOnSuccessListener(mainExecutor) { barcodes ->
                                    val raw = barcodes.firstOrNull()?.rawValue
                                    if (!raw.isNullOrBlank() && handled.compareAndSet(false, true)) {
                                        statusText = "QR okundu, kaydediliyor…"
                                        onToken(ApiClient.extractQrToken(raw))
                                    }
                                }
                                .addOnCompleteListener { imageProxy.close() }
                        }
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            analysis,
                        )
                    }, mainExecutor)
                    previewView
                },
                modifier = M.fillMaxWidth().height(320.dp),
            )
            Spacer(M.height(12.dp))
            OutlinedButton(onClick = onCancel, modifier = M.fillMaxWidth()) {
                Text("Vazgeç")
            }
        }
    }
}

/** True when the device has GPS or network location turned on. */
fun locationServicesEnabled(context: Context): Boolean {
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        ?: return false
    val gps = runCatching { manager.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false)
    val network =
        runCatching { manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false)
    return gps || network
}

@SuppressLint("MissingPermission")
suspend fun currentLocation(context: Context): Location = withContext(Dispatchers.Main) {
    val client = LocationServices.getFusedLocationProviderClient(context)
    try {
        val cts = CancellationTokenSource()
        val fresh = client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token).await()
        if (fresh != null) return@withContext fresh
    } catch (_: Exception) {
        // fallback below
    }
    suspendCancellableCoroutine { cont ->
        client.lastLocation
            .addOnSuccessListener { loc ->
                if (loc != null) cont.resume(loc)
                else cont.resumeWithException(
                    IllegalStateException("Konum alınamadı. GPS’i açıp açık alanda tekrar deneyin.")
                )
            }
            .addOnFailureListener {
                cont.resumeWithException(
                    IllegalStateException("Konum alınamadı. Konum izni ve GPS açık olsun.")
                )
            }
    }
}
