const authPanel = document.querySelector("#auth-panel");
const profilePanel = document.querySelector("#profile-panel");
const registerForm = document.querySelector("#register-form");
const loginForm = document.querySelector("#account-login-form");
const profileForm = document.querySelector("#profile-form");
const saveUrl = new URLSearchParams(window.location.search).get("save");
const websiteList = document.querySelector("#account-websites");
const providerButtons = document.querySelectorAll(".social-button");

async function request(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request failed.");
  return result;
}

function setMessage(id, text) {
  document.querySelector(id).textContent = text;
}

function renderWebsites(websites) {
  websiteList.replaceChildren(...websites.map((website) => {
    const row = document.createElement("div");
    row.className = "account-website-row";
    const link = document.createElement("a");
    link.href = `/open?url=${encodeURIComponent(website.url)}`;
    link.textContent = website.name;
    const address = document.createElement("span");
    address.className = "website-address";
    address.textContent = website.url;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-shortcut";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${website.name}`);
    remove.addEventListener("click", async () => {
      remove.disabled = true;
      try {
        const result = await request("/api/account/websites", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: website.url })
        });
        renderWebsites(result.websites);
        setMessage("#websites-message", "Website removed from your private list.");
      } catch (error) {
        setMessage("#websites-message", error.message);
        remove.disabled = false;
      }
    });
    row.append(link, address, remove);
    return row;
  }));
  if (websites.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No websites saved yet. Enter a website address in the search box to add one.";
    websiteList.append(empty);
  }
}

async function savePendingWebsite() {
  if (!saveUrl) return false;
  try {
    const result = await request("/api/account/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: saveUrl })
    });
    window.location.assign(`/open?url=${encodeURIComponent(result.website.url)}`);
    return true;
  } catch (error) {
    setMessage("#websites-message", error.message);
    return false;
  }
}

function showAccount(account) {
  authPanel.hidden = true;
  profilePanel.hidden = false;
  document.querySelector("#profile-username").value = account.username;
  if (account.email) {
    const emailField = document.querySelector("#profile-email");
    if (emailField) emailField.value = account.email;
  }
  renderWebsites(account.websites);
}

async function authenticate(form, endpoint, messageId) {
  setMessage(messageId, "");
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    const result = await request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    showAccount(result.account);
    if (saveUrl && await savePendingWebsite()) return;
    setMessage(messageId, "You are signed in.");
  } catch (error) {
    setMessage(messageId, error.message);
  } finally {
    button.disabled = false;
  }
}

registerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate(registerForm, "/api/account/register", "#register-message");
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate(loginForm, "/api/account/login", "#account-login-message");
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("#profile-message", "");
  const button = profileForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(profileForm));
    const result = await request("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    document.querySelector("#profile-username").value = result.account.username;
    if (result.account.email) document.querySelector("#profile-email").value = result.account.email;
    document.querySelector("#current-password").value = "";
    document.querySelector("#new-password").value = "";
    setMessage("#profile-message", "Account updated.");
  } catch (error) {
    setMessage("#profile-message", error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#account-logout").addEventListener("click", async () => {
  try {
    await request("/api/account/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    window.location.assign("/account");
  } catch (error) {
    setMessage("#profile-message", error.message);
  }
});

providerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const provider = button.dataset.provider;
    setMessage("#register-message", `Continue with ${provider.charAt(0).toUpperCase() + provider.slice(1)} is available after you connect a real OAuth provider.`);
    setMessage("#account-login-message", "OAuth sign-in requires a configured provider in the server environment.");
  });
});

request("/api/account/me")
  .then(async (result) => {
    if (!result.authenticated) return;
    showAccount(result.account);
    await savePendingWebsite();
  })
  .catch((error) => {
    authPanel.hidden = false;
    setMessage("#register-message", error.message);
  });
