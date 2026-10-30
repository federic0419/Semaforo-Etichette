package it.semaforo.etichette;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.io.File;
import java.io.FileOutputStream;

/** Condivide un'immagine o un file (backup) con le altre app, tramite ShareProvider. */
public class ShareBridge {
    private final Activity act;

    public ShareBridge(Activity a) { act = a; }

    private static String safeName(String n) {
        String s = n == null ? "file" : n.replaceAll("[^A-Za-z0-9._-]", "_");
        if (s.startsWith(".")) s = "_" + s;
        return s.length() > 80 ? s.substring(0, 80) : s;
    }

    private boolean send(final File f, final String mime, final String text, final String title) {
        try {
            final Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(f.getName()));
            act.runOnUiThread(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                if (text != null && text.length() > 0) i.putExtra(Intent.EXTRA_TEXT, text);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent ch = Intent.createChooser(i, title);
                ch.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                act.startActivity(ch);
            }});
            return true;
        } catch (Exception e) { return false; }
    }

    /** pngBase64: immagine PNG in base64 (senza prefisso data:) */
    @JavascriptInterface
    public boolean shareImage(String fileName, String pngBase64, String text) {
        try {
            File f = new File(ShareProvider.dir(act), safeName(fileName));
            FileOutputStream o = new FileOutputStream(f);
            o.write(Base64.decode(pngBase64, Base64.DEFAULT));
            o.close();
            return send(f, "image/png", text, "Condividi il risultato");
        } catch (Exception e) { return false; }
    }

    /** contenuto testuale (es. backup JSON) condiviso come file allegato */
    @JavascriptInterface
    public boolean shareTextFile(String fileName, String content, String mime) {
        try {
            File f = new File(ShareProvider.dir(act), safeName(fileName));
            FileOutputStream o = new FileOutputStream(f);
            o.write(content.getBytes("UTF-8"));
            o.close();
            return send(f, mime == null || mime.length() == 0 ? "application/json" : mime, null, "Salva o invia il backup");
        } catch (Exception e) { return false; }
    }
}
