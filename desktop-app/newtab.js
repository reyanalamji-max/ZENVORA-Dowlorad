document.querySelector("#newtab-search").addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.querySelector("#newtab-query").value.trim();
  if (!query) return;
  const destination = !/\s/.test(query) && query.includes(".")
    ? `https://${query}`
    : `https://zenvora-dowlorad.onrender.com/search?q=${encodeURIComponent(query)}`;
  window.location.assign(destination);
});
