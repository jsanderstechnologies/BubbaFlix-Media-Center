package com.sanderstechnologies.bubbaflixmediacenterclient.ui.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.TorBoxSearchService
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.TorBoxService
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxSearchResult
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxFile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class PlayerUiState {
    object Idle : PlayerUiState()
    object Loading : PlayerUiState()
    data class StreamSelection(val streams: List<TorBoxSearchResult>) : PlayerUiState()
    data class FileSelection(val torrentId: Int, val files: List<TorBoxFile>) : PlayerUiState()
    data class Playing(val url: String) : PlayerUiState()
    data class Error(val message: String) : PlayerUiState()
}

class PlayerViewModel(
    private val torBoxService: TorBoxService,
    private val torBoxSearchService: TorBoxSearchService,
    private val apiToken: String
) : ViewModel() {

    private val _uiState = MutableStateFlow<PlayerUiState>(PlayerUiState.Idle)
    val uiState: StateFlow<PlayerUiState> = _uiState

    fun searchAndPlay(query: String) {
        viewModelScope.launch {
            _uiState.value = PlayerUiState.Loading
            try {
                val response = torBoxSearchService.searchTorrents(query)
                if (response.success && !response.data.isNullOrEmpty()) {
                    _uiState.value = PlayerUiState.StreamSelection(response.data)
                } else {
                    _uiState.value = PlayerUiState.Error("No streams found for: $query")
                }
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Search failed: ${e.message}")
            }
        }
    }

    fun onStreamSelected(stream: TorBoxSearchResult) {
        viewModelScope.launch {
            _uiState.value = PlayerUiState.Loading
            try {
                val response = torBoxService.getTorrentInfo(stream.hash)
                if (response.success && response.data != null) {
                    val files = response.data.files.filter { 
                        it.name.endsWith(".mp4") || it.name.endsWith(".mkv") || it.name.endsWith(".avi")
                    }
                    if (files.isNotEmpty()) {
                        _uiState.value = PlayerUiState.FileSelection(response.data.id, files)
                    } else {
                        _uiState.value = PlayerUiState.Error("No playable files found in torrent")
                    }
                } else {
                    _uiState.value = PlayerUiState.Error("Failed to get torrent info")
                }
            } catch (e: Exception) {
                _uiState.value = PlayerUiState.Error("Error: ${e.message}")
            }
        }
    }

    fun onFileSelected(torrentId: Int, fileId: Int) {
        // Constructing the direct playback URL via permalink as it's the most reliable fallback
        val url = "https://api.torbox.app/v1/api/torrents/requestdl?token=$apiToken&torrent_id=$torrentId&file_id=$fileId&redirect=true"
        _uiState.value = PlayerUiState.Playing(url)
    }
}
