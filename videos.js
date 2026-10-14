const grid = document.querySelector("#video-grid");
const message = document.querySelector("#video-message");

function createVideoCard(video, index) {
  const card = document.createElement("a");
  card.className = "video-card";
  card.href = `/open?url=${encodeURIComponent(video.url)}`;
  card.setAttribute("aria-label", `Open video: ${video.title}`);

  const artwork = document.createElement("span");
  artwork.className = `video-artwork video-artwork-${index % 6}`;
  artwork.setAttribute("aria-hidden", "true");
  const play = document.createElement("span");
  play.className = "video-play";
  play.textContent = "▶";
  artwork.append(play);

  const details = document.createElement("span");
  details.className = "video-details";
  const title = document.createElement("span");
  title.className = "video-title";
  title.textContent = video.title;
  const destination = document.createElement("span");
  destination.className = "video-destination";
  destination.textContent = new URL(video.url).hostname;
  details.append(title, destination);
  card.append(artwork, details);
  return card;
}

fetch("/api/settings")
  .then((response) => {
    if (!response.ok) throw new Error("Could not load your video library.");
    return response.json();
  })
  .then((settings) => {
    document.title = `Videos · ${settings.siteName}`;
    document.querySelector("#library-brand-name").textContent = settings.siteName;
    document.querySelector("#library-brand").setAttribute("aria-label", `${settings.siteName} home`);
    document.querySelector("#video-heading").textContent = `${settings.siteName} videos`;
    document.querySelector("#video-footer").textContent = `${settings.siteName} video library`;
    document.documentElement.style.setProperty("--accent", settings.accentColor);
    grid.replaceChildren(...settings.videos.map(createVideoCard));
    message.textContent = settings.videos.length
      ? ""
      : "No videos have been added to this library yet. Browse the curated starting points on the ZENVORA home page or use Search to find public web results.";
  })
  .catch((error) => {
    message.textContent = error.message;
    console.error(error);
  });
