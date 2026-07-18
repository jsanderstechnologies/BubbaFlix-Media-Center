package com.sanderstechnologies.bubbaflixmediacenterclient.data.remote

import com.sanderstechnologies.bubbaflixmediacenterclient.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

object NetworkModule {
    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private fun createAuthInterceptor(token: String): Interceptor {
        return Interceptor { chain ->
            val request = chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
            chain.proceed(request)
        }
    }

    fun createTmdbService(apiKey: String): TmdbService {
        val client = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .addInterceptor { chain ->
                val original = chain.request()
                val url = original.url.newBuilder()
                    .addQueryParameter("api_key", apiKey)
                    .build()
                chain.proceed(original.newBuilder().url(url).build())
            }
            .build()

        return Retrofit.Builder()
            .baseUrl("https://api.themoviedb.org/3/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(TmdbService::class.java)
    }

    fun createTorBoxService(apiToken: String): TorBoxService {
        val client = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .addInterceptor(createAuthInterceptor(apiToken))
            .build()

        return Retrofit.Builder()
            .baseUrl("https://api.torbox.app/v1/api/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(TorBoxService::class.java)
    }

    fun createTorBoxSearchService(apiToken: String): TorBoxSearchService {
        val client = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .addInterceptor(createAuthInterceptor(apiToken))
            .build()

        return Retrofit.Builder()
            .baseUrl("https://search-api.torbox.app/")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(TorBoxSearchService::class.java)
    }
}
