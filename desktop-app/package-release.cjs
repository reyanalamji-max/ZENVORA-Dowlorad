const { build } = require("electron-builder");

if (!process.env.CSC_LINK || !Object.hasOwn(process.env, "CSC_KEY_PASSWORD")) {
  console.error("A Windows code-signing certificate is required. Set CSC_LINK and CSC_KEY_PASSWORD before creating a release build.");
  process.exitCode = 1;
} else {
  build({
    win: ["nsis"],
    config: {
      forceCodeSigning: true
    }
  }).catch((error) => {
    console.error("Failed to create the signed Windows release installer:", error);
    process.exitCode = 1;
  });
}
