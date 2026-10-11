const form = document.querySelector("#assistant-form");
const input = document.querySelector("#assistant-input");
const conversationElement = document.querySelector("#conversation");
const statusElement = document.querySelector("#assistant-status");
const sendButton = document.querySelector("#send-message");
const microphoneButton = document.querySelector("#voice-input");
const voiceLanguage = document.querySelector("#voice-language");
const speakReplies = document.querySelector("#speak-replies");
const history = [];
let recognition;

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
  window.speechSynthesis.speak(utterance);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || sendButton.disabled) return;

  statusElement.textContent = "";
  const pendingUserMessage = appendMessage(text, "user");
  const pendingAssistantMessage = appendMessage("Thinking…", "model", "assistant-message-pending");
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
    statusElement.textContent = error.message;
    input.value = text;
    input.focus();
  } finally {
    sendButton.disabled = false;
    input.disabled = false;
    input.focus();
  }
});

document.querySelector("#clear-chat").addEventListener("click", () => {
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
  };
  recognition.onend = () => microphoneButton.setAttribute("aria-pressed", "false");
  microphoneButton.addEventListener("click", () => {
    if (microphoneButton.getAttribute("aria-pressed") === "true") {
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
  statusElement.textContent = "Voice input is not supported here; you can still chat by typing.";
}
