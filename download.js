const note = document.querySelector("#download-note");
const windowsDownload = document.querySelector("#windows-download");
const phoneInstall = document.querySelector("#phone-install");
const phoneInstallLabel = document.querySelector("#phone-install-label");
const phoneInstallHint = document.querySelector("#phone-install-hint");
const universalInstall = document.querySelector("#universal-install");
const universalInstallHint = document.querySelector("#universal-install-hint");
const windowsDownloadTitle = document.querySelector("#windows-download-title");
const windowsDownloadHint = document.querySelector("#windows-download-hint");
const windowsPlatformCard = document.querySelector(".windows-platform-card");
const windowsDownloadLinks = [...document.querySelectorAll(".windows-download-link")];
let installPrompt = null;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const isAndroidDevice = /Android/i.test(navigator.userAgent);
const isMobileDevice = isIosDevice() || isAndroidDevice;
const isWindowsDevice = navigator.platform.startsWith("Win") || /Windows/i.test(navigator.userAgent);

if (windowsDownload) windowsDownload.hidden = true;
if (windowsPlatformCard) windowsPlatformCard.hidden = !isWindowsDevice;
if (universalInstall) {
  universalInstall.hidden = false;
  universalInstall.addEventListener("click", async (event) => {
    if (!installPrompt) return;
    event.preventDefault();
    universalInstall.setAttribute("aria-busy", "true");
    const promptEvent = installPrompt;
    installPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (note) {
        note.textContent = choice.outcome === "accepted"
          ? "ZENVORA is being installed on this device."
          : "Installation was cancelled. You can still open ZENVORA in your browser.";
      }
    } catch (error) {
      console.error("Could not show the browser install prompt.", error);
      if (note) note.textContent = "The install prompt could not be opened. Use the browser menu or open ZENVORA directly.";
    } finally {
      universalInstall.removeAttribute("aria-busy");
    }
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (universalInstall) {
    universalInstall.hidden = false;
    universalInstallHint.textContent = "Click to install ZENVORA as an app";
  }
});

if (phoneInstall && isMobileDevice) {
  phoneInstall.hidden = false;
  phoneInstallLabel.textContent = isIosDevice()
    ? "Install ZENVORA on iPhone"
    : "Install ZENVORA on Android";
  phoneInstallHint.textContent = isIosDevice()
    ? "Open in Safari, then Share → Add to Home Screen"
    : "Open in Chrome, then tap Install app";
}

if (navigator.serviceWorker && window.isSecureContext) {
  navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((error) => {
    console.error("Could not prepare browser installation.", error);
    if (note) note.textContent = "Browser installation could not be prepared. You can still open ZENVORA directly online.";
  });
}

if (isWindowsDevice && windowsDownloadLinks.length) {
  fetch("/download-app", { method: "HEAD", cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        if (windowsDownloadTitle) windowsDownloadTitle.textContent = "Windows installer temporarily unavailable";
        if (windowsDownloadHint) windowsDownloadHint.textContent = "Use the browser install option below for now";
        for (const link of windowsDownloadLinks) {
          link.setAttribute("aria-disabled", "true");
          link.classList.add("is-unavailable");
          link.title = "The Windows installer is not available right now. Use the browser install option instead.";
          link.addEventListener("click", (event) => event.preventDefault());
        }
        if (note && !isInstalled()) note.textContent = "The Windows installer is temporarily unavailable. You can still install ZENVORA from your browser or open it online.";
        return;
      }
      if (windowsDownload) windowsDownload.hidden = false;
    })
    .catch((error) => {
      console.error("Could not verify the Windows installer.", error);
      if (windowsDownloadTitle) windowsDownloadTitle.textContent = "Windows download could not be checked";
      if (windowsDownloadHint) windowsDownloadHint.textContent = "Use the browser install option below or try again later";
      for (const link of windowsDownloadLinks) {
        link.setAttribute("aria-disabled", "true");
        link.classList.add("is-unavailable");
        link.addEventListener("click", (event) => event.preventDefault());
      }
      if (note && !isInstalled()) note.textContent = "Could not verify the Windows installer. The browser version is still available.";
    });
}

if (note && isInstalled()) {
  note.textContent = "ZENVORA is already installed. Open it from your home screen or app list.";
} else if (note && isIosDevice()) {
  note.textContent = "iPhone/iPad: open ZENVORA Search, tap Share in Safari, then Add to Home Screen. This installs the web app; no App Store download is needed.";
} else if (note && isAndroidDevice) {
  note.textContent = "Android: open ZENVORA Search in Chrome and choose Install app from the browser menu or the install prompt. This installs the web app; no Play Store download is needed.";
} else if (note && isWindowsDevice) {
  note.textContent = "Windows 10/11 (64-bit). Download the installer; ZENVORA Search needs an internet connection.";
} else if (note) {
  note.textContent = "Phones can install ZENVORA from the official website. The desktop installer is available for Windows 10/11 (64-bit).";
}
