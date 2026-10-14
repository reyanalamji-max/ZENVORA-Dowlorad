# ZENVORA Download

ZENVORA Search provides web search, saved websites, videos, account features, and a conversational AI page. The AI assistant uses the Gemini API when `GEMINI_API_KEY` is configured and supports typed chat plus browser speech input/output. The API key stays on the server and is never sent to the browser. The Windows download is an installer for a desktop app that opens the official ZENVORA Search website in an in-app browser with site favicons and separate tabs; web links that request a new window open as another tab. Downloads support byte ranges so compatible browsers can resume an interrupted installer transfer. On Android, open the official site in Chrome and use Install app. On iPhone/iPad, open it in Safari and choose Share → Add to Home Screen. These phone installs use the website as an installable web app; this project does not provide a native APK or App Store package.

AI Mode includes an optional hands-free, turn-by-turn voice conversation using browser speech recognition and speech synthesis; this is not a full-duplex telephone call. The Gemini API key must be set as the server-side `GEMINI_API_KEY` environment variable (for example, in Render's private environment settings); do not put it in browser code or commit it. `/api/assistant/status` reports whether AI is configured without returning the key.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm start` and open `http://localhost:3000`.

The server listens on localhost by default. The download page is `/` or `/download`. `/download-app` serves the Windows installer after it has been built.

Run `node --test download.test.js` from the project root to check the landing page and installer download response.

## Build the Windows installer

Run `npm run build` from the project root to install the desktop packaging dependencies and create the Windows installer at `desktop-app/dist/ZENVORA Search Setup 1.0.0.exe`. This is the unsigned development package; do not publish it as an official release. For a signed release, obtain a trusted Windows code-signing certificate, keep its PFX and password out of the repository, and set `CSC_LINK` to the certificate file and `CSC_KEY_PASSWORD` to its password in a secure build environment. Then run `npm run package:release` from `desktop-app`; this release command fails if a signature cannot be applied. Verify the generated installer with Windows `Get-AuthenticodeSignature` before uploading it.

Signing identifies the publisher and helps build download reputation, but does not guarantee that Windows SmartScreen or browser warnings disappear immediately. New or changed releases can still be warned about until their reputation is established. Do not disable or bypass those protections; publish releases consistently from the official HTTPS domain and submit suspected false positives to the relevant vendor.

The desktop app uses Electron to open `https://zenvora-dowlorad.onrender.com/` in a browser-style ZENVORA window with tabs, an address/search bar, and back/forward controls. HTTP and HTTPS links stay inside ZENVORA; links opened in a new window become another ZENVORA tab. Native operating-system and store protocols are blocked rather than launched in another app. It is not an offline copy of the search platform. The native desktop installer is built for Windows x64. On supported browsers, the PWA can be installed on other computers and Android; iPhone/iPad users can add it to their Home Screen from Safari. These browser installs need an internet connection and are not native APK/IPA packages.

Run `node --test navigation.test.cjs` in `desktop-app` to verify app-internal tabs, site favicons, and native protocol blocking.

## Deploy

In Render's service settings, set the **Build Command** to `npm run build` and the **Start Command** to `npm start`. The build installs the desktop packaging tools (including dev dependencies) and creates `desktop-app/dist/ZENVORA Search Setup 1.0.0.exe`, which `/download-app` serves. Redeploy after changing the build command. To publish a signed release instead, configure the build environment with the signing secrets and set the Render build command to `npm install --include=dev --prefix desktop-app && npm run package:release --prefix desktop-app`. Never commit the certificate or its password, and only publish an installer that has been tested on a Windows device.

## Public content, privacy, and indexing

The home page includes server-rendered descriptions and curated external starting points as well as the search interface. The public trust pages are `/about`, `/contact`, `/privacy`, `/terms`, and `/disclaimer`. `/robots.txt` and `/sitemap.xml` are served by the app. Account, search, AI, video-library, Google-app launcher, and outbound-link utility screens are marked not for indexing; they remain available to visitors. Search queries are not intentionally stored by the application. Account names, salted password hashes, and saved website links are stored server-side; see `/privacy` for details and third-party processing.

The existing AdSense account declaration is retained once in the home page. The current application does not load an AdSense ad-serving script or place ads. Adding publisher content and trust information does not guarantee AdSense approval; review all live screens and follow Google’s current program policies before requesting another review.
