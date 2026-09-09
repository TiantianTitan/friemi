package com.friemi.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST_CODE = 4821;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 4822;
    private static final int GALLERY_PERMISSION_REQUEST_CODE = 4823;
    private static final String PREFS_NAME = "friemi_android";
    private static final String PREF_LOCALE = "friemi_locale";
    private static final String PREF_NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested";
    private static final String LOCALE_ZH = "zh-CN";
    private static final String LOCALE_EN = "en";
    private static final String LOCALE_FR = "fr";
    private static final long EXIT_CONFIRM_MS = 1800L;
    private static final long SLOW_LOAD_NOTICE_MS = 8500L;
    private static final long AUTH_BROWSER_AUTO_RETRY_MIN_MS = 3500L;
    private static final long AUTH_BROWSER_AUTO_RETRY_MAX_MS = 180000L;
    private static final String AUTH_COMPLETE_HOST = "auth-complete";
    private static final String ANDROID_AUTH_RETURN_PARAM = "__friemi_android_auth_return";
    private static final String ANDROID_AUTH_TS_PARAM = "__friemi_android_auth_ts";
    private static final String[] CLERK_AUTH_HOST_PARTS = {
        "clerk",
        "accounts.dev"
    };

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private WebView webView;
    private FrameLayout rootView;
    private ProgressBar progressBar;
    private LinearLayout loadingOverlay;
    private TextView loadingSubtitle;
    private Button loadingRetryButton;
    private LinearLayout errorOverlay;
    private TextView errorBody;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> filePathCallback;
    private String currentUrl;
    private String pendingAuthBrowserUrl;
    private String pendingGalleryImageUrl;
    private long pendingAuthStartedAt;
    private boolean pendingAuthAutoRetryUsed;
    private boolean webBackRequested;
    private boolean pageLoading;
    private long lastBackPressedAt;
    private final Runnable slowLoadNoticeRunnable = () -> {
        if (!pageLoading || loadingOverlay.getVisibility() != View.VISIBLE) {
            return;
        }
        loadingSubtitle.setText(getString(R.string.loading_slow_network));
        loadingRetryButton.setVisibility(View.VISIBLE);
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        configureWindow();
        setupViews();
        setupWebView();
        loadUrl(buildLaunchUrl(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        clearPendingAuthBrowser();
        loadUrl(buildLaunchUrl(intent));
    }

    @Override
    protected void onResume() {
        super.onResume();
        configureWindow();
        refreshSafeArea();
        maybeResumePendingAuthBrowser();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        configureWindow();
        refreshSafeArea();
    }

    @Override
    public void onRequestPermissionsResult(
        int requestCode,
        String[] permissions,
        int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != GALLERY_PERMISSION_REQUEST_CODE) {
            return;
        }

        String imageUrl = pendingGalleryImageUrl;
        pendingGalleryImageUrl = null;
        if (
            grantResults.length > 0 &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED &&
            !isBlank(imageUrl)
        ) {
            saveImageToGallery(imageUrl);
        }
    }

    private void configureWindow() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);
    }

    private void setupViews() {
        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(getColorCompat(R.color.friemi_paper));

        webView = new WebView(this);
        webView.setId(View.generateViewId());
        webView.setBackgroundColor(getColorCompat(R.color.friemi_paper));
        rootView.addView(
            webView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        progressBar.setVisibility(View.GONE);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3),
            Gravity.TOP
        );
        rootView.addView(progressBar, progressParams);

        loadingOverlay = buildLoadingOverlay();
        rootView.addView(
            loadingOverlay,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        errorOverlay = buildErrorOverlay();
        errorOverlay.setVisibility(View.GONE);
        rootView.addView(
            errorOverlay,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, insets) -> {
            if (webView != null) {
                webView.post(() -> injectAndroidAppContext(false));
            }
            return insets;
        });
        setContentView(rootView);
        ViewCompat.requestApplyInsets(rootView);
    }

    private void refreshSafeArea() {
        if (rootView != null) {
            ViewCompat.requestApplyInsets(rootView);
            return;
        }
        if (webView != null) {
            webView.post(() -> injectAndroidAppContext(false));
        }
    }

    private LinearLayout buildLoadingOverlay() {
        LinearLayout overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.CENTER);
        overlay.setPadding(dp(28), dp(28), dp(28), dp(28));
        overlay.setBackgroundColor(getColorCompat(R.color.friemi_paper));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.friemi_icon);
        logo.setAdjustViewBounds(true);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(72), dp(72));
        overlay.addView(logo, logoParams);

        TextView title = new TextView(this);
        title.setText("Friemi");
        title.setTextColor(getColorCompat(R.color.friemi_ink));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(24);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(12);
        overlay.addView(title, titleParams);

        loadingSubtitle = new TextView(this);
        loadingSubtitle.setText(getString(R.string.loading_friemi));
        loadingSubtitle.setTextColor(getColorCompat(R.color.friemi_green));
        loadingSubtitle.setTextSize(14);
        loadingSubtitle.setGravity(Gravity.CENTER);
        loadingSubtitle.setLineSpacing(0, 1.12f);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.topMargin = dp(4);
        overlay.addView(loadingSubtitle, subtitleParams);

        loadingRetryButton = makeButton(getString(R.string.retry), true);
        loadingRetryButton.setVisibility(View.GONE);
        loadingRetryButton.setOnClickListener(view -> loadUrl(currentUrl != null ? currentUrl : buildDefaultHomeUrl()));
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(dp(168), dp(46));
        retryParams.topMargin = dp(18);
        overlay.addView(loadingRetryButton, retryParams);

        return overlay;
    }

    private LinearLayout buildErrorOverlay() {
        LinearLayout outer = new LinearLayout(this);
        outer.setGravity(Gravity.CENTER);
        outer.setPadding(dp(22), dp(22), dp(22), dp(22));
        outer.setBackgroundColor(getColorCompat(R.color.friemi_paper));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(22), dp(24), dp(22), dp(22));
        card.setBackground(roundedDrawable(Color.WHITE, getColorCompat(R.color.friemi_sand), dp(28), 1));
        outer.addView(
            card,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        );

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.friemi_icon);
        card.addView(logo, new LinearLayout.LayoutParams(dp(58), dp(58)));

        TextView title = new TextView(this);
        title.setText(getString(R.string.web_error_title));
        title.setTextColor(getColorCompat(R.color.friemi_ink));
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(14);
        card.addView(title, titleParams);

        errorBody = new TextView(this);
        errorBody.setText(getString(R.string.web_error_body));
        errorBody.setTextColor(getColorCompat(R.color.friemi_green));
        errorBody.setTextSize(14);
        errorBody.setGravity(Gravity.CENTER);
        errorBody.setLineSpacing(0, 1.15f);
        LinearLayout.LayoutParams bodyParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bodyParams.topMargin = dp(8);
        card.addView(errorBody, bodyParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        actionsParams.topMargin = dp(18);
        card.addView(actions, actionsParams);

        Button retry = makeButton(getString(R.string.retry), true);
        retry.setOnClickListener(view -> {
            hideError();
            loadUrl(currentUrl != null ? currentUrl : buildDefaultHomeUrl());
        });
        actions.addView(retry, weightedButtonParams(0));

        Button browser = makeButton(getString(R.string.open_in_browser), false);
        browser.setOnClickListener(view -> openExternal(currentUrl != null ? currentUrl : buildDefaultHomeUrl()));
        actions.addView(browser, weightedButtonParams(dp(10)));

        return outer;
    }

    private LinearLayout.LayoutParams weightedButtonParams(int leftMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(44), 1);
        params.leftMargin = leftMargin;
        return params;
    }

    private Button makeButton(String label, boolean primary) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextSize(13);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(primary ? Color.WHITE : getColorCompat(R.color.friemi_green));
        button.setBackground(
            roundedDrawable(
                primary ? getColorCompat(R.color.friemi_green) : getColorCompat(R.color.friemi_paper),
                primary ? getColorCompat(R.color.friemi_green) : getColorCompat(R.color.friemi_sand),
                dp(999),
                1
            )
        );
        return button;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setUserAgentString(settings.getUserAgentString() + " FriemiAndroid/" + BuildConfig.VERSION_NAME);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new FriemiAndroidBridge(this), "FriemiAndroid");
        webView.setWebViewClient(new FriemiWebViewClient());
        webView.setWebChromeClient(new FriemiWebChromeClient());
        webView.setDownloadListener(buildDownloadListener());
    }

    private DownloadListener buildDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) ->
            downloadFile(url, contentDisposition, mimeType);
    }

    private void loadUrl(String url) {
        currentUrl = url;
        showLoading();
        webView.loadUrl(url);
    }

    private boolean loadInternalUrlIfPossible(String url) {
        if (isBlank(url)) {
            return false;
        }
        try {
            Uri uri = Uri.parse(url);
            if ("friemi".equalsIgnoreCase(uri.getScheme())
                || (isHttp(uri) && isFriemiHost(uri.getHost()))) {
                loadUrl(normalizeIncomingUri(uri));
                return true;
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private String buildLaunchUrl(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data == null) {
            return buildDefaultHomeUrl();
        }
        return normalizeIncomingUri(data);
    }

    private String buildDefaultHomeUrl() {
        return getBaseUrl() + "/" + resolveLocale(null) + BuildConfig.FRIEMI_DEFAULT_PATH;
    }

    private String normalizeIncomingUri(Uri uri) {
        if ("friemi".equalsIgnoreCase(uri.getScheme())) {
            if (AUTH_COMPLETE_HOST.equalsIgnoreCase(uri.getHost())) {
                clearPendingAuthBrowser();
                return buildUrlFromAuthCompleteTarget(uri.getQueryParameter("target"));
            }
            String route = buildRouteFromCustomScheme(uri);
            return getBaseUrl() + "/" + resolveLocale(null) + route;
        }

        if (isHttp(uri) && isFriemiHost(uri.getHost())) {
            String localeFromUri = getLocaleFromPath(uri.getPath());
            String locale = localeFromUri != null ? localeFromUri : resolveLocale(null);
            if (localeFromUri != null) {
                return uri.toString();
            }
            return uri.buildUpon().path("/" + locale + normalizePath(uri.getPath())).build().toString();
        }

        return buildDefaultHomeUrl();
    }

    private String buildRouteFromCustomScheme(Uri uri) {
        String host = uri.getHost();
        String path = uri.getPath();
        StringBuilder route = new StringBuilder();
        if (!isBlank(host)) {
            route.append("/").append(host);
        }
        if (!isBlank(path)) {
            route.append(path);
        }
        if (route.length() == 0 || "/home".contentEquals(route)) {
            return BuildConfig.FRIEMI_DEFAULT_PATH;
        }
        return normalizeCustomSchemeRoute(route.toString());
    }

    private String normalizeCustomSchemeRoute(String route) {
        String normalized = normalizePath(route);
        if (normalized.startsWith("/activity/")) {
            return "/activities/" + normalized.substring("/activity/".length());
        }
        if (normalized.startsWith("/team/")) {
            return "/activities/" + normalized.substring("/team/".length());
        }
        if (normalized.equals("/hall")) {
            return BuildConfig.FRIEMI_DEFAULT_PATH;
        }
        if (normalized.equals("/lobby")) {
            return "/lobby";
        }
        if (normalized.equals("/messages") || normalized.equals("/notifications")) {
            return normalized;
        }
        return normalized;
    }

    private String normalizePath(String path) {
        if (isBlank(path) || "/".equals(path)) {
            return BuildConfig.FRIEMI_DEFAULT_PATH;
        }
        return path.startsWith("/") ? path : "/" + path;
    }

    private String buildUrlFromAuthCompleteTarget(String target) {
        String route = normalizeAuthCompleteTarget(target);
        String url;
        if (getLocaleFromPath(route) != null) {
            url = getBaseUrl() + route;
        } else {
            url = getBaseUrl() + "/" + resolveLocale(null) + route;
        }
        return appendAndroidAuthReturnMarker(url);
    }

    private String appendAndroidAuthReturnMarker(String url) {
        try {
            return Uri.parse(url)
                .buildUpon()
                .appendQueryParameter(ANDROID_AUTH_RETURN_PARAM, "1")
                .appendQueryParameter(ANDROID_AUTH_TS_PARAM, String.valueOf(System.currentTimeMillis()))
                .build()
                .toString();
        } catch (Exception ignored) {
            return url;
        }
    }

    private String normalizeAuthCompleteTarget(String target) {
        if (isBlank(target)) {
            return BuildConfig.FRIEMI_DEFAULT_PATH;
        }

        String trimmed = target.trim();
        String lowerTarget = trimmed.toLowerCase(Locale.ROOT);
        if (lowerTarget.startsWith("http://") || lowerTarget.startsWith("https://") || trimmed.startsWith("//")) {
            try {
                Uri uri = Uri.parse(trimmed);
                if (!isFriemiHost(uri.getHost())) {
                    return BuildConfig.FRIEMI_DEFAULT_PATH;
                }
                String path = normalizePath(uri.getPath());
                if (isAuthPath(path)) {
                    return BuildConfig.FRIEMI_DEFAULT_PATH;
                }
                String query = uri.getQuery();
                String fragment = uri.getFragment();
                return path
                    + (isBlank(query) ? "" : "?" + query)
                    + (isBlank(fragment) ? "" : "#" + fragment);
            } catch (Exception ignored) {
                return BuildConfig.FRIEMI_DEFAULT_PATH;
            }
        }

        String path = normalizePath(trimmed);
        return isAuthPath(path) ? BuildConfig.FRIEMI_DEFAULT_PATH : path;
    }

    private String resolveLocale(String explicitLocale) {
        if (isSupportedLocale(explicitLocale)) {
            return explicitLocale;
        }

        String storedLocale = preferences.getString(PREF_LOCALE, null);
        if (isSupportedLocale(storedLocale)) {
            return storedLocale;
        }

        String languageTag = Locale.getDefault().toLanguageTag().toLowerCase(Locale.ROOT);
        if (languageTag.startsWith("zh")) {
            return LOCALE_ZH;
        }
        if (languageTag.startsWith("en")) {
            return LOCALE_EN;
        }
        return LOCALE_FR;
    }

    private boolean isSupportedLocale(String locale) {
        return LOCALE_ZH.equals(locale) || LOCALE_EN.equals(locale) || LOCALE_FR.equals(locale);
    }

    private String getLocaleFromPath(String path) {
        if (path == null) {
            return null;
        }
        String normalized = path.startsWith("/") ? path.substring(1) : path;
        int slashIndex = normalized.indexOf('/');
        String firstSegment = slashIndex >= 0 ? normalized.substring(0, slashIndex) : normalized;
        return isSupportedLocale(firstSegment) ? firstSegment : null;
    }

    private String getBaseUrl() {
        return BuildConfig.FRIEMI_BASE_URL.replaceAll("/+$", "");
    }

    private Uri getBaseUri() {
        return Uri.parse(getBaseUrl());
    }

    private boolean isHttp(Uri uri) {
        String scheme = uri.getScheme();
        return "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
    }

    private boolean isFriemiHost(String host) {
        if (host == null) {
            return false;
        }
        String baseHost = getBaseUri().getHost();
        return host.equalsIgnoreCase(baseHost)
            || host.equalsIgnoreCase("www.friemi.com")
            || host.equalsIgnoreCase("friemi.com");
    }

    private boolean shouldStayInWebView(Uri uri) {
        String host = uri.getHost();
        if (host == null) {
            return false;
        }
        return isFriemiHost(host);
    }

    private boolean shouldOpenInAuthBrowser(Uri uri) {
        String host = uri.getHost();
        if (host == null) {
            return false;
        }
        if (shouldLoadClerkHandshakeInWebView(uri)) {
            return false;
        }

        String lowerHost = host.toLowerCase(Locale.ROOT);
        return isGoogleOAuthHost(lowerHost) || isClerkAuthHost(lowerHost);
    }

    private boolean shouldLoadClerkHandshakeInWebView(Uri uri) {
        String host = uri.getHost();
        String path = uri.getPath();
        if (host == null || path == null) {
            return false;
        }
        String lowerHost = host.toLowerCase(Locale.ROOT);
        String lowerPath = path.toLowerCase(Locale.ROOT);
        return isClerkAuthHost(lowerHost) && lowerPath.contains("/v1/client/handshake");
    }

    private boolean isGoogleOAuthHost(String lowerHost) {
        return lowerHost.equals("accounts.google.com")
            || lowerHost.equals("oauth2.googleapis.com")
            || lowerHost.equals("gds.google.com");
    }

    private boolean isClerkAuthHost(String lowerHost) {
        if (isFriemiHost(lowerHost)) {
            return false;
        }
        if (lowerHost.endsWith(".clerk.com")
            || lowerHost.endsWith(".clerk.accounts.dev")
            || lowerHost.endsWith(".accounts.dev")) {
            return true;
        }
        for (String marker : CLERK_AUTH_HOST_PARTS) {
            if (lowerHost.contains(marker)) {
                return true;
            }
        }
        return false;
    }

    private void showLoading() {
        pageLoading = true;
        mainHandler.removeCallbacks(slowLoadNoticeRunnable);
        progressBar.setVisibility(View.VISIBLE);
        progressBar.setProgress(10);
        loadingSubtitle.setText(getString(R.string.loading_friemi));
        loadingRetryButton.setVisibility(View.GONE);
        loadingOverlay.animate().cancel();
        loadingOverlay.setAlpha(0f);
        loadingOverlay.setVisibility(View.VISIBLE);
        loadingOverlay.animate().alpha(1f).setDuration(160L).start();
        errorOverlay.setVisibility(View.GONE);
        mainHandler.postDelayed(slowLoadNoticeRunnable, SLOW_LOAD_NOTICE_MS);
    }

    private void hideLoading() {
        pageLoading = false;
        mainHandler.removeCallbacks(slowLoadNoticeRunnable);
        progressBar.setVisibility(View.GONE);
        loadingOverlay.animate().cancel();
        if (loadingOverlay.getVisibility() != View.VISIBLE) {
            loadingOverlay.setVisibility(View.GONE);
            loadingOverlay.setAlpha(1f);
            return;
        }

        loadingOverlay.animate()
            .alpha(0f)
            .setDuration(220L)
            .withEndAction(() -> {
                if (loadingOverlay.getAlpha() <= 0.05f) {
                    loadingOverlay.setVisibility(View.GONE);
                    loadingOverlay.setAlpha(1f);
                }
            })
            .start();
    }

    private void showError(String message) {
        pageLoading = false;
        mainHandler.removeCallbacks(slowLoadNoticeRunnable);
        hideLoading();
        if (!isBlank(message)) {
            errorBody.setText(message);
        } else {
            errorBody.setText(getString(R.string.web_error_body));
        }
        errorOverlay.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        errorOverlay.setVisibility(View.GONE);
    }

    @Override
    public void onBackPressed() {
        if (errorOverlay.getVisibility() == View.VISIBLE) {
            hideError();
            return;
        }

        if (webBackRequested) {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('friemi:android-back'))",
                null
            );
            return;
        }

        if (isAtHomeRoute()) {
            long now = System.currentTimeMillis();
            if (now - lastBackPressedAt < EXIT_CONFIRM_MS) {
                finish();
            } else {
                lastBackPressedAt = now;
                Toast.makeText(this, R.string.exit_hint, Toast.LENGTH_SHORT).show();
            }
            return;
        }

        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        super.onBackPressed();
    }

    private boolean isAtHomeRoute() {
        if (currentUrl == null) {
            return true;
        }
        Uri uri = Uri.parse(currentUrl);
        String path = uri.getPath();
        if (path == null) {
            return true;
        }
        return path.endsWith("/mobile-home")
            || path.endsWith("/mobile-home/")
            || path.endsWith("/home")
            || path.endsWith("/home/");
    }

    private boolean isAuthRoute(String url) {
        if (url == null) {
            return false;
        }
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        if (path == null) {
            return false;
        }
        return isAuthPath(path);
    }

    private boolean isAuthPath(String path) {
        return path != null && (path.contains("/sign-in") || path.contains("/sign-up"));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST_CODE || filePathCallback == null) {
            return;
        }

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int index = 0; index < count; index++) {
                    results[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[] { data.getData() };
            }
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    String getAppInfoJson() {
        JSONObject payload = new JSONObject();
        try {
            payload.put("platform", "android");
            payload.put("appVersion", BuildConfig.VERSION_NAME);
            payload.put("buildNumber", BuildConfig.VERSION_CODE);
            payload.put("packageName", BuildConfig.APPLICATION_ID);
            payload.put("baseUrl", getBaseUrl());
            payload.put("locale", resolveLocale(null));
            payload.put("pushSupported", true);
            payload.put("safeArea", getSafeAreaJson());
        } catch (JSONException ignored) {
            return "{}";
        }
        return payload.toString();
    }

    private JSONObject getSafeAreaJson() throws JSONException {
        JSONObject safeArea = new JSONObject();
        Insets systemInsets = getSystemInsets();
        int topOverlapPx = getWebViewTopOverlapPx(systemInsets.top);
        int bottomOverlapPx = getWebViewBottomOverlapPx(systemInsets.bottom);
        int leftOverlapPx = getWebViewLeftOverlapPx(systemInsets.left);
        int rightOverlapPx = getWebViewRightOverlapPx(systemInsets.right);

        safeArea.put("statusBarHeight", pxToCssPx(systemInsets.top));
        safeArea.put("navigationBarHeight", pxToCssPx(systemInsets.bottom));
        safeArea.put("top", pxToCssPx(topOverlapPx));
        safeArea.put("bottom", pxToCssPx(bottomOverlapPx));
        safeArea.put("left", pxToCssPx(leftOverlapPx));
        safeArea.put("right", pxToCssPx(rightOverlapPx));

        return safeArea;
    }

    private Insets getSystemInsets() {
        WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(
            getWindow().getDecorView()
        );
        if (windowInsets != null) {
            return windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() |
                    WindowInsetsCompat.Type.displayCutout()
            );
        }
        return Insets.of(
            0,
            getSystemDimensionPx("status_bar_height"),
            0,
            getSystemDimensionPx("navigation_bar_height")
        );
    }

    private int getSystemDimensionPx(String name) {
        int resourceId = getResources().getIdentifier(name, "dimen", "android");
        if (resourceId <= 0) {
            return 0;
        }
        return getResources().getDimensionPixelSize(resourceId);
    }

    private int getWebViewTopOverlapPx(int statusBarHeightPx) {
        if (webView == null || statusBarHeightPx <= 0) {
            return 0;
        }
        int[] webViewLocation = new int[2];
        int[] windowLocation = new int[2];
        webView.getLocationOnScreen(webViewLocation);
        getWindow().getDecorView().getLocationOnScreen(windowLocation);
        int webViewTopPx = Math.max(0, webViewLocation[1] - windowLocation[1]);
        return Math.max(0, statusBarHeightPx - webViewTopPx);
    }

    private int getWebViewBottomOverlapPx(int navigationBarHeightPx) {
        if (webView == null || navigationBarHeightPx <= 0) {
            return 0;
        }
        View decorView = getWindow().getDecorView();
        int[] webViewLocation = new int[2];
        int[] windowLocation = new int[2];
        webView.getLocationOnScreen(webViewLocation);
        decorView.getLocationOnScreen(windowLocation);
        int webViewBottomPx = webViewLocation[1] + webView.getHeight();
        int windowBottomPx = windowLocation[1] + decorView.getHeight();
        int freeBottomPx = Math.max(0, windowBottomPx - webViewBottomPx);

        return Math.max(0, navigationBarHeightPx - freeBottomPx);
    }

    private int getWebViewLeftOverlapPx(int leftInsetPx) {
        if (webView == null || leftInsetPx <= 0) {
            return 0;
        }
        int[] webViewLocation = new int[2];
        int[] windowLocation = new int[2];
        webView.getLocationOnScreen(webViewLocation);
        getWindow().getDecorView().getLocationOnScreen(windowLocation);
        int freeLeftPx = Math.max(0, webViewLocation[0] - windowLocation[0]);
        return Math.max(0, leftInsetPx - freeLeftPx);
    }

    private int getWebViewRightOverlapPx(int rightInsetPx) {
        if (webView == null || rightInsetPx <= 0) {
            return 0;
        }
        View decorView = getWindow().getDecorView();
        int[] webViewLocation = new int[2];
        int[] windowLocation = new int[2];
        webView.getLocationOnScreen(webViewLocation);
        decorView.getLocationOnScreen(windowLocation);
        int webViewRightPx = webViewLocation[0] + webView.getWidth();
        int windowRightPx = windowLocation[0] + decorView.getWidth();
        int freeRightPx = Math.max(0, windowRightPx - webViewRightPx);
        return Math.max(0, rightInsetPx - freeRightPx);
    }

    private int pxToCssPx(int physicalPx) {
        if (physicalPx <= 0) {
            return 0;
        }
        float density = getResources().getDisplayMetrics().density;
        return Math.round(physicalPx / Math.max(1f, density));
    }

    private void injectAndroidAppContext(boolean dispatchReady) {
        if (webView == null) {
            return;
        }
        String payloadJson = getAppInfoJson();
        String dispatchReadyCode = dispatchReady
            ? "window.dispatchEvent(new CustomEvent('friemi:android-ready',{detail:payload}));"
            : "";

        webView.evaluateJavascript(
            "(function(payload){try{"
                + "var root=document.documentElement;"
                + "var safe=payload.safeArea||{};"
                + "root.dataset.friemiAndroidApp='true';"
                + "root.style.setProperty('--friemi-android-statusbar-height',(safe.statusBarHeight||0)+'px');"
                + "root.style.setProperty('--friemi-android-navigationbar-height',(safe.navigationBarHeight||0)+'px');"
                + "root.style.setProperty('--friemi-android-top-inset',(safe.top||0)+'px');"
                + "root.style.setProperty('--friemi-android-bottom-inset',(safe.bottom||0)+'px');"
                + "root.style.setProperty('--friemi-android-left-inset',(safe.left||0)+'px');"
                + "root.style.setProperty('--friemi-android-right-inset',(safe.right||0)+'px');"
                + "window.dispatchEvent(new CustomEvent('friemi:android-safe-area',{detail:safe}));"
                + dispatchReadyCode
                + "}catch(error){}})(" + payloadJson + ");",
            null
        );
    }

    void saveLocaleFromBridge(String locale) {
        if (!isSupportedLocale(locale)) {
            return;
        }
        preferences.edit().putString(PREF_LOCALE, locale).apply();
    }

    void openExternalFromBridge(String url) {
        mainHandler.post(() -> {
            if (!loadInternalUrlIfPossible(url)) {
                openExternal(url);
            }
        });
    }

    void copyTextFromBridge(String text) {
        mainHandler.post(() -> copyText(text));
    }

    void downloadFileFromBridge(String url) {
        mainHandler.post(() -> downloadFile(url, null, null));
    }

    void saveImageToGalleryFromBridge(String url) {
        mainHandler.post(() -> saveImageToGallery(url));
    }

    void shareFromBridge(String payloadJson) {
        mainHandler.post(() -> {
            try {
                JSONObject payload = new JSONObject(payloadJson == null ? "{}" : payloadJson);
                String title = payload.optString("title", "Friemi");
                String text = payload.optString("text", "");
                String url = payload.optString("url", currentUrl != null ? currentUrl : buildDefaultHomeUrl());
                Intent shareIntent = new Intent(Intent.ACTION_SEND);
                shareIntent.setType("text/plain");
                shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                shareIntent.putExtra(Intent.EXTRA_TEXT, (text + "\n" + url).trim());
                startActivity(Intent.createChooser(shareIntent, title));
            } catch (JSONException ignored) {
                openExternal(currentUrl != null ? currentUrl : buildDefaultHomeUrl());
            }
        });
    }

    String registerPushTokenFromBridge() {
        mainHandler.post(() -> {
            maybeRequestNotificationPermission();
            FriemiPushTokenProvider.requestToken(
                this,
                resolveLocale(null),
                this::dispatchPushTokenResult
            );
        });

        JSONObject payload = new JSONObject();
        try {
            payload.put("ok", true);
            payload.put("supported", true);
            payload.put("status", "REQUESTED");
        } catch (JSONException ignored) {
            return "{\"ok\":false}";
        }
        return payload.toString();
    }

    String getStoredPushTokenFromBridge() {
        return FriemiPushTokenProvider.getStoredTokenPayload(this, resolveLocale(null));
    }

    String scanQrCodeFromBridge() {
        mainHandler.post(() -> {
            try {
                GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .enableAutoZoom()
                    .build();
                GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(this, options);

                scanner.startScan()
                    .addOnSuccessListener(barcode ->
                        dispatchQrScanResult(true, barcode.getRawValue(), null)
                    )
                    .addOnCanceledListener(() ->
                        dispatchQrScanResult(false, null, "CANCELLED")
                    )
                    .addOnFailureListener(error ->
                        dispatchQrScanResult(false, null, "FAILED")
                    );
            } catch (Exception error) {
                dispatchQrScanResult(false, null, "FAILED");
            }
        });

        JSONObject payload = new JSONObject();
        try {
            payload.put("ok", true);
            payload.put("supported", true);
            payload.put("status", "REQUESTED");
        } catch (JSONException ignored) {
            return "{\"ok\":false}";
        }
        return payload.toString();
    }

    private void dispatchQrScanResult(boolean ok, String rawValue, String reason) {
        if (webView == null) {
            return;
        }

        JSONObject payload = new JSONObject();
        try {
            payload.put("ok", ok);
            payload.put("platform", "ANDROID");
            if (!isBlank(rawValue)) {
                payload.put("rawValue", rawValue);
            }
            if (!isBlank(reason)) {
                payload.put("reason", reason);
            }
        } catch (JSONException ignored) {
            return;
        }

        mainHandler.post(() -> webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('friemi:android-qr-scan',{detail:"
                + JSONObject.quote(payload.toString())
                + "}))",
            null
        ));
    }

    private void dispatchPushTokenResult(String payloadJson) {
        if (webView == null || payloadJson == null) {
            return;
        }

        mainHandler.post(() -> webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('friemi:android-push-token',{detail:"
                + JSONObject.quote(payloadJson)
                + "}))",
            null
        ));
    }

    private void maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) {
            return;
        }

        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        if (preferences.getBoolean(PREF_NOTIFICATION_PERMISSION_REQUESTED, false)) {
            return;
        }

        preferences.edit().putBoolean(PREF_NOTIFICATION_PERMISSION_REQUESTED, true).apply();
        requestPermissions(
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            NOTIFICATION_PERMISSION_REQUEST_CODE
        );
    }

    void updateBackBehaviorFromBridge(String behaviorJson) {
        boolean intercept = false;
        if (behaviorJson != null) {
            try {
                JSONObject payload = new JSONObject(behaviorJson);
                intercept = payload.optBoolean("interceptBack")
                    || payload.optBoolean("hasModal")
                    || payload.optBoolean("hasSheet");
            } catch (JSONException ignored) {
                intercept = behaviorJson.contains("true");
            }
        }
        boolean finalIntercept = intercept;
        mainHandler.post(() -> webBackRequested = finalIntercept);
    }

    private void openExternal(String url) {
        if (isBlank(url)) {
            return;
        }
        if (loadInternalUrlIfPossible(url)) {
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, url, Toast.LENGTH_SHORT).show();
        }
    }

    private void copyText(String text) {
        if (isBlank(text)) {
            return;
        }
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("Friemi", text));
            Toast.makeText(this, R.string.copied, Toast.LENGTH_SHORT).show();
        }
    }

    private void downloadFile(String url, String contentDisposition, String mimeType) {
        if (isBlank(url)) {
            return;
        }

        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            if (!isBlank(mimeType)) {
                request.setMimeType(mimeType);
            }
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                openExternal(url);
                return;
            }
            manager.enqueue(request);
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            openExternal(url);
        }
    }

    private void saveImageToGallery(String url) {
        if (isBlank(url)) {
            return;
        }

        if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
                PackageManager.PERMISSION_GRANTED
        ) {
            pendingGalleryImageUrl = url;
            requestPermissions(
                new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE },
                GALLERY_PERMISSION_REQUEST_CODE
            );
            return;
        }

        try {
            String mimeType = URLUtil.guessFileName(url, null, null).toLowerCase(Locale.ROOT).endsWith(".gif")
                ? "image/gif"
                : "image/*";
            String fileName = URLUtil.guessFileName(url, null, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_PICTURES,
                "Friemi/" + fileName
            );
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                request.allowScanningByMediaScanner();
            }

            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                openExternal(url);
                return;
            }
            manager.enqueue(request);
            Toast.makeText(this, R.string.image_save_started, Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            openExternal(url);
        }
    }

    private void openAuthBrowser(String url) {
        openAuthBrowser(url, false);
    }

    private void openAuthBrowser(String url, boolean autoRetry) {
        if (isBlank(url)) {
            return;
        }
        if (!autoRetry) {
            pendingAuthBrowserUrl = url;
            pendingAuthStartedAt = System.currentTimeMillis();
            pendingAuthAutoRetryUsed = false;
        }
        try {
            CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(getColorCompat(R.color.friemi_mist))
                .setNavigationBarColor(getColorCompat(R.color.friemi_mist))
                .setNavigationBarDividerColor(getColorCompat(R.color.friemi_sand))
                .setSecondaryToolbarColor(getColorCompat(R.color.friemi_paper))
                .build();
            CustomTabsIntent intent = new CustomTabsIntent.Builder()
                .setColorScheme(CustomTabsIntent.COLOR_SCHEME_LIGHT)
                .setDefaultColorSchemeParams(colors)
                .setShowTitle(true)
                .setUrlBarHidingEnabled(true)
                .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
                .build();
            intent.launchUrl(this, Uri.parse(url));
        } catch (ActivityNotFoundException error) {
            openExternal(url);
        }
    }

    private void maybeResumePendingAuthBrowser() {
        if (isBlank(pendingAuthBrowserUrl) || pendingAuthAutoRetryUsed) {
            return;
        }

        long elapsed = System.currentTimeMillis() - pendingAuthStartedAt;
        if (elapsed < AUTH_BROWSER_AUTO_RETRY_MIN_MS || elapsed > AUTH_BROWSER_AUTO_RETRY_MAX_MS) {
            return;
        }

        pendingAuthAutoRetryUsed = true;
        mainHandler.postDelayed(() -> {
            if (!isBlank(pendingAuthBrowserUrl) && isAuthRoute(currentUrl)) {
                openAuthBrowser(pendingAuthBrowserUrl, true);
            }
        }, 350L);
    }

    private void clearPendingAuthBrowser() {
        pendingAuthBrowserUrl = null;
        pendingAuthStartedAt = 0L;
        pendingAuthAutoRetryUsed = false;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private int getColorCompat(int colorResId) {
        return getResources().getColor(colorResId, getTheme());
    }

    private GradientDrawable roundedDrawable(int fillColor, int strokeColor, int radius, int strokeDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fillColor);
        drawable.setCornerRadius(radius);
        drawable.setStroke(dp(strokeDp), strokeColor);
        return drawable;
    }

    private final class FriemiWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!request.isForMainFrame()) {
                return false;
            }

            if ("friemi".equalsIgnoreCase(uri.getScheme())) {
                loadUrl(normalizeIncomingUri(uri));
                return true;
            }

            if (!isHttp(uri)) {
                openExternal(uri.toString());
                return true;
            }

            if (shouldOpenInAuthBrowser(uri)) {
                openAuthBrowser(uri.toString());
                return true;
            }

            if (shouldLoadClerkHandshakeInWebView(uri)) {
                return false;
            }

            if (!shouldStayInWebView(uri)) {
                openExternal(uri.toString());
                return true;
            }

            if (isFriemiHost(uri.getHost()) && getLocaleFromPath(uri.getPath()) == null) {
                String localizedUrl = uri
                    .buildUpon()
                    .path("/" + resolveLocale(null) + normalizePath(uri.getPath()))
                    .build()
                    .toString();
                view.loadUrl(localizedUrl);
                return true;
            }

            return false;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            currentUrl = url;
            progressBar.setVisibility(View.VISIBLE);
            progressBar.setProgress(20);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            currentUrl = url;
            CookieManager.getInstance().flush();
            if (!isAuthRoute(url)) {
                clearPendingAuthBrowser();
            }
            hideLoading();
            hideError();
            injectAndroidAppContext(true);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) {
                return;
            }
            CharSequence description = error != null ? error.getDescription() : null;
            showError(description != null ? description.toString() : null);
        }

        @Override
        public void onReceivedHttpError(
            WebView view,
            WebResourceRequest request,
            WebResourceResponse errorResponse
        ) {
            if (!request.isForMainFrame() || errorResponse == null) {
                return;
            }
            int statusCode = errorResponse.getStatusCode();
            if (statusCode >= 500) {
                showError("Friemi returned " + statusCode + ". Please try again.");
            }
        }
    }

    private final class FriemiWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
            if (newProgress >= 100) {
                progressBar.setVisibility(View.GONE);
            }
        }

        @Override
        public boolean onShowFileChooser(
            WebView webView,
            ValueCallback<Uri[]> filePathCallback,
            FileChooserParams fileChooserParams
        ) {
            if (MainActivity.this.filePathCallback != null) {
                MainActivity.this.filePathCallback.onReceiveValue(null);
            }
            MainActivity.this.filePathCallback = filePathCallback;

            Intent contentIntent = new Intent(Intent.ACTION_GET_CONTENT);
            contentIntent.addCategory(Intent.CATEGORY_OPENABLE);
            contentIntent.setType("image/*");
            contentIntent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            try {
                startActivityForResult(
                    Intent.createChooser(contentIntent, "Choose image"),
                    FILE_CHOOSER_REQUEST_CODE
                );
            } catch (ActivityNotFoundException error) {
                MainActivity.this.filePathCallback = null;
                return false;
            }
            return true;
        }

        @Override
        public boolean onCreateWindow(
            WebView view,
            boolean isDialog,
            boolean isUserGesture,
            Message resultMsg
        ) {
            WebView popupWebView = new WebView(MainActivity.this);
            popupWebView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if ("friemi".equalsIgnoreCase(uri.getScheme())) {
                        webView.loadUrl(normalizeIncomingUri(uri));
                        popupView.destroy();
                        return true;
                    }

                    if (!isHttp(uri)) {
                        openExternal(uri.toString());
                        popupView.destroy();
                        return true;
                    }

                    if (shouldOpenInAuthBrowser(uri)) {
                        openAuthBrowser(uri.toString());
                        popupView.destroy();
                        return true;
                    }

                    if (shouldLoadClerkHandshakeInWebView(uri)) {
                        webView.loadUrl(uri.toString());
                        popupView.destroy();
                        return true;
                    }

                    if (shouldStayInWebView(uri)) {
                        webView.loadUrl(normalizeIncomingUri(uri));
                    } else {
                        openExternal(uri.toString());
                    }
                    popupView.destroy();
                    return true;
                }
            });

            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popupWebView);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            if (window != null) {
                window.destroy();
            }
        }
    }
}
