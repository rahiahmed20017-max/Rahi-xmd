// plugins/antisticker.js
import { Module } from "../../lib/plugins.js";
import { db } from "../../lib/client.js";
import { getTheme } from "../../Themes/themes.js";
const theme = getTheme();
const DEBUG = false;
const debug = (...args) => DEBUG && console.debug("[antisticker]", ...args);

// Helper to form DB keys (so we don't mix group/session)
function enabledKeyFor(groupJid) {
  return `antisticker:${groupJid}:enabled`;
}
function modeKeyFor(groupJid) {
  return `antisticker:${groupJid}:mode`;
}

// ---------- Command handler ----------
Module({
  command: "antisticker",
  package: "group",
  description:
    "Enable/disable anti-sticker for this group or set mode (kick/null/warn). Default mode: kick",
})(async (message, match) => {
  try {
    if (!message.isGroup) return message.send(theme.isGroup);
    await message.loadGroupInfo?.();
    if (!message.isAdmin && !message.isfromMe)
      return message.send(theme.isAdmin);

    const botNumber = message.botnum;
    const groupJid = message.from;
    const raw = (match || "").trim().toLowerCase();

    const enabledKey = enabledKeyFor(groupJid);
    const modeKey = modeKeyFor(groupJid);

    // Show status
    if (!raw) {
      const isEnabled = db.get(botNumber, enabledKey, false) === true;
      const mode = String(
        db.get(botNumber, modeKey, "kick") || "kick",
      ).toLowerCase();
      return message.send(
        `⚙️ AntiSticker for this group\n• Status: ${
          isEnabled ? "✅ ON" : "❌ OFF"
        }\n• Mode: ${mode.toUpperCase()}\n\nUsage:\n• .antisticker on\n• .antisticker off\n• .antisticker kick\n• .antisticker null\n• .antisticker warn`,
      );
    }

    // ON
    if (raw === "on") {
      const already = db.get(botNumber, enabledKey, false) === true;
      if (already)
        return message.send(`ℹ️ AntiSticker is already *ON* for this group.`);
      db.setHot(botNumber, enabledKey, true);
      let hasMode = db.get(botNumber, modeKey, null);
      if (hasMode === null || typeof hasMode === "undefined") {
        hasMode = "kick";
        db.setHot(botNumber, modeKey, hasMode);
      }
      return message.send(
        `✅ AntiSticker has been *ENABLED* for this group. Default action: *${hasMode.toUpperCase()}*`,
      );
    }

    // OFF
    if (raw === "off") {
      const currently = db.get(botNumber, enabledKey, false) === true;
      if (!currently)
        return message.send("ℹ️ AntiSticker is already *OFF* for this group.");
      db.setHot(botNumber, enabledKey, false);
      return message.send("✅ AntiSticker has been *DISABLED* for this group.");
    }

    // Set mode
    if (
      raw === "kick" ||
      raw === "null" ||
      raw === "warn" ||
      raw === "remove"
    ) {
      const normalized = raw === "remove" ? "kick" : raw; // 'remove' -> 'kick' behavior
      db.setHot(botNumber, modeKey, normalized);
      // if mode is set but feature is off, enable it automatically (convenience)
      const isEnabled = db.get(botNumber, enabledKey, false) === true;
      if (!isEnabled) {
        db.setHot(botNumber, enabledKey, true);
        return message.send(
          `✅ AntiSticker mode set to *${normalized.toUpperCase()}* and AntiSticker has been automatically *ENABLED* for this group.`,
        );
      }
      return message.send(
        `✅ AntiSticker mode updated to *${normalized.toUpperCase()}* for this group.`,
      );
    }

    // unknown arg
    return message.send(
      "Usage:\n.antisticker on\n.antisticker off\n.antisticker kick\n.antisticker null\n.antisticker warn",
    );
  } catch (err) {
    console.error("[antisticker][command] error", err);
    return message.send("❌ An error occurred while processing the command.");
  }
});

// ---------- Enforcement handler ----------
Module({
  on: "text", // matches antilink's convention — the plugin loader dispatches
  package: "group", // every inbound message here, so type-checking is done manually below
  description: "Enforce anti-sticker policy in groups",
})(async (message) => {
  try {
    if (!message || !message.isGroup) return;

    // Sticker check replaces antilink's body/regex check
    if (!message || message.type !== "stickerMessage") return;

    const botNumber = message.botnum;
    const groupJid = message.from;

    const enabledKey = enabledKeyFor(groupJid);
    const modeKey = modeKeyFor(groupJid);

    // Strict boolean check: require enabled === true
    const enabled = (() => {
      try {
        return db.get(botNumber, enabledKey, false) === true;
      } catch (e) {
        console.error("[antisticker] db.get failed", e);
        return false;
      }
    })();

    if (!enabled) return; // feature disabled -> do nothing

    // check roles & protections
    try {
      await message.loadGroupInfo?.();
    } catch (e) {
      debug("loadGroupInfo failed", e?.message || e);
    }

    const botIsAdmin = !!message.isBotAdmin;
    const senderIsAdmin = !!message.isAdmin;
    const senderIsOwnerOrFromMe = !!(message.isFromMe || message.isfromMe);

    if (!botIsAdmin) {
      debug("bot not admin -> cannot enforce");
      return;
    }
    if (senderIsAdmin || senderIsOwnerOrFromMe) {
      debug("sender is admin/owner/bot -> ignoring");
      return;
    }

    debug("sticker detected from", message.sender);

    // determine mode
    let mode = "kick";
    try {
      mode = String(db.get(botNumber, modeKey, "kick") || "kick").toLowerCase();
    } catch (e) {
      debug("error reading mode, defaulting to kick", e?.message || e);
      mode = "kick";
    }
    debug("mode=", mode);

    // attempt to delete the offending message (best-effort)
    try {
      if (typeof message.send === "function") {
        await message
          .send({ delete: message.key })
          .catch((err) =>
            debug("delete via message.send failed", err?.message || err),
          );
      } else if (
        message.conn &&
        typeof message.conn.sendMessage === "function"
      ) {
        await message.conn
          .sendMessage(message.from, { delete: message.key })
          .catch((err) =>
            debug("delete via conn.sendMessage failed", err?.message || err),
          );
      } else {
        debug("no message delete API available");
      }
    } catch (e) {
      debug("delete attempt threw", e?.message || e);
    }

    // message.sender is already normalized (safeJid) by serialize.js,
    // same as antilink — the single correct source here.
    const senderJid = message.sender || null;
    const senderNum = senderJid ? String(senderJid).split("@")[0] : "unknown";

    // Null / remove_sticker: notify only
    if (mode === "null" || mode === "remove_sticker") {
      try {
        await message.send?.(`⚠️ Sticker removed from @${senderNum}`, {
          mentions: senderJid ? [senderJid] : [],
        });
        debug("notified group about removal (mode=null)");
      } catch (e) {
        debug("notify failed", e?.message || e);
      }
      return;
    }

    if (mode === "warn") {
      try {
        await message.send?.(
          `⚠️ @${senderNum}, posting stickers is not allowed here. This is a warning.`,
          { mentions: senderJid ? [senderJid] : [] },
        );
        debug("warned user", senderNum);
      } catch (e) {
        debug("warn failed", e?.message || e);
      }
      return;
    }

    // kick/remove
    if (mode === "kick" || mode === "remove") {
      try {
        await message.send?.(
          `🚫 @${senderNum} posted a prohibited sticker and will be removed from the group.`,
          { mentions: senderJid ? [senderJid] : [] },
        );
      } catch (e) {
        debug("notice failed", e?.message || e);
      }

      // short delay so the notice is delivered before removal
      await new Promise((r) => setTimeout(r, 600));

      try {
        if (typeof message.removeParticipant === "function") {
          await message.removeParticipant([senderJid]);
          debug("removeParticipant succeeded for", senderJid);
        } else if (
          message.conn &&
          typeof message.conn.groupParticipantsUpdate === "function"
        ) {
          await message.conn.groupParticipantsUpdate(
            message.from,
            [senderJid],
            "remove",
          );
          debug("groupParticipantsUpdate succeeded for", senderJid);
        } else {
          throw new Error("no supported remove function");
        }
      } catch (err) {
        console.error("[antisticker] failed to remove participant", err);
        try {
          await message.send?.(
            `❌ Failed to remove @${senderNum}. Please remove them manually.`,
            { mentions: senderJid ? [senderJid] : [] },
          );
        } catch (e) {
          debug("notify admin manual removal failed", e?.message || e);
        }
      }
      return;
    }

    debug("unknown mode (no action)", mode);
  } catch (error) {
    console.error("[antisticker] enforcement error:", error);
  }
});
