const params = new URLSearchParams(window.location.search);
const query = params.get("q")?.trim() ?? "";
let selectedType = params.get("type") ?? "all";
const page = Number(params.get("page") ?? "1");
const tabs = [
  { value: "all", label: "All" },
  { value: "websites", label: "Websites" },
  { value: "videos", label: "Videos" }
];
if (!tabs.some((tab) => tab.value === selectedType)) selectedType = "all";
const resultsNode = document.querySelector("#search-results");
const summary = document.querySelector("#results-summary");
const input = document.querySelector("#results-query");
const pagination = document.querySelector("#search-pagination");

input.value = query;

function createResult(result) {
  const article = document.createElement("article");
  article.className = "result-card";

  const label = document.createElement("span");
  label.className = "result-kind";
  label.textContent = result.kind === "video" ? "VIDEO" : result.kind === "web" ? "WEB RESULT" : "SAVED WEBSITE";

  const link = document.createElement("a");
  link.className = "result-title";
  link.href = `/open?url=${encodeURIComponent(result.url)}`;
  link.rel = "noopener noreferrer";

  const destinationUrl = new URL(result.url);
  const icon = document.createElement("span");
  icon.className = "result-icon";
  icon.setAttribute("aria-hidden", "true");

  const fallback = document.createElement("span");
  fallback.className = "result-icon-fallback";
  fallback.textContent = destinationUrl.hostname.replace(/^www\./, "").charAt(0).toUpperCase();

  const image = document.createElement("img");
  image.className = "result-icon-image";
  image.src = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(destinationUrl.origin)}&sz=64`;
  image.alt = "";
  image.width = 32;
  image.height = 32;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("load", () => fallback.remove(), { once: true });
  image.addEventListener("error", () => image.remove(), { once: true });

  const title = document.createElement("span");
  title.textContent = result.title;

  icon.append(fallback, image);
  link.append(icon, title);

  const destination = document.createElement("p");
  destination.className = "result-destination";
  destination.textContent = result.description;

  article.append(label, link, destination);
  return article;
}

fetch("/api/settings")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load Zenvora settings.");
    return response.json();
  })
  .then((settings) => {
    document.title = `${query ? `${query} · ` : ""}Search · ${settings.siteName}`;
    document.querySelector("#results-brand-name").textContent = settings.siteName;
    document.querySelector("#results-brand").setAttribute("aria-label", `${settings.siteName} home`);
    document.querySelector("#results-footer").textContent = `${settings.siteName} search`;
    document.documentElement.style.setProperty("--accent", settings.accentColor);

    for (const tab of tabs) {
      const link = document.createElement("a");
      link.className = `results-tab${tab.value === selectedType ? " active" : ""}`;
      link.href = `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(tab.value)}`;
      link.textContent = tab.label;
      if (tab.value === selectedType) link.setAttribute("aria-current", "page");
      document.querySelector("#results-tabs").append(link);
    }

    if (!query) {
      summary.textContent = "Enter a search to find websites and videos in your Zenvora library.";
      return null;
    }
    if (query.length > 200) {
      summary.textContent = "Search terms must be 200 characters or fewer.";
      return null;
    }
    if (!Number.isSafeInteger(page) || page < 1 || page > 100) {
      summary.textContent = "Choose a search results page between 1 and 100.";
      return null;
    }
    return fetch(`/api/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(selectedType)}&page=${page}`);
  })
  .then((response) => {
    if (!response) return null;
    return response.json().then((data) => ({ data, ok: response.ok }));
  })
  .then((searchResponse) => {
    if (!searchResponse) return;
    const { data, ok } = searchResponse;
    resultsNode.replaceChildren(...data.results.map(createResult));
    const webResultCount = data.results.filter((result) => result.kind === "web").length;
    const savedResultCount = data.results.length - webResultCount;
    const resultSources = [];
    if (webResultCount) resultSources.push(`${webResultCount} web result${webResultCount === 1 ? "" : "s"}`);
    if (savedResultCount) resultSources.push(`${savedResultCount} saved result${savedResultCount === 1 ? "" : "s"}`);
    if (!ok) {
      summary.textContent = `${data.error || "Could not complete the search."}${savedResultCount ? ` Showing ${savedResultCount} saved result${savedResultCount === 1 ? "" : "s"}.` : ""}`;
    } else if (!data.webSearchConfigured && selectedType !== "videos") {
      summary.textContent = "Web search is not configured. Add SERPER_API_KEY to the server’s .env file to enable public web results.";
    } else if (resultSources.length) {
      summary.textContent = `${resultSources.join(" and ")}${page > 1 ? ` · Page ${page}` : ""}`;
    } else {
      summary.textContent = `No matches for “${data.query}”${selectedType === "videos" ? " in your saved videos" : " on the web or in your saved library"}.`;
    }
    pagination.replaceChildren();
    pagination.hidden = !(page > 1 || data.hasMore);
    if (page > 1) {
      const previous = document.createElement("a");
      previous.className = "pagination-link";
      previous.href = `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(selectedType)}&page=${page - 1}`;
      previous.textContent = "Previous";
      pagination.append(previous);
    }
    if (data.hasMore) {
      const next = document.createElement("a");
      next.className = "pagination-link";
      next.href = `/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(selectedType)}&page=${page + 1}`;
      next.textContent = "Next";
      pagination.append(next);
    }
  })
  .catch((error) => {
    summary.textContent = error.message;
    console.error(error);
  });
