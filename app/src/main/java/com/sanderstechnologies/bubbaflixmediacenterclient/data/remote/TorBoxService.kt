package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote

import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxResponse
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxTorrent
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxTorrentInfo
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TorBoxUsenet
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface TorBoxService {
    @GET("torrents/mylist")
    suspend fun getMyTorrents(): TorBoxResponse<List<TorBoxTorrent>>

    @GET("torrents/torrentinfo")
    suspend fun getTorrentInfo(
        @Query("hash") hash: String
    ): TorBoxResponse<TorBoxTorrentInfo>

    @GET("usenet/mylist")
    suspend fun getMyUsenet(): TorBoxResponse<List<TorBoxUsenet>>

    @POST("torrents/createtorrent")
    suspend fun createTorrent(
        @Query("magnet") magnet: String,
        @Query("seed") seed: Int = 1,
        @Query("allow_zip") allowZip: Boolean = true
    ): TorBoxResponse<Any>

    @GET("torrents/checkcached")
    suspend fun checkCached(
        @Query("hash") hash: String,
        @Query("format") format: String = "object"
    ): TorBoxResponse<Any>
}
