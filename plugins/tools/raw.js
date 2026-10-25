import { Module } from "../../lib/plugins.js"; // adjust path
import { manager } from "../../lib/manager.js"; // adjust path

const TEXT_LIMIT = 3000; // longer than this is sent as a file

const replacer = (_, v) => {
  if (v?.type === "Buffer" && Array.isArray(v.data))
    return `<Buffer ${v.data.length}b>`;
  if (typeof v === "bigint") return v.toString();
  if (
    v?.low !== undefined &&
    v?.high !== undefined &&
    v?.unsigned !== undefined
  )
    return Number(v.low);
  return v;
};

function getQuotedRaw(msg) {
  if (msg.quoted?.raw) return msg.quoted.raw;
  if (msg.quoted?.message) return msg.quoted;

  const m = msg.raw?.message ?? msg.message ?? {};
  const inner =
    m.ephemeralMessage?.message ??
    m.viewOnceMessage?.message ??
    m.viewOnceMessageV2?.message ??
    m.documentWithCaptionMessage?.message ??
    m;

  const type = Object.keys(inner).find(
    (k) => inner[k]?.contextInfo?.quotedMessage,
  );
  if (!type) return null;

  const ctx = inner[type].contextInfo;
  return {
    key: {
      remoteJid: msg.from ?? msg.key?.remoteJid,
      id: ctx.stanzaId,
      participant: ctx.participant,
    },
    message: ctx.quotedMessage,
  };
}

Module({
  command: "raw",
  aliases: ["getraw"],
  name: "raw",
  description: "Show raw JSON of a replied message (sent as a file if long)",
  package: "owner",
})(async (msg) => {
  if (!msg.isFromMe) return;

  const quoted = getQuotedRaw(msg);
  if (!quoted) return msg.reply?.("❌ Reply to a message with this command");

  const json = JSON.stringify(quoted, replacer, 2);

  // Short → normal text
  if (json.length <= TEXT_LIMIT) {
    return msg.reply?.("```" + json + "```");
  }

  // Long → JSON file
  const sock = msg.conn;
  const jid = msg.from ?? msg.key?.remoteJid;
  if (!sock || !jid) return msg.reply?.("❌ Could not find sock or jid");

  const id = quoted.key?.id?.slice(0, 8) ?? Date.now();
  await sock.sendMessage(
    jid,
    {
      document: Buffer.from(json, "utf8"),
      mimetype: "application/json",
      fileName: `raw_${id}.json`,
      caption: `📄 Raw message (${json.length} chars)`,
    },
    { quoted: msg.raw ?? msg },
  );
});
