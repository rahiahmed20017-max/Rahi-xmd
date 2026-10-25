import { Module } from "../../lib/plugins.js";
import config from "../../config.js";
import { UnlimitedAI } from "../bin/ai.js";

// tracks each chat's UnlimitedAI sessionId so replies stay in context
const chatSessions = new Map();

async function askUnlimitedAI(jid, query, botName, ownerName) {
  const instruction =
    `You are ${botName}, a smart WhatsApp assistant created by ${ownerName}. You love anime. ` +
    `STRICT LANGUAGE RULE: You must reply in the EXACT SAME LANGUAGE the user uses. If the user types ` +
    `in English (e.g., 'Hi', 'How are you'), reply ONLY in English. Be friendly and casual.`;

  const sessionId = chatSessions.get(jid);

  const result = await UnlimitedAI({
    message: query,
    instruction,
    sessionId,
  });

  if (result.status && result.sessionId) {
    chatSessions.set(jid, result.sessionId);
  }

  return result;
}

Module({
  command: "ai",
  aliases: ["gemini", "ask"],
  package: "ai",
  description: "Ask anything to AI",
})(async (message, match) => {
  let query = (match || "").trim();

  // Quoted text fallback
  if (!query) {
    const quoted =
      message.raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    query = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
  }

  if (!query) {
    return message.send("*Type a question!*\n_Example: .ai Who is Goku?_");
  }

  try {
    await message.react("🧠");

    const thinking = await message.conn.sendMessage(
      message.from,
      { text: "_Thinking..._" },
      { quoted: message.raw },
    );

    const botName = config.BOT_NAME || "Bot";
    const ownerName = config.OWNER_NAME || "the owner";

    const result = await askUnlimitedAI(
      message.from,
      query,
      botName,
      ownerName,
    );

    if (!result.status || !result.text) {
      throw new Error(result.error || "UnlimitedAI returned no reply.");
    }

    const aiReply = String(result.text).trim();

    try {
      await message.conn.sendMessage(message.from, {
        text: aiReply,
        edit: thinking.key,
      });
    } catch {
      await message.conn.sendMessage(
        message.from,
        { text: aiReply },
        { quoted: message.raw },
      );
    }

    await message.react("✨");
  } catch (err) {
    console.error("AI ERROR:", err.message);
    await message.react("❌");
    await message.send("❌ Something went wrong, please try again later.");
  }
});

// ─── Groq alias command — now also backed by UnlimitedAI ──────────────────

Module({
  command: "groq",
  aliases: ["groqai", "chat"],
  package: "ai",
  description: "Ask anything to AI (Groq variant)",
})(async (message, match) => {
  let query = (match || "").trim();

  if (!query) {
    const quoted =
      message.raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    query = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
  }

  if (!query) {
    return message.send("*Type a question!*\n_Example: .groq Who is Goku?_");
  }

  try {
    await message.react("⚡");

    const thinking = await message.conn.sendMessage(
      message.from,
      { text: "_Thinking..._" },
      { quoted: message.raw },
    );

    const botName = config.BOT_NAME || "Bot";
    const ownerName = config.OWNER_NAME || "the owner";

    const result = await askUnlimitedAI(
      message.from,
      query,
      botName,
      ownerName,
    );

    if (!result.status || !result.text) {
      throw new Error(result.error || "UnlimitedAI returned no reply.");
    }

    const aiReply = String(result.text).trim();

    try {
      await message.conn.sendMessage(message.from, {
        text: aiReply,
        edit: thinking.key,
      });
    } catch {
      await message.conn.sendMessage(
        message.from,
        { text: aiReply },
        { quoted: message.raw },
      );
    }

    await message.react("✨");
  } catch (err) {
    console.error("GROQ ERROR:", err.message);
    await message.react("❌");
    await message.send("❌ Something went wrong, please try again later.");
  }
});
