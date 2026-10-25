import axios from "axios";
import { Module } from "../../lib/plugins.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function decodeHTMLEntities(text) {
  if (!text) return "Facebook Video";
  return text
    .replace(/&#([xX]?)([0-9a-fA-F]+);?/g, (_, isHex, num) =>
      String.fromCharCode(parseInt(num, isHex ? 16 : 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractFbUrl(text) {
  const match = (text || "").match(
    /https?:\/\/(?:www\.|m\.|mbasic\.)?(?:facebook\.com|fb\.watch)\/[^\s<>"']+/i,
  );
  return match ? match[0].replace(/[)\]}>.,!?]+$/g, "") : null;
}

// ─── Command ──────────────────────────────────────────────────────────────────

Module({
  command: "fb",
  aliases: ["facebook"],
  package: "downloader",
  description: "Download Facebook videos",
})(async (message, match) => {
  let url = (match || "").trim();

  // Fallback: pull link from a quoted message
  if (!url) {
    const quoted =
      message.raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const quotedText =
        quoted.conversation ||
        quoted.extendedTextMessage?.text ||
        quoted.imageMessage?.caption ||
        quoted.videoMessage?.caption ||
        "";
      url = extractFbUrl(quotedText);
    }
  } else {
    url = extractFbUrl(url) || url;
  }

  if (!url) {
    return message.send(
      `❌ *Missing Facebook URL*\n\n` +
        `➤ .fb <facebook link>\n\n` +
        `💡 You can also reply to a Facebook link with *.fb*`,
    );
  }

  try {
    await message.react("⏳");

    const apiUrl = `https://kiraxmd-api.vercel.app/api/fb?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, {
      timeout: 30_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
      },
    });

    const data = response.data;

    if (!data || !data.status || !data.result?.video) {
      throw new Error(
        data?.error || "Facebook API did not return a video URL.",
      );
    }

    const videoUrl = data.result.hd || data.result.video || data.result.sd;
    if (!videoUrl) throw new Error("No downloadable Facebook video URL found.");

    const title = decodeHTMLEntities(data.result.title);

    await message.react("📥");

    await message.conn.sendMessage(
      message.from,
      {
        video: { url: videoUrl },
        mimetype: "video/mp4",
        caption: title,
      },
      { quoted: message.raw },
    );

    await message.react("✅");
  } catch (err) {
    console.error("[FB]", err?.message || err);
    await message.react("❌");
    await message.send(
      `❌ *Facebook Download Failed!*\n\n⚠️ ${err?.message || "Unknown error"}`,
    );
  }
});
