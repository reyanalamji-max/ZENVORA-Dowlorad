const INTERNAL_ROUTES = new Map([
  ["/", "ZENVORA Search"],
  ["/search", "Search"],
  ["/apps", "Apps"],
  ["/videos", "Videos"],
  ["/assistant", "ZENVORA AI"],
  ["/account", "Account"],
  ["/admin", "Administration"],
  ["/open", "Open website"],
  ["/download", "Downloads"],
  ["/about", "About ZENVORA"],
  ["/contact", "Contact"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/disclaimer", "Disclaimer"],
  ["/browser", "New tab"]
]);
const STORAGE_KEY = "zenvora-browser-state-v1";
const FALLBACK_ICON = "/icons/icon-192.png";
const apps = [
  { title: "ZENVORA Search", url: "/", icon: "Z" },
  { title: "Apps", url: "/apps", icon: "A" },
  { title: "Videos", url: "/videos", icon: "▶" },
  { title: "ZENVORA AI", url: "/assistant", icon: "✦" },
  { title: "Account", url: "/account", icon: "●" },
  { title: "ChatGPT", url: "https://chatgpt.com/", icon: "C" },
  { title: "YouTube", url: "https://www.youtube.com/", icon: "▶" },
  { title: "Gmail", url: "https://mail.google.com/", icon: "M" },
  { title: "GitHub", url: "https://github.com/", icon: "⌘" }
];
let tabs = [];
let activeId = "";
let state = { bookmarks: [], recent: [], shortcuts: [], homepageType: "zenvora", homepageUrl: "/", theme: "light" };
let panelType = "";

const tabsElement = document.querySelector("#web-tabs");
const contentElement = document.querySelector("#web-content");
const addressInput = document.querySelector("#web-address");
const statusElement = document.querySelector("#web-status");
const panelElement = document.querySelector("#web-panel");

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeInternalUrl(value) {
  let destination;
  try {
    destination = new URL(value, window.location.origin);
  } catch {
    return null;
  }
  if (destination.origin !== window.location.origin || !INTERNAL_ROUTES.has(destination.pathname)) return null;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value, window.location.origin).protocol);
  } catch {
    return false;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabs: tabs.map(({ id, url, title, history, historyIndex }) => ({ id, url, title, history, historyIndex })),
      activeId,
      bookmarks: state.bookmarks,
      recent: state.recent.slice(0, 8),
      shortcuts: state.shortcuts,
      homepageType: state.homepageType,
      homepageUrl: state.homepageUrl,
      theme: state.theme
    }));
  } catch (error) {
    console.error("Could not save ZENVORA browser state.", error);
    statusElement.textContent = "Browser data could not be saved. Check available site storage.";
  }
}

function setStatus(message) {
  statusElement.textContent = message;
  if (message) window.setTimeout(() => {
    if (statusElement.textContent === message) statusElement.textContent = "";
  }, 6000);
}

function currentTab() {
  return tabs.find((tab) => tab.id === activeId);
}

function rememberPage(url, title) {
  if (url === "/browser" || url.startsWith("/browser?")) return;
  state.recent = [{ url, title }, ...state.recent.filter((item) => item.url !== url)].slice(0, 8);
  saveState();
}

function navigateTab(tab, url, pushHistory = true) {
  const internalUrl = normalizeInternalUrl(url);
  if (!internalUrl) {
    openExternal(url);
    return false;
  }
  if (pushHistory && tab.url !== internalUrl) {
    tab.history.splice(tab.historyIndex + 1);
    tab.history.push(internalUrl);
    tab.historyIndex = tab.history.length - 1;
  } else if (!tab.history.length) {
    tab.history = [internalUrl];
    tab.historyIndex = 0;
  }
  tab.url = internalUrl;
  tab.title = INTERNAL_ROUTES.get(new URL(internalUrl, window.location.origin).pathname) || "ZENVORA";
  tab.externalUrl = "";
  tab.error = "";
  const isNewTab = new URL(internalUrl, window.location.origin).pathname === "/browser";
  tab.loading = !isNewTab;
  if (isNewTab) {
    tab.frame.hidden = true;
    tab.dashboard.hidden = false;
    renderDashboard(tab);
  } else {
    tab.dashboard.hidden = true;
    tab.frame.hidden = false;
    tab.frame.src = internalUrl;
  }
  if (tab.id === activeId) {
    addressInput.value = isNewTab ? "" : `${window.location.origin}${internalUrl}`;
    document.querySelector("#web-back").disabled = tab.historyIndex <= 0;
    document.querySelector("#web-forward").disabled = tab.historyIndex >= tab.history.length - 1;
    updateBookmarkButton();
    updateLoadingButtons();
  }
  rememberPage(internalUrl, tab.title);
  renderTabs();
  saveState();
  return true;
}

function openExternal(value) {
  let target;
  try {
    target = new URL(value, window.location.origin);
  } catch {
    setStatus("That address is not a valid website.");
    return;
  }
  if (!["https:", "http:"].includes(target.protocol)) {
    setStatus("For your safety, only HTTP and HTTPS websites can be opened.");
    return;
  }
  window.open(target.href, "_blank", "noopener,noreferrer");
  setStatus(`Opened ${target.hostname} in a browser tab. The web version keeps ZENVORA pages inside its own tab workspace.`);
}

function resolveAddress(value) {
  const text = value.trim();
  if (!text) return "/";
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(text)) return text;
  if (!/\s/.test(text) && text.includes(".")) return `https://${text}`;
  return `/search?q=${encodeURIComponent(text)}`;
}

function renderTabs() {
  tabsElement.replaceChildren(...tabs.map((tab) => {
    const button = document.createElement("div");
    button.className = "web-tab";
    button.draggable = true;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.id === activeId));
    button.setAttribute("aria-label", tab.title);
    button.tabIndex = tab.id === activeId ? 0 : -1;
    button.addEventListener("click", (event) => {
      if (!event.target.closest(".web-tab-close")) activateTab(tab.id);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateTab(tab.id);
      }
    });
    button.addEventListener("auxclick", (event) => {
      if (event.button === 1) closeTab(tab.id);
    });
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", tab.id);
      event.dataTransfer.effectAllowed = "move";
    });
    button.addEventListener("dragover", (event) => { event.preventDefault(); });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      reorderTabs(event.dataTransfer.getData("text/plain"), tab.id);
    });
    const select = document.createElement("span");
    select.className = "web-tab-select";
    const icon = document.createElement("img");
    icon.className = "web-tab-favicon";
    icon.alt = "";
    icon.src = tab.favicon || FALLBACK_ICON;
    const title = document.createElement("span");
    title.className = "web-tab-title";
    title.textContent = tab.title;
    const close = document.createElement("button");
    close.className = "web-tab-close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", `Close ${tab.title}`);
    close.addEventListener("click", (event) => { event.stopPropagation(); closeTab(tab.id); });
    select.append(icon, title);
    button.append(select, close);
    return button;
  }));
}

function createTab(url = "/browser", focus = true) {
  const tab = {
    id: newId(),
    url: "",
    title: "New tab",
    favicon: FALLBACK_ICON,
    history: [],
    historyIndex: -1,
    externalUrl: "",
    loading: false,
    frame: document.createElement("iframe"),
    dashboard: document.createElement("div")
  };
  tab.frame.className = "web-page-frame";
  tab.frame.title = "ZENVORA page";
  tab.frame.referrerPolicy = "same-origin";
  tab.dashboard.className = "new-tab-page";
  contentElement.append(tab.frame, tab.dashboard);
  tab.frame.addEventListener("load", () => {
    try {
      const frameWindow = tab.frame.contentWindow;
      const frameDocument = tab.frame.contentDocument;
      tab.loading = false;
      updateLoadingButtons();
      if (frameWindow.location.origin !== window.location.origin) {
        const externalUrl = frameWindow.location.href;
        tab.frame.hidden = true;
        tab.dashboard.hidden = false;
        renderExternalNotice(tab, externalUrl);
        return;
      }
      const internalUrl = normalizeInternalUrl(frameWindow.location.href);
      if (!internalUrl) return;
      tab.url = internalUrl;
      tab.title = frameDocument.title || INTERNAL_ROUTES.get(new URL(internalUrl, window.location.origin).pathname) || "ZENVORA";
      tab.favicon = frameDocument.querySelector('link[rel~="icon"]')?.href || FALLBACK_ICON;
      tab.error = "";
      bindFrameLinks(tab);
      if (tab.id === activeId) {
        addressInput.value = `${window.location.origin}${internalUrl}`;
        updateBookmarkButton();
        document.title = `${tab.title} - ZENVORA Browser`;
      }
      rememberPage(internalUrl, tab.title);
      renderTabs();
      saveState();
    } catch {
      const failedUrl = tab.url;
      if (!failedUrl) return;
      tab.frame.hidden = true;
      tab.dashboard.hidden = false;
      renderExternalNotice(tab, failedUrl);
    }
  });
  tabs.push(tab);
  if (focus || !activeId) activeId = tab.id;
  renderTabs();
  navigateTab(tab, url);
  if (focus) activateTab(tab.id);
  return tab;
}

function renderExternalNotice(tab, url) {
  tab.externalUrl = url;
  tab.dashboard.replaceChildren();
  const notice = document.createElement("section");
  notice.className = "external-notice";
  const heading = document.createElement("h2");
  heading.textContent = "This site opens outside the ZENVORA web workspace";
  const copy = document.createElement("p");
  copy.textContent = "Some external services block embedding or need their own secure sign-in context. Open it in a regular browser tab to continue.";
  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Open in a new browser tab";
  open.addEventListener("click", () => openExternal(url));
  notice.append(heading, copy, open);
  tab.dashboard.append(notice);
  if (tab.id === activeId) setStatus("This external page cannot be embedded safely in the web version.");
}

function bindFrameLinks(tab) {
  const frameDocument = tab.frame.contentDocument;
  const navigateLink = (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    const anchor = event.target.closest("a[href]");
    if (!anchor) return;
    const targetUrl = new URL(anchor.href, window.location.origin);
    const internalUrl = normalizeInternalUrl(targetUrl.href);
    if (event.button === 1 || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (internalUrl) createTab(internalUrl, true);
      else openExternal(targetUrl.href);
      return;
    }
    if (anchor.target === "_blank") event.preventDefault();
    if (!internalUrl) {
      openExternal(targetUrl.href);
    } else if (anchor.target === "_blank") {
      event.preventDefault();
      createTab(internalUrl, true);
    } else {
      event.preventDefault();
      navigateTab(tab, internalUrl);
    }
  };
  frameDocument.addEventListener("click", navigateLink, { capture: true });
  frameDocument.addEventListener("auxclick", (event) => {
    if (event.button === 1) navigateLink(event);
  }, { capture: true });
}

function activateTab(id) {
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;
  activeId = id;
  for (const item of tabs) {
    item.frame.hidden = item.id !== id || new URL(item.url, window.location.origin).pathname === "/browser";
    item.dashboard.hidden = item.id !== id || new URL(item.url, window.location.origin).pathname !== "/browser";
  }
  addressInput.value = new URL(tab.url, window.location.origin).pathname === "/browser"
    ? ""
    : `${window.location.origin}${tab.url}`;
  document.querySelector("#web-back").disabled = tab.historyIndex <= 0;
  document.querySelector("#web-forward").disabled = tab.historyIndex >= tab.history.length - 1;
  updateBookmarkButton();
  updateLoadingButtons();
  document.title = `${tab.title} - ZENVORA Browser`;
  renderTabs();
  saveState();
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  tab.frame.remove();
  tab.dashboard.remove();
  if (!tabs.length) {
    activeId = "";
    createTab("/browser");
    return;
  }
  if (activeId === id) activateTab(tabs[Math.min(index, tabs.length - 1)].id);
  else {
    renderTabs();
    saveState();
  }
}

function reorderTabs(draggedId, targetId) {
  const from = tabs.findIndex((tab) => tab.id === draggedId);
  const to = tabs.findIndex((tab) => tab.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  tabs.splice(to, 0, tabs.splice(from, 1)[0]);
  renderTabs();
  saveState();
}

function renderDashboard(tab) {
  const root = document.createElement("div");
  root.className = "new-tab-inner";
  const logo = document.createElement("img");
  logo.className = "new-tab-logo";
  logo.src = "/logo.svg";
  logo.alt = "";
  const heading = document.createElement("h1");
  heading.textContent = "Welcome to ZENVORA";
  const subtitle = document.createElement("p");
  subtitle.className = "new-tab-subtitle";
  subtitle.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date());
  const searchForm = document.createElement("form");
  searchForm.className = "new-tab-search";
  const searchInput = document.createElement("input");
  searchInput.placeholder = "Search the web or enter a website";
  searchInput.setAttribute("aria-label", "Search or enter a website");
  const searchButton = document.createElement("button");
  searchButton.type = "submit";
  searchButton.textContent = "Search";
  searchForm.append(searchInput, searchButton);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = resolveAddress(searchInput.value);
    if (normalizeInternalUrl(value)) navigateTab(tab, value);
    else openExternal(value);
  });
  root.append(logo, heading, subtitle, searchForm);
  root.append(makeDashboardSection("Quick access", state.shortcuts.length ? state.shortcuts : apps, (item) => {
    if (normalizeInternalUrl(item.url)) navigateTab(tab, item.url);
    else openExternal(item.url);
  }, true));
  const lists = document.createElement("div");
  lists.className = "new-tab-lists";
  lists.append(
    makeSimpleList("Bookmarks", state.bookmarks, (item) => navigateTab(tab, item.url)),
    makeSimpleList("Recently visited", state.recent, (item) => navigateTab(tab, item.url))
  );
  root.append(lists);
  tab.dashboard.replaceChildren(root);
}

function makeDashboardSection(title, items, onClick, allowAdd) {
  const section = document.createElement("section");
  section.className = "new-tab-section";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "shortcut-grid";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shortcut-card";
    button.addEventListener("click", () => onClick(item));
    const icon = document.createElement("span");
    icon.className = "shortcut-icon";
    icon.textContent = item.icon || (item.title || "Z")[0].toUpperCase();
    const label = document.createElement("span");
    label.textContent = item.title;
    button.append(icon, label);
    if (allowAdd && state.shortcuts.includes(item)) {
      const remove = document.createElement("span");
      remove.className = "shortcut-delete";
      remove.textContent = "×";
      remove.setAttribute("role", "button");
      remove.setAttribute("aria-label", `Remove ${item.title}`);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        state.shortcuts = state.shortcuts.filter((shortcut) => shortcut.url !== item.url);
        saveState();
        renderDashboard(currentTab());
      });
      button.append(remove);
    }
    grid.append(button);
  }
  if (allowAdd) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "new-tab-add";
    add.textContent = "Add shortcut";
    add.addEventListener("click", () => showShortcutForm(grid));
    grid.append(add);
  }
  section.append(heading, grid);
  return section;
}

function showShortcutForm(grid) {
  const form = document.createElement("form");
  form.className = "add-shortcut-form";
  const titleInput = document.createElement("input");
  titleInput.required = true;
  titleInput.maxLength = 48;
  titleInput.placeholder = "Shortcut name";
  titleInput.setAttribute("aria-label", "Shortcut name");
  const urlInput = document.createElement("input");
  urlInput.required = true;
  urlInput.type = "url";
  urlInput.placeholder = "https://example.com";
  urlInput.setAttribute("aria-label", "Shortcut URL");
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => renderDashboard(currentTab()));
  form.append(titleInput, urlInput, save, cancel);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      setStatus("Enter a name for this shortcut.");
      titleInput.focus();
      return;
    }
    let destination;
    try {
      const rawUrl = urlInput.value.trim();
      destination = new URL(/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      setStatus("Enter a valid HTTP or HTTPS website address.");
      urlInput.focus();
      return;
    }
    if (!["https:", "http:"].includes(destination.protocol)) {
      setStatus("Enter a valid HTTP or HTTPS website address.");
      urlInput.focus();
      return;
    }
    state.shortcuts = [...state.shortcuts.filter((item) => item.url !== destination.href), {
      title,
      url: destination.href,
      icon: title[0].toUpperCase()
    }];
    saveState();
    renderDashboard(currentTab());
  });
  grid.replaceChildren(form);
  titleInput.focus();
}

function makeSimpleList(title, items, onClick) {
  const section = document.createElement("section");
  section.className = "new-tab-section";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "new-tab-list";
  for (const item of items.slice(0, 6)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.title;
    button.title = item.url;
    button.addEventListener("click", () => onClick(item));
    list.append(button);
  }
  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "panel-empty";
    empty.textContent = "Nothing here yet";
    list.append(empty);
  }
  section.append(heading, list);
  return section;
}

function updateBookmarkButton() {
  const tab = currentTab();
  const saved = state.bookmarks.some((bookmark) => bookmark.url === tab?.url);
  const button = document.querySelector("#web-bookmark");
  button.setAttribute("aria-pressed", String(saved));
  button.textContent = saved ? "★" : "☆";
}

function updateLoadingButtons() {
  const loading = Boolean(currentTab()?.loading);
  document.querySelector("#web-reload").hidden = loading;
  document.querySelector("#web-stop").hidden = !loading;
}

function togglePanel(type) {
  if (panelType === type) {
    panelType = "";
    panelElement.hidden = true;
    panelElement.replaceChildren();
    return;
  }
  panelType = type;
  panelElement.hidden = false;
  panelElement.replaceChildren();
  const close = document.createElement("button");
  close.className = "panel-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close panel");
  close.addEventListener("click", () => togglePanel(type));
  const heading = document.createElement("h2");
  heading.textContent = type === "settings" ? "Browser settings" : type[0].toUpperCase() + type.slice(1);
  panelElement.append(close, heading);
  if (type === "settings") renderSettingsForm();
  else if (type === "downloads") {
    const entry = document.createElement("p");
    entry.className = "panel-empty";
    entry.textContent = "Downloads are managed by your browser. Open your browser’s downloads page to see file transfers.";
    panelElement.append(entry);
  } else {
    const entries = type === "bookmarks" ? state.bookmarks : apps;
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "panel-empty";
      empty.textContent = "No bookmarks yet. Use ☆ to save the current page.";
      panelElement.append(empty);
    }
    for (const item of entries) {
      const button = document.createElement("button");
      button.className = "panel-entry";
      button.type = "button";
      button.textContent = item.title;
      button.addEventListener("click", () => {
        const tab = currentTab();
        if (normalizeInternalUrl(item.url)) navigateTab(tab, item.url);
        else openExternal(item.url);
        togglePanel(type);
      });
      panelElement.append(button);
    }
  }
}

function renderSettingsForm() {
  const form = document.createElement("form");
  form.className = "web-settings";
  const homeLabel = document.createElement("label");
  homeLabel.textContent = "Home button";
  const home = document.createElement("select");
  for (const [value, label] of [["zenvora", "ZENVORA homepage"], ["newtab", "New tab page"], ["custom", "Custom URL"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    home.append(option);
  }
  home.value = state.homepageType;
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "Custom homepage URL";
  const url = document.createElement("input");
  url.type = "text";
  url.inputMode = "url";
  url.placeholder = "https://example.com";
  url.value = state.homepageUrl;
  const themeLabel = document.createElement("label");
  themeLabel.textContent = "Theme";
  const theme = document.createElement("select");
  for (const value of ["light", "dark"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${value[0].toUpperCase()}${value.slice(1)}`;
    theme.append(option);
  }
  theme.value = state.theme;
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save settings";
  form.append(homeLabel, home, urlLabel, url, themeLabel, theme, save);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    let homepageUrl = url.value.trim();
    if (home.value === "custom") {
      const internalUrl = normalizeInternalUrl(homepageUrl);
      try {
        if (internalUrl) homepageUrl = internalUrl;
        else {
          const address = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(homepageUrl) ? homepageUrl : `https://${homepageUrl}`;
          const destination = new URL(address);
          if (!["http:", "https:"].includes(destination.protocol)) throw new Error("Unsupported homepage protocol");
          homepageUrl = destination.href;
        }
      } catch {
        setStatus("Enter a valid HTTP or HTTPS homepage URL.");
        url.focus();
        return;
      }
    }
    state.homepageType = home.value;
    state.homepageUrl = homepageUrl;
    state.theme = theme.value;
    document.documentElement.dataset.theme = state.theme;
    saveState();
    togglePanel("settings");
  });
  panelElement.append(form);
}

document.querySelector("#web-new-tab").addEventListener("click", () => createTab("/browser"));
document.querySelector("#web-back").addEventListener("click", () => {
  const tab = currentTab();
  if (tab.historyIndex > 0) navigateTab(tab, tab.history[--tab.historyIndex], false);
});
document.querySelector("#web-forward").addEventListener("click", () => {
  const tab = currentTab();
  if (tab.historyIndex < tab.history.length - 1) navigateTab(tab, tab.history[++tab.historyIndex], false);
});
document.querySelector("#web-reload").addEventListener("click", () => {
  const tab = currentTab();
  if (tab.url) navigateTab(tab, tab.url, false);
});
document.querySelector("#web-stop").addEventListener("click", () => {
  const tab = currentTab();
  if (!tab?.loading) return;
  try {
    tab.frame.contentWindow.stop();
    tab.loading = false;
    updateLoadingButtons();
    setStatus("Page loading stopped.");
  } catch (error) {
    console.error("Could not stop the current page load.", error);
    setStatus("Could not stop loading this page.");
  }
});
document.querySelector("#web-home").addEventListener("click", () => {
  const tab = currentTab();
  const target = state.homepageType === "newtab" ? "/browser"
    : state.homepageType === "custom" ? state.homepageUrl : "/";
  if (normalizeInternalUrl(target)) navigateTab(tab, target);
  else openExternal(target);
});
document.querySelector("#web-address-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const destination = resolveAddress(addressInput.value);
  if (normalizeInternalUrl(destination)) navigateTab(currentTab(), destination);
  else openExternal(destination);
});
document.querySelector("#web-bookmark").addEventListener("click", () => {
  const tab = currentTab();
  if (!tab || !normalizeInternalUrl(tab.url) || tab.url === "/browser") return;
  const existing = state.bookmarks.findIndex((bookmark) => bookmark.url === tab.url);
  if (existing >= 0) state.bookmarks.splice(existing, 1);
  else state.bookmarks.unshift({ title: tab.title, url: tab.url });
  state.bookmarks = state.bookmarks.slice(0, 100);
  saveState();
  updateBookmarkButton();
  setStatus(existing >= 0 ? "Bookmark removed." : "Page bookmarked.");
});
document.querySelector("#web-bookmarks").addEventListener("click", () => togglePanel("bookmarks"));
document.querySelector("#web-downloads").addEventListener("click", () => togglePanel("downloads"));
document.querySelector("#web-settings").addEventListener("click", () => togglePanel("settings"));
document.querySelector("#web-fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    console.error("Could not toggle browser fullscreen.", error);
    setStatus("Fullscreen is unavailable in this browser window.");
  }
});
document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  if (key === "t") {
    event.preventDefault();
    createTab("/browser");
  } else if (key === "w") {
    event.preventDefault();
    closeTab(activeId);
  } else if (key === "l") {
    event.preventDefault();
    addressInput.focus();
    addressInput.select();
  } else if (key === "tab") {
    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.id === activeId);
    const nextIndex = (currentIndex + (event.shiftKey ? -1 : 1) + tabs.length) % tabs.length;
    activateTab(tabs[nextIndex].id);
  }
});

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state = {
      bookmarks: Array.isArray(saved.bookmarks) ? saved.bookmarks.filter((item) =>
        item && typeof item.title === "string" && typeof item.url === "string" && isHttpUrl(item.url)).slice(0, 100) : [],
      recent: Array.isArray(saved.recent) ? saved.recent.filter((item) => normalizeInternalUrl(item.url)).slice(0, 8) : [],
      shortcuts: Array.isArray(saved.shortcuts) ? saved.shortcuts.filter((item) => item && typeof item.title === "string" && /^https?:\/\//i.test(item.url)).slice(0, 16) : [],
      homepageType: ["zenvora", "custom", "newtab"].includes(saved.homepageType) ? saved.homepageType : "zenvora",
      homepageUrl: typeof saved.homepageUrl === "string" ? saved.homepageUrl : "/",
      theme: saved.theme === "dark" ? "dark" : "light"
    };
    document.documentElement.dataset.theme = state.theme;
    const restoredTabs = Array.isArray(saved.tabs) ? saved.tabs
      .map((tab) => ({ ...tab, url: normalizeInternalUrl(tab.url) }))
      .filter((tab) => tab.url)
      .slice(0, 12) : [];
    if (restoredTabs.length) {
      for (const savedTab of restoredTabs) {
        const tab = createTab(savedTab.url, false);
        tab.title = savedTab.title || tab.title;
        tab.id = savedTab.id || tab.id;
        const restoredHistory = Array.isArray(savedTab.history)
          ? savedTab.history.map(normalizeInternalUrl).filter(Boolean).slice(0, 100)
          : [];
        if (restoredHistory.length) {
          tab.history = restoredHistory;
          tab.historyIndex = Math.min(Number(savedTab.historyIndex) || 0, restoredHistory.length - 1);
          tab.url = restoredHistory[tab.historyIndex];
        }
      }
      activeId = restoredTabs[Math.min(Number(saved.activeIdIndex) || 0, restoredTabs.length - 1)]?.id || tabs[0].id;
      if (saved.activeId) activeId = tabs.find((tab) => tab.id === saved.activeId)?.id || activeId;
      activateTab(activeId);
    } else {
      createTab("/browser");
    }
  } catch (error) {
    console.error("Could not restore browser tabs.", error);
    createTab("/browser");
  }
}

restore();
