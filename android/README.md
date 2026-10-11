# ZENVORA Android (Trusted Web Activity)

ZENVORA uses a Trusted Web Activity (TWA) so the Android app opens the existing HTTPS PWA in Chrome. This keeps website authentication and API requests same-origin and avoids copying API credentials into the APK. The Android shell is generated from the deployed PWA manifest; it is not a second backend or a separate copy of the website.

## Before generating the Android project

1. Push the PWA changes to GitHub and wait for Render to deploy them.
2. Confirm `https://zenvora-dowlorad.onrender.com/manifest.webmanifest` returns HTTP 200 and contains the ZENVORA icons.
3. Install Android Studio with the Android SDK and platform tools, and install a supported JDK. Bubblewrap can offer to install missing Android build tools on first use.
4. From the repository root, run `npm run android:init`.
5. In Bubblewrap's prompts, use application ID `com.zenvora.app`, app name `ZENVORA`, and the ZENVORA launcher icon. Create a signing key and store it outside Git; back it up securely. Never commit the keystore or passwords.

Bubblewrap generates the native Android project in `android/app-project/`. It takes the launcher icon, app name, theme, and splash-screen settings from the deployed PWA. The TWA uses Chrome for website features and does not require extra camera, location, or storage permissions. Internet access is required to open the hosted app. After the PWA has loaded at least once, its service worker can show the generic offline page; no account pages, API results, or private data are cached.

## Build and test

From the repository root:

```powershell
npm run android:build
```

Bubblewrap should produce `android/app-project/app-release-signed.apk` for direct device testing and `android/app-project/app-release-bundle.aab` for Google Play submission. Do not distribute either file until the build has completed successfully and the app has been tested on a real Android device. Install the APK over USB with:

```powershell
adb install -r android/app-project/app-release-signed.apk
```

Check sign-in, sign-out, saved websites, search, external Google product links, back navigation, and offline behavior. Keep the same signing key for future updates; losing it can prevent publishing updates to the same Play app.

## Verify the website association

After the first signed build, obtain the **SHA-256 certificate fingerprint of the app-signing certificate**. For Play releases, use the Play App Signing certificate fingerprint (not just the upload key). Set these Render environment variables:

- `ANDROID_APP_ID` = `com.zenvora.app`
- `ANDROID_SHA256_CERT_FINGERPRINTS` = the colon-separated SHA-256 fingerprint; comma-separate fingerprints if both a direct-distribution key and a Play app-signing key are needed.

Redeploy Render, then verify `https://zenvora-dowlorad.onrender.com/.well-known/assetlinks.json` returns the matching Android package and fingerprint. Until that association is configured, Chrome may open the app in a browser custom tab instead of a verified full-screen TWA.

## Distribution and Play Store

For direct download, upload only a successfully built and signed APK to a controlled HTTPS release/download host; publish its real URL on the website only after the file exists and has been device-tested. Do not expose a signing keystore or credentials. For Google Play, upload the signed AAB through Play Console, complete the app listing, privacy/data-safety declarations, content rating, and target-API requirements, and configure Play App Signing. ZENVORA is not published on Google Play by this project.
