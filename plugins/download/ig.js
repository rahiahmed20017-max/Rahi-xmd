import axios from "axios";
import { Module } from "../../lib/plugins.js";

function extractUrl(text) {
  const match = (text || "").match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

Module({
  command: "insta",
  aliases: ["ig", "instagram", "reel"],
  package: "downloader",
  description: "Instagram Downloader",
})(async (message, match) => {
  let url = (match || "").trim();

  // Fallback: pull link from a quoted message
  if (!url) {
    const quoted =
      message.raw.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted) {
      const text =
        quoted.conversation ||
        quoted.extendedTextMessage?.text ||
        quoted.imageMessage?.caption ||
        quoted.videoMessage?.caption ||
        "";
      url = extractUrl(text);
    }
  } else {
    url = extractUrl(url) || url;
  }

  if (!url || !url.startsWith("http")) {
    return message.send("❌ *Example:* .insta <Instagram link>");
  }

  try {
    await message.react("⏳");

    const apiUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`;
    const res = await axios.get(apiUrl, { timeout: 30_000 });
    const data = res.data;

    if (!data || !data.status || !data.data || data.data.length === 0) {
      throw new Error("No data found");
    }

    for (const item of data.data) {
      const mediaUrl = item.url;
      if (!mediaUrl) continue;

      const type = item.type === "video" ? "video" : "image";

      const mediaResponse = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        timeout: 60_000,
      });
      const mediaBuffer = Buffer.from(mediaResponse.data);

      await message.conn.sendMessage(
        message.from,
        type === "video"
          ? { video: mediaBuffer, caption: "" }
          : { image: mediaBuffer, caption: "" },
        { quoted: message.raw },
      );
    }

    await message.react("🎦");
  } catch (err) {
    console.error("[INSTA]", err?.message || err);
    await message.send("❌ *Something error please try again later*");
    await message.react("❌");
  }
});
