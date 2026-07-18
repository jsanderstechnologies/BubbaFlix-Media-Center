package com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.TmdbService
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TmdbMovie
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class DashboardViewModel(private val tmdbService: TmdbService) : ViewModel() {

    private val _trendingMovies = MutableStateFlow<List<TmdbMovie>>(emptyList())
    val trendingMovies: StateFlow<List<TmdbMovie>> = _trendingMovies

    private val _popularMovies = MutableStateFlow<List<TmdbMovie>>(emptyList())
    val popularMovies: StateFlow<List<TmdbMovie>> = _popularMovies

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    init {
        fetchData()
    }

    private fun fetchData() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val trending = tmdbService.getTrending()
                _trendingMovies.value = trending.results

                val popular = tmdbService.searchMulti(query = "popular", page = 1)
                _popularMovies.value = popular.results
            } catch (e: Exception) {
                e.printStackTrace()
            } finally {
                _isLoading.value = false
            }
        }
    }
}
