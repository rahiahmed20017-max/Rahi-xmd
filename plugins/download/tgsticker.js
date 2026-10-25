import * as baileys from "@whiskeysockets/baileys";
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
import { getMediaKeys } from "@whiskeysockets/baileys/lib/Utils/messages-media.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import AdmZip from "adm-zip";
import { fileURLToPath } from "url";

import config from "../../config.js";
import stickerLib from "../../lib/sticker.js";
import { Module } from "../../lib/plugins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────
//  Register custom Baileys media types
// ─────────────────────────────────────────────
const { MEDIA_PATH_MAP, MEDIA_HKDF_KEY_MAPPING } = baileys;
if (MEDIA_PATH_MAP && MEDIA_HKDF_KEY_MAPPING) {
  MEDIA_PATH_MAP["sticker-pack"] = "/mms/sticker-pack";
  MEDIA_HKDF_KEY_MAPPING["sticker-pack"] = "Sticker Pack";
  MEDIA_PATH_MAP["thumbnail-sticker-pack"] = "/mms/document";
  MEDIA_HKDF_KEY_MAPPING["thumbnail-sticker-pack"] = "Sticker Pack Thumbnail";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeUnlink = (p) => {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
};

const TEMP_DIR = path.join(__dirname, "../temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─────────────────────────────────────────────
//  Telegram token (auto-clean "bot" prefix / spaces)
// ─────────────────────────────────────────────
const getTgToken = () =>
  String(config.TGTOKEN || "")
    .trim()
    .replace(/^bot/i, "");

const tgErr = (e) =>
  e.response?.data?.description || e.message || "Unknown error";

// ─────────────────────────────────────────────
//  Link parser (addstickers + addemoji detect)
// ─────────────────────────────────────────────
function parsePackName(link) {
  if (/\/addemoji\//i.test(link)) return { emoji: true };
  const m =
    link.match(/(?:t\.me|telegram\.me)\/addstickers\/([A-Za-z0-9_]+)/i) ||
    link.match(/^([A-Za-z0-9_]{3,})$/); // plain pack name bhi chalbe
  return { name: m?.[1] || null };
}

// ─────────────────────────────────────────────
//  ENCRYPT HELPER
// ─────────────────────────────────────────────
async function encryptMedia(buffer, mediaKey, mediaType) {
  const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, mediaType);
  const aes = crypto.createCipheriv("aes-256-cbc", cipherKey, iv);
  const hmac = crypto.createHmac("sha256", macKey).update(iv);
  const encFile = Buffer.concat([aes.update(buffer), aes.final()]);
  hmac.update(encFile);
  const mac = hmac.digest().slice(0, 10);
  const finalEncFile = Buffer.concat([encFile, mac]);
  const fileSha256 = crypto.createHash("sha256").update(buffer).digest();
  const fileEncSha256 = crypto
    .createHash("sha256")
    .update(finalEncFile)
    .digest();
  return { encFile: finalEncFile, fileSha256, fileEncSha256 };
}

// ─────────────────────────────────────────────
//  Telegram download with retry
// ─────────────────────────────────────────────
async function tgDownloadFile(fileId, retries = 3) {
  const token = getTgToken();
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const fileRes = await axios.get(
        `https://api.telegram.org/bot${token}/getFile`,
        { params: { file_id: fileId }, timeout: 30000 },
      );
      const fp = fileRes.data?.result?.file_path;
      if (!fp) throw new Error("No file_path from Telegram");

      const { data } = await axios({
        url: `https://api.telegram.org/file/bot${token}/${fp}`,
        method: "GET",
        responseType: "arraybuffer",
        timeout: 60000,
      });
      return Buffer.from(data);
    } catch (e) {
      lastErr = e;
      if (e.response?.status === 429 && i < retries - 1) {
        const wait = (e.response.data?.parameters?.retry_after || 5) * 1000;
        console.log(`[TGS] Rate limited — waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (i < retries - 1) await sleep(1000 * (i + 1));
    }
  }
  throw new Error(tgErr(lastErr));
}

// ─────────────────────────────────────────────
//  Static image → WebP (with EXIF)
// ─────────────────────────────────────────────
async function normalizeToWebp(mediaBuffer, index, exifData) {
  try {
    return await stickerLib.toSticker("image", mediaBuffer, exifData);
  } catch {
    console.error(
      `[TGS-PACK] sticker#${index} stickerLib failed → sharp fallback`,
    );
    try {
      return await sharp(mediaBuffer)
        .resize(512, 512, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      console.error(`[TGS-PACK] sticker#${index} sharp also failed → skip`);
      return null;
    }
  }
}

// ─────────────────────────────────────────────
//  Tray icon
// ─────────────────────────────────────────────
async function generateTrayIcon(webpBuffers) {
  for (let i = 0; i < webpBuffers.length; i++) {
    try {
      return await sharp(webpBuffers[i])
        .resize(96, 96, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    } catch (e) {
      console.error(`[TGS-PACK] tray gen failed on sticker#${i}: ${e.message}`);
    }
  }
  return await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

// ─────────────────────────────────────────────
//  BUILD + SEND STICKER PACK (auto cleanup)
// ─────────────────────────────────────────────
async function buildAndSendStickerPack(
  sock,
  from,
  webpBuffers,
  packName,
  packPublisher,
  packId,
) {
  const tempBase = path.join(TEMP_DIR, `tgspack_${Date.now()}_${packId}`);
  const trayName = `${packId}.png`;
  const tempZipPath = `${tempBase}.wastickers`;

  const cleanupFiles = [
    tempZipPath,
    `${tempBase}_contents.json`,
    `${tempBase}_tray.png`,
    `${tempBase}_zip_enc.tmp`,
    `${tempBase}_thumb_enc.tmp`,
  ];

  try {
    const trayPngBuffer = await generateTrayIcon(webpBuffers);

    const stickersForJson = [];
    const finalStickersMetadata = [];
    const webpPaths = [];

    for (let i = 0; i < webpBuffers.length; i++) {
      const hash = crypto
        .createHash("sha256")
        .update(webpBuffers[i])
        .digest("base64")
        .replace(/\//g, "_")
        .replace(/\+/g, "-")
        .replace(/=/g, "");
      const webpName = `${hash}.webp`;
      const webpPath = `${tempBase}_${i}.webp`;
      fs.writeFileSync(webpPath, webpBuffers[i]);
      webpPaths.push({ webpPath, webpName });
      cleanupFiles.push(webpPath);

      stickersForJson.push({ image_file: webpName, emojis: [""] });
      finalStickersMetadata.push({
        fileName: webpName,
        mimetype: "image/webp",
        isAnimated: false,
        accessibilityLabel: "",
        isLottie: false,
        emojis: [""],
      });
    }

    const contentsJson = {
      android_play_store_link: "",
      ios_app_store_link: "",
      publisher_email: "",
      publisher_website: "",
      privacy_policy_website: "",
      license_agreement_website: "",
      image_data_version: "1",
      avoid_cache: false,
      animated_sticker_pack: false,
      identifier: packId,
      name: packName,
      publisher: packPublisher,
      tray_image_file: trayName,
      stickers: stickersForJson,
    };

    const tempContents = `${tempBase}_contents.json`;
    const tempTray = `${tempBase}_tray.png`;
    fs.writeFileSync(tempContents, JSON.stringify(contentsJson));
    fs.writeFileSync(tempTray, trayPngBuffer);

    const zip = new AdmZip();
    zip.addFile("contents.json", fs.readFileSync(tempContents));
    zip.addFile(trayName, fs.readFileSync(tempTray));
    for (const { webpPath, webpName } of webpPaths) {
      zip.addFile(webpName, fs.readFileSync(webpPath));
    }
    zip.writeZip(tempZipPath);

    const zipBuffer = fs.readFileSync(tempZipPath);
    const zipMediaKey = crypto.randomBytes(32);
    const zipEnc = await encryptMedia(zipBuffer, zipMediaKey, "sticker-pack");

    const tempEncZip = `${tempBase}_zip_enc.tmp`;
    fs.writeFileSync(tempEncZip, zipEnc.encFile);
    let zipUpload;
    try {
      zipUpload = await sock.waUploadToServer(tempEncZip, {
        mediaType: "sticker-pack",
        fileEncSha256B64: zipEnc.fileEncSha256.toString("base64"),
      });
    } finally {
      safeUnlink(tempEncZip);
    }

    const thumbEnc = await encryptMedia(
      trayPngBuffer,
      zipMediaKey,
      "thumbnail-sticker-pack",
    );
    const tempEncThumb = `${tempBase}_thumb_enc.tmp`;
    fs.writeFileSync(tempEncThumb, thumbEnc.encFile);
    let thumbUpload;
    try {
      thumbUpload = await sock.waUploadToServer(tempEncThumb, {
        mediaType: "thumbnail-sticker-pack",
        fileEncSha256B64: thumbEnc.fileEncSha256.toString("base64"),
      });
    } finally {
      safeUnlink(tempEncThumb);
    }

    const imageDataHash = crypto
      .createHash("sha256")
      .update(Buffer.concat(webpBuffers))
      .digest("base64");

    const msgContent = {
      stickerPackMessage: {
        stickerPackId: packId,
        name: packName,
        publisher: packPublisher,
        stickers: finalStickersMetadata,
        trayIconFileName: trayName,
        fileSha256: zipEnc.fileSha256,
        fileEncSha256: zipEnc.fileEncSha256,
        mediaKey: zipMediaKey,
        fileLength: zipEnc.encFile.length,
        directPath: zipUpload.directPath,
        stickerPackSize: zipBuffer.length,
        stickerPackOrigin: 2,
        mediaKeyTimestamp: Math.floor(Date.now() / 1000),
        imageDataHash,
        thumbnailDirectPath: thumbUpload.directPath,
        thumbnailSha256: thumbEnc.fileSha256,
        thumbnailEncSha256: thumbEnc.fileEncSha256,
        thumbnailHeight: 96,
        thumbnailWidth: 96,
      },
    };

    const waMsg = await generateWAMessageFromContent(from, msgContent, {
      userJid: sock.user.id,
    });
    await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
  } finally {
    for (const f of cleanupFiles) safeUnlink(f);
  }
}

// ─────────────────────────────────────────────
//  COMMAND
// ─────────────────────────────────────────────
Module({
  command: "tgsticker",
  aliases: ["tgs", "tg"],
  package: "downloader",
  description: "Download Telegram sticker pack",
})(async (message, match) => {
  const sock = message.conn;
  const from = message.from;
  const react = async (emoji) => {
    try {
      await sock.sendMessage(from, {
        react: { text: emoji, key: message.key },
      });
    } catch {}
  };
  // const isSuperUser = message.isCreator || message.sudo;
  // if (!isSuperUser) return message.send('*This area is reserved for the bot owner only.* 🕷️');
  const botPrefix = message.prefix || ".";

  const token = getTgToken();
  if (!token) {
    await react("❌");
    return message.send(
      "❌ *Telegram Bot Token not configured*\nSet `TGTOKEN` in config.js",
    );
  }

  const args = match ? match.split(/\s+/).filter(Boolean) : [];
  const isPackMode = args.some((a) => /^-{1,2}pack$/i.test(a));
  const link = args
    .filter((a) => !/^-{1,2}pack$/i.test(a))
    .join(" ")
    .trim();

  if (!link) {
    return message.send(
      `🎴 *Telegram Sticker Downloader*

*use 1 — Send 1 by 1:*
\`${botPrefix}tgs https://t.me/addstickers/PackName\`

*use 2 — WhatsApp Sticker Pack:*
\`${botPrefix}tgs -pack https://t.me/addstickers/PackName\`

• Max 120 stickers (1 by 1 mode)
• WhatsApp allows 60 per pack — auto splits
• Supports static + .webm video`,
    );
  }

  const parsed = parsePackName(link);
  if (parsed.emoji) {
    await react("❌");
    return message.send(
      "⚠️ Ei ta *emoji pack* (addemoji). Sudhu sticker pack (addstickers) support kore.",
    );
  }
  const packId = parsed.name;
  if (!packId) {
    await react("❌");
    return message.send(
      "❌ Invalid Telegram link!\nExample: https://t.me/addstickers/PackName",
    );
  }

  try {
    await react("⏳");

    let packRes;
    try {
      packRes = await axios.get(
        `https://api.telegram.org/bot${token}/getStickerSet`,
        { params: { name: packId }, timeout: 30000 },
      );
    } catch (e) {
      const desc = tgErr(e);
      console.error(`[TGS] getStickerSet("${packId}") failed:`, desc);
      await react("❌");
      if (/STICKERSET_INVALID/i.test(desc)) {
        return message.send(
          `❌ Pack not found: \`${packId}\`\nLink ba pack name check koro.`,
        );
      }
      if (/unauthorized|not found/i.test(desc) && e.response?.status !== 400) {
        return message.send("❌ Telegram token invalid. `TGTOKEN` check koro.");
      }
      return message.send(`❌ Telegram error: ${desc}`);
    }

    if (!packRes.data?.ok) {
      await react("❌");
      return message.send("❌ Pack not found. Check the link.");
    }

    const pack = packRes.data.result;
    console.log(
      `[TGS] pack="${pack.title}" total=${pack.stickers.length} video=${pack.is_video} animated=${pack.is_animated}`,
    );

    if (pack.is_animated) {
      await react("❌");
      return message.send(
        "⚠️ Lottie (.tgs) animated not supported.\nStatic and .webm work.",
      );
    }

    const isVideo = pack.is_video;
    const MAX = isPackMode ? Math.min(pack.stickers.length, 300) : 120;
    const stickers = pack.stickers.slice(0, MAX);

    if (isPackMode && pack.stickers.length > 300) {
      await message.send(
        `⚠️ Pack has ${pack.stickers.length} stickers — limiting to 300 (5 packs).`,
      );
    }

    await sock.sendMessage(from, {
      text: `*– ( STICKERS FOUND )*
──────────────𔓕
🍉 *Name:* ${pack.title}
❄️ *Type:* ${isVideo ? "Animated (.webm)" : "Static (.webp)"}
🎐 *Total:* ${stickers.length} stickers
🎋 *Mode:* ${isPackMode ? "WhatsApp Pack" : "Sending 1 by 1"}
${isPackMode && stickers.length > 60 ? `📂 *Packs:* ${Math.ceil(stickers.length / 60)} (60 per pack)` : ""}

> _Downloading Stickers..._`,
    });

    const packname = config.PACK_NAME || "x-miku";
    const packauthor = config.PACK_AUTHOR || "@nightx_rebel";
    const exifData = { packname, author: packauthor, categories: ["💖"] };

    // ── MODE 1: 1 by 1 ──────────────────────────────
    if (!isPackMode) {
      let sent = 0,
        failed = 0;

      for (const s of stickers) {
        try {
          const mediaBuffer = await tgDownloadFile(s.file_id);
          const stickerBuffer = await stickerLib.toSticker(
            isVideo ? "video" : "image",
            mediaBuffer,
            exifData,
          );
          await sock.sendMessage(from, { sticker: stickerBuffer });
          sent++;
        } catch (err) {
          failed++;
          console.error(`[TGS] #${sent + failed} failed:`, err.message);
        }
        await sleep(3500);
      }

      await react("✅");
      return sock.sendMessage(from, {
        text: `✅ *Successfully Done!*\n✔️ Stickers: *${sent}* | ❌ Failed: *${failed}*`,
      });
    }

    // ── MODE 2: WhatsApp Pack ────────────────────────
    const WA_MAX = 60;
    const totalPacks = Math.ceil(stickers.length / WA_MAX);
    let totalSent = 0,
      totalFailed = 0;

    for (let packNum = 0; packNum < totalPacks; packNum++) {
      const chunk = stickers.slice(packNum * WA_MAX, (packNum + 1) * WA_MAX);
      const chunkPackId = crypto.randomUUID();
      const chunkPackName =
        totalPacks > 1
          ? `${packname} (${packNum + 1}/${totalPacks})`
          : packname;

      const webpBuffers = [];

      for (let i = 0; i < chunk.length; i++) {
        try {
          const mediaBuffer = await tgDownloadFile(chunk[i].file_id);

          const webpBuf = isVideo
            ? await stickerLib.toSticker("video", mediaBuffer, exifData)
            : await normalizeToWebp(mediaBuffer, i, exifData);

          if (!webpBuf) {
            totalFailed++;
            continue;
          }

          webpBuffers.push(webpBuf);
          totalSent++;
        } catch (err) {
          totalFailed++;
          console.error(
            `[TGS-PACK] Pack ${packNum + 1} sticker ${i + 1} failed:`,
            err.message,
          );
        }

        if (i < chunk.length - 1) await sleep(800);
      }

      if (!webpBuffers.length) {
        await message.send(
          `⚠️ Pack ${packNum + 1} — all stickers failed, skipping.`,
        );
        continue;
      }

      try {
        await buildAndSendStickerPack(
          sock,
          from,
          webpBuffers,
          chunkPackName,
          packauthor,
          chunkPackId,
        );
      } catch (err) {
        console.error("[TGS-PACK] buildAndSend failed:", err.message);
        await message.send(`❌ Pack ${packNum + 1} failed: ${err.message}`);
      }

      if (packNum < totalPacks - 1) await sleep(3000);
    }

    await react("✅");
    return sock.sendMessage(from, {
      text: `✅ *Successfully Done!*\n✔️ Stickers: *${totalSent}* | ❌ Failed: *${totalFailed}*`,
    });
  } catch (err) {
    console.error("[TGS] ERROR:", err.message);
    await react("❌");
    return message.send(`❌ Error: ${tgErr(err)}`);
  }
});
