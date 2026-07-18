package com.sanderstechnologies.bubbaflixmediacenterclient.ui.player

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.tv.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

@OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    viewModel: PlayerViewModel,
    onBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    BackHandler(onBack = onBack)

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        when (val state = uiState) {
            is PlayerUiState.Loading -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
            is PlayerUiState.StreamSelection -> {
                StreamSelectionList(state.streams) { viewModel.onStreamSelected(it) }
            }
            is PlayerUiState.FileSelection -> {
                FileSelectionList(state.files) { viewModel.onFileSelected(state.torrentId, it) }
            }
            is PlayerUiState.Playing -> {
                VideoPlayer(state.url)
            }
            is PlayerUiState.Error -> {
                Text(
                    text = state.message,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.Center)
                )
            }
            else -> {}
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun StreamSelectionList(streams: List<com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxSearchResult>, onSelected: (com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxSearchResult) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(48.dp)
    ) {
        Text("Select Stream", style = MaterialTheme.typography.displaySmall, color = Color.White)
        Spacer(modifier = Modifier.height(24.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(streams) { stream ->
                Surface(
                    onClick = { onSelected(stream) }
                ) {
                    Text(
                        text = "${stream.name} - ${if(stream.isCached) "CACHED" else "UNCERTAIN"}",
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun FileSelectionList(files: List<com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxFile>, onSelected: (Int) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.systemBars)
            .padding(48.dp)
    ) {
        Text("Select File", style = MaterialTheme.typography.displaySmall, color = Color.White)
        Spacer(modifier = Modifier.height(24.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(files) { file ->
                Surface(
                    onClick = { onSelected(file.id) }
                ) {
                    Text(text = file.name, modifier = Modifier.padding(16.dp))
                }
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
fun VideoPlayer(url: String) {
    val context = LocalContext.current
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            exoPlayer.release()
        }
    }

    AndroidView(
        factory = {
            PlayerView(context).apply {
                player = exoPlayer
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                useController = true // Standard Media3 controller for now
            }
        },
        modifier = Modifier.fillMaxSize()
    )
}
