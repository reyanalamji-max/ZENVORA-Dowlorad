fetch("/api/settings")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load Zenvora settings.");
    return response.json();
  })
  .then((settings) => {
    document.title = `Google apps · ${settings.siteName}`;
    document.querySelector("#apps-brand-name").textContent = settings.siteName;
    document.querySelector("#apps-brand").setAttribute("aria-label", `${settings.siteName} home`);
    document.querySelector("#apps-footer").textContent = `Google links · ${settings.siteName} launcher`;
    document.documentElement.style.setProperty("--accent", settings.accentColor);
  })
  .catch((error) => console.error(error));

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest(".app-card[href]");
  if (!link) return;
  const destination = new URL(link.href, window.location.href);
  if (destination.origin === window.location.origin) return;
  event.preventDefault();
  window.location.assign(`/open?url=${encodeURIComponent(destination.href)}`);
});
