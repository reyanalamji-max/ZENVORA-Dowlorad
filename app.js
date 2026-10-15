const form = document.querySelector("#search-form");
const input = document.querySelector("#query");
const suggestionList = document.querySelector("#search-suggestions");
const searchFeedback = document.querySelector("#search-feedback");
const appsLauncherButton = document.querySelector("#apps-launcher-button");
const appsLauncher = document.querySelector("#apps-launcher");
const appsLauncherClose = document.querySelector("#apps-launcher-close");
const aiWelcomePopover = document.querySelector("#ai-welcome-popover");
const aiWelcomeClose = document.querySelector("#ai-welcome-close");
let savedItems = [];
let activeSuggestion = -1;

function closeAppsLauncher() {
  appsLauncher.hidden = true;
  appsLauncherButton.setAttribute("aria-expanded", "false");
}

appsLauncherButton.addEventListener("click", () => {
  const isOpen = !appsLauncher.hidden;
  appsLauncher.hidden = isOpen;
  appsLauncherButton.setAttribute("aria-expanded", String(!isOpen));
});
appsLauncherClose.addEventListener("click", closeAppsLauncher);
document.addEventListener("pointerdown", (event) => {
  if (!appsLauncher.hidden && !appsLauncher.contains(event.target) && !appsLauncherButton.contains(event.target)) {
    closeAppsLauncher();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !appsLauncher.hidden) {
    closeAppsLauncher();
    appsLauncherButton.focus();
  }
});
aiWelcomeClose.addEventListener("click", () => {
  aiWelcomePopover.hidden = true;
});
document.querySelectorAll('a[href="/assistant"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const query = input.value.trim();
    if (!query) return;
    event.preventDefault();
    window.location.assign(`/assistant?q=${encodeURIComponent(query)}`);
  });
});
window.setTimeout(() => {
  aiWelcomePopover.hidden = false;
}, 850);

function closeSuggestions() {
  suggestionList.hidden = true;
  suggestionList.replaceChildren();
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  activeSuggestion = -1;
}

function openSuggestion(item) {
  window.location.assign(item.url);
}

function updateActiveSuggestion(index) {
  const options = [...suggestionList.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  activeSuggestion = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === activeSuggestion;
    option.setAttribute("aria-selected", String(active));
    if (active) {
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    }
  });
}

function renderSuggestions() {
  const query = input.value.trim().toLocaleLowerCase();
  if (!query) {
    closeSuggestions();
    return;
  }
  const terms = query.split(/\s+/);
  const matches = savedItems
    .map((item) => {
      const haystack = `${item.title} ${item.url} ${new URL(item.url).hostname}`.toLocaleLowerCase();
      return { ...item, haystack };
    })
    .filter((item) => terms.every((term) => item.haystack.includes(term)))
    .sort((left, right) => {
      const leftTitle = left.title.toLocaleLowerCase();
      const rightTitle = right.title.toLocaleLowerCase();
      const leftRank = leftTitle === query ? 0 : leftTitle.startsWith(query) ? 1 : 2;
      const rightRank = rightTitle === query ? 0 : rightTitle.startsWith(query) ? 1 : 2;
      return leftRank - rightRank || left.title.localeCompare(right.title);
    })
    .slice(0, 8);

  suggestionList.replaceChildren(...matches.map((item, index) => {
    const listItem = document.createElement("li");
    listItem.setAttribute("role", "presentation");
    const option = document.createElement("button");
    option.type = "button";
    option.id = `search-suggestion-${index}`;
    option.className = "search-suggestion";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.addEventListener("click", () => openSuggestion(item));

    const icon = document.createElement("span");
    icon.className = `suggestion-icon ${item.kind === "video" ? "suggestion-icon-video" : ""}`;
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = item.kind === "video" ? "▶" : item.title.trim().slice(0, 1).toLocaleUpperCase();

    const details = document.createElement("span");
    details.className = "suggestion-details";
    const title = document.createElement("span");
    title.className = "suggestion-title";
    title.textContent = item.title;
    const destination = document.createElement("span");
    destination.className = "suggestion-destination";
    destination.textContent = `${item.kind === "video" ? "Video" : "Website"} · ${new URL(item.url).hostname}`;
    details.append(title, destination);

    const action = document.createElement("span");
    action.className = "suggestion-action";
    action.textContent = "View";
    option.append(icon, details, action);
    listItem.append(option);
    return listItem;
  }));

  activeSuggestion = -1;
  input.removeAttribute("aria-activedescendant");
  suggestionList.hidden = matches.length === 0;
  input.setAttribute("aria-expanded", String(matches.length > 0));
}

input.addEventListener("input", renderSuggestions);
input.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" && !suggestionList.hidden) {
    event.preventDefault();
    updateActiveSuggestion(activeSuggestion + 1);
  } else if (event.key === "ArrowUp" && !suggestionList.hidden) {
    event.preventDefault();
    updateActiveSuggestion(activeSuggestion < 0 ? 0 : activeSuggestion - 1);
  } else if (event.key === "Escape") {
    closeSuggestions();
  } else if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault();
    const options = suggestionList.querySelectorAll('[role="option"]');
    const selected = options[activeSuggestion];
    const title = selected?.querySelector(".suggestion-title")?.textContent;
    const item = savedItems.find((savedItem) => savedItem.title === title);
    if (item) openSuggestion(item);
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!form.contains(event.target) && !suggestionList.contains(event.target)) closeSuggestions();
});

form.addEventListener("submit", (event) => {
  const query = input.value.trim();
  if (!query) {
    event.preventDefault();
    input.focus();
    return;
  }
  const websiteUrl = getWebsiteUrl(query);
  if (!websiteUrl && query.length > 200) {
    event.preventDefault();
    searchFeedback.textContent = "Search terms must be 200 characters or fewer.";
    return;
  }
  if (!websiteUrl) return;
  event.preventDefault();
  searchFeedback.textContent = "Saving website to your private list…";
  fetch("/api/account/websites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: websiteUrl })
  })
    .then(async (response) => {
      const result = await response.json();
      if (response.status === 401) {
        window.location.assign(`/account?save=${encodeURIComponent(websiteUrl)}`);
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not save this website.");
      window.location.assign(`/open?url=${encodeURIComponent(result.website.url)}`);
    })
    .catch((error) => {
      searchFeedback.textContent = error.message;
    });
});

function getWebsiteUrl(value) {
  if (/\s/.test(value) || value.length > 2048) return "";
  const hasHttpScheme = /^https?:\/\//i.test(value);
  try {
    const url = new URL(hasHttpScheme ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return "";
    if (!hasHttpScheme && url.hostname !== "localhost" && !url.hostname.includes(".")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

Promise.all([fetch("/api/settings"), fetch("/api/account/me")])
  .then(async ([settingsResponse, accountResponse]) => {
    if (!settingsResponse.ok || !accountResponse.ok) throw new Error("Could not load page settings.");
    return [await settingsResponse.json(), await accountResponse.json()];
  })
  .then(([settings, account]) => {
    document.title = `${settings.siteName} Search — Web Search, AI Chat & Popular Apps`;
    document.querySelector("#tagline").textContent = settings.tagline;
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    savedItems = [
      ...settings.shortcuts.map((shortcut) => ({ title: shortcut.name, url: shortcut.url, kind: "website" })),
      ...settings.videos.map((video) => ({ title: video.title, url: video.url, kind: "video" })),
      ...(account.authenticated ? account.account.websites.map((website) => ({
        title: website.name,
        url: website.url,
        kind: "website"
      })) : [])
    ];
    const accountLink = document.querySelector("#account-link");
    if (account.authenticated) {
      accountLink.textContent = account.account.username;
      accountLink.setAttribute("aria-label", `Account for ${account.account.username}`);
    }
    if (input.value) renderSuggestions();
    const websiteShortcuts = document.querySelector("#website-shortcuts");
    websiteShortcuts.replaceChildren(...settings.shortcuts.map((shortcut) => {
      const link = document.createElement("a");
      link.className = "website-shortcut";
      link.href = `/open?url=${encodeURIComponent(shortcut.url)}`;
      link.textContent = shortcut.name;
      return link;
    }));
    websiteShortcuts.hidden = settings.shortcuts.length === 0;
  })
  .catch((error) => {
    searchFeedback.textContent = error.message;
    console.error(error);
  });