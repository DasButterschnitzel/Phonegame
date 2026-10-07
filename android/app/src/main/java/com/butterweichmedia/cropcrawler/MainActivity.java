package com.butterweichmedia.cropcrawler;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Draw behind system bars; the web layer reads safe-area insets (SystemBars insetsHandling: 'css').
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
