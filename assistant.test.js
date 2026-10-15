import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "./server.js";

let dataDir;
let servers = [];

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), "zenvora-assistant-test-"));
});

after(async () => {
  await Promise.all(servers.map((server) =>
    new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  ));
  await rm(dataDir, { recursive: true, force: true });
});

test("AI page and chat endpoint serve the platform and proxy Gemini without exposing the API key", async () => {
  let providerUrl;
  let providerOptions;
  const server = createApp({
    dataDir,
    geminiApiKey: "test-gemini-key",
    fetchImpl: async (url, options) => {
      providerUrl = url;
      providerOptions = options;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "नमस्ते! मैं आपकी कैसे मदद करूँ?" }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const baseUrl = await listen(server);

  const home = await fetch(baseUrl);
  assert.equal(home.status, 200);
  const homeHtml = await home.text();
  assert.match(homeHtml, /id="ai-mode-button"[^>]*>[\s\S]*?AI Model/);
  assert.match(homeHtml, /class="ai-mode-welcome"[^>]*>Welcome/);
  assert.doesNotMatch(homeHtml, /class="search-submit"/);
  const homeScript = await (await fetch(`${baseUrl}/app.js`)).text();
  assert.match(homeScript, /\/assistant\?q=/);
  assert.match(homeScript, /aiModeButton\.addEventListener/);
  const homeStyles = await (await fetch(`${baseUrl}/styles.css`)).text();
  assert.match(homeStyles, /\.ai-mode-button:hover/);
  assert.match(homeStyles, /\.ai-mode-button:hover \.ai-mode-welcome/);
  const assistantPage = await fetch(`${baseUrl}/assistant`);
  assert.equal(assistantPage.status, 200);
  assert.match(await assistantPage.text(), /Start voice conversation/);
  const assistantScript = await (await fetch(`${baseUrl}/assistant.js`)).text();
  assert.match(assistantScript, /recognition\.continuous = false/);
  assert.match(assistantScript, /startListeningAgain/);
  assert.match(assistantScript, /speechSynthesis\.speak/);
  assert.match(assistantScript, /\/api\/assistant\/status/);
  const assistantStyles = await (await fetch(`${baseUrl}/assistant.css`)).text();
  assert.match(assistantStyles, /assistant-rgb-flow/);

  const response = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ messages: [{ role: "user", text: "नमस्ते" }] })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { answer: "नमस्ते! मैं आपकी कैसे मदद करूँ?" });
  assert.equal(providerUrl, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent");
  assert.equal(providerOptions.headers["x-goog-api-key"], "test-gemini-key");
  assert.equal(providerOptions.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(providerOptions.body).contents, [
    { role: "user", parts: [{ text: "नमस्ते" }] }
  ]);
});

test("AI chat requires same-origin requests and validates conversation turns", async () => {
  const server = createApp({
    dataDir,
    geminiApiKey: "test-gemini-key",
    fetchImpl: async () => assert.fail("invalid requests must not reach Gemini")
  });
  const baseUrl = await listen(server);
  const headers = { "Content-Type": "application/json", Origin: baseUrl };

  const crossOrigin = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { ...headers, Origin: "https://attacker.example" },
    body: JSON.stringify({ messages: [{ role: "user", text: "Hello" }] })
  });
  assert.equal(crossOrigin.status, 403);

  const invalidTurns = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: [
      { role: "user", text: "Hello" },
      { role: "user", text: "Repeat" }
    ] })
  });
  assert.equal(invalidTurns.status, 400);
});

test("AI chat reports a clear unavailable response when Gemini is unset or still a placeholder", async () => {
  const server = createApp({ dataDir, geminiApiKey: "replace-with-your-Gemini-API-key" });
  const baseUrl = await listen(server);
  const statusResponse = await fetch(`${baseUrl}/api/assistant/status`);
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(await statusResponse.json(), { configured: false });

  const response = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ messages: [{ role: "user", text: "Hello" }] })
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "AI chat is not configured on this server. Add GEMINI_API_KEY in the Render environment settings, then redeploy."
  });
});

test("AI chat explains Gemini access and quota failures without exposing provider details", async () => {
  const cases = [
    [400, /GEMINI_API_KEY is valid/],
    [401, /GEMINI_API_KEY is valid/],
    [403, /API key restrictions/],
    [404, /model is unavailable/],
    [429, /quota or rate limit/]
  ];

  for (const [status, expectedMessage] of cases) {
    const server = createApp({
      dataDir,
      geminiApiKey: "test-gemini-key",
      fetchImpl: async () => new Response("provider response details", { status })
    });
    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ messages: [{ role: "user", text: "Hello" }] })
    });

    assert.equal(response.status, 502);
    const result = await response.json();
    assert.match(result.error, expectedMessage);
    assert.doesNotMatch(result.error, /provider response details|test-gemini-key/);
  }
});

test("AI status endpoint reports configured state without exposing the API key", async () => {
  const server = createApp({ dataDir, geminiApiKey: "secret-test-key" });
  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/assistant/status`);
  assert.equal(response.status, 200);
  const result = await response.text();
  assert.deepEqual(JSON.parse(result), { configured: true });
  assert.doesNotMatch(result, /secret-test-key/);
});
