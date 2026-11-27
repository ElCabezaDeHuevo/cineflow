package com.cineflow.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable
internal fun ProjectTracking(model: CineFlowModel) {
    BackHandler { model.closeProject() }
    var tab by remember { mutableIntStateOf(0) }
    var message by remember { mutableStateOf("") }
    val project = model.tracking

    Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(horizontal = 20.dp)) {
        TextButton(onClick = model::closeProject) { Text("Volver a proyectos") }
        if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        model.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (project == null) return@Column

        Text(project.getString("name"), style = MaterialTheme.typography.headlineSmall)
        Text("${project.getString("type")} · ${project.getString("stage")}")
        TabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Seguimiento") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Chat") })
        }

        if (tab == 0) {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
                item {
                    val description = project.optString("description").takeUnless { it.isBlank() || it == "null" }
                    description?.let { Text(it) }
                    Text("Entrega: ${project.optString("delivery_date")}")
                }
                item { Text("Tareas", style = MaterialTheme.typography.titleLarge) }
                val tasks = project.rows("tasks")
                if (tasks.isEmpty()) item { Text("Todavía no hay tareas.") }
                items(tasks, key = { "task-${it.getString("id")}" }) { task ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(task.getString("title"), style = MaterialTheme.typography.titleMedium)
                            Text("${task.optString("stage")} · ${task.optString("status")}")
                            if (!task.isNull("due_date")) Text("Vence: ${task.getString("due_date")}")
                        }
                    }
                }
                item { Text("Actividad", style = MaterialTheme.typography.titleLarge) }
                val activity = project.rows("activity")
                if (activity.isEmpty()) item { Text("Todavía no hay actividad.") }
                items(activity, key = { "activity-${it.getString("id")}" }) { event ->
                    Text(event.optString("message"))
                }
            }
        } else {
            val messages = project.rows("messages")
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                reverseLayout = true,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 12.dp),
            ) {
                if (messages.isEmpty()) item { Text("Todavía no hay mensajes.") }
                items(messages, key = { it.getString("id") }) { row ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Text(row.getString("author"), style = MaterialTheme.typography.labelLarge)
                            Text(row.getString("body"))
                        }
                    }
                }
            }
            OutlinedTextField(
                value = message,
                onValueChange = { if (it.length <= 5000) message = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Mensaje") },
                maxLines = 4,
            )
            Button(enabled = !model.busy && message.isNotBlank(), onClick = {
                val sent = message
                model.sendMessage(sent) { if (message == sent) message = "" }
            }) { Text("Enviar") }
        }
    }
}

private fun JSONObject.rows(key: String): List<JSONObject> {
    val array = optJSONArray(key) ?: return emptyList()
    return List(array.length()) { array.getJSONObject(it) }
}
