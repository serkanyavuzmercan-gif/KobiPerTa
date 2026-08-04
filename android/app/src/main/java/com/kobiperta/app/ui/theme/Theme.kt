package com.kobiperta.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val colors = lightColorScheme(
    primary = Color(0xFF0284C7),
    secondary = Color(0xFF0F172A),
    background = Color(0xFFF8FAFC),
    surface = Color(0xFFFFFFFF),
)

@Composable
fun KobiPerTaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, content = content)
}
