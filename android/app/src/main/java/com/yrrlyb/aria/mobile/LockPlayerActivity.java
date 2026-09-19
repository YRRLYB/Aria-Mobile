package com.yrrlyb.aria.mobile;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.util.LruCache;
import android.content.res.ColorStateList;
import android.graphics.*;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.*;
import android.widget.*;
import androidx.core.graphics.Insets;
import androidx.core.graphics.PathParser;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.media3.common.MediaItem;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/** Music above the keyguard. Dismissing never bypasses system authentication. */
public class LockPlayerActivity extends Activity {
    private static final ExecutorService COVER_WORKER = Executors.newSingleThreadExecutor();
    private static final LruCache<String, Bitmap> COVERS = new LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override protected int sizeOf(String key, Bitmap bitmap) { return bitmap.getAllocationByteCount(); }
    };
    static void prepareArtwork(Context context, String key) {
        if (key.isEmpty() || COVERS.get(key) != null) return;
        Context app = context.getApplicationContext();
        COVER_WORKER.execute(() -> { try { fetchArtwork(app, key); } catch (Exception ignored) { } });
    }
    private static Bitmap fetchArtwork(Context context, String key) throws Exception {
        Bitmap cached = COVERS.get(key);
        if (cached != null) return cached;
        Uri uri = Uri.parse(key); InputStream input;
        if ("content".equals(uri.getScheme())) input = context.getContentResolver().openInputStream(uri);
        else { URLConnection connection = new URL(key).openConnection(); connection.setConnectTimeout(5000); connection.setReadTimeout(5000); input = connection.getInputStream(); }
        try (InputStream stream = input) {
            Bitmap decoded = BitmapFactory.decodeStream(stream);
            if (decoded == null) return null;
            int longest = Math.max(decoded.getWidth(), decoded.getHeight());
            Bitmap image = longest > 1400 ? Bitmap.createScaledBitmap(decoded, Math.max(1, decoded.getWidth() * 1400 / longest), Math.max(1, decoded.getHeight() * 1400 / longest), true) : decoded;
            if (image != decoded) decoded.recycle();
            COVERS.put(key, image); return image;
        }
    }
    private static LockPlayerActivity visible;
    private static final Map<String, LockInfo> INFO = new LinkedHashMap<>();
    private static class LockInfo {
        final JSONArray lyrics; final boolean liked;
        LockInfo(JSONArray lyrics, boolean liked) { this.lyrics = lyrics == null ? new JSONArray() : lyrics; this.liked = liked; }
    }
    static synchronized void updateInfo(String id, JSONArray lyrics, boolean liked) {
        INFO.put(id, new LockInfo(lyrics, liked));
        while (INFO.size() > 6) INFO.remove(INFO.keySet().iterator().next());
    }
    private static synchronized LockInfo info(String id) { return INFO.get(id); }
    static boolean isVisible() { return visible != null; }
    static void dismiss() { if (visible != null) visible.finish(); }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService artworkWorker = Executors.newSingleThreadExecutor();
    private Future<?> artworkTask;
    private CoverBackground background;
    private TextView title, artist, time, date, lyric, translation, elapsed, total;
    private ImageButton toggle, favorite;
    private SeekBar progress;
    private String artworkKey = "", lyricKey = "", trackKey = "";
    private boolean seeking;
    private float touchX, touchY;
    private final Runnable update = new Runnable() {
        @Override public void run() {
            time.setText(android.text.format.DateFormat.format("HH:mm", System.currentTimeMillis()));
            date.setText(android.text.format.DateFormat.format("M月d日 EEEE", System.currentTimeMillis()));
            AriaPlaybackService.withPlayer(player -> {
                MediaItem item = player.getCurrentMediaItem();
                if (item == null) return;
                title.setText(item.mediaMetadata.title); artist.setText(item.mediaMetadata.artist);
                boolean playing = player.getPlayWhenReady();
                toggle.setImageDrawable(new MusicIcon(playing ? "pause" : "play", Color.WHITE));
                toggle.setContentDescription(playing ? "暂停" : "播放");
                long duration = Math.max(0, player.getDuration()), position = Math.max(0, player.getCurrentPosition());
                progress.setMax((int) (duration / 1000));
                if (!seeking) progress.setProgress((int) (position / 1000));
                elapsed.setText(formatTime(position)); total.setText(formatTime(duration));
                LockInfo data = info(item.mediaId);
                favorite.setImageDrawable(new MusicIcon(data != null && data.liked ? "liked" : "heart", data != null && data.liked ? 0xffff9aa7 : Color.WHITE));
                favorite.setContentDescription(data != null && data.liked ? "取消喜欢" : "喜欢");
                String line = "让音乐陪你片刻", translated = "";
                if (data != null && data.lyrics.length() > 0) {
                    line = "♪";
                    for (int i = 0; i < data.lyrics.length(); i++) {
                        JSONObject entry = data.lyrics.optJSONObject(i);
                        if (entry == null) continue;
                        if (parseTime(entry.optString("time")) > position) break;
                        line = entry.optString("text", "♪"); translated = entry.optString("translation", "");
                    }
                }
                String nextLyric = item.mediaId + line + translated;
                if (!nextLyric.equals(lyricKey)) { lyricKey = nextLyric; animateText(lyric, line); animateText(translation, translated); }
                String key = item.mediaMetadata.artworkUri != null ? item.mediaMetadata.artworkUri.toString() : "";
                if (!key.equals(artworkKey) || !item.mediaId.equals(trackKey)) { artworkKey = key; trackKey = item.mediaId; loadArtwork(key); }
            });
            handler.postDelayed(this, 250);
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).hide(WindowInsetsCompat.Type.statusBars());
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        FrameLayout root = new FrameLayout(this);
        background = new CoverBackground(); root.addView(background, new FrameLayout.LayoutParams(-1, -1));
        LinearLayout header = new LinearLayout(this); header.setOrientation(LinearLayout.VERTICAL);
        TextView brand = text(11, 0xccffffff); brand.setText("A R I A  /  正在聆听"); brand.setLetterSpacing(.12f); header.addView(brand);
        time = text(64, Color.WHITE); time.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL)); time.setIncludeFontPadding(false); add(header, time, 20);
        date = text(14, 0xddffffff); add(header, date, 3);
        title = text(25, Color.WHITE); title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); title.setMaxLines(2); add(header, title, 24);
        artist = text(14, 0xccffffff); artist.setMaxLines(2); add(header, artist, 7);
        root.addView(header, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        LinearLayout dock = new LinearLayout(this); dock.setOrientation(LinearLayout.VERTICAL);
        lyric = text(21, Color.WHITE); lyric.setGravity(Gravity.CENTER); lyric.setMaxLines(3); lyric.setLineSpacing(dp(4), 1); lyric.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        dock.addView(lyric, new LinearLayout.LayoutParams(-1, -2));
        translation = text(14, 0x99ffffff); translation.setGravity(Gravity.CENTER); translation.setMaxLines(2); add(dock, translation, 12);
        progress = new SeekBar(this); progress.setProgressTintList(ColorStateList.valueOf(0xccffffff)); progress.setProgressBackgroundTintList(ColorStateList.valueOf(0x33ffffff)); progress.setThumbTintList(ColorStateList.valueOf(Color.WHITE));
        LinearLayout.LayoutParams seekLayout = new LinearLayout.LayoutParams(-1, dp(32)); seekLayout.topMargin = dp(30); dock.addView(progress, seekLayout);
        progress.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onStartTrackingTouch(SeekBar bar) { seeking = true; }
            public void onProgressChanged(SeekBar bar, int value, boolean fromUser) { if (fromUser) elapsed.setText(formatTime(value * 1000L)); }
            public void onStopTrackingTouch(SeekBar bar) { seeking = false; AriaPlaybackService.withPlayer(player -> player.seekTo(bar.getProgress() * 1000L)); }
        });
        LinearLayout timing = new LinearLayout(this); elapsed = text(11, 0x99ffffff); total = text(11, 0x99ffffff); total.setGravity(Gravity.END);
        timing.addView(elapsed, new LinearLayout.LayoutParams(0, -2, 1)); timing.addView(total, new LinearLayout.LayoutParams(0, -2, 1)); dock.addView(timing);
        LinearLayout buttons = new LinearLayout(this); buttons.setGravity(Gravity.CENTER);
        ImageButton previous = button("previous", "上一首", false); previous.setOnClickListener(v -> AriaPlaybackService.requestSkip(false));
        toggle = button("play", "播放", true); toggle.setOnClickListener(v -> AriaPlaybackService.withPlayer(player -> player.setPlayWhenReady(!player.getPlayWhenReady())));
        ImageButton next = button("next", "下一首", false); next.setOnClickListener(v -> AriaPlaybackService.requestSkip(true));
        favorite = button("heart", "喜欢", false); favorite.setOnClickListener(v -> AriaPlaybackService.requestLike());
        for (ImageButton button : new ImageButton[]{previous, toggle, next, favorite}) {
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(64), 1); params.setMargins(dp(4), 0, dp(4), 0); buttons.addView(button, params);
        }
        add(dock, buttons, 18);
        TextView unlock = text(12, 0x99ffffff); unlock.setGravity(Gravity.CENTER); unlock.setText("⌃  上滑解锁"); unlock.setPadding(0, dp(22), 0, dp(16)); unlock.setOnClickListener(v -> unlock()); add(dock, unlock, 14);
        root.addView(dock, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            header.setPadding(bars.left + dp(30), bars.top + dp(22), bars.right + dp(30), 0);
            dock.setPadding(bars.left + dp(30), dp(24), bars.right + dp(30), bars.bottom + dp(10)); return insets;
        });
        setContentView(root); ViewCompat.requestApplyInsets(root);
    }
    private void unlock() {
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        if (Build.VERSION.SDK_INT >= 26 && keyguard != null && keyguard.isKeyguardLocked()) {
            keyguard.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override public void onDismissSucceeded() { finish(); }
                @Override public void onDismissError() { finish(); }
            });
        } else finish();
    }
    @Override public boolean dispatchTouchEvent(MotionEvent event) {
        if (event.getActionMasked() == MotionEvent.ACTION_DOWN) { touchX = event.getX(); touchY = event.getY(); }
        if (event.getActionMasked() == MotionEvent.ACTION_UP && !seeking && touchY - event.getY() > dp(100) && Math.abs(event.getX() - touchX) < dp(100)) { unlock(); return true; }
        return super.dispatchTouchEvent(event);
    }
    private void animateText(TextView view, String value) {
        view.animate().cancel(); view.setText(value); view.setAlpha(.25f); view.setTranslationY(dp(7)); view.animate().alpha(1).translationY(0).setDuration(320).start();
    }
    private void loadArtwork(String key) {
        if (artworkTask != null) artworkTask.cancel(true);
        Bitmap cached = COVERS.get(key);
        if (cached != null) { background.setArtwork(cached); return; }
        background.setArtwork(null);
        if (key.isEmpty()) return;
        artworkTask = artworkWorker.submit(() -> {
            try {
                    Bitmap image = fetchArtwork(getApplicationContext(), key);
                    handler.post(() -> { if (!isDestroyed() && artworkKey.equals(key)) { background.setArtwork(image); background.setAlpha(.4f); background.animate().alpha(1).setDuration(550).start(); } });
            } catch (Exception ignored) { }
        });
    }
    private ImageButton button(String icon, String label, boolean primary) {
        ImageButton button = new ImageButton(this); button.setImageDrawable(new MusicIcon(icon, Color.WHITE)); button.setContentDescription(label);
        GradientDrawable shape = new GradientDrawable(); shape.setShape(GradientDrawable.OVAL); shape.setColor(primary ? 0x26ffffff : Color.TRANSPARENT);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33ffffff), shape, null)); button.setPadding(dp(17), dp(17), dp(17), dp(17)); button.setScaleType(ImageView.ScaleType.FIT_CENTER); return button;
    }
    private TextView text(int size, int color) { TextView view = new TextView(this); view.setTextSize(size); view.setTextColor(color); return view; }
    private void add(LinearLayout parent, View view, int margin) { LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin = dp(margin); parent.addView(view, params); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private static long parseTime(String value) {
        try { String[] parts = value.split(":"); double seconds = 0; for (String part : parts) seconds = seconds * 60 + Double.parseDouble(part); return (long) (seconds * 1000); } catch (Exception ignored) { return 0; }
    }
    private String formatTime(long ms) { long seconds = ms / 1000; return String.format(java.util.Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60); }
    @Override protected void onStart() { super.onStart(); visible = this; handler.post(update); }
    @Override protected void onStop() { handler.removeCallbacks(update); if (visible == this) visible = null; super.onStop(); }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); artworkWorker.shutdownNow(); super.onDestroy(); }

    private class CoverBackground extends View {
        private Bitmap bitmap; private int shade = 0xff171b25; private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        CoverBackground() { super(LockPlayerActivity.this); }
        void setArtwork(Bitmap image) {
            bitmap = image; shade = 0xff171b25;
            if (image != null) {
                long r = 0, g = 0, b = 0; int count = 0;
                for (int y = 0; y < image.getHeight(); y += Math.max(1, image.getHeight() / 16)) for (int x = 0; x < image.getWidth(); x += Math.max(1, image.getWidth() / 16)) {
                    int c = image.getPixel(x, y); r += Color.red(c); g += Color.green(c); b += Color.blue(c); count++;
                }
                shade = Color.rgb((int) (r / count * .23), (int) (g / count * .23), (int) (b / count * .23));
            }
            invalidate();
        }
        @Override protected void onDraw(Canvas canvas) {
            canvas.drawColor(shade); float w = getWidth(), h = getHeight(), coverHeight = h * .76f;
            if (bitmap != null) {
                float scale = Math.max(w / bitmap.getWidth(), coverHeight / bitmap.getHeight());
                float bw = bitmap.getWidth() * scale, bh = bitmap.getHeight() * scale;
                paint.setShader(null); canvas.drawBitmap(bitmap, null, new RectF((w - bw) / 2, (coverHeight - bh) / 2, (w + bw) / 2, (coverHeight + bh) / 2), paint);
            }
            paint.setShader(new LinearGradient(0, 0, 0, h, new int[]{0x80000000, 0x18000000, shade, shade}, new float[]{0, .32f, .73f, 1}, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, w, h, paint); paint.setShader(null);
        }
    }
    /** Same Lucide paths as the React UI (ISC license). */
    private static class MusicIcon extends Drawable {
        private final String kind; private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        MusicIcon(String kind, int color) { this.kind = kind; paint.setColor(color); paint.setStrokeWidth(1.7f); paint.setStrokeCap(Paint.Cap.ROUND); paint.setStrokeJoin(Paint.Join.ROUND); }
        @Override public void draw(Canvas canvas) {
            canvas.save(); Rect b = getBounds(); canvas.translate(b.left, b.top); canvas.scale(b.width() / 24f, b.height() / 24f);
            String path;
            switch (kind) {
                case "previous": path = "M19 20 9 12 19 4Z M5 5V19"; break;
                case "next": path = "M5 4 15 12 5 20Z M19 5V19"; break;
                case "pause": path = "M7 5H9V19H7Z M15 5H17V19H15Z"; break;
                case "heart": case "liked": path = "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"; break;
                default: path = "M6 3 20 12 6 21Z";
            }
            paint.setStyle(kind.equals("liked") || kind.equals("play") || kind.equals("pause") ? Paint.Style.FILL : Paint.Style.STROKE);
            canvas.drawPath(PathParser.createPathFromPathData(path), paint); canvas.restore();
        }
        @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
        @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
        @Override public int getIntrinsicWidth() { return 32; }
        @Override public int getIntrinsicHeight() { return 32; }
    }
}
