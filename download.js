const note = document.querySelector("#download-note");
const windowsDownload = document.querySelector("#windows-download");
const phoneInstall = document.querySelector("#phone-install");
const phoneInstallLabel = document.querySelector("#phone-install-label");
const phoneInstallHint = document.querySelector("#phone-install-hint");

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

if (windowsDownload) windowsDownload.hidden = !isWindowsDevice;

if (phoneInstall && isMobileDevice) {
  phoneInstall.hidden = false;
  phoneInstallLabel.textContent = isIosDevice()
    ? "Install ZENVORA on iPhone"
    : "Install ZENVORA on Android";
  phoneInstallHint.textContent = isIosDevice()
    ? "Open in Safari, then Share → Add to Home Screen"
    : "Open in Chrome, then tap Install app";
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
