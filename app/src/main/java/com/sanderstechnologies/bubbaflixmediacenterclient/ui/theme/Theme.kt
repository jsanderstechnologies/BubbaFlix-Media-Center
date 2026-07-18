package com.sanderstechnologies.bubbaflixmediacenterclient.ui.theme

import androidx.compose.runtime.Composable
import androidx.tv.material3.ColorScheme
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import androidx.tv.material3.lightColorScheme

private val DarkColorScheme = darkColorScheme(
    primary = RedPrimary,
    onPrimary = OnBackgroundDark,
    primaryContainer = RedDark,
    onPrimaryContainer = OnBackgroundDark,
    secondary = RedPrimary,
    onSecondary = OnBackgroundDark,
    background = BackgroundDark,
    onBackground = OnBackgroundDark,
    surface = SurfaceDark,
    onSurface = OnSurfaceDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = OnSurfaceVariantDark,
    error = RedPrimary,
    onError = OnBackgroundDark
)

@Composable
fun BubbaFlixMediaCenterClientTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
