import crypto from "node:crypto";

const API = "https://app.unlimitedai.chat/api/chat";

const ua =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

function parseSetCookie(headers) {
  const result = {};
  const setCookie =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")]
        : [];
  for (const item of setCookie) {
    const first = item.split(";")[0];
    const index = first.indexOf("=");
    if (index !== -1) {
      result[first.slice(0, index).trim()] = first.slice(index + 1).trim();
    }
  }
  return result;
}

function buildCookie(deviceId, chatId, cookies = {}) {
  return Object.entries({
    NEXT_LOCALE: "en",
    u_device_id: deviceId,
    home_chat_id: chatId,
    ...cookies,
  })
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

const CHARACTERS = {
  "miku-ai": {
    name: "Miku",
    prompt: `You are Miku, a cheerful, cute, and funny virtual idol chatting with people on WhatsApp. (default fallback prompt — pass your own via "instruction")`,
  },
};

// keeps per-conversation state so sessionId can continue a chat
const sessionStore = new Map();

async function UnlimitedAI({
  message,
  instruction,
  sessionId,
  character = "miku-ai",
} = {}) {
  if (!message) {
    return { status: false, code: 400, error: "message is required" };
  }

  const char = CHARACTERS[character] || CHARACTERS["miku-ai"];
  const systemPrompt = instruction || char.prompt;

  let session = (sessionId && sessionStore.get(sessionId)) || {
    chatId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    history: [],
  };

  const createdAt = new Date().toISOString();
  const userContent =
    session.history.length === 0
      ? `${systemPrompt}\n\nUser: ${message}`
      : message;

  const userMsg = {
    id: crypto.randomUUID(),
    role: "user",
    content: userContent,
    parts: [{ type: "text", text: message }],
    createdAt,
  };

  const messages = [...session.history, userMsg];

  const body = {
    chatId: session.chatId,
    messages,
    selectedChatModel: "chat-model-reasoning",
    selectedCharacter: null,
    selectedStory: null,
    deviceId: session.deviceId,
    locale: "en",
  };

  const headers = {
    "sec-ch-ua-platform": "Android",
    "user-agent": ua,
    "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
    "content-type": "application/json",
    "sec-ch-ua-mobile": "?1",
    "x-next-intl-locale": "en",
    accept: "*/*",
    origin: "https://app.unlimitedai.chat",
    referer: "https://app.unlimitedai.chat/en",
    "accept-language": "bn-BD,bn;q=0.9,hi-IN,hi;q=0.8,en-US;q=0.7,en;q=0.6",
    cookie: buildCookie(session.deviceId, session.chatId),
    priority: "u=1, i",
  };

  const response = await fetch(API, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    return { status: false, code: response.status, error: text };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("data:")) line = line.slice(5).trim();
      if (line === "[DONE]") continue;

      try {
        const json = JSON.parse(line);
        if (json.type === "delta" && typeof json.delta === "string") {
          answer += json.delta;
        } else if (typeof json.textDelta === "string") {
          answer += json.textDelta;
        }
      } catch {}
    }
  }

  session.history = [
    ...session.history,
    userMsg,
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: answer,
      parts: [{ type: "text", text: answer }],
      createdAt: new Date().toISOString(),
    },
  ];
  sessionStore.set(session.chatId, session);

  return {
    status: true,
    code: response.status,
    character: char.name,
    model: "chat-model-reasoning",
    text: answer,
    sessionId: session.chatId,
  };
}

export default UnlimitedAI;
export { UnlimitedAI, CHARACTERS };
