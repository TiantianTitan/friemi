# Friemi Android

Friemi Android is an Android Studio WebView shell for the existing mobile web experience.

Current branch scope:

- Load Friemi mobile hall by default: `/{locale}/mobile-home`
- Map Android system language to Friemi locale:
  - `zh* -> zh-CN`
  - `en* -> en`
  - all other languages -> `fr`
- Keep `/home` available through the web UI logo
- Support HTTPS App Links for `https://www.friemi.com/...`
- Support the custom debug scheme `friemi://...`
- Keep most Friemi pages in WebView, while external non-Friemi links open in the system browser
- Open Clerk / Google OAuth in Chrome Custom Tabs instead of WebView, avoiding Google `disallowed_useragent`
- Provide a small `window.FriemiAndroid` JavaScript bridge
- Support image file picking from WebView forms
- Show native loading and error states
- Request and forward Firebase Cloud Messaging tokens when Firebase is configured
- Support portrait, landscape, foldable, and tablet window sizes
- Handle Android system bars and display cutouts through edge-to-edge window insets

FCM requires an Android Firebase config file. Without `google-services.json`, `FriemiAndroid.registerPushToken()` returns a structured `FIREBASE_NOT_CONFIGURED` result and the app keeps working without push.

## Open In Android Studio

Open this folder:

```text
apps/android
```

The project uses:

- Application ID: `com.friemi.app`
- Debug application ID: `com.friemi.app.debug`
- Compile SDK: `36`
- Min SDK: `26`
- Java: `17`

## Android Language Strategy

The current WebView shell is written in Java and can stay that way while it remains stable. Future product-grade native work should use Kotlin by default.

Rules:

- Keep small fixes to the existing Java shell in Java when that is the smallest safe change.
- Add new native modules in Kotlin, including FCM, native notification center, QR check-in, native chat, image / emoji flows, and board game tools.
- Do not keep growing `MainActivity.java` with complex product logic; move new native behavior into Kotlin classes or modules.
- Consider migrating the shell itself to Kotlin later, after the Kotlin modules are stable.

## Debug Base URL

常用生产 / 预览 / 本地构建命令见：

```text
apps/android/docs/build-targets.md
```

Release 发布前加固检查见：

```text
apps/android/docs/release-hardening.md
```

内测 APK / AAB、签名和 Play Console 准备见：

```text
apps/android/docs/internal-testing-release.md
```

隐私政策和权限说明草案见：

```text
apps/android/docs/privacy-permissions.md
```

By default, debug builds load production:

```text
https://www.friemi.com/{locale}/mobile-home
```

To test a local web server from an emulator:

```bash
./gradlew :app:assembleDebug -PfriemiBaseUrl=http://10.0.2.2:3000
```

To test a LAN device:

```bash
./gradlew :app:assembleDebug -PfriemiBaseUrl=http://192.168.x.x:3000
```

To test a Vercel Preview domain and register that same host in the debug manifest:

```bash
./gradlew :app:assembleDebug -PfriemiBaseUrl=https://your-preview.vercel.app
```

If the web host cannot publish a matching `assetlinks.json`, Android may still keep HTTPS callbacks in the browser. In that case the shell automatically retries the pending auth URL once when the user returns to the App, which removes the second manual sign-in tap in most Google / Clerk flows.

The debug build allows cleartext traffic. Release builds should use HTTPS.

## Google / Clerk Sign-In

Google OAuth must not run inside Android WebView. The shell keeps ordinary Friemi pages in WebView, but moves Clerk / Google OAuth URLs into Chrome Custom Tabs. This avoids Google `403: disallowed_useragent`.

Expected flow:

```text
Friemi WebView page
  -> user taps Google / Clerk sign-in
  -> Android opens the auth URL in Chrome Custom Tabs
  -> auth provider redirects to /{locale}/android-auth-complete
  -> that page opens friemi://auth-complete
  -> Android brings the target route back into the WebView shell
```

Production sign-in stability depends on real App Links:

- publish `/.well-known/assetlinks.json`
- include the real release SHA-256 fingerprint
- configure Clerk / Google redirect URLs to land on the Friemi production host

If Custom Tabs completes login but the WebView still does not receive the signed-in session, the next step is a dedicated session handoff route in the web app. Do not work around this by spoofing the WebView user-agent; Google blocks that class of OAuth flow by policy.

The WebView user-agent includes `FriemiAndroid/<version>`. The web sign-in pages use that signal to send successful Android app auth to `/{locale}/android-auth-complete`, which immediately opens `friemi://auth-complete?target=...`.

The shell also has a small fallback for incomplete callback handling: if the user finishes Google login in Custom Tabs and manually returns to Friemi while still on the sign-in page, Android reopens the pending auth URL once. Because Google / Clerk already have the browser session, the second pass should complete quickly without another user tap. This is a fallback, not a substitute for the dedicated Android auth-complete route.

## JavaScript Bridge

The native shell exposes:

```ts
window.FriemiAndroid?.getAppInfo()
window.FriemiAndroid?.saveLocale("zh-CN" | "en" | "fr")
window.FriemiAndroid?.openExternal(url)
window.FriemiAndroid?.openMap(url)
window.FriemiAndroid?.copyText(text)
window.FriemiAndroid?.downloadFile(url)
window.FriemiAndroid?.share(JSON.stringify({ title, text, url }))
window.FriemiAndroid?.registerPushToken()
window.FriemiAndroid?.getStoredPushToken()
window.FriemiAndroid?.scanQrCode()
window.FriemiAndroid?.setBackBehavior(JSON.stringify({ hasModal: true }))
```

`getAppInfo()` returns a JSON string with platform, version, package, base URL, locale, and push placeholder status. The web app also reports modal / sheet state through `setBackBehavior`, so Android back closes open UI first before navigating away.

`registerPushToken()` is asynchronous. The native shell requests the FCM token and dispatches a `friemi:android-push-token` browser event; the web bridge then posts the token to `/api/mobile/devices/register` using the current WebView login session.

`scanQrCode()` opens the native Android QR scanner and dispatches `friemi:android-qr-scan` with a JSON string payload. The web app parses `rawValue` and decides whether it is a friend code, game room code, or another Friemi QR value.

## Firebase Cloud Messaging

To enable Android push notifications:

- Add the Firebase Android app for `com.friemi.app`.
- Put the Firebase config file at `apps/android/app/google-services.json`.
- Do not commit `google-services.json`; it is ignored by `apps/android/.gitignore`.
- Configure web runtime env vars:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY`
- Run the Prisma migration that creates `MobileDevice`.

New native Android push work should be written in Kotlin. The existing Java WebView shell remains in place for now.

## App Links

Production App Links require:

- `apps/android/docs/assetlinks.template.json` copied to the web app as `/.well-known/assetlinks.json`
- Real SHA-256 fingerprints from debug / release signing keys
- Production host `https://www.friemi.com`
- `friemiAppLinkHost` matching the build's `friemiBaseUrl` host

Do not ship placeholder fingerprints.
