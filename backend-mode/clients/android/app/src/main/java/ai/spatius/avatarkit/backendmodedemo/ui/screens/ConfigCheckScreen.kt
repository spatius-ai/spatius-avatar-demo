package ai.spatius.avatarkit.backendmodedemo.ui.screens

import ai.spatius.avatarkit.backendmodedemo.BuildConfig
import ai.spatius.avatarkit.backendmodedemo.R
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

private data class ServerCheckResult(
    val reachable: Boolean,
    val allConfigured: Boolean,
    val missing: List<String>,
    val appId: String,
    val region: String,
    val error: String?,
)

@Composable
fun ConfigCheckScreen(
    onReady: (appId: String, region: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val backendUrl = BuildConfig.BACKEND_MODE_URL
    val clientReady = backendUrl.isNotBlank()

    var serverResult by remember { mutableStateOf<ServerCheckResult?>(null) }
    var checking by remember { mutableStateOf(true) }
    var checkTrigger by remember { mutableStateOf(0) }

    LaunchedEffect(checkTrigger) {
        if (!clientReady) {
            serverResult = ServerCheckResult(
                reachable = false, allConfigured = false, missing = emptyList(),
                appId = "", region = "", error = "BACKEND_MODE_URL not configured",
            )
            checking = false
            return@LaunchedEffect
        }
        checking = true
        serverResult = null
        try {
            val result = withContext(Dispatchers.IO) { checkServer(backendUrl) }
            serverResult = result
        } catch (e: Exception) {
            serverResult = ServerCheckResult(
                reachable = false, allConfigured = false, missing = emptyList(),
                appId = "", region = "", error = e.message,
            )
        }
        checking = false
    }

    val allReady = serverResult?.let { it.reachable && it.allConfigured } == true

    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
    ) {
        Text("Configuration Check", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(4.dp))
        Text(
            "Run start.sh to auto-configure, or edit local.properties (client) and .env (server) manually.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))

        // Guide image
        Image(
            painter = painterResource(R.drawable.api_key_guide),
            contentDescription = "API Key Guide",
            contentScale = ContentScale.FillWidth,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .clickable {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://app.spatius.ai"))
                    )
                },
        )

        // --- Client ---
        Spacer(Modifier.height(20.dp))
        Text("Client", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        ConfigRow(
            name = "BACKEND_MODE_URL",
            value = backendUrl.ifBlank { "(not set)" },
            isConfigured = clientReady,
            hint = "Set BACKEND_MODE_URL in local.properties, e.g. http://192.168.1.100:8765",
        )

        HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

        // --- Server ---
        Text("Server", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))

        if (checking) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                Text("Checking server...", style = MaterialTheme.typography.bodySmall)
            }
        } else {
            val result = serverResult
            if (result == null || !result.reachable) {
                Text(
                    "\u274C  Cannot reach server",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                result?.error?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    if (!clientReady) "Configure BACKEND_MODE_URL first."
                    else "Start the backend: cd servers/python && uv run uvicorn app.main:app",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (!result.allConfigured) {
                Text(
                    "\u274C  Server is reachable but missing configuration:",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.height(4.dp))
                result.missing.forEach { name ->
                    Text(
                        "    \u2022 $name",
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "Edit servers/python/.env and restart the backend.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    "\u2705  Server is ready",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFF4CAF50),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "App ID: ${result.appId}",
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "Region: ${result.region}",
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(
                onClick = { checkTrigger++ },
                enabled = !checking,
                modifier = Modifier.weight(1f),
            ) {
                Text("Recheck")
            }
            Button(
                onClick = { serverResult?.let { onReady(it.appId, it.region) } },
                enabled = allReady,
                modifier = Modifier.weight(1f),
            ) {
                Text("Start")
            }
        }
    }
}

@Composable
private fun ConfigRow(
    name: String,
    value: String,
    isConfigured: Boolean,
    hint: String,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(name, style = MaterialTheme.typography.labelLarge)
            Text(if (isConfigured) "\u2705" else "\u274C")
        }
        Text(
            value,
            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
            color = if (isConfigured) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error,
        )
        if (!isConfigured) {
            Text(
                hint,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private val httpClient = OkHttpClient.Builder()
    .connectTimeout(5, TimeUnit.SECONDS)
    .readTimeout(5, TimeUnit.SECONDS)
    .build()

private fun checkServer(backendUrl: String): ServerCheckResult {
    val httpBase = backendUrl
        .replace("ws://", "http://")
        .replace("wss://", "https://")
        .removeSuffix("/ws/agent")
        .trimEnd('/')

    // 1. Check /healthz for missing env vars
    val healthReq = Request.Builder().url("$httpBase/healthz").build()
    val healthResp = httpClient.newCall(healthReq).execute()
    val healthBody = healthResp.body?.string() ?: throw Exception("Empty response from /healthz")
    val healthJson = JSONObject(healthBody)
    val ok = healthJson.optBoolean("ok", false)
    val missingArr = healthJson.optJSONArray("missing")
    val missing = if (missingArr != null) {
        (0 until missingArr.length()).map { missingArr.getString(it) }
    } else {
        emptyList()
    }

    if (!ok) {
        return ServerCheckResult(
            reachable = true, allConfigured = false, missing = missing,
            appId = "", region = "", error = null,
        )
    }

    // 2. Fetch /api/config for appId and region
    val configReq = Request.Builder().url("$httpBase/api/config").build()
    val configResp = httpClient.newCall(configReq).execute()
    val configBody = configResp.body?.string() ?: throw Exception("Empty response from /api/config")
    val configJson = JSONObject(configBody)
    val appId = configJson.optString("appId", "")
    val region = configJson.optString("region", "us-west")

    return ServerCheckResult(
        reachable = true, allConfigured = true, missing = emptyList(),
        appId = appId, region = region, error = null,
    )
}
