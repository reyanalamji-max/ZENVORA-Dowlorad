const addressForm = document.querySelector("#address-form");
const addressInput = document.querySelector("#address-input");
const tabbar = document.querySelector("#tabbar");
const closeTabIcon = document.querySelector(".tab-close").textContent;
let activeTabId = null;
let tabs = [];
let browserPreferences = { homepageType: "zenvora", homepageUrl: "https://zenvora-dowlorad.onrender.com/", bookmarks: [], theme: "light" };
let downloads = [];
let openPanel = "";

function showStatus(message) {
  addressInput.title = message;
  addressInput.setCustomValidity(message);
  addressInput.reportValidity();
  addressInput.setCustomValidity("");
}

function updateToolbar(activeSnapshot) {
  setAddress(activeSnapshot);
  document.querySelector("#back-button").disabled = !activeSnapshot?.canGoBack;
  document.querySelector("#forward-button").disabled = !activeSnapshot?.canGoForward;
  document.querySelector("#reload-button").textContent = activeSnapshot?.loading ? "×" : "↻";
  document.querySelector("#reload-button").setAttribute("aria-label", activeSnapshot?.loading ? "Stop loading" : "Reload");
  const isBookmarked = browserPreferences.bookmarks.some((bookmark) => bookmark.url === activeSnapshot?.url);
  document.querySelector("#bookmark-button").setAttribute("aria-pressed", String(isBookmarked));
  document.querySelector("#bookmark-button").textContent = isBookmarked ? "★" : "☆";
  if (activeSnapshot?.error) showStatus(activeSnapshot.error);
  if (activeSnapshot) document.title = `${activeSnapshot.title || "New tab"} - ZENVORA`;
}

function addPanelHeading(panel, title, close) {
  const heading = document.createElement("div");
  heading.className = "browser-panel-heading";
  const label = document.createElement("strong");
  label.textContent = title;
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "panel-close-button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close panel");
  closeButton.addEventListener("click", close);
  heading.append(label, closeButton);
  panel.append(heading);
}

function makeLinkList(items, emptyMessage, onClick) {
  const list = document.createElement("div");
  list.className = "browser-panel-list";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    empty.textContent = emptyMessage;
    list.append(empty);
    return list;
  }
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-list-item";
    button.textContent = item.title || item.filename || item.url;
    button.title = item.url || item.filename || "";
    button.addEventListener("click", () => onClick(item));
    list.append(button);
  }
  return list;
}

function setPanel(kind, forceRender = false) {
  const panel = document.querySelector("#browser-panel");
  if (openPanel === kind && !forceRender) kind = "";
  openPanel = kind;
  panel.replaceChildren();
  panel.hidden = !kind;
  document.body.classList.toggle("panel-open", Boolean(kind));
  void window.zenvoraBrowser.setChromeHeight(kind ? 326 : 112);
  if (!kind) return;

  if (kind === "bookmarks") {
    addPanelHeading(panel, "Bookmarks", () => setPanel(""));
    panel.append(makeLinkList(browserPreferences.bookmarks, "No bookmarks yet. Select ☆ to save the current page.", (bookmark) => {
      window.zenvoraBrowser.openBookmark(bookmark.url);
      setPanel("");
    }));
    return;
  }

  if (kind === "downloads") {
    addPanelHeading(panel, "Downloads", () => setPanel(""));
    panel.append(makeLinkList(downloads, "Downloads will appear here when a file is downloaded.", (download) => {
      if (download.state === "completed") void window.zenvoraBrowser.openDownload(download.id);
    }));
    return;
  }

  addPanelHeading(panel, "Browser settings", () => setPanel(""));
  const form = document.createElement("form");
  form.className = "browser-settings-form";
  const homeLabel = document.createElement("label");
  homeLabel.textContent = "Home button opens";
  const homeSelect = document.createElement("select");
  homeSelect.name = "homepageType";
  for (const [value, label] of [
    ["zenvora", "ZENVORA homepage"],
    ["newtab", "ZENVORA new tab page"],
    ["custom", "Custom URL"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    homeSelect.append(option);
  }
  homeSelect.value = browserPreferences.homepageType;
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "Custom homepage URL";
  const urlInput = document.createElement("input");
  urlInput.name = "homepageUrl";
  urlInput.type = "url";
  urlInput.placeholder = "https://example.com";
  urlInput.value = browserPreferences.homepageUrl;
  urlInput.hidden = homeSelect.value !== "custom";
  homeSelect.addEventListener("change", () => { urlInput.hidden = homeSelect.value !== "custom"; });
  const themeLabel = document.createElement("label");
  themeLabel.textContent = "Browser theme";
  const themeSelect = document.createElement("select");
  themeSelect.name = "theme";
  for (const theme of ["light", "dark"]) {
    const option = document.createElement("option");
    option.value = theme;
    option.textContent = `${theme[0].toUpperCase()}${theme.slice(1)}`;
    themeSelect.append(option);
  }
  themeSelect.value = browserPreferences.theme;
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "settings-save-button";
  save.textContent = "Save settings";
  form.append(homeLabel, homeSelect, urlLabel, urlInput, themeLabel, themeSelect, save);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const updated = {
      ...browserPreferences,
      homepageType: homeSelect.value,
      homepageUrl: urlInput.value,
      theme: themeSelect.value
    };
    try {
      const saved = await window.zenvoraBrowser.savePreferences(updated);
      if (!saved) {
        showStatus("Enter a valid HTTP or HTTPS URL for your custom homepage.");
        return;
      }
      browserPreferences = { ...updated, homepageUrl: updated.homepageType === "custom" ? new URL(updated.homepageUrl).href : browserPreferences.homepageUrl };
      document.documentElement.dataset.theme = browserPreferences.theme;
      setPanel("");
    } catch (error) {
      console.error("Could not save browser settings.", error);
      showStatus("Could not save settings. Please try again.");
    }
  });
  panel.append(form);
}

function setAddress(snapshot) {
  if (!snapshot || document.activeElement === addressInput) return;
  addressInput.value = snapshot.url || "";
}

function renderTabs() {
  const activeSnapshot = tabs.find((tab) => tab.id === activeTabId);
  const tabButtons = tabs.map((tab) => {
    const item = document.createElement("button");
    item.className = `tab-item${tab.id === activeTabId ? " is-active" : ""}${tab.loading ? " is-loading" : ""}`;
    item.type = "button";
    item.setAttribute("role", "tab");
    item.setAttribute("aria-selected", String(tab.id === activeTabId));
    item.setAttribute("aria-label", tab.title || "New tab");
    item.title = tab.title || "New tab";
    item.draggable = true;
    item.addEventListener("click", () => window.zenvoraBrowser.selectTab(tab.id));
    item.addEventListener("auxclick", (event) => {
      if (event.button === 1) window.zenvoraBrowser.closeTab(tab.id);
    });
    item.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", tab.id);
      event.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      if (draggedId && draggedId !== tab.id) void window.zenvoraBrowser.moveTab(draggedId, tab.id);
    });

    const icon = document.createElement("img");
    icon.className = "tab-favicon";
    icon.alt = "";
    icon.src = tab.favicon || "zenvora-icon.png";
    icon.addEventListener("error", () => {
      icon.onerror = null;
      icon.src = "zenvora-icon.png";
    }, { once: true });

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "New tab";

    const loading = document.createElement("span");
    loading.className = "tab-loading";
    loading.setAttribute("aria-hidden", "true");

    const close = document.createElement("span");
    close.className = "tab-close";
    close.setAttribute("aria-hidden", "true");
    close.textContent = closeTabIcon;
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      window.zenvoraBrowser.closeTab(tab.id);
    });
    item.append(icon, title, loading, close);
    return item;
  });

  const newTabButton = document.querySelector("#new-tab");
  tabbar.replaceChildren(...tabButtons, newTabButton);
  if (activeSnapshot) {
    updateToolbar(activeSnapshot);
  }
}

window.zenvoraBrowser.onState((state) => {
  tabs = state.tabs;
  activeTabId = state.activeTabId;
  browserPreferences = state.preferences || browserPreferences;
  downloads = state.downloads || downloads;
  document.documentElement.dataset.theme = browserPreferences.theme;
  renderTabs();
});

window.zenvoraBrowser.onNavigation((snapshot) => {
  if (!snapshot || snapshot.id !== activeTabId) return;
  updateToolbar(snapshot);
});

window.zenvoraBrowser.onDownloads((items) => {
  downloads = items;
  if (openPanel === "downloads") setPanel("downloads", true);
});
window.zenvoraBrowser.onShowDownloads(() => setPanel("downloads"));

document.querySelector("#new-tab").addEventListener("click", () => {
  window.zenvoraBrowser.newTab();
});
document.querySelector("#back-button").addEventListener("click", () => {
  window.zenvoraBrowser.back();
});
document.querySelector("#forward-button").addEventListener("click", () => {
  window.zenvoraBrowser.forward();
});
document.querySelector("#reload-button").addEventListener("click", () => {
  window.zenvoraBrowser.reload();
});
document.querySelector("#home-button").addEventListener("click", () => {
  window.zenvoraBrowser.home();
});
document.querySelector("#bookmark-button").addEventListener("click", async () => {
  const activeSnapshot = tabs.find((tab) => tab.id === activeTabId);
  if (!activeSnapshot) return;
  try {
    const result = await window.zenvoraBrowser.toggleBookmark(activeSnapshot);
    if (!result) {
      showStatus("Only HTTP and HTTPS pages can be bookmarked.");
      return;
    }
    browserPreferences.bookmarks = result.bookmarks;
    updateToolbar(activeSnapshot);
  } catch (error) {
    console.error("Could not update browser bookmark.", error);
    showStatus("Could not update bookmark. Please try again.");
  }
});
document.querySelector("#bookmarks-panel-button").addEventListener("click", () => setPanel("bookmarks"));
document.querySelector("#downloads-button").addEventListener("click", () => setPanel("downloads"));
document.querySelector("#settings-button").addEventListener("click", () => setPanel("settings"));
document.querySelector("#fullscreen-button").addEventListener("click", () => window.zenvoraBrowser.toggleFullscreen());
document.querySelector("#more-button").addEventListener("click", () => {
  window.zenvoraBrowser.newTab();
});
document.querySelector("#ask-ai-button").addEventListener("click", () => {
  window.zenvoraBrowser.navigate("https://zenvora-dowlorad.onrender.com/assistant");
});
window.zenvoraBrowser.onFocusAddress(() => {
  addressInput.focus();
  addressInput.select();
});
addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  window.zenvoraBrowser.navigate(addressInput.value);
  addressInput.blur();
});

window.zenvoraBrowser.ready();
