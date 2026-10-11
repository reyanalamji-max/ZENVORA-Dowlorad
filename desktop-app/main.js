const { app, BrowserWindow, WebContentsView, ipcMain, shell } = require("electron");
const path = require("node:path");
const { getFaviconUrl, installInAppNavigation, isWebUrl } = require("./navigation.cjs");

const START_URL = "https://zenvora-ttu9.onrender.com/";
const CHROME_HEIGHT = 112;

let window;
let activeTabId = null;
let nextTabId = 1;
const tabs = new Map();

function getTab(tabId) {
  return tabs.get(tabId);
}

function getTabSnapshot(tab) {
  const webContents = tab.view.webContents;
  return {
    id: tab.id,
    title: tab.title,
    url: webContents.getURL() || START_URL,
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
    tabs: [...tabs.values()].map(getTabSnapshot)
  });
}

function sendNavigationState(tab) {
  if (!window || window.isDestroyed() || activeTabId !== tab.id || window.webContents.isLoading()) return;
  window.webContents.send("browser:navigation", getTabSnapshot(tab));
}

function resolveAddress(input) {
  const value = input.trim();
  if (!value) return START_URL;

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    let destination;
    try {
      destination = new URL(value);
    } catch {
      return null;
    }
    return isWebUrl(destination.href) ? destination.href : null;
  }

  if (!/\s/.test(value) && value.includes(".")) {
    try {
      const destination = new URL(`https://${value}`);
      return isWebUrl(destination.href) ? destination.href : null;
    } catch {
      return null;
    }
  }

  return `${START_URL}search?q=${encodeURIComponent(value)}`;
}

function updateViewBounds() {
  if (!window || window.isDestroyed()) return;
  const [width, height] = window.getContentSize();
  const activeTab = getTab(activeTabId);
  if (!activeTab) return;
  activeTab.view.setBounds({
    x: 0,
    y: CHROME_HEIGHT,
    width,
    height: Math.max(0, height - CHROME_HEIGHT)
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

function createTab(address = START_URL, shouldFocus = true) {
  if (!window || window.isDestroyed()) return null;

  const tabId = String(nextTabId++);
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  const tab = { id: tabId, title: "New tab", view, favicon: getFaviconUrl([], address) };
  tabs.set(tabId, tab);
  installInAppNavigation(view.webContents, (url) => createTab(url, true));

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
    tab.favicon = getFaviconUrl([], view.webContents.getURL() || address);
    sendNavigationState(tab);
    sendBrowserState();
  });
  view.webContents.on("did-navigate-in-page", () => sendNavigationState(tab));
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
      else if (window && !window.isDestroyed()) createTab(START_URL, true);
    }
    sendBrowserState();
  });

  if (shouldFocus || activeTabId === null) selectTab(tabId);
  void view.webContents.loadURL(address).catch((error) => {
    console.error("Could not navigate ZENVORA tab.", error);
  });
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
      createTab(START_URL, true);
    }
  } else {
    sendBrowserState();
  }
}

function getSenderTab(event) {
  if (!window || event.sender !== window.webContents) return null;
  return getTab(activeTabId);
}

function registerIpcHandlers() {
  ipcMain.handle("browser:new-tab", (_event, address) => {
    const resolved = typeof address === "string" ? resolveAddress(address) : START_URL;
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
  ipcMain.handle("browser:navigate", (event, value) => {
    const tab = getSenderTab(event);
    if (!tab || typeof value !== "string" || value.length > 2048) return false;
    const destination = resolveAddress(value);
    if (!destination) return false;
    void tab.view.webContents.loadURL(destination).catch((error) => {
      console.error("Could not navigate ZENVORA tab.", error);
    });
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
    if (tabs.size === 0) createTab(START_URL, true);
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
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
