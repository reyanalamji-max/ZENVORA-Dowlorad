const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  canGrantMicrophonePermission,
  getBrowserShortcut,
  getFaviconUrl,
  installInAppNavigation,
  isWebUrl
} = require("./navigation.cjs");

test("tabs use a site's web favicon and safely fall back to its origin icon", () => {
  assert.equal(
    getFaviconUrl(["data:image/png;base64,AAAA", "https://cdn.example.org/site-icon.png"], "https://example.org/page"),
    "https://cdn.example.org/site-icon.png"
  );
  assert.equal(getFaviconUrl(["data:image/png;base64,AAAA"], "https://example.org/page"), "data:image/png;base64,AAAA");
  assert.equal(getFaviconUrl([], "https://example.org/page"), "https://example.org/favicon.ico");
  assert.equal(getFaviconUrl(["file:///secret.ico"], "javascript:alert(1)"), null);
});

test("normal web links navigate in their current ZENVORA tab", () => {
  const handlers = new Map();
  const webContents = {
    on: (eventName, handler) => handlers.set(eventName, handler),
    setWindowOpenHandler: () => {}
  };

  installInAppNavigation(webContents, () => assert.fail("current-tab links must not create tabs"));
  for (const eventName of ["will-navigate", "will-redirect"]) {
    let prevented = false;
    handlers.get(eventName)({ preventDefault: () => { prevented = true; } }, "https://example.org/results");
    assert.equal(prevented, false);
  }
});

test("links that request a new window become tabs in ZENVORA", () => {
  const openedTabs = [];
  let popupHandler;
  const webContents = {
    on: () => {},
    setWindowOpenHandler: (handler) => { popupHandler = handler; }
  };

  installInAppNavigation(webContents, (url) => openedTabs.push(url));
  assert.deepEqual(popupHandler({ url: "https://example.com/results" }), { action: "deny" });
  assert.deepEqual(openedTabs, ["https://example.com/results"]);
});

test("native app stores and unsafe protocols are blocked, never launched externally", () => {
  assert.equal(isWebUrl("ms-windows-store://home"), false);
  assert.equal(isWebUrl("market://details?id=com.zenvora"), false);
  assert.equal(isWebUrl("javascript:alert(1)"), false);

  const handlers = new Map();
  let popupHandler;
  let openedTabs = 0;
  const webContents = {
    on: (eventName, handler) => handlers.set(eventName, handler),
    setWindowOpenHandler: (handler) => { popupHandler = handler; }
  };
  installInAppNavigation(webContents, () => { openedTabs += 1; });

  for (const eventName of ["will-navigate", "will-redirect"]) {
    let prevented = false;
    handlers.get(eventName)({ preventDefault: () => { prevented = true; } }, "ms-windows-store://home");
    assert.equal(prevented, true);
  }
  popupHandler({ url: "market://details?id=com.zenvora" });
  assert.equal(openedTabs, 0);
});

test("microphone permission is limited to audio from the trusted ZENVORA tab", () => {
  const trustedPage = { getURL: () => "https://zenvora-dowlorad.onrender.com/assistant" };
  const trustedOrigin = "https://zenvora-dowlorad.onrender.com";
  const audioRequest = { mediaTypes: ["audio"], isMainFrame: true };

  assert.equal(canGrantMicrophonePermission(trustedPage, "media", audioRequest, trustedOrigin, trustedOrigin), true);
  assert.equal(canGrantMicrophonePermission(trustedPage, "media", { mediaTypes: ["audio", "video"] }, trustedOrigin, trustedOrigin), false);
  assert.equal(canGrantMicrophonePermission(trustedPage, "media", audioRequest, "https://evil.example", trustedOrigin), false);
  assert.equal(canGrantMicrophonePermission(trustedPage, "media", { ...audioRequest, isMainFrame: false }, trustedOrigin, trustedOrigin), false);
  assert.equal(canGrantMicrophonePermission(trustedPage, "geolocation", audioRequest, trustedOrigin, trustedOrigin), false);
});

test("browser shortcuts support tab creation, closing, switching, and address focus", () => {
  const shortcut = (key, options = {}) => getBrowserShortcut({
    type: "keyDown",
    key,
    control: true,
    ...options
  }, "win32");

  assert.deepEqual(shortcut("t"), { action: "new-tab" });
  assert.deepEqual(shortcut("w"), { action: "close-tab" });
  assert.deepEqual(shortcut("l"), { action: "focus-address" });
  assert.deepEqual(shortcut("Tab"), { action: "cycle-tab", direction: 1 });
  assert.deepEqual(shortcut("Tab", { shift: true }), { action: "cycle-tab", direction: -1 });
  assert.deepEqual(shortcut("3"), { action: "select-tab", index: 3 });
  assert.equal(getBrowserShortcut({ type: "keyDown", key: "t", meta: true }, "win32"), null);
  assert.deepEqual(getBrowserShortcut({ type: "keyDown", key: "t", meta: true }, "darwin"), { action: "new-tab" });
});
