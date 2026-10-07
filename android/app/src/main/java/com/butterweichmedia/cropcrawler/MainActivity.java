package com.butterweichmedia.cropcrawler;

import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    private int renderCrashes = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Draw behind system bars; the web layer reads safe-area insets (SystemBars insetsHandling: 'css').
        // Only after super.onCreate: EdgeToEdge touches the window decor, and creating the decor before
        // BridgeActivity applies AppTheme.NoActionBar builds the window with the launch theme.
        EdgeToEdge.enable(this);
        if (bridge == null) return;
        // If the WebView's renderer dies (low memory, GPU driver crash) Android would otherwise kill the app or
        // leave a blank green screen: restart once, then explain.
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    renderCrashes++;
                    if (renderCrashes <= 1) {
                        recreate();
                        return true;
                    }
                    String why = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail != null && detail.didCrash()
                        ? "crashed"
                        : "ran out of memory";
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Crop Crawler")
                        .setMessage(
                            "The game's graphics engine " +
                                why +
                                ". Please update \"Android System WebView\" and \"Chrome\" in the Play Store, then restart."
                        )
                        .setCancelable(false)
                        .setPositiveButton("Restart", (d, w) -> recreate())
                        .show();
                    return true;
                }
            }
        );
    }
}
