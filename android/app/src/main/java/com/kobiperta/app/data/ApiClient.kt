package com.kobiperta.app.data

import com.kobiperta.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

data class AuthUser(val id: String, val email: String, val fullName: String, val role: String)

data class TodayRow(
    val fullName: String,
    val checkIn: String?,
    val checkOut: String?,
    val status: String,
)

class ApiClient {
    private val client = OkHttpClient()
    private val json = "application/json; charset=utf-8".toMediaType()
    var token: String? = null

    private fun url(path: String) = BuildConfig.API_BASE_URL + path

    suspend fun login(email: String, password: String): AuthUser = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()
            .toRequestBody(json)
        val req = Request.Builder().url(url("/api/auth/login")).post(body).build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = JSONObject(text)
            if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "Giriş başarısız"))
            token = obj.getString("token")
            val u = obj.getJSONObject("user")
            AuthUser(u.getString("id"), u.getString("email"), u.getString("fullName"), u.getString("role"))
        }
    }

    suspend fun today(): Pair<String, List<TodayRow>> = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(url("/api/attendance/today"))
            .header("Authorization", "Bearer ${token.orEmpty()}")
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            val obj = JSONObject(text)
            if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "Liste alınamadı"))
            val rows = obj.getJSONArray("rows")
            val list = buildList {
                for (i in 0 until rows.length()) {
                    val r = rows.getJSONObject(i)
                    val user = r.getJSONObject("user")
                    val cin = r.optJSONObject("checkIn")?.optString("hm")
                    val cout = r.optJSONObject("checkOut")?.optString("hm")
                    add(
                        TodayRow(
                            fullName = user.getString("fullName"),
                            checkIn = cin,
                            checkOut = cout,
                            status = r.getString("status"),
                        )
                    )
                }
            }
            obj.getString("workDate") to list
        }
    }

    suspend fun punch(type: String, latitude: Double, longitude: Double, qrToken: String): Unit =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("type", type)
                .put("latitude", latitude)
                .put("longitude", longitude)
                .put("qrToken", qrToken)
                .toString()
                .toRequestBody(json)
            val req = Request.Builder()
                .url(url("/api/attendance/punch"))
                .header("Authorization", "Bearer ${token.orEmpty()}")
                .post(body)
                .build()
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
