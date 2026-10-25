import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { Module } from "../../lib/plugins.js";
import { getTheme } from "../../Themes/themes.js";
import {
  proto as WAProto,
  generateWAMessageContent,
  generateMessageID,
  generateWAMessageFromContent,
} from "@whiskeysockets/baileys";

const theme = getTheme();

const PREFIX = ".";

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 COMPLETE PROTOBUF MONKEY-PATCH: Preserve StatusAudienceMetadata
// (unchanged — same as groupstatus.js)
// ─────────────────────────────────────────────────────────────────────────────
(function patchProtobufForStatusAudienceMetadata() {
  try {
    if (!WAProto || !WAProto.ContextInfo) return;

    if (WAProto.ContextInfo.StatusAudienceMetadata) {
      const SAM = WAProto.ContextInfo.StatusAudienceMetadata;
      if (!SAM._isFullyPatched) {
        const origFromObject = SAM.fromObject;
        SAM.fromObject = function (d) {
          if (d instanceof SAM) return d;
          const m =
            typeof origFromObject === "function"
              ? origFromObject(d)
              : new SAM();
          if (d.audienceType != null) {
            m.audienceType =
              typeof d.audienceType === "number"
                ? d.audienceType
                : d.audienceType === "CLOSE_FRIENDS"
                  ? 1
                  : 2;
          }
          if (d.customName != null) m.customName = String(d.customName);
          if (d.customEmoji != null) m.customEmoji = String(d.customEmoji);
          if (d.groupJid != null) m.groupJid = String(d.groupJid);
          return m;
        };

        SAM.encode = function (m, w) {
          if (!w) {
            const protobuf = require("protobufjs/minimal");
            w = protobuf.Writer.create();
          }
          if (m.audienceType != null) w.uint32(8).int32(m.audienceType);
          if (m.customName != null) w.uint32(18).string(m.customName);
          if (m.customEmoji != null) w.uint32(26).string(m.customEmoji);
          if (m.groupJid != null) w.uint32(34).string(m.groupJid);
          return w;
        };

        SAM.decode = function (r, l) {
          const protobuf = require("protobufjs/minimal");
          if (!(r instanceof protobuf.Reader)) r = protobuf.Reader.create(r);
          const c = l === undefined ? r.len : r.pos + l;
          const m = new SAM();
          while (r.pos < c) {
            const t = r.uint32();
            switch (t >>> 3) {
              case 1:
                m.audienceType = r.int32();
                break;
              case 2:
                m.customName = r.string();
                break;
              case 3:
                m.customEmoji = r.string();
                break;
              case 4:
                m.groupJid = r.string();
                break;
              default:
                r.skipType(t & 7);
                break;
            }
          }
          return m;
        };

        SAM.toObject = function (m) {
          const d = {};
          if (m.audienceType != null) d.audienceType = m.audienceType;
          if (m.customName != null) d.customName = m.customName;
          if (m.customEmoji != null) d.customEmoji = m.customEmoji;
          if (m.groupJid != null) d.groupJid = m.groupJid;
          return d;
        };

        SAM._isFullyPatched = true;
      }
    }
  } catch (e) {
    console.error("[STATUS AUDIENCE PROTO PATCH ERROR]", e.message);
  }
})();

// ── Color / Font / Type constants (unchanged) ─────────────────────────────────
const COLORS = {
  merah: "FF0000",
  hijau: "00FF00",
  biru: "0000FF",
  kuning: "FFFF00",
  hitam: "000000",
  putih: "FFFFFF",
  ungu: "800080",
  pink: "FFC0CB",
  orange: "FFA500",
  cyan: "00FFFF",
  black: "000000",
  white: "FFFFFF",
  red: "FF0000",
  blue: "1DA1F2",
  green: "25D366",
  yellow: "FFD700",
  purple: "7B2CBF",
  gray: "808080",
  navy: "001F5B",
};

const RANDOM_BG_COLORS = [
  0xff7b2cbf, 0xff1d3557, 0xff2b2d42, 0xffd90429, 0xff0077b6, 0xff007f5f,
  0xff5a189a, 0xff6b705c, 0xffe76f51, 0xff2a9d8f, 0xff3d348b, 0xff6a040f,
  0xff3f37c9, 0xff03045e, 0xff1a1a1d,
];

function getRandomArgbColor() {
  return RANDOM_BG_COLORS[Math.floor(Math.random() * RANDOM_BG_COLORS.length)];
}

const FONTS = {
  system: 0,
  sans: 1,
  serif: 2,
  script: 3,
  morning: 4,
  calistoga: 5,
  oswald: 6,
  courier: 7,
};

const TYPE_MAP = {
  audioMessage: "vn",
  videoMessage: "vid",
  imageMessage: "img",
  extendedTextMessage: "txt",
  conversation: "txt",
};

// ── Flag tokenizer / parser ───────────────────────────────────────────────────
// NOTE: no COUNT/GROUPJID parsing here — .allgroupstatus intentionally can NOT
// target a particular group. It always resolves to "every group the bot is in".
function tokenize(input) {
  const tokens = [];
  if (!input) return tokens;

  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === quoteChar) {
        tokens.push(current);
        current = "";
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuotes = true;
        quoteChar = ch;
      } else if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
      } else {
        current += ch;
      }
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseSwgcFlags(rawText) {
  const tokens = tokenize(rawText);
  const result = {
    isSilent: false,
    useLinkPreview: false,
    customLink: null,
    textColor: null,
    bgColor: null,
    textFont: null,
    customName: null,
    customEmoji: null,
    customCaption: null,
    useAiBadge: false,
    delayMs: 1500,
    remaining: [],
  };

  const SILENT_FLAGS = new Set(["--s", "-s", "--silent", "-silent"]);
  const LINK_FLAGS = new Set(["-link", "--link"]);

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const lower = tok.toLowerCase();

    if (SILENT_FLAGS.has(lower)) {
      result.isSilent = true;
      i++;
      continue;
    }
    if (lower === "-ai") {
      result.useAiBadge = true;
      i++;
      continue;
    }

    if (LINK_FLAGS.has(lower)) {
      result.useLinkPreview = true;
      const val = tokens[i + 1];
      if (val && /^https?:\/\//i.test(val)) {
        result.customLink = val;
        i += 2;
      } else i += 1;
      continue;
    }

    if (lower === "-color") {
      const val = tokens[i + 1];
      if (val !== undefined) {
        result.textColor = COLORS[val.toLowerCase()] || val;
        i += 2;
      } else i += 1;
      continue;
    }

    if (lower === "-bg") {
      const val = tokens[i + 1];
      if (val !== undefined) {
        let raw = COLORS[val.toLowerCase()] || val;
        if (
          !raw.startsWith("#") &&
          !raw.startsWith("0x") &&
          !raw.startsWith("0X")
        )
          raw = "#" + raw;
        result.bgColor = raw;
        i += 2;
      } else i += 1;
      continue;
    }

    if (lower === "-font") {
      const val = tokens[i + 1];
      if (val !== undefined) {
        const f =
          FONTS[val.toLowerCase()] !== undefined
            ? FONTS[val.toLowerCase()]
            : parseInt(val, 10);
        result.textFont = isNaN(f) ? null : f;
        i += 2;
      } else i += 1;
      continue;
    }

    if (lower === "-t") {
      const val = tokens[i + 1];
      if (val !== undefined) {
        result.customName = val;
        i += 2;
      } else i += 1;
      continue;
    }

    if (lower === "-e") {
      const val = tokens[i + 1];
      if (val !== undefined) {
        result.customEmoji = val;
        i += 2;
      } else i += 1;
      continue;
    }

    if (lower === "-c") {
      const val = tokens[i + 1];
      if (val !== undefined) {
        result.customCaption = val;
        i += 2;
      } else i += 1;
      continue;
    }

    // NEW: -delay <ms>  → gap between each group send (default 1500ms).
    // Sending too fast to many groups back-to-back risks a WA ban, so allow
    // tuning this instead of hardcoding like the single-group version.
    if (lower === "-delay") {
      const val = tokens[i + 1];
      if (val !== undefined && /^\d+$/.test(val)) {
        result.delayMs = Math.min(Math.max(parseInt(val, 10), 500), 15000);
        i += 2;
      } else i += 1;
      continue;
    }

    // ── Reject any @g.us token — .allgroupstatus can never target one group ──
    if (/@g\.us$/i.test(tok)) {
      i++; // silently drop it, handled with a warning in the handler
      result.rejectedGroupJid = tok;
      continue;
    }
    // Reject a bare "COUNT" leading number too (that pattern belonged to
    // .groupstatus's multi-target mode, meaningless here).
    if (/^\d+$/.test(tok) && i === 0) {
      i++;
      continue;
    }

    result.remaining.push(tok);
    i++;
  }

  return result;
}

function isUnsafeLinkTarget(urlStr) {
  try {
    const u = new URL(urlStr);
    if (!/^https?:$/.test(u.protocol)) return true;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "169.254.169.254"
    )
      return true;
    return false;
  } catch {
    return true;
  }
}

async function fetchLinkPreview(url) {
  try {
    const res = await axios.get(url, {
      timeout: 10_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 WhatsApp/2.23.20.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    const $ = cheerio.load(res.data);
    const title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").text() ||
      "";

    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    let image =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $('meta[property="og:image:secure_url"]').attr("content") ||
      "";

    let jpegThumbnail = null;
    if (image) {
      if (image.startsWith("//")) image = "https:" + image;
      else if (image.startsWith("/")) {
        const u = new URL(url);
        image = `${u.protocol}//${u.host}${image}`;
      }
      try {
        const imgRes = await axios.get(image, {
          responseType: "arraybuffer",
          timeout: 6000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        jpegThumbnail = Buffer.from(imgRes.data);
      } catch (e) {
        console.error("[AGSTATUS] Image thumbnail fetch failed:", e.message);
      }
    }

    return {
      title: title.trim(),
      description: description.trim(),
      canonicalUrl: url,
      matchedText: url,
      jpegThumbnail,
    };
  } catch (err) {
    console.error("[AGSTATUS] Link preview fetch failed:", err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🆕 IMAGE/VIDEO-ONLY SEND PATH (unchanged from groupstatus.js)
// ─────────────────────────────────────────────────────────────────────────────
async function sendGroupStatusMedia(sock, jid, content) {
  const inside = await generateWAMessageContent(content, {
    upload: sock.waUploadToServer,
  });

  const messageSecret = crypto.randomBytes(32);

  const msg = generateWAMessageFromContent(
    jid,
    {
      messageContextInfo: { messageSecret },
      groupStatusMessageV2: {
        message: {
          ...inside,
          messageContextInfo: { messageSecret },
        },
      },
    },
    {},
  );

  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND-LOGIC (groupStatus + sendSuccessConfirmation) — UNCHANGED from
// groupstatus.js, just reused here.
// ─────────────────────────────────────────────────────────────────────────────
async function groupStatus(
  sock,
  jid,
  rawContent,
  useAiBadge = false,
  customName = "x-miku",
  customEmoji = "🍉",
) {
  let waMsgContent;
  const isPreGenerated = !!(
    rawContent.extendedTextMessage ||
    rawContent.imageMessage ||
    rawContent.videoMessage ||
    rawContent.audioMessage
  );

  if (isPreGenerated) {
    waMsgContent = { ...rawContent };
    if (waMsgContent.message) {
      waMsgContent.message = { ...waMsgContent.message };
    }
  } else {
    const content = { ...rawContent };
    const { backgroundColor, textColor, textFont, linkPreview } = content;
    delete content.backgroundColor;
    delete content.textColor;
    delete content.textFont;
    delete content.linkPreview;

    const opts = { upload: sock.waUploadToServer };

    waMsgContent = await generateWAMessageContent(content, opts);
    if (!waMsgContent)
      throw new Error("generateWAMessageContent failed to produce content");

    const innerMsg = waMsgContent.message || waMsgContent;
    if (innerMsg.extendedTextMessage) {
      if (textColor) {
        let hex = String(textColor).replace("#", "");
        if (hex.length === 6) hex = "FF" + hex;
        innerMsg.extendedTextMessage.textArgb = parseInt(hex, 16);
      } else {
        innerMsg.extendedTextMessage.textArgb = 0xffffffff;
      }

      if (backgroundColor) {
        let hex = String(backgroundColor).replace("#", "");
        if (hex.length === 6) hex = "FF" + hex;
        innerMsg.extendedTextMessage.backgroundArgb = parseInt(hex, 16);
      } else {
        innerMsg.extendedTextMessage.backgroundArgb = getRandomArgbColor();
      }

      innerMsg.extendedTextMessage.font =
        textFont !== undefined && textFont !== null ? textFont : 1;

      if (linkPreview) {
        if (linkPreview.title)
          innerMsg.extendedTextMessage.title = linkPreview.title;
        if (linkPreview.description)
          innerMsg.extendedTextMessage.description = linkPreview.description;
        if (linkPreview.canonicalUrl)
          innerMsg.extendedTextMessage.canonicalUrl = linkPreview.canonicalUrl;
        if (linkPreview.matchedText)
          innerMsg.extendedTextMessage.matchedText = linkPreview.matchedText;
        if (linkPreview.jpegThumbnail) {
          innerMsg.extendedTextMessage.jpegThumbnail = Buffer.isBuffer(
            linkPreview.jpegThumbnail,
          )
            ? linkPreview.jpegThumbnail
            : Buffer.from(linkPreview.jpegThumbnail);
        }
        innerMsg.extendedTextMessage.previewType = 0;
      }
    }
  }

  const innerMsg = waMsgContent.message || waMsgContent;
  const msgKey = Object.keys(innerMsg).find(
    (k) =>
      innerMsg[k] &&
      typeof innerMsg[k] === "object" &&
      k !== "messageContextInfo",
  );

  if (msgKey) {
    innerMsg[msgKey] = { ...innerMsg[msgKey] };
    innerMsg[msgKey].contextInfo = { ...(innerMsg[msgKey].contextInfo || {}) };

    innerMsg[msgKey].contextInfo.isGroupStatus = true;
    innerMsg[msgKey].contextInfo.featureEligibilities = {
      canReceiveMultiReact: true,
    };
    innerMsg[msgKey].contextInfo.statusAttributions = [{ type: 10 }];
    innerMsg[msgKey].contextInfo.pairedMediaType = 0;

    if (innerMsg.imageMessage)
      innerMsg[msgKey].contextInfo.statusSourceType = 0;
    else if (innerMsg.videoMessage)
      innerMsg[msgKey].contextInfo.statusSourceType = 1;
    else if (innerMsg.audioMessage)
      innerMsg[msgKey].contextInfo.statusSourceType = 3;
    else if (innerMsg.extendedTextMessage)
      innerMsg[msgKey].contextInfo.statusSourceType = 4;

    innerMsg[msgKey].contextInfo.statusAudienceMetadata = {
      audienceType: 2,
      customName: customName || "x-miku",
      customEmoji: customEmoji || "🍉",
    };
  }

  const finalMsg = {
    senderKeyDistributionMessage: {
      groupId: jid,
      axolotlSenderKeyDistributionMessage: Buffer.from(
        "Mwjhu6XDBBApGiCz3ID71WBT/zyUkiLBlCAdfeVSU1hAs5tqPa+RimyiFCIhBfV5TqdCa4w9ekdTm1BAiUSQa+26MVVXXv7i45SBR3sj",
        "base64",
      ),
    },
    groupStatusMessageV2: { message: innerMsg },
  };

  const messageId = generateMessageID();
  const relayOpts = {
    messageId,
    additionalNodes: [{ tag: "meta", attrs: { is_group_status: "true" } }],
  };

  if (useAiBadge) {
    relayOpts.additionalNodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
  }

  await sock.relayMessage(jid, finalMsg, relayOpts);
}

async function sendSuccessConfirmation(
  sock,
  from,
  rawKey,
  mediaType,
  botName = "x-miku",
  totalGroups = 0,
  failedGroups = 0,
) {
  try {
    const typeLabel =
      mediaType === "img"
        ? "Image"
        : mediaType === "vid"
          ? "Video"
          : mediaType === "vn"
            ? "Audio"
            : "Text";
    const okCount = totalGroups - failedGroups;

    // NOTE: confirmation card content updated to show ALL-GROUPS summary
    // (total/ok/failed) instead of a single participant count.
    const statusText = `> 📢 *A L L - G R O U P   S T A T U S   S E N T*
> ​ㅤ
> 📊 *Type:* _${typeLabel}_
> ​ㅤ
> 🗂️ *Groups Targeted:* _${totalGroups}_
> ✅ *Sent:* _${okCount}_
> ❌ *Failed:* _${failedGroups}_
> ​ㅤ
> ✨ *Story:* _Published to all groups!_`.trim();

    const interactiveContent = {
      body: { text: statusText },
      footer: { text: `${botName} • Status Info` },
      nativeFlowMessage: {
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "done",
              copy_code: "done",
            }),
          },
        ],
      },
    };

    const msgContent = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: interactiveContent,
        },
      },
    };

    const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
    const fullMsg = generateWAMessageFromContent(from, msgContent, { userJid });

    const ifPath =
      fullMsg.message?.viewOnceMessage?.message?.interactiveMessage;
    if (ifPath) {
      ifPath.contextInfo = {
        ...(ifPath.contextInfo || {}),
        isForwarded: false,
        forwardingScore: 999,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363424708206436@newsletter",
          serverMessageId: 1,
          newsletterName: botName,
        },
      };
    }

    const additionalNodes = [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { v: "1", type: "native_flow" },
            content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
          },
        ],
      },
    ];

    await sock.relayMessage(from, fullMsg.message, {
      messageId: fullMsg.key.id,
      additionalNodes,
    });
  } catch (err) {
    console.error("[AGSTATUS CONFIRMATION ERROR]", err.message);
    try {
      if (rawKey)
        await sock.sendMessage(from, { react: { text: "✅", key: rawKey } });
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// END SEND-LOGIC — command wiring below.
// ─────────────────────────────────────────────────────────────────────────────

const HELP_TEXT = (prefix) =>
  `*📝 HOW TO USE (.allgroupstatus):*
> Sends the SAME status to *EVERY group the bot is in* — you can NOT pick a single group here.
> ​ㅤ
> 1. Send or pick a message *text/image/video/voice*
> 2. Reply to that message with \`${prefix}allgroupstatus\`

*⚙️ GLOBAL FLAGS - ALL TYPES*
> \`--s\` / \`-s\` / \`--silent\` *- Silent mode, no per-group notification / progress*
> \`-ai\` *- Add AI badge*
> \`-t "Name"\` *- Custom author name*
> \`-e "Emoji"\` *- Custom author emoji*
> \`-c "Caption"\` *- Custom caption for all except audio*
> \`-delay [ms]\` *- Gap between each group send (default 1500ms, min 500, max 15000)*

*🎨 TEXT ONLY FLAGS*
> \`-link [URL]\` / \`--link [URL]\` *- Force link preview*
> \`-color [hex/name]\` *- Text color*
> \`-bg [hex/name]\` *- Background color*
> \`-font [0-7]\` *- Change text font*

*💡 INFO*
> ℹ️ Any \`...@g.us\` you type is ignored — this command always targets ALL groups, never one specific group. Use \`${prefix}groupstatus\` for a single/target group instead.
> ​ㅤ
> ℹ️ *Quotes:* Use quotes for spaces: \`${prefix}allgroupstatus Hello -t "mybot"\`
> ​ㅤ
> ℹ️ *Combo:* \`${prefix}allgroupstatus -c "join" -e "🌷" -t "mybot" -ai --s -delay 2000 https://example.com\``;

Module({
  command: "allgroupstatus",
  package: "group",
  aliases: ["allgst", "swagc"],
  description:
    "Send Group Status V2 to ALL groups the bot is in (reply to media or text)",
})(async (message, match) => {
  if (!message.isfromMe) return message.send(theme.isfromMe);
  const sock = message.conn;
  let flags;

  try {
    flags = parseSwgcFlags(match || "");
    const isSilent = flags.isSilent;
    const customName = flags.customName || "x-miku";
    const customEmoji = flags.customEmoji || "🕷️";
    const useAiBadge = flags.useAiBadge;
    const delayMs = flags.delayMs;

    const cleanArgs = flags.remaining.join(" ").trim();

    const quotedMsg = message.quoted || null;
    const mtype = quotedMsg?.type || null;
    const type = quotedMsg ? TYPE_MAP[mtype] || "txt" : "txt";

    if (!quotedMsg && !cleanArgs && !flags.customCaption && !flags.customLink) {
      if (!isSilent) await message.send(HELP_TEXT(PREFIX));
      return;
    }

    // ── Resolve ALL groups the bot participates in ──────────────────────────
    // This replaces .groupstatus's COUNT/GROUPJID targeting entirely: there is
    // no way here to aim at one particular group by design.
    let allGroups;
    try {
      allGroups = await sock.groupFetchAllParticipating();
    } catch (e) {
      throw new Error("Could not fetch group list: " + e.message);
    }

    const groupJids = Object.keys(allGroups || {});
    if (!groupJids.length) {
      if (!isSilent) return message.send("⚠️ *Bot is not in any groups!*");
      return;
    }

    if (flags.rejectedGroupJid) {
      if (!isSilent) {
        await message.send(
          `ℹ️ *Ignored \`${flags.rejectedGroupJid}\`* — this command always targets ALL groups, you can't pick one.`,
        );
      }
    }

    let captionText = "";
    if (flags.customCaption) {
      captionText = flags.customCaption;
    } else if (quotedMsg) {
      captionText = quotedMsg.body || quotedMsg.msg?.caption || "";
    } else {
      captionText = cleanArgs;
    }

    const doc = {};

    if (type === "txt") {
      doc.text = captionText || "";

      const urlRegex = /https?:\/\/[^\s]+/i;
      const autoDetectedUrl = (captionText || "").match(urlRegex)?.[0] || null;
      const shouldPreview =
        flags.useLinkPreview || !!flags.customLink || !!autoDetectedUrl;

      if (shouldPreview) {
        let targetUrl = flags.customLink || autoDetectedUrl;
        if (targetUrl && !isUnsafeLinkTarget(targetUrl)) {
          if (!doc.text) doc.text = targetUrl;
          else if (!doc.text.includes(targetUrl))
            doc.text = `${doc.text}\n${targetUrl}`;

          const preview = await fetchLinkPreview(targetUrl);
          if (preview) doc.linkPreview = preview;
        }
      }

      if (!doc.text) doc.text = "(empty)";

      if (flags.textColor) doc.textColor = flags.textColor;
      if (flags.bgColor) doc.backgroundColor = flags.bgColor;
      if (flags.textFont !== null) doc.textFont = flags.textFont;
    } else {
      if (!isSilent) {
        try {
          await message.react("⏳");
        } catch {}
      }

      const buffer = await quotedMsg.download();
      if (!buffer) {
        throw new Error("Failed to download the replied media.");
      }

      if (type === "img") {
        doc.image = buffer;
        if (captionText) doc.caption = captionText;
      } else if (type === "vid") {
        doc.video = buffer;
        if (captionText) doc.caption = captionText;
      } else if (type === "vn") {
        doc.audio = buffer;
        doc.mimetype = "audio/mp4";
        doc.ptt = true;
      }
    }

    const useMediaPath = type === "img" || type === "vid";

    // ── Media must be built ONCE and reused across every group ──────────────
    // (uploading the same buffer per-group every loop would be wasteful and
    // slow for large group counts, so pre-upload for the media path.)
    let preUploadedMediaContent = null;
    if (useMediaPath) {
      preUploadedMediaContent = await generateWAMessageContent(doc, {
        upload: sock.waUploadToServer,
      });
    }

    if (!isSilent) {
      await message.send(
        `🚀 *Starting broadcast to ${groupJids.length} group(s)...*`,
      );
    }

    let failedCount = 0;

    for (let i = 0; i < groupJids.length; i++) {
      const jid = groupJids[i];
      try {
        if (useMediaPath) {
          const messageSecret = crypto.randomBytes(32);
          const msg = generateWAMessageFromContent(
            jid,
            {
              messageContextInfo: { messageSecret },
              groupStatusMessageV2: {
                message: {
                  ...preUploadedMediaContent,
                  messageContextInfo: { messageSecret },
                },
              },
            },
            {},
          );
          await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
        } else {
          await groupStatus(
            sock,
            jid,
            doc,
            useAiBadge,
            customName,
            customEmoji,
          );
        }
      } catch (e) {
        failedCount++;
        console.error(`[ALLGROUPSTATUS ERROR] jid=${jid}:`, e.message);
      }

      if (i < groupJids.length - 1)
        await new Promise((r) => setTimeout(r, delayMs));
    }

    if (!isSilent) {
      await message.react(failedCount === groupJids.length ? "❌" : "✅");
      await sendSuccessConfirmation(
        sock,
        message.from,
        message.raw?.key,
        type,
        customName,
        groupJids.length,
        failedCount,
      );
    }
  } catch (err) {
    console.error("[ALLGROUPSTATUS ERROR]", err);
    if (!flags?.isSilent) {
      await message.react("❌");
      await message.send(
        `❌ *Failed to send all-group status:* ${err.message}`,
      );
    }
  }
});
