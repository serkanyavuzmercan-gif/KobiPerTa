package com.kobiperta.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
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

    /**
     * Runs a request and turns transport failures into messages a user can act on,
     * instead of raw socket errors.
     */
    private fun <T> call(request: Request, fallbackError: String, read: (Response, JSONObject) -> T): T {
        val response = try {
            client.newCall(request).execute()
        } catch (_: UnknownHostException) {
            throw IllegalStateException(
                "Sunucuya ulaşılamadı. Sunucu adresi hatalı olabilir (${session.apiBaseUrl})."
            )
        } catch (_: ConnectException) {
            throw IllegalStateException(
                "Sunucuya bağlanılamadı. Sunucunun açık olduğundan ve aynı Wi-Fi ağında olduğunuzdan emin olun."
            )
        } catch (_: SocketTimeoutException) {
            throw IllegalStateException("Sunucu yanıt vermedi (zaman aşımı). İnternet bağlantınızı kontrol edin.")
        } catch (e: Exception) {
            throw IllegalStateException(
                "Bağlantı hatası: ${e.message ?: "internet bağlantınızı kontrol edin"}"
            )
        }

        return response.use { res ->
            val text = res.body?.string().orEmpty()
            val obj = try {
                JSONObject(if (text.isBlank()) "{}" else text)
            } catch (_: Exception) {
                JSONObject()
            }
            if (!res.isSuccessful && res.code >= 500) {
                throw IllegalStateException(
                    obj.optString("error").ifBlank { "Sunucu hatası (${res.code}). Lütfen yöneticinize bildirin." }
                )
            }
            if (!res.isSuccessful && obj.optString("error").isBlank()) {
                throw IllegalStateException("$fallbackError (kod ${res.code})")
            }
            read(res, obj)
        }
    }

    suspend fun login(email: String, password: String): AuthUser = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()
            .toRequestBody(json)
        val req = Request.Builder().url(url("/api/auth/login")).post(body).build()
        call(req, "Giriş başarısız") { res, obj ->
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
        call(req, "Oturum doğrulanamadı") { res, obj ->
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
        call(req, "İstek başarısız") { res, obj ->
            if (!res.isSuccessful) throw IllegalStateException(obj.optString("error", "İstek başarısız"))
            obj.optString("message") to obj.optString("supportEmail")
        }
    }

    suspend fun today(): Pair<String, List<TodayRow>> = withContext(Dispatchers.IO) {
        val req = authed(Request.Builder().url(url("/api/attendance/today"))).get().build()
        call(req, "Liste alınamadı") { res, obj ->
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

    suspend fun punch(
        type: String,
        latitude: Double,
        longitude: Double,
        mode: String = "gps",
        qrToken: String? = null,
    ) = withContext(Dispatchers.IO) {
        val bodyJson = JSONObject()
            .put("type", type)
            .put("latitude", latitude)
            .put("longitude", longitude)
            .put("mode", mode)
        if (!qrToken.isNullOrBlank()) bodyJson.put("qrToken", qrToken)
        val body = bodyJson.toString().toRequestBody(json)
        val req = authed(Request.Builder().url(url("/api/attendance/punch"))).post(body).build()
        call(req, "İşlem kaydedilemedi") { res, obj ->
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
