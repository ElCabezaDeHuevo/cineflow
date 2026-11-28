package com.cineflow.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable
internal fun ProjectTracking(model: CineFlowModel) {
    BackHandler { model.closeProject() }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var message by rememberSaveable { mutableStateOf("") }
    var editing by rememberSaveable { mutableStateOf(false) }
    val project = model.tracking

    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 16.dp, top = 12.dp, bottom = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = model::closeProject) { Text("<  Proyectos") }
            TextButton(onClick = model::refresh, enabled = !model.busy) { Text("? Actualizar") }
        }
        if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.primary)
        if (model.error != null) ErrorCard(model.error!!, Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        if (project == null) return@Column

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(22.dp)) {
                    Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("SEGUIMIENTO DE PRODUCCI�N", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        Text(project.getString("name"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text("${project.getString("type")} � ${project.getString("stage")}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = { editing = true }) { Text("Editar informaci�n del proyecto") }
                    }
                }
            }
            item {
                TabRow(selectedTabIndex = tab) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Resumen y tareas") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Chat") })
                }
            }
            if (tab == 0) {
                val description = project.optString("description").takeUnless { it.isBlank() || it == "null" }
                description?.let { item { DetailCard("Descripci�n", it) } }
                item { DetailCard("Fecha de entrega", project.optString("delivery_date").takeUnless { it.isBlank() || it == "null" } ?: "Sin fecha registrada") }
                item { Text("Tareas", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
                val tasks = project.rows("tasks")
                if (tasks.isEmpty()) item { EmptyState("Sin tareas registradas", "Cuando se agreguen tareas a este proyecto, podr�s consultarlas aqu�.", "V") }
                items(tasks, key = { "task-${it.getString("id")}" }) { task ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(task.getString("title"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text("${task.optString("stage")} � ${task.optString("status")}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (!task.isNull("due_date")) Text("Vence: ${task.getString("due_date")}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                item { Text("Actividad", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
                val activity = project.rows("activity")
                if (activity.isEmpty()) item { Text("Todav�a no hay actividad.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                items(activity, key = { "activity-${it.getString("id")}" }) { event ->
                    Text("  ${event.optString("message")}", modifier = Modifier.padding(vertical = 4.dp))
                }
            } else {
                val messages = project.rows("messages")
                item { Text("Conversaci�n del proyecto", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
                if (messages.isEmpty()) item { EmptyState("Sin mensajes todav�a", "Escribe el primer mensaje para coordinarte con el equipo.", "?") }
                items(messages, key = { it.getString("id") }) { row ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
                        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(row.optString("author"), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                            Text(row.optString("body"))
                        }
                    }
                }
            }
        }

        if (tab == 1) {
            Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = message,
                        onValueChange = { if (it.length <= 5000) message = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Escribe un mensaje") },
                        maxLines = 4,
                        shape = RoundedCornerShape(14.dp),
                    )
                    Button(enabled = !model.busy && message.isNotBlank(), onClick = {
                        val sent = message
                        model.sendMessage(sent) { if (message == sent) message = "" }
                    }, modifier = Modifier.fillMaxWidth()) { Text("Enviar mensaje") }
                }
            }
        }
    }

    if (editing) {
        var name by rememberSaveable { mutableStateOf(project.getString("name")) }
        var description by rememberSaveable { mutableStateOf(project.optString("description").takeUnless { it == "null" } ?: "") }
        AlertDialog(
            onDismissRequest = { if (!model.busy) editing = false },
            title = { Text("Editar proyecto") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("Nombre") }, singleLine = true)
                    OutlinedTextField(description, { description = it }, label = { Text("Descripci�n") }, maxLines = 4)
                    model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            },
            confirmButton = { Button(enabled = name.isNotBlank() && !model.busy, onClick = {
                model.openProjectId?.let { model.saveProject(it, name, description) { editing = false } }
            }) { Text("Guardar cambios") } },
            dismissButton = { TextButton(enabled = !model.busy, onClick = { editing = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun DetailCard(title: String, body: String) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Text(body)
        }
    }
}

private fun JSONObject.rows(key: String): List<JSONObject> {
    val array = optJSONArray(key) ?: return emptyList()
    return List(array.length()) { array.getJSONObject(it) }
}

