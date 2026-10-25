package com.satwik.dualdash;

import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * System-UI hook (SPEC M1-O6): DualDash is a driving HUD, so the status bar
 * and the gesture/navigation bar stay hidden while the app is in the
 * foreground — in BOTH modes. A swipe from the screen edge reveals the bars
 * transiently and they auto-hide again
 * (BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE), so the driver is never trapped
 * behind a bar.
 *
 * Why a native hook: no maintained Capacitor plugin sets the transient-reveal
 * behavior flag. Capacitor 8's bundled SystemBars.hide() and the Capawesome
 * navigation-bar plugin both call hide() only (verified in their Android
 * sources), and @capacitor-community/navigation-bar — the plugin this app
 * would otherwise use — was removed from npm and GitHub. Full decision and
 * source links: docs/SPEC.md, decision M1-O6.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enterImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-assert after the notification shade, permission dialogs or an app
        // switch: some OEM builds re-show the bars when focus comes back.
        // Transient bars never steal window focus, so this cannot interrupt a
        // swipe reveal that is already in progress.
        if (hasFocus) {
            enterImmersive();
        }
    }

    private void enterImmersive() {
        Window window = getWindow();
        // Edge-to-edge: content draws behind the (hidden) bars so the black
        // canvas reaches every pixel. Android 15+ enforces this for targetSdk
        // 36; on Android 10-14 this opts in explicitly.
        WindowCompat.setDecorFitsSystemWindows(window, false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        // Configure the reveal BEFORE hiding: on Android 10 (API 29) the
        // behavior flag maps to SYSTEM_UI_FLAG_IMMERSIVE_STICKY while hide()
        // sets SYSTEM_UI_FLAG_FULLSCREEN/HIDE_NAVIGATION — independent flags,
        // but configuring first keeps the intent obvious on every API level.
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
