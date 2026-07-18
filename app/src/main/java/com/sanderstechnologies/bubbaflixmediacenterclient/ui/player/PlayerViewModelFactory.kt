package com.sanderstechnologies.bubbaflixmediacenterclient.ui.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.TorBoxSearchService
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.TorBoxService

class PlayerViewModelFactory(
    private val torBoxService: TorBoxService,
    private val torBoxSearchService: TorBoxSearchService,
    private val apiToken: String
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(PlayerViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return PlayerViewModel(torBoxService, torBoxSearchService, apiToken) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
