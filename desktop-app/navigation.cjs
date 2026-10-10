function isWebUrl(value) {
  let destination;
  try {
    destination = new URL(value);
  } catch {
    return false;
  }

  return destination.protocol === "https:" || destination.protocol === "http:";
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

module.exports = { installInAppNavigation, isWebUrl };
