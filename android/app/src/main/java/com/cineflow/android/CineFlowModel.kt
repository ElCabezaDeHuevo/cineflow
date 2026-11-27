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
    }

    fun refresh() = runOperation { loadProjects() }

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
        loaded = true
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
        val url = URL("https://cineflow-5w7b.vercel.app/api/android/$path")
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
