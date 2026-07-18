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
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
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
        Column(modifier = Modifier.fillMaxSize()) {
            TopBar()
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = WindowInsets.systemBars.asPaddingValues()
            ) {
                item {
                    val movies = trendingMovies.take(2)
                    if (movies.isNotEmpty()) {
                        SpotlightSection(movies)
                    }
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
}

@Composable
fun TopBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 24.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "BUBBAFLIX",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.width(32.dp))
            Text(
                text = "Home",
                style = MaterialTheme.typography.titleMedium,
                color = Color.White
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Icon(
                imageVector = Icons.Rounded.Search,
                contentDescription = "Search",
                tint = Color.White,
                modifier = Modifier.size(28.dp)
            )
            Icon(
                imageVector = Icons.Rounded.AccountCircle,
                contentDescription = "Profile",
                tint = Color.White,
                modifier = Modifier.size(28.dp)
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SpotlightSection(movies: List<TmdbMovie>) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        movies.forEach { movie ->
            SpotlightCard(movie, modifier = Modifier.weight(1f))
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SpotlightCard(movie: TmdbMovie, modifier: Modifier = Modifier) {
    Card(
        onClick = { /* Navigate to details */ },
        modifier = modifier.height(260.dp),
        scale = CardDefaults.scale(focusedScale = 1.05f)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            AsyncImage(
                model = "https://image.tmdb.org/t/p/w780${movie.backdropPath}",
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                alpha = 0.6f
            )
            
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(24.dp)
            ) {
                Text(
                    text = (movie.title ?: movie.name) ?: "",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "SPOTLIGHT",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "★ ${movie.voteAverage}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xFFFFD700)
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { /* Play */ }, modifier = Modifier.height(36.dp)) {
                        Text("Play", style = MaterialTheme.typography.labelMedium)
                    }
                    OutlinedButton(onClick = { /* Details */ }, modifier = Modifier.height(36.dp)) {
                        Text("Details", style = MaterialTheme.typography.labelMedium)
                    }
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
