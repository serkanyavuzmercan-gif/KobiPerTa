package com.kobiperta.app.data

import android.content.Context
import com.kobiperta.app.BuildConfig

data class AuthUser(
    val id: String,
    val email: String,
    val fullName: String,
    val role: String,
)

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("kobiperta_session", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString("token", null)
        set(value) {
            prefs.edit().putString("token", value).apply()
        }

    var email: String?
        get() = prefs.getString("email", null)
        set(value) {
            prefs.edit().putString("email", value).apply()
        }

    var fullName: String?
        get() = prefs.getString("fullName", null)
        set(value) {
            prefs.edit().putString("fullName", value).apply()
        }

    var userId: String?
        get() = prefs.getString("userId", null)
        set(value) {
            prefs.edit().putString("userId", value).apply()
        }

    var role: String?
        get() = prefs.getString("role", null)
        set(value) {
            prefs.edit().putString("role", value).apply()
        }

    var apiBaseUrl: String
        get() = prefs.getString("apiBaseUrl", null) ?: BuildConfig.API_BASE_URL
        set(value) {
            prefs.edit().putString("apiBaseUrl", value.trim().trimEnd('/')).apply()
        }

    fun saveLogin(token: String, user: AuthUser) {
        this.token = token
        userId = user.id
        email = user.email
        fullName = user.fullName
        role = user.role
    }

    fun clear() {
        prefs.edit()
            .remove("token")
            .remove("userId")
            .remove("email")
            .remove("fullName")
            .remove("role")
            .apply()
    }

    fun currentUser(): AuthUser? {
        val id = userId ?: return null
        val mail = email ?: return null
        val name = fullName ?: return null
        val r = role ?: return null
        if (token.isNullOrBlank()) return null
        return AuthUser(id, mail, name, r)
    }
}
