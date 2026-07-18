package com.sanderstechnologies.bubbaflixmediacenterclient

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.NetworkModule
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard.DashboardScreen
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard.DashboardViewModel
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard.DashboardViewModelFactory
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.player.PlayerScreen
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.player.PlayerViewModel
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.player.PlayerViewModelFactory
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.theme.BubbaFlixMediaCenterClientTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        // Note: In a real app, these would come from a secure source or local.properties
        val tmdbApiKey = "YOUR_TMDB_API_KEY" 
        val torBoxToken = "YOUR_TORBOX_TOKEN"
        
        val tmdbService = NetworkModule.createTmdbService(tmdbApiKey)
        val torBoxService = NetworkModule.createTorBoxService(torBoxToken)
        val torBoxSearchService = NetworkModule.createTorBoxSearchService(torBoxToken)
        
        setContent {
            BubbaFlixMediaCenterClientTheme {
                var currentMovieQuery by remember { mutableStateOf<String?>(null) }
                
                if (currentMovieQuery == null) {
                    val dashboardViewModel: DashboardViewModel = viewModel(
                        factory = DashboardViewModelFactory(tmdbService)
                    )
                    DashboardScreen(
                        viewModel = dashboardViewModel,
                        onMovieClick = { movie ->
                            currentMovieQuery = movie.title ?: movie.name
                        }
                    )
                } else {
                    val playerViewModel: PlayerViewModel = viewModel(
                        factory = PlayerViewModelFactory(torBoxService, torBoxSearchService, torBoxToken)
                    )
                    
                    LaunchedEffect(currentMovieQuery) {
                        currentMovieQuery?.let { playerViewModel.searchAndPlay(it) }
                    }
                    
                    PlayerScreen(
                        viewModel = playerViewModel,
                        onBack = { currentMovieQuery = null }
                    )
                }
            }
        }
    }
}
