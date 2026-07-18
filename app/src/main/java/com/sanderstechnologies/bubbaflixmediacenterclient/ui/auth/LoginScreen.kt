package com.sanderstechnologies.bubbaflixmediacenterclient.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.tv.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.theme.RedPrimary
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.theme.BackgroundDark
import com.sanderstechnologies.bubbaflixmediacenterclient.ui.theme.SurfaceDark

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (String, String) -> Unit,
    viewModel: LoginViewModel = viewModel()
) {
    var serverAddress by remember { mutableStateOf("https://bubbaflix.sanders-technologies.net") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    LaunchedEffect(uiState) {
        if (uiState is LoginUiState.Success) {
            val success = uiState as LoginUiState.Success
            onLoginSuccess(success.serverAddress, success.token)
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        colors = SurfaceDefaults.colors(
            containerColor = BackgroundDark,
            contentColor = Color.White
        )
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(
                modifier = Modifier
                    .width(500.dp)
                    .background(SurfaceDark.copy(alpha = 0.5f), MaterialTheme.shapes.medium)
                    .padding(48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp)
            ) {
                Text(
                    text = "BUBBAFLIX",
                    style = MaterialTheme.typography.displayMedium,
                    color = RedPrimary,
                    fontWeight = FontWeight.Bold
                )
                
                Text(
                    text = "Media Center Login",
                    style = MaterialTheme.typography.headlineSmall,
                    color = Color.White
                )

                Spacer(modifier = Modifier.height(16.dp))

                if (uiState is LoginUiState.Error) {
                    Text(
                        text = (uiState as LoginUiState.Error).message,
                        color = RedPrimary,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }

                LoginTextField(
                    value = serverAddress,
                    onValueChange = { serverAddress = it },
                    label = "Server Address",
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Next,
                    onImeAction = { focusManager.moveFocus(FocusDirection.Down) },
                    enabled = uiState !is LoginUiState.Loading
                )

                LoginTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = "Email / Username",
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next,
                    onImeAction = { focusManager.moveFocus(FocusDirection.Down) },
                    enabled = uiState !is LoginUiState.Loading
                )

                LoginTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = "Password",
                    keyboardType = KeyboardType.Password,
                    isPassword = true,
                    imeAction = ImeAction.Done,
                    onImeAction = { 
                        focusManager.clearFocus()
                        viewModel.login(serverAddress, email, password)
                    },
                    enabled = uiState !is LoginUiState.Loading
                )

                Spacer(modifier = Modifier.height(24.dp))

                Button(
                    onClick = { 
                        focusManager.clearFocus()
                        viewModel.login(serverAddress, email, password) 
                    },
                    modifier = Modifier.fillMaxWidth().height(60.dp),
                    colors = ButtonDefaults.colors(
                        containerColor = RedPrimary,
                        contentColor = Color.White
                    ),
                    scale = ButtonDefaults.scale(focusedScale = 1.05f),
                    enabled = uiState !is LoginUiState.Loading
                ) {
                    if (uiState is LoginUiState.Loading) {
                        CircularProgressIndicator(
                            color = Color.White, 
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 3.dp
                        )
                    } else {
                        Text(
                            text = "Connect & Sign In",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun LoginTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    isPassword: Boolean = false,
    imeAction: ImeAction = ImeAction.Default,
    onImeAction: () -> Unit = {},
    enabled: Boolean = true
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(text = label, color = Color.Gray) },
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled,
        visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(onAny = { onImeAction() }),
        singleLine = true,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = RedPrimary,
            unfocusedBorderColor = Color.DarkGray,
            focusedLabelColor = RedPrimary,
            unfocusedLabelColor = Color.Gray,
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            cursorColor = RedPrimary,
            selectionColors = androidx.compose.foundation.text.selection.TextSelectionColors(
                handleColor = RedPrimary,
                backgroundColor = RedPrimary.copy(alpha = 0.4f)
            )
        )
    )
}
