package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class TorBoxResponse<T>(
    val success: Boolean,
    val detail: String?,
    val data: T?
)

@JsonClass(generateAdapter = true)
data class TorBoxTorrent(
    val id: Int,
    val name: String,
    val hash: String,
    val progress: Double,
    val size: Long,
    @Json(name = "download_speed") val downloadSpeed: Long,
    @Json(name = "upload_speed") val uploadSpeed: Long,
    val status: String,
    @Json(name = "download_finished") val downloadFinished: Boolean
)

@JsonClass(generateAdapter = true)
data class TorBoxUsenet(
    val id: Int,
    val name: String,
    val progress: Double,
    val size: Long,
    val status: String
)

@JsonClass(generateAdapter = true)
data class TorBoxFile(
    val id: Int,
    val name: String,
    val size: Long,
    val type: String?,
    @Json(name = "mime_type") val mimeType: String?
)

@JsonClass(generateAdapter = true)
data class TorBoxTorrentInfo(
    val id: Int,
    val name: String,
    val files: List<TorBoxFile>
)

@JsonClass(generateAdapter = true)
data class TorBoxSearchResult(
    val id: Int,
    val name: String,
    val hash: String,
    val size: Long,
    @Json(name = "seeders_count") val seeders: Int?,
    @Json(name = "cached") val isCached: Boolean
)
