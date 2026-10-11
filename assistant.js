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
const history = [];
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
  message.className = `assistant-message${role === "user" ? " assistant-message-user" : ""}${extraClass ? ` ${extraClass}` : ""}`;
  message.textContent = text;
  conversationElement.append(message);
  conversationElement.scrollTop = conversationElement.scrollHeight;
  return message;
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

  statusElement.textContent = "";
  const pendingUserMessage = appendMessage(text, "user");
  const pendingAssistantMessage = appendMessage("Thinking…", "model", "assistant-message-pending");
  requestPending = true;
  if (recognition && voiceModeActive) recognition.stop();
  sendButton.disabled = true;
  input.disabled = true;

  try {
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [...history, { role: "user", text }] })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The AI request failed.");
    if (typeof result.answer !== "string" || !result.answer.trim()) {
      throw new Error("The AI service returned no answer.");
    }
    pendingUserMessage.classList.remove("assistant-message-pending");
    pendingAssistantMessage.classList.remove("assistant-message-pending");
    pendingAssistantMessage.textContent = result.answer;
    history.push({ role: "user", text }, { role: "model", text: result.answer });
    if (history.length > 12) history.splice(0, history.length - 12);
    input.value = "";
    speak(result.answer);
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
  const welcome = document.createElement("p");
  welcome.className = "assistant-welcome";
  welcome.textContent = "Hi! What would you like to talk about?";
  conversationElement.append(welcome);
  statusElement.textContent = "";
  window.speechSynthesis?.cancel();
  input.focus();
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
    statusElement.textContent = event.error === "not-allowed"
      ? "Allow microphone access in your browser to use voice chat."
      : "Voice input could not be started. You can type your message instead.";
    microphoneButton.setAttribute("aria-pressed", "false");
    if (event.error === "not-allowed" || event.error === "service-not-allowed") stopVoiceMode();
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
