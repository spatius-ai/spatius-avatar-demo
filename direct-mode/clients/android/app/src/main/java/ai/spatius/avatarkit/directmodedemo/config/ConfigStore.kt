package ai.spatius.avatarkit.directmodedemo.config

import android.content.Context
import ai.spatius.avatarkit.directmodedemo.BuildConfig

/** Credentials collected on the configuration step, mirroring the web demo's AppConfig. */
data class AppConfig(
    val appId: String,
    val avatarId: String,
    val sessionToken: String,
    val region: String,
)

/**
 * Persists what the configuration step collects, so a reinstall-free relaunch
 * lands straight back in the playground.
 *
 * Values from `local.properties` (via BuildConfig) only seed the very first
 * run; once anything is saved here it wins, otherwise editing a field would
 * silently revert on the next launch.
 */
object ConfigStore {
    private const val PREFS = "avatarkit-direct-demo-config"
    private const val KEY_APP_ID = "appId"
    private const val KEY_AVATAR_ID = "avatarId"
    private const val KEY_TOKEN = "sessionToken"
    private const val KEY_REGION = "region"

    val regions = listOf("auto", "us-west", "cn-beijing")

    fun normalizeRegion(value: String?): String =
        if (value != null && value in regions) value else "auto"

    fun load(context: Context): AppConfig {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val hasSaved = prefs.contains(KEY_APP_ID)
        return AppConfig(
            appId = prefs.getString(KEY_APP_ID, null) ?: BuildConfig.SPATIUS_APP_ID,
            avatarId = prefs.getString(KEY_AVATAR_ID, null) ?: BuildConfig.SPATIUS_AVATAR_ID,
            sessionToken = prefs.getString(KEY_TOKEN, null).orEmpty(),
            region = normalizeRegion(
                if (hasSaved) prefs.getString(KEY_REGION, null) else BuildConfig.SPATIUS_REGION
            ),
        )
    }

    fun save(context: Context, config: AppConfig) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_APP_ID, config.appId)
            .putString(KEY_AVATAR_ID, config.avatarId)
            .putString(KEY_TOKEN, config.sessionToken)
            .putString(KEY_REGION, config.region)
            .apply()
    }
}
