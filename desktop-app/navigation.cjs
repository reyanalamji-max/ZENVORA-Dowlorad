function isWebUrl(value) {
  let destination;
  try {
    destination = new URL(value);
  } catch {
    return false;
  }

  return destination.protocol === "https:" || destination.protocol === "http:";
}

function getFaviconUrl(favicons, pageUrl) {
  if (Array.isArray(favicons)) {
    const favicon = favicons.find((candidate) => typeof candidate === "string" && isWebUrl(candidate))
      ?? favicons.find((candidate) => typeof candidate === "string"
        && candidate.length <= 65536
        && /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);/i.test(candidate));
    if (favicon) return favicon;
  }

  try {
    const destination = new URL(pageUrl);
    if (destination.protocol === "https:" || destination.protocol === "http:") {
      return new URL("/favicon.ico", destination.origin).href;
    }
  } catch {
    return null;
  }
  return null;
}

function installInAppNavigation(webContents, openNewTab) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) openNewTab(url);
    return { action: "deny" };
  });

  for (const eventName of ["will-navigate", "will-redirect"]) {
    webContents.on(eventName, (event, url) => {
      if (!isWebUrl(url)) event.preventDefault();
    });
  }
}

function canGrantMicrophonePermission(webContents, permission, details, requestingOrigin, trustedOrigin) {
  if (permission !== "media" || details?.isMainFrame === false) return false;

  const mediaTypes = details?.mediaTypes
    ?? (details?.mediaType ? [details.mediaType] : []);
  if (!Array.isArray(mediaTypes) || !mediaTypes.includes("audio") || mediaTypes.includes("video")) return false;

  try {
    const trusted = new URL(trustedOrigin).origin;
    const requester = new URL(requestingOrigin || details.securityOrigin || details.requestingUrl).origin;
    const currentPage = new URL(webContents.getURL()).origin;
    return trusted === requester && trusted === currentPage;
  } catch {
    return false;
  }
}

function getBrowserShortcut(input, platform) {
  if (input?.type !== "keyDown") return null;
  const modifierPressed = Boolean(input.control) || (platform === "darwin" && Boolean(input.meta));
  if (!modifierPressed || typeof input.key !== "string") return null;

  const key = input.key.toLowerCase();
  if (key === "t") return { action: "new-tab" };
  if (key === "w") return { action: "close-tab" };
  if (key === "l") return { action: "focus-address" };
  if (key === "tab") return { action: "cycle-tab", direction: input.shift ? -1 : 1 };
  if (/^[1-9]$/.test(key)) return { action: "select-tab", index: Number(key) };
  return null;
}

module.exports = {
  canGrantMicrophonePermission,
  getBrowserShortcut,
  getFaviconUrl,
  installInAppNavigation,
  isWebUrl
};
