package com.kobiperta.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class TodayRow(
    val fullName: String,
    val checkIn: String?,
    val checkOut: String?,
    val status: String,
)

class ApiClient(private val session: SessionStore) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    private fun url(path: String) = session.apiBaseUrl + path

    private fun authed(builder: Request.Builder): Request.Builder {
        val t = session.token
        if (!t.isNullOrBlank()) builder.header("Authorization", "Bearer $t")
        return builder
    }

    suspend fun login(email: String, password: String): AuthUser = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()
            .toRequestBody(json)
        val req = Request.Builder().url(url("/api/auth/login")).post(body).build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = JSONObject(if (text.isBlank()) "{}" else text)
            if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "Giriş başarısız"))
            val token = obj.getString("token")
            val u = obj.getJSONObject("user")
            val user = AuthUser(
                id = u.getString("id"),
                email = u.getString("email"),
                fullName = u.getString("fullName"),
                role = u.getString("role"),
            )
            session.saveLogin(token, user)
            user
        }
    }

    suspend fun me(): AuthUser = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url(url("/api/me"))).get().build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = JSONObject(if (text.isBlank()) "{}" else text)
            if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "Oturum geçersiz"))
            AuthUser(
                id = obj.getString("id"),
                email = obj.getString("email"),
                fullName = obj.getString("fullName"),
                role = obj.getString("role"),
            ).also { session.saveLogin(session.token!!, it) }
        }
    }

    suspend fun forgotPassword(email: String): Pair<String, String> = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email).toString().toRequestBody(json)
        val req = Request.Builder().url(url("/api/auth/forgot-password")).post(body).build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = JSONObject(if (text.isBlank()) "{}" else text)
            if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "İstek başarısız"))
            obj.optString("message") to obj.optString("supportEmail")
        }
    }

    suspend fun today(): Pair<String, List<TodayRow>> = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url(url("/api/attendance/today"))).get().build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = JSONObject(if (text.isBlank()) "{}" else text)
            if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "Liste alınamadı"))
            val rows = obj.getJSONArray("rows")
            val list = buildList {
                for (i in 0 until rows.length()) {
                    val r = rows.getJSONObject(i)
                    val user = r.getJSONObject("user")
                    add(
                        TodayRow(
                            fullName = user.getString("fullName"),
                            checkIn = r.optJSONObject("checkIn")?.optString("hm"),
                            checkOut = r.optJSONObject("checkOut")?.optString("hm"),
                            status = r.getString("status"),
                        )
                    )
                }
            }
            obj.getString("workDate") to list
        }
    }

    suspend fun punch(type: String, latitude: Double, longitude: Double, qrToken: String) =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("type", type)
                .put("latitude", latitude)
                .put("longitude", longitude)
                .put("qrToken", qrToken)
                .toString()
                .toRequestBody(json)
            val req = authed(Request.Builder().url(url("/api/attendance/punch"))).post(body).build()
            client.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                val obj = if (text.isBlank()) JSONObject() else JSONObject(text)
                if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "İşlem başarısız"))
            }
        }

    companion object {
        fun extractQrToken(raw: String): String {
            return try {
                JSONObject(raw).getString("token")
            } catch (_: Exception) {
                raw.trim()
            }
        }
    }
}
