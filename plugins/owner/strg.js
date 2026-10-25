// plugins/strg.js
import { Module, commands } from "../../lib/plugins.js";
import { db } from "../../lib/client.js";
import { getTheme } from "../../Themes/themes.js";
const theme = getTheme();

const DEBUG = true;
const debug = (...args) => DEBUG && console.debug("[strg]", ...args);

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBotNumberFromConn(conn) {
  const id = conn?.user?.id || conn?.user?.jid || conn?.user || null;
  if (!id) return "unknown";
  return String(id).split("@")[0];
}

function strgKeyFor(fileSha256) {
  return `strg:${fileSha256}`;
}

// ── Set command: .strg <cmdname> (reply to a sticker) ─────────────────────────

Module({
  command: "strg",
  package: "owner",
  aliases: ["setcmd"],
  description:
    "Bind a sticker to a command — reply to a sticker with .strg <cmdname>",
})(async (message, match) => {
  try {
    const cmdName = (match || "").trim().toLowerCase();

    if (!cmdName) {
      return message.send(
        "⚠️ Usage:\nReply to a sticker with:\n.strg <cmdname>\n\nExample:\n.strg menu",
      );
    }

    // Must be replying to a sticker
    if (!message.quoted || message.quoted.type !== "stickerMessage") {
      return message.send(
        "❌ Please *reply to a sticker* with .strg <cmdname>",
      );
    }

    // Validate the command exists (commands map already includes aliases)
    const targetPlugin = commands.get(cmdName);
    if (!targetPlugin) {
      return message.send(
        `❌ Not found this cmd: *${cmdName}*\nPlease give a correct command name.`,
      );
    }

    const fileSha256 = message.quoted.msg?.fileSha256;
    if (!fileSha256) {
      return message.send(
        "❌ Could not read sticker data (fileSha256 missing). Try another sticker.",
      );
    }

    const botNumber = getBotNumberFromConn(message.conn);
    const key = strgKeyFor(fileSha256);

    db.setHot(botNumber, key, cmdName);
    debug("saved sticker->cmd", fileSha256, "->", cmdName);

    // Confirm + resend the sticker so user can see it's registered
    try {
      await message.send(
        `✅ Successfully set!\nNow send this sticker to run: *.${cmdName}*`,
      );

      const buf = await message.quoted.download?.();
      if (buf) {
        await message.send({ sticker: buf });
      }
    } catch (e) {
      debug("confirmation send failed", e?.message || e);
    }
  } catch (err) {
    console.error("[strg][command] error", err);
    return message.send("❌ An error occurred while processing the command.");
  }
});

Module({
  command: "mikustrg",
  package: "owner",
  description:
    "Bind a sticker to a command — reply to a sticker with .strg <cmdname>",
  dontaddmenu: "true",
})(async (message, match) => {
  try {
    const cmdName = (match || "").trim().toLowerCase();

    if (!cmdName) {
      return message.send(
        "⚠️ Usage:\nReply to a sticker with:\n.strg <cmdname>\n\nExample:\n.strg menu",
      );
    }

    // Must be replying to a sticker
    if (!message.quoted || message.quoted.type !== "stickerMessage") {
      return message.send(
        "❌ Please *reply to a sticker* with .strg <cmdname>",
      );
    }

    // Validate the command exists (commands map already includes aliases)
    const targetPlugin = commands.get(cmdName);
    if (!targetPlugin) {
      return message.send(
        `❌ Not found this cmd: *${cmdName}*\nPlease give a correct command name.`,
      );
    }

    const fileSha256 = message.quoted.msg?.fileSha256;
    if (!fileSha256) {
      return message.send(
        "❌ Could not read sticker data (fileSha256 missing). Try another sticker.",
      );
    }

    // const botNumber = getBotNumberFromConn(message.conn);
    const key = strgKeyFor(fileSha256);

    db.setHot("mikuglobal", key, cmdName);
    debug("saved sticker->cmd", fileSha256, "->", cmdName);

    // Confirm + resend the sticker so user can see it's registered
    try {
      await message.send(
        `✅ Successfully set!\nNow send this sticker to run: *.${cmdName}*`,
      );

      const buf = await message.quoted.download?.();
      if (buf) {
        await message.send({ sticker: buf });
      }
    } catch (e) {
      debug("confirmation send failed", e?.message || e);
    }
  } catch (err) {
    console.error("[strg][command] error", err);
    return message.send("❌ An error occurred while processing the command.");
  }
});

// ── Trigger handler: fires on any incoming sticker ────────────────────────────

Module({
  on: "message",
  package: "general",
  description: "Run bound command when a registered sticker is sent",
})(async (message) => {
  try {
    if (!message || message.type !== "stickerMessage") return;

    const fileSha256 = message.content?.fileSha256;
    if (!fileSha256) return;

    const botNumber = getBotNumberFromConn(message.conn);
    const key = strgKeyFor(fileSha256);

    let cmdName;
    try {
      cmdName = db.get(botNumber, key, null);
    } catch (e) {
      debug("db.get failed", e?.message || e);
      return;
    }

    if (!cmdName) return; // not a registered sticker

    const plugin = commands.get(cmdName);
    if (!plugin || typeof plugin.exec !== "function") {
      debug("bound cmd no longer exists:", cmdName);
      return;
    }

    debug("sticker matched -> running cmd:", cmdName);
    await plugin.exec(message, "");
  } catch (error) {
    console.error("[strg] trigger error:", error);
  }
});

Module({
  on: "message",
  package: "general",
  description: "Run bound command when a registered sticker is sent",
})(async (message) => {
  try {
    if (!message || message.type !== "stickerMessage") return;

    const fileSha256 = message.content?.fileSha256;
    if (!fileSha256) return;

    // const botNumber = getBotNumberFromConn(message.conn);
    const key = strgKeyFor(fileSha256);

    let cmdName;
    try {
      cmdName = db.get("mikuglobal", key, null);
    } catch (e) {
      debug("db.get failed", e?.message || e);
      return;
    }

    if (!cmdName) return; // not a registered sticker

    const plugin = commands.get(cmdName);
    if (!plugin || typeof plugin.exec !== "function") {
      debug("bound cmd no longer exists:", cmdName);
      return;
    }

    debug("sticker matched -> running cmd:", cmdName);
    await plugin.exec(message, "");
  } catch (error) {
    console.error("[strg] trigger error:", error);
  }
});
