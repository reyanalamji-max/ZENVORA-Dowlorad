const viewerParams = new URLSearchParams(window.location.search);
const notice = document.querySelector("#viewer-notice");
const error = document.querySelector("#viewer-error");
const addressInput = document.querySelector("#viewer-address");
const originalLink = document.querySelector("#viewer-original");
const addressForm = document.querySelector("#viewer-address-form");

function validateWebsiteAddress(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) {
    throw new Error("Enter a valid HTTP or HTTPS website address.");
  }
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  const hasPort = /^[^:/?#\s]+:\d+(?:[/?#]|$)/.test(trimmed);
  const address = hasScheme && !hasPort ? trimmed : `https://${trimmed}`;
  const parsed = new URL(address);
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("Only HTTP and HTTPS websites can open in Zenvora.");
  }
  return parsed;
}

function showWebsite(value) {
  let destination;
  try {
    destination = validateWebsiteAddress(value);
  } catch (caughtError) {
    error.hidden = false;
    error.textContent = caughtError.message;
    notice.hidden = true;
    originalLink.hidden = true;
    return;
  }

  addressInput.value = destination.href;
  originalLink.href = destination.href;
  originalLink.hidden = false;
  error.hidden = true;
  error.textContent = "";
  notice.hidden = false;
  notice.textContent = `Opening ${destination.hostname} directly. If it does not open, use the button.`;
  window.location.replace(destination.href);
}

addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const destination = validateWebsiteAddress(addressInput.value);
    window.location.assign(destination.href);
  } catch (caughtError) {
    error.hidden = false;
    error.textContent = caughtError.message;
    notice.hidden = true;
  }
});

const initialAddress = viewerParams.get("url");
if (initialAddress) showWebsite(initialAddress);
else {
  notice.hidden = true;
  error.hidden = false;
  error.textContent = "Enter a website address above to open it.";
  addressInput.focus();
}
