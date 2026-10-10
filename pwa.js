const INSTALL_BUTTON_LABEL = "Install ZENVORA";
let installPrompt;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIosBrowser() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .catch((error) => console.error("Could not register the ZENVORA offline worker.", error));
  }, { once: true });
}

if (!isInstalled()) {
  const button = document.createElement("button");
  button.className = "pwa-install-button";
  button.type = "button";
  button.textContent = INSTALL_BUTTON_LABEL;
  button.hidden = true;
  button.setAttribute("aria-describedby", "pwa-install-status");

  const status = document.createElement("p");
  status.className = "pwa-install-status";
  status.id = "pwa-install-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  document.body.append(button, status);

  button.addEventListener("click", async () => {
    if (!installPrompt) {
      if (isIosBrowser()) {
        status.textContent = "To install, tap Share in your browser, then choose Add to Home Screen.";
      } else {
        status.textContent = "Use your browser menu and choose Install app or Add to Home screen.";
      }
      return;
    }

    button.disabled = true;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    status.textContent = choice.outcome === "accepted"
      ? "ZENVORA is being installed."
      : "Installation was cancelled.";
    installPrompt = null;
    button.hidden = true;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    button.hidden = true;
    status.textContent = "ZENVORA has been installed.";
  });

  if (isIosBrowser()) button.hidden = false;
}
