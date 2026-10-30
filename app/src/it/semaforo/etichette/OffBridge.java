package it.semaforo.etichette;

import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Iterator;

/**
 * Invio dei dati a Open Food Facts dal lato nativo (niente blocchi CORS del WebView).
 * Accetta solo indirizzi di Open Food Facts. Le risposte tornano alla pagina con window.__offCb(id, status, body).
 */
public class OffBridge {
    private static final String UA = "SemaforoEtichette/1.8 (Android)";
    private final WebView web;

    public OffBridge(WebView web) { this.web = web; }

    private static boolean allowed(String url) {
        return url.startsWith("https://world.openfoodfacts.org/") || url.startsWith("https://world.openfoodfacts.net/");
    }

    private void reply(final String id, final int status, final String body) {
        final String js = "window.__offCb && window.__offCb(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body == null ? "" : body) + ")";
        web.post(new Runnable() { public void run() { web.evaluateJavascript(js, null); } });
    }

    private static String readAll(HttpURLConnection c) throws Exception {
        InputStream in;
        try { in = c.getInputStream(); } catch (Exception e) { in = c.getErrorStream(); }
        if (in == null) return "";
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    /** POST application/x-www-form-urlencoded; fields: oggetto JSON piatto di stringhe */
    @JavascriptInterface
    public void post(final String id, final String url, final String fieldsJson) {
        new Thread(new Runnable() { public void run() {
            HttpURLConnection c = null;
            try {
                if (!allowed(url)) { reply(id, -2, "indirizzo non permesso"); return; }
                JSONObject f = new JSONObject(fieldsJson);
                StringBuilder sb = new StringBuilder();
                Iterator<String> it = f.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    if (sb.length() > 0) sb.append('&');
                    sb.append(URLEncoder.encode(k, "UTF-8")).append('=').append(URLEncoder.encode(f.optString(k), "UTF-8"));
                }
                byte[] data = sb.toString().getBytes("UTF-8");
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000); c.setReadTimeout(30000);
                c.setRequestMethod("POST"); c.setDoOutput(true);
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                c.setFixedLengthStreamingMode(data.length);
                OutputStream o = c.getOutputStream(); o.write(data); o.close();
                int code = c.getResponseCode();
                reply(id, code, readAll(c));
            } catch (Exception e) {
                reply(id, -1, String.valueOf(e.getMessage()));
            } finally { if (c != null) c.disconnect(); }
        }}).start();
    }

    /** POST multipart con un'immagine JPEG (base64) nel campo fileField */
    @JavascriptInterface
    public void upload(final String id, final String url, final String fieldsJson, final String fileField, final String jpegBase64) {
        new Thread(new Runnable() { public void run() {
            HttpURLConnection c = null;
            try {
                if (!allowed(url)) { reply(id, -2, "indirizzo non permesso"); return; }
                String bnd = "----semaforo" + System.currentTimeMillis();
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                JSONObject f = new JSONObject(fieldsJson);
                Iterator<String> it = f.keys();
                while (it.hasNext()) {
                    String k = it.next();
                    body.write(("--" + bnd + "\r\nContent-Disposition: form-data; name=\"" + k + "\"\r\n\r\n" + f.optString(k) + "\r\n").getBytes("UTF-8"));
                }
                byte[] img = Base64.decode(jpegBase64, Base64.DEFAULT);
                body.write(("--" + bnd + "\r\nContent-Disposition: form-data; name=\"" + fileField + "\"; filename=\"etichetta.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n").getBytes("UTF-8"));
                body.write(img);
                body.write(("\r\n--" + bnd + "--\r\n").getBytes("UTF-8"));
                byte[] data = body.toByteArray();
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000); c.setReadTimeout(60000);
                c.setRequestMethod("POST"); c.setDoOutput(true);
                c.setRequestProperty("User-Agent", UA);
                c.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + bnd);
                c.setFixedLengthStreamingMode(data.length);
                OutputStream o = c.getOutputStream(); o.write(data); o.close();
                int code = c.getResponseCode();
                reply(id, code, readAll(c));
            } catch (Exception e) {
                reply(id, -1, String.valueOf(e.getMessage()));
            } finally { if (c != null) c.disconnect(); }
        }}).start();
    }
}
