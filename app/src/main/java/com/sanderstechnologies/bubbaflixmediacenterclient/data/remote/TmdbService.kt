package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote

import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TmdbMovie
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.TmdbResponse
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface TmdbService {
    @GET("trending/{media_type}/{time_window}")
    suspend fun getTrending(
        @Path("media_type") mediaType: String = "movie",
        @Path("time_window") timeWindow: String = "week",
        @Query("language") language: String? = null
    ): TmdbResponse<TmdbMovie>

    @GET("search/multi")
    suspend fun searchMulti(
        @Query("query") query: String,
        @Query("language") language: String? = null,
        @Query("page") page: Int = 1
    ): TmdbResponse<TmdbMovie>

    @GET("movie/{movie_id}")
    suspend fun getMovieDetails(
        @Path("movie_id") movieId: Int,
        @Query("language") language: String? = null,
        @Query("append_to_response") appendToResponse: String? = null
    ): TmdbMovie
}
