package com.cineflow.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private val model by viewModels<CineFlowModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(
                primary = Color(0xFFD0BCFF),
                background = Color(0xFF141119),
                surface = Color(0xFF211C28),
            )) {
                Surface(Modifier.fillMaxSize()) { CineFlow(model) }
            }
        }
    }
}

@Composable
private fun CineFlow(model: CineFlowModel) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(model.signedIn, lifecycle) {
        if (model.signedIn) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                model.refresh()
                delay(8_000)
            }
        }
    }

    if (!model.signedIn) {
        Login(model.busy, model.error, model::signIn)
        return
    }
    var confirmation by remember { mutableStateOf<(() -> Unit)?>(null) }
    var confirmationText by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 20.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("CineFlow", style = MaterialTheme.typography.headlineMedium)
            TextButton(onClick = model::signOut) { Text("Cerrar sesión") }
        }
        if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        model.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp)) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
            if (model.inbox.isNotEmpty()) {
                item { Text("Solicitudes por revisar", style = MaterialTheme.typography.titleLarge) }
                items(model.inbox, key = { it.id }) { request ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(request.project, style = MaterialTheme.typography.titleMedium)
                            Text(if (request.kind == "join") "${request.person} solicita unirse" else "${request.person} solicita salir")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(enabled = !model.busy, onClick = {
                                    confirmationText = if (request.kind == "join") "¿Aprobar el ingreso?" else "¿Autorizar la salida del proyecto?"
                                    confirmation = { model.act(request.id, request.kind, "approve") }
                                }) { Text("Aprobar") }
                                TextButton(enabled = !model.busy, onClick = { model.act(request.id, request.kind, "reject") }) { Text("Rechazar") }
                            }
                        }
                    }
                }
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Proyectos", style = MaterialTheme.typography.titleLarge)
                    TextButton(enabled = !model.busy, onClick = model::refresh) { Text("Actualizar") }
                }
            }
            if (model.loaded && model.projects.isEmpty()) item { Text("Tu productora todavía no tiene proyectos disponibles.") }
            items(model.projects, key = { it.id }) { project ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("${project.type} · ${project.stage}", color = MaterialTheme.colorScheme.primary)
                        Text(project.name, style = MaterialTheme.typography.titleLarge)
                        when {
                            project.pending == "join" -> Text("Ingreso pendiente de aprobación")
                            project.pending == "leave" -> Text("Salida pendiente de aprobación")
                            project.role == "owner" -> Text("Eres propietario del proyecto")
                            project.role != null -> {
                                Text("Ya eres parte del proyecto")
                                OutlinedButton(enabled = !model.busy, onClick = {
                                    confirmationText = "¿Quieres solicitar salir de ${project.name}?"
                                    confirmation = { model.act(project.id, "leave", "request") }
                                }) { Text("Solicitar salida") }
                            }
                            else -> Button(enabled = !model.busy, onClick = { model.act(project.id, "join", "request") }) { Text("Solicitar unirme") }
                        }
                    }
                }
            }
        }
    }
    confirmation?.let { action ->
        AlertDialog(
            onDismissRequest = { confirmation = null },
            text = { Text(confirmationText) },
            confirmButton = { TextButton(onClick = { confirmation = null; action() }) { Text("Confirmar") } },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun Login(busy: Boolean, error: String?, submit: (String, String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    LazyColumn(
        Modifier.fillMaxSize().safeDrawingPadding().imePadding(),
        verticalArrangement = Arrangement.Center,
        contentPadding = PaddingValues(24.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text("CineFlow", style = MaterialTheme.typography.displaySmall)
                Text("Inicia sesión con tu cuenta de CineFlow.")
                OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Contraseña") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(
                    onClick = { submit(email.trim(), password); password = "" },
                    enabled = !busy && email.isNotBlank() && password.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(if (busy) "Iniciando sesión…" else "Entrar") }
            }
        }
    }
}
