// plugins/welcome-goodbye.js
import { Module } from "../../lib/plugins.js";
import { db } from "../../lib/client.js";
import {
  WELCOME_TEXTS_bn,
  WELCOME_TEXTS_en,
  GOODBYE_TEXTS_bn,
  GOODBYE_TEXTS_en,
  pickRandom,
} from "../bin/text.js";
import axios from "axios";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import { getTheme } from "../../Themes/themes.js";
const theme = getTheme();

const DEFAULT_LANG = "bn"; // default language when not set for a group
const PREFIX = "."; // used only for the details/help text below

/* ---------------- helpers ---------------- */
function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string")
    return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  return Boolean(v);
}

// Pick the correct text pool for a given feature ("welcome" | "goodbye")
// and language ("bn" | "en"), falling back to bn if lang is unknown.
function getTextsFor(feature, lang) {
  const useEn = lang === "en";
  if (feature === "welcome") return useEn ? WELCOME_TEXTS_en : WELCOME_TEXTS_bn;
  return useEn ? GOODBYE_TEXTS_en : GOODBYE_TEXTS_bn;
}

function buildText(template = "", replacements = {}) {
  let text = template || "";
  const wantsPp = text.includes("&pp");
  text = text.replace(/&pp/g, "").trim();
  text = text.replace(/&mention/g, replacements.mentionText || "");
  text = text.replace(/&name/g, replacements.name || "");
  text = text.replace(/&size/g, String(replacements.size ?? ""));
  return { text, wantsPp };
}

function safeJid(jid) {
  try {
    return jid ? jidNormalizedUser(jid) : "";
  } catch {
    return "";
  }
}

function getBotNumber(conn) {
  const jid = safeJid(conn?.user?.id);
  return jid ? jid.split("@")[0] : "bot";
}

async function fetchProfileBuffer(conn, jid) {
  try {
    const getUrl =
      typeof conn.profilePictureUrl === "function"
        ? () => conn.profilePictureUrl(jid, "image").catch(() => null)
        : () => Promise.resolve(null);
    const url = await getUrl();
    if (!url) return null;
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.error(
      "[welcome-goodbye] fetchProfileBuffer error:",
      e?.message || e,
    );
    return null;
  }
}

async function sendWelcomeMsg(
  conn,
  groupJid,
  text,
  mentions = [],
  imgBuffer = null,
) {
  try {
    if (imgBuffer) {
      await conn.sendMessage(groupJid, {
        image: imgBuffer,
        caption: text,
        mentions,
      });
    } else {
      await conn.sendMessage(groupJid, { text, mentions });
    }
  } catch (err) {
    console.error(
      "[welcome-goodbye] sendWelcomeMsg primary error:",
      err?.message || err,
    );
    // fallback without mentions
    try {
      if (imgBuffer)
        await conn.sendMessage(groupJid, { image: imgBuffer, caption: text });
      else await conn.sendMessage(groupJid, { text });
    } catch (e) {
      console.error(
        "[welcome-goodbye] sendWelcomeMsg fallback error:",
        e?.message || e,
      );
    }
  }
}

// ── NEW: full details/help block shown when the bare command is used ────────
// Shows current status + language for the feature, plus the complete usage
// guide, all in one reply.
function buildDetailsText(feature, cfg, prefix = PREFIX) {
  const label = feature === "welcome" ? "Welcome" : "Goodbye";
  const status = cfg && typeof cfg === "object" ? toBool(cfg.status) : false;
  const lang =
    cfg && typeof cfg === "object" && cfg.lang ? cfg.lang : DEFAULT_LANG;

  return `╭─〔 *${label} Settings* 〕
├─ 📊 *Status:* ${status ? "✅ ON" : "❌ OFF"}
├─ 🌐 *Language:* ${lang.toUpperCase()}
╰─➤

*📝 HOW TO USE:*
> \`${prefix}${feature}\`         *- Show this panel (also turns ON)*
> \`${prefix}${feature} on\`      *- Turn ON*
> \`${prefix}${feature} off\`     *- Turn OFF*
> \`${prefix}${feature} bn\`      *- Set language to Bengali*
> \`${prefix}${feature} en\`      *- Set language to English*
> \`${prefix}${feature} status\`  *- Show current status only (no change)*

*💡 INFO*
> ℹ️ Language & ON/OFF are independent — changing one keeps the other as-is.
> ​ㅤ
> ℹ️ Default language if never set: *${DEFAULT_LANG.toUpperCase()}*
>`;
}

/* ---------------- COMMANDS (group-level on/off + language) ---------------- */
/*
  Usage (must be sent inside the group):
    .welcome           -> ENABLE welcome + reply with full details/help panel
    .welcome on        -> enable (keeps existing/default language)
    .welcome off       -> disable
    .welcome bn        -> set language to Bengali (keeps on/off as-is)
    .welcome en        -> set language to English (keeps on/off as-is)
    .welcome status     -> show current status + language only (no change)

    .goodbye (same options as above)

  Default language when nothing is set: bn (Bengali)

  DB keys used:
    group:<groupJid>:welcome  -> { status: boolean, lang: "bn" | "en" }
    group:<groupJid>:goodbye  -> { status: boolean, lang: "bn" | "en" }
  Read via db.getAsync(botNumber, key, defaultValue)
  Written via db.set(botNumber, key, value)
*/
Module({
  command: "welcome",
  package: "group",
  description:
    "Turn per-group welcome ON/OFF, or set language: .welcome on|off|bn|en (bare .welcome turns ON + shows full details)",
})(async (message, match) => {
  if (!message.isGroup) return message.send(theme.isGroup);
  await message.loadGroupInfo?.();
  if (!message.isAdmin && !message.isfromMe) return message.send(theme.isAdmin);

  const groupJid = message.from;
  const raw = (match || "").trim().toLowerCase();
  const botNumber = message.botnum;
  const key = `group:${groupJid}:welcome`;

  // CHANGED: bare ".welcome" (no args) now ENABLES welcome AND replies with
  // a full details panel (current status + language + complete usage guide)
  // instead of just reporting status like before.
  if (!raw) {
    const existing = await db.getAsync(botNumber, key, null);
    const lang =
      existing && typeof existing === "object" && existing.lang
        ? existing.lang
        : DEFAULT_LANG;
    const cfg = { status: true, lang };
    await db.set(botNumber, key, cfg);
    await message.react?.("✅");
    return await message.send(buildDetailsText("welcome", cfg));
  }

  if (raw === "on" || raw === "off") {
    const existing = await db.getAsync(botNumber, key, null);
    const lang =
      existing && typeof existing === "object" && existing.lang
        ? existing.lang
        : DEFAULT_LANG;
    const cfg = { status: raw === "on", lang };
    await db.set(botNumber, key, cfg);
    await message.react?.("✅");
    return await message.send(
      cfg.status
        ? `✅ Welcome ENABLED for this group (lang: ${lang.toUpperCase()})`
        : "❌ Welcome DISABLED for this group",
    );
  }

  if (raw === "bn" || raw === "en") {
    const existing = await db.getAsync(botNumber, key, null);
    const status =
      existing && typeof existing === "object"
        ? toBool(existing.status)
        : false;
    const cfg = { status, lang: raw };
    await db.set(botNumber, key, cfg);
    await message.react?.("✅");
    return await message.send(
      `🌐 Welcome language set to ${raw.toUpperCase()}`,
    );
  }

  // NEW: "status" keyword — read-only check, does NOT turn anything on/off.
  if (raw === "status") {
    const cfg = await db.getAsync(botNumber, key, null);
    const status = cfg && typeof cfg === "object" ? toBool(cfg.status) : false;
    const lang =
      cfg && typeof cfg === "object" && cfg.lang ? cfg.lang : DEFAULT_LANG;
    return await message.sendreply?.(
      `Welcome is ${status ? "✅ ON" : "❌ OFF"} for this group.\nLanguage: ${lang.toUpperCase()}`,
    );
  }

  return await message.send?.(
    "❌ Invalid option. Use `on`, `off`, `bn`, `en`, or `status`.",
  );
});

Module({
  command: "goodbye",
  package: "group",
  description:
    "Turn per-group goodbye ON/OFF, or set language: .goodbye on|off|bn|en (bare .goodbye turns ON + shows full details)",
})(async (message, match) => {
  if (!message.isGroup) return message.send(theme.isGroup);
  await message.loadGroupInfo?.();
  if (!message.isAdmin && !message.isfromMe) return message.send(theme.isAdmin);

  const groupJid = message.from;
  const raw = (match || "").trim().toLowerCase();
  const botNumber = message.botnum;
  const key = `group:${groupJid}:goodbye`;

  // CHANGED: bare ".goodbye" now ENABLES goodbye AND replies with the full
  // details panel, same behavior as .welcome above.
  if (!raw) {
    const existing = await db.getAsync(botNumber, key, null);
    const lang =
      existing && typeof existing === "object" && existing.lang
        ? existing.lang
        : DEFAULT_LANG;
    const cfg = { status: true, lang };
    await db.set(botNumber, key, cfg);
    await message.react?.("✅");
    return await message.send(buildDetailsText("goodbye", cfg));
  }

  if (raw === "on" || raw === "off") {
    const existing = await db.getAsync(botNumber, key, null);
    const lang =
      existing && typeof existing === "object" && existing.lang
        ? existing.lang
        : DEFAULT_LANG;
    const cfg = { status: raw === "on", lang };
    await db.set(botNumber, key, cfg);
    await message.react?.("✅");
    return await message.send(
      cfg.status
        ? `✅ Goodbye ENABLED for this group (lang: ${lang.toUpperCase()})`
        : "❌ Goodbye DISABLED for this group",
    );
  }

  if (raw === "bn" || raw === "en") {
    const existing = await db.getAsync(botNumber, key, null);
    const status =
      existing && typeof existing === "object"
        ? toBool(existing.status)
        : false;
    const cfg = { status, lang: raw };
    await db.set(botNumber, key, cfg);
    await message.react?.("✅");
    return await message.send(
      `🌐 Goodbye language set to ${raw.toUpperCase()}`,
    );
  }

  // NEW: "status" keyword — read-only check, does NOT turn anything on/off.
  if (raw === "status") {
    const cfg = await db.getAsync(botNumber, key, null);
    const status = cfg && typeof cfg === "object" ? toBool(cfg.status) : false;
    const lang =
      cfg && typeof cfg === "object" && cfg.lang ? cfg.lang : DEFAULT_LANG;
    return await message.sendreply?.(
      `Goodbye is ${status ? "✅ ON" : "❌ OFF"} for this group.\nLanguage: ${lang.toUpperCase()}`,
    );
  }

  return await message.send?.(
    "❌ Invalid option. Use `on`, `off`, `bn`, `en`, or `status`.",
  );
});

/* ---------------- EVENT: group-participants.update (UNCHANGED) ---------------- */
Module({ on: "group-participants.update" })(async (_msg, event, conn) => {
  try {
    if (
      !event ||
      !event.id ||
      !event.action ||
      !Array.isArray(event.participants)
    )
      return;
    const groupJid = event.id;
    const groupName =
      event.groupName ||
      (event.groupMetadata && event.groupMetadata.subject) ||
      "";
    const groupSize =
      typeof event.groupSize === "number"
        ? event.groupSize
        : event.groupMetadata && Array.isArray(event.groupMetadata.participants)
          ? event.groupMetadata.participants.length
          : event.groupMetadata && event.groupMetadata.participants
            ? event.groupMetadata.participants.length
            : 0;

    // FIX: use the guarded safeJid()/getBotNumber() defined above instead
    // of a bare `.split(":")` — keeps this consistent with message.botnum
    // used in the command handlers, and won't throw if conn.user isn't
    // populated yet when this event fires.
    const botNumber = getBotNumber(conn);
    const action = String(event.action).toLowerCase();
    const botJidFull = safeJid(conn?.user?.id);
    const welcomesMembers = ["add", "invite", "joined"].includes(action);
    const goodbyesMembers = ["remove", "leave", "left", "kicked"].includes(
      action,
    );
    const [welcomeConfig, goodbyeConfig] = await Promise.all([
      welcomesMembers
        ? db.getAsync(botNumber, `group:${groupJid}:welcome`, null)
        : null,
      goodbyesMembers
        ? db.getAsync(botNumber, `group:${groupJid}:goodbye`, null)
        : null,
    ]);

    for (const p of event.participants) {
      // FIX: jidNormalizedUser() called bare here previously — wrapped in
      // safeJid() now so a malformed/missing participant id can't crash
      // the whole loop (and therefore skip processing every other
      // participant in the same event).
      const participantJid = safeJid(
        typeof p === "string" ? p : p?.id || p?.jid || "",
      );
      if (!participantJid) continue;
      if (botJidFull && participantJid === botJidFull) continue; // skip bot itself

      // WELCOME (add/invite/join)
      if (action === "add" || action === "invite" || action === "joined") {
        const cfgRaw = welcomeConfig;
        const enabled =
          cfgRaw && typeof cfgRaw === "object" ? toBool(cfgRaw.status) : false;
        if (!enabled) continue;

        const lang =
          cfgRaw && typeof cfgRaw === "object" && cfgRaw.lang
            ? cfgRaw.lang
            : DEFAULT_LANG;

        const mentionText = `@${participantJid.split("@")[0]}`;
        const replacements = { mentionText, name: groupName, size: groupSize };
        // Pick a fresh random template per event (per language) instead
        // of reusing one fixed template for the whole process lifetime.
        const template = pickRandom(getTextsFor("welcome", lang));
        const { text, wantsPp } = buildText(template, replacements);

        let imgBuf = null;
        if (wantsPp) imgBuf = await fetchProfileBuffer(conn, participantJid);

        try {
          await sendWelcomeMsg(conn, groupJid, text, [participantJid], imgBuf);
        } catch (e) {
          console.error(
            "[welcome-goodbye] error sending welcome:",
            e?.message || e,
          );
        }
      }

      // GOODBYE (remove/leave/left/kicked)
      if (
        action === "remove" ||
        action === "leave" ||
        action === "left" ||
        action === "kicked"
      ) {
        const cfgRaw = goodbyeConfig;
        const enabled =
          cfgRaw && typeof cfgRaw === "object" ? toBool(cfgRaw.status) : false;
        if (!enabled) continue;

        const lang =
          cfgRaw && typeof cfgRaw === "object" && cfgRaw.lang
            ? cfgRaw.lang
            : DEFAULT_LANG;

        const mentionText = `@${participantJid.split("@")[0]}`;
        const replacements = { mentionText, name: groupName, size: groupSize };
        const template = pickRandom(getTextsFor("goodbye", lang));
        const { text, wantsPp } = buildText(template, replacements);

        let imgBuf = null;
        if (wantsPp) imgBuf = await fetchProfileBuffer(conn, participantJid);

        try {
          await sendWelcomeMsg(conn, groupJid, text, [participantJid], imgBuf);
        } catch (e) {
          console.error(
            "[welcome-goodbye] error sending goodbye:",
            e?.message || e,
          );
        }
      }

      // PROMOTE / DEMOTE (kept as-is)
      if (action === "promote" || action === "demote") {
        const owner = botJidFull || null;
        const ownerMention = owner
          ? `@${owner.split("@")[0]}`
          : conn.user?.id
            ? `@${String(conn.user.id).split(":")[0]}`
            : "Owner";
        const actor = event.actor || event.author || event.by || null;
        const actorText = actor ? `@${actor.split("@")[0]}` : "Admin";
        const targetText = `@${participantJid.split("@")[0]}`;
        const actionText = action === "promote" ? "promoted" : "demoted";
        const sendText = `╭─〔 *🎉 Admin Event* 〕\n├─ ${actorText} has ${actionText} ${targetText}\n├─ Group: ${groupName}\n╰─➤`;
        try {
          const mentions = [actor, participantJid, botJidFull].filter(Boolean);
          if (owner) mentions.push(owner);
          await conn.sendMessage(groupJid, { text: sendText, mentions });
        } catch (e) {
          console.error(
            "[welcome-goodbye] promote/demote send error:",
            e?.message || e,
          );
          try {
            await conn.sendMessage(groupJid, { text: sendText });
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.error(
      "[welcome-goodbye] event handler error:",
      err?.message || err,
    );
  }
});
