package com.cineflow.android

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

data class Project(val id: String, val name: String, val type: String, val stage: String, val role: String?, val pending: String?)
data class Review(val id: String, val kind: String, val project: String, val person: String)
data class Organization(val id: String, val name: String)
data class WorkSession(val id: String, val clockIn: String, val clockOut: String?, val note: String, val deleted: Boolean)
data class TeamProject(val id: String, val name: String, val role: String)
data class TeamMember(
    val id: String,
    val organizationName: String,
    val companyRole: String,
    val name: String,
    val bio: String,
    val cinematicRole: String?,
    val cinematicRoleStatus: String?,
    val projects: List<TeamProject>,
)
data class CalendarEvent(val id: String, val date: String, val type: String, val title: String, val detail: String, val projectId: String?)

class CineFlowModel : ViewModel() {
    var signedIn by mutableStateOf(false)
        private set
    var busy by mutableStateOf(false)
        private set
    var loaded by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var projects by mutableStateOf(emptyList<Project>())
        private set
    var inbox by mutableStateOf(emptyList<Review>())
        private set
    var organizations by mutableStateOf(emptyList<Organization>())
        private set
    var workSessions by mutableStateOf(emptyList<WorkSession>())
        private set
    var teamMembers by mutableStateOf(emptyList<TeamMember>())
        private set
    var calendarEvents by mutableStateOf(emptyList<CalendarEvent>())
        private set
    var openProjectId by mutableStateOf<String?>(null)
        private set
    var tracking by mutableStateOf<JSONObject?>(null)
        private set

    private var token: String? = null
    private var operation: Job? = null

    fun signIn(email: String, password: String) = runOperation(showProgress = true) {
        val response = call("session", body = JSONObject().put("email", email).put("password", password))
        token = response.getString("token")
        signedIn = true
    }

    fun signOut() {
        operation?.cancel()
        token = null
        signedIn = false
        busy = false
        loaded = false
        error = null
        projects = emptyList()
        inbox = emptyList()
        organizations = emptyList()
        workSessions = emptyList()
        teamMembers = emptyList()
        calendarEvents = emptyList()
        closeProject()
    }

    fun refresh() = runOperation {
        val id = openProjectId
        if (id == null) {
            loadProjects()
            loadAttendance()
            loadTeam()
        } else loadTracking(id)
    }

    fun clockIn() = runOperation(showProgress = true, replaceRefresh = true) {
        val credential = token ?: return@runOperation
        call("attendance", credential, JSONObject().put("action", "clock-in"))
        loadAttendance()
    }

    fun clockOut(id: String, note: String) = runOperation(showProgress = true, replaceRefresh = true) {
        val credential = token ?: return@runOperation
        call("attendance", credential, JSONObject().put("action", "clock-out").put("id", id).put("note", note))
        loadAttendance()
    }

    fun refreshCalendar() = runOperation(showProgress = true, replaceRefresh = true) { loadCalendar() }

    fun openProject(id: String) {
        openProjectId = id
        tracking = null
        runOperation(showProgress = true, replaceRefresh = true) { loadTracking(id) }
    }

    fun closeProject() {
        openProjectId = null
        tracking = null
    }

    fun sendMessage(message: String, onSent: () -> Unit) =
        runOperation(showProgress = true, replaceRefresh = true) {
            val id = openProjectId ?: return@runOperation
            val credential = token ?: return@runOperation
            call("project", credential, JSONObject().put("id", id).put("message", message))
            onSent()
            loadTracking(id)
        }

    fun saveProject(id: String, name: String, description: String, saved: () -> Unit) =
        runOperation(showProgress = true, replaceRefresh = true) {
            val credential = token ?: return@runOperation
            if (openProjectId != id || name.isBlank()) return@runOperation
            val current = tracking ?: return@runOperation
            call("projects", credential, JSONObject()
                .put("action", "update").put("id", id)
                .put("name", name.trim()).put("description", description.trim())
                .put("type", current.optString("type"))
                .put("stage", current.optString("stage"))
                .put("owner_role", current.optString("owner_role", "Producción"))
                .put("start_date", current.optString("start_date"))
                .put("delivery_date", current.optString("delivery_date")))
            saved()
            loadProjects()
            loadTracking(id)
        }

    fun createProject(
        organizationId: String,
        name: String,
        type: String,
        stage: String,
        ownerRole: String,
        startDate: String,
        deliveryDate: String,
        description: String,
        created: () -> Unit,
    ) = runOperation(showProgress = true, replaceRefresh = true) {
        val credential = token ?: return@runOperation
        call("projects", credential, JSONObject()
            .put("action", "create").put("organization_id", organizationId)
            .put("name", name.trim()).put("type", type.trim()).put("stage", stage.trim())
            .put("owner_role", ownerRole.trim()).put("start_date", startDate.trim())
            .put("delivery_date", deliveryDate.trim()).put("description", description.trim()))
        created()
        loadProjects()
    }

    private suspend fun loadTracking(id: String) {
        val credential = token ?: return
        val response = try {
            call("project?id=$id", credential)
        } catch (exception: ApiException) {
            if (exception.status == 403 && openProjectId == id) {
                closeProject()
                loadProjects()
            }
            throw exception
        }
        if (openProjectId == id) tracking = response
    }

    fun act(id: String, kind: String, action: String) = runOperation(showProgress = true, replaceRefresh = true) {
        val credential = token ?: return@runOperation
        call("projects", credential, JSONObject().put("id", id).put("kind", kind).put("action", action))
        loadProjects()
    }

    private suspend fun loadProjects() {
        val credential = token ?: return
        val response = call("projects", credential)
        projects = response.getJSONArray("projects").objects { row ->
            Project(row.getString("id"), row.getString("name"), row.getString("type"), row.getString("stage"),
                row.nullableString("role"), row.nullableString("pending"))
        }
        inbox = response.getJSONArray("inbox").objects { row ->
            Review(row.getString("id"), row.getString("kind"), row.getString("project"), row.getString("person"))
        }
        val companyRows = response.optJSONArray("organizations") ?: JSONArray()
        organizations = companyRows.objects { row -> Organization(row.getString("id"), row.getString("name")) }
        loaded = true
    }

    private suspend fun loadAttendance() {
        val credential = token ?: return
        val response = call("attendance", credential)
        workSessions = response.getJSONArray("sessions").objects { row ->
            WorkSession(
                id = row.getString("id"),
                clockIn = row.getString("clock_in"),
                clockOut = row.nullableString("clock_out"),
                note = row.optString("note").takeUnless { it == "null" }.orEmpty(),
                deleted = !row.isNull("deleted_at"),
            )
        }
    }

    private suspend fun loadTeam() {
        val credential = token ?: return
        val response = call("team", credential)
        teamMembers = response.getJSONArray("members").objects { row ->
            val projects = row.optJSONArray("projects") ?: JSONArray()
            TeamMember(
                id = row.getString("id"),
                organizationName = row.optString("organizationName", "Productora"),
                companyRole = row.optString("companyRole", "member"),
                name = row.optString("name", "Integrante"),
                bio = row.optString("bio").takeUnless { it == "null" }.orEmpty(),
                cinematicRole = row.nullableString("cinematicRole"),
                cinematicRoleStatus = row.nullableString("cinematicRoleStatus"),
                projects = projects.objects { project -> TeamProject(project.getString("id"), project.getString("name"), project.getString("role")) },
            )
        }
    }

    private suspend fun loadCalendar() {
        val credential = token ?: return
        val response = call("calendar", credential)
        calendarEvents = response.getJSONArray("events").objects { row ->
            CalendarEvent(row.getString("id"), row.getString("date"), row.getString("type"), row.getString("title"), row.optString("detail"), row.nullableString("projectId"))
        }
    }

    private fun runOperation(showProgress: Boolean = false, replaceRefresh: Boolean = false, block: suspend () -> Unit) {
        if (operation?.isActive == true) {
            if (!replaceRefresh || busy) return
            operation?.cancel()
        }
        operation = viewModelScope.launch {
            busy = showProgress
            try {
                block()
                error = null
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: ApiException) {
                if (exception.status == 401 && signedIn) {
                    token = null
                    signedIn = false
                    loaded = false
                    projects = emptyList()
                    inbox = emptyList()
                    closeProject()
                }
                error = exception.message
            } catch (_: Exception) {
                error = "No se pudo conectar con CineFlow. Revisa tu conexión e inténtalo de nuevo."
            } finally {
                if (showProgress) busy = false
            }
        }
    }
}

private class ApiException(val status: Int, message: String) : IOException(message)

private fun JSONObject.nullableString(key: String): String? = if (isNull(key)) null else getString(key)

private fun <T> JSONArray.objects(transform: (JSONObject) -> T): List<T> =
    List(length()) { index -> transform(getJSONObject(index)) }

private suspend fun call(path: String, token: String? = null, body: JSONObject? = null): JSONObject =
    withContext(Dispatchers.IO) {
        val url = URL("https://cineflow-git-feature-native-android-complete-cineflow3.vercel.app/api/android/$path")
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            if (status !in 200..299) {
                val message = runCatching { JSONObject(payload ?: "{}").getString("error") }.getOrNull()
                throw ApiException(status, message ?: "CineFlow no pudo completar la solicitud.")
            }
            JSONObject(payload ?: "{}")
        } finally {
            connection.disconnect()
        }
    }



