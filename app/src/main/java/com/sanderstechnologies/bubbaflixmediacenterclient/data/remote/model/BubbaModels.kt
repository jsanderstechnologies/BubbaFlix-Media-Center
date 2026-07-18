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
    val id: Int,
    val email: String,
    val name: String?
)
