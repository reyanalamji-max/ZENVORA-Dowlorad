# ZENVORA Download

This project serves a download-focused landing page for ZENVORA Search. The Windows download is an installer for a desktop app that opens the official ZENVORA Search website; online search and account features require an internet connection. On Android, open the official site in Chrome and use Install app. On iPhone/iPad, open it in Safari and choose Share → Add to Home Screen. These phone installs use the website as an installable web app; this project does not provide a native APK or App Store package.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm start` and open `http://localhost:3000`.

The server listens on localhost by default. The download page is `/` or `/download`. `/download-app` serves the Windows installer after it has been built.

Run `node --test download.test.js` from the project root to check the landing page and installer download response.

## Build the Windows installer

1. In `desktop-app`, run `npm install`.
2. Run `npm run package`.
3. The installer is written to `desktop-app/dist/ZENVORA Search Setup 1.0.0.exe`.

`npm run package` creates an unsigned development installer. Do not publish it as an official release. For a signed release, obtain a trusted Windows code-signing certificate, keep its PFX and password out of the repository, and set `CSC_LINK` to the certificate file and `CSC_KEY_PASSWORD` to its password in a secure build environment. Then run `npm run package:release` from `desktop-app`; this release command fails if a signature cannot be applied. Verify the generated installer with Windows `Get-AuthenticodeSignature` before uploading it.

Signing identifies the publisher and helps build download reputation, but does not guarantee that Windows SmartScreen or browser warnings disappear immediately. New or changed releases can still be warned about until their reputation is established. Do not disable or bypass those protections; publish releases consistently from the official HTTPS domain and submit suspected false positives to the relevant vendor.

The desktop app uses Electron to open `https://zenvora-ttu9.onrender.com/` in a browser-style ZENVORA window with tabs, an address/search bar, and back/forward controls. HTTP and HTTPS links stay inside ZENVORA; links opened in a new window become another ZENVORA tab. Native operating-system and store protocols are blocked rather than launched in another app. It is not an offline copy of the search platform. The app installer is built for Windows x64; mobile devices use the install instructions on the website.

Run `node --test navigation.test.cjs` in `desktop-app` to verify app-internal tabs and native protocol blocking.

## Deploy

Build and test the signed Windows installer with `npm run package:release` before deploying so `/download-app` serves the signed release rather than an unsigned development build. Configure the build environment with the signing secrets; never commit the certificate or its password. For Render, configure the build command to install the server and desktop-app dependencies and create the signed Windows package, then start the server with `npm start`. Only publish an installer that has been tested on a Windows device.
