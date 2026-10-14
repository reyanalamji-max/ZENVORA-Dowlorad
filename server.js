import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SESSION_COOKIE = "zenvora_session";
const ACCOUNT_COOKIE = "zenvora_account";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_ACCOUNT_WEBSITES = 500;
const MAX_ASSISTANT_MESSAGES = 12;
const MAX_ASSISTANT_MESSAGE_LENGTH = 4000;
const scrypt = promisify(scryptCallback);
const DEFAULT_SETTINGS = {
  siteName: "Zenvora",
  tagline: "Search the web with ease",
  accentColor: "#4285f4",
  shortcuts: [],
  videos: []
};
const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/about": ["about.html", "text/html; charset=utf-8"],
  "/contact": ["contact.html", "text/html; charset=utf-8"],
  "/privacy": ["privacy.html", "text/html; charset=utf-8"],
  "/terms": ["terms.html", "text/html; charset=utf-8"],
  "/disclaimer": ["disclaimer.html", "text/html; charset=utf-8"],
  "/robots.txt": ["robots.txt", "text/plain; charset=utf-8"],
  "/sitemap.xml": ["sitemap.xml", "application/xml; charset=utf-8"],
  "/search": ["search.html", "text/html; charset=utf-8"],
  "/apps": ["apps.html", "text/html; charset=utf-8"],
  "/videos": ["videos.html", "text/html; charset=utf-8"],
  "/account": ["account.html", "text/html; charset=utf-8"],
  "/open": ["viewer.html", "text/html; charset=utf-8"],
  "/assistant": ["assistant.html", "text/html; charset=utf-8"],
  "/download": ["download.html", "text/html; charset=utf-8"],
  "/download-app": ["desktop-app/dist/ZENVORA Search Setup 1.0.0.exe", "application/octet-stream"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/search.js": ["search.js", "text/javascript; charset=utf-8"],
  "/apps.js": ["apps.js", "text/javascript; charset=utf-8"],
  "/videos.js": ["videos.js", "text/javascript; charset=utf-8"],
  "/account.js": ["account.js", "text/javascript; charset=utf-8"],
  "/viewer.js": ["viewer.js", "text/javascript; charset=utf-8"],
  "/assistant.js": ["assistant.js", "text/javascript; charset=utf-8"],
  "/assistant.css": ["assistant.css", "text/css; charset=utf-8"],
  "/offline.html": ["offline.html", "text/html; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json; charset=utf-8"],
  "/service-worker.js": ["service-worker.js", "text/javascript; charset=utf-8"],
  "/pwa.js": ["pwa.js", "text/javascript; charset=utf-8"],
  "/logo.svg": ["logo.svg", "image/svg+xml; charset=utf-8"],
  "/icons/icon-192.png": ["icons/icon-192.png", "image/png"],
  "/icons/icon-512.png": ["icons/icon-512.png", "image/png"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/download.js": ["download.js", "text/javascript; charset=utf-8"]
};
const NOINDEX_PATHS = new Set([
  "/search",
  "/apps",
  "/videos",
  "/account",
  "/open",
  "/assistant",
  "/offline.html",
  "/download-app"
]);

async function loadDotEnv() {
  let contents;
  try {
    contents = await requireFile(".env");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#") || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function requireFile(filename) {
  return readFile(path.join(ROOT, filename), "utf8");
}

function hash(value) {
  return createHash("sha256").update(value).digest();
}

function passwordsMatch(candidate, expected) {
  return timingSafeEqual(hash(candidate), hash(expected));
}

async function hashAccountPassword(password, salt = randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: derived.toString("hex") };
}

async function accountPasswordsMatch(candidate, account) {
  const derived = await scrypt(candidate, account.passwordSalt, 64);
  const expected = Buffer.from(account.passwordHash, "hex");
  return expected.length === derived.length && timingSafeEqual(derived, expected);
}

function validateUsername(value) {
  if (typeof value !== "string") {
    throw new Error("Username must be 3 to 32 characters: letters, numbers, dots, underscores, or hyphens.");
  }
  const username = value.trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Username must be 3 to 32 characters: letters, numbers, dots, underscores, or hyphens.");
  }
  return username;
}

function validateAccountPassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 1024) {
    throw new Error("Password must be between 12 and 1024 characters.");
  }
  return value;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeWebUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed.length > 2048) {
    throw new Error("Website addresses must be valid HTTP or HTTPS links.");
  }
  const address = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsedUrl;
  try {
    parsedUrl = new URL(address);
  } catch {
    throw new Error("Website addresses must be valid HTTP or HTTPS links.");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol) || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
    throw new Error("Website addresses must use HTTP or HTTPS and cannot contain credentials.");
  }
  return parsedUrl.toString();
}

function validateSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Settings must be an object.");
  }
  const { siteName, tagline, accentColor } = value;
  if (typeof siteName !== "string" || siteName.trim().length < 1 || siteName.trim().length > 32) {
    throw new Error("Site name must be between 1 and 32 characters.");
  }
  if (typeof tagline !== "string" || tagline.trim().length > 100) {
    throw new Error("Tagline must be 100 characters or fewer.");
  }
  if (typeof accentColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    throw new Error("Accent color must be a six-digit hexadecimal color.");
  }
  const shortcuts = value.shortcuts ?? [];
  if (!Array.isArray(shortcuts)) {
    throw new Error("Website shortcuts must be a list.");
  }
  const validatedShortcuts = shortcuts.map((shortcut) => {
    if (!shortcut || typeof shortcut !== "object" || Array.isArray(shortcut)) {
      throw new Error("Each website shortcut needs a name and web address.");
    }
    const name = typeof shortcut.name === "string" ? shortcut.name.trim() : "";
    if (name.length < 1 || name.length > 32) {
      throw new Error("Website names must be between 1 and 32 characters.");
    }
    return { name, url: normalizeWebUrl(shortcut.url) };
  });
  const videos = value.videos ?? [];
  if (!Array.isArray(videos)) {
    throw new Error("Videos must be a list.");
  }
  const validatedVideos = videos.map((video) => {
    if (!video || typeof video !== "object" || Array.isArray(video)) {
      throw new Error("Each video needs a title and web address.");
    }
    const title = typeof video.title === "string" ? video.title.trim() : "";
    if (title.length < 1 || title.length > 80) {
      throw new Error("Video titles must be between 1 and 80 characters.");
    }
    return { title, url: normalizeWebUrl(video.url) };
  });
  return {
    siteName: siteName.trim(),
    tagline: tagline.trim(),
    accentColor,
    shortcuts: validatedShortcuts,
    videos: validatedVideos
  };
}

function send(response, status, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://www.google.com; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...headers
  });
  response.end(body);
}

function sendJson(response, status, value, headers = {}) {
  send(response, status, JSON.stringify(value), "application/json; charset=utf-8", {
    "Cache-Control": "no-store",
    ...headers
  });
}

async function sendInstaller(request, response, installerPath, headOnly) {
  let installerStats;
  try {
    installerStats = await stat(installerPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.error("Windows installer is missing:", error);
    sendJson(response, 503, {
      error: "The Windows installer is temporarily unavailable. Please try again later."
    }, { "X-Robots-Tag": "noindex, nofollow, noarchive" });
    return;
  }
  const rangeHeader = request.headers.range;
  let byteRange = null;
  if (typeof rangeHeader === "string") {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (match && (match[1] || match[2])) {
      const size = installerStats.size;
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (Number.isSafeInteger(suffixLength) && suffixLength > 0 && size > 0) {
          byteRange = { start: Math.max(size - suffixLength, 0), end: size - 1 };
        }
      } else {
        const start = Number(match[1]);
        const requestedEnd = match[2] ? Number(match[2]) : size - 1;
        if (Number.isSafeInteger(start) && Number.isSafeInteger(requestedEnd) && start < size && requestedEnd >= start) {
          byteRange = { start, end: Math.min(requestedEnd, size - 1) };
        }
      }
      if (!byteRange) {
        response.writeHead(416, {
          "Content-Range": `bytes */${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": "0",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-Frame-Options": "DENY",
          "X-Robots-Tag": "noindex, nofollow, noarchive"
        });
        response.end();
        return;
      }
    }
  }

  const contentLength = byteRange ? byteRange.end - byteRange.start + 1 : installerStats.size;
  response.writeHead(byteRange ? 206 : 200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": contentLength,
    "Content-Disposition": "attachment; filename=\"ZENVORA-Search-Setup.exe\"",
    "Accept-Ranges": "bytes",
    ...(byteRange ? { "Content-Range": `bytes ${byteRange.start}-${byteRange.end}/${installerStats.size}` } : {}),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://www.google.com; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  });
  if (headOnly) {
    response.end();
    return;
  }

  const installerStream = createReadStream(installerPath, byteRange ?? undefined);
  installerStream.on("error", (error) => {
    console.error("Installer download stream failed:", error);
    response.destroy(error);
  });
  installerStream.pipe(response);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
      reject(Object.assign(new Error("Content-Type must be application/json."), { status: 415 }));
      request.resume();
      return;
    }

    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Request body must contain valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function getCookie(request, name) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return "";
}

function validLocalHost(host) {
  return /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(host ?? "");
}

function isValidHost(host) {
  if (typeof host !== "string" || host.length > 255 || /[\s/@\\]/.test(host)) return false;
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.host === host.toLocaleLowerCase() && parsed.pathname === "/"
      && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function sameOrigin(request) {
  const host = request.headers.host;
  if ((!validLocalHost(host) && !isValidHost(host)) || !request.headers.origin) return false;
  try {
    const origin = new URL(request.headers.origin);
    return ["http:", "https:"].includes(origin.protocol) && origin.host === host.toLocaleLowerCase()
      && origin.pathname === "/" && !origin.search && !origin.hash;
  } catch {
    return false;
  }
}

async function readSettings(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const settingsPath = path.join(dataDir, "settings.json");
  try {
    return validateSettings(JSON.parse(await readFile(settingsPath, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(settingsPath, `${JSON.stringify(DEFAULT_SETTINGS, null, 2)}\n`, { flag: "wx" });
    return { ...DEFAULT_SETTINGS };
  }
}

async function readUsers(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const usersPath = path.join(dataDir, "users.json");
  try {
    const users = JSON.parse(await readFile(usersPath, "utf8"));
    if (!Array.isArray(users)) throw new Error("User data must be a list.");
    return users;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(usersPath, "[]\n", { flag: "wx", mode: 0o600 });
    return [];
  }
}

async function persistSettings(dataDir, settings) {
  const temporaryPath = path.join(dataDir, `.settings-${randomBytes(8).toString("hex")}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path.join(dataDir, "settings.json"));
}

async function persistUsers(dataDir, users) {
  const temporaryPath = path.join(dataDir, `.users-${randomBytes(8).toString("hex")}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, path.join(dataDir, "users.json"));
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function createApp({
  adminPassword = randomBytes(32).toString("hex"),
  dataDir = path.join(ROOT, "data"),
  installerPath = path.join(ROOT, STATIC_FILES["/download-app"][0]),
  serperApiKey,
  geminiApiKey,
  fetchImpl = fetch,
  androidAppId,
  androidSha256Fingerprints = [],
  secureCookies = false,
  trustProxy = false
} = {}) {
  const sessions = new Map();
  const accountSessions = new Map();
  const authAttempts = new Map();
  let settingsPromise = readSettings(dataDir);
  let usersPromise = readUsers(dataDir);
  let usersMutationQueue = Promise.resolve();

  function getAccount(request) {
    const token = getCookie(request, ACCOUNT_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const session = accountSessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      accountSessions.delete(token);
      return null;
    }
    return session;
  }

  function cookieOptions(maxAge) {
    return `HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
  }

  function createCookie(name, token, maxAge) {
    return `${name}=${token}; ${cookieOptions(maxAge)}`;
  }

  function checkAuthRateLimit(request, action, limit = 10, windowMs = 15 * 60 * 1000) {
    let clientAddress = request.socket.remoteAddress ?? "unknown";
    if (trustProxy && request.headers["x-forwarded-for"]) {
      clientAddress = request.headers["x-forwarded-for"].split(",").map((item) => item.trim()).filter(Boolean).pop() ?? clientAddress;
    }
    const now = Date.now();
    const key = `${action}:${clientAddress}`;
    if (authAttempts.size >= 10000 && !authAttempts.has(key)) {
      for (const [attemptKey, timestamps] of authAttempts) {
        if (!timestamps.length || now - timestamps[timestamps.length - 1] >= 15 * 60 * 1000) {
          authAttempts.delete(attemptKey);
        }
      }
      if (authAttempts.size >= 10000) authAttempts.delete(authAttempts.keys().next().value);
    }
    const attempts = (authAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (attempts.length >= limit) return false;
    attempts.push(now);
    authAttempts.set(key, attempts);
    return true;
  }

  function mutateUsers(mutator) {
    const operation = usersMutationQueue.then(async () => {
      const users = structuredClone(await usersPromise);
      const result = await mutator(users);
      await persistUsers(dataDir, users);
      usersPromise = Promise.resolve(users);
      return result;
    });
    usersMutationQueue = operation.catch(() => {});
    return operation;
  }

  function publicAccount(account) {
    return {
      id: account.id,
      username: account.username,
      createdAt: account.createdAt,
      websites: account.websites.map(({ name, url }) => ({ name, url }))
    };
  }

  function publicUser(user) {
    return {
      username: user.username,
      createdAt: user.createdAt,
      websites: user.websites.map(({ name, url }) => ({ name, url }))
    };
  }

  function getSession(request) {
    const token = getCookie(request, SESSION_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    const expiresAt = sessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  async function handle(request, response) {
    const host = request.headers.host;
    if (!validLocalHost(host) && !isValidHost(host)) {
      send(response, 400, "Requests must use a valid website host.");
      return;
    }

    const url = new URL(request.url, `http://${host}`);
    const authenticated = getSession(request);
    const accountSession = getAccount(request);
    if (url.pathname === "/.well-known/assetlinks.json" && request.method === "GET") {
      const fingerprints = Array.isArray(androidSha256Fingerprints)
        ? androidSha256Fingerprints.map((value) => typeof value === "string" ? value.trim().toUpperCase() : "")
        : [];
      const validPackageId = typeof androidAppId === "string"
        && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(androidAppId);
      const validFingerprints = fingerprints.length > 0
        && fingerprints.every((value) => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
      if (!validPackageId || !validFingerprints) {
        sendJson(response, 404, { error: "Android app association is not configured." });
        return;
      }
      sendJson(response, 200, [{
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: androidAppId,
          sha256_cert_fingerprints: fingerprints
        }
      }], { "Cache-Control": "public, max-age=300" });
      return;
    }
    if (url.pathname === "/api/search" && request.method === "GET") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      const searchType = url.searchParams.get("type") ?? "all";
      const page = Number(url.searchParams.get("page") ?? "1");
      if (!query || query.length > 200) {
        sendJson(response, 400, { error: "Enter a search of 1 to 200 characters." });
        return;
      }
      if (!["all", "websites", "videos"].includes(searchType)) {
        sendJson(response, 400, { error: "Choose All, Websites, or Videos." });
        return;
      }
      if (!Number.isSafeInteger(page) || page < 1 || page > 100) {
        sendJson(response, 400, { error: "Choose a search results page between 1 and 100." });
        return;
      }
      const settings = await settingsPromise;
      const users = accountSession ? await usersPromise : [];
      const user = accountSession ? users.find((item) => item.id === accountSession.userId) : null;
      const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const results = [];
      if (searchType !== "videos") {
        const personalShortcuts = user?.websites ?? [];
        for (const shortcut of [...settings.shortcuts, ...personalShortcuts]) {
          const haystack = `${shortcut.name} ${shortcut.url} ${new URL(shortcut.url).hostname}`.toLocaleLowerCase();
          if (terms.every((term) => haystack.includes(term))) {
            results.push({
              kind: "website",
              title: shortcut.name,
              url: shortcut.url,
              description: new URL(shortcut.url).hostname
            });
          }
        }
      }
      if (searchType !== "websites") {
        for (const video of settings.videos) {
          const haystack = `${video.title} ${video.url} ${new URL(video.url).hostname}`.toLocaleLowerCase();
          if (terms.every((term) => haystack.includes(term))) {
            results.push({
              kind: "video",
              title: video.title,
              url: video.url,
              description: new URL(video.url).hostname
            });
          }
        }
      }
      let hasMore = false;
      const webSearchConfigured = Boolean(serperApiKey) && searchType !== "videos";
      if (webSearchConfigured) {
        const sendWebSearchError = (status, error) => sendJson(response, status, {
          error,
          query,
          type: searchType,
          page,
          hasMore: false,
          webSearchConfigured,
          results
        });
        if (!checkAuthRateLimit(request, "web-search", 30, 60 * 1000)) {
          sendWebSearchError(429, "Too many web searches. Please wait before searching again.");
          return;
        }

        let providerResponse;
        try {
          providerResponse = await fetchImpl("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": serperApiKey
            },
            body: JSON.stringify({ q: query, num: 10, page }),
            signal: AbortSignal.timeout(10000)
          });
        } catch {
          sendWebSearchError(502, "The web search provider is unavailable. Please try again.");
          return;
        }
        if (!providerResponse.ok) {
          sendWebSearchError(502, "The web search provider rejected the request. Check the Serper API key and try again.");
          return;
        }

        let providerData;
        try {
          providerData = await providerResponse.json();
        } catch {
          sendWebSearchError(502, "The web search provider returned an invalid response.");
          return;
        }
        if (!providerData || !Array.isArray(providerData.organic)) {
          sendWebSearchError(502, "The web search provider returned an invalid response.");
          return;
        }
        const webResults = [];
        for (const item of providerData.organic) {
          if (!item || typeof item !== "object" || typeof item.title !== "string" || typeof item.link !== "string") continue;
          let destination;
          try {
            destination = new URL(item.link);
          } catch {
            continue;
          }
          if (!["http:", "https:"].includes(destination.protocol)) continue;
          webResults.push({
            kind: "web",
            title: item.title,
            url: destination.href,
            description: typeof item.snippet === "string" ? item.snippet : destination.hostname
          });
        }
        results.push(...webResults);
        hasMore = providerData.organic.length === 10 && page < 100;
      }
      sendJson(response, 200, { query, type: searchType, page, hasMore, webSearchConfigured, results });
      return;
    }

    if (url.pathname === "/api/settings" && request.method === "GET") {
      sendJson(response, 200, await settingsPromise);
      return;
    }
    if (url.pathname === "/api/session" && request.method === "GET") {
      sendJson(response, 200, { authenticated });
      return;
    }
    if (url.pathname === "/api/account/me" && request.method === "GET") {
      if (!accountSession) {
        sendJson(response, 200, { authenticated: false });
        return;
      }
      const users = await usersPromise;
      const user = users.find((item) => item.id === accountSession.userId);
      if (!user) {
        accountSessions.delete(getCookie(request, ACCOUNT_COOKIE));
        sendJson(response, 200, { authenticated: false });
        return;
      }
      sendJson(response, 200, { authenticated: true, account: publicAccount(user) });
      return;
    }
    if (url.pathname === "/api/account/register" && request.method === "POST") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      if (!checkAuthRateLimit(request, "register")) {
        sendJson(response, 429, { error: "Too many account attempts. Please try again in 15 minutes." });
        return;
      }
      const body = await readJson(request);
      if (!isObject(body)) {
        sendJson(response, 400, { error: "Account details must be an object." });
        return;
      }
      let username;
      let password;
      try {
        username = validateUsername(body.username);
        password = validateAccountPassword(body.password);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      const credentials = await hashAccountPassword(password);
      const user = await mutateUsers((users) => {
        if (users.some((item) => item.username.toLocaleLowerCase() === username.toLocaleLowerCase())) {
          return null;
        }
        const account = {
          id: randomBytes(16).toString("hex"),
          username,
          passwordSalt: credentials.salt,
          passwordHash: credentials.hash,
          createdAt: new Date().toISOString(),
          websites: []
        };
        users.push(account);
        return account;
      });
      if (!user) {
        sendJson(response, 409, { error: "That username is already in use." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      accountSessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
      sendJson(response, 201, { authenticated: true, account: publicAccount(user) }, {
        "Set-Cookie": createCookie(ACCOUNT_COOKIE, token, SESSION_TTL_MS / 1000)
      });
      return;
    }
    if (url.pathname === "/api/account/login" && request.method === "POST") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      if (!checkAuthRateLimit(request, "login")) {
        sendJson(response, 429, { error: "Too many sign-in attempts. Please try again in 15 minutes." });
        return;
      }
      const body = await readJson(request);
      if (!isObject(body)) {
        sendJson(response, 400, { error: "Account details must be an object." });
        return;
      }
      if (typeof body.username !== "string" || typeof body.password !== "string"
        || body.username.length > 32 || body.password.length > 1024) {
        sendJson(response, 400, { error: "Enter a valid username and password." });
        return;
      }
      const users = await usersPromise;
      const user = users.find((item) => item.username.toLocaleLowerCase() === body.username.trim().toLocaleLowerCase());
      const matches = user
        ? await accountPasswordsMatch(body.password, user)
        : (await scrypt(body.password, "zenvora-unknown-account-salt", 64), false);
      if (!matches) {
        sendJson(response, 401, { error: "Username or password is incorrect." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      accountSessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
      sendJson(response, 200, { authenticated: true, account: publicAccount(user) }, {
        "Set-Cookie": createCookie(ACCOUNT_COOKIE, token, SESSION_TTL_MS / 1000)
      });
      return;
    }
    if (url.pathname === "/api/account/logout" && request.method === "POST") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      accountSessions.delete(getCookie(request, ACCOUNT_COOKIE));
      sendJson(response, 200, { authenticated: false }, {
        "Set-Cookie": createCookie(ACCOUNT_COOKIE, "", 0)
      });
      return;
    }
    if (url.pathname === "/api/account/profile" && request.method === "PUT") {
      if (!accountSession) {
        sendJson(response, 401, { error: "Sign in to change your account." });
        return;
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      const body = await readJson(request);
      if (!isObject(body)) {
        sendJson(response, 400, { error: "Account details must be an object." });
        return;
      }
      if (typeof body.currentPassword !== "string" || body.currentPassword.length > 1024) {
        sendJson(response, 400, { error: "Enter your current password to change account details." });
        return;
      }
      const users = await usersPromise;
      const currentUser = users.find((item) => item.id === accountSession.userId);
      if (!currentUser || !(await accountPasswordsMatch(body.currentPassword, currentUser))) {
        sendJson(response, 401, { error: "Current password is incorrect." });
        return;
      }
      let newUsername = currentUser.username;
      let newCredentials = null;
      try {
        if (body.username !== undefined && body.username !== "") newUsername = validateUsername(body.username);
        if (body.newPassword !== undefined && body.newPassword !== "") {
          newCredentials = await hashAccountPassword(validateAccountPassword(body.newPassword));
        }
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      const updated = await mutateUsers((allUsers) => {
        if (allUsers.some((item) => item.id !== currentUser.id
          && item.username.toLocaleLowerCase() === newUsername.toLocaleLowerCase())) return null;
        const account = allUsers.find((item) => item.id === currentUser.id);
        account.username = newUsername;
        if (newCredentials) {
          account.passwordSalt = newCredentials.salt;
          account.passwordHash = newCredentials.hash;
        }
        return account;
      });
      if (!updated) {
        sendJson(response, 409, { error: "That username is already in use." });
        return;
      }
      const headers = {};
      if (newCredentials) {
        for (const [token, session] of accountSessions) {
          if (session.userId === updated.id) accountSessions.delete(token);
        }
        const token = randomBytes(32).toString("hex");
        accountSessions.set(token, { userId: updated.id, expiresAt: Date.now() + SESSION_TTL_MS });
        headers["Set-Cookie"] = createCookie(ACCOUNT_COOKIE, token, SESSION_TTL_MS / 1000);
      }
      sendJson(response, 200, { account: publicAccount(updated) }, headers);
      return;
    }
    if (url.pathname === "/api/account/websites" && request.method === "POST") {
      if (!accountSession) {
        sendJson(response, 401, { error: "Sign in to save a website." });
        return;
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      const body = await readJson(request);
      if (!isObject(body)) {
        sendJson(response, 400, { error: "Website details must be an object." });
        return;
      }
      let normalizedUrl;
      try {
        normalizedUrl = normalizeWebUrl(body.url);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      const saved = await mutateUsers((users) => {
        const user = users.find((item) => item.id === accountSession.userId);
        if (!user) return null;
        let website = user.websites.find((item) => item.url === normalizedUrl);
        if (website) return website;
        if (user.websites.length >= MAX_ACCOUNT_WEBSITES) {
          throw Object.assign(new Error(`You can save up to ${MAX_ACCOUNT_WEBSITES} websites.`), { status: 400 });
        }
        website = { name: new URL(normalizedUrl).hostname, url: normalizedUrl };
        user.websites.push(website);
        return website;
      });
      if (!saved) {
        sendJson(response, 401, { error: "Your account could not be found. Please sign in again." });
        return;
      }
      sendJson(response, 200, { website: saved });
      return;
    }
    if (url.pathname === "/api/account/websites" && request.method === "DELETE") {
      if (!accountSession) {
        sendJson(response, 401, { error: "Sign in to manage your websites." });
        return;
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      const body = await readJson(request);
      if (!isObject(body)) {
        sendJson(response, 400, { error: "Website details must be an object." });
        return;
      }
      const users = await usersPromise;
      const user = users.find((item) => item.id === accountSession.userId);
      if (!user || typeof body.url !== "string") {
        sendJson(response, 400, { error: "Choose a saved website to remove." });
        return;
      }
      const websites = await mutateUsers((allUsers) => {
        const current = allUsers.find((item) => item.id === accountSession.userId);
        if (!current) return null;
        current.websites = current.websites.filter((website) => website.url !== body.url);
        return current.websites;
      });
      if (!websites) {
        sendJson(response, 401, { error: "Your account could not be found. Please sign in again." });
        return;
      }
      sendJson(response, 200, { websites });
      return;
    }
    if (url.pathname === "/api/login" && request.method === "POST") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      const body = await readJson(request);
      if (typeof body.password !== "string" || body.password.length > 1024 || !passwordsMatch(body.password, adminPassword)) {
        sendJson(response, 401, { error: "The password is incorrect." });
        return;
      }
      const token = randomBytes(32).toString("hex");
      sessions.set(token, Date.now() + SESSION_TTL_MS);
      sendJson(response, 200, { authenticated: true }, {
        "Set-Cookie": createCookie(SESSION_COOKIE, token, SESSION_TTL_MS / 1000)
      });
      return;
    }
    if (url.pathname === "/api/logout" && request.method === "POST") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      sessions.delete(getCookie(request, SESSION_COOKIE));
      sendJson(response, 200, { authenticated: false }, {
        "Set-Cookie": createCookie(SESSION_COOKIE, "", 0)
      });
      return;
    }
    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      if (!authenticated) {
        sendJson(response, 401, { error: "Sign in to view user accounts." });
        return;
      }
      const users = await usersPromise;
      sendJson(response, 200, { users: users.map(publicUser) });
      return;
    }
    if (url.pathname === "/api/admin/settings" && (request.method === "GET" || request.method === "PUT")) {
      if (!authenticated) {
        sendJson(response, 401, { error: "Sign in to access admin settings." });
        return;
      }
      if (request.method === "GET") {
        sendJson(response, 200, await settingsPromise);
        return;
      }
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      const body = await readJson(request);
      let updated;
      try {
        updated = validateSettings(body);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      await persistSettings(dataDir, updated);
      settingsPromise = Promise.resolve(updated);
      sendJson(response, 200, updated);
      return;
    }

    if (url.pathname === "/download-app" && (request.method === "GET" || request.method === "HEAD")) {
      await sendInstaller(request, response, installerPath, request.method === "HEAD");
      return;
    }

    if (url.pathname === "/api/assistant/status" && request.method === "GET") {
      sendJson(response, 200, { configured: Boolean(geminiApiKey) });
      return;
    }

    if (url.pathname === "/api/assistant" && request.method === "POST") {
      if (!sameOrigin(request)) {
        sendJson(response, 403, { error: "Request origin is not allowed." });
        return;
      }
      if (!geminiApiKey) {
        sendJson(response, 503, {
          error: "AI chat is not configured on this server. Add GEMINI_API_KEY in the Render environment settings, then redeploy."
        });
        return;
      }
      if (!checkAuthRateLimit(request, "assistant", 20, 60 * 1000)) {
        sendJson(response, 429, { error: "Too many AI messages. Please wait before trying again." });
        return;
      }
      const body = await readJson(request);
      if (!isObject(body) || !Array.isArray(body.messages)
        || body.messages.length < 1 || body.messages.length > MAX_ASSISTANT_MESSAGES) {
        sendJson(response, 400, { error: `Send between 1 and ${MAX_ASSISTANT_MESSAGES} chat messages.` });
        return;
      }
      const messages = [];
      for (let index = 0; index < body.messages.length; index += 1) {
        const message = body.messages[index];
        if (!isObject(message) || !["user", "model"].includes(message.role)
          || typeof message.text !== "string" || !message.text.trim()
          || message.text.length > MAX_ASSISTANT_MESSAGE_LENGTH
          || (index === 0 && message.role !== "user")
          || (index > 0 && message.role === body.messages[index - 1]?.role)) {
          sendJson(response, 400, { error: "Chat messages must alternate between user and assistant and be 1 to 4000 characters." });
          return;
        }
        messages.push({ role: message.role, parts: [{ text: message.text.trim() }] });
      }
      if (messages[messages.length - 1].role !== "user") {
        sendJson(response, 400, { error: "Send a user message to continue the conversation." });
        return;
      }

      let providerResponse;
      try {
        providerResponse = await fetchImpl(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiApiKey
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: "You are ZENVORA AI, a helpful conversational assistant. Answer naturally in the language used by the user. Be clear, respectful, and concise." }]
              },
              contents: messages,
              generationConfig: { maxOutputTokens: 1024 }
            }),
            signal: AbortSignal.timeout(20000)
          }
        );
      } catch (error) {
        console.error("Gemini assistant request failed:", error);
        sendJson(response, 502, { error: "The AI service could not be reached. Please try again." });
        return;
      }
      if (!providerResponse.ok) {
        console.error("Gemini assistant returned HTTP", providerResponse.status);
        sendJson(response, 502, { error: "The AI service could not answer right now. Please try again." });
        return;
      }
      let providerData;
      try {
        providerData = await providerResponse.json();
      } catch {
        sendJson(response, 502, { error: "The AI service returned an invalid response." });
        return;
      }
      const answer = providerData?.candidates?.[0]?.content?.parts
        ?.map((part) => typeof part.text === "string" ? part.text : "")
        .join("")
        .trim();
      if (!answer) {
        sendJson(response, 502, { error: "The AI service returned no answer. Please try again." });
        return;
      }
      sendJson(response, 200, { answer });
      return;
    }

    if (url.pathname === "/admin.js" && !authenticated) {
      sendJson(response, 401, { error: "Sign in to access admin assets." }, {
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      });
      return;
    }

    if (STATIC_FILES[url.pathname] && (request.method === "GET" || request.method === "HEAD")) {
      const [filename, contentType] = STATIC_FILES[url.pathname];
      const shouldReadBinary = contentType === "image/png" || contentType === "application/zip" || contentType === "application/octet-stream";
      const body = shouldReadBinary
        ? await readFile(path.join(ROOT, filename))
        : await requireFile(filename);
      const headers = {
        ...(url.pathname === "/service-worker.js" ? { "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" } : {}),
        ...(url.pathname === "/admin.js" ? { "Cache-Control": "no-store" } : {}),
        ...(url.pathname === "/download-app" ? { "Content-Disposition": "attachment; filename=\"ZENVORA-Search-Setup.exe\"" } : {}),
        ...(NOINDEX_PATHS.has(url.pathname) ? { "X-Robots-Tag": "noindex, nofollow, noarchive" } : {})
      };
      send(response, 200, request.method === "HEAD" ? "" : body, contentType, headers);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API endpoint not found." });
      return;
    }
    send(response, 404, "Page not found.", "text/plain; charset=utf-8", {
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    });
  }

  const server = createHttpServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error("Request failed:", error);
      if (response.headersSent) {
        response.destroy(error);
      } else {
        sendJson(response, error.status ?? 500, {
          error: error.status ? error.message : "The server could not complete the request."
        });
      }
    });
  });
  return server;
}

async function start() {
  await loadDotEnv();
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const isRender = process.env.RENDER === "true";
  const listenHost = process.env.HOST ?? (isRender ? "0.0.0.0" : "127.0.0.1");
  const secureCookies = process.env.SECURE_COOKIES === "true" || isRender;
  const trustProxy = process.env.TRUST_PROXY === "true" || isRender;
  if (!["127.0.0.1", "localhost", "::1"].includes(listenHost) && !secureCookies) {
    throw new Error("Set SECURE_COOKIES=true before listening beyond localhost.");
  }
  const server = createApp({
    adminPassword: process.env.ADMIN_PASSWORD,
    dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data"),
    serperApiKey: process.env.SERPER_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    androidAppId: process.env.ANDROID_APP_ID,
    androidSha256Fingerprints: (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean),
    secureCookies,
    trustProxy
  });
  server.listen(port, listenHost, () => {
    console.log(`Zenvora is listening on ${listenHost}:${port}.`);
    if (!["127.0.0.1", "localhost", "::1"].includes(listenHost)) {
      console.log("Use HTTPS through a trusted reverse proxy for public access.");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
