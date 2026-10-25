const { contextBridge, ipcRenderer } = require("electron");

const listeners = new Map();

contextBridge.exposeInMainWorld("zenvoraBrowser", {
  newTab: (address) => ipcRenderer.invoke("browser:new-tab", address),
  selectTab: (tabId) => ipcRenderer.invoke("browser:select-tab", tabId),
  closeTab: (tabId) => ipcRenderer.invoke("browser:close-tab", tabId),
  navigate: (address) => ipcRenderer.invoke("browser:navigate", address),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  home: () => ipcRenderer.invoke("browser:home"),
  moveTab: (tabId, targetId) => ipcRenderer.invoke("browser:move-tab", tabId, targetId),
  toggleBookmark: (snapshot) => ipcRenderer.invoke("browser:toggle-bookmark", snapshot),
  openBookmark: (url) => ipcRenderer.invoke("browser:open-bookmark", url),
  getPreferences: () => ipcRenderer.invoke("browser:get-preferences"),
  savePreferences: (preferences) => ipcRenderer.invoke("browser:save-preferences", preferences),
  openDownload: (downloadId) => ipcRenderer.invoke("browser:open-download", downloadId),
  toggleFullscreen: () => ipcRenderer.invoke("browser:toggle-fullscreen"),
  setChromeHeight: (height) => ipcRenderer.invoke("browser:set-chrome-height", height),
  ready: () => ipcRenderer.send("browser:ready"),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:state", listener);
    listeners.set(callback, ["browser:state", listener]);
    return () => {
      const registered = listeners.get(callback);
      if (registered) ipcRenderer.removeListener(...registered);
      listeners.delete(callback);
    };
  },
  onNavigation: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("browser:navigation", listener);
    listeners.set(callback, ["browser:navigation", listener]);
    return () => {
      const registered = listeners.get(callback);
      if (registered) ipcRenderer.removeListener(...registered);
      listeners.delete(callback);
    };
  },
  onFocusAddress: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("browser:focus-address", listener);
    listeners.set(callback, ["browser:focus-address", listener]);
    return () => {
      const registered = listeners.get(callback);
      if (registered) ipcRenderer.removeListener(...registered);
      listeners.delete(callback);
    };
  },
  onDownloads: (callback) => {
    const listener = (_event, downloads) => callback(downloads);
    ipcRenderer.on("browser:downloads", listener);
    listeners.set(callback, ["browser:downloads", listener]);
    return () => {
      const registered = listeners.get(callback);
      if (registered) ipcRenderer.removeListener(...registered);
      listeners.delete(callback);
    };
  },
  onShowDownloads: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("browser:show-downloads", listener);
    listeners.set(callback, ["browser:show-downloads", listener]);
    return () => {
      const registered = listeners.get(callback);
      if (registered) ipcRenderer.removeListener(...registered);
      listeners.delete(callback);
    };
  }
});
