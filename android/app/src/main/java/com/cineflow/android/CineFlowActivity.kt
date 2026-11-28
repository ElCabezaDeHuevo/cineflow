package com.cineflow.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val Ink = Color(0xFF10131A)
private val Panel = Color(0xFF191E28)
private val PanelRaised = Color(0xFF202735)
private val Lime = Color(0xFFC4F36B)
private val Muted = Color(0xFFA2ACBC)

open class CineFlowActivity : ComponentActivity() {
    private val model by viewModels<CineFlowModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val colors = darkColorScheme(
                primary = Lime,
                onPrimary = Ink,
                secondary = Color(0xFF86D8D0),
                background = Ink,
                surface = Panel,
                surfaceVariant = PanelRaised,
                onSurface = Color(0xFFF4F6FA),
                onSurfaceVariant = Muted,
                outline = Color(0xFF394253),
                error = Color(0xFFFF8D91),
            )
            MaterialTheme(colorScheme = colors, typography = Typography()) {
                Surface(Modifier.fillMaxSize(), color = Ink) { CineFlow(model) }
            }
        }
    }
}

private enum class Destination(val title: String, val glyph: String) {
    Home("Inicio", ""), Projects("Proyectos", "?"), WorkHours("Jornada", "?"), Team("Equipo", "?"), More("M�s", ""), Requests("Solicitudes", "V"), Profile("Perfil", "?")
}

private val bottomDestinations = listOf(Destination.Home, Destination.Projects, Destination.WorkHours, Destination.Team, Destination.More)

@Composable
private fun CineFlow(model: CineFlowModel) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(model.signedIn, lifecycle) {
        if (model.signedIn) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                model.refresh()
                delay(12_000)
            }
        }
    }

    if (!model.signedIn) {
        Login(model.busy, model.error, model::signIn)
        return
    }
    model.openProjectId?.let { id ->
        key(id) { ProjectTracking(model) }
        return
    }

    var selected by rememberSaveable { mutableStateOf(Destination.Home.name) }
    var confirmation by remember { mutableStateOf<(() -> Unit)?>(null) }
    var confirmationText by remember { mutableStateOf("") }
    val destination = Destination.valueOf(selected)
    Scaffold(
        containerColor = Ink,
        bottomBar = {
            NavigationBar(containerColor = Panel, tonalElevation = 0.dp) {
                bottomDestinations.forEach { item ->
                    val badge = item == Destination.More && model.inbox.isNotEmpty()
                    val isCurrent = destination == item || (item == Destination.More && destination in listOf(Destination.Requests, Destination.Profile))
                    NavigationBarItem(
                        selected = isCurrent,
                        onClick = { selected = item.name },
                        icon = {
                            BadgedBox(badge = { if (badge) Badge(containerColor = Lime, contentColor = Ink) { Text(model.inbox.size.toString()) } }) {
                                Text(item.glyph, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                            }
                        },
                        label = { Text(item.title) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Lime, selectedTextColor = Lime,
                            unselectedIconColor = Muted, unselectedTextColor = Muted,
                            indicatorColor = PanelRaised,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).safeDrawingPadding()) {
            when (destination) {
                Destination.Home -> HomeScreen(model, onOpenProjects = { selected = Destination.Projects.name }, onOpenRequests = { selected = Destination.Requests.name })
                Destination.Projects -> ProjectsScreen(model)
                Destination.Requests -> RequestsScreen(model) { request, action ->
                    confirmationText = if (action == "approve") {
                        if (request.kind == "join") "�Aprobar el ingreso de ${request.person} a ${request.project}?" else "�Autorizar la salida de ${request.person} de ${request.project}?"
                    } else "�Rechazar esta solicitud?"
                    confirmation = { model.act(request.id, request.kind, action) }
                }
                Destination.WorkHours -> AttendanceScreen(model)
                Destination.Team -> TeamScreen(model)
                Destination.More -> MoreScreen(model, onOpenRequests = { selected = Destination.Requests.name }, onOpenProfile = { selected = Destination.Profile.name })
                Destination.Profile -> ProfileScreen(model)
            }
        }
    }
    confirmation?.let { action ->
        AlertDialog(
            onDismissRequest = { confirmation = null },
            title = { Text("Confirmar acci�n") },
            text = { Text(confirmationText) },
            confirmButton = { Button(onClick = { confirmation = null; action() }) { Text("Confirmar") } },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun MoreScreen(model: CineFlowModel, onOpenRequests: () -> Unit, onOpenProfile: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("M�s opciones", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Solicitudes del proyecto y tu cuenta", color = Muted)
        }
        item { MoreCard("Solicitudes", "${model.inbox.size} pendientes de revisi�n", "V", onOpenRequests, highlight = model.inbox.isNotEmpty()) }
        item { MoreCard("Mi perfil", "Cuenta y opciones de sesi�n", "?", onOpenProfile) }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Sincronizaci�n autom�tica", fontWeight = FontWeight.SemiBold)
                    Text("Proyectos, solicitudes y jornadas se actualizan mientras CineFlow est� abierto.", color = Muted, style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = model::refresh, enabled = !model.busy) { Text("Actualizar ahora") }
                }
            }
        }
    }
}

@Composable
private fun MoreCard(title: String, detail: String, glyph: String, onClick: () -> Unit, highlight: Boolean = false) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = if (highlight) Color(0xFF27331D) else Panel), shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) { Text(glyph, color = Lime) }
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(detail, color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            Text(">", color = Lime, style = MaterialTheme.typography.headlineMedium)
        }
    }
}

@Composable
private fun TeamScreen(model: CineFlowModel) {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Equipo", "Personas y responsabilidades en tus productoras", model.busy, model::refresh)
        if (model.error != null) ErrorCard(model.error!!, Modifier.padding(horizontal = 20.dp))
        if (model.teamMembers.isEmpty() && model.loaded) {
            EmptyState("No hay equipo disponible", "El directorio muestra integrantes de las productoras vinculadas a tu cuenta.", "?", Modifier.fillMaxSize().padding(24.dp))
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(model.teamMembers, key = { "${it.organizationName}-${it.id}" }) { member ->
                    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(42.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) {
                                    Text(member.name.firstOrNull()?.uppercase() ?: "C", color = Lime, fontWeight = FontWeight.Bold)
                                }
                                Column {
                                    Text(member.name, fontWeight = FontWeight.SemiBold)
                                    Text(member.organizationName, color = Muted, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            Text("Acceso: ${companyRoleLabel(member.companyRole)}", color = Muted, style = MaterialTheme.typography.bodySmall)
                            member.cinematicRole?.let { role ->
                                Text(if (member.cinematicRoleStatus == "pending") "Puesto pendiente: ${cineRoleLabel(role)}" else "Puesto: ${cineRoleLabel(role)}", color = Lime, style = MaterialTheme.typography.bodySmall)
                            }
                            if (member.bio.isNotBlank()) Text(member.bio, color = Muted, style = MaterialTheme.typography.bodySmall, maxLines = 3)
                            member.projects.takeIf { it.isNotEmpty() }?.let { projects ->
                                Text("Proyectos: ${projects.joinToString { it.name }}", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun companyRoleLabel(role: String) = when (role) {
    "owner" -> "Due�o de productora"
    "admin" -> "Administrador"
    "producer" -> "Productor"
    "viewer" -> "Solo lectura"
    else -> "Colaborador"
}

private fun cineRoleLabel(role: String) = when (role) {
    "director" -> "Direcci�n"
    "producer" -> "Producci�n"
    "screenwriter" -> "Guion"
    "director-of-photography" -> "Direcci�n de fotograf�a"
    "camera-operator" -> "Operaci�n de c�mara"
    "editor" -> "Montaje / Edici�n"
    "vfx-artist" -> "Efectos visuales / VFX"
    else -> role.replace('-', ' ').replaceFirstChar { it.uppercase() }
}

@Composable
private fun AttendanceScreen(model: CineFlowModel) {
    var note by rememberSaveable { mutableStateOf("") }
    val active = model.workSessions.firstOrNull { !it.deleted && it.clockOut == null }
    val completed = model.workSessions.filter { !it.deleted && it.clockOut != null }
    val totalMillis = completed.sumOf { session ->
        runCatching { Duration.between(Instant.parse(session.clockIn), Instant.parse(session.clockOut)).toMillis().coerceAtLeast(0L) }.getOrDefault(0L)
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            ScreenHeader("Mi jornada", "Registra tus entradas y salidas", model.busy, model::refresh)
        }
        if (model.error != null) item { ErrorCard(model.error!!) }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = PanelRaised), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(if (active != null) "JORNADA ACTIVA" else "SIN JORNADA ACTIVA", color = if (active != null) Lime else Muted, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                    Text(if (active != null) "Est�s en jornada" else "�Vas a empezar?", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(if (active != null) "Entrada: ${formatSessionTime(active.clockIn)}" else "Registra tu entrada para comenzar a contar tus horas.", color = Muted)
                    if (active == null) {
                        Button(onClick = model::clockIn, enabled = !model.busy, modifier = Modifier.fillMaxWidth()) { Text(if (model.busy) "Registrando." else "Checar entrada") }
                    } else {
                        OutlinedTextField(note, { note = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Nota de salida (opcional)") }, maxLines = 2)
                        Button(onClick = { model.clockOut(active.id, note); note = "" }, enabled = !model.busy, modifier = Modifier.fillMaxWidth()) { Text(if (model.busy) "Registrando." else "Checar salida") }
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Horas completadas", formatDuration(totalMillis), Modifier.weight(1f))
                StatCard("Jornadas", completed.size.toString(), Modifier.weight(1f))
            }
        }
        item { Text("Historial personal", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        if (model.workSessions.none { !it.deleted }) item { EmptyState("Sin jornadas registradas", "Cuando cheques entrada, ver�s aqu� tu historial.", "?") }
        items(model.workSessions.filterNot { it.deleted }, key = { "session-${it.id}" }) { session ->
            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(formatSessionTime(session.clockIn), fontWeight = FontWeight.SemiBold)
                    Text(if (session.clockOut == null) "En curso" else "Salida: ${formatSessionTime(session.clockOut)}", color = if (session.clockOut == null) Lime else Muted, style = MaterialTheme.typography.bodySmall)
                    if (session.clockOut != null) Text("Duraci�n: ${formatDuration(runCatching { Duration.between(Instant.parse(session.clockIn), Instant.parse(session.clockOut)).toMillis() }.getOrDefault(0L))}", color = Muted, style = MaterialTheme.typography.bodySmall)
                    if (session.note.isNotBlank()) Text("Nota: ${session.note}", color = Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

private fun formatSessionTime(value: String): String = runCatching {
    Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("d MMM yyyy � HH:mm", Locale.forLanguageTag("es-MX")))
}.getOrDefault(value)

private fun formatDuration(milliseconds: Long): String {
    val totalMinutes = milliseconds.coerceAtLeast(0L) / 60_000
    return "${totalMinutes / 60} h ${(totalMinutes % 60).toString().padStart(2, '0')} min"
}

@Composable
private fun HomeScreen(model: CineFlowModel, onOpenProjects: () -> Unit, onOpenRequests: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("CINEFLOW", style = MaterialTheme.typography.labelLarge, color = Lime, fontWeight = FontWeight.Bold)
                    Text("Tu producci�n, en marcha", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                }
                TextButton(onClick = model::refresh, enabled = !model.busy) { Text("?  Actualizar") }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = PanelRaised), shape = RoundedCornerShape(24.dp)) {
                Column(Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("ESPACIO DE TRABAJO", style = MaterialTheme.typography.labelMedium, color = Lime, fontWeight = FontWeight.Bold)
                    Text("Todo lo que mueve tus proyectos.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text("Consulta avances, abre el seguimiento y coordina con tu equipo.", color = Muted)
                    FilledTonalButton(onClick = onOpenProjects, colors = ButtonDefaults.filledTonalButtonColors(containerColor = Lime, contentColor = Ink)) {
                        Text("Ver mis proyectos")
                    }
                }
            }
        }
        if (model.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = Lime) }
        model.error?.let { message -> item { ErrorCard(message) } }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Proyectos", model.projects.size.toString(), Modifier.weight(1f))
                StatCard("Por revisar", model.inbox.size.toString(), Modifier.weight(1f), highlight = model.inbox.isNotEmpty())
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Actividad reciente", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                TextButton(onClick = onOpenRequests) { Text("Solicitudes ${if (model.inbox.isEmpty()) "" else "� ${model.inbox.size}"}") }
            }
        }
        if (model.inbox.isNotEmpty()) {
            items(model.inbox.take(3), key = { "home-${it.id}" }) { request ->
                Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(38.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) { Text("V", color = Lime) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(request.project, fontWeight = FontWeight.SemiBold)
                            Text("${request.person} solicita ${if (request.kind == "join") "unirse" else "salir"}", color = Muted, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        } else if (model.loaded) {
            item { EmptyState("Todo al d�a", "No tienes solicitudes pendientes de revisi�n.", "V") }
        }
        item {
            Text("Tus producciones", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        if (model.projects.isEmpty() && model.loaded) {
            item { EmptyState("A�n no hay proyectos", "Cuando tengas acceso a una producci�n, aparecer� aqu�.", "?") }
        } else {
            items(model.projects.take(3), key = { "home-project-${it.id}" }) { project ->
                ProjectCard(model, project)
            }
        }
    }
}

@Composable
private fun ProjectsScreen(model: CineFlowModel) {
    var query by rememberSaveable { mutableStateOf("") }
    var creating by rememberSaveable { mutableStateOf(false) }
    val projects = model.projects.filter { project ->
        listOf(project.name, project.type, project.stage).any { it.contains(query.trim(), ignoreCase = true) }
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 18.dp, bottom = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Proyectos", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Producciones vinculadas a tu cuenta", style = MaterialTheme.typography.bodySmall, color = Muted)
            }
            TextButton(onClick = model::refresh, enabled = !model.busy) { Text("?") }
        }
        Button(
            onClick = { creating = true },
            enabled = !model.busy && model.organizations.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
            shape = RoundedCornerShape(14.dp),
        ) { Text("+  Crear proyecto") }
        if (model.organizations.isEmpty() && model.loaded) {
            Text("Tu cuenta no tiene una productora disponible para crear proyectos.", color = Muted, modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp), style = MaterialTheme.typography.bodySmall)
        }
        OutlinedTextField(
            value = query, onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            singleLine = true, label = { Text("Buscar proyectos") },
            shape = RoundedCornerShape(16.dp),
        )
        if (model.error != null) ErrorCard(model.error!!, Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        LazyColumn(
            modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (model.loaded && projects.isEmpty()) item {
                EmptyState(if (query.isBlank()) "Sin proyectos todav�a" else "No encontramos coincidencias", if (query.isBlank()) "Los proyectos compartidos contigo aparecer�n aqu�." else "Prueba con otro nombre, tipo o etapa.", "?")
            }
            items(projects, key = { it.id }) { project -> ProjectCard(model, project) }
        }
    }
    if (creating) CreateProjectDialog(model) { creating = false }
}

@Composable
private fun CreateProjectDialog(model: CineFlowModel, dismiss: () -> Unit) {
    var organizationId by rememberSaveable { mutableStateOf(model.organizations.firstOrNull()?.id.orEmpty()) }
    var organizationMenu by remember { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("") }
    var stage by rememberSaveable { mutableStateOf("") }
    var ownerRole by rememberSaveable { mutableStateOf("") }
    var startDate by rememberSaveable { mutableStateOf("") }
    var deliveryDate by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!model.busy) dismiss() },
        title = { Text("Nuevo proyecto") },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(max = 500.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box {
                    OutlinedButton(onClick = { organizationMenu = true }, modifier = Modifier.fillMaxWidth(), enabled = model.organizations.isNotEmpty()) {
                        Text(model.organizations.firstOrNull { it.id == organizationId }?.name ?: "Selecciona una productora")
                    }
                    DropdownMenu(expanded = organizationMenu, onDismissRequest = { organizationMenu = false }) {
                        model.organizations.forEach { organization ->
                            DropdownMenuItem(text = { Text(organization.name) }, onClick = { organizationId = organization.id; organizationMenu = false })
                        }
                    }
                }
                OutlinedTextField(name, { name = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Nombre del proyecto") }, singleLine = true)
                OutlinedTextField(type, { type = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Tipo de producci�n") }, singleLine = true, placeholder = { Text("Cortometraje, serie, documental.") })
                OutlinedTextField(stage, { stage = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Etapa actual") }, singleLine = true, placeholder = { Text("Desarrollo, preproducci�n.") })
                OutlinedTextField(ownerRole, { ownerRole = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Responsable") }, singleLine = true)
                OutlinedTextField(startDate, { startDate = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Inicio (AAAA-MM-DD)") }, singleLine = true)
                OutlinedTextField(deliveryDate, { deliveryDate = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Entrega (AAAA-MM-DD)") }, singleLine = true)
                OutlinedTextField(description, { description = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Descripci�n") }, minLines = 2, maxLines = 4)
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    model.createProject(organizationId, name, type, stage, ownerRole, startDate, deliveryDate, description) { dismiss() }
                },
                enabled = !model.busy && organizationId.isNotBlank() && name.isNotBlank() && type.isNotBlank() && stage.isNotBlank() && ownerRole.isNotBlank() && startDate.isNotBlank() && deliveryDate.isNotBlank(),
            ) { Text(if (model.busy) "Guardando." else "Crear") }
        },
        dismissButton = { TextButton(enabled = !model.busy, onClick = dismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun ProjectCard(model: CineFlowModel, project: Project) {
    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(project.type.uppercase(), style = MaterialTheme.typography.labelMedium, color = Lime, fontWeight = FontWeight.Bold)
                StatusPill(project.pending?.let { if (it == "join") "Acceso pendiente" else "Salida pendiente" } ?: project.stage)
            }
            Text(project.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            when {
                project.pending == "join" -> Text("Tu solicitud est� esperando aprobaci�n.", color = Muted)
                project.pending == "leave" -> {
                    Text("Tu salida est� esperando aprobaci�n.", color = Muted)
                    if (project.role != null) Button(onClick = { model.openProject(project.id) }, enabled = !model.busy) { Text("Abrir seguimiento") }
                }
                project.role != null -> {
                    Text(if (project.role == "owner") "Propietario del proyecto" else "Integrante del proyecto", color = Muted)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { model.openProject(project.id) }, enabled = !model.busy) { Text("Abrir proyecto") }
                        if (project.role != "owner") {
                            OutlinedButton(onClick = { model.act(project.id, "leave", "request") }, enabled = !model.busy) { Text("Solicitar salida") }
                        }
                    }
                }
                else -> {
                    Text("Solicita acceso para colaborar en esta producci�n.", color = Muted)
                    OutlinedButton(onClick = { model.act(project.id, "join", "request") }, enabled = !model.busy) { Text("Solicitar acceso") }
                }
            }
        }
    }
}

@Composable
private fun RequestsScreen(model: CineFlowModel, decide: (Review, String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Solicitudes", "Accesos y salidas por autorizar", model.busy, model::refresh)
        if (model.error != null) ErrorCard(model.error!!, Modifier.padding(horizontal = 20.dp))
        if (model.inbox.isEmpty() && model.loaded) {
            EmptyState("Bandeja despejada", "Las nuevas solicitudes aparecer�n aqu� autom�ticamente.", "V", Modifier.fillMaxSize().padding(24.dp))
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(model.inbox, key = { it.id }) { request ->
                    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(20.dp)) {
                        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            StatusPill(if (request.kind == "join") "Solicitud de acceso" else "Solicitud de salida")
                            Text(request.project, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Text("${request.person} ${if (request.kind == "join") "quiere unirse al proyecto" else "solicita salir del proyecto"}.", color = Muted)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { decide(request, "approve") }, enabled = !model.busy) { Text("Aprobar") }
                                OutlinedButton(onClick = { decide(request, "reject") }, enabled = !model.busy) { Text("Rechazar") }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileScreen(model: CineFlowModel) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Text("Perfil", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("Tu sesi�n de CineFlow", color = Muted)
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("SESI�N ACTIVA", color = Lime, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                    Text("Cuenta conectada", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("Los proyectos y solicitudes se sincronizan con CineFlow.", color = Muted)
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Acerca de", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("CineFlow para Android", color = Muted)
                    Text("La informaci�n se carga desde tu cuenta. Puedes actualizarla manualmente desde Inicio o Proyectos.", color = Muted)
                }
            }
        }
        item {
            OutlinedButton(onClick = model::signOut, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Text("Cerrar sesi�n")
            }
        }
        model.error?.let { message -> item { ErrorCard(message) } }
    }
}

@Composable
private fun ScreenHeader(title: String, subtitle: String, busy: Boolean, refresh: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 18.dp, bottom = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically,
    ) {
        Column {
            Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Muted)
        }
        TextButton(onClick = refresh, enabled = !busy) { Text("?") }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier, highlight: Boolean = false) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = if (highlight) Color(0xFF27331D) else Panel), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = if (highlight) Lime else Color.White)
            Text(label, color = Muted)
        }
    }
}

@Composable
private fun StatusPill(label: String) {
    Surface(color = PanelRaised, shape = RoundedCornerShape(50)) {
        Text(label, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = Color(0xFFC9D2DF), style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun EmptyState(title: String, description: String, glyph: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(58.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) {
            Text(glyph, style = MaterialTheme.typography.headlineMedium, color = Lime)
        }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(description, color = Muted)
    }
}

@Composable
private fun ErrorCard(message: String, modifier: Modifier = Modifier) {
    Surface(modifier.fillMaxWidth(), color = Color(0xFF3A2227), shape = RoundedCornerShape(14.dp)) {
        Text(message, Modifier.padding(14.dp), color = Color(0xFFFFB6B8), style = MaterialTheme.typography.bodyMedium)
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
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(Modifier.size(58.dp).background(Lime, RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
                    Text("CF", color = Ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                }
                Text("CineFlow", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
                Text("Tus producciones y tu equipo, en un solo lugar.", color = Muted)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), shape = RoundedCornerShape(14.dp))
                OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Contrase�a") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), shape = RoundedCornerShape(14.dp))
                error?.let { ErrorCard(it) }
                Button(
                    onClick = { submit(email.trim(), password); password = "" },
                    enabled = !busy && email.isNotBlank() && password.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(14.dp),
                ) { Text(if (busy) "Conectando." else "Iniciar sesi�n") }
                Text("Inicia sesi�n con la misma cuenta que usas en CineFlow.", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

