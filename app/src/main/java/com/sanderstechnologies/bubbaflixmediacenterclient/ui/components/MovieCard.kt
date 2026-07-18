package com.sanderstechnologies.bubbaflixmediacenterclient.ui.components

import androidx.compose.foundation.layout.*
import androidx.tv.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TmdbMovie

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MovieCard(
    movie: TmdbMovie,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        modifier = modifier
            .width(150.dp)
            .aspectRatio(2/3f),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
            )
        ),
        scale = CardDefaults.scale(focusedScale = 1.1f)
    ) {
        AsyncImage(
            model = "https://image.tmdb.org/t/p/w500${movie.posterPath}",
            contentDescription = movie.title ?: movie.name,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
    }
}
