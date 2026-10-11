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

module.exports = { getFaviconUrl, installInAppNavigation, isWebUrl };
