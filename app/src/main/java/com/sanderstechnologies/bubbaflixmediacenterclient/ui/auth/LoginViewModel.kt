package com.sanderstechnologies.bubbaflixmediacenterclient.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.NetworkModule
import com.sanderstechnologies.bubbaflixmediacenterclient.data.remote.model.LoginRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class LoginUiState {
    object Idle : LoginUiState()
    object Loading : LoginUiState()
    data class Success(val token: String, val serverAddress: String) : LoginUiState()
    data class Error(val message: String) : LoginUiState()
}

class LoginViewModel : ViewModel() {
    private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
    val uiState: StateFlow<LoginUiState> = _uiState

    fun login(serverAddress: String, email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = LoginUiState.Loading
            try {
                val service = NetworkModule.createBubbaService(serverAddress)
                val response = service.login(LoginRequest(email, password))
                _uiState.value = LoginUiState.Success(response.token, serverAddress)
            } catch (e: java.io.IOException) {
                _uiState.value = LoginUiState.Error("Network error: Cannot reach server")
            } catch (e: retrofit2.HttpException) {
                val message = when(e.code()) {
                    401 -> "Invalid email or password"
                    404 -> "Authentication endpoint not found"
                    else -> "Server error: ${e.code()}"
                }
                _uiState.value = LoginUiState.Error(message)
            } catch (e: Exception) {
                _uiState.value = LoginUiState.Error(e.message ?: "Authentication failed")
            }
        }
    }
}
