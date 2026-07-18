package com.sanderstechnologies.bubbaflixmediacenterclient.ui.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.tv.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
import coil.compose.AsyncImage
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TmdbMovie
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.components.BubbaNavigationDrawer
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.components.MovieCard
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.components.NavItem

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onMovieClick: (TmdbMovie) -> Unit
) {
    var selectedNavItem by remember { mutableStateOf(NavItem.Home) }
    val trendingMovies by viewModel.trendingMovies.collectAsState()
    val popularMovies by viewModel.popularMovies.collectAsState()

    BubbaNavigationDrawer(
        selectedItem = selectedNavItem,
        onItemSelected = { selectedNavItem = it }
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = WindowInsets.systemBars.asPaddingValues()
        ) {
            item {
                SpotlightSection(trendingMovies.firstOrNull())
            }

            item {
                MovieCarousel(
                    title = "Trending This Week",
                    movies = trendingMovies,
                    onMovieClick = onMovieClick
                )
            }

            item {
                MovieCarousel(
                    title = "Popular Blockbusters",
                    movies = popularMovies,
                    onMovieClick = onMovieClick
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SpotlightSection(movie: TmdbMovie?) {
    if (movie == null) return

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(400.dp)
    ) {
        AsyncImage(
            model = "https://image.tmdb.org/t/p/original${movie.backdropPath}",
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            alpha = 0.6f
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(48.dp)
                .fillMaxWidth(0.5f)
        ) {
            Text(
                text = (movie.title ?: movie.name) ?: "",
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = movie.overview ?: "",
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 3,
                color = Color.White.copy(alpha = 0.8f)
            )
            Spacer(modifier = Modifier.height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Button(onClick = { /* Play */ }) {
                    Icon(imageVector = Icons.Rounded.PlayArrow, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Play")
                }
                OutlinedButton(onClick = { /* Details */ }) {
                    Text("Details")
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MovieCarousel(title: String, movies: List<TmdbMovie>, onMovieClick: (TmdbMovie) -> Unit) {
    Column(modifier = Modifier.padding(top = 24.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.padding(start = 48.dp, bottom = 12.dp),
            color = MaterialTheme.colorScheme.onBackground
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(movies) { movie ->
                MovieCard(movie = movie, onClick = { onMovieClick(movie) })
            }
        }
    }
}
