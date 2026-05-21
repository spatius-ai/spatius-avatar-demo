package ai.spatius.avatarkit.backendmodedemo

import ai.spatius.avatarkit.backendmodedemo.ui.screens.ConfigCheckScreen
import ai.spatius.avatarkit.backendmodedemo.ui.screens.PlaygroundScreen
import ai.spatius.avatarkit.backendmodedemo.ui.theme.AvatarKitBackendModeDemoTheme
import ai.spatius.avatarkit.backendmodedemo.viewmodel.AvatarViewModel
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController

class MainActivity : ComponentActivity() {

    private val viewModel: AvatarViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AvatarKitBackendModeDemoTheme {
                val navController = rememberNavController()
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    NavHost(
                        navController = navController,
                        startDestination = "config_check",
                        modifier = Modifier.padding(innerPadding),
                    ) {
                        composable("config_check") {
                            ConfigCheckScreen(
                                onReady = { appId, region ->
                                    viewModel.initialize(appId, region)
                                    navController.navigate("playground") {
                                        popUpTo("config_check") { inclusive = true }
                                    }
                                },
                            )
                        }
                        composable("playground") {
                            PlaygroundScreen(viewModel = viewModel)
                        }
                    }
                }
            }
        }
    }
}
