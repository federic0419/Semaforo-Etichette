package it.semaforo.etichette;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Piccolo archivio cifrato per segreti (password di Open Food Facts).
 * La chiave AES-256 vive nel Keystore di Android: non si può estrarre dal telefono.
 * I dati cifrati (AES-GCM) stanno nelle preferenze private dell'app.
 */
public class SecureStore {
    private static final String ALIAS = "semaforo_secrets_v1";
    private final SharedPreferences prefs;

    public SecureStore(Context c) { prefs = c.getSharedPreferences("secure_store", Context.MODE_PRIVATE); }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return g.generateKey();
    }

    /** true se il telefono permette la cifratura con il Keystore (Android 6+) */
    @JavascriptInterface
    public boolean available() { return Build.VERSION.SDK_INT >= 23; }

    @JavascriptInterface
    public boolean set(String name, String value) {
        if (Build.VERSION.SDK_INT < 23) return false;
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(value.getBytes("UTF-8"));
            prefs.edit().putString(name, Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)).apply();
            return true;
        } catch (Exception e) { return false; }
    }

    /** restituisce il valore in chiaro, oppure "" se non c'è o non si può decifrare */
    @JavascriptInterface
    public String get(String name) {
        if (Build.VERSION.SDK_INT < 23) return "";
        try {
            String s = prefs.getString(name, null);
            if (s == null) return "";
            String[] p = s.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), "UTF-8");
        } catch (Exception e) { return ""; }
    }

    @JavascriptInterface
    public void remove(String name) { prefs.edit().remove(name).apply(); }
}
