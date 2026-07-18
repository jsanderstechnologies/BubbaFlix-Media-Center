package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote

import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxResponse
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxSearchResult
import retrofit2.http.GET
import retrofit2.http.Query

interface TorBoxSearchService {
    @GET("api/torbox/torrents/search")
    suspend fun searchTorrents(
        @Query("q") query: String
    ): TorBoxResponse<List<TorBoxSearchResult>>
}
