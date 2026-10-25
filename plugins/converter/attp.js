import fs from "fs";
import path from "path";
import os from "os";
import webp from "node-webpmux";
import { Module } from "../../lib/plugins.js";
import config from "../../config.js";

// ─── Helper: inject EXIF metadata (sticker pack/author watermark) ────────────
async function addMetadata(webpFilePath, packName, authorName) {
  try {
    const img = new webp.Image();
    await img.load(webpFilePath);

    const exifJSON = {
      "sticker-pack-id": "x-miku-sticker",
      "sticker-pack-name": packName || "User",
      "sticker-author-name": authorName || "Bot",
      emojis: ["🌈", "✨"],
    };

    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    const jsonBuff = Buffer.from(JSON.stringify(exifJSON), "utf-8");
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    img.exif = exif;
    await img.save(webpFilePath);
  } catch (error) {
    console.error("Failed to add EXIF metadata:", error);
  }
}

// ─── Helper: ultra-stable ATTP fetcher (with static fallback) ────────────────
async function getAttpBuffer(text) {
  const encodedText = encodeURIComponent(text);

  const apis = [
    `https://api.vreden.web.id/api/maker/attp?text=${encodedText}`,
    `https://api.botcahx.eu.org/api/maker/attp?text=${encodedText}`,
    `https://api.erdwpe.com/api/maker/attp?text=${encodedText}`,
    `https://api.helv.io/attp?text=${encodedText}&format=webp`,
  ];

  const fetchOptions = {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  };

  for (const url of apis) {
    try {
      const response = await fetch(url, fetchOptions);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.includes("text/html")) {
          return Buffer.from(await response.arrayBuffer());
        }
      }
    } catch {
      console.log("[ATTP] API Offline/Blocked -> Skipped");
    }
  }

  // Ultimate fallback: generate a colorful static WebP if every animated API is down
  console.log(
    "[ATTP] Animated APIs down. Using ultra-stable static fallback...",
  );
  try {
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodedText}&background=random&color=fff&size=512&font-size=0.4&length=4`;
    const fallbackUrl = `https://wsrv.nl/?url=${encodeURIComponent(avatarUrl)}&output=webp`;

    const response = await fetch(fallbackUrl);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch (e) {
    console.error("[ATTP] Even fallback failed:", e);
  }

  throw new Error("All connections failed. Check your network.");
}

// ─── Command ──────────────────────────────────────────────────────────────────

Module({
  command: "attp",
  aliases: ["textsticker"],
  package: "sticker",
  description: "Text to animated/static sticker",
})(async (message, match) => {
  const text = (match || "").trim();

  if (!text) {
    await message.react("❌");
    return message.send("*_⚠️ Need text!_*\n_Example: .attp HI_");
  }

  await message.react("⏳");

  const botName = config.BOT_NAME || "Bot";
  const senderName = message.raw?.pushName || "User";

  let tempPath;
  try {
    const buffer = await getAttpBuffer(text);

    tempPath = path.join(os.tmpdir(), `attp_${Date.now()}.webp`);
    fs.writeFileSync(tempPath, buffer);

    await addMetadata(tempPath, senderName, botName);

    const stickerBuffer = fs.readFileSync(tempPath);
    await message.conn.sendMessage(message.from, { sticker: stickerBuffer });
    await message.react("✅");

    fs.unlinkSync(tempPath);
  } catch (err) {
    console.error("ATTP Final Error:", err.message);
    await message.react("❌");
    await message.send("*_⚠️ Network error. Please try again!_*");
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});
