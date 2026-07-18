package com.sanderstechnologies.bubbaflixmediacenterclient

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.NetworkModule
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TmdbMovie
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.auth.LoginScreen
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard.DashboardScreen
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard.DashboardViewModel
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard.DashboardViewModelFactory
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.details.MediaDetailsScreen
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.player.PlayerScreen
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.player.PlayerViewModel
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.player.PlayerViewModelFactory
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.theme.BubbaFlixMediaCenterClientTheme

sealed class Screen {
    object Login : Screen()
    object Dashboard : Screen()
    data class Details(val movie: TmdbMovie) : Screen()
    data class Player(val movieQuery: String) : Screen()
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        
        // TMDB is static for now
        val tmdbApiKey = "YOUR_TMDB_API_KEY" 
        
        setContent {
            BubbaFlixMediaCenterClientTheme {
                var currentScreen by remember { mutableStateOf<Screen>(Screen.Login) }
                var serverAddress by remember { mutableStateOf("") }
                var authToken by remember { mutableStateOf("") }
                
                // Services are recreated when address or token changes
                val tmdbService = remember { NetworkModule.createTmdbService(tmdbApiKey) }
                
                val torBoxService = remember(serverAddress, authToken) { 
                    if (serverAddress.isNotEmpty()) NetworkModule.createTorBoxService(serverAddress, authToken) 
                    else null
                }
                
                val torBoxSearchService = remember(serverAddress, authToken) { 
                    if (serverAddress.isNotEmpty()) NetworkModule.createTorBoxSearchService(serverAddress, authToken) 
                    else null
                }
                
                when (val screen = currentScreen) {
                    is Screen.Login -> {
                        LoginScreen(onLoginSuccess = { address, token -> 
                            serverAddress = address
                            authToken = token
                            currentScreen = Screen.Dashboard 
                        })
                    }
                    is Screen.Dashboard -> {
                        val dashboardViewModel: DashboardViewModel = viewModel(
                            factory = DashboardViewModelFactory(tmdbService)
                        )
                        DashboardScreen(
                            viewModel = dashboardViewModel,
                            onMovieClick = { movie ->
                                currentScreen = Screen.Details(movie)
                            }
                        )
                    }
                    is Screen.Details -> {
                        MediaDetailsScreen(
                            movie = screen.movie,
                            onPlayClick = { movie ->
                                currentScreen = Screen.Player(movie.title ?: movie.name ?: "")
                            },
                            onBack = { currentScreen = Screen.Dashboard }
                        )
                    }
                    is Screen.Player -> {
                        if (torBoxService != null && torBoxSearchService != null) {
                            val playerViewModel: PlayerViewModel = viewModel(
                                factory = PlayerViewModelFactory(torBoxService, torBoxSearchService, authToken)
                            )
                            
                            LaunchedEffect(screen.movieQuery) {
                                playerViewModel.searchAndPlay(screen.movieQuery)
                            }
                            
                            PlayerScreen(
                                viewModel = playerViewModel,
                                onBack = { currentScreen = Screen.Dashboard }
                            )
                        } else {
                            // Fallback if services aren't ready
                            currentScreen = Screen.Login
                        }
                    }
                }
            }
        }
    }
}
