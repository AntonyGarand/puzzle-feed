package dev.garand.puzzle.foss;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BundleUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        // Back button: close an open sheet, else go back a page (the app routes by path, so every
        // tab and game is a history entry), else leave the app like any other.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web == null) {
                    leave();
                    return;
                }
                web.evaluateJavascript("!!(window.__onBack && window.__onBack())", (handled) -> {
                    if ("true".equals(handled)) return;
                    if (web.canGoBack()) web.goBack();
                    else leave();
                });
            }

            private void leave() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
