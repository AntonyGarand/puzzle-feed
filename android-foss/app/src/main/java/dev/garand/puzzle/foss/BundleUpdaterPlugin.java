package dev.garand.puzzle.foss;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Self-update for the game files (see src/core/update.ts). Downloads a zipped web build, checks its
 * sha256, unpacks it under files/bundles/<sha>/ and points Capacitor's local server at it, through
 * the same "serverBasePath" preference Capacitor reads at startup. Capacitor itself drops that path
 * when a new APK is installed.
 *
 * Rollback: a newly applied bundle stays "pending" until its JS calls confirm(). If the app starts
 * again while a bundle has been pending for a whole launch, the previous files come back.
 */
@CapacitorPlugin(name = "BundleUpdater")
public class BundleUpdaterPlugin extends Plugin {

    private static final String CAP_PREFS = com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME;
    private static final String CAP_PATH = com.getcapacitor.plugin.WebView.CAP_SERVER_PATH;
    private static final String PREFS = "BundleUpdater";

    private SharedPreferences ours() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SharedPreferences caps() {
        return getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE);
    }

    private File bundlesDir() {
        return new File(getContext().getFilesDir(), "bundles");
    }

    /** Runs before Capacitor reads serverBasePath, so a rollback takes effect on this launch. */
    @Override
    public void load() {
        SharedPreferences p = ours();
        String pending = p.getString("pending", null);
        if (pending == null) return;
        if (p.getBoolean("launched", false)) {
            caps().edit().putString(CAP_PATH, p.getString("previous", "")).commit();
            p.edit().clear().commit();
            deleteRecursive(new File(pending));
        } else {
            p.edit().putBoolean("launched", true).commit();
        }
    }

    /** The bundle that is running works: keep it. */
    @PluginMethod
    public void confirm(PluginCall call) {
        ours().edit().clear().apply();
        call.resolve();
    }

    /** download({ url, sha, checksum }) -> { path }. Reuses an already unpacked bundle. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String sha = call.getString("sha");
        String checksum = call.getString("checksum");
        if (url == null || sha == null || checksum == null || !sha.matches("[0-9a-f]{6,40}")) {
            call.reject("url, sha and checksum are required");
            return;
        }
        new Thread(() -> {
            File target = new File(bundlesDir(), sha);
            try {
                if (!new File(target, "index.html").isFile()) fetchAndUnzip(url, checksum, target);
                cleanup(target);
                JSObject ret = new JSObject();
                ret.put("path", target.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                deleteRecursive(target);
                call.reject(e.getMessage(), e);
            }
        }).start();
    }

    /** apply({ path, now }): use the bundle from the next launch, or reload into it right away. */
    @PluginMethod
    public void apply(PluginCall call) {
        String path = call.getString("path");
        if (path == null || !new File(path, "index.html").isFile()) {
            call.reject("not a bundle: " + path);
            return;
        }
        String current = caps().getString(CAP_PATH, "");
        if (!path.equals(current)) {
            ours().edit().putString("pending", path).putString("previous", current).putBoolean("launched", false).commit();
            caps().edit().putString(CAP_PATH, path).commit();
        }
        call.resolve();
        if (Boolean.TRUE.equals(call.getBoolean("now", false))) {
            // Counts as this bundle's launch: the reload below either confirms it or the next start rolls back.
            ours().edit().putBoolean("launched", true).commit();
            getActivity().runOnUiThread(() -> bridge.setServerBasePath(path));
        }
    }

    private void fetchAndUnzip(String url, String checksum, File target) throws Exception {
        File dir = bundlesDir();
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cannot create " + dir);
        File zip = new File(dir, target.getName() + ".zip.part");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        try {
            if (conn.getResponseCode() != 200) throw new IOException("HTTP " + conn.getResponseCode());
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new BufferedInputStream(conn.getInputStream()); OutputStream out = new FileOutputStream(zip)) {
                byte[] buf = new byte[64 * 1024];
                for (int n; (n = in.read(buf)) > 0; ) {
                    digest.update(buf, 0, n);
                    out.write(buf, 0, n);
                }
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format("%02x", b));
            if (!hex.toString().equalsIgnoreCase(checksum)) throw new IOException("checksum mismatch");

            File tmp = new File(dir, target.getName() + ".tmp");
            deleteRecursive(tmp);
            String root = tmp.getCanonicalPath() + File.separator;
            try (ZipInputStream zin = new ZipInputStream(new java.io.FileInputStream(zip))) {
                byte[] buf = new byte[64 * 1024];
                for (ZipEntry e; (e = zin.getNextEntry()) != null; ) {
                    File f = new File(tmp, e.getName());
                    if (!f.getCanonicalPath().startsWith(root)) throw new IOException("bad zip entry " + e.getName());
                    if (e.isDirectory()) {
                        f.mkdirs();
                        continue;
                    }
                    f.getParentFile().mkdirs();
                    try (OutputStream out = new FileOutputStream(f)) {
                        for (int n; (n = zin.read(buf)) > 0; ) out.write(buf, 0, n);
                    }
                }
            }
            if (!new File(tmp, "index.html").isFile()) throw new IOException("no index.html in bundle");
            deleteRecursive(target);
            if (!tmp.renameTo(target)) throw new IOException("cannot move bundle into place");
        } finally {
            conn.disconnect();
            zip.delete();
        }
    }

    /** Keep only the bundle in use and the one just downloaded. */
    private void cleanup(File keep) {
        String current = caps().getString(CAP_PATH, "");
        File[] all = bundlesDir().listFiles();
        if (all == null) return;
        for (File f : all) {
            if (!f.equals(keep) && !f.getAbsolutePath().equals(current)) deleteRecursive(f);
        }
    }

    private static void deleteRecursive(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        f.delete();
    }
}
