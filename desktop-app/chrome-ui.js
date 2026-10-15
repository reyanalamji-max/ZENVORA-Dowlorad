const addressForm = document.querySelector("#address-form");
const addressInput = document.querySelector("#address-input");
const tabbar = document.querySelector("#tabbar");
const closeTabIcon = document.querySelector(".tab-close").textContent;
let activeTabId = null;
let tabs = [];

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
    item.addEventListener("click", () => window.zenvoraBrowser.selectTab(tab.id));
    item.addEventListener("auxclick", (event) => {
      if (event.button === 1) window.zenvoraBrowser.closeTab(tab.id);
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
    setAddress(activeSnapshot);
    document.querySelector("#back-button").disabled = !activeSnapshot.canGoBack;
    document.querySelector("#forward-button").disabled = !activeSnapshot.canGoForward;
    document.querySelector("#reload-button").textContent = activeSnapshot.loading ? "×" : "↻";
    document.querySelector("#reload-button").setAttribute("aria-label", activeSnapshot.loading ? "Stop loading" : "Reload");
    document.title = `${activeSnapshot.title || "New tab"} - ZENVORA`;
  }
}

window.zenvoraBrowser.onState((state) => {
  tabs = state.tabs;
  activeTabId = state.activeTabId;
  renderTabs();
});

window.zenvoraBrowser.onNavigation((snapshot) => {
  if (!snapshot || snapshot.id !== activeTabId) return;
  setAddress(snapshot);
  document.querySelector("#back-button").disabled = !snapshot.canGoBack;
  document.querySelector("#forward-button").disabled = !snapshot.canGoForward;
  document.querySelector("#reload-button").textContent = snapshot.loading ? "×" : "↻";
  document.querySelector("#reload-button").setAttribute("aria-label", snapshot.loading ? "Stop loading" : "Reload");
  document.title = `${snapshot.title || "New tab"} - ZENVORA`;
});

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
  window.zenvoraBrowser.navigate("https://zenvora-dowlorad.onrender.com/");
});
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
