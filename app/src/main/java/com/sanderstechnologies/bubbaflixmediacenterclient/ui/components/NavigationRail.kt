package com.sanderstechnologies.bubbaflixmediacenterclient.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.tv.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

enum class NavItem(val title: String, val icon: ImageVector) {
    Home("Home", Icons.Rounded.Home),
    LiveTv("Live TV", Icons.Rounded.LiveTv),
    Movies("Movies", Icons.Rounded.Movie),
    Series("Series", Icons.Rounded.Tv),
    Settings("Settings", Icons.Rounded.Settings)
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun BubbaNavigationDrawer(
    selectedItem: NavItem,
    onItemSelected: (NavItem) -> Unit,
    content: @Composable () -> Unit
) {
    NavigationDrawer(
        drawerContent = { drawerValue ->
            Column(
                modifier = Modifier
                    .fillMaxHeight()
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                NavItem.entries.forEach { item ->
                    NavigationDrawerItem(
                        selected = selectedItem == item,
                        onClick = { onItemSelected(item) },
                        leadingContent = {
                            Icon(
                                imageVector = item.icon,
                                contentDescription = item.title
                            )
                        }
                    ) {
                        Text(
                            text = item.title,
                            modifier = Modifier.padding(horizontal = 12.dp)
                        )
                    }
                }
            }
        },
        content = content
    )
}
