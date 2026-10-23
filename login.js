const loginForm = document.querySelector("#login-form");
const statusNode = document.querySelector("#login-status");
const logoutButton = document.querySelector("#logout-button");

async function showStatus(message, isError = false) {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.style.color = isError ? "#b42318" : "#0f5132";
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordInput = loginForm.querySelector('input[name="password"]');
    const password = passwordInput?.value ?? "";
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: window.location.origin },
      body: JSON.stringify({ password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showStatus(payload.error || "The password is incorrect.", true);
      return;
    }
    showStatus("Signed in successfully.");
    window.location.assign("/admin");
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    const response = await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: window.location.origin }
    });
    if (response.ok) window.location.assign("/admin");
  });
}
