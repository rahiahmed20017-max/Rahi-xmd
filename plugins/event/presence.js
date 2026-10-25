import { Module } from "../../lib/plugins.js";

// autotyping + autorecord (typing has priority, same as before)
Module({ on: "message", name: "presence" })(async (msg, ctx) => {
  const { db, toBool, sessionId, sock } = ctx;
  if (toBool(db.get(sessionId, "autotyping", false)))
    await sock.sendPresenceUpdate("composing", msg.from).catch(() => {});
  else if (toBool(db.get(sessionId, "autorecord", false)))
    await sock.sendPresenceUpdate("recording", msg.from).catch(() => {});
});
