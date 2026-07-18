package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote

import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.LoginRequest
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.LoginResponse
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.BubbaUser
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface BubbaService {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/auth/me")
    suspend fun getMe(): BubbaUser
}
