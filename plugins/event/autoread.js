import { Module } from "../../lib/plugins.js";

Module({ on: "message", name: "autoread" })(async (msg, ctx) => {
  if (!ctx.toBool(ctx.db.get(ctx.sessionId, "autoread", false))) return;
  await ctx.sock.readMessages([msg.key]).catch(() => {});
});
