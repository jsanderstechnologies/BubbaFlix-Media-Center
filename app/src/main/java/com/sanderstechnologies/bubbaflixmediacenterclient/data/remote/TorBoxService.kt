package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote

import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxResponse
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxTorrent
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxTorrentInfo
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxUsenet
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface TorBoxService {
    @GET("api/torbox/torrents")
    suspend fun getMyTorrents(): TorBoxResponse<List<TorBoxTorrent>>

    @GET("api/torbox/usenet/list")
    suspend fun getMyUsenet(): TorBoxResponse<List<TorBoxUsenet>>

    // Note: getTorrentInfo might not be proxied in the same way or might need direct access
    // For now, focusing on what's in the blueprint and server.ts
}
