import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import config from "../config.js";
import TelegramBot from "node-telegram-bot-api";
import {
  customEmoji,
  isCustomEmojiError,
  withCustomEmoji,
  withoutCustomEmoji,
} from "./telegram-format.js";

export default async function initializeTelegramBot(manager) {
  // ── CONFIG ──────────────────────────────────────────────────────────────────
  const ALLOWED_GROUP_ID = config.ALLOWED_GROUP_ID;
  const GROUP_INVITE_LINK = config.GROUP_INVITE_LINK;
  const WA_CHANNEL_LINK = config.WA_CHANNEL_LINK;
  const PAIR_COOLDOWN_MS = config.PAIR_COOLDOWN_MS;
  const BOT_TOKEN = config.BOT_TOKEN;

  if (!BOT_TOKEN) {
    console.warn("❌ [bot.js] BOT_TOKEN not set — skipping Telegram bot.");
    return null;
  }

  const RAILWAY_URL =
    process.env.RAILWAY_STATIC_URL || process.env.WEBHOOK_BASE_URL || "";
  const USE_WEBHOOK = Boolean(RAILWAY_URL);

  const tbot = new TelegramBot(
    BOT_TOKEN,
    USE_WEBHOOK
      ? { polling: false }
      : { polling: { interval: 3000, timeout: 30 } },
  );

  tbot.on("polling_error", (e) =>
    console.error("❗ [bot.js] Polling error:", e?.message || e),
  );
  tbot.on("webhook_error", (e) =>
    console.error("❗ [bot.js] Webhook error:", e?.message || e),
  );

  // Fetch bot identity
  let botId = null;
  try {
    const me = await tbot.getMe();
    botId = me.id;
    tbot.botId = me.id;
    tbot.botUsername = me.username;
    console.log(
      `🤖 [bot.js] @${me.username} (${me.id}) — mode: ${
        USE_WEBHOOK ? "webhook" : "polling"
      }`,
    );
  } catch (e) {
    console.warn("⚠️ [bot.js] getMe failed:", e?.message);
  }

  // Per-user pair cooldown map
  const pairCooldown = new Map(); // userId → timestamp

  // FIX: periodic sweep so pairCooldown doesn't grow forever across
  // 200+ users over a long-running process — entries older than the
  // cooldown window are useless and can be dropped.
  const cooldownSweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [uid, ts] of pairCooldown) {
      if (now - ts > PAIR_COOLDOWN_MS) pairCooldown.delete(uid);
    }
  }, PAIR_COOLDOWN_MS * 2);
  if (cooldownSweepTimer?.unref) cooldownSweepTimer.unref();

  // ── Utility helpers ─────────────────────────────────────────────────────────

  const esc = (s = "") =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // Sans-serif bold unicode font (for visual headers)
  function F(text = "") {
    return String(text).replace(/[A-Za-z]/g, (ch) => {
      const c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d5a0 + (c - 65));
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d5ba + (c - 97));
      return ch;
    });
  }

  function E(id, fallback = "▪️") {
    return customEmoji(id, fallback);
  }

  async function sendMediaWithEmoji(method, chatId, media, options = {}) {
    const caption = withCustomEmoji(options.caption || "");
    try {
      return await tbot[method](chatId, media, { ...options, caption });
    } catch (error) {
      if (!isCustomEmojiError(error)) {
        console.error(`[bot.js] ${method} failed:`, error?.message || error);
        return null;
      }
      try {
        return await tbot[method](chatId, media, {
          ...options,
          caption: withoutCustomEmoji(caption),
        });
      } catch (fallbackError) {
        console.error(
          `[bot.js] ${method} failed:`,
          fallbackError?.message || error?.message,
        );
        return null;
      }
    }
  }

  function isoToFlag(iso) {
    if (!iso || iso.length !== 2) return "🏳️";
    const A = 0x1f1e6;
    return [...iso.toUpperCase()]
      .map((c) => String.fromCodePoint(A + c.charCodeAt(0) - 65))
      .join("");
  }

  // FIX: normalize a phone number typed in ANY shape —
  //   9170303983 | +9170303983 | 9 1 703 039 83 | +9 1703 03 983
  // all become the same clean digit string "9170303983" before it's
  // ever handed to manager.requestPairingCode(). Strips everything
  // that isn't 0-9 (spaces, +, dashes, parentheses, etc.).
  function normalizePhoneNumber(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  /**
   * Generate a temporary sessionId for a fresh pairing attempt:
   * `${phoneNumber}_${randomId}`. Mirrors app.js's makeTempSessionId().
   * This id is only ever "promoted" to a permanent, DB-persisted session
   * once pairing actually succeeds — see manager.awaitPairingOutcome() in
   * doPair() below. Until then it's just a scratch id that gets thrown
   * away (creds deleted) on failure/disconnect/timeout.
   */
  function makeTempSessionId(phone) {
    const randomId = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit numeric
    return `${phone}_${randomId}`;
  }

  /**
   * Given a saved sessionId `${phone}_${randomId}`, return just the phone
   * number part for display. Falls back to the whole sid if it doesn't
   * match that shape (e.g. a legacy session paired before this scheme
   * existed, back when sessionId === bare phone number).
   */
  function phoneFromSid(sid) {
    const s = String(sid || "");
    const idx = s.lastIndexOf("_");
    return idx > 0 ? s.slice(0, idx) : s;
  }

  // Formats whatever wa-multi-session hands back as a clean XXXX-XXXX
  // (or XXXX-XXXX-... for longer codes). No custom branding — the code
  // is whatever Baileys/wa-multi-session generated.
  function fmtCode(raw) {
    const s = String(raw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4)}`;
    return s.match(/.{1,4}/g)?.join("-") || s;
  }

  function isPrivate(msg) {
    return msg?.chat?.type === "private";
  }

  function isAllowedGroup(msg) {
    try {
      if (!msg?.chat) return false;
      if (msg.chat.type === "private") return false;
      return String(msg.chat.id) === String(ALLOWED_GROUP_ID);
    } catch {
      return false;
    }
  }

  function isAnonymousAdmin(msg) {
    return !!(
      msg?.sender_chat &&
      msg?.chat &&
      String(msg.sender_chat.id) === String(msg.chat.id)
    );
  }

  async function isAdmin(msg) {
    try {
      if (!msg?.chat) return false;
      if (msg.chat.type === "private") return false;
      if (isAnonymousAdmin(msg)) return true;
      if (!msg.from) return false;
      const member = await tbot.getChatMember(msg.chat.id, msg.from.id);
      return member?.status === "creator" || member?.status === "administrator";
    } catch {
      return false;
    }
  }

  async function safeReply(chatId, text, opts = {}) {
    const formatted = withCustomEmoji(text);
    const options = { parse_mode: "HTML", ...opts };
    try {
      return await tbot.sendMessage(chatId, formatted, options);
    } catch (error) {
      if (/<tg-emoji\b/i.test(formatted) && isCustomEmojiError(error)) {
        try {
          return await tbot.sendMessage(
            chatId,
            withoutCustomEmoji(formatted),
            options,
          );
        } catch (fallbackError) {
          console.error(
            "[bot.js] sendMessage failed:",
            fallbackError?.message || error?.message,
          );
          return null;
        }
      }
      console.error("[bot.js] sendMessage failed:", error?.message);
      return null;
    }
  }

  async function safeEdit(chatId, msgId, text, opts = {}) {
    const formatted = withCustomEmoji(text);
    const options = {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: "HTML",
      ...opts,
    };
    try {
      return await tbot.editMessageText(formatted, options);
    } catch (error) {
      if (/<tg-emoji\b/i.test(formatted) && isCustomEmojiError(error)) {
        try {
          return await tbot.editMessageText(
            withoutCustomEmoji(formatted),
            options,
          );
        } catch {}
      }
      return null;
    }
  }

  // ── Stale-session cleanup before a fresh pairing attempt ─────────────────────
  // Mirrors the same fix applied in index.js's /pair route: if a previous
  // pairing attempt for this number died mid-flight, manager.sessions may
  // still hold a stuck "starting"/"reconnecting" entry (or a dead socket)
  // that would otherwise block a clean retry.
  async function cleanupStaleSession(sid) {
    const entry = manager.sessions.get(sid);
    if (!entry) return;
    const stuckStatus = ["starting", "reconnecting", "connecting"].includes(
      entry.status,
    );
    const deadSocket = entry.sock && manager.isRunning?.(sid) === false;
    if (stuckStatus || deadSocket) {
      try {
        await manager.stop(sid);
      } catch {
        /* ignore — best effort */
      }
    }
  }

  // ── Country detection ────────────────────────────────────────────────────────

  const CALLING_CODE_MAP = {
    1: { iso: "US", name: "United States/Canada" },
    7: { iso: "RU", name: "Russia/Kazakhstan" },
    20: { iso: "EG", name: "Egypt" },
    27: { iso: "ZA", name: "South Africa" },
    30: { iso: "GR", name: "Greece" },
    31: { iso: "NL", name: "Netherlands" },
    32: { iso: "BE", name: "Belgium" },
    33: { iso: "FR", name: "France" },
    34: { iso: "ES", name: "Spain" },
    36: { iso: "HU", name: "Hungary" },
    39: { iso: "IT", name: "Italy" },
    40: { iso: "RO", name: "Romania" },
    41: { iso: "CH", name: "Switzerland" },
    43: { iso: "AT", name: "Austria" },
    44: { iso: "GB", name: "United Kingdom" },
    45: { iso: "DK", name: "Denmark" },
    46: { iso: "SE", name: "Sweden" },
    47: { iso: "NO", name: "Norway" },
    48: { iso: "PL", name: "Poland" },
    49: { iso: "DE", name: "Germany" },
    51: { iso: "PE", name: "Peru" },
    52: { iso: "MX", name: "Mexico" },
    53: { iso: "CU", name: "Cuba" },
    54: { iso: "AR", name: "Argentina" },
    55: { iso: "BR", name: "Brazil" },
    56: { iso: "CL", name: "Chile" },
    57: { iso: "CO", name: "Colombia" },
    58: { iso: "VE", name: "Venezuela" },
    60: { iso: "MY", name: "Malaysia" },
    61: { iso: "AU", name: "Australia" },
    62: { iso: "ID", name: "Indonesia" },
    63: { iso: "PH", name: "Philippines" },
    64: { iso: "NZ", name: "New Zealand" },
    65: { iso: "SG", name: "Singapore" },
    66: { iso: "TH", name: "Thailand" },
    81: { iso: "JP", name: "Japan" },
    82: { iso: "KR", name: "South Korea" },
    84: { iso: "VN", name: "Vietnam" },
    86: { iso: "CN", name: "China" },
    90: { iso: "TR", name: "Turkey" },
    91: { iso: "IN", name: "India" },
    92: { iso: "PK", name: "Pakistan" },
    93: { iso: "AF", name: "Afghanistan" },
    94: { iso: "LK", name: "Sri Lanka" },
    95: { iso: "MM", name: "Myanmar" },
    98: { iso: "IR", name: "Iran" },
    211: { iso: "SS", name: "South Sudan" },
    212: { iso: "MA", name: "Morocco" },
    213: { iso: "DZ", name: "Algeria" },
    216: { iso: "TN", name: "Tunisia" },
    218: { iso: "LY", name: "Libya" },
    220: { iso: "GM", name: "Gambia" },
    221: { iso: "SN", name: "Senegal" },
    233: { iso: "GH", name: "Ghana" },
    234: { iso: "NG", name: "Nigeria" },
    254: { iso: "KE", name: "Kenya" },
    255: { iso: "TZ", name: "Tanzania" },
    256: { iso: "UG", name: "Uganda" },
    260: { iso: "ZM", name: "Zambia" },
    263: { iso: "ZW", name: "Zimbabwe" },
    351: { iso: "PT", name: "Portugal" },
    353: { iso: "IE", name: "Ireland" },
    358: { iso: "FI", name: "Finland" },
    380: { iso: "UA", name: "Ukraine" },
    420: { iso: "CZ", name: "Czech Republic" },
    421: { iso: "SK", name: "Slovakia" },
    500: { iso: "FK", name: "Falkland Islands" },
    501: { iso: "BZ", name: "Belize" },
    502: { iso: "GT", name: "Guatemala" },
    505: { iso: "NI", name: "Nicaragua" },
    506: { iso: "CR", name: "Costa Rica" },
    507: { iso: "PA", name: "Panama" },
    591: { iso: "BO", name: "Bolivia" },
    593: { iso: "EC", name: "Ecuador" },
    595: { iso: "PY", name: "Paraguay" },
    598: { iso: "UY", name: "Uruguay" },
    670: { iso: "TL", name: "East Timor" },
    673: { iso: "BN", name: "Brunei" },
    675: { iso: "PG", name: "Papua New Guinea" },
    679: { iso: "FJ", name: "Fiji" },
    850: { iso: "KP", name: "North Korea" },
    852: { iso: "HK", name: "Hong Kong" },
    853: { iso: "MO", name: "Macau" },
    855: { iso: "KH", name: "Cambodia" },
    856: { iso: "LA", name: "Laos" },
    880: { iso: "BD", name: "Bangladesh" },
    886: { iso: "TW", name: "Taiwan" },
    960: { iso: "MV", name: "Maldives" },
    961: { iso: "LB", name: "Lebanon" },
    962: { iso: "JO", name: "Jordan" },
    963: { iso: "SY", name: "Syria" },
    964: { iso: "IQ", name: "Iraq" },
    965: { iso: "KW", name: "Kuwait" },
    966: { iso: "SA", name: "Saudi Arabia" },
    967: { iso: "YE", name: "Yemen" },
    968: { iso: "OM", name: "Oman" },
    971: { iso: "AE", name: "UAE" },
    972: { iso: "IL", name: "Israel" },
    973: { iso: "BH", name: "Bahrain" },
    974: { iso: "QA", name: "Qatar" },
    975: { iso: "BT", name: "Bhutan" },
    977: { iso: "NP", name: "Nepal" },
    992: { iso: "TJ", name: "Tajikistan" },
    993: { iso: "TM", name: "Turkmenistan" },
    994: { iso: "AZ", name: "Azerbaijan" },
    995: { iso: "GE", name: "Georgia" },
    996: { iso: "KG", name: "Kyrgyzstan" },
    998: { iso: "UZ", name: "Uzbekistan" },
    1242: { iso: "BS", name: "Bahamas" },
    1246: { iso: "BB", name: "Barbados" },
    1345: { iso: "KY", name: "Cayman Islands" },
    1868: { iso: "TT", name: "Trinidad and Tobago" },
    1876: { iso: "JM", name: "Jamaica" },
  };

  const SORTED_CODES = Object.keys(CALLING_CODE_MAP)
    .map(Number)
    .sort((a, b) => String(b).length - String(a).length || b - a);

  function detectCountry(digits) {
    if (!digits) return null;
    if (digits.startsWith("00")) digits = digits.slice(2);
    for (const code of SORTED_CODES) {
      if (digits.startsWith(String(code))) {
        const info = CALLING_CODE_MAP[code];
        return { callingCode: code, iso: info.iso, name: info.name };
      }
    }
    return null;
  }

  // ── Message builders ─────────────────────────────────────────────────────────

  function buildPairSuccessMessage(rawArg, rawCode, countryInfo) {
    const code = fmtCode(rawCode);
    const flag = countryInfo ? isoToFlag(countryInfo.iso) : "🌍";
    const country = countryInfo
      ? `${flag} <b>${esc(countryInfo.name)}</b> (+${countryInfo.callingCode})`
      : `<i>Country unknown</i>`;

    const text = [
      `${E("5199868659899581222")} <b>𝙷𝚎𝚢 𝙿𝚊𝚒𝚛𝚒𝚗𝚐 𝙲𝚘𝚍𝚎 𝙸𝚜 𝚁𝚎𝚊𝚍𝚢</b>`,
      ``,
      `${E("6339281190985407250")} <b>𝙽𝚞𝚖𝚋𝚎𝚛:</b> <code>${esc(rawArg)}</code>`,
      `${E("6233528337264808983")} <b>𝙲𝚘𝚞𝚗𝚝𝚛𝚢:</b> ${country}`,
      ``,
      `${E("6242135305697106689")} <b>𝙿𝚊𝚒𝚛𝚒𝚗𝚐 𝙲𝚘𝚍𝚎:</b> 『<code>${esc(code)}</code>』`,
      ``,
      `<b>𝙷𝚘𝚠 𝚝𝚘 𝙲𝚘𝚗𝚗𝚎𝚌𝚝</b>`,
      `<b>𝙾𝚙𝚎𝚗 𝚆𝚑𝚊𝚝𝚜𝙰𝚙𝚙</b>`,
      `${E("6244317784738632020")} 𝙶𝚘 𝚝𝚘 𝚂𝚎𝚝𝚝𝚒𝚗𝚐𝚜 → 𝙻𝚒𝚗𝚔𝚎𝚍 𝙳𝚎𝚟𝚒𝚌𝚎𝚜`,
      `${E("6242147417504879292")} 𝚃𝚊𝚙 𝙻𝚒𝚗𝚔 𝚊 𝙳𝚎𝚟𝚒𝚌𝚎`,
      `${E("6242172637552842445")} 𝙴𝚗𝚝𝚎𝚛 𝚝𝚑𝚎 𝙿𝚊𝚒𝚛𝚒𝚗𝚐 𝙲𝚘𝚍𝚎 𝚊𝚋𝚘𝚟𝚎`,
      ``,
      `${E("5303496488356166971")} <b>𝙲𝚘𝚍𝚎 𝚠𝚒𝚗𝚍𝚘𝚠: 𝚞𝚙 𝚝𝚘 3 𝚖𝚒𝚗𝚞𝚝𝚎𝚜.</b>`,
    ].join("\n");

    // Copy the code, open the channel, or start another pairing.
    const reply_markup = {
      inline_keyboard: [
        [
          // Button 1: Tap to copy (CopyTextButton — Telegram Bot API 7.x+)
          {
            text: `${code}`,
            copy_text: { text: code },
          },
        ],
        [
          {
            text: "Open WhatsApp channel",
            url: WA_CHANNEL_LINK,
          },
        ],
        [{ text: "Pair another account", callback_data: "pair_help" }],
      ],
    };

    return { text, reply_markup };
  }
  function buildHelpMessage() {
    return [
      `${E("6231089190977673116", "✨")} <b>${F("X-Miku · WhatsApp Session Manager")}</b>`,
      ``,
      `<b>${E("6242308461598610637", "📲")} ${F("Pairing")}</b>`,
      `<code>/pair +91XXXXXXXXXX</code>  ${F("Create a WhatsApp link code")}`,
      `<code>/ping</code>  ${F("Check Telegram response time")}`,
      ``,
      `<b>${E("6235567682226230771", "🧰")} ${F("Admin tools")}</b>`,
      `<code>/sessions</code>  ${F("View connected accounts")}`,
      `<code>/status</code>  ${F("View bot health and uptime")}`,
      `<code>/restart NUMBER</code>  ${F("Reconnect an account")}`,
      `<code>/stop NUMBER</code>  ${F("Pause an account")}`,
      `<code>/logout NUMBER</code>  ${F("Remove an account")}`,
      `<code>/reactp LINK [EMOJI]</code>  ${F("React to a channel post")}`,
      `<code>/s NUMBER CODE</code>  ${F("Run a socket query · admins")}`,
      `<code>/as CODE</code>  ${F("Run on connected sessions · admins")}`,
      `<code>/d COMMAND</code>  ${F("Run a server command · admins")}`,
      ``,
      `<b>${E("6233013894672028131", "💡")} ${F("More")}</b>`,
      `<code>/about</code>  ${F("About this bot")}`,
      `<code>/health</code>  ${F("Detailed runtime metrics · admins")}`,
      `<code>/id</code>  ${F("Show chat and user IDs · admins")}`,
      `<code>/help</code> or <code>/commands</code>  ${F("Show this menu")}`,
      ``,
      `<i>${F("Use the full international number, including its country code.")}</i>`,
    ].join("\n");
  }

  function buildHelpKeyboard() {
    return {
      inline_keyboard: [
        [{ text: "Pair a WhatsApp account", callback_data: "pair_help" }],
        [
          { text: "Official group", url: GROUP_INVITE_LINK },
          { text: "WhatsApp channel", url: WA_CHANNEL_LINK },
        ],
      ],
    };
  }

  // ── Core pair logic (shared by /pair command and callback) ───────────────────
  //
  // FIX (no more manual /logout needed to re-pair): "already paired" is
  // now only true when the phone number has a session that is CURRENTLY,
  // truly connected (manager.findConnectedSessionIdByPhone()). If the
  // phone has no live connected session — because a previous pairing
  // attempt never fully completed (a stuck temp session like
  // `917003816494_30383` whose socket never reached "connected"), or
  // because a previously-paired session went offline — any such stale
  // leftover is automatically cleaned up (manager.cleanupPhoneSessions())
  // before a brand-new temp sessionId + pairing attempt starts. The user
  // never has to run /logout by hand first; only a session that's
  // actually online blocks a fresh /pair.

  async function doPair(chatId, rawArg, replyToId) {
    const digits = normalizePhoneNumber(rawArg);
    if (!/^[1-9][0-9]{6,14}$/.test(digits)) {
      return safeReply(
        chatId,
        "❌ Please enter a valid international phone number using 7–15 digits, without a leading zero.",
        { reply_to_message_id: replyToId },
      );
    }

    const countryInfo = detectCountry(digits);
    const flag = countryInfo ? isoToFlag(countryInfo.iso) : "☁️";
    const countryName = countryInfo?.name || "Unknown";
    const sid = makeTempSessionId(digits);

    if (!manager.reservePhonePairing(digits, sid)) {
      return safeReply(
        chatId,
        "⏳ A pairing attempt is already in progress for this phone number. Please wait for it to finish.",
        { reply_to_message_id: replyToId },
      );
    }

    // Only a genuinely CONNECTED session blocks a fresh pairing attempt —
    // a stuck/incomplete temp session, or a permanent session that's gone
    // offline, no longer counts as "already paired".
    let connectedSid;
    try {
      connectedSid = await manager.findConnectedSessionIdByPhone(digits);
    } catch (error) {
      manager.releasePhonePairing(sid);
      return safeReply(
        chatId,
        `❌ Could not check this phone's session: ${esc(error?.message || error)}`,
        { reply_to_message_id: replyToId },
      );
    }
    if (connectedSid) {
      manager.releasePhonePairing(sid);
      return safeReply(
        chatId,
        [
          `<b>✘ 𝙰𝚕𝚛𝚎𝚊𝚍𝚢 𝙿𝚊𝚒𝚛𝚎𝚍</b>`,
          ``,
          `<b>✆ 𝙽𝚞𝚖𝚋𝚎𝚛:</b> <code>${esc(rawArg)}</code>`,
          ``,
          `<i>Use /restart ${esc(digits)} to reconnect it, or /logout ${esc(
            digits,
          )} to remove it and pair again.</i>`,
        ].join("\n"),
        { parse_mode: "HTML", reply_to_message_id: replyToId },
      );
    }

    // No live connected session for this phone — clean up any stale
    // leftovers (a previous failed/incomplete temp pairing attempt, or a
    // now-offline permanent session) automatically, so they can never
    // block or conflict with the fresh attempt below. This removes the
    // need for the user to manually /logout before re-pairing.
    try {
      await manager.cleanupPhoneSessions(digits);
    } catch (error) {
      manager.releasePhonePairing(sid);
      return safeReply(
        chatId,
        `❌ Could not clear an old pairing attempt: ${esc(error?.message || error)}`,
        { reply_to_message_id: replyToId },
      );
    }

    const loadingMsg = await safeReply(
      chatId,
      [
        `<b>ᝰ 𝙶𝚎𝚗𝚎𝚛𝚊𝚝𝚒𝚗𝚐 𝙿𝚊𝚒𝚛 𝙲𝚘𝚍𝚎...</b>`,
        ``,
        `<b>✆ 𝙽𝚞𝚖𝚋𝚎𝚛:</b> <code>${esc(rawArg)}</code>`,
        countryInfo
          ? `<b>✰ ${esc(countryName)}</b> (+${countryInfo.callingCode})`
          : `<i>Country not detected — trying anyway</i>`,
        ``,
        `<b>ヅ 𝙿𝚕𝚎𝚊𝚜𝚎 𝚠𝚊𝚒𝚝 𝚊 𝚖𝚘𝚖𝚎𝚗𝚝...</b>`,
      ].join("\n"),
      { parse_mode: "HTML", reply_to_message_id: replyToId },
    );

    // Temporary sessionId for this attempt: phone + random numeric ID.
    // This is only "promoted" to a permanent, reusable sessionId once
    // pairing actually succeeds — see manager.awaitPairingOutcome() below,
    // which deletes it again if pairing fails/disconnects/times out.
    let rawCode = null;
    try {
      // manager.requestPairingCode() owns the whole flow — it calls
      // wa-multi-session's own startSessionWithPairingCode() internally
      // and resolves once wa-multi-session's onPairingCode callback
      // fires. No custom branded code — this returns whatever code
      // wa-multi-session/Baileys generates.
      await cleanupStaleSession(sid);
      rawCode = await manager.requestPairingCode(sid, digits, {
        timeoutMs: 30_000,
      });
    } catch (err) {
      // Delete loading message
      try {
        await tbot.deleteMessage(chatId, loadingMsg?.message_id);
      } catch {}
      // Best-effort: wipe whatever partial creds got written for this
      // temp sid before the failure, so it can't block the next attempt.
      manager.logout(sid).catch(() => {});
      return safeReply(
        chatId,
        [
          `<b>✘ 𝚂𝚘𝚛𝚛𝚢, 𝚙𝚊𝚒𝚛𝚒𝚗𝚐 𝚠𝚊𝚜 𝚗𝚘𝚝 𝚜𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕</b>`,
          ``,
          `<b>✆ 𝙽𝚞𝚖𝚋𝚎𝚛:</b> +${esc(rawArg)}`,
          `<b>㋡ 𝚁𝚎𝚊𝚜𝚘𝚗:</b> ${esc(String(err?.message || err))}`,
          ``,
          `<b>𝙿𝚕𝚎𝚊𝚜𝚎 𝚝𝚛𝚢 𝚙𝚊𝚒𝚛𝚒𝚗𝚐 𝚊𝚐𝚊𝚒𝚗 𝚠𝚒𝚝𝚑 𝙼𝚒𝚔𝚞.♡</b>`,
        ].join("\n"),
        {
          parse_mode: "HTML",
          reply_to_message_id: replyToId,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `/pair +${digits}`,
                  copy_text: { text: `/pair +${digits}` },
                },
              ],
            ],
          },
        },
      );
    }

    // Delete loading message
    try {
      await tbot.deleteMessage(chatId, loadingMsg?.message_id);
    } catch {}

    if (!rawCode) {
      manager.releasePhonePairing(sid);
      manager.logout(sid).catch(() => {});
      return safeReply(
        chatId,
        `❌ ${F("No pair code returned — please try again.")}`,
        { reply_to_message_id: replyToId },
      );
    }

    const { text, reply_markup } = buildPairSuccessMessage(
      rawArg,
      rawCode,
      countryInfo,
    );
    const pairMsg = await safeReply(chatId, text, {
      reply_to_message_id: replyToId,
      reply_markup,
      disable_web_page_preview: true,
    });

    if (!pairMsg?.message_id) {
      manager.releasePhonePairing(sid);
      manager.logout(sid).catch(() => {});
      return pairMsg;
    }

    if (pairMsg?.message_id) {
      const WATCH_TIMEOUT_MS = 180_000;
      const msgId = pairMsg.message_id;
      const flag = countryInfo ? isoToFlag(countryInfo.iso) : "🌍";
      const displayNum = `+${digits}`;

      const connectedText = [
        `${E("5303119772479668235")} <b>𝙱𝙾𝚃 𝙲𝙾𝙽𝙽𝙴𝙲𝚃𝙴𝙳!</b>`,
        ``,
        `${E("6233366429882654276")} <b>𝚂𝚞𝚌𝚌𝚎𝚜𝚜𝚏𝚞𝚕𝚕𝚢 𝚕𝚒𝚗𝚔𝚎𝚍!</b>`,
        ``,
        `${E("6339281190985407250")} <b>𝙽𝚞𝚖𝚋𝚎𝚛:</b> <code>${esc(displayNum)}</code>`,
        countryInfo
          ? `${E("6339280615459789282")} <b>${esc(countryInfo.name)}</b> (+${countryInfo.callingCode})`
          : `<i>Country unknown</i>`,
        ``,
      ].join("\n");

      const failedText = [
        `${E("5199464159879642359")} <b>𝙿𝙰𝙸𝚁 𝚄𝙽𝚂𝚄𝙲𝙲𝙴𝚂𝚂𝙵𝚄𝙻</b>`,
        ``,
        `${E("6235646232883107337")} <b>𝚃𝚒𝚖𝚎𝚍 𝚘𝚞𝚝 — 𝚌𝚘𝚍𝚎 𝚠𝚊𝚜 𝚗𝚘𝚝 𝚞𝚜𝚎𝚍.</b>`,
        ``,
        `${E("6233376419976582541")} <b>𝙽𝚞𝚖𝚋𝚎𝚛:</b> <code>${esc(displayNum)}</code>`,
        ``,
        `${E("5199766598591726522")} <b>𝙿𝚕𝚎𝚊𝚜𝚎 𝚝𝚛𝚢 𝚊𝚐𝚊𝚒𝚗:</b>`,
        `<code>/pair ${esc(displayNum)}</code>`,
      ].join("\n");

      // Keyboards for the two states
      const connectedKeyboard = {
        inline_keyboard: [[{ text: "WA Channel", url: WA_CHANNEL_LINK }]],
      };
      const failedKeyboard = {
        inline_keyboard: [
          [
            {
              text: `/pair ${displayNum}`,
              copy_text: { text: `/pair ${displayNum}` },
            },
          ],
          [{ text: "WA Channel", url: WA_CHANNEL_LINK }],
        ],
      };

      // Watch in background — never block the pair response. This now
      // delegates to manager.awaitPairingOutcome(sid, ...), which watches
      // the *temp* sessionId (phone_randomId), and on failure/timeout also
      // deletes whatever creds got written for it — so bot.js no longer
      // needs its own connected/session.deleted listeners here.
      manager
        .awaitPairingOutcome(sid, { timeoutMs: WATCH_TIMEOUT_MS })
        .then(async ({ success }) => {
          if (success) {
            await safeEdit(chatId, msgId, connectedText, {
              reply_markup: connectedKeyboard,
              disable_web_page_preview: true,
            });
            console.log(
              `[bot.js] ❤️‍🩹 Pair watcher: ${sid} connected — message updated`,
            );
          } else {
            await safeEdit(chatId, msgId, failedText, {
              reply_markup: failedKeyboard,
              disable_web_page_preview: true,
            });
            console.log(`[bot.js] 😴 Pair watcher: ${sid} — did not complete`);
          }
        })
        .catch((e) => {
          console.error(
            `[bot.js] awaitPairingOutcome error for ${sid}:`,
            e?.message || e,
          );
        });
    }

    return pairMsg;
  }

  // ── Auto-leave unauthorized groups ──────────────────────────────────────────

  tbot.on("new_chat_members", async (msg) => {
    try {
      if (!msg?.new_chat_members) return;
      if (!botId) return;
      const addedBot = msg.new_chat_members.some((m) => m.id === botId);
      if (!addedBot) return;

      if (!isAllowedGroup(msg)) {
        console.log(
          "[bot.js] Added to unauthorized group:",
          msg.chat.id,
          "— leaving",
        );
        await safeReply(
          msg.chat.id,
          `<b>${F("Official group only")}</b>\n\n${F(
            "This bot is available in our official Telegram group. Join us here:",
          )}\n\n<a href="${esc(GROUP_INVITE_LINK)}">${F("Join the group")}</a>`,
        );
        await tbot.leaveChat(msg.chat.id).catch(() => {});
      } else {
        await safeReply(
          msg.chat.id,
          `🎉 <b>${F(
            "X-Miku is ready",
          )}</b>\n\nUse /help to browse commands or /pair to link a WhatsApp account.`,
        );
      }
    } catch (e) {
      console.error("[bot.js] new_chat_members error:", e);
    }
  });

  // ── Private redirect ─────────────────────────────────────────────────────────

  async function redirectToGroup(chatId, replyToId) {
    return sendMediaWithEmoji(
      "sendVideo",
      chatId,
      "https://files.catbox.moe/pohkxl.mp4",
      {
        caption: [
          `<b><tg-emoji emoji-id="5199877425927831893">🙂</tg-emoji> 𝚆𝚎𝚕𝚌𝚘𝚖𝚎 𝚝𝚘 𝚇-𝙼𝙸𝙺𝚄 ♡ 𝚆𝙰 𝙼𝚒𝚗𝚒 𝙱𝚘𝚝.</b>`,
          ``,
          `<b><tg-emoji emoji-id="5895407084131848348">⭐️</tg-emoji> 𝚙𝚊𝚒𝚛 𝚆𝙰 𝚗𝚞𝚖𝚋𝚎𝚛, 𝚏𝚒𝚛𝚜𝚝 𝚓𝚘𝚒𝚗 𝚘𝚞𝚛 𝚐𝚛𝚘𝚞𝚙.</b>`,
          ``,
          `<b>𝚃𝚑𝚎𝚗 𝚞𝚜𝚎 𝚝𝚑𝚎 𝚌𝚘𝚖𝚖𝚊𝚗𝚍 𝚋𝚎𝚕𝚘𝚠 𝚠𝚒𝚝𝚑 𝚗𝚞𝚖𝚋𝚎𝚛: <tg-emoji emoji-id="5470082691921619031">🫠</tg-emoji></b>`,
          ``,
          `<b><tg-emoji emoji-id="6208721705674744655">🇸🇻</tg-emoji> 𝙴𝚡𝚊𝚖𝚙𝚕𝚎: /𝚙𝚊𝚒𝚛 +917002826276</b>`,
          ``,
          `<b>𝙼𝚊𝚔𝚎 𝚜𝚞𝚛𝚎 𝚝𝚘 𝚒𝚗𝚌𝚕𝚞𝚍𝚎 𝚌𝚘𝚞𝚗𝚝𝚛𝚢 𝚌𝚘𝚍𝚎. <tg-emoji emoji-id="5303366329372262431">💋</tg-emoji></b>`,
        ].join("\n"),
        parse_mode: "HTML",
        reply_to_message_id: replyToId,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "ᝰ Join Official Group",
                url: GROUP_INVITE_LINK,
              },
            ],
          ],
        },
      },
    );
  }

  // ── Command parser ───────────────────────────────────────────────────────────

  // FIX: Telegram only auto-tags "/command" as a bot_command entity, so
  // a "." prefix (e.g. ".pair 91XXXXXXXXXX") never has an entity and
  // used to fall straight through parseCmd's `!msg.text.startsWith("/")`
  // check and get ignored. Both "/" and "." are now accepted everywhere.
  function parseCmd(msg) {
    if (!msg?.text) return null;
    const entities = msg.entities || [];
    if (entities.length > 0) {
      const first = entities[0];
      if (first.type === "bot_command" && first.offset === 0) {
        const raw = msg.text.slice(0, first.length);
        const cmd = raw.split(/[@\s]/)[0].replace(/^[/.]/, "").toLowerCase();
        const args = msg.text.slice(first.length).trim();
        return { cmd, args };
      }
    }
    if (!/^[/.]/.test(msg.text)) return null;
    const [rawCmd, ...rest] = msg.text.trim().split(/\s+/);
    return {
      cmd: rawCmd.split("@")[0].replace(/^[/.]/, "").toLowerCase(),
      args: rest.join(" ").trim(),
    };
  }

  // ── Command handler ────────────────

  async function handleCommand(msg) {
    const parsed = parseCmd(msg);
    if (!parsed) return;
    const { cmd, args } = parsed;
    const chatId = msg.chat.id;
    const replyId = msg.message_id;

    console.log(
      `[bot.js] /${cmd} from ${
        msg.from?.id || msg.sender_chat?.id
      } in ${chatId}`,
    );

    // ── /start ─────────────────────

    if (cmd === "start") {
      if (isPrivate(msg)) return redirectToGroup(chatId, replyId);
      if (!isAllowedGroup(msg)) return;
      return sendMediaWithEmoji(
        "sendVideo",
        chatId,
        "https://files.catbox.moe/dh9yey.mp4",
        {
          caption: [
            `<b>𖠌 𝚇-𝙼𝙸𝙺𝚄 𝙵𝚛𝚎𝚎 𝚆𝚑𝚊𝚝𝚜𝙰𝚙𝚙 𝙼𝚒𝚗𝚒 𝙱𝚘𝚝</b>`,
            ``,
            `<b>➥ 𝚙𝚊𝚒𝚛 𝚢𝚘𝚞𝚛 𝚆𝙰 𝚗𝚞𝚖𝚋𝚎𝚛, 𝚞𝚜𝚎:</b>`,
            ``,
            `<b>✆ 𝙴𝚡𝚊𝚖𝚙𝚕𝚎:</b> /pair +917002826276`,
            ``,
            `<b>ヅ 𝙽𝚎𝚎𝚍 𝚑𝚎𝚕𝚙 𝚠𝚒𝚝𝚑 𝚙𝚊𝚒𝚛𝚒𝚗𝚐?</b> /help`,
            ``,
            `<b>♕ 𝙳𝚎𝚟𝚎𝚕𝚘𝚙𝚎𝚛𝚜</b>`,
            `𝚂𝚞𝚖𝚘𝚗 — @nightx_rebel`,
            `𝙱𝚒𝚝𝚝𝚞 — @bittu_1m`,
            ``,
            `<b>𝙼𝚊𝚍𝚎 𝚠𝚒𝚝𝚑 𝚕𝚘𝚟𝚎 𝚋𝚢 𝚇-𝙼𝙸𝙺𝚄 ♡</b>`,
          ].join("\n"),
          parse_mode: "HTML",
          reply_to_message_id: replyId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "Open help", callback_data: "help" }],
              [
                { text: "Official group", url: GROUP_INVITE_LINK },
                { text: "WhatsApp channel", url: WA_CHANNEL_LINK },
              ],
            ],
          },
        },
      );
    }

    // ── /help ───────────
    if (cmd === "help" || cmd === "commands") {
      if (isPrivate(msg)) return redirectToGroup(chatId, replyId);
      if (!isPrivate(msg) && !isAllowedGroup(msg)) return;
      return safeReply(chatId, buildHelpMessage(), {
        reply_to_message_id: replyId,
        reply_markup: buildHelpKeyboard(),
      });
    }

    if (cmd === "about") {
      if (!isPrivate(msg) && !isAllowedGroup(msg)) return;
      return safeReply(
        chatId,
        [
          `${E("6231089190977673116", "✨")} <b>${F("X-Miku WhatsApp Session Manager")}</b>`,
          ``,
          `${F("Pair and manage WhatsApp sessions from Telegram.")}`,
          `${F("Pairing codes are temporary. Only pair accounts you own or are authorized to manage.")}`,
          ``,
          `${F("Commands:")} <code>/help</code> · ${F("Website/community:")}`,
          `<a href="${esc(GROUP_INVITE_LINK)}">${F("Official Telegram group")}</a>`,
          `<a href="${esc(WA_CHANNEL_LINK)}">${F("WhatsApp channel")}</a>`,
        ].join("\n"),
        { reply_to_message_id: replyId, disable_web_page_preview: true },
      );
    }

    if (cmd === "health") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(
          chatId,
          `${E("6235646232883107337", "🔒")} <b>${F("Admins only")}</b>`,
          {
            reply_to_message_id: replyId,
          },
        );
      }

      const memory = process.memoryUsage();
      const sessions = manager.getAllConnections?.() || [];
      const online = sessions.filter((session) => session.healthy).length;
      const load =
        os
          .loadavg?.()
          .map((value) => value.toFixed(2))
          .join(" / ") || "—";
      const uptimeSeconds = Math.floor(process.uptime());
      const uptime = `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;

      return safeReply(
        chatId,
        [
          `${E("6233013894672028131", "🩺")} <b>${F("Runtime health")}</b>`,
          ``,
          `${E("6244492465353529537", "💾")} ${F("RSS:")} <code>${(memory.rss / 1048576).toFixed(1)} MB</code> · ${F("Heap:")} <code>${(memory.heapUsed / 1048576).toFixed(1)} MB</code>`,
          `${E("6235567682226230771", "🔌")} ${F("Sessions:")} <b>${online}</b> ${F("online / ")}<b>${sessions.length}</b>`,
          `${E("6242308461598610637", "⏱")} ${F("Uptime:")} <code>${uptime}</code> · ${F("Load:")} <code>${load}</code>`,
          `${E("6233098956499326729", "⚙️")} ${F("Runtime:")} <code>${process.version}</code> · <code>${process.platform}</code>`,
        ].join("\n"),
        { reply_to_message_id: replyId },
      );
    }

    if (cmd === "id") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(
          chatId,
          `${E("6235646232883107337", "🔒")} <b>${F("Admins only")}</b>`,
          {
            reply_to_message_id: replyId,
          },
        );
      }
      const senderId = msg.from?.id || msg.sender_chat?.id || "unknown";
      return safeReply(
        chatId,
        [
          `${E("6339281190985407250", "🪪")} <b>${F("Telegram IDs")}</b>`,
          ``,
          `${F("Chat:")} <code>${esc(chatId)}</code>`,
          `${F("Your account:")} <code>${esc(senderId)}</code>`,
        ].join("\n"),
        { reply_to_message_id: replyId },
      );
    }

    if (cmd === "s") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }

      const spaceIdx = (args || "").indexOf(" ");
      if (spaceIdx === -1) {
        return safeReply(
          chatId,
          [
            `❓ <b>${F("Usage:")}</b>`,
            ``,
            `<code>/s 91XXXXXXXXXX sock.sendMessage('jid', { text: 'hi' })</code>`,
            `<code>/s 91XXXXXXXXXX sock.groupFetchAllParticipating()</code>`,
            `<code>/s 91XXXXXXXXXX sock.user</code>`,
            ``,
            `💡 ${F("Tips:")}`,
            `• ${F("Large results auto-sent as .json file")}`,
            `• ${F("Arrays show item count summary")}`,
            `• ${F("Execution time shown")}`,
            `• ${F("Timeout: 30s")}`,
          ].join("\n"),
          { reply_to_message_id: replyId },
        );
      }

      const phone = args.slice(0, spaceIdx).trim().replace(/\D/g, "");
      const code = args.slice(spaceIdx + 1).trim();

      if (!phone || !code) {
        return safeReply(chatId, `❌ ${F("Missing session ID or code.")}`, {
          reply_to_message_id: replyId,
        });
      }

      // ── Resolve phone number -> actual sessionId (phone_randomId) ────────────
      const sid = await manager.findSessionIdByPhone(phone);
      const entry = sid ? manager.sessions.get(sid) : null;
      if (!sid || !entry?.sock) {
        const allSids = [...(manager.sessions?.keys() || [])]
          .map((s) => `<code>${esc(phoneFromSid(s))}</code>`)
          .join(", ");
        return safeReply(
          chatId,
          [
            `❌ <b>${F("Session Not Found:")}</b> <code>${esc(phone)}</code>`,
            ``,
            `📋 ${F("Available:")} ${allSids || "none"}`,
          ].join("\n"),
          { reply_to_message_id: replyId },
        );
      }

      const sock = entry.sock;
      const sessionUser =
        sock.user?.name || sock.user?.id?.split(":")?.[0] || sid;
      // FIX: entry.status is never "open" — SessionManager uses "connected".
      // This previously made the health dot show 🔴 even for a live session.
      const isHealthy = entry.status === "connected";

      const statusMsg = await safeReply(
        chatId,
        [
          `⏳ <b>${F("Executing...")}</b>`,
          ``,
          `📱 <code>${esc(phone)}</code> (${esc(sessionUser)}) ${isHealthy ? "🟢" : "🔴"}`,
          `📟 <code>${esc(code.slice(0, 300))}${code.length > 300 ? "..." : ""}</code>`,
        ].join("\n"),
        { reply_to_message_id: replyId },
      );

      const startTime = Date.now();

      try {
        // ── Execute with 30s timeout ──────────────────────────────────────────────
        const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFn("sock", `return await (${code})`);

        const result = await Promise.race([
          fn(sock),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Execution timed out (30s)")),
              30_000,
            ),
          ),
        ]);

        const execMs = Date.now() - startTime;

        // ── Detect result type & serialize ────────────────────────────────────────
        let resultStr;
        let typeSummary = "";

        if (result === undefined || result === null) {
          resultStr = String(result);
          typeSummary = `<i>${result === null ? "null" : "undefined"}</i>`;
        } else if (Buffer.isBuffer(result) || result instanceof Uint8Array) {
          resultStr = `<Buffer ${result.byteLength} bytes>`;
          typeSummary = `📦 Buffer — ${result.byteLength} bytes`;
        } else if (Array.isArray(result)) {
          try {
            resultStr = JSON.stringify(result, null, 2);
          } catch {
            resultStr = String(result);
          }
          typeSummary = `📋 Array — ${result.length} items`;
        } else if (typeof result === "object") {
          try {
            resultStr = JSON.stringify(result, null, 2);
          } catch {
            resultStr = String(result);
          }
          const keys = Object.keys(result);
          typeSummary = `🗂 Object — ${keys.length} keys`;
        } else {
          resultStr = String(result);
          typeSummary = `${typeof result}`;
        }

        try {
          await tbot.deleteMessage(chatId, statusMsg?.message_id);
        } catch {}

        const TELEGRAM_LIMIT = 3000;
        const sizeKB = (resultStr.length / 1024).toFixed(1);

        const header = [
          `✅ <b>${F("Done!")}</b>  📱 <code>${esc(phone)}</code> (${esc(sessionUser)})`,
          ``,
          `📊 ${F("Type:")} ${typeSummary}`,
          `⚡ ${F("Time:")} ${execMs}ms   📦 ${F("Size:")} ${sizeKB} KB`,
        ].join("\n");

        // ── Short result → message ────────────────────────────────────────────────
        if (resultStr.length <= TELEGRAM_LIMIT) {
          return safeReply(
            chatId,
            [
              header,
              ``,
              `📤 ${F("Result:")}`,
              `<pre>${esc(resultStr)}</pre>`,
            ].join("\n"),
            { reply_to_message_id: replyId },
          );
        }

        // ── Long result → .json file ──────────────────────────────────────────────
        const tmpPath = path.join(os.tmpdir(), `s_${phone}_${Date.now()}.json`);
        try {
          await fs.promises.writeFile(tmpPath, resultStr, "utf8");
          await sendMediaWithEmoji("sendDocument", chatId, tmpPath, {
            caption: [
              header,
              ``,
              `📟 <code>${esc(code.slice(0, 150))}${code.length > 150 ? "..." : ""}</code>`,
            ].join("\n"),
            parse_mode: "HTML",
            reply_to_message_id: replyId,
          });

          // ── Also send short preview ───────────────────────────────────────────
          const preview = resultStr.slice(0, 500);
          await safeReply(
            chatId,
            [
              `👁 <b>${F("Preview (first 500 chars):")}</b>`,
              `<pre>${esc(preview)}...</pre>`,
            ].join("\n"),
            { reply_to_message_id: replyId },
          );
        } finally {
          fs.promises.unlink(tmpPath).catch(() => {});
        }
      } catch (err) {
        const execMs = Date.now() - startTime;
        try {
          await tbot.deleteMessage(chatId, statusMsg?.message_id);
        } catch {}

        // ── Friendly error messages ───────────────────────────────────────────────
        const errMsg = err?.message || String(err);
        let hint = "";
        if (errMsg.includes("timed out"))
          hint = `\n⏰ ${F("Try a lighter query.")}`;
        else if (errMsg.includes("not a function"))
          hint = `\n💡 ${F("Check method name.")}`;
        else if (errMsg.includes("Cannot read"))
          hint = `\n💡 ${F("Property may be undefined.")}`;
        else if (errMsg.includes("Unexpected token"))
          hint = `\n💡 ${F("Remove semicolons (;) from code.")}`;

        return safeReply(
          chatId,
          [
            `❌ <b>${F("Error on")} <code>${esc(phone)}</code></b>  ⚡ ${execMs}ms`,
            ``,
            `💬 <code>${esc(errMsg)}</code>`,
            hint,
          ]
            .filter(Boolean)
            .join("\n"),
          { reply_to_message_id: replyId },
        );
      }
    }

    if (cmd === "as") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }

      const code = (args || "").trim();

      if (!code) {
        return safeReply(
          chatId,
          [
            `❓ <b>${F("Usage:")}</b>`,
            ``,
            `<code>/as sock.sendMessage('jid', { text: 'hi' })</code>`,
            `<code>/as sock.newsletterFollow('120363xxx@newsletter')</code>`,
            `<code>/as sock.updateProfileStatus('new bio')</code>`,
            ``,
            `💡 ${F("Runs on ALL connected sessions at once")}`,
          ].join("\n"),
          { reply_to_message_id: replyId },
        );
      }

      // ── Get all connected sessions ────────────────────────────────────────────
      // FIX: entry.healthy never exists on raw manager.sessions entries (only
      // getAllConnections() computes that field) and entry.status is never
      // "open" — dropped both dead checks, "connected" is the only real status.
      const allEntries = [...manager.sessions.entries()].filter(
        ([, entry]) => entry?.sock && entry.status === "connected",
      );

      if (allEntries.length === 0) {
        return safeReply(chatId, `❌ ${F("No active sessions found.")}`, {
          reply_to_message_id: replyId,
        });
      }

      const statusMsg = await safeReply(
        chatId,
        [
          `⏳ <b>${F("Running on ALL sessions...")}</b>`,
          ``,
          `🔢 ${F("Sessions:")} <b>${allEntries.length}</b>`,
          `📟 <code>${esc(code.slice(0, 300))}${code.length > 300 ? "..." : ""}</code>`,
        ].join("\n"),
        { reply_to_message_id: replyId },
      );

      const startTime = Date.now();
      const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

      // ── Run on all sessions in parallel ──────────────────────────────────────
      const results = await Promise.allSettled(
        allEntries.map(async ([sid, entry]) => {
          const sock = entry.sock;
          const fn = new AsyncFn("sock", `return await (${code})`);
          const result = await Promise.race([
            fn(sock),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout 30s")), 30_000),
            ),
          ]);
          return { sid, result };
        }),
      );

      const execMs = Date.now() - startTime;

      try {
        await tbot.deleteMessage(chatId, statusMsg?.message_id);
      } catch {}

      // ── Build summary ─────────────────────────────────────────────────────────
      let successCount = 0;
      let failCount = 0;
      const lines = [];

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const sid = allEntries[i][0];
        const phone = phoneFromSid(sid);
        const sock = allEntries[i][1]?.sock;
        const user =
          sock?.user?.name || sock?.user?.id?.split(":")?.[0] || phone;

        if (r.status === "fulfilled") {
          successCount++;
          let resStr;
          try {
            resStr =
              r.value?.result === undefined
                ? "void"
                : JSON.stringify(r.value.result).slice(0, 100);
          } catch {
            resStr = String(r.value?.result).slice(0, 100);
          }
          lines.push(
            `✅ <code>${esc(phone)}</code> (${esc(user)})\n    <i>${esc(resStr)}</i>`,
          );
        } else {
          failCount++;
          const errMsg = r.reason?.message || String(r.reason);
          lines.push(
            `❌ <code>${esc(phone)}</code> (${esc(user)})\n    <i>${esc(errMsg.slice(0, 100))}</i>`,
          );
        }
      }

      const summary = [
        `📊 <b>${F("All Sessions Done!")}</b>  ⚡ ${execMs}ms`,
        ``,
        `✅ ${F("Success:")} <b>${successCount}</b>   ❌ ${F("Failed:")} <b>${failCount}</b>   🔢 ${F("Total:")} <b>${allEntries.length}</b>`,
        ``,
        `📟 <code>${esc(code.slice(0, 150))}${code.length > 150 ? "..." : ""}</code>`,
        ``,
        ...lines,
      ].join("\n");

      const TELEGRAM_LIMIT = 3500;

      // ── Short → message, Long → file ─────────────────────────────────────────
      if (summary.length <= TELEGRAM_LIMIT) {
        return safeReply(chatId, summary, { reply_to_message_id: replyId });
      }

      const tmpPath = path.join(os.tmpdir(), `as_result_${Date.now()}.txt`);
      try {
        // Plain text version for file
        const plainLines = results
          .map((r, i) => {
            const sid = allEntries[i][0];
            if (r.status === "fulfilled") {
              let res;
              try {
                res = JSON.stringify(r.value?.result, null, 2);
              } catch {
                res = String(r.value?.result);
              }
              return `✅ ${sid}\n${res}\n`;
            } else {
              return `❌ ${sid}\n${r.reason?.message || r.reason}\n`;
            }
          })
          .join("\n---\n");

        await fs.promises.writeFile(tmpPath, plainLines, "utf8");
        await sendMediaWithEmoji("sendDocument", chatId, tmpPath, {
          caption: [
            `📊 <b>${F("All Sessions Done!")}</b>  ⚡ ${execMs}ms`,
            `✅ ${successCount} success   ❌ ${failCount} failed   🔢 ${allEntries.length} total`,
          ].join("\n"),
          parse_mode: "HTML",
          reply_to_message_id: replyId,
        });
      } finally {
        fs.promises.unlink(tmpPath).catch(() => {});
      }
    }

    // ── /ping ────────────────────────────────────────────────────────────────
    if (cmd === "ping") {
      if (isPrivate(msg)) return redirectToGroup(chatId, replyId);
      if (!isAllowedGroup(msg)) return;
      const start = Date.now();
      const m = await safeReply(chatId, "🏓 Pong!", {
        reply_to_message_id: replyId,
      });
      if (!m?.message_id) return m;
      const ms = Date.now() - start;
      return safeEdit(
        chatId,
        m.message_id,
        `🏓 <b>Pong!</b>\n⚡ <b>${ms}ms</b>`,
      );
    }

    // ── /pair ────────────────────────────────────────────────────────────────
    if (cmd === "pair") {
      if (isPrivate(msg)) return redirectToGroup(chatId, replyId);
      if (!isAllowedGroup(msg)) return;

      if (!args) {
        return safeReply(
          chatId,
          [
            `${E("6233366429882654276")} <b>𝚄𝚜𝚊𝚐𝚎</b>`,
            ``,
            `${E("6233372292513012657")} <code>/pair +917074420859</code>`,
            `${E("6233128651903211734")} <code>/pair 917074420859</code>`,
            ``,
            `${E("6147524086768604985")} <b>𝙸𝚗𝚌𝚕𝚞𝚍𝚎 𝚢𝚘𝚞𝚛 𝚌𝚘𝚞𝚗𝚝𝚛𝚢 𝚌𝚘𝚍𝚎.</b>`,
          ].join("\n"),
          { parse_mode: "HTML", reply_to_message_id: replyId },
        );
      }

      const digits = normalizePhoneNumber(args);
      if (!/^[1-9][0-9]{6,14}$/.test(digits)) {
        return safeReply(
          chatId,
          `<b>✘ 𝙸𝚗𝚟𝚊𝚕𝚒𝚍 𝚗𝚞𝚖𝚋𝚎𝚛. 𝙴𝚡𝚊𝚖𝚙𝚕𝚎:</b> <code>/pair +917074420859</code>`,
          { parse_mode: "HTML", reply_to_message_id: replyId },
        );
      }

      // Rate limit per user
      const userId = msg.from?.id || msg.sender_chat?.id;
      const lastPair = pairCooldown.get(userId) || 0;
      const remaining = PAIR_COOLDOWN_MS - (Date.now() - lastPair);
      if (remaining > 0) {
        return safeReply(
          chatId,
          `<b>❆ 𝙿𝚕𝚎𝚊𝚜𝚎 𝚠𝚊𝚒𝚝 ${Math.ceil(
            remaining / 1000,
          )}𝚜 𝚋𝚎𝚏𝚘𝚛𝚎 𝚛𝚎𝚚𝚞𝚎𝚜𝚝𝚒𝚗𝚐 𝚊𝚗𝚘𝚝𝚑𝚎𝚛 𝚌𝚘𝚍𝚎.</b>`,
          { parse_mode: "HTML", reply_to_message_id: replyId },
        );
      }
      pairCooldown.set(userId, Date.now());

      return doPair(chatId, args, replyId);
    }

    if (cmd === "reactp") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }

      // Parse: /reactp <link> [emoji1 emoji2 emoji3...]
      // Example: /reactp https://whatsapp.com/channel/xxx/645 🍉👀🍉🎀🙂
      const parts = (args || "").trim().split(/\s+/);
      const postLink = parts[0];

      if (!postLink || !postLink.startsWith("https://whatsapp.com/channel/")) {
        return safeReply(
          chatId,
          `❓ <b>${F("Usage:")}</b>\n<code>/reactp https://whatsapp.com/channel/xxx/123 🍉👀🎀</code>\n\n${F("Emojis are optional — random one will be picked.")}`,
          { reply_to_message_id: replyId },
        );
      }

      // Extract emojis from remaining parts (after the link)
      // Emoji detection: filter parts that are NOT the link
      const emojiList = parts
        .slice(1)
        .join("")
        .match(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu) || ["🔥"];

      // Pick random emoji
      const chosenEmoji =
        emojiList[Math.floor(Math.random() * emojiList.length)];

      // Get first connected sock
      const connections = manager.getAllConnections();
      const active = connections.find((c) => c.healthy);
      if (!active) {
        return safeReply(
          chatId,
          `❌ ${F("No active WhatsApp session found.")}`,
          {
            reply_to_message_id: replyId,
          },
        );
      }
      const sock = active.connection;

      await safeReply(
        chatId,
        `⏳ <b>${F("Reacting...")}</b>\n🎲 ${F("Chosen:")} ${chosenEmoji}`,
        { reply_to_message_id: replyId },
      );

      try {
        const msgNumber = parseInt(postLink.split("/").pop());
        const info = await sock.newsletterInfo(postLink);
        const newsletterJid = info.id;

        const msgs = await sock.newsletterFetchMessages(newsletterJid, 20);
        const targetMsg = msgs.find((m) => m.newsletterServerId === msgNumber);

        if (!targetMsg) {
          return safeReply(
            chatId,
            `❌ ${F("Post #")}${msgNumber} ${F("not found in last 20 messages.")}`,
            { reply_to_message_id: replyId },
          );
        }

        await sock.newsletterReactMessage(
          newsletterJid,
          targetMsg.key.id,
          chosenEmoji,
        );

        return safeReply(
          chatId,
          `✅ <b>${F("Reacted!")}</b>\n📌 ${F("Post:")} #${msgNumber}\n🎯 ${F("Emoji:")} ${chosenEmoji}`,
          { reply_to_message_id: replyId },
        );
      } catch (err) {
        return safeReply(
          chatId,
          `❌ <b>${F("Failed:")}</b> <i>${esc(err?.message || String(err))}</i>`,
          { reply_to_message_id: replyId },
        );
      }
    }

    // ── /sessions (admin only) ────────────────────────────────────────────────
    if (cmd === "sessions" || cmd === "session") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(
          chatId,
          `🚫 <b>${F("Admins Only")}</b>\n\n${F(
            "This command is restricted to group admins.",
          )}`,
          { reply_to_message_id: replyId },
        );
      }

      const conns = manager.getAllConnections?.() || [];
      if (conns.length === 0) {
        return safeReply(
          chatId,
          `🌙 <b>${F("No Active Sessions")}</b>\n\n${F(
            "No sessions are currently registered.",
          )}`,
          { reply_to_message_id: replyId },
        );
      }

      const connected = conns.filter((c) => c.healthy).length;
      const disconnected = conns.length - connected;

      let text = [
        `   🧩 ${F("SESSION OVERVIEW")}`,
        ``,
        `📊 Total: <b>${conns.length}</b>  🟢 Online: <b>${connected}</b>  🔴 Offline: <b>${disconnected}</b>`,
        ``,
      ].join("\n");

      conns.forEach((c, i) => {
        const sid = c.sessionId || c.file_path || c.id || "unknown";
        // Display the phone number, not the raw phone_randomId sessionId —
        // the random suffix is only an internal collision-avoidance detail.
        const phone = phoneFromSid(sid);
        const user =
          c.connection?.user?.name ||
          c.connection?.user?.id?.split(":")?.[0] ||
          "—";
        const dot = c.healthy ? "🟢" : "🔴";
        const stat = c.status || (c.healthy ? "connected" : "disconnected");
        text += `${dot} <b>${i + 1}.</b> <code>${esc(phone)}</code>\n`;
        text += `    👤 ${esc(user)} · <i>${stat}</i>\n\n`;
      });

      return safeReply(chatId, text, {
        reply_to_message_id: replyId,
        disable_web_page_preview: true,
      });
    }

    // ── /status (admin only) ──────────────────────────────────────────────────
    if (cmd === "status") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }

      const conns = manager.getAllConnections?.() || [];
      const online = conns.filter((c) => c.healthy).length;
      const upSec = Math.floor(process.uptime());
      const uptimeFmt = `${Math.floor(upSec / 3600)}h ${Math.floor(
        (upSec % 3600) / 60,
      )}m ${upSec % 60}s`;
      const memMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

      return safeReply(
        chatId,
        [
          `${E("6231089190977673116")} <b>𝖡𝖮𝖳 𝖲𝖳𝖠𝖳𝖴𝖲</b>`,
          ``,
          `${E("6242308461598610637")} ${F("Uptime:")}     <code>${uptimeFmt}</code>`,
          `${E("6244492465353529537")} ${F("Memory:")}    <code>${memMb} MB</code>`,
          `${E("6235567682226230771")} ${F("Sessions:")}  <b>${conns.length}</b> (${online} 🟢)`,
          `${E("6233013894672028131")} ${F("Platform:")}  <code>${process.platform}</code>`,
          `${E("6233098956499326729")} ${F("Node.js:")}   <code>${process.version}</code>`,
        ].join("\n"),
        { reply_to_message_id: replyId },
      );
    }

    // ── /stop (admin only) ────────────────────────────────────────────────────
    if (cmd === "stop") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }
      const phone = (args || "").replace(/\D/g, "");
      if (!phone) {
        return safeReply(
          chatId,
          `❓ ${F("Usage:")} <code>/stop 91XXXXXXXXXX</code>`,
          { reply_to_message_id: replyId },
        );
      }
      const sid = await manager.findSessionIdByPhone(phone);
      if (!sid) {
        return safeReply(
          chatId,
          `❌ ${F("No paired session found for")} <code>${esc(phone)}</code>`,
          { reply_to_message_id: replyId },
        );
      }
      try {
        await manager.stop(sid);
        return safeReply(
          chatId,
          `⏹️ <b>${F("Session Stopped")}</b>\n\n📱 <code>${esc(
            phone,
          )}</code>\n\n<i>Credentials kept. Use /restart to reconnect.</i>`,
          { reply_to_message_id: replyId },
        );
      } catch (e) {
        return safeReply(
          chatId,
          `❌ ${F("Stop failed:")} <i>${esc(e?.message)}</i>`,
          { reply_to_message_id: replyId },
        );
      }
    }

    // ── /logout (admin only) ──────────────────────────────────────────────────
    if (cmd === "logout") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }
      const phone = (args || "").replace(/\D/g, "");
      if (!phone) {
        return safeReply(
          chatId,
          `❓ ${F("Usage:")} <code>/logout 91XXXXXXXXXX</code>`,
          { reply_to_message_id: replyId },
        );
      }
      const sid = await manager.findSessionIdByPhone(phone);
      if (!sid) {
        return safeReply(
          chatId,
          `❌ ${F("No paired session found for")} <code>${esc(phone)}</code>`,
          { reply_to_message_id: replyId },
        );
      }
      try {
        await manager.logout(sid);
        return safeReply(
          chatId,
          `🗑️ <b>${F("Session Logged Out")}</b>\n\n📱 <code>${esc(
            phone,
          )}</code>\n\n<i>Credentials deleted. User must pair again.</i>`,
          { reply_to_message_id: replyId },
        );
      } catch (e) {
        return safeReply(
          chatId,
          `❌ ${F("Logout failed:")} <i>${esc(e?.message)}</i>`,
          { reply_to_message_id: replyId },
        );
      }
    }

    // ── /restart (admin only) ─────────────────────────────────────────────────
    if (cmd === "restart") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }
      const phone = (args || "").replace(/\D/g, "");
      if (!phone) {
        return safeReply(
          chatId,
          `❓ ${F("Usage:")} <code>/restart 91XXXXXXXXXX</code>`,
          { reply_to_message_id: replyId },
        );
      }
      const sid = await manager.findSessionIdByPhone(phone);
      if (!sid) {
        return safeReply(
          chatId,
          `❌ ${F("No paired session found for")} <code>${esc(phone)}</code>`,
          { reply_to_message_id: replyId },
        );
      }
      try {
        await manager.stop(sid);
        await new Promise((r) => setTimeout(r, 1500));
        await manager.start(sid);
        return safeReply(
          chatId,
          `🔄 <b>${F("Session Restarted")}</b>\n\n📱 <code>${esc(phone)}</code>`,
          { reply_to_message_id: replyId },
        );
      } catch (e) {
        return safeReply(
          chatId,
          `❌ ${F("Restart failed:")} <i>${esc(e?.message)}</i>`,
          { reply_to_message_id: replyId },
        );
      }
    }

    // ── /d — shell command (admin only) ──────────────────────────────────────
    // ⚠️ SECURITY NOTE (not fixed here, flagging only): this executes
    // arbitrary shell commands on the host for any group admin. Same for
    // /s and /as running arbitrary JS against a live socket. These are
    // powerful by design for your own control bot, but if this group's
    // admin list ever includes anyone you don't fully trust, this is a
    // full remote-code-execution surface. Worth restricting to a specific
    // allow-listed Telegram user ID rather than "any group admin" if this
    // bot is ever used somewhere less trusted.
    if (cmd === "d") {
      if (!isAllowedGroup(msg)) return;
      if (!(await isAdmin(msg))) {
        return safeReply(chatId, `🚫 <b>${F("Admins Only")}</b>`, {
          reply_to_message_id: replyId,
        });
      }

      const rawCmd = (args || "").trim();
      if (!rawCmd) {
        return safeReply(
          chatId,
          `ℹ️ <b>${F(
            "Usage",
          )}</b>\n<code>/d git pull</code>\n<code>/d pm2 list</code>\n<code>/d df -h</code>`,
          { reply_to_message_id: replyId },
        );
      }

      const MAX_LINES = 50;
      const TIMEOUT_MS = 30_000;
      const MAX_TEXT_CHARS = 1800;

      await safeReply(
        chatId,
        `⚙️ <b>${F("Executing...")}</b>\n<code>${esc(rawCmd)}</code>`,
        { reply_to_message_id: replyId },
      );

      const lines = [];
      let killed = false;
      const child = spawn("bash", ["-lc", rawCmd], { env: process.env });
      const killTimer = setTimeout(() => {
        killed = true;
        try {
          child.kill("SIGKILL");
        } catch {}
      }, TIMEOUT_MS);

      const pushLines = (chunk, src) => {
        chunk
          .toString()
          .split(/\r?\n/)
          .forEach((ln) => {
            if (ln && lines.length < MAX_LINES)
              lines.push(src === "err" ? `[ERR] ${ln}` : ln);
          });
      };

      child.stdout.on("data", (c) => pushLines(c, "out"));
      child.stderr.on("data", (c) => pushLines(c, "err"));

      child.on("error", async (err) => {
        clearTimeout(killTimer);
        await safeReply(
          chatId,
          `❌ ${F("Spawn error:")} ${esc(String(err.message))}`,
          { reply_to_message_id: replyId },
        );
      });

      child.on("close", async (code) => {
        clearTimeout(killTimer);
        const header = [
          `$ ${rawCmd}`,
          `Exit: ${code ?? "null"}${killed ? " (killed — timeout)" : ""}`,
          "─".repeat(30),
        ].join("\n");

        const payload = (header + "\n" + lines.join("\n")).trim();
        if (!payload || lines.length === 0) {
          return safeReply(chatId, `⚠️ ${F("No output produced.")}`, {
            reply_to_message_id: replyId,
          });
        }

        if (payload.length > MAX_TEXT_CHARS || lines.length >= MAX_LINES) {
          // Send as file
          const tmpPath = path.join(os.tmpdir(), `cmd_${Date.now()}.txt`);
          try {
            await fs.promises.writeFile(tmpPath, payload, "utf8");
            await sendMediaWithEmoji("sendDocument", chatId, tmpPath, {
              caption: `📄 <code>${esc(rawCmd)}</code> · exit <b>${code}</b>`,
              parse_mode: "HTML",
              reply_to_message_id: replyId,
            });
          } catch (e) {
            await safeReply(
              chatId,
              `⚠️ ${F("Output preview:")}\n<code>${esc(
                payload.slice(0, 1500),
              )}</code>`,
              { reply_to_message_id: replyId },
            );
          } finally {
            fs.promises.unlink(tmpPath).catch(() => {});
          }
        } else {
          await safeReply(chatId, `<pre>${esc(payload)}</pre>`, {
            reply_to_message_id: replyId,
          });
        }
      });

      return;
    }

    // ── Unknown command fallback ──────────────────────────────────────────────
    if (isAllowedGroup(msg)) {
      return safeReply(
        chatId,
        `💢 ${F("Unknown command:")} <code>/${esc(cmd)}</code>\n\n${F(
          "Try",
        )} <code>/help</code> ${F("to see available commands.")}`,
        { reply_to_message_id: replyId },
      );
    }
  }

  // ── Callback query handler (Pair Again button) ──────────────────────────────
  tbot.on("callback_query", async (query) => {
    const { data, id, message } = query;
    const chatId = message?.chat?.id;

    try {
      await tbot.answerCallbackQuery(id).catch(() => {});

      if (!data || !chatId) return;

      // Pair Again: data = "repairr:DIGITS"
      if (data.startsWith("repairr:")) {
        const digits = data.split(":")[1];
        if (!digits) return;

        // Rate limit for callback re-pair too
        const userId = query.from?.id;
        const lastPair = pairCooldown.get(userId) || 0;
        const remaining = PAIR_COOLDOWN_MS - (Date.now() - lastPair);
        if (remaining > 0) {
          return tbot
            .answerCallbackQuery(id, {
              text: `⏳ Please wait ${Math.ceil(
                remaining / 1000,
              )}s before re-pairing.`,
              show_alert: true,
            })
            .catch(() => {});
        }
        pairCooldown.set(userId, Date.now());

        return doPair(chatId, `+${digits}`, message?.message_id);
      }

      if (data === "help" && (isPrivate(message) || isAllowedGroup(message))) {
        return safeReply(chatId, buildHelpMessage(), {
          reply_to_message_id: message.message_id,
          reply_markup: buildHelpKeyboard(),
        });
      }

      if (
        data === "pair_help" &&
        (isPrivate(message) || isAllowedGroup(message))
      ) {
        return safeReply(
          chatId,
          [
            `${E("6242308461598610637", "📲")} <b>${F("Pair a WhatsApp account")}</b>`,
            ``,
            `${F("Send this command in the official group:")}`,
            `<code>/pair +CCXXXXXXXXXX</code>`,
            ``,
            `<i>${F("Replace CCXXXXXXXXXX with your full number, including the country code. The linking code expires after a few minutes.")}</i>`,
          ].join("\n"),
          {
            reply_to_message_id: message.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: "Join official group", url: GROUP_INVITE_LINK }],
              ],
            },
          },
        );
      }
    } catch (e) {
      console.error("[bot.js] callback_query error:", e);
    }
  });

  // ── Single unified message handler ───────────────────────────────────────────
  tbot.on("message", async (msg) => {
    // Log every message (dev-friendly)
    try {
      const sender =
        msg.from?.username || msg.from?.id || msg.sender_chat?.id || "?";
      console.log(
        `[bot.js] 📩 [${msg.chat?.id}/${msg.chat?.type}] @${sender}: ${(
          msg.text || ""
        ).slice(0, 120)}`,
      );
    } catch {}

    // Handle command
    try {
      await handleCommand(msg);
    } catch (e) {
      console.error("[bot.js] handleCommand error:", e);
    }
  });

  // ── Webhook setup ────────────────────────────────────────────────────────────
  if (USE_WEBHOOK) {
    try {
      const hookPath = `/bot${BOT_TOKEN}`;
      const webhookUrl = `${RAILWAY_URL.replace(/\/$/, "")}${hookPath}`;
      await tbot.setWebHook(webhookUrl);
      console.log("[bot.js] ✅ Webhook set:", webhookUrl);
      const info = await tbot.getWebHookInfo();
      console.log(
        "[bot.js] 🔎 Webhook info:",
        info.url,
        info.last_error_message || "ok",
      );
    } catch (e) {
      console.error("[bot.js] Webhook setup failed:", e?.message);
    }
  } else {
    console.log("[bot.js] ℹ️  Polling mode (dev).");
  }

  // Expose cleanup for graceful shutdown in app.js
  tbot.cleanup = async () => {
    try {
      clearInterval(cooldownSweepTimer);
      if (USE_WEBHOOK) await tbot.deleteWebHook().catch(() => {});
      else await tbot.stopPolling().catch(() => {});
      console.log("[bot.js] 🛑 Telegram bot stopped.");
    } catch (e) {
      /* ignore */
    }
  };

  try {
    global.tbot = tbot;
  } catch {}
  return tbot;
}
