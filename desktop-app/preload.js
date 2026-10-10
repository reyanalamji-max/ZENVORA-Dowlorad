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
  }
});
