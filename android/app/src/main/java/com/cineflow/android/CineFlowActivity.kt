package com.cineflow.android

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

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

private const val CINEFLOW_WEB_URL = "https://cineflow-5w7b.vercel.app/"
private const val CINEFLOW_WEB_HOST = "cineflow-5w7b.vercel.app"

private val Ink = Color(0xFF100D19)
private val Panel = Color(0xFF211B2D)
private val PanelRaised = Color(0xFF30263F)
private val Accent = Color(0xFF9B55F5)
private val Muted = Color(0xFFC1B9CC)

open class CineFlowActivity : ComponentActivity() {
    private val model by viewModels<CineFlowModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val colors = darkColorScheme(
                primary = Accent,
                onPrimary = Ink,
                secondary = Color(0xFFC5A4FF),
                background = Ink,
                surface = Panel,
                surfaceVariant = PanelRaised,
                onSurface = Color(0xFFF7F3FF),
                onSurfaceVariant = Muted,
                outline = Color(0xFF51435F),
                error = Color(0xFFFF8B9A),
            )
            MaterialTheme(colorScheme = colors, typography = Typography()) {
                Surface(Modifier.fillMaxSize(), color = Ink) { CineFlow(model) }
            }
        }
    }
}

private enum class Destination(val title: String, val glyph: String) {
    Home("Inicio", "\u2302"), Projects("Proyectos", "\u25A3"), WorkHours("Jornada", "\u25F7"), Team("Equipo", "\u2659"), More("M\u00E1s", "\u2022\u2022\u2022"), Calendar("Calendario", "\u25A6"), Requests("Solicitudes", "\u2713"), Profile("Perfil", "\u25CF"), FullApp("CineFlow", "↗")
}

private val bottomDestinations = listOf(Destination.Home, Destination.Projects, Destination.WorkHours, Destination.Team, Destination.More)

@Composable
private fun CineFlow(model: CineFlowModel) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(model.signedIn, lifecycle) {
        if (model.signedIn) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) { model.refresh(); delay(12_000) }
        }
    }
    if (!model.signedIn) { Login(model.busy, model.error, model::signIn); return }
    model.openProjectId?.let { id -> key(id) { ProjectTracking(model) }; return }

    var selected by rememberSaveable { mutableStateOf(Destination.Home.name) }
    var confirmation by remember { mutableStateOf<(() -> Unit)?>(null) }
    var confirmationText by remember { mutableStateOf("") }
    val destination = Destination.valueOf(selected)
    Scaffold(containerColor = Ink, bottomBar = {
        if (destination != Destination.FullApp) NavigationBar(containerColor = Panel, tonalElevation = 0.dp) {
            bottomDestinations.forEach { item ->
                val badge = item == Destination.More && model.inbox.isNotEmpty()
                val isCurrent = destination == item || (item == Destination.More && destination in listOf(Destination.Requests, Destination.Profile, Destination.Calendar, Destination.FullApp))
                NavigationBarItem(selected = isCurrent, onClick = { selected = item.name }, icon = {
                    BadgedBox(badge = { if (badge) Badge(containerColor = Accent, contentColor = Ink) { Text(model.inbox.size.toString()) } }) {
                        Text(item.glyph, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    }
                }, label = { Text(item.title) }, colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Accent, selectedTextColor = Accent, unselectedIconColor = Muted,
                    unselectedTextColor = Muted, indicatorColor = PanelRaised,
                ))
            }
        }
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).safeDrawingPadding()) {
            when (destination) {
                Destination.Home -> HomeScreen(model, onOpenProjects = { selected = Destination.Projects.name }, onOpenRequests = { selected = Destination.Requests.name })
                Destination.Projects -> ProjectsScreen(model)
                Destination.Requests -> RequestsScreen(model) { request, action ->
                    confirmationText = if (action == "approve") {
                        if (request.kind == "join") "¿Aprobar el ingreso de ${request.person} a ${request.project}?" else "¿Autorizar la salida de ${request.person} de ${request.project}?"
                    } else "¿Rechazar esta solicitud?"
                    confirmation = { model.act(request.id, request.kind, action) }
                }
                Destination.WorkHours -> AttendanceScreen(model)
                Destination.Team -> TeamScreen(model)
                Destination.More -> MoreScreen(model, onOpenCalendar = { selected = Destination.Calendar.name }, onOpenRequests = { selected = Destination.Requests.name }, onOpenProfile = { selected = Destination.Profile.name }, onOpenFullApp = { selected = Destination.FullApp.name })
                Destination.Calendar -> CalendarScreen(model, onOpenProject = { model.openProject(it) })
                Destination.Profile -> ProfileScreen(model)
                Destination.FullApp -> FullCineFlowScreen(onBack = { selected = Destination.More.name })
            }
        }
    }
    confirmation?.let { action -> AlertDialog(onDismissRequest = { confirmation = null }, title = { Text("Confirmar acción") },
        text = { Text(confirmationText) }, confirmButton = { Button(onClick = { confirmation = null; action() }) { Text("Confirmar") } },
        dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Cancelar") } }) }
}

@Composable
private fun MoreScreen(model: CineFlowModel, onOpenCalendar: () -> Unit, onOpenRequests: () -> Unit, onOpenProfile: () -> Unit, onOpenFullApp: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Text("Más opciones", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text("Agenda, solicitudes y cuenta", color = Muted) }
        item { MoreCard("Calendario de producción", "Rodajes, entregas y tareas pendientes", "\u25A6", onOpenCalendar) }
        item { MoreCard("Solicitudes", "${model.inbox.size} pendientes de revisión", "\u2713", onOpenRequests, highlight = model.inbox.isNotEmpty()) }
        item { MoreCard("Mi perfil", "Cuenta y opciones de sesión", "\u25CF", onOpenProfile) }
        item { MoreCard("CineFlow completo", "Administración, invitaciones, reportes y más herramientas", "↗", onOpenFullApp) }
        item { Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Sincronización automática", fontWeight = FontWeight.SemiBold)
                Text("Proyectos, solicitudes y jornadas se actualizan mientras CineFlow está abierto.", color = Muted, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = model::refresh, enabled = !model.busy) { Text("Actualizar ahora") }
            }
        } }
    }
}
@Composable
private fun MoreCard(title: String, detail: String, glyph: String, onClick: () -> Unit, highlight: Boolean = false) {
    Card(onClick = onClick, colors = CardDefaults.cardColors(containerColor = if (highlight) Color(0xFF362445) else Panel), shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.fillMaxWidth().padding(18.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) { Text(glyph, color = Accent) }
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(detail, color = Muted, style = MaterialTheme.typography.bodySmall)
            }
            Text(">", color = Accent, style = MaterialTheme.typography.headlineMedium)
        }
    }
}

@Composable
private fun FullCineFlowScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var webView by remember { mutableStateOf<WebView?>(null) }
    var hasLoaded by remember { mutableStateOf(false) }
    var pageError by remember { mutableStateOf<String?>(null) }
    var uploadCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        val selected = if (result.resultCode == android.app.Activity.RESULT_OK && data != null) {
            val clip = data.clipData
            when {
                clip != null -> Array(clip.itemCount) { clip.getItemAt(it).uri }
                data.data != null -> arrayOf(data.data!!)
                else -> null
            }
        } else null
        uploadCallback?.onReceiveValue(selected)
        uploadCallback = null
    }

    BackHandler { if (webView?.canGoBack() == true) webView?.goBack() else onBack() }
    DisposableEffect(webView) {
        onDispose {
            webView?.apply { stopLoading(); webChromeClient = null; removeAllViews(); destroy() }
        }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("← Más") }
            Text("CineFlow completo", modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
            TextButton(onClick = { webView?.reload() }, enabled = hasLoaded) { Text("↻") }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    WebView(viewContext).apply {
                        webView = this
                        setBackgroundColor(android.graphics.Color.rgb(16, 13, 25))
                        isVerticalScrollBarEnabled = false
                        overScrollMode = View.OVER_SCROLL_NEVER
                        CookieManager.getInstance().setAcceptCookie(true)
                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            databaseEnabled = true
                            loadsImagesAutomatically = true
                            allowFileAccess = false
                            allowContentAccess = true
                            javaScriptCanOpenWindowsAutomatically = false
                            setSupportMultipleWindows(false)
                            builtInZoomControls = false
                            displayZoomControls = false
                            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            cacheMode = WebSettings.LOAD_DEFAULT
                            mediaPlaybackRequiresUserGesture = true
                            userAgentString = "$userAgentString CineFlowAndroid/0.3.0"
                        }
                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                                pageError = null
                            }
                            override fun onPageFinished(view: WebView?, url: String?) { hasLoaded = true }
                            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                                if (request?.isForMainFrame == true) pageError = "No se pudo cargar CineFlow. Revisa tu conexión e inténtalo otra vez."
                            }
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
                                val uri = request.url
                                val host = uri.host.orEmpty().lowercase(Locale.ROOT)
                                if (uri.scheme == "https" && (host == CINEFLOW_WEB_HOST || host.endsWith(".supabase.co"))) return false
                                return try {
                                    if (uri.scheme in listOf("http", "https", "mailto", "tel")) context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                    true
                                } catch (_: Exception) { true }
                            }
                        }
                        webChromeClient = object : WebChromeClient() {
                            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                                uploadCallback?.onReceiveValue(null)
                                uploadCallback = callback
                                val types = params?.acceptTypes?.filter { it.isNotBlank() }?.toTypedArray().orEmpty()
                                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                                    addCategory(Intent.CATEGORY_OPENABLE)
                                    type = types.singleOrNull() ?: "*/*"
                                    if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types)
                                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params?.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                                }
                                return try { filePicker.launch(intent); true } catch (_: Exception) {
                                    uploadCallback?.onReceiveValue(null); uploadCallback = null; false
                                }
                            }
                        }
                        setDownloadListener(DownloadListener { url, agent, disposition, type, _ ->
                            enqueueCineFlowDownload(context, url, agent, disposition, type)
                        })
                        loadUrl(CINEFLOW_WEB_URL)
                    }
                },
                update = { if (it.url == null) it.loadUrl(CINEFLOW_WEB_URL) },
            )
            if (!hasLoaded || pageError != null) {
                Surface(Modifier.fillMaxSize(), color = Ink.copy(alpha = 0.98f)) {
                    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        if (pageError == null) {
                            CircularProgressIndicator(color = Accent)
                            Text("Abriendo CineFlow…", modifier = Modifier.padding(top = 12.dp), color = Muted)
                        } else {
                            Text(pageError.orEmpty(), color = Muted)
                            Button(modifier = Modifier.padding(top = 12.dp), onClick = { pageError = null; hasLoaded = false; webView?.loadUrl(CINEFLOW_WEB_URL) }) { Text("Reintentar") }
                        }
                    }
                }
            }
        }
    }
}

private fun enqueueCineFlowDownload(context: Context, url: String, userAgent: String?, contentDisposition: String?, mimeType: String?) {
    try {
        val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(fileName)
            .setDescription("Descargando desde CineFlow")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
        CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
        userAgent?.let { request.addRequestHeader("User-Agent", it) }
        (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        Toast.makeText(context, "Descarga iniciada", Toast.LENGTH_SHORT).show()
    } catch (_: Exception) {
        Toast.makeText(context, "No se pudo iniciar la descarga", Toast.LENGTH_LONG).show()
    }
}

@Composable
private fun CalendarScreen(model: CineFlowModel, onOpenProject: (String) -> Unit) {
    LaunchedEffect(Unit) { model.refreshCalendar() }
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Calendario", "Entregas, tareas y jornadas de rodaje", model.busy, model::refreshCalendar)
        if (model.error != null) ErrorCard(model.error!!, Modifier.padding(horizontal = 20.dp))
        if (model.calendarEvents.isEmpty() && !model.busy) {
            EmptyState("Agenda despejada", "Cuando un proyecto tenga una fecha, tarea o rodaje, aparecera aqui.", "\u25A6", Modifier.fillMaxSize().padding(24.dp))
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(model.calendarEvents, key = { it.id }) { event ->
                    Card(onClick = { event.projectId?.let(onOpenProject) }, enabled = event.projectId != null,
                        colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
                            Column(Modifier.width(62.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(event.date.take(10).takeLast(2), style = MaterialTheme.typography.headlineMedium, color = Accent, fontWeight = FontWeight.Bold)
                                Text(event.date.take(10).drop(5).take(2), color = Muted, style = MaterialTheme.typography.labelSmall)
                            }
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                StatusPill(event.type)
                                Text(event.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                                if (event.detail.isNotBlank()) Text(event.detail, color = Muted, style = MaterialTheme.typography.bodySmall)
                                Text(event.date.take(10), color = Muted, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TeamScreen(model: CineFlowModel) {
    Column(Modifier.fillMaxSize()) {
        ScreenHeader("Equipo", "Personas y responsabilidades en tus productoras", model.busy, model::refresh)
        if (model.error != null) ErrorCard(model.error!!, Modifier.padding(horizontal = 20.dp))
        if (model.teamMembers.isEmpty() && model.loaded) {
            EmptyState("No hay equipo disponible", "El directorio muestra integrantes de las productoras vinculadas a tu cuenta.", "◉", Modifier.fillMaxSize().padding(24.dp))
        } else {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(model.teamMembers, key = { "${it.organizationName}-${it.id}" }) { member ->
                    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Box(Modifier.size(42.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) {
                                    Text(member.name.firstOrNull()?.uppercase() ?: "C", color = Accent, fontWeight = FontWeight.Bold)
                                }
                                Column {
                                    Text(member.name, fontWeight = FontWeight.SemiBold)
                                    Text(member.organizationName, color = Muted, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            Text("Acceso: ${companyRoleLabel(member.companyRole)}", color = Muted, style = MaterialTheme.typography.bodySmall)
                            member.cinematicRole?.let { role ->
                                Text(if (member.cinematicRoleStatus == "pending") "Puesto pendiente: ${cineRoleLabel(role)}" else "Puesto: ${cineRoleLabel(role)}", color = Accent, style = MaterialTheme.typography.bodySmall)
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
    "owner" -> "Dueño de productora"
    "admin" -> "Administrador"
    "producer" -> "Productor"
    "viewer" -> "Solo lectura"
    else -> "Colaborador"
}

private fun cineRoleLabel(role: String) = when (role) {
    "director" -> "Dirección"
    "producer" -> "Producción"
    "screenwriter" -> "Guion"
    "director-of-photography" -> "Dirección de fotografía"
    "camera-operator" -> "Operación de cámara"
    "editor" -> "Montaje / Edición"
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
                    Text(if (active != null) "JORNADA ACTIVA" else "SIN JORNADA ACTIVA", color = if (active != null) Accent else Muted, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                    Text(if (active != null) "Estás en jornada" else "¿Vas a empezar?", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
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
        if (model.workSessions.none { !it.deleted }) item { EmptyState("Sin jornadas registradas", "Cuando registres tu entrada, verás aquí tu historial.", "◷") }
        items(model.workSessions.filterNot { it.deleted }, key = { "session-${it.id}" }) { session ->
            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(formatSessionTime(session.clockIn), fontWeight = FontWeight.SemiBold)
                    Text(if (session.clockOut == null) "En curso" else "Salida: ${formatSessionTime(session.clockOut)}", color = if (session.clockOut == null) Accent else Muted, style = MaterialTheme.typography.bodySmall)
                    if (session.clockOut != null) Text("Duración: ${formatDuration(runCatching { Duration.between(Instant.parse(session.clockIn), Instant.parse(session.clockOut)).toMillis() }.getOrDefault(0L))}", color = Muted, style = MaterialTheme.typography.bodySmall)
                    if (session.note.isNotBlank()) Text("Nota: ${session.note}", color = Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

private fun formatSessionTime(value: String): String = runCatching {
    Instant.parse(value).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("d MMM yyyy · HH:mm", Locale.forLanguageTag("es-MX")))
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
                    Text("CINEFLOW", style = MaterialTheme.typography.labelLarge, color = Accent, fontWeight = FontWeight.Bold)
                    Text("Tu producción, en marcha", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                }
                TextButton(onClick = model::refresh, enabled = !model.busy) { Text("↻  Actualizar") }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = PanelRaised), shape = RoundedCornerShape(24.dp)) {
                Column(Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("ESPACIO DE TRABAJO", style = MaterialTheme.typography.labelMedium, color = Accent, fontWeight = FontWeight.Bold)
                    Text("Todo lo que mueve tus proyectos.", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text("Consulta avances, abre el seguimiento y coordina con tu equipo.", color = Muted)
                    FilledTonalButton(onClick = onOpenProjects, colors = ButtonDefaults.filledTonalButtonColors(containerColor = Accent, contentColor = Ink)) {
                        Text("Ver mis proyectos")
                    }
                }
            }
        }
        if (model.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = Accent) }
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
                TextButton(onClick = onOpenRequests) { Text("Solicitudes ${if (model.inbox.isEmpty()) "" else "• ${model.inbox.size}"}") }
            }
        }
        if (model.inbox.isNotEmpty()) {
            items(model.inbox.take(3), key = { "home-${it.id}" }) { request ->
                Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(18.dp)) {
                    Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(38.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) { Text("V", color = Accent) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(request.project, fontWeight = FontWeight.SemiBold)
                            Text("${request.person} solicita ${if (request.kind == "join") "unirse" else "salir"}", color = Muted, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        } else if (model.loaded) {
            item { EmptyState("Todo al día", "No tienes solicitudes pendientes de revisión.", "V") }
        }
        item {
            Text("Tus producciones", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        if (model.projects.isEmpty() && model.loaded) {
            item { EmptyState("Aún no hay proyectos", "Cuando tengas acceso a una producción, aparecerá aquí.", "▣") }
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
            TextButton(onClick = model::refresh, enabled = !model.busy) { Text("↻") }
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
                EmptyState(if (query.isBlank()) "Sin proyectos todavía" else "No encontramos coincidencias", if (query.isBlank()) "Los proyectos compartidos contigo aparecerán aquí." else "Prueba con otro nombre, tipo o etapa.", "⌕")
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
    val datesAreValid = startDate.isNotBlank() && deliveryDate.isNotBlank() && deliveryDate >= startDate
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
                OutlinedTextField(type, { type = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Tipo de producción") }, singleLine = true, placeholder = { Text("Cortometraje, serie, documental.") })
                OutlinedTextField(stage, { stage = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Etapa actual") }, singleLine = true, placeholder = { Text("Desarrollo, preproducción.") })
                OutlinedTextField(ownerRole, { ownerRole = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Responsable") }, singleLine = true)
                ProjectDateField("Fecha de inicio", startDate) { startDate = it }
                ProjectDateField("Fecha de entrega", deliveryDate) { deliveryDate = it }
                if (startDate.isNotBlank() && deliveryDate.isNotBlank() && deliveryDate < startDate) {
                    Text("La entrega debe ser el mismo día o después del inicio.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedTextField(description, { description = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Descripción") }, minLines = 2, maxLines = 4)
                model.error?.let { ErrorCard(it) }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    model.createProject(organizationId, name, type, stage, ownerRole, startDate, deliveryDate, description) { dismiss() }
                },
                enabled = !model.busy && organizationId.isNotBlank() && name.isNotBlank() && type.isNotBlank() && stage.isNotBlank() && ownerRole.isNotBlank() && datesAreValid,
            ) { Text(if (model.busy) "Guardando." else "Crear") }
        },
        dismissButton = { TextButton(enabled = !model.busy, onClick = dismiss) { Text("Cancelar") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProjectDateField(label: String, value: String, onDateSelected: (String) -> Unit) {
    var showPicker by rememberSaveable { mutableStateOf(false) }
    val initialMillis = remember(value) {
        runCatching {
            java.time.LocalDate.parse(value)
                .atStartOfDay(java.time.ZoneOffset.UTC)
                .toInstant()
                .toEpochMilli()
        }.getOrNull()
    }
    val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)

    OutlinedTextField(
        value = value,
        onValueChange = {},
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        placeholder = { Text("Seleccionar fecha") },
        readOnly = true,
        singleLine = true,
        trailingIcon = {
            TextButton(onClick = { showPicker = true }) {
                Text(if (value.isBlank()) "Elegir" else "Cambiar")
            }
        },
    )

    if (showPicker) {
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    enabled = pickerState.selectedDateMillis != null,
                    onClick = {
                        pickerState.selectedDateMillis?.let { millis ->
                            onDateSelected(
                                java.time.Instant.ofEpochMilli(millis)
                                    .atOffset(java.time.ZoneOffset.UTC)
                                    .toLocalDate()
                                    .toString(),
                            )
                        }
                        showPicker = false
                    },
                ) { Text("Usar fecha") }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) { Text("Cancelar") }
            },
        ) {
            DatePicker(state = pickerState, showModeToggle = false)
        }
    }
}

@Composable
private fun ProjectCard(model: CineFlowModel, project: Project) {
    Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(project.type.uppercase(), style = MaterialTheme.typography.labelMedium, color = Accent, fontWeight = FontWeight.Bold)
                StatusPill(project.pending?.let { if (it == "join") "Acceso pendiente" else "Salida pendiente" } ?: project.stage)
            }
            Text(project.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            when {
                project.pending == "join" -> Text("Tu solicitud está esperando aprobación.", color = Muted)
                project.pending == "leave" -> {
                    Text("Tu salida está esperando aprobación.", color = Muted)
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
                    Text("Solicita acceso para colaborar en esta producción.", color = Muted)
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
            EmptyState("Bandeja despejada", "Las nuevas solicitudes aparecerán aquí automáticamente.", "V", Modifier.fillMaxSize().padding(24.dp))
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
            Text("Tu sesión de CineFlow", color = Muted)
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Panel), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("SESIÓN ACTIVA", color = Accent, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
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
                    Text("La información se carga desde tu cuenta. Puedes actualizarla manualmente desde Inicio o Proyectos.", color = Muted)
                }
            }
        }
        item {
            OutlinedButton(onClick = model::signOut, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Text("Cerrar sesión")
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
        TextButton(onClick = refresh, enabled = !busy) { Text("↻") }
    }
}

@Composable
private fun StatCard(label: String, value: String, modifier: Modifier = Modifier, highlight: Boolean = false) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = if (highlight) Color(0xFF362445) else Panel), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = if (highlight) Accent else Color.White)
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
internal fun EmptyState(title: String, description: String, glyph: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.size(58.dp).background(PanelRaised, CircleShape), contentAlignment = Alignment.Center) {
            Text(glyph, style = MaterialTheme.typography.headlineMedium, color = Accent)
        }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(description, color = Muted)
    }
}

@Composable
internal fun ErrorCard(message: String, modifier: Modifier = Modifier) {
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
                Box(Modifier.size(58.dp).background(Accent, RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
                    Text("CF", color = Ink, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                }
                Text("CineFlow", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
                Text("Tus producciones y tu equipo, en un solo lugar.", color = Muted)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") },
                    singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), shape = RoundedCornerShape(14.dp))
                OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), label = { Text("Contraseña") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), shape = RoundedCornerShape(14.dp))
                error?.let { ErrorCard(it) }
                Button(
                    onClick = { submit(email.trim(), password); password = "" },
                    enabled = !busy && email.isNotBlank() && password.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(14.dp),
                ) { Text(if (busy) "Conectando." else "Iniciar sesión") }
                Text("Inicia sesión con la misma cuenta que usas en CineFlow.", color = Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

