import { Module } from "../lib/plugins.js";

Module({ on: "call", name: "anticall" })(async (ctx) => {
  const { db, toBool, sessionId, sock, data: calls } = ctx;
  if (!sock || !toBool(db.get(sessionId, "anticall", false))) return;

  for (const call of calls) {
    if (!(call.isOffer || call.status === "offer")) continue;
    const from = call.from || call.chatId;
    sock
      .sendMessage(from, { text: "Sorry, I do not accept calls" })
      .catch(() => {});
    if (sock.rejectCall) sock.rejectCall(call.id, from).catch(() => {});
    else if (sock.updateCallStatus)
      sock.updateCallStatus(call.id, "reject").catch(() => {});
  }
});
