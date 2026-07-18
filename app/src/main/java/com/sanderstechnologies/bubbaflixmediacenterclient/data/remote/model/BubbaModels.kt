package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val email: String,
    val password: String
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val user: BubbaUser,
    val token: String
)

@JsonClass(generateAdapter = true)
data class BubbaUser(
    val uid: String,
    val email: String,
    val username: String?,
    val role: String?,
    val status: String?
)
