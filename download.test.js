import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "./server.js";

let dataDir;
let server;
let baseUrl;

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "zenvora-download-test-"));
  server = createApp({ dataDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(dataDir, { recursive: true, force: true });
});

test("download page links to the branded Windows installer", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /Download for Windows/);
  assert.match(html, /href="\/download-app"/);
  assert.match(html, /ZENVORA goes where you go/);
  assert.match(html, /id="phone-install"[^>]+href="https:\/\/zenvora-ttu9\.onrender\.com\/"[^>]+hidden/);
  assert.match(html, /Open &amp; install ZENVORA/);
  assert.match(html, /Open &amp; add to Home Screen/);
  assert.doesNotMatch(html, /src="\/pwa\.js"/);

  const downloadScript = await (await fetch(`${baseUrl}/download.js`)).text();
  assert.match(downloadScript, /Install ZENVORA on Android/);
  assert.match(downloadScript, /Install ZENVORA on iPhone/);
  assert.match(downloadScript, /Add to Home Screen/);
});

test("download-app serves a Windows installer attachment, not the raw app executable", async () => {
  const response = await fetch(`${baseUrl}/download-app`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/octet-stream/);
  assert.match(response.headers.get("content-disposition"), /attachment; filename="ZENVORA-Search-Setup\.exe"/);
  assert.ok(Number(response.headers.get("content-length")) > 50_000_000, "installer should include the Electron runtime and application assets");
});
