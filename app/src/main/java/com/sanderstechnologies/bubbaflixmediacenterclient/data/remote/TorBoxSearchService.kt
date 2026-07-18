package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote

import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxResponse
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxSearchResult
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface TorBoxSearchService {
    @GET("torrents/search/{query}")
    suspend fun searchTorrents(
        @Path("query") query: String,
        @Query("cached_only") cachedOnly: Boolean = true
    ): TorBoxResponse<List<TorBoxSearchResult>>
}
