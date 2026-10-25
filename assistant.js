const form = document.querySelector("#assistant-form");
const input = document.querySelector("#assistant-input");
const conversationElement = document.querySelector("#conversation");
const statusElement = document.querySelector("#assistant-status");
const sendButton = document.querySelector("#send-message");
const microphoneButton = document.querySelector("#voice-input");
const voiceLanguage = document.querySelector("#voice-language");
const speakReplies = document.querySelector("#speak-replies");
const voiceModeButton = document.querySelector("#voice-mode");
const voiceModeLabel = document.querySelector("#voice-mode-label");
const modelSelect = document.querySelector("#model-select");
const history = [];
const recentPrompts = [];
const modePlaceholders = {
  chat: "Ask ZENVORA AI to research, write, explain, or create…",
  research: "What would you like ZENVORA AI to research?",
  canvas: "Describe what you want to plan or create…",
  image: "Describe the image you want to generate (up to 2,000 characters)…",
  live: "Type a message or start a voice conversation…",
  code: "Describe the code you want to create or fix…",
  website: "Describe the website you want to build…",
  docs: "What document would you like ZENVORA AI to draft?"
};
let activeMode = "chat";
let recognition;
let voiceModeActive = false;
let requestPending = false;
let assistantSpeaking = false;
let restartRecognitionTimer;

const assistantParams = new URLSearchParams(window.location.search);
const initialPrompt = assistantParams.get("q");
if (initialPrompt) {
  input.value = initialPrompt.slice(0, 4000);
  input.focus();
}

fetch("/api/assistant/status")
  .then(async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not check AI service status.");
    if (!result.configured) {
      statusElement.textContent = "AI chat is not configured on this server. The site owner must add GEMINI_API_KEY in Render environment settings and redeploy.";
    }
  })
  .catch((error) => {
    console.error("Could not check AI service status.", error);
    statusElement.textContent = "Could not check the AI service. Please try again later.";
  });

function appendMessage(text, role, extraClass = "") {
  const message = document.createElement("p");
  const classNames = ["assistant-message"];
  if (role === "user") {
    classNames.push("assistant-message-user");
  }
  if (extraClass) {
    classNames.push(extraClass);
    if (role === "model" && !extraClass.includes("assistant-message-pending")) {
      classNames.push("assistant-rgb-flow");
    }
  } else if (role === "model") {
    classNames.push("assistant-rgb-flow");
  }
  message.className = classNames.join(" ");
  message.textContent = text;
  conversationElement.append(message);
  conversationElement.scrollTop = conversationElement.scrollHeight;
  return message;
}

function setMode(mode) {
  if (!Object.hasOwn(modePlaceholders, mode)) return;
  activeMode = mode;
  input.placeholder = modePlaceholders[mode];
  input.maxLength = mode === "image" ? 2000 : 4000;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-active", selected && button.classList.contains("assistant-nav-item"));
    button.setAttribute("aria-pressed", String(selected));
  });
  if (mode === "live") {
    if (recognition && !voiceModeActive) {
      voiceModeButton.click();
    } else if (!recognition) {
      statusElement.textContent = "Live voice is not supported in this browser; you can still type below.";
      input.focus();
    }
  } else {
    statusElement.textContent = mode === "image"
      ? "Describe an image, then select Send to generate it."
      : `${mode[0].toUpperCase()}${mode.slice(1)} mode is ready.`;
    input.focus();
  }
}

function appendGeneratedImage(imageData, mimeType, prompt) {
  const figure = document.createElement("figure");
  figure.className = "assistant-generated-image";
  const image = document.createElement("img");
  image.src = `data:${mimeType};base64,${imageData}`;
  image.alt = `Generated image: ${prompt}`;
  const download = document.createElement("a");
  download.href = image.src;
  download.download = "zenvora-generated-image.png";
  download.textContent = "Download image";
  figure.append(image, download);
  conversationElement.append(figure);
  conversationElement.scrollTop = conversationElement.scrollHeight;
}

function renderRecentPrompts() {
  if (!recentPrompts.length) return;
  const recentList = document.querySelector(".assistant-recent-list");
  recentList.replaceChildren(...recentPrompts.slice(0, 3).map((prompt) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.dataset.prompt = prompt;
    item.append(button);
    return item;
  }));
}

function speak(text) {
  if (!speakReplies.checked || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voiceLanguage.value;
  utterance.onstart = () => { assistantSpeaking = true; };
  utterance.onend = () => {
    assistantSpeaking = false;
    startListeningAgain();
  };
  utterance.onerror = () => {
    assistantSpeaking = false;
    startListeningAgain();
  };
  assistantSpeaking = true;
  window.speechSynthesis.speak(utterance);
  return true;
}

function startListeningAgain() {
  if (!voiceModeActive || requestPending || assistantSpeaking || !recognition) return;
  clearTimeout(restartRecognitionTimer);
  restartRecognitionTimer = setTimeout(() => {
    if (!voiceModeActive || requestPending || assistantSpeaking) return;
    try {
      recognition.start();
      voiceModeButton.setAttribute("aria-pressed", "true");
      voiceModeLabel.textContent = "Listening… (tap to stop)";
      statusElement.textContent = "Listening. Speak when you’re ready.";
    } catch (error) {
      console.error("Could not resume voice listening.", error);
      statusElement.textContent = "Voice listening could not restart. Tap the button to try again.";
    }
  }, 350);
}

function stopVoiceMode() {
  voiceModeActive = false;
  assistantSpeaking = false;
  clearTimeout(restartRecognitionTimer);
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      if (error.name !== "InvalidStateError") console.error("Could not stop voice listening.", error);
    }
  }
  voiceModeButton.setAttribute("aria-pressed", "false");
  voiceModeLabel.textContent = "Start voice conversation";
  statusElement.textContent = "Voice conversation stopped.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || sendButton.disabled) return;

  const requestMode = activeMode;
  const requestModel = modelSelect.value;
  statusElement.textContent = "";
  const pendingUserMessage = appendMessage(text, "user");
  const pendingAssistantMessage = appendMessage("Thinking…", "model", "assistant-message-pending");
  requestPending = true;
  if (recognition && voiceModeActive) recognition.stop();
  sendButton.disabled = true;
  input.disabled = true;

  try {
    const isImageRequest = requestMode === "image";
    const response = await fetch(isImageRequest ? "/api/assistant/image" : "/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isImageRequest
        ? { prompt: text }
        : {
          messages: [...history, { role: "user", text }],
          mode: requestMode,
          model: requestModel
        })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The AI request failed.");
    if (isImageRequest) {
      if (typeof result.imageData !== "string" || !result.imageData
        || typeof result.mimeType !== "string" || !/^image\/(?:png|jpeg|webp)$/.test(result.mimeType)) {
        throw new Error("The image service returned no usable image.");
      }
      pendingUserMessage.classList.remove("assistant-message-pending");
      pendingAssistantMessage.remove();
      appendGeneratedImage(result.imageData, result.mimeType, text);
      history.push(
        { role: "user", text: `Generate an image: ${text}` },
        { role: "model", text: "Generated an image from the prompt." }
      );
      if (history.length > 12) history.splice(0, history.length - 12);
      recentPrompts.unshift(text);
      renderRecentPrompts();
      input.value = "";
    } else if (typeof result.answer !== "string" || !result.answer.trim()) {
      throw new Error("The AI service returned no answer.");
    } else {
      pendingUserMessage.classList.remove("assistant-message-pending");
      pendingAssistantMessage.classList.remove("assistant-message-pending");
      pendingAssistantMessage.textContent = result.answer;
      history.push({ role: "user", text }, { role: "model", text: result.answer });
      if (history.length > 12) history.splice(0, history.length - 12);
      recentPrompts.unshift(text);
      renderRecentPrompts();
      input.value = "";
      speak(result.answer);
    }
  } catch (error) {
    pendingUserMessage.remove();
    pendingAssistantMessage.remove();
    statusElement.textContent = error.message === "AI chat is temporarily unavailable."
      ? "AI chat is not configured on this server. The site owner must add GEMINI_API_KEY in Render environment settings and redeploy."
      : error.message;
    input.value = text;
    input.focus();
  } finally {
    requestPending = false;
    sendButton.disabled = false;
    input.disabled = false;
    if (!voiceModeActive) input.focus();
    if (voiceModeActive && !assistantSpeaking) startListeningAgain();
  }
});

voiceModeButton.addEventListener("click", () => {
  if (!recognition) return;
  if (voiceModeActive) {
    stopVoiceMode();
    return;
  }
  voiceModeActive = true;
  statusElement.textContent = "Starting microphone…";
  voiceModeLabel.textContent = "Starting voice conversation…";
  recognition.lang = voiceLanguage.value;
  try {
    recognition.start();
    voiceModeButton.setAttribute("aria-pressed", "true");
    voiceModeLabel.textContent = "Listening… (tap to stop)";
    statusElement.textContent = "Listening. Speak when you’re ready.";
  } catch (error) {
    console.error("Could not start voice conversation.", error);
    voiceModeActive = false;
    voiceModeButton.setAttribute("aria-pressed", "false");
    voiceModeLabel.textContent = "Start voice conversation";
    statusElement.textContent = "Microphone could not start. Check browser permissions and try again.";
  }
});

document.querySelector("#clear-chat").addEventListener("click", () => {
  if (voiceModeActive) stopVoiceMode();
  history.length = 0;
  conversationElement.replaceChildren();
  input.value = "";
  const welcome = document.createElement("p");
  welcome.className = "assistant-welcome";
  welcome.textContent = "Hi! What would you like to talk about?";
  conversationElement.append(welcome);
  statusElement.textContent = "";
  window.speechSynthesis?.cancel();
  setMode("chat");
  input.focus();
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.addEventListener("click", (event) => {
  const promptButton = event.target.closest("[data-prompt]");
  if (!promptButton) return;
  input.value = promptButton.dataset.prompt;
  input.focus();
});

document.querySelector("#share-chat").addEventListener("click", async () => {
  const transcript = [...conversationElement.querySelectorAll(".assistant-message")]
    .map((message) => message.textContent.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!transcript) {
    statusElement.textContent = "Start a conversation before sharing it.";
    return;
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: "ZENVORA AI conversation", text: transcript });
    } else {
      await navigator.clipboard.writeText(transcript);
      statusElement.textContent = "Conversation copied to clipboard.";
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Could not share the AI conversation.", error);
      statusElement.textContent = "Could not share this conversation. Check browser sharing or clipboard permissions.";
    }
  }
});

document.querySelector("#show-history").addEventListener("click", () => {
  conversationElement.scrollTo({ top: 0, behavior: "smooth" });
  statusElement.textContent = history.length
    ? "Showing this conversation from the current session."
    : "There are no messages in this conversation yet.";
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onstart = () => {
    microphoneButton.setAttribute("aria-pressed", "true");
    if (voiceModeActive) {
      voiceModeButton.setAttribute("aria-pressed", "true");
      voiceModeLabel.textContent = "Listening… (tap to stop)";
      statusElement.textContent = "Listening. Speak when you’re ready.";
    }
  };
  recognition.onresult = (event) => {
    input.value = event.results[0][0].transcript;
    statusElement.textContent = "";
    form.requestSubmit();
  };
  recognition.onerror = (event) => {
    const errorMessages = {
      "not-allowed": "Microphone access was denied. Allow microphone access for ZENVORA in your browser or Windows privacy settings, then try again.",
      "service-not-allowed": "The speech recognition service is unavailable. Check your internet connection and try again.",
      "audio-capture": "No microphone was detected. Connect or enable a microphone, then try again.",
      network: "Voice recognition could not connect. Check your internet connection and try again.",
      "no-speech": "No speech was detected. Check your microphone and try again."
    };
    statusElement.textContent = errorMessages[event.error]
      || "Voice input could not start. Check your microphone and internet connection, or type your message instead.";
    microphoneButton.setAttribute("aria-pressed", "false");
    if (["not-allowed", "service-not-allowed", "audio-capture", "network"].includes(event.error)) stopVoiceMode();
  };
  recognition.onend = () => {
    microphoneButton.setAttribute("aria-pressed", "false");
    if (voiceModeActive && !requestPending && !assistantSpeaking) startListeningAgain();
  };
  microphoneButton.addEventListener("click", () => {
    if (voiceModeActive) {
      stopVoiceMode();
    } else if (microphoneButton.getAttribute("aria-pressed") === "true") {
      recognition.stop();
      microphoneButton.setAttribute("aria-pressed", "false");
      return;
    }
    recognition.lang = voiceLanguage.value;
    statusElement.textContent = "";
    try {
      recognition.start();
      microphoneButton.setAttribute("aria-pressed", "true");
    } catch {
      statusElement.textContent = "Voice input is busy. Please try again in a moment.";
    }
  });
} else {
  microphoneButton.disabled = true;
  microphoneButton.title = "Voice input is not supported in this browser.";
  voiceModeButton.disabled = true;
  voiceModeButton.title = "Voice conversation is not supported in this browser.";
  statusElement.textContent = "Voice input is not supported here; you can still chat by typing.";
}
