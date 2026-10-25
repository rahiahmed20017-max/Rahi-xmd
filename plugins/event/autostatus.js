import { Module } from "../../lib/plugins.js";

const EMOJIS = ["❤️", "🔥", "💯", "😍", "👀"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// autostatus_seen + autostatus_react
Module({ on: "status", name: "autostatus" })(async (ctx) => {
  const { db, toBool, sessionId, sock, data: msg } = ctx;

  if (toBool(db.get(sessionId, "autostatus_seen", false)))
    sock.readMessages([msg.key]).catch(() => {});

  if (toBool(db.get(sessionId, "autostatus_react", false)))
    sock
      .sendMessage(msg.from, { react: { text: pick(EMOJIS), key: msg.key } })
      .catch(() => {});
});
