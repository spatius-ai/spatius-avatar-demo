plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val localProperties = java.util.Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use(::load)
    }
}

fun localString(key: String, defaultValue: String = ""): String {
    return localProperties.getProperty(key, defaultValue)
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
}

fun localBoolean(key: String, defaultValue: String = "false"): String {
    return localProperties.getProperty(key, defaultValue).toBooleanStrictOrNull()?.toString() ?: defaultValue
}

fun localInt(key: String, defaultValue: String): String {
    return localProperties.getProperty(key, defaultValue).toIntOrNull()?.toString() ?: defaultValue
}

fun localFloat(key: String, defaultValue: String): String {
    return "${localProperties.getProperty(key, defaultValue).toFloatOrNull() ?: defaultValue.toFloat()}f"
}

android {
    namespace = "ai.spatius.avatarkit.directmodedemo"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = "ai.spatius.avatarkit.directmodedemo"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "SPATIUS_APP_ID", "\"${localString("SPATIUS_APP_ID")}\"")
        buildConfigField("String", "SPATIUS_AVATAR_ID", "\"${localString("SPATIUS_AVATAR_ID")}\"")
        buildConfigField("String", "SPATIUS_REGION", "\"${localString("SPATIUS_REGION", "us-west")}\"")
        buildConfigField("String", "OPENAI_API_KEY", "\"${localString("OPENAI_API_KEY")}\"")
        buildConfigField("String", "OPENAI_BASE_URL", "\"${localString("OPENAI_BASE_URL", "https://api.openai.com")}\"")
        buildConfigField("boolean", "OPENAI_USE_PROXY", localBoolean("OPENAI_USE_PROXY"))
        buildConfigField("String", "OPENAI_PROXY_BASE_URL", "\"${localString("OPENAI_PROXY_BASE_URL", "http://10.0.2.2:8090")}\"")
        buildConfigField("String", "OPENAI_MODEL", "\"${localString("OPENAI_MODEL", "gpt-4o-mini")}\"")
        buildConfigField("String", "OPENAI_STT_MODEL", "\"${localString("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe")}\"")
        buildConfigField("String", "OPENAI_STT_LANGUAGE", "\"${localString("OPENAI_STT_LANGUAGE", "en")}\"")
        buildConfigField("String", "OPENAI_TTS_MODEL", "\"${localString("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")}\"")
        buildConfigField("String", "OPENAI_TTS_VOICE", "\"${localString("OPENAI_TTS_VOICE", "alloy")}\"")
        buildConfigField("float", "VAD_START_THRESHOLD", localFloat("VAD_START_THRESHOLD", "0.03"))
        buildConfigField("float", "VAD_STOP_THRESHOLD", localFloat("VAD_STOP_THRESHOLD", "0.02"))
        buildConfigField("int", "VAD_SILENCE_MS", localInt("VAD_SILENCE_MS", "700"))
        buildConfigField("int", "VAD_MIN_SPEECH_MS", localInt("VAD_MIN_SPEECH_MS", "280"))
        buildConfigField("int", "VAD_MAX_SPEECH_MS", localInt("VAD_MAX_SPEECH_MS", "8000"))
        buildConfigField("int", "MIC_SAMPLE_RATE", localInt("MIC_SAMPLE_RATE", "16000"))
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.avatarkit)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.androidx.navigation.compose)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11)
    }
}
