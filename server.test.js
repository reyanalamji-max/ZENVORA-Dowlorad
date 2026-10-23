import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "./server.js";

const password = "test-owner-password-that-is-long-enough";
let dataDir;
let server;
let baseUrl;
let cookie;

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "zenvora-test-"));
  server = createApp({ adminPassword: password, dataDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(dataDir, { recursive: true, force: true });
});

test("search results stay on the Zenvora site and use a local-only content policy", async () => {
  const homepage = await fetch(baseUrl);
  assert.match(homepage.headers.get("content-security-policy"), /frame-src 'self'/);
  assert.match(homepage.headers.get("content-security-policy"), /img-src[^;]*https:\/\/www\.google\.com/);
  assert.match(homepage.headers.get("content-security-policy"), /img-src[^;]*https:\/\/\*\.gstatic\.com/);
  assert.doesNotMatch(homepage.headers.get("content-security-policy"), /frame-src[^;]*https?:/);
  assert.match(homepage.headers.get("content-security-policy"), /form-action 'self'/);
  assert.doesNotMatch(homepage.headers.get("content-security-policy"), /duckduckgo|openstreetmap/i);
  const homepageHtml = await homepage.text();
  assert.match(homepageHtml, /Find a useful place to start/);
  assert.match(homepageHtml, /<details class="home-content" id="explore-content">/);
  assert.match(homepageHtml, /Explore useful apps, websites, and guides/);
  assert.match(homepageHtml, /class="home-header"/);
  assert.match(homepageHtml, /class="home-ask-button" href="\/assistant"/);
  assert.match(homepageHtml, /id="apps-launcher"/);
  assert.equal((homepageHtml.match(/class="launcher-app/g) ?? []).length, 15);
  assert.doesNotMatch(homepageHtml, /class="assistant-promo"/);
  assert.match(homepageHtml, /name="description" content="Search the web, explore popular Google apps/);
  assert.match(homepageHtml, /Research and learn/);
  assert.match(homepageHtml, /How to search with ZENVORA/);
  assert.match(homepageHtml, /rel="canonical" href="https:\/\/zenvora-dowlorad\.onrender\.com\/"/);
  assert.equal((homepageHtml.match(/<h1(?:\s|>)/g) ?? []).length, 1);
  assert.match(homepageHtml, /property="og:site_name" content="ZENVORA"/);
  assert.match(homepageHtml, /name="twitter:card" content="summary_large_image"/);
  const structuredData = homepageHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(structuredData, "homepage should provide structured data");
  const structuredGraph = JSON.parse(structuredData[1])["@graph"];
  assert.ok(structuredGraph.some((entry) => entry["@type"] === "WebSite"));
  assert.ok(structuredGraph.some((entry) => entry["@type"] === "Organization"));
  assert.equal((homepageHtml.match(/name="google-adsense-account"/g) ?? []).length, 1);

  for (const route of ["/about", "/contact", "/privacy", "/terms", "/disclaimer"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} should be available`);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.match(html, /<h1/);
    assert.match(html, /<link rel="canonical"/);
    assert.match(html, /name="description"/);
    assert.match(html, /property="og:url"/);
    assert.match(html, /name="twitter:card"/);
    assert.match(html, /href="\/privacy"/);
  }

  const robots = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/zenvora-dowlorad\.onrender\.com\/sitemap\.xml/);
  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type"), /application\/xml/);
  const sitemapXml = await sitemap.text();
  assert.match(sitemapXml, /https:\/\/zenvora-dowlorad\.onrender\.com\/privacy/);
  const sitemapUrls = [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(sitemapUrls, [
    "https://zenvora-dowlorad.onrender.com/",
    "https://zenvora-dowlorad.onrender.com/about",
    "https://zenvora-dowlorad.onrender.com/contact",
    "https://zenvora-dowlorad.onrender.com/privacy",
    "https://zenvora-dowlorad.onrender.com/terms",
    "https://zenvora-dowlorad.onrender.com/disclaimer",
    "https://zenvora-dowlorad.onrender.com/download"
  ]);

  const initialSettingsResponse = await fetch(`${baseUrl}/api/settings`);
  const initialSettings = await initialSettingsResponse.json();
  assert.deepEqual(initialSettings.shortcuts, []);

  const searchPage = await fetch(`${baseUrl}/search?q=hello`);
  assert.equal(searchPage.status, 200);
  assert.match(searchPage.headers.get("content-type"), /text\/html/);
  assert.match(searchPage.headers.get("x-robots-tag"), /noindex/);
  assert.match(await searchPage.text(), /Zenvora search results/);

  const downloadPage = await fetch(`${baseUrl}/download`);
  assert.equal(downloadPage.status, 200);
  assert.match(await downloadPage.text(), /Install or open on this device/);
  assert.equal((await fetch(`${baseUrl}/download.js`)).status, 200);

  const accountPage = await fetch(`${baseUrl}/account`);
  assert.equal(accountPage.status, 200);
  assert.match(accountPage.headers.get("x-robots-tag"), /noindex/);
  assert.match(await accountPage.text(), /Create an account/);
  assert.equal((await fetch(`${baseUrl}/account.js`)).status, 200);
  for (const page of ["/", "/search?q=hello", "/apps", "/videos"]) {
    const html = await (await fetch(`${baseUrl}${page}`)).text();
    assert.doesNotMatch(html, /<script src="\/viewer\.js"/);
  }
  assert.match(await (await fetch(`${baseUrl}/open?url=https%3A%2F%2Fexample.com`)).text(), /<script src="\/viewer\.js"/);

  const viewerPage = await fetch(`${baseUrl}/open?url=https%3A%2F%2Fexample.com`);
  assert.equal(viewerPage.status, 200);
  const viewerHtml = await viewerPage.text();
  assert.match(viewerHtml, /Open website/);
  assert.doesNotMatch(viewerHtml, /<iframe/);
  const viewerScript = await fetch(`${baseUrl}/viewer.js`);
  const viewerScriptText = await viewerScript.text();
  assert.match(viewerScriptText, /window\.location\.replace\(destination\.href\)/);
  assert.doesNotMatch(viewerScriptText, /frame\.src/);
  assert.doesNotMatch(viewerScriptText, /document\.addEventListener\("click"/);

  const searchResponse = await fetch(`${baseUrl}/api/search?q=hello&type=all`);
  assert.equal(searchResponse.status, 200);
  assert.deepEqual((await searchResponse.json()).results, []);

  const missingPage = await fetch(`${baseUrl}/not-a-real-page`);
  assert.equal(missingPage.status, 404);
  assert.match(missingPage.headers.get("x-robots-tag"), /noindex/);
});

test("admin settings require owner authentication and persist updates", async () => {
  const denied = await fetch(`${baseUrl}/api/admin/settings`);
  assert.equal(denied.status, 401);
  const protectedAdminScript = await fetch(`${baseUrl}/admin.js`);
  assert.equal(protectedAdminScript.status, 401);
  const publicLoginScript = await fetch(`${baseUrl}/login.js`);
  assert.equal(publicLoginScript.status, 200);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ password })
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  cookie = login.headers.get("set-cookie").split(";")[0];
  const authorizedAdminScript = await fetch(`${baseUrl}/admin.js`, { headers: { Cookie: cookie } });
  assert.equal(authorizedAdminScript.status, 200);

  const update = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: cookie
    },
    body: JSON.stringify({
      siteName: "My Search",
      tagline: "A private home page",
      accentColor: "#123abc",
      shortcuts: [{ name: "Example", url: "https://example.com/" }],
      videos: [{ title: "Company introduction", url: "https://www.youtube.com/watch?v=example123" }]
    })
  });
  assert.equal(update.status, 200);

  const publicSettings = await fetch(`${baseUrl}/api/settings`);
  assert.deepEqual(await publicSettings.json(), {
    siteName: "My Search",
    tagline: "A private home page",
    accentColor: "#123abc",
    shortcuts: [{ name: "Example", url: "https://example.com/" }],
    videos: [{ title: "Company introduction", url: "https://www.youtube.com/watch?v=example123" }]
  });
});

test("visitor accounts keep saved websites private and only expose them in the admin panel", async () => {
  const register = (username) => fetch(`${baseUrl}/api/account/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ username, password: "visitor-password-long-enough" })
  });
  const crossOriginRegister = await fetch(`${baseUrl}/api/account/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ username: "attacker", password: "visitor-password-long-enough" })
  });
  assert.equal(crossOriginRegister.status, 403);

  const aliceRegistration = await register("Alice");
  assert.equal(aliceRegistration.status, 201);
  const aliceCookie = aliceRegistration.headers.get("set-cookie").split(";")[0];
  const aliceResult = await aliceRegistration.json();
  assert.equal(aliceResult.account.username, "Alice");
  assert.equal("passwordHash" in aliceResult.account, false);
  assert.match(aliceRegistration.headers.get("set-cookie"), /HttpOnly/);
  assert.match(aliceRegistration.headers.get("set-cookie"), /SameSite=Strict/);

  const duplicate = await register("alice");
  assert.equal(duplicate.status, 409);
  const bobRegistration = await register("Bob");
  assert.equal(bobRegistration.status, 201);
  const bobCookie = bobRegistration.headers.get("set-cookie").split(";")[0];

  const saveWebsite = await fetch(`${baseUrl}/api/account/websites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: aliceCookie
    },
    body: JSON.stringify({ url: "https://private.example/profile" })
  });
  assert.equal(saveWebsite.status, 200);
  assert.deepEqual((await saveWebsite.json()).website, {
    name: "private.example",
    url: "https://private.example/profile"
  });

  const aliceSearch = await fetch(`${baseUrl}/api/search?q=private&type=websites`, {
    headers: { Cookie: aliceCookie }
  });
  assert.equal((await aliceSearch.json()).results.length, 1);
  const bobSearch = await fetch(`${baseUrl}/api/search?q=private&type=websites`, {
    headers: { Cookie: bobCookie }
  });
  assert.deepEqual((await bobSearch.json()).results, []);
  const anonymousSearch = await fetch(`${baseUrl}/api/search?q=private&type=websites`);
  assert.deepEqual((await anonymousSearch.json()).results, []);

  const deniedAdminView = await fetch(`${baseUrl}/api/admin/users`);
  assert.equal(deniedAdminView.status, 401);
  const adminView = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Cookie: cookie }
  });
  assert.equal(adminView.status, 200);
  const users = (await adminView.json()).users;
  const alice = users.find((user) => user.username === "Alice");
  assert.equal(alice.websites[0].url, "https://private.example/profile");
  assert.equal("passwordHash" in alice, false);
  assert.equal("passwordSalt" in alice, false);

  const storedUsers = JSON.parse(await readFile(path.join(dataDir, "users.json"), "utf8"));
  assert.equal(storedUsers[0].password, undefined);
  assert.equal(storedUsers[0].passwordHash.length, 128);
  assert.notEqual(storedUsers[0].passwordHash, "visitor-password-long-enough");

  const changed = await fetch(`${baseUrl}/api/account/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: aliceCookie
    },
    body: JSON.stringify({
      username: "AliceUpdated",
      currentPassword: "visitor-password-long-enough",
      newPassword: "another-long-visitor-password"
    })
  });
  assert.equal(changed.status, 200);
  assert.match(changed.headers.get("set-cookie"), /HttpOnly/);
  const rotatedCookie = changed.headers.get("set-cookie").split(";")[0];
  const oldSession = await fetch(`${baseUrl}/api/account/me`, {
    headers: { Cookie: aliceCookie }
  });
  assert.deepEqual(await oldSession.json(), { authenticated: false });
  const newSession = await fetch(`${baseUrl}/api/account/me`, {
    headers: { Cookie: rotatedCookie }
  });
  assert.equal((await newSession.json()).account.username, "AliceUpdated");
  const oldLogin = await fetch(`${baseUrl}/api/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ username: "Alice", password: "visitor-password-long-enough" })
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await fetch(`${baseUrl}/api/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ username: "aliceupdated", password: "another-long-visitor-password" })
  });
  assert.equal(newLogin.status, 200);
  assert.equal((await newLogin.json()).account.username, "AliceUpdated");
});

test("local search returns only matching saved websites and videos", async () => {
  const response = await fetch(`${baseUrl}/api/search?q=company&type=all`);
  assert.equal(response.status, 200);
  const results = (await response.json()).results;
  assert.deepEqual(results.map(({ kind, title, url }) => ({ kind, title, url })), [
    { kind: "video", title: "Company introduction", url: "https://www.youtube.com/watch?v=example123" }
  ]);

  const websiteResponse = await fetch(`${baseUrl}/api/search?q=example&type=websites`);
  const websiteResults = (await websiteResponse.json()).results;
  assert.equal(websiteResults.length, 1);
  assert.equal(websiteResults[0].title, "Example");

  const videoOnlyResponse = await fetch(`${baseUrl}/api/search?q=company&type=videos`);
  assert.equal((await videoOnlyResponse.json()).results.length, 1);
});

test("web search proxies Serper results without exposing its key", async () => {
  const temporaryDataDir = await mkdtemp(path.join(os.tmpdir(), "zenvora-serper-test-"));
  const apiKey = "serper-test-key";
  const providerRequests = [];
  let providerStatus = 200;
  const webServer = createApp({
    adminPassword: password,
    dataDir: temporaryDataDir,
    serperApiKey: apiKey,
    fetchImpl: async (endpoint, options) => {
      providerRequests.push({ endpoint, options });
      return new Response(JSON.stringify({
        organic: [
          { title: "Example result", link: "https://example.com/path", snippet: "A public web result." },
          { title: "Unsafe result", link: "javascript:alert(1)", snippet: "Must be ignored." }
        ]
      }), { status: providerStatus, headers: { "Content-Type": "application/json" } });
    }
  });
  await new Promise((resolve) => webServer.listen(0, "127.0.0.1", resolve));
  const webBaseUrl = `http://127.0.0.1:${webServer.address().port}`;

  try {
    const response = await fetch(`${webBaseUrl}/api/search?q=public+web&type=all&page=2`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.page, 2);
    assert.equal(data.webSearchConfigured, true);
    assert.equal(data.hasMore, false);
    assert.deepEqual(data.results, [{
      kind: "web",
      title: "Example result",
      url: "https://example.com/path",
      description: "A public web result."
    }]);
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0].endpoint, "https://google.serper.dev/search");
    assert.equal(providerRequests[0].options.headers["X-API-KEY"], apiKey);
    assert.deepEqual(JSON.parse(providerRequests[0].options.body), { q: "public web", num: 10, page: 2 });

    const videos = await fetch(`${webBaseUrl}/api/search?q=public&type=videos`);
    assert.equal((await videos.json()).webSearchConfigured, false);
    assert.equal(providerRequests.length, 1);
    const publicSettings = await fetch(`${webBaseUrl}/api/settings`);
    assert.doesNotMatch(await publicSettings.text(), new RegExp(apiKey));

    providerStatus = 403;
    const providerFailure = await fetch(`${webBaseUrl}/api/search?q=public+web&type=all`);
    assert.equal(providerFailure.status, 502);
    const failedData = await providerFailure.json();
    assert.match(failedData.error, /Serper API key/);
    assert.deepEqual(failedData.results, []);
  } finally {
    await new Promise((resolve, reject) => webServer.close((error) => error ? reject(error) : resolve()));
    await rm(temporaryDataDir, { recursive: true, force: true });
  }
});

test("local search rejects unsupported categories and oversized queries", async () => {
  const unsupported = await fetch(`${baseUrl}/api/search?q=company&type=maps`);
  assert.equal(unsupported.status, 400);

  const oversized = await fetch(`${baseUrl}/api/search?q=${"x".repeat(201)}`);
  assert.equal(oversized.status, 400);

  const invalidPage = await fetch(`${baseUrl}/api/search?q=company&page=101`);
  assert.equal(invalidPage.status, 400);
});

test("admin settings reject an invalid accent color", async () => {
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: cookie
    },
    body: JSON.stringify({
      siteName: "My Search",
      tagline: "Private",
      accentColor: "red",
      shortcuts: [],
      videos: []
    })
  });
  assert.equal(response.status, 400);
});

test("website shortcuts have no fixed count limit and normalize bare domains", async () => {
  const shortcuts = Array.from({ length: 20 }, (_, index) => ({
    name: `My website ${index + 1}`,
    url: `site${index + 1}.example`
  }));
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: cookie
    },
    body: JSON.stringify({
      siteName: "My Search",
      tagline: "Private",
      accentColor: "#123abc",
      shortcuts,
      videos: []
    })
  });

  assert.equal(response.status, 200);
  const settings = await response.json();
  assert.equal(settings.shortcuts.length, 20);
  assert.equal(settings.shortcuts[0].url, "https://site1.example/");
});

test("login rejects cross-origin requests", async () => {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://example.com" },
    body: JSON.stringify({ password })
  });
  assert.equal(response.status, 403);
});

test("malformed session cookies are treated as unauthenticated", async () => {
  const response = await fetch(`${baseUrl}/api/session`, {
    headers: { Cookie: "zenvora_session=%" }
  });
  assert.deepEqual(await response.json(), { authenticated: false });
});

test("admin is absent from homepage links and is marked not for indexing", async () => {
  const homepage = await fetch(baseUrl);
  const html = await homepage.text();
  assert.equal(html.includes('href="/admin"'), false);

  const admin = await fetch(`${baseUrl}/admin`);
  assert.match(admin.headers.get("x-robots-tag"), /noindex/);
  const inaccessibleSource = await fetch(`${baseUrl}/private-admin/admin.js`);
  assert.equal(inaccessibleSource.status, 404);
});

test("homepage offers an accessible saved-items suggestion list", async () => {
  const response = await fetch(baseUrl);
  const html = await response.text();
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-autocomplete="list"/);
  assert.match(html, /id="search-suggestions" role="listbox"/);
});

test("PWA manifest, icons, and privacy-safe service worker are served", async () => {
  const manifestResponse = await fetch(`${baseUrl}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("content-type"), /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "ZENVORA");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some(({ sizes }) => sizes === "192x192"));
  assert.ok(manifest.icons.some(({ sizes, purpose }) => sizes === "512x512" && purpose === "maskable"));

  for (const [route, signature] of [
    ["/icons/icon-192.png", [137, 80, 78, 71, 13, 10, 26, 10]],
    ["/icons/icon-512.png", [137, 80, 78, 71, 13, 10, 26, 10]]
  ]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.deepEqual([...bytes.slice(0, signature.length)], signature);
  }

  const workerResponse = await fetch(`${baseUrl}/service-worker.js`);
  assert.equal(workerResponse.status, 200);
  assert.match(workerResponse.headers.get("service-worker-allowed"), /\//);
  assert.match(workerResponse.headers.get("cache-control"), /no-cache/);
  const worker = await workerResponse.text();
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /!CACHEABLE_URLS\.has\(requestUrl\.pathname\)/);
  assert.doesNotMatch(worker, /\/api\/.*cache\.put/s);

  for (const page of ["/", "/search", "/apps", "/videos", "/account", "/open"]) {
    const html = await (await fetch(`${baseUrl}${page}`)).text();
    assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /src="\/pwa\.js" defer/);
  }
});

test("Android TWA asset links stay disabled until a valid signing fingerprint is configured", async () => {
  const unconfigured = await fetch(`${baseUrl}/.well-known/assetlinks.json`);
  assert.equal(unconfigured.status, 404);

  const fingerprint = Array(32).fill("AB").join(":");
  const assetLinksServer = createApp({
    adminPassword: password,
    dataDir,
    androidAppId: "com.zenvora.app",
    androidSha256Fingerprints: [fingerprint]
  });
  await new Promise((resolve) => assetLinksServer.listen(0, "127.0.0.1", resolve));
  const assetLinksUrl = `http://127.0.0.1:${assetLinksServer.address().port}/.well-known/assetlinks.json`;
  try {
    const response = await fetch(assetLinksUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.deepEqual(await response.json(), [{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.zenvora.app",
        sha256_cert_fingerprints: [fingerprint]
      }
    }]);
  } finally {
    await new Promise((resolve, reject) => assetLinksServer.close((error) => error ? reject(error) : resolve()));
  }

  const invalid = createApp({
    adminPassword: password,
    dataDir,
    androidAppId: "com.zenvora.app",
    androidSha256Fingerprints: ["not-a-fingerprint"]
  });
  await new Promise((resolve) => invalid.listen(0, "127.0.0.1", resolve));
  try {
    const invalidResponse = await fetch(`http://127.0.0.1:${invalid.address().port}/.well-known/assetlinks.json`);
    assert.equal(invalidResponse.status, 404);
  } finally {
    await new Promise((resolve, reject) => invalid.close((error) => error ? reject(error) : resolve()));
  }
});

test("video library is reachable without exposing admin controls", async () => {
  const response = await fetch(`${baseUrl}/videos`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /YOUR LIBRARY/);
  assert.match(html, /href="\/"/);
  assert.equal(html.includes('href="/admin"'), false);
});

test("Google apps launcher links to official Google products", async () => {
  const response = await fetch(`${baseUrl}/apps`);
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const productUrl of [
    "https://maps.google.com/",
    "https://www.youtube.com/",
    "https://mail.google.com/",
    "https://drive.google.com/",
    "https://docs.google.com/document/",
    "https://calendar.google.com/",
    "https://earth.google.com/",
    "https://cloud.google.com/"
  ]) {
    assert.ok(html.includes(`href="${productUrl}"`), `Missing Google product link: ${productUrl}`);
  }
  assert.match(html, /Google’s official websites/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /href="\/(?:maps|mail|drive)"/);
});

test("Zenvora logo and wordmark are available across app pages", async () => {
  const logo = await fetch(`${baseUrl}/logo.svg`);
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(await logo.text(), /Zenvora logo/);

  for (const route of ["/", "/search?q=Zenvora", "/apps", "/videos", "/admin"]) {
    const response = await fetch(`${baseUrl}${route}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /href="\/logo\.svg"/);
    assert.match(html, /Zenvora/);
  }
});

test("retired Maps, Mail, and Drive demo routes are not served", async () => {
  for (const route of ["/maps", "/mail", "/drive"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 404);
  }
});

test("website shortcuts reject unsafe URLs", async () => {
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: cookie
    },
    body: JSON.stringify({
      siteName: "My Search",
      tagline: "Private",
      accentColor: "#123abc",
      shortcuts: [{ name: "Unsafe", url: "javascript:alert(1)" }],
      videos: []
    })
  });

  test("search results and website shortcuts open websites directly", async () => {
    const results = await fetch(`${baseUrl}/api/search?q=site1&type=websites`);
    assert.equal((await results.json()).results[0].url, "https://site1.example/");

    const homepage = await fetch(baseUrl);
    assert.match(await homepage.text(), /search-suggestions/);
    const searchPage = await fetch(`${baseUrl}/search?q=Example`);
    assert.equal(searchPage.status, 200);
    const searchHtml = await searchPage.text();
    assert.match(searchHtml, /search\.js/);
    assert.match(searchHtml, /Zenvora search results/);
    const searchScript = await fetch(`${baseUrl}/search.js`);
    const searchScriptText = await searchScript.text();
    assert.match(searchScriptText, /\/open\?url=/);
    assert.match(searchScriptText, /www\.google\.com\/s2\/favicons/);
    assert.match(searchScriptText, /image\.loading = "lazy"/);
    assert.match(searchScriptText, /image\.addEventListener\("error"/);
    const homeScript = await fetch(`${baseUrl}/app.js`);
    assert.match(await homeScript.text(), /\/open\?url=/);
  });
  assert.equal(response.status, 400);
});

test("video links reject unsafe protocols", async () => {
  const response = await fetch(`${baseUrl}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: cookie
    },
    body: JSON.stringify({
      siteName: "My Search",
      tagline: "Private",
      accentColor: "#123abc",
      shortcuts: [],
      videos: [{ title: "Unsafe", url: "javascript:alert(1)" }]
    })
  });
  assert.equal(response.status, 400);
});
