package com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.TmdbService

class DashboardViewModelFactory(private val tmdbService: TmdbService) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(DashboardViewModel::class.java)) {
            @Suppress("UNCHECKED_CAST")
            return DashboardViewModel(tmdbService) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
