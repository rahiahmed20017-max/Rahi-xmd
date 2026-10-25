import { Module } from "../../lib/plugins.js";
import config from "../../config.js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { getTheme } from "../../Themes/themes.js";
import { db } from "../../lib/client.js";
const theme = getTheme();
const presenceTimers = new Map();

// Safety net: values are saved as boolean true/false,
// but old string values ("true", "on", ...) still read correctly.
const toBool = (v) =>
  v === true ||
  v === 1 ||
  ["true", "on", "yes", "1", "enable", "enabled", "public"].includes(
    String(v).toLowerCase(),
  );

// MUST be the same id client.js uses (client.js sets sock.sessionId)
function resolveSessionId(message) {
  const conn = message?.conn;
  if (conn?.sessionId) return String(conn.sessionId);
  if (conn?.user?.id) return String(jidNormalizedUser(conn.user.id));
  return null;
}

function getLegacySessionId(message) {
  try {
    return message?.conn?.user?.id
      ? String(jidNormalizedUser(message.conn.user.id))
      : null;
  } catch {
    return null;
  }
}

function getSetting(message, key, defaultValue = undefined) {
  const sessionId = resolveSessionId(message);
  if (!sessionId) return defaultValue;
  const value = db.get(sessionId, key, undefined);
  if (value !== undefined) return value;
  const legacyId = getLegacySessionId(message);
  return legacyId && legacyId !== sessionId
    ? db.get(legacyId, key, defaultValue)
    : defaultValue;
}

// 🔹 Auto Status Seen
Module({
  command: "autostatus",
  package: "owner",
  description: "Toggle auto view WhatsApp status",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "autostatus_seen";

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *Auto status view is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating auto status view*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `⚙️ *Auto Status View*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autostatus on\n• autostatus off`,
  );
});

// 🔹 Auto Status React
Module({
  command: "autostatusreact",
  package: "owner",
  description: "Toggle auto react to WhatsApp status",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "autostatus_react";

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *Auto status react is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating auto status react*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `⚙️ *Auto Status React*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autostatusreact on\n• autostatusreact off`,
  );
});

// 🔹 Auto Typing
Module({
  command: "autotyping",
  package: "owner",
  description: "Toggle auto typing in chats",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "autotyping";

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *Auto typing is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating auto typing*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `⚙️ *Auto Typing*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autotyping on\n• autotyping off`,
  );
});

// 🔹 Auto Recording
Module({
  command: "autorecord",
  package: "owner",
  description: "Toggle auto voice recording in chats",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "autorecord";

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *Auto record is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating auto record*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `🎤 *Auto Record*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autorecord on\n• autorecord off`,
  );
});

// 🔹 Auto React to Messages
Module({
  command: "autoreact",
  package: "owner",
  description: "Toggle auto react to messages",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "autoreact";

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *AutoReact is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating AutoReact*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `⚙️ *AutoReact*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autoreact on\n• autoreact off`,
  );
});

// 🔹 Anti Call
Module({
  command: "anticall",
  package: "owner",
  description: "Block users who call the bot",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "anticall";

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *AntiCall is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating AntiCall*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `⚙️ *AntiCall*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• anticall on\n• anticall off`,
  );
});

// 🔹 Auto Read
Module({
  command: "autoread",
  package: "owner",
  description: "Toggle auto read messages",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "autoread";

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *AutoRead is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating AutoRead*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `⚙️ *AutoRead*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• autoread on\n• autoread off`,
  );
});

// 🔹 Mode (true = public, false = private)
Module({
  command: "mode",
  package: "owner",
  description: "Toggle bot mode (public / private)",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const input = match?.trim().toLowerCase();
  const key = "mode";

  if (input === "public" || input === "private") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "public");
      await message.react("✅");
      return message.send(`✅ *Bot mode set to* \`${input.toUpperCase()}\``);
    } catch (err) {
      await message.react("❌");
      return message.send("❌ *Failed to update bot mode*");
    }
  }

  const isPublic = toBool(getSetting(message, key, true));

  return message.send(
    `⚙️ *Bot Mode*\n` +
      `> Status: ${isPublic ? "🌍 PUBLIC" : "🔒 PRIVATE"}\n\n` +
      `*Usage:*\n` +
      `• mode public\n` +
      `• mode private`,
  );
});

Module({
  command: "public",
  package: "owner",
  description: "Set bot mode to public",
})(async (message) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const key = "mode"; // true = public
  await message.react("⏳");

  try {
    db.setHot(sid, key, true);
    await message.react("✅");
    return message.send("✅ *Bot mode set to* `PUBLIC`");
  } catch (err) {
    await message.react("❌");
    return message.send("❌ *Failed to update bot mode*");
  }
});

Module({
  command: "private",
  package: "owner",
  description: "Set bot mode to private",
})(async (message) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);

  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const key = "mode"; // false = private
  await message.react("⏳");

  try {
    db.setHot(sid, key, false);
    await message.react("✅");
    return message.send("✅ *Bot mode set to* `PRIVATE`");
  } catch (err) {
    await message.react("❌");
    return message.send("❌ *Failed to update bot mode*");
  }
});

// 🔹 Mention
Module({
  command: "mention",
  package: "owner",
  description: "Toggle auto mention messages",
})(async (message, match) => {
  if (!message.isFromMe) return message.send(theme.isfromMe);
  const sid = resolveSessionId(message);
  if (!sid) return message.send("❌ Session not found.");

  const key = "mention";
  const input = match?.trim().toLowerCase();

  if (input === "on" || input === "off") {
    await message.react("⏳");
    try {
      db.setHot(sid, key, input === "on");
      await message.react("✅");
      return await message.send(
        `✅ *Mention is now \`${input.toUpperCase()}\`*`,
      );
    } catch (e) {
      await message.react("❌");
      return await message.send("❌ *Error updating Mention*");
    }
  }

  const status = toBool(getSetting(message, key, false));
  return await message.send(
    `⚙️ *Mention*\n> Status: ${
      status ? "✅ ON" : "❌ OFF"
    }\n\nUse:\n• mention on\n• mention off`,
  );
});

function getSessionKey(message) {
  return resolveSessionId(message);
}

function sendTemporaryPresence(message, state) {
  const conn = message?.conn;
  const jid = message?.from;
  if (typeof conn?.sendPresenceUpdate !== "function" || !jid) return;

  const key = `${message.sessionId || getSessionKey(message)}:${jid}`;
  const previous = presenceTimers.get(key);
  if (previous) clearTimeout(previous);

  Promise.resolve(conn.sendPresenceUpdate(state, jid)).catch(() => {});
  const timer = setTimeout(() => {
    presenceTimers.delete(key);
    Promise.resolve(conn.sendPresenceUpdate("paused", jid)).catch(() => {});
  }, 1_200);
  if (timer.unref) timer.unref();
  presenceTimers.set(key, timer);
}

Module({
  on: "message",
  light: true,
  name: "message-automation",
  description: "Apply enabled per-session message automations",
})(async (message) => {
  if (!message || message.isFromMe) return;
  const sessionId = getSessionKey(message);
  if (!sessionId) return;
  const settingKeys = ["autoread", "autoreact", "autotyping", "autorecord"];
  const settings = db.getMany(sessionId, settingKeys);
  const legacyId = getLegacySessionId(message);
  if (legacyId && legacyId !== sessionId) {
    const legacySettings = db.getMany(legacyId, settingKeys);
    for (const key of settingKeys) {
      if (settings[key] === undefined) settings[key] = legacySettings[key];
    }
  }

  if (toBool(settings.autoread) && message.key) {
    await message.conn.readMessages?.([message.key]).catch(() => {});
  }

  if (toBool(settings.autoreact) && message.key) {
    const reactions = ["❤️", "🔥", "✨", "👍", "😊"];
    const reaction = reactions[Math.floor(Math.random() * reactions.length)];
    await message.conn
      .sendMessage?.(message.from, {
        react: { text: reaction, key: message.key },
      })
      .catch(() => {});
  }

  if (toBool(settings.autotyping)) {
    sendTemporaryPresence(message, "composing");
  } else if (toBool(settings.autorecord)) {
    sendTemporaryPresence(message, "recording");
  }
});

Module({
  on: "status",
  light: true,
  name: "status-automation",
  description: "Apply enabled per-session status automations",
})(async (ctx) => {
  const message = ctx?.data;
  const raw = ctx?.raw;
  const sessionId = getSessionKey(message);
  if (!sessionId || !raw?.key || raw.key.fromMe) return;
  const settingKeys = ["autostatus_seen", "autostatus_react"];
  const settings = db.getMany(sessionId, settingKeys);
  const legacyId = getLegacySessionId(message);
  if (legacyId && legacyId !== sessionId) {
    const legacySettings = db.getMany(legacyId, settingKeys);
    for (const key of settingKeys) {
      if (settings[key] === undefined) settings[key] = legacySettings[key];
    }
  }

  if (toBool(settings.autostatus_seen)) {
    await message.conn.readMessages?.([raw.key]).catch(() => {});
  }

  if (toBool(settings.autostatus_react)) {
    await message.conn
      .sendMessage?.("status@broadcast", {
        react: { text: "❤️", key: raw.key },
      })
      .catch(() => {});
  }
});
