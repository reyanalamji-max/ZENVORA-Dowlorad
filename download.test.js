import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const response = await fetch(`${baseUrl}/download`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /Download for Windows/);
  assert.match(html, /href="\/download-app"/);
  assert.match(html, /Windows may show a security warning for unsigned or new installers/);
  assert.match(html, /ZENVORA goes where you go/);
  assert.match(html, /id="phone-install"[^>]+href="\/"[^>]+hidden/);
  assert.match(html, /id="universal-install" href="\/"/);
  assert.doesNotMatch(html, /download="ZENVORA-Search-Setup\.exe"/);
  assert.match(html, /Mac, Chromebook &amp; other PCs/);
  assert.match(html, /Open &amp; install ZENVORA/);
  assert.match(html, /Open &amp; add to Home Screen/);
  assert.doesNotMatch(html, /zenvora-ttu9\.onrender\.com/);
  assert.doesNotMatch(html, /src="\/pwa\.js"/);

  const downloadScript = await (await fetch(`${baseUrl}/download.js`)).text();
  assert.match(downloadScript, /Install ZENVORA on Android/);
  assert.match(downloadScript, /Install ZENVORA on iPhone/);
  assert.match(downloadScript, /Add to Home Screen/);
  assert.match(downloadScript, /beforeinstallprompt/);
  assert.match(downloadScript, /Windows installer temporarily unavailable/);
  assert.match(downloadScript, /fetch\("\/download-app", \{ method: "HEAD"/);
});

test("download-app serves a Windows installer attachment, not the raw app executable", async () => {
  const response = await fetch(`${baseUrl}/download-app`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/octet-stream/);
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  assert.match(response.headers.get("content-disposition"), /attachment; filename="ZENVORA-Search-Setup\.exe"/);
  assert.ok(Number(response.headers.get("content-length")) > 50_000_000, "installer should include the Electron runtime and application assets");
});

test("download-app reports a missing installer as an actionable service-unavailable response", async () => {
  const unavailableServer = createApp({
    dataDir,
    installerPath: path.join(dataDir, "missing-installer.exe")
  });
  await new Promise((resolve) => unavailableServer.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${unavailableServer.address().port}/download-app`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("content-disposition"), null);
    assert.deepEqual(await response.json(), {
      error: "The Windows installer is temporarily unavailable. Please try again later."
    });
  } finally {
    await new Promise((resolve, reject) => unavailableServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("download-app supports byte-range requests so interrupted downloads can resume", async () => {
  const installerPath = path.join(dataDir, "range-test.exe");
  await writeFile(installerPath, Buffer.from("0123456789"));
  const rangeServer = createApp({ dataDir, installerPath });
  await new Promise((resolve) => rangeServer.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${rangeServer.address().port}/download-app`, {
      headers: { Range: "bytes=3-6" }
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-range"), "bytes 3-6/10");
    assert.equal(response.headers.get("content-length"), "4");
    assert.equal(await response.text(), "3456");
  } finally {
    await new Promise((resolve, reject) => rangeServer.close((error) => error ? reject(error) : resolve()));
  }
});

test("download-app rejects an unsatisfiable byte range with the correct file size", async () => {
  const installerPath = path.join(dataDir, "range-test.exe");
  await writeFile(installerPath, Buffer.from("0123456789"));
  const rangeServer = createApp({ dataDir, installerPath });
  await new Promise((resolve) => rangeServer.listen(0, "127.0.0.1", resolve));

  try {
    const response = await fetch(`http://127.0.0.1:${rangeServer.address().port}/download-app`, {
      headers: { Range: "bytes=10-" }
    });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    assert.equal(await response.text(), "");
  } finally {
    await new Promise((resolve, reject) => rangeServer.close((error) => error ? reject(error) : resolve()));
  }
});
