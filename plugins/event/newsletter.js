import { Module } from "../../lib/plugins.js";

const CHANNELS = [
  "120363430948099711@newsletter",  
];

const REACTIONS = [
  "❤️",
  "❤️",
  "❤️",
  "♥️",
  "🌼",
  "🫯",
  "❤️",
  "🫯",
  "💗",
  "🍒",
  "🪷",
  "💑",
  "🍫",
  "🤩",
  "🍁",
  "🌸",
  "🌺",
  "🍃",
  "🌻",
  "🏵️",
  "🍂",
  "🫀",
  "🌿",
  "🌳",
  "🌾",
  "💐",
  "🌹",
  "🦄",
  "🪽",
  "🦜",
  "🦩",
  "🪴",
  "🍓",
  "🍅",
  "🍎",
  "🫯",
  "🫯",
  "✨",
  "🇮🇳",
  "🌈",
  "🫰",
  "💜",
  "💞",
  "❤️‍🩹",
  "💕",
  "💛",
  "💚",
  "💙",
  "🩵",
  "🩷",
  "🧡",
  "🪻",
  "🦚",
  "🍇",
  "🍄",
  "❤️‍🔥",
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// auto follow on connect
Module({ on: "connected", name: "autofollow" })(async (ctx) => {
  for (const jid of CHANNELS)
    await ctx.sock.newsletterFollow(jid).catch(() => {});
});

// auto react on channel posts
Module({ on: "newsletter", name: "newsletter-react" })(async (ctx) => {
  const { data: msg, raw, sock, sessionId, logger } = ctx;
  if (!CHANNELS.includes(msg.from)) return;

  const serverId = raw.key?.server_id ?? msg.key?.server_id;
  if (!serverId)
    return logger.warn({ sessionId }, "❌ server_id missing, skip react");

  const emoji = pick(REACTIONS);
  try {
    await sock.newsletterReactMessage(msg.from, String(serverId), emoji);
    logger.info({ sessionId }, `✅ Newsletter reacted ${emoji} → ${msg.from}`);
  } catch (err) {
    logger.warn({ sessionId }, "❌ Newsletter react failed:", err?.message);
  }
});
