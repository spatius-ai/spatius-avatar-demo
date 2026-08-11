package ai.spatius.avatarkit.directmodedemo

import ai.spatius.avatarkit.AudioFormat
import ai.spatius.avatarkit.AvatarController
import ai.spatius.avatarkit.AvatarSDK
import ai.spatius.avatarkit.AvatarView
import ai.spatius.avatarkit.Configuration
import ai.spatius.avatarkit.DrivingServiceMode
import ai.spatius.avatarkit.LogLevel
import ai.spatius.avatarkit.assets.AvatarManager
import ai.spatius.avatarkit.player.AnimationPlayer.ConversationState
import ai.spatius.avatarkit.directmodedemo.audio.AUDIO_SOURCE_HINT
import ai.spatius.avatarkit.directmodedemo.audio.PCM_ASSETS
import ai.spatius.avatarkit.directmodedemo.audio.PcmAsset
import ai.spatius.avatarkit.directmodedemo.audio.loadPcmAsset
import ai.spatius.avatarkit.directmodedemo.audio.sendPcmChunks
import kotlinx.coroutines.Job
import ai.spatius.avatarkit.directmodedemo.config.AppConfig
import ai.spatius.avatarkit.directmodedemo.config.ConfigStore
import ai.spatius.avatarkit.directmodedemo.ui.ToastHost
import ai.spatius.avatarkit.directmodedemo.ui.ToastKind
import ai.spatius.avatarkit.directmodedemo.ui.ToastMessage
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

private enum class LoadStatus {
    Idle,
    Loading,
    Ready,
    Error,
}

private enum class RuntimeLogLevel {
    Info,
    Error,
}

class MainActivity : ComponentActivity() {
    private var status by mutableStateOf(LoadStatus.Idle)
    private var errorMsg by mutableStateOf("")
    private var logs by mutableStateOf(emptyList<String>())
    private var isConnectingConversation by mutableStateOf(false)
    private var sessionTokenInput by mutableStateOf("")

    /** Path of the clip currently streaming, or null when idle. */
    private var sendingPath by mutableStateOf<String?>(null)
    private var connected by mutableStateOf(false)

    // Step 1 = configuration, step 2 = playground, mirroring the web demo.
    private var configStep by mutableStateOf(1)
    private var appIdInput by mutableStateOf("")
    private var avatarIdInput by mutableStateOf("")
    private var regionInput by mutableStateOf("auto")
    private var initializing by mutableStateOf(false)
    private var configError by mutableStateOf("")
    private var toast by mutableStateOf<ToastMessage?>(null)
    private var toastSerial = 0L

    private var activeConfig: AppConfig? = null

    private var avatarView: AvatarView? = null
    private var sdkInitialized = false
    private var sendJob: Job? = null

    private val initializedOnce = AtomicBoolean(false)
    private val avatarSpeaking = AtomicBoolean(false)
    private val connectionReady = AtomicBoolean(false)
    private val connecting = AtomicBoolean(false)
    private val disconnectByClient = AtomicBoolean(false)

    private var lastConnectionStateText = ""
    private var lastConversationStateText = ""

    private val sessionTokenDocsUrl =
        "https://docs.spatius.ai/api-reference/api-reference#obtain-a-session-token"

    /** Surfaces a failure in the UI, not just the log panel. */
    private fun showToast(text: String, kind: ToastKind = ToastKind.Error) {
        toast = ToastMessage(text = text, kind = kind, serial = ++toastSerial)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val cached = ConfigStore.load(applicationContext)
        appIdInput = cached.appId
        avatarIdInput = cached.avatarId
        sessionTokenInput = cached.sessionToken
        regionInput = cached.region

        setContent {
            MaterialTheme {
                Box(modifier = Modifier.fillMaxSize()) {
                    if (configStep == 1) {
                        ConfigurationScreen(
                            appId = appIdInput,
                            avatarId = avatarIdInput,
                            sessionToken = sessionTokenInput,
                            region = regionInput,
                            regions = ConfigStore.regions,
                            loading = initializing,
                            errorMsg = configError,
                            sessionTokenDocsUrl = sessionTokenDocsUrl,
                            onAppIdChange = { appIdInput = it },
                            onAvatarIdChange = { avatarIdInput = it },
                            onSessionTokenChange = { sessionTokenInput = it },
                            onRegionChange = { regionInput = it },
                            onInitialize = { initializeSdkFromConfig() },
                        )
                    } else {
                        PlaygroundContent()
                    }

                    ToastHost(
                        message = toast,
                        onDismiss = { toast = null },
                        modifier = Modifier.align(Alignment.TopCenter),
                    )
                }
            }
        }
    }

    @Composable
    private fun PlaygroundContent() {
                SdkModeScreen(
                    status = status,
                    errorMsg = errorMsg,
                    logs = logs,
                    connected = connected,
                    isConnecting = isConnectingConversation,
                    sendingPath = sendingPath,
                    canCreateAvatarView = sdkInitialized,
                    onToggleConnection = { if (connected) disconnect() else connect() },
                    onSendPcm = { asset -> sendPcm(asset) },
                    onInterrupt = { interrupt() },
                    onAvatarViewCreated = { view ->
                        if (avatarView !== view) {
                            avatarView = view
                            if (initializedOnce.compareAndSet(false, true)) {
                                initializeAvatar()
                            }
                        }
                    }
                )
    }

    /**
     * Step 1 submit: initialize with what the user typed, then move to the
     * playground. Nothing is initialized before this point, so the credentials
     * that actually reach the SDK are always the ones on screen.
     */
    private fun initializeSdkFromConfig() {
        val appId = appIdInput.trim()
        val avatarId = avatarIdInput.trim()
        val token = normalizedSessionToken(sessionTokenInput)

        if (appId.isBlank() || avatarId.isBlank() || token.isBlank()) {
            configError = "App ID, Avatar ID and Session Token are required"
            return
        }

        initializing = true
        configError = ""

        runCatching {
            // "auto" leaves `region` at its default so the SDK picks the
            // closest serving region itself; an explicit choice forces it.
            val configuration = if (regionInput == "auto") {
                Configuration(
                    audioFormat = AudioFormat(16000),
                    drivingServiceMode = DrivingServiceMode.DIRECT,
                    logLevel = LogLevel.ALL,
                )
            } else {
                Configuration(
                    region = parseRegion(regionInput),
                    audioFormat = AudioFormat(16000),
                    drivingServiceMode = DrivingServiceMode.DIRECT,
                    logLevel = LogLevel.ALL,
                )
            }
            AvatarSDK.initialize(applicationContext, appId, configuration)
            AvatarManager.initialize(applicationContext)
            AvatarSDK.sessionToken = token
        }.onSuccess {
            sessionTokenInput = token
            sdkInitialized = true
            status = LoadStatus.Idle
            val config = AppConfig(appId, avatarId, token, regionInput)
            activeConfig = config
            ConfigStore.save(applicationContext, config)
            initializing = false
            configStep = 2
        }.onFailure {
            initializing = false
            val msg = it.message ?: it.javaClass.simpleName
            configError = msg
            pushLog("SDK initialization failed: $msg", RuntimeLogLevel.Error)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelSending()
        isConnectingConversation = false
        avatarSpeaking.set(false)
        connectionReady.set(false)
        connecting.set(false)
        teardownAvatarView()
    }

    private fun initializeAvatar() {
        val view = avatarView
        if (view == null) {
            pushLog("AvatarView not created yet")
            return
        }

        val config = activeConfig
        if (config == null) {
            status = LoadStatus.Error
            errorMsg = "SDK is not configured"
            pushLog("Initialization failed: $errorMsg", RuntimeLogLevel.Error)
            return
        }

        lifecycleScope.launch {
            status = LoadStatus.Loading
            errorMsg = ""
            avatarSpeaking.set(false)
            connectionReady.set(false)
            connecting.set(false)
            connected = false
            disconnectByClient.set(false)
            lastConnectionStateText = ""
            lastConversationStateText = ""
            cancelSending()
            pushLog("Initializing Avatar...")
            safeCloseController()

            try {
                if (!AvatarSDK.isDeviceSupported()) {
                    error("Current device does not meet AvatarKit requirements (API24+, Vulkan)")
                }

                val sessionToken = normalizedSessionToken(sessionTokenInput)
                if (sessionToken.isNotEmpty()) {
                    AvatarSDK.sessionToken = sessionToken
                    val current = sessionTokenInput.trim()
                    if (sessionToken != current) {
                        sessionTokenInput = sessionToken
                        pushLog("Removed Bearer prefix from Session Token")
                    }
                    pushLog("Applied manual Session Token")
                }

                // The configuration step is the only path into the playground,
                // so the SDK is always initialized by the time we get here.
                if (!sdkInitialized) {
                    error("SDK is not initialized")
                }

                var lastProgressBucket = -1
                val avatar = withContext(Dispatchers.IO) {
                    AvatarManager.load(config.avatarId) { progress ->
                        if (progress is AvatarManager.LoadProgress.Downloading) {
                            val percent = (progress.progress * 100).toInt().coerceIn(0, 100)
                            val bucket = percent / 20
                            if (bucket != lastProgressBucket) {
                                lastProgressBucket = bucket
                                pushLog("Avatar download progress: $percent%")
                            }
                        }
                    }
                }

                view.init(avatar, lifecycleScope)
                bindControllerCallbacks(view.controller)

                status = LoadStatus.Ready
                pushLog("Avatar is ready. Connection starts when you tap Start Conversation")
            } catch (t: Throwable) {
                status = LoadStatus.Error
                errorMsg = t.message ?: t.javaClass.simpleName
                pushLog("Initialization failed: $errorMsg", RuntimeLogLevel.Error)
                safeCloseController()
            }
        }
    }

    private fun parseRegion(raw: String): String {
        return when (raw.lowercase(Locale.US)) {
            "" -> "us-west"
            else -> raw.lowercase(Locale.US)
        }
    }

    private fun bindControllerCallbacks(controller: AvatarController?) {
        if (controller == null) {
            pushLog("Avatar controller unavailable", RuntimeLogLevel.Error)
            return
        }

        controller.onConnectionState = connectionState@{ state ->
            val stateText = state.toString()
            if (stateText == lastConnectionStateText) return@connectionState
            lastConnectionStateText = stateText

            val normalized = stateText.lowercase(Locale.US)
            when {
                normalized.contains("connecting") -> {
                    connectionReady.set(false)
                    pushLog("Connection state: $stateText (connecting)")
                }

                normalized.contains("disconnected") -> {
                    connecting.set(false)
                    connectionReady.set(false)
                    connected = false
                    isConnectingConversation = false

                    val closedByClient = disconnectByClient.getAndSet(false)
                    if (closedByClient) {
                        pushLog("Connection state: $stateText (closed)")
                    } else {
                        pushLog("Connection state: $stateText (disconnected)", RuntimeLogLevel.Error)
                        if (sendingPath != null) {
                            cancelSending()
                            pushLog("Connection dropped unexpectedly. Sending stopped", RuntimeLogLevel.Error)
                        }
                    }
                }

                normalized.contains("failed") -> {
                    connecting.set(false)
                    connectionReady.set(false)
                    connected = false
                    isConnectingConversation = false
                    disconnectByClient.set(false)
                    cancelSending()
                    pushLog("Connection state: $stateText (failed)", RuntimeLogLevel.Error)
                }

                normalized.contains("connected") -> {
                    disconnectByClient.set(false)
                    connecting.set(false)
                    connectionReady.set(true)
                    connected = true
                    pushLog("Connection state: $stateText (connected)")
                }

                else -> {
                    connecting.set(false)
                    connectionReady.set(false)
                    connected = false
                    pushLog("Connection state: $stateText (unrecognized)", RuntimeLogLevel.Error)
                }
            }
        }

        controller.onConversationState = { state ->
            val stateText = state.toString()
            if (stateText != lastConversationStateText) {
                lastConversationStateText = stateText
                pushLog("Conversation state: $stateText")
            }

            when (state) {
                ConversationState.Playing -> {
                    if (!avatarSpeaking.getAndSet(true)) {
                        pushLog("Avatar started speaking")
                    }
                }

                ConversationState.Idle -> {
                    if (avatarSpeaking.getAndSet(false)) {
                        pushLog("Avatar finished speaking")
                    }
                }

                ConversationState.Paused -> {
                    pushLog("Conversation paused")
                }
            }
        }

        controller.onError = { error ->
            val message = error.message ?: error.toString()
            pushLog("Avatar error: $message", RuntimeLogLevel.Error)

            val normalized = message.lowercase(Locale.US)
            if (normalized.contains("sessiontokeninvalid")) {
                pushLog(
                    "Invalid Session Token: make sure you entered a temporary Session Token (not an API key). $sessionTokenDocsUrl",
                    RuntimeLogLevel.Error,
                )
            }
            if (normalized.contains("sessiontokenexpired")) {
                pushLog("Session Token expired. Generate a new one and retry.", RuntimeLogLevel.Error)
            }
        }
    }

    /** Step one of the playground: bring the Direct Mode session up. */
    private fun connect() {
        if (connected || connecting.get()) return
        if (status != LoadStatus.Ready) {
            pushLog("Avatar is not ready", RuntimeLogLevel.Error)
            return
        }

        lifecycleScope.launch {
            isConnectingConversation = true
            try {
                val controller = avatarView?.controller
                if (controller == null) {
                    pushLog("Avatar controller unavailable", RuntimeLogLevel.Error)
                    return@launch
                }
                if (!ensureConnected(controller)) {
                    pushLog("Connection not ready", RuntimeLogLevel.Error)
                }
            } finally {
                isConnectingConversation = false
            }
        }
    }

    private fun disconnect() {
        cancelSending()
        disconnectByClient.set(true)
        runCatching { avatarView?.controller?.close() }
        connectionReady.set(false)
        connecting.set(false)
        connected = false
        pushLog("Disconnected")
    }

    /** Step two: stream one of the bundled clips to the avatar. */
    private fun sendPcm(asset: PcmAsset) {
        // Direct Mode has no session until connect() runs, so audio sent now
        // would be dropped silently. Say so instead of leaving a dead button.
        if (!connectionReady.get()) {
            showToast("Please click Connect before sending audio.", ToastKind.Warning)
            return
        }
        if (sendingPath != null) return

        val controller = avatarView?.controller
        if (controller == null) {
            pushLog("Avatar controller unavailable", RuntimeLogLevel.Error)
            return
        }

        sendingPath = asset.path
        pushLog("Sending \"${asset.name}\"...")

        sendJob = lifecycleScope.launch {
            val data = runCatching { loadPcmAsset(applicationContext, asset.path) }
                .getOrElse {
                    sendingPath = null
                    pushLog(
                        "Failed to load ${asset.name}: ${it.message ?: it.javaClass.simpleName}",
                        RuntimeLogLevel.Error,
                    )
                    return@launch
                }

            sendPcmChunks(
                scope = lifecycleScope,
                data = data,
                controller = controller,
                onDone = {
                    sendingPath = null
                    pushLog("Finished sending \"${asset.name}\"")
                },
                onError = { t ->
                    sendingPath = null
                    pushLog(
                        "Failed to send audio: ${t.message ?: t.javaClass.simpleName}",
                        RuntimeLogLevel.Error,
                    )
                },
            )
        }
    }

    private fun cancelSending() {
        sendJob?.cancel()
        sendJob = null
        sendingPath = null
    }

    private fun interrupt() {
        cancelSending()
        runCatching { avatarView?.controller?.interrupt() }
        pushLog("Interrupted")
    }

    private suspend fun ensureConnected(controller: AvatarController): Boolean {
        if (connectionReady.get()) return true

        if (connecting.compareAndSet(false, true)) {
            try {
                val sessionToken = normalizedSessionToken(sessionTokenInput)
                if (sessionToken.isEmpty()) {
                    connecting.set(false)
                    pushLog("Please enter Session Token before starting conversation. Link: $sessionTokenDocsUrl", RuntimeLogLevel.Error)
                    return false
                }

                if (sessionToken != sessionTokenInput.trim()) {
                    sessionTokenInput = sessionToken
                    pushLog("Removed Bearer prefix from Session Token")
                }

                AvatarSDK.sessionToken = sessionToken
                disconnectByClient.set(false)
                pushLog("Starting connection...")
                controller.start()
            } catch (t: Throwable) {
                connecting.set(false)
                pushLog("Failed to establish connection: ${t.message ?: t.javaClass.simpleName}", RuntimeLogLevel.Error)
                return false
            }
        }

        val connected = withTimeoutOrNull(15_000) {
            while (!connectionReady.get()) {
                if (!connecting.get()) {
                    return@withTimeoutOrNull false
                }
                delay(100)
            }
            true
        } ?: false

        if (!connected) {
            connecting.set(false)
        }
        return connected
    }

    private fun normalizedSessionToken(value: String): String {
        val trimmed = value.trim()
        return if (trimmed.startsWith("Bearer ", ignoreCase = true)) {
            trimmed.substring(7).trim()
        } else {
            trimmed
        }
    }


    private fun safeCloseController() {
        val controller = avatarView?.controller ?: return
        connectionReady.set(false)
        connecting.set(false)
        disconnectByClient.set(true)
        runCatching { controller.close() }
    }

    private fun teardownAvatarView() {
        val view = avatarView ?: return
        val controller = view.controller

        connectionReady.set(false)
        connecting.set(false)
        disconnectByClient.set(true)

        runCatching { controller?.onConnectionState = null }
        runCatching { controller?.onConversationState = null }
        runCatching { controller?.onError = null }
        runCatching { controller?.close() }

        avatarView = null
    }

    private fun pushLog(value: String, level: RuntimeLogLevel = RuntimeLogLevel.Info) {
        val tag = if (level == RuntimeLogLevel.Error) "[ERROR]" else "[INFO]"
        val line = "${logTimeFormatter.format(Date())} $tag $value"
        val isError = level == RuntimeLogLevel.Error
        if (isError) {
            Log.e(LOG_TAG, line)
        } else {
            Log.i(LOG_TAG, line)
        }
        runOnUiThread {
            logs = listOf(line) + logs.take(79)
            // Every error already funnels through here, so surfacing the toast
            // at this one point keeps the log panel and the toast in step
            // instead of tagging each call site individually.
            if (isError) {
                showToast(value)
            }
        }
    }

    companion object {
        private const val LOG_TAG = "SdkModeDemo"
        private val logTimeFormatter = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    }
}

private object DS {
    val bg = Color(0xFFF5F8FF)
    val panel = Color.White.copy(alpha = 0.88f)
    val panelBorder = Color(0x26354A8A)
    val title = Color(0xFF0B1323)
    val text = Color(0xFF27364F)
    val muted = Color(0xFF5F7598)
    val blue = Color(0xFF2563EB)
    val kicker = Color(0xFF4670C1)

    val chipOkFg = Color(0xFF14632F)
    val chipOkBg = Color(0x2923A64A)
    val chipErrFg = Color(0xFF991B1B)
    val chipErrBg = Color(0x29F04444)
    val chipIdleFg = Color(0xFF54647C)
    val chipIdleBg = Color(0x2963718C)

    val logBorder = Color(0x2E395C92)
    val logErrBorder = Color(0x52DC2626)
    val logErrBg = Color(0xFFFDF2F2)
}

@Composable
private fun StageViewport(
    status: LoadStatus,
    errorMsg: String,
    canCreateAvatarView: Boolean,
    onAvatarViewCreated: (AvatarView) -> Unit,
) {
    val context = LocalContext.current

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(RoundedCornerShape(10.dp))
    ) {
        Image(
            painter = painterResource(id = R.drawable.avatar_bg),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.08f))
        )

        if (canCreateAvatarView) {
            AndroidView(
                factory = {
                    AvatarView(context).also {
                        it.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                        runCatching {
                            val method = it.javaClass.getMethod("setOpaque", java.lang.Boolean::class.java)
                            method.invoke(it, false)
                        }
                        onAvatarViewCreated(it)
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
        }

        val needOverlay = !canCreateAvatarView || status != LoadStatus.Ready
        if (needOverlay) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.22f)),
                contentAlignment = Alignment.Center,
            ) {
                when (status) {
                    LoadStatus.Loading -> {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.height(22.dp),
                                color = Color.White,
                                strokeWidth = 2.dp,
                            )
                            Text(
                                text = "Loading...",
                                color = Color.White,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }

                    LoadStatus.Error -> {
                        Text(
                            text = if (errorMsg.isBlank()) "Initialization failed" else errorMsg,
                            color = Color.White,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                    }

                    LoadStatus.Idle,
                    LoadStatus.Ready,
                    -> {
                        Text(
                            text = "Waiting for Avatar initialization",
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SdkModeScreen(
    status: LoadStatus,
    errorMsg: String,
    logs: List<String>,
    connected: Boolean,
    isConnecting: Boolean,
    sendingPath: String?,
    canCreateAvatarView: Boolean,
    onToggleConnection: () -> Unit,
    onSendPcm: (PcmAsset) -> Unit,
    onInterrupt: () -> Unit,
    onAvatarViewCreated: (AvatarView) -> Unit,
) {
    var showAudioHint by remember { mutableStateOf(false) }

    val connectDisabled = !connected && (status != LoadStatus.Ready || isConnecting)
    val connectButtonText = when {
        connected -> "Disconnect"
        isConnecting -> "Connecting..."
        status == LoadStatus.Loading -> "Loading..."
        status == LoadStatus.Error -> "Initialization failed"
        status == LoadStatus.Idle -> "Not initialized"
        else -> "Connect"
    }

    val chipText = when (status) {
        LoadStatus.Idle -> "Not initialized"
        LoadStatus.Ready -> "Ready"
        LoadStatus.Error -> "Load failed"
        LoadStatus.Loading -> "Loading"
    }
    val chipFg = when (status) {
        LoadStatus.Ready -> DS.chipOkFg
        LoadStatus.Error -> DS.chipErrFg
        LoadStatus.Idle,
        LoadStatus.Loading,
        -> DS.chipIdleFg
    }
    val chipBg = when (status) {
        LoadStatus.Ready -> DS.chipOkBg
        LoadStatus.Error -> DS.chipErrBg
        LoadStatus.Idle,
        LoadStatus.Loading,
        -> DS.chipIdleBg
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DS.bg)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(DS.blue.copy(alpha = 0.20f), Color.Transparent),
                        center = Offset(80f, 120f),
                        radius = 600f,
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color(0x24FB8C2B), Color.Transparent),
                        center = Offset(980f, 80f),
                        radius = 540f,
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "SPATIUS SDK MODE",
                        color = DS.kicker,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = "Avatar Demo",
                        color = DS.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }

                Box(
                    modifier = Modifier
                        .background(chipBg, RoundedCornerShape(999.dp))
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = chipText,
                        color = chipFg,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, DS.panelBorder, RoundedCornerShape(14.dp)),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DS.panel),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(10.dp)
                ) {
                    StageViewport(
                        status = status,
                        errorMsg = errorMsg,
                        canCreateAvatarView = canCreateAvatarView,
                        onAvatarViewCreated = onAvatarViewCreated,
                    )

                    Button(
                        onClick = onToggleConnection,
                        enabled = !connectDisabled,
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            // Solid fills: over the avatar a translucent button
                            // reads as decoration and gets overlooked.
                            containerColor = if (connected) {
                                Color(0xFFD24545)
                            } else {
                                DS.blue
                            },
                            contentColor = Color.White,
                            disabledContainerColor = Color(0xFF7C8AA5),
                            disabledContentColor = Color.White.copy(alpha = 0.85f),
                        ),
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 24.dp)
                            .fillMaxWidth(0.56f),
                    ) {
                        Text(connectButtonText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    }
                }

                if (status == LoadStatus.Error && errorMsg.isNotBlank()) {
                    Text(
                        text = errorMsg,
                        color = DS.chipErrFg,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }

            // Logs and the clip list share the row so neither squeezes the
            // other out: equal width, equal height.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
            Card(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .border(1.dp, DS.panelBorder, RoundedCornerShape(14.dp)),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DS.panel),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = "Send Audio",
                                color = DS.title,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                text = "?",
                                color = DS.muted,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(999.dp))
                                    .border(1.dp, DS.muted, RoundedCornerShape(999.dp))
                                    .clickable { showAudioHint = true }
                                    .padding(horizontal = 5.dp, vertical = 1.dp),
                            )
                        }
                        if (sendingPath != null) {
                            TextButton(onClick = onInterrupt) {
                                Text("Interrupt", color = DS.chipErrFg, fontSize = 12.sp)
                            }
                        }
                    }

                    Text(
                        text = if (connected) {
                            "Tap a clip to stream it to the avatar."
                        } else {
                            "Connect first — Direct Mode has no session until then."
                        },
                        color = DS.muted,
                        style = MaterialTheme.typography.bodySmall,
                    )

                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        items(PCM_ASSETS) { asset ->
                            val isSending = sendingPath == asset.path
                            OutlinedButton(
                                onClick = { onSendPcm(asset) },
                                enabled = sendingPath == null || isSending,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    containerColor = if (isSending) DS.blue else Color.Transparent,
                                    contentColor = if (isSending) Color.White else DS.text,
                                ),
                            ) {
                                Text(
                                    text = if (isSending) "Sending: ${asset.name}" else asset.name,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }

            Card(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .border(1.dp, DS.panelBorder, RoundedCornerShape(14.dp)),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = DS.panel),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = "Runtime Logs",
                        color = DS.title,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                    )

                    if (logs.isEmpty()) {
                        Text(
                            text = "Waiting for actions...",
                            color = DS.muted,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp,
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            items(logs) { line ->
                                val lowerLine = line.lowercase(Locale.US)
                                val isErrorLine = line.contains("[ERROR]") || lowerLine.contains("failed") || lowerLine.contains("error")
                                Text(
                                    text = line,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 10.sp,
                                    color = if (isErrorLine) DS.chipErrFg else DS.text,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(
                                            if (isErrorLine) DS.logErrBg else Color.White.copy(alpha = 0.90f),
                                            RoundedCornerShape(7.dp)
                                        )
                                        .border(
                                            1.dp,
                                            if (isErrorLine) DS.logErrBorder else DS.logBorder,
                                            RoundedCornerShape(7.dp)
                                        )
                                        .padding(horizontal = 8.dp, vertical = 5.dp)
                                )
                            }
                        }
                    }
                }
            }
            }
        }

        if (showAudioHint) {
            AlertDialog(
                onDismissRequest = { showAudioHint = false },
                title = { Text("Sending audio") },
                text = { Text(AUDIO_SOURCE_HINT) },
                confirmButton = {
                    TextButton(onClick = { showAudioHint = false }) { Text("Got it") }
                },
            )
        }
    }
}

@Composable
private fun ConfigurationScreen(
    appId: String,
    avatarId: String,
    sessionToken: String,
    region: String,
    regions: List<String>,
    loading: Boolean,
    errorMsg: String,
    sessionTokenDocsUrl: String,
    onAppIdChange: (String) -> Unit,
    onAvatarIdChange: (String) -> Unit,
    onSessionTokenChange: (String) -> Unit,
    onRegionChange: (String) -> Unit,
    onInitialize: () -> Unit,
) {
    val context = LocalContext.current
    val canInit = appId.isNotBlank() && avatarId.isNotBlank() && sessionToken.isNotBlank()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DS.bg),
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Text(
                    text = "AvatarKit Direct Mode Demo",
                    color = DS.title,
                    fontWeight = FontWeight.Bold,
                    style = MaterialTheme.typography.titleLarge,
                )
            }
            item {
                Text(
                    text = "Drive the avatar with your voice and see lip-sync in action.",
                    color = DS.muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            item {
                ConfigField(
                    label = "App ID *",
                    value = appId,
                    onValueChange = onAppIdChange,
                    placeholder = "app_xxx",
                    hint = "Get your App ID from the Developer Platform",
                )
            }
            item {
                ConfigField(
                    label = "Avatar ID *",
                    value = avatarId,
                    onValueChange = onAvatarIdChange,
                    placeholder = "avatar uuid",
                    hint = "Pick a public avatar from the Avatar Library",
                )
            }
            item {
                ConfigField(
                    label = "Session Token *",
                    value = sessionToken,
                    onValueChange = onSessionTokenChange,
                    placeholder = "Your session token",
                    hint = "Required for server communication in Direct Mode",
                    isPassword = true,
                )
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Region",
                        color = DS.text,
                        fontWeight = FontWeight.SemiBold,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        regions.forEach { r ->
                            val selected = r == region
                            OutlinedButton(
                                onClick = { onRegionChange(r) },
                                colors = ButtonDefaults.outlinedButtonColors(
                                    containerColor = if (selected) DS.blue else Color.Transparent,
                                    contentColor = if (selected) Color.White else DS.text,
                                ),
                            ) {
                                Text(r, fontSize = 12.sp)
                            }
                        }
                    }
                    Text(
                        text = "\"auto\" lets the SDK pick the closest serving region.",
                        color = DS.muted,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            if (errorMsg.isNotBlank()) {
                item {
                    Text(
                        text = errorMsg,
                        color = DS.chipErrFg,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(DS.logErrBg)
                            .padding(10.dp),
                    )
                }
            }

            item {
                Button(
                    onClick = onInitialize,
                    enabled = canInit && !loading,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = DS.blue),
                ) {
                    Text(
                        text = if (loading) "Initializing..." else "Initialize SDK",
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            item {
                TextButton(onClick = {
                    runCatching {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(sessionTokenDocsUrl)))
                    }
                }) {
                    Text("How to obtain a Session Token", color = DS.blue, fontSize = 12.sp)
                }
            }

            item {
                Image(
                    painter = painterResource(id = R.drawable.api_key_guide),
                    contentDescription = "Where to find your App ID and Token",
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp)),
                )
            }

            item {
                Image(
                    painter = painterResource(id = R.drawable.public_avatar_guide),
                    contentDescription = "Where to find a public Avatar ID",
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp)),
                )
            }
        }
    }
}

@Composable
private fun ConfigField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    hint: String,
    isPassword: Boolean = false,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            color = DS.text,
            fontWeight = FontWeight.SemiBold,
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            placeholder = { Text(placeholder, color = DS.muted, fontSize = 13.sp) },
            visualTransformation = if (isPassword) {
                PasswordVisualTransformation()
            } else {
                VisualTransformation.None
            },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = DS.blue,
                unfocusedBorderColor = DS.panelBorder,
            ),
        )
        Text(text = hint, color = DS.muted, style = MaterialTheme.typography.bodySmall)
    }
}
