const { app, BrowserWindow, WebContentsView, dialog, ipcMain, session, shell } = require("electron");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  canGrantMicrophonePermission,
  getBrowserShortcut,
  getFaviconUrl,
  installInAppNavigation,
  isWebUrl,
  normalizeBrowserPreferences,
  reorderTabIds,
  resolveBrowserAddress
} = require("./navigation.cjs");

const START_URL = "https://zenvora-dowlorad.onrender.com/";
const NEW_TAB_URL = "zenvora://newtab";
const DEFAULT_CHROME_HEIGHT = 112;
const PREFERENCES_FILE = "browser-preferences.json";

let window;
let activeTabId = null;
let nextTabId = 1;
const tabs = new Map();
let chromeHeight = DEFAULT_CHROME_HEIGHT;
let preferences = { homepageType: "zenvora", homepageUrl: START_URL, bookmarks: [], theme: "light" };
const downloads = new Map();

function getHomeUrl() {
  if (preferences.homepageType === "custom") return preferences.homepageUrl;
  if (preferences.homepageType === "newtab") return NEW_TAB_URL;
  return START_URL;
}

async function loadPreferences() {
  try {
    const serialized = await readFile(path.join(app.getPath("userData"), PREFERENCES_FILE), "utf8");
    preferences = normalizeBrowserPreferences(JSON.parse(serialized), START_URL);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function loadTab(tab, address) {
  tab.isNewTab = address === NEW_TAB_URL;
  if (tab.isNewTab) {
    void tab.view.webContents.loadFile(path.join(__dirname, "newtab.html")).catch((error) => {
      console.error("Could not load the ZENVORA new-tab page.", error);
    });
    return;
  }
  void tab.view.webContents.loadURL(address).catch((error) => {
    console.error("Could not navigate ZENVORA tab.", error);
  });
}

async function persistPreferences() {
  const userDataDirectory = app.getPath("userData");
  await mkdir(userDataDirectory, { recursive: true });
  await writeFile(path.join(userDataDirectory, PREFERENCES_FILE), `${JSON.stringify(preferences, null, 2)}\n`, {
    mode: 0o600
  });
  ipcMain.handle("browser:set-chrome-height", (event, height) => {
    if (event.sender !== window?.webContents || !Number.isSafeInteger(height) || height < 112 || height > 420) return false;
    chromeHeight = height;
    updateViewBounds();
    return true;
  });
}

async function persistSession() {
  const userDataDirectory = app.getPath("userData");
  await mkdir(userDataDirectory, { recursive: true });
  await writeFile(path.join(userDataDirectory, "browser-session.json"), `${JSON.stringify({
    activeIndex: Math.max(0, [...tabs.keys()].indexOf(activeTabId)),
    urls: [...tabs.values()]
      .map((tab) => tab.isNewTab ? NEW_TAB_URL : tab.view.webContents.getURL())
      .filter((url) => url === NEW_TAB_URL || isWebUrl(url))
  }, null, 2)}\n`, { mode: 0o600 });
}

async function loadSession() {
  try {
    const state = JSON.parse(await readFile(path.join(app.getPath("userData"), "browser-session.json"), "utf8"));
    if (!Array.isArray(state.urls)) return null;
    return {
      urls: state.urls.filter((url) => typeof url === "string" && (url === NEW_TAB_URL || isWebUrl(url))).slice(0, 20),
      activeIndex: Number.isSafeInteger(state.activeIndex) ? state.activeIndex : 0
    };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return null;
  }
}

function getTab(tabId) {
  return tabs.get(tabId);
}

function getTabSnapshot(tab) {
  const webContents = tab.view.webContents;
  return {
    id: tab.id,
    title: tab.title,
    url: tab.isNewTab ? "" : webContents.getURL() || START_URL,
    favicon: tab.favicon,
    loading: webContents.isLoading(),
    canGoBack: webContents.navigationHistory.canGoBack(),
    canGoForward: webContents.navigationHistory.canGoForward()
  };
}

function sendBrowserState() {
  if (!window || window.isDestroyed() || window.webContents.isLoading()) return;
  window.webContents.send("browser:state", {
    activeTabId,
    tabs: [...tabs.values()].map(getTabSnapshot),
    preferences,
    downloads: [...downloads.values()]
  });
}

function sendNavigationState(tab) {
  if (!window || window.isDestroyed() || activeTabId !== tab.id || window.webContents.isLoading()) return;
  window.webContents.send("browser:navigation", getTabSnapshot(tab));
}

function resolveAddress(input) {
  return resolveBrowserAddress(input, new URL(START_URL).origin);
}

function updateViewBounds() {
  if (!window || window.isDestroyed()) return;
  const [width, height] = window.getContentSize();
  const activeTab = getTab(activeTabId);
  if (!activeTab) return;
  activeTab.view.setBounds({
    x: 0,
    y: chromeHeight,
    width,
    height: Math.max(0, height - chromeHeight)
  });
}

function selectTab(tabId) {
  const tab = getTab(tabId);
  if (!window || !tab) return false;

  const previousTab = getTab(activeTabId);
  if (previousTab) window.contentView.removeChildView(previousTab.view);
  activeTabId = tab.id;
  window.contentView.addChildView(tab.view);
  updateViewBounds();
  sendBrowserState();
  sendNavigationState(tab);
  tab.view.webContents.focus();
  return true;
}

function createTab(address = NEW_TAB_URL, shouldFocus = true) {
  if (!window || window.isDestroyed()) return null;

  const tabId = String(nextTabId++);
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const tab = { id: tabId, title: "New tab", view, favicon: getFaviconUrl([], address), isNewTab: false };
  tabs.set(tabId, tab);
  const trustedNewTabUrl = pathToFileURL(path.join(__dirname, "newtab.html")).href;
  installInAppNavigation(view.webContents, (url) => createTab(url, true), trustedNewTabUrl);
  installBrowserKeyboardShortcuts(view.webContents);

  view.webContents.on("page-title-updated", (_event, title) => {
    tab.title = title || new URL(view.webContents.getURL() || START_URL).hostname;
    sendBrowserState();
  });
  view.webContents.on("did-start-loading", () => {
    sendBrowserState();
    sendNavigationState(tab);
  });
  view.webContents.on("did-stop-loading", () => {
    if (tab.title === "New tab") {
      tab.title = new URL(view.webContents.getURL() || START_URL).hostname;
    }
    sendBrowserState();
    sendNavigationState(tab);
  });
  view.webContents.on("did-navigate", () => {
    tab.isNewTab = !isWebUrl(view.webContents.getURL());
    tab.error = "";
    tab.favicon = getFaviconUrl([], view.webContents.getURL() || address);
    sendNavigationState(tab);
    sendBrowserState();
    void persistSession().catch((error) => console.error("Could not save browser tabs.", error));
  });
  view.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    tab.error = `Could not load ${validatedURL}: ${errorDescription || "network error"}. Check the address and connection, then reload.`;
    sendBrowserState();
    sendNavigationState(tab);
  });
  view.webContents.on("did-navigate-in-page", () => {
    tab.isNewTab = !isWebUrl(view.webContents.getURL());
    sendNavigationState(tab);
    void persistSession().catch((error) => console.error("Could not save browser tabs.", error));
  });
  view.webContents.on("page-favicon-updated", (_event, favicons) => {
    tab.favicon = getFaviconUrl(favicons, view.webContents.getURL() || address);
    sendBrowserState();
  });
  view.webContents.on("destroyed", () => {
    if (tabs.get(tabId) !== tab) return;
    tabs.delete(tabId);
    if (activeTabId === tabId) {
      activeTabId = null;
      const nextTab = tabs.values().next().value;
      if (nextTab) selectTab(nextTab.id);
      else if (window && !window.isDestroyed()) createTab(NEW_TAB_URL, true);
    }
    sendBrowserState();
  });

  if (shouldFocus || activeTabId === null) selectTab(tabId);
  loadTab(tab, address);
  void persistSession().catch((error) => console.error("Could not save browser tabs.", error));
  sendBrowserState();
  return tabId;
}

function closeTab(tabId) {
  const tab = getTab(tabId);
  if (!tab || !window || window.isDestroyed()) return;

  const wasActive = activeTabId === tabId;
  if (wasActive) window.contentView.removeChildView(tab.view);
  tabs.delete(tabId);
  if (wasActive) activeTabId = null;
  tab.view.webContents.close();

  if (wasActive) {
    const nextTab = tabs.values().next().value;
    if (nextTab) {
      selectTab(nextTab.id);
    } else {
      createTab(NEW_TAB_URL, true);
    }
  } else {
    sendBrowserState();
  }
  void persistSession().catch((error) => console.error("Could not save browser tabs.", error));
}

function moveTab(tabId, targetId) {
  const currentIds = [...tabs.keys()];
  const reorderedIds = reorderTabIds(currentIds, tabId, targetId);
  if (reorderedIds === currentIds || reorderedIds.length !== tabs.size) return false;
  const orderedTabs = reorderedIds.map((id) => [id, tabs.get(id)]);
  tabs.clear();
  for (const [id, tab] of orderedTabs) tabs.set(id, tab);
  sendBrowserState();
  void persistSession().catch((error) => console.error("Could not save browser tab order.", error));
  return true;
}

function sendDownloads() {
  if (!window || window.isDestroyed() || window.webContents.isLoading()) return;
  window.webContents.send("browser:downloads", [...downloads.values()]);
}

function installBrowserKeyboardShortcuts(webContents) {
  webContents.on("before-input-event", (event, input) => {
    const shortcut = getBrowserShortcut(input, process.platform);
    if (!shortcut) return;

    const currentTab = getTab(activeTabId);
    if (!currentTab) return;

    if (shortcut.action === "new-tab") {
      event.preventDefault();
      createTab(NEW_TAB_URL, true);
    } else if (shortcut.action === "close-tab") {
      event.preventDefault();
      closeTab(currentTab.id);
    } else if (shortcut.action === "focus-address") {
      event.preventDefault();
      window.webContents.send("browser:focus-address");
    } else if (shortcut.action === "downloads") {
      event.preventDefault();
      window.webContents.send("browser:show-downloads");
    } else if (shortcut.action === "fullscreen") {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    } else if (shortcut.action === "cycle-tab") {
      event.preventDefault();
      const openTabs = [...tabs.values()];
      const currentIndex = openTabs.findIndex((tab) => tab.id === activeTabId);
      if (currentIndex !== -1 && openTabs.length > 1) {
        const nextIndex = (currentIndex + shortcut.direction + openTabs.length) % openTabs.length;
        selectTab(openTabs[nextIndex].id);
      }
    } else if (shortcut.action === "select-tab") {
      event.preventDefault();
      const openTabs = [...tabs.values()];
      const targetIndex = shortcut.index === 9 ? openTabs.length - 1 : shortcut.index - 1;
      if (openTabs[targetIndex]) selectTab(openTabs[targetIndex].id);
    }
  });
}

function getSenderTab(event) {
  if (!window || event.sender !== window.webContents) return null;
  return getTab(activeTabId);
}

function registerIpcHandlers() {
  ipcMain.handle("browser:new-tab", (_event, address) => {
    const resolved = typeof address === "string" ? resolveAddress(address) : NEW_TAB_URL;
    if (!resolved) return null;
    return createTab(resolved, true);
  });
  ipcMain.handle("browser:select-tab", (event, tabId) => {
    if (event.sender !== window?.webContents || typeof tabId !== "string") return false;
    return selectTab(tabId);
  });
  ipcMain.handle("browser:close-tab", (event, tabId) => {
    if (event.sender !== window?.webContents || typeof tabId !== "string") return false;
    closeTab(tabId);
    return true;
  });
  ipcMain.handle("browser:move-tab", (event, tabId, targetId) => {
    if (event.sender !== window?.webContents || typeof tabId !== "string" || typeof targetId !== "string") return false;
    return moveTab(tabId, targetId);
  });
  ipcMain.handle("browser:get-preferences", (event) => {
    if (event.sender !== window?.webContents) return null;
    return preferences;
  });
  ipcMain.handle("browser:save-preferences", async (event, value) => {
    if (event.sender !== window?.webContents || !value || typeof value !== "object") return false;
    const updated = normalizeBrowserPreferences(value, START_URL);
    if (value.homepageType === "custom" && updated.homepageUrl === START_URL) return false;
    preferences = updated;
    await persistPreferences();
    sendBrowserState();
    return true;
  });
  ipcMain.handle("browser:toggle-bookmark", async (event, snapshot) => {
    if (event.sender !== window?.webContents || !snapshot || typeof snapshot.url !== "string" || !isWebUrl(snapshot.url)) return null;
    const existing = preferences.bookmarks.findIndex((bookmark) => bookmark.url === snapshot.url);
    if (existing >= 0) preferences.bookmarks.splice(existing, 1);
    else preferences.bookmarks.unshift({
      title: typeof snapshot.title === "string" ? snapshot.title.slice(0, 120) : snapshot.url,
      url: snapshot.url
    });
    await persistPreferences();
    sendBrowserState();
    return { bookmarked: existing < 0, bookmarks: preferences.bookmarks };
  });
  ipcMain.handle("browser:open-download", (event, downloadId) => {
    if (event.sender !== window?.webContents || typeof downloadId !== "string") return false;
    const download = downloads.get(downloadId);
    if (!download || !download.path) return false;
    shell.showItemInFolder(download.path);
    return true;
  });
  ipcMain.handle("browser:toggle-fullscreen", (event) => {
    if (event.sender !== window?.webContents) return false;
    window.setFullScreen(!window.isFullScreen());
    return window.isFullScreen();
  });
  ipcMain.handle("browser:home", (event) => {
    if (event.sender !== window?.webContents) return false;
    const tab = getTab(activeTabId);
    if (!tab) return false;
    loadTab(tab, getHomeUrl());
    return true;
  });
  ipcMain.handle("browser:open-bookmark", (event, bookmarkUrl) => {
    if (event.sender !== window?.webContents || typeof bookmarkUrl !== "string"
      || !preferences.bookmarks.some((bookmark) => bookmark.url === bookmarkUrl)) return false;
    const tab = getTab(activeTabId);
    if (!tab) return false;
    loadTab(tab, bookmarkUrl);
    return true;
  });
  ipcMain.handle("browser:navigate", (event, value) => {
    const tab = getSenderTab(event);
    if (!tab || typeof value !== "string" || value.length > 2048) return false;
    const destination = resolveAddress(value);
    if (!destination) return false;
    loadTab(tab, destination);
    return true;
  });
  ipcMain.handle("browser:back", (event) => {
    const tab = getSenderTab(event);
    if (!tab || !tab.view.webContents.navigationHistory.canGoBack()) return false;
    tab.view.webContents.navigationHistory.goBack();
    return true;
  });
  ipcMain.handle("browser:forward", (event) => {
    const tab = getSenderTab(event);
    if (!tab || !tab.view.webContents.navigationHistory.canGoForward()) return false;
    tab.view.webContents.navigationHistory.goForward();
    return true;
  });
  ipcMain.handle("browser:reload", (event) => {
    const tab = getSenderTab(event);
    if (!tab) return false;
    if (tab.view.webContents.isLoading()) tab.view.webContents.stop();
    else tab.view.webContents.reload();
    return true;
  });
  ipcMain.on("browser:ready", (event) => {
    if (event.sender !== window?.webContents) return;
    if (tabs.size === 0) {
      void loadSession().then((saved) => {
        if (!saved?.urls.length) {
          createTab(getHomeUrl(), true);
          return;
        }
        saved.urls.forEach((url, index) => createTab(url, index === Math.min(saved.activeIndex, saved.urls.length - 1)));
      }).catch((error) => {
        console.error("Could not restore browser tabs.", error);
        createTab(getHomeUrl(), true);
      });
    }
    sendBrowserState();
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 760,
    minHeight: 580,
    show: false,
    title: "ZENVORA",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "zenvora-icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const currentWindow = window;
  installBrowserKeyboardShortcuts(window.webContents);
  window.on("resize", updateViewBounds);
  window.on("closed", () => {
    if (window === currentWindow) {
      window = null;
      activeTabId = null;
      tabs.clear();
    }
  });
  window.once("ready-to-show", () => window.show());
  currentWindow.loadFile(path.join(__dirname, "chrome.html")).catch((error) => {
    console.error("Could not load the ZENVORA tab browser.", error);
    app.quit();
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  void loadPreferences().then(() => {
    const defaultSession = session.defaultSession;
    defaultSession.on("will-download", (_event, item) => {
      const downloadId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const download = {
        id: downloadId,
        filename: item.getFilename(),
        url: item.getURL(),
        path: item.getSavePath(),
        receivedBytes: 0,
        totalBytes: item.getTotalBytes(),
        state: "progressing"
      };
      downloads.set(downloadId, download);
      sendDownloads();
      item.on("updated", (_downloadEvent, state) => {
        download.receivedBytes = item.getReceivedBytes();
        download.totalBytes = item.getTotalBytes();
        download.state = state;
        sendDownloads();
      });
      item.once("done", (_downloadEvent, state) => {
        download.receivedBytes = item.getReceivedBytes();
        download.totalBytes = item.getTotalBytes();
        download.path = item.getSavePath();
        download.state = state;
        sendDownloads();
      });
    });
    createWindow();
  }).catch((error) => {
    console.error("Could not initialize ZENVORA browser preferences.", error);
    app.quit();
  });
  const trustedOrigin = new URL(START_URL).origin;
  let microphoneGranted = false;
  const isTrustedTab = (webContents) => [...tabs.values()]
    .some((tab) => tab.id === activeTabId && tab.view.webContents === webContents);
  const allowAudio = (webContents, permission, details, requestingOrigin) =>
    isTrustedTab(webContents)
    && canGrantMicrophonePermission(webContents, permission, details, requestingOrigin, trustedOrigin);
  const defaultSession = session.defaultSession;
  defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
    microphoneGranted && allowAudio(webContents, permission, details, requestingOrigin));
  defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const trustedAudioRequest = allowAudio(
      webContents,
      permission,
      details,
      details.securityOrigin || details.requestingUrl
    );
    if (!trustedAudioRequest || !window || window.isDestroyed()) {
      callback(false);
      return;
    }
    if (microphoneGranted) {
      callback(true);
      return;
    }

    dialog.showMessageBox(window, {
      type: "question",
      buttons: ["Allow", "Don't allow"],
      defaultId: 1,
      cancelId: 1,
      title: "Microphone access",
      message: "Allow ZENVORA AI to use your microphone?",
      detail: "Your microphone is used only when you start voice chat. Speech is processed by the browser's speech recognition service."
    }).then(({ response }) => {
      microphoneGranted = response === 0;
      callback(microphoneGranted);
    }).catch((error) => {
      console.error("Could not request microphone permission.", error);
      callback(false);
    });
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
