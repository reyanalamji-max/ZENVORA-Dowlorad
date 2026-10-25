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
  assert.match(homeHtml, /class="home-ai-card" href="\/assistant"/);
  assert.match(homeHtml, /Ask to AI/);
  assert.match(homeHtml, /id="apps-launcher"[^>]*role="dialog"/);
  assert.match(homeHtml, /href="https:\/\/chatgpt\.com\/"[^>]*>[\s\S]*?ChatGPT/);
  assert.match(homeHtml, /id="ai-welcome-popover"[^>]*hidden/);
  assert.match(homeHtml, /class="search-submit-button"/);
  assert.doesNotMatch(homeHtml, /class="assistant-promo"/);
  const homeScript = await (await fetch(`${baseUrl}/app.js`)).text();
  assert.match(homeScript, /appsLauncherButton\.addEventListener/);
  assert.match(homeScript, /\/assistant\?q=/);
  const homeStyles = await (await fetch(`${baseUrl}/styles.css`)).text();
  assert.match(homeStyles, /\.home-ai-card:hover/);
  assert.match(homeStyles, /@keyframes petal-fall/);
  const assistantPage = await fetch(`${baseUrl}/assistant`);
  assert.equal(assistantPage.status, 200);
  assert.match(await assistantPage.text(), /Start voice conversation/);
  const assistantScript = await (await fetch(`${baseUrl}/assistant.js`)).text();
  assert.match(assistantScript, /recognition\.continuous = false/);
  assert.match(assistantScript, /startListeningAgain/);
  assert.match(assistantScript, /speechSynthesis\.speak/);
  assert.match(assistantScript, /\/api\/assistant\/status/);
  assert.match(assistantScript, /\/api\/assistant\/image/);
  assert.match(assistantScript, /appendGeneratedImage/);
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

test("AI modes and selected Gemini models reach the provider through a validated request", async () => {
  let providerUrl;
  let providerOptions;
  const server = createApp({
    dataDir,
    geminiApiKey: "test-gemini-key",
    fetchImpl: async (url, options) => {
      providerUrl = url;
      providerOptions = options;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "<!doctype html><title>Example</title>" }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({
      mode: "website",
      model: "gemini-2.5-flash",
      messages: [{ role: "user", text: "Build a landing page." }]
    })
  });

  assert.equal(response.status, 200);
  assert.equal(providerUrl, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
  assert.match(JSON.parse(providerOptions.body).systemInstruction.parts[0].text, /complete, runnable HTML\/CSS\/JavaScript/);

  const invalidMode = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({
      mode: "untrusted-mode",
      messages: [{ role: "user", text: "Hello" }]
    })
  });
  assert.equal(invalidMode.status, 400);
});

test("image generation proxies Gemini and returns only validated image data", async () => {
  let providerUrl;
  let providerOptions;
  const server = createApp({
    dataDir,
    geminiApiKey: "test-gemini-key",
    fetchImpl: async (url, options) => {
      providerUrl = url;
      providerOptions = options;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [
          { text: "Generated." },
          { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } }
        ] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const baseUrl = await listen(server);
  const response = await fetch(`${baseUrl}/api/assistant/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ prompt: "A small blue bird on a branch" })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { imageData: "aGVsbG8=", mimeType: "image/png" });
  assert.equal(providerUrl, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent");
  assert.equal(providerOptions.headers["x-goog-api-key"], "test-gemini-key");
  assert.deepEqual(JSON.parse(providerOptions.body).generationConfig.responseModalities, ["TEXT", "IMAGE"]);

  const invalidOrigin = await fetch(`${baseUrl}/api/assistant/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ prompt: "A harmless image" })
  });
  assert.equal(invalidOrigin.status, 403);
});

test("image generation explains temporary rate limits and exhausted project quotas separately", async () => {
  const cases = [
    [
      { error: { status: "RATE_LIMIT_EXCEEDED", message: "Requests per minute exceeded" } },
      /temporarily rate-limited/
    ],
    [
      { error: { status: "RESOURCE_EXHAUSTED", message: "Daily quota exceeded" } },
      /quota for this project is exhausted or unavailable/
    ]
  ];

  for (const [providerError, expectedMessage] of cases) {
    const server = createApp({
      dataDir,
      geminiApiKey: "test-gemini-key",
      fetchImpl: async () => new Response(JSON.stringify(providerError), {
        status: 429,
        headers: { "Content-Type": "application/json" }
      })
    });
    const baseUrl = await listen(server);
    const response = await fetch(`${baseUrl}/api/assistant/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ prompt: "A small blue bird" })
    });

    assert.equal(response.status, 502);
    assert.match((await response.json()).error, expectedMessage);
  }
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

  const imageResponse = await fetch(`${baseUrl}/api/assistant/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ prompt: "A small blue bird" })
  });
  assert.equal(imageResponse.status, 503);
  assert.match((await imageResponse.json()).error, /Image generation is not configured/);
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
