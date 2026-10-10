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

The desktop app uses Electron to open `https://zenvora-ttu9.onrender.com/` in a browser-style ZENVORA window with tabs, an address/search bar, and back/forward controls. HTTP and HTTPS links stay inside ZENVORA; links opened in a new window become another ZENVORA tab. Native operating-system and store protocols are blocked rather than launched in another app. It is not an offline copy of the search platform. The app installer is built for Windows x64; mobile devices use the install instructions on the website.

Run `node --test navigation.test.cjs` in `desktop-app` to verify app-internal tabs and native protocol blocking.

## Deploy

Build the Windows installer before deploying so `/download-app` has a file to serve. For Render, configure the build command to install the server and desktop-app dependencies and package the Windows app, then start the server with `npm start`. Only publish an installer that has been tested on a Windows device.
