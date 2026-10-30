package it.semaforo.etichette;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.InputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String BASE = "https://" + HOST + "/";
    private static final int REQ_CAMERA = 7;
    private static final int REQ_FILE = 8;
    private static final int BAR = Color.parseColor("#1d4e5f");
    private android.webkit.ValueCallback<Uri[]> fileCb;

    private WebView web;
    private PermissionRequest pending;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        if (Build.VERSION.SDK_INT >= 21) getWindow().setStatusBarColor(BAR);

        // Contenitore: su Android 15+ l'app disegna sotto le barre di sistema (edge-to-edge),
        // quindi lascio spazio per barra di stato, barra di navigazione e tastiera.
        final FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BAR);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
                @SuppressWarnings("deprecation")
                public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                    // le "system window insets" comprendono barre di sistema e tastiera
                    v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(),
                            in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                    return in.consumeSystemWindowInsets();
                }
            });
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        web.addJavascriptInterface(new OffBridge(web), "OffBridge");
        web.addJavascriptInterface(new SecureStore(this), "SecureStore");
        web.addJavascriptInterface(new ShareBridge(this), "ShareBridge");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    Map<String, String> h = new HashMap<String, String>();
                    h.put("Access-Control-Allow-Origin", "*");
                    h.put("Cache-Control", "no-cache");
                    return new WebResourceResponse(mime(path), null, 200, "OK", h, in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                            new HashMap<String, String>(), null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                boolean images = true;
                String[] acc = params != null ? params.getAcceptTypes() : null;
                if (acc != null) for (String a : acc) if (a != null && (a.contains("json") || a.contains("text"))) images = false;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                if (images) i.setType("image/*");
                else {
                    i.setType("*/*");
                    i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                }
                try {
                    startActivityForResult(Intent.createChooser(i, images ? "Scegli la foto dell'etichetta" : "Scegli il file di backup"), REQ_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    cb.onReceiveValue(null);
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        if (hasCamera()) {
                            request.grant(request.getResources());
                        } else {
                            pending = request;
                            if (Build.VERSION.SDK_INT >= 23) {
                                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                            } else {
                                request.grant(request.getResources());
                            }
                        }
                    }
                });
            }
        });

        registerPredictiveBack();

        if (state != null) web.restoreState(state);
        else web.loadUrl(BASE + "index.html");
    }

    // Android 16 (target 36): il tasto/gesto indietro arriva tramite OnBackInvokedCallback.
    // Registrato per riflessione per non dipendere da librerie esterne; su Android 13-15 resta onBackPressed.
    private void registerPredictiveBack() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            final Class<?> cbIface = Class.forName("android.window.OnBackInvokedCallback");
            Object cb = Proxy.newProxyInstance(getClassLoader(), new Class<?>[]{cbIface}, new InvocationHandler() {
                public Object invoke(Object proxy, Method m, Object[] args) {
                    String n = m.getName();
                    if ("onBackInvoked".equals(n)) { runOnUiThread(new Runnable() { public void run() { handleBack(); } }); return null; }
                    if ("hashCode".equals(n)) return System.identityHashCode(proxy);
                    if ("equals".equals(n)) return proxy == args[0];
                    if ("toString".equals(n)) return "SemaforoBack";
                    return null;
                }
            });
            Object dispatcher = Activity.class.getMethod("getOnBackInvokedDispatcher").invoke(this);
            Class<?> dispIface = Class.forName("android.window.OnBackInvokedDispatcher");
            dispIface.getMethod("registerOnBackInvokedCallback", int.class, cbIface).invoke(dispatcher, 0, cb);
        } catch (Throwable ignored) {}
    }

    private void handleBack() {
        web.evaluateJavascript("window.__back && window.__back()", new android.webkit.ValueCallback<String>() {
            public void onReceiveValue(String v) {
                if (!"true".equals(v)) {
                    if (web.canGoBack()) web.goBack(); else finish();
                }
            }
        });
    }

    private boolean hasCamera() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE) {
            if (fileCb != null) {
                Uri[] r = null;
                if (result == RESULT_OK && data != null) {
                    if (data.getData() != null) r = new Uri[]{data.getData()};
                    else if (data.getClipData() != null && data.getClipData().getItemCount() > 0)
                        r = new Uri[]{data.getClipData().getItemAt(0).getUri()};
                }
                fileCb.onReceiveValue(r);
                fileCb = null;
            }
            return;
        }
        super.onActivityResult(code, result, data);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != REQ_CAMERA || pending == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pending.grant(pending.getResources());
        } else {
            pending.deny();
        }
        pending = null;
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".txt")) return "text/plain";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() { handleBack(); }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.__pause && window.__pause()", null);
    }
}
