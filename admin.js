const form = document.querySelector("#admin-settings-form");
const usersNode = document.querySelector("#admin-users");
const statusNode = document.querySelector("#admin-status");

async function showStatus(message, isError = false) {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#b42318" : "#0f5132";
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request failed.");
  return payload;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      siteName: form.siteName.value,
      tagline: form.tagline.value,
      accentColor: form.accentColor.value,
      shortcuts: [],
      videos: []
    };
    try {
      const result = await getJson("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Origin: window.location.origin },
        body: JSON.stringify(payload)
      });
      showStatus(`Saved ${result.siteName}.`);
    } catch (error) {
      showStatus(error.message, true);
    }
  });
}

async function loadAdminData() {
  try {
    const settings = await getJson("/api/admin/settings");
    if (form) {
      form.siteName.value = settings.siteName || "";
      form.tagline.value = settings.tagline || "";
      form.accentColor.value = settings.accentColor || "#4285f4";
    }
    const users = await getJson("/api/admin/users");
    if (usersNode) {
      usersNode.innerHTML = (users.users ?? []).map((user) => `
        <li>
          <strong>${user.username}</strong>
          <span>${(user.websites ?? []).length} saved website${(user.websites ?? []).length === 1 ? "" : "s"}</span>
        </li>
      `).join("") || "<li>No accounts yet.</li>";
    }
  } catch (error) {
    showStatus(error.message, true);
  }
}

loadAdminData();
