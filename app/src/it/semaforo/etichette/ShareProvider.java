package it.semaforo.etichette;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/** Espone in sola lettura i file della cartella cache/share, per condividerli con altre app. */
public class ShareProvider extends ContentProvider {
    public static final String AUTHORITY = "it.semaforo.etichette.share";

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "share");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        if (name == null || name.contains("/") || name.startsWith(".")) throw new FileNotFoundException();
        File f = new File(dir(getContext()), name);
        if (!f.isFile()) throw new FileNotFoundException();
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public String getType(Uri uri) {
        String n = uri.getLastPathSegment();
        if (n != null && n.endsWith(".png")) return "image/png";
        if (n != null && n.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("sola lettura");
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        try {
            File f = fileFor(uri);
            MatrixCursor c = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            c.addRow(new Object[]{f.getName(), f.length()});
            return c;
        } catch (Exception e) { return null; }
    }

    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
